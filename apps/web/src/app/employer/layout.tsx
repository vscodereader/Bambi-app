import type { Route } from "next";
import type { ReactNode } from "react";
import { EmployerNav } from "@/components/bambi/persona-nav";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";

const EMPLOYER_NAV_ITEMS = [
	{ href: "/employer", label: "내 공고" },
	{ href: "/employer/new", label: "공고 등록" },
	{ href: "/employer/settings" as Route, label: "조직 설정" },
	{ href: "/employer/me", label: "업체 정보" },
	{ href: "/seeker", label: "채용정보" },
] as const;

export default function EmployerLayout({ children }: { children: ReactNode }) {
	return (
		<ResponsiveAppShell navItems={EMPLOYER_NAV_ITEMS} variant="employer">
			<EmployerNav>{children}</EmployerNav>
		</ResponsiveAppShell>
	);
}
