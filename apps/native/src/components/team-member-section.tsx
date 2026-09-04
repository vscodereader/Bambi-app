import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	BottomSheet,
	Button,
	Checkbox,
	Input,
	Label,
	Menu,
	RadioGroup,
	Surface,
	TextArea,
	TextField,
	useThemeColor,
} from "heroui-native";
import { type PropsWithChildren, useState } from "react";
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
	MEMBER_NOT_ACTIVE_REASON,
	type MemberActionPermissions,
	memberStatusLabel,
	memberStatusTone,
	NO_TEAM_TO_ASSIGN_REASON,
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

// 공고관리 카드의 액션 메뉴와 같은 폭.
// 사유 문구가 붙는 항목이 있어 네 항목 기준으로 잡는다(정렬 시트 35%보다 한 단계 높게).
const MENU_SNAP_POINTS = ["45%"];
// 옵션 목록이 길어져도 시트가 화면을 다 먹지 않는 높이. 목록만 스크롤한다.
const EDIT_SHEET_SNAP_POINTS = ["55%"];

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

// 편집 시트의 공통 껍데기. 목록 끝에 패널을 끼워 넣던 방식은 편집 대상 카드와 편집 UI가
// 다른 스크롤 위치에 놓여 문맥이 끊기고, 목록이 밀리며, 저장 버튼이 화면 밖으로 나갈 수
// 있었다. 시트는 대상 이름을 제목에 고정하고 저장 CTA를 하단에 붙여 그 셋을 한 번에 없앤다.
// 옵션 영역만 스크롤하고 CTA는 스크롤 밖에 둔다(스크롤은 경계가 잡힌 부모 안에서만 일어나야
// 하므로 높이 제약은 Content에 건다 — field-select와 같은 heroui 권장 조합).
function MemberEditSheet({
	children,
	isOpen,
	isSaveDisabled,
	onClose,
	onSave,
	saveLabel,
	title,
}: PropsWithChildren<{
	isOpen: boolean;
	isSaveDisabled: boolean;
	onClose: () => void;
	onSave: () => void;
	saveLabel: string;
	title: string;
}>) {
	return (
		<BottomSheet isOpen={isOpen} onOpenChange={(next) => next || onClose()}>
			<BottomSheet.Portal>
				<BottomSheet.Overlay />
				<BottomSheet.Content
					contentContainerClassName="h-full"
					enableDynamicSizing={false}
					enableOverDrag={false}
					snapPoints={EDIT_SHEET_SNAP_POINTS}
				>
					<View className="flex-1 gap-4 p-4">
						<BottomSheet.Title>{title}</BottomSheet.Title>
						<BottomSheetScrollView>{children}</BottomSheetScrollView>
						<Button isDisabled={isSaveDisabled} onPress={onSave}>
							<Button.Label>{saveLabel}</Button.Label>
						</Button>
					</View>
				</BottomSheet.Content>
			</BottomSheet.Portal>
		</BottomSheet>
	);
}

// 권한 축만 다루는 시트. 대상 멤버 단위로 key remount 되므로 초기 선택은 마운트 시 props로
// 세팅된다(웹 TeamAssignmentDialog와 같은 이유).
function MemberRoleSheet({
	initialRole,
	isPending,
	memberLabel,
	onClose,
	onSave,
}: {
	initialRole: AssignableRole;
	isPending: boolean;
	memberLabel: string;
	onClose: () => void;
	onSave: (role: AssignableRole) => void;
}) {
	const [role, setRole] = useState<AssignableRole>(initialRole);

	return (
		<MemberEditSheet
			isOpen
			isSaveDisabled={role === initialRole || isPending}
			onClose={onClose}
			onSave={() => onSave(role)}
			saveLabel={isPending ? "변경 중" : "권한 저장"}
			title={`${memberLabel} 님 권한 변경`}
		>
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
		</MemberEditSheet>
	);
}

// 소속 팀 축만 다루는 시트. 위와 같은 이유로 key remount 전제다.
function MemberTeamsSheet({
	initialTeamIds,
	isPending,
	memberLabel,
	onClose,
	onSave,
	teams,
}: {
	initialTeamIds: string[];
	isPending: boolean;
	memberLabel: string;
	onClose: () => void;
	onSave: (teamIds: string[]) => void;
	teams: SectionTeam[];
}) {
	const [teamIds, setTeamIds] = useState<string[]>(initialTeamIds);
	const isChanged =
		teamIds.length !== initialTeamIds.length ||
		teamIds.some((id) => !initialTeamIds.includes(id));

	return (
		<MemberEditSheet
			isOpen
			isSaveDisabled={!isChanged || isPending}
			onClose={onClose}
			onSave={() => onSave(teamIds)}
			saveLabel={isPending ? "변경 중" : "팀 소속 저장"}
			title={`${memberLabel} 님 팀 소속 변경`}
		>
			{/* 아무 팀도 고르지 않으면 전체 조직 소속이 된다(초대 폼의 "전체 조직"과 같은 축). */}
			<Text className="pb-2 text-muted text-xs">
				고르지 않으면 전체 조직 소속이 돼요.
			</Text>
			{teams.map((team) => (
				<Pressable
					accessibilityRole="checkbox"
					accessibilityState={{ checked: teamIds.includes(team.teamId) }}
					className="flex-row items-center gap-3 py-3 active:opacity-75"
					key={team.teamId}
					onPress={() =>
						setTeamIds((prev) =>
							prev.includes(team.teamId)
								? prev.filter((id) => id !== team.teamId)
								: [...prev, team.teamId]
						)
					}
				>
					<Checkbox isSelected={teamIds.includes(team.teamId)} />
					<Text className="flex-1 text-foreground text-sm">
						{team.displayName}
					</Text>
				</Pressable>
			))}
		</MemberEditSheet>
	);
}

interface MemberCardHandlers {
	onChangeRole: (row: OrganizationMember) => void;
	onChangeTeams: (row: OrganizationMember) => void;
	onDeleteInvitation: (row: OrganizationMember) => void;
	onRemove: (row: OrganizationMember) => void;
	onResubmit: (row: OrganizationMember) => void;
	onTransferOwnership: (row: OrganizationMember) => void;
}

// 카드 우측 상단의 액션 메뉴. 공고관리 카드(JobActionsMenu)와 같은 트리거·정렬·폭이다.
// 서버가 거부할 항목은 숨기지 않고 비활성으로 두고 사유를 함께 보여준다.
function MemberActionsMenu({
	handlers,
	hasTeams,
	permissions,
	row,
}: {
	handlers: MemberCardHandlers;
	hasTeams: boolean;
	permissions: MemberActionPermissions;
	row: OrganizationMember;
}) {
	const foreground = useThemeColor("foreground");
	// 팀 소속 변경이 막히는 사유는 둘이다 — 지정할 팀이 아예 없거나, 서버가 활성 멤버로만
	// 제한하거나. 어느 쪽인지 알려 주지 않으면 팀부터 만들어야 한다는 걸 알 수 없다.
	const teamsDisabledReason = hasTeams
		? MEMBER_NOT_ACTIVE_REASON
		: NO_TEAM_TO_ASSIGN_REASON;

	return (
		// 팝오버가 아니라 바텀시트다. heroui의 popover 배치는 bottom placement에서
		// Dimensions.get("screen") 기준으로만 클램프하고 maxHeight를 걸지 않아, 목록 맨
		// 아래 카드에서 메뉴 끝이 제스처 내비 영역 뒤로 잘리고 더 스크롤할 여지도 없다.
		// 시트는 트리거 위치와 무관하게 화면 하단에 붙으므로 그 실패가 아예 없다.
		<Menu presentation="bottom-sheet">
			<Menu.Trigger asChild>
				{/* 아이콘만 담되 터치 타깃은 44dp를 지킨다. */}
				<Pressable
					accessibilityLabel="멤버 관리 메뉴"
					accessibilityRole="button"
					className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl active:opacity-75"
				>
					<Ionicons color={foreground} name="ellipsis-horizontal" size={20} />
				</Pressable>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Overlay />
				{/* 사유 문구가 붙는 항목이 있어 네 항목 기준으로 넉넉히 잡는다. */}
				<Menu.Content presentation="bottom-sheet" snapPoints={MENU_SNAP_POINTS}>
					<Menu.Item onPress={() => handlers.onChangeRole(row)}>
						<Menu.ItemTitle>권한 변경</Menu.ItemTitle>
					</Menu.Item>
					<Menu.Item
						isDisabled={!permissions.canSetTeams}
						onPress={() => handlers.onChangeTeams(row)}
					>
						<Menu.ItemTitle>팀 소속 변경</Menu.ItemTitle>
						{permissions.canSetTeams ? null : (
							<Menu.ItemDescription>{teamsDisabledReason}</Menu.ItemDescription>
						)}
					</Menu.Item>
					<Menu.Item
						isDisabled={!permissions.canTransferOwnership}
						onPress={() => handlers.onTransferOwnership(row)}
					>
						<Menu.ItemTitle>소유권 이전</Menu.ItemTitle>
						{permissions.canTransferOwnership ? null : (
							<Menu.ItemDescription>
								{MEMBER_NOT_ACTIVE_REASON}
							</Menu.ItemDescription>
						)}
					</Menu.Item>
					<Menu.Item onPress={() => handlers.onRemove(row)} variant="danger">
						<Menu.ItemTitle>내보내기</Menu.ItemTitle>
					</Menu.Item>
				</Menu.Content>
			</Menu.Portal>
		</Menu>
	);
}

function MemberCard({
	canManageOrganization,
	handlers,
	hasTeams,
	isVerified,
	row,
}: {
	canManageOrganization: boolean;
	handlers: MemberCardHandlers;
	hasTeams: boolean;
	isVerified: boolean;
	row: OrganizationMember;
}) {
	const permissions = getMemberActionPermissions({
		canManageOrganization,
		hasTeams,
		isVerified,
		row,
	});

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-start gap-2">
				{/* min-w-0이 없으면 긴 이름이 아이콘 버튼을 카드 밖으로 밀어낸다. */}
				<View className="min-w-0 flex-1 gap-1">
					<Text className="font-semibold text-base text-foreground" selectable>
						{getMemberLabel(row)}
					</Text>
					<Text className="text-muted text-sm" selectable>
						{row.email}
					</Text>
				</View>
				{permissions.canChangeRole ? (
					<MemberActionsMenu
						handlers={handlers}
						hasTeams={hasTeams}
						permissions={permissions}
						row={row}
					/>
				) : null}
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
			{/* 초대 행은 액션이 둘뿐이라 메뉴 없이 카드에 그대로 둔다. 활성 멤버 카드에서는
			    빈 View가 gap만 벌리므로 아예 그리지 않는다. */}
			{permissions.canResubmit || permissions.canDeleteInvitation ? (
				<View className="flex-row flex-wrap gap-2">
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
			) : null}
		</Surface>
	);
}

function MemberList({
	canManageOrganization,
	handlers,
	hasTeams,
	isVerified,
	members,
	onRetry,
	status,
}: {
	canManageOrganization: boolean;
	handlers: MemberCardHandlers;
	hasTeams: boolean;
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
					hasTeams={hasTeams}
					isVerified={isVerified}
					key={`${row.kind}-${row.id}`}
					row={row}
				/>
			))}
		</View>
	);
}

// 웹 team-member-list.tsx의 native 이식.
export function TeamMemberSection({
	canManageOrganization,
	isVerified,
	organizationId,
	teams,
}: TeamMemberSectionProps) {
	const [serverError, setServerError] = useState<null | string>(null);
	const [resubmitTarget, setResubmitTarget] =
		useState<null | OrganizationMember>(null);
	// 권한·팀 소속은 메뉴에서 각각 독립 항목으로 열리므로 어느 축을 여는지까지 들고 있는다.
	const [manageTarget, setManageTarget] = useState<null | {
		mode: "role" | "teams";
		row: OrganizationMember;
	}>(null);

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
	const transferOwnershipMutation = useMutation(
		orpc.bambi.teams.transferOwnership.mutationOptions({
			onError: (error) =>
				alertError("이전하지 못했어요", error, "소유권을 이전하지 못했어요."),
			onSuccess: async () => {
				setManageTarget(null);
				Alert.alert("이전했어요", "이제 회원님은 매니저예요.");
				// 소유권이 넘어가면 요청자의 canManageOrganization도 바뀌므로 조직 정보까지
				// 무효화해 화면 권한 상태를 즉시 갱신한다(웹과 같은 이유).
				await Promise.all([
					invalidateMembers(),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.organizations.getMine.queryKey(),
					}),
				]);
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
		onChangeRole: (row) => setManageTarget({ mode: "role", row }),
		onChangeTeams: (row) => setManageTarget({ mode: "teams", row }),
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
		// 되돌릴 수 없는 액션이라 확인에서 결과를 명시하고 파괴적 버튼으로 받는다.
		onTransferOwnership: (row) =>
			Alert.alert(
				`${getMemberLabel(row)} 님에게 소유권을 이전할까요?`,
				"이전하면 회원님의 소유자 권한이 사라지고 매니저로 바뀌어요. 되돌릴 수 없어요.",
				[
					{ style: "cancel", text: "취소" },
					{
						onPress: () =>
							transferOwnershipMutation.mutate({
								memberId: row.id,
								organizationId,
							}),
						style: "destructive",
						text: "이전",
					},
				]
			),
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
					멤버 권한과 팀 초대를 관리해요.
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
				hasTeams={teams.length > 0}
				isVerified={isVerified}
				members={membersQuery.data ?? []}
				onRetry={() => membersQuery.refetch()}
				status={status}
			/>

			{manageTarget?.mode === "role" ? (
				<MemberRoleSheet
					initialRole={toAssignableRole(manageTarget.row.role)}
					isPending={setRoleMutation.isPending}
					key={manageTarget.row.id}
					memberLabel={getMemberLabel(manageTarget.row)}
					onClose={() => setManageTarget(null)}
					onSave={(nextRole) =>
						setRoleMutation.mutate({
							memberId: manageTarget.row.id,
							organizationId,
							role: nextRole,
						})
					}
				/>
			) : null}

			{manageTarget?.mode === "teams" ? (
				<MemberTeamsSheet
					initialTeamIds={manageTarget.row.teams.map((team) => team.id)}
					isPending={setMemberTeamsMutation.isPending}
					key={manageTarget.row.id}
					memberLabel={getMemberLabel(manageTarget.row)}
					onClose={() => setManageTarget(null)}
					onSave={(teamIds) =>
						setMemberTeamsMutation.mutate({
							memberId: manageTarget.row.id,
							organizationId,
							teamIds,
						})
					}
					teams={teams}
				/>
			) : null}
		</View>
	);
}
