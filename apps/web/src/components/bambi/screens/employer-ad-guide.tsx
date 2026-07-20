"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, Megaphone } from "lucide-react";
import Image from "next/image";
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

// 레퍼런스형 표: 광고 위치 · 서비스 내용 · 비용 및 기간 · 신청.
// 상품 1개 = 표의 한 행. 데스크톱은 4열 그리드, 모바일은 세로 스택 카드.
// px 대신 fr 비율로 열 너비를 잡아 반응형·토큰 규칙을 지킨다.
const PRODUCT_ROW_GRID =
	"md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto_auto] md:items-start md:gap-6";

function PlacementSection({ placement }: { placement: AdCatalogPlacement }) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-4">
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

				<Separator />

				{/* 데스크톱 표 헤더 */}
				<div
					className={cn(
						"hidden font-medium text-muted-foreground text-xs",
						PRODUCT_ROW_GRID
					)}
				>
					<span>광고 위치</span>
					<span>서비스 내용</span>
					<span>비용 및 기간</span>
					<span>신청</span>
				</div>

				<div className="flex flex-col gap-3">
					{placement.products.map((product) => (
						<div
							className={cn(
								"flex flex-col gap-3 rounded-lg border border-border p-3 md:border-0 md:p-0",
								PRODUCT_ROW_GRID
							)}
							key={product.id}
						>
							{/* 광고 위치 */}
							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-foreground text-xs md:hidden">
									광고 위치
								</span>
								{product.previewImageUrl ? (
									<div className="flex items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-2">
										<Image
											alt={`${product.name} 게시 위치 미리보기`}
											className="max-h-40 w-auto object-contain"
											height={160}
											src={product.previewImageUrl}
											unoptimized
											width={280}
										/>
									</div>
								) : (
									<div className="flex min-h-16 items-center justify-center rounded-lg border border-border border-dashed bg-muted/30 p-3 text-muted-foreground text-xs">
										미리보기 없음
									</div>
								)}
							</div>

							{/* 서비스 내용 */}
							<div className="flex flex-col gap-1.5">
								<span className="font-bold text-base">{product.name}</span>
								{product.tagline ? (
									<span className="text-muted-foreground text-sm">
										{product.tagline}
									</span>
								) : null}
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
							</div>

							{/* 비용 및 기간 */}
							<div className="flex flex-col gap-1">
								<span className="font-medium text-muted-foreground text-xs md:hidden">
									비용 및 기간
								</span>
								{product.priceOptions.map((option) => (
									<div
										className="flex items-baseline gap-1"
										key={`${product.id}-${option.days}-${option.amount}`}
									>
										<span className="font-bold text-base text-coral-600">
											{formatAdPrice(option.amount)}
										</span>
										<span className="text-muted-foreground text-xs">
											({formatAdDuration(option.days)})
										</span>
									</div>
								))}
							</div>

							{/* 신청 */}
							<Link
								className={cn(
									buttonVariants({ variant: "default" }),
									"no-underline",
									"w-full md:w-auto"
								)}
								href={APPLY_HREF}
							>
								신청하기
							</Link>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
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
