import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Surface } from "heroui-native";
import { Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
	Pill,
} from "@/src/components/bambi-screen";
import { CommunityComments } from "@/src/components/community/community-comments";
import { MemberOnly } from "@/src/components/member-only";
import { communityDateLabel } from "@/src/lib/community/community";
import { orpc } from "@/src/lib/orpc";

function CrawledCommunityDetail() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const query = useQuery(
		orpc.bambi.community.getCrawledTopic.queryOptions({
			input: { topicId: id },
		})
	);

	if (query.isPending) {
		return <LoadingState label="수집 게시글을 불러오고 있어요." />;
	}
	if (query.isError || !query.data) {
		return <ErrorState onRetry={() => query.refetch()} />;
	}
	const topic = query.data;
	return (
		<BambiScreen>
			<Stack.Screen options={{ title: topic.boardName ?? "수집 게시글" }} />
			<View className="gap-2">
				<Pill tone="neutral">외부 수집 글</Pill>
				<Text className="font-bold text-3xl text-foreground" selectable>
					{topic.title}
				</Text>
				<Text className="text-muted text-sm">
					{topic.sourcePostedAt
						? communityDateLabel(topic.sourcePostedAt)
						: "작성일 미상"}{" "}
					· 조회 {topic.viewCount} · 댓글 {topic.commentCount}
				</Text>
			</View>
			<Surface className="rounded-lg p-4" variant="secondary">
				<Text className="text-foreground leading-6" selectable>
					{topic.body}
				</Text>
			</Surface>
			{topic.sourceComments.length > 0 ? (
				<View className="gap-3">
					<Text className="font-bold text-foreground text-xl">원본 댓글</Text>
					{topic.sourceComments.map((comment, index) => (
						<Surface
							className="gap-1 rounded-lg p-3"
							// biome-ignore lint/suspicious/noArrayIndexKey: 수집 원본 댓글에는 id가 없고 응답 내 순서는 불변이다
							key={`${index}-${comment.body}`}
							variant="tertiary"
						>
							<Text className="font-semibold text-foreground">
								{comment.authorName}
							</Text>
							<Text className="text-foreground text-sm" selectable>
								{comment.body}
							</Text>
						</Surface>
					))}
				</View>
			) : null}
			<CommunityComments
				crawledTopicId={topic.id}
				initialComments={topic.comments}
			/>
		</BambiScreen>
	);
}

export default function CrawledCommunityScreen() {
	return (
		<MemberOnly allowCommunityGuest>
			<CrawledCommunityDetail />
		</MemberOnly>
	);
}
