"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Button } from "@bambi-app/ui/components/button";
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
import { orpc } from "@/utils/orpc";

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
			{items.length > 0 ? (
				<div className="overflow-x-auto rounded-xl border">
					<Table>
						<TableHeader>
							<TableRow className="bg-primary/5 hover:bg-primary/5">
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
		</main>
	);
}
