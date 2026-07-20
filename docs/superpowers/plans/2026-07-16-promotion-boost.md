# 구인자 프로모션 UI 개편 + 끌어올리기(점프) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 광고 상품 구매(결제 완료) 공고를 하루 N회 목록 최상단으로 끌어올리는 기능을 만들고, 죽어 있는 구 프로모션 화면(`/employer/promotions`)을 "광고 관리" 화면으로 재구축한다.

**Architecture:** `job_post.boosted_at` + 신규 `job_boost_event` 테이블(A안). 노출 정렬 키를 `GREATEST(boosted_at, published_at) DESC`로 교체(리스팅 섹션+전체 목록만, 배너 제외). 일일 횟수는 KST 자정 이후 이벤트 카운트로 판정. 구 promotions 라우터·서비스는 제거하고 광고 상품 축으로 재작성하며, 수다방 광고 자격(isAdvertiser)도 광고 상품 축으로 전환한다.

**Tech Stack:** drizzle-orm(PostgreSQL), oRPC, Next.js App Router(typedRoutes), shadcn(base-ui port), vitest.

**스펙:** `docs/superpowers/specs/2026-07-16-promotion-boost-design.md` (확정 결정 8건 포함)

## Global Constraints

- **DB**: `db:push` 절대 금지. Claude는 `db:*` 스크립트 직접 실행 금지 — 마이그레이션 생성·적용은 사용자에게 요청한다. 이 브랜치 기준 신규 마이그레이션은 0016번이나 PR #24가 0016을 선점 중이므로 번호 충돌 시 재생성 필요.
- **의존성**: npm 라이브러리 추가 금지(KST 계산은 UTC+9 고정 수동 계산).
- **빌드/실행 금지**: `npm run build`·dev 서버 기동 금지. 검증은 vitest + `check-types`만. 시각 확인은 사용자(HMR).
- **apps/native 미변경**.
- **UI**: shadcn 컴포넌트 우선(`@bambi-app/ui/components`), 인라인 style 금지, 임의 px 금지(Tailwind 토큰), `rounded-none` 금지, 조건부 클래스는 `cn()`, base-ui라 커스텀 트리거는 `render` prop(asChild 아님), 모바일 반응형 필수. 상세는 `apps/web/CLAUDE.md`.
- **커밋**: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음). 다중 행 메시지는 temp 파일 + `git commit -F`(Bash는 Git Bash — PowerShell here-string 금지).
- **통합 테스트**: real DB 필요 — 워크트리에 `apps/server/.env`가 없으면 메인 체크아웃(`C:\Users\user\projects\bambi-app\apps\server\.env`)에서 복사(.gitignore됨). organization·member 시드는 `createdAt` 수동 지정 필수(default 없음).
- **테스트 실행 명령**: api는 `cd packages/api && npx vitest run <파일>`, web은 `cd apps/web && npx vitest run <파일>`. 타입체크는 `pnpm --filter @bambi-app/api check-types` / `pnpm --filter web check-types`.
- **작업 위치**: 워크트리 `C:\Users\user\projects\bambi-app\.claude\worktrees\promotion-boost`(브랜치 `worktree-promotion-boost`). 커밋 전 `pnpm install` 완료 상태여야 한다(이미 완료됨).

## 태스크 의존성

- Task 1(스키마) 커밋 후 **사용자가 마이그레이션을 생성·적용해야** Task 3~6의 통합 테스트가 돈다(신규 컬럼·테이블을 실 DB가 알아야 함). Task 2는 순수 로직이라 마이그레이션 없이 진행 가능.
- Task 4는 Task 2의 서비스 함수를 소비. Task 7은 Task 4의 API 응답 형태를 소비. Task 8은 Task 6의 입력 확장을 소비.

---

### Task 1: DB 스키마 — boostedAt·manualBoostsPerDay·job_boost_event

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (jobPost L269~282 부근, adProduct L424~457 부근, jobPromotionBoostEvent 정의(L402) 아래에 신규 테이블)
- Modify: `packages/db/src/index.ts` (스키마 재수출 목록 2곳)

**Interfaces:**
- Consumes: 기존 `jobPost`, `adProduct`, `organization`, `user` 테이블 정의
- Produces: `jobPost.boostedAt`(timestamp|null), `adProduct.manualBoostsPerDay`(int not null default 0), `jobBoostEvent` 테이블 — Task 2~6이 import

- [ ] **Step 1: jobPost에 boostedAt 추가**

`packages/db/src/schema/bambi.ts`의 jobPost 컬럼 중 `exposureEndsAt` 정의 바로 아래에 추가:

```ts
		exposureEndsAt: timestamp("exposure_ends_at"),
		// 마지막 끌어올림(점프) 시각. 노출 정렬 키 GREATEST(boosted_at, published_at)의 재료.
		boostedAt: timestamp("boosted_at"),
```

- [ ] **Step 2: adProduct에 manualBoostsPerDay 추가**

adProduct의 `priceOptions` 정의 바로 아래에 추가:

```ts
		// 이 상품을 구매한 공고가 하루(KST 자정 리셋)에 쓸 수 있는 수동 끌어올리기 횟수. 0 = 미제공.
		manualBoostsPerDay: integer("manual_boosts_per_day").default(0).notNull(),
```

- [ ] **Step 3: jobBoostEvent 테이블 추가**

`jobPromotionBoostEvent` 정의(구 시스템, 보존) 바로 아래에 추가:

```ts
// 광고 상품 축 끌어올리기 이력. 일일 사용량 판정은 (job_post_id, created_at) 카운트로 한다.
// boost_type은 1단계에선 'manual'만 쓰고 자동 점프(2단계) 확장을 대비한 필드다.
export const jobBoostEvent = pgTable(
	"job_boost_event",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		boostType: text("boost_type").default("manual").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("job_boost_event_job_post_created_at_idx").on(
			table.jobPostId,
			table.createdAt
		),
		index("job_boost_event_organization_id_idx").on(table.organizationId),
	]
);
```

- [ ] **Step 4: packages/db/src/index.ts 재수출 갱신**

`jobPromotionBoostEvent`를 import/export하는 두 목록(각각 L47, L85 부근)에 `jobBoostEvent`를 알파벳 순서에 맞춰 추가한다(관계 정의는 만들지 않는다 — 소비처가 전부 plain select).

- [ ] **Step 5: 타입체크로 검증**

Run: `pnpm --filter @bambi-app/db check-types` (스크립트 없으면 `cd packages/db && npx tsc --noEmit`)
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/index.ts
git commit -m "feat(db): 끌어올리기 스키마 추가 - job_post.boosted_at, ad_product.manual_boosts_per_day, job_boost_event 테이블"
```

- [ ] **Step 7: 마이그레이션 사용자 게이트 (컨트롤러 처리)**

Claude는 `db:generate`/`db:migrate`를 실행하지 않는다. 컨트롤러가 사용자에게 다음을 요청한다:
"워크트리(`.claude/worktrees/promotion-boost`)에서 `pnpm db:generate` 실행 후 생성된 SQL 확인, 이어서 `pnpm db:migrate`로 dev DB 적용 부탁드립니다." 적용 완료 응답 전에는 Task 3~6의 통합 테스트 스텝을 실행하지 않는다(작성까지는 가능). 생성된 마이그레이션 파일은 별도 커밋한다.

---

### Task 2: bambi-job-boost 서비스(순수 로직) + 단위 테스트

**Files:**
- Create: `packages/api/src/services/bambi-job-boost.ts`
- Test: `packages/api/src/services/bambi-job-boost.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수)
- Produces:
  - `getKstDayStart(now: Date): Date`
  - `type BoostIneligibleReason = "daily_limit_reached" | "exposure_expired" | "not_ad_job" | "not_publicly_visible" | "product_without_boost"`
  - `BOOST_INELIGIBLE_MESSAGES: Record<BoostIneligibleReason, string>`
  - `resolveBoostEligibility(input): { eligible: true } | { eligible: false; reason: BoostIneligibleReason }` — input은 `{ adProductId: string | null; exposureEndsAt: Date | null; manualBoostsPerDay: number; now: Date; paymentStatus: string; status: string; usedToday: number }`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/services/bambi-job-boost.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	BOOST_INELIGIBLE_MESSAGES,
	getKstDayStart,
	resolveBoostEligibility,
} from "./bambi-job-boost";

const FUTURE = new Date("2026-08-01T00:00:00Z");
const NOW = new Date("2026-07-16T05:00:00Z"); // KST 2026-07-16 14:00

const eligibleInput = {
	adProductId: "ad-1",
	exposureEndsAt: FUTURE,
	manualBoostsPerDay: 3,
	now: NOW,
	paymentStatus: "paid",
	status: "published",
	usedToday: 0,
};

describe("getKstDayStart", () => {
	it("returns KST midnight expressed in UTC (15:00 previous day)", () => {
		// KST 2026-07-16 14:00 → 그날 자정(KST 00:00) = UTC 2026-07-15 15:00
		expect(getKstDayStart(NOW).toISOString()).toBe("2026-07-15T15:00:00.000Z");
	});

	it("rolls to the next KST day at 15:00 UTC", () => {
		// UTC 16일 14:59 = KST 16일 23:59 → 자정은 15일 15:00Z
		expect(
			getKstDayStart(new Date("2026-07-16T14:59:59Z")).toISOString()
		).toBe("2026-07-15T15:00:00.000Z");
		// UTC 16일 15:00 = KST 17일 00:00 → 자정은 16일 15:00Z
		expect(
			getKstDayStart(new Date("2026-07-16T15:00:00Z")).toISOString()
		).toBe("2026-07-16T15:00:00.000Z");
	});
});

describe("resolveBoostEligibility", () => {
	it("allows a paid published ad job under its daily limit", () => {
		expect(resolveBoostEligibility(eligibleInput)).toEqual({ eligible: true });
	});

	it("rejects a job without an ad product", () => {
		expect(
			resolveBoostEligibility({ ...eligibleInput, adProductId: null })
		).toEqual({ eligible: false, reason: "not_ad_job" });
	});

	it("rejects unpaid or unpublished jobs", () => {
		expect(
			resolveBoostEligibility({ ...eligibleInput, paymentStatus: "unpaid" })
		).toEqual({ eligible: false, reason: "not_publicly_visible" });
		expect(
			resolveBoostEligibility({ ...eligibleInput, status: "pending_review" })
		).toEqual({ eligible: false, reason: "not_publicly_visible" });
	});

	it("rejects expired exposure but allows null exposureEndsAt", () => {
		expect(
			resolveBoostEligibility({
				...eligibleInput,
				exposureEndsAt: new Date("2026-07-01T00:00:00Z"),
			})
		).toEqual({ eligible: false, reason: "exposure_expired" });
		expect(
			resolveBoostEligibility({ ...eligibleInput, exposureEndsAt: null })
		).toEqual({ eligible: true });
	});

	it("rejects products without boosts and exhausted daily limits", () => {
		expect(
			resolveBoostEligibility({ ...eligibleInput, manualBoostsPerDay: 0 })
		).toEqual({ eligible: false, reason: "product_without_boost" });
		expect(
			resolveBoostEligibility({ ...eligibleInput, usedToday: 3 })
		).toEqual({ eligible: false, reason: "daily_limit_reached" });
	});

	it("has a Korean message for every reason", () => {
		for (const message of Object.values(BOOST_INELIGIBLE_MESSAGES)) {
			expect(message.length).toBeGreaterThan(0);
		}
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd packages/api && npx vitest run src/services/bambi-job-boost.test.ts`
Expected: FAIL — "Cannot find module './bambi-job-boost'"

- [ ] **Step 3: 구현**

`packages/api/src/services/bambi-job-boost.ts`:

```ts
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// Asia/Seoul 자정 경계. 한국은 DST가 없어 UTC+9 고정 오프셋 수동 계산으로 충분하다
// (라이브러리 추가 금지 제약).
export const getKstDayStart = (now: Date): Date => {
	const shifted = new Date(now.getTime() + KST_OFFSET_MS);
	shifted.setUTCHours(0, 0, 0, 0);
	return new Date(shifted.getTime() - KST_OFFSET_MS);
};

export type BoostIneligibleReason =
	| "daily_limit_reached"
	| "exposure_expired"
	| "not_ad_job"
	| "not_publicly_visible"
	| "product_without_boost";

export const BOOST_INELIGIBLE_MESSAGES: Record<BoostIneligibleReason, string> =
	{
		daily_limit_reached: "오늘 끌어올리기 횟수를 모두 사용했습니다.",
		exposure_expired: "광고 노출 기간이 만료되어 끌어올릴 수 없습니다.",
		not_ad_job: "광고 상품이 적용된 공고만 끌어올릴 수 있습니다.",
		not_publicly_visible: "공개 중(결제 완료·게시)인 공고만 끌어올릴 수 있습니다.",
		product_without_boost: "이 광고 상품에는 끌어올리기가 포함되어 있지 않습니다.",
	};

// 끌어올리기 자격: 광고 공고(adProductId 보유) AND 공개 게이트(published+paid) AND
// 노출 유효(exposureEndsAt null 또는 미래 — isExposureActive와 동일 판정) AND
// 상품이 점프 제공(manualBoostsPerDay > 0) AND 오늘 사용량이 한도 미만.
export const resolveBoostEligibility = ({
	adProductId,
	exposureEndsAt,
	manualBoostsPerDay,
	now,
	paymentStatus,
	status,
	usedToday,
}: {
	adProductId: string | null;
	exposureEndsAt: Date | null;
	manualBoostsPerDay: number;
	now: Date;
	paymentStatus: string;
	status: string;
	usedToday: number;
}): { eligible: true } | { eligible: false; reason: BoostIneligibleReason } => {
	if (!adProductId) {
		return { eligible: false, reason: "not_ad_job" };
	}

	if (status !== "published" || paymentStatus !== "paid") {
		return { eligible: false, reason: "not_publicly_visible" };
	}

	if (exposureEndsAt !== null && exposureEndsAt.getTime() <= now.getTime()) {
		return { eligible: false, reason: "exposure_expired" };
	}

	if (manualBoostsPerDay <= 0) {
		return { eligible: false, reason: "product_without_boost" };
	}

	if (usedToday >= manualBoostsPerDay) {
		return { eligible: false, reason: "daily_limit_reached" };
	}

	return { eligible: true };
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd packages/api && npx vitest run src/services/bambi-job-boost.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/services/bambi-job-boost.ts packages/api/src/services/bambi-job-boost.test.ts
git commit -m "feat(api): 끌어올리기 자격 판정·KST 자정 경계 순수 로직 추가"
```

---

### Task 3: 노출 정렬 키를 GREATEST(boosted_at, published_at)로 전환

**⚠️ 통합 테스트 실행은 Task 1 마이그레이션 적용 후에만 가능.**

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts:453` (getExposedJobs orderBy), `packages/api/src/routers/bambi/jobs.ts:475-478` (organic orderBy)
- Test: `packages/api/src/routers/bambi/jobs-list-boost-order.test.ts` (신규)

**Interfaces:**
- Consumes: `jobPost.boostedAt` (Task 1)
- Produces: 없음(공개 API 형태 불변 — 순서만 변경)

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/routers/bambi/jobs-list-boost-order.test.ts` 신규 작성. **픽스처는 `jobs-list-exposure.test.ts`의 패턴을 그대로 따른다**(dotenv로 `../../apps/server/.env` 로드, 동적 import, 고유 region으로 격리, organization `createdAt` 수동 지정, afterAll에서 생성 행 삭제). 시나리오:

```ts
// 픽스처: 같은 조직(verified)의 paid+published 공고 4건
//  - specialOld: exposureType special, publishedAt = now-2h, boostedAt = null
//  - specialNew: exposureType special, publishedAt = now-1h, boostedAt = null
//  - organicOld: exposureType standard, publishedAt = now-2h, boostedAt = null
//  - organicNew: exposureType standard, publishedAt = now-1h, boostedAt = null

describe("jobs.list boost ordering", () => {
	it("orders sections and organic by publishedAt when nothing is boosted", async () => {
		const result = await listForFixtureRegion();
		expect(result.sections.special.map((item) => item.id)).toEqual([
			fixture.specialNewId,
			fixture.specialOldId,
		]);
		expect(organicIds(result)).toEqual([
			fixture.organicNewId,
			fixture.organicOldId,
		]);
	});

	it("lifts a boosted job above newer publishedAt in its section and organic", async () => {
		const now = new Date();
		await db
			.update(jobPost)
			.set({ boostedAt: now })
			.where(eq(jobPost.id, fixture.specialOldId));
		await db
			.update(jobPost)
			.set({ boostedAt: now })
			.where(eq(jobPost.id, fixture.organicOldId));

		const result = await listForFixtureRegion();
		expect(result.sections.special.map((item) => item.id)).toEqual([
			fixture.specialOldId,
			fixture.specialNewId,
		]);
		expect(organicIds(result)).toEqual([
			fixture.organicOldId,
			fixture.organicNewId,
		]);
	});
});
```

(`listForFixtureRegion`은 `createProcedureClient(jobsRouter.list, ...)`를 seeker 컨텍스트로 호출하고 `region: fixture.region`으로 필터. `organicIds`는 `result.sections.organic`에서 픽스처 공고 id만 추출. 정확한 클라이언트 생성 코드는 `jobs-list-exposure.test.ts`에서 복사.)

- [ ] **Step 2: 테스트 실패 확인 (마이그레이션 적용 후)**

Run: `cd packages/api && npx vitest run src/routers/bambi/jobs-list-boost-order.test.ts`
Expected: FAIL — 두 번째 it에서 boosted 공고가 여전히 뒤에 정렬됨

- [ ] **Step 3: 정렬 키 구현**

`packages/api/src/routers/bambi/jobs.ts`의 list 핸들러 안, `getExposedJobs` 정의 직전에 정렬 키 상수 추가:

```ts
		// 노출 정렬 키: 끌어올린(boosted_at) 시각과 게시 시각 중 최신. Postgres GREATEST는
		// null을 무시하므로 미점프 공고는 publishedAt 그대로이고, 점프 뒤 재검수·재게시로
		// publishedAt이 더 최신이 되면 자동으로 최신 쪽을 따른다. 배너 쿼리에는 적용하지 않는다.
		const exposureRankSql = sql`greatest(${jobPost.boostedAt}, ${jobPost.publishedAt})`;
```

L453의 `.orderBy(desc(jobPost.publishedAt));` → `.orderBy(desc(exposureRankSql));`

L475-478의 organic orderBy:

```ts
					.orderBy(
						sql`case when ${employerOrganizationProfile.verificationStatus} = 'verified' then 0 else 1 end`,
						desc(exposureRankSql)
					)
```

`listAdBanners`(L622)와 `legacyList`(L582-585)는 변경하지 않는다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd packages/api && npx vitest run src/routers/bambi/jobs-list-boost-order.test.ts src/routers/bambi/jobs-list-exposure.test.ts`
Expected: 전부 PASS (기존 노출 테스트 회귀 없음)

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/jobs.ts packages/api/src/routers/bambi/jobs-list-boost-order.test.ts
git commit -m "feat(api): 노출 정렬을 GREATEST(boosted_at, published_at) 기준으로 전환 - 리스팅 섹션·전체 목록만, 배너 제외"
```

---

### Task 4: promotions 라우터 재작성 — listMyAds·boost, 구 코드 제거

**⚠️ 통합 테스트 실행은 Task 1 마이그레이션 적용 후에만 가능. Task 2 선행 필수.**

**Files:**
- Rewrite: `packages/api/src/routers/bambi/promotions.ts` (전체 교체)
- Delete: `packages/api/src/services/bambi-promotions.ts`, `packages/api/src/services/bambi-promotions.test.ts`
- Test: `packages/api/src/routers/bambi/promotions-boost.test.ts` (신규)

**Interfaces:**
- Consumes: Task 1의 `jobBoostEvent`·`adProduct.manualBoostsPerDay`, Task 2의 `getKstDayStart`/`resolveBoostEligibility`/`BOOST_INELIGIBLE_MESSAGES`, 기존 `requireActiveBambiProfile`/`requireEmployerPostingAccess`/`getAccessibleTeamPostScopes`
- Produces (Task 7이 소비):
  - `bambi.promotions.listMyAds` → `Array<{ jobPostId: string; title: string; status: string; paymentStatus: string; exposureType: string; exposureEndsAt: Date | null; publishedAt: Date | null; boostedAt: Date | null; adProductName: string | null; manualBoostsPerDay: number; boostsUsedToday: number; employerDisplayName: string; teamDisplayName: string | null }>`
  - `bambi.promotions.boost({ jobPostId })` → `{ boostedAt: Date; boostsUsedToday: number }` (자격 미달 시 BAD_REQUEST + `BOOST_INELIGIBLE_MESSAGES` 메시지)
  - 구 프로시저 listMine/createDraft/activateForManualPayment/pause 는 **삭제됨**

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`packages/api/src/routers/bambi/promotions-boost.test.ts` 신규. 픽스처는 `jobs-list-exposure.test.ts` 패턴 + 구인자 액세스용 시드(모두 `randomUUID()` 유일화, organization/member `createdAt: now` 수동 지정):

- `user`(employer) + `bambiProfile`(role employer, status active)
- `organization` + `member`(role "owner", `createdAt` 명시)
- `employerOrganizationProfile`(verificationStatus "verified")
- `adPlacement`(kind "listing") + `adProduct`(manualBoostsPerDay: 2, priceOptions `[{ amount: 10000, days: 7 }]`)
- 공고 3건: `adJobId`(published, paid, adProductId 연결, exposureEndsAt 미래), `unpaidAdJobId`(published, unpaid, adProductId 연결), `freeJobId`(published, paid, adProductId null)

프로시저 호출은 `createProcedureClient(promotionsRouter.boost, ...)` / `createProcedureClient(promotionsRouter.listMyAds, ...)`에 employer 컨텍스트. 테스트 케이스:

```ts
describe("promotions.boost", () => {
	it("boosts a paid published ad job and records an event", async () => {
		const result = await boostAs(fixture.employerUserId, fixture.adJobId);
		expect(result.boostsUsedToday).toBe(1);

		const [post] = await db
			.select({ boostedAt: jobPost.boostedAt })
			.from(jobPost)
			.where(eq(jobPost.id, fixture.adJobId));
		expect(post?.boostedAt).not.toBeNull();

		const events = await db
			.select({ id: jobBoostEvent.id, boostType: jobBoostEvent.boostType })
			.from(jobBoostEvent)
			.where(eq(jobBoostEvent.jobPostId, fixture.adJobId));
		expect(events).toHaveLength(1);
		expect(events[0]?.boostType).toBe("manual");
	});

	it("rejects when the daily limit is exhausted", async () => {
		await boostAs(fixture.employerUserId, fixture.adJobId); // 2회째(위 테스트 포함)
		await expect(
			boostAs(fixture.employerUserId, fixture.adJobId)
		).rejects.toMatchObject({
			message: "오늘 끌어올리기 횟수를 모두 사용했습니다.",
		});
	});

	it("rejects unpaid ad jobs and non-ad jobs", async () => {
		await expect(
			boostAs(fixture.employerUserId, fixture.unpaidAdJobId)
		).rejects.toMatchObject({
			message: "공개 중(결제 완료·게시)인 공고만 끌어올릴 수 있습니다.",
		});
		await expect(
			boostAs(fixture.employerUserId, fixture.freeJobId)
		).rejects.toMatchObject({
			message: "광고 상품이 적용된 공고만 끌어올릴 수 있습니다.",
		});
	});
});

describe("promotions.listMyAds", () => {
	it("lists only ad jobs with product name and today's usage", async () => {
		const ads = await listMyAdsAs(fixture.employerUserId);
		const ids = ads.map((ad) => ad.jobPostId);
		expect(ids).toContain(fixture.adJobId);
		expect(ids).toContain(fixture.unpaidAdJobId);
		expect(ids).not.toContain(fixture.freeJobId);

		const adJob = ads.find((ad) => ad.jobPostId === fixture.adJobId);
		expect(adJob?.manualBoostsPerDay).toBe(2);
		expect(adJob?.boostsUsedToday).toBe(2);
		expect(adJob?.adProductName).toBeTruthy();
	});
});
```

(테스트 파일은 위→아래 순차 실행 전제를 명시 주석으로 남긴다: boost 카운트가 케이스 간 누적됨. `boostAs`/`listMyAdsAs`는 createProcedureClient 래퍼 헬퍼.)

- [ ] **Step 2: 테스트 실패 확인 (마이그레이션 적용 후)**

Run: `cd packages/api && npx vitest run src/routers/bambi/promotions-boost.test.ts`
Expected: FAIL — `promotionsRouter.listMyAds` undefined

- [ ] **Step 3: promotions.ts 전체 재작성**

기존 파일을 아래로 교체(구 import·프로시저 전부 제거):

```ts
import { db } from "@bambi-app/db";
import { member, team, teamMember } from "@bambi-app/db/schema/auth";
import {
	adProduct,
	employerOrganizationProfile,
	employerTeamProfile,
	jobBoostEvent,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	or,
	type SQL,
} from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireEmployerPostingAccess,
} from "../../services/bambi-authz";
import { getAccessibleTeamPostScopes } from "../../services/bambi-job-access";
import {
	BOOST_INELIGIBLE_MESSAGES,
	getKstDayStart,
	resolveBoostEligibility,
} from "../../services/bambi-job-boost";

// 구 jobPromotionCampaign 축 라우터를 광고 상품 축으로 재작성했다.
// 광고 목록(listMyAds)과 수동 끌어올리기(boost)만 제공한다.
export const promotionsRouter = {
	listMyAds: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		if (profile.role === "job_seeker") {
			throw new ORPCError("FORBIDDEN");
		}

		const organizationMemberships = await db
			.select({
				organizationId: member.organizationId,
				role: member.role,
			})
			.from(member)
			.where(eq(member.userId, profile.userId));
		const teamMemberships = await db
			.select({
				organizationId: team.organizationId,
				teamId: teamMember.teamId,
			})
			.from(teamMember)
			.innerJoin(team, eq(teamMember.teamId, team.id))
			.where(eq(teamMember.userId, profile.userId));
		const organizationIds = organizationMemberships.map(
			(membership) => membership.organizationId
		);
		const manageableOrganizationIds = organizationMemberships
			.filter(
				(membership) =>
					membership.role === "owner" || membership.role === "admin"
			)
			.map((membership) => membership.organizationId);
		const accessibleTeamPostScopes = getAccessibleTeamPostScopes({
			organizationIds,
			teamMemberships,
		});
		const accessFilters: SQL[] = [];

		if (manageableOrganizationIds.length > 0) {
			accessFilters.push(
				inArray(jobPost.organizationId, manageableOrganizationIds)
			);
		}

		for (const scope of accessibleTeamPostScopes) {
			const teamAccessFilter = and(
				eq(jobPost.organizationId, scope.organizationId),
				eq(jobPost.teamId, scope.teamId)
			);

			if (teamAccessFilter) {
				accessFilters.push(teamAccessFilter);
			}
		}

		if (accessFilters.length === 0) {
			return [];
		}

		const rows = await db
			.select({
				adProductName: adProduct.name,
				boostedAt: jobPost.boostedAt,
				employerDisplayName: employerOrganizationProfile.displayName,
				exposureEndsAt: jobPost.exposureEndsAt,
				exposureType: jobPost.exposureType,
				jobPostId: jobPost.id,
				manualBoostsPerDay: adProduct.manualBoostsPerDay,
				paymentStatus: jobPost.paymentStatus,
				publishedAt: jobPost.publishedAt,
				status: jobPost.status,
				teamDisplayName: employerTeamProfile.displayName,
				title: jobPost.title,
			})
			.from(jobPost)
			.innerJoin(adProduct, eq(jobPost.adProductId, adProduct.id))
			.innerJoin(
				employerOrganizationProfile,
				eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
			)
			.leftJoin(
				employerTeamProfile,
				eq(jobPost.teamId, employerTeamProfile.teamId)
			)
			.where(and(or(...accessFilters), isNotNull(jobPost.adProductId)))
			.orderBy(desc(jobPost.updatedAt));

		if (rows.length === 0) {
			return [];
		}

		const dayStart = getKstDayStart(new Date());
		const usedRows = await db
			.select({ jobPostId: jobBoostEvent.jobPostId, used: count() })
			.from(jobBoostEvent)
			.where(
				and(
					inArray(
						jobBoostEvent.jobPostId,
						rows.map((row) => row.jobPostId)
					),
					gte(jobBoostEvent.createdAt, dayStart)
				)
			)
			.groupBy(jobBoostEvent.jobPostId);
		const usedByJobId = new Map(
			usedRows.map((row) => [row.jobPostId, row.used])
		);

		return rows.map((row) => ({
			...row,
			boostsUsedToday: usedByJobId.get(row.jobPostId) ?? 0,
		}));
	}),

	boost: protectedProcedure
		.input(z.object({ jobPostId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const [post] = await db
				.select({
					adProductId: jobPost.adProductId,
					exposureEndsAt: jobPost.exposureEndsAt,
					manualBoostsPerDay: adProduct.manualBoostsPerDay,
					organizationId: jobPost.organizationId,
					paymentStatus: jobPost.paymentStatus,
					status: jobPost.status,
					teamId: jobPost.teamId,
				})
				.from(jobPost)
				.leftJoin(adProduct, eq(jobPost.adProductId, adProduct.id))
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!post) {
				throw new ORPCError("NOT_FOUND");
			}

			const actor = await requireEmployerPostingAccess({
				organizationId: post.organizationId,
				teamId: post.teamId,
				session: context.session,
			});

			const now = new Date();
			const dayStart = getKstDayStart(now);
			const boostsUsedToday = await db.transaction(async (tx) => {
				// jobPost 행 잠금이 동시 클릭의 직렬화 지점: 카운트→검증→기록이
				// 한 번에 한 요청씩 진행돼 일일 한도 초과 사용을 막는다.
				await tx
					.select({ id: jobPost.id })
					.from(jobPost)
					.where(eq(jobPost.id, input.jobPostId))
					.for("update");

				const [usage] = await tx
					.select({ used: count() })
					.from(jobBoostEvent)
					.where(
						and(
							eq(jobBoostEvent.jobPostId, input.jobPostId),
							gte(jobBoostEvent.createdAt, dayStart)
						)
					);
				const usedToday = usage?.used ?? 0;
				const verdict = resolveBoostEligibility({
					adProductId: post.adProductId,
					exposureEndsAt: post.exposureEndsAt,
					manualBoostsPerDay: post.manualBoostsPerDay ?? 0,
					now,
					paymentStatus: post.paymentStatus,
					status: post.status,
					usedToday,
				});

				if (!verdict.eligible) {
					throw new ORPCError("BAD_REQUEST", {
						message: BOOST_INELIGIBLE_MESSAGES[verdict.reason],
					});
				}

				await tx.insert(jobBoostEvent).values({
					actorUserId: actor.userId,
					boostType: "manual",
					jobPostId: input.jobPostId,
					organizationId: post.organizationId,
				});
				await tx
					.update(jobPost)
					.set({ boostedAt: now })
					.where(eq(jobPost.id, input.jobPostId));

				return usedToday + 1;
			});

			return { boostedAt: now, boostsUsedToday };
		}),
};
```

(주의: `requireEmployerPostingAccess`가 반환하는 actor에 `userId`가 있는지 구 코드(L326 `actor.userId`)와 동일하게 확인. drizzle `.for("update")`가 이 버전에서 지원되는지 확인하고, 미지원이면 `sql`select ... for update`` 대신 **트랜잭션 첫 문장으로 `tx.update(jobPost).set({ boostedAt: now }).where(...)`를 실행해 행 잠금을 잡고**, 이어서 카운트·검증하고 미달 시 throw로 롤백하는 구성으로 대체한다 — 결과는 동일하다.)

- [ ] **Step 4: 구 서비스 삭제**

```bash
git rm packages/api/src/services/bambi-promotions.ts packages/api/src/services/bambi-promotions.test.ts
```

`bambi-promotions` import가 더 없는지 확인: `grep -rn "bambi-promotions" packages/` → 결과 없음이어야 함.

- [ ] **Step 5: 테스트·타입체크 통과 확인**

Run: `cd packages/api && npx vitest run src/routers/bambi/promotions-boost.test.ts && pnpm --filter @bambi-app/api check-types`
Expected: PASS. (⚠️ apps/web은 이 시점에 promotions.listMine 참조로 타입이 깨진 상태 — Task 7에서 해소. web 타입체크는 여기서 돌리지 않는다.)

- [ ] **Step 6: 커밋**

```bash
git add -A packages/api
git commit -m "feat(api): promotions 라우터를 광고 상품 축으로 재작성 - listMyAds·boost 추가, 구 캠페인 프로시저·bambi-promotions 서비스 제거"
```

---

### Task 5: 수다방 광고 자격(isAdvertiser)을 광고 상품 축으로 전환

**⚠️ 통합 테스트 실행은 Task 1 마이그레이션 적용 후에만 가능.**

**Files:**
- Rewrite: `packages/api/src/services/bambi-advertiser.ts`
- Rewrite: `packages/api/src/services/bambi-advertiser.test.ts`
- Modify: `packages/api/src/routers/bambi/onboarding.ts:20,186`
- Modify: `packages/api/src/routers/bambi/moderation.ts` (setJobPostPayment 단건 ~L748-760, 벌크 ~L858-900)

**Interfaces:**
- Consumes: `jobPost`(adProductId·paymentStatus·status·exposureEndsAt), `member`, `bambiProfile`
- Produces: `hasActiveAdExposure({ now, userId }): Promise<boolean>` (구 `hasActiveAdvertiserCampaign` 대체), `syncAdvertiserFlagForOrganization({ now, organizationId })` (시그니처 불변, 판정만 교체), `isAdvertiserEligibleRole`·`ADVERTISER_MEMBER_ROLES` 불변

- [ ] **Step 1: 서비스 재작성**

`bambi-advertiser.ts`에서 `jobPromotionCampaign` import를 `jobPost`로 바꾸고 판정을 교체:

```ts
import { db } from "@bambi-app/db";
import { member } from "@bambi-app/db/schema/auth";
import { bambiProfile, jobPost } from "@bambi-app/db/schema/bambi";
import { and, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";

// 수다방 "광고 중 업소" 자격을 부여하는 조직 멤버 역할: 소유자·관리자만.
export const ADVERTISER_MEMBER_ROLES = ["owner", "admin"] as const;

export const isAdvertiserEligibleRole = (
	role: string | null | undefined
): boolean => role === "owner" || role === "admin";

// 유저가 owner/admin으로 속한 조직 중, 광고 상품이 적용되고(adProductId 보유) 실제
// 공개 중(published AND paid)이며 노출이 유효(exposureEndsAt null 또는 미래)한 공고를
// 하나라도 가진 곳이 있으면 true. 만료는 조회 시 파생 처리한다(스케줄러 없음).
// 구 jobPromotionCampaign 축 판정을 광고 상품 축으로 전환했다(2026-07-16 스펙).
export const hasActiveAdExposure = async ({
	now,
	userId,
}: {
	now: Date;
	userId: string;
}): Promise<boolean> => {
	const [row] = await db
		.select({ jobPostId: jobPost.id })
		.from(jobPost)
		.innerJoin(
			member,
			and(
				eq(member.organizationId, jobPost.organizationId),
				eq(member.userId, userId),
				inArray(member.role, [...ADVERTISER_MEMBER_ROLES])
			)
		)
		.where(
			and(
				isNotNull(jobPost.adProductId),
				eq(jobPost.status, "published"),
				eq(jobPost.paymentStatus, "paid"),
				or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
			)
		)
		.limit(1);

	return Boolean(row);
};

// 광고 상태가 바뀐 조직의 owner/admin 멤버들의 is_advertiser 캐시를 재계산해 동기화한다.
// 각 멤버는 여러 조직에 속할 수 있으므로 그 멤버의 전체 소속 기준으로 다시 판정한다.
export const syncAdvertiserFlagForOrganization = async ({
	now,
	organizationId,
}: {
	now: Date;
	organizationId: string;
}): Promise<void> => {
	const members = await db
		.select({ userId: member.userId })
		.from(member)
		.where(
			and(
				eq(member.organizationId, organizationId),
				inArray(member.role, [...ADVERTISER_MEMBER_ROLES])
			)
		);

	for (const { userId } of members) {
		const isAdvertiser = await hasActiveAdExposure({ now, userId });
		await db
			.update(bambiProfile)
			.set({ isAdvertiser })
			.where(eq(bambiProfile.userId, userId));
	}
};
```

- [ ] **Step 2: onboarding.ts 소비처 교체**

L20: `import { hasActiveAdvertiserCampaign } from "../../services/bambi-advertiser";` → `import { hasActiveAdExposure } from "../../services/bambi-advertiser";`
L186: `? await hasActiveAdvertiserCampaign({ now, userId })` → `? await hasActiveAdExposure({ now, userId })`

- [ ] **Step 3: 결제 확인 시 자격 캐시 동기화 훅 추가**

`moderation.ts`의 setJobPostPayment **단건 핸들러**(L748-760 부근): 결제 상태 update 후 반환 전에 추가 — update 대상 행의 `organizationId`를 기존 select(existing)에 포함시키고:

```ts
			await syncAdvertiserFlagForOrganization({
				now,
				organizationId: existing.organizationId,
			});
```

**벌크 핸들러**(L858-900 부근): 트랜잭션 완료 후 갱신된 공고들의 organizationId 유니크 집합에 대해 동일 호출을 반복. 파일 상단에 import 추가:

```ts
import { syncAdvertiserFlagForOrganization } from "../../services/bambi-advertiser";
```

(status 변경(approve/hide 등) 훅은 이번 범위에서 추가하지 않는다 — onboarding.getMine이 매 요청 라이브 판정하므로 자격의 권위값은 항상 정확하고, 캐시는 결제 전환 시점에만 갱신한다. 스펙 §2 참조.)

- [ ] **Step 4: advertiser 테스트 재작성**

`bambi-advertiser.test.ts`의 캠페인 시드를 광고 공고 시드로 교체: `adPlacement`+`adProduct` 생성 → `jobPost`(adProductId, status published, paymentStatus paid, exposureEndsAt 미래) 생성. 기존 테스트 구조(활성→true, 만료→false, 역할 member→false, sync 후 bambiProfile.isAdvertiser true) 유지하되 `hasActiveAdExposure` 호출로 교체. 추가 케이스: `paymentStatus unpaid → false`.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd packages/api && npx vitest run src/services/bambi-advertiser.test.ts && pnpm --filter @bambi-app/api check-types`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/api/src/services/bambi-advertiser.ts packages/api/src/services/bambi-advertiser.test.ts packages/api/src/routers/bambi/onboarding.ts packages/api/src/routers/bambi/moderation.ts
git commit -m "feat(api): 수다방 광고 자격을 광고 상품 축으로 전환 - hasActiveAdExposure 판정 교체, 결제 확인 시 캐시 동기화"
```

---

### Task 6: 광고 상품 CRUD에 manualBoostsPerDay 입력 추가

**⚠️ 통합 테스트 실행은 Task 1 마이그레이션 적용 후에만 가능.**

**Files:**
- Modify: `packages/api/src/routers/bambi/ad-products.ts:55-76`
- Test: `packages/api/src/routers/bambi/ad-products.test.ts` (기존 파일 확장)

**Interfaces:**
- Consumes: Task 1의 `adProduct.manualBoostsPerDay`
- Produces: `adProducts.createProduct`/`updateProduct` 입력에 `manualBoostsPerDay?: number` — Task 8의 폼이 소비. `getCatalog`/`listCatalogAdmin` 응답에는 컬럼이 자동 포함(db.query 전체 행 반환).

- [ ] **Step 1: 실패하는 테스트 추가**

`ad-products.test.ts`의 기존 픽스처·클라이언트 패턴을 따라 케이스 추가:

```ts
	it("persists manualBoostsPerDay on create and update", async () => {
		const created = await createProductAs(adminUserId, {
			// 기존 케이스와 동일한 필수 필드 + ↓
			manualBoostsPerDay: 3,
		});
		expect(created.manualBoostsPerDay).toBe(3);

		const updated = await updateProductAs(adminUserId, {
			id: created.id,
			manualBoostsPerDay: 5,
		});
		expect(updated.manualBoostsPerDay).toBe(5);
	});
```

(헬퍼 이름·필수 필드는 기존 테스트 파일의 실제 형태에 맞춘다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd packages/api && npx vitest run src/routers/bambi/ad-products.test.ts`
Expected: FAIL — zod가 unknown key를 strip해 `manualBoostsPerDay`가 0으로 남음

- [ ] **Step 3: zod 입력 확장**

`createProductInput`에 추가: `manualBoostsPerDay: z.number().int().min(0).default(0),`
`updateProductInput`에 추가: `manualBoostsPerDay: z.number().int().min(0).optional(),`
(insert/update는 input 스프레드라 통과 코드는 추가 변경 없음)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd packages/api && npx vitest run src/routers/bambi/ad-products.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/ad-products.ts packages/api/src/routers/bambi/ad-products.test.ts
git commit -m "feat(api): 광고 상품 CRUD에 일일 끌어올리기 횟수(manualBoostsPerDay) 입력 추가"
```

---

### Task 7: 광고 관리 페이지 재구축 + 대시보드·링크 갱신 (web)

**Files:**
- Rewrite: `apps/web/src/app/employer/promotions/page.tsx` (전체 교체)
- Modify: `apps/web/src/app/employer/page.tsx` (L75-90 요약, L105-110 퀵링크, L318-326 쿼리, L346 무효화, L505 라벨과 그 주변 표시부)
- Modify: `apps/web/src/app/employer/analytics/page.tsx:122` 부근 링크 라벨
- Test: `apps/web/src/app/employer/promotions/page.test.ts` (신규, 소스 단언 방식)

**Interfaces:**
- Consumes: Task 4의 `promotions.listMyAds`/`promotions.boost`, 기존 `getJobDisplayStatus`/`EXPOSURE_TYPE_LABELS`(`@/lib/bambi/exposure`), `formatDate`/`formatDateTime`(`@/lib/bambi-format`), `PageShell`/`StatusBadge`/`EmptyState`/`Loader`
- Produces: 없음(리프 화면)

- [ ] **Step 1: 실패하는 소스 단언 테스트 작성**

`apps/web/src/app/employer/promotions/page.test.ts` (기존 `ad-product-form.test.ts`의 fs 소스 단언 스타일):

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
	path.join(import.meta.dirname, "page.tsx"),
	"utf8"
);

describe("employer ads management page", () => {
	it("uses the new ad-axis procedures instead of legacy campaigns", () => {
		expect(source).toContain("promotions.listMyAds");
		expect(source).toContain("promotions.boost");
		// jobs.listMine 무효화는 정상 — 금지 대상은 구 promotions.listMine뿐이다
		expect(source).not.toContain("promotions.listMine");
		expect(source).not.toContain("activateForManualPayment");
	});

	it("titles the screen 광고 관리 and derives status from the public gate", () => {
		expect(source).toContain('title="광고 관리"');
		expect(source).toContain("getJobDisplayStatus");
	});

	it("gates the boost button on publish, payment, exposure and daily limit", () => {
		expect(source).toContain('status === "published"');
		expect(source).toContain('paymentStatus === "paid"');
		expect(source).toContain("remainingToday > 0");
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/web && npx vitest run src/app/employer/promotions/page.test.ts`
Expected: FAIL (구 페이지 소스)

- [ ] **Step 3: 페이지 전체 재작성**

`apps/web/src/app/employer/promotions/page.tsx`를 아래로 교체:

```tsx
"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import { formatDate, formatDateTime } from "@/lib/bambi-format";
import {
	EXPOSURE_TYPE_LABELS,
	type ExposureType,
	getJobDisplayStatus,
} from "@/lib/bambi/exposure";
import { orpc } from "@/utils/orpc";

interface AdListItem {
	adProductName: null | string;
	boostedAt: Date | null | string;
	boostsUsedToday: number;
	employerDisplayName: string;
	exposureEndsAt: Date | null | string;
	exposureType: string;
	jobPostId: string;
	manualBoostsPerDay: number;
	paymentStatus: string;
	publishedAt: Date | null | string;
	status: string;
	teamDisplayName: null | string;
	title: string;
}

const adStatusGroups = [
	{ id: "all", label: "전체" },
	{ id: "active", label: "진행 중" },
	{ id: "pending_payment", label: "결제 대기" },
	{ id: "expired", label: "만료" },
] as const;

type AdStatusGroupId = (typeof adStatusGroups)[number]["id"];

const isExposureActive = (
	exposureEndsAt: Date | null | string,
	now: number
): boolean =>
	exposureEndsAt === null || new Date(exposureEndsAt).getTime() > now;

// 탭 분류: 노출 만료가 최우선(과거 결제 이력이 있어야 만료가 생김), 그다음 미결제,
// 공개 중 광고가 "진행 중". 검수 대기·반려·숨김·임시 저장은 "전체"에서만 보인다.
const getAdGroupId = (
	ad: AdListItem,
	now: number
): "other" | Exclude<AdStatusGroupId, "all"> => {
	if (ad.exposureEndsAt !== null && !isExposureActive(ad.exposureEndsAt, now)) {
		return "expired";
	}

	if (ad.paymentStatus !== "paid") {
		return "pending_payment";
	}

	if (ad.status === "published") {
		return "active";
	}

	return "other";
};

function AdCard({
	ad,
	isBoostPending,
	onBoost,
}: {
	ad: AdListItem;
	isBoostPending: boolean;
	onBoost: (jobPostId: string) => void;
}) {
	const now = Date.now();
	const displayStatus = getJobDisplayStatus({
		paymentStatus: ad.paymentStatus,
		status: ad.status,
	});
	const remainingToday = Math.max(
		0,
		ad.manualBoostsPerDay - ad.boostsUsedToday
	);
	const canBoost =
		ad.status === "published" &&
		ad.paymentStatus === "paid" &&
		isExposureActive(ad.exposureEndsAt, now) &&
		remainingToday > 0;

	return (
		<article className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
			<div className="flex min-w-0 flex-col gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<StatusBadge tone={displayStatus.tone}>
						{displayStatus.label}
					</StatusBadge>
					<StatusBadge tone="default">
						{EXPOSURE_TYPE_LABELS[ad.exposureType as ExposureType] ??
							ad.exposureType}
					</StatusBadge>
					{ad.adProductName ? (
						<StatusBadge tone="default">{ad.adProductName}</StatusBadge>
					) : null}
				</div>
				<div>
					<h2 className="break-words font-semibold text-base">{ad.title}</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						{ad.employerDisplayName}
						{ad.teamDisplayName ? ` · ${ad.teamDisplayName}` : ""}
					</p>
				</div>
				<dl className="grid gap-3 text-sm sm:grid-cols-3">
					<div>
						<dt className="text-muted-foreground text-xs">노출 마감</dt>
						<dd className="mt-1">
							{ad.exposureEndsAt ? (
								formatDate(ad.exposureEndsAt)
							) : (
								<span className="text-muted-foreground">-</span>
							)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">오늘 끌어올리기</dt>
						<dd
							className={cn(
								"mt-1",
								ad.manualBoostsPerDay > 0 &&
									remainingToday === 0 &&
									"text-muted-foreground"
							)}
						>
							{ad.manualBoostsPerDay > 0
								? `남은 ${remainingToday}회 / 일일 ${ad.manualBoostsPerDay}회`
								: "미포함 상품"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">최근 끌어올림</dt>
						<dd className="mt-1">
							{ad.boostedAt ? formatDateTime(ad.boostedAt) : "없음"}
						</dd>
					</div>
				</dl>
			</div>
			<div className="flex flex-wrap gap-2 lg:justify-end">
				{ad.manualBoostsPerDay > 0 ? (
					<Button
						disabled={!canBoost || isBoostPending}
						onClick={() => onBoost(ad.jobPostId)}
						type="button"
					>
						끌어올리기
					</Button>
				) : (
					<span className="self-center text-muted-foreground text-sm">
						이 상품은 끌어올리기 미포함
					</span>
				)}
				<Link
					className={buttonVariants({ variant: "outline" })}
					href={`/employer/jobs/${ad.jobPostId}/edit` as Route}
				>
					공고 수정
				</Link>
			</div>
		</article>
	);
}

export default function EmployerAdsPage() {
	const queryClient = useQueryClient();
	const [selectedGroupId, setSelectedGroupId] = useState<AdStatusGroupId>("all");
	const adsQuery = useQuery(orpc.bambi.promotions.listMyAds.queryOptions());
	const ads: AdListItem[] = adsQuery.data ?? [];
	const now = Date.now();
	const visibleAds =
		selectedGroupId === "all"
			? ads
			: ads.filter((ad) => getAdGroupId(ad, now) === selectedGroupId);

	const boostMutation = useMutation(
		orpc.bambi.promotions.boost.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "끌어올리기를 처리하지 못했습니다.");
			},
			onSuccess: async () => {
				toast.success("공고를 끌어올렸습니다.");
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.promotions.listMyAds.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.jobs.listMine.queryKey(),
					}),
				]);
			},
		})
	);

	if (adsQuery.isLoading) {
		return <Loader />;
	}

	if (adsQuery.isError) {
		return (
			<PageShell
				description="광고 공고 정보를 불러오지 못했습니다."
				title="광고 관리"
			>
				<EmptyState
					action={
						<Button onClick={() => adsQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 조직 권한을 확인한 뒤 다시 시도해 주세요."
					title="광고를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	let content: React.ReactNode;

	if (ads.length === 0) {
		content = (
			<EmptyState
				action={
					<Link className={buttonVariants()} href="/employer/ad-guide">
						광고 상품 보기
					</Link>
				}
				description="공고에 광고 상품을 적용하면 노출 현황과 끌어올리기를 이곳에서 관리할 수 있습니다."
				title="운영 중인 광고가 없습니다"
			/>
		);
	} else if (visibleAds.length === 0) {
		content = (
			<EmptyState
				description="선택한 상태에 해당하는 광고가 없습니다."
				title="표시할 광고가 없습니다"
			/>
		);
	} else {
		content = (
			<Card aria-label="광고 공고 목록">
				<CardContent className="divide-y p-0">
					{visibleAds.map((ad) => (
						<AdCard
							ad={ad}
							isBoostPending={boostMutation.isPending}
							key={ad.jobPostId}
							onBoost={(jobPostId) => boostMutation.mutate({ jobPostId })}
						/>
					))}
				</CardContent>
			</Card>
		);
	}

	const activeCount = ads.filter(
		(ad) => getAdGroupId(ad, now) === "active"
	).length;

	return (
		<PageShell
			description="광고 상품이 적용된 공고의 노출 상태와 오늘의 끌어올리기 횟수를 관리합니다."
			title="광고 관리"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="m-0 text-muted-foreground text-sm">
					진행 중 {activeCount}개 · 전체 {ads.length}개
				</p>
				<Link
					className={buttonVariants({ variant: "outline" })}
					href="/employer"
				>
					공고 관리
				</Link>
			</div>
			<Tabs
				onValueChange={(value) =>
					setSelectedGroupId(value as AdStatusGroupId)
				}
				value={selectedGroupId}
			>
				<TabsList className="max-w-full flex-wrap">
					{adStatusGroups.map((group) => (
						<TabsTrigger key={group.id} value={group.id}>
							{group.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{content}
		</PageShell>
	);
}
```

(주의: `/employer/ad-guide` 경로가 실재하는지 확인 — 광고 안내 화면의 실제 라우트로 맞춘다. typedRoutes라 잘못된 경로는 타입 에러로 드러난다. `EXPOSURE_TYPE_LABELS`의 키 타입 인덱싱이 strict 모드에서 에러면 `?? ad.exposureType` 형태 유지를 위해 `as ExposureType` 캐스팅을 쓴다.)

- [ ] **Step 4: employer 대시보드 갱신**

`apps/web/src/app/employer/page.tsx`:

L75-90의 인터페이스·요약 함수를 교체:

```tsx
interface AdSummaryItem {
	boostsUsedToday: number;
	exposureEndsAt: Date | null | string;
	manualBoostsPerDay: number;
	paymentStatus: string;
	status: string;
}

const getAdSummary = (ads: AdSummaryItem[], now: number) => {
	const isActive = (ad: AdSummaryItem) =>
		ad.status === "published" &&
		ad.paymentStatus === "paid" &&
		(ad.exposureEndsAt === null ||
			new Date(ad.exposureEndsAt).getTime() > now);

	return {
		activeCount: ads.filter(isActive).length,
		pendingCount: ads.filter((ad) => ad.paymentStatus !== "paid").length,
		remainingBoostCount: ads
			.filter(isActive)
			.reduce(
				(total, ad) =>
					total + Math.max(0, ad.manualBoostsPerDay - ad.boostsUsedToday),
				0
			),
	};
};
```

- L318-321: `orpc.bambi.promotions.listMine.queryOptions()` → `orpc.bambi.promotions.listMyAds.queryOptions()`
- L326: `getPromotionSummary(promotionsQuery.data ?? [])` → `getAdSummary(promotionsQuery.data ?? [], Date.now())`
- L346: 무효화 queryKey도 `listMyAds`로 교체
- L105-110 퀵링크: `label: "프로모션 관리"` → `label: "광고 관리"` (href·아이콘·설명 유지)
- L505 부근: `<dt>진행 중인 프로모션</dt>` → `진행 중인 광고`. 주변에 "남은 끌어올리기" 표기가 있으면 "오늘 남은 끌어올리기"로 갱신. L265 삭제 경고 문구의 "프로모션·성과 기록" → "광고·성과 기록".

- [ ] **Step 5: analytics 링크 라벨 갱신**

`apps/web/src/app/employer/analytics/page.tsx:122` 부근 `/employer/promotions` 링크의 표시 텍스트가 "프로모션"을 포함하면 "광고 관리"로 교체(링크 경로는 유지).

- [ ] **Step 6: 테스트·타입체크 통과 확인**

Run: `cd apps/web && npx vitest run src/app/employer/promotions/page.test.ts && pnpm --filter web check-types`
Expected: PASS — web 전역에서 `promotions.listMine` 잔존 참조가 있으면 타입 에러로 드러나므로 함께 제거

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/app/employer/promotions apps/web/src/app/employer/page.tsx apps/web/src/app/employer/analytics/page.tsx
git commit -m "feat(web): 프로모션 관리를 광고 관리 화면으로 재구축 - listMyAds 목록·끌어올리기 버튼·상태 탭, 대시보드 요약을 광고 축으로 전환"
```

---

### Task 8: 상품 폼 일일 끌어올리기 입력 + 광고 안내 표기 (web)

**Files:**
- Modify: `apps/web/src/components/bambi/ad-product-form.tsx`
- Modify: `apps/web/src/app/moderator/ad-products/[placementId]/new/page.tsx:27-35`
- Modify: `apps/web/src/app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx` (initialValue 매핑 + mutate 페이로드)
- Modify: `apps/web/src/components/bambi/screens/employer-ad-guide.tsx` (상품 카드 tagline/benefits 부근)
- Test: `apps/web/src/components/bambi/ad-product-form.test.ts` (확장)

**Interfaces:**
- Consumes: Task 6의 `createProduct`/`updateProduct` 입력 `manualBoostsPerDay`, getCatalog 응답의 `manualBoostsPerDay`
- Produces: `AdProductDraft.manualBoostsPerDay: number`

- [ ] **Step 1: 실패하는 테스트 추가**

`ad-product-form.test.ts`에 추가:

```ts
	it("collects manualBoostsPerDay with the zero-clearable input pattern", () => {
		const source = readComponent("ad-product-form.tsx");
		expect(source).toContain("manualBoostsPerDay: number;");
		expect(source).toContain(
			'value={manualBoostsPerDay === 0 ? "" : manualBoostsPerDay}'
		);
	});
```

Run: `cd apps/web && npx vitest run src/components/bambi/ad-product-form.test.ts`
Expected: FAIL

- [ ] **Step 2: 폼 구현**

`ad-product-form.tsx`:
- `AdProductDraft`에 `manualBoostsPerDay: number;` 추가
- state 추가(previewTemplate state 아래):

```tsx
	const [manualBoostsPerDay, setManualBoostsPerDay] = useState(
		initialValue?.manualBoostsPerDay ?? 0
	);
```

- 가격 옵션 섹션 아래에 입력 추가:

```tsx
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="p-manual-boosts">일일 끌어올리기 횟수</Label>
				<Input
					className="w-24"
					id="p-manual-boosts"
					onChange={(e) =>
						setManualBoostsPerDay(Number(e.target.value) || 0)
					}
					type="number"
					value={manualBoostsPerDay === 0 ? "" : manualBoostsPerDay}
				/>
				<p className="m-0 text-muted-foreground text-xs">
					이 상품을 구매한 공고가 하루에 쓸 수 있는 끌어올리기 횟수입니다.
					비워두면 미제공(0회)입니다.
				</p>
			</div>
```

- `submit()`의 onSubmit 페이로드에 `manualBoostsPerDay,` 추가

- [ ] **Step 3: new/edit 페이지 페이로드 연결**

new 페이지 `create.mutate({...})`에 `manualBoostsPerDay: draft.manualBoostsPerDay,` 추가. edit 페이지도 동일하게 mutate 페이로드에 추가하고, `initialValue` 구성부에 서버 응답의 `manualBoostsPerDay`를 매핑(필드가 없으면 `?? 0`).

- [ ] **Step 4: 광고 안내 카드 표기**

`employer-ad-guide.tsx` 상품 카드의 tagline 표시 블록(L103-105) 아래에 추가(로컬 product 타입 인터페이스가 있으면 `manualBoostsPerDay: number` 필드도 추가):

```tsx
							{product.manualBoostsPerDay > 0 ? (
								<span className="font-medium text-coral-500 text-sm">
									일일 끌어올리기 {product.manualBoostsPerDay}회 포함
								</span>
							) : null}
```

- [ ] **Step 5: 테스트·타입체크 통과 확인**

Run: `cd apps/web && npx vitest run src/components/bambi/ad-product-form.test.ts && pnpm --filter web check-types`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/components/bambi/ad-product-form.tsx apps/web/src/components/bambi/ad-product-form.test.ts "apps/web/src/app/moderator/ad-products/[placementId]/new/page.tsx" "apps/web/src/app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx" apps/web/src/components/bambi/screens/employer-ad-guide.tsx
git commit -m "feat(web): 광고 상품 폼에 일일 끌어올리기 횟수 입력 추가 - 운영자 등록·수정 연결, 광고 안내 카드에 포함 횟수 표기"
```

---

### Task 9: 최종 검증

**Files:** 없음(검증 전용)

- [ ] **Step 1: api 전체 테스트**

Run: `cd packages/api && npx vitest run`
Expected: 전부 PASS (구 bambi-promotions 테스트는 삭제됐고, jobs-analytics.test.ts는 보존된 jobPromotionCampaign 테이블을 직접 시드하므로 영향 없음 — 실패 시 base 기존 실패인지 `git stash` 없이 base 커밋 임시 워크트리로 재현 확인)

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @bambi-app/api check-types && pnpm --filter web check-types && pnpm --filter @bambi-app/db check-types`
Expected: 에러 없음

- [ ] **Step 3: web 관련 테스트**

Run: `cd apps/web && npx vitest run`
Expected: 신규·기존 전부 PASS(선행 실패가 있으면 base 재현으로 기존 건 여부 판별)

- [ ] **Step 4: 잔존 참조 스캔**

`grep -rn "listMine" apps/web/src | grep promotions` → 0건, `grep -rn "bambi-promotions\|hasActiveAdvertiserCampaign" packages/ apps/web` → 0건 확인.

- [ ] **Step 5: 최종 커밋(잔여 변경이 있으면)**

검증 중 수정이 생겼으면 해당 파일만 커밋. 이후는 컨트롤러 몫: 최종 리뷰 → `feat/promotion-boost`에 no-ff 로컬 병합(push·PR·워크트리 정리는 금지).

---

## 계획 외 참고(컨트롤러용)

- 서브에이전트 디스패치 전 부모 세션이 대상 워크트리에 EnterWorktree로 진입해 있어야 Edit 가드가 풀린다(bambi-subagent-worktree-pin).
- Task 1 완료 후 마이그레이션 사용자 게이트: 적용 확인 전에는 Task 3~6의 "테스트 실행" 스텝을 보류(코드·테스트 작성은 가능).
- 병렬 배치 제안: [Task 1] → (사용자 마이그레이션과 병행하여 Task 2) → [Task 3, 5, 6 병렬] → [Task 4] → [Task 7, 8 병렬] → [Task 9].
- apps/native의 `(seeker)/index.tsx`는 이번에도 건드리지 않는다.
