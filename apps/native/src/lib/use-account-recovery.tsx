// 로그인 화면의 아이디 찾기 · 비밀번호 재설정. 둘 다 같은 인앱 본인인증 모달
// (useIdentityModal)을 쓰고, 진입 의도만 ref로 갈라 결과 화면을 정한다 — 모달 인스턴스를
// 흐름마다 만들면 로그인 화면에 WebView 모달이 여러 개 마운트된다.
//
// 인증 건 소진 규칙(서버 account-recovery.ts): lookup은 소진하지 않고 reset이 최종
// 소비한다. 그래서 lookup → reset을 같은 인증 건 ID로 이어 붙일 수 있고, 반대로 reset이
// 실패한 뒤 같은 ID 재시도는 BAD_REQUEST가 정상이다 — 오류 문구가 재인증을 안내한다.

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Alert } from "react-native";

import { isIdentityVerificationConfigured } from "@/src/components/identity-verification-modal";
import { client } from "./orpc";
import {
	identityErrorMessage,
	useIdentityModal,
} from "./use-identity-verification";

// 두 프로시저는 RATE_LIMIT_OVERRIDES에 없어 기본 10/h다(인증창 발급 30/h보다 빡빡해
// 조회 쪽이 먼저 막힌다) — TOO_MANY_REQUESTS 문구가 반드시 필요하다.
const ACCOUNT_RECOVERY_ERROR_MESSAGES: Record<string, string> = {
	BAD_REQUEST:
		"본인인증이 완료되지 않았거나 이미 사용된 정보예요. 다시 인증해 주세요.",
	// 서버 resolveVerifiedIdentity가 만 19세 미만을 FORBIDDEN으로 막는다 — 폴백 문구로
	// 떨어지면 "잠시 후 다시 시도"가 돼 영원히 실패할 재시도를 안내한다.
	FORBIDDEN: "만 19세 이상만 이용할 수 있어요.",
	NOT_FOUND: "본인인증 정보와 일치하는 계정을 찾을 수 없어요.",
	TOO_MANY_REQUESTS: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
};

export type AccountRecoveryScreen =
	// loginId가 null이면 아이디 없이 이메일로 가입된 옛 계정이다.
	| { kind: "id-result"; loginId: null | string }
	| { kind: "not-found" }
	| { kind: "password-form"; identityVerificationId: string };

export function useAccountRecovery() {
	const [screen, setScreen] = useState<AccountRecoveryScreen | null>(null);
	const intentRef = useRef<"find-id" | "reset-password">("find-id");

	// 비밀번호 경로도 lookup을 먼저 탄다 — 새 비밀번호를 다 입력한 뒤에야 "계정 없음"으로
	// 실패시키지 않기 위해서다. lookup은 인증 건을 소진하지 않아 뒤이은 reset이 같은 ID를
	// 그대로 쓸 수 있다.
	const lookup = useMutation({
		mutationFn: async (identityVerificationId: string) => ({
			account: await client.bambi.accountRecovery.lookupAccountByIdentity({
				identityVerificationId,
			}),
			identityVerificationId,
		}),
		onError: (error) => {
			Alert.alert(
				"계정을 조회하지 못했어요",
				identityErrorMessage(
					error,
					ACCOUNT_RECOVERY_ERROR_MESSAGES,
					"잠시 후 다시 시도해 주세요."
				)
			);
		},
		onSuccess: ({ account, identityVerificationId }) => {
			if (!account.found) {
				setScreen({ kind: "not-found" });
				return;
			}

			setScreen(
				intentRef.current === "find-id"
					? { kind: "id-result", loginId: account.loginId }
					: { kind: "password-form", identityVerificationId }
			);
		},
	});

	const resetPassword = useMutation({
		// reset()은 옵저버 상태만 떼므로 MutationCache 엔트리(평문 새 비밀번호를 담은
		// variables)는 gcTime 동안 그대로 남는다 — 0으로 두어 즉시 제거한다.
		gcTime: 0,
		mutationFn: (input: {
			identityVerificationId: string;
			newPassword: string;
		}) => client.bambi.accountRecovery.resetPasswordByIdentity(input),
		onSuccess: () => {
			setScreen(null);
			// 성공 경로는 closeScreen을 거치지 않으므로 여기서 직접 비운다(오류 문구·평문
			// 비밀번호 정리).
			resetPassword.reset();
			// 서버가 이 계정의 전 세션을 끊으므로 자동 로그인은 하지 않는다(웹과 동일).
			Alert.alert(
				"비밀번호가 변경되었어요",
				"비밀번호가 성공적으로 변경되었습니다. 새 비밀번호로 로그인해 주세요."
			);
		},
	});

	const modal = useIdentityModal({
		messages: ACCOUNT_RECOVERY_ERROR_MESSAGES,
		onVerified: (id) => lookup.mutate(id),
	});

	return {
		closeScreen: () => {
			setScreen(null);
			resetPassword.reset();
		},
		// 포트원 env 미설정이면 호출부가 기존 "웹에서 이용" 안내로 폴백한다.
		isAvailable: isIdentityVerificationConfigured,
		isPending: modal.isModalPending || lookup.isPending,
		isResetPending: resetPassword.isPending,
		// 재설정 실패는 알럿 대신 다이얼로그 안 인라인 문구로만 보여준다.
		resetErrorText: resetPassword.error
			? identityErrorMessage(
					resetPassword.error,
					ACCOUNT_RECOVERY_ERROR_MESSAGES,
					"비밀번호를 변경하지 못했어요. 다시 시도해 주세요."
				)
			: null,
		screen,
		startFindId: () => {
			intentRef.current = "find-id";
			modal.start();
		},
		startResetPassword: () => {
			intentRef.current = "reset-password";
			modal.start();
		},
		submitNewPassword: (newPassword: string) => {
			if (screen?.kind !== "password-form") {
				return;
			}

			resetPassword.mutate({
				identityVerificationId: screen.identityVerificationId,
				newPassword,
			});
		},
		verification: modal.verification,
	};
}
