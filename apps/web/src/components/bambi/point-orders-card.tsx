"use client";

// 밤비 — "포인트 내역" 페이지의 구매 내역 카드. 포인트몰 주문은 운영자가 손으로 이행하므로
// 상태(처리 대기 → 지급 완료 | 취소·환불)와 운영자 메모가 구매자에게 유일한 진행 단서다.
// PointHistoryCard와 같은 Card+Accordion 구조를 따르고, 해시 앵커(#point-orders)로 열린다 —
// 포인트몰 구매 완료 안내가 이 카드로 곧장 딥링크된다. 목록 정렬(최신순)·상태 원값은 서버가
// 정하고, 여기서는 라벨 맵으로만 옮겨 적는다.

import type { AppRouter } from "@bambi-app/api/routers/index";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { Button } from "@bambi-app/ui/components/button";
import { Card } from "@bambi-app/ui/components/card";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import type { InferRouterOutputs } from "@orpc/server";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CancelOrderButton } from "@/components/bambi/point-shop/cancel-order-button";
import { StatusBadge } from "@/components/bambi/status-badge";
import { pointShopBuyerStatusLabel } from "@/lib/bambi/point-shop-labels";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const POINT_ORDERS_VALUE = "point-orders";

// 보유(owned) 중인 끌올·연장은 "내 아이템"(보유함) 카드 소관이라 구매 내역에서 뺀다
// (스펙 §6 카드 역할 분리 — 이중 노출 방지). 사용·취소된 이력은 그대로 남긴다.
const USABLE_BENEFIT_TYPES = new Set<string>([
	"ad_extend",
	"boost_auto_period",
	"boost_manual_count",
	"boost_manual_period",
]);

// 대기는 진행 중(warning), 지급 완료·보유 중은 good. 취소는 포인트가 되돌아온 상태라
// 경고색으로 물들이지 않고 중립으로 두고, 환불 사실은 카드 안 문구로 따로 알린다.
// 사용 완료는 이미 소진된 이력이라 중립으로 둔다.
const STATUS_TONES: Record<string, "default" | "good" | "warning"> = {
	canceled: "default",
	completed: "good",
	owned: "good",
	pending: "warning",
	used: "default",
};

// 서버 응답과의 드리프트를 막으려고 oRPC 추론 출력에서 주문 타입을 파생한다.
type PointShopOrderItem =
	InferRouterOutputs<AppRouter>["bambi"]["pointShop"]["myOrders"][number];

const formatPoints = (value: number): string =>
	`${value.toLocaleString("ko-KR")}P`;

export function PointOrdersCard(): React.JSX.Element {
	const [openValues, setOpenValues] = useState<string[]>([]);
	const query = useQuery(orpc.bambi.pointShop.myOrders.queryOptions());

	useEffect(() => {
		if (window.location.hash === `#${POINT_ORDERS_VALUE}`) {
			setOpenValues([POINT_ORDERS_VALUE]);
			document
				.getElementById(POINT_ORDERS_VALUE)
				?.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, []);

	const orders = (query.data ?? []).filter(
		(order) =>
			!(order.status === "owned" && USABLE_BENEFIT_TYPES.has(order.benefitType))
	);

	return (
		<Card id={POINT_ORDERS_VALUE}>
			<Accordion multiple onValueChange={setOpenValues} value={openValues}>
				<AccordionItem className="border-0" value={POINT_ORDERS_VALUE}>
					<AccordionTrigger className="px-6 py-5 hover:no-underline">
						<span className="flex flex-col items-start gap-1">
							<span className="font-semibold text-base">구매 내역</span>
							{query.isLoading ? (
								<Skeleton className="h-5 w-40" />
							) : (
								<span className="text-muted-foreground text-sm">
									포인트몰에서 신청한 아이템 {orders.length}건
								</span>
							)}
						</span>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-5">
						{query.isError ? (
							<div className="flex flex-col items-start gap-3 rounded-lg bg-secondary p-4">
								<p className="m-0 text-muted-foreground text-sm">
									구매 내역을 불러오지 못했어요.
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
						{query.isLoading ? <OrderSkeletonList /> : null}
						{query.isLoading || query.isError || orders.length > 0 ? null : (
							<p className="m-0 rounded-lg bg-secondary p-4 text-center text-muted-foreground text-sm">
								아직 구매한 아이템이 없어요.
							</p>
						)}
						{orders.length > 0 ? (
							<div className="flex flex-col gap-3">
								{orders.map((order) => (
									<OrderCard key={order.id} order={order} />
								))}
							</div>
						) : null}
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</Card>
	);
}

function OrderSkeletonList(): React.JSX.Element {
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

function OrderCard({
	order,
}: {
	order: PointShopOrderItem;
}): React.JSX.Element {
	const isCanceled = order.status === "canceled";
	// 지급완료 전(pending)에만 본인 취소·환불이 가능하다(끌올·연장 보유 건 취소는 내 아이템에서).
	const isCancelable = order.status === "pending";
	const isCoupon = order.benefitType === "coupon";

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
						{pointShopBuyerStatusLabel(order.status)}
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

			{/* 쿠폰 발송형은 본인인증 번호로 운영자가 외부 발송한다 — 발송 대상을 미리 알린다. */}
			{isCoupon && !isCanceled ? (
				<p className="m-0 text-muted-foreground text-xs">
					본인인증한 휴대폰 번호로 발송돼요.
				</p>
			) : null}

			{isCanceled ? (
				// 실환급액은 보유 상한 클램프로 가격과 다를 수 있어(§3.6) 목록에서는 정확한
				// 금액을 단정하지 않는다 — 실제 환급 포인트는 포인트 내역 카드에 남는다.
				<p className="m-0 text-muted-foreground text-xs">
					주문이 취소되어 포인트를 돌려드렸어요.
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

			{isCancelable ? (
				<div className="flex justify-end">
					<CancelOrderButton
						itemName={order.itemName}
						orderId={order.id}
						pricePoints={order.pricePoints}
					/>
				</div>
			) : null}
		</div>
	);
}
