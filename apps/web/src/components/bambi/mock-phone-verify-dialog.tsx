"use client";

// 목(mock) 휴대폰 본인인증 다이얼로그 — 실제 인증 API가 없어 5개 필드를 직접 입력받아
// 인증 결과 쿠키를 세팅하는 임시 컴포넌트다. 실인증 도입 시 이 파일과 /api/guest의 목
// 처리, guest.ts의 adult* 상수를 함께 걷어낸다.

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
import { useState } from "react";
import type { BambiGenderValue } from "@/lib/bambi/guest";
import { Button, Input } from "./ds";
import { PhoneIcon } from "./icons";

const NON_DIGIT = /\D/g;
const BIRTH_PATTERN = /^\d{8}$/;

const isPhoneValid = (phone: string): boolean =>
	phone.replace(NON_DIGIT, "").length >= 10;

const isBirthValid = (birth: string): boolean =>
	BIRTH_PATTERN.test(birth.replace(NON_DIGIT, ""));

export function MockPhoneVerifyDialog() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [birth, setBirth] = useState("");
	const [phone, setPhone] = useState("");
	const [gender, setGender] = useState<BambiGenderValue | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const submit = async () => {
		setError(null);
		if (name.trim().length < 2) {
			setError("이름을 2자 이상 입력해 주세요.");
			return;
		}
		if (!isBirthValid(birth)) {
			setError("생년월일 8자리(YYYYMMDD)를 입력해 주세요.");
			return;
		}
		if (!isPhoneValid(phone)) {
			setError("휴대폰 번호를 정확히 입력해 주세요.");
			return;
		}
		if (gender === null) {
			setError("성별을 선택해 주세요.");
			return;
		}

		setIsSubmitting(true);
		try {
			const response = await fetch("/api/guest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: name.trim(),
					birth: birth.replace(NON_DIGIT, ""),
					phone: phone.trim(),
					gender,
				}),
			});
			if (!response.ok) {
				setError("인증 처리에 실패했어요. 입력을 확인해 주세요.");
				return;
			}
			setOpen(false);
			router.push("/seeker" as Route);
			router.refresh();
		} catch {
			setError("네트워크 오류로 인증에 실패했어요. 다시 시도해 주세요.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<Button
				block
				leftIcon={<PhoneIcon />}
				onClick={() => setOpen(true)}
				variant="secondary"
			>
				휴대폰 인증
			</Button>
			<DialogContent>
				<div className="flex flex-col gap-2">
					<DialogTitle>휴대폰 본인인증</DialogTitle>
					<DialogDescription>
						본인인증 후 공고 목록을 열람할 수 있어요. (지금은 목 인증 단계예요)
					</DialogDescription>
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
