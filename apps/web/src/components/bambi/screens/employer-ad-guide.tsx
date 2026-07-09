"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, Megaphone } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import {
	type AdCatalogPlacement,
	formatAdDuration,
	formatAdPrice,
} from "@/lib/bambi/ad-catalog";
import { orpc } from "@/utils/orpc";

// 광고 상품 신청 = 공고 등록 화면으로 이동(밤비엔 별도 광고 결제 흐름이 없음).
const APPLY_HREF = "/employer/new";

function PlacementSection({ placement }: { placement: AdCatalogPlacement }) {
	return (
		<section className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					<Badge
						variant={placement.kind === "banner" ? "secondary" : "success"}
					>
						{placement.kind === "banner" ? "배너 광고" : "리스팅 노출"}
					</Badge>
					<h2 className="m-0 font-extrabold text-xl">{placement.name}</h2>
				</div>
				{placement.description ? (
					<p className="m-0 text-muted-foreground text-sm">
						{placement.description}
					</p>
				) : null}
			</div>
			<div className="flex flex-col gap-3">
				{placement.products.map((product) => (
					<Card key={product.id}>
						<CardContent className="flex flex-col gap-3">
							<div className="flex flex-col gap-1">
								<span className="font-extrabold text-lg">{product.name}</span>
								{product.tagline ? (
									<span className="text-muted-foreground text-sm">
										{product.tagline}
									</span>
								) : null}
							</div>
							{product.benefits.length > 0 ? (
								<ul className="m-0 flex flex-col gap-1.5 p-0">
									{product.benefits.map((benefit) => (
										<li
											className="flex items-center gap-2 text-sm"
											key={benefit}
										>
											<span className="inline-flex size-4 text-primary">
												<Check size={16} />
											</span>
											{benefit}
										</li>
									))}
								</ul>
							) : null}
							<Separator />
							<div className="flex flex-wrap gap-2">
								{product.priceOptions.map((option) => (
									<span
										className="rounded-lg bg-secondary px-3 py-1.5 font-bold text-sm"
										key={`${product.id}-${option.days}`}
									>
										{formatAdDuration(option.days)} ·{" "}
										{formatAdPrice(option.amount)}
									</span>
								))}
							</div>
							<Link
								className={cn(
									buttonVariants({ variant: "secondary" }),
									"no-underline"
								)}
								href={APPLY_HREF}
							>
								신청하기
							</Link>
						</CardContent>
					</Card>
				))}
			</div>
		</section>
	);
}

export function EmployerAdGuideScreen() {
	const catalogQuery = useQuery(
		orpc.bambi.adProducts.getCatalog.queryOptions()
	);
	const placements = catalogQuery.data ?? [];

	return (
		<PageShell
			description="원하는 노출 위치와 광고 상품을 확인하고 신청하세요."
			title="광고 상품 안내"
		>
			<Card>
				<CardContent className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<span className="inline-flex size-5 text-primary">
							<Megaphone size={20} />
						</span>
						<span className="font-bold">광고 등록 문의</span>
					</div>
					<Link
						className={cn(
							buttonVariants({ variant: "default" }),
							"no-underline"
						)}
						href={APPLY_HREF}
					>
						공고 등록하기
					</Link>
				</CardContent>
			</Card>

			{catalogQuery.isLoading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-40 w-full rounded-xl" />
					<Skeleton className="h-40 w-full rounded-xl" />
				</div>
			) : null}

			{!catalogQuery.isLoading && placements.length === 0 ? (
				<EmptyState
					description="곧 다양한 광고 상품을 선보일 예정이에요."
					title="준비 중인 광고 상품"
				/>
			) : null}

			{placements.map((placement) => (
				<PlacementSection key={placement.id} placement={placement} />
			))}
		</PageShell>
	);
}
