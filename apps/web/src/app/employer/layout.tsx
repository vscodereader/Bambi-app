import type { Route } from "next";
import type { ReactNode } from "react";
import { EmployerApprovalProvider } from "@/components/bambi/employer-approval-context";
import { EmployerNav } from "@/components/bambi/persona-nav";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
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
	const { approvalStatus } = await resolveEmployerAccess();
	// 미승인이어도 화면과 nav는 그대로 노출한다. 각 페이지가 approval 상태로
	// 조작 요소를 비활성화하고 안내 배너를 띄운다.
	return (
		<ResponsiveAppShell navItems={EMPLOYER_NAV_ITEMS} variant="employer">
			<EmployerNav>
				<EmployerApprovalProvider value={approvalStatus}>
					{children}
				</EmployerApprovalProvider>
			</EmployerNav>
		</ResponsiveAppShell>
	);
}
