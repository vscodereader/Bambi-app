"use client";

// 포인트몰 헤더의 보유 포인트 칩. 회원에게만 보인다(비로그인·게스트는 잔액 개념이 없다).
// 잔액 표시는 이 칩으로 일원화한다 — 화면 본문에 잔액을 또 그리면 구매 후 두 곳의
// 갱신 타이밍이 어긋나 서로 다른 숫자가 보인다.

import { Badge } from "@bambi-app/ui/components/badge";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { orpc } from "@/utils/orpc";

export function PointBalanceChip() {
	const { isAuthenticated, role } = useBambiAuth();
	const canUsePoints = role === "job_seeker" || role === "employer";
	const balanceQuery = useQuery({
		...orpc.bambi.pointShop.getMyBalance.queryOptions(),
		enabled: isAuthenticated && canUsePoints,
	});

	// 조회 실패도 칩을 숨긴다 — 헤더에 영영 안 끝나는 자리표시를 남기지 않는다.
	if (!(isAuthenticated && canUsePoints) || balanceQuery.isError) {
		return null;
	}
	if (!balanceQuery.data) {
		return <Skeleton className="h-7 w-20 rounded-full" />;
	}

	return (
		<Badge className="h-7 px-3 font-extrabold text-sm" variant="secondary">
			<span className="sr-only">보유 포인트</span>
			{`${balanceQuery.data.pointBalance.toLocaleString("ko-KR")}P`}
		</Badge>
	);
}
