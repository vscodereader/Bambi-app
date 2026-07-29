"use client";

// 포트원 V2 본인인증(인증창 방식). 공개 키(NEXT_PUBLIC_PORTONE_*)가 구성되면 KCP
// 인증창을 띄우고, 없으면(개발 환경) 기존 목 폼으로 폴백한다. 인증창 방식이라 이름·
// 주민번호는 KCP 창에 직접 입력되고 우리 시스템은 identityVerificationId만 다룬다 —
// 서버(/api/guest 또는 onboarding.verifyMyPhone)가 포트원 단건조회로 진위·연령을 검증한다.

import { env } from "@bambi-app/env/web";
import { requestIdentityVerification } from "@portone/browser-sdk/v2";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { BambiGenderValue, MockPhoneVerifyInput } from "@/lib/bambi/guest";
import { client } from "@/utils/orpc";
import { Button } from "./ds";
import { PhoneIcon } from "./icons";
import { MockPhoneVerifyDialog } from "./mock-phone-verify-dialog";

type ButtonVariant = ComponentProps<typeof Button>["variant"];
type ButtonSize = ComponentProps<typeof Button>["size"];

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

interface PhoneVerifyDialogProps {
	// 트리거 버튼에 덧입힐 클래스. 호출 화면의 위계에 맞춰 글로우를 끄는 등의 조정에 쓴다.
	className?: string;
	// 목 폴백 폼의 성별 선택 초기값(실인증에서는 인증 결과가 성별을 결정하므로 미사용).
	defaultGender?: BambiGenderValue | null;
	description?: string;
	// 같은 화면에 인증 버튼이 둘 이상일 때 각 버튼을 구분하는 값. 모바일 리디렉션 복귀를
	// 시작한 버튼만 처리하도록 하는 데 쓴다. 버튼이 하나뿐이면 넘기지 않아도 된다.
	intent?: string;
	// 목 폴백에서 인증 성공 시 저장을 담당할 콜백. 미제공 시 게스트 쿠키 흐름.
	onMockVerified?: (input: MockPhoneVerifyInput) => Promise<void> | void;
	// 실인증 성공 시 저장을 담당할 콜백(회원 흐름). 미제공 시 게스트 쿠키 흐름(/api/guest).
	onVerified?: (identityVerificationId: string) => Promise<void> | void;
	// 트리거 버튼 크기. 한 화면에 인증 버튼이 둘일 때 위계를 크기로도 구분한다.
	size?: ButtonSize;
	title?: string;
	triggerLabel?: string;
	variant?: ButtonVariant;
}

export function PhoneVerifyDialog({
	className,
	defaultGender = null,
	description,
	intent = "",
	onMockVerified,
	onVerified,
	size,
	title,
	triggerLabel = "휴대폰 인증",
	variant = "secondary",
}: PhoneVerifyDialogProps = {}) {
	const storeId = env.NEXT_PUBLIC_PORTONE_STORE_ID;
	const channelKey = env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;

	if (!(storeId && channelKey)) {
		return (
			<MockPhoneVerifyDialog
				className={className}
				defaultGender={defaultGender}
				description={description}
				onVerified={onMockVerified}
				size={size}
				title={title}
				triggerLabel={triggerLabel}
				variant={variant}
			/>
		);
	}

	return (
		<PortOneVerifyButton
			channelKey={channelKey}
			className={className}
			intent={intent}
			onVerified={onVerified}
			size={size}
			storeId={storeId}
			triggerLabel={triggerLabel}
			variant={variant}
		/>
	);
}

function PortOneVerifyButton({
	channelKey,
	className,
	intent,
	onVerified,
	size,
	storeId,
	triggerLabel,
	variant,
}: {
	channelKey: string;
	className?: string;
	intent: string;
	onVerified?: (identityVerificationId: string) => Promise<void> | void;
	size?: ButtonSize;
	storeId: string;
	triggerLabel: string;
	variant: ButtonVariant;
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
		// 인증을 시작한 버튼만 결과를 처리한다. 기록이 아예 없으면(스토리지 차단 등)
		// 종전처럼 처리해 인증 결과가 통째로 유실되는 일은 없게 한다.
		const startedIntent = readVerifyIntent();
		if (startedIntent !== null && startedIntent !== intent) {
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
	}, [searchParams, pathname, router, handleVerified, intent]);

	const startVerification = async () => {
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
			className={className}
			disabled={isVerifying}
			leftIcon={<PhoneIcon />}
			onClick={() => {
				startVerification().catch(() => undefined);
			}}
			size={size}
			variant={variant}
		>
			{isVerifying ? "인증 중" : triggerLabel}
		</Button>
	);
}
