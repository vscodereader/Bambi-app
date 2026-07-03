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

describe("registerEmployer", () => {
	it("creates employer profile, org(owner), and pending org profile", async () => {
		const userId = `user_reg_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "가입자",
			email: `${userId}@bambi.test`,
		});

		const registerEmployer = createProcedureClient(
			onboardingRouter.registerEmployer,
			{
				context: ctx(userId),
				path: ["bambi", "onboarding", "registerEmployer"],
			}
		);

		const { organizationId } = await registerEmployer({
			displayName: "밤비 업소",
			organizationName: "밤비 업소",
		});

		const [profile] = await db
			.select({ role: bambiProfile.role })
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, userId));
		expect(profile?.role).toBe("employer");

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
			.select({ status: employerOrganizationProfile.verificationStatus })
			.from(employerOrganizationProfile)
			.where(eq(employerOrganizationProfile.organizationId, organizationId));
		expect(orgProfile?.status).toBe("pending");

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("rejects when a profile already exists", async () => {
		const userId = `user_reg_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "중복",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "job_seeker", displayName: "이미" });

		const registerEmployer = createProcedureClient(
			onboardingRouter.registerEmployer,
			{
				context: ctx(userId),
				path: ["bambi", "onboarding", "registerEmployer"],
			}
		);

		await expect(
			registerEmployer({ displayName: "x", organizationName: "x" })
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, userId));
	});
});
