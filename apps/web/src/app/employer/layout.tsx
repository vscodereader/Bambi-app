import type { ReactNode } from "react";
import { AppShell } from "@/components/bambi/app-shell";
import { EmployerNav } from "@/components/bambi/persona-nav";

export default function EmployerLayout({ children }: { children: ReactNode }) {
	return (
		<AppShell>
			<EmployerNav>{children}</EmployerNav>
		</AppShell>
	);
}
