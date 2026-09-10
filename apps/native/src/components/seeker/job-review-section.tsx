import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Button, Dialog, Skeleton, Surface } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import { StateCard } from "@/src/components/bambi-screen";
import { orpc, queryClient } from "@/src/lib/orpc";
import { mergeReviewPages, reviewStars } from "@/src/lib/seeker/job-reviews";

const PAGE_SIZE = 5;

export function JobReviewSection({ jobPostId }: { jobPostId: string }) {
	const [unlockId, setUnlockId] = useState<string | null>(null);
	const [unlocked, setUnlocked] = useState<Record<string, string>>({});
	const query = useInfiniteQuery(
		orpc.bambi.reviews.listByJobPost.infiniteOptions({
			getNextPageParam: (lastPage, pages) =>
				lastPage.hasMore ? pages.length * PAGE_SIZE : undefined,
			initialPageParam: 0,
			input: (offset) => ({ jobPostId, limit: PAGE_SIZE, offset }),
		})
	);
	const reviews = mergeReviewPages(query.data?.pages ?? []);
	const price = query.data?.pages[0]?.reviewViewPoints ?? 0;
	const unlock = useMutation(
		orpc.bambi.reviews.unlock.mutationOptions({
			onError: (error) => Alert.alert("후기를 열지 못했어요", error.message),
			onSuccess: async (result, variables) => {
				setUnlocked((current) => ({
					...current,
					[variables.reviewId]: result.body,
				}));
				setUnlockId(null);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.attendance.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.pointSettings.getMineHistory.key(),
					}),
				]);
			},
		})
	);
	return (
		<View className="gap-3">
			<Text className="font-bold text-foreground text-xl">후기</Text>
			{query.isPending ? <Skeleton className="h-32 rounded-lg" /> : null}
			{query.isError ? (
				<Button onPress={() => query.refetch()} variant="secondary">
					<Button.Label>후기 다시 불러오기</Button.Label>
				</Button>
			) : null}
			{query.isSuccess && reviews.length === 0 ? (
				<StateCard
					description="면접을 마친 구직자가 남긴 후기가 여기에 표시돼요."
					title="아직 후기가 없어요"
				/>
			) : null}
			{reviews.map((review) => {
				const body = review.body ?? unlocked[review.id];
				return (
					<Surface
						className="gap-2 rounded-lg p-4"
						key={review.id}
						variant="secondary"
					>
						<View className="flex-row items-center justify-between">
							<Text className="font-semibold text-foreground">
								{review.reviewerDisplayName}
							</Text>
							<Text className="text-warning">{reviewStars(review.rating)}</Text>
						</View>
						{body ? (
							<Text className="text-foreground text-sm leading-6" selectable>
								{body}
							</Text>
						) : (
							<Button
								onPress={() => setUnlockId(review.id)}
								variant="secondary"
							>
								<Button.Label>포인트로 후기 확인</Button.Label>
							</Button>
						)}
						<Text className="text-muted text-xs">
							{new Date(review.createdAt).toLocaleDateString("ko-KR")}
						</Text>
					</Surface>
				);
			})}
			{query.hasNextPage ? (
				<Button
					isDisabled={query.isFetchingNextPage}
					onPress={() => query.fetchNextPage()}
					variant="secondary"
				>
					<Button.Label>후기 더보기</Button.Label>
				</Button>
			) : null}
			<Dialog
				isOpen={unlockId !== null}
				onOpenChange={(open) => !open && setUnlockId(null)}
			>
				<Dialog.Portal>
					<Dialog.Overlay />
					<Dialog.Content>
						<View className="gap-4">
							<Dialog.Title>후기를 확인할까요?</Dialog.Title>
							<Dialog.Description>
								후기를 확인하기 위해서는 {price.toLocaleString("ko-KR")}pt를
								사용해야합니다!
							</Dialog.Description>
							<View className="flex-row gap-2">
								<View className="flex-1">
									<Button onPress={() => setUnlockId(null)} variant="tertiary">
										<Button.Label>취소</Button.Label>
									</Button>
								</View>
								<View className="flex-1">
									<Button
										isDisabled={!unlockId || unlock.isPending}
										onPress={() =>
											unlockId && unlock.mutate({ reviewId: unlockId })
										}
									>
										<Button.Label>확인</Button.Label>
									</Button>
								</View>
							</View>
						</View>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog>
		</View>
	);
}
