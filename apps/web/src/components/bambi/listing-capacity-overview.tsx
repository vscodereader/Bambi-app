"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
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

type ListingQueueItem = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listListingQueues"]>
>["special"][number];

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

// 섹션별 FIFO 대기열 목록. 비어 있으면(대기 없음) 아무것도 그리지 않아 정원 통계만 남긴다.
function ListingQueueList({
	items,
}: {
	items: ListingQueueItem[] | undefined;
}) {
	if (!items || items.length === 0) {
		return null;
	}

	return (
		<ul className="flex flex-col gap-0.5">
			{items.map((item) => (
				<li className="text-muted-foreground text-xs" key={item.id}>
					{`#${item.position} ${item.title} · ${item.organizationDisplayName}`}
				</li>
			))}
		</ul>
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
	// 대기열 목록은 정원 통계와 같은 주기로 갱신한다(만료 시 순번이 당겨진다).
	const queuesQuery = useQuery({
		...orpc.bambi.moderation.listListingQueues.queryOptions(),
		refetchInterval: REFETCH_INTERVAL,
	});

	const sections = [
		{ label: "프리미엄", queue: undefined, stat: premiumQuery.data },
		{
			label: "스페셜",
			queue: queuesQuery.data?.special,
			stat: listingQuery.data?.special,
		},
		{
			label: "추천",
			queue: queuesQuery.data?.recommended,
			stat: listingQuery.data?.recommended,
		},
	];

	// 대기열 조회는 보조 정보라 그리드 표시를 막지 않는다(로딩·실패 시 목록만 비운다).
	const isPending = premiumQuery.isPending || listingQuery.isPending;
	const isError = premiumQuery.isError || listingQuery.isError;

	return (
		<Card>
			<CardHeader>
				<CardTitle>광고 정원·대기열 현황</CardTitle>
				<CardDescription>
					결제완료(승인) 시 정원을 소비합니다. 만석이면 결제완료 시 대기열로
					접수되고, 자리가 나면 순서대로 자동 노출됩니다.
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
							<div className="flex flex-col gap-2" key={section.label}>
								<CapacitySectionStat
									label={section.label}
									stat={section.stat}
								/>
								<ListingQueueList items={section.queue} />
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
