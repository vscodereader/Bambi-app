"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, ChevronRightIcon, UserRoundIcon } from "lucide-react";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { PageControls } from "@/components/bambi/page-controls";
import {
	accountStatusLabel,
	userRoleLabel,
} from "@/lib/bambi/moderation-labels";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 10;
const AMOUNT_MAX = 100_000;
const REASON_MAX = 200;
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
	day: "2-digit",
	month: "2-digit",
	timeZone: "Asia/Seoul",
	year: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Asia/Seoul",
});

function formatDate(value: Date | string): string {
	const parts = dateFormatter.formatToParts(new Date(value));
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? "";
	return `${get("year")}.${get("month")}.${get("day")}`;
}

function PointAdjustmentDialog({
	mode,
	onClose,
	onSubmit,
	pending,
}: {
	mode: "deduct" | "grant";
	onClose: () => void;
	onSubmit: (amount: number, reason: string) => void;
	pending: boolean;
}): React.JSX.Element {
	const [amount, setAmount] = useState("");
	const [reason, setReason] = useState("");
	const parsed = Number(amount);
	const validAmount =
		Number.isInteger(parsed) && parsed > 0 && parsed <= AMOUNT_MAX;
	const canSubmit = validAmount && reason.trim().length > 0 && !pending;
	const label = mode === "grant" ? "지급" : "차감";

	return (
		<>
			<div className="flex flex-col gap-2">
				<DialogTitle>포인트 {label}</DialogTitle>
				<DialogDescription>
					적용할 포인트와 기록에 남길 사유를 입력해 주세요.
				</DialogDescription>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="member-point-amount">포인트</Label>
				<Input
					id="member-point-amount"
					inputMode="numeric"
					max={AMOUNT_MAX}
					min={1}
					onChange={(event) => setAmount(event.target.value)}
					placeholder="예: 400"
					type="number"
					value={amount}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="member-point-reason">{label} 사유</Label>
				<Input
					id="member-point-reason"
					maxLength={REASON_MAX}
					onChange={(event) => setReason(event.target.value)}
					placeholder={`예: ${mode === "grant" ? "이벤트 보상" : "오지급 회수"}`}
					value={reason}
				/>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<Button onClick={onClose} type="button" variant="outline">
					취소
				</Button>
				<Button
					disabled={!canSubmit}
					onClick={() =>
						onSubmit(mode === "grant" ? parsed : -parsed, reason.trim())
					}
					type="button"
				>
					{pending ? "처리 중" : "확인"}
				</Button>
			</div>
		</>
	);
}

export default function ModeratorPointMemberDetailPage(): React.JSX.Element {
	const { id } = useParams<{ id: string }>();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [page, setPage] = useState(1);
	const [adjustMode, setAdjustMode] = useState<"deduct" | "grant" | null>(null);
	const memberQuery = useQuery(
		orpc.bambi.pointSettings.getAdminMember.queryOptions({
			input: { userId: id },
		})
	);
	const historyQuery = useQuery(
		orpc.bambi.pointSettings.listAdminMemberHistory.queryOptions({
			input: { page, pageSize: PAGE_SIZE, userId: id },
		})
	);
	const adjustMutation = useMutation(
		orpc.bambi.attendance.adminAdjustPoints.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "포인트를 적용하지 못했어요."),
			onSuccess: async (result) => {
				toast.success(
					`포인트를 적용했어요. 현재 잔액 ${result.pointBalance.toLocaleString("ko-KR")}P`
				);
				setAdjustMode(null);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.pointSettings.getAdminMember.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.pointSettings.listAdminMemberHistory.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.pointSettings.listAdminMembers.key(),
					}),
				]);
			},
		})
	);
	const member = memberQuery.data;
	const history = historyQuery.data?.items ?? [];
	const totalCount = historyQuery.data?.totalCount ?? 0;
	const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

	if (memberQuery.isPending) {
		return <Skeleton className="m-6 h-96 rounded-xl" />;
	}
	if (memberQuery.isError || !member) {
		return (
			<EmptyState
				description="회원 포인트 정보를 불러오지 못했어요."
				title="사용자를 찾을 수 없어요"
			/>
		);
	}

	return (
		<main className="mx-auto flex w-full flex-col gap-6 px-5 py-6 md:px-6">
			<Button
				className="self-start"
				onClick={() => router.push("/moderator/points/members" as Route)}
				type="button"
				variant="ghost"
			>
				<ArrowLeftIcon /> 목록으로
			</Button>

			<section className="flex flex-col items-center gap-2 text-center">
				<span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
					<UserRoundIcon className="size-8" />
				</span>
				<h1 className="m-0 font-extrabold text-2xl">{member.name}</h1>
				<p className="m-0 text-muted-foreground text-sm">
					{userRoleLabel(member.role)} · 가입 {formatDate(member.createdAt)}
				</p>
				<Badge variant={member.status === "active" ? "success" : "warning"}>
					{accountStatusLabel(member.status)}
				</Badge>
				<p className="m-0 font-extrabold text-primary text-xl">
					{member.pointBalance.toLocaleString("ko-KR")}P
				</p>
			</section>

			<Card>
				<Accordion multiple>
					<AccordionItem className="border-0" value="usage">
						<AccordionTrigger className="px-6 py-5 font-bold text-base hover:no-underline">
							포인트 사용 내역 {member.usageCount}건
						</AccordionTrigger>
						<AccordionContent className="px-6 pb-5">
							{member.usageItems.length === 0 ? (
								<p className="m-0 text-muted-foreground text-sm">
									포인트 사용 내역이 없어요.
								</p>
							) : (
								<ul className="m-0 flex list-none flex-col gap-2 p-0">
									{member.usageItems.map((item) => (
										<li
											className="grid grid-cols-[auto_1fr_auto] gap-3 border-b py-3 last:border-0"
											key={item.id}
										>
											<span>{formatDate(item.createdAt)}</span>
											<span>{item.description}</span>
											<strong>
												{Math.abs(item.amount).toLocaleString("ko-KR")}P
											</strong>
										</li>
									))}
								</ul>
							)}
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</Card>

			<section className="flex flex-col gap-3">
				<h2 className="m-0 font-bold text-base">계정 정보</h2>
				<Card>
					<CardContent>
						<dl className="m-0 grid gap-4 md:grid-cols-2">
							<div>
								<dt className="text-muted-foreground text-xs">이메일</dt>
								<dd className="m-0 mt-1 text-sm">{member.email}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">로그인 아이디</dt>
								<dd className="m-0 mt-1 text-sm">{member.loginId ?? "-"}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">휴대폰 인증</dt>
								<dd className="m-0 mt-1 text-sm">
									{member.isPhoneVerified ? "완료" : "미완료"}
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="m-0 font-bold text-base">포인트 이력</h2>
				{historyQuery.isPending ? (
					<Skeleton className="h-40 rounded-xl" />
				) : null}
				{history.length > 0 ? (
					<ul className="m-0 flex list-none flex-col gap-2 p-0">
						{history.map((item) => (
							<li
								className="rounded-[14px] border border-border bg-card p-3"
								key={item.id}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-bold text-[13px] text-foreground">
										{Math.abs(item.amount).toLocaleString("ko-KR")}P{" "}
										{item.amount >= 0 ? "지급" : "차감"}
									</span>
									<span className="whitespace-nowrap text-[11px] text-muted-foreground">
										{dateTimeFormatter.format(new Date(item.createdAt))}
									</span>
								</div>
								<p className="mt-1 mb-0 text-[12.5px] text-[color:var(--text-default)] leading-[1.5]">
									{item.description}
								</p>
								<div className="mt-1 font-semibold text-[12px] text-foreground">
									총 보유 포인트: {item.balanceAfter.toLocaleString("ko-KR")}P
								</div>
								<div className="mt-1 text-[11px] text-muted-foreground">
									처리자 {item.processor}
								</div>
							</li>
						))}
					</ul>
				) : null}
				{!(historyQuery.isPending || historyQuery.isError) &&
				history.length === 0 ? (
					<EmptyState
						description="아직 포인트 변동 기록이 없어요."
						title="포인트 이력이 없어요"
					/>
				) : null}
				{totalCount > 0 ? (
					<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
						<span className="text-muted-foreground text-sm">
							전체 {totalCount}건 · {page} / {pageCount} 페이지
						</span>
						<PageControls
							disabled={historyQuery.isFetching}
							onPageChange={setPage}
							page={page}
							pageCount={pageCount}
						/>
					</div>
				) : null}
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="m-0 font-bold text-base">포인트 적용</h2>
				<div className="flex flex-col gap-2.5">
					<button
						className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[color:var(--border-default)] bg-card p-[14px] text-left"
						onClick={() => setAdjustMode("grant")}
						type="button"
					>
						<span className="flex-1">
							<span className="block font-extrabold text-[14.5px] text-[color:var(--status-pending-fg)]">
								포인트 지급
							</span>
							<span className="mt-0.5 block text-[12px] text-muted-foreground">
								회원에게 포인트를 지급하고 사유를 기록해요
							</span>
						</span>
						<ChevronRightIcon className="size-[18px] text-[color:var(--text-subtle)]" />
					</button>
					<button
						className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[color:var(--border-default)] bg-card p-[14px] text-left"
						onClick={() => setAdjustMode("deduct")}
						type="button"
					>
						<span className="flex-1">
							<span className="block font-extrabold text-[14.5px] text-[color:var(--red-600)]">
								포인트 차감
							</span>
							<span className="mt-0.5 block text-[12px] text-muted-foreground">
								회원의 보유 포인트에서 차감하고 사유를 기록해요
							</span>
						</span>
						<ChevronRightIcon className="size-[18px] text-[color:var(--red-500)]" />
					</button>
				</div>
			</section>

			<Dialog
				onOpenChange={(open) => !open && setAdjustMode(null)}
				open={adjustMode !== null}
			>
				<DialogContent>
					{adjustMode ? (
						<PointAdjustmentDialog
							key={adjustMode}
							mode={adjustMode}
							onClose={() => setAdjustMode(null)}
							onSubmit={(amount, reason) =>
								adjustMutation.mutate({ amount, reason, userId: id })
							}
							pending={adjustMutation.isPending}
						/>
					) : null}
				</DialogContent>
			</Dialog>
		</main>
	);
}
