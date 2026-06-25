"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ReportList } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";

export default function ModeratorReportsPage() {
	const router = useRouter();
	const { reports, selected, toggleSelect } = useMod();
	return (
		<ReportList
			items={reports}
			onOpen={(r) => router.push(`/moderator/reports/${r.id}` as Route)}
			onToggle={toggleSelect}
			selected={selected}
		/>
	);
}
