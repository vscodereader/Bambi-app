"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";

interface AdPriceChangeDialogProps {
	message: null | string;
	onCancel: () => void;
	onConfirm: () => void;
}

export function AdPriceChangeDialog({
	message,
	onCancel,
	onConfirm,
}: AdPriceChangeDialogProps) {
	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					onCancel();
				}
			}}
			open={message !== null}
		>
			<DialogContent>
				<DialogTitle>광고 가격이 변경되었습니다</DialogTitle>
				<DialogDescription>
					{message ?? "최신 가격을 확인한 뒤 다시 진행해 주세요."}
				</DialogDescription>
				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button onClick={onCancel} type="button" variant="outline">
						취소
					</Button>
					<Button onClick={onConfirm} type="button">
						변경된 가격으로 다시 제출
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
