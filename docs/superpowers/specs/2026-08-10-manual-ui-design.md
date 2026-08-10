# 역할별 사용자 매뉴얼 UI 설계

> 작성: 2026-08-10 · 대상 워크트리: `worktree-manual-ui`

## 목적

`docs/manual/`의 역할별 사용자 매뉴얼 3종(구직자 `seeker-manual.md` 791줄, 구인자 `employer-manual.md` 779줄, 운영자 `moderator-manual.md` 1,404줄)을 웹 UI에서 역할에 맞게 열람할 수 있게 한다. md 파일이 단일 소스이며, md 수정이 곧 UI에 반영된다(이중 관리 없음).

## 접근 제어 (확정)

로그인 필수. 역할 위계형 열람 범위:

| 역할 | 열람 가능 매뉴얼 |
| --- | --- |
| `job_seeker`, `legal_advisor` | 구직자 |
| `employer` | 구직자, 구인자 |
| `admin` (운영자) | 구직자, 구인자, 운영자 |

- `/manual`은 미들웨어 `PUBLIC_PREFIXES`(`apps/web/src/lib/bambi/resolve-gate.ts`)에 추가하지 않는다 → 비로그인은 기존 게이트대로 로그인으로 리다이렉트되며 별도 코드가 필요 없다.
- 권한 밖 매뉴얼 접근(예: 구직자가 `/manual/moderator`)은 자기 역할의 매뉴얼로 `redirect()`.
- 서버 가드는 기존 패턴(`apps/web/src/lib/bambi/require-role.ts`의 `getMyRouting()` 조회 방식)을 따른다.

## 라우트

`apps/web/src/app/manual/` 하위:

- `/manual` — 자기 역할의 기본 매뉴얼로 redirect (구직자→`/manual/seeker`, 구인자→`/manual/employer`, 운영자→`/manual/moderator`).
- `/manual/seeker`, `/manual/employer`, `/manual/moderator` — 각 매뉴얼 본문 페이지.
- 열람 가능 매뉴얼이 2개 이상인 역할에게는 상단 탭으로 매뉴얼 전환 UI를 보여준다(1개면 탭 숨김).

## 콘텐츠 파이프라인

- RSC(서버 컴포넌트)에서 `fs.readFile`로 `docs/manual/<role>-manual.md`를 읽는다.
- monorepo 루트 해석 헬퍼: `process.cwd()`가 `apps/web`일 때와 리포 루트일 때 모두 동작하도록 후보 경로 순회 폴백. 파일을 못 찾으면 `notFound()`.
- 렌더러는 **이미 설치돼 있고 미사용 상태인 `streamdown`**(`apps/web/package.json`) 사용 — 새 의존성 추가 없음(react-markdown+remark-gfm 계열).
- 헤딩 컴포넌트를 커스텀해 GitHub식 slug의 anchor id를 부여한다. 매뉴얼 본문 안의 목차 링크(`#3-1-공고-탐색-채용정보` 형태 한글 앵커)가 실제로 동작해야 한다.
- md의 첫 `# 제목`과 문서 내 수기 "## 목차" 섹션은 UI 목차 사이드바와 중복되므로 본문 렌더에서 제외한다(제목은 페이지 헤더로 표시).

## 레이아웃

- 데스크톱: 왼쪽 sticky 목차 사이드바(md의 `##`/`###` 헤딩 파싱으로 생성) + 오른쪽 본문. 현재 섹션 하이라이트(scrollspy)는 이번 스코프에서 제외한다.
- 모바일: 상단 접이식(collapsible) 목차.
- 기존 `(legal)` 문서 셸(`apps/web/src/app/(legal)/layout.tsx`)과 support 셸 패턴을 참고하되, 로그인 영역이므로 역할별 앱 셸(`ResponsiveAppShell`)과의 조합은 support 레이아웃 방식을 따른다.
- shadcn 컴포넌트 최대 재사용, 임의 px 금지(Tailwind 토큰), 모바일 반응형 필수. streamdown이 요구하는 CSS는 `apps/web/CLAUDE.md`의 스타일 규칙과 조율해 최소로 도입한다.

## 진입점

1. 고객센터 랜딩(`/support`)에 "이용 가이드" 진입 링크/카드.
2. `apps/web/src/components/bambi/site-footer.tsx` 링크 목록에 추가.
3. 운영자 네비(`apps/web/src/lib/bambi/moderator-navigation.ts`)에 매뉴얼 항목 추가.
4. 경로 상수는 기존 관례(`apps/web/src/lib/bambi/support.ts`의 `SUPPORT_PATH` 방식)에 맞춰 단일 소스로 둔다.

## 스코프 제외 (후속 과제)

- **native(Expo) 노출**: RN용 md 렌더러가 없고 의존성 추가 금지. 추후 `expo-web-browser`(설치됨)로 web 매뉴얼 URL을 여는 방식 검토.
- 매뉴얼 내 검색.
- 운영자가 웹에서 매뉴얼을 편집하는 기능(원본은 git의 md).

## 테스트

- 역할→열람 가능 매뉴얼 목록 매핑을 순수 함수로 분리하고, `apps/web/test/` 미러 구조에 단위 테스트 1개(역할 4종 + 권한 밖 접근 리다이렉트 대상).
- 빌드·dev 서버 기동은 하지 않는다(프로젝트 규칙). 검증은 린트+타입체크, 시각 확인은 사용자.

## 에러 처리

- md 파일 누락/읽기 실패 → `notFound()`.
- 세션 없음 → 기존 미들웨어 게이트가 로그인으로 리다이렉트(신규 코드 없음).
