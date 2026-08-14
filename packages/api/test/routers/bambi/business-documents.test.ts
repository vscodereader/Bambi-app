import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import type { Context } from "@/context";

dotenv.config({
	path: "../../apps/server/.env",
});

vi.mock("@/services/gcs", () => ({
	createPrivateSignedReadUrl: vi.fn(
		async ({ storageKey }: { storageKey: string }) =>
			`https://private.bambi.test/${storageKey}`
	),
	createPrivateSignedUploadUrl: vi.fn(
		async ({ storageKey }: { storageKey: string }) =>
			`https://upload.bambi.test/${storageKey}`
	),
	createSignedUploadUrl: vi.fn(
		async ({ storageKey }: { storageKey: string }) =>
			`https://upload.bambi.test/${storageKey}`
	),
	deletePrivateObjects: vi.fn(async () => undefined),
	deletePublicObjects: vi.fn(async () => undefined),
	getPublicObjectUrl: (storageKey: string) =>
		`https://files.bambi.test/${storageKey}`,
	// 비프로덕션 취급 — 업로드 인텐트·조회 URL 모두 로컬 플레이스홀더로 떨어진다.
	isProductionStorageRuntime: () => false,
	isPublicBucketConfigured: () => true,
	shouldUsePrivateBucket: () => false,
}));

const [
	{ db },
	authSchema,
	bambiSchema,
	{ moderationRouter },
	{ onboardingRouter },
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/routers/bambi/moderation"),
	import("@/routers/bambi/onboarding"),
]);

const { member, organization, user } = authSchema;
const { bambiProfile, employerBusinessDocument, employerOrganizationProfile } =
	bambiSchema;

interface BusinessDocumentFixture {
	adminUserId: string;
	memberId: string;
	organizationId: string;
	ownerUserId: string;
}

const createContextForUser = (userId: string): Context =>
	({
		auth: null,
		session: { user: { id: userId } },
	}) as Context;

const createFixture = async (
	verificationStatus:
		| "none"
		| "pending"
		| "verified"
		| "rejected"
		| "changes_unsubmitted" = "rejected"
): Promise<BusinessDocumentFixture> => {
	const ownerUserId = `user_business_owner_${randomUUID()}`;
	const adminUserId = `user_business_admin_${randomUUID()}`;
	const organizationId = `org_business_${randomUUID()}`;
	const memberId = `member_business_${randomUUID()}`;

	await db.insert(user).values([
		{
			email: `${ownerUserId}@bambi.test`,
			id: ownerUserId,
			name: "Business owner",
		},
		{
			email: `${adminUserId}@bambi.test`,
			id: adminUserId,
			name: "Moderator",
		},
	]);
	await db.insert(organization).values({
		createdAt: new Date(),
		id: organizationId,
		name: "Business document test",
		slug: `business-document-${randomUUID()}`,
	});
	await db.insert(bambiProfile).values([
		{ role: "employer", userId: ownerUserId },
		{ role: "admin", userId: adminUserId },
	]);
	await db.insert(member).values({
		createdAt: new Date(),
		id: memberId,
		organizationId,
		role: "owner",
		userId: ownerUserId,
	});
	await db.insert(employerOrganizationProfile).values({
		displayName: "Business document test",
		organizationId,
		verificationStatus,
	});

	return { adminUserId, memberId, organizationId, ownerUserId };
};

const cleanupFixture = async (
	fixture: BusinessDocumentFixture
): Promise<void> => {
	await db
		.delete(employerBusinessDocument)
		.where(eq(employerBusinessDocument.organizationId, fixture.organizationId));
	await db
		.delete(member)
		.where(eq(member.organizationId, fixture.organizationId));
	await db
		.delete(employerOrganizationProfile)
		.where(
			eq(employerOrganizationProfile.organizationId, fixture.organizationId)
		);
	await db
		.delete(bambiProfile)
		.where(
			inArray(bambiProfile.userId, [fixture.ownerUserId, fixture.adminUserId])
		);
	await db
		.delete(user)
		.where(inArray(user.id, [fixture.ownerUserId, fixture.adminUserId]));
	await db
		.delete(organization)
		.where(eq(organization.id, fixture.organizationId));
};

const createOwnerClient = <TProcedure>(
	fixture: BusinessDocumentFixture,
	procedure: TProcedure,
	name: string
) =>
	createProcedureClient(procedure as never, {
		context: createContextForUser(fixture.ownerUserId),
		path: ["bambi", "onboarding", name],
	});

describe("bambi onboarding business documents", () => {
	it("creates an upload intent and exposes a confirmed document to owner and moderator", async () => {
		const fixture = await createFixture();
		try {
			const createUpload = createOwnerClient(
				fixture,
				onboardingRouter.createBusinessDocumentUpload,
				"createBusinessDocumentUpload"
			);
			const intent = await createUpload({
				byteSize: 1024,
				fileName: "registration.webp",
				mimeType: "image/webp",
				organizationId: fixture.organizationId,
			});
			expect(intent).toMatchObject({
				byteSize: 1024,
				category: "image",
				fileName: "registration.webp",
				mimeType: "image/webp",
			});
			expect(intent.storageKey).toContain(
				`employer/${fixture.organizationId}/${fixture.ownerUserId}/`
			);

			const addDocument = createOwnerClient(
				fixture,
				onboardingRouter.addBusinessDocument,
				"addBusinessDocument"
			);
			const document = await addDocument({
				byteSize: intent.byteSize,
				fileName: intent.fileName,
				mimeType: intent.mimeType,
				organizationId: fixture.organizationId,
				storageKey: intent.storageKey,
			});
			expect(document).toMatchObject({
				category: "image",
				fileName: "registration.webp",
				objectUrl: `/bambi/business-documents/${document.id}`,
			});

			const getMine = createOwnerClient(
				fixture,
				onboardingRouter.getMine,
				"getMine"
			);
			const mine = await getMine();
			const ownOrganization = mine.employerOrganizationProfiles.find(
				(profile: { organizationId: string }) =>
					profile.organizationId === fixture.organizationId
			);
			expect(ownOrganization?.businessDocuments).toEqual([
				expect.objectContaining({ id: document.id, category: "image" }),
			]);

			const listEmployers = createProcedureClient(
				moderationRouter.listEmployers,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "listEmployers"],
				}
			);
			const employers = await listEmployers({
				limit: 100,
				status: "rejected",
			});
			expect(
				employers.find(
					(employer) => employer.organizationId === fixture.organizationId
				)?.businessDocuments
			).toEqual([
				expect.objectContaining({ id: document.id, category: "image" }),
			]);
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("locks additions and deletion while pending", async () => {
		const fixture = await createFixture("pending");
		try {
			const addDocument = createOwnerClient(
				fixture,
				onboardingRouter.addBusinessDocument,
				"addBusinessDocument"
			);
			await expect(
				addDocument({
					byteSize: 2048,
					fileName: "pending.pdf",
					mimeType: "application/pdf",
					organizationId: fixture.organizationId,
					storageKey: `employer/${fixture.organizationId}/${fixture.ownerUserId}/${randomUUID()}-pending.pdf`,
				})
			).rejects.toMatchObject({ code: "CONFLICT" });

			const [document] = await db
				.insert(employerBusinessDocument)
				.values({
					byteSize: 2048,
					category: "pdf",
					createdByUserId: fixture.ownerUserId,
					fileName: "pending.pdf",
					mimeType: "application/pdf",
					organizationId: fixture.organizationId,
					storageKey: `employer/${fixture.organizationId}/${fixture.ownerUserId}/${randomUUID()}-pending.pdf`,
				})
				.returning();
			if (!document) {
				throw new Error("Expected pending document fixture to be created.");
			}

			const deleteDocument = createOwnerClient(
				fixture,
				onboardingRouter.deleteBusinessDocument,
				"deleteBusinessDocument"
			);
			await expect(
				deleteDocument({ documentId: document.id })
			).rejects.toMatchObject({ code: "CONFLICT" });
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("moves a verified organization to changes_unsubmitted after document changes", async () => {
		const fixture = await createFixture("verified");
		try {
			const addDocument = createOwnerClient(
				fixture,
				onboardingRouter.addBusinessDocument,
				"addBusinessDocument"
			);
			const document = await addDocument({
				byteSize: 1024,
				fileName: "approved.png",
				mimeType: "image/png",
				organizationId: fixture.organizationId,
				storageKey: `employer/${fixture.organizationId}/${fixture.ownerUserId}/${randomUUID()}-approved.png`,
			});

			const [profile] = await db
				.select({ status: employerOrganizationProfile.verificationStatus })
				.from(employerOrganizationProfile)
				.where(
					eq(employerOrganizationProfile.organizationId, fixture.organizationId)
				);
			expect(profile?.status).toBe("changes_unsubmitted");

			await db
				.update(employerOrganizationProfile)
				.set({ verificationStatus: "verified" })
				.where(
					eq(employerOrganizationProfile.organizationId, fixture.organizationId)
				);
			const deleteDocument = createOwnerClient(
				fixture,
				onboardingRouter.deleteBusinessDocument,
				"deleteBusinessDocument"
			);
			await deleteDocument({ documentId: document.id });
			const [deletedDocument] = await db
				.select({ id: employerBusinessDocument.id })
				.from(employerBusinessDocument)
				.where(eq(employerBusinessDocument.id, document.id));
			expect(deletedDocument).toBeUndefined();
			const [profileAfterDelete] = await db
				.select({ status: employerOrganizationProfile.verificationStatus })
				.from(employerOrganizationProfile)
				.where(
					eq(employerOrganizationProfile.organizationId, fixture.organizationId)
				);
			expect(profileAfterDelete?.status).toBe("changes_unsubmitted");
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("rejects unsupported files, foreign keys, and a sixth document", async () => {
		const fixture = await createFixture();
		try {
			const createUpload = createOwnerClient(
				fixture,
				onboardingRouter.createBusinessDocumentUpload,
				"createBusinessDocumentUpload"
			);
			await expect(
				createUpload({
					byteSize: 10,
					fileName: "malware.exe",
					mimeType: "application/octet-stream",
					organizationId: fixture.organizationId,
				})
			).rejects.toMatchObject({ code: "BAD_REQUEST" });

			const addDocument = createOwnerClient(
				fixture,
				onboardingRouter.addBusinessDocument,
				"addBusinessDocument"
			);
			await expect(
				addDocument({
					byteSize: 10,
					fileName: "foreign.pdf",
					mimeType: "application/pdf",
					organizationId: fixture.organizationId,
					storageKey: `employer/foreign/${fixture.ownerUserId}/foreign.pdf`,
				})
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			await db.insert(employerBusinessDocument).values(
				Array.from({ length: 5 }, (_, index) => ({
					byteSize: 100,
					category: "image" as const,
					createdByUserId: fixture.ownerUserId,
					fileName: `${index}.png`,
					mimeType: "image/png",
					organizationId: fixture.organizationId,
					storageKey: `employer/${fixture.organizationId}/${fixture.ownerUserId}/${randomUUID()}-${index}.png`,
				}))
			);
			await expect(
				addDocument({
					byteSize: 100,
					fileName: "sixth.png",
					mimeType: "image/png",
					organizationId: fixture.organizationId,
					storageKey: `employer/${fixture.organizationId}/${fixture.ownerUserId}/${randomUUID()}-sixth.png`,
				})
			).rejects.toMatchObject({ code: "CONFLICT" });
		} finally {
			await cleanupFixture(fixture);
		}
	});
});

describe("bambi onboarding createBusinessDocumentViewUrl", () => {
	it("serves the uploader and moderators, rejects other members and missing documents", async () => {
		const fixture = await createFixture();
		const otherMemberUserId = `user_business_other_${randomUUID()}`;
		try {
			await db.insert(user).values({
				email: `${otherMemberUserId}@bambi.test`,
				id: otherMemberUserId,
				name: "Other member",
			});
			await db
				.insert(bambiProfile)
				.values({ role: "employer", userId: otherMemberUserId });
			await db.insert(member).values({
				createdAt: new Date(),
				id: `member_business_other_${randomUUID()}`,
				organizationId: fixture.organizationId,
				role: "admin",
				userId: otherMemberUserId,
			});

			const [document] = await db
				.insert(employerBusinessDocument)
				.values({
					byteSize: 1024,
					category: "pdf",
					createdByUserId: fixture.ownerUserId,
					fileName: "view.pdf",
					mimeType: "application/pdf",
					organizationId: fixture.organizationId,
					storageKey: `employer/${fixture.organizationId}/${fixture.ownerUserId}/${randomUUID()}-view.pdf`,
				})
				.returning();
			if (!document) {
				throw new Error("Expected view document fixture to be created.");
			}

			const viewAsOwner = createOwnerClient(
				fixture,
				onboardingRouter.createBusinessDocumentViewUrl,
				"createBusinessDocumentViewUrl"
			);
			const owned = await viewAsOwner({ documentId: document.id });
			// 비프로덕션(모킹된 shouldUsePrivateBucket=false)이라 로컬 플레이스홀더 URL.
			expect(owned.url.startsWith("/bambi/local-chat-attachments?")).toBe(true);

			// 같은 조직의 다른 멤버(운영자 아님)는 올린 본인이 아니므로 거절된다.
			const viewAsOtherMember = createProcedureClient(
				onboardingRouter.createBusinessDocumentViewUrl,
				{
					context: createContextForUser(otherMemberUserId),
					path: ["bambi", "onboarding", "createBusinessDocumentViewUrl"],
				}
			);
			await expect(
				viewAsOtherMember({ documentId: document.id })
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			const viewAsModerator = createProcedureClient(
				onboardingRouter.createBusinessDocumentViewUrl,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "onboarding", "createBusinessDocumentViewUrl"],
				}
			);
			const moderated = await viewAsModerator({ documentId: document.id });
			expect(moderated.url.startsWith("/bambi/local-chat-attachments?")).toBe(
				true
			);

			await expect(
				viewAsOwner({ documentId: randomUUID() })
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		} finally {
			await cleanupFixture(fixture);
			await db
				.delete(bambiProfile)
				.where(eq(bambiProfile.userId, otherMemberUserId));
			await db.delete(user).where(eq(user.id, otherMemberUserId));
		}
	});
});

describe("bambi moderation deleteBusinessDocument", () => {
	it("lets moderators delete a document without touching verification status", async () => {
		const fixture = await createFixture("pending");
		try {
			const [document] = await db
				.insert(employerBusinessDocument)
				.values({
					byteSize: 2048,
					category: "pdf",
					createdByUserId: fixture.ownerUserId,
					fileName: "moderated.pdf",
					mimeType: "application/pdf",
					organizationId: fixture.organizationId,
					storageKey: `employer/${fixture.organizationId}/${fixture.ownerUserId}/${randomUUID()}-moderated.pdf`,
				})
				.returning();
			if (!document) {
				throw new Error("Expected moderated document fixture to be created.");
			}

			// 운영자가 아니면 adminProcedure 게이트에서 거절된다.
			const deleteAsOwner = createProcedureClient(
				moderationRouter.deleteBusinessDocument,
				{
					context: createContextForUser(fixture.ownerUserId),
					path: ["bambi", "moderation", "deleteBusinessDocument"],
				}
			);
			await expect(
				deleteAsOwner({ documentId: document.id })
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			const deleteAsModerator = createProcedureClient(
				moderationRouter.deleteBusinessDocument,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "moderation", "deleteBusinessDocument"],
				}
			);
			await expect(
				deleteAsModerator({ documentId: document.id })
			).resolves.toEqual({ id: document.id });

			const [remaining] = await db
				.select({ id: employerBusinessDocument.id })
				.from(employerBusinessDocument)
				.where(eq(employerBusinessDocument.id, document.id));
			expect(remaining).toBeUndefined();

			// 본인 삭제와 달리 verificationStatus 전이는 없다.
			const [profile] = await db
				.select({ status: employerOrganizationProfile.verificationStatus })
				.from(employerOrganizationProfile)
				.where(
					eq(employerOrganizationProfile.organizationId, fixture.organizationId)
				);
			expect(profile?.status).toBe("pending");

			await expect(
				deleteAsModerator({ documentId: randomUUID() })
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		} finally {
			await cleanupFixture(fixture);
		}
	});
});
