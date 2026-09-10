import { sumJobPaymentAmount } from "@bambi-app/api/services/bambi-job-detail-design";
import {
	pointShopBenefitTypeLabel,
	pointShopOrderStatusLabel,
} from "@bambi-app/api/services/bambi-point-shop-labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import {
	Button,
	Input,
	Surface,
	Switch,
	TextField,
	useToast,
} from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { BambiHeader, BambiScreen } from "@/src/components/bambi-screen";
import {
	AdminAdProductForm,
	type AdminPlacement,
} from "@/src/components/moderation/ad-product-form";
import { DesignMediaManager } from "@/src/components/moderation/design-media-manager";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import {
	PointShopItemForm,
	type ShopItem,
} from "@/src/components/moderation/point-shop-item-form";
import { QueryFeedback } from "@/src/components/moderation/query-feedback";
import { orpc } from "@/src/lib/orpc";

type Tab = "products" | "payments" | "shop";
const TABS = [
	{ label: "광고 상품", value: "products" },
	{ label: "결제", value: "payments" },
	{ label: "포인트몰", value: "shop" },
] as const;

function Products() {
	const reorderPlacements = useMutation(
		orpc.bambi.adProducts.reorderPlacements.mutationOptions()
	);
	const reorderProducts = useMutation(
		orpc.bambi.adProducts.reorderProducts.mutationOptions()
	);
	const [editing, setEditing] = useState<{
		placement: AdminPlacement;
		product?: AdminPlacement["products"][number];
	} | null>(null);
	const [placementKind, setPlacementKind] = useState<"listing" | "banner">(
		"listing"
	);
	const [description, setDescription] = useState("");
	const [name, setName] = useState("");
	const query = useQuery(orpc.bambi.adProducts.listCatalogAdmin.queryOptions());
	const create = useMutation(
		orpc.bambi.adProducts.createPlacement.mutationOptions()
	);
	const update = useMutation(
		orpc.bambi.adProducts.updatePlacement.mutationOptions()
	);
	const remove = useMutation(
		orpc.bambi.adProducts.deletePlacement.mutationOptions()
	);
	const removeProduct = useMutation(
		orpc.bambi.adProducts.deleteProduct.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	const refresh = () =>
		client.invalidateQueries({ queryKey: orpc.bambi.adProducts.key() });
	const act = async (action: () => Promise<unknown>) => {
		try {
			await action();
			await refresh();
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "처리하지 못했어요.",
				variant: "danger",
			});
		}
	};
	return (
		<View className="gap-3">
			<QueryFeedback
				empty={query.data?.length === 0}
				query={query}
				title="광고 상품 목록"
			/>
			{editing ? (
				<AdminAdProductForm
					key={editing.product?.id ?? editing.placement.id}
					onClose={() => setEditing(null)}
					placement={editing.placement}
					product={editing.product}
				/>
			) : null}
			<Surface className="gap-2 rounded-lg p-4" variant="secondary">
				<Text className="font-bold text-foreground">게재 위치 추가</Text>
				<TextField>
					<Input
						accessibilityLabel="위치 설명"
						onChangeText={setDescription}
						placeholder="안내 문구"
						value={description}
					/>
				</TextField>
				<Button
					onPress={() =>
						setPlacementKind((kind) =>
							kind === "listing" ? "banner" : "listing"
						)
					}
					size="sm"
					variant="secondary"
				>
					<Button.Label>
						{placementKind === "listing" ? "리스팅 노출" : "배너 광고"}
					</Button.Label>
				</Button>
				<TextField>
					<Input
						maxLength={120}
						onChangeText={setName}
						placeholder="위치 이름"
						value={name}
					/>
				</TextField>
				<Button
					isDisabled={!name.trim() || create.isPending}
					onPress={() =>
						act(async () => {
							await create.mutateAsync({
								name: name.trim(),
								kind: placementKind,
								description: description.trim(),
								sortOrder: query.data?.length ?? 0,
							});
							setName("");
						})
					}
				>
					<Button.Label>추가</Button.Label>
				</Button>
			</Surface>
			{query.data?.map((placement) => (
				<Surface
					className="gap-3 rounded-lg p-4"
					key={placement.id}
					variant="secondary"
				>
					<View className="flex-row items-center justify-between">
						<View>
							<Text className="font-bold text-foreground">
								{placement.name}
							</Text>
							<Text className="text-muted text-xs">
								{placement.kind === "banner" ? "배너" : "목록"}
							</Text>
						</View>
						<Switch
							isSelected={placement.isActive}
							onSelectedChange={(isActive) =>
								act(() => update.mutateAsync({ id: placement.id, isActive }))
							}
						/>
					</View>
					{placement.products.map((product) => (
						<View
							className="gap-1 rounded-lg bg-background p-3"
							key={product.id}
						>
							<Text className="font-semibold text-foreground">
								{product.name}
							</Text>
							<OrderControls
								id={product.id}
								ids={placement.products.map((item) => item.id)}
								onChange={(ids) =>
									act(() =>
										reorderProducts.mutateAsync({
											placementId: placement.id,
											ids,
										})
									)
								}
								pending={reorderProducts.isPending}
							/>
							<Text className="text-muted text-xs">
								{product.priceOptions
									.map(
										(price) =>
											`${price.days}일 ${price.amount.toLocaleString("ko-KR")}원`
									)
									.join(" · ")}
							</Text>
							<Button
								onPress={() => setEditing({ placement, product })}
								size="sm"
								variant="secondary"
							>
								<Button.Label>상품 수정</Button.Label>
							</Button>
							<Button
								isDisabled={removeProduct.isPending}
								onPress={() =>
									Alert.alert(
										"광고 상품 삭제",
										`${product.name} 상품을 삭제할까요?`,
										[
											{ text: "취소", style: "cancel" },
											{
												text: "삭제",
												style: "destructive",
												onPress: () =>
													act(() =>
														removeProduct.mutateAsync({ id: product.id })
													),
											},
										]
									)
								}
								size="sm"
								variant="danger-soft"
							>
								<Button.Label>상품 삭제</Button.Label>
							</Button>
						</View>
					))}
					<Button onPress={() => setEditing({ placement })} size="sm">
						<Button.Label>상품 추가</Button.Label>
					</Button>
					<PlacementEdit
						onSave={(values) =>
							act(() => update.mutateAsync({ id: placement.id, ...values }))
						}
						pending={update.isPending}
						placement={placement}
					/>
					<OrderControls
						id={placement.id}
						ids={(query.data ?? []).map((item) => item.id)}
						onChange={(ids) =>
							act(() => reorderPlacements.mutateAsync({ ids }))
						}
						pending={reorderPlacements.isPending}
					/>
					<Button
						onPress={() =>
							Alert.alert(
								"게재 위치 삭제",
								"하위 상품도 함께 삭제됩니다. 삭제할까요?",
								[
									{ text: "취소", style: "cancel" },
									{
										text: "삭제",
										style: "destructive",
										onPress: () =>
											act(() => remove.mutateAsync({ id: placement.id })),
									},
								]
							)
						}
						size="sm"
						variant="danger-soft"
					>
						<Button.Label>위치와 상품 삭제</Button.Label>
					</Button>
				</Surface>
			))}
		</View>
	);
}

function OrderControls({
	ids,
	id,
	pending,
	onChange,
}: {
	ids: string[];
	id: string;
	pending: boolean;
	onChange: (ids: string[]) => Promise<void>;
}) {
	const position = ids.indexOf(id);
	return (
		<View className="flex-row gap-2">
			{([-1, 1] as const).map((direction) => (
				<Button
					isDisabled={
						pending ||
						position < 0 ||
						position + direction < 0 ||
						position + direction >= ids.length
					}
					key={direction}
					onPress={() => {
						const next = [...ids];
						next.splice(position, 1);
						next.splice(position + direction, 0, id);
						return onChange(next);
					}}
					size="sm"
					variant="secondary"
				>
					<Button.Label>
						{direction === -1 ? "순서 위로" : "순서 아래로"}
					</Button.Label>
				</Button>
			))}
		</View>
	);
}

function PlacementEdit({
	placement,
	onSave,
	pending,
}: {
	placement: AdminPlacement;
	onSave: (values: {
		name: string;
		description: string;
		kind: "banner" | "listing";
		sortOrder: number;
	}) => Promise<void>;
	pending: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(placement.name);
	const [description, setDescription] = useState(placement.description ?? "");
	const [kind, setKind] = useState(placement.kind);
	const [sort, setSort] = useState(String(placement.sortOrder));
	return (
		<View className="gap-2">
			<Button onPress={() => setOpen(!open)} size="sm" variant="secondary">
				<Button.Label>게재 위치 수정</Button.Label>
			</Button>
			{open ? (
				<>
					<TextField>
						<Input
							accessibilityLabel="위치 이름"
							onChangeText={setName}
							value={name}
						/>
					</TextField>
					<TextField>
						<Input
							accessibilityLabel="위치 설명"
							onChangeText={setDescription}
							value={description}
						/>
					</TextField>
					<TextField>
						<Input
							accessibilityLabel="위치 정렬값"
							keyboardType="number-pad"
							onChangeText={setSort}
							value={sort}
						/>
					</TextField>
					<Button
						onPress={() =>
							setKind((current) =>
								current === "listing" ? "banner" : "listing"
							)
						}
						size="sm"
						variant="secondary"
					>
						<Button.Label>
							{kind === "listing" ? "리스팅 노출" : "배너 광고"}
						</Button.Label>
					</Button>
					<Button
						isDisabled={pending || !name.trim()}
						onPress={() =>
							onSave({
								name: name.trim(),
								description: description.trim(),
								kind,
								sortOrder: Number(sort),
							})
						}
					>
						<Button.Label>위치 저장</Button.Label>
					</Button>
				</>
			) : null}
		</View>
	);
}

function Payments() {
	const [onlyDesign, setOnlyDesign] = useState(false);
	const [selected, setSelected] = useState<string[]>([]);
	const [onlyUnpaid, setOnlyUnpaid] = useState(true);
	const client = useQueryClient();
	const { toast } = useToast();
	const jobs = useQuery(
		orpc.bambi.moderation.listJobsForPayment.queryOptions({
			input: { limit: 50, onlyDetailDesign: onlyDesign, onlyUnpaid },
		})
	);
	const boosts = useQuery(
		orpc.bambi.boostOptions.listPurchasesForPayment.queryOptions({
			input: { limit: 50, onlyUnpaid },
		})
	);
	const setJob = useMutation(
		orpc.bambi.moderation.bulkSetJobPostPayment.mutationOptions()
	);
	const confirm = useMutation(
		orpc.bambi.boostOptions.confirmPurchasePayment.mutationOptions()
	);
	const cancel = useMutation(
		orpc.bambi.boostOptions.cancelPurchase.mutationOptions()
	);
	const act = async (action: () => Promise<unknown>) => {
		try {
			await action();
			await Promise.all([
				client.invalidateQueries({ queryKey: orpc.bambi.moderation.key() }),
				client.invalidateQueries({ queryKey: orpc.bambi.boostOptions.key() }),
			]);
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "처리하지 못했어요.",
				variant: "danger",
			});
		}
	};
	return (
		<View className="gap-3">
			<View className="flex-row items-center justify-between">
				<Text className="text-foreground">미결제만 보기</Text>
				<Switch isSelected={onlyUnpaid} onSelectedChange={setOnlyUnpaid} />
			</View>
			<View className="flex-row items-center justify-between">
				<Text className="text-foreground">디자인 신청만 보기</Text>
				<Switch
					isSelected={onlyDesign}
					onSelectedChange={(value) => {
						setOnlyDesign(value);
						setSelected([]);
					}}
				/>
			</View>
			<View className="flex-row flex-wrap gap-2">
				{(["paid", "unpaid"] as const).map((paymentStatus) => (
					<Button
						isDisabled={
							!selected.length || selected.length > 50 || setJob.isPending
						}
						key={paymentStatus}
						onPress={() =>
							Alert.alert(
								"선택 공고 결제 처리",
								`${selected.length}건을 ${paymentStatus === "paid" ? "결제완료" : "미결제"}로 변경할까요?`,
								[
									{ text: "취소", style: "cancel" },
									{
										text: "변경",
										onPress: () =>
											act(async () => {
												const result = await setJob.mutateAsync({
													jobPostIds: selected,
													paymentStatus,
												});
												setSelected(
													result.failures.map((failure) => failure.targetId)
												);
												toast.show({
													label: `성공 ${result.succeeded}건 · 실패 ${result.failed}건${result.failures.length ? `: ${result.failures.map((failure) => failure.message).join(" / ")}` : ""}`,
												});
											}),
									},
								]
							)
						}
						size="sm"
						variant="secondary"
					>
						<Button.Label>
							{paymentStatus === "paid" ? "선택 입금 확인" : "선택 미결제로"}
						</Button.Label>
					</Button>
				))}
			</View>
			<Text className="font-bold text-foreground">공고 결제</Text>
			<QueryFeedback
				empty={jobs.data?.length === 0}
				query={jobs}
				title="공고 결제 목록"
			/>
			{jobs.data?.map((job) => (
				<Surface
					className="gap-2 rounded-lg p-4"
					key={job.id}
					variant="secondary"
				>
					<Text className="font-bold text-foreground">{job.title}</Text>
					<Switch
						accessibilityLabel="일괄 결제 대상으로 선택"
						isSelected={selected.includes(job.id)}
						onSelectedChange={(checked) =>
							setSelected((current) =>
								checked
									? [...current, job.id]
									: current.filter((id) => id !== job.id)
							)
						}
					/>
					<Text className="text-foreground text-sm">
						입금액{" "}
						{Math.max(
							0,
							(sumJobPaymentAmount(
								job.exposureAmount,
								job.detailDesignAmount
							) ?? 0) +
								job.boostPurchases.reduce(
									(sum, purchase) => sum + purchase.amount,
									0
								) -
								job.pointsUsed
						).toLocaleString("ko-KR")}
						원 · 포인트 사용 {job.pointsUsed.toLocaleString("ko-KR")}P
					</Text>
					{job.detailDesignStatus ? (
						<DesignMediaManager jobPostId={job.id} />
					) : null}
					<Text className="text-muted text-sm">
						{job.organizationDisplayName} ·{" "}
						{job.paymentStatus === "paid" ? "결제완료" : "미결제"}
					</Text>
					<Button
						onPress={() =>
							act(() =>
								setJob.mutateAsync({
									jobPostIds: [job.id],
									paymentStatus:
										job.paymentStatus === "paid" ? "unpaid" : "paid",
								})
							)
						}
						size="sm"
						variant="secondary"
					>
						<Button.Label>
							{job.paymentStatus === "paid" ? "미결제로 변경" : "입금 확인"}
						</Button.Label>
					</Button>
				</Surface>
			))}
			<Text className="font-bold text-foreground">끌어올리기 결제</Text>
			<QueryFeedback
				empty={boosts.data?.length === 0}
				query={boosts}
				title="끌어올리기 결제 목록"
			/>
			{boosts.data?.map((purchase) => (
				<Surface
					className="gap-2 rounded-lg p-4"
					key={purchase.id}
					variant="secondary"
				>
					<Text className="font-bold text-foreground">
						{purchase.jobPostTitle}
					</Text>
					<Text className="text-muted text-sm">
						{purchase.paymentStatus === "paid" ? "결제완료" : "미결제"} ·{" "}
						{purchase.paymentMethod === "card" ? "카드" : "무통장"}
					</Text>
					<View className="flex-row gap-2">
						<Button
							onPress={() =>
								act(() =>
									confirm.mutateAsync({
										purchaseId: purchase.id,
										paymentStatus:
											purchase.paymentStatus === "paid" ? "unpaid" : "paid",
									})
								)
							}
							size="sm"
							variant="secondary"
						>
							<Button.Label>
								{purchase.paymentStatus === "paid" ? "미결제로" : "입금 확인"}
							</Button.Label>
						</Button>
						{purchase.paymentStatus === "unpaid" ? (
							<Button
								onPress={() =>
									act(() => cancel.mutateAsync({ purchaseId: purchase.id }))
								}
								size="sm"
								variant="danger-soft"
							>
								<Button.Label>취소</Button.Label>
							</Button>
						) : null}
					</View>
				</Surface>
			))}
		</View>
	);
}

function Shop() {
	const [editing, setEditing] = useState<ShopItem | "new" | null>(null);
	const [status, setStatus] = useState<
		"pending" | "completed" | "canceled" | "owned" | "used" | undefined
	>(undefined);
	const client = useQueryClient();
	const { toast } = useToast();
	const items = useQuery(orpc.bambi.pointShop.adminListItems.queryOptions());
	const orders = useQuery(
		orpc.bambi.pointShop.adminListOrders.queryOptions({ input: { status } })
	);
	const update = useMutation(orpc.bambi.pointShop.updateItem.mutationOptions());
	const remove = useMutation(orpc.bambi.pointShop.removeItem.mutationOptions());
	const complete = useMutation(
		orpc.bambi.pointShop.completeOrder.mutationOptions()
	);
	const cancel = useMutation(
		orpc.bambi.pointShop.cancelOrder.mutationOptions()
	);
	const refresh = () =>
		client.invalidateQueries({ queryKey: orpc.bambi.pointShop.key() });
	const act = async (action: () => Promise<unknown>) => {
		try {
			await action();
			await refresh();
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "처리하지 못했어요.",
				variant: "danger",
			});
		}
	};
	return (
		<View className="gap-3">
			<Text className="font-bold text-foreground">상품</Text>
			<QueryFeedback
				empty={items.data?.length === 0}
				query={items}
				title="포인트몰 상품 목록"
			/>
			{editing ? (
				<PointShopItemForm
					item={editing === "new" ? undefined : editing}
					key={editing === "new" ? "new" : editing.id}
					onClose={() => setEditing(null)}
				/>
			) : (
				<Button onPress={() => setEditing("new")}>
					<Button.Label>상품 추가</Button.Label>
				</Button>
			)}
			{items.data?.map((item) => (
				<Surface
					className="gap-2 rounded-lg p-4"
					key={item.id}
					variant="secondary"
				>
					<View className="flex-row items-center justify-between">
						<View>
							<Text className="font-bold text-foreground">{item.name}</Text>
							<Text className="text-muted text-sm">
								{item.pricePoints.toLocaleString("ko-KR")}P ·{" "}
								{pointShopBenefitTypeLabel(item.benefitType)}
							</Text>
						</View>
						<Switch
							isSelected={item.isActive}
							onSelectedChange={(isActive) =>
								act(() =>
									update.mutateAsync({
										...item,
										imageUrl: item.imageUrl ?? null,
										isActive,
									})
								)
							}
						/>
					</View>
					<Button
						onPress={() => setEditing(item)}
						size="sm"
						variant="secondary"
					>
						<Button.Label>상품 수정</Button.Label>
					</Button>
					<Button
						isDisabled={remove.isPending}
						onPress={() =>
							Alert.alert(
								"상품 삭제",
								"상품을 삭제해도 기존 주문 내역은 보존됩니다. 삭제할까요?",
								[
									{ text: "취소", style: "cancel" },
									{
										text: "삭제",
										style: "destructive",
										onPress: () =>
											act(() => remove.mutateAsync({ id: item.id })),
									},
								]
							)
						}
						size="sm"
						variant="danger-soft"
					>
						<Button.Label>상품 삭제</Button.Label>
					</Button>
				</Surface>
			))}
			<Text className="font-bold text-foreground">주문</Text>
			<QueryFeedback
				empty={orders.data?.length === 0}
				query={orders}
				title="포인트몰 주문 목록"
			/>
			<View className="flex-row flex-wrap gap-2">
				{(
					[
						undefined,
						"pending",
						"owned",
						"completed",
						"used",
						"canceled",
					] as const
				).map((value) => (
					<Button
						key={value ?? "all"}
						onPress={() => setStatus(value)}
						size="sm"
						variant={status === value ? "primary" : "secondary"}
					>
						<Button.Label>
							{value ? pointShopOrderStatusLabel(value) : "전체"}
						</Button.Label>
					</Button>
				))}
			</View>
			{orders.data?.map((order) => (
				<Surface
					className="gap-2 rounded-lg p-4"
					key={order.id}
					variant="secondary"
				>
					<Text className="font-bold text-foreground">{order.itemName}</Text>
					<Text className="text-muted text-sm">
						{order.buyerName ?? "탈퇴 회원"} ·{" "}
						{order.pricePoints.toLocaleString("ko-KR")}P ·{" "}
						{pointShopOrderStatusLabel(order.status)}
					</Text>
					{order.buyerPhone ? (
						<Text className="text-muted text-sm" selectable>
							{order.buyerPhone}
						</Text>
					) : null}
					{order.status === "pending" ? (
						<View className="flex-row gap-2">
							<Button
								onPress={() =>
									act(() => complete.mutateAsync({ orderId: order.id }))
								}
								size="sm"
							>
								<Button.Label>지급 완료</Button.Label>
							</Button>
							<Button
								onPress={() =>
									act(() => cancel.mutateAsync({ orderId: order.id }))
								}
								size="sm"
								variant="danger-soft"
							>
								<Button.Label>취소·환불</Button.Label>
							</Button>
						</View>
					) : null}
				</Surface>
			))}
		</View>
	);
}

export default function ModeratorCommerceScreen() {
	const params = useLocalSearchParams<{ tab?: string }>();
	const [tab, setTab] = useState<Tab>(
		params.tab === "payments" || params.tab === "shop" ? params.tab : "products"
	);
	let content = <Products />;
	if (tab === "payments") {
		content = <Payments />;
	}
	if (tab === "shop") {
		content = <Shop />;
	}
	return (
		<BambiScreen>
			<BambiHeader
				description="광고 상품, 공고·끌어올리기 결제와 포인트몰 주문을 관리합니다."
				title="광고·결제"
			/>
			<FilterChips onChange={setTab} options={TABS} value={tab} />
			{content}
		</BambiScreen>
	);
}
