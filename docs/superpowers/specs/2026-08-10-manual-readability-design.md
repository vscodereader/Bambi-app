# 매뉴얼 가독성 개선 + 마이페이지 진입점 설계

> 작성: 2026-08-10 · 대상 워크트리: `worktree-manual-readability` (베이스: `feat/manual-ui`)

## 목적

`/manual/*` 매뉴얼 화면의 본문이 streamdown 기본 타이포로 791~1,404줄짜리 문서를
통짜로 렌더해 빽빽하고 읽기 어렵다. md 원본은 그대로 두고 **렌더링만** 손봐
가독성을 올리고, 구직자·구인자가 매뉴얼을 더 쉽게 찾도록 **마이페이지 메뉴에
진입점을 추가**한다.

확정 결정(사용자):
- 본문 구조는 **한 페이지 유지 + 타이포 전면 개선**(챕터 분할 안 함 — URL·앵커 52개 무변경).
- md 원본 무수정(렌더링만).
- 진입점은 **마이페이지 메뉴 추가** 하나. 기존 진입점(고객센터 버튼·푸터·운영자 콘솔)은 유지.

## 1. 진입점 — 마이페이지 메뉴

`apps/web/src/components/bambi/my-page-shell.tsx`:

- `NAV_ITEMS`에 `{ href: MANUAL_PATH, icon: <BookOpenIcon />, label: "이용 가이드" }`
  추가 — 위치는 **고객센터 바로 위**. (`MANUAL_PATH`는 `@/lib/bambi/manual`.)
- 마이페이지는 구직자·구인자 공용 셸이라 한 곳 수정으로 두 역할 모두 커버.
  `/manual` 인덱스가 역할별 기본 매뉴얼로 리다이렉트하므로 역할 분기 불필요.
- 모바일 허브 카드·데스크톱 허브 카드(`screens/seeker.tsx`)가 같은 표를 쓰므로 자동 반영.
- **운영자 숨김**: `HIDDEN_MY_PAGE_HREFS.admin`에 `"/manual"` 추가 — 운영자는 콘솔
  "콘텐츠 → 운영자 매뉴얼"로 들어간다(고객센터를 숨기는 기존 패턴과 동일).
- 아이콘은 lucide `BookOpenIcon`(기존 항목들과 같은 방식으로 JSX로 전달).

## 2. 본문 타이포그래피 — ManualBody 오버라이드 확장

`apps/web/src/components/bambi/manual/manual-body.tsx`. 현재 h2~h4·a만 오버라이드한
것을 본문 전반으로 확장한다. 원칙: streamdown 기본 컴포넌트를 대체하면 기본 클래스가
통째로 사라지므로, 필요한 기본값은 다시 얹은 뒤 가독성 클래스를 더한다.

- **본문 폭**: `manual-screen.tsx` 본문 래퍼(`min-w-0 flex-1`)에 `max-w-3xl` 추가 —
  데스크톱에서 줄 길이가 화면 끝까지 늘어지는 것이 밀도의 주범.
- **단락 `p`**: `leading-7` + 문단 간 간격(`my-4` 수준). 기본(`mb-4` 계열) 대비 행간 확대가 핵심.
- **리스트 `ul`/`ol`/`li`**: 항목 간 `gap`/`my` 확대(`space-y` 금지 — flex/grid `gap` 또는 li `my`),
  들여쓰기 유지.
- **h2 챕터 구분**: `mt-12 pt-8 border-t`(단, 첫 h2는 구분선 제외 — `first:` 배리언트나
  first-of-type 처리), 크기 `text-2xl` 유지. 기존 `scroll-mt-24`·`id` 부여 로직은 그대로.
- **h3**: `mt-8`, **h4**: `mt-6` — 단계적 여백 위계. 크기·`scroll-mt`·`id`는 기존 유지.
- **인용문 `blockquote`**: muted 배경 + 좌측 코럴 보더 콜아웃
  (`border-l-4 border-primary bg-muted/50 rounded-md` + 안쪽 여백). 매뉴얼의 `>` 블록은
  전부 주의·팁 성격이라 콜아웃화가 의미에 맞다. shadcn `Alert`를 억지로 끼우지 않고
  blockquote 오버라이드에 유틸 클래스로 구현한다(md 구조상 아이콘·타이틀 슬롯이 없음).
- **표 `table`/`th`/`td`**: 헤더 `bg-muted`, 셀 여백 확대(`px-3 py-2` 수준), 테두리
  `border-border`. streamdown 기본 가로 스크롤 래퍼가 있으면 유지, 없으면 `overflow-x-auto`
  래퍼를 씌운다(모바일 표 잘림 방지 — 구현 시 실제 기본 마크업 확인).
- **인라인 `code`**: `bg-muted rounded px-1.5 py-0.5 text-sm` 칩 스타일(주소 표기 `/jobs` 등).
- 색은 전부 시맨틱 토큰(`text-foreground`·`text-muted-foreground`·`border-border` 등),
  임의 px 금지(Tailwind 스케일 토큰만), 인라인 style 금지.

## 3. 목차 UX — 현재 위치 하이라이트 (scrollspy)

`apps/web/src/components/bambi/manual/manual-toc.tsx`:

- `"use client"` 전환. IntersectionObserver로 화면에 들어온 헤딩(slug 기준)을 추적해
  현재 섹션 링크를 하이라이트(활성: `text-foreground font-medium` + 좌측 코럴 인디케이터,
  비활성: 기존 `text-muted-foreground`).
- 헤딩 요소는 `headings`의 slug로 `document.getElementById` 조회. observer는 마운트 시
  1회 등록, 언마운트 시 해제.
- 활성 판정은 단순하게: 뷰포트 상단 근처(예: `rootMargin`으로 상단 오프셋 보정)를 지난
  마지막 헤딩 하나를 활성으로 본다. 정밀 스크롤 동기화는 요구하지 않는다.
- 데스크톱 사이드바·모바일 접이식이 같은 컴포넌트를 쓰므로 로직은 공유되고, 모바일은
  접혀 있어 체감 변화 없음(추가 분기 불필요).
- 서버에서 렌더되던 컴포넌트가 클라이언트로 바뀌지만 props(`headings`)는 직렬화 가능한
  데이터라 경계 문제 없음.

## 4. 범위 제외

- md 원본 문장·문단 수정(별도 작업).
- 챕터별 페이지 분할·매뉴얼 내 검색.
- 모바일 접이식 목차의 구조 변경(현행 유지).
- 셸 상단 내비·온보딩 배너 등 다른 진입점 추가.

## 5. 구현 방식·제약

- SDD(서브에이전트 주도), 구현·리뷰는 `opus-high`(**Opus 4.8** + effort high — 2026-08-10
  사용자 지시로 Opus 5에서 변경).
- UI 태스크 디스패치에 **frontend-design 스킬 사용 지시**를 포함한다(사용자 표준 선호).
- 빌드·dev 서버 기동 금지. 검증은 ultracite + check-types + 기존 vitest(시각 확인은 사용자).
- URL·라우트·접근 가드·`outputFileTracingIncludes`·앵커 52개 전부 무변경.

## 6. 테스트

- 기존 매뉴얼 테스트(`apps/web/test/lib/bambi/manual.test.ts`·`manual-parse.test.ts`)는
  로직 무변경이라 그대로 통과해야 한다.
- 마이페이지 노출 규칙(`isMyPageItemVisible`)에 기존 테스트가 있으면 admin 숨김 케이스를
  추가하고, 없으면 새로 만들지 않는다(순수 함수 한 줄 추가에 스위트 신설은 과함).
- scrollspy는 브라우저 API 의존이라 단위 테스트 제외 — 린트·타입체크로 검증.

## 7. 에러 처리

- scrollspy 대상 헤딩이 없거나(`headings` 빈 배열) `getElementById` 실패 시 하이라이트만
  없을 뿐 목차 링크 동작은 기존과 동일해야 한다(관찰 실패가 렌더를 깨지 않게).
