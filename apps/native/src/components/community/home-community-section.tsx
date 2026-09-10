import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Button, Skeleton, Surface } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import { communityPostHref } from "@/src/lib/community/community";
import { orpc } from "@/src/lib/orpc";

export function HomeCommunitySection() {
	const query = useQuery(
		orpc.bambi.community.overview.queryOptions({ input: { surface: "main" } })
	);

	if (query.isPending) {
		return <Skeleton className="mx-4 h-36 rounded-lg" />;
	}
	if (query.isError || query.data.boards.length === 0) {
		return null;
	}

	return (
		<View className="gap-3 px-4 py-3">
			<View className="flex-row items-center justify-between">
				<Text className="font-bold text-foreground text-xl">수다방</Text>
				<Button
					onPress={() =>
						router.push("/(seeker)/(tabs)/community" as unknown as Href)
					}
					size="sm"
					variant="tertiary"
				>
					<Button.Label>전체 보기</Button.Label>
				</Button>
			</View>
			{query.data.boards.map((board) => (
				<Surface
					className="gap-2 rounded-lg p-3"
					key={board.key}
					variant="secondary"
				>
					<Pressable
						className="min-h-11 justify-center active:opacity-75"
						onPress={() =>
							router.push(
								`/(seeker)/community/${board.slug}` as unknown as Href
							)
						}
					>
						<Text className="font-semibold text-foreground">{board.label}</Text>
					</Pressable>
					{board.posts.slice(0, 4).map((post) => (
						<Pressable
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
							<Text className="text-foreground text-sm" numberOfLines={1}>
								{post.title}
							</Text>
						</Pressable>
					))}
				</Surface>
			))}
		</View>
	);
}
