import {
	userGenderLabel,
	userRoleLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
import {
	formatTestAccountBirthInput,
	formatTestAccountPhoneInput,
	normalizeTestAccountPhone,
	TEST_ACCOUNT_GENDERS,
	TEST_ACCOUNT_PHONE_ERROR,
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Surface, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { Text } from "react-native";
import { BambiHeader, BambiScreen, Pill } from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { orpc } from "@/src/lib/orpc";

type Role = (typeof TEST_ACCOUNT_ROLES)[number];
type Gender = (typeof TEST_ACCOUNT_GENDERS)[number];
const ROLE_OPTIONS = TEST_ACCOUNT_ROLES.map((value) => ({
	label: userRoleLabel(value),
	value,
}));
const GENDER_OPTIONS = TEST_ACCOUNT_GENDERS.map((value) => ({
	label: userGenderLabel(value),
	value,
}));
const EMPTY = {
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

export default function ModeratorCreateAccountScreen() {
	const [form, setForm] = useState(EMPTY);
	const [error, setError] = useState<string | null>(null);
	const [created, setCreated] = useState<string | null>(null);
	const client = useQueryClient();
	const { toast } = useToast();
	const mutation = useMutation(
		orpc.bambi.moderation.createTestAccount.mutationOptions({
			onSuccess: async (result) => {
				setCreated(
					`${result.nickname} · ${result.loginId} · ${userRoleLabel(result.role)}`
				);
				setForm(EMPTY);
				await client.invalidateQueries({
					queryKey: orpc.bambi.moderation.listUsers.key(),
				});
				toast.show({ label: "가계정을 생성했어요." });
			},
		})
	);
	const set = (key: keyof typeof EMPTY, value: string) => {
		setForm((current) => ({ ...current, [key]: value }));
		setError(null);
	};
	const validate = () => {
		if (!form.name.trim()) {
			return "이름을 입력해 주세요.";
		}
		if (form.nickname.trim().length < DISPLAY_NAME_MIN_LENGTH) {
			return displayNameMinimumMessage();
		}
		const loginError = getLoginIdErrorMessage(form.loginId.trim());
		if (loginError) {
			return loginError;
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
	const submit = () => {
		const message = validate();
		if (message) {
			setError(message);
			return;
		}
		mutation.mutate({
			birthDate: form.birthDate,
			gender: form.gender as Gender,
			loginId: form.loginId.trim(),
			nickname: form.nickname.trim(),
			password: form.password,
			phoneNumber: normalizeTestAccountPhone(form.phoneNumber) ?? "",
			role: form.role as Role,
		});
	};
	return (
		<BambiScreen>
			<BambiHeader
				description="실제 본인인증 없이 역할·성별별 기능을 확인할 테스트 계정을 만듭니다."
				title="계정 생성"
			/>
			<Surface className="gap-3 rounded-lg p-4" variant="secondary">
				<Pill tone="warning">테스트 전용</Pill>
				<Text className="text-muted text-sm leading-5">
					이름은 저장하지 않고 닉네임만 표시합니다. 실제 CI·DI는 건드리지 않으며
					자동 만료되지 않습니다.
				</Text>
				{created ? <Pill tone="success">{created}</Pill> : null}
				<TextField>
					<Input
						onChangeText={(value) => set("name", value)}
						placeholder="이름(저장되지 않음)"
						value={form.name}
					/>
				</TextField>
				<TextField>
					<Input
						onChangeText={(value) => set("nickname", value)}
						placeholder="서비스 표시 닉네임"
						value={form.nickname}
					/>
				</TextField>
				<TextField>
					<Input
						keyboardType="number-pad"
						onChangeText={(value) =>
							set("birthDate", formatTestAccountBirthInput(value))
						}
						placeholder="YYYYMMDD"
						value={form.birthDate}
					/>
				</TextField>
				<Text className="text-muted text-xs">
					만 {ADULT_MIN_AGE}세 이상만 생성할 수 있습니다.
				</Text>
				<FieldSelect
					label="성별"
					onChange={(value) => set("gender", value)}
					options={GENDER_OPTIONS}
					placeholder="성별 선택"
					value={form.gender}
				/>
				<FieldSelect
					label="직업"
					onChange={(value) => set("role", value)}
					options={ROLE_OPTIONS}
					placeholder="직업 선택"
					value={form.role}
				/>
				<TextField>
					<Input
						keyboardType="phone-pad"
						onChangeText={(value) =>
							set("phoneNumber", formatTestAccountPhoneInput(value))
						}
						placeholder="010-0000-0000"
						value={form.phoneNumber}
					/>
				</TextField>
				<TextField>
					<Input
						autoCapitalize="none"
						onChangeText={(value) => set("loginId", value)}
						placeholder="로그인 아이디"
						value={form.loginId}
					/>
				</TextField>
				<TextField>
					<Input
						onChangeText={(value) => set("password", value)}
						placeholder="비밀번호"
						secureTextEntry
						value={form.password}
					/>
				</TextField>
				<TextField>
					<Input
						onChangeText={(value) => set("passwordConfirm", value)}
						placeholder="비밀번호 확인"
						secureTextEntry
						value={form.passwordConfirm}
					/>
				</TextField>
				{error ? <Text className="text-danger text-sm">{error}</Text> : null}
				<Button isDisabled={mutation.isPending} onPress={submit}>
					<Button.Label>{mutation.isPending ? "생성 중" : "저장"}</Button.Label>
				</Button>
			</Surface>
		</BambiScreen>
	);
}
