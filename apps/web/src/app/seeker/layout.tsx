import type { ReactNode } from "react";
import { SeekerNav } from "@/components/bambi/persona-nav";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";

export default function SeekerLayout({ children }: { children: ReactNode }) {
	return (
		<ResponsiveAppShell variant="seeker">
			<SeekerNav>{children}</SeekerNav>
		</ResponsiveAppShell>
	);
}
