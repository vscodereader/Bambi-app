import { BAMBI_COMPANY } from "@bambi-app/api/services/bambi-company";
import { buttonVariants } from "@bambi-app/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@bambi-app/ui/components/empty";
import { cn } from "@bambi-app/ui/lib/utils";
import {
	EyeIcon,
	MessageSquareIcon,
	MoveRightIcon,
	ThumbsUpIcon,
} from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/bambi/json-ld";
import { SEEKER_LOGIN_PATH } from "@/lib/bambi/auth-paths";
import {
	communityAuthorName,
	communityWritePath,
	formatCommunityDate,
} from "@/lib/bambi/community";
import {
	getPublicBoardByKey,
	getPublicBoardBySlug,
	isGuestWritableBoard,
	PUBLIC_BOARD_INDEX_PATH,
	PUBLIC_BOARD_POPULAR_POST_LIMIT,
	PUBLIC_BOARD_VISIBLE_POST_LIMIT,
	type PublicBoardMeta,
	publicBoardPath,
	publicPostPath,
	publicWritePath,
} from "@/lib/bambi/public-community";
import {
	breadcrumbJsonLd,
	mergeSeoKeywords,
	SITE_KEYWORDS,
	siteOpenGraph,
} from "@/lib/bambi/seo";
import { readGuestCanWrite, readVisitorState } from "@/lib/bambi/visitor";
import { client } from "@/utils/orpc";

interface PageProps {
	params: Promise<{ boardSlug: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { boardSlug } = await params;
	const board = getPublicBoardBySlug(boardSlug);
	if (!board) {
		return {};
	}

	return {
		alternates: { canonical: publicBoardPath(board.slug) },
		description: `${board.description}. 밤비알바 커뮤니티 ${board.label} 게시판의 최신 글을 확인해 보세요.`,
		keywords: mergeSeoKeywords(SITE_KEYWORDS, [
			board.label,
			"밤알바 커뮤니티",
			"여성알바 정보",
		]),
		openGraph: siteOpenGraph({
			description: board.description,
			title: `${board.label} - 밤비알바 커뮤니티`,
			url: `${BAMBI_COMPANY.url}${publicBoardPath(board.slug)}`,
		}),
		title: `${board.label} - 밤비알바 커뮤니티`,
	};
}

// 글쓰기 진입. 회원은 회원 화면으로, 이미 인증을 마친 비회원은 공개 글쓰기로 간다.
// 그 외(미인증·구 토큰)에게는 아무 버튼도 노출하지 않는다 — 이 목록에서 본인인증을
// 권유하지 않는다. 공지는 운영자 게시판이라 어느 쪽에도 버튼을 두지 않는다.
function BoardWriteAction({
	board,
	canWrite,
	visitor,
}: {
	board: PublicBoardMeta;
	canWrite: boolean;
	visitor: "anon" | "guest" | "member";
}) {
	if (!isGuestWritableBoard(board.key)) {
		return null;
	}
	if (visitor === "member") {
		return (
			<Link
				className={cn(buttonVariants({ size: "sm" }), "no-underline")}
				href={communityWritePath(board.slug) as Route}
			>
				글쓰기
			</Link>
		);
	}
	if (canWrite) {
		return (
			<Link
				className={cn(buttonVariants({ size: "sm" }), "no-underline")}
				href={publicWritePath(board.slug) as Route}
			>
				글쓰기
			</Link>
		);
	}
	return null;
}

export default async function PublicBoardPage({ params }: PageProps) {
	const { boardSlug } = await params;
	const board = getPublicBoardBySlug(boardSlug);
	if (!board) {
		notFound();
	}

	// 공개 목록은 서버가 공개 보드·비잠금·published만 내려준다(게이트는 서버 몫).
	// 허브와 같은 인기순 응답에서 상위 5개 ID를 구한 뒤 일반 목록에서는 제외해,
	// 정상 노출 인기글과 로그인 게이트용 블러 목록이 중복되지 않게 한다.
	const [popularData, visitor, canWrite] = await Promise.all([
		client.bambi.community.listPublicPosts({
			board: board.key,
			page: 1,
			popular: true,
		}),
		readVisitorState(),
		readGuestCanWrite(),
	]);
	const popularPosts = popularData.items.slice(
		0,
		PUBLIC_BOARD_POPULAR_POST_LIMIT
	);
	const data = await client.bambi.community.listPublicPosts({
		board: board.key,
		excludeIds: popularPosts.map((post) => post.id),
		page: 1,
	});
	const visiblePopularPosts = popularPosts;
	const blurredPostLimit = Math.max(
		0,
		PUBLIC_BOARD_VISIBLE_POST_LIMIT - visiblePopularPosts.length
	);
	const visibleBlurredPosts = data.items.slice(0, blurredPostLimit);
	const hasPosts = visiblePopularPosts.length > 0 || data.items.length > 0;

	const renderPostRow = (
		post: (typeof popularPosts)[number],
		blurred: boolean
	) => (
		<Link
			aria-label={blurred ? "로그인하고 게시글 확인하기" : undefined}
			className="flex flex-col gap-1 rounded-lg px-2 py-3 no-underline hover:bg-muted"
			href={
				(blurred
					? SEEKER_LOGIN_PATH
					: publicPostPath(
							getPublicBoardByKey(post.board)?.slug ?? board.slug,
							post.id
						)) as Route
			}
			key={post.id}
		>
			<span className={cn("flex flex-col gap-1", blurred && "blur-sm")}>
				<span className="flex min-w-0 items-center gap-1.5">
					<span className="truncate font-semibold text-foreground text-sm">
						{post.title}
					</span>
					{post.commentCount > 0 ? (
						<span className="flex shrink-0 items-center gap-0.5 font-semibold text-coral-500 text-xs">
							<MessageSquareIcon className="size-3" />
							{post.commentCount}
						</span>
					) : null}
				</span>
				<span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
					<span>{communityAuthorName(post.authorName)}</span>
					<span>{formatCommunityDate(post.createdAt)}</span>
					<span className="flex items-center gap-0.5">
						<EyeIcon className="size-3" />
						{post.viewCount}
					</span>
					<span className="flex items-center gap-0.5">
						<ThumbsUpIcon className="size-3" />
						{post.likeCount}
					</span>
				</span>
			</span>
		</Link>
	);

	return (
		<div className="flex flex-col gap-4">
			<JsonLd
				data={breadcrumbJsonLd([
					{ name: "커뮤니티 게시판", path: PUBLIC_BOARD_INDEX_PATH },
					{ name: board.label, path: publicBoardPath(board.slug) },
				])}
			/>
			<nav
				aria-label="현재 위치"
				className="flex flex-wrap items-center gap-1 text-muted-foreground text-sm"
			>
				<Link className="hover:underline" href={PUBLIC_BOARD_INDEX_PATH}>
					커뮤니티 게시판
				</Link>
				<span aria-hidden="true">›</span>
				<span className="font-bold text-foreground">{board.label}</span>
			</nav>
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div className="flex flex-col gap-1">
					<h1 className="m-0 font-extrabold text-xl">{board.label}</h1>
					<p className="m-0 text-muted-foreground text-sm">
						{board.description}
					</p>
				</div>
				<BoardWriteAction board={board} canWrite={canWrite} visitor={visitor} />
			</div>

			{hasPosts ? (
				<div className="flex flex-col divide-y divide-border">
					{visiblePopularPosts.map((post) => renderPostRow(post, false))}
					{visibleBlurredPosts.map((post) => renderPostRow(post, true))}
				</div>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>글이 없어요</EmptyTitle>
						<EmptyDescription>
							아직 공개된 글이 없어요. 잠시 후 다시 확인해 주세요.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}

			<div className="mt-4 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-border p-4">
				<p className="m-0 font-medium text-sm">
					내용을 더 확인하고 싶으신가요?
				</p>
				<MoveRightIcon
					aria-hidden="true"
					className="hidden size-4 shrink-0 text-primary sm:block"
				/>
				<Link
					className={cn(
						buttonVariants({ size: "sm", variant: "outline" }),
						"bg-primary/10 text-foreground no-underline hover:bg-primary/20 hover:text-foreground"
					)}
					href={SEEKER_LOGIN_PATH}
				>
					로그인하고 더 보기
				</Link>
			</div>

			{/* 참여 동선은 위 글쓰기 버튼 하나로 모은다. 공지만 작성 주체를 밝혀 둔다. */}
			{isGuestWritableBoard(board.key) ? null : (
				<p className="m-0 rounded-xl border border-border p-4 text-muted-foreground text-sm">
					공지사항은 밤비알바 운영자가 작성해요. 댓글·추천은 자유수다·밤문화
					이야기에서 남길 수 있어요.
				</p>
			)}
		</div>
	);
}
