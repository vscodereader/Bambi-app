// 웹 auth-panel.tsx와 같은 2단계 회원가입: 본인인증(verify) → 가입 폼(form).
// 오케스트레이션(인증 건 발급·중복 계정 확인·signUp·프로필 생성·네비게이션)은
// useSignup 훅이 전담하고, 이 화면은 두 단계를 그리기만 한다. 세션 가드(Redirect)를
// 두지 않는다 — signUp 성공 즉시 세션이 truthy가 되는데 가드가 있으면 프로필 생성 전에
// 화면이 언마운트된다. 진입 라우팅과 홈 계산은 훅의 router.replace("/")가 맡는다.

import { LOGIN_ID_HELP_TEXT } from "@bambi-app/auth/login-id";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useNavigation } from "expo-router";
import {
	Alert,
	Button,
	Checkbox,
	cn,
	Input,
	InputGroup,
	Label,
	RadioGroup,
	Spinner,
	Surface,
	TextField,
	useThemeColor,
} from "heroui-native";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
	AccessibilityInfo,
	Alert as NativeAlert,
	Pressable,
	Text,
	type TextInput,
	View,
} from "react-native";
import {
	AdultNotice,
	BambiScreen,
	notifyWebOnly,
} from "@/src/components/bambi-screen";
import type { SignupRole } from "@/src/lib/bambi-native";
import { useSignup } from "@/src/lib/use-signup";

// 웹 SIGNUP_STEPS와 같은 어휘. 인증 → 정보 입력이라는 실제 순서가 있어 단계를 표기한다.
const SIGNUP_STEPS = ["본인인증", "정보 입력"] as const;

function SignupSteps({ current }: { current: 1 | 2 }) {
	return (
		// accessible=true View는 자식을 단일 노드로 묶어 현재 단계를 색뿐 아니라
		// 라벨로도 전달한다(웹 aria-current="step" 대응).
		<View
			accessibilityLabel={`2단계 중 ${current}단계: ${SIGNUP_STEPS[current - 1]}`}
			accessible
			className="flex-row items-center gap-2"
		>
			{SIGNUP_STEPS.map((label, index) => {
				const isCurrent = index + 1 === current;
				return (
					<View className="flex-row items-center gap-2" key={label}>
						{index > 0 ? <View className="h-px w-4 bg-border" /> : null}
						<View
							className={cn(
								"size-5 items-center justify-center rounded-full",
								isCurrent ? "bg-accent" : "bg-muted/20"
							)}
						>
							<Text
								className={cn(
									"font-bold text-xs",
									isCurrent ? "text-accent-foreground" : "text-muted"
								)}
							>
								{index + 1}
							</Text>
						</View>
						<Text
							className={cn(
								"font-bold text-xs",
								isCurrent ? "text-foreground" : "text-muted"
							)}
						>
							{label}
						</Text>
					</View>
				);
			})}
		</View>
	);
}

type NoticeStatus = "danger" | "warning";

// 1단계: 본인인증 카드. 인증 모달(verification)을 그린다. 19금 고지는 웹처럼 카드
// 밖(BambiScreen footer)에 두어 두 단계 모두 상시 노출한다.
function VerifyStep({
	isVerifyPending,
	onVerify,
	verification,
}: {
	isVerifyPending: boolean;
	onVerify: () => void;
	verification: ReactNode;
}) {
	const accentForegroundColor = useThemeColor("accent-foreground");
	return (
		<Surface className="gap-4 rounded-lg p-4" variant="secondary">
			<Text className="text-muted text-sm leading-5" selectable>
				만 19세 이상 본인인증을 마치면 가입 정보를 입력할 수 있어요.
			</Text>
			<Button isDisabled={isVerifyPending} onPress={onVerify} size="lg">
				{isVerifyPending ? (
					<Spinner color={accentForegroundColor} size="sm" />
				) : null}
				<Button.Label>
					{isVerifyPending ? "인증 중" : "본인인증하고 계속하기"}
				</Button.Label>
			</Button>
			{verification}
		</Surface>
	);
}

export default function SignupScreen() {
	const {
		doneRef,
		isAvailable,
		isSignedUp,
		isSubmitPending,
		isVerifyPending,
		startVerification,
		step,
		submit,
		verification,
	} = useSignup();

	const navigation = useNavigation();

	// signUp 성공 후엔 화면 이탈을 막는다 — 계정은 만들어졌는데 프로필 생성 전에 떠나면
	// 앱 안에 복구 경로가 없다(index.tsx→onboarding.tsx가 인증 건 없이 프로필을 만들려다
	// 서버 BAD_REQUEST를 영구 반복). Android 하드웨어 back·헤더 back·스와이프가 모두
	// beforeRemove로 들어온다. 가입 완료 내비게이션은 doneRef.current로 통과시킨다.
	useEffect(() => {
		const unsubscribe = navigation.addListener("beforeRemove", (event) => {
			// signUp 요청 중(isSubmitPending, 200 수신 전)에도 막는다 — 이때 이탈하면 뒤늦게
			// 세션이 잡혀 login→index→onboarding 막다른 길로 샌다. isSubmitPending은 훅 state라
			// 리스너 클로저가 최신값을 보도록 의존성 배열에 넣어 재구독한다.
			if (!(isSignedUp || isSubmitPending) || doneRef.current) {
				return;
			}
			event.preventDefault();
			NativeAlert.alert(
				"가입을 마쳐 주세요",
				isSubmitPending
					? "가입을 처리하고 있어요. 잠시만 기다려 주세요."
					: "계정은 만들어졌어요. 이 화면에서 다시 시도하면 가입이 완료돼요."
			);
		});
		return unsubscribe;
	}, [navigation, isSignedUp, isSubmitPending, doneRef]);

	const [role, setRole] = useState<SignupRole>("job_seeker");
	const [nickname, setNickname] = useState("");
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [passwordConfirm, setPasswordConfirm] = useState("");
	const [agreedToTerms, setAgreedToTerms] = useState(false);
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);
	const [notice, setNotice] = useState<null | {
		status: NoticeStatus;
		text: string;
	}>(null);

	const [accentForegroundColor, mutedColor] = useThemeColor([
		"accent-foreground",
		"muted",
	]);

	// 완료 키로 다음 칸으로 넘어가는 체인(로그인 화면과 같은 패턴). 마지막 칸은 제출.
	const usernameRef = useRef<TextInput>(null);
	const emailRef = useRef<TextInput>(null);
	const passwordRef = useRef<TextInput>(null);
	const passwordConfirmRef = useRef<TextInput>(null);

	const showNotice = (status: NoticeStatus, text: string) => {
		setNotice({ status, text });
		// Alert 루트가 role="alert"를 달지만 iOS VoiceOver는 자동 낭독하지 않는다.
		AccessibilityInfo.announceForAccessibility(text);
	};

	// 입력·선택을 고치면 직전 오류 Alert도 함께 지운다 — 안 지우면 값을 다 채운 뒤에도
	// 오류가 남아 화면이 사실과 어긋난다(로그인 화면과 같은 이유). setNotice(null)은
	// 이미 null이면 React가 재렌더를 건너뛰므로 가드 없이 항상 부른다.
	const changeField = (setter: (value: string) => void) => (value: string) => {
		setter(value);
		setNotice(null);
	};

	const handleVerifyPress = () => {
		// 재인증을 시작하면 이전 오류·안내(만료 notice 포함)를 지운다.
		setNotice(null);
		if (isAvailable) {
			startVerification();
			return;
		}
		// 미설정 폴백(로그인 화면과 같은 문구). 로그인에서는 미설정 시 /signup으로 오지
		// 않지만, expo-router가 /signup을 딥링크로 직접 열 수 있어 살려 둔다.
		notifyWebOnly("회원가입");
	};

	const handleSubmit = async () => {
		if (isSubmitPending) {
			return;
		}

		const error = await submit({
			agreedToTerms,
			email,
			nickname,
			password,
			passwordConfirm,
			role,
			username,
		});

		// null이면 훅이 내부에서 네비게이션까지 끝낸 성공이다.
		if (error) {
			showNotice("danger", error);
		}
	};

	return (
		// 19금 고지는 footer로 빼 두 단계 모두 카드 밑에 상시 노출한다(웹과 같은 구조).
		<BambiScreen footer={<AdultNotice />}>
			{/* signUp 처리 중·성공 후 헤더 back·스와이프를 막는다(하드웨어 back은 위 beforeRemove). */}
			<Stack.Screen
				options={{
					gestureEnabled: !(isSignedUp || isSubmitPending),
					headerBackVisible: !(isSignedUp || isSubmitPending),
				}}
			/>
			<SignupSteps current={step === "verify" ? 1 : 2} />
			{/* 오류·안내는 두 단계 공용으로 여기(단계 분기 위)서 그린다 — 인증 만료로 1단계로
			    되돌아온 뒤에도 사용자가 이유를 볼 수 있게 한다. */}
			{notice ? (
				<Alert status={notice.status}>
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>{notice.text}</Alert.Title>
					</Alert.Content>
				</Alert>
			) : null}
			{step === "verify" ? (
				<VerifyStep
					isVerifyPending={isVerifyPending}
					onVerify={handleVerifyPress}
					verification={verification}
				/>
			) : (
				<Surface className="gap-4 rounded-lg p-4" variant="secondary">
					{/* 필드 순서는 웹 AuthSignupFields와 같다: 닉네임 → 아이디 → 이메일 →
					    비밀번호 → 비밀번호 확인 → 가입 유형. 완료 키 체인은 로그인 화면과
					    같은 패턴(next로 다음 칸, 마지막 칸 go로 제출). */}
					<TextField>
						<Label>
							<Label.Text>닉네임</Label.Text>
						</Label>
						<Input
							accessibilityLabel="닉네임"
							autoComplete="nickname"
							onChangeText={changeField(setNickname)}
							onSubmitEditing={() => usernameRef.current?.focus()}
							placeholder="예: 밤비알바 구직자"
							returnKeyType="next"
							submitBehavior="submit"
							value={nickname}
						/>
					</TextField>

					<TextField>
						<Label>
							<Label.Text>아이디</Label.Text>
						</Label>
						<Input
							accessibilityLabel="아이디"
							autoCapitalize="none"
							autoComplete="username"
							onChangeText={changeField(setUsername)}
							onSubmitEditing={() => emailRef.current?.focus()}
							placeholder="예: bambi-alba"
							ref={usernameRef}
							returnKeyType="next"
							submitBehavior="submit"
							value={username}
						/>
						{/* 아이디 규칙 안내는 상시 노출한다(웹과 같은 문구). 형식 오류는
						    제출 시 훅이 한 번에 notice로 보여준다. */}
						<Text className="text-muted text-xs leading-5">
							{LOGIN_ID_HELP_TEXT}
						</Text>
					</TextField>

					<TextField>
						<Label>
							<Label.Text>이메일</Label.Text>
						</Label>
						<Input
							accessibilityLabel="이메일"
							autoCapitalize="none"
							autoComplete="email"
							keyboardType="email-address"
							onChangeText={changeField(setEmail)}
							onSubmitEditing={() => passwordRef.current?.focus()}
							placeholder="이메일을 입력해주세요."
							ref={emailRef}
							returnKeyType="next"
							submitBehavior="submit"
							textContentType="emailAddress"
							value={email}
						/>
					</TextField>

					<TextField>
						<Label>
							<Label.Text>비밀번호</Label.Text>
						</Label>
						<InputGroup>
							<InputGroup.Input
								accessibilityLabel="비밀번호"
								autoCapitalize="none"
								autoComplete="new-password"
								onChangeText={changeField(setPassword)}
								onSubmitEditing={() => passwordConfirmRef.current?.focus()}
								placeholder="비밀번호를 입력해주세요."
								ref={passwordRef}
								returnKeyType="next"
								secureTextEntry={!isPasswordVisible}
								submitBehavior="submit"
								textContentType="newPassword"
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
					</TextField>

					<TextField>
						<Label>
							<Label.Text>비밀번호 확인</Label.Text>
						</Label>
						<Input
							accessibilityLabel="비밀번호 확인"
							autoCapitalize="none"
							autoComplete="new-password"
							onChangeText={changeField(setPasswordConfirm)}
							onSubmitEditing={handleSubmit}
							placeholder="비밀번호를 다시 입력해주세요."
							ref={passwordConfirmRef}
							returnKeyType="go"
							secureTextEntry
							textContentType="newPassword"
							value={passwordConfirm}
						/>
					</TextField>

					<View className="gap-2">
						<Label>
							<Label.Text>가입 유형</Label.Text>
						</Label>
						<RadioGroup
							onValueChange={(value) => {
								setRole(value as SignupRole);
								setNotice(null);
							}}
							value={role}
						>
							<RadioGroup.Item value="job_seeker">개인회원</RadioGroup.Item>
							<RadioGroup.Item value="employer">업소회원</RadioGroup.Item>
						</RadioGroup>
						{role === "employer" ? (
							<Text className="text-muted text-xs leading-5">
								가입 후 업체 정보를 입력하고 운영자 승인을 받으면 구인 기능을
								이용할 수 있어요.
							</Text>
						) : null}
					</View>

					{/* 약관 동의: 행 전체를 Pressable로 감싸 라벨까지 탭 타깃으로 쓴다
					    (me/interviews의 Checkbox 패턴). */}
					<Pressable
						accessibilityLabel="이용약관 및 개인정보 처리방침에 동의합니다."
						accessibilityRole="checkbox"
						accessibilityState={{ checked: agreedToTerms }}
						className="flex-row items-start gap-3 py-1 active:opacity-75"
						onPress={() => {
							setAgreedToTerms((isOn) => !isOn);
							setNotice(null);
						}}
					>
						<Checkbox
							isSelected={agreedToTerms}
							onSelectedChange={(next) => {
								setAgreedToTerms(next);
								setNotice(null);
							}}
						/>
						<Text className="flex-1 text-muted text-sm leading-5">
							이용약관 및 개인정보 처리방침에 동의합니다.
						</Text>
					</Pressable>
					{/* 약관·처리방침 문서는 native 전용 페이지 예정 — 생기면 여기서 연결한다. */}

					<Button isDisabled={isSubmitPending} onPress={handleSubmit} size="lg">
						{isSubmitPending ? (
							<Spinner color={accentForegroundColor} size="sm" />
						) : null}
						<Button.Label>
							{isSubmitPending ? "가입 중" : "회원가입"}
						</Button.Label>
					</Button>
				</Surface>
			)}
		</BambiScreen>
	);
}
