"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import {
	type BambiGenderValue,
	clearGuestCookie,
	type MockPhoneVerifyInput,
	readGuestGenderFromCookieString,
	readGuestIvIdFromCookieString,
} from "@/lib/bambi/guest";
import { client, queryClient } from "@/utils/orpc";
import { Button, Card, Logo } from "../ds";
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
// 아이디(login_id) 비어있지 않음 + 비밀번호 8자만 본다. 통과하면 null을 돌려준다.
const getValidationError = (
	values: AuthFormValues,
	isSignUp: boolean
): Notice | null => {
	if (!isSignUp) {
		if (values.username.trim().length === 0 || values.password.length < 8) {
			return {
				text: "아이디와 8자 이상 비밀번호를 확인해 주세요.",
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
	compact,
	isSignUp,
	step,
	title,
}: {
	compact: boolean;
	isSignUp: boolean;
	step: SignupStep;
	title: string;
}) {
	return (
		<>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<Logo lang="ko" size={compact ? "md" : "lg"} />
				{isSignUp ? <AuthSteps current={step === "verify" ? 1 : 2} /> : null}
			</div>
			<h2
				className={cn(
					"mt-6 mb-5 font-extrabold tracking-tight",
					compact ? "text-2xl" : "text-2xl sm:text-3xl"
				)}
			>
				{title}
			</h2>
		</>
	);
}

export function AuthPanel({
	compact = false,
	onDone,
}: {
	// Dialog 안처럼 폭이 좁은 자리에서는 좌측 소개 컬럼을 접고 폼만 보여준다.
	compact?: boolean;
	// 로그인·가입이 끝나 화면을 떠나기 직전에 감싼 쪽이 정리할 기회를 준다.
	onDone?: () => void;
} = {}) {
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
	const title = isSignUp ? "밤비 계정 만들기" : "밤비 로그인";
	const submitLabel = isSignUp ? "회원가입" : "로그인";

	const setField =
		(field: keyof AuthFormValues) => (event: ChangeEvent<HTMLInputElement>) => {
			const { value } = event.target;
			setForm((prev) => ({ ...prev, [field]: value }));
		};

	// 인증을 마치고 인증 건 ID까지 확보한 방문자만 폼 단계로 바로 들어간다.
	// 게스트 쿠키가 있어도 ID가 없으면(이 기능 배포 전에 발급된 v1 토큰, 개발용 목
	// 인증) 서버가 프로필 생성을 거부하는데, 계정 생성은 그보다 먼저 성공해 프로필
	// 없는 유령 계정이 남는다. 그래서 그 경우엔 인증 단계에 머물러 재인증을 받는다.
	// 서버 렌더에는 document가 없으므로 effect에서 읽어 하이드레이션 불일치를 피한다.
	useEffect(() => {
		const ivId = readGuestIvIdFromCookieString(document.cookie);
		if (ivId) {
			setVerifiedId(ivId);
			setStep("form");
		}
	}, []);

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
		onDone?.();
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
		onDone?.();
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
		onDone?.();
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
		onDone?.();
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
			await authClient.signIn.username(
				{
					username: form.username.trim(),
					password: form.password,
				},
				callbacks
			);
		}
		setIsSubmitting(false);
	};

	const toggleMode = () => {
		setNotice(null);
		setMode(isSignUp ? "sign-in" : "sign-up");
	};

	const handleForgotPassword = () => {
		setNotice({
			text: "비밀번호 재설정 기능은 곧 제공될 예정이에요.",
			tone: "info",
		});
	};

	return (
		<div className="w-full text-foreground">
			<Card
				className={cn(
					"mx-auto rounded-xl",
					compact ? "max-w-md" : "max-w-2xl sm:p-7"
				)}
				pad="lg"
			>
				<AuthCardHeader
					compact={compact}
					isSignUp={isSignUp}
					step={step}
					title={title}
				/>
				{isVerifyStep ? (
					<AuthVerifyStep
						onMockVerifiedForGuest={handleMockVerifiedForGuest}
						onMockVerifiedForSignup={handleMockVerifiedForSignup}
						onToggleMode={toggleMode}
						onVerifiedForGuest={handleVerifiedForGuest}
						onVerifiedForSignup={handleVerifiedForSignup}
					/>
				) : (
					// @container: 2열 전환 기준은 뷰포트가 아니라 카드 폭이다 — 같은 폼이
					// 넓은 게이트 카드와 좁은 다이얼로그(compact) 양쪽에 쓰이기 때문이다.
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
								onForgotPassword={handleForgotPassword}
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
						<p className="m-0 text-center text-muted-foreground text-sm">
							{isSignUp ? "이미 계정이 있으신가요? " : "밤비가 처음이신가요? "}
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
				{/* 19금 고지는 로그인·회원가입 어느 단계에서도 상시 노출한다. 전문은 그대로
				    두되, 카드에서 가장 낮은 시각 무게를 갖는 하단으로 내렸다. */}
				<AdultNotice className="mt-6 border-border border-t pt-5" />
			</Card>
		</div>
	);
}
