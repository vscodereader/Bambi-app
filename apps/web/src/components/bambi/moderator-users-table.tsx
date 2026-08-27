"use client";

import { Checkbox } from "@bambi-app/ui/components/checkbox";
import type { Route } from "next";
import Link from "next/link";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { StatusBadge } from "@/components/bambi/status-badge";
import type { ManagedUser, UserStatus } from "@/lib/bambi/types";

type Tone = React.ComponentProps<typeof StatusBadge>["tone"];
const CENTER_HEADER = "text-center [&>button]:mx-auto";
const CENTER_CELL = "h-14 text-center align-middle";
const SELECT_COLUMN_CLASS = "w-10 !p-2 align-middle";

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

const truncateEmail = (email: string): string => {
	const characters = Array.from(email);
	return characters.length > 20
		? `${characters.slice(0, 20).join("")}...`
		: email;
};

const truncateName = (name: string): string => {
	const characters = Array.from(name);
	return characters.length > 7 ? `${characters.slice(0, 7).join("")}...` : name;
};

interface ModeratorUsersTableProps {
	listHref: string;
	onPageChange: (page: number) => void;
	onToggle: (id: string) => void;
	onToggleAll: () => void;
	page: number;
	selected: string[];
	users: ManagedUser[];
}

function getColumns({
	allSelected,
	onToggle,
	onToggleAll,
	selected,
	listHref,
}: Pick<
	ModeratorUsersTableProps,
	"listHref" | "onToggle" | "onToggleAll" | "selected"
> & {
	allSelected: boolean;
}): DataColumn<ManagedUser>[] {
	return [
		{
			id: "select",
			headerClassName: SELECT_COLUMN_CLASS,
			cellClassName: SELECT_COLUMN_CLASS,
			header: (
				<div className="flex justify-center">
					<Checkbox
						aria-label="전체 선택"
						checked={allSelected}
						onCheckedChange={onToggleAll}
					/>
				</div>
			),
			cell: (user) => (
				<div className="flex justify-center">
					<Checkbox
						aria-label={`${user.name} 선택`}
						checked={selected.includes(user.id)}
						onCheckedChange={() => onToggle(user.id)}
					/>
				</div>
			),
		},
		{
			id: "name",
			header: "이름",
			headerClassName: CENTER_HEADER,
			cellClassName: CENTER_CELL,
			sortValue: (user) => user.name,
			cell: (user) => (
				<Link
					className="whitespace-nowrap font-medium text-foreground underline-offset-4 hover:underline"
					href={
						`/moderator/users/${user.id}?returnTo=${encodeURIComponent(listHref)}` as Route
					}
					title={user.name}
				>
					{truncateName(user.name)}
				</Link>
			),
		},
		{
			id: "organization",
			header: "소속 업소",
			headerClassName: CENTER_HEADER,
			cellClassName: CENTER_CELL,
			sortValue: (user) => user.organizationNames.join(", "),
			cell: (user) => (
				<span className="mx-auto block max-w-36 truncate text-muted-foreground">
					{user.organizationNames.length > 0
						? user.organizationNames.join(", ")
						: "-"}
				</span>
			),
		},
		{
			id: "email",
			header: "이메일",
			headerClassName: CENTER_HEADER,
			cellClassName: CENTER_CELL,
			sortValue: (user) => user.email,
			cell: (user) => (
				<span
					className="mx-auto block max-w-44 truncate text-muted-foreground"
					title={user.email}
				>
					{truncateEmail(user.email)}
				</span>
			),
		},
		{
			id: "loginId",
			header: "아이디",
			headerClassName: CENTER_HEADER,
			cellClassName: CENTER_CELL,
			sortValue: (user) => user.loginId ?? "",
			cell: (user) => (
				<span className="mx-auto block max-w-32 truncate text-muted-foreground">
					{user.loginId ?? "-"}
				</span>
			),
		},
		{
			id: "role",
			header: "역할",
			headerClassName: CENTER_HEADER,
			cellClassName: CENTER_CELL,
			sortValue: (user) => user.role,
			cell: (user) => (
				<span className="text-muted-foreground">{user.role}</span>
			),
		},
		{
			id: "status",
			header: "상태",
			headerClassName: CENTER_HEADER,
			cellClassName: CENTER_CELL,
			sortValue: (user) => statusConf(user).label,
			cell: (user) => {
				const conf = statusConf(user);

				return <StatusBadge tone={conf.tone}>{conf.label}</StatusBadge>;
			},
		},
		{
			id: "reports",
			header: "누적 신고",
			headerClassName: CENTER_HEADER,
			cellClassName: CENTER_CELL,
			sortValue: (user) => user.reports,
			cell: (user) => (
				<span className="whitespace-nowrap">{`${user.reports}건`}</span>
			),
		},
		{
			id: "warnings",
			header: "경고",
			headerClassName: CENTER_HEADER,
			cellClassName: CENTER_CELL,
			sortValue: (user) => user.warnings,
			cell: (user) => (
				<span className="whitespace-nowrap">{`${user.warnings}회`}</span>
			),
		},
		{
			id: "joined",
			header: "가입일",
			headerClassName: CENTER_HEADER,
			cellClassName: CENTER_CELL,
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
	listHref,
	onPageChange,
	onToggle,
	onToggleAll,
	page,
	selected,
	users,
}: ModeratorUsersTableProps) {
	const allSelected =
		users.length > 0 && users.every((user) => selected.includes(user.id));
	const columns = getColumns({
		allSelected,
		listHref,
		onToggle,
		onToggleAll,
		selected,
	});

	return (
		<div className="w-full">
			<DataTable
				columns={columns}
				data={users}
				emptyMessage="사용자가 없습니다"
				getRowKey={(user) => user.id}
				onPageChange={onPageChange}
				page={page}
				pageSize={10}
				reservedPageRowHeight="3.5rem"
				reservePageRows
				rowClassName="h-14"
				showPageInput
				tableClassName="overflow-hidden rounded-xl border border-border [&_td]:px-1 [&_th]:px-1"
			/>
		</div>
	);
}
