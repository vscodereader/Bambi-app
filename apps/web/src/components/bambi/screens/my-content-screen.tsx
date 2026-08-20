"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";
import { MyPageShell } from "../my-page-shell";
import { PageControls } from "../page-controls";

const PAGE_SIZE = 10;
const unavailable = "게시판에서 글이 삭제되었거나 이동되어 불러올 수 없습니다";

function ContentList({ kind }: { kind: "authored" | "liked" }) {
	const [page, setPage] = useState(1);
	const query = useQuery(
		kind === "authored"
			? orpc.bambi.contentHistory.listMineAuthored.queryOptions({
					input: { page, pageSize: PAGE_SIZE },
				})
			: orpc.bambi.contentHistory.listMineLiked.queryOptions({
					input: { page, pageSize: PAGE_SIZE },
				})
	);
	const pageCount = Math.max(
		1,
		Math.ceil((query.data?.totalCount ?? 0) / PAGE_SIZE)
	);
	return (
		<section className="rounded-xl border p-4">
			<h2 className="m-0 font-bold text-lg">
				{kind === "authored" ? "내가 작성한 글" : "좋아요 누른 글"}
			</h2>
			<div className="mt-3 grid gap-2">
				{query.data?.items.map((item) => {
					const unavailableItem = item.status !== "published";
					const boardLabel = item.boardLabel ?? "삭제된 게시판";
					return unavailableItem ? (
						<button
							className="block w-full rounded-lg bg-primary/5 px-3 py-3 text-left transition-colors hover:bg-primary/10"
							key={item.id}
							onClick={() => toast.info(unavailable)}
							type="button"
						>
							<strong>{item.title}</strong>
							<p className="m-0 text-muted-foreground text-xs">
								{boardLabel} · {unavailable}
							</p>
						</button>
					) : (
						<Link
							className="block rounded-lg bg-primary/5 px-3 py-3 transition-colors hover:bg-primary/10"
							href={`/seeker/community/${item.boardSlug}/${item.id}`}
							key={item.id}
						>
							<strong>{item.title}</strong>
							<p className="m-0 text-muted-foreground text-xs">{boardLabel}</p>
						</Link>
					);
				})}
			</div>
			<div className="mt-4 flex justify-center">
				<PageControls
					disabled={query.isFetching}
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
				/>
			</div>
		</section>
	);
}

export function MyContentScreen() {
	return (
		<MyPageShell title="글 관리">
			<div className="grid gap-4">
				<ContentList kind="liked" />
				<ContentList kind="authored" />
			</div>
		</MyPageShell>
	);
}
