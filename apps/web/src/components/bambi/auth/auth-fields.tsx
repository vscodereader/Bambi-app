// AuthPanel의 입력 필드 묶음. 값·검증은 패널이 들고 있고 여기서는 그리기만 한다.

import { Checkbox } from "@bambi-app/ui/components/checkbox";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import type { Route } from "next";
import Link from "next/link";
import type { ChangeEvent } from "react";
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
	return (
		<>
			<label className="grid gap-2" htmlFor="auth-nickname">
				<span className="font-bold text-sm">닉네임</span>
				<Input
					autoComplete="nickname"
					id="auth-nickname"
					onChange={onFieldChange("nickname")}
					placeholder="예: 밤비 구직자"
					value={values.nickname}
				/>
			</label>
			<label className="grid gap-2" htmlFor="auth-username">
				<span className="font-bold text-sm">아이디</span>
				<Input
					autoComplete="username"
					id="auth-username"
					onChange={onFieldChange("username")}
					placeholder="영문·숫자 3자 이상"
					value={values.username}
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

export function AuthSigninFields({
	onFieldChange,
	onForgotPassword,
	values,
}: {
	onFieldChange: AuthFieldChange;
	onForgotPassword: () => void;
	values: AuthFormValues;
}) {
	return (
		<>
			<label className="grid gap-2" htmlFor="auth-login-id">
				<span className="font-bold text-sm">아이디</span>
				<Input
					autoComplete="username"
					id="auth-login-id"
					onChange={onFieldChange("username")}
					placeholder="아이디를 입력해주세요."
					value={values.username}
				/>
			</label>
			<div className="grid gap-2">
				<div className="flex items-center justify-between gap-2">
					<label className="font-bold text-sm" htmlFor="auth-password">
						비밀번호
					</label>
					<button
						className="font-semibold text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
						onClick={onForgotPassword}
						type="button"
					>
						비밀번호를 잊으셨나요?
					</button>
				</div>
				<Input
					autoComplete="current-password"
					id="auth-password"
					onChange={onFieldChange("password")}
					placeholder="비밀번호를 입력해주세요."
					type="password"
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
