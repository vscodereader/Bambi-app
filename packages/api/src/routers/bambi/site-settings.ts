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
};
