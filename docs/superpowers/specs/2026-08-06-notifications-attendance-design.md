# 알림 시스템 확장 + 출석체크 설계

- 날짜: 2026-08-06
- 브랜치: `worktree-notifications-attendance` (구현 완료 후 로컬 머지 보류 — 사용자가 다른 브랜치에 직접 머지 예정)
- 상태: 사용자 승인 완료

## 0. 배경과 목표

현재 알림 인프라는 이름부터 범용으로 설계돼 있으나 소비자가 채팅 하나뿐이다:

- `bambi_notification` 테이블(`readAt`·`metadata` 보유)은 **쓰기 전용** — 목록 조회·읽음 처리·배지 API가 리포 전체에 없다.
- 생성 경로는 `bambi-chat-sync-queue.ts`의 `notifyChatMessageCreated()` 단 한 곳.
- `/sse/notifications` SSE는 하트비트·세션 재확인·계정당 5스트림 상한까지 갖춘 완성형이고, 웹 싱글턴 훅(`use-bambi-notification-stream.ts`)은 이벤트 수신 시 채팅 쿼리 2개만 무효화한다.
- 헤더의 벨 아이콘 2곳(`responsive-shell.tsx`)은 onClick 없는 장식이다.
- 면접 제안·연락처 공개의 실시간 신호(`emitRoomUpdated`)는 해당 채팅방 소켓룸에 들어와 있는 클라이언트에게만 닿는다 — 방 밖 사용자는 새로고침 전까지 모른다(현재 가장 큰 구멍).

목표:

1. **알림**: 벨 + 안읽음 배지 + 알림함 화면(읽음 처리) + 탭 비활성 시 Notification API OS 알림. 이벤트를 역할별 필요성 판별에 따라 확장.
2. **출석체크**: 구직자·업주 전용 하루 1회 버튼 출석(보상 없음, 기록·통계만) + 운영자 출석 관리 목록표.

## 1. 확정된 결정 사항

| 갈림길 | 결정 |
|---|---|
| SSE 채널 | 기존 `/sse/notifications` **공용 확장**(채팅 전용으로 묶지 않음). 별도 채널 신설은 스트림 상한·연결 비용만 이중화. 서버 플러그인 변경 없음 |
| 알림 형태 | 벨 아이콘 + 안읽음 배지 + 알림함 화면(읽음 처리) |
| OS 알림 | **Notification API만** (탭 열림·비포커스 시). 진짜 Web Push(서비스워커+VAPID)는 후속 — 의존성 추가 없음 |
| 생성 아키텍처 | **통일 행 + 공통 훅**: 모든 알림을 `bambi_notification` 행으로 통일. 운영자→사용자 축은 `adminModerationAction` 삽입 지점의 공통 훅 하나로 일괄 커버, 사용자간 이벤트만 개별 호출 |
| 이벤트 범위 | **필수 + 유용 전부** (아래 §3 매트릭스). 운영자도 포함 — 새 심사거리(공고 검수·1:1 문의·신고 등) 도착 알림(사용자 지시로 범위 추가) |
| 출석 방식 | 하루 1회 버튼 클릭, 보상 없음(기록·연속일·월 달력). 보상 시스템은 테이블 확장 여지만 남김 |
| 운영자 출석 화면 | 사용자 목록표(검색·역할 필터·정렬) + 상단 요약 카운트. 개인 상세·차트는 후속 |
| 병합 | 구현 완료 후에도 **로컬 머지 금지** — 브랜치·커밋 위치만 보고 |

## 2. 알림 — 데이터·서버

### 2.1 스키마

- **enum 신설**: `notification_target_type`. 감사 로그의 `moderation_target_type`과 분리한다(알림 전용 값으로 감사 enum 오염 방지 — 두 enum은 이 시점부터 독립 진화).
  - 값: `chat_message`, `chat_room`(기존 호환), `interview_schedule`, `contact_reveal`, `support_inquiry`, `report`, `community_post`, `community_comment`, `review`, `job_post`, `employer_verification`, `team_invitation`, `organization_member`
- `bambi_notification.target_type` 컬럼을 새 enum으로 전환. 기존 저장값은 `chat_message`/`chat_room` 2종뿐이고 양쪽 enum에 존재하므로 `USING ... ::text::notification_target_type` 캐스트로 무손실 이전.
- 그 외 컬럼 변경 없음 — `readAt`(읽음), `metadata`(이벤트 세부)가 이미 있다. 이벤트 세부(승인/반려 구분·사유·게시판 등)는 `metadata`에 담는다: `{ action?: string, reason?: string, board?: string, postId?: string, ... }`.
- `actorUserId`는 NOT NULL 유지 — 이번 범위의 모든 이벤트는 행위자가 있다(시스템 발신 알림은 만료 임박 등 후속 범위).
- **마이그레이션**: drizzle generate로 파일 생성까지만. 적용(migrate)은 사용자 명시 지시 후 실행(적용 검증 포함). `db:push` 금지.

### 2.2 읽기 API — `routers/bambi/notifications.ts` (신설)

로그인 사용자 전원(protectedProcedure). 채팅 알림은 채팅 핀이 담당하므로 **알림함 축에서는 채팅류(`chat_message`·`chat_room`)를 제외**해 이중 카운트를 막는다.

- `list({ cursor?, limit=20 })`: 본인 수신 알림 최신순 커서 페이지네이션. 채팅류 제외.
- `unreadCount()`: 본인 미읽음 수(채팅류 제외). 벨 배지용.
- `markRead({ ids })`: 본인 소유 행만 `readAt` 채움(멱등).
- `markAllRead()`: 본인 미읽음 전체.

### 2.3 생성 — 공통 훅 + 개별 호출

**공통 훅** `notifyModerationAction()` (신규 서비스, `bambi-notifications.ts` 확장):

- `adminModerationAction` insert를 수행하는 운영자 조치 핸들러(`moderation.ts` 중 사용자에게 영향 주는 액션, `community.ts`의 글/댓글 상태 변경)에서 호출.
- `(targetType, targetId, action, reason)` → 수신자 해석 맵으로 `recipientUserId`를 구해 `createBambiNotification` 호출.
- 수신자 해석 기본값(조직 팬아웃은 하지 않음 — 담당자 부재 문제는 후속 여지):
  - `job_post` → `jobPost.createdByUserId`
  - `review` → `review.reviewerUserId`
  - `community_post`/`community_comment` → `authorUserId` (게스트 작성분은 null → 알림 생략)
  - `employer_verification` → 해당 조직 `member.role='owner'`의 userId
  - `team_invitation` → 승인: `user.email = invitation.email`인 employer / 반려: `invitation.inviterId`
  - `report` → `report.reporterUserId`
- 해석 실패(수신자 없음)는 조용히 생략. **행위자 본인에게는 생성하지 않는다**(운영자가 자기 글을 숨기는 등).

**개별 호출** (사용자간 이벤트 — 채팅 outbox는 주석 명시대로 채팅 전용 유지, `createBambiNotification` 직접 호출):

- `chats.proposeInterview` / `setInterviewStatus` → 상대 참여자(`getChatRecipientUserId` 재사용)
- `chats.revealContact` → `room.jobSeekerUserId`
- `support.createInquiryMessage`(`isStaff=true`) → `supportInquiry.authorUserId`
- `community.createComment` → 글 작성자 + (대댓글이면) 부모 댓글 작성자. **부모 댓글 SELECT에 `authorUserId` 컬럼 추가 필요**(현재 미조회). 글 작성자=댓글 작성자 등 중복·본인은 제거
- `reviews.create` → `room.employerUserId`
- `moderation.acceptTeamInvitation` → 합류된 employer / `rejectTeamInvitation` → `invitation.inviterId`
- `teams.removeMember` / `setMemberRole` / `transferOwnership` → 대상 `member.userId`
- `community.createPost`(board=`legal`, 잠금글) → `bambiProfile.role='legal_advisor'` 전원 팬아웃(`bambi_profile_role_idx` 인덱스 존재, 계정 수 소수)

**운영자 팬아웃** (새 심사거리 도착 — `bambiProfile.role='admin'` 전원에게 행 생성, legal 팬아웃과 동일 패턴):

- `jobs.create` 등 공고가 검수 대기 상태로 들어가는 지점(생성·반려 후 재제출) → 새 공고 검수 대기
- `support.createInquiry` → 새 1:1 문의 접수 / `support.createInquiryMessage`(`isStaff=false`) → 사용자 재질문
- `moderation.createReport` → 새 신고 접수
- `onboarding.submitEmployerBusinessInfo` → 사업자 인증 제출(재제출 포함)
- `teams.inviteMember` / `resubmitInvitation` → 팀 초대 심사 요청
- `reviews.create`(정책 결과가 심사 대기일 때) → 리뷰 심사 대기

운영자 알림의 알려진 한계(수용): 읽음은 행 단위 개인 상태라 **한 운영자가 큐를 처리해도 다른 운영자의 알림은 미읽음으로 남는다**. 처리 연동(대상 처리 시 관련 알림 일괄 읽음)은 후속. 볼륨이 큰 축(공고·신고)은 알림함이 길어질 수 있으나 "모두 읽음"으로 관리한다.

**에러 처리**: 알림 생성은 전부 best-effort. 실패해도 본 작업(면접 제안·검수 등)을 실패시키지 않고 로그만 남긴다(기존 `createBambiNotification` 호출부 패턴과 동일).

### 2.4 SSE

- 이벤트 페이로드의 `targetType` 타입을 새 enum 값 전체로 확장(`bambi-notification-stream.ts:7`의 리터럴 유니언). 와이어 포맷·플러그인·하트비트·상한 로직 변경 없음.

## 3. 알림 이벤트 확정 매트릭스

judgment 근거: "사용자 A의 행위가 B에게 영향을 주는데 B가 새로고침 전까지 모르는" 이벤트를 역할별로 전수 조사(graphify + 라우터 스윕)한 결과.

### 구직자(job_seeker) 수신

| 이벤트 | 발생 지점 | targetType | 딥링크 |
|---|---|---|---|
| 면접 제안 수신 | `chats.proposeInterview` | `interview_schedule` | `/seeker/chats/{roomId}` |
| 면접 상태 변경(확정·거절·취소·완료) | `chats.setInterviewStatus` | `interview_schedule` | `/seeker/chats/{roomId}` |
| 연락처 공개됨 | `chats.revealContact` | `contact_reveal` | `/seeker/chats/{roomId}` |
| 문의 답변 도착 | `support.createInquiryMessage`(staff) | `support_inquiry` | `/support/inquiries/{id}` |
| 신고 처리 결과 | `moderation.setReportStatus`(+bulk) | `report` | `/seeker/me/reports` |
| 내 글에 새 댓글 | `community.createComment` | `community_post` | `/board/{board}/{postId}` |
| 내 댓글에 대댓글 | `community.createComment`(parent) | `community_comment` | `/board/{board}/{postId}` |
| 내 글/댓글 숨김·삭제 | `community.setPostStatusByAdmin`/`setCommentStatusByAdmin` | `community_post`/`community_comment` | `/board/{board}/{postId}` |
| 내 리뷰 승인/숨김 | `moderation.setReviewStatus`(+bulk) | `review` | `/seeker/jobs/{jobPostId}` |

### 업주(employer) 수신

| 이벤트 | 발생 지점 | targetType | 딥링크 |
|---|---|---|---|
| 공고 검수 승인/반려/보류 | `moderation.setJobPostStatus`(+bulk) | `job_post` | `/employer/jobs/{id}/edit` |
| 공고 결제 승인(노출 개시) | `moderation.setJobPostPayment`(+bulk) | `job_post` | `/employer/promotions` |
| 운영자의 내 공고 수정/삭제/노출 조정 | `moderation.adminUpdateJobPost`/`adminDeleteJobPost`/`adjustJobPostExposure` | `job_post` | `/employer` |
| 사업자 인증 승인/반려 | `moderation.setEmployerVerificationStatus` | `employer_verification` | `/employer/settings` |
| 팀 초대 승인(합류됨) | `moderation.acceptTeamInvitation` | `team_invitation` | `/employer/settings/teams` |
| 팀 초대 반려(초대자에게) | `moderation.rejectTeamInvitation` | `team_invitation` | `/employer/settings/teams` |
| 새 리뷰 등록 | `reviews.create` | `review` | `/seeker/jobs/{jobPostId}` |
| 구성원 제거/역할 변경/소유권 이전 | `teams.removeMember`/`setMemberRole`/`transferOwnership` | `organization_member` | `/employer/settings/teams` |
| (대칭) 면접·연락처·문의·신고·커뮤니티 | 구직자 표와 동일 | — | — |

### 법률자문(legal_advisor) 수신

| 이벤트 | 발생 지점 | targetType | 딥링크 |
|---|---|---|---|
| legal 게시판 새 잠금글 | `community.createPost`(legal) | `community_post` | `/board/legal/{postId}` |
| 담당 글 추가 질문(댓글) | `community.createComment` | `community_post` | `/board/legal/{postId}` |

### 운영자(admin) 수신

| 이벤트 | 발생 지점 | targetType | metadata.action | 딥링크 |
|---|---|---|---|---|
| 새 공고 검수 대기 | `jobs.create`(+반려 후 재제출 지점) | `job_post` | `submitted` | `/moderator/jobs` |
| 새 1:1 문의 접수 | `support.createInquiry` | `support_inquiry` | `submitted` | `/moderator/support` |
| 문의 재질문(사용자 메시지) | `support.createInquiryMessage`(`isStaff=false`) | `support_inquiry` | `replied` | `/moderator/support` |
| 새 신고 접수 | `moderation.createReport` | `report` | `submitted` | `/moderator/reports` |
| 사업자 인증 제출/재제출 | `onboarding.submitEmployerBusinessInfo` | `employer_verification` | `submitted` | `/moderator/employers` |
| 팀 초대 심사 요청 | `teams.inviteMember`/`resubmitInvitation` | `team_invitation` | `submitted` | `/moderator/team-invites` |
| 리뷰 심사 대기 | `reviews.create`(pending 판정 시) | `review` | `submitted` | `/moderator/reviews` |

수신자는 `bambiProfile.role='admin'` 전원 팬아웃. enum 추가 값은 필요 없다(전부 기존 값 + `metadata.action`으로 구분).

### 제외 (판정 근거 포함)

- **게스트**: `recipientUserId`가 user FK NOT NULL — 구조적 불가. legal 보드 게스트 작성분 답변 알림은 포기(정책 확정).
- **연락처 요청/응답, 채팅 새 메시지**: 채팅 메시지 알림으로 이미 커버 — 중복 생성 안 함.
- **계정 경고/정지**: `getMine`의 `accountSanction` 배너가 이미 전달.
- **광고 만료 임박**: 이벤트가 없어(읽기 시점 계산) 스케줄러 스윕 + `actorUserId` nullable화 필요 — 후속 분리.
- **문의 종료·차단·팀 삭제**: 스팸성이거나 알리면 안 되는 정책이거나 화면에서 즉시 보임.

## 4. 알림 — 웹 UI

- **벨 배선**: `responsive-shell.tsx`의 벨 2곳(데스크톱 헤더·모바일)에 `unreadCount` 배지(9+ 캡) + 클릭 시 알림함 이동. 채팅 핀과 별개 카운트. **운영자는 `ModeratorShell`(persona-nav.tsx)에 벨 진입점을 추가**(동일 배지·동일 알림함 이동).
- **알림함 라우트**: `/seeker/notifications` 단일 경로를 전 역할(운영자 포함) 공유(채팅 라우트 `/seeker/chats/{roomId}` 공유 선례와 동일).
- **렌더링**: `(targetType, metadata.action)` → 한국어 라벨 맵 + 딥링크 맵을 `apps/web/src/lib/bambi/notification-labels.ts`(순수 로직, vitest 동거)에 정의. enum 원값 화면 노출 금지 규칙 준수. 반려·숨김류는 `metadata.reason`을 본문에 표시.
- **동작**: 항목 클릭 → `markRead` + 딥링크 이동. 상단 "모두 읽음" 버튼. 미읽음 항목은 시각 구분. 빈 상태는 `Empty` 컴포넌트.
- **SSE 훅 확장**(`use-bambi-notification-stream.ts`): targetType이 채팅류면 기존 무효화(채팅 핀·목록·방) 유지, 그 외면 `notifications.list`·`notifications.unreadCount` 무효화. `onOpen`(재연결) 시 양쪽 모두 무효화.
- **Notification API**: 권한 허용 상태 + `document.hidden`일 때만 targetType 라벨로 OS 알림 표시, 클릭 시 딥링크로 포커스 이동. 권한 요청은 알림함 화면의 안내 배너(허용 버튼)에서만 — 진입 시 강제 팝업 금지. 서비스워커·서버 변경·의존성 추가 없음.

## 5. 출석체크

### 5.1 스키마

- `bambi_attendance`: `user_id`(text, user FK, cascade) + `attended_on`(date) 복합 PK, `created_at`. 보상 없음이므로 이 두 축이면 충분 — 보상 도입 시 컬럼 추가로 확장.
- 날짜는 **서버에서 KST 기준으로 계산**(클라이언트 시계 불신). `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })` 기반 순수 함수로 두고 vitest 동거.

### 5.2 API — `routers/bambi/attendance.ts` (신설)

- `checkIn()`: job_seeker·employer만(role 게이트). 오늘(KST) 행 insert, PK 충돌은 `onConflictDoNothing`으로 멱등 — 이미 출석이어도 성공 응답에 오늘 출석 여부 반영.
- `getMine({ month? })`: 해당 월 출석일 배열 + 연속 출석일 + 총 출석일. 연속일은 본인 출석일 목록을 내림차순으로 읽어 조회 시 계산(순수 함수, vitest).
- `adminList({ search?, role?, sort, cursor? })`: admin 전용. 사용자별 총 출석일·이번 달 출석일·마지막 출석일·미출석 경과일을 SQL 집계로 산출, 정렬·검색(닉네임/아이디)·역할 필터·페이지네이션 + 요약 카운트(오늘 출석자 수, 대상 사용자 수).

### 5.3 화면

- **공통 출석 컴포넌트 1개**: 오늘 출석 버튼(출석 완료 시 비활성+완료 표시) + 월 달력 그리드(단순 Tailwind grid 직접 구현 — 달력 라이브러리 추가 없음) + 연속/총 출석 스탯. `/seeker/attendance`·`/employer/attendance` 두 라우트에서 재사용, 각 역할 셸 메뉴에 진입점 추가.
- **운영자**: `/moderator/attendance` — raw shadcn Table 목록표(검색 입력·역할 필터·정렬 헤더·페이지네이션) + 상단 요약 카운트. 기존 모더레이터 화면 패턴 그대로.
- **출석 알림은 만들지 않는다**(보상이 없어 리마인드는 스팸).

## 6. 선행 수정

- **공고 반려 사유 전달 결함**: `listMine`이 `rejectionReason`을 내려주지 않아 업주 화면에 반려 사유가 렌더되지 않는 기존 결함(매뉴얼 결함 메모에도 기록됨). 반려 알림의 착지점이 없으면 알림이 무의미하므로 이번 범위에서 함께 수정 + 화면 표시. 수정 시 매뉴얼 동기화.
- **대댓글 부모 SELECT**: `community.createComment`의 부모 댓글 조회에 `authorUserId` 컬럼 추가(§2.3).

## 7. 테스트·검증

- 순수 vitest(소스 동거): 수신자 해석 맵, KST 날짜·연속 출석일 계산, 알림 라벨/딥링크 맵, SSE 직렬화(targetType 확장), 읽음 처리 로직.
- DB 의존 라우터 테스트는 작성만 하고 실행 보류(기존 관행, `routers/bambi` 스위트 dev DB 파괴 금지 준수).
- 검증: web·server·api·db `check-types` + `ultracite`(경로 인자 필수). dev 서버·스크린샷 금지 — 시각 확인은 사용자 검수.
- 마이그레이션: generate까지, migrate는 사용자 지시 대기.

## 8. 후속(이번 범위 제외) 목록

- 진짜 Web Push(서비스워커 + VAPID + `web-push` 의존성 — 라이브러리 추가 허가 필요)
- 광고 만료 임박 알림(스케줄러 플러그인 + `actorUserId` nullable화)
- 운영자 알림의 처리 연동(대상 처리 시 관련 알림 일괄 읽음) 및 큐별 미처리 카운트 배지
- 조직 단위 이벤트의 구성원 팬아웃(현재는 작성자/owner 1명)
- 출석 보상 시스템, 운영자 개인별 출석 상세·통계 차트
- 오래된 알림 정리(retention)
