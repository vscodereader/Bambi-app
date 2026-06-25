import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { Button, Surface } from "heroui-native";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatPay,
	LoadingState,
	Pill,
} from "@/src/components/bambi-screen";
import { orpc } from "@/src/lib/orpc";

export default function SeekerJobDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const jobQuery = useQuery(
		orpc.bambi.jobs.getById.queryOptions({ input: { id } })
	);
	const startChatMutation = useMutation(
		orpc.bambi.chats.startFromJobPost.mutationOptions({
			onSuccess: (room) => {
				router.push({
					pathname: "/(seeker)/chats/[id]",
					params: { id: room.id },
				} as unknown as Href);
			},
		})
	);

	if (jobQuery.isLoading) {
		return <LoadingState label="공고 상세를 불러오고 있습니다." />;
	}

	if (jobQuery.isError || !jobQuery.data) {
		return <ErrorState onRetry={() => jobQuery.refetch()} />;
	}

	const job = jobQuery.data;

	return (
		<BambiScreen>
			<BambiHeader
				description={`${job.employerDisplayName} · ${job.workSchedule}`}
				title={job.title}
			/>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<View className="flex-row flex-wrap gap-2">
					<Pill tone="success">
						{job.employerVerificationStatus === "verified" ? "인증" : "검수"}
					</Pill>
					<Pill>{job.region}</Pill>
					<Pill>{job.industryCategory}</Pill>
				</View>
				<Text className="font-bold text-foreground text-xl" selectable>
					{formatPay(job.payAmount, job.payUnit)}
				</Text>
				<Text className="text-foreground leading-6" selectable>
					{job.description}
				</Text>
				{job.interviewNotes ? (
					<Text className="text-muted text-sm leading-5" selectable>
						면접 안내: {job.interviewNotes}
					</Text>
				) : null}
				<Button
					isDisabled={startChatMutation.isPending}
					onPress={() => startChatMutation.mutate({ jobPostId: job.id })}
				>
					<Button.Label>
						{startChatMutation.isPending ? "채팅 준비 중" : "밤비 채팅 시작"}
					</Button.Label>
				</Button>
				{startChatMutation.isError ? (
					<Text className="text-danger text-sm" selectable>
						채팅을 시작하지 못했습니다. 프로필과 휴대폰 인증 상태를 확인해
						주세요.
					</Text>
				) : null}
			</Surface>
		</BambiScreen>
	);
}
