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
import { client, queryClient } from "@/utils/orpc";
import { Badge, Button, Card, Input, Logo } from "../ds";
import { ShieldIcon } from "../icons";

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

export function AuthScreen() {
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
			router.push("/employer/pending" as Route);
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
			onSuccess: () => {
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
		<div className="min-h-[100dvh] bg-secondary px-4 py-6 text-foreground">
			<div className="mx-auto grid min-h-[calc(100dvh-48px)] w-full max-w-[980px] items-center gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
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
						공고를 둘러보고, 연락처 걱정 없이 채팅으로 이어가세요.
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
				</Card>
			</div>
		</div>
	);
}
