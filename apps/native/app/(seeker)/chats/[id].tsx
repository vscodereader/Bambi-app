import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, Link, useLocalSearchParams } from "expo-router";
import { Button, Input, Surface, TextField } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatDateTime,
	LoadingState,
	Pill,
} from "@/src/components/bambi-screen";
import { getConfirmedScheduleId } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

const getNextDayIso = (): string =>
	new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

export default function SeekerChatRoomScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [message, setMessage] = useState("");
	const chatQuery = useQuery(
		orpc.bambi.chats.getById.queryOptions({ input: { id } })
	);
	const sendMessageMutation = useMutation(
		orpc.bambi.chats.sendMessage.mutationOptions({
			onSuccess: async () => {
				setMessage("");
				await chatQuery.refetch();
			},
		})
	);
	const proposeInterviewMutation = useMutation(
		orpc.bambi.chats.proposeInterview.mutationOptions({
			onSuccess: () => chatQuery.refetch(),
		})
	);
	const setStatusMutation = useMutation(
		orpc.bambi.chats.setInterviewStatus.mutationOptions({
			onSuccess: () => chatQuery.refetch(),
		})
	);

	if (chatQuery.isLoading) {
		return <LoadingState label="채팅방을 불러오고 있습니다." />;
	}

	if (chatQuery.isError || !chatQuery.data) {
		return <ErrorState onRetry={() => chatQuery.refetch()} />;
	}

	const { jobPost, messages, schedules } = chatQuery.data;
	const confirmedScheduleId = getConfirmedScheduleId(schedules);

	return (
		<BambiScreen>
			<BambiHeader
				action={
					confirmedScheduleId ? (
						<Link
							asChild
							href={
								{
									pathname: "/(seeker)/chats/[id]/reveal",
									params: { id },
								} as unknown as Href
							}
						>
							<Button size="sm" variant="secondary">
								<Button.Label>연락처 공개</Button.Label>
							</Button>
						</Link>
					) : null
				}
				description={
					jobPost ? `${jobPost.region} · ${jobPost.status}` : undefined
				}
				title={jobPost?.title ?? "채팅방"}
			/>

			<Surface className="gap-3 rounded-lg p-4" variant="secondary">
				<Text className="font-semibold text-foreground" selectable>
					메시지
				</Text>
				{messages.length === 0 ? (
					<Text className="text-muted text-sm" selectable>
						아직 메시지가 없습니다.
					</Text>
				) : (
					messages.map((chatMessage) => (
						<View
							className="gap-1 rounded-lg bg-background p-3"
							key={chatMessage.id}
						>
							<Text className="text-muted text-xs" selectable>
								{formatDateTime(chatMessage.createdAt)}
							</Text>
							<Text className="text-foreground leading-5" selectable>
								{chatMessage.body}
							</Text>
							{chatMessage.attachments.length > 0 ? (
								<Pill>{chatMessage.attachments.length}개 첨부</Pill>
							) : null}
						</View>
					))
				)}
				<View className="gap-2 pt-2">
					<TextField>
						<Input
							onChangeText={setMessage}
							placeholder="메시지 입력"
							value={message}
						/>
					</TextField>
					<Button
						isDisabled={sendMessageMutation.isPending || !message.trim()}
						onPress={() =>
							sendMessageMutation.mutate({
								body: message.trim(),
								chatRoomId: id,
							})
						}
					>
						<Button.Label>보내기</Button.Label>
					</Button>
				</View>
			</Surface>

			<Surface className="gap-3 rounded-lg p-4" variant="secondary">
				<View className="flex-row items-center justify-between gap-3">
					<Text className="font-semibold text-foreground" selectable>
						면접 일정
					</Text>
					<Button
						isDisabled={proposeInterviewMutation.isPending}
						onPress={() =>
							proposeInterviewMutation.mutate({
								chatRoomId: id,
								locationNote: "밤비알바 모바일에서 제안",
								scheduledAt: getNextDayIso(),
							})
						}
						size="sm"
						variant="secondary"
					>
						<Button.Label>내일 제안</Button.Label>
					</Button>
				</View>
				{schedules.length === 0 ? (
					<Text className="text-muted text-sm" selectable>
						확정된 면접 일정이 있어야 연락처를 공개할 수 있습니다.
					</Text>
				) : (
					schedules.map((schedule) => (
						<View
							className="gap-2 rounded-lg bg-background p-3"
							key={schedule.id}
						>
							<View className="flex-row flex-wrap gap-2">
								<Pill
									tone={schedule.status === "confirmed" ? "success" : "neutral"}
								>
									{schedule.status}
								</Pill>
								<Text className="text-muted text-sm" selectable>
									{formatDateTime(schedule.scheduledAt)}
								</Text>
							</View>
							<View className="flex-row flex-wrap gap-2">
								{(
									["confirmed", "declined", "canceled", "completed"] as const
								).map((status) => (
									<Button
										isDisabled={setStatusMutation.isPending}
										key={status}
										onPress={() =>
											setStatusMutation.mutate({
												interviewScheduleId: schedule.id,
												status,
											})
										}
										size="sm"
										variant="secondary"
									>
										<Button.Label>{status}</Button.Label>
									</Button>
								))}
							</View>
						</View>
					))
				)}
			</Surface>
		</BambiScreen>
	);
}
