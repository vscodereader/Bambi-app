# 게시판 동적화 · 필터 Enter UX · 후기 이관 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영자가 코드 배포 없이 수다방 게시판을 추가·관리할 수 있게 하고, 모바일 필터 패널의 Enter UX를 개선하고, 후기 작성을 예정된 면접 아코디언으로 이관한다.

**Architecture:** 게시판 정의를 DB `community_board` 테이블로 단일화(기존 pgEnum·zod enum·웹 상수 3중 복제 해소), `communityPost.board`를 text+FK로 전환. 특수 동작(notice 관리자 전용, free 잠금 금지, legal 연락처, work_talk 크롤링, best 가상 게시판, 공개 /board 3종 고정, 게스트 쓰기 3종 고정)은 **기존 키 리터럴 유지** — 새 게시판은 표준 동작(회원 열람·작성)만 갖는다. 필터·후기는 웹 전용 수정.

**Tech Stack:** Next.js App Router(이미 `[board]` 동적 세그먼트), Drizzle(pg), oRPC, TanStack Query, shadcn/base-ui, vitest.

## Global Constraints

- 빌드/실행 금지(dev 서버 기동 금지). 검증은 `check-types` + web vitest + ultracite(경로 인자 필수 — 인자 없으면 0파일).
- `packages/api/src/routers/bambi` vitest 스위트 **실행 금지**(dev DB의 운영 설정 행을 지움). 테스트 파일 수정은 OK, 실행만 금지.
- `db:push` 절대 금지. `drizzle-kit generate`로 마이그레이션 파일 생성까지만, **`db:migrate` 실행 금지**(사용자 지시 대기). `drizzle-kit check` 통과 필수.
- 새 npm 의존성 추가 금지. UI는 shadcn/기존 ds 컴포넌트 최대 재사용.
- DB enum/키 원값을 UI에 그대로 렌더 금지 — 라벨 맵/DB label 경유.
- 임의 px(`[Npx]`) 금지 — Tailwind 스케일 토큰. `max-w-[1180px]` 금지. 모바일 반응형 필수. 내비 버튼 primary 금지(primary는 주요 액션 한 곳).
- base-ui: render가 `<Button>`이면 nativeButton 생략, Link/Input 등 비-button 렌더에만 `nativeButton={false}`.
- 서브에이전트는 **커밋·git stash 금지** — 커밋은 컨트롤러가 순차 수행. 줄바꿈 LF.
- pnpm 필터명: `web`, `server`(scope 없음), `@bambi-app/api`, `@bambi-app/db`.
- 작업 디렉터리: `C:\Users\user\projects\bambi-app\.claude\worktrees\board-filter-review` (이 밖으로 나가지 말 것).
- 매뉴얼 동기화는 Track D가 일괄 수행 — Track A/B/C 에이전트는 `docs/manual/**`, `docs/test-flows/**`를 **건드리지 말 것**(동시 편집 충돌 방지).

---

## Track A — 게시판 DB 동적화 + 운영자 게시판 관리 (A1: db+api → A2: web 순차)

### Task A1: DB 스키마 · 마이그레이션 · API

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (pgEnum `communityBoard` :134-143 제거, 테이블 신설, `communityPost.board` :1545 및 `crawledCommunityTopic.board` :636 text 전환)
- Create: `packages/db/src/migrations/00XX_*.sql` (drizzle-kit generate + 시드 INSERT 수기 보강; XX = journal 최신 idx+1 확인)
- Create: `packages/api/src/routers/bambi/community-boards.ts`
- Modify: `packages/api/src/routers/bambi/index.ts` (라우터 등록)
- Modify: `packages/api/src/routers/bambi/community.ts` (zod enum 3개 :82-105 → 문자열+DB 검증, `overview` :792-826 배열 응답)
- Modify: `packages/api/src/services/bambi-community-authz.ts` (리터럴 유지 — 변경 최소)
- Test 수정(실행 금지): `packages/api/src/routers/bambi/community.test.ts`, `packages/api/src/services/bambi-community-authz.test.ts`

**Interfaces (Produces — A2가 의존):**

```ts
// packages/db/src/schema/bambi.ts — pgEnum communityBoard 삭제 후 같은 이름의 테이블
export const communityBoard = pgTable("community_board", {
	key: text("key").primaryKey(),            // 신규 게시판은 key === slug
	slug: text("slug").notNull().unique(),    // 레거시: work_talk ↔ "work-talk"
	label: text("label").notNull(),
	description: text("description").notNull().default(""),
	isActive: boolean("is_active").notNull().default(true),
	isWritable: boolean("is_writable").notNull().default(true),
	sortOrder: integer("sort_order").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});
```

```ts
// packages/api/src/routers/bambi/community-boards.ts — banned-words.ts 패턴
communityBoards.listActive   // publicProcedure, output: { key, slug, label, description, isWritable, sortOrder }[] (isActive만, sortOrder asc)
communityBoards.list         // adminProcedure, 비활성 포함 전체
communityBoards.create       // adminProcedure, input { slug, label, description? } → key=slug. slug: /^[a-z0-9_-]{2,30}$/, 예약어 거부: best, crawled, write, notice(및 기존 slug·key 전부 — DB unique로도 걸러짐)
communityBoards.update       // adminProcedure, input { key, label?, description?, sortOrder?, isWritable? }
communityBoards.setActive    // adminProcedure, input { key, isActive } — 삭제 프로시저는 만들지 않는다(글 보존, 비활성=숨김)
```

```ts
// community.ts overview 신규 응답 형태 (기존 고정 6키 { best, free, ... } 폐기)
overview → { boards: Array<{ key; slug; label; description; posts: OverviewPost[] }> }
// 순서: best(가상, 첫 번째) → 활성 게시판 sortOrder asc. best 라벨은 서버에서 "베스트 글" 고정.
```

**Steps:**

- [ ] **A1-1** `packages/db/src/migrations/meta/_journal.json`에서 최신 idx 확인. `packages/db/src/schema/bambi.ts`에서 `communityBoard` pgEnum을 위 테이블 정의로 교체, `communityPost.board`·`crawledCommunityTopic.board`(및 `communityBoard(` 사용처 전수 grep)를 `text("board").notNull().references(() => communityBoard.key)`로 전환.
- [ ] **A1-2** `pnpm --filter @bambi-app/db drizzle-kit generate`(정확한 스크립트명은 package.json 확인)로 마이그레이션 생성. 생성 SQL을 열어 순서를 검수·수기 보강: ① `community_board` 테이블 생성보다 **먼저** 기존 enum 컬럼 2개를 `ALTER ... TYPE text USING board::text` ② `DROP TYPE community_board`(테이블과 이름 충돌 방지 — pg에서 타입·테이블 이름 공간 공유) ③ 테이블 생성 ④ 시드 INSERT 5행(notice/free/work_talk/market/legal — 라벨·설명·slug는 `apps/web/src/lib/bambi/community.ts:46-90`의 `COMMUNITY_BOARDS` 값 그대로, sortOrder는 현 배열 순서×10) ⑤ FK 추가. `drizzle-kit check` 통과 확인. **db:migrate는 실행하지 않는다.**
- [ ] **A1-3** `community-boards.ts` 신설(위 계약, `adminProcedure`는 banned-words.ts와 동일하게), `index.ts` 등록.
- [ ] **A1-4** `community.ts`: `communityWritableBoardSchema`/`communityBoardSchema`/`publicBoardSchema` 입력을 `z.string().min(1).max(40)`로 바꾸고 프로시저 본문에서 검증 헬퍼 호출 — `assertBoard(db, key, { allowBest?: boolean, forWrite?: boolean })`: 테이블 조회로 존재·isActive(+forWrite면 isWritable) 확인, allowBest면 `"best"` 허용, 실패 시 기존과 같은 NOT_FOUND/BAD_REQUEST 톤. `PUBLIC_COMMUNITY_BOARDS`·`GUEST_WRITABLE_BOARDS`·notice/free/legal/work_talk/best 값 분기는 **전부 리터럴 그대로 유지**.
- [ ] **A1-5** `overview`를 위 배열 계약으로 재작성: `community_board`에서 활성 게시판 조회 → 게시판별 최신 글 병렬 조회(기존 per-board 쿼리 재사용) + best 가상 항목 선두 삽입.
- [ ] **A1-6** `community.test.ts`·`bambi-community-authz.test.ts`의 깨지는 기대값 수정(**실행하지 말 것** — check-types로만 확인).
- [ ] **A1-7** `pnpm --filter @bambi-app/db check-types && pnpm --filter @bambi-app/api check-types && pnpm --filter server check-types` 통과. ultracite로 수정 파일 린트.

### Task A2: 웹 — 동적 게시판 소비 + 운영자 관리 페이지

**Files:**
- Modify: `apps/web/src/lib/bambi/community.ts` — `COMMUNITY_BOARDS`는 **빌트인 폴백/스타일 메타로 유지**하되, 동적 조회 훅 추가
- Create: `apps/web/src/lib/bambi/use-community-boards.ts` (또는 community.ts 내 추가) — `communityBoards.listActive` react-query 훅 + `useBoardBySlug(slug)`
- Modify: `apps/web/src/app/seeker/community/[board]/page.tsx`, `[board]/write/page.tsx`, `[board]/[postId]/page.tsx`, `[board]/[postId]/edit/page.tsx` — `getBoardBySlug` 상수 조회 → 훅 기반(로딩 중 스켈레톤/null, 로드 후 미존재 시 notFound)
- Modify: `apps/web/src/components/bambi/community-board-preview.tsx` — overview 배열 렌더, `accentClassName` 미지 키 폴백, notice 전폭·market/legal 페어 배치 유지, 신규 게시판은 solo 카드로 뒤에 추가
- Modify: `apps/web/src/components/bambi/screens/community-home.tsx`(:35-41 고정 키 매핑 제거), `home-community-section.tsx`
- Modify: `apps/web/src/components/bambi/community-post-form.tsx` — writable/특수 필드는 board meta 기반(legal/free 리터럴 분기 유지)
- Modify: `apps/web/src/components/bambi/screens/community-board.tsx` — 필터 노출(:513)·배지(:521)·폴백(:472) 등이 동적 키에서도 동작하도록(특수 분기 리터럴 유지, 미지 키는 표준 동작)
- Modify: `apps/web/src/app/moderator/content/page.tsx:546` — 라벨을 `communityBoards.list` 기반 맵으로(폴백 `COMMUNITY_BOARD_LABELS`)
- Create: `apps/web/src/app/moderator/community-boards/page.tsx` — 운영자 게시판 관리(banned-words 페이지 패턴: 목록 테이블 + 추가 폼 + 라벨/설명/정렬 수정 + 활성 토글)
- Modify: `apps/web/src/app/moderator/layout.tsx:36-44` — `콘텐츠` 그룹에 "게시판 관리" 추가(`as Route` 캐스팅 관례)
- Test: `apps/web/src/lib/bambi/community.test.ts`, `community-board-navigation.test.ts`, 운영자 폭 규약 테스트에 신규 페이지 편입
- **불변**: 공개 `/board/**`, `sitemap.ts`, `public-community.ts` — 공개 SEO 영역은 기존 3종 고정(이번 범위 밖)

**Interfaces (Consumes):** A1의 `communityBoards.listActive/list/create/update/setActive`, `overview.boards[]`.

**Steps:**

- [ ] **A2-1** 훅 신설: `useCommunityBoards()`(listActive, staleTime 넉넉히), `useBoardBySlug(slug)` — 반환 meta 형태는 기존 `CommunityBoardMeta`와 호환(adminOnly는 `key === "notice"`, 스타일 accent는 빌트인 맵 + 폴백).
- [ ] **A2-2** `[board]/**` 4개 페이지를 훅 기반 해석으로 전환(클라이언트 컴포넌트 유지). Next.js 동적 세그먼트·params 처리 의문점은 next-devtools의 `nextjs_docs` 또는 context7로 확인.
- [ ] **A2-3** 홈/미리보기: overview 배열 소비로 재작성. `CommunityBoardKey` 유니온이 좁아서 막히는 지점은 `string`으로 완화(빌트인 키 전용 헬퍼는 유지).
- [ ] **A2-4** 글쓰기/목록/상세 화면의 게시판 meta 소비를 훅 기반으로. 미지(신규) 게시판 = 표준 동작: 회원 열람·작성, 비밀글 허용, 연락처 필드 없음, 게스트 쓰기 불가.
- [ ] **A2-5** 운영자 페이지 신설 + 내비 등록(frontend-design 스킬 사용, 데스크톱·모바일 확인). slug 입력엔 규칙 안내 문구(영소문자·숫자·하이픈, 예약어 불가). 삭제 버튼 없음 — 비활성 토글만.
- [ ] **A2-6** 웹 테스트 갱신 후 워크트리 안에서 `pnpm --filter web test` + `pnpm --filter web check-types` 통과. ultracite 경로 린트.

---

## Track B — 모바일 필터 시트 Enter 닫기

**Files:**
- Modify: `apps/web/src/components/bambi/marketplace.tsx:243-257` (`MarketplaceFilterSheet`)

**Steps:**

- [ ] **B-1** `SheetContent` 내부 래퍼에 `onKeyDown`: `event.key === "Enter" && event.target instanceof HTMLInputElement`이면 `onOpenChange(false)`. Select/체크박스의 Enter는 닫지 않도록 input 타깃만 잡는다(base-ui Select 키보드 조작 오폐쇄 방지). IME 조합 중(`event.nativeEvent.isComposing`) 무시.
- [ ] **B-2** 필터 적용은 이미 onChange 즉시 반영이므로 추가 로직 없음. `public-marketplace.tsx`·`seeker-marketplace.tsx`는 무수정(이미 `onOpenChange={setFiltersOpen}` 연결).
- [ ] **B-3** `pnpm --filter web check-types` + ultracite. (한 줄짜리 핸들러라 별도 테스트 생략 — 구조 테스트 대상 아님.)

---

## Track C — 후기 남기기를 예정된 면접 아코디언으로 이관

**Files:**
- Modify: `apps/web/src/components/bambi/screens/upcoming-interviews-screen.tsx` — `InterviewListItem`에 `chatRoomId: string` 추가(서버는 이미 내려줌 — `chats.ts:1086-1096` 스프레드), `AccordionContent`에 후기 섹션 추가
- Reuse(무수정): `apps/web/src/components/bambi/review-form.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx` — 기존 진입점 전체 제거: `ReviewSidebarCard`(:609-705), `handleReviewSubmit`(:1713-1728), `createReviewMutation`(:1193-1205), `reviewListQuery`(:1078), `canCreateReview`/`existingReview`(:1528-1542), `getReviewMutationErrorMessage`(:182-193), 렌더(:1941-1950)
- Test: `apps/web/src/components/bambi/screens/upcoming-interviews-screen.test.ts` (소스 스캔 테스트 — 후기 가드 패턴 추가, `next/link`·`/seeker/chats/` 금지 규칙 유지)
- **서버·DB 무변경**: `reviews.create` 가드(구직자 + confirmed/completed 면접 존재 + 방당 1건)가 새 진입점 노출 조건과 동일.

**Steps:**

- [ ] **C-1** 아코디언 펼침 영역에 후기 섹션: 노출 조건 `!viewerIsEmployer && (status === "confirmed" || status === "completed")`. `reviews.listMine`(채팅 화면 :1078과 동일 프로시저)으로 `chatRoomId` 일치 후기 존재 판정 — 있으면 기존 후기 읽기 카드(별점·본문·익명 여부), 없으면 `ReviewForm` 렌더.
- [ ] **C-2** 제출: `reviews.create` mutate `{ body, chatRoomId, isAnonymous, rating }` → 성공 시 listMine 무효화 + 성공 안내. `getReviewMutationErrorMessage` 오류 문구 맵은 upcoming-interviews-screen.tsx로 이동(채팅 화면에서 삭제).
- [ ] **C-3** 채팅방 화면에서 후기 관련 코드 전부 제거(위 목록). 다른 참조가 남지 않는지 grep.
- [ ] **C-4** 소스 스캔 테스트 갱신: 후기 폼이 구직자·confirmed/completed 가드 하에 있는지 패턴 추가.
- [ ] **C-5** 워크트리 안에서 `pnpm --filter web test` + `pnpm --filter web check-types` + ultracite.

---

## Track D — 매뉴얼·문서 동기화 (A2·C 완료 후 단독 실행)

**Files:**
- Modify: `docs/manual/seeker-manual.md` — 후기 위치(:312-325, :670-671 "채팅방 오른쪽" → 내 정보 예정된 면접), 게시판 목록 서술(:346, :372-383 표 등 — "운영자가 게시판을 추가할 수 있음" 반영)
- Modify: `docs/manual/moderator-manual.md` — 게시판 관리 페이지 신설 절 추가(:291, :305-309 인근), 게시물 조치 라벨 서술(:637-644) 점검
- Modify: `docs/manual/employer-manual.md:556-569` — 게시판 표 서술 점검
- Modify: `docs/test-flows/seeker-test-flow.md:674` — 후기 작성 경로 갱신

**Steps:**

- [ ] **D-1** 위 지점 갱신. 새 기능 문구는 구현 결과(A2 운영자 페이지의 실제 필드·버튼 라벨, C 아코디언의 실제 문구)와 일치시킬 것 — 해당 소스 파일을 읽고 작성.
- [ ] **D-2** 다른 매뉴얼 내 "자유수다/밤문화/중고거래/법률" 열거 지점 grep 후 "게시판은 운영자 관리에 따라 달라질 수 있음" 톤으로 정리.

---

## 검증·커밋 (컨트롤러 수행)

1. 워크트리 루트에서: `pnpm --filter @bambi-app/db check-types`, `pnpm --filter @bambi-app/api check-types`, `pnpm --filter server check-types`, `pnpm --filter web check-types`, `pnpm --filter web test`, `drizzle-kit check`(db 패키지 스크립트).
2. 커밋 순서(순차, 경로 지정): ① Track B ② Track C ③ Track A(db+api+web) ④ Track D(docs). 커밋 메시지는 한국어 `type:` 제목 + 촘촘한 `- ` 블릿.
3. **develop 병합·push 금지 — 사용자 지시 대기.** `db:migrate` 미실행 사실을 보고에 명시.
