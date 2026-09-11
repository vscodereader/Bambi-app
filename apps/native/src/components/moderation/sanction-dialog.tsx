import {
	SANCTION_CHOICES,
	type SanctionChoice,
	type SanctionStatus,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { Button, Dialog } from "heroui-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";

import { ReasonForm } from "@/src/components/moderation/reason-dialog";

export interface SanctionDialogProps {
	isOpen: boolean;
	/** false면 다이얼로그를 열어둔 채 실패 문구를 보인다. */
	onConfirm: (status: SanctionStatus, reason: string) => Promise<boolean>;
	onOpenChange: (open: boolean) => void;
	targetName: string;
}

// 사용자 제재 다이얼로그. 1단계 수위 선택(경고·정지) → 2단계 사유 편집.
export function SanctionDialog({
	isOpen,
	onConfirm,
	onOpenChange,
	targetName,
}: SanctionDialogProps) {
	const [picked, setPicked] = useState<null | SanctionChoice>(null);
	const [isPending, setIsPending] = useState(false);

	const handleOpenChange = (next: boolean) => {
		if (!next && isPending) {
			return;
		}
		if (!next) {
			setPicked(null);
		}
		onOpenChange(next);
	};

	const handleConfirm = async (reason: string) => {
		if (!picked) {
			return false;
		}
		const ok = await onConfirm(picked.status, reason);
		if (ok) {
			setPicked(null);
			onOpenChange(false);
		}
		return ok;
	};

	return (
		<Dialog isOpen={isOpen} onOpenChange={handleOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay />
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : undefined}
				>
					<Dialog.Content isSwipeable={!isPending}>
						<View className="gap-4">
							<View className="gap-1.5">
								<Dialog.Title>{`${targetName} 제재`}</Dialog.Title>
								<Dialog.Description>
									{picked
										? picked.description
										: "제재 수위를 고르면 사유를 작성할 수 있어요."}
								</Dialog.Description>
							</View>
							{picked ? (
								// 수위를 바꾸려면 "뒤로"로 1단계를 거치므로 폼은 매번 새로 마운트된다.
								<ReasonForm
									cancelLabel="뒤로"
									confirmLabel={`${picked.label} 적용`}
									danger={picked.danger}
									defaultReason={picked.defaultReason}
									onCancel={() => setPicked(null)}
									onConfirm={handleConfirm}
									onPendingChange={setIsPending}
								/>
							) : (
								<View className="gap-3">
									{SANCTION_CHOICES.map((choice) => (
										<View className="gap-1.5" key={choice.status}>
											<Button
												onPress={() => setPicked(choice)}
												variant={choice.danger ? "danger" : "secondary"}
											>
												<Button.Label>{choice.label}</Button.Label>
											</Button>
											<Text className="text-muted text-xs">
												{choice.description}
											</Text>
										</View>
									))}
									<Button
										onPress={() => handleOpenChange(false)}
										variant="tertiary"
									>
										<Button.Label>취소</Button.Label>
									</Button>
								</View>
							)}
						</View>
					</Dialog.Content>
				</KeyboardAvoidingView>
			</Dialog.Portal>
		</Dialog>
	);
}
