import {
	MODERATION_REASON_MAX,
	MODERATION_REASON_MIN,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { Button, Dialog, RadioGroup, TextArea } from "heroui-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";

const FALLBACK_ERROR = "처리하지 못했어요. 사유를 확인하고 다시 시도해 주세요.";

export interface ReasonFormProps {
	/** 취소 자리 문구. 제재 2단계는 "뒤로"로 쓴다. */
	cancelLabel?: string;
	confirmLabel: string;
	danger?: boolean;
	defaultReason: string;
	onCancel: () => void;
	/** false를 돌려주면 폼을 유지한 채 실패 문구를 보인다. throw하면 그 메시지를 보인다. */
	onConfirm: (reason: string) => Promise<boolean>;
	onPendingChange?: (pending: boolean) => void;
	presets?: readonly string[];
}

// 사유 편집 본문. ReasonDialog와 SanctionDialog 2단계가 공유한다.
// 다이얼로그가 닫히면 Portal이 언마운트되므로 별도 초기화 없이 상태가 비워진다.
export function ReasonForm({
	cancelLabel = "취소",
	confirmLabel,
	danger = false,
	defaultReason,
	onCancel,
	onConfirm,
	onPendingChange,
	presets,
}: ReasonFormProps) {
	const [reason, setReason] = useState(defaultReason);
	const [preset, setPreset] = useState<string | undefined>(undefined);
	const [errorMessage, setErrorMessage] = useState<null | string>(null);
	const [isPending, setIsPending] = useState(false);
	const trimmed = reason.trim();
	const isTooShort = trimmed.length < MODERATION_REASON_MIN;

	// 프리셋은 시작 문구일 뿐이라 고른 뒤에도 그대로 고쳐 쓸 수 있게 둔다.
	const handlePreset = (value: string) => {
		setPreset(value);
		setReason(value);
	};

	// 서버 스키마 상한(500자)을 입력 단계에서 막는다.
	const handleChangeText = (text: string) =>
		setReason(text.slice(0, MODERATION_REASON_MAX));

	const handleConfirm = async () => {
		if (isTooShort || isPending) {
			return;
		}
		setIsPending(true);
		onPendingChange?.(true);
		setErrorMessage(null);
		try {
			const ok = await onConfirm(trimmed);
			if (!ok) {
				setErrorMessage(FALLBACK_ERROR);
			}
		} catch (error) {
			setErrorMessage(
				error instanceof Error && error.message ? error.message : FALLBACK_ERROR
			);
		} finally {
			setIsPending(false);
			onPendingChange?.(false);
		}
	};

	return (
		<View className="gap-4">
			{presets && presets.length > 0 ? (
				<RadioGroup onValueChange={handlePreset} value={preset}>
					{presets.map((item) => (
						<RadioGroup.Item key={item} value={item}>
							{item}
						</RadioGroup.Item>
					))}
				</RadioGroup>
			) : null}
			<TextArea
				onChangeText={handleChangeText}
				placeholder={`위 선택지를 고르거나 직접 작성해 주세요(${MODERATION_REASON_MIN}자 이상).`}
				value={reason}
			/>
			<Text className="text-muted text-xs">{`${trimmed.length}/${MODERATION_REASON_MAX}`}</Text>
			{errorMessage ? (
				<Text className="text-danger text-sm" selectable>
					{errorMessage}
				</Text>
			) : null}
			{/* 취소·확정을 flex-1로 반씩 나눠 한쪽만 작게 보이지 않게 한다(공고 삭제 다이얼로그와 같은 줄). */}
			<View className="flex-row gap-3">
				<View className="flex-1">
					<Button isDisabled={isPending} onPress={onCancel} variant="tertiary">
						<Button.Label>{cancelLabel}</Button.Label>
					</Button>
				</View>
				<View className="flex-1">
					<Button
						isDisabled={isTooShort || isPending}
						onPress={handleConfirm}
						variant={danger ? "danger" : "primary"}
					>
						<Button.Label>{isPending ? "처리 중" : confirmLabel}</Button.Label>
					</Button>
				</View>
			</View>
		</View>
	);
}

export interface ReasonDialogProps {
	confirmLabel: string;
	danger?: boolean;
	defaultReason: string;
	description?: string;
	isOpen: boolean;
	/** false면 다이얼로그를 열어둔 채 실패 문구를 보인다. */
	onConfirm: (reason: string) => Promise<boolean>;
	onOpenChange: (open: boolean) => void;
	presets?: readonly string[];
	title: string;
}

// 운영 상태 변경 공용 사유 다이얼로그. 상태 변경 API가 사유 2~500자를 필수로 받는다.
export function ReasonDialog({
	confirmLabel,
	danger,
	defaultReason,
	description,
	isOpen,
	onConfirm,
	onOpenChange,
	presets,
	title,
}: ReasonDialogProps) {
	const [isPending, setIsPending] = useState(false);
	const handleOpenChange = (next: boolean) => {
		if (!next && isPending) {
			return;
		}
		onOpenChange(next);
	};
	const handleConfirm = async (reason: string) => {
		const ok = await onConfirm(reason);
		if (ok) {
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
								<Dialog.Title>{title}</Dialog.Title>
								{description ? (
									<Dialog.Description>{description}</Dialog.Description>
								) : null}
							</View>
							<ReasonForm
								confirmLabel={confirmLabel}
								danger={danger}
								defaultReason={defaultReason}
								onCancel={() => handleOpenChange(false)}
								onConfirm={handleConfirm}
								onPendingChange={setIsPending}
								presets={presets}
							/>
						</View>
					</Dialog.Content>
				</KeyboardAvoidingView>
			</Dialog.Portal>
		</Dialog>
	);
}
