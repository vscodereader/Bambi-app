"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ReportList } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";

// `?user=<id>`가 붙으면 해당 계정을 대상으로 한 신고만 보여준다(사용자 상세의
// "신고 내역 보기" 진입점). 목록은 이미 컨텍스트에 있어 클라이언트에서 거른다.
function ModeratorReportsView() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { reports, selected, toggleSelect } = useMod();
	const targetUserId = searchParams.get("user");
	const items = targetUserId
		? reports.filter(
				(report) =>
					report.targetType === "user" && report.targetId === targetUserId
			)
		: reports;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{targetUserId ? (
				<div className="flex flex-wrap items-center gap-2 px-6 pt-3">
					<Badge variant="secondary">특정 사용자 대상 신고만 보는 중</Badge>
					<Button
						onClick={() => router.replace("/moderator/reports")}
						size="sm"
						variant="ghost"
					>
						필터 해제
					</Button>
				</div>
			) : null}
			<ReportList
				items={items}
				onOpen={(r) => router.push(`/moderator/reports/${r.id}` as Route)}
				onToggle={toggleSelect}
				selected={selected}
			/>
		</div>
	);
}

export default function ModeratorReportsPage() {
	// useSearchParams는 Suspense 경계 안에서만 프리렌더된다(Next 요구사항).
	return (
		<Suspense>
			<ModeratorReportsView />
		</Suspense>
	);
}
