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
import {
	formatBusinessStartDate,
	formatDateTime,
	formatNullable,
} from "@/lib/bambi-format";
import { getBiznumStatusLabel } from "@/lib/bambi-options";
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

// 한 화면에 담는 업소 수. 받은 건수가 이 값보다 적으면 마지막 페이지로 본다
// (전체 건수 집계 쿼리를 따로 돌리지 않기 위한 선택).
const PAGE_SIZE = 20;

export default function ModeratorEmployersPage() {
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<EmployerFilter>("pending");
	const [page, setPage] = useState(0);
	const [notes, setNotes] = useState<Record<string, string>>({});
	const employersQuery = useQuery(
		orpc.bambi.moderation.listEmployers.queryOptions({
			input: {
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
				status: filter === "all" ? undefined : filter,
			},
		})
	);
	const decide = useMutation(
		orpc.bambi.moderation.setEmployerVerificationStatus.mutationOptions({
			onSuccess: async (_result, variables) => {
				toast.success("처리했어요.");
				// 처리한 업소의 반려 사유 입력값은 지운다 — 남겨두면 다음에 같은 업소를
				// 다시 열었을 때 이미 처리한 사유가 그대로 남아 있다.
				setNotes((prev) => {
					const { [variables.organizationId]: _removed, ...rest } = prev;
					return rest;
				});
				// 입력 키 전체(상태 필터·페이지 무관)를 함께 무효화한다.
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listEmployers.key(),
				});
			},
			onError: (error) => toast.error(error.message),
		})
	);
	const employers = employersQuery.data ?? [];
	const hasNextPage = employers.length === PAGE_SIZE;

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-2xl">업소 관리</h1>
			<Tabs
				onValueChange={(value) => {
					setFilter(value as EmployerFilter);
					setPage(0);
				}}
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
							<p className="m-0 text-muted-foreground text-sm">
								대표자 {formatNullable(employer.representativeName)} · 개업일자{" "}
								{formatNullable(
									formatBusinessStartDate(employer.businessStartDate)
								)}
							</p>
							{/* 제출 시점 국세청 대조 결과. 미확인은 국세청 키 미설정·장애로 판정을
							    못 한 제출이라 운영자가 사업자등록증을 직접 봐야 한다. */}
							<div className="flex flex-wrap items-center gap-2">
								<Badge
									variant={employer.biznumCheckedAt ? "success" : "warning"}
								>
									{employer.biznumCheckedAt
										? "국세청 확인 완료"
										: "국세청 미확인"}
								</Badge>
								<span className="text-muted-foreground text-sm">
									{employer.biznumCheckedAt
										? `${getBiznumStatusLabel(employer.biznumStatusCode)} · ${formatDateTime(employer.biznumCheckedAt)}`
										: "국세청 대조를 하지 못했어요. 사업자등록증을 수동으로 확인해 주세요."}
								</span>
							</div>
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
			<div className="flex items-center justify-between gap-2">
				<Button
					disabled={page === 0}
					onClick={() => setPage((prev) => Math.max(0, prev - 1))}
					variant="outline"
				>
					이전
				</Button>
				<span className="text-muted-foreground text-sm">{page + 1} 페이지</span>
				<Button
					disabled={!hasNextPage}
					onClick={() => setPage((prev) => prev + 1)}
					variant="outline"
				>
					다음
				</Button>
			</div>
		</div>
	);
}
