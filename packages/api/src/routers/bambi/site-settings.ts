import { db } from "@bambi-app/db";
import { bambiSiteSettings } from "@bambi-app/db/schema/bambi";
import { eq } from "drizzle-orm";
import z from "zod";

import { adminProcedure, publicProcedure } from "../../index";
import { DEFAULT_AD_ROTATION_MINUTES } from "../../services/bambi-ad-exposure";
import { DEFAULT_WITHDRAWAL_RETENTION_DAYS } from "../../services/bambi-policy";

// 단일 행(설정) 고정 키. 조회·수정 모두 이 행 하나만 다룬다.
const SETTINGS_ROW_ID = "default";

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
	privacySmsProvider: bambiSiteSettings.privacySmsProvider,
	privacyContactPhone: bambiSiteSettings.privacyContactPhone,
	privacyContactEmail: bambiSiteSettings.privacyContactEmail,
} as const;

const updatePrivacyContactsInput = z.object({
	privacyPaymentProcessor: optionalText(120),
	privacySmsProvider: optionalText(120),
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
};
