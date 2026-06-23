# Bambi Web Marketplace MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first web marketplace loop where employers create job posts, job seekers browse posts, start chats, and both sides manage interview schedules.

**Architecture:** Keep authority and role checks in the API layer, then make the web app a thin client over oRPC and TanStack Query. Add only the API gaps needed by the web MVP: editable employer job queries, chat room detail, and personal Bambi profile editing. Replace the sample web entry with Bambi-specific routes and reusable small components.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, @bambi-app/ui, lucide-react, Better Auth, oRPC, TanStack Query, TanStack Form, Drizzle ORM, Vitest, Ultracite.

**Current Status:** The responsive marketplace pass is complete and the Web MVP now has active `/login` and `/onboarding` entry points. Seed users can sign in through Better Auth, then continue into Bambi profile confirmation or creation before entering seeker/employer flows.

**Execution Note, 2026-06-23:** This file is historical context for the first Web MVP plan. The current route structure uses `/seeker`, `/seeker/jobs/[id]`, `/seeker/chats/[id]`, `/employer/new`, and `/employer/jobs/[id]/edit`. Continue remaining 1st Web MVP work from `docs/superpowers/plans/2026-06-23-bambi-web-mvp-completion.md`.

---

## Scope

Implement the approved web-first MVP from `docs/superpowers/specs/2026-06-12-bambi-web-marketplace-mvp-design.md`.

Included:

- Profile-aware web entry at `/`.
- Bambi onboarding at `/onboarding`.
- Public job browsing at `/jobs` and `/jobs/[id]`.
- Employer job management at `/employer`, `/employer/jobs/new`, and `/employer/jobs/[id]/edit`.
- Chat and interview scheduling at `/chats` and `/chats/[id]`.
- API support for web-owned reads and profile edits.

Excluded:

- Admin review UI.
- Employer verification approval UI.
- Report handling UI.
- WebSocket real-time chat.
- Read receipts, typing indicators, image messages.
- Review UI, contact reveal UI, video calls, paid placement, native app.

## File Structure

### API

- Modify `packages/api/src/services/bambi-onboarding.ts`
  - Add pure profile update permission helpers.
- Modify `packages/api/src/services/bambi-onboarding.test.ts`
  - Cover one-time role creation and editable personal profile fields.
- Modify `packages/api/src/services/bambi-policy.ts`
  - Export lightweight status label helpers used by web and API tests.
- Modify `packages/api/src/services/bambi-policy.test.ts`
  - Cover job priority and status label behavior.
- Modify `packages/api/src/routers/bambi/onboarding.ts`
  - Add `updateMyProfile`.
  - Include organization/team membership data needed by employer screens.
- Modify `packages/api/src/routers/bambi/jobs.ts`
  - Add `listMine`.
  - Add `getEditableById`.
  - Keep create/update authority checks in `requireEmployerPostingAccess`.
- Modify `packages/api/src/routers/bambi/chats.ts`
  - Add `getById` returning room, job summary, messages, interview schedules, and current actor user id.

### Web Shared

- Create `apps/web/src/lib/bambi-format.ts`
  - Format pay, date/time, and status labels.
- Create `apps/web/src/lib/bambi-options.ts`
  - Centralize industry, region, pay unit, and status options.
- Create `apps/web/src/components/bambi/status-badge.tsx`
  - Render compact status badges.
- Create `apps/web/src/components/bambi/empty-state.tsx`
  - Render simple empty states for lists.
- Create `apps/web/src/components/bambi/page-shell.tsx`
  - Constrain page width and provide consistent section spacing.
- Modify `apps/web/src/components/header.tsx`
  - Replace sample links with Jobs, Chats, Schedule, Employer.
- Modify `apps/web/src/components/user-menu.tsx`
  - Localize labels and keep sign-out redirect to `/`.
- Modify `apps/web/src/components/sign-in-form.tsx`
  - Redirect to `/` after sign-in.
- Modify `apps/web/src/components/sign-up-form.tsx`
  - Redirect to `/` after sign-up.
- Modify `apps/web/src/app/layout.tsx`
  - Set Korean metadata and `lang="ko"`.

### Web Routes

- Replace `apps/web/src/app/page.tsx`
  - Route users by auth/profile state.
- Create `apps/web/src/app/onboarding/page.tsx`
  - Profile creation and personal profile edit.
- Create `apps/web/src/app/jobs/page.tsx`
  - Job filters and list.
- Create `apps/web/src/app/jobs/[id]/page.tsx`
  - Job detail and chat start action.
- Create `apps/web/src/app/employer/page.tsx`
  - Employer profile status and owned job list.
- Create `apps/web/src/app/employer/jobs/new/page.tsx`
  - New job form.
- Create `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`
  - Edit owned job form.
- Create `apps/web/src/app/chats/page.tsx`
  - Chat room list.
- Create `apps/web/src/app/chats/[id]/page.tsx`
  - Message thread and interview schedule panel.

## Task 1: API Support For Web MVP

**Files:**

- Modify `packages/api/src/services/bambi-onboarding.ts`
- Modify `packages/api/src/services/bambi-onboarding.test.ts`
- Modify `packages/api/src/services/bambi-policy.ts`
- Modify `packages/api/src/services/bambi-policy.test.ts`
- Modify `packages/api/src/routers/bambi/onboarding.ts`
- Modify `packages/api/src/routers/bambi/jobs.ts`
- Modify `packages/api/src/routers/bambi/chats.ts`

- [ ] **Step 1: Add failing tests for profile update policy**

Add these cases to `packages/api/src/services/bambi-onboarding.test.ts`:

```ts
import {
	assertCanCreateBambiProfile,
	assertCanManageEmployerProfile,
	assertCanUpdateOwnBambiProfile,
	isEmployerProfileManagerRole,
} from "./bambi-onboarding";

it("allows personal profile fields to be updated without role changes", () => {
	expect(() =>
		assertCanUpdateOwnBambiProfile({
			existingRole: "job_seeker",
			requestedRole: undefined,
		})
	).not.toThrow();
});

it("blocks role changes after the Bambi profile exists", () => {
	expect(() =>
		assertCanUpdateOwnBambiProfile({
			existingRole: "job_seeker",
			requestedRole: "employer",
		})
	).toThrow("Bambi profile role cannot be changed from onboarding.");
});

it("requires an existing profile before personal profile update", () => {
	expect(() =>
		assertCanUpdateOwnBambiProfile({
			existingRole: null,
			requestedRole: undefined,
		})
	).toThrow("Bambi profile is required.");
});
```

Run: `pnpm --filter @bambi-app/api test -- bambi-onboarding`

Expected: FAIL because `assertCanUpdateOwnBambiProfile` is not exported.

- [ ] **Step 2: Implement profile update policy helper**

Add this to `packages/api/src/services/bambi-onboarding.ts`:

```ts
interface AssertCanUpdateOwnBambiProfileInput {
	existingRole?: BambiProfileRole | null;
	requestedRole?: BambiProfileRole;
}

export const assertCanUpdateOwnBambiProfile = ({
	existingRole,
	requestedRole,
}: AssertCanUpdateOwnBambiProfileInput): void => {
	if (!existingRole) {
		throw new ORPCError("NOT_FOUND", {
			message: "Bambi profile is required.",
		});
	}

	if (requestedRole && requestedRole !== existingRole) {
		throw new ORPCError("FORBIDDEN", {
			message: "Bambi profile role cannot be changed from onboarding.",
		});
	}
};
```

Run: `pnpm --filter @bambi-app/api test -- bambi-onboarding`

Expected: PASS.

- [ ] **Step 3: Add status label and priority tests**

Add these cases to `packages/api/src/services/bambi-policy.test.ts`:

```ts
import {
	getEmployerVerificationStatusLabel,
	getJobPostStatusLabel,
	shouldPrioritizeJobPost,
} from "./bambi-policy";

it("prioritizes only published posts from verified employers", () => {
	expect(
		shouldPrioritizeJobPost({
			employerVerificationStatus: "verified",
			jobPostStatus: "published",
		})
	).toBe(true);
	expect(
		shouldPrioritizeJobPost({
			employerVerificationStatus: "verified",
			jobPostStatus: "pending_review",
		})
	).toBe(false);
});

it("returns Korean labels for employer and job statuses", () => {
	expect(getEmployerVerificationStatusLabel("verified")).toBe("인증 완료");
	expect(getEmployerVerificationStatusLabel("pending")).toBe("인증 대기");
	expect(getJobPostStatusLabel("published")).toBe("공개");
	expect(getJobPostStatusLabel("pending_review")).toBe("검수 대기");
});
```

Run: `pnpm --filter @bambi-app/api test -- bambi-policy`

Expected: FAIL because the label helpers are not exported.

- [ ] **Step 4: Implement label helpers**

Add this to `packages/api/src/services/bambi-policy.ts`:

```ts
const employerVerificationStatusLabels = {
	none: "미인증",
	pending: "인증 대기",
	verified: "인증 완료",
	rejected: "인증 반려",
} as const satisfies Record<EmployerVerificationStatus, string>;

const jobPostStatusLabels = {
	draft: "임시 저장",
	pending_review: "검수 대기",
	published: "공개",
	hidden: "숨김",
	rejected: "반려",
} as const satisfies Record<JobPostStatus, string>;

export const getEmployerVerificationStatusLabel = (
	status: EmployerVerificationStatus
): string => employerVerificationStatusLabels[status];

export const getJobPostStatusLabel = (status: JobPostStatus): string =>
	jobPostStatusLabels[status];
```

Run: `pnpm --filter @bambi-app/api test -- bambi-policy`

Expected: PASS.

- [ ] **Step 5: Add `updateMyProfile` endpoint**

Modify imports in `packages/api/src/routers/bambi/onboarding.ts`:

```ts
import {
	assertCanCreateBambiProfile,
	assertCanManageEmployerProfile,
	assertCanUpdateOwnBambiProfile,
	type BambiProfileRole,
	type OrganizationRole,
} from "../../services/bambi-onboarding";
```

Add this input near `profileInput`:

```ts
const profileUpdateInput = profileInput.extend({
	role: z.enum(["job_seeker", "employer", "admin"]).optional(),
});
```

Add this router method after `getMine`:

```ts
updateMyProfile: protectedProcedure
	.input(profileUpdateInput)
	.handler(async ({ context, input }) => {
		const userId = context.session.user.id;
		const [existingProfile] = await db
			.select({ role: bambiProfile.role })
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, userId))
			.limit(1);

		assertCanUpdateOwnBambiProfile({
			existingRole: existingProfile?.role,
			requestedRole: input.role,
		});

		const [updatedProfile] = await db
			.update(bambiProfile)
			.set({
				displayName: input.displayName,
				phoneNumber: input.phoneNumber,
			})
			.where(eq(bambiProfile.userId, userId))
			.returning();

		return updatedProfile;
	}),
```

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 6: Add employer job list and editable job detail endpoints**

Modify imports in `packages/api/src/routers/bambi/jobs.ts`:

```ts
import { member, teamMember } from "@bambi-app/db/schema/auth";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { requireActiveBambiProfile, requireEmployerPostingAccess } from "../../services/bambi-authz";
```

Add these methods before `create`:

```ts
listMine: protectedProcedure.handler(async ({ context }) => {
	const profile = await requireActiveBambiProfile(context.session);

	if (profile.role === "job_seeker") {
		throw new ORPCError("FORBIDDEN");
	}

	const organizationMemberships = await db
		.select({
			organizationId: member.organizationId,
			role: member.role,
		})
		.from(member)
		.where(eq(member.userId, profile.userId));
	const teamMemberships = await db
		.select({ teamId: teamMember.teamId })
		.from(teamMember)
		.where(eq(teamMember.userId, profile.userId));
	const manageableOrganizationIds = organizationMemberships
		.filter((membership) =>
			membership.role === "owner" || membership.role === "admin"
		)
		.map((membership) => membership.organizationId);
	const assignedTeamIds = teamMemberships.map((membership) => membership.teamId);
	const accessFilters = [eq(jobPost.createdByUserId, profile.userId)];

	if (manageableOrganizationIds.length > 0) {
		accessFilters.push(inArray(jobPost.organizationId, manageableOrganizationIds));
	}

	if (assignedTeamIds.length > 0) {
		accessFilters.push(inArray(jobPost.teamId, assignedTeamIds));
	}

	return await db
		.select({
			id: jobPost.id,
			title: jobPost.title,
			industryCategory: jobPost.industryCategory,
			region: jobPost.region,
			payAmount: jobPost.payAmount,
			payUnit: jobPost.payUnit,
			status: jobPost.status,
			organizationId: jobPost.organizationId,
			teamId: jobPost.teamId,
			createdByUserId: jobPost.createdByUserId,
			employerVerificationStatus:
				employerOrganizationProfile.verificationStatus,
			createdAt: jobPost.createdAt,
			updatedAt: jobPost.updatedAt,
		})
		.from(jobPost)
		.innerJoin(
			employerOrganizationProfile,
			eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
		)
		.where(or(...accessFilters))
		.orderBy(desc(jobPost.updatedAt));
}),

getEditableById: protectedProcedure
	.input(z.object({ id: z.string().uuid() }))
	.handler(async ({ context, input }) => {
		const [post] = await db
			.select()
			.from(jobPost)
			.where(eq(jobPost.id, input.id))
			.limit(1);

		if (!post) {
			throw new ORPCError("NOT_FOUND");
		}

		await requireEmployerPostingAccess({
			organizationId: post.organizationId,
			teamId: post.teamId,
			session: context.session,
		});

		return post;
	}),
```

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 7: Add chat room detail endpoint**

Modify imports in `packages/api/src/routers/bambi/chats.ts`:

```ts
import { and, asc, desc, eq, or } from "drizzle-orm";
```

Add this method after `listMine`:

```ts
getById: protectedProcedure
	.input(z.object({ id: z.string().uuid() }))
	.handler(async ({ context, input }) => {
		const { profile, room } = await requireChatParticipant(
			input.id,
			context.session
		);

		await throwIfChatBlocked({
			actorUserId: profile.userId,
			employerUserId: room.employerUserId,
			isBlocked: room.isBlocked,
			jobSeekerUserId: room.jobSeekerUserId,
		});

		const [post] = await db
			.select({
				id: jobPost.id,
				title: jobPost.title,
				industryCategory: jobPost.industryCategory,
				region: jobPost.region,
				payAmount: jobPost.payAmount,
				payUnit: jobPost.payUnit,
				status: jobPost.status,
			})
			.from(jobPost)
			.where(eq(jobPost.id, room.jobPostId))
			.limit(1);

		const messages = await db
			.select()
			.from(chatMessage)
			.where(eq(chatMessage.chatRoomId, room.id))
			.orderBy(asc(chatMessage.createdAt));

		const schedules = await db
			.select()
			.from(interviewSchedule)
			.where(eq(interviewSchedule.chatRoomId, room.id))
			.orderBy(desc(interviewSchedule.createdAt));

		return {
			currentUserId: profile.userId,
			jobPost: post ?? null,
			messages,
			room,
			schedules,
		};
	}),
```

Run: `pnpm --filter @bambi-app/api test`

Expected: PASS.

- [ ] **Step 8: Run API verification and commit**

Run:

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
git add packages/api/src/services/bambi-onboarding.ts packages/api/src/services/bambi-onboarding.test.ts packages/api/src/services/bambi-policy.ts packages/api/src/services/bambi-policy.test.ts packages/api/src/routers/bambi/onboarding.ts packages/api/src/routers/bambi/jobs.ts packages/api/src/routers/bambi/chats.ts
git commit -m "feat: 밤비 웹 MVP API 보강

- 개인 Bambi 프로필 수정 정책과 엔드포인트를 추가
- 구인자 공고 관리와 채팅 상세 조회 API를 추가
- 웹 화면에서 사용할 상태 라벨과 우선 노출 정책 테스트를 보강"
```

Expected: tests and checks pass, commit succeeds.

## Task 2: Web Shell And Shared Components

**Files:**

- Create `apps/web/src/lib/bambi-format.ts`
- Create `apps/web/src/lib/bambi-options.ts`
- Create `apps/web/src/components/bambi/status-badge.tsx`
- Create `apps/web/src/components/bambi/empty-state.tsx`
- Create `apps/web/src/components/bambi/page-shell.tsx`
- Modify `apps/web/src/app/layout.tsx`
- Modify `apps/web/src/components/header.tsx`
- Modify `apps/web/src/components/user-menu.tsx`
- Modify `apps/web/src/components/sign-in-form.tsx`
- Modify `apps/web/src/components/sign-up-form.tsx`

- [ ] **Step 1: Create web formatting helpers**

Create `apps/web/src/lib/bambi-format.ts`:

```ts
export const formatPay = (amount: number, unit: string): string =>
	new Intl.NumberFormat("ko-KR").format(amount) + `원 / ${unit}`;

export const formatDateTime = (value: string | Date): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));

export const formatNullable = (value: null | string | undefined): string =>
	value?.trim() ? value : "미입력";
```

Create `apps/web/src/lib/bambi-options.ts`:

```ts
export const industryOptions = ["라운지", "바", "클럽", "노래방", "기타"] as const;
export const regionOptions = ["서울", "경기", "인천", "부산", "대구", "대전", "광주", "기타"] as const;
export const payUnitOptions = ["시급", "일급", "주급", "월급"] as const;

export const jobStatusLabels = {
	draft: "임시 저장",
	pending_review: "검수 대기",
	published: "공개",
	hidden: "숨김",
	rejected: "반려",
} as const;

export const verificationStatusLabels = {
	none: "미인증",
	pending: "인증 대기",
	verified: "인증 완료",
	rejected: "인증 반려",
} as const;

export const interviewStatusLabels = {
	proposed: "제안됨",
	confirmed: "확정",
	declined: "거절",
	canceled: "취소",
	completed: "완료",
} as const;
```

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 2: Create shared Bambi UI primitives**

Create `apps/web/src/components/bambi/status-badge.tsx`:

```tsx
import { cn } from "@bambi-app/ui/lib/utils";

const toneClassNames = {
	default: "border-border bg-muted text-muted-foreground",
	good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
	warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
	danger: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
} as const;

interface StatusBadgeProps {
	children: React.ReactNode;
	tone?: keyof typeof toneClassNames;
}

export function StatusBadge({ children, tone = "default" }: StatusBadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium",
				toneClassNames[tone]
			)}
		>
			{children}
		</span>
	);
}
```

Create `apps/web/src/components/bambi/empty-state.tsx`:

```tsx
interface EmptyStateProps {
	action?: React.ReactNode;
	description: string;
	title: string;
}

export function EmptyState({ action, description, title }: EmptyStateProps) {
	return (
		<div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-dashed p-6 text-center">
			<div>
				<h2 className="font-semibold text-base">{title}</h2>
				<p className="mt-1 text-muted-foreground text-sm">{description}</p>
			</div>
			{action}
		</div>
	);
}
```

Create `apps/web/src/components/bambi/page-shell.tsx`:

```tsx
interface PageShellProps {
	children: React.ReactNode;
	description?: string;
	title: string;
}

export function PageShell({ children, description, title }: PageShellProps) {
	return (
		<main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
			<header className="flex flex-col gap-1">
				<h1 className="font-semibold text-2xl tracking-normal">{title}</h1>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</header>
			{children}
		</main>
	);
}
```

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 3: Replace sample navigation with Bambi navigation**

Modify `apps/web/src/components/header.tsx` so the main links are:

```tsx
const links = [
	{ href: "/jobs", label: "공고" },
	{ href: "/chats", label: "채팅" },
	{ href: "/chats", label: "일정" },
	{ href: "/employer", label: "구인자 관리" },
] as const;
```

Render them as compact text links with active hover/focus styles. Keep `ModeToggle` and `UserMenu`.

Modify `apps/web/src/components/user-menu.tsx` labels:

```tsx
<Button variant="outline">로그인</Button>
<DropdownMenuLabel>내 계정</DropdownMenuLabel>
<DropdownMenuItem variant="destructive">로그아웃</DropdownMenuItem>
```

Modify `apps/web/src/components/sign-in-form.tsx` and `apps/web/src/components/sign-up-form.tsx` so successful auth redirects to `/`.

Modify `apps/web/src/app/layout.tsx`:

```tsx
export const metadata: Metadata = {
	description: "밤비 구인구직 웹 MVP",
	title: "밤비",
};
```

and set `<html lang="ko" suppressHydrationWarning>`.

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 4: Commit web shell**

Run:

```bash
pnpm run check-types
pnpm run check
git add apps/web/src/lib/bambi-format.ts apps/web/src/lib/bambi-options.ts apps/web/src/components/bambi/status-badge.tsx apps/web/src/components/bambi/empty-state.tsx apps/web/src/components/bambi/page-shell.tsx apps/web/src/app/layout.tsx apps/web/src/components/header.tsx apps/web/src/components/user-menu.tsx apps/web/src/components/sign-in-form.tsx apps/web/src/components/sign-up-form.tsx
git commit -m "feat: 밤비 웹 공통 셸 추가

- 밤비 상태 배지와 페이지 셸 공통 컴포넌트를 추가
- 샘플 내비게이션을 공고, 채팅, 일정, 구인자 관리 중심으로 변경
- 인증 후 이동 경로와 기본 메타데이터를 밤비 흐름에 맞게 조정"
```

Expected: checks pass, commit succeeds.

## Task 3: Entry Routing And Onboarding

**Files:**

- Replace `apps/web/src/app/page.tsx`
- Create `apps/web/src/app/onboarding/page.tsx`

- [ ] **Step 1: Replace home page with profile-aware entry**

Replace `apps/web/src/app/page.tsx` with a client component that:

- Uses `authClient.useSession()`.
- Shows login and sign-up links when signed out.
- Queries `orpc.bambi.onboarding.getMine.queryOptions()` only when signed in.
- Shows `/onboarding` action if `bambiProfile` is null.
- Shows `/jobs`, `/chats`, and `/employer` actions according to role.

Use this route decision:

```ts
const getPrimaryHref = (role: null | string | undefined): string => {
	if (!role) {
		return "/onboarding";
	}

	if (role === "employer" || role === "admin") {
		return "/employer";
	}

	return "/jobs";
};
```

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 2: Create onboarding page**

Create `apps/web/src/app/onboarding/page.tsx` as a client component with:

- `createJobSeekerProfile` mutation.
- `createEmployerProfile` mutation.
- `updateMyProfile` mutation when a profile already exists.
- Inputs: `displayName`, `phoneNumber`.
- Two explicit create buttons: `구직자로 시작`, `구인자로 시작`.
- Existing profile state that displays role and lets the user edit only display name and phone number.

Mutation pattern:

```tsx
const utils = useQueryClient();
const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
const createJobSeekerMutation = useMutation(
	orpc.bambi.onboarding.createJobSeekerProfile.mutationOptions({
		onSuccess: async () => {
			await utils.invalidateQueries({
				queryKey: orpc.bambi.onboarding.getMine.queryKey(),
			});
			router.push("/jobs");
		},
	})
);
```

Use `toast.success("프로필이 저장되었습니다.")` after successful create/update.

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 3: Commit entry and onboarding**

Run:

```bash
pnpm run check-types
pnpm run check
git add apps/web/src/app/page.tsx apps/web/src/app/onboarding/page.tsx
git commit -m "feat: 밤비 진입과 온보딩 화면 추가

- 로그인과 Bambi 프로필 상태에 따라 첫 화면 행동을 분기
- 구직자와 구인자 프로필 생성 화면을 추가
- 기존 프로필의 표시명과 휴대폰 번호 수정 흐름을 추가"
```

Expected: checks pass, commit succeeds.

## Task 4: Job Browsing And Job Detail

**Files:**

- Create `apps/web/src/app/jobs/page.tsx`
- Create `apps/web/src/app/jobs/[id]/page.tsx`

- [ ] **Step 1: Create job list page**

Create `apps/web/src/app/jobs/page.tsx` as a client component with:

- Local filter state for `industryCategory`, `region`, `minPayAmount`.
- Query `orpc.bambi.jobs.list.queryOptions({ input })`.
- Filter controls using `<select>` and `<Input />`.
- Job rows linking to `/jobs/${post.id}`.
- Verification badge using `verificationStatusLabels`.
- Pay using `formatPay`.
- Empty state when no posts match.

Query input construction:

```ts
const input = {
	industryCategory: industryCategory || undefined,
	limit: 30,
	minPayAmount: minPayAmount ? Number(minPayAmount) : undefined,
	region: region || undefined,
};
```

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 2: Create job detail page**

Create `apps/web/src/app/jobs/[id]/page.tsx` as a client component with:

- Query `orpc.bambi.jobs.getById.queryOptions({ input: { id } })`.
- Mutation `orpc.bambi.chats.startFromJobPost`.
- On chat start success, route to `/chats/${room.id}`.
- Display title, status, region, industry, pay, work schedule, description, interview notes.
- If chat start fails because phone verification is required, show the API error message via toast.

Use Next params with React 19:

```tsx
export default function JobDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
}
```

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 3: Commit job browsing**

Run:

```bash
pnpm run check-types
pnpm run check
git add apps/web/src/app/jobs/page.tsx apps/web/src/app/jobs/[id]/page.tsx
git commit -m "feat: 밤비 공고 탐색 화면 추가

- 업종, 지역, 급여 필터가 있는 공고 목록 화면을 추가
- 공고 상세 화면과 채팅 시작 액션을 연결
- 공고 상태와 구인자 인증 상태를 화면에서 확인할 수 있게 구성"
```

Expected: checks pass, commit succeeds.

## Task 5: Employer Management And Job Posting

**Files:**

- Create `apps/web/src/app/employer/page.tsx`
- Create `apps/web/src/app/employer/jobs/new/page.tsx`
- Create `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`

- [ ] **Step 1: Create employer home page**

Create `apps/web/src/app/employer/page.tsx` as a client component with:

- Query `orpc.bambi.onboarding.getMine`.
- Query `orpc.bambi.jobs.listMine`.
- If no Bambi profile, link to `/onboarding`.
- If role is `job_seeker`, show access-limited state and link to `/jobs`.
- Show organization profile cards with verification status.
- Show team profile cards with region.
- Show owned job list and `새 공고 등록` button.

Use `jobStatusLabels` and `verificationStatusLabels`.

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 2: Create shared form shape inside new job page**

Create `apps/web/src/app/employer/jobs/new/page.tsx` with local state:

```ts
const emptyJobForm = {
	description: "",
	industryCategory: industryOptions[0],
	interviewNotes: "",
	organizationId: "",
	payAmount: "",
	payUnit: payUnitOptions[0],
	region: regionOptions[0],
	teamId: "",
	title: "",
	workSchedule: "",
};
```

Build `toJobInput(form)`:

```ts
const toJobInput = (form: typeof emptyJobForm) => ({
	description: form.description,
	industryCategory: form.industryCategory,
	interviewNotes: form.interviewNotes || undefined,
	organizationId: form.organizationId,
	payAmount: Number(form.payAmount),
	payUnit: form.payUnit,
	region: form.region,
	teamId: form.teamId || undefined,
	title: form.title,
	workSchedule: form.workSchedule,
});
```

Use `orpc.bambi.jobs.create.mutationOptions()` and route to `/employer` after success.

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 3: Create edit job page**

Create `apps/web/src/app/employer/jobs/[id]/edit/page.tsx` as a client component with:

- Query `orpc.bambi.jobs.getEditableById`.
- Prefill the same form shape.
- Keep `organizationId` and `teamId` disabled/read-only.
- Mutation `orpc.bambi.jobs.update`.
- Route to `/employer` after success.

Use this update payload:

```ts
updateMutation.mutate({
	data: toJobInput(form),
	id,
});
```

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 4: Commit employer job management**

Run:

```bash
pnpm run check-types
pnpm run check
git add apps/web/src/app/employer/page.tsx apps/web/src/app/employer/jobs/new/page.tsx apps/web/src/app/employer/jobs/[id]/edit/page.tsx
git commit -m "feat: 밤비 구인자 공고 관리 추가

- 구인자 관리 홈에서 조직, 팀, 공고 상태를 확인할 수 있게 구성
- 공고 등록 화면을 실제 API와 연결
- 공고 수정 화면에서 소속 조직과 팀을 유지한 채 공개 내용을 수정하게 구성"
```

Expected: checks pass, commit succeeds.

## Task 6: Chat And Interview Scheduling

**Files:**

- Create `apps/web/src/app/chats/page.tsx`
- Create `apps/web/src/app/chats/[id]/page.tsx`

- [ ] **Step 1: Create chat room list page**

Create `apps/web/src/app/chats/page.tsx` as a client component with:

- Query `orpc.bambi.chats.listMine`.
- Render room rows linking to `/chats/${room.id}`.
- Show `jobPostId`, `updatedAt`, and whether the room is blocked.
- Empty state for no chats.

Use `formatDateTime(room.updatedAt)`.

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 2: Create chat detail page**

Create `apps/web/src/app/chats/[id]/page.tsx` as a client component with:

- Query `orpc.bambi.chats.getById`.
- Message list aligned by `message.senderUserId === currentUserId`.
- Message form using `sendMessage`.
- Interview form with `datetime-local` and optional location note.
- Schedule list with confirm/decline buttons only when `schedule.status === "proposed"` and `schedule.proposedByUserId !== currentUserId`.
- Refetch room detail after every mutation.

Mutation invalidation pattern:

```ts
const invalidateRoom = async () => {
	await queryClient.invalidateQueries({
		queryKey: orpc.bambi.chats.getById.queryKey({ input: { id } }),
	});
	await queryClient.invalidateQueries({
		queryKey: orpc.bambi.chats.listMine.queryKey(),
	});
};
```

Run: `pnpm run check-types`

Expected: PASS.

- [ ] **Step 3: Commit chat and scheduling**

Run:

```bash
pnpm run check-types
pnpm run check
git add apps/web/src/app/chats/page.tsx apps/web/src/app/chats/[id]/page.tsx
git commit -m "feat: 밤비 채팅과 면접 일정 화면 추가

- 내 채팅방 목록과 채팅 상세 화면을 추가
- 메시지 전송 후 채팅 상세와 목록을 갱신
- 면접 일정 제안, 확정, 거절 액션을 화면에서 처리"
```

Expected: checks pass, commit succeeds.

## Task 7: End-To-End Local Verification

**Files:**

- Modify files only when verification exposes concrete defects.

- [ ] **Step 1: Refresh seed data**

Run:

```bash
pnpm run db:seed:bambi
```

Expected: seed succeeds and the following accounts exist:

- `seeker@bambi.dev` / `Bambi1234!`
- `owner@bambi.dev` / `Bambi1234!`
- `staff@bambi.dev` / `Bambi1234!`
- `pending-owner@bambi.dev` / `Bambi1234!`
- `admin@bambi.dev` / `Bambi1234!`

- [ ] **Step 2: Run automated verification**

Run:

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
```

Expected: all commands pass.

- [ ] **Step 3: Start local services**

Run server in one terminal:

```bash
pnpm run dev:server
```

Expected: server starts without TypeScript or runtime errors.

Run web in another terminal:

```bash
pnpm run dev:web
```

Expected: web starts on `http://localhost:23001`.

- [ ] **Step 4: Browser verify seeker flow**

Use Browser or Playwright against `http://localhost:23001`.

Verify:

- Sign in as `seeker@bambi.dev`.
- `/` sends the user toward job browsing.
- `/jobs` lists published jobs.
- Filtering by region or industry updates results.
- Opening a job detail shows pay, region, work schedule, description, and interview notes.
- Starting a chat routes to `/chats/[id]`.
- Sending a message persists after refetch.

- [ ] **Step 5: Browser verify employer flow**

Use Browser or Playwright against `http://localhost:23001`.

Verify:

- Sign in as `owner@bambi.dev`.
- `/employer` shows organization verification status and owned jobs.
- `/employer/jobs/new` creates a job.
- A safe post from a verified organization becomes `published`.
- An unverified or risky post remains `pending_review`.
- Editing an owned job preserves organization and team.

- [ ] **Step 6: Browser verify interview flow**

Use Browser or Playwright against `http://localhost:23001`.

Verify:

- Employer opens the chat room and proposes an interview schedule.
- Job seeker opens the same chat room.
- Job seeker can confirm or decline the employer's proposed schedule.
- The proposer cannot confirm their own proposal.

- [ ] **Step 7: Commit verification fixes if needed**

If verification required code fixes, run:

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
git add apps/web packages/api
git commit -m "fix: 밤비 웹 MVP 검증 오류 수정

- 로컬 검증 중 발견한 화면 또는 API 오류를 수정
- 공고, 채팅, 면접 일정 흐름의 갱신 동작을 안정화
- 최종 타입 검사와 Ultracite 검사를 통과하도록 정리"
```

Expected: verification commands pass, commit succeeds only when fixes were made.

## Final Verification

Run before opening PR or merging:

```bash
pnpm run db:seed:bambi
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
```

Expected: all commands pass.

Manual browser checks:

- `seeker@bambi.dev` can browse jobs, open a detail page, start chat, send message, and answer an interview proposal.
- `owner@bambi.dev` can see employer status, create a post, edit a post, send chat messages, and propose interview schedules.
- `staff@bambi.dev` can access assigned-team posting behavior according to API permissions.
- `pending-owner@bambi.dev` can create a post that remains in review when verification is not complete.

## Execution Notes

- Use a `codex/` branch or worktree before implementation.
- Keep each task commit separate.
- Do not expand into admin review, report handling, contact reveal, video, or native screens.
- If API response shape becomes awkward for a screen, prefer a small read endpoint over moving permission logic into the web app.
- Keep role switching out of onboarding. Existing users can edit personal profile fields, but cannot change `job_seeker`, `employer`, or `admin` role from the web MVP.
