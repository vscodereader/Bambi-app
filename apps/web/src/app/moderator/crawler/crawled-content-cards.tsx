"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/bambi/empty-state";
import {
	CRAWLED_POST_STATUS_LABELS,
	CRAWLED_POST_STATUS_VARIANTS,
	formatCrawlTimestamp,
} from "@/lib/bambi/crawler";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;

type CrawledPostStatus = keyof typeof CRAWLED_POST_STATUS_LABELS;
type StatusFilter = "all" | CrawledPostStatus;

// 라벨 맵은 알파벳순이라 그대로 못 쓴다 — 훑는 순서(전체 → 정상 → 손볼 것 → 내려간 것)로 세운다.
const STATUS_FILTERS: readonly { label: string; value: StatusFilter }[] = [
	{ label: "전체", value: "all" },
	{ label: CRAWLED_POST_STATUS_LABELS.active, value: "active" },
	{ label: CRAWLED_POST_STATUS_LABELS.needs_review, value: "needs_review" },
	{ label: CRAWLED_POST_STATUS_LABELS.expired, value: "expired" },
	{ label: CRAWLED_POST_STATUS_LABELS.removed, value: "removed" },
];

// 삭제·복구는 목록과 현황 숫자를 동시에 바꾼다. 커뮤니티 목록까지 한 번에 털어도 손해가
// 없어서(두 카드가 서로의 캐시를 모른다) 한 함수로 묶어 둔다.
function useInvalidateCrawled() {
	const queryClient = useQueryClient();

	return () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.crawler.list.key(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.crawler.getSummary.queryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.crawler.listTopics.key(),
			}),
		]);
}

export function CrawledJobPostsCard() {
	const invalidate = useInvalidateCrawled();
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const listQuery = useQuery(
		orpc.bambi.crawler.list.queryOptions({
			input: {
				limit: PAGE_SIZE,
				status: statusFilter === "all" ? null : statusFilter,
			},
		})
	);

	// 삭제는 톰스톤이라 되돌릴 수 있다 — 그래서 확인 창 없이 바로 실행하고 토스트로만 알린다.
	const removeMutation = useMutation(
		orpc.bambi.crawler.removePost.mutationOptions({
			onError: (error) => toast.error(error.message || "삭제하지 못했어요."),
			onSuccess: async () => {
				toast.success("공고를 삭제했어요. 목록·배너에서 바로 빠집니다.");
				await invalidate();
			},
		})
	);
	const restoreMutation = useMutation(
		orpc.bambi.crawler.restorePost.mutationOptions({
			onError: (error) => toast.error(error.message || "복구하지 못했어요."),
			onSuccess: async () => {
				toast.success("공고를 복구했어요.");
				await invalidate();
			},
		})
	);
	const isPending = removeMutation.isPending || restoreMutation.isPending;

	return (
		<Card>
			<CardHeader>
				<CardTitle>수집 공고 관리</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<p className="m-0 text-muted-foreground text-xs">
					삭제한 공고는 지워지지 않고 「삭제됨」으로 남습니다. 다음 회차가 같은
					글을 다시 만나도 되살아나지 않아요. 잘못 눌렀다면 상태를
					「삭제됨」으로 걸러 복구하면 됩니다. 한 번에 최근 {PAGE_SIZE}건까지
					보여줍니다
					{listQuery.data ? ` (조건에 맞는 ${listQuery.data.total}건)` : ""}.
				</p>

				<ToggleGroup
					aria-label="상태 필터"
					className="w-full flex-wrap"
					onValueChange={(value) => {
						const next = value.at(-1);
						if (next) {
							setStatusFilter(next as StatusFilter);
						}
					}}
					value={[statusFilter]}
				>
					{STATUS_FILTERS.map((filter) => (
						<ToggleGroupItem key={filter.value} value={filter.value}>
							{filter.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>

				{listQuery.data?.items.length ? (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>제목</TableHead>
									<TableHead>업소명</TableHead>
									<TableHead>지역</TableHead>
									<TableHead>상태</TableHead>
									<TableHead>마지막 수집</TableHead>
									<TableHead className="text-right">조치</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{listQuery.data.items.map((item) => (
									<TableRow key={item.id}>
										<TableCell>{item.title}</TableCell>
										<TableCell>{item.shopName ?? "—"}</TableCell>
										<TableCell className="whitespace-nowrap">
											{[item.region, item.district].filter(Boolean).join(" ") ||
												"—"}
										</TableCell>
										<TableCell>
											<Badge
												variant={CRAWLED_POST_STATUS_VARIANTS[item.status]}
											>
												{CRAWLED_POST_STATUS_LABELS[item.status]}
											</Badge>
										</TableCell>
										<TableCell className="whitespace-nowrap">
											{formatCrawlTimestamp(item.lastSeenAt)}
										</TableCell>
										<TableCell className="text-right">
											{item.status === "removed" ? (
												<Button
													disabled={isPending}
													onClick={() =>
														restoreMutation.mutate({ id: item.id })
													}
													size="sm"
													variant="outline"
												>
													복구
												</Button>
											) : (
												<Button
													disabled={isPending}
													onClick={() => removeMutation.mutate({ id: item.id })}
													size="sm"
													variant="destructive"
												>
													삭제
												</Button>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				) : (
					<EmptyState
						description={
							listQuery.isLoading
								? "불러오는 중이에요."
								: "이 상태에 해당하는 수집 공고가 없어요. 필터를 바꾸거나 수집 회차를 돌려 보세요."
						}
						title="보여줄 수집 공고가 없어요"
					/>
				)}
			</CardContent>
		</Card>
	);
}

export function CrawledCommunityTopicsCard() {
	const invalidate = useInvalidateCrawled();
	const listQuery = useQuery(
		orpc.bambi.crawler.listTopics.queryOptions({
			input: { limit: PAGE_SIZE },
		})
	);

	const removeMutation = useMutation(
		orpc.bambi.crawler.removeTopic.mutationOptions({
			onError: (error) => toast.error(error.message || "삭제하지 못했어요."),
			onSuccess: async () => {
				toast.success("커뮤니티 글을 삭제했어요. 게시판에서 바로 빠집니다.");
				await invalidate();
			},
		})
	);
	const restoreMutation = useMutation(
		orpc.bambi.crawler.restoreTopic.mutationOptions({
			onError: (error) => toast.error(error.message || "복구하지 못했어요."),
			onSuccess: async () => {
				toast.success("커뮤니티 글을 복구했어요.");
				await invalidate();
			},
		})
	);
	const isPending = removeMutation.isPending || restoreMutation.isPending;

	return (
		<Card>
			<CardHeader>
				<CardTitle>수집 커뮤니티 글 관리</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<p className="m-0 text-muted-foreground text-xs">
					공고와 같은 방식으로, 삭제해도 기록은 남고 다음 회차가 되살리지
					않습니다. 「일 이야기」 게시판과 수다방 미리보기에서 즉시 빠져요. 한
					번에 최근 {PAGE_SIZE}건까지 보여줍니다
					{listQuery.data ? ` (전체 ${listQuery.data.total}건)` : ""}.
				</p>
				{listQuery.data?.items.length ? (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>제목</TableHead>
									<TableHead>게시판</TableHead>
									<TableHead>원 게시일</TableHead>
									<TableHead className="text-right">댓글</TableHead>
									<TableHead className="text-right">조회</TableHead>
									<TableHead>상태</TableHead>
									<TableHead className="text-right">조치</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{listQuery.data.items.map((topic) => (
									<TableRow key={topic.id}>
										<TableCell>{topic.title}</TableCell>
										{/* 게시판명은 상대 사이트가 적어둔 원문 문구다(우리 게시판 enum이 아님). */}
										<TableCell className="whitespace-nowrap">
											{topic.boardName ?? "—"}
										</TableCell>
										<TableCell className="whitespace-nowrap">
											{topic.sourcePostedAt
												? formatCrawlTimestamp(topic.sourcePostedAt)
												: "—"}
										</TableCell>
										<TableCell className="text-right">
											{topic.commentCount ?? "—"}
										</TableCell>
										<TableCell className="text-right">
											{topic.viewCount ?? "—"}
										</TableCell>
										<TableCell>
											{topic.removedAt ? (
												<Badge variant="destructive">
													{CRAWLED_POST_STATUS_LABELS.removed}
												</Badge>
											) : (
												<Badge variant="outline">
													{CRAWLED_POST_STATUS_LABELS.active}
												</Badge>
											)}
										</TableCell>
										<TableCell className="text-right">
											{topic.removedAt ? (
												<Button
													disabled={isPending}
													onClick={() =>
														restoreMutation.mutate({ id: topic.id })
													}
													size="sm"
													variant="outline"
												>
													복구
												</Button>
											) : (
												<Button
													disabled={isPending}
													onClick={() =>
														removeMutation.mutate({ id: topic.id })
													}
													size="sm"
													variant="destructive"
												>
													삭제
												</Button>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				) : (
					<EmptyState
						description={
							listQuery.isLoading
								? "불러오는 중이에요."
								: "아직 수집한 커뮤니티 글이 없어요. 수집 데이터를 「커뮤니티」로 두고 회차를 돌리면 여기에 쌓입니다."
						}
						title="수집한 커뮤니티 글이 없어요"
					/>
				)}
			</CardContent>
		</Card>
	);
}
