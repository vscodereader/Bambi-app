"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ReportDetail } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";

export default function ModeratorReportDetailPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const { reports, resolveReport, sanction } = useMod();
	const item = reports.find((r) => r.id === id);

	useEffect(() => {
		if (!item) {
			router.replace("/moderator/reports");
		}
	}, [item, router]);

	if (!item) {
		return null;
	}
	return (
		<ReportDetail
			item={item}
			onBack={() => router.push("/moderator/reports")}
			onResolve={(rid, action) => {
				resolveReport(rid, action);
				router.push("/moderator/reports");
			}}
			onSanction={sanction}
		/>
	);
}
