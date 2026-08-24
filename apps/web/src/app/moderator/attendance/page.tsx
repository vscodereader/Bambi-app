"use client";

// 밤비 — 운영자 출석 관리. 사용자별 총 출석일·이번 달·마지막 출석일·미출석 경과일을
// 서버 집계(attendance.adminList)로 받아 표로 보여준다. 검색·역할 필터·정렬·페이지네이션이
// 전부 서버 입력이며 10개 단위 페이지로 조회한다. 회원 선택 후 일괄 지급·차감도 여기서 한다
// (옛 포인트 관리 화면을 흡수).
// 개인 상세·차트는 후속 범위다(스펙 §8).

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpDownIcon } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { GradeBadge } from "@/components/bambi/grade-badge";
import { MemberPointAdjustDialog } from "@/components/bambi/member-point-adjust-dialog";
import { PageControls } from "@/components/bambi/page-controls";
import { userRoleLabel } from "@/lib/bambi/moderation-labels";
import { formatDate } from "@/lib/bambi-format";
import { client, orpc } from "@/utils/orpc";

const PAGE_SIZE = 10;

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

type AttendanceRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["attendance"]["adminList"]>
>["items"][number];

const formatPoints = (points: number) => `${points.toLocaleString("ko-KR")}P`;

// 일괄 조정 다이얼로그 제목용 이름. 2명 이상이면 "첫 회원 외 N명".
function bulkMemberLabel(members: AttendanceRow[]): string {
	const first = members[0]?.displayName ?? "";
	return members.length > 1 ? `${first} 외 ${members.length - 1}명` : first;
}

// 정렬 열 헤더. 서버 정렬은 축마다 방향이 고정(내림차순)이라 활성 열은 항상 descending이다.
function SortHead({
	active,
	label,
	onSelect,
}: {
	active: boolean;
	label: string;
	onSelect: () => void;
}) {
	return (
		<TableHead aria-sort={active ? "descending" : undefined}>
			<button
				className="-mx-2 flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-muted/50"
				onClick={onSelect}
				type="button"
			>
				{label}
				{active ? (
					<ArrowDownIcon className="size-3.5 text-muted-foreground" />
				) : (
					<ArrowUpDownIcon className="size-3.5 text-muted-foreground/50" />
				)}
			</button>
		</TableHead>
	);
}

// 회원 한 행. 행 클릭은 사용자 상세로, 체크박스·관리 버튼은 stopPropagation으로 행 이동을 막는다.
function MemberRow({
	item,
	onAdjust,
	onOpen,
	onToggle,
	selected,
}: {
	item: AttendanceRow;
	onAdjust: () => void;
	onOpen: () => void;
	onToggle: () => void;
	selected: boolean;
}) {
	return (
		<TableRow className="cursor-pointer" onClick={onOpen}>
			<TableCell
				className="text-center align-middle"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex justify-center">
					<Checkbox
						aria-label={`${item.displayName} 선택`}
						checked={selected}
						onCheckedChange={onToggle}
					/>
				</div>
			</TableCell>
			<TableCell>
				<div className="flex flex-col gap-0.5">
					<span className="flex items-center gap-1.5 font-medium text-foreground">
						<button
							className="hover:underline"
							onClick={(event) => {
								event.stopPropagation();
								onOpen();
							}}
							type="button"
						>
							{item.displayName}
						</button>
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
			<TableCell>
				<GradeBadge grade={item.grade} />
			</TableCell>
			<TableCell className="whitespace-nowrap">{`${item.totalDays}일`}</TableCell>
			<TableCell className="whitespace-nowrap">{`${item.monthDays}일`}</TableCell>
			<TableCell className="whitespace-nowrap text-muted-foreground">
				{item.lastAttendedOn ? formatDate(item.lastAttendedOn) : "기록 없음"}
			</TableCell>
			<TableCell className="whitespace-nowrap text-muted-foreground">
				{item.idleDays === null ? "-" : `${item.idleDays}일`}
			</TableCell>
			<TableCell className="whitespace-nowrap font-medium">
				{formatPoints(item.pointBalance)}
			</TableCell>
			<TableCell onClick={(event) => event.stopPropagation()}>
				<Button onClick={onAdjust} size="sm" type="button" variant="outline">
					지급·차감
				</Button>
			</TableCell>
		</TableRow>
	);
}

export default function ModeratorAttendancePage() {
	const router = useRouter();
	const [search, setSearch] = useState("");
	const [roleFilter, setRoleFilter] = useState("all");
	const [sort, setSort] = useState<SortKey>("recent");
	const [page, setPage] = useState(1);
	const [adjusting, setAdjusting] = useState<AttendanceRow | null>(null);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [bulkOpen, setBulkOpen] = useState(false);
	const [bulkPending, setBulkPending] = useState(false);
	const debouncedSearch = useDebouncedValue(search);
	const queryClient = useQueryClient();

	const listQuery = useQuery(
		orpc.bambi.attendance.adminList.queryOptions({
			input: {
				cursor: (page - 1) * PAGE_SIZE,
				limit: PAGE_SIZE,
				role:
					roleFilter === "all"
						? undefined
						: (roleFilter as "employer" | "job_seeker"),
				search: debouncedSearch.trim() || undefined,
				sort,
			},
		})
	);

	const adjustMutation = useMutation(
		orpc.bambi.attendance.adminAdjustPoints.mutationOptions({
			onError: (error) => toast(error.message || "포인트를 조정하지 못했어요."),
			onSuccess: async (result) => {
				toast(
					`포인트를 조정했어요. 현재 잔액 ${formatPoints(result.pointBalance)}`
				);
				setAdjusting(null);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.attendance.adminList.key(),
				});
			},
		})
	);

	const items = listQuery.data?.items ?? [];
	const summary = listQuery.data?.summary ?? {
		attendedToday: 0,
		eligibleUsers: 0,
	};
	const totalCount = listQuery.data?.totalCount ?? 0;
	const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

	// 페이지·검색·역할·정렬이 바뀌면 현재 페이지 items가 갈리므로 선택을 비운다(stale userId 방지).
	// biome-ignore lint/correctness/useExhaustiveDependencies: 필터 변화 자체가 초기화 트리거
	useEffect(() => {
		setSelectedIds([]);
	}, [page, debouncedSearch, roleFilter, sort]);

	const allSelected =
		items.length > 0 &&
		items.every((item) => selectedIds.includes(item.userId));
	const toggleAll = () =>
		setSelectedIds(allSelected ? [] : items.map((item) => item.userId));
	const toggleOne = (userId: string) =>
		setSelectedIds((prev) =>
			prev.includes(userId)
				? prev.filter((id) => id !== userId)
				: [...prev, userId]
		);
	const bulkMemberName = bulkMemberLabel(
		items.filter((item) => selectedIds.includes(item.userId))
	);

	const openMember = (userId: string) =>
		router.push(`/moderator/users/${userId}` as Route);

	const runBulkAdjust = async (values: {
		amount: number;
		reason: string;
	}): Promise<void> => {
		setBulkPending(true);
		let ok = 0;
		let fail = 0;
		// 직렬 호출 — 서버 부하·레이트리밋 안전
		for (const userId of selectedIds) {
			try {
				await client.bambi.attendance.adminAdjustPoints({ ...values, userId });
				ok += 1;
			} catch {
				fail += 1;
			}
		}
		setBulkPending(false);
		setBulkOpen(false);
		setSelectedIds([]);
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.attendance.adminList.key(),
		});
		if (fail === 0) {
			toast.success(`${ok}명에게 포인트를 적용했어요.`);
		} else {
			toast.error(`${ok}명 적용, ${fail}명 실패했어요.`);
		}
	};

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">출석 관리</h1>
				<p className="m-0 text-muted-foreground text-sm">
					구직자·업소 회원의 출석 현황과 포인트예요. 검색·역할·정렬 조건은 요약
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
						onChange={(event) => {
							setSearch(event.target.value);
							setPage(1);
						}}
						placeholder="닉네임·아이디 검색"
						value={search}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="attendance-role">역할</Label>
					<Select
						items={ROLE_FILTER_ITEMS}
						onValueChange={(value) => {
							setRoleFilter(String(value));
							setPage(1);
						}}
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

			{selectedIds.length > 0 ? (
				<div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
					<span className="font-medium text-sm">
						{selectedIds.length}명 선택됨
					</span>
					<div className="flex flex-wrap gap-2">
						<Button
							onClick={() => setSelectedIds([])}
							size="sm"
							type="button"
							variant="ghost"
						>
							선택 해제
						</Button>
						<Button onClick={() => setBulkOpen(true)} size="sm" type="button">
							선택 지급·차감
						</Button>
					</div>
				</div>
			) : null}

			{items.length > 0 ? (
				<div className="overflow-x-auto rounded-xl border border-border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10 text-center">
									<div className="flex justify-center">
										<Checkbox
											aria-label="전체 선택"
											checked={allSelected}
											onCheckedChange={toggleAll}
										/>
									</div>
								</TableHead>
								<TableHead>회원</TableHead>
								<TableHead>역할</TableHead>
								<TableHead>등급</TableHead>
								{SORTABLE_COLUMNS.map((column) => (
									<SortHead
										active={sort === column.key}
										key={column.key}
										label={column.label}
										onSelect={() => {
											setSort(column.key);
											setPage(1);
										}}
									/>
								))}
								<TableHead>포인트</TableHead>
								<TableHead>관리</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item) => (
								<MemberRow
									item={item}
									key={item.userId}
									onAdjust={() => setAdjusting(item)}
									onOpen={() => openMember(item.userId)}
									onToggle={() => toggleOne(item.userId)}
									selected={selectedIds.includes(item.userId)}
								/>
							))}
						</TableBody>
					</Table>
				</div>
			) : null}

			{items.length > 0 ? (
				<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
					<span className="text-muted-foreground text-sm">
						전체 {totalCount}명 · {page} / {pageCount} 페이지
					</span>
					<PageControls
						disabled={listQuery.isFetching}
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
					/>
				</div>
			) : null}

			{adjusting ? (
				<MemberPointAdjustDialog
					key={adjusting.userId}
					memberName={adjusting.displayName}
					onOpenChange={(open) => !open && setAdjusting(null)}
					onSubmit={(values) =>
						adjustMutation.mutate({ ...values, userId: adjusting.userId })
					}
					open
					pending={adjustMutation.isPending}
					pointBalance={adjusting.pointBalance}
				/>
			) : null}

			{bulkOpen ? (
				<MemberPointAdjustDialog
					memberName={bulkMemberName}
					onOpenChange={(open) => !open && setBulkOpen(false)}
					onSubmit={runBulkAdjust}
					open
					pending={bulkPending}
				/>
			) : null}
		</div>
	);
}
