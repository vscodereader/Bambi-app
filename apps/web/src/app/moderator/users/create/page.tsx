"use client";

import {
	formatTestAccountBirthInput,
	formatTestAccountPhoneInput,
	normalizeTestAccountPhone,
	TEST_ACCOUNT_BIRTH_PLACEHOLDER,
	TEST_ACCOUNT_GENDERS,
	TEST_ACCOUNT_PHONE_ERROR,
	TEST_ACCOUNT_PHONE_PLACEHOLDER,
	TEST_ACCOUNT_ROLES,
} from "@bambi-app/api/services/bambi-test-account-policy";
import { ADULT_MIN_AGE } from "@bambi-app/api/services/portone-identity";
import {
	DISPLAY_NAME_MIN_LENGTH,
	displayNameMinimumMessage,
} from "@bambi-app/auth/display-name-policy";
import { getLoginIdErrorMessage } from "@bambi-app/auth/login-id";
import {
	PASSWORD_MIN_LENGTH,
	passwordMinimumMessage,
} from "@bambi-app/auth/password-policy";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, CircleCheckIcon, InfoIcon } from "lucide-react";
import { useRef, useState } from "react";
import { userGenderLabel, userRoleLabel } from "@/lib/bambi/moderation-labels";
import { orpc } from "@/utils/orpc";

type Role = (typeof TEST_ACCOUNT_ROLES)[number];
type Gender = (typeof TEST_ACCOUNT_GENDERS)[number];

const ROLE_ITEMS = Object.fromEntries(
	TEST_ACCOUNT_ROLES.map((role) => [role, userRoleLabel(role)])
) as Record<Role, string>;
const GENDER_ITEMS = Object.fromEntries(
	TEST_ACCOUNT_GENDERS.map((gender) => [gender, userGenderLabel(gender)])
) as Record<Gender, string>;

interface FormState {
	birthDate: string;
	gender: Gender | "";
	loginId: string;
	name: string;
	nickname: string;
	password: string;
	passwordConfirm: string;
	phoneNumber: string;
	role: Role | "";
}

const EMPTY_FORM: FormState = {
	birthDate: "",
	gender: "",
	loginId: "",
	name: "",
	nickname: "",
	password: "",
	passwordConfirm: "",
	phoneNumber: "",
	role: "",
};

interface CreatedSummary {
	loginId: string;
	nickname: string;
	role: Role;
}

const validationMessage = (form: FormState): string | null => {
	if (!form.name.trim()) {
		return "이름을 입력해 주세요.";
	}
	if (form.nickname.trim().length < DISPLAY_NAME_MIN_LENGTH) {
		return displayNameMinimumMessage();
	}
	const loginIdError = getLoginIdErrorMessage(form.loginId.trim());
	if (loginIdError) {
		return loginIdError;
	}
	if (!form.birthDate) {
		return "생년월일을 입력해 주세요.";
	}
	if (!form.gender) {
		return "성별을 선택해 주세요.";
	}
	if (!form.role) {
		return "직업을 선택해 주세요.";
	}
	if (form.password.length < PASSWORD_MIN_LENGTH) {
		return passwordMinimumMessage();
	}
	if (form.password !== form.passwordConfirm) {
		return "비밀번호 확인이 일치하지 않습니다.";
	}
	if (!normalizeTestAccountPhone(form.phoneNumber)) {
		return TEST_ACCOUNT_PHONE_ERROR;
	}
	return null;
};

export default function ModeratorCreateAccountPage() {
	const queryClient = useQueryClient();
	const birthPickerRef = useRef<HTMLInputElement>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);
	const [formError, setFormError] = useState<string | null>(null);
	const [created, setCreated] = useState<CreatedSummary | null>(null);
	const createMutation = useMutation(
		orpc.bambi.moderation.createTestAccount.mutationOptions({
			onError: (error) => setFormError(error.message),
			onSuccess: async (result) => {
				setCreated({
					loginId: result.loginId,
					nickname: result.nickname,
					role: result.role,
				});
				setForm(EMPTY_FORM);
				setFormError(null);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listUsers.key(),
				});
			},
		})
	);

	const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
		setForm((current) => ({ ...current, [key]: value }));
	};

	const submit = () => {
		const message = validationMessage(form);
		if (message) {
			setFormError(message);
			return;
		}
		if (!(form.gender && form.role)) {
			return;
		}
		setFormError(null);
		setCreated(null);
		createMutation.mutate({
			birthDate: form.birthDate,
			gender: form.gender,
			loginId: form.loginId.trim(),
			nickname: form.nickname.trim(),
			password: form.password,
			phoneNumber: form.phoneNumber,
			role: form.role,
		});
	};

	const openBirthPicker = () => {
		const picker = birthPickerRef.current;
		if (!picker) {
			return;
		}
		if (typeof picker.showPicker === "function") {
			picker.showPicker();
			return;
		}
		picker.click();
	};

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">계정 생성</h1>
				<p className="m-0 text-muted-foreground text-sm">
					실제 본인인증 없이 역할·성별별 기능을 확인할 가계정을 만듭니다.
				</p>
			</div>

			<Alert variant="brand">
				<InfoIcon />
				<AlertTitle>테스트 전용 계정입니다</AlertTitle>
				<AlertDescription>
					이름은 저장하지 않고 닉네임만 서비스에 표시합니다. 실제 CI·DI와 인증
					이력은 건드리지 않으며, 이 계정은 ID/PW로 로그인해야 합니다. 구인자는
					로그인 후 업체 정보 제출과 운영자 승인을 별도로 거쳐야 합니다.
					가계정은 자동으로 만료되거나 삭제되지 않습니다.
				</AlertDescription>
			</Alert>

			{created ? (
				<Alert>
					<CircleCheckIcon />
					<AlertTitle>가계정을 생성했습니다</AlertTitle>
					<AlertDescription>
						{`${created.nickname} · ${created.loginId} · ${ROLE_ITEMS[created.role]} · 휴대폰 인증 완료`}
					</AlertDescription>
				</Alert>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>계정 정보</CardTitle>
					<CardDescription>
						입력한 ID와 비밀번호로 기존 로그인 화면에서 바로 로그인합니다.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="grid gap-4 md:grid-cols-2"
						id="create-test-account-form"
						onSubmit={(event) => {
							event.preventDefault();
							submit();
						}}
					>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="test-account-name">이름</Label>
							<Input
								id="test-account-name"
								onChange={(event) => setField("name", event.target.value)}
								placeholder="이름을 입력해 주세요"
								value={form.name}
							/>
							<p className="m-0 text-muted-foreground text-xs">
								이 입력값은 저장되지 않습니다.
							</p>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="test-account-nickname">닉네임</Label>
							<Input
								id="test-account-nickname"
								onChange={(event) => setField("nickname", event.target.value)}
								placeholder="서비스 표시 닉네임"
								value={form.nickname}
							/>
							<p className="m-0 text-muted-foreground text-xs">
								서비스와 게시글에 표시되는 이름입니다.
							</p>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="test-account-birth">생년월일</Label>
							<div className="flex items-center gap-2">
								<Input
									id="test-account-birth"
									inputMode="numeric"
									onChange={(event) =>
										setField(
											"birthDate",
											formatTestAccountBirthInput(event.target.value)
										)
									}
									placeholder={TEST_ACCOUNT_BIRTH_PLACEHOLDER}
									value={form.birthDate}
								/>
								<Button
									aria-label="달력에서 생년월일 선택"
									onClick={openBirthPicker}
									size="icon"
									type="button"
									variant="outline"
								>
									<CalendarIcon data-icon="inline-start" />
								</Button>
								<input
									aria-hidden="true"
									className="sr-only"
									onChange={(event) =>
										setField(
											"birthDate",
											formatTestAccountBirthInput(event.target.value)
										)
									}
									ref={birthPickerRef}
									tabIndex={-1}
									type="date"
								/>
							</div>
							<p className="m-0 text-muted-foreground text-xs">
								숫자 8자리로 직접 입력하거나 달력에서 선택하세요.
								{` 만 ${ADULT_MIN_AGE}세 이상만 생성할 수 있습니다.`}
							</p>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="test-account-gender">성별</Label>
							<Select
								items={GENDER_ITEMS}
								onValueChange={(value) =>
									setField("gender", String(value) as Gender)
								}
								value={form.gender}
							>
								<SelectTrigger id="test-account-gender">
									<SelectValue placeholder="성별 선택" />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(GENDER_ITEMS).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="test-account-role">직업</Label>
							<Select
								items={ROLE_ITEMS}
								onValueChange={(value) =>
									setField("role", String(value) as Role)
								}
								value={form.role}
							>
								<SelectTrigger id="test-account-role">
									<SelectValue placeholder="직업 선택" />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(ROLE_ITEMS).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="test-account-phone">가번호</Label>
							<Input
								id="test-account-phone"
								inputMode="numeric"
								onChange={(event) =>
									setField(
										"phoneNumber",
										formatTestAccountPhoneInput(event.target.value)
									)
								}
								placeholder={TEST_ACCOUNT_PHONE_PLACEHOLDER}
								value={form.phoneNumber}
							/>
						</div>
						<div className="flex flex-col gap-1.5 md:col-span-2">
							<Label htmlFor="test-account-login-id">ID</Label>
							<Input
								autoCapitalize="none"
								id="test-account-login-id"
								onChange={(event) => setField("loginId", event.target.value)}
								placeholder="로그인 아이디"
								value={form.loginId}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="test-account-password">PW</Label>
							<Input
								autoComplete="new-password"
								id="test-account-password"
								onChange={(event) => setField("password", event.target.value)}
								type="password"
								value={form.password}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="test-account-password-confirm">PW 확인</Label>
							<Input
								autoComplete="new-password"
								id="test-account-password-confirm"
								onChange={(event) =>
									setField("passwordConfirm", event.target.value)
								}
								type="password"
								value={form.passwordConfirm}
							/>
						</div>
						{formError ? (
							<Alert className="md:col-span-2" variant="destructive">
								<AlertDescription>{formError}</AlertDescription>
							</Alert>
						) : null}
					</form>
				</CardContent>
				<CardFooter className="justify-end">
					<Button
						disabled={createMutation.isPending}
						form="create-test-account-form"
						type="submit"
					>
						{createMutation.isPending ? "생성 중" : "저장"}
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
