// 본인인증 수집 로그 기록. 실인증이 확인된 지점(가입 전 확인 · 가입 완료 · 기존 회원
// 재인증)에서 인증 건당 1행을 upsert 한다 — 같은 인증 건이 여러 단계를 지나므로 마지막
// 상태가 남는다. 개발자 SQL 전용 표라 읽는 코드는 어디에도 두지 않는다(쓰기 전용).
//
// 실패를 삼키지 않는다: 수집 누락을 막는 게 목적이라 기록이 실패하면 인증 흐름도 실패한다.

import { db } from "@bambi-app/db";
import { bambiIdentityVerificationLog } from "@bambi-app/db/schema/bambi";

import type { VerifiedIdentity } from "./bambi-identity";
import type { BambiProfileRole } from "./bambi-onboarding";

export const recordIdentityVerification = async ({
	identity,
	identityVerificationId,
	kind,
}: {
	identity: VerifiedIdentity;
	identityVerificationId: string;
	// 아직 구분을 모르는 호출(가입 전 사전확인)은 생략한다 — 기존 행의 kind를 지우지 않는다.
	kind?: BambiProfileRole;
}): Promise<void> => {
	const values = {
		birthDate: identity.birth8,
		gender: identity.gender,
		phoneNumber: identity.phoneNumber,
	};
	await db
		.insert(bambiIdentityVerificationLog)
		.values({ ...values, identityVerificationId, kind })
		.onConflictDoUpdate({
			target: bambiIdentityVerificationLog.identityVerificationId,
			set: { ...values, ...(kind ? { kind } : {}), updatedAt: new Date() },
		});
};
