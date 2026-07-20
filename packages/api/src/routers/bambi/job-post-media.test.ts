import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { jobsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./jobs"),
]);

const { member, organization, user } = authSchema;
const { bambiProfile, employerOrganizationProfile, jobPost, jobPostMedia } =
	bambiSchema;

interface JobPostMediaFixture {
	organizationId: string;
	otherOrganizationId: string;
	otherOwnerUserId: string;
	ownerUserId: string;
	staffUserId: string;
	userIds: string[];
}

const createContextForUser = (userId: string): Context =>
	({
		auth: null,
		session: {
			user: {
				id: userId,
			},
		},
	}) as Context;

const createPublicContext = (): Context =>
	({
		auth: null,
		session: null,
	}) as Context;

const makeEmail = (prefix: string): string =>
	`${prefix}-${randomUUID()}@bambi.test`;

const createJobPostMediaFixture = async (): Promise<JobPostMediaFixture> => {
	const now = new Date();
	const organizationId = `org_test_${randomUUID()}`;
	const otherOrganizationId = `org_test_${randomUUID()}`;
	const ownerUserId = `user_test_owner_${randomUUID()}`;
	const staffUserId = `user_test_staff_${randomUUID()}`;
	const otherOwnerUserId = `user_test_other_owner_${randomUUID()}`;
	const userRows = [
		{ email: makeEmail("owner"), id: ownerUserId, name: "채용 소유자" },
		{ email: makeEmail("staff"), id: staffUserId, name: "채용 스태프" },
		{
			email: makeEmail("other-owner"),
			id: otherOwnerUserId,
			name: "다른 조직 소유자",
		},
	];

	await db.insert(user).values(userRows);
	await db.insert(organization).values([
		{
			createdAt: now,
			id: organizationId,
			name: "공고 미디어 테스트 조직",
			slug: `job-media-${randomUUID()}`,
		},
		{
			createdAt: now,
			id: otherOrganizationId,
			name: "다른 공고 미디어 테스트 조직",
			slug: `other-job-media-${randomUUID()}`,
		},
	]);
	await db.insert(bambiProfile).values(
		userRows.map((row) => ({
			displayName: row.name,
			isPhoneVerified: true,
			role: "employer" as const,
			status: "active" as const,
			userId: row.id,
		}))
	);
	await db.insert(member).values([
		{
			createdAt: now,
			id: `member_test_owner_${randomUUID()}`,
			organizationId,
			role: "owner",
			userId: ownerUserId,
		},
		{
			createdAt: now,
			id: `member_test_staff_${randomUUID()}`,
			organizationId,
			role: "staff",
			userId: staffUserId,
		},
		{
			createdAt: now,
			id: `member_test_other_owner_${randomUUID()}`,
			organizationId: otherOrganizationId,
			role: "owner",
			userId: otherOwnerUserId,
		},
	]);
	await db.insert(employerOrganizationProfile).values([
		{
			displayName: "공고 미디어 테스트 업체",
			organizationId,
			verificationStatus: "none",
		},
		{
			displayName: "다른 공고 미디어 테스트 업체",
			organizationId: otherOrganizationId,
			verificationStatus: "verified",
		},
	]);

	return {
		organizationId,
		otherOrganizationId,
		otherOwnerUserId,
		ownerUserId,
		staffUserId,
		userIds: [ownerUserId, staffUserId, otherOwnerUserId],
	};
};

const cleanupJobPostMediaFixture = async (
	fixture: JobPostMediaFixture
): Promise<void> => {
	await db
		.delete(jobPostMedia)
		.where(
			inArray(jobPostMedia.organizationId, [
				fixture.organizationId,
				fixture.otherOrganizationId,
			])
		);
	await db
		.delete(jobPost)
		.where(
			inArray(jobPost.organizationId, [
				fixture.organizationId,
				fixture.otherOrganizationId,
			])
		);
	await db
		.delete(employerOrganizationProfile)
		.where(
			inArray(employerOrganizationProfile.organizationId, [
				fixture.organizationId,
				fixture.otherOrganizationId,
			])
		);
	await db
		.delete(member)
		.where(
			inArray(member.organizationId, [
				fixture.organizationId,
				fixture.otherOrganizationId,
			])
		);
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
	await db
		.delete(organization)
		.where(
			inArray(organization.id, [
				fixture.organizationId,
				fixture.otherOrganizationId,
			])
		);
};

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

const createJobInput = (organizationId: string) => ({
	description: "블록 상세 설명으로 대체될 기본 설명입니다.",
	descriptionBlocks: [
		{ id: "heading", text: "주요 업무", type: "heading" as const },
		{
			id: "paragraph",
			text: "고객 응대와 예약 관리를 담당합니다.",
			type: "paragraph" as const,
		},
	],
	industryCategory: "라운지",
	interviewNotes: "신분증 확인 후 면접합니다.",
	organizationId,
	payAmount: 180_000,
	payUnit: "일급",
	region: "서울 강남구",
	title: "이미지 포함 테스트 공고",
	workSchedule: "20:00-02:00",
});

describe("bambi jobs router media and block content", () => {
	it("creates a job with one cover image and up to five detail images", async () => {
		const fixture = await createJobPostMediaFixture();

		try {
			await db
				.update(employerOrganizationProfile)
				.set({ verificationStatus: "verified" })
				.where(
					eq(employerOrganizationProfile.organizationId, fixture.organizationId)
				);

			const createMediaUpload = createProcedureClient(
				jobsRouter.createMediaUpload,
				{
					context: createContextForUser(fixture.ownerUserId),
					path: ["bambi", "jobs", "createMediaUpload"],
				}
			);
			const createJob = createProcedureClient(jobsRouter.create, {
				context: createContextForUser(fixture.ownerUserId),
				path: ["bambi", "jobs", "create"],
			});
			const cover = await createMediaUpload({
				byteSize: 256_000,
				fileName: "cover.jpg",
				mimeType: "image/jpeg",
				organizationId: fixture.organizationId,
			});
			const detail = await Promise.all(
				Array.from({ length: 5 }, async (_, index) =>
					createMediaUpload({
						byteSize: 128_000 + index,
						fileName: `detail-${index}.webp`,
						mimeType: "image/webp",
						organizationId: fixture.organizationId,
					})
				)
			);

			const created = await createJob({
				...createJobInput(fixture.organizationId),
				media: {
					cover: { ...cover, altText: "대표 업무 공간" },
					detail: detail.map((item, index) => ({
						...item,
						altText: `상세 이미지 ${index + 1}`,
					})),
				},
			});
			const savedMedia = await db
				.select()
				.from(jobPostMedia)
				.where(eq(jobPostMedia.jobPostId, created.id));

			expect(created.description).toBe(
				"주요 업무\n\n고객 응대와 예약 관리를 담당합니다."
			);
			expect(created.descriptionBlocks).toEqual(
				createJobInput(fixture.organizationId).descriptionBlocks
			);
			expect(savedMedia).toHaveLength(6);
			expect(savedMedia).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						altText: "대표 업무 공간",
						fileName: "cover.jpg",
						usage: "cover",
					}),
					expect.objectContaining({
						altText: "상세 이미지 5",
						fileName: "detail-4.webp",
						position: 4,
						usage: "detail",
					}),
				])
			);
		} finally {
			await cleanupJobPostMediaFixture(fixture);
		}
	});

	it("rejects unsupported MIME types before upload intent creation", async () => {
		const fixture = await createJobPostMediaFixture();

		try {
			const createMediaUpload = createProcedureClient(
				jobsRouter.createMediaUpload,
				{
					context: createContextForUser(fixture.ownerUserId),
					path: ["bambi", "jobs", "createMediaUpload"],
				}
			);

			await expectOrpcCode(
				createMediaUpload({
					byteSize: 128_000,
					fileName: "guide.pdf",
					mimeType: "application/pdf",
					organizationId: fixture.organizationId,
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupJobPostMediaFixture(fixture);
		}
	});

	it("returns description blocks and media in public job detail", async () => {
		const fixture = await createJobPostMediaFixture();

		try {
			await db
				.update(employerOrganizationProfile)
				.set({ verificationStatus: "verified" })
				.where(
					eq(employerOrganizationProfile.organizationId, fixture.organizationId)
				);

			const createJob = createProcedureClient(jobsRouter.create, {
				context: createContextForUser(fixture.ownerUserId),
				path: ["bambi", "jobs", "create"],
			});
			const getJob = createProcedureClient(jobsRouter.getById, {
				context: createPublicContext(),
				path: ["bambi", "jobs", "getById"],
			});
			const created = await createJob({
				...createJobInput(fixture.organizationId),
				media: {
					cover: {
						altText: "대표 업무 공간",
						byteSize: 128_000,
						fileName: "cover.jpg",
						mimeType: "image/jpeg",
						storageKey: `bambi-job-post-media/${fixture.organizationId}/${fixture.ownerUserId}/cover.jpg`,
					},
				},
			});
			// 공개 상세는 published + paid를 함께 요구한다(jobs.ts의 결제 게이트).
			// create는 결제 전 상태로 공고를 만들므로 조회 전에 결제 완료로 맞춰 준다.
			await db
				.update(jobPost)
				.set({ paymentStatus: "paid" })
				.where(eq(jobPost.id, created.id));

			const publicDetail = await getJob({ id: created.id });

			expect(publicDetail.descriptionBlocks).toEqual(
				createJobInput(fixture.organizationId).descriptionBlocks
			);
			expect(publicDetail.media.cover).toEqual(
				expect.objectContaining({
					altText: "대표 업무 공간",
					fileName: "cover.jpg",
					usage: "cover",
				})
			);
		} finally {
			await cleanupJobPostMediaFixture(fixture);
		}
	});

	it("rejects six detail images", async () => {
		const fixture = await createJobPostMediaFixture();

		try {
			const createJob = createProcedureClient(jobsRouter.create, {
				context: createContextForUser(fixture.ownerUserId),
				path: ["bambi", "jobs", "create"],
			});

			await expectOrpcCode(
				createJob({
					...createJobInput(fixture.organizationId),
					media: {
						detail: Array.from({ length: 6 }, (_, index) => ({
							altText: `상세 이미지 ${index + 1}`,
							byteSize: 128_000,
							fileName: `detail-${index}.jpg`,
							mimeType: "image/jpeg",
							storageKey: `bambi-job-post-media/${fixture.organizationId}/${fixture.ownerUserId}/${index}.jpg`,
						})),
					},
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupJobPostMediaFixture(fixture);
		}
	});

	it("prevents staff from creating upload intents for another organization", async () => {
		const fixture = await createJobPostMediaFixture();

		try {
			const createMediaUpload = createProcedureClient(
				jobsRouter.createMediaUpload,
				{
					context: createContextForUser(fixture.staffUserId),
					path: ["bambi", "jobs", "createMediaUpload"],
				}
			);

			await expectOrpcCode(
				createMediaUpload({
					byteSize: 128_000,
					fileName: "other-org.jpg",
					mimeType: "image/jpeg",
					organizationId: fixture.otherOrganizationId,
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupJobPostMediaFixture(fixture);
		}
	});

	it("rejects saving a job with another organization's storage key", async () => {
		const fixture = await createJobPostMediaFixture();

		try {
			await db
				.update(employerOrganizationProfile)
				.set({ verificationStatus: "verified" })
				.where(
					eq(employerOrganizationProfile.organizationId, fixture.organizationId)
				);

			const createJob = createProcedureClient(jobsRouter.create, {
				context: createContextForUser(fixture.ownerUserId),
				path: ["bambi", "jobs", "create"],
			});

			// storageKey는 공개 응답에 실려 나가므로 남의 조직 키를 알아낼 수 있다. 그 키를
			// 자기 공고에 붙이면 공고 삭제·교체 시 남의 객체가 GCS에서 지워진다.
			await expectOrpcCode(
				createJob({
					...createJobInput(fixture.organizationId),
					media: {
						cover: {
							altText: "탈취한 대표 이미지",
							byteSize: 128_000,
							fileName: "victim-cover.jpg",
							mimeType: "image/jpeg",
							storageKey: `bambi-job-post-media/${fixture.otherOrganizationId}/${fixture.otherOwnerUserId}/victim-cover.jpg`,
						},
					},
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupJobPostMediaFixture(fixture);
		}
	});

	it("rejects updating a job with a storage key outside the job post media prefix", async () => {
		const fixture = await createJobPostMediaFixture();
		const jobPostId = randomUUID();

		try {
			await db.insert(jobPost).values({
				createdByUserId: fixture.ownerUserId,
				description: "기존 공개 설명입니다.",
				id: jobPostId,
				industryCategory: "라운지",
				organizationId: fixture.organizationId,
				payAmount: 180_000,
				payUnit: "일급",
				region: "서울 강남구",
				status: "draft",
				title: "기존 공고",
				workSchedule: "20:00-02:00",
			});

			const updateJob = createProcedureClient(jobsRouter.update, {
				context: createContextForUser(fixture.ownerUserId),
				path: ["bambi", "jobs", "update"],
			});

			// 공고 미디어 prefix 밖(예: 채팅 첨부)의 키도 지정할 수 없어야 한다.
			await expectOrpcCode(
				updateJob({
					data: {
						...createJobInput(fixture.organizationId),
						media: {
							cover: {
								altText: "남의 채팅 첨부",
								byteSize: 128_000,
								fileName: "attachment.jpg",
								mimeType: "image/jpeg",
								storageKey: `bambi-chat/${randomUUID()}/${fixture.otherOwnerUserId}/attachment.jpg`,
							},
						},
					},
					id: jobPostId,
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupJobPostMediaFixture(fixture);
		}
	});

	it("returns published unverified jobs to review when blocks or media change", async () => {
		const fixture = await createJobPostMediaFixture();
		const jobPostId = randomUUID();

		try {
			await db.insert(jobPost).values({
				createdByUserId: fixture.ownerUserId,
				description: "기존 공개 설명입니다.",
				id: jobPostId,
				industryCategory: "라운지",
				organizationId: fixture.organizationId,
				payAmount: 180_000,
				payUnit: "일급",
				publishedAt: new Date(),
				region: "서울 강남구",
				status: "published",
				title: "기존 공개 공고",
				workSchedule: "20:00-02:00",
			});

			const updateJob = createProcedureClient(jobsRouter.update, {
				context: createContextForUser(fixture.ownerUserId),
				path: ["bambi", "jobs", "update"],
			});
			const updated = await updateJob({
				data: {
					...createJobInput(fixture.organizationId),
					media: {
						cover: {
							altText: "변경된 대표 이미지",
							byteSize: 128_000,
							fileName: "changed-cover.jpg",
							mimeType: "image/jpeg",
							storageKey: `bambi-job-post-media/${fixture.organizationId}/${fixture.ownerUserId}/changed-cover.jpg`,
						},
					},
				},
				id: jobPostId,
			});
			const savedMedia = await db
				.select()
				.from(jobPostMedia)
				.where(eq(jobPostMedia.jobPostId, jobPostId));

			expect(updated.status).toBe("pending_review");
			expect(updated.descriptionBlocks).toEqual(
				createJobInput(fixture.organizationId).descriptionBlocks
			);
			expect(savedMedia).toEqual([
				expect.objectContaining({
					fileName: "changed-cover.jpg",
					usage: "cover",
				}),
			]);
		} finally {
			await cleanupJobPostMediaFixture(fixture);
		}
	});
});
