import type { Route } from "next";
import type { ReactNode } from "react";
import { ModeratorShell } from "@/components/bambi/persona-nav";
import {
	type NavEntry,
	ResponsiveAppShell,
} from "@/components/bambi/responsive-shell";
import { ModProvider } from "@/components/bambi/screens/moderator-context";
import { APP_CONTENT_MAX_W } from "@/lib/bambi/layout";
import { enforceModeratorAccess } from "@/lib/bambi/require-role";

const MODERATOR_NAV_ITEMS: NavEntry[] = [
	{ href: "/moderator", label: "검수 큐" },
	{ href: "/moderator/reports", label: "신고" },
	{ href: "/moderator/users", label: "사용자" },
	{
		label: "승인 관리",
		items: [
			{ href: "/moderator/employers", label: "업소 승인" },
			{ href: "/moderator/team-invites", label: "팀 합류 승인" },
		],
	},
	{
		label: "광고·결제",
		items: [
			{ href: "/moderator/ad-products", label: "광고 상품" },
			{ href: "/moderator/payments", label: "결제 관리" },
		],
	},
	{
		label: "콘텐츠·고객센터",
		items: [
			// 신규 라우트는 Next typedRoutes 생성 타입에 아직 없을 수 있어 캐스팅한다.
			{ href: "/moderator/content" as Route, label: "게시물" },
			{ href: "/moderator/support" as Route, label: "고객센터" },
			{ href: "/moderator/banned-words" as Route, label: "금칙어" },
			// 후기 관리는 운영자 관리 분기에서 추가된 콘텐츠 조치 화면이라 같은 그룹에 둔다.
			{ href: "/moderator/reviews", label: "후기 관리" },
		],
	},
	{ href: "/moderator/site-settings" as Route, label: "사이트 정보" },
	{ href: "/seeker", label: "채용정보" },
];

export default async function ModeratorLayout({
	children,
}: {
	children: ReactNode;
}) {
	await enforceModeratorAccess();
	return (
		<ResponsiveAppShell
			// 헤더 바를 채용(/seeker)과 동일한 고정폭으로 정렬한다(콘솔 본문 폭은 그대로).
			contentWidthClassName={APP_CONTENT_MAX_W}
			navItems={MODERATOR_NAV_ITEMS}
			variant="moderator"
		>
			<ModProvider>
				<ModeratorShell>{children}</ModeratorShell>
			</ModProvider>
		</ResponsiveAppShell>
	);
}
