"use client";

// 포트원 V2 본인인증(인증창 방식)의 공통 훅. "서버에서 인증건 발급 → 인증창 호출 →
// 모바일 리디렉션 복귀 처리"까지가 이 훅의 책임이고, 인증 결과(identityVerificationId)로
// 무엇을 할지는 전적으로 호출부(onVerified)가 정한다.
// 인증창 방식이라 이름·주민번호는 KCP 창에 직접 입력되고 우리 시스템은
// identityVerificationId만 다룬다 — 서버가 포트원 단건조회로 진위·연령을 검증한다.

import { env } from "@bambi-app/env/web";
import { requestIdentityVerification } from "@portone/browser-sdk/v2";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getPortOneReturnUrl } from "@/lib/bambi/portone-verification-return";
import { client } from "@/utils/orpc";

// 한 화면에 인증 버튼이 여럿이면(예: "본인인증하고 계속하기" / "비회원으로 둘러보기")
// 모바일 리디렉션 복귀 시 모든 인스턴스가 같은 인증 건을 동시에 처리해 사용자의 의도가
// 뒤섞인다. 인증창을 여는 순간 어떤 버튼이 시작했는지 적어 두고, 복귀 처리는 그 버튼만
// 하게 한다. 값은 "지우지" 않고 다음 인증 시작 때 덮어쓴다 — 처리 도중 지우면 같은
// 렌더에서 뒤늦게 도는 다른 인스턴스가 "기록 없음"으로 보고 폴백 처리해 버린다.
const VERIFY_INTENT_KEY = "bambi:phone-verify-intent";

const readVerifyIntent = (): string | null => {
	try {
		return window.sessionStorage.getItem(VERIFY_INTENT_KEY);
	} catch {
		// 스토리지가 막힌 환경에서는 기록이 없는 것으로 보고 종전 동작을 유지한다.
		return null;
	}
};

const writeVerifyIntent = (intent: string) => {
	try {
		window.sessionStorage.setItem(VERIFY_INTENT_KEY, intent);
	} catch {
		// 기록에 실패해도 인증 자체는 진행한다(복귀 처리는 종전대로 폴백).
	}
};

interface UsePortOneVerificationOptions {
	// 같은 화면에 인증 진입점이 둘 이상일 때 각각을 구분하는 값. 모바일 리디렉션 복귀를
	// 시작한 진입점만 결과를 처리하게 하는 데 쓴다. 진입점이 하나뿐이면 ""로 둬도 된다.
	intent: string;
	// 인증 성공 시 결과를 넘겨받아 처리하는 콜백. 실패는 훅이 toast로 안내한다.
	onVerified: (identityVerificationId: string) => Promise<void> | void;
}

export function usePortOneVerification({
	intent,
	onVerified,
}: UsePortOneVerificationOptions) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isVerifying, setIsVerifying] = useState(false);

	const storeId = env.NEXT_PUBLIC_PORTONE_STORE_ID;
	const channelKey = env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;
	// 훅은 조건부로 호출될 수 없으므로 미구성 환경에서도 훅 자체는 정상적으로 돈다.
	// 구성 여부는 값으로만 알려 주고, 실제 차단은 startVerification·복귀 처리에서 한다.
	const isConfigured = Boolean(storeId && channelKey);

	// 호출부가 렌더마다 새 함수를 넘겨도 아래 복귀 처리 useEffect가 재실행되지 않도록
	// ref에 최신 콜백만 붙들어 둔다(의존성에 콜백을 넣으면 무한 루프가 난다).
	const onVerifiedRef = useRef(onVerified);
	useEffect(() => {
		onVerifiedRef.current = onVerified;
	});

	const handleVerified = useCallback(async (identityVerificationId: string) => {
		setIsVerifying(true);
		try {
			await onVerifiedRef.current(identityVerificationId);
		} catch (error) {
			toast.error(
				error instanceof Error && error.message
					? error.message
					: "인증에 실패했어요. 다시 시도해 주세요."
			);
		} finally {
			setIsVerifying(false);
		}
	}, []);

	// 모바일에서는 인증창이 리디렉션 방식으로 떠서 결과가 쿼리스트링으로 돌아온다
	// (identityVerificationId, 실패 시 code/message). 복귀 시 한 번만 처리하고 쿼리를
	// 지워 새로고침 재처리를 막는다.
	const handledRedirect = useRef(false);
	useEffect(() => {
		if (!isConfigured) {
			return;
		}
		if (handledRedirect.current) {
			return;
		}
		const identityVerificationId = searchParams.get("identityVerificationId");
		if (!identityVerificationId) {
			return;
		}
		// 인증을 시작한 진입점만 결과를 처리한다. 기록이 아예 없으면(스토리지 차단 등)
		// 종전처럼 처리해 인증 결과가 통째로 유실되는 일은 없게 한다.
		const startedIntent = readVerifyIntent();
		if (startedIntent !== null && startedIntent !== intent) {
			return;
		}
		handledRedirect.current = true;
		const code = searchParams.get("code");
		const message = searchParams.get("message");
		// 모바일 인증 결과 파라미터만 지운다. `router.replace(pathname)`로 전체 쿼리를
		// 버리면 `auth=signup`까지 사라져 AuthPanel이 로그인 폼으로 재생성된다.
		router.replace(getPortOneReturnUrl(pathname, searchParams) as Route);
		if (code !== null) {
			toast.error(message || "인증이 완료되지 않았어요.");
			return;
		}
		handleVerified(identityVerificationId).catch(() => undefined);
	}, [searchParams, pathname, router, handleVerified, intent, isConfigured]);

	const startVerification = useCallback(() => {
		if (!(storeId && channelKey)) {
			toast.error("본인인증이 구성되지 않았어요.");
			return;
		}
		const run = async () => {
			setIsVerifying(true);
			try {
				// 인증 건 ID는 서버가 발급한다(발급 시각 기록 → 재사용·유효시간 검증의 근거).
				// 모바일은 인증창이 뜨는 순간 페이지가 통째로 떠나므로 발급은 반드시 그 전에
				// 끝나야 한다 — await로 먼저 받아 둔다.
				const { identityVerificationId } =
					await client.bambi.onboarding.startIdentityVerification();
				// 인증창을 열기 직전에 기록한다. 모바일은 여기서 페이지가 통째로 떠나므로
				// 이 뒤의 코드는 실행되지 않고, 복귀 후 이 값이 처리 주체를 가린다.
				writeVerifyIntent(intent);
				const response = await requestIdentityVerification({
					channelKey,
					identityVerificationId,
					redirectUrl: window.location.href,
					storeId,
					// windowType 미지정 시 PG 기본 창 방식(리디렉션)이라 현재 탭이 통째로
					// 이동한다. PC는 팝업 새 창으로 띄우고, 모바일은 팝업 차단이 흔해
					// 리디렉션을 유지한다(복귀 처리는 위 useEffect가 담당).
					windowType: { pc: "POPUP", mobile: "REDIRECTION" },
					popup: { center: true },
				});
				// 인증창이 정상 완료되지 못한 경우에만 code가 실린다.
				if (response?.code !== undefined) {
					toast.error(response.message || "인증이 완료되지 않았어요.");
					return;
				}
				await onVerifiedRef.current(identityVerificationId);
			} catch (error) {
				toast.error(
					error instanceof Error && error.message
						? error.message
						: "인증창을 여는 데 실패했어요. 잠시 후 다시 시도해 주세요."
				);
			} finally {
				setIsVerifying(false);
			}
		};
		run().catch(() => undefined);
		// storeId·channelKey는 모듈 상수(env)라 의존성에 넣지 않는다.
	}, [intent]);

	return { isConfigured, isVerifying, startVerification };
}
