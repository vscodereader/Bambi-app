import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	pointShopAudienceLabel,
	pointShopBenefitTypeLabel,
} from "@bambi-app/api/services/bambi-point-shop-labels";
import {
	isUsableBenefit,
	validateItemBenefitSpec,
} from "@bambi-app/api/services/bambi-point-shop-rules";
import { env } from "@bambi-app/env/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Button,
	Input,
	Switch,
	TextArea,
	TextField,
	useToast,
} from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";
import {
	AdminImagePicker,
	uploadAdminImage,
} from "@/src/components/moderation/admin-image-picker";
import { publicObjectUri } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

export type ShopItem = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointShop"]["adminListItems"]>
>[number];
const BENEFITS = [
	"none",
	"coupon",
	"boost_manual_period",
	"boost_manual_count",
	"boost_auto_period",
	"ad_extend",
] as const;
const AUDIENCES = ["all", "employer", "job_seeker"] as const;
const nullable = (value: string) => (value.trim() ? Number(value) : null);
const text = (value: number | null | undefined) =>
	value == null ? "" : String(value);

export function PointShopItemForm({
	item,
	onClose,
}: {
	item?: ShopItem;
	onClose: () => void;
}) {
	const [name, setName] = useState(item?.name ?? "");
	const [description, setDescription] = useState(item?.description ?? "");
	const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
	const [uploading, setUploading] = useState(false);
	const upload = useMutation(
		orpc.bambi.community.createMediaUpload.mutationOptions()
	);
	const [benefitType, setBenefitType] = useState<ShopItem["benefitType"]>(
		item?.benefitType ?? "none"
	);
	const [audience, setAudience] = useState<ShopItem["audience"]>(
		item?.audience ?? "all"
	);
	const [isActive, setActive] = useState(item?.isActive ?? true);
	const [fields, setFields] = useState({
		pricePoints: text(item?.pricePoints),
		sortOrder: text(item?.sortOrder ?? 0),
		boostCount: text(item?.boostCount),
		boostsPerDay: text(item?.boostsPerDay),
		durationDays: text(item?.durationDays),
		extendDays: text(item?.extendDays),
		stockQuantity: text(item?.stockQuantity),
		usageLimitDays: text(item?.usageLimitDays),
	});
	const create = useMutation(orpc.bambi.pointShop.createItem.mutationOptions());
	const update = useMutation(orpc.bambi.pointShop.updateItem.mutationOptions());
	const client = useQueryClient();
	const { toast } = useToast();
	const pending = create.isPending || update.isPending || uploading;
	const period =
		benefitType === "boost_manual_period" ||
		benefitType === "boost_auto_period";
	const usable = isUsableBenefit(benefitType);
	const numberFields: { key: keyof typeof fields; label: string }[] = [
		{ key: "pricePoints", label: "가격(포인트)" },
		{ key: "sortOrder", label: "정렬값" },
		{ key: "stockQuantity", label: "재고(비우면 무제한)" },
	];
	if (period) {
		numberFields.push(
			{ key: "boostsPerDay", label: "하루 끌어올리기 횟수" },
			{ key: "durationDays", label: "기간(일)" }
		);
	}
	if (benefitType === "boost_manual_count") {
		numberFields.push({ key: "boostCount", label: "끌어올리기 횟수" });
	}
	if (benefitType === "ad_extend") {
		numberFields.push({ key: "extendDays", label: "광고 연장 일수" });
	}
	if (usable) {
		numberFields.push({
			key: "usageLimitDays",
			label: "사용 기한(비우면 무기한)",
		});
	}
	const submit = async () => {
		const benefit = {
			audience,
			benefitType,
			boostCount:
				benefitType === "boost_manual_count"
					? nullable(fields.boostCount)
					: null,
			boostsPerDay: period ? nullable(fields.boostsPerDay) : null,
			durationDays: period ? nullable(fields.durationDays) : null,
			extendDays:
				benefitType === "ad_extend" ? nullable(fields.extendDays) : null,
		};
		if (!validateItemBenefitSpec(benefit).ok) {
			toast.show({
				label: "혜택 유형에 맞는 대상과 수량을 확인해 주세요.",
				variant: "danger",
			});
			return;
		}
		try {
			const payload = {
				...benefit,
				name: name.trim(),
				description: description.trim() || null,
				imageUrl: imageUrl.trim() || null,
				isActive,
				pricePoints: Number(fields.pricePoints),
				sortOrder: Number(fields.sortOrder),
				stockQuantity: nullable(fields.stockQuantity),
				usageLimitDays: usable ? nullable(fields.usageLimitDays) : null,
			};
			if (item) {
				await update.mutateAsync({ ...payload, id: item.id });
			} else {
				await create.mutateAsync(payload);
			}
			await client.invalidateQueries({ queryKey: orpc.bambi.pointShop.key() });
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
				{item ? "상품 수정" : "상품 추가"}
			</Text>
			<TextField>
				<Input
					accessibilityLabel="상품명"
					maxLength={60}
					onChangeText={setName}
					placeholder="상품명"
					value={name}
				/>
			</TextField>
			<TextField>
				<TextArea
					accessibilityLabel="상품 설명"
					maxLength={500}
					onChangeText={setDescription}
					placeholder="설명"
					value={description}
				/>
			</TextField>
			<View className="flex-row flex-wrap gap-2">
				{BENEFITS.map((value) => (
					<Button
						isDisabled={pending || item?.hasOrders}
						key={value}
						onPress={() => setBenefitType(value)}
						size="sm"
						variant={benefitType === value ? "primary" : "secondary"}
					>
						<Button.Label>{pointShopBenefitTypeLabel(value)}</Button.Label>
					</Button>
				))}
			</View>
			{item?.hasOrders ? (
				<Text className="text-muted text-xs">
					판매 이력이 있어 혜택 유형은 변경할 수 없어요.
				</Text>
			) : null}
			<View className="flex-row flex-wrap gap-2">
				{AUDIENCES.map((value) => (
					<Button
						isDisabled={pending || (usable && value === "job_seeker")}
						key={value}
						onPress={() => setAudience(value)}
						size="sm"
						variant={audience === value ? "primary" : "secondary"}
					>
						<Button.Label>{pointShopAudienceLabel(value)}</Button.Label>
					</Button>
				))}
			</View>
			{numberFields.map(({ key, label }) => (
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
				maxBytes={10 * 1024 * 1024}
				onBusyChange={setUploading}
				onChange={(value) => setImageUrl(value ?? "")}
				upload={async (pick) => {
					const intent = await upload.mutateAsync({
						byteSize: pick.bytes.length,
						fileName: pick.fileName,
						mimeType: pick.mimeType,
					});
					await uploadAdminImage(pick, intent);
					const url = publicObjectUri(
						intent.storageKey,
						env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL
					);
					if (!url) {
						throw new Error("공개 이미지 주소를 확인할 수 없어요.");
					}
					return url;
				}}
				value={imageUrl}
			/>
			<View className="flex-row items-center justify-between">
				<Text className="text-foreground">포인트몰에 노출</Text>
				<Switch isSelected={isActive} onSelectedChange={setActive} />
			</View>
			<Button
				isDisabled={pending || !name.trim() || Number(fields.pricePoints) < 1}
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
