"use client";

// 밤비 — "포인트 내역" 페이지의 "내 아이템"(보유함) 카드. 끌올·연장 혜택을 구매하면 여기
// owned 상태로 담기고, 공고에 사용하거나(UseBenefitDialog) 사용 전 취소·환불할 수 있다.
// 수동·쿠폰형은 이 카드가 아니라 "구매 내역"에 남는다. 사용 기한이 지난 건은 사용·취소가
// 모두 막히므로 만료 배지만 보여준다(취소 가부의 정본은 서버, 여기 표시는 UX 보조).

import type { AppRouter } from "@bambi-app/api/routers/index";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Card } from "@bambi-app/ui/components/card";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import type { InferRouterOutputs } from "@orpc/server";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CancelOrderButton } from "@/components/bambi/point-shop/cancel-order-button";
import { UseBenefitDialog } from "@/components/bambi/point-shop/use-benefit-dialog";
import { StatusBadge } from "@/components/bambi/status-badge";
import { pointShopBenefitTypeLabel } from "@/lib/bambi/point-shop-labels";
import { formatDate } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";
import { AttendanceRestoreDialog } from "./attendance-restore-dialog";

type PointShopOrder =
	InferRouterOutputs<AppRouter>["bambi"]["pointShop"]["myInventory"]["ownedBenefits"][number];

const MY_BENEFITS_VALUE = "my-benefits";

// owned 상태로 담기는 보유·사용형(끌올·연장)만 이 카드에 노출한다(수동·쿠폰은 구매 내역).
const USABLE_BENEFIT_TYPES = new Set<string>([
	"ad_extend",
	"boost_auto_period",
	"boost_manual_count",
	"boost_manual_period",
]);

const isExpired = (usableUntil: Date | string | null): boolean =>
	usableUntil !== null && new Date(usableUntil).getTime() <= Date.now();

export function MyBenefitsCard(): React.JSX.Element {
	const query = useQuery(orpc.bambi.pointShop.myInventory.queryOptions());

	const benefits = (query.data?.ownedBenefits ?? []).filter(
		(order) =>
			order.status === "owned" && USABLE_BENEFIT_TYPES.has(order.benefitType)
	);

	return (
		<Card>
			<Accordion>
				<AccordionItem className="border-0" value={MY_BENEFITS_VALUE}>
					<AccordionTrigger className="px-6 py-5 hover:no-underline">
						<span className="flex flex-col items-start gap-1">
							<span className="font-semibold text-base">내 아이템</span>
							{query.isLoading ? (
								<Skeleton className="h-5 w-40" />
							) : (
								<span className="text-muted-foreground text-sm">
									사용할 수 있는 혜택{" "}
									{benefits.length + (query.data?.quantityItems.length ?? 0)}건
								</span>
							)}
						</span>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-5">
						{query.isError ? (
							<div className="flex flex-col items-start gap-3 rounded-lg bg-secondary p-4">
								<p className="m-0 text-muted-foreground text-sm">
									보유 혜택을 불러오지 못했어요.
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
						{query.isLoading ? <BenefitSkeletonList /> : null}
						{query.data?.quantityItems.map((item) => (
							<div
								className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
								key={item.itemType}
							>
								<div className="flex flex-col gap-1">
									<span className="font-bold text-sm">{item.name}</span>
									<span className="text-muted-foreground text-xs">
										보유 {item.balance.toLocaleString("ko-KR")}개
									</span>
								</div>
								{item.itemType === "draw_ticket" ? (
									<Button
										nativeButton={false}
										render={<Link href="/point-shop/draw" />}
										size="sm"
									>
										사용하기
									</Button>
								) : (
									<AttendanceRestoreDialog />
								)}
							</div>
						))}
						{query.isLoading ||
						query.isError ||
						benefits.length > 0 ||
						(query.data?.quantityItems.length ?? 0) > 0 ? null : (
							<p className="m-0 rounded-lg bg-secondary p-4 text-center text-muted-foreground text-sm">
								보유한 혜택이 없어요. 포인트몰에서 끌어올리기·광고 연장 혜택을
								구매하면 여기에 담겨요.
							</p>
						)}
						{benefits.length > 0 ? (
							<div className="flex flex-col gap-3">
								{benefits.map((order) => (
									<BenefitCard key={order.id} order={order} />
								))}
							</div>
						) : null}
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</Card>
	);
}

function BenefitSkeletonList(): React.JSX.Element {
	const placeholders = ["a", "b"];
	return (
		<div className="flex flex-col gap-3">
			{placeholders.map((key) => (
				<div
					className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4"
					key={key}
				>
					<div className="flex flex-1 flex-col gap-2">
						<Skeleton className="h-5 w-40 rounded-md" />
						<Skeleton className="h-6 w-28 rounded-full" />
					</div>
					<Skeleton className="h-8 w-24 rounded-lg" />
				</div>
			))}
		</div>
	);
}

function BenefitCard({ order }: { order: PointShopOrder }): React.JSX.Element {
	const expired = isExpired(order.usableUntil);

	return (
		<div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col items-start gap-1.5">
					<span className="break-words font-bold text-foreground text-sm">
						{order.itemName}
					</span>
					<Badge variant="secondary">
						{pointShopBenefitTypeLabel(order.benefitType)}
					</Badge>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1.5">
					{expired ? (
						<StatusBadge tone="danger">기한 만료</StatusBadge>
					) : (
						<span className="text-muted-foreground text-xs">
							{order.usableUntil
								? `${formatDate(order.usableUntil)}까지`
								: "무기한"}
						</span>
					)}
				</div>
			</div>
			{expired ? (
				<p className="m-0 text-muted-foreground text-xs">
					사용 기한이 지나 더는 사용하거나 취소할 수 없어요.
				</p>
			) : (
				<div className="flex flex-wrap justify-end gap-2">
					<UseBenefitDialog itemName={order.itemName} orderId={order.id} />
					<CancelOrderButton
						itemName={order.itemName}
						orderId={order.id}
						pricePoints={order.pricePoints}
					/>
				</div>
			)}
		</div>
	);
}
