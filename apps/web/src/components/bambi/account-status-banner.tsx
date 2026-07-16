"use client";

// 밤비 — 운영자 제재(경고·이용 정지)를 받은 사용자에게 보여주는 안내 배너.
// 계정 상태(bambiProfile.status)와 최신 제재 사유는 auth-client-provider의
// useBambiAuth로 전달된다(별도 알림 시스템 없이 status 값만으로 표시). 정상 계정이거나
// 세션/프로필 로딩 중에는 아무것도 렌더하지 않아 깜빡임을 막는다.
//
// 경고(warned) 배너는 사용자가 X로 닫을 수 있고, 닫음 상태를 localStorage에 저장한다.
// 정지(suspended) 배너는 닫을 수 없이 상시 노출한다.

import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { Button } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import { Ban, TriangleAlert, X } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { APP_CONTENT_WIDTH } from "@/lib/bambi/layout";

type SanctionStatus = "warned" | "suspended";

const SANCTION_COPY: Record<
	SanctionStatus,
	{
		variant: "warning" | "destructive";
		icon: ComponentType;
		title: string;
		description: string;
	}
> = {
	warned: {
		variant: "warning",
		icon: TriangleAlert,
		title: "운영자 경고를 받았어요",
		description:
			"정책 위반 소지가 확인되어 운영자가 경고를 보냈어요. 같은 문제가 반복되면 이용이 제한될 수 있으니 활동 내용을 다시 확인해 주세요.",
	},
	suspended: {
		variant: "destructive",
		icon: Ban,
		title: "계정 이용이 정지되었어요",
		description:
			"정책 위반이 확인되어 공고 등록·지원·채팅 등 일부 이용이 제한되었어요. 정지 사유에 이의가 있으면 고객센터로 문의해 주세요.",
	},
};

// 경고 배너 닫음 상태를 저장하는 localStorage 키.
// 사용자별 + 제재 시각별로 분리해, 같은 경고는 새로고침 후에도 닫혀 있고
// 운영자가 새 경고를 보내(createdAt이 바뀌면) 배너가 다시 뜨게 한다.
// createdAt이 null이면(감사 로그 유실 등) 시각 대신 고정 토큰으로 폴백한다 —
// 이 경우 같은 userId의 재경고를 다시 띄우지 못하지만, 이미 본 경고를 한 번 더
// 안 보여주는 정도의 UX 저하일 뿐(안전 문제 없음)이라 보수적으로 유지한다.
function warnedDismissKey(
	userId: string,
	sanctionCreatedAt: string | null
): string {
	return `bambi:warned-banner-dismissed:${userId}:${sanctionCreatedAt ?? "no-timestamp"}`;
}

export function AccountStatusBanner() {
	const {
		accountStatus,
		accountSanctionReason,
		accountSanctionCreatedAt,
		isPending,
		user,
	} = useBambiAuth();

	// 경고 배너에서만 쓰는 닫음 키(정지 배너는 닫을 수 없어 키가 없다).
	const dismissKey = useMemo(
		() =>
			accountStatus === "warned" && user?.id
				? warnedDismissKey(user.id, accountSanctionCreatedAt)
				: null,
		[accountStatus, user?.id, accountSanctionCreatedAt]
	);

	// localStorage는 렌더 중 직접 읽지 않고 마운트 후 useEffect에서만 읽어
	// SSR/hydration 미스매치를 피한다. 확인 전(dismissChecked=false)에는 경고 배너를
	// 렌더하지 않아 "떴다가 닫히는" 깜빡임도 막는다.
	const [isDismissed, setIsDismissed] = useState(false);
	const [dismissChecked, setDismissChecked] = useState(false);

	useEffect(() => {
		if (!dismissKey) {
			setIsDismissed(false);
			setDismissChecked(true);
			return;
		}
		let dismissed = false;
		try {
			dismissed = window.localStorage.getItem(dismissKey) === "1";
		} catch {
			// localStorage 접근 불가(프라이빗 모드 등) 시 닫지 않은 것으로 본다.
			dismissed = false;
		}
		setIsDismissed(dismissed);
		setDismissChecked(true);
	}, [dismissKey]);

	if (
		isPending ||
		(accountStatus !== "warned" && accountStatus !== "suspended")
	) {
		return null;
	}

	const isWarned = accountStatus === "warned";

	// 경고 배너는 닫힘 확인 전이거나 이미 닫혔으면 렌더하지 않는다(정지 배너는 상시 노출).
	if (isWarned && (!dismissChecked || isDismissed)) {
		return null;
	}

	const copy = SANCTION_COPY[accountStatus];
	const Icon = copy.icon;

	const handleDismiss = () => {
		setIsDismissed(true);
		if (!dismissKey) {
			return;
		}
		try {
			window.localStorage.setItem(dismissKey, "1");
		} catch {
			// localStorage 저장 실패 시 이번 세션 동안만 닫힌 상태로 둔다.
		}
	};

	return (
		// 배너 폭·여백을 헤더 바·본문 콘텐츠와 동일 기준으로 정렬한다.
		// APP_CONTENT_WIDTH(md 이상 min(92%,1120px)) + mx-auto 중앙 정렬 + 본문 지배
		// 패턴과 같은 px-5 md:px-6 좌우 여백. 모바일은 max-w 없이 좌우 여백만 유지.
		<div className={cn("mx-auto w-full px-5 pt-4 md:px-6", APP_CONTENT_WIDTH)}>
			<Alert
				className="items-center gap-x-3 px-3.5 py-3 text-sm"
				variant={copy.variant}
			>
				<Icon />
				<AlertTitle className="font-semibold text-sm">{copy.title}</AlertTitle>
				<AlertDescription className="flex flex-col items-start gap-1.5 text-sm/relaxed">
					<span>{copy.description}</span>
					{accountSanctionReason ? (
						<span className="font-semibold">사유: {accountSanctionReason}</span>
					) : null}
					<span>문의: 고객센터를 통해 조치 내용을 확인할 수 있어요.</span>
				</AlertDescription>
				{isWarned ? (
					// AlertAction은 우상단 절대배치 + 컴포넌트가 pr 여백을 자동 확보해
					// 아이콘+제목+설명 grid 레이아웃을 깨지 않는다. size-8(32px)로 모바일
					// 터치 타깃을 확보하고, amber 톤에 맞춘 hover 색을 준다.
					<AlertAction>
						<Button
							aria-label="경고 안내 닫기"
							className="hover:bg-amber-500/10 hover:text-amber-500"
							onClick={handleDismiss}
							size="icon"
							type="button"
							variant="ghost"
						>
							<X />
						</Button>
					</AlertAction>
				) : null}
			</Alert>
		</div>
	);
}
