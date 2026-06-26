# Bambi Job Post Media And Block Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let employers add controlled job post images and richer structured detail content without allowing unsafe free-form HTML.

**Architecture:** Extend the existing structured job post model instead of replacing it. Store a normalized plain `description` for search, moderation, and compatibility, then store safe block content and image metadata as first-class records that are validated by API policy services and rendered by Web components.

**Tech Stack:** Drizzle ORM, PostgreSQL, oRPC, Zod, TanStack Query, Next.js App Router, React 19, TypeScript, Tailwind CSS, Vitest, Ultracite.

---

## Source Context

Use these documents as the product basis:

- [Foxalba 벤치마킹 정리](../../foxalba-benchmark-2026-06-24.md)
- [Dense Marketplace And Promotion Ops](./2026-06-24-bambi-dense-marketplace-promotion-ops.md)
- [Web Final QA Acceptance](./2026-06-26-bambi-web-final-qa-acceptance.md)

Foxalba-informed requirement:

- Employers need more visual freedom than plain text.
- Bambi should not copy free-form HTML editing.
- Start with representative image 1 item and detail gallery up to 5 items.
- Use a safe block editor for detail content.

## Scope

Included:

- Representative image for marketplace rows and job detail hero.
- Detail image gallery with up to 5 images.
- Structured description blocks with safe block types.
- API validation for image MIME type, size, image count, block count, text length, and unsafe terms.
- Employer create/edit forms that can upload/select media and edit blocks.
- Public marketplace/detail rendering of media and blocks.
- Moderator queue context that exposes media/block risk information.
- Seed media/block examples for local QA.

Excluded:

- Free-form HTML or rich text paste preservation.
- Video upload.
- Payment-gated image packages.
- External object storage integration beyond the existing local upload-intent pattern.
- Native App parity.

## Migration Number

The current latest migration is `0007_bambi_analytics_paid_placement.sql`.

Use the next migration:

```text
packages/db/src/migrations/0008_bambi_job_post_media_blocks.sql
```

## Data Model

Block types:

```ts
export const jobDescriptionBlockTypes = [
	"paragraph",
	"heading",
	"bullet_list",
	"callout",
] as const;

export type JobDescriptionBlockType =
	(typeof jobDescriptionBlockTypes)[number];

export interface JobDescriptionBlock {
	id: string;
	text: string;
	type: JobDescriptionBlockType;
}
```

Media usage:

```ts
export const jobPostMediaUsages = ["cover", "detail"] as const;

export type JobPostMediaUsage = (typeof jobPostMediaUsages)[number];
```

## File Structure

- Modify: `packages/db/src/schema/bambi.ts`
  - Add `jobPost.descriptionBlocks`.
  - Add `jobPostMediaUsage` enum.
  - Add `jobPostMedia` table and relations.
- Create: `packages/db/src/migrations/0008_bambi_job_post_media_blocks.sql`
- Create: `packages/api/src/services/bambi-job-description-blocks.ts`
- Create: `packages/api/src/services/bambi-job-description-blocks.test.ts`
- Create: `packages/api/src/services/bambi-job-media-policy.ts`
- Create: `packages/api/src/services/bambi-job-media-policy.test.ts`
- Modify: `packages/api/src/services/bambi-storage.ts`
  - Add job post media upload intent helpers beside the chat attachment helpers.
- Modify: `packages/api/src/routers/bambi/jobs.ts`
  - Accept and return description blocks and media metadata.
- Create: `packages/api/src/routers/bambi/job-post-media.test.ts`
  - Cover create/update media authorization and count limits through the jobs router.
- Modify: `apps/web/src/lib/bambi-job-form.ts`
  - Validate media and blocks and include them in job post input.
- Create: `apps/web/src/lib/bambi-job-blocks.test.ts`
- Create: `apps/web/src/components/bambi/job-post-block-editor.tsx`
- Create: `apps/web/src/components/bambi/job-post-media-uploader.tsx`
- Modify: `apps/web/src/app/employer/new/page.tsx`
- Modify: `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`
- Modify: `apps/web/src/components/bambi/marketplace.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`
- Modify: `apps/web/src/components/bambi/screens/moderator-context.tsx`
- Modify: `apps/server/src/seeds/bambi-dev.ts`
- Create: `apps/web/src/app/bambi/local-job-media/route.ts`

## Task 1: Description Block And Media Policies

**Files:**

- Create: `packages/api/src/services/bambi-job-description-blocks.ts`
- Create: `packages/api/src/services/bambi-job-description-blocks.test.ts`
- Create: `packages/api/src/services/bambi-job-media-policy.ts`
- Create: `packages/api/src/services/bambi-job-media-policy.test.ts`

- [ ] **Step 1: Write description block tests**

Create tests for:

- valid paragraph, heading, bullet list, and callout blocks
- maximum 12 blocks per job post
- non-empty text after trimming
- maximum 800 characters per block
- plain text fallback composed from block text
- risky terms such as `미성년`, `성매매`, and `강요`

Run:

```bash
pnpm vitest run packages/api/src/services/bambi-job-description-blocks.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 2: Implement description block helpers**

Create:

```ts
export const MAX_JOB_DESCRIPTION_BLOCKS = 12;
export const MAX_JOB_DESCRIPTION_BLOCK_TEXT_LENGTH = 800;

export const normalizeJobDescriptionBlocks = (
	blocks: JobDescriptionBlock[]
): JobDescriptionBlock[] => {
	return blocks
		.map((block) => ({
			id: block.id.trim(),
			text: block.text.trim(),
			type: block.type,
		}))
		.filter((block) => block.id.length > 0 && block.text.length > 0);
};

export const toPlainJobDescription = (
	blocks: JobDescriptionBlock[]
): string => normalizeJobDescriptionBlocks(blocks)
	.map((block) => block.text)
	.join("\n\n");
```

Add validation that returns structured error codes:

- `too_many_blocks`
- `empty_block_text`
- `block_text_too_long`
- `unsupported_block_type`

- [ ] **Step 3: Write media policy tests**

Create tests for:

- JPEG, PNG, and WebP images up to 8 MB
- rejection of PDFs and executable MIME types
- one cover image maximum
- five detail images maximum
- non-empty filename and alt text maximum 120 characters

Run:

```bash
pnpm vitest run packages/api/src/services/bambi-job-media-policy.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 4: Implement media policy helpers**

Create:

```ts
export const JOB_POST_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const JOB_POST_DETAIL_IMAGE_LIMIT = 5;

export const ALLOWED_JOB_POST_IMAGE_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;
```

Add `validateJobPostImageUpload` and `validateJobPostMediaSet` helpers.

- [ ] **Step 5: Run policy tests**

Run:

```bash
pnpm vitest run packages/api/src/services/bambi-job-description-blocks.test.ts packages/api/src/services/bambi-job-media-policy.test.ts
```

Expected: both policy test files pass.

## Task 2: Database Schema And Migration

**Files:**

- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/0008_bambi_job_post_media_blocks.sql`

- [ ] **Step 1: Add schema fields**

Add `descriptionBlocks` to `jobPost`:

```ts
descriptionBlocks: jsonb("description_blocks")
	.$type<JobDescriptionBlock[]>()
	.default([])
	.notNull(),
```

Add `jobPostMediaUsage` enum:

```ts
export const jobPostMediaUsage = pgEnum("job_post_media_usage", [
	"cover",
	"detail",
]);
```

Add `jobPostMedia` table with:

- `id`
- `jobPostId`
- `organizationId`
- `uploadedByUserId`
- `usage`
- `position`
- `fileName`
- `mimeType`
- `byteSize`
- `storageKey`
- `altText`
- `createdAt`
- `updatedAt`

- [ ] **Step 2: Add indexes and relations**

Required indexes:

- `job_post_media_job_post_id_idx`
- `job_post_media_organization_id_idx`
- `job_post_media_usage_position_idx`
- `job_post_media_storage_key_uidx`

Add relations from `jobPost` to `jobPostMedia` and from `jobPostMedia` to `jobPost`.

- [ ] **Step 3: Create SQL migration**

Create `0008_bambi_job_post_media_blocks.sql` with:

- `job_post.description_blocks jsonb not null default '[]'::jsonb`
- `job_post_media_usage` enum
- `job_post_media` table
- indexes and foreign keys

- [ ] **Step 4: Run schema checks**

Run:

```bash
pnpm run check-types
pnpm run check
```

Expected: both commands pass.

## Task 3: API Create/Edit And Media Upload Intent

**Files:**

- Modify: `packages/api/src/services/bambi-storage.ts`
- Modify: `packages/api/src/routers/bambi/jobs.ts`
- Create: `packages/api/src/routers/bambi/job-post-media.test.ts`

- [ ] **Step 1: Add job media upload intent helper**

Extend storage service with:

```ts
export interface JobPostMediaUploadIntent {
	byteSize: number;
	fileName: string;
	mimeType: string;
	storageKey: string;
	uploadUrl: string;
}
```

Storage keys must use:

```text
bambi-job-post-media/<organizationId>/<actorUserId>/<uuid>-<safe-file-name>
```

- [ ] **Step 2: Extend job input schema**

Extend `jobPostInput` with:

```ts
descriptionBlocks: z.array(jobDescriptionBlockInput).max(12).optional(),
media: z
	.object({
		cover: jobPostMediaInput.optional(),
		detail: z.array(jobPostMediaInput).max(5).default([]),
	})
	.optional(),
```

Keep `description` as the normalized plain text fallback produced from blocks.

- [ ] **Step 3: Add upload intent procedure**

Add protected `createMediaUpload` under `bambi.jobs` or a focused `bambi.jobPostMedia` router.

The procedure must:

- require employer access for the selected organization/team
- validate MIME type and size with `validateJobPostImageUpload`
- return upload intent metadata only
- not create public media records until create/update submits the media set

- [ ] **Step 4: Persist media in create/update transactions**

In `create`, insert the job post first, then insert cover/detail media rows in the same transaction.

In `update`, replace the job post media set for that job post in the same transaction after access checks pass.

- [ ] **Step 5: Add API tests**

Cover:

- employer can create a job with one cover image and up to five detail images
- unsupported MIME type is rejected before upload intent
- six detail images are rejected
- staff cannot attach media to another organization's job
- updating public blocks or media uses the same re-review behavior as public text changes

Run:

```bash
pnpm --filter @bambi-app/api test -- job-post-media
```

Expected: the new test file passes.

## Task 4: Employer Web Form And Block Editor

**Files:**

- Modify: `apps/web/src/lib/bambi-job-form.ts`
- Create: `apps/web/src/lib/bambi-job-blocks.test.ts`
- Create: `apps/web/src/components/bambi/job-post-block-editor.tsx`
- Create: `apps/web/src/components/bambi/job-post-media-uploader.tsx`
- Modify: `apps/web/src/app/employer/new/page.tsx`
- Modify: `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`

- [ ] **Step 1: Add Web form validation tests**

Test:

- empty block list falls back to current `description`
- block text produces normalized description
- cover image is optional
- detail image count over 5 fails
- alt text over 120 characters fails

Run:

```bash
pnpm vitest run apps/web/src/lib/bambi-job-blocks.test.ts
```

Expected: FAIL until Web form helpers are implemented.

- [ ] **Step 2: Implement block editor**

Create a focused editor with:

- add paragraph
- add heading
- add bullet list
- add callout
- remove block
- move block up/down
- textarea per block
- no HTML input and no `dangerouslySetInnerHTML`

- [ ] **Step 3: Implement media uploader**

Create a component with:

- one cover image slot
- five detail image slots
- image-only file picker
- alt text input per image
- validation messages from `validateJobForm`
- local preview using object URLs

- [ ] **Step 4: Wire create page**

Update `/employer/new` so submit:

1. validates form, blocks, and media
2. requests upload intents for selected images
3. passes storage metadata to `bambi.jobs.create`
4. invalidates employer job queries
5. returns to `/employer`

- [ ] **Step 5: Wire edit page**

Update `/employer/jobs/[id]/edit` so existing media and blocks are loaded, edited, replaced, and submitted through `bambi.jobs.update`.

- [ ] **Step 6: Run Web checks**

Run:

```bash
pnpm vitest run apps/web/src/lib/bambi-job-blocks.test.ts
pnpm run check-types
pnpm run check
```

Expected: all commands pass.

## Task 5: Public Rendering And Moderator Context

**Files:**

- Modify: `apps/web/src/components/bambi/marketplace.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`
- Modify: `apps/web/src/components/bambi/screens/moderator-context.tsx`
- Create: `apps/web/src/app/bambi/local-job-media/route.ts`

- [ ] **Step 1: Render cover image in marketplace rows**

Use Next.js image rendering for cover images where available. Keep the current logo/initial fallback for jobs without a cover image.

- [ ] **Step 2: Render detail blocks and gallery**

Render block types as semantic HTML:

- `heading` -> heading under the page H1
- `paragraph` -> paragraph
- `bullet_list` -> list
- `callout` -> bordered note

Render detail images below the structured facts and before interview notes.

- [ ] **Step 3: Add local media route**

Create `/bambi/local-job-media` using the same local placeholder style as `/bambi/local-chat-attachments`, but with job-media-specific query parameters.

- [ ] **Step 4: Extend moderator context**

Include:

- media count
- cover image presence
- block count
- risky block text flags

Moderator screens should show that a post contains images or structured blocks before approval.

- [ ] **Step 5: Browser smoke**

Verify:

- `/seeker` shows cover image/fallback without layout shift.
- `/seeker/jobs/[id]` renders block content and image gallery.
- `/moderator/queue/[id]` shows media/block context.

## Task 6: Seed Data And Final Verification

**Files:**

- Modify: `apps/server/src/seeds/bambi-dev.ts`
- Modify this plan with verification notes.

- [ ] **Step 1: Seed media and block examples**

Seed:

- one published job with cover and detail gallery metadata
- one pending review job with a risky block flag
- one promoted job with a cover image so dense marketplace rows exercise the image path

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm run db:migrate
pnpm run db:seed:bambi
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
pnpm --filter web build
```

Expected: all commands pass.

- [ ] **Step 3: Browser verify employer and seeker flows**

Verify:

- `owner@bambi.dev` can create a job with cover image, detail image, and blocks.
- `owner@bambi.dev` can edit media/blocks and return to `/employer`.
- `seeker@bambi.dev` can see cover image, detail gallery, and block content.
- `admin@bambi.dev` can see media/block context in moderation queue.

- [ ] **Step 4: Update roadmap and commit**

Update:

- this plan's checkboxes
- `docs/result.md`
- `docs/foxalba-benchmark-2026-06-24.md` if the implementation changes the benchmark adoption status

Commit with Korean Conventional Commit format.

## Self-Review Notes

- Spec coverage: representative image, up to five detail images, safe block editor, no free-form HTML, moderation visibility, public rendering, and local QA are covered.
- Placeholder scan: this plan intentionally avoids `TBD`, `TODO`, and open-ended validation steps.
- Type consistency: `JobDescriptionBlock`, `JobPostMediaUsage`, `descriptionBlocks`, and `jobPostMedia` names are used consistently across schema, API, and Web tasks.
