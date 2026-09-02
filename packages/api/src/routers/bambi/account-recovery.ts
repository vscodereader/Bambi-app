// 계정 복구. 두 갈래가 들어 있다.
//
// 1) 아이디 찾기 · 비밀번호 찾기 — 로그인하지 못하는 사람이 부르는 흐름이므로 전부
//    공개 프로시저이고, 대신 IP 레이트리밋을 건다(rateLimitedPublicProcedure). 대상 계정은
//    클라이언트가 지정할 수 없고, 오직 서버가 포트원 본인인증 결과의 CI/DI 해시 + 프로필에
//    저장된 생년월일·성별로 특정한다 — userId·이메일 같은 식별자를 입력으로 받으면
//    남의 계정 비밀번호를 바꾸는 통로가 된다.
// 2) 탈퇴 복구(운영자) — 실수로 탈퇴한 계정의 deletedAt 마커를 지워 로그인을 되살린다.
//    운영자 전용(adminProcedure)이고 대상 userId를 그대로 받는다.
//
// onboarding.ts에 붙이지 않고 파일을 나눈 이유는 그쪽이 이미 1000줄이 넘어서다.

import { auth } from "@bambi-app/auth";
import { PASSWORD_MIN_LENGTH } from "@bambi-app/auth/password-policy";
import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	adminModerationAction,
	bambiProfile,
} from "@bambi-app/db/schema/bambi";
import { env, isTestIdentityChannelAllowed } from "@bambi-app/env/server";
import { ORPCError } from "@orpc/server";
import { and, eq, isNull, or } from "drizzle-orm";
import z from "zod";

import { adminProcedure, rateLimitedPublicProcedure } from "../../index";
import { resolveAccountRestoreDecision } from "../../services/bambi-account-restore";
import { requireAdminProfile } from "../../services/bambi-authz";
import {
	resolveVerifiedIdentity,
	type VerifiedIdentity,
} from "../../services/bambi-identity";
import {
	assertIdentityVerificationUsable,
	consumeIdentityVerification,
} from "../../services/bambi-identity-ticket";

const identityInput = z.object({
	identityVerificationId: z.string().min(1).max(120),
});

// 회원가입과 같은 최소 8자. 상한은 better-auth의 maxPasswordLength 기본값과 맞춘다 —
// 길이 제한 없이 해시 함수에 넘기면 긴 입력 하나로 CPU를 태울 수 있다.
const resetPasswordInput = identityInput.extend({
	newPassword: z
		.string()
		.min(
			PASSWORD_MIN_LENGTH,
			`비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요.`
		)
		.max(128, "비밀번호는 128자 이하여야 해요."),
});

// 운영자 탈퇴 복구 입력. 사유는 다른 운영자 조치(setUserStatus·setUserRole)와 같은 길이 규약.
const restoreWithdrawnAccountInput = z.object({
	reason: z.string().min(2).max(500),
	targetUserId: z.string().min(1),
});

interface RecoverableAccount {
	loginId: string | null;
	userId: string;
}

// 본인인증 결과로 계정을 특정한다. 판정 축은 DI(1인 1계정)지만, 과거 CI만 저장된 계정도
// 같은 사람이므로 함께 본다(onboarding.ts의 findIdentityCollision과 같은 where절).
// 탈퇴 계정은 제외한다 — 로그인 자체가 auth 훅에서 막히므로 아이디를 알려 줘도 쓸 수
// 없다. 아이디·이메일은 보존기간 동안 남지만(파기는 purgeWithdrawnAccounts 배치),
// 여기서 흘리면 탈퇴한 계정의 식별값을 되돌려주는 셈이라 deletedAt으로 걸러낸다.
const findRecoverableAccount = async (
	identity: VerifiedIdentity
): Promise<RecoverableAccount | null> => {
	const [row, second] = await db
		.select({
			birthDate: bambiProfile.birthDate,
			gender: bambiProfile.gender,
			loginId: user.login_id,
			userId: user.id,
		})
		.from(bambiProfile)
		.innerJoin(user, eq(user.id, bambiProfile.userId))
		.where(
			and(
				or(
					eq(bambiProfile.diHash, identity.diHash),
					eq(bambiProfile.ciHash, identity.ciHash)
				),
				isNull(user.deletedAt)
			)
		)
		// DI가 맞는 프로필과 CI만 저장된 옛 프로필이 서로 다른 사용자일 수 있다. 정렬 없이
		// limit(1)이면 어느 행이 뽑힐지 Postgres가 정하므로, 엉뚱한 계정의 비밀번호가 바뀔 수
		// 있었다. 두 건 이상이면 조용히 하나 고르지 않고 계정 없음으로 처리한다(수동 확인 대상).
		.limit(2);
	if (!row || second) {
		return null;
	}
	// 인증 결과와 계정에 저장된 생년월일·성별을 대조한다. 이게 없으면 계정 매칭 축이
	// CI/DI 해시 하나뿐이라, 인증 채널이 값을 검증하지 않는 순간 그대로 뚫린다.
	// 불일치는 "계정 없음"과 완전히 같은 응답으로 처리한다 — "생년월일이 틀렸습니다" 같은
	// 구분된 응답은 "이 CI에 해당하는 계정이 존재한다"를 알려주는 오라클이 된다.
	// 저장값이 null인 옛 프로필(실인증 이전 가입)은 대조를 건너뛴다. 그쪽은 여전히 해시만으로
	// 특정되는데, 소급 채우기는 이 작업 범위 밖의 별도 이슈다.
	if (row.birthDate !== null && row.birthDate !== identity.birth8) {
		return null;
	}
	// 포트원이 성별을 주지 않으면(null) 대조하지 않는다 — 인증 결과에 없는 값으로
	// 정상 사용자를 막으면 안 된다.
	if (
		row.gender !== null &&
		identity.gender !== null &&
		row.gender !== identity.gender
	) {
		return null;
	}
	return { loginId: row.loginId, userId: row.userId };
};

// 두 프로시저가 공유하는 앞단: 인증 건 검증 → 포트원 단건조회 → 계정 특정.
// 여기서는 인증 건을 소진시키지 않는다 — 비밀번호 찾기는 같은 인증 건에 두 번 닿는다
// (계정 존재 확인 1회 + 실제 변경 1회). 소진은 최종 소비 지점인
// resetPasswordByIdentity에서만 한다.
const resolveAccountByIdentity = async (
	identityVerificationId: string
): Promise<RecoverableAccount | null> => {
	const apiSecret = env.PORTONE_API_SECRET;
	if (!apiSecret) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "본인인증이 아직 구성되지 않았습니다.",
		});
	}
	await assertIdentityVerificationUsable(identityVerificationId);
	const identity = await resolveVerifiedIdentity(
		apiSecret,
		identityVerificationId,
		// 테스트 채널은 통신사 대조 없이 아무 값이나 통과시켜 비로그인 계정 탈취로 직결되므로,
		// env 단일 판정(로컬·검증배포만 허용, 실서비스 프로덕션 default-deny)을 그대로 따른다.
		{ allowTestChannel: isTestIdentityChannelAllowed }
	);
	return await findRecoverableAccount(identity);
};

export const accountRecoveryRouter = {
	// 아이디 찾기. 본인인증을 통과한 본인에게만 응답하므로 아이디는 마스킹하지 않는다.
	// 이메일은 싣지 않는다 — 요구사항은 "가입된 아이디 안내"까지이고, 이메일까지 내려보내면
	// 노출 범위가 그보다 넓어진다. 계정은 있지만 login_id가 없는 옛 계정은
	// { found: true, loginId: null }로 구분되어, 화면이 "이메일로 가입된 계정" 안내를 낸다.
	lookupAccountByIdentity: rateLimitedPublicProcedure
		.input(identityInput)
		.handler(
			async ({
				input,
			}): Promise<{ found: boolean; loginId: string | null }> => {
				const account = await resolveAccountByIdentity(
					input.identityVerificationId
				);
				return { found: account !== null, loginId: account?.loginId ?? null };
			}
		),

	// 비밀번호 찾기(재설정). 화면이 먼저 lookupAccountByIdentity로 계정 존재를 확인하지만,
	// 그 사이에 탈퇴가 일어날 수도 있고 클라이언트를 신뢰할 수도 없으므로 여기서 다시 본다.
	resetPasswordByIdentity: rateLimitedPublicProcedure
		.input(resetPasswordInput)
		.handler(async ({ input }): Promise<{ success: true }> => {
			const account = await resolveAccountByIdentity(
				input.identityVerificationId
			);
			if (!account) {
				throw new ORPCError("NOT_FOUND", {
					message: "본인인증 정보와 일치하는 계정을 찾을 수 없어요.",
				});
			}
			// 인증 건의 최종 소비 지점. 여기를 지나면 같은 인증 건으로 비밀번호를 다시
			// 바꿀 수 없다(변경 전에 소진해야 실패한 요청이 인증 건을 살려두지 않는다).
			await consumeIdentityVerification(input.identityVerificationId);

			// better-auth의 비밀번호 재설정(email-otp)이 하는 절차 그대로다: 비밀번호는
			// account 테이블의 credential 행에 있으므로, 그 행이 없는 계정(소셜 전용 등)은
			// 만들고 있으면 해시만 갈아끼운다.
			const authContext = await auth.$context;
			const passwordHash = await authContext.password.hash(input.newPassword);
			const accounts = await authContext.internalAdapter.findAccounts(
				account.userId
			);
			const hasCredential = accounts.some(
				(row) => row.providerId === "credential"
			);
			if (hasCredential) {
				await authContext.internalAdapter.updatePassword(
					account.userId,
					passwordHash
				);
			} else {
				await authContext.internalAdapter.createAccount({
					accountId: account.userId,
					password: passwordHash,
					providerId: "credential",
					userId: account.userId,
				});
			}
			// 비밀번호를 잊었다는 상황에는 계정을 남이 쥐고 있을 가능성도 포함된다.
			// 재설정과 동시에 해당 사용자의 모든 기기 세션을 끊는다.
			await authContext.internalAdapter.deleteSessions(account.userId);

			return { success: true };
		}),

	// 탈퇴 복구(운영자). deletedAt 마커만 지우면 끝이다 — better-auth 세션 생성 훅이
	// 이 마커 하나로 로그인을 막고 있어서(packages/auth/src/index.ts), 지우는 즉시
	// 본인이 기존 아이디·비밀번호로 다시 로그인할 수 있다.
	//
	// 파기 배치가 이미 지나간 계정(purgedAt)은 되살리지 않는다. 비밀번호·연락처·본인인증
	// 해시가 모두 지워져 로그인할 수단이 없고, 되살려 봐야 표시명이 "탈퇴한 회원"인 빈
	// 껍데기만 남는다. 판정은 서버·화면이 공유하는 순수 함수(bambi-account-restore)에 둔다.
	//
	// 탈퇴 때 지운 팀·조직 멤버십(member·team_member)과 내려간 공고는 복구되지 않는다 —
	// 조직 구성은 소유자 판단이 필요한 영역이라 운영자가 임의로 되돌리지 않는다.
	restoreWithdrawnAccount: adminProcedure
		.input(restoreWithdrawnAccountInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [target] = await tx
					.select({
						deletedAt: user.deletedAt,
						purgedAt: user.purgedAt,
					})
					.from(user)
					.where(eq(user.id, input.targetUserId))
					.limit(1);

				if (!target) {
					throw new ORPCError("NOT_FOUND", {
						message: "계정을 찾을 수 없어요.",
					});
				}

				const decision = resolveAccountRestoreDecision(target);
				if (!decision.canRestore) {
					throw new ORPCError("BAD_REQUEST", { message: decision.message });
				}

				// purgedAt 가드를 WHERE에도 둔다 — 판정과 갱신 사이에 파기 배치가 끼어들어도
				// 파기된 계정이 되살아나지 않는다.
				const [restored] = await tx
					.update(user)
					.set({ deletedAt: null })
					.where(and(eq(user.id, input.targetUserId), isNull(user.purgedAt)))
					.returning({ name: user.name, userId: user.id });

				if (!restored) {
					throw new ORPCError("CONFLICT", {
						message:
							"복구하는 사이에 계정 상태가 바뀌었어요. 목록을 새로고침한 뒤 다시 시도해 주세요.",
					});
				}

				await tx.insert(adminModerationAction).values({
					action: "restore_account",
					adminUserId: admin.userId,
					reason: input.reason,
					targetId: input.targetUserId,
					targetType: "user",
				});

				return restored;
			});
		}),
};
