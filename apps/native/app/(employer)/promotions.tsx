import { sumJobPaymentAmount } from "@bambi-app/api/services/bambi-job-detail-design";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, cn, Dialog, Surface } from "heroui-native";
import type { PropsWithChildren } from "react";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	formatDateTime,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { localErrorMessage } from "@/src/lib/chat/chat-errors";
import { formatAdPrice } from "@/src/lib/employer/ad-exposure";
import {
	AD_STATUS_GROUPS,
	type AdBadge,
	type AdStatusGroupId,
	autoBoostBadge,
	countActiveAds,
	type EmployerAd,
	exposureLabel,
	formatAdDate,
	getAdGroupId,
	getBoostState,
	manualBoostBadges,
	premiumQueueBadge,
} from "@/src/lib/employer/ad-promotions";
import { getJobDisplayStatus } from "@/src/lib/employer/job-status";
import { orpc, queryClient } from "@/src/lib/orpc";

// 상태 탭. web은 Tabs 트랙이었지만 좁은 폭(360dp)에서 네 개가 한 줄에 안 들어가
// 가로 스크롤이 생긴다 — 접히는 칩 행으로 바꾼다.
function StatusTabs({
	onChange,
	selectedId,
}: {
	onChange: (id: AdStatusGroupId) => void;
	selectedId: AdStatusGroupId;
}) {
	return (
		<View className="flex-row flex-wrap gap-2">
			{AD_STATUS_GROUPS.map((group) => {
				const isSelected = group.id === selectedId;

				return (
					<Pressable
						accessibilityRole="button"
						accessibilityState={{ selected: isSelected }}
						className={cn(
							"rounded-full border px-4 py-2 active:opacity-75",
							isSelected
								? "border-accent bg-accent/15"
								: "border-border bg-surface"
						)}
						key={group.id}
						onPress={() => onChange(group.id)}
					>
						<Text
							className={cn(
								"font-semibold text-sm",
								isSelected ? "text-accent" : "text-muted"
							)}
						>
							{group.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

// 라벨(왼쪽)과 값(오른쪽)의 한 줄. 값이 배지 여러 개일 수 있어 오른쪽도 접히게 둔다.
function AdRow({ children, label }: PropsWithChildren<{ label: string }>) {
	return (
		<View className="flex-row flex-wrap items-center justify-between gap-2">
			<Text className="text-muted text-xs">{label}</Text>
			<View className="flex-row flex-wrap items-center justify-end gap-2">
				{children}
			</View>
		</View>
	);
}

function BadgeList({ badges }: { badges: AdBadge[] }) {
	return (
		<>
			{badges.map((badge) => (
				<Pill key={badge.label} tone={badge.tone}>
					{badge.label}
				</Pill>
			))}
		</>
	);
}

function AdCard({
	ad,
	isBoostPending,
	now,
	onBoost,
	onShowBankGuide,
}: {
	ad: EmployerAd;
	isBoostPending: boolean;
	now: Date;
	onBoost: (jobPostId: string) => void;
	onShowBankGuide: (ad: EmployerAd) => void;
}) {
	const display = getJobDisplayStatus(ad);
	const { canBoost, disabledReason } = getBoostState(ad, now);
	const queueBadge = premiumQueueBadge(ad.premiumQueue);

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="gap-1">
				<Text className="font-bold text-foreground text-lg" selectable>
					{ad.title}
				</Text>
				{ad.teamDisplayName ? (
					<Text className="text-muted text-xs">{ad.teamDisplayName}</Text>
				) : null}
			</View>

			<View className="flex-row flex-wrap items-center gap-2">
				<Pill tone={display.tone}>{display.label}</Pill>
				<Pill>{exposureLabel(ad.exposureType)}</Pill>
				{ad.adProductName ? <Pill>{ad.adProductName}</Pill> : null}
				{queueBadge ? (
					<Pill tone={queueBadge.tone}>{queueBadge.label}</Pill>
				) : null}
				{ad.hasUnpaidBoostOption ? (
					<Pill tone="warning">옵션 입금 대기</Pill>
				) : null}
			</View>

			<View className="gap-2">
				<AdRow label="노출 마감">
					<Text className="text-foreground text-sm">
						{ad.exposureEndsAt ? formatAdDate(ad.exposureEndsAt) : "-"}
					</Text>
				</AdRow>
				<AdRow label="오늘 끌어올리기">
					<BadgeList badges={manualBoostBadges(ad)} />
				</AdRow>
				<AdRow label="자동 끌어올리기">
					<BadgeList badges={[autoBoostBadge(ad)]} />
				</AdRow>
				<AdRow label="최근 끌어올림">
					<Text className="text-muted text-sm">
						{ad.boostedAt ? formatDateTime(ad.boostedAt) : "없음"}
					</Text>
				</AdRow>
			</View>

			{disabledReason ? (
				<Text className="text-muted text-xs">{disabledReason}</Text>
			) : null}

			<View className="flex-row flex-wrap gap-2">
				<Button
					isDisabled={!canBoost || isBoostPending}
					onPress={() => onBoost(ad.jobPostId)}
					size="sm"
					variant="secondary"
				>
					<Button.Label>끌어올리기</Button.Label>
				</Button>
				{/* 미결제 건만 입금 안내를 연다(web Popover 자리 — native에는 Popover가 없다). */}
				{ad.paymentStatus === "unpaid" ? (
					<Button
						onPress={() => onShowBankGuide(ad)}
						size="sm"
						variant="outline"
					>
						<Button.Label>입금 안내</Button.Label>
					</Button>
				) : null}
			</View>
		</Surface>
	);
}

// 무통장입금 안내. 계좌 값은 web BankTransferGuide와 같은 공개 조회에서 읽는다.
function BankGuideDialog({
	ad,
	onClose,
}: {
	ad: EmployerAd | null;
	onClose: () => void;
}) {
	const accountsQuery = useQuery({
		...orpc.bambi.siteSettings.getPaymentAccounts.queryOptions(),
		enabled: ad !== null,
	});
	const accounts = accountsQuery.data ?? [];
	const amount = ad
		? sumJobPaymentAmount(ad.exposureAmount, ad.detailDesignAmount)
		: null;

	return (
		<Dialog
			isOpen={ad !== null}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<Dialog.Title>무통장입금 안내</Dialog.Title>
					<Dialog.Description>
						{amount === null
							? "아래 계좌로 입금해 주세요."
							: `결제 예정 금액 ${formatAdPrice(amount)}`}
					</Dialog.Description>
					<View className="gap-2 pt-2">
						{accounts.length > 0 ? (
							<>
								{accounts.map((account) => (
									<View
										className="gap-0.5 rounded-lg border border-border bg-surface px-3 py-2"
										key={`${account.bank}-${account.accountNumber}`}
									>
										<Text
											className="font-medium text-foreground text-sm"
											selectable
										>
											{`${account.bank} ${account.accountNumber}`}
										</Text>
										<Text className="text-muted text-xs">
											{`예금주 ${account.holder}`}
										</Text>
									</View>
								))}
								<Text className="text-muted text-xs">
									입금자명은 업체명(상호)과 동일하게 입금해 주세요. 입금 확인 후
									공고가 게시됩니다.
								</Text>
							</>
						) : (
							<Text className="text-danger text-xs">
								{accountsQuery.isLoading
									? "입금 계좌를 불러오고 있어요."
									: "입금 계좌가 준비되기 전이에요. 고객센터로 문의해 주세요."}
							</Text>
						)}
						<View className="flex-row justify-end pt-2">
							<Button onPress={onClose} size="sm" variant="secondary">
								<Button.Label>닫기</Button.Label>
							</Button>
						</View>
					</View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}

export default function EmployerPromotionsScreen() {
	const [selectedGroupId, setSelectedGroupId] =
		useState<AdStatusGroupId>("all");
	const [bankGuideAd, setBankGuideAd] = useState<EmployerAd | null>(null);
	const adsQuery = useQuery(orpc.bambi.promotions.listMyAds.queryOptions());

	const boostMutation = useMutation(
		orpc.bambi.promotions.boost.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"끌어올리지 못했어요",
					localErrorMessage(error, "잠시 후 다시 시도해 주세요.")
				);
			},
			onSuccess: async () => {
				// 목록 화면의 게시 순서도 함께 바뀐다.
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.promotions.listMyAds.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.jobs.listMine.queryKey(),
					}),
				]);
				Alert.alert("끌어올렸어요", "공고를 목록 위로 올렸습니다.");
			},
		})
	);

	if (adsQuery.isLoading) {
		return <LoadingState label="광고를 불러오고 있습니다." />;
	}

	if (adsQuery.isError) {
		return (
			<ErrorState
				onRetry={() => adsQuery.refetch()}
				title="광고를 불러올 수 없습니다"
			/>
		);
	}

	const ads = adsQuery.data ?? [];
	// 목록을 그리는 시점 기준으로 만료·끌어올리기 가능 여부를 한 번만 판정한다.
	const now = new Date();
	const visibleAds =
		selectedGroupId === "all"
			? ads
			: ads.filter((ad) => getAdGroupId(ad, now) === selectedGroupId);

	return (
		<BambiScreen>
			<Text className="text-muted text-sm">
				{`진행 중 광고 ${countActiveAds(ads, now)}개 · 전체 공고 ${ads.length}개`}
			</Text>

			<StatusTabs onChange={setSelectedGroupId} selectedId={selectedGroupId} />

			{ads.length === 0 ? (
				<StateCard
					description="공고를 등록하면 노출 현황과 끌어올리기를 이곳에서 관리할 수 있어요."
					title="관리할 공고가 없어요"
				/>
			) : null}

			{ads.length > 0 && visibleAds.length === 0 ? (
				<StateCard
					description="다른 상태 탭을 골라 보세요."
					title="표시할 공고가 없어요"
				/>
			) : null}

			{visibleAds.map((ad) => (
				<AdCard
					ad={ad}
					isBoostPending={boostMutation.isPending}
					key={ad.jobPostId}
					now={now}
					onBoost={(jobPostId) => boostMutation.mutate({ jobPostId })}
					onShowBankGuide={setBankGuideAd}
				/>
			))}

			<BankGuideDialog ad={bankGuideAd} onClose={() => setBankGuideAd(null)} />
		</BambiScreen>
	);
}
