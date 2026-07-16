"use client";

// 밤비 — 운영자 제재(경고·이용 정지)를 받은 사용자에게 보여주는 안내 배너.
// 계정 상태(bambiProfile.status)와 최신 제재 사유는 auth-client-provider의
// useBambiAuth로 전달된다(별도 알림 시스템 없이 status 값만으로 표시). 정상 계정이거나
// 세션/프로필 로딩 중에는 아무것도 렌더하지 않아 깜빡임을 막는다.

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { Ban, TriangleAlert } from "lucide-react";
import type { ComponentType } from "react";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";

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

export function AccountStatusBanner() {
	const { accountStatus, accountSanctionReason, isPending } = useBambiAuth();

	if (
		isPending ||
		(accountStatus !== "warned" && accountStatus !== "suspended")
	) {
		return null;
	}

	const copy = SANCTION_COPY[accountStatus];
	const Icon = copy.icon;

	return (
		<div className="px-4 pt-4 md:px-6">
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
			</Alert>
		</div>
	);
}
