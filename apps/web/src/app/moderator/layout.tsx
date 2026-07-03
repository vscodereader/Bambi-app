import type { ReactNode } from "react";
import { ModeratorShell } from "@/components/bambi/persona-nav";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { ModProvider } from "@/components/bambi/screens/moderator-context";
import { enforceRoleRouting } from "@/lib/bambi/require-role";

const MODERATOR_NAV_ITEMS = [
	{ href: "/moderator", label: "검수 큐" },
	{ href: "/moderator/reports", label: "신고" },
	{ href: "/moderator/users", label: "사용자" },
	{ href: "/moderator/employers", label: "업소 승인" },
	{ href: "/seeker", label: "채용정보" },
] as const;

export default async function ModeratorLayout({
	children,
}: {
	children: ReactNode;
}) {
	await enforceRoleRouting();
	return (
		<ResponsiveAppShell navItems={MODERATOR_NAV_ITEMS} variant="moderator">
			<ModProvider>
				<ModeratorShell>{children}</ModeratorShell>
			</ModProvider>
		</ResponsiveAppShell>
	);
}
