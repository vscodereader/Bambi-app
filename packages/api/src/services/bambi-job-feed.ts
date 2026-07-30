// job_post와 crawled_job_post를 한 목록으로 합쳐 내리는 공용 투영.
//
// 두 테이블의 **컬럼**을 서로 닮게 고치지 않는다. 수집 공고에는 소유 조직도, 결제도, 리뷰도,
// 초보환영/당일면접 같은 사장님 선언도 존재하지 않으므로, 그 자리를 컬럼으로 만들면 크롤러가
// 영원히 채우지 않는 빈 칸이 테이블에 남는다(body/description처럼 이름만 다른 쌍을 만드는 것도
// 마이그레이션 비용만 들고 얻는 게 없다). 대신 **SELECT 한 쌍의 모양**을 똑같이 맞춘다 —
// UNION ALL이 요구하는 건 컬럼 구조가 아니라 투영의 순서·타입이다.
//
// 없는 값은 리터럴로 채우고, 있어야 하는데 비어 있을 수 있는 값(지역·급여단위·근무시간·업종·
// 업소명)은 crawledJobFeedConditions에서 걸러낸다. 카드에 지역도 급여도 없는 행을 흘리면
// 화면에서 "정보 없음"만 남은 카드가 되므로, 목록에 아예 넣지 않는 편이 낫다.

import { db } from "@bambi-app/db";
import {
	bambiSiteSettings,
	crawledJobPost,
	employerOrganizationProfile,
	employerTeamProfile,
	type employerVerificationStatus,
	type jobExposureType,
	type jobIndustryCategory,
	jobPost,
	jobPostMedia,
	type jobPostStatus,
	review,
} from "@bambi-app/db/schema/bambi";
import { and, eq, isNotNull, type SQL, sql } from "drizzle-orm";
import { type PgColumn, unionAll } from "drizzle-orm/pg-core";

import type { JobPostMediaUsage } from "./bambi-job-media-policy";

type JobIndustryCategory = (typeof jobIndustryCategory.enumValues)[number];
type EmployerVerificationStatus =
	(typeof employerVerificationStatus.enumValues)[number];
type JobPostStatus = (typeof jobPostStatus.enumValues)[number];
type JobExposureType = (typeof jobExposureType.enumValues)[number];

// 목록 행의 출처. original/converted는 job_post의 source 컬럼 그대로이고, crawled는
// 아직 전환되지 않은 수집 원본이다. 클라이언트가 이 값으로 상세 라우팅·지원/채팅 버튼을
// 가른다 — 수집 공고에는 채팅할 상대도, 지원을 받을 조직도 없다.
export type JobFeedSource = "converted" | "crawled" | "original";

export interface JobMediaJson<Usage extends JobPostMediaUsage> {
	altText: string;
	byteSize: number;
	fileName: string;
	id: string;
	mimeType: string;
	storageKey: string;
	usage: Usage;
}

// 공고의 특정 usage 미디어 1건을 뽑는 상관 서브쿼리. 커버와 광고 배너가 형태가 같아
// usage만 갈아끼워 재사용한다(같은 SQL 블록을 usage별로 복붙하면 한쪽만 고쳐지는 사고가 난다).
export const jobPostMediaByUsageSql = <Usage extends JobPostMediaUsage>(
	usage: Usage
): SQL<JobMediaJson<Usage> | null> =>
	sql<JobMediaJson<Usage> | null>`(
	select json_build_object(
		'id', ${jobPostMedia.id},
		'usage', ${jobPostMedia.usage},
		'fileName', ${jobPostMedia.fileName},
		'mimeType', ${jobPostMedia.mimeType},
		'byteSize', ${jobPostMedia.byteSize},
		'storageKey', ${jobPostMedia.storageKey},
		'altText', ${jobPostMedia.altText}
	)
	from ${jobPostMedia}
	where ${jobPostMedia.jobPostId} = ${jobPost.id}
		and ${jobPostMedia.usage} = ${usage}
	order by ${jobPostMedia.position} asc
	limit 1
)`;

export const coverImageSql = jobPostMediaByUsageSql("cover");
// 배너 슬롯은 커버가 아니라 사장님이 그 슬롯 규격(7:3 / 4:9)으로 올린 이미지를 써야 한다.
export const adHorizontalImageSql = jobPostMediaByUsageSql("ad_horizontal");
export const adVerticalImageSql = jobPostMediaByUsageSql("ad_vertical");

export const ratingAverageSql = sql<number>`coalesce((select avg(${review.rating}) from ${review} where ${review.jobPostId} = ${jobPost.id} and ${review.status} = 'published'), 0)::double precision`;
export const ratingCountSql = sql<number>`coalesce((select count(*) from ${review} where ${review.jobPostId} = ${jobPost.id} and ${review.status} = 'published'), 0)::integer`;

// 최소 시급(minPayAmount) 비교 — 공고 급여 단위가 섞여 있으므로 시급 기준으로 환산한다.
// 나눗셈 대신 하한에 근로시간을 곱해 정수로 비교한다(반올림 오차·정수 나눗셈 절삭 방지).
// 환산 근로시간은 apps/web/src/lib/bambi-options.ts의 PAY_UNIT_HOURS와 같은 값을 유지할 것.
// 두 테이블이 같은 환산표를 써야 목록이 한쪽만 걸러지는 일이 없어, 컬럼을 인자로 받는다.
export const minHourlyPayFilter = (
	minPayAmount: number,
	payAmount: PgColumn,
	payUnit: PgColumn
): SQL =>
	sql`${payAmount} >= ${minPayAmount} * CASE ${payUnit} WHEN '일급' THEN 8 WHEN '주급' THEN 40 WHEN '월급' THEN 209 ELSE 1 END`;

// job_post 쪽 투영. 아래 crawledJobFeedSelection과 **키 순서까지** 같아야 한다
// (UNION ALL은 이름이 아니라 위치로 컬럼을 맞춘다). bambi-job-feed.test.ts가 못박는다.
export const jobPostFeedSelection = {
	beginnerFriendly: jobPost.beginnerFriendly,
	coverImage: coverImageSql.as("cover_image"),
	// 수집 공고의 이미지는 job_post_media 행이 아니라 미러링된 URL 한 줄이다. 두 표현을
	// 한 칸에 억지로 합치지 않고 칸을 나눠, 클라이언트가 있는 쪽을 쓴다.
	coverImageUrl: sql<null | string>`null::text`.as("cover_image_url"),
	description: jobPost.description,
	district: jobPost.district,
	employerDisplayName: employerOrganizationProfile.displayName,
	employerVerificationStatus: employerOrganizationProfile.verificationStatus,
	exposureEndsAt: jobPost.exposureEndsAt,
	exposureType: jobPost.exposureType,
	id: jobPost.id,
	industryCategory: jobPost.industryCategory,
	instantInterview: jobPost.instantInterview,
	// 원본 사이트가 이 공고를 어느 유료 자리에 걸어 뒀는지. 우리 exposure_type과 다른 축이라
	// (그 사이트에 낸 돈이지 우리에게 낸 돈이 아니다) 섞지 않고 따로 내린다.
	listingType: sql<null | string>`null::text`.as("listing_type"),
	// 합친 목록에서는 nullable이다 — 수집 공고에는 소유 조직이 없다. NOT NULL 컬럼을 그대로
	// 내리면 결과 타입이 string이 되어, 클라이언트가 수집 행에서 조직을 있는 것으로 다룬다.
	organizationId: sql<null | string>`${jobPost.organizationId}`.as(
		"organization_id"
	),
	payAmount: jobPost.payAmount,
	payUnit: jobPost.payUnit,
	publishedAt: jobPost.publishedAt,
	ratingAverage: ratingAverageSql.as("rating_average"),
	ratingCount: ratingCountSql.as("rating_count"),
	region: jobPost.region,
	source: sql<JobFeedSource>`${jobPost.source}::text`.as("source"),
	status: jobPost.status,
	teamDisplayName: employerTeamProfile.displayName,
	title: jobPost.title,
	workSchedule: jobPost.workSchedule,
};

export const crawledJobFeedSelection = {
	// 크롤러는 "초보환영"·"당일면접"을 알 수 없다. 원본 본문에 그런 문구가 있어도 사장님이
	// 우리에게 한 약속이 아니므로 켜지 않는다.
	beginnerFriendly: sql<boolean>`false`,
	coverImage: sql<JobMediaJson<"cover"> | null>`null::json`,
	coverImageUrl: crawledJobPost.thumbnailUrl,
	description: crawledJobPost.body,
	district: crawledJobPost.district,
	employerDisplayName: sql<string>`${crawledJobPost.shopName}`,
	// 수집 공고는 우리가 사업자를 확인한 적이 없다. 'none'이어야 화면의 "검증 완료" 배지가
	// 붙지 않는다 — 여기서 verified를 흘리면 확인하지 않은 업소에 우리 보증이 찍힌다.
	employerVerificationStatus: sql<EmployerVerificationStatus>`'none'`,
	exposureEndsAt: sql<Date | null>`null::timestamp`,
	// 우리에게 광고비를 낸 자리가 아니므로 유료 섹션에 들어갈 수 없다.
	exposureType: sql<JobExposureType>`'standard'`,
	id: crawledJobPost.id,
	industryCategory: sql<JobIndustryCategory>`${crawledJobPost.industryCategory}`,
	instantInterview: sql<boolean>`false`,
	listingType: crawledJobPost.listingType,
	organizationId: sql<null | string>`null::text`,
	payAmount: crawledJobPost.payAmount,
	payUnit: sql<string>`${crawledJobPost.payUnit}`,
	// 원본 게시일이 없으면 우리가 처음 본 시각으로 정렬한다(null이면 목록 맨 끝으로 밀린다).
	publishedAt: sql<Date | null>`coalesce(${crawledJobPost.sourcePostedAt}, ${crawledJobPost.firstSeenAt})`,
	ratingAverage: sql<number>`0::double precision`,
	ratingCount: sql<number>`0::integer`,
	region: sql<string>`${crawledJobPost.region}`,
	source: sql<JobFeedSource>`'crawled'::text`,
	// 목록에 실렸다는 것 자체가 게시 상태다. crawled_post_status(active/needs_review/expired)를
	// 그대로 흘리면 클라이언트가 두 가지 상태 어휘를 알아야 한다.
	status: sql<JobPostStatus>`'published'`,
	teamDisplayName: sql<null | string>`null::text`,
	title: crawledJobPost.title,
	workSchedule: sql<string>`${crawledJobPost.workSchedule}`,
};

export interface JobFeedInput {
	district?: string;
	// 수집 공고를 목록에 섞을지. 생략하면 운영자 설정(crawled_job_feed_enabled)을 읽는다 —
	// 호출부가 플래그를 잊으면 남의 공고가 그대로 공개되므로 기본을 "설정을 본다"로 둔다.
	includeCrawled?: boolean;
	industryCategory?: JobIndustryCategory;
	limit: number;
	minPayAmount?: number;
	region?: string;
}

const isCrawledJobFeedEnabled = async (): Promise<boolean> => {
	const [row] = await db
		.select({ enabled: bambiSiteSettings.crawledJobFeedEnabled })
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, "default"))
		.limit(1);

	return row?.enabled ?? false;
};

const jobPostFeedConditions = (input: JobFeedInput): SQL[] => {
	const conditions: SQL[] = [
		eq(jobPost.status, "published"),
		eq(jobPost.paymentStatus, "paid"),
	];

	if (input.industryCategory) {
		conditions.push(eq(jobPost.industryCategory, input.industryCategory));
	}

	if (input.region) {
		conditions.push(eq(jobPost.region, input.region));
	}

	if (input.district) {
		conditions.push(eq(jobPost.district, input.district));
	}

	if (input.minPayAmount) {
		conditions.push(
			minHourlyPayFilter(input.minPayAmount, jobPost.payAmount, jobPost.payUnit)
		);
	}

	return conditions;
};

// 수집 공고 쪽 조건. 위 투영이 region·payUnit·workSchedule·industryCategory·shopName을
// NOT NULL로 단정하므로, 그 단정을 여기서 실제로 보장한다.
const crawledJobFeedConditions = (
	input: JobFeedInput,
	includeCrawled: boolean
): SQL[] => {
	// 꺼져 있으면 분기를 지우는 대신 조건으로 막는다 — 쿼리 모양이 그대로라 켜고 끌 때
	// 컬럼 순서·정렬이 달라질 여지가 없다(플래너도 이 분기를 읽지 않는다).
	if (!includeCrawled) {
		return [sql`false`];
	}

	const conditions: SQL[] = [
		eq(crawledJobPost.status, "active"),
		isNotNull(crawledJobPost.industryCategory),
		isNotNull(crawledJobPost.region),
		isNotNull(crawledJobPost.payUnit),
		isNotNull(crawledJobPost.workSchedule),
		isNotNull(crawledJobPost.shopName),
		// 이미 우리 공고로 전환된 원본은 뺀다. 안 빼면 같은 업소가 "우리 공고"와 "수집 공고"로
		// 두 번 걸리고, 지원·채팅이 되는 쪽과 안 되는 쪽이 나란히 서게 된다.
		sql`not exists (select 1 from ${jobPost} where ${jobPost.crawledFromId} = ${crawledJobPost.id})`,
	];

	if (input.industryCategory) {
		conditions.push(
			eq(crawledJobPost.industryCategory, input.industryCategory)
		);
	}

	if (input.region) {
		conditions.push(eq(crawledJobPost.region, input.region));
	}

	if (input.district) {
		conditions.push(eq(crawledJobPost.district, input.district));
	}

	if (input.minPayAmount) {
		conditions.push(
			minHourlyPayFilter(
				input.minPayAmount,
				crawledJobPost.payAmount,
				crawledJobPost.payUnit
			)
		);
	}

	return conditions;
};

export type JobFeedRow = Awaited<ReturnType<typeof listJobFeed>>[number];

// 두 테이블을 한 결과로 합쳐 최신순으로 내린다. 정렬·limit을 DB에서 끝내야 하므로
// 애플리케이션에서 두 배열을 합치는 대신 UNION ALL을 쓴다(수집 테이블이 커지면 전량을
// 가져와 자르는 방식은 그대로 무너진다). ALL인 이유는 두 원천에 같은 행이 있을 수 없고,
// DISTINCT는 json 컬럼에 등호가 없어 실행 자체가 실패하기 때문이다.
export const listJobFeed = async (input: JobFeedInput) => {
	const includeCrawled =
		input.includeCrawled ?? (await isCrawledJobFeedEnabled());

	return await unionAll(
		db
			.select(jobPostFeedSelection)
			.from(jobPost)
			.innerJoin(
				employerOrganizationProfile,
				eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
			)
			.leftJoin(
				employerTeamProfile,
				eq(jobPost.teamId, employerTeamProfile.teamId)
			)
			.where(and(...jobPostFeedConditions(input))),
		db
			.select(crawledJobFeedSelection)
			.from(crawledJobPost)
			.where(and(...crawledJobFeedConditions(input, includeCrawled)))
	)
		.orderBy(sql`published_at desc nulls last`)
		.limit(input.limit);
};
