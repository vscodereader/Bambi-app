import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import {
	Avatar,
	Button,
	Chip,
	ListGroup,
	Separator,
	Skeleton,
	useThemeColor,
} from "heroui-native";
import { Fragment, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState, StateCard } from "@/src/components/bambi-screen";
import { useVisitor } from "@/src/lib/guest-store";
import { orpc } from "@/src/lib/orpc";
import { formatRelativeTime, supportChatHref } from "@/src/lib/support/support";
import { ensureSupportChatToken } from "@/src/lib/support/support-chat-store";

const UNREAD_CAP = 99;
// [id]가 "new"를 새 대화 시작으로 받는다 — 목록에서 방을 미리 만들지 않는다.
const NEW_CHAT_HREF = "/(seeker)/support/chat/new" as unknown as Href;

// 목록 행이 필요로 하는 필드만 구조적으로 받는다(getMyRooms 응답의 부분집합).
interface SupportRoom {
	id: string;
	lastMessageAt: Date | string;
	lastMessagePreview: string;
	status: string;
	unreadCount: number;
}

// 시트 안이라 네이티브 헤더가 없다 — 상단 인셋(시트 상단은 보통 0)을 직접 채운다.
function SheetHeader() {
	const insets = useSafeAreaInsets();
	const foreground = useThemeColor("foreground");

	return (
		<View style={{ paddingTop: insets.top }}>
			<View className="h-14 flex-row items-center justify-between px-4">
				<Text className="font-bold text-2xl text-foreground">대화</Text>
				<Pressable
					accessibilityLabel="닫기"
					accessibilityRole="button"
					className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
					hitSlop={8}
					// dismiss()는 이 중첩 Stack 안을 pop하려 해 시트가 안 닫힌다(canDismiss는
					// 같은 Stack에 2개 이상 있을 때만 true). back()은 처리 못 하면 부모 Stack으로
					// 올라가 시트를 내린다.
					onPress={() => router.back()}
				>
					<Ionicons color={foreground} name="close" size={22} />
				</Pressable>
			</View>
		</View>
	);
}

function SupportRoomRow({ room }: { room: SupportRoom }) {
	const preview = room.lastMessagePreview || "상담 메시지";

	return (
		<ListGroup.Item
			accessibilityLabel={`밤비알바 운영팀과의 상담, ${preview}, 읽지 않음 ${room.unreadCount}건`}
			className="py-3"
			onPress={() => router.push(supportChatHref(room.id) as unknown as Href)}
		>
			<ListGroup.ItemPrefix>
				<Avatar color="accent" size="md">
					<Avatar.Fallback>밤</Avatar.Fallback>
				</Avatar>
			</ListGroup.ItemPrefix>
			<ListGroup.ItemContent>
				<View className="flex-row items-center gap-2">
					<ListGroup.ItemTitle className="font-semibold" numberOfLines={1}>
						밤비알바 운영팀
					</ListGroup.ItemTitle>
					<Text className="text-muted text-xs">
						{formatRelativeTime(room.lastMessageAt)}
					</Text>
				</View>
				<Text className="text-foreground text-sm" numberOfLines={2}>
					{preview}
				</Text>
			</ListGroup.ItemContent>
			<ListGroup.ItemSuffix>
				<View className="items-end gap-1.5">
					{room.unreadCount > 0 ? (
						<Chip color="accent" size="sm" variant="primary">
							<Chip.Label>
								{room.unreadCount > UNREAD_CAP
									? `${UNREAD_CAP}+`
									: String(room.unreadCount)}
							</Chip.Label>
						</Chip>
					) : null}
					{room.status === "closed" ? (
						<Chip color="default" size="sm" variant="soft">
							<Chip.Label>종료</Chip.Label>
						</Chip>
					) : null}
				</View>
			</ListGroup.ItemSuffix>
		</ListGroup.Item>
	);
}

// 하단 플로팅 알약. 목록 위에 겹치므로 스크롤 콘텐츠는 pb-24로 끝 행을 비워 둔다.
function NewInquiryButton() {
	const accentForeground = useThemeColor("accent-foreground");

	return (
		<Button
			className="absolute bottom-6 self-center rounded-full shadow-lg"
			onPress={() => router.push(NEW_CHAT_HREF)}
		>
			<Button.Label>새 문의하기</Button.Label>
			<Ionicons color={accentForeground} name="paper-plane" size={18} />
		</Button>
	);
}

export default function SupportChatListScreen() {
	const visitor = useVisitor();
	const [identityError, setIdentityError] = useState<null | string>(null);
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
	const rooms = query.data?.rooms ?? [];

	return (
		<View className="flex-1 bg-background">
			<SheetHeader />
			{identityError ? (
				<Text className="px-4 pb-2 text-danger text-sm">{identityError}</Text>
			) : null}
			{query.isError ? (
				<ErrorState onRetry={() => query.refetch()} />
			) : (
				<ScrollView className="flex-1">
					<View className="gap-3 p-4 pb-24">
						{query.isPending ? (
							<Skeleton className="h-32 rounded-lg" />
						) : (
							<ListGroup variant="transparent">
								{rooms.map((room, index) => (
									<Fragment key={room.id}>
										{index > 0 ? <Separator /> : null}
										<SupportRoomRow room={room} />
									</Fragment>
								))}
							</ListGroup>
						)}
						{!query.isPending && rooms.length === 0 ? (
							<StateCard
								description="새 문의하기를 눌러 운영팀에 메시지를 보내세요."
								title="아직 나눈 대화가 없어요"
							/>
						) : null}
					</View>
				</ScrollView>
			)}
			<NewInquiryButton />
		</View>
	);
}
