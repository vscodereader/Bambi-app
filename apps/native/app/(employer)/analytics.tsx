import { useQuery } from "@tanstack/react-query";
import { type Href, Link } from "expo-router";
import { Button, cn, Surface } from "heroui-native";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import {
	type AnalyticsSummary,
	type AnalyticsTotals,
	formatCount,
	formatRate,
	getPlacementMetrics,
	getPremiumBarSegments,
	getPremiumSlots,
	PLACEMENT_LABELS,
	type PlacementKey,
	type PremiumSlotShare,
	sumAnalyticsTotals,
	sumPremiumSlots,
} from "@/src/lib/employer/ad-analytics";
import { getJobDisplayStatus } from "@/src/lib/employer/job-status";
import { orpc } from "@/src/lib/orpc";

const NEW_HREF = "/(employer)/new" as Href;

// 게재 구분 배지 색. 배너 3종은 같은 프리미엄 상품의 슬롯이라 한 톤으로 묶는다.
const PLACEMENT_TONES: Record<
	PlacementKey,
	ComponentProps<typeof Pill>["tone"]
> = {
	leftBanner: "warning",
	organic: "neutral",
	premiumBanner: "warning",
	recommended: "success",
	rightBanner: "warning",
	special: "accent",
	urgent: "danger",
};

// 슬롯 구분은 색을 새로 짓지 않고 코럴(accent) 한 색의 농도 3단계로만 낸다.
const PREMIUM_SLOT_FILLS: Record<PremiumSlotShare["key"], string> = {
	leftBanner: "bg-accent/60",
	premiumBanner: "bg-accent",
	rightBanner: "bg-accent/30",
};

function MetricTile({ label, value }: { label: string; value: string }) {
	return (
		<View className="flex-1 gap-1">
			<Text className="text-muted text-xs">{label}</Text>
			<Text className="font-extrabold text-foreground text-lg" selectable>
				{value}
			</Text>
		</View>
	);
}

// 360dp에서 타일 넷을 한 줄에 두면 숫자가 접히므로 2×2로 나눈다.
function TotalsCard({ totals }: { totals: AnalyticsTotals }) {
	return (
		<Surface className="gap-4 rounded-lg p-4" variant="secondary">
			<View className="flex-row gap-3">
				<MetricTile label="노출" value={formatCount(totals.impressions)} />
				<MetricTile label="상세 조회" value={formatCount(totals.detailViews)} />
			</View>
			<View className="flex-row gap-3">
				<MetricTile label="채팅 시작" value={formatCount(totals.chatStarts)} />
				<MetricTile
					label="자동 재노출(7일)"
					value={formatCount(totals.autoBoostFires)}
				/>
			</View>
		</Surface>
	);
}

function PremiumBannerCard({ totals }: { totals: AnalyticsTotals }) {
	const slots = getPremiumSlots(totals);
	const premiumTotal = sumPremiumSlots(slots);
	const segments = getPremiumBarSegments(slots);

	return (
		<Surface className="gap-4 rounded-lg p-4" variant="secondary">
			<View className="gap-1">
				<Text className="text-muted text-xs">
					{PLACEMENT_LABELS.premiumBanner}
				</Text>
				<Text className="font-extrabold text-foreground text-lg" selectable>
					{formatCount(premiumTotal)}
				</Text>
			</View>
			<View className="flex-row flex-wrap gap-x-4 gap-y-2">
				{slots.map((slot) => (
					<View className="flex-row items-center gap-2" key={slot.key}>
						<View
							className={cn(
								"size-2 rounded-full",
								PREMIUM_SLOT_FILLS[slot.key]
							)}
						/>
						<Text className="text-muted text-xs">{slot.label}</Text>
						<Text className="font-semibold text-foreground text-sm">
							{formatCount(slot.value)}
						</Text>
					</View>
				))}
			</View>
			{/* 비중 막대: RN에는 퍼센트 폭이 없어 세그먼트 flex 값에 노출 수를 그대로 실어
			    비율을 만든다(웹은 같은 이유로 SVG rect를 쓴다). 합이 0이면 빈 트랙만 남는다. */}
			<View className="h-2 flex-row overflow-hidden rounded-full bg-muted/20">
				{segments.map((segment) => (
					<View
						className={PREMIUM_SLOT_FILLS[segment.key]}
						key={segment.key}
						style={{ flex: segment.value }}
					/>
				))}
			</View>
			<Text className="text-muted text-xs leading-5">
				프리미엄 광고 하나가 상단·좌측·우측 슬롯을 순환하며 노출된 위치별
				집계예요.
			</Text>
		</Surface>
	);
}

function PlacementSection({ totals }: { totals: AnalyticsTotals }) {
	return (
		<View className="gap-3">
			<Text className="font-bold text-base text-foreground">노출 구분</Text>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<View className="flex-row gap-3">
					<MetricTile
						label={PLACEMENT_LABELS.special}
						value={formatCount(totals.specialImpressions)}
					/>
					<MetricTile
						label={PLACEMENT_LABELS.urgent}
						value={formatCount(totals.urgentImpressions)}
					/>
				</View>
				<View className="flex-row gap-3">
					<MetricTile
						label={PLACEMENT_LABELS.recommended}
						value={formatCount(totals.recommendedImpressions)}
					/>
					<MetricTile
						label={PLACEMENT_LABELS.organic}
						value={formatCount(totals.organicImpressions)}
					/>
				</View>
			</Surface>
			<PremiumBannerCard totals={totals} />
		</View>
	);
}

function JobAnalyticsCard({ summary }: { summary: AnalyticsSummary }) {
	const display = getJobDisplayStatus(summary);

	return (
		<Surface className="gap-4 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-start gap-2">
				{/* min-w-0이 없으면 긴 제목이 상태 배지를 카드 밖으로 밀어낸다. */}
				<Text
					className="min-w-0 flex-1 font-bold text-base text-foreground"
					selectable
				>
					{summary.title}
				</Text>
				<Pill tone={display.tone}>{display.label}</Pill>
			</View>
			<View className="gap-3">
				<View className="flex-row gap-3">
					<MetricTile
						label="노출"
						value={formatCount(summary.metrics.impressions)}
					/>
					<MetricTile
						label="상세"
						value={formatCount(summary.metrics.detailViews)}
					/>
				</View>
				<View className="flex-row gap-3">
					<MetricTile
						label="채팅"
						value={formatCount(summary.metrics.chatStarts)}
					/>
					<MetricTile
						label="상세 전환"
						value={formatRate(
							summary.metrics.detailViews,
							summary.metrics.impressions
						)}
					/>
				</View>
				<MetricTile
					label="자동 재노출(7일)"
					value={`${formatCount(summary.metrics.autoBoostFires)}회`}
				/>
			</View>
			<View className="gap-2">
				<Text className="text-muted text-xs">게재 구분</Text>
				<View className="flex-row flex-wrap gap-2">
					{getPlacementMetrics(summary).map((placement) => (
						<Pill key={placement.key} tone={PLACEMENT_TONES[placement.key]}>
							{`${placement.label} ${formatCount(placement.value)}`}
						</Pill>
					))}
				</View>
			</View>
		</Surface>
	);
}

export default function EmployerAnalyticsScreen() {
	const summaryQuery = useQuery(orpc.bambi.analytics.summary.queryOptions());

	if (summaryQuery.isLoading) {
		return <LoadingState label="성과 지표를 불러오고 있습니다." />;
	}

	if (summaryQuery.isError) {
		return (
			<ErrorState
				onRetry={() => summaryQuery.refetch()}
				title="성과 지표를 불러올 수 없습니다"
			/>
		);
	}

	const summaries = summaryQuery.data ?? [];

	// 공고가 하나도 없으면 총계는 전부 0이라 타일을 먼저 쌓아 봐야 빈 화면만 길어진다.
	if (summaries.length === 0) {
		return (
			<BambiScreen>
				<StateCard
					action={
						<Link asChild href={NEW_HREF}>
							<Button variant="secondary">
								<Button.Label>공고 등록</Button.Label>
							</Button>
						</Link>
					}
					description="공고를 등록하고 구직자가 목록이나 상세 화면을 보면 지표가 쌓입니다."
					title="분석할 공고가 없어요"
				/>
			</BambiScreen>
		);
	}

	const totals = sumAnalyticsTotals(summaries);

	return (
		<BambiScreen>
			<Text className="text-muted text-sm leading-5" selectable>
				{`공고 ${summaries.length}개 · 상세 전환 ${formatRate(totals.detailViews, totals.impressions)} · 채팅 전환 ${formatRate(totals.chatStarts, totals.detailViews)}`}
			</Text>
			<TotalsCard totals={totals} />
			<PlacementSection totals={totals} />
			<View className="gap-3">
				<Text className="font-bold text-base text-foreground">공고별 성과</Text>
				{summaries.map((summary) => (
					<JobAnalyticsCard key={summary.jobPostId} summary={summary} />
				))}
			</View>
		</BambiScreen>
	);
}
