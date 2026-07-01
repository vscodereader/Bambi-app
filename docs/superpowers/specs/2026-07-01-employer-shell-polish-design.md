# 구인자 shell 개편 + 구인자 관리 화면 폴리시

- 날짜: 2026-07-01
- 대상: `apps/web` (Next.js RSC, shadcn + Tailwind)
- 범위: 구인자 전용 `PageShell` 개편 + 구인자 관리 화면(`app/employer/page.tsx`) 시각 폴리시

## 배경 / 문제

구인자 관리 화면(`/employer`)을 초광폭 모니터에서 캡처해 분석한 결과 다음 문제가 확인됨:

1. `PageShell`이 `max-w-[80%]`만 걸려 있어 초광폭에서 본문 폭이 과확장 → 리스트/카드가
   한 줄로 길게 늘어나고 우측 여백이 크게 남으며, 공고 제목 ↔ `수정` 버튼 간격이 벌어져
   시선이 끊김.
2. 페이지 제목만 `text-2xl`이고 섹션 헤딩과 카드 제목이 모두 `text-base font-medium`으로
   동일 → 시각적 계층이 평평함.
3. 본문 대부분이 `text-muted-foreground` + 소문자라 전체 톤이 흐릿하고 중요 정보(급여)가 묻힘.
4. 팀 프로필 빈 상태 박스가 과도하게 커서, 콘텐츠 없는 섹션이 페이지에서 가장 큰 면적을 차지.
5. 공고 리스트 항목에서 배지(공개·인증완료)는 제목줄 우측, `수정` 버튼은 행 세로 중앙 우측에
   따로 앵커돼 우측 끝 두 그룹의 높이가 어긋남.
6. 액션 버튼 중복/오배치: `성과 분석` 버튼이 두 섹션에 중복, 주 CTA `새 공고 등록`이 공고와
   무관한 조직 프로필 섹션에 위치.
7. 프로모션 요약 통계가 muted 한 줄 문장으로 흘러가 스캔이 안 됨.

## 핵심 발견

`PageShell`은 현재 8개 사용처가 **전부 `employer/*` 라우트**(관리·새 공고·수정·프로모션·조직
설정·팀·성과 분석)로, 이미 구인자 전용이다. 따라서 새 컴포넌트를 별도 생성하지 않고 기존
`PageShell`을 "구인자 전용 shell"로 개편하는 것이 최소 churn 경로다. (import 수정 0곳, 나머지
6개 페이지는 폭 캡 혜택을 자동 수령)

## 설계

### A. `PageShell` 개편 — `components/bambi/page-shell.tsx`

- 이름·경로 유지, 파일 상단에 "구인자 전용 shell" 주석 명기.
- **폭 캡**: `max-w-[80%]` → `max-w-[min(80%,72rem)]` (~1152px 상한). 1440px 이하 데스크톱에선
  기존과 동일, 초광폭에서만 캡. 카드 그리드 최소 3열 컨벤션과 충돌하지 않음.
- **actions 슬롯 추가**: `actions?: React.ReactNode` prop. 헤더 우측에 렌더, 모바일에선 title
  블록 아래로 wrap. 헤더 컨테이너를 `flex flex-wrap items-start justify-between gap-3`로
  구성해 좌측 title/description 블록과 우측 actions를 양끝 배치.
- 하위호환: `actions` 미전달 시 렌더 결과가 현행과 동일(우측 슬롯 미출력).

인터페이스:

```
interface PageShellProps {
  children: React.ReactNode;
  description?: string;
  title: string;
  actions?: React.ReactNode; // 헤더 우측 액션 슬롯 (구인자 페이지 공통)
}
```

### B. 구인자 관리 화면 폴리시 — `app/employer/page.tsx`

정상 로드(profile 있음, role !== job_seeker) 분기만 대상. 상단의 로딩/에러/미로그인/
권한없음 분기는 `PageShell` 폭 캡 혜택만 자동 수령하고 구조 변경 없음.

1. **CTA 재배치(문제 6)**: `새 공고 등록`(primary)을 `PageShell`의 `actions` 슬롯으로 이동.
   조직 프로필 섹션 헤더에서는 제거.
2. **성과 분석 중복 제거(문제 6)**: 조직 프로필 헤더의 `성과 분석` 링크 제거, 내 공고 섹션에만
   유지. `조직 설정`은 조직 프로필 섹션 맥락 액션으로 유지.
3. **계층 강화(문제 2)**: 섹션 헤딩(조직 프로필·팀 프로필·내 공고)을 `text-base font-medium`
   → `text-lg font-semibold`. 카드 제목은 `text-base` 유지 → 페이지(2xl)/섹션(lg)/카드(base)
   3단 계층.
4. **대비 이원화(문제 3)**: 공고 리스트에서 급여 요약줄(`industryCategory · region · pay`)을
   `text-muted-foreground` → `text-foreground`로 승격. 조직·수정일 메타줄은 muted 유지.
5. **공고 리스트 우측 정렬(문제 5)**: 배지 2개 + `수정` 버튼을 우측 한 컬럼에 세로 정렬
   (`flex flex-col items-end gap-2`)로 묶어 높이 어긋남 해소. 그리드는
   `sm:grid-cols-[minmax(0,1fr)_auto]` 유지하되 우측 셀 내부를 재구성. 배지는 제목줄에서
   우측 컬럼으로 이동.
6. **팀 빈상태 축소(문제 4)**: 팀 프로필 `EmptyState`를 컴팩트하게. `EmptyState`가 공용
   컴포넌트이므로 컴포넌트 자체는 수정하지 않고, 관리 페이지 사용처에서 `className`(높이/패딩
   축소)만 전달해 축소한다. (공용 컴포넌트가 `className`을 병합 수용하지 않으면 이 항목은
   보류하고 사용자와 재협의)
7. **프로모션 stat chip(문제 7)**: 내 공고 섹션 설명의 "진행 중인 프로모션 N개 · 결제 대기
   N개 · 남은 끌어올리기 N회" muted 문장을 shadcn `Badge` 칩 3개로 시각화. 반경은 `full`.

### C. 제약 / 스타일 규칙 (apps/web/CLAUDE.md)

- shadcn 컴포넌트 + Tailwind `className`만. 인라인 `style` 금지, 새 `.css` 금지.
- 시맨틱 색 토큰(`text-foreground`/`text-muted-foreground`/`bg-primary` 등) 사용, raw hex 금지.
- 배지/칩은 `Badge`(반경 `full`), 카드 `lg`, 구분선 `Separator`, 빈 상태 `EmptyState` 등 기존
  컴포넌트 재사용. 커스텀 styled span 금지.
- `rounded-none` 금지, 반경은 토큰 파생 유틸로만.
- 간격은 `flex`/`grid` + `gap-*` (`space-*` 금지), 정사각은 `size-*`.

### D. 검증

- **린트 + 타입체크만.** 개발 서버 구동·스크린샷 금지(시각 확인은 사용자 몫).
- 커밋 전 `pnpm dlx ultracite fix`로 Biome 정렬·린트.
- 워크트리 커밋 사전조건: `pnpm install`, 줄바꿈 LF(.gitattributes).

## 비범위 (Out of scope)

- 나머지 6개 employer 페이지의 헤더 버튼을 actions 슬롯으로 이관 → 점진 이관 대상, 별도 작업.
- 구인자 서브내비/breadcrumb.
- seeker 등 비-employer 화면.
- `EmptyState` 공용 컴포넌트 자체의 API/기본 크기 변경.
