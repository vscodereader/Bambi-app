import { Button } from "heroui-native";
import { Text } from "react-native";
import { StateCard } from "@/src/components/bambi-screen";

export function QueryFeedback({
	query,
	title,
	empty = false,
}: {
	query: {
		isPending: boolean;
		isError: boolean;
		isSuccess: boolean;
		refetch: () => Promise<unknown>;
	};
	title: string;
	empty?: boolean;
}) {
	if (query.isPending) {
		return (
			<Text className="text-muted text-sm">{title}을 불러오고 있어요.</Text>
		);
	}
	if (query.isError) {
		return (
			<StateCard
				action={
					<Button onPress={() => query.refetch()} size="sm" variant="secondary">
						<Button.Label>다시 시도</Button.Label>
					</Button>
				}
				description="입력 내용은 유지됩니다. 다시 시도해 주세요."
				title={`${title} 조회 실패`}
			/>
		);
	}
	if (query.isSuccess && empty) {
		return (
			<Text className="text-muted text-sm">표시할 {title}이 없습니다.</Text>
		);
	}
	return null;
}
