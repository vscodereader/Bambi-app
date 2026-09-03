import {
	type ContactRevealDecision,
	getContactRequestNotice,
	getInterviewProposalNotice,
	readContactRequestMetadata,
	readInterviewProposalMetadata,
} from "@bambi-app/api/services/bambi-chat-system-messages";
import { Ionicons } from "@expo/vector-icons";
import { Button, Surface, useThemeColor } from "heroui-native";
import { Text, View } from "react-native";

import { formatDateTime, Pill } from "@/src/components/bambi-screen";
import type { ChatTimelineMessage } from "@/src/lib/chat/chat-optimistic";
import type { ChatRoomSchedule } from "@/src/lib/chat/chat-types";
import {
	interviewStatusLabel,
	interviewStatusTone,
} from "@/src/lib/me-interviews";

type InterviewResponse = "confirmed" | "declined";

function CardShell({
	children,
	createdAt,
	icon,
}: {
	children: React.ReactNode;
	createdAt: Date | string;
	icon: React.ComponentProps<typeof Ionicons>["name"];
}) {
	const accent = useThemeColor("accent");

	return (
		<View className="items-center px-4 pt-3">
			<Surface
				className="w-11/12 items-center gap-2 rounded-2xl border border-accent/20 p-4"
				variant="secondary"
			>
				<Ionicons color={accent} name={icon} size={22} />
				{children}
				<Text className="text-muted text-xs">{formatDateTime(createdAt)}</Text>
			</Surface>
		</View>
	);
}

function ResponseButtons({
	confirmLabel,
	isBusy,
	onConfirm,
	onDecline,
}: {
	confirmLabel: string;
	isBusy: boolean;
	onConfirm: () => void;
	onDecline: () => void;
}) {
	return (
		<View className="mt-1 flex-row gap-2">
			<Button isDisabled={isBusy} onPress={onConfirm} size="sm">
				<Button.Label>{confirmLabel}</Button.Label>
			</Button>
			<Button
				isDisabled={isBusy}
				onPress={onDecline}
				size="sm"
				variant="tertiary"
			>
				<Button.Label>거절</Button.Label>
			</Button>
		</View>
	);
}

// contact_request·interview_proposal 인라인 시스템 카드(web ContactRequestMessage·
// InterviewProposalMessage와 같은 규칙). 구직자 앱이므로 viewerIsEmployer는 항상 false지만
// 공유 함수 시그니처를 그대로 쓴다.
export function ChatSystemCard({
	counterpartName,
	currentUserId,
	isBusy,
	message,
	onRespondContact,
	onSetInterviewStatus,
	schedules,
}: {
	counterpartName: null | string;
	currentUserId: string;
	isBusy: boolean;
	message: ChatTimelineMessage;
	onRespondContact: (
		messageId: string,
		decision: ContactRevealDecision
	) => void;
	onSetInterviewStatus: (
		interviewScheduleId: string,
		status: InterviewResponse
	) => void;
	schedules: readonly ChatRoomSchedule[];
}) {
	if (message.kind === "contact_request") {
		const metadata = readContactRequestMetadata(message.metadata);

		if (!metadata) {
			return null;
		}

		const notice = getContactRequestNotice({
			counterpartName: counterpartName ?? "상대방",
			revealedPhoneLabel: message.revealedPhone,
			status: metadata.status,
			viewerIsEmployer: false,
		});
		const canRespond =
			metadata.status === "pending" && metadata.targetUserId === currentUserId;
		const statusLabel = {
			declined: "거절함",
			pending: "응답 대기",
			revealed: "공개함",
		}[metadata.status];
		const statusTone = {
			declined: "neutral",
			pending: "warning",
			revealed: "success",
		}[metadata.status] as "neutral" | "success" | "warning";

		return (
			<CardShell createdAt={message.createdAt} icon="call-outline">
				<Text className="text-center font-semibold text-foreground text-sm leading-5">
					{notice}
				</Text>
				<Pill tone={statusTone}>{statusLabel}</Pill>
				{canRespond ? (
					<ResponseButtons
						confirmLabel="공개"
						isBusy={isBusy}
						onConfirm={() => onRespondContact(message.id, "reveal")}
						onDecline={() => onRespondContact(message.id, "decline")}
					/>
				) : null}
			</CardShell>
		);
	}

	if (message.kind === "interview_proposal") {
		const metadata = readInterviewProposalMetadata(message.metadata);
		const schedule = metadata
			? schedules.find(({ id }) => id === metadata.interviewScheduleId)
			: undefined;

		if (!schedule) {
			return (
				<CardShell createdAt={message.createdAt} icon="calendar-outline">
					<Text className="text-center font-semibold text-foreground text-sm">
						{message.body}
					</Text>
				</CardShell>
			);
		}

		const viewerIsProposer = schedule.proposedByUserId === currentUserId;
		const canRespond = schedule.status === "proposed" && !viewerIsProposer;

		return (
			<CardShell createdAt={message.createdAt} icon="calendar-outline">
				<Text className="text-center font-semibold text-foreground text-sm leading-5">
					{getInterviewProposalNotice(schedule.status, viewerIsProposer)}
				</Text>
				<Text className="font-semibold text-accent text-base">
					{formatDateTime(schedule.scheduledAt)}
				</Text>
				{schedule.locationNote ? (
					<Text className="text-center text-muted text-sm">
						{schedule.locationNote}
					</Text>
				) : null}
				<Pill tone={interviewStatusTone(schedule.status)}>
					{interviewStatusLabel(schedule.status)}
				</Pill>
				{canRespond ? (
					<ResponseButtons
						confirmLabel="확정"
						isBusy={isBusy}
						onConfirm={() => onSetInterviewStatus(schedule.id, "confirmed")}
						onDecline={() => onSetInterviewStatus(schedule.id, "declined")}
					/>
				) : null}
			</CardShell>
		);
	}

	return null;
}
