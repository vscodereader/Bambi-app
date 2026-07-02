"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const promotionStatusLabels = {
	active: "진행 중",
	canceled: "취소",
	draft: "임시",
	expired: "종료",
	paused: "일시정지",
	pending_payment: "결제 대기",
} as const;

const jobStatusLabels = {
	draft: "임시 저장",
	hidden: "숨김",
	pending_review: "검수 대기",
	published: "공개",
	rejected: "반려",
} as const;

const promotionStatusGroups = [
	{ id: "all", label: "전체", statuses: [] },
	{ id: "active", label: "게재중", statuses: ["active"] },
	{
		id: "pending_payment",
		label: "결제대기",
		statuses: ["pending_payment"],
	},
	{ id: "paused", label: "일시중지", statuses: ["paused"] },
	{ id: "ended", label: "종료", statuses: ["expired", "canceled"] },
] as const;

type PromotionStatusGroupId = (typeof promotionStatusGroups)[number]["id"];

const getPromotionStatusLabel = (status: string): string =>
	promotionStatusLabels[status as keyof typeof promotionStatusLabels] ?? status;

const getJobStatusLabel = (status: string): string =>
	jobStatusLabels[status as keyof typeof jobStatusLabels] ?? status;

const getPromotionStatusTone = (
	status: string
): React.ComponentProps<typeof StatusBadge>["tone"] => {
	if (status === "active") {
		return "good";
	}

	if (status === "draft" || status === "pending_payment") {
		return "warning";
	}

	if (status === "paused") {
		return "default";
	}

	return "danger";
};

const getJobStatusTone = (
	status: string
): React.ComponentProps<typeof StatusBadge>["tone"] =>
	status === "published" ? "good" : "warning";

interface PromotionListItem {
	employerDisplayName: string;
	endsAt: Date | string;
	id: string;
	jobPostId: string;
	jobStatus: string;
	jobTitle: string;
	lastBoostedAt: Date | null | string;
	manualBoostsTotal: number;
	promotionLabel: string;
	remainingManualBoosts: number;
	startsAt: Date | string;
	status: string;
	teamDisplayName: null | string;
}

interface PromotionCardProps {
	isActivatePending: boolean;
	isBoostPending: boolean;
	isPausePending: boolean;
	onActivate: (campaignId: string) => void;
	onBoost: (campaignId: string) => void;
	onPause: (campaignId: string) => void;
	promotion: PromotionListItem;
}

function PromotionCard({
	isActivatePending,
	isBoostPending,
	isPausePending,
	onActivate,
	onBoost,
	onPause,
	promotion,
}: PromotionCardProps) {
	const canBoost =
		promotion.status === "active" &&
		promotion.jobStatus === "published" &&
		promotion.remainingManualBoosts > 0;
	const canActivate =
		promotion.status === "draft" || promotion.status === "pending_payment";

	return (
		<article className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
			<div className="min-w-0 space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<StatusBadge tone={getPromotionStatusTone(promotion.status)}>
						{getPromotionStatusLabel(promotion.status)}
					</StatusBadge>
					<StatusBadge tone="default">{promotion.promotionLabel}</StatusBadge>
					<StatusBadge tone={getJobStatusTone(promotion.jobStatus)}>
						공고 {getJobStatusLabel(promotion.jobStatus)}
					</StatusBadge>
				</div>
				<div>
					<h2 className="break-words font-semibold text-base">
						{promotion.jobTitle}
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						{promotion.employerDisplayName}
						{promotion.teamDisplayName ? ` · ${promotion.teamDisplayName}` : ""}
					</p>
				</div>
				<dl className="grid gap-3 text-sm sm:grid-cols-3">
					<div>
						<dt className="text-muted-foreground text-xs">노출 기간</dt>
						<dd className="mt-1">
							{formatDateTime(promotion.startsAt)} -{" "}
							{formatDateTime(promotion.endsAt)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">남은 끌어올리기</dt>
						<dd className="mt-1">
							{promotion.remainingManualBoosts} / {promotion.manualBoostsTotal}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">최근 끌어올림</dt>
						<dd className="mt-1">
							{promotion.lastBoostedAt
								? formatDateTime(promotion.lastBoostedAt)
								: "없음"}
						</dd>
					</div>
				</dl>
			</div>
			<div className="flex flex-wrap gap-2 lg:justify-end">
				<Button
					disabled={!canBoost || isBoostPending}
					onClick={() => onBoost(promotion.id)}
					type="button"
				>
					끌어올리기
				</Button>
				{canActivate ? (
					<Button
						disabled={isActivatePending}
						onClick={() => onActivate(promotion.id)}
						type="button"
						variant="secondary"
					>
						활성화
					</Button>
				) : null}
				{promotion.status === "active" ? (
					<Button
						disabled={isPausePending}
						onClick={() => onPause(promotion.id)}
						type="button"
						variant="secondary"
					>
						일시정지
					</Button>
				) : null}
				<Link
					className={buttonVariants({ variant: "outline" })}
					href={`/employer/jobs/${promotion.jobPostId}/edit` as Route}
				>
					공고 수정
				</Link>
			</div>
		</article>
	);
}

export default function EmployerPromotionsPage() {
	const queryClient = useQueryClient();
	const [selectedGroupId, setSelectedGroupId] =
		useState<PromotionStatusGroupId>("all");
	const promotionsQuery = useQuery(
		orpc.bambi.promotions.listMine.queryOptions()
	);
	const promotions = promotionsQuery.data ?? [];
	const selectedGroup = promotionStatusGroups.find(
		(group) => group.id === selectedGroupId
	);
	const selectedStatuses = new Set<string>(selectedGroup?.statuses ?? []);
	const visiblePromotions =
		selectedStatuses.size > 0
			? promotions.filter((promotion) => selectedStatuses.has(promotion.status))
			: promotions;

	const invalidatePromotionData = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.promotions.listMine.queryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.jobs.listMine.queryKey(),
			}),
		]);
	};

	const boostMutation = useMutation(
		orpc.bambi.promotions.boost.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "끌어올리기를 처리하지 못했습니다.");
			},
			onSuccess: async () => {
				toast.success("공고를 끌어올렸습니다.");
				await invalidatePromotionData();
			},
		})
	);
	const pauseMutation = useMutation(
		orpc.bambi.promotions.pause.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "프로모션을 일시정지하지 못했습니다.");
			},
			onSuccess: async () => {
				toast.success("프로모션을 일시정지했습니다.");
				await invalidatePromotionData();
			},
		})
	);
	const activateMutation = useMutation(
		orpc.bambi.promotions.activateForManualPayment.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "프로모션을 활성화하지 못했습니다.");
			},
			onSuccess: async () => {
				toast.success("프로모션을 활성화했습니다.");
				await invalidatePromotionData();
			},
		})
	);

	if (promotionsQuery.isLoading) {
		return <Loader />;
	}

	if (promotionsQuery.isError) {
		return (
			<PageShell
				description="구인자 프로모션 정보를 불러오지 못했습니다."
				title="프로모션 관리"
			>
				<EmptyState
					action={
						<Button onClick={() => promotionsQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 조직 권한을 확인한 뒤 다시 시도해 주세요."
					title="프로모션을 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	let promotionContent: React.ReactNode;

	if (promotions.length === 0) {
		promotionContent = (
			<EmptyState
				action={
					<Link className={buttonVariants()} href="/employer">
						내 공고 보기
					</Link>
				}
				description="공고별 프로모션을 만들면 남은 끌어올리기와 노출 종료일을 이곳에서 확인할 수 있습니다."
				title="운영 중인 프로모션이 없습니다"
			/>
		);
	} else if (visiblePromotions.length === 0) {
		promotionContent = (
			<EmptyState
				description="선택한 상태에 해당하는 프로모션이 없습니다."
				title="표시할 프로모션이 없습니다"
			/>
		);
	} else {
		promotionContent = (
			<section aria-label="프로모션 목록" className="overflow-hidden border">
				<div className="divide-y">
					{visiblePromotions.map((promotion) => (
						<PromotionCard
							isActivatePending={activateMutation.isPending}
							isBoostPending={boostMutation.isPending}
							isPausePending={pauseMutation.isPending}
							key={promotion.id}
							onActivate={(campaignId) =>
								activateMutation.mutate({ campaignId })
							}
							onBoost={(campaignId) => boostMutation.mutate({ campaignId })}
							onPause={(campaignId) => pauseMutation.mutate({ campaignId })}
							promotion={promotion}
						/>
					))}
				</div>
			</section>
		);
	}

	return (
		<PageShell
			description="프리미엄·추천 노출 상태와 남은 끌어올리기 횟수를 관리합니다."
			title="프로모션 관리"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="m-0 text-muted-foreground text-sm">
					진행 중 {promotions.filter((item) => item.status === "active").length}
					개 · 전체 {promotions.length}개
				</p>
				<Link
					className={buttonVariants({ variant: "outline" })}
					href="/employer"
				>
					공고 관리
				</Link>
			</div>
			<div className="flex flex-wrap gap-2" role="tablist">
				{promotionStatusGroups.map((group) => (
					<Button
						aria-selected={selectedGroupId === group.id}
						key={group.id}
						onClick={() => setSelectedGroupId(group.id)}
						type="button"
						variant={selectedGroupId === group.id ? "default" : "secondary"}
					>
						{group.label}
					</Button>
				))}
			</div>

			{promotionContent}
		</PageShell>
	);
}
