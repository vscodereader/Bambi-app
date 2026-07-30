"use client";

// 목(mock) 휴대폰 본인인증 다이얼로그 — 포트원 미구성 개발 환경 전용 폴백.
// PhoneVerifyDialog가 NEXT_PUBLIC_PORTONE_* 부재를 감지하면 이 폼을 렌더한다.
// 직접 import 하지 말고 항상 PhoneVerifyDialog를 거칠 것(프로덕션은 env 가드가
// 포트원 구성을 강제하므로 이 폼이 노출되지 않는다).

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { useState } from "react";
import type { BambiGenderValue, MockPhoneVerifyInput } from "@/lib/bambi/guest";
import { Button, Input } from "./ds";
import { PhoneIcon } from "./icons";

const NON_DIGIT = /\D/g;
const BIRTH_PATTERN = /^\d{8}$/;

const isPhoneValid = (phone: string): boolean =>
	phone.replace(NON_DIGIT, "").length >= 10;

const isBirthValid = (birth: string): boolean =>
	BIRTH_PATTERN.test(birth.replace(NON_DIGIT, ""));

interface MockPhoneVerifyDialogProps {
	// 트리거 버튼에 덧입힐 클래스(실인증 경로와 같은 모양을 유지하기 위해 그대로 받는다).
	className?: string;
	// 이미 성별이 있는 사용자(예: 회원)를 위해 선택 상태를 미리 채운다.
	defaultGender?: BambiGenderValue | null;
	description?: string;
	// 인증 성공 시 호출. 제공하면 게스트 쿠키 흐름 대신 이 콜백으로 결과를 넘겨
	// 호출부(예: 계정설정)가 저장을 담당한다. 실인증 API 도입 시 이 콜백 경계는 유지된다.
	onVerified?: (input: MockPhoneVerifyInput) => Promise<void> | void;
	// 트리거 버튼 크기(실인증 경로와 동일).
	size?: ComponentProps<typeof Button>["size"];
	title?: string;
	triggerLabel?: string;
	// 트리거 버튼의 위계(주 액션만 primary). 폼 안의 취소·인증하기 버튼과는 무관하다.
	variant?: ComponentProps<typeof Button>["variant"];
}

export function MockPhoneVerifyDialog({
	className,
	onVerified,
	size,
	triggerLabel = "휴대폰 인증",
	title = "휴대폰 본인인증",
	description = "본인인증 후 공고 목록을 열람할 수 있어요. (지금은 목 인증 단계예요)",
	defaultGender = null,
	variant = "secondary",
}: MockPhoneVerifyDialogProps = {}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [birth, setBirth] = useState("");
	const [phone, setPhone] = useState("");
	const [gender, setGender] = useState<BambiGenderValue | null>(defaultGender);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const validate = (): string | null => {
		if (name.trim().length < 2) {
			return "이름을 2자 이상 입력해 주세요.";
		}
		if (!isBirthValid(birth)) {
			return "생년월일 8자리(YYYYMMDD)를 입력해 주세요.";
		}
		if (!isPhoneValid(phone)) {
			return "휴대폰 번호를 정확히 입력해 주세요.";
		}
		if (gender === null) {
			return "성별을 선택해 주세요.";
		}
		return null;
	};

	// onVerified 미제공 시의 기본 동작: 게스트 인증 쿠키 세팅 후 공고 화면으로 이동.
	const runGuestFlow = async (verified: MockPhoneVerifyInput) => {
		const response = await fetch("/api/guest", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(verified),
		});
		if (!response.ok) {
			// 미성년 차단(403) 등 서버가 사유를 보내면 그대로 보여준다.
			const data = (await response.json().catch(() => null)) as {
				message?: string;
			} | null;
			setError(
				data?.message ?? "인증 처리에 실패했어요. 입력을 확인해 주세요."
			);
			return;
		}
		setOpen(false);
		router.push("/seeker" as Route);
		router.refresh();
	};

	const resolveSubmitError = (err: unknown): string => {
		if (onVerified) {
			return err instanceof Error && err.message
				? err.message
				: "인증에 실패했어요. 다시 시도해 주세요.";
		}
		return "네트워크 오류로 인증에 실패했어요. 다시 시도해 주세요.";
	};

	const submit = async () => {
		setError(null);
		const validationError = validate();
		if (validationError !== null || gender === null) {
			setError(validationError);
			return;
		}

		const verified: MockPhoneVerifyInput = {
			name: name.trim(),
			birth: birth.replace(NON_DIGIT, ""),
			phone: phone.trim(),
			gender,
		};

		setIsSubmitting(true);
		try {
			if (onVerified) {
				await onVerified(verified);
				setOpen(false);
			} else {
				await runGuestFlow(verified);
			}
		} catch (err) {
			setError(resolveSubmitError(err));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<Button
				block
				className={className}
				leftIcon={<PhoneIcon />}
				onClick={() => setOpen(true)}
				size={size}
				variant={variant}
			>
				{triggerLabel}
			</Button>
			<DialogContent>
				<div className="flex flex-col gap-2">
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</div>
				<form
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						submit().catch(() => setIsSubmitting(false));
					}}
				>
					<label className="grid gap-2" htmlFor="verify-name">
						<span className="font-bold text-sm">이름</span>
						<Input
							autoComplete="name"
							id="verify-name"
							onChange={(event) => setName(event.target.value)}
							placeholder="예: 홍길동"
							value={name}
						/>
					</label>
					<label className="grid gap-2" htmlFor="verify-birth">
						<span className="font-bold text-sm">생년월일</span>
						<Input
							id="verify-birth"
							inputMode="numeric"
							onChange={(event) => setBirth(event.target.value)}
							placeholder="예: 19950101"
							value={birth}
						/>
					</label>
					<label className="grid gap-2" htmlFor="verify-phone">
						<span className="font-bold text-sm">휴대폰 번호</span>
						<Input
							autoComplete="tel"
							id="verify-phone"
							inputMode="tel"
							onChange={(event) => setPhone(event.target.value)}
							placeholder="예: 010-1234-5678"
							value={phone}
						/>
					</label>
					<div className="grid gap-2">
						<span className="font-bold text-sm" id="verify-gender-label">
							성별
						</span>
						<ToggleGroup
							aria-labelledby="verify-gender-label"
							className="grid w-full grid-cols-2 gap-2"
							onValueChange={(value) => {
								const next = value.at(-1);
								if (next === "male" || next === "female") {
									setGender(next);
								}
							}}
							value={gender ? [gender] : []}
						>
							<ToggleGroupItem className="w-full" value="male">
								남성
							</ToggleGroupItem>
							<ToggleGroupItem className="w-full" value="female">
								여성
							</ToggleGroupItem>
						</ToggleGroup>
					</div>
					{error ? (
						<p
							className="m-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 font-semibold text-destructive text-sm"
							role="alert"
						>
							{error}
						</p>
					) : null}
					<div className="mt-1 grid grid-cols-2 gap-2">
						<Button
							block
							disabled={isSubmitting}
							onClick={() => setOpen(false)}
							variant="secondary"
						>
							취소
						</Button>
						<Button block disabled={isSubmitting} type="submit">
							{isSubmitting ? "인증 중" : "인증하기"}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
