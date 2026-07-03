import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
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

const routingClient = (userId: string) =>
	createProcedureClient(onboardingRouter.getMyRouting, {
		context: ctx(userId),
		path: ["bambi", "onboarding", "getMyRouting"],
	});

describe("getMyRouting", () => {
	it("returns null role when no profile", async () => {
		const userId = `user_route_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "무프로필",
			email: `${userId}@bambi.test`,
		});
		const result = await routingClient(userId)();
		expect(result).toEqual({ role: null, employerApprovalStatus: "none" });
		await db.delete(user).where(eq(user.id, userId));
	});

	it("returns employer + pending when org profile pending", async () => {
		const userId = `user_route_${randomUUID()}`;
		const orgId = `org_route_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "업소",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(organization)
			.values({ id: orgId, name: "업소", slug: orgId, createdAt: new Date() });
		await db.insert(member).values({
			id: `member_${randomUUID()}`,
			organizationId: orgId,
			userId,
			role: "owner",
			createdAt: new Date(),
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "employer", displayName: "업소" });
		await db.insert(employerOrganizationProfile).values({
			organizationId: orgId,
			displayName: "업소",
			verificationStatus: "pending",
		});

		const result = await routingClient(userId)();
		expect(result).toEqual({
			role: "employer",
			employerApprovalStatus: "pending",
		});

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, orgId));
	});
});
