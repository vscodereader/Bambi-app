import type { Route } from "next";

import type { NavEntry } from "@/components/bambi/responsive-shell";
import { manualPath } from "./manual";

export interface ModeratorMoreGroup {
	items: { href: Route; label: string }[];
	label: string;
}

export const MODERATOR_ACCOUNT_CREATE_PATH = "/moderator/users/create" as Route;

/** 데스크톱 헤더와 모바일 더보기 메뉴가 함께 쓰는 운영자 전체 메뉴. */
export const MODERATOR_NAV_ITEMS: NavEntry[] = [
	{ href: "/moderator", label: "검수 큐" },
	{ href: "/moderator/jobs" as Route, label: "공고 관리" },
	{
		label: "회원 관리",
		items: [
			{ href: "/moderator/users", label: "사용자" },
			{ href: "/moderator/messages" as Route, label: "쪽지" },
			{ href: "/moderator/chats" as Route, label: "채팅" },
			{ href: "/moderator/interviews" as Route, label: "면접 일정" },
			{ href: "/moderator/reports", label: "신고" },
			{ href: "/moderator/employers", label: "업소 승인" },
			{ href: "/moderator/team-invites", label: "팀 합류 승인" },
		],
	},
	{
		label: "포인트 관리",
		items: [
			{ href: "/moderator/points/attendance" as Route, label: "출석 관리" },
			{ href: "/moderator/points/grades" as Route, label: "등급 관리" },
			{
				href: "/moderator/points/settings" as Route,
				label: "기타 포인트 설정",
			},
		],
	},
	{
		label: "광고·결제",
		items: [
			{ href: "/moderator/ad-products", label: "광고 상품" },
			{ href: "/moderator/payments", label: "결제 관리" },
			{ href: "/moderator/point-shop" as Route, label: "포인트몰" },
		],
	},
	{
		label: "콘텐츠",
		items: [
			{ href: "/moderator/content" as Route, label: "게시물" },
			{ href: "/moderator/community-boards" as Route, label: "게시판 관리" },
			{ href: "/moderator/support" as Route, label: "고객센터" },
			{ href: "/moderator/support-chats" as Route, label: "문의 채팅" },
			{ href: manualPath("moderator"), label: "운영자 매뉴얼" },
			{ href: "/moderator/banned-words" as Route, label: "금칙어" },
			{ href: "/moderator/reviews", label: "후기 관리" },
			{ href: "/moderator/crawler" as Route, label: "크롤링" },
			{ href: "/moderator/popups" as Route, label: "팝업" },
		],
	},
	{ href: "/moderator/site-settings" as Route, label: "사이트 정보" },
];

export const MODERATOR_MORE_GROUPS: ModeratorMoreGroup[] = [
	{
		label: "공고",
		items: [{ href: "/moderator/jobs" as Route, label: "공고 관리" }],
	},
	...MODERATOR_NAV_ITEMS.flatMap<ModeratorMoreGroup>((entry) => {
		if (!("items" in entry)) {
			if (entry.href === "/moderator" || entry.href === "/moderator/jobs") {
				return [];
			}
			return [{ label: "사이트", items: [entry] }];
		}

		return [{ label: entry.label, items: entry.items }];
	}),
];
