"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdProductForm } from "@/components/bambi/ad-product-form";
import { EmptyState } from "@/components/bambi/empty-state";
import { orpc } from "@/utils/orpc";

export default function EditAdProductPage() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { placementId, productId } = useParams<{
		placementId: string;
		productId: string;
	}>();
	const catalogQuery = useQuery(
		orpc.bambi.adProducts.listCatalogAdmin.queryOptions()
	);
	const placement = catalogQuery.data?.find((p) => p.id === placementId);
	const product = placement?.products.find((item) => item.id === productId);

	const updateProduct = useMutation(
		orpc.bambi.adProducts.updateProduct.mutationOptions({
			onSuccess: async () => {
				toast.success("광고 상품을 수정했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.adProducts.listCatalogAdmin.queryKey(),
				});
				router.push("/moderator/ad-products");
			},
			onError: (error) => toast.error(error.message),
		})
	);

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-2xl">광고 상품 수정</h1>
			{catalogQuery.isLoading ? (
				<div className="flex flex-col gap-4">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-24 w-full" />
				</div>
			) : null}
			{catalogQuery.isLoading || product ? null : (
				<EmptyState
					description="이미 삭제되었거나 잘못된 주소일 수 있어요."
					title="광고 상품을 찾을 수 없어요"
				/>
			)}
			{product ? (
				<AdProductForm
					initialValue={{
						name: product.name,
						tagline: product.tagline ?? "",
						benefits: product.benefits,
						priceOptions: product.priceOptions,
						previewImageUrl: product.previewImageUrl ?? null,
						previewTemplate: product.previewTemplate,
					}}
					onSubmit={(draft) =>
						updateProduct.mutate({
							id: productId,
							name: draft.name,
							tagline: draft.tagline.trim() || null,
							benefits: draft.benefits,
							priceOptions: draft.priceOptions,
							previewImageUrl: draft.previewImageUrl,
							previewTemplate: draft.previewTemplate,
						})
					}
					pending={updateProduct.isPending}
					submitLabel="수정 저장"
				/>
			) : null}
		</div>
	);
}
