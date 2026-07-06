"use client";

import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { clearGuestCookie } from "@/lib/bambi/guest";
import { client, queryClient } from "@/utils/orpc";
import { Badge, Button, Card, Input, Logo } from "../ds";
import { PhoneIcon, ShieldIcon } from "../icons";

type AuthMode = "sign-in" | "sign-up";
type SignupRole = "job_seeker" | "employer";
interface Notice {
	text: string;
	tone: "error" | "info";
}

const getInitialMode = (mode: string | null): AuthMode =>
	mode === "sign-up" ? "sign-up" : "sign-in";

function TrustBadge() {
	return (
		<Badge tone="success">
			<span className="inline-flex size-3.5">
				<ShieldIcon />
			</span>
			면접 전 연락처 보호
		</Badge>
	);
}

function Spinner() {
	return (
		<span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
	);
}

// 비회원(휴대폰 인증) 진입 — 게스트 쿠키를 세팅하고 공고 목록으로 이동한다.
// 지금은 실제 인증 없이 버튼만으로 게스트 열람을 허용한다.
function GuestBrowseButton() {
	const router = useRouter();
	const [isEntering, setIsEntering] = useState(false);

	const enterAsGuest = async () => {
		setIsEntering(true);
		try {
			await fetch("/api/guest", { method: "POST" });
			router.push("/seeker" as Route);
			router.refresh();
		} finally {
			setIsEntering(false);
		}
	};

	return (
		<div className="mt-5 flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<span className="h-px flex-1 bg-border" />
				<span className="text-muted-foreground text-xs">또는</span>
				<span className="h-px flex-1 bg-border" />
			</div>
			<Button
				block
				disabled={isEntering}
				leftIcon={<PhoneIcon />}
				onClick={() => {
					enterAsGuest().catch(() => setIsEntering(false));
				}}
				variant="secondary"
			>
				{isEntering ? "입장 중" : "휴대폰 인증"}
			</Button>
			<p className="m-0 text-center text-muted-foreground text-xs">
				비회원은 공고 목록만 볼 수 있어요. 상세 열람·채팅은 회원가입이 필요해요.
			</p>
		</div>
	);
}

// embedded=true(게이트 화면 내부 삽입)일 때는 부모가 배경·여백을 제공하므로 전체
// 뷰포트 높이/센터링을 벗겨 상단에 컴팩트하게 붙는다. false(독립 /login)일 때만 풀높이 센터.
const authWrapperClass = (embedded: boolean) =>
	cn(
		"text-foreground",
		embedded ? "w-full" : "min-h-[100dvh] bg-secondary px-4 py-6"
	);

const authGridClass = (embedded: boolean) =>
	cn(
		"mx-auto grid w-full max-w-[980px] gap-6 lg:grid-cols-[minmax(0,1fr)_390px]",
		embedded ? "items-start" : "min-h-[calc(100dvh-48px)] items-center"
	);

export function AuthScreen({ embedded = false }: { embedded?: boolean }) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const initialMode = useMemo(
		() => getInitialMode(searchParams.get("mode")),
		[searchParams]
	);
	const [mode, setMode] = useState<AuthMode>(initialMode);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("seeker@bambi.dev");
	const [password, setPassword] = useState("Bambi1234!");
	const [notice, setNotice] = useState<Notice | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [signupRole, setSignupRole] = useState<SignupRole>("job_seeker");
	const [orgName, setOrgName] = useState("");
	const isSignUp = mode === "sign-up";
	const title = isSignUp ? "밤비 계정 만들기" : "밤비 로그인";
	const subtitle = isSignUp
		? "기본 정보를 입력하고 밤비를 시작하세요."
		: "이메일과 비밀번호를 입력해 로그인하세요.";
	const submitLabel = isSignUp ? "회원가입" : "로그인";

	const finishSignup = async () => {
		const displayName = name.trim();
		if (signupRole === "employer") {
			await client.bambi.onboarding.registerEmployer({
				displayName,
				organizationName: orgName.trim() || displayName,
			});
			queryClient.invalidateQueries();
			// 미검증 구인자는 /employer 레이아웃이 승인 대기 화면을 인라인 렌더한다.
			router.push("/employer" as Route);
			return;
		}
		await client.bambi.onboarding.createJobSeekerProfile({ displayName });
		queryClient.invalidateQueries();
		router.push("/seeker" as Route);
	};

	const handleSubmit = async () => {
		setNotice(null);

		if (isSignUp && name.trim().length < 2) {
			setNotice({ text: "이름을 2자 이상 입력해 주세요.", tone: "error" });
			return;
		}

		if (!email.includes("@") || password.length < 8) {
			setNotice({
				text: "이메일과 8자 이상 비밀번호를 확인해 주세요.",
				tone: "error",
			});
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
			onSuccess: async () => {
				// 실제 세션이 생겼으니 게스트 열람 권한(쿠키)을 회수한다. 남겨두면
				// 로그아웃·세션 만료 후에도 게스트로 마켓을 볼 수 있게 된다. 게이트가
				// 쿠키 없는 상태를 보도록 내비게이션 전에 삭제를 기다린다.
				await clearGuestCookie();
				if (isSignUp) {
					finishSignup().catch((error: unknown) => {
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
				router.push("/" as Route);
			},
		};

		if (isSignUp) {
			await authClient.signUp.email(
				{
					email,
					name,
					password,
				},
				callbacks
			);
		} else {
			await authClient.signIn.email(
				{
					email,
					password,
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
		<div className={authWrapperClass(embedded)}>
			<div className={authGridClass(embedded)}>
				<section className="hidden lg:block">
					<Logo lang="ko" size="lg" />
					<div className="mt-6">
						<TrustBadge />
					</div>
					<h1 className="mt-5 mb-3 font-extrabold text-[42px] leading-tight">
						공고 탐색부터 채팅까지
						<br />
						밤비 안에서 안전하게
					</h1>
					<p className="m-0 max-w-[560px] text-muted-foreground leading-relaxed">
						번호 노출 걱정 없이 마음에 드는 공고에 바로 채팅하고, 면접까지
						안전하게 이어가세요.
					</p>
				</section>
				<Card className="rounded-lg" pad="lg" tone="outline">
					<div className="mb-5 flex flex-col items-start gap-3 lg:hidden">
						<Logo lang="ko" size="md" />
						<TrustBadge />
					</div>
					<h2 className="m-0 font-extrabold text-2xl">{title}</h2>
					<p className="mt-2 mb-5 text-muted-foreground text-sm">{subtitle}</p>
					<form
						className="grid gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							handleSubmit().catch(() => undefined);
						}}
					>
						{isSignUp ? (
							<label className="grid gap-2" htmlFor="auth-name">
								<span className="font-bold text-sm">이름</span>
								<Input
									autoComplete="name"
									id="auth-name"
									onChange={(event) => setName(event.target.value)}
									placeholder="예: 밤비 구직자"
									value={name}
								/>
							</label>
						) : null}
						{isSignUp ? (
							<div className="grid gap-2">
								<span className="font-bold text-sm" id="auth-role-label">
									가입 유형
								</span>
								<ToggleGroup
									aria-labelledby="auth-role-label"
									className="grid w-full grid-cols-2 gap-2"
									onValueChange={(value) => {
										const next = value.at(-1);
										if (next === "job_seeker" || next === "employer") {
											setSignupRole(next);
										}
									}}
									value={[signupRole]}
								>
									<ToggleGroupItem className="w-full" value="job_seeker">
										개인회원
									</ToggleGroupItem>
									<ToggleGroupItem className="w-full" value="employer">
										업소회원
									</ToggleGroupItem>
								</ToggleGroup>
							</div>
						) : null}
						{isSignUp && signupRole === "employer" ? (
							<label className="grid gap-2" htmlFor="auth-org-name">
								<span className="font-bold text-sm">업체명</span>
								<Input
									id="auth-org-name"
									onChange={(event) => setOrgName(event.target.value)}
									placeholder="예: 밤비 라운지"
									value={orgName}
								/>
							</label>
						) : null}
						{isSignUp && signupRole === "employer" ? (
							<p
								className="m-0 rounded-lg border border-border bg-secondary px-4 py-3 text-muted-foreground text-sm"
								role="note"
							>
								가입 후 운영자 승인이 완료되어야 이용할 수 있어요.
							</p>
						) : null}
						<label className="grid gap-2" htmlFor="auth-email">
							<span className="font-bold text-sm">이메일</span>
							<Input
								autoComplete="email"
								id="auth-email"
								onChange={(event) => setEmail(event.target.value)}
								type="email"
								value={email}
							/>
						</label>
						<div className="grid gap-2">
							<div className="flex items-center justify-between gap-2">
								<label className="font-bold text-sm" htmlFor="auth-password">
									비밀번호
								</label>
								{isSignUp ? null : (
									<button
										className="font-semibold text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
										onClick={handleForgotPassword}
										type="button"
									>
										비밀번호를 잊으셨나요?
									</button>
								)}
							</div>
							<Input
								autoComplete={isSignUp ? "new-password" : "current-password"}
								id="auth-password"
								onChange={(event) => setPassword(event.target.value)}
								type="password"
								value={password}
							/>
						</div>
						{notice ? (
							<div
								className={cn(
									"rounded-lg border px-4 py-3 font-semibold text-sm",
									notice.tone === "error"
										? "border-destructive/30 bg-destructive/10 text-destructive"
										: "border-border bg-secondary text-muted-foreground"
								)}
								role={notice.tone === "error" ? "alert" : "status"}
							>
								{notice.text}
							</div>
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
					<GuestBrowseButton />
				</Card>
			</div>
		</div>
	);
}
