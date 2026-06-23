import type { ReactNode } from "react";
import { ModeratorShell } from "@/components/bambi/persona-nav";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { ModProvider } from "@/components/bambi/screens/moderator-context";

const MODERATOR_NAV_ITEMS = [
	{ href: "/moderator", label: "검수 큐" },
	{ href: "/moderator/reports", label: "신고" },
	{ href: "/moderator/users", label: "사용자" },
	{ href: "/seeker", label: "채용정보" },
] as const;

export default function ModeratorLayout({ children }: { children: ReactNode }) {
	return (
		<ResponsiveAppShell navItems={MODERATOR_NAV_ITEMS} variant="moderator">
			<ModProvider>
				<ModeratorShell>{children}</ModeratorShell>
			</ModProvider>
		</ResponsiveAppShell>
	);
}
