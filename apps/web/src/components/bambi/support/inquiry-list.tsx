"use client";

// 내 문의 목록. 폭·좌우 패딩은 app/support/layout.tsx가 잡으므로 여기선 세로 레이아웃만 다룬다.

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	INQUIRY_STATUS_LABELS,
	type InquiryStatus,
	SUPPORT_CATEGORY_LABELS,
	SUPPORT_INQUIRY_NEW_PATH,
	supportInquiryPath,
} from "@/lib/bambi/support";
import { orpc } from "@/utils/orpc";

// 답변이 온 문의만 눈에 띄게 한다 — 나머지는 중립 톤으로 둔다.
const STATUS_VARIANT: Record<
	InquiryStatus,
	"outline" | "secondary" | "success"
> = {
	answered: "success",
	closed: "secondary",
	open: "outline",
};

export function InquiryList() {
	const inquiriesQuery = useQuery(
		orpc.bambi.support.listMyInquiries.queryOptions({ input: { page: 1 } })
	);

	const items = inquiriesQuery.data?.items ?? [];

	return (
		<div className="flex flex-col gap-6 py-6">
			<header className="flex items-center justify-between gap-3">
				<h1 className="m-0 font-extrabold text-xl">내 문의 내역</h1>
				<Button render={<Link href={SUPPORT_INQUIRY_NEW_PATH} />} size="sm">
					문의하기
				</Button>
			</header>

			{inquiriesQuery.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-24 w-full" />
					<Skeleton className="h-24 w-full" />
				</div>
			) : null}

			{!inquiriesQuery.isPending && items.length === 0 ? (
				<EmptyState
					description="궁금한 점이 있으면 1:1 문의를 남겨 주세요."
					title="아직 남긴 문의가 없어요"
				/>
			) : null}

			{items.length > 0 ? (
				<ul className="m-0 flex list-none flex-col gap-2 p-0">
					{items.map((item) => (
						<li key={item.id}>
							<Link
								className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
								href={supportInquiryPath(item.id)}
							>
								<Card className="transition-shadow hover:ring-foreground/20">
									<CardContent className="flex min-w-0 flex-col gap-2">
										<div className="flex min-w-0 flex-wrap items-center gap-2">
											<Badge variant="outline">
												{SUPPORT_CATEGORY_LABELS[item.category]}
											</Badge>
											<Badge variant={STATUS_VARIANT[item.inquiryStatus]}>
												{INQUIRY_STATUS_LABELS[item.inquiryStatus]}
											</Badge>
										</div>
										<p className="m-0 truncate font-bold text-foreground text-sm">
											{item.title}
										</p>
										<p className="m-0 text-muted-foreground text-xs">
											{new Date(item.lastMessageAt).toLocaleString("ko-KR")}
										</p>
									</CardContent>
								</Card>
							</Link>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
