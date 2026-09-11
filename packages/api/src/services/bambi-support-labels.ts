export const SUPPORT_CATEGORIES = [
	"account",
	"job_post",
	"payment",
	"report",
	"design",
	"etc",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
	account: "계정·로그인",
	design: "디자인 제작",
	etc: "기타",
	job_post: "공고·지원",
	payment: "결제·광고",
	report: "신고·제재",
};

export const INQUIRY_STATUS_LABELS: Record<string, string> = {
	answered: "답변완료",
	closed: "종료",
	open: "접수됨",
};

export const supportCategoryLabel = (value: string): string =>
	SUPPORT_CATEGORY_LABELS[value as SupportCategory] ?? "기타";

export const inquiryStatusLabel = (value: string): string =>
	INQUIRY_STATUS_LABELS[value] ?? "상태 확인 필요";
