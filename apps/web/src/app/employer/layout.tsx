import type { Route } from "next";
import type { ReactNode } from "react";
import { EmployerNav } from "@/components/bambi/persona-nav";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { EmployerPending } from "@/components/bambi/screens/employer-pending";
import { resolveEmployerAccess } from "@/lib/bambi/require-role";

const EMPLOYER_NAV_ITEMS = [
	{ href: "/employer", label: "내 공고" },
	{ href: "/employer/new", label: "공고 등록" },
	{ href: "/employer/settings" as Route, label: "조직 설정" },
	{ href: "/employer/me", label: "업체 정보" },
	{ href: "/seeker", label: "채용정보" },
] as const;

export default async function EmployerLayout({
	children,
}: {
	children: ReactNode;
}) {
	const access = await resolveEmployerAccess();
	// 미승인 구인자는 구인 관리 기능을 쓸 수 없다 — 헤더 nav·하단 탭을 숨기고
	// 로고와 "내 정보"만 남겨(gated) 승인 대기 화면만 보게 한다.
	const gated = !access.verified;
	return (
		<ResponsiveAppShell
			gated={gated}
			navItems={gated ? [] : EMPLOYER_NAV_ITEMS}
			variant="employer"
		>
			<EmployerNav gated={gated}>
				{access.verified ? children : <EmployerPending />}
			</EmployerNav>
		</ResponsiveAppShell>
	);
}
