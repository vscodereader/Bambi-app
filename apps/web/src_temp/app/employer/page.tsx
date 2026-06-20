"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import { formatDateTime, formatNullable, formatPay } from "@/lib/bambi-format";
import { jobStatusLabels, verificationStatusLabels } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

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

export default function EmployerPage() {
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const profile = mineQuery.data?.bambiProfile ?? null;
	const canLoadJobs = Boolean(profile && profile.role !== "job_seeker");
	const jobsQuery = useQuery({
		...orpc.bambi.jobs.listMine.queryOptions(),
		enabled: canLoadJobs,
	});
	const organizationProfiles =
		mineQuery.data?.employerOrganizationProfiles ?? [];
	const teamProfiles = mineQuery.data?.employerTeamProfiles ?? [];
	const jobs = jobsQuery.data ?? [];

	const getOrganizationLabel = (organizationId: string): string =>
		organizationProfiles.find(
			(organizationProfile) =>
				organizationProfile.organizationId === organizationId
		)?.displayName ?? organizationId;

	const getTeamLabel = (teamId: null | string): string => {
		if (!teamId) {
			return "전체 조직";
		}

		return (
			teamProfiles.find((teamProfile) => teamProfile.teamId === teamId)
				?.displayName ?? teamId
		);
	};

	if (mineQuery.isLoading) {
		return <Loader />;
	}

	if (mineQuery.isError) {
		return (
			<PageShell
				description="구인자 관리 정보를 불러오지 못했습니다."
				title="구인자 관리"
			>
				<EmptyState
					action={
						<Button onClick={() => mineQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="관리 정보를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (!profile) {
		return (
			<PageShell
				description="공고를 등록하려면 밤비 프로필 설정이 필요합니다."
				title="구인자 관리"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/onboarding">
							온보딩으로 이동
						</Link>
					}
					description="구인자 프로필을 만든 뒤 조직과 팀의 공고를 관리할 수 있습니다."
					title="밤비 프로필이 없습니다"
				/>
			</PageShell>
		);
	}

	if (profile.role === "job_seeker") {
		return (
			<PageShell
				description="현재 계정은 구직자 프로필로 설정되어 있습니다."
				title="구인자 관리"
			>
				<EmptyState
					action={
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/jobs"
						>
							공고 탐색으로 이동
						</Link>
					}
					description="구직자 계정은 공개 공고를 탐색하고 지원 대화를 시작할 수 있습니다."
					title="구인자 관리 권한이 없습니다"
				/>
			</PageShell>
		);
	}

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
	} else if (jobs.length === 0) {
		jobsContent = (
			<EmptyState
				action={
					<Link className={buttonVariants()} href="/employer/jobs/new">
						새 공고 등록
					</Link>
				}
				description="조직 프로필을 선택해 첫 공고를 등록해 보세요."
				title="등록한 공고가 없습니다"
			/>
		);
	} else {
		jobsContent = (
			<section aria-labelledby="owned-jobs" className="overflow-hidden border">
				<div className="divide-y">
					{jobs.map((job) => (
						<div
							className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
							key={job.id}
						>
							<div className="min-w-0 space-y-2">
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="min-w-0 flex-1 break-words font-medium text-base">
										{job.title}
									</h3>
									<StatusBadge tone={getJobStatusTone(job.status)}>
										{getJobStatusLabel(job.status)}
									</StatusBadge>
									<StatusBadge
										tone={getVerificationStatusTone(
											job.employerVerificationStatus
										)}
									>
										{getVerificationStatusLabel(job.employerVerificationStatus)}
									</StatusBadge>
								</div>
								<p className="text-muted-foreground text-sm">
									{job.industryCategory} · {job.region} ·{" "}
									{formatPay(job.payAmount, job.payUnit)}
								</p>
								<p className="break-words text-muted-foreground text-xs">
									{getOrganizationLabel(job.organizationId)} ·{" "}
									{getTeamLabel(job.teamId)} · 수정{" "}
									{formatDateTime(job.updatedAt)}
								</p>
							</div>
							<Link
								className={buttonVariants({ variant: "outline" })}
								href={`/employer/jobs/${job.id}/edit`}
							>
								수정
							</Link>
						</div>
					))}
				</div>
			</section>
		);
	}

	return (
		<PageShell
			description="조직과 팀 프로필 상태를 확인하고 소유한 공고를 관리합니다."
			title="구인자 관리"
		>
			<section aria-labelledby="organizations" className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="font-medium text-base" id="organizations">
							조직 프로필
						</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							검수 상태는 공고 공개 여부에 영향을 줄 수 있습니다.
						</p>
					</div>
					<Link className={buttonVariants()} href="/employer/jobs/new">
						새 공고 등록
					</Link>
				</div>

				{organizationProfiles.length > 0 ? (
					<div className="grid gap-3 md:grid-cols-2">
						{organizationProfiles.map((organizationProfile) => (
							<article className="border p-4" key={organizationProfile.id}>
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="break-words font-medium text-base">
										{organizationProfile.displayName}
									</h3>
									<StatusBadge
										tone={getVerificationStatusTone(
											organizationProfile.verificationStatus
										)}
									>
										{getVerificationStatusLabel(
											organizationProfile.verificationStatus
										)}
									</StatusBadge>
								</div>
								<dl className="mt-3 grid gap-2 text-sm">
									<div>
										<dt className="text-muted-foreground text-xs">
											사업자 등록 번호
										</dt>
										<dd className="mt-1 break-words">
											{formatNullable(
												organizationProfile.businessRegistrationNumber
											)}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">검수 메모</dt>
										<dd className="mt-1 break-words">
											{formatNullable(organizationProfile.verificationNote)}
										</dd>
									</div>
								</dl>
							</article>
						))}
					</div>
				) : (
					<EmptyState
						description="소속된 조직 프로필이 생기면 이곳에서 검수 상태를 확인할 수 있습니다."
						title="조직 프로필이 없습니다"
					/>
				)}
			</section>

			<section aria-labelledby="teams" className="space-y-3">
				<h2 className="font-medium text-base" id="teams">
					팀 프로필
				</h2>
				{teamProfiles.length > 0 ? (
					<div className="grid gap-3 md:grid-cols-2">
						{teamProfiles.map((teamProfile) => (
							<article className="border p-4" key={teamProfile.id}>
								<h3 className="break-words font-medium text-base">
									{teamProfile.displayName}
								</h3>
								<dl className="mt-3 grid gap-2 text-sm">
									<div>
										<dt className="text-muted-foreground text-xs">지역</dt>
										<dd className="mt-1 break-words">
											{formatNullable(teamProfile.region)}
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground text-xs">조직</dt>
										<dd className="mt-1 break-words">
											{getOrganizationLabel(teamProfile.organizationId)}
										</dd>
									</div>
								</dl>
							</article>
						))}
					</div>
				) : (
					<EmptyState
						description="팀 프로필이 생기면 지역별 소속 정보를 확인할 수 있습니다."
						title="팀 프로필이 없습니다"
					/>
				)}
			</section>

			<section aria-labelledby="owned-jobs" className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="font-medium text-base" id="owned-jobs">
							내 공고
						</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							최근 수정된 공고부터 표시됩니다.
						</p>
					</div>
					<Link className={buttonVariants({ variant: "outline" })} href="/jobs">
						공개 공고 보기
					</Link>
				</div>
				{jobsContent}
			</section>
		</PageShell>
	);
}
