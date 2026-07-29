"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon } from "lucide-react";
import { Fragment, useState } from "react";

import { EmptyState } from "@/components/bambi/empty-state";
import {
	CRAWL_SOURCE_SITE_LABELS,
	formatCrawlTimestamp,
} from "@/lib/bambi/crawler";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 20;
const TABLE_COLUMN_COUNT = 7;

// 정렬 축이 둘인 이유는 이 표를 보는 목적이 둘이라서다 — "지금 무슨 글이 올라오나"와
// "무슨 주제가 실제로 반응을 얻나".
const SORT_OPTIONS = [
	{ label: "최신순", value: "recent" },
	{ label: "댓글 많은 순", value: "comments" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const formatCount = (value: number | null): string =>
	value === null ? "—" : value.toLocaleString("ko-KR");

const formatPostedAt = (value: Date | string | null): string =>
	value ? formatCrawlTimestamp(value) : "—";

export function CommunityTopicsCard() {
	const [sort, setSort] = useState<SortValue>("recent");
	const [page, setPage] = useState(1);
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const topicsQuery = useQuery(
		orpc.bambi.crawler.listCommunityTopics.queryOptions({
			input: { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, sort },
		})
	);

	const items = topicsQuery.data?.items ?? [];
	const total = topicsQuery.data?.total ?? 0;
	const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const hasNextPage = page < lastPage;

	// base-ui ToggleGroup은 다중 선택 규약이라 값이 배열로 온다. 단일 선택으로 쓰려면
	// 마지막으로 눌린 값만 취한다(같은 항목을 다시 눌러 빈 배열이 되면 무시).
	const changeSort = (value: readonly string[]) => {
		const next = value.at(-1);

		if (!next) {
			return;
		}

		setSort(next as SortValue);
		setPage(1);
		// 정렬이 바뀌면 펼친 행이 화면 밖으로 밀리므로 접는다.
		setExpandedId(null);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>수집된 커뮤니티 주제</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<p className="m-0 text-muted-foreground text-xs">
					원본 게시판에서 모은 주제입니다. 우리 커뮤니티에 자동으로 올라가지
					않습니다 — 어떤 주제가 반응을 얻는지 보고 글감을 잡는 참고자료입니다.
					본문의 전화번호·메신저 아이디는 저장할 때 가려집니다.
				</p>

				<div className="flex flex-wrap items-center justify-between gap-2">
					<ToggleGroup
						aria-label="주제 정렬"
						onValueChange={changeSort}
						size="sm"
						value={[sort]}
						variant="outline"
					>
						{SORT_OPTIONS.map((option) => (
							<ToggleGroupItem key={option.value} value={option.value}>
								{option.label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					<span className="text-muted-foreground text-xs">
						전체 {total.toLocaleString("ko-KR")}건
					</span>
				</div>

				{items.length === 0 ? (
					<EmptyState
						description={
							topicsQuery.isLoading
								? "불러오는 중이에요."
								: "수집 대상을 「퀸알바 × 커뮤니티」로 저장하고 한 회차를 돌리면 여기에 쌓입니다."
						}
						title="아직 수집된 주제가 없어요"
					/>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10">
										<span className="sr-only">본문 펼치기</span>
									</TableHead>
									<TableHead>제목</TableHead>
									<TableHead>게시판</TableHead>
									<TableHead className="text-right">댓글</TableHead>
									<TableHead className="text-right">조회</TableHead>
									<TableHead className="whitespace-nowrap">작성일</TableHead>
									<TableHead className="w-10">
										<span className="sr-only">원문</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{items.map((topic) => {
									const isExpanded = expandedId === topic.id;

									return (
										<Fragment key={topic.id}>
											<TableRow>
												<TableCell>
													<Button
														aria-expanded={isExpanded}
														aria-label={
															isExpanded ? "본문 접기" : "본문 펼치기"
														}
														onClick={() =>
															setExpandedId(isExpanded ? null : topic.id)
														}
														size="icon-sm"
														variant="ghost"
													>
														{isExpanded ? (
															<ChevronUpIcon />
														) : (
															<ChevronDownIcon />
														)}
													</Button>
												</TableCell>
												<TableCell className="max-w-72">
													<span className="block truncate" title={topic.title}>
														{topic.title}
													</span>
												</TableCell>
												<TableCell className="whitespace-nowrap text-muted-foreground text-xs">
													{CRAWL_SOURCE_SITE_LABELS[topic.sourceSite]}
													{topic.boardName ? ` · ${topic.boardName}` : ""}
												</TableCell>
												<TableCell className="text-right">
													{formatCount(topic.commentCount)}
												</TableCell>
												<TableCell className="text-right">
													{formatCount(topic.viewCount)}
												</TableCell>
												<TableCell className="whitespace-nowrap text-muted-foreground text-xs">
													{formatPostedAt(topic.sourcePostedAt)}
												</TableCell>
												<TableCell>
													<Button
														nativeButton={false}
														render={
															<a
																aria-label="원문 새 탭으로 열기"
																href={topic.sourceUrl}
																rel="noreferrer"
																target="_blank"
															>
																<ExternalLinkIcon />
															</a>
														}
														size="icon-sm"
														variant="ghost"
													/>
												</TableCell>
											</TableRow>
											{isExpanded ? (
												<TableRow>
													<TableCell
														className="whitespace-normal bg-muted/30"
														colSpan={TABLE_COLUMN_COUNT}
													>
														{topic.body ? (
															// 원문 줄바꿈을 살린다. 저장할 때 정규화만 하고
															// HTML은 버리므로 그대로 렌더해도 안전하다.
															<p className="m-0 whitespace-pre-wrap text-sm">
																{topic.body}
															</p>
														) : (
															<p className="m-0 text-muted-foreground text-sm">
																본문을 아직 받지 못했어요. 목록만 먼저 쌓이고
																본문은 다음 회차에서 채워집니다(원본이
																삭제됐거나 robots.txt가 막아둔 글은 계속 비어
																있습니다).
															</p>
														)}
													</TableCell>
												</TableRow>
											) : null}
										</Fragment>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}

				{items.length > 0 ? (
					<div className="flex items-center justify-between gap-2">
						<Button
							disabled={page <= 1}
							onClick={() => setPage((prev) => Math.max(1, prev - 1))}
							variant="outline"
						>
							이전
						</Button>
						<span className="text-muted-foreground text-sm">
							{page} / {lastPage}
						</span>
						<Button
							disabled={!hasNextPage}
							onClick={() => setPage((prev) => prev + 1)}
							variant="outline"
						>
							다음
						</Button>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
