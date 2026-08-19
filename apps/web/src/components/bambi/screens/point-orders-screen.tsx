"use client";

// 밤비 — 마이페이지 "포인트 구매 내역" 화면. 포인트몰 주문은 운영자가 손으로 이행하므로
// 상태(처리 대기 → 지급 완료 | 취소·환불)와 운영자 메모가 구매자에게 유일한 진행 단서다.
// 목록 정렬(최신순)·상태 원값은 서버가 정하고, 여기서는 라벨 맵으로만 옮겨 적는다.

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/bambi/empty-state";
import { MyPageShell } from "@/components/bambi/my-page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import { pointShopOrderStatusLabel } from "@/lib/bambi/point-shop-labels";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

// 대기는 진행 중(warning), 지급 완료는 good. 취소는 포인트가 되돌아온 상태라 경고색으로
// 물들이지 않고 중립으로 두고, 환불 사실은 카드 안 문구로 따로 알린다.
const STATUS_TONES: Record<string, "default" | "good" | "warning"> = {
	canceled: "default",
	completed: "good",
	pending: "warning",
};

interface PointShopOrderItem {
	createdAt: Date | string;
	id: string;
	itemName: string;
	operatorMemo: null | string;
	pricePoints: number;
	processedAt: Date | string | null;
	status: string;
}

const formatPoints = (value: number): string =>
	`${value.toLocaleString("ko-KR")}P`;

export function PointOrdersScreen() {
	const query = useQuery(orpc.bambi.pointShop.myOrders.queryOptions());
	const orders = query.data ?? [];

	return (
		<MyPageShell title="포인트 구매 내역">
			{query.isLoading ? <OrderSkeletonList /> : null}

			{query.isLoading || orders.length > 0 ? null : (
				<EmptyState
					description="포인트몰에서 아이템을 구매하면 처리 상태가 여기에 표시됩니다."
					title="아직 구매한 아이템이 없어요"
				/>
			)}

			{orders.length > 0 ? (
				<div className="flex flex-col gap-3">
					{orders.map((order) => (
						<OrderCard key={order.id} order={order} />
					))}
				</div>
			) : null}
		</MyPageShell>
	);
}

function OrderSkeletonList() {
	const placeholders = ["a", "b", "c"];
	return (
		<div className="flex flex-col gap-3">
			{placeholders.map((key) => (
				<div
					className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4"
					key={key}
				>
					<div className="flex flex-1 flex-col gap-2">
						<Skeleton className="h-5 w-40 rounded-md" />
						<Skeleton className="h-4 w-32 rounded-md" />
					</div>
					<Skeleton className="h-6 w-16 rounded-full" />
				</div>
			))}
		</div>
	);
}

function OrderCard({ order }: { order: PointShopOrderItem }) {
	const isCanceled = order.status === "canceled";

	return (
		<div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					<span className="break-words font-bold text-foreground text-sm">
						{order.itemName}
					</span>
					<span className="text-muted-foreground text-xs">
						주문 {formatDateTime(order.createdAt)}
						{order.processedAt
							? ` · 처리 ${formatDateTime(order.processedAt)}`
							: null}
					</span>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1.5">
					<StatusBadge tone={STATUS_TONES[order.status] ?? "default"}>
						{pointShopOrderStatusLabel(order.status)}
					</StatusBadge>
					{/* 취소된 주문의 차감액은 이미 되돌아왔으니 취소선으로 무효를 표시한다. */}
					<span
						className={cn(
							"text-sm tabular-nums",
							isCanceled
								? "text-muted-foreground line-through"
								: "font-bold text-foreground"
						)}
					>
						-{formatPoints(order.pricePoints)}
					</span>
				</div>
			</div>

			{isCanceled ? (
				<p className="m-0 text-muted-foreground text-xs">
					주문이 취소되어 {formatPoints(order.pricePoints)}를 돌려드렸어요.
				</p>
			) : null}

			{order.operatorMemo ? (
				<div className="rounded-lg bg-muted/40 p-3 text-sm">
					<strong className="block">운영자 메모</strong>
					<p className="m-0 mt-1 whitespace-pre-wrap break-words text-muted-foreground">
						{order.operatorMemo}
					</p>
				</div>
			) : null}
		</div>
	);
}
