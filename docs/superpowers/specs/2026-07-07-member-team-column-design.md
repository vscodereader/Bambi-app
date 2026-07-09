# 팀 관리 멤버 목록에 소속 팀 표시

## 배경 / 문제

`apps/web/src/components/bambi/team-member-list.tsx`의 멤버 목록은 멤버 이름·상태·이메일·날짜·권한(role)만 보여준다. 각 멤버가 어느 팀(team)에 속해있는지는 UI에 드러나지 않는다.

원인: 멤버십은 조직(organization) 단위(`member` 테이블)이고, 팀 소속은 별도 `teamMember` 조인 테이블에 있는데 `listMembers`(`packages/api/src/routers/bambi/organizations.ts`) 쿼리에서 이 테이블을 조인하지 않는다. 실제로 active 멤버에 대해 `teamId: null`을 명시적으로 반환한다.

- 조직 : 팀 = 1 : N (`team.organizationId`)
- 팀 표시명 = `employerTeamProfile.displayName` (없으면 `team.name`)
- 한 멤버는 여러 팀에 속할 수 있음(다중 소속이 흔함) → 팀 목록을 배열로 표시

## 목표

멤버 목록에서 각 멤버(소유자 제외)가 속한 팀을 권한(role) 컬럼 왼쪽에 표시한다.

## 설계

### 백엔드 — `listMembers` (organizations.ts)

- 조직의 팀 이름 맵과 팀-멤버십을 추가 조회:
  - `team` LEFT JOIN `employerTeamProfile` → `Map<teamId, name>` (`displayName ?? team.name`)
  - `teamMember` INNER JOIN `team`(organizationId 필터) → `userId`별 팀 목록
- 반환 항목에 `teams: { id: string; name: string }[]` 추가.
  - active 멤버: 해당 `userId`의 팀 목록 (기존 `teamId: null` 대체)
  - pending 초대: 초대된 `teamId` 단건을 이름으로 resolve해 `[{id,name}]` 또는 `[]`

### 프론트 — `team-member-list.tsx`

- 멤버 행 그리드를 3열 → 4열로 확장: **이름 | 소속 팀 | 권한 텍스트 | 권한 변경 Select**.
  - `md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_110px_150px]`
- 소속 팀 셀:
  - `member.role === "owner"` → muted `"—"` (소유자 제외)
  - `member.teams.length > 0` → 각 팀명을 shadcn `Badge`(variant `secondary`)로 나열, `flex flex-wrap gap-1`
  - 팀 없음(방어) → muted `"소속 팀 없음"`
- 모바일(md 미만)에서는 기존처럼 세로 스택.

## 비목표

- 팀 소속 편집/이동 기능 (표시만).
- 초대 폼 변경 (기존 유지).

## 검증

- `pnpm dlx ultracite fix` (린트/정렬), 타입체크.
- 빌드/실행·스크린샷은 하지 않음(프로젝트 규칙). 시각 확인은 사용자에게 요청.
