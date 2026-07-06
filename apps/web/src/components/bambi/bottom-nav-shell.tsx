// 밤비 — 모바일 하단 탭바 공유 셸.
// position: fixed + env(safe-area-inset-bottom)로 주소창 접힘/펼침·홈 인디케이터에
// 무관하게 항상 뷰포트 바닥에 고정한다. sticky 특유의 iOS 부유 버그를 피한다.

import type { ReactNode } from "react";

// 고정 탭바가 흐름에서 빠지므로, 노출 라우트의 스크롤 콘텐츠 하단에 더할 패딩.
// 4.5rem(72px)은 BottomNav 실제 높이(≈67px)를 안전하게 초과하도록 선택.
export const BOTTOM_NAV_CONTENT_SPACER =
	"pb-[calc(4.5rem+env(safe-area-inset-bottom))]";

// 고정 탭바 위에 다른 고정 요소(운영자 액션바·토스트)를 띄울 때의 bottom 오프셋.
export const BOTTOM_NAV_STACK_OFFSET =
	"bottom-[calc(4.5rem+env(safe-area-inset-bottom))]";

export function BottomNavShell({ children }: { children: ReactNode }) {
	return (
		<div className="fixed inset-x-0 bottom-0 z-30 border-border border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
			{children}
		</div>
	);
}
