import { sendGaEvent } from "./ga";
import type { MarketplaceFilters } from "./marketplace";

const FILTER_NAMES: Record<keyof MarketplaceFilters, string> = {
	category: "category",
	districtCode: "district",
	minimumPay: "minimum_pay",
	onlyBeginnerFriendly: "beginner_friendly",
	onlyToday: "same_day_interview",
	onlyVerified: "verified",
	regionCode: "region",
};

export const trackMarketplaceFilterChanges = (
	previous: MarketplaceFilters,
	next: MarketplaceFilters
): void => {
	for (const key of Object.keys(FILTER_NAMES) as (keyof MarketplaceFilters)[]) {
		if (previous[key] === next[key]) {
			continue;
		}

		const value = next[key];
		let filterValue: MarketplaceFilters[typeof key] | "set" | "unset" = value;
		if (key === "minimumPay") {
			filterValue = Number(value) > 0 ? "set" : "unset";
		}
		sendGaEvent("filter_change", {
			enabled: typeof value === "boolean" ? value : Boolean(value),
			filter_name: FILTER_NAMES[key],
			// 자유 입력 숫자를 그대로 보내지 않고 최소 급여 사용 여부만 남긴다.
			filter_value: filterValue,
			surface: "seeker_marketplace",
		});
	}
};

export const trackDiscoveryTab = (tab: string): void =>
	sendGaEvent("filter_change", {
		enabled: true,
		filter_name: "discovery_tab",
		filter_value: tab,
		surface: "seeker_marketplace",
	});

export const trackLoadMore = (visibleCount: number): void =>
	sendGaEvent("load_more", {
		content_type: "job",
		surface: "seeker_marketplace",
		visible_count: visibleCount,
	});

export const trackNavigationClick = ({
	contentId,
	linkType,
}: {
	contentId: string;
	linkType: "board_more" | "post" | "section_more";
}): void =>
	sendGaEvent("navigation_click", {
		content_id: contentId,
		link_type: linkType,
		surface: "seeker_home_community",
	});

export const trackContactIntent = ({
	itemVariant,
	jobId,
	method,
}: {
	itemVariant: "crawled" | "native";
	jobId: string;
	method: "chat" | "phone";
}): void => {
	if (itemVariant === "crawled") {
		return;
	}

	sendGaEvent("contact_intent", {
		item_variant: itemVariant,
		job_id: jobId,
		method,
		surface: "job_detail",
	});
};

export const trackLogin = (method: "email" | "username"): void =>
	sendGaEvent("login", { method });

export const trackSignUp = (): void =>
	sendGaEvent("sign_up", { method: "email" });
