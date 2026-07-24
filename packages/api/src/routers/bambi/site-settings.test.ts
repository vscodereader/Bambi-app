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
			isPhoneVerified: true,
			role: "admin",
			status: "active",
			userId: adminUserId,
		},
		{
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

describe("siteSettings privacy contacts", () => {
	it("getPrivacyContacts는 미설정 시 null, 운영자 저장 후 값을 반환한다", async () => {
		const fixture = await createFixture();
		try {
			await db
				.delete(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, "default"));

			const getPrivacyContacts = createProcedureClient(
				siteSettingsRouter.getPrivacyContacts,
				{
					context: createContextForUser(null),
					path: ["bambi", "siteSettings", "getPrivacyContacts"],
				}
			);
			expect(await getPrivacyContacts({})).toBeNull();

			const update = createProcedureClient(
				siteSettingsRouter.updatePrivacyContacts,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "siteSettings", "updatePrivacyContacts"],
				}
			);
			const saved = await update({
				privacyContactEmail: "privacy@bambialba.com",
				privacyContactPhone: "02-000-0000",
				privacyPaymentProcessor: "포트원",
				privacySmsProvider: "NHN Cloud",
			});
			expect(saved?.privacyPaymentProcessor).toBe("포트원");

			const afterInsert = await getPrivacyContacts({});
			expect(afterInsert?.privacySmsProvider).toBe("NHN Cloud");
			expect(afterInsert?.privacyContactPhone).toBe("02-000-0000");
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("빈 문자열은 null로 저장해 폴백이 뜨도록 한다", async () => {
		const fixture = await createFixture();
		try {
			const update = createProcedureClient(
				siteSettingsRouter.updatePrivacyContacts,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "siteSettings", "updatePrivacyContacts"],
				}
			);
			await update({
				privacyPaymentProcessor: "   ",
				privacySmsProvider: "다우기술",
			});
			const [row] = await db
				.select({
					privacyPaymentProcessor: bambiSiteSettings.privacyPaymentProcessor,
					privacySmsProvider: bambiSiteSettings.privacySmsProvider,
				})
				.from(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, "default"));
			expect(row?.privacyPaymentProcessor).toBeNull();
			expect(row?.privacySmsProvider).toBe("다우기술");
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("잘못된 이메일 형식은 거부한다", async () => {
		const fixture = await createFixture();
		try {
			const update = createProcedureClient(
				siteSettingsRouter.updatePrivacyContacts,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "siteSettings", "updatePrivacyContacts"],
				}
			);
			await expect(
				update({ privacyContactEmail: "not-an-email" })
			).rejects.toBeTruthy();
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("updatePrivacyContacts는 운영자가 아니면 FORBIDDEN, 비로그인은 UNAUTHORIZED", async () => {
		const fixture = await createFixture();
		try {
			const asEmployer = createProcedureClient(
				siteSettingsRouter.updatePrivacyContacts,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "siteSettings", "updatePrivacyContacts"],
				}
			);
			await expectOrpcCode(
				asEmployer({ privacyPaymentProcessor: "몰래 수정" }),
				"FORBIDDEN"
			);

			const asGuest = createProcedureClient(
				siteSettingsRouter.updatePrivacyContacts,
				{
					context: createContextForUser(null),
					path: ["bambi", "siteSettings", "updatePrivacyContacts"],
				}
			);
			await expectOrpcCode(
				asGuest({ privacyPaymentProcessor: "몰래 수정" }),
				"UNAUTHORIZED"
			);
		} finally {
			await cleanupFixture(fixture);
		}
	});
});

describe("siteSettings payment accounts", () => {
	it("getPaymentAccounts는 미설정 시 빈 배열, 운영자 저장 후 계좌를 반환한다", async () => {
		const fixture = await createFixture();
		try {
			await db
				.delete(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, "default"));

			const getPaymentAccounts = createProcedureClient(
				siteSettingsRouter.getPaymentAccounts,
				{
					context: createContextForUser(null),
					path: ["bambi", "siteSettings", "getPaymentAccounts"],
				}
			);
			expect(await getPaymentAccounts({})).toEqual([]);

			const update = createProcedureClient(
				siteSettingsRouter.updatePaymentAccounts,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "siteSettings", "updatePaymentAccounts"],
				}
			);
			const saved = await update({
				bankAccounts: [
					{
						accountNumber: "  123-456-789  ",
						bank: "  국민은행  ",
						holder: "  밤비  ",
					},
				],
			});
			// 앞뒤 공백은 제거해 저장한다
			expect(saved).toEqual([
				{ accountNumber: "123-456-789", bank: "국민은행", holder: "밤비" },
			]);

			const afterInsert = await getPaymentAccounts({});
			expect(afterInsert).toHaveLength(1);
			expect(afterInsert[0]?.bank).toBe("국민은행");

			// 빈 배열로 다시 저장하면 계좌가 비워진다
			await update({ bankAccounts: [] });
			expect(await getPaymentAccounts({})).toEqual([]);
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("계좌 필드가 비면 거부하고, 푸터 값은 계좌 저장과 독립적으로 보존된다", async () => {
		const fixture = await createFixture();
		try {
			const updateFooter = createProcedureClient(
				siteSettingsRouter.updateFooter,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "siteSettings", "updateFooter"],
				}
			);
			const updateAccounts = createProcedureClient(
				siteSettingsRouter.updatePaymentAccounts,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "siteSettings", "updatePaymentAccounts"],
				}
			);

			await updateFooter({ operator: "밤비 주식회사" });
			await updateAccounts({
				bankAccounts: [
					{ accountNumber: "111", bank: "신한은행", holder: "밤비" },
				],
			});

			// 계좌 저장이 푸터 값을 지우지 않는다
			const getFooter = createProcedureClient(siteSettingsRouter.getFooter, {
				context: createContextForUser(null),
				path: ["bambi", "siteSettings", "getFooter"],
			});
			expect((await getFooter({}))?.operator).toBe("밤비 주식회사");

			// 빈 필드는 거부
			await expect(
				updateAccounts({
					bankAccounts: [{ accountNumber: "222", bank: "  ", holder: "밤비" }],
				})
			).rejects.toBeTruthy();
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("updatePaymentAccounts는 운영자가 아니면 FORBIDDEN, 비로그인은 UNAUTHORIZED", async () => {
		const fixture = await createFixture();
		try {
			const asEmployer = createProcedureClient(
				siteSettingsRouter.updatePaymentAccounts,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "siteSettings", "updatePaymentAccounts"],
				}
			);
			await expectOrpcCode(
				asEmployer({
					bankAccounts: [
						{ accountNumber: "1", bank: "은행", holder: "예금주" },
					],
				}),
				"FORBIDDEN"
			);

			const asGuest = createProcedureClient(
				siteSettingsRouter.updatePaymentAccounts,
				{
					context: createContextForUser(null),
					path: ["bambi", "siteSettings", "updatePaymentAccounts"],
				}
			);
			await expectOrpcCode(
				asGuest({
					bankAccounts: [
						{ accountNumber: "1", bank: "은행", holder: "예금주" },
					],
				}),
				"UNAUTHORIZED"
			);
		} finally {
			await cleanupFixture(fixture);
		}
	});
});
