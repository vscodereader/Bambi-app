"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import {
	EXPOSURE_TYPE_LABELS,
	type ExposureType,
	getJobDisplayStatus,
} from "@/lib/bambi/exposure";
import { formatDate, formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

interface AdListItem {
	adProductName: null | string;
	boostedAt: Date | null | string;
	boostsUsedToday: number;
	employerDisplayName: string;
	exposureEndsAt: Date | null | string;
	exposureType: string;
	jobPostId: string;
	manualBoostsPerDay: number;
	paymentStatus: string;
	publishedAt: Date | null | string;
	status: string;
	teamDisplayName: null | string;
	title: string;
}

const adStatusGroups = [
	{ id: "all", label: "전체" },
	{ id: "active", label: "진행 중" },
	{ id: "pending_payment", label: "결제 대기" },
	{ id: "expired", label: "만료" },
] as const;

type AdStatusGroupId = (typeof adStatusGroups)[number]["id"];

const isExposureActive = (
	exposureEndsAt: Date | null | string,
	now: number
): boolean =>
	exposureEndsAt === null || new Date(exposureEndsAt).getTime() > now;

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

function AdCard({
	ad,
	isBoostPending,
	onBoost,
}: {
	ad: AdListItem;
	isBoostPending: boolean;
	onBoost: (jobPostId: string) => void;
}) {
	const now = Date.now();
	const displayStatus = getJobDisplayStatus({
		paymentStatus: ad.paymentStatus,
		status: ad.status,
	});
	const remainingToday = Math.max(
		0,
		ad.manualBoostsPerDay - ad.boostsUsedToday
	);
	const canBoost =
		ad.status === "published" &&
		ad.paymentStatus === "paid" &&
		isExposureActive(ad.exposureEndsAt, now) &&
		remainingToday > 0;

	return (
		<article className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
			<div className="flex min-w-0 flex-col gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<StatusBadge tone={displayStatus.tone}>
						{displayStatus.label}
					</StatusBadge>
					<StatusBadge tone="default">
						{EXPOSURE_TYPE_LABELS[ad.exposureType as ExposureType] ??
							ad.exposureType}
					</StatusBadge>
					{ad.adProductName ? (
						<StatusBadge tone="default">{ad.adProductName}</StatusBadge>
					) : null}
				</div>
				<div>
					<h2 className="break-words font-semibold text-base">{ad.title}</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						{ad.employerDisplayName}
						{ad.teamDisplayName ? ` · ${ad.teamDisplayName}` : ""}
					</p>
				</div>
				<dl className="grid gap-3 text-sm sm:grid-cols-3">
					<div>
						<dt className="text-muted-foreground text-xs">노출 마감</dt>
						<dd className="mt-1">
							{ad.exposureEndsAt ? (
								formatDate(ad.exposureEndsAt)
							) : (
								<span className="text-muted-foreground">-</span>
							)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">오늘 끌어올리기</dt>
						<dd
							className={cn(
								"mt-1",
								ad.manualBoostsPerDay > 0 &&
									remainingToday === 0 &&
									"text-muted-foreground"
							)}
						>
							{ad.manualBoostsPerDay > 0
								? `남은 ${remainingToday}회 / 일일 ${ad.manualBoostsPerDay}회`
								: "미포함 상품"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">최근 끌어올림</dt>
						<dd className="mt-1">
							{ad.boostedAt ? formatDateTime(ad.boostedAt) : "없음"}
						</dd>
					</div>
				</dl>
			</div>
			<div className="flex flex-wrap gap-2 lg:justify-end">
				{ad.manualBoostsPerDay > 0 ? (
					<Button
						disabled={!canBoost || isBoostPending}
						onClick={() => onBoost(ad.jobPostId)}
						type="button"
					>
						끌어올리기
					</Button>
				) : (
					<span className="self-center text-muted-foreground text-sm">
						이 상품은 끌어올리기 미포함
					</span>
				)}
				<Link
					className={buttonVariants({ variant: "outline" })}
					href={`/employer/jobs/${ad.jobPostId}/edit` as Route}
				>
					공고 수정
				</Link>
			</div>
		</article>
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
			<Card aria-label="광고 공고 목록">
				<CardContent className="divide-y p-0">
					{visibleAds.map((ad) => (
						<AdCard
							ad={ad}
							isBoostPending={boostMutation.isPending}
							key={ad.jobPostId}
							onBoost={(jobPostId) => boostMutation.mutate({ jobPostId })}
						/>
					))}
				</CardContent>
			</Card>
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
					{adStatusGroups.map((group) => (
						<TabsTrigger key={group.id} value={group.id}>
							{group.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{content}
		</PageShell>
	);
}
