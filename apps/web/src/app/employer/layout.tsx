import type { Route } from "next";
import type { ReactNode } from "react";
import { AccountStatusBanner } from "@/components/bambi/account-status-banner";
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
	{ href: "/employer/attendance" as Route, label: "출석체크" },
	{
		label: "업체 관리",
		items: [
			{ href: "/employer/me", label: "업체 정보" },
			{ href: "/employer/settings" as Route, label: "조직 설정" },
		],
	},
	// 고객센터는 커뮤니티 분기에서 추가된 진입점이라 nav 그룹화(PR #26) 대상에 없었다.
	// 업체 관리 항목이 아니므로 그룹에 넣지 않고 최상위로 유지한다.
	{ href: "/support" as Route, label: "고객센터" },
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
					<AccountStatusBanner />
					{children}
				</EmployerApprovalProvider>
			</EmployerNav>
		</ResponsiveAppShell>
	);
}
