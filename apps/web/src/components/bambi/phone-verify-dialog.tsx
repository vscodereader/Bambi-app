"use client";

// 포트원 V2 본인인증(인증창 방식). 공개 키(NEXT_PUBLIC_PORTONE_*)가 구성되면 KCP
// 인증창을 띄우고, 없으면(개발 환경) 기존 목 폼으로 폴백한다. 인증창 방식이라 이름·
// 주민번호는 KCP 창에 직접 입력되고 우리 시스템은 identityVerificationId만 다룬다 —
// 서버(/api/guest 또는 onboarding.verifyMyPhone)가 포트원 단건조회로 진위·연령을 검증한다.

import { env } from "@bambi-app/env/web";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import type { BambiGenderValue, MockPhoneVerifyInput } from "@/lib/bambi/guest";
import { Button } from "./ds";
import { PhoneIcon } from "./icons";
import { MockPhoneVerifyDialog } from "./mock-phone-verify-dialog";
import { usePortOneVerification } from "./use-portone-verification";

type ButtonVariant = ComponentProps<typeof Button>["variant"];
type ButtonSize = ComponentProps<typeof Button>["size"];

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
			className={className}
			intent={intent}
			onVerified={onVerified}
			size={size}
			triggerLabel={triggerLabel}
			variant={variant}
		/>
	);
}

function PortOneVerifyButton({
	className,
	intent,
	onVerified,
	size,
	triggerLabel,
	variant,
}: {
	className?: string;
	intent: string;
	onVerified?: (identityVerificationId: string) => Promise<void> | void;
	size?: ButtonSize;
	triggerLabel: string;
	variant: ButtonVariant;
}) {
	const router = useRouter();

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

	const { isVerifying, startVerification } = usePortOneVerification({
		intent,
		onVerified: completeVerification,
	});

	return (
		<Button
			block
			className={className}
			disabled={isVerifying}
			leftIcon={<PhoneIcon />}
			onClick={startVerification}
			size={size}
			variant={variant}
		>
			{isVerifying ? "인증 중" : triggerLabel}
		</Button>
	);
}
