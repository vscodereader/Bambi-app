import {
	getReportSeverity,
	OPEN_REPORT_STATUSES,
	REPORT_SEVERITY_LABELS,
	type ReportSeverity,
	reportReasonLabel,
	reportStatusLabel,
	targetTypeLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Surface, useThemeColor } from "heroui-native";
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
import { reportListOptions } from "@/src/lib/moderation/queries";
import {
	type ModerationReport,
	REPORT_SEVERITY_TONES,
	resolveReportTargetParty,
} from "@/src/lib/moderation/report-target";
import { formatRelativeTime } from "@/src/lib/support/support";

type Bucket = "closed" | "open";

// 심각도 왼쪽 띠. 두께(border-l-4)는 항상 두고 색만 바꾼다 — overflow-hidden Surface에서
// 테두리 두께를 런타임에 0↔4로 토글하면 Android가 자식을 잘라먹는다.
const SEVERITY_BORDER_CLASSES: Record<ReportSeverity, string> = {
	high: "border-danger",
	low: "border-transparent",
	mid: "border-warning",
};

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
	const mutedColor = useThemeColor("muted");

	return (
		<Pressable
			accessibilityLabel={`${reasonLabel} 신고, 심각도 ${REPORT_SEVERITY_LABELS[severity]}, 대상 ${party.name}, ${reportStatusLabel(report.status)}, ${formatDateTime(report.createdAt)}`}
			accessibilityRole="button"
			accessible
			className="active:opacity-75"
			onPress={() => router.push(reportDetailHref(report.id))}
		>
			<Surface
				className={`gap-2 rounded-lg border-l-4 p-4 ${SEVERITY_BORDER_CLASSES[severity]}`}
				importantForAccessibility="no-hide-descendants"
				variant="secondary"
			>
				<View className="flex-row items-center justify-between gap-2">
					<Text className="flex-1 text-muted text-xs" numberOfLines={1}>
						{targetTypeLabel(report.targetType)} ·{" "}
						{reportStatusLabel(report.status)}
					</Text>
					<Pill tone={REPORT_SEVERITY_TONES[severity]}>
						{REPORT_SEVERITY_LABELS[severity]}
					</Pill>
				</View>
				<Text className="font-bold text-base text-foreground" numberOfLines={2}>
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
				<View className="flex-row items-center gap-1">
					<Ionicons color={mutedColor} name="time-outline" size={12} />
					<Text className="flex-1 text-muted text-xs" numberOfLines={1}>
						{formatRelativeTime(report.createdAt)}
					</Text>
					<Ionicons color={mutedColor} name="chevron-forward" size={16} />
				</View>
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
			{/* 스크롤 시 목록이 필터 행에 붙지 않게 경계를 긋는다 */}
			<View className="border-border border-b px-4 py-3">
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
