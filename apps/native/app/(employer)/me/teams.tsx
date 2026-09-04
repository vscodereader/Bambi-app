import { useMutation, useQuery } from "@tanstack/react-query";
import {
	Button,
	Dialog,
	Input,
	Label,
	Surface,
	TextField,
} from "heroui-native";
import { useState } from "react";
import {
	Alert,
	KeyboardAvoidingView,
	Platform,
	Text,
	View,
} from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatDateTime,
	LoadingState,
	StateCard,
} from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { TeamMemberSection } from "@/src/components/team-member-section";
import { localErrorMessage } from "@/src/lib/chat/chat-errors";
import { getEmployerGateNotice } from "@/src/lib/employer/business";
import {
	formatTeamRegion,
	getTeamDeleteBlockReason,
	type RegionNode,
	type TeamFormValues,
	type TeamSubmitInput,
	validateTeamForm,
} from "@/src/lib/employer/teams";
import { orpc, queryClient } from "@/src/lib/orpc";

interface TeamRow {
	displayName: null | string;
	districtCode: null | string;
	memberCount: number;
	region: null | string;
	regionCode: null | string;
	teamId: string;
	updatedAt: Date | null | string;
}

const EMPTY_TEAM_FORM: TeamFormValues = {
	displayName: "",
	districtCode: "",
	regionCode: "",
};

const teamName = (team: TeamRow): string => team.displayName ?? "이름 없는 팀";

// 생성·수정이 같은 폼을 쓴다. 대상 팀 단위로 key remount 되므로 초기값은 마운트 시 한 번만
// 세팅된다(웹은 목록 인라인 편집이지만, 좁은 폭에서는 카드가 무너져 시트로 띄운다).
function TeamFormDialog({
	initialValues,
	isPending,
	onClose,
	onSubmit,
	regions,
	title,
}: {
	initialValues: TeamFormValues;
	isPending: boolean;
	onClose: () => void;
	onSubmit: (input: TeamSubmitInput) => void;
	regions: RegionNode[];
	title: string;
}) {
	const [values, setValues] = useState<TeamFormValues>(initialValues);
	const [errors, setErrors] = useState<Partial<TeamFormValues>>({});
	// 세부지역은 고른 시/도의 것만 낸다 — 다른 시/도 코드가 섞이면 서버 정합 검사에서 터진다.
	const districtOptions = (
		regions.find((region) => region.code === values.regionCode)?.districts ?? []
	).map((district) => ({ label: district.name, value: district.code }));

	const submit = () => {
		const result = validateTeamForm(values);

		if (!result.ok) {
			setErrors(result.errors);
			return;
		}

		setErrors({});
		onSubmit(result.input);
	};

	return (
		<Dialog isOpen onOpenChange={(next) => (next ? null : onClose())}>
			<Dialog.Portal>
				<Dialog.Overlay />
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : undefined}
				>
					<Dialog.Content>
						<View className="gap-4">
							<View className="gap-1.5">
								<Dialog.Title>{title}</Dialog.Title>
								<Dialog.Description>
									지점이나 운영 단위별로 공고 권한을 나눌 수 있어요.
								</Dialog.Description>
							</View>
							<TextField isInvalid={Boolean(errors.displayName)} isRequired>
								<Label>팀 이름</Label>
								<Input
									onChangeText={(displayName) =>
										setValues((prev) => ({ ...prev, displayName }))
									}
									placeholder="강남점"
									value={values.displayName}
								/>
							</TextField>
							{errors.displayName ? (
								<Text className="text-danger text-sm">
									{errors.displayName}
								</Text>
							) : null}
							<FieldSelect
								errorMessage={errors.regionCode}
								isRequired
								label="지역"
								// 시/도를 바꾸면 이전 시/도의 세부지역 코드는 반드시 함께 비운다.
								onChange={(regionCode) =>
									setValues((prev) => ({
										...prev,
										districtCode: "",
										regionCode,
									}))
								}
								options={regions.map((region) => ({
									label: region.label,
									value: region.code,
								}))}
								placeholder="지역을 골라 주세요"
								snapPoints={["75%"]}
								value={values.regionCode}
							/>
							{districtOptions.length > 0 ? (
								<FieldSelect
									label="세부지역"
									onChange={(districtCode) =>
										setValues((prev) => ({ ...prev, districtCode }))
									}
									options={districtOptions}
									placeholder="지역 전체"
									snapPoints={["75%"]}
									value={values.districtCode}
								/>
							) : null}
							<View className="flex-row gap-3">
								<View className="flex-1">
									<Button
										isDisabled={isPending}
										onPress={onClose}
										variant="tertiary"
									>
										<Button.Label>취소</Button.Label>
									</Button>
								</View>
								<View className="flex-1">
									<Button isDisabled={isPending} onPress={submit}>
										<Button.Label>
											{isPending ? "저장 중" : "저장"}
										</Button.Label>
									</Button>
								</View>
							</View>
						</View>
					</Dialog.Content>
				</KeyboardAvoidingView>
			</Dialog.Portal>
		</Dialog>
	);
}

function DeleteTeamDialog({
	isPending,
	onClose,
	onConfirm,
	label,
}: {
	isPending: boolean;
	label: string;
	onClose: () => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog isOpen onOpenChange={(next) => (next ? null : onClose())}>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<View className="gap-4">
						<View className="gap-1.5">
							<Dialog.Title>‘{label}’ 팀을 삭제할까요?</Dialog.Title>
							<Dialog.Description>
								삭제한 팀은 되돌릴 수 없어요. 팀과 연결된 공고는 팀 소속만
								풀려요.
							</Dialog.Description>
						</View>
						<View className="flex-row gap-3">
							<View className="flex-1">
								<Button
									isDisabled={isPending}
									onPress={onClose}
									variant="tertiary"
								>
									<Button.Label>취소</Button.Label>
								</Button>
							</View>
							<View className="flex-1">
								<Button
									isDisabled={isPending}
									onPress={onConfirm}
									variant="danger"
								>
									<Button.Label>{isPending ? "삭제 중" : "삭제"}</Button.Label>
								</Button>
							</View>
						</View>
					</View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}

function TeamCard({
	isVerified,
	onDelete,
	onEdit,
	regions,
	team,
}: {
	isVerified: boolean;
	onDelete: () => void;
	onEdit: () => void;
	regions: RegionNode[];
	team: TeamRow;
}) {
	const blockReason = getTeamDeleteBlockReason({
		isVerified,
		memberCount: team.memberCount,
	});

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<Text className="font-semibold text-base text-foreground" selectable>
				{teamName(team)}
			</Text>
			<Text className="text-muted text-sm">
				{formatTeamRegion(regions, team)} · 멤버 {team.memberCount}명
			</Text>
			{team.updatedAt ? (
				<Text className="text-muted text-xs">
					수정 {formatDateTime(team.updatedAt)}
				</Text>
			) : null}
			{blockReason ? (
				<Text className="text-muted text-xs">{blockReason}</Text>
			) : null}
			{/* 버튼 줄은 좁은 폭에서 넘치면 접는다(가로 스크롤 금지). */}
			<View className="flex-row flex-wrap gap-2">
				<Button
					isDisabled={!isVerified}
					onPress={onEdit}
					size="sm"
					variant="secondary"
				>
					<Button.Label>수정</Button.Label>
				</Button>
				<Button
					isDisabled={blockReason !== null}
					onPress={onDelete}
					size="sm"
					variant="danger"
				>
					<Button.Label>삭제</Button.Label>
				</Button>
			</View>
		</Surface>
	);
}

function TeamList({
	isVerified,
	onDelete,
	onEdit,
	onRetry,
	regions,
	status,
	teams,
}: {
	isVerified: boolean;
	onDelete: (team: TeamRow) => void;
	onEdit: (team: TeamRow) => void;
	onRetry: () => void;
	regions: RegionNode[];
	status: "error" | "loading" | "ready";
	teams: TeamRow[];
}) {
	if (status === "loading") {
		return <Text className="text-muted text-sm">팀을 불러오고 있어요.</Text>;
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
				title="팀을 불러오지 못했어요"
			/>
		);
	}

	if (teams.length === 0) {
		return (
			<StateCard
				description="아직 만든 팀이 없어요. 위 ‘새 팀’으로 첫 팀을 만들어 보세요."
				title="팀이 없어요"
			/>
		);
	}

	return (
		<View className="gap-3">
			{teams.map((team) => (
				<TeamCard
					isVerified={isVerified}
					key={team.teamId}
					onDelete={() => onDelete(team)}
					onEdit={() => onEdit(team)}
					regions={regions}
					team={team}
				/>
			))}
		</View>
	);
}

const toListStatus = (query: {
	isError: boolean;
	isLoading: boolean;
}): "error" | "loading" | "ready" => {
	if (query.isLoading) {
		return "loading";
	}

	return query.isError ? "error" : "ready";
};

// 팀 CRUD 세 뮤테이션 + 무효화를 한 자리에 모은다. 화면 본문은 렌더와 배선만 남긴다.
function useTeamMutations({
	closeDelete,
	closeForm,
	organizationId,
}: {
	closeDelete: () => void;
	closeForm: () => void;
	organizationId: string;
}) {
	const invalidateTeams = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.teams.list.queryKey({ input: { organizationId } }),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.organizations.listMembers.queryKey({
					input: { organizationId },
				}),
			}),
			// 공고 작성의 게시 범위 목록이 팀을 그대로 쓴다.
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.onboarding.getMine.queryKey(),
			}),
		]);
	const onError = (title: string, fallback: string) => (error: unknown) =>
		Alert.alert(title, localErrorMessage(error, fallback));
	const onSuccess =
		(close: () => void, title: string, body: string) => async () => {
			close();
			Alert.alert(title, body);
			await invalidateTeams();
		};

	return {
		create: useMutation(
			orpc.bambi.teams.create.mutationOptions({
				onError: onError("만들지 못했어요", "팀을 만들지 못했어요."),
				onSuccess: onSuccess(closeForm, "만들었어요", "새 팀을 추가했어요."),
			})
		),
		remove: useMutation(
			orpc.bambi.teams.deleteTeam.mutationOptions({
				onError: onError("삭제하지 못했어요", "팀을 삭제하지 못했어요."),
				onSuccess: onSuccess(closeDelete, "삭제했어요", "팀을 삭제했어요."),
			})
		),
		update: useMutation(
			orpc.bambi.teams.update.mutationOptions({
				onError: onError("저장하지 못했어요", "팀 정보를 저장하지 못했어요."),
				onSuccess: onSuccess(closeForm, "저장했어요", "팀 정보를 변경했어요."),
			})
		),
	};
}

export default function EmployerTeamsScreen() {
	const organizationsQuery = useQuery(
		orpc.bambi.organizations.getMine.queryOptions()
	);
	const regionsQuery = useQuery(orpc.bambi.regions.list.queryOptions());
	const [selectedId, setSelectedId] = useState("");
	// null이면 닫힘, ""이면 새 팀, 그 외에는 수정 대상 teamId.
	const [formTarget, setFormTarget] = useState<null | string>(null);
	const [deletingTeam, setDeletingTeam] = useState<null | TeamRow>(null);

	const organizations = organizationsQuery.data ?? [];
	const selectedOrganization =
		organizations.find(
			(organization) => organization.organizationId === selectedId
		) ?? organizations[0];
	const organizationId = selectedOrganization?.organizationId ?? "";

	const teamsQuery = useQuery({
		...orpc.bambi.teams.list.queryOptions({ input: { organizationId } }),
		enabled: Boolean(organizationId),
	});
	const teams: TeamRow[] = teamsQuery.data ?? [];

	const { create, remove, update } = useTeamMutations({
		closeDelete: () => setDeletingTeam(null),
		closeForm: () => setFormTarget(null),
		organizationId,
	});

	if (organizationsQuery.isLoading) {
		return <LoadingState label="조직 정보를 불러오고 있어요." />;
	}

	if (organizationsQuery.isError) {
		return <ErrorState onRetry={() => organizationsQuery.refetch()} />;
	}

	if (!selectedOrganization) {
		return (
			<BambiScreen>
				<StateCard
					description="조직 소유자나 매니저 권한이 있어야 팀을 관리할 수 있어요."
					title="관리할 수 있는 조직이 없어요"
				/>
			</BambiScreen>
		);
	}

	const gate = getEmployerGateNotice(
		selectedOrganization.verificationStatus,
		"팀을 관리"
	);
	const isVerified = gate === null;
	const editingTeam = teams.find((team) => team.teamId === formTarget) ?? null;
	const regions = regionsQuery.data ?? [];

	return (
		<BambiScreen>
			<BambiHeader
				action={
					<Button
						isDisabled={!isVerified}
						onPress={() => setFormTarget("")}
						size="sm"
					>
						<Button.Label>새 팀</Button.Label>
					</Button>
				}
				description="팀을 만들고 멤버 초대·권한을 관리해요."
				title="팀 관리"
			/>

			{/* 조직이 하나뿐이면 고를 것이 없어 셀렉트를 감춘다. */}
			{organizations.length > 1 ? (
				<FieldSelect
					label="관리 조직"
					onChange={setSelectedId}
					options={organizations.map((organization) => ({
						label: organization.displayName,
						value: organization.organizationId,
					}))}
					placeholder="조직을 골라 주세요"
					value={organizationId}
				/>
			) : null}

			{gate ? (
				<StateCard description={gate.description} title={gate.title} />
			) : null}

			<TeamList
				isVerified={isVerified}
				onDelete={setDeletingTeam}
				onEdit={(team) => setFormTarget(team.teamId)}
				onRetry={() => teamsQuery.refetch()}
				regions={regions}
				status={toListStatus(teamsQuery)}
				teams={teams}
			/>

			<TeamMemberSection
				canManageOrganization={selectedOrganization.canManageOrganization}
				isVerified={isVerified}
				organizationId={organizationId}
				teams={teams.map((team) => ({
					displayName: teamName(team),
					teamId: team.teamId,
				}))}
			/>

			{formTarget === null ? null : (
				<TeamFormDialog
					initialValues={
						editingTeam
							? {
									displayName: teamName(editingTeam),
									districtCode: editingTeam.districtCode ?? "",
									regionCode: editingTeam.regionCode ?? "",
								}
							: EMPTY_TEAM_FORM
					}
					isPending={create.isPending || update.isPending}
					key={formTarget}
					onClose={() => setFormTarget(null)}
					onSubmit={(input) => {
						if (editingTeam) {
							update.mutate({
								...input,
								organizationId,
								teamId: editingTeam.teamId,
							});
							return;
						}

						create.mutate({ ...input, organizationId });
					}}
					regions={regions}
					title={editingTeam ? "팀 정보 수정" : "새 팀 만들기"}
				/>
			)}

			{deletingTeam ? (
				<DeleteTeamDialog
					isPending={remove.isPending}
					label={teamName(deletingTeam)}
					onClose={() => setDeletingTeam(null)}
					onConfirm={() =>
						remove.mutate({
							organizationId,
							teamId: deletingTeam.teamId,
						})
					}
				/>
			) : null}
		</BambiScreen>
	);
}
