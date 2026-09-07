import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Surface } from "heroui-native";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatDateTime,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { orpc } from "@/src/lib/orpc";

export default function ModeratorReportsScreen() {
	const reportsQuery = useQuery(
		orpc.bambi.moderation.listReports.queryOptions({
			input: { limit: 50, status: "open" },
		})
	);
	const setStatusMutation = useMutation(
		orpc.bambi.moderation.setReportStatus.mutationOptions({
			onSuccess: () => reportsQuery.refetch(),
		})
	);

	if (reportsQuery.isLoading) {
		return <LoadingState label="신고 목록을 불러오고 있습니다." />;
	}

	if (reportsQuery.isError) {
		return <ErrorState onRetry={() => reportsQuery.refetch()} />;
	}

	const reports = reportsQuery.data ?? [];

	return (
		<BambiScreen>
			<BambiHeader
				description="열린 신고를 검토, 해결, 기각 처리합니다."
				title="신고 관리"
			/>
			{reports.length === 0 ? (
				<StateCard
					description="현재 열린 신고가 없습니다."
					title="처리할 신고가 없습니다"
				/>
			) : (
				<View className="gap-3">
					{reports.map((report) => (
						<Surface
							className="gap-3 rounded-lg p-4"
							key={report.id}
							variant="secondary"
						>
							<View className="flex-row flex-wrap gap-2">
								<Pill tone="warning">{report.status}</Pill>
								<Pill>{report.targetType}</Pill>
							</View>
							<Text className="font-semibold text-foreground" selectable>
								{report.reason}
							</Text>
							<Text className="text-muted text-sm" selectable>
								{formatDateTime(report.createdAt)}
							</Text>
							{report.details ? (
								<Text className="text-foreground text-sm leading-5" selectable>
									{report.details}
								</Text>
							) : null}
							<View className="flex-row flex-wrap gap-2">
								{(["reviewing", "resolved", "dismissed"] as const).map(
									(status) => (
										<Button
											isDisabled={setStatusMutation.isPending}
											key={status}
											onPress={() =>
												setStatusMutation.mutate({
													reason: "모바일 신고 처리",
													reportId: report.id,
													status,
												})
											}
											size="sm"
											variant={status === "resolved" ? "primary" : "secondary"}
										>
											<Button.Label>{status}</Button.Label>
										</Button>
									)
								)}
							</View>
						</Surface>
					))}
				</View>
			)}
		</BambiScreen>
	);
}
