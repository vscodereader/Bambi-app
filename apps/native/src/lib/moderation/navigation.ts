import { type Href, router } from "expo-router";

export function returnToModeratorList(href: Href) {
	if (router.canGoBack()) {
		router.back();
	} else {
		router.replace(href);
	}
}
export interface ModeratorMenuItem {
	description: string;
	href: Href;
	label: string;
}
export interface ModeratorMenuGroup {
	items: readonly ModeratorMenuItem[];
	label: string;
}
const item = (label: string, href: string): ModeratorMenuItem => ({
	label,
	href: href as Href,
	description: `${label} 화면을 엽니다.`,
});
// Web MODERATOR_MORE_GROUPS names and ordering, adapted to native Stack routes.
export const MODERATOR_MORE_GROUPS: readonly ModeratorMenuGroup[] = [
	{ label: "공고", items: [item("공고 관리", "/(moderator)/jobs")] },
	{
		label: "회원 관리",
		items: [
			item("사용자", "/(moderator)/(tabs)/users"),
			item("쪽지", "/(moderator)/messages"),
			item("채팅", "/(moderator)/chats"),
			item("면접 일정", "/(moderator)/interviews"),
			item("신고", "/(moderator)/(tabs)/reports"),
			item("업소 승인", "/(moderator)/employers"),
			item("팀 합류 승인", "/(moderator)/team-invites"),
		],
	},
	{
		label: "포인트 관리",
		items: [
			item("출석 관리", "/(moderator)/points?tab=attendance"),
			item("등급 관리", "/(moderator)/points?tab=grades"),
			item("기타 포인트 설정", "/(moderator)/points?tab=settings"),
		],
	},
	{
		label: "광고·결제",
		items: [
			item("광고 상품", "/(moderator)/commerce?tab=products"),
			item("결제 관리", "/(moderator)/commerce?tab=payments"),
			item("포인트몰", "/(moderator)/commerce?tab=shop"),
		],
	},
	{
		label: "콘텐츠",
		items: [
			item("게시물", "/(moderator)/content"),
			item("게시판 관리", "/(moderator)/community-boards"),
			item("고객센터", "/(moderator)/support"),
			item("문의 채팅", "/(moderator)/support-chats"),
			item("운영자 매뉴얼", "/(moderator)/manual"),
			item("금칙어", "/(moderator)/banned-words"),
			item("후기 관리", "/(moderator)/reviews"),
			item("크롤링", "/(moderator)/crawler"),
			item("팝업", "/(moderator)/popups"),
		],
	},
	{
		label: "사이트",
		items: [item("사이트 정보", "/(moderator)/site-settings")],
	},
];
