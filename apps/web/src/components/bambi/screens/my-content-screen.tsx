"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { Card } from "@bambi-app/ui/components/card";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { formatCommunityDate } from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";
import { MyPageShell } from "../my-page-shell";
import { PageControls } from "../page-controls";

const PAGE_SIZE = 10;
const unavailable = "게시판에서 글이 삭제되었거나 이동되어 불러올 수 없습니다";

function ContentList({ kind }: { kind: "authored" | "liked" }) {
	const [page, setPage] = useState(1);
	const [openValues, setOpenValues] = useState<string[]>([]);
	const open = openValues.includes(kind);
	const query = useQuery({
		...(kind === "authored"
			? orpc.bambi.contentHistory.listMineAuthored.queryOptions({
					input: { page, pageSize: PAGE_SIZE },
				})
			: orpc.bambi.contentHistory.listMineLiked.queryOptions({
					input: { page, pageSize: PAGE_SIZE },
				})),
		enabled: open,
	});
	const pageCount = Math.max(
		1,
		Math.ceil((query.data?.totalCount ?? 0) / PAGE_SIZE)
	);
	const title = kind === "authored" ? "내가 작성한 글" : "좋아요 누른 글";

	return (
		<Card>
			<Accordion multiple onValueChange={setOpenValues} value={openValues}>
				<AccordionItem className="border-0" value={kind}>
					<AccordionTrigger className="px-6 py-5 hover:no-underline">
						<span className="font-semibold text-base">{title}</span>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-5">
						{query.isPending ? (
							<div className="flex flex-col gap-2">
								<Skeleton className="h-11 w-full" />
								<Skeleton className="h-11 w-full" />
							</div>
						) : null}
						{query.isError ? (
							<p className="m-0 rounded-lg bg-secondary p-4 text-center text-muted-foreground text-sm">
								글 목록을 불러오지 못했어요.
							</p>
						) : null}
						{query.isSuccess && query.data.items.length === 0 ? (
							<p className="m-0 rounded-lg bg-secondary p-4 text-center text-muted-foreground text-sm">
								아직 {title}이 없어요.
							</p>
						) : null}
						{query.data?.items.length ? (
							<ContentTable items={query.data.items} />
						) : null}
						{query.data && query.data.totalCount > 0 ? (
							<div className="mt-4 flex justify-center">
								<PageControls
									disabled={query.isFetching}
									onPageChange={setPage}
									page={page}
									pageCount={pageCount}
								/>
							</div>
						) : null}
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</Card>
	);
}

type ContentItem =
	| Awaited<
			ReturnType<AppRouterClient["bambi"]["contentHistory"]["listMineAuthored"]>
	  >["items"][number]
	| Awaited<
			ReturnType<AppRouterClient["bambi"]["contentHistory"]["listMineLiked"]>
	  >["items"][number];

function ContentTable({ items }: { items: ContentItem[] }) {
	return (
		<div className="w-full overflow-hidden">
			<table className="w-full table-fixed border-collapse text-[11px] sm:text-xs md:text-sm">
				<colgroup>
					<col className="w-[30%] md:w-[28%]" />
					<col className="w-[40%] md:w-auto" />
					<col className="w-[30%] md:w-28" />
				</colgroup>
				<thead>
					<tr className="border-b text-center text-muted-foreground">
						<th className="px-1 py-3 font-medium sm:px-2">게시판</th>
						<th className="px-1 py-3 font-medium sm:px-2">제목</th>
						<th className="px-1 py-3 font-medium sm:px-2">날짜</th>
					</tr>
				</thead>
				<tbody>
					{items.map((item) => {
						const unavailableItem = item.status !== "published";
						const boardLabel = item.boardLabel ?? "삭제된 게시판";
						return (
							<tr className="border-b last:border-b-0" key={item.id}>
								<td className="truncate px-1 py-3 text-center text-muted-foreground sm:px-2">
									{boardLabel}
								</td>
								<td className="min-w-0 px-1 py-3 text-left font-semibold sm:px-2">
									{unavailableItem ? (
										<button
											className="block w-full truncate text-left"
											onClick={() => toast.info(unavailable)}
											title={item.title}
											type="button"
										>
											{item.title}
										</button>
									) : (
										<Link
											className="block truncate"
											href={`/seeker/community/${item.boardSlug}/${item.id}`}
											title={item.title}
										>
											{item.title}
										</Link>
									)}
								</td>
								<td className="whitespace-nowrap px-1 py-3 text-center text-muted-foreground sm:px-2">
									{formatCommunityDate(item.createdAt)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
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
