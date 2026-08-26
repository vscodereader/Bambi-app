// 수다방 게시판 메타·경로·표시 유틸.
// 게시판 목록의 정본은 DB(community_board)이고 화면은 use-community-boards 훅으로 받는다.
// 여기 COMMUNITY_BOARDS는 DB에 담기지 않는 것들의 출처다 — 가상 게시판(best), 공지의
// 운영자 전용 규칙, 공개 영역(/board) 고정 3종, 액센트 같은 표시 메타.
// key는 저장값(신규 게시판은 slug와 같다), slug는 URL 세그먼트다.

export type CommunityBoardKey =
	| "notice"
	| "best"
	| "free"
	| "work_talk"
	| "market"
	| "legal"
	| "secret";

export interface CommunityBoardMeta {
	// 운영자만 글을 쓸 수 있는 게시판(공지사항). 목록/폼에서 글쓰기 권한 게이트에 쓴다.
	adminOnly?: boolean;
	description: string;
	// 운영자가 지정한 lucide 아이콘 이름(community-board-icons의 맵으로 그린다).
	// 빌트인 메타에는 없고, DB 행에서만 실려 온다 — 없으면 기존 모양 그대로다.
	icon?: string | null;
	// 운영자가 추가한 게시판도 담기므로 리터럴 유니온이 아니라 문자열이다.
	key: string;
	label: string;
	slug: string;
	writable: boolean;
}

// 코드에 박힌 게시판 메타 — key가 리터럴로 좁혀져 있어 고정 집합만 다루는 화면
// (공개 /board 3종 등)이 캐스팅 없이 쓴다.
export type BuiltinBoardMeta = CommunityBoardMeta & { key: CommunityBoardKey };

export const COMMUNITY_AUTHOR_FALLBACK = "회원";

// 작성인 표시명 정규화. null·빈 문자열·공백뿐인 값은 기본값("회원")으로 폴백한다
// (목록·상세 공통 규칙).
export const communityAuthorName = (
	value: string | null | undefined
): string => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : COMMUNITY_AUTHOR_FALLBACK;
};

// 작성인 유형(author_role) 표시 라벨. enum 원값을 그대로 렌더하지 않으며, 목록에 없는
// 값(job_seeker·admin·미래 값)은 중립 폴백("회원")으로 표시한다.
const COMMUNITY_AUTHOR_ROLE_LABELS: Record<string, string> = {
	employer: "업소 회원",
	guest: "비회원",
	legal_advisor: "법률자문",
};

export const communityAuthorRoleLabel = (
	role: string | null | undefined
): string =>
	COMMUNITY_AUTHOR_ROLE_LABELS[role ?? ""] ?? COMMUNITY_AUTHOR_FALLBACK;

export const COMMUNITY_BOARDS: BuiltinBoardMeta[] = [
	{
		adminOnly: true,
		description: "밤비알바 수다방 공지",
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
		description: "밤비알바 회원들의 자유로운 이야기",
		key: "free",
		label: "자유수다",
		slug: "free",
		writable: true,
	},
	{
		description: "일·알바 경험과 정보를 나눠요",
		key: "work_talk",
		label: "밤문화 이야기",
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
	{
		description: "법률자문에게 비밀글로 물어보는 무료 상담",
		key: "legal",
		label: "무료 법률 자문",
		slug: "legal",
		writable: true,
	},
];

// DB 게시판 행(communityBoards.listActive)의 화면용 형태.
export interface ActiveBoardRow {
	description: string;
	icon: string | null;
	isWritable: boolean;
	key: string;
	label: string;
	slug: string;
}

// DB 행 → 화면 메타. adminOnly(공지 운영자 전용)는 DB에 없는 빌트인 규칙이라 key로 얹는다 —
// 운영자가 새로 만든 게시판은 adminOnly가 없어 표준 동작(회원 열람·작성)만 갖는다.
export const toBoardMeta = (row: ActiveBoardRow): CommunityBoardMeta => ({
	adminOnly: COMMUNITY_BOARDS.find((board) => board.key === row.key)?.adminOnly,
	description: row.description,
	icon: row.icon,
	key: row.key,
	label: row.label,
	slug: row.slug,
	writable: row.isWritable,
});

// 화면이 쓰는 게시판 목록. 베스트는 DB 행이 아니라 서버가 만들어 주는 가상 게시판이라
// 선두에 직접 얹는다(community.overview도 같은 자리에 끼운다). 베스트 아이콘은 DB 행이 없어
// site_settings에 저장되므로 listActive가 함께 내려준 bestIcon을 여기서 메타에 얹는다
// (미지정이면 null → 기존 코럴 액센트 바 유지).
export const toBoardMetas = (
	rows: ActiveBoardRow[],
	bestIcon: string | null = null
): CommunityBoardMeta[] => [
	{ ...getBoardByKey("best"), icon: bestIcon },
	...rows.map(toBoardMeta),
];

// 법률 자문 게시판은 글이 전부 비밀글(서버 강제)이고 연락처 입력이 열린다 — 폼·상세가
// 같은 판정을 쓰도록 한 곳에 둔다.
export const isLegalBoardKey = (key: string): boolean => key === "legal";
export const isSecretBoardKey = (key: string): boolean => key === "secret";

// 빌트인 게시판 key → 표시 라벨. key 원값이 화면에 새지 않도록 표시는 라벨 맵을 거친다.
// 운영자가 추가한 게시판은 여기 없으므로 DB 라벨(communityBoards.list)을 먼저 보고
// 이 맵은 폴백으로 쓴다. 둘 다 없으면 원값 폴백(REPORT_REASON_LABELS와 동일 관례).
export const COMMUNITY_BOARD_LABELS: Record<string, string> =
	Object.fromEntries(COMMUNITY_BOARDS.map((board) => [board.key, board.label]));

// 법률자문 계정이 다른 게시판을 눌렀을 때의 안내(서버 LEGAL_ADVISOR_BOARD_ERROR와 같은 말).
export const LEGAL_ADVISOR_BOARD_NOTICE =
	"법률자문 계정은 무료 법률 자문 게시판만 이용할 수 있어요.";

// 코드가 key 리터럴로 특수 동작을 분기하는 저장 게시판 — 운영자가 지울 수 없다(서버
// community-boards.remove의 BUILTIN_BOARD_KEYS와 같은 말). best는 DB 행이 아니라 가상
// 게시판이라 애초에 운영자 목록에 나오지 않는다.
export const isBuiltinBoardKey = (key: string): boolean =>
	key === "secret" ||
	(key !== "best" && COMMUNITY_BOARDS.some((board) => board.key === key));

// 빌트인 게시판 전용 조회 — 동적 게시판까지 보려면 useBoardBySlug 훅을 쓴다.
export const getBoardBySlug = (slug: string): BuiltinBoardMeta | undefined =>
	COMMUNITY_BOARDS.find((board) => board.slug === slug);

export const getBoardByKey = (key: CommunityBoardKey): BuiltinBoardMeta => {
	const board = COMMUNITY_BOARDS.find((item) => item.key === key);
	if (!board) {
		throw new Error(`Unknown community board key: ${key}`);
	}
	return board;
};

export const COMMUNITY_ROOT_PATH = "/seeker/community";

// DB enum(main|community)에 대응하는 Web 배치 surface 단일 소스. 운영자 저장·메인·수다방
// 조회가 문자열을 각자 반복하지 않도록 이 상수만 사용한다.
export const COMMUNITY_LAYOUT_SURFACE = {
	community: "community",
	main: "main",
} as const;

export const communityBoardPath = (slug: string): string =>
	`${COMMUNITY_ROOT_PATH}/${slug}`;

// 법률자문 계정이 눌러도 되는 수다방 경로. 허용 게시판의 slug는 DB 목록에서 받은 값을
// 호출부가 넘긴다. 표시명·주소를 코드에 다시 두지 않는다.
export const isLegalAdvisorAllowedPath = (
	href: string,
	allowedBoardSlugs: string[]
): boolean =>
	href === COMMUNITY_ROOT_PATH ||
	allowedBoardSlugs.some((slug) => href.startsWith(communityBoardPath(slug)));

export const communityPostPath = (slug: string, postId: string): string =>
	`/seeker/community/${slug}/${postId}`;

// 수집 글 전용 상세 경로. 순수 글(communityPostPath)과 나란히 두되 게시판 slug 없이
// 정적 세그먼트 crawled로 분기한다 — 수집 글은 게시판에 종속되지 않고 전용 상세로 간다.
export const communityCrawledPath = (topicId: string): string =>
	`/seeker/community/crawled/${topicId}`;

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
