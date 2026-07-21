export const industryOptions = [
	"라운지",
	"바",
	"클럽",
	"호스트바",
	"카페",
	"노래방",
	"기타",
] as const;

export const regionOptions = ["서울", "경기", "인천", "부산", "기타"] as const;

// 시/도 → 세부지역. 폼·seeker 필터·mock이 공유하는 단일 소스.
export const REGION_DISTRICTS: Record<string, readonly string[]> = {
	서울: ["강남", "서초", "송파", "마포", "용산", "강북"],
	경기: ["부천", "수원", "성남", "안양"],
	인천: ["남동", "부평", "미추홀"],
	부산: ["해운대", "서면", "연제"],
	기타: [],
};

// 선택한 시/도의 세부지역 목록(정의 없으면 빈 배열).
export function districtsForRegion(region: string): readonly string[] {
	return REGION_DISTRICTS[region] ?? [];
}
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
