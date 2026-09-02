import type { OnboardingRole } from "./onboarding";

export const COACHMARK_TARGETS = {
	employerBusiness: "employer-business",
	employerChat: "employer-chat",
	employerPost: "employer-post",
	seekerChat: "seeker-chat",
	seekerMe: "seeker-me",
	seekerSearch: "seeker-search",
} as const;

export const COACHMARK_ACTION_LABELS = {
	complete: "완료",
	next: "다음",
	previous: "이전",
	skip: "건너뛰기",
} as const;

export interface CoachmarkStep {
	description: string;
	id: string;
	targets: readonly string[];
	title: string;
}

export const ROLE_COACHMARK_STEPS: Readonly<
	Record<OnboardingRole, readonly CoachmarkStep[]>
> = {
	job_seeker: [
		{
			description: "지역과 업종을 선택해 원하는 공고를 빠르게 찾아보세요.",
			id: "seeker-search-filter",
			targets: [COACHMARK_TARGETS.seekerSearch],
			title: "공고 검색과 필터",
		},
		{
			description: "구인자와 나눈 대화는 채팅에서 확인할 수 있어요.",
			id: "seeker-chat",
			targets: [COACHMARK_TARGETS.seekerChat],
			title: "채팅",
		},
		{
			description:
				"면접 일정, 후기, 신고와 계정 설정은 내 정보에서 확인하세요.",
			id: "seeker-me",
			targets: [COACHMARK_TARGETS.seekerMe],
			title: "내 정보",
		},
	],
	employer: [
		{
			description: "먼저 업체 정보를 등록하면 운영자 확인이 시작돼요.",
			id: "employer-business",
			targets: [COACHMARK_TARGETS.employerBusiness],
			title: "업체 정보",
		},
		{
			description: "승인이 완료되면 여기에서 새로운 공고를 등록할 수 있어요.",
			id: "employer-post",
			targets: [COACHMARK_TARGETS.employerPost],
			title: "공고 등록",
		},
		{
			description: "지원자와 대화하고 면접 일정을 관리해 보세요.",
			id: "employer-chat",
			targets: [COACHMARK_TARGETS.employerChat],
			title: "지원자 채팅",
		},
	],
};

export const COACHMARK_TARGET_ATTRIBUTE = "data-onboarding-target";
const isVisibleElement = (element: HTMLElement): boolean => {
	const rect = element.getBoundingClientRect();
	const style = window.getComputedStyle(element);
	return (
		element.getClientRects().length > 0 &&
		rect.width > 0 &&
		rect.height > 0 &&
		style.display !== "none" &&
		style.visibility !== "hidden"
	);
};

export const findVisibleCoachmarkTarget = (
	targets: readonly string[]
): HTMLElement | null => {
	for (const target of targets) {
		const candidates = document.querySelectorAll<HTMLElement>(
			`[${COACHMARK_TARGET_ATTRIBUTE}="${target}"]`
		);
		for (const candidate of candidates) {
			if (isVisibleElement(candidate)) {
				return candidate;
			}
		}
	}
	return null;
};
