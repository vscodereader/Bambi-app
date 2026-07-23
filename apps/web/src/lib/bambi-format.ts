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
