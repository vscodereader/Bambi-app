import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { siteSettingsRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./site-settings"),
	]);

const { user } = authSchema;
const { bambiProfile, bambiSiteSettings } = bambiSchema;

const createContextForUser = (userId: null | string): Context =>
	({
		auth: null,
		session: userId ? { user: { id: userId } } : null,
	}) as Context;

const expectOrpcCode = async (promise: Promise<unknown>, code: string) => {
	await expect(promise).rejects.toMatchObject({ code });
};

interface Fixture {
	adminUserId: string;
	employerUserId: string;
	userIds: string[];
}

const createFixture = async (): Promise<Fixture> => {
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;

	await db.insert(user).values([
		{
			id: adminUserId,
			name: "운영자",
			email: `admin-${randomUUID()}@bambi.test`,
		},
		{
			id: employerUserId,
			name: "구인자",
			email: `emp-${randomUUID()}@bambi.test`,
		},
	]);
	await db.insert(bambiProfile).values([
		{
			displayName: "운영자",
			isPhoneVerified: true,
			role: "admin",
			status: "active",
			userId: adminUserId,
		},
		{
			displayName: "구인자",
			isPhoneVerified: true,
			role: "employer",
			status: "active",
			userId: employerUserId,
		},
	]);

	return {
		adminUserId,
		employerUserId,
		userIds: [adminUserId, employerUserId],
	};
};

const cleanupFixture = async (fixture: Fixture) => {
	// 단일 행 설정 테이블은 테스트가 공유하므로 남긴 행을 지운다.
	await db.delete(bambiSiteSettings).where(eq(bambiSiteSettings.id, "default"));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
};

describe("siteSettings footer", () => {
	it("getFooter는 미설정 시 null, 운영자 저장 후 값을 반환한다", async () => {
		const fixture = await createFixture();
		try {
			await db
				.delete(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, "default"));

			const getFooter = createProcedureClient(siteSettingsRouter.getFooter, {
				context: createContextForUser(null),
				path: ["bambi", "siteSettings", "getFooter"],
			});
			expect(await getFooter({})).toBeNull();

			const update = createProcedureClient(siteSettingsRouter.updateFooter, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "siteSettings", "updateFooter"],
			});
			const saved = await update({
				operator: "밤비 주식회사",
				ceo: "홍길동",
				bizRegNo: "123-45-67890",
				address: "서울시 강남구",
				email: "help@bambialba.com",
				footerIntro: "안전한 구인구직 플랫폼",
			});
			expect(saved?.operator).toBe("밤비 주식회사");

			const afterInsert = await getFooter({});
			expect(afterInsert?.ceo).toBe("홍길동");
			expect(afterInsert?.email).toBe("help@bambialba.com");

			// 재저장(upsert)도 같은 단일 행을 갱신한다.
			await update({ operator: "밤비 2호점" });
			const afterUpdate = await getFooter({});
			expect(afterUpdate?.operator).toBe("밤비 2호점");
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("빈 문자열은 null로 저장해 폴백이 뜨도록 한다", async () => {
		const fixture = await createFixture();
		try {
			const update = createProcedureClient(siteSettingsRouter.updateFooter, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "siteSettings", "updateFooter"],
			});
			await update({ operator: "   ", ceo: "김대표" });
			const [row] = await db
				.select({
					operator: bambiSiteSettings.operator,
					ceo: bambiSiteSettings.ceo,
				})
				.from(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, "default"));
			expect(row?.operator).toBeNull();
			expect(row?.ceo).toBe("김대표");
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("잘못된 이메일 형식은 거부한다", async () => {
		const fixture = await createFixture();
		try {
			const update = createProcedureClient(siteSettingsRouter.updateFooter, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "siteSettings", "updateFooter"],
			});
			await expect(update({ email: "not-an-email" })).rejects.toBeTruthy();
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("updateFooter는 운영자가 아니면 FORBIDDEN, 비로그인은 UNAUTHORIZED", async () => {
		const fixture = await createFixture();
		try {
			const asEmployer = createProcedureClient(
				siteSettingsRouter.updateFooter,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "siteSettings", "updateFooter"],
				}
			);
			await expectOrpcCode(asEmployer({ operator: "몰래 수정" }), "FORBIDDEN");

			const asGuest = createProcedureClient(siteSettingsRouter.updateFooter, {
				context: createContextForUser(null),
				path: ["bambi", "siteSettings", "updateFooter"],
			});
			await expectOrpcCode(asGuest({ operator: "몰래 수정" }), "UNAUTHORIZED");
		} finally {
			await cleanupFixture(fixture);
		}
	});
});
