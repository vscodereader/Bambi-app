import { Button, Dialog } from "heroui-native";
import { View } from "react-native";

export interface ChatActionTarget {
	id: string;
	kind: "contact" | "interview";
}

export function ChatActionConfirmation({
	isPending,
	onClose,
	onDecision,
	target,
}: {
	isPending: boolean;
	onClose: () => void;
	onDecision: (confirmed: boolean) => void;
	target: ChatActionTarget | null;
}) {
	const isContact = target?.kind === "contact";
	return (
		<Dialog
			isOpen={target !== null}
			onOpenChange={(open) => !(open || isPending) && onClose()}
		>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<View className="gap-4">
						<View className="gap-1">
							<Dialog.Title>
								{isContact
									? "정말로 연락처를 공개하시겠습니까?"
									: "정말로 면접을 진행하시겠습니까?"}
							</Dialog.Title>
							<Dialog.Description>
								{isContact
									? "공개하시면 상대방에게 연락처가 공개됩니다."
									: "면접 수락시 반드시 시간을 준수해주시기 바랍니다."}
							</Dialog.Description>
						</View>
						<View className="flex-row gap-2">
							<View className="flex-1">
								<Button
									isDisabled={isPending}
									onPress={() => onDecision(false)}
									variant="secondary"
								>
									<Button.Label>취소</Button.Label>
								</Button>
							</View>
							<View className="flex-1">
								<Button isDisabled={isPending} onPress={() => onDecision(true)}>
									<Button.Label>확인</Button.Label>
								</Button>
							</View>
						</View>
					</View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}
