"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdProductForm } from "@/components/bambi/ad-product-form";
import { orpc } from "@/utils/orpc";

export default function NewAdProductPage() {
	const router = useRouter();
	const params = useParams<{ placementId: string }>();
	// 위치 유형(배너/리스팅)에 맞는 노출 영역만 고르게 하려면 위치를 알아야 한다.
	// 목록과 같은 카탈로그 쿼리를 재사용해 캐시를 공유한다.
	const catalogQuery = useQuery(
		orpc.bambi.adProducts.listCatalogAdmin.queryOptions()
	);
	const placement = catalogQuery.data?.find((p) => p.id === params.placementId);
	const create = useMutation(
		orpc.bambi.adProducts.createProduct.mutationOptions({
			onSuccess: () => {
				toast.success("광고 상품을 만들었어요.");
				router.push("/moderator/ad-products");
			},
			onError: (error) => toast.error(error.message),
		})
	);

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-2xl">광고 상품 추가</h1>
			<AdProductForm
				onSubmit={(draft) =>
					create.mutate({
						placementId: params.placementId,
						name: draft.name,
						tagline: draft.tagline || undefined,
						benefits: draft.benefits,
						detailDesignPrice: draft.detailDesignPrice,
						discountCampaigns: draft.discountCampaigns,
						priceOptions: draft.priceOptions,
						previewImageUrl: draft.previewImageUrl,
						previewTemplate: draft.previewTemplate,
						manualBoostsPerDay: draft.manualBoostsPerDay,
						autoBoostsPerDay: draft.autoBoostsPerDay,
						manualBoostCooldownMinutes: draft.manualBoostCooldownMinutes,
					})
				}
				pending={create.isPending}
				placementKind={placement?.kind}
			/>
		</div>
	);
}
