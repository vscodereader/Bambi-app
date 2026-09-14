import {
	QUEUE_RISK_LABELS,
	type QueueRiskLevel,
	resolveQueueRiskLevel,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Surface } from "heroui-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import {
	ErrorState,
	formatDateTime,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import { queueListOptions } from "@/src/lib/moderation/queries";

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
	const terms =
		job.detectedTerms.length > 0
			? job.detectedTerms.slice(0, 3).join(", ")
			: "감지된 문구 없음";
	const receivedAt = formatDateTime(job.createdAt);

	return (
		<Pressable
			accessibilityLabel={`${job.organizationDisplayName} ${job.title}, ${QUEUE_RISK_LABELS[row.risk]}, ${terms}, ${receivedAt} 접수`}
			accessibilityRole="button"
			accessible
			className="active:opacity-75"
			onPress={() => router.push(queueDetailHref(job.id))}
		>
			<Surface
				className="gap-2 rounded-lg p-4"
				importantForAccessibility="no-hide-descendants"
				variant="secondary"
			>
				<Text className="text-muted text-xs">
					{job.organizationDisplayName}
				</Text>
				<Text className="font-bold text-base text-foreground">{job.title}</Text>
				<View className="flex-row flex-wrap gap-2">
					<Pill tone={row.risk === "mid" ? "warning" : "neutral"}>
						{QUEUE_RISK_LABELS[row.risk]}
					</Pill>
					<Pill>{job.region}</Pill>
				</View>
				<Text className="text-muted text-sm leading-5">{terms}</Text>
				<Text className="text-muted text-xs">
					{receivedAt} · #{job.id.slice(0, 8)}
				</Text>
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
			<FilterChips onChange={setRisk} options={RISK_OPTIONS} value={risk} />
			<FilterChips onChange={setSort} options={SORT_OPTIONS} value={sort} />
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
