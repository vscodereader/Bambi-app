"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { orpc } from "@/utils/orpc";

// 업소 인증 상태 필터. "all"은 서버에 status 미전달(전체 조회)로 매핑한다.
type EmployerFilter = "all" | "pending" | "verified" | "rejected" | "none";
type VerificationStatus = "none" | "pending" | "verified" | "rejected";

const EMPLOYER_FILTERS: { value: EmployerFilter; label: string }[] = [
	{ value: "all", label: "전체" },
	{ value: "pending", label: "대기" },
	{ value: "verified", label: "승인" },
	{ value: "rejected", label: "반려" },
	{ value: "none", label: "미제출" },
];

const VERIFICATION_BADGE: Record<
	VerificationStatus,
	{
		label: string;
		variant: "success" | "warning" | "destructive" | "secondary";
	}
> = {
	none: { label: "미제출", variant: "secondary" },
	pending: { label: "승인 대기", variant: "warning" },
	verified: { label: "승인 완료", variant: "success" },
	rejected: { label: "반려", variant: "destructive" },
};

export default function ModeratorEmployersPage() {
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<EmployerFilter>("pending");
	const [notes, setNotes] = useState<Record<string, string>>({});
	const employersQuery = useQuery(
		orpc.bambi.moderation.listEmployers.queryOptions({
			input: {
				limit: 50,
				status: filter === "all" ? undefined : filter,
			},
		})
	);
	const decide = useMutation(
		orpc.bambi.moderation.setEmployerVerificationStatus.mutationOptions({
			onSuccess: async () => {
				toast.success("처리했어요.");
				// 부분 키(status 생략)로 모든 상태 필터 캐시를 함께 무효화한다.
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listEmployers.queryKey({
						input: { limit: 50 },
					}),
				});
			},
			onError: (error) => toast.error(error.message),
		})
	);
	const employers = employersQuery.data ?? [];

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-2xl">업소 관리</h1>
			<Tabs
				onValueChange={(value) => setFilter(value as EmployerFilter)}
				value={filter}
			>
				<TabsList className="max-w-full flex-wrap">
					{EMPLOYER_FILTERS.map((option) => (
						<TabsTrigger key={option.value} value={option.value}>
							{option.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			{employers.length === 0 ? (
				<EmptyState
					description="선택한 상태에 해당하는 업소가 없어요."
					title="표시할 업소가 없어요"
				/>
			) : null}
			{employers.map((employer) => {
				const badge = VERIFICATION_BADGE[employer.verificationStatus];
				// 반려는 다른 조치와 동일하게 사유 2자 이상을 강제한다("반려 시 필수" 안내와 일치).
				const rejectNote = (notes[employer.organizationId] ?? "").trim();
				const canReject = rejectNote.length >= 2;
				return (
					<Card key={employer.organizationId}>
						<CardHeader className="gap-2">
							<div className="flex flex-wrap items-center gap-2">
								<CardTitle>{employer.displayName}</CardTitle>
								<Badge className="ml-auto" variant={badge.variant}>
									{badge.label}
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<p className="m-0 text-muted-foreground text-sm">
								{employer.ownerEmail}
								{employer.businessRegistrationNumber
									? ` · 사업자 ${employer.businessRegistrationNumber}`
									: ""}
							</p>
							{employer.verificationNote ? (
								<p className="m-0 text-muted-foreground text-sm">
									반려 사유: {employer.verificationNote}
								</p>
							) : null}
							<Input
								onChange={(event) =>
									setNotes((prev) => ({
										...prev,
										[employer.organizationId]: event.target.value,
									}))
								}
								placeholder="반려 사유(반려 시 필수)"
								value={notes[employer.organizationId] ?? ""}
							/>
							<div className="flex gap-2">
								<Button
									disabled={decide.isPending}
									onClick={() =>
										decide.mutate({
											organizationId: employer.organizationId,
											reason: "서류 확인 완료",
											status: "verified",
										})
									}
								>
									승인
								</Button>
								<Button
									disabled={decide.isPending || !canReject}
									onClick={() =>
										decide.mutate({
											organizationId: employer.organizationId,
											reason: rejectNote,
											status: "rejected",
										})
									}
									variant="secondary"
								>
									반려
								</Button>
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
