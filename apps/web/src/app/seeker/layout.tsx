import type { ReactNode } from "react";
import { AccountStatusBanner } from "@/components/bambi/account-status-banner";
import { SeekerNav } from "@/components/bambi/persona-nav";
import { SeekerAppShell } from "@/components/bambi/seeker-app-shell";

export default function SeekerLayout({ children }: { children: ReactNode }) {
	return (
		<SeekerAppShell>
			<SeekerNav>
				<AccountStatusBanner />
				{children}
			</SeekerNav>
		</SeekerAppShell>
	);
}
