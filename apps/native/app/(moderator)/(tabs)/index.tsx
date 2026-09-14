import {
	QUEUE_RISK_LABELS,
	type QueueRiskLevel,
	resolveQueueRiskLevel,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Chip, Surface, useThemeColor } from "heroui-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import {
	ErrorState,
	formatDateTime,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { SortTabs } from "@/src/components/moderation/sort-tabs";
import { queueListOptions } from "@/src/lib/moderation/queries";
import { formatRelativeTime } from "@/src/lib/support/support";

type RiskFilter = "all" | QueueRiskLevel;
type SortKey = "oldest" | "recent" | "risk";

const RISK_OPTIONS = [
	{ label: "전체", value: "all" },
	{ label: QUEUE_RISK_LABELS.mid, value: "mid" },
	{ label: QUEUE_RISK_LABELS.low, value: "low" },
] as const satisfies readonly { label: string; value: RiskFilter }[];

const SORT_OPTIONS = [
	{ label: "접수순", value: "oldest" },
	{ label: "최신순", value: "recent" },
	{ label: "감지 우선", value: "risk" },
] as const satisfies readonly { label: string; value: SortKey }[];

// 목록 행이 상세로 넘기는 것은 id뿐이다 — 상세는 같은 목록 캐시에서 항목을 다시 찾는다.
const queueDetailHref = (id: string): Href =>
	({
		params: { id },
		pathname: "/(moderator)/queue/[id]",
	}) as unknown as Href;

// listJobPosts 행에서 목록이 실제로 읽는 필드만 좁힌다(서버 selection이 넓어져도 흐른다).
interface QueueJob {
	createdAt: Date | string;
	detectedTerms: string[];
	id: string;
	organizationDisplayName: string;
	region: string;
	title: string;
}

interface QueueRow {
	job: QueueJob;
	risk: QueueRiskLevel;
}

// 필터·정렬은 모두 클라이언트에서 한다(목록은 최대 50건 한 번 조회).
function useQueueRows(
	jobs: readonly QueueJob[],
	risk: RiskFilter,
	sort: SortKey
): QueueRow[] {
	return useMemo(() => {
		const rows = jobs.map((job) => ({
			job,
			risk: resolveQueueRiskLevel(job.detectedTerms),
		}));
		const filtered =
			risk === "all" ? rows : rows.filter((r) => r.risk === risk);

		return [...filtered].sort((a, b) => {
			if (sort === "risk" && a.risk !== b.risk) {
				return a.risk === "mid" ? -1 : 1;
			}
			const diff =
				new Date(a.job.createdAt).getTime() -
				new Date(b.job.createdAt).getTime();

			return sort === "recent" ? -diff : diff;
		});
	}, [jobs, risk, sort]);
}

function QueueRowCard({ row }: { row: QueueRow }) {
	const { job } = row;
	const shownTerms = job.detectedTerms.slice(0, 3);
	const hiddenTermCount = job.detectedTerms.length - shownTerms.length;
	const mutedColor = useThemeColor("muted");

	return (
		<Pressable
			accessibilityLabel={`${job.organizationDisplayName} ${job.title}, ${QUEUE_RISK_LABELS[row.risk]}, ${job.detectedTerms.join(", ") || "감지된 문구 없음"}, ${formatDateTime(job.createdAt)} 접수`}
			accessibilityRole="button"
			accessible
			className="active:opacity-75"
			onPress={() => router.push(queueDetailHref(job.id))}
		>
			{/* 감지 여부 왼쪽 띠. 두께(border-l-4)는 항상 두고 색만 바꾼다 — overflow-hidden
			    Surface에서 테두리 두께를 런타임에 0↔4로 토글하면 Android가 자식을 잘라먹는다. */}
			<Surface
				className={`gap-2 rounded-lg border-l-4 p-4 ${row.risk === "mid" ? "border-warning" : "border-transparent"}`}
				importantForAccessibility="no-hide-descendants"
				variant="secondary"
			>
				<View className="flex-row items-center justify-between gap-2">
					<Text className="flex-1 text-muted text-xs" numberOfLines={1}>
						{job.organizationDisplayName} · {job.region}
					</Text>
					<Pill tone={row.risk === "mid" ? "warning" : "neutral"}>
						{QUEUE_RISK_LABELS[row.risk]}
					</Pill>
				</View>
				<Text className="font-bold text-base text-foreground" numberOfLines={2}>
					{job.title}
				</Text>
				{/* Chip은 내부가 Pressable이라 그냥 두면 카드 탭을 가로챈다 — pointerEvents로
				    터치를 통과시킨다(disabled와 달리 접근성 상태를 건드리지 않는다). */}
				{shownTerms.length > 0 ? (
					<View className="flex-row flex-wrap gap-1.5">
						{shownTerms.map((term) => (
							<Chip
								color="warning"
								key={term}
								pointerEvents="none"
								size="sm"
								variant="soft"
							>
								{term}
							</Chip>
						))}
						{hiddenTermCount > 0 ? (
							<Chip
								color="default"
								pointerEvents="none"
								size="sm"
								variant="soft"
							>
								{`+${hiddenTermCount}`}
							</Chip>
						) : null}
					</View>
				) : null}
				<View className="flex-row items-center gap-1">
					<Ionicons color={mutedColor} name="time-outline" size={12} />
					<Text className="flex-1 text-muted text-xs" numberOfLines={1}>
						{formatRelativeTime(job.createdAt)}
					</Text>
					<Ionicons color={mutedColor} name="chevron-forward" size={16} />
				</View>
			</Surface>
		</Pressable>
	);
}

export default function ModeratorQueueScreen() {
	const [risk, setRisk] = useState<RiskFilter>("all");
	const [sort, setSort] = useState<SortKey>("oldest");
	const queueQuery = useQuery(queueListOptions());
	const rows = useQueueRows(queueQuery.data ?? [], risk, sort);

	if (queueQuery.isLoading) {
		return <LoadingState label="검수 대기 공고를 불러오고 있습니다." />;
	}

	if (queueQuery.isError) {
		return <ErrorState onRetry={() => queueQuery.refetch()} />;
	}

	// 목록은 FlatList가 스스로 스크롤한다 — BambiScreen(ScrollView) 안에 넣으면 가상화가
	// 죽으므로 필터를 형제로 두고 아래에 붙인다(검색 화면과 같은 구성). 화면 제목은
	// 탭 셸 헤더(ModeratorHomeHeader)가 진다.
	return (
		<View className="flex-1 bg-background">
			<View className="px-4 py-3">
				{/* 35%: 항목 3개(각 48dp) + 시트 제목·핸들이 작은 화면에서도 잘리지 않는 최소 높이. */}
				<FieldSelect
					isLabelHidden
					label="감지 여부"
					onChange={(next) => setRisk(next as RiskFilter)}
					options={RISK_OPTIONS}
					placeholder="전체"
					snapPoints={["35%"]}
					value={risk}
				/>
			</View>
			<SortTabs onChange={setSort} options={SORT_OPTIONS} value={sort} />
			<FlatList
				contentContainerClassName="gap-3 p-4"
				data={rows}
				keyExtractor={(row) => row.job.id}
				ListEmptyComponent={
					<StateCard
						description={
							risk === "all"
								? "현재 검수 대기 중인 공고가 없습니다."
								: "이 필터에 해당하는 공고가 없습니다."
						}
						title="검수 대기 없음"
					/>
				}
				refreshControl={
					<RefreshControl
						onRefresh={() => queueQuery.refetch()}
						refreshing={queueQuery.isRefetching}
					/>
				}
				renderItem={({ item }) => <QueueRowCard row={item} />}
			/>
		</View>
	);
}
