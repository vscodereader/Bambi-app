import { sendGaEvent } from "./ga";

export interface JobAnalyticsItem {
	company: string;
	crawled?: boolean;
	exposureType?: string | null;
	id: string;
	title: string;
}

export type JobAnalyticsTone = "organic" | "recommended" | "search" | "special";

export interface JobListAnalyticsContext {
	index: number;
	listId: string;
	listName: string;
	tone: JobAnalyticsTone;
}

export const JOB_LISTS = {
	organic: { id: "seeker_all_jobs", name: "전체 공고" },
	recommended: { id: "seeker_recommended", name: "추천 채용" },
	search: { id: "job_search_results", name: "공고 검색 결과" },
	special: { id: "seeker_special", name: "스페셜 채용" },
} as const;

export const shouldTrackJobAnalytics = (
	job: JobAnalyticsItem,
	tone?: JobAnalyticsTone | "urgent"
): boolean =>
	!job.crawled && tone !== "urgent" && job.exposureType !== "urgent";

export const buildJobItem = (
	job: JobAnalyticsItem,
	context?: JobListAnalyticsContext
): Record<string, unknown> => ({
	...(context
		? {
				index: context.index,
				item_category: context.tone,
				item_list_id: context.listId,
				item_list_name: context.listName,
			}
		: {}),
	item_brand: job.company,
	item_id: job.id,
	item_name: job.title,
	item_variant: job.crawled ? "crawled" : "native",
});

export const trackJobListView = (
	jobs: JobAnalyticsItem[],
	context: Omit<JobListAnalyticsContext, "index"> & { startIndex?: number }
): void => {
	const startIndex = context.startIndex ?? 0;
	const items = jobs
		.map((job, index) => ({ job, index: startIndex + index }))
		.filter(({ job }) => shouldTrackJobAnalytics(job, context.tone))
		.map(({ job, index }) =>
			buildJobItem(job, {
				index,
				listId: context.listId,
				listName: context.listName,
				tone: context.tone,
			})
		);

	if (items.length === 0) {
		return;
	}

	sendGaEvent("view_item_list", {
		item_list_id: context.listId,
		item_list_name: context.listName,
		items,
	});
};

export const trackJobSelect = (
	job: JobAnalyticsItem,
	context: JobListAnalyticsContext
): void => {
	if (!shouldTrackJobAnalytics(job, context.tone)) {
		return;
	}

	sendGaEvent("select_item", {
		item_list_id: context.listId,
		item_list_name: context.listName,
		items: [buildJobItem(job, context)],
	});
};

export const trackJobView = (job: JobAnalyticsItem): void => {
	if (!shouldTrackJobAnalytics(job)) {
		return;
	}

	sendGaEvent("view_item", { items: [buildJobItem(job)] });
};
