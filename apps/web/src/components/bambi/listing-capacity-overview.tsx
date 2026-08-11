"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

// 결제완료(승인) 시 정원을 1 소비한다. 만료로 자리가 자동으로 늘 수 있어 30초마다 갱신한다.
const REFETCH_INTERVAL = 30_000;

interface CapacityStat {
	activeCount: number;
	capacity: number;
	pendingCount: number;
	remaining: number;
}

// stat은 로딩 중 undefined일 수 있다(양쪽 쿼리 isPending 중엔 그리드 대신 Skeleton을 그리므로
// 실제로는 값이 있지만, 타입 안전을 위해 방어한다).
function CapacitySectionStat({
	label,
	stat,
}: {
	label: string;
	stat: CapacityStat | undefined;
}) {
	if (!stat) {
		return null;
	}

	const isFull = stat.remaining === 0;

	return (
		<div className="flex flex-col gap-1">
			<span className="font-medium">{label}</span>
			<Badge variant={isFull ? "destructive" : "secondary"}>
				{`사용 ${stat.activeCount}/${stat.capacity}`}
			</Badge>
			<span className="text-muted-foreground text-sm">
				{isFull
					? `만석 · 대기 ${stat.pendingCount}건`
					: `남은 자리 ${stat.remaining} · 대기 ${stat.pendingCount}건`}
			</span>
		</div>
	);
}

export function ListingCapacityOverview() {
	const premiumQuery = useQuery({
		...orpc.bambi.adProducts.premiumCapacity.queryOptions(),
		refetchInterval: REFETCH_INTERVAL,
	});
	const listingQuery = useQuery({
		...orpc.bambi.adProducts.listingCapacity.queryOptions(),
		refetchInterval: REFETCH_INTERVAL,
	});

	const sections = [
		{ label: "프리미엄", stat: premiumQuery.data },
		{ label: "스페셜", stat: listingQuery.data?.special },
		{ label: "추천", stat: listingQuery.data?.recommended },
	];

	const isPending = premiumQuery.isPending || listingQuery.isPending;
	const isError = premiumQuery.isError || listingQuery.isError;

	return (
		<Card>
			<CardHeader>
				<CardTitle>광고 정원·대기열 현황</CardTitle>
				<CardDescription>
					결제완료(승인) 시 정원을 소비합니다. 만석이면 승인이 자리가 빌 때까지
					실패하고, 신청 건은 대기열로 접수됩니다.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isError ? (
					<span className="text-muted-foreground text-sm">
						정원 정보를 불러오지 못했어요.
					</span>
				) : null}
				{!isError && isPending ? <Skeleton className="h-24 w-full" /> : null}
				{isError || isPending ? null : (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						{sections.map((section) => (
							<CapacitySectionStat
								key={section.label}
								label={section.label}
								stat={section.stat}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
