import { NEGOTIABLE_PAY_TEXT } from "./bambi-options";

// 금액이 없는 공고(급여 단위 "협의")는 "0원 / 협의" 대신 협의 문구만 보여준다.
export const formatPay = (amount: null | number, unit: string): string =>
	amount === null
		? NEGOTIABLE_PAY_TEXT
		: `${new Intl.NumberFormat("ko-KR").format(amount)}원 / ${unit}`;

export const formatDate = (value: string | Date): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeZone: "Asia/Seoul",
	}).format(new Date(value));

export const formatDateTime = (value: string | Date): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Asia/Seoul",
	}).format(new Date(value));

export const formatNullable = (value: null | string | undefined): string =>
	value?.trim() ? value : "미입력";

// 본인인증(포트원/KCP) 번호는 하이픈 없이 "01012345678"로 저장된다. 저장값은
// 인증 로그의 unique 키라 정규화하지 않고, 화면에 그릴 때만 하이픈을 넣는다.
// 알려진 자릿수 패턴에 정확히 맞을 때만 재조립하고 나머지(콜핀 합성 "1566-1945 + 0000",
// 국제표기 "+82…", 자리표시자, 빈 값)는 원문 그대로 둔다 — 보수적이고 멱등.
const phonePatterns: [RegExp, string][] = [
	[/^(01[016789])(\d{4})(\d{4})$/, "$1-$2-$3"], // 휴대폰 11자리
	[/^(01[016789])(\d{3})(\d{4})$/, "$1-$2-$3"], // 휴대폰 10자리(구 번호)
	[/^(02)(\d{3})(\d{4})$/, "$1-$2-$3"], // 서울 9자리
	[/^(02)(\d{4})(\d{4})$/, "$1-$2-$3"], // 서울 10자리
	[/^(050\d)(\d{4})(\d{4})$/, "$1-$2-$3"], // 안심번호 12자리
	[/^(0(?!50)[3-9]\d)(\d{3})(\d{4})$/, "$1-$2-$3"], // 지역·070 10자리
	[/^(0(?!50)[3-9]\d)(\d{4})(\d{4})$/, "$1-$2-$3"], // 지역·070 11자리
	[/^(1[568]\d\d)(\d{4})$/, "$1-$2"], // 15XX·16XX·18XX 대표번호
];

const LETTER_PATTERN = /[A-Za-z]/;
const NON_DIGIT_PATTERN = /\D/g;

export const formatPhone = (value: string): string => {
	// 카카오 ID·이메일 등 자유 입력 연락처가 섞여 들어오면 손대지 않는다.
	if (LETTER_PATTERN.test(value)) {
		return value;
	}

	const digits = value.replace(NON_DIGIT_PATTERN, "");
	const rule = phonePatterns.find(([pattern]) => pattern.test(digits));

	return rule ? digits.replace(rule[0], rule[1]) : value;
};

// 개업일자는 DB에 YYYYMMDD 8자리 텍스트로 저장된다. 화면 표시와 date input 값은
// 둘 다 YYYY-MM-DD라 변환 지점을 여기 하나로 둔다(값이 없으면 빈 문자열).
export const formatBusinessStartDate = (
	value: null | string | undefined
): string =>
	value?.length === 8
		? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`
		: "";
