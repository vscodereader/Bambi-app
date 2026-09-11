import { Button, Dialog, Input, Label, TextField } from "heroui-native";
import { useRef, useState } from "react";
import {
	KeyboardAvoidingView,
	Platform,
	Text,
	type TextInput,
	View,
} from "react-native";

import { validateNewPassword } from "@/src/lib/bambi-native";
import type { AccountRecoveryScreen } from "@/src/lib/use-account-recovery";

// 제목·설명은 웹 account-recovery-dialog의 heading() 원문을 그대로 옮긴다 — 같은 흐름을
// 두 앱에서 다르게 설명하면 안내가 어긋난다.
const headingOf = (
	screen: AccountRecoveryScreen
): { description: string; title: string } => {
	if (screen.kind === "id-result") {
		return screen.loginId
			? {
					description: "본인인증으로 확인한 회원님의 아이디예요.",
					title: "가입된 아이디",
				}
			: {
					description:
						"아이디 없이 이메일로 가입된 계정이에요. 가입하신 이메일로 로그인해 주세요.",
					title: "이메일로 가입된 계정이에요",
				};
	}
	if (screen.kind === "password-form") {
		return {
			description: "새로 사용할 비밀번호를 입력해 주세요.",
			title: "비밀번호 재설정",
		};
	}
	return {
		description:
			"본인인증하신 정보로 가입된 계정을 찾지 못했어요. 회원가입 후 이용해 주세요.",
		title: "가입된 계정이 없어요",
	};
};

// 입력 상태는 이 컴포넌트만 들고, 호출부가 인증 건 ID를 key로 줘 인증 건마다 새로
// 마운트된다(웹과 동일). 부모에 두면 재설정 성공처럼 다이얼로그가 프로그램적으로 닫히는
// 경로에서 평문 비밀번호가 그대로 남아 다음 폼에 미리 채워진다 — heroui-native Dialog는
// isOpen prop이 밖에서 false가 될 때 onOpenChange를 부르지 않기 때문이다.
function PasswordForm({
	isResetPending,
	onCancel,
	onSubmitPassword,
	resetErrorText,
}: {
	isResetPending: boolean;
	onCancel: () => void;
	onSubmitPassword: (newPassword: string) => void;
	resetErrorText: null | string;
}) {
	const [password, setPassword] = useState("");
	const [passwordConfirm, setPasswordConfirm] = useState("");
	const [formError, setFormError] = useState<null | string>(null);
	const passwordConfirmRef = useRef<TextInput>(null);

	const handleSubmit = () => {
		if (isResetPending) {
			return; // onSubmitEditing 재진입 가드(로그인 화면과 같은 이유)
		}

		const error = validateNewPassword(password, passwordConfirm);

		if (error) {
			setFormError(error);
			return;
		}

		setFormError(null);
		onSubmitPassword(password);
	};

	// 클라 검증 오류와 서버 오류는 자리를 하나만 쓴다 — 둘을 같이 띄우면 방금 고친 문구가
	// 남아 화면이 사실과 어긋난다. resetErrorText는 훅이 이미 한국어로 바꿔 준 값이다.
	const errorText = formError ?? resetErrorText;

	return (
		<>
			<TextField>
				<Label>
					<Label.Text>새 비밀번호</Label.Text>
				</Label>
				<Input
					accessibilityLabel="새 비밀번호"
					autoCapitalize="none"
					autoComplete="new-password"
					onChangeText={setPassword}
					onSubmitEditing={() => passwordConfirmRef.current?.focus()}
					placeholder="8자 이상 입력해주세요."
					returnKeyType="next"
					secureTextEntry
					submitBehavior="submit"
					textContentType="newPassword"
					value={password}
				/>
			</TextField>
			<TextField>
				<Label>
					<Label.Text>새 비밀번호 확인</Label.Text>
				</Label>
				<Input
					accessibilityLabel="새 비밀번호 확인"
					autoCapitalize="none"
					autoComplete="new-password"
					onChangeText={setPasswordConfirm}
					// 키보드 완료 키로도 제출한다(로그인 화면 아이디→비밀번호 체인과 같은 패턴).
					onSubmitEditing={handleSubmit}
					placeholder="비밀번호를 다시 입력해주세요."
					ref={passwordConfirmRef}
					returnKeyType="done"
					secureTextEntry
					textContentType="newPassword"
					value={passwordConfirm}
				/>
			</TextField>
			{errorText ? (
				<Text className="text-danger text-sm" selectable>
					{errorText}
				</Text>
			) : null}
			<View className="flex-row gap-3">
				<View className="flex-1">
					{/* 전송 중 취소는 막는다 — 옵저버만 떼일 뿐 요청은 끝까지 진행돼
					    비밀번호가 실제로 바뀐 뒤에야 알럿이 맥락 없이 뜬다(웹과 동일). */}
					<Button
						isDisabled={isResetPending}
						onPress={onCancel}
						variant="tertiary"
					>
						<Button.Label>취소</Button.Label>
					</Button>
				</View>
				<View className="flex-1">
					<Button isDisabled={isResetPending} onPress={handleSubmit}>
						<Button.Label>{isResetPending ? "변경 중" : "확인"}</Button.Label>
					</Button>
				</View>
			</View>
		</>
	);
}

// 본인인증을 마친 뒤의 결과 화면(아이디 노출 · 비밀번호 재설정 폼 · 계정 없음)만 그린다.
// 인증 모달과 서버 호출은 useAccountRecovery가 들고 있고, 이 컴포넌트는 값만 받는다.
export function AccountRecoveryDialog({
	isResetPending,
	onClose,
	onSubmitPassword,
	onUseLoginId,
	resetErrorText,
	screen,
}: {
	isResetPending: boolean;
	onClose: () => void;
	onSubmitPassword: (newPassword: string) => void;
	onUseLoginId: (loginId: string) => void;
	resetErrorText: null | string;
	screen: AccountRecoveryScreen | null;
}) {
	// 재설정 요청 중에는 오버레이 탭·하드웨어 back으로도 닫지 않는다 — 닫아도 요청은 계속
	// 진행돼 결과가 맥락 없이 도착하거나(성공) 조용히 사라진다(실패).
	const handleOpenChange = (next: boolean) => {
		if (next || isResetPending) {
			return;
		}

		onClose();
	};

	const renderBody = (current: AccountRecoveryScreen) => {
		if (current.kind === "password-form") {
			return (
				<PasswordForm
					isResetPending={isResetPending}
					key={current.identityVerificationId}
					onCancel={() => handleOpenChange(false)}
					onSubmitPassword={onSubmitPassword}
					resetErrorText={resetErrorText}
				/>
			);
		}

		if (current.kind === "id-result" && current.loginId) {
			const foundLoginId = current.loginId;

			return (
				<>
					{/* 본인인증을 통과한 본인에게 보여주는 값이라 마스킹하지 않는다(웹과 동일).
					    긴 아이디는 잘리지 않고 줄바꿈되게 둔다. */}
					<Text
						className="rounded-lg border border-border bg-surface-secondary px-4 py-3 text-center font-extrabold text-foreground text-lg"
						selectable
					>
						{foundLoginId}
					</Text>
					<Button onPress={() => onUseLoginId(foundLoginId)}>
						<Button.Label>이 아이디로 로그인</Button.Label>
					</Button>
				</>
			);
		}

		// id-result(아이디 없는 이메일 가입) · not-found: 닫기만 남는다. 웹의 "회원가입 하러
		// 가기"는 네이티브에 회원가입 라우트가 없어 안내 알럿으로 되돌아갈 뿐이라 넣지 않는다.
		// 아무 액션도 없는 닫기라 primary를 주지 않는다(웹도 secondary "닫기").
		return (
			<Button onPress={() => handleOpenChange(false)} variant="secondary">
				<Button.Label>닫기</Button.Label>
			</Button>
		);
	};

	return (
		<Dialog isOpen={screen !== null} onOpenChange={handleOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay />
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : undefined}
				>
					{/* 스와이프 닫기도 같이 막는다 — 제스처는 시트를 먼저 밀어낸 뒤에야
					    onOpenChange를 부르므로, 가드로 되돌려도 내용만 사라진 채 남는다. */}
					<Dialog.Content isSwipeable={!isResetPending}>
						{screen ? (
							<View className="gap-4">
								<View className="gap-1.5">
									<Dialog.Title>{headingOf(screen).title}</Dialog.Title>
									<Dialog.Description>
										{headingOf(screen).description}
									</Dialog.Description>
								</View>
								{renderBody(screen)}
							</View>
						) : null}
					</Dialog.Content>
				</KeyboardAvoidingView>
			</Dialog.Portal>
		</Dialog>
	);
}
