"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Switch } from "@bambi-app/ui/components/switch";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AdPriceTag } from "@/components/bambi/ad-price-tag";
import { EmptyState } from "@/components/bambi/empty-state";
import { formatAdDuration } from "@/lib/bambi/ad-catalog";
import { orpc } from "@/utils/orpc";

// 순서 변경은 위/아래 한 칸 이동으로만 한다(드래그 라이브러리 추가 금지).
// 서버 reorder 프로시저가 "받은 id 배열 순서 = sortOrder 0..n"으로 저장하므로,
// 화면에 보이는 전체 id 배열에서 두 자리만 바꿔 통째로 넘긴다.
const swapAt = (ids: string[], from: number, to: number): null | string[] => {
	const moved = ids[from];
	const target = ids[to];

	if (!(moved && target)) {
		return null;
	}

	const next = [...ids];
	next[from] = target;
	next[to] = moved;

	return next;
};

// 위/아래 이동 버튼 한 쌍. 목록 양 끝에서는 해당 방향 버튼을 비활성화한다.
function ReorderButtons({
	disabled,
	index,
	label,
	onMove,
	total,
}: {
	disabled: boolean;
	index: number;
	label: string;
	onMove: (to: number) => void;
	total: number;
}) {
	return (
		<div className="flex items-center">
			<Button
				aria-label={`${label} 위로 이동`}
				disabled={disabled || index === 0}
				onClick={() => onMove(index - 1)}
				size="icon-sm"
				type="button"
				variant="ghost"
			>
				<ChevronUpIcon />
			</Button>
			<Button
				aria-label={`${label} 아래로 이동`}
				disabled={disabled || index === total - 1}
				onClick={() => onMove(index + 1)}
				size="icon-sm"
				type="button"
				variant="ghost"
			>
				<ChevronDownIcon />
			</Button>
		</div>
	);
}

export default function ModeratorAdProductsPage() {
	const queryClient = useQueryClient();
	const [confirmingId, setConfirmingId] = useState<null | string>(null);
	const [confirmingProductId, setConfirmingProductId] = useState<null | string>(
		null
	);
	const catalogQuery = useQuery(
		orpc.bambi.adProducts.listCatalogAdmin.queryOptions()
	);
	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.adProducts.listCatalogAdmin.queryKey(),
		});

	const togglePlacement = useMutation(
		orpc.bambi.adProducts.updatePlacement.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		})
	);
	const deletePlacement = useMutation(
		orpc.bambi.adProducts.deletePlacement.mutationOptions({
			onSuccess: async () => {
				toast.success("위치를 삭제했어요.");
				setConfirmingId(null);
				await invalidate();
			},
			onError: (error) => toast.error(error.message),
		})
	);
	const toggleProduct = useMutation(
		orpc.bambi.adProducts.updateProduct.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		})
	);
	const deleteProduct = useMutation(
		orpc.bambi.adProducts.deleteProduct.mutationOptions({
			onSuccess: async () => {
				toast.success("상품을 삭제했어요.");
				setConfirmingProductId(null);
				await invalidate();
			},
			onError: (error) => toast.error(error.message),
		})
	);

	const reorderPlacements = useMutation(
		orpc.bambi.adProducts.reorderPlacements.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		})
	);
	const reorderProducts = useMutation(
		orpc.bambi.adProducts.reorderProducts.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		})
	);

	const placements = catalogQuery.data ?? [];
	const isReordering = reorderPlacements.isPending || reorderProducts.isPending;

	const movePlacement = (from: number, to: number) => {
		const ids = swapAt(
			placements.map((placement) => placement.id),
			from,
			to
		);

		if (ids) {
			reorderPlacements.mutate({ ids });
		}
	};

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex items-center justify-between">
				<h1 className="m-0 font-extrabold text-2xl">광고 상품 관리</h1>
				<Link
					className={cn(buttonVariants())}
					href={"/moderator/ad-products/new" as Route}
				>
					위치 추가
				</Link>
			</div>
			{placements.length === 0 ? (
				<EmptyState
					description="노출 위치를 추가하면 그 아래 광고 상품을 등록할 수 있어요."
					title="등록된 광고 위치가 없어요"
				/>
			) : null}
			{placements.map((placement, placementIndex) => (
				<Card key={placement.id}>
					<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
						<CardTitle className="flex items-center gap-2">
							{placement.name}
							<Badge
								variant={placement.kind === "banner" ? "secondary" : "success"}
							>
								{placement.kind === "banner" ? "배너" : "리스팅"}
							</Badge>
						</CardTitle>
						<div className="flex flex-wrap items-center gap-3">
							<ReorderButtons
								disabled={isReordering}
								index={placementIndex}
								label={placement.name}
								onMove={(to) => movePlacement(placementIndex, to)}
								total={placements.length}
							/>
							<Switch
								checked={placement.isActive}
								onCheckedChange={(next) =>
									togglePlacement.mutate({ id: placement.id, isActive: next })
								}
							/>
							<Link
								className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
								href={`/moderator/ad-products/${placement.id}/edit` as Route}
							>
								수정
							</Link>
							{confirmingId === placement.id ? (
								<div className="flex gap-1">
									<Button
										disabled={deletePlacement.isPending}
										onClick={() => deletePlacement.mutate({ id: placement.id })}
										size="sm"
										variant="destructive"
									>
										삭제 확인
									</Button>
									<Button
										onClick={() => setConfirmingId(null)}
										size="sm"
										variant="ghost"
									>
										취소
									</Button>
								</div>
							) : (
								<Button
									onClick={() => setConfirmingId(placement.id)}
									size="sm"
									variant="ghost"
								>
									삭제
								</Button>
							)}
						</div>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{placement.description ? (
							<p className="m-0 text-muted-foreground text-sm">
								{placement.description}
							</p>
						) : null}
						{placement.products.length === 0 ? (
							<p className="m-0 text-muted-foreground text-sm">
								등록된 상품이 없어요.
							</p>
						) : null}
						{placement.products.map((product, productIndex) => (
							<div
								className="flex flex-col gap-1 rounded-lg border border-border p-3"
								key={product.id}
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="font-bold">{product.name}</span>
									<div className="flex flex-wrap items-center gap-2">
										<ReorderButtons
											disabled={isReordering}
											index={productIndex}
											label={product.name}
											onMove={(to) => {
												const ids = swapAt(
													placement.products.map((item) => item.id),
													productIndex,
													to
												);

												if (ids) {
													reorderProducts.mutate({
														ids,
														placementId: placement.id,
													});
												}
											}}
											total={placement.products.length}
										/>
										<Switch
											checked={product.isActive}
											onCheckedChange={(next) =>
												toggleProduct.mutate({
													id: product.id,
													isActive: next,
												})
											}
										/>
										<Link
											className={cn(
												buttonVariants({ size: "sm", variant: "ghost" })
											)}
											href={
												`/moderator/ad-products/${placement.id}/${product.id}/edit` as Route
											}
										>
											수정
										</Link>
										{confirmingProductId === product.id ? (
											<div className="flex gap-1">
												<Button
													disabled={deleteProduct.isPending}
													onClick={() =>
														deleteProduct.mutate({ id: product.id })
													}
													size="sm"
													variant="destructive"
												>
													삭제 확인
												</Button>
												<Button
													onClick={() => setConfirmingProductId(null)}
													size="sm"
													variant="ghost"
												>
													취소
												</Button>
											</div>
										) : (
											<Button
												onClick={() => setConfirmingProductId(product.id)}
												size="sm"
												variant="ghost"
											>
												삭제
											</Button>
										)}
									</div>
								</div>
								<div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-sm">
									{product.priceOptions.map((option) => (
										<span
											className="flex items-baseline gap-1"
											key={`${product.id}-${option.days}-${option.amount}`}
										>
											{formatAdDuration(option.days)} ·{" "}
											<AdPriceTag
												amount={option.amount}
												discountPercent={option.discountPercent ?? 0}
												priceClassName="font-medium text-foreground"
											/>
										</span>
									))}
								</div>
							</div>
						))}
						<Link
							className={cn(
								buttonVariants({ size: "sm", variant: "secondary" })
							)}
							href={`/moderator/ad-products/${placement.id}/new` as Route}
						>
							이 위치에 상품 추가
						</Link>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
