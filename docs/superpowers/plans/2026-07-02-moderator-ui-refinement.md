# 운영자 콘솔 헤더 중복 제거 + UI 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/moderator` 목록 라우트에서 로고·알림벨·섹션 탭이 이중 렌더되는 문제를 없애고, 데스크톱 폭·여백을 정돈한다.

**Architecture:** A안 — 전역 chrome(로고·벨·운영자모드 배지·섹션 nav)은 `ResponsiveAppShell` 헤더가 단독 소유하고, `ConsoleTop`은 "운영자 콘솔" 타이틀 + 통계 요약 배너로 역할을 축소한다. 모바일 섹션 이동은 하단 `ModTabs`, 데스크톱은 상단 nav가 담당한다. moderator 콘텐츠는 중앙 정렬 `max-w-3xl` 컬럼으로 감싼다.

**Tech Stack:** Next.js(App Router) · React(client components) · Tailwind CSS v4 · shadcn(base-ui) · TypeScript. 모노레포(`apps/web`).

## Global Constraints

- 인라인 `style={{...}}` 금지 — 모든 스타일은 Tailwind `className`.
- 새 `.css`·전역 클래스·커스텀 셀렉터 금지. 색은 시맨틱/브랜드 토큰(`bg-secondary`, `text-foreground`, `text-muted-foreground` 등).
- 컴포넌트는 shadcn 우선. 임의 고정폭(`max-w-[1180px]` 등) 금지 — 폭은 Tailwind 스케일(`max-w-3xl`) 사용.
- 세로 스택은 `flex flex-col gap-*` (space-y-* 금지). 가로세로 동일 크기는 `size-*`.
- 기존 프로토타입 파일(`screens/moderator.tsx`)의 임의 px는 이번 범위에서 전면 전환하지 않는다 — 만지는 라인만 관례를 지키고 나머지는 유지.
- `apps/web`의 기존 public/seeker/employer variant 동작을 변경하지 않는다(회귀 금지).
- 검증은 개발서버·스크린샷 없이 린트+타입체크로만. 시각 확인은 사용자가 수행.
- 커밋 메시지: 한국어 `type:` 제목 + 빈 줄 + 블릿 본문. push·PR은 사용자 지시 전까지 하지 않는다.

## 검증 방식 안내

이 파일들은 렌더링 단위 테스트가 없는 UI 컴포넌트이며, 프로젝트 관례상 dev server·스크린샷을 쓰지 않는다. 따라서 각 태스크의 검증 사이클은 **타입체크 + 린트 통과 + 수동 시각 체크리스트**다. 표준 TDD(실패 테스트 먼저)를 적용하지 않는다.

- 타입체크: `pnpm --filter web check-types` (기대: 에러 0)
- 린트/포맷: `pnpm dlx ultracite fix` 후 `pnpm check` (기대: 에러 0)

## File Structure

- `apps/web/src/components/bambi/responsive-shell.tsx` — `ResponsiveAppShell`. moderator variant일 때 헤더 우측 액션을 운영자용(운영자모드 배지 + 벨)으로 분기. 데스크톱·모바일 공용 액션 조각을 내부 헬퍼로 추출.
- `apps/web/src/components/bambi/screens/moderator.tsx` — `ConsoleTop` 축소(로고·벨·운영자모드 배지·`ConsoleTabs` 제거, 타이틀+통계만). `ConsoleTabs` 함수 제거. `ModeratorApp`(preview)의 `ConsoleTop` 호출부 정리. 미사용 import 제거.
- `apps/web/src/components/bambi/persona-nav.tsx` — `ModeratorShell`의 `ConsoleTop` 호출부에서 `tab`/`onTab` 제거. moderator 콘텐츠를 중앙 정렬 `max-w-3xl` 컬럼으로 감쌈(목록·상세 양쪽).

---

### Task 1: ResponsiveAppShell — moderator variant 헤더 chrome

**Files:**
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx`

**Interfaces:**
- Consumes: 기존 `variant?: "public" | "seeker" | "employer" | "moderator"` prop(이미 존재). 기존 import `Badge`, `Button`, `BellIcon`, `ShieldIcon`(모두 이미 import됨).
- Produces: 없음(공개 API 변경 없음). moderator variant 렌더만 변경.

- [ ] **Step 1: moderator 액션 헬퍼 추가**

`ResponsiveAppShell` 함수 선언부(현재 52번째 줄 `export function ResponsiveAppShell(`) **바로 위**에 아래 헬퍼를 추가한다. 데스크톱/모바일 헤더가 공유한다.

```tsx
function ModeratorHeaderActions() {
	return (
		<>
			<Badge className="h-9 gap-1.5 px-3 font-bold" variant="secondary">
				<span className="inline-flex size-3.5">
					<ShieldIcon />
				</span>
				운영자 모드
			</Badge>
			<Button
				aria-label="알림"
				className="bg-card"
				size="icon-lg"
				variant="outline"
			>
				<BellIcon />
			</Button>
		</>
	);
}
```

- [ ] **Step 2: variant 플래그 추가**

`ResponsiveAppShell` 본문 상단, 기존 `const isPublic = variant === "public";`(현재 61번째 줄) 아래에 추가한다.

```tsx
	const isModerator = variant === "moderator";
```

- [ ] **Step 3: 데스크톱 헤더 우측 블록 분기**

데스크톱 헤더의 우측 액션 컨테이너(현재 90–109번째 줄, `<div className="ml-auto flex items-center gap-2">` … `</div>`)를 아래로 교체한다. `{headerSlot}`은 유지하고, moderator일 때 운영자 액션을, 아닐 때 기존 "연락처 보호" 배지 + 링크를 렌더한다.

```tsx
							<div className="ml-auto flex items-center gap-2">
								{headerSlot}
								{isModerator ? (
									<ModeratorHeaderActions />
								) : (
									<>
										<Badge
											className="h-9 gap-1.5 px-3 font-bold"
											variant="success"
										>
											<span className="inline-flex size-3.5">
												<ShieldIcon />
											</span>
											연락처 보호
										</Badge>
										<Link
											className={cn(
												buttonVariants({
													variant: isPublic ? "dark" : "outline",
												}),
												"h-10 px-4 font-bold text-sm no-underline"
											)}
											href={(isPublic ? "/login" : "/seeker/me") as Route}
										>
											{isPublic ? "시작하기" : "내 정보"}
										</Link>
									</>
								)}
							</div>
```

- [ ] **Step 4: 모바일 헤더 우측 블록 분기**

모바일 헤더의 우측 컨테이너(현재 118–133번째 줄, `<div className="flex items-center gap-2">` … `</div>`)를 아래로 교체한다.

```tsx
						<div className="flex items-center gap-2">
							{isModerator ? (
								<ModeratorHeaderActions />
							) : (
								<>
									<Badge
										className="h-8 gap-1.5 px-3 font-bold"
										variant="secondary"
									>
										<span className="inline-flex size-3.5 text-green-600">
											<ShieldIcon />
										</span>
										보호 중
									</Badge>
									<Button
										aria-label="알림"
										className="bg-card"
										size="icon-lg"
										variant="outline"
									>
										<BellIcon />
									</Button>
								</>
							)}
						</div>
```

- [ ] **Step 5: 타입체크 + 린트**

Run: `pnpm --filter web check-types`
Expected: 에러 0.

Run: `pnpm dlx ultracite fix` 그리고 `pnpm check`
Expected: 에러 0.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/components/bambi/responsive-shell.tsx
git commit -F - <<'EOF'
refactor: 운영자 헤더에 운영자모드 배지·알림벨 노출 분기 추가

- ResponsiveAppShell moderator variant 헤더 우측을 운영자용으로 분기
- 데스크톱/모바일 공용 ModeratorHeaderActions 헬퍼 추출
- public/seeker/employer variant 동작은 그대로 유지
EOF
```

---

### Task 2: ConsoleTop 축소 + 호출부 정리

**Files:**
- Modify: `apps/web/src/components/bambi/screens/moderator.tsx`
- Modify: `apps/web/src/components/bambi/persona-nav.tsx` (호출부)

**Interfaces:**
- Consumes: 기존 `StatGroup`(ds), `counts: { queue: number; reports: number; warned: number }`.
- Produces: `ConsoleTop`의 새 시그니처 `{ counts: { queue: number; reports: number; warned: number } }` — `tab`/`onTab` prop 제거. 이 시그니처를 Task 3의 `persona-nav.tsx` 호출부가 소비한다.

- [ ] **Step 1: `ConsoleTop` 본문 교체**

`moderator.tsx`의 `ConsoleTop`(현재 235–277번째 줄)을 아래로 교체한다. 로고 행(로고·운영자모드 배지·벨)과 `ConsoleTabs` 렌더를 제거하고 타이틀 + `StatGroup`만 남긴다. 좌우 패딩은 목록(px-6)에 맞춘다.

```tsx
export function ConsoleTop({
	counts,
}: {
	counts: { queue: number; reports: number; warned: number };
}) {
	return (
		<div className="flex flex-col gap-[14px] px-6 pt-3 pb-3">
			<h1 className="m-0 px-1 font-extrabold text-[24px] text-foreground">
				운영자 콘솔
			</h1>
			<div className="px-1">
				<StatGroup
					items={[
						{ label: "검수 대기", value: counts.queue },
						{ label: "신고 대기", value: counts.reports },
						{ label: "경고 사용자", value: counts.warned },
					]}
				/>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: 미사용 `ConsoleTabs` 함수 제거**

`moderator.tsx`의 `ConsoleTabs` 함수 전체(현재 199–233번째 줄)를 삭제한다. 이 함수는 `ConsoleTop`에서만 쓰였으므로 이제 미사용이다.

먼저 다른 사용처가 없는지 확인한다.

Run: `grep -rn "ConsoleTabs" apps/web/src`
Expected: 정의부(삭제 대상) 외 참조 없음. 참조가 남아 있으면 그 호출부도 함께 정리한다.

- [ ] **Step 3: `persona-nav.tsx` 호출부 정리**

`persona-nav.tsx`의 `ModeratorShell` 안 `ConsoleTop` 렌더(현재 154–162번째 줄)를 아래로 교체한다(`onTab`/`tab` 제거). `go`/`tab` 지역변수는 하단 `ModTabs`가 계속 사용하므로 유지한다.

```tsx
				<ConsoleTop
					counts={{
						queue: queue.length,
						reports: openReports,
						warned: warnedUsers,
					}}
				/>
```

- [ ] **Step 4: `ModeratorApp`(preview) 호출부 정리**

`moderator.tsx`의 `ModeratorApp` 안 `ConsoleTop` 렌더(현재 1583–1591번째 줄)에서 `onTab={setTab}`, `tab={tab}` 두 줄을 제거해 아래로 만든다. 이 화면은 하단 `ModTabs`(현재 1600번째 줄)로 탭 전환을 계속 지원한다.

```tsx
					<ConsoleTop
						counts={{
							queue: queue.length,
							reports: openReports,
							warned: warnedUsers,
						}}
					/>
```

- [ ] **Step 5: 미사용 import 정리**

`ConsoleTop`에서 `Logo`, `IconButton`, `BellIcon` 사용이 사라졌다. 아직 다른 곳에서 쓰는지 확인한다.

Run: `grep -n "Logo\|IconButton\|BellIcon" apps/web/src/components/bambi/screens/moderator.tsx`
Expected: import 라인 외 사용처가 없는 심볼은 import에서 제거한다(`Logo`, `IconButton`은 `../ds`에서, `BellIcon`은 `../icons`에서). `ShieldIcon`은 `ModTabs`에서 계속 쓰이므로 유지. 남은 사용처가 있으면 해당 import는 남긴다. 린트(다음 스텝)가 미사용 import를 재확인한다.

- [ ] **Step 6: 타입체크 + 린트**

Run: `pnpm --filter web check-types`
Expected: 에러 0(호출부에서 `tab`/`onTab` 제거 후에도 타입 정합).

Run: `pnpm dlx ultracite fix` 그리고 `pnpm check`
Expected: 에러 0(미사용 import/함수 없음).

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/components/bambi/screens/moderator.tsx apps/web/src/components/bambi/persona-nav.tsx
git commit -F - <<'EOF'
refactor: ConsoleTop을 타이틀·통계 요약 배너로 축소

- 로고/알림벨/운영자모드 배지 제거(전역 chrome은 AppShell이 소유)
- ConsoleTabs 제거(섹션 이동은 데스크톱 상단 nav·모바일 하단 탭이 담당)
- ConsoleTop 시그니처에서 tab/onTab 제거, 호출부(persona-nav·preview) 정리
- 좌우 패딩을 목록(px-6)에 맞춰 통일
EOF
```

---

### Task 3: 데스크톱 중앙 정렬 컬럼

**Files:**
- Modify: `apps/web/src/components/bambi/persona-nav.tsx`

**Interfaces:**
- Consumes: Task 2의 새 `ConsoleTop({ counts })` 시그니처. 기존 `Content`, `QueueActionBar`, `NavBar`, `ModTabs`, `ConsoleToast`.
- Produces: 없음(레이아웃 래퍼만 추가).

- [ ] **Step 1: 상세 라우트 컬럼 래퍼**

`persona-nav.tsx` `ModeratorShell`의 상세 분기(현재 129–132번째 줄)를 아래로 교체한다. 모바일은 `max-w-3xl`이 화면 폭보다 넓어 사실상 full-width, 데스크톱만 중앙 컬럼이 된다.

```tsx
		const isDetail = MOD_DETAIL_RE.test(path);
		if (isDetail) {
			return (
				<div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
					<Content>{children}</Content>
				</div>
			);
		}
```

- [ ] **Step 2: 목록 라우트 컬럼 래퍼**

`ModeratorShell`의 메인 return(현재 152–177번째 줄)에서 `ConsoleTop`과 `Content`를 하나의 중앙 컬럼으로 감싼다. 하단 `NavBar`(md:hidden 고정 탭)와 토스트는 컬럼 밖에 그대로 둔다. `QueueActionBar`도 컬럼 안에 포함해 목록과 정렬을 맞춘다.

```tsx
		return (
			<>
				<div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
					<ConsoleTop
						counts={{
							queue: queue.length,
							reports: openReports,
							warned: warnedUsers,
						}}
					/>
					<Content>{children}</Content>
					{showActionBar ? (
						<QueueActionBar
							count={selected.length}
							isApplying={isBulkApplying}
							onAction={bulkAction}
							scope={bulkScope}
						/>
					) : null}
				</div>
				<NavBar>
					<ModTabs setTab={go} tab={tab} />
				</NavBar>
				{toast ? <ConsoleToast message={toast} /> : null}
			</>
		);
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `pnpm --filter web check-types`
Expected: 에러 0.

Run: `pnpm dlx ultracite fix` 그리고 `pnpm check`
Expected: 에러 0.

- [ ] **Step 4: 수동 시각 체크리스트(사용자 확인 요청)**

dev server는 사용자가 띄운다. 확인 항목:
- 목록 3개 라우트(`/moderator`, `/moderator/reports`, `/moderator/users`)에서 데스크톱/모바일 각각 **로고 1 · 벨 1 · 섹션 탭 1벌**.
- 상세 라우트(`/moderator/queue/[id]` 등)에서 헤더가 하나만.
- 데스크톱에서 콘텐츠가 중앙 정렬(`max-w-3xl`), 모바일은 화면 폭 가득.
- 하단 탭바 + (선택 시)액션바 겹침 여백 정상.
- public/seeker/employer 헤더 변화 없음.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/bambi/persona-nav.tsx
git commit -F - <<'EOF'
style: 운영자 콘솔 콘텐츠를 데스크톱 중앙 정렬 컬럼으로 정리

- ModeratorShell 목록·상세를 max-w-3xl 중앙 컬럼으로 감쌈
- 모바일은 full-width 유지, 하단 탭바·토스트는 컬럼 밖 유지
EOF
```

---

## Self-Review

- **Spec 커버리지**: (1) 헤더 chrome 통합 A안 → Task 1(AppShell 운영자 chrome) + Task 2(ConsoleTop 축소). (2) 모바일 하단 탭만 유지·ConsoleTabs 제거 → Task 2 Step 2. (3) 데스크톱 중앙 컬럼 → Task 3. (4) 패딩 통일 → Task 2 Step 1(px-6). (5) 검증(린트+타입체크, 시각은 사용자) → 각 태스크 검증 스텝 + Task 3 Step 4. 누락 없음.
- **플레이스홀더 스캔**: TBD/TODO/"적절히 처리" 없음. 모든 코드 스텝에 실제 코드 포함.
- **타입 정합성**: `ConsoleTop`을 `{ counts }` 단일 시그니처로 통일(Task 2) → Task 3·persona-nav·preview 호출부 모두 동일 형태 사용. `counts` 필드명(`queue`/`reports`/`warned`) 전 태스크 일치. `ModeratorHeaderActions`는 Task 1 내부 전용, 외부 참조 없음.
- **리스크**: `ResponsiveAppShell`은 공유 컴포넌트 → moderator 분기만 추가하고 기존 블록은 else로 보존(회귀 방지). `ConsoleTop` 시그니처 변경은 grep으로 전 호출부(2곳) 확인 후 동시 수정.
