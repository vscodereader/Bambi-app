"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	BookOpen,
	ChartColumn,
	Check,
	CircleAlert,
	Clock,
	Eye,
	type LucideIcon,
	Zap,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { DataTable } from "@/components/bambi/data-table";
import { useEmployerVerified } from "@/components/bambi/employer-approval-context";
import { EmployerGateBanner } from "@/components/bambi/employer-gate-banner";
import {
	type EmployerJob,
	EmployerJobActionsMenu,
	getEmployerJobsColumns,
	getJobStatusNote,
	isPubliclyViewable,
} from "@/components/bambi/employer-jobs-columns";
import { EmptyState } from "@/components/bambi/empty-state";
import { PageControls } from "@/components/bambi/page-controls";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import { authClient } from "@/lib/auth-client";
import { getJobDisplayStatus } from "@/lib/bambi/exposure";
import { formatNullable, formatPay } from "@/lib/bambi-format";
import { verificationStatusLabels } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

const getVerificationStatusLabel = (status: string): string =>
	verificationStatusLabels[status as keyof typeof verificationStatusLabels] ??
	status;

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

interface AdSummaryItem {
	// null = 광고 상품 없는 무료 공고(listMyAds는 무료 공고도 내려준다).
	adProductName: null | string;
	boostCountRemaining: number;
	boostOptionManualPerDay: number;
	boostsUsedToday: number;
	exposureEndsAt: Date | null | string;
	manualBoostsPerDay: number;
	paymentStatus: string;
	status: string;
}

const getAdSummary = (ads: AdSummaryItem[], now: number) => {
	const isLive = (ad: AdSummaryItem) =>
		ad.status === "published" &&
		ad.paymentStatus === "paid" &&
		(ad.exposureEndsAt === null || new Date(ad.exposureEndsAt).getTime() > now);

	return {
		// "진행 중인 광고"는 광고 상품이 붙은 공고만 센다 — 무료 공고까지 세면 숫자가 부푼다.
		activeCount: ads.filter((ad) => isLive(ad) && ad.adProductName !== null)
			.length,
		pendingCount: ads.filter((ad) => ad.paymentStatus !== "paid").length,
		// 남은 끌올 = 하루 한도(상품 번들 + 활성 기간제 옵션) 잔여 + 횟수권 잔여.
		// 서버 resolveBoostEligibility와 같은 계산이라, 옵션만 산 무료 공고도 포함된다.
		remainingBoostCount: ads
			.filter(isLive)
			.reduce(
				(total, ad) =>
					total +
					Math.max(
						0,
						ad.manualBoostsPerDay +
							ad.boostOptionManualPerDay -
							ad.boostsUsedToday
					) +
					ad.boostCountRemaining,
				0
			),
	};
};

const getJobStatusCounts = (jobPosts: { status: string }[]) => ({
	pendingReview: jobPosts.filter((job) => job.status === "pending_review")
		.length,
	published: jobPosts.filter((job) => job.status === "published").length,
	rejected: jobPosts.filter((job) => job.status === "rejected").length,
});

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
		label: "광고 관리",
	},
	{
		description: "조회·지원 지표를 확인해요",
		href: "/employer/analytics" as Route,
		icon: ChartColumn,
		label: "성과 분석",
	},
	// 광고 안내는 데스크톱 헤더 nav에만 있었다. 그 헤더는 hidden md:block이고 모바일
	// 하단 탭 5개에도 없어서, 모바일에서는 도달할 방법이 아예 없었다. 프로모션·성과 분석과
	// 같은 대시보드 퀵링크 자리를 준다(탭을 6개로 늘리지 않고 기존 패턴을 그대로 쓴다).
	{
		description: "노출 상품과 배너 규격을 확인해요",
		href: "/employer/ad-guide" as Route,
		icon: BookOpen,
		label: "광고 안내",
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

function NewJobButton({ verified }: { verified: boolean }) {
	const { accountStatus, isPending } = useBambiAuth();

	if (verified && !isPending && accountStatus !== "suspended") {
		return (
			<Link className={buttonVariants()} href="/employer/new">
				새 공고 등록
			</Link>
		);
	}

	return (
		<Button disabled type="button">
			새 공고 등록
		</Button>
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

const JOB_PAGE_SIZE = 10;

type MobileJobSort = "pay" | "recent" | "status" | "title";

function MobileOwnedJobs({
	deletingJobId,
	jobs,
	onRequestDelete,
}: {
	deletingJobId: null | string;
	jobs: EmployerJob[];
	onRequestDelete: (jobId: string) => void;
}) {
	const [page, setPage] = useState(1);
	const [sort, setSort] = useState<MobileJobSort>("recent");
	const sortedJobs = useMemo(() => {
		const next = [...jobs];

		return next.sort((left, right) => {
			if (sort === "title") {
				return left.title.localeCompare(right.title, "ko");
			}
			if (sort === "pay") {
				return (right.payAmount ?? 0) - (left.payAmount ?? 0);
			}
			if (sort === "status") {
				return getJobDisplayStatus(left).label.localeCompare(
					getJobDisplayStatus(right).label,
					"ko"
				);
			}

			return (
				new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
			);
		});
	}, [jobs, sort]);
	const pageCount = Math.max(1, Math.ceil(sortedJobs.length / JOB_PAGE_SIZE));
	const safePage = Math.min(page, pageCount);
	const pageJobs = sortedJobs.slice(
		(safePage - 1) * JOB_PAGE_SIZE,
		safePage * JOB_PAGE_SIZE
	);

	return (
		<div className="flex flex-col gap-3 px-2 md:hidden">
			<Select
				items={[
					{ label: "최근 수정순", value: "recent" },
					{ label: "제목순", value: "title" },
					{ label: "급여순", value: "pay" },
					{ label: "상태순", value: "status" },
				]}
				onValueChange={(value) => {
					setSort((value ?? "recent") as MobileJobSort);
					setPage(1);
				}}
				value={sort}
			>
				<SelectTrigger aria-label="내 공고 정렬" className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="recent">최근 수정순</SelectItem>
					<SelectItem value="title">제목순</SelectItem>
					<SelectItem value="pay">급여순</SelectItem>
					<SelectItem value="status">상태순</SelectItem>
				</SelectContent>
			</Select>
			{pageJobs.map((job) => {
				const display = getJobDisplayStatus(job);
				const note = getJobStatusNote(job);
				const title = (
					<span className="block truncate font-semibold" title={job.title}>
						{job.title}
					</span>
				);

				return (
					<Card key={job.id}>
						<CardHeader className="gap-3">
							<CardTitle className="min-w-0 flex-1 text-base">
								{isPubliclyViewable(job) ? (
									<Link
										className="underline-offset-4 hover:underline"
										href={`/seeker/jobs/${job.id}` as Route}
									>
										{title}
									</Link>
								) : (
									title
								)}
							</CardTitle>
							<CardAction>
								<EmployerJobActionsMenu
									deletingJobId={deletingJobId}
									job={job}
									onRequestDelete={onRequestDelete}
								/>
							</CardAction>
						</CardHeader>
						<CardContent className="grid gap-3 text-sm">
							<div className="grid grid-cols-2 gap-3">
								<div className="flex flex-col gap-1">
									<span className="text-muted-foreground text-xs">
										직종·지역
									</span>
									<span>{`${job.industryCategory} · ${job.region}`}</span>
								</div>
								<div className="flex flex-col gap-1">
									<span className="text-muted-foreground text-xs">급여</span>
									<span>{formatPay(job.payAmount, job.payUnit)}</span>
								</div>
							</div>
							<div className="flex flex-col items-start gap-1">
								<span className="text-muted-foreground text-xs">공고 상태</span>
								<StatusBadge tone={display.tone}>{display.label}</StatusBadge>
								{note ? (
									<span className="text-muted-foreground text-xs">{note}</span>
								) : null}
							</div>
						</CardContent>
					</Card>
				);
			})}
			{pageCount > 1 ? (
				<div className="flex flex-col items-center gap-1">
					<span className="text-muted-foreground text-sm">
						{safePage} / {pageCount}
					</span>
					<PageControls
						onPageChange={setPage}
						page={safePage}
						pageCount={pageCount}
					/>
				</div>
			) : null}
		</div>
	);
}

function OwnedJobsPanel({
	deletingJobId,
	isDeleting,
	isError,
	isLoading,
	jobs,
	onCancelDelete,
	onConfirmDelete,
	onRequestDelete,
	onRetry,
	verified,
}: {
	deletingJobId: null | string;
	isDeleting: boolean;
	isError: boolean;
	isLoading: boolean;
	jobs: EmployerJob[];
	onCancelDelete: () => void;
	onConfirmDelete: (jobId: string) => void;
	onRequestDelete: (jobId: string) => void;
	onRetry: () => void;
	verified: boolean;
}) {
	if (isLoading) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-20 w-full rounded-lg" />
				<Skeleton className="h-20 w-full rounded-lg" />
				<Skeleton className="h-20 w-full rounded-lg" />
			</div>
		);
	}

	if (isError) {
		return (
			<EmptyState
				action={
					<Button onClick={onRetry} type="button">
						다시 시도
					</Button>
				}
				description="공고 목록을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."
				title="공고를 불러올 수 없습니다"
			/>
		);
	}

	if (jobs.length === 0) {
		return (
			<EmptyState
				action={<NewJobButton verified={verified} />}
				description="조직 프로필을 선택해 첫 공고를 등록해 보세요."
				title="등록한 공고가 없습니다"
			/>
		);
	}

	const jobToDelete = jobs.find((job) => job.id === deletingJobId) ?? null;

	return (
		<div className="flex flex-col gap-3">
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						onCancelDelete();
					}
				}}
				open={jobToDelete !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							“{jobToDelete?.title}” 공고를 삭제할까요?
						</AlertDialogTitle>
						<AlertDialogDescription>
							삭제한 공고와 연결된 광고·성과 기록은 되돌릴 수 없어요.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							disabled={isDeleting}
							onClick={() => {
								if (jobToDelete) {
									onConfirmDelete(jobToDelete.id);
								}
							}}
							variant="destructive"
						>
							{isDeleting ? "삭제 중…" : "삭제"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<Card aria-labelledby="owned-jobs">
				<CardContent className="p-0">
					<MobileOwnedJobs
						deletingJobId={deletingJobId}
						jobs={jobs}
						onRequestDelete={onRequestDelete}
					/>
					<div className="hidden overflow-x-auto md:block">
						<DataTable
							columns={getEmployerJobsColumns({
								deletingJobId,
								onRequestDelete,
							})}
							data={jobs}
							emptyMessage="등록한 공고가 없습니다."
							getRowKey={(job) => job.id}
							pageSize={JOB_PAGE_SIZE}
							showPageInput
						/>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

export default function EmployerPage() {
	const session = authClient.useSession();
	const verified = useEmployerVerified();
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
		...orpc.bambi.promotions.listMyAds.queryOptions(),
		enabled: canLoadJobs,
	});
	const organizationProfiles =
		mineQuery.data?.employerOrganizationProfiles ?? [];
	const teamProfiles = mineQuery.data?.employerTeamProfiles ?? [];
	const jobs = jobsQuery.data ?? [];
	const promotionSummary = getAdSummary(promotionsQuery.data ?? [], Date.now());
	const jobStatusCounts = getJobStatusCounts(jobs);
	const queryClient = useQueryClient();
	const [deletingJobId, setDeletingJobId] = useState<null | string>(null);
	const deleteMutation = useMutation(
		orpc.bambi.jobs.delete.mutationOptions({
			onError: (error) => {
				toast.error(
					error.message ||
						"공고를 삭제하지 못했습니다. 삭제 권한을 확인한 뒤 다시 시도해 주세요."
				);
			},
			onSuccess: async () => {
				setDeletingJobId(null);
				toast.success("공고가 삭제되었습니다.");
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.jobs.listMine.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.promotions.listMyAds.queryKey(),
					}),
				]);
			},
		})
	);

	const getOrganizationLabel = (organizationId: string): string =>
		organizationProfiles.find(
			(organizationProfile) =>
				organizationProfile.organizationId === organizationId
		)?.displayName ?? organizationId;

	if (session.isPending || mineQuery.isLoading) {
		return (
			<PageShell title="내 공고">
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
				description="내 공고는 로그인 후 이용할 수 있습니다."
				title="내 공고"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/seeker?auth=login">
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
				description="내 공고 정보를 불러오지 못했습니다."
				title="내 공고"
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
				description="공고를 등록하려면 밤비알바 프로필 설정이 필요합니다."
				title="내 공고"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/seeker?auth=signup">
							회원가입으로 이동
						</Link>
					}
					description="구인자 프로필을 만든 뒤 조직과 팀의 공고를 관리할 수 있습니다."
					title="밤비알바 프로필이 없습니다"
				/>
			</PageShell>
		);
	}

	if (profile.role === "job_seeker") {
		return (
			<PageShell
				description="현재 계정은 구직자 프로필로 설정되어 있습니다."
				title="내 공고"
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
					title="내 공고 권한이 없습니다"
				/>
			</PageShell>
		);
	}

	const jobsContent = (
		<OwnedJobsPanel
			deletingJobId={deletingJobId}
			isDeleting={
				deleteMutation.isPending &&
				deleteMutation.variables?.id === deletingJobId
			}
			isError={jobsQuery.isError}
			isLoading={jobsQuery.isLoading}
			jobs={jobs}
			onCancelDelete={() => setDeletingJobId(null)}
			onConfirmDelete={(id) => deleteMutation.mutate({ id })}
			onRequestDelete={setDeletingJobId}
			onRetry={() => jobsQuery.refetch()}
			verified={verified}
		/>
	);

	return (
		<PageShell
			actions={<NewJobButton verified={verified} />}
			description="조직과 팀 프로필 상태를 확인하고 소유한 공고를 관리합니다."
			title="내 공고"
		>
			<EmployerGateBanner action="공고를 등록" />
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
									<dt className="text-muted-foreground">진행 중인 광고</dt>
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
									<dt className="text-muted-foreground">
										오늘 남은 끌어올리기
									</dt>
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
				aria-label="내 공고 바로가기"
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
