"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Button } from "@bambi-app/ui/components/button";
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
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { GradeBadge } from "@/components/bambi/grade-badge";
import { MemberPointAdjustDialog } from "@/components/bambi/member-point-adjust-dialog";
import { PageControls } from "@/components/bambi/page-controls";
import { userRoleLabel } from "@/lib/bambi/moderation-labels";
import { client, orpc } from "@/utils/orpc";

const PAGE_SIZE = 10;
const ROLE_ITEMS: Record<string, string> = {
	all: "전체",
	employer: userRoleLabel("employer"),
	job_seeker: userRoleLabel("job_seeker"),
};
type PointMember = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointSettings"]["listAdminMembers"]>
>["items"][number];

function useDebouncedValue(value: string): string {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), 250);
		return () => clearTimeout(timer);
	}, [value]);
	return debounced;
}

export default function ModeratorPointMembersPage(): React.JSX.Element {
	const router = useRouter();
	const [search, setSearch] = useState("");
	const [role, setRole] = useState("all");
	const [page, setPage] = useState(1);
	const [adjusting, setAdjusting] = useState<PointMember | null>(null);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [bulkOpen, setBulkOpen] = useState(false);
	const [bulkPending, setBulkPending] = useState(false);
	const debouncedSearch = useDebouncedValue(search);
	const queryClient = useQueryClient();
	const query = useQuery(
		orpc.bambi.pointSettings.listAdminMembers.queryOptions({
			input: {
				page,
				pageSize: PAGE_SIZE,
				role: role === "all" ? undefined : (role as "employer" | "job_seeker"),
				search: debouncedSearch.trim() || undefined,
			},
		})
	);
	const items = query.data?.items ?? [];
	const totalCount = query.data?.totalCount ?? 0;
	const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
	const adjustMutation = useMutation(
		orpc.bambi.attendance.adminAdjustPoints.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "포인트를 적용하지 못했어요."),
			onSuccess: async (result) => {
				toast.success(
					`포인트를 적용했어요. 현재 잔액 ${result.pointBalance.toLocaleString("ko-KR")}P`
				);
				setAdjusting(null);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.pointSettings.listAdminMembers.key(),
				});
			},
		})
	);
	const openMember = (userId: string) =>
		router.push(`/moderator/points/members/${userId}` as Route);

	// 페이지·검색·역할 필터가 바뀌면 현재 페이지 items가 갈리므로 선택을 비운다(stale userId 방지).
	// biome-ignore lint/correctness/useExhaustiveDependencies: 필터 변화 자체가 초기화 트리거
	useEffect(() => {
		setSelectedIds([]);
	}, [page, debouncedSearch, role]);

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
	const selectedMembers = items.filter((item) =>
		selectedIds.includes(item.userId)
	);
	const bulkMemberName =
		selectedIds.length > 1
			? `${selectedMembers[0]?.name ?? ""} 외 ${selectedIds.length - 1}명`
			: (selectedMembers[0]?.name ?? "");

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
			queryKey: orpc.bambi.pointSettings.listAdminMembers.key(),
		});
		if (fail === 0) {
			toast.success(`${ok}명에게 포인트를 적용했어요.`);
		} else {
			toast.error(`${ok}명 적용, ${fail}명 실패했어요.`);
		}
	};

	return (
		<main className="mx-auto flex w-full flex-col gap-5 px-5 py-6 md:px-6">
			<div>
				<h1 className="m-0 font-extrabold text-2xl">포인트 관리</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					회원별 보유 포인트와 지급·차감·사용 이력을 관리합니다.
				</p>
			</div>
			<div className="flex flex-wrap items-end gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="point-member-search">검색</Label>
					<Input
						className="w-64 max-w-full"
						id="point-member-search"
						onChange={(event) => {
							setSearch(event.target.value);
							setPage(1);
						}}
						placeholder="닉네임·아이디 검색"
						value={search}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="point-member-role">역할</Label>
					<Select
						items={ROLE_ITEMS}
						onValueChange={(value) => {
							setRole(String(value));
							setPage(1);
						}}
						value={role}
					>
						<SelectTrigger className="w-36" id="point-member-role">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(ROLE_ITEMS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{query.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
				</div>
			) : null}
			{query.isError ? (
				<EmptyState
					description="회원 포인트 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}
			{!(query.isPending || query.isError) && items.length === 0 ? (
				<EmptyState
					description="검색 조건에 맞는 회원이 없어요."
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
				<div className="overflow-x-auto rounded-xl border">
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
								<TableHead className="text-center">회원</TableHead>
								<TableHead className="text-center">로그인 아이디</TableHead>
								<TableHead className="text-center">역할</TableHead>
								<TableHead className="text-center">등급</TableHead>
								<TableHead className="text-center">포인트</TableHead>
								<TableHead className="text-center">관리</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item) => (
								<TableRow
									className="cursor-pointer"
									key={item.userId}
									onClick={() => openMember(item.userId)}
								>
									<TableCell
										className="text-center align-middle"
										onClick={(event) => event.stopPropagation()}
									>
										<div className="flex justify-center">
											<Checkbox
												aria-label={`${item.name} 선택`}
												checked={selectedIds.includes(item.userId)}
												onCheckedChange={() => toggleOne(item.userId)}
											/>
										</div>
									</TableCell>
									<TableCell className="text-center align-middle">
										<button
											className="w-full text-center font-medium hover:underline"
											onClick={(event) => {
												event.stopPropagation();
												openMember(item.userId);
											}}
											type="button"
										>
											{item.name}
										</button>
									</TableCell>
									<TableCell className="text-center align-middle text-muted-foreground">
										{item.loginId ?? "-"}
									</TableCell>
									<TableCell className="text-center align-middle">
										{userRoleLabel(item.role)}
									</TableCell>
									<TableCell className="text-center align-middle">
										<GradeBadge grade={item.grade} />
									</TableCell>
									<TableCell className="text-center align-middle font-semibold">
										{item.pointBalance.toLocaleString("ko-KR")}P
									</TableCell>
									<TableCell className="text-center align-middle">
										<Button
											onClick={(event) => {
												event.stopPropagation();
												setAdjusting(item);
											}}
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
						disabled={query.isFetching}
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
					/>
				</div>
			) : null}
			{adjusting ? (
				<MemberPointAdjustDialog
					key={adjusting.userId}
					memberName={adjusting.name}
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
		</main>
	);
}
