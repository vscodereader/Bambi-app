"use client";

import { Checkbox } from "@bambi-app/ui/components/checkbox";
import type { Route } from "next";
import Link from "next/link";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { StatusBadge } from "@/components/bambi/status-badge";
import type { ManagedUser, UserStatus } from "@/lib/bambi/types";

type Tone = React.ComponentProps<typeof StatusBadge>["tone"];

const STATUS_CONF: Record<UserStatus, { label: string; tone: Tone }> = {
	active: { label: "정상", tone: "good" },
	warned: { label: "경고", tone: "warning" },
	suspended: { label: "정지", tone: "danger" },
	blocked: { label: "차단", tone: "danger" },
};

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
				<Link
					className="font-medium text-foreground underline-offset-4 hover:underline"
					href={`/moderator/users/${user.id}` as Route}
				>
					{user.name}
				</Link>
			),
		},
		{
			id: "displayName",
			header: "표시 이름",
			sortValue: (user) => user.displayName,
			cell: (user) =>
				user.displayName ? (
					<span className="break-keep text-muted-foreground">
						{user.displayName}
					</span>
				) : (
					<span className="text-muted-foreground">-</span>
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
			id: "status",
			header: "상태",
			sortValue: (user) => STATUS_CONF[user.status].label,
			cell: (user) => (
				<StatusBadge tone={STATUS_CONF[user.status].tone}>
					{STATUS_CONF[user.status].label}
				</StatusBadge>
			),
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
			sortValue: (user) => user.joined,
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
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-1 pb-5">
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
