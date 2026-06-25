import { useQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	CardLink,
	ErrorState,
	formatDateTime,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { orpc } from "@/src/lib/orpc";

export default function SeekerChatsScreen() {
	const chatsQuery = useQuery(orpc.bambi.chats.listMine.queryOptions());

	if (chatsQuery.isLoading) {
		return <LoadingState label="채팅 목록을 불러오고 있습니다." />;
	}

	if (chatsQuery.isError) {
		return <ErrorState onRetry={() => chatsQuery.refetch()} />;
	}

	const rooms = chatsQuery.data ?? [];

	return (
		<BambiScreen>
			<BambiHeader
				description="지원 대화와 면접 일정을 확인합니다."
				title="채팅"
			/>
			{rooms.length === 0 ? (
				<StateCard
					description="공고 상세에서 밤비 채팅을 시작하면 여기에 표시됩니다."
					title="아직 채팅이 없습니다"
				/>
			) : (
				<View className="gap-3">
					{rooms.map((room) => (
						<CardLink
							href={
								{
									pathname: "/(seeker)/chats/[id]",
									params: { id: room.id },
								} as unknown as Href
							}
							key={room.id}
						>
							<View className="gap-2">
								<View className="flex-row flex-wrap gap-2">
									<Pill tone={room.unreadCount > 0 ? "warning" : "neutral"}>
										읽지 않음 {room.unreadCount}
									</Pill>
									{room.isBlocked ? <Pill tone="danger">차단됨</Pill> : null}
								</View>
								<Text className="font-semibold text-foreground" selectable>
									공고 {room.jobPostId.slice(0, 8)}
								</Text>
								<Text className="text-muted text-sm" selectable>
									최근 업데이트 {formatDateTime(room.updatedAt)}
								</Text>
							</View>
						</CardLink>
					))}
				</View>
			)}
		</BambiScreen>
	);
}
