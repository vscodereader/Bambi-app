import { db } from "@bambi-app/db";
import { bambiSiteSettings } from "@bambi-app/db/schema/bambi";
import { eq } from "drizzle-orm";

import { DEFAULT_WITHDRAWAL_RETENTION_DAYS } from "./bambi-policy";

// 사이트 설정은 고정 키 "default" 단일 행이다(site-settings 라우터와 동일 규약).
const SETTINGS_ROW_ID = "default";

// 탈퇴 개인정보 보존기간(일) 해석 — 운영자 설정값이 있으면 그 값, 없으면 기본값.
// 파기 배치와 회원 정책 조회 API가 같은 값을 보도록 이 함수만 경유한다.
export const resolveWithdrawalRetentionDays = async (): Promise<number> => {
	const [row] = await db
		.select({ days: bambiSiteSettings.withdrawalRetentionDays })
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
		.limit(1);
	return row?.days ?? DEFAULT_WITHDRAWAL_RETENTION_DAYS;
};
