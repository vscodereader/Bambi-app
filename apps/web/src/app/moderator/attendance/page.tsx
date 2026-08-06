"use client";

// 밤비 — 운영자 출석 관리. 사용자별 총 출석일·이번 달·마지막 출석일·미출석 경과일을
// 서버 집계(attendance.adminList)로 받아 표로 보여준다. 검색·역할 필터·정렬·페이지네이션이
// 전부 서버 입력이라 다른 운영자 화면(클라이언트 필터)과 달리 useInfiniteQuery로 이어 받는다.
// 개인 상세·차트는 후속 범위다(스펙 §8).

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/bambi/empty-state";
import { userRoleLabel } from "@/lib/bambi/moderation-labels";
import { formatDate } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 20;

// 검색어를 칠 때마다 서버를 때리면 집계 서브쿼리 5개짜리 목록 쿼리가 키 입력마다 나간다.
// 채팅 관리(moderator/chats)·공고 검색 모달과 같은 250ms 디바운스를 쓴다.
function useDebouncedValue(value: string, delayMs = 250): string {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

type SortKey = "recent" | "idle" | "total" | "month";

const ROLE_FILTER_ITEMS: Record<string, string> = {
	all: "전체",
	job_seeker: userRoleLabel("job_seeker"),
	employer: userRoleLabel("employer"),
};

// 정렬 가능한 열. 값이 곧 서버 sort 입력이라 화면과 서버가 어긋날 여지가 없다.
const SORTABLE_COLUMNS: { key: SortKey; label: string }[] = [
	{ key: "total", label: "총 출석" },
	{ key: "month", label: "이번 달" },
	{ key: "recent", label: "마지막 출석" },
	{ key: "idle", label: "미출석" },
];

export default function ModeratorAttendancePage() {
	const [search, setSearch] = useState("");
	const [roleFilter, setRoleFilter] = useState("all");
	const [sort, setSort] = useState<SortKey>("recent");
	const debouncedSearch = useDebouncedValue(search);

	const listQuery = useInfiniteQuery({
		...orpc.bambi.attendance.adminList.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: 0,
			input: (cursor: number) => ({
				cursor,
				limit: PAGE_SIZE,
				role:
					roleFilter === "all"
						? undefined
						: (roleFilter as "employer" | "job_seeker"),
				search: debouncedSearch.trim() || undefined,
				sort,
			}),
		}),
		// 검색·필터·정렬을 바꾸면 쿼리 키가 바뀐다 — 직전 결과를 남겨 두지 않으면 표가
		// 통째로 사라졌다가 다시 그려진다.
		placeholderData: keepPreviousData,
	});

	const pages = listQuery.data?.pages ?? [];
	// 페이지 사이에 출석이 끼어들면 오프셋이 밀려 같은 계정이 겹칠 수 있어 userId로 걸러낸다.
	const items = [
		...new Map(
			pages.flatMap((page) => page.items).map((item) => [item.userId, item])
		).values(),
	];
	const summary = pages[0]?.summary ?? { attendedToday: 0, eligibleUsers: 0 };

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">출석 관리</h1>
				<p className="m-0 text-muted-foreground text-sm">
					구직자·업소 회원의 출석 현황이에요. 검색·역할·정렬 조건은 요약
					숫자에도 함께 적용돼요.
				</p>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-muted-foreground text-sm">
							오늘 출석자
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="m-0 font-extrabold text-2xl">{`${summary.attendedToday}명`}</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-muted-foreground text-sm">
							출석 대상 회원
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="m-0 font-extrabold text-2xl">{`${summary.eligibleUsers}명`}</p>
					</CardContent>
				</Card>
			</div>

			<div className="flex flex-wrap items-end gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="attendance-search">검색</Label>
					<Input
						className="w-64 max-w-full"
						id="attendance-search"
						onChange={(event) => setSearch(event.target.value)}
						placeholder="닉네임·아이디 검색"
						value={search}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="attendance-role">역할</Label>
					<Select
						items={ROLE_FILTER_ITEMS}
						onValueChange={(value) => setRoleFilter(String(value))}
						value={roleFilter}
					>
						<SelectTrigger className="w-36" id="attendance-role">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(ROLE_FILTER_ITEMS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{listQuery.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : null}

			{listQuery.isError ? (
				<EmptyState
					description="목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{!(listQuery.isPending || listQuery.isError) && items.length === 0 ? (
				<EmptyState
					description={
						debouncedSearch.trim()
							? "검색 조건에 맞는 회원이 없어요."
							: "출석 대상 회원이 없어요."
					}
					title="표시할 회원이 없어요"
				/>
			) : null}

			{items.length > 0 ? (
				<div className="overflow-x-auto rounded-xl border border-border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>회원</TableHead>
								<TableHead>역할</TableHead>
								{SORTABLE_COLUMNS.map((column) => (
									// 서버 정렬은 축마다 방향이 고정(내림차순)이라 활성 열은 항상 descending이다.
									<TableHead
										aria-sort={sort === column.key ? "descending" : undefined}
										key={column.key}
									>
										<button
											className="-mx-2 flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-muted/50"
											onClick={() => setSort(column.key)}
											type="button"
										>
											{column.label}
											{sort === column.key ? (
												<ArrowDownIcon className="size-3.5 text-muted-foreground" />
											) : (
												<ArrowUpDownIcon className="size-3.5 text-muted-foreground/50" />
											)}
										</button>
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item) => (
								<TableRow key={item.userId}>
									<TableCell>
										<div className="flex flex-col gap-0.5">
											<span className="flex items-center gap-1.5 font-medium text-foreground">
												{item.displayName}
												{item.attendedToday ? (
													<Badge variant="success">오늘 출석</Badge>
												) : null}
											</span>
											<span className="max-w-40 truncate text-muted-foreground text-xs">
												{item.loginId ?? "-"}
											</span>
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{userRoleLabel(item.role)}
									</TableCell>
									<TableCell className="whitespace-nowrap">{`${item.totalDays}일`}</TableCell>
									<TableCell className="whitespace-nowrap">{`${item.monthDays}일`}</TableCell>
									<TableCell className="whitespace-nowrap text-muted-foreground">
										{item.lastAttendedOn
											? formatDate(item.lastAttendedOn)
											: "기록 없음"}
									</TableCell>
									<TableCell className="whitespace-nowrap text-muted-foreground">
										{item.idleDays === null ? "-" : `${item.idleDays}일`}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			) : null}

			{listQuery.hasNextPage ? (
				<div className="flex justify-center">
					<Button
						disabled={listQuery.isFetchingNextPage}
						onClick={() => listQuery.fetchNextPage()}
						variant="outline"
					>
						{listQuery.isFetchingNextPage ? "불러오는 중" : "더 보기"}
					</Button>
				</div>
			) : null}
		</div>
	);
}
