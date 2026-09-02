// 앱의 휴대폰 본인인증. 인증창(포트원 KCP)은 브라우저 SDK 전용이라 웹의 릴레이
// 라우트(/app-verify)를 시스템 브라우저로 열고, 릴레이가 발급·인증까지 마친 인증 건을
// 딥링크로 돌려받아 앱이 자기 세션으로 verifyMyPhone을 부른다 — 브라우저에는 세션이
// 없고, 클라이언트가 보낸 값도 서버가 포트원 단건조회로 다시 확인한다.

import { env } from "@bambi-app/env/native";
import { useMutation } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { openAuthSessionAsync } from "expo-web-browser";
import { Alert } from "react-native";

import { saveGuestToken } from "./guest-store";
import {
	buildIdentityRelayUrl,
	GUEST_RETURN_URL,
	IDENTITY_RETURN_URL,
	parseIdentityReturnUrl,
} from "./identity-verification";
import { client, orpc, queryClient } from "./orpc";

const WEB_URL = env.EXPO_PUBLIC_WEB_URL;

// 우리가 만든 한국어 문구만 그대로 노출하기 위한 표식. 네트워크 실패(TypeError)나
// openAuthSessionAsync의 "WebBrowser is already open..." 같은 남의 Error는 code가
// 없어도 이 타입이 아니라 아래 한국어 폴백으로 흡수된다.
class IdentityFlowError extends Error {}

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

const identityErrorMessage = (
	error: unknown,
	messages: Record<string, string> = IDENTITY_ERROR_MESSAGES
): string => {
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String(error.code)
			: "";

	return (
		messages[code] ?? "본인인증을 마치지 못했어요. 잠시 후 다시 시도해 주세요."
	);
};

// 릴레이 브라우저를 열어 인증 건 ID를 돌려받는 공용 경로. 인증 건은 릴레이가 자기
// 브라우저에서 발급받아 복귀 딥링크로 돌려준다. 앱이 미리 발급받아 URL로 넘기면 공격자가
// 자기 인증 건을 남에게 인증시킨 뒤 그 ID로 비밀번호 재설정(public)을 호출하는 경로가
// 열린다. 딥링크가 유실되면 인증 건도 같이 잃지만, TTL 30분 뒤 자연 만료라 다시 인증하면
// 그만이다.
const openIdentityRelay = async (returnUrl: string): Promise<string> => {
	if (!WEB_URL) {
		// isAvailable로 버튼을 감추므로 정상 경로에서는 오지 않는다.
		throw new IdentityFlowError("지금은 앱에서 본인인증을 할 수 없어요.");
	}

	const result = await openAuthSessionAsync(
		buildIdentityRelayUrl(WEB_URL, returnUrl),
		returnUrl
	);
	const returned = parseIdentityReturnUrl(
		result.type === "success" ? result.url : null,
		returnUrl
	);

	// cancel·dismiss·딥링크 유실은 전부 unknown이다 — 인증 건이 없어 서버에
	// 물어볼 수도 없다.
	if (returned.status !== "verified") {
		throw new IdentityFlowError(
			returned.status === "failed"
				? returned.message
				: "본인인증을 마치지 못했어요. 다시 시도해 주세요."
		);
	}

	return returned.identityVerificationId;
};

export function useIdentityVerification() {
	const mutation = useMutation({
		mutationFn: async () => {
			const identityVerificationId =
				await openIdentityRelay(IDENTITY_RETURN_URL);
			await client.bambi.onboarding.verifyMyPhone({ identityVerificationId });
		},
		onError: (error) => {
			Alert.alert(
				"인증하지 못했어요",
				// 위에서 우리가 만든 Error는 이미 한국어라 그대로 쓴다.
				error instanceof IdentityFlowError
					? error.message
					: identityErrorMessage(error)
			);
		},
		onSuccess: async () => {
			Alert.alert("인증했어요", "휴대폰 본인인증이 완료됐어요.");
			await queryClient.invalidateQueries({
				queryKey: orpc.bambi.onboarding.getMine.key(),
			});
		},
	});

	return {
		// 웹 배포가 앱보다 먼저라야 해서 미설정 상태가 정상 경로다 — 이때는 호출부가
		// 기존 "웹에서 이용" 안내를 유지한다.
		isAvailable: Boolean(WEB_URL),
		// 이중 탭 방지 겸 진행 표시.
		isPending: mutation.isPending,
		startIdentityVerification: () => mutation.mutate(undefined),
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
	const mutation = useMutation({
		mutationFn: async () => {
			const id = await openIdentityRelay(GUEST_RETURN_URL);
			const { token } = await client.bambi.onboarding.issueGuestToken({
				identityVerificationId: id,
			});
			await saveGuestToken(token);
			queryClient.clear();
		},
		onError: (error) => {
			Alert.alert(
				"인증하지 못했어요",
				error instanceof IdentityFlowError
					? error.message
					: identityErrorMessage(error, GUEST_ERROR_MESSAGES)
			);
		},
		onSuccess: () => {
			// 성공 Alert 없이 바로 화면을 전환한다.
			router.replace("/(seeker)/(tabs)" as Href);
		},
	});

	return {
		isAvailable: Boolean(WEB_URL),
		isPending: mutation.isPending,
		startGuestVerification: () => mutation.mutate(undefined),
	};
}
