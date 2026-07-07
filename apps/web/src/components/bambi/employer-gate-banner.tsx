"use client";

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { buttonVariants } from "@bambi-app/ui/components/button";
import type { Route } from "next";
import Link from "next/link";

import { useEmployerApproval } from "@/components/bambi/employer-approval-context";

const getGateTitle = (status: "none" | "pending" | "rejected"): string => {
	if (status === "pending") {
		return "운영자 승인 대기 중";
	}

	if (status === "rejected") {
		return "업체 인증이 반려되었습니다";
	}

	return "업체 정보 등록이 필요합니다";
};

const getGateDescription = (
	status: "none" | "pending" | "rejected",
	action: string
): string => {
	if (status === "pending") {
		return `${action}하려면 운영자 승인이 완료되어야 합니다.`;
	}

	if (status === "rejected") {
		return `반려 사유를 확인하고 업체 정보를 다시 제출해 주세요. 승인 후 ${action}할 수 있습니다.`;
	}

	return `${action}하려면 업체명과 사업자등록번호를 입력하세요.`;
};

// action 예: "공고를 등록", "조직 설정을 변경"
export function EmployerGateBanner({ action }: { action: string }) {
	const status = useEmployerApproval();

	if (status === "verified") {
		return null;
	}

	return (
		<Alert>
			<AlertTitle>{getGateTitle(status)}</AlertTitle>
			<AlertDescription className="flex flex-col items-start gap-2">
				<span>{getGateDescription(status, action)}</span>
				{status === "pending" ? null : (
					<Link
						className={buttonVariants({ size: "sm", variant: "outline" })}
						href={"/employer/me" as Route}
					>
						업체 정보 입력
					</Link>
				)}
			</AlertDescription>
		</Alert>
	);
}
