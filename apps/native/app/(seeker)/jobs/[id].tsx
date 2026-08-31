import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { Button, Surface } from "heroui-native";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
	const insets = useSafeAreaInsets();
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

	// 채팅 CTA는 스크롤 밖 하단 고정 바로 뺀다 — BambiScreen(=Container)의 footer/children은
	// 모두 스크롤 뷰포트 안이라 스크롤과 함께 밀려나기 때문이다. 스크롤 영역(BambiScreen)과
	// 고정 바를 flex-1 래퍼의 형제로 두면 스크롤 영역이 남는 높이만 차지하고 바는 항상 보이며,
	// 콘텐츠가 바에 가려지지도 않는다(별도 하단 스페이서 불필요). 홈 인디케이터 인셋은
	// 이 화면이 탭바 없는 Stack 상세라 탭바가 소화하지 않으므로 바가 직접 흡수한다.
	return (
		<View className="flex-1 bg-background">
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
				</Surface>
			</BambiScreen>
			<View
				className="gap-2 border-border border-t bg-background px-4 pt-3"
				style={{ paddingBottom: insets.bottom + 12 }}
			>
				{startChatMutation.isError ? (
					<Text className="text-danger text-sm" selectable>
						채팅을 시작하지 못했습니다. 프로필과 휴대폰 인증 상태를 확인해
						주세요.
					</Text>
				) : null}
				<Button
					accessibilityLabel="1:1 채팅 시작"
					isDisabled={startChatMutation.isPending}
					onPress={() => startChatMutation.mutate({ jobPostId: job.id })}
				>
					<Button.Label>
						{startChatMutation.isPending ? "채팅 준비 중" : "1:1 채팅 시작"}
					</Button.Label>
				</Button>
			</View>
		</View>
	);
}
