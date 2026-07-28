// 수다방 게시판 메타·경로·표시 유틸. 게시판 목록의 단일 진실원.
// key는 API enum(community_board + 가상 best), slug는 URL 세그먼트.

export type CommunityBoardKey =
	| "notice"
	| "best"
	| "free"
	| "work_talk"
	| "market";

export interface CommunityBoardMeta {
	// 운영자만 글을 쓸 수 있는 게시판(공지사항). 목록/폼에서 글쓰기 권한 게이트에 쓴다.
	adminOnly?: boolean;
	description: string;
	key: CommunityBoardKey;
	label: string;
	slug: string;
	writable: boolean;
}

export const COMMUNITY_AUTHOR_FALLBACK = "회원";

// 작성인 표시명 정규화. null·빈 문자열·공백뿐인 값은 기본값("회원")으로 폴백한다
// (목록·상세 공통 규칙).
export const communityAuthorName = (
	value: string | null | undefined
): string => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : COMMUNITY_AUTHOR_FALLBACK;
};

export const COMMUNITY_BOARDS: CommunityBoardMeta[] = [
	{
		adminOnly: true,
		description: "밤비 수다방 공지",
		key: "notice",
		label: "공지사항",
		slug: "notice",
		writable: true,
	},
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

// 게시판 key(DB enum) → 표시 라벨. enum 원값이 화면에 새지 않도록 표시는 이 맵을 거친다.
// 모르는 key는 원값으로 폴백한다(REPORT_REASON_LABELS와 동일 관례) — 화면이 비는 것보다는 낫다.
export const COMMUNITY_BOARD_LABELS = Object.fromEntries(
	COMMUNITY_BOARDS.map((board) => [board.key, board.label])
) as Record<CommunityBoardKey, string>;

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

// 새 글 "N" 배지 기준 — 작성 후 이틀(48시간). 목록과 미리보기가 같은 기준으로 배지를
// 달도록 여기에 둔다. now를 인자로 받는 건 테스트에서 시간을 고정하기 위해서다.
const NEW_POST_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export const isNewCommunityPost = (
	value: Date | string,
	now: number = Date.now()
): boolean => now - new Date(value).getTime() < NEW_POST_WINDOW_MS;

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
