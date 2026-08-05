import { db } from "@bambi-app/db";
import { account, session, user } from "@bambi-app/db/schema/auth";
import { bambiProfile } from "@bambi-app/db/schema/bambi";
import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";

import { resolveWithdrawalRetentionDays } from "./bambi-member-policy";
import { resolveWithdrawalPurgeCutoff } from "./bambi-policy";

// 탈퇴 계정의 잔여 식별값 파기 배치. 연락처·자격증명은 이미 탈퇴 시점에
// (onboarding.withdrawMyAccount) 파기되고, 부정 재가입 차단용 CI·DI 해시만 남는다 —
// 이 배치가 보존기간(운영자 설정, 기본 30일) 경과분의 해시를 마저 지우고 purgedAt을
// 찍는다. 스크럽 항목을 전부 유지하는 것은 이 변경 이전에 탈퇴해 PII가 남아 있는
// 계정까지 한 번에 정리하기 위해서다(이미 null인 값은 no-op).
// user 행 자체는 지우지 않는다 — 채팅·리뷰·신고 등 상대방 데이터가 onDelete 미지정
// (RESTRICT) FK로 물려 있어 행 삭제는 실패하거나 상대방 기록까지 깨진다.
//
// 보존기간은 호출 시점마다 DB에서 다시 읽는다(운영자가 설정을 바꾸면 다음 실행부터 반영).
// 대상 조건에 purgedAt IS NULL이 있어 멱등하다 — 스케줄러 틱과 운영자의 수동 실행이
// 겹쳐도 같은 계정이 두 번 처리되지 않는다.
export const purgeWithdrawnAccountsBatch = async (
	now: Date = new Date()
): Promise<{ purgedCount: number }> => {
	const retentionDays = await resolveWithdrawalRetentionDays();
	const cutoff = resolveWithdrawalPurgeCutoff(now, retentionDays);
	const targets = await db
		.select({ id: user.id })
		.from(user)
		.where(
			and(
				isNotNull(user.deletedAt),
				lte(user.deletedAt, cutoff),
				isNull(user.purgedAt)
			)
		);
	if (targets.length === 0) {
		return { purgedCount: 0 };
	}
	const ids = targets.map((row) => row.id);

	await db.transaction(async (tx) => {
		await tx.delete(session).where(inArray(session.userId, ids));
		// 비밀번호 등 자격증명 파기.
		await tx.delete(account).where(inArray(account.userId, ids));
		// 표시명(닉네임)은 user.name을 "탈퇴한 회원"으로 치환(아래 user 갱신)하므로
		// 프로필에서는 연락처·본인인증 식별값만 파기한다.
		await tx
			.update(bambiProfile)
			.set({
				phoneNumber: null,
				gender: null,
				birthDate: null,
				ciHash: null,
				diHash: null,
				isPhoneVerified: false,
			})
			.where(inArray(bambiProfile.userId, ids));
		// 이메일은 unique 제약이라 사용자별 tombstone으로 치환하고, 로그인 아이디는
		// nullable이라 비워서 파기한다(탈퇴 시점에 이미 처리되지만 이 변경 이전에
		// 탈퇴한 계정을 위해 여기서도 수행한다).
		for (const id of ids) {
			await tx
				.update(user)
				.set({
					email: `withdrawn-${id}@invalid.bambi`,
					name: "탈퇴한 회원",
					image: null,
					login_id: null,
					login_id_display: null,
					purgedAt: now,
				})
				.where(eq(user.id, id));
		}
	});

	return { purgedCount: ids.length };
};
