# 내 공고 데스크톱 페이지네이션 + 리스팅 대기열 맞춤 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Dynamic Workflow(병렬 서브에이전트)로 태스크 단위 실행. 컨트롤러가 중앙 검증한다.

**Goal:** (1) 구인관리(내 공고) 데스크톱 테이블에 페이지네이션을 붙이고, (2) 스페셜/추천 리스팅 대기열의 상태 전이(접수·자동 노출 시작·대기열 제외)를 구인자에게 상품별 맞춤 문구로 알린다.

**Architecture:** FIFO 유료 대기열(PR #136)의 후속. 페이지네이션은 `DataTable`이 이미 지원하는 `pageSize` prop 배선만 한다. 알림은 기존 `bambi_notification` 파이프라인(targetType `job_post` + `metadata.action`)을 그대로 타므로 **DB enum·마이그레이션 변경이 없다** — 서버는 두 지점(결제 확정·승격 틱)에서 action을 새로 싣고, web은 라벨 맵(`notification-labels.ts`)에 문구·딥링크를 추가한다.

**Tech Stack:** Drizzle ORM, oRPC, Next.js RSC + shadcn(base-ui), vitest.

## Global Constraints

- 대기 판정 조건을 새로 쓰지 말 것 — 서버는 `queuedListingWhere`/`getListingQueuePositions`(bambi-premium-capacity), web은 `isQueuedListing`(lib/bambi/exposure)만 사용.
- enum·action 원값 화면 노출 금지 — 문구는 전부 `notification-labels.ts` 경유, 섹션 라벨은 `LISTING_QUEUE_SHORT_LABELS` 재사용([[bambi-no-raw-enum-in-ui]]).
- 알림은 best-effort — 알림 실패가 결제 확정·승격 틱 본 작업을 실패시키면 안 된다(`notifyBambiNotification`/`notifyModerationAction`만 사용, 직접 insert 금지).
- SSE 이벤트에는 metadata가 실리지 않고 action만 온다 — 동적 문구(제목·순번)는 반드시 **정적 폴백 문구**를 함께 둔다.
- 서브에이전트는 git·pnpm install·빌드·테스트 실행 금지. 검증은 컨트롤러가 중앙 실행.
- biome/ultracite 함정: 중첩 삼항 금지, 인지 복잡도 초과 시 헬퍼 추출, `useOptionalChain`.
- `bambi_notification.actorUserId`는 NOT NULL — 승격 틱(시스템 이벤트)은 `actorUserId = 공고 소유자(createdByUserId)`로 넣는다(라벨이 액터를 렌더하지 않아 무해).

## 공유 계약 (모든 에이전트가 이 이름·값을 그대로 사용)

```ts
// 신규 action 문자열 (targetType은 모두 "job_post")
"listing_queued"     // 결제 확정 시 정원 만석 → 대기열 접수
"listing_activated"  // 승격 틱이 대기열 선두를 노출로 승격
// 기존 action "remove_from_listing_queue"는 서버 변경 없음(web 라벨만 추가)

// metadata 형태
// listing_queued:    { exposureType: "special"|"recommended", jobPostTitle: string, position: number|null }
// listing_activated: { action: "listing_activated", exposureType, jobPostTitle: string, exposureDurationDays: number|null }

// web 문구 (notification-labels.ts)
// job_post:listing_queued    동적: "｢{제목}｣이 {스페셜|추천} 대기열 #{N}에 접수됐어요" / 정적 폴백: "결제가 확인돼 광고 대기열에 접수됐어요"
// job_post:listing_activated 동적: "｢{제목}｣ {스페셜|추천} 노출이 시작됐어요" / 정적 폴백: "광고 노출이 시작됐어요"
// job_post:remove_from_listing_queue 정적: "광고 대기열에서 제외됐어요" (+ reason 본문 표시)
// href: listing_queued·listing_activated → "/employer/promotions"
```

---

### Phase 1 — A1: 내 공고 데스크톱 페이지네이션 (web)

**Files:**
- Modify: `apps/web/src/app/employer/page.tsx`

**Steps:**
- [ ] `MOBILE_JOB_PAGE_SIZE`를 `JOB_PAGE_SIZE`로 리네임(모바일·데스크톱 공용, 값 10 유지).
- [ ] `OwnedJobsPanel`의 데스크톱 `DataTable`에 `pageSize={JOB_PAGE_SIZE}` 전달 — DataTable이 자체 페이징 UI(전체 N건 · i/n 페이지 + 이전/다음)를 렌더한다. 다른 변경 없음.

### Phase 1 — A2: 알림 라벨·딥링크·테스트·매뉴얼 (web)

**Files:**
- Modify: `apps/web/src/lib/bambi/notification-labels.ts`
- Modify: `apps/web/test/lib/bambi/notification-labels.test.ts`
- Modify: `docs/manual/employer-manual.md` (알림 섹션)

**Steps:**
- [ ] `TITLE_BY_TARGET_AND_ACTION`에 정적 폴백 3종 추가: `job_post:listing_queued` → "결제가 확인돼 광고 대기열에 접수됐어요", `job_post:listing_activated` → "광고 노출이 시작됐어요", `job_post:remove_from_listing_queue` → "광고 대기열에서 제외됐어요".
- [ ] `dynamicTitle`에 두 케이스 추가(재료 하나라도 없으면 null 폴백): `listing_queued`는 `jobPostTitle`+`position`+`exposureType`으로 "｢제목｣이 스페셜 대기열 #3에 접수됐어요", `listing_activated`는 `jobPostTitle`+`exposureType`으로 "｢제목｣ 스페셜 노출이 시작됐어요". 섹션 라벨은 `LISTING_QUEUE_SHORT_LABELS`(`./exposure`)를 import해 매핑하고, 맵 밖 exposureType이면 null 폴백.
- [ ] `REASON_VISIBLE_OUTCOMES`에 `"remove_from_listing_queue"` 추가 — 운영자가 남긴 제외 사유가 본문으로 보이게.
- [ ] `jobPostHref`: `rawAction`이 `listing_queued`·`listing_activated`면 `"/employer/promotions"` 반환(대기 순번·노출 상태가 보이는 광고 관리가 착지점).
- [ ] `notification-labels.test.ts` 확장: 동적 제목 2종(재료 완비/누락 폴백 각각), remove 사유 본문 표시, href 3종.
- [ ] `docs/manual/employer-manual.md` 알림 섹션에 대기열 알림 3종(접수·자동 노출 시작·대기열 제외) 행 추가.

### Phase 1 — A3: 결제 확정 시 대기열 접수 알림 (api/moderation)

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts`

**Steps:**
- [ ] `setJobPostPayment`(단건, ~L2022): 트랜잭션 커밋 후, `input.paymentStatus === "paid"`이고 updated 행이 대기열(스페셜|추천 && `exposureEndsAt === null` && `listingPaidAt !== null`)이면 기존 `set_payment:paid` 알림 대신 `notifyModerationAction({ action: "listing_queued", metadata: { exposureType, jobPostTitle: updated.title, position }, ... })`를 보낸다. position은 커밋 후 `getListingQueuePositions(db)` 맵에서 `?.position ?? null`. 대기열이 아니면(즉시 활성·비리스팅·unpaid 전환) 기존 알림 그대로.
- [ ] 일괄 결제(`~L2629` 성공분 알림 루프): 커밋 후 성공 id들의 행(`id, title, exposureType, exposureEndsAt, listingPaidAt`)을 한 번에 select하고 `getListingQueuePositions(db)`를 1회 호출해, 행별로 단건과 동일한 규칙으로 `listing_queued` vs 기존 `set_payment:${status}`를 분기한다(대기열 알림 metadata에 `bulk: true` 유지 불필요 — 단건과 동일 형태).
- [ ] 중복 조회·분기 로직이 단건·일괄에서 반복되면 모듈 레벨 순수 헬퍼로 추출해 인지 복잡도를 넘기지 않는다.

### Phase 1 — A4: 승격 틱 노출 시작 알림 (api/services)

**Files:**
- Modify: `packages/api/src/services/bambi-listing-promotion.ts`

**Steps:**
- [ ] `promoteSectionToCapacity`의 head select에 `createdByUserId: jobPost.createdByUserId`, `title: jobPost.title` 추가.
- [ ] `didActivate === true`일 때 `notifyBambiNotification`(from `./bambi-notifications`) 호출: `{ actorUserId: head.createdByUserId, recipientUserId: head.createdByUserId, targetId: head.id, targetType: "job_post", metadata: { action: "listing_activated", exposureType: type, exposureDurationDays: head.exposureDurationDays, jobPostTitle: head.title } }`. 이미 내부 try/catch(best-effort)라 틱을 죽이지 않지만, 알림 await가 승격 루프를 막지 않게 승격 카운트 이후에 호출한다.
- [ ] 기존 `test/services`의 listing-promotion 테스트가 select 컬럼 추가로 깨지지 않는지 시그니처를 확인(깨지면 픽스처만 보강, 동작 변경 금지).

### Phase 2 — 컨트롤러 중앙 검증

- [ ] `pnpm --filter @bambi-app/api check-types` · `pnpm --filter web check-types`(워크트리 안) · server check-types
- [ ] `pnpm dlx ultracite fix <변경 파일들>` (경로 인자 필수)
- [ ] web: `pnpm exec vitest run test/lib/bambi/notification-labels.test.ts` (워크트리 apps/web에서)
- [ ] api: cwd=packages/api에서 `test/services` 중 listing-promotion 관련만 실행(라우터 스위트 금지 — dev DB 파괴)
- [ ] 커밋(한국어 type: 제목 + 촘촘한 블릿) → ExitWorktree(keep) → no-ff 병합 → `graphify update .`
