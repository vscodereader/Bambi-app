import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useFocusEffect } from "expo-router";
import {
	Button,
	ListGroup,
	Separator,
	Skeleton,
	useThemeColor,
} from "heroui-native";
import { Fragment, useCallback, useEffect } from "react";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
} from "@/src/components/bambi-screen";
import { ChatRoomListItem } from "@/src/components/chat/chat-room-list-item";
import { MemberOnly } from "@/src/components/member-only";
import { connectChatSocket } from "@/src/lib/chat/chat-socket";
import type { ChatRoomListItem as ChatRoomListItemData } from "@/src/lib/chat/chat-types";
import { orpc } from "@/src/lib/orpc";

const SKELETON_ROWS = [0, 1, 2, 3];

function ListSkeleton() {
	return (
		<View className="gap-4">
			{SKELETON_ROWS.map((row) => (
				<View className="flex-row items-center gap-3" key={row}>
					<Skeleton className="h-14 w-14 rounded-full" />
					<View className="flex-1 gap-2">
						<Skeleton className="h-4 w-2/5 rounded-md" />
						<Skeleton className="h-3 w-4/5 rounded-md" />
					</View>
				</View>
			))}
		</View>
	);
}

function EmptyChats() {
	const muted = useThemeColor("muted");

	return (
		<View className="items-center gap-3 py-16">
			<Ionicons color={muted} name="chatbubble-ellipses-outline" size={44} />
			<Text className="font-semibold text-foreground text-lg">
				아직 채팅이 없어요
			</Text>
			<Text className="text-center text-muted text-sm leading-5">
				공고 상세에서 1:1 채팅을 시작하면{"\n"}여기에 대화가 쌓여요.
			</Text>
			<Button
				onPress={() => router.push("/(seeker)" as Href)}
				size="sm"
				variant="secondary"
			>
				<Button.Label>공고 탐색하기</Button.Label>
			</Button>
		</View>
	);
}

function ChatRoomsBody({
	isLoading,
	rooms,
}: {
	isLoading: boolean;
	rooms: ChatRoomListItemData[];
}) {
	if (isLoading) {
		return <ListSkeleton />;
	}
	if (rooms.length === 0) {
		return <EmptyChats />;
	}
	return (
		<ListGroup variant="transparent">
			{rooms.map((room, index) => (
				<Fragment key={room.id}>
					{index > 0 ? <Separator /> : null}
					<ChatRoomListItem
						onPress={() =>
							router.push({
								pathname: "/(seeker)/chats/[id]",
								params: { id: room.id },
							} as unknown as Href)
						}
						room={room}
					/>
				</Fragment>
			))}
		</ListGroup>
	);
}

function SeekerChatsInner() {
	const queryClient = useQueryClient();
	const chatsQuery = useQuery(orpc.bambi.chats.listMine.queryOptions());
	const { refetch } = chatsQuery;

	// RN에는 focusManager가 없어 방에서 돌아와도 자동 재조회가 없다 — 포커스 복귀에 직접 건다.
	useFocusEffect(
		useCallback(() => {
			refetch();
		}, [refetch])
	);

	// 소켓 chat:list:updated(새 메시지·읽음·나가기)로 목록을 갱신한다.
	useEffect(() => {
		const socket = connectChatSocket();
		const refresh = () => {
			queryClient
				.invalidateQueries({ queryKey: orpc.bambi.chats.listMine.queryKey() })
				.catch(() => undefined);
		};
		socket.on("chat:list:updated", refresh);
		socket.on("connect", refresh);
		return () => {
			socket.off("chat:list:updated", refresh);
			socket.off("connect", refresh);
		};
	}, [queryClient]);

	if (chatsQuery.isError) {
		return <ErrorState onRetry={() => chatsQuery.refetch()} />;
	}

	const rooms = chatsQuery.data ?? [];

	return (
		<BambiScreen>
			<BambiHeader
				description="지원한 공고의 대화를 확인합니다."
				title="채팅"
			/>
			<ChatRoomsBody isLoading={chatsQuery.isLoading} rooms={rooms} />
		</BambiScreen>
	);
}

export default function SeekerChatsScreen() {
	return (
		<MemberOnly>
			<SeekerChatsInner />
		</MemberOnly>
	);
}
