import type { NativeIndustryOption } from "@/src/lib/bambi-native";

export interface NativeMarketplaceFilters {
	districtCode: string;
	industry: NativeIndustryOption | null;
	minimumPay: string;
	onlyBeginnerFriendly: boolean;
	onlyToday: boolean;
	onlyVerified: boolean;
	regionCode: string;
}

export const DEFAULT_NATIVE_MARKETPLACE_FILTERS: NativeMarketplaceFilters = {
	districtCode: "",
	industry: null,
	minimumPay: "",
	onlyBeginnerFriendly: false,
	onlyToday: false,
	onlyVerified: false,
	regionCode: "",
};

export const activeMarketplaceFilterCount = (
	value: NativeMarketplaceFilters
): number =>
	Object.entries(value).filter(([key, field]) => {
		if (key === "industry") {
			return field !== null;
		}
		return typeof field === "boolean" ? field : field !== "";
	}).length;

export const marketplaceFilterInput = (value: NativeMarketplaceFilters) => {
	const minimumPay = Number(value.minimumPay.replaceAll(",", ""));
	return {
		districtCode: value.districtCode || undefined,
		industryCategory: value.industry ?? undefined,
		minPayAmount:
			Number.isInteger(minimumPay) && minimumPay > 0 ? minimumPay : undefined,
		onlyBeginnerFriendly: value.onlyBeginnerFriendly,
		onlyToday: value.onlyToday,
		onlyVerified: value.onlyVerified,
		regionCode: value.regionCode || undefined,
	};
};
