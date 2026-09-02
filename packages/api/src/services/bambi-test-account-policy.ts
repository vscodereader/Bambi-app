export const TEST_ACCOUNT_ROLES = ["job_seeker", "employer"] as const;
export const TEST_ACCOUNT_GENDERS = ["male", "female"] as const;
export const TEST_ACCOUNT_AUDIT_ACTION = "create_test_account";
export const TEST_ACCOUNT_BIRTH_PLACEHOLDER = "YYYYMMDD";
export const TEST_ACCOUNT_PHONE_PLACEHOLDER = "010-0000-0000";
export const TEST_ACCOUNT_PHONE_ERROR = `가번호는 ${TEST_ACCOUNT_PHONE_PLACEHOLDER} 형식으로 입력해 주세요.`;

const TEST_ACCOUNT_PHONE_PATTERN = /^010\d{8}$/;

export const formatTestAccountBirthInput = (value: string): string =>
	value.replace(/\D/g, "").slice(0, 8);

export const normalizeTestAccountPhone = (value: string): string | null => {
	const digits = value.replaceAll("-", "");
	return TEST_ACCOUNT_PHONE_PATTERN.test(digits) ? digits : null;
};

export const formatTestAccountPhoneInput = (value: string): string => {
	const digits = value.replace(/\D/g, "").slice(0, 11);
	if (digits.length <= 3) {
		return digits;
	}
	if (digits.length <= 7) {
		return `${digits.slice(0, 3)}-${digits.slice(3)}`;
	}
	return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};
