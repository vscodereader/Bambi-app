"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { Card } from "@bambi-app/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const reasonLabel = (reason: string): string => {
	const labels: Record<string, string> = {
		admin_adjustment: "운영자 조정",
		attendance_restore_use: "출석 복구권 사용",
		attendance_streak: "7일 연속 출석 보상",
		draw_use: "포인트 랜덤 뽑기 사용",
		employer_review_retained: "후기 3일 유지 보상",
		point_shop_purchase: "포인트몰 구매",
	};
	return labels[reason] ?? "아이템 변동";
};

export function ItemHistoryCard(): React.JSX.Element {
	const query = useQuery(
		orpc.bambi.pointShop.myItemTransactions.queryOptions({
			input: { cursor: 0, limit: 100 },
		})
	);
	return (
		<Card>
			<Accordion>
				<AccordionItem className="border-0" value="item-history">
					<AccordionTrigger className="px-6 py-5 hover:no-underline">
						아이템 획득·사용 내역
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-5">
						{query.data?.items.length === 0 ? (
							<p className="m-0 text-muted-foreground text-sm">
								아이템 이력이 없어요.
							</p>
						) : null}
						<div className="flex flex-col divide-y divide-border">
							{query.data?.items.map((item) => (
								<div
									className="flex items-center justify-between gap-3 py-3"
									key={item.id}
								>
									<div className="flex flex-col gap-1">
										<span className="font-semibold text-sm">
											{item.description || reasonLabel(item.reason)}
										</span>
										<span className="text-muted-foreground text-xs">
											{formatDateTime(item.createdAt)}
										</span>
									</div>
									<strong
										className={
											item.quantity > 0 ? "text-primary" : "text-foreground"
										}
									>
										{item.quantity > 0 ? "+" : ""}
										{item.quantity}개
									</strong>
								</div>
							))}
						</div>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
		</Card>
	);
}
