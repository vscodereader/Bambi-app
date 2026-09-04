"use client";

import type { AppRouter } from "@bambi-app/api/routers/index";
import { CRAWLED_EDITED_AUTHOR_NAME } from "@bambi-app/api/services/bambi-crawled-community-policy";
import { Button } from "@bambi-app/ui/components/button";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import type { InferRouterOutputs } from "@orpc/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { CommunityPostForm } from "@/components/bambi/community-post-form";
import { EmptyState } from "@/components/bambi/empty-state";
import { communityCrawledPath, toBoardMeta } from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

type EditData =
	InferRouterOutputs<AppRouter>["bambi"]["crawler"]["getTopicForEdit"];

function EditForm({
	data,
	fromCrawler,
}: {
	data: EditData;
	fromCrawler: boolean;
}) {
	// 편집 중 재조회로 입력이나 충돌 판정 기준을 바꾸지 않는다.
	const [initial] = useState(data);
	const router = useRouter();
	const returnPath = fromCrawler
		? "/moderator/crawler"
		: communityCrawledPath(initial.id);
	const client = useQueryClient();
	const mutation = useMutation(
		orpc.bambi.crawler.updateTopic.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				await Promise.all([
					client.invalidateQueries({ queryKey: orpc.bambi.community.key() }),
					client.invalidateQueries({ queryKey: orpc.bambi.crawler.key() }),
				]);
				toast.success("글을 수정했어요.");
				router.push(returnPath as Route);
			},
		})
	);
	return (
		<CommunityPostForm
			board={toBoardMeta(initial.board)}
			crawledEdit={{
				isPending: mutation.isPending,
				onCancel: () => router.push(returnPath as Route),
				onSubmit: (input) =>
					mutation.mutate({
						...input,
						id: initial.id,
						expectedRevision: initial.revision,
					}),
			}}
			initialPost={{
				id: initial.id,
				board: initial.board.key,
				title: initial.title,
				body: initial.body,
				authorName: CRAWLED_EDITED_AUTHOR_NAME,
				isAnonymous: true,
			}}
		/>
	);
}

function CrawledCommunityEditContent() {
	const { id } = useParams<{ id: string }>();
	const search = useSearchParams();
	const [generation, setGeneration] = useState(0);
	const query = useQuery(
		orpc.bambi.crawler.getTopicForEdit.queryOptions({ input: { id } })
	);
	if (query.isPending) {
		return <Skeleton className="h-64 w-full" />;
	}
	if (query.isError || !query.data) {
		return (
			<EmptyState
				description={query.error?.message ?? "다시 시도해 주세요."}
				title="글을 불러올 수 없어요"
			/>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			<Button
				className="self-end"
				disabled={query.isFetching}
				onClick={async () => {
					const result = await query.refetch();
					if (result.isSuccess) {
						setGeneration((value) => value + 1);
					}
				}}
				variant="outline"
			>
				최신 내용 다시 불러오기 (입력 초기화)
			</Button>
			<EditForm
				data={query.data}
				fromCrawler={search.get("from") === "crawler"}
				key={`${id}:${generation}`}
			/>
		</div>
	);
}

export default function CrawledCommunityEditPage() {
	return (
		<Suspense fallback={<Skeleton className="h-64 w-full" />}>
			<CrawledCommunityEditContent />
		</Suspense>
	);
}
