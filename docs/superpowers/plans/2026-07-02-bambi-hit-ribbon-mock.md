# 밤비 HIT 리본 (섹션 tone 색상) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최근 7일 상세 조회수·CTR이 높은 공고에 노출 섹션 테두리 tone(스페셜=coral, 급구=amber, 추천=sky)과 일치하는 "HIT" 코너 리본을 표시한다. 전체(organic)에는 표시하지 않는다.

**Architecture:** 기존 `jobPerformanceEvent`(impression/detail_view)를 최근 7일 집계하는 서비스 함수를 추가하고, `jobs.list`가 섹션 구성 직후(신규 impression 기록 이전)에 각 item에 `performance:{impressions,detailViews}`를 붙인다. Web은 이 값을 `Job.performance`로 매핑하고, 순수 함수 `isJobHit(job)`으로 Hit 여부를 계산한다. `VisualJobCard`는 섹션별 `tone` prop으로 이미 렌더되므로, 같은 공고가 스페셜/급구에 동시에 노출되면 각 렌더의 tone에 맞는 다른 색 리본이 자연히 적용된다.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres), oRPC, Next.js 16 / React 19, Tailwind v4 + shadcn(base-ui), Vitest.

## Global Constraints

- DB schema 변경 금지 · migration 생성 금지 · 새 이벤트 수집 API 생성 금지.
- Hit 여부를 seed/DB에 boolean으로 저장하지 않음 — 항상 metrics로 계산.
- Seed는 기존 `jobPerformanceEvent`만 사용, 기존 deterministic UUID(`richId`)·삭제/재생성 흐름 유지.
- Hit 판정 대상 seed 이벤트의 `createdAt`은 전달된 `now` 기준 최근 7일 내로 분산(고정 2026 날짜로 만료되는 구조 금지). chat_start·contact_reveal은 Hit 계산에서 제외.
- 리본: 고정 보라색 금지, 대각선 강제 금지, 카드 우측 상단 코너 라벨, 카드 높이 불변, 회사명/지역 가리지 않게 공간 확보, `pointer-events-none`으로 클릭 막지 않음, promotion tone·active border와 공존, 화면 `HIT` + 스크린리더 `인기 공고`, 색상만으로 상태 전달 금지.
- `apps/web` UI는 Tailwind `className`만(인라인 style 금지), 시맨틱/브랜드 토큰 사용, `rounded-none` 금지.
- 임계값은 의미 있는 상수로 분리. N+1 쿼리 금지. 0으로 나누지 않음.
- 별도 요청 없이는 커밋하지 않음.
- 프로젝트 UI 검증 관례: 리본/색 매핑 로직은 순수 함수로 단위 테스트하고, 시각·클릭 최종 확인은 사용자가 브라우저에서 수행한다(개발서버/스크린샷 자동화 금지).

## Hit 판정 기준

`performance = { impressions, detailViews }` (최근 7일 합계) 기준, 아래 중 하나면 Hit:

- (A) `detailViews >= 100`
- (B) `impressions >= 200` **그리고** `detailViews / impressions >= 0.12`

추가: performance 없으면 false. impressions가 0이어도 (A)는 독립 판정. impressions < 200이면 (B) 미적용이라 0 나눗셈 없음.

상수:
- `HIT_DETAIL_VIEWS_THRESHOLD = 100`
- `HIT_IMPRESSIONS_THRESHOLD = 200`
- `HIT_CTR_THRESHOLD = 0.12`

## Seed 성과 profile (기존 `jobPerformanceEvent` 확장)

`apps/server/src/seeds/bambi-dev.ts`의 `buildPromotionEvents`를 profile-driven으로 확장. 아래 공고 번호(`richId("2a2a2a2a", n)`)의 **최근 7일 최종 총량**이 profile 값과 정확히 일치하도록 이벤트를 생성한다(그 외 promoted 공고는 기존 고정 6월 이벤트 유지 → 7일 밖이라 Hit 아님).

| n | 섹션/promo | org | impressions | detailViews | CTR | 판정 | 검증 목적 |
|---|-----------|-----|-------------|-------------|-----|------|-----------|
| 1 | premium (special+urgent, boosted) | mars | 1,000 | 100 | 10% | **Hit** (조건 A) | 스페셜=coral, 급구=amber 동시 |
| 2 | recommended | mars | 200 | 24 | 12% | **Hit** (조건 B) | 추천=sky |
| 4 | recommended | velvet | 200 | 23 | 11.5% | **비-Hit** | 대조군 (리본 없음) |

UUID(참고): n=1 `2a2a2a2a-0000-4000-8000-000000000001`, n=2 `...000000000002`, n=4 `...000000000004`.

---

## Task 1: Hit 성과 seed profile

**Files:**
- Modify: `apps/server/src/seeds/bambi-dev.ts` (`buildPromotionEvents`, `seedRichPromotions`)

**Interfaces:**
- Produces: n=1/2/4 공고에 대해 최근 7일 impression/detail_view 총량이 profile과 일치하는 `jobPerformanceEvent` 행.

- [x] **Step 1: profile 맵과 7일 내 날짜 헬퍼 추가**

`richJobs` 정의 아래(또는 `buildPromotionEvents` 위)에 추가:

```ts
// 최근 7일 성과 profile — Hit 리본 데모용. n → 최종 총량(impressions/detailViews).
const richJobHitProfiles: Record<number, { detailViews: number; impressions: number }> = {
	1: { detailViews: 100, impressions: 1000 }, // CTR 10% → 조건 A(detailViews>=100)로 Hit
	2: { detailViews: 24, impressions: 200 }, // CTR 12% → 조건 B로 Hit
	4: { detailViews: 23, impressions: 200 }, // CTR 11.5% → 비-Hit 대조군
};

const DAY_MS = 24 * 60 * 60 * 1000;

// now 기준 최근 7일(6일 이내) 안에 결정론적으로 분산된 createdAt.
const recentPerformanceDate = (now: Date, k: number): Date =>
	new Date(now.getTime() - ((k % 6) * DAY_MS) - ((k % 240) * 60 * 1000));
```

- [x] **Step 2: `buildPromotionEvents`를 profile-driven으로 확장**

시그니처에 `now: Date`를 추가하고, profile이 있으면 impression/detail_view 개수와 날짜를 profile·`now` 기준으로 생성한다. chat_start(+premium contact_reveal)는 그대로 유지(Hit 계산 제외).

```ts
const buildPromotionEvents = (
	def: RichJobDef,
	userIds: Record<DevUserKey, string>,
	startSeq: number,
	now: Date
): RichEvent[] => {
	const jobPostId = richId("2a2a2a2a", def.n);
	const isPremium = def.promo === "premium";
	const profile = richJobHitProfiles[def.n];
	const events: RichEvent[] = [];
	let seq = startSeq;

	const impressions = profile ? profile.impressions : isPremium ? 14 : 8;
	for (let k = 0; k < impressions; k++) {
		events.push({
			id: richId("6a6a6a6a", seq),
			jobPostId,
			organizationId: def.org,
			actorUserId: null,
			eventType: "impression",
			createdAt: profile
				? recentPerformanceDate(now, k)
				: new Date(
						`2026-06-${(20 + (k % 8)).toString().padStart(2, "0")}T${(8 + (k % 10)).toString().padStart(2, "0")}:15:00.000Z`
					),
		});
		seq++;
	}

	const detailViews = profile ? profile.detailViews : isPremium ? 5 : 3;
	for (let k = 0; k < detailViews; k++) {
		events.push({
			id: richId("6a6a6a6a", seq),
			jobPostId,
			organizationId: def.org,
			actorUserId: userIds.seeker,
			eventType: "detail_view",
			createdAt: profile
				? recentPerformanceDate(now, k + 1)
				: new Date(
						`2026-06-${(21 + (k % 6)).toString().padStart(2, "0")}T13:${(10 + k).toString().padStart(2, "0")}:00.000Z`
					),
		});
		seq++;
	}

	events.push({
		id: richId("6a6a6a6a", seq),
		jobPostId,
		organizationId: def.org,
		actorUserId: userIds.seekerB,
		eventType: "chat_start",
		createdAt: new Date("2026-06-24T15:00:00.000Z"),
	});
	seq++;

	if (isPremium) {
		events.push({
			id: richId("6a6a6a6a", seq),
			jobPostId,
			organizationId: def.org,
			actorUserId: userIds.seekerB,
			eventType: "contact_reveal",
			createdAt: new Date("2026-06-25T16:00:00.000Z"),
		});
	}

	return events;
};
```

- [x] **Step 3: 호출부에 `now` 전달**

`seedRichPromotions` 내부의 호출을 수정:

```ts
eventRows.push(...buildPromotionEvents(def, userIds, eventRows.length + 1, now));
```

- [x] **Step 4: server type-check**

Run: `pnpm --filter server check-types`
Expected: PASS (에러 0) — ✅ `tsc -b` 에러 0.

- [x] **Step 5: seed 정적 확인 (DB 실행 금지)**

`richJobHitProfiles`가 n=1/2/4를 덮고, `chat_start`/`contact_reveal`은 profile 분기에 포함되지 않으며, profile 이벤트가 `recentPerformanceDate(now, …)`로 생성되는지 코드 리뷰로 확인. **`pnpm db:seed:bambi`는 실행하지 않는다.**

### 🔒 필수 중간 체크포인트 (여기서 멈춤)

Task 1 코드 작성 + server type-check 완료 후 사용자에게 보고하고 대기:
- "HIT 성과 MockData 작성 완료"
- Hit 공고: n=1(premium/mars, imp 1000·dv 100), n=2(recommended/mars, imp 200·dv 24). 비-Hit 대조: n=4(recommended/velvet, imp 200·dv 23).
- DB에는 아직 반영하지 않음.
- 사용자가 실행할 명령: `pnpm db:seed:bambi`

사용자가 DB 반영을 확인하기 전에는 브라우저 검증을 진행하지 않는다.

---

## Task 2: 최근 7일 성과 집계 API

**Files:**
- Modify: `packages/api/src/services/bambi-analytics.ts`
- Test: `packages/api/src/services/bambi-analytics.test.ts` (신규)

**Interfaces:**
- Produces: `getRecentJobPerformanceMetrics(jobPostIds: string[], now?: Date): Promise<Map<string, { detailViews: number; impressions: number }>>`
- Produces 상수: `RECENT_PERFORMANCE_WINDOW_DAYS = 7`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/services/bambi-analytics.test.ts` — 실 DB fixture(기존 `jobs-analytics.test.ts` 패턴: dotenv + db import). 이벤트를 직접 insert하고 집계를 검증한다.

```ts
import { randomUUID } from "node:crypto";

import dotenv from "dotenv";
import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, analytics] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./bambi-analytics"),
]);

const { organization } = authSchema;
const { employerOrganizationProfile, jobPerformanceEvent, jobPost } = bambiSchema;
const { getRecentJobPerformanceMetrics } = analytics;

const DAY_MS = 24 * 60 * 60 * 1000;

interface Fixture {
	organizationId: string;
	jobA: string;
	jobB: string;
	jobC: string;
}

const createFixture = async (): Promise<Fixture> => {
	const now = new Date();
	const organizationId = `org_test_${randomUUID()}`;
	const jobA = randomUUID();
	const jobB = randomUUID();
	const jobC = randomUUID();

	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "성과 집계 테스트 조직",
		slug: `analytics-${randomUUID()}`,
	});
	await db.insert(employerOrganizationProfile).values({
		displayName: "성과 집계 테스트 업체",
		organizationId,
		verificationStatus: "verified",
	});
	await db.insert(jobPost).values(
		[jobA, jobB, jobC].map((id, index) => ({
			createdByUserId: null,
			description: "성과 집계 테스트 공고입니다.",
			id,
			industryCategory: "라운지",
			organizationId,
			payAmount: 180_000,
			payUnit: "일급",
			publishedAt: now,
			region: "서울 강남구",
			status: "published" as const,
			title: `성과 집계 테스트 공고 ${index}`,
			workSchedule: "20:00-02:00",
		}))
	);

	const recent = (hoursAgo: number): Date =>
		new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

	await db.insert(jobPerformanceEvent).values([
		// jobA: 최근 7일 impression 3, detail_view 2, 그리고 제외 이벤트들
		{ jobPostId: jobA, organizationId, eventType: "impression", createdAt: recent(1) },
		{ jobPostId: jobA, organizationId, eventType: "impression", createdAt: recent(2) },
		{ jobPostId: jobA, organizationId, eventType: "impression", createdAt: recent(3) },
		{ jobPostId: jobA, organizationId, eventType: "detail_view", createdAt: recent(4) },
		{ jobPostId: jobA, organizationId, eventType: "detail_view", createdAt: recent(5) },
		{ jobPostId: jobA, organizationId, eventType: "chat_start", createdAt: recent(6) },
		{ jobPostId: jobA, organizationId, eventType: "contact_reveal", createdAt: recent(7) },
		// jobA: 7일 이전(제외)
		{ jobPostId: jobA, organizationId, eventType: "impression", createdAt: new Date(now.getTime() - 8 * DAY_MS) },
		{ jobPostId: jobA, organizationId, eventType: "detail_view", createdAt: new Date(now.getTime() - 9 * DAY_MS) },
		// jobB: detail_view 1
		{ jobPostId: jobB, organizationId, eventType: "detail_view", createdAt: recent(1) },
		// jobC: 이벤트 없음
	]);

	return { organizationId, jobA, jobB, jobC };
};

const cleanupFixture = async (fixture: Fixture): Promise<void> => {
	const jobIds = [fixture.jobA, fixture.jobB, fixture.jobC];
	await db.delete(jobPerformanceEvent).where(inArray(jobPerformanceEvent.jobPostId, jobIds));
	await db.delete(jobPost).where(inArray(jobPost.id, jobIds));
	await db
		.delete(employerOrganizationProfile)
		.where(inArray(employerOrganizationProfile.organizationId, [fixture.organizationId]));
	await db.delete(organization).where(inArray(organization.id, [fixture.organizationId]));
};

describe("getRecentJobPerformanceMetrics", () => {
	it("aggregates only impression/detail_view within the last 7 days for many jobs at once", async () => {
		const fixture = await createFixture();

		try {
			const metrics = await getRecentJobPerformanceMetrics([
				fixture.jobA,
				fixture.jobB,
				fixture.jobC,
			]);

			// 7일 이내 impression/detail_view만, chat_start/contact_reveal·7일 이전 제외
			expect(metrics.get(fixture.jobA)).toEqual({ detailViews: 2, impressions: 3 });
			expect(metrics.get(fixture.jobB)).toEqual({ detailViews: 1, impressions: 0 });
			// 이벤트 없는 공고는 0
			expect(metrics.get(fixture.jobC) ?? { detailViews: 0, impressions: 0 }).toEqual({
				detailViews: 0,
				impressions: 0,
			});
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("returns an empty map for an empty id list without querying", async () => {
		const metrics = await getRecentJobPerformanceMetrics([]);

		expect(metrics.size).toBe(0);
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test bambi-analytics`
Expected: FAIL — `getRecentJobPerformanceMetrics is not a function`

- [ ] **Step 3: 집계 함수 구현**

`packages/api/src/services/bambi-analytics.ts` 상단 import에 `and, gte, sql` 추가:

```ts
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
```

파일 하단(또는 `recordJobListingImpressions` 근처)에 추가:

```ts
export const RECENT_PERFORMANCE_WINDOW_DAYS = 7;

export interface RecentJobPerformanceMetrics {
	detailViews: number;
	impressions: number;
}

const RECENT_PERFORMANCE_EVENT_TYPES = [
	"impression",
	"detail_view",
] as const satisfies JobPerformanceEventType[];

// 여러 공고의 최근 7일 impression/detail_view를 단일 group-by 쿼리로 집계(N+1 없음).
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
			jobPostId: jobPerformanceEvent.jobPostId,
			eventType: jobPerformanceEvent.eventType,
			total: sql<number>`count(*)::int`,
		})
		.from(jobPerformanceEvent)
		.where(
			and(
				inArray(jobPerformanceEvent.jobPostId, jobPostIds),
				inArray(
					jobPerformanceEvent.eventType,
					RECENT_PERFORMANCE_EVENT_TYPES as unknown as string[]
				),
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test bambi-analytics`
Expected: PASS

---

## Task 3: `jobs.list`에 performance 부착

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts` (`list` 핸들러)

**Interfaces:**
- Consumes: `getRecentJobPerformanceMetrics` (Task 2)
- Produces: `jobs.list` 응답의 각 섹션 item에 `performance: { impressions, detailViews }` 포함.

- [ ] **Step 1: import 추가**

```ts
import {
	getRecentJobPerformanceMetrics,
	recordJobListingImpressions,
	recordJobPerformanceEvent,
} from "../../services/bambi-analytics";
```

- [ ] **Step 2: 집계 후 부착 (impression 기록 이전)**

`list` 핸들러에서 `buildPublicJobSections` 이후, `recordJobListingImpressions` **이전**에 삽입:

```ts
const result = buildPublicJobSections({
	limit: input.limit,
	now,
	organicRows,
	premiumRows,
	recommendedRows,
});

// 현재 요청의 신규 impression 기록 전에 최근 7일 성과를 집계해 판정이 왜곡되지 않게 한다.
const performanceJobIds = [
	...result.sections.premium,
	...result.sections.recommended,
	...result.sections.organic,
].map((item) => item.id);
const performanceByJobId = await getRecentJobPerformanceMetrics(
	performanceJobIds,
	now
);
const withPerformance = <T extends { id: string }>(item: T) => ({
	...item,
	performance: performanceByJobId.get(item.id) ?? {
		detailViews: 0,
		impressions: 0,
	},
});
const sectionsWithPerformance = {
	organic: result.sections.organic.map(withPerformance),
	premium: result.sections.premium.map(withPerformance),
	recommended: result.sections.recommended.map(withPerformance),
};

await recordJobListingImpressions({
	actorUserId: context.session?.user.id,
	sections: result.sections,
});

return {
	...result,
	sections: sectionsWithPerformance,
};
```

정렬·섹션 구성은 변경하지 않으며 `recordJobListingImpressions`는 여전히 원본 `result.sections`를 받는다(성과는 위에서 이미 집계됨).

- [ ] **Step 3: api type-check + 기존 analytics 테스트 회귀 확인**

Run: `pnpm --filter @bambi-app/api check-types`
Run: `pnpm --filter @bambi-app/api test jobs-analytics`
Expected: 둘 다 PASS (impression 기록/메타데이터 테스트 그대로 통과)

---

## Task 4: Web 타입 + API mapper 연결

**Files:**
- Modify: `apps/web/src/lib/bambi/types.ts`
- Modify: `apps/web/src/lib/bambi/api-job-mapper.ts`
- Test: `apps/web/src/lib/bambi/api-jobs.test.ts` (mapper 케이스 추가)

**Interfaces:**
- Produces: `JobPerformanceMetrics { impressions: number; detailViews: number }`, `Job.performance?: JobPerformanceMetrics`.

- [ ] **Step 1: 실패하는 mapper 테스트 추가**

`apps/web/src/lib/bambi/api-jobs.test.ts`에 추가:

```ts
it("passes API performance metrics onto the mapped job", () => {
	const job = toMarketplaceJob({
		description: "성과가 있는 공고입니다.",
		employerVerificationStatus: "verified",
		id: "22222222-2222-4222-8222-222222222201",
		industryCategory: "라운지",
		payAmount: 180_000,
		payUnit: "일급",
		performance: { detailViews: 100, impressions: 1000 },
		region: "서울 강남구",
		status: "published",
		title: "성과 공고",
		workSchedule: "20:00-02:00",
	});

	expect(job.performance).toEqual({ detailViews: 100, impressions: 1000 });
});

it("keeps performance undefined when the API omits it", () => {
	const job = toMarketplaceJob({
		description: "성과가 없는 공고입니다.",
		employerVerificationStatus: "verified",
		id: "22222222-2222-4222-8222-222222222299",
		industryCategory: "라운지",
		payAmount: 150_000,
		payUnit: "일급",
		region: "서울 강남구",
		status: "published",
		title: "성과 없는 공고",
		workSchedule: "20:00-02:00",
	});

	expect(job.performance).toBeUndefined();
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run apps/web/src/lib/bambi/api-jobs.test.ts`
Expected: FAIL — `job.performance` 미정의(타입/런타임)

- [ ] **Step 3: 타입 추가 (`types.ts`)**

`Job` 인터페이스 위에 타입 추가하고, `Job`에 `performance?` 필드 추가(알파벳 순서 위치 = `pref` 다음, `promotionLabel` 앞):

```ts
export interface JobPerformanceMetrics {
	detailViews: number;
	impressions: number;
}
```

`Job` 내부:

```ts
	pay: string;
	performance?: JobPerformanceMetrics;
	pref: string;
```

- [ ] **Step 4: mapper 연결 (`api-job-mapper.ts`)**

`ApiMarketplaceJob`에 `performance?` 추가(정렬 위치: `payUnit` 다음):

```ts
	payAmount: number;
	payUnit: string;
	performance?: JobPerformanceMetrics;
	promotionLabel?: null | string;
```

import에 타입 추가:

```ts
import type { Job, JobDescriptionBlock, JobMedia, JobPerformanceMetrics } from "./types";
```

`toMarketplaceJob` 반환 객체에 조건부 spread(값 없으면 필드 자체를 넣지 않아 `undefined` 유지):

```ts
		pay: formatMarketplacePay(job),
		...(job.performance ? { performance: job.performance } : {}),
		pref: "면접 전 연락처 보호",
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm exec vitest run apps/web/src/lib/bambi/api-jobs.test.ts`
Expected: PASS

---

## Task 5: Hit 판정 helper + 리본 tone 헬퍼 (순수 함수 + 테스트)

**Files:**
- Create: `apps/web/src/lib/bambi/job-hit.ts`
- Test: `apps/web/src/lib/bambi/job-hit.test.ts`

**Interfaces:**
- Consumes: `Job`, `JobPerformanceMetrics` (Task 4)
- Produces:
  - `isJobHit(job: Pick<Job, "performance">): boolean`
  - `HIT_DETAIL_VIEWS_THRESHOLD`, `HIT_IMPRESSIONS_THRESHOLD`, `HIT_CTR_THRESHOLD`
  - `HitRibbonTone = "recommended" | "special" | "urgent"`
  - `shouldShowHitRibbon(job, tone): boolean` — tone이 organic이 아니고(=HitRibbonTone) `isJobHit`이 true일 때만 true
  - `HIT_RIBBON_CLASS_BY_TONE: Record<HitRibbonTone, string>` — tone별 리본 색 className

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/src/lib/bambi/job-hit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	HIT_RIBBON_CLASS_BY_TONE,
	isJobHit,
	shouldShowHitRibbon,
} from "./job-hit";

const withPerf = (impressions: number, detailViews: number) => ({
	performance: { detailViews, impressions },
});

describe("isJobHit", () => {
	it("hits at the detailViews=100 boundary (condition A)", () => {
		expect(isJobHit(withPerf(0, 100))).toBe(true);
	});

	it("does not hit just below the detailViews boundary", () => {
		expect(isJobHit(withPerf(0, 99))).toBe(false);
	});

	it("hits at impressions=200 with CTR exactly 12% (condition B)", () => {
		expect(isJobHit(withPerf(200, 24))).toBe(true);
	});

	it("does not hit at impressions=200 with 23 detail views (CTR 11.5%)", () => {
		expect(isJobHit(withPerf(200, 23))).toBe(false);
	});

	it("does not hit when CTR is high but impressions < 200", () => {
		expect(isJobHit(withPerf(50, 20))).toBe(false); // CTR 40% but impressions<200 and dv<100
	});

	it("returns false when performance is missing", () => {
		expect(isJobHit({})).toBe(false);
	});

	it("treats detailViews condition independently even when impressions=0", () => {
		expect(isJobHit(withPerf(0, 120))).toBe(true);
	});

	it("does not hit with impressions=0 and low detail views (no divide-by-zero)", () => {
		expect(isJobHit(withPerf(0, 10))).toBe(false);
	});
});

describe("shouldShowHitRibbon", () => {
	it("shows for special/urgent/recommended when the job is a hit", () => {
		expect(shouldShowHitRibbon(withPerf(0, 100), "special")).toBe(true);
		expect(shouldShowHitRibbon(withPerf(0, 100), "urgent")).toBe(true);
		expect(shouldShowHitRibbon(withPerf(200, 24), "recommended")).toBe(true);
	});

	it("never shows for organic even when the job is a hit", () => {
		expect(shouldShowHitRibbon(withPerf(0, 100), "organic")).toBe(false);
	});

	it("does not show when the job is not a hit", () => {
		expect(shouldShowHitRibbon(withPerf(200, 23), "special")).toBe(false);
	});
});

describe("HIT_RIBBON_CLASS_BY_TONE", () => {
	it("maps each tone to its section color family", () => {
		expect(HIT_RIBBON_CLASS_BY_TONE.special).toContain("coral");
		expect(HIT_RIBBON_CLASS_BY_TONE.urgent).toContain("amber");
		expect(HIT_RIBBON_CLASS_BY_TONE.recommended).toContain("sky");
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run apps/web/src/lib/bambi/job-hit.test.ts`
Expected: FAIL — 모듈/함수 없음

- [ ] **Step 3: 구현 (`job-hit.ts`)**

```ts
import type { Job } from "./types";

// Hit 임계값 — 의미 있는 상수로 분리한다.
export const HIT_DETAIL_VIEWS_THRESHOLD = 100;
export const HIT_IMPRESSIONS_THRESHOLD = 200;
export const HIT_CTR_THRESHOLD = 0.12;

// 최근 7일 metrics로 Hit 여부를 계산한다(seed에 boolean 저장하지 않음).
export const isJobHit = (job: Pick<Job, "performance">): boolean => {
	const performance = job.performance;

	if (!performance) {
		return false;
	}

	// 조건 A: 상세 조회수 단독(impressions와 독립).
	if (performance.detailViews >= HIT_DETAIL_VIEWS_THRESHOLD) {
		return true;
	}

	// 조건 B: 충분한 노출 + 높은 CTR. impressions>=200이라 0 나눗셈 없음.
	if (performance.impressions >= HIT_IMPRESSIONS_THRESHOLD) {
		return performance.detailViews / performance.impressions >= HIT_CTR_THRESHOLD;
	}

	return false;
};

export type HitRibbonTone = "recommended" | "special" | "urgent";

const HIT_RIBBON_TONES: readonly HitRibbonTone[] = [
	"special",
	"urgent",
	"recommended",
];

const isHitRibbonTone = (
	tone: "organic" | "recommended" | "special" | "urgent"
): tone is HitRibbonTone =>
	(HIT_RIBBON_TONES as readonly string[]).includes(tone);

// organic은 리본 없음. special/urgent/recommended이고 Hit일 때만 표시.
export const shouldShowHitRibbon = (
	job: Pick<Job, "performance">,
	tone: "organic" | "recommended" | "special" | "urgent"
): boolean => isHitRibbonTone(tone) && isJobHit(job);

// 섹션 테두리 tone과 일치하는 리본 색(고정 보라색 금지). 텍스트 대비 확보.
export const HIT_RIBBON_CLASS_BY_TONE: Record<HitRibbonTone, string> = {
	special: "bg-coral-500 text-white",
	urgent: "bg-amber-500 text-ink-900",
	recommended: "bg-sky-500 text-white",
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run apps/web/src/lib/bambi/job-hit.test.ts`
Expected: PASS

---

## Task 6: `VisualJobCard` HIT 리본

**Files:**
- Modify: `apps/web/src/components/bambi/visual-job-card.tsx`

**Interfaces:**
- Consumes: `shouldShowHitRibbon`, `HIT_RIBBON_CLASS_BY_TONE` (Task 5)

**설계 결정 (클릭 비간섭):** 리본은 `onOpen` 버튼의 자식으로 렌더한다. 그러면 리본 영역 클릭도 카드 열기(onOpen)로 이어져 클릭을 "가로채지" 않고, `pointer-events-none` 없이도 요구사항을 만족한다. 버튼을 `relative`로 두고 리본을 `absolute`로 배치하되, 음수 오프셋으로 카드 실제 우측 상단 모서리에 붙인다(카드 패딩 `p-2` 상쇄). 텍스트 컬럼에는 Hit일 때만 우측 패딩을 추가해 회사명/지역을 가리지 않게 공간을 확보한다. 카드 높이는 불변(absolute 오버레이).

- [ ] **Step 1: import + 리본 tone 계산**

파일 상단 import 추가:

```ts
import { HIT_RIBBON_CLASS_BY_TONE, shouldShowHitRibbon } from "@/lib/bambi/job-hit";
```

컴포넌트 본문 상단(`const { amount... }` 근처)에:

```ts
	const showHitRibbon = shouldShowHitRibbon(job, tone);
	const hitRibbonClassName =
		tone === "organic" ? "" : HIT_RIBBON_CLASS_BY_TONE[tone];
```

- [ ] **Step 2: `onOpen` 버튼을 relative로 만들고 리본·텍스트 여백 추가**

버튼 `className`에 `relative` 추가:

```tsx
			<button
				className="relative flex cursor-pointer flex-col gap-2 border-none bg-transparent p-0 text-left"
				onClick={() => onOpen(job)}
				type="button"
			>
```

버튼 여는 태그 직후에 리본 삽입(카드 실제 모서리에 붙도록 음수 오프셋, 카드 radius와 맞춤):

```tsx
				{showHitRibbon ? (
					<span
						className={cn(
							"-top-2 -right-2 absolute z-10 rounded-tr-lg rounded-bl-md px-1.5 py-0.5 font-extrabold text-[10px] leading-none tracking-wide shadow-[var(--shadow-card)]",
							hitRibbonClassName
						)}
					>
						<span aria-hidden="true">HIT</span>
						<span className="sr-only">인기 공고</span>
					</span>
				) : null}
```

텍스트 컬럼(회사명/지역/설명 감싼 `div`)에 Hit일 때 우측 패딩 추가로 리본 공간 확보:

```tsx
					<div
						className={cn(
							"flex min-w-0 flex-1 flex-col gap-1",
							showHitRibbon && "pr-8"
						)}
					>
```

- [ ] **Step 3: web type-check**

Run: `pnpm --filter web check-types`
Expected: PASS

- [ ] **Step 4: 정적 확인**

- `tone === "organic"`이면 `showHitRibbon`이 false → 리본 없음.
- 리본이 `onOpen` 버튼 자식이라 클릭이 onOpen으로 이어짐(비간섭), `pointer-events-none` 미사용.
- active border(`ring-2 ring-coral-100`)·promotion tone과 공존(리본은 별도 absolute span).
- `HIT` 화면 표시 + `인기 공고` sr-only.

---

## Task 7: 자동 검사 · 브라우저 검증 · verification notes

**Files:**
- Modify: 본 계획 문서(verification notes 갱신)

- [ ] **Step 1: 체크포인트 이전 자동 검사**

Run: `pnpm --filter server check-types` → PASS
(seed 정적 검사 완료, `pnpm db:seed:bambi` 미실행)

- [ ] **Step 2: (사용자 DB 반영 후) 전체 자동 검사**

Run 순서 및 기대치:
- `pnpm --filter @bambi-app/api test` → PASS
- `pnpm exec vitest run apps/web/src/lib/bambi/job-hit.test.ts apps/web/src/lib/bambi/api-jobs.test.ts` → PASS
- `pnpm run check-types` → PASS
- `pnpm run check` (ultracite) → PASS
- `pnpm --filter server build` → PASS
- `pnpm --filter web build` → PASS

- [ ] **Step 3: 브라우저 검증 (사용자)**

`/`와 `/seeker` 데스크톱·모바일에서:
- n=1 공고가 **스페셜(coral)**·**급구(amber)**에서 각각 tone에 맞는 HIT 색.
- n=2 공고가 **추천(sky)**에서 HIT.
- n=4 공고에는 HIT 미표시.
- 리본이 회사명/지역 텍스트와 클릭 영역을 방해하지 않음(리본 클릭 시 카드가 열림).

- [ ] **Step 4: verification notes 기록**

아래 "Verification Notes"에 자동 검사 출력과 브라우저 결과를 기록한다.

---

## Verification Notes

- (체크포인트) server type-check: ✅ PASS (`pnpm --filter server check-types`, tsc -b 에러 0) — 2026-07-02
- API 집계 테스트: _pending_
- Web Vitest (job-hit, api-jobs): _pending_
- check-types / check / builds: _pending_
- 브라우저(/, /seeker, 데스크톱·모바일): _pending (사용자 확인)_

## Self-Review (spec coverage)

- Hit 기준(A/B, performance 없음, impressions=0 독립, 0 나눗셈, 상수 분리, metrics 계산) → Task 5.
- Seed profile n=1/2/4, now 기준 7일 분산, 고정날짜 만료 회피, deterministic UUID, 삭제/재생성, chat_start/contact_reveal 제외 → Task 1.
- 집계 API(다건 batch, impression/detail_view만, 7일, 이벤트 없음 0, N+1 없음) → Task 2.
- jobs.list performance 부착, impression 기록 이전 집계, 정렬/섹션 불변, getById 미확장 → Task 3.
- Web 타입/`performance?`/mapper 호환 → Task 4.
- VisualJobCard 전용 리본, organic 제외, tone 색, 코너 라벨, 높이 불변, 텍스트 공간, 클릭 비간섭, active/promotion 공존, HIT+인기 공고, 색상 단독 금지 → Task 5·6.
- 검증 명령·브라우저·notes → Task 7.
