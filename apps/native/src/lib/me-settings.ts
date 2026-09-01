// 계정 설정 화면(app/(seeker)/me/settings.tsx) 전용 순수 헬퍼. react-native를 import 하지
// 않아 노드에서 그대로 테스트된다(bambi-native.ts와 같은 규칙).

const DISPLAY_NAME_MIN_LENGTH = 2;
// 서버 zod가 max(80)이라 클라에서도 같은 상한을 막는다(하한 2자는 웹 UI 규칙).
const DISPLAY_NAME_MAX_LENGTH = 80;
const BIRTH_DATE_PATTERN = /^\d{8}$/;

// 웹 account-settings-screen의 formatGender와 같은 표 — enum 원값을 화면에 내보내지 않는다.
// 본인인증 전 계정은 null이라 "미설정"이 정상 경로다.
export const genderLabel = (gender: null | string | undefined): string => {
	if (gender === "male") {
		return "남성";
	}

	if (gender === "female") {
		return "여성";
	}

	return "미설정";
};

// birthDate는 date가 아니라 YYYYMMDD 8자리 text다. 인증 전이거나 형식이 어긋나면 미입력 처리.
export const formatBirthDate8 = (value: null | string | undefined): string =>
	value && BIRTH_DATE_PATTERN.test(value)
		? `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`
		: "미입력";

// 인증 번호는 하이픈 없이 "01012345678"로 저장된다. 알려진 자릿수에 정확히 맞을 때만
// 재조립하고 나머지(카카오 ID 등 자유 입력 연락처)는 원문 그대로 둔다 — 보수적이고 멱등.
const PHONE_PATTERNS: [RegExp, string][] = [
	[/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3"], // 휴대폰 11자리
	[/^(02)(\d{4})(\d{4})$/, "$1-$2-$3"], // 서울 10자리(02는 국번이 4자리)
	[/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3"], // 그 외 10자리
];

export const formatPhoneNumber = (value: string): string => {
	const rule = PHONE_PATTERNS.find(([pattern]) => pattern.test(value));

	return rule ? value.replace(rule[0], rule[1]) : value;
};

// 표시 이름 정본은 세션 user.name이라 current도 세션 값이 들어온다. 저장 가능하면 null.
export const validateDisplayName = (
	next: string,
	current: null | string | undefined
): null | string => {
	const trimmed = next.trim();

	if (trimmed.length < DISPLAY_NAME_MIN_LENGTH) {
		return "2자 이상 입력해 주세요.";
	}

	if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
		return "80자까지 입력할 수 있어요.";
	}

	if (trimmed === (current ?? "").trim()) {
		return "기존 이름과 같아요.";
	}

	return null;
};
