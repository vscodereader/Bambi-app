---
name: frontend-ui-engineering
description: Use when building or modifying UI in apps/web — creating components or pages, implementing layouts, wiring state or forms, fixing visual/UX issues, or whenever output must follow bambi-app's design system and structure conventions instead of generic AI aesthetics.
---

# Frontend UI Engineering (bambi-app)

Standards for UI work in apps/web. Goal: production quality that does not look AI-generated — follow this project's design system and structural conventions exactly. General code quality is covered by AGENTS.md (ultracite); this skill covers UI structure, state, and design rules only.

## File Structure

Not component-per-folder (PascalCase). This project uses flat kebab-case:

```
apps/web/src/
  app/                  # App Router — page.tsx is a thin wrapper only
  components/bambi/     # Domain components (kebab-case, flat + a few subfolders)
    screens/            # Large screen-level components (the real body of each route)
  hooks/                # Shared hooks (use-*.ts)
  lib/                  # Pure helpers bambi-*.ts (+ colocated *.test.ts)
  utils/orpc.ts         # oRPC client + queryClient
packages/ui/            # Shared shadcn components (@bambi-app/ui)
```

- New screen = component in `screens/`; `app/**/page.tsx` only wraps it
- Pull pure logic (formatting, calculations, form rules) out of components into `lib/bambi-*.ts` or a sibling `*.ts` — with colocated vitest tests (no DOM tests)
- No Storybook — do not create stories files

## Component Patterns

- **shadcn first**: import all primitives from `@bambi-app/ui/components/*`. Never reinvent raw `<input>` or custom buttons. Missing components are added via shadcn add (files land in the repo root — move them into packages/ui and apply the de-theme)
- Composition > configuration props: compose `<Card><CardHeader>…`; do not build giant config prop objects
- Separate data fetching from presentation: the screen component calls query hooks; presentational children receive props only
- base-ui `render`: omit `nativeButton` when rendering a `<Button>`; use `nativeButton={false}` only for non-button renders like Link/Input
- Reuse `EmptyState` from `components/bambi/empty-state.tsx` for empty/error states

## State Management

Simplest thing first. No global client store — adding zustand/redux or any new library is forbidden:

```
useState               → component-local UI state
Lifted state           → shared between 2-3 siblings
Context                → only the few truly wide-read cases (employer-approval-context, moderator-context level)
URL searchParams       → filters, pagination, shareable state
TanStack Query + oRPC  → all server data (via the orpc utils in utils/orpc.ts)
```

- Forms use TanStack Form + zod
- Mutations default to cache invalidation; when perceived speed matters, use `onMutate` optimistic updates + `onError` rollback
- Realtime (SSE) flows like `lib/bambi-chat-realtime.ts`: receive → invalidate/merge into query cache
- Prop drilling deeper than 3 levels → restructure

## Design System Rules (violations get rejected in review)

| Forbidden | Instead |
|---|---|
| Arbitrary px (`p-[13px]`, `w-[347px]`) | Tailwind scale tokens (`p-4`, `gap-3`) |
| Fixed-pixel containers like `max-w-[1180px]` | `max-w-[80%]` / computed widths |
| rounded-2xl everywhere | The de-theme is rounded-none — follow the ui component defaults |
| primary on navigation buttons | primary goes on exactly one main action per screen |
| 2-column marketplace card grids on desktop | Always 3+ columns |
| Rendering raw DB enum values | Go through the `*_LABELS` maps in `lib/bambi` (new enums ship with a label map) |
| Purple gradients, heavy shadows, lorem ipsum copy | Project palette, flat surfaces, realistic Korean copy |

## Accessibility (WCAG 2.1 AA)

- Every interactive element is keyboard accessible — prefer semantic elements like `<button>`; no div+onClick
- Icon-only buttons get `aria-label`; form inputs get connected labels
- Dialog focus move/trap is handled by the `@bambi-app/ui` Dialog — do not build your own
- Never use color as the only state indicator — pair with icons/text
- Loading uses skeletons (`animate-pulse` + `aria-busy`), not spinners

## Responsive

Mobile-first is mandatory — design every screen for mobile sizes alongside desktop. Expand with Tailwind responsive prefixes (`sm:` `lg:`).

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Accessibility is a nice-to-have" | It's a legal requirement in many jurisdictions and an engineering quality standard. |
| "We'll make it responsive later" | Retrofitting responsive design is 3x harder than building it from the start. |
| "The design isn't final, so I'll skip styling" | Use the design system defaults. Unstyled UI creates a broken first impression for reviewers. |
| "This is just a prototype" | Prototypes become production code. Build the foundation right. |
| "The AI aesthetic is fine for now" | It signals low quality. Use the project's actual design system from the start. |

## Red Flags

- Components with more than 200 lines (split them)
- Inline styles or arbitrary pixel values
- Missing error states, loading states, or empty states
- No keyboard navigation testing
- Color as the sole indicator of state (red/green without text or icons)
- Generic "AI look" (purple gradients, oversized cards, stock layouts)

## Verification

- `pnpm --filter web check-types` (web/server have no scope — not `@bambi-app/web`)
- `pnpm dlx ultracite check <path>` — the path argument is required (without it, 0 files are checked)
- **Never start dev servers or take screenshots** — report visual/breakpoint verification as an item for the user to review
