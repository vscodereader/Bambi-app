# 회원 탈퇴 (소프트 삭제 + 보존기간 후 파기 배치) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 계정 설정에서 회원 탈퇴(소프트 삭제)할 수 있고, 보존기간(운영자 설정, 기본 30일) 경과분은 운영자 배치가 개인정보를 파기한다.

**Architecture:** `user.deletedAt`으로 소프트 삭제를 표시하고 better-auth 세션 생성 훅으로 재로그인을 차단한다. 탈퇴 즉시 표시명을 "탈퇴한 회원"으로 스크럽해 모든 조회 화면이 수정 없이 익명 표시되게 한다(읽기 지점 40여 곳 무수정). 파기 배치는 user 행을 지우지 않고 PII 컬럼을 스크럽한다 — 채팅·리뷰·신고 등 상대방 데이터가 `user.id`를 onDelete 미지정(RESTRICT) FK로 참조하므로 행 삭제는 불가능하고, 스크럽이 상대방 기록도 보존한다. 보존기간은 기존 `bambi_site_settings` 단일 행에 컬럼을 추가해 운영자 사이트 설정 페이지에서 편집하며, 미설정(null)이면 코드 기본값 30일로 폴백한다.

**Tech Stack:** Drizzle(pg) · better-auth(databaseHooks) · oRPC · vitest(실 DB) · Next.js + shadcn/ui

## 사전 확정 사항 (브레인스토밍 결과)

- 조직 소유자(owner) 처리는 **범위 밖**(별도 이슈) — 소유자는 탈퇴를 차단하고 안내만 한다.
- "하드 삭제"는 **PII 스크럽 방식**으로 구현한다(행 삭제 아님). 근거: `packages/db/src/schema/bambi.ts`의 chatMessage·review·report 등 다수 FK가 onDelete 미지정이라 행 삭제는 실패하거나(RESTRICT) cascade 시 상대방 대화·리뷰까지 파괴된다.
- 보존기간은 **운영자가 사이트 설정에서 편집**한다(회원 정책 섹션). 미설정이면 기본 30일(`DEFAULT_WITHDRAWAL_RETENTION_DAYS`). 탈퇴 안내 카피도 설정값을 그대로 표시한다. 보존기간 중에는 email unique·ciHash/diHash unique가 그대로 남아 같은 이메일·같은 본인인증 재가입이 자동 차단되고, 파기 시 email이 tombstone으로 치환되며 해제된다.
- 파기 트리거: cron 인프라가 없으므로 운영자 전용 프로시저(`moderation.purgeWithdrawnAccounts`) 수동/외부 호출. 운영자 화면 버튼 연결은 후속.
- 개인정보 처리방침 개정(보유기간 명시)은 후속 — `LEGAL_CONSENT_VERSIONS` bump가 전 사용자 재동의를 유발하므로 사용자 결정 필요.

## Global Constraints

- 빌드(`npm run build` 등)·dev 서버 기동 금지. 테스트·타입체크·린트는 실행 가능. 시각 확인은 사용자가 한다.
- `db:push` 절대 금지. `db:generate`/`db:migrate`는 **사용자 명시 지시 후에만** 실행(적용 검증 필수) — Task 1 체크포인트.
- API 테스트는 `apps/server/.env`의 **실 개발 DB**를 사용한다. 시드는 afterEach에서 반드시 정리하고, organization·member 시드는 `createdAt`을 수동 지정한다(기본값 없음). `bambi_site_settings`는 실 운영 설정과 공유하는 **단일 행**이므로 테스트가 건드리면 반드시 백업·원복한다.
- 커밋 전 워크트리에서 `pnpm install` 1회 필요. 줄바꿈은 LF.
- 커밋 메시지: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿 본문(블릿 사이 빈 줄 없음). 멀티라인 메시지는 임시 파일 + `git commit -F`. push·PR 금지.
- 커밋 전 `pnpm dlx ultracite fix <수정 파일들>` 실행.
- web UI는 shadcn(`@bambi-app/ui/components`) + Tailwind만. 인라인 style 금지, 임의 px 금지, `flex flex-col gap-*`(space-y 금지), 이 레포 shadcn base는 base-ui(render prop, asChild 아님). primary 버튼은 주요 액션 한 곳만 — 탈퇴 버튼은 `variant="destructive"`.
- pnpm 필터명: api·db는 `@bambi-app/api`·`@bambi-app/db`(web/server는 scope 없음).

## File Structure

| 파일 | 작업 | 책임 |
|---|---|---|
| `packages/db/src/schema/auth.ts` | 수정 | user에 `deletedAt`·`purgedAt` 컬럼 |
| `packages/db/src/schema/bambi.ts` | 수정 | bambiSiteSettings에 `withdrawalRetentionDays` 컬럼 |
| `packages/db/src/migrations/*`(생성물) | 생성 | drizzle-kit generate 산출(사용자 지시 후) |
| `packages/auth/src/index.ts` | 수정 | 탈퇴 계정 로그인 차단 훅(databaseHooks) |
| `packages/api/src/services/bambi-policy.ts` | 수정 | `DEFAULT_WITHDRAWAL_RETENTION_DAYS` 상수 |
| `packages/api/src/services/bambi-member-policy.ts` | 생성 | 설정값+폴백 해석 헬퍼 `resolveWithdrawalRetentionDays` |
| `packages/api/src/routers/bambi/onboarding.ts` | 수정 | `withdrawMyAccount` 프로시저 |
| `packages/api/src/routers/bambi/withdraw-account.test.ts` | 생성 | 탈퇴 프로시저 테스트 |
| `packages/api/src/routers/bambi/moderation.ts` | 수정 | `purgeWithdrawnAccounts` 프로시저 |
| `packages/api/src/routers/bambi/purge-withdrawn-accounts.test.ts` | 생성 | 파기 배치 테스트 |
| `packages/api/src/routers/bambi/site-settings.ts` | 수정 | `getMemberPolicy`·`updateMemberPolicy` 프로시저 |
| `packages/api/src/routers/bambi/member-policy-settings.test.ts` | 생성 | 회원 정책 설정 테스트 |
| `apps/web/src/app/moderator/site-settings/page.tsx` | 수정 | 운영자 회원 정책 섹션(보존기간 편집) |
| `apps/web/src/components/bambi/withdraw-account-section.tsx` | 생성 | 탈퇴 섹션 + 확인 다이얼로그(공용, 보존기간 동적 표시) |
| `apps/web/src/components/bambi/screens/account-settings-screen.tsx` | 수정 | 구직자 계정 설정에 섹션 배치 |
| `apps/web/src/app/employer/settings/page.tsx` | 수정 | 구인자 설정에 섹션 배치 |

---

### Task 1: DB 스키마 — user.deletedAt / purgedAt + 사이트 설정 보존기간

**Files:**
- Modify: `packages/db/src/schema/auth.ts:11-22` (user 테이블)
- Modify: `packages/db/src/schema/bambi.ts:565-590` (bambiSiteSettings 테이블)

**Interfaces:**
- Produces: `user.deletedAt: timestamp | null`(탈퇴 시각·로그인 차단 기준·보존기간 기산점), `user.purgedAt: timestamp | null`(파기 완료 마커), `bambiSiteSettings.withdrawalRetentionDays: integer | null`(null=기본값 사용). 이후 모든 태스크가 이 컬럼들을 사용한다.

- [ ] **Step 1: 워크트리 의존성 설치**

Run: `pnpm install` (워크트리 루트에서, 커밋 훅 전제조건)

- [ ] **Step 2: user 테이블에 컬럼 추가**

`packages/db/src/schema/auth.ts`의 user 테이블 `updatedAt` 아래에 추가:

```ts
	// 회원 탈퇴(소프트 삭제) 시각. null이면 활성 계정. 값이 서면 로그인이 차단되고
	// 보존기간(운영자 설정, 기본 30일) 경과 후 파기 배치 대상이 된다.
	deletedAt: timestamp("deleted_at"),
	// 개인정보 파기(스크럽) 완료 시각. 파기 배치의 재처리 방지 마커.
	purgedAt: timestamp("purged_at"),
```

- [ ] **Step 3: bambiSiteSettings에 보존기간 컬럼 추가**

`packages/db/src/schema/bambi.ts`의 bambiSiteSettings 테이블 `bankAccounts` 아래에 추가(`integer`는 이미 import돼 있음):

```ts
	// 회원 탈퇴 후 개인정보 보존기간(일). 운영자 사이트 설정에서 편집한다.
	// null이면 코드 기본값(DEFAULT_WITHDRAWAL_RETENTION_DAYS=30)으로 폴백한다.
	withdrawalRetentionDays: integer("withdrawal_retention_days"),
```

- [ ] **Step 4: 타입체크**

Run: `pnpm --filter @bambi-app/db check-types`
Expected: 통과

- [ ] **Step 5: 체크포인트 — 마이그레이션 생성·적용은 사용자 지시 필요**

사용자에게 보고: "user 테이블에 deleted_at·purged_at, bambi_site_settings에 withdrawal_retention_days 컬럼을 추가했습니다. `pnpm --filter @bambi-app/db db:generate` → `db:migrate` 실행 지시를 주시면 진행합니다." 지시를 받으면 실행 후 SQL로 적용 검증(`SELECT column_name FROM information_schema.columns WHERE table_name IN ('user','bambi_site_settings')`). **마이그레이션이 실 DB에 적용되기 전에는 (1) Task 4~6 테스트가 실패하고, (2) 이 브랜치가 사용자의 상시 실행 dev 서버에 반영되는 순간 drizzle이 새 컬럼을 SELECT 목록에 포함해 user·사이트 설정을 읽는 기존 기능(로그인·프로필·푸터 등)까지 깨질 수 있다. 반드시 적용 확인 후 다음 태스크로 진행한다.**

- [ ] **Step 6: 커밋**

```
feat(db): 회원 탈퇴 소프트 삭제·파기 시각과 보존기간 설정 컬럼 추가
- user 테이블에 deleted_at(탈퇴 시각)·purged_at(개인정보 파기 시각) nullable 컬럼 추가
- deleted_at은 로그인 차단과 보존기간 기산점, purged_at은 파기 배치 재처리 방지 마커
- bambi_site_settings에 withdrawal_retention_days 추가 — 운영자 편집, null이면 기본 30일 폴백
```

(마이그레이션 파일이 생성돼 있으면 함께 커밋)

---

### Task 2: 보존기간 기본값 상수 + 해석 헬퍼

**Files:**
- Modify: `packages/api/src/services/bambi-policy.ts:14` 근처
- Create: `packages/api/src/services/bambi-member-policy.ts`

**Interfaces:**
- Consumes: `bambiSiteSettings.withdrawalRetentionDays` (Task 1)
- Produces: `DEFAULT_WITHDRAWAL_RETENTION_DAYS = 30`(순수 상수, bambi-policy), `resolveWithdrawalRetentionDays(): Promise<number>`(설정값 조회 + 폴백, bambi-member-policy) — Task 5 파기 배치와 Task 6 설정 API가 사용한다.

- [ ] **Step 1: 기본값 상수 추가**

`packages/api/src/services/bambi-policy.ts`의 `accountStatuses` 선언 아래에(이 파일은 DB 미접근 순수 정책 파일이므로 상수만 둔다):

```ts
// 탈퇴 계정 개인정보 보존기간 기본값(일). 실제 적용값은 운영자 사이트 설정
// (bambi_site_settings.withdrawal_retention_days)이 우선하고, 미설정이면 이 값을 쓴다.
// 해석은 bambi-member-policy의 resolveWithdrawalRetentionDays가 담당한다.
export const DEFAULT_WITHDRAWAL_RETENTION_DAYS = 30;
```

- [ ] **Step 2: 해석 헬퍼 서비스 생성**

`packages/api/src/services/bambi-member-policy.ts`:

```ts
import { db } from "@bambi-app/db";
import { bambiSiteSettings } from "@bambi-app/db/schema/bambi";
import { eq } from "drizzle-orm";

import { DEFAULT_WITHDRAWAL_RETENTION_DAYS } from "./bambi-policy";

// 사이트 설정은 고정 키 "default" 단일 행이다(site-settings 라우터와 동일 규약).
const SETTINGS_ROW_ID = "default";

// 탈퇴 개인정보 보존기간(일) 해석 — 운영자 설정값이 있으면 그 값, 없으면 기본값.
// 파기 배치와 회원 정책 조회 API가 같은 값을 보도록 이 함수만 경유한다.
export const resolveWithdrawalRetentionDays = async (): Promise<number> => {
	const [row] = await db
		.select({ days: bambiSiteSettings.withdrawalRetentionDays })
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
		.limit(1);
	return row?.days ?? DEFAULT_WITHDRAWAL_RETENTION_DAYS;
};
```

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: 통과 (커밋은 Task 6에서 설정 API와 함께)

---

### Task 3: 탈퇴 계정 로그인 차단 훅

**Files:**
- Modify: `packages/auth/src/index.ts`

**Interfaces:**
- Consumes: `user.deletedAt` (Task 1)
- Produces: 로그인(세션 생성) 시 deletedAt 계정 차단. 자동화 테스트 없음(5줄 훅, better-auth 전체 플로우 기동 비용 과다) — **수동 확인 항목**으로 사용자에게 안내: 탈퇴 계정으로 로그인 시도 → "탈퇴한 계정이에요" 에러.

- [ ] **Step 1: import 추가**

```ts
import { APIError } from "better-auth/api";
```

(`user`는 이미 import돼 있음. `db.query` 콜백 연산자를 쓰므로 drizzle-orm 의존성 추가 불필요.)

- [ ] **Step 2: betterAuth 옵션에 databaseHooks 추가**

`plugins: [...]` 위에:

```ts
		// 로그인은 어떤 방식이든 세션 생성을 지나므로 여기서 탈퇴 계정을 차단한다.
		// 탈퇴 시 기존 세션은 전부 삭제되지만, 보존기간 동안 이메일·비밀번호가 남아
		// 있어 재로그인을 막는 최종 관문이 필요하다.
		databaseHooks: {
			session: {
				create: {
					before: async (sessionData) => {
						const target = await db.query.user.findFirst({
							columns: { deletedAt: true },
							where: (fields, operators) =>
								operators.eq(fields.id, sessionData.userId),
						});
						if (target?.deletedAt) {
							throw new APIError("FORBIDDEN", {
								message: "탈퇴한 계정이에요. 로그인할 수 없어요.",
							});
						}
						return { data: sessionData };
					},
				},
			},
		},
```

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter @bambi-app/auth check-types`
Expected: 통과. (better-auth의 `before` 반환 계약은 `{ data }` 또는 throw — 타입 에러가 나면 `sessionData` 파라미터에 명시 타입을 붙이지 말고 추론에 맡긴 채 반환형만 맞춘다.)

- [ ] **Step 4: 커밋**

```
feat(auth): 탈퇴 계정 로그인 차단 훅 추가
- 세션 생성 databaseHooks에서 user.deleted_at 계정의 로그인을 FORBIDDEN으로 차단
- 탈퇴 시 세션 전삭제 이후 보존기간 중 재로그인을 막는 최종 관문
```

---

### Task 4: withdrawMyAccount 프로시저 (TDD)

**Files:**
- Test: `packages/api/src/routers/bambi/withdraw-account.test.ts` (생성)
- Modify: `packages/api/src/routers/bambi/onboarding.ts`

**Interfaces:**
- Consumes: `user.deletedAt` (Task 1)
- Produces: `orpc.bambi.onboarding.withdrawMyAccount` — 입력 없음, 반환 `{ ok: true }`. 오류: 조직 소유자면 `CONFLICT`("조직 소유자는 바로 탈퇴할 수 없어요...").

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/routers/bambi/withdraw-account.test.ts` (기존 `verify-phone-duplicate.test.ts` 패턴 준수 — 실 DB + afterEach 정리):

```ts
import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { onboardingRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./onboarding"),
	]);

const { member, organization, session, user } = authSchema;
const { bambiProfile } = bambiSchema;

const createdUserIds: string[] = [];
const createdOrganizationIds: string[] = [];
afterEach(async () => {
	for (const id of createdUserIds.splice(0)) {
		await db.delete(user).where(eq(user.id, id));
	}
	for (const id of createdOrganizationIds.splice(0)) {
		await db.delete(organization).where(eq(organization.id, id));
	}
});

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const withdrawClient = (userId: string) =>
	createProcedureClient(onboardingRouter.withdrawMyAccount, {
		context: ctx(userId),
		path: ["bambi", "onboarding", "withdrawMyAccount"],
	});

const seedUser = async () => {
	const userId = `user_withdraw_${randomUUID()}`;
	createdUserIds.push(userId);
	await db.insert(user).values({
		id: userId,
		name: "탈퇴대상",
		email: `${userId}@bambi.test`,
	});
	await db.insert(bambiProfile).values({
		userId,
		role: "job_seeker",
		displayName: "탈퇴대상",
		phoneNumber: "010-1111-2222",
	});
	return userId;
};

// session.updatedAt·expiresAt은 기본값이 없어 수동 지정이 필요하다.
const seedSession = async (userId: string) => {
	await db.insert(session).values({
		id: `session_${randomUUID()}`,
		token: `token_${randomUUID()}`,
		userId,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		updatedAt: new Date(),
	});
};

// organization·member는 createdAt 기본값이 없어 수동 지정이 필요하다.
const seedMembership = async (userId: string, role: "member" | "owner") => {
	const organizationId = `org_withdraw_${randomUUID()}`;
	createdOrganizationIds.push(organizationId);
	await db.insert(organization).values({
		id: organizationId,
		name: "탈퇴테스트조직",
		slug: `withdraw-${randomUUID().slice(0, 8)}`,
		createdAt: new Date(),
	});
	await db.insert(member).values({
		id: `member_${randomUUID()}`,
		organizationId,
		userId,
		role,
		createdAt: new Date(),
	});
};

describe("withdrawMyAccount 회원 탈퇴", () => {
	it("탈퇴하면 소프트 삭제·즉시 익명화·세션과 멤버십 정리가 이뤄진다", async () => {
		const userId = await seedUser();
		await seedSession(userId);
		await seedMembership(userId, "member");

		const result = await withdrawClient(userId)();
		expect(result.ok).toBe(true);

		const [updatedUser] = await db
			.select()
			.from(user)
			.where(eq(user.id, userId));
		expect(updatedUser?.deletedAt).not.toBeNull();
		expect(updatedUser?.name).toBe("탈퇴한 회원");

		const [profile] = await db
			.select()
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, userId));
		expect(profile?.displayName).toBe("탈퇴한 회원");
		// 개인정보는 보존기간 동안 유지된다 — 파기는 배치가 한다.
		expect(profile?.phoneNumber).toBe("010-1111-2222");

		const sessions = await db
			.select()
			.from(session)
			.where(eq(session.userId, userId));
		expect(sessions).toHaveLength(0);

		const memberships = await db
			.select()
			.from(member)
			.where(eq(member.userId, userId));
		expect(memberships).toHaveLength(0);
	});

	it("조직 소유자는 탈퇴가 차단된다", async () => {
		const userId = await seedUser();
		await seedMembership(userId, "owner");

		await expect(withdrawClient(userId)()).rejects.toThrow("조직 소유자");

		const [row] = await db.select().from(user).where(eq(user.id, userId));
		expect(row?.deletedAt).toBeNull();
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api test src/routers/bambi/withdraw-account.test.ts`
Expected: FAIL — `withdrawMyAccount` 미정의(프로퍼티 없음)

- [ ] **Step 3: 프로시저 구현**

`packages/api/src/routers/bambi/onboarding.ts`:

import 수정 — schema/auth import에 `session as sessionTable`, `user` 추가, drizzle-orm import에 `isNull` 추가:

```ts
import {
	member,
	organization,
	session as sessionTable,
	team,
	teamMember,
	user,
} from "@bambi-app/db/schema/auth";
```

```ts
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
```

`onboardingRouter`에 프로시저 추가(`recordLegalConsent` 아래 등 아무 위치):

```ts
	// 회원 탈퇴(소프트 삭제). 조직 소유자는 소유권 정리 전까지 차단한다(조직 처리는
	// 별도 이슈). deletedAt만 세우고 개인정보는 보존기간 동안 유지한다 — 파기는
	// 운영자 배치(moderation.purgeWithdrawnAccounts)가 보존기간 경과분만 수행한다.
	// 표시명은 즉시 "탈퇴한 회원"으로 바꿔 채팅·리뷰 등 상대 화면이 바로 익명화된다.
	withdrawMyAccount: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;

		const memberships = await db
			.select({ role: member.role })
			.from(member)
			.where(eq(member.userId, userId));
		if (memberships.some((row) => row.role === "owner")) {
			throw new ORPCError("CONFLICT", {
				message:
					"조직 소유자는 바로 탈퇴할 수 없어요. 소유권 이전 또는 조직 정리 후 다시 시도해 주세요.",
			});
		}

		await db.transaction(async (tx) => {
			// isNull 가드로 중복 호출을 no-op으로 만든다(멱등).
			await tx
				.update(user)
				.set({ deletedAt: new Date(), name: "탈퇴한 회원" })
				.where(and(eq(user.id, userId), isNull(user.deletedAt)));
			await tx
				.update(bambiProfile)
				.set({ displayName: "탈퇴한 회원" })
				.where(eq(bambiProfile.userId, userId));
			await tx.delete(teamMember).where(eq(teamMember.userId, userId));
			await tx.delete(member).where(eq(member.userId, userId));
			// 전 기기 세션을 지워 즉시 접근을 끊는다. 재로그인은 auth 훅이 차단.
			await tx.delete(sessionTable).where(eq(sessionTable.userId, userId));
		});

		return { ok: true } as const;
	}),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test src/routers/bambi/withdraw-account.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 린트 후 커밋**

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/onboarding.ts packages/api/src/routers/bambi/withdraw-account.test.ts`

```
feat(api): 회원 탈퇴(소프트 삭제) 프로시저 추가
- onboarding.withdrawMyAccount — deletedAt 설정·표시명 즉시 익명화·전 세션 삭제·조직 멤버십 정리
- 조직 소유자는 CONFLICT로 차단(소유권 처리는 별도 이슈)
- 개인정보는 보존기간 동안 유지, 파기는 운영자 배치가 담당
- 실 DB 테스트 2건(성공 경로·소유자 차단) 추가
```

---

### Task 5: purgeWithdrawnAccounts 파기 배치 (TDD)

**Files:**
- Test: `packages/api/src/routers/bambi/purge-withdrawn-accounts.test.ts` (생성)
- Modify: `packages/api/src/routers/bambi/moderation.ts`

**Interfaces:**
- Consumes: `user.deletedAt`·`user.purgedAt` (Task 1), `resolveWithdrawalRetentionDays` (Task 2)
- Produces: `orpc.bambi.moderation.purgeWithdrawnAccounts` — 운영자 전용(adminProcedure), 입력 없음, 반환 `{ purgedCount: number }`.

**주의:** 이 테스트는 실 개발 DB에서 파기 배치를 실제로 돌린다. 현재 탈퇴 기능이 처음 들어가므로 기존 데이터에 deletedAt 계정이 없어 안전하지만, 실행 전 `SELECT count(*) FROM "user" WHERE deleted_at IS NOT NULL`로 0인지 확인한다. 테스트는 기본 보존기간(30일) 전제 — 사이트 설정에 커스텀 보존기간이 저장돼 있으면(개발 DB에선 아직 없음) 시드 일수를 조정해야 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/routers/bambi/purge-withdrawn-accounts.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { moderationRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./moderation"),
	]);

const { account, user } = authSchema;
const { bambiProfile } = bambiSchema;

const DAY_MS = 24 * 60 * 60 * 1000;

const createdUserIds: string[] = [];
afterEach(async () => {
	for (const id of createdUserIds.splice(0)) {
		await db.delete(user).where(eq(user.id, id));
	}
});

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const purgeClient = (adminUserId: string) =>
	createProcedureClient(moderationRouter.purgeWithdrawnAccounts, {
		context: ctx(adminUserId),
		path: ["bambi", "moderation", "purgeWithdrawnAccounts"],
	});

const seedAdmin = async () => {
	const userId = `user_purge_admin_${randomUUID()}`;
	createdUserIds.push(userId);
	await db.insert(user).values({
		id: userId,
		name: "운영자",
		email: `${userId}@bambi.test`,
	});
	await db
		.insert(bambiProfile)
		.values({ userId, role: "admin", displayName: "운영자" });
	return userId;
};

const seedWithdrawnUser = async (daysAgo: number) => {
	const userId = `user_purge_${randomUUID()}`;
	createdUserIds.push(userId);
	await db.insert(user).values({
		id: userId,
		name: "탈퇴한 회원",
		email: `${userId}@bambi.test`,
		deletedAt: new Date(Date.now() - daysAgo * DAY_MS),
	});
	await db.insert(bambiProfile).values({
		userId,
		role: "job_seeker",
		displayName: "탈퇴한 회원",
		phoneNumber: "010-2222-3333",
		birthDate: "19900101",
		ciHash: `ci-${randomUUID()}`,
		diHash: `di-${randomUUID()}`,
		isPhoneVerified: true,
	});
	// account.updatedAt은 기본값이 없어 수동 지정이 필요하다.
	await db.insert(account).values({
		id: `account_${randomUUID()}`,
		accountId: userId,
		providerId: "credential",
		userId,
		password: "hashed-password",
		updatedAt: new Date(),
	});
	return userId;
};

describe("purgeWithdrawnAccounts 개인정보 파기 배치", () => {
	it("보존기간 경과분만 파기하고 최근 탈퇴자는 남긴다", async () => {
		const adminId = await seedAdmin();
		const oldUserId = await seedWithdrawnUser(31);
		const recentUserId = await seedWithdrawnUser(1);

		const result = await purgeClient(adminId)();
		expect(result.purgedCount).toBeGreaterThanOrEqual(1);

		const [purged] = await db
			.select()
			.from(user)
			.where(eq(user.id, oldUserId));
		expect(purged?.email).toBe(`withdrawn-${oldUserId}@invalid.bambi`);
		expect(purged?.purgedAt).not.toBeNull();

		const [purgedProfile] = await db
			.select()
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, oldUserId));
		expect(purgedProfile?.phoneNumber).toBeNull();
		expect(purgedProfile?.birthDate).toBeNull();
		expect(purgedProfile?.ciHash).toBeNull();
		expect(purgedProfile?.diHash).toBeNull();
		expect(purgedProfile?.isPhoneVerified).toBe(false);

		const accounts = await db
			.select()
			.from(account)
			.where(eq(account.userId, oldUserId));
		expect(accounts).toHaveLength(0);

		const [recent] = await db
			.select()
			.from(user)
			.where(eq(user.id, recentUserId));
		expect(recent?.email).toBe(`${recentUserId}@bambi.test`);
		expect(recent?.purgedAt).toBeNull();
	});

	it("이미 파기된 계정은 재처리하지 않는다", async () => {
		const adminId = await seedAdmin();
		const oldUserId = await seedWithdrawnUser(31);

		await purgeClient(adminId)();
		const again = await purgeClient(adminId)();

		expect(again.purgedCount).toBe(0);
		const [row] = await db.select().from(user).where(eq(user.id, oldUserId));
		expect(row?.purgedAt).not.toBeNull();
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api test src/routers/bambi/purge-withdrawn-accounts.test.ts`
Expected: FAIL — `purgeWithdrawnAccounts` 미정의

- [ ] **Step 3: 프로시저 구현**

`packages/api/src/routers/bambi/moderation.ts`:

import 수정 — schema/auth import에 `account`, `session` 추가; drizzle-orm import에 `isNull`, `lte` 추가; 서비스 import 블록에 추가:

```ts
import {
	account,
	invitation,
	member,
	session,
	team,
	teamMember,
	user,
} from "@bambi-app/db/schema/auth";
```

```ts
import {
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	lte,
	sql,
} from "drizzle-orm";
```

```ts
import { resolveWithdrawalRetentionDays } from "../../services/bambi-member-policy";
```

`moderationRouter`에 프로시저 추가:

```ts
	// 탈퇴 계정 개인정보 파기 배치. 보존기간(운영자 설정, 기본 30일) 경과분의
	// PII를 스크럽한다. user 행 자체는 지우지 않는다 — 채팅·리뷰·신고 등 상대방
	// 데이터가 onDelete 미지정(RESTRICT) FK로 물려 있어 행 삭제는 실패하거나 상대방
	// 기록까지 깨진다. 파기 후 이메일이 tombstone으로 바뀌어 원 이메일 재가입이
	// 다시 열린다. cron 인프라가 없어 운영자 수동/외부 호출로 트리거한다.
	purgeWithdrawnAccounts: adminProcedure.handler(async () => {
		const retentionDays = await resolveWithdrawalRetentionDays();
		const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
		const targets = await db
			.select({ id: user.id })
			.from(user)
			.where(
				and(
					isNotNull(user.deletedAt),
					lte(user.deletedAt, cutoff),
					isNull(user.purgedAt)
				)
			);
		if (targets.length === 0) {
			return { purgedCount: 0 };
		}
		const ids = targets.map((row) => row.id);

		await db.transaction(async (tx) => {
			await tx.delete(session).where(inArray(session.userId, ids));
			// 비밀번호 등 자격증명 파기.
			await tx.delete(account).where(inArray(account.userId, ids));
			await tx
				.update(bambiProfile)
				.set({
					displayName: "탈퇴한 회원",
					phoneNumber: null,
					gender: null,
					birthDate: null,
					ciHash: null,
					diHash: null,
					isPhoneVerified: false,
				})
				.where(inArray(bambiProfile.userId, ids));
			// 이메일은 unique 제약이라 사용자별 tombstone으로 치환한다.
			for (const id of ids) {
				await tx
					.update(user)
					.set({
						email: `withdrawn-${id}@invalid.bambi`,
						name: "탈퇴한 회원",
						image: null,
						purgedAt: new Date(),
					})
					.where(eq(user.id, id));
			}
		});

		return { purgedCount: ids.length };
	}),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test src/routers/bambi/purge-withdrawn-accounts.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 린트 후 커밋**

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/moderation.ts packages/api/src/routers/bambi/purge-withdrawn-accounts.test.ts packages/api/src/services/bambi-policy.ts packages/api/src/services/bambi-member-policy.ts`

```
feat(api): 탈퇴 계정 개인정보 파기 배치 프로시저 추가
- moderation.purgeWithdrawnAccounts — 보존기간(운영자 설정, 기본 30일) 경과 탈퇴 계정의 PII 스크럽
- user 행은 유지(상대방 채팅·리뷰 FK 보존), 이메일은 tombstone 치환으로 재가입 해제
- 자격증명(account)·세션 삭제, 프로필 전화·성별·생년월일·CI/DI 해시 파기
- bambi-policy 기본값 상수·bambi-member-policy 해석 헬퍼 추가, 실 DB 테스트 2건 추가
```

---

### Task 6: 회원 정책 설정 API (TDD)

**Files:**
- Test: `packages/api/src/routers/bambi/member-policy-settings.test.ts` (생성)
- Modify: `packages/api/src/routers/bambi/site-settings.ts`

**Interfaces:**
- Consumes: `bambiSiteSettings.withdrawalRetentionDays` (Task 1), `DEFAULT_WITHDRAWAL_RETENTION_DAYS`·`resolveWithdrawalRetentionDays` (Task 2)
- Produces: `orpc.bambi.siteSettings.getMemberPolicy`(공개) — 반환 `{ days: number | null, defaultDays: number }`(days=null이면 미설정=기본값 사용); `orpc.bambi.siteSettings.updateMemberPolicy`(운영자) — 입력 `{ withdrawalRetentionDays: number | null }`(1~365 정수 또는 null=기본값 복귀), 반환 `{ days: number | null }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/routers/bambi/member-policy-settings.test.ts` — **실 DB 단일 설정 행을 건드리므로 기존 값을 백업했다가 원복한다:**

```ts
import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { siteSettingsRouter }, memberPolicy] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./site-settings"),
		import("../../services/bambi-member-policy"),
	]);

const { user } = authSchema;
const { bambiProfile, bambiSiteSettings } = bambiSchema;
const { resolveWithdrawalRetentionDays } = memberPolicy;

const SETTINGS_ROW_ID = "default";

// 실 개발 DB의 단일 설정 행을 공유하므로 시작 전 값을 백업하고 끝나면 원복한다.
let originalDays: number | null = null;
beforeAll(async () => {
	const [row] = await db
		.select({ days: bambiSiteSettings.withdrawalRetentionDays })
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
		.limit(1);
	originalDays = row?.days ?? null;
});
afterAll(async () => {
	await db
		.update(bambiSiteSettings)
		.set({ withdrawalRetentionDays: originalDays })
		.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID));
});

const createdUserIds: string[] = [];
afterEach(async () => {
	for (const id of createdUserIds.splice(0)) {
		await db.delete(user).where(eq(user.id, id));
	}
});

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const seedUserWithRole = async (role: "admin" | "job_seeker") => {
	const userId = `user_policy_${randomUUID()}`;
	createdUserIds.push(userId);
	await db.insert(user).values({
		id: userId,
		name: "정책테스트",
		email: `${userId}@bambi.test`,
	});
	await db
		.insert(bambiProfile)
		.values({ userId, role, displayName: "정책테스트" });
	return userId;
};

const updateClient = (userId: string) =>
	createProcedureClient(siteSettingsRouter.updateMemberPolicy, {
		context: ctx(userId),
		path: ["bambi", "siteSettings", "updateMemberPolicy"],
	});

const getClient = () =>
	createProcedureClient(siteSettingsRouter.getMemberPolicy, {
		context: { auth: null, session: null } as Context,
		path: ["bambi", "siteSettings", "getMemberPolicy"],
	});

describe("회원 정책(탈퇴 보존기간) 설정", () => {
	it("운영자가 저장하면 조회·해석 헬퍼에 반영된다", async () => {
		const adminId = await seedUserWithRole("admin");

		const saved = await updateClient(adminId)({
			withdrawalRetentionDays: 14,
		});
		expect(saved.days).toBe(14);

		const policy = await getClient()();
		expect(policy.days).toBe(14);
		expect(await resolveWithdrawalRetentionDays()).toBe(14);
	});

	it("null로 저장하면 기본값으로 폴백한다", async () => {
		const adminId = await seedUserWithRole("admin");

		await updateClient(adminId)({ withdrawalRetentionDays: null });

		const policy = await getClient()();
		expect(policy.days).toBeNull();
		expect(await resolveWithdrawalRetentionDays()).toBe(policy.defaultDays);
	});

	it("운영자가 아니면 저장이 거부된다", async () => {
		const seekerId = await seedUserWithRole("job_seeker");

		await expect(
			updateClient(seekerId)({ withdrawalRetentionDays: 14 })
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api test src/routers/bambi/member-policy-settings.test.ts`
Expected: FAIL — `updateMemberPolicy` 미정의

- [ ] **Step 3: 프로시저 구현**

`packages/api/src/routers/bambi/site-settings.ts` — import 추가:

```ts
import { DEFAULT_WITHDRAWAL_RETENTION_DAYS } from "../../services/bambi-policy";
```

입력 스키마 추가(`updateFooterInput` 아래):

```ts
// 회원 정책 — 탈퇴 개인정보 보존기간(일). null이면 기본값으로 복귀한다.
const updateMemberPolicyInput = z.object({
	withdrawalRetentionDays: z
		.number()
		.int("보존기간은 일 단위 정수로 입력해 주세요.")
		.min(1, "보존기간은 1일 이상으로 설정해 주세요.")
		.max(365, "보존기간은 365일 이하로 설정해 주세요.")
		.nullable(),
});
```

`siteSettingsRouter`에 프로시저 추가:

```ts
	// 회원 정책 공개 조회 — 탈퇴 안내 카피가 보존기간을 표시하는 데 쓴다.
	// days가 null이면 미설정(기본값 사용). defaultDays는 코드 기본값으로, 운영자
	// 폼의 placeholder와 안내 카피 폴백이 같은 값을 보게 한다.
	getMemberPolicy: publicProcedure.handler(async () => {
		const [row] = await db
			.select({ days: bambiSiteSettings.withdrawalRetentionDays })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);
		return {
			days: row?.days ?? null,
			defaultDays: DEFAULT_WITHDRAWAL_RETENTION_DAYS,
		};
	}),

	// 운영자 전용 회원 정책 저장. 같은 단일 행을 upsert 하되 해당 컬럼만 갱신한다.
	updateMemberPolicy: adminProcedure
		.input(updateMemberPolicyInput)
		.handler(async ({ input }) => {
			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({
					id: SETTINGS_ROW_ID,
					withdrawalRetentionDays: input.withdrawalRetentionDays,
				})
				.onConflictDoUpdate({
					target: bambiSiteSettings.id,
					set: { withdrawalRetentionDays: input.withdrawalRetentionDays },
				})
				.returning({ days: bambiSiteSettings.withdrawalRetentionDays });
			return { days: saved?.days ?? null };
		}),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test src/routers/bambi/member-policy-settings.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 린트 후 커밋**

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/site-settings.ts packages/api/src/routers/bambi/member-policy-settings.test.ts`

```
feat(api): 회원 정책(탈퇴 보존기간) 사이트 설정 프로시저 추가
- siteSettings.getMemberPolicy(공개)·updateMemberPolicy(운영자) — 단일 행 upsert, 1~365일 검증
- null 저장 시 코드 기본값(30일)으로 복귀, 파기 배치·안내 카피가 같은 해석 헬퍼를 공유
- 설정 행 백업·원복 포함 실 DB 테스트 3건 추가
```

---

### Task 7: 운영자 사이트 설정 — 회원 정책 섹션

**Files:**
- Modify: `apps/web/src/app/moderator/site-settings/page.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.siteSettings.getMemberPolicy`·`updateMemberPolicy` (Task 6)
- Produces: 운영자 사이트 설정 페이지의 "회원 정책" Card(보존기간 편집, 빈 값=기본값).

- [ ] **Step 1: 상태·쿼리·뮤테이션 추가**

`ModeratorSiteSettingsPage` 컴포넌트 안, 기존 `onSubmitAccounts` 아래에:

```tsx
	const memberPolicyQuery = useQuery(
		orpc.bambi.siteSettings.getMemberPolicy.queryOptions()
	);
	const [retentionDays, setRetentionDays] = useState("");

	// 저장된 값이 오면 폼에 채운다(미설정이면 빈 값 → 기본값 placeholder 노출).
	useEffect(() => {
		const data = memberPolicyQuery.data;
		if (!data) {
			return;
		}
		setRetentionDays(data.days === null ? "" : String(data.days));
	}, [memberPolicyQuery.data]);

	const saveMemberPolicyMutation = useMutation(
		orpc.bambi.siteSettings.updateMemberPolicy.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("회원 정책을 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getMemberPolicy.queryKey(),
				});
			},
		})
	);

	const onSubmitMemberPolicy = (event: FormEvent) => {
		event.preventDefault();
		const trimmed = retentionDays.trim();
		const parsed = trimmed === "" ? null : Number(trimmed);
		if (parsed !== null && !Number.isInteger(parsed)) {
			toast.error("보존기간은 일 단위 정수로 입력해 주세요.");
			return;
		}
		saveMemberPolicyMutation.mutate({ withdrawalRetentionDays: parsed });
	};
```

- [ ] **Step 2: 회원 정책 Card 추가**

무통장입금 계좌 Card 닫는 `</Card>` 뒤에:

```tsx
			<Card>
				<CardHeader>
					<CardTitle>회원 정책</CardTitle>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-5" onSubmit={onSubmitMemberPolicy}>
						<div className="flex flex-col gap-2 md:max-w-xs">
							<Label htmlFor="withdrawalRetentionDays">
								탈퇴 개인정보 보존기간(일)
							</Label>
							<Input
								id="withdrawalRetentionDays"
								inputMode="numeric"
								onChange={(event) => setRetentionDays(event.target.value)}
								placeholder={String(memberPolicyQuery.data?.defaultDays ?? 30)}
								value={retentionDays}
							/>
							<p className="m-0 text-muted-foreground text-xs">
								탈퇴 후 이 기간이 지나면 파기 배치가 개인정보를 삭제해요.
								비워두면 기본값을 사용하고, 탈퇴 안내 문구에도 그대로 표시돼요.
							</p>
						</div>
						<div className="flex justify-end">
							<Button
								disabled={
									saveMemberPolicyMutation.isPending ||
									memberPolicyQuery.isLoading
								}
								type="submit"
							>
								{saveMemberPolicyMutation.isPending ? "저장 중…" : "저장"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
```

- [ ] **Step 3: 린트·타입체크**

Run: `pnpm dlx ultracite fix apps/web/src/app/moderator/site-settings/page.tsx`
Run: `pnpm --filter web check-types`
Expected: 통과

- [ ] **Step 4: 커밋**

```
feat(web): 운영자 사이트 설정에 회원 정책 섹션 추가
- 탈퇴 개인정보 보존기간(일) 편집 폼 — 빈 값이면 기본값(30일) 사용, placeholder로 기본값 노출
- 저장 시 getMemberPolicy 무효화로 탈퇴 안내 카피와 즉시 동기화
```

---

### Task 8: 웹 탈퇴 UI

**Files:**
- Create: `apps/web/src/components/bambi/withdraw-account-section.tsx`
- Modify: `apps/web/src/components/bambi/screens/account-settings-screen.tsx:199-201` (로그아웃 버튼 아래)
- Modify: `apps/web/src/app/employer/settings/page.tsx:160` (팀 관리 섹션 아래)

**Interfaces:**
- Consumes: `orpc.bambi.onboarding.withdrawMyAccount` (Task 4), `orpc.bambi.siteSettings.getMemberPolicy` (Task 6), `authClient`·`clearGuestCookie`(기존)
- Produces: `<WithdrawAccountSection />` — props 없는 공용 섹션 컴포넌트, 보존기간을 설정값으로 동적 표시.

- [ ] **Step 1: 탈퇴 섹션 컴포넌트 작성**

`apps/web/src/components/bambi/withdraw-account-section.tsx`:

```tsx
"use client";

// 회원 탈퇴 섹션 — 계정 설정 화면 하단의 위험 구역. 확인 다이얼로그를 거쳐
// onboarding.withdrawMyAccount를 호출하고, 성공하면 세션 흔적을 정리하고 홈으로
// 보낸다. 조직 소유자 차단 등 서버 거절 사유는 토스트로 그대로 보여준다.
// 보존기간은 운영자 설정(siteSettings.getMemberPolicy)을 그대로 표시한다.

import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { clearGuestCookie } from "@/lib/bambi/guest";
import { orpc } from "@/utils/orpc";

export function WithdrawAccountSection() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const memberPolicyQuery = useQuery(
		orpc.bambi.siteSettings.getMemberPolicy.queryOptions()
	);
	// 설정값 → 기본값 순 폴백. 쿼리 로딩 중에도 안내가 비지 않게 30을 마지막에 둔다.
	const retentionDays =
		memberPolicyQuery.data?.days ?? memberPolicyQuery.data?.defaultDays ?? 30;

	const withdrawMutation = useMutation(
		orpc.bambi.onboarding.withdrawMyAccount.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "탈퇴하지 못했어요. 다시 시도해 주세요.");
			},
			onSuccess: async () => {
				// 서버가 세션을 모두 지웠으므로 signOut 실패는 무시하고 쿠키만 정리한다.
				await authClient.signOut().catch(() => undefined);
				await clearGuestCookie();
				toast.success("탈퇴가 완료됐어요. 그동안 이용해 주셔서 감사합니다.");
				router.push("/");
				router.refresh();
			},
		})
	);

	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-destructive/30 p-5">
			<div className="flex flex-col gap-1">
				<span className="font-bold text-foreground text-sm">회원 탈퇴</span>
				<p className="m-0 text-muted-foreground text-xs">
					탈퇴하면 즉시 로그아웃되고 다시 로그인할 수 없어요. 프로필은 '탈퇴한
					회원'으로 표시되고, {retentionDays}일 보관 후 개인정보가 파기돼요.
					보관 기간에는 같은 이메일·본인인증으로 재가입할 수 없어요.
				</p>
			</div>
			<Button
				className="self-start"
				onClick={() => setOpen(true)}
				variant="destructive"
			>
				회원 탈퇴
			</Button>
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent>
					<DialogTitle>정말 탈퇴하시겠어요?</DialogTitle>
					<DialogDescription>
						탈퇴 즉시 모든 기기에서 로그아웃되고 계정은 복구할 수 없어요. 남긴
						채팅·리뷰는 '탈퇴한 회원'으로 표시돼요.
					</DialogDescription>
					<div className="flex justify-end gap-2">
						<Button onClick={() => setOpen(false)} variant="outline">
							취소
						</Button>
						<Button
							disabled={withdrawMutation.isPending}
							onClick={() => withdrawMutation.mutate(undefined)}
							variant="destructive"
						>
							{withdrawMutation.isPending ? "탈퇴 처리 중" : "탈퇴하기"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</section>
	);
}
```

(`mutate(undefined)`가 타입 에러면 `mutate()` 또는 입력 스키마에 맞춰 조정. Dialog는 제어형 open 패턴 — `report-dialog.tsx`와 동일.)

- [ ] **Step 2: 구직자 계정 설정에 배치**

`account-settings-screen.tsx` — import 추가:

```tsx
import { WithdrawAccountSection } from "../withdraw-account-section";
```

로그아웃 버튼 아래(스크롤 컨테이너 안 마지막 요소로):

```tsx
				<Button className="w-full" onClick={handleSignOut} variant="secondary">
					로그아웃
				</Button>
				<WithdrawAccountSection />
```

- [ ] **Step 3: 구인자 설정에 배치**

`apps/web/src/app/employer/settings/page.tsx` — import 추가:

```tsx
import { WithdrawAccountSection } from "@/components/bambi/withdraw-account-section";
```

팀 관리 섹션 닫는 `</section>` 뒤, `</PageShell>` 앞에:

```tsx
			<Separator />

			<WithdrawAccountSection />
```

- [ ] **Step 4: 린트·타입체크**

Run: `pnpm dlx ultracite fix apps/web/src/components/bambi/withdraw-account-section.tsx apps/web/src/components/bambi/screens/account-settings-screen.tsx apps/web/src/app/employer/settings/page.tsx`
Run: `pnpm --filter web check-types`
Expected: 통과. dev 서버 기동·스크린샷 금지 — 시각 확인은 사용자에게 요청.

- [ ] **Step 5: 커밋**

```
feat(web): 계정 설정에 회원 탈퇴 UI 추가
- WithdrawAccountSection — 확인 다이얼로그·탈퇴 뮤테이션·성공 시 세션 정리 후 홈 이동
- 보존기간 안내는 운영자 설정값(getMemberPolicy) 동적 표시, 기본 30일 폴백
- 구직자 계정 설정(로그아웃 아래)과 구인자 설정(팀 관리 아래)에 공용 배치
- 조직 소유자 차단 등 서버 거절 사유는 토스트로 노출
```

---

### Task 9: 마무리 검증

- [ ] **Step 1: 전체 타입체크**

Run: `pnpm --filter @bambi-app/db check-types && pnpm --filter @bambi-app/auth check-types && pnpm --filter @bambi-app/api check-types && pnpm --filter web check-types`
Expected: 모두 통과

- [ ] **Step 2: api 전체 테스트(회귀)**

Run: `pnpm --filter @bambi-app/api test`
Expected: 기존 테스트 포함 전부 통과

- [ ] **Step 3: 사용자 확인 항목 보고**

- 탈퇴 계정 재로그인 차단(수동): 탈퇴 → 같은 이메일 로그인 시도 → "탈퇴한 계정이에요" 확인
- 탈퇴 후 상대방 채팅·리뷰 화면에 '탈퇴한 회원' 표시 확인
- 운영자 사이트 설정에서 보존기간 변경 → 탈퇴 안내 카피에 반영 확인
- 매뉴얼(docs/manual) 갱신 여부·개인정보 처리방침 개정(보유기간 명시) 결정

## 남긴 것 (후속)

- 조직 소유자 탈퇴(소유권 이전/조직 삭제 연계) — 별도 이슈로 킵
- 파기 배치 운영자 화면 버튼/자동 스케줄러 — 현재는 프로시저 수동 호출
- 개인정보 처리방침 개정 + `LEGAL_CONSENT_VERSIONS` bump — 재동의 유발이라 사용자 결정 필요
- 탈퇴 철회(보존기간 내 복구) — 요구되면 displayName 원본 보존 방식으로 변경 필요
- 보존기간 변경 시 이미 탈퇴한 계정에도 새 값이 소급 적용된다(파기 시점 기준 해석) — 탈퇴 시점 값 고정이 필요하면 user에 스냅샷 컬럼 추가
