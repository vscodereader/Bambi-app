# 밤비 고객센터 · 게시물 운영 조치 · 금칙어 차단 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**설계 문서:** `docs/superpowers/specs/2026-07-20-bambi-support-center-moderation-design.md`

**Goal:** 고객센터(1:1 Q&A 문의 + FAQ)를 신설하고, 운영자가 커뮤니티·고객센터 게시물을 한 화면에서 블라인드·삭제할 수 있게 하며, 사용자가 쓴 제목·본문에 금칙어가 있으면 게시를 차단한다.

**Architecture:** 고객센터는 커뮤니티(수다방)와 완전히 분리된 전용 테이블·라우터·`/support` 최상위 라우트로 만든다. 커뮤니티 입장 자격이 성별·광고 상태 기반이라 구인자·구직자 전원이 쓰는 고객센터가 그 게이트를 상속하면 안 되기 때문이다. 금칙어는 DB에 두고 순수 함수 매칭 엔진 + 인메모리 캐시로 소비하며, 작성 프로시저에서 `BAD_REQUEST`로 차단한다. 운영 조치는 기존 패턴(상태 enum 전환 + 감사로그를 한 트랜잭션에)을 그대로 따른다.

**Tech Stack:** TypeScript, oRPC(`@orpc/server`), Drizzle ORM + PostgreSQL, zod, Next.js 16 App Router, TanStack Query, shadcn/ui(base-ui) + Tailwind v4, vitest.

## Global Constraints

- **API는 `apps/server`가 아니라 `packages/api`에 있다.** `apps/server`는 Hono 부트스트랩뿐이다.
- **tRPC가 아니라 oRPC다.** `.input().handler()` 패턴이며 `.query`/`.mutation` 구분이 없다.
- 사용자에게 보일 에러는 `new ORPCError("<CODE>", { message: "한국어 문구" })`로 던진다. 이 `message`가 웹에서 `toast.error(error.message)`로 그대로 노출된다.
- zod 스키마는 각 라우터 파일 상단에 모아서 정의한다(공유 밸리데이션 패키지 없음). 순수 도메인 규칙은 `packages/api/src/services/bambi-*.ts`로 분리한다.
- 테스트는 콜로케이션 `<name>.test.ts`. 러너는 vitest, **테스트 스크립트가 있는 패키지는 `packages/api` 하나뿐**이다.
- DB 통합 테스트는 `dotenv.config({ path: "../../apps/server/.env" })`를 **최상단에서 먼저** 실행한 뒤 **top-level await + 동적 import**로 db/스키마/라우터를 가져와야 한다. 정적 import는 env보다 먼저 평가되어 깨진다.
- 테스트 픽스처로 `organization`·`member`를 시드할 때 **`createdAt`을 수동 지정**해야 한다(default 없음).
- **`db:push`는 절대 실행하지 않는다.** `db:generate`/`db:migrate`는 사용자의 명시 지시가 있을 때만 실행한다.
- **빌드·dev 서버 기동 금지**(`.claude/rules/no-build-or-run.md`). 검증은 `check-types`와 테스트까지만 하고, 화면 확인은 사용자에게 요청한다.
- 웹 UI는 shadcn 컴포넌트 + Tailwind만 쓴다. **인라인 `style` 금지, `space-x-*`/`space-y-*` 금지**(`flex flex-col gap-*` 사용), 조건부 클래스는 `cn()`, 가로세로 같으면 `size-*`, **`rounded-none` 금지**. 색은 시맨틱 토큰(`bg-background`/`text-muted-foreground`) 또는 브랜드 유틸(`bg-coral-500`/`text-ink-800`). raw hex 금지.
- 이 레포의 shadcn `base`는 **base-ui(radix 아님)** — 커스텀 트리거는 `asChild`가 아니라 `render` prop.
- 임의 px(`[16px]`) 금지, Tailwind 스케일 토큰 사용.
- 커밋 메시지는 한국어 `type:` 제목 + `- ` 블릿 본문(블릿 사이 빈 줄 없음). 멀티라인은 파일로 써서 `git commit -F`.
- 커밋 전 `pnpm dlx ultracite fix`로 Biome 정렬·린트.
- **push·PR 생성 금지.** 로컬 커밋까지만 한다.

## File Structure

**packages/db**
- `src/schema/bambi.ts` (수정) — enum 2개 추가, `moderationTargetType`에 값 2개 추가, 테이블 4개 + relations 추가
- `src/index.ts` (수정) — 새 테이블 re-export
- `src/migrations/0017_*.sql` (생성) — `db:generate` 산출물

**packages/api**
- `src/index.ts` (수정) — `adminProcedure` 신설
- `src/services/bambi-banned-words.ts` (생성) — 정규화·매칭 순수 함수 + 캐시. 금칙어 규칙의 단일 진실원
- `src/services/bambi-banned-words.test.ts` (생성)
- `src/services/bambi-tiptap-text.ts` (생성) — TipTap JSON → 평문 추출. 커뮤니티 본문 검사 전용
- `src/services/bambi-tiptap-text.test.ts` (생성)
- `src/routers/bambi/banned-words.ts` (생성) — 금칙어 CRUD(admin)
- `src/routers/bambi/support.ts` (생성) — 고객센터 문의·FAQ
- `src/routers/bambi/support.test.ts` (생성)
- `src/routers/bambi/community.ts` (수정) — 작성·수정 4개 프로시저에 금칙어 검사 추가
- `src/routers/bambi/moderation.ts` (수정) — 문의 조치 2개 + 통합 목록 1개 추가
- `src/routers/bambi/index.ts` (수정) — `support`, `bannedWords` 등록

**apps/web**
- `src/lib/bambi/support.ts` (생성) — 카테고리·상태 한국어 라벨, 경로 헬퍼. 고객센터 메타의 단일 진실원
- `src/app/support/layout.tsx` `page.tsx` `inquiries/page.tsx` `inquiries/new/page.tsx` `inquiries/[id]/page.tsx` (생성)
- `src/components/bambi/support/faq-list.tsx` `inquiry-list.tsx` `inquiry-form.tsx` `inquiry-thread.tsx` (생성)
- `src/components/bambi/responsive-shell.tsx:18` (수정) — `DEFAULT_NAV_ITEMS`에 고객센터
- `src/app/employer/layout.tsx:9` (수정) — `EMPLOYER_NAV_ITEMS`에 고객센터
- `src/app/moderator/content/page.tsx` `support/page.tsx` `banned-words/page.tsx` (생성)
- `src/app/moderator/layout.tsx:8` (수정), `src/components/bambi/persona-nav.tsx:124,130,165` (수정) — 네비 4곳

**packages/ui**
- `src/components/table.tsx` `accordion.tsx` (생성) — `pnpm dlx shadcn@latest add`

---

### Task 1: DB 스키마 — enum·테이블·relations

**Files:**
- Modify: `packages/db/src/schema/bambi.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces: `supportInquiryCategory`, `supportInquiryStatus` (pgEnum), `supportInquiry`, `supportInquiryMessage`, `faqEntry`, `bannedWord` (pgTable) — 이후 모든 태스크가 `@bambi-app/db/schema/bambi`에서 import한다.

- [x] **Step 1: enum 2개를 기존 enum 블록 끝에 추가**

`packages/db/src/schema/bambi.ts`의 `communityContentStatus`(89-93행) 정의 아래에 이어 붙인다.

```ts
// 고객센터 문의 분류. FAQ도 같은 분류를 재사용한다(사용자가 같은 기준으로 찾게).
export const supportInquiryCategory = pgEnum("support_inquiry_category", [
	"account",
	"job_post",
	"payment",
	"report",
	"etc",
]);

// 문의 진행 상태. 운영 조치 상태(community_content_status)와는 별개 축이다 —
// answered면서 hidden일 수 있다.
export const supportInquiryStatus = pgEnum("support_inquiry_status", [
	"open",
	"answered",
	"closed",
]);
```

- [x] **Step 2: `moderationTargetType`에 값 2개 추가**

같은 파일 69-77행의 배열에 두 값을 더한다. 감사로그가 문의를 가리킬 수 있어야 한다.

```ts
export const moderationTargetType = pgEnum("moderation_target_type", [
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"user",
	"community_post",
	"community_comment",
	"support_inquiry",
	"support_inquiry_message",
]);
```

- [x] **Step 3: 테이블 4개를 `communityPostLike`(774-793행) 아래에 추가**

`relations` 정의 블록(795행 `bambiProfileRelations`) **앞에** 넣는다.

```ts
export const supportInquiry = pgTable(
	"support_inquiry",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// 작성 시점 계정 유형 스냅샷(서버 기록). 이후 role 변경과 무관하게 문의 맥락을 보존한다.
		authorRole: bambiUserRole("author_role").notNull(),
		category: supportInquiryCategory("category").notNull(),
		title: text("title").notNull(),
		// 커뮤니티와 달리 평문이다 — 문의에 서식이 필요 없고 금칙어 검사를 바로 걸 수 있다.
		body: text("body").notNull(),
		inquiryStatus: supportInquiryStatus("inquiry_status")
			.default("open")
			.notNull(),
		// 운영 조치 상태. community_content_status를 재사용해 조치 로직·UI 매핑을 공유한다.
		status: communityContentStatus("status").default("published").notNull(),
		// 목록 정렬용 — 답변이 달리면 갱신해 위로 올린다.
		lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("support_inquiry_author_user_id_created_at_idx").on(
			table.authorUserId,
			table.createdAt
		),
		index("support_inquiry_inquiry_status_last_message_at_idx").on(
			table.inquiryStatus,
			table.lastMessageAt
		),
		index("support_inquiry_status_created_at_idx").on(
			table.status,
			table.createdAt
		),
	]
);

export const supportInquiryMessage = pgTable(
	"support_inquiry_message",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		inquiryId: uuid("inquiry_id")
			.notNull()
			.references(() => supportInquiry.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// 작성 시점 운영자 여부 스냅샷. 이후 role이 바뀌어도 스레드 표시가 흔들리지 않는다.
		isStaff: boolean("is_staff").default(false).notNull(),
		body: text("body").notNull(),
		status: communityContentStatus("status").default("published").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("support_inquiry_message_inquiry_id_created_at_idx").on(
			table.inquiryId,
			table.createdAt
		),
	]
);

export const faqEntry = pgTable(
	"faq_entry",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		category: supportInquiryCategory("category").notNull(),
		question: text("question").notNull(),
		answer: text("answer").notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		isPublished: boolean("is_published").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("faq_entry_is_published_sort_order_idx").on(
			table.isPublished,
			table.sortOrder
		),
	]
);

export const bannedWord = pgTable(
	"banned_word",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		// 운영자가 입력한 원문(표시용).
		term: text("term").notNull(),
		// 정규화형(매칭용). 저장 시 계산해 두고 매 요청 재계산을 피한다.
		normalizedTerm: text("normalized_term").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		// 정규화형에 걸어야 "성 매매"와 "성매매"가 중복 등록되지 않는다.
		uniqueIndex("banned_word_normalized_term_uidx").on(table.normalizedTerm),
		index("banned_word_is_active_idx").on(table.isActive),
	]
);
```

- [x] **Step 4: relations 추가**

파일 끝의 relations 블록(885-908행 부근)에 이어 붙인다.

```ts
export const supportInquiryRelations = relations(
	supportInquiry,
	({ many }) => ({
		messages: many(supportInquiryMessage),
	})
);

export const supportInquiryMessageRelations = relations(
	supportInquiryMessage,
	({ one }) => ({
		inquiry: one(supportInquiry, {
			fields: [supportInquiryMessage.inquiryId],
			references: [supportInquiry.id],
		}),
	})
);
```

- [x] **Step 5: `packages/db/src/index.ts`에 re-export 추가**

기존 export 목록(24행·62행 부근에 `adminModerationAction`이 있는 형식)과 같은 자리에 알파벳 순서를 지켜 넣는다.

```ts
	bannedWord,
	faqEntry,
	supportInquiry,
	supportInquiryCategory,
	supportInquiryMessage,
	supportInquiryStatus,
```

- [x] **Step 6: 타입체크**

Run: `cd packages/db && pnpm check-types`
Expected: 에러 없이 종료(exit 0). `uniqueIndex`·`integer`·`boolean`이 이미 파일 상단에서 import되어 있는지 확인하고, 빠진 게 있으면 drizzle-orm/pg-core import에 추가한다.

- [x] **Step 7: 커밋**

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/index.ts
git commit -F <메시지 파일>
```

메시지:

```
feat(db): 고객센터·금칙어 테이블과 enum 추가
- support_inquiry_category(account/job_post/payment/report/etc)·support_inquiry_status(open/answered/closed) enum 신설, FAQ도 같은 분류를 재사용해 사용자가 동일 기준으로 탐색하게 함
- moderation_target_type에 support_inquiry·support_inquiry_message 추가 — 감사로그가 문의를 가리킬 수 있어야 운영 조치 이력이 남음
- support_inquiry: 진행 상태(inquiry_status)와 운영 조치 상태(status)를 별개 축으로 분리 — answered면서 hidden인 상태가 성립함
- 운영 조치 상태는 community_content_status를 재사용 — 값 의미가 동일해 조치 로직과 UI 매핑을 유형 간 공유(새 enum은 조치 코드를 유형별로 쪼갬)
- 문의 본문은 커뮤니티와 달리 평문 text — 서식이 불필요하고 금칙어 검사를 텍스트 추출 없이 바로 걸 수 있음
- banned_word는 normalized_term을 저장하고 유니크 인덱스도 그쪽에 걸어 "성 매매"와 "성매매"의 중복 등록을 차단
- last_message_at으로 답변 달린 문의를 목록 상단으로 올림
```

---

### Task 2: 마이그레이션 0017 생성

**Files:**
- Create: `packages/db/src/migrations/0017_*.sql` (drizzle-kit 산출물)

**Interfaces:**
- Consumes: Task 1의 스키마 정의
- Produces: 적용 가능한 마이그레이션 파일

- [x] **Step 1: 사용자에게 마이그레이션 생성 승인을 요청**

`db:generate`는 사용자의 명시 지시가 있을 때만 실행한다. 승인 없이 다음 단계로 넘어가지 않는다.

- [x] **Step 2: 승인을 받으면 마이그레이션 생성**

Run: `cd packages/db && pnpm db:generate`
Expected: `src/migrations/0017_<random_name>.sql`과 `meta/0017_snapshot.json`이 생성된다. 번호가 0017이 아니면 중단하고 보고한다.

- [x] **Step 3: 생성된 SQL에서 `ALTER TYPE` 문을 확인**

`moderation_target_type`에 값을 추가하는 문이 아래 형태로 들어 있어야 한다.

```sql
ALTER TYPE "public"."moderation_target_type" ADD VALUE 'support_inquiry';
ALTER TYPE "public"."moderation_target_type" ADD VALUE 'support_inquiry_message';
```

PostgreSQL은 `ALTER TYPE ... ADD VALUE`를 같은 트랜잭션 안에서 추가·사용하는 것을 막는다. 이 마이그레이션에서는 값을 추가만 하고 사용하지 않으므로 그대로 두면 되지만, drizzle이 `CREATE TABLE`과 같은 트랜잭션에 묶었다면 `ALTER TYPE` 문들을 파일 맨 위로 올려 둔다.

- [x] **Step 4: 설계 문서의 마이그레이션 번호를 실제 파일명으로 갱신**

`docs/superpowers/specs/2026-07-20-bambi-support-center-moderation-design.md`의 §4 첫 줄 마이그레이션 번호를 생성된 실제 파일명으로 고친다. AGENTS.md가 요구하는 문서 동기화 항목이다.

- [x] **Step 5: 커밋**

```
feat(db): 고객센터·금칙어 마이그레이션 0017 추가
- Task 1 스키마(enum 2종·테이블 4종·moderation_target_type 값 2종)의 drizzle-kit 산출물
- ALTER TYPE ADD VALUE는 같은 트랜잭션에서 추가·사용이 불가해 CREATE TABLE보다 앞에 오도록 배치 확인
- 설계 문서의 마이그레이션 번호를 실제 생성 파일명으로 동기화
```

---

### Task 3: `adminProcedure` 신설

**Files:**
- Modify: `packages/api/src/index.ts`

**Interfaces:**
- Produces: `adminProcedure` — 이후 모든 admin 프로시저가 `import { adminProcedure } from "../../index"`로 쓴다.

현재 admin 게이트는 각 핸들러 첫 줄의 `await requireAdminProfile(context.session)` 인라인 호출이다. 신규 프로시저에서 이 한 줄을 빠뜨리면 로그인한 아무나 호출할 수 있으므로 미들웨어로 승격한다.

- [x] **Step 1: `packages/api/src/index.ts`를 아래 내용으로 수정**

```ts
import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";
import { requireAdminProfile } from "./services/bambi-authz";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({
		context: {
			session: context.session,
		},
	});
});

export const protectedProcedure = publicProcedure.use(requireAuth);

// 운영자 전용 게이트. 기존 프로시저는 핸들러 첫 줄에서 requireAdminProfile을 직접 부르지만,
// 그 방식은 한 줄만 빠뜨려도 그대로 뚫린다. 신규 admin 프로시저는 이 미들웨어를 쓴다.
const requireAdmin = o.middleware(async ({ context, next }) => {
	await requireAdminProfile(context.session);
	return next();
});

export const adminProcedure = protectedProcedure.use(requireAdmin);
```

- [x] **Step 2: 순환 import가 없는지 확인**

`services/bambi-authz.ts`는 `../../index`를 import하지 않으므로 순환이 생기지 않는다. 확인:

Run: `cd packages/api && pnpm check-types`
Expected: 에러 없이 종료.

- [x] **Step 3: 기존 테스트가 깨지지 않는지 확인**

Run: `cd packages/api && pnpm test`
Expected: 기존 테스트 결과가 변경 전과 동일. 신규 실패 0건.

- [x] **Step 4: 커밋**

```
feat(api): 운영자 전용 adminProcedure 미들웨어 신설
- 기존 admin 게이트는 핸들러 본문 첫 줄의 requireAdminProfile 인라인 호출이라 신규 프로시저에서 한 줄만 누락돼도 로그인한 아무나 호출 가능한 구조였음
- protectedProcedure에 requireAdmin 미들웨어를 얹어 게이트를 타입·실행 양쪽에서 강제
- 기존 프로시저는 동작이 동일해도 전환 시 회귀 검증 부담이 있어 이번엔 손대지 않음(신규 admin 프로시저만 사용)
- bambi-authz는 index를 import하지 않아 순환 참조 없음
```

---

### Task 4: 금칙어 매칭 엔진 (순수 함수, TDD)

**Files:**
- Create: `packages/api/src/services/bambi-banned-words.ts`
- Test: `packages/api/src/services/bambi-banned-words.test.ts`

**Interfaces:**
- Produces:
  - `normalizeForMatch(text: string): string`
  - `type BannedWordEntry = { term: string; normalizedTerm: string }`
  - `findBannedTerm(text: string, entries: BannedWordEntry[]): string | null` — 걸린 **원문 term**을 하나 반환, 없으면 null

단순 `includes()`는 공백 하나로 뚫리고, 운영자가 정규식을 직접 넣게 하면 잘못된 패턴 하나로 서비스 전체 글쓰기가 막힌다. 정규화 + 부분문자열이 그 중간이다.

- [x] **Step 1: 실패하는 테스트를 작성**

`packages/api/src/services/bambi-banned-words.test.ts`

```ts
import { describe, expect, it } from "vitest";

import {
	type BannedWordEntry,
	findBannedTerm,
	normalizeForMatch,
} from "./bambi-banned-words";

const entry = (term: string): BannedWordEntry => ({
	term,
	normalizedTerm: normalizeForMatch(term),
});

describe("normalizeForMatch", () => {
	it("공백과 특수문자를 제거한다", () => {
		expect(normalizeForMatch("성 매매")).toBe("성매매");
		expect(normalizeForMatch("성*매매")).toBe("성매매");
		expect(normalizeForMatch("성.매.매")).toBe("성매매");
		expect(normalizeForMatch("성-매-매")).toBe("성매매");
	});

	it("영문을 소문자로 접는다", () => {
		expect(normalizeForMatch("ViAgRa")).toBe("viagra");
	});

	it("한글 자모와 숫자는 보존한다", () => {
		expect(normalizeForMatch("ㅅㅁㅁ 010")).toBe("ㅅㅁㅁ010");
	});

	it("빈 문자열을 안전하게 처리한다", () => {
		expect(normalizeForMatch("")).toBe("");
	});
});

describe("findBannedTerm", () => {
	const entries = [entry("성매매"), entry("미성년")];

	it("정확히 일치하면 원문 term을 반환한다", () => {
		expect(findBannedTerm("성매매 알선합니다", entries)).toBe("성매매");
	});

	it("공백·특수문자로 우회해도 잡는다", () => {
		expect(findBannedTerm("성 매매 합니다", entries)).toBe("성매매");
		expect(findBannedTerm("성*매매 합니다", entries)).toBe("성매매");
	});

	it("금칙어가 없으면 null을 반환한다", () => {
		expect(findBannedTerm("평범한 구인 공고입니다", entries)).toBeNull();
	});

	it("목록이 비면 null을 반환한다", () => {
		expect(findBannedTerm("성매매", [])).toBeNull();
	});

	it("여러 개가 걸리면 목록에서 먼저 만난 것을 반환한다", () => {
		expect(findBannedTerm("미성년 성매매", entries)).toBe("성매매");
	});

	// 정규화의 부작용 — 공백 제거로 인접 단어가 붙어 우연히 금칙어를 이루는 경계를 고정한다.
	// 이 동작은 의도된 것이다(우회 차단을 위해 오탐을 감수). 바뀌면 테스트가 알려준다.
	it("공백 제거로 인접 단어가 붙는 경우도 차단된다", () => {
		expect(findBannedTerm("완성 매매가 끝났다", entries)).toBe("성매매");
	});

	it("정상 문장은 통과시킨다", () => {
		expect(findBannedTerm("주말 근무 가능하신 분 구합니다", entries)).toBeNull();
	});
});
```

- [x] **Step 2: 테스트를 실행해 실패를 확인**

Run: `cd packages/api && pnpm vitest run src/services/bambi-banned-words.test.ts`
Expected: FAIL — `Failed to resolve import "./bambi-banned-words"`

- [x] **Step 3: 최소 구현을 작성**

`packages/api/src/services/bambi-banned-words.ts`

```ts
// 금칙어 매칭 규칙의 단일 진실원. 순수 함수만 두어 DB 없이 테스트한다.
//
// 매칭 전략: 정규화(공백·구두점·기호 제거 + 소문자) 후 부분문자열.
// 단순 includes()는 공백 하나로 뚫리고, 운영자가 정규식을 직접 넣게 하면 잘못된 패턴 하나로
// 서비스 전체 글쓰기가 막힌다. 그 중간 지점이다.
//
// 부작용: 공백을 지우므로 인접한 두 단어가 붙어 우연히 금칙어를 이룰 수 있다(오탐).
// 우회 차단을 위해 이 오탐은 감수하며, 경계는 테스트로 고정한다.

export interface BannedWordEntry {
	normalizedTerm: string;
	term: string;
}

// 공백·구두점(\p{P})·기호(\p{S}) 제거. 한글 자모·숫자·문자는 남긴다.
const STRIP_RE = /[\s\p{P}\p{S}]/gu;

export const normalizeForMatch = (text: string): string =>
	text.toLowerCase().replace(STRIP_RE, "");

export const findBannedTerm = (
	text: string,
	entries: BannedWordEntry[]
): string | null => {
	if (entries.length === 0) {
		return null;
	}

	const normalizedText = normalizeForMatch(text);

	if (normalizedText.length === 0) {
		return null;
	}

	for (const candidate of entries) {
		if (
			candidate.normalizedTerm.length > 0 &&
			normalizedText.includes(candidate.normalizedTerm)
		) {
			return candidate.term;
		}
	}

	return null;
};
```

- [x] **Step 4: 테스트를 실행해 통과를 확인**

Run: `cd packages/api && pnpm vitest run src/services/bambi-banned-words.test.ts`
Expected: PASS — 12 passed

"여러 개가 걸리면 목록에서 먼저 만난 것을 반환한다" 테스트가 실패하면 `entries` 순서 가정이 어긋난 것이다. 테스트의 기대값을 실제 순회 순서(`entries[0]`부터)에 맞춘다.

- [x] **Step 5: 커밋**

```
feat(api): 금칙어 매칭 엔진 추가(정규화 후 부분문자열)
- normalizeForMatch: 공백·구두점·기호를 제거하고 소문자로 접어 "성 매매"·"성*매매" 류 우회를 흡수
- findBannedTerm: 걸린 원문 term 하나를 반환(전체 목록을 노출하지 않되 사용자가 무엇을 고칠지는 알 수 있게)
- 단순 includes()는 공백 하나로 뚫리고 운영자 정규식 입력은 잘못된 패턴 하나로 전체 글쓰기를 막아 그 중간을 택함
- 정규화로 인접 단어가 붙어 생기는 오탐은 우회 차단을 위해 감수하고, 그 경계를 테스트로 고정
- DB 의존이 없는 순수 함수라 단위 테스트만으로 규칙 전체를 검증
```

---

### Task 5: TipTap 본문 텍스트 추출 (순수 함수, TDD)

**Files:**
- Create: `packages/api/src/services/bambi-tiptap-text.ts`
- Test: `packages/api/src/services/bambi-tiptap-text.test.ts`

**Interfaces:**
- Produces: `extractTiptapText(body: string): string`

커뮤니티 본문은 TipTap JSON 문자열이라 금칙어를 걸려면 평문을 뽑아야 한다. 고객센터 본문은 평문이므로 이 함수를 쓰지 않는다.

- [x] **Step 1: 실패하는 테스트를 작성**

`packages/api/src/services/bambi-tiptap-text.test.ts`

```ts
import { describe, expect, it } from "vitest";

import { extractTiptapText } from "./bambi-tiptap-text";

describe("extractTiptapText", () => {
	it("문단의 text 노드를 이어 붙인다", () => {
		const doc = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "안녕하세요" }],
				},
			],
		});
		expect(extractTiptapText(doc)).toBe("안녕하세요");
	});

	it("중첩된 노드의 텍스트도 모두 모은다", () => {
		const doc = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "bulletList",
					content: [
						{
							type: "listItem",
							content: [
								{
									type: "paragraph",
									content: [{ type: "text", text: "첫째" }],
								},
							],
						},
					],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: "둘째" }],
				},
			],
		});
		expect(extractTiptapText(doc)).toContain("첫째");
		expect(extractTiptapText(doc)).toContain("둘째");
	});

	it("노드 사이에 공백을 넣어 단어가 붙지 않게 한다", () => {
		const doc = JSON.stringify({
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "완성" }] },
				{ type: "paragraph", content: [{ type: "text", text: "매매" }] },
			],
		});
		expect(extractTiptapText(doc)).toBe("완성 매매");
	});

	it("JSON이 아니면 원문을 그대로 돌려준다", () => {
		expect(extractTiptapText("그냥 평문")).toBe("그냥 평문");
	});

	it("빈 문서를 안전하게 처리한다", () => {
		expect(extractTiptapText(JSON.stringify({ type: "doc", content: [] }))).toBe(
			""
		);
	});
});
```

- [x] **Step 2: 테스트를 실행해 실패를 확인**

Run: `cd packages/api && pnpm vitest run src/services/bambi-tiptap-text.test.ts`
Expected: FAIL — `Failed to resolve import "./bambi-tiptap-text"`

- [x] **Step 3: 최소 구현을 작성**

`packages/api/src/services/bambi-tiptap-text.ts`

```ts
// TipTap JSON 본문에서 평문을 뽑는다. 금칙어 검사 전용이며 렌더링용이 아니다.
// 노드 사이에 공백을 넣는 이유: 문단 경계를 지우면 "완성"+"매매"가 붙어 없던 금칙어가
// 생겨 오탐이 난다.

interface TiptapNode {
	content?: unknown;
	text?: unknown;
}

const collectText = (node: unknown, parts: string[]): void => {
	if (!node || typeof node !== "object") {
		return;
	}

	const typed = node as TiptapNode;

	if (typeof typed.text === "string") {
		parts.push(typed.text);
	}

	if (Array.isArray(typed.content)) {
		for (const child of typed.content) {
			collectText(child, parts);
		}
	}
};

export const extractTiptapText = (body: string): string => {
	let parsed: unknown;

	try {
		parsed = JSON.parse(body);
	} catch {
		// 평문이 들어오면 그대로 검사 대상으로 삼는다.
		return body;
	}

	const parts: string[] = [];
	collectText(parsed, parts);

	return parts.join(" ");
};
```

- [x] **Step 4: 테스트를 실행해 통과를 확인**

Run: `cd packages/api && pnpm vitest run src/services/bambi-tiptap-text.test.ts`
Expected: PASS — 5 passed

- [x] **Step 5: 커밋**

```
feat(api): TipTap 본문 평문 추출 유틸 추가
- 커뮤니티 본문은 TipTap JSON 문자열이라 금칙어를 걸려면 평문 추출이 선행돼야 함(고객센터 본문은 평문이라 불필요)
- 노드 텍스트를 공백으로 이어 붙임 — 문단 경계를 지우면 "완성"+"매매"가 붙어 없던 금칙어가 생기는 오탐 발생
- JSON 파싱 실패 시 원문을 그대로 반환해 평문 입력도 안전하게 검사
- 렌더링용이 아니라 검사 전용임을 주석에 명시
```

---

### Task 6: 금칙어 조회 캐시 + 라우터

**Files:**
- Modify: `packages/api/src/services/bambi-banned-words.ts`
- Create: `packages/api/src/routers/bambi/banned-words.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`

**Interfaces:**
- Consumes: Task 4의 `normalizeForMatch`/`findBannedTerm`, Task 3의 `adminProcedure`
- Produces:
  - `getActiveBannedWords(): Promise<BannedWordEntry[]>` — 캐시된 활성 금칙어
  - `invalidateBannedWordCache(): void`
  - `assertNoBannedWords(fields: string[]): Promise<void>` — 걸리면 `BAD_REQUEST` throw
  - `bannedWordsRouter`

- [x] **Step 1: 캐시와 검사 헬퍼를 서비스 파일 끝에 추가**

`packages/api/src/services/bambi-banned-words.ts`에 이어 붙인다.

```ts
import { db } from "@bambi-app/db";
import { bannedWord } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

// 매 작성 요청마다 DB를 조회하지 않는다. 인스턴스가 여럿이면 다른 인스턴스는 최대 TTL만큼
// 늦게 반영되는데, 금칙어 추가가 1분 내 전파되면 충분하다.
const CACHE_TTL_MS = 60_000;

let cachedEntries: BannedWordEntry[] | null = null;
let cachedAt = 0;

export const invalidateBannedWordCache = (): void => {
	cachedEntries = null;
	cachedAt = 0;
};

export const getActiveBannedWords = async (): Promise<BannedWordEntry[]> => {
	const now = Date.now();

	if (cachedEntries && now - cachedAt < CACHE_TTL_MS) {
		return cachedEntries;
	}

	const rows = await db
		.select({
			term: bannedWord.term,
			normalizedTerm: bannedWord.normalizedTerm,
		})
		.from(bannedWord)
		.where(eq(bannedWord.isActive, true));

	cachedEntries = rows;
	cachedAt = now;

	return rows;
};

// 걸린 단어 하나만 알려준다. 목록 전체를 내려보내면 우회 표현을 학습시키지만,
// 무엇에 걸렸는지 숨기면 사용자가 글을 고칠 방법이 없다.
export const assertNoBannedWords = async (fields: string[]): Promise<void> => {
	const entries = await getActiveBannedWords();

	for (const field of fields) {
		const hit = findBannedTerm(field, entries);

		if (hit) {
			throw new ORPCError("BAD_REQUEST", {
				message: `게시할 수 없는 단어가 포함되어 있습니다: '${hit}'`,
			});
		}
	}
};
```

- [x] **Step 2: 라우터를 작성**

`packages/api/src/routers/bambi/banned-words.ts`

```ts
import { db } from "@bambi-app/db";
import { bannedWord } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, eq } from "drizzle-orm";
import z from "zod";

import { adminProcedure } from "../../index";
import { requireAdminProfile } from "../../services/bambi-authz";
import {
	invalidateBannedWordCache,
	normalizeForMatch,
} from "../../services/bambi-banned-words";

const TERM_MAX = 100;

const listBannedWordsInput = z.object({
	includeInactive: z.boolean().default(false),
});

const createBannedWordInput = z.object({
	term: z.string().trim().min(1).max(TERM_MAX),
});

const bannedWordIdInput = z.object({
	id: z.string().uuid(),
});

const setBannedWordActiveInput = bannedWordIdInput.extend({
	isActive: z.boolean(),
});

export const bannedWordsRouter = {
	list: adminProcedure
		.input(listBannedWordsInput)
		.handler(async ({ input }) => {
			const rows = await db
				.select()
				.from(bannedWord)
				.orderBy(asc(bannedWord.term));

			const items = input.includeInactive
				? rows
				: rows.filter((row) => row.isActive);

			return { items };
		}),

	create: adminProcedure
		.input(createBannedWordInput)
		.handler(async ({ context, input }) => {
			const profile = await requireAdminProfile(context.session);
			const normalizedTerm = normalizeForMatch(input.term);

			if (normalizedTerm.length === 0) {
				throw new ORPCError("BAD_REQUEST", {
					message: "금칙어는 공백·특수문자만으로 등록할 수 없습니다.",
				});
			}

			const [existing] = await db
				.select({ id: bannedWord.id })
				.from(bannedWord)
				.where(eq(bannedWord.normalizedTerm, normalizedTerm))
				.limit(1);

			if (existing) {
				throw new ORPCError("CONFLICT", {
					message: "이미 등록된 금칙어입니다.",
				});
			}

			const [created] = await db
				.insert(bannedWord)
				.values({
					term: input.term,
					normalizedTerm,
					createdByUserId: profile.userId,
				})
				.returning({ id: bannedWord.id });

			invalidateBannedWordCache();

			return { id: created.id };
		}),

	setActive: adminProcedure
		.input(setBannedWordActiveInput)
		.handler(async ({ input }) => {
			await db
				.update(bannedWord)
				.set({ isActive: input.isActive, updatedAt: new Date() })
				.where(eq(bannedWord.id, input.id));

			invalidateBannedWordCache();

			return { ok: true };
		}),

	remove: adminProcedure
		.input(bannedWordIdInput)
		.handler(async ({ input }) => {
			await db.delete(bannedWord).where(eq(bannedWord.id, input.id));

			invalidateBannedWordCache();

			return { ok: true };
		}),
};
```

- [x] **Step 3: 라우터를 등록**

`packages/api/src/routers/bambi/index.ts`에 import와 항목을 알파벳 순서로 추가한다.

```ts
import { bannedWordsRouter } from "./banned-words";
```

```ts
	bannedWords: bannedWordsRouter,
```

- [x] **Step 4: 타입체크와 전체 테스트**

Run: `cd packages/api && pnpm check-types && pnpm test`
Expected: 타입 에러 없음. 신규 테스트 실패 0건.

- [x] **Step 5: 커밋**

```
feat(api): 금칙어 캐시와 운영자 CRUD 라우터 추가
- getActiveBannedWords: TTL 60초 인메모리 캐시로 매 작성 요청의 DB 조회를 제거, mutation 시 로컬 캐시 즉시 무효화
- 인스턴스가 여럿이면 다른 인스턴스는 최대 60초 늦게 반영되나 금칙어 전파에 1분이면 충분
- assertNoBannedWords: 걸린 단어 하나만 담아 BAD_REQUEST — 목록 전체 노출은 우회 표현 학습을 부르고, 숨기면 사용자가 고칠 수 없어 그 사이를 택함
- create는 정규화형 기준으로 중복을 검사해 CONFLICT — "성 매매"와 "성매매"가 각각 등록되는 것을 차단
- 공백·특수문자만으로 이뤄진 금칙어는 정규화 후 빈 문자열이 되어 모든 글을 막으므로 등록 거부
- 전 프로시저에 adminProcedure 적용
```

---

### Task 7: 커뮤니티 작성 경로에 금칙어 차단 적용

**Files:**
- Modify: `packages/api/src/routers/bambi/community.ts`
- Test: `packages/api/src/routers/bambi/community.test.ts`

**Interfaces:**
- Consumes: `assertNoBannedWords(fields: string[]): Promise<void>` (Task 6), `extractTiptapText(body: string): string` (Task 5)

커뮤니티에는 지금 키워드 검사가 하나도 없다. 작성·수정 4개 프로시저에 검사를 건다.

- [x] **Step 1: import 추가**

`packages/api/src/routers/bambi/community.ts` 상단 import 블록(24-33행 부근)에 추가한다.

```ts
import { assertNoBannedWords } from "../../services/bambi-banned-words";
import { extractTiptapText } from "../../services/bambi-tiptap-text";
```

- [x] **Step 2: `createPost` 핸들러에 검사 추가**

`createPost`(451행 부근) 핸들러에서 `requireCommunityMember` 호출 **직후**, DB 쓰기 **이전**에 넣는다. 차단된 글이 부분 저장되면 안 된다.

```ts
await assertNoBannedWords([input.title, extractTiptapText(input.body)]);
```

- [x] **Step 3: `updatePost`·`createComment`·`updateComment`에도 같은 검사 추가**

`updatePost`(493행 부근):

```ts
await assertNoBannedWords([input.title, extractTiptapText(input.body)]);
```

`createComment`(698행 부근)와 `updateComment`(785행 부근)는 댓글이 평문이라 추출이 필요 없다:

```ts
await assertNoBannedWords([input.body]);
```

- [x] **Step 4: 통합 테스트를 추가**

`packages/api/src/routers/bambi/community.test.ts` 끝에 추가한다. 기존 파일의 픽스처 헬퍼와 `createContextForUser`를 그대로 재사용하고, 동적 import 목록에 `bannedWord`와 금칙어 서비스를 더한다.

```ts
it("금칙어가 포함된 글은 게시되지 않는다", async () => {
	const term = `금칙${randomUUID().slice(0, 8)}`;
	await db.insert(bannedWord).values({
		term,
		normalizedTerm: normalizeForMatch(term),
		createdByUserId: adminUserId,
	});
	invalidateBannedWordCache();

	try {
		const caller = createProcedureClient(communityRouter.createPost, {
			context: createContextForUser(memberUserId),
		});

		await expect(
			caller({
				authorName: "테스터",
				board: "free",
				body: JSON.stringify({
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: `${term} 포함 본문` }],
						},
					],
				}),
				title: "정상 제목",
			})
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	} finally {
		await db.delete(bannedWord).where(eq(bannedWord.term, term));
		invalidateBannedWordCache();
	}
});

it("금칙어가 없는 정상 글은 그대로 게시된다", async () => {
	const caller = createProcedureClient(communityRouter.createPost, {
		context: createContextForUser(memberUserId),
	});

	const created = await caller({
		authorName: "테스터",
		board: "free",
		body: JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "주말 근무 문의드립니다" }],
				},
			],
		}),
		title: "정상 제목",
	});

	expect(created.id).toBeTruthy();
});
```

- [x] **Step 5: 테스트를 실행**

Run: `cd packages/api && pnpm vitest run src/routers/bambi/community.test.ts`
Expected: 신규 2건 PASS, 기존 케이스 전부 PASS(무회귀).

기존 테스트가 깨지면 금칙어 행이 남아 다른 케이스의 본문이 걸린 것이다. `finally`에서 삭제와 캐시 무효화가 모두 실행되는지 확인한다.

- [x] **Step 6: 커밋**

```
feat(api): 커뮤니티 작성·수정 경로에 금칙어 차단 적용
- createPost·updatePost·createComment·updateComment 4개 경로에 assertNoBannedWords 적용(커뮤니티엔 그동안 키워드 검사가 전무했음)
- 글 본문은 TipTap JSON이라 extractTiptapText로 평문을 뽑아 검사, 댓글은 평문이라 그대로 검사
- 검사 위치는 권한 확인 직후·DB 쓰기 직전 — 차단된 글이 부분 저장되지 않게 함
- 통합 테스트로 차단 동작과 정상 글 무회귀를 함께 고정, 삽입한 금칙어는 finally에서 정리하고 캐시 무효화
```

---

### Task 8: 고객센터 API — 문의(사용자 경로)

**Files:**
- Create: `packages/api/src/routers/bambi/support.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Test: `packages/api/src/routers/bambi/support.test.ts`

**Interfaces:**
- Consumes: `assertNoBannedWords` (Task 6), `requireActiveBambiProfile` (기존 `services/bambi-authz:85`)
- Produces: `supportRouter`의 `createInquiry` / `listMyInquiries` / `getInquiry` / `createInquiryMessage` / `closeInquiry`

고객센터는 커뮤니티의 성별·광고 게이트를 상속하지 않는다. `requireActiveBambiProfile`(정지 회원만 차단)이면 구인자·구직자 전원이 쓴다.

- [x] **Step 1: 라우터 파일을 작성**

`packages/api/src/routers/bambi/support.ts`

```ts
import { db } from "@bambi-app/db";
import {
	supportInquiry,
	supportInquiryMessage,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	type SessionLike,
} from "../../services/bambi-authz";
import { assertNoBannedWords } from "../../services/bambi-banned-words";

const PAGE_SIZE = 20;
const BODY_MAX = 5000;
const MESSAGES_CAP = 100;

const inquiryCategorySchema = z.enum([
	"account",
	"job_post",
	"payment",
	"report",
	"etc",
]);

const createInquiryInput = z.object({
	body: z.string().trim().min(5).max(BODY_MAX),
	category: inquiryCategorySchema,
	title: z.string().trim().min(2).max(100),
});

const listMyInquiriesInput = z.object({
	page: z.number().int().min(1).default(1),
});

const inquiryIdInput = z.object({
	inquiryId: z.string().uuid(),
});

const createInquiryMessageInput = inquiryIdInput.extend({
	body: z.string().trim().min(1).max(BODY_MAX),
});

const INQUIRY_NOT_FOUND = "문의를 찾을 수 없습니다.";

// 본인 또는 운영자만 문의에 접근한다. 타인에게는 NOT_FOUND를 던진다 —
// FORBIDDEN은 "그 id의 문의가 존재한다"를 알려주므로 비공개 문의의 존재가 새어 나간다.
const loadAccessibleInquiry = async (
	inquiryId: string,
	session: SessionLike | null | undefined
) => {
	const profile = await requireActiveBambiProfile(session);

	const [inquiry] = await db
		.select()
		.from(supportInquiry)
		.where(eq(supportInquiry.id, inquiryId))
		.limit(1);

	const notFound = new ORPCError("NOT_FOUND", { message: INQUIRY_NOT_FOUND });

	if (!inquiry || inquiry.status === "deleted") {
		throw notFound;
	}

	const isOwner = inquiry.authorUserId === profile.userId;
	const isAdmin = profile.role === "admin";

	if (!(isOwner || isAdmin)) {
		throw notFound;
	}

	// 운영자가 숨긴 문의는 작성자에게도 보이지 않는다(운영자 본인은 계속 볼 수 있다).
	if (inquiry.status === "hidden" && !isAdmin) {
		throw notFound;
	}

	return { inquiry, isAdmin, profile };
};

export const supportRouter = {
	createInquiry: protectedProcedure
		.input(createInquiryInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			await assertNoBannedWords([input.title, input.body]);

			const [created] = await db
				.insert(supportInquiry)
				.values({
					authorUserId: profile.userId,
					authorRole: profile.role,
					category: input.category,
					title: input.title,
					body: input.body,
				})
				.returning({ id: supportInquiry.id });

			return { id: created.id };
		}),

	listMyInquiries: protectedProcedure
		.input(listMyInquiriesInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			const where = and(
				eq(supportInquiry.authorUserId, profile.userId),
				eq(supportInquiry.status, "published")
			);

			const [totalRow] = await db
				.select({ value: count() })
				.from(supportInquiry)
				.where(where);

			const items = await db
				.select({
					id: supportInquiry.id,
					category: supportInquiry.category,
					title: supportInquiry.title,
					inquiryStatus: supportInquiry.inquiryStatus,
					lastMessageAt: supportInquiry.lastMessageAt,
					createdAt: supportInquiry.createdAt,
				})
				.from(supportInquiry)
				.where(where)
				.orderBy(desc(supportInquiry.lastMessageAt))
				.limit(PAGE_SIZE)
				.offset((input.page - 1) * PAGE_SIZE);

			return {
				items,
				page: input.page,
				pageSize: PAGE_SIZE,
				totalCount: totalRow?.value ?? 0,
			};
		}),

	getInquiry: protectedProcedure
		.input(inquiryIdInput)
		.handler(async ({ context, input }) => {
			const { inquiry, isAdmin } = await loadAccessibleInquiry(
				input.inquiryId,
				context.session
			);

			const messageRows = await db
				.select()
				.from(supportInquiryMessage)
				.where(eq(supportInquiryMessage.inquiryId, inquiry.id))
				.orderBy(asc(supportInquiryMessage.createdAt))
				.limit(MESSAGES_CAP);

			// 숨김·삭제된 메시지는 운영자에게만 원문이 보인다. 작성자에게는 자리표시로 바뀐다.
			const messages = messageRows.map((message) => {
				if (message.status === "published" || isAdmin) {
					return message;
				}

				return { ...message, body: "운영자가 숨긴 메시지입니다." };
			});

			return { inquiry, messages };
		}),

	createInquiryMessage: protectedProcedure
		.input(createInquiryMessageInput)
		.handler(async ({ context, input }) => {
			const { inquiry, isAdmin, profile } = await loadAccessibleInquiry(
				input.inquiryId,
				context.session
			);

			if (inquiry.inquiryStatus === "closed") {
				throw new ORPCError("BAD_REQUEST", {
					message: "종료된 문의에는 답변을 남길 수 없습니다.",
				});
			}

			await assertNoBannedWords([input.body]);

			const created = await db.transaction(async (tx) => {
				const [message] = await tx
					.insert(supportInquiryMessage)
					.values({
						inquiryId: inquiry.id,
						authorUserId: profile.userId,
						isStaff: isAdmin,
						body: input.body,
					})
					.returning({ id: supportInquiryMessage.id });

				// 운영자가 답하면 answered로 올린다. 사용자가 재질문하면 다시 open으로 내린다.
				await tx
					.update(supportInquiry)
					.set({
						inquiryStatus: isAdmin ? "answered" : "open",
						lastMessageAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(supportInquiry.id, inquiry.id));

				return message;
			});

			return { id: created.id };
		}),

	closeInquiry: protectedProcedure
		.input(inquiryIdInput)
		.handler(async ({ context, input }) => {
			const { inquiry } = await loadAccessibleInquiry(
				input.inquiryId,
				context.session
			);

			await db
				.update(supportInquiry)
				.set({ inquiryStatus: "closed", updatedAt: new Date() })
				.where(eq(supportInquiry.id, inquiry.id));

			return { ok: true };
		}),
};
```

- [x] **Step 2: 라우터를 등록**

`packages/api/src/routers/bambi/index.ts`에 알파벳 순서로 추가한다.

```ts
import { supportRouter } from "./support";
```

```ts
	support: supportRouter,
```

- [x] **Step 3: 통합 테스트를 작성**

`packages/api/src/routers/bambi/support.test.ts`. dotenv를 최상단에서 먼저 부르고 동적 import를 쓰는 기존 관례를 지킨다.

```ts
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

dotenv.config({ path: "../../apps/server/.env" });

const { db } = await import("@bambi-app/db");
const { bambiProfile, supportInquiry } = await import(
	"@bambi-app/db/schema/bambi"
);
const { user } = await import("@bambi-app/db/schema/auth");
const { supportRouter } = await import("./support");
const { createProcedureClient } = await import("@orpc/server");
const { eq, inArray } = await import("drizzle-orm");

const createContextForUser = (userId: string) =>
	({ auth: null, session: { user: { id: userId } } }) as never;

const seedUserIds: string[] = [];

const seedUser = async (role: "job_seeker" | "employer" | "admin") => {
	const id = randomUUID();
	await db.insert(user).values({
		id,
		name: `테스트-${id.slice(0, 8)}`,
		email: `${id}@test.local`,
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	await db.insert(bambiProfile).values({
		userId: id,
		role,
		displayName: `표시명-${id.slice(0, 8)}`,
	});
	seedUserIds.push(id);
	return id;
};

let seekerId = "";
let otherSeekerId = "";
let adminId = "";

beforeAll(async () => {
	seekerId = await seedUser("job_seeker");
	otherSeekerId = await seedUser("job_seeker");
	adminId = await seedUser("admin");
});

afterAll(async () => {
	await db
		.delete(supportInquiry)
		.where(inArray(supportInquiry.authorUserId, seedUserIds));
	await db.delete(bambiProfile).where(inArray(bambiProfile.userId, seedUserIds));
	await db.delete(user).where(inArray(user.id, seedUserIds));
});

const createInquiryAs = async (userId: string) => {
	const caller = createProcedureClient(supportRouter.createInquiry, {
		context: createContextForUser(userId),
	});
	return await caller({
		body: "문의 본문입니다. 확인 부탁드립니다.",
		category: "account",
		title: "계정 문의",
	});
};

describe("고객센터 문의", () => {
	it("구직자가 문의를 등록할 수 있다", async () => {
		const created = await createInquiryAs(seekerId);
		expect(created.id).toBeTruthy();
	});

	it("타인의 문의는 NOT_FOUND다 (FORBIDDEN이 아니다)", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(supportRouter.getInquiry, {
			context: createContextForUser(otherSeekerId),
		});

		await expect(caller({ inquiryId: created.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("작성자 본인은 자기 문의를 볼 수 있다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(supportRouter.getInquiry, {
			context: createContextForUser(seekerId),
		});

		const result = await caller({ inquiryId: created.id });
		expect(result.inquiry.id).toBe(created.id);
	});

	it("운영자는 타인의 문의도 볼 수 있다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(supportRouter.getInquiry, {
			context: createContextForUser(adminId),
		});

		const result = await caller({ inquiryId: created.id });
		expect(result.inquiry.id).toBe(created.id);
	});

	it("운영자가 답하면 inquiryStatus가 answered로 바뀐다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(supportRouter.createInquiryMessage, {
			context: createContextForUser(adminId),
		});
		await caller({ inquiryId: created.id, body: "확인했습니다." });

		const [row] = await db
			.select({ inquiryStatus: supportInquiry.inquiryStatus })
			.from(supportInquiry)
			.where(eq(supportInquiry.id, created.id))
			.limit(1);

		expect(row.inquiryStatus).toBe("answered");
	});

	it("종료된 문의에는 메시지를 남길 수 없다", async () => {
		const created = await createInquiryAs(seekerId);

		const closeCaller = createProcedureClient(supportRouter.closeInquiry, {
			context: createContextForUser(seekerId),
		});
		await closeCaller({ inquiryId: created.id });

		const messageCaller = createProcedureClient(
			supportRouter.createInquiryMessage,
			{ context: createContextForUser(seekerId) }
		);

		await expect(
			messageCaller({ inquiryId: created.id, body: "추가 문의" })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
```

- [x] **Step 4: 테스트를 실행**

Run: `cd packages/api && pnpm vitest run src/routers/bambi/support.test.ts`
Expected: 6 passed

`user` insert에서 컬럼 누락 에러가 나면 `packages/db/src/schema/auth.ts:11-22`의 실제 컬럼을 보고 필수 필드를 채운다.

- [x] **Step 5: 커밋**

```
feat(api): 고객센터 1:1 문의 API 추가
- 커뮤니티의 성별·광고 입장 게이트를 상속하지 않고 requireActiveBambiProfile만 적용 — 구인자·구직자 전원이 써야 하는 창구이므로
- 타인 문의 접근은 FORBIDDEN이 아니라 NOT_FOUND — FORBIDDEN은 해당 id의 문의가 존재한다는 사실을 알려줘 비공개 문의의 존재가 새어 나감
- 운영자가 숨긴 문의는 작성자에게도 NOT_FOUND, 숨긴 메시지는 스레드에서 자리표시로 대체(운영자만 원문 열람)
- 메시지 작성 시 운영자면 answered, 사용자 재질문이면 open으로 되돌리고 lastMessageAt 갱신을 한 트랜잭션에서 처리
- 종료(closed)된 문의는 추가 메시지를 거부
- 제목·본문에 금칙어 차단 적용
```

---

### Task 9: 고객센터 API — FAQ와 운영자 문의 목록

**Files:**
- Modify: `packages/api/src/routers/bambi/support.ts`
- Test: `packages/api/src/routers/bambi/support.test.ts`

**Interfaces:**
- Consumes: `adminProcedure` (Task 3)
- Produces: `listFaq` / `listInquiriesByAdmin` / `createFaq` / `updateFaq` / `setFaqPublished` / `removeFaq`

- [x] **Step 1: import와 zod 스키마를 추가**

`support.ts` 상단에 추가한다.

```ts
import { faqEntry } from "@bambi-app/db/schema/bambi";
import { adminProcedure } from "../../index";
```

```ts
const FAQ_ANSWER_MAX = 5000;
const FAQ_QUESTION_MAX = 300;

const listFaqInput = z.object({
	category: inquiryCategorySchema.optional(),
});

const createFaqInput = z.object({
	answer: z.string().trim().min(1).max(FAQ_ANSWER_MAX),
	category: inquiryCategorySchema,
	question: z.string().trim().min(2).max(FAQ_QUESTION_MAX),
	sortOrder: z.number().int().min(0).default(0),
});

const faqIdInput = z.object({
	faqId: z.string().uuid(),
});

const updateFaqInput = faqIdInput.extend({
	answer: z.string().trim().min(1).max(FAQ_ANSWER_MAX),
	category: inquiryCategorySchema,
	question: z.string().trim().min(2).max(FAQ_QUESTION_MAX),
	sortOrder: z.number().int().min(0),
});

const setFaqPublishedInput = faqIdInput.extend({
	isPublished: z.boolean(),
});

const listInquiriesByAdminInput = z.object({
	inquiryStatus: z.enum(["open", "answered", "closed"]).optional(),
	page: z.number().int().min(1).default(1),
});
```

- [x] **Step 2: 프로시저 6개를 `supportRouter`에 추가**

```ts
	listFaq: protectedProcedure
		.input(listFaqInput)
		.handler(async ({ context, input }) => {
			await requireActiveBambiProfile(context.session);

			const where = input.category
				? and(
						eq(faqEntry.isPublished, true),
						eq(faqEntry.category, input.category)
					)
				: eq(faqEntry.isPublished, true);

			const items = await db
				.select()
				.from(faqEntry)
				.where(where)
				.orderBy(asc(faqEntry.sortOrder), asc(faqEntry.createdAt));

			return { items };
		}),

	listInquiriesByAdmin: adminProcedure
		.input(listInquiriesByAdminInput)
		.handler(async ({ input }) => {
			const where = input.inquiryStatus
				? and(
						eq(supportInquiry.status, "published"),
						eq(supportInquiry.inquiryStatus, input.inquiryStatus)
					)
				: eq(supportInquiry.status, "published");

			const [totalRow] = await db
				.select({ value: count() })
				.from(supportInquiry)
				.where(where);

			const items = await db
				.select()
				.from(supportInquiry)
				.where(where)
				.orderBy(desc(supportInquiry.lastMessageAt))
				.limit(PAGE_SIZE)
				.offset((input.page - 1) * PAGE_SIZE);

			return {
				items,
				page: input.page,
				pageSize: PAGE_SIZE,
				totalCount: totalRow?.value ?? 0,
			};
		}),

	createFaq: adminProcedure.input(createFaqInput).handler(async ({ input }) => {
		const [created] = await db
			.insert(faqEntry)
			.values({
				category: input.category,
				question: input.question,
				answer: input.answer,
				sortOrder: input.sortOrder,
			})
			.returning({ id: faqEntry.id });

		return { id: created.id };
	}),

	updateFaq: adminProcedure.input(updateFaqInput).handler(async ({ input }) => {
		await db
			.update(faqEntry)
			.set({
				category: input.category,
				question: input.question,
				answer: input.answer,
				sortOrder: input.sortOrder,
				updatedAt: new Date(),
			})
			.where(eq(faqEntry.id, input.faqId));

		return { ok: true };
	}),

	setFaqPublished: adminProcedure
		.input(setFaqPublishedInput)
		.handler(async ({ input }) => {
			await db
				.update(faqEntry)
				.set({ isPublished: input.isPublished, updatedAt: new Date() })
				.where(eq(faqEntry.id, input.faqId));

			return { ok: true };
		}),

	// FAQ는 운영자가 쓰는 문서라 사용자 콘텐츠와 달리 하드 삭제한다(감사 대상이 아니다).
	removeFaq: adminProcedure.input(faqIdInput).handler(async ({ input }) => {
		await db.delete(faqEntry).where(eq(faqEntry.id, input.faqId));

		return { ok: true };
	}),
```

- [x] **Step 3: 테스트를 추가**

`support.test.ts` 상단 동적 import에 `faqEntry`를 더하고, 아래 describe 블록을 추가한다.

```ts
describe("고객센터 FAQ", () => {
	const createdFaqIds: string[] = [];

	afterAll(async () => {
		if (createdFaqIds.length > 0) {
			await db.delete(faqEntry).where(inArray(faqEntry.id, createdFaqIds));
		}
	});

	it("비공개 FAQ는 일반 회원 목록에 나오지 않는다", async () => {
		const createCaller = createProcedureClient(supportRouter.createFaq, {
			context: createContextForUser(adminId),
		});
		const created = await createCaller({
			answer: "답변입니다.",
			category: "account",
			question: `비공개질문-${randomUUID().slice(0, 8)}`,
			sortOrder: 0,
		});
		createdFaqIds.push(created.id);

		const publishCaller = createProcedureClient(supportRouter.setFaqPublished, {
			context: createContextForUser(adminId),
		});
		await publishCaller({ faqId: created.id, isPublished: false });

		const listCaller = createProcedureClient(supportRouter.listFaq, {
			context: createContextForUser(seekerId),
		});
		const result = await listCaller({});

		expect(result.items.some((item) => item.id === created.id)).toBe(false);
	});

	it("일반 회원은 FAQ를 만들 수 없다", async () => {
		const caller = createProcedureClient(supportRouter.createFaq, {
			context: createContextForUser(seekerId),
		});

		await expect(
			caller({ answer: "답변", category: "etc", question: "질문", sortOrder: 0 })
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
```

- [x] **Step 4: 테스트를 실행**

Run: `cd packages/api && pnpm vitest run src/routers/bambi/support.test.ts`
Expected: 8 passed

"일반 회원은 FAQ를 만들 수 없다"가 통과하면 Task 3의 `adminProcedure` 미들웨어가 실제로 작동한다는 증거다.

- [x] **Step 5: 커밋**

```
feat(api): 고객센터 FAQ와 운영자 문의 목록 API 추가
- listFaq는 로그인 회원 전체에 열되 isPublished=true만 반환, 정렬은 sortOrder→createdAt
- FAQ 분류에 문의 카테고리(support_inquiry_category)를 재사용해 사용자가 동일 기준으로 탐색
- FAQ CRUD와 운영자 문의 목록은 전부 adminProcedure — 일반 회원 호출이 FORBIDDEN으로 막히는지 테스트로 고정
- FAQ는 운영자 작성 문서라 사용자 콘텐츠와 달리 하드 삭제(감사 대상이 아님)
- 운영자 문의 목록은 lastMessageAt 내림차순이라 답변 대기 건이 위로 올라옴
```

---

### Task 10: 운영자 조치 API — 문의 블라인드·삭제와 통합 목록

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts`
- Test: `packages/api/src/routers/bambi/moderation-support.test.ts`

**Interfaces:**
- Consumes: `adminProcedure` (Task 3)
- Produces: `setInquiryStatusByAdmin` / `setInquiryMessageStatusByAdmin` / `listModeratableContent`

기존 조치 패턴(`moderation.ts:628` `setJobPostStatus`)을 그대로 따른다 — 트랜잭션 안에서 대상 확인 → UPDATE → **같은 트랜잭션에서 `adminModerationAction` insert**.

- [x] **Step 1: import와 zod 스키마를 추가**

```ts
import {
	bambiProfile,
	communityComment,
	communityPost,
	supportInquiry,
	supportInquiryMessage,
} from "@bambi-app/db/schema/bambi";
import { adminProcedure } from "../../index";
```

```ts
const contentStatusSchema = z.enum(["published", "hidden", "deleted"]);

const setInquiryStatusByAdminInput = z.object({
	inquiryId: z.string().uuid(),
	reason: z.string().trim().min(2).max(500),
	status: contentStatusSchema,
});

const setInquiryMessageStatusByAdminInput = z.object({
	messageId: z.string().uuid(),
	reason: z.string().trim().min(2).max(500),
	status: contentStatusSchema,
});

// 통합 목록에 노출하는 유형. support_inquiry_message는 문의 맥락 없이 한 줄만 보면 판단이
// 불가능하므로 넣지 않는다 — 스레드 메시지 조치는 문의 상세 화면에서 한다.
const moderatableTargetTypeSchema = z.enum([
	"community_post",
	"community_comment",
	"support_inquiry",
]);

const listModeratableContentInput = z.object({
	page: z.number().int().min(1).default(1),
	status: contentStatusSchema.optional(),
	targetType: moderatableTargetTypeSchema,
});

const MODERATABLE_PAGE_SIZE = 20;
const EXCERPT_LENGTH = 120;
```

- [x] **Step 2: 조치 프로시저 2개를 추가**

```ts
	setInquiryStatusByAdmin: adminProcedure
		.input(setInquiryStatusByAdminInput)
		.handler(async ({ context, input }) => {
			const profile = await requireAdminProfile(context.session);

			await db.transaction(async (tx) => {
				const [inquiry] = await tx
					.select({ id: supportInquiry.id })
					.from(supportInquiry)
					.where(eq(supportInquiry.id, input.inquiryId))
					.limit(1);

				if (!inquiry) {
					throw new ORPCError("NOT_FOUND", {
						message: "문의를 찾을 수 없습니다.",
					});
				}

				await tx
					.update(supportInquiry)
					.set({ status: input.status, updatedAt: new Date() })
					.where(eq(supportInquiry.id, input.inquiryId));

				await tx.insert(adminModerationAction).values({
					adminUserId: profile.userId,
					targetType: "support_inquiry",
					targetId: input.inquiryId,
					action: `set_status:${input.status}`,
					reason: input.reason,
				});
			});

			return { ok: true };
		}),

	setInquiryMessageStatusByAdmin: adminProcedure
		.input(setInquiryMessageStatusByAdminInput)
		.handler(async ({ context, input }) => {
			const profile = await requireAdminProfile(context.session);

			await db.transaction(async (tx) => {
				const [message] = await tx
					.select({ id: supportInquiryMessage.id })
					.from(supportInquiryMessage)
					.where(eq(supportInquiryMessage.id, input.messageId))
					.limit(1);

				if (!message) {
					throw new ORPCError("NOT_FOUND", {
						message: "메시지를 찾을 수 없습니다.",
					});
				}

				await tx
					.update(supportInquiryMessage)
					.set({ status: input.status })
					.where(eq(supportInquiryMessage.id, input.messageId));

				await tx.insert(adminModerationAction).values({
					adminUserId: profile.userId,
					targetType: "support_inquiry_message",
					targetId: input.messageId,
					action: `set_status:${input.status}`,
					reason: input.reason,
				});
			});

			return { ok: true };
		}),
```

- [x] **Step 3: 통합 목록 프로시저를 추가**

유형이 달라도 서버에서 공통 형태로 정규화해 반환한다. UI가 유형별 분기를 하지 않아도 되고, 대상이 늘어도 화면을 고치지 않는다.

```ts
	listModeratableContent: adminProcedure
		.input(listModeratableContentInput)
		.handler(async ({ input }) => {
			const offset = (input.page - 1) * MODERATABLE_PAGE_SIZE;
			const excerpt = (text: string) => text.slice(0, EXCERPT_LENGTH);

			if (input.targetType === "community_post") {
				const where = input.status
					? eq(communityPost.status, input.status)
					: undefined;

				const [totalRow] = await db
					.select({ value: count() })
					.from(communityPost)
					.where(where);

				const rows = await db
					.select()
					.from(communityPost)
					.where(where)
					.orderBy(desc(communityPost.createdAt))
					.limit(MODERATABLE_PAGE_SIZE)
					.offset(offset);

				return {
					items: rows.map((row) => ({
						id: row.id,
						targetType: "community_post" as const,
						title: row.title,
						excerpt: excerpt(row.body),
						// 커뮤니티는 익명 게시판이라 글별 표시명을 쓴다(실명 표시명 노출 금지).
						authorName: row.authorDisplayName,
						authorUserId: row.authorUserId,
						status: row.status,
						createdAt: row.createdAt,
					})),
					page: input.page,
					pageSize: MODERATABLE_PAGE_SIZE,
					totalCount: totalRow?.value ?? 0,
				};
			}

			if (input.targetType === "community_comment") {
				const where = input.status
					? eq(communityComment.status, input.status)
					: undefined;

				const [totalRow] = await db
					.select({ value: count() })
					.from(communityComment)
					.where(where);

				const rows = await db
					.select({
						id: communityComment.id,
						body: communityComment.body,
						status: communityComment.status,
						createdAt: communityComment.createdAt,
						authorUserId: communityComment.authorUserId,
						postTitle: communityPost.title,
						postAuthorName: communityPost.authorDisplayName,
					})
					.from(communityComment)
					.innerJoin(
						communityPost,
						eq(communityComment.postId, communityPost.id)
					)
					.where(where)
					.orderBy(desc(communityComment.createdAt))
					.limit(MODERATABLE_PAGE_SIZE)
					.offset(offset);

				return {
					items: rows.map((row) => ({
						id: row.id,
						targetType: "community_comment" as const,
						// 댓글은 제목이 없으므로 원글 제목을 맥락으로 보여준다.
						title: row.postTitle,
						excerpt: excerpt(row.body),
						authorName: row.postAuthorName,
						authorUserId: row.authorUserId,
						status: row.status,
						createdAt: row.createdAt,
					})),
					page: input.page,
					pageSize: MODERATABLE_PAGE_SIZE,
					totalCount: totalRow?.value ?? 0,
				};
			}

			const where = input.status
				? eq(supportInquiry.status, input.status)
				: undefined;

			const [totalRow] = await db
				.select({ value: count() })
				.from(supportInquiry)
				.where(where);

			const rows = await db
				.select({
					id: supportInquiry.id,
					title: supportInquiry.title,
					body: supportInquiry.body,
					status: supportInquiry.status,
					createdAt: supportInquiry.createdAt,
					authorUserId: supportInquiry.authorUserId,
					// 고객센터는 익명 표시명이 없으므로 프로필 표시명을 조인한다.
					authorName: bambiProfile.displayName,
				})
				.from(supportInquiry)
				.leftJoin(
					bambiProfile,
					eq(supportInquiry.authorUserId, bambiProfile.userId)
				)
				.where(where)
				.orderBy(desc(supportInquiry.createdAt))
				.limit(MODERATABLE_PAGE_SIZE)
				.offset(offset);

			return {
				items: rows.map((row) => ({
					id: row.id,
					targetType: "support_inquiry" as const,
					title: row.title,
					excerpt: excerpt(row.body),
					authorName: row.authorName ?? "(표시명 없음)",
					authorUserId: row.authorUserId,
					status: row.status,
					createdAt: row.createdAt,
				})),
				page: input.page,
				pageSize: MODERATABLE_PAGE_SIZE,
				totalCount: totalRow?.value ?? 0,
			};
		}),
```

- [x] **Step 4: 테스트를 작성**

`packages/api/src/routers/bambi/moderation-support.test.ts`. Task 8 테스트의 픽스처 패턴(dotenv 최상단 → 동적 import → `seedUser`)을 그대로 복제하고, 아래 케이스를 넣는다.

```ts
it("문의 블라인드 시 상태 전환과 감사로그가 함께 남는다", async () => {
	const created = await createInquiryAs(seekerId);

	const caller = createProcedureClient(
		moderationRouter.setInquiryStatusByAdmin,
		{ context: createContextForUser(adminId) }
	);
	await caller({
		inquiryId: created.id,
		reason: "테스트 사유",
		status: "hidden",
	});

	const [inquiryRow] = await db
		.select({ status: supportInquiry.status })
		.from(supportInquiry)
		.where(eq(supportInquiry.id, created.id))
		.limit(1);

	expect(inquiryRow.status).toBe("hidden");

	const logRows = await db
		.select()
		.from(adminModerationAction)
		.where(eq(adminModerationAction.targetId, created.id));

	expect(logRows).toHaveLength(1);
	expect(logRows[0].action).toBe("set_status:hidden");
	expect(logRows[0].targetType).toBe("support_inquiry");
});

it("사유가 없으면 조치가 거부된다", async () => {
	const created = await createInquiryAs(seekerId);

	const caller = createProcedureClient(
		moderationRouter.setInquiryStatusByAdmin,
		{ context: createContextForUser(adminId) }
	);

	await expect(
		caller({ inquiryId: created.id, reason: "", status: "hidden" })
	).rejects.toBeTruthy();
});

it("일반 회원은 조치할 수 없다", async () => {
	const created = await createInquiryAs(seekerId);

	const caller = createProcedureClient(
		moderationRouter.setInquiryStatusByAdmin,
		{ context: createContextForUser(seekerId) }
	);

	await expect(
		caller({ inquiryId: created.id, reason: "사유", status: "hidden" })
	).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("통합 목록이 유형별로 공통 형태를 반환한다", async () => {
	await createInquiryAs(seekerId);

	const caller = createProcedureClient(
		moderationRouter.listModeratableContent,
		{ context: createContextForUser(adminId) }
	);

	const result = await caller({ targetType: "support_inquiry", page: 1 });

	expect(result.items.length).toBeGreaterThan(0);
	expect(result.items[0]).toHaveProperty("targetType", "support_inquiry");
	expect(result.items[0]).toHaveProperty("authorName");
	expect(result.items[0]).toHaveProperty("excerpt");
});
```

테스트 종료 시 `adminModerationAction`도 정리한다.

```ts
afterAll(async () => {
	await db
		.delete(adminModerationAction)
		.where(inArray(adminModerationAction.adminUserId, seedUserIds));
});
```

- [x] **Step 5: 테스트를 실행**

Run: `cd packages/api && pnpm vitest run src/routers/bambi/moderation-support.test.ts`
Expected: 4 passed

공유 개발 DB라 다른 데이터가 섞일 수 있다. `toHaveLength(1)` 단언이 흔들리면 `targetId`로 좁힌 조회인지 확인하고, 전역 카운트 단언은 하한(`toBeGreaterThan`)으로 완화한다.

- [x] **Step 6: 커밋**

```
feat(api): 고객센터 문의 운영 조치와 통합 게시물 목록 추가
- setInquiryStatusByAdmin·setInquiryMessageStatusByAdmin: 기존 setJobPostStatus 패턴대로 트랜잭션 안에서 상태 전환과 admin_moderation_action 기록을 함께 수행
- 사유(reason)는 min(2) 필수 — 사유 없는 조치를 만들지 않는 기존 운영 원칙 유지
- listModeratableContent: 유형이 달라도 {id,targetType,title,excerpt,authorName,status,createdAt} 공통 형태로 정규화해 반환, UI의 유형별 분기 제거
- authorName은 커뮤니티=글별 익명 표시명, 고객센터=프로필 표시명으로 분기 — 익명 게시판에 실명 표시명을 노출하지 않기 위함
- 댓글은 제목이 없어 원글 제목을 title로 얹어 맥락 제공
- support_inquiry_message는 목록에서 제외 — 문의 맥락 없이 한 줄만 보면 판단이 불가능해 문의 상세에서 개별 조치
- adminProcedure 적용을 일반 회원 FORBIDDEN 테스트로 고정
```

---

### Task 11: 고객센터 공통 상수와 `/support` 셸

**Files:**
- Create: `packages/ui/src/components/accordion.tsx`, `packages/ui/src/components/table.tsx` (shadcn add 산출물)
- Create: `apps/web/src/lib/bambi/support.ts`
- Create: `apps/web/src/app/support/layout.tsx`

**Interfaces:**
- Produces: `SUPPORT_CATEGORIES`, `SUPPORT_CATEGORY_LABELS`, `INQUIRY_STATUS_LABELS`, `supportInquiryPath(id)`, `SUPPORT_CONTENT_WIDTH` — 이후 모든 고객센터 화면이 여기서 가져온다.

- [x] **Step 1: 없는 shadcn 컴포넌트 2개를 추가**

목록용 `table`과 FAQ용 `accordion`이 `packages/ui/src/components`에 없다. npm 의존성 추가가 아니라 레지스트리 파일 복사다.

Run: `pnpm dlx shadcn@latest add accordion table`
Expected: `packages/ui/src/components/accordion.tsx`, `table.tsx` 생성.

파일이 레포 루트로 떨어지면 `packages/ui/src/components/`로 옮긴다. 생성된 파일에 하드코딩 `rounded-none`이나 `text-xs` 고밀도 스타일이 있으면 밤비 재테마 관례대로 걷어낸다(반경은 토큰 유틸로).

- [x] **Step 2: 고객센터 메타 상수를 작성**

`apps/web/src/lib/bambi/support.ts` — 고객센터 라벨·경로의 단일 진실원이다. enum 원값이 화면에 노출되지 않게 한다(운영자 콘솔에서 같은 실수가 있었다).

```ts
// 고객센터 메타·경로 유틸. 카테고리·상태 라벨의 단일 진실원.
import type { Route } from "next";

export const SUPPORT_CATEGORIES = [
	"account",
	"job_post",
	"payment",
	"report",
	"etc",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
	account: "계정·로그인",
	job_post: "공고·지원",
	payment: "결제·광고",
	report: "신고·제재",
	etc: "기타",
};

export type InquiryStatus = "open" | "answered" | "closed";

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
	open: "접수됨",
	answered: "답변완료",
	closed: "종료",
};

export const SUPPORT_PATH = "/support" as Route;
export const SUPPORT_INQUIRIES_PATH = "/support/inquiries" as Route;
export const SUPPORT_INQUIRY_NEW_PATH = "/support/inquiries/new" as Route;

export const supportInquiryPath = (inquiryId: string): Route =>
	`/support/inquiries/${inquiryId}` as Route;

// 다른 seeker 화면과 동일한 고정폭 정렬(SEEKER_CONTENT_WIDTH와 같은 기준).
export const SUPPORT_CONTENT_WIDTH = "mx-auto w-full max-w-[min(92%,1120px)]";
```

- [x] **Step 3: `/support` 셸을 작성**

`apps/web/src/app/support/layout.tsx` — 고객센터는 역할 네임스페이스에 묶이지 않으므로 seeker/employer 셸을 쓰지 않고 전용 경량 셸을 둔다.

```tsx
import type { ReactNode } from "react";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { APP_CONTENT_MAX_W } from "@/lib/bambi/layout";

// 고객센터는 구인자·구직자 공통 창구라 역할 셸(seeker/employer)에 묶지 않는다.
// 헤더 폭만 다른 화면과 맞추고 하단 탭은 노출하지 않는다.
export default function SupportLayout({ children }: { children: ReactNode }) {
	return (
		<ResponsiveAppShell
			contentWidthClassName={APP_CONTENT_MAX_W}
			variant="public"
		>
			{children}
		</ResponsiveAppShell>
	);
}
```

- [x] **Step 4: 타입체크**

Run: `cd apps/web && pnpm check-types`
Expected: 에러 없음. `APP_CONTENT_MAX_W`가 `@/lib/bambi/layout`에 없으면 실제 export 이름을 확인해 맞춘다.

- [x] **Step 5: 커밋**

```
feat(web): 고객센터 공통 상수와 /support 셸 추가
- accordion·table shadcn 컴포넌트 신규 설치(목록·FAQ에 필요한데 packages/ui에 없었음), 밤비 재테마 관례대로 rounded-none 제거
- lib/bambi/support.ts를 카테고리·상태 라벨과 경로의 단일 진실원으로 신설 — enum 원값이 화면에 새는 것을 원천 차단(운영자 콘솔에서 동일 실수 이력 있음)
- /support 전용 경량 셸: 고객센터는 구인자·구직자 공통 창구라 역할 셸(seeker/employer)에 묶지 않고 헤더 폭만 정렬
```

---

### Task 12: FAQ 화면 (`/support`)

**Files:**
- Create: `apps/web/src/app/support/page.tsx`
- Create: `apps/web/src/components/bambi/support/faq-list.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.support.listFaq` (Task 9), `SUPPORT_CATEGORY_LABELS` (Task 11)

- [x] **Step 1: FAQ 목록 컴포넌트를 작성**

`apps/web/src/components/bambi/support/faq-list.tsx`

```tsx
"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { Button } from "@bambi-app/ui/components/button";
import { Empty } from "@bambi-app/ui/components/empty";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
	SUPPORT_CATEGORIES,
	SUPPORT_CATEGORY_LABELS,
	SUPPORT_CONTENT_WIDTH,
	SUPPORT_INQUIRIES_PATH,
	SUPPORT_INQUIRY_NEW_PATH,
	type SupportCategory,
} from "@/lib/bambi/support";
import { orpc } from "@/utils/orpc";

export function FaqList() {
	const [category, setCategory] = useState<SupportCategory | null>(null);

	const faqQuery = useQuery(
		orpc.bambi.support.listFaq.queryOptions({
			input: category ? { category } : {},
		})
	);

	const items = faqQuery.data?.items ?? [];

	return (
		<div className={cn(SUPPORT_CONTENT_WIDTH, "flex flex-col gap-6 px-5 py-6 md:px-6")}>
			<header className="flex flex-col gap-2">
				<h1 className="m-0 font-extrabold text-xl">고객센터</h1>
				<p className="m-0 text-muted-foreground text-sm">
					자주 묻는 질문을 먼저 확인하고, 해결되지 않으면 1:1 문의를 남겨 주세요.
				</p>
			</header>

			<div className="flex flex-wrap gap-2">
				<Button
					onClick={() => setCategory(null)}
					size="sm"
					variant={category === null ? "default" : "outline"}
				>
					전체
				</Button>
				{SUPPORT_CATEGORIES.map((key) => (
					<Button
						key={key}
						onClick={() => setCategory(key)}
						size="sm"
						variant={category === key ? "default" : "outline"}
					>
						{SUPPORT_CATEGORY_LABELS[key]}
					</Button>
				))}
			</div>

			{faqQuery.isLoading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-14 w-full" />
					<Skeleton className="h-14 w-full" />
					<Skeleton className="h-14 w-full" />
				</div>
			) : null}

			{!faqQuery.isLoading && items.length === 0 ? (
				<Empty>등록된 FAQ가 없어요.</Empty>
			) : null}

			{items.length > 0 ? (
				<Accordion className="flex flex-col gap-2">
					{items.map((item) => (
						<AccordionItem key={item.id} value={item.id}>
							<AccordionTrigger>{item.question}</AccordionTrigger>
							<AccordionContent>
								<p className="m-0 whitespace-pre-wrap text-sm">{item.answer}</p>
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			) : null}

			<div className="flex flex-wrap gap-2">
				<Button render={<Link href={SUPPORT_INQUIRY_NEW_PATH} />}>
					1:1 문의하기
				</Button>
				<Button
					render={<Link href={SUPPORT_INQUIRIES_PATH} />}
					variant="outline"
				>
					내 문의 내역
				</Button>
			</div>
		</div>
	);
}
```

`Button`에 `render` prop을 쓰는 이유: 이 레포의 shadcn base는 radix가 아니라 **base-ui**라 `asChild`가 없다.

- [x] **Step 2: 페이지를 작성**

`apps/web/src/app/support/page.tsx`

```tsx
"use client";

import { FaqList } from "@/components/bambi/support/faq-list";

export default function SupportPage() {
	return <FaqList />;
}
```

- [x] **Step 3: 타입체크**

Run: `cd apps/web && pnpm check-types`
Expected: 에러 없음. `Accordion`/`Empty`의 실제 prop 이름이 다르면 `pnpm dlx shadcn@latest docs accordion`으로 확인해 맞춘다.

- [x] **Step 4: 커밋**

```
feat(web): 고객센터 FAQ 화면 추가
- /support를 FAQ 목록으로 랜딩시키고 카테고리 필터 + Accordion 펼침 구성
- 카테고리 라벨은 lib/bambi/support의 상수를 통해서만 노출해 enum 원값 노출 방지
- 로딩은 Skeleton, 비어 있으면 Empty로 처리(커스텀 styled div 재발명 금지 규칙 준수)
- Button 링크는 base-ui라 asChild가 아니라 render prop 사용
- 1:1 문의하기·내 문의 내역 진입점을 하단에 배치해 FAQ로 해결 안 될 때의 다음 행동을 명시
```

---

### Task 13: 내 문의 목록과 문의 작성 화면

**Files:**
- Create: `apps/web/src/app/support/inquiries/page.tsx`
- Create: `apps/web/src/app/support/inquiries/new/page.tsx`
- Create: `apps/web/src/components/bambi/support/inquiry-list.tsx`
- Create: `apps/web/src/components/bambi/support/inquiry-form.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.support.listMyInquiries`, `orpc.bambi.support.createInquiry` (Task 8)

- [x] **Step 1: 문의 목록 컴포넌트를 작성**

`apps/web/src/components/bambi/support/inquiry-list.tsx`

```tsx
"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Empty } from "@bambi-app/ui/components/empty";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
	INQUIRY_STATUS_LABELS,
	SUPPORT_CATEGORY_LABELS,
	SUPPORT_CONTENT_WIDTH,
	SUPPORT_INQUIRY_NEW_PATH,
	supportInquiryPath,
} from "@/lib/bambi/support";
import { orpc } from "@/utils/orpc";

export function InquiryList() {
	const inquiriesQuery = useQuery(
		orpc.bambi.support.listMyInquiries.queryOptions({ input: { page: 1 } })
	);

	const items = inquiriesQuery.data?.items ?? [];

	return (
		<div className={cn(SUPPORT_CONTENT_WIDTH, "flex flex-col gap-6 px-5 py-6 md:px-6")}>
			<header className="flex items-center justify-between gap-3">
				<h1 className="m-0 font-extrabold text-xl">내 문의 내역</h1>
				<Button render={<Link href={SUPPORT_INQUIRY_NEW_PATH} />} size="sm">
					문의하기
				</Button>
			</header>

			{inquiriesQuery.isLoading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-20 w-full" />
				</div>
			) : null}

			{!inquiriesQuery.isLoading && items.length === 0 ? (
				<Empty>아직 남긴 문의가 없어요.</Empty>
			) : null}

			<div className="flex flex-col gap-2">
				{items.map((item) => (
					<Link href={supportInquiryPath(item.id)} key={item.id}>
						<Card>
							<CardContent className="flex min-w-0 flex-col gap-2 py-4">
								<div className="flex min-w-0 items-center gap-2">
									<Badge variant="secondary">
										{SUPPORT_CATEGORY_LABELS[item.category]}
									</Badge>
									<Badge
										variant={
											item.inquiryStatus === "answered" ? "default" : "outline"
										}
									>
										{INQUIRY_STATUS_LABELS[item.inquiryStatus]}
									</Badge>
								</div>
								<p className="m-0 truncate font-bold text-sm">{item.title}</p>
								<p className="m-0 text-muted-foreground text-xs">
									{new Date(item.lastMessageAt).toLocaleString("ko-KR")}
								</p>
							</CardContent>
						</Card>
					</Link>
				))}
			</div>
		</div>
	);
}
```

- [x] **Step 2: 문의 작성 폼을 작성**

`apps/web/src/components/bambi/support/inquiry-form.tsx` — 웹 폼은 react-hook-form을 쓰지 않고 `useState` + 수동 `canSubmit` + sonner 관례를 따른다.

```tsx
"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
	SUPPORT_CATEGORIES,
	SUPPORT_CATEGORY_LABELS,
	SUPPORT_CONTENT_WIDTH,
	type SupportCategory,
	supportInquiryPath,
} from "@/lib/bambi/support";
import { orpc } from "@/utils/orpc";

const TITLE_MIN = 2;
const BODY_MIN = 5;

export function InquiryForm() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [category, setCategory] = useState<SupportCategory>("account");
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");

	const createMutation = useMutation(
		orpc.bambi.support.createInquiry.mutationOptions({
			onError: (error) => {
				// 서버 ORPCError의 한국어 message가 그대로 노출된다(금칙어 차단 문구 포함).
				toast(error.message || "문의를 등록하지 못했어요.");
			},
			onSuccess: async (created) => {
				toast("문의가 등록됐어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.support.key(),
				});
				router.replace(supportInquiryPath(created.id) as Route);
			},
		})
	);

	const canSubmit =
		title.trim().length >= TITLE_MIN &&
		body.trim().length >= BODY_MIN &&
		!createMutation.isPending;

	return (
		<div className={cn(SUPPORT_CONTENT_WIDTH, "flex flex-col gap-6 px-5 py-6 md:px-6")}>
			<h1 className="m-0 font-extrabold text-xl">1:1 문의하기</h1>

			<div className="flex flex-col gap-2">
				<Label htmlFor="inquiry-category">문의 유형</Label>
				<Select
					onValueChange={(value) => setCategory(value as SupportCategory)}
					value={category}
				>
					<SelectTrigger id="inquiry-category">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{SUPPORT_CATEGORIES.map((key) => (
							<SelectItem key={key} value={key}>
								{SUPPORT_CATEGORY_LABELS[key]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="inquiry-title">제목</Label>
				<Input
					id="inquiry-title"
					maxLength={100}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="문의 제목을 입력해 주세요"
					value={title}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="inquiry-body">내용</Label>
				<Textarea
					className="min-h-40"
					id="inquiry-body"
					maxLength={5000}
					onChange={(event) => setBody(event.target.value)}
					placeholder="문의 내용을 자세히 적어 주세요"
					value={body}
				/>
			</div>

			<Button
				disabled={!canSubmit}
				onClick={() =>
					createMutation.mutate({ body, category, title })
				}
			>
				문의 등록
			</Button>
		</div>
	);
}
```

- [x] **Step 3: 페이지 2개를 작성**

`apps/web/src/app/support/inquiries/page.tsx`

```tsx
"use client";

import { InquiryList } from "@/components/bambi/support/inquiry-list";

export default function SupportInquiriesPage() {
	return <InquiryList />;
}
```

`apps/web/src/app/support/inquiries/new/page.tsx`

```tsx
"use client";

import { InquiryForm } from "@/components/bambi/support/inquiry-form";

export default function SupportInquiryNewPage() {
	return <InquiryForm />;
}
```

- [x] **Step 4: 타입체크**

Run: `cd apps/web && pnpm check-types`
Expected: 에러 없음. `Select`가 base-ui 기반이라 `onValueChange` 시그니처가 다르면 `pnpm dlx shadcn@latest docs select`로 확인한다.

- [x] **Step 5: 커밋**

```
feat(web): 고객센터 내 문의 목록·작성 화면 추가
- 목록은 카테고리·진행상태 배지와 마지막 메시지 시각을 노출하고 lastMessageAt 정렬을 그대로 반영해 답변 온 문의가 위로 옴
- 작성 폼은 이 레포 관례대로 react-hook-form 없이 useState + 수동 canSubmit + sonner 사용
- 서버 ORPCError의 한국어 message를 그대로 토스트에 노출 — 금칙어 차단 문구가 사용자에게 바로 전달됨
- 등록 성공 시 support 쿼리 키를 무효화하고 상세로 replace 이동
```

---

### Task 14: 문의 상세 스레드 화면

**Files:**
- Create: `apps/web/src/app/support/inquiries/[id]/page.tsx`
- Create: `apps/web/src/components/bambi/support/inquiry-thread.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.support.getInquiry`, `createInquiryMessage`, `closeInquiry` (Task 8)

- [x] **Step 1: 스레드 컴포넌트를 작성**

`apps/web/src/components/bambi/support/inquiry-thread.tsx`

```tsx
"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	INQUIRY_STATUS_LABELS,
	SUPPORT_CATEGORY_LABELS,
	SUPPORT_CONTENT_WIDTH,
} from "@/lib/bambi/support";
import { orpc } from "@/utils/orpc";

export function InquiryThread({ inquiryId }: { inquiryId: string }) {
	const queryClient = useQueryClient();
	const [reply, setReply] = useState("");

	const inquiryQuery = useQuery(
		orpc.bambi.support.getInquiry.queryOptions({ input: { inquiryId } })
	);

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.support.key(),
		});
	};

	const replyMutation = useMutation(
		orpc.bambi.support.createInquiryMessage.mutationOptions({
			onError: (error) => {
				toast(error.message || "메시지를 보내지 못했어요.");
			},
			onSuccess: async () => {
				setReply("");
				await invalidate();
			},
		})
	);

	const closeMutation = useMutation(
		orpc.bambi.support.closeInquiry.mutationOptions({
			onError: (error) => {
				toast(error.message || "문의를 종료하지 못했어요.");
			},
			onSuccess: async () => {
				toast("문의를 종료했어요.");
				await invalidate();
			},
		})
	);

	if (inquiryQuery.isLoading) {
		return (
			<div className={cn(SUPPORT_CONTENT_WIDTH, "flex flex-col gap-3 px-5 py-6 md:px-6")}>
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
		);
	}

	if (inquiryQuery.isError || !inquiryQuery.data) {
		return (
			<div className={cn(SUPPORT_CONTENT_WIDTH, "px-5 py-6 md:px-6")}>
				<p className="m-0 text-muted-foreground text-sm">
					문의를 불러오지 못했어요. 접근 권한이 없거나 삭제된 문의일 수 있어요.
				</p>
			</div>
		);
	}

	const { inquiry, messages } = inquiryQuery.data;
	const isClosed = inquiry.inquiryStatus === "closed";

	return (
		<div className={cn(SUPPORT_CONTENT_WIDTH, "flex flex-col gap-5 px-5 py-6 md:px-6")}>
			<header className="flex min-w-0 flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary">
						{SUPPORT_CATEGORY_LABELS[inquiry.category]}
					</Badge>
					<Badge variant={inquiry.inquiryStatus === "answered" ? "default" : "outline"}>
						{INQUIRY_STATUS_LABELS[inquiry.inquiryStatus]}
					</Badge>
				</div>
				<h1 className="m-0 font-extrabold text-lg">{inquiry.title}</h1>
				<p className="m-0 whitespace-pre-wrap text-sm">{inquiry.body}</p>
			</header>

			<Separator />

			<div className="flex flex-col gap-3">
				{messages.map((message) => (
					<Card key={message.id}>
						<CardContent className="flex flex-col gap-2 py-4">
							<Badge variant={message.isStaff ? "default" : "outline"}>
								{message.isStaff ? "운영자" : "나"}
							</Badge>
							<p className="m-0 whitespace-pre-wrap text-sm">{message.body}</p>
							<p className="m-0 text-muted-foreground text-xs">
								{new Date(message.createdAt).toLocaleString("ko-KR")}
							</p>
						</CardContent>
					</Card>
				))}
			</div>

			{isClosed ? (
				<p className="m-0 text-muted-foreground text-sm">
					종료된 문의예요. 추가 문의가 있으면 새로 등록해 주세요.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					<Textarea
						className="min-h-28"
						maxLength={5000}
						onChange={(event) => setReply(event.target.value)}
						placeholder="추가로 남길 내용을 적어 주세요"
						value={reply}
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							disabled={reply.trim().length === 0 || replyMutation.isPending}
							onClick={() => replyMutation.mutate({ body: reply, inquiryId })}
						>
							보내기
						</Button>
						<Button
							disabled={closeMutation.isPending}
							onClick={() => closeMutation.mutate({ inquiryId })}
							variant="outline"
						>
							문의 종료
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
```

- [x] **Step 2: 페이지를 작성**

`apps/web/src/app/support/inquiries/[id]/page.tsx`

```tsx
"use client";

import { use } from "react";
import { InquiryThread } from "@/components/bambi/support/inquiry-thread";

export default function SupportInquiryDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);

	return <InquiryThread inquiryId={id} />;
}
```

Next 16에서 `params`는 Promise다. 클라이언트 컴포넌트에서는 `use()`로 푼다. 기존 상세 페이지(`app/seeker/community/[board]/[postId]/page.tsx`)가 어떤 형태인지 확인해 같은 방식으로 맞춘다.

- [x] **Step 3: 타입체크**

Run: `cd apps/web && pnpm check-types`
Expected: 에러 없음.

- [x] **Step 4: 커밋**

```
feat(web): 고객센터 문의 상세 스레드 화면 추가
- 문의 원문 + 시간순 메시지 스레드 + 답장 입력을 한 화면에 구성, 운영자/나 배지로 발신 주체 구분(isStaff 스냅샷 기준)
- 종료된 문의는 입력창 대신 안내 문구로 대체해 서버의 BAD_REQUEST를 UI에서 선제 차단
- 조회 실패는 권한 없음/삭제 가능성을 함께 안내 — 서버가 타인 문의에 NOT_FOUND를 주므로 존재 여부를 단정하지 않는 문구 사용
- 메시지 전송·종료 후 support 쿼리 키를 무효화해 목록의 진행 상태까지 갱신
```

---

### Task 15: 헤더 네비에 "고객센터" 추가

**Files:**
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx:18-24`
- Modify: `apps/web/src/app/employer/layout.tsx:9-16`

**Interfaces:**
- Consumes: `/support` 라우트 (Task 11-14)

요구사항은 헤더의 **"수다방" 오른쪽**이다. `DEFAULT_NAV_ITEMS`의 마지막 항목이 수다방이므로 그 뒤에 붙이면 정확히 그 위치가 된다.

- [x] **Step 1: 공통·구직자 네비에 추가**

`apps/web/src/components/bambi/responsive-shell.tsx`

```ts
export const DEFAULT_NAV_ITEMS: NavItem[] = [
	{ href: "/seeker", label: "채용정보" },
	{ href: "/seeker/chats", label: "채팅" },
	{ href: "/", label: "안전가이드" },
	{ href: "/employer", label: "업체 인증" },
	{ href: "/seeker/community", label: "수다방" },
	{ href: "/support" as Route, label: "고객센터" },
];
```

- [x] **Step 2: 구인자 네비에 추가**

`apps/web/src/app/employer/layout.tsx` — 구인자 셸은 별도 배열을 주입하므로 한 번 더 넣어야 한다.

```ts
const EMPLOYER_NAV_ITEMS = [
	{ href: "/employer", label: "내 공고" },
	{ href: "/employer/new", label: "공고 등록" },
	{ href: "/employer/ad-guide" as Route, label: "광고 안내" },
	{ href: "/employer/settings" as Route, label: "조직 설정" },
	{ href: "/employer/me", label: "업체 정보" },
	{ href: "/seeker", label: "채용정보" },
	{ href: "/support" as Route, label: "고객센터" },
] as const;
```

- [x] **Step 3: 모바일 진입점을 확인**

모바일 하단탭(`mobile-tab-bar.tsx:49-57`)은 탐색·채팅·(구인 관리)·수다방·내 정보로 이미 차 있어 **추가하지 않는다.** 대신 `/seeker/me` 화면에 고객센터 링크가 있는지 확인하고, 없으면 목록 항목 하나를 추가한다.

```tsx
<Button render={<Link href={SUPPORT_PATH} />} variant="outline">
	고객센터
</Button>
```

- [x] **Step 4: 활성 탭 판정을 확인**

`findActiveHref`(`responsive-shell.tsx:38-52`)는 가장 길게 일치하는 항목을 활성 처리한다. `/support/inquiries`에서도 `/support`가 활성으로 잡히는지 확인한다 — `pathname.startsWith("/support/")` 조건에 걸리므로 별도 수정은 필요 없다.

- [x] **Step 5: 타입체크와 커밋**

Run: `cd apps/web && pnpm check-types`
Expected: 에러 없음.

```
feat(web): 헤더 네비에 고객센터 추가
- DEFAULT_NAV_ITEMS의 수다방 바로 뒤에 배치해 요구된 "수다방 오른쪽" 위치를 만족
- 구인자 셸은 EMPLOYER_NAV_ITEMS를 따로 주입하므로 동일 항목을 한 번 더 추가(구인자도 고객센터 사용 대상)
- 모바일 하단탭은 탐색·채팅·구인관리·수다방·내정보로 이미 5개라 추가하지 않고 /seeker/me 경유로 진입 — 6개는 과밀
- findActiveHref가 최장 일치를 쓰므로 /support/inquiries에서도 고객센터 탭이 활성 유지됨
```

---

### Task 16: 운영자 통합 게시물 조치 화면

**Files:**
- Create: `apps/web/src/app/moderator/content/page.tsx`
- Modify: `apps/web/src/app/moderator/layout.tsx:8`
- Modify: `apps/web/src/components/bambi/persona-nav.tsx:124,130,165`

**Interfaces:**
- Consumes: `orpc.bambi.moderation.listModeratableContent`, `setPostStatusByAdmin`, `setCommentStatusByAdmin`, `setInquiryStatusByAdmin`

기존 운영자 화면(`screens/moderator.tsx`)은 인라인 스타일 프로토타입이라 점진 전환 대상이다. **신규 화면은 `app/moderator/employers/page.tsx` 쪽 표준 shadcn 스타일을 따른다.**

- [x] **Step 1: 화면을 작성**

`apps/web/src/app/moderator/content/page.tsx`

```tsx
"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";

const TARGET_TABS = [
	{ key: "community_post", label: "커뮤니티 글" },
	{ key: "community_comment", label: "커뮤니티 댓글" },
	{ key: "support_inquiry", label: "고객센터 문의" },
] as const;

type TargetType = (typeof TARGET_TABS)[number]["key"];

const CONTENT_STATUS_LABELS: Record<string, string> = {
	published: "게시중",
	hidden: "숨김",
	deleted: "삭제됨",
};

export default function ModeratorContentPage() {
	const queryClient = useQueryClient();
	const [targetType, setTargetType] = useState<TargetType>("community_post");
	const [reason, setReason] = useState("");

	const listQuery = useQuery(
		orpc.bambi.moderation.listModeratableContent.queryOptions({
			input: { page: 1, targetType },
		})
	);

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.moderation.key(),
		});
	};

	const onError = (error: { message?: string }) => {
		toast(error.message || "조치를 적용하지 못했어요.");
	};

	const onSuccess = async () => {
		toast("조치를 적용했어요.");
		setReason("");
		await invalidate();
	};

	const postMutation = useMutation(
		orpc.bambi.community.setPostStatusByAdmin.mutationOptions({
			onError,
			onSuccess,
		})
	);
	const commentMutation = useMutation(
		orpc.bambi.community.setCommentStatusByAdmin.mutationOptions({
			onError,
			onSuccess,
		})
	);
	const inquiryMutation = useMutation(
		orpc.bambi.moderation.setInquiryStatusByAdmin.mutationOptions({
			onError,
			onSuccess,
		})
	);

	// 사유는 모든 조치에 필수다(서버가 min(2)로 강제). 비어 있으면 호출조차 하지 않는다.
	const applyStatus = (id: string, status: "hidden" | "deleted" | "published") => {
		if (reason.trim().length < 2) {
			toast("조치 사유를 2자 이상 입력해 주세요.");
			return;
		}

		if (targetType === "community_post") {
			postMutation.mutate({ postId: id, reason, status });
			return;
		}

		if (targetType === "community_comment") {
			commentMutation.mutate({ commentId: id, reason, status });
			return;
		}

		inquiryMutation.mutate({ inquiryId: id, reason, status });
	};

	const items = listQuery.data?.items ?? [];

	return (
		<div className="flex flex-col gap-5 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-xl">게시물 관리</h1>

			<div className="flex flex-wrap gap-2">
				{TARGET_TABS.map((tab) => (
					<Button
						key={tab.key}
						onClick={() => setTargetType(tab.key)}
						size="sm"
						variant={targetType === tab.key ? "default" : "outline"}
					>
						{tab.label}
					</Button>
				))}
			</div>

			<div className="flex flex-col gap-2">
				<Input
					maxLength={500}
					onChange={(event) => setReason(event.target.value)}
					placeholder="조치 사유(필수, 2자 이상) — 감사 로그에 그대로 기록됩니다"
					value={reason}
				/>
			</div>

			<div className="w-full overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>제목</TableHead>
							<TableHead>내용</TableHead>
							<TableHead>작성자</TableHead>
							<TableHead>상태</TableHead>
							<TableHead>조치</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => (
							<TableRow key={item.id}>
								<TableCell className="max-w-60 truncate">{item.title}</TableCell>
								<TableCell className="max-w-80 truncate text-muted-foreground">
									{item.excerpt}
								</TableCell>
								<TableCell>{item.authorName}</TableCell>
								<TableCell>
									<Badge
										variant={item.status === "published" ? "outline" : "secondary"}
									>
										{CONTENT_STATUS_LABELS[item.status] ?? item.status}
									</Badge>
								</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-2">
										<Button
											onClick={() => applyStatus(item.id, "hidden")}
											size="sm"
											variant="outline"
										>
											블라인드
										</Button>
										<Button
											onClick={() => applyStatus(item.id, "deleted")}
											size="sm"
											variant="destructive"
										>
											삭제
										</Button>
										{item.status !== "published" ? (
											<Button
												onClick={() => applyStatus(item.id, "published")}
												size="sm"
												variant="ghost"
											>
												복구
											</Button>
										) : null}
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
```

테이블은 `overflow-x-auto` 컨테이너로 감싼다 — 모바일에서 페이지 본문이 가로로 밀리면 안 된다.

- [x] **Step 2: 운영자 네비 4곳을 갱신**

메뉴 추가는 등록 지점이 4곳이라 하나라도 빠뜨리면 탭 활성 표시가 깨진다.

`apps/web/src/app/moderator/layout.tsx:8` `MODERATOR_NAV_ITEMS`에 추가:

```ts
	{ href: "/moderator/content" as Route, label: "게시물" },
```

`apps/web/src/components/bambi/persona-nav.tsx:124` `MOD_ROUTES`에 추가:

```ts
	content: "/moderator/content",
```

`persona-nav.tsx:165` 탭 판정 if-else 체인에 분기 추가:

```ts
	} else if (path.startsWith("/moderator/content")) {
		tab = "content";
```

`persona-nav.tsx:130` `MOD_DETAIL_RE`는 상세 화면 판정용이다. 이번 화면은 목록만 있고 상세 라우트가 없으므로 **정규식은 수정하지 않는다.**

- [x] **Step 3: 타입체크**

Run: `cd apps/web && pnpm check-types`
Expected: 에러 없음.

- [x] **Step 4: 커밋**

```
feat(web): 운영자 통합 게시물 조치 화면 추가
- /moderator/content 신설 — 기존에는 커뮤니티 조치가 신고 상세를 거쳐야만 도달 가능해 게시물을 직접 훑을 방법이 없었음
- 유형 탭(커뮤니티 글·댓글·고객센터 문의)으로 전환하되 서버가 공통 형태로 정규화해 주므로 화면에는 유형별 분기가 없음
- 조치 사유를 입력 전 검사해 서버 min(2) 거절 왕복을 줄이고, 사유가 감사 로그에 기록됨을 placeholder로 명시
- 신규 화면이라 프로토타입(screens/moderator.tsx) 대신 표준 shadcn Table 사용, 테이블은 overflow-x-auto로 감싸 모바일 본문 가로 밀림 방지
- 운영자 네비 등록 지점 3곳(MODERATOR_NAV_ITEMS·MOD_ROUTES·탭 판정) 동시 갱신, 상세 라우트가 없어 MOD_DETAIL_RE는 미변경
```

---

### Task 17: 운영자 고객센터 화면 (문의 답변 + FAQ 관리)

**Files:**
- Create: `apps/web/src/app/moderator/support/page.tsx`
- Modify: `apps/web/src/app/moderator/layout.tsx`, `apps/web/src/components/bambi/persona-nav.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.support.listInquiriesByAdmin`, `getInquiry`, `createInquiryMessage`, `listFaq`, `createFaq`, `setFaqPublished`, `removeFaq`, `orpc.bambi.moderation.setInquiryMessageStatusByAdmin`

- [x] **Step 1: 화면을 작성**

`apps/web/src/app/moderator/support/page.tsx` — 탭 2개(문의 답변 / FAQ 관리)로 구성한다. 문의를 선택하면 같은 화면에서 스레드를 열고 답변한다.

```tsx
"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	INQUIRY_STATUS_LABELS,
	SUPPORT_CATEGORIES,
	SUPPORT_CATEGORY_LABELS,
	type SupportCategory,
} from "@/lib/bambi/support";
import { orpc } from "@/utils/orpc";

export default function ModeratorSupportPage() {
	const queryClient = useQueryClient();
	const [tab, setTab] = useState<"inquiries" | "faq">("inquiries");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [reply, setReply] = useState("");
	const [faqQuestion, setFaqQuestion] = useState("");
	const [faqAnswer, setFaqAnswer] = useState("");
	const [faqCategory, setFaqCategory] = useState<SupportCategory>("account");

	const invalidate = async () => {
		await queryClient.invalidateQueries({ queryKey: orpc.bambi.support.key() });
	};

	const inquiriesQuery = useQuery(
		orpc.bambi.support.listInquiriesByAdmin.queryOptions({
			input: { page: 1 },
			enabled: tab === "inquiries",
		})
	);

	const threadQuery = useQuery(
		orpc.bambi.support.getInquiry.queryOptions({
			input: { inquiryId: selectedId ?? "" },
			enabled: Boolean(selectedId),
		})
	);

	const faqQuery = useQuery(
		orpc.bambi.support.listFaq.queryOptions({ input: {}, enabled: tab === "faq" })
	);

	const replyMutation = useMutation(
		orpc.bambi.support.createInquiryMessage.mutationOptions({
			onError: (error) => toast(error.message || "답변을 보내지 못했어요."),
			onSuccess: async () => {
				toast("답변을 보냈어요.");
				setReply("");
				await invalidate();
			},
		})
	);

	const createFaqMutation = useMutation(
		orpc.bambi.support.createFaq.mutationOptions({
			onError: (error) => toast(error.message || "FAQ를 등록하지 못했어요."),
			onSuccess: async () => {
				toast("FAQ를 등록했어요.");
				setFaqQuestion("");
				setFaqAnswer("");
				await invalidate();
			},
		})
	);

	const removeFaqMutation = useMutation(
		orpc.bambi.support.removeFaq.mutationOptions({
			onError: (error) => toast(error.message || "FAQ를 삭제하지 못했어요."),
			onSuccess: async () => {
				toast("FAQ를 삭제했어요.");
				await invalidate();
			},
		})
	);

	return (
		<div className="flex flex-col gap-5 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-xl">고객센터 관리</h1>

			<div className="flex flex-wrap gap-2">
				<Button
					onClick={() => setTab("inquiries")}
					size="sm"
					variant={tab === "inquiries" ? "default" : "outline"}
				>
					문의 답변
				</Button>
				<Button
					onClick={() => setTab("faq")}
					size="sm"
					variant={tab === "faq" ? "default" : "outline"}
				>
					FAQ 관리
				</Button>
			</div>

			{tab === "inquiries" ? (
				<div className="flex flex-col gap-3">
					{(inquiriesQuery.data?.items ?? []).map((item) => (
						<Card key={item.id}>
							<CardContent className="flex min-w-0 flex-col gap-2 py-4">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="secondary">
										{SUPPORT_CATEGORY_LABELS[item.category]}
									</Badge>
									<Badge
										variant={item.inquiryStatus === "open" ? "default" : "outline"}
									>
										{INQUIRY_STATUS_LABELS[item.inquiryStatus]}
									</Badge>
								</div>
								<p className="m-0 truncate font-bold text-sm">{item.title}</p>
								<Button
									onClick={() =>
										setSelectedId(selectedId === item.id ? null : item.id)
									}
									size="sm"
									variant="outline"
								>
									{selectedId === item.id ? "닫기" : "열기"}
								</Button>

								{selectedId === item.id ? (
									<div className="flex flex-col gap-3">
										{(threadQuery.data?.messages ?? []).map((message) => (
											<div className="flex flex-col gap-1" key={message.id}>
												<Badge variant={message.isStaff ? "default" : "outline"}>
													{message.isStaff ? "운영자" : "회원"}
												</Badge>
												<p className="m-0 whitespace-pre-wrap text-sm">
													{message.body}
												</p>
											</div>
										))}
										<Textarea
											className="min-h-24"
											onChange={(event) => setReply(event.target.value)}
											placeholder="답변을 입력하세요"
											value={reply}
										/>
										<Button
											disabled={reply.trim().length === 0}
											onClick={() =>
												replyMutation.mutate({ body: reply, inquiryId: item.id })
											}
											size="sm"
										>
											답변 보내기
										</Button>
									</div>
								) : null}
							</CardContent>
						</Card>
					))}
				</div>
			) : (
				<div className="flex flex-col gap-4">
					<Card>
						<CardContent className="flex flex-col gap-3 py-4">
							<div className="flex flex-wrap gap-2">
								{SUPPORT_CATEGORIES.map((key) => (
									<Button
										key={key}
										onClick={() => setFaqCategory(key)}
										size="sm"
										variant={faqCategory === key ? "default" : "outline"}
									>
										{SUPPORT_CATEGORY_LABELS[key]}
									</Button>
								))}
							</div>
							<Input
								maxLength={300}
								onChange={(event) => setFaqQuestion(event.target.value)}
								placeholder="질문"
								value={faqQuestion}
							/>
							<Textarea
								className="min-h-24"
								onChange={(event) => setFaqAnswer(event.target.value)}
								placeholder="답변"
								value={faqAnswer}
							/>
							<Button
								disabled={
									faqQuestion.trim().length < 2 || faqAnswer.trim().length === 0
								}
								onClick={() =>
									createFaqMutation.mutate({
										answer: faqAnswer,
										category: faqCategory,
										question: faqQuestion,
										sortOrder: 0,
									})
								}
							>
								FAQ 등록
							</Button>
						</CardContent>
					</Card>

					<div className="flex flex-col gap-2">
						{(faqQuery.data?.items ?? []).map((item) => (
							<Card key={item.id}>
								<CardContent className="flex min-w-0 flex-col gap-2 py-4">
									<Badge variant="secondary">
										{SUPPORT_CATEGORY_LABELS[item.category]}
									</Badge>
									<p className="m-0 font-bold text-sm">{item.question}</p>
									<p className="m-0 whitespace-pre-wrap text-muted-foreground text-sm">
										{item.answer}
									</p>
									<Button
										onClick={() => removeFaqMutation.mutate({ faqId: item.id })}
										size="sm"
										variant="destructive"
									>
										삭제
									</Button>
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
```

- [x] **Step 2: 운영자 네비에 등록**

Task 16과 같은 3곳에 `{ href: "/moderator/support", label: "고객센터" }`, `support: "/moderator/support"`, 탭 판정 분기를 추가한다.

- [x] **Step 3: 타입체크와 커밋**

Run: `cd apps/web && pnpm check-types`
Expected: 에러 없음.

```
feat(web): 운영자 고객센터 화면 추가(문의 답변·FAQ 관리)
- /moderator/support에 문의 답변과 FAQ 관리를 탭 2개로 구성
- 문의를 펼치면 같은 화면에서 스레드를 보고 답변 — 목록↔상세 왕복 없이 답변 큐를 처리
- 답변 전송 시 서버가 inquiryStatus를 answered로 올리므로 화면에서 상태를 따로 만지지 않음
- FAQ 등록·삭제를 한 화면에 두고 카테고리는 문의와 동일한 상수를 공유
- 운영자 네비 3곳 동시 갱신
```

---

### Task 18: 운영자 금칙어 관리 화면

**Files:**
- Create: `apps/web/src/app/moderator/banned-words/page.tsx`
- Modify: `apps/web/src/app/moderator/layout.tsx`, `apps/web/src/components/bambi/persona-nav.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.bannedWords.list`, `create`, `setActive`, `remove` (Task 6)

- [x] **Step 1: 화면을 작성**

`apps/web/src/app/moderator/banned-words/page.tsx`

```tsx
"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Switch } from "@bambi-app/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";

export default function ModeratorBannedWordsPage() {
	const queryClient = useQueryClient();
	const [term, setTerm] = useState("");

	const listQuery = useQuery(
		orpc.bambi.bannedWords.list.queryOptions({
			input: { includeInactive: true },
		})
	);

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.bannedWords.key(),
		});
	};

	const createMutation = useMutation(
		orpc.bambi.bannedWords.create.mutationOptions({
			onError: (error) => toast(error.message || "금칙어를 등록하지 못했어요."),
			onSuccess: async () => {
				toast("금칙어를 등록했어요.");
				setTerm("");
				await invalidate();
			},
		})
	);

	const setActiveMutation = useMutation(
		orpc.bambi.bannedWords.setActive.mutationOptions({
			onError: (error) => toast(error.message || "상태를 바꾸지 못했어요."),
			onSuccess: invalidate,
		})
	);

	const removeMutation = useMutation(
		orpc.bambi.bannedWords.remove.mutationOptions({
			onError: (error) => toast(error.message || "삭제하지 못했어요."),
			onSuccess: async () => {
				toast("금칙어를 삭제했어요.");
				await invalidate();
			},
		})
	);

	const items = listQuery.data?.items ?? [];

	return (
		<div className="flex flex-col gap-5 px-5 py-6 md:px-6">
			<header className="flex flex-col gap-2">
				<h1 className="m-0 font-extrabold text-xl">금칙어 관리</h1>
				<p className="m-0 text-muted-foreground text-sm">
					등록된 단어가 제목·본문에 있으면 커뮤니티·고객센터 글이 게시되지 않습니다.
					공백과 특수문자는 무시하고 비교하므로 "성 매매"처럼 띄어 써도 걸립니다.
				</p>
			</header>

			<div className="flex flex-wrap items-center gap-2">
				<Input
					className="max-w-80"
					maxLength={100}
					onChange={(event) => setTerm(event.target.value)}
					placeholder="추가할 금칙어"
					value={term}
				/>
				<Button
					disabled={term.trim().length === 0 || createMutation.isPending}
					onClick={() => createMutation.mutate({ term })}
				>
					추가
				</Button>
			</div>

			<div className="w-full overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>금칙어</TableHead>
							<TableHead>정규화형</TableHead>
							<TableHead>사용</TableHead>
							<TableHead>삭제</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => (
							<TableRow key={item.id}>
								<TableCell className="font-bold">{item.term}</TableCell>
								<TableCell className="text-muted-foreground">
									<Badge variant="outline">{item.normalizedTerm}</Badge>
								</TableCell>
								<TableCell>
									<Switch
										checked={item.isActive}
										onCheckedChange={(checked) =>
											setActiveMutation.mutate({
												id: item.id,
												isActive: checked,
											})
										}
									/>
								</TableCell>
								<TableCell>
									<Button
										onClick={() => removeMutation.mutate({ id: item.id })}
										size="sm"
										variant="destructive"
									>
										삭제
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
```

정규화형을 함께 보여주는 이유: 운영자가 `성 매매`를 넣었을 때 실제로 무엇과 비교되는지(`성매매`) 보이지 않으면 중복 등록 실패(`CONFLICT`)를 이해할 수 없다.

- [x] **Step 2: 운영자 네비에 등록**

Task 16과 같은 3곳에 `{ href: "/moderator/banned-words", label: "금칙어" }`, `bannedWords: "/moderator/banned-words"`, 탭 판정 분기를 추가한다.

- [x] **Step 3: 타입체크**

Run: `cd apps/web && pnpm check-types`
Expected: 에러 없음. `Switch`의 콜백 이름이 base-ui에서 다르면 `pnpm dlx shadcn@latest docs switch`로 확인한다.

- [x] **Step 4: 커밋**

```
feat(web): 운영자 금칙어 관리 화면 추가
- /moderator/banned-words에서 금칙어 추가·사용 토글·삭제를 처리, 배포 없이 신조어·우회 표현에 대응 가능
- 정규화형을 함께 표시 — 운영자가 "성 매매"를 넣었을 때 실제 비교 대상이 "성매매"임이 보이지 않으면 CONFLICT 사유를 이해할 수 없음
- 비활성 항목도 함께 조회(includeInactive)해 껐다 켜는 운영이 가능
- 매칭 규칙을 헤더 안내 문구로 노출하되 목록 자체는 운영자 전용이라 사용자에겐 노출되지 않음
- 테이블은 overflow-x-auto로 감싸 모바일 가로 밀림 방지
```

---

## Self-Review 체크 결과

**1. 스펙 커버리지**

| 스펙 섹션 | 담당 태스크 |
|---|---|
| §3-a 고객센터 접근 제어(게이트 미상속·NOT_FOUND) | Task 8 |
| §3-b `adminProcedure` 신설 | Task 3 |
| §4-a enum(신규 2·재사용·값 추가) | Task 1 |
| §4-b 테이블 4개 | Task 1 |
| 마이그레이션 0017 | Task 2 |
| §5-a 정규화 매칭 | Task 4 |
| §5-b 캐시 | Task 6 |
| §5-c 차단·에러 메시지 | Task 6 |
| §5-d 적용 지점(커뮤니티) | Task 7 |
| §5-d 적용 지점(고객센터) | Task 8 |
| §6-a support 라우터 | Task 8, 9 |
| §6-b banned-words 라우터 | Task 6 |
| §6-c moderation 확장·통합 목록 | Task 10 |
| §7-a `/support` 라우트 | Task 11~14 |
| §7-b 헤더 네비 "고객센터" | Task 15 |
| §7-c 운영자 화면 3개 | Task 16, 17, 18 |
| §7-d shadcn table·accordion | Task 11 |
| §8-a 단위 테스트 | Task 4, 5 |
| §8-b 통합 테스트 | Task 7, 8, 9, 10 |

누락 없음. TipTap 텍스트 추출(스펙 §5-d의 "텍스트 추출 헬퍼")은 Task 5로 분리해 커버했다.

**2. Placeholder 스캔**

"TBD"·"TODO"·"적절히 처리"·"Task N과 유사" 없음. 모든 코드 스텝에 실제 코드 블록이 있다. Task 17 Step 2와 Task 18 Step 2는 "Task 16과 같은 3곳"이라고 참조하지만, 수정할 파일·상수명·추가할 값이 그 자리에 모두 적혀 있어 Task 16을 읽지 않아도 실행할 수 있다.

**3. 타입 일관성**

- `BannedWordEntry { term, normalizedTerm }` — Task 4 정의, Task 6에서 동일 형태로 소비.
- `findBannedTerm(text, entries) → string | null` — Task 4 정의, Task 6 `assertNoBannedWords`에서 동일 시그니처로 호출.
- `assertNoBannedWords(fields: string[])` — Task 6 정의, Task 7·8에서 배열 인자로 호출.
- `extractTiptapText(body) → string` — Task 5 정의, Task 7에서 호출.
- 통합 목록 반환 형태 `{id,targetType,title,excerpt,authorName,authorUserId,status,createdAt}` — Task 10 정의, Task 16에서 `item.title`·`item.excerpt`·`item.authorName`·`item.status`로 소비. 일치.
- 조치 프로시저 입력 키가 유형별로 다르다(`postId`/`commentId`/`inquiryId`). Task 16의 `applyStatus`가 유형별로 분기해 올바른 키를 넘긴다.
- `SupportCategory` — Task 11 정의, Task 12·13·17에서 소비.

**4. 알려진 확인 필요 지점**

계획 실행 중 실제 코드와 어긋날 수 있어 각 태스크에 확인 절차를 넣어 둔 항목:

- `APP_CONTENT_MAX_W`의 실제 export 이름 (Task 11 Step 4)
- base-ui 컴포넌트의 prop 이름 — `Accordion`, `Select`, `Switch` (Task 12·13·18)
- Next 16 클라이언트 컴포넌트의 `params` Promise 처리 방식 (Task 14 Step 2)
- `user` 테이블 insert 필수 컬럼 (Task 8 Step 4)
- drizzle이 생성한 `ALTER TYPE` 문의 트랜잭션 배치 (Task 2 Step 3)

---

## 실행 결과 (2026-07-20)

18개 태스크 전부 완료. 브랜치 `worktree-support-center`(`feat/community`에서 분기), 태스크별 커밋 분리.

### 검증

- `packages/api`: `pnpm test` → **35 파일 219 tests 전부 통과**(3회 연속 동일). 첫 1회 실행에서 1건 실패가 있었으나 이후 3회 재현되지 않음 — 공유 개발 DB의 일시적 간섭으로 판단.
- `packages/api`, `packages/db`, `apps/web`: `pnpm check-types` 전부 exit 0.
- 마이그레이션 `0017_elite_goblin_queen.sql` 생성·적용 후 실제 DB 조회로 검증: 테이블 4종, `moderation_target_type` 신규값 2종, `banned_word_normalized_term_uidx` 유니크 인덱스 존재 확인.
- 빌드·dev 서버는 프로젝트 규칙에 따라 실행하지 않음. **화면 육안 확인은 사용자 몫으로 남음.**

### 계획과 달라진 점

실행 중 계획의 오류·누락이 드러나 고친 부분:

1. **`SUPPORT_CONTENT_WIDTH` 신설 취소.** 기존 `APP_CONTENT_MAX_W`(헤더)·`SEEKER_CONTENT_WIDTH`(본문)를 재사용했다. 폭 상수를 새로 만들면 헤더와 본문 정렬이 갈린다(채팅 프리플라이트에서 같은 문제 이력). 폭 컨테이너는 `app/support/layout.tsx`에 한 번만 두고 화면은 세로 레이아웃만 담당한다.
2. **`listFaq`에 `includeUnpublished` 추가**(계획에 없던 수정). 계획대로면 운영자가 FAQ를 비공개로 내리는 순간 목록에서 사라져 되돌릴 진입점이 없는 편도 함정이 된다. 플래그를 더하되 핸들러에서 `role === "admin"`을 함께 확인해 일반 회원의 초안 열람을 막았다.
3. **TipTap 평문 추출이 중복이었다.** 조사 단계에서 `moderation.ts`의 private `collectTiptapText`를 놓쳐 Task 5로 같은 기능을 또 만들었다. 더 정확한 기존 구현(블록 내부는 붙이고 문단 경계만 줄바꿈)을 서비스로 승격하고 중복을 제거했다.
4. **통합 목록의 커뮤니티 excerpt**를 raw slice가 아니라 `toCommunityBodyPreview`로 뽑는다. 계획대로면 본문이 TipTap JSON이라 운영자 목록에 `{"type":"doc"...` 원문이 그대로 노출된다.
5. **`uuidTargetTypes` 타입 기준 변경**(계획에 없던 수정). enum 확장으로 zod 신고 대상 타입과 DB enum이 어긋나 컴파일 에러가 났다. 행 타입 기준으로 넓히고 신규 두 유형도 집합에 포함했다(둘 다 uuid PK라 사실에 부합).
6. **`updateComment`의 금칙어 검사 위치**를 작성자 확인 뒤로 옮겼다. 계획 위치대로면 남의 댓글을 수정하려는 사람이 금칙어 목록을 떠볼 수 있다.
7. **UI 컴포넌트 선택**: 카테고리 필터는 Button 수동 토글이 아니라 `ToggleGroup`, 운영자 탭은 `Tabs`. CLAUDE.md가 2~7개 선택지에 ToggleGroup을 요구하고 활성 상태 수동 관리를 금지한다. 빈 상태는 raw `Empty`(슬롯 조합형)가 아니라 기존 `EmptyState` 래퍼를 재사용했다.
8. **금칙어 순수함수 테스트에 dotenv 선행 로드 추가.** Task 6이 같은 모듈에 `db` import를 올리면서 모듈 평가 시 env가 필요해져 전체 테스트에서 이 파일만 실패했다. 파일 분리 대신 이 패키지의 기존 관례를 따랐다.
9. **`bambi-banned-words.test.ts`의 기대 통과 수**는 12가 아니라 11이었다(계획의 계산 착오, 테스트 누락 아님).

### 알려진 제약 (후속 판단 필요)

- **운영자 모바일 하단탭**(`screens/moderator.tsx`의 `ModTabs`)은 queue/reports/employers/users 4개만 렌더한다. 신규 3개 화면은 데스크톱 헤더 nav로는 정상 접근되지만 모바일 하단바에 항목이 없다. 탭이 7개가 되면 과밀해져 의도적으로 두었다.
- **`/support`는 비로그인 시 401**이다. `listFaq`가 `protectedProcedure`이기 때문이며, "FAQ 열람 자격 = 로그인 회원 전체"로 확정한 설계대로다.
- **`updateFaq`는 UI에 노출하지 않았다.** 서버 프로시저는 있으나 운영자가 오타 수정을 삭제·재등록으로 처리하기 시작하면 화면에 붙인다.
- 목록 페이지네이션은 문의 목록(사용자)·FAQ 관리에 없다. 서버는 `PAGE_SIZE 20` + `totalCount`를 주므로 필요해지면 `Pagination` 컴포넌트만 붙이면 된다.
