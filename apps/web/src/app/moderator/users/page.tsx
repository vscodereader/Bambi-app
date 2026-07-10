"use client";

import { ModeratorUsersTable } from "@/components/bambi/moderator-users-table";
import { useMod } from "@/components/bambi/screens/moderator-context";

export default function ModeratorUsersPage() {
	const { clearSelection, sanction, selected, toggleSelect, users } = useMod();

	// 전체 선택 토글: 이미 전부 선택돼 있으면 해제, 아니면 미선택 항목을 선택한다.
	const toggleAll = () => {
		if (users.length > 0 && users.every((user) => selected.includes(user.id))) {
			clearSelection();
			return;
		}

		for (const user of users) {
			if (!selected.includes(user.id)) {
				toggleSelect(user.id);
			}
		}
	};

	return (
		<ModeratorUsersTable
			onSanction={sanction}
			onToggle={toggleSelect}
			onToggleAll={toggleAll}
			selected={selected}
			users={users}
		/>
	);
}
