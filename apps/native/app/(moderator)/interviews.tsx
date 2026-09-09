import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useQuery } from "@tanstack/react-query";
import { Button, Surface } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	formatDateTime,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { ChatModerationThread } from "@/src/components/moderation/chat-moderation-thread";
import { interviewStatusLabel } from "@/src/lib/me-interviews";
import { orpc } from "@/src/lib/orpc";

type Interview = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listInterviewSchedules"]>
>[number];

function InterviewCard({ item }: { item: Interview }) {
	const [open, setOpen] = useState(false);
	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="flex-row flex-wrap gap-2">
				<Pill
					tone={
						item.status === "confirmed" || item.status === "completed"
							? "success"
							: "neutral"
					}
				>
					{interviewStatusLabel(item.status)}
				</Pill>
				{item.roomIsBlocked ? <Pill tone="danger">차단됨</Pill> : null}
				{item.roomIsDeleted ? <Pill tone="neutral">삭제됨</Pill> : null}
			</View>
			<Text className="font-bold text-foreground">
				{formatDateTime(item.scheduledAt)}
			</Text>
			<Text className="text-muted text-sm">
				{item.seekerName} · {item.employerName}
			</Text>
			<Text className="text-foreground text-sm">{item.jobPostTitle}</Text>
			{item.locationNote ? (
				<Text className="text-muted text-sm" selectable>
					{item.locationNote}
				</Text>
			) : null}
			<Button
				onPress={() => setOpen((value) => !value)}
				size="sm"
				variant="secondary"
			>
				<Button.Label>{open ? "채팅 접기" : "채팅 열람"}</Button.Label>
			</Button>
			{open ? <ChatModerationThread chatRoomId={item.chatRoomId} /> : null}
		</Surface>
	);
}

export default function ModeratorInterviewsScreen() {
	const query = useQuery(
		orpc.bambi.moderation.listInterviewSchedules.queryOptions()
	);
	return (
		<BambiScreen>
			<BambiHeader
				description="채팅에서 제안·확정된 최근 면접과 방 상태를 확인합니다."
				title="면접 일정"
			/>
			{query.isPending ? (
				<Text className="text-muted text-sm">면접 일정을 불러오고 있어요.</Text>
			) : null}
			{query.isError ? (
				<StateCard
					action={
						<Button onPress={() => query.refetch()} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="네트워크 연결을 확인해 주세요."
					title="면접 일정을 불러오지 못했어요"
				/>
			) : null}
			{query.isSuccess && query.data.length === 0 ? (
				<StateCard
					description="아직 제안되거나 확정된 면접이 없어요."
					title="면접 일정이 없어요"
				/>
			) : null}
			{query.data?.map((item) => (
				<InterviewCard item={item} key={item.id} />
			))}
		</BambiScreen>
	);
}
