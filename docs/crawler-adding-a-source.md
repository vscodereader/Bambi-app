# 크롤 소스 추가 가이드

새 사이트·데이터 종류를 크롤러에 꽂는 방법. 프레임워크(수집기·스케줄러·운영자 콘솔·테이블)는
이미 다 있고, **사이트별 파서와 등록만** 채우면 그 조합이 켜진다. 여우알바×공고와
퀸알바×(공고·커뮤니티)가 참고 구현이다.

현재 구현된 조합:

| 사이트 | 공고 | 커뮤니티 | 비고 |
| --- | --- | --- | --- |
| 여우알바 | O | (사이트에 없음) | 게이트 없음 |
| 퀸알바 | O | O | 전 페이지가 성인인증 게이트 뒤 — 인증 세션 쿠키 필요(③) |

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

`bambi-crawl-foxalba.ts`(게이트 없음)나 `bambi-crawl-queenalba.ts`(게이트 있음)를 본떠 새 파일을
만든다. `listUrl`·`detailUrl`·`parseList`·`parseTotalCount`·`parseDetail` 다섯을 export 하면
수집기가 쓸 수 있다. 지켜야 할 규칙은 넷이다:

- 본문에 `maskContacts(normalizeText(...))` 적용 (본문에 박힌 번호까지 가림)
- 급여는 `parsePay(원문)` → `{ amount, unit }`. 단위 표기가 원문에 없는데 금액은 읽었다면
  `payUnit`을 `null`로 둔다 — 기본값 "협의"를 그대로 저장하면 금액이 있는데 협의라는 모순이 남는다
- 업종은 `mapIndustryCategory(원문)` — 매핑 실패면 `null`(수집기가 `needs_review`로 남김)
- 파싱 실패(삭제 글·마크업 변경)면 반드시 `null` 반환 (수율 판정이 이걸로 파손을 감지)

### 퀸알바 공고에서 실제로 마주친 것

- 목록이 `page=` 파라미터를 무시하고 693건 전건을 한 페이지에 준다. 그래서
  `parseQueenalbaTotalCount`는 항상 `null`이고 목록은 1회 요청으로 끝난다.
- 같은 공고가 프리미엄·일반 등 여러 섹션에 겹쳐 실린다. 섹션 구조를 따라가지 않고
  `#sub_center` 안의 상세 링크에서 `num`만 훑어 `Set`으로 접는다.
- 상세는 `<tr><td>라벨</td><td>값</td></tr>` 표다. 라벨 칸에 아이콘 `img`가 섞이고 값 칸이
  `colspan`으로 갈라져 있어, 첫 칸을 라벨·나머지 칸 전체를 값으로 읽는다. 등급 아이콘이
  중첩 표라서 `tr`을 품은 `tr`은 건너뛴다.
- 급여 칸에 `"500,000원 2026년 최저시급 10,320원"`처럼 최저임금 안내가 붙는다. 잘라내지 않으면
  안내 문구의 10,320원을 급여로 읽는다.
- `"정보없음"`은 값이 아니라 값이 없다는 뜻이라 `null`로 떨어뜨린다.
- 전화가 직통이 아니라 콜핀(대표번호 + 내선)이다. 대표번호 칸이 `"1566-1945 + 콜핀번호"`라는
  안내 문구라, 그 자리에 실제 핀을 끼워야 걸 수 있는 번호가 된다.
- 카톡 칸이 비고 텔레그램·라인·위챗에만 아이디를 남기는 공고가 흔하다. 버리면 연락 수단이
  없어지므로 메신저 이름을 붙여 `contactKakao`에 담는다.
- **본문을 이미지로만 올리는 공고가 절반 이상이다.** 빈 본문을 파싱 실패로 보면 멀쩡한 회차가
  통째로 중단된다 — `body: ""`는 정상이다.
- 성별 항목이 상세에 아예 없다(여성 전용 사이트).

**레코드 규약**은 `CrawledJobRecord`(bambi-crawl-normalize.ts) 하나다. 이 모양만 지키면 수집기는
어느 사이트에서 왔는지 몰라도 저장한다. `contactPhone`·`contactKakao`·`contactName`·`bizName`은
운영자 전용 리드라 공개 API에서 이미 제외돼 있으니, 파싱만 해서 채우면 된다.

셀렉터 확정은 **실제 응답을 받아서** 한다(추측 금지). 받은 HTML은 개인정보(담당자 실명·연락처·
카톡)를 치환해서 `__fixtures__/`에 저장하고, 그 픽스처로 파서 테스트를 쓴다. foxalba의
`bambi-crawl-foxalba.test.ts`와 `__fixtures__/foxalba-*.html`이 그대로 본보기다.

---

## ② 수집기 디스패치 — `bambi-crawl-ingest.ts`

디스패치는 이미 **사이트 어댑터**로 열려 있다. 새 사이트는 `JOB_ADAPTERS`에 항목 하나를
더하는 것으로 끝나고, 수집기 본문은 건드리지 않는다.

```ts
const JOB_ADAPTERS: Readonly<Record<CrawlSourceSite, JobSiteAdapter>> = {
  foxalba: { site: "foxalba", itemsPerPage: FOXALBA_ITEMS_PER_PAGE, listUrl: foxalbaListUrl, ... },
  queenalba: { site: "queenalba", itemsPerPage: 0, listUrl: queenalbaListUrl, ... },
};
```

`itemsPerPage`는 전체 건수로 목록 페이지 수를 계산할 때만 쓴다. 퀸알바처럼 목록이 전건을
한 번에 주는 사이트는 `0`을 넣고 `parseTotalCount`가 `null`을 돌리면 1페이지로 떨어진다.

수집기의 나머지 로직(수율 판정·멱등성·만료·중복 실행 방지)은 사이트와 무관하다.
`①`에서 목록 파서가 `sourceExternalId`만 주면 되는 이유가 이것 — 수집기가 목록에서 쓰는 값이
그거 하나다.

---

## ③ fetch 헤더/쿠키 — 게이트가 있는 소스

`createCrawlClient({ requestHeaders })`가 UA·accept 위에 소스별 헤더를 덮어쓴다. 어느 사이트에
무엇을 붙일지는 `bambi-crawl-ingest.ts`의 `crawlRequestHeaders(site)` 한 곳에서 정한다.

```ts
const cookie =
  site === "queenalba"
    ? (env.QUEENALBA_COOKIE ?? QUEENALBA_COOKIE_INLINE)
    : undefined;
```

쿠키 문자열은 소스마다 다르고 만료된다. 두 자리 중 하나에 넣는다:

- `QUEENALBA_COOKIE_INLINE` (`bambi-crawl-ingest.ts`) — .env를 안 거치고 바로 고칠 자리.
  기본값은 자리표시자라 이대로면 게이트에 막혀 회차가 실패한다.
- `QUEENALBA_COOKIE` (env) — 있으면 이쪽이 이긴다.

**개인정보 주의**: 실제 쿠키의 `adultname`·`adulbrith`·`adulphone`·`adultcode`에는 인증한
사람의 실명·생년월일·휴대폰번호·KCB 인증코드가 그대로 들어 있다. 코드에 적으면 그 정보가
git 이력에 영구히 남는다(원격에 push하면 되돌릴 수 없다). 공유 리포·배포 환경이면 env를 쓴다.

**퀸알바 게이트**: 전 페이지(`/`, `guin_list.php`, `bbs_list.php`, 상세)가 KCB 본인확인
성인인증 뒤에 있다. 인증 세션 쿠키 없이는 어떤 URL도 `adult_index.php`로 보내는 116바이트
스크립트 스텁만 돌려준다(Wayback 스냅샷도 마찬가지라 아카이브로도 못 본다). 통과에 필요한 건
`PHPSESSID` 하나가 아니라 인증 결과가 담긴 `adultcode`·`adultname`·`adulbrith`·`adulphone`
쿠키까지다 — 이름 하나만 골라 넣지 말고 브라우저 Cookie 헤더를 통째로 넣는다.

**게이트 감지**: 스텁을 그냥 파싱하면 "공고 0건"이 되고, 수율 판정이 그걸 `aborted_low_yield`로
잡아 만료 처리는 막지만 원인은 "셀렉터 파손"으로 잘못 기록된다. 그래서 `isQueenalbaGateStub`으로
fetch 직후 스텁을 알아채고(`assertNotGated`) 회차를 "쿠키 만료"라는 이름으로 실패시킨다.
robots.txt는 그대로 존중한다(퀸알바는 개별 `guin_detail.php?num=`·`bbs_detail.php?bbs_num=`
URL을 여럿 막아두었고, 클라이언트가 쿼리스트링까지 포함해 대조한다).

---

## ④ 등록 — `bambi-crawl-policy.ts`

파서와 어댑터가 준비되면 조합을 구현 목록에 추가한다. 이 한 줄이 운영자 콘솔의 "준비 중"을
풀고 스케줄러가 실제로 돌게 하는 스위치다.

```ts
export const IMPLEMENTED_CRAWL_TARGETS: readonly CrawlTarget[] = [
  { contentType: "job_post", site: "foxalba" },
  { contentType: "job_post", site: "queenalba" },
  { contentType: "community", site: "queenalba" },
];
```

`AVAILABLE_CRAWL_TARGETS`(사이트가 제공하는 종류)와 `crawl_source_site` enum은 이미 채워져 있어
**마이그레이션은 불필요**하다.

게이트가 있는 소스라도 여기서 막지 않는다 — 파서가 있는데 쿠키가 없는 건 미구현이 아니라
설정 누락이고, 그건 "준비 중"이 아니라 회차 실패로 드러나야 운영자가 무엇을 고칠지 안다.

---

## 커뮤니티(게시판)는 별도 경로

커뮤니티는 공고와 테이블·파서·수집 흐름이 다르다.

- **테이블**: `crawled_community_topic` (title·body·viewCount·commentCount·boardName).
  본래는 본문 없이 주제 신호만 모으는 설계였다(게시글은 개별 작성자의 저작물이라). 운영 판단으로
  본문까지 저장하도록 바꿨고(0045), 공고와 같은 기준으로 `maskContacts`를 적용한다 — 커뮤니티
  글도 본문에 번호·카톡을 그대로 박아둔다. 댓글은 여전히 저장하지 않는다(업소 홍보글이 대부분이라
  주제 신호로 쓸모가 없고, 그만큼 남의 글을 더 복제하게 된다).
- **파서**: 목록 + 상세 둘 다. 목록이 제목·댓글수·작성일을 주고, 상세가 본문과 조회수를 준다.
- **수집 흐름**: `crawlContentType === "community"`면 `runCrawlTick`이 `finishCommunityRun`으로
  빠진다. 만료 처리는 없다 — 지나간 주제도 "무엇이 반응을 얻었는가"의 기록으로 그대로 쓸모가
  있어 지우지 않는다. 상세는 **본문이 비어 있는 글만** 받는다(게시글 본문은 사실상 안 바뀌는데
  매 회차 150건을 다시 받으면 상대 서버를 이유 없이 두드린다).
- **범위**: `COMMUNITY_LIST_PAGES`(현재 5) 페이지까지만 훑는다. 페이지당 30건이고, 보려는 건
  지금 반응을 얻는 주제라 과거 글을 매 회차 다시 긁을 이유가 없다.
- **등록**: 위 ④에 조합 한 줄.

### 퀸알바 게시판에서 실제로 마주친 것

- 게시판이 여럿이라(`tb=comm_board2`, `cb`, `board_deal` …) `bbs_num`만으로는 유니크하지 않다.
  `sourceExternalId`를 `comm_board2:1370389`처럼 **게시판 접두**로 저장한다. 지금은 메인
  게시판(밤문화이야기) 하나만 긁는다.
- **조회수 칸은 일반 글에서 비어 있다.** 채워지는 건 상단 고정 공지뿐이다. 일반 글의 반응
  지표는 제목 뒤 `[21]`로 붙는 댓글 수가 유일하고, 그건 링크 밖 형제 노드라 `a` 텍스트가 아니라
  칸 전체 텍스트에서 읽어야 한다.
- **고정 공지는 건너뛴다**(`top_gonggi=1`). 운영 안내문이고 조회수가 20만을 넘어서, 섞이면
  "무슨 주제가 반응을 얻는가" 표의 상위권을 통째로 차지한다.
- 공고 목록과 달리 게시판은 `pg=` 파라미터가 실제로 동작한다.
- **본문은 `#ct` 한 덩어리**, 제목은 `.board-title-container h1`(목록의 `h2`는 게시판명이다).
- **조회수는 상세에만 있고, 글마다 나올 때도 안 나올 때도 있다** — 칸(`td.smfont2`)은 그대로
  있고 내용만 빈다. 본문이 있는데 조회수가 없는 걸 실패로 보면 멀쩡한 글을 매 회차 다시 받는다.
  같은 칸에 추천 수가 붙어 있어("조회 : 176 추천: 0") 라벨로 끊어 읽어야 한다.
- 목록 패스의 upsert에 `viewCount`·`body`를 넣으면 **매 회차 상세가 채운 값을 null로 되돌린다**.
  목록이 실제로 아는 필드만 갱신할 것.
- robots.txt가 개별 글을 `/bbs_detail.php?bbs_num=1064363` 형태로 통째로 막아둔 게 여럿이라,
  상세를 받기 전에 URL 단위로 `isAllowed`를 확인하고 막힌 글은 조용히 건너뛴다. 그래서
  `queenalbaCommunityTopicUrl`은 `bbs_num`을 맨 앞에 둔다(접두사 일치라 순서가 바뀌면 놓친다).

---

## 마무리 체크리스트

- [ ] 실제 응답으로 셀렉터 확정 → 개인정보 치환한 픽스처 저장 → 파서 테스트 통과
- [ ] 픽스처가 크면(퀸알바 목록 원본은 1.7MB) 파서가 보는 범위(`#sub_center`)로 잘라내고
      반복 행도 앞쪽 몇 개만 남긴다. 자른 뒤 **원본 전체로도 한 번 돌려** 축약 때문에 생긴
      착시가 없는지 확인한다
- [ ] `IMPLEMENTED_CRAWL_TARGETS`에 조합 추가
- [ ] `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-crawl` 통과
      (DB 통합 테스트가 있어 dev Postgres가 떠 있어야 한다)
- [ ] `pnpm --filter @bambi-app/api check-types` / `pnpm --filter web check-types` 통과
- [ ] 운영자 콘솔에서 그 조합의 "준비 중"이 사라지고 즉시 수집이 열리는지 확인
- [ ] 게이트가 있는 소스면 쿠키 만료 시 회차가 조용히 만료 처리로 번지지 않는지 확인

법적 판단(대상 사이트 약관·연령확인 게이트 통과·데이터베이스제작자 권리)은 코드가 아니라
운영 책임 영역이다. 이 가이드는 "어디에 무엇을 꽂는지"만 다룬다. 참고로 퀸알바 상세에는
"본 정보는 퀸알바의 동의 없이 재배포 할 수 없습니다"라는 고지가 붙어 있고, 성인인증은 실명
확인이라 쿠키를 넣는 순간 그 계정 명의로 수집하는 것이 된다.
