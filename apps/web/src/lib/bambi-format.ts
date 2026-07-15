export const formatPay = (amount: number, unit: string): string =>
	`${new Intl.NumberFormat("ko-KR").format(amount)}원 / ${unit}`;

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
