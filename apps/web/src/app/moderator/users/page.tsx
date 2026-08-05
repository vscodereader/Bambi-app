"use client";

// 밤비 — 운영자 사용자 관리 목록. 계정 조회는 ModProvider가 한 번만 하고(라우트 간 공유),
// 이 화면은 상태·역할·인증·누적 신고/경고 필터와 이름·이메일·아이디 검색을 클라이언트에서
// 적용한다. 레이아웃·필터·빈 상태 패턴은 공고 관리(/moderator/jobs)와 동일하다.

import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/bambi/empty-state";
import { ModeratorUsersTable } from "@/components/bambi/moderator-users-table";
import { useMod } from "@/components/bambi/screens/moderator-context";
import { userRoleLabel } from "@/lib/bambi/moderation-labels";
import type { ManagedUser } from "@/lib/bambi/types";

// 탈퇴는 계정 상태 enum이 아니라 deletedAt 유무지만, 운영자 눈에는 같은 축이라 함께 둔다.
type StatusFilter = "all" | "active" | "warned" | "suspended" | "deleted";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "전체" },
	{ value: "active", label: "정상" },
	{ value: "warned", label: "경고" },
	{ value: "suspended", label: "정지" },
	{ value: "deleted", label: "탈퇴" },
];
// 값은 역할 enum 원값, 표시·비교는 공용 라벨(ManagedUser.role이 이미 라벨 문자열이다).
const ROLE_FILTER_ITEMS: Record<string, string> = {
	all: "전체",
	job_seeker: userRoleLabel("job_seeker"),
	legal_advisor: userRoleLabel("legal_advisor"),
	employer: userRoleLabel("employer"),
	admin: userRoleLabel("admin"),
};
const PHONE_FILTER_ITEMS: Record<string, string> = {
	all: "전체",
	verified: "인증",
	unverified: "미인증",
};
// 누적 신고·경고 횟수 최소 기준 필터. 값은 "N 이상"을 의미한다("0"=전체).
const REPORT_FILTER_ITEMS: Record<string, string> = {
	"0": "전체",
	"1": "1건 이상",
	"3": "3건 이상",
	"5": "5건 이상",
	"10": "10건 이상",
};
const WARNING_FILTER_ITEMS: Record<string, string> = {
	"0": "전체",
	"1": "1회 이상",
	"3": "3회 이상",
	"5": "5회 이상",
};

// 탈퇴 계정은 제재 상태 필터(정상·경고·정지)에서 빼 둔다 — 목록 배지도 탈퇴가 우선이라
// "정지"로 걸러 놓고 탈퇴 행이 섞여 나오면 조치 대상 판단이 흐려진다.
const matchesStatus = (user: ManagedUser, filter: StatusFilter): boolean => {
	if (filter === "all") {
		return true;
	}

	if (filter === "deleted") {
		return user.deletedAt !== null;
	}

	return user.deletedAt === null && user.status === filter;
};

const matchesKeyword = (user: ManagedUser, keyword: string): boolean =>
	keyword.length === 0 ||
	[user.name, user.email, user.loginId ?? ""].some((field) =>
		field.toLowerCase().includes(keyword)
	);

const matchesPhone = (user: ManagedUser, filter: string): boolean =>
	filter === "all" || user.isPhoneVerified === (filter === "verified");

export default function ModeratorUsersPage() {
	const {
		clearSelection,
		isLoading,
		isUsersError,
		selected,
		toggleSelect,
		users,
	} = useMod();
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [roleFilter, setRoleFilter] = useState("all");
	const [phoneFilter, setPhoneFilter] = useState("all");
	const [minReports, setMinReports] = useState(0);
	const [minWarnings, setMinWarnings] = useState(0);
	const [search, setSearch] = useState("");

	const filteredUsers = useMemo(() => {
		const keyword = search.trim().toLowerCase();

		return users.filter(
			(user) =>
				matchesStatus(user, statusFilter) &&
				(roleFilter === "all" || user.role === ROLE_FILTER_ITEMS[roleFilter]) &&
				matchesPhone(user, phoneFilter) &&
				user.reports >= minReports &&
				user.warnings >= minWarnings &&
				matchesKeyword(user, keyword)
		);
	}, [
		users,
		statusFilter,
		roleFilter,
		phoneFilter,
		minReports,
		minWarnings,
		search,
	]);

	// 전체 선택 토글: 현재 필터된 목록 기준으로 전부 선택돼 있으면 해제, 아니면 선택한다.
	const toggleAll = () => {
		if (
			filteredUsers.length > 0 &&
			filteredUsers.every((user) => selected.includes(user.id))
		) {
			clearSelection();
			return;
		}

		for (const user of filteredUsers) {
			if (!selected.includes(user.id)) {
				toggleSelect(user.id);
			}
		}
	};

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">사용자 관리</h1>
				<p className="m-0 text-muted-foreground text-sm">
					가입 계정을 상태·역할·인증 여부로 좁혀 보고, 이름·이메일·로그인
					아이디로 검색합니다. 경고·정지 같은 제재는 각 계정 상세에서
					진행합니다.
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<Tabs
					onValueChange={(value) => setStatusFilter(value as StatusFilter)}
					value={statusFilter}
				>
					<TabsList className="max-w-full flex-wrap">
						{STATUS_FILTERS.map((option) => (
							<TabsTrigger key={option.value} value={option.value}>
								{option.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<Input
					className="max-w-xs"
					onChange={(event) => setSearch(event.target.value)}
					placeholder="이름·이메일·로그인 아이디 검색"
					value={search}
				/>
			</div>

			<div className="flex flex-wrap items-end gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="filter-role">역할</Label>
					<Select
						items={ROLE_FILTER_ITEMS}
						onValueChange={(value) => setRoleFilter(String(value))}
						value={roleFilter}
					>
						<SelectTrigger className="w-36" id="filter-role">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(ROLE_FILTER_ITEMS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="filter-phone">휴대폰 인증</Label>
					<Select
						items={PHONE_FILTER_ITEMS}
						onValueChange={(value) => setPhoneFilter(String(value))}
						value={phoneFilter}
					>
						<SelectTrigger className="w-36" id="filter-phone">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(PHONE_FILTER_ITEMS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="filter-reports">누적 신고</Label>
					<Select
						items={REPORT_FILTER_ITEMS}
						onValueChange={(value) => setMinReports(Number(value))}
						value={String(minReports)}
					>
						<SelectTrigger className="w-36" id="filter-reports">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(REPORT_FILTER_ITEMS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="filter-warnings">경고 횟수</Label>
					<Select
						items={WARNING_FILTER_ITEMS}
						onValueChange={(value) => setMinWarnings(Number(value))}
						value={String(minWarnings)}
					>
						<SelectTrigger className="w-36" id="filter-warnings">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(WARNING_FILTER_ITEMS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{isLoading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : null}

			{isUsersError && !isLoading ? (
				<EmptyState
					description="목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{!(isLoading || isUsersError) && filteredUsers.length === 0 ? (
				<EmptyState
					description={
						search.trim()
							? "검색 조건에 맞는 사용자가 없어요."
							: "선택한 조건에 해당하는 사용자가 없어요."
					}
					title="표시할 사용자가 없어요"
				/>
			) : null}

			{!(isLoading || isUsersError) && filteredUsers.length > 0 ? (
				<ModeratorUsersTable
					onToggle={toggleSelect}
					onToggleAll={toggleAll}
					selected={selected}
					users={filteredUsers}
				/>
			) : null}
		</div>
	);
}
