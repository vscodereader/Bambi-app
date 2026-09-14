import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	matchesUserStatusFilter,
	USER_STATUS_FILTER_LABELS,
	type UserStatusFilter,
	userRoleLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { SearchField, Surface } from "heroui-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import {
	ErrorState,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { accountStatusBadge } from "@/src/lib/bambi-native";
import { userListOptions } from "@/src/lib/moderation/queries";
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

function UserRowCard({ user }: { user: ModeratorUser }) {
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
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState<UserStatusFilter>("all");
	const [role, setRole] = useState("all");
	const usersQuery = useQuery(userListOptions());
	// 서버가 이미 가입일 내림차순으로 주므로(listUsers orderBy) 다시 정렬하지 않는다.
	const keyword = useDebouncedValue(query).trim().toLowerCase();
	const users = useMemo(
		() =>
			(usersQuery.data ?? []).filter(
				(user) =>
					matchesUserStatusFilter(user, status) &&
					(role === "all" || user.role === role) &&
					matchesKeyword(user, keyword)
			),
		[usersQuery.data, keyword, role, status]
	);

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
			{/* 스크롤 시 목록이 필터 행에 붙지 않게 경계를 긋는다. */}
			<View className="gap-3 border-border border-b px-4 py-3">
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
				{/* 두 축 모두 시트 트리거라 한 줄로 붙인다(폭이 반씩이라도 값 한 단어는 잘리지 않는다). */}
				<View className="flex-row gap-3">
					<View className="flex-1">
						{/* 45%: 항목 5개(각 48dp) + 시트 제목·핸들. */}
						<FieldSelect
							isLabelHidden
							label="상태"
							onChange={(next) => setStatus(next as UserStatusFilter)}
							options={STATUS_OPTIONS}
							placeholder="전체"
							snapPoints={["45%"]}
							value={status}
						/>
					</View>
					<View className="flex-1">
						<FieldSelect
							isLabelHidden
							label="역할"
							onChange={setRole}
							options={ROLE_OPTIONS}
							placeholder="전체 역할"
							snapPoints={["45%"]}
							value={role}
						/>
					</View>
				</View>
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
				refreshControl={
					<RefreshControl
						onRefresh={() => usersQuery.refetch()}
						refreshing={usersQuery.isRefetching}
					/>
				}
				renderItem={({ item }) => <UserRowCard user={item} />}
			/>
		</View>
	);
}
