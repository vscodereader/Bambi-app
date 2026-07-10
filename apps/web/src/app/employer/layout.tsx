import type { Route } from "next";
import type { ReactNode } from "react";
import { EmployerApprovalProvider } from "@/components/bambi/employer-approval-context";
import { EmployerNav } from "@/components/bambi/persona-nav";
import {
	type NavEntry,
	ResponsiveAppShell,
} from "@/components/bambi/responsive-shell";
import { APP_CONTENT_MAX_W } from "@/lib/bambi/layout";
import { resolveEmployerAccess } from "@/lib/bambi/require-role";

const EMPLOYER_NAV_ITEMS: NavEntry[] = [
	{ href: "/employer", label: "내 공고" },
	{ href: "/employer/new", label: "공고 등록" },
	{ href: "/employer/ad-guide" as Route, label: "광고 안내" },
	{
		label: "업체 관리",
		items: [
			{ href: "/employer/me", label: "업체 정보" },
			{ href: "/employer/settings" as Route, label: "조직 설정" },
		],
	},
];

export default async function EmployerLayout({
	children,
}: {
	children: ReactNode;
}) {
	const { approvalStatus } = await resolveEmployerAccess();
	// 미승인이어도 화면과 nav는 그대로 노출한다. 각 페이지가 approval 상태로
	// 조작 요소를 비활성화하고 안내 배너를 띄운다.
	return (
		<ResponsiveAppShell
			// 헤더 바를 채용(/seeker)과 동일한 고정폭으로 정렬한다(본문 폭은 그대로).
			contentWidthClassName={APP_CONTENT_MAX_W}
			navItems={EMPLOYER_NAV_ITEMS}
			variant="employer"
		>
			<EmployerNav>
				<EmployerApprovalProvider value={approvalStatus}>
					{children}
				</EmployerApprovalProvider>
			</EmployerNav>
		</ResponsiveAppShell>
	);
}
