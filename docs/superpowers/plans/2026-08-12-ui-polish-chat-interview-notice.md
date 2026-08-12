# UI 개선 4건 + 채팅 면접 제안 안내 Implementation Plan

> **For agentic workers:** 이 계획은 dynamic-workflow(파일-비중첩 4에이전트 병렬)용이다. 각 Task는 독립 에이전트 하나가 수행한다. 에이전트는 git 커밋·pnpm install·빌드·테스트 실행을 하지 않는다 — 검증·커밋은 컨트롤러가 중앙에서 수행한다.

**Goal:** 급구 숨김-광고상품 연동, 모바일 첫 화면 푸터 제거, 필터 UI 결함 수정, 채팅 면접 제안 인라인 카드를 한 브랜치에서 구현한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-08-12-ui-polish-chat-interview-notice-design.md` 참조. 전부 기존 패턴 재사용(사이트 설정 조회, contact_request 시스템 메시지, DataTable 아님·순수 Tailwind 반응형). DB 마이그레이션 없음.

**Tech Stack:** Next.js(App Router)+Tailwind v4+shadcn(base-ui), oRPC, Drizzle, socket.io.

## Global Constraints

- DB 마이그레이션·enum 변경 금지. `chat_message.kind`는 자유 text 컬럼.
- 임의 px(`[Npx]`) 금지 — Tailwind 스케일 토큰. 단, 기존 파일에 이미 있는 `min-h-[calc(100dvh-56px)]` 같은 calc 임의값 패턴은 따른다.
- enum 원값 UI 노출 금지 — 라벨 맵 경유.
- 내비 버튼 primary 금지 — primary는 주요 액션 한 곳만.
- 컴포넌트는 shadcn 재사용 우선. 새 라이브러리 추가 금지.
- 각 에이전트는 자기 Task의 파일만 수정한다(파일 목록 밖 수정 금지). 매뉴얼(`docs/manual/*.md`)은 Task별 지정된 파일만.
- 주석·문구는 한국어, 기존 파일의 코멘트 밀도를 따른다.

---

### Task 1: 급구 숨김 ↔ 광고상품 연동

**Files:**
- Modify: `packages/api/src/routers/bambi/ad-products.ts` (getCatalog, :276 근처)
- Modify: `apps/web/src/lib/bambi/ad-preview-templates.ts`
- Modify: `apps/web/src/components/bambi/ad-product-form.tsx`
- Modify: `apps/web/src/app/moderator/ad-products/[placementId]/new/page.tsx`
- Modify: `apps/web/src/app/moderator/ad-products/[productId]/edit/page.tsx` (경로는 실제 확인 — `[placementId]`가 아닐 수 있음, `광고 상품 수정` 페이지)
- Modify: `docs/manual/moderator-manual.md` (광고 상품 추가 섹션 — 급구 숨김 시 옵션 미노출 1줄)

**Interfaces:**
- Consumes: `siteSettingsRouter.getExposureSectionConfig`(publicProcedure, 출력 `{ recommendedSlots, specialSlots, urgentHidden }`), `bambiSiteSettings.urgentSectionHidden`(default true), `AD_PREVIEW_TEMPLATE_OPTIONS`.
- Produces: `getPreviewTemplateOptionsForPlacementKind(kind, opts?: { includeUrgent?: boolean })` — 기존 호출부 시그니처 하위호환 유지.

**작업:**

1. **서버 카탈로그 필터** — `getCatalog`에서 `bambiSiteSettings` 단일 행(`SETTINGS_ROW_ID = "default"`)의 `urgentSectionHidden`을 읽어(행 없으면 true) true면 `previewTemplate === "urgent-list"`인 상품을 결과에서 제외한다. 기존 레거시 `side-*` 제외 로직 옆에 같은 방식으로. site-settings.ts의 기존 조회 헬퍼가 있으면 재사용, 없으면 getCatalog 안에서 `db.query`/select 한 번.
2. **옵션 필터 헬퍼** — `ad-preview-templates.ts`의 `getPreviewTemplateOptionsForPlacementKind`에 옵션 인자를 추가해 `includeUrgent: false`면 `urgent-list`를 제거. 기본값은 true(기존 호출부 무변경).
3. **운영자 폼** — `AdProductForm`에 `urgentHidden?: boolean` prop 추가. 옵션 계산부(:328)에서 `includeUrgent: !urgentHidden || previewTemplate === "urgent-list"` — 수정 화면에서 현재 값이 이미 urgent-list면 옵션 유지. new/edit 페이지에서 `orpc.bambi.siteSettings.getExposureSectionConfig.queryOptions()` 조회(기존 쿼리 패턴은 `apps/web/src/app/moderator/site-settings/page.tsx:89` 참조) 후 `urgentHidden`을 prop으로 전달.
4. **곁다리 버그** — `ad-product-form.tsx:408` `<Select items={AD_PREVIEW_TEMPLATE_LABELS}>`에 Record가 들어가는 문제: 해당 Select 컴포넌트의 `items` 계약을 확인하고 옵션 배열(또는 올바른 형태)로 교체. 동작 확인 근거를 보고에 남길 것.
5. 매뉴얼 1줄 동기화.

**완료 판정:** 급구 숨김 ON이면 (a) 구인자 공고 등록/수정의 노출 상품 목록(getCatalog 소비)에 급구 상품이 안 나오고 (b) 운영자 광고 상품 추가 폼 노출 영역에 "급구 채용 리스팅"이 안 보이며 (c) 기존 urgent-list 상품 수정 폼은 깨지지 않는다.

---

### Task 2: 모바일 첫 화면 푸터 제거 (콘텐츠 min-h)

**Files:**
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx` (:350 근처 main + children 래퍼)
- Modify: `apps/web/src/app/(legal)/layout.tsx`
- Modify: `apps/web/src/components/bambi/auth/seeker-auth-gate-screen.tsx`

**Interfaces:**
- Consumes: 헤더 높이 모바일 `h-14`(56px)·데스크톱 `h-16`(64px), `SiteFooter`, `CHAT_ROOM_PATH_RE`.
- Produces: 없음(레이아웃만).

**작업:**

1. `responsive-shell.tsx`: `<main className={cn("mx-auto flex min-h-[calc(100dvh-56px)] w-full flex-col", className)}>`에서 `min-h-[calc(100dvh-56px)]`를 제거하고, `{children}`을 감싸는 래퍼 div에 `flex min-h-[calc(100dvh-56px)] w-full flex-col md:min-h-[calc(100dvh-64px)]`를 준다. 푸터는 래퍼 밖, main 마지막 자식 유지. `className` prop이 main에 그대로 적용되는 기존 계약은 깨지 않는다.
   - **채팅방 경로 검증 필수**: 채팅방(`CHAT_ROOM_PATH_RE`)은 모바일에서 헤더가 숨고 자체 높이(`max-md:h-[var(--chat-visual-viewport-height,100dvh)]`)를 쓴다. 래퍼 min-h가 채팅 화면 높이·스크롤을 깨지 않는지 코드를 따라가 확인하고, 필요하면 채팅 경로에서 래퍼 min-h를 빼는 조건을 추가한다(기존 `isChatRoom` 계산 재사용).
2. `(legal)/layout.tsx`: `<main className="flex flex-1 flex-col">`에 `min-h-[calc(100dvh-3.5rem)] md:min-h-[calc(100dvh-4rem)]` 부여(이 레이아웃 헤더는 `h-14 md:h-16`). 푸터는 main 형제 유지.
3. `seeker-auth-gate-screen.tsx`: flex-1 본문 래퍼에 동일 min-h 부여, 푸터가 폴드 밖으로 밀리게.

**완료 판정:** 콘텐츠가 짧은 페이지(예: 모바일 마이페이지)에서 첫 화면에 푸터가 보이지 않고 스크롤해야 나온다. 콘텐츠가 긴 페이지·채팅방·하단 탭바 동작은 기존과 동일.

---

### Task 3: 필터 영역 UI/UX 수정

**Files:**
- Modify: `apps/web/src/components/bambi/marketplace.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx`
- Delete: `apps/web/src/components/bambi/screens/public-marketplace.tsx` (삭제 전 import 0건 재확인 — grep "public-marketplace")
- Modify: `apps/web/src/lib/bambi/marketplace.ts` (기본값 상수/초기화 헬퍼 필요 시)

**Interfaces:**
- Consumes: `MarketplaceFilters`(lib/bambi/marketplace.ts:15), `countActiveFilters`(marketplace.tsx:273), `useMarketplaceJobs`, shadcn `Sheet`/`Button`/`Input`.
- Produces: `DEFAULT_MARKETPLACE_FILTERS`(초기화용 기본값 객체) — lib/bambi/marketplace.ts에 이미 동등 상수가 있으면 재사용.

**작업:**

1. **브레이크포인트 정합**: 검색+필터 버튼 행이 `md:hidden`(seeker-marketplace.tsx:136 `searchFieldClassName="md:hidden"` + marketplace.tsx:298)으로 숨는 것을 1719px까지 노출로 변경 — 사이드바 aside가 `min-[1720px]:block`이므로 행/버튼은 `min-[1720px]:hidden`으로 통일(버튼의 `lg:hidden`(marketplace.tsx:305)도 동일 기준). 검색 필드 자체는 헤더 검색과 중복되면 기존 `md:hidden` 유지 가능 — 단 **필터 버튼은 모든 뷰포트(<1720px)에서 보여야 한다**. 행 구조상 분리가 필요하면 버튼만 별도로 빼서 목록 헤더 쪽에 배치해도 된다(디자인은 기존 버튼 스타일 그대로).
2. **초기화 버튼**: `MarketplaceFilterControls` 하단과 Sheet 하단 바에 "초기화" 버튼(variant ghost/outline, primary 금지). 클릭 시 `onFiltersChange(DEFAULT_MARKETPLACE_FILTERS)`. `countActiveFilters(filters) === 0`이면 disabled.
3. **Sheet 개선**: SheetContent 상단에 제목+닫기(X) 버튼(shadcn sheet의 기존 Close 프리미티브 사용), 하단 sticky 바: [초기화] [N건 보기](닫기 동작). N = 현재 결과 총 개수 — `seeker-marketplace.tsx`에서 `useMarketplaceJobs` 결과의 total(정확한 필드는 코드 확인)을 `MarketplaceFilterSheet`에 prop으로 전달. 즉시 적용 동작은 유지.
4. **최소시급 디바운스**: 최소시급 Input(marketplace.tsx:161)을 로컬 state로 즉시 표시하고 300ms 디바운스 후 `onFiltersChange` 호출. `useEffect`+`setTimeout` 조합(새 의존성 금지). 외부에서 filters.minimumPay가 리셋되면(초기화 버튼) 로컬 state 동기화.
5. **죽은 코드 삭제**: `MarketplaceFilterSidebar`(marketplace.tsx:213)와 `screens/public-marketplace.tsx` 삭제. 삭제로 안 쓰이게 되는 export·타입도 함께 정리(단, 다른 곳에서 쓰는 것은 유지). responsive-shell의 `variant="public"` 분기는 건드리지 않는다(Task 2 파일).

**완료 판정:** 375px·768px·1024px·1440px·1720px+ 모든 폭에서 필터 접근 가능. 초기화 한 번에 기본값 복귀. Sheet에 X·"N건 보기" 바. 최소시급 타이핑이 요청 난사를 만들지 않음. 삭제 파일 참조 0건.

---

### Task 4: 채팅 면접 제안 인라인 카드

**Files:**
- Modify: `packages/api/src/routers/bambi/chats.ts` (proposeInterview :1446-1495)
- Modify: `packages/api/src/services/bambi-chat-sync-queue.ts` (notifyChatMessageCreated :66)
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx` (kind 분기 :526, 카드 컴포넌트 추가)
- Modify: `docs/manual/seeker-manual.md`, `docs/manual/employer-manual.md` (면접 제안이 채팅방 카드로 표시·카드에서 확정/거절 가능 — 각 1~2줄)

**Interfaces:**
- Consumes: `contact_request` 패턴(chats.ts:1861 생성부, seeker-chat-room-responsive.tsx:412/526 렌더부), `generateChatMessageId()`, `enqueueChatMessageSync`/`drainPendingChatMessageSyncs`, `getById`의 `schedules` 배열(chats.ts:1110-1114), `setInterviewStatus` 뮤테이션, `INTERVIEW_STATUS` 계열 라벨(있으면 재사용 — enum 원값 노출 금지).
- Produces: `chat_message.kind = "interview_proposal"`, `metadata = { interviewScheduleId: string }`, `body = "면접 일정을 제안했습니다."`.

**작업:**

1. **proposeInterview 트랜잭션화**: schedule INSERT와 chatMessage INSERT를 한 `db.transaction`으로. 메시지 값: 위 Produces 계약대로, `senderUserId`는 제안자(구인자), `chatRoom.updatedAt` 갱신 + `enqueueChatMessageSync(tx, ...)`. 커밋 후 `drainPendingChatMessageSyncs()`. 기존 `emitRoomUpdated`·`notifyBambiNotification(action: "proposed")`은 유지.
2. **알림 중복 방지**: `notifyChatMessageCreated`에서 메시지 kind가 `"interview_proposal"`이면 `createBambiNotification`(chat_message 알림)을 건너뛴다 — 전용 interview_schedule 알림이 이미 발송됨. 소켓 emit(emitMessageCreated 등)은 그대로. kind를 어디서 읽는지(메시지 재조회 vs enqueue 페이로드 확장)는 기존 코드 구조를 따라 최소 변경으로.
3. **웹 카드 렌더**: `:526` 분기에 `kind === "interview_proposal"` 갈래 추가, `InterviewProposalMessage` 컴포넌트 신설(같은 파일, `ContactRequestMessage` 스타일 미러: `mx-auto max-w-[80%] rounded-lg border ... 중앙 정렬 카드`). 내용:
   - metadata의 `interviewScheduleId`로 `getById` 응답 `schedules`에서 해당 schedule 탐색. 못 찾으면 body 텍스트만 폴백.
   - 표시: 상태별 문구(proposed: 구직자에겐 "면접 일정 제안이 도착했어요"/구인자에겐 "면접 일정을 제안했어요", confirmed "면접 일정이 확정됐어요", declined "면접 제안이 거절됐어요", canceled "면접이 취소됐어요", completed "면접이 완료됐어요") + 제안 일시(기존 날짜 포맷 유틸 재사용)·장소 메모.
   - **구직자 && status === "proposed" && 제안자가 내가 아님** → [확정] [거절] 버튼. 기존 사이드패널 버튼(:1202-1224)이 쓰는 `setInterviewStatus` 뮤테이션·핸들러를 재사용(공용 핸들러로 끌어올려도 됨). 버튼 스타일도 사이드패널과 동일 계열.
   - 상태 변경 후에는 기존 `chat:room:updated` refetch로 카드 문구가 자동 갱신됨 — 별도 처리 불필요.
4. **매뉴얼 동기화** 각 1~2줄.

**완료 판정:** 구인자가 면접 제안 → 채팅 스트림에 카드 즉시 표시(양쪽), 구직자는 카드에서 확정/거절 가능, 상태 변경이 카드 문구에 반영, 미접속 구직자에게 알림은 기존 "면접 일정 제안" 1건만(채팅 새 메시지 알림 중복 없음). 네이티브·운영자 열람은 body 텍스트 폴백으로 자연스럽게 보임.

---

## 컨트롤러 검증 (에이전트 아님)

- [ ] 4 Task 결과 취합 후: `pnpm --filter web check-types`, `pnpm --filter @bambi-app/api check-types`, `pnpm --filter server check-types`
- [ ] ultracite lint — 변경 파일 경로 인자 명시(경로 없으면 0파일 함정)
- [ ] 기존 vitest: web `test/`(워크트리 안에서), api는 `cwd=packages/api`에서 `test/services`만. 라우터 테스트 실행 금지(dev DB 초기화 사고)
- [ ] 커밋(컨벤션: 한국어 type 제목 + 촘촘한 `- ` 블릿), `graphify update .`
- [ ] feat 브랜치로 no-ff 병합은 검증 통과 후
