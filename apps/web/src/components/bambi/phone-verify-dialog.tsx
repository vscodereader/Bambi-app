"use client";

// 포트원 V2 본인인증(인증창 방식). 공개 키(NEXT_PUBLIC_PORTONE_*)가 구성되면 KCP
// 인증창을 띄우고, 없으면(개발 환경) 기존 목 폼으로 폴백한다. 인증창 방식이라 이름·
// 주민번호는 KCP 창에 직접 입력되고 우리 시스템은 identityVerificationId만 다룬다 —
// 서버(/api/guest 또는 onboarding.verifyMyPhone)가 포트원 단건조회로 진위·연령을 검증한다.

import { env } from "@bambi-app/env/web";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { BambiGenderValue, MockPhoneVerifyInput } from "@/lib/bambi/guest";
import { Button } from "./ds";
import { PhoneIcon } from "./icons";
import { MockPhoneVerifyDialog } from "./mock-phone-verify-dialog";

// npm 의존성 없이 공식 CDN 스크립트를 지연 로드한다(라이브러리 추가 금지 정책).
const PORTONE_SDK_URL = "https://cdn.portone.io/v2/browser-sdk.js";

interface PortOneIdentityVerificationResponse {
	code?: string;
	identityVerificationId?: string;
	message?: string;
}

interface PortOneSdk {
	requestIdentityVerification: (request: {
		channelKey: string;
		identityVerificationId: string;
		redirectUrl: string;
		storeId: string;
	}) => Promise<PortOneIdentityVerificationResponse | undefined>;
}

declare global {
	interface Window {
		PortOne?: PortOneSdk;
	}
}

let sdkPromise: null | Promise<PortOneSdk> = null;

const loadPortOneSdk = (): Promise<PortOneSdk> => {
	if (window.PortOne) {
		return Promise.resolve(window.PortOne);
	}
	sdkPromise ??= new Promise<PortOneSdk>((resolve, reject) => {
		const script = document.createElement("script");
		script.src = PORTONE_SDK_URL;
		script.onload = () => {
			if (window.PortOne) {
				resolve(window.PortOne);
			} else {
				reject(new Error("포트원 SDK를 불러오지 못했어요."));
			}
		};
		script.onerror = () => {
			sdkPromise = null;
			reject(new Error("포트원 SDK를 불러오지 못했어요."));
		};
		document.head.appendChild(script);
	});
	return sdkPromise;
};

interface PhoneVerifyDialogProps {
	// 목 폴백 폼의 성별 선택 초기값(실인증에서는 인증 결과가 성별을 결정하므로 미사용).
	defaultGender?: BambiGenderValue | null;
	description?: string;
	// 목 폴백에서 인증 성공 시 저장을 담당할 콜백. 미제공 시 게스트 쿠키 흐름.
	onMockVerified?: (input: MockPhoneVerifyInput) => Promise<void> | void;
	// 실인증 성공 시 저장을 담당할 콜백(회원 흐름). 미제공 시 게스트 쿠키 흐름(/api/guest).
	onVerified?: (identityVerificationId: string) => Promise<void> | void;
	title?: string;
	triggerLabel?: string;
}

export function PhoneVerifyDialog({
	defaultGender = null,
	description,
	onMockVerified,
	onVerified,
	title,
	triggerLabel = "휴대폰 인증",
}: PhoneVerifyDialogProps = {}) {
	const storeId = env.NEXT_PUBLIC_PORTONE_STORE_ID;
	const channelKey = env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;

	if (!(storeId && channelKey)) {
		return (
			<MockPhoneVerifyDialog
				defaultGender={defaultGender}
				description={description}
				onVerified={onMockVerified}
				title={title}
				triggerLabel={triggerLabel}
			/>
		);
	}

	return (
		<PortOneVerifyButton
			channelKey={channelKey}
			onVerified={onVerified}
			storeId={storeId}
			triggerLabel={triggerLabel}
		/>
	);
}

function PortOneVerifyButton({
	channelKey,
	onVerified,
	storeId,
	triggerLabel,
}: {
	channelKey: string;
	onVerified?: (identityVerificationId: string) => Promise<void> | void;
	storeId: string;
	triggerLabel: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isVerifying, setIsVerifying] = useState(false);

	// onVerified 미제공 시의 기본 동작: 게스트 인증(/api/guest) 후 공고 화면으로 이동.
	const completeVerification = useCallback(
		async (identityVerificationId: string) => {
			if (onVerified) {
				await onVerified(identityVerificationId);
				return;
			}
			const response = await fetch("/api/guest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ identityVerificationId }),
			});
			if (!response.ok) {
				const data = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				throw new Error(
					data?.message ?? "인증 처리에 실패했어요. 다시 시도해 주세요."
				);
			}
			router.push("/seeker" as Route);
			router.refresh();
		},
		[onVerified, router]
	);

	const handleVerified = useCallback(
		async (identityVerificationId: string) => {
			setIsVerifying(true);
			try {
				await completeVerification(identityVerificationId);
			} catch (error) {
				toast.error(
					error instanceof Error && error.message
						? error.message
						: "인증에 실패했어요. 다시 시도해 주세요."
				);
			} finally {
				setIsVerifying(false);
			}
		},
		[completeVerification]
	);

	// 모바일에서는 인증창이 리디렉션 방식으로 떠서 결과가 쿼리스트링으로 돌아온다
	// (identityVerificationId, 실패 시 code/message). 복귀 시 한 번만 처리하고 쿼리를
	// 지워 새로고침 재처리를 막는다.
	const handledRedirect = useRef(false);
	useEffect(() => {
		if (handledRedirect.current) {
			return;
		}
		const identityVerificationId = searchParams.get("identityVerificationId");
		if (!identityVerificationId) {
			return;
		}
		handledRedirect.current = true;
		const code = searchParams.get("code");
		const message = searchParams.get("message");
		router.replace(pathname as Route);
		if (code !== null) {
			toast.error(message || "인증이 완료되지 않았어요.");
			return;
		}
		handleVerified(identityVerificationId).catch(() => undefined);
	}, [searchParams, pathname, router, handleVerified]);

	const startVerification = async () => {
		setIsVerifying(true);
		try {
			const portone = await loadPortOneSdk();
			const identityVerificationId = `iv-${crypto.randomUUID()}`;
			const response = await portone.requestIdentityVerification({
				channelKey,
				identityVerificationId,
				redirectUrl: window.location.href,
				storeId,
			});
			// 인증창이 정상 완료되지 못한 경우에만 code가 실린다.
			if (response?.code !== undefined) {
				toast.error(response.message || "인증이 완료되지 않았어요.");
				return;
			}
			await completeVerification(identityVerificationId);
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

	return (
		<Button
			block
			disabled={isVerifying}
			leftIcon={<PhoneIcon />}
			onClick={() => {
				startVerification().catch(() => undefined);
			}}
			variant="secondary"
		>
			{isVerifying ? "인증 중" : triggerLabel}
		</Button>
	);
}
