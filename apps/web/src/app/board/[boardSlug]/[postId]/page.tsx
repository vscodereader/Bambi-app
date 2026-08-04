import { buttonVariants } from "@bambi-app/ui/components/button";
import { Separator } from "@bambi-app/ui/components/separator";
import { cn } from "@bambi-app/ui/lib/utils";
import { ChevronLeftIcon, EyeIcon, ThumbsUpIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/bambi/json-ld";
import { PublicPostBody } from "@/components/bambi/public-post-body";
import {
	communityAuthorName,
	communityPostPath,
	formatCommunityDate,
} from "@/lib/bambi/community";
import { BAMBI_COMPANY } from "@/lib/bambi/company";
import {
	communityBodyText,
	getPublicBoardBySlug,
	PUBLIC_BOARD_INDEX_PATH,
	publicBoardPath,
	publicPostPath,
} from "@/lib/bambi/public-community";
import { breadcrumbJsonLd } from "@/lib/bambi/seo";
import { client } from "@/utils/orpc";

interface PageProps {
	params: Promise<{ boardSlug: string; postId: string }>;
}

type PublicPost = Awaited<
	ReturnType<typeof client.bambi.community.getPublicPost>
>;

// 공개 상세는 보드 slug와 글의 실제 게시판이 맞아야 열린다 — 같은 글이 여러 주소로
// 색인되면 중복 콘텐츠이고, 비공개 보드 글은 서버가 이미 NOT_FOUND로 막는다.
const loadPost = async (
	boardSlug: string,
	postId: string
): Promise<PublicPost | null> => {
	const board = getPublicBoardBySlug(boardSlug);
	if (!board) {
		return null;
	}
	try {
		const post = await client.bambi.community.getPublicPost({ postId });
		return post.board === board.key ? post : null;
	} catch {
		return null;
	}
};

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { boardSlug, postId } = await params;
	const post = await loadPost(boardSlug, postId);
	if (!post) {
		return {};
	}
	const board = getPublicBoardBySlug(boardSlug);
	const title = `${post.title} - ${board?.label ?? "커뮤니티"} | 밤비알바`;
	const description = communityBodyText(post.body);
	const canonical = publicPostPath(boardSlug, postId);

	return {
		alternates: { canonical },
		description,
		openGraph: {
			description,
			publishedTime: new Date(post.createdAt).toISOString(),
			title,
			type: "article",
			url: `${BAMBI_COMPANY.url}${canonical}`,
		},
		title,
	};
}

function PublicComments({ comments }: { comments: PublicPost["comments"] }) {
	if (comments.length === 0) {
		return (
			<p className="m-0 text-muted-foreground text-sm">아직 댓글이 없어요.</p>
		);
	}

	return (
		<ul className="m-0 flex list-none flex-col gap-3 p-0">
			{comments.map((comment) => (
				<li
					className={cn(
						"flex flex-col gap-1",
						comment.parentCommentId && "pl-6"
					)}
					key={comment.id}
				>
					<span className="text-muted-foreground text-xs">
						{comment.authorRole === "employer" ? "업소 회원" : "회원"} ·{" "}
						{formatCommunityDate(comment.createdAt)}
					</span>
					<p className="m-0 whitespace-pre-wrap text-foreground text-sm">
						{comment.isDeleted ? "삭제된 댓글이에요." : comment.body}
					</p>
				</li>
			))}
		</ul>
	);
}

export default async function PublicPostPage({ params }: PageProps) {
	const { boardSlug, postId } = await params;
	const post = await loadPost(boardSlug, postId);
	if (!post) {
		notFound();
	}
	const board = getPublicBoardBySlug(boardSlug);

	return (
		<article className="flex flex-col gap-4">
			<JsonLd
				data={{
					"@context": "https://schema.org",
					"@type": "DiscussionForumPosting",
					author: { "@type": "Person", name: post.authorName },
					datePublished: new Date(post.createdAt).toISOString(),
					dateModified: new Date(post.updatedAt).toISOString(),
					headline: post.title,
					inLanguage: "ko-KR",
					url: `${BAMBI_COMPANY.url}${publicPostPath(boardSlug, postId)}`,
				}}
			/>
			{/* 게시판 허브 → 게시판 → 글 계층. 아래 "목록으로" 링크가 같은 계층을 화면에도 낸다. */}
			<JsonLd
				data={breadcrumbJsonLd([
					{ name: "커뮤니티 게시판", path: PUBLIC_BOARD_INDEX_PATH },
					{
						name: board?.label ?? "게시판",
						path: publicBoardPath(boardSlug),
					},
					{ name: post.title, path: publicPostPath(boardSlug, postId) },
				])}
			/>
			<div>
				<Link
					className={cn(
						buttonVariants({ size: "sm", variant: "ghost" }),
						"no-underline"
					)}
					href={publicBoardPath(boardSlug) as Route}
				>
					<ChevronLeftIcon data-icon="inline-start" />
					{board?.label ?? "목록"}
				</Link>
			</div>

			<header className="flex flex-col gap-2">
				<h1 className="m-0 font-extrabold text-xl">{post.title}</h1>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
					<span>{communityAuthorName(post.authorName)}</span>
					{/* 광고·업소 표시는 회원 화면(배지)과 같은 정보를 공개 화면에서도 밝힌다. */}
					{post.isPromotion ? <span>광고</span> : null}
					{post.authorRole === "employer" ? <span>업소 회원</span> : null}
					<span>{formatCommunityDate(post.createdAt)}</span>
					<span className="flex items-center gap-0.5">
						<EyeIcon className="size-3" />
						{post.viewCount}
					</span>
					<span className="flex items-center gap-0.5">
						<ThumbsUpIcon className="size-3" />
						{post.likeCount}
					</span>
				</div>
			</header>
			<Separator />

			<PublicPostBody body={post.body} />

			<Separator />
			<section className="flex flex-col gap-3">
				<h2 className="m-0 font-bold text-base">댓글 {post.commentCount}</h2>
				<PublicComments comments={post.comments} />
			</section>

			{/* 참여(추천·댓글·신고)는 회원 화면으로 보낸다. 비로그인은 게이트가 로그인
			    화면으로 돌리므로 여기서 따로 막지 않는다. */}
			<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-4">
				<p className="m-0 text-muted-foreground text-sm">
					댓글·추천은 밤비알바 회원만 남길 수 있어요.
				</p>
				<Link
					className={cn(buttonVariants({ size: "sm" }), "no-underline")}
					href={communityPostPath(boardSlug, postId) as Route}
				>
					로그인하고 댓글 쓰기
				</Link>
			</div>
		</article>
	);
}
