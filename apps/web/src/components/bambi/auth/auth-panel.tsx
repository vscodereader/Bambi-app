"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import {
	type BambiGenderValue,
	clearGuestCookie,
	type MockPhoneVerifyInput,
	readGuestGenderFromCookieString,
} from "@/lib/bambi/guest";
import { isEmailLoginId } from "@/lib/bambi/login-id";
import { client, queryClient } from "@/utils/orpc";
import { Button, Card, Logo } from "../ds";
import { PhoneVerifyDialog } from "../phone-verify-dialog";
import { useAccountRecovery } from "./account-recovery-dialog";
import { AdultNotice } from "./adult-notice";
import {
	type AuthFormValues,
	AuthSigninFields,
	AuthSignupFields,
	AuthTermsAgreement,
	type SignupRole,
} from "./auth-fields";
import { AuthNotice, type Notice } from "./auth-notice";
import { AuthVerifyStep } from "./auth-verify-step";

type AuthMode = "sign-in" | "sign-up";
// 회원가입은 본인인증(verify)을 마쳐야 가입 폼(form)이 열리는 2단계다.
type SignupStep = "form" | "verify";

// 게스트 인증 버튼의 식별자. 회원가입 단계의 SIGNUP_INTENT(auth-verify-step)와 반드시
// 달라야 한다 — 모바일 리디렉션으로 복귀했을 때 인증을 시작한 버튼만 결과를 처리한다.
const GUEST_INTENT = "auth-panel:guest";

const EMPTY_FORM: AuthFormValues = {
	email: "",
	nickname: "",
	password: "",
	passwordConfirm: "",
	username: "",
};

// `?auth=signup`(신규)과 `?mode=sign-up`(기존 링크) 둘 다 회원가입으로 연다.
const getInitialMode = (mode: string | null): AuthMode =>
	mode === "sign-up" || mode === "signup" ? "sign-up" : "sign-in";

// 제출 전 필드 검증. 회원가입은 닉네임·아이디·이메일·비번·비번확인을 보고, 로그인은
// 아이디/이메일 비어있지 않음 + 비밀번호 8자만 본다. 통과하면 null을 돌려준다.
// 로그인 쪽에서 이메일 형식까지 따지지는 않는다 — 한 칸으로 아이디도 받으므로
// 여기서 "@"를 요구하면 아이디 로그인이 막힌다.
const getValidationError = (
	values: AuthFormValues,
	isSignUp: boolean
): Notice | null => {
	if (!isSignUp) {
		if (values.username.trim().length === 0 || values.password.length < 8) {
			return {
				text: "아이디(이메일)와 8자 이상 비밀번호를 확인해 주세요.",
				tone: "error",
			};
		}
		return null;
	}
	if (values.nickname.trim().length < 2) {
		return { text: "닉네임을 2자 이상 입력해 주세요.", tone: "error" };
	}
	if (values.username.trim().length < 3) {
		return { text: "아이디를 3자 이상 입력해 주세요.", tone: "error" };
	}
	if (!values.email.includes("@") || values.password.length < 8) {
		return {
			text: "이메일과 8자 이상 비밀번호를 확인해 주세요.",
			tone: "error",
		};
	}
	if (values.password !== values.passwordConfirm) {
		return { text: "비밀번호가 일치하지 않아요.", tone: "error" };
	}
	return null;
};

function Spinner() {
	return (
		<span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
	);
}

// 회원가입은 인증 → 정보 입력이라는 실제 순서가 있는 흐름이라 단계를 표기한다.
// 로그인에는 단계가 없으므로 회원가입에서만 렌더한다(장식이 아니라 정보다).
const SIGNUP_STEPS = ["본인인증", "정보 입력"] as const;

function AuthSteps({ current }: { current: 1 | 2 }) {
	return (
		<ol className="flex items-center gap-2">
			{SIGNUP_STEPS.map((label, index) => {
				const isCurrent = index + 1 === current;
				return (
					<li
						aria-current={isCurrent ? "step" : undefined}
						className="flex items-center gap-2"
						key={label}
					>
						{index > 0 ? (
							<span aria-hidden className="h-px w-4 bg-border" />
						) : null}
						<span
							className={cn(
								"flex size-5 items-center justify-center rounded-full font-bold text-xs",
								isCurrent
									? "bg-primary text-primary-foreground"
									: "bg-muted text-muted-foreground"
							)}
						>
							{index + 1}
						</span>
						<span
							className={cn(
								"font-bold text-xs",
								isCurrent ? "text-foreground" : "text-muted-foreground"
							)}
						>
							{label}
						</span>
					</li>
				);
			})}
		</ol>
	);
}

// 카드 머리(브랜드 + 단계 + 제목). 좌측 소개 컬럼이 없어져 이 로고가 브랜드를
// 대표하는 유일한 자리이고, 단계 표기는 같은 행 반대편에 두어 넓어진 카드 폭을 쓴다.
function AuthCardHeader({
	isSignUp,
	step,
	title,
}: {
	isSignUp: boolean;
	step: SignupStep;
	title: string;
}) {
	return (
		<>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<Logo lang="ko" size="lg" />
				{isSignUp ? <AuthSteps current={step === "verify" ? 1 : 2} /> : null}
			</div>
			<h2 className="mt-6 mb-5 font-extrabold text-2xl tracking-tight sm:text-3xl">
				{title}
			</h2>
		</>
	);
}

export function AuthPanel() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const initialMode = useMemo(
		() => getInitialMode(searchParams.get("auth") ?? searchParams.get("mode")),
		[searchParams]
	);
	const [mode, setMode] = useState<AuthMode>(initialMode);
	const [form, setForm] = useState<AuthFormValues>(EMPTY_FORM);
	const [notice, setNotice] = useState<Notice | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [signupRole, setSignupRole] = useState<SignupRole>("job_seeker");
	const [agreedToTerms, setAgreedToTerms] = useState(false);
	const [step, setStep] = useState<SignupStep>("verify");
	const [verifiedId, setVerifiedId] = useState<string | null>(null);
	const isSignUp = mode === "sign-up";
	const isVerifyStep = isSignUp && step === "verify";
	// 아이디·비밀번호 찾기. 모바일은 인증 리디렉션에서 돌아오며 페이지가 새로 뜨는데,
	// 그때 쿼리에 auth=signup이 남아 있으면 회원가입 모드로 복귀할 수 있다 — 결과를
	// 적용할 때 로그인 모드로 되돌려 채운 아이디가 보이는 화면에 남게 한다.
	const recovery = useAccountRecovery({
		onSignUp: () => setMode("sign-up"),
		onUseLoginId: (loginId) => {
			setMode("sign-in");
			setForm((prev) => ({ ...prev, username: loginId }));
		},
	});
	const title = isSignUp ? "밤비알바 계정 만들기" : "밤비알바 로그인";
	const submitLabel = isSignUp ? "회원가입" : "로그인";

	const setField =
		(field: keyof AuthFormValues) => (event: ChangeEvent<HTMLInputElement>) => {
			const { value } = event.target;
			setForm((prev) => ({ ...prev, [field]: value }));
		};

	// 새로고침하면 폼 단계는 복원되지 않고 인증 단계(step 초기값 "verify")에서 다시
	// 시작한다. 인증 건 ID를 쿠키에 보관하지 않기 때문인데(항목 4 — 유효시간 30분),
	// 어차피 그 ID는 30분이 지나면 서버가 거부한다. 되살렸다면 계정 생성만 성공하고
	// 프로필 생성이 실패해 프로필 없는 유령 계정이 남았을 자리다.
	const postGuestVerification = async (
		body: MockPhoneVerifyInput | { identityVerificationId: string }
	) => {
		const response = await fetch("/api/guest", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!response.ok) {
			const data = (await response.json().catch(() => null)) as {
				message?: string;
			} | null;
			throw new Error(
				data?.message ?? "인증 처리에 실패했어요. 다시 시도해 주세요."
			);
		}
	};

	// 회원가입 1단계: 인증 → 중복 계정 사전 확인 → 폼 단계로.
	const handleVerifiedForSignup = async (identityVerificationId: string) => {
		const check = await client.bambi.onboarding.checkIdentityForSignup({
			identityVerificationId,
		});
		if (check.hasAccount) {
			setMode("sign-in");
			setNotice({
				text: "이미 가입된 계정이 있어요. 로그인해 주세요.",
				tone: "error",
			});
			return;
		}
		await postGuestVerification({ identityVerificationId });
		setVerifiedId(identityVerificationId);
		setStep("form");
	};

	// 비회원 둘러보기: 같은 인증을 거치되 가입은 하지 않고 목록으로 보낸다.
	// 하드 내비게이션으로 Router Cache를 우회해 갓 세팅된 게스트 쿠키가 반영되게 한다.
	const handleVerifiedForGuest = async (identityVerificationId: string) => {
		await postGuestVerification({ identityVerificationId });
		window.location.assign("/seeker");
	};

	// 포트원 미구성 개발 환경의 목 폼 경로. 실제 인증 건이 없어 verifiedId는 비운다.
	const handleMockVerifiedForSignup = async (input: MockPhoneVerifyInput) => {
		await postGuestVerification(input);
		setVerifiedId(null);
		setStep("form");
	};

	const handleMockVerifiedForGuest = async (input: MockPhoneVerifyInput) => {
		await postGuestVerification(input);
		window.location.assign("/seeker");
	};

	const finishSignup = async (gender: BambiGenderValue | null) => {
		// 닉네임(표시명)은 signUp.email의 name(→ user.name)에 저장되므로 프로필 생성
		// 페이로드에는 표시명을 싣지 않는다. 인증을 마쳤으면 인증 건 ID를 실어 서버가
		// 번호·생년월일·성별·CI/DI 해시를 함께 기록하게 한다.
		const profilePayload = {
			...(gender ? { gender } : {}),
			...(verifiedId ? { identityVerificationId: verifiedId } : {}),
		};
		if (signupRole === "employer") {
			await client.bambi.onboarding.createEmployerProfile(profilePayload);
		} else {
			await client.bambi.onboarding.createJobSeekerProfile(profilePayload);
		}
		// 이용약관·개인정보 처리방침 동의 이력을 저장한다(체크박스로 이미 동의를 받았다).
		// 감사 로그 성격이라 저장 실패가 가입 완료를 막지 않도록 오류는 삼킨다.
		await client.bambi.onboarding.recordLegalConsent().catch(() => undefined);
		queryClient.invalidateQueries();
		// 역할과 무관하게 구직자 홈으로 진입한다. 구인자는 헤더/탭바의 "구인 관리"
		// 버튼으로 /employer에 들어가고, 대시보드가 업체정보 입력을 유도한다.
		router.push("/seeker" as Route);
	};

	const handleAuthSuccess = async () => {
		// clearGuestCookie가 게스트 토큰을 만료시키기 전에 성별을 읽어 둔다.
		const gender =
			typeof document === "undefined"
				? null
				: readGuestGenderFromCookieString(document.cookie);
		// 실제 세션이 생겼으니 게스트 열람 권한(쿠키)을 회수한다. 남겨두면
		// 로그아웃·세션 만료 후에도 게스트로 마켓을 볼 수 있게 된다. 게이트가
		// 쿠키 없는 상태를 보도록 내비게이션 전에 삭제를 기다린다.
		await clearGuestCookie();
		if (isSignUp) {
			finishSignup(gender).catch((error: unknown) => {
				setNotice({
					text:
						error instanceof Error
							? error.message
							: "프로필 생성에 실패했어요.",
					tone: "error",
				});
			});
			return;
		}
		queryClient.invalidateQueries();
		// 로그아웃(push("/"))이 "/"→비로그인 인증 화면 리다이렉트 결과를 Router
		// Cache에 남긴다. router.push("/")는 이 stale 엔트리를 재생할 수 있고, 이를
		// 비우는 router.refresh()는 비동기·논블로킹이라 바로 뒤의 push()와 경쟁해
		// 간헐적으로 인증 화면에 머문다(재로그인이 "간혹" 되고 "간혹" 안 되는 원인).
		// 하드 내비게이션으로 Router Cache를 통째로 우회한다: 브라우저가 갓 설정된
		// 세션 쿠키로 "/"를 새로 요청 → 미들웨어 통과 → 서버가 role 홈을 계산한다.
		window.location.assign("/");
	};

	const handleSubmit = async () => {
		setNotice(null);

		const validationError = getValidationError(form, isSignUp);
		if (validationError) {
			setNotice(validationError);
			return;
		}

		if (isSignUp && !agreedToTerms) {
			toast("이용약관과 개인정보 처리방침에 동의해주세요");
			return;
		}

		setIsSubmitting(true);
		const callbacks = {
			onError: (error: {
				error: { message?: string; statusText?: string };
			}) => {
				setNotice({
					text:
						error.error.message ??
						error.error.statusText ??
						"요청을 처리하지 못했어요.",
					tone: "error",
				});
			},
			onSuccess: handleAuthSuccess,
		};

		if (isSignUp) {
			await authClient.signUp.email(
				{
					email: form.email,
					name: form.nickname,
					password: form.password,
					username: form.username.trim(),
				},
				callbacks
			);
		} else {
			// 로그인 입력 한 칸으로 아이디·이메일을 모두 받는다. 아이디에는 "@"가 들어갈 수
			// 없으므로(login-id.ts) 그 한 글자로 어느 엔드포인트를 쓸지 가른다. 두 경로 모두
			// 같은 콜백을 타므로 성공·실패 처리는 갈리지 않는다.
			const loginId = form.username.trim();
			if (isEmailLoginId(loginId)) {
				await authClient.signIn.email(
					{ email: loginId, password: form.password },
					callbacks
				);
			} else {
				await authClient.signIn.username(
					{ username: loginId, password: form.password },
					callbacks
				);
			}
		}
		setIsSubmitting(false);
	};

	const toggleMode = () => {
		setNotice(null);
		setMode(isSignUp ? "sign-in" : "sign-up");
	};

	return (
		<div className="w-full text-foreground">
			{/* 게이트 카드는 폭·높이를 고정 수치로 잡는다 — 로그인·회원가입·인증 단계를
			    오가도 카드 덩치가 흔들리지 않아야 한다. min-h라 폼이 더 길어지면 늘어난다.
			    머리는 위, 본문은 남는 높이를 위아래로 나눈 광학 중앙, 19금 고지는 바닥.
			    인증 단계처럼 내용이 짧아도 남는 높이가 "덩어리 아래의 빈 꼬리"로 몰리지 않는다. */}
			<Card
				className="mx-auto min-h-[620px] max-w-[580px] rounded-xl sm:p-7"
				pad="lg"
			>
				<AuthCardHeader isSignUp={isSignUp} step={step} title={title} />
				{/* my-auto: 카드가 내용보다 클 때(인증 단계처럼 짧을 때) 남는 높이를 본문 위아래로
				    똑같이 나눠 준다. 한쪽에 몰면 "아래가 텅 빈" 카드가 되지만, 나눠 두면 머리는
				    위, 액션은 광학 중앙, 고지는 바닥이라는 삼단 구성으로 읽힌다. */}
				<div className="my-auto">
					{isVerifyStep ? (
						<AuthVerifyStep
							onMockVerifiedForSignup={handleMockVerifiedForSignup}
							onToggleMode={toggleMode}
							onVerifiedForSignup={handleVerifiedForSignup}
						/>
					) : (
						// @container: 2열 전환 기준은 뷰포트가 아니라 카드 폭이다 — 카드가
						// max-w로 뷰포트보다 좁게 고정돼 있어 뷰포트 breakpoint로는 폼이
						// 실제로 2열을 감당하는 시점을 맞출 수 없다.
						<form
							className="@container grid gap-4"
							onSubmit={(event) => {
								event.preventDefault();
								handleSubmit().catch(() => undefined);
							}}
						>
							{isSignUp ? (
								<div className="grid @md:grid-cols-2 gap-4">
									<AuthSignupFields
										onFieldChange={setField}
										onSignupRoleChange={setSignupRole}
										signupRole={signupRole}
										values={form}
									/>
								</div>
							) : (
								<AuthSigninFields
									onFieldChange={setField}
									onFindId={recovery.findId}
									onForgotPassword={recovery.resetPassword}
									values={form}
								/>
							)}
							<AuthNotice notice={notice} />
							{isSignUp ? (
								<AuthTermsAgreement
									checked={agreedToTerms}
									onCheckedChange={setAgreedToTerms}
								/>
							) : null}
							<Button
								block
								className="shadow-none"
								disabled={isSubmitting}
								leftIcon={isSubmitting ? <Spinner /> : undefined}
								type="submit"
							>
								{isSubmitting ? "처리 중" : submitLabel}
							</Button>
							{/* 비회원 둘러보기는 "계정 없이 여기서 나가는 길"이라, 계정을 만드는
							    회원가입 흐름이 아니라 로그인 실패의 대안으로 붙는 자리가 맞다.
							    위계는 채운 코럴(로그인) > 테두리 보조(둘러보기) > 텍스트(회원가입).
							    trigger는 type="button"이라 이 폼을 제출하지 않는다. */}
							{isSignUp ? null : (
								<PhoneVerifyDialog
									intent={GUEST_INTENT}
									onMockVerified={handleMockVerifiedForGuest}
									onVerified={handleVerifiedForGuest}
									size="md"
									triggerLabel="비회원으로 목록만 보기"
									variant="secondary"
								/>
							)}
							<p className="m-0 text-center text-muted-foreground text-sm">
								{isSignUp
									? "이미 계정이 있으신가요? "
									: "밤비알바가 처음이신가요? "}
								<button
									className="font-bold text-primary underline-offset-2 hover:underline disabled:opacity-50"
									disabled={isSubmitting}
									onClick={toggleMode}
									type="button"
								>
									{isSignUp ? "로그인" : "회원가입"}
								</button>
							</p>
						</form>
					)}
				</div>
				{/* 19금 고지는 로그인·회원가입 어느 단계에서도 상시 노출한다. 간격은 고지 패널
				    자체가 아니라 래퍼가 갖는다 — 패널에 pt를 주면 p-4로 잡아 둔 패널 안쪽 여백이
				    깨진다. 바닥 고정은 위 본문의 my-auto가 이미 해 준다(뒤따르는 형제를 끝으로
				    민다). 여기에 mt-auto를 또 주면 auto 마진이 셋이 되어 남는 높이를 1/3씩
				    나눠 가져 위아래가 어긋난다. pt-10은 내용이 길 때의 최소 간격이다. */}
				<div className="pt-10">
					<AdultNotice />
				</div>
			</Card>
			{/* 찾기 결과 모달. 포털로 뜨므로 위치는 무관하지만, 모바일 인증 리디렉션 복귀 시
			    회원가입 모드로 돌아올 수도 있어 모드와 무관하게 항상 렌더한다. */}
			{recovery.dialog}
		</div>
	);
}
