import { Chip } from "heroui-native";
import { View } from "react-native";

// 날짜가 바뀌는 첫 메시지 위에 가운데 정렬로 뜨는 칩(annotateChatMessages.dateLabel).
export function ChatDateChip({ label }: { label: string }) {
	return (
		<View className="items-center py-3">
			<Chip color="default" size="sm" variant="soft">
				<Chip.Label>{label}</Chip.Label>
			</Chip>
		</View>
	);
}
