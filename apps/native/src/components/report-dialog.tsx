import {
	REPORT_REASON_LABELS,
	type ReportReason,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { useMutation } from "@tanstack/react-query";
import { Button, Dialog, RadioGroup, TextArea } from "heroui-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";

import { orpc } from "@/src/lib/orpc";

// 라벨 정본은 공유 모듈(packages/api services/bambi-moderation-labels). 표시 순서는
// 위험도 높은 사유부터 보이도록 여기서 고정한다(Record 키 순서에 기대지 않는다).
const REPORT_REASON_ORDER: readonly ReportReason[] = [
	"illegal_or_prohibited_content",
	"coercion_or_safety",
	"underage_concern",
	"scam_or_fraud",
	"misleading_job_information",
	"harassment",
	"other",
];

// 순수 공고 상세 신고 접수 다이얼로그. 웹 report-dialog.tsx + safety-kit ReportForm/ReportDone의
// native 최소 미러 — 사유 선택 + 상세(선택) + 제출, 성공/중복 에러를 다이얼로그 안에서 알린다.
export function JobReportDialog({
	isOpen,
	onOpenChange,
	targetId,
	targetType = "job_post",
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	targetId: string;
	targetType?: "chat_room" | "job_post";
}) {
	const [reason, setReason] = useState<ReportReason | null>(null);
	const [detail, setDetail] = useState("");
	const [isDone, setIsDone] = useState(false);
	const createReport = useMutation(
		orpc.bambi.moderation.createReport.mutationOptions({
			onSuccess: () => setIsDone(true),
		})
	);

	// 닫힐 때 폼·에러 상태를 초기화해 다음 열림에서 사유 선택부터 다시 시작한다.
	const handleOpenChange = (next: boolean) => {
		if (!next) {
			setReason(null);
			setDetail("");
			setIsDone(false);
			createReport.reset();
		}
		onOpenChange(next);
	};

	const handleSubmit = () => {
		if (!reason) {
			return;
		}
		const trimmed = detail.trim();
		createReport.mutate({
			targetType,
			targetId,
			reason,
			details: trimmed ? trimmed : undefined,
		});
	};

	return (
		<Dialog isOpen={isOpen} onOpenChange={handleOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay />
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : undefined}
				>
					<Dialog.Content>
						{isDone ? (
							<View className="gap-4">
								<View className="gap-1.5">
									<Dialog.Title>신고가 접수됐어요</Dialog.Title>
									<Dialog.Description>
										운영팀이 신고 내용을 검토하고 24시간 내 조치해요.
									</Dialog.Description>
								</View>
								<Button onPress={() => handleOpenChange(false)}>
									<Button.Label>확인</Button.Label>
								</Button>
							</View>
						) : (
							<View className="gap-4">
								<View className="gap-1.5">
									<Dialog.Title>무엇을 신고할까요?</Dialog.Title>
									<Dialog.Description>
										신고는 익명으로 운영팀에 전달돼요.
									</Dialog.Description>
								</View>
								<RadioGroup
									onValueChange={(value) => setReason(value as ReportReason)}
									value={reason ?? undefined}
								>
									{REPORT_REASON_ORDER.map((value) => (
										<RadioGroup.Item key={value} value={value}>
											{REPORT_REASON_LABELS[value]}
										</RadioGroup.Item>
									))}
								</RadioGroup>
								<TextArea
									onChangeText={setDetail}
									placeholder="구체적인 상황을 적어주시면 처리가 빨라져요 (선택)"
									value={detail}
								/>
								{createReport.isError ? (
									<Text className="text-danger text-sm" selectable>
										{createReport.error?.message || "신고를 접수하지 못했어요."}
									</Text>
								) : null}
								<View className="flex-row gap-3">
									<View className="flex-1">
										<Button
											onPress={() => handleOpenChange(false)}
											variant="tertiary"
										>
											<Button.Label>신고 취소</Button.Label>
										</Button>
									</View>
									<View className="flex-1">
										<Button
											isDisabled={!reason || createReport.isPending}
											onPress={handleSubmit}
											variant="danger"
										>
											<Button.Label>
												{createReport.isPending ? "접수 중" : "신고 접수"}
											</Button.Label>
										</Button>
									</View>
								</View>
							</View>
						)}
					</Dialog.Content>
				</KeyboardAvoidingView>
			</Dialog.Portal>
		</Dialog>
	);
}
