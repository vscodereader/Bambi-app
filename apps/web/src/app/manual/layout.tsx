import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { APP_CONTENT_MAX_W, SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

// 매뉴얼은 전 역할 공통 문서 영역이라 고객센터와 같은 이유로 seeker 셸을 쓴다
// (셸이 실제로 구분하는 건 public/moderator뿐 — app/support/layout.tsx 주석 참고).
// 문서 열람 화면이라 광고 rail은 두지 않는다. 훅이 없어 RSC 레이아웃으로 충분하다.
export default function ManualLayout({ children }: { children: ReactNode }) {
	return (
		<ResponsiveAppShell
			contentWidthClassName={APP_CONTENT_MAX_W}
			variant="seeker"
		>
			<div
				className={cn(
					"mx-auto flex w-full min-w-0 flex-col px-5 md:px-6",
					SEEKER_CONTENT_WIDTH
				)}
			>
				{children}
			</div>
		</ResponsiveAppShell>
	);
}
