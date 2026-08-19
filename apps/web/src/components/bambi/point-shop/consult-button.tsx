"use client";

// 포인트몰 우측 레일의 1:1 상담 버튼. 문의 위젯(루트 레이아웃 상주)에 커스텀 이벤트를
// 던져 패널만 연다 — 위젯을 여기서 다시 마운트하면 대화 상태가 두 벌이 된다.

import { Button } from "@bambi-app/ui/components/button";
import { SUPPORT_CHAT_OPEN_EVENT } from "@/components/bambi/support-chat/support-chat-widget";

export function PointShopConsultButton() {
	return (
		<Button
			className="w-full"
			onClick={() => window.dispatchEvent(new Event(SUPPORT_CHAT_OPEN_EVENT))}
			type="button"
			variant="outline"
		>
			1:1 상담
		</Button>
	);
}
