import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { onboardingRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./onboarding"),
	]);

const { user, organization, member } = authSchema;
const { bambiProfile, employerOrganizationProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const callSubmit = (userId: string) =>
	createProcedureClient(onboardingRouter.submitEmployerBusinessInfo, {
		context: ctx(userId),
		path: ["bambi", "onboarding", "submitEmployerBusinessInfo"],
	});

describe("submitEmployerBusinessInfo", () => {
	it("creates org(owner) and pending org profile when the employer has none", async () => {
		const userId = `user_sub_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "가입자",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "employer", displayName: "가입자" });

		const submit = callSubmit(userId);
		const { organizationId, verificationStatus } = await submit({
			displayName: "밤비 업소",
			businessRegistrationNumber: "123-45-67890",
		});

		expect(verificationStatus).toBe("pending");

		const [membership] = await db
			.select({ role: member.role })
			.from(member)
			.where(
				and(
					eq(member.userId, userId),
					eq(member.organizationId, organizationId)
				)
			);
		expect(membership?.role).toBe("owner");

		const [orgProfile] = await db
			.select({
				status: employerOrganizationProfile.verificationStatus,
				brn: employerOrganizationProfile.businessRegistrationNumber,
				displayName: employerOrganizationProfile.displayName,
			})
			.from(employerOrganizationProfile)
			.where(eq(employerOrganizationProfile.organizationId, organizationId));
		expect(orgProfile?.status).toBe("pending");
		expect(orgProfile?.brn).toBe("123-45-67890");
		expect(orgProfile?.displayName).toBe("밤비 업소");

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("updates existing owned org profile and resets status to pending", async () => {
		const userId = `user_sub_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "재제출",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "employer", displayName: "재제출" });

		const submit = callSubmit(userId);
		const first = await submit({
			displayName: "구업체명",
			businessRegistrationNumber: "111-11-11111",
		});
		// 운영자 반려를 흉내: 상태를 rejected로 바꿔둔다.
		await db
			.update(employerOrganizationProfile)
			.set({ verificationStatus: "rejected" })
			.where(
				eq(employerOrganizationProfile.organizationId, first.organizationId)
			);

		const second = await submit({
			displayName: "새업체명",
			businessRegistrationNumber: "222-22-22222",
		});

		expect(second.organizationId).toBe(first.organizationId);
		expect(second.verificationStatus).toBe("pending");

		const [orgProfile] = await db
			.select({
				status: employerOrganizationProfile.verificationStatus,
				brn: employerOrganizationProfile.businessRegistrationNumber,
				displayName: employerOrganizationProfile.displayName,
			})
			.from(employerOrganizationProfile)
			.where(
				eq(employerOrganizationProfile.organizationId, first.organizationId)
			);
		expect(orgProfile?.status).toBe("pending");
		expect(orgProfile?.brn).toBe("222-22-22222");
		expect(orgProfile?.displayName).toBe("새업체명");

		await db.delete(user).where(eq(user.id, userId));
		await db
			.delete(organization)
			.where(eq(organization.id, first.organizationId));
	});

	it("keeps verified status when resubmitting unchanged business info", async () => {
		const userId = `user_sub_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "인증완료",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "employer", displayName: "인증완료" });

		const submit = callSubmit(userId);
		const first = await submit({
			displayName: "인증업체",
			businessRegistrationNumber: "333-33-33333",
		});
		// 운영자 승인을 흉내: 상태를 verified로 바꿔둔다.
		await db
			.update(employerOrganizationProfile)
			.set({ verificationStatus: "verified" })
			.where(
				eq(employerOrganizationProfile.organizationId, first.organizationId)
			);

		// 아무것도 바꾸지 않고 그대로 재제출한다.
		const second = await submit({
			displayName: "인증업체",
			businessRegistrationNumber: "333-33-33333",
		});

		expect(second.organizationId).toBe(first.organizationId);
		expect(second.verificationStatus).toBe("verified");

		const [orgProfile] = await db
			.select({
				status: employerOrganizationProfile.verificationStatus,
			})
			.from(employerOrganizationProfile)
			.where(
				eq(employerOrganizationProfile.organizationId, first.organizationId)
			);
		expect(orgProfile?.status).toBe("verified");

		await db.delete(user).where(eq(user.id, userId));
		await db
			.delete(organization)
			.where(eq(organization.id, first.organizationId));
	});

	it("resets verified status to pending when business info changes", async () => {
		const userId = `user_sub_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "정보변경",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "employer", displayName: "정보변경" });

		const submit = callSubmit(userId);
		const first = await submit({
			displayName: "인증업체",
			businessRegistrationNumber: "444-44-44444",
		});
		await db
			.update(employerOrganizationProfile)
			.set({ verificationStatus: "verified" })
			.where(
				eq(employerOrganizationProfile.organizationId, first.organizationId)
			);

		// 사업자등록번호를 바꿔서 재제출하면 재심사(pending)로 돌아가야 한다.
		const second = await submit({
			displayName: "인증업체",
			businessRegistrationNumber: "555-55-55555",
		});

		expect(second.organizationId).toBe(first.organizationId);
		expect(second.verificationStatus).toBe("pending");

		const [orgProfile] = await db
			.select({
				status: employerOrganizationProfile.verificationStatus,
				brn: employerOrganizationProfile.businessRegistrationNumber,
			})
			.from(employerOrganizationProfile)
			.where(
				eq(employerOrganizationProfile.organizationId, first.organizationId)
			);
		expect(orgProfile?.status).toBe("pending");
		expect(orgProfile?.brn).toBe("555-55-55555");

		await db.delete(user).where(eq(user.id, userId));
		await db
			.delete(organization)
			.where(eq(organization.id, first.organizationId));
	});

	it("rejects invalid business registration number format", async () => {
		const userId = `user_sub_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "형식오류",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "employer", displayName: "형식오류" });

		const submit = callSubmit(userId);
		await expect(
			submit({ displayName: "x", businessRegistrationNumber: "1234567890" })
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, userId));
	});

	it("rejects when the caller has no employer bambi profile", async () => {
		const userId = `user_sub_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "무프로필",
			email: `${userId}@bambi.test`,
		});

		const submit = callSubmit(userId);
		await expect(
			submit({ displayName: "x", businessRegistrationNumber: "123-45-67890" })
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, userId));
	});
});
