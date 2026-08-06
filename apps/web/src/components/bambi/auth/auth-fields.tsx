// AuthPanel의 입력 필드 묶음. 값·검증은 패널이 들고 있고 여기서는 그리기만 한다.
// 비밀번호 표시 토글만 자기 상태를 갖는다 — 폼 값이 아니라 보기 방식이라 패널이 알 필요가 없다.

"use client";

import {
	getLoginIdErrorMessage,
	LOGIN_ID_HELP_TEXT,
	LOGIN_ID_MIN_LENGTH,
} from "@bambi-app/auth/login-id";
import { Button } from "@bambi-app/ui/components/button";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { cn } from "@bambi-app/ui/lib/utils";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { type ChangeEvent, useState } from "react";
import { Input } from "../ds";

export interface AuthFormValues {
	email: string;
	nickname: string;
	password: string;
	passwordConfirm: string;
	username: string;
}

export type SignupRole = "employer" | "job_seeker";

// 필드 이름을 받아 그 필드용 onChange를 돌려준다(패널이 한 곳에서 상태를 갱신한다).
export type AuthFieldChange = (
	field: keyof AuthFormValues
) => (event: ChangeEvent<HTMLInputElement>) => void;

export function AuthSignupFields({
	onFieldChange,
	onSignupRoleChange,
	signupRole,
	values,
}: {
	onFieldChange: AuthFieldChange;
	onSignupRoleChange: (role: SignupRole) => void;
	signupRole: SignupRole;
	values: AuthFormValues;
}) {
	// 서버(@bambi-app/auth의 공용 규칙)와 같은 검증을 입력 즉시 돌려, 회원가입 버튼을
	// 누르고 서버까지 다녀와서야 형식 오류를 아는 일이 없게 한다.
	// 다만 "3자 이상" 잔소리는 여기서 하지 않는다 — 짧은 값은 아직 입력 중일 뿐이라
	// 오류가 아니다(길이는 제출 시 auth-panel이 한 번 더 본다).
	const loginId = values.username.trim();
	const loginIdError =
		loginId.length >= LOGIN_ID_MIN_LENGTH
			? getLoginIdErrorMessage(loginId)
			: null;

	return (
		<>
			<label className="grid gap-2" htmlFor="auth-nickname">
				<span className="font-bold text-sm">닉네임</span>
				<Input
					autoComplete="nickname"
					id="auth-nickname"
					onChange={onFieldChange("nickname")}
					placeholder="예: 밤비알바 구직자"
					value={values.nickname}
				/>
			</label>
			<label className="grid gap-2" htmlFor="auth-username">
				<span className="font-bold text-sm">아이디</span>
				<Input
					autoComplete="username"
					error={loginIdError !== null}
					id="auth-username"
					onChange={onFieldChange("username")}
					placeholder="예: bambi-alba"
					value={values.username}
				/>
				{/* 규칙 안내는 상시 노출하고, 어긋난 순간에만 그 자리를 오류 문구로 바꾼다 —
				    두 줄이 동시에 뜨면 무엇을 고쳐야 하는지 흐려진다. */}
				<span
					className={cn(
						"text-xs leading-relaxed",
						loginIdError ? "text-destructive" : "text-muted-foreground"
					)}
					role={loginIdError ? "alert" : undefined}
				>
					{loginIdError ?? LOGIN_ID_HELP_TEXT}
				</span>
			</label>
			<label className="grid gap-2" htmlFor="auth-email">
				<span className="font-bold text-sm">이메일</span>
				<Input
					autoComplete="email"
					id="auth-email"
					onChange={onFieldChange("email")}
					placeholder="이메일을 입력해주세요."
					type="email"
					value={values.email}
				/>
			</label>
			<label className="grid gap-2" htmlFor="auth-password">
				<span className="font-bold text-sm">비밀번호</span>
				<Input
					autoComplete="new-password"
					id="auth-password"
					onChange={onFieldChange("password")}
					placeholder="비밀번호를 입력해주세요."
					type="password"
					value={values.password}
				/>
			</label>
			<label className="grid gap-2" htmlFor="auth-password-confirm">
				<span className="font-bold text-sm">비밀번호 확인</span>
				<Input
					autoComplete="new-password"
					id="auth-password-confirm"
					onChange={onFieldChange("passwordConfirm")}
					placeholder="비밀번호를 다시 입력해주세요."
					type="password"
					value={values.passwordConfirm}
				/>
			</label>
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
							onSignupRoleChange(next);
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
			{signupRole === "employer" ? (
				<p
					className="m-0 rounded-lg border border-border bg-secondary px-4 py-3 text-muted-foreground text-sm"
					role="note"
				>
					가입 후 업체 정보를 입력하고 운영자 승인을 받으면 구인 기능을 이용할
					수 있어요.
				</p>
			) : null}
		</>
	);
}

// 마스킹된 칸은 오타를 눈으로 잡을 수 없다 — 눈 아이콘으로 직접 확인할 길을 준다.
// 버튼은 입력 위에 겹쳐 두므로 입력에 오른쪽 여백을 줘 긴 비밀번호가 아이콘에 가리지 않게 한다.
// type="button"이 필수다 — 폼 안의 button은 기본이 submit이라 누르는 순간 로그인이 날아간다.
function AuthPasswordInput({
	autoComplete,
	id,
	onChange,
	placeholder,
	value,
}: {
	autoComplete: string;
	id: string;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	placeholder: string;
	value: string;
}) {
	const [isVisible, setIsVisible] = useState(false);
	return (
		<div className="relative">
			<Input
				autoComplete={autoComplete}
				id={id}
				inputClassName="pr-11"
				onChange={onChange}
				placeholder={placeholder}
				type={isVisible ? "text" : "password"}
				value={value}
			/>
			<Button
				aria-label={isVisible ? "비밀번호 숨기기" : "비밀번호 표시"}
				aria-pressed={isVisible}
				className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
				onClick={() => setIsVisible((prev) => !prev)}
				size="icon-sm"
				type="button"
				variant="ghost"
			>
				{isVisible ? <EyeOffIcon /> : <EyeIcon />}
			</Button>
		</div>
	);
}

// 찾기 링크는 라벨 옆에 붙는 보조 경로다 — 본 액션(로그인)과 위계가 겹치지 않게 텍스트로 둔다.
const RECOVERY_LINK_CLASS =
	"font-semibold text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline";

export function AuthSigninFields({
	onFieldChange,
	onFindId,
	onForgotPassword,
	values,
}: {
	onFieldChange: AuthFieldChange;
	// 본인인증이 불가한 환경(포트원 미구성)에서는 null이 와서 링크 자체를 렌더하지 않는다.
	onFindId: (() => void) | null;
	onForgotPassword: (() => void) | null;
	values: AuthFormValues;
}) {
	return (
		<>
			{/* 로그인은 아이디·이메일 둘 다 받는다(무엇으로 가입했는지 기억 못 해도 들어올 수
			    있게). type은 text로 둔다 — type="email"이면 아이디 입력이 브라우저 검증에
			    걸린다. autoComplete="username"은 두 값 모두에 맞는 힌트다.
			    아이디 칸은 라벨 옆에 찾기 링크가 붙어 label로 감싸지 않는다 — 감싸면 링크를
			    눌러도 라벨 클릭으로 번져 입력에 포커스가 간다(비밀번호 칸과 같은 구조). */}
			<div className="grid gap-2">
				<div className="flex items-center justify-between gap-2">
					<label className="font-bold text-sm" htmlFor="auth-login-id">
						아이디
					</label>
					{onFindId ? (
						<button
							className={RECOVERY_LINK_CLASS}
							onClick={onFindId}
							type="button"
						>
							아이디 찾기
						</button>
					) : null}
				</div>
				<Input
					autoComplete="username"
					id="auth-login-id"
					onChange={onFieldChange("username")}
					placeholder="아이디(이메일)를 입력해주세요."
					value={values.username}
				/>
			</div>
			<div className="grid gap-2">
				<div className="flex items-center justify-between gap-2">
					<label className="font-bold text-sm" htmlFor="auth-password">
						비밀번호
					</label>
					{onForgotPassword ? (
						<button
							className={RECOVERY_LINK_CLASS}
							onClick={onForgotPassword}
							type="button"
						>
							비밀번호를 잊으셨나요?
						</button>
					) : null}
				</div>
				<AuthPasswordInput
					autoComplete="current-password"
					id="auth-password"
					onChange={onFieldChange("password")}
					placeholder="비밀번호를 입력해주세요."
					value={values.password}
				/>
			</div>
		</>
	);
}

export function AuthTermsAgreement({
	checked,
	onCheckedChange,
}: {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-start gap-2.5">
			<Checkbox
				checked={checked}
				className="mt-0.5"
				id="auth-agree-terms"
				onCheckedChange={(next) => onCheckedChange(next === true)}
			/>
			<label
				className="text-muted-foreground text-sm leading-relaxed"
				htmlFor="auth-agree-terms"
			>
				<Link
					className="font-bold text-foreground underline-offset-2 hover:underline"
					href={"/terms" as Route}
					rel="noreferrer"
					target="_blank"
				>
					이용약관
				</Link>
				{" 및 "}
				<Link
					className="font-bold text-foreground underline-offset-2 hover:underline"
					href={"/privacy" as Route}
					rel="noreferrer"
					target="_blank"
				>
					개인정보 처리방침
				</Link>
				에 동의합니다.
			</label>
		</div>
	);
}
