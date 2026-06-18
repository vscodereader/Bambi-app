"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { UserList } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";

export default function ModeratorUsersPage() {
	const router = useRouter();
	const { users } = useMod();
	return (
		<UserList
			items={users}
			onOpen={(u) => router.push(`/moderator/users/${u.id}` as Route)}
		/>
	);
}
