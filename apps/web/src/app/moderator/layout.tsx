import type { Route } from "next";
import type { ReactNode } from "react";
import { ModeratorShell } from "@/components/bambi/persona-nav";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { ModProvider } from "@/components/bambi/screens/moderator-context";
import { APP_CONTENT_MAX_W } from "@/lib/bambi/layout";
import { enforceModeratorAccess } from "@/lib/bambi/require-role";

const MODERATOR_NAV_ITEMS = [
	{ href: "/moderator", label: "검수 큐" },
	{ href: "/moderator/reports", label: "신고" },
	{ href: "/moderator/users", label: "사용자" },
	{ href: "/moderator/employers", label: "업소 승인" },
	{ href: "/moderator/team-invites", label: "팀 합류 승인" },
	{ href: "/moderator/ad-products", label: "광고 상품" },
	{ href: "/moderator/payments", label: "결제 관리" },
	// 신규 라우트는 Next typedRoutes 생성 타입에 아직 없을 수 있어 캐스팅한다.
	{ href: "/moderator/content" as Route, label: "게시물" },
	{ href: "/moderator/support" as Route, label: "고객센터" },
	{ href: "/moderator/banned-words" as Route, label: "금칙어" },
	{ href: "/seeker", label: "채용정보" },
] as const;

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
