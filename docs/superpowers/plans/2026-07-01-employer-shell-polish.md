# 구인자 shell 개편 + 구인자 관리 화면 폴리시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구인자 전용 `PageShell`에 폭 캡 + actions 슬롯을 추가하고, 구인자 관리 화면(`/employer`)의 계층·대비·리스트 정렬·프로모션 표기를 shadcn 컴포넌트로 폴리시한다.

**Architecture:** 이미 employer 전용인 `PageShell`을 개편(가산적·하위호환)하고, `EmptyState`에 선택적 `className`을 추가한 뒤, 이 둘을 활용해 `app/employer/page.tsx`의 정상 로드 분기를 단계별로 다듬는다. 새 컴포넌트 생성·새 CSS 없음.

**Tech Stack:** Next.js(RSC, `"use client"`), shadcn/ui(base-ui) + Tailwind v4, `@bambi-app/ui` 컴포넌트(`Badge`, `Card`, `Separator`, `Empty`), `@tanstack/react-query`.

## Global Constraints

- 스타일은 Tailwind `className`만. 인라인 `style` 금지, 새 `.css`/전역 클래스 금지.
- shadcn 컴포넌트 우선 재사용: 배지=`Badge`(반경 `full`), 카드=`Card*`, 구분선=`Separator`, 빈 상태=`EmptyState`(→`Empty`). 커스텀 styled span/div 재발명 금지.
- 시맨틱 색 토큰만: `text-foreground`/`text-muted-foreground`/`bg-primary`/`border-border` + 브랜드 유틸(`bg-green-50` 등). raw hex/oklch 금지.
- `rounded-none` 금지. 반경은 토큰 파생 유틸(`rounded-lg`/`full` 등)로만.
- 간격은 `flex`/`grid` + `gap-*` (`space-x-*`/`space-y-*` 금지). 정사각은 `size-*`. 조건부 클래스는 `cn()`(`@bambi-app/ui/lib/utils`).
- 폭 상한: `max-w-[min(80%,72rem)]` (고정 픽셀 `max-w-[1180px]` 금지).
- 검증: 각 태스크는 `pnpm -F web check-types`(tsc --noEmit) + `pnpm dlx ultracite fix`(Biome 정렬·린트)로만. **개발 서버 구동·스크린샷 금지** — 시각 확인은 사용자.
- 커밋: 워크트리에서 `pnpm install` 선행 완료 상태. 커밋 메시지는 한국어 `type:` 제목 + 빈 줄 + 블릿 본문. 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 대상 파일 3개만: `apps/web/src/components/bambi/page-shell.tsx`, `apps/web/src/components/bambi/empty-state.tsx`, `apps/web/src/app/employer/page.tsx`.

---

### Task 1: `PageShell` — 폭 캡 + actions 슬롯

**Files:**
- Modify: `apps/web/src/components/bambi/page-shell.tsx` (전체, 19줄)

**Interfaces:**
- Produces: `PageShell(props: { children: React.ReactNode; description?: string; title: string; actions?: React.ReactNode })` — `actions` 미전달 시 우측 슬롯 미렌더(현행과 동일 출력).

- [ ] **Step 1: `PageShell` 개편 구현**

파일 전체를 아래로 교체:

```tsx
interface PageShellProps {
	actions?: React.ReactNode;
	children: React.ReactNode;
	description?: string;
	title: string;
}

// 구인자 전용 페이지 shell. employer/* 라우트 공통 헤더·폭을 규격화한다.
export function PageShell({
	actions,
	children,
	description,
	title,
}: PageShellProps) {
	return (
		<main className="mx-auto flex w-full max-w-[min(80%,72rem)] flex-col gap-6 px-4 py-6 sm:px-6">
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="font-semibold text-2xl tracking-normal">{title}</h1>
					{description ? (
						<p className="text-muted-foreground text-sm">{description}</p>
					) : null}
				</div>
				{actions ? (
					<div className="flex flex-wrap items-center gap-2">{actions}</div>
				) : null}
			</header>
			{children}
		</main>
	);
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm -F web check-types`
Expected: PASS (에러 0). 기존 `PageShell` 호출부는 `actions` 미전달이라 하위호환.

- [ ] **Step 3: 린트·포맷**

Run: `pnpm dlx ultracite fix apps/web/src/components/bambi/page-shell.tsx`
Expected: 포맷 정리 후 통과.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/bambi/page-shell.tsx
git commit -F - <<'EOF'
feat: 구인자 PageShell 폭 캡·actions 슬롯 추가

- max-w를 min(80%,72rem)로 캡해 초광폭 과확장 방지
- 헤더 우측 actions 슬롯 추가(하위호환, 미전달 시 현행 동일)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: `EmptyState` — 선택적 `className` 병합

**Files:**
- Modify: `apps/web/src/components/bambi/empty-state.tsx` (전체, 25줄)

**Interfaces:**
- Consumes: `cn` from `@bambi-app/ui/lib/utils`.
- Produces: `EmptyState(props: { action?: React.ReactNode; className?: string; description: string; title: string })` — `className` 미전달 시 `min-h-48` 유지(현행 동일).

- [ ] **Step 1: `className` prop 추가 구현**

파일 전체를 아래로 교체:

```tsx
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@bambi-app/ui/components/empty";
import { cn } from "@bambi-app/ui/lib/utils";

interface EmptyStateProps {
	action?: React.ReactNode;
	className?: string;
	description: string;
	title: string;
}

export function EmptyState({
	action,
	className,
	description,
	title,
}: EmptyStateProps) {
	return (
		<Empty className={cn("min-h-48", className)}>
			<EmptyHeader>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action ? <EmptyContent>{action}</EmptyContent> : null}
		</Empty>
	);
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm -F web check-types`
Expected: PASS. 기존 4개 사용처는 `className` 미전달 → `min-h-48` 유지.

- [ ] **Step 3: 린트·포맷**

Run: `pnpm dlx ultracite fix apps/web/src/components/bambi/empty-state.tsx`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/bambi/empty-state.tsx
git commit -F - <<'EOF'
feat: EmptyState className prop 추가

- Empty 높이(min-h-48)를 cn으로 병합해 사용처에서 override 가능
- 미전달 시 기존 크기 유지(하위호환)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: 관리 화면 — 헤더 actions 슬롯 + CTA 재배치 + 성과분석 중복 제거

**Files:**
- Modify: `apps/web/src/app/employer/page.tsx` (정상 로드 `return` 블록, 현재 301–469줄)

**Interfaces:**
- Consumes: `PageShell` 의 `actions` prop (Task 1).

- [ ] **Step 1: `PageShell`에 actions 전달 + 조직 프로필 헤더 버튼 정리**

`page.tsx`의 최종 `return (`에서 `PageShell` 여는 태그(현재 301–305줄)에 `actions` 추가:

```tsx
	return (
		<PageShell
			actions={
				<Link className={buttonVariants()} href="/employer/new">
					새 공고 등록
				</Link>
			}
			description="조직과 팀 프로필 상태를 확인하고 소유한 공고를 관리합니다."
			title="구인자 관리"
		>
```

이어서 조직 프로필 섹션 헤더의 버튼 묶음(현재 316–332줄의 `<div className="flex flex-wrap gap-2"> … </div>`)을 아래로 교체 — `성과 분석`·`새 공고 등록` 제거, `조직 설정`만 유지:

```tsx
						<div className="flex flex-wrap gap-2">
							<Link
								className={buttonVariants({ variant: "outline" })}
								href={"/employer/settings" as Route}
							>
								조직 설정
							</Link>
						</div>
```

- [ ] **Step 2: 타입체크**

Run: `pnpm -F web check-types`
Expected: PASS.

- [ ] **Step 3: 린트·포맷**

Run: `pnpm dlx ultracite fix apps/web/src/app/employer/page.tsx`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/employer/page.tsx
git commit -F - <<'EOF'
refactor: 구인자 관리 주 CTA를 헤더 actions로 이동

- 새 공고 등록을 PageShell actions 슬롯으로 재배치
- 조직 프로필 헤더의 성과 분석 중복 링크 제거, 조직 설정만 유지

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: 관리 화면 — 섹션 헤딩 계층 강화

**Files:**
- Modify: `apps/web/src/app/employer/page.tsx` (3개 섹션 `<h2>`)

- [ ] **Step 1: 섹션 헤딩 3곳을 `text-lg font-semibold`로 승격**

세 `<h2>`의 `className="font-medium text-base"`를 `className="font-semibold text-lg"`로 변경(문자열 교체 3회):
- 조직 프로필 `id="organizations"` (현재 309줄)
- 팀 프로필 `id="teams"` (현재 391줄)
- 내 공고 `id="owned-jobs"` (현재 435줄)

각 대상:

```tsx
// 변경 전
<h2 className="font-medium text-base" id="...">
// 변경 후
<h2 className="font-semibold text-lg" id="...">
```

카드 제목(`CardTitle` 내부 `text-base`)과 공고 항목 `<h3>`는 그대로 둔다 → 페이지(2xl)/섹션(lg)/카드·항목(base) 3단 계층.

- [ ] **Step 2: 타입체크**

Run: `pnpm -F web check-types`
Expected: PASS.

- [ ] **Step 3: 린트·포맷**

Run: `pnpm dlx ultracite fix apps/web/src/app/employer/page.tsx`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/employer/page.tsx
git commit -F - <<'EOF'
style: 구인자 관리 섹션 헤딩 계층 강화

- 조직/팀/내 공고 헤딩을 text-lg font-semibold로 승격
- 페이지·섹션·카드 3단 시각 계층 확보

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: 관리 화면 — 공고 리스트 대비·우측 정렬

**Files:**
- Modify: `apps/web/src/app/employer/page.tsx` (`jobsContent`의 `jobs.map` 항목, 현재 257–295줄)

- [ ] **Step 1: 공고 항목 레이아웃 재구성**

`jobs.map((job) => ( … ))` 내부의 `<div className="grid …">` 항목 전체(현재 258–294줄)를 아래로 교체 — 배지 2개 + `수정`을 우측 한 컬럼에 세로 정렬하고, 급여줄을 `text-foreground`로 승격:

```tsx
							<div
								className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
								key={job.id}
							>
								<div className="flex min-w-0 flex-col gap-1">
									<h3 className="min-w-0 break-words font-medium text-base">
										{job.title}
									</h3>
									<p className="break-words text-foreground text-sm">
										{job.industryCategory} · {job.region} ·{" "}
										{formatPay(job.payAmount, job.payUnit)}
									</p>
									<p className="break-words text-muted-foreground text-xs">
										{getOrganizationLabel(job.organizationId)} ·{" "}
										{getTeamLabel(job.teamId)} · 수정{" "}
										{formatDateTime(job.updatedAt)}
									</p>
								</div>
								<div className="flex flex-col items-start gap-2 sm:items-end">
									<div className="flex flex-wrap gap-2 sm:justify-end">
										<StatusBadge tone={getJobStatusTone(job.status)}>
											{getJobStatusLabel(job.status)}
										</StatusBadge>
										<StatusBadge
											tone={getVerificationStatusTone(
												job.employerVerificationStatus
											)}
										>
											{getVerificationStatusLabel(
												job.employerVerificationStatus
											)}
										</StatusBadge>
									</div>
									<Link
										className={buttonVariants({ variant: "outline" })}
										href={`/employer/jobs/${job.id}/edit` as Route}
									>
										수정
									</Link>
								</div>
							</div>
```

- [ ] **Step 2: 타입체크**

Run: `pnpm -F web check-types`
Expected: PASS.

- [ ] **Step 3: 린트·포맷**

Run: `pnpm dlx ultracite fix apps/web/src/app/employer/page.tsx`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/employer/page.tsx
git commit -F - <<'EOF'
style: 구인자 공고 리스트 대비·우측 정렬 정리

- 급여 요약줄을 text-foreground로 승격, 메타줄만 muted 유지
- 배지 2개와 수정 버튼을 우측 한 컬럼에 세로 정렬해 높이 어긋남 해소

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: 관리 화면 — 프로모션 요약 stat chip

**Files:**
- Modify: `apps/web/src/app/employer/page.tsx` (내 공고 섹션 헤더 설명 `<p>`, 현재 438–443줄; import 추가)

**Interfaces:**
- Consumes: `Badge` from `@bambi-app/ui/components/badge` (variant `secondary`, `className`으로 반경 `full`).

- [ ] **Step 1: `Badge` import 추가**

`page.tsx` 상단 import 블록에 추가(기존 `buttonVariants` import 아래 등, 알파벳 정렬은 ultracite가 정리):

```tsx
import { Badge } from "@bambi-app/ui/components/badge";
```

- [ ] **Step 2: 프로모션 요약 문장을 칩 3개로 교체**

내 공고 섹션 헤더의 설명 `<p className="mt-1 text-muted-foreground text-sm"> … </p>`(현재 438–443줄) 전체를 아래로 교체:

```tsx
							<p className="mt-1 text-muted-foreground text-sm">
								최근 수정된 공고부터 표시됩니다.
							</p>
							<div className="mt-2 flex flex-wrap gap-2">
								<Badge className="rounded-full" variant="secondary">
									진행 중 프로모션 {promotionSummary.activeCount}개
								</Badge>
								<Badge className="rounded-full" variant="secondary">
									결제 대기 {promotionSummary.pendingCount}개
								</Badge>
								<Badge className="rounded-full" variant="secondary">
									남은 끌어올리기 {promotionSummary.remainingBoostCount}회
								</Badge>
							</div>
```

- [ ] **Step 3: 타입체크**

Run: `pnpm -F web check-types`
Expected: PASS.

- [ ] **Step 4: 린트·포맷**

Run: `pnpm dlx ultracite fix apps/web/src/app/employer/page.tsx`
Expected: 통과.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/employer/page.tsx
git commit -F - <<'EOF'
style: 프로모션 요약을 Badge 칩으로 시각화

- muted 한 줄 문장을 진행 중/결제 대기/끌어올리기 3개 칩으로 분리
- 스캔성 향상, shadcn Badge(secondary, pill) 재사용

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: 관리 화면 — 팀 빈상태 컴팩트화

**Files:**
- Modify: `apps/web/src/app/employer/page.tsx` (팀 프로필 `EmptyState` 사용처, 현재 423–426줄)

**Interfaces:**
- Consumes: `EmptyState` 의 `className` prop (Task 2).

- [ ] **Step 1: 팀 빈상태에 `className`으로 높이 축소 전달**

팀 프로필 섹션의 `EmptyState`(현재 423–426줄)에 `className="min-h-0 py-8"` 추가:

```tsx
						<EmptyState
							className="min-h-0 py-8"
							description="팀 프로필이 생기면 지역별 소속 정보를 확인할 수 있습니다."
							title="팀 프로필이 없습니다"
						/>
```

조직 프로필 빈상태(현재 381–384줄)와 그 외 `EmptyState`는 그대로 둔다(기본 `min-h-48` 유지).

- [ ] **Step 2: 타입체크**

Run: `pnpm -F web check-types`
Expected: PASS.

- [ ] **Step 3: 린트·포맷**

Run: `pnpm dlx ultracite fix apps/web/src/app/employer/page.tsx`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/employer/page.tsx
git commit -F - <<'EOF'
style: 팀 프로필 빈상태 컴팩트화

- 콘텐츠 없는 팀 섹션이 페이지 최대 면적을 먹던 문제 해소
- EmptyState className으로 높이(min-h-0 py-8)만 축소, 공용 기본값 유지

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: 최종 통합 검증

**Files:** 없음(검증만)

- [ ] **Step 1: 전체 타입체크**

Run: `pnpm -F web check-types`
Expected: PASS.

- [ ] **Step 2: 전체 린트**

Run: `pnpm check`
Expected: 통과(또는 `pnpm dlx ultracite fix` 후 재확인).

- [ ] **Step 3: 변경 파일 3개 확인 + diff 리뷰**

Run: `git diff --stat main...HEAD`
Expected: `page-shell.tsx`, `empty-state.tsx`, `employer/page.tsx` 3개 + spec/plan 문서만 변경.

- [ ] **Step 4: 사용자 시각 확인 요청**

개발 서버·스크린샷은 규칙상 금지 → 사용자에게 `/employer` 화면 육안 확인 요청. 이슈 없으면 브랜치 완료 처리(finishing-a-development-branch).

## Self-Review

- **Spec coverage:** A(폭 캡=Task1, actions=Task1) · B1 CTA재배치=Task3 · B2 성과분석중복제거=Task3 · B3 계층=Task4 · B4 대비=Task5 · B5 리스트정렬=Task5 · B6 팀빈상태=Task2+Task7 · B7 프로모션칩=Task6. 모든 spec 항목에 대응 태스크 존재.
- **Placeholder scan:** TODO/TBD/"적절히"/미완 코드 없음 — 모든 코드 스텝에 실제 코드 포함.
- **Type consistency:** `actions?: React.ReactNode`(Task1)↔Task3 사용 일치. `className?: string`(Task2)↔Task7 사용 일치. `promotionSummary.activeCount/pendingCount/remainingBoostCount`는 기존 `getPromotionSummary` 반환 필드와 일치. `Badge` variant `secondary`는 badge.tsx에 존재.
- **주의:** Task 3~7이 동일 파일(`employer/page.tsx`)을 순차 수정하므로 반드시 순서대로 실행. 각 태스크 시작 전 현재 파일 상태를 Read로 확인(줄 번호는 편집에 따라 이동).
