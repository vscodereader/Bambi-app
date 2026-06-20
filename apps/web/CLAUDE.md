# 밤비 web — UI · 스타일 지침 (shadcn + Tailwind 전용)

`apps/web`의 모든 UI는 **shadcn/ui 컴포넌트 + Tailwind CSS**로만 작성한다.
인라인 `style`와 임의 CSS 작성은 금지한다. (루트 `.claude/CLAUDE.md`의 Ultracite/Biome 규칙도 함께 준수)

## 절대 규칙

1. **인라인 `style={{...}}` 금지.** 모든 스타일은 Tailwind `className`으로 작성한다.
   기존 인라인 스타일 코드는 새로 만지는 파일부터 Tailwind로 전환한다.
2. **CSS는 Tailwind만.** 새 `.css` 파일·전역 클래스·커스텀 셀렉터를 만들지 않는다.
   디자인 토큰은 `src/index.css`의 `@theme`(Tailwind v4)에만 정의하고 유틸리티로 소비한다.
3. **컴포넌트는 shadcn 우선.** 버튼·카드·배지·입력·스위치·체크박스·드롭다운·토스트 등은
   `@bambi-app/ui/components`의 shadcn 컴포넌트를 사용한다. 없으면
   `pnpm dlx shadcn@latest search` → `add`로 추가한 뒤 사용한다. (직접 styled `div`로 재발명 금지)
4. **시맨틱 색 토큰 사용.** `bg-background` `text-foreground` `text-muted-foreground` `bg-primary`
   `border-border` 등 시맨틱 유틸을 쓴다. 브랜드 팔레트는 `@theme`에 정의된 `bg-coral-500`
   `text-ink-800` `bg-green-50` 같은 유틸을 쓴다. **raw hex/oklch 직접 사용 금지.**
   web의 shadcn 시맨틱 토큰(`--primary` 등)은 밤비 코럴 브랜드로 매핑돼 있다.

## shadcn 세부 규칙

- 간격은 `flex`/`grid` + `gap-*`. `space-x-*`·`space-y-*` 금지. 세로 스택은 `flex flex-col gap-*`.
- 가로·세로가 같으면 `size-*` (예: `size-10`, `w-10 h-10` 금지).
- `truncate` 사용 (`overflow-hidden text-ellipsis whitespace-nowrap` 조합 금지).
- 조건부 클래스는 `cn()` (`@bambi-app/ui/lib/utils`). 템플릿 리터럴 삼항 금지.
- 오버레이(Dialog/Sheet/Popover 등)에 수동 `z-index` 금지 — 컴포넌트가 스택을 관리.
- 콜아웃=`Alert`, 빈 상태=`Empty`, 토스트=`sonner`의 `toast()`, 구분선=`Separator`,
  로딩 자리표시=`Skeleton`, 배지=`Badge` (커스텀 styled span 금지).
- 폼은 `Field`/`FieldGroup`, 2~7개 선택지는 `ToggleGroup` (활성 상태 수동 관리 금지).
- 카드는 `CardHeader`/`CardTitle`/`CardContent`/`CardFooter` 풀 구성.
- `Avatar`에는 항상 `AvatarFallback`.
- 버튼 안 아이콘은 `data-icon="inline-start|inline-end"`, 컴포넌트 내부 아이콘에 사이즈 클래스 금지.
- 아이콘은 객체로 전달(`icon={CheckIcon}`), lucide(`lucide-react`).
- 이 레포의 shadcn `base`는 **base-ui**(radix 아님): 커스텀 트리거/엘리먼트는 `asChild`가 아니라
  `render` prop을 쓴다.
- **base 컴포넌트는 밤비 룩으로 재테마됨**(`packages/ui/src/components`). 원래 base-lyra의
  하드코딩 `rounded-none`·고밀도(`text-xs`)를 걷어내고 **반경 토큰 구동**으로 바꿔, `--radius`
  스케일이 실제로 둥근 정도를 제어한다. 새/수정 컴포넌트도 **`rounded-none` 금지**, 반경은
  `rounded-md`/`lg`/`xl`/`2xl`/`full`(= `--radius` 파생) 유틸로 표현한다. 밤비 반경 언어:
  칩·배지·스위치·아바타=`full`, 컨트롤(버튼·입력·검색·아이콘버튼)·카드=`lg`(16px), 타일(로고·인포)=`md`(14px),
  큰 카드·시트·오버레이·탭 트랙=`xl`(20px), 체크박스=`sm`(12px). 이 매핑은 밤비 DS 반경 규칙
  (컨트롤·카드 16 · 타일 14 · 칩/배지/스위치/아바타 pill · 큰 카드/시트 20)을 그대로 따른다.
  `@bambi-app/ui/components`는 **web 전용**이라 (native/server 미사용) base 재테마가 web에만 적용된다.

## RSC

- `rsc: true` 프로젝트. 훅·이벤트 핸들러·브라우저 API를 쓰면 파일 최상단에 `"use client"`.

## 디자인 토큰

- 브랜드: **coral**(primary), **ink**(다크 네이비 surface), green/amber/red(상태).
  `src/index.css`의 `@theme`에 `--color-*`로 노출 → `bg-coral-500` `text-ink-800` 등으로 사용.
- shadcn 시맨틱 토큰(`--primary`/`--background`/`--foreground`/`--muted-foreground`/`--border`/`--ring`/`--radius`)은
  web `:root`(`src/index.css`)에서 밤비 팔레트로 override 된다. base 컴포넌트가 반경 토큰 구동으로
  재테마돼 있어 `--radius`(현재 `1rem`=16px = 밤비 DS `--radius-lg`)가 실제로 shadcn 컴포넌트의 둥근 정도를
  제어한다. 16px를 base로 두면 Tailwind 반경 스케일이 밤비 DS 스케일에 그대로 스냅된다:
  `sm`12·`md`14·`lg`16·`xl`20·`2xl`24 = DS `--radius-md`·`-tile`·`-lg`/`-card`·`-xl`·`-2xl`.
  즉 코럴·둥근 룩이 토큰만으로 따라온다(래퍼에서 일일이 덧칠 불필요). 그림자도 DS 토큰 사용:
  카드 `shadow-[var(--shadow-card)]`, 코럴 CTA 글로우 `shadow-[var(--shadow-primary)]`.

## 작업 흐름

1. 컴포넌트 추가·수정 전 `pnpm dlx shadcn@latest docs <component>`로 API 확인.
2. 설치 컴포넌트: button, card, checkbox, dropdown-menu, input, label, skeleton, sonner.
   필요한 건 `pnpm dlx shadcn@latest add <component>`.
3. 커밋 전 `pnpm dlx ultracite fix`로 Biome 정렬·린트.

## 예외

- `app/preview`(디자인 프리뷰 목업)와 `components/bambi/phone-frame.tsx`는 데모 전용이라 기존
  스타일을 유지할 수 있다. **신규·실서비스 라우트는 위 규칙을 따른다.**
- `components/bambi/`의 기존 프로토타입 디자인시스템(`ds.tsx`)과 화면들(`screens/*`)은 인라인 스타일로
  포팅된 상태이며, 위 표준으로 **점진 전환** 대상이다.
