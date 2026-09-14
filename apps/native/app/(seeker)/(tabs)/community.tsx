import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Skeleton, Surface, useThemeColor } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	StateCard,
} from "@/src/components/bambi-screen";
import { MemberOnly } from "@/src/components/member-only";
import { communityPostHref } from "@/src/lib/community/community";
import { orpc } from "@/src/lib/orpc";

type Overview = Awaited<
	ReturnType<AppRouterClient["bambi"]["community"]["overview"]>
>;

function BoardPreview({ board }: { board: Overview["boards"][number] }) {
	const foreground = useThemeColor("foreground");

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<Pressable
				accessibilityLabel={`${board.label} 게시판 열기`}
				accessibilityRole="button"
				className="min-h-11 flex-row items-center justify-between active:opacity-75"
				onPress={() =>
					router.push(`/(seeker)/community/${board.slug}` as unknown as Href)
				}
			>
				<View className="flex-1 gap-1">
					<Text className="font-bold text-foreground text-lg">
						{board.label}
					</Text>
					{board.description ? (
						<Text className="text-muted text-sm">{board.description}</Text>
					) : null}
				</View>
				<Ionicons color={foreground} name="chevron-forward" size={22} />
			</Pressable>
			{board.posts.length === 0 ? (
				<Text className="text-muted text-sm">아직 게시글이 없어요.</Text>
			) : (
				board.posts.map((post) => (
					<Pressable
						accessibilityRole="button"
						className="min-h-11 justify-center border-border border-t active:opacity-75"
						key={post.id}
						onPress={() =>
							router.push(
								post.source === "crawled"
									? (communityPostHref(post) as unknown as Href)
									: (`/(seeker)/community/${board.slug}/${post.id}` as unknown as Href)
							)
						}
					>
						<Text className="font-medium text-foreground" numberOfLines={1}>
							{post.title}
						</Text>
						<Text className="text-muted text-xs">
							{post.authorName} · 댓글 {post.commentCount}
						</Text>
					</Pressable>
				))
			)}
		</Surface>
	);
}

function CommunityHome() {
	const query = useQuery(
		orpc.bambi.community.overview.queryOptions({
			input: { surface: "community" },
		})
	);

	if (query.isPending) {
		return (
			<BambiScreen>
				{["a", "b", "c"].map((key) => (
					<Skeleton className="h-36 rounded-lg" key={key} />
				))}
			</BambiScreen>
		);
	}
	if (query.isError) {
		return <ErrorState onRetry={() => query.refetch()} />;
	}

	return (
		<BambiScreen>
			{query.data.boards.length === 0 ? (
				<StateCard
					description="운영자가 게시판을 배치하면 이곳에 표시됩니다."
					title="표시할 게시판이 없어요"
				/>
			) : (
				query.data.boards.map((board) => (
					<BoardPreview board={board} key={board.key} />
				))
			)}
		</BambiScreen>
	);
}

export default function SeekerCommunityScreen() {
	return (
		<MemberOnly allowCommunityGuest>
			<CommunityHome />
		</MemberOnly>
	);
}
