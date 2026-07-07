import { cn } from "@bambi-app/ui/lib/utils";

import {
	formatPayAmount,
	HOURLY_PAY_UNIT,
	isBelowMinimumHourlyWage,
	MINIMUM_HOURLY_WAGE,
	MINIMUM_HOURLY_WAGE_YEAR,
} from "@/lib/bambi-job-copy";

interface PayAmountHintProps {
	payAmount: string;
	payUnit: string;
}

export function PayAmountHint({ payAmount, payUnit }: PayAmountHintProps) {
	const formattedPay = formatPayAmount(payAmount);
	const isHourly = payUnit === HOURLY_PAY_UNIT;
	const belowMinimum = isBelowMinimumHourlyWage(payAmount, payUnit);
	const minimumWageText = `${MINIMUM_HOURLY_WAGE_YEAR}년 최저시급 ${MINIMUM_HOURLY_WAGE.toLocaleString(
		"ko-KR"
	)}원`;

	if (!(formattedPay || isHourly)) {
		return null;
	}

	return (
		<div className="flex flex-col gap-0.5">
			{formattedPay ? (
				<p className="text-muted-foreground text-xs">{`${payUnit} ${formattedPay}원`}</p>
			) : null}
			{isHourly ? (
				<p
					className={cn(
						"text-xs",
						belowMinimum ? "text-destructive" : "text-muted-foreground"
					)}
				>
					{belowMinimum ? `${minimumWageText}보다 낮아요.` : minimumWageText}
				</p>
			) : null}
		</div>
	);
}
