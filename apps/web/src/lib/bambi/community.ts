// 수다방 게시판 메타·경로·표시 유틸. 게시판 목록의 단일 진실원.
// key는 API enum(community_board + 가상 best), slug는 URL 세그먼트.

export type CommunityBoardKey = "best" | "free" | "work_talk" | "market";

export interface CommunityBoardMeta {
	description: string;
	key: CommunityBoardKey;
	label: string;
	slug: string;
	writable: boolean;
}

export const COMMUNITY_AUTHOR_FALLBACK = "회원";

export const COMMUNITY_BOARDS: CommunityBoardMeta[] = [
	{
		description: "최근 30일 동안 추천을 많이 받은 글",
		key: "best",
		label: "베스트글",
		slug: "best",
		writable: false,
	},
	{
		description: "밤비 회원들의 자유로운 이야기",
		key: "free",
		label: "자유수다",
		slug: "free",
		writable: true,
	},
	{
		description: "일·알바 경험과 정보를 나눠요",
		key: "work_talk",
		label: "일 이야기",
		slug: "work-talk",
		writable: true,
	},
	{
		description: "회원 간 중고 물품 거래",
		key: "market",
		label: "중고거래",
		slug: "market",
		writable: true,
	},
];

export const getBoardBySlug = (slug: string): CommunityBoardMeta | undefined =>
	COMMUNITY_BOARDS.find((board) => board.slug === slug);

export const getBoardByKey = (key: CommunityBoardKey): CommunityBoardMeta => {
	const board = COMMUNITY_BOARDS.find((item) => item.key === key);
	if (!board) {
		throw new Error(`Unknown community board key: ${key}`);
	}
	return board;
};

export const communityBoardPath = (slug: string): string =>
	`/seeker/community/${slug}`;

export const communityPostPath = (slug: string, postId: string): string =>
	`/seeker/community/${slug}/${postId}`;

export const communityWritePath = (slug: string): string =>
	`/seeker/community/${slug}/write`;

export const communityEditPath = (slug: string, postId: string): string =>
	`/seeker/community/${slug}/${postId}/edit`;

const pad2 = (value: number): string =>
	value < 10 ? `0${value}` : String(value);

export const formatCommunityDate = (value: Date | string): string => {
	const date = new Date(value);
	return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
};

export const getCommunityTotalPages = (
	totalCount: number,
	pageSize: number
): number => Math.max(1, Math.ceil(totalCount / pageSize));

// 번호 페이지네이션 윈도우: 양 끝 + 현재 주변 3칸(끝에서는 안쪽으로 밀어 유지), 간격은 말줄임 마커.
export const getCommunityPageItems = (
	current: number,
	total: number
): (number | "ellipsis-end" | "ellipsis-start")[] => {
	if (total <= 5) {
		return Array.from({ length: total }, (_, index) => index + 1);
	}

	const pages = new Set<number>([1, total]);
	let windowStart = current - 1;
	let windowEnd = current + 1;
	if (windowEnd > total) {
		windowStart -= windowEnd - total;
		windowEnd = total;
	}
	if (windowStart < 1) {
		windowEnd += 1 - windowStart;
		windowStart = 1;
	}
	for (let page = windowStart; page <= windowEnd; page += 1) {
		if (page >= 1 && page <= total) {
			pages.add(page);
		}
	}

	const sorted = [...pages].sort((a, b) => a - b);
	const items: (number | "ellipsis-end" | "ellipsis-start")[] = [];
	for (const [index, page] of sorted.entries()) {
		const previous = sorted[index - 1];
		if (previous !== undefined && page - previous > 1) {
			items.push(page > current ? "ellipsis-end" : "ellipsis-start");
		}
		items.push(page);
	}
	return items;
};
