"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdPlacementForm } from "@/components/bambi/ad-placement-form";
import { orpc } from "@/utils/orpc";

export default function NewAdPlacementPage() {
	const router = useRouter();
	const createPlacement = useMutation(
		orpc.bambi.adProducts.createPlacement.mutationOptions({
			onSuccess: () => {
				toast.success("노출 위치를 만들었어요.");
				router.push("/moderator/ad-products");
			},
			onError: (error) => toast.error(error.message),
		})
	);

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-2xl">노출 위치 추가</h1>
			<AdPlacementForm
				onSubmit={(draft) =>
					createPlacement.mutate({
						name: draft.name,
						description: draft.description || undefined,
						kind: draft.kind,
					})
				}
				pending={createPlacement.isPending}
			/>
		</div>
	);
}
