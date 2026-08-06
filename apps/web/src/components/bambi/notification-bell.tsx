"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { NOTIFICATIONS_HREF } from "@/lib/bambi/notification-labels";
import { useBambiNotificationStream } from "@/lib/bambi/use-bambi-notification-stream";
import { orpc } from "@/utils/orpc";
import { useBambiAuth } from "./auth-client-provider";
import { BellIcon } from "./icons";

// 두 자리 배지는 아이콘 버튼 밖으로 삐져나가 헤더 정렬을 흔든다. 정확한 수보다
// "밀렸다"는 신호가 중요한 자리라 9에서 자른다(채팅 핀과 다른 축의 카운트다).
const BADGE_CAP = 9;

export function NotificationBell() {
	const { isAuthenticated } = useBambiAuth();
	// 운영자·구인자 셸에는 채팅 버튼·모바일 탭(=useUnreadMessageCount)이 없어 SSE를 아무도
	// 열지 않는다 — 벨이 직접 구독한다. 스트림은 리스너 refcount 싱글턴이라 구직자 셸에서
	// 동시 마운트돼도 EventSource가 하나 더 열리지는 않는다("중복 구독 금지"와 상충 없음).
	useBambiNotificationStream(isAuthenticated);
	const query = useQuery({
		...orpc.bambi.notifications.unreadCount.queryOptions(),
		enabled: isAuthenticated,
	});

	// 비로그인 셸에서는 눌러도 로그인 벽으로 튕기는 죽은 버튼이 된다 — 아예 감춘다.
	if (!isAuthenticated) {
		return null;
	}

	const unreadCount = query.data?.unreadCount ?? 0;
	const showBadge = unreadCount > 0;

	return (
		<span className="relative inline-flex">
			<Button
				aria-label={
					showBadge ? `알림, 읽지 않은 알림 ${unreadCount}개` : "알림"
				}
				className="bg-card"
				nativeButton={false}
				render={<Link href={NOTIFICATIONS_HREF as Route} />}
				size="icon-lg"
				variant="outline"
			>
				<BellIcon />
			</Button>
			{showBadge ? (
				<Badge className="absolute -top-2 -right-2 min-w-5 justify-center px-1 text-xs">
					{unreadCount > BADGE_CAP ? `${BADGE_CAP}+` : unreadCount}
				</Badge>
			) : null}
		</span>
	);
}
