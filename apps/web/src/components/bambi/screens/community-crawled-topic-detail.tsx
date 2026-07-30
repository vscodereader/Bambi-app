"use client";

// 수집 커뮤니티 글 상세 — 외부(퀸알바 "밤문화이야기")에서 수집한 글과 댓글을 읽기 전용으로
// 보여준다. 제목·본문·조회수·원 게시일·댓글 목록만 렌더하고 좋아요·댓글 작성·수정·신고는 없다
// (우리 회원 글이 아니라 응대·귀속 대상이 없다). 수집 공고 상세(seeker-crawled-job-detail)의
// 정직한 고지 패턴을 따라 "외부에서 수집된 글" Alert을 앞세운다.

import type { AppRouter } from "@bambi-app/api/routers/index";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import type { InferRouterOutputs } from "@orpc/server";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, EyeIcon, InfoIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	communityBoardPath,
	formatCommunityDate,
	getBoardByKey,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

// 수집 글은 일 이야기(work_talk) 게시판에 합류하므로 목록으로 돌아가는 버튼도 그 게시판을 가리킨다.
const CRAWLED_BOARD = getBoardByKey("work_talk");

// 닉네임이 비어 오는 댓글의 폴백. 커뮤니티 기본값("회원")과 달리 수집 원본은 익명 작성이 흔해
// "익명"으로 표기한다.
const CRAWLED_COMMENT_AUTHOR_FALLBACK = "익명";

// 서버 응답과의 드리프트를 막기 위해 oRPC 추론 출력에서 상세 타입을 파생한다.
type CrawledTopicDetail =
	InferRouterOutputs<AppRouter>["bambi"]["community"]["getCrawledTopic"];

function CrawledTopicSkeleton() {
	return (
		<div className="flex flex-col gap-3">
			<Skeleton className="h-7 w-2/3" />
			<Skeleton className="h-4 w-1/3" />
			<Skeleton className="h-48 w-full" />
		</div>
	);
}

function BackButton() {
	return (
		<div>
			<Button
				nativeButton={false}
				render={
					<Link href={communityBoardPath(CRAWLED_BOARD.slug) as Route}>
						<ChevronLeftIcon data-icon="inline-start" />
						{CRAWLED_BOARD.label}
					</Link>
				}
				size="sm"
				variant="ghost"
			/>
		</div>
	);
}

function TopicComments({ topic }: { topic: CrawledTopicDetail }) {
	return (
		<div className="flex flex-col gap-3">
			<h2 className="m-0 font-bold text-base">댓글 {topic.commentCount}</h2>
			{topic.comments.length === 0 ? (
				<p className="m-0 py-2 text-muted-foreground text-sm">
					아직 댓글이 없어요.
				</p>
			) : (
				<div className="flex flex-col gap-3">
					{topic.comments.map((comment, index) => (
						<div
							className="flex flex-col gap-1"
							// biome-ignore lint/suspicious/noArrayIndexKey: 수집 댓글은 안정적 id가 없고(원본 파싱 결과) 재정렬 없는 정적 배열이라 순서가 곧 안정 키다.
							key={index}
						>
							<div className="flex items-center justify-between gap-2">
								<span className="font-semibold text-xs">
									{comment.authorName ?? CRAWLED_COMMENT_AUTHOR_FALLBACK}
								</span>
								{comment.sourcePostedAt ? (
									<span className="text-muted-foreground text-xs">
										{formatCommunityDate(comment.sourcePostedAt)}
									</span>
								) : null}
							</div>
							<p className="m-0 whitespace-pre-line text-sm">{comment.body}</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function CommunityCrawledTopicDetailScreen({
	topicId,
}: {
	topicId: string;
}) {
	const topicQuery = useQuery(
		orpc.bambi.community.getCrawledTopic.queryOptions({
			input: { topicId },
		})
	);

	if (topicQuery.isPending) {
		return <CrawledTopicSkeleton />;
	}

	// 스위치 OFF·부재·삭제는 서버가 NOT_FOUND로 내려주므로 존재하지 않는 글과 같게 취급한다.
	if (topicQuery.isError || !topicQuery.data) {
		return (
			<EmptyState
				className="flex-1"
				description="글이 삭제됐거나 불러올 수 없어요."
				title="글을 찾을 수 없어요"
			/>
		);
	}

	const topic = topicQuery.data;

	return (
		<div className="flex flex-col gap-4">
			<BackButton />
			<Alert variant="warning">
				<InfoIcon />
				<AlertTitle>외부에서 수집된 글이에요</AlertTitle>
				<AlertDescription>
					밤비알바 회원이 쓴 글이 아니라 다른 커뮤니티에 올라온 내용을 그대로
					옮긴 것이에요. 좋아요·댓글·신고는 제공되지 않아요.
				</AlertDescription>
			</Alert>
			<div className="flex flex-col gap-2">
				<h1 className="m-0 flex flex-wrap items-center gap-1.5 font-extrabold text-xl">
					<Badge className="shrink-0" variant="secondary">
						외부 수집
					</Badge>
					{topic.title}
				</h1>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
					<span>{topic.boardName}</span>
					{topic.sourcePostedAt ? (
						<span>{formatCommunityDate(topic.sourcePostedAt)}</span>
					) : null}
					<span className="flex items-center gap-0.5">
						<EyeIcon className="size-3" />
						{topic.viewCount}
					</span>
				</div>
			</div>
			<Separator />
			<p className="m-0 whitespace-pre-line text-foreground text-sm leading-relaxed">
				{topic.body}
			</p>
			<Separator />
			<TopicComments topic={topic} />
		</div>
	);
}
