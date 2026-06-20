"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { UserDetail } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";

export default function ModeratorUserDetailPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const { users, sanction } = useMod();
	const item = users.find((u) => u.id === id);

	useEffect(() => {
		if (!item) {
			router.replace("/moderator/users");
		}
	}, [item, router]);

	if (!item) {
		return null;
	}
	return (
		<UserDetail
			item={item}
			onBack={() => router.push("/moderator/users")}
			onSanction={(uid, status, label) => {
				sanction(uid, status, label);
				router.push("/moderator/users");
			}}
		/>
	);
}
