# 밤비 고객센터 · 게시물 운영 조치 · 금칙어 차단 설계

작성일: 2026-07-20
기준 브랜치: `feat/community`

## 1. 목적

세 가지 요구사항을 하나로 묶는다. 셋은 독립 기능처럼 보이지만 데이터가 서로 물린다 —
고객센터 문의는 운영 조치의 대상이자 금칙어 검사의 대상이므로, 따로 설계하면 상태 모델과
조치 경로가 어긋난다.

1. **고객센터** — Q&A 문의(1:1 비공개)와 FAQ를 구인자·구직자 모두에게 제공한다.
2. **운영자 게시물 조치** — 커뮤니티 글·댓글과 고객센터 문의를 한 화면에서 블라인드·삭제한다.
3. **금칙어 차단** — 사용자가 글을 쓸 때 제목·본문에 금칙어가 있으면 게시 자체를 막는다.

현재 상태:

- 게시판 계열 기능은 커뮤니티(수다방) 하나뿐이다. 공지·베스트도 별도 테이블이 아니라
  `community_board` enum 값 또는 가상 보드다. 고객센터에 해당하는 것은 없다.
- 운영 조치는 이미 절반 있다. `community_content_status`(`published`/`hidden`/`deleted`)와
  `community.setPostStatusByAdmin`(`packages/api/src/routers/bambi/community.ts:817`),
  `setCommentStatusByAdmin`(`:853`), 감사로그 `admin_moderation_action`
  (`packages/db/src/schema/bambi.ts:647`)까지 존재한다. 다만 **신고 상세를 거쳐야만 도달**하고,
  게시물을 직접 훑는 목록 화면이 없다.
- 금칙어라 부를 통합 시스템은 없다. 도메인별로 흩어진 검사 두 개가 있을 뿐이고, 둘 다
  차단이 아니라 **위험 플래그 → 검수 대기**다.
  - 공고 위험어: `packages/api/src/services/bambi-job-description-blocks.ts:19`
    (`["미성년","성매매","강요"]`, 단순 `includes()`)
  - 후기 위험 패턴: `packages/api/src/services/bambi-review-policy.ts:35-39` (정규식)
  - 같은 배열이 `packages/api/src/routers/bambi/jobs.ts:138`에 판박이로 중복돼 있다.
  - **커뮤니티에는 키워드 검사가 하나도 없다.**

방침 참고: `docs/foxalba-benchmark-2026-06-24.md:209` — 금칙어 목록을 프론트에 그대로 내려보내면
우회 표현을 학습시키는 부작용이 있으므로, 사용자에게는 원칙 중심 문구를 보이고 내부 검수 로직에
더 넓은 키워드를 둔다.

## 2. 범위

이번 단계에 포함:

- 고객센터 Q&A 1:1 문의 — 작성·내 문의 목록·상세·스레드형 추가 문의·종료
- 고객센터 FAQ — 로그인 회원 열람, 운영자 CRUD
- 운영자 통합 게시물 조치 화면 — 커뮤니티 글·댓글 + 고객센터 문의·메시지의 블라인드/삭제/복구
- 운영자 문의 답변 화면, FAQ 관리 화면
- 금칙어 테이블 + 운영자 관리 UI + 커뮤니티·고객센터 작성 시 하드 차단
- `adminProcedure` 미들웨어 신설(신규 프로시저에 적용)

비범위(후속 작업):

- **채용공고 하드 차단** — 기존 위험어 → `pending_review` 정책을 유지한다. 공고는 검수 단계가
  이미 있어 이중 방어가 되고, 정책을 바꾸면 운영 중인 검수 큐 운용 방식에 회귀가 생긴다.
- **기존 위험어 배열 중복 제거** — `jobs.ts:138`과 `bambi-job-description-blocks.ts:19`의 중복은
  실재하지만 성격이 다른(차단 아닌 플래그) 별건이라 이번 스코프에서 분리한다.
- 리뷰(`review`) 운영 조치 — `review_status`에 `hidden`이 있으나 admin 프로시저가 없는 갭이
  남아 있다. 이번엔 다루지 않는다.
- 감사로그 열람 UI — `admin_moderation_action`은 insert만 있고 조회 프로시저가 없다.
- 조치·답변 알림 발송(`bambi_notification` 연동).
- 기존 admin 프로시저를 `adminProcedure`로 일괄 전환(회귀 위험).

## 3. 접근 제어

### 3-a. 고객센터는 커뮤니티 게이트를 상속하지 않는다

커뮤니티 입장 자격은 역할이 아니라 성별·광고 상태로 정해진다
(`packages/api/src/services/bambi-community-access.ts:29` — 여성 회원, 광고 중 employer, admin).
고객센터는 **구인자·구직자 전원**이 써야 하므로 이 게이트를 재사용하지 않는다.

- 문의 작성·열람, FAQ 열람: `protectedProcedure` + `requireActiveBambiProfile`
  (`packages/api/src/services/bambi-authz.ts:85` — 정지 회원만 차단). 역할 무관.
- 문의 상세·스레드: 작성자 본인 또는 admin만. **타인 접근 시 `FORBIDDEN`이 아니라 `NOT_FOUND`**
  를 던진다. `FORBIDDEN`은 "그 id의 문의가 존재한다"를 알려주므로, 비공개 문의의 존재 자체를
  숨기려면 `NOT_FOUND`여야 한다.
- FAQ 관리, 문의 답변, 금칙어 관리, 게시물 조치: admin.

### 3-b. `adminProcedure` 신설 (신규)

현재 `packages/api/src/index.ts`에는 `publicProcedure`(`:7`)와 `protectedProcedure`(`:20`)뿐이고,
admin 게이트는 각 핸들러 본문 첫 줄의 `await requireAdminProfile(context.session)` 인라인 호출로
걸린다. 신규 프로시저에서 이 한 줄을 빠뜨리면 로그인한 아무나 호출할 수 있다.

```ts
// packages/api/src/index.ts
const requireAdmin = o.middleware(async ({ context, next }) => {
  await requireAdminProfile(context.session);
  return next();
});
export const adminProcedure = protectedProcedure.use(requireAdmin);
```

이번에 추가하는 admin 프로시저는 전부 `adminProcedure`를 쓴다. 기존 프로시저는 동작이 동일해도
전환 시 회귀 검증 부담이 있어 손대지 않는다.

## 4. 데이터 모델 (packages/db)

마이그레이션: **`0017_elite_goblin_queen.sql`** (2026-07-20 생성·적용 완료. 직전은 `0016_exotic_menace.sql`).
스키마는 관례대로 `packages/db/src/schema/bambi.ts`에 이어 붙인다.

### 4-a. enum

신규:

- `support_inquiry_category`: `account` | `job_post` | `payment` | `report` | `etc`
  (한국어 라벨은 web 상수로 둔다 — 기존 `REPORT_REASON_LABELS` 관례와 동일)
- `support_inquiry_status`: `open` | `answered` | `closed` (문의 진행 상태)

재사용:

- **`community_content_status`(`published`/`hidden`/`deleted`)를 고객센터에도 그대로 쓴다.**
  이름에 `community`가 붙어 어색하지만, 값의 의미가 완전히 같고 운영 조치 로직·UI 매핑을
  공유할 수 있다. 새 enum을 만들면 조치 코드가 유형별로 갈라진다. enum rename은 마이그레이션
  리스크가 커서 하지 않는다.

값 추가:

- `moderation_target_type`(`bambi.ts:69`)에 `support_inquiry`, `support_inquiry_message` 추가.
  감사로그가 문의를 가리킬 수 있어야 한다. PostgreSQL `ALTER TYPE ... ADD VALUE`는 트랜잭션
  제약이 있으므로 drizzle-kit이 생성한 SQL을 확인하고, 필요하면 별도 문으로 분리한다.

### 4-b. 테이블

문의 본문은 커뮤니티와 달리 **TipTap JSON이 아닌 평문(text)** 이다. 문의에 서식이 필요 없고,
금칙어 검사도 텍스트 추출 없이 바로 걸 수 있다.

```
support_inquiry
  id             uuid PK defaultRandom
  authorUserId   text notNull → user.id (cascade)
  authorRole     bambi_user_role notNull      -- 작성 시점 스냅샷(커뮤니티 관례)
  category       support_inquiry_category notNull
  title          text notNull
  body           text notNull                 -- 평문
  inquiryStatus  support_inquiry_status default 'open' notNull
  status         community_content_status default 'published' notNull   -- 운영 조치
  lastMessageAt  timestamp defaultNow notNull -- 목록 정렬용(답변 오면 위로)
  createdAt / updatedAt  timestamp defaultNow notNull
  index: (authorUserId, createdAt), (inquiryStatus, lastMessageAt), (status, createdAt)

support_inquiry_message           -- 작성자 ↔ 운영자 스레드
  id             uuid PK defaultRandom
  inquiryId      uuid notNull → support_inquiry.id (cascade)
  authorUserId   text notNull → user.id (cascade)
  isStaff        boolean default false notNull  -- 작성 시점 admin 여부 스냅샷
  body           text notNull
  status         community_content_status default 'published' notNull
  createdAt      timestamp defaultNow notNull
  index: (inquiryId, createdAt)

faq_entry                          -- 운영자 작성 정적 문서
  id             uuid PK defaultRandom
  category       support_inquiry_category notNull   -- 문의 카테고리 재사용(일관성)
  question       text notNull
  answer         text notNull
  sortOrder      integer default 0 notNull
  isPublished    boolean default true notNull
  createdAt / updatedAt  timestamp defaultNow notNull
  index: (isPublished, sortOrder)

banned_word
  id               uuid PK defaultRandom
  term             text notNull                -- 운영자가 입력한 원문(표시용)
  normalizedTerm   text notNull                -- 정규화형(매칭용, 저장 시 계산)
  isActive         boolean default true notNull
  createdByUserId  text notNull → user.id
  createdAt / updatedAt  timestamp defaultNow notNull
  uniqueIndex: (normalizedTerm)                -- 정규화 후 같으면 중복 등록 차단
  index: (isActive)
```

`normalizedTerm`을 저장하는 이유는 매칭 때마다 재계산하지 않기 위해서다. 유니크 인덱스도
정규화형에 걸어야 `성 매매`와 `성매매`가 중복 등록되지 않는다.

## 5. 금칙어 엔진

`packages/api/src/services/bambi-banned-words.ts` (신규, 순수 함수 + 캐시).
모델로 삼는 파일은 `bambi-review-policy.ts`다.

### 5-a. 정규화 후 부분문자열 매칭

```ts
normalizeForMatch(text: string): string
  // 소문자화 + 공백·구두점·기호 제거 (한글 자모는 보존)
  // 예: "성 매매", "성*매매", "성.매매" → "성매매"

findBannedTerms(text: string, words: BannedWord[]): string[]
  // 정규화한 text에 normalizedTerm이 포함되는지 검사
```

단순 `includes()`는 공백 하나로 뚫리고, 정규식을 운영자가 직접 입력하게 하면 잘못된 패턴 하나로
서비스 전체 글쓰기가 막힌다. 정규화 + 부분문자열이 진입장벽과 실효성의 균형점이다.

정규화의 부작용은 **긴 본문에서 단어 경계가 사라져 생기는 우연한 겹침**이다. 예를 들어 공백
제거 후 앞 단어의 끝과 뒤 단어의 시작이 붙어 금칙어를 이룰 수 있다. 이 경계는 단위 테스트로
고정한다(§7).

### 5-b. 캐시

매 작성 요청마다 `banned_word`를 조회하지 않는다. 인메모리 캐시 + TTL 60초, 그리고 금칙어
mutation 시 로컬 캐시를 즉시 무효화한다. 서버 인스턴스가 여럿이면 다른 인스턴스는 최대 60초
후 반영된다 — 금칙어 추가가 1분 내 전파되면 충분하다.

### 5-c. 차단 방식과 에러 메시지

```ts
new ORPCError("BAD_REQUEST", {
  message: `게시할 수 없는 단어가 포함되어 있습니다: '${term}'`,
})
```

웹 폼은 `toast.error(error.message)` 관용구를 쓰므로(`community-post-form.tsx:165,176`)
이 문구가 그대로 사용자에게 보인다.

**걸린 단어 하나만** 알려준다. 벤치마크 방침(§1)은 "목록 전체를 프론트에 노출하지 말 것"이지
"무엇에 걸렸는지 숨겨라"가 아니다. 걸린 단어를 안 알려주면 사용자가 글을 고칠 방법이 없다.
전체 목록을 내려보내는 API는 admin 전용으로만 둔다.

### 5-d. 적용 지점

| 대상 | 프로시저 | 검사 필드 |
|---|---|---|
| 커뮤니티 글 | `community.createPost`(`:451`), `updatePost`(`:493`) | title + body(TipTap 텍스트 추출) |
| 커뮤니티 댓글 | `community.createComment`(`:698`), `updateComment`(`:785`) | body |
| 고객센터 문의 | `support.createInquiry` | title + body |
| 고객센터 스레드 | `support.createInquiryMessage` | body |

커뮤니티 본문은 TipTap JSON이라 평문 추출 헬퍼가 필요하다. 기존 `assertTiptapDoc`
(`community.ts:138`) 옆에 텍스트 수집 함수를 추가한다.

FAQ는 운영자가 쓰므로 검사하지 않는다.

## 6. API (packages/api — oRPC)

### 6-a. `routers/bambi/support.ts` (신규)

zod 스키마는 관례대로 파일 상단에 모은다.

```
listFaq({ category? })                       → { items: FaqEntry[] }        // isPublished만
createInquiry({ category, title, body })     → { id }
listMyInquiries({ page })                    → { items, page, pageSize, totalCount }
getInquiry({ id })                           → { inquiry, messages }        // 본인/admin, 그 외 NOT_FOUND
createInquiryMessage({ inquiryId, body })    → { id }                       // 본인/admin
closeInquiry({ id })                         → { ok }                       // 작성자가 종료

-- adminProcedure --
listInquiriesByAdmin({ inquiryStatus?, page }) → { items, page, pageSize, totalCount }
setInquiryProgress({ id, inquiryStatus })      → { ok }                     // answered/closed 전환
createFaq({ category, question, answer, sortOrder })  → { id }
updateFaq({ id, ...patch })                    → { ok }
setFaqPublished({ id, isPublished })           → { ok }
deleteFaq({ id })                              → { ok }                     // 하드 삭제(운영 문서)
```

운영자가 `createInquiryMessage`를 호출하면 `isStaff: true`로 기록하고 문의의 `inquiryStatus`를
`answered`로, `lastMessageAt`을 갱신한다(같은 트랜잭션).

### 6-b. `routers/bambi/banned-words.ts` (신규, 전부 adminProcedure)

```
listBannedWords({ includeInactive? })   → { items }
createBannedWord({ term })              → { id }    // normalizedTerm 계산·중복 시 CONFLICT
setBannedWordActive({ id, isActive })   → { ok }
deleteBannedWord({ id })                → { ok }
```

### 6-c. `routers/bambi/moderation.ts` 확장

```
setInquiryStatusByAdmin({ inquiryId, status, reason })         → { ok }
setInquiryMessageStatusByAdmin({ messageId, status, reason })  → { ok }
listModeratableContent({ targetType, status?, page })          → { items, page, pageSize, totalCount }
```

`listModeratableContent`는 대상 유형이 달라도 **서버에서 공통 형태로 정규화해** 반환한다.
UI가 유형별 분기를 하지 않아도 되고, 나중에 대상이 늘어도 화면을 고치지 않는다.

```ts
{ id, targetType, title, excerpt, authorName, authorUserId, status, createdAt }
```

- 커뮤니티 댓글처럼 제목이 없는 대상은 `title`에 원글 제목을, `excerpt`에 본문 앞부분을 넣는다.
- `targetType`은 필수 입력으로 두고 한 번에 한 유형만 조회한다(UI는 탭). 목록에 노출하는 유형은
  `community_post` / `community_comment` / `support_inquiry` 셋이다.
  **`support_inquiry_message`(스레드 메시지)는 통합 목록에 넣지 않는다** — 메시지는 문의 맥락
  없이 한 줄만 보면 판단이 불가능하므로, 조치는 문의 상세 화면의 스레드에서 개별로 한다.
  프로시저 `setInquiryMessageStatusByAdmin`은 그 화면이 호출한다.
- `authorName`의 출처는 유형별로 다르다. 커뮤니티 글·댓글은 글별 익명 표시명
  `communityPost.authorDisplayName`을 그대로 쓴다(커뮤니티는 익명 게시판이므로 실명 표시명을
  노출하면 안 된다). 고객센터 문의·메시지는 익명 표시명 컬럼이 없으므로
  `bambiProfile.displayName`을 조인해 쓴다.

조치 프로시저는 기존 패턴(`moderation.ts:628` `setJobPostStatus`)을 그대로 따른다 —
① `adminProcedure` ② 트랜잭션 안에서 대상 SELECT, 없으면 `NOT_FOUND` ③ UPDATE
④ **같은 트랜잭션에서 `adminModerationAction` insert**. `reason`은 `z.string().min(2).max(500)`
필수. 액션 문자열은 기존 컨벤션대로 `set_status:<값>`.

라우터 등록: `packages/api/src/routers/bambi/index.ts`에 `support`, `bannedWords` 추가.

## 7. 웹 UI (apps/web)

### 7-a. 라우트 — `/support` 최상위 (커뮤니티 하위 아님)

고객센터는 구인자·구직자 공통이므로 역할 네임스페이스(`/seeker`, `/employer`)에 묶지 않는다.
커뮤니티가 `/seeker/community`인 것과 대비된다.

```
apps/web/src/app/support/
├── layout.tsx                    전용 경량 셸(로그인 확인 + 헤더)
├── page.tsx                      FAQ 목록(기본 랜딩)
└── inquiries/
    ├── page.tsx                  내 문의 목록
    ├── new/page.tsx              문의 작성
    └── [id]/page.tsx             문의 상세 + 스레드
```

### 7-b. 네비게이션 — 헤더 "수다방" 오른쪽에 "고객센터"

`apps/web/src/components/bambi/responsive-shell.tsx:18-24`의 `DEFAULT_NAV_ITEMS` 마지막 항목이
수다방이므로, 그 뒤에 붙이면 요구한 위치가 된다.

```ts
export const DEFAULT_NAV_ITEMS: NavItem[] = [
  { href: "/seeker", label: "채용정보" },
  { href: "/seeker/chats", label: "채팅" },
  { href: "/", label: "안전가이드" },
  { href: "/employer", label: "업체 인증" },
  { href: "/seeker/community", label: "수다방" },
  { href: "/support", label: "고객센터" },        // 신규
];
```

구인자 셸은 별도 배열을 주입하므로 같은 항목을 한 번 더 추가한다 —
`app/employer/layout.tsx:9` `EMPLOYER_NAV_ITEMS`(마지막 항목이 "채용정보")의 뒤에 붙인다.
`as const` 배열이고 `Route` 타입 캐스팅 관례가 있으므로 `{ href: "/support" as Route, label: "고객센터" }`
형태가 된다.

**모바일 하단탭에는 넣지 않는다.** 탭이 이미 탐색·채팅·(구인 관리)·수다방·내 정보로 차 있어
6개가 되면 과밀해진다(`mobile-tab-bar.tsx:49-57`). 모바일에서는 "내 정보"(`/seeker/me`)에
고객센터 진입 항목을 두고, `/support` 화면 자체는 반응형으로 만든다.

### 7-c. 운영자 화면

메뉴 3개를 추가한다.

```
/moderator/content        통합 게시물 조치 — 유형 탭(커뮤니티 글·댓글·문의) + 상태 필터 + 일괄
/moderator/support        문의 답변 큐 + FAQ 관리 (탭 2개)
                          문의 상세의 스레드에서 개별 메시지 블라인드·삭제도 여기서 한다
/moderator/banned-words   금칙어 목록·추가·비활성·삭제
```

운영자 네비는 등록 지점이 **4곳**이라 함께 갱신해야 한다:

1. `app/moderator/layout.tsx:8` `MODERATOR_NAV_ITEMS`
2. `components/bambi/persona-nav.tsx:124` `MOD_ROUTES`
3. `persona-nav.tsx:165` 탭 판정 if-else 체인
4. `persona-nav.tsx:130` `MOD_DETAIL_RE` (상세 화면 판정 정규식)

### 7-d. 컴포넌트 규칙

`apps/web/CLAUDE.md`에 따라 shadcn 우선으로 만든다. 기존 운영자 화면
(`screens/moderator.tsx`)은 인라인 스타일 프로토타입이라 점진 전환 대상이므로, **신규 화면은
`app/moderator/employers/page.tsx` 쪽 표준 shadcn 스타일을 따른다.**

shadcn 컴포넌트 2개를 추가해야 한다(npm 의존성이 아니라 레지스트리 파일 복사):

- `table` — 운영자 목록 화면용. 현재 `packages/ui/src/components`에 없고 web 전체에 사용처 0건이다.
- `accordion` — FAQ 목록용.

조치 UI는 기존 관례대로 **사유 입력 Sheet**를 거친다(`RejectSheet`, `SanctionSheet` 패턴).

데이터 페칭은 기존과 동일하게 클라이언트 TanStack Query + oRPC
(`useQuery(orpc.bambi.support.listFaq.queryOptions(...))`).

## 8. 테스트·검증

테스트는 `packages/api` 콜로케이션 vitest다(웹에는 테스트 러너가 없다).

### 8-a. 단위 (DB 불필요, 순수 함수)

`services/bambi-banned-words.test.ts`

- `normalizeForMatch`: 공백·특수문자 제거, 소문자화, 한글 자모 보존
- 우회 표현 탐지: `성 매매`, `성*매매`, `성.매매` → 탐지됨
- **오탐 경계**: 정규화로 인해 인접 단어가 붙어 우연히 금칙어를 이루는 케이스를 명시적으로
  고정한다. 허용해야 할 정상 문장과 차단해야 할 문장의 경계를 테스트로 못 박는다.
- 빈 목록·비활성 단어 제외

### 8-b. 통합 (실 DB, `createProcedureClient`)

기존 관례를 따른다 — `dotenv.config()` 최상단 → top-level await 동적 import →
컨텍스트 캐스팅으로 세션 주입 → `randomUUID()` 픽스처 → `inArray` 정리.
`organization`·`member` 시드 시 `createdAt`을 수동 지정해야 한다(default 없음).

`routers/bambi/support.test.ts`

- 타인 문의 `getInquiry` → **`NOT_FOUND`** (`FORBIDDEN` 아님)
- 작성자 본인·admin은 조회 가능
- 금칙어 포함 문의 작성 → `BAD_REQUEST`, 저장되지 않음
- 운영자 답변 시 `inquiryStatus`가 `answered`로, `lastMessageAt`이 갱신됨
- FAQ는 `isPublished=false`가 일반 회원 목록에 나오지 않음
- 정지(`suspended`) 회원 차단
- 커뮤니티 게이트 미적용 확인: 남성 구직자(커뮤니티 입장 불가)도 고객센터 이용 가능

`routers/bambi/moderation.test.ts` (확장)

- 문의 블라인드/삭제 시 상태 전환 + `admin_moderation_action` 기록이 함께 남음
- `reason` 누락 시 검증 실패
- 비admin 호출 차단(`adminProcedure` 동작 확인)
- `listModeratableContent`가 유형별로 공통 형태를 반환

`routers/bambi/community.test.ts` (확장)

- 금칙어 포함 글·댓글 작성/수정 차단
- **기존 커뮤니티 흐름 무회귀** — 금칙어가 없는 정상 글은 그대로 게시됨

### 8-c. 수동 검증

`.claude/rules/no-build-or-run.md`에 따라 빌드·dev 서버 기동은 하지 않는다. 타입체크와 린트
(`pnpm dlx ultracite fix`)까지만 수행하고, 화면 확인은 사용자에게 요청한다.

마이그레이션은 메모리 규칙상 `db:push`를 쓰지 않으며, `generate`/`migrate`는 사용자의 명시
지시가 있을 때만 실행하고 적용 결과를 검증한다.

## 9. 구현 순서

의존 관계상 아래 순서를 따른다. 각 단계는 독립적으로 검증 가능하다.

1. **스키마·마이그레이션 `0017`** — enum 2개 신설, `moderation_target_type` 값 2개 추가, 테이블 4개
2. **`adminProcedure`** — `packages/api/src/index.ts`
3. **금칙어 엔진 + 라우터** — 순수 함수 TDD → `banned-words.ts` → 운영자 관리 화면
4. **금칙어를 커뮤니티에 적용** — TipTap 텍스트 추출 헬퍼 포함, 무회귀 확인
5. **고객센터 API** — `support.ts` (금칙어 적용 포함)
6. **고객센터 웹 UI** — `/support` 라우트 + 헤더 네비 "고객센터" 추가
7. **운영자 통합 조치** — `listModeratableContent` + 문의 조치 프로시저 → `/moderator/content`
8. **운영자 고객센터 화면** — 문의 답변 + FAQ 관리

## 10. 개정 (2026-07-20) — 구현 중 확정된 변경

구현하면서 §1~§9의 결정 중 세 가지가 바뀌었다. 나머지는 설계대로다.

**§7-a 폭 상수 — 신설하지 않고 기존 것을 재사용한다.**
설계는 `SUPPORT_CONTENT_WIDTH`를 새로 두려 했으나, `apps/web/src/lib/bambi/layout.ts`에 이미
`APP_CONTENT_MAX_W`(헤더)와 `SEEKER_CONTENT_WIDTH`(본문)가 있다. 폭 기준이 갈리면 헤더와 본문
정렬이 어긋난다(seeker 채팅 프리플라이트에서 실제로 발생했던 문제). 폭 컨테이너는
`app/support/layout.tsx`에 한 번만 두고, 화면 컴포넌트는 세로 레이아웃만 담당한다.

**§6-a `listFaq`에 `includeUnpublished`를 추가한다.**
설계대로 `listFaq`가 공개분만 반환하면, 운영자 화면도 같은 프로시저를 쓰므로 FAQ를 비공개로
내리는 순간 목록에서 사라져 다시 공개로 되돌릴 진입점이 없어진다. 입력에 플래그를 더하되
핸들러에서 `role === "admin"`을 함께 확인해, 일반 회원이 `true`를 보내도 공개분만 반환한다
(운영자 초안 열람 차단). 새 프로시저를 만들지 않아 라우터 표면은 늘지 않았다.

**§5-d TipTap 텍스트 추출은 신규가 아니라 기존 구현의 승격이다.**
설계는 추출 헬퍼를 새로 만든다고 했으나, `moderation.ts`에 이미 private `collectTiptapText`가
있었다(조사 단계 누락). 기존 구현이 더 정확해서 — 블록 내부 text 노드는 붙이고 문단 경계만
줄바꿈으로 나눈다. 마크(굵게 등)로 쪼개진 노드가 원래 한 단어이기 때문이다 — 그쪽을
`services/bambi-tiptap-text.ts`로 승격하고 중복을 제거했다. 금칙어 매칭은 정규화가 공백류를
모두 지우므로 구분자 차이가 결과를 바꾸지 않는다.

**비범위였던 항목 중 하나가 범위에 들어왔다.**
`moderation.ts`의 `uuidTargetTypes`는 zod 신고 대상 타입을 기준으로 삼고 있어, §4-a의
`moderation_target_type` 값 추가와 함께 컴파일 에러가 났다. 행 타입 기준으로 넓히고 신규 두
유형도 집합에 포함했다(둘 다 uuid PK라 사실에 부합). 기존 위험어 배열 중복 제거(`jobs.ts:138`)는
여전히 비범위다.

구현 결과·검증 내역·알려진 제약은 계획 문서
`docs/superpowers/plans/2026-07-20-bambi-support-center-moderation.md`의 "실행 결과" 절에 있다.
