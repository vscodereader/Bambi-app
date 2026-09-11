"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { XIcon } from "lucide-react";

export interface ChatActionConfirmationTarget {
	id: string;
	kind: "contact" | "interview";
}

interface ChatActionConfirmationProps {
	isPending: boolean;
	onClose: () => void;
	onDecision: (confirmed: boolean) => void;
	target: ChatActionConfirmationTarget | null;
}

export function ChatActionConfirmation({
	isPending,
	onClose,
	onDecision,
	target,
}: ChatActionConfirmationProps) {
	const isContact = target?.kind === "contact";

	return (
		<AlertDialog
			onOpenChange={(open) => {
				if (!(open || isPending)) {
					onClose();
				}
			}}
			open={target !== null}
		>
			<AlertDialogContent>
				<div className="flex items-start justify-between gap-3">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{isContact
								? "정말로 연락처를 공개하시겠습니까?"
								: "정말로 면접을 진행하시겠습니까?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{isContact
								? "공개하시면 상대방에게 연락처가 공개됩니다."
								: "면접 수락시 반드시 시간을 준수해주시기 바랍니다."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogCancel
						aria-label="닫기"
						disabled={isPending}
						size="icon"
						variant="ghost"
					>
						<XIcon />
					</AlertDialogCancel>
				</div>
				<AlertDialogFooter>
					{/* 취소는 실제 거절이다. 실패하면 창을 유지하므로 Close가 아닌 Action을 쓴다. */}
					<AlertDialogAction
						disabled={isPending}
						onClick={() => onDecision(false)}
						variant="outline"
					>
						취소
					</AlertDialogAction>
					<AlertDialogAction
						disabled={isPending}
						onClick={() => onDecision(true)}
					>
						확인
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
