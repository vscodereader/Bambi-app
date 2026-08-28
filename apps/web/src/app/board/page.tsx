import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { builtinCommunityBoardIcon } from "@/lib/bambi/community-board-icons";
import {
	getPublicBoardByKey,
	PUBLIC_BOARD_INDEX_PATH,
	PUBLIC_BOARD_POPULAR_POST_LIMIT,
	PUBLIC_BOARDS,
	type PublicBoardKey,
	type PublicBoardMeta,
	publicBoardPath,
	publicPostPath,
} from "@/lib/bambi/public-community";
import { mergeSeoKeywords, SITE_KEYWORDS } from "@/lib/bambi/seo";
import { publicClient } from "@/utils/orpc-public";

// 이 허브는 신원에 의존하지 않는 공개 목록이라 ISR로 캐시한다 — 게시판당 최신 글 5개는
// 자주 바뀌지 않고, 매 요청 3개 보드를 조회할 이유가 없다.
export const revalidate = 600;

// 공개 게시판 허브. 목록·상세로 들어가는 내부 링크를 한 곳에 모아 크롤러가
// 공개 영역 전체를 한 번에 훑을 수 있게 한다.
export const metadata: Metadata = {
	alternates: { canonical: PUBLIC_BOARD_INDEX_PATH },
	description:
		"퀸알바·여우알바·밤알바·여성알바 정보를 나누는 밤비알바 공개 커뮤니티입니다. 공지사항과 회원들의 일 이야기·자유수다를 로그인 없이 확인하세요.",
	keywords: mergeSeoKeywords(SITE_KEYWORDS, [
		"퀸알바 커뮤니티",
		"여우알바 커뮤니티",
		"밤알바 커뮤니티",
		"여성알바 커뮤니티",
		"밤알바 후기",
	]),
	title: "밤알바 커뮤니티 | 퀸알바·여우알바·밤알바 정보 | 밤비알바",
};

interface LatestPost {
	// 글이 실제로 속한 게시판 키. 자유·일 이야기 목록엔 다른 보드로 배치된 공지가 섞여
	// 오므로, 링크 slug를 카드가 아니라 글 기준으로 뽑는 데 쓴다.
	board: string;
	id: string;
	title: string;
}

// 게시판별 좋아요 상위 공개 글. API가 좋아요→작성일→ID 내림차순으로 정렬하며,
// 조회에 실패해도 허브는 카드만으로 떠야 하므로 빈 배열로 폴백한다.
const loadPopularPosts = async (
	board: PublicBoardKey
): Promise<LatestPost[]> => {
	try {
		const { items } = await publicClient.bambi.community.listPublicPosts({
			board,
			page: 1,
			popular: true,
		});
		return items
			.slice(0, PUBLIC_BOARD_POPULAR_POST_LIMIT)
			.map((post) => ({ board: post.board, id: post.id, title: post.title }));
	} catch {
		return [];
	}
};

function BoardCard({
	board,
	posts,
}: {
	board: PublicBoardMeta;
	posts: LatestPost[];
}) {
	const BoardIcon = builtinCommunityBoardIcon(board.key);

	return (
		<Card className="h-full gap-0 overflow-hidden py-0 shadow-[var(--shadow-card)]">
			<CardHeader className="flex items-center gap-0 border-border border-b bg-primary/5 py-4">
				<div className="flex w-full items-center justify-between gap-3">
					<div className="flex min-w-0 flex-col gap-1">
						{/* 카드 제목이 게시판 목록으로 가는 링크다 — 글 제목 링크와 앵커를 중첩하지
						    않도록 카드 전체가 아니라 제목만 링크로 둔다. */}
						<CardTitle>
							<Link
								className="no-underline hover:underline"
								href={publicBoardPath(board.slug) as Route}
							>
								{board.label}
							</Link>
						</CardTitle>
						<CardDescription>{board.description}</CardDescription>
					</div>
					{BoardIcon ? (
						<BoardIcon
							aria-hidden="true"
							className="size-8 shrink-0 text-primary"
						/>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="flex-1 py-4">
				{posts.length > 0 ? (
					<ul className="divide-y divide-border p-0">
						{posts.map((post) => (
							<li className="min-w-0 list-none" key={post.id}>
								<Link
									className="block truncate px-3 py-3 text-foreground text-sm no-underline transition-colors hover:bg-muted"
									href={
										publicPostPath(
											// 배치 공지는 이 카드 게시판이 아니라 자기 board(notice) 상세로
											// 링크해야 상세의 slug↔board 일치 검사를 통과한다.
											getPublicBoardByKey(post.board)?.slug ?? board.slug,
											post.id
										) as Route
									}
								>
									{post.title}
								</Link>
							</li>
						))}
					</ul>
				) : (
					<p className="m-0 text-muted-foreground text-sm">
						아직 공개된 글이 없어요.
					</p>
				)}
			</CardContent>
			<CardFooter className="border-border border-t">
				<Button
					className="w-full bg-primary/10 text-foreground hover:bg-primary/20 hover:text-foreground"
					nativeButton={false}
					render={
						<Link href={publicBoardPath(board.slug) as Route}>
							{board.label} 전체 보기
						</Link>
					}
					size="sm"
					variant="outline"
				/>
			</CardFooter>
		</Card>
	);
}

export default async function PublicBoardIndexPage() {
	// 게시판 카드 순서(PUBLIC_BOARDS)와 인기 글 배열 인덱스를 맞춰 병렬 조회한다.
	const postsByBoard = await Promise.all(
		PUBLIC_BOARDS.map((board) => loadPopularPosts(board.key))
	);

	return (
		<div className="flex flex-col gap-8">
			<section className="-mx-2 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-2 py-6 md:mx-0 md:p-8">
				<h1 className="m-0 text-center font-extrabold text-xl md:text-left md:text-3xl">
					밤알바 커뮤니티 게시판
				</h1>
				<p className="m-0 text-muted-foreground text-sm">
					밤비알바 회원들의 이야기와 공지를 읽어보세요. 글쓰기·댓글·추천은
					로그인 후 이용할 수 있어요.
				</p>
			</section>
			{/* 게시판 수가 적어도 데스크톱에서 3열을 유지한다(카드 그리드 최소 3열 규칙). */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{PUBLIC_BOARDS.map((board, index) => (
					<BoardCard
						board={board}
						key={board.key}
						posts={postsByBoard[index] ?? []}
					/>
				))}
			</div>
			<section className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
				<h2 className="m-0 font-extrabold text-lg">
					업종별 근무 방식이 궁금하신가요?
				</h2>
				<p className="m-0 text-muted-foreground text-sm">
					업종별 근무 방식과 정산 구조를 알바 가이드에서 확인해 보세요.
				</p>
				<Button
					nativeButton={false}
					render={<Link href={"/jobs/guide" as Route}>알바 가이드 보기</Link>}
				/>
			</section>
		</div>
	);
}
