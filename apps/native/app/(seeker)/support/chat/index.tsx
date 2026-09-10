// biome-ignore-all lint/style/noNestedTernary: query 상태를 화면 순서대로 표현한다
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router, Stack } from "expo-router";
import { Button, Input, Skeleton, Surface, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	StateCard,
} from "@/src/components/bambi-screen";
import { useVisitor } from "@/src/lib/guest-store";
import { orpc, queryClient } from "@/src/lib/orpc";
import { supportChatHref } from "@/src/lib/support/support";
import { ensureSupportChatToken } from "@/src/lib/support/support-chat-store";

export default function SupportChatListScreen() {
	const visitor = useVisitor();
	const [body, setBody] = useState("");
	const [identityError, setIdentityError] = useState<string | null>(null);
	const query = useQuery({
		...orpc.bambi.supportChat.getMyRooms.queryOptions(),
		enabled: visitor.state !== "pending",
		refetchInterval: 30_000,
	});
	useEffect(() => {
		if (visitor.state !== "anon") {
			return;
		}
		ensureSupportChatToken()
			.then(() => query.refetch())
			.catch((error: unknown) =>
				setIdentityError(
					error instanceof Error ? error.message : "상담을 준비하지 못했어요."
				)
			);
	}, [query.refetch, visitor.state]);
	const send = useMutation(
		orpc.bambi.supportChat.sendMessage.mutationOptions({
			onError: (error) =>
				Alert.alert("메시지를 보내지 못했어요", error.message),
			onSuccess: async (result) => {
				setBody("");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.supportChat.key(),
				});
				router.push(supportChatHref(result.roomId) as unknown as Href);
			},
		})
	);
	const rooms = query.data?.rooms ?? [];
	return (
		<BambiScreen>
			<Stack.Screen options={{ title: "1:1 상담" }} />
			<View className="gap-1">
				<Text className="font-bold text-3xl text-foreground">1:1 상담</Text>
				<Text className="text-muted text-sm">
					운영팀에 바로 메시지를 보내고 답변을 확인하세요.
				</Text>
			</View>
			{identityError ? (
				<Text className="text-danger text-sm">{identityError}</Text>
			) : null}
			{query.isPending ? (
				<Skeleton className="h-32 rounded-lg" />
			) : query.isError ? (
				<ErrorState onRetry={() => query.refetch()} />
			) : rooms.length === 0 ? (
				<StateCard
					description="아래 입력창에 메시지를 보내면 새 상담이 시작돼요."
					title="아직 나눈 대화가 없어요"
				/>
			) : (
				rooms.map((room) => (
					<Pressable
						className="active:opacity-75"
						key={room.id}
						onPress={() =>
							router.push(supportChatHref(room.id) as unknown as Href)
						}
					>
						<Surface className="gap-2 rounded-lg p-4" variant="secondary">
							<Text className="font-semibold text-foreground" numberOfLines={1}>
								{room.lastMessagePreview || "상담 메시지"}
							</Text>
							<Text className="text-muted text-xs">
								{room.status === "closed" ? "종료" : "진행 중"} · 읽지 않음{" "}
								{room.unreadCount}
							</Text>
						</Surface>
					</Pressable>
				))
			)}
			<View className="gap-2">
				<TextField>
					<Input
						maxLength={1000}
						onChangeText={setBody}
						placeholder="메시지를 보내주세요"
						value={body}
					/>
				</TextField>
				<Button
					isDisabled={!body.trim() || send.isPending || Boolean(identityError)}
					onPress={() => send.mutate({ body: body.trim() })}
				>
					<Button.Label>새 상담 시작</Button.Label>
				</Button>
			</View>
		</BambiScreen>
	);
}
