"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@bambi-app/ui/components/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@bambi-app/ui/components/popover";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowUpToLineIcon,
	CircleAlertIcon,
	CirclePlayIcon,
	ClockIcon,
	EllipsisIcon,
	FileTextIcon,
	ListIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { BankTransferGuide } from "@/components/bambi/bank-transfer-guide";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import {
	EXPOSURE_TYPE_LABELS,
	type ExposureType,
	getJobDisplayStatus,
	isBannerExposureType,
} from "@/lib/bambi/exposure";
import { formatDate, formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

interface AdListItem {
	adProductName: null | string;
	autoBoostsPerDay: number;
	autoBoostsUsedToday: number;
	boostedAt: Date | null | string;
	boostsUsedToday: number;
	employerDisplayName: string;
	exposureAmount: null | number;
	exposureEndsAt: Date | null | string;
	exposureType: string;
	jobPostId: string;
	manualBoostsPerDay: number;
	paymentStatus: string;
	// 배너 미결제 신청의 파생 큐 정보(진행 가능 여부·대기 순번). 그 외엔 null.
	premiumQueue: {
		progressable: boolean;
		queuePosition: number | null;
		rank: number;
	} | null;
	publishedAt: Date | null | string;
	status: string;
	teamDisplayName: null | string;
	title: string;
}

const adStatusGroups = [
	{ icon: ListIcon, id: "all", label: "전체" },
	{ icon: CirclePlayIcon, id: "active", label: "진행 중" },
	{ icon: ClockIcon, id: "pending_payment", label: "결제 대기" },
	{ icon: CircleAlertIcon, id: "expired", label: "만료" },
] as const;

type AdStatusGroupId = (typeof adStatusGroups)[number]["id"];

const isExposureActive = (
	exposureEndsAt: Date | null | string,
	now: number
): boolean =>
	exposureEndsAt === null || new Date(exposureEndsAt).getTime() > now;

const remainingBoosts = (ad: AdListItem): number =>
	Math.max(0, ad.manualBoostsPerDay - ad.boostsUsedToday);

const exposureLabel = (ad: AdListItem): string =>
	EXPOSURE_TYPE_LABELS[ad.exposureType as ExposureType] ?? ad.exposureType;

interface BoostState {
	canBoost: boolean;
	// 끌어올리기를 누를 수 없을 때 사유. 누를 수 있으면 null.
	disabledReason: null | string;
}

// 끌어올리기 버튼의 활성 여부와, 비활성일 때 왜 못 누르는지 사유를 함께 계산한다.
// (기존 액션 셀이 안내하던 정보량을 드롭다운 안에서 그대로 유지하기 위함)
const getBoostState = (ad: AdListItem): BoostState => {
	if (isBannerExposureType(ad.exposureType)) {
		return {
			canBoost: false,
			disabledReason: "배너 광고는 끌어올리기 대상이 아닙니다.",
		};
	}

	if (ad.manualBoostsPerDay === 0) {
		return { canBoost: false, disabledReason: "끌어올리기 미포함 상품입니다." };
	}

	if (
		ad.status !== "published" ||
		ad.paymentStatus !== "paid" ||
		!isExposureActive(ad.exposureEndsAt, Date.now())
	) {
		return {
			canBoost: false,
			disabledReason: "노출 중인 공고만 끌어올릴 수 있습니다.",
		};
	}

	if (remainingBoosts(ad) === 0) {
		return {
			canBoost: false,
			disabledReason: "오늘 끌어올리기를 모두 사용했습니다.",
		};
	}

	return { canBoost: true, disabledReason: null };
};

// 탭 분류: 노출 만료가 최우선(과거 결제 이력이 있어야 만료가 생김), 그다음 미결제,
// 공개 중 광고가 "진행 중". 검수 대기·반려·숨김·임시 저장은 "전체"에서만 보인다.
const getAdGroupId = (
	ad: AdListItem,
	now: number
): "other" | Exclude<AdStatusGroupId, "all"> => {
	if (ad.exposureEndsAt !== null && !isExposureActive(ad.exposureEndsAt, now)) {
		return "expired";
	}

	if (ad.paymentStatus !== "paid") {
		return "pending_payment";
	}

	if (ad.status === "published") {
		return "active";
	}

	return "other";
};

interface AdColumnsOptions {
	isBoostPending: boolean;
	onBoost: (jobPostId: string) => void;
}

function AdStatusDetails({ ad }: { ad: AdListItem }) {
	const display = getJobDisplayStatus({
		paymentStatus: ad.paymentStatus,
		status: ad.status,
	});

	return (
		<div className="flex flex-wrap items-center gap-2">
			<StatusBadge tone={display.tone}>{display.label}</StatusBadge>
			{ad.paymentStatus === "unpaid" ? (
				<Popover>
					<PopoverTrigger
						render={
							<Button size="sm" type="button" variant="outline">
								입금 안내
							</Button>
						}
					/>
					<PopoverContent align="start" className="w-80">
						<PopoverTitle>무통장입금 안내</PopoverTitle>
						<BankTransferGuide amount={ad.exposureAmount} />
					</PopoverContent>
				</Popover>
			) : null}
			{ad.premiumQueue ? (
				<StatusBadge tone={ad.premiumQueue.progressable ? "good" : "warning"}>
					{ad.premiumQueue.progressable
						? "진행 가능"
						: `대기열 ${ad.premiumQueue.queuePosition}번째`}
				</StatusBadge>
			) : null}
		</div>
	);
}

function AdActionsMenu({
	ad,
	isBoostPending,
	onBoost,
}: {
	ad: AdListItem;
	isBoostPending: boolean;
	onBoost: (jobPostId: string) => void;
}) {
	const { canBoost, disabledReason } = getBoostState(ad);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="광고 관리 메뉴"
				className={cn(buttonVariants({ size: "icon-sm", variant: "ghost" }))}
			>
				<EllipsisIcon />
				<span className="sr-only">광고 관리 메뉴</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-48">
				<DropdownMenuItem
					disabled={!canBoost || isBoostPending}
					onClick={() => onBoost(ad.jobPostId)}
				>
					<ArrowUpToLineIcon />
					끌어올리기
				</DropdownMenuItem>
				{disabledReason ? (
					<p className="m-0 px-2 pb-2 text-muted-foreground text-xs">
						{disabledReason}
					</p>
				) : null}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					render={
						<Link href={`/employer/jobs/${ad.jobPostId}/edit` as Route} />
					}
				>
					<FileTextIcon />
					공고 보기
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function getAdColumns({
	isBoostPending,
	onBoost,
}: AdColumnsOptions): DataColumn<AdListItem>[] {
	return [
		{
			id: "title",
			header: "공고",
			sortValue: (ad) => ad.title,
			cell: (ad) => (
				<div className="flex min-w-0 flex-col gap-1">
					<span className="break-keep font-semibold text-foreground">
						{ad.title}
					</span>
					{ad.teamDisplayName ? (
						<span className="break-keep text-muted-foreground text-xs">
							{ad.teamDisplayName}
						</span>
					) : null}
				</div>
			),
		},
		{
			id: "status",
			header: "상태",
			sortValue: (ad) =>
				getJobDisplayStatus({
					paymentStatus: ad.paymentStatus,
					status: ad.status,
				}).label,
			cell: (ad) => <AdStatusDetails ad={ad} />,
		},
		{
			id: "exposure",
			header: "노출 위치/상품",
			sortValue: (ad) => exposureLabel(ad),
			cell: (ad) => (
				<div className="flex flex-wrap items-center gap-2">
					<StatusBadge>{exposureLabel(ad)}</StatusBadge>
					{ad.adProductName ? (
						<span className="break-keep text-muted-foreground text-xs">
							{ad.adProductName}
						</span>
					) : null}
				</div>
			),
		},
		{
			id: "exposureEndsAt",
			header: "노출 마감",
			sortValue: (ad) =>
				ad.exposureEndsAt === null
					? Number.POSITIVE_INFINITY
					: new Date(ad.exposureEndsAt).getTime(),
			cell: (ad) =>
				ad.exposureEndsAt ? (
					<span className="whitespace-nowrap">
						{formatDate(ad.exposureEndsAt)}
					</span>
				) : (
					<span className="text-muted-foreground">-</span>
				),
		},
		{
			id: "boostsToday",
			header: "오늘 끌어올리기",
			sortValue: (ad) => remainingBoosts(ad),
			cell: (ad) => {
				if (isBannerExposureType(ad.exposureType)) {
					return <span className="text-muted-foreground">—</span>;
				}

				if (ad.manualBoostsPerDay === 0) {
					return <span className="text-muted-foreground">미포함</span>;
				}

				const remaining = remainingBoosts(ad);

				return (
					<span
						className={cn(
							"whitespace-nowrap",
							remaining === 0 && "text-muted-foreground"
						)}
					>
						{`남은 ${remaining}회 / 일일 ${ad.manualBoostsPerDay}회`}
					</span>
				);
			},
		},
		{
			id: "autoBoostsToday",
			header: "자동 끌어올리기",
			sortValue: (ad) => ad.autoBoostsPerDay,
			cell: (ad) => {
				if (ad.autoBoostsPerDay === 0) {
					return <span className="text-muted-foreground">—</span>;
				}

				return (
					<span className="whitespace-nowrap">
						{`오늘 ${ad.autoBoostsUsedToday}/${ad.autoBoostsPerDay}회 실행`}
					</span>
				);
			},
		},
		{
			id: "boostedAt",
			header: "최근 끌어올림",
			sortValue: (ad) =>
				ad.boostedAt === null ? 0 : new Date(ad.boostedAt).getTime(),
			cell: (ad) =>
				ad.boostedAt ? (
					<span className="whitespace-nowrap text-muted-foreground">
						{formatDateTime(ad.boostedAt)}
					</span>
				) : (
					<span className="text-muted-foreground">없음</span>
				),
		},
		{
			id: "actions",
			header: "액션",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (ad) => (
				<AdActionsMenu
					ad={ad}
					isBoostPending={isBoostPending}
					onBoost={onBoost}
				/>
			),
		},
	];
}

const MOBILE_AD_PAGE_SIZE = 10;

function getManualBoostLabel(ad: AdListItem) {
	if (isBannerExposureType(ad.exposureType)) {
		return "—";
	}
	if (ad.manualBoostsPerDay === 0) {
		return "미포함";
	}
	return `남은 ${remainingBoosts(ad)}회 / 일일 ${ad.manualBoostsPerDay}회`;
}

function MobileAds({
	ads,
	isBoostPending,
	onBoost,
}: {
	ads: AdListItem[];
	isBoostPending: boolean;
	onBoost: (jobPostId: string) => void;
}) {
	const [page, setPage] = useState(1);
	const pageCount = Math.max(1, Math.ceil(ads.length / MOBILE_AD_PAGE_SIZE));
	const safePage = Math.min(page, pageCount);
	const pageAds = ads.slice(
		(safePage - 1) * MOBILE_AD_PAGE_SIZE,
		safePage * MOBILE_AD_PAGE_SIZE
	);

	return (
		<div className="flex flex-col gap-3 md:hidden">
			{pageAds.map((ad) => (
				<Card key={ad.jobPostId}>
					<CardHeader className="gap-3">
						<div className="min-w-0 flex-1">
							<CardTitle className="truncate text-base" title={ad.title}>
								{ad.title}
							</CardTitle>
							{ad.teamDisplayName ? (
								<p className="m-0 mt-1 truncate text-muted-foreground text-xs">
									{ad.teamDisplayName}
								</p>
							) : null}
						</div>
						<CardAction>
							<AdActionsMenu
								ad={ad}
								isBoostPending={isBoostPending}
								onBoost={onBoost}
							/>
						</CardAction>
					</CardHeader>
					<CardContent className="grid gap-3 text-sm">
						<div className="flex flex-col items-start gap-1">
							<span className="text-muted-foreground text-xs">상태</span>
							<AdStatusDetails ad={ad} />
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="flex min-w-0 flex-col gap-1">
								<span className="text-muted-foreground text-xs">
									노출 위치/상품
								</span>
								<div className="flex flex-wrap items-center gap-2">
									<StatusBadge>{exposureLabel(ad)}</StatusBadge>
									{ad.adProductName ? (
										<span className="text-muted-foreground text-xs">
											{ad.adProductName}
										</span>
									) : null}
								</div>
							</div>
							<div className="flex flex-col gap-1">
								<span className="text-muted-foreground text-xs">노출 마감</span>
								<span>
									{ad.exposureEndsAt ? formatDate(ad.exposureEndsAt) : "-"}
								</span>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="flex flex-col gap-1">
								<span className="text-muted-foreground text-xs">
									오늘 끌어올리기
								</span>
								<span>{getManualBoostLabel(ad)}</span>
							</div>
							<div className="flex flex-col gap-1">
								<span className="text-muted-foreground text-xs">
									자동 끌어올리기
								</span>
								<span>
									{ad.autoBoostsPerDay === 0
										? "—"
										: `오늘 ${ad.autoBoostsUsedToday}/${ad.autoBoostsPerDay}회 실행`}
								</span>
							</div>
						</div>
						<div className="flex flex-col gap-1">
							<span className="text-muted-foreground text-xs">
								최근 끌어올림
							</span>
							<span className="text-muted-foreground">
								{ad.boostedAt ? formatDateTime(ad.boostedAt) : "없음"}
							</span>
						</div>
					</CardContent>
				</Card>
			))}
			{pageCount > 1 ? (
				<div className="flex items-center justify-between gap-3">
					<Button
						disabled={safePage === 1}
						onClick={() => setPage((current) => Math.max(1, current - 1))}
						type="button"
						variant="outline"
					>
						이전
					</Button>
					<span className="text-muted-foreground text-sm">
						{safePage} / {pageCount}
					</span>
					<Button
						disabled={safePage === pageCount}
						onClick={() =>
							setPage((current) => Math.min(pageCount, current + 1))
						}
						type="button"
						variant="outline"
					>
						다음
					</Button>
				</div>
			) : null}
		</div>
	);
}

export default function EmployerAdsPage() {
	const queryClient = useQueryClient();
	const [selectedGroupId, setSelectedGroupId] =
		useState<AdStatusGroupId>("all");
	const adsQuery = useQuery(orpc.bambi.promotions.listMyAds.queryOptions());
	const ads: AdListItem[] = adsQuery.data ?? [];
	const now = Date.now();
	const visibleAds =
		selectedGroupId === "all"
			? ads
			: ads.filter((ad) => getAdGroupId(ad, now) === selectedGroupId);

	const boostMutation = useMutation(
		orpc.bambi.promotions.boost.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "끌어올리기를 처리하지 못했습니다.");
			},
			onSuccess: async () => {
				toast.success("공고를 끌어올렸습니다.");
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.promotions.listMyAds.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.jobs.listMine.queryKey(),
					}),
				]);
			},
		})
	);

	const { mutate: boost, isPending: isBoostPending } = boostMutation;
	const handleBoost = useCallback(
		(jobPostId: string) => boost({ jobPostId }),
		[boost]
	);

	const columns = useMemo(
		() => getAdColumns({ isBoostPending, onBoost: handleBoost }),
		[isBoostPending, handleBoost]
	);

	if (adsQuery.isLoading) {
		return <Loader />;
	}

	if (adsQuery.isError) {
		return (
			<PageShell
				description="광고 공고 정보를 불러오지 못했습니다."
				title="광고 관리"
			>
				<EmptyState
					action={
						<Button onClick={() => adsQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 조직 권한을 확인한 뒤 다시 시도해 주세요."
					title="광고를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	let content: React.ReactNode;

	if (ads.length === 0) {
		content = (
			<EmptyState
				action={
					<Link className={buttonVariants()} href="/employer/ad-guide">
						광고 상품 보기
					</Link>
				}
				description="공고에 광고 상품을 적용하면 노출 현황과 끌어올리기를 이곳에서 관리할 수 있습니다."
				title="운영 중인 광고가 없습니다"
			/>
		);
	} else if (visibleAds.length === 0) {
		content = (
			<EmptyState
				description="선택한 상태에 해당하는 광고가 없습니다."
				title="표시할 광고가 없습니다"
			/>
		);
	} else {
		content = (
			<div>
				<MobileAds
					ads={visibleAds}
					isBoostPending={isBoostPending}
					onBoost={handleBoost}
				/>
				<div className="hidden overflow-x-auto rounded-xl border border-border md:block">
					<DataTable
						columns={columns}
						data={visibleAds}
						getRowKey={(ad) => ad.jobPostId}
						pageSize={10}
					/>
				</div>
			</div>
		);
	}

	const activeCount = ads.filter(
		(ad) => getAdGroupId(ad, now) === "active"
	).length;

	return (
		<PageShell
			description="광고 상품이 적용된 공고의 노출 상태와 오늘의 끌어올리기 횟수를 관리합니다."
			title="광고 관리"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="m-0 text-muted-foreground text-sm">
					진행 중 {activeCount}개 · 전체 {ads.length}개
				</p>
				<Link
					className={buttonVariants({ variant: "outline" })}
					href="/employer"
				>
					공고 관리
				</Link>
			</div>
			<Tabs
				onValueChange={(value) => setSelectedGroupId(value as AdStatusGroupId)}
				value={selectedGroupId}
			>
				<TabsList className="max-w-full flex-wrap">
					{adStatusGroups.map(({ icon: Icon, id, label }) => (
						<TabsTrigger key={id} value={id}>
							<Icon />
							{label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{content}
		</PageShell>
	);
}
