"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@bambi-app/ui/components/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@bambi-app/ui/components/dropdown-menu";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@bambi-app/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EllipsisIcon, MailPlus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { FieldError, FormError } from "@/components/bambi/form-message";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import {
	memberStatusLabel,
	ORGANIZATION_ROLE_LABELS,
	organizationRoleLabel,
} from "@/lib/bambi/team-labels";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

type OrganizationRole = "manager" | "owner" | "staff";

// listMembers가 내려주는 멤버/초대 병합 행. 서버 응답 형태를 그대로 따라간다.
type OrganizationMember = Awaited<
	ReturnType<AppRouterClient["bambi"]["organizations"]["listMembers"]>
>[number];

type ConfirmKind = "deleteInvite" | "remove" | "transfer";
interface ConfirmAction {
	kind: ConfirmKind;
	row: OrganizationMember;
}

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
	disabled?: boolean;
	organization: TeamMemberListOrganization;
	teams: TeamMemberListTeam[];
}

const selectTriggerClassName = "w-full text-sm data-[size=default]:h-9";

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

interface EmployerInvitee {
	email: string;
	name: string;
	userId: string;
}

function renderInviteeOptions({
	hasQuery,
	invitees,
	isLoading,
	onSelect,
}: {
	hasQuery: boolean;
	invitees: EmployerInvitee[];
	isLoading: boolean;
	onSelect: (invitee: EmployerInvitee) => void;
}) {
	if (!hasQuery) {
		return <CommandEmpty>구인자 이메일을 입력해 검색하세요.</CommandEmpty>;
	}

	if (isLoading) {
		return <CommandEmpty>검색 중…</CommandEmpty>;
	}

	if (invitees.length === 0) {
		return <CommandEmpty>일치하는 구인자 계정이 없습니다.</CommandEmpty>;
	}

	return (
		<CommandGroup>
			{invitees.map((invitee) => (
				<CommandItem
					key={invitee.userId}
					onSelect={() => onSelect(invitee)}
					value={invitee.email}
				>
					<span className="flex min-w-0 flex-col">
						<span className="truncate font-medium text-sm">{invitee.name}</span>
						<span className="truncate text-muted-foreground text-xs">
							{invitee.email}
						</span>
					</span>
				</CommandItem>
			))}
		</CommandGroup>
	);
}

function MemberTeams({
	role,
	teams,
}: {
	role: string;
	teams: { id: string; name: string }[];
}) {
	if (role === "owner") {
		return <span className="text-muted-foreground text-xs">—</span>;
	}

	if (teams.length === 0) {
		return <span className="text-muted-foreground text-xs">소속 팀 없음</span>;
	}

	return (
		<div className="flex flex-wrap gap-1">
			{teams.map((team) => (
				<Badge key={team.id} variant="secondary">
					{team.name}
				</Badge>
			))}
		</div>
	);
}

const triggerClassName = cn(
	buttonVariants({ size: "icon-sm", variant: "ghost" })
);

// 행 종류·권한에 따라 노출할 액션 드롭다운. 액션이 하나도 없으면 null을 반환해 ⋯ 버튼을
// 그린다(빈 행). 전체 액션 컬럼은 소유자(canManageOrganization)에게만 노출한다.
function MemberRowActions({
	canManage,
	disabled,
	onDeleteInvite,
	onRemove,
	onResubmit,
	onRoleChange,
	onSetTeams,
	onTransfer,
	row,
}: {
	canManage: boolean;
	disabled: boolean;
	onDeleteInvite: () => void;
	onRemove: () => void;
	onResubmit: () => void;
	onRoleChange: (role: OrganizationRole) => void;
	onSetTeams: () => void;
	onTransfer: () => void;
	row: OrganizationMember;
}) {
	const label = getMemberLabel(row);
	let items: React.ReactNode = null;

	if (canManage && row.kind === "active" && row.role !== "owner") {
		items = (
			<>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>권한 변경</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<DropdownMenuRadioGroup
							onValueChange={(value) => onRoleChange(value as OrganizationRole)}
							value={row.role}
						>
							<DropdownMenuRadioItem value="manager">
								매니저
							</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="staff">
								스태프
							</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuItem onClick={onSetTeams}>팀 소속 변경</DropdownMenuItem>
				<DropdownMenuItem onClick={onTransfer}>소유권 이전</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onRemove} variant="destructive">
					내보내기
				</DropdownMenuItem>
			</>
		);
	} else if (
		canManage &&
		row.kind === "invitation" &&
		row.status === "rejected"
	) {
		items = (
			<>
				<DropdownMenuItem onClick={onResubmit}>재제출</DropdownMenuItem>
				<DropdownMenuItem onClick={onDeleteInvite} variant="destructive">
					초대 삭제
				</DropdownMenuItem>
			</>
		);
	}

	if (!items) {
		return null;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={`${label} 관리 메뉴`}
				className={triggerClassName}
				disabled={disabled}
			>
				<EllipsisIcon />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">{items}</DropdownMenuContent>
		</DropdownMenu>
	);
}

// 멤버 테이블 컬럼 정의. 컴포넌트 밖으로 빼 본문 인지 복잡도를 낮춘다. 각 액션은 row를
// 받는 콜백으로 전달받아 셀에서 바인딩한다.
function buildMemberColumns({
	canManage,
	disabled,
	onDeleteInvite,
	onRemove,
	onResubmit,
	onRoleChange,
	onSetTeams,
	onTransfer,
}: {
	canManage: boolean;
	disabled: boolean;
	onDeleteInvite: (row: OrganizationMember) => void;
	onRemove: (row: OrganizationMember) => void;
	onResubmit: (row: OrganizationMember) => void;
	onRoleChange: (row: OrganizationMember, role: OrganizationRole) => void;
	onSetTeams: (row: OrganizationMember) => void;
	onTransfer: (row: OrganizationMember) => void;
}): DataColumn<OrganizationMember>[] {
	return [
		{
			id: "member",
			header: "이름 · 이메일",
			sortValue: (row) => getMemberLabel(row),
			cell: (row) => (
				<div className="min-w-0">
					<p className="break-words font-medium text-sm">
						{getMemberLabel(row)}
					</p>
					<p className="mt-0.5 break-words text-muted-foreground text-xs">
						{row.email}
					</p>
					<p className="mt-0.5 text-muted-foreground text-xs">
						{formatDateTime(row.createdAt)}
					</p>
					{row.kind === "invitation" &&
					row.status === "rejected" &&
					row.rejectionReason ? (
						<p className="mt-1 break-words text-destructive text-xs">
							반려 사유: {row.rejectionReason}
						</p>
					) : null}
				</div>
			),
		},
		{
			id: "status",
			header: "상태",
			sortValue: (row) => memberStatusLabel(row.status),
			cell: (row) => (
				<StatusBadge tone={getStatusTone(row.status)}>
					{memberStatusLabel(row.status)}
				</StatusBadge>
			),
		},
		{
			id: "teams",
			header: "소속 팀",
			cell: (row) => <MemberTeams role={row.role} teams={row.teams} />,
		},
		{
			id: "role",
			header: "권한",
			sortValue: (row) => organizationRoleLabel(row.role),
			cell: (row) => (
				<span className="whitespace-nowrap text-sm">
					{organizationRoleLabel(row.role)}
				</span>
			),
		},
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (row) => (
				<MemberRowActions
					canManage={canManage}
					disabled={disabled}
					onDeleteInvite={() => onDeleteInvite(row)}
					onRemove={() => onRemove(row)}
					onResubmit={() => onResubmit(row)}
					onRoleChange={(value) => onRoleChange(row, value)}
					onSetTeams={() => onSetTeams(row)}
					onTransfer={() => onTransfer(row)}
					row={row}
				/>
			),
		},
	];
}

export function TeamMemberList({
	disabled = false,
	organization,
	teams,
}: TeamMemberListProps) {
	const organizationId = organization.organizationId;
	const queryClient = useQueryClient();
	const [email, setEmail] = useState("");
	const [search, setSearch] = useState("");
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [role, setRole] = useState<OrganizationRole>("staff");
	// 초대 사유는 선택 입력이다 — 운영자 승인 판단을 돕는 참고 정보라서, 필수로 막으면
	// 기존 초대 흐름이 통째로 멈춘다.
	const [inviteReason, setInviteReason] = useState("");
	const [teamId, setTeamId] = useState(teams[0]?.teamId ?? "");
	const [formError, setFormError] = useState<null | string>(null);
	const [showValidation, setShowValidation] = useState(false);
	const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
	const [teamsTarget, setTeamsTarget] = useState<OrganizationMember | null>(
		null
	);
	const emailError =
		email.trim().length === 0 ? "초대할 이메일을 입력해 주세요." : "";
	const inviteesQuery = useQuery(
		orpc.bambi.teams.searchEmployerInvitees.queryOptions({
			enabled: popoverOpen && search.trim().length > 0,
			input: {
				organizationId,
				query: search.trim() || undefined,
			},
		})
	);
	const invitees = inviteesQuery.data ?? [];
	const membersQuery = useQuery(
		orpc.bambi.organizations.listMembers.queryOptions({
			input: { organizationId },
		})
	);
	const invalidateMembers = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.organizations.listMembers.queryKey({
				input: { organizationId },
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
				setSearch("");
				setRole("staff");
				setInviteReason("");
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
	const transferOwnershipMutation = useMutation(
		orpc.bambi.teams.transferOwnership.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "소유권을 이전하지 못했습니다.");
			},
			onSuccess: async () => {
				setConfirm(null);
				toast.success(
					"소유권을 이전했습니다. 회원님은 매니저로 전환되었습니다."
				);
				// 소유권이 넘어가면 요청자의 canManageOrganization도 바뀌므로 조직
				// 정보까지 무효화해 화면 권한 상태를 즉시 갱신한다.
				await Promise.all([
					invalidateMembers(),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.organizations.getMine.queryKey(),
					}),
				]);
			},
		})
	);
	const resubmitMutation = useMutation(
		orpc.bambi.teams.resubmitInvitation.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "초대를 재제출하지 못했습니다.");
			},
			onSuccess: async () => {
				toast.success("초대를 재제출했습니다. 운영자 승인을 기다립니다.");
				await invalidateMembers();
			},
		})
	);
	const deleteMutation = useMutation(
		orpc.bambi.teams.deleteInvitation.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "초대를 삭제하지 못했습니다.");
			},
			onSuccess: async () => {
				setConfirm(null);
				toast.success("반려된 초대를 삭제했습니다.");
				await invalidateMembers();
			},
		})
	);
	const removeMemberMutation = useMutation(
		orpc.bambi.teams.removeMember.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "멤버를 내보내지 못했습니다.");
			},
			onSuccess: async () => {
				setConfirm(null);
				toast.success("멤버를 내보냈습니다.");
				await invalidateMembers();
			},
		})
	);
	const setMemberTeamsMutation = useMutation(
		orpc.bambi.teams.setMemberTeams.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "팀 소속을 변경하지 못했습니다.");
			},
			onSuccess: async () => {
				setTeamsTarget(null);
				toast.success("팀 소속을 변경했습니다.");
				await invalidateMembers();
			},
		})
	);
	const submitInvite = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (disabled) {
			return;
		}

		if (emailError) {
			setShowValidation(true);
			return;
		}

		inviteMutation.mutate({
			email: email.trim(),
			organizationId,
			reason: inviteReason.trim() || undefined,
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

	const columns = buildMemberColumns({
		canManage: organization.canManageOrganization,
		disabled,
		onDeleteInvite: (row) => setConfirm({ kind: "deleteInvite", row }),
		onRemove: (row) => setConfirm({ kind: "remove", row }),
		onResubmit: (row) =>
			resubmitMutation.mutate({ invitationId: row.id, organizationId }),
		onRoleChange: (row, value) =>
			setRoleMutation.mutate({ memberId: row.id, organizationId, role: value }),
		onSetTeams: (row) => setTeamsTarget(row),
		onTransfer: (row) => setConfirm({ kind: "transfer", row }),
	});

	const confirmView = buildConfirmView({
		confirm,
		deletePending: deleteMutation.isPending,
		onDeleteInvite: (row) =>
			deleteMutation.mutate({ invitationId: row.id, organizationId }),
		onRemove: (row) =>
			removeMemberMutation.mutate({ memberId: row.id, organizationId }),
		onTransfer: (row) =>
			transferOwnershipMutation.mutate({ memberId: row.id, organizationId }),
		removePending: removeMemberMutation.isPending,
		transferPending: transferOwnershipMutation.isPending,
	});

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
				<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_180px_auto] lg:items-start">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="invite-email">이메일</Label>
						<Popover onOpenChange={setPopoverOpen} open={popoverOpen}>
							<PopoverTrigger
								nativeButton={false}
								render={
									<Input
										aria-invalid={showValidation && Boolean(emailError)}
										disabled={disabled}
										id="invite-email"
										onChange={(event) => {
											setSearch(event.target.value);
											setEmail(event.target.value);
											setPopoverOpen(true);
										}}
										placeholder="구인자 이메일 검색"
										value={search}
									/>
								}
							/>
							<PopoverContent
								align="start"
								className="w-(--anchor-width) p-0"
								initialFocus={false}
							>
								<Command shouldFilter={false}>
									<CommandList>
										{renderInviteeOptions({
											hasQuery: search.trim().length > 0,
											invitees,
											isLoading: inviteesQuery.isLoading,
											onSelect: (invitee) => {
												setEmail(invitee.email);
												setSearch(invitee.email);
												setPopoverOpen(false);
											},
										})}
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
						<FieldError
							id="invite-email-error"
							message={showValidation ? emailError : ""}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="invite-role">권한</Label>
						<Select
							disabled={disabled}
							items={ORGANIZATION_ROLE_LABELS}
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
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="invite-team">팀</Label>
						<Select
							disabled={disabled}
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
					<div className="flex flex-col gap-1.5">
						<Label
							aria-hidden="true"
							className="hidden select-none lg:block lg:opacity-0"
						>
							초대
						</Label>
						<Button
							className="w-full lg:w-auto"
							disabled={disabled || inviteMutation.isPending}
							type="submit"
						>
							<MailPlus aria-hidden="true" data-icon="inline-start" />
							초대
						</Button>
					</div>
				</div>
				<div className="mt-3 flex flex-col gap-1.5">
					<Label htmlFor="invite-reason">초대 사유(선택)</Label>
					<Input
						disabled={disabled}
						id="invite-reason"
						maxLength={500}
						onChange={(event) => setInviteReason(event.target.value)}
						placeholder="예: 2호점 매니저로 합류 예정"
						value={inviteReason}
					/>
					<p className="m-0 text-muted-foreground text-xs">
						운영자가 팀 합류를 승인할 때 이 사유를 함께 봅니다.
					</p>
				</div>
				<div className="mt-3">
					<FormError message={formError} />
				</div>
			</form>

			{confirmView ? (
				<Alert variant={confirmView.destructive ? "destructive" : "default"}>
					<TriangleAlert />
					<AlertTitle>{confirmView.title}</AlertTitle>
					<AlertDescription>{confirmView.description}</AlertDescription>
					<div className="col-start-2 mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button
							disabled={confirmView.pending}
							onClick={() => setConfirm(null)}
							type="button"
							variant="outline"
						>
							취소
						</Button>
						<Button
							disabled={confirmView.pending}
							onClick={confirmView.onConfirm}
							type="button"
							variant={confirmView.destructive ? "destructive" : "default"}
						>
							{confirmView.pending ? "처리 중…" : confirmView.actionLabel}
						</Button>
					</div>
				</Alert>
			) : null}

			{members.length > 0 ? (
				<Card>
					<CardContent className="overflow-x-auto p-0">
						<DataTable
							columns={columns}
							data={members}
							emptyMessage="활성 멤버나 대기 중인 초대가 없습니다."
							getRowKey={(row) => `${row.kind}-${row.id}`}
						/>
					</CardContent>
				</Card>
			) : (
				<EmptyState
					description="활성 멤버나 대기 중인 초대가 없습니다."
					title="멤버가 없습니다"
				/>
			)}

			{teamsTarget ? (
				<TeamAssignmentDialog
					initialTeamIds={teamsTarget.teams.map((team) => team.id)}
					key={teamsTarget.id}
					memberLabel={getMemberLabel(teamsTarget)}
					onClose={() => setTeamsTarget(null)}
					onSave={(teamIds) =>
						setMemberTeamsMutation.mutate({
							memberId: teamsTarget.id,
							organizationId,
							teamIds,
						})
					}
					pending={setMemberTeamsMutation.isPending}
					teams={teams}
				/>
			) : null}
		</section>
	);
}

// 멤버의 소속 팀 다중 선택 다이얼로그. 부모가 대상 멤버 단위로 key remount 하므로
// 초기 선택은 마운트 시 initialTeamIds로 세팅된다.
function TeamAssignmentDialog({
	initialTeamIds,
	memberLabel,
	onClose,
	onSave,
	pending,
	teams,
}: {
	initialTeamIds: string[];
	memberLabel: string;
	onClose: () => void;
	onSave: (teamIds: string[]) => void;
	pending: boolean;
	teams: TeamMemberListTeam[];
}) {
	const [selectedTeamIds, setSelectedTeamIds] = useState(initialTeamIds);

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open
		>
			<DialogContent>
				<DialogTitle>팀 소속 변경</DialogTitle>
				<DialogDescription>
					{memberLabel} 님이 소속될 팀을 선택하세요.
				</DialogDescription>
				{teams.length > 0 ? (
					<div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
						{teams.map((team) => (
							<label
								className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-muted/50"
								htmlFor={`team-select-${team.teamId}`}
								key={team.teamId}
							>
								<Checkbox
									checked={selectedTeamIds.includes(team.teamId)}
									id={`team-select-${team.teamId}`}
									onCheckedChange={(value) =>
										setSelectedTeamIds((prev) =>
											value
												? [...prev, team.teamId]
												: prev.filter((id) => id !== team.teamId)
										)
									}
								/>
								<span className="text-sm">{team.displayName}</span>
							</label>
						))}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">
						먼저 팀을 만들어야 소속을 지정할 수 있어요.
					</p>
				)}
				<div className="flex justify-end gap-2">
					<Button onClick={onClose} type="button" variant="outline">
						취소
					</Button>
					<Button
						disabled={pending}
						onClick={() => onSave(selectedTeamIds)}
						type="button"
					>
						저장
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

// 확인 Alert에 그릴 제목·설명·확정 핸들러를 액션 종류별로 만든다.
function buildConfirmView({
	confirm,
	deletePending,
	onDeleteInvite,
	onRemove,
	onTransfer,
	removePending,
	transferPending,
}: {
	confirm: ConfirmAction | null;
	deletePending: boolean;
	onDeleteInvite: (row: OrganizationMember) => void;
	onRemove: (row: OrganizationMember) => void;
	onTransfer: (row: OrganizationMember) => void;
	removePending: boolean;
	transferPending: boolean;
}) {
	if (confirm === null) {
		return null;
	}

	const label = getMemberLabel(confirm.row);

	if (confirm.kind === "remove") {
		return {
			actionLabel: "내보내기",
			description: `${label} 님을 조직에서 내보내면 소속 팀에서도 제외됩니다.`,
			destructive: true,
			onConfirm: () => onRemove(confirm.row),
			pending: removePending,
			title: `${label} 님을 내보낼까요?`,
		};
	}

	if (confirm.kind === "transfer") {
		return {
			actionLabel: "소유권 이전",
			description: `${label} 님에게 소유권을 넘기면 회원님은 매니저로 전환됩니다.`,
			destructive: false,
			onConfirm: () => onTransfer(confirm.row),
			pending: transferPending,
			title: "소유권을 이전할까요?",
		};
	}

	return {
		actionLabel: "삭제",
		description: `${label} 님에게 보낸 반려된 초대를 삭제합니다.`,
		destructive: true,
		onConfirm: () => onDeleteInvite(confirm.row),
		pending: deletePending,
		title: "초대를 삭제할까요?",
	};
}
