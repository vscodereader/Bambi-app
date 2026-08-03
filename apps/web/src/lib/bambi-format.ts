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

// 개업일자는 DB에 YYYYMMDD 8자리 텍스트로 저장된다. 화면 표시와 date input 값은
// 둘 다 YYYY-MM-DD라 변환 지점을 여기 하나로 둔다(값이 없으면 빈 문자열).
export const formatBusinessStartDate = (
	value: null | string | undefined
): string =>
	value?.length === 8
		? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`
		: "";
