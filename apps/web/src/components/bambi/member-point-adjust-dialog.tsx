"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useState } from "react";

const AMOUNT_MAX = 100_000;
const REASON_MAX = 200;

export function MemberPointAdjustDialog({
	defaultDirection = "grant",
	lockDirection = false,
	memberName,
	onOpenChange,
	onSubmit,
	open,
	pending,
	pointBalance,
}: {
	defaultDirection?: "deduct" | "grant";
	lockDirection?: boolean;
	memberName: string;
	onOpenChange: (open: boolean) => void;
	onSubmit: (values: { amount: number; reason: string }) => void;
	open: boolean;
	pending: boolean;
	pointBalance?: number;
}): React.JSX.Element {
	const [direction, setDirection] = useState(defaultDirection);
	const [amount, setAmount] = useState("");
	const [reason, setReason] = useState("");
	const parsed = Number(amount);
	const validAmount =
		Number.isInteger(parsed) && parsed > 0 && parsed <= AMOUNT_MAX;
	const canSubmit = validAmount && reason.trim().length > 0 && !pending;
	const label = direction === "grant" ? "지급" : "차감";

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<div className="flex flex-col gap-2">
					<DialogTitle>
						포인트 {lockDirection ? label : "지급·차감"}
					</DialogTitle>
					<DialogDescription>
						{pointBalance === undefined
							? `${memberName} 회원에게 포인트를 지급·차감해요.`
							: `${memberName} 회원의 현재 잔액은 ${pointBalance.toLocaleString("ko-KR")}P예요.`}
					</DialogDescription>
				</div>
				{lockDirection ? null : (
					<ToggleGroup
						aria-label="조정 방향"
						onValueChange={(value) => {
							const next = value.at(-1);
							if (next === "deduct" || next === "grant") {
								setDirection(next);
							}
						}}
						value={[direction]}
					>
						<ToggleGroupItem value="grant">지급</ToggleGroupItem>
						<ToggleGroupItem value="deduct">차감</ToggleGroupItem>
					</ToggleGroup>
				)}
				<div className="flex flex-col gap-2">
					<Label htmlFor="member-point-amount">포인트</Label>
					<Input
						id="member-point-amount"
						inputMode="numeric"
						max={AMOUNT_MAX}
						min={1}
						onChange={(event) => setAmount(event.target.value)}
						placeholder="예: 400"
						type="number"
						value={amount}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="member-point-reason">{label} 사유</Label>
					<Input
						id="member-point-reason"
						maxLength={REASON_MAX}
						onChange={(event) => setReason(event.target.value)}
						placeholder={`예: ${direction === "grant" ? "이벤트 보상" : "오지급 회수"}`}
						value={reason}
					/>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<Button
						onClick={() => onOpenChange(false)}
						type="button"
						variant="outline"
					>
						취소
					</Button>
					<Button
						disabled={!canSubmit}
						onClick={() =>
							onSubmit({
								amount: direction === "grant" ? parsed : -parsed,
								reason: reason.trim(),
							})
						}
						type="button"
					>
						{pending ? "처리 중" : "확인"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
