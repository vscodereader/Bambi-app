"use client";

// 밤비 — 구직자 측 공용 신고 접수 다이얼로그.
// 내부 폼/완료 화면은 safety-kit의 ReportForm·ReportDone을 재사용하고,
// 이 래퍼는 제어형 open 상태·서버 뮤테이션 배선·닫힘 시 초기화만 담당한다.

import { Dialog, DialogContent } from "@bambi-app/ui/components/dialog";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { ReportReason } from "@/lib/bambi/types";
import { orpc } from "@/utils/orpc";
import { ReportDone, ReportForm } from "./safety-kit";

// 서버 신고 사유 enum(orpc moderation.createReport). ReportForm이 쓰는
// 프로토타입 사유 id와 다르므로 아래 매핑으로 변환한다.
type ServerReportReason =
	| "illegal_or_prohibited_content"
	| "coercion_or_safety"
	| "underage_concern"
	| "scam_or_fraud"
	| "harassment"
	| "misleading_job_information"
	| "other";

// REPORT_REASONS(lib/bambi/report-reasons.ts)의 사유 id → 서버 enum.
// 사유 미선택(reason undefined)이면 "other"로 접수한다.
const REPORT_REASON_TO_SERVER: Record<string, ServerReportReason> = {
	sex: "illegal_or_prohibited_content",
	coerce: "coercion_or_safety",
	minor: "underage_concern",
	fake: "scam_or_fraud",
	external: "misleading_job_information",
	abuse: "harassment",
	etc: "other",
};

type ReportTargetType =
	| "job_post"
	| "chat_room"
	| "chat_message"
	| "review"
	| "user";

interface ReportDialogProps {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	targetId: string;
	targetType: ReportTargetType;
}

const resolveServerReason = (
	reason: ReportReason | undefined
): ServerReportReason =>
	reason ? (REPORT_REASON_TO_SERVER[reason.id] ?? "other") : "other";

export function ReportDialog({
	onOpenChange,
	open,
	targetId,
	targetType,
}: ReportDialogProps) {
	const [isDone, setIsDone] = useState(false);
	const createReportMutation = useMutation(
		orpc.bambi.moderation.createReport.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "신고를 접수하지 못했어요.");
			},
			onSuccess: () => {
				setIsDone(true);
			},
		})
	);

	// 닫힐 때 완료 상태를 초기화해 다음 열림에서 신고 폼부터 다시 시작한다.
	const handleOpenChange = (next: boolean) => {
		if (!next) {
			setIsDone(false);
		}
		onOpenChange(next);
	};

	const handleSubmit = (reason: ReportReason | undefined, detail: string) => {
		const trimmed = detail.trim();
		createReportMutation.mutate({
			targetType,
			targetId,
			reason: resolveServerReason(reason),
			details: trimmed ? trimmed : undefined,
		});
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="max-h-[calc(100dvh-2rem)]">
				{isDone ? (
					<ReportDone onClose={() => handleOpenChange(false)} />
				) : (
					<ReportForm
						onCancel={() => handleOpenChange(false)}
						onSubmit={handleSubmit}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
