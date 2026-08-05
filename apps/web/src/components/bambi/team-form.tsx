"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FieldError, FormError } from "@/components/bambi/form-message";
import { findRegion, useRegions } from "@/lib/bambi/regions";
import { orpc } from "@/utils/orpc";

const selectTriggerClassName = "w-full text-sm data-[size=default]:h-9";

// 지역·세부지역 모두 선택 사항이다. 빈 문자열은 Select 항목 값이 될 수 없어 null 항목으로 낸다.
const NO_REGION_LABEL = "선택 안 함";
const ALL_DISTRICTS_LABEL = "지역 전체";

interface TeamFormOrganization {
	displayName: string;
	organizationId: string;
}

interface TeamFormTeam {
	displayName: string;
	districtCode: null | string;
	organizationId: string;
	regionCode: null | string;
	teamId: string;
}

interface TeamFormProps {
	disabled?: boolean;
	onCancel?: () => void;
	organizations: TeamFormOrganization[];
	team?: TeamFormTeam;
}

interface TeamFormActionsProps {
	canSubmit: boolean;
	isEditMode: boolean;
	isPending: boolean;
	onCancel?: () => void;
}

const getTeamFormCopy = (isEditMode: boolean) => ({
	submitLabel: isEditMode ? "저장" : "생성",
	title: isEditMode ? "팀 정보 수정" : "새 팀 만들기",
});

const getTeamFormFieldIds = (isEditMode: boolean) => {
	const prefix = isEditMode ? "edit-team" : "new-team";

	return {
		district: `${prefix}-district`,
		name: `${prefix}-name`,
		nameError: `${prefix}-name-error`,
		organization: `${prefix}-org`,
		organizationError: `${prefix}-org-error`,
		region: `${prefix}-region`,
	};
};

function TeamFormActions({
	canSubmit,
	isEditMode,
	isPending,
	onCancel,
}: TeamFormActionsProps) {
	const copy = getTeamFormCopy(isEditMode);

	return (
		<div className="flex gap-2">
			{onCancel ? (
				<Button onClick={onCancel} size="sm" type="button" variant="outline">
					취소
				</Button>
			) : null}
			<Button disabled={!canSubmit || isPending} size="sm" type="submit">
				<Save aria-hidden="true" data-icon="inline-start" />
				{copy.submitLabel}
			</Button>
		</div>
	);
}

export function TeamForm({
	disabled = false,
	onCancel,
	organizations,
	team,
}: TeamFormProps) {
	const queryClient = useQueryClient();
	const [organizationId, setOrganizationId] = useState(
		team?.organizationId ?? organizations[0]?.organizationId ?? ""
	);
	const [displayName, setDisplayName] = useState(team?.displayName ?? "");
	const [regionCode, setRegionCode] = useState(team?.regionCode ?? "");
	const [districtCode, setDistrictCode] = useState(team?.districtCode ?? "");
	const { isLoading: isRegionsLoading, regions } = useRegions();
	const selectedRegion = findRegion(regions, regionCode);
	const districts = selectedRegion?.districts ?? [];
	// 목록이 도착하기 전에는 value를 비운다 — 라벨을 못 찾으면 트리거에 법정동코드가 보인다.
	const selectedDistrict = districts.find(
		(district) => district.code === districtCode
	);
	const [formError, setFormError] = useState<null | string>(null);
	const [showValidation, setShowValidation] = useState(false);
	const displayNameError =
		displayName.trim().length === 0 ? "팀 이름을 입력해 주세요." : "";
	const organizationError =
		organizationId.trim().length === 0 ? "조직을 선택해 주세요." : "";
	const isEditMode = Boolean(team);
	const canSubmit = !(disabled || displayNameError || organizationError);
	const copy = getTeamFormCopy(isEditMode);
	const fieldIds = getTeamFormFieldIds(isEditMode);

	const invalidateTeamData = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.teams.list.queryKey({
					input: { organizationId },
				}),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.onboarding.getMine.queryKey(),
			}),
		]);
	};
	const createMutation = useMutation(
		orpc.bambi.teams.create.mutationOptions({
			onError: (error) => {
				const message = error.message || "팀을 생성하지 못했습니다.";
				setFormError(message);
				toast.error(message);
			},
			onSuccess: async () => {
				setDisplayName("");
				setRegionCode("");
				setDistrictCode("");
				setFormError(null);
				setShowValidation(false);
				toast.success("팀을 생성했습니다.");
				await invalidateTeamData();
			},
		})
	);
	const updateMutation = useMutation(
		orpc.bambi.teams.update.mutationOptions({
			onError: (error) => {
				const message = error.message || "팀 정보를 저장하지 못했습니다.";
				setFormError(message);
				toast.error(message);
			},
			onSuccess: async () => {
				setFormError(null);
				toast.success("팀 정보를 저장했습니다.");
				await invalidateTeamData();
				onCancel?.();
			},
		})
	);
	const isPending = createMutation.isPending || updateMutation.isPending;

	const submit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!canSubmit) {
			setShowValidation(true);
			return;
		}

		const input = {
			displayName: displayName.trim(),
			// 세부지역만 보내면 서버가 거부한다 — 시/도를 비우면 세부지역도 함께 비운다.
			districtCode: (regionCode && districtCode) || undefined,
			organizationId,
			regionCode: regionCode || undefined,
		};

		if (team) {
			updateMutation.mutate({
				...input,
				teamId: team.teamId,
			});
			return;
		}

		createMutation.mutate(input);
	};

	return (
		<form className="border p-4" onSubmit={submit}>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="font-medium text-base">{copy.title}</h2>
					<p className="mt-1 text-muted-foreground text-xs">
						지점이나 운영 단위별로 공고 권한을 나눌 수 있습니다.
					</p>
				</div>
				<TeamFormActions
					canSubmit={canSubmit}
					isEditMode={isEditMode}
					isPending={isPending}
					onCancel={onCancel}
				/>
			</div>

			<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div className="space-y-1.5">
					<Label htmlFor={fieldIds.organization}>조직</Label>
					<Select
						disabled={isEditMode || disabled}
						items={organizations.map((organization) => ({
							label: organization.displayName,
							value: organization.organizationId,
						}))}
						onValueChange={(value) => setOrganizationId(value ?? "")}
						value={organizationId}
					>
						<SelectTrigger
							aria-describedby={
								showValidation && organizationError
									? fieldIds.organizationError
									: undefined
							}
							aria-invalid={showValidation && Boolean(organizationError)}
							className={selectTriggerClassName}
							id={fieldIds.organization}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{organizations.map((organization) => (
								<SelectItem
									key={organization.organizationId}
									value={organization.organizationId}
								>
									{organization.displayName}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<FieldError
						id={fieldIds.organizationError}
						message={showValidation ? organizationError : ""}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor={fieldIds.name}>팀 이름</Label>
					<Input
						aria-invalid={showValidation && Boolean(displayNameError)}
						disabled={disabled}
						id={fieldIds.name}
						onChange={(event) => setDisplayName(event.target.value)}
						placeholder="강남점"
						value={displayName}
					/>
					<FieldError
						id={fieldIds.nameError}
						message={showValidation ? displayNameError : ""}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={fieldIds.region}>지역</Label>
					<Select
						disabled={disabled || isRegionsLoading}
						items={[
							{ label: NO_REGION_LABEL, value: null },
							...regions.map((region) => ({
								label: region.label,
								value: region.code,
							})),
						]}
						onValueChange={(value) => {
							// 이전 세부지역은 다른 시/도의 코드라 반드시 비운다.
							setRegionCode(value ?? "");
							setDistrictCode("");
						}}
						value={selectedRegion?.code ?? null}
					>
						<SelectTrigger
							className={selectTriggerClassName}
							id={fieldIds.region}
						>
							<SelectValue placeholder={NO_REGION_LABEL} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={null}>{NO_REGION_LABEL}</SelectItem>
							{regions.map((region) => (
								<SelectItem key={region.code} value={region.code}>
									{region.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={fieldIds.district}>세부지역</Label>
					<Select
						disabled={disabled || districts.length === 0}
						items={[
							{ label: ALL_DISTRICTS_LABEL, value: null },
							...districts.map((district) => ({
								label: district.name,
								value: district.code,
							})),
						]}
						onValueChange={(value) => setDistrictCode(value ?? "")}
						value={selectedDistrict?.code ?? null}
					>
						<SelectTrigger
							className={selectTriggerClassName}
							id={fieldIds.district}
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
				</div>
			</div>

			<div className="mt-3">
				<FormError message={formError} />
			</div>
		</form>
	);
}
