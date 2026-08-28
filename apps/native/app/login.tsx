import { Ionicons } from "@expo/vector-icons";
import { type Href, Redirect } from "expo-router";
import {
	Alert,
	Button,
	FieldError,
	Input,
	InputGroup,
	Label,
	Spinner,
	Surface,
	TextField,
	useThemeColor,
} from "heroui-native";
import { useEffect, useRef, useState } from "react";
import {
	AccessibilityInfo,
	Pressable,
	Text,
	type TextInput,
	View,
} from "react-native";
import { authClient } from "@/lib/auth-client";
import { BambiLogo } from "@/src/components/bambi-logo";
import {
	BambiHeader,
	BambiScreen,
	LoadingState,
} from "@/src/components/bambi-screen";
import {
	isEmailLoginId,
	type NativeLoginErrors,
	validateNativeLoginInput,
} from "@/src/lib/bambi-native";
import { queryClient } from "@/src/lib/orpc";

type LoginStatus = "handoff" | "idle" | "submitting";
type NoticeStatus = "danger" | "warning";

const ctaLabels: Record<LoginStatus, string> = {
	handoff: "들어가는 중",
	idle: "로그인",
	submitting: "로그인 중",
};

// 200 응답 뒤 /get-session 왕복이 끝나지 않는 경우(배포 cookiePrefix 불일치 등) 탈출용.
const handoffTimeoutMs = 8000;

export default function LoginScreen() {
	const [loginId, setLoginId] = useState("");
	const [password, setPassword] = useState("");
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);
	const [errors, setErrors] = useState<NativeLoginErrors>({});
	const [notice, setNotice] = useState<null | {
		status: NoticeStatus;
		text: string;
	}>(null);
	const [status, setStatus] = useState<LoginStatus>("idle");
	const passwordRef = useRef<TextInput>(null);
	const handoffTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
	const session = authClient.useSession();
	const [accentForegroundColor, mutedColor] = useThemeColor([
		"accent-foreground",
		"muted",
	]);

	useEffect(
		() => () => {
			if (handoffTimerRef.current) {
				clearTimeout(handoffTimerRef.current);
			}
		},
		[]
	);

	const showNotice = (noticeStatus: NoticeStatus, text: string) => {
		setNotice({ status: noticeStatus, text });
		// Alert 루트가 role="alert"를 달지만 iOS VoiceOver는 자동 낭독하지 않는다.
		AccessibilityInfo.announceForAccessibility(text);
	};

	// 입력을 고치면 Alert도 함께 지운다 — 안 지우면 아이디를 다 채운 뒤에도
	// "입력해 주세요"가 남아 화면이 사실과 어긋난다(서버 오류 문구도 같은 이유).
	const handleLoginIdChange = (value: string) => {
		setLoginId(value);
		setNotice(null);

		if (errors.loginId) {
			setErrors({ ...errors, loginId: undefined });
		}
	};

	const handlePasswordChange = (value: string) => {
		setPassword(value);
		setNotice(null);

		if (errors.password) {
			setErrors({ ...errors, password: undefined });
		}
	};

	const handleSubmit = async () => {
		if (status !== "idle") {
			return; // onSubmitEditing 재진입 가드
		}

		const nextErrors = validateNativeLoginInput(loginId, password);

		setErrors(nextErrors);

		if (nextErrors.loginId || nextErrors.password) {
			// 여러 필드가 동시에 틀려도 폼 순서상 첫 오류 하나만 읽는다. 두 문장을 붙이면
			// 낭독이 길어지고, 첫 오류를 고쳐 다시 누르면 남은 오류가 그때 낭독된다.
			showNotice("danger", nextErrors.loginId ?? nextErrors.password ?? "");
			return;
		}

		const id = loginId.trim(); // 검증·전송 모두 같은 값

		setNotice(null);
		setStatus("submitting");

		let isSignedIn = false;
		const callbacks = {
			onError(context: { error: { message?: string; statusText?: string } }) {
				showNotice(
					"danger",
					context.error.message ??
						context.error.statusText ??
						"요청을 처리하지 못했어요."
				);
			},
			onSuccess() {
				isSignedIn = true;
				// 세션 만료로 이 화면에 온 뒤 다른 계정으로 로그인하는 경로는 로그아웃을
				// 거치지 않는다. invalidate는 이전 계정 데이터를 캐시에 남기므로(비활성
				// 쿼리는 재요청도 안 함) 로그아웃과 같은 방식으로 캐시를 비운다.
				queryClient.clear();
			},
		};

		try {
			await (isEmailLoginId(id)
				? authClient.signIn.email({ email: id, password }, callbacks)
				: authClient.signIn.username({ password, username: id }, callbacks));
		} catch {
			// better-auth는 catchAllError를 쓰지 않아 무응답 실패가 예외로 튄다.
			showNotice(
				"warning",
				"서버에 연결하지 못했어요. 네트워크 상태를 확인한 뒤 다시 시도해 주세요."
			);
		} finally {
			if (isSignedIn) {
				setStatus("handoff");
				handoffTimerRef.current = setTimeout(() => {
					setStatus("idle");
					showNotice(
						"warning",
						"로그인은 됐지만 세션을 확인하지 못했어요. 다시 시도해 주세요."
					);
				}, handoffTimeoutMs);
			} else {
				setStatus("idle");
			}
		}
	};

	if (session.isPending) {
		return <LoadingState label="로그인 상태를 확인하고 있습니다." />;
	}

	if (session.data?.user) {
		return <Redirect href={"/" as Href} />;
	}

	return (
		// 이 화면만 headerShown: false(app/_layout.tsx)라 상단 인셋을 직접 져야 한다.
		// 인셋은 콘텐츠 블록이 아니라 스크롤 뷰포트에 얹는다(hasTopInset) — 콘텐츠에 주면
		// 위쪽만 줄 때는 중앙이 어긋나고 위아래 대칭으로 줄 때는 블록이 인셋 두 배만큼
		// 길어져 오버플로가 악화되지만, 뷰포트를 줄이면 중앙 정렬은 그대로 성립하면서
		// 내용이 길어져도 최상단이 상태바 밑으로 들어가지 않는다.
		<BambiScreen
			hasTopInset
			isCentered
			scrollViewProps={{ automaticallyAdjustKeyboardInsets: true }}
		>
			<BambiHeader
				description="아이디 또는 이메일과 비밀번호로 로그인합니다."
				leading={<BambiLogo />}
				title="밤비알바 로그인"
			/>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<TextField isInvalid={Boolean(errors.loginId)}>
					<Label>
						<Label.Text>아이디</Label.Text>
					</Label>
					<Input
						accessibilityLabel="아이디"
						autoCapitalize="none"
						autoComplete="username"
						autoFocus
						keyboardType="email-address"
						onChangeText={handleLoginIdChange}
						onSubmitEditing={() => passwordRef.current?.focus()}
						placeholder="아이디(이메일)를 입력해주세요."
						returnKeyType="next"
						submitBehavior="submit"
						textContentType="username"
						value={loginId}
					/>
					<FieldError>{errors.loginId}</FieldError>
				</TextField>
				<TextField isInvalid={Boolean(errors.password)}>
					<Label>
						<Label.Text>비밀번호</Label.Text>
					</Label>
					<InputGroup>
						<InputGroup.Input
							accessibilityLabel="비밀번호"
							autoCapitalize="none"
							autoComplete="current-password"
							onChangeText={handlePasswordChange}
							onSubmitEditing={handleSubmit}
							placeholder="비밀번호를 입력해주세요."
							ref={passwordRef}
							returnKeyType="go"
							secureTextEntry={!isPasswordVisible}
							textContentType="password"
							value={password}
						/>
						<InputGroup.Suffix className="px-2">
							<Pressable
								accessibilityLabel={
									isPasswordVisible ? "비밀번호 숨기기" : "비밀번호 표시"
								}
								accessibilityRole="button"
								className="h-full justify-center px-2 active:opacity-75"
								hitSlop={12}
								onPress={() => setIsPasswordVisible(!isPasswordVisible)}
							>
								<Ionicons
									color={mutedColor}
									name={isPasswordVisible ? "eye-off-outline" : "eye-outline"}
									size={20}
								/>
							</Pressable>
						</InputGroup.Suffix>
					</InputGroup>
					<FieldError>{errors.password}</FieldError>
				</TextField>
				{notice ? (
					<Alert status={notice.status}>
						<Alert.Indicator />
						<Alert.Content>
							<Alert.Title>{notice.text}</Alert.Title>
						</Alert.Content>
					</Alert>
				) : null}
				<Button isDisabled={status !== "idle"} onPress={handleSubmit} size="lg">
					{/* color="default"는 "기본색"이 아니라 --accent 토큰이라, 코랄 CTA 위에
					    코랄 스피너가 얹혀 보이지 않는다. 화살표와 같은 전경색을 넘긴다. */}
					{status === "idle" ? null : (
						<Spinner color={accentForegroundColor} size="sm" />
					)}
					<Button.Label>{ctaLabels[status]}</Button.Label>
				</Button>
				{/* 청소년유해매체물 고지. 웹 AdultNotice와 같은 표현을 쓴다 — 색은 muted
				    계열로만 둔다(코럴을 쓰면 주 액션인 로그인 CTA와 위계가 뒤집힌다).
				    role="alert"를 달지 않는다: 상시 노출되는 법정 고지를 매 렌더마다
				    스크린리더가 경보로 읽어버린다. */}
				<View className="flex-row items-start gap-3">
					<View className="h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-muted">
						<Text className="font-extrabold text-muted text-sm">19</Text>
					</View>
					<Text className="flex-1 text-muted text-xs leading-5" selectable>
						본 정보내용은 청소년 유해매체물로서 정보통신망 이용촉진 및 정보보호
						등에 관한 법률 및 청소년 보호법의 규정에 의하여 만 19세 미만의
						청소년이 이용할 수 없습니다.
					</Text>
				</View>
			</Surface>
		</BambiScreen>
	);
}
