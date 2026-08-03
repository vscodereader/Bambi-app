// 아이디 찾기 · 비밀번호 찾기. 로그인하지 못하는 사람이 부르는 흐름이므로 전부
// 공개 프로시저이고, 대신 IP 레이트리밋을 건다(rateLimitedPublicProcedure). 대상 계정은
// 클라이언트가 지정할 수 없고, 오직 서버가 포트원 본인인증 결과의 CI/DI 해시 + 프로필에
// 저장된 생년월일·성별로 특정한다 — userId·이메일 같은 식별자를 입력으로 받으면
// 남의 계정 비밀번호를 바꾸는 통로가 된다.
//
// onboarding.ts에 붙이지 않고 파일을 나눈 이유는 그쪽이 이미 1000줄이 넘어서다.

import { auth } from "@bambi-app/auth";
import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import { bambiProfile } from "@bambi-app/db/schema/bambi";
import { env } from "@bambi-app/env/server";
import { ORPCError } from "@orpc/server";
import { and, eq, isNull, or } from "drizzle-orm";
import z from "zod";

import { rateLimitedPublicProcedure } from "../../index";
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
		.min(8, "비밀번호는 8자 이상이어야 해요.")
		.max(128, "비밀번호는 128자 이하여야 해요."),
});

interface RecoverableAccount {
	loginId: string | null;
	userId: string;
}

// 본인인증 결과로 계정을 특정한다. 판정 축은 DI(1인 1계정)지만, 과거 CI만 저장된 계정도
// 같은 사람이므로 함께 본다(onboarding.ts의 findIdentityCollision과 같은 where절).
// 탈퇴 계정은 제외한다 — 로그인 자체가 auth 훅에서 막히고, 탈퇴 시 login_id를 비우므로
// 알려 줄 아이디도 남아 있지 않다.
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
		// 테스트 채널은 통신사 대조를 하지 않아 아무 값이나 통과한다 — 개발에서만 허용한다.
		// TODO(임시): KCP 실계약 전 테스트 흐름 확인용으로 프로덕션에서도 허용 중 — 실연동 전환 시 원복.
		{ allowTestChannel: true }
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
};
