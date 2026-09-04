import {
	formatBoostOptionSpec,
	JOB_BOOST_OPTION_TYPE_LABELS,
	type JobBoostOptionTypeKey,
} from "@bambi-app/api/services/bambi-job-boost";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Button, Surface } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
} from "@/src/components/bambi-screen";
import { BankAccounts } from "@/src/components/bank-accounts";
import { localErrorMessage } from "@/src/lib/chat/chat-errors";
import { formatAdPrice } from "@/src/lib/employer/ad-exposure";
import {
	type BoostPurchaseSummary,
	canSubmitBoostPurchase,
	getCancelableBoostPurchases,
} from "@/src/lib/employer/boost-options";
import { orpc, queryClient } from "@/src/lib/orpc";

// 무통장입금 고정 — 카드 결제는 준비 중이라 화면에서 막는다(공고 결제와 같은 축).
const PAYMENT_METHOD = "bank_transfer";

// 선택 카드 테두리는 두께를 항상 2로 두고 색만 바꾼다(job-exposure-section과 같은 규칙) —
// 선택/비선택에서 1px 레이아웃 흔들림이 없다.
const cardClassName = (selected: boolean): string =>
	selected
		? "gap-1 rounded-lg border-2 border-accent bg-surface-secondary p-3"
		: "gap-1 rounded-lg border-2 border-border bg-surface p-3";

// 입금 확인 대기(취소 가능) 목록. 편집 조회가 실패하면 빈 목록 대신 경고를 보여 준다 —
// 조용한 빈 목록은 "대기 없음"과 구별되지 않는다.
function PendingPurchases({
	isCanceling,
	isError,
	isLoading,
	onCancel,
	purchases,
}: {
	isCanceling: boolean;
	isError: boolean;
	isLoading: boolean;
	onCancel: (purchaseId: string) => void;
	purchases: BoostPurchaseSummary[];
}) {
	if (isError) {
		return (
			<Text className="text-danger text-xs">
				입금 대기 내역을 불러오지 못했어요.
			</Text>
		);
	}

	// 로딩 중에 "없어요"라고 단정하면 실제로 대기 건이 있는 사용자가 중복 구매를 시도한다.
	if (isLoading) {
		return (
			<Text className="text-muted text-xs">
				입금 대기 내역을 불러오고 있어요.
			</Text>
		);
	}

	if (purchases.length === 0) {
		return (
			<Text className="text-muted text-xs">
				입금 확인을 기다리는 옵션이 없어요.
			</Text>
		);
	}

	return (
		<>
			{purchases.map((purchase) => (
				<View
					className="flex-row items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
					key={purchase.id}
				>
					<View className="flex-1 gap-0.5">
						<Text className="font-medium text-foreground text-sm">
							{JOB_BOOST_OPTION_TYPE_LABELS[purchase.optionType]}
						</Text>
						<Text className="text-muted text-xs">
							{formatAdPrice(purchase.amount)}
						</Text>
					</View>
					<Button
						isDisabled={isCanceling}
						onPress={() => onCancel(purchase.id)}
						size="sm"
						variant="outline"
					>
						<Button.Label>취소</Button.Label>
					</Button>
				</View>
			))}
		</>
	);
}

export default function BoostOptionsScreen() {
	const { jobPostId, jobTitle } = useLocalSearchParams<{
		jobPostId: string;
		jobTitle?: string;
	}>();
	const [selectedType, setSelectedType] =
		useState<JobBoostOptionTypeKey | null>(null);

	const optionsQuery = useQuery(
		orpc.bambi.boostOptions.listOptions.queryOptions()
	);
	// listMyAds를 쓰지 않는다 — 구매 id를 안 내려줘 취소 대상을 만들 수 없다.
	const jobQuery = useQuery(
		orpc.bambi.jobs.getEditableById.queryOptions({
			input: { id: jobPostId },
		})
	);
	const accountsQuery = useQuery(
		orpc.bambi.siteSettings.getPaymentAccounts.queryOptions()
	);

	const invalidateAfterChange = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.promotions.listMyAds.queryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.jobs.getEditableById.queryKey({
					input: { id: jobPostId },
				}),
			}),
		]);

	const purchaseMutation = useMutation(
		orpc.bambi.boostOptions.purchaseOption.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"옵션을 구매하지 못했어요",
					localErrorMessage(error, "잠시 후 다시 시도해 주세요.")
				);
			},
			onSuccess: async () => {
				await invalidateAfterChange();
				setSelectedType(null);
				Alert.alert(
					"옵션을 신청했어요",
					"입금이 확인되면 공고에 바로 적용돼요."
				);
			},
		})
	);

	const cancelMutation = useMutation(
		orpc.bambi.boostOptions.cancelPurchase.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"취소하지 못했어요",
					localErrorMessage(error, "잠시 후 다시 시도해 주세요.")
				);
			},
			onSuccess: async () => {
				await invalidateAfterChange();
			},
		})
	);

	if (!jobPostId) {
		return <ErrorState title="공고 정보를 찾을 수 없어요" />;
	}

	if (optionsQuery.isLoading) {
		return <LoadingState label="끌어올리기 옵션을 불러오고 있어요." />;
	}

	if (optionsQuery.isError) {
		return (
			<ErrorState
				onRetry={() => optionsQuery.refetch()}
				title="끌어올리기 옵션을 불러올 수 없어요"
			/>
		);
	}

	const options = optionsQuery.data ?? [];
	const cancelablePurchases = getCancelableBoostPurchases(
		jobQuery.data?.boostPurchases
	);
	const isPending = purchaseMutation.isPending;

	return (
		<BambiScreen
			stickyFooter={
				<Button
					isDisabled={
						!canSubmitBoostPurchase({
							isPending,
							paymentMethod: PAYMENT_METHOD,
							selectedType,
						})
					}
					onPress={() => {
						if (selectedType === null) {
							return;
						}
						purchaseMutation.mutate({
							jobPostId,
							optionType: selectedType,
							paymentMethod: PAYMENT_METHOD,
						});
					}}
				>
					<Button.Label>{isPending ? "신청 중" : "옵션 구매"}</Button.Label>
				</Button>
			}
		>
			<View className="gap-1">
				{jobTitle ? (
					<Text className="font-bold text-foreground text-lg" selectable>
						{jobTitle}
					</Text>
				) : null}
				<Text className="text-muted text-sm">
					입금이 확인되면 바로 적용돼요.
				</Text>
			</View>

			<View className="gap-2">
				<Text className="font-semibold text-foreground text-sm">
					끌어올리기 옵션
				</Text>
				{options.length === 0 ? (
					<Surface className="rounded-lg p-4" variant="secondary">
						<Text className="text-muted text-sm">
							지금은 판매 중인 끌어올리기 옵션이 없어요.
						</Text>
					</Surface>
				) : (
					options.map((option) => {
						const selected = selectedType === option.optionType;

						return (
							<Pressable
								accessibilityRole="button"
								accessibilityState={{ selected }}
								className={cardClassName(selected)}
								key={option.optionType}
								onPress={() => setSelectedType(option.optionType)}
							>
								<Text className="font-medium text-foreground text-sm">
									{JOB_BOOST_OPTION_TYPE_LABELS[option.optionType]}
								</Text>
								<Text className="text-muted text-xs">
									{formatBoostOptionSpec(option)}
								</Text>
								<Text className="font-medium text-foreground text-xs">
									{formatAdPrice(option.price ?? 0)}
								</Text>
							</Pressable>
						);
					})
				)}
			</View>

			<View className="gap-2">
				<Text className="font-semibold text-foreground text-sm">결제 방법</Text>
				<View className="flex-row gap-2">
					<View className="min-h-11 flex-1 justify-center rounded-lg border-2 border-accent bg-surface-secondary px-3 py-2">
						<Text className="text-center text-foreground text-sm">
							무통장입금
						</Text>
					</View>
					{/* 눌리지 않는다는 게 분명하도록 반투명 + "준비 중". Pressable이 아니다. */}
					<View className="min-h-11 flex-1 justify-center rounded-lg border-2 border-border bg-surface px-3 py-2 opacity-50">
						<Text className="text-center text-muted text-sm">
							신용카드 (준비 중)
						</Text>
					</View>
				</View>
			</View>

			<View className="gap-2">
				<Text className="font-semibold text-foreground text-sm">입금 계좌</Text>
				<BankAccounts
					accounts={accountsQuery.data ?? []}
					emptyMessage="입금 계좌가 준비되기 전이에요. 고객센터로 문의해 주세요."
					isLoading={accountsQuery.isLoading}
				/>
			</View>

			<View className="gap-2">
				<Text className="font-semibold text-foreground text-sm">
					입금 확인 대기
				</Text>
				<PendingPurchases
					isCanceling={cancelMutation.isPending}
					isError={jobQuery.isError}
					isLoading={jobQuery.isLoading}
					onCancel={(purchaseId) => cancelMutation.mutate({ purchaseId })}
					purchases={cancelablePurchases}
				/>
			</View>
		</BambiScreen>
	);
}
