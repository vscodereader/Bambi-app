import { db } from "@bambi-app/db";
import { bambiSiteSettings } from "@bambi-app/db/schema/bambi";
import { eq } from "drizzle-orm";
import z from "zod";

import { adminProcedure, publicProcedure } from "../../index";

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
} as const;

// 공백만 입력하면 미설정으로 본다(폴백이 뜨도록 null 저장).
const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max, `${max}자 이내로 입력해 주세요.`)
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

const updateFooterInput = z.object({
	footerIntro: optionalText(500),
	operator: optionalText(120),
	ceo: optionalText(120),
	bizRegNo: optionalText(60),
	address: optionalText(200),
	email: z
		.string()
		.trim()
		.max(200, "200자 이내로 입력해 주세요.")
		.refine(
			(value) =>
				value.length === 0 || z.string().email().safeParse(value).success,
			"올바른 이메일 형식이 아닙니다."
		)
		.transform((value) => (value.length === 0 ? null : value))
		.nullish(),
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
};
