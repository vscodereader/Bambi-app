import { afterEach, describe, expect, it, vi } from "vitest";

import {
	buildJobItem,
	JOB_LISTS,
	shouldTrackJobAnalytics,
	trackJobListView,
	trackJobSelect,
	trackJobView,
} from "@/lib/bambi/ga-job";
import type { Job } from "@/lib/bambi/types";

const job = {
	company: "밤비 라운지",
	crawled: false,
	exposureType: "special",
	id: "job-1",
	title: "서초 라운지 스태프",
} as Job;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("공고 GA item", () => {
	it("목록·출처 정보를 PII 없이 조립한다", () => {
		expect(
			buildJobItem(job, {
				index: 2,
				listId: JOB_LISTS.special.id,
				listName: JOB_LISTS.special.name,
				tone: "special",
			})
		).toEqual({
			index: 2,
			item_brand: "밤비 라운지",
			item_category: "special",
			item_id: "job-1",
			item_list_id: "seeker_special",
			item_list_name: "스페셜 채용",
			item_name: "서초 라운지 스태프",
			item_variant: "native",
		});
	});

	it("급구는 신규 공고 이벤트에서 제외한다", () => {
		expect(shouldTrackJobAnalytics(job, "urgent")).toBe(false);
		expect(
			shouldTrackJobAnalytics({ ...job, exposureType: "urgent" } as Job)
		).toBe(false);
	});

	it("외부 수집 공고는 모든 공고 이벤트에서 제외한다", () => {
		expect(shouldTrackJobAnalytics({ ...job, crawled: true } as Job)).toBe(
			false
		);
	});
});

describe("공고 GA 전송", () => {
	it("목록 노출·선택·상세 권장 이벤트를 전송한다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });
		const list = {
			listId: JOB_LISTS.special.id,
			listName: JOB_LISTS.special.name,
			tone: "special" as const,
		};

		trackJobListView([job], list);
		trackJobSelect(job, { ...list, index: 0 });
		trackJobView(job);

		expect(gtag.mock.calls.map((call) => call[1])).toEqual([
			"view_item_list",
			"select_item",
			"view_item",
		]);
	});

	it("급구 목록과 공고는 전송하지 않는다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });
		const urgentJob = { ...job, exposureType: "urgent" } as Job;

		trackJobListView([urgentJob], {
			listId: "urgent",
			listName: "급구 채용",
			tone: "special",
		});
		trackJobSelect(urgentJob, {
			index: 0,
			listId: "urgent",
			listName: "급구 채용",
			tone: "special",
		});
		trackJobView(urgentJob);

		expect(gtag).not.toHaveBeenCalled();
	});

	it("외부 수집 공고의 목록·선택·상세 이벤트를 전송하지 않는다", () => {
		const gtag = vi.fn();
		vi.stubGlobal("window", { gtag });
		const crawledJob = { ...job, crawled: true } as Job;
		const list = {
			listId: JOB_LISTS.organic.id,
			listName: JOB_LISTS.organic.name,
			tone: "organic" as const,
		};

		trackJobListView([crawledJob], list);
		trackJobSelect(crawledJob, { ...list, index: 0 });
		trackJobView(crawledJob);

		expect(gtag).not.toHaveBeenCalled();
	});
});
