"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@bambi-app/ui/components/popover";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";
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

// 정원 통계 본문(라벨·사용 배지·만석/대기 텍스트). 정적 블록과 Popover 트리거 버튼에서 공유한다.
// interactive면 라벨 옆에 클릭 가능함을 알리는 chevron 어포던스를 붙인다.
function CapacityStatBody({
	interactive = false,
	label,
	stat,
}: {
	interactive?: boolean;
	label: string;
	stat: CapacityStat;
}) {
	const isFull = stat.remaining === 0;

	return (
		<>
			<span className="flex items-center gap-1 font-medium text-sm">
				{label}
				{interactive ? (
					<ChevronDownIcon className="text-muted-foreground" />
				) : null}
			</span>
			<Badge variant={isFull ? "destructive" : "secondary"}>
				{`사용 ${stat.activeCount}/${stat.capacity}`}
			</Badge>
			<span className="text-muted-foreground text-sm">
				{isFull
					? `만석 · 대기 ${stat.pendingCount}건`
					: `남은 자리 ${stat.remaining} · 대기 ${stat.pendingCount}건`}
			</span>
		</>
	);
}

// 대기열이 있는 섹션(스페셜·추천)은 통계를 Popover 트리거로, 없는 섹션(프리미엄)은 정적 블록으로 그린다.
// stat은 로딩 중 undefined일 수 있다(그땐 Skeleton을 그리지만 타입 안전을 위해 방어한다).
function CapacitySection({
	label,
	queue,
	stat,
}: {
	label: string;
	queue: ListingQueueItem[] | undefined;
	stat: CapacityStat | undefined;
}) {
	if (!stat) {
		return null;
	}

	if (!queue) {
		return (
			<div className="flex flex-col gap-1">
				<CapacityStatBody label={label} stat={stat} />
			</div>
		);
	}

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						className="h-auto w-full flex-col items-start gap-1 px-2 py-1.5 text-left font-normal"
						type="button"
						variant="ghost"
					>
						<CapacityStatBody interactive label={label} stat={stat} />
					</Button>
				}
			/>
			<PopoverContent align="start">
				<PopoverTitle>{`${label} 대기열`}</PopoverTitle>
				<ListingQueueList items={queue} />
			</PopoverContent>
		</Popover>
	);
}

// 섹션별 FIFO 대기열 목록. 수십 건까지 늘 수 있어 목록 영역만 스크롤시킨다.
function ListingQueueList({
	items,
}: {
	items: ListingQueueItem[] | undefined;
}) {
	if (!items || items.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">대기 중인 공고가 없어요.</p>
		);
	}

	return (
		<ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
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
							<CapacitySection
								key={section.label}
								label={section.label}
								queue={section.queue}
								stat={section.stat}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
