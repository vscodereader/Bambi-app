import {
	getReportSeverity,
	OPEN_REPORT_STATUSES,
	REPORT_SEVERITY_LABELS,
	reportReasonLabel,
	reportStatusLabel,
	targetTypeLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Surface } from "heroui-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import {
	BambiHeader,
	ErrorState,
	formatDateTime,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { reportListOptions } from "@/src/lib/moderation/queries";
import {
	type ModerationReport,
	REPORT_SEVERITY_TONES,
	resolveReportTargetParty,
} from "@/src/lib/moderation/report-target";

type Bucket = "closed" | "open";

// 접수·검토 중이 "열림", 조치 완료·기각이 "종료"다(공유 모듈 OPEN_REPORT_STATUSES).
const BUCKET_OPTIONS = [
	{ label: "열림", value: "open" },
	{ label: "종료", value: "closed" },
] as const satisfies readonly { label: string; value: Bucket }[];

// 목록 행이 상세로 넘기는 것은 id뿐이다 — 상세는 같은 목록 캐시에서 항목을 다시 찾는다.
const reportDetailHref = (id: string): Href =>
	({
		params: { id },
		pathname: "/(moderator)/reports/[id]",
	}) as unknown as Href;

function ReportRowCard({ report }: { report: ModerationReport }) {
	const severity = getReportSeverity(report.reason, report.status);
	const party = resolveReportTargetParty(report);
	const reporterName =
		report.reporter?.displayName || report.reporter?.email || "알 수 없음";
	const reasonLabel = reportReasonLabel(report.reason);

	return (
		<Pressable
			accessibilityLabel={`${reasonLabel} 신고, 심각도 ${REPORT_SEVERITY_LABELS[severity]}, 대상 ${party.name}, ${reportStatusLabel(report.status)}`}
			accessibilityRole="button"
			accessible
			className="active:opacity-75"
			onPress={() => router.push(reportDetailHref(report.id))}
		>
			<Surface
				className="gap-2 rounded-lg p-4"
				importantForAccessibility="no-hide-descendants"
				variant="secondary"
			>
				<View className="flex-row flex-wrap gap-2">
					<Pill tone={REPORT_SEVERITY_TONES[severity]}>
						{REPORT_SEVERITY_LABELS[severity]}
					</Pill>
					<Pill>{targetTypeLabel(report.targetType)}</Pill>
					<Pill tone="neutral">{reportStatusLabel(report.status)}</Pill>
				</View>
				<Text className="font-bold text-base text-foreground">
					{reasonLabel}
				</Text>
				<Text className="text-muted text-sm" numberOfLines={1}>
					{party.role} {party.name} · 신고자 {reporterName}
				</Text>
				{report.details ? (
					<Text className="text-foreground text-sm leading-5" numberOfLines={1}>
						{report.details}
					</Text>
				) : null}
				<Text className="text-muted text-xs">
					{formatDateTime(report.createdAt)}
				</Text>
			</Surface>
		</Pressable>
	);
}

export default function ModeratorReportsScreen() {
	const [bucket, setBucket] = useState<Bucket>("open");
	const reportsQuery = useQuery(reportListOptions());
	// 서버가 접수 시각 내림차순으로 주므로(listReports orderBy) 다시 정렬하지 않는다.
	const reports = useMemo(
		() =>
			(reportsQuery.data ?? []).filter(
				(report) =>
					OPEN_REPORT_STATUSES.has(report.status) === (bucket === "open")
			),
		[reportsQuery.data, bucket]
	);

	if (reportsQuery.isLoading) {
		return <LoadingState label="신고 목록을 불러오고 있습니다." />;
	}

	if (reportsQuery.isError) {
		return <ErrorState onRetry={() => reportsQuery.refetch()} />;
	}

	return (
		<View className="flex-1 bg-background">
			<View className="gap-3 px-4">
				<BambiHeader
					description="접수된 신고를 검토하고 기각·조치·제재를 처리합니다."
					title="신고 관리"
				/>
				{/* 30%: 항목 2개(각 48dp) + 시트 제목·핸들이 작은 화면에서도 잘리지 않는 최소 높이. */}
				<FieldSelect
					isLabelHidden
					label="처리 상태"
					onChange={(next) => setBucket(next as Bucket)}
					options={BUCKET_OPTIONS}
					placeholder="열림"
					snapPoints={["30%"]}
					value={bucket}
				/>
			</View>
			<FlatList
				contentContainerClassName="gap-3 p-4"
				data={reports}
				keyExtractor={(report) => report.id}
				ListEmptyComponent={
					<StateCard
						description={
							bucket === "open"
								? "현재 처리할 신고가 없습니다."
								: "아직 종료된 신고가 없습니다."
						}
						title="신고 없음"
					/>
				}
				refreshControl={
					<RefreshControl
						onRefresh={() => reportsQuery.refetch()}
						refreshing={reportsQuery.isRefetching}
					/>
				}
				renderItem={({ item }) => <ReportRowCard report={item} />}
			/>
		</View>
	);
}
