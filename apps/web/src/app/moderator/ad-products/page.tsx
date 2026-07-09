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
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { formatAdDuration, formatAdPrice } from "@/lib/bambi/ad-catalog";
import { orpc } from "@/utils/orpc";

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

	const placements = catalogQuery.data ?? [];

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-6">
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
			{placements.map((placement) => (
				<Card key={placement.id}>
					<CardHeader className="flex flex-row items-center justify-between gap-3">
						<CardTitle className="flex items-center gap-2">
							{placement.name}
							<Badge
								variant={placement.kind === "banner" ? "secondary" : "success"}
							>
								{placement.kind === "banner" ? "배너" : "리스팅"}
							</Badge>
						</CardTitle>
						<div className="flex items-center gap-3">
							<Switch
								checked={placement.isActive}
								onCheckedChange={(next) =>
									togglePlacement.mutate({ id: placement.id, isActive: next })
								}
							/>
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
						{placement.products.map((product) => (
							<div
								className="flex flex-col gap-1 rounded-lg border border-border p-3"
								key={product.id}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-bold">{product.name}</span>
									<div className="flex items-center gap-2">
										<Switch
											checked={product.isActive}
											onCheckedChange={(next) =>
												toggleProduct.mutate({
													id: product.id,
													isActive: next,
												})
											}
										/>
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
								<div className="flex flex-wrap gap-2 text-muted-foreground text-sm">
									{product.priceOptions.map((option) => (
										<span key={`${product.id}-${option.days}-${option.amount}`}>
											{formatAdDuration(option.days)} ·{" "}
											{formatAdPrice(option.amount)}
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
