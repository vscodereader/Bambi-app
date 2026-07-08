# 구인자 팀 합류 — 운영자 승인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구인자(owner/manager)가 employer 계정을 팀에 초대하면, 운영자(admin)가 승인하는 순간 그 계정이 `member`(조직)+`teamMember`(팀)로 자동 합류하는 흐름을 구현한다.

**Architecture:** 기존 `invitation(status="pending")` 생성 로직은 그대로 두고, "합류 게이트"를 운영자 승인으로 둔다. 운영자용 oRPC procedure 2개(`listPendingTeamInvitations`, `setTeamInvitationStatus`)를 `moderation` 라우터에 추가하고, 승인 시 트랜잭션으로 `member`+`teamMember`를 생성한다. 운영자 전용 웹 페이지(`/moderator/team-invites`)는 기존 `/moderator/employers` 패턴을 그대로 미러링한다. 구인자 팀 관리 UI는 상태 문구만 조정한다.

**Tech Stack:** TypeScript, oRPC(`@orpc/server`), Drizzle ORM(PostgreSQL), Next.js(App Router, RSC) + React Query, shadcn/ui(base-ui) + Tailwind v4, Vitest.

## Global Constraints

- **DB 마이그레이션**: `db:push` 절대 금지. **`pnpm db:generate` → `pnpm db:migrate`** 만 사용. `db:generate`는 오프라인으로 SQL 파일을 만들고, `db:migrate`는 DB 연결이 필요하다.
- **DB 테스트 실행 조건**: 라우터 테스트(`*.test.ts`)는 실제 dev DB에 붙는다. 실행하려면 별도 터미널에서 **`pnpm db:proxy`**(Cloud SQL Proxy)가 떠 있어야 한다. 프록시를 띄우는 것은 사용자 몫이며, 프록시가 없으면 테스트는 연결 에러로 실패한다. 프록시가 없을 때의 최소 검증 게이트는 **`pnpm check-types` + `pnpm biome check`** 다.
- **빌드/실행 금지**: 소스 수정 후 `npm run build`·dev 서버 기동을 하지 않는다(HMR 자동 반영). 동작 확인은 사용자에게 요청한다.
- **줄바꿈 LF**(`.gitattributes`). 커밋 전 워크트리에 `pnpm install`이 되어 있어야 lefthook(biome) pre-commit이 동작한다.
- **커밋 컨벤션**: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿 본문(블릿 사이 빈 줄 없음).
- **web UI 규칙**(`apps/web/CLAUDE.md`): 인라인 `style` 금지, shadcn 컴포넌트 우선, 시맨틱 색 토큰, `rounded-none` 금지, base-ui는 `asChild` 대신 `render` prop. 클라이언트 훅 쓰는 파일은 최상단 `"use client"`.
- **테스트 시드 규칙**: `organization`·`member`·`teamMember` insert 시 `createdAt: new Date()`를 수동 지정한다(스키마 default 없음). `id`도 수동 지정(`text` PK, default 없음).
- **초대 role 값**: `invitation.role`/`member.role`의 정규 값은 `owner`/`manager`/`staff`. 정규화는 `normalizeOrganizationManagementRole`을 쓴다.

---

## File Structure

**수정:**
- `packages/db/src/schema/auth.ts` — `invitation` 테이블에 `rejectionReason` 컬럼 추가.
- `packages/db/src/schema/bambi.ts` — `moderationTargetType` enum에 `team_invitation` 추가.
- `packages/db/src/migrations/0009_*.sql` (+ `meta/`) — `db:generate` 산출물.
- `packages/api/src/routers/bambi/moderation.ts` — import 보강 + 입력 스키마 + `listPendingTeamInvitations` + `setTeamInvitationStatus`.
- `packages/api/src/routers/bambi/organizations.ts` — `listMembers`의 invitation select에 `rejectionReason` 추가.
- `apps/web/src/components/bambi/team-member-list.tsx` — 상태 문구 조정 + 반려 사유 표시.
- `apps/web/src/app/moderator/layout.tsx` — nav 항목 추가.

**신규:**
- `apps/web/src/app/moderator/team-invites/page.tsx` — 운영자 팀 합류 승인 페이지.
- `packages/api/src/routers/bambi/team-invitation-moderation.test.ts` — 승인/반려 테스트.

---

## Task 1: DB 스키마 — `invitation.rejectionReason` + `moderationTargetType.team_invitation` + 마이그레이션 생성

**Files:**
- Modify: `packages/db/src/schema/auth.ts` (invitation 테이블, 약 162–191줄)
- Modify: `packages/db/src/schema/bambi.ts` (moderationTargetType enum, 63–69줄)
- Create: `packages/db/src/migrations/0009_*.sql` (generate 산출물)

**Interfaces:**
- Produces: `invitation.rejectionReason`(nullable `text`) 컬럼, `moderationTargetType`에 `"team_invitation"` 값. 이후 모든 Task가 이 둘에 의존.

- [ ] **Step 1: `moderationTargetType` enum에 값 추가**

`packages/db/src/schema/bambi.ts` 63–69줄을 아래로 변경:

```ts
export const moderationTargetType = pgEnum("moderation_target_type", [
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"user",
	"team_invitation",
]);
```

- [ ] **Step 2: `invitation` 테이블에 `rejectionReason` 컬럼 추가**

`packages/db/src/schema/auth.ts`의 `invitation` 정의에서 `status` 줄 바로 다음(현재 172줄 `status: ...` 아래)에 컬럼을 추가한다. 변경 후 컬럼 영역이 아래처럼 되도록:

```ts
		role: text("role"),
		teamId: text("team_id"),
		status: text("status").default("pending").notNull(),
		rejectionReason: text("rejection_reason"),
		expiresAt: timestamp("expires_at").notNull(),
```

- [ ] **Step 3: 타입 체크로 스키마 정합성 확인**

Run: `cd packages/db && pnpm check-types`
Expected: PASS (에러 없음)

- [ ] **Step 4: 마이그레이션 생성(오프라인)**

Run: `pnpm db:generate`
Expected: `packages/db/src/migrations/`에 `0009_*.sql` 새 파일 생성. 콘솔에 새 마이그레이션 생성 로그.

- [ ] **Step 5: 생성된 SQL 확인**

생성된 `0009_*.sql`을 열어 아래 두 구문이 포함됐는지 육안 확인:
- `ALTER TABLE "invitation" ADD COLUMN "rejection_reason" text;`
- `ALTER TYPE "public"."moderation_target_type" ADD VALUE 'team_invitation';` (또는 동등 구문)

(참고: `ALTER TYPE ... ADD VALUE`는 값을 추가만 하고 같은 트랜잭션에서 사용하지 않으므로 PG12+ Cloud SQL에서 정상 적용된다. `db:migrate`는 DB 프록시가 떠 있을 때 사용자가 실행한다 — 이 단계에서 직접 migrate 하지 않는다.)

- [ ] **Step 6: 커밋**

```bash
git add packages/db/src/schema/auth.ts packages/db/src/schema/bambi.ts packages/db/src/migrations
git commit -m "feat: invitation 반려 사유 컬럼·team_invitation 감사 대상 추가
- invitation 테이블에 rejectionReason(nullable text) 추가 — 운영자 팀 합류 초대 반려 사유 저장
- moderationTargetType enum에 team_invitation 추가 — 팀 합류 승인/반려 감사 로그 대상
- drizzle db:generate로 0009 마이그레이션 생성(적용은 db:migrate로 별도)"
```

---

## Task 2: `moderation.listPendingTeamInvitations` — 운영자 승인 대기 목록

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts` (import 1–24줄, router 객체 655–700줄 사이에 procedure 추가)
- Test: `packages/api/src/routers/bambi/team-invitation-moderation.test.ts` (신규)

**Interfaces:**
- Consumes: `invitation`, `member`, `user`, `team`, `teamMember`(auth schema), `employerOrganizationProfile`, `employerTeamProfile`, `bambiProfile`(bambi schema), `normalizeOrganizationManagementRole`.
- Produces: `moderationRouter.listPendingTeamInvitations` — 입력 없음, 반환 배열의 각 원소:
  `{ id: string; organizationId: string; organizationName: string | null; email: string; inviteeName: string | null; inviterName: string | null; inviterEmail: string | null; role: "owner"|"manager"|"staff"; teamId: string | null; teamName: string | null; status: string; createdAt: Date; expiresAt: Date; isExpired: boolean }`.

- [ ] **Step 1: import 보강**

`packages/api/src/routers/bambi/moderation.ts` 상단 import를 아래처럼 보강한다.

auth schema import(현재 `import { member, user } from "@bambi-app/db/schema/auth";`)를:

```ts
import {
	invitation,
	member,
	team,
	teamMember,
	user,
} from "@bambi-app/db/schema/auth";
```

bambi schema import 목록에 `employerTeamProfile`를 알파벳 순 위치에 추가(`employerOrganizationProfile` 다음):

```ts
	employerOrganizationProfile,
	employerTeamProfile,
```

drizzle-orm import에 `alias`용 서브패스와 `node:crypto`를 파일 최상단에 추가:

```ts
import { randomUUID } from "node:crypto";
```
그리고 기존 `import { and, asc, desc, eq, sql } from "drizzle-orm";` 아래에:
```ts
import { alias } from "drizzle-orm/pg-core";
```

services import(현재 `requireActiveBambiProfile, requireAdminProfile`)와 별개로 organization-authz import를 추가:

```ts
import { normalizeOrganizationManagementRole } from "../../services/bambi-organization-authz";
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/api/src/routers/bambi/team-invitation-moderation.test.ts` 신규 생성:

```ts
import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { moderationRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./moderation"),
	]);

const { user, organization, member, team, teamMember, invitation } = authSchema;
const { adminModerationAction, bambiProfile, employerOrganizationProfile } =
	bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

const seedAdmin = async () => {
	const adminId = `user_admin_${randomUUID()}`;
	await db.insert(user).values({
		id: adminId,
		name: "운영자",
		email: `${adminId}@bambi.test`,
	});
	await db
		.insert(bambiProfile)
		.values({ userId: adminId, role: "admin", displayName: "운영자" });
	return adminId;
};

// 검증된 조직 + owner(inviter) + 팀 1개 + 초대 대상 employer + pending 초대를 만든다.
const seedPendingInvite = async (options?: {
	withTeam?: boolean;
	expired?: boolean;
	inviteeAlreadyMember?: boolean;
}) => {
	const withTeam = options?.withTeam ?? true;
	const ownerId = `user_owner_${randomUUID()}`;
	const inviteeId = `user_invitee_${randomUUID()}`;
	const orgId = `org_${randomUUID()}`;
	const teamId = `team_${randomUUID()}`;
	const inviteeEmail = `${inviteeId}@bambi.test`;

	await db.insert(user).values([
		{ id: ownerId, name: "업주", email: `${ownerId}@bambi.test` },
		{ id: inviteeId, name: "초대대상", email: inviteeEmail },
	]);
	await db.insert(bambiProfile).values([
		{ userId: ownerId, role: "employer", displayName: "업주" },
		{ userId: inviteeId, role: "employer", displayName: "초대대상" },
	]);
	await db
		.insert(organization)
		.values({ id: orgId, name: "업소", slug: orgId, createdAt: new Date() });
	await db.insert(employerOrganizationProfile).values({
		organizationId: orgId,
		displayName: "업소 표시명",
		verificationStatus: "verified",
	});
	await db.insert(member).values({
		id: `member_${randomUUID()}`,
		organizationId: orgId,
		userId: ownerId,
		role: "owner",
		createdAt: new Date(),
	});
	if (withTeam) {
		await db
			.insert(team)
			.values({ id: teamId, name: "1팀", organizationId: orgId, createdAt: new Date() });
	}
	if (options?.inviteeAlreadyMember) {
		await db.insert(member).values({
			id: `member_${randomUUID()}`,
			organizationId: orgId,
			userId: inviteeId,
			role: "staff",
			createdAt: new Date(),
		});
	}
	const inviteId = `invitation_${randomUUID()}`;
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + (options?.expired ? -1 : 14));
	await db.insert(invitation).values({
		id: inviteId,
		organizationId: orgId,
		email: inviteeEmail,
		role: "staff",
		teamId: withTeam ? teamId : null,
		status: "pending",
		expiresAt,
		inviterId: ownerId,
	});

	return { ownerId, inviteeId, orgId, teamId, inviteeEmail, inviteId };
};

const cleanup = async (ids: {
	ownerId: string;
	inviteeId: string;
	orgId: string;
	adminId?: string;
}) => {
	if (ids.adminId) {
		await db
			.delete(adminModerationAction)
			.where(inArray(adminModerationAction.adminUserId, [ids.adminId]));
	}
	// invitation/member/teamMember/team/orgProfile 은 organization onDelete cascade
	await db.delete(organization).where(eq(organization.id, ids.orgId));
	await db.delete(user).where(inArray(user.id, [ids.ownerId, ids.inviteeId, ids.adminId ?? ""]));
};

describe("listPendingTeamInvitations", () => {
	it("returns pending invitations with org/team/invitee info for admin", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite();

		const list = createProcedureClient(
			moderationRouter.listPendingTeamInvitations,
			{
				context: ctx(adminId),
				path: ["bambi", "moderation", "listPendingTeamInvitations"],
			}
		);

		const rows = (await list({})) as Array<{
			id: string;
			organizationName: string | null;
			teamName: string | null;
			inviteeName: string | null;
			email: string;
			isExpired: boolean;
		}>;
		const found = rows.find((r) => r.id === seed.inviteId);
		expect(found).toBeDefined();
		expect(found?.organizationName).toBe("업소 표시명");
		expect(found?.teamName).toBe("1팀");
		expect(found?.inviteeName).toBe("초대대상");
		expect(found?.email).toBe(seed.inviteeEmail);
		expect(found?.isExpired).toBe(false);

		await cleanup({ ...seed, adminId });
	});

	it("forbids non-admin", async () => {
		const seed = await seedPendingInvite();

		const list = createProcedureClient(
			moderationRouter.listPendingTeamInvitations,
			{
				context: ctx(seed.ownerId),
				path: ["bambi", "moderation", "listPendingTeamInvitations"],
			}
		);

		await expectOrpcCode(list({}), "FORBIDDEN");
		await cleanup(seed);
	});
});
```

- [ ] **Step 3: 테스트 실행하여 실패 확인**

Run: `cd packages/api && pnpm vitest run src/routers/bambi/team-invitation-moderation.test.ts`
Expected: FAIL — `moderationRouter.listPendingTeamInvitations`가 없어 타입/런타임 에러.
(주의: `pnpm db:proxy`가 떠 있어야 DB 연결됨. 프록시가 없으면 연결 에러로 실패 — 그래도 "아직 구현 안 됨"을 확인하는 목적은 충족.)

- [ ] **Step 4: `listPendingTeamInvitations` 구현**

`moderation.ts`의 `moderationRouter` 객체 안, `listPendingEmployers` 다음에 추가:

```ts
	listPendingTeamInvitations: protectedProcedure.handler(async ({ context }) => {
		await requireAdminProfile(context.session);

		const inviterUser = alias(user, "inviter_user");
		const inviteeUser = alias(user, "invitee_user");

		const rows = await db
			.select({
				id: invitation.id,
				organizationId: invitation.organizationId,
				organizationName: employerOrganizationProfile.displayName,
				email: invitation.email,
				inviteeName: inviteeUser.name,
				inviterName: inviterUser.name,
				inviterEmail: inviterUser.email,
				role: invitation.role,
				teamId: invitation.teamId,
				teamNameRaw: team.name,
				teamProfileName: employerTeamProfile.displayName,
				status: invitation.status,
				createdAt: invitation.createdAt,
				expiresAt: invitation.expiresAt,
			})
			.from(invitation)
			.leftJoin(
				employerOrganizationProfile,
				eq(employerOrganizationProfile.organizationId, invitation.organizationId)
			)
			.leftJoin(inviterUser, eq(inviterUser.id, invitation.inviterId))
			.leftJoin(inviteeUser, eq(inviteeUser.email, invitation.email))
			.leftJoin(team, eq(team.id, invitation.teamId))
			.leftJoin(
				employerTeamProfile,
				eq(employerTeamProfile.teamId, invitation.teamId)
			)
			.where(eq(invitation.status, "pending"))
			.orderBy(desc(invitation.createdAt));

		const now = Date.now();
		return rows.map((row) => ({
			id: row.id,
			organizationId: row.organizationId,
			organizationName: row.organizationName,
			email: row.email,
			inviteeName: row.inviteeName,
			inviterName: row.inviterName,
			inviterEmail: row.inviterEmail,
			role: normalizeOrganizationManagementRole(row.role) ?? "staff",
			teamId: row.teamId,
			teamName: row.teamProfileName ?? row.teamNameRaw ?? null,
			status: row.status,
			createdAt: row.createdAt,
			expiresAt: row.expiresAt,
			isExpired: row.expiresAt.getTime() < now,
		}));
	}),
```

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd packages/api && pnpm vitest run src/routers/bambi/team-invitation-moderation.test.ts -t listPendingTeamInvitations`
Expected: PASS (프록시 필요). 프록시 없으면 최소 `cd packages/api && pnpm check-types` PASS로 대체 검증.

- [ ] **Step 6: 커밋**

```bash
git add packages/api/src/routers/bambi/moderation.ts packages/api/src/routers/bambi/team-invitation-moderation.test.ts
git commit -m "feat: 운영자 팀 합류 초대 대기 목록 procedure 추가
- moderation.listPendingTeamInvitations 신설 — status=pending 초대를 조직명·팀명·초대대상·초대자와 함께 반환
- inviter/invitee 각각 user 테이블 alias join, 팀명은 employerTeamProfile.displayName→team.name 폴백
- expiresAt 경과분은 isExpired=true로 표시(승인 버튼 비활성 용)
- requireAdminProfile 게이트, 목록/권한 테스트 추가"
```

---

## Task 3: `moderation.setTeamInvitationStatus` — 승인(합류)/반려

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts` (입력 스키마 100줄 근처, procedure는 `listPendingTeamInvitations` 다음)
- Test: `packages/api/src/routers/bambi/team-invitation-moderation.test.ts` (describe 추가)

**Interfaces:**
- Consumes: Task 2의 import(`invitation`, `member`, `teamMember`, `user`, `bambiProfile`, `adminModerationAction`, `normalizeOrganizationManagementRole`, `randomUUID`).
- Produces: `moderationRouter.setTeamInvitationStatus` — 입력 `{ invitationId: string; status: "accepted"|"rejected"; reason?: string }`, 반환 갱신된 `invitation` 행. 승인 시 `member`(+teamId 있으면 `teamMember`) 생성.

- [ ] **Step 1: 입력 스키마 추가**

`moderation.ts`의 `setEmployerVerificationStatusInput`(102–106줄) 다음에 추가:

```ts
const teamInvitationDecisionSchema = z.enum(["accepted", "rejected"]);

const setTeamInvitationStatusInput = z
	.object({
		invitationId: z.string().min(1),
		status: teamInvitationDecisionSchema,
		reason: z.string().max(500).optional(),
	})
	.refine(
		(value) =>
			value.status !== "rejected" || (value.reason?.trim().length ?? 0) >= 2,
		{ message: "반려 사유를 입력하세요.", path: ["reason"] }
	);
```

- [ ] **Step 2: 실패하는 테스트 작성**

`team-invitation-moderation.test.ts` 하단(마지막 `});` 뒤)에 describe 추가:

```ts
describe("setTeamInvitationStatus", () => {
	const callSet = (adminId: string) =>
		createProcedureClient(moderationRouter.setTeamInvitationStatus, {
			context: ctx(adminId),
			path: ["bambi", "moderation", "setTeamInvitationStatus"],
		});

	it("accepts an invite and creates member + teamMember", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite({ withTeam: true });

		const result = (await callSet(adminId)({
			invitationId: seed.inviteId,
			status: "accepted",
		})) as { status: string; acceptedUserId: string | null };
		expect(result.status).toBe("accepted");
		expect(result.acceptedUserId).toBe(seed.inviteeId);

		const memberRows = await db
			.select()
			.from(member)
			.where(eq(member.userId, seed.inviteeId));
		expect(memberRows.some((m) => m.organizationId === seed.orgId)).toBe(true);

		const teamMemberRows = await db
			.select()
			.from(teamMember)
			.where(eq(teamMember.userId, seed.inviteeId));
		expect(teamMemberRows.some((t) => t.teamId === seed.teamId)).toBe(true);

		await cleanup({ ...seed, adminId });
	});

	it("accepts an org-only invite (no teamId) creating member only", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite({ withTeam: false });

		await callSet(adminId)({ invitationId: seed.inviteId, status: "accepted" });

		const teamMemberRows = await db
			.select()
			.from(teamMember)
			.where(eq(teamMember.userId, seed.inviteeId));
		expect(teamMemberRows.length).toBe(0);

		await cleanup({ ...seed, adminId });
	});

	it("does not duplicate member when invitee already a member", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite({
			withTeam: true,
			inviteeAlreadyMember: true,
		});

		await callSet(adminId)({ invitationId: seed.inviteId, status: "accepted" });

		const memberRows = await db
			.select()
			.from(member)
			.where(eq(member.userId, seed.inviteeId));
		const orgMembers = memberRows.filter((m) => m.organizationId === seed.orgId);
		expect(orgMembers.length).toBe(1);

		await cleanup({ ...seed, adminId });
	});

	it("rejects an invite with reason and stores it", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite();

		const result = (await callSet(adminId)({
			invitationId: seed.inviteId,
			status: "rejected",
			reason: "부적합",
		})) as { status: string; rejectionReason: string | null };
		expect(result.status).toBe("rejected");
		expect(result.rejectionReason).toBe("부적합");

		const memberRows = await db
			.select()
			.from(member)
			.where(eq(member.userId, seed.inviteeId));
		expect(memberRows.some((m) => m.organizationId === seed.orgId)).toBe(false);

		await cleanup({ ...seed, adminId });
	});

	it("blocks accepting an expired invite", async () => {
		const adminId = await seedAdmin();
		const seed = await seedPendingInvite({ expired: true });

		await expectOrpcCode(
			callSet(adminId)({ invitationId: seed.inviteId, status: "accepted" }),
			"CONFLICT"
		);

		await cleanup({ ...seed, adminId });
	});

	it("forbids non-admin", async () => {
		const seed = await seedPendingInvite();

		await expectOrpcCode(
			callSet(seed.ownerId)({
				invitationId: seed.inviteId,
				status: "accepted",
			}),
			"FORBIDDEN"
		);

		await cleanup(seed);
	});
});
```

- [ ] **Step 3: 테스트 실행하여 실패 확인**

Run: `cd packages/api && pnpm vitest run src/routers/bambi/team-invitation-moderation.test.ts -t setTeamInvitationStatus`
Expected: FAIL — procedure 미구현. (프록시 필요)

- [ ] **Step 4: `setTeamInvitationStatus` 구현**

`moderation.ts`의 `listPendingTeamInvitations` 다음에 추가:

```ts
	setTeamInvitationStatus: protectedProcedure
		.input(setTeamInvitationStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [invite] = await tx
					.select()
					.from(invitation)
					.where(eq(invitation.id, input.invitationId))
					.limit(1);

				if (!invite) {
					throw new ORPCError("NOT_FOUND");
				}
				if (invite.status !== "pending") {
					throw new ORPCError("CONFLICT", {
						message: "이미 처리된 초대입니다.",
					});
				}

				if (input.status === "rejected") {
					const [updated] = await tx
						.update(invitation)
						.set({
							status: "rejected",
							rejectionReason: input.reason ?? null,
							updatedAt: new Date(),
						})
						.where(eq(invitation.id, invite.id))
						.returning();

					await tx.insert(adminModerationAction).values({
						adminUserId: admin.userId,
						targetType: "team_invitation",
						targetId: invite.id,
						action: "set_team_invitation:rejected",
						reason: input.reason ?? "반려",
						metadata: {
							organizationId: invite.organizationId,
							teamId: invite.teamId,
							invitedEmail: invite.email,
						},
					});
					return updated;
				}

				// accepted
				if (invite.expiresAt.getTime() < Date.now()) {
					throw new ORPCError("CONFLICT", { message: "만료된 초대입니다." });
				}

				const [invitee] = await tx
					.select({ userId: user.id })
					.from(user)
					.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
					.where(
						and(
							eq(user.email, invite.email.toLowerCase()),
							eq(bambiProfile.role, "employer")
						)
					)
					.limit(1);

				if (!invitee) {
					throw new ORPCError("NOT_FOUND", {
						message: "초대 대상 구인자 계정을 찾을 수 없습니다.",
					});
				}

				const [existingMember] = await tx
					.select({ id: member.id })
					.from(member)
					.where(
						and(
							eq(member.organizationId, invite.organizationId),
							eq(member.userId, invitee.userId)
						)
					)
					.limit(1);

				if (!existingMember) {
					await tx.insert(member).values({
						id: `member_${randomUUID()}`,
						organizationId: invite.organizationId,
						userId: invitee.userId,
						role: normalizeOrganizationManagementRole(invite.role) ?? "staff",
						status: "active",
						invitedEmail: invite.email,
						acceptedUserId: invitee.userId,
						createdAt: new Date(),
					});
				}

				if (invite.teamId) {
					const [existingTeamMember] = await tx
						.select({ id: teamMember.id })
						.from(teamMember)
						.where(
							and(
								eq(teamMember.teamId, invite.teamId),
								eq(teamMember.userId, invitee.userId)
							)
						)
						.limit(1);
					if (!existingTeamMember) {
						await tx.insert(teamMember).values({
							id: `team_member_${randomUUID()}`,
							teamId: invite.teamId,
							userId: invitee.userId,
							createdAt: new Date(),
						});
					}
				}

				const [updated] = await tx
					.update(invitation)
					.set({
						status: "accepted",
						acceptedUserId: invitee.userId,
						updatedAt: new Date(),
					})
					.where(eq(invitation.id, invite.id))
					.returning();

				await tx.insert(adminModerationAction).values({
					adminUserId: admin.userId,
					targetType: "team_invitation",
					targetId: invite.id,
					action: "set_team_invitation:accepted",
					reason: input.reason?.trim() || "승인",
					metadata: {
						organizationId: invite.organizationId,
						teamId: invite.teamId,
						invitedEmail: invite.email,
						joinedUserId: invitee.userId,
					},
				});

				return updated;
			});
		}),
```

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd packages/api && pnpm vitest run src/routers/bambi/team-invitation-moderation.test.ts`
Expected: PASS (모든 케이스, 프록시 필요). 프록시 없으면 `cd packages/api && pnpm check-types` PASS로 대체.

- [ ] **Step 6: 커밋**

```bash
git add packages/api/src/routers/bambi/moderation.ts packages/api/src/routers/bambi/team-invitation-moderation.test.ts
git commit -m "feat: 운영자 팀 합류 초대 승인/반려 procedure 추가
- moderation.setTeamInvitationStatus 신설 — 승인 시 트랜잭션으로 member(+teamId 있으면 teamMember) 생성 후 invitation.status=accepted
- 이미 member면 중복 생성 없이 teamMember만 추가, teamId 없으면 조직 member만 생성(다중 소속 허용)
- 반려 시 status=rejected·rejectionReason 저장, pending 아님/만료는 CONFLICT
- 승인·반려 모두 adminModerationAction(team_invitation)에 감사 로그 기록
- 합류/조직전용/중복방지/반려/만료/권한 테스트 추가"
```

---

## Task 4: 운영자 승인 페이지 `/moderator/team-invites` + nav

**Files:**
- Create: `apps/web/src/app/moderator/team-invites/page.tsx`
- Modify: `apps/web/src/app/moderator/layout.tsx` (MODERATOR_NAV_ITEMS, 7–13줄)

**Interfaces:**
- Consumes: `orpc.bambi.moderation.listPendingTeamInvitations`, `orpc.bambi.moderation.setTeamInvitationStatus`(Task 2·3).

- [ ] **Step 1: 페이지 생성**

`apps/web/src/app/moderator/team-invites/page.tsx` 신규(=/moderator/employers 패턴 미러):

```tsx
"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { orpc } from "@/utils/orpc";

const roleLabels: Record<string, string> = {
	manager: "매니저",
	owner: "소유자",
	staff: "스태프",
};

export default function ModeratorTeamInvitesPage() {
	const queryClient = useQueryClient();
	const [notes, setNotes] = useState<Record<string, string>>({});
	const pendingQuery = useQuery(
		orpc.bambi.moderation.listPendingTeamInvitations.queryOptions({ input: {} })
	);
	const decide = useMutation(
		orpc.bambi.moderation.setTeamInvitationStatus.mutationOptions({
			onSuccess: async () => {
				toast.success("처리했어요.");
				await queryClient.invalidateQueries({
					queryKey:
						orpc.bambi.moderation.listPendingTeamInvitations.queryKey({
							input: {},
						}),
				});
			},
			onError: (error) => toast.error(error.message),
		})
	);
	const invites = pendingQuery.data ?? [];

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-6">
			<h1 className="m-0 font-extrabold text-2xl">팀 합류 승인 대기</h1>
			{invites.length === 0 ? (
				<EmptyState
					description="구인자가 팀에 멤버를 초대하면 이곳에서 승인할 수 있어요."
					title="대기 중인 팀 합류 초대가 없어요"
				/>
			) : null}
			{invites.map((invite) => (
				<Card key={invite.id}>
					<CardHeader>
						<CardTitle>
							{invite.organizationName ?? "이름 없는 업소"}
							{invite.teamName ? ` · ${invite.teamName}` : " · 조직 전체"}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<p className="m-0 text-muted-foreground text-sm">
							{(invite.inviteeName ? `${invite.inviteeName} · ` : "") +
								invite.email}{" "}
							· {roleLabels[invite.role] ?? invite.role}
							{invite.inviterName ? ` · 초대: ${invite.inviterName}` : ""}
							{invite.isExpired ? " · 만료됨" : ""}
						</p>
						<Input
							onChange={(event) =>
								setNotes((prev) => ({
									...prev,
									[invite.id]: event.target.value,
								}))
							}
							placeholder="반려 사유(반려 시 필수)"
							value={notes[invite.id] ?? ""}
						/>
						<div className="flex gap-2">
							<Button
								disabled={decide.isPending || invite.isExpired}
								onClick={() =>
									decide.mutate({
										invitationId: invite.id,
										status: "accepted",
									})
								}
							>
								승인
							</Button>
							<Button
								disabled={decide.isPending}
								onClick={() =>
									decide.mutate({
										invitationId: invite.id,
										status: "rejected",
										reason: notes[invite.id]?.trim() || "정보 확인 불가",
									})
								}
								variant="secondary"
							>
								반려
							</Button>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
```

- [ ] **Step 2: nav 항목 추가**

`apps/web/src/app/moderator/layout.tsx`의 `MODERATOR_NAV_ITEMS`에서 `업소 승인` 다음 줄에 추가:

```ts
	{ href: "/moderator/employers", label: "업소 승인" },
	{ href: "/moderator/team-invites", label: "팀 합류 승인" },
	{ href: "/seeker", label: "채용정보" },
```

- [ ] **Step 3: 타입 체크**

Run: `cd apps/web && pnpm check-types`
Expected: PASS (mutation/query 입력·출력 타입이 서버 procedure와 일치)

- [ ] **Step 4: 린트**

Run: `pnpm dlx ultracite fix apps/web/src/app/moderator/team-invites/page.tsx apps/web/src/app/moderator/layout.tsx`
Expected: 포맷 정리 완료, 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/moderator/team-invites/page.tsx apps/web/src/app/moderator/layout.tsx
git commit -m "feat: 운영자 팀 합류 승인 페이지 신설
- /moderator/team-invites 페이지 추가 — listPendingTeamInvitations 카드 목록, 승인/반려 버튼, 반려 사유 입력
- 조직명·팀명(없으면 '조직 전체')·초대대상·요청 권한·초대자 표시, 만료건은 승인 비활성
- 성공 시 목록 무효화+toast, 실패 시 에러 toast (employers 페이지 패턴 미러)
- moderator nav에 '팀 합류 승인' 항목 추가"
```

---

## Task 5: 구인자 팀 관리 — 상태 문구 정리 + 반려 사유 노출

**Files:**
- Modify: `packages/api/src/routers/bambi/organizations.ts` (listMembers invitation select 230–243줄, invitation map 299–309줄)
- Modify: `apps/web/src/components/bambi/team-member-list.tsx` (statusLabels 65–72줄, 렌더 418–424줄)

**Interfaces:**
- Consumes: `invitation.rejectionReason`(Task 1).
- Produces: `listMembers`의 `kind:"invitation"` 항목에 `rejectionReason: string | null` 필드 추가.

- [ ] **Step 1: listMembers invitation select에 rejectionReason 추가**

`organizations.ts` listMembers의 두 번째(pendingInvitations) select에 `rejectionReason`를 추가(현재 232–239줄 select 객체 안, `status` 다음):

```ts
					.select({
						acceptedUserId: invitation.acceptedUserId,
						createdAt: invitation.createdAt,
						email: invitation.email,
						id: invitation.id,
						rejectionReason: invitation.rejectionReason,
						role: invitation.role,
						status: invitation.status,
						teamId: invitation.teamId,
						updatedAt: invitation.updatedAt,
					})
```

(invitation map은 `...row` 스프레드라 `rejectionReason`가 자동 포함된다. 별도 수정 불필요.)

- [ ] **Step 2: 상태 문구 조정**

`team-member-list.tsx`의 `statusLabels`(65–72줄)를 아래로 변경(운영자 승인 흐름 반영):

```ts
const statusLabels: Record<string, string> = {
	active: "활성",
	accepted: "수락됨",
	cancelled: "취소",
	expired: "만료",
	pending: "운영자 승인 대기",
	rejected: "반려됨",
};
```

- [ ] **Step 3: 반려 사유 표시 추가**

`team-member-list.tsx` 렌더에서 이메일/일시 문단(현재 422–424줄) 바로 다음에, 반려된 초대일 때 사유를 보여주는 문단을 추가한다. 변경 후:

```tsx
								<p className="mt-1 break-words text-muted-foreground text-xs">
									{member.email} · {formatDateTime(member.createdAt)}
								</p>
								{member.kind === "invitation" &&
								member.status === "rejected" &&
								member.rejectionReason ? (
									<p className="mt-1 break-words text-destructive text-xs">
										반려 사유: {member.rejectionReason}
									</p>
								) : null}
```

(`member.kind === "invitation"` 내로 좁혀 `rejectionReason` 접근 — active 분기에는 없는 필드이므로 discriminated union 좁히기가 필요.)

- [ ] **Step 4: 타입 체크**

Run: `cd apps/web && pnpm check-types && cd ../../packages/api && pnpm check-types`
Expected: PASS

- [ ] **Step 5: 린트**

Run: `pnpm dlx ultracite fix apps/web/src/components/bambi/team-member-list.tsx packages/api/src/routers/bambi/organizations.ts`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/components/bambi/team-member-list.tsx packages/api/src/routers/bambi/organizations.ts
git commit -m "feat: 구인자 팀 관리 상태 문구·반려 사유 표시
- listMembers invitation select에 rejectionReason 추가
- statusLabels 문구 조정: pending '운영자 승인 대기', rejected '반려됨'
- 반려된 초대 행에 반려 사유를 destructive 텍스트로 노출"
```

---

## Task 6: 전체 검증 + 계획 문서 체크박스 정리

**Files:**
- Modify: `docs/superpowers/plans/2026-07-08-employer-team-join-approval.md` (체크박스)

- [ ] **Step 1: 전 패키지 타입 체크**

Run: `pnpm check-types`
Expected: PASS (turbo, 전 패키지)

- [ ] **Step 2: 린트 전체 확인**

Run: `pnpm biome check`
Expected: 에러 없음

- [ ] **Step 3: API 테스트(프록시 가용 시)**

Run: `cd packages/api && pnpm vitest run src/routers/bambi/team-invitation-moderation.test.ts`
Expected: 전 케이스 PASS. 프록시 불가 시 이 스텝은 사용자에게 실행 요청으로 대체하고 그 사실을 기록.

- [ ] **Step 4: 마이그레이션 적용 안내**

`db:migrate`는 DB 연결이 필요하므로 사용자에게 `pnpm db:proxy` 상태에서 `pnpm db:migrate` 실행을 요청한다(구현자가 직접 적용하지 않음). 적용 결과를 계획에 기록.

- [ ] **Step 5: 계획 문서 체크박스 최종 동기화 후 커밋**

```bash
git add docs/superpowers/plans/2026-07-08-employer-team-join-approval.md
git commit -m "docs: 팀 합류 승인 구현 계획 진행상황 동기화"
```

---

## Self-Review 결과 (계획 작성자 확인)

- **Spec coverage**: (A) 초대 생성 유지 — 수정 없음(기존 `inviteMember`)로 커버. (B) 승인/반려 서버 — Task 2·3. (C) 운영자 페이지 — Task 4. (D) 구인자 문구/반려사유 — Task 5. (E) 권한/방어 — `requireAdminProfile`(Task 2·3), `inviteMember`는 기존 게이트 유지. 데이터 모델(rejectionReason·team_invitation) — Task 1. 감사 로그 — Task 3. 다중 소속 — Task 3(member 존재 검사 기반). 테스트 관점 전 항목 — Task 2·3 테스트로 커버.
- **Placeholder scan**: 모든 코드 스텝에 실제 코드 포함, "TBD/적절히 처리" 없음.
- **Type consistency**: `listPendingTeamInvitations` 반환 필드(`isExpired`, `teamName`, `role` 등)와 Task 4 페이지 소비 필드 일치. `setTeamInvitationStatus` 입력 `{ invitationId, status, reason? }`와 Task 4 `decide.mutate` 인자 일치. `rejectionReason`(Task 1 컬럼 → Task 5 select·UI) 이름 일관. `normalizeOrganizationManagementRole`·`randomUUID`·`alias` import는 Task 2 Step 1에서 일괄 추가.
