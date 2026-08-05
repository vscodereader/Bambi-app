import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import type { Metadata, Route } from "next";
import Link from "next/link";
import {
	PUBLIC_BOARD_INDEX_PATH,
	PUBLIC_BOARDS,
	publicBoardPath,
} from "@/lib/bambi/public-community";

// 공개 게시판 허브. 목록·상세로 들어가는 내부 링크를 한 곳에 모아 크롤러가
// 공개 영역 전체를 한 번에 훑을 수 있게 한다.
export const metadata: Metadata = {
	alternates: { canonical: PUBLIC_BOARD_INDEX_PATH },
	description:
		"밤비알바 커뮤니티 공개 게시판입니다. 공지사항과 회원들의 일 이야기·자유수다를 로그인 없이 읽어볼 수 있습니다.",
	title: "커뮤니티 게시판 - 밤비알바",
};

export default function PublicBoardIndexPage() {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-xl">커뮤니티 게시판</h1>
				<p className="m-0 text-muted-foreground text-sm">
					밤비알바 회원들의 이야기와 공지를 읽어보세요. 글쓰기·댓글·추천은
					로그인 후 이용할 수 있어요.
				</p>
			</div>
			{/* 게시판 수가 적어도 데스크톱에서 3열을 유지한다(카드 그리드 최소 3열 규칙). */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{PUBLIC_BOARDS.map((board) => (
					<Link
						className="no-underline"
						href={publicBoardPath(board.slug) as Route}
						key={board.key}
					>
						<Card className="h-full transition-colors hover:bg-muted">
							<CardHeader>
								<CardTitle>{board.label}</CardTitle>
								<CardDescription>{board.description}</CardDescription>
							</CardHeader>
						</Card>
					</Link>
				))}
			</div>
		</div>
	);
}
