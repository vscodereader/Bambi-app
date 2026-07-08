import { Badge } from "@bambi-app/ui/components/badge";
import { buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Separator } from "@bambi-app/ui/components/separator";
import { cn } from "@bambi-app/ui/lib/utils";
import { Check, Megaphone } from "lucide-react";
import Link from "next/link";
import { AdPlacementDiagram } from "@/components/bambi/ad-placement-diagram";
import { PageShell } from "@/components/bambi/page-shell";
import {
	AD_PRODUCTS,
	type AdProduct,
	type AdProductTier,
	formatAdPrice,
} from "@/lib/bambi/ad-products";

// 광고 상품 신청 = 공고 등록 화면으로 이동(밤비엔 별도 광고 결제 흐름이 없음).
const APPLY_HREF = "/employer/new";

// 등급 배지 라벨(백엔드 promotionLabels와 정합).
const TIER_LABEL: Record<AdProductTier, string> = {
	premium: "프리미엄",
	recommended: "추천",
	standard: "일반",
};

function ProductSection({ product }: { product: AdProduct }) {
	// 프리미엄은 카드 테두리로만 살짝 강조(primary 버튼 중복 없이 위계 유지).
	const highlighted = product.tier === "premium";

	return (
		<section aria-label={product.name} className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<Badge className={cn("border-transparent", product.badgeClassName)}>
					{TIER_LABEL[product.tier]}
				</Badge>
				<h2 className="font-semibold text-lg">{product.name}</h2>
				<span className="text-muted-foreground text-sm">{product.tagline}</span>
			</div>
			<Card
				className={cn(highlighted && "border-coral-200 ring-1 ring-coral-100")}
			>
				<CardContent className="flex flex-col gap-5">
					<div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)_auto]">
						{/* 노출 위치 */}
						<div className="flex flex-col gap-2">
							<span className="font-medium text-muted-foreground text-xs">
								노출 위치
							</span>
							<AdPlacementDiagram
								accentClassName={product.diagram.accentClassName}
								highlightRows={product.diagram.highlightRows}
								totalRows={product.diagram.totalRows}
							/>
							<p className="text-muted-foreground text-xs leading-relaxed">
								{product.placementCaption}
							</p>
						</div>
						{/* 서비스 내용 */}
						<div className="flex flex-col gap-2">
							<span className="font-medium text-muted-foreground text-xs">
								서비스 내용
							</span>
							<ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
								{product.benefits.map((benefit) => (
									<li
										className="flex items-start gap-1.5 text-sm"
										key={benefit}
									>
										<Check className="mt-0.5 size-4 shrink-0 text-coral-500" />
										<span className="break-keep">{benefit}</span>
									</li>
								))}
							</ul>
						</div>
						{/* 이용 요금 */}
						<div className="flex flex-col gap-2 lg:w-52">
							<span className="font-medium text-muted-foreground text-xs">
								이용 요금
							</span>
							<ul className="flex flex-col gap-1.5">
								{product.prices.map((price) => (
									<li
										className="flex items-baseline justify-between gap-3"
										key={price.days}
									>
										<span className="text-muted-foreground text-sm">
											{price.days}일
										</span>
										<span className="font-semibold text-base">
											{formatAdPrice(price.amount)}
										</span>
									</li>
								))}
							</ul>
						</div>
					</div>
					{/* 신청 — 카드 맨 하단에 배치해 이용 요금과 분리한다. */}
					<Separator />
					<div className="flex sm:justify-end">
						<Link
							className={cn(
								buttonVariants({ variant: "outline" }),
								"w-full sm:w-52"
							)}
							href={APPLY_HREF}
						>
							신청하기
						</Link>
					</div>
				</CardContent>
			</Card>
		</section>
	);
}

export function EmployerAdGuideScreen() {
	return (
		<PageShell
			description="공고를 더 많은 여성 구직자에게 노출하는 유료 광고 상품을 안내해요."
			title="광고 상품 안내"
		>
			<Card className="border-coral-100 bg-coral-50">
				<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-start gap-3">
						<span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-coral-100 text-coral-600">
							<Megaphone className="size-5" />
						</span>
						<div className="flex flex-col gap-1">
							<h2 className="font-semibold text-base">광고 등록 문의</h2>
							<p className="text-muted-foreground text-sm">
								원하는 광고 상품을 고르면 공고 등록 화면에서 바로 신청할 수
								있어요. 상품 선택이 고민되면 고객센터로 문의해 주세요.
							</p>
						</div>
					</div>
					<Link className={cn(buttonVariants(), "shrink-0")} href={APPLY_HREF}>
						공고 등록하기
					</Link>
				</CardContent>
			</Card>

			<div className="flex flex-col gap-8">
				{AD_PRODUCTS.map((product) => (
					<ProductSection key={product.tier} product={product} />
				))}
			</div>
		</PageShell>
	);
}
