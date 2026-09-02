// 회원가입 2단계 오케스트레이션(웹 auth-panel.tsx와 동일한 본인인증 → 정보 입력).
// 로그인 화면의 "회원가입"이 /signup으로 push하고, 화면은 이 훅으로 단계를 다룬다.
//
// 웹과 의도적으로 다른 단순화(ponytail):
// - issueGuestToken(웹 postGuestVerification)은 부르지 않는다. gender는 createProfile에
//   identityVerificationId만 넘기면 서버(onboarding.ts의 identity?.gender ?? gender)가
//   파생 저장하므로 클라가 gender를 다루지 않고, 가입 중 게스트 열람권도 필요 없다.
// - 세션 가드(login.tsx의 Redirect)를 signup 화면에 복제하지 않는다. signUp 성공 시
//   세션이 즉시 truthy가 되는데 가드가 있으면 프로필 생성 전에 화면이 언마운트된다.
//   대신 여기서 signUp → createProfile → recordLegalConsent를 순차 await로 끝낸 뒤
//   마지막에 명시적으로 router.replace("/")를 부른다(index.tsx가 role 홈을 계산).

import { env } from "@bambi-app/env/native";
import { useMutation } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { useRef, useState } from "react";
import { Alert } from "react-native";

import { authClient } from "@/lib/auth-client";
import { isIdentityVerificationConfigured } from "@/src/components/identity-verification-modal";
import { type SignupSubmitValues, validateSignupInput } from "./bambi-native";
import { clearGuestToken } from "./guest-store";
import { client, queryClient } from "./orpc";
import {
	identityErrorMessage,
	useIdentityModal,
} from "./use-identity-verification";

// 회원가입은 본인인증(포트원)과 약관·처리방침 링크용 웹 base URL이 둘 다 있어야 연다 —
// WEB_URL이 없으면 사용자가 못 읽는 법적 문서에 동의시키게 되므로 진입 자체를 막는다.
// 모듈 상수다(env는 빌드 타임 인라인): 로그인 화면의 진입 분기·signup 진입 폴백이 공유한다.
export const isSignupAvailable =
	isIdentityVerificationConfigured && Boolean(env.EXPO_PUBLIC_WEB_URL);

// 역할에 맞는 프로필을 만든다. verifiedId를 넘기면 서버가 성별 등을 인증 건에서 파생 저장한다.
async function createProfileForRole(
	role: SignupSubmitValues["role"],
	verifiedId: null | string
): Promise<void> {
	const payload = verifiedId ? { identityVerificationId: verifiedId } : {};
	if (role === "employer") {
		await client.bambi.onboarding.createEmployerProfile(payload);
	} else {
		await client.bambi.onboarding.createJobSeekerProfile(payload);
	}
}

// signUp.email 한 번 호출. 성공이면 null, 실패면 오류 문구.
async function runSignUp(values: SignupSubmitValues): Promise<null | string> {
	let errorText: null | string = null;
	let signedUp = false;
	await authClient.signUp.email(
		{
			email: values.email,
			name: values.nickname,
			password: values.password,
			username: values.username.trim(),
		},
		{
			onError(ctx: { error: { message?: string; statusText?: string } }) {
				errorText =
					ctx.error.message ??
					ctx.error.statusText ??
					"요청을 처리하지 못했어요.";
			},
			onSuccess() {
				signedUp = true;
			},
		}
	);
	return signedUp ? null : (errorText ?? "회원가입에 실패했어요.");
}

// 프로필 생성 실패 시 문구와 1단계 복귀 여부. BAD_REQUEST는 인증 건 만료 —
// 재인증만 하면 풀리므로 되돌린다(계정이 이미 만들어진 재제출이면 그 사실을 알린다).
// CONFLICT(타 계정 CI 충돌)는 재인증해도 같은 사람이라 못 풀리므로 되돌리지 않는다.
// oRPC 오류의 code 문자열(없으면 ""). CONFLICT 판별·아래 문구 분기 공용.
function errorCode(error: unknown): string {
	return typeof error === "object" && error !== null && "code" in error
		? String((error as { code: unknown }).code)
		: "";
}

function mapProfileError(
	error: unknown,
	alreadySignedUp: boolean
): { message: string; resetToVerify: boolean } {
	const code = errorCode(error);
	return {
		message:
			alreadySignedUp && code === "BAD_REQUEST"
				? "계정은 만들어졌지만 본인인증이 만료됐어요. 다시 인증해 주세요."
				: identityErrorMessage(
						error,
						undefined,
						"회원가입을 마치지 못했어요. 잠시 후 다시 시도해 주세요."
					),
		resetToVerify: code === "BAD_REQUEST",
	};
}

export function useSignup() {
	const [step, setStep] = useState<"form" | "verify">("verify");
	// 본인인증에서 확정된 인증 건 ID. 폼 제출 시 createProfile로 넘겨 서버가 성별 등을
	// 파생 저장하게 한다.
	const verifiedIdRef = useRef<null | string>(null);
	// signUp.email 200 이후를 기억한다 — 프로필 생성만 실패해 재제출하면 signUp을
	// 건너뛰어야 한다(안 그러면 USER_ALREADY_EXISTS로 영구 막힘).
	const signedUpRef = useRef(false);
	// signUp 성공 후 화면 이탈을 막는 가드 상태(signup.tsx의 beforeRemove·Stack.Screen).
	// 프로필 생성이 실패해도 계정은 이미 존재하므로, 사용자가 화면을 떠나면 재시도 경로가
	// 사라진다 — 이탈을 막아 같은 화면에서 다시 제출하게 한다.
	const [isSignedUp, setIsSignedUp] = useState(false);
	// 성공 확정 직전에 true로 세운다 — 위 이탈 가드가 가입 완료 내비게이션 자체를 막지
	// 않도록 하는 통과 신호(state가 아니라 ref여야 이벤트 시점 값을 즉시 읽는다).
	const doneRef = useRef(false);
	const [isSubmitPending, setIsSubmitPending] = useState(false);

	const check = useMutation({
		mutationFn: (id: string) =>
			client.bambi.onboarding.checkIdentityForSignup({
				identityVerificationId: id,
			}),
		onError: (error) =>
			Alert.alert("인증하지 못했어요", identityErrorMessage(error)),
		onSuccess: (result, id) => {
			if (result.hasAccount) {
				Alert.alert(
					"이미 가입된 계정이 있어요",
					"이미 가입된 계정이 있어요. 로그인해 주세요.",
					[{ onPress: () => router.back(), text: "로그인" }]
				);
				return;
			}
			verifiedIdRef.current = id;
			setStep("form");
		},
	});

	// messages: {} → identityErrorMessage의 기본맵/폴백 경로가 처리한다(발급 오류용).
	const modal = useIdentityModal({
		messages: {},
		onVerified: (id) => check.mutate(id),
	});

	const submit = async (values: SignupSubmitValues): Promise<null | string> => {
		const validationError = validateSignupInput(values);
		if (validationError) {
			return validationError;
		}
		setIsSubmitPending(true);
		// signUp이 이미 끝난 뒤의 재제출인지(프로필 생성만 실패했던 경우) 판별.
		const isResubmit = signedUpRef.current;
		try {
			if (!signedUpRef.current) {
				const signUpError = await runSignUp(values);
				if (signUpError) {
					return signUpError;
				}
				signedUpRef.current = true;
				// 계정이 만들어졌으니 화면 이탈 가드를 켠다.
				setIsSignedUp(true);
			}
			// 재제출이면 앞선 시도에서 프로필이 이미 커밋됐을 수 있다(응답만 유실) —
			// getMine으로 확인하고 있으면 createProfile을 건너뛴다. 있는데 또 부르면 서버가
			// CONFLICT를 던져 "타 계정 인증 정보"로 오안내된다. getMine은 protectedProcedure라
			// signUp 200 뒤 세션 쿠키로 호출 가능하고, 첫 제출 경로에선 왕복을 아끼려 부르지 않는다.
			const hasProfile = isResubmit
				? Boolean((await client.bambi.onboarding.getMine()).bambiProfile)
				: false;
			if (!hasProfile) {
				await createProfileForRole(values.role, verifiedIdRef.current);
			}
			await client.bambi.onboarding.recordLegalConsent().catch(() => undefined);
			await clearGuestToken().catch(() => undefined);
		} catch (error) {
			// CONFLICT(타 계정과 CI 충돌)는 재인증해도 같은 사람이라 되풀이될 뿐 못 푼다 —
			// 이 화면에 갇히지 않도록 회복 불가로 보고 로그인으로 돌려보낸다. 이때 만들어진
			// 고아 계정의 세션을 반드시 끊는다(안 끊으면 login이 세션을 보고 홈→index→
			// onboarding으로 되돌아가 재인증해도 또 CONFLICT다). doneRef를 먼저 세워야
			// 이탈 가드(beforeRemove)가 이 이동을 막지 않는다.
			if (errorCode(error) === "CONFLICT") {
				await authClient.signOut().catch(() => undefined);
				queryClient.clear();
				doneRef.current = true;
				setIsSignedUp(false);
				Alert.alert(
					"이미 가입된 계정이 있어요",
					"이미 가입된 계정이 있어요. 로그인해 주세요.",
					[{ onPress: () => router.back(), text: "로그인" }]
				);
				return null;
			}
			// 프로필 생성 실패(예: 인증 건 30분 만료)·네트워크 오류.
			const mapped = mapProfileError(error, signedUpRef.current);
			if (mapped.resetToVerify) {
				// 폼 state는 살아 있어 재인증 후 재제출 시 값이 유지된다.
				verifiedIdRef.current = null;
				setStep("verify");
			}
			return mapped.message;
		} finally {
			setIsSubmitPending(false);
		}
		// 성공 확정 — 내비게이션은 try 밖에서 한다. try 안에 두면 dismissAll/replace 예외까지
		// mapProfileError로 매핑돼 프로필이 이미 있는데도 CONFLICT 재제출 경로로 샌다.
		// doneRef를 먼저 세워 이탈 가드(beforeRemove)를 통과시킨 뒤 이동한다.
		doneRef.current = true;
		queryClient.clear();
		// login이 스택 아래에 남으면 홈에서 뒤로가기 시 노출된다 — 스택을 비운다.
		router.dismissAll();
		router.replace("/" as Href);
		return null;
	};

	return {
		doneRef,
		isAvailable: isSignupAvailable,
		isSignedUp,
		isSubmitPending,
		isVerifyPending: modal.isModalPending || check.isPending,
		startVerification: modal.start,
		step,
		submit,
		verification: modal.verification,
	};
}
