// biome-ignore-all lint/style/noNestedTernary: query 상태 네 가지를 JSX에서 시각 순서대로 표현한다
import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type Href, router, Stack, useLocalSearchParams } from "expo-router";
import { Button, Chip, SearchField, Skeleton, Surface } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
	StateCard,
} from "@/src/components/bambi-screen";
import { MemberOnly } from "@/src/components/member-only";
import {
	communityAccessDestination,
	communityDateLabel,
	communityPageCount,
	communityPostHref,
	normalizeCommunityPage,
} from "@/src/lib/community/community";
import { useVisitor } from "@/src/lib/guest-store";
import { orpc } from "@/src/lib/orpc";

type Boards = Awaited<
	ReturnType<AppRouterClient["bambi"]["communityBoards"]["listActive"]>
>;

const findBoard = (data: Boards | undefined, slug: string) =>
	slug === "best"
		? {
				description: "최근 반응이 좋은 글을 모아 보여드려요.",
				isWritable: false,
				key: "best",
				label: "베스트글",
				slug: "best",
			}
		: data?.boards.find((item) => item.slug === slug || item.key === slug);

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 한 화면의 query, route params, 필터 상태가 한 생명주기를 공유한다
function BoardListInner() {
	const params = useLocalSearchParams<{
		board: string;
		mine?: string;
		page?: string;
		q?: string;
		showEmployer?: string;
		showPromotion?: string;
	}>();
	const slug = params.board;
	const page = normalizeCommunityPage(params.page);
	const queryText = Array.isArray(params.q)
		? (params.q[0] ?? "")
		: (params.q ?? "");
	const [search, setSearch] = useState(queryText);
	const visitor = useVisitor();
	const boards = useQuery(orpc.bambi.communityBoards.listActive.queryOptions());
	const mine = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: visitor.state === "member",
	});
	const board = findBoard(boards.data, slug);
	const profile = mine.data?.bambiProfile;
	const accessBlocked =
		visitor.state === "member" &&
		mine.isSuccess &&
		Boolean(
			profile?.status === "suspended" ||
				(profile?.role === "job_seeker" && profile.gender === null)
		);
	const accessNoticeShown = useRef(false);
	const destination = board
		? communityAccessDestination({
				boardKey: board.key,
				gender:
					visitor.state === "guest"
						? (visitor.guest?.gender ?? null)
						: (mine.data?.bambiProfile?.gender ?? null),
				isGuest: visitor.state === "guest",
				role: mine.data?.bambiProfile?.role ?? null,
			})
		: null;
	const query = useQuery({
		...orpc.bambi.community.listPosts.queryOptions({
			input: {
				board: board?.key ?? slug,
				mine: params.mine === "1",
				page,
				q: queryText || undefined,
				showEmployer: params.showEmployer === "1",
				showPromotion: params.showPromotion === "1",
			},
		}),
		enabled: Boolean(board) && destination === null && !accessBlocked,
		placeholderData: keepPreviousData,
	});

	useEffect(() => {
		if (accessBlocked && !accessNoticeShown.current) {
			accessNoticeShown.current = true;
			Alert.alert(
				"수다방을 이용할 수 없어요",
				profile?.status === "suspended"
					? "차단된 유저는 확인이 불가합니다"
					: "일반 여성회원과 광고 중인 업소회원만 이용가능합니다",
				[
					{
						text: "확인",
						onPress: () => router.replace("/(seeker)/(tabs)" as Href),
					},
				]
			);
			return;
		}
		if (destination) {
			router.replace(`/(seeker)/community/${destination}` as unknown as Href);
			return;
		}
		if (!(boards.isPending || board)) {
			router.replace("/(seeker)/(tabs)/community" as Href);
		}
	}, [accessBlocked, board, boards.isPending, destination, profile?.status]);

	if (accessBlocked) {
		return <LoadingState label="이용 자격을 확인하고 있어요." />;
	}

	const replaceParams = (patch: Record<string, string | undefined>) => {
		router.setParams({ ...patch, page: "1" });
	};

	if (boards.isPending) {
		return (
			<BambiScreen>
				<Skeleton className="h-12 rounded-lg" />
				<Skeleton className="h-40 rounded-lg" />
			</BambiScreen>
		);
	}
	if (boards.isError || !board) {
		return <ErrorState onRetry={() => boards.refetch()} />;
	}

	const pageCount = communityPageCount(query.data?.totalCount ?? 0);
	const role = mine.data?.bambiProfile?.role ?? null;
	const canWrite =
		board.isWritable &&
		board.key !== "best" &&
		(board.key !== "notice" || role === "admin");

	return (
		<BambiScreen>
			<Stack.Screen options={{ title: board.label }} />
			<View className="gap-1">
				<Text className="font-bold text-3xl text-foreground">
					{board.label}
				</Text>
				<Text className="text-muted text-sm">{board.description}</Text>
			</View>
			<SearchField onChange={setSearch} value={search}>
				<SearchField.Group>
					<SearchField.SearchIcon />
					<SearchField.Input
						onSubmitEditing={() =>
							replaceParams({ q: search.trim() || undefined })
						}
						placeholder="제목·본문 검색"
						returnKeyType="search"
					/>
					<SearchField.ClearButton />
				</SearchField.Group>
			</SearchField>
			{board.key === "best" ||
			board.key === "notice" ||
			board.key === "legal" ? null : (
				<View className="flex-row flex-wrap gap-2">
					<Chip
						color={params.showPromotion === "1" ? "accent" : "default"}
						onPress={() =>
							replaceParams({
								showPromotion: params.showPromotion === "1" ? undefined : "1",
							})
						}
						variant={params.showPromotion === "1" ? "primary" : "soft"}
					>
						<Chip.Label>광고 글보기</Chip.Label>
					</Chip>
					<Chip
						color={params.showEmployer === "1" ? "accent" : "default"}
						onPress={() =>
							replaceParams({
								showEmployer: params.showEmployer === "1" ? undefined : "1",
							})
						}
						variant={params.showEmployer === "1" ? "primary" : "soft"}
					>
						<Chip.Label>업소 회원 글보기</Chip.Label>
					</Chip>
					<Chip
						color={params.mine === "1" ? "accent" : "default"}
						onPress={() =>
							replaceParams({ mine: params.mine === "1" ? undefined : "1" })
						}
						variant={params.mine === "1" ? "primary" : "soft"}
					>
						<Chip.Label>내가 쓴 글</Chip.Label>
					</Chip>
				</View>
			)}
			{canWrite ? (
				<Button
					onPress={() =>
						router.push(`/(seeker)/community/${slug}/write` as unknown as Href)
					}
				>
					<Button.Label>글쓰기</Button.Label>
				</Button>
			) : null}
			{query.isError ? (
				<ErrorState onRetry={() => query.refetch()} />
			) : query.isPending ? (
				["a", "b", "c"].map((key) => (
					<Skeleton className="h-24 rounded-lg" key={key} />
				))
			) : query.data.items.length === 0 ? (
				<StateCard
					description="검색이나 필터를 바꾸거나 첫 글을 작성해 보세요."
					title="게시글이 없어요"
				/>
			) : (
				query.data.items.map((post) => (
					<Pressable
						accessibilityLabel={`${post.title}, 댓글 ${post.commentCount}개`}
						accessibilityRole="button"
						className="active:opacity-75"
						key={post.id}
						onPress={() =>
							router.push(
								post.source === "crawled"
									? (communityPostHref(post) as unknown as Href)
									: (`/(seeker)/community/${slug}/${post.id}` as unknown as Href)
							)
						}
					>
						<Surface className="gap-2 rounded-lg p-4" variant="secondary">
							<View className="flex-row flex-wrap gap-2">
								{post.isLocked ? (
									<Chip size="sm" variant="soft">
										<Chip.Label>비밀글</Chip.Label>
									</Chip>
								) : null}
								{post.isPromotion ? (
									<Chip color="accent" size="sm" variant="soft">
										<Chip.Label>광고</Chip.Label>
									</Chip>
								) : null}
							</View>
							<Text className="font-semibold text-foreground" numberOfLines={2}>
								{post.title}
							</Text>
							<Text className="text-muted text-xs">
								{post.authorName} · {communityDateLabel(post.createdAt)} · 조회{" "}
								{post.viewCount} · 추천 {post.likeCount} · 댓글{" "}
								{post.commentCount}
							</Text>
						</Surface>
					</Pressable>
				))
			)}
			<View className="flex-row items-center justify-between">
				<Button
					isDisabled={page <= 1}
					onPress={() => router.setParams({ page: String(page - 1) })}
					variant="secondary"
				>
					<Button.Label>이전</Button.Label>
				</Button>
				<Text className="text-muted text-sm">
					{page} / {pageCount}
				</Text>
				<Button
					isDisabled={page >= pageCount}
					onPress={() => router.setParams({ page: String(page + 1) })}
					variant="secondary"
				>
					<Button.Label>다음</Button.Label>
				</Button>
			</View>
		</BambiScreen>
	);
}

export default function CommunityBoardScreen() {
	return (
		<MemberOnly allowCommunityGuest allowVerifiedGuest>
			<BoardListInner />
		</MemberOnly>
	);
}
