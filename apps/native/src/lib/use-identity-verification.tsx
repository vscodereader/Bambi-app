// 앱의 휴대폰 본인인증. 포트원 KCP 인증창을 @portone/react-native-sdk의 인앱
// WebView(<IdentityVerification/>)로 앱 안에서 연다(방안 B) — 브라우저 릴레이·딥링크
// 없이 onComplete 응답을 받아, 성공(code 없음)일 때만 앱 세션으로 verifyMyPhone /
// issueGuestToken을 부른다. 서버는 클라이언트 값을 믿지 않고 포트원 단건조회로 다시
// 확인한다. EXPO_PUBLIC_PORTONE_STORE_ID/CHANNEL_KEY가 둘 다 있어야 열린다(isAvailable).

import type { IdentityVerificationResponse } from "@portone/browser-sdk/v2";
import { useMutation } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

import {
	IdentityVerificationModal,
	isIdentityVerificationConfigured,
} from "@/src/components/identity-verification-modal";
import { saveGuestToken } from "./guest-store";
import { client, orpc, queryClient } from "./orpc";

// oRPC 오류 message에는 영어 기본값이 섞여 있어 코드로 문구를 고른다(me-settings의
// PROFILE_IMAGE_ERROR_MESSAGES와 같은 규칙). 서버가 한국어를 싣는 코드도 뜻이 같아
// 맵으로 덮어도 문구가 어긋나지 않는다.
const IDENTITY_ERROR_MESSAGES: Record<string, string> = {
	BAD_REQUEST: "본인인증이 완료되지 않았어요. 다시 인증해 주세요.",
	CONFLICT: "이미 다른 계정에서 본인인증에 사용된 정보예요.",
	FORBIDDEN: "만 19세 이상만 이용할 수 있어요.",
	NOT_FOUND: "프로필을 찾을 수 없어요.",
	UNAUTHORIZED: "로그인 후 다시 시도해 주세요.",
};

export const identityErrorMessage = (
	error: unknown,
	messages: Record<string, string> = IDENTITY_ERROR_MESSAGES,
	fallback = "본인인증을 마치지 못했어요. 잠시 후 다시 시도해 주세요."
): string => {
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String(error.code)
			: "";

	return messages[code] ?? fallback;
};

// 세 훅이 공유하는(계정복구 포함) 모달 부분: 인증 건 발급 → 성공 시 모달을 열고,
// onComplete에서 PG 실패면 서버를 부르지 않고 PG 문구를 그대로 보여준다. 성공(code 없음)일
// 때만 onVerified에 확정된 인증 건 ID를 넘겨, 최종 mutate만 호출부가 얹는다.
export function useIdentityModal({
	messages,
	onVerified,
}: {
	messages: Record<string, string>;
	onVerified: (identityVerificationId: string) => void;
}) {
	// null이 아니면 모달이 열린다.
	const [verificationId, setVerificationId] = useState<null | string>(null);

	// 인증 건 발급 → 성공하면 그 ID로 모달을 연다.
	const issue = useMutation({
		mutationFn: () => client.bambi.onboarding.startIdentityVerification(),
		onError: (error) => {
			Alert.alert("인증하지 못했어요", identityErrorMessage(error, messages));
		},
		onSuccess: ({ identityVerificationId }) => {
			setVerificationId(identityVerificationId);
		},
	});

	// 인증창을 닫는다. PG 실패(code 있음)면 서버를 부르지 않고 PG 문구를 그대로 보여준다.
	const handleComplete = (response: IdentityVerificationResponse) => {
		const issued = verificationId;
		setVerificationId(null);

		if (response.code != null) {
			Alert.alert(
				"인증하지 못했어요",
				response.message || "인증이 완료되지 않았어요."
			);
			return;
		}

		// SDK는 WebView 안 어떤 페이지든 postMessage·portone://blank로 임의 ID를 onComplete로
		// 올릴 수 있어(originWhitelist=['*']), 응답 ID를 신뢰하지 않는다. 앱이 직접 발급한
		// 건과 정확히 일치할 때만 서버에 넘겨, 공격자가 미리 인증한 ID 주입으로 피해자
		// 프로필을 덮어쓰는 계정 탈취를 막는다(서버 티켓은 세션에 묶여 있지 않다).
		if (!issued || response.identityVerificationId !== issued) {
			Alert.alert(
				"인증하지 못했어요",
				"본인인증이 완료되지 않았어요. 다시 인증해 주세요."
			);
			return;
		}

		onVerified(issued);
	};

	return {
		// 이중 탭 방지 겸 진행 표시(발급 중·모달 열림). 최종 mutate의 pending은 호출부가 더한다.
		isModalPending: issue.isPending || verificationId !== null,
		start: () => issue.mutate(),
		verification: (
			<IdentityVerificationModal
				identityVerificationId={verificationId}
				onCancel={() => setVerificationId(null)}
				onComplete={handleComplete}
			/>
		),
	};
}

export function useIdentityVerification() {
	// 서버 확정 — 포트원 단건조회로 최종 판정하고 인증 상태를 내려준다.
	const verify = useMutation({
		mutationFn: (identityVerificationId: string) =>
			client.bambi.onboarding.verifyMyPhone({ identityVerificationId }),
		onError: (error) => {
			Alert.alert("인증하지 못했어요", identityErrorMessage(error));
		},
		onSuccess: async () => {
			Alert.alert("인증했어요", "휴대폰 본인인증이 완료됐어요.");
			await queryClient.invalidateQueries({
				queryKey: orpc.bambi.onboarding.getMine.key(),
			});
		},
	});

	const modal = useIdentityModal({
		messages: IDENTITY_ERROR_MESSAGES,
		onVerified: (id) => verify.mutate(id),
	});

	return {
		// 포트원 콘솔에서 store/channel을 발급받아 env에 넣기 전까지는 미설정이 정상
		// 경로다 — 이때는 호출부가 기존 "웹에서 이용" 안내를 유지한다.
		isAvailable: isIdentityVerificationConfigured,
		isPending: modal.isModalPending || verify.isPending,
		startIdentityVerification: modal.start,
		verification: modal.verification,
	};
}

// 게스트 맥락의 오류 문구. 코드는 같지만 로그인 전 방문자에게 맞게 문구를 덮어쓴다.
const GUEST_ERROR_MESSAGES: Record<string, string> = {
	BAD_REQUEST: "본인인증이 완료되지 않았어요. 다시 인증해 주세요.",
	FORBIDDEN: "만 19세 이상만 이용할 수 있어요.",
	TOO_MANY_REQUESTS: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
};

// 로그인 없이 본인인증만으로 게스트 토큰을 받아 성인 게이트를 통과한다. 서버가 발급한
// 토큰을 SecureStore에 저장하고 캐시를 비운 뒤 구직자 탭으로 전환한다.
export function useGuestVerification() {
	const issueGuest = useMutation({
		mutationFn: async (identityVerificationId: string) => {
			const { token } = await client.bambi.onboarding.issueGuestToken({
				identityVerificationId,
			});
			await saveGuestToken(token);
			queryClient.clear();
		},
		onError: (error) => {
			Alert.alert(
				"인증하지 못했어요",
				identityErrorMessage(error, GUEST_ERROR_MESSAGES)
			);
		},
		onSuccess: () => {
			// 성공 Alert 없이 바로 화면을 전환한다.
			router.replace("/(seeker)/(tabs)" as Href);
		},
	});

	const modal = useIdentityModal({
		messages: GUEST_ERROR_MESSAGES,
		onVerified: (id) => issueGuest.mutate(id),
	});

	return {
		isAvailable: isIdentityVerificationConfigured,
		isPending: modal.isModalPending || issueGuest.isPending,
		startGuestVerification: modal.start,
		verification: modal.verification,
	};
}
