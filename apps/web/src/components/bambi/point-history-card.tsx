"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { Button } from "@bambi-app/ui/components/button";
import { Card } from "@bambi-app/ui/components/card";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 10;
const POINT_HISTORY_VALUE = "point-history";
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
	day: "2-digit",
	month: "2-digit",
	timeZone: "Asia/Seoul",
	year: "numeric",
});

function formatPointDate(value: Date | string): string {
	const parts = dateFormatter.formatToParts(new Date(value));
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";
	return `${get("year")}.${get("month")}.${get("day")}`;
}

function formatPointAmount(amount: number): string {
	const prefix = amount > 0 ? "+" : "";
	return `${prefix}${amount.toLocaleString("ko-KR")}P`;
}

function truncatePointLabel(label: string): string {
	const characters = Array.from(label);
	return characters.length > 8
		? `${characters.slice(0, 8).join("")}...`
		: label;
}

export function PointHistoryCard(): React.JSX.Element {
	const [openValues, setOpenValues] = useState<string[]>([]);
	const query = useInfiniteQuery(
		orpc.bambi.pointSettings.getMineHistory.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: null as null | { createdAt: string; id: string },
			input: (cursor: null | { createdAt: string; id: string }) => ({
				cursor: cursor ?? undefined,
				limit: PAGE_SIZE,
			}),
		})
	);

	useEffect(() => {
		if (window.location.hash === `#${POINT_HISTORY_VALUE}`) {
			setOpenValues([POINT_HISTORY_VALUE]);
			document
				.getElementById(POINT_HISTORY_VALUE)
				?.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, []);

	const pages = query.data?.pages ?? [];
	const items = pages.flatMap((page) => page.items);
	const balance = pages[0]?.balance ?? 0;

	return (
		<Card id={POINT_HISTORY_VALUE}>
			<Accordion multiple onValueChange={setOpenValues} value={openValues}>
				<AccordionItem className="border-0" value={POINT_HISTORY_VALUE}>
					<AccordionTrigger className="px-6 py-5 hover:no-underline">
						<span className="flex flex-col items-start gap-1">
							<span className="font-semibold text-base">보유 포인트</span>
							{query.isLoading ? (
								<Skeleton className="h-6 w-24" />
							) : (
								<span className="font-extrabold text-primary text-xl">
									{balance.toLocaleString("ko-KR")}P
								</span>
							)}
						</span>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-5">
						{query.isError ? (
							<div className="flex flex-col items-start gap-3 rounded-lg bg-secondary p-4">
								<p className="m-0 text-muted-foreground text-sm">
									포인트 내역을 불러오지 못했어요.
								</p>
								<Button
									onClick={() => query.refetch()}
									size="sm"
									type="button"
									variant="outline"
								>
									다시 시도
								</Button>
							</div>
						) : null}
						{query.isLoading ? (
							<div className="flex flex-col gap-2">
								<Skeleton className="h-11 w-full" />
								<Skeleton className="h-11 w-full" />
							</div>
						) : null}
						{query.isLoading || query.isError || items.length > 0 ? null : (
							<p className="m-0 rounded-lg bg-secondary p-4 text-center text-muted-foreground text-sm">
								아직 포인트 내역이 없어요.
							</p>
						)}
						{items.length > 0 ? (
							<div className="w-full overflow-hidden">
								<table className="w-full table-fixed border-collapse text-[11px] sm:text-xs md:text-sm">
									<colgroup>
										<col className="w-[30%] md:w-[28%]" />
										<col className="w-[40%] md:w-auto" />
										<col className="w-[30%] md:w-28" />
									</colgroup>
									<thead>
										<tr className="border-b text-left text-muted-foreground">
											<th className="px-1 py-3 font-medium sm:px-2">포인트</th>
											<th className="px-1 py-3 font-medium sm:px-2">내용</th>
											<th className="px-1 py-3 text-left font-medium sm:px-2">
												날짜
											</th>
										</tr>
									</thead>
									<tbody>
										{items.map((item) => (
											<tr className="border-b last:border-b-0" key={item.id}>
												<td className="whitespace-nowrap px-1 py-3 font-semibold sm:px-2">
													{formatPointAmount(item.amount)}
												</td>
												<td
													className="min-w-0 px-1 py-3 sm:px-2"
													title={item.label}
												>
													<span className="md:hidden">
														{truncatePointLabel(item.label)}
													</span>
													<span className="hidden md:inline">{item.label}</span>
												</td>
												<td className="whitespace-nowrap px-1 py-3 text-left text-muted-foreground sm:px-2">
													{formatPointDate(item.createdAt)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : null}
						{query.hasNextPage ? (
							<Button
								className="mt-3 w-full"
								disabled={query.isFetchingNextPage}
								onClick={() => query.fetchNextPage()}
								type="button"
								variant="outline"
							>
								{query.isFetchingNextPage ? "불러오는 중…" : "내역 더보기"}
							</Button>
						) : null}
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</Card>
	);
}
