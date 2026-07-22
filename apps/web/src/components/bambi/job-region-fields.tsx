"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";

import { FieldError, FieldLabel } from "@/components/bambi/form-message";
import type { JobFormErrors } from "@/lib/bambi-job-form";
import { defaultDistrictForRegion } from "@/lib/bambi-job-form";
import { districtsForRegion, regionOptions } from "@/lib/bambi-options";

const selectTriggerClassName = "w-full text-sm data-[size=default]:h-9";

interface JobRegionFieldsProps {
	district: string;
	errors?: Pick<JobFormErrors, "district" | "region">;
	// 등록·수정 폼의 updateFormValue를 그대로 받는다.
	onChange: (field: "district" | "region", value: string) => void;
	region: string;
}

// 시/도와 세부지역은 연동돼야 해서(시/도가 바뀌면 세부지역 리셋) 등록·수정 폼이 같은
// 컴포넌트를 공유한다.
export function JobRegionFields({
	district,
	errors,
	onChange,
	region,
}: JobRegionFieldsProps) {
	const districts = districtsForRegion(region);

	return (
		<>
			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="region">지역</FieldLabel>
				<Select
					name="region"
					onValueChange={(value) => {
						const next = value ?? "";
						onChange("region", next);
						onChange("district", defaultDistrictForRegion(next));
					}}
					required
					value={region}
				>
					<SelectTrigger
						aria-describedby={errors?.region ? "region-error" : undefined}
						aria-invalid={Boolean(errors?.region)}
						className={selectTriggerClassName}
						id="region"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{regionOptions.map((option) => (
							<SelectItem key={option} value={option}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<FieldError id="region-error" message={errors?.region} />
			</div>
			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="district">세부지역</FieldLabel>
				<Select
					disabled={districts.length === 0}
					name="district"
					onValueChange={(value) => onChange("district", value ?? "")}
					value={district}
				>
					<SelectTrigger
						aria-describedby={errors?.district ? "district-error" : undefined}
						aria-invalid={Boolean(errors?.district)}
						className={selectTriggerClassName}
						id="district"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{districts.map((option) => (
							<SelectItem key={option} value={option}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<FieldError id="district-error" message={errors?.district} />
			</div>
		</>
	);
}
