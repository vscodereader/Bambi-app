# 구인자 팀 합류 — 운영자 승인 방식 설계

작성일: 2026-07-08

## 배경 / 문제

직전 온보딩·초대 작업(`2026-07-07-employer-onboarding-and-invite-design.md`)에서 팀 초대는
**대상 제한(employer만) + 검색 자동완성**까지만 구현하고, **초대 수락 · member/teamMember 합류
플로우는 후속으로 명시적으로 미뤘다.**

현재 상태:

- `teams.inviteMember`(`packages/api/src/routers/bambi/teams.ts`)는 owner/manager가 employer
  계정을 이메일로 초대하면 `invitation` 레코드를 `status="pending"`으로 생성만 한다.
- 이 초대를 수락해 `member`(조직 소속) + `teamMember`(팀 소속)로 전환하는 서버 procedure나 UI가
  **존재하지 않는다.** (`acceptInvitation` 호출 0건)
- 스키마 컬럼(`invitation.acceptedUserId`, `member.acceptedUserId`, `member.invitedEmail`,
  `member.status`)은 준비돼 있으나 이를 채우는 로직이 없다.

이 공백을 다음 방식으로 채운다.

**핵심 결정: 합류 게이트는 "초대받은 당사자의 수락"이 아니라 "운영자(admin) 승인"이다.**
구인자가 초대하면 곧바로 운영자 승인 대기열에 오르고, 운영자가 승인하는 순간 초대 대상 계정이
자동으로 `member` + `teamMember`로 합류한다. 초대받은 당사자의 별도 수락 단계는 없다.

## 스코프

포함:

- `invitation.status` 생애주기 재정의 및 합류(member+teamMember 생성) 서버 로직
- 운영자 전용 승인/반려 화면 신설 + 반려 사유 입력
- 운영자 승인/반려 감사 로그(`adminModerationAction`)
- 구인자 팀 관리 UI의 상태 문구 정리(운영자 승인 대기/반려 표시)
- 마이그레이션: `invitation.rejectionReason` 컬럼, `moderationTargetType`에 `team_invitation` 추가

제외(후속):

- 초대/승인 결과에 대한 이메일·푸시 알림 (알림 시스템 스코프 밖)
- 초대 링크 발송
- 초대받은 당사자가 직접 수락/거절하는 UI (이번 방식에선 불필요)

## 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 합류 게이트 | **운영자(admin) 승인만.** 초대 당사자 수락 단계 없음. 승인 즉시 자동 합류. |
| 운영자 승인 화면 | **신규 전용 페이지** `/moderator/team-invites` |
| 반려 사유 | **입력받아 저장**(`invitation.rejectionReason`) |
| 다중 소속 | **허용.** 초대 대상이 이미 자기 조직 owner여도 다른 조직 member로 합류 가능. |
| 감사 로그 | **남긴다.** `adminModerationAction`, `moderationTargetType`에 `team_invitation` 추가. |

## `invitation.status` 생애주기

`invitation.status`는 자유 text이며 UI(`team-member-list.tsx`)의 `statusLabels`에
`accepted/pending/expired/rejected`가 이미 정의돼 있다. 의미를 다음으로 확정한다.

- `pending` — 구인자가 초대 직후. **운영자 승인 대기** 상태로 재정의.
- `accepted` — 운영자 승인 완료. `member`(+`teamMember`) 생성됨. `acceptedUserId` 세팅.
- `rejected` — 운영자 반려. `rejectionReason` 채워짐.
- `expired` — `expiresAt`(초대 생성 시 14일) 경과. 목록에서 파생 표시하며 승인 불가.

기존 `searchEmployerInvitees`의 "pending 초대 이메일 제외" 로직은 그대로 유효하다
(승인 대기 중인 이메일은 재초대 대상에서 제외). 반려된 이메일은 pending이 아니므로 재초대 가능해진다.

## 데이터 모델 영향 (마이그레이션 1개)

`packages/db/src/migrations/`의 다음 번호를 사용. `db:push` 금지, **generate → migrate**만 사용.

1. **`invitation.rejectionReason`** (`text`, nullable) 추가 — 운영자 반려 사유 저장.
   (조직 검증은 `employerOrganizationProfile.verificationNote`를 쓰지만, invitation에는
   대응 컬럼이 없어 신설.)
2. **`moderationTargetType` enum에 `team_invitation` 추가** — 감사 로그 대상 타입.
   (현재 값: `job_post`, `chat_room`, `chat_message`, `review`, `user`.)

`invitation.teamId`는 여전히 FK 제약 없는 text이며 그대로 사용한다.

## 설계

### A. 서버 — 초대 생성 (`teams.ts`, 기존 유지)

`teams.inviteMember`는 로직을 유지한다(employer 계정만 초대, `assertOrganizationVerified`로
검증된 조직만, owner/manager 권한). 초대의 의미가 "운영자 승인 대기"로 바뀌는 것은 상태 해석의
변화일 뿐 생성 로직은 동일하다. 필요 시 응답 문구만 정리.

### B. 서버 — 운영자 승인/반려 (`moderation.ts`, 신규)

**`moderation.listPendingTeamInvitations`** (`requireAdminProfile`)

- `invitation.status="pending"` 목록을 조회하고 다음을 join해 반환:
  - 조직명: `employerOrganizationProfile.displayName`(없으면 `organization.name`)
  - 팀명: `invitation.teamId` → `employerTeamProfile.displayName`(없으면 `team.name`), teamId 없으면 null
  - 초대 대상: `invitation.email` + 매칭되는 `user.name`(이메일로 join)
  - 초대자: `invitation.inviterId` → `user.name`
  - 요청 role, 초대일(`createdAt`), 만료일(`expiresAt`)
- 만료(`expiresAt < now`)건은 `isExpired: true`로 표시해 프론트에서 승인 버튼 비활성 처리.

**`moderation.setTeamInvitationStatus`** — 입력 `{ invitationId, status: "accepted" | "rejected", reason? }`,
`requireAdminProfile`.

- 공통: 대상 초대 조회 → `status="pending"`이 아니면 에러(이미 처리됨).
- **accepted** (단일 트랜잭션):
  1. 만료 검증(`expiresAt >= now`), 아니면 에러.
  2. `invitation.email`(소문자)로 `user` + `bambiProfile` 조회. employer 프로필이 없으면 에러
     (초대 시점엔 employer였으나 사라진 방어).
  3. 해당 조직 `member` 존재 확인.
     - 없으면 insert: `organizationId`, `userId`, `role`=정규화된 초대 role
       (`normalizeOrganizationManagementRole`), `status="active"`,
       `invitedEmail`=초대 이메일, `acceptedUserId`=userId.
     - 있으면 재사용(중복 생성 금지). 다중 팀 초대 대응.
  4. `invitation.teamId`가 있으면 `teamMember` 존재 확인 후 없을 때만 insert(`teamId`, `userId`).
     teamId 없으면 조직 멤버만 생성.
  5. `invitation.status="accepted"`, `acceptedUserId`=userId 갱신.
  6. `adminModerationAction` insert: `targetType="team_invitation"`,
     `targetId=invitationId`, `action="set_team_invitation:accepted"`,
     `metadata={ organizationId, teamId, invitedEmail }`.
- **rejected**:
  1. `invitation.status="rejected"`, `rejectionReason=reason` 갱신.
  2. `adminModerationAction` insert(`action="set_team_invitation:rejected"`, metadata 동일 + reason).

다중 소속: 초대 대상이 이미 다른 조직의 owner/member여도 위 로직은 대상 조직 기준으로만 member를
확인·생성하므로 자연스럽게 다중 소속을 허용한다. 합류 후 초대 대상의 `getMyRouting`은 여러 조직을
수용하는 기존 구조로 처리된다.

### C. UI — 운영자 승인 페이지 (신규)

**`apps/web/src/app/moderator/team-invites/page.tsx`**

- `/moderator/employers` 페이지 패턴을 그대로 따른다.
- `listPendingTeamInvitations` 결과를 카드 목록으로: 조직명, 팀명, 초대 대상(이메일 + 이름),
  초대자, 요청 role, 초대일. 만료건은 배지로 구분 + 승인 비활성.
- 각 카드에 **승인 / 반려** 버튼. 반려 클릭 시 카드 하단에 사유 입력(shadcn Textarea) 인라인
  펼침 → 확정. `setTeamInvitationStatus` 호출.
- 성공 시 `listPendingTeamInvitations` 무효화 + toast, 실패 시 에러 toast.
- **moderator nav**에 "팀 합류 승인"(가칭) 항목 추가.

### D. UI — 구인자 팀 관리 문구 정리

**`apps/web/src/components/bambi/team-member-list.tsx`**

- `listMembers`가 반환하는 `kind="invitation"` 항목의 배지 문구를 상태별로 정리:
  - `pending` → "운영자 승인 대기"
  - `rejected` → "반려됨" + 반려 사유 표시(툴팁 또는 보조 텍스트)
  - `expired` → "만료됨"
- `accepted`는 active `member`로 나타나므로 별도 처리 불필요.
- `statusLabels`가 이미 존재하므로 문구·표시만 조정. 필요 시 `listMembers`가 `rejectionReason`을
  함께 내리도록 확장.

### E. 권한 / 서버 방어

- 신규 운영자 procedure(`listPendingTeamInvitations`, `setTeamInvitationStatus`)는 전부
  `requireAdminProfile`.
- 초대 생성(`inviteMember`)은 기존 `requireOrganizationTeamManagementAccess`(owner/manager) +
  `assertOrganizationVerified` 유지.

## 테스트 관점 (`*.test.ts`, `createProcedureClient`)

- **승인 → 합류**: teamId 있는 초대 승인 시 `member` + `teamMember` 생성, `invitation.status`
  =`accepted`, `acceptedUserId` 세팅.
- **teamId 없는 초대**: 승인 시 `member`만 생성(teamMember 없음).
- **중복 방지**: 이미 그 조직 member인 계정을 다른 팀으로 초대·승인 시 member 중복 생성 없이
  teamMember만 추가.
- **반려**: `status=rejected`, `rejectionReason` 저장, 감사 로그 기록.
- **만료**: `expiresAt` 지난 초대 승인 차단.
- **권한**: 비-admin이 `setTeamInvitationStatus`/`listPendingTeamInvitations` 호출 시 FORBIDDEN.
- **다중 소속**: 자기 조직 owner인 employer도 승인 시 다른 조직 member로 합류.
- **감사 로그**: 승인/반려 각각 `adminModerationAction`에 올바른 `targetType`·`action` 기록.

## 미해결 / 후속

- 초대/승인 결과 알림(이메일·푸시)은 알림 시스템 도입 후 별도 설계.
- 초대 대상 당사자가 스스로 초대를 확인/거절하는 UI가 필요해지면 재검토(현재 방식은 운영자 승인만).
