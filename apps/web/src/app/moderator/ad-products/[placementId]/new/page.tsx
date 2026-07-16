"use client";

import { useMutation } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdProductForm } from "@/components/bambi/ad-product-form";
import { orpc } from "@/utils/orpc";

export default function NewAdProductPage() {
	const router = useRouter();
	const params = useParams<{ placementId: string }>();
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
						priceOptions: draft.priceOptions,
						previewImageUrl: draft.previewImageUrl,
						previewTemplate: draft.previewTemplate,
						manualBoostsPerDay: draft.manualBoostsPerDay,
					})
				}
				pending={create.isPending}
			/>
		</div>
	);
}
