"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";

import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import {
	getJobDisplayStatus,
	isBannerExposureType,
} from "@/lib/bambi/exposure";
import { orpc } from "@/utils/orpc";

interface MetricCardProps {
	label: string;
	value: string;
}

const formatNumber = (value: number): string => value.toLocaleString("ko-KR");

const placementBadgeClassNames = {
	special: "border-rose-200 bg-rose-50 text-rose-700",
	urgent: "border-amber-200 bg-amber-50 text-amber-700",
	recommended: "border-sky-200 bg-sky-50 text-sky-700",
	organic: "border-slate-200 bg-slate-100 text-slate-700",
	premiumBanner: "border-violet-200 bg-violet-50 text-violet-700",
	leftBanner: "border-indigo-200 bg-indigo-50 text-indigo-700",
	rightBanner: "border-teal-200 bg-teal-50 text-teal-700",
} as const;

type PlacementMetricKey = keyof typeof placementBadgeClassNames;

interface PlacementMetric {
	key: PlacementMetricKey;
	label: string;
	value: number;
}

function PlacementMetricBadges({ metrics }: { metrics: PlacementMetric[] }) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{metrics.map((metric) => (
				<Badge
					className={placementBadgeClassNames[metric.key]}
					key={metric.key}
					variant="outline"
				>
					{metric.label} {formatNumber(metric.value)}
				</Badge>
			))}
		</div>
	);
}

// 공고가 구매한 광고 상품에 해당하는 게재 섹션. 배너 3종은 하나의 프리미엄 상품이
// 상단·좌측·우측 슬롯을 순환하므로 세 슬롯을 함께 켠다. 일반(organic)은 상품과
// 무관하게 모든 공고가 노출되므로 셀 렌더에서 항상 포함한다.
const productSectionsFor = (exposureType: string): ReadonlySet<string> => {
	if (isBannerExposureType(exposureType)) {
		return new Set(["premiumBanner", "leftBanner", "rightBanner"]);
	}

	switch (exposureType) {
		case "special":
			return new Set(["special"]);
		case "urgent":
			return new Set(["urgent"]);
		case "recommended":
			return new Set(["recommended"]);
		default:
			return new Set();
	}
};

const formatRate = (numerator: number, denominator: number): string => {
	if (denominator === 0) {
		return "0.0%";
	}

	return `${((numerator / denominator) * 100).toFixed(1)}%`;
};

function MetricCard({ label, value }: MetricCardProps) {
	return (
		<Card size="sm">
			<CardContent className="flex flex-col gap-2">
				<dt className="text-muted-foreground text-sm">{label}</dt>
				<dd className="font-semibold text-2xl">{value}</dd>
			</CardContent>
		</Card>
	);
}

export default function EmployerAnalyticsPage() {
	const { accountStatus, isPending } = useBambiAuth();
	const summaryQuery = useQuery(orpc.bambi.analytics.summary.queryOptions());
	const summaries = summaryQuery.data ?? [];
	const getPlacementMetrics = (
		summary: (typeof summaries)[number]
	): PlacementMetric[] => {
		const productSections = productSectionsFor(summary.exposureType);

		return [
			{
				key: "special",
				label: "스페셜",
				value: summary.sectionMetrics.specialImpressions,
			},
			{
				key: "urgent",
				label: "급구",
				value: summary.sectionMetrics.urgentImpressions,
			},
			{
				key: "recommended",
				label: "추천",
				value: summary.sectionMetrics.recommendedImpressions,
			},
			{
				key: "organic",
				label: "일반",
				value: summary.sectionMetrics.organicImpressions,
			},
			{
				key: "premiumBanner",
				label: "프리미엄 배너·상단",
				value: summary.sectionMetrics.premiumBannerImpressions,
			},
			{
				key: "leftBanner",
				label: "프리미엄 배너·좌측",
				value: summary.sectionMetrics.leftBannerImpressions,
			},
			{
				key: "rightBanner",
				label: "프리미엄 배너·우측",
				value: summary.sectionMetrics.rightBannerImpressions,
			},
		].filter(
			(item): item is PlacementMetric =>
				item.key === "organic" ||
				productSections.has(item.key) ||
				item.value > 0
		);
	};
	const totals = summaries.reduce(
		(accumulator, item) => ({
			autoBoostFires: accumulator.autoBoostFires + item.metrics.autoBoostFires,
			chatStarts: accumulator.chatStarts + item.metrics.chatStarts,
			detailViews: accumulator.detailViews + item.metrics.detailViews,
			impressions: accumulator.impressions + item.metrics.impressions,
			leftBannerImpressions:
				accumulator.leftBannerImpressions +
				item.sectionMetrics.leftBannerImpressions,
			organicImpressions:
				accumulator.organicImpressions + item.sectionMetrics.organicImpressions,
			premiumBannerImpressions:
				accumulator.premiumBannerImpressions +
				item.sectionMetrics.premiumBannerImpressions,
			recommendedImpressions:
				accumulator.recommendedImpressions +
				item.sectionMetrics.recommendedImpressions,
			rightBannerImpressions:
				accumulator.rightBannerImpressions +
				item.sectionMetrics.rightBannerImpressions,
			specialImpressions:
				accumulator.specialImpressions + item.sectionMetrics.specialImpressions,
			urgentImpressions:
				accumulator.urgentImpressions + item.sectionMetrics.urgentImpressions,
		}),
		{
			autoBoostFires: 0,
			chatStarts: 0,
			detailViews: 0,
			impressions: 0,
			leftBannerImpressions: 0,
			organicImpressions: 0,
			premiumBannerImpressions: 0,
			recommendedImpressions: 0,
			rightBannerImpressions: 0,
			specialImpressions: 0,
			urgentImpressions: 0,
		}
	);

	// 프리미엄 배너는 하나의 상품이 상단·좌측·우측 세 슬롯에 노출된 위치별 카운트다.
	// (상품이 3개가 아니라 슬롯 위치가 3개) → 합계 + 코럴 농도 3단계의 비중 막대로 묶어 보여준다.
	const premiumBannerTotal =
		totals.premiumBannerImpressions +
		totals.leftBannerImpressions +
		totals.rightBannerImpressions;
	const premiumSlots = [
		{
			dotClassName: "bg-coral-500",
			fillClassName: "fill-coral-500",
			label: "상단",
			value: totals.premiumBannerImpressions,
		},
		{
			dotClassName: "bg-coral-300",
			fillClassName: "fill-coral-300",
			label: "좌측",
			value: totals.leftBannerImpressions,
		},
		{
			dotClassName: "bg-coral-200",
			fillClassName: "fill-coral-200",
			label: "우측",
			value: totals.rightBannerImpressions,
		},
	];
	let segmentStart = 0;
	const premiumSegments = premiumSlots
		.filter((slot) => slot.value > 0)
		.map((slot) => {
			const width = (slot.value / premiumBannerTotal) * 100;
			const segment = { ...slot, width, x: segmentStart };
			segmentStart += width;
			return segment;
		});

	if (summaryQuery.isLoading) {
		return <Loader />;
	}

	if (summaryQuery.isError) {
		return (
			<PageShell
				description="공고 노출과 지원 전환 지표를 불러오지 못했습니다."
				title="성과 분석"
			>
				<EmptyState
					action={
						<Button onClick={() => summaryQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 조직 권한을 확인한 뒤 다시 시도해 주세요."
					title="성과 지표를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	return (
		<PageShell
			description="공고별 노출, 상세 조회, 채팅 시작 흐름을 확인합니다."
			title="성과 분석"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="m-0 text-muted-foreground text-sm">
					공고 {summaries.length}개 · 상세 전환{" "}
					{formatRate(totals.detailViews, totals.impressions)} · 채팅 전환{" "}
					{formatRate(totals.chatStarts, totals.detailViews)}
				</p>
				<div className="flex flex-wrap gap-2">
					<Link
						className={buttonVariants({ variant: "outline" })}
						href={"/employer/promotions" as Route}
					>
						광고 관리
					</Link>
					<Link
						className={buttonVariants({ variant: "outline" })}
						href="/employer"
					>
						공고 관리
					</Link>
				</div>
			</div>

			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="노출" value={formatNumber(totals.impressions)} />
				<MetricCard
					label="상세 조회"
					value={formatNumber(totals.detailViews)}
				/>
				<MetricCard label="채팅 시작" value={formatNumber(totals.chatStarts)} />
				<MetricCard
					label="자동 재노출(7일)"
					value={formatNumber(totals.autoBoostFires)}
				/>
			</dl>

			<section
				aria-labelledby="placement-metrics"
				className="flex flex-col gap-3"
			>
				<h2 className="font-medium text-base" id="placement-metrics">
					노출 구분
				</h2>
				<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<MetricCard
						label="스페셜"
						value={formatNumber(totals.specialImpressions)}
					/>
					<MetricCard
						label="급구"
						value={formatNumber(totals.urgentImpressions)}
					/>
					<MetricCard
						label="추천"
						value={formatNumber(totals.recommendedImpressions)}
					/>
					<MetricCard
						label="일반"
						value={formatNumber(totals.organicImpressions)}
					/>
					<Card className="sm:col-span-2 lg:col-span-4" size="sm">
						<CardContent className="flex flex-col gap-4">
							<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
								<div className="flex flex-col gap-2">
									<dt className="text-muted-foreground text-sm">
										프리미엄 배너
									</dt>
									<dd className="font-semibold text-2xl">
										{formatNumber(premiumBannerTotal)}
									</dd>
								</div>
								<dl className="flex flex-wrap gap-x-5 gap-y-2">
									{premiumSlots.map((slot) => (
										<div className="flex items-center gap-2" key={slot.label}>
											<span
												aria-hidden
												className={cn("size-2 rounded-full", slot.dotClassName)}
											/>
											<dt className="text-muted-foreground text-xs">
												{slot.label}
											</dt>
											<dd className="font-medium text-sm">
												{formatNumber(slot.value)}
											</dd>
										</div>
									))}
								</dl>
							</div>
							{premiumBannerTotal > 0 ? (
								// 비율 막대: 인라인 style 금지 규칙 때문에 동적 비중은 SVG rect 속성으로 그린다.
								<svg
									aria-hidden="true"
									className="h-2 w-full overflow-hidden rounded-full"
									preserveAspectRatio="none"
									role="presentation"
									viewBox="0 0 100 4"
								>
									{premiumSegments.map((segment) => (
										<rect
											className={segment.fillClassName}
											height="4"
											key={segment.label}
											width={segment.width}
											x={segment.x}
											y="0"
										/>
									))}
								</svg>
							) : (
								<div aria-hidden className="h-2 w-full rounded-full bg-muted" />
							)}
							<p className="m-0 text-muted-foreground text-xs">
								프리미엄 광고 하나가 상단·좌측·우측 슬롯을 순환하며 노출된
								위치별 집계예요.
							</p>
						</CardContent>
					</Card>
				</dl>
			</section>

			{summaries.length === 0 ? (
				<EmptyState
					action={
						isPending || accountStatus === "suspended" ? (
							<Button disabled type="button">
								새 공고 등록
							</Button>
						) : (
							<Link className={buttonVariants()} href="/employer/new">
								새 공고 등록
							</Link>
						)
					}
					description="공고를 등록하고 구직자가 목록이나 상세 화면을 보면 지표가 쌓입니다."
					title="분석할 공고가 없습니다"
				/>
			) : (
				<>
					<div className="flex flex-col gap-3 md:hidden">
						{summaries.map((summary) => {
							const displayStatus = getJobDisplayStatus(summary);

							return (
								<Card key={summary.jobPostId} size="sm">
									<CardContent className="flex flex-col gap-4">
										<div className="flex items-start justify-between gap-3">
											<p className="m-0 min-w-0 flex-1 truncate font-medium">
												{summary.title}
											</p>
											<StatusBadge tone={displayStatus.tone}>
												{displayStatus.label}
											</StatusBadge>
										</div>
										<dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
											<div>
												<dt className="text-muted-foreground">노출</dt>
												<dd className="mt-1 font-medium">
													{formatNumber(summary.metrics.impressions)}
												</dd>
											</div>
											<div>
												<dt className="text-muted-foreground">상세</dt>
												<dd className="mt-1 font-medium">
													{formatNumber(summary.metrics.detailViews)}
												</dd>
											</div>
											<div>
												<dt className="text-muted-foreground">채팅</dt>
												<dd className="mt-1 font-medium">
													{formatNumber(summary.metrics.chatStarts)}
												</dd>
											</div>
											<div>
												<dt className="text-muted-foreground">상세 전환</dt>
												<dd className="mt-1 font-medium">
													{formatRate(
														summary.metrics.detailViews,
														summary.metrics.impressions
													)}
												</dd>
											</div>
											<div className="col-span-2">
												<dt className="text-muted-foreground">
													자동 재노출(7일)
												</dt>
												<dd className="mt-1 font-medium">
													{formatNumber(summary.metrics.autoBoostFires)}회
												</dd>
											</div>
											<div className="col-span-2">
												<dt className="text-muted-foreground">게재 구분</dt>
												<dd className="mt-1">
													<PlacementMetricBadges
														metrics={getPlacementMetrics(summary)}
													/>
												</dd>
											</div>
										</dl>
									</CardContent>
								</Card>
							);
						})}
					</div>
					<Card className="hidden md:block">
						<CardContent className="overflow-x-auto p-0">
							<table className="w-full min-w-[820px] border-collapse text-left text-sm">
								<thead className="border-b bg-muted/40">
									<tr>
										<th className="px-4 py-3 font-medium" scope="col">
											공고
										</th>
										<th className="px-4 py-3 font-medium" scope="col">
											노출
										</th>
										<th className="px-4 py-3 font-medium" scope="col">
											상세
										</th>
										<th className="px-4 py-3 font-medium" scope="col">
											채팅
										</th>
										<th className="px-4 py-3 font-medium" scope="col">
											상세 전환
										</th>
										<th className="px-4 py-3 font-medium" scope="col">
											자동 재노출(7일)
										</th>
										<th className="px-4 py-3 font-medium" scope="col">
											게재 구분
										</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									{summaries.map((summary) => (
										<tr key={summary.jobPostId}>
											<th className="px-4 py-3 font-medium" scope="row">
												<div className="max-w-[280px]">
													<p className="m-0 break-words">{summary.title}</p>
													<StatusBadge tone={getJobDisplayStatus(summary).tone}>
														{getJobDisplayStatus(summary).label}
													</StatusBadge>
												</div>
											</th>
											<td className="px-4 py-3">
												{formatNumber(summary.metrics.impressions)}
											</td>
											<td className="px-4 py-3">
												{formatNumber(summary.metrics.detailViews)}
											</td>
											<td className="px-4 py-3">
												{formatNumber(summary.metrics.chatStarts)}
											</td>
											<td className="px-4 py-3">
												{formatRate(
													summary.metrics.detailViews,
													summary.metrics.impressions
												)}
											</td>
											<td className="px-4 py-3">
												{formatNumber(summary.metrics.autoBoostFires)}회
											</td>
											<td className="px-4 py-3">
												<PlacementMetricBadges
													metrics={getPlacementMetrics(summary)}
												/>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</CardContent>
					</Card>
				</>
			)}
		</PageShell>
	);
}
