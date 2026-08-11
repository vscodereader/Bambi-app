export interface EmploymentResource {
	href: string;
	label: string;
}

// 구직자 보호 정보는 기관이 직접 갱신하는 공식 원문만 연결한다.
export const EMPLOYMENT_RESOURCES: readonly EmploymentResource[] = [
	{
		href: "https://www.moel.go.kr/minwon/rigion/rigion_C2.do",
		label: "관할 고용노동관서 찾기",
	},
	{
		href: "https://ei.work24.go.kr/ei/eim/cp/cc/ccJobCenSearch/retrieveCcJobCenSearch.do",
		label: "고용센터 찾기",
	},
	{ href: "tel:1350", label: "고용노동 상담 1350" },
	{ href: "https://www.klac.or.kr", label: "대한법률구조공단" },
] as const;
