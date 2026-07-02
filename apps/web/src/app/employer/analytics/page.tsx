"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import { jobStatusLabels } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

interface MetricCardProps {
	label: string;
	value: string;
}

const getJobStatusLabel = (status: string): string =>
	jobStatusLabels[status as keyof typeof jobStatusLabels] ?? status;

const getJobStatusTone = (
	status: string
): React.ComponentProps<typeof StatusBadge>["tone"] =>
	status === "published" ? "good" : "warning";

const formatNumber = (value: number): string => value.toLocaleString("ko-KR");

const formatRate = (numerator: number, denominator: number): string => {
	if (denominator === 0) {
		return "0.0%";
	}

	return `${((numerator / denominator) * 100).toFixed(1)}%`;
};

function MetricCard({ label, value }: MetricCardProps) {
	return (
		<div className="border p-4">
			<dt className="text-muted-foreground text-sm">{label}</dt>
			<dd className="mt-2 font-semibold text-2xl">{value}</dd>
		</div>
	);
}

export default function EmployerAnalyticsPage() {
	const summaryQuery = useQuery(orpc.bambi.analytics.summary.queryOptions());
	const summaries = summaryQuery.data ?? [];
	const totals = summaries.reduce(
		(accumulator, item) => ({
			chatStarts: accumulator.chatStarts + item.metrics.chatStarts,
			contactReveals: accumulator.contactReveals + item.metrics.contactReveals,
			detailViews: accumulator.detailViews + item.metrics.detailViews,
			impressions: accumulator.impressions + item.metrics.impressions,
			organicImpressions:
				accumulator.organicImpressions + item.sectionMetrics.organicImpressions,
			premiumImpressions:
				accumulator.premiumImpressions + item.sectionMetrics.premiumImpressions,
			recommendedImpressions:
				accumulator.recommendedImpressions +
				item.sectionMetrics.recommendedImpressions,
		}),
		{
			chatStarts: 0,
			contactReveals: 0,
			detailViews: 0,
			impressions: 0,
			organicImpressions: 0,
			premiumImpressions: 0,
			recommendedImpressions: 0,
		}
	);

	if (summaryQuery.isLoading) {
		return <Loader />;
	}

	if (summaryQuery.isError) {
		return (
			<PageShell
				description="공고 노출과 지원 전환 지표를 불러오지 못했습니다."
				title="성과 분석"
			>
				<EmptyState
					action={
						<Button onClick={() => summaryQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 조직 권한을 확인한 뒤 다시 시도해 주세요."
					title="성과 지표를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	return (
		<PageShell
			description="공고별 노출, 상세 조회, 채팅 시작, 연락처 공개 흐름을 확인합니다."
			title="성과 분석"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="m-0 text-muted-foreground text-sm">
					공고 {summaries.length}개 · 상세 전환{" "}
					{formatRate(totals.detailViews, totals.impressions)} · 채팅 전환{" "}
					{formatRate(totals.chatStarts, totals.detailViews)}
				</p>
				<div className="flex flex-wrap gap-2">
					<Link
						className={buttonVariants({ variant: "outline" })}
						href={"/employer/promotions" as Route}
					>
						프로모션 관리
					</Link>
					<Link
						className={buttonVariants({ variant: "outline" })}
						href="/employer"
					>
						공고 관리
					</Link>
				</div>
			</div>

			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="노출" value={formatNumber(totals.impressions)} />
				<MetricCard
					label="상세 조회"
					value={formatNumber(totals.detailViews)}
				/>
				<MetricCard label="채팅 시작" value={formatNumber(totals.chatStarts)} />
				<MetricCard
					label="연락처 공개"
					value={formatNumber(totals.contactReveals)}
				/>
			</dl>

			<section aria-labelledby="placement-metrics" className="space-y-3">
				<h2 className="font-medium text-base" id="placement-metrics">
					노출 구분
				</h2>
				<dl className="grid gap-3 sm:grid-cols-3">
					<MetricCard
						label="프리미엄"
						value={formatNumber(totals.premiumImpressions)}
					/>
					<MetricCard
						label="추천"
						value={formatNumber(totals.recommendedImpressions)}
					/>
					<MetricCard
						label="일반"
						value={formatNumber(totals.organicImpressions)}
					/>
				</dl>
			</section>

			{summaries.length === 0 ? (
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/employer/new">
							새 공고 등록
						</Link>
					}
					description="공고를 등록하고 구직자가 목록이나 상세 화면을 보면 지표가 쌓입니다."
					title="분석할 공고가 없습니다"
				/>
			) : (
				<section
					aria-labelledby="job-performance-table"
					className="overflow-x-auto border"
				>
					<table className="w-full min-w-[820px] border-collapse text-left text-sm">
						<thead className="border-b bg-muted/40">
							<tr>
								<th className="px-4 py-3 font-medium" scope="col">
									공고
								</th>
								<th className="px-4 py-3 font-medium" scope="col">
									노출
								</th>
								<th className="px-4 py-3 font-medium" scope="col">
									상세
								</th>
								<th className="px-4 py-3 font-medium" scope="col">
									채팅
								</th>
								<th className="px-4 py-3 font-medium" scope="col">
									연락처
								</th>
								<th className="px-4 py-3 font-medium" scope="col">
									상세 전환
								</th>
								<th className="px-4 py-3 font-medium" scope="col">
									게재 구분
								</th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{summaries.map((summary) => (
								<tr key={summary.jobPostId}>
									<th className="px-4 py-3 font-medium" scope="row">
										<div className="max-w-[280px]">
											<p className="m-0 break-words">{summary.title}</p>
											<StatusBadge tone={getJobStatusTone(summary.status)}>
												{getJobStatusLabel(summary.status)}
											</StatusBadge>
										</div>
									</th>
									<td className="px-4 py-3">
										{formatNumber(summary.metrics.impressions)}
									</td>
									<td className="px-4 py-3">
										{formatNumber(summary.metrics.detailViews)}
									</td>
									<td className="px-4 py-3">
										{formatNumber(summary.metrics.chatStarts)}
									</td>
									<td className="px-4 py-3">
										{formatNumber(summary.metrics.contactReveals)}
									</td>
									<td className="px-4 py-3">
										{formatRate(
											summary.metrics.detailViews,
											summary.metrics.impressions
										)}
									</td>
									<td className="px-4 py-3">
										프리미엄{" "}
										{formatNumber(summary.sectionMetrics.premiumImpressions)} ·
										추천{" "}
										{formatNumber(
											summary.sectionMetrics.recommendedImpressions
										)}{" "}
										· 일반{" "}
										{formatNumber(summary.sectionMetrics.organicImpressions)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}
		</PageShell>
	);
}
