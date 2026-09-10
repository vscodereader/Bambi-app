import { Avatar, Chip, cn, ListGroup } from "heroui-native";
import { Text, View } from "react-native";

import { ChatAvailabilityBadges } from "@/src/components/chat/chat-availability-badges";
import { formatChatListTime } from "@/src/lib/chat/chat-time";
import type { ChatRoomListItem as ChatRoomListItemData } from "@/src/lib/chat/chat-types";

const UNREAD_CAP = 99;

function RoomStatusChip({ room }: { room: ChatRoomListItemData }) {
	if (room.counterpartWithdrawn) {
		return (
			<Chip color="default" size="sm" variant="soft">
				<Chip.Label>대화 불가</Chip.Label>
			</Chip>
		);
	}
	if (room.isBlocked) {
		return (
			<Chip color="danger" size="sm" variant="soft">
				<Chip.Label>차단됨</Chip.Label>
			</Chip>
		);
	}
	return null;
}

// 메신저식 목록 행. listMine은 상대 프로필 이미지를 내려주지 않아 이니셜 폴백만 쓴다.
// 차단·탈퇴 행은 열리되(이력 열람) 채도를 낮추고 상태 칩을 단다 — web과 같은 규칙.
export function ChatRoomListItem({
	onPress,
	room,
}: {
	onPress: () => void;
	room: ChatRoomListItemData;
}) {
	const isMuted = room.isBlocked || room.counterpartWithdrawn;
	const unreadLabel =
		room.unreadCount > UNREAD_CAP ? `${UNREAD_CAP}+` : String(room.unreadCount);

	return (
		<ListGroup.Item
			accessibilityLabel={`${room.counterpartName ?? "상대"}와의 채팅, ${room.jobTitle ?? ""}, 읽지 않음 ${room.unreadCount}건`}
			className={cn("py-3", isMuted && "opacity-60")}
			onPress={onPress}
		>
			<ListGroup.ItemPrefix>
				<Avatar color={isMuted ? "default" : "accent"} size="lg">
					<Avatar.Fallback>
						{(room.counterpartName ?? "?").trim().charAt(0) || "?"}
					</Avatar.Fallback>
				</Avatar>
			</ListGroup.ItemPrefix>
			<ListGroup.ItemContent>
				<View className="flex-row items-center gap-2">
					<ListGroup.ItemTitle numberOfLines={1}>
						{room.counterpartName ?? "상대"}
					</ListGroup.ItemTitle>
					<RoomStatusChip room={room} />
				</View>
				{room.jobTitle ? (
					<Text className="text-muted text-xs" numberOfLines={1}>
						{room.jobTitle}
					</Text>
				) : null}
				<ChatAvailabilityBadges
					counterpartIsOnline={room.counterpartIsOnline}
					counterpartResponseBucket={room.counterpartResponseBucket}
					counterpartWithdrawn={room.counterpartWithdrawn}
					isBlocked={room.isBlocked}
					viewerIsOnline={room.viewerIsOnline}
				/>
				<ListGroup.ItemDescription
					className={cn(
						room.unreadCount > 0 && "font-semibold text-foreground"
					)}
					numberOfLines={1}
				>
					{room.lastMessageBody ?? "메시지가 없습니다"}
				</ListGroup.ItemDescription>
			</ListGroup.ItemContent>
			<ListGroup.ItemSuffix>
				<View className="items-end gap-1.5">
					<Text className="text-muted text-xs">
						{formatChatListTime(room.updatedAt)}
					</Text>
					{room.unreadCount > 0 ? (
						<Chip color="accent" size="sm" variant="primary">
							<Chip.Label>{unreadLabel}</Chip.Label>
						</Chip>
					) : null}
				</View>
			</ListGroup.ItemSuffix>
		</ListGroup.Item>
	);
}
