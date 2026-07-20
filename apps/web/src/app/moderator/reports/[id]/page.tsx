"use client";

import { useParams, useRouter } from "next/navigation";
import { ReportDetail } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";

export default function ModeratorReportDetailPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const {
		blockChatRoom,
		isBlockingChatRoom,
		isLoading,
		reports,
		resolveReport,
		sanction,
	} = useMod();
	const item = reports.find((r) => r.id === id);

	if (isLoading) {
		return null;
	}

	if (!item) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
				<p className="m-0 font-bold text-[15px] text-foreground">
					신고 내역을 찾을 수 없어요.
				</p>
				<button
					className="h-10 rounded-xl border border-border bg-card px-4 font-bold text-[13px] text-foreground"
					onClick={() => router.push("/moderator/reports")}
					type="button"
				>
					목록으로
				</button>
			</div>
		);
	}

	return (
		<ReportDetail
			isBlockingChatRoom={isBlockingChatRoom}
			item={item}
			onBack={() => router.push("/moderator/reports")}
			onBlockChatRoom={blockChatRoom}
			onResolve={(rid, action) => {
				resolveReport(rid, action);
				router.push("/moderator/reports");
			}}
			onSanction={sanction}
		/>
	);
}
