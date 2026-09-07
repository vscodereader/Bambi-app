# native 포인트몰·알림(SSE) 설계

- 날짜: 2026-09-07
- 브랜치: `feat/native-point-shop-alerts`(base `mobile`), 작업 워크트리 `worktree-native-point-shop-alerts`
- 선행: PR #277(구직자 1차), #281(마이페이지), #292(구인자), #297(끌올 옵션·채팅 탭), #302(배너 에디터)
- 범위 결정(사용자): 역할은 **구직자 포인트몰 + 구직자·구인자 알림**, 알림은 **SSE 포그라운드 실시간만**(원격 푸시는 Expo 인프라 계정이 없어 **보류**, 2026-09-07), 포인트몰은 **목록+구매+내 주문(취소)**, native 화면이 없는 알림 타입은 **읽음 처리만·이동 없음**, 문구는 **공유 서비스로 이동**

## 1. 배경

native에는 `(seeker)/point-shop.tsx`와 `(seeker)/notifications.tsx`가 "준비 중" `StateCard` 플레이스홀더로 남아 있고, 구직자 헤더의 종 아이콘은 배지 없이 이동만 한다. 구인자 헤더에는 종 아이콘이 없다. 서버는 포인트몰(`pointShop.*`)과 알림(`notifications.*`, `/sse/notifications`)이 모두 갖춰져 있어 **새 프로시저·마이그레이션이 없다.** 이번 작업은 세 덩어리다.

1. 공유: 알림 문구 함수를 web에서 `packages/api`로 이동
2. native 알림: SSE 구독 훅·헤더 배지·알림 목록 화면(구직자/구인자 공유)·딥링크
3. native 포인트몰: 상품 목록·구매 시트·내 교환 내역(취소)

제외(후속): **원격 푸시 전체**(expo-notifications·푸시 토큰 테이블·Expo Push API 발송 — Expo 계정·EAS projectId·FCM/APNs 자격이 생기면 별도 브랜치, 그때 문구는 §2 함수를 재사용), 구인자 포인트몰 진입·끌올/연장 혜택 사용(`listUsableJobPosts`/`useBenefit`), 헤드리스 백그라운드 태스크, 앱 아이콘 배지 카운트 동기화, 알림 설정(타입별 on/off) 화면.

## 2. 알림 문구 공유 서비스

### 2.1 이동

`apps/web/src/lib/bambi/notification-labels.ts`의 `notificationTitle`·`notificationBody`와 그 내부 헬퍼·문구 맵을 `packages/api/src/services/bambi-notification-labels.ts`로 옮긴다. `BambiNotificationView` 인터페이스(`chatRoomId, metadata, recipientRole, targetId, targetType`)도 함께 옮긴다. DB·네트워크 접근이 없는 순수 함수만 이동한다.

- 문구가 참조하는 라벨 맵(`EXPOSURE_TYPE_LABELS`, `LISTING_QUEUE_SHORT_LABELS`, `organizationRoleLabel`)은 `packages/api` 서비스에 이미 있는 것을 쓴다. web `lib/bambi`의 같은 이름 맵을 새로 복제하지 않는다.
- web 파일은 `notificationHref`·`NOTIFICATIONS_HREF`만 남기고 문구 함수는 새 서비스에서 re-export한다. web 호출부 import는 바꾸지 않는다.
- 기존 테스트 `apps/web/test/lib/bambi/notification-labels.test.ts` 중 문구 케이스는 `packages/api/test/services/bambi-notification-labels.test.ts`로 옮기고, href 케이스는 web에 남긴다.

### 2.2 소비자

- native 알림 목록(§4), web 알림 화면(기존)이 같은 함수를 쓴다. 후속 푸시 본문도 여기서 만든다.

## 3. native 알림 실시간·배지

### 3.1 SSE 훅 `apps/native/src/lib/notification-stream.ts`

- `useBambiNotificationStream()`: 로그인 세션이 있을 때만 `expo/fetch`로 `GET ${EXPO_PUBLIC_SERVER_URL}/sse/notifications`를 열고 `response.body` 스트림을 읽어 `event:`/`data:` 프레임을 파싱한다. 헤더는 `orpc.ts`의 `link.headers()`와 같은 규칙(Cookie)으로 붙인다.
- `bambi:notification` 수신 시 `notifications.unreadCount`·`notifications.list` 쿼리를 invalidate한다. `bambi:ping`은 워치독 리셋만 한다.
- AppState `active`에서 연결, `background`/`inactive`에서 `AbortController.abort()`. 복귀 시 즉시 재연결하고 두 쿼리를 invalidate한다.
- 75초 무프레임 워치독 재연결, 지수 백오프 1s→60s(web 훅 규약 그대로).
- 프레임 파서 `parseSseChunk`는 순수 함수로 분리해 테스트한다(멀티라인 data, 청크 경계 분할, 빈 줄 구분).
- 구독 지점은 앱 루트 레이아웃 한 곳(`app/_layout.tsx`, 세션 있을 때만 렌더되는 자식). 비로그인·게스트는 연결하지 않는다.

### 3.2 배지

- 공용 `apps/native/src/components/notification-bell.tsx`: 종 아이콘 + `unreadCount` 배지(0이면 숨김, 9 초과는 "9+"). `href` prop으로 이동 대상을 받는다.
- `SeekerHomeHeader`의 기존 종 아이콘을 이 컴포넌트로 교체(`/(seeker)/notifications`).
- `EmployerHomeHeader`에 역할 전환 메뉴 왼쪽으로 추가(`/(employer)/notifications`).

## 4. native 알림 화면

### 4.1 라우트

- `apps/native/src/components/notifications-screen.tsx`를 만들고 `(seeker)/notifications.tsx`의 플레이스홀더를 교체한다.
- `(employer)/notifications.tsx` 신설, `(employer)/_layout.tsx`에 `title="알림"` Stack 등록. 두 라우트 모두 같은 컴포넌트를 렌더한다.

### 4.2 화면 구성

1. 헤더(`BambiHeader`) 오른쪽 액션: "모두 읽음"(unreadCount 0이면 비활성), "전체 삭제"(Alert 확인 후 `clearAll`)
2. 목록: `useInfiniteQuery(orpc.bambi.notifications.list)`, 커서 `nextCursor`, `FlatList` `onEndReached`로 다음 페이지. 항목은 `notificationTitle` 제목, `notificationBody` 본문(없으면 생략), 상대 시각. 안읽음(`readAt === null`)은 배경 강조 + 점.
3. 빈 상태·에러·로딩은 기존 `StateCard`.
4. 항목 탭: `markRead([id])` 낙관적 갱신 → `notificationRoute(item, role)`(§4.3)이 경로를 주면 `router.push`, `null`이면 이동 없음.

### 4.3 딥링크 `apps/native/src/lib/notification-route.ts`

순수 함수 `notificationRoute(item: BambiNotificationView, role: "seeker" | "employer"): null | Href`. 공유(`recipientRole`) 알림은 항상 `null`.

| targetType | 조건 | 경로 |
|---|---|---|
| `chat_message`, `chat_room`, `contact_reveal` | `chatRoomId` 있음 | `/(role)/chats/[id]` |
| 〃 | 없음 | `/(role)/(tabs)/chats` |
| `interview_schedule` | seeker | `/(seeker)/me/interviews` |
| `direct_message` | seeker | `/(seeker)/me/messages` |
| `report` | seeker | `/(seeker)/me/reports` |
| `point_transaction`, `point_shop_order` | seeker | `/(seeker)/me/attendance` |
| `review` | `jobPostId` 있음 | `/(seeker)/jobs/[id]` |
| `job_post` | employer, action이 대기열/노출 조정류 | `/(employer)/promotions` |
| `job_post` | employer, 그 외 | `/(employer)/jobs/[id]/edit` |
| `employer_verification` | employer | `/(employer)/me/business` |
| `organization_member`, `team_invitation` | employer | `/(employer)/me/teams` |
| `community_post`, `community_comment`, `support_inquiry`, `support_chat` | | `null` |

역할과 맞지 않는 조합(예: employer 셸에서 `interview_schedule`)도 `null`. 유닛 테스트로 표 전체를 고정한다.

## 5. native 포인트몰(구직자)

### 5.1 화면 `(seeker)/point-shop.tsx`

- 헤더 `BambiHeader` 제목 "포인트몰", 오른쪽에 잔액 칩(`getMyBalance`, 로그인 시만).
- 세그먼트 탭 "상품" / "내 교환 내역".
- 상품 탭: `listItems` 2열 그리드. 카드 = 이미지(`publicObjectUri`, 없으면 아이콘 폴백)·이름·`pricePoints` 포맷·품절 오버레이(`soldOut`). 탭하면 구매 시트.
- 내역 탭: `myOrders` 목록. 상태 라벨은 web `apps/web/src/lib/bambi/point-shop-labels.ts`의 구매자용 라벨 함수를 `packages/api/src/services/bambi-point-shop-labels.ts`로 옮겨(web은 re-export) 표시하고 원값을 노출하지 않는다. 취소 가능 여부도 `resolveOrderCancellation`으로 판정한다. `usableUntil`·`usedAt` 표시. 취소 가능(`owned`·`pending`) 주문엔 "취소" 버튼 → Alert 확인 → `cancelMyOrder`.

### 5.2 구매 시트

- heroui-native 바텀시트. 내용: 상품명·가격·구매 후 잔액·혜택 이행 안내(`benefitType`별 문구, web `BenefitFulfillmentNotice` 문구 그대로).
- 차단 판정은 `packages/api/src/services/bambi-point-shop.ts`의 `resolvePurchase`(`PurchaseDenial` 사유 코드)·`isItemSoldOut`·`audienceAllowsRole`을 호출해 사유 코드를 받고 화면은 문구만 렌더한다(품절·잔액 부족·대상 역할 불일치·본인인증 필요). 판정 로직을 native에 복제하지 않는다.
- 쿠폰형(`coupon`)이고 본인인증 미완료면 버튼이 기존 native 본인인증 화면으로 이동한다.
- 비로그인이면 카드 탭 시 로그인 화면으로 보낸다.
- 구매 성공: `getMyBalance`·`myOrders`·`attendance.getMine` invalidate, Alert "교환이 완료됐어요". 서버 오류 메시지는 그대로 Alert.

## 6. 테스트·검증

| 대상 | 위치 | 내용 |
|---|---|---|
| 문구 함수 | `packages/api/test/services/bambi-notification-labels.test.ts` | web에서 옮긴 케이스 |
| SSE 파서 | `apps/native/src/lib/notification-stream.test.ts` | 청크 분할·멀티라인·이벤트명 |
| 딥링크 | `apps/native/src/lib/notification-route.test.ts` | §4.3 표 전체 |
| 주문 상태 라벨 | `packages/api/test/services/bambi-point-shop-labels.test.ts` | `POINT_SHOP_ORDER_STATUSES` 전수 커버(web 테스트가 있으면 이동) |

정적 검증은 각 패키지 tsc와 ultracite(경로 인자 필수)만. 빌드·dev 서버·에뮬레이터 조작은 하지 않는다. `src/routers/bambi` 라우터 테스트 스위트는 실행하지 않는다(dev DB 파괴).

## 7. 배포·실기기 전제(사용자)

마이그레이션·새 의존성·재빌드 없음. 기존 env(`EXPO_PUBLIC_SERVER_URL`, `EXPO_PUBLIC_WEB_URL`, GCS 공개 URL)만 필요하다.

실기기 확인 목록: 종 배지 갱신(SSE)·백그라운드 복귀 재조회·알림 목록 페이지네이션·읽음/전체 삭제·표의 딥링크 각 1건·구인자 헤더 배지·포인트몰 구매/취소·품절/잔액 부족 차단 문구·쿠폰형 본인인증 유도.
