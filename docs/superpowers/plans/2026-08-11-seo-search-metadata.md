# 기존 공개 영역 전체 SEO·공공 구직정보 보완 계획

> **For agentic workers:** 이 문서의 체크박스는 구현과 검증이 실제로 끝난 뒤에만 완료 처리한다.

**Goal:** 별도 랜딩 페이지나 신규 URL을 만들지 않고, 밤비알바의 기존 메인·지역/업종별 채용정보·공개 커뮤니티·사이트맵·공용 푸터를 함께 정비한다. Google이 밤알바 및 관련 검색어와 각 기존 페이지의 실제 주제를 이해할 수 있도록 metadata, 화면 본문, 내부 링크, 구조화 데이터와 `SITE_KEYWORDS`를 일관되게 보강하고, 구직자가 고용노동부·고용센터·체불사업주·법률구조 공식 정보를 쉽게 찾도록 한다.

**Architecture:** 공통 검색 문구는 `seo.ts`, 지역·업종 문구는 `job-landing.ts`, 공개 게시판 문구는 `public-community.ts`와 각 `/board` metadata를 단일 진실원으로 사용한다. `/jobs`의 기존 161개 경로와 공개 게시판/게시글을 `sitemap.ts` 및 실제 `<a>` 내부 링크로 연결한다. 공공기관 자료는 밤비알바가 복제·재게시하지 않고 공식 최신 원문으로 연결하며, 외부 링크 집합은 별도 상수로 관리한다.

**Tech Stack:** Next.js 16 App Router Metadata API, TypeScript, JSON-LD, MetadataRoute Sitemap/Robots, Vitest, Google Search Console.

## 고정 전제

- 사용자가 직접 요청하기 전까지 신규 SEO 랜딩 페이지, 신규 검색어별 URL, 복제 페이지를 만들지 않는다.
- Google 사용자의 검색어를 전달받아 동일 URL의 제목을 실시간 교체하지 않는다. 각 기존 URL은 크롤링 가능한 고정·일관 metadata를 제공한다.
- Google의 제목/설명 재작성 가능성만 높이며 재작성 여부, 색인 시점, 검색 첫 페이지 노출을 보장하지 않는다.
- Google이 순위에 사용하지 않더라도 사용자 요구에 따라 `meta keywords`를 확장한다.
- 키워드는 크롤러에게만 숨기지 않는다. 사용자에게 보이는 title, description, `h1`, 소개 본문은 실제 서비스 내용과 일치시킨다.
- 경쟁 서비스 전체를 한 제목·설명에 나열하지 않는다. 경쟁 서비스명은 공통 `keywords`에 담고, 사용자에게 보이는 문구에는 페이지별로 확정된 소수만 자연스럽게 사용한다.
- 기존 canonical, 공개/비공개 정책, 인증 게이트, 공고/게시판 기능과 URL 체계를 유지한다.
- 공공기관 정보를 밤비알바 자체 데이터처럼 복제하지 않는다. 공식 사이트가 관리하는 최신 원문으로 연결한다.
- DB 변경은 없다. Drizzle migration을 만들지 않는다.
- 사용자가 별도로 요청하기 전에는 커밋하거나 push하지 않는다.

## 동기 요청의 해석과 이번 범위

동기의 요청은 `SITE_KEYWORDS` 배열만 늘리는 작업이 아니다. 다음 공개 검색 자산을 함께 조사·감사하고 부족한 신호를 보완하는 작업으로 정의한다.

1. **메인 사이트 신호:** 사이트명, 공통 title/description, Open Graph, Organization/WebSite JSON-LD.
2. **지역별 채용정보:** `/jobs`, 16개 지역, 지역×9개 업종을 합친 기존 161개 공개 URL의 고유 metadata·본문·내부 링크·사이트맵.
3. **체불사업주 및 구직자 보호:** 고용노동부 체불사업주 명단, 관할 지방고용노동관서, 고용센터, 임금체불 상담/신고, 대한법률구조공단 등 공식 원문 연결.
4. **커뮤니티 게시판:** `/board`, 공개 게시판 3종, 공개 게시글의 metadata·본문 요약·사이트맵·DiscussionForumPosting JSON-LD.
5. **크롤링 기반:** `robots.ts`, `sitemap.ts`, canonical, 공개 푸터/브레드크럼/페이지네이션의 실제 링크.
6. **검색어 조사:** 동종 서비스명, 구직 의도, 업종, 지역 조합을 분류해 공통·페이지별 keywords로 적용.

## 현재 구현 감사 결과

### 이미 구현되어 유지·회귀 검증할 것

- `seo.ts`의 공통 `SITE_TITLE`, `SITE_DESCRIPTION`, `SITE_KEYWORDS`, Organization/WebSite JSON-LD.
- `/jobs` 1개 + 16개 지역 + 16×9개 지역/업종 = 161개 공개 경로.
- `/jobs` 페이지의 서버 렌더링 공고 24개, 지역/업종 소개, 브레드크럼과 기존 페이지 간 실제 `<a>` 링크.
- `/board` 허브, `notice`, `free`, `work_talk` 공개 목록 및 공개 게시글 상세.
- 게시글 상세의 `DiscussionForumPosting` 및 게시판/공고의 `BreadcrumbList` JSON-LD.
- 사이트맵의 공개 채용 경로, 게시판, 게시판별 최신 글 최대 200개.
- 프로덕션 robots allow 및 sitemap 선언, 비프로덕션 전체 disallow 정책.
- 공용 푸터의 `지역별 채용 정보`, `커뮤니티 게시판`, `공지사항`, 고용노동부 `체불사업주 명단` 독립 고정 링크. 체불사업주 명단은 다른 공공정보 배열로 통합하거나 제거하지 않는다.
- 체불사업주 명단을 밤비알바에 복사하지 않고 고용노동부 최신 원문으로 연결하는 정책.

### 부족하여 설계·구현할 것

- 공통 및 지역·업종별 keywords의 명시적 생성·중복 제거·테스트.
- 메인·공고·게시판의 title/description/화면 본문 검색 의도 정합성.
- 지역/업종별 키워드 별칭(`룸싸롱/룸살롱`, `텐프로/쩜오`, `BAR/바`) 처리.
- 공공 구직정보 링크를 체불사업주 하나에서 관할관서·고용센터·임금체불 상담·법률구조까지 확장하고 목적별로 명확히 표시.
- 게시글 구조화 데이터의 `mainEntityOfPage`, 본문 `text`, 댓글 및 상호작용 통계 중 실제 데이터로 안전하게 제공 가능한 항목 검토·보강.
- 외부 사용자 작성 링크가 공개 본문에 렌더링된다면 `rel="ugc"` 및 필요 시 `nofollow` 적용 여부 검증.
- metadata·사이트맵·robots·내부 링크를 자동 테스트로 잠그는 범위 확대.

### 이번에 하지 않을 것

- 목록 페이지에 부정확한 `JobPosting` JSON-LD를 붙이지 않는다. Google의 JobPosting은 개별 공고 상세 내용과 지원 가능한 공개 페이지가 전제인데, 현재 상세는 인증 게이트 뒤에 있다.
- 신규 공개 공고 상세, 신규 공공정보 안내 페이지, 신규 게시판을 만들지 않는다.
- 경쟁 사이트 콘텐츠 복제, 자동 생성 비교글, 크롤러 전용 텍스트, 백링크 구매를 하지 않는다.

## 조사한 공식 공공정보와 적용 방식

| 목적 | 공식 출처 | 적용 방식 |
| --- | --- | --- |
| 체불사업주 확인 | 고용노동부 `https://www.moel.go.kr/info/defaulter/defaulterList.do` | 기존 푸터 링크 유지, URL·새 탭·라벨 테스트 |
| 관할 노동관서 확인 | 고용노동부 `https://www.moel.go.kr/minwon/rigion/rigion_C2.do` | 공공 구직정보 링크에 추가 |
| 고용센터 찾기 | 고용24 `https://ei.work24.go.kr/ei/eim/cp/cc/ccJobCenSearch/retrieveCcJobCenSearch.do` | 공공 구직정보 링크에 추가 |
| 고용·노동 상담 | 고용노동부 고객상담센터 1350 | 전화 `tel:1350` 또는 공식 상담 페이지 연결 |
| 임금체불 신고 안내 | 고용노동부/노동포털 공식 민원 | 공식 신청 경로를 구현 직전 재확인 후 연결 |
| 체불임금 법률구조 | 대한법률구조공단 `https://www.klac.or.kr` | 무료 법률지원 공식 원문 연결 |

- 링크 라벨은 `체불사업주 명단`, `관할 고용노동관서 찾기`, `고용센터 찾기`, `임금체불 상담 1350`, `대한법률구조공단`처럼 목적을 직접 설명한다.
- 외부 공식 링크에는 새 탭과 안전한 `rel`을 적용한다.
- 공공기관 URL은 변경될 수 있으므로 구현 시 HTTP 응답과 최종 canonical 목적지를 다시 확인한다.
- 푸터를 과밀하게 만들지 않도록 `구직자 보호 정보` 묶음 또는 기존 정책 내비게이션의 별도 그룹으로 배치한다. 정확한 UI는 기존 데스크톱·모바일 푸터 레이아웃 안에서 결정한다.

## 검색어 조사 결과와 `SITE_KEYWORDS`

### 조사 기준

- 2026-08-11 Google의 `밤알바`, `유흥알바`, `룸알바`, `퀸알바`, `여우알바`, `레이디알바` 검색 결과.
- 여우알바, 레이디알바, 하루이야기, 이브알바, 피에스타 등 공개·색인 페이지의 실제 title/description/본문.
- 밤비알바 내부 업종 정본 `bambi-options.ts`와 지역 정본 `job-landing.ts`.
- Google 공식 문서의 title link, keyword stuffing, sitemap, discussion forum structured data 기준.

### 공통 고정 목록

기존 24개는 모두 유지한다.

`유흥알바`, `밤비알바`, `밤알바`, `룸알바`, `노래주점알바`, `룸싸롱알바`, `유흥구인구직`, `고소득알바`, `여성알바`, `접객알바`, `퀸알바`, `밤일알바`, `여우알바`, `악녀알바`, `노래방도우미`, `보도알바`, `텐프로`, `안마`, `마사지`, `주점`, `유흥업소알바`, `아가씨알바`, `구인구직 사이트`, `이브알바`

동종 서비스/관련 브랜드 24개를 추가한다.

`레이디알바`, `하루이야기`, `하루이야기 알바`, `전국밤알바`, `나나알바`, `피에스타`, `피에스타 알바`, `미소알바`, `오빠야알바`, `버블알바`, `소라알바`, `꿀알바`, `캣알바`, `채리알바`, `러브알바`, `미수다알바`, `이지알바`, `구미호알바`, `알바걸스`, `호박알바`, `루비알바`, `초이스알바`, `여우알바 사이트`, `퀸알바 사이트`

구직 의도 26개를 추가한다.

`유흥알바 사이트`, `밤알바 사이트`, `룸알바 사이트`, `여성알바 사이트`, `고소득알바 사이트`, `유흥구인`, `유흥구직`, `유흥알바 구인구직`, `밤알바 구인구직`, `룸알바 구인구직`, `여성알바 구인구직`, `여성구인구직`, `여성구인`, `여자알바`, `여자밤알바`, `여성밤알바`, `여성유흥알바`, `고수입알바`, `고페이알바`, `업소알바`, `업소 구인구직`, `당일알바`, `단기알바`, `초보알바`, `주말알바`, `알바 채용 정보`

업종·현장 표현 25개를 추가한다.

`노래방알바`, `노래방도우미알바`, `노래방도우미 구인`, `룸살롱알바`, `단란주점알바`, `다방알바`, `요정알바`, `텐프로알바`, `쩜오알바`, `텐프로 쩜오 알바`, `텐카페알바`, `가라오케알바`, `퍼블릭알바`, `하이퍼블릭알바`, `셔츠룸알바`, `바알바`, `BAR알바`, `마사지알바`, `안마알바`, `주점알바`, `고소득 여성알바`, `유흥업소 구인`, `유흥업소 구직`, `밤알바 후기`, `유흥알바 후기`

공통 목록은 기존 24개 + 추가 75개 = 총 99개다. 문자열 완전 중복을 제거하고 순서를 테스트한다.

### 제외 키워드

- `남자유흥알바`, `호빠알바`, `선수알바`, `호스트알바`, `아빠방`: 현재 서비스 대상·업종과 불일치 가능성이 있어 제외.
- `BJ알바`, `재택알바`, `카페알바`, `마트알바`: 현재 공개 공고 업종과 직접 연결되지 않아 제외.
- 무관한 일반명사·성인 서비스 검색어: 검색 유입만을 위한 키워드 스터핑이므로 제외.

### 기존 공고 페이지의 동적 keywords

- 지역 16개: `서울`, `경기`, `인천`, `부산`, `대구`, `광주`, `대전`, `울산`, `강원`, `충북`, `충남`, `전북`, `전남`, `경북`, `경남`, `제주`.
- 업종 9개: `BAR`, `기타`, `노래주점`, `다방`, `단란주점`, `룸싸롱`, `마사지`, `요정`, `텐프로/쩜오`.
- `/jobs/[region]`: `${지역} 밤알바`, `${지역} 유흥알바`, `${지역} 여성알바`, `${지역} 고소득알바`, `${지역} 구인구직`.
- `/jobs/[region]/[industry]`: `${지역} ${업종} 알바`, `${지역} ${업종} 구인`, `${지역} ${업종} 채용`.
- 별칭: 룸싸롱→룸살롱알바, 텐프로/쩜오→텐프로알바·쩜오알바, 노래주점→노래방알바·노래방도우미알바, BAR→바알바, 마사지→마사지알바.
- 공통 99개와 페이지별 목록은 공용 병합 함수에서 중복 제거한다. Next.js metadata의 암묵적 상속에 의존하지 않는다.

## 페이지별 문구 정책

### 메인 `/seeker` 및 루트 공통

- 제목 초안: `밤비알바 - 밤알바·여우알바·퀸알바 | 유흥알바 구인구직`.
- 설명은 핵심 세 검색어, 지역·업종별 채용 탐색, 1:1 채팅을 한두 문장으로 설명한다.
- `SITE_TITLE`, `SITE_DESCRIPTION`, Open Graph, WebSite/Organization JSON-LD가 같은 주장을 사용한다.
- 사이트의 실제 대표 이름은 `밤비알바`로 유지하고 경쟁 서비스명을 `alternateName`처럼 오인시키지 않는다.

### 지역·업종별 채용 `/jobs/**`

- `/jobs`: 전국 지역·업종별 밤알바·여우알바·퀸알바 관련 채용 정보.
- `/jobs/[region]`: 지역명 + 밤알바/여우알바/퀸알바 채용 의도.
- `/jobs/[region]/[industry]`: 지역명과 실제 업종을 앞에 두고 별칭을 자연스럽게 보조.
- title, description, `h1`, 소개 문단과 BreadcrumbList가 같은 지역·업종을 가리킨다.
- 모집 공고가 0개여도 허위 공고 수나 조건을 만들지 않는다.
- 기존 161개 경로, 공고 조회, 로그인 전환은 그대로 유지한다.

### 커뮤니티 `/board/**`

- `/board`: `밤알바·여우알바·퀸알바 정보 커뮤니티 | 밤비알바`로 표시하고, 사용자에게 보이는 경쟁 서비스명은 팀이 확정한 여우알바·퀸알바까지만 사용한다.
- 게시판 목록은 게시판 label/description과 페이지 번호를 우선한다.
- 게시글 상세는 원문 제목을 앞에 유지하고 실제 본문 평문 요약을 description/text로 사용한다.
- 본문이 비면 게시판 설명으로 폴백한다. 무관한 브랜드/업종 키워드를 게시글마다 일괄 삽입하지 않는다.
- DiscussionForumPosting은 실제 제공 가능한 `mainEntityOfPage`, `headline`, `text`, `datePublished`, `dateModified`, author, 댓글·좋아요 통계를 Google 규격에 맞게 검증한다.
- 공개되지 않는 중고거래·무료 법률 자문·베스트글·비밀글·외부 수집 글은 사이트맵이나 구조화 데이터에 넣지 않는다.

## 구현 작업

### Task 1: 공통 SEO 및 keywords 생성기

**Files:**

- Modify: `apps/web/src/lib/bambi/seo.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Create/Modify: `apps/web/test/lib/bambi/seo.test.ts`

- [ ] 기존/추가 총 99개 키워드를 정확히 추가한다.
- [ ] 공통+페이지 keywords 중복 제거 병합 함수를 추가한다.
- [ ] 메인 title/description/Open Graph/JSON-LD를 같은 정책으로 갱신한다.
- [ ] 키워드 수·순서·중복·빈 문자열 회귀 테스트를 추가한다.
- [ ] `feat: 공통 SEO 문구와 검색 키워드 보강` 커밋 단위로 준비한다.

### Task 2: 지역·업종별 채용정보 SEO

**Files:**

- Modify: `apps/web/src/lib/bambi/job-landing.ts`
- Modify: `apps/web/src/app/jobs/page.tsx`
- Modify: `apps/web/src/app/jobs/[region]/page.tsx`
- Modify: `apps/web/src/app/jobs/[region]/[industry]/page.tsx`
- Modify: `apps/web/src/components/bambi/public-job-landing.tsx`
- Modify: `apps/web/test/lib/bambi/job-landing.test.ts`

- [ ] 인덱스·지역·지역/업종별 고유 title/description/keywords 생성기를 테스트한다.
- [ ] 업종 별칭과 지역 조합을 중복 없이 생성한다.
- [ ] 화면 `h1`·소개 문단·내부 링크 앵커를 metadata와 정합하게 보강한다.
- [ ] 161개 경로 수, canonical, BreadcrumbList와 사이트맵 포함을 유지한다.
- [ ] 목록에 부정확한 JobPosting JSON-LD가 생기지 않는지 확인한다.
- [ ] `feat: 지역·업종별 채용정보 SEO 보강` 커밋 단위로 준비한다.

### Task 3: 공개 커뮤니티 SEO·구조화 데이터

**Files:**

- Modify: `apps/web/src/lib/bambi/public-community.ts`
- Modify: `apps/web/src/app/board/page.tsx`
- Modify: `apps/web/src/app/board/[boardSlug]/page.tsx`
- Modify: `apps/web/src/app/board/[boardSlug]/[postId]/page.tsx`
- Create/Modify: 공개 게시판 metadata/JSON-LD 테스트

- [ ] 허브·목록·상세의 고유 title/description/canonical 테스트를 추가한다.
- [ ] 빈/짧은/긴 게시글 본문 요약 폴백을 검증한다.
- [ ] DiscussionForumPosting을 Google 지원 속성 기준으로 보강한다.
- [ ] 댓글·좋아요 등 실제 수치만 구조화 데이터에 포함한다.
- [ ] 공개 UGC 외부 링크의 `ugc` 처리 여부를 렌더러까지 추적해 보완한다.
- [ ] 사이트맵 최신 글 상한과 페이지네이션 발견 가능성을 유지한다.
- [ ] `feat: 공개 커뮤니티 검색 메타와 구조화 데이터 보강` 커밋 단위로 준비한다.

### Task 4: 공공 구직정보·체불사업주·고용센터 링크

**Files:**

- Modify: `apps/web/src/components/bambi/site-footer.tsx`
- Create: `apps/web/src/lib/bambi/employment-resources.ts` 또는 기존 정책 상수 파일
- Create/Modify: 공용 푸터 링크 회귀 테스트
- Modify: `docs/test-flows/seeker-test-flow.md`

- [ ] 체불사업주 명단 기존 독립 링크가 다른 공공정보 목록과 무관하게 항상 렌더되는지 확인한다.
- [ ] 관할 고용노동관서, 고용센터, 1350, 대한법률구조공단 공식 링크를 검증한다.
- [ ] 외부 링크를 공용 상수로 관리하고 새 탭·안전한 rel을 일관 적용한다.
- [ ] 모바일/데스크톱 푸터에서 링크 묶음이 깨지거나 과밀하지 않은지 확인한다.
- [ ] 공식기관 제휴 또는 밤비알바 자체 상담으로 오해되지 않는 안내를 유지한다.
- [ ] `feat: 구직자 보호 공공정보 링크 보강` 커밋 단위로 준비한다.

### Task 5: sitemap·robots·내부 링크 통합 검증

**Files:**

- Modify if needed: `apps/web/src/app/sitemap.ts`
- Modify if needed: `apps/web/src/app/robots.ts`
- Modify/Create: sitemap·robots·공개 링크 테스트
- Modify: `docs/test-flows/seeker-test-flow.md`

- [ ] sitemap에 메인, 161개 공고 경로, 게시판 허브/목록, 최신 공개 글이 포함되는지 검증한다.
- [ ] 비공개·작성·수정·인증 필요 URL이 사이트맵에 섞이지 않는지 검증한다.
- [ ] 프로덕션 allow/비프로덕션 disallow 정책을 유지한다.
- [ ] 푸터→공고/게시판, 공고 상호 링크, 게시판 브레드크럼/페이지네이션이 실제 href인지 확인한다.
- [ ] canonical URL과 sitemap URL이 같은 정본 함수를 사용하는지 확인한다.
- [ ] `test: 공개 SEO 경로와 크롤링 회귀 검증` 커밋 단위로 준비한다.

## 검증 기준

### 자동 검증

- 관련 Vitest
- `pnpm --filter web check-types`
- 변경 파일 Biome 검사
- `git diff --check`
- production build 또는 대표 경로 metadata 렌더 검사

### 수동 검증

- `/seeker`, `/jobs`, `/jobs/seoul`, `/jobs/seoul/room-salon`, `/board`, 게시판 목록, 게시글 상세의 렌더된 title/description/keywords/canonical/Open Graph 확인.
- 구조화 데이터 Rich Results Test 또는 동등한 JSON-LD 유효성 검사.
- `/sitemap.xml`, `/robots.txt`의 프로덕션 조건 확인.
- 모든 공공기관 링크의 공식 도메인·최종 목적지·모바일 열림 확인.
- 모바일 360px와 데스크톱에서 공용 푸터 줄바꿈 및 접근성 이름 확인.
- 배포 후 Search Console URL 검사와 사이트맵 제출 상태 확인.
- 검색어별 노출수·클릭수·CTR·평균 게재순위를 배포 전 기준선과 비교하되 즉시 반영을 합격 조건으로 삼지 않는다.

## PR 전 조건

- 최신 `origin/develop`을 다시 반영하고 충돌을 해결한다.
- DB 변경과 migration이 없음을 확인한다.
- 동료의 기존 이슈·PR 형식과 문체를 확인한다.
- 이슈에는 기존 공개 SEO 자산 감사 결과와 변경 범위를 명시한다.
- PR에는 목적, 공통/지역/커뮤니티/공공정보 변경, 테스트 및 수동 검증 결과를 구체적으로 작성하고 `Closes #번호`를 넣는다.
- 사용자가 직접 커밋·push할 수 있도록 정확한 PowerShell 명령만 제공하고 Codex가 임의로 커밋·push·merge하지 않는다.

## 구현 전 반드시 확인할 두 항목

- [ ] 메인 제목 초안 `밤비알바 - 밤알바·여우알바·퀸알바 | 유흥알바 구인구직`을 그대로 사용할지 사용자 확인.
- [ ] 경쟁 서비스명을 사용자에게 보이는 title/description에도 사용할 수 있다는 팀 정책 확인. 미확인 시 경쟁 서비스명은 `keywords`에만 넣고 화면 문구에는 `밤알바·유흥알바·룸알바` 같은 일반 검색어만 사용한다.
