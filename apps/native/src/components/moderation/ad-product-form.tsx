import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { selectEditableAdCampaign } from "@bambi-app/api/services/bambi-ad-catalog";
import {
	AD_PREVIEW_TEMPLATE_LABELS,
	type AdPreviewTemplateValue,
	getPreviewTemplateOptionsForPlacementKind,
	isBannerPreviewTemplate,
} from "@bambi-app/api/services/bambi-ad-preview-templates";
import { generateChatMessageId } from "@bambi-app/api/services/bambi-chat-message-id";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Button,
	Input,
	Switch,
	TextArea,
	TextField,
	useToast,
} from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { AdminImagePicker } from "@/src/components/moderation/admin-image-picker";
import { PopupDateTimePicker } from "@/src/components/moderation/popup-date-time-picker";
import { orpc } from "@/src/lib/orpc";

export type AdminPlacement = Awaited<
	ReturnType<AppRouterClient["bambi"]["adProducts"]["listCatalogAdmin"]>
>[number];
type Product = AdminPlacement["products"][number];
interface PriceDraft {
	amount: string;
	campaign: boolean;
	campaignDiscount: string;
	days: string;
	discount: string;
	end: string;
	id: string;
	start: string;
}
const blankPrice = (): PriceDraft => ({
	id: generateChatMessageId(),
	days: "30",
	amount: "0",
	discount: "0",
	campaign: false,
	start: "",
	end: "",
	campaignDiscount: "",
});

export function AdminAdProductForm({
	placement,
	product,
	onClose,
}: {
	placement: AdminPlacement;
	product?: Product;
	onClose: () => void;
}) {
	const [name, setName] = useState(product?.name ?? "");
	const [tagline, setTagline] = useState(product?.tagline ?? "");
	const [benefits, setBenefits] = useState(product?.benefits.join("\n") ?? "");
	const [previewTemplate, setTemplate] = useState<AdPreviewTemplateValue>(
		product?.previewTemplate ?? "none"
	);
	const [image, setImage] = useState(product?.previewImageUrl ?? "");
	const [uploading, setUploading] = useState(false);
	const [active, setActive] = useState(product?.isActive ?? true);
	const [fields, setFields] = useState({
		manual: String(product?.manualBoostsPerDay ?? 0),
		auto: String(product?.autoBoostsPerDay ?? 0),
		cooldown: String(product?.manualBoostCooldownMinutes ?? 10),
		design:
			product?.detailDesignPrice == null
				? ""
				: String(product.detailDesignPrice),
		sort: String(product?.sortOrder ?? 0),
	});
	const [prices, setPrices] = useState<PriceDraft[]>(() =>
		product
			? product.priceOptions.map((price) => {
					const campaign = selectEditableAdCampaign(
						product.discountCampaigns,
						price.days
					);
					return {
						id: generateChatMessageId(),
						days: String(price.days),
						amount: String(price.amount),
						discount: String(price.discountPercent ?? 0),
						campaign:
							campaign?.status === "active" || campaign?.status === "planned",
						start: campaign ? new Date(campaign.startsAt).toISOString() : "",
						end: campaign?.endsAt
							? new Date(campaign.endsAt).toISOString()
							: "",
						campaignDiscount: campaign ? String(campaign.discountPercent) : "",
					};
				})
			: [blankPrice()]
	);
	const exposure = useQuery(
		orpc.bambi.siteSettings.getExposureSectionConfig.queryOptions()
	);
	const create = useMutation(
		orpc.bambi.adProducts.createProduct.mutationOptions()
	);
	const update = useMutation(
		orpc.bambi.adProducts.updateProduct.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	const pending = create.isPending || update.isPending || uploading;
	const banner = isBannerPreviewTemplate(previewTemplate);
	const options = getPreviewTemplateOptionsForPlacementKind(placement.kind, {
		includeUrgent:
			!exposure.data?.urgentHidden || previewTemplate === "urgent-list",
	});
	const patchPrice = (id: string, patch: Partial<PriceDraft>) =>
		setPrices((current) =>
			current.map((item) => (item.id === id ? { ...item, ...patch } : item))
		);
	const submit = async () => {
		if (
			new Set(prices.map((item) => Number(item.days))).size !== prices.length
		) {
			toast.show({ label: "같은 이용 기간이 중복됩니다.", variant: "danger" });
			return;
		}
		try {
			const payload = {
				name: name.trim(),
				tagline: tagline.trim(),
				benefits: benefits
					.split("\n")
					.map((value) => value.trim())
					.filter(Boolean),
				previewTemplate,
				previewImageUrl: image.trim() || null,
				manualBoostsPerDay: banner ? 0 : Number(fields.manual),
				autoBoostsPerDay: banner ? 0 : Number(fields.auto),
				manualBoostCooldownMinutes: Math.max(1, Number(fields.cooldown)),
				detailDesignPrice: fields.design.trim() ? Number(fields.design) : null,
				sortOrder: Number(fields.sort),
				priceOptions: prices.map((price) => ({
					days: Number(price.days),
					amount: Number(price.amount),
					discountPercent: Number(price.discount),
				})),
				discountCampaigns: prices
					.filter((price) => price.campaign)
					.map((price) => ({
						priceOptionDays: Number(price.days),
						discountPercent: Number(price.campaignDiscount),
						startsAt: new Date(price.start),
						endsAt: price.end.trim() ? new Date(price.end) : null,
					})),
			};
			if (product) {
				await update.mutateAsync({
					...payload,
					id: product.id,
					isActive: active,
				});
			} else {
				await create.mutateAsync({ ...payload, placementId: placement.id });
			}
			await client.invalidateQueries({ queryKey: orpc.bambi.adProducts.key() });
			onClose();
		} catch (error) {
			toast.show({
				label:
					error instanceof Error ? error.message : "상품을 저장하지 못했어요.",
				variant: "danger",
			});
		}
	};
	return (
		<View className="gap-3">
			<Text className="font-bold text-foreground">
				{product ? "광고 상품 수정" : "광고 상품 추가"}
			</Text>
			<TextField>
				<Input
					accessibilityLabel="상품명"
					maxLength={120}
					onChangeText={setName}
					placeholder="상품명"
					value={name}
				/>
			</TextField>
			<TextField>
				<Input
					accessibilityLabel="한 줄 소개"
					maxLength={200}
					onChangeText={setTagline}
					placeholder="한 줄 소개"
					value={tagline}
				/>
			</TextField>
			<TextField>
				<TextArea
					accessibilityLabel="서비스 내용"
					onChangeText={setBenefits}
					placeholder="서비스 내용을 한 줄씩 입력하세요"
					value={benefits}
				/>
			</TextField>
			<View className="flex-row flex-wrap gap-2">
				{options.map((option) => (
					<Button
						key={option.value}
						onPress={() => setTemplate(option.value)}
						size="sm"
						variant={previewTemplate === option.value ? "primary" : "secondary"}
					>
						<Button.Label>{option.label}</Button.Label>
					</Button>
				))}
			</View>
			<Text className="text-muted text-xs">
				현재: {AD_PREVIEW_TEMPLATE_LABELS[previewTemplate]}
			</Text>
			{prices.map((price) => (
				<View
					className="gap-2 rounded-lg border border-border p-3"
					key={price.id}
				>
					<TextField>
						<Input
							accessibilityLabel="이용 기간(일)"
							keyboardType="number-pad"
							onChangeText={(days) => {
								if (!price.campaign) {
									patchPrice(price.id, { days });
									return;
								}
								Alert.alert(
									"이용 기간 변경",
									"연결된 기간 할인 설정과 이력이 삭제됩니다. 변경할까요?",
									[
										{ text: "취소", style: "cancel" },
										{
											text: "변경",
											onPress: () =>
												patchPrice(price.id, {
													days,
													campaign: false,
													start: "",
													end: "",
													campaignDiscount: "",
												}),
										},
									]
								);
							}}
							placeholder="이용 기간(일)"
							value={price.days}
						/>
					</TextField>
					<TextField>
						<Input
							accessibilityLabel="금액(원)"
							keyboardType="number-pad"
							onChangeText={(amount) => patchPrice(price.id, { amount })}
							placeholder="금액(원)"
							value={price.amount}
						/>
					</TextField>
					<TextField isDisabled={price.campaign}>
						<Input
							accessibilityLabel="할인율"
							keyboardType="number-pad"
							onChangeText={(discount) => patchPrice(price.id, { discount })}
							placeholder="할인율(%)"
							value={price.discount}
						/>
					</TextField>
					<View className="flex-row items-center justify-between">
						<Text className="text-foreground">기간 할인</Text>
						<Switch
							isSelected={price.campaign}
							onSelectedChange={(campaign) =>
								patchPrice(price.id, { campaign })
							}
						/>
					</View>
					{price.campaign ? (
						<>
							<PopupDateTimePicker
								allowUnset={false}
								kind="start"
								onChange={(start) => patchPrice(price.id, { start })}
								value={price.start}
							/>
							<PopupDateTimePicker
								kind="end"
								onChange={(end) => patchPrice(price.id, { end })}
								value={price.end}
							/>
							<TextField>
								<Input
									accessibilityLabel="기간 할인율"
									keyboardType="number-pad"
									onChangeText={(campaignDiscount) =>
										patchPrice(price.id, { campaignDiscount })
									}
									placeholder="기간 할인율"
									value={price.campaignDiscount}
								/>
							</TextField>
						</>
					) : null}
					<Button
						onPress={() =>
							setPrices((current) =>
								current.filter((value) => value.id !== price.id)
							)
						}
						size="sm"
						variant="danger-soft"
					>
						<Button.Label>가격 옵션 삭제</Button.Label>
					</Button>
				</View>
			))}
			<Button
				onPress={() => setPrices((current) => [...current, blankPrice()])}
				size="sm"
				variant="secondary"
			>
				<Button.Label>가격 옵션 추가</Button.Label>
			</Button>
			{(
				[
					{ key: "manual", label: "일일 수동 끌어올리기 횟수" },
					{ key: "auto", label: "일일 자동 끌어올리기 횟수" },
					{ key: "cooldown", label: "수동 끌어올리기 최소 간격(분)" },
					{ key: "design", label: "상세 디자인 가격(비우면 미제공)" },
					{ key: "sort", label: "정렬값" },
				] as const
			)
				.filter(
					(field) => !banner || field.key === "design" || field.key === "sort"
				)
				.map(({ key, label }) => (
					<TextField key={key}>
						<Text className="text-foreground text-sm">{label}</Text>
						<Input
							accessibilityLabel={label}
							keyboardType="number-pad"
							onChangeText={(value) =>
								setFields((current) => ({ ...current, [key]: value }))
							}
							value={fields[key]}
						/>
					</TextField>
				))}
			<AdminImagePicker
				maxBytes={1_500_000}
				onBusyChange={setUploading}
				onChange={(value) => setImage(value ?? "")}
				value={image}
			/>
			{product ? (
				<View className="flex-row items-center justify-between">
					<Text className="text-foreground">판매 활성화</Text>
					<Switch isSelected={active} onSelectedChange={setActive} />
				</View>
			) : null}
			<Button
				isDisabled={pending || !name.trim() || !prices.length}
				onPress={submit}
			>
				<Button.Label>저장</Button.Label>
			</Button>
			<Button isDisabled={pending} onPress={onClose} variant="secondary">
				<Button.Label>취소</Button.Label>
			</Button>
		</View>
	);
}
