# native 운영자 콘솔 설계 (검수·신고·사용자)

- 날짜: 2026-09-07
- 브랜치: `feat/native-admin` (base `mobile`), 작업 워크트리 `worktree-native-admin`
- 범위: native 앱 `(moderator)` 영역을 3탭 셸로 재편하고, 공고 검수·신고 처리·사용자 관리를 web 운영자 콘솔 상세와 동등한 수준으로 구현한다.
- 제외: 다중 선택 일괄 처리, 사업자 검수, 결제, 문의 채팅, 포인트·광고상품·팝업·사이트 설정 등 나머지 web 운영자 메뉴. 사용자 목록의 휴대폰 인증·신고 수·경고 수 필터와 컬럼 정렬. 푸시 알림.

## 1. 현재 상태와 문제

`apps/native/app/(moderator)`는 Stack 셸에 화면 3개(검수 대기·신고·사용자)만 있는 골격이다.

- 검수는 목록에서 승인·숨김·반려를 즉시 호출하며 상세 화면이 없다.
- 상태 변경 API(`setJobPostStatus`, `setReportStatus`, `setUserStatus`)는 사유 2~500자를 필수로 받는데 native는 "모바일 승인" 같은 고정 문자열을 보낸다.
- 신고·사용자 화면은 status·role·targetType enum 원값을 그대로 렌더한다.
- 하위 진입이 헤더 버튼 2개뿐이라 구직자·구인자 영역의 탭 셸과 어긋난다.

web 운영자 콘솔(`apps/web/src/components/bambi/screens/moderator.tsx`, `moderator-context.tsx`)은 사유 시트·프리셋·대상 컨텍스트·제재 이력·탈퇴 복구까지 갖추고 있으나, 라벨·심각도·프리셋이 web 전용 파일(`apps/web/src/lib/bambi/moderation-labels.ts`, `report-labels.ts`)에 있어 native가 import할 수 없다.

## 2. 접근

공유 로직을 `packages/api/src/services/`로 승격하고(알림 라벨 `bambi-notification-labels.ts` 선례), native 화면은 employer 탭 셸을 복제해 새로 만든다. web은 승격된 모듈을 re-export해 회귀 없이 유지한다.

## 3. 공유 모듈: `packages/api/src/services/bambi-moderation-labels.ts`

web의 `moderation-labels.ts`와 `report-labels.ts` 전체를 옮기고 다음을 추가한다.

- `getReportSeverity(report)`: status가 open·reviewing이 아니면 `low`. open·reviewing이고 reason이 `HIGH_SEVERITY_REPORT_REASONS`(`illegal_or_prohibited_content`, `coercion_or_safety`, `underage_concern`)에 속하면 `high`, 아니면 `mid`. 라벨은 높음·중간·참고.
- `QUEUE_VERDICTS`: approve→`published`("운영자가 공고를 승인했습니다."), hold→`on_hold`("운영자가 추가 확인을 위해 공고를 보류했습니다."), reject→`rejected`("운영자가 정책 위반으로 공고를 반려했습니다."). 판정별 프리셋 5개는 web `VerdictReasonSheet`의 문구를 그대로 옮긴다.
- 신고 기본 사유: 기각 "운영자가 신고를 기각했습니다.", 조치 완료 "운영자가 신고 조치를 완료했습니다."
- 제재 기본 사유: 경고 "정책 안내와 함께 경고를 보냈어요", 정지 "정책 위반이 확인되어 이용을 정지했어요", 정상 복구 "계정을 정상으로 복구했어요", 경고 철회 "운영자가 잘못 부여된 최근 경고를 되돌렸습니다.", 탈퇴 복구 "본인 요청으로 탈퇴를 되돌렸어요".
- `matchesUserStatusFilter(user, filter)`: `deleted`는 `deletedAt !== null`, 그 외는 `deletedAt === null && status === filter`, `all`은 항상 true.
- 콘텐츠 이력 상태 라벨(`CONTENT_STATUS_LABELS`), 커뮤니티 상태별 조치 매트릭스(published→숨김·삭제, hidden→복구·삭제, deleted→복구).
- 사유 길이 상수 `MODERATION_REASON_MIN = 2`, `MODERATION_REASON_MAX = 500`.
- 토스트 문구 맵: web `moderator-context.tsx`의 성공·실패 문구를 그대로 옮긴다.

web의 두 라벨 파일은 이 모듈을 re-export하는 껍데기로 바꾼다. `apps/web/src/lib/bambi/moderation-labels.test.ts`는 수정 없이 통과해야 한다. `packages/api/test/services/bambi-moderation-labels.test.ts`에 심각도·판정 매핑·상태 필터 테스트를 둔다.

## 4. 셸

- `app/(moderator)/_layout.tsx`: admin 가드(현행 유지)만 남긴 Stack. `(tabs)`와 상세 3종을 등록한다.
- `app/(moderator)/(tabs)/_layout.tsx`: `app/(employer)/(tabs)/_layout.tsx`를 복제. 탭은 `index`(검수, shield-checkmark), `reports`(신고, flag), `users`(사용자, people). `TAB_BAR_CONTENT_HEIGHT`·안전영역 가산·`tabIcon` 헬퍼 동일. 채팅 미읽음 배지 훅은 쓰지 않는다.
- `src/components/moderator-header.tsx`: `ModeratorHomeHeader`. employer 헤더를 본떠 우측에 `RoleSwitchMenu currentArea="/(moderator)"`를 둔다.
- 상세 라우트: `app/(moderator)/queue/[id].tsx`, `reports/[id].tsx`, `users/[id].tsx`. Stack push, 헤더 뒤로가기.
- 기존 `(moderator)/index.tsx`, `reports.tsx`, `users.tsx`는 `(tabs)` 아래 새 파일로 대체하고 삭제한다.

데이터 로딩은 탭별 독립 쿼리다. 상세는 목록 쿼리 캐시에서 항목을 찾고, 없으면 "찾을 수 없음" StateCard와 목록 복귀 버튼을 보인다. 상태 변경 성공 시 해당 목록 쿼리를 invalidate하고 heroui-native `useToast`로 공유 모듈의 문구를 띄운다.

## 5. 공용 다이얼로그 (`src/components/moderation/`)

`src/components/report-dialog.tsx`의 Dialog + RadioGroup + TextArea 골격을 따른다.

- `ReasonDialog`: 제목·설명·기본 사유·프리셋(선택)·danger 톤·확정 문구를 props로 받는다. 프리셋이 있으면 RadioGroup으로 보이고 선택값을 TextArea에 채워 편집 가능하게 한다. 2자 미만이면 확정 비활성, 500자 초과는 카운터와 함께 입력을 막는다. `onConfirm(reason)`이 `Promise<boolean>`을 반환하며, false면 다이얼로그를 열어둔 채 에러 문구를 보인다.
- `SanctionDialog`: 1단계 경고·정지 선택(정지는 danger), 2단계는 `ReasonDialog`와 같은 사유 편집(기본 사유 채움). 취소하면 1단계로 돌아간다. `onConfirm(status, reason)`.
- `ConfirmDialog`: 커뮤니티 삭제 등 되돌리기 어려운 조치의 확인용. 기존 `DeleteJobDialog` 패턴.

## 6. 공고 검수

목록(`(tabs)/index.tsx`)

- `listJobPosts({ limit: 50, status: "pending_review" })` 한 번.
- Chip 두 줄: 위험도 필터(전체·감지됨·감지 없음), 정렬(접수순·최신순·감지 우선, 기본 접수순). 클라이언트 처리.
- 위험도는 web `toApiQueueItem`과 같이 `detectedTerms` 유무 2단계(mid·low)로 산출한다(공유 모듈 `resolveQueueRiskLevel`). web에도 3단계는 없다.
- 행: 업소명, 제목, 지역, 위험도 Pill, 감지 문구 최대 3개 또는 "감지된 문구 없음", 접수 시각, `#` + id 앞 8자. 탭하면 상세.
- FlatList + RefreshControl. 빈 목록은 StateCard.

상세(`queue/[id].tsx`)

- 목록 캐시 항목 + `getJobPostForAdmin({ jobPostId })` 추가 조회(본문 블록·이미지).
- 섹션 순서: 헤더(업소·제목·지역·급여·접수), 위험 플래그 Pill 묶음, 감지 문구 하이라이트 본문, 본문 블록(`JobDescriptionSection` 재사용), 대표·상세 이미지(`CrawledJobDetailImages`·`groupDetailImageSlices` 재사용, 탭하면 전체 화면 확대), 판정 안내 문구.
- 하단 고정 바: 승인·보류·반려. 반려만 danger.
- 판정 3종 모두 `ReasonDialog`(프리셋 5개)를 거쳐 `setJobPostStatus({ jobPostId, status, reason })`. 성공 시 토스트·목록 invalidate·목록 복귀. 실패 시 다이얼로그 유지.

## 7. 신고 처리

목록(`(tabs)/reports.tsx`)

- `listReports({ limit: 50 })` 한 번. Chip으로 열림(open·reviewing)과 종료(resolved·dismissed) 전환, 기본 열림.
- 행: 심각도 Pill(높음 danger·중간 warning·참고 neutral), 사유 라벨, 대상 유형 라벨, 피신고 대상명·역할, 신고자명, 신고 상세 한 줄, 접수 시각.
- FlatList + RefreshControl. 빈 상태 StateCard.

상세(`reports/[id].tsx`)

- 구성: 심각도·사유·상태 헤더, 당사자 카드, 대상 컨텍스트, 신고 내용, 하단 고정 액션 바.
- 당사자 카드: 채팅방 신고는 채팅방→피신고자→신고자, 그 외는 피신고자→신고자. 사용자 대상 카드는 `users/[id]`로 push. 비회원은 본인인증 정보 또는 "본인인증 정보 없음".
- 대상 컨텍스트(`targetContext` 유니온·`communityTarget`):
  - 커뮤니티 글·댓글(`communityKind` 있음, 최우선): 미리보기(게시판·상태·작성일·제목/본문·작성자) + 상태별 조치 버튼. 삭제는 `ConfirmDialog` 후 `ReasonDialog`. 조치는 `community.setPostStatusByAdmin` 또는 `setCommentStatusByAdmin({ postId|commentId, reason, reportId, status })`, 성공 시 `setReportStatus(resolved)` 연쇄.
  - 공고: 제목·업소·상태 라벨·본문 4줄·반려 사유. 후기: 별점·상태·본문. 사용자: 표시명·역할·상태·전화 인증. 모두 읽기 전용, 추가 조회 없음.
  - 채팅방: 방 제목·상태 Pill(정상·차단됨·탈퇴). `getChatMessagesForModeration({ chatRoomId })`로 메시지를 받아 `ChatModerationThread`(신규, `src/components/moderation/chat-moderation-thread.tsx`)가 `ChatMessageBubble`·`ChatSystemCard`·`ChatDateChip`으로 읽기 전용 렌더. 차단·해제 버튼은 `ReasonDialog` 후 `setChatRoomBlocked({ chatRoomId, isBlocked, reason })`.
  - 그 외: 신고 스레드(`thread`) 폴백.
- 액션 바: 대상이 사용자가 아니면 기각·조치 완료(커뮤니티·채팅 신고는 조치 완료 숨김). 대상이 사용자면 기각·제재 적용.
  - 기각: `ReasonDialog`(기본값 비움, danger) → `setReportStatus(dismissed)`.
  - 조치 완료: 즉시 `setReportStatus(resolved, 기본 사유)`.
  - 제재 적용: `SanctionDialog` → `setUserStatus` → 성공 시 `setReportStatus(resolved, 기본 사유)` 연쇄.
- 성공 시 토스트·`listReports` invalidate·목록 복귀. 실패 시 다이얼로그 유지(즉시 호출형은 토스트만).

## 8. 사용자 관리

목록(`(tabs)/users.tsx`)

- `listUsers({ limit: 1000 })` 한 번. `SearchField` + 250ms 디바운스로 name·email·loginId 부분 일치(대소문자 무시).
- Chip: 상태(전체·정상·경고·정지·탈퇴), `matchesUserStatusFilter` 사용. 역할은 `FieldSelect` 시트(전체·구직자·법률자문·구인자·운영자). 정렬은 가입일 내림차순 고정.
- 행: 이름, 상태 Pill(`accountStatusBadge` 재사용), 역할 라벨(`profileRoleLabel`), 신고 N건, 경고 N회. FlatList + RefreshControl.

상세(`users/[id].tsx`)

- 프로필 카드: 이름·loginId·email·역할·상태·전화 인증·가입일·organizationNames.
- 제재 액션:
  - `SanctionDialog` → `setUserStatus({ targetUserId, status, reason })`. 성공 시 목록 복귀.
  - 상태가 active가 아니면 "정상으로 복구": 즉시 `setUserStatus(active, 기본 사유)`.
  - `warningsCount > 0`이면 "최근 경고 1회 되돌리기": `ReasonDialog` → `revertLatestWarning`.
  - 역할이 job_seeker면 "법률자문 지정", legal_advisor면 "법률자문 해제": `ReasonDialog` → `setUserRole({ targetUserId, role, reason })`. 그 외 역할·탈퇴 계정은 버튼 없음.
- 제재 이력: `listUserModerationActions({ targetUserId, page, pageSize: 5 })`. 조치 라벨·사유·처리자·시각, "더 보기"로 다음 페이지 이어 붙임.
- 콘텐츠 이력: `contentHistory.listAdminMemberContent({ userId, filter, page, pageSize: 5 })`. Chip 전체·글·댓글, 같은 페이지 방식.
- 탈퇴 패널: `deletedAt` 있을 때만. `purgedAt`이면 복구 불가 안내. 아니면 "탈퇴 복구": `ReasonDialog` → `accountRecovery.restoreWithdrawnAccount({ targetUserId, reason })`. 성공은 상세 유지.
- 성공 시 `listUsers`와 해당 사용자 `listUserModerationActions` invalidate.

## 9. 에러 처리

- 목록 로딩 실패: `ErrorState` + 재시도.
- 다이얼로그형 액션 실패: 다이얼로그 유지, 서버 메시지 또는 공유 모듈의 기본 실패 문구를 다이얼로그 안에 표시.
- 즉시 호출형 액션 실패: 토스트만.
- 사유 길이는 다이얼로그에서 2~500자로 막는다.
- 상세 진입 시 캐시에 항목이 없으면 "찾을 수 없음" 카드.

## 10. 테스트·검증

- `packages/api/test/services/bambi-moderation-labels.test.ts`: 심각도 산출, 판정 매핑, 상태 필터.
- web 기존 `moderation-labels.test.ts` 무수정 통과.
- native: biome 린트(경로 인자 필수)와 `check-types`만. 실기기 확인은 사용자가 한다. 개발 서버·스크린샷 금지.
- 검증은 워크트리 안에서 실행한다.

## 11. 구현 순서

1. 공유 모듈 승격, web re-export, 테스트.
2. 탭 셸·헤더·공용 다이얼로그 3종.
3. 검수 목록·상세.
4. 사용자 목록·상세(신고 상세가 `SanctionDialog`와 사용자 push에 의존).
5. 신고 목록·상세·`ChatModerationThread`.
6. 기존 `(moderator)` 화면 3개 삭제, 린트·타입체크, 리뷰.

구현은 ultracode Workflow로 진행한다. UI 구현 디스패치에는 `.agents/skills/heroui-native/SKILL.md`와 Uniwind 문서를 지정한다.

## 12. 실기기 확인 목록(사용자)

- 3탭 전환과 RoleSwitchMenu 복귀.
- 검수 판정 3종의 프리셋·사유 편집·실패 유지.
- 신고 상세의 대상 유형 5종 렌더와 채팅방 차단.
- 커뮤니티 삭제의 확인 다이얼로그 2단계.
- 사용자 제재·복구·경고 철회·법률자문 전환·탈퇴 복구.
- 1000건 사용자 목록 스크롤·검색 성능.
