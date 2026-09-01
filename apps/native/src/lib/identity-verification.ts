// 본인인증(포트원 KCP 인증창) 릴레이 URL 조립·복귀 URL 해석. 인증창은 브라우저 SDK
// 전용이라 앱은 웹의 /app-verify를 시스템 브라우저로 열고, 결과는 앱 스킴 딥링크로
// 돌려받는다. react-native를 import 하지 않아 노드에서 그대로 테스트된다
// (me-settings.ts와 같은 규칙).

// app.json의 scheme이 "bambi-app"이라 별도 네이티브 설정 없이 이 주소로 복귀한다.
// host 없이 "///"로 시작해야 expo-router가 경로를 "me/settings"로 읽는다 —
// "bambi-app://identity"는 host="identity"가 경로가 돼 +not-found로 밀린다.
// 인증을 시작한 화면으로 그대로 돌아오므로 재진입은 사실상 no-op다.
export const IDENTITY_RETURN_URL = "bambi-app:///me/settings";

const TRAILING_SLASHES = /\/+$/;

// 인증 건은 릴레이(피해자 브라우저)가 직접 발급받아 복귀 딥링크로 돌려준다. 앱이 미리
// 발급받아 넘기면 공격자가 자기 인증 건을 남에게 인증시킨 뒤 그 ID로 비밀번호 재설정을
// 호출하는 경로가 열린다 — 그래서 이 URL에는 인증 건을 싣지 않는다.
export const buildIdentityRelayUrl = (webUrl: string): string => {
	const query = new URLSearchParams({ redirect: IDENTITY_RETURN_URL });

	// env가 trailing slash를 달고 올 수 있어 한 번 정리한다.
	return `${webUrl.replace(TRAILING_SLASHES, "")}/app-verify?${query.toString()}`;
};

// 복귀 URL의 세 갈래. 딥링크가 유실되거나(브라우저를 그냥 닫음) 파라미터가 없으면
// unknown이고, 인증 건을 못 받았으므로 호출부는 서버 검증까지 가지 못한다.
export type IdentityReturn =
	| { identityVerificationId: string; status: "verified" }
	| { message: string; status: "failed" }
	| { status: "unknown" };

export const parseIdentityReturnUrl = (
	url: null | string | undefined
): IdentityReturn => {
	if (!url?.startsWith(IDENTITY_RETURN_URL)) {
		return { status: "unknown" };
	}

	// RN의 URL 구현은 커스텀 스킴에 미덥지 않아 쿼리만 떼어 표준 파서에 넘긴다.
	const params = new URLSearchParams(url.split("?")[1] ?? "");
	const code = params.get("code");

	if (code !== null) {
		// 포트원 message는 한국어지만 비어 올 수 있다(사용자가 인증창을 닫은 경우).
		return {
			message: params.get("message") || "인증이 완료되지 않았어요.",
			status: "failed",
		};
	}

	// 정상 복귀에는 정확히 1개만 실려 온다. 2개 이상이면 스머글링(redirect에 심은 값이
	// 릴레이가 붙인 진짜 값보다 앞에 오는 조작)이므로 통째로 버린다.
	const ids = params.getAll("identityVerificationId");

	return ids.length === 1 && ids[0]
		? { identityVerificationId: ids[0], status: "verified" }
		: { status: "unknown" };
};
