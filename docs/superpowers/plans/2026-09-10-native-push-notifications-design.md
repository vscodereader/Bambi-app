# Native 원격 푸시 알림 설계

> 상태: 보류
>
> 2026-09-10 사용자 결정으로 이번 구직자 구현 범위에서 제외한다. Expo 계정과 프로젝트, Android FCM 및 iOS APNs 자격이 준비된 뒤 별도 작업으로 재개한다. 그전에는 의존성, 앱 설정, DB, API 또는 server 코드를 변경하지 않는다.

## 기준과 목표

브랜치: feat/native-push-notifications
최초 기준: origin/mobile 64c11018

현재 native 알림은 foreground SSE, 알림 목록, 미읽음 배지, 읽음, 모두 읽음과 비우기를 지원한다. 앱이 background 또는 종료 상태이면 새 알림을 받을 수 없고 앱 아이콘 badge도 없다.

이 브랜치는 Expo SDK 56에 맞는 원격 푸시를 독립적으로 추가한다. Expo 계정, EAS projectId, Android FCM과 iOS APNs 자격 정보는 저장소에 하드코딩하지 않는다. 자격이 준비되지 않은 환경에서도 기존 foreground SSE와 알림함이 계속 동작해야 한다.

## 네이티브 기술 원칙

이 문서는 보류 상태다. 재개할 때 기존 웹 알림의 문구, target, 읽음 상태와 딥링크 의미는 그대로 유지하고, 기기 전달 계층만 Expo Notifications로 추가한다.

- Expo SDK 56 호환 expo-notifications와 expo-router를 사용한다.
- 설정 화면이 필요해질 때도 HeroUI Native와 Uniwind를 사용한다.
- web Notification API, service worker, Next.js 코드와 브라우저 저장소를 native에 가져오지 않는다.
- 알림 문구와 target metadata 같은 플랫폼 공용 순수 계약만 packages/api에서 공유한다.

## 사전 조건

- Expo 계정과 프로젝트 생성 또는 기존 프로젝트 접근 권한 확인
- 실제 Expo project와 EAS projectId 확인
- Android applicationId와 FCM 프로젝트 확인
- iOS bundleIdentifier와 APNs 자격 확인
- 개발, preview, production build profile 확인
- 서버가 사용할 Expo push 발송 인증 방식과 secret 저장 위치 확인

설계 단계에서는 값을 만들거나 예시 값으로 앱 설정에 넣지 않는다. 구현 전에 사용자 또는 배포 환경에서 실제 식별자를 확인한다.

현재 저장소의 apps/native/app.json에는 owner, EAS projectId, android.package, ios.bundleIdentifier가 없고 eas.json, google-services.json, GoogleService-Info.plist도 없다. 따라서 이 값과 자격 정보는 코드만으로 결정할 수 없다.

## 기존 구현과 재사용

- NotificationStreamGate와 notification-stream
- NotificationsScreen과 NotificationBell
- 공유 notificationTitle, notificationBody, BambiNotificationView
- notification-route와 역할별 native 경로
- auth session, logout과 withdraw 흐름
- server의 알림 생성 지점과 notifications table

원격 푸시 payload의 문구와 target routing은 기존 공유 서비스를 사용한다. 데이터베이스 알림과 push를 별도 이벤트로 만들지 않는다.

## 구현 범위

### 앱 권한과 토큰

- expo-notifications SDK 56 호환 버전 설치
- 실제 기기 여부와 권한 상태 확인
- 사용자가 알림 기능을 이해할 수 있는 화면에서만 권한 요청
- Android notification channel 생성
- Expo push token 등록
- 앱 재설치, token 변경과 권한 철회 시 상태 갱신
- 로그인 사용자별 token 연결
- 로그아웃과 탈퇴 시 현재 기기 연결 해제
- 같은 token 중복 등록은 서버에서 멱등 처리
- simulator와 Expo Go 제한을 명확한 개발 상태로 처리

### 서버 저장과 발송

- push token table을 Drizzle migration으로 추가
- userId, token, platform, device/app 식별에 필요한 최소 필드만 저장
- token 원문을 로그에 출력하지 않음
- 알림 row가 생성된 뒤 대상 개인 알림에만 push 발송
- 운영자 공유 row와 recipientRole row는 개인 기기로 잘못 발송하지 않음
- Expo receipt의 영구 invalid token 결과를 비활성 처리
- 일시 오류는 제한된 재시도와 관찰 가능한 서버 로그 제공
- DB 알림 생성 성공을 push 실패로 롤백하지 않음

### 수신과 이동

- foreground 표시 정책은 구현 전 사용자 결정에 따라 적용하고 기존 SSE 갱신 유지
- background 알림 탭 시 notification-route로 이동
- 종료 상태 cold start에서도 초기 route 처리
- 로그아웃 상태 또는 역할 불일치이면 로그인이나 알림함으로 안전하게 이동
- 아직 native 화면이 없는 target은 알림함에 머물고 crash하지 않음
- 같은 알림을 SSE와 push가 모두 전달해도 목록과 badge를 중복 증가시키지 않음

### badge

- 서버 unreadCount를 앱 아이콘 badge 정본으로 사용
- 읽음, 모두 읽음, 비우기, 로그인, 로그아웃 때 badge 동기화
- OS가 badge를 지원하지 않는 경우 조용히 생략

## 독립성

- community와 support 등 다른 구직자 브랜치의 신규 route에 의존하지 않는다.
- 현재 notification-route가 null을 반환하는 target은 알림함으로 연다.
- 다른 브랜치가 나중에 병합되면 최신 mobile 동기화 후 해당 route만 확장한다.
- push가 설정되지 않거나 권한이 거절되어도 foreground SSE와 알림 목록은 회귀하지 않는다.

## 예정 파일

- 수정: apps/native/package.json
- 수정: apps/native/app.json
- 수정: apps/native/app/_layout.tsx
- 수정: apps/native/src/components/notification-stream-gate.tsx
- 수정: apps/native/src/components/notifications-screen.tsx
- 수정: apps/native/src/lib/notification-route.ts
- 추가: apps/native/src/lib/push-notifications.ts
- 추가: apps/native/src/lib/push-token-lifecycle.ts
- 추가: packages/db schema와 Drizzle migration
- 수정: packages/api의 기존 notifications router에 token 등록, 해제 procedure 추가
- 수정: server notification dispatch 경로
- 환경 스키마에는 public 식별자와 server secret을 정확히 분리

## 테스트

- push-permission.test.ts
  - 미지원, 미결정, 허용, 거절, 재요청 금지
- push-token-lifecycle.test.ts
  - 등록, 중복, 변경, 로그아웃, 탈퇴, invalid token
- push-routing.test.ts
  - foreground, background, cold start, 역할 불일치, 화면 없음
- notification-badge.test.ts
  - unread 정본, 읽음, 모두 읽음, 비우기, 로그아웃
- server push dispatch 테스트
  - 개인 대상, 공유 row 제외, 실패 격리, 영구 및 일시 오류
- migration check와 schema snapshot 검증

실기기:

- Android dev build foreground, background, 종료 상태
- iOS dev build 동일 시나리오
- 알림 탭 딥링크, 권한 거절, 설정 변경
- token 갱신, 로그아웃, 다른 계정 로그인
- SSE와 push 동시 도착 중복 여부

## migration과 보안

- db:push 금지
- 구현 시 최신 migration 마지막 번호와 운영 적용 이력 확인
- token table은 Drizzle generate 결과와 journal을 함께 검토
- 서비스 계정, FCM key, APNs key와 Expo access token 커밋 금지
- PR에는 필요한 배포 secret 이름만 기록하고 값은 기록하지 않음

## 검증

- Expo doctor와 SDK 호환성
- native, API, server 타입 검사
- 관련 Vitest와 Drizzle check
- Android와 iOS 실제 dev build
- 변경 파일 Ultracite와 git diff --check
- 최신 origin/mobile 재반영 후 알림 target과 migration 번호 재검토
