import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	Button,
	Checkbox,
	Input,
	Label,
	RadioGroup,
	Separator,
	Surface,
	TextArea,
	TextField,
} from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { formatDateTime, Pill, StateCard } from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { localErrorMessage } from "@/src/lib/chat/chat-errors";
import {
	ASSIGNABLE_ROLE_OPTIONS,
	type AssignableRole,
	getMemberActionPermissions,
	getMemberLabel,
	type InviteSubmitInput,
	memberStatusLabel,
	memberStatusTone,
	organizationRoleLabel,
	validateInviteForm,
} from "@/src/lib/employer/teams";
import { orpc, queryClient } from "@/src/lib/orpc";

type OrganizationMember = Awaited<
	ReturnType<AppRouterClient["bambi"]["organizations"]["listMembers"]>
>[number];

interface SectionTeam {
	displayName: string;
	teamId: string;
}

interface TeamMemberSectionProps {
	canManageOrganization: boolean;
	isVerified: boolean;
	organizationId: string;
	teams: SectionTeam[];
}

const ALL_ORGANIZATION_TEAM = { label: "전체 조직", value: "" };

// 검색어가 짧으면 서버를 두드리지 않는다 — 한 글자마다 전체 구인자 후보가 흔들린다.
const MIN_SEARCH_LENGTH = 2;

const alertError = (title: string, error: unknown, fallback: string) =>
	Alert.alert(title, localErrorMessage(error, fallback));

const toAssignableRole = (role: string): AssignableRole =>
	role === "manager" ? "manager" : "staff";

function InviteeResults({
	invitees,
	isLoading,
	onSelect,
}: {
	invitees: { email: string; name: string; userId: string }[];
	isLoading: boolean;
	onSelect: (email: string) => void;
}) {
	if (isLoading) {
		return <Text className="text-muted text-sm">검색 중이에요.</Text>;
	}

	if (invitees.length === 0) {
		return (
			<Text className="text-muted text-sm">일치하는 구인자 계정이 없어요.</Text>
		);
	}

	return (
		<View className="gap-1">
			{invitees.map((invitee) => (
				<Pressable
					accessibilityRole="button"
					className="rounded-lg border border-border p-3 active:opacity-75"
					key={invitee.userId}
					onPress={() => onSelect(invitee.email)}
				>
					<Text className="font-semibold text-foreground text-sm">
						{invitee.name}
					</Text>
					<Text className="text-muted text-xs">{invitee.email}</Text>
				</Pressable>
			))}
		</View>
	);
}

// 초대 폼은 자기 입력 상태를 스스로 든다. 재제출 대상이 바뀔 때마다 부모가 key remount
// 하므로 프리필은 마운트 시 한 번만 일어난다(웹은 부모 상태로 되돌렸지만, 여기서는 폼이
// 화면 중간에 있어 상태를 위로 올릴 이유가 없다).
function InviteForm({
	isPending,
	onCancelResubmit,
	onSubmit,
	organizationId,
	resubmitTarget,
	serverError,
	teams,
}: {
	isPending: boolean;
	onCancelResubmit: () => void;
	onSubmit: (input: InviteSubmitInput) => void;
	organizationId: string;
	resubmitTarget: null | OrganizationMember;
	serverError: null | string;
	teams: SectionTeam[];
}) {
	const [search, setSearch] = useState("");
	const [email, setEmail] = useState(
		resubmitTarget ? (resubmitTarget.invitedEmail ?? resubmitTarget.email) : ""
	);
	const [role, setRole] = useState<AssignableRole>(
		toAssignableRole(resubmitTarget?.role ?? "staff")
	);
	const [teamId, setTeamId] = useState(resubmitTarget?.teams[0]?.id ?? "");
	const [reason, setReason] = useState(
		resubmitTarget?.kind === "invitation"
			? (resubmitTarget.inviteReason ?? "")
			: ""
	);
	const [localError, setLocalError] = useState<null | string>(null);

	const trimmedSearch = search.trim();
	const isSearching = trimmedSearch.length >= MIN_SEARCH_LENGTH;
	const inviteesQuery = useQuery(
		orpc.bambi.teams.searchEmployerInvitees.queryOptions({
			enabled: isSearching && !resubmitTarget,
			input: { organizationId, query: trimmedSearch },
		})
	);

	const submit = () => {
		const result = validateInviteForm({ email, reason, role, teamId });

		if (!result.ok) {
			setLocalError(result.message);
			return;
		}

		setLocalError(null);
		onSubmit(result.input);
	};

	const errorText = localError ?? serverError;

	return (
		<Surface className="gap-4 rounded-lg p-4" variant="secondary">
			<Text className="font-semibold text-base text-foreground">
				{resubmitTarget ? "초대 재제출" : "멤버 초대"}
			</Text>

			{resubmitTarget ? (
				<View className="gap-2">
					<Label>대상</Label>
					<Text className="text-foreground text-sm" selectable>
						{email}
					</Text>
				</View>
			) : (
				<View className="gap-2">
					<TextField>
						<Label>구인자 검색</Label>
						<Input
							autoCapitalize="none"
							keyboardType="email-address"
							onChangeText={setSearch}
							placeholder="이름 또는 이메일 2자 이상"
							value={search}
						/>
					</TextField>
					{email ? (
						<View className="flex-row flex-wrap items-center gap-2">
							<Pill tone="accent">{email}</Pill>
							<Button onPress={() => setEmail("")} size="sm" variant="ghost">
								<Button.Label>선택 해제</Button.Label>
							</Button>
						</View>
					) : null}
					{isSearching ? (
						<InviteeResults
							invitees={inviteesQuery.data ?? []}
							isLoading={inviteesQuery.isLoading}
							onSelect={(next) => {
								setEmail(next);
								setSearch("");
							}}
						/>
					) : null}
				</View>
			)}

			<FieldSelect
				label="권한"
				onChange={(value) => setRole(toAssignableRole(value))}
				options={ASSIGNABLE_ROLE_OPTIONS}
				placeholder="권한을 골라 주세요"
				snapPoints={["35%"]}
				value={role}
			/>
			<FieldSelect
				label="팀"
				onChange={setTeamId}
				options={[
					ALL_ORGANIZATION_TEAM,
					...teams.map((team) => ({
						label: team.displayName,
						value: team.teamId,
					})),
				]}
				placeholder="전체 조직"
				value={teamId}
			/>

			<View className="gap-2">
				<Label isRequired>초대 사유</Label>
				<TextArea
					maxLength={200}
					onChangeText={setReason}
					placeholder="예: 2호점 매니저로 합류 예정"
					value={reason}
				/>
				<Text className="text-muted text-xs">
					10자 이상 200자 이하로 적어 주세요. 운영자가 합류를 승인할 때 이
					사유를 함께 봐요.
				</Text>
			</View>

			{errorText ? (
				<Text className="text-danger text-sm" selectable>
					{errorText}
				</Text>
			) : null}

			<View className="flex-row gap-3">
				{resubmitTarget ? (
					<View className="flex-1">
						<Button
							isDisabled={isPending}
							onPress={onCancelResubmit}
							variant="tertiary"
						>
							<Button.Label>취소</Button.Label>
						</Button>
					</View>
				) : null}
				<View className="flex-1">
					<Button isDisabled={isPending} onPress={submit} variant="secondary">
						<Button.Label>{resubmitTarget ? "재제출" : "초대"}</Button.Label>
					</Button>
				</View>
			</View>
		</Surface>
	);
}

// 멤버 한 명의 권한·소속 팀을 한 자리에서 다룬다. 대상 멤버 단위로 key remount 되므로 초기
// 선택은 마운트 시 props로 세팅된다(웹 TeamAssignmentDialog와 같은 이유).
function MemberManagePanel({
	canSetTeams,
	initialRole,
	initialTeamIds,
	isRolePending,
	isTeamsPending,
	onSaveRole,
	onSaveTeams,
	teams,
}: {
	canSetTeams: boolean;
	initialRole: AssignableRole;
	initialTeamIds: string[];
	isRolePending: boolean;
	isTeamsPending: boolean;
	onSaveRole: (role: AssignableRole) => void;
	onSaveTeams: (teamIds: string[]) => void;
	teams: SectionTeam[];
}) {
	const [role, setRole] = useState<AssignableRole>(initialRole);
	const [teamIds, setTeamIds] = useState<string[]>(initialTeamIds);
	const isTeamsChanged =
		teamIds.length !== initialTeamIds.length ||
		teamIds.some((id) => !initialTeamIds.includes(id));

	return (
		<View className="gap-4">
			<View className="gap-2">
				<Label>권한</Label>
				<RadioGroup
					onValueChange={(value) => setRole(toAssignableRole(value))}
					value={role}
				>
					{ASSIGNABLE_ROLE_OPTIONS.map((option) => (
						<RadioGroup.Item key={option.value} value={option.value}>
							{option.label}
						</RadioGroup.Item>
					))}
				</RadioGroup>
				<Button
					isDisabled={role === initialRole || isRolePending}
					onPress={() => onSaveRole(role)}
					size="sm"
					variant="secondary"
				>
					<Button.Label>{isRolePending ? "변경 중" : "권한 저장"}</Button.Label>
				</Button>
			</View>

			<Separator />

			<View className="gap-2">
				<Label>소속 팀</Label>
				{canSetTeams ? null : (
					<Text className="text-muted text-xs">
						활성 멤버의 팀 소속만 변경할 수 있어요.
					</Text>
				)}
				{teams.length === 0 ? (
					<Text className="text-muted text-xs">
						먼저 팀을 만들어야 소속을 지정할 수 있어요.
					</Text>
				) : null}
				{teams.map((team) => (
					<Pressable
						accessibilityRole="checkbox"
						accessibilityState={{ checked: teamIds.includes(team.teamId) }}
						className="flex-row items-center gap-3 py-2 active:opacity-75"
						key={team.teamId}
						onPress={() =>
							setTeamIds((prev) =>
								prev.includes(team.teamId)
									? prev.filter((id) => id !== team.teamId)
									: [...prev, team.teamId]
							)
						}
					>
						<Checkbox
							isDisabled={!canSetTeams}
							isSelected={teamIds.includes(team.teamId)}
						/>
						<Text className="flex-1 text-foreground text-sm">
							{team.displayName}
						</Text>
					</Pressable>
				))}
				<Button
					isDisabled={!(canSetTeams && isTeamsChanged) || isTeamsPending}
					onPress={() => onSaveTeams(teamIds)}
					size="sm"
					variant="secondary"
				>
					<Button.Label>
						{isTeamsPending ? "변경 중" : "팀 소속 저장"}
					</Button.Label>
				</Button>
			</View>
		</View>
	);
}

interface MemberCardHandlers {
	onDeleteInvitation: (row: OrganizationMember) => void;
	onManage: (row: OrganizationMember) => void;
	onRemove: (row: OrganizationMember) => void;
	onResubmit: (row: OrganizationMember) => void;
}

function MemberCard({
	canManageOrganization,
	handlers,
	isVerified,
	row,
}: {
	canManageOrganization: boolean;
	handlers: MemberCardHandlers;
	isVerified: boolean;
	row: OrganizationMember;
}) {
	const permissions = getMemberActionPermissions({
		canManageOrganization,
		isVerified,
		row,
	});

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="gap-1">
				<Text className="font-semibold text-base text-foreground" selectable>
					{getMemberLabel(row)}
				</Text>
				<Text className="text-muted text-sm" selectable>
					{row.email}
				</Text>
			</View>
			{/* 배지는 좁은 폭에서 넘치면 접는다(가로 스크롤 금지). */}
			<View className="flex-row flex-wrap items-center gap-2">
				<Pill tone={memberStatusTone(row.status)}>
					{memberStatusLabel(row.status)}
				</Pill>
				<Pill>{organizationRoleLabel(row.role)}</Pill>
				{row.teams.map((team) => (
					<Pill key={team.id} tone="accent">
						{team.name}
					</Pill>
				))}
			</View>
			<Text className="text-muted text-xs">
				등록 {formatDateTime(row.createdAt)}
			</Text>
			{row.kind === "invitation" && row.rejectionReason ? (
				<Text className="text-danger text-xs" selectable>
					반려 사유: {row.rejectionReason}
				</Text>
			) : null}
			<View className="flex-row flex-wrap gap-2">
				{permissions.canChangeRole ? (
					<Button
						onPress={() => handlers.onManage(row)}
						size="sm"
						variant="secondary"
					>
						<Button.Label>권한·팀 관리</Button.Label>
					</Button>
				) : null}
				{permissions.canRemove ? (
					<Button
						onPress={() => handlers.onRemove(row)}
						size="sm"
						variant="danger"
					>
						<Button.Label>내보내기</Button.Label>
					</Button>
				) : null}
				{permissions.canResubmit ? (
					<Button
						onPress={() => handlers.onResubmit(row)}
						size="sm"
						variant="secondary"
					>
						<Button.Label>재제출</Button.Label>
					</Button>
				) : null}
				{permissions.canDeleteInvitation ? (
					<Button
						onPress={() => handlers.onDeleteInvitation(row)}
						size="sm"
						variant="danger"
					>
						<Button.Label>초대 삭제</Button.Label>
					</Button>
				) : null}
			</View>
		</Surface>
	);
}

function MemberList({
	canManageOrganization,
	handlers,
	isVerified,
	members,
	onRetry,
	status,
}: {
	canManageOrganization: boolean;
	handlers: MemberCardHandlers;
	isVerified: boolean;
	members: OrganizationMember[];
	onRetry: () => void;
	status: "error" | "loading" | "ready";
}) {
	if (status === "loading") {
		return <Text className="text-muted text-sm">멤버를 불러오고 있어요.</Text>;
	}

	if (status === "error") {
		return (
			<StateCard
				action={
					<Button onPress={onRetry} size="sm" variant="secondary">
						<Button.Label>다시 시도</Button.Label>
					</Button>
				}
				description="네트워크 연결을 확인한 뒤 다시 시도해 주세요."
				title="멤버를 불러오지 못했어요"
			/>
		);
	}

	if (members.length === 0) {
		return (
			<StateCard
				description="활성 멤버나 대기 중인 초대가 없어요."
				title="멤버가 없어요"
			/>
		);
	}

	return (
		<View className="gap-3">
			{members.map((row) => (
				<MemberCard
					canManageOrganization={canManageOrganization}
					handlers={handlers}
					isVerified={isVerified}
					key={`${row.kind}-${row.id}`}
					row={row}
				/>
			))}
		</View>
	);
}

// 웹 team-member-list.tsx의 native 이식. 소유권 이전은 되돌릴 수 없어 앱에서는 제공하지
// 않고 안내로만 대체한다.
export function TeamMemberSection({
	canManageOrganization,
	isVerified,
	organizationId,
	teams,
}: TeamMemberSectionProps) {
	const [serverError, setServerError] = useState<null | string>(null);
	const [resubmitTarget, setResubmitTarget] =
		useState<null | OrganizationMember>(null);
	const [manageTarget, setManageTarget] = useState<null | OrganizationMember>(
		null
	);

	const membersQuery = useQuery(
		orpc.bambi.organizations.listMembers.queryOptions({
			input: { organizationId },
		})
	);

	const invalidateMembers = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.organizations.listMembers.queryKey({
				input: { organizationId },
			}),
		});

	const onInviteError =
		(title: string, fallback: string) => (error: unknown) => {
			const message = localErrorMessage(error, fallback);
			setServerError(message);
			Alert.alert(title, message);
		};

	const onInviteSuccess = (title: string, body: string) => async () => {
		setResubmitTarget(null);
		setServerError(null);
		Alert.alert(title, body);
		await invalidateMembers();
	};

	const inviteMutation = useMutation(
		orpc.bambi.teams.inviteMember.mutationOptions({
			onError: onInviteError("초대하지 못했어요", "멤버를 초대하지 못했어요."),
			onSuccess: onInviteSuccess(
				"초대했어요",
				"운영자 승인 후 멤버가 합류해요."
			),
		})
	);
	const resubmitMutation = useMutation(
		orpc.bambi.teams.resubmitInvitation.mutationOptions({
			onError: onInviteError(
				"재제출하지 못했어요",
				"초대를 재제출하지 못했어요."
			),
			onSuccess: onInviteSuccess(
				"재제출했어요",
				"운영자 승인을 기다려 주세요."
			),
		})
	);
	const deleteInvitationMutation = useMutation(
		orpc.bambi.teams.deleteInvitation.mutationOptions({
			onError: (error) =>
				alertError("삭제하지 못했어요", error, "초대를 삭제하지 못했어요."),
			onSuccess: async () => {
				Alert.alert("삭제했어요", "반려된 초대를 삭제했어요.");
				await invalidateMembers();
			},
		})
	);
	const setRoleMutation = useMutation(
		orpc.bambi.teams.setMemberRole.mutationOptions({
			onError: (error) =>
				alertError("변경하지 못했어요", error, "권한을 변경하지 못했어요."),
			onSuccess: async () => {
				setManageTarget(null);
				Alert.alert("변경했어요", "멤버 권한을 변경했어요.");
				await invalidateMembers();
			},
		})
	);
	const setMemberTeamsMutation = useMutation(
		orpc.bambi.teams.setMemberTeams.mutationOptions({
			onError: (error) =>
				alertError("변경하지 못했어요", error, "팀 소속을 변경하지 못했어요."),
			onSuccess: async () => {
				setManageTarget(null);
				Alert.alert("변경했어요", "팀 소속을 변경했어요.");
				await invalidateMembers();
			},
		})
	);
	const removeMemberMutation = useMutation(
		orpc.bambi.teams.removeMember.mutationOptions({
			onError: (error) =>
				alertError("내보내지 못했어요", error, "멤버를 내보내지 못했어요."),
			onSuccess: async () => {
				setManageTarget(null);
				Alert.alert("내보냈어요", "멤버를 조직에서 내보냈어요.");
				await invalidateMembers();
			},
		})
	);

	const handlers: MemberCardHandlers = {
		onDeleteInvitation: (row) =>
			Alert.alert(
				"초대를 삭제할까요?",
				`${getMemberLabel(row)} 님에게 보낸 반려된 초대를 삭제해요.`,
				[
					{ style: "cancel", text: "취소" },
					{
						onPress: () =>
							deleteInvitationMutation.mutate({
								invitationId: row.id,
								organizationId,
							}),
						style: "destructive",
						text: "삭제",
					},
				]
			),
		onManage: (row) => setManageTarget(row),
		onRemove: (row) =>
			Alert.alert(
				`${getMemberLabel(row)} 님을 내보낼까요?`,
				"조직에서 내보내면 소속 팀에서도 함께 빠져요.",
				[
					{ style: "cancel", text: "취소" },
					{
						onPress: () =>
							removeMemberMutation.mutate({
								memberId: row.id,
								organizationId,
							}),
						style: "destructive",
						text: "내보내기",
					},
				]
			),
		onResubmit: (row) => {
			setServerError(null);
			setResubmitTarget(row);
		},
	};

	let status: "error" | "loading" | "ready" = "ready";

	if (membersQuery.isLoading) {
		status = "loading";
	} else if (membersQuery.isError) {
		status = "error";
	}

	return (
		<View className="gap-4">
			<View className="gap-1">
				<Text className="font-bold text-foreground text-xl">멤버와 초대</Text>
				<Text className="text-muted text-sm">
					멤버 권한과 팀 초대를 관리해요. 소유권 이전은 앱에서 지원하지 않아요 —
					웹에서 진행해 주세요.
				</Text>
			</View>

			{isVerified ? (
				<InviteForm
					isPending={inviteMutation.isPending || resubmitMutation.isPending}
					key={resubmitTarget?.id ?? "new"}
					onCancelResubmit={() => setResubmitTarget(null)}
					onSubmit={(input) => {
						if (resubmitTarget) {
							resubmitMutation.mutate({
								invitationId: resubmitTarget.id,
								organizationId,
								reason: input.reason,
							});
							return;
						}

						inviteMutation.mutate({ ...input, organizationId });
					}}
					organizationId={organizationId}
					resubmitTarget={resubmitTarget}
					serverError={serverError}
					teams={teams}
				/>
			) : null}

			<MemberList
				canManageOrganization={canManageOrganization}
				handlers={handlers}
				isVerified={isVerified}
				members={membersQuery.data ?? []}
				onRetry={() => membersQuery.refetch()}
				status={status}
			/>

			{manageTarget ? (
				<Surface className="gap-4 rounded-lg p-4" variant="secondary">
					<View className="flex-row items-center justify-between gap-3">
						<Text className="flex-1 font-semibold text-base text-foreground">
							{getMemberLabel(manageTarget)} 님 관리
						</Text>
						<Button
							onPress={() => setManageTarget(null)}
							size="sm"
							variant="ghost"
						>
							<Button.Label>닫기</Button.Label>
						</Button>
					</View>
					<MemberManagePanel
						canSetTeams={
							getMemberActionPermissions({
								canManageOrganization,
								isVerified,
								row: manageTarget,
							}).canSetTeams
						}
						initialRole={toAssignableRole(manageTarget.role)}
						initialTeamIds={manageTarget.teams.map((team) => team.id)}
						isRolePending={setRoleMutation.isPending}
						isTeamsPending={setMemberTeamsMutation.isPending}
						key={manageTarget.id}
						onSaveRole={(nextRole) =>
							setRoleMutation.mutate({
								memberId: manageTarget.id,
								organizationId,
								role: nextRole,
							})
						}
						onSaveTeams={(teamIds) =>
							setMemberTeamsMutation.mutate({
								memberId: manageTarget.id,
								organizationId,
								teamIds,
							})
						}
						teams={teams}
					/>
				</Surface>
			) : null}
		</View>
	);
}
