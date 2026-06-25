import { db } from "@bambi-app/db";
import { member } from "@bambi-app/db/schema/auth";
import { jobPerformanceEvent, jobPost } from "@bambi-app/db/schema/bambi";
import { desc, eq, inArray } from "drizzle-orm";

import type {
	PromotionTier,
	PublicJobSections,
	PublicOrganicJobListItem,
	PublicPromotedJobListItem,
} from "./bambi-promotions";

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

interface RecordJobListingImpressionsInput {
	actorUserId?: null | string;
	sections: PublicJobSections["sections"];
}

const toImpressionMetadata = ({
	campaignId,
	position,
	promotionTier,
	section,
}: {
	campaignId?: string;
	position: number;
	promotionTier?: PromotionTier;
	section: "organic" | "premium" | "recommended";
}): Record<string, unknown> => ({
	...(campaignId ? { campaignId } : {}),
	position,
	...(promotionTier ? { promotionTier } : {}),
	section,
});

const toPromotedImpressionValue = ({
	actorUserId,
	item,
	position,
	section,
}: {
	actorUserId?: null | string;
	item: PublicPromotedJobListItem;
	position: number;
	section: "premium" | "recommended";
}) => ({
	actorUserId: actorUserId ?? null,
	eventType: "impression" as const,
	jobPostId: item.id,
	metadata: toImpressionMetadata({
		campaignId: item.promotionCampaignId,
		position,
		promotionTier: item.promotionTier,
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
	item: PublicOrganicJobListItem;
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
		...sections.premium.map((item, position) =>
			toPromotedImpressionValue({
				actorUserId,
				item,
				position,
				section: "premium",
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

export interface JobPerformanceMetrics {
	chatStarts: number;
	contactReveals: number;
	detailViews: number;
	impressions: number;
}

export interface JobPerformanceSectionMetrics {
	organicImpressions: number;
	premiumImpressions: number;
	recommendedImpressions: number;
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
	premiumImpressions: 0,
	recommendedImpressions: 0,
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
		case "premium":
			sectionMetrics.premiumImpressions += 1;
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
