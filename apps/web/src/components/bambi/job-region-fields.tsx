"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";

import { FieldError, FieldLabel } from "@/components/bambi/form-message";
import { findRegion, useRegions } from "@/lib/bambi/regions";
import type { JobFormErrors } from "@/lib/bambi-job-form";

const selectTriggerClassName = "w-full text-sm data-[size=default]:h-9";

// 세부지역 미선택 = 시/도 전체. 빈 문자열은 Select 항목 값이 될 수 없어 null 항목으로 낸다.
const ALL_DISTRICTS_LABEL = "지역 전체";

interface JobRegionFieldsProps {
	districtCode: string;
	errors?: Pick<JobFormErrors, "districtCode" | "regionCode">;
	// 등록·수정 폼의 updateFormValue를 그대로 받는다.
	onChange: (field: "districtCode" | "regionCode", value: string) => void;
	regionCode: string;
}

// 시/도와 세부지역은 연동돼야 해서(시/도가 바뀌면 세부지역 리셋) 등록·수정 폼이 같은
// 컴포넌트를 공유한다. 목록은 DB 지역 마스터(regions.list)에서 온다.
export function JobRegionFields({
	districtCode,
	errors,
	onChange,
	regionCode,
}: JobRegionFieldsProps) {
	const { isLoading, regions } = useRegions();
	const selectedRegion = findRegion(regions, regionCode);
	const districts = selectedRegion?.districts ?? [];
	// 목록이 도착하기 전에는 value를 비운다 — 안 그러면 라벨을 못 찾아 트리거에 법정동코드가
	// 그대로 보인다(프리필된 수정 폼).
	const selectedDistrict = districts.find(
		(district) => district.code === districtCode
	);

	return (
		<>
			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="region">지역</FieldLabel>
				<Select
					disabled={isLoading}
					items={regions.map((region) => ({
						label: region.label,
						value: region.code,
					}))}
					name="regionCode"
					onValueChange={(value) => {
						// 이전 세부지역은 다른 시/도의 코드라 반드시 비운다(서버가 소속 불일치를 거부한다).
						onChange("regionCode", value ?? "");
						onChange("districtCode", "");
					}}
					required
					value={selectedRegion?.code ?? null}
				>
					<SelectTrigger
						aria-describedby={errors?.regionCode ? "region-error" : undefined}
						aria-invalid={Boolean(errors?.regionCode)}
						className={selectTriggerClassName}
						id="region"
					>
						<SelectValue
							placeholder={isLoading ? "지역 불러오는 중" : "시/도 선택"}
						/>
					</SelectTrigger>
					<SelectContent>
						{regions.map((region) => (
							<SelectItem key={region.code} value={region.code}>
								{region.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<FieldError id="region-error" message={errors?.regionCode} />
			</div>
			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="district">세부지역</FieldLabel>
				<Select
					disabled={districts.length === 0}
					items={[
						{ label: ALL_DISTRICTS_LABEL, value: null },
						...districts.map((district) => ({
							label: district.name,
							value: district.code,
						})),
					]}
					name="districtCode"
					onValueChange={(value) => onChange("districtCode", value ?? "")}
					value={selectedDistrict?.code ?? null}
				>
					<SelectTrigger
						aria-describedby={
							errors?.districtCode ? "district-error" : undefined
						}
						aria-invalid={Boolean(errors?.districtCode)}
						className={selectTriggerClassName}
						id="district"
					>
						<SelectValue placeholder={ALL_DISTRICTS_LABEL} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={null}>{ALL_DISTRICTS_LABEL}</SelectItem>
						{districts.map((district) => (
							<SelectItem key={district.code} value={district.code}>
								{district.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<FieldError id="district-error" message={errors?.districtCode} />
			</div>
		</>
	);
}
