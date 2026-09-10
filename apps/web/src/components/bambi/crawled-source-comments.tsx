"use client";

import type { AppRouter } from "@bambi-app/api/routers/index";
import { CRAWLED_SOURCE_COMMENT_MAX_LENGTH } from "@bambi-app/api/services/bambi-crawled-community-policy";
import { Button } from "@bambi-app/ui/components/button";
import type { InferRouterOutputs } from "@orpc/server";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CommentEditForm } from "@/components/bambi/community-post-detail-parts";
import { GradeBadge } from "@/components/bambi/grade-badge";
import { SecretAuthorMark } from "@/components/bambi/secret-author-mark";
import { formatCommunityDate } from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

type Topic =
	InferRouterOutputs<AppRouter>["bambi"]["community"]["getCrawledTopic"];

export function CrawledSourceComments({
	topic,
}: {
	topic: Pick<Topic, "id" | "revision" | "canEdit" | "sourceComments">;
}) {
	const client = useQueryClient();
	const [editing, setEditing] = useState<{
		id: string;
		revision: number;
	} | null>(null);
	const mutation = useMutation(
		orpc.bambi.crawler.updateSourceComment.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				setEditing(null);
				await Promise.all([
					client.invalidateQueries({ queryKey: orpc.bambi.community.key() }),
					client.invalidateQueries({ queryKey: orpc.bambi.crawler.key() }),
				]);
				toast.success("댓글을 수정했어요.");
			},
		})
	);
	return (
		<div className="flex flex-col gap-3">
			{topic.sourceComments.map((comment) => (
				<div className="flex flex-col gap-2" key={comment.id}>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							{comment.authorGender ? (
								<SecretAuthorMark gender={comment.authorGender} />
							) : (
								<>
									<span className="font-semibold text-xs">
										{comment.authorName ?? "익명"}
									</span>
									<GradeBadge grade={comment.authorGrade} />
								</>
							)}
						</div>
						{comment.sourcePostedAt && (
							<span className="text-muted-foreground text-xs">
								{formatCommunityDate(comment.sourcePostedAt)}
							</span>
						)}
					</div>
					{editing?.id === comment.id ? (
						<CommentEditForm
							initialBody={comment.body}
							maxLength={CRAWLED_SOURCE_COMMENT_MAX_LENGTH}
							onCancel={() => setEditing(null)}
							onSubmit={(body) =>
								mutation.mutate({
									id: topic.id,
									sourceCommentId: comment.id,
									expectedRevision: editing.revision,
									body,
								})
							}
							pending={mutation.isPending}
						/>
					) : (
						<>
							<p className="m-0 whitespace-pre-line text-sm">{comment.body}</p>
							{topic.canEdit && (
								<Button
									className="self-end"
									disabled={mutation.isPending}
									onClick={() =>
										setEditing({ id: comment.id, revision: topic.revision })
									}
									size="sm"
									variant="ghost"
								>
									수정
								</Button>
							)}
						</>
					)}
				</div>
			))}
		</div>
	);
}
