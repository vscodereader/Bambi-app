"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@bambi-app/ui/components/dropdown-menu";
import { cn } from "@bambi-app/ui/lib/utils";
import {
	BanIcon,
	EllipsisIcon,
	PauseIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
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

const SANCTION_LABEL = {
	warned: "경고를 보냈어요",
	suspended: "이용을 정지했어요",
	blocked: "계정을 차단했어요",
} as const;

type ConfirmableSanction = "suspended" | "blocked";

// 되돌리기 부담이 큰 정지·차단은 드롭다운에서 바로 실행하지 않고 확인 다이얼로그를 거친다.
const CONFIRM_CONF: Record<
	ConfirmableSanction,
	{ cta: string; description: string; title: string }
> = {
	suspended: {
		cta: "이용 정지",
		description: "7일 동안 이 사용자의 공고 등록과 채팅이 제한됩니다.",
		title: "이용 정지",
	},
	blocked: {
		cta: "영구 차단",
		description:
			"계정을 즉시 차단하고 모든 공고를 내립니다. 신중히 진행해 주세요.",
		title: "영구 차단",
	},
};

interface SanctionHandler {
	onSanction: (id: string, status: UserStatus, label: string) => void;
}

function UserRowActions({
	onSanction,
	user,
}: SanctionHandler & { user: ManagedUser }) {
	const [confirm, setConfirm] = useState<ConfirmableSanction | null>(null);
	const meta = confirm ? CONFIRM_CONF[confirm] : null;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label="사용자 제재 메뉴"
					className={cn(buttonVariants({ size: "icon-sm", variant: "ghost" }))}
				>
					<EllipsisIcon />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onClick={() => onSanction(user.id, "warned", SANCTION_LABEL.warned)}
					>
						<TriangleAlertIcon />
						경고 보내기
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => setConfirm("suspended")}
						variant="destructive"
					>
						<PauseIcon />
						이용 정지 (7일)
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => setConfirm("blocked")}
						variant="destructive"
					>
						<BanIcon />
						영구 차단
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setConfirm(null);
					}
				}}
				open={confirm !== null}
			>
				<DialogContent>
					<DialogTitle>
						{user.name} · {meta?.title}
					</DialogTitle>
					<DialogDescription>{meta?.description}</DialogDescription>
					<div className="flex justify-end gap-2">
						<Button
							onClick={() => setConfirm(null)}
							type="button"
							variant="outline"
						>
							취소
						</Button>
						<Button
							onClick={() => {
								if (confirm) {
									onSanction(user.id, confirm, SANCTION_LABEL[confirm]);
									setConfirm(null);
								}
							}}
							type="button"
							variant="destructive"
						>
							{meta?.cta}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

interface ModeratorUsersTableProps extends SanctionHandler {
	onToggle: (id: string) => void;
	onToggleAll: () => void;
	selected: string[];
	users: ManagedUser[];
}

function getColumns({
	allSelected,
	onSanction,
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
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (user) => <UserRowActions onSanction={onSanction} user={user} />,
		},
	];
}

export function ModeratorUsersTable({
	onSanction,
	onToggle,
	onToggleAll,
	selected,
	users,
}: ModeratorUsersTableProps) {
	const allSelected =
		users.length > 0 && users.every((user) => selected.includes(user.id));
	const columns = getColumns({
		allSelected,
		onSanction,
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
			/>
		</div>
	);
}
