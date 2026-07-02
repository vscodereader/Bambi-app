"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
	ChartColumn,
	Check,
	CircleAlert,
	Clock,
	Eye,
	type LucideIcon,
	Settings,
	Zap,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import { authClient } from "@/lib/auth-client";
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

const getErrorCode = (error: Error | null): string | undefined =>
	error && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;

interface PromotionSummaryItem {
	remainingManualBoosts: number;
	status: string;
}

const getPromotionSummary = (promotions: PromotionSummaryItem[]) => ({
	activeCount: promotions.filter((promotion) => promotion.status === "active")
		.length,
	pendingCount: promotions.filter(
		(promotion) => promotion.status === "pending_payment"
	).length,
	remainingBoostCount: promotions.reduce(
		(total, promotion) => total + promotion.remainingManualBoosts,
		0
	),
});

const getJobStatusCounts = (jobPosts: { status: string }[]) => ({
	pendingReview: jobPosts.filter((job) => job.status === "pending_review")
		.length,
	published: jobPosts.filter((job) => job.status === "published").length,
	rejected: jobPosts.filter((job) => job.status === "rejected").length,
});

const getJobLeadingStatus = (
	status: string
): { icon: LucideIcon; tile: string } => {
	if (status === "published") {
		return { icon: Check, tile: "bg-green-50 text-green-600" };
	}

	if (status === "rejected") {
		return { icon: CircleAlert, tile: "bg-red-50 text-red-600" };
	}

	if (status === "pending_review") {
		return { icon: Clock, tile: "bg-amber-50 text-amber-500" };
	}

	return { icon: Clock, tile: "bg-secondary text-muted-foreground" };
};

const quickLinks: {
	description: string;
	href: Route;
	icon: LucideIcon;
	label: string;
}[] = [
	{
		description: "공고 노출을 끌어올려요",
		href: "/employer/promotions" as Route,
		icon: Zap,
		label: "프로모션 관리",
	},
	{
		description: "조회·지원 지표를 확인해요",
		href: "/employer/analytics" as Route,
		icon: ChartColumn,
		label: "성과 분석",
	},
	{
		description: "사업자·팀 정보를 관리해요",
		href: "/employer/settings" as Route,
		icon: Settings,
		label: "조직 설정",
	},
	{
		description: "지원자 화면을 미리 봐요",
		href: "/seeker" as Route,
		icon: Eye,
		label: "공개 공고 보기",
	},
];

function OverviewStat({
	icon: Icon,
	label,
	tone,
	value,
}: {
	icon: LucideIcon;
	label: string;
	tone: "amber" | "green" | "red";
	value: number;
}) {
	const highlighted = tone === "green" || value > 0;

	return (
		<div className="flex items-center gap-3">
			<span
				className={cn(
					"flex size-10 items-center justify-center rounded-md bg-secondary text-muted-foreground",
					highlighted && tone === "green" && "bg-green-50 text-green-600",
					highlighted && tone === "amber" && "bg-amber-50 text-amber-500",
					highlighted && tone === "red" && "bg-red-50 text-red-600"
				)}
			>
				<Icon className="size-5" />
			</span>
			<div className="flex min-w-0 flex-col gap-1">
				<dt className="break-keep text-muted-foreground text-xs">{label}</dt>
				<dd className="font-semibold text-2xl leading-none">{value}</dd>
			</div>
		</div>
	);
}

function QuickLinkTile({
	description,
	href,
	icon: Icon,
	label,
}: {
	description: string;
	href: Route;
	icon: LucideIcon;
	label: string;
}) {
	return (
		<Link
			className="group flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-coral-200 hover:bg-coral-50"
			href={href}
		>
			<span className="flex size-9 items-center justify-center rounded-md bg-secondary text-foreground transition-colors group-hover:bg-coral-100 group-hover:text-coral-600">
				<Icon className="size-5" />
			</span>
			<span className="font-medium text-foreground text-sm">{label}</span>
			<span className="text-muted-foreground text-xs">{description}</span>
		</Link>
	);
}

export default function EmployerPage() {
	const session = authClient.useSession();
	const isSignedIn = Boolean(session.data?.user);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isSignedIn,
	});
	const profile = mineQuery.data?.bambiProfile ?? null;
	const canLoadJobs = Boolean(profile && profile.role !== "job_seeker");
	const jobsQuery = useQuery({
		...orpc.bambi.jobs.listMine.queryOptions(),
		enabled: canLoadJobs,
	});
	const promotionsQuery = useQuery({
		...orpc.bambi.promotions.listMine.queryOptions(),
		enabled: canLoadJobs,
	});
	const organizationProfiles =
		mineQuery.data?.employerOrganizationProfiles ?? [];
	const teamProfiles = mineQuery.data?.employerTeamProfiles ?? [];
	const jobs = jobsQuery.data ?? [];
	const promotionSummary = getPromotionSummary(promotionsQuery.data ?? []);
	const jobStatusCounts = getJobStatusCounts(jobs);

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

	if (session.isPending || mineQuery.isLoading) {
		return (
			<PageShell title="구인자 관리">
				<div className="grid gap-3 md:grid-cols-2">
					<Skeleton className="h-24 w-full rounded-lg" />
					<Skeleton className="h-24 w-full rounded-lg" />
				</div>
			</PageShell>
		);
	}

	if (!isSignedIn || getErrorCode(mineQuery.error) === "UNAUTHORIZED") {
		return (
			<PageShell
				description="구인자 관리는 로그인 후 이용할 수 있습니다."
				title="구인자 관리"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/login">
							로그인
						</Link>
					}
					description="구인자 계정으로 로그인하면 조직과 공고 상태를 확인할 수 있습니다."
					title="로그인이 필요합니다"
				/>
			</PageShell>
		);
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
							href="/seeker"
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
		jobsContent = (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-20 w-full rounded-lg" />
				<Skeleton className="h-20 w-full rounded-lg" />
				<Skeleton className="h-20 w-full rounded-lg" />
			</div>
		);
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
					<Link className={buttonVariants()} href="/employer/new">
						새 공고 등록
					</Link>
				}
				description="조직 프로필을 선택해 첫 공고를 등록해 보세요."
				title="등록한 공고가 없습니다"
			/>
		);
	} else {
		jobsContent = (
			<Card aria-labelledby="owned-jobs">
				<CardContent className="divide-y p-0">
					{jobs.map((job) => {
						const leading = getJobLeadingStatus(job.status);
						const LeadingIcon = leading.icon;

						return (
							<div
								className={cn(
									"flex items-start gap-3 border-l-2 border-l-transparent p-4",
									job.status === "rejected" && "border-l-red-500"
								)}
								key={job.id}
							>
								<span
									className={cn(
										"mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md",
										leading.tile
									)}
								>
									<LeadingIcon className="size-5" />
								</span>
								<div className="flex min-w-0 flex-1 flex-col gap-2">
									<div className="flex min-w-0 flex-col gap-1">
										<h3 className="min-w-0 break-words font-medium text-base">
											{job.title}
										</h3>
										<p className="break-words text-foreground text-sm">
											{job.industryCategory} · {job.region} ·{" "}
											{formatPay(job.payAmount, job.payUnit)}
										</p>
									</div>
									<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
										<span className="flex items-center gap-1.5">
											<span className="text-muted-foreground">공고</span>
											<StatusBadge tone={getJobStatusTone(job.status)}>
												{getJobStatusLabel(job.status)}
											</StatusBadge>
										</span>
										<span className="flex items-center gap-1.5">
											<span className="text-muted-foreground">사업자</span>
											<StatusBadge
												tone={getVerificationStatusTone(
													job.employerVerificationStatus
												)}
											>
												{getVerificationStatusLabel(
													job.employerVerificationStatus
												)}
											</StatusBadge>
										</span>
									</div>
									<p className="break-words text-muted-foreground text-xs">
										{getOrganizationLabel(job.organizationId)} ·{" "}
										{getTeamLabel(job.teamId)} · 수정{" "}
										{formatDateTime(job.updatedAt)}
									</p>
								</div>
								<Link
									className={cn(
										buttonVariants({ variant: "outline" }),
										"shrink-0"
									)}
									href={`/employer/jobs/${job.id}/edit` as Route}
								>
									수정
								</Link>
							</div>
						);
					})}
				</CardContent>
			</Card>
		);
	}

	return (
		<PageShell
			actions={
				<Link className={buttonVariants()} href="/employer/new">
					새 공고 등록
				</Link>
			}
			description="조직과 팀 프로필 상태를 확인하고 소유한 공고를 관리합니다."
			title="구인자 관리"
		>
			{jobs.length > 0 ? (
				<section aria-labelledby="job-overview" className="flex flex-col gap-3">
					<h2 className="sr-only" id="job-overview">
						공고 현황
					</h2>
					<Card>
						<CardContent className="flex flex-col gap-4">
							<dl className="grid grid-cols-3 gap-4">
								<OverviewStat
									icon={Check}
									label="게시"
									tone="green"
									value={jobStatusCounts.published}
								/>
								<OverviewStat
									icon={Clock}
									label="검수 대기"
									tone="amber"
									value={jobStatusCounts.pendingReview}
								/>
								<OverviewStat
									icon={CircleAlert}
									label="반려"
									tone="red"
									value={jobStatusCounts.rejected}
								/>
							</dl>
							<Separator />
							<dl className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
								<div className="flex items-center gap-1.5">
									<Zap className="size-4 shrink-0 text-coral-500" />
									<dt className="text-muted-foreground">진행 중인 프로모션</dt>
									<dd className="font-medium text-foreground">
										{promotionSummary.activeCount}개
									</dd>
								</div>
								<div className="flex items-center gap-1.5">
									<dt className="text-muted-foreground">결제 대기</dt>
									<dd className="font-medium text-foreground">
										{promotionSummary.pendingCount}개
									</dd>
								</div>
								<div className="flex items-center gap-1.5">
									<dt className="text-muted-foreground">남은 끌어올리기</dt>
									<dd className="font-medium text-foreground">
										{promotionSummary.remainingBoostCount}회
									</dd>
								</div>
							</dl>
						</CardContent>
					</Card>
				</section>
			) : null}

			<nav
				aria-label="구인자 관리 바로가기"
				className="grid grid-cols-2 gap-3 sm:grid-cols-4"
			>
				{quickLinks.map((link) => (
					<QuickLinkTile
						description={link.description}
						href={link.href}
						icon={link.icon}
						key={link.href}
						label={link.label}
					/>
				))}
			</nav>

			<Separator />

			<section aria-labelledby="owned-jobs" className="flex flex-col gap-3">
				<div>
					<h2 className="font-semibold text-lg" id="owned-jobs">
						내 공고
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						최근 수정된 공고부터 표시됩니다.
					</p>
				</div>
				{jobsContent}
			</section>

			<Separator />

			<section aria-labelledby="organizations" className="flex flex-col gap-3">
				<div>
					<h2 className="font-semibold text-lg" id="organizations">
						조직 프로필
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						검수 상태는 공고 공개 여부에 영향을 줄 수 있습니다.
					</p>
				</div>

				{organizationProfiles.length > 0 ? (
					<div className="grid gap-3 md:grid-cols-2">
						{organizationProfiles.map((organizationProfile) => (
							<Card key={organizationProfile.id}>
								<CardHeader>
									<CardTitle className="flex flex-wrap items-center gap-2">
										<span className="break-words font-medium text-base">
											{organizationProfile.displayName}
										</span>
										<StatusBadge
											tone={getVerificationStatusTone(
												organizationProfile.verificationStatus
											)}
										>
											{getVerificationStatusLabel(
												organizationProfile.verificationStatus
											)}
										</StatusBadge>
									</CardTitle>
								</CardHeader>
								<CardContent>
									<dl className="grid gap-2 text-sm">
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
											<dt className="text-muted-foreground text-xs">
												검수 메모
											</dt>
											<dd className="mt-1 break-words">
												{formatNullable(organizationProfile.verificationNote)}
											</dd>
										</div>
									</dl>
								</CardContent>
							</Card>
						))}
					</div>
				) : (
					<EmptyState
						description="소속된 조직 프로필이 생기면 이곳에서 검수 상태를 확인할 수 있습니다."
						title="조직 프로필이 없습니다"
					/>
				)}
			</section>

			<Separator />

			<section aria-labelledby="teams" className="flex flex-col gap-3">
				<h2 className="font-semibold text-lg" id="teams">
					팀 프로필
				</h2>
				{teamProfiles.length > 0 ? (
					<div className="grid gap-3 md:grid-cols-2">
						{teamProfiles.map((teamProfile) => (
							<Card key={teamProfile.id}>
								<CardHeader>
									<CardTitle className="break-words font-medium text-base">
										{teamProfile.displayName}
									</CardTitle>
								</CardHeader>
								<CardContent>
									<dl className="grid gap-2 text-sm">
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
								</CardContent>
							</Card>
						))}
					</div>
				) : (
					<EmptyState
						className="min-h-0 py-8"
						description="팀 프로필이 생기면 지역별 소속 정보를 확인할 수 있습니다."
						title="팀 프로필이 없습니다"
					/>
				)}
			</section>
		</PageShell>
	);
}
