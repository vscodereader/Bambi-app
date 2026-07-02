import type { ReactNode } from "react";
import { AppShell } from "@/components/bambi/app-shell";
import { SeekerNav } from "@/components/bambi/persona-nav";

export default function SeekerLayout({ children }: { children: ReactNode }) {
	return (
		<AppShell>
			<SeekerNav>{children}</SeekerNav>
		</AppShell>
	);
}
