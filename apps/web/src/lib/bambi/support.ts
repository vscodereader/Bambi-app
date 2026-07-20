// 고객센터 메타·경로 유틸. 카테고리·상태 라벨의 단일 진실원.
// enum 원값이 화면에 새지 않도록 표시 문구는 반드시 여기를 거친다.
import type { Route } from "next";

export const SUPPORT_CATEGORIES = [
	"account",
	"job_post",
	"payment",
	"report",
	"etc",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
	account: "계정·로그인",
	job_post: "공고·지원",
	payment: "결제·광고",
	report: "신고·제재",
	etc: "기타",
};

export type InquiryStatus = "open" | "answered" | "closed";

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
	open: "접수됨",
	answered: "답변완료",
	closed: "종료",
};

// 운영 조치 상태(community_content_status 재사용) 라벨.
export type ContentStatus = "published" | "hidden" | "deleted";

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
	published: "게시중",
	hidden: "숨김",
	deleted: "삭제됨",
};

export const SUPPORT_PATH = "/support" as Route;
export const SUPPORT_INQUIRIES_PATH = "/support/inquiries" as Route;
export const SUPPORT_INQUIRY_NEW_PATH = "/support/inquiries/new" as Route;

export const supportInquiryPath = (inquiryId: string): Route =>
	`/support/inquiries/${inquiryId}` as Route;
