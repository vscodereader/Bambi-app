"use client";

// 앱(native)이 시스템 브라우저로 여는 본인인증 릴레이. 포트원 KCP 인증창은 브라우저
// SDK 전용이라 앱에서 직접 띄울 수 없어, 이미 검증된 웹 인증 흐름을 그대로 태우고
// 결과만 앱 스킴으로 돌려준다. 서버 호출은 인증 건 발급뿐이고(공통 훅이 한다), 최종
// 검증(verifyMyPhone)은 앱이 자기 세션으로 하므로 이 라우트는 로그인이 필요 없다.
//
// 인증 건은 반드시 **이 브라우저가** 발급받는다. 앱이 미리 받은 ID를 쿼리로 넘기면,
// 공격자가 자기 ID를 실은 진짜 도메인 링크를 피해자에게 보내 대신 인증시킨 뒤 같은
// ID로 accountRecovery.resetPasswordByIdentity(rateLimitedPublicProcedure, 입력은
// ID + 새 비밀번호뿐)를 호출해 계정을 가져갈 수 있다. 인증 건이 피해자 브라우저와 그
// 사용자의 앱 밖으로 나가지 않게 두는 것이 이 방향의 유일한 방어다.

import { Button } from "@bambi-app/ui/components/button";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { usePortOneVerification } from "@/components/bambi/use-portone-verification";

// 복귀 주소는 앱 스킴만 허용한다. 공개 라우트라 이 검사가 없으면 임의 URL로 튕겨 주는
// 오픈 리디렉터가 된다.
const APP_SCHEME = "bambi-app://";

const returnToApp = (redirect: string, params: Record<string, string>) => {
	// 성공(onVerified)·실패 양쪽이 이 함수로만 복귀하므로 스킴 검사도 여기서 한다.
	// redirect가 비면 상대 이동(?query)이 되어 같은 페이지가 무한 재로드된다.
	if (!redirect.startsWith(APP_SCHEME)) {
		return;
	}
	const query = new URLSearchParams(params).toString();

	window.location.href = `${redirect}${redirect.includes("?") ? "&" : "?"}${query}`;
};

export function AppVerifyRelay() {
	const searchParams = useSearchParams();
	const redirect = searchParams.get("redirect") ?? "";
	const isValidRequest = redirect.startsWith(APP_SCHEME);

	const { isConfigured, isVerifying, startVerification } =
		usePortOneVerification({
			// 이 화면의 인증 진입점은 하나뿐이다.
			intent: "app-verify",
			onVerified: (verifiedId) =>
				returnToApp(redirect, { identityVerificationId: verifiedId }),
		});

	// 실패 복귀만 우리가 앱에 알린다(훅은 toast만 띄우고 멈춘다). 성공 복귀는 훅의
	// onVerified가 받는다. 인증창을 여는 것은 아래 버튼(사용자 제스처)뿐이라, 링크를
	// 한 번 여는 것만으로 KCP 창이 뜨지는 않는다.
	const relayedFailure = useRef(false);
	useEffect(() => {
		const code = searchParams.get("code");

		if (relayedFailure.current || !isValidRequest || code === null) {
			return;
		}
		relayedFailure.current = true;
		returnToApp(redirect, {
			code,
			message: searchParams.get("message") ?? "",
		});
	}, [isValidRequest, redirect, searchParams]);

	let message = "앱으로 돌아가려면 인증을 끝까지 마쳐 주세요.";

	if (!isValidRequest) {
		message = "잘못된 접근이에요. 앱에서 다시 시도해 주세요.";
	} else if (!isConfigured) {
		message = "본인인증이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.";
	}

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
			<p className="text-center text-muted-foreground text-sm">{message}</p>
			{isValidRequest && isConfigured ? (
				<Button disabled={isVerifying} onClick={startVerification}>
					{isVerifying ? "인증 중" : "휴대폰 본인인증 시작"}
				</Button>
			) : null}
		</main>
	);
}
