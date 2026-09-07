import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Surface } from "heroui-native";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatPay,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { jobStatusLabels } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

const getJobStatusLabel = (status: string): string =>
	jobStatusLabels[status as keyof typeof jobStatusLabels] ?? status;

export default function ModeratorQueueScreen() {
	const queueQuery = useQuery(
		orpc.bambi.moderation.listJobPosts.queryOptions({
			input: { limit: 50, status: "pending_review" },
		})
	);
	const setStatusMutation = useMutation(
		orpc.bambi.moderation.setJobPostStatus.mutationOptions({
			onSuccess: () => queueQuery.refetch(),
		})
	);

	if (queueQuery.isLoading) {
		return <LoadingState label="검수 대기 공고를 불러오고 있습니다." />;
	}

	if (queueQuery.isError) {
		return <ErrorState onRetry={() => queueQuery.refetch()} />;
	}

	const jobs = queueQuery.data ?? [];

	return (
		<BambiScreen>
			<BambiHeader
				description="검수 대기 공고를 승인, 숨김, 반려 처리합니다."
				title="관리자 검수"
			/>
			{jobs.length === 0 ? (
				<StateCard
					description="현재 검수 대기 중인 공고가 없습니다."
					title="검수 대기 없음"
				/>
			) : (
				<View className="gap-3">
					{jobs.map((job) => (
						<Surface
							className="gap-3 rounded-lg p-4"
							key={job.id}
							variant="secondary"
						>
							<View className="flex-row flex-wrap gap-2">
								<Pill tone="warning">{getJobStatusLabel(job.status)}</Pill>
								<Pill>{job.region}</Pill>
								{job.riskFlags.length > 0 ? (
									<Pill tone="danger">위험 {job.riskFlags.length}</Pill>
								) : null}
							</View>
							<Text className="font-bold text-foreground text-lg" selectable>
								{job.title}
							</Text>
							<Text className="text-muted text-sm" selectable>
								{job.organizationDisplayName} ·{" "}
								{formatPay(job.payAmount, job.payUnit)}
							</Text>
							<Text className="text-foreground text-sm leading-5" selectable>
								{job.description}
							</Text>
							<View className="flex-row flex-wrap gap-2">
								<Button
									isDisabled={setStatusMutation.isPending}
									onPress={() =>
										setStatusMutation.mutate({
											jobPostId: job.id,
											reason: "모바일 승인",
											status: "published",
										})
									}
									size="sm"
								>
									<Button.Label>승인</Button.Label>
								</Button>
								<Button
									isDisabled={setStatusMutation.isPending}
									onPress={() =>
										setStatusMutation.mutate({
											jobPostId: job.id,
											reason: "모바일 숨김",
											status: "hidden",
										})
									}
									size="sm"
									variant="secondary"
								>
									<Button.Label>숨김</Button.Label>
								</Button>
								<Button
									isDisabled={setStatusMutation.isPending}
									onPress={() =>
										setStatusMutation.mutate({
											jobPostId: job.id,
											reason: "모바일 반려",
											status: "rejected",
										})
									}
									size="sm"
									variant="secondary"
								>
									<Button.Label>반려</Button.Label>
								</Button>
							</View>
						</Surface>
					))}
				</View>
			)}
		</BambiScreen>
	);
}
