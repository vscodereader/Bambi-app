# 수다방(커뮤니티) 게시판 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빈 자리표시자였던 수다방(`/seeker/community`)에 4개 게시판(베스트글·자유수다·일 이야기·중고거래)의 목록/상세/작성/댓글/추천/신고를 실 DB + oRPC로 구현한다.

**Architecture:** DB에 `community_post`/`community_comment`/`community_post_like` 3테이블을 신설하고(베스트글은 추천수 큐레이션 가상 게시판), oRPC `bambi.community` 라우터가 offset 번호 페이지네이션으로 목록을 서빙한다. 모든 프로시저는 신설 서비스 `requireCommunityMember`(기존 `resolveCommunityAccess` + 라이브 광고 자격)로 서버측 자격을 강제한다. 웹은 홈 인덱스(게시판별 미리보기) → 게시판 목록 → 상세/작성 화면을 client component + TanStack Query 패턴으로 구성한다. 신고는 기존 `moderation.createReport`에 `community_post` 대상 타입을 추가해 연계한다.

**Tech Stack:** TypeScript, drizzle-orm(PostgreSQL), oRPC, Next.js 16(App Router), TanStack Query, shadcn/base-ui + Tailwind v4, vitest.

설계 문서: `docs/superpowers/specs/2026-07-15-bambi-community-boards-design.md`

## Global Constraints

- **DB 마이그레이션:** `db:push` 절대 금지. 스키마 코드만 작성하고 **`db:generate`/`db:migrate` 실행은 사용자에게 요청**(Claude가 `db:*` 스크립트 직접 실행 금지). Task 1 끝의 사용자 게이트 참조.
- **빌드/실행 금지:** `build`·dev 서버 기동 금지. 검증은 `check-types`·vitest·`pnpm dlx ultracite fix`까지만. 시각 확인은 사용자에게 요청.
- **라이브러리 추가 금지:** 새 npm 의존성 금지. 폼은 컨트롤드 인풋(react-hook-form 금지), 페이지네이션은 shadcn `pagination`(의존성 없는 순수 UI)만 추가.
- **web UI:** shadcn/base-ui 우선(`@bambi-app/ui/components/*`), 인라인 `style` 금지, 임의 px 금지(Tailwind 토큰·`min()` 계산형), `rounded-none` 금지, base-ui 커스텀 엘리먼트는 `render` prop(asChild 아님), 세로 스택 `flex flex-col gap-*`(`space-y-*` 금지), 조건부 클래스는 `cn()`. 컨테이너 폭은 `SEEKER_CONTENT_WIDTH`.
- **primary 버튼:** 페이지당 주요 액션 한 곳만(글쓰기·등록 버튼). 내비류는 outline/ghost.
- **모바일 반응형:** 모든 화면 모바일(1열)·데스크톱 모두 대응.
- **커밋 메시지:** 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음). 멀티라인은 임시 파일 작성 후 `git commit -F <file>` (Bash 도구는 Git Bash — PowerShell here-string 금지).
- **푸시·PR 금지:** 사용자의 명시적 지시 전까지 `git push`·PR 생성 금지. 로컬 커밋까지만.
- **자격 규칙(verbatim):** `canAccess = status !== "suspended" AND (role === "admin" OR gender === "female" OR (role === "employer" AND isAdvertiser))`. isAdvertiser는 라이브 파생(`hasActiveAdvertiserCampaign`).
- **베스트글 규칙(verbatim):** `status = "published" AND createdAt >= now − 30일 AND likeCount >= 1`, 정렬 `likeCount DESC, createdAt DESC`.
- **권한(verbatim):** 수정=작성자 본인만. 삭제(글·댓글)=작성자 본인 또는 admin. 삭제는 소프트(`status = "deleted"`).
- **상수(verbatim):** PAGE_SIZE=20, OVERVIEW_LIMIT=4, 댓글 조회 캡 200, 제목 2–100자, 댓글 1–1000자.
- **[개정 2026-07-15] 글 필드(verbatim):** 작성인 `authorName` 1–30자(기본값 프로필 displayName), 비밀번호 `password` 4–30자 필수(scrypt `salt:hash` 저장), 잠금 `isLocked` boolean. 본문 `body`는 **Tiptap JSON 문자열** 2–30000자, 서버 검증 = JSON.parse 성공 + 최상위 `type === "doc"`.
- **[개정] 잠금 의미(verbatim):** 목록·오버뷰는 잠긴 글 제목을 서버에서 `"비밀글입니다"`로 마스킹(작성자·admin 제외). 상세·댓글조회·댓글작성·추천은 작성자·admin 외 비밀번호 일치 필요. getPost는 열람 불가 시 throw 대신 `{ locked: true, ... }` 축소 응답. 수정=작성자 또는 비밀번호 일치, 삭제=작성자·admin 또는 비밀번호 일치.
- **[개정] Tiptap 예외:** 본문 에디터는 Tiptap Simple Editor 템플릿. `@tiptap/*`(필요시 `sass` devDep 포함) 의존성 추가는 사용자 명시 허용 — 그 외 라이브러리는 여전히 금지. HTML 저장·`dangerouslySetInnerHTML` 금지, 상세 렌더는 read-only Tiptap.

## Prerequisites

- [ ] 워크트리 `.claude/worktrees/community-page`(브랜치 `worktree-community-page`, base `feat/community`)에서 작업.
- [ ] 최초 1회 `pnpm install` (워크트리 node_modules, 커밋 훅 필요).
- [ ] api 통합 테스트는 실 DB 사용(`apps/server/.env` 로드). Task 2 이후 테스트는 **Task 1의 마이그레이션이 사용자에 의해 적용된 뒤에만** 통과한다.

---

## File Structure

- **Modify** `packages/db/src/schema/bambi.ts` — enum 2개 신설, `moderation_target_type`에 `community_post` 추가, 테이블 3개 + relations.
- **Modify** `packages/db/src/index.ts` — 신규 테이블·relations 등록.
- **Create** `packages/db/src/migrations/0012_*.sql` (+ meta) — `db:generate` 산출(사용자 실행).
- **Create** `packages/api/src/services/bambi-community-authz.ts` — `requireCommunityMember`.
- **Create** `packages/api/src/routers/bambi/community.ts` — `communityRouter`.
- **Create** `packages/api/src/routers/bambi/community.test.ts` — 통합 테스트.
- **Modify** `packages/api/src/routers/bambi/index.ts` — `community` 등록.
- **Modify** `packages/api/src/routers/bambi/moderation.ts` — `targetTypeSchema`에 `community_post`.
- **Create** `apps/web/src/lib/bambi/community.ts` — 게시판 메타·경로·포맷·페이지 유틸.
- **Create** `apps/web/src/lib/bambi/community.test.ts`.
- **Create** `apps/web/src/lib/bambi/report-labels.ts` — 신고 사유·대상 라벨 공유화.
- **Modify** `apps/web/src/components/bambi/screens/my-reports-screen.tsx` — 라벨 임포트 전환 + `community_post` 라벨.
- **Create** `packages/ui/src/components/pagination.tsx` — shadcn 추가 후 재테마.
- **Create** `apps/web/src/components/bambi/screens/community-home.tsx` — 홈 인덱스 화면.
- **Create** `apps/web/src/components/bambi/screens/community-board.tsx` — 게시판 목록 화면.
- **Create** `apps/web/src/components/bambi/screens/community-post-detail.tsx` — 상세 화면.
- **Create** `apps/web/src/components/bambi/community-post-form.tsx` — 작성/수정 공용 폼.
- **Modify** `apps/web/src/app/seeker/community/page.tsx` — EmptyState → 홈 화면.
- **Create** `apps/web/src/app/seeker/community/[board]/page.tsx`
- **Create** `apps/web/src/app/seeker/community/[board]/write/page.tsx`
- **Create** `apps/web/src/app/seeker/community/[board]/[postId]/page.tsx`
- **Create** `apps/web/src/app/seeker/community/[board]/[postId]/edit/page.tsx`

---

## Task 1: DB — 커뮤니티 테이블·enum + 마이그레이션(사용자 게이트)

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (enum 구역 ~L68, 테이블은 `bambiNotification` 뒤 ~L678, relations는 파일 끝)
- Modify: `packages/db/src/index.ts:23-98`
- Create: `packages/db/src/migrations/0012_*.sql` — 사용자 `db:generate` 산출

**Interfaces:**
- Produces: `communityBoard`("free"|"work_talk"|"market"), `communityContentStatus`("published"|"hidden"|"deleted"), `communityPost`, `communityComment`, `communityPostLike` 테이블 접근자와 relations. `moderationTargetType`에 `"community_post"` 값.

- [ ] **Step 1: enum 신설·확장**

`packages/db/src/schema/bambi.ts`의 `moderationTargetType` 정의를 다음으로 교체(마지막에 `community_post` append — 순서 변경 금지):

```ts
export const moderationTargetType = pgEnum("moderation_target_type", [
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"user",
	"community_post",
]);
```

그 아래(`promotionTier` 위)에 커뮤니티 enum 2개 추가:

```ts
// 수다방 게시판. 베스트글은 저장 컬럼이 아니라 추천수 큐레이션 가상 게시판이다.
export const communityBoard = pgEnum("community_board", [
	"free",
	"work_talk",
	"market",
]);

// 글·댓글 공용 상태. 삭제는 소프트(deleted), hidden은 후속 운영자 숨김용 예약값.
export const communityContentStatus = pgEnum("community_content_status", [
	"published",
	"hidden",
	"deleted",
]);
```

- [ ] **Step 2: 테이블 3개 추가**

`bambiNotification` 테이블 정의 다음(relations 구역 시작 전)에 추가:

```ts
export const communityPost = pgTable(
	"community_post",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		board: communityBoard("board").notNull(),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		body: text("body").notNull(),
		viewCount: integer("view_count").default(0).notNull(),
		// 추천·댓글 수 캐시. 진실값은 community_post_like/community_comment 집계이며
		// 토글·작성·삭제 트랜잭션에서 함께 증감한다.
		likeCount: integer("like_count").default(0).notNull(),
		commentCount: integer("comment_count").default(0).notNull(),
		status: communityContentStatus("status").default("published").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		// $onUpdate를 쓰지 않는다 — 조회수 증가가 "수정됨" 시각을 갱신하면 안 되므로
		// updatePost에서만 명시적으로 갱신한다.
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("community_post_board_status_created_at_idx").on(
			table.board,
			table.status,
			table.createdAt
		),
		index("community_post_status_created_at_idx").on(
			table.status,
			table.createdAt
		),
		index("community_post_author_user_id_idx").on(table.authorUserId),
	]
);

export const communityComment = pgTable(
	"community_comment",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		postId: uuid("post_id")
			.notNull()
			.references(() => communityPost.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		body: text("body").notNull(),
		status: communityContentStatus("status").default("published").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("community_comment_post_id_status_created_at_idx").on(
			table.postId,
			table.status,
			table.createdAt
		),
		index("community_comment_author_user_id_idx").on(table.authorUserId),
	]
);

export const communityPostLike = pgTable(
	"community_post_like",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		postId: uuid("post_id")
			.notNull()
			.references(() => communityPost.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("community_post_like_post_id_user_id_uidx").on(
			table.postId,
			table.userId
		),
		index("community_post_like_user_id_idx").on(table.userId),
	]
);
```

- [ ] **Step 3: relations 추가**

파일 끝 relations 구역에 추가:

```ts
export const communityPostRelations = relations(communityPost, ({ many }) => ({
	comments: many(communityComment),
	likes: many(communityPostLike),
}));

export const communityCommentRelations = relations(
	communityComment,
	({ one }) => ({
		post: one(communityPost, {
			fields: [communityComment.postId],
			references: [communityPost.id],
		}),
	})
);

export const communityPostLikeRelations = relations(
	communityPostLike,
	({ one }) => ({
		post: one(communityPost, {
			fields: [communityPostLike.postId],
			references: [communityPost.id],
		}),
	})
);
```

- [ ] **Step 4: `packages/db/src/index.ts` 등록**

`./schema/bambi` import 목록에 알파벳 순서로 추가: `communityComment`, `communityCommentRelations`, `communityPost`, `communityPostLike`, `communityPostLikeRelations`, `communityPostRelations`. `schema` 객체에도 같은 6개 키 추가(기존 정렬 관행 따름).

- [ ] **Step 5: 타입체크**

Run: `pnpm --filter @bambi-app/db check-types`
Expected: 통과.

- [ ] **Step 6: 커밋**

커밋 메시지(임시 파일 + `git commit -F`):

```
feat: 커뮤니티 게시판 DB 스키마 추가
- community_post·community_comment·community_post_like 테이블 신설
- community_board(free|work_talk|market)·community_content_status enum 추가
- moderation_target_type enum에 community_post 값 append — 기존 신고 테이블 재사용
- like_count·comment_count는 트랜잭션 동기화 캐시, updatedAt은 $onUpdate 미사용(조회수 증가와 분리)
- db 스키마 객체에 테이블·relations 등록
```

- [ ] **Step 7: 사용자 게이트 — 마이그레이션 생성·적용 요청 (여기서 중단)**

사용자에게 다음 실행을 요청하고 완료 확인까지 **대기**한다(Claude가 직접 실행 금지):

```
pnpm db:generate   # 0012_*.sql 생성 — ALTER TYPE ... ADD VALUE 'community_post' + CREATE TABLE 3건 포함 확인
pnpm db:migrate    # 로컬 DB 적용
```

생성된 `packages/db/src/migrations/0012_*.sql`(+ `meta/`)을 확인 후 커밋:

```
chore: 커뮤니티 게시판 마이그레이션 파일
- drizzle generate 산출 0012 마이그레이션(테이블 3건·enum 2건·target_type 값 추가)
```

---

## Task 2: API 서비스 — `requireCommunityMember` 서버측 자격 가드

**Files:**
- Create: `packages/api/src/services/bambi-community-authz.ts`

**Interfaces:**
- Consumes: `requireActiveBambiProfile`, `SessionLike`, `BambiAccessProfile`(bambi-authz), `hasActiveAdvertiserCampaign`(bambi-advertiser), `resolveCommunityAccess`(bambi-community-access).
- Produces: `requireCommunityMember(session: SessionLike | null | undefined): Promise<BambiAccessProfile>` — 미자격 시 `ORPCError("FORBIDDEN")`.

- [ ] **Step 1: 서비스 작성**

`packages/api/src/services/bambi-community-authz.ts`:

```ts
import { ORPCError } from "@orpc/server";

import { hasActiveAdvertiserCampaign } from "./bambi-advertiser";
import {
	type BambiAccessProfile,
	requireActiveBambiProfile,
	type SessionLike,
} from "./bambi-authz";
import { resolveCommunityAccess } from "./bambi-community-access";

// 수다방 라우터 공용 가드. 클라이언트 게이트(RequireCommunityAccess)와 별개로 서버에서도
// 자격(여성 | 광고 중 업소 | 관리자)을 강제한다. isAdvertiser는 캐시 컬럼이 아니라
// 라이브 파생값(hasActiveAdvertiserCampaign)을 쓴다 — 캐시 불신 원칙(onboarding.getMine과 동일).
export const requireCommunityMember = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile> => {
	const profile = await requireActiveBambiProfile(session);
	const isAdvertiser =
		profile.role === "employer"
			? await hasActiveAdvertiserCampaign({
					now: new Date(),
					userId: profile.userId,
				})
			: false;
	const access = resolveCommunityAccess({
		gender: profile.gender,
		isAdvertiser,
		role: profile.role,
		status: profile.status,
	});

	if (!access.canAccess) {
		throw new ORPCError("FORBIDDEN", {
			message: "여성회원과 광고 중인 업소회원만 이용가능합니다",
		});
	}

	return profile;
};
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: 통과. (동작 검증은 Task 3 통합 테스트의 자격 거부 케이스가 담당.)

- [ ] **Step 3: 커밋**

```
feat(api): 수다방 서버측 자격 가드 requireCommunityMember 추가
- requireActiveBambiProfile → 라이브 광고 자격 → resolveCommunityAccess 순으로 판정
- 미자격 시 FORBIDDEN(클라이언트 게이트와 동일 문구) — 커뮤니티 전 프로시저 공용
```

---

## Task 3: API — community 라우터 조회 계열 (listPosts·overview·getPost) + 등록, TDD

**Files:**
- Create: `packages/api/src/routers/bambi/community.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`
- Test: `packages/api/src/routers/bambi/community.test.ts`

**Interfaces:**
- Produces (라우터 시그니처 — 웹이 `orpc.bambi.community.*`로 소비):
  - `listPosts({ board: "best"|"free"|"work_talk"|"market", page: number≥1 (default 1) })` → `{ items: PostSummary[], page, pageSize: 20, totalCount: number }`
  - `PostSummary = { id: string; board: "free"|"work_talk"|"market"; title: string; authorUserId: string; authorName: string | null; viewCount: number; likeCount: number; commentCount: number; createdAt: Date }`
  - `overview()` → `{ best: PostSummary[], free: PostSummary[], market: PostSummary[], workTalk: PostSummary[] }` (각 최대 4개)
  - `getPost({ postId: uuid })` → `PostSummary & { body: string; updatedAt: Date; isLiked: boolean; canEdit: boolean; canDelete: boolean }` (호출 시 viewCount +1)
- Produces (내부 헬퍼 — Task 4·5가 사용): `findPublishedPost(postId: string): Promise<typeof communityPost.$inferSelect>` (없거나 미공개면 NOT_FOUND throw)

- [ ] **Step 1: 실패하는 테스트 작성 (조회 계열)**

`packages/api/src/routers/bambi/community.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { communityRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./community"),
	]);

const { user } = authSchema;
const { bambiProfile, communityPost } = bambiSchema;

interface CommunityFixture {
	adminUserId: string;
	femaleUserId: string;
	maleUserId: string;
	userIds: string[];
}

const createContextForUser = (userId: string): Context =>
	({
		auth: null,
		session: {
			user: {
				id: userId,
			},
		},
	}) as Context;

const makeEmail = (prefix: string): string =>
	`${prefix}-${randomUUID()}@bambi.test`;

const createCommunityFixture = async (): Promise<CommunityFixture> => {
	const femaleUserId = `user_test_female_${randomUUID()}`;
	const maleUserId = `user_test_male_${randomUUID()}`;
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const userIds = [femaleUserId, maleUserId, adminUserId];

	await db.insert(user).values([
		{ email: makeEmail("female"), id: femaleUserId, name: "여성 회원" },
		{ email: makeEmail("male"), id: maleUserId, name: "남성 회원" },
		{ email: makeEmail("admin"), id: adminUserId, name: "관리자" },
	]);
	await db.insert(bambiProfile).values([
		{
			displayName: "달빛토끼",
			gender: "female",
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: femaleUserId,
		},
		{
			displayName: "남성구직자",
			gender: "male",
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: maleUserId,
		},
		{
			displayName: "운영자",
			gender: "female",
			isPhoneVerified: true,
			role: "admin",
			status: "active",
			userId: adminUserId,
		},
	]);

	return { adminUserId, femaleUserId, maleUserId, userIds };
};

const cleanupCommunityFixture = async (
	fixture: CommunityFixture
): Promise<void> => {
	// community_post cascade가 댓글·좋아요를 함께 지운다.
	await db
		.delete(communityPost)
		.where(inArray(communityPost.authorUserId, fixture.userIds));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
};

const clientFor = <T>(procedure: T, userId: string, path: string[]) =>
	// biome-ignore lint/suspicious/noExplicitAny: 테스트 헬퍼 — 프로시저별 제네릭 전개 생략
	createProcedureClient(procedure as any, {
		context: createContextForUser(userId),
		path: ["bambi", "community", ...path],
	});

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

describe("bambi community router — 조회", () => {
	it("남성 구직자는 목록 조회가 FORBIDDEN으로 거부된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const listPosts = clientFor(communityRouter.listPosts, fixture.maleUserId, [
				"listPosts",
			]);
			await expectOrpcCode(listPosts({ board: "free", page: 1 }), "FORBIDDEN");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("여성 회원은 글 작성 후 목록·오버뷰·상세에서 조회할 수 있고 상세는 조회수를 올린다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.femaleUserId,
				["listPosts"]
			);
			const overview = clientFor(communityRouter.overview, fixture.femaleUserId, [
				"overview",
			]);
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);

			const created = await createPost({
				board: "free",
				body: "수다방 첫 글 본문입니다.",
				title: `테스트 자유수다 ${randomUUID()}`,
			});

			const listed = await listPosts({ board: "free", page: 1 });
			expect(listed.pageSize).toBe(20);
			expect(listed.items.some((item) => item.id === created.id)).toBe(true);
			const summary = listed.items.find((item) => item.id === created.id);
			expect(summary?.authorName).toBe("달빛토끼");

			const home = await overview({});
			expect(home.free.some((item) => item.id === created.id)).toBe(true);

			const detail = await getPost({ postId: created.id });
			expect(detail.viewCount).toBe(1);
			expect(detail.isLiked).toBe(false);
			expect(detail.canEdit).toBe(true);
			expect(detail.canDelete).toBe(true);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("목록은 번호 페이지네이션으로 페이지 간 중복 없이 잘린다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			for (let index = 0; index < 25; index += 1) {
				await createPost({
					board: "market",
					body: `페이지네이션 테스트 본문 ${index}`,
					title: `페이지네이션 ${index} ${randomUUID()}`,
				});
			}
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.femaleUserId,
				["listPosts"]
			);
			const page1 = await listPosts({ board: "market", page: 1 });
			const page2 = await listPosts({ board: "market", page: 2 });
			expect(page1.items).toHaveLength(20);
			expect(page1.totalCount).toBeGreaterThanOrEqual(25);
			const page1Ids = new Set(page1.items.map((item) => item.id));
			expect(page2.items.some((item) => page1Ids.has(item.id))).toBe(false);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("존재하지 않거나 삭제된 글 상세는 NOT_FOUND", async () => {
		const fixture = await createCommunityFixture();
		try {
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);
			await expectOrpcCode(getPost({ postId: randomUUID() }), "NOT_FOUND");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test -- community`
Expected: FAIL — `./community` 모듈 없음.

- [ ] **Step 3: 라우터 구현 (조회 계열 + createPost 최소본)**

`packages/api/src/routers/bambi/community.ts`:

```ts
import { db } from "@bambi-app/db";
import {
	bambiProfile,
	communityComment,
	communityPost,
	communityPostLike,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { requireCommunityMember } from "../../services/bambi-community-authz";

const PAGE_SIZE = 20;
const OVERVIEW_LIMIT = 4;
const COMMENTS_CAP = 200;
const BEST_WINDOW_DAYS = 30;
const BEST_MIN_LIKES = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

const communityWritableBoardSchema = z.enum(["free", "work_talk", "market"]);
const communityBoardSchema = z.enum(["best", "free", "work_talk", "market"]);

type CommunityBoardInput = z.infer<typeof communityBoardSchema>;

const listPostsInput = z.object({
	board: communityBoardSchema,
	page: z.number().int().min(1).default(1),
});

const postIdInput = z.object({
	postId: z.string().uuid(),
});

const createPostInput = z.object({
	board: communityWritableBoardSchema,
	body: z.string().trim().min(2).max(5000),
	title: z.string().trim().min(2).max(100),
});

const updatePostInput = postIdInput.extend({
	body: z.string().trim().min(2).max(5000),
	title: z.string().trim().min(2).max(100),
});

const createCommentInput = postIdInput.extend({
	body: z.string().trim().min(1).max(1000),
});

// 목록·상세 공용 요약 셀렉션. 작성자 표시명은 bambiProfile.displayName(없으면 웹이 "회원" 폴백).
const postSummarySelection = {
	authorName: bambiProfile.displayName,
	authorUserId: communityPost.authorUserId,
	board: communityPost.board,
	commentCount: communityPost.commentCount,
	createdAt: communityPost.createdAt,
	id: communityPost.id,
	likeCount: communityPost.likeCount,
	title: communityPost.title,
	viewCount: communityPost.viewCount,
};

const bestWindowStart = () => new Date(Date.now() - BEST_WINDOW_DAYS * DAY_MS);

// 베스트글은 저장 게시판이 아니라 최근 30일 추천 상위 큐레이션 가상 게시판이다.
const buildBoardFilters = (board: CommunityBoardInput) => {
	if (board === "best") {
		return [
			eq(communityPost.status, "published"),
			gte(communityPost.likeCount, BEST_MIN_LIKES),
			gte(communityPost.createdAt, bestWindowStart()),
		];
	}
	return [
		eq(communityPost.status, "published"),
		eq(communityPost.board, board),
	];
};

const buildBoardOrder = (board: CommunityBoardInput) =>
	board === "best"
		? [desc(communityPost.likeCount), desc(communityPost.createdAt)]
		: [desc(communityPost.createdAt)];

const selectBoardPosts = (
	board: CommunityBoardInput,
	{ limit, offset = 0 }: { limit: number; offset?: number }
) =>
	db
		.select(postSummarySelection)
		.from(communityPost)
		.leftJoin(bambiProfile, eq(bambiProfile.userId, communityPost.authorUserId))
		.where(and(...buildBoardFilters(board)))
		.orderBy(...buildBoardOrder(board))
		.limit(limit)
		.offset(offset);

const findPublishedPost = async (postId: string) => {
	const [post] = await db
		.select()
		.from(communityPost)
		.where(eq(communityPost.id, postId))
		.limit(1);

	if (!post || post.status !== "published") {
		throw new ORPCError("NOT_FOUND", {
			message: "게시글을 찾을 수 없습니다.",
		});
	}

	return post;
};

export const communityRouter = {
	listPosts: protectedProcedure
		.input(listPostsInput)
		.handler(async ({ context, input }) => {
			await requireCommunityMember(context.session);

			const filters = buildBoardFilters(input.board);
			const [items, [total]] = await Promise.all([
				selectBoardPosts(input.board, {
					limit: PAGE_SIZE,
					offset: (input.page - 1) * PAGE_SIZE,
				}),
				db
					.select({ value: count() })
					.from(communityPost)
					.where(and(...filters)),
			]);

			return {
				items,
				page: input.page,
				pageSize: PAGE_SIZE,
				totalCount: total?.value ?? 0,
			};
		}),

	overview: protectedProcedure.handler(async ({ context }) => {
		await requireCommunityMember(context.session);

		const [best, free, workTalk, market] = await Promise.all([
			selectBoardPosts("best", { limit: OVERVIEW_LIMIT }),
			selectBoardPosts("free", { limit: OVERVIEW_LIMIT }),
			selectBoardPosts("work_talk", { limit: OVERVIEW_LIMIT }),
			selectBoardPosts("market", { limit: OVERVIEW_LIMIT }),
		]);

		return { best, free, market, workTalk };
	}),

	getPost: protectedProcedure
		.input(postIdInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const post = await findPublishedPost(input.postId);

			// 조회수는 원자 증가. updatedAt은 건드리지 않는다(수정 시각과 분리).
			await db
				.update(communityPost)
				.set({ viewCount: sql`${communityPost.viewCount} + 1` })
				.where(eq(communityPost.id, input.postId));

			const [author] = await db
				.select({ displayName: bambiProfile.displayName })
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, post.authorUserId))
				.limit(1);
			const [like] = await db
				.select({ id: communityPostLike.id })
				.from(communityPostLike)
				.where(
					and(
						eq(communityPostLike.postId, input.postId),
						eq(communityPostLike.userId, profile.userId)
					)
				)
				.limit(1);

			const isMine = post.authorUserId === profile.userId;

			return {
				authorName: author?.displayName ?? null,
				authorUserId: post.authorUserId,
				board: post.board,
				body: post.body,
				canDelete: isMine || profile.role === "admin",
				canEdit: isMine,
				commentCount: post.commentCount,
				createdAt: post.createdAt,
				id: post.id,
				isLiked: Boolean(like),
				likeCount: post.likeCount,
				title: post.title,
				updatedAt: post.updatedAt,
				viewCount: post.viewCount + 1,
			};
		}),

	createPost: protectedProcedure
		.input(createPostInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);

			const [created] = await db
				.insert(communityPost)
				.values({
					authorUserId: profile.userId,
					board: input.board,
					body: input.body,
					title: input.title,
				})
				.returning();

			return created;
		}),
};
```

(참고: `communityComment`·`asc`·`COMMENTS_CAP`·`updatePostInput`·`createCommentInput`은 Task 4·5에서 사용 — 이 시점 미사용 import는 lint에 걸리므로 Task 3에서는 `communityComment`, `asc`, `COMMENTS_CAP`, `updatePostInput`, `createCommentInput` 선언을 잠시 빼고 Task 4·5에서 추가해도 된다. 최종 파일 기준 전체 코드는 위와 Task 4·5 코드의 합이다.)

- [ ] **Step 4: 라우터 등록**

`packages/api/src/routers/bambi/index.ts` — import와 객체에 알파벳 순서로 추가:

```ts
import { communityRouter } from "./community";
// ...
export const bambiRouter = {
	analytics: analyticsRouter,
	blocks: blocksRouter,
	chats: chatsRouter,
	community: communityRouter,
	jobs: jobsRouter,
	// ...이하 기존 그대로
};
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test -- community`
Expected: PASS (4 케이스). 실패 시 마이그레이션 적용 여부(Task 1 Step 7)부터 확인.

- [ ] **Step 6: 타입체크 + 커밋**

Run: `pnpm --filter @bambi-app/api check-types`

```
feat(api): 커뮤니티 라우터 조회 계열 추가
- bambi.community 라우터 신설·등록: listPosts(번호 페이지네이션 20개)·overview(게시판별 4개)·getPost
- 베스트글은 최근 30일 likeCount>=1을 likeCount desc로 큐레이션하는 가상 게시판
- getPost는 viewCount 원자 증가 + isLiked·canEdit·canDelete 플래그 동봉
- createPost 최소 구현(자격 가드 + 제목 2-100·본문 2-5000자)
- 실 DB 통합 테스트: 자격 거부·목록/오버뷰/상세·페이지네이션 중복 없음·NOT_FOUND
```

---

## Task 13: [개정] 클래식 보드 필드 — 작성인·비밀번호·잠금 (DB+API)

> 실행 순서: **Task 3 직후, Task 4 전.** 2026-07-15 사용자 지시로 추가된 개정 태스크.
> 이 태스크 이후의 모든 태스크에서 이 태스크의 정의가 원본 코드 블록과 충돌하면 **이 태스크가 우선**한다.

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` — `communityPost`에 컬럼 3개
- Create: `packages/db/src/migrations/0013_*.sql` — 컨트롤러가 db:generate/migrate 실행(사용자 허용)
- Create: `packages/api/src/services/bambi-community-password.ts`
- Test: `packages/api/src/services/bambi-community-password.test.ts`
- Modify: `packages/api/src/routers/bambi/community.ts`
- Modify: `packages/api/src/routers/bambi/community.test.ts`

**Interfaces:**
- Consumes: Task 3의 `communityRouter`·`findPublishedPost`·`postSummarySelection`.
- Produces:
  - `hashCommunityPassword(password: string): string` (`salt:hash`), `verifyCommunityPassword(password: string, stored: string): boolean` (scrypt + timingSafeEqual)
  - `communityPost.authorDisplayName`(notNull)·`passwordHash`(notNull)·`isLocked`(default false)
  - `createPost` input: `{ authorName 1–30, board, body(JSON 2–30000), isLocked, password 4–30, title 2–100 }`, 응답 `{ id, board }`(passwordHash 비노출)
  - `getPost` input: `{ postId, password? }`, 응답 union: 열람 가능 시 기존 full 형태 + `locked: false` / 잠김+비번없음 시 `{ locked: true, id, board, authorName, createdAt }` / 비번 불일치 시 FORBIDDEN("비밀번호가 일치하지 않습니다.")
  - `PostSummary`에 `isLocked: boolean` 추가, `authorName`은 `authorDisplayName` 컬럼 값(프로필 조인 제거), 잠긴 글 제목은 서버 마스킹 `"비밀글입니다"`(작성자·admin 제외)
  - 내부 헬퍼(Task 4·5가 사용): `canBypassLock(post, profile)`, `requirePostReadAccess(post, profile, password?)` — 잠금 게이트 공용, `LOCKED_TITLE = "비밀글입니다"`, `assertTiptapDoc(body)` — JSON.parse + `type === "doc"` 검증(실패 시 BAD_REQUEST "본문 형식이 올바르지 않습니다.")

- [ ] **Step 1: 스키마 컬럼 추가**

`communityPost`의 `authorUserId` 정의 다음에:

```ts
		// 클래식 게시판 필드: 글별 표시명(익명), 글 비밀번호(scrypt salt:hash), 비밀글 여부.
		authorDisplayName: text("author_display_name").notNull(),
		passwordHash: text("password_hash").notNull(),
		isLocked: boolean("is_locked").default(false).notNull(),
```

- [ ] **Step 2: 컨트롤러 게이트 — 마이그레이션**

컨트롤러가 `pnpm db:generate`(0013 산출: ALTER TABLE community_post ADD COLUMN 3건) → `pnpm db:migrate` 실행 후 커밋. (테이블이 비어 있어 notNull 컬럼 추가 가능. 만약 개발 DB에 기존 행이 있으면 생성된 SQL에 DEFAULT 보정이 필요한지 컨트롤러가 확인.)

- [ ] **Step 3: 비밀번호 서비스 TDD**

`packages/api/src/services/bambi-community-password.test.ts` (순수 단위 테스트 — DB 불필요):

```ts
import { describe, expect, it } from "vitest";

import {
	hashCommunityPassword,
	verifyCommunityPassword,
} from "./bambi-community-password";

describe("community password hashing", () => {
	it("해시는 salt:hash 형태이고 원문과 다르다", () => {
		const stored = hashCommunityPassword("pw1234");
		expect(stored).toContain(":");
		expect(stored).not.toContain("pw1234");
	});

	it("같은 비밀번호는 검증에 성공하고 다른 비밀번호·손상된 저장값은 실패한다", () => {
		const stored = hashCommunityPassword("pw1234");
		expect(verifyCommunityPassword("pw1234", stored)).toBe(true);
		expect(verifyCommunityPassword("wrong!", stored)).toBe(false);
		expect(verifyCommunityPassword("pw1234", "broken")).toBe(false);
	});

	it("같은 비밀번호라도 salt가 달라 저장값이 매번 다르다", () => {
		expect(hashCommunityPassword("pw1234")).not.toBe(
			hashCommunityPassword("pw1234")
		);
	});
});
```

구현 `packages/api/src/services/bambi-community-password.ts`:

```ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

// 커뮤니티 글 비밀번호 저장 형식: "<salt hex>:<scrypt hash hex>".
export const hashCommunityPassword = (password: string): string => {
	const salt = randomBytes(SALT_BYTES).toString("hex");
	const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
	return `${salt}:${hash}`;
};

export const verifyCommunityPassword = (
	password: string,
	stored: string
): boolean => {
	const [salt, hash] = stored.split(":");
	if (!salt || !hash) {
		return false;
	}
	const candidate = scryptSync(password, salt, KEY_LENGTH);
	const expected = Buffer.from(hash, "hex");
	return (
		candidate.length === expected.length && timingSafeEqual(candidate, expected)
	);
};
```

- [ ] **Step 4: community.ts 개정**

변경 목록(전부 이 파일 안):

1. import 추가: `hashCommunityPassword`, `verifyCommunityPassword` (../../services/bambi-community-password), `boolean`은 불필요(zod), `BambiAccessProfile` 타입 import (../../services/bambi-authz).
2. 상수·헬퍼 추가:

```ts
const LOCKED_TITLE = "비밀글입니다";
const BODY_MAX = 30_000;

const assertTiptapDoc = (body: string) => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		throw new ORPCError("BAD_REQUEST", {
			message: "본문 형식이 올바르지 않습니다.",
		});
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		(parsed as { type?: unknown }).type !== "doc"
	) {
		throw new ORPCError("BAD_REQUEST", {
			message: "본문 형식이 올바르지 않습니다.",
		});
	}
};

const canBypassLock = (
	post: { authorUserId: string },
	profile: BambiAccessProfile
): boolean =>
	post.authorUserId === profile.userId || profile.role === "admin";

const requirePostReadAccess = (
	post: { authorUserId: string; isLocked: boolean; passwordHash: string },
	profile: BambiAccessProfile,
	password?: string
): void => {
	if (!post.isLocked || canBypassLock(post, profile)) {
		return;
	}
	if (password && verifyCommunityPassword(password, post.passwordHash)) {
		return;
	}
	throw new ORPCError("FORBIDDEN", {
		message: "비밀글입니다. 비밀번호를 확인해 주세요.",
	});
};

const maskLockedSummaries = <
	T extends { authorUserId: string; isLocked: boolean; title: string },
>(
	items: T[],
	profile: BambiAccessProfile
): T[] =>
	items.map((item) =>
		item.isLocked && !canBypassLock(item, profile)
			? { ...item, title: LOCKED_TITLE }
			: item
	);
```

3. `createPostInput` 교체:

```ts
const createPostInput = z.object({
	authorName: z.string().trim().min(1).max(30),
	board: communityWritableBoardSchema,
	body: z.string().min(2).max(BODY_MAX),
	isLocked: z.boolean().default(false),
	password: z.string().min(4).max(30),
	title: z.string().trim().min(2).max(100),
});
```

4. `postSummarySelection` 교체 — 프로필 조인 제거, 컬럼 사용:

```ts
const postSummarySelection = {
	authorName: communityPost.authorDisplayName,
	authorUserId: communityPost.authorUserId,
	board: communityPost.board,
	commentCount: communityPost.commentCount,
	createdAt: communityPost.createdAt,
	id: communityPost.id,
	isLocked: communityPost.isLocked,
	likeCount: communityPost.likeCount,
	title: communityPost.title,
	viewCount: communityPost.viewCount,
};
```

`selectBoardPosts`에서 `.leftJoin(bambiProfile, ...)` 제거(다른 사용처 없으면 `bambiProfile` import도 제거).

5. `listPosts`·`overview`: 조회 결과에 `maskLockedSummaries(items, profile)` 적용 — 두 핸들러 모두 `const profile = await requireCommunityMember(...)`로 프로필을 받도록 변경.

6. `getPost` 교체:

```ts
	getPost: protectedProcedure
		.input(
			postIdInput.extend({
				password: z.string().max(30).optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const post = await findPublishedPost(input.postId);

			if (post.isLocked && !canBypassLock(post, profile)) {
				if (!input.password) {
					return {
						authorName: post.authorDisplayName,
						board: post.board,
						createdAt: post.createdAt,
						id: post.id,
						locked: true as const,
					};
				}
				if (!verifyCommunityPassword(input.password, post.passwordHash)) {
					throw new ORPCError("FORBIDDEN", {
						message: "비밀번호가 일치하지 않습니다.",
					});
				}
			}

			await db
				.update(communityPost)
				.set({ viewCount: sql`${communityPost.viewCount} + 1` })
				.where(eq(communityPost.id, input.postId));

			const [like] = await db
				.select({ id: communityPostLike.id })
				.from(communityPostLike)
				.where(
					and(
						eq(communityPostLike.postId, input.postId),
						eq(communityPostLike.userId, profile.userId)
					)
				)
				.limit(1);

			const isMine = post.authorUserId === profile.userId;

			return {
				authorName: post.authorDisplayName,
				authorUserId: post.authorUserId,
				board: post.board,
				body: post.body,
				canDelete: isMine || profile.role === "admin",
				canEdit: isMine,
				commentCount: post.commentCount,
				createdAt: post.createdAt,
				id: post.id,
				isLiked: Boolean(like),
				isLocked: post.isLocked,
				likeCount: post.likeCount,
				locked: false as const,
				title: post.title,
				updatedAt: post.updatedAt,
				viewCount: post.viewCount + 1,
			};
		}),
```

7. `createPost` 교체(응답에서 passwordHash 비노출):

```ts
	createPost: protectedProcedure
		.input(createPostInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			assertTiptapDoc(input.body);

			const [created] = await db
				.insert(communityPost)
				.values({
					authorDisplayName: input.authorName,
					authorUserId: profile.userId,
					board: input.board,
					body: input.body,
					isLocked: input.isLocked,
					passwordHash: hashCommunityPassword(input.password),
					title: input.title,
				})
				.returning({ board: communityPost.board, id: communityPost.id });

			return created;
		}),
```

- [ ] **Step 5: 테스트 개정 (TDD — 신규 케이스 먼저 RED)**

`community.test.ts` 개정:
- 픽스처 헬퍼 추가 후 기존 `createPost(...)` 호출 전부에 스프레드:

```ts
const TIPTAP_BODY = JSON.stringify({
	content: [
		{
			content: [{ text: "본문입니다.", type: "text" }],
			type: "paragraph",
		},
	],
	type: "doc",
});

const basePostInput = {
	authorName: "달빛토끼",
	body: TIPTAP_BODY,
	isLocked: false,
	password: "pw1234",
};
// 사용 예: createPost({ ...basePostInput, board: "free", title: `... ${randomUUID()}` })
```

- 기존 케이스 기대값 수정: `summary?.authorName`은 이제 `basePostInput.authorName`("달빛토끼" — 프로필 displayName이 아니라 입력값), `createPost` 응답은 `{ id, board }`이므로 `created.id` 사용 유지·`created.updatedAt` 참조는 getPost 경유로 변경(Task 4의 updatedAt 비교 테스트).
- 신규 케이스 추가:

```ts
	it("잠긴 글은 타인 목록에서 제목이 마스킹되고, 비밀번호로 열람할 수 있다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const created = await createPost({
				...basePostInput,
				board: "free",
				isLocked: true,
				title: `비밀 제목 ${randomUUID()}`,
			});

			// 타인(admin 아님) 목록: 제목 마스킹 — adminUserId는 bypass라 femaleUser가 아닌 제3자 필요 없음:
			// admin은 실제 제목을 본다.
			const listAsAdmin = clientFor(
				communityRouter.listPosts,
				fixture.adminUserId,
				["listPosts"]
			);
			const adminList = await listAsAdmin({ board: "free", page: 1 });
			expect(
				adminList.items.find((item) => item.id === created.id)?.title
			).toContain("비밀 제목");

			const getAsOther = clientFor(
				communityRouter.getPost,
				fixture.otherFemaleUserId,
				["getPost"]
			);
			const lockedView = await getAsOther({ postId: created.id });
			expect(lockedView.locked).toBe(true);
			expect("body" in lockedView).toBe(false);

			await expectOrpcCode(
				getAsOther({ password: "wrong!", postId: created.id }),
				"FORBIDDEN"
			);

			const unlocked = await getAsOther({
				password: "pw1234",
				postId: created.id,
			});
			expect(unlocked.locked).toBe(false);
			if (unlocked.locked === false) {
				expect(unlocked.body).toBe(TIPTAP_BODY);
			}

			const listAsOther = clientFor(
				communityRouter.listPosts,
				fixture.otherFemaleUserId,
				["listPosts"]
			);
			const otherList = await listAsOther({ board: "free", page: 1 });
			expect(
				otherList.items.find((item) => item.id === created.id)?.title
			).toBe("비밀글입니다");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("본문이 Tiptap doc JSON이 아니면 BAD_REQUEST", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			await expectOrpcCode(
				createPost({
					...basePostInput,
					board: "free",
					body: "그냥 텍스트",
					title: `본문검증 ${randomUUID()}`,
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
```

- 픽스처에 `otherFemaleUserId`(gender female, job_seeker — 잠금 게이트 검증용 제3자) 추가: user·bambiProfile 시드와 `userIds`에 포함.

- [ ] **Step 6: 검증 + 커밋(컨트롤러)**

Run: `pnpm --filter @bambi-app/api test -- community` && `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-community-password.test.ts` && `pnpm --filter @bambi-app/api check-types`
Expected: 전부 PASS.

```
feat(api): 커뮤니티 글에 작성인·비밀번호·잠금 필드 추가
- community_post에 author_display_name·password_hash·is_locked 컬럼(0013 마이그레이션)
- 비밀번호 scrypt salt:hash 서비스(hash/verify, timingSafeEqual) + 단위 테스트
- createPost 입력 확장(작성인 1-30·비밀번호 4-30·잠금)과 Tiptap doc JSON 본문 검증
- 잠긴 글: 목록/오버뷰 제목 서버 마스킹(작성자·admin 제외), getPost는 locked 축소 응답→비밀번호 열람
- 작성자 표시를 프로필 조인에서 글별 author_display_name 컬럼으로 전환
```

---

## Task 4: API — 글 쓰기 계열 (updatePost·deletePost) + 권한 테스트

> **[개정 2026-07-15 — 이 블록이 아래 원본 코드와 충돌하면 이 블록이 우선]**
> Task 13의 클래식 보드 필드가 적용된 뒤 실행된다. 변경 사항:
> 1. `updatePostInput` 교체: `postIdInput.extend({ authorName: z.string().trim().min(1).max(30), body: z.string().min(2).max(30_000), isLocked: z.boolean(), password: z.string().max(30).optional(), title: z.string().trim().min(2).max(100) })`.
> 2. `updatePost` 권한: **작성자 본인 OR `input.password`가 `verifyCommunityPassword`로 일치**(admin이라도 작성자 아니고 비번 없으면 FORBIDDEN "본인이 작성한 글만 수정할 수 있습니다. 비밀번호를 확인해 주세요."). 본문은 `assertTiptapDoc(input.body)` 검증. set에 `authorDisplayName: input.authorName, isLocked: input.isLocked` 추가. 응답 `.returning({ board, id })`로 passwordHash 비노출.
> 3. `deletePost` input: `postIdInput.extend({ password: z.string().max(30).optional() })`. 권한: **작성자 OR admin OR 비밀번호 일치**.
> 4. 테스트 개정: 기존 케이스의 createPost 호출에 `...basePostInput` 적용. "admin 수정 시도 FORBIDDEN" 케이스는 비번 없이 시도로 유지. 추가 케이스: ① 타인이 **맞는 비밀번호**로 updatePost 성공, ② 타인이 틀린 비번으로 deletePost FORBIDDEN → 맞는 비번으로 성공. `updated.updatedAt` 비교는 updatePost 응답이 축소되므로 getPost 경유로 검증하거나 생략하고 title 반영 확인으로 대체.

**Files:**
- Modify: `packages/api/src/routers/bambi/community.ts`
- Test: `packages/api/src/routers/bambi/community.test.ts`

**Interfaces:**
- Consumes: `findPublishedPost`, `requireCommunityMember` (Task 2·3).
- Produces: `updatePost({ postId, title, body })` → 갱신 행. `deletePost({ postId })` → `{ id }`. 권한 위반 시 FORBIDDEN.

- [ ] **Step 1: 실패하는 테스트 추가**

`community.test.ts`에 describe 블록 추가:

```ts
describe("bambi community router — 글 수정·삭제", () => {
	it("남의 글은 수정할 수 없고, admin은 삭제만 할 수 있다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const created = await createPost({
				board: "free",
				body: "권한 테스트 본문입니다.",
				title: `권한 테스트 ${randomUUID()}`,
			});

			const updateAsAdmin = clientFor(
				communityRouter.updatePost,
				fixture.adminUserId,
				["updatePost"]
			);
			await expectOrpcCode(
				updateAsAdmin({
					body: "관리자 수정 시도",
					postId: created.id,
					title: "관리자 수정 시도",
				}),
				"FORBIDDEN"
			);

			const deleteAsAdmin = clientFor(
				communityRouter.deletePost,
				fixture.adminUserId,
				["deletePost"]
			);
			await deleteAsAdmin({ postId: created.id });

			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);
			await expectOrpcCode(getPost({ postId: created.id }), "NOT_FOUND");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("작성자는 수정할 수 있고 updatedAt이 갱신된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const updatePost = clientFor(
				communityRouter.updatePost,
				fixture.femaleUserId,
				["updatePost"]
			);
			const created = await createPost({
				board: "work_talk",
				body: "수정 전 본문입니다.",
				title: `수정 테스트 ${randomUUID()}`,
			});
			const updated = await updatePost({
				body: "수정 후 본문입니다.",
				postId: created.id,
				title: "수정된 제목",
			});
			expect(updated.title).toBe("수정된 제목");
			expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
				created.updatedAt.getTime()
			);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api test -- community`
Expected: FAIL — `updatePost`/`deletePost` 미정의.

- [ ] **Step 3: 구현**

`communityRouter`에 추가(Task 3 파일의 `updatePostInput` 사용):

```ts
	updatePost: protectedProcedure
		.input(updatePostInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const post = await findPublishedPost(input.postId);

			if (post.authorUserId !== profile.userId) {
				throw new ORPCError("FORBIDDEN", {
					message: "본인이 작성한 글만 수정할 수 있습니다.",
				});
			}

			const [updated] = await db
				.update(communityPost)
				.set({
					body: input.body,
					title: input.title,
					updatedAt: new Date(),
				})
				.where(eq(communityPost.id, input.postId))
				.returning();

			return updated;
		}),

	deletePost: protectedProcedure
		.input(postIdInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const post = await findPublishedPost(input.postId);

			if (post.authorUserId !== profile.userId && profile.role !== "admin") {
				throw new ORPCError("FORBIDDEN", {
					message: "본인이 작성한 글만 삭제할 수 있습니다.",
				});
			}

			await db
				.update(communityPost)
				.set({ status: "deleted", updatedAt: new Date() })
				.where(eq(communityPost.id, input.postId));

			return { id: post.id };
		}),
```

- [ ] **Step 4: 테스트 통과 확인 + 커밋**

Run: `pnpm --filter @bambi-app/api test -- community`
Expected: PASS.

```
feat(api): 커뮤니티 글 수정·삭제 추가
- updatePost는 작성자 본인만(관리자 불가), updatedAt 명시 갱신
- deletePost는 작성자 또는 admin, status=deleted 소프트 삭제
- 권한 거부·소프트 삭제 후 NOT_FOUND 통합 테스트
```

---

## Task 5: API — 추천·댓글 (toggleLike·listComments·createComment·deleteComment) + 신고 대상 확장

> **[개정 2026-07-15 — 이 블록이 아래 원본 코드와 충돌하면 이 블록이 우선]**
> 1. `toggleLike`·`listComments`·`createComment`의 input에 `password: z.string().max(30).optional()`을 추가하고, 각 핸들러에서 `findPublishedPost` 직후 `requirePostReadAccess(post, profile, input.password)`(Task 13 헬퍼)를 호출한다 — 잠긴 글은 열람 자격자만 댓글·추천 가능.
> 2. 테스트의 createPost 호출에 `...basePostInput` 적용(Task 13 픽스처). 추가 케이스 1개: 잠긴 글에 타인이 비번 없이 listComments → FORBIDDEN, 맞는 비번으로 → 성공.

**Files:**
- Modify: `packages/api/src/routers/bambi/community.ts`
- Modify: `packages/api/src/routers/bambi/moderation.ts:25-32` (`targetTypeSchema`)
- Test: `packages/api/src/routers/bambi/community.test.ts`

**Interfaces:**
- Produces:
  - `toggleLike({ postId })` → `{ isLiked: boolean, likeCount: number }`
  - `listComments({ postId })` → `{ authorName: string | null; authorUserId: string; body: string; canDelete: boolean; createdAt: Date; id: string }[]` (published, 오래된순, 최대 200)
  - `createComment({ postId, body 1–1000 })` → 생성 행. `deleteComment({ commentId: uuid })` → `{ id }`.
  - `moderation.createReport`가 `targetType: "community_post"` 수용.

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
describe("bambi community router — 추천·댓글", () => {
	it("추천 토글은 왕복하고 likeCount 캐시를 증감한다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const toggleLike = clientFor(
				communityRouter.toggleLike,
				fixture.adminUserId,
				["toggleLike"]
			);
			const created = await createPost({
				board: "free",
				body: "추천 테스트 본문입니다.",
				title: `추천 테스트 ${randomUUID()}`,
			});

			const liked = await toggleLike({ postId: created.id });
			expect(liked).toEqual({ isLiked: true, likeCount: 1 });
			const unliked = await toggleLike({ postId: created.id });
			expect(unliked).toEqual({ isLiked: false, likeCount: 0 });
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("추천된 글은 베스트 목록에 나타난다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const toggleLike = clientFor(
				communityRouter.toggleLike,
				fixture.adminUserId,
				["toggleLike"]
			);
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.femaleUserId,
				["listPosts"]
			);
			const created = await createPost({
				board: "free",
				body: "베스트 진입 테스트 본문입니다.",
				title: `베스트 테스트 ${randomUUID()}`,
			});
			await toggleLike({ postId: created.id });

			const best = await listPosts({ board: "best", page: 1 });
			expect(best.items.some((item) => item.id === created.id)).toBe(true);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("댓글 작성·삭제가 commentCount 캐시를 증감하고 남의 댓글 삭제는 거부된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const createComment = clientFor(
				communityRouter.createComment,
				fixture.adminUserId,
				["createComment"]
			);
			const listComments = clientFor(
				communityRouter.listComments,
				fixture.femaleUserId,
				["listComments"]
			);
			const deleteAsOther = clientFor(
				communityRouter.deleteComment,
				fixture.femaleUserId,
				["deleteComment"]
			);
			const deleteAsAuthor = clientFor(
				communityRouter.deleteComment,
				fixture.adminUserId,
				["deleteComment"]
			);
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);

			const created = await createPost({
				board: "market",
				body: "댓글 테스트 본문입니다.",
				title: `댓글 테스트 ${randomUUID()}`,
			});
			const comment = await createComment({
				body: "첫 댓글입니다.",
				postId: created.id,
			});

			const afterCreate = await getPost({ postId: created.id });
			expect(afterCreate.commentCount).toBe(1);
			const comments = await listComments({ postId: created.id });
			expect(comments).toHaveLength(1);
			expect(comments[0]?.canDelete).toBe(false);

			// femaleUser는 admin의 댓글을 지울 수 없다(글 작성자여도 불가).
			await expectOrpcCode(deleteAsOther({ commentId: comment.id }), "FORBIDDEN");
			await deleteAsAuthor({ commentId: comment.id });

			const afterDelete = await getPost({ postId: created.id });
			expect(afterDelete.commentCount).toBe(0);
			expect(await listComments({ postId: created.id })).toHaveLength(0);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api test -- community`
Expected: FAIL — `toggleLike` 등 미정의.

- [ ] **Step 3: 구현**

`communityRouter`에 추가(파일 상단 import에 `asc`, `communityComment`, `communityPostLike` 확인, `COMMENTS_CAP`·`createCommentInput` 사용):

```ts
	toggleLike: protectedProcedure
		.input(postIdInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			await findPublishedPost(input.postId);

			return await db.transaction(async (tx) => {
				const [existing] = await tx
					.select({ id: communityPostLike.id })
					.from(communityPostLike)
					.where(
						and(
							eq(communityPostLike.postId, input.postId),
							eq(communityPostLike.userId, profile.userId)
						)
					)
					.limit(1);

				if (existing) {
					await tx
						.delete(communityPostLike)
						.where(eq(communityPostLike.id, existing.id));
					const [updated] = await tx
						.update(communityPost)
						.set({
							likeCount: sql`greatest(${communityPost.likeCount} - 1, 0)`,
						})
						.where(eq(communityPost.id, input.postId))
						.returning({ likeCount: communityPost.likeCount });
					return { isLiked: false, likeCount: updated?.likeCount ?? 0 };
				}

				await tx.insert(communityPostLike).values({
					postId: input.postId,
					userId: profile.userId,
				});
				const [updated] = await tx
					.update(communityPost)
					.set({ likeCount: sql`${communityPost.likeCount} + 1` })
					.where(eq(communityPost.id, input.postId))
					.returning({ likeCount: communityPost.likeCount });
				return { isLiked: true, likeCount: updated?.likeCount ?? 0 };
			});
		}),

	listComments: protectedProcedure
		.input(postIdInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			await findPublishedPost(input.postId);

			const rows = await db
				.select({
					authorName: bambiProfile.displayName,
					authorUserId: communityComment.authorUserId,
					body: communityComment.body,
					createdAt: communityComment.createdAt,
					id: communityComment.id,
				})
				.from(communityComment)
				.leftJoin(
					bambiProfile,
					eq(bambiProfile.userId, communityComment.authorUserId)
				)
				.where(
					and(
						eq(communityComment.postId, input.postId),
						eq(communityComment.status, "published")
					)
				)
				.orderBy(asc(communityComment.createdAt))
				.limit(COMMENTS_CAP);

			return rows.map((row) => ({
				...row,
				canDelete:
					row.authorUserId === profile.userId || profile.role === "admin",
			}));
		}),

	createComment: protectedProcedure
		.input(createCommentInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			await findPublishedPost(input.postId);

			return await db.transaction(async (tx) => {
				const [created] = await tx
					.insert(communityComment)
					.values({
						authorUserId: profile.userId,
						body: input.body,
						postId: input.postId,
					})
					.returning();
				await tx
					.update(communityPost)
					.set({ commentCount: sql`${communityPost.commentCount} + 1` })
					.where(eq(communityPost.id, input.postId));
				return created;
			});
		}),

	deleteComment: protectedProcedure
		.input(z.object({ commentId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const [comment] = await db
				.select()
				.from(communityComment)
				.where(eq(communityComment.id, input.commentId))
				.limit(1);

			if (!comment || comment.status !== "published") {
				throw new ORPCError("NOT_FOUND", {
					message: "댓글을 찾을 수 없습니다.",
				});
			}
			if (
				comment.authorUserId !== profile.userId &&
				profile.role !== "admin"
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "본인이 작성한 댓글만 삭제할 수 있습니다.",
				});
			}

			await db.transaction(async (tx) => {
				await tx
					.update(communityComment)
					.set({ status: "deleted", updatedAt: new Date() })
					.where(eq(communityComment.id, input.commentId));
				await tx
					.update(communityPost)
					.set({
						commentCount: sql`greatest(${communityPost.commentCount} - 1, 0)`,
					})
					.where(eq(communityPost.id, comment.postId));
			});

			return { id: comment.id };
		}),
```

- [ ] **Step 4: 신고 대상 타입 확장**

`packages/api/src/routers/bambi/moderation.ts`의 `targetTypeSchema`(파일 상단 `z.enum`)에 `"community_post"` 추가:

```ts
const targetTypeSchema = z.enum([
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"user",
	"community_post",
]);
```

- [ ] **Step 5: 테스트 통과 확인 + 전체 회귀**

Run: `pnpm --filter @bambi-app/api test -- community`
Expected: PASS.
Run: `pnpm --filter @bambi-app/api test` && `pnpm --filter @bambi-app/api check-types`
Expected: 전체 PASS (moderation 테스트 포함 회귀 없음).

- [ ] **Step 6: 커밋**

```
feat(api): 커뮤니티 추천·댓글·신고 연계 추가
- toggleLike 트랜잭션 토글(+likeCount 캐시 증감, greatest 0 하한)
- listComments(published 오래된순 200캡)·createComment·deleteComment(+commentCount 캐시)
- 댓글 삭제는 댓글 작성자 또는 admin만(글 작성자 권한 없음)
- moderation.createReport targetType에 community_post 추가 — 기존 신고 파이프라인 재사용
```

---

## Task 6: 웹 lib — 게시판 메타·경로·포맷 유틸 (TDD)

**Files:**
- Create: `apps/web/src/lib/bambi/community.ts`
- Test: `apps/web/src/lib/bambi/community.test.ts`

**Interfaces:**
- Produces (화면 Task 8–11이 소비):
  - `type CommunityBoardKey = "best" | "free" | "work_talk" | "market"`
  - `interface CommunityBoardMeta { description: string; key: CommunityBoardKey; label: string; slug: string; writable: boolean }`
  - `COMMUNITY_BOARDS: CommunityBoardMeta[]` (베스트글/자유수다/일 이야기/중고거래 순)
  - `getBoardBySlug(slug: string): CommunityBoardMeta | undefined`
  - `getBoardByKey(key: CommunityBoardKey): CommunityBoardMeta`
  - `communityBoardPath(slug)`, `communityPostPath(slug, postId)`, `communityWritePath(slug)`, `communityEditPath(slug, postId)` → 문자열 경로
  - `formatCommunityDate(value: Date | string): string` — `YYYY.MM.DD`
  - `getCommunityTotalPages(totalCount: number, pageSize: number): number` — 최소 1
  - `getCommunityPageItems(current: number, total: number): (number | "ellipsis-start" | "ellipsis-end")[]` — 1 … c−1 c c+1 … total 윈도우
  - `COMMUNITY_AUTHOR_FALLBACK = "회원"`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/src/lib/bambi/community.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	COMMUNITY_BOARDS,
	communityPostPath,
	formatCommunityDate,
	getBoardBySlug,
	getCommunityPageItems,
	getCommunityTotalPages,
} from "./community";

describe("community boards meta", () => {
	it("slug로 게시판을 찾고 잘못된 slug는 undefined", () => {
		expect(getBoardBySlug("work-talk")?.key).toBe("work_talk");
		expect(getBoardBySlug("best")?.writable).toBe(false);
		expect(getBoardBySlug("nope")).toBeUndefined();
	});

	it("게시판은 베스트·자유·일·중고 4개다", () => {
		expect(COMMUNITY_BOARDS.map((board) => board.key)).toEqual([
			"best",
			"free",
			"work_talk",
			"market",
		]);
	});

	it("상세 경로를 만든다", () => {
		expect(communityPostPath("free", "abc")).toBe(
			"/seeker/community/free/abc"
		);
	});
});

describe("community list helpers", () => {
	it("날짜를 YYYY.MM.DD로 포맷한다", () => {
		expect(formatCommunityDate("2026-07-15T09:30:00.000Z")).toMatch(
			/^\d{4}\.\d{2}\.\d{2}$/
		);
		expect(formatCommunityDate(new Date(2026, 0, 5))).toBe("2026.01.05");
	});

	it("전체 페이지 수는 최소 1", () => {
		expect(getCommunityTotalPages(0, 20)).toBe(1);
		expect(getCommunityTotalPages(20, 20)).toBe(1);
		expect(getCommunityTotalPages(21, 20)).toBe(2);
	});

	it("페이지 아이템은 현재 주변 + 양 끝 + 말줄임으로 구성된다", () => {
		expect(getCommunityPageItems(1, 1)).toEqual([1]);
		expect(getCommunityPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
		expect(getCommunityPageItems(5, 9)).toEqual([
			1,
			"ellipsis-start",
			4,
			5,
			6,
			"ellipsis-end",
			9,
		]);
		expect(getCommunityPageItems(9, 9)).toEqual([
			1,
			"ellipsis-start",
			7,
			8,
			9,
		]);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter web test -- community`
Expected: FAIL — 모듈 없음. (web 테스트 스크립트가 없으면 `pnpm --filter web exec vitest run src/lib/bambi/community.test.ts`)

- [ ] **Step 3: 구현**

`apps/web/src/lib/bambi/community.ts`:

```ts
// 수다방 게시판 메타·경로·표시 유틸. 게시판 목록의 단일 진실원.
// key는 API enum(community_board + 가상 best), slug는 URL 세그먼트.

export type CommunityBoardKey = "best" | "free" | "work_talk" | "market";

export interface CommunityBoardMeta {
	description: string;
	key: CommunityBoardKey;
	label: string;
	slug: string;
	writable: boolean;
}

export const COMMUNITY_AUTHOR_FALLBACK = "회원";

export const COMMUNITY_BOARDS: CommunityBoardMeta[] = [
	{
		description: "최근 30일 동안 추천을 많이 받은 글",
		key: "best",
		label: "베스트글",
		slug: "best",
		writable: false,
	},
	{
		description: "밤비 회원들의 자유로운 이야기",
		key: "free",
		label: "자유수다",
		slug: "free",
		writable: true,
	},
	{
		description: "일·알바 경험과 정보를 나눠요",
		key: "work_talk",
		label: "일 이야기",
		slug: "work-talk",
		writable: true,
	},
	{
		description: "회원 간 중고 물품 거래",
		key: "market",
		label: "중고거래",
		slug: "market",
		writable: true,
	},
];

export const getBoardBySlug = (
	slug: string
): CommunityBoardMeta | undefined =>
	COMMUNITY_BOARDS.find((board) => board.slug === slug);

export const getBoardByKey = (key: CommunityBoardKey): CommunityBoardMeta => {
	const board = COMMUNITY_BOARDS.find((item) => item.key === key);
	if (!board) {
		throw new Error(`Unknown community board key: ${key}`);
	}
	return board;
};

export const communityBoardPath = (slug: string): string =>
	`/seeker/community/${slug}`;

export const communityPostPath = (slug: string, postId: string): string =>
	`/seeker/community/${slug}/${postId}`;

export const communityWritePath = (slug: string): string =>
	`/seeker/community/${slug}/write`;

export const communityEditPath = (slug: string, postId: string): string =>
	`/seeker/community/${slug}/${postId}/edit`;

const pad2 = (value: number): string =>
	value < 10 ? `0${value}` : String(value);

export const formatCommunityDate = (value: Date | string): string => {
	const date = new Date(value);
	return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
};

export const getCommunityTotalPages = (
	totalCount: number,
	pageSize: number
): number => Math.max(1, Math.ceil(totalCount / pageSize));

// 번호 페이지네이션 윈도우: 양 끝 + 현재±1, 간격은 말줄임 마커.
export const getCommunityPageItems = (
	current: number,
	total: number
): (number | "ellipsis-end" | "ellipsis-start")[] => {
	if (total <= 5) {
		return Array.from({ length: total }, (_, index) => index + 1);
	}

	const pages = new Set<number>([1, total]);
	for (let page = current - 1; page <= current + 1; page += 1) {
		if (page >= 1 && page <= total) {
			pages.add(page);
		}
	}

	const sorted = [...pages].sort((a, b) => a - b);
	const items: (number | "ellipsis-end" | "ellipsis-start")[] = [];
	for (const [index, page] of sorted.entries()) {
		const previous = sorted[index - 1];
		if (previous !== undefined && page - previous > 1) {
			items.push(page > current ? "ellipsis-end" : "ellipsis-start");
		}
		items.push(page);
	}
	return items;
};
```

- [ ] **Step 4: 테스트 통과 확인 + 커밋**

Run: `pnpm --filter web test -- community`
Expected: PASS.

```
feat(web): 커뮤니티 게시판 메타·경로·포맷 유틸 추가
- COMMUNITY_BOARDS 4종(베스트·자유·일·중고) 라벨/slug/writable 단일 진실원
- 경로 빌더·YYYY.MM.DD 포맷·페이지 수 계산·페이지 윈도우(getCommunityPageItems)
- 유틸 단위 테스트 동봉
```

---

## Task 7: packages/ui — shadcn pagination 추가·재테마

**Files:**
- Create: `packages/ui/src/components/pagination.tsx`

**Interfaces:**
- Produces: `Pagination`, `PaginationContent`, `PaginationEllipsis`, `PaginationItem`, `PaginationLink`, `PaginationNext`, `PaginationPrevious` — import 경로 `@bambi-app/ui/components/pagination`.

- [ ] **Step 1: shadcn add**

Run (repo 루트): `pnpm dlx shadcn@latest add pagination -c packages/ui`
주의(레포 관행): 파일이 레포 루트 등 엉뚱한 곳에 떨어질 수 있다 — 생성 위치를 확인하고 `packages/ui/src/components/pagination.tsx`로 이동. 의도치 않게 만들어진 루트 폴더는 삭제.

- [ ] **Step 2: 재테마·컨벤션 정리**

`pagination.tsx`에서 다음을 확인·수정:
- `rounded-none`·하드코딩 고밀도(`text-xs`)가 있으면 반경 토큰 유틸(`rounded-lg` 등)로 교체(레포의 base 컴포넌트 재테마 관행).
- 내부 `cn` import가 `@bambi-app/ui/lib/utils`(패키지 내 상대경로 `../lib/utils`)인지 확인 — 기존 `packages/ui/src/components/button.tsx`의 import 방식을 그대로 따른다.
- `PaginationLink`가 `buttonVariants`를 쓰면 기존 `button.tsx`의 export를 재사용.

- [ ] **Step 3: 검증 + 커밋**

Run: `pnpm --filter @bambi-app/ui check-types` (스크립트 없으면 `pnpm -w check-types`)
Expected: 통과.

```
feat(ui): shadcn pagination 컴포넌트 추가
- packages/ui/src/components/pagination.tsx — 번호 페이지네이션용
- 밤비 재테마 관행 적용(rounded-none 제거, 반경 토큰·기존 buttonVariants 재사용)
```

---

## Task 8: 웹 — 커뮤니티 홈 인덱스 화면

> **[개정 2026-07-15]** `OverviewPost`에 `isLocked: boolean` 추가. 잠긴 글 행은 제목 앞에 `LockIcon`(lucide, `size-3 text-muted-foreground`)을 표시한다(제목 마스킹은 서버가 처리하므로 그대로 렌더). authorName은 서버가 글별 작성인 컬럼 값을 내려주며 null이 아님 — 폴백 코드는 무해하니 유지 가능.

**Files:**
- Create: `apps/web/src/components/bambi/screens/community-home.tsx`
- Modify: `apps/web/src/app/seeker/community/page.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.community.overview`, `COMMUNITY_BOARDS`·경로·포맷 유틸(Task 6), `RequireCommunityAccess`, `SEEKER_CONTENT_WIDTH`, shadcn `Card`·`Skeleton`, `EmptyState`.
- Produces: `CommunityHomeScreen()` — client component.

- [ ] **Step 1: 홈 화면 작성**

`apps/web/src/components/bambi/screens/community-home.tsx`:

```tsx
"use client";

// 수다방 홈 — 게시판별 최신 글 미리보기 인덱스(레퍼런스: 커뮤니티 인덱스형 홈).

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, MessageSquareIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	COMMUNITY_AUTHOR_FALLBACK,
	COMMUNITY_BOARDS,
	type CommunityBoardKey,
	communityBoardPath,
	communityPostPath,
	formatCommunityDate,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

interface OverviewPost {
	authorName: string | null;
	board: "free" | "market" | "work_talk";
	commentCount: number;
	createdAt: Date | string;
	id: string;
	likeCount: number;
	title: string;
	viewCount: number;
}

// 게시판별 액센트 바 — visual-job-exposure-sections의 섹션 헤더 문법을 따른다.
const accentClassName: Record<CommunityBoardKey, string> = {
	best: "bg-coral-500",
	free: "bg-sky-400",
	market: "bg-green-500",
	work_talk: "bg-amber-500",
};

function BoardPreviewCard({
	boardKey,
	posts,
}: {
	boardKey: CommunityBoardKey;
	posts: OverviewPost[];
}) {
	const board = COMMUNITY_BOARDS.find((item) => item.key === boardKey);
	if (!board) {
		return null;
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="flex items-center gap-2 text-base">
					<span
						className={cn("h-4 w-1 rounded-full", accentClassName[boardKey])}
					/>
					{board.label}
				</CardTitle>
				<Link
					className="flex items-center gap-1 font-semibold text-muted-foreground text-xs hover:text-foreground"
					href={communityBoardPath(board.slug) as Route}
				>
					더보기
					<ChevronRightIcon className="size-3" />
				</Link>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{posts.length === 0 ? (
					<p className="m-0 py-3 text-muted-foreground text-sm">
						아직 글이 없어요. 첫 글을 남겨보세요.
					</p>
				) : (
					posts.map((post) => {
						const boardOfPost = COMMUNITY_BOARDS.find(
							(item) => item.key === post.board
						);
						return (
							<Link
								className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted"
								href={
									communityPostPath(
										boardOfPost?.slug ?? board.slug,
										post.id
									) as Route
								}
								key={post.id}
							>
								<span className="flex min-w-0 items-center gap-1.5">
									<span className="truncate text-sm">{post.title}</span>
									{post.commentCount > 0 ? (
										<span className="flex shrink-0 items-center gap-0.5 font-semibold text-coral-500 text-xs">
											<MessageSquareIcon className="size-3" />
											{post.commentCount}
										</span>
									) : null}
								</span>
								<span className="shrink-0 text-muted-foreground text-xs">
									{post.authorName ?? COMMUNITY_AUTHOR_FALLBACK} ·{" "}
									{formatCommunityDate(post.createdAt)}
								</span>
							</Link>
						);
					})
				)}
			</CardContent>
		</Card>
	);
}

function BoardPreviewSkeleton() {
	return (
		<Card>
			<CardHeader>
				<Skeleton className="h-5 w-24" />
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				<Skeleton className="h-5 w-full" />
				<Skeleton className="h-5 w-4/5" />
				<Skeleton className="h-5 w-3/5" />
			</CardContent>
		</Card>
	);
}

export function CommunityHomeScreen() {
	const overviewQuery = useQuery(orpc.bambi.community.overview.queryOptions());

	if (overviewQuery.isError) {
		return (
			<EmptyState
				className="flex-1"
				description="수다방 글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
				title="불러오기 실패"
			/>
		);
	}

	const data = overviewQuery.data;
	const postsByBoard: Record<CommunityBoardKey, OverviewPost[]> = {
		best: data?.best ?? [],
		free: data?.free ?? [],
		market: data?.market ?? [],
		work_talk: data?.workTalk ?? [],
	};

	return (
		<div className="flex flex-col gap-4">
			<h1 className="m-0 font-extrabold text-xl">수다방</h1>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{overviewQuery.isPending
					? COMMUNITY_BOARDS.map((board) => (
							<BoardPreviewSkeleton key={board.key} />
						))
					: COMMUNITY_BOARDS.map((board) => (
							<BoardPreviewCard
								boardKey={board.key}
								key={board.key}
								posts={postsByBoard[board.key]}
							/>
						))}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: 페이지 교체**

`apps/web/src/app/seeker/community/page.tsx` 전체 교체(컨테이너 폭을 `SEEKER_CONTENT_WIDTH`로 통일):

```tsx
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";
import { CommunityHomeScreen } from "@/components/bambi/screens/community-home";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

// 수다방 홈 — 여성회원·광고 중 업소만 입장(게이트는 RequireCommunityAccess + 서버 가드).
export default function SeekerCommunityPage() {
	return (
		<RequireCommunityAccess>
			<div
				className={`mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:px-6 ${SEEKER_CONTENT_WIDTH}`}
			>
				<CommunityHomeScreen />
			</div>
		</RequireCommunityAccess>
	);
}
```

- [ ] **Step 3: 검증 + 커밋**

Run: `pnpm --filter web check-types` && `pnpm dlx ultracite fix`
Expected: 통과(교정분 있으면 함께 커밋).

```
feat(web): 수다방 홈 인덱스 화면 구현
- EmptyState 자리표시자를 게시판별 최신글 4개 미리보기 그리드(모바일 1열·md 2열)로 교체
- 섹션 액센트 바·더보기 링크·댓글수 칩·작성자/날짜 메타, 로딩 스켈레톤·오류 EmptyState
- 컨테이너 폭 SEEKER_CONTENT_WIDTH로 통일
```

---

## Task 9: 웹 — 게시판 목록 화면 + 번호 페이지네이션

> **[개정 2026-07-15]** 목록 아이템에 `isLocked`가 내려온다. 잠긴 글 행은 제목 앞에 `LockIcon`(lucide, `size-3 text-muted-foreground shrink-0`) 표시(제목 마스킹은 서버 처리). 나머지는 원본대로.

**Files:**
- Create: `apps/web/src/components/bambi/screens/community-board.tsx`
- Create: `apps/web/src/app/seeker/community/[board]/page.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.community.listPosts`, Task 6 유틸, Task 7 pagination, `Button`·`Skeleton`·`Separator`, `EmptyState`.
- Produces: `CommunityBoardScreen({ boardSlug }: { boardSlug: string })`.

- [ ] **Step 1: 라우트 페이지 작성**

`apps/web/src/app/seeker/community/[board]/page.tsx` (동적 라우트는 client + `useParams` 관행 — `seeker/jobs/[id]/chat/page.tsx` 참조):

```tsx
"use client";

import { notFound, useParams } from "next/navigation";
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";
import { CommunityBoardScreen } from "@/components/bambi/screens/community-board";
import { getBoardBySlug } from "@/lib/bambi/community";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

export default function SeekerCommunityBoardPage() {
	const params = useParams<{ board: string }>();
	const board = getBoardBySlug(params.board);

	if (!board) {
		notFound();
	}

	return (
		<RequireCommunityAccess>
			<div
				className={`mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:px-6 ${SEEKER_CONTENT_WIDTH}`}
			>
				<CommunityBoardScreen boardSlug={params.board} />
			</div>
		</RequireCommunityAccess>
	);
}
```

- [ ] **Step 2: 목록 화면 작성**

`apps/web/src/components/bambi/screens/community-board.tsx`:

```tsx
"use client";

// 게시판 목록 — 글 행 리스트 + 번호 페이지네이션(?page= URL 동기화) + 글쓰기 버튼.

import { Button } from "@bambi-app/ui/components/button";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@bambi-app/ui/components/pagination";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
	EyeIcon,
	MessageSquareIcon,
	PencilLineIcon,
	ThumbsUpIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment } from "react";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	COMMUNITY_AUTHOR_FALLBACK,
	communityPostPath,
	communityWritePath,
	formatCommunityDate,
	getBoardBySlug,
	getCommunityPageItems,
	getCommunityTotalPages,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

export function CommunityBoardScreen({ boardSlug }: { boardSlug: string }) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const board = getBoardBySlug(boardSlug);
	const pageParam = Number(searchParams.get("page"));
	const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1;

	const listQuery = useQuery(
		orpc.bambi.community.listPosts.queryOptions({
			enabled: Boolean(board),
			input: { board: board?.key ?? "free", page },
		})
	);

	if (!board) {
		return null;
	}

	const goToPage = (nextPage: number) => {
		router.replace(`${pathname}?page=${nextPage}` as Route);
	};

	const totalPages = getCommunityTotalPages(
		listQuery.data?.totalCount ?? 0,
		listQuery.data?.pageSize ?? 20
	);
	const pageItems = getCommunityPageItems(page, totalPages);
	const items = listQuery.data?.items ?? [];

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="m-0 font-extrabold text-xl">{board.label}</h1>
					<p className="m-0 text-muted-foreground text-sm">
						{board.description}
					</p>
				</div>
				{board.writable ? (
					<Button
						render={
							<Link href={communityWritePath(board.slug) as Route}>
								<PencilLineIcon data-icon="inline-start" />
								글쓰기
							</Link>
						}
					/>
				) : null}
			</div>

			{listQuery.isPending ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
				</div>
			) : null}

			{listQuery.isError ? (
				<EmptyState
					className="flex-1"
					description="글 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{listQuery.isSuccess && items.length === 0 ? (
				<EmptyState
					className="flex-1"
					description={
						board.writable
							? "아직 글이 없어요. 첫 글을 남겨보세요."
							: "최근 30일 추천 글이 아직 없어요."
					}
					title="글이 없어요"
				/>
			) : null}

			{items.length > 0 ? (
				<div className="flex flex-col">
					{items.map((post, index) => (
						<Fragment key={post.id}>
							{index > 0 ? <Separator /> : null}
							<Link
								className="flex flex-col gap-1 rounded-lg px-2 py-3 hover:bg-muted"
								href={communityPostPath(board.slug, post.id) as Route}
							>
								<span className="flex min-w-0 items-center gap-1.5">
									<span className="truncate font-semibold text-sm">
										{post.title}
									</span>
									{post.commentCount > 0 ? (
										<span className="flex shrink-0 items-center gap-0.5 font-semibold text-coral-500 text-xs">
											<MessageSquareIcon className="size-3" />
											{post.commentCount}
										</span>
									) : null}
								</span>
								<span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
									<span>{post.authorName ?? COMMUNITY_AUTHOR_FALLBACK}</span>
									<span>{formatCommunityDate(post.createdAt)}</span>
									<span className="flex items-center gap-0.5">
										<EyeIcon className="size-3" />
										{post.viewCount}
									</span>
									<span className="flex items-center gap-0.5">
										<ThumbsUpIcon className="size-3" />
										{post.likeCount}
									</span>
								</span>
							</Link>
						</Fragment>
					))}
				</div>
			) : null}

			{listQuery.isSuccess && totalPages > 1 ? (
				<Pagination>
					<PaginationContent>
						<PaginationItem>
							<PaginationPrevious
								aria-disabled={page <= 1}
								className={page <= 1 ? "pointer-events-none opacity-50" : ""}
								onClick={() => goToPage(Math.max(1, page - 1))}
							/>
						</PaginationItem>
						{pageItems.map((item) =>
							typeof item === "number" ? (
								<PaginationItem key={item}>
									<PaginationLink
										isActive={item === page}
										onClick={() => goToPage(item)}
									>
										{item}
									</PaginationLink>
								</PaginationItem>
							) : (
								<PaginationItem key={item}>
									<PaginationEllipsis />
								</PaginationItem>
							)
						)}
						<PaginationItem>
							<PaginationNext
								aria-disabled={page >= totalPages}
								className={
									page >= totalPages ? "pointer-events-none opacity-50" : ""
								}
								onClick={() => goToPage(Math.min(totalPages, page + 1))}
							/>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			) : null}
		</div>
	);
}
```

주의: `PaginationLink`/`PaginationPrevious`가 shadcn 산출물에서 `<a>` 기반이면 `onClick` 대신 `href`(`as Route`)로 배선하는 편이 자연스럽다 — Task 7 산출물의 실제 시그니처에 맞춰 조정하되 페이지 이동은 반드시 `?page=` URL을 갱신한다. `Button`의 커스텀 엘리먼트는 base-ui라 `render` prop(asChild 금지).

- [ ] **Step 3: 검증 + 커밋**

Run: `pnpm --filter web check-types` && `pnpm dlx ultracite fix`
Expected: 통과.

```
feat(web): 커뮤니티 게시판 목록 화면 구현
- /seeker/community/[board] 라우트(slug 검증, 잘못된 slug는 notFound)
- 글 행 리스트(제목·댓글수 칩·작성자/날짜/조회/추천 메타)·로딩 스켈레톤·빈 상태
- 번호 페이지네이션 ?page= URL 동기화(getCommunityPageItems 윈도우)
- 쓰기 가능 게시판에만 글쓰기 primary 버튼
```

---

## Task 10: 웹 — 글 작성/수정 폼

> **[개정 2026-07-15 — 이 블록이 아래 원본 코드와 충돌하면 이 블록이 우선. 원본 코드는 레이아웃·뮤테이션 배선 참고용]**
>
> **A. Tiptap Simple Editor 도입 (사용자 명시 허용 의존성)**
> 1. apps/web에서 `pnpm dlx @tiptap/cli@latest add simple-editor` 실행(공식 Simple Editor 템플릿 — 컴포넌트·스타일·의존성 자동 추가). CLI 산출 위치를 확인하고 apps/web/src 아래 컨벤션에 맞는 위치(components/tiptap-*)인지 정리. CLI가 실패하면: `pnpm --filter web add @tiptap/react @tiptap/pm @tiptap/starter-kit` 후 StarterKit + 기본 툴바(굵게/기울임/리스트/링크)를 가진 간단한 에디터 컴포넌트를 직접 작성.
> 2. 스타일이 SCSS로 오면 `pnpm --filter web add -D sass` 허용(Tiptap 예외). CSS 전역 오염 최소화 확인. 다크모드에서 에디터 배경·글자색이 시맨틱 토큰과 어울리는지 확인.
> 3. 본문 값은 **Tiptap JSON 문자열**: 제출 시 `JSON.stringify(editor.getJSON())`, 초기값은 `JSON.parse(initialPost.body)`. 에디터가 비었는지 판정은 `editor.getText().trim().length >= 2`.
>
> **B. 폼 필드 5종** (위→아래 순): 작성인 `Input`(기본값 세션 프로필 displayName — `useBambiAuth`에 노출돼 있으면 사용, 없으면 `orpc.bambi.onboarding.getMine` 쿼리의 `bambiProfile.displayName`; 구현 시 실제 확인) · 비밀번호 `Input type="password"`(4자 미만이면 제출 비활성) · 글 잠금 `Switch` + Label("비밀글로 잠그기") · 제목 `Input` · 본문 Simple Editor.
>
> **C. 뮤테이션 입력**: createPost `{ authorName, board, body, isLocked, password, title }` / updatePost `{ postId, authorName, body, isLocked, title, password? }`. createPost 응답은 `{ id, board }` — 성공 시 상세로 이동은 `created.id` 그대로.
>
> **D. edit 흐름(비작성자 = 비밀번호 수정)**: edit 페이지는 `getPost({ postId })` 결과가 ① `canEdit: true`면 바로 폼 로드(비번 없이 제출), ② `locked: true`거나 `canEdit: false`면 비밀번호 입력 카드를 먼저 보여주고, 입력된 비번으로 `getPost({ postId, password })` 재조회 성공 시 폼 로드 + 그 비번을 updatePost에 함께 전달. 비번 불일치 FORBIDDEN은 토스트.
> **E. 검증**: `pnpm --filter web check-types` + `pnpm exec vitest run apps/web/src/lib/bambi/community.test.ts`(루트에서 — web에 test 스크립트 없음).

**Files:**
- Create: `apps/web/src/components/bambi/community-post-form.tsx`
- Create: `apps/web/src/app/seeker/community/[board]/write/page.tsx`
- Create: `apps/web/src/app/seeker/community/[board]/[postId]/edit/page.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.community.createPost/updatePost/getPost`, `queryClient`, Task 6 유틸, `Input`·`Textarea`·`Button`·`Label`.
- Produces: `CommunityPostForm({ board, initialPost }: { board: CommunityBoardMeta; initialPost?: { body: string; id: string; title: string } })`.

- [ ] **Step 1: 공용 폼 작성**

`apps/web/src/components/bambi/community-post-form.tsx`:

```tsx
"use client";

// 글 작성/수정 공용 폼. 컨트롤드 인풋(라이브러리 추가 금지) + 서버 검증 위임.

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { Route } from "next";
import {
	type CommunityBoardMeta,
	communityBoardPath,
	communityPostPath,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

const TITLE_MAX = 100;
const BODY_MAX = 5000;

interface CommunityPostFormProps {
	board: CommunityBoardMeta;
	initialPost?: { body: string; id: string; title: string };
}

export function CommunityPostForm({
	board,
	initialPost,
}: CommunityPostFormProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [title, setTitle] = useState(initialPost?.title ?? "");
	const [body, setBody] = useState(initialPost?.body ?? "");
	const isEdit = Boolean(initialPost);

	const invalidateAndGo = async (postId: string) => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.community.key(),
		});
		router.replace(communityPostPath(board.slug, postId) as Route);
	};

	const createMutation = useMutation(
		orpc.bambi.community.createPost.mutationOptions({
			onError: (error) => {
				toast(error.message || "글을 등록하지 못했어요.");
			},
			onSuccess: async (created) => {
				toast("글이 등록됐어요.");
				await invalidateAndGo(created.id);
			},
		})
	);
	const updateMutation = useMutation(
		orpc.bambi.community.updatePost.mutationOptions({
			onError: (error) => {
				toast(error.message || "글을 수정하지 못했어요.");
			},
			onSuccess: async (updated) => {
				toast("글이 수정됐어요.");
				await invalidateAndGo(updated.id);
			},
		})
	);

	const isSubmitting = createMutation.isPending || updateMutation.isPending;
	const canSubmit =
		title.trim().length >= 2 && body.trim().length >= 2 && !isSubmitting;

	const handleSubmit = () => {
		if (!canSubmit) {
			return;
		}
		if (isEdit && initialPost) {
			updateMutation.mutate({
				body: body.trim(),
				postId: initialPost.id,
				title: title.trim(),
			});
			return;
		}
		if (board.key === "best") {
			return;
		}
		createMutation.mutate({
			board: board.key,
			body: body.trim(),
			title: title.trim(),
		});
	};

	return (
		<div className="flex flex-col gap-4">
			<h1 className="m-0 font-extrabold text-xl">
				{board.label} {isEdit ? "글 수정" : "글쓰기"}
			</h1>
			<div className="flex flex-col gap-2">
				<Label htmlFor="community-post-title">제목</Label>
				<Input
					id="community-post-title"
					maxLength={TITLE_MAX}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="제목을 입력해 주세요 (2자 이상)"
					value={title}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="community-post-body">본문</Label>
				<Textarea
					className="min-h-48"
					id="community-post-body"
					maxLength={BODY_MAX}
					onChange={(event) => setBody(event.target.value)}
					placeholder="내용을 입력해 주세요 (2자 이상)"
					value={body}
				/>
				<p className="m-0 text-right text-muted-foreground text-xs">
					{body.length}/{BODY_MAX}
				</p>
			</div>
			<div className="flex justify-end gap-2">
				<Button
					onClick={() => router.push(communityBoardPath(board.slug) as Route)}
					variant="outline"
				>
					취소
				</Button>
				<Button disabled={!canSubmit} onClick={handleSubmit}>
					{isEdit ? "수정하기" : "등록하기"}
				</Button>
			</div>
		</div>
	);
}
```

주의: `board.key === "best"` 분기 때문에 `createPost`의 board 인자 타입이 안 맞으면 `board.key`를 `Exclude<CommunityBoardKey, "best">`로 좁히는 타입 가드를 lib에 추가한다(예: `isWritableBoardKey`).

- [ ] **Step 2: write 페이지**

`apps/web/src/app/seeker/community/[board]/write/page.tsx`:

```tsx
"use client";

import { notFound, useParams } from "next/navigation";
import { CommunityPostForm } from "@/components/bambi/community-post-form";
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";
import { getBoardBySlug } from "@/lib/bambi/community";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

export default function SeekerCommunityWritePage() {
	const params = useParams<{ board: string }>();
	const board = getBoardBySlug(params.board);

	if (!board || !board.writable) {
		notFound();
	}

	return (
		<RequireCommunityAccess>
			<div
				className={`mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:px-6 ${SEEKER_CONTENT_WIDTH}`}
			>
				<CommunityPostForm board={board} />
			</div>
		</RequireCommunityAccess>
	);
}
```

- [ ] **Step 3: edit 페이지**

`apps/web/src/app/seeker/community/[board]/[postId]/edit/page.tsx` — `getPost`로 초기값을 불러와 폼에 주입, `canEdit`가 아니면 상세로 되돌림:

```tsx
"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Route } from "next";
import { CommunityPostForm } from "@/components/bambi/community-post-form";
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";
import { communityPostPath, getBoardBySlug } from "@/lib/bambi/community";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import { orpc } from "@/utils/orpc";

export default function SeekerCommunityEditPage() {
	const params = useParams<{ board: string; postId: string }>();
	const router = useRouter();
	const board = getBoardBySlug(params.board);
	const postQuery = useQuery(
		orpc.bambi.community.getPost.queryOptions({
			enabled: Boolean(board),
			input: { postId: params.postId },
		})
	);

	useEffect(() => {
		if (postQuery.isSuccess && !postQuery.data.canEdit && board) {
			router.replace(communityPostPath(board.slug, params.postId) as Route);
		}
	}, [postQuery.isSuccess, postQuery.data, board, params.postId, router]);

	if (!board || !board.writable) {
		notFound();
	}

	return (
		<RequireCommunityAccess>
			<div
				className={`mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:px-6 ${SEEKER_CONTENT_WIDTH}`}
			>
				{postQuery.isPending ? (
					<Skeleton className="h-64 w-full" />
				) : null}
				{postQuery.isSuccess && postQuery.data.canEdit ? (
					<CommunityPostForm
						board={board}
						initialPost={{
							body: postQuery.data.body,
							id: postQuery.data.id,
							title: postQuery.data.title,
						}}
					/>
				) : null}
			</div>
		</RequireCommunityAccess>
	);
}
```

- [ ] **Step 4: 검증 + 커밋**

Run: `pnpm --filter web check-types` && `pnpm dlx ultracite fix`
Expected: 통과.

```
feat(web): 커뮤니티 글 작성·수정 폼 구현
- 컨트롤드 Input/Textarea 공용 폼(글자수 카운터·최소 길이 게이트·중복 제출 방지)
- write는 writable 게시판만(베스트글 notFound), edit은 canEdit 아닐 때 상세로 리다이렉트
- 성공 시 community 쿼리 무효화 후 상세로 이동, 실패는 서버 메시지 토스트
```

---

## Task 11: 웹 — 글 상세 화면 (댓글·추천·신고)

> **[개정 2026-07-15 — 이 블록이 아래 원본 코드와 충돌하면 이 블록이 우선. 원본 코드는 레이아웃·신고 다이얼로그·댓글 UI 참고용]**
> 1. **본문 렌더**: `whitespace-pre-wrap` 문단 대신 **read-only Tiptap**으로 렌더 — Task 10이 설치한 Simple Editor 기반으로 `editable: false`·툴바 없는 뷰어 컴포넌트(예: apps/web/src/components/bambi/community-post-body.tsx)를 만들어 `content: JSON.parse(post.body)`로 표시. `dangerouslySetInnerHTML` 금지. JSON.parse 실패 시 원문 텍스트 폴백.
> 2. **잠긴 글 흐름**: `getPost({ postId })` 응답이 `locked: true`면 본문 대신 비밀번호 입력 카드(Input type=password + "열람" Button) 표시 → `getPost({ postId, password })`로 재조회(react-query input에 password 포함, 상태로 유지). 불일치 FORBIDDEN은 토스트. 열람 성공 후 댓글 쿼리·추천/댓글 뮤테이션에 같은 password를 전달(`enabled: post?.locked === false`).
> 3. **삭제 버튼**: 모든 열람자에게 노출. `canDelete`(작성자·admin)면 확인 다이얼로그만, 아니면 비밀번호 입력 다이얼로그 → `deletePost({ postId, password })`. `window.confirm` 대신 shadcn Dialog 사용.
> 4. **수정 버튼**: 모든 열람자에게 노출, edit 페이지로 이동(비작성자 비번 검증은 Task 10의 edit 흐름이 담당).
> 5. 잠긴 글(`isLocked`)은 제목 옆 LockIcon 표시. 신고·댓글·추천 UI는 원본대로(댓글/추천 뮤테이션 input에 password 전달만 추가).

**Files:**
- Create: `apps/web/src/components/bambi/screens/community-post-detail.tsx`
- Create: `apps/web/src/app/seeker/community/[board]/[postId]/page.tsx`
- Create: `apps/web/src/lib/bambi/report-labels.ts`
- Modify: `apps/web/src/components/bambi/screens/my-reports-screen.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.community.getPost/listComments/toggleLike/createComment/deleteComment/deletePost`, `orpc.bambi.moderation.createReport`, Task 6 유틸, `Dialog`·`Select`·`Textarea`·`Button`·`Separator`·`Skeleton`.
- Produces: `CommunityPostDetailScreen({ boardSlug, postId })`, `REPORT_REASON_LABELS`·`REPORT_TARGET_TYPE_LABELS`·`ReportReason` (report-labels).

- [ ] **Step 1: 신고 라벨 공유화**

`apps/web/src/lib/bambi/report-labels.ts` — `my-reports-screen.tsx`의 로컬 상수를 승격:

```ts
// 신고 사유·대상 한국어 라벨. my-reports-screen과 커뮤니티 상세가 공유한다.
// enum 값은 packages/api moderation targetTypeSchema/reportReasonSchema와 일치해야 한다.

export type ReportReason =
	| "illegal_or_prohibited_content"
	| "coercion_or_safety"
	| "underage_concern"
	| "scam_or_fraud"
	| "harassment"
	| "misleading_job_information"
	| "other";

export type ReportTargetType =
	| "job_post"
	| "chat_room"
	| "chat_message"
	| "review"
	| "user"
	| "community_post";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
	illegal_or_prohibited_content: "불법·금지 콘텐츠",
	coercion_or_safety: "강요·안전 위협",
	underage_concern: "미성년 의심",
	scam_or_fraud: "사기·기만",
	harassment: "괴롭힘",
	misleading_job_information: "허위 공고 정보",
	other: "기타",
};

export const REPORT_TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
	job_post: "공고",
	chat_room: "채팅방",
	chat_message: "채팅 메시지",
	review: "후기",
	user: "사용자",
	community_post: "커뮤니티 글",
};
```

`my-reports-screen.tsx`에서 로컬 `ReportReason`/`ReportTargetType` 타입과 `REASON_LABELS`/`TARGET_TYPE_LABELS` 상수 정의를 삭제하고 위 모듈 임포트로 교체(식별자명은 임포트 별칭 `REASON_LABELS = REPORT_REASON_LABELS` 없이 사용처를 새 이름으로 갱신).

- [ ] **Step 2: 상세 화면 작성**

`apps/web/src/components/bambi/screens/community-post-detail.tsx`:

```tsx
"use client";

// 글 상세 — 본문·추천 토글·신고 다이얼로그·수정/삭제·평면 댓글.

import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@bambi-app/ui/components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronLeftIcon,
	EyeIcon,
	FlagIcon,
	ThumbsUpIcon,
	Trash2Icon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	COMMUNITY_AUTHOR_FALLBACK,
	communityBoardPath,
	communityEditPath,
	formatCommunityDate,
	getBoardBySlug,
} from "@/lib/bambi/community";
import {
	REPORT_REASON_LABELS,
	type ReportReason,
} from "@/lib/bambi/report-labels";
import { orpc } from "@/utils/orpc";

const COMMENT_MAX = 1000;

interface CommunityPostDetailScreenProps {
	boardSlug: string;
	postId: string;
}

export function CommunityPostDetailScreen({
	boardSlug,
	postId,
}: CommunityPostDetailScreenProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const board = getBoardBySlug(boardSlug);
	const [commentBody, setCommentBody] = useState("");
	const [reportOpen, setReportOpen] = useState(false);
	const [reportReason, setReportReason] = useState<ReportReason>("other");
	const [reportDetails, setReportDetails] = useState("");

	const postQuery = useQuery(
		orpc.bambi.community.getPost.queryOptions({ input: { postId } })
	);
	const commentsQuery = useQuery(
		orpc.bambi.community.listComments.queryOptions({ input: { postId } })
	);

	const invalidatePost = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.community.key(),
		});
	};

	const likeMutation = useMutation(
		orpc.bambi.community.toggleLike.mutationOptions({
			onError: (error) => toast(error.message || "추천하지 못했어요."),
			onSuccess: invalidatePost,
		})
	);
	const deletePostMutation = useMutation(
		orpc.bambi.community.deletePost.mutationOptions({
			onError: (error) => toast(error.message || "삭제하지 못했어요."),
			onSuccess: async () => {
				toast("글이 삭제됐어요.");
				await invalidatePost();
				router.replace(communityBoardPath(boardSlug) as Route);
			},
		})
	);
	const createCommentMutation = useMutation(
		orpc.bambi.community.createComment.mutationOptions({
			onError: (error) => toast(error.message || "댓글을 등록하지 못했어요."),
			onSuccess: async () => {
				setCommentBody("");
				await invalidatePost();
			},
		})
	);
	const deleteCommentMutation = useMutation(
		orpc.bambi.community.deleteComment.mutationOptions({
			onError: (error) => toast(error.message || "댓글을 삭제하지 못했어요."),
			onSuccess: invalidatePost,
		})
	);
	const reportMutation = useMutation(
		orpc.bambi.moderation.createReport.mutationOptions({
			onError: (error) => toast(error.message || "신고를 접수하지 못했어요."),
			onSuccess: () => {
				toast("신고가 접수됐어요.");
				setReportOpen(false);
				setReportDetails("");
			},
		})
	);

	if (postQuery.isPending) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-7 w-2/3" />
				<Skeleton className="h-4 w-1/3" />
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}

	if (postQuery.isError || !board) {
		return (
			<EmptyState
				className="flex-1"
				description="글이 삭제됐거나 불러올 수 없어요."
				title="글을 찾을 수 없어요"
			/>
		);
	}

	const post = postQuery.data;
	const comments = commentsQuery.data ?? [];
	const canSubmitComment =
		commentBody.trim().length >= 1 && !createCommentMutation.isPending;

	return (
		<div className="flex flex-col gap-4">
			<div>
				<Button
					render={
						<Link href={communityBoardPath(boardSlug) as Route}>
							<ChevronLeftIcon data-icon="inline-start" />
							{board.label}
						</Link>
					}
					size="sm"
					variant="ghost"
				/>
			</div>

			<div className="flex flex-col gap-2">
				<h1 className="m-0 font-extrabold text-xl">{post.title}</h1>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
					<span>{post.authorName ?? COMMUNITY_AUTHOR_FALLBACK}</span>
					<span>{formatCommunityDate(post.createdAt)}</span>
					<span className="flex items-center gap-0.5">
						<EyeIcon className="size-3" />
						{post.viewCount}
					</span>
					<span className="flex items-center gap-0.5">
						<ThumbsUpIcon className="size-3" />
						{post.likeCount}
					</span>
				</div>
			</div>

			<Separator />

			<p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">
				{post.body}
			</p>

			<div className="flex items-center justify-center py-2">
				<Button
					className={cn(post.isLiked && "border-coral-500 text-coral-500")}
					disabled={likeMutation.isPending}
					onClick={() => likeMutation.mutate({ postId })}
					variant="outline"
				>
					<ThumbsUpIcon data-icon="inline-start" />
					추천 {post.likeCount}
				</Button>
			</div>

			<div className="flex items-center justify-between">
				<Dialog onOpenChange={setReportOpen} open={reportOpen}>
					<DialogTrigger
						render={
							<Button size="sm" variant="ghost">
								<FlagIcon data-icon="inline-start" />
								신고
							</Button>
						}
					/>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>글 신고</DialogTitle>
							<DialogDescription>
								신고 사유를 선택해 주세요. 운영자가 확인 후 조치해요.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-3">
							<Select
								onValueChange={(value) =>
									setReportReason(value as ReportReason)
								}
								value={reportReason}
							>
								<SelectTrigger>
									<SelectValue placeholder="신고 사유" />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(REPORT_REASON_LABELS).map(
										([value, label]) => (
											<SelectItem key={value} value={value}>
												{label}
											</SelectItem>
										)
									)}
								</SelectContent>
							</Select>
							<Textarea
								maxLength={1000}
								onChange={(event) => setReportDetails(event.target.value)}
								placeholder="상세 내용(선택)"
								value={reportDetails}
							/>
						</div>
						<DialogFooter>
							<Button
								disabled={reportMutation.isPending}
								onClick={() =>
									reportMutation.mutate({
										details: reportDetails.trim() || undefined,
										reason: reportReason,
										targetId: postId,
										targetType: "community_post",
									})
								}
							>
								신고 접수
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<div className="flex items-center gap-2">
					{post.canEdit ? (
						<Button
							render={
								<Link href={communityEditPath(boardSlug, postId) as Route}>
									수정
								</Link>
							}
							size="sm"
							variant="outline"
						/>
					) : null}
					{post.canDelete ? (
						<Button
							disabled={deletePostMutation.isPending}
							onClick={() => {
								if (window.confirm("글을 삭제할까요?")) {
									deletePostMutation.mutate({ postId });
								}
							}}
							size="sm"
							variant="outline"
						>
							삭제
						</Button>
					) : null}
				</div>
			</div>

			<Separator />

			<div className="flex flex-col gap-3">
				<h2 className="m-0 font-bold text-base">
					댓글 {post.commentCount}
				</h2>
				{comments.map((comment) => (
					<div className="flex flex-col gap-1" key={comment.id}>
						<div className="flex items-center justify-between gap-2">
							<span className="font-semibold text-xs">
								{comment.authorName ?? COMMUNITY_AUTHOR_FALLBACK}
							</span>
							<span className="flex items-center gap-2 text-muted-foreground text-xs">
								{formatCommunityDate(comment.createdAt)}
								{comment.canDelete ? (
									<Button
										disabled={deleteCommentMutation.isPending}
										onClick={() =>
											deleteCommentMutation.mutate({
												commentId: comment.id,
											})
										}
										size="icon-sm"
										variant="ghost"
									>
										<Trash2Icon />
									</Button>
								) : null}
							</span>
						</div>
						<p className="m-0 whitespace-pre-wrap text-sm">{comment.body}</p>
					</div>
				))}
				<div className="flex flex-col gap-2">
					<Textarea
						maxLength={COMMENT_MAX}
						onChange={(event) => setCommentBody(event.target.value)}
						placeholder="댓글을 입력해 주세요"
						value={commentBody}
					/>
					<div className="flex justify-end">
						<Button
							disabled={!canSubmitComment}
							onClick={() =>
								createCommentMutation.mutate({
									body: commentBody.trim(),
									postId,
								})
							}
							size="sm"
						>
							댓글 등록
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
```

주의: `Button`의 `size="icon-sm"`·`variant` 값은 `packages/ui/src/components/button.tsx`의 실제 variant 목록에 맞춘다(없으면 `size="sm"` 대체). `window.confirm`이 lint에 걸리면 shadcn `Dialog` 확인 다이얼로그로 교체.

- [ ] **Step 3: 상세 라우트 페이지**

`apps/web/src/app/seeker/community/[board]/[postId]/page.tsx`:

```tsx
"use client";

import { notFound, useParams } from "next/navigation";
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";
import { CommunityPostDetailScreen } from "@/components/bambi/screens/community-post-detail";
import { getBoardBySlug } from "@/lib/bambi/community";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

export default function SeekerCommunityPostPage() {
	const params = useParams<{ board: string; postId: string }>();

	if (!getBoardBySlug(params.board)) {
		notFound();
	}

	return (
		<RequireCommunityAccess>
			<div
				className={`mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:px-6 ${SEEKER_CONTENT_WIDTH}`}
			>
				<CommunityPostDetailScreen
					boardSlug={params.board}
					postId={params.postId}
				/>
			</div>
		</RequireCommunityAccess>
	);
}
```

- [ ] **Step 4: 검증 + 커밋**

Run: `pnpm --filter web check-types` && `pnpm --filter web test` && `pnpm dlx ultracite fix`
Expected: 통과(my-reports-screen 라벨 이전 회귀 포함).

```
feat(web): 커뮤니티 글 상세 화면 구현
- 본문·메타·추천 토글(추천 시 코럴 하이라이트)·작성자 수정/삭제·뒤로가기
- 신고 Dialog: 기존 신고 사유 enum + community_post 대상으로 moderation.createReport 연계
- 평면 댓글 목록·작성·삭제(권한자만), 댓글 수 캐시 표시
- 신고 라벨을 lib/bambi/report-labels로 승격, my-reports-screen 임포트 전환 + 커뮤니티 글 라벨 추가
```

---

## Task 12: 마무리 — 전체 검증·사용자 확인

**Files:** (수정 없음 — 검증만)

- [ ] **Step 1: 전체 정적 검증**

Run: `pnpm dlx ultracite fix` → `pnpm -w check-types` (turbo 전체)
Expected: 통과. 교정분이 나오면 `style: ultracite 정렬` 커밋.

- [ ] **Step 2: 전체 테스트**

Run: `pnpm --filter @bambi-app/api test` && `pnpm --filter web test`
Expected: 전체 PASS.

- [ ] **Step 3: 커밋 로그 정리 확인**

Run: `git log --oneline feat/community..HEAD`
Expected: Task별 한국어 `type:` 커밋. 미커밋 변경 없음(`git status` clean).

- [ ] **Step 4: 사용자 확인 요청 (빌드/실행 금지 — 시각 확인은 사용자)**

사용자에게 보고: 브랜치·커밋 위치, 마이그레이션 적용 여부 재확인, dev 서버(HMR)에서 `/seeker/community` 홈 → 게시판 → 글쓰기 → 상세(추천·댓글·신고) 흐름 확인 요청. **push·PR·병합은 사용자 지시 대기.**

---

## Task 14: [개정2] 대댓글 — DB·API (1단계 답글)

> 2026-07-15 사용자 추가 요구. 전 태스크(1~13) 완료 후 실행. Step 1~2(스키마·마이그레이션)는 컨트롤러 담당.

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` — `communityComment.parentCommentId` (컨트롤러)
- Create: `packages/db/src/migrations/0014_*.sql` (컨트롤러 생성·적용)
- Modify: `packages/api/src/routers/bambi/community.ts`
- Modify: `packages/api/src/routers/bambi/community.test.ts`

**Interfaces:**
- Produces:
  - `createComment` input에 `parentCommentId?: uuid` — 부모는 **같은 글의 published 댓글**이어야 하고(위반 시 NOT_FOUND "답글을 달 댓글을 찾을 수 없습니다."), **부모가 이미 대댓글이면 BAD_REQUEST "답글에는 다시 답글을 달 수 없습니다."** (1단계 제한)
  - `listComments` 아이템: `{ id, parentCommentId: string | null, authorName, body, canDelete, createdAt, isDeleted: boolean }` — published 댓글 + **published 대댓글을 가진 deleted 부모는 플레이스홀더로 포함**(isDeleted: true, body "", authorName null, canDelete false). 정렬 오래된순, 캡 200 유지.
  - 대댓글 작성/삭제도 commentCount 캐시 ±1 동일.

- [ ] **Step 1 (컨트롤러): 스키마 컬럼**

`communityComment`의 `authorUserId` 다음에:

```ts
		// 대댓글(1단계). null이면 최상위 댓글. 1단계 제한은 API에서 강제한다.
		parentCommentId: uuid("parent_comment_id"),
```

self-FK는 drizzle 순환 참조 제약 때문에 테이블 콜백의 `foreignKey()` 헬퍼로 건다(또는 `references((): AnyPgColumn => communityComment.id, { onDelete: "cascade" })` — 타입 주석 필수). 인덱스 추가: `index("community_comment_parent_comment_id_idx").on(table.parentCommentId)`.

- [ ] **Step 2 (컨트롤러): 마이그레이션** — `pnpm db:generate`(0014: ADD COLUMN + FK + INDEX) → `pnpm db:migrate` → 커밋.

- [ ] **Step 3: TDD — 신규 테스트 (RED)**

`community.test.ts`에 describe 추가:

```ts
describe("bambi community router — 대댓글", () => {
	it("대댓글을 달 수 있고 listComments가 parentCommentId를 내려준다", async () => {
		// female이 글+댓글 생성 → admin이 그 댓글에 parentCommentId로 답글
		// listComments에서 답글 아이템의 parentCommentId === 부모 id, isDeleted === false 단언
	});

	it("대댓글에 다시 답글을 달면 BAD_REQUEST, 다른 글의 댓글을 부모로 지정하면 NOT_FOUND", async () => {});

	it("부모 댓글 삭제 후에도 published 대댓글이 있으면 부모가 isDeleted 플레이스홀더로 남는다", async () => {
		// 부모 삭제(작성자) → listComments: 부모 { isDeleted: true, body: "" } + 자식 유지 단언
		// 자식까지 삭제하면 부모 플레이스홀더도 사라짐 단언
	});
});
```

(기존 케이스의 createComment 호출은 parentCommentId 미전달로 그대로 동작해야 한다 — 하위호환.)

- [ ] **Step 4: 구현**

`createCommentInput`에 `parentCommentId: z.string().uuid().optional()` 추가. 핸들러의 `findPublishedPost`/`requirePostReadAccess` 다음에:

```ts
			if (input.parentCommentId) {
				const [parent] = await db
					.select({
						id: communityComment.id,
						parentCommentId: communityComment.parentCommentId,
						postId: communityComment.postId,
						status: communityComment.status,
					})
					.from(communityComment)
					.where(eq(communityComment.id, input.parentCommentId))
					.limit(1);

				if (
					parent?.status !== "published" ||
					parent.postId !== input.postId
				) {
					throw new ORPCError("NOT_FOUND", {
						message: "답글을 달 댓글을 찾을 수 없습니다.",
					});
				}
				if (parent.parentCommentId) {
					throw new ORPCError("BAD_REQUEST", {
						message: "답글에는 다시 답글을 달 수 없습니다.",
					});
				}
			}
```

insert values에 `parentCommentId: input.parentCommentId ?? null` 추가.

`listComments` 개정 — status 필터를 빼고 postId 전체를 가져와 플레이스홀더 정책 적용:

```ts
			const rows = await db
				.select({
					authorName: bambiProfile.displayName,
					authorUserId: communityComment.authorUserId,
					body: communityComment.body,
					createdAt: communityComment.createdAt,
					id: communityComment.id,
					parentCommentId: communityComment.parentCommentId,
					status: communityComment.status,
				})
				.from(communityComment)
				.leftJoin(
					bambiProfile,
					eq(bambiProfile.userId, communityComment.authorUserId)
				)
				.where(eq(communityComment.postId, input.postId))
				.orderBy(asc(communityComment.createdAt))
				.limit(COMMENTS_CAP);

			const liveParentIds = new Set(
				rows
					.filter((row) => row.status === "published" && row.parentCommentId)
					.map((row) => row.parentCommentId)
			);

			return rows
				.filter(
					(row) => row.status === "published" || liveParentIds.has(row.id)
				)
				.map((row) =>
					row.status === "published"
						? {
								authorName: row.authorName,
								body: row.body,
								canDelete:
									row.authorUserId === profile.userId ||
									profile.role === "admin",
								createdAt: row.createdAt,
								id: row.id,
								isDeleted: false,
								parentCommentId: row.parentCommentId,
							}
						: {
								authorName: null,
								body: "",
								canDelete: false,
								createdAt: row.createdAt,
								id: row.id,
								isDeleted: true,
								parentCommentId: row.parentCommentId,
							}
				);
```

(authorUserId는 응답에 미포함 유지 — 익명성 수정과 일관.)

- [ ] **Step 5: 검증 + 커밋(컨트롤러)** — community 테스트 전부 PASS + `pnpm --filter @bambi-app/api check-types`.

```
feat(api): 커뮤니티 대댓글(1단계) 추가
- community_comment에 parent_comment_id self-FK 컬럼(0014 마이그레이션)
- createComment parentCommentId 지원 — 같은 글 published 댓글만, 대댓글에 재답글 금지(1단계)
- listComments가 parentCommentId·isDeleted 동봉, 삭제된 부모는 published 답글이 있으면 플레이스홀더 유지
- 대댓글 왕복·제한·플레이스홀더 통합 테스트 추가
```

---

## Task 15: [개정2] 대댓글 — 웹 상세 화면

**Files:**
- Modify: `apps/web/src/components/bambi/screens/community-post-detail.tsx`
- Modify: `apps/web/src/components/bambi/community-post-detail-parts.tsx`

**Interfaces:**
- Consumes: Task 14의 `listComments` 아이템(`parentCommentId`·`isDeleted` 추가), `createComment`의 `parentCommentId?`.

- [ ] **Step 1: 그룹핑·렌더**

댓글 목록을 클라이언트에서 그룹핑: 최상위(`parentCommentId === null`) 순회, 각 항목 아래 `items.filter((c) => c.parentCommentId === parent.id)`를 들여쓰기 렌더(`pl-6`류 토큰 + `border-l` 또는 `CornerDownRightIcon` — 임의 px 금지). `isDeleted` 항목은 body 대신 muted 톤으로 "삭제된 댓글입니다" 표시(삭제 버튼·답글 버튼 없음).

- [ ] **Step 2: 답글 작성**

최상위 published 댓글에만 "답글" 버튼(ghost, sm) → 해당 댓글 아래 인라인 답글 폼(Textarea + 등록/취소, `replyTo: string | null` state 하나로 관리, 동시에 하나만 열림). 제출은 `createComment({ postId, body, password?, parentCommentId })`. 성공 시 기존 무효화 경로(listComments key + boards) + getPost commentCount +1 갱신(기존 bumpCommentCount 재사용). 대댓글에는 답글 버튼을 렌더하지 않는다(1단계).

- [ ] **Step 3: 검증 + 커밋(컨트롤러)** — `pnpm --filter web check-types` + 기존 lib 테스트 회귀.

```
feat(web): 커뮤니티 대댓글 UI 추가
- 댓글 목록 부모→자식 그룹핑, 대댓글 들여쓰기 렌더·삭제된 부모는 "삭제된 댓글입니다" 플레이스홀더
- 최상위 댓글에 답글 버튼 + 인라인 답글 폼(동시 1개), createComment parentCommentId 전달
- 대댓글은 답글 버튼 없음(1단계 제한)
```

---

## Self-Review 체크 결과

- 스펙 커버리지: 게시판 4종(가상 베스트 포함) T1/T3, 서버 자격 강제 T2, 번호 페이지네이션 T3/T6/T9, CRUD T3/T4/T10, 댓글 T5/T11, 추천 T5/T11, 신고 연계 T5/T11, 홈 인덱스 T8 — 스펙 §2 범위 전부 대응.
- 타입 일관성: `PostSummary`(T3) ↔ `OverviewPost`(T8) ↔ 목록 렌더 필드(T9) 동일 키. `getCommunityPageItems` 마커 문자열(T6 정의·T9 소비) 일치. `requireCommunityMember` 시그니처 T2 정의·T3~5 소비 일치.
- 알려진 조정 포인트(placeholder 아님, 실행 시 확인): shadcn pagination 산출물의 실제 prop(T7→T9), Button variant 목록(T11), web 테스트 실행 커맨드(`--filter web test` 스크립트 존재 여부).
