# 매뉴얼 가독성 개선 + 마이페이지 진입점 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/manual/*` 본문을 읽기 좋은 타이포로 전면 개선하고(md 무수정), 마이페이지 메뉴에 "이용 가이드" 진입점을 추가한다.

**Architecture:** streamdown `components` 오버라이드 확장(p·리스트·인용문·표·코드) + 본문 폭 제한 + 목차 scrollspy. 진입점은 `my-page-shell.tsx`의 `NAV_ITEMS` 한 줄 추가(운영자는 기존 패턴대로 숨김). 라우트·가드·앵커는 무변경.

**Tech Stack:** Next.js 16 App Router, streamdown@1.6.11, Tailwind v4(시맨틱 토큰), IntersectionObserver, vitest.

## Global Constraints

- 빌드·dev 서버 기동 금지(사용자 IDE에서 실행 중, HMR 반영). 검증은 ultracite·check-types·vitest만.
- `docs/manual/*.md` 원본 무수정. URL·라우트·접근 가드·`outputFileTracingIncludes`·앵커 52개 무변경.
- 새 의존성 추가 금지.
- 스타일: 인라인 `style` 금지, 임의 px(`[Npx]`) 금지 — Tailwind 스케일 토큰만. 색은 시맨틱 토큰(`text-foreground`·`bg-muted`·`border-border`·`border-primary` 등). `space-x/y-*` 금지. 조건부 클래스는 `cn()`.
- UI를 만지는 태스크(2·3)는 **frontend-design 스킬 지침 적용** 대상(디스패치 프롬프트에 명시됨).
- 테스트는 `apps/web/test/` 미러 구조 + `@/` alias. 실행은 `apps/web` cwd에서 `pnpm vitest run <파일>`.
- 커밋 메시지는 한국어 `type: 제목` + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음). 임시 파일 + `git commit -F` 사용.
- 워커는 git 명령 사용 금지 표시가 있는 경우 파일 작성만 한다(커밋은 컨트롤러).

---

### Task 1: 마이페이지 "이용 가이드" 진입점

**Files:**
- Modify: `apps/web/src/components/bambi/icons.tsx` (import 목록 + export 1줄)
- Modify: `apps/web/src/components/bambi/my-page-shell.tsx:57-98` (`NAV_ITEMS`, `HIDDEN_MY_PAGE_HREFS`)
- Test: `apps/web/test/components/bambi/my-page-menu-roles.test.ts`

**Interfaces:**
- Consumes: `MANUAL_PATH`(= `"/manual"`, `@/lib/bambi/manual`), `fill()`(icons.tsx 내부), lucide `BookOpen`.
- Produces: `BookOpenIcon`(icons.tsx export — 다른 태스크는 사용 안 함).

- [ ] **Step 1: 실패하는 테스트 먼저**

`apps/web/test/components/bambi/my-page-menu-roles.test.ts`의 운영자 숨김 테스트 루프에 `"/manual"`을 추가한다:

```ts
	it("운영자는 신고·면접·차단·이용 가이드·고객센터를 감춘다", () => {
		for (const href of [
			"/seeker/me/reports",
			"/seeker/me/interviews",
			"/seeker/me/blocks",
			"/manual",
			"/support",
		]) {
			expect(shell).toContain(`\t\t"${href}",`);
		}
	});
```

- [ ] **Step 2: 실패 확인**

Run (cwd `apps/web`): `pnpm vitest run test/components/bambi/my-page-menu-roles.test.ts`
Expected: FAIL — `"/manual"` 미포함.

- [ ] **Step 3: 구현**

`icons.tsx`: lucide import 목록에 `BookOpen` 추가(알파벳 순), export 블록에 알파벳 순서로:

```tsx
export const BookOpenIcon = fill(BookOpen);
```

`my-page-shell.tsx`:
1. `./icons` import에 `BookOpenIcon` 추가.
2. `@/lib/bambi/manual`에서 `MANUAL_PATH` import.
3. `NAV_ITEMS`의 고객센터 항목 **바로 위**에:

```tsx
	{ href: MANUAL_PATH, icon: <BookOpenIcon />, label: "이용 가이드" },
```

4. `HIDDEN_MY_PAGE_HREFS.admin` 배열의 `"/support"` **바로 위**에 `"/manual",` 추가. 배열 위 주석도 실태에 맞게 갱신(운영자는 이용 가이드를 콘솔 "콘텐츠 → 운영자 매뉴얼"로 본다는 한 줄).

데스크톱 허브 카드(`screens/seeker.tsx`의 `seekerMeSections`)에는 **추가하지 않는다** — 고객센터도 거기 없는 안내 카드 목록이다(스펙 확정).

- [ ] **Step 4: 통과 확인**

Run (cwd `apps/web`): `pnpm vitest run test/components/bambi/my-page-menu-roles.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 린트·타입체크**

Run (cwd 워크트리 루트): `pnpm dlx ultracite fix apps/web/src/components/bambi/icons.tsx apps/web/src/components/bambi/my-page-shell.tsx apps/web/test/components/bambi/my-page-menu-roles.test.ts`
Run (cwd `apps/web`): `pnpm check-types`
Expected: 0 에러.

- [ ] **Step 6: Commit** (컨트롤러 수행)

```
feat: 마이페이지 메뉴에 이용 가이드 진입점 추가
- NAV_ITEMS 고객센터 위에 이용 가이드(BookOpenIcon·MANUAL_PATH) 추가
- 운영자는 HIDDEN_MY_PAGE_HREFS로 숨김(콘솔 메뉴 사용, 고객센터와 동일 패턴)
- my-page-menu-roles 테스트에 /manual 숨김 케이스 반영
```

### Task 2: 본문 타이포그래피 전면 개선

**Files:**
- Modify: `apps/web/src/components/bambi/manual/manual-body.tsx`
- Modify: `apps/web/src/components/bambi/manual/manual-screen.tsx:47`

**Interfaces:**
- Consumes: `githubSlug`(`@/lib/bambi/manual-parse`), streamdown `components` 오버라이드(기존 파일 참고).
- Produces: 없음(내부 렌더러). Task 3은 이 태스크가 부여하는 헤딩 `id`(기존과 동일 규칙)를 사용.

- [ ] **Step 1: manual-screen.tsx 본문 폭 제한**

47행 본문 래퍼를 수정:

```tsx
				<div className="min-w-0 max-w-3xl flex-1">
					<ManualBody markdown={doc.markdown} />
				</div>
```

- [ ] **Step 2: manual-body.tsx 오버라이드 확장**

기존 파일의 `textOf`·`githubSlug`·`Anchor`·`controls`/`parseIncompleteMarkdown` 설정은 유지하고, 헤딩 여백을 키우고 본문 요소 오버라이드를 추가한다. 목표 코드(전체 교체 기준, 기존 주석 톤 유지):

```tsx
function Heading2({ children }: { children?: ReactNode }) {
	return (
		<h2
			className="mt-12 mb-4 scroll-mt-24 border-t pt-8 font-semibold text-2xl first:mt-0 first:border-t-0 first:pt-0"
			id={githubSlug(textOf(children))}
		>
			{children}
		</h2>
	);
}

function Heading3({ children }: { children?: ReactNode }) {
	return (
		<h3
			className="mt-8 mb-3 scroll-mt-24 font-semibold text-xl"
			id={githubSlug(textOf(children))}
		>
			{children}
		</h3>
	);
}

function Heading4({ children }: { children?: ReactNode }) {
	return (
		<h4
			className="mt-6 mb-2 scroll-mt-24 font-semibold text-lg"
			id={githubSlug(textOf(children))}
		>
			{children}
		</h4>
	);
}

function Paragraph({ children }: { children?: ReactNode }) {
	return <p className="my-4 leading-7">{children}</p>;
}

function UnorderedList({ children }: { children?: ReactNode }) {
	return <ul className="my-4 list-disc pl-6">{children}</ul>;
}

function OrderedList({ children }: { children?: ReactNode }) {
	return <ol className="my-4 list-decimal pl-6">{children}</ol>;
}

function ListItem({ children }: { children?: ReactNode }) {
	return <li className="my-2 leading-7">{children}</li>;
}

// 매뉴얼의 > 블록은 전부 주의·팁 성격이라 콜아웃 박스로 렌더한다.
// 내부 단락의 상하 여백은 박스 안 gap으로 대체한다.
function Blockquote({ children }: { children?: ReactNode }) {
	return (
		<blockquote className="my-4 flex flex-col gap-2 rounded-md border-primary border-l-4 bg-muted/50 px-4 py-3 [&_p]:my-0">
			{children}
		</blockquote>
	);
}

function Table({ children }: { children?: ReactNode }) {
	return (
		<div className="my-4 w-full overflow-x-auto rounded-lg border">
			<table className="w-full border-collapse text-sm">{children}</table>
		</div>
	);
}

function TableHeaderCell({ children }: { children?: ReactNode }) {
	return (
		<th className="border-border border-b bg-muted px-3 py-2 text-left font-semibold">
			{children}
		</th>
	);
}

function TableCell({ children }: { children?: ReactNode }) {
	return (
		<td className="border-border border-b px-3 py-2 align-top leading-6">
			{children}
		</td>
	);
}

// 매뉴얼의 인라인 코드는 /jobs 같은 주소 표기다. 코드펜스는 매뉴얼에 없다.
function InlineCode({ children }: { children?: ReactNode }) {
	return (
		<code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-sm">
			{children}
		</code>
	);
}

export function ManualBody({ markdown }: { markdown: string }) {
	return (
		<Streamdown
			components={{
				a: Anchor,
				blockquote: Blockquote,
				code: InlineCode,
				h2: Heading2,
				h3: Heading3,
				h4: Heading4,
				li: ListItem,
				ol: OrderedList,
				p: Paragraph,
				table: Table,
				td: TableCell,
				th: TableHeaderCell,
				ul: UnorderedList,
			}}
			controls={false}
			parseIncompleteMarkdown={false}
		>
			{markdown}
		</Streamdown>
	);
}
```

구현 시 확인·재량 사항(frontend-design 지침 하에 미세 조정 허용, 구조 변경은 불가):
- streamdown 기본 `table`이 자체 오버플로 래퍼를 가지면 중복 래퍼가 생기지 않는지 `node_modules/streamdown/dist`에서 확인하고, 중복이면 우리 래퍼만 남긴다.
- 마지막 표 행의 `border-b`가 래퍼 `border`와 겹쳐 보기 싫으면 `[&:last-child]:border-b-0`류로 정리해도 된다.
- 표 안 `p`는 streamdown이 만들지 않는 것이 보통이나, 생기면 `[&_p]:my-0`를 td에 얹는다.

- [ ] **Step 3: 기존 테스트 회귀 확인**

Run (cwd `apps/web`): `pnpm vitest run test/lib/bambi/manual.test.ts test/lib/bambi/manual-parse.test.ts`
Expected: PASS (18 tests) — 이 태스크는 파서·매핑 로직을 건드리지 않는다.

- [ ] **Step 4: 린트·타입체크**

Run (cwd 워크트리 루트): `pnpm dlx ultracite fix apps/web/src/components/bambi/manual/manual-body.tsx apps/web/src/components/bambi/manual/manual-screen.tsx`
Run (cwd `apps/web`): `pnpm check-types`
Expected: 0 에러.

- [ ] **Step 5: Commit** (컨트롤러 수행)

```
feat: 매뉴얼 본문 타이포그래피 가독성 개선
- 본문 폭 max-w-3xl 제한, 단락·리스트 행간(leading-7)·간격 확대
- h2 챕터 구분선(mt-12 pt-8 border-t), h3/h4 여백 위계
- 인용문을 코럴 좌측 보더 콜아웃으로, 표 헤더 bg-muted·셀 여백 확대
- 인라인 코드 칩 스타일, md 원본·앵커·라우트 무변경
```

### Task 3: 목차 scrollspy (현재 위치 하이라이트)

**Files:**
- Modify: `apps/web/src/components/bambi/manual/manual-toc.tsx`

**Interfaces:**
- Consumes: `ManualHeading`(`@/lib/bambi/manual-parse`), Task 2가 유지한 헤딩 `id`(= `heading.slug`).
- Produces: 없음(내부 컴포넌트, 시그니처 `{ headings: ManualHeading[] }` 불변).

- [ ] **Step 1: 클라이언트 전환 + 관찰 로직**

`manual-toc.tsx`를 다음 목표 코드로 교체한다:

```tsx
"use client";

// 파싱된 h2/h3 목록을 앵커 링크로 렌더한다. 배치(사이드바/접이식)는 부모가 결정.
// key는 slug 하나면 충분하다 — 매뉴얼 3종 모두 파일 내 h2/h3 제목이 유일함을 확인했다.
// scrollspy: 뷰포트 상단(sticky 헤더 오프셋 아래)을 마지막으로 지난 헤딩을 현재
// 섹션으로 보고 하이라이트한다. 교차 이벤트는 재계산 트리거로만 쓴다 — 판정을
// 이벤트 누적으로 하면 빠른 스크롤에서 상태가 어긋난다.
import { cn } from "@bambi-app/ui/lib/utils";
import { useEffect, useState } from "react";
import type { ManualHeading } from "@/lib/bambi/manual-parse";

// 헤딩 scroll-mt-24(96px)와 같은 기준선. 이보다 위로 지나간 헤딩이 "읽는 중"이다.
const TOP_OFFSET = 100;

export function ManualToc({ headings }: { headings: ManualHeading[] }) {
	const [activeSlug, setActiveSlug] = useState<null | string>(null);

	useEffect(() => {
		const elements = headings
			.map((heading) => document.getElementById(heading.slug))
			.filter((el): el is HTMLElement => el !== null);
		if (elements.length === 0) {
			return;
		}
		const recompute = () => {
			let current: null | string = null;
			for (const el of elements) {
				if (el.getBoundingClientRect().top <= TOP_OFFSET) {
					current = el.id;
				} else {
					break;
				}
			}
			setActiveSlug(current);
		};
		const observer = new IntersectionObserver(recompute, {
			rootMargin: "-96px 0px 0px 0px",
		});
		for (const el of elements) {
			observer.observe(el);
		}
		recompute();
		return () => observer.disconnect();
	}, [headings]);

	return (
		<nav aria-label="목차" className="flex flex-col gap-1 text-sm">
			{headings.map((heading) => {
				const isActive = heading.slug === activeSlug;
				return (
					<a
						aria-current={isActive ? "location" : undefined}
						className={cn(
							"border-transparent border-l-2 pl-3 text-muted-foreground no-underline transition-colors hover:text-foreground",
							heading.depth === 3 && "pl-7",
							isActive && "border-primary font-medium text-foreground"
						)}
						href={`#${heading.slug}`}
						key={heading.slug}
					>
						{heading.text}
					</a>
				);
			})}
		</nav>
	);
}
```

주의: 문서 최상단(첫 헤딩 이전)에서는 `activeSlug`가 `null`이라 아무것도 하이라이트되지 않는 게 의도다. 모바일 접이식과 데스크톱 사이드바가 이 컴포넌트를 각각 마운트하므로 observer가 2개 돌지만, 헤딩 수십 개 관찰이라 무시 가능한 비용이다(분기하지 않는다).

- [ ] **Step 2: 기존 테스트 회귀 확인**

Run (cwd `apps/web`): `pnpm vitest run test/lib/bambi/manual.test.ts test/lib/bambi/manual-parse.test.ts`
Expected: PASS — scrollspy는 브라우저 API라 단위 테스트를 새로 만들지 않는다(스펙 확정).

- [ ] **Step 3: 린트·타입체크**

Run (cwd 워크트리 루트): `pnpm dlx ultracite fix apps/web/src/components/bambi/manual/manual-toc.tsx`
Run (cwd `apps/web`): `pnpm check-types`
Expected: 0 에러.

- [ ] **Step 4: Commit** (컨트롤러 수행)

```
feat: 매뉴얼 목차 현재 위치 하이라이트(scrollspy)
- ManualToc 클라이언트 전환, IntersectionObserver 재계산 방식
- 활성 항목 코럴 좌측 인디케이터 + text-foreground, aria-current
- 관찰 실패 시 하이라이트만 생략(링크 동작 불변)
```

### Task 4: 전체 검증

**Files:** 없음(검증만).

- [ ] **Step 1: 린트 전체**

Run (cwd 워크트리 루트): `pnpm dlx ultracite fix apps/web/src apps/web/test`
Expected: 0 오류(수정 파일 재정렬만 허용 — diff가 생기면 해당 태스크 커밋에 포함됐어야 하므로 보고).

- [ ] **Step 2: 타입체크**

Run (cwd `apps/web`): `pnpm check-types`
Expected: 0 에러.

- [ ] **Step 3: web 테스트 전체**

Run (cwd `apps/web`): `pnpm vitest run`
Expected: 전체 그린(기준 591 + Task 1 변경분).

- [ ] **Step 4: 사용자 육안 확인 항목 보고**

빌드·스크린샷 금지 규칙에 따라 아래를 사용자 확인 목록으로 보고하고 종료:
- `/manual/*` 본문 폭·행간·챕터 구분선·콜아웃·표 스타일 체감
- 목차 하이라이트가 스크롤을 따라오는지(데스크톱), 앵커 클릭 시 이동 정상
- 마이페이지(구직자·구인자) "이용 가이드" 노출, 운영자 마이페이지에는 미노출
