// biome-ignore-all lint/style/noNestedTernary: 차단, 종료, 입력 상태를 화면 순서대로 표현한다
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button, Input, Surface, TextField } from "heroui-native";
import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
} from "@/src/components/bambi-screen";
import { orpc, queryClient } from "@/src/lib/orpc";
import { canSendSupportMessage } from "@/src/lib/support/support";

export default function SupportChatRoomScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [body, setBody] = useState("");
	const query = useQuery({
		...orpc.bambi.supportChat.getRoomMessages.queryOptions({
			input: { roomId: id },
		}),
		refetchInterval: 3000,
	});
	const markRead = useMutation(
		orpc.bambi.supportChat.markRead.mutationOptions()
	);
	useFocusEffect(
		useCallback(() => {
			markRead.mutate({ roomId: id });
			query.refetch();
		}, [id, markRead.mutate, query.refetch])
	);
	const send = useMutation(
		orpc.bambi.supportChat.sendMessage.mutationOptions({
			onError: (error) =>
				Alert.alert("메시지를 보내지 못했어요", error.message),
			onSuccess: async () => {
				setBody("");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.supportChat.key(),
				});
			},
		})
	);
	if (query.isPending) {
		return <LoadingState label="상담 내용을 불러오고 있어요." />;
	}
	if (query.isError || !query.data) {
		return <ErrorState onRetry={() => query.refetch()} />;
	}
	const { messages, room } = query.data;
	const canSend = canSendSupportMessage(body, room.isBlocked, room.status);
	return (
		<BambiScreen>
			<Stack.Screen options={{ title: "1:1 상담" }} />
			{messages.map((message) => (
				<Surface
					className="gap-1 rounded-lg p-3"
					key={message.id}
					variant={message.senderType === "admin" ? "secondary" : "tertiary"}
				>
					<Text className="font-semibold text-foreground text-xs">
						{message.senderType === "admin" ? "운영자" : "나"}
					</Text>
					<Text className="text-foreground text-sm" selectable>
						{message.body}
					</Text>
					<Text className="text-muted text-xs">
						{new Date(message.createdAt).toLocaleString("ko-KR")}
					</Text>
				</Surface>
			))}
			{room.isBlocked ? (
				<Text className="text-danger text-sm">
					운영자가 메시지 발신을 잠갔어요.
				</Text>
			) : room.status === "closed" ? (
				<Text className="text-muted text-sm">
					종료된 상담이에요. 새 상담을 시작해 주세요.
				</Text>
			) : (
				<View className="gap-2">
					<TextField>
						<Input
							maxLength={1000}
							onChangeText={setBody}
							placeholder="메시지를 입력하세요"
							value={body}
						/>
					</TextField>
					<Button
						isDisabled={!canSend || send.isPending}
						onPress={() => send.mutate({ body: body.trim(), roomId: id })}
					>
						<Button.Label>보내기</Button.Label>
					</Button>
				</View>
			)}
		</BambiScreen>
	);
}
