"use client";

import { JOB_PAY_AMOUNT_MAX } from "@bambi-app/api/services/bambi-job-pay";
import { Input } from "@bambi-app/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";

import { FieldError, FieldLabel } from "@/components/bambi/form-message";
import { PayAmountHint } from "@/components/bambi/pay-amount-hint";
import type { JobFormErrors } from "@/lib/bambi-job-form";
import { NEGOTIABLE_PAY_UNIT, payUnitOptions } from "@/lib/bambi-options";

const selectTriggerClassName = "w-full text-sm data-[size=default]:h-9";

interface JobPayFieldsProps {
	errors?: Pick<JobFormErrors, "payAmount" | "payUnit">;
	// 등록·수정 폼의 updateFormValue를 그대로 받는다.
	onChange: (field: "payAmount" | "payUnit", value: string) => void;
	payAmount: string;
	payUnit: string;
}

// 급여 금액은 단위에 딸려 있다("협의"면 금액 자체가 없다). 등록·수정 폼이 같은
// 컴포넌트를 공유해 두 화면이 어긋나지 않게 한다.
export function JobPayFields({
	errors,
	onChange,
	payAmount,
	payUnit,
}: JobPayFieldsProps) {
	const isNegotiable = payUnit === NEGOTIABLE_PAY_UNIT;

	return (
		<>
			{isNegotiable ? null : (
				<div className="flex flex-col gap-2">
					<FieldLabel htmlFor="payAmount">급여 금액</FieldLabel>
					<Input
						aria-describedby={errors?.payAmount ? "payAmount-error" : undefined}
						aria-invalid={Boolean(errors?.payAmount)}
						id="payAmount"
						inputMode="numeric"
						max={JOB_PAY_AMOUNT_MAX}
						min="1"
						name="payAmount"
						onChange={(event) => onChange("payAmount", event.target.value)}
						placeholder="예: 12000…"
						required
						type="number"
						value={payAmount}
					/>
					<PayAmountHint payAmount={payAmount} payUnit={payUnit} />
					<FieldError id="payAmount-error" message={errors?.payAmount} />
				</div>
			)}
			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="payUnit">급여 단위</FieldLabel>
				<Select
					name="payUnit"
					onValueChange={(value) => onChange("payUnit", value ?? "")}
					required
					value={payUnit}
				>
					<SelectTrigger
						aria-describedby={errors?.payUnit ? "payUnit-error" : undefined}
						aria-invalid={Boolean(errors?.payUnit)}
						className={selectTriggerClassName}
						id="payUnit"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{payUnitOptions.map((option) => (
							<SelectItem key={option} value={option}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<FieldError id="payUnit-error" message={errors?.payUnit} />
				{isNegotiable ? (
					<p className="text-muted-foreground text-xs">
						금액 없이 "면접 후 급여 협의"로 게시됩니다.
					</p>
				) : null}
			</div>
		</>
	);
}
