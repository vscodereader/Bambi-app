import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { REVIEW_STATUS_LABELS } from "@bambi-app/api/services/bambi-moderation-labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Surface, useToast } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import { ReasonDialog } from "@/src/components/moderation/reason-dialog";
import { orpc } from "@/src/lib/orpc";

type ReviewPage = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listReviews"]>
>;
type ReviewStatus = "hidden" | "pending_review" | "published";
type ReviewFilter = "all" | ReviewStatus;
const PAGE_SIZE = 10;
const FILTERS = [
	{ label: "전체", value: "all" },
	{ label: "게시됨", value: "published" },
	{ label: "검수 대기", value: "pending_review" },
	{ label: "숨김", value: "hidden" },
] as const;

export default function ModeratorReviewsScreen() {
	const [filter, setFilter] = useState<ReviewFilter>("all");
	const [page, setPage] = useState(1);
	const [pending, setPending] = useState<null | {
		id: string;
		label: string;
		status: ReviewStatus;
	}>(null);
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const query = useQuery(
		orpc.bambi.moderation.listReviews.queryOptions({
			input: {
				page,
				pageSize: PAGE_SIZE,
				status: filter === "all" ? undefined : filter,
			},
		})
	);
	const mutation = useMutation(
		orpc.bambi.moderation.setReviewStatus.mutationOptions()
	);
	const data: ReviewPage | undefined = query.data;
	const items = data?.items ?? [];
	const pages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE));

	const changeFilter = (next: ReviewFilter) => {
		setFilter(next);
		setPage(1);
	};
	const confirm = async (reason: string) => {
		if (!pending) {
			return false;
		}
		await mutation.mutateAsync({
			reason,
			reviewId: pending.id,
			status: pending.status,
		});
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.moderation.listReviews.key(),
		});
		toast.show({ label: "후기 상태를 변경했어요." });
		setPending(null);
		return true;
	};

	return (
		<BambiScreen>
			<BambiHeader
				description="후기의 게시 상태와 내용을 검토합니다."
				title="후기 관리"
			/>
			<FilterChips onChange={changeFilter} options={FILTERS} value={filter} />
			{query.isPending ? (
				<Text className="text-muted text-sm">후기를 불러오고 있어요.</Text>
			) : null}
			{query.isError ? (
				<StateCard
					action={
						<Button onPress={() => query.refetch()} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="네트워크 연결을 확인해 주세요."
					title="후기를 불러오지 못했어요"
				/>
			) : null}
			{query.isSuccess && items.length === 0 ? (
				<StateCard
					description="선택한 상태에 해당하는 후기가 없어요."
					title="표시할 후기가 없어요"
				/>
			) : null}
			{items.map((item) => (
				<Surface
					className="gap-3 rounded-lg p-4"
					key={item.id}
					variant="secondary"
				>
					<View className="flex-row flex-wrap items-center gap-2">
						<Pill tone="warning">{`${item.rating}점`}</Pill>
						<Pill>{REVIEW_STATUS_LABELS[item.status]}</Pill>
					</View>
					<Text className="font-bold text-foreground">{item.jobPostTitle}</Text>
					<Text className="text-muted text-sm">
						{item.organizationDisplayName} · 작성자{" "}
						{item.reviewerDisplayName ?? "익명"}
					</Text>
					<Text className="text-foreground text-sm leading-5" selectable>
						{item.body}
					</Text>
					<View className="flex-row justify-end gap-2">
						{item.status === "published" ? null : (
							<Button
								onPress={() =>
									setPending({
										id: item.id,
										label: item.status === "hidden" ? "게시 복원" : "게시",
										status: "published",
									})
								}
								size="sm"
								variant="secondary"
							>
								<Button.Label>
									{item.status === "hidden" ? "게시 복원" : "게시"}
								</Button.Label>
							</Button>
						)}
						{item.status === "hidden" ? null : (
							<Button
								onPress={() =>
									setPending({ id: item.id, label: "숨김", status: "hidden" })
								}
								size="sm"
								variant="danger"
							>
								<Button.Label>숨김</Button.Label>
							</Button>
						)}
					</View>
				</Surface>
			))}
			{data && data.totalCount > 0 ? (
				<View className="flex-row items-center justify-between">
					<Button
						isDisabled={page <= 1 || query.isFetching}
						onPress={() => setPage((value) => value - 1)}
						size="sm"
						variant="tertiary"
					>
						<Button.Label>이전</Button.Label>
					</Button>
					<Text className="text-muted text-sm">
						{page} / {pages}
					</Text>
					<Button
						isDisabled={page >= pages || query.isFetching}
						onPress={() => setPage((value) => value + 1)}
						size="sm"
						variant="tertiary"
					>
						<Button.Label>다음</Button.Label>
					</Button>
				</View>
			) : null}
			{pending ? (
				<ReasonDialog
					confirmLabel={`${pending.label} 확정`}
					danger={pending.status === "hidden"}
					defaultReason=""
					description="조치 사유는 감사 로그에 남아요."
					isOpen
					onConfirm={confirm}
					onOpenChange={(open) => {
						if (!open) {
							setPending(null);
						}
					}}
					title={`${pending.label} 사유`}
				/>
			) : null}
		</BambiScreen>
	);
}
