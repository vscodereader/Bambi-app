import { formatChatTimeLabel } from "@bambi-app/api/services/bambi-chat-message-grouping";
import {
	type ContactRevealDecision,
	readContactRequestMetadata,
	readInterviewProposalMetadata,
} from "@bambi-app/api/services/bambi-chat-system-messages";
import { Ionicons } from "@expo/vector-icons";
import { Button, Chip, Surface, useThemeColor } from "heroui-native";
import { Text, View } from "react-native";

import type { ChatTimelineMessage } from "@/src/lib/chat/chat-optimistic";
import { formatInterviewDate } from "@/src/lib/chat/chat-time";
import type { ChatRoomSchedule } from "@/src/lib/chat/chat-types";
import { interviewStatusLabel } from "@/src/lib/me-interviews";

type InterviewResponse = "confirmed" | "declined";
type StatusChipColor = "default" | "success" | "warning";

// 상태 → soft Chip 색. warning=대기(proposed/pending), success=성사(confirmed/revealed),
// 그 외(declined·canceled·completed)는 중립.
function statusChipColor(status: string): StatusChipColor {
	if (status === "proposed" || status === "pending") {
		return "warning";
	}
	if (status === "confirmed" || status === "revealed") {
		return "success";
	}
	return "default";
}

// 연락처 카드 부제 — web getContactRequestNotice와 달리 구직자 앱 1인칭 문구라 native 전용.
function contactNotice(status: string, counterpartName: null | string): string {
	if (status === "revealed") {
		return "연락처를 공개했어요";
	}
	if (status === "declined") {
		return "연락처 공개를 거절했어요";
	}
	return `${counterpartName ?? "상대방"}이 내 전화번호를 요청했어요`;
}

// 두 시스템 카드 공통 한 줄 셸: 아이콘 타일 + 제목/부제 컬럼 + 우측 슬롯(버튼 또는 상태 Chip),
// 카드 밖 우하단 타임스탬프. 액센트는 타일 배경·아이콘·primary 버튼에만.
function CardShell({
	createdAt,
	icon,
	rightSlot,
	subtitle,
	subtitleSecondary,
	title,
}: {
	createdAt: Date | string;
	icon: React.ComponentProps<typeof Ionicons>["name"];
	rightSlot?: React.ReactNode;
	subtitle?: string;
	subtitleSecondary?: React.ReactNode;
	title: string;
}) {
	const accent = useThemeColor("accent");

	return (
		<View className="mx-4 my-1">
			<Surface
				className="flex-row items-center gap-3 rounded-2xl p-3"
				variant="secondary"
			>
				<View className="h-14 w-14 items-center justify-center rounded-xl bg-accent-soft">
					<Ionicons color={accent} name={icon} size={26} />
				</View>
				<View className="flex-1 gap-0.5">
					<Text
						className="font-semibold text-foreground text-sm"
						numberOfLines={1}
					>
						{title}
					</Text>
					{subtitle ? (
						<Text className="text-foreground text-sm" numberOfLines={2}>
							{subtitle}
						</Text>
					) : null}
					{subtitleSecondary ?? null}
				</View>
				{rightSlot ? (
					<View className="flex-row items-center gap-2">{rightSlot}</View>
				) : null}
			</Surface>
			<Text className="mt-1 mr-4 self-end text-muted text-xs">
				{formatChatTimeLabel(createdAt)}
			</Text>
		</View>
	);
}

// 거절(tertiary ✕, 왼쪽) / 확정·공개(primary ✓, 오른쪽). 둘 다 아이콘 버튼.
function ResponseButtons({
	confirmLabel,
	declineLabel,
	isBusy,
	onConfirm,
	onDecline,
}: {
	confirmLabel: string;
	declineLabel: string;
	isBusy: boolean;
	onConfirm: () => void;
	onDecline: () => void;
}) {
	const foreground = useThemeColor("foreground");
	const accentForeground = useThemeColor("accent-foreground");

	return (
		<>
			<Button
				accessibilityLabel={declineLabel}
				isDisabled={isBusy}
				isIconOnly
				onPress={onDecline}
				size="sm"
				variant="tertiary"
			>
				<Ionicons color={foreground} name="close" size={18} />
			</Button>
			<Button
				accessibilityLabel={confirmLabel}
				isDisabled={isBusy}
				isIconOnly
				onPress={onConfirm}
				size="sm"
			>
				<Ionicons color={accentForeground} name="checkmark" size={18} />
			</Button>
		</>
	);
}

// contact_request·interview_proposal 인라인 시스템 카드(web ContactRequestMessage·
// InterviewProposalMessage와 같은 규칙). 구직자 앱이므로 viewerIsEmployer는 항상 false.
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
	const muted = useThemeColor("muted");

	if (message.kind === "contact_request") {
		const metadata = readContactRequestMetadata(message.metadata);

		if (!metadata) {
			return null;
		}

		const canRespond =
			metadata.status === "pending" && metadata.targetUserId === currentUserId;
		const statusLabel = {
			declined: "거절함",
			pending: "응답 대기",
			revealed: "공개함",
		}[metadata.status];

		return (
			<CardShell
				createdAt={message.createdAt}
				icon="call-outline"
				rightSlot={
					canRespond ? (
						<ResponseButtons
							confirmLabel="연락처 공개"
							declineLabel="연락처 공개 거절"
							isBusy={isBusy}
							onConfirm={() => onRespondContact(message.id, "reveal")}
							onDecline={() => onRespondContact(message.id, "decline")}
						/>
					) : (
						<Chip
							color={statusChipColor(metadata.status)}
							size="sm"
							variant="soft"
						>
							<Chip.Label>{statusLabel}</Chip.Label>
						</Chip>
					)
				}
				subtitle={contactNotice(metadata.status, counterpartName)}
				title="연락처 공개 요청"
			/>
		);
	}

	if (message.kind === "interview_proposal") {
		const metadata = readInterviewProposalMetadata(message.metadata);
		const schedule = metadata
			? schedules.find(({ id }) => id === metadata.interviewScheduleId)
			: undefined;

		if (!schedule) {
			return (
				<CardShell
					createdAt={message.createdAt}
					icon="calendar-outline"
					title={message.body}
				/>
			);
		}

		const viewerIsProposer = schedule.proposedByUserId === currentUserId;
		const canRespond = schedule.status === "proposed" && !viewerIsProposer;

		return (
			<CardShell
				createdAt={message.createdAt}
				icon="calendar-outline"
				rightSlot={
					canRespond ? (
						<ResponseButtons
							confirmLabel="면접 확정"
							declineLabel="면접 거절"
							isBusy={isBusy}
							onConfirm={() => onSetInterviewStatus(schedule.id, "confirmed")}
							onDecline={() => onSetInterviewStatus(schedule.id, "declined")}
						/>
					) : (
						<Chip
							color={statusChipColor(schedule.status)}
							size="sm"
							variant="soft"
						>
							<Chip.Label>{interviewStatusLabel(schedule.status)}</Chip.Label>
						</Chip>
					)
				}
				subtitle={formatInterviewDate(schedule.scheduledAt)}
				subtitleSecondary={
					schedule.locationNote ? (
						<View className="flex-row items-center gap-1">
							<Ionicons color={muted} name="location-outline" size={14} />
							<Text className="flex-1 text-muted text-sm" numberOfLines={1}>
								{schedule.locationNote}
							</Text>
						</View>
					) : undefined
				}
				title="면접 제안"
			/>
		);
	}

	return null;
}
