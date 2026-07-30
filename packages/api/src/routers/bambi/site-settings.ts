import { db } from "@bambi-app/db";
import { bambiSiteSettings } from "@bambi-app/db/schema/bambi";
import { eq } from "drizzle-orm";
import z from "zod";

import { adminProcedure, publicProcedure } from "../../index";
import { DEFAULT_AD_ROTATION_MINUTES } from "../../services/bambi-ad-exposure";
import { DEFAULT_CRAWLED_LIMITS } from "../../services/bambi-crawled-limits";
import { DEFAULT_WITHDRAWAL_RETENTION_DAYS } from "../../services/bambi-policy";

// 단일 행(설정) 고정 키. 조회·수정 모두 이 행 하나만 다룬다.
const SETTINGS_ROW_ID = "default";

// 공고 상세가 급여 옆에 붙이는 최저시급. 값이 없으면 null → 웹이 DEFAULT_MINIMUM_WAGE로 폴백한다.
const MINIMUM_WAGE_COLUMNS = {
	minimumWageHourly: bambiSiteSettings.minimumWageHourly,
	minimumWageYear: bambiSiteSettings.minimumWageYear,
} as const;

// 푸터에 노출하는 사업자 정보. 값이 없으면 null → 웹에서 코드의 폴백 상수를 쓴다.
const FOOTER_COLUMNS = {
	footerIntro: bambiSiteSettings.footerIntro,
	operator: bambiSiteSettings.operator,
	ceo: bambiSiteSettings.ceo,
	bizRegNo: bambiSiteSettings.bizRegNo,
	address: bambiSiteSettings.address,
	email: bambiSiteSettings.email,
	tel: bambiSiteSettings.tel,
	// 광고 슬롯 자리표시가 읽는 문의 번호. 푸터 전용은 아니지만 이미 공개 조회이고
	// 푸터가 모든 페이지에 있어 캐시를 공유하므로 별도 라우터를 만들지 않는다.
	adInquiryTel: bambiSiteSettings.adInquiryTel,
	// 최저시급도 같은 이유로 여기에 얹는다(민감 정보 아님 · 이미 캐시된 공개 조회 재사용).
	...MINIMUM_WAGE_COLUMNS,
} as const;

// 공백만 입력하면 미설정으로 본다(폴백이 뜨도록 null 저장).
const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max, `${max}자 이내로 입력해 주세요.`)
		.transform((value) => (value.length === 0 ? null : value))
		.nullish();

// optionalText + 이메일 형식 검증. 빈 값은 null(폴백)로 저장한다.
const optionalEmail = (max: number) =>
	z
		.string()
		.trim()
		.max(max, `${max}자 이내로 입력해 주세요.`)
		.refine(
			(value) =>
				value.length === 0 || z.string().email().safeParse(value).success,
			"올바른 이메일 형식이 아닙니다."
		)
		.transform((value) => (value.length === 0 ? null : value))
		.nullish();

// 무통장입금 계좌. 각 필드 필수(공백 불가)이며 앞뒤 공백은 제거해 저장한다.
const bankAccountInput = z.object({
	accountNumber: z
		.string()
		.trim()
		.min(1, "계좌번호를 입력해 주세요.")
		.max(60, "계좌번호는 60자 이내로 입력해 주세요."),
	bank: z
		.string()
		.trim()
		.min(1, "은행명을 입력해 주세요.")
		.max(60, "은행명은 60자 이내로 입력해 주세요."),
	holder: z
		.string()
		.trim()
		.min(1, "예금주를 입력해 주세요.")
		.max(60, "예금주는 60자 이내로 입력해 주세요."),
});

const updatePaymentAccountsInput = z.object({
	bankAccounts: z
		.array(bankAccountInput)
		.max(10, "계좌는 최대 10개까지 등록할 수 있습니다."),
});

// 개인정보 처리방침이 읽는 공개 필드. 위탁사명·관리부서 연락처만 노출하고 민감 설정은 싣지 않는다.
// 값이 없으면 null → 웹에서 코드 폴백(BAMBI_PROCESSORS / BAMBI_COMPANY.privacyOfficer)을 쓴다.
const PRIVACY_COLUMNS = {
	privacyPaymentProcessor: bambiSiteSettings.privacyPaymentProcessor,
	privacyOfficerName: bambiSiteSettings.privacyOfficerName,
	privacyContactPhone: bambiSiteSettings.privacyContactPhone,
	privacyContactEmail: bambiSiteSettings.privacyContactEmail,
} as const;

const updatePrivacyContactsInput = z.object({
	privacyPaymentProcessor: optionalText(120),
	privacyOfficerName: optionalText(60),
	privacyContactPhone: optionalText(60),
	privacyContactEmail: optionalEmail(200),
});

const updateFooterInput = z.object({
	footerIntro: optionalText(500),
	operator: optionalText(120),
	ceo: optionalText(120),
	bizRegNo: optionalText(60),
	address: optionalText(200),
	email: optionalEmail(200),
	tel: optionalText(60),
	adInquiryTel: optionalText(60),
});

// 회원 정책 — 탈퇴 개인정보 보존기간(일). null이면 기본값으로 복귀한다.
const updateMemberPolicyInput = z.object({
	withdrawalRetentionDays: z
		.number()
		.int("보존기간은 일 단위 정수로 입력해 주세요.")
		.min(1, "보존기간은 1일 이상으로 설정해 주세요.")
		.max(365, "보존기간은 365일 이하로 설정해 주세요.")
		.nullable(),
});

// 광고 배너 로테이션 주기(분). null이면 기본값(60분)으로 복귀한다. 트러스트 바운더리라
// 최소 1분·정수를 서버에서 검증한다(상한은 7일 = 10080분).
const AD_ROTATION_MAX_MINUTES = 10_080;
const updateAdRotationInput = z.object({
	minutes: z
		.number()
		.int("로테이션 주기는 분 단위 정수로 입력해 주세요.")
		.min(1, "로테이션 주기는 1분 이상으로 설정해 주세요.")
		.max(
			AD_ROTATION_MAX_MINUTES,
			"로테이션 주기는 10080분(7일) 이하로 설정해 주세요."
		)
		.nullable(),
});

// 최저시급. 둘 다 nullable이며 null이면 코드 기본값(DEFAULT_MINIMUM_WAGE)으로 복귀한다.
// 트러스트 바운더리라 연도 범위와 자릿수 오타(103,200원 등)를 서버에서 막는다.
const MINIMUM_WAGE_MIN_YEAR = 2000;
const MINIMUM_WAGE_MAX_YEAR = 2100;
const MINIMUM_WAGE_MAX_HOURLY = 1_000_000;
const updateMinimumWageInput = z.object({
	hourly: z
		.number()
		.int("시급은 원 단위 정수로 입력해 주세요.")
		.min(1, "시급은 1원 이상으로 입력해 주세요.")
		.max(MINIMUM_WAGE_MAX_HOURLY, "시급이 너무 큽니다. 자릿수를 확인해 주세요.")
		.nullable(),
	year: z
		.number()
		.int("연도는 4자리 정수로 입력해 주세요.")
		.min(MINIMUM_WAGE_MIN_YEAR, "연도는 2000년 이상으로 입력해 주세요.")
		.max(MINIMUM_WAGE_MAX_YEAR, "연도는 2100년 이하로 입력해 주세요.")
		.nullable(),
});

// 수집 콘텐츠 노출 스위치. 배너·공고 목록·커뮤니티를 한 컬럼으로 합치지 않는다 — 문제가
// 생기는 축이 다르고(배너는 이미지 저작권, 공고 목록은 공고 내용, 커뮤니티는 게시글 저작권),
// 한쪽만 내려야 하는 상황이 실제로 온다.
const CRAWLED_EXPOSURE_COLUMNS = {
	crawledAdBannerEnabled: bambiSiteSettings.crawledAdBannerEnabled,
	crawledCommunityFeedEnabled: bambiSiteSettings.crawledCommunityFeedEnabled,
	crawledJobFeedEnabled: bambiSiteSettings.crawledJobFeedEnabled,
};

const updateCrawledExposureInput = z.object({
	adBannerEnabled: z.boolean(),
	communityFeedEnabled: z.boolean(),
	jobFeedEnabled: z.boolean(),
});

// 섹션별 수집 노출 상한. null이면 코드 기본값(DEFAULT_CRAWLED_LIMITS)으로 복귀한다.
const CRAWLED_LIMIT_COLUMNS = {
	crawledAdBannerLimit: bambiSiteSettings.crawledAdBannerLimit,
	crawledCommunityLimit: bambiSiteSettings.crawledCommunityLimit,
	crawledRecommendedLimit: bambiSiteSettings.crawledRecommendedLimit,
	crawledSpecialLimit: bambiSiteSettings.crawledSpecialLimit,
	crawledUrgentLimit: bambiSiteSettings.crawledUrgentLimit,
};

// 트러스트 바운더리라 정수·범위를 서버에서 막는다. 0은 "그 섹션은 수집분을 노출하지 않음"이라
// 유효한 값이고, 상한 60은 한 섹션이 유료 공고를 밀어낼 만큼 커지지 않도록 두는 안전선이다.
const CRAWLED_LIMIT_MAX = 60;
const crawledLimit = z
	.number()
	.int("노출 개수는 정수로 입력해 주세요.")
	.min(0, "노출 개수는 0 이상으로 입력해 주세요.")
	.max(CRAWLED_LIMIT_MAX, "노출 개수는 60 이하로 입력해 주세요.")
	.nullable();

// 커뮤니티는 노출 자리가 아니라 한 회차에 목록에서 담을 글 수라 눈금이 다르다.
//  - 상한은 목록 페이지 수가 정하는 실효 천장(5페이지 × 30건 = 150)이다. 그보다 큰 값을 받으면
//    "올렸는데 안 늘어난다"가 되므로 아예 막는다 — 더 늘리려면 COMMUNITY_LIST_PAGES를 올린다.
//  - 0은 받지 않는다. 수집을 멈추는 건 crawlEnabled·crawledCommunityFeedEnabled가 할 일이고,
//    여기에 0이 들어오면 목록 0건이 셀렉터 파손으로 읽혀 회차가 aborted_low_yield로 남는다.
const CRAWLED_COMMUNITY_LIMIT_MAX = DEFAULT_CRAWLED_LIMITS.community;

const updateCrawledLimitsInput = z.object({
	adBannerLimit: crawledLimit,
	communityLimit: z
		.number()
		.int("수집 개수는 정수로 입력해 주세요.")
		.min(1, "수집 개수는 1 이상으로 입력해 주세요.")
		.max(
			CRAWLED_COMMUNITY_LIMIT_MAX,
			`수집 개수는 ${CRAWLED_COMMUNITY_LIMIT_MAX} 이하로 입력해 주세요.`
		)
		.nullable(),
	recommendedLimit: crawledLimit,
	specialLimit: crawledLimit,
	urgentLimit: crawledLimit,
});

// 입력 키(adBannerLimit)와 컬럼 키(crawledAdBannerLimit)는 층위가 달라 그대로 스프레드할 수
// 없다. 매핑을 한 곳에 모아 두 프로시저가 같은 변환을 쓰게 한다.
const toCrawledLimitValues = (
	input: z.infer<typeof updateCrawledLimitsInput>
) => ({
	crawledAdBannerLimit: input.adBannerLimit,
	crawledCommunityLimit: input.communityLimit,
	crawledRecommendedLimit: input.recommendedLimit,
	crawledSpecialLimit: input.specialLimit,
	crawledUrgentLimit: input.urgentLimit,
});

const toCrawledLimitsOutput = (row: {
	crawledAdBannerLimit: number | null;
	crawledCommunityLimit: number | null;
	crawledRecommendedLimit: number | null;
	crawledSpecialLimit: number | null;
	crawledUrgentLimit: number | null;
}) => ({
	adBannerLimit: row.crawledAdBannerLimit,
	communityLimit: row.crawledCommunityLimit,
	recommendedLimit: row.crawledRecommendedLimit,
	specialLimit: row.crawledSpecialLimit,
	urgentLimit: row.crawledUrgentLimit,
});

export const siteSettingsRouter = {
	// 푸터 렌더용 공개 조회. 행이 없으면 null(웹이 폴백 처리).
	getFooter: publicProcedure.handler(async () => {
		const [row] = await db
			.select(FOOTER_COLUMNS)
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);
		return row ?? null;
	}),

	// 운영자 전용 저장. 단일 행을 upsert 한다.
	updateFooter: adminProcedure
		.input(updateFooterInput)
		.handler(async ({ input }) => {
			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({ id: SETTINGS_ROW_ID, ...input })
				.onConflictDoUpdate({
					target: bambiSiteSettings.id,
					set: input,
				})
				.returning(FOOTER_COLUMNS);
			return saved ?? null;
		}),

	// 개인정보 처리방침 연락처 공개 조회. 처리방침 페이지가 위탁사명·관리부서 연락처를
	// 표시하는 데 쓴다. 행이 없으면 null(웹이 코드 폴백 처리).
	getPrivacyContacts: publicProcedure.handler(async () => {
		const [row] = await db
			.select(PRIVACY_COLUMNS)
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);
		return row ?? null;
	}),

	// 운영자 전용 저장. 같은 단일 행을 upsert 하되 처리방침 연락처 컬럼만 갱신한다.
	updatePrivacyContacts: adminProcedure
		.input(updatePrivacyContactsInput)
		.handler(async ({ input }) => {
			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({ id: SETTINGS_ROW_ID, ...input })
				.onConflictDoUpdate({
					target: bambiSiteSettings.id,
					set: input,
				})
				.returning(PRIVACY_COLUMNS);
			return saved ?? null;
		}),

	// 무통장입금 계좌 공개 조회. 결제 안내(공고 등록·광고 관리)만 소비하므로 푸터 조회와
	// 분리해, 사이트 전역 푸터 쿼리에 계좌번호가 실려 나가지 않게 한다. 미설정이면 빈 배열.
	getPaymentAccounts: publicProcedure.handler(async () => {
		const [row] = await db
			.select({ bankAccounts: bambiSiteSettings.bankAccounts })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);
		return row?.bankAccounts ?? [];
	}),

	// 운영자 전용 계좌 저장. 같은 단일 행을 upsert 하되 계좌 컬럼만 갱신해 푸터 값은 보존한다.
	updatePaymentAccounts: adminProcedure
		.input(updatePaymentAccountsInput)
		.handler(async ({ input }) => {
			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({ bankAccounts: input.bankAccounts, id: SETTINGS_ROW_ID })
				.onConflictDoUpdate({
					target: bambiSiteSettings.id,
					set: { bankAccounts: input.bankAccounts },
				})
				.returning({ bankAccounts: bambiSiteSettings.bankAccounts });
			return saved?.bankAccounts ?? [];
		}),

	// 회원 정책 공개 조회 — 탈퇴 안내 카피가 보존기간을 표시하는 데 쓴다.
	// days가 null이면 미설정(기본값 사용). defaultDays는 코드 기본값으로, 운영자
	// 폼의 placeholder와 안내 카피 폴백이 같은 값을 보게 한다.
	getMemberPolicy: publicProcedure.handler(async () => {
		const [row] = await db
			.select({ days: bambiSiteSettings.withdrawalRetentionDays })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);
		return {
			days: row?.days ?? null,
			defaultDays: DEFAULT_WITHDRAWAL_RETENTION_DAYS,
		};
	}),

	// 운영자 전용 회원 정책 저장. 같은 단일 행을 upsert 하되 해당 컬럼만 갱신한다.
	updateMemberPolicy: adminProcedure
		.input(updateMemberPolicyInput)
		.handler(async ({ input }) => {
			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({
					id: SETTINGS_ROW_ID,
					withdrawalRetentionDays: input.withdrawalRetentionDays,
				})
				.onConflictDoUpdate({
					target: bambiSiteSettings.id,
					set: { withdrawalRetentionDays: input.withdrawalRetentionDays },
				})
				.returning({ days: bambiSiteSettings.withdrawalRetentionDays });
			return { days: saved?.days ?? null };
		}),

	// 광고 배너 로테이션 주기 조회. minutes가 null이면 미설정(기본값 사용). defaultMinutes는
	// 코드 기본값으로, 운영자 폼 placeholder가 실제 폴백값을 보게 한다.
	getAdRotation: publicProcedure.handler(async () => {
		const [row] = await db
			.select({ minutes: bambiSiteSettings.adBannerRotationMinutes })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);
		return {
			defaultMinutes: DEFAULT_AD_ROTATION_MINUTES,
			minutes: row?.minutes ?? null,
		};
	}),

	// 운영자 전용 로테이션 주기 저장. 같은 단일 행을 upsert 하되 해당 컬럼만 갱신한다.
	updateAdRotation: adminProcedure
		.input(updateAdRotationInput)
		.handler(async ({ input }) => {
			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({
					adBannerRotationMinutes: input.minutes,
					id: SETTINGS_ROW_ID,
				})
				.onConflictDoUpdate({
					target: bambiSiteSettings.id,
					set: { adBannerRotationMinutes: input.minutes },
				})
				.returning({ minutes: bambiSiteSettings.adBannerRotationMinutes });
			return { minutes: saved?.minutes ?? null };
		}),

	// 운영자 전용 최저시급 저장. 같은 단일 행을 upsert 하되 최저시급 컬럼만 갱신한다.
	// 조회는 getFooter가 겸한다(공개 조회에 이미 실려 있음).
	updateMinimumWage: adminProcedure
		.input(updateMinimumWageInput)
		.handler(async ({ input }) => {
			const values = {
				minimumWageHourly: input.hourly,
				minimumWageYear: input.year,
			};
			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({ id: SETTINGS_ROW_ID, ...values })
				.onConflictDoUpdate({
					target: bambiSiteSettings.id,
					set: values,
				})
				.returning(MINIMUM_WAGE_COLUMNS);
			return saved ?? null;
		}),

	// 수집 콘텐츠 노출 스위치 조회. 운영자 전용이다 — 공개 조회에 실으면 "이 사이트가 남의
	// 공고를 긁어 쓰는 중"이라는 사실이 응답으로 새어 나간다(노출 자체는 이미 보이지만,
	// 켜짐/꺼짐 상태와 정책을 API로 알려줄 이유는 없다).
	getCrawledExposure: adminProcedure.handler(async () => {
		const [row] = await db
			.select(CRAWLED_EXPOSURE_COLUMNS)
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);

		return (
			row ?? {
				crawledAdBannerEnabled: false,
				crawledCommunityFeedEnabled: false,
				crawledJobFeedEnabled: false,
			}
		);
	}),

	// 배너·공고 목록·커뮤니티를 따로 끈다 — 한쪽이 문제여도 다른 쪽을 살려 둘 수 있어야 한다.
	updateCrawledExposure: adminProcedure
		.input(updateCrawledExposureInput)
		.handler(async ({ input }) => {
			const values = {
				crawledAdBannerEnabled: input.adBannerEnabled,
				crawledCommunityFeedEnabled: input.communityFeedEnabled,
				crawledJobFeedEnabled: input.jobFeedEnabled,
			};
			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({ id: SETTINGS_ROW_ID, ...values })
				.onConflictDoUpdate({ set: values, target: bambiSiteSettings.id })
				.returning(CRAWLED_EXPOSURE_COLUMNS);

			return saved ?? values;
		}),

	// 수집 상한(공고 섹션별 노출 + 커뮤니티 회차당 수집) 조회. 노출 스위치와 같은 이유로
	// 운영자 전용이다.
	// null은 미설정(코드 기본값 사용)이며, 운영자 폼이 placeholder로 기본값을 안내한다.
	getCrawledLimits: adminProcedure.handler(async () => {
		const [row] = await db
			.select(CRAWLED_LIMIT_COLUMNS)
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);

		return toCrawledLimitsOutput(
			row ?? {
				crawledAdBannerLimit: null,
				crawledCommunityLimit: null,
				crawledRecommendedLimit: null,
				crawledSpecialLimit: null,
				crawledUrgentLimit: null,
			}
		);
	}),

	// 다섯 값을 한 번에 저장한다 — 섹션 간 균형을 보고 함께 조정하는 값이라 개별 저장이 의미가 없다.
	updateCrawledLimits: adminProcedure
		.input(updateCrawledLimitsInput)
		.handler(async ({ input }) => {
			const values = toCrawledLimitValues(input);
			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({ id: SETTINGS_ROW_ID, ...values })
				.onConflictDoUpdate({ set: values, target: bambiSiteSettings.id })
				.returning(CRAWLED_LIMIT_COLUMNS);

			return toCrawledLimitsOutput(saved ?? values);
		}),
};
