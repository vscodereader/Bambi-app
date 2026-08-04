import { buttonVariants } from "@bambi-app/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@bambi-app/ui/components/empty";
import { Separator } from "@bambi-app/ui/components/separator";
import { cn } from "@bambi-app/ui/lib/utils";
import { EyeIcon, MessageSquareIcon, ThumbsUpIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { JsonLd } from "@/components/bambi/json-ld";
import {
	communityAuthorName,
	formatCommunityDate,
	getCommunityPageItems,
	getCommunityTotalPages,
} from "@/lib/bambi/community";
import { BAMBI_COMPANY } from "@/lib/bambi/company";
import {
	getPublicBoardBySlug,
	PUBLIC_BOARD_INDEX_PATH,
	parsePageParam,
	publicBoardPath,
	publicPostPath,
} from "@/lib/bambi/public-community";
import { breadcrumbJsonLd } from "@/lib/bambi/seo";
import { client } from "@/utils/orpc";

interface PageProps {
	params: Promise<{ boardSlug: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
	params,
	searchParams,
}: PageProps): Promise<Metadata> {
	const [{ boardSlug }, query] = await Promise.all([params, searchParams]);
	const board = getPublicBoardBySlug(boardSlug);
	if (!board) {
		return {};
	}
	const page = parsePageParam(query.page);
	const pageSuffix = page > 1 ? ` (${page}페이지)` : "";

	return {
		// 페이지마다 canonical이 자기 주소를 가리켜야 2페이지 이후가 1페이지의 사본으로
		// 접히지 않는다(글 목록이 달라 실제로 다른 문서다).
		alternates: { canonical: publicBoardPath(board.slug, page) },
		description: `${board.description}. 밤비알바 커뮤니티 ${board.label} 게시판의 최신 글을 확인해 보세요.`,
		openGraph: {
			description: board.description,
			title: `${board.label}${pageSuffix} - 밤비알바 커뮤니티`,
			url: `${BAMBI_COMPANY.url}${publicBoardPath(board.slug, page)}`,
		},
		title: `${board.label}${pageSuffix} - 밤비알바 커뮤니티`,
	};
}

// 페이지 이동은 실제 <a href>다 — 크롤러가 2페이지 이후를 따라갈 수 있어야 한다.
function BoardPagination({
	boardSlug,
	page,
	totalPages,
}: {
	boardSlug: string;
	page: number;
	totalPages: number;
}) {
	const linkClass = (isActive: boolean) =>
		cn(
			buttonVariants({ size: "icon", variant: isActive ? "outline" : "ghost" }),
			"no-underline"
		);

	return (
		<nav aria-label="페이지네이션" className="flex justify-center gap-1">
			{page > 1 ? (
				<Link
					className={cn(
						buttonVariants({ size: "default", variant: "ghost" }),
						"no-underline"
					)}
					href={publicBoardPath(boardSlug, page - 1) as Route}
					rel="prev"
				>
					이전
				</Link>
			) : null}
			{getCommunityPageItems(page, totalPages).map((item) =>
				typeof item === "number" ? (
					<Link
						aria-current={item === page ? "page" : undefined}
						className={linkClass(item === page)}
						href={publicBoardPath(boardSlug, item) as Route}
						key={item}
					>
						{item}
					</Link>
				) : (
					<span
						aria-hidden
						className="flex size-8 items-center justify-center text-muted-foreground"
						key={item}
					>
						…
					</span>
				)
			)}
			{page < totalPages ? (
				<Link
					className={cn(
						buttonVariants({ size: "default", variant: "ghost" }),
						"no-underline"
					)}
					href={publicBoardPath(boardSlug, page + 1) as Route}
					rel="next"
				>
					다음
				</Link>
			) : null}
		</nav>
	);
}

export default async function PublicBoardPage({
	params,
	searchParams,
}: PageProps) {
	const [{ boardSlug }, query] = await Promise.all([params, searchParams]);
	const board = getPublicBoardBySlug(boardSlug);
	if (!board) {
		notFound();
	}

	const page = parsePageParam(query.page);
	// 공개 목록은 서버가 공개 보드·비잠금·published만 내려준다(게이트는 서버 몫).
	const data = await client.bambi.community.listPublicPosts({
		board: board.key,
		page,
	});
	const totalPages = getCommunityTotalPages(data.totalCount, data.pageSize);

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
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-xl">{board.label}</h1>
				<p className="m-0 text-muted-foreground text-sm">{board.description}</p>
			</div>

			{data.items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>글이 없어요</EmptyTitle>
						<EmptyDescription>
							아직 공개된 글이 없어요. 잠시 후 다시 확인해 주세요.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="flex flex-col">
					{data.items.map((post, index) => (
						<Fragment key={post.id}>
							{index > 0 ? <Separator /> : null}
							<Link
								className="flex flex-col gap-1 rounded-lg px-2 py-3 no-underline hover:bg-muted"
								href={publicPostPath(board.slug, post.id) as Route}
							>
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
							</Link>
						</Fragment>
					))}
				</div>
			)}

			{totalPages > 1 ? (
				<BoardPagination
					boardSlug={board.slug}
					page={page}
					totalPages={totalPages}
				/>
			) : null}

			<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-4">
				<p className="m-0 text-muted-foreground text-sm">
					글쓰기·댓글·추천은 밤비알바 회원만 이용할 수 있어요.
				</p>
				<Link
					className={cn(buttonVariants({ size: "sm" }), "no-underline")}
					href="/seeker?auth=login"
				>
					로그인하고 참여하기
				</Link>
			</div>
		</div>
	);
}
