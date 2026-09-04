import { getJobDisplayStatus } from "@/src/lib/employer/job-status";

// web /employer/page.tsx MobileOwnedJobs의 정렬 규칙 이식 — 옵션 순서·비교식까지 동일하다.
export type EmployerJobSort = "pay" | "recent" | "status" | "title";

export interface SortableEmployerJob {
	payAmount: null | number;
	paymentStatus: null | string;
	status: string;
	title: string;
	updatedAt: Date | string;
}

export const EMPLOYER_JOB_SORT_OPTIONS: readonly {
	label: string;
	value: EmployerJobSort;
}[] = [
	{ label: "최근 수정순", value: "recent" },
	{ label: "제목순", value: "title" },
	{ label: "급여순", value: "pay" },
	{ label: "상태순", value: "status" },
];

// 입력 배열은 react-query 캐시가 들고 있는 것이라 그대로 정렬하면 안 된다 — 복사 후 정렬.
export const sortEmployerJobs = <T extends SortableEmployerJob>(
	jobs: readonly T[],
	sort: EmployerJobSort
): T[] =>
	[...jobs].sort((left, right) => {
		if (sort === "title") {
			return left.title.localeCompare(right.title, "ko");
		}

		if (sort === "pay") {
			return (right.payAmount ?? 0) - (left.payAmount ?? 0);
		}

		if (sort === "status") {
			return getJobDisplayStatus(left).label.localeCompare(
				getJobDisplayStatus(right).label,
				"ko"
			);
		}

		return (
			new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
		);
	});
