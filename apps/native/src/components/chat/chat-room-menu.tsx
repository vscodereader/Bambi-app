import { Ionicons } from "@expo/vector-icons";
import { Menu, useThemeColor } from "heroui-native";
import { Pressable } from "react-native";

const MENU_WIDTH = 220;

// 헤더 우측 케밥. 연락처 공개 보기(확정 면접 있을 때) · 신고 · 차단 · 나가기.
// 차단·나가기 확인 Dialog는 화면([id].tsx)이 띄운다 — 메뉴는 의도만 올린다.
export function ChatRoomMenu({
	canRevealContact,
	onBlock,
	onLeave,
	onReport,
	onRevealContact,
}: {
	canRevealContact: boolean;
	onBlock: () => void;
	onLeave: () => void;
	onReport: () => void;
	onRevealContact: () => void;
}) {
	const foreground = useThemeColor("foreground");

	return (
		<Menu>
			<Menu.Trigger asChild>
				<Pressable
					accessibilityLabel="채팅방 메뉴"
					accessibilityRole="button"
					className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
					hitSlop={8}
				>
					<Ionicons color={foreground} name="ellipsis-vertical" size={20} />
				</Pressable>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Overlay />
				<Menu.Content presentation="popover" width={MENU_WIDTH}>
					{canRevealContact ? (
						<Menu.Item onPress={onRevealContact}>
							<Menu.ItemTitle>연락처 공개</Menu.ItemTitle>
						</Menu.Item>
					) : null}
					<Menu.Item onPress={onReport}>
						<Menu.ItemTitle>신고</Menu.ItemTitle>
					</Menu.Item>
					<Menu.Item onPress={onBlock} variant="danger">
						<Menu.ItemTitle>차단</Menu.ItemTitle>
					</Menu.Item>
					<Menu.Item onPress={onLeave} variant="danger">
						<Menu.ItemTitle>채팅방 나가기</Menu.ItemTitle>
					</Menu.Item>
				</Menu.Content>
			</Menu.Portal>
		</Menu>
	);
}
