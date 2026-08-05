// 본인인증 수집 로그 기록. 실인증이 확인된 지점(가입 전 확인 · 가입 완료 · 기존 회원
// 재인증)에서 사람당 1행을 upsert 한다 — (birth_date, phone_number)가 사람 식별 키라
// 같은 사람이 재인증하면(인증 건 ID는 매번 새로 발급) 기존 행이 최신 상태로 갱신된다.
// 개발자 SQL 전용 표라 읽는 코드는 어디에도 두지 않는다(쓰기 전용).
//
// 실패를 삼키지 않는다: 수집 누락을 막는 게 목적이라 기록이 실패하면 인증 흐름도 실패한다.

import { db } from "@bambi-app/db";
import { bambiIdentityVerificationLog } from "@bambi-app/db/schema/bambi";
import { sql } from "drizzle-orm";

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
	const insert = db
		.insert(bambiIdentityVerificationLog)
		.values({ ...values, identityVerificationId, kind });
	// phone_number가 null이면 사람 식별 unique 인덱스(부분 인덱스) 밖이라 충돌이 없다 —
	// 그냥 insert. (mock 흐름은 애초에 기록하지 않으므로 드문 경우.)
	if (!identity.phoneNumber) {
		await insert;
		return;
	}
	await insert.onConflictDoUpdate({
		target: [
			bambiIdentityVerificationLog.birthDate,
			bambiIdentityVerificationLog.phoneNumber,
		],
		targetWhere: sql`${bambiIdentityVerificationLog.phoneNumber} IS NOT NULL`,
		set: {
			...values,
			identityVerificationId,
			...(kind ? { kind } : {}),
			updatedAt: new Date(),
		},
	});
};
