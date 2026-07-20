import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { APP_CONTENT_MAX_W, SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

// 고객센터는 구인자·구직자 공통 창구라 역할 셸(seeker/employer)에 묶지 않는다.
// 헤더 폭과 본문 폭은 다른 화면과 동일한 공용 상수를 그대로 쓴다 — 폭 기준이 갈리면
// 헤더와 본문 정렬이 어긋난다(커뮤니티 채팅 프리플라이트에서 같은 문제가 있었다).
export default function SupportLayout({ children }: { children: ReactNode }) {
	return (
		<ResponsiveAppShell
			contentWidthClassName={APP_CONTENT_MAX_W}
			variant="public"
		>
			<div
				className={cn(
					// main이 w-full이라 max-w만으로는 왼쪽에 붙는다 — mx-auto로 중앙 정렬한다.
					"mx-auto flex w-full min-w-0 flex-col px-5 md:px-6",
					SEEKER_CONTENT_WIDTH
				)}
			>
				{children}
			</div>
		</ResponsiveAppShell>
	);
}
