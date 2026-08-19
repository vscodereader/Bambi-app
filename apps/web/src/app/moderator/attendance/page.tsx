"use client";

// 밤비 — 운영자 출석 관리. 사용자별 총 출석일·이번 달·마지막 출석일·미출석 경과일을
// 서버 집계(attendance.adminList)로 받아 표로 보여준다. 검색·역할 필터·정렬·페이지네이션이
// 전부 서버 입력이며 10개 단위 페이지로 조회한다.
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
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
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { PageControls } from "@/components/bambi/page-controls";
import { userRoleLabel } from "@/lib/bambi/moderation-labels";
import { formatDate } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

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

// 서버 adminAdjustPointsInput과 같은 상한이다 — 왕복 전에 막아 준다.
const AMOUNT_MAX = 100_000;
const REASON_MAX = 200;

const formatPoints = (points: number) => `${points.toLocaleString("ko-KR")}P`;

// 지급·차감 폼. 양은 항상 양수로 받고 방향은 토글이 정한다 — 음수 입력을 허용하면
// "차감"에 -100을 넣어 되레 지급되는 부호 뒤집힘이 난다. 대상마다 새로 마운트된다(key).
function PointAdjustForm({
	isPending,
	onClose,
	onSubmit,
	row,
}: {
	isPending: boolean;
	onClose: () => void;
	onSubmit: (values: { amount: number; reason: string }) => void;
	row: AttendanceRow;
}) {
	const [direction, setDirection] = useState<"deduct" | "grant">("grant");
	const [amount, setAmount] = useState("");
	const [reason, setReason] = useState("");

	const parsedAmount = Number(amount);
	const isAmountValid =
		Number.isInteger(parsedAmount) &&
		parsedAmount > 0 &&
		parsedAmount <= AMOUNT_MAX;
	const canSubmit = isAmountValid && reason.trim().length > 0 && !isPending;

	return (
		<>
			<div className="flex flex-col gap-2">
				<DialogTitle>포인트 지급·차감</DialogTitle>
				<DialogDescription>
					{`${row.displayName} 회원의 현재 잔액은 ${formatPoints(row.pointBalance)}예요. 조정 내역은 사유와 함께 기록됩니다.`}
				</DialogDescription>
			</div>
			<div className="flex flex-col gap-2">
				<ToggleGroup
					aria-label="조정 방향"
					onValueChange={(value) => {
						const next = value.at(-1);
						if (next) {
							setDirection(next as "deduct" | "grant");
						}
					}}
					value={[direction]}
				>
					<ToggleGroupItem value="grant">지급</ToggleGroupItem>
					<ToggleGroupItem value="deduct">차감</ToggleGroupItem>
				</ToggleGroup>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="attendance-points-amount">포인트</Label>
				<Input
					id="attendance-points-amount"
					inputMode="numeric"
					max={AMOUNT_MAX}
					min={1}
					onChange={(event) => setAmount(event.target.value)}
					placeholder="예: 100"
					type="number"
					value={amount}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="attendance-points-reason">사유</Label>
				<Input
					id="attendance-points-reason"
					maxLength={REASON_MAX}
					onChange={(event) => setReason(event.target.value)}
					placeholder="예: 이벤트 당첨 보상"
					value={reason}
				/>
				<p className="m-0 text-muted-foreground text-xs">
					{isAmountValid
						? `조정 후 예상 잔액 ${formatPoints(row.pointBalance + (direction === "deduct" ? -parsedAmount : parsedAmount))}`
						: `1 이상 ${AMOUNT_MAX.toLocaleString("ko-KR")} 이하의 정수를 입력해 주세요.`}
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<Button onClick={onClose} type="button" variant="outline">
					취소
				</Button>
				<Button
					disabled={!canSubmit}
					onClick={() =>
						onSubmit({
							amount: direction === "deduct" ? -parsedAmount : parsedAmount,
							reason: reason.trim(),
						})
					}
					type="button"
				>
					{isPending ? "저장 중" : "적용"}
				</Button>
			</div>
		</>
	);
}

export default function ModeratorAttendancePage() {
	const [search, setSearch] = useState("");
	const [roleFilter, setRoleFilter] = useState("all");
	const [sort, setSort] = useState<SortKey>("recent");
	const [page, setPage] = useState(1);
	const [adjusting, setAdjusting] = useState<AttendanceRow | null>(null);
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
											onClick={() => {
												setSort(column.key);
												setPage(1);
											}}
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
								<TableHead>포인트</TableHead>
								<TableHead>관리</TableHead>
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
									<TableCell className="whitespace-nowrap font-medium">
										{formatPoints(item.pointBalance)}
									</TableCell>
									<TableCell>
										<Button
											onClick={() => setAdjusting(item)}
											size="sm"
											type="button"
											variant="outline"
										>
											지급·차감
										</Button>
									</TableCell>
								</TableRow>
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

			{/* 조정 폼은 목록 밖에 하나만 두고 대상만 갈아끼운다(행마다 Dialog를 두면
			    회원 수만큼 마운트된다 — 게시판 관리 화면과 같은 관례). */}
			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setAdjusting(null);
					}
				}}
				open={adjusting !== null}
			>
				<DialogContent>
					{adjusting ? (
						<PointAdjustForm
							isPending={adjustMutation.isPending}
							key={adjusting.userId}
							onClose={() => setAdjusting(null)}
							onSubmit={(values) =>
								adjustMutation.mutate({ ...values, userId: adjusting.userId })
							}
							row={adjusting}
						/>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
