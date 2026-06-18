export const industryOptions = [
	"라운지",
	"바",
	"클럽",
	"노래방",
	"기타",
] as const;
export const regionOptions = [
	"서울",
	"경기",
	"인천",
	"부산",
	"대구",
	"대전",
	"광주",
	"기타",
] as const;
export const payUnitOptions = ["시급", "일급", "주급", "월급"] as const;

export const jobStatusLabels = {
	draft: "임시 저장",
	pending_review: "검수 대기",
	published: "공개",
	hidden: "숨김",
	rejected: "반려",
} as const;

export const verificationStatusLabels = {
	none: "미인증",
	pending: "인증 대기",
	verified: "인증 완료",
	rejected: "인증 반려",
} as const;

export const interviewStatusLabels = {
	proposed: "제안됨",
	confirmed: "확정",
	declined: "거절",
	canceled: "취소",
	completed: "완료",
} as const;
