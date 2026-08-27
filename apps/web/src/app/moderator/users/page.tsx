"use client";

// 밤비 — 운영자 사용자 관리 목록. 계정 조회는 ModProvider가 한 번만 하고(라우트 간 공유),
// 이 화면은 상태·역할·인증·누적 신고/경고 필터와 이름·이메일·아이디 검색을 클라이언트에서
// 적용한다. 레이아웃·필터·빈 상태 패턴은 공고 관리(/moderator/jobs)와 동일하다.

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
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/bambi/empty-state";
import { ModeratorUsersTable } from "@/components/bambi/moderator-users-table";
import {
	type LegalAdvisorChoice,
	legalAdvisorChoice,
	ReasonConfirmSheet,
} from "@/components/bambi/screens/moderator";
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: URL-backed filters and responsive controls share one page state boundary.
export default function ModeratorUsersPage() {
	const searchParams = useSearchParams();
	const pathname = usePathname();
	const router = useRouter();
	const {
		clearSelection,
		isLoading,
		isUsersError,
		selected,
		setLegalAdvisor,
		toggleSelect,
		users,
	} = useMod();
	const requestedStatus = searchParams.get("status");
	const initialStatus = STATUS_FILTERS.some(
		(option) => option.value === requestedStatus
	)
		? (requestedStatus as StatusFilter)
		: "all";
	const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
	const [roleFilter, setRoleFilter] = useState(
		searchParams.get("role") ?? "all"
	);
	const [phoneFilter, setPhoneFilter] = useState(
		searchParams.get("phone") ?? "all"
	);
	const [minReports, setMinReports] = useState(
		Number(searchParams.get("reports") ?? 0)
	);
	const [minWarnings, setMinWarnings] = useState(
		Number(searchParams.get("warnings") ?? 0)
	);
	const [search, setSearch] = useState(searchParams.get("q") ?? "");
	const [page, setPage] = useState(
		Math.max(0, Number(searchParams.get("page") ?? 1) - 1)
	);
	const updateLocation = (patch: Record<string, string>, resetPage = true) => {
		// 연달아 필터를 바꿔도 직전 router.replace가 반영되기 전의 searchParams로
		// 되돌아가지 않도록 브라우저의 현재 URL을 기준으로 다음 쿼리를 만든다.
		const next = new URLSearchParams(window.location.search);
		for (const [key, value] of Object.entries(patch)) {
			if (value === "" || value === "all" || value === "0") {
				next.delete(key);
			} else {
				next.set(key, value);
			}
		}
		if (resetPage) {
			next.delete("page");
		}
		const query = next.toString();
		router.replace(`${pathname}${query ? `?${query}` : ""}` as Route, {
			scroll: false,
		});
	};
	const changePage = (nextPage: number) => {
		setPage(nextPage);
		updateLocation({ page: String(nextPage + 1) }, false);
	};
	const currentQuery = searchParams.toString();
	const listHref = `${pathname}${currentQuery ? `?${currentQuery}` : ""}`;
	// 법률자문 지정·해제(사유 시트). 목록에서 대상 한 명을 체크하면 버튼이 나타난다.
	const [pendingRole, setPendingRole] = useState<{
		choice: LegalAdvisorChoice;
		user: ManagedUser;
	} | null>(null);
	const [isApplyingRole, setIsApplyingRole] = useState(false);

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
	let emptyDescription = "선택한 조건에 해당하는 사용자가 없어요.";
	if (statusFilter === "warned") {
		emptyDescription = "현재 경고 상태인 사용자가 없어요.";
	}
	if (search.trim()) {
		emptyDescription = "검색 조건에 맞는 사용자가 없어요.";
	}

	// 역할 수정은 한 명씩만 — 정확히 1명 선택됐고 그 계정이 구직자·법률자문(탈퇴 아님)일
	// 때만 버튼을 노출한다. 업소·운영자·탈퇴 계정은 서버가 어차피 거절하므로 아예 숨긴다.
	const roleTarget = useMemo(() => {
		if (selected.length !== 1) {
			return null;
		}

		const user = users.find((candidate) => candidate.id === selected[0]);
		if (!user || user.deletedAt) {
			return null;
		}

		const choice = legalAdvisorChoice(user.roleKey);
		return choice ? { choice, user } : null;
	}, [selected, users]);

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
					onValueChange={(value) => {
						setStatusFilter(value as StatusFilter);
						setPage(0);
						updateLocation({ status: String(value) });
					}}
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
					onChange={(event) => {
						setSearch(event.target.value);
						setPage(0);
						updateLocation({ q: event.target.value });
					}}
					placeholder="이름·이메일·로그인 아이디 검색"
					value={search}
				/>
			</div>

			<div className="flex flex-wrap items-end gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="filter-role">역할</Label>
					<Select
						items={ROLE_FILTER_ITEMS}
						onValueChange={(value) => {
							setRoleFilter(String(value));
							setPage(0);
							updateLocation({ role: String(value) });
						}}
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
						onValueChange={(value) => {
							setPhoneFilter(String(value));
							setPage(0);
							updateLocation({ phone: String(value) });
						}}
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
						onValueChange={(value) => {
							setMinReports(Number(value));
							setPage(0);
							updateLocation({ reports: String(value) });
						}}
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
						onValueChange={(value) => {
							setMinWarnings(Number(value));
							setPage(0);
							updateLocation({ warnings: String(value) });
						}}
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
				<Button
					onClick={() => router.push("/moderator/messages" as Route)}
					variant="outline"
				>
					쪽지 보내기
				</Button>
			</div>

			{roleTarget ? (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
					<span className="text-muted-foreground text-sm">
						<span className="font-medium text-foreground">
							{roleTarget.user.name}
						</span>
						{` 님(${roleTarget.user.role}) · ${roleTarget.choice.desc}`}
					</span>
					<Button
						onClick={() => setPendingRole(roleTarget)}
						size="sm"
						variant="outline"
					>
						{roleTarget.choice.title}
					</Button>
				</div>
			) : null}

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
					description={emptyDescription}
					title={
						statusFilter === "warned"
							? "경고 사용자가 없어요"
							: "표시할 사용자가 없어요"
					}
				/>
			) : null}

			{!(isLoading || isUsersError) && filteredUsers.length > 0 ? (
				<ModeratorUsersTable
					listHref={listHref}
					onPageChange={changePage}
					onToggle={toggleSelect}
					onToggleAll={toggleAll}
					page={page}
					selected={selected}
					users={filteredUsers}
				/>
			) : null}

			{pendingRole ? (
				<ReasonConfirmSheet
					confirmLabel={pendingRole.choice.confirmLabel}
					defaultReason={pendingRole.choice.defaultReason}
					description={`${pendingRole.user.name} 님에게 적용돼요 — ${pendingRole.choice.desc}`}
					isApplying={isApplyingRole}
					onCancel={() => setPendingRole(null)}
					onConfirm={async (reason) => {
						setIsApplyingRole(true);
						const ok = await setLegalAdvisor(
							pendingRole.user.id,
							pendingRole.choice.role,
							reason
						);
						setIsApplyingRole(false);
						// 성공했을 때만 닫고 선택을 푼다 — 실패하면 시트에 남아 사유를 고쳐 재시도.
						if (ok) {
							setPendingRole(null);
							clearSelection();
						}
					}}
					reasonFieldId="moderator-users-role-reason"
					reasonLabel="지정 사유"
					title={pendingRole.choice.title}
				/>
			) : null}
		</div>
	);
}
