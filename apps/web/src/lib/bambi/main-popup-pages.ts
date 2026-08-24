export type MainPopupAudience = "common" | "job_seeker" | "employer";

export interface MainPopupPageOption {
	audience: MainPopupAudience;
	id: string;
	label: string;
	match: (pathname: string) => boolean;
}

interface PopupCommunityBoard {
	key: string;
	label: string;
	slug: string;
}

const exact =
	(...paths: string[]) =>
	(pathname: string) =>
		paths.includes(pathname);
const prefix = (path: string) => (pathname: string) =>
	pathname === path || pathname.startsWith(`${path}/`);
const SEEKER_JOB_DETAIL_PATTERN = /^\/seeker\/jobs\/[^/]+$/;
const EMPLOYER_JOB_EDIT_PATTERN = /^\/employer\/jobs\/[^/]+\/edit$/;

export const MAIN_POPUP_PAGE_OPTIONS: MainPopupPageOption[] = [
	{ audience: "common", id: "main", label: "메인", match: exact("/seeker") },
	{
		audience: "common",
		id: "login",
		label: "로그인",
		// 로그인 화면은 pathname만으로 구분되지 않는다(비로그인 anon, 또는 게스트+auth 쿼리).
		// 실제 판별은 isLoginPopupScreen이 하고, 이 항목은 운영자 위치 선택지 노출용이다.
		match: () => false,
	},
	{
		audience: "common",
		id: "jobs",
		label: "지역별 채용 정보",
		match: prefix("/jobs"),
	},
	{
		audience: "common",
		id: "support",
		label: "고객센터",
		match: prefix("/support"),
	},
	{
		audience: "common",
		id: "community_free",
		label: "자유수다",
		match: exact("/board/free", "/seeker/community/free"),
	},
	{
		audience: "common",
		id: "community_work_talk",
		label: "밤문화 이야기",
		match: exact("/board/work-talk", "/seeker/community/work-talk"),
	},
	{
		audience: "common",
		id: "community_market",
		label: "중고거래",
		match: exact("/board/market", "/seeker/community/market"),
	},
	{
		audience: "common",
		id: "community_legal",
		label: "무료법률자문",
		match: exact("/board/legal", "/seeker/community/legal"),
	},
	{
		audience: "job_seeker",
		id: "seeker_job_detail",
		label: "공고 상세",
		match: (pathname) => SEEKER_JOB_DETAIL_PATTERN.test(pathname),
	},
	{
		audience: "job_seeker",
		id: "seeker_chats",
		label: "채팅",
		match: prefix("/seeker/chats"),
	},
	{
		audience: "job_seeker",
		id: "seeker_me",
		label: "내 정보",
		match: prefix("/seeker/me"),
	},
	{
		audience: "job_seeker",
		id: "seeker_attendance",
		label: "포인트 내역",
		match: prefix("/seeker/attendance"),
	},
	{
		audience: "employer",
		id: "employer_home",
		label: "내 공고",
		match: exact("/employer"),
	},
	{
		audience: "employer",
		id: "employer_new",
		label: "공고 등록",
		match: prefix("/employer/new"),
	},
	{
		audience: "employer",
		id: "employer_job_edit",
		label: "공고 수정",
		match: (pathname) => EMPLOYER_JOB_EDIT_PATTERN.test(pathname),
	},
	{
		audience: "employer",
		id: "employer_promotions",
		label: "광고 관리",
		match: prefix("/employer/promotions"),
	},
	{
		audience: "employer",
		id: "employer_analytics",
		label: "성과 분석",
		match: prefix("/employer/analytics"),
	},
	{
		audience: "employer",
		id: "employer_me",
		label: "내 정보",
		match: prefix("/employer/me"),
	},
	{
		audience: "employer",
		id: "employer_settings",
		label: "조직 설정",
		match: prefix("/employer/settings"),
	},
	{
		audience: "employer",
		id: "employer_teams",
		label: "팀 관리",
		match: prefix("/employer/teams"),
	},
	{
		audience: "employer",
		id: "employer_attendance",
		label: "포인트 내역",
		match: prefix("/employer/attendance"),
	},
	{
		audience: "employer",
		id: "employer_ad_guide",
		label: "광고 안내",
		match: prefix("/employer/ad-guide"),
	},
];

const BUILTIN_COMMUNITY_PAGE_IDS = new Map([
	["free", "community_free"],
	["work_talk", "community_work_talk"],
	["market", "community_market"],
	["legal", "community_legal"],
]);

const communityPopupPageId = (key: string) =>
	BUILTIN_COMMUNITY_PAGE_IDS.get(key) ?? `community_board:${key}`;

export const popupPageOptionsForAudience = (
	audience: MainPopupAudience,
	boards: PopupCommunityBoard[] = []
) => {
	const staticOptions = MAIN_POPUP_PAGE_OPTIONS.filter(
		(option) => option.audience === "common" || option.audience === audience
	);
	const staticIds = new Set(staticOptions.map((option) => option.id));
	const dynamicBoards = boards
		.map((board) => ({
			audience: "common" as const,
			id: communityPopupPageId(board.key),
			label: board.label,
			match: exact(`/board/${board.slug}`, `/seeker/community/${board.slug}`),
		}))
		.filter((option) => !staticIds.has(option.id));
	return [...staticOptions, ...dynamicBoards];
};

// 로그인 화면(비로그인 상태에서 로그인 패널이 실제 보이는 경우)만 "login"으로 판별한다.
// - anon 방문자: /seeker는 항상 로그인 게이트 화면(쿼리 무관).
// - 게스트: /seeker?auth=login|signup일 때만 로그인 패널이 뜬다.
// - 로그인 사용자: 로그인 화면 자체를 볼 수 없으므로 항상 false.
export const isLoginPopupScreen = (input: {
	authParam: string | null;
	isAuthenticated: boolean;
	isGuest: boolean;
	pathname: string;
}): boolean => {
	if (input.isAuthenticated || input.pathname !== "/seeker") {
		return false;
	}
	return input.isGuest
		? input.authParam === "login" || input.authParam === "signup"
		: true;
};

export const resolveMainPopupPageId = (
	pathname: string,
	boards: PopupCommunityBoard[] = []
): string | null => {
	if (pathname.startsWith("/moderator")) {
		return null;
	}
	const dynamicBoard = boards.find(
		(board) =>
			pathname === `/board/${board.slug}` ||
			pathname === `/seeker/community/${board.slug}`
	);
	if (dynamicBoard) {
		return communityPopupPageId(dynamicBoard.key);
	}
	const candidates = MAIN_POPUP_PAGE_OPTIONS.filter((option) =>
		option.match(pathname)
	);
	return candidates.at(-1)?.id ?? null;
};
