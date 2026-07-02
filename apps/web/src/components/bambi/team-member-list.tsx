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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/bambi/empty-state";
import { FieldError, FormError } from "@/components/bambi/form-message";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

type OrganizationRole = "manager" | "owner" | "staff";

interface TeamMemberListOrganization {
	canManageOrganization: boolean;
	displayName: string;
	organizationId: string;
}

interface TeamMemberListTeam {
	displayName: string;
	teamId: string;
}

interface TeamMemberListProps {
	organization: TeamMemberListOrganization;
	teams: TeamMemberListTeam[];
}

const selectTriggerClassName = "w-full text-sm data-[size=default]:h-9";

const roleLabels: Record<OrganizationRole, string> = {
	manager: "매니저",
	owner: "소유자",
	staff: "스태프",
};

const statusLabels: Record<string, string> = {
	active: "활성",
	accepted: "수락됨",
	cancelled: "취소",
	expired: "만료",
	pending: "초대 대기",
	rejected: "거절",
};

const getStatusTone = (
	status: string
): React.ComponentProps<typeof StatusBadge>["tone"] => {
	if (status === "active" || status === "accepted") {
		return "good";
	}

	if (status === "pending") {
		return "warning";
	}

	return "default";
};

const getMemberLabel = (member: {
	displayName: null | string;
	email: string;
	invitedEmail: null | string;
}) => member.displayName ?? member.invitedEmail ?? member.email;

export function TeamMemberList({ organization, teams }: TeamMemberListProps) {
	const queryClient = useQueryClient();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<OrganizationRole>("staff");
	const [teamId, setTeamId] = useState(teams[0]?.teamId ?? "");
	const [formError, setFormError] = useState<null | string>(null);
	const [showValidation, setShowValidation] = useState(false);
	const emailError =
		email.trim().length === 0 ? "초대할 이메일을 입력해 주세요." : "";
	const membersQuery = useQuery(
		orpc.bambi.organizations.listMembers.queryOptions({
			input: { organizationId: organization.organizationId },
		})
	);
	const invalidateMembers = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.organizations.listMembers.queryKey({
				input: { organizationId: organization.organizationId },
			}),
		});
	};
	const inviteMutation = useMutation(
		orpc.bambi.teams.inviteMember.mutationOptions({
			onError: (error) => {
				const message = error.message || "멤버 초대를 만들지 못했습니다.";
				setFormError(message);
				toast.error(message);
			},
			onSuccess: async () => {
				setEmail("");
				setRole("staff");
				setFormError(null);
				setShowValidation(false);
				toast.success("멤버 초대를 만들었습니다.");
				await invalidateMembers();
			},
		})
	);
	const setRoleMutation = useMutation(
		orpc.bambi.teams.setMemberRole.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "멤버 권한을 변경하지 못했습니다.");
			},
			onSuccess: async () => {
				toast.success("멤버 권한을 변경했습니다.");
				await invalidateMembers();
			},
		})
	);
	const submitInvite = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (emailError) {
			setShowValidation(true);
			return;
		}

		inviteMutation.mutate({
			email: email.trim(),
			organizationId: organization.organizationId,
			role,
			teamId: teamId || undefined,
		});
	};

	if (membersQuery.isLoading) {
		return <Loader />;
	}

	if (membersQuery.isError) {
		return (
			<EmptyState
				action={
					<Button onClick={() => membersQuery.refetch()} type="button">
						다시 시도
					</Button>
				}
				description="멤버 목록을 불러오지 못했습니다."
				title="멤버 정보를 확인할 수 없습니다"
			/>
		);
	}

	const members = membersQuery.data ?? [];

	return (
		<section aria-labelledby="team-members" className="space-y-4">
			<div>
				<h2 className="font-medium text-base" id="team-members">
					멤버와 초대
				</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					{organization.displayName} 멤버 권한과 팀 초대를 관리합니다.
				</p>
			</div>

			<form className="border p-4" onSubmit={submitInvite}>
				<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_180px_auto] lg:items-end">
					<div className="space-y-1.5">
						<Label htmlFor="invite-email">이메일</Label>
						<Input
							aria-invalid={showValidation && Boolean(emailError)}
							id="invite-email"
							onChange={(event) => setEmail(event.target.value)}
							placeholder="staff@example.com"
							type="email"
							value={email}
						/>
						<FieldError
							id="invite-email-error"
							message={showValidation ? emailError : ""}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="invite-role">권한</Label>
						<Select
							items={roleLabels}
							onValueChange={(value) => setRole(value as OrganizationRole)}
							value={role}
						>
							<SelectTrigger
								className={selectTriggerClassName}
								id="invite-role"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="staff">스태프</SelectItem>
								<SelectItem value="manager">매니저</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="invite-team">팀</Label>
						<Select
							items={[
								{ label: "전체 조직", value: "" },
								...teams.map((team) => ({
									label: team.displayName,
									value: team.teamId,
								})),
							]}
							onValueChange={(value) => setTeamId(value ?? "")}
							value={teamId}
						>
							<SelectTrigger
								className={selectTriggerClassName}
								id="invite-team"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="">전체 조직</SelectItem>
								{teams.map((team) => (
									<SelectItem key={team.teamId} value={team.teamId}>
										{team.displayName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Button disabled={inviteMutation.isPending} type="submit">
						<MailPlus aria-hidden="true" data-icon="inline-start" />
						초대
					</Button>
				</div>
				<div className="mt-3">
					<FormError message={formError} />
				</div>
			</form>

			{members.length > 0 ? (
				<div className="divide-y border">
					{members.map((member) => (
						<div
							className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_150px_150px] md:items-center"
							key={`${member.kind}-${member.id}`}
						>
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="break-words font-medium text-sm">
										{getMemberLabel(member)}
									</h3>
									<StatusBadge tone={getStatusTone(member.status)}>
										{statusLabels[member.status] ?? member.status}
									</StatusBadge>
								</div>
								<p className="mt-1 break-words text-muted-foreground text-xs">
									{member.email} · {formatDateTime(member.createdAt)}
								</p>
							</div>
							<div className="text-sm">
								{roleLabels[member.role as OrganizationRole] ?? member.role}
							</div>
							{organization.canManageOrganization &&
							member.kind === "active" ? (
								<Select
									disabled={setRoleMutation.isPending}
									items={roleLabels}
									onValueChange={(value) =>
										setRoleMutation.mutate({
											memberId: member.id,
											organizationId: organization.organizationId,
											role: value as OrganizationRole,
										})
									}
									value={member.role}
								>
									<SelectTrigger
										aria-label={`${getMemberLabel(member)} 권한 변경`}
										className={selectTriggerClassName}
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="owner">소유자</SelectItem>
										<SelectItem value="manager">매니저</SelectItem>
										<SelectItem value="staff">스태프</SelectItem>
									</SelectContent>
								</Select>
							) : (
								<span className="text-muted-foreground text-xs">
									권한 변경 불가
								</span>
							)}
						</div>
					))}
				</div>
			) : (
				<EmptyState
					description="활성 멤버나 대기 중인 초대가 없습니다."
					title="멤버가 없습니다"
				/>
			)}
		</section>
	);
}
