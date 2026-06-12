"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import { formatDateTime, formatPay } from "@/lib/bambi-format";
import {
	industryOptions,
	jobStatusLabels,
	regionOptions,
	verificationStatusLabels,
} from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

const selectClassName =
	"h-10 w-full min-w-0 rounded-none border border-input bg-background px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:h-8 md:text-xs";

const getPositiveInteger = (value: string): number | undefined => {
	const parsedValue = Number(value);

	if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
		return;
	}

	return parsedValue;
};

const getJobStatusLabel = (status: string): string =>
	jobStatusLabels[status as keyof typeof jobStatusLabels] ?? status;

const getVerificationStatusLabel = (status: string): string =>
	verificationStatusLabels[status as keyof typeof verificationStatusLabels] ??
	status;

const getJobStatusTone = (
	status: string
): React.ComponentProps<typeof StatusBadge>["tone"] => {
	if (status === "published") {
		return "good";
	}

	if (status === "pending_review") {
		return "warning";
	}

	if (status === "rejected") {
		return "danger";
	}

	return "default";
};

const getVerificationStatusTone = (
	status: string
): React.ComponentProps<typeof StatusBadge>["tone"] => {
	if (status === "verified") {
		return "good";
	}

	if (status === "pending") {
		return "warning";
	}

	if (status === "rejected") {
		return "danger";
	}

	return "default";
};

export default function JobsPage() {
	const [industryCategory, setIndustryCategory] = useState("");
	const [region, setRegion] = useState("");
	const [minPayAmount, setMinPayAmount] = useState("");
	const [appliedFilters, setAppliedFilters] = useState({
		industryCategory: "",
		minPayAmount: "",
		region: "",
	});

	const input = {
		industryCategory: appliedFilters.industryCategory || undefined,
		limit: 30,
		minPayAmount: getPositiveInteger(appliedFilters.minPayAmount),
		region: appliedFilters.region || undefined,
	};
	const jobsQuery = useQuery(orpc.bambi.jobs.list.queryOptions({ input }));
	const posts = jobsQuery.data ?? [];

	const handleApplyFilters = () => {
		setAppliedFilters({
			industryCategory,
			minPayAmount,
			region,
		});
	};

	let jobsContent: React.ReactNode;

	if (jobsQuery.isLoading) {
		jobsContent = <Loader />;
	} else if (jobsQuery.isError) {
		jobsContent = (
			<EmptyState
				action={
					<Button onClick={() => jobsQuery.refetch()} type="button">
						다시 시도
					</Button>
				}
				description="공고 목록을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."
				title="공고를 불러올 수 없습니다"
			/>
		);
	} else if (posts.length === 0) {
		jobsContent = (
			<EmptyState
				description="필터를 조정하거나 잠시 후 다시 확인해 주세요."
				title="조건에 맞는 공고가 없습니다"
			/>
		);
	} else {
		jobsContent = (
			<section className="overflow-hidden border">
				<div className="divide-y">
					{posts.map((post) => (
						<Link
							className="grid gap-3 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
							href={`/jobs/${post.id}`}
							key={post.id}
						>
							<div className="min-w-0 space-y-2">
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="min-w-0 flex-1 break-words font-medium text-base">
										{post.title}
									</h2>
									<StatusBadge tone={getJobStatusTone(post.status)}>
										{getJobStatusLabel(post.status)}
									</StatusBadge>
									<StatusBadge
										tone={getVerificationStatusTone(
											post.employerVerificationStatus
										)}
									>
										{getVerificationStatusLabel(
											post.employerVerificationStatus
										)}
									</StatusBadge>
								</div>
								<p className="text-muted-foreground text-sm">
									{post.industryCategory} · {post.region}
								</p>
							</div>
							<div className="space-y-1 text-left sm:text-right">
								<p className="font-medium text-sm">
									{formatPay(post.payAmount, post.payUnit)}
								</p>
								{post.publishedAt ? (
									<p className="text-muted-foreground text-xs">
										{formatDateTime(post.publishedAt)}
									</p>
								) : null}
							</div>
						</Link>
					))}
				</div>
			</section>
		);
	}

	return (
		<PageShell
			description="업종, 지역, 급여 조건에 맞는 공개 공고를 확인합니다."
			title="공고 탐색"
		>
			<form
				className="grid gap-3 border p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
				onSubmit={(event) => {
					event.preventDefault();
					handleApplyFilters();
				}}
			>
				<div className="space-y-2">
					<Label htmlFor="industryCategory">업종</Label>
					<select
						className={selectClassName}
						id="industryCategory"
						name="industryCategory"
						onChange={(event) => setIndustryCategory(event.target.value)}
						value={industryCategory}
					>
						<option value="">전체 업종</option>
						{industryOptions.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</div>
				<div className="space-y-2">
					<Label htmlFor="region">지역</Label>
					<select
						className={selectClassName}
						id="region"
						name="region"
						onChange={(event) => setRegion(event.target.value)}
						value={region}
					>
						<option value="">전체 지역</option>
						{regionOptions.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</div>
				<div className="space-y-2">
					<Label htmlFor="minPayAmount">최소 급여</Label>
					<Input
						id="minPayAmount"
						inputMode="numeric"
						min="1"
						name="minPayAmount"
						onChange={(event) => setMinPayAmount(event.target.value)}
						placeholder="예: 12000..."
						type="number"
						value={minPayAmount}
					/>
				</div>
				<Button type="submit">필터 적용</Button>
			</form>

			{jobsContent}
		</PageShell>
	);
}
