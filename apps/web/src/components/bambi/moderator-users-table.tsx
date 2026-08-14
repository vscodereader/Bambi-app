"use client";

import { Checkbox } from "@bambi-app/ui/components/checkbox";
import type { Route } from "next";
import Link from "next/link";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { GradeBadge } from "@/components/bambi/grade-badge";
import { StatusBadge } from "@/components/bambi/status-badge";
import type { ManagedUser, UserStatus } from "@/lib/bambi/types";

type Tone = React.ComponentProps<typeof StatusBadge>["tone"];

const STATUS_CONF: Record<UserStatus, { label: string; tone: Tone }> = {
	active: { label: "정상", tone: "good" },
	warned: { label: "경고", tone: "warning" },
	suspended: { label: "정지", tone: "danger" },
};

// 탈퇴는 계정 상태 enum이 아니라 deletedAt으로 표현된다. 탈퇴한 계정에는 제재 상태 대신
// 탈퇴를 먼저 보여준다(정지된 채 탈퇴한 계정도 "탈퇴"가 운영 판단에 더 중요하다).
const statusConf = (user: ManagedUser): { label: string; tone: Tone } =>
	user.deletedAt
		? { label: "탈퇴", tone: "default" }
		: STATUS_CONF[user.status];

interface ModeratorUsersTableProps {
	onToggle: (id: string) => void;
	onToggleAll: () => void;
	selected: string[];
	users: ManagedUser[];
}

function getColumns({
	allSelected,
	onToggle,
	onToggleAll,
	selected,
}: Omit<ModeratorUsersTableProps, "users"> & {
	allSelected: boolean;
}): DataColumn<ManagedUser>[] {
	return [
		{
			id: "select",
			header: (
				<Checkbox
					aria-label="전체 선택"
					checked={allSelected}
					onCheckedChange={onToggleAll}
				/>
			),
			cell: (user) => (
				<Checkbox
					aria-label={`${user.name} 선택`}
					checked={selected.includes(user.id)}
					onCheckedChange={() => onToggle(user.id)}
				/>
			),
		},
		{
			id: "name",
			header: "이름",
			sortValue: (user) => user.name,
			cell: (user) => (
				<div className="flex flex-col gap-0.5">
					<Link
						className="font-medium text-foreground underline-offset-4 hover:underline"
						href={`/moderator/users/${user.id}` as Route}
					>
						{user.name}
					</Link>
					{user.organizationNames.length > 0 ? (
						<span className="max-w-56 truncate text-muted-foreground text-xs">
							{user.organizationNames.join(", ")}
						</span>
					) : null}
				</div>
			),
		},
		{
			id: "email",
			header: "이메일",
			sortValue: (user) => user.email,
			cell: (user) => (
				<span className="block max-w-56 truncate text-muted-foreground">
					{user.email}
				</span>
			),
		},
		{
			id: "loginId",
			header: "아이디",
			sortValue: (user) => user.loginId ?? "",
			cell: (user) => (
				<span className="block max-w-40 truncate text-muted-foreground">
					{user.loginId ?? "-"}
				</span>
			),
		},
		{
			id: "role",
			header: "역할",
			sortValue: (user) => user.role,
			cell: (user) => (
				<span className="text-muted-foreground">{user.role}</span>
			),
		},
		{
			id: "grade",
			header: "등급",
			sortValue: (user) => user.grade?.name ?? "",
			cell: (user) => <GradeBadge grade={user.grade} />,
		},
		{
			id: "points",
			header: "포인트",
			sortValue: (user) => user.pointBalance,
			cell: (user) => (
				<span className="whitespace-nowrap tabular-nums">
					{`${user.pointBalance.toLocaleString()}P`}
				</span>
			),
		},
		{
			id: "status",
			header: "상태",
			sortValue: (user) => statusConf(user).label,
			cell: (user) => {
				const conf = statusConf(user);

				return <StatusBadge tone={conf.tone}>{conf.label}</StatusBadge>;
			},
		},
		{
			id: "reports",
			header: "누적 신고",
			sortValue: (user) => user.reports,
			cell: (user) => (
				<span className="whitespace-nowrap">{`${user.reports}건`}</span>
			),
		},
		{
			id: "warnings",
			header: "경고",
			sortValue: (user) => user.warnings,
			cell: (user) => (
				<span className="whitespace-nowrap">{`${user.warnings}회`}</span>
			),
		},
		{
			id: "joined",
			header: "가입일",
			sortValue: (user) => user.joinedAt.getTime(),
			cell: (user) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{user.joined}
				</span>
			),
		},
	];
}

export function ModeratorUsersTable({
	onToggle,
	onToggleAll,
	selected,
	users,
}: ModeratorUsersTableProps) {
	const allSelected =
		users.length > 0 && users.every((user) => selected.includes(user.id));
	const columns = getColumns({
		allSelected,
		onToggle,
		onToggleAll,
		selected,
	});

	return (
		<div className="overflow-x-auto rounded-xl border border-border">
			<DataTable
				columns={columns}
				data={users}
				emptyMessage="사용자가 없습니다"
				getRowKey={(user) => user.id}
				pageSize={10}
			/>
		</div>
	);
}
