import { Button, Dialog } from "heroui-native";
import { View } from "react-native";

export interface ConfirmDialogProps {
	confirmLabel: string;
	danger?: boolean;
	description: string;
	isOpen: boolean;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	title: string;
}

// 되돌리기 어려운 조치(커뮤니티 글·댓글 삭제 등)의 확인 단계.
// 공고 삭제 다이얼로그와 같은 구조 — 확인 뒤 실제 사유 입력은 ReasonDialog가 받는다.
export function ConfirmDialog({
	confirmLabel,
	danger = false,
	description,
	isOpen,
	onConfirm,
	onOpenChange,
	title,
}: ConfirmDialogProps) {
	return (
		<Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<Dialog.Title>{title}</Dialog.Title>
					<Dialog.Description>{description}</Dialog.Description>
					<View className="flex-row gap-3 pt-2">
						<View className="flex-1">
							<Button onPress={() => onOpenChange(false)} variant="tertiary">
								<Button.Label>취소</Button.Label>
							</Button>
						</View>
						<View className="flex-1">
							<Button
								onPress={onConfirm}
								variant={danger ? "danger" : "primary"}
							>
								<Button.Label>{confirmLabel}</Button.Label>
							</Button>
						</View>
					</View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}
