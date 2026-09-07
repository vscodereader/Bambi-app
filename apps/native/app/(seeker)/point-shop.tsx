import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	pointShopBenefitTypeLabel,
	pointShopBuyerStatusLabel,
} from "@bambi-app/api/services/bambi-point-shop-labels";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import {
	Button,
	Chip,
	Dialog,
	Separator,
	Skeleton,
	Surface,
} from "heroui-native";
import { useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	formatDateTime,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { orpc, queryClient } from "@/src/lib/orpc";
import {
	benefitNoticeMessage,
	canCancelOrder,
	pointText,
	purchaseBlockMessage,
	resolvePurchaseMode,
} from "@/src/lib/point-shop";
import { useIdentityVerification } from "@/src/lib/use-identity-verification";

const LOGIN_HREF = "/login" as Href;
const HANGUL_CHAR = /[가-힣]/;

type ShopTab = "items" | "orders";
type PointShopItem = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointShop"]["listItems"]>
>[number];
type PointShopOrder = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointShop"]["myOrders"]>
>[number];

// orpc 입력 검증 실패 메시지는 영어라 그대로 띄우면 안 된다 — 서버가 명시한 한국어만 살린다
// (web localizedPurchaseError와 같은 관례).
const localizedError = (
	message: string | undefined,
	fallback: string
): string => (message && HANGUL_CHAR.test(message) ? message : fallback);

const invalidatePointQueries = () =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: orpc.bambi.pointShop.key() }),
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.attendance.getMine.key(),
		}),
	]);

function ShopTabs({
	onChange,
	tab,
}: {
	onChange: (next: ShopTab) => void;
	tab: ShopTab;
}) {
	// me/messages와 같은 Chip 2개 토글(heroui에 토글 그룹 없음). py-2.5로 48dp 터치 타깃.
	return (
		<View accessibilityRole="tablist" className="flex-row gap-2 py-2.5">
			{(["items", "orders"] as const).map((value) => {
				const selected = tab === value;

				return (
					<Chip
						accessibilityRole="tab"
						accessibilityState={{ selected }}
						color={selected ? "accent" : "default"}
						hitSlop={10}
						key={value}
						onPress={() => onChange(value)}
						size="md"
						variant={selected ? "primary" : "soft"}
					>
						<Chip.Label>
							{value === "items" ? "상품" : "내 교환 내역"}
						</Chip.Label>
					</Chip>
				);
			})}
		</View>
	);
}

function ItemImage({ uri }: { uri: null | string }) {
	return (
		<View className="aspect-square w-full items-center justify-center overflow-hidden rounded-t-lg bg-surface-secondary">
			{uri ? (
				<Image
					accessibilityIgnoresInvertColors
					className="h-full w-full"
					resizeMode="contain"
					source={{ uri }}
				/>
			) : (
				<Text className="font-extrabold text-2xl text-muted">🎁</Text>
			)}
		</View>
	);
}

function ItemCard({
	item,
	onOpen,
}: {
	item: PointShopItem;
	onOpen: () => void;
}) {
	return (
		<View className="w-1/2 p-1.5">
			<Pressable
				accessibilityLabel={`${item.name}, ${pointText(item.pricePoints)}${item.soldOut ? ", 품절" : ""}`}
				accessibilityRole="button"
				className="overflow-hidden rounded-lg border border-border bg-surface active:opacity-75"
				onPress={onOpen}
			>
				<View>
					<ItemImage uri={item.imageUrl} />
					{item.soldOut ? (
						<View className="absolute inset-0 items-center justify-center bg-background/60">
							<Pill tone="neutral">품절</Pill>
						</View>
					) : null}
					<View className="absolute top-2 right-2">
						<Pill tone="accent">{pointText(item.pricePoints)}</Pill>
					</View>
				</View>
				<Text
					className="px-3 py-2.5 font-extrabold text-foreground text-sm"
					numberOfLines={1}
				>
					{item.name}
				</Text>
			</Pressable>
		</View>
	);
}

function PurchaseSummary({
	balance,
	pricePoints,
}: {
	balance: null | number;
	pricePoints: number;
}) {
	return (
		<Surface className="gap-2 rounded-lg p-3" variant="secondary">
			<View className="flex-row justify-between">
				<Text className="text-muted text-sm">필요 포인트</Text>
				<Text className="font-extrabold text-foreground text-sm">
					{pointText(pricePoints)}
				</Text>
			</View>
			{balance === null ? null : (
				<View className="flex-row justify-between">
					<Text className="text-muted text-sm">내 포인트</Text>
					<Text className="font-extrabold text-foreground text-sm">
						{pointText(balance)}
					</Text>
				</View>
			)}
		</Surface>
	);
}

function PurchaseDialog({
	balance,
	isPhoneVerified,
	item,
	onClose,
	role,
}: {
	balance: null | number;
	isPhoneVerified: boolean;
	item: null | PointShopItem;
	onClose: () => void;
	role: string;
}) {
	const identity = useIdentityVerification();
	const purchase = useMutation(
		orpc.bambi.pointShop.purchase.mutationOptions({
			onError: (error) =>
				Alert.alert(
					"구매하지 못했어요",
					localizedError(error.message, "잠시 후 다시 시도해 주세요.")
				),
			onSuccess: async () => {
				onClose();
				await invalidatePointQueries();
				Alert.alert("교환이 완료됐어요", "내 교환 내역에서 확인할 수 있어요.");
			},
		})
	);

	if (!item) {
		return null;
	}

	const mode = resolvePurchaseMode({
		audience: item.audience,
		balance,
		benefitType: item.benefitType,
		isPhoneVerified,
		pricePoints: item.pricePoints,
		role,
		soldOut: item.soldOut,
	});
	const block = purchaseBlockMessage(mode, item.audience);

	return (
		<Dialog isOpen onOpenChange={(open) => (open ? undefined : onClose())}>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<ItemImage uri={item.imageUrl} />
					<View className="flex-row flex-wrap items-center gap-2 pt-3">
						<Dialog.Title>{item.name}</Dialog.Title>
						{item.benefitType === "none" ? null : (
							<Pill tone="neutral">
								{pointShopBenefitTypeLabel(item.benefitType)}
							</Pill>
						)}
					</View>
					<Dialog.Description>
						{item.description ?? "운영자가 확인한 뒤 순서대로 지급해요."}
					</Dialog.Description>
					<PurchaseSummary balance={balance} pricePoints={item.pricePoints} />
					<Text className="text-muted text-sm">
						{benefitNoticeMessage(item)}
					</Text>
					{block ? (
						<Text className="font-bold text-danger text-sm">{block}</Text>
					) : null}
					{mode === "identity" && identity.isAvailable ? (
						<Button
							isDisabled={identity.isPending}
							onPress={identity.startIdentityVerification}
							variant="secondary"
						>
							<Button.Label>본인인증 하기</Button.Label>
						</Button>
					) : null}
					{identity.verification}
					<View className="flex-row gap-3 pt-2">
						<View className="flex-1">
							<Button onPress={onClose} variant="tertiary">
								<Button.Label>닫기</Button.Label>
							</Button>
						</View>
						{mode === "buy" ? (
							<View className="flex-1">
								<Button
									isDisabled={purchase.isPending}
									onPress={() => purchase.mutate({ itemId: item.id })}
								>
									<Button.Label>
										{purchase.isPending ? "구매 중…" : "구매하기"}
									</Button.Label>
								</Button>
							</View>
						) : null}
					</View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}

const ITEM_SKELETON_KEYS = ["a", "b", "c", "d"];

function ItemsTab({
	balance,
	isPhoneVerified,
	isSignedIn,
	role,
}: {
	balance: null | number;
	isPhoneVerified: boolean;
	isSignedIn: boolean;
	role: string;
}) {
	const itemsQuery = useQuery(orpc.bambi.pointShop.listItems.queryOptions());
	const [selected, setSelected] = useState<null | PointShopItem>(null);

	if (itemsQuery.isPending) {
		return (
			<View className="flex-row flex-wrap">
				{ITEM_SKELETON_KEYS.map((key) => (
					<View className="w-1/2 p-1.5" key={key}>
						<Skeleton className="aspect-square rounded-lg" />
					</View>
				))}
			</View>
		);
	}
	if (!itemsQuery.data) {
		return (
			<StateCard
				action={
					<Button
						onPress={() => itemsQuery.refetch()}
						size="sm"
						variant="secondary"
					>
						<Button.Label>다시 시도</Button.Label>
					</Button>
				}
				description="아이템을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
				title="불러오기 실패"
			/>
		);
	}
	if (itemsQuery.data.length === 0) {
		return (
			<StateCard
				description="새 아이템이 등록되면 이곳에 바로 보여요."
				title="준비 중인 아이템이 없어요"
			/>
		);
	}

	return (
		<>
			<View className="-m-1.5 flex-row flex-wrap">
				{itemsQuery.data.map((item) => (
					<ItemCard
						item={item}
						key={item.id}
						onOpen={() =>
							isSignedIn ? setSelected(item) : router.push(LOGIN_HREF)
						}
					/>
				))}
			</View>
			<PurchaseDialog
				balance={balance}
				isPhoneVerified={isPhoneVerified}
				item={selected}
				onClose={() => setSelected(null)}
				role={role}
			/>
		</>
	);
}

function OrderCard({ order }: { order: PointShopOrder }) {
	const cancel = useMutation(
		orpc.bambi.pointShop.cancelMyOrder.mutationOptions({
			onError: (error) =>
				Alert.alert(
					"취소하지 못했어요",
					localizedError(error.message, "잠시 후 다시 시도해 주세요.")
				),
			onSuccess: async (result) => {
				await invalidatePointQueries();
				Alert.alert(
					"취소했어요",
					result.refunded > 0
						? `${pointText(result.refunded)}를 돌려드렸어요.`
						: "보유 상한에 걸려 환불 포인트는 소멸됐어요."
				);
			},
		})
	);
	const cancelable = canCancelOrder(
		{
			benefitType: order.benefitType,
			status: order.status,
			usableUntil: order.usableUntil ? new Date(order.usableUntil) : null,
			usedAt: order.usedAt ? new Date(order.usedAt) : null,
		},
		new Date()
	);

	const confirmCancel = () => {
		Alert.alert(
			"취소·환불",
			`${order.itemName} 구매를 취소할까요? ${pointText(order.pricePoints)}를 돌려드려요.`,
			[
				{ style: "cancel", text: "닫기" },
				{
					onPress: () => cancel.mutate({ orderId: order.id }),
					style: "destructive",
					text: "취소·환불",
				},
			]
		);
	};

	return (
		<Surface className="gap-2 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-center justify-between gap-3">
				<Text
					className="flex-1 font-semibold text-foreground"
					numberOfLines={2}
				>
					{order.itemName}
				</Text>
				<Pill tone={order.status === "canceled" ? "neutral" : "accent"}>
					{pointShopBuyerStatusLabel(order.status)}
				</Pill>
			</View>
			<Text className="text-muted text-xs">{`${pointText(order.pricePoints)} · ${formatDateTime(order.createdAt)}`}</Text>
			{order.usableUntil ? (
				<Text className="text-muted text-xs">{`사용 기한 ${formatDateTime(order.usableUntil)}`}</Text>
			) : null}
			{order.usedAt ? (
				<Text className="text-muted text-xs">{`사용 ${formatDateTime(order.usedAt)}`}</Text>
			) : null}
			{cancelable ? (
				<>
					<Separator />
					<View className="flex-row justify-end">
						<Button
							isDisabled={cancel.isPending}
							onPress={confirmCancel}
							size="sm"
							variant="secondary"
						>
							<Button.Label>취소·환불</Button.Label>
						</Button>
					</View>
				</>
			) : null}
		</Surface>
	);
}

function OrdersTab({ isSignedIn }: { isSignedIn: boolean }) {
	const ordersQuery = useQuery({
		...orpc.bambi.pointShop.myOrders.queryOptions(),
		enabled: isSignedIn,
	});

	if (!isSignedIn) {
		return (
			<StateCard
				action={
					<Button
						onPress={() => router.push(LOGIN_HREF)}
						size="sm"
						variant="secondary"
					>
						<Button.Label>로그인</Button.Label>
					</Button>
				}
				description="로그인하면 교환 내역을 볼 수 있어요."
				title="로그인이 필요해요"
			/>
		);
	}
	if (ordersQuery.isPending) {
		return (
			<View className="gap-3">
				<Skeleton className="h-20 rounded-lg" />
				<Skeleton className="h-20 rounded-lg" />
			</View>
		);
	}
	if (!ordersQuery.data) {
		return (
			<StateCard
				action={
					<Button
						onPress={() => ordersQuery.refetch()}
						size="sm"
						variant="secondary"
					>
						<Button.Label>다시 시도</Button.Label>
					</Button>
				}
				description="교환 내역을 불러오지 못했어요."
				title="불러오기 실패"
			/>
		);
	}
	if (ordersQuery.data.length === 0) {
		return (
			<StateCard
				description="상품을 교환하면 여기에 쌓여요."
				title="교환 내역이 없어요"
			/>
		);
	}

	return (
		<View className="gap-3">
			{ordersQuery.data.map((order) => (
				<OrderCard key={order.id} order={order} />
			))}
		</View>
	);
}

export default function SeekerPointShopScreen() {
	const [tab, setTab] = useState<ShopTab>("items");
	const session = authClient.useSession();
	const isSignedIn = Boolean(session.data?.user);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isSignedIn,
	});
	const profile = mineQuery.data?.bambiProfile ?? null;
	const role = profile?.role ?? "job_seeker";
	// 잔액은 구매 자격이 있는 역할에서만 조회한다(서버 requirePurchaseProfile과 같은 축) —
	// 운영자 계정에서 403을 반복해 받지 않는다.
	const balanceQuery = useQuery({
		...orpc.bambi.pointShop.getMyBalance.queryOptions(),
		enabled: isSignedIn && (role === "job_seeker" || role === "employer"),
	});
	const balance = balanceQuery.data?.pointBalance ?? null;

	return (
		<BambiScreen>
			<BambiHeader
				action={
					balance === null ? null : (
						<Pill tone="accent">{pointText(balance)}</Pill>
					)
				}
				description="출석·글쓰기로 모은 포인트로 교환해요. 신청하면 운영자가 확인 후 지급해요."
				title="포인트몰"
			/>
			<ShopTabs onChange={setTab} tab={tab} />
			{tab === "items" ? (
				<ItemsTab
					balance={balance}
					isPhoneVerified={Boolean(profile?.isPhoneVerified)}
					isSignedIn={isSignedIn}
					role={role}
				/>
			) : (
				<OrdersTab isSignedIn={isSignedIn} />
			)}
		</BambiScreen>
	);
}
