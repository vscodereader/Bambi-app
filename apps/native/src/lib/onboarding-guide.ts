export const SEEKER_GUIDE_SLIDES = [
	{
		description:
			"지역과 업종, 근무 조건을 살펴보고 원하는 공고를 빠르게 찾을 수 있어요.",
		icon: "map-outline",
		id: "seeker-marketplace",
		title: "내게 맞는 일자리, 밤비에서 찾아보세요!",
	},
	{
		description:
			"마음에 드는 공고에서 구인자와 대화하고 이미지나 PDF도 주고받을 수 있어요.",
		icon: "chatbubble-ellipses-outline",
		id: "seeker-chat",
		title: "궁금한 내용은 채팅으로 바로 물어보세요!",
	},
	{
		description:
			"채팅에서 면접일정을 확인하고 필요한 경우에만 연락처를 공유해요.",
		icon: "calendar-outline",
		id: "seeker-interview-contact",
		title: "면접과 연락처를 안전하게 관리해요!",
	},
	{
		description:
			"별점과 후기를 남겨 다른 구직자가 업체를 판단하는 데 도움을 줄 수 있어요.",
		icon: "star-outline",
		id: "seeker-review-safety",
		title: "면접 경험을 후기로 남겨주세요!",
	},
	{
		description: "다양한 활동으로 번 포인트를 사용해 상품을 구매하세요!",
		icon: "storefront-outline",
		id: "seeker-point-shop",
		title: "포인트로 실제 상품권 구매까지!",
	},
] as const;

export const clampGuideIndex = (index: number): number =>
	Math.max(0, Math.min(SEEKER_GUIDE_SLIDES.length - 1, index));

export const signupSuccessRoute = (role: "employer" | "job_seeker"): string =>
	role === "job_seeker" ? "/feature-guide" : "/";
