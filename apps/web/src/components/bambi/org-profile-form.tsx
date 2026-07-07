"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FieldError, FormError } from "@/components/bambi/form-message";
import { StatusBadge } from "@/components/bambi/status-badge";
import { verificationStatusLabels } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

interface OrganizationProfileFormValue {
	canManageOrganization: boolean;
	displayName: string;
	organizationId: string;
	role: null | string;
	verificationNote: null | string;
	verificationStatus: string;
}

interface OrgProfileFormProps {
	disabled?: boolean;
	organization: OrganizationProfileFormValue;
}

const getVerificationTone = (
	status: string
): React.ComponentProps<typeof StatusBadge>["tone"] => {
	if (status === "verified") {
		return "good";
	}

	if (status === "pending") {
		return "warning";
	}

	if (status === "rejected") {
		return "danger";
	}

	return "default";
};

const roleLabels: Record<string, string> = {
	manager: "매니저",
	owner: "소유자",
	staff: "스태프",
};

export function OrgProfileForm({
	disabled = false,
	organization,
}: OrgProfileFormProps) {
	const queryClient = useQueryClient();
	const [displayName, setDisplayName] = useState(organization.displayName);
	const [formError, setFormError] = useState<null | string>(null);
	const displayNameError =
		displayName.trim().length === 0 ? "조직 표시 이름을 입력해 주세요." : "";
	const canEdit = organization.canManageOrganization && !disabled;
	const canSubmit = canEdit && !displayNameError;
	const updateMutation = useMutation(
		orpc.bambi.organizations.updateProfile.mutationOptions({
			onError: (error) => {
				const message = error.message || "조직 프로필을 저장하지 못했습니다.";
				setFormError(message);
				toast.error(message);
			},
			onSuccess: async () => {
				setFormError(null);
				toast.success("조직 프로필을 저장했습니다.");
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.organizations.getMine.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.onboarding.getMine.queryKey(),
					}),
				]);
			},
		})
	);

	const submit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!canSubmit) {
			return;
		}

		updateMutation.mutate({
			displayName: displayName.trim(),
			organizationId: organization.organizationId,
		});
	};

	return (
		<form onSubmit={submit}>
			<Card>
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="flex min-w-0 flex-col gap-1">
							<div className="flex flex-wrap items-center gap-2">
								<h3 className="break-words font-medium text-base">
									{organization.displayName}
								</h3>
								<StatusBadge
									tone={getVerificationTone(organization.verificationStatus)}
								>
									{verificationStatusLabels[
										organization.verificationStatus as keyof typeof verificationStatusLabels
									] ?? organization.verificationStatus}
								</StatusBadge>
							</div>
							<p className="text-muted-foreground text-xs">
								내 권한 · {roleLabels[organization.role ?? ""] ?? "권한 없음"}
							</p>
						</div>
						<Button
							disabled={!canSubmit || updateMutation.isPending}
							size="sm"
							type="submit"
						>
							<Save aria-hidden="true" data-icon="inline-start" />
							저장
						</Button>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`${organization.organizationId}-display-name`}>
							조직 표시 이름
						</Label>
						<Input
							aria-invalid={Boolean(displayNameError)}
							disabled={!canEdit}
							id={`${organization.organizationId}-display-name`}
							onChange={(event) => setDisplayName(event.target.value)}
							value={displayName}
						/>
						<FieldError
							id={`${organization.organizationId}-display-name-error`}
							message={displayNameError}
						/>
					</div>

					{organization.verificationNote ? (
						<div className="flex flex-col gap-1">
							<span className="font-medium text-foreground text-xs">
								검수 메모
							</span>
							<p className="break-words text-muted-foreground text-xs">
								{organization.verificationNote}
							</p>
						</div>
					) : null}

					{organization.canManageOrganization ? null : (
						<p className="text-muted-foreground text-xs">
							조직 프로필 수정은 소유자만 할 수 있습니다.
						</p>
					)}

					<FormError message={formError} />
				</CardContent>
			</Card>
		</form>
	);
}
