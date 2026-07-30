import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [
	{ db },
	authSchema,
	bambiSchema,
	{ siteSettingsRouter },
	{ DEFAULT_CRAWLED_LIMITS, readCrawledLimits },
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./site-settings"),
	import("../../services/bambi-crawled-limits"),
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
			});
			expect(saved?.privacyPaymentProcessor).toBe("포트원");

			const afterInsert = await getPrivacyContacts({});
			expect(afterInsert?.privacyPaymentProcessor).toBe("포트원");
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
				privacyContactPhone: "02-111-1111",
			});
			const [row] = await db
				.select({
					privacyPaymentProcessor: bambiSiteSettings.privacyPaymentProcessor,
					privacyContactPhone: bambiSiteSettings.privacyContactPhone,
				})
				.from(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, "default"));
			expect(row?.privacyPaymentProcessor).toBeNull();
			expect(row?.privacyContactPhone).toBe("02-111-1111");
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

describe("siteSettings minimum wage", () => {
	it("저장한 최저시급을 공개 조회(getFooter)로 읽고, null이면 미설정으로 돌아간다", async () => {
		const fixture = await createFixture();
		try {
			const update = createProcedureClient(
				siteSettingsRouter.updateMinimumWage,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "siteSettings", "updateMinimumWage"],
				}
			);
			const getFooter = createProcedureClient(siteSettingsRouter.getFooter, {
				context: createContextForUser(null),
				path: ["bambi", "siteSettings", "getFooter"],
			});

			await update({ hourly: 10_320, year: 2026 });
			const saved = await getFooter({});
			expect(saved?.minimumWageYear).toBe(2026);
			expect(saved?.minimumWageHourly).toBe(10_320);

			// 비우면 null → 웹이 코드 기본값으로 폴백한다.
			await update({ hourly: null, year: null });
			const cleared = await getFooter({});
			expect(cleared?.minimumWageYear).toBeNull();
			expect(cleared?.minimumWageHourly).toBeNull();
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("범위를 벗어난 연도·시급은 거부하고, 운영자가 아니면 FORBIDDEN", async () => {
		const fixture = await createFixture();
		try {
			const update = createProcedureClient(
				siteSettingsRouter.updateMinimumWage,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "siteSettings", "updateMinimumWage"],
				}
			);
			await expect(update({ hourly: 10_320, year: 26 })).rejects.toBeTruthy();
			await expect(update({ hourly: 0, year: 2026 })).rejects.toBeTruthy();
			await expect(
				update({ hourly: 10_320.5, year: 2026 })
			).rejects.toBeTruthy();

			const asEmployer = createProcedureClient(
				siteSettingsRouter.updateMinimumWage,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "siteSettings", "updateMinimumWage"],
				}
			);
			await expectOrpcCode(asEmployer({ hourly: 1, year: 2026 }), "FORBIDDEN");
		} finally {
			await cleanupFixture(fixture);
		}
	});
});

describe("siteSettings crawled exposure", () => {
	it("세 노출 스위치(배너·공고·커뮤니티)가 각각 왕복하고 미설정 기본은 false", async () => {
		const fixture = await createFixture();
		try {
			await db
				.delete(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, "default"));

			const get = createProcedureClient(siteSettingsRouter.getCrawledExposure, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "siteSettings", "getCrawledExposure"],
			});
			expect(await get({})).toEqual({
				crawledAdBannerEnabled: false,
				crawledCommunityFeedEnabled: false,
				crawledJobFeedEnabled: false,
			});

			const update = createProcedureClient(
				siteSettingsRouter.updateCrawledExposure,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "siteSettings", "updateCrawledExposure"],
				}
			);
			// 커뮤니티만 켠다 — 배너·공고와 독립적으로 껐다 켤 수 있어야 한다.
			const saved = await update({
				adBannerEnabled: false,
				communityFeedEnabled: true,
				jobFeedEnabled: false,
			});
			expect(saved.crawledCommunityFeedEnabled).toBe(true);
			expect(saved.crawledAdBannerEnabled).toBe(false);
			expect(saved.crawledJobFeedEnabled).toBe(false);

			expect((await get({})).crawledCommunityFeedEnabled).toBe(true);
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("updateCrawledExposure는 운영자가 아니면 FORBIDDEN", async () => {
		const fixture = await createFixture();
		try {
			const asEmployer = createProcedureClient(
				siteSettingsRouter.updateCrawledExposure,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "siteSettings", "updateCrawledExposure"],
				}
			);
			await expectOrpcCode(
				asEmployer({
					adBannerEnabled: true,
					communityFeedEnabled: true,
					jobFeedEnabled: true,
				}),
				"FORBIDDEN"
			);
		} finally {
			await cleanupFixture(fixture);
		}
	});
});

describe("siteSettings crawled limits", () => {
	const emptyLimits = {
		adBannerLimit: null,
		communityLimit: null,
		recommendedLimit: null,
		specialLimit: null,
		urgentLimit: null,
	};

	it("다섯 상한이 왕복하고 미설정은 null(코드 기본값)로 나온다", async () => {
		const fixture = await createFixture();
		try {
			await db
				.delete(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, "default"));

			const get = createProcedureClient(siteSettingsRouter.getCrawledLimits, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "siteSettings", "getCrawledLimits"],
			});
			expect(await get({})).toEqual(emptyLimits);

			const update = createProcedureClient(
				siteSettingsRouter.updateCrawledLimits,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "siteSettings", "updateCrawledLimits"],
				}
			);
			// 공고 섹션의 0은 "그 자리에는 수집분을 노출하지 않음"이라 유효한 값이고, 폴백으로
			// 되돌아가면 안 된다(readCrawledLimits가 ??로 0을 지킨다).
			expect(
				await update({ ...emptyLimits, communityLimit: 40, specialLimit: 0 })
			).toEqual({ ...emptyLimits, communityLimit: 40, specialLimit: 0 });

			const limits = await readCrawledLimits();
			expect(limits.community).toBe(40);
			expect(limits.special).toBe(0);
			// 미설정 칸은 코드 기본값으로 돈다.
			expect(limits.urgent).toBe(DEFAULT_CRAWLED_LIMITS.urgent);
		} finally {
			await cleanupFixture(fixture);
		}
	});

	// 커뮤니티 상한은 수집 규모라 0(수집 정지)을 받지 않고, 목록 페이지가 주는 전량을 넘길 수
	// 없다. 트러스트 바운더리라 화면 검증만 믿지 않는다.
	it("커뮤니티 상한은 0과 실효 천장 초과를 거부한다", async () => {
		const fixture = await createFixture();
		try {
			const update = createProcedureClient(
				siteSettingsRouter.updateCrawledLimits,
				{
					context: createContextForUser(fixture.adminUserId),
					path: ["bambi", "siteSettings", "updateCrawledLimits"],
				}
			);

			await expect(
				update({ ...emptyLimits, communityLimit: 0 })
			).rejects.toBeTruthy();
			await expect(
				update({
					...emptyLimits,
					communityLimit: DEFAULT_CRAWLED_LIMITS.community + 1,
				})
			).rejects.toBeTruthy();

			const asEmployer = createProcedureClient(
				siteSettingsRouter.updateCrawledLimits,
				{
					context: createContextForUser(fixture.employerUserId),
					path: ["bambi", "siteSettings", "updateCrawledLimits"],
				}
			);
			await expectOrpcCode(asEmployer({ ...emptyLimits }), "FORBIDDEN");
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
