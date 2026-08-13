export type MainPopupAudience = "common" | "job_seeker" | "employer";

export interface MainPopupPageOption {
	audience: MainPopupAudience;
	id: string;
	label: string;
	match: (pathname: string) => boolean;
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
		label: "출석체크",
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
		label: "출석체크",
		match: prefix("/employer/attendance"),
	},
	{
		audience: "employer",
		id: "employer_ad_guide",
		label: "광고 안내",
		match: prefix("/employer/ad-guide"),
	},
];

export const popupPageOptionsForAudience = (audience: MainPopupAudience) =>
	MAIN_POPUP_PAGE_OPTIONS.filter(
		(option) => option.audience === "common" || option.audience === audience
	);

export const resolveMainPopupPageId = (pathname: string): string | null => {
	if (pathname.startsWith("/moderator")) {
		return null;
	}
	const candidates = MAIN_POPUP_PAGE_OPTIONS.filter((option) =>
		option.match(pathname)
	);
	return candidates.at(-1)?.id ?? null;
};
