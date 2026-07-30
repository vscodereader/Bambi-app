// 본인인증 건(identityVerificationId)의 발급·유효성·소진을 관리한다.
// 과거에는 클라이언트가 ID를 직접 만들었기 때문에 서버는 "우리가 시작시킨 인증인가"를
// 알 수 없었고, 한 번 인증된 ID는 몇 달 뒤에도 몇 번이든 통과했다. 이제 서버가 발급하고
// (issueIdentityVerificationId) 쓸 때마다 발급 기록·유효시간·소진 여부를 본다
// (본인확인서비스 이용기관 취약점 자체점검 항목 4 — 인증정보 재사용 차단).
//
// 이 모듈만 DB를 안다. 같은 계열의 bambi-identity.ts(공통 검증 절차)와
// portone-identity.ts(포트원 호출)는 각각 "DB를 건드리지 않는다"·"env·db에 의존하지
// 않는다"를 전제로 쓰이고 있어(웹이 후자를 런타임 import 한다) 그 전제를 깨지 않도록
// DB를 아는 관문을 별도 파일로 뺐다.

import { randomUUID } from "node:crypto";

import { db } from "@bambi-app/db";
import { bambiIdentityVerification } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, eq, gt, isNull } from "drizzle-orm";

// 인증창을 마친 뒤 가입 폼(닉네임·비밀번호·약관 동의)을 작성하는 데 걸리는 시간을
// 넉넉히 잡은 값. 이 시간을 넘긴 인증 건은 다시 인증받게 한다 — 인증정보가 무기한
// 살아 있으면 나중에 유출된 ID가 그대로 재사용된다.
export const IDENTITY_VERIFICATION_TTL_MINUTES = 30;

// 발급 기록 없음 · 이미 소진 · 유효시간 초과를 한 문구로 묶는다. 어느 쪽인지 알려 주면
// 공격자에게 "그 ID는 존재하긴 한다" 같은 힌트가 되고, 사용자가 할 일은 어차피 재인증이다.
const REUSED_MESSAGE =
	"본인인증 정보가 만료되었거나 이미 사용되었어요. 다시 인증해 주세요.";

const expiryCutoff = (now: Date) =>
	new Date(now.getTime() - IDENTITY_VERIFICATION_TTL_MINUTES * 60 * 1000);

// 사용 가능한 인증 건인지 판정하는 공통 조건: 발급 기록이 있고 + 아직 소진되지 않았고 +
// 발급 후 TTL 이내.
const usableCondition = (identityVerificationId: string, now: Date) =>
	and(
		eq(bambiIdentityVerification.id, identityVerificationId),
		isNull(bambiIdentityVerification.consumedAt),
		gt(bambiIdentityVerification.issuedAt, expiryCutoff(now))
	);

// 인증 건 발급. 클라이언트는 이 값을 그대로 포트원 인증창에 넘긴다.
export const issueIdentityVerificationId = async (): Promise<string> => {
	const identityVerificationId = `iv-${randomUUID()}`;
	await db
		.insert(bambiIdentityVerification)
		.values({ id: identityVerificationId });
	return identityVerificationId;
};

// 검증만 하고 소진시키지 않는다. 정상 가입 1회에 같은 인증 건이
// checkIdentityForSignup → POST /api/guest → createXxxProfile 순서로 세 번 도달하므로,
// 중간 단계에서 소진시키면 정상 가입이 깨진다. 소진은 최종 소비 지점에서만 한다.
export const assertIdentityVerificationUsable = async (
	identityVerificationId: string,
	now: Date = new Date()
): Promise<void> => {
	const [row] = await db
		.select({ id: bambiIdentityVerification.id })
		.from(bambiIdentityVerification)
		.where(usableCondition(identityVerificationId, now))
		.limit(1);
	if (!row) {
		throw new ORPCError("BAD_REQUEST", { message: REUSED_MESSAGE });
	}
};

// 최종 소비 — 여기를 지나면 그 인증 건은 다시 쓸 수 없다(프로필 생성·재인증 완료).
// 조건부 UPDATE의 영향 행 수로 판정한다. 먼저 SELECT하고 나중에 UPDATE하면 동시 요청
// 두 개가 같은 인증 건으로 모두 통과할 수 있다(Postgres는 consumed_at IS NULL 조건을
// 앞선 UPDATE 커밋 후 다시 평가하므로 둘 중 하나만 1행을 얻는다).
export const consumeIdentityVerification = async (
	identityVerificationId: string,
	now: Date = new Date()
): Promise<void> => {
	const consumed = await db
		.update(bambiIdentityVerification)
		.set({ consumedAt: now })
		.where(usableCondition(identityVerificationId, now))
		.returning({ id: bambiIdentityVerification.id });
	if (consumed.length === 0) {
		throw new ORPCError("BAD_REQUEST", { message: REUSED_MESSAGE });
	}
};
