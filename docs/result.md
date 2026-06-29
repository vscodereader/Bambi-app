# Bambi 1차 Web MVP 작업 결과 정리

작성일: 2026-06-23

갱신일: 2026-06-26

## 1. 프로젝트 방향

밤비 Web MVP는 `foxalba.com`을 참고하되, 기존 레퍼런스의 업주 중심·올드한 구성을 그대로 따르지 않고 2030 여성 구직자가 모바일과 반응형 PC 웹에서 안전하게 유흥 알바를 탐색하고 지원할 수 있는 서비스로 재설계했다.

핵심 방향은 다음과 같다.

- 구직자 중심의 탐색, 공고 상세, 채팅, 면접 일정, 연락처 보호 플로우
- 구인자용 공고 등록, 관리, 수정 플로우
- 운영자용 공고 검수, 신고 처리, 사용자 제재 플로우
- 선택/강조 상태는 어두운 배경 대신 테두리 중심으로 표현
- 안전 중심 마켓플레이스형 정보 구조와 신뢰 메시지 유지

## 2. 문서 정리

스펙 문서와 실행 계획을 정리했다.

- `docs/superpowers/specs/2026-06-23-bambi-responsive-marketplace-redesign.md`
  - 추천안 C, 안전 중심 마켓플레이스형을 기준 방향으로 정리
  - 구직자, 구인자, 운영자 플로우의 1차 Web 범위 확인
- `docs/superpowers/plans/2026-06-23-bambi-web-mvp-completion.md`
  - 1차 Web MVP 완료 계획을 작성
  - 구직자, 구인자, 운영자 작업을 task 단위로 체크리스트화
  - 최종 브라우저 검증 결과까지 반영

## 3. 구직자 플로우 완료 내용

구직자 Web 플로우는 API-first 구조로 정리했다.

- `/seeker`
  - 공고 탐색 화면을 API 데이터 중심으로 연결
  - 모바일 친화적 탐색 경험과 PC 반응형 레이아웃 유지
- `/seeker/jobs/[id]`
  - 공고 상세 진입 확인
  - 상세에서 채팅 시작 플로우 연결
- `/seeker/chats`
  - 구직자의 채팅 목록 진입 확인
- `/seeker/chats/[id]`
  - 채팅 메시지 전송 연결
  - 면접 일정 제안, 확정, 거절, 취소, 완료 액션 연결
  - confirmed 일정이 있을 때 연락처 공개로 이어지도록 정리
- `/seeker/chats/[id]/reveal`
  - 면접 확정 전 연락처 보호 안내 유지
  - 확정 후 연락처 공개 consent UI 연결
  - 연락처 저장 상태 표시

추가로 Bambi DS `Button`이 submit 타입을 전달하지 못해 채팅/연락처 폼 제출이 막히던 문제를 수정했다.

## 4. 구인자 플로우 완료 내용

구인자 Web 플로우는 샘플 화면에서 API-backed 관리 화면으로 전환했다.

- `/employer`
  - 로그인 세션과 온보딩 프로필 확인
  - 조직/팀 상태 표시
  - 내 공고 목록을 `bambi.jobs.listMine` 기반으로 표시
  - 새 공고 등록과 기존 공고 수정 링크 연결
- `/employer/new`
  - 공고 생성 폼 API 연결
  - `validateJobForm` 기반 필드 검증
  - `bambi.jobs.create` 호출
  - 생성 후 목록 invalidate 및 `/employer` 복귀
- `/employer/jobs/[id]/edit`
  - 수정 가능한 공고 조회
  - 조직/팀 scope는 읽기 전용으로 유지
  - `bambi.jobs.update` 호출
  - 수정 후 목록 invalidate 및 `/employer` 복귀

구인자 보호 화면에서는 로그인 세션 확인 후 protected API를 호출하도록 보강했다.

## 5. 운영자 플로우 완료 내용

운영자 콘솔은 preview/local 상태 중심에서 API 데이터와 mutation 중심으로 보강했다.

- `/moderator`
  - 검수 대기 공고 목록 API 연결
  - 공고 승인/반려 액션 연결
- `/moderator/queue/[id]`
  - 공고 검수 상세 진입
  - 승인 후 게시 처리 확인
  - API 목록 로딩 중 상세 라우트가 목록으로 튕기지 않도록 보강
  - 대상이 없을 때 빈 상태 표시
- `/moderator/reports`
  - 신고 목록 API 연결
- `/moderator/reports/[id]`
  - 신고 상세 진입
  - 신고 기각/조치 액션 연결
  - 로딩/빈 상태 처리 보강
- `/moderator/users`
  - 사용자 목록 API 연결
- `/moderator/users/[id]`
  - 사용자 상세 진입
  - 경고, 이용 정지, 차단 액션 연결
  - 로딩/빈 상태 처리 보강

## 6. 공통 보강 내용

이번 작업 중 공통 UI와 helper도 정리했다.

- `empty-state`
- `form-message`
- `page-shell`
- `status-badge`
- `bambi-format`
- `bambi-options`
- `bambi-job-form`

또한 강조/선택 상태는 사용자의 피드백에 맞춰 과도한 어두운 배경 사용을 줄이고, 테두리 중심의 신호를 우선하는 방향으로 유지했다.

## 7. 브라우저 검증 결과

seed 데이터와 로컬 API/Web 서버 기준으로 주요 플로우를 브라우저에서 확인했다.

- staff 계정
  - 채팅방 `33333333-3333-4333-8333-333333333301`에서 면접 일정 제안 확인
- seeker 계정
  - 제안된 면접 일정 확정 확인
  - 연락처 공개 페이지 진입 확인
  - 연락처 `010-1000-9999` 공개 저장 확인
  - 채팅 메시지 전송 확인
- owner 계정
  - `/employer/new`에서 공고 생성 확인
  - `/employer/jobs/[id]/edit`에서 공고 제목 수정 확인
- admin 계정
  - 공고 검수 상세 승인 확인
  - 신고 상세 기각 확인
  - 사용자 상세 경고 전송 확인
- 브라우저 콘솔 오류 0건 확인
- 검증 후 `pnpm run db:seed:bambi`로 seed 상태 복구

## 8. 자동 검증 결과

최종 검증 명령은 모두 통과했다.

```bash
pnpm --filter @bambi-app/api test
pnpm run check-types
pnpm run check
pnpm --filter web build
```

결과:

- API 테스트: 3 files, 21 tests 통과
- TypeScript check 통과
- Ultracite check 통과
- Web production build 통과

## 8.1 Web 최종 QA 승인 게이트

2026-06-26에 [Web Final QA Acceptance](./superpowers/plans/2026-06-26-bambi-web-final-qa-acceptance.md) 플랜을 추가하고 실행했다.

검증 결과:

- `pnpm run db:seed:bambi` 통과
- `pnpm --filter @bambi-app/api test` 통과: 17 files, 78 tests
- `pnpm run check-types` 통과
- `pnpm run check` 통과
- `pnpm --filter web build` 통과
- public, seeker, employer, moderator 주요 route와 seeded dynamic route가 200 OK 응답
- seeker, owner, admin seeded 계정의 로그인 후 주요 화면 진입 확인

QA 중 admin 온보딩 화면의 `관리자 화면으로 이동` 버튼이 `/employer`로 이동하는 문제가 발견되어 `getOnboardingNextRoute` helper와 회귀 테스트를 추가했다. 수정 후 admin 버튼은 `/moderator`로 이동했고, targeted test와 Web build까지 재검증했다.

## 9. 완료 커밋

주요 완료 커밋은 다음과 같다.

- `fc1bb95 docs: 스펙 문서 최신 상태 반영`
- `6298247 feat: 구인자 공고 관리 API 연결`
- `899b381 feat: 채팅 면접 일정과 연락처 공개 연결`
- `4528e6a feat: 운영자 콘솔 API 데이터 연결`
- `2dad7de fix: 구인자 보호 화면 로그인 처리 보강`
- `1a68a81 fix: 웹 MVP 브라우저 검증 보강`

2026-06-26 문서 정리 시점의 로컬 `develop` 브랜치는 `origin/develop`보다 34커밋 앞서 있다. 원격 최신화는 GitHub 인증 상태에 따라 별도로 확인해야 한다.

## 10. 현재 완료 판정

1차 Web MVP 기준으로 아래 범위는 완료로 본다.

- 구직자: 공고 탐색, 상세, 채팅 시작, 채팅 메시지, 면접 일정, 연락처 공개
- 구인자: 로그인 보호, 내 공고 목록, 공고 생성, 공고 수정
- 운영자: 공고 검수, 신고 처리, 사용자 상태 변경
- 문서: specs 확인, completion plan 작성 및 체크리스트 완료 반영
- 검증: 자동 검사와 주요 브라우저 시나리오 완료

## 11. 후속 후보

1차 Web MVP 이후 별도 단계로 다룰 수 있는 항목은 [Post-MVP Roadmap](./superpowers/plans/2026-06-23-bambi-post-mvp-roadmap.md)에서 메인 플랜으로 관리한다.

- [실시간 채팅 Socket.IO, read receipt, typing indicator](./superpowers/plans/2026-06-23-bambi-realtime-chat.md) — 2026-06-24 완료
- [이미지/파일 메시지](./superpowers/plans/2026-06-23-bambi-chat-media-messages.md) — 2026-06-24 완료
- [리뷰/평점 작성 플로우](./superpowers/plans/2026-06-23-bambi-reviews-ratings.md) — 2026-06-25 완료
- [구인자 analytics와 유료 노출](./superpowers/plans/2026-06-23-bambi-employer-analytics-paid-placement.md) — 2026-06-25 완료
- [조직/팀 관리 화면 고도화](./superpowers/plans/2026-06-23-bambi-organization-team-management.md) — 2026-06-24 완료
- [운영자 bulk action의 API 일괄 처리 고도화](./superpowers/plans/2026-06-23-bambi-moderator-bulk-actions.md) — 2026-06-25 완료
- [구인 공고 이미지와 안전한 블록형 상세 편집기](./superpowers/plans/2026-06-26-bambi-job-post-media-block-editor.md) — 2026-06-29 완료
- [모바일 네이티브 앱 화면](./superpowers/plans/2026-06-23-bambi-native-app.md) — Web 최종 완료 승인 이후까지 보류

2026-06-29 기준으로 Native App을 제외한 기존 Post-MVP Roadmap 항목은 완료 처리되었다. Foxalba 벤치마크에서 Dense Marketplace 범위 밖으로 남겨둔 `구인 공고 대표/상세 이미지 업로드`와 `안전한 블록형 상세 편집기`도 별도 실행 플랜으로 구현했고, native app은 Web 최종 완료 승인 이후까지 계속 보류한다.
