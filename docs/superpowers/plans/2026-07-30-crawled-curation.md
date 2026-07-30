# 수집 콘텐츠 큐레이션 구현 계획

> **For agentic workers:** 이 계획은 dynamic workflow의 opus-high 에이전트 5명(W1~W5) + 검증 에이전트가 병렬 실행한다. 각 에이전트는 자기 태스크 섹션과 "Global Constraints", 그리고 스펙(`docs/superpowers/specs/2026-07-30-crawled-curation-design.md`)만 보고 작업한다. 체크박스는 에이전트 내부 진행 추적용.

**Goal:** 수집 공고의 노출 기준(배너 자격·섹션 매핑·중복 수렴), 상세 페이지, 이미지 비율, 섹션별 리미트, 업종 지정 UI를 한 번에 붙인다.

**Architecture:** 파서가 지정 컨테이너 출신만 `listing_type`으로 라벨링(쓰기 기준) + 조회부가 라벨·리미트로만 노출(읽기 기준)의 이중 방어. 상세는 별도 공개 프로시저/라우트로 job_post 경로와 분리.

**Tech Stack:** Drizzle/Postgres, oRPC, cheerio, Next.js(App Router)+shadcn, vitest.

## Global Constraints

- 작업 디렉터리: `C:\Users\user\projects\bambi-app\.claude\worktrees\crawled-curation` (워크트리). 밖으로 나가지 말 것.
- **git 커밋·stash·push 금지** (커밋은 컨트롤러가 순차 수행). db:push 절대 금지.
- 빌드·dev 서버 기동 금지. 검증은 타입체크+vitest만. vitest는 반드시 워크트리 안에서 실행.
- UI는 shadcn(`@bambi-app/ui/components`) 재사용, base-ui라 `asChild` 대신 `render` prop, 인라인 style 금지, px 임의값 금지(Tailwind 토큰), enum 원값 직접 노출 금지.
- 새 npm 의존성 추가 금지.
- 주석·식별자 컨벤션은 주변 코드를 따른다(한국어 "왜" 주석).
- 픽스처에 실존 업소명·연락처·인증정보 금지(실물 HTML은 리포에 넣지 않는다).
- 파일 끝 개행·LF 유지.
- 각 에이전트는 **자기 소유 파일만** 수정한다(아래 표). 다른 에이전트 소유 파일에서 import하는 것은 계약(Interfaces)에 적힌 시그니처를 그대로 믿고 쓴다.

| 에이전트 | 소유 파일 |
|---|---|
| W1 | `packages/db/src/schema/bambi.ts`, `packages/db/drizzle/`(generate 산출물), `packages/api/src/services/bambi-crawled-limits.ts`(신규), `packages/api/src/routers/bambi/site-settings.ts` |
| W2 | `packages/api/src/services/bambi-crawl-queenalba-main.ts`(+`.test.ts`), `packages/api/src/services/bambi-crawl-ingest.ts`(+`bambi-crawl-ingest*.test.ts`), `packages/api/src/services/__fixtures__/crawl-html.ts` |
| W3 | `packages/api/src/routers/bambi/jobs.ts`, `packages/api/src/routers/bambi/jobs-ad-banners.test.ts`, `packages/api/src/services/bambi-job-feed.ts`(+`.test.ts`), `packages/api/src/services/bambi-crawled-ad-banner-slots.ts`(+`.test.ts`), `packages/api/src/services/bambi-crawl-ad-banners.ts`(+`.test.ts`, 삭제 가능) |
| W4 | `packages/api/src/routers/bambi/crawled-jobs.ts`(신규), 라우터 조립 파일(bambi 라우터에 한 줄 등록), `apps/web/src/app/seeker/jobs/crawled/[id]/**`(신규), `apps/web/src/components/bambi/screens/seeker-crawled-job-detail.tsx`(신규), `apps/web/src/components/bambi/ad-banner.tsx`, `apps/web/src/lib/bambi/api-job-mapper.ts`(+`.test.ts`), `apps/web/src/lib/bambi/api-jobs.ts`, `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`, `Job` 타입 정의 파일, `apps/web/src/lib/bambi/visual-job-components.test.ts` |
| W5 | `apps/web/src/app/moderator/crawler/page.tsx`, (존재 시) 운영자 매뉴얼 문서의 크롤러 절 |

---

### Task W1: 리미트 스키마 + 설정 API

**Files:** 위 표 W1 행. 마이그레이션은 `pnpm --filter @bambi-app/db db:generate`로 생성(**generate까지만** — migrate는 컨트롤러가 실행).

**Interfaces (Produces):**
```ts
// packages/api/src/services/bambi-crawled-limits.ts
export interface CrawledLimits {
	adBanner: number;
	recommended: number;
	special: number;
	urgent: number;
}
export const DEFAULT_CRAWLED_LIMITS: CrawledLimits = { adBanner: 8, recommended: 12, special: 12, urgent: 12 };
export const readCrawledLimits = async (): Promise<CrawledLimits>; // null 컬럼은 DEFAULT로 치환
```
```ts
// site-settings 라우터 추가 프로시저 (둘 다 adminProcedure)
getCrawledLimits: 무입력 → { adBannerLimit: number | null, recommendedLimit: number | null, specialLimit: number | null, urgentLimit: number | null }
updateCrawledLimits: input z.object({ adBannerLimit: z.number().int().min(0).max(60).nullable(), recommendedLimit: 〃, specialLimit: 〃, urgentLimit: 〃 }) → 반환 getCrawledLimits와 동일 형태
```

- [ ] `bambiSiteSettings`에 nullable integer 4컬럼 추가: `crawledAdBannerLimit("crawled_ad_banner_limit")`, `crawledSpecialLimit`, `crawledUrgentLimit`, `crawledRecommendedLimit`. 주석은 `adBannerRotationMinutes`(880줄 근처) 패턴: "null이면 코드 기본값(DEFAULT_CRAWLED_LIMITS) 폴백".
- [ ] `pnpm --filter @bambi-app/db db:generate` 실행 — 추가 컬럼만 있는 SQL인지 열어 확인(rename 프롬프트가 뜨면 안 되는 순수 추가). **migrate는 실행하지 말 것.**
- [ ] `bambi-crawled-limits.ts` 작성: 단일 행(`id='default'`) select → null → DEFAULT 치환.
- [ ] site-settings 라우터에 `CRAWLED_LIMIT_COLUMNS` 그룹(기존 `CRAWLED_EXPOSURE_COLUMNS` 155–160 패턴) + 두 프로시저. upsert는 `updateCrawledExposure`(346–360)와 동일 구조. 입력→컬럼 키 매핑(`adBannerLimit`→`crawledAdBannerLimit`) 주의.
- [ ] `pnpm --filter @bambi-app/api exec tsc --noEmit` (또는 package.json의 타입체크 스크립트) 통과 확인. DB를 건드리는 테스트는 실행하지 않는다(마이그레이션 전).

### Task W2: 파서 교정 + ingest (컨테이너 화이트리스트·매핑·중복·리미트·라벨 리셋·업종 보존)

**Interfaces (Consumes):** W1의 `readCrawledLimits` — `import { readCrawledLimits } from "./bambi-crawled-limits";`
**Interfaces (Produces):** `QUEENALBA_LISTING_TYPES = ["ad_banner", "special", "urgent", "recommended"] as const` (`premium` 제거). listing_type 값 의미 = **우리 서비스 자리**.

파서(`bambi-crawl-queenalba-main.ts`):
- [ ] `HORIZONTAL_BANNER_SELECTOR = "#main_center"` 로 교체(기존 `#main_top_center`는 기준 밖 — 주석에 이유). `VERTICAL_BANNER_SELECTORS = ["#divMenu2", "#divMenu12"]` 유지. `#main_left`·`#main_left2`·`#main_top_center` 배너는 수집하지 않는다.
- [ ] `SECTION_TITLES`를 매핑·우선순위 순으로 교체(희소한 원본 자리가 이긴다):
```ts
const SECTION_TITLES = [
	{ label: /스페셜\s*채용/, listingType: "recommended" }, // 퀸알바 스페셜(12칸) → 우리 추천
	{ label: /프리미엄\s*채용/, listingType: "urgent" },     // 퀸알바 프리미엄(40칸) → 우리 급구
	{ label: /우대/, listingType: "special" },               // 퀸알바 우대등록(72칸) → 우리 스페셜
] as const;
```
  "스페셜인재정보"(구직 섹션)를 잡지 않도록 `채용` 포함 필수. 퀸알바 자체 급구채용·추천채용 섹션은 항목에서 **제거**(라벨 없음).
- [ ] `readSectionScope`: 조상 탐색을 "상세 링크를 처음 품는 조상"에서 **`#content1`의 직계 자식 div**로 교체 — `titleImage.closest("#content1 > div")` (cheerio closest가 자식 결합자 셀렉터를 지원하는지 테스트로 확인, 안 되면 parent 체인에서 `parent().is("#content1")`인 div를 찾는 루프). 이유 주석: 이전 방식은 스코프가 섹션 밖으로 넘칠 수 있었다(실측 우대 72건인데 table 조상이 310행).
- [ ] 중복 수렴은 기존 메커니즘 그대로(`SECTION_TITLES` 순서 선점 + `attachResolvedBanners`의 ad_banner 덮어쓰기) — 테스트로 못 박는다.

ingest(`bambi-crawl-ingest.ts`):
- [ ] `collectQueenalbaMainListings`: `const limits = await readCrawledLimits();`
  - 배너: `parseQueenalbaMain` 결과의 `banners`를 **리다이렉터 해석 전에** `.slice(0, limits.adBanner)` (DOM 순서: 가로 먼저·세로 나중 — scans 배열 순서가 이미 그렇다). 요청 절약이 목적임을 주석으로.
  - 섹션 라벨: `attachResolvedBanners` 결과에서 타입별 카운트가 `limits[type]`을 넘는 항목은 `listingType: null`로 바꿔 일반 카드로 취급(등장 순서 유지). `ad_banner`는 배너 슬라이스로 이미 상한.
- [ ] **낡은 라벨 리셋**: queenalba 회차에서 메인 파싱 listings가 1건 이상일 때, 이번 메인 externalId 집합에 없는 행을
```ts
await db.update(crawledJobPost).set({ bannerHorizontalUrl: null, bannerVerticalUrl: null, listingType: null })
	.where(and(eq(crawledJobPost.sourceSite, "queenalba"), isNotNull(crawledJobPost.listingType),
		notInArray(crawledJobPost.sourceExternalId, mainExternalIds)));
```
  메인 0건이면 건너뛴다(장애 시 전량 리셋 방지 — 주석 필수). 실행 위치는 runCrawlTick의 해당 회차 성공 경로.
- [ ] **업종 보존 upsert**: `ingestDetail`의 `onConflictDoUpdate` set에서
```ts
industryCategory: sql`coalesce(excluded.industry_category, ${crawledJobPost.industryCategory})`,
status: sql`case when coalesce(excluded.industry_category, ${crawledJobPost.industryCategory}) is null then 'needs_review' else 'active' end`,
```
  운영자가 지정한 업종을 재수집이 지우던 버그 수정. expired 행이 재등장하면 다시 살아나는 것은 의도.

픽스처·테스트:
- [ ] `crawl-html.ts`의 queenalba 메인 픽스처를 실물 구조로 재작성: `#main_center`(리다이렉터 배너 2 + 외부 링크 배너 1), `#main_top_center`·`#main_left`(각 1 — **무시돼야 하는 함정**), `#divMenu12`(2)·`#divMenu2`(1), `#content1` 직계 div로 우대등록/프리미엄/스페셜 채용정보(제목 이미지 alt) + 자체 급구·추천 div(함정) + 스페셜**인재**정보 div(함정), 우대∩스페셜 중복 공고 1건. 가상 데이터만 사용.
- [ ] 테스트 갱신·추가(기존 19건 상당 재작성): 가로는 `#main_center`만 / 함정 컨테이너 3종 무시 / 3섹션 매핑 / 중복 공고는 recommended가 special을 이긴다 / 배너는 섹션을 이긴다 / 자체 급구·추천·인재 미라벨 / 게이트 스텁 빈 결과.
- [ ] ingest 테스트: 리미트 적용(banners slice·라벨 강등), 라벨 리셋(포함·스킵 두 경로), coalesce 보존(기존 DB 테스트 패턴 `bambi-crawl-ingest-db.test.ts` 참고 — 이 파일은 병렬 실행 시 crawl_run 유니크 경합으로 깨질 수 있어 단독 실행으로 확인).
- [ ] vitest 해당 파일 통과 + api 타입체크.

### Task W3: 섹션 주입·impression 안전·배너 풀 자격 축소

**Interfaces (Consumes):** `readCrawledLimits`(W1), `isCrawledJobFeedEnabled`(기존 bambi-job-feed.ts:183), listing_type 어휘(W2와 동일 상수 — 문자열 리터럴로 사용).
**Interfaces (Produces):**
```ts
// bambi-job-feed.ts
export type CrawledSectionType = "recommended" | "special" | "urgent";
export const listCrawledSectionRows = async (input: {
	district?: string; industryCategory?: string; limit: number;
	minPayAmount?: number; region?: string; type?: CrawledSectionType;
}): Promise<JobFeedRow[]>;
// type 지정 → listingType = type 조건 + exposureType을 type으로 매핑.
// type 생략 → 전체 공고용: listingType 조건 없음, exposureType 'standard' 유지.
```

- [ ] `listCrawledSectionRows` 구현: 기존 crawled 투영 재사용, 조건 `status='active'` + `listingType = type` + 공개 필터(industryCategory/region/district/minPayAmount — 기존 crawled 조건 빌더 재사용) + `order by coalesce(source_posted_at, first_seen_at) desc` + limit. 반환 시 `exposureType`을 `type`으로 매핑(TS에서 `rows.map(r => ({ ...r, exposureType: type }))` 가능 — 'special'|'urgent'|'recommended'는 JobExposureType의 유효값).
- [ ] `jobs.ts list`(848–1009):
  - `exposureSelection`에 `source: jobPost.source` 추가.
  - `isCrawledJobFeedEnabled()`가 true면 `readCrawledLimits()` 후 세 타입 + organic(type 생략, limit는 `input.limit`) 병렬 조회, **`buildExposureJobSections` 결과의 각 섹션 뒤에 append**. **우선순위 규칙(사용자 지시): 1순위 우리 순수 공고가 항상 최상단, 2순위 크롤링 — 섞어 정렬하지 않고 뒤에 붙인다.** 섹션 행은 `toListItem(item, true)`로 promotionLabel 부여, organic 행은 `toListItem(item, false)`.
  - `totalCount`에 crawled 고유 행 수 가산(섹션·organic 중복 id는 한 번만).
  - `recordJobListingImpressions`·`getRecentJobPerformanceMetrics`에는 **유료 행만**(`source !== 'crawled'` 필터 또는 append 전 스냅샷 사용). 이유 주석: job_performance_event가 job_post FK — 수집 id가 섞이면 공개 조회가 통째로 죽는다.
- [ ] `loadCrawledAdBannerPools` 자격 축소: where에 `eq(crawledJobPost.listingType, "ad_banner")` 추가, `or(썸네일…)` 자격 제거 → 방향 URL 컬럼만. `resolveCrawledAdBanners` 호출 제거 — `adHorizontalUrl: row.bannerHorizontalUrl`, `adVerticalUrl: row.bannerVerticalUrl` 직결. `verticalBorrowedFrom` 필드 삭제(웹 매퍼는 이 필드를 읽지 않음 확인됨). limit는 `min(60, limits.adBanner)` 대신 `limits.adBanner` 사용.
- [ ] `bambi-crawl-ad-banners.ts`(+test) 삭제 — 유일 호출자가 사라진다. grep으로 잔여 참조 0 확인.
- [ ] 테스트: feed 테스트에 listCrawledSectionRows(타입 필터·리미트·스위치와 무관하게 함수 자체는 순수 조회), jobs list 섹션 주입은 스위치 on/off 두 경로(기존 feed 테스트의 "설정 저장 후 finally 복원" 패턴 준수 — 사용자가 실제 앱에서 스위치를 켜둔 상태일 수 있다), slots 테스트 재작성(ad_banner 라벨만 자격, borrowing 부재). jobs-ad-banners.test.ts 갱신.
- [ ] vitest 해당 파일 + api 타입체크 통과.

### Task W4: 수집 공고 상세 페이지 + 클릭 연결 + 배너 비율

**Interfaces (Produces):** `orpc.bambi.crawledJobs.getById({ id: uuid })` →
```ts
{ ageRange: string | null, body: string, detailImageUrls: string[], district: string | null,
  gender: string | null, id: string, industryCategory: string | null, listingType: string | null,
  payAmount: number | null, payRaw: string | null, payUnit: string | null, region: string | null,
  shopName: string | null, sourcePostedAt: Date | null, thumbnailUrl: string | null,
  title: string, workSchedule: string | null }
```
status가 `active`가 아니거나 없으면 `ORPCError("NOT_FOUND")`. **contact*·bizName·address·sourceUrl은 절대 select하지 않는다**(운영자 전용 리드 — crawler.ts 23–26 주석의 원칙).

- [ ] `packages/api/src/routers/bambi/crawled-jobs.ts` 신규: `publicProcedure` getById 위 계약대로. bambi 라우터 조립 파일에서 `crawler: crawlerRouter`가 등록된 위치를 찾아 `crawledJobs: crawledJobsRouter` 한 줄 등록.
- [ ] 웹 라우트 `apps/web/src/app/seeker/jobs/crawled/[id]/page.tsx`(클라이언트, 기존 `jobs/[id]/page.tsx` 82줄 패턴): useQuery(`orpc.bambi.crawledJobs.getById`), uuid 아니면/없으면 `notFound()`.
- [ ] 화면 `seeker-crawled-job-detail.tsx` 신규(기존 `SeekerJobDetailResponsive` 재사용 금지 — "검수 통과"·"검증 완료" 배지가 하드코딩이라 수집 공고에 거짓 신호):
  - 레이아웃은 기존 상세와 같은 3컬럼(좌우 광고 레일 `useAdBannerJobs`, `min-[1720px]:block` sticky).
  - 본문: 제목(shopName + title), 지역(`[region, district]` join)·업종(industryCategory — 값 자체가 한국어 enum이며 기존 화면들이 쓰는 표기 방식을 따른다), 급여 InfoTile(`formatMarketplacePay({ payAmount, payUnit })`, payAmount 없으면 payRaw, 그것도 없으면 "협의"), 근무시간(workSchedule 있을 때만), 본문 텍스트, `detailImageUrls` 세로 스택(`jobs/[id]` 상세의 이미지 스택 243–259 패턴).
  - **"외부 수집 공고" 고지**를 `Alert`로 명시(채팅·지원·연락처 기능 없음을 함께 안내). 채팅·리뷰·신고·연락처 타일 없음.
- [ ] 매퍼(`api-job-mapper.ts`): `AdBannerItem`에 `crawled: boolean` 추가. `toAdBannerItem`: `const isCrawled = job.source === "crawled"; href: isCrawled ? \`/seeker/jobs/crawled/${job.id}\` : \`/seeker/jobs/${job.id}\``(기존 `null` 분기 대체 — 이제 갈 곳이 있다). `toMarketplaceJob`: `Job`에 optional `crawled?: boolean` 추가하고 세팅.
- [ ] `seeker-marketplace.tsx` `openJob`: `job.crawled`면 `/seeker/jobs/crawled/${job.id}`로 push(게스트 가입 유도 분기는 유지).
- [ ] `ad-banner.tsx` 비율 분기: `item.crawled`일 때
  - `AdBanner`(세로): surface `aspect-[4/9] h-52 w-auto` → `w-full`(고정 비율 없음), `<Image>` className `h-auto w-full`(object-cover 제거). width/height 속성은 `width={460} height={300}` 등 임의값 + `h-auto`로 실제 비율을 브라우저가 잡게 한다(next/image 필수 속성일 뿐).
  - `HorizontalAdBanner`: `aspect-[7/3]` 제거, 동일 처리. 결제 광고(`crawled` false) 렌더는 한 글자도 바뀌지 않아야 한다. 자리표시(`AdSlotPlaceholder`)는 변경 없음.
- [ ] `api-jobs.ts`: 필요 시 `useCrawledJob(id)` 훅(기존 `useMarketplaceJob` 161–180 패턴).
- [ ] 테스트: `api-job-mapper.test.ts`에 crawled href·crawled 플래그, `visual-job-components.test.ts`의 href 관련 단언을 새 경로로 갱신 + crawled 비율 분기 존재 단언(이 테스트 파일은 소스 문자열 검사 방식).
- [ ] vitest 해당 파일 + web·api 타입체크 통과.

### Task W5: 운영자 크롤러 페이지 — 리미트 카드 + 업종 검토 대기 카드

**Interfaces (Consumes):** W1의 `siteSettings.getCrawledLimits`/`updateCrawledLimits`(시그니처는 W1 절), 기존 `crawler.list`(input `{ limit?: 1–100, offset?, status?: "active"|"needs_review"|"expired" }` → `{ items, total }`), 기존 `crawler.setIndustryCategory`(`{ id, industryCategory: 8종 enum }` → 갱신 행). `crawler.list`의 items에는 title·shopName·region·district·industryRaw·listingType·lastSeenAt·status·id가 있다(부족하면 **W5가 crawler.ts의 LIST_COLUMNS에 컬럼을 추가해도 된다** — 이 경우 crawler.ts도 W5 소유).

- [ ] **수집 리미트 카드**(기존 "외부 공고 수집" 폼 150–167 패턴): 4개 숫자 `Input`(프리미엄 배너/스페셜/급구/추천), placeholder로 기본값(8/12/12/12) 표기, 빈 값 = null(기본값 사용). 저장 버튼 → `updateCrawledLimits`. `getCrawledLimits`로 초기값, 도착 시 `useEffect` 동기화(60–70 패턴).
- [ ] **업종 검토 대기 카드**: `crawler.list({ limit: 30, status: "needs_review" })` — 0건이면 `Empty`, 있으면 shadcn `Table`(제목, 업소명, 지역, 원본 업종 `industryRaw`, 마지막 수집). 행마다 업종 `Select`(웹에 이미 있는 업종 옵션 상수 재사용 — 마켓플레이스 필터가 쓰는 것을 찾아 재사용, 없으면 db enum 값 배열) → 선택 즉시 `setIndustryCategory` 뮤테이션(노출 스위치 카드 138–148의 즉시 저장 패턴), 성공 시 `list`·`getSummary` invalidate + toast. 지정되면 needs_review→active로 빠지는 동작을 안내문에 반영(수집 현황 카드의 기존 안내문 392–395도 "아래 카드에서 지정" 문구로 갱신).
- [ ] 페이지 배치: "수집 콘텐츠 노출" 카드 다음에 리미트 카드, "수집 현황" 다음에 업종 검토 대기 카드.
- [ ] 운영자 매뉴얼 문서가 있으면(리포에서 크롤러/수집 절을 grep) 두 카드 설명 추가 — 없으면 생략.
- [ ] web 타입체크 통과(이 페이지 관련 테스트가 있으면 실행).

### Task V: 검증

- [ ] `pnpm dlx ultracite fix` (변경 파일 정렬·린트).
- [ ] api·web 타입체크(각 package.json의 스크립트 확인 후 실행).
- [ ] vitest: 워크트리 안에서 api 서비스·라우터 테스트와 web의 변경 관련 테스트 실행. `bambi-crawl-ingest-db.test.ts`는 단독 실행(병렬 시 crawl_run 유니크 경합).
- [ ] **기존 실패 베이스라인**(무시): api `jobs-list-boost-order` 2건·`moderation-support` 1건, web `bambi-job-blocks`·`employer/promotions/page`·`moderator/payments` 5건. 이 외 실패만 보고.
- [ ] 실패 목록을 파일·테스트명·에러 요약으로 구조화해 반환(수리 라운드 입력).

## Self-Review 결과

- 스펙 D1~D7 각각 W2(D1 쓰기·D2·D7 upsert)/W3(D1 읽기·D3)/W4(D4·D5)/W1+W5(D6)/W5(D7 UI)에 매핑됨 — 공백 없음.
- 낡은 라벨 리셋(D2)은 W2 ingest 태스크에 포함.
- 타입 일관성: `CrawledLimits` 키(adBanner/recommended/special/urgent)와 라우터 입력 키(adBannerLimit…)는 의도적으로 다른 층위 — W1 절에 명시.
