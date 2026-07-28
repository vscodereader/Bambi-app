# 크롤 소스 추가 가이드

새 사이트·데이터 종류를 크롤러에 꽂는 방법. 프레임워크(수집기·스케줄러·운영자 콘솔·테이블)는
이미 다 있고, **사이트별 파서와 등록만** 채우면 그 조합이 켜진다. 여우알바×공고가 참고 구현이다.

각 소스에서 실제로 채울 곳은 아래 네 이음매다(커뮤니티는 별도 경로 하나 더).

```
① 파서            사이트별 순수 함수 (HTML → 레코드)
② 수집기 디스패치  settings.crawlSourceSite → 파서 선택
③ fetch 헤더/쿠키  게이트가 있는 소스용 (선택)
④ 등록            IMPLEMENTED_CRAWL_TARGETS에 조합 추가
```

파서를 **HTML 문자열만 받는 순수 함수**로 유지하는 게 핵심이다. 네트워크를 모르면 저장해 둔
HTML 픽스처만으로 테스트가 돌고, DOM 크롤링의 진짜 비용(셀렉터가 소리 없이 깨지는 것)을 그
테스트가 잡아준다.

---

## ① 공고 파서 — `bambi-crawl-<site>.ts`

`packages/api/src/services/bambi-crawl-foxalba.ts`를 그대로 본떠 새 파일을 만든다. 아래 다섯을
export 하면 수집기가 쓸 수 있다.

```ts
// packages/api/src/services/bambi-crawl-queenalba.ts (예시 골격)
import { load } from "cheerio";
import {
  type CrawledJobRecord,
  computeContentHash, // 필요 시
  mapIndustryCategory,
  maskContacts,
  normalizeText,
  parsePay,
} from "./bambi-crawl-normalize";

export const queenalbaListUrl = (page: number): string =>
  `https://queenalba.net/guin_list.php?page=${page}`; // TODO: 실제 페이지 파라미터 확인

export const queenalbaDetailUrl = (externalId: string): string =>
  `https://queenalba.net/guin_detail.php?num=${externalId}`; // TODO: cou 등 필요한 파라미터

// 목록에서 수집기가 실제로 쓰는 건 sourceExternalId 하나뿐이다. 나머지 필드는 상세에서 채운다.
export interface QueenalbaListItem {
  sourceExternalId: string;
}

export const parseQueenalbaList = (html: string): QueenalbaListItem[] => {
  const $ = load(html);
  const items: QueenalbaListItem[] = [];
  // TODO: 반복 요소 셀렉터. 상세 링크에서 num(+cou)을 뽑아 sourceExternalId로.
  return items;
};

export const parseQueenalbaTotalCount = (html: string): number | null => {
  // TODO: 전체 건수 셀렉터(페이지 수 계산용). 없으면 null → 1페이지만.
  return null;
};

export const parseQueenalbaDetail = (
  html: string,
  externalId: string
): CrawledJobRecord | null => {
  const $ = load(html);
  // TODO: 라벨-값 필드·본문 셀렉터. 아래 규칙은 반드시 지킨다:
  //  - 본문에 maskContacts(normalizeText(...)) 적용 (본문에 박힌 번호까지 가림)
  //  - 급여는 parsePay(원문) → { amount, unit }
  //  - 업종은 mapIndustryCategory(원문) — 매핑 실패면 null(수집기가 needs_review로 남김)
  //  - 파싱 실패(삭제 글·마크업 변경)면 반드시 null 반환 (수율 판정이 이걸로 파손을 감지)
  return null;
};
```

**레코드 규약**은 `CrawledJobRecord`(bambi-crawl-normalize.ts) 하나다. 이 모양만 지키면 수집기는
어느 사이트에서 왔는지 몰라도 저장한다. `contactPhone`·`contactKakao`·`contactName`·`bizName`은
운영자 전용 리드라 공개 API에서 이미 제외돼 있으니, 파싱만 해서 채우면 된다.

셀렉터 확정은 **실제 응답을 받아서** 한다(추측 금지). 받은 HTML은 개인정보(담당자 실명·연락처·
카톡)를 치환해서 `__fixtures__/`에 저장하고, 그 픽스처로 파서 테스트를 쓴다. foxalba의
`bambi-crawl-foxalba.test.ts`와 `__fixtures__/foxalba-*.html`이 그대로 본보기다.

---

## ② 수집기 디스패치 — `bambi-crawl-ingest.ts`

지금 이 파일은 여우알바에 고정돼 있다(`const SOURCE_SITE = "foxalba"`, `collectListItems`·
`ingestDetail`가 `foxalbaListUrl`·`parseFoxalbaDetail`을 직접 부름). 사이트를 하나 더 받으려면
**사이트 어댑터**로 한 겹 추상화한다.

```ts
// 어댑터 인터페이스 (파서 다섯을 묶는다)
interface JobSiteAdapter {
  site: CrawlSourceSite;
  listUrl: (page: number) => string;
  detailUrl: (externalId: string) => string;
  parseList: (html: string) => { sourceExternalId: string }[];
  parseTotalCount: (html: string) => number | null;
  parseDetail: (html: string, externalId: string) => CrawledJobRecord | null;
}

const JOB_ADAPTERS: Record<CrawlSourceSite, JobSiteAdapter | null> = {
  foxalba: {
    site: "foxalba",
    listUrl: foxalbaListUrl,
    detailUrl: foxalbaDetailUrl,
    parseList: parseFoxalbaList,
    parseTotalCount: parseFoxalbaTotalCount,
    parseDetail: parseFoxalbaDetail,
  },
  queenalba: {
    site: "queenalba",
    listUrl: queenalbaListUrl,
    detailUrl: queenalbaDetailUrl,
    parseList: parseQueenalbaList,
    parseTotalCount: parseQueenalbaTotalCount,
    parseDetail: parseQueenalbaDetail,
  },
};
```

그리고 `runCrawlTick`에서 `const adapter = JOB_ADAPTERS[settings.crawlSourceSite]`을 골라,
아래 하드코딩을 전부 `adapter.*`로 바꾼다:

- `SOURCE_SITE` 상수 → `adapter.site` (crawl_run·crawled_job_post·markSeen·expireStale·
  loadExisting의 `sourceSite` 필터/삽입에 모두 쓰인다)
- `collectListItems`의 `foxalbaListUrl`/`parseFoxalbaList`/`parseFoxalbaTotalCount`
  → `adapter.listUrl`/`adapter.parseList`/`adapter.parseTotalCount`
- `ingestDetail`의 `foxalbaDetailUrl`/`parseFoxalbaDetail`
  → `adapter.detailUrl`/`adapter.parseDetail`

수집기의 나머지 로직(수율 판정·멱등성·만료·중복 실행 방지)은 사이트와 무관하니 손대지 않는다.
`①`에서 목록 파서가 `sourceExternalId`만 주면 되는 이유가 이것 — 수집기가 목록에서 쓰는 값이
그거 하나다.

---

## ③ fetch 헤더/쿠키 — `bambi-crawl-fetch.ts` (게이트가 있는 소스만)

쿠키·커스텀 헤더가 필요한 소스는 `createCrawlClient`에 옵션으로 넘긴다. 지금 `requestOnce`의
`headers`에는 UA·accept만 있으니, 옵션을 하나 받아 병합한다:

```ts
export interface CrawlClientOptions {
  // ...기존 필드...
  requestHeaders?: Record<string, string>; // 예: { cookie: "..." }
}

// requestOnce 안:
headers: {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "ko-KR,ko;q=0.9",
  "user-agent": USER_AGENT,
  ...options.requestHeaders, // 소스별 쿠키·헤더
},
```

그리고 디스패치에서 소스별 클라이언트를 만든다:
`runCrawlTick(now, createCrawlClient({ requestHeaders: headersFor(adapter.site) }))`.
쿠키 문자열 자체는 소스마다 다르고 만료될 수 있으니 코드에 박지 말고 설정값(운영자 콘솔 필드나
env)으로 주입하는 걸 권한다.

**게이트 감지**: 쿠키가 무효·만료면 사이트가 짧은 리다이렉트 스텁을 준다. `parseList`가 그걸
빈 목록으로 읽으면 수율 판정이 `aborted_low_yield`로 잡아 만료 처리를 막지만, 더 좋은 건
`parseList`(또는 fetch 직후)에서 스텁을 명시적으로 감지해 "쿠키 만료"로 회차를 실패시키는 것이다.
robots.txt는 그대로 존중해야 한다(개별 URL 차단 포함).

---

## ④ 등록 — `bambi-crawl-policy.ts`

파서와 어댑터가 준비되면 조합을 구현 목록에 추가한다. 이 한 줄이 운영자 콘솔의 "준비 중"을
풀고 스케줄러가 실제로 돌게 하는 스위치다.

```ts
export const IMPLEMENTED_CRAWL_TARGETS: readonly CrawlTarget[] = [
  { contentType: "job_post", site: "foxalba" },
  { contentType: "job_post", site: "queenalba" }, // ← 추가
];
```

`AVAILABLE_CRAWL_TARGETS`(사이트가 제공하는 종류)에는 이미 퀸알바 공고·커뮤니티가 들어 있으니
건드릴 필요 없다. `crawl_source_site` enum에도 `queenalba`가 이미 있어 **마이그레이션도 불필요**하다.

---

## 커뮤니티(게시판)는 별도 경로

커뮤니티는 공고와 테이블·파서·수집 흐름이 다르다.

- **테이블**: `crawled_community_topic` (title·viewCount·commentCount·boardName만, **본문 없음**).
  게시글은 개별 작성자의 저작물이라 본문을 복제·재게시하지 않고 "어떤 주제가 반응을 얻는가"만
  운영 참고자료로 쓴다는 설계다. 이 선을 넘지 말 것.
- **파서**: 목록만 있으면 된다(상세 페이지 방문 없음). `parseCommunityList(html) → { sourceExternalId, title, viewCount, commentCount, boardName }[]`.
- **수집 흐름**: 상세 패스가 없어 공고보다 훨씬 단순하다. `crawlContentType === "community"`일 때
  `runCrawlTick`이 이 경로로 분기하도록 디스패치에 한 갈래를 더한다(공고 어댑터와 나란히).
- **등록**: 위 ④에 `{ contentType: "community", site: "queenalba" }`를 추가.

공고 파이프라인이 먼저 돌아가는 걸 확인한 뒤 커뮤니티를 붙이는 순서를 권한다.

---

## 마무리 체크리스트

- [ ] 실제 응답으로 셀렉터 확정 → 개인정보 치환한 픽스처 저장 → 파서 테스트 통과
- [ ] `IMPLEMENTED_CRAWL_TARGETS`에 조합 추가
- [ ] `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-crawl` 통과
- [ ] `pnpm --filter @bambi-app/api check-types` / `pnpm --filter web check-types` 통과
- [ ] 운영자 콘솔에서 그 조합의 "준비 중"이 사라지고 즉시 수집이 열리는지 확인
- [ ] 게이트가 있는 소스면 쿠키 만료 시 회차가 조용히 만료 처리로 번지지 않는지 확인

법적 판단(대상 사이트 약관·연령확인 게이트 우회·데이터베이스제작자 권리)은 코드가 아니라
운영 책임 영역이다. 이 가이드는 "어디에 무엇을 꽂는지"만 다룬다.
