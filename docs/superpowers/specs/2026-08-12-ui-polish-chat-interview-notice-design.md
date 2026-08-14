# UI 개선 4건 + 채팅 면접 제안 안내 — 설계 (2026-08-12)

브랜치: `feat/ui-polish-and-chat-interview-notice`

오늘 작업 4건을 하나의 브랜치에서 진행한다. 모두 DB 마이그레이션 없음.

## Part 1 — 급구 섹션 숨김 시 광고상품에서 급구 리스팅 제외

### 문제
사이트정보의 `urgentSectionHidden`(기본 true)이 메인 급구 섹션 렌더에만 반영되고,
광고 상품 쪽은 전혀 안 본다:
- 운영자 "광고 상품 추가/수정" 폼의 노출 영역(게시 위치) Select에 "급구 채용 리스팅"이 항상 나온다
  (`AD_PREVIEW_TEMPLATE_OPTIONS`, apps/web/src/lib/bambi/ad-preview-templates.ts:18).
- 서버 카탈로그 `getCatalog`(packages/api/src/routers/bambi/ad-products.ts:276)도 urgent 필터가 없어,
  구인자 공고 등록/수정 폼(`JobExposureFields`)·운영자 대행 화면에 급구 상품이 계속 팔린다.

### 설계
1. **서버 근본 차단**: `getCatalog`에서 `urgentSectionHidden`이 true면 previewTemplate이
   `urgent-list`인 상품을 제외한다. 설정은 `bambiSiteSettings` 단일 행에서 읽는다(행 없으면 기본 true).
   → 구인자 등록/수정, 운영자 대행, 미디어 업로더, 광고 안내 페이지까지 호출부 전부 한 번에 커버.
2. **운영자 폼 옵션 필터**: `moderator/ad-products/[placementId]/new`와 `[productId]/edit` 페이지에서
   `siteSettings.getExposureSectionConfig`를 조회해 `urgentHidden`을 `AdProductForm`에 prop으로 내리고,
   true면 노출 영역 옵션에서 `urgent-list`를 제거한다. 단, **수정 화면에서 현재 값이 이미
   `urgent-list`인 상품은 해당 옵션을 유지**한다(폼이 깨지지 않게).
3. 곁다리 수정: `ad-product-form.tsx:408`의 `<Select items={AD_PREVIEW_TEMPLATE_LABELS}>`에
   배열이 아닌 라벨 Record가 들어가 있는 기존 버그를 함께 정리한다.

숨김 해제 시(false) 즉시 원복 — 별도 상태 저장 없음.

## Part 2 — 모바일 첫 화면에서 푸터 숨기기(콘텐츠 최소 높이)

### 문제
`responsive-shell.tsx:350`의 `<main>`이 `min-h-[calc(100dvh-56px)]`를 갖고 그 **안에** 푸터가 있다.
헤더 56px + main 최소높이 = 정확히 100dvh라서 콘텐츠가 짧으면 푸터가 첫 화면(폴드) 안에 들어온다.

### 설계
min-h를 푸터를 제외한 콘텐츠 래퍼로 옮긴다:
- `responsive-shell.tsx`: `<main>`의 `min-h-[calc(100dvh-56px)]`를 제거하고, `{children}`을 감싸는
  래퍼(또는 기존 Content 래퍼)에 `min-h-[calc(100dvh-56px)] md:min-h-[calc(100dvh-64px)]`를 준다
  (모바일 헤더 h-14=56px, 데스크톱 h-16=64px). 푸터는 래퍼 밖(main 마지막)에 남아 폴드 아래로 밀린다.
- 같은 패턴인 `(legal)/layout.tsx`(main flex-1 + 형제 푸터)와
  `seeker-auth-gate-screen.tsx`(flex-1 본문 + 푸터)도 동일하게 본문에 min-h를 준다.
- **채팅방 경로 주의**: 채팅방은 헤더를 숨기고(`CHAT_ROOM_PATH_RE`) 자체 높이 변수를 쓴다
  (`max-md:h-[var(--chat-visual-viewport-height,100dvh)]`). 채팅방 레이아웃이 깨지지 않는지 확인 필수.
- 데스크톱도 동일 규칙 적용(짧은 페이지에서 푸터가 뷰포트 바닥에 붙는 현재 동작과 시각적 차이 거의 없음).

## Part 3 — 필터 영역 UI/UX 수정 (모바일 + 데스크톱)

### 현황 결함 (탐색 결과)
- **768~1719px 구간에서 필터 접근 수단이 없다**: 필터 버튼이 든 검색 행이 `md:hidden`으로 숨고,
  필터 사이드바(aside)는 `min-[1720px]:block`. 버튼의 `lg:hidden`도 어긋나 있음.
- 초기화 버튼이 없다(활성 개수 배지는 세면서 되돌릴 방법은 하나씩 "전체" 선택뿐).
- 필터 Sheet(우측 88vw)에 닫기(X) 버튼·하단 적용 바가 없다. 결과 개수 피드백도 시트 밖.
- 최소시급 Input이 디바운스 없이 타이핑마다 재조회.
- `MarketplaceFilterSidebar`(marketplace.tsx:213)와 `screens/public-marketplace.tsx`는 어디서도
  import되지 않는 죽은 코드.

### 설계 (범위: 결함 수정, 전면 재설계 아님)
1. **브레이크포인트 정합**: 검색+필터 버튼 행을 `md:hidden` → 1719px까지 노출
   (`min-[1720px]:hidden`)로 바꾸고, 버튼의 `lg:hidden`도 같은 기준으로 통일.
   1720px 이상은 기존 사이드바가 담당. 즉 모든 뷰포트에서 필터 접근 가능해진다.
2. **초기화 버튼**: 필터 기본값으로 되돌리는 "초기화" 버튼을 Sheet 하단 바와 사이드바에 추가.
   활성 필터 0개면 비활성화.
3. **Sheet 모바일 개선**: SheetHeader에 닫기(X) 추가, 하단 고정 바에
   "N건 보기"(현재 결과 개수, 탭하면 닫힘) + "초기화" 배치. 즉시 적용 동작은 유지(적용 버튼 아님).
4. **최소시급 디바운스**: 300ms 디바운스로 쿼리 키 난사 방지(표시 값은 즉시 반영).
5. **죽은 코드 삭제**: `MarketplaceFilterSidebar`, `screens/public-marketplace.tsx` 제거
   (삭제 전 import 0건 재확인).

이연(후속): 필터 URL searchParams 동기화, discovery 탭 전환 시 다른 축 리셋 동작 개선.

## Part 4 — 채팅방 면접 일정 제안 인라인 안내 카드

### 문제
`proposeInterview`(packages/api/src/routers/bambi/chats.ts:1446)가 `interview_schedule` 행만 만들고
채팅 메시지를 남기지 않는다 → 구직자는 채팅방 안에서 제안 사실을 알 수 없고, 알림 딥링크가 가는
`/seeker/me/interviews` 화면에는 확정/거절 버튼조차 없다(채팅방 사이드패널/서랍에만 있음).

### 설계 — 연락처 공개(`contact_request`) 패턴 재사용
1. **시스템 메시지 삽입**: `proposeInterview`를 트랜잭션으로 감싸 schedule INSERT와 함께
   `chat_message` INSERT: `kind: "interview_proposal"`, `body: "면접 일정을 제안했습니다."`,
   `metadata: { interviewScheduleId }`, `senderUserId`는 제안자. `generateChatMessageId()`(UUIDv7) 사용,
   `chatRoom.updatedAt` 갱신, `enqueueChatMessageSync` → 커밋 후 `drainPendingChatMessageSyncs()`.
   `kind`는 자유 text 컬럼이라 마이그레이션 없음.
2. **상태는 이중 저장하지 않는다**: 메시지 metadata에는 `interviewScheduleId`만 둔다. 카드가 표시할
   상태·일시·장소는 방 조회(`getById`)가 이미 내려주는 `schedules`에서 `interviewScheduleId`로 찾는다.
   `setInterviewStatus`는 수정 불필요 — 기존 `emitRoomUpdated`로 refetch되며 카드 문구가 따라 바뀐다.
3. **렌더**: `seeker-chat-room-responsive.tsx:526`의 kind 분기에 `interview_proposal` 갈래 추가.
   `ContactRequestMessage`와 같은 중앙 정렬 카드 스타일로: 제안 일시·장소 메모·상태별 문구
   ("면접 일정 제안이 도착했어요" / 확정됨 / 거절됨 / 취소됨). **구직자이고 status가 proposed면
   카드에 [확정] [거절] 버튼**을 노출해 기존 `setInterviewStatus` 뮤테이션을 그대로 호출한다
   (사이드패널까지 안 가도 카드에서 바로 응답 가능 — 연락처 공개 카드와 동일한 UX).
   schedule을 못 찾으면(삭제 등) body 텍스트만 폴백 렌더.
4. **알림 중복 방지**: 시스템 메시지가 outbox를 타면 미접속 수신자에게 `chat_message` 알림이
   추가로 생겨 기존 `interview_schedule`(action: proposed) 알림과 중복된다.
   `notifyChatMessageCreated`(bambi-chat-sync-queue.ts:66)에서 `kind === "interview_proposal"`이면
   `createBambiNotification`을 건너뛴다(전용 알림이 이미 발송됨). 소켓 브로드캐스트는 그대로.
5. **네이티브/운영자 열람 폴백**: `apps/native` 채팅과 운영자 chat-history-dialog는 미지원 kind를
   일반 말풍선(body 텍스트)으로 렌더하면 충분 — body를 자연문("면접 일정을 제안했습니다.")으로
   두는 이유. 네이티브에 카드 UI는 이번 범위 밖(후속).

## 검증
- `check-types`(web·api·server), ultracite(변경 경로), 기존 vitest 스위트(web test/, api test/services) 통과.
- 신규 단위 테스트는 최소로: 라우터 테스트는 금지(dev DB 초기화 사고 이력) — 실동작은 사용자가
  역할별 수동 테스트로 확인(오늘 계획 4번). 매뉴얼(운영자·구인자·구직자) 관련 섹션 동기화.

## 이연 목록
- 필터 URL 동기화, discovery 탭 축 리셋 개선 (Part 3)
- 네이티브 앱 면접 제안 카드 UI, `proposed` 알림 딥링크 재검토 (Part 4)
