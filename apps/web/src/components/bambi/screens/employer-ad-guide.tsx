"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "@bambi-app/ui/components/dialog";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, Megaphone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AdPriceTag } from "@/components/bambi/ad-price-tag";
import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import {
	type AdCatalogPlacement,
	formatAdDuration,
} from "@/lib/bambi/ad-catalog";
import { orpc } from "@/utils/orpc";

// 광고 상품 신청 = 공고 등록 화면으로 이동(밤비엔 별도 광고 결제 흐름이 없음).
const APPLY_HREF = "/employer/new";

// 광고 등록 안내 카드의 경고 문구(금칙어·불량 업소 시 광고 삭제). 포매터가
// JSX 텍스트를 재줄바꿈해도 문자열이 깨지지 않게 상수로 고정한다.
const AD_POLICY_WARNING =
	"광고 상품에 적용할 공고가 금칙어 또는 불량 업소의 경우 수정 중단 및 광고가 삭제됩니다.";

// 레퍼런스형 표: 광고 위치 · 서비스 내용 · 비용 및 기간 · 신청.
// 상품 1개 = 표의 한 행. 데스크톱은 4열 그리드, 모바일은 세로 스택 카드.
// 헤더 행과 각 상품 행은 서로 독립된 grid 컨테이너다. 4개 열을 모두
// minmax(0,_fr) 비율 트랙으로 고정해, 내용 크기와 무관하게 어느 grid에서도
// 동일한 열 폭이 계산되도록 한다(auto 트랙은 grid마다 내용 폭이 달라 헤더와
// 값이 어긋나므로 사용하지 않는다). px 대신 fr 비율로 반응형·토큰 규칙을 지킨다.
const PRODUCT_ROW_GRID =
	"md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] md:items-start md:gap-6";

interface PremiumCapacity {
	capacity: number;
	remaining: number;
}

// 프리미엄 광고(배너) 신청 버튼 위 남은 자리 안내. 만석이면 대기열 등록 안내로 바뀐다.
function PremiumCapacityNote({ capacity }: { capacity: PremiumCapacity }) {
	if (capacity.remaining === 0) {
		return (
			<span className="text-muted-foreground text-xs">
				현재 정원이 가득 찼어요 — 지금 신청하면 대기열에 등록돼요.
			</span>
		);
	}

	return (
		<span className="font-medium text-sm">
			남은 자리 <span className="text-primary">{capacity.remaining}</span>/
			{capacity.capacity}
		</span>
	);
}

// 노출 위치 미리보기. 표 안에서는 max-h-40이라 어디에 뜨는 배너인지 알아보기 어렵다 —
// 눌러서 원본 크기로 확대해 볼 수 있게 한다(모달·백드롭·포커스 트랩은 Dialog가 관리).
function AdPlacementPreview({ alt, src }: { alt: string; src: string }) {
	return (
		<Dialog>
			<DialogTrigger
				aria-label={`${alt} 크게 보기`}
				className="flex cursor-zoom-in items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<Image
					alt={alt}
					className="max-h-40 w-auto object-contain"
					height={160}
					src={src}
					unoptimized
					width={280}
				/>
			</DialogTrigger>
			{/* base의 고정폭(w-[420px])을 풀어야 확대가 의미를 갖는다. 모바일에서는 화면 폭,
			    데스크톱에서는 3xl까지 넓힌다. */}
			<DialogContent className="w-auto max-w-[92vw] md:max-w-3xl">
				<DialogTitle className="text-base">{alt}</DialogTitle>
				<Image
					alt={alt}
					className="h-auto max-h-[70vh] w-full object-contain"
					height={1200}
					src={src}
					unoptimized
					width={1600}
				/>
			</DialogContent>
		</Dialog>
	);
}

function PlacementSection({
	capacity,
	placement,
}: {
	capacity: PremiumCapacity | null;
	placement: AdCatalogPlacement;
}) {
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
									<AdPlacementPreview
										alt={`${product.name} 게시 위치 미리보기`}
										src={product.previewImageUrl}
									/>
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
								{product.manualBoostsPerDay > 0 ? (
									<span className="font-medium text-coral-500 text-sm">
										일일 끌어올리기 {product.manualBoostsPerDay}회 포함
									</span>
								) : null}
								{product.autoBoostsPerDay > 0 ? (
									<span className="font-medium text-coral-500 text-sm">
										일일 자동 끌어올리기 {product.autoBoostsPerDay}회 포함
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
							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-foreground text-xs md:hidden">
									비용 및 기간
								</span>
								{product.priceOptions.map((option) => (
									<div
										className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5"
										key={`${product.id}-${option.days}-${option.amount}`}
									>
										<span className="whitespace-nowrap text-muted-foreground text-xs">
											{formatAdDuration(option.days)}
										</span>
										<AdPriceTag
											amount={option.amount}
											discountPercent={option.discountPercent ?? 0}
											priceClassName="font-bold text-base text-coral-600"
										/>
									</div>
								))}
							</div>

							{/* 신청 */}
							<div className="flex flex-col gap-2">
								{placement.kind === "banner" && capacity ? (
									<PremiumCapacityNote capacity={capacity} />
								) : null}
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
	// 남은 자리는 광고 만료로 자동 +1 될 수 있어 30초마다 갱신한다(창 포커스 시에도 재조회).
	const capacityQuery = useQuery({
		...orpc.bambi.adProducts.premiumCapacity.queryOptions(),
		refetchInterval: 30_000,
	});
	const placements = catalogQuery.data ?? [];
	const capacity = capacityQuery.data ?? null;

	return (
		<PageShell
			description="원하는 노출 위치와 광고 상품을 확인하고 신청하세요."
			title="광고 상품 안내"
		>
			<Card>
				<CardContent className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<span className="inline-flex size-5 text-primary">
							<Megaphone size={20} />
						</span>
						<span className="font-bold">광고 등록 안내</span>
					</div>
					<p className="m-0 text-muted-foreground text-sm">
						저희 서비스는 무통장입금만 가능하며 입금 확인 후에 승인이
						완료됩니다.
					</p>
					<div className="flex flex-col gap-1.5">
						<span className="font-medium text-sm">무통장 입금시</span>
						<ul className="m-0 list-disc pl-5 text-muted-foreground text-sm">
							<li>업무 시간일 경우 30분 이내 승인</li>
							<li>업무 시간이외 일 경우 다음 영업일에 승인</li>
						</ul>
					</div>
					<p className="m-0 text-muted-foreground text-sm">
						끌어올리기(수동·자동)는 스페셜·급구·추천 리스팅 광고에만 제공되며,
						프리미엄 배너 광고에는 제공되지 않습니다.
					</p>
					<p className="m-0 font-medium text-destructive text-sm">
						{AD_POLICY_WARNING}
					</p>
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
				<PlacementSection
					capacity={capacity}
					key={placement.id}
					placement={placement}
				/>
			))}
		</PageShell>
	);
}
