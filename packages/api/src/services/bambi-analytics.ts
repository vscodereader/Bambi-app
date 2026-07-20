import { db } from "@bambi-app/db";
import { member } from "@bambi-app/db/schema/auth";
import { jobPerformanceEvent, jobPost } from "@bambi-app/db/schema/bambi";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

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

// PostgreSQL foreign_key_violation.
const FOREIGN_KEY_VIOLATION = "23503";

// 성과 이벤트는 요청의 부가 기록이라, 대상 공고가 사라진 것 때문에 원 요청까지
// 실패해서는 안 된다. jobs.delete는 공고를 hard delete하므로(연관 행은 FK
// onDelete cascade로 함께 제거) 공고를 읽은 뒤 이벤트를 넣기 전에 삭제되면
// job_post FK 위반이 난다. 어차피 cascade로 지워질 이벤트라 조용히 버린다.
// FK 위반이 아닌 오류는 실제 결함이므로 그대로 던진다.
// drizzle이 드라이버 오류를 DrizzleQueryError로 감싸므로, pg 오류 코드를 찾으려면
// cause 체인을 끝까지 따라 내려가야 한다.
const isForeignKeyViolation = (error: unknown): boolean => {
	let current: unknown = error;

	while (current instanceof Error) {
		if ("code" in current && current.code === FOREIGN_KEY_VIOLATION) {
			return true;
		}

		current = current.cause;
	}

	return false;
};

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
	try {
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
	} catch (error) {
		if (isForeignKeyViolation(error)) {
			// 공고가 이미 삭제됨 — 기록할 대상이 없다.
			return;
		}

		throw error;
	}
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

	try {
		await db.insert(jobPerformanceEvent).values(values);
	} catch (error) {
		if (!isForeignKeyViolation(error)) {
			throw error;
		}

		// 목록 조회와 기록 사이에 공고 하나라도 삭제되면 배치 insert 전체가 막힌다.
		// 노출 기록보다 목록 응답이 우선이라 이번 요청의 기록만 포기한다.
	}
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
