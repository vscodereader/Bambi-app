# Bambi Domain Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first backend foundation for Bambi: Better Auth organization support, Bambi domain schema, policy helpers, and oRPC routers for organization-owned job posts, chats, interviews, contact consent, reports, and admin moderation.

**Architecture:** Keep this first implementation backend-only so the product domain is testable before UI work. Better Auth remains responsible for account identity, sessions, cookies, organization membership, invitations, and organization teams. Bambi-specific authorization lives in API services: pure business rules in `packages/api/src/services/bambi-policy.ts`, request/user authorization helpers in `packages/api/src/services/bambi-authz.ts`, product-specific organization verification tables in `packages/db/src/schema/bambi.ts`, and oRPC routers under `packages/api/src/routers/bambi/`.

**Tech Stack:** TypeScript, pnpm workspaces, Turborepo, Drizzle ORM with PostgreSQL, Better Auth session context, oRPC, Zod, Vitest, Ultracite/Biome.

**Current Status, 2026-06-26:** Historical context. The backend domain foundation has execution notes showing API tests, type checks, Ultracite, migration generation, and migration drift checks passing. Unchecked boxes below are preserved from the original implementation recipe and are not active roadmap tracking.

---

## Scope

This plan implements the backend domain foundation only.

Included:

- Vitest setup for domain tests.
- Better Auth organization plugin with teams enabled.
- Bambi database schema.
- Better Auth and Bambi authorization boundary.
- Policy helpers for organization-based visibility, contact reveal, chat eligibility, and moderation status.
- Authorization helpers for Bambi profile, organization membership, team membership, chat participant, and admin checks.
- Job post router.
- Chat, interview, and contact consent router.
- Report and admin moderation router.
- Router registration.
- Type checks and Ultracite check.

Excluded from this plan:

- Mobile web screens.
- Admin web screens.
- Native app work.
- Video chat.
- Payment or paid placement.
- External phone, business, or adult verification provider integrations.
- Dynamic access-control customization beyond the default owner/admin/member organization roles.

## File Structure

- Create `packages/db/src/schema/bambi.ts`: Bambi domain tables, enums, relations, and shared enum values.
- Modify `packages/db/src/schema/index.ts`: export Bambi schema.
- Modify `packages/auth/src/index.ts`: add Better Auth organization plugin with teams enabled.
- Modify `apps/web/src/lib/auth-client.ts`: add Better Auth organization client plugin with teams enabled.
- Modify `apps/native/lib/auth-client.ts`: add Better Auth organization client plugin with teams enabled.
- Modify `packages/db/src/schema/auth.ts`: update through Better Auth CLI schema generation after adding the plugin.
- Create `packages/api/src/services/bambi-policy.ts`: pure policy functions used by routers and tests.
- Create `packages/api/src/services/bambi-policy.test.ts`: tests for policy decisions.
- Create `packages/api/src/services/bambi-authz.ts`: reusable authorization helpers built on Better Auth session user IDs, Better Auth organization membership, Better Auth teams, and Bambi domain tables.
- Create `packages/api/src/routers/bambi/jobs.ts`: job post creation, listing, detail, update, and status operations.
- Create `packages/api/src/routers/bambi/chats.ts`: chat room creation, messages, interview proposals, schedule state changes, and contact reveal consent.
- Create `packages/api/src/routers/bambi/moderation.ts`: reports and admin moderation operations.
- Create `packages/api/src/routers/bambi/index.ts`: compose Bambi routers.
- Modify `packages/api/src/routers/index.ts`: register `bambi`.
- Modify `packages/api/package.json`: add test script.
- Modify root `package.json`: add root `test` script and Vitest dev dependency.

## Domain Conventions

Use these domain values consistently.

```ts
export const bambiUserRoles = ["job_seeker", "employer", "admin"] as const;
export const accountStatuses = ["active", "warned", "suspended"] as const;
export const employerVerificationStatuses = [
	"none",
	"pending",
	"verified",
	"rejected",
] as const;
export const jobPostStatuses = [
	"draft",
	"pending_review",
	"published",
	"hidden",
	"rejected",
] as const;
export const interviewStatuses = [
	"proposed",
	"confirmed",
	"declined",
	"canceled",
	"completed",
] as const;
export const reportStatuses = ["open", "reviewing", "resolved", "dismissed"] as const;
```

## Better Auth Boundary

Use Better Auth for:

- Creating accounts.
- Signing users in and out.
- Reading the current session in `createContext`.
- Cookie, CSRF, and trusted origin handling.
- Employer organizations.
- Organization members, invitations, and active organization.
- Organization teams for branch, department, or venue-level subdivisions.
- Future phone verification via the Better Auth phone number plugin.
- Future platform-level admin user management via the Better Auth admin plugin if needed.

This plan modifies `packages/auth/src/index.ts` to add the Better Auth organization plugin with teams enabled. Re-run the Better Auth CLI after adding the plugin because plugin schema changes must be generated or migrated through the Better Auth CLI. Phone number and admin plugins remain separate follow-up integrations.

Use Bambi domain tables and API helpers for:

- Job seeker, employer, and admin product roles.
- Account status inside the Bambi product: `active`, `warned`, `suspended`.
- Employer organization business or venue verification.
- Whether a member can create a post for an organization or team.
- Whether a user can start a chat, send a message, reveal contact details, or perform moderation.
- Audit logging for product moderation actions.

In this foundation plan, `bambiProfile.isPhoneVerified` is the product-level gate used by Bambi APIs. When the Better Auth phone number plugin is introduced, the integration plan must either sync Better Auth's verified phone state into `bambiProfile.isPhoneVerified` or replace the Bambi gate with a typed helper that reads Better Auth's phone verification field directly.

Do not rely on client-provided role, verification, or account status values. Routers must derive the user ID from `context.session.user.id`, then load Bambi profile and ownership data from the database.

Do not store Bambi role, employer verification, or product suspension only inside the Better Auth session cookie. Better Auth custom session fields may not be present in every cache strategy, and product authorization needs fresh database state for moderation-sensitive actions.

## Employer Organization Model

Map Bambi employer concepts to Better Auth organization features like this:

- Better Auth `organization`: employer business, venue group, or store group.
- Better Auth `member`: user membership inside an employer organization.
- Better Auth member roles: `owner` for representative, `admin` for manager, `member` for staff.
- Better Auth `team`: branch, department, venue, or internal hiring unit.
- Better Auth `teamMember`: staff assignment to a branch or department.
- Bambi `employerOrganizationProfile`: product-specific verification, public display metadata, and moderation state for the organization.
- Bambi `employerTeamProfile`: optional product-specific metadata for a team.
- Bambi `jobPost`: belongs to an organization, optionally belongs to a team, and records the user who created it.

MVP posting permissions:

- Organization `owner` and `admin` can create posts for the whole organization and any team under it.
- Organization `member` can create posts only for teams they belong to.
- If no team is selected, a `member` cannot create an organization-wide post.
- Organization verification controls badge and default listing priority.
- Team verification is optional and can override display metadata, but does not replace organization verification in the MVP.

---

### Task 1: Add Test Harness and Policy Tests

**Files:**

- Modify: `package.json`
- Modify: `packages/api/package.json`
- Create: `packages/api/src/services/bambi-policy.ts`
- Create: `packages/api/src/services/bambi-policy.test.ts`

- [ ] **Step 1: Add Vitest scripts and dependency**

Update root `package.json` scripts and dev dependencies:

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "check-types": "turbo check-types",
    "dev:native": "turbo -F native dev",
    "dev:web": "turbo -F web dev",
    "dev:server": "turbo -F server dev",
    "db:push": "turbo -F @bambi-app/db db:push",
    "db:studio": "turbo -F @bambi-app/db db:studio",
    "db:generate": "turbo -F @bambi-app/db db:generate",
    "db:migrate": "turbo -F @bambi-app/db db:migrate",
    "check": "ultracite check",
    "fix": "ultracite fix",
    "test": "turbo test"
  },
  "devDependencies": {
    "@bambi-app/config": "workspace:*",
    "@biomejs/biome": "2.4.16",
    "@types/node": "^22.13.14",
    "lefthook": "latest",
    "turbo": "^2.9.16",
    "typescript": "catalog:",
    "ultracite": "7.8.3",
    "vitest": "^4.0.15"
  }
}
```

Update `packages/api/package.json`:

```json
{
  "name": "@bambi-app/api",
  "type": "module",
  "exports": {
    ".": {
      "default": "./src/index.ts"
    },
    "./*": {
      "default": "./src/*.ts"
    }
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@bambi-app/auth": "workspace:*",
    "@bambi-app/db": "workspace:*",
    "@bambi-app/env": "workspace:*",
    "@orpc/client": "catalog:",
    "@orpc/openapi": "catalog:",
    "@orpc/server": "catalog:",
    "@orpc/zod": "catalog:",
    "@types/pg": "catalog:",
    "better-auth": "catalog:",
    "dotenv": "catalog:",
    "drizzle-orm": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@bambi-app/config": "workspace:*",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 2: Write failing policy tests**

Create `packages/api/src/services/bambi-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	canRevealContact,
	canStartChat,
	getInitialJobPostStatus,
	getUpdatedJobPostStatus,
	shouldPrioritizeJobPost,
} from "./bambi-policy";

describe("bambi policy", () => {
	it("publishes verified employer posts immediately", () => {
		expect(
			getInitialJobPostStatus({
				employerVerificationStatus: "verified",
				hasRiskFlags: false,
			}),
		).toBe("published");
	});

	it("keeps unverified employer posts pending review", () => {
		expect(
			getInitialJobPostStatus({
				employerVerificationStatus: "none",
				hasRiskFlags: false,
			}),
		).toBe("pending_review");
	});

	it("keeps risky verified employer posts pending review", () => {
		expect(
			getInitialJobPostStatus({
				employerVerificationStatus: "verified",
				hasRiskFlags: true,
			}),
		).toBe("pending_review");
	});

	it("returns approved unverified edited posts to review when public content changes", () => {
		expect(
			getUpdatedJobPostStatus({
				currentStatus: "published",
				employerVerificationStatus: "none",
				publicContentChanged: true,
			}),
		).toBe("pending_review");
	});

	it("keeps verified edited posts published when no risk flags exist", () => {
		expect(
			getUpdatedJobPostStatus({
				currentStatus: "published",
				employerVerificationStatus: "verified",
				publicContentChanged: true,
			}),
		).toBe("published");
	});

	it("requires phone verification and active accounts before chat starts", () => {
		expect(
			canStartChat({
				accountStatus: "active",
				isPhoneVerified: true,
				jobPostStatus: "published",
			}),
		).toBe(true);

		expect(
			canStartChat({
				accountStatus: "active",
				isPhoneVerified: false,
				jobPostStatus: "published",
			}),
		).toBe(false);
	});

	it("reveals contact only after confirmed interview and owner consent", () => {
		expect(
			canRevealContact({
				interviewStatus: "confirmed",
				ownerConsented: true,
				ownerPhoneVerified: true,
			}),
		).toBe(true);

		expect(
			canRevealContact({
				interviewStatus: "proposed",
				ownerConsented: true,
				ownerPhoneVerified: true,
			}),
		).toBe(false);
	});

	it("prioritizes published verified employer posts", () => {
		expect(
			shouldPrioritizeJobPost({
				employerVerificationStatus: "verified",
				jobPostStatus: "published",
			}),
		).toBe(true);

		expect(
			shouldPrioritizeJobPost({
				employerVerificationStatus: "none",
				jobPostStatus: "published",
			}),
		).toBe(false);
	});
});
```

- [ ] **Step 3: Run policy tests and verify they fail**

Run:

```bash
pnpm --filter @bambi-app/api test
```

Expected: FAIL because `packages/api/src/services/bambi-policy.ts` does not exist.

- [ ] **Step 4: Implement policy helpers**

Create `packages/api/src/services/bambi-policy.ts`:

```ts
export const employerVerificationStatuses = [
	"none",
	"pending",
	"verified",
	"rejected",
] as const;
export const jobPostStatuses = [
	"draft",
	"pending_review",
	"published",
	"hidden",
	"rejected",
] as const;
export const accountStatuses = ["active", "warned", "suspended"] as const;
export const interviewStatuses = [
	"proposed",
	"confirmed",
	"declined",
	"canceled",
	"completed",
] as const;

export type EmployerVerificationStatus =
	(typeof employerVerificationStatuses)[number];
export type JobPostStatus = (typeof jobPostStatuses)[number];
export type AccountStatus = (typeof accountStatuses)[number];
export type InterviewStatus = (typeof interviewStatuses)[number];

interface InitialJobPostStatusInput {
	employerVerificationStatus: EmployerVerificationStatus;
	hasRiskFlags: boolean;
}

interface UpdatedJobPostStatusInput {
	currentStatus: JobPostStatus;
	employerVerificationStatus: EmployerVerificationStatus;
	publicContentChanged: boolean;
}

interface CanStartChatInput {
	accountStatus: AccountStatus;
	isPhoneVerified: boolean;
	jobPostStatus: JobPostStatus;
}

interface CanRevealContactInput {
	interviewStatus: InterviewStatus;
	ownerConsented: boolean;
	ownerPhoneVerified: boolean;
}

interface ShouldPrioritizeJobPostInput {
	employerVerificationStatus: EmployerVerificationStatus;
	jobPostStatus: JobPostStatus;
}

export const getInitialJobPostStatus = ({
	employerVerificationStatus,
	hasRiskFlags,
}: InitialJobPostStatusInput): JobPostStatus => {
	if (hasRiskFlags) {
		return "pending_review";
	}

	if (employerVerificationStatus === "verified") {
		return "published";
	}

	return "pending_review";
};

export const getUpdatedJobPostStatus = ({
	currentStatus,
	employerVerificationStatus,
	publicContentChanged,
}: UpdatedJobPostStatusInput): JobPostStatus => {
	if (currentStatus !== "published") {
		return currentStatus;
	}

	if (!publicContentChanged) {
		return currentStatus;
	}

	if (employerVerificationStatus === "verified") {
		return "published";
	}

	return "pending_review";
};

export const canStartChat = ({
	accountStatus,
	isPhoneVerified,
	jobPostStatus,
}: CanStartChatInput): boolean =>
	accountStatus !== "suspended" &&
	isPhoneVerified &&
	jobPostStatus === "published";

export const canRevealContact = ({
	interviewStatus,
	ownerConsented,
	ownerPhoneVerified,
}: CanRevealContactInput): boolean =>
	interviewStatus === "confirmed" && ownerConsented && ownerPhoneVerified;

export const shouldPrioritizeJobPost = ({
	employerVerificationStatus,
	jobPostStatus,
}: ShouldPrioritizeJobPostInput): boolean =>
	employerVerificationStatus === "verified" && jobPostStatus === "published";
```

- [ ] **Step 5: Run policy tests and verify they pass**

Run:

```bash
pnpm --filter @bambi-app/api test
```

Expected: PASS for `bambi-policy.test.ts`.

- [ ] **Step 6: Commit test harness and policy helpers**

Run:

```bash
git add package.json packages/api/package.json packages/api/src/services/bambi-policy.ts packages/api/src/services/bambi-policy.test.ts pnpm-lock.yaml
git commit -m "test: add bambi policy coverage"
```

---

### Task 2: Enable Better Auth Organizations and Teams

**Files:**

- Modify: `packages/auth/src/index.ts`
- Modify: `apps/web/src/lib/auth-client.ts`
- Modify: `apps/native/lib/auth-client.ts`
- Modify: `packages/db/src/schema/auth.ts`

- [ ] **Step 1: Add the server organization plugin**

Modify `packages/auth/src/index.ts`:

```ts
import { createDb } from "@bambi-app/db";
import * as schema from "@bambi-app/db/schema/auth";
import { env } from "@bambi-app/env/server";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

export function createAuth() {
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",

			schema,
		}),
		trustedOrigins: [
			env.CORS_ORIGIN,
			"bambi-app://",
			"exp://",
			"http://localhost:8081",
		],
		emailAndPassword: {
			enabled: true,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
		},
		plugins: [
			expo(),
			organization({
				teams: {
					enabled: true,
					allowRemovingAllTeams: false,
				},
			}),
		],
	});
}

export const auth = createAuth();
```

- [ ] **Step 2: Add the web organization client plugin**

Modify `apps/web/src/lib/auth-client.ts`:

```ts
import { env } from "@bambi-app/env/web";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
	baseURL: env.NEXT_PUBLIC_SERVER_URL,
	plugins: [
		organizationClient({
			teams: {
				enabled: true,
			},
		}),
	],
});
```

- [ ] **Step 3: Add the native organization client plugin**

Modify `apps/native/lib/auth-client.ts`:

```ts
import { env } from "@bambi-app/env/native";
import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
	baseURL: env.EXPO_PUBLIC_SERVER_URL,
	plugins: [
		expoClient({
			scheme: Constants.expoConfig?.scheme as string,
			storagePrefix: Constants.expoConfig?.scheme as string,
			storage: SecureStore,
		}),
		organizationClient({
			teams: {
				enabled: true,
			},
		}),
	],
});
```

- [ ] **Step 4: Generate Better Auth organization schema**

Run:

```bash
pnpm dlx @better-auth/cli@latest generate --config packages/auth/src/index.ts
```

Expected: Better Auth updates the auth schema to include organization, member, invitation, team, and team member models. Keep the generated Drizzle schema in `packages/db/src/schema/auth.ts`.

- [ ] **Step 5: Verify the auth endpoint still responds**

Start the server if it is not running:

```bash
pnpm run dev:server
```

Then call:

```bash
curl http://localhost:3000/api/auth/ok
```

Expected: response includes `"status":"ok"`.

- [ ] **Step 6: Commit organization auth integration**

Run:

```bash
git add packages/auth/src/index.ts apps/web/src/lib/auth-client.ts apps/native/lib/auth-client.ts packages/db/src/schema/auth.ts
git commit -m "feat: enable employer organizations"
```

---

### Task 3: Add Bambi Database Schema

**Files:**

- Create: `packages/db/src/schema/bambi.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create Bambi schema**

Create `packages/db/src/schema/bambi.ts`:

```ts
import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const bambiUserRole = pgEnum("bambi_user_role", [
	"job_seeker",
	"employer",
	"admin",
]);
export const accountStatus = pgEnum("account_status", [
	"active",
	"warned",
	"suspended",
]);
export const employerVerificationStatus = pgEnum(
	"employer_verification_status",
	["none", "pending", "verified", "rejected"],
);
export const jobPostStatus = pgEnum("job_post_status", [
	"draft",
	"pending_review",
	"published",
	"hidden",
	"rejected",
]);
export const interviewStatus = pgEnum("interview_status", [
	"proposed",
	"confirmed",
	"declined",
	"canceled",
	"completed",
]);
export const reportStatus = pgEnum("report_status", [
	"open",
	"reviewing",
	"resolved",
	"dismissed",
]);
export const moderationTargetType = pgEnum("moderation_target_type", [
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"user",
]);

export const bambiProfile = pgTable(
	"bambi_profile",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		role: bambiUserRole("role").notNull(),
		status: accountStatus("status").default("active").notNull(),
		isPhoneVerified: boolean("is_phone_verified").default(false).notNull(),
		phoneNumber: text("phone_number"),
		displayName: text("display_name"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("bambi_profile_role_idx").on(table.role),
		index("bambi_profile_status_idx").on(table.status),
	],
);

export const employerOrganizationProfile = pgTable(
	"employer_organization_profile",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: text("organization_id").notNull(),
		displayName: text("display_name").notNull(),
		businessRegistrationNumber: text("business_registration_number"),
		verificationStatus: employerVerificationStatus("verification_status")
			.default("none")
			.notNull(),
		verificationNote: text("verification_note"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("employer_organization_profile_org_id_idx").on(
			table.organizationId,
		),
		index("employer_organization_profile_verification_status_idx").on(
			table.verificationStatus,
		),
	],
);

export const employerTeamProfile = pgTable(
	"employer_team_profile",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: text("organization_id").notNull(),
		teamId: text("team_id").notNull(),
		displayName: text("display_name").notNull(),
		region: text("region"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("employer_team_profile_team_id_idx").on(table.teamId),
		index("employer_team_profile_org_id_idx").on(table.organizationId),
	],
);

export const jobPost = pgTable(
	"job_post",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: text("organization_id").notNull(),
		teamId: text("team_id"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: jobPostStatus("status").default("pending_review").notNull(),
		industryCategory: text("industry_category").notNull(),
		region: text("region").notNull(),
		payAmount: integer("pay_amount").notNull(),
		payUnit: text("pay_unit").notNull(),
		workSchedule: text("work_schedule").notNull(),
		title: text("title").notNull(),
		description: text("description").notNull(),
		interviewNotes: text("interview_notes"),
		rejectionReason: text("rejection_reason"),
		riskFlags: jsonb("risk_flags").$type<string[]>().default([]).notNull(),
		publishedAt: timestamp("published_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("job_post_organization_id_idx").on(table.organizationId),
		index("job_post_team_id_idx").on(table.teamId),
		index("job_post_created_by_user_id_idx").on(table.createdByUserId),
		index("job_post_status_idx").on(table.status),
		index("job_post_discovery_idx").on(
			table.status,
			table.industryCategory,
			table.region,
			table.payAmount,
		),
	],
);

export const chatRoom = pgTable(
	"chat_room",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id").notNull(),
		teamId: text("team_id"),
		employerUserId: text("employer_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		jobSeekerUserId: text("job_seeker_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		isBlocked: boolean("is_blocked").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("chat_room_unique_participants_idx").on(
			table.jobPostId,
			table.jobSeekerUserId,
		),
		index("chat_room_organization_id_idx").on(table.organizationId),
		index("chat_room_team_id_idx").on(table.teamId),
		index("chat_room_employer_user_id_idx").on(table.employerUserId),
		index("chat_room_job_seeker_user_id_idx").on(table.jobSeekerUserId),
	],
);

export const chatMessage = pgTable(
	"chat_message",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		senderUserId: text("sender_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		body: text("body").notNull(),
		riskFlags: jsonb("risk_flags").$type<string[]>().default([]).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("chat_message_chat_room_id_idx").on(table.chatRoomId),
		index("chat_message_sender_user_id_idx").on(table.senderUserId),
	],
);

export const interviewSchedule = pgTable(
	"interview_schedule",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		proposedByUserId: text("proposed_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: interviewStatus("status").default("proposed").notNull(),
		scheduledAt: timestamp("scheduled_at").notNull(),
		locationNote: text("location_note"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("interview_schedule_chat_room_id_idx").on(table.chatRoomId),
		index("interview_schedule_status_idx").on(table.status),
	],
);

export const contactRevealConsent = pgTable(
	"contact_reveal_consent",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		interviewScheduleId: uuid("interview_schedule_id")
			.notNull()
			.references(() => interviewSchedule.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		contactMethod: text("contact_method").notNull(),
		contactValue: text("contact_value").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("contact_reveal_consent_unique_idx").on(
			table.interviewScheduleId,
			table.userId,
			table.contactMethod,
		),
	],
);

export const userBlock = pgTable(
	"user_block",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		blockerUserId: text("blocker_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		blockedUserId: text("blocked_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		chatRoomId: uuid("chat_room_id").references(() => chatRoom.id, {
			onDelete: "cascade",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("user_block_unique_idx").on(
			table.blockerUserId,
			table.blockedUserId,
		),
	],
);

export const review = pgTable(
	"review",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		interviewScheduleId: uuid("interview_schedule_id")
			.notNull()
			.references(() => interviewSchedule.id, { onDelete: "cascade" }),
		reviewerUserId: text("reviewer_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		targetUserId: text("target_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		rating: integer("rating").notNull(),
		body: text("body"),
		isHidden: boolean("is_hidden").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("review_unique_interview_reviewer_idx").on(
			table.interviewScheduleId,
			table.reviewerUserId,
		),
		index("review_target_user_id_idx").on(table.targetUserId),
	],
);

export const report = pgTable(
	"report",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		reporterUserId: text("reporter_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		targetType: moderationTargetType("target_type").notNull(),
		targetId: text("target_id").notNull(),
		reason: text("reason").notNull(),
		details: text("details"),
		status: reportStatus("status").default("open").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("report_status_idx").on(table.status),
		index("report_target_idx").on(table.targetType, table.targetId),
	],
);

export const adminModerationAction = pgTable(
	"admin_moderation_action",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		adminUserId: text("admin_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		targetType: moderationTargetType("target_type").notNull(),
		targetId: text("target_id").notNull(),
		action: text("action").notNull(),
		reason: text("reason").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("admin_moderation_action_target_idx").on(
			table.targetType,
			table.targetId,
		),
	],
);

export const bambiProfileRelations = relations(bambiProfile, ({ one }) => ({
	user: one(user, {
		fields: [bambiProfile.userId],
		references: [user.id],
	}),
}));

export const employerOrganizationProfileRelations = relations(
	employerOrganizationProfile,
	({ many }) => ({
		teamProfiles: many(employerTeamProfile),
	}),
);

export const employerTeamProfileRelations = relations(
	employerTeamProfile,
	({ one }) => ({
		organizationProfile: one(employerOrganizationProfile, {
			fields: [employerTeamProfile.organizationId],
			references: [employerOrganizationProfile.organizationId],
		}),
	}),
);

export const jobPostRelations = relations(jobPost, ({ many }) => ({
	chatRooms: many(chatRoom),
}));
```

- [ ] **Step 2: Export Bambi schema**

Modify `packages/db/src/schema/index.ts`:

```ts
export * from "./auth";
export * from "./bambi";
export * from "./todo";
export {};
```

- [ ] **Step 3: Validate types**

Run:

```bash
pnpm run check-types
```

Expected: PASS, or only failures from unrelated existing user edits. If unrelated failures exist, record them in the task notes and continue only after confirming Bambi schema files type-check in the package output.

- [ ] **Step 4: Commit schema**

Run:

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/schema/index.ts
git commit -m "feat: add bambi domain schema"
```

---

### Task 4: Add Bambi Authorization Helpers

**Files:**

- Create: `packages/api/src/services/bambi-authz.ts`

- [ ] **Step 1: Create reusable authorization helpers**

Create `packages/api/src/services/bambi-authz.ts`:

```ts
import { db } from "@bambi-app/db";
import { member, teamMember } from "@bambi-app/db/schema/auth";
import {
	bambiProfile,
	chatRoom,
	type accountStatus,
	type bambiUserRole,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, eq, or } from "drizzle-orm";

interface SessionLike {
	user?: {
		id: string;
	};
}

type BambiRole = (typeof bambiUserRole.enumValues)[number];
type AccountStatus = (typeof accountStatus.enumValues)[number];

export interface BambiAccessProfile {
	userId: string;
	role: BambiRole;
	status: AccountStatus;
	isPhoneVerified: boolean;
}

interface EmployerPostingAccessInput {
	organizationId: string;
	teamId?: string | null;
	session: SessionLike | null;
}

export const requireSessionUserId = (session: SessionLike | null): string => {
	const userId = session?.user?.id;

	if (!userId) {
		throw new ORPCError("UNAUTHORIZED");
	}

	return userId;
};

export const getBambiAccessProfile = async (
	userId: string,
): Promise<BambiAccessProfile | null> => {
	const [profile] = await db
		.select({
			userId: bambiProfile.userId,
			role: bambiProfile.role,
			status: bambiProfile.status,
			isPhoneVerified: bambiProfile.isPhoneVerified,
		})
		.from(bambiProfile)
		.where(eq(bambiProfile.userId, userId))
		.limit(1);

	return profile ?? null;
};

export const requireBambiAccessProfile = async (
	session: SessionLike | null,
): Promise<BambiAccessProfile> => {
	const userId = requireSessionUserId(session);
	const profile = await getBambiAccessProfile(userId);

	if (!profile) {
		throw new ORPCError("FORBIDDEN", {
			message: "Bambi profile is required.",
		});
	}

	return profile;
};

export const requireActiveBambiProfile = async (
	session: SessionLike | null,
): Promise<BambiAccessProfile> => {
	const profile = await requireBambiAccessProfile(session);

	if (profile.status === "suspended") {
		throw new ORPCError("FORBIDDEN", {
			message: "Suspended users cannot perform this action.",
		});
	}

	return profile;
};

export const requireAdminProfile = async (
	session: SessionLike | null,
): Promise<BambiAccessProfile> => {
	const profile = await requireActiveBambiProfile(session);

	if (profile.role !== "admin") {
		throw new ORPCError("FORBIDDEN", {
			message: "Admin role is required.",
		});
	}

	return profile;
};

export const requireEmployerPostingAccess = async ({
	organizationId,
	teamId,
	session,
}: EmployerPostingAccessInput): Promise<BambiAccessProfile> => {
	const profile = await requireActiveBambiProfile(session);

	if (profile.role !== "employer" && profile.role !== "admin") {
		throw new ORPCError("FORBIDDEN", {
			message: "Employer role is required.",
		});
	}

	const [organizationMember] = await db
		.select()
		.from(member)
		.where(
			and(
				eq(member.userId, profile.userId),
				eq(member.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!organizationMember) {
		throw new ORPCError("FORBIDDEN", {
			message: "Employer organization membership is required.",
		});
	}

	if (organizationMember.role === "owner" || organizationMember.role === "admin") {
		return profile;
	}

	if (!teamId) {
		throw new ORPCError("FORBIDDEN", {
			message: "Staff members can create posts only for assigned teams.",
		});
	}

	const [assignedTeam] = await db
		.select()
		.from(teamMember)
		.where(
			and(
				eq(teamMember.userId, profile.userId),
				eq(teamMember.teamId, teamId),
			),
		)
		.limit(1);

	if (!assignedTeam) {
		throw new ORPCError("FORBIDDEN", {
			message: "Team membership is required.",
		});
	}

	return profile;
};

export const requireChatParticipant = async (
	chatRoomId: string,
	session: SessionLike | null,
) => {
	const profile = await requireActiveBambiProfile(session);
	const [room] = await db
		.select()
		.from(chatRoom)
		.where(
			and(
				eq(chatRoom.id, chatRoomId),
				or(
					eq(chatRoom.employerUserId, profile.userId),
					eq(chatRoom.jobSeekerUserId, profile.userId),
				),
			),
		)
		.limit(1);

	if (!room) {
		throw new ORPCError("NOT_FOUND");
	}

	return { profile, room };
};
```

- [ ] **Step 2: Run checks**

Run:

```bash
pnpm run check-types
pnpm run check
```

Expected: type and lint checks pass or report unrelated pre-existing modified-file issues.

- [ ] **Step 3: Commit authorization helpers**

Run:

```bash
git add packages/api/src/services/bambi-authz.ts
git commit -m "feat: add bambi authorization helpers"
```

---

### Task 5: Add Job Post Router

**Files:**

- Create: `packages/api/src/routers/bambi/jobs.ts`
- Create: `packages/api/src/routers/bambi/index.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Create job post router**

Create `packages/api/src/routers/bambi/jobs.ts`:

```ts
import { db } from "@bambi-app/db";
import {
	employerOrganizationProfile,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../../index";
import { requireEmployerPostingAccess } from "../../services/bambi-authz";
import {
	type EmployerVerificationStatus,
	type JobPostStatus,
	getInitialJobPostStatus,
	getUpdatedJobPostStatus,
} from "../../services/bambi-policy";

const jobPostInput = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1).optional(),
	title: z.string().min(2).max(80),
	industryCategory: z.string().min(1).max(80),
	region: z.string().min(1).max(80),
	payAmount: z.number().int().positive(),
	payUnit: z.string().min(1).max(30),
	workSchedule: z.string().min(1).max(200),
	description: z.string().min(10).max(2000),
	interviewNotes: z.string().max(500).optional(),
});

const listInput = z.object({
	industryCategory: z.string().min(1).max(80).optional(),
	region: z.string().min(1).max(80).optional(),
	minPayAmount: z.number().int().positive().optional(),
	limit: z.number().int().min(1).max(50).default(20),
});

const hasRiskFlags = (input: z.infer<typeof jobPostInput>): boolean => {
	const text = `${input.title} ${input.description} ${input.interviewNotes ?? ""}`;
	const riskyTerms = ["미성년", "성매매", "강요"];

	return riskyTerms.some((term) => text.includes(term));
};

export const jobsRouter = {
	list: publicProcedure.input(listInput).handler(async ({ input }) => {
		const filters = [eq(jobPost.status, "published" as JobPostStatus)];

		if (input.industryCategory) {
			filters.push(eq(jobPost.industryCategory, input.industryCategory));
		}

		if (input.region) {
			filters.push(eq(jobPost.region, input.region));
		}

		if (input.minPayAmount) {
			filters.push(sql`${jobPost.payAmount} >= ${input.minPayAmount}`);
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
				employerVerificationStatus:
					employerOrganizationProfile.verificationStatus,
				publishedAt: jobPost.publishedAt,
			})
			.from(jobPost)
			.innerJoin(
				employerOrganizationProfile,
				eq(
					jobPost.organizationId,
					employerOrganizationProfile.organizationId,
				),
			)
			.where(and(...filters))
			.orderBy(
				sql`case when ${employerOrganizationProfile.verificationStatus} = 'verified' then 0 else 1 end`,
				desc(jobPost.publishedAt),
			)
			.limit(input.limit);
	}),

	getById: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ input }) => {
			const [post] = await db
				.select()
				.from(jobPost)
				.where(eq(jobPost.id, input.id))
				.limit(1);

			if (!post || post.status !== "published") {
				throw new ORPCError("NOT_FOUND");
			}

			return post;
	}),

	create: protectedProcedure.input(jobPostInput).handler(async ({ context, input }) => {
		const actor = await requireEmployerPostingAccess({
			organizationId: input.organizationId,
			teamId: input.teamId,
			session: context.session,
		});
		const [organizationProfile] = await db
			.select()
			.from(employerOrganizationProfile)
			.where(
				eq(
					employerOrganizationProfile.organizationId,
					input.organizationId,
				),
			)
			.limit(1);

		if (!organizationProfile) {
			throw new ORPCError("FORBIDDEN", {
				message: "Employer organization profile is required.",
			});
		}

		const riskDetected = hasRiskFlags(input);
		const status = getInitialJobPostStatus({
			employerVerificationStatus:
				organizationProfile.verificationStatus as EmployerVerificationStatus,
			hasRiskFlags: riskDetected,
		});
		const now = new Date();

		const [created] = await db
			.insert(jobPost)
			.values({
				...input,
				createdByUserId: actor.userId,
				status,
				riskFlags: riskDetected ? ["risky_term"] : [],
				publishedAt: status === "published" ? now : null,
			})
			.returning();

		return created;
	}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				data: jobPostInput,
			}),
		)
		.handler(async ({ context, input }) => {
			const actor = await requireEmployerPostingAccess({
				organizationId: input.data.organizationId,
				teamId: input.data.teamId,
				session: context.session,
			});
			const [existing] = await db
				.select()
				.from(jobPost)
				.where(
					and(
						eq(jobPost.id, input.id),
						eq(jobPost.organizationId, input.data.organizationId),
					),
				)
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}
			const [organizationProfile] = await db
				.select()
				.from(employerOrganizationProfile)
				.where(
					eq(
						employerOrganizationProfile.organizationId,
						input.data.organizationId,
					),
				)
				.limit(1);

			if (!organizationProfile) {
				throw new ORPCError("FORBIDDEN", {
					message: "Employer organization profile is required.",
				});
			}

			const status = getUpdatedJobPostStatus({
				currentStatus: existing.status as JobPostStatus,
				employerVerificationStatus:
					organizationProfile.verificationStatus as EmployerVerificationStatus,
				publicContentChanged: true,
			});
			const [updated] = await db
				.update(jobPost)
				.set({
					...input.data,
					createdByUserId: actor.userId,
					status,
					publishedAt:
						status === "published" && !existing.publishedAt
							? new Date()
							: existing.publishedAt,
				})
				.where(eq(jobPost.id, input.id))
				.returning();

			return updated;
		}),
};
```

- [ ] **Step 2: Compose Bambi routers**

Create `packages/api/src/routers/bambi/index.ts`:

```ts
import { jobsRouter } from "./jobs";

export const bambiRouter = {
	jobs: jobsRouter,
};
```

- [ ] **Step 3: Register Bambi router**

Modify `packages/api/src/routers/index.ts`:

```ts
import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { bambiRouter } from "./bambi";
import { todoRouter } from "./todo";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),
	privateData: protectedProcedure.handler(({ context }) => ({
		message: "This is private",
		user: context.session?.user,
	})),
	bambi: bambiRouter,
	todo: todoRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
```

- [ ] **Step 4: Run checks**

Run:

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
```

Expected: policy tests pass; type and lint checks pass or report unrelated pre-existing modified-file issues.

- [ ] **Step 5: Commit job router**

Run:

```bash
git add packages/api/src/routers/bambi/jobs.ts packages/api/src/routers/bambi/index.ts packages/api/src/routers/index.ts
git commit -m "feat: add bambi job post api"
```

---

### Task 6: Add Chat, Interview, and Contact Consent Router

**Files:**

- Create: `packages/api/src/routers/bambi/chats.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`

- [ ] **Step 1: Create chat router**

Create `packages/api/src/routers/bambi/chats.ts`:

```ts
import { db } from "@bambi-app/db";
import {
	chatMessage,
	chatRoom,
	contactRevealConsent,
	interviewSchedule,
	jobPost,
	userBlock,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, or } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireChatParticipant,
	requireSessionUserId,
} from "../../services/bambi-authz";
import { canRevealContact, canStartChat } from "../../services/bambi-policy";

export const chatsRouter = {
	startFromJobPost: protectedProcedure
		.input(z.object({ jobPostId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			const [post] = await db
				.select({
					id: jobPost.id,
					status: jobPost.status,
					organizationId: jobPost.organizationId,
					teamId: jobPost.teamId,
					employerUserId: jobPost.createdByUserId,
				})
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!post) {
				throw new ORPCError("NOT_FOUND");
			}

			const allowed = canStartChat({
				accountStatus: profile.status,
				isPhoneVerified: profile.isPhoneVerified,
				jobPostStatus: post.status,
			});

			if (!allowed) {
				throw new ORPCError("FORBIDDEN", {
					message: "Phone verification and a published job post are required.",
				});
			}

			const [existingRoom] = await db
				.select()
				.from(chatRoom)
				.where(
					and(
						eq(chatRoom.jobPostId, input.jobPostId),
						eq(chatRoom.jobSeekerUserId, profile.userId),
					),
				)
				.limit(1);

			if (existingRoom) {
				return existingRoom;
			}

			const [created] = await db
				.insert(chatRoom)
				.values({
					jobPostId: input.jobPostId,
					organizationId: post.organizationId,
					teamId: post.teamId,
					employerUserId: post.employerUserId,
					jobSeekerUserId: profile.userId,
				})
				.returning();

			return created;
		}),

	listMine: protectedProcedure.handler(async ({ context }) => {
		const userId = requireSessionUserId(context.session);

		return await db
			.select()
			.from(chatRoom)
			.where(
				or(
					eq(chatRoom.employerUserId, userId),
					eq(chatRoom.jobSeekerUserId, userId),
				),
			)
			.orderBy(desc(chatRoom.updatedAt));
	}),

	sendMessage: protectedProcedure
		.input(
			z.object({
				chatRoomId: z.string().uuid(),
				body: z.string().min(1).max(2000),
			}),
		)
		.handler(async ({ context, input }) => {
			const { profile, room } = await requireChatParticipant(
				input.chatRoomId,
				context.session,
			);

			if (room.isBlocked) {
				throw new ORPCError("FORBIDDEN", {
					message: "This chat is blocked.",
				});
			}

			const [block] = await db
				.select()
				.from(userBlock)
				.where(
					or(
						and(
							eq(userBlock.blockerUserId, room.employerUserId),
							eq(userBlock.blockedUserId, room.jobSeekerUserId),
						),
						and(
							eq(userBlock.blockerUserId, room.jobSeekerUserId),
							eq(userBlock.blockedUserId, room.employerUserId),
						),
					),
				)
				.limit(1);

			if (block) {
				throw new ORPCError("FORBIDDEN", {
					message: "Blocked users cannot continue messaging.",
				});
			}

			const [message] = await db
				.insert(chatMessage)
				.values({
					chatRoomId: input.chatRoomId,
					senderUserId: profile.userId,
					body: input.body,
				})
				.returning();

			return message;
		}),

	proposeInterview: protectedProcedure
		.input(
			z.object({
				chatRoomId: z.string().uuid(),
				scheduledAt: z.string().datetime(),
				locationNote: z.string().max(300).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { profile } = await requireChatParticipant(
				input.chatRoomId,
				context.session,
			);

			const [schedule] = await db
				.insert(interviewSchedule)
				.values({
					chatRoomId: input.chatRoomId,
					proposedByUserId: profile.userId,
					scheduledAt: new Date(input.scheduledAt),
					locationNote: input.locationNote,
				})
				.returning();

			return schedule;
		}),

	setInterviewStatus: protectedProcedure
		.input(
			z.object({
				interviewScheduleId: z.string().uuid(),
				status: z.enum(["confirmed", "declined", "canceled", "completed"]),
			}),
		)
		.handler(async ({ context, input }) => {
			const [schedule] = await db
				.select({
					id: interviewSchedule.id,
					chatRoomId: interviewSchedule.chatRoomId,
				})
				.from(interviewSchedule)
				.where(eq(interviewSchedule.id, input.interviewScheduleId))
				.limit(1);

			if (!schedule) {
				throw new ORPCError("NOT_FOUND");
			}

			await requireChatParticipant(schedule.chatRoomId, context.session);

			const [updated] = await db
				.update(interviewSchedule)
				.set({ status: input.status })
				.where(eq(interviewSchedule.id, input.interviewScheduleId))
				.returning();

			return updated;
		}),

	revealContact: protectedProcedure
		.input(
			z.object({
				interviewScheduleId: z.string().uuid(),
				contactMethod: z.enum(["phone", "kakao", "email"]),
				contactValue: z.string().min(3).max(120),
			}),
		)
		.handler(async ({ context, input }) => {
			const [schedule] = await db
				.select()
				.from(interviewSchedule)
				.where(eq(interviewSchedule.id, input.interviewScheduleId))
				.limit(1);

			if (!schedule) {
				throw new ORPCError("NOT_FOUND");
			}

			const { profile } = await requireChatParticipant(
				schedule.chatRoomId,
				context.session,
			);

			const allowed = canRevealContact({
				interviewStatus: schedule.status,
				ownerConsented: true,
				ownerPhoneVerified: profile.isPhoneVerified,
			});

			if (!allowed) {
				throw new ORPCError("FORBIDDEN", {
					message: "Confirmed interview and phone verification are required.",
				});
			}

			const [consent] = await db
				.insert(contactRevealConsent)
				.values({
					interviewScheduleId: input.interviewScheduleId,
					userId: profile.userId,
					contactMethod: input.contactMethod,
					contactValue: input.contactValue,
				})
				.onConflictDoUpdate({
					target: [
						contactRevealConsent.interviewScheduleId,
						contactRevealConsent.userId,
						contactRevealConsent.contactMethod,
					],
					set: {
						contactValue: input.contactValue,
					},
				})
				.returning();

			return consent;
		}),
};
```

- [ ] **Step 2: Register chat router**

Modify `packages/api/src/routers/bambi/index.ts`:

```ts
import { chatsRouter } from "./chats";
import { jobsRouter } from "./jobs";

export const bambiRouter = {
	chats: chatsRouter,
	jobs: jobsRouter,
};
```

- [ ] **Step 3: Run checks**

Run:

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
```

Expected: policy tests pass; type and lint checks pass or report unrelated pre-existing modified-file issues.

- [ ] **Step 4: Commit chat and interview router**

Run:

```bash
git add packages/api/src/routers/bambi/chats.ts packages/api/src/routers/bambi/index.ts
git commit -m "feat: add bambi chat interview api"
```

---

### Task 7: Add Reports and Admin Moderation Router

**Files:**

- Create: `packages/api/src/routers/bambi/moderation.ts`
- Modify: `packages/api/src/routers/bambi/index.ts`

- [ ] **Step 1: Create moderation router**

Create `packages/api/src/routers/bambi/moderation.ts`:

```ts
import { db } from "@bambi-app/db";
import {
	adminModerationAction,
	bambiProfile,
	jobPost,
	report,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	requireAdminProfile,
} from "../../services/bambi-authz";

const targetTypeSchema = z.enum([
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"user",
]);

const reportReasonSchema = z.enum([
	"illegal_or_prohibited_content",
	"coercion_or_safety",
	"underage_concern",
	"scam_or_fraud",
	"harassment",
	"misleading_job_information",
	"other",
]);

export const moderationRouter = {
	createReport: protectedProcedure
		.input(
			z.object({
				targetType: targetTypeSchema,
				targetId: z.string().min(1),
				reason: reportReasonSchema,
				details: z.string().max(1000).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const [created] = await db
				.insert(report)
				.values({
					reporterUserId: profile.userId,
					targetType: input.targetType,
					targetId: input.targetId,
					reason: input.reason,
					details: input.details,
				})
				.returning();

			return created;
		}),

	listReports: protectedProcedure
		.input(
			z.object({
				status: z.enum(["open", "reviewing", "resolved", "dismissed"]).optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			if (input.status) {
				return await db
					.select()
					.from(report)
					.where(eq(report.status, input.status))
					.orderBy(desc(report.createdAt))
					.limit(input.limit);
			}

			return await db
				.select()
				.from(report)
				.orderBy(desc(report.createdAt))
				.limit(input.limit);
		}),

	setReportStatus: protectedProcedure
		.input(
			z.object({
				reportId: z.string().uuid(),
				status: z.enum(["open", "reviewing", "resolved", "dismissed"]),
			}),
		)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			const [updated] = await db
				.update(report)
				.set({ status: input.status })
				.where(eq(report.id, input.reportId))
				.returning();

			return updated;
		}),

	setJobPostStatus: protectedProcedure
		.input(
			z.object({
				jobPostId: z.string().uuid(),
				status: z.enum(["pending_review", "published", "hidden", "rejected"]),
				reason: z.string().min(2).max(500),
			}),
		)
		.handler(async ({ context, input }) => {
			const adminProfile = await requireAdminProfile(context.session);
			const publishedAt = input.status === "published" ? new Date() : null;
			const [updated] = await db
				.update(jobPost)
				.set({
					status: input.status,
					publishedAt,
					rejectionReason:
						input.status === "rejected" ? input.reason : null,
				})
				.where(eq(jobPost.id, input.jobPostId))
				.returning();

			if (!updated) {
				throw new ORPCError("NOT_FOUND");
			}

			await db.insert(adminModerationAction).values({
				adminUserId: adminProfile.userId,
				targetType: "job_post",
				targetId: input.jobPostId,
				action: `set_status:${input.status}`,
				reason: input.reason,
			});

			return updated;
		}),

	setUserStatus: protectedProcedure
		.input(
			z.object({
				targetUserId: z.string().min(1),
				status: z.enum(["active", "warned", "suspended"]),
				reason: z.string().min(2).max(500),
			}),
		)
		.handler(async ({ context, input }) => {
			const adminProfile = await requireAdminProfile(context.session);

			const [updated] = await db
				.update(bambiProfile)
				.set({ status: input.status })
				.where(eq(bambiProfile.userId, input.targetUserId))
				.returning();

			if (!updated) {
				throw new ORPCError("NOT_FOUND");
			}

			await db.insert(adminModerationAction).values({
				adminUserId: adminProfile.userId,
				targetType: "user",
				targetId: input.targetUserId,
				action: `set_status:${input.status}`,
				reason: input.reason,
			});

			return updated;
		}),
};
```

- [ ] **Step 2: Register moderation router**

Modify `packages/api/src/routers/bambi/index.ts`:

```ts
import { chatsRouter } from "./chats";
import { jobsRouter } from "./jobs";
import { moderationRouter } from "./moderation";

export const bambiRouter = {
	chats: chatsRouter,
	jobs: jobsRouter,
	moderation: moderationRouter,
};
```

- [ ] **Step 3: Run checks**

Run:

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
```

Expected: policy tests pass; type and lint checks pass or report unrelated pre-existing modified-file issues.

- [ ] **Step 4: Commit moderation router**

Run:

```bash
git add packages/api/src/routers/bambi/moderation.ts packages/api/src/routers/bambi/index.ts
git commit -m "feat: add bambi moderation api"
```

---

### Task 8: Final Verification

**Files:**

- Verify all files created or modified in Tasks 1-7.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
git status --short
```

Expected:

- API tests pass.
- Type check passes or only reports unrelated pre-existing modified-file failures.
- Ultracite check passes or only reports unrelated pre-existing modified-file failures.
- `git status --short` shows no uncommitted files from this plan.

- [ ] **Step 2: Generate database migration**

Run:

```bash
pnpm run db:generate
```

Expected: Drizzle generates a migration for the Bambi domain tables and enums.

- [ ] **Step 3: Commit migration**

Run:

```bash
git add packages/db/src/migrations
git commit -m "db: generate bambi domain migration"
```

- [ ] **Step 4: Record execution notes**

Append a short execution note to this plan after implementation:

```md
## Execution Notes

- API policy tests: PASS
- Type check: PASS
- Ultracite check: PASS
- Migration generated: PASS
```

Then commit the note:

```bash
git add docs/superpowers/plans/2026-06-12-bambi-domain-foundation.md
git commit -m "docs: record bambi domain foundation results"
```

---

## Execution Notes

- API policy tests: PASS (`pnpm --filter @bambi-app/api test`)
- Type check: PASS (`pnpm run check-types`)
- Ultracite check: PASS (`pnpm run check`)
- Migration generated: PASS (`packages/db/src/migrations/0000_perfect_stranger.sql`)
- Migration drift check: PASS (`pnpm run db:generate` reported no schema changes after cleanup)

## Follow-Up Plans

After this foundation is implemented, create separate plans for:

1. User mobile web: listing, filters, detail, chat, interview schedule, and contact reveal screens.
2. Admin web: pending post review, verification queue, report queue, user status actions, and moderation logs.
3. Verification provider integration: phone verification, business verification, and adult verification extension points.
4. Realtime chat transport: polling first, websocket or managed realtime service when the product needs it.
