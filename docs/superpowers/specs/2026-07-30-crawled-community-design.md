# 수집 커뮤니티 글 통합 노출 · 댓글 수집 설계

2026-07-30. 사용자 지시: (1) 크롤링한 커뮤니티 글을 공고처럼 **union으로 순수 글과 함께**
커뮤니티에 렌더, (2) 이 노출을 **ON/OFF 스위치**로 제어, (3) 본문만 받던 커뮤니티 상세에서
**댓글도 수집** — 수집 방법 계획 포함.

## 실측 (실물 상세 HTML 4건 프로브)

- 수집 대상: `crawled_community_topic`(퀸알바 "밤문화이야기" 게시판, 제목·조회수·댓글수·
  본문 마스킹 저장). 현재 **어느 라우터에도 노출되지 않는다**.
- **댓글은 상세 HTML에 인라인**으로 전부 렌더돼 있다(실측 21·6·1·0개) — 추가 요청 불필요,
  이미 받는 상세 응답에서 파싱만 하면 된다. `bbs_short_comment.php`는 작성용 엔드포인트다.
- 댓글 구조: **댓글 하나 = TR 하나**, 셀 3개 = [작성자 닉네임 | 본문 `#comment_id_N` | 작성일시
  `YYYY-MM-DD HH:MM:SS`]. 본문 셀의 직계 자식은 [마커 span 또는 아이콘 img] + 본문 span
  (사용자 셀렉터: 댓글 `#comment_id_N > span:nth-child(2)`), 대댓글은 본문 span 하나뿐
  (`#comment_id_N > span`). → **파싱 규칙: 직계 자식 span 중 마지막 것이 본문**(세 변형 모두
  포괄). `secret-comment`(비밀댓글) 블록은 건너뛴다.
- 순수 커뮤니티: `communityRouter.listPosts`(멤버 게이트·페이지네이션 20)·`overview`(공개,
  게시판별 4)·`getPost`. 게시판 5종(best/free/work_talk/market/notice).

## 설계 결정

### D1. 댓글 저장 — topic 행의 jsonb 컬럼
`crawled_community_topic.comments: jsonb` —
`{ authorName: string | null; body: string; sourcePostedAt: string | null }[]`, **null = 아직
미수집, [] = 수집했으나 0개**(이 구분이 백필 판정 기준). 별도 테이블은 비채택 — 댓글 단위
조회·모더레이션 요구가 없고, 재수집 시 통째 교체가 멱등이라 jsonb가 가장 싸다.
- 본문은 `maskContacts` + `normalizeText` 적용(원본 커뮤니티 글은 본문에 연락처를 그대로
  적는다 — 기존 본문과 같은 원칙). 상한: 댓글 100개·건당 1,000자.
- 작성자 닉네임은 원본 공개 필명 그대로 저장(실명 아님), 날짜는 파싱 실패 시 null.

### D2. 수집 흐름 — 기존 상세 패스 확장
- `parseQueenalbaCommunityDetail`이 `comments`를 함께 반환.
- 수집기의 상세 대상 판정을 "본문 없는 글"에서 "**본문 없거나 comments가 null인 글**"로
  확장 — 배포 시 기존 행(comments null)이 한 차례 자연 백필되고, 이후 정상 상태로 복귀.
  fetch-once 원칙은 유지한다(댓글 갱신 추적을 위한 주기 재수집은 비채택 — 매 회차 150건
  재타격 대비 가치가 없고, 필요해지면 그때 주기를 단다).
- 상세 수집 시 `commentCount`를 실제 수집된 댓글 수로 동기화(목록의 [21] 표기보다 정확).

### D3. 노출 스위치
`bambi_site_settings.crawled_community_feed_enabled: boolean, default false, notNull` —
기존 `crawledJobFeedEnabled`와 같은 무늬(수집과 노출은 별개 판단, 문제 시 노출만 즉시 차단,
배포만으로는 안 켜짐). 운영자 크롤러 페이지의 기존 스위치 UI 옆에 동일 패턴으로 추가.

### D4. union 렌더 — 순수 1순위·수집 2순위
- 매핑: 수집 글은 **work_talk(일 이야기) 게시판에 합류**(밤문화이야기와 성격이 가장 가깝다;
  게시판 상수 하나라 바꾸기 쉽게 둔다).
- `listPosts`(해당 게시판)와 `overview.workTalk`에서 스위치 ON일 때 drizzle **UNION**으로
  순수·수집을 한 쿼리로 합치고, `ORDER BY is_crawled ASC, created_at DESC` + LIMIT/OFFSET —
  페이지네이션이 깨지지 않으면서 공고와 같은 우선순위(1순위 순수, 2순위 수집)가 성립한다.
  totalCount도 스위치 ON이면 합산.
- 수집 글 요약의 표기: authorName은 원본 게시판명("밤문화이야기"), 수집 표시는 응답의
  `source: "crawled"` 필드로 구분(화면이 "외부 수집" 배지 렌더). 좋아요·잠금·프로모션 없음.
- 상세: 수집 글 클릭 → 전용 프로시저 `community.getCrawledTopic`(순수 getPost와 같은
  멤버 게이트 + 스위치 게이트) — 제목·본문·댓글 목록·조회수·원 게시일 반환. **sourceUrl은
  내려보내지 않는다**(공고와 같은 원칙). 댓글 작성·좋아요·수정 없음.
- 화면: work_talk 목록·홈 미리보기에 "외부 수집" 배지, 수집 글 전용 상세 화면(수집 공고
  상세와 같은 정직한 고지 + 댓글 목록 렌더).

## 파일 소유권 (병렬 3분할)

| 작업 | 파일 |
|---|---|
| W1 (db+수집) | `packages/db/src/schema/bambi.ts`(+0053 마이그레이션 생성), `bambi-crawl-queenalba.ts`(댓글 파서), `bambi-crawl-ingest.ts`(백필 판정·commentCount 동기화), 픽스처·테스트 |
| W2 (api) | `packages/api/src/routers/bambi/community.ts`(union·getCrawledTopic), `site-settings.ts`(스위치), 관련 서비스·테스트 |
| W3 (web) | 운영자 크롤러 페이지(스위치), 커뮤니티 목록/홈(배지·라우팅), 수집 글 상세 화면·라우트 |

W2·W3는 W1의 컬럼·타입 계약(comments jsonb·스위치 컬럼)에 의존 — 병렬 진행하되 통합
타입체크는 컨트롤러가 마지막에 한다. 마이그레이션 적용(migrate)은 컨트롤러 담당.
