export const JOB_PAYMENT_POINTS_EXCEED_EDITED_TOTAL =
	"변경된 결제금액이 이미 사용한 포인트보다 적습니다. 공고를 취소하여 포인트를 환급받은 뒤 다시 등록해 주세요.";

export function resolveJobPointUseLimit(args: {
	balance: number;
	grossAmount: number;
	maximum: number | null;
	minimum: number | null;
}): { enabled: boolean; maximum: number; minimum: number } {
	const minimum = args.minimum ?? 0;
	const maximum = Math.max(
		0,
		Math.min(args.balance, args.grossAmount, args.maximum ?? args.grossAmount)
	);
	return { enabled: minimum > 0 && maximum >= minimum, maximum, minimum };
}

export function resolveCappedPointRefund(args: {
	balance: number;
	cap: number | null;
	usedAmount: number;
}): { forfeitedAmount: number; refundAmount: number } {
	const room =
		args.cap === null ? args.usedAmount : Math.max(0, args.cap - args.balance);
	const refundAmount = Math.min(args.usedAmount, room);
	return {
		forfeitedAmount: args.usedAmount - refundAmount,
		refundAmount,
	};
}
