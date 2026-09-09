import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	matchesUserStatusFilter,
	USER_STATUS_FILTER_LABELS,
	type UserStatusFilter,
	userRoleLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
import {
	isUserOnline,
	POSTGRES_INTEGER_MAX,
} from "@bambi-app/api/services/bambi-user-presence";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import {
	Button,
	Input,
	SearchField,
	Surface,
	TextField,
	useToast,
} from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import {
	BambiHeader,
	ErrorState,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import {
	BulkActions,
	SelectableModerationRow,
	useBulkSelection,
} from "@/src/components/moderation/bulk-actions";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import { PresenceIndicator } from "@/src/components/moderation/presence-indicator";
import { accountStatusBadge } from "@/src/lib/bambi-native";
import {
	resolveLivePresence,
	useModeratorPresence,
} from "@/src/lib/moderation/presence-stream";
import { userListOptions } from "@/src/lib/moderation/queries";
import { orpc } from "@/src/lib/orpc";
import { useDebouncedValue } from "@/src/lib/use-debounced-value";

type ModeratorUser = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listUsers"]>
>[number];

const STATUS_OPTIONS = (
	["all", "active", "warned", "suspended", "deleted"] as const
).map((value) => ({ label: USER_STATUS_FILTER_LABELS[value], value }));

// 역할은 상태보다 덜 쓰는 축이라 칩 대신 시트로 접는다(칩 두 줄이 목록을 밀어낸다).
const ROLE_OPTIONS = [
	{ label: "전체 역할", value: "all" },
	{ label: "구직자", value: "job_seeker" },
	{ label: "법률자문", value: "legal_advisor" },
	{ label: "구인자", value: "employer" },
	{ label: "운영자", value: "admin" },
] as const;

// 목록 행이 상세로 넘기는 것은 id뿐이다 — 상세는 같은 목록 캐시에서 항목을 다시 찾는다.
const userDetailHref = (id: string): Href =>
	({
		params: { id },
		pathname: "/(moderator)/users/[id]",
	}) as unknown as Href;

const matchesKeyword = (user: ModeratorUser, keyword: string): boolean =>
	keyword.length === 0 ||
	[user.name, user.email, user.loginId].some((value) =>
		(value ?? "").toLowerCase().includes(keyword)
	);

function UserRowCard({
	isOnline,
	user,
}: {
	isOnline: boolean;
	user: ModeratorUser;
}) {
	const badge = accountStatusBadge(user.status);
	const roleLabel = userRoleLabel(user.role);
	const counts = `신고 ${user.reportsCount}건 · 경고 ${user.warningsCount}회`;
	const name = user.name || user.email;

	return (
		<Pressable
			accessibilityLabel={`${name}, ${roleLabel}, ${user.deletedAt ? "탈퇴" : badge.label}, ${counts}`}
			accessibilityRole="button"
			accessible
			className="active:opacity-75"
			onPress={() => router.push(userDetailHref(user.userId))}
		>
			<Surface
				className="gap-2 rounded-lg p-4"
				importantForAccessibility="no-hide-descendants"
				variant="secondary"
			>
				<View className="flex-row items-center gap-2">
					<PresenceIndicator isOnline={isOnline} />
					<Text className="text-muted text-xs">
						{isOnline ? "온라인" : "오프라인"}
					</Text>
				</View>
				<View className="flex-row flex-wrap gap-2">
					<Pill tone={badge.tone}>{badge.label}</Pill>
					{user.deletedAt ? <Pill tone="neutral">탈퇴</Pill> : null}
					<Pill>{roleLabel}</Pill>
				</View>
				<Text className="font-bold text-base text-foreground" numberOfLines={1}>
					{name}
				</Text>
				<Text className="text-muted text-xs" numberOfLines={1}>
					{user.loginId ?? user.email}
				</Text>
				<Text className="text-muted text-xs">{counts}</Text>
			</Surface>
		</Pressable>
	);
}

export default function ModeratorUsersScreen() {
	const params = useLocalSearchParams<{ status?: string }>();
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState<UserStatusFilter>("all");
	useEffect(() => {
		if (params.status === "warned") {
			setStatus("warned");
		}
	}, [params.status]);
	const [role, setRole] = useState("all");
	const [phone, setPhone] = useState("all");
	const [minReports, setMinReports] = useState("");
	const [minWarnings, setMinWarnings] = useState("");
	const [sort, setSort] = useState("recent");
	const selection = useBulkSelection(
		`${status}-${role}-${query}-${phone}-${minReports}-${minWarnings}-${sort}`
	);
	const [offlineAfterMinutes, setOfflineAfterMinutes] = useState("");
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const presence = useModeratorPresence();
	const policy = useQuery(
		orpc.bambi.siteSettings.getPresencePolicy.queryOptions()
	);
	const updatePolicy = useMutation(
		orpc.bambi.siteSettings.updatePresencePolicy.mutationOptions({
			onSuccess: async () => {
				toast.show({ label: "오프라인 기준을 저장했어요." });
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getPresencePolicy.queryKey(),
				});
			},
		})
	);
	const usersQuery = useQuery(userListOptions());
	const refetchPolicy = policy.refetch;
	const refetchUsers = usersQuery.refetch;
	useEffect(() => {
		if (policy.data) {
			setOfflineAfterMinutes(String(policy.data.offlineAfterMinutes));
		}
	}, [policy.data]);
	useEffect(() => {
		if (presence.reconnectRevision > 0) {
			refetchUsers().catch(() => undefined);
			refetchPolicy().catch(() => undefined);
		}
	}, [presence.reconnectRevision, refetchPolicy, refetchUsers]);
	// 서버가 이미 가입일 내림차순으로 주므로(listUsers orderBy) 다시 정렬하지 않는다.
	const keyword = useDebouncedValue(query).trim().toLowerCase();
	const users = useMemo(
		() =>
			(usersQuery.data ?? [])
				.map((user) => {
					const live = resolveLivePresence(
						presence.users.get(user.userId),
						user
					);
					return {
						...user,
						isOnline: isUserOnline({
							...live,
							now: new Date(presence.now),
							offlineAfterMinutes:
								presence.policyMinutes ?? user.offlineAfterMinutes,
						}),
					};
				})
				.filter(
					(user) =>
						matchesUserStatusFilter(user, status) &&
						(role === "all" || user.role === role) &&
						(phone === "all" ||
							user.isPhoneVerified === (phone === "verified")) &&
						user.reportsCount >= Number(minReports) &&
						user.warningsCount >= Number(minWarnings) &&
						matchesKeyword(user, keyword)
				)
				.sort((a, b) => {
					if (sort === "reports") {
						return b.reportsCount - a.reportsCount;
					}
					if (sort === "warnings") {
						return b.warningsCount - a.warningsCount;
					}
					if (sort === "name") {
						return a.name.localeCompare(b.name, "ko");
					}
					return 0;
				}),
		[
			usersQuery.data,
			keyword,
			presence,
			role,
			status,
			phone,
			minReports,
			minWarnings,
			sort,
		]
	);
	const savePolicy = () => {
		const value = Number(offlineAfterMinutes);
		if (
			!Number.isSafeInteger(value) ||
			value < 1 ||
			value > POSTGRES_INTEGER_MAX
		) {
			toast.show({
				label: "오프라인 기준은 1 이상의 분 단위 정수로 입력해 주세요.",
				variant: "danger",
			});
			return;
		}
		updatePolicy.mutate({ offlineAfterMinutes: value });
	};

	if (usersQuery.isLoading) {
		return <LoadingState label="사용자 목록을 불러오고 있습니다." />;
	}

	if (usersQuery.isError) {
		return <ErrorState onRetry={() => usersQuery.refetch()} />;
	}

	// 검색 입력은 FlatList 밖 형제로 둔다 — ListHeaderComponent에 넣으면 목록이 다시
	// 그려질 때 입력이 재마운트돼 키보드 포커스가 끊긴다(검수 목록과 같은 구성).
	return (
		<View className="flex-1 bg-background">
			<View className="gap-3 px-4">
				<BambiHeader
					action={
						<Button
							onPress={() => router.push("/(moderator)/users/create" as Href)}
							size="sm"
							variant="secondary"
						>
							<Button.Label>계정 생성</Button.Label>
						</Button>
					}
					description="계정 상태와 역할을 확인하고 제재·복구를 처리합니다."
					title="사용자 관리"
				/>
				<SearchField onChange={setQuery} value={query}>
					<SearchField.Group>
						<SearchField.SearchIcon />
						<SearchField.Input
							placeholder="이름·이메일·아이디 검색"
							returnKeyType="search"
						/>
						<SearchField.ClearButton />
					</SearchField.Group>
				</SearchField>
			</View>
			<FilterChips
				onChange={(value) => {
					setStatus(value);
					router.setParams({ status: undefined });
				}}
				options={STATUS_OPTIONS}
				value={status}
			/>
			<View className="px-4">
				<View className="mb-3 flex-row items-end gap-2">
					<View className="flex-1">
						<TextField>
							<Input
								accessibilityLabel="오프라인 기준 시간"
								keyboardType="number-pad"
								onChangeText={setOfflineAfterMinutes}
								placeholder="분"
								value={offlineAfterMinutes}
							/>
						</TextField>
					</View>
					<Button
						isDisabled={updatePolicy.isPending}
						onPress={savePolicy}
						size="sm"
						variant="secondary"
					>
						<Button.Label>기준 저장</Button.Label>
					</Button>
				</View>
				<FieldSelect
					isLabelHidden
					label="역할"
					onChange={setRole}
					options={ROLE_OPTIONS}
					placeholder="전체 역할"
					value={role}
				/>
			</View>
			<FlatList
				contentContainerClassName="gap-3 p-4"
				data={users}
				keyboardDismissMode="on-drag"
				keyboardShouldPersistTaps="handled"
				keyExtractor={(user) => user.userId}
				ListEmptyComponent={
					<StateCard
						description="검색어와 필터를 바꿔서 다시 찾아 보세요."
						title="조건에 맞는 사용자가 없어요"
					/>
				}
				ListHeaderComponent={
					<View className="gap-2">
						<BulkActions
							ids={selection.ids}
							kind="users"
							onChanged={selection.setIds}
						/>
						<FieldSelect
							label="휴대폰 인증"
							onChange={setPhone}
							options={[
								{ value: "all", label: "전체 인증 상태" },
								{ value: "verified", label: "인증됨" },
								{ value: "unverified", label: "미인증" },
							]}
							placeholder="전체"
							value={phone}
						/>
						<TextField>
							<Input
								accessibilityLabel="최소 신고 수"
								keyboardType="number-pad"
								onChangeText={setMinReports}
								placeholder="최소 신고 수"
								value={minReports}
							/>
						</TextField>
						<TextField>
							<Input
								accessibilityLabel="최소 경고 수"
								keyboardType="number-pad"
								onChangeText={setMinWarnings}
								placeholder="최소 경고 수"
								value={minWarnings}
							/>
						</TextField>
						<FieldSelect
							label="사용자 정렬"
							onChange={setSort}
							options={[
								{ value: "recent", label: "가입 최신순" },
								{ value: "name", label: "이름순" },
								{ value: "reports", label: "신고 많은 순" },
								{ value: "warnings", label: "경고 많은 순" },
							]}
							placeholder="가입 최신순"
							value={sort}
						/>
					</View>
				}
				refreshControl={
					<RefreshControl
						onRefresh={() => usersQuery.refetch()}
						refreshing={usersQuery.isRefetching}
					/>
				}
				renderItem={({ item }) => (
					<SelectableModerationRow
						onToggle={() => selection.toggle(item.userId)}
						selected={selection.ids.includes(item.userId)}
					>
						<UserRowCard isOnline={item.isOnline} user={item} />
					</SelectableModerationRow>
				)}
			/>
		</View>
	);
}
