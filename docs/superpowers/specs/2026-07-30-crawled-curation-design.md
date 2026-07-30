# 수집 콘텐츠 큐레이션 — 배너 자격 기준·섹션 매핑·상세 페이지·리미트·업종 지정

2026-07-30. 대상 소스: queenalba. 실물 main.html(인증 쿠키로 받은 364KB, 리포 밖 보관)로 전 구조를 검증했다.

## 배경 — 무엇이 문제인가

1. **기준 없는 배너 노출**: `loadCrawledAdBannerPools`가 "이미지가 하나라도 있는 active 공고" 전부를 배너 풀에 넣는다. 썸네일밖에 없는 일반 공고가 광고 배너 자리에 올라간다.
2. **가로 배너 컨테이너 오류**: 파서가 `#main_top_center`(3칸)를 긁는데 기준 컨테이너는 `#main_center`(6칸: 77~82)다. `#main_left`/`#main_left2`(4칸)는 기준 밖인데 지금 규칙대로면 언젠가 섞일 수 있다.
3. **수집 공고가 갈 곳이 없음**: 배너를 눌러도 상세가 없고(`href: null`), 스페셜·급구·추천 섹션에도 수집 공고가 들어가지 않는다. `crawledJobFeedEnabled` 스위치는 실사용 경로에 연결돼 있지 않다.
4. **배너 이미지 비율 왜곡**: 원본 배너는 약 230×150(≈3:2)인데 우리 슬롯은 가로 7:3·세로 4:9 `object-cover`라 잘려 나간다.
5. **리미트 없음**: 섹션별 수집 개수를 운영자가 제어할 수 없다.
6. **업종 지정 수단 없음**: 안내문은 "운영자가 직접 업종을 지정해 주세요"인데 화면이 없다. 서버 프로시저(`crawler.list`, `crawler.setIndustryCategory`)는 이미 있고 호출부가 0건이다.
7. **(발견한 버그) 재수집이 운영자 지정을 파괴**: `ingestDetail`의 `onConflictDoUpdate`가 `industryCategory`(파서 결과, 대부분 null)와 `status`를 통째로 덮어써서, 운영자가 지정한 업종이 다음 회차에 지워지고 다시 needs_review가 된다.

## 실물 구조 (검증 완료)

| 위치 | 셀렉터 | 실측 |
|---|---|---|
| 가로 배너(기준) | `#main_center` | 배너 6, 리다이렉터 77~82 |
| 세로 배너(기준) | `#divMenu12`, `#divMenu2` | 배너 4+3, 리다이렉터 74,60,47,75 / 53,69,55 |
| 기준 밖 배너 | `#main_top_center`(3), `#main_left`(2), `#main_left2`(2) | 수집 제외 대상 |
| 우대등록 채용정보 | `#content1`의 직계 자식 div, 제목 이미지 alt="우대등록 채용정보" | 고유 공고 72 |
| 프리미엄 채용정보 | 〃 alt="프리미엄 채용정보" | 고유 공고 40 |
| 스페셜 채용정보 | 〃 alt="스페셜 채용정보" | 고유 공고 12 |
| 퀸알바 자체 급구·추천 | 〃 (한 div에 둘) | 11건 — **매핑하지 않음** |
| 섹션 간 중복 | 우대∩프리미엄 1, 우대∩스페셜 4, 우대∩급구/추천 6, 프리미엄∩스페셜 3 | 중복 수렴 규칙 필요 |

섹션 앵커는 nth-child 사슬이 아니라 **제목 이미지 alt + `#content1` 직계 자식 div 스코프**로 잡는다(광고 칸 증감에 안 깨진다). "스페셜인재정보"(구직자 섹션)와 혼동하지 않도록 alt 매칭은 `채용`을 포함해야 한다.

## 결정

### D1. 배너 자격 = 지정 컨테이너에서 온 공고만

- 파서: 가로 = `#main_center`(기존 `#main_top_center` 교체), 세로 = `#divMenu12`·`#divMenu2` 유지. 그 외 컨테이너의 배너는 수집하지 않는다.
- 배너가 붙은 공고만 `listing_type = 'ad_banner'` + `banner_horizontal_url`/`banner_vertical_url`.
- **읽기 쪽 자격 축소(핵심)**: `loadCrawledAdBannerPools`는 `listing_type = 'ad_banner'`이고 해당 방향 배너 URL이 있는 행만 풀에 넣는다. 썸네일 폴백·"다른 공고의 세로형 빌려오기"(`resolveCrawledAdBanners`의 borrowing)는 폐기한다 — 기준 밖 이미지가 배너 자리에 오르는 통로였다. `verticalBorrowedFrom` 필드도 함께 제거(웹 매퍼는 이 필드를 읽지 않음을 확인).

### D2. 섹션 매핑 + 중복 수렴

`listing_type`은 **우리 서비스 자리** 어휘로 저장한다:

| 퀸알바 원본 | 우리 자리 | listing_type |
|---|---|---|
| 지정 컨테이너 배너 | 프리미엄 광고 배너 | `ad_banner` |
| 스페셜 채용정보 (12칸) | 추천 채용 | `recommended` |
| 프리미엄 채용정보 (40칸) | 급구 채용 | `urgent` |
| 우대등록 채용정보 (72칸) | 스페셜 채용 | `special` |
| 퀸알바 자체 급구·추천 | (매핑 없음) | `null` |

- `QUEENALBA_LISTING_TYPES`에서 `premium` 제거. DB에 남은 레거시 `premium` 값은 어떤 조회 조건에도 걸리지 않아 자연 소멸(다음 수집이 재라벨).
- **중복 수렴(요구: 중복 공고 필터)**: 한 공고 = 한 자리. 우선순위 `ad_banner > recommended(스페셜 원본) > urgent(프리미엄 원본) > special(우대 원본)` — 원본에서 칸이 희소할수록(비쌀수록) 이긴다. 파서의 `SECTION_TITLES` 순서와 `mergeListing`의 선점 규칙, `attachResolvedBanners`의 배너 덮어쓰기로 구현한다. 행 자체의 중복은 `(source_site, source_external_id)` 유니크가 이미 보장한다.
- **낡은 라벨 정리**: 회차에서 메인 파싱이 1건 이상일 때, 이번 메인에 없는 queenalba 행의 `listing_type`·배너 URL 2칸을 null로 리셋한다(메인에서 내려간 광고가 우리 화면에 계속 돌지 않게). 메인 파싱 0건이면 정리를 건너뛴다(일시 장애 방어).

### D3. 섹션·배너 노출 (읽기 경로)

- `jobs.list`: `crawledJobFeedEnabled`가 켜져 있으면 `crawled_job_post`에서 `status='active'`이고 `listing_type IN ('special','urgent','recommended')`인 행을 **피드 투영(bambi-job-feed의 crawled 프로젝션)** 으로 뽑아 각 섹션의 유료 공고 **뒤에** 붙인다. `exposureType`은 `listing_type` 컬럼 값을 그대로 쓴다(어휘가 이미 우리 자리 어휘). 공개 필터(industryCategory·region·district·minPayAmount)는 수집 행에도 동일 적용.
- **impression 안전장치**: `recordJobListingImpressions`에 수집 행이 섞이면 `job_performance_event`의 job_post FK 위반으로 공개 조회가 통째로 죽는다. 유료 selection에 `source` 컬럼을 추가하고 `source === 'crawled'` 행은 기록에서 제외한다. 성과 지표 집계 대상에서도 제외.
- **전체 공고(organic)에도 수집 공고를 넣는다**(사용자 지시 2026-07-30): 스위치가 켜져 있으면 `status='active'`인 수집 공고 전부(라벨 무관)를 공개 필터 적용·최신순·`input.limit` 상한으로 뽑아 **우리 공고 뒤에** append. `exposureType`은 `'standard'` 유지(승격 라벨 없음).
- **우선순위 규칙(모든 섹션·전체 공고 공통)**: 1순위 = 우리 서비스 순수 공고(항상 최상단), 2순위 = 크롤링 공고. 섞어 정렬하지 않고 뒤에 붙인다.
- `listAdBanners`는 구조 변경 없음(풀 자격은 D1에서 좁아짐). `listJobFeed`(UNION 경로)는 계속 미연결 — append 방식이 우선순위 규칙을 더 단순하게 만족한다.

### D4. 수집 공고 상세 페이지

- 새 공개 프로시저 `bambi.crawledJobs.getById({ id: uuid })` (새 파일 `packages/api/src/routers/bambi/crawled-jobs.ts`, 라우터 조립 파일에 등록):
  - `status='active'`가 아니면 NOT_FOUND.
  - **공개 필드만**: id, title, shopName, body, region, district, industryCategory, payAmount, payUnit, payRaw, gender, ageRange, workSchedule, thumbnailUrl, detailImageUrls, sourcePostedAt, listingType.
  - **절대 미노출**: contactName/contactPhone/contactKakao/bizName/address/sourceUrl (운영자 전용 리드 — 기존 `crawler.list` 주석의 원칙 그대로).
- 새 라우트 `apps/web/src/app/seeker/jobs/crawled/[id]/page.tsx` + 전용 화면 컴포넌트:
  - 기존 `SeekerJobDetailResponsive`를 재사용하지 않는다 — "검수 통과한 공고"·"검증 완료" 배지가 하드코딩이라 수집 공고에 거짓 신호가 된다.
  - 구성: 제목(shopName + title), 지역·업종(라벨 맵 경유, enum 원값 노출 금지), 급여(`formatMarketplacePay`, 없으면 payRaw, 그것도 없으면 협의), 본문, 상세 이미지 세로 스택, **"외부에서 수집된 공고" 고지**, 좌·우 광고 레일(기존 상세와 동일 배치). 채팅·리뷰·신고·연락처 타일 없음.
- 매퍼 `toAdBannerItem`: `href = isCrawled ? \`/seeker/jobs/crawled/${job.id}\` : \`/seeker/jobs/${job.id}\``. 섹션 카드(`toMarketplaceJob`) 쪽도 수집 공고면 같은 경로로 이동해야 한다 — `Job`에 상세 경로 결정 근거(source)를 실어 `openJob`이 분기.

### D5. 배너 이미지 비율

- `AdBannerItem`에 `crawled: boolean` 추가(매퍼가 `job.source === "crawled"`로 세팅).
- `AdBanner`(세로)·`HorizontalAdBanner`(가로): `crawled`면 고정 `aspect-[4/9] h-52` / `aspect-[7/3]` + `object-cover` 대신 **원본 고유 비율**로 렌더(`h-auto w-full`, 자르지 않음). 결제 광고 렌더는 변경 없음. 레일은 세로 스택이라 높이 가변을 흡수하고, 상단 프리미엄 그리드는 셀 높이가 달라질 수 있음을 감수한다(잘린 배너보다 낫다).

### D6. 섹션별 수집 리미트

- `bambi_site_settings`에 nullable int 4컬럼(마이그레이션 0051, 기존 `adBannerRotationMinutes` 패턴):
  `crawled_ad_banner_limit` / `crawled_special_limit` / `crawled_urgent_limit` / `crawled_recommended_limit`.
- 코드 폴백 `DEFAULT_CRAWLED_LIMITS = { adBanner: 8, recommended: 12, special: 12, urgent: 12 }` — 새 서비스 파일 `packages/api/src/services/bambi-crawled-limits.ts`의 `readCrawledLimits()`가 null을 폴백으로 치환해 돌려준다.
- 적용 지점 두 곳:
  1. **수집 시** (`collectQueenalbaMainListings`): 배너는 리다이렉터 해석 **전에** 상한만큼만 자르되 **방향별로 각각** 적용한다(실물이 가로 6·세로 7이라 총량 상한을 DOM 순서로 자르면 세로가 굶는다 — 구현 중 실측으로 확인해 방향별로 전환). 섹션 라벨은 타입별 상한 초과분의 라벨을 떼어 일반 카드로 취급.
  2. **조회 시** (`jobs.list` 섹션 쿼리·`loadCrawledAdBannerPools`): LIMIT에 같은 값 적용(과거 회차의 초과 라벨 방어).
- site-settings 라우터에 `getCrawledLimits`(admin, 무입력) / `updateCrawledLimits`(admin, `{ adBannerLimit: int 0–60 | null, specialLimit: …, urgentLimit: …, recommendedLimit: … }`) 추가 — `CRAWLED_EXPOSURE_COLUMNS`와 같은 컬럼 그룹 패턴.

### D7. 업종 지정 UI + 보존 버그 수정

- 운영자 크롤러 페이지에 "업종 검토 대기" 카드 추가: `crawler.list({ status: 'needs_review' })` 목록(제목·업소명·지역·원본 업종 industryRaw·수집일) + 행별 업종 Select(8종, `lib/bambi`의 라벨 맵) → 선택 즉시 `crawler.setIndustryCategory` 호출(기존 노출 스위치 카드처럼 저장 버튼 없음), 성공 시 목록·요약 invalidate. shadcn 컴포넌트 재사용.
- 리미트 카드도 같은 페이지에 추가(4개 숫자 입력 + 저장, 빈 값 = 기본값 사용 표기).
- **ingest upsert 수정**: on conflict 시
  `industry_category = coalesce(excluded.industry_category, crawled_job_post.industry_category)`,
  `status = case when coalesce(excluded.industry_category, crawled_job_post.industry_category) is null then 'needs_review' else 'active' end`.
  재수집이 운영자 지정을 보존하고, expired였던 공고가 다시 살아나는 것은 의도된 동작이다.

## 병렬 구현 분해 (파일 소유권 — 충돌 방지)

| 에이전트 | 소유 파일 | 의존 |
|---|---|---|
| W1 스키마·설정 | `packages/db/src/schema/bambi.ts`, 마이그레이션 0051, `packages/api/src/services/bambi-crawled-limits.ts`, `packages/api/src/routers/bambi/site-settings.ts` | 없음(선행) |
| W2 파서·ingest | `bambi-crawl-queenalba-main.ts`(+test), `bambi-crawl-ingest.ts`(+test), `__fixtures__/crawl-html.ts` | W1의 `readCrawledLimits` |
| W3 피드·섹션·풀 | `routers/bambi/jobs.ts`, `bambi-job-feed.ts`(+test), `bambi-crawled-ad-banner-slots.ts`(+test), `bambi-crawl-ad-banners.ts`(+test) | W1 |
| W4 상세 페이지·비율 | `routers/bambi/crawled-jobs.ts`(신규)+라우터 조립, `apps/web/.../jobs/crawled/[id]/`, `api-job-mapper.ts`(+test), `ad-banner.tsx`, `api-jobs.ts`, `visual-job-components.test.ts`, `screens/seeker-marketplace.tsx`·`Job` 타입 파일(카드 클릭 분기) | 없음 |
| W5 운영자 UI | `apps/web/src/app/moderator/crawler/page.tsx` | W1의 limits 프로시저 시그니처(스펙에 고정) |

실행: W1 → (마이그레이션 적용·검증) → W2·W3·W4·W5 병렬 → 타입체크·테스트 검증 → 실패 시 1회 수리 라운드.

## 테스트

- 파서: `#main_center`만 가로로 수집, `#main_top_center`·`#main_left` 배너 무시, 우대/프리미엄/스페셜 alt → special/urgent/recommended 라벨, 중복 공고 우선순위, 자체 급구·추천 미라벨.
- ingest: 리미트 상한 적용(배너 해석 요청 수 포함), 낡은 라벨 리셋(메인 0건이면 스킵), 업종 보존 coalesce.
- 피드·섹션: 스위치 off면 미주입, 유료 뒤 배치, impression에 수집 행 미포함, 필터 적용.
- 풀: `ad_banner`+방향 URL만 자격, borrowing 제거.
- 웹: href 분기(`/seeker/jobs/crawled/`), crawled 비율 분기, 업종 Select 뮤테이션 배선.

## 이번 범위 밖 (보고서에 플래그)

- 퀸알바 자체 급구·추천 섹션 매핑 — 사용자가 원하면 매핑 한 줄 추가.
- foxalba 메인 파서(현재 목록만 수집).
