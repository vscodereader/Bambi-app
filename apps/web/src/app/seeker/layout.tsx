import type { ReactNode } from "react";
import { SeekerNav } from "@/components/bambi/persona-nav";
import { SeekerAppShell } from "@/components/bambi/seeker-app-shell";

export default function SeekerLayout({ children }: { children: ReactNode }) {
	return (
		<SeekerAppShell>
			<SeekerNav>{children}</SeekerNav>
		</SeekerAppShell>
	);
}
