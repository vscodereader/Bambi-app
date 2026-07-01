"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/orpc";
import { Badge, Button, Card, Input, Logo } from "../ds";
import { ShieldIcon } from "../icons";

type AuthMode = "sign-in" | "sign-up";

const getInitialMode = (mode: string | null): AuthMode =>
	mode === "sign-up" ? "sign-up" : "sign-in";

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
	const [message, setMessage] = useState<null | string>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isSignUp = mode === "sign-up";
	const title = isSignUp ? "밤비 계정 만들기" : "밤비 로그인";
	const submitLabel = isSignUp ? "회원가입" : "로그인";

	const handleSubmit = async () => {
		setMessage(null);

		if (isSignUp && name.trim().length < 2) {
			setMessage("이름을 2자 이상 입력해 주세요.");
			return;
		}

		if (!email.includes("@") || password.length < 8) {
			setMessage("이메일과 8자 이상 비밀번호를 확인해 주세요.");
			return;
		}

		setIsSubmitting(true);
		const callbacks = {
			onError: (error: {
				error: { message?: string; statusText?: string };
			}) => {
				setMessage(
					error.error.message ??
						error.error.statusText ??
						"요청을 처리하지 못했어요."
				);
			},
			onSuccess: () => {
				queryClient.invalidateQueries();
				router.push("/onboarding" as Route);
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

	return (
		<div className="min-h-[100dvh] bg-secondary px-4 py-6 text-foreground">
			<div className="mx-auto grid min-h-[calc(100dvh-48px)] w-full max-w-[980px] items-center gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
				<section className="hidden lg:block">
					<Logo lang="ko" size="lg" />
					<Badge className="mt-6" tone="success">
						<span className="inline-flex size-3.5">
							<ShieldIcon />
						</span>
						면접 전 연락처 보호
					</Badge>
					<h1 className="mt-5 mb-3 font-extrabold text-[42px] leading-tight">
						공고 탐색부터 채팅까지
						<br />
						밤비 안에서 안전하게
					</h1>
					<p className="m-0 max-w-[560px] text-muted-foreground leading-relaxed">
						seed 계정으로 로그인하면 구직자 공고 탐색, 채팅 시작, 구인자 관리
						흐름을 바로 확인할 수 있어요.
					</p>
				</section>
				<Card className="rounded-lg" pad="lg" tone="outline">
					<div className="mb-5 lg:hidden">
						<Logo lang="ko" size="md" />
					</div>
					<h2 className="m-0 font-extrabold text-2xl">{title}</h2>
					<p className="mt-2 mb-5 text-muted-foreground text-sm">
						구직자 테스트 계정은 기본값으로 입력해두었어요.
					</p>
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
						<label className="grid gap-2" htmlFor="auth-password">
							<span className="font-bold text-sm">비밀번호</span>
							<Input
								autoComplete={isSignUp ? "new-password" : "current-password"}
								id="auth-password"
								onChange={(event) => setPassword(event.target.value)}
								type="password"
								value={password}
							/>
						</label>
						{message ? (
							<div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-800 text-sm">
								{message}
							</div>
						) : null}
						<Button
							block
							className="shadow-none"
							disabled={isSubmitting}
							onClick={handleSubmit}
						>
							{isSubmitting ? "처리 중" : submitLabel}
						</Button>
						<Button
							block
							onClick={() => {
								setMessage(null);
								setMode(isSignUp ? "sign-in" : "sign-up");
							}}
							variant="secondary"
						>
							{isSignUp ? "이미 계정이 있어요" : "새 계정 만들기"}
						</Button>
					</form>
				</Card>
			</div>
		</div>
	);
}
