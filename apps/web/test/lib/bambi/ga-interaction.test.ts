import { afterEach, describe, expect, it, vi } from "vitest";

import {
	trackContactIntent,
	trackMarketplaceFilterChanges,
	trackNavigationClick,
} from "@/lib/bambi/ga-interaction";
import { DEFAULT_MARKETPLACE_FILTERS } from "@/lib/bambi/marketplace";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("GA 상호작용 이벤트", () => {
	it("최소 급여는 원값 대신 설정 여부만 보낸다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });

		trackMarketplaceFilterChanges(DEFAULT_MARKETPLACE_FILTERS, {
			...DEFAULT_MARKETPLACE_FILTERS,
			minimumPay: 123_456,
		});

		expect(gtag).toHaveBeenCalledWith("event", "filter_change", {
			enabled: true,
			filter_name: "minimum_pay",
			filter_value: "set",
			surface: "seeker_marketplace",
		});
	});

	it("문의 이벤트에 전화번호나 채팅방 ID를 받지 않는다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });

		trackContactIntent({
			itemVariant: "native",
			jobId: "job-1",
			method: "phone",
		});

		expect(gtag).toHaveBeenCalledWith("event", "contact_intent", {
			item_variant: "native",
			job_id: "job-1",
			method: "phone",
			surface: "job_detail",
		});
	});

	it("외부 수집 공고의 전화 문의 이벤트는 전송하지 않는다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });

		trackContactIntent({
			itemVariant: "crawled",
			jobId: "crawled-job-1",
			method: "phone",
		});

		expect(gtag).not.toHaveBeenCalled();
	});

	it("수다방 이동은 공개 콘텐츠 식별자만 보낸다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });

		trackNavigationClick({ contentId: "free", linkType: "board_more" });

		expect(gtag).toHaveBeenCalledWith("event", "navigation_click", {
			content_id: "free",
			link_type: "board_more",
			surface: "seeker_home_community",
		});
	});
});
