"use client";

import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { useMemo, useState } from "react";
import { ModeratorUsersTable } from "@/components/bambi/moderator-users-table";
import { useMod } from "@/components/bambi/screens/moderator-context";

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

export default function ModeratorUsersPage() {
	const { clearSelection, selected, toggleSelect, users } = useMod();
	const [minReports, setMinReports] = useState(0);
	const [minWarnings, setMinWarnings] = useState(0);

	// 누적 신고·경고 횟수 기준을 모두 만족하는 사용자만 남긴다.
	const filteredUsers = useMemo(
		() =>
			users.filter(
				(user) => user.reports >= minReports && user.warnings >= minWarnings
			),
		[users, minReports, minWarnings]
	);

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
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-wrap items-end gap-4 px-6 pt-4">
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
			<ModeratorUsersTable
				onToggle={toggleSelect}
				onToggleAll={toggleAll}
				selected={selected}
				users={filteredUsers}
			/>
		</div>
	);
}
