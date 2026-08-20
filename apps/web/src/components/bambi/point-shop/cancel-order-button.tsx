"use client";

// 밤비 — 포인트몰 주문 취소·환불 버튼. "내 아이템"(보유 끌올·연장)과 "구매 내역"(대기 중
// 수동·쿠폰) 양쪽에서 같은 흐름으로 쓴다. 취소 가능 여부의 정본은 서버(cancelMyOrder)이고
// 여기서는 확인받은 뒤 호출한다. 성공하면 환불이 잔액·목록·내역에 반영되도록 포인트몰과
// 출석(패널 잔액) 쿼리를 함께 갱신한다.

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@bambi-app/ui/components/alert-dialog";
import { Button } from "@bambi-app/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";

const HANGUL_CHAR = /[가-힣]/;

// 서버가 명시적으로 던진 한국어 문구만 살리고 나머지(영어 검증 메시지 등)는 폴백으로 덮는다.
const localizedCancelError = (message: string | undefined): string =>
	message && HANGUL_CHAR.test(message)
		? message
		: "취소하지 못했어요. 잠시 후 다시 시도해 주세요.";

const formatPoints = (value: number): string =>
	`${value.toLocaleString("ko-KR")}P`;

export function CancelOrderButton({
	itemName,
	orderId,
	pricePoints,
}: {
	itemName: string;
	orderId: string;
	pricePoints: number;
}): React.JSX.Element {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const cancel = useMutation(
		orpc.bambi.pointShop.cancelMyOrder.mutationOptions({
			onError: (error) => toast.error(localizedCancelError(error.message)),
			onSuccess: async (result) => {
				// 실환급액은 보유 상한(max_member_points) 클램프로 가격보다 적거나 0일 수 있다
				// (§3.6 잔여 소멸). 서버가 돌려준 refunded로 실제 돌려준 금액만 안내한다.
				const refunded = result.refunded;
				let message: string;
				if (refunded >= pricePoints) {
					message = `취소했어요. ${formatPoints(refunded)}를 돌려드렸어요.`;
				} else if (refunded > 0) {
					message = `취소했어요. 보유 상한을 넘는 만큼은 소멸돼 ${formatPoints(refunded)}만 돌려드렸어요.`;
				} else {
					message = "취소했어요. 보유 상한에 걸려 환불 포인트는 소멸됐어요.";
				}
				toast.success(message);
				setOpen(false);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.pointShop.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.attendance.getMine.key(),
					}),
				]);
			},
		})
	);

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				render={
					<Button size="sm" variant="outline">
						취소·환불
					</Button>
				}
			/>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>취소·환불</AlertDialogTitle>
					<AlertDialogDescription>
						{itemName} 구매를 취소할까요? {formatPoints(pricePoints)}를
						돌려드려요.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>닫기</AlertDialogCancel>
					<AlertDialogAction
						disabled={cancel.isPending}
						onClick={() => cancel.mutate({ orderId })}
					>
						취소·환불
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
