import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, Redirect, router } from "expo-router";
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
import { AccountRecoveryDialog } from "@/src/components/account-recovery-dialog";
import { BambiLogo } from "@/src/components/bambi-logo";
import {
	AdultNotice,
	BambiHeader,
	BambiScreen,
	LoadingState,
	notifyWebOnly,
	Pill,
} from "@/src/components/bambi-screen";
import {
	isEmailLoginId,
	type NativeLoginErrors,
	validateNativeLoginInput,
} from "@/src/lib/bambi-native";
import { clearGuestToken } from "@/src/lib/guest-store";
import { orpc, queryClient } from "@/src/lib/orpc";
import { useAccountRecovery } from "@/src/lib/use-account-recovery";
import { useGuestVerification } from "@/src/lib/use-identity-verification";
import { isSignupAvailable } from "@/src/lib/use-signup";

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
	const {
		isAvailable: isGuestVerifyAvailable,
		isPending: isGuestVerifyPending,
		startGuestVerification,
		verification,
	} = useGuestVerification();
	const {
		closeScreen: closeRecovery,
		isAvailable: isRecoveryAvailable,
		isPending: isRecoveryPending,
		isResetPending,
		resetErrorText,
		screen: recoveryScreen,
		startFindId,
		startResetPassword,
		submitNewPassword,
		verification: recoveryVerification,
	} = useAccountRecovery();
	const [accentForegroundColor, defaultForegroundColor, mutedColor] =
		useThemeColor(["accent-foreground", "default-foreground", "muted"]);

	// 가입 보너스 안내(웹 SignupBonusCallout) — 웹은 로그인 모드의 회원가입 링크 밑에만
	// 그린다. 0이거나 로딩 중이면 숨긴다. session.isPending early return 위에서 부른다.
	const signupBonusQuery = useQuery(
		orpc.bambi.pointSettings.getPublicSignupBonus.queryOptions()
	);
	const bonusPoints = signupBonusQuery.data?.signupPoints ?? 0;

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
				// 게스트로 둘러보다 회원 전환하는 경로에서는 게스트 토큰이 남아 있다. 세션이
				// 생기면 더는 게스트가 아니므로 웹 clearGuestCookie와 같은 이유로 지운다(실패 무시).
				clearGuestToken().catch(() => undefined);
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
		// 키보드 회피는 Container의 KeyboardAwareScrollView가 전담한다.
		// automaticallyAdjustKeyboardInsets를 같이 켜면 RN contentInset과 라이브러리
		// 스페이서가 겹쳐 키보드 높이만큼 두 번 빠진다.
		<BambiScreen hasTopInset isCentered>
			<BambiHeader
				description="아이디 또는 이메일과 비밀번호로 로그인합니다."
				leading={<BambiLogo />}
				title="밤비알바 로그인"
			/>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<TextField isInvalid={Boolean(errors.loginId)}>
					{/* 아이디 찾기·비밀번호 재설정은 useAccountRecovery로 실배선됐다 — 포트원
					    KCP 인증창을 앱 안 WebView로 열어 본인인증을 마치면 계정을 조회하고,
					    아래 AccountRecoveryDialog가 결과(아이디 노출·비밀번호 재설정 폼·계정
					    없음)를 그린다. EXPO_PUBLIC_PORTONE_STORE_ID/CHANNEL_KEY 미설정이면
					    isAvailable=false라 기존 웹 안내로 폴백한다.
					    로그인 제출 중(status !== "idle")에도 막는다 — 세션이 잡히면 이 화면이
					    Redirect로 언마운트돼 진행 중인 인증 모달이 그대로 사라진다. 계정 조회와 비회원
					    인증은 서로의 진행 중 상태로 양쪽 다 막는다 — 한쪽만 막으면 인증 모달 두 개가
					    동시에 뜨거나, 게스트 전환의 화면 이동이 진행 중인 인증 모달을 날린다.
					    링크 색은 --link(#2969ff)를 일부러 안 쓴다 — surface-secondary 위에서
					    4.41:1이라 본문 크기 AA(4.5:1)에 미달한다. 웹과 같은 muted 계열에
					    hover가 없는 네이티브용으로 상시 underline을 얹어 탭 가능함을 알린다.
					    Pressable에 shrink를 준 이유는 폰트 배율을 키우면 라벨+링크가 256dp를
					    넘는데 Surface가 overflow-hidden이라 꼬리가 잘리기 때문. flex-1은
					    남는 폭까지 먹어 링크가 오른쪽 끝에 붙지 않으므로 쓰지 않는다. */}
					<View className="flex-row items-center justify-between">
						<Label>
							<Label.Text>아이디</Label.Text>
						</Label>
						<Pressable
							accessibilityRole="button"
							className="shrink active:opacity-75"
							disabled={
								isGuestVerifyPending || isRecoveryPending || status !== "idle"
							}
							hitSlop={12}
							onPress={
								isRecoveryAvailable
									? startFindId
									: () => notifyWebOnly("아이디 찾기")
							}
						>
							<Text className="font-semibold text-muted text-xs underline">
								아이디 찾기
							</Text>
						</Pressable>
					</View>
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
					<View className="flex-row items-center justify-between">
						<Label>
							<Label.Text>비밀번호</Label.Text>
						</Label>
						<Pressable
							accessibilityRole="button"
							className="shrink active:opacity-75"
							disabled={
								isGuestVerifyPending || isRecoveryPending || status !== "idle"
							}
							hitSlop={12}
							onPress={
								isRecoveryAvailable
									? startResetPassword
									: () => notifyWebOnly("비밀번호 재설정")
							}
						>
							<Text className="font-semibold text-muted text-xs underline">
								비밀번호를 잊으셨나요?
							</Text>
						</Pressable>
					</View>
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
				{/* 비회원 인증은 useGuestVerification으로 실배선됐다 — 포트원 KCP 인증창을
				    앱 안 WebView(<IdentityVerification/>)로 열어 본인인증을 마치고, 서버가
				    발급한 게스트 토큰을 SecureStore에 저장한 뒤 구직자 탭으로 전환한다.
				    EXPO_PUBLIC_PORTONE_STORE_ID/CHANNEL_KEY 미설정(포트원 콘솔 발급 전)이면
				    isAvailable=false라 기존 웹 안내로 폴백한다.
				    회원가입은 /signup(웹과 같은 2단계 — 본인인증 → 가입 폼)으로 보낸다. 안내를
				    인라인 Alert이 아니라 OS 알럿으로 띄우는 이유는 notifyWebOnly 주석 참고 — 이 두
				    버튼은 Alert 슬롯보다 아래에 있다.
				    위계는 로그인(primary) > 비회원 인증(secondary) > 회원가입(ghost) —
				    tertiary는 secondary와 배경이 같은 bg-default라 두 버튼이 같은 무게로
				    보였다. 웹처럼 텍스트 링크가 되는 ghost(bg-transparent)가 진짜 3단계다.
				    아이콘·라벨 색은 secondary 기본값(accent-soft-foreground, 어두운 코랄)
				    대신 default-foreground로 덮는다 — 코랄은 주 액션인 로그인 CTA의 색이라
				    바로 밑에서 같은 색을 쓰면 위계가 흐려진다. bg-default 위 전경 토큰이라
				    라이트에서 검정(#111827), 다크에서는 반대로 밝아져 대비가 유지된다.
				    accessibilityLabel이 없으면 TalkBack이 Ionicons의 사설영역 글리프
				    코드포인트까지 라벨에 합쳐 읽는다(비밀번호 보기 토글과 같은 이유). */}
				<Button
					accessibilityLabel="비회원으로 인증하기"
					isDisabled={
						isGuestVerifyPending || isRecoveryPending || status !== "idle"
					}
					onPress={
						isGuestVerifyAvailable
							? startGuestVerification
							: () => notifyWebOnly("비회원 인증")
					}
					size="lg"
					variant="secondary"
				>
					<Ionicons
						color={defaultForegroundColor}
						name="call-outline"
						size={20}
					/>
					<Button.Label className="text-default-foreground">
						{isGuestVerifyPending ? "인증 중" : "비회원으로 인증하기"}
					</Button.Label>
				</Button>
				{verification}
				{recoveryVerification}
				<AccountRecoveryDialog
					isResetPending={isResetPending}
					onClose={closeRecovery}
					onSubmitPassword={submitNewPassword}
					// setLoginId가 아니라 handleLoginIdChange를 쓴다 — 값을 채우면서 직전
					// 오류·Alert까지 지워야 아이디가 다 찬 뒤에도 "입력해 주세요"가 남지 않는다.
					onUseLoginId={(foundLoginId) => {
						handleLoginIdChange(foundLoginId);
						closeRecovery();
						passwordRef.current?.focus();
					}}
					resetErrorText={resetErrorText}
					screen={recoveryScreen}
				/>
				{/* 좁은 화면에서 안내 문구와 버튼이 한 줄에 못 들어가면 접히게 둔다.
				    형제 버튼(비회원 인증·아이디 찾기)과 같은 진행 중 가드를 건다 — 비회원
				    인증 발급 대기 중 signup으로 빠지면 완료 시 게스트 화면 전환이 signup을
				    날린다. env 미설정이면 형제 버튼과 같은 타이밍에 즉시 안내로 폴백한다. */}
				<View className="flex-row flex-wrap items-center justify-center gap-1">
					<Text className="text-muted text-sm">밤비알바가 처음이신가요?</Text>
					<Button
						isDisabled={
							isGuestVerifyPending || isRecoveryPending || status !== "idle"
						}
						onPress={
							isSignupAvailable
								? () => router.push("/signup" as Href)
								: () => notifyWebOnly("회원가입")
						}
						size="sm"
						variant="ghost"
					>
						<Button.Label>회원가입</Button.Label>
					</Button>
				</View>
				{/* 가입 보너스 안내(웹 SignupBonusCallout) — 회원가입 링크 밑에만 둔다.
				    Pill이 self-start라 items-center로는 왼쪽에 붙는다(자식 alignSelf가
				    부모 alignItems를 덮는다). flex-row+justify-center로 가운데에 둔다. */}
				{bonusPoints > 0 ? (
					<View className="flex-row justify-center">
						<Pill tone="accent">
							지금 회원가입 시, {bonusPoints.toLocaleString("ko-KR")}포인트
							지급!
						</Pill>
					</View>
				) : null}
				<AdultNotice />
			</Surface>
		</BambiScreen>
	);
}
