import { db } from "@bambi-app/db";
import { member } from "@bambi-app/db/schema/auth";
import { jobPerformanceEvent, jobPost } from "@bambi-app/db/schema/bambi";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

export const jobPerformanceEventTypes = [
	"impression",
	"detail_view",
	"chat_start",
	"contact_reveal",
] as const;

export type JobPerformanceEventType = (typeof jobPerformanceEventTypes)[number];

interface RecordJobPerformanceEventInput {
	actorUserId?: null | string;
	eventType: JobPerformanceEventType;
	jobPostId: string;
	metadata?: Record<string, unknown>;
	organizationId: string;
}

export const recordJobPerformanceEvent = async ({
	actorUserId,
	eventType,
	jobPostId,
	metadata,
	organizationId,
}: RecordJobPerformanceEventInput) => {
	const [event] = await db
		.insert(jobPerformanceEvent)
		.values({
			actorUserId: actorUserId ?? null,
			eventType,
			jobPostId,
			metadata,
			organizationId,
		})
		.returning();

	return event;
};

interface ListingImpressionItem {
	exposureType?: string;
	id: string;
	organizationId: string;
}

interface RecordJobListingImpressionsInput {
	actorUserId?: null | string;
	sections: {
		organic: ListingImpressionItem[];
		recommended: ListingImpressionItem[];
		special: ListingImpressionItem[];
		urgent: ListingImpressionItem[];
	};
}

const toImpressionMetadata = ({
	exposureType,
	position,
	section,
}: {
	exposureType?: string;
	position: number;
	section: "organic" | "recommended" | "special" | "urgent";
}): Record<string, unknown> => ({
	...(exposureType ? { exposureType } : {}),
	position,
	section,
});

const toPromotedImpressionValue = ({
	actorUserId,
	item,
	position,
	section,
}: {
	actorUserId?: null | string;
	item: ListingImpressionItem;
	position: number;
	section: "recommended" | "special" | "urgent";
}) => ({
	actorUserId: actorUserId ?? null,
	eventType: "impression" as const,
	jobPostId: item.id,
	metadata: toImpressionMetadata({
		exposureType: item.exposureType,
		position,
		section,
	}),
	organizationId: item.organizationId,
});

const toOrganicImpressionValue = ({
	actorUserId,
	item,
	position,
}: {
	actorUserId?: null | string;
	item: ListingImpressionItem;
	position: number;
}) => ({
	actorUserId: actorUserId ?? null,
	eventType: "impression" as const,
	jobPostId: item.id,
	metadata: toImpressionMetadata({
		position,
		section: "organic",
	}),
	organizationId: item.organizationId,
});

export const recordJobListingImpressions = async ({
	actorUserId,
	sections,
}: RecordJobListingImpressionsInput): Promise<void> => {
	const values = [
		...sections.special.map((item, position) =>
			toPromotedImpressionValue({
				actorUserId,
				item,
				position,
				section: "special",
			})
		),
		...sections.urgent.map((item, position) =>
			toPromotedImpressionValue({
				actorUserId,
				item,
				position,
				section: "urgent",
			})
		),
		...sections.recommended.map((item, position) =>
			toPromotedImpressionValue({
				actorUserId,
				item,
				position,
				section: "recommended",
			})
		),
		...sections.organic.map((item, position) =>
			toOrganicImpressionValue({
				actorUserId,
				item,
				position,
			})
		),
	];

	if (values.length === 0) {
		return;
	}

	await db.insert(jobPerformanceEvent).values(values);
};

export const RECENT_PERFORMANCE_WINDOW_DAYS = 7;

export interface RecentJobPerformanceMetrics {
	detailViews: number;
	impressions: number;
}

const RECENT_PERFORMANCE_EVENT_TYPES = [
	"impression",
	"detail_view",
] as const satisfies JobPerformanceEventType[];

// 여러 공고의 최근 7일 impression/detail_view를 단일 group-by 쿼리로 집계한다(N+1 없음).
// chat_start/contact_reveal은 제외하고, 이벤트가 없는 공고는 0으로 채운다.
export const getRecentJobPerformanceMetrics = async (
	jobPostIds: string[],
	now: Date = new Date()
): Promise<Map<string, RecentJobPerformanceMetrics>> => {
	const metrics = new Map<string, RecentJobPerformanceMetrics>();

	if (jobPostIds.length === 0) {
		return metrics;
	}

	const windowStart = new Date(
		now.getTime() - RECENT_PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000
	);
	const rows = await db
		.select({
			eventType: jobPerformanceEvent.eventType,
			jobPostId: jobPerformanceEvent.jobPostId,
			total: sql<number>`count(*)::int`,
		})
		.from(jobPerformanceEvent)
		.where(
			and(
				inArray(jobPerformanceEvent.jobPostId, jobPostIds),
				inArray(jobPerformanceEvent.eventType, [
					...RECENT_PERFORMANCE_EVENT_TYPES,
				]),
				gte(jobPerformanceEvent.createdAt, windowStart)
			)
		)
		.groupBy(jobPerformanceEvent.jobPostId, jobPerformanceEvent.eventType);

	for (const id of jobPostIds) {
		metrics.set(id, { detailViews: 0, impressions: 0 });
	}

	for (const row of rows) {
		const entry = metrics.get(row.jobPostId);

		if (!entry) {
			continue;
		}

		if (row.eventType === "impression") {
			entry.impressions = row.total;
		} else if (row.eventType === "detail_view") {
			entry.detailViews = row.total;
		}
	}

	return metrics;
};

export interface JobPerformanceMetrics {
	chatStarts: number;
	contactReveals: number;
	detailViews: number;
	impressions: number;
}

export interface JobPerformanceSectionMetrics {
	organicImpressions: number;
	recommendedImpressions: number;
	specialImpressions: number;
	urgentImpressions: number;
}

export interface EmployerJobPerformanceSummary {
	jobPostId: string;
	metrics: JobPerformanceMetrics;
	organizationId: string;
	sectionMetrics: JobPerformanceSectionMetrics;
	status: string;
	title: string;
}

const emptyMetrics = (): JobPerformanceMetrics => ({
	chatStarts: 0,
	contactReveals: 0,
	detailViews: 0,
	impressions: 0,
});

const emptySectionMetrics = (): JobPerformanceSectionMetrics => ({
	organicImpressions: 0,
	recommendedImpressions: 0,
	specialImpressions: 0,
	urgentImpressions: 0,
});

const getEventSection = (
	metadata: Record<string, unknown> | null
): null | string => {
	const section = metadata?.section;

	return typeof section === "string" ? section : null;
};

const incrementMetric = (
	metrics: JobPerformanceMetrics,
	eventType: JobPerformanceEventType
) => {
	switch (eventType) {
		case "chat_start":
			metrics.chatStarts += 1;
			break;
		case "contact_reveal":
			metrics.contactReveals += 1;
			break;
		case "detail_view":
			metrics.detailViews += 1;
			break;
		case "impression":
			metrics.impressions += 1;
			break;
		default:
			break;
	}
};

const incrementSectionMetric = (
	sectionMetrics: JobPerformanceSectionMetrics,
	metadata: Record<string, unknown> | null
) => {
	switch (getEventSection(metadata)) {
		// 하위 호환: 구 캠페인 기반 "premium" 섹션은 광고상품 체계의 스페셜 버킷으로 흡수한다.
		case "premium":
		case "special":
			sectionMetrics.specialImpressions += 1;
			break;
		case "urgent":
			sectionMetrics.urgentImpressions += 1;
			break;
		case "recommended":
			sectionMetrics.recommendedImpressions += 1;
			break;
		case "organic":
			sectionMetrics.organicImpressions += 1;
			break;
		default:
			break;
	}
};

export const getManageableAnalyticsOrganizationIds = async (
	userId: string
): Promise<string[]> => {
	const memberships = await db
		.select({
			organizationId: member.organizationId,
			role: member.role,
		})
		.from(member)
		.where(eq(member.userId, userId));

	return memberships
		.filter(
			(membership) => membership.role === "owner" || membership.role === "admin"
		)
		.map((membership) => membership.organizationId);
};

export const getEmployerJobPerformanceSummary = async (
	userId: string
): Promise<EmployerJobPerformanceSummary[]> => {
	const organizationIds = await getManageableAnalyticsOrganizationIds(userId);

	if (organizationIds.length === 0) {
		return [];
	}

	const jobs = await db
		.select({
			jobPostId: jobPost.id,
			organizationId: jobPost.organizationId,
			status: jobPost.status,
			title: jobPost.title,
			updatedAt: jobPost.updatedAt,
		})
		.from(jobPost)
		.where(inArray(jobPost.organizationId, organizationIds))
		.orderBy(desc(jobPost.updatedAt));
	const jobIds = jobs.map((job) => job.jobPostId);

	if (jobIds.length === 0) {
		return [];
	}

	const events = await db
		.select({
			eventType: jobPerformanceEvent.eventType,
			jobPostId: jobPerformanceEvent.jobPostId,
			metadata: jobPerformanceEvent.metadata,
		})
		.from(jobPerformanceEvent)
		.where(inArray(jobPerformanceEvent.jobPostId, jobIds));
	const metricsByJobId = new Map<string, JobPerformanceMetrics>();
	const sectionMetricsByJobId = new Map<string, JobPerformanceSectionMetrics>();

	for (const job of jobs) {
		metricsByJobId.set(job.jobPostId, emptyMetrics());
		sectionMetricsByJobId.set(job.jobPostId, emptySectionMetrics());
	}

	for (const event of events) {
		const metrics = metricsByJobId.get(event.jobPostId);

		if (metrics) {
			incrementMetric(metrics, event.eventType);
		}

		if (event.eventType === "impression") {
			const sectionMetrics = sectionMetricsByJobId.get(event.jobPostId);

			if (sectionMetrics) {
				incrementSectionMetric(sectionMetrics, event.metadata ?? null);
			}
		}
	}

	return jobs.map(({ updatedAt: _updatedAt, ...job }) => ({
		...job,
		metrics: metricsByJobId.get(job.jobPostId) ?? emptyMetrics(),
		sectionMetrics:
			sectionMetricsByJobId.get(job.jobPostId) ?? emptySectionMetrics(),
	}));
};
