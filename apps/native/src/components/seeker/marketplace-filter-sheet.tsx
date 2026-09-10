import { useQuery } from "@tanstack/react-query";
import {
	BottomSheet,
	Button,
	Chip,
	Input,
	Label,
	TextField,
} from "heroui-native";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { FieldSelect } from "@/src/components/field-select";
import { industryOptions } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";
import {
	activeMarketplaceFilterCount,
	DEFAULT_NATIVE_MARKETPLACE_FILTERS,
	type NativeMarketplaceFilters,
} from "@/src/lib/seeker/marketplace-filters";

export function MarketplaceFilterSheet({
	onApply,
	value,
}: {
	onApply: (value: NativeMarketplaceFilters) => void;
	value: NativeMarketplaceFilters;
}) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(value);
	const regions = useQuery(orpc.bambi.regions.list.queryOptions());
	const regionOptions = useMemo(
		() =>
			(regions.data ?? []).map((item) => ({
				label: item.label,
				value: item.code,
			})),
		[regions.data]
	);
	const districtOptions = useMemo(
		() =>
			(regions.data ?? [])
				.find((item) => item.code === draft.regionCode)
				?.districts.map((item) => ({ label: item.name, value: item.code })) ??
			[],
		[draft.regionCode, regions.data]
	);
	const update = (patch: Partial<NativeMarketplaceFilters>) =>
		setDraft((current) => ({ ...current, ...patch }));
	return (
		<BottomSheet isOpen={open} onOpenChange={setOpen}>
			<BottomSheet.Trigger asChild>
				<Button
					onPress={() => {
						setDraft(value);
						setOpen(true);
					}}
					size="sm"
					variant="secondary"
				>
					<Button.Label>
						필터 {activeMarketplaceFilterCount(value) || ""}
					</Button.Label>
				</Button>
			</BottomSheet.Trigger>
			<BottomSheet.Portal>
				<BottomSheet.Overlay />
				<BottomSheet.Content>
					<BottomSheet.Title>공고 필터</BottomSheet.Title>
					<View className="mt-4 gap-4">
						<FieldSelect
							label="지역"
							onChange={(regionCode) =>
								update({ districtCode: "", regionCode })
							}
							options={regionOptions}
							placeholder="전체 지역"
							value={draft.regionCode}
						/>
						<FieldSelect
							label="세부지역"
							onChange={(districtCode) => update({ districtCode })}
							options={districtOptions}
							placeholder="지역 전체"
							value={draft.districtCode}
						/>
						<FieldSelect
							label="업종"
							onChange={(industry) =>
								update({
									industry: industry as NativeMarketplaceFilters["industry"],
								})
							}
							options={industryOptions.map((item) => ({
								label: item,
								value: item,
							}))}
							placeholder="전체 업종"
							value={draft.industry ?? ""}
						/>
						<TextField>
							<Label>최소 시급</Label>
							<Input
								keyboardType="number-pad"
								onChangeText={(minimumPay) => update({ minimumPay })}
								placeholder="예: 15000"
								value={draft.minimumPay}
							/>
						</TextField>
						<View className="flex-row flex-wrap gap-2">
							{[
								["onlyVerified", "검증 완료만"],
								["onlyToday", "당일면접 가능만"],
								["onlyBeginnerFriendly", "초보 가능만"],
							].map(([key, label]) => {
								const filterKey = key as
									| "onlyBeginnerFriendly"
									| "onlyToday"
									| "onlyVerified";
								const selected = draft[filterKey];
								return (
									<Chip
										color={selected ? "accent" : "default"}
										key={key}
										onPress={() => update({ [filterKey]: !selected })}
										variant={selected ? "primary" : "soft"}
									>
										<Chip.Label>{label}</Chip.Label>
									</Chip>
								);
							})}
						</View>
						<View className="flex-row gap-2">
							<View className="flex-1">
								<Button
									onPress={() => setDraft(DEFAULT_NATIVE_MARKETPLACE_FILTERS)}
									variant="secondary"
								>
									<Button.Label>필터 초기화</Button.Label>
								</Button>
							</View>
							<View className="flex-1">
								<Button
									onPress={() => {
										onApply(draft);
										setOpen(false);
									}}
								>
									<Button.Label>적용</Button.Label>
								</Button>
							</View>
						</View>
					</View>
				</BottomSheet.Content>
			</BottomSheet.Portal>
		</BottomSheet>
	);
}
