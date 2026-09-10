import { router, useLocalSearchParams } from "expo-router";
import { Button, Dialog } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";

const STEPS = [
	{
		description:
			"화면 위 돋보기에서 업종, 지역과 공고 제목을 검색할 수 있어요.",
		title: "공고 검색과 필터",
	},
	{
		description: "구인자와 나눈 대화는 아래 채팅 탭에서 확인할 수 있어요.",
		title: "채팅",
	},
	{
		description: "면접 일정, 후기, 신고와 계정 설정은 내 정보에서 확인하세요.",
		title: "내 정보",
	},
] as const;

export function FeatureCoachmark() {
	const params = useLocalSearchParams<{ coachmarks?: string }>();
	const [index, setIndex] = useState(0);
	const [closed, setClosed] = useState(false);
	const open = params.coachmarks === "1" && !closed;
	const step = STEPS[index] ?? STEPS[0];
	const close = () => {
		setClosed(true);
		router.setParams({ coachmarks: undefined });
	};
	return (
		<Dialog isOpen={open} onOpenChange={(next) => !next && close()}>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<View className="gap-4">
						<Dialog.Title>{step.title}</Dialog.Title>
						<Dialog.Description>{step.description}</Dialog.Description>
						<View className="flex-row gap-2">
							<View className="flex-1">
								<Button
									isDisabled={index === 0}
									onPress={() => setIndex((value) => Math.max(0, value - 1))}
									variant="secondary"
								>
									<Button.Label>이전</Button.Label>
								</Button>
							</View>
							<View className="flex-1">
								<Button
									onPress={() =>
										index === STEPS.length - 1
											? close()
											: setIndex((value) => value + 1)
									}
								>
									<Button.Label>
										{index === STEPS.length - 1 ? "확인" : "다음"}
									</Button.Label>
								</Button>
							</View>
						</View>
					</View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}
