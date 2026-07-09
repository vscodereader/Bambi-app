"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdPlacementForm } from "@/components/bambi/ad-placement-form";
import { EmptyState } from "@/components/bambi/empty-state";
import { orpc } from "@/utils/orpc";

export default function EditAdPlacementPage() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { placementId } = useParams<{ placementId: string }>();
	const catalogQuery = useQuery(
		orpc.bambi.adProducts.listCatalogAdmin.queryOptions()
	);
	const placement = catalogQuery.data?.find((p) => p.id === placementId);

	const updatePlacement = useMutation(
		orpc.bambi.adProducts.updatePlacement.mutationOptions({
			onSuccess: async () => {
				toast.success("노출 위치를 수정했어요.");
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
			<h1 className="m-0 font-extrabold text-2xl">노출 위치 수정</h1>
			{catalogQuery.isLoading ? (
				<div className="flex flex-col gap-4">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-24 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : null}
			{catalogQuery.isLoading || placement ? null : (
				<EmptyState
					description="이미 삭제되었거나 잘못된 주소일 수 있어요."
					title="노출 위치를 찾을 수 없어요"
				/>
			)}
			{placement ? (
				<AdPlacementForm
					initialValue={{
						name: placement.name,
						description: placement.description ?? "",
						kind: placement.kind,
					}}
					onSubmit={(draft) =>
						updatePlacement.mutate({
							id: placementId,
							name: draft.name,
							description: draft.description.trim() || null,
							kind: draft.kind,
						})
					}
					pending={updatePlacement.isPending}
					submitLabel="수정 저장"
				/>
			) : null}
		</div>
	);
}
