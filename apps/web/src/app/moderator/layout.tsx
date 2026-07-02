import type { ReactNode } from "react";
import { AppShell } from "@/components/bambi/app-shell";
import { ModeratorShell } from "@/components/bambi/persona-nav";
import { ModProvider } from "@/components/bambi/screens/moderator-context";

export default function ModeratorLayout({ children }: { children: ReactNode }) {
	return (
		<AppShell>
			<ModProvider>
				<ModeratorShell>{children}</ModeratorShell>
			</ModProvider>
		</AppShell>
	);
}
