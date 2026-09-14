import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Skeleton, Surface, useThemeColor } from "heroui-native";
import { useRef, useState } from "react";
import {
	type LayoutChangeEvent,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Pressable,
	ScrollView,
	Text,
	useWindowDimensions,
	View,
} from "react-native";

import { communityPostHref } from "@/src/lib/community/community";
import { orpc } from "@/src/lib/orpc";

type Overview = Awaited<
	ReturnType<AppRouterClient["bambi"]["community"]["overview"]>
>;

const BOARDS_PER_PAGE = 2;

const groupBoards = (boards: Overview["boards"]) => {
	const pages: Overview["boards"][] = [];
	for (let index = 0; index < boards.length; index += BOARDS_PER_PAGE) {
		pages.push(boards.slice(index, index + BOARDS_PER_PAGE));
	}
	return pages;
};

function BoardPair({
	boards,
	foreground,
}: {
	boards: Overview["boards"];
	foreground: string;
}) {
	return boards.map((board) => (
		<Surface
			className="gap-2 rounded-lg p-3"
			key={board.key}
			variant="secondary"
		>
			<Pressable
				accessibilityLabel={`${board.label} 게시판 전체 보기`}
				accessibilityRole="button"
				className="min-h-11 flex-row items-center justify-between active:opacity-75"
				onPress={() =>
					router.push(`/(seeker)/community/${board.slug}` as unknown as Href)
				}
			>
				<Text className="font-semibold text-foreground">{board.label}</Text>
				<Ionicons color={foreground} name="chevron-forward" size={20} />
			</Pressable>
			{board.posts.slice(0, 2).map((post) => (
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
	));
}

export function HomeCommunitySection() {
	const foreground = useThemeColor("foreground");
	const { width } = useWindowDimensions();
	const [carouselWidth, setCarouselWidth] = useState(width);
	const [boardPairWidth, setBoardPairWidth] = useState(width);
	const carouselRef = useRef<ScrollView>(null);
	const query = useQuery(
		orpc.bambi.community.overview.queryOptions({ input: { surface: "main" } })
	);

	if (query.isPending) {
		return <Skeleton className="mx-4 h-36 rounded-lg" />;
	}
	if (query.isError || query.data.boards.length === 0) {
		return null;
	}
	const boardPages = groupBoards(query.data.boards);
	const sideInset = Math.max(0, (carouselWidth - boardPairWidth) / 2);
	const adjacentPeek = sideInset / 2;
	const handleCarouselLayout = (event: LayoutChangeEvent) => {
		const measuredWidth = event.nativeEvent.layout.width;
		if (Math.abs(measuredWidth - carouselWidth) >= 1) {
			setCarouselWidth(measuredWidth);
		}
	};
	const settleCarouselPage = (
		event: NativeSyntheticEvent<NativeScrollEvent>
	) => {
		const page = Math.round(event.nativeEvent.contentOffset.x / carouselWidth);
		carouselRef.current?.scrollTo({ animated: true, x: page * carouselWidth });
	};
	const handleBoardPairLayout = (event: LayoutChangeEvent) => {
		const measuredWidth = event.nativeEvent.layout.width;
		if (Math.abs(measuredWidth - boardPairWidth) >= 1) {
			setBoardPairWidth(measuredWidth);
		}
	};

	return (
		<View className="gap-3 py-3">
			<View className="flex-row items-center justify-between px-4">
				<Text className="font-bold text-foreground text-xl">수다방</Text>
				<Pressable
					accessibilityLabel="수다방 전체 보기"
					accessibilityRole="button"
					className="h-11 w-11 items-center justify-center rounded-full active:opacity-75"
					onPress={() =>
						router.push("/(seeker)/(tabs)/community" as unknown as Href)
					}
				>
					<Ionicons color={foreground} name="chevron-forward" size={24} />
				</Pressable>
			</View>
			<ScrollView
				horizontal
				onLayout={handleCarouselLayout}
				onScrollEndDrag={settleCarouselPage}
				pagingEnabled
				ref={carouselRef}
				showsHorizontalScrollIndicator={false}
			>
				{boardPages.map((boards, index) => (
					<View
						className="overflow-hidden"
						key={boards.map((board) => board.key).join(":")}
						style={{ width: carouselWidth }}
					>
						{index > 0 ? (
							<View
								className="absolute gap-3"
								importantForAccessibility="no-hide-descendants"
								pointerEvents="none"
								style={{
									left: -boardPairWidth + adjacentPeek,
									width: boardPairWidth,
								}}
							>
								<BoardPair
									boards={boardPages[index - 1] ?? []}
									foreground={foreground}
								/>
							</View>
						) : null}
						<View className="mx-6 gap-3" onLayout={handleBoardPairLayout}>
							<BoardPair boards={boards} foreground={foreground} />
						</View>
						{index < boardPages.length - 1 ? (
							<View
								className="absolute gap-3"
								importantForAccessibility="no-hide-descendants"
								pointerEvents="none"
								style={{
									right: -boardPairWidth + adjacentPeek,
									width: boardPairWidth,
								}}
							>
								<BoardPair
									boards={boardPages[index + 1] ?? []}
									foreground={foreground}
								/>
							</View>
						) : null}
					</View>
				))}
			</ScrollView>
		</View>
	);
}
