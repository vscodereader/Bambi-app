"use client";

// 밤비 — 보유 혜택(끌올·연장) 사용 다이얼로그. "내 아이템" 카드의 "사용하기"에서 열린다.
// 사용 대상 공고를 골라 최종 확인한 뒤 useBenefit을 호출한다. 후보 공고 산출·적격 판정·이중
// 사용 봉쇄는 서버(listUsableJobPosts·useBenefit)가 정본이고, 여기서는 고른 공고 하나를
// 넘긴다. 사용은 되돌릴 수 없어 확인 문구로 분명히 알린다.

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@bambi-app/ui/components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";

const HANGUL_CHAR = /[가-힣]/;

// 서버가 명시적으로 던진 한국어 문구만 살리고 나머지는 한국어 폴백으로 덮는다(구매 화면 관례).
const localizedUseError = (message: string | undefined): string =>
	message && HANGUL_CHAR.test(message)
		? message
		: "사용하지 못했어요. 잠시 후 다시 시도해 주세요.";

export function UseBenefitDialog({
	itemName,
	onDone,
	orderId,
}: {
	itemName: string;
	onDone?: () => void;
	orderId: string;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [jobPostId, setJobPostId] = useState<null | string>(null);

	// 다이얼로그를 열 때만 후보 공고를 조회한다(닫힌 상태로 매번 부르지 않는다).
	const candidatesQuery = useQuery({
		...orpc.bambi.pointShop.listUsableJobPosts.queryOptions({
			input: { orderId },
		}),
		enabled: open,
	});
	const candidates = candidatesQuery.data ?? [];
	const selectItems = candidates.map((post) => ({
		label: post.title,
		value: post.id,
	}));

	const useBenefit = useMutation(
		orpc.bambi.pointShop.useBenefit.mutationOptions({
			onError: (error) => toast.error(localizedUseError(error.message)),
			onSuccess: async () => {
				toast.success("혜택을 사용했어요.");
				setOpen(false);
				setJobPostId(null);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.pointShop.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.attendance.getMine.key(),
					}),
				]);
				onDone?.();
			},
		})
	);

	return (
		<Dialog
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					setJobPostId(null);
				}
			}}
			open={open}
		>
			<DialogTrigger render={<Button size="sm">사용하기</Button>} />
			<DialogContent>
				<div className="flex flex-col gap-1.5">
					<DialogTitle>혜택 사용</DialogTitle>
					<DialogDescription>
						{itemName} 혜택을 사용할 공고를 선택해 주세요.
					</DialogDescription>
				</div>

				{candidatesQuery.isPending ? (
					<div className="flex flex-col gap-2">
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
					</div>
				) : null}

				{candidatesQuery.isError ? (
					<div className="flex flex-col items-start gap-3 rounded-lg bg-secondary p-4">
						<p className="m-0 text-muted-foreground text-sm">
							공고를 불러오지 못했어요.
						</p>
						<Button
							onClick={() => candidatesQuery.refetch()}
							size="sm"
							type="button"
							variant="outline"
						>
							다시 시도
						</Button>
					</div>
				) : null}

				{candidatesQuery.isSuccess && candidates.length === 0 ? (
					<p className="m-0 rounded-lg bg-secondary p-4 text-center text-muted-foreground text-sm">
						사용할 수 있는 공고가 없어요. 게시 중인 유료 공고에만 쓸 수 있어요.
					</p>
				) : null}

				{candidatesQuery.isSuccess && candidates.length > 0 ? (
					<div className="flex flex-col gap-3">
						<Select
							items={selectItems}
							onValueChange={(value) =>
								setJobPostId((value ?? null) as null | string)
							}
							value={jobPostId}
						>
							<SelectTrigger aria-label="사용할 공고" className="w-full">
								<SelectValue placeholder="공고를 선택하세요" />
							</SelectTrigger>
							<SelectContent>
								{candidates.map((post) => (
									<SelectItem key={post.id} value={post.id}>
										{post.title}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{jobPostId ? (
							<Alert variant="warning">
								<TriangleAlert />
								<AlertDescription>
									사용하면 되돌릴 수 없어요. 선택한 공고에 바로 적용돼요.
								</AlertDescription>
							</Alert>
						) : null}
					</div>
				) : null}

				<div className="flex justify-end gap-2">
					<Button
						onClick={() => setOpen(false)}
						type="button"
						variant="outline"
					>
						닫기
					</Button>
					<Button
						disabled={jobPostId === null || useBenefit.isPending}
						onClick={() => {
							if (jobPostId !== null) {
								useBenefit.mutate({ jobPostId, orderId });
							}
						}}
						type="button"
					>
						{useBenefit.isPending ? "사용 중…" : "이 공고에 사용하기"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
