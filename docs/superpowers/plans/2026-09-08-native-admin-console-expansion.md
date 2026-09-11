# Native 운영자 콘솔 확장 설계·구현 계획

작성일: 2026-09-08

2026-09-09 사용자 범위 변경: 이번 완료 기준은 코드 구현과 자동 검증이다. iOS 저장 동작 구현·검증 및 Android 실기기 검증은 이번 범위에서 제외한다. 이를 구현 완료나 실측 성공으로 표시하지 않는다. 기존의 기기 검증 요구는 후속 확인 목록으로 유지한다. 일괄 처리는 기존 50건 상한을 유지하며 자동 분할하지 않는다.

상태: **설계 항목 재대조·누락 보완 및 자동 검증 완료 / iOS·실기기 검증 제외 / DB 쓰기 미실행**

**Goal:** PR #306의 네이티브 운영자 화면과 처리 코드를 재사용하여, 최신 develop 웹 운영자 콘솔의 누락 기능을 Expo SDK 56·HeroUI Native·Uniwind로 구현한다. 운영자 업무를 먼저 완성하며 일반 구직자·구인자 화면 개발을 끼워 넣지 않는다.

**Architecture:** 기존 `(moderator)` 권한 가드·Stack·3탭·공용 사유 다이얼로그를 유지한다. 추가 업무는 그룹형 더보기와 상세 Stack으로 연결한다. 업무 판정은 기존 API/정책을 사용하고, 웹 전용 순수 함수만 플랫폼 독립 모듈로 옮긴다. 렌더링·입력·파일 접근은 기존 Native 컴포넌트와 Expo 모듈로 구현한다.

**Tech Stack:** Expo `~56.0.3`, React Native `0.85.3`, React `19.2.3`, `heroui-native ^1.0.3`, `uniwind ^1.7.0`, Expo Router, TanStack Query, oRPC. 이는 package.json 선언값이며 설치 시 잠금 파일의 실제 해석 버전을 확인한다.

## 1. 기준 커밋·작업 위치·권한

| 구분 | 확인한 기준 |
|---|---|
| 원본 저장소 | `C:\Users\user\bambi`, 현재 `mobile`, 변경 없음 |
| 작업 브랜치 | `feat/native-admin-console-expansion` |
| 작업 worktree | `C:\Users\user\bambi.worktrees\native-admin-console-expansion` |
| 생성 기준 | fetch 후 최신 `origin/mobile`, `64c110185d22c761697a949906133c184c4bf549` |
| 웹 비교 기준 | `origin/develop`, `e6b3d38b69d2f960b8b64c7bcf2bbe8aa1a9c754` |
| PR #306 재사용 기준 | `origin/feat/native-admin`, `eb44b049f45df2b364b19ade304049f0ec76bc07` |
| PR 상태 | 확인 시 OPEN, base `mobile`; 아직 mobile에 미반영 |

- 승인된 설계에 따라 PR 코드와 공통 의존성을 작업 worktree에 반영했다. 환경파일은 없던 파일만 원본에서 복사했고 실제 DB 변경은 실행하지 않았다.
- 구현 시작 전 세 원격 참조와 PR 상태를 다시 확인한다. 기준이 움직이면 변경분을 읽고 문서의 영향 범위를 갱신한다.
- 코드·설계 수정과 검증은 에이전트, 커밋·푸시는 사용자, 모든 Git 병합·최종 머지는 동기가 담당한다. 에이전트는 커밋·푸시·PR/이슈 생성·Git merge·cherry-pick을 실행하지 않는다.
- PR #306은 변경을 새 작업 브랜치에 확보하고 대체 작업이 준비되기 전에 닫거나 원격 브랜치를 삭제하지 않는다. 에이전트가 해당 PR을 닫지 않는다.
- 원본 작업 폴더, 다른 worktree, 사용자 변경을 덮어쓰지 않는다. 강제 옵션·강제 브랜치 변경·파괴적인 정리 명령을 사용하지 않는다.
- graphify는 사용하지 않는다. 조사 기록용 별도 파일·별도 실행 안내 파일은 만들지 않는다.
- 루트 `AGENTS.md`, `.claude/CLAUDE.md`, `.claude/rules/no-build-or-run.md`를 확인했다. 기존 문서에 적힌 다른 경로·서브에이전트 지침·자동 커밋 지침은 이 작업에 적용하지 않는다. 현재 사용자 지시가 우선한다.

## 2. 기존 설계 문서 확인과 채택한 형식

두 기준 브랜치의 `docs/superpowers/plans` 파일 목록과 제목 구조를 전체 조사했다(각 116개). 이는 전체 본문을 모두 정독했다는 의미가 아니다. 이번 대화에서 직접 읽은 관련 문서와 섹션은 다음과 같다.

| 문서 | 읽은 범위·이번 설계에 적용한 방식 |
|---|---|
| PR #306 `2026-09-07-native-admin-console-design.md` | 전체. 선행 구현의 확정 범위·제외 범위·API 연결 확인 |
| PR #306 `2026-09-07-native-admin-console.md` | 전체. Files / Interfaces / 작업 단계 / 검증 명령 형식 |
| develop `2026-09-07-employer-approval-business-document-ui.md` | 전체. 확정 요구사항·공용화 근거·검증 체크 분리 |
| develop `2026-08-26-table-selection-search-control-layout.md` | 전체. 변경 불가 조건·작업별 수용 기준·커밋 단위 |
| develop `2026-09-04-user-online-presence.md` | 전체. 활동 판정·자동 요청 제외·DB/서버/클라이언트 연결·회귀 검증 |
| mobile `2026-09-01-native-seeker-mypage-hub.md` | 도입부·제약·Task 1·Task 2 도입. 기존 네이티브 구성·순수 로직 테스트 방식 |
| mobile `2026-09-07-native-point-shop-alerts-design.md` | 전체. SSE 알림과 기기 푸시 제외 범위 |
| mobile `2026-09-04-native-job-media-polish-design.md` | 도입부터 테스트 계획. 기존 이미지 분할·원본 데이터 보존 계약 |
| develop `2026-09-03-crawled-community-board-editing.md` | 요구사항·저장 모델·API 계약 부분. 원본/편집본·revision·게시판/등급 참조 |
| develop `2026-09-03-crawled-community-runbook.md` | 실행·환경파일·마이그레이션·커밋 안내 부분. 실제 경로와 UTF-8 메시지 작성 방식 |

각 Task는 구현 직전에 명시한 웹 원본·API·연관 테스트를 **전체 직접 읽는다**. 아래 API 대응표는 실제 호출 지점을 조사한 것이며 해당 웹 파일의 모든 본문을 정독했다는 표시는 아니다. 아직 읽지 않은 세부 처리를 추측으로 구현하지 않는다. 기존 문서의 완료 체크를 이번 작업의 검증 결과로 복사하지 않는다.

## 3. 사용자 확정 요구사항과 범위 경계

| ID | 확정 요구사항 | 수용 기준 |
|---|---|---|
| R01 | 최신 mobile에서 별도 작업 | §1 worktree 사용, 원본 변경 없음 |
| R02 | PR #306 재사용 | 28개 변경 파일을 기준 diff와 대조하고 기존 구현을 중복 작성하지 않음 |
| R03 | PR 화면 유지·누락 기능 추가 | 기존 3탭의 카드·칩·상세 동선 유지, 웹 표 UI로 강제 교체하지 않음 |
| R04 | 일반 운영자부터 구현 | 운영자 메뉴·조회·편집·처리와 공용 기반이 이번 구현 대상 |
| R05 | Expo 56·HeroUI Native·Uniwind | 기존 Expo Go 개발 흐름 유지, 새 UI 프레임워크·새 WebView 편집기 없음 |
| R06 | 기존 조회 상한 유지 | 검수 50, 신고 50, 사용자 1,000 유지; 서버 전체조회/독립 상세 API 확대 없음 |
| R07 | 필요한 공통 코드 포함 | develop의 필요한 API·DB·서버 변경도 새 작업 브랜치의 수정 범위로 포함 |
| R08 | 파일을 기기에 실제 저장 | 시스템 권한/저장 확인 허용, 취소·거절·실패는 저장 성공으로 표시하지 않음 |
| R09 | 기존 앱 내부 알림 유지 | SSE·종 배지·목록 유지, OS 푸시·FCM/APNs·기기 배지·백그라운드 푸시 작업 제외 |
| R10 | 값·정책을 임의로 정하지 않음 | §7 출처표와 기존 서버 판정 재사용 |
| R11 | 기존 자료 보존 | 웹 작성 서식·이미지 원본·수집 원문·revision·사용자 변경 보존 |
| R12 | 테스트의 실제 영향 확인 | 순수 테스트 우선, 공유 개발 DB 파괴 테스트 자동 실행 금지 |
| R13 | 사용자 커밋·푸시 / 동기 머지 | 에이전트는 변경과 검증만, Git 실행 명령은 §16 참고 |
| R14 | 충분히 구체적인 설계 | 기능별 원본·파일·API·오류·캐시·검증·완료 기준 명시 |
| R15 | 마이그레이션만 사용 | 기존 번호·journal·snapshot·적용 이력 확인, 스키마 직접 push 없음 |
| R16 | 기존 3탭＋더보기 | 검수·신고·사용자 유지, 후기·광고 상품을 포함한 나머지 업무는 더보기의 기존 웹 업무 그룹에 배치 |
| R17 | 문단별 네이티브 입력＋서식 미리보기 | 일부 글자 선택 후 허용 서식 적용, 기존 JSON/서식 보존, 새 WebView 없이 선행 검증 후 적용 |

### 3.1 팝업 및 일반 사용자 화면의 순서

- 운영자 팝업 개수·내용·이미지/글 편집·대상·기간·위치·링크 관리와 **운영자 안의 네이티브 미리보기**는 이번 범위다.
- 사용자는 앱 팝업 노출 의사를 밝혔고, 이후 **구직자·구인자 화면을 아직 만들지 않았으며 운영자부터 만든다**고 순서를 명확히 했다. 따라서 사용자 화면에 팝업을 전역 부착하거나 수다방·고객센터 사용자 라우트를 새로 만드는 단계는 후속 사용자 화면 개발에서 연결한다. 이 요구를 삭제하거나 이미 구현된 것으로 표시하지 않는다.
- 팝업 데이터 형식·대상 ID·기간·링크는 웹과 동일하게 보존해 후속 화면에서 같은 설정을 소비할 수 있게 한다. 앱 전용 대상/가격/권한을 새로 저장하지 않는다.
- 원문 확인에 필요한 내용은 운영자 상세 API/스냅샷으로 운영자 화면 안에서 열람한다. 미구현 사용자 라우트를 해결하려고 일반 사용자 앱 전체를 만들거나 임의 웹 브라우저 리디렉션을 추가하지 않는다.
- 기존 본인인증 WebView와 PDF/서류 브라우저 열기는 기존 코드 범위에서 유지한다. 새 운영 화면·편집기를 웹 페이지로 감싸지 않는다.

### 3.2 이번 문서의 구현 완료 판정에 포함하지 않는 것

일반 구직자·구인자 화면 전체 완성, 일반 수다방 참여 기능, 기기 푸시, 스토어 배포, 실제 운영/개발 DB의 임의 마이그레이션 적용, 원격 PR 생성·종료·머지. 운영자 기능에 필요한 상세 열람·본문 편집은 포함한다.

### 3.3 구현자 재검토 후 사용자 확정 사항

다음 두 항목은 초안 작성자의 제안이었으나, 웹과 PR의 차이·제안 근거·장단점을 설명한 뒤 사용자가 두 권장안을 수락했다. 메뉴 배치와 편집 사용 방식은 확정되었으며, 편집기의 실제 동작 검증은 별도로 남아 있다.

| ID | 웹에서 확인한 동작 | 채택한 제안 | 사용자 확정 결과 |
|---|---|---|---|
| Q01 → R16 | `screens/moderator.tsx`의 ModTabs는 검수·신고·사용자·후기·광고 상품·더보기 | 기존 3탭에 더보기 추가 | 하단은 검수·신고·사용자·더보기 4개. 후기는 콘텐츠, 광고 상품은 광고·결제 그룹에서 진입 |
| Q02 → R17 | `community-editor.tsx`, `popup-text-editor.tsx`는 본문에서 선택한 글자에 서식을 바로 적용 | 문단별 입력과 서식 미리보기 분리 | 기존 Native 블록 입력 패턴을 확장하되 문단 안 일부 글자의 굵기·링크·크기 등 허용 서식을 편집하고 미리보기로 확인 |

새 WebView 금지·기존 서식 보존도 유지한다. Expo Go에서의 글자 선택·서식 렌더 및 파일 저장 API의 실제 동작은 에이전트의 선행 기술 검증 책임이다. 기존 공고 블록 편집기를 그대로 붙이는 것으로 Tiptap 문서 편집을 완료 처리하지 않는다. 사용자에게 라이브러리/API 구현법을 결정하도록 요구하지 않는다.

## 4. PR #306의 생성 과정·재사용·보완

커밋 기록은 설계(`4cfea4d8`) → 실행 플랜(`67f1b295`) → 공용 라벨(`3394d1eb`) → 3탭 셸(`71a74262`) → 다이얼로그(`e54bbf8d`) → 검수(`7a35bcbb`) → 사용자(`90628a78`) → 신고(`729afa4d`) → 라벨 중복 제거(`0168ced2`) → 통합 커밋(`e0be5874`) → 필터 행 높이 수정(`eb44b049`) 순이다. 실제 작업자의 보이지 않는 판단 과정은 이 기록만으로 단정하지 않는다.

### 4.1 그대로 활용할 구현

- `(moderator)/_layout.tsx`: 세션·admin 검사와 상세 Stack.
- `(moderator)/(tabs)/{_layout,index,reports,users}.tsx`: 3탭, 카드 목록, 필터·검색.
- `(moderator)/{queue,reports,users}/[id].tsx`: 기존 API를 연결한 상세.
- `src/components/moderation/{reason-dialog,sanction-dialog,confirm-dialog,filter-chips,moderator-header,chat-moderation-thread}.tsx`.
- `src/lib/moderation/{queries,report-target}.ts`, `src/lib/use-debounced-value.ts`.
- `packages/api/src/services/bambi-moderation-labels.ts`와 그 테스트, 웹 라벨 파일의 호환 재수출.
- 기존 검색 화면의 공용 디바운스 사용 및 신고 폼의 공용 사유 라벨 사용 변경까지 함께 보존한다.

### 4.2 그대로 완료 처리하지 않을 부분

| 항목 | 실제 상태 | 이번 처리 |
|---|---|---|
| 목록 상한·캐시 상세 | 최근 목록 안에서만 상세 탐색 | 사용자 결정대로 상한 유지. 조회 실패와 대상 없음은 구분하고 복귀 경로 제공 |
| 채팅 첨부 | 파일명만 렌더 | API의 category/MIME/objectUrl을 사용해 이미지·PDF 열람·저장 추가 |
| 게시판 이름 | 수집 댓글 `work_talk` 라벨 고정 | develop의 실제 게시판 응답 사용. 미확인 항목을 임의 게시판명으로 추정하지 않음 |
| 경고 철회 이력 | `revert_warning` 라벨 누락 | 실제 서버 action에 대응하는 공용 라벨·회귀 테스트 추가 |
| 사유 입력 중 이탈 | 내부 취소만 pending 방어 | Overlay·스와이프·하드웨어 뒤로가기까지 요청 중 닫기 방어 |
| 복합 조치 | 제재/콘텐츠 조치 후 신고 종료 별도 호출 | 단계별 성공을 보존하고 실패한 후속 단계만 재시도 |
| 채팅 차단 주석 | 신고를 닫지 않는다는 설명 | 서버는 관련 미처리 신고를 종료함. 서버 동작을 UI·문서에 반영 |
| 감지 문구 | 별도 Pill만 표시 | PR 정보 구조 유지, 실제 본문 내 일치 부분 강조 추가 |
| 사용자 상세 정보 | 인증 여부만, 일부 필드 없음 | 전화번호·생년월일·최근 활동·접속 표시·신고 이력 연결 추가 |
| 테스트 | 공유 라벨 11건 중심 | 신규 순수 로직·계약·실패 경로 테스트와 실기기 검증 추가 |

## 5. 작업 트리와 PR 변경 확보 방식

1. 이 설계서를 먼저 별도 문서 커밋으로 사용자가 보존한다. 에이전트가 자동 커밋하지 않는다.
2. 구현 시작 시 `git diff origin/mobile...origin/feat/native-admin --stat`과 변경 목록을 다시 읽고 기준 커밋을 고정한다. PR이 이미 mobile에 반영됐으면 중복 반영하지 않는다.
3. 미반영이면 **변경 패치로 작업 트리에 적용**한다. Windows에서 native command 간 텍스트 파이프로 diff를 전달하면 한글/바이너리가 변형될 수 있으므로 Node의 Buffer로 Git stdout→stdin을 전달한다. 파일별 출처와 원본 커밋은 이 문서에 유지한다. 별도 조사 파일은 만들지 않는다.
4. 전체 패치를 먼저 `git apply --check`로 확인한다. 실패하면 원본·현재 파일을 읽고 필요한 충돌만 수동 해결한다. 전체 디렉터리 checkout이나 원본 mobile 덮어쓰기는 하지 않는다.
5. 패치에는 PR의 문서와 웹 라벨 변경도 포함한다. 이전 문서는 역사적 설계로 보존하고 본 문서가 이번 확장 작업의 지시임을 명시한다.
6. develop 공통 변경도 선택한 파일/행 단위로 반영한다. Git 병합 커밋은 만들지 않는다. 동기가 나중에 Git 이력을 병합할 때 동일 변경이 이미 들어 있음을 알 수 있도록 원본 커밋과 차이를 최종 설명에 남긴다.
7. 구현 도중 `origin/mobile`이 이동하면 작업 변경을 보존한 채 차이를 확인한다. Git 병합이 필요하면 동기에게 맡긴다. 미반영 상태를 최신 기준 검증 완료라고 쓰지 않는다.

## 6. 공통 API·DB 정합성 계획

### 6.1 현재 차이와 보존할 축

- mobile migration 마지막: `0114_light_talos`(idx 114).
- develop 마지막: `0117_chat-response-activities`(idx 117).
- 이번 운영자 기능에 필요한 기존 migration은 `0115_user-presence.sql`, `0116_crawled_community_board_editing.sql`, 대응 `meta/0115_snapshot.json`, `0116_snapshot.json`, journal entries 115~116이다.
- `0117_chat-response-activities.sql`은 채팅 응답시간 집계용이다. 운영자 moderation/attendance/presence와 해당 presence 서비스에서 이 의존성을 찾지 못했다. 번호가 최신이라는 이유로 필수 반영하지 않는다. 기존 chats 라우터나 DB 등록 파일 전체를 복사하여 이 의존성을 불필요하게 유입시키지 않는다.
- 이 이력은 develop에 이미 존재한다. 같은 스키마를 새 번호로 재생성하거나 과거 SQL을 수정하지 않는다. 동기가 이후 0117을 mobile에 반영한 경우에는 그 기존 변경을 제거하지 않는다. **실제 대상 DB 적용 여부는 이번 설계 단계에서 조회하지 않았다.**
- 새 스키마가 추가로 필요하면 양쪽 최신 이력을 재조회하고 다음 번호를 정한다. 현재 다음 후보 0118을 예약·생성한 것으로 취급하지 않는다.

### 6.2 선별 반영 파일 묶음

| 묶음 | 기존 파일·반영 내용 |
|---|---|
| DB | `packages/db/src/{index.ts,schema/auth.ts,schema/bambi.ts,migrations/*}`: presence·수집 편집 스키마/등록만 선별 |
| 접속 정책 | `packages/api/src/services/bambi-user-presence.ts`, `bambi-user-presence-db.ts`, `bambi-chat-presence.ts`; `routers/bambi/presence.ts` |
| API 연결 | `packages/api/src/context.ts`, `routers/bambi/{index,moderation,attendance,site-settings}.ts`: 실제 develop 변경을 기존 mobile 계약과 합성 |
| 서버 | `apps/server/src/plugins/{presence,realtime-connection-policy,sse,cors}.ts`, `src/{index,bambi-realtime}.ts`, `apps/server/package.json`의 필요한 pg 의존성 |
| 수집 편집 | `routers/bambi/{crawler,crawled-community-edit,community,community-boards,member-grades}.ts`; `services/bambi-crawled-community{,-policy}.ts`, `bambi-community-post-policy.ts`, `bambi-crawl-{ingest,queenalba}.ts` |
| 접속 전파 연관 | `services/bambi-chat-realtime.ts`와 server 전파부의 presence 이벤트만 선별. `bambi-chat-response{,-policy}.ts` 및 0117 응답 집계는 이번 필수 변경에서 제외 |

**mobile 전용 공유 모듈 보존:** `bambi-chat-block`, `bambi-chat-message-grouping`, `bambi-chat-room-messages`, `bambi-chat-system-messages`, `bambi-notification-labels`, `bambi-point-shop-labels`, `bambi-point-shop-rules`, `bambi-team-labels`를 develop에 없다는 이유로 삭제하지 않는다. `bambi-job-media-policy`의 이미지 슬라이싱 함수, `bambi-job-boost`의 공용 라벨, `bambi-chat-message-id`의 Hermes 폴백도 보존한다. 폴더 전체를 develop 버전으로 교체하지 않는다.

### 6.3 접속 상태와 기존 SSE의 결합

- 운영자 사용자·출석 목록·사용자 상세에 접속 상태와 마지막 활동을 추가한다. 기존 계정 상태와 접속 상태를 별도 표시한다.
- `siteSettings.getPresencePolicy/updatePresencePolicy`를 그대로 연결한다. 기본 20분·10초 쓰기 간격·lease 시간은 기존 공용 상수에서 가져온다.
- 전용 운영자 presence SSE는 로그인 admin이고 앱 active일 때 연결한다. 이벤트를 받은 사용자만 갱신하고 재연결 시 목록·정책 정본을 재조회한다.
- 기존 알림 `NotificationStreamGate`를 삭제하지 않는다. notification SSE와 presence SSE는 서로 다른 목적이다.
- 자동 polling·SSE 재접속 후 refetch·presence renew에 활동 헤더가 붙어 온라인이 영구 유지되지 않게 한다. 기존 oRPC context 타입을 사용해 자동 요청 opt-out을 추가하고 호출부 전체를 확인한다. 전역 boolean/depth로 동시에 발생하는 사용자 요청까지 억제하지 않는다.
- 기존 foreground/background·로그아웃·다중 기기 정책을 재사용한다. 갱신 오류가 본 업무 API를 실패시키지 않도록 기존 context 오류 격리를 유지한다.

### 6.4 DB 검증 절차

1. `git show <기준>:.../_journal.json`과 SQL 파일명·idx·tag·when 일치 여부 확인.
2. 격리된 빈 PostgreSQL에서 0000~최종 이력 적용 및 기존 0114 상태에서 업그레이드 검증. 개발 DB URL을 격리 환경으로 오인하지 않는다.
3. 스키마의 실제 테이블·컬럼·FK·유니크·인덱스와 snapshot을 대조한다. SQL에 있는 trigger를 실제 확인하고 설계 문장만으로 존재한다고 가정하지 않는다.
4. 기존 공고·수집 글·댓글 ID와 수정본이 유지되는지 테스트한다.
5. 대상 DB가 지정되면 적용 이력은 읽기 전용으로 확인한다. 공유 개발 DB에 migration을 자동 실행하지 않는다. 이미 적용된 기존 migration을 중복 적용하지 않는다.

## 7. 데이터·문구·제한값의 출처

| 대상 | 정본 및 사용 규칙 |
|---|---|
| 상태·역할·판정·사유 | PR 공용 moderation labels + 각 API Zod 스키마. 표시 라벨과 전송 enum 분리 |
| 사유 길이 | 조치별 스키마 사용. 검수/신고 2~500, 포인트 등 다른 계약에 일괄 적용하지 않음 |
| 일괄 상한 | `bambi-moderation-bulk.ts`의 `BULK_MODERATION_TARGET_LIMIT` 50. 조회 상한과 별개 |
| 가격 | adProducts/boostOptions 및 `sumJobPaymentAmount`. 광고+디자인+끌올−사용 포인트, 실제 서버 금액이 정본 |
| 포인트 | `bambi-point-ledger`, pointSettings, memberGrades. 상한·잔액 부족·등급 기준을 클라이언트에서 재발명하지 않음 |
| 게시판·등급 | DB 목록 응답. 배열·이름 검색으로 신규 게시판/선택 등급을 추정하지 않음 |
| 파일 정책 | job-media·사업자 문서·등급 GIF·팝업별 기존 MIME/크기 제한. 한 규칙으로 합치지 않음 |
| 팝업 | `bambi-main-popups.ts`, 웹 `main-popup-pages.ts`; 페이지 ID·audience·revision 보존 |
| 날짜 | 기존 KST 변환·포맷을 순수 모듈로 재사용. 기기 시간대로 예약 시간을 바꾸지 않음 |
| URL/포트 | `packages/env` 및 `dev-web-url.ts`. 개발 미디어 서버와 API 서버를 구분, 고정 localhost 삽입 금지 |
| 스타일 | 기존 HeroUI 테마·Uniwind 스케일. 사용자가 고른 색/좌표는 런타임 값으로 보존 |
| 저장 충돌 | 팝업 expectedRevision, 수집 글/이미지 revision. 오류 시 편집값 유지, 자동 덮어쓰기 금지 |
| 빈 항목 | 기존 웹의 없는 대상/삭제됨/미인증 문구. 네트워크 실패를 삭제 사실로 단정하지 않음 |

웹 컴포넌트 내부에만 있는 순수 계산·상수는 `packages/api/src/services/`의 적절한 기존 모듈에 우선 합친다. React·Next·DOM·DB import가 필요한 UI 모듈을 Native 번들에 직접 넣지 않는다. 신규 정책 모듈은 기존 모듈로 책임을 설명할 수 없을 때만 만든다.

## 8. 라우트·공용 UI 구조

- **R16 확정:** 기존 `(moderator)/(tabs)`의 검수·신고·사용자 세 탭을 유지하고 `more.tsx`를 네 번째 탭으로 추가한다. 후기·광고 상품을 별도 하단 탭으로 만들지 않는다. 기존 세 탭의 카드·칩·상세 동선은 유지한다.
- 더보기는 웹 `MODERATOR_NAV_ITEMS/MODERATOR_MORE_GROUPS`의 메뉴명·그룹·권한을 재사용하는 플랫폼 독립 데이터로 만든다. Next `Route` 타입을 끌어오지 않고 업무 키→Native 경로를 별도 어댑터로 둔다.
- 업무 그룹: 공고 / 회원 / 포인트 / 광고·결제 / 콘텐츠 / 사이트. 기존 세 탭과 중복되는 항목은 같은 경로로 연결한다.
- 계정 생성은 사용자 목록 안 버튼이다. 웹의 관련 테스트와 같이 전역 더보기의 별도 최상위 메뉴로 만들지 않는다.
- 작업 목록과 상세는 기존 `BambiHeader`, `BambiScreen`, `Surface`, `Pill`, `FieldSelect`, `ReasonDialog` 등을 사용한다. FlatList는 BambiScreen의 ScrollView 안에 중첩하지 않는다.
- 추가 카드에도 웹의 정보·조치가 빠지지 않게 한다. 긴 본문은 운영자 상세에서 전체 열람하며, 단순 요약 카드로 작업 완료를 판단하지 않는다.
- 선택 상태는 업무·필터 전환 시 기존 웹처럼 초기화한다. 일괄 처리 바는 하단 안전영역·키보드·탭바와 겹치지 않도록 실측 높이를 사용한다.
- 새 파일군(계획): `src/components/moderation/{summary-cards,more-menu,bulk-action-bar,managed-file-row,content-document-editor,content-document-viewer}.tsx`, `src/lib/moderation/{navigation,bulk-result,document-edit,managed-file,presence-stream}.ts`. 기존 파일로 처리할 수 있으면 생성 대신 확장하고 문서를 갱신한다.

## 9. 기능별 구현 Task

아래 체크는 2026-09-09에 확정한 **코드 구현 범위의 반영 여부**다. 실제로 실행한 자동 검증과 제외한 실기기·DB 검증은 §17에 구분한다. 화면별 실제 데이터 조작을 실행했다는 의미가 아니다.

아래 경로의 `native`는 `apps/native`, 웹 원본은 특별한 표기 없으면 `apps/web/src/app/moderator` 기준이다. API는 기존 `orpc.bambi` 아래 키다. 각 Task는 source 전체 읽기 → 순수 정책 재사용/분리 → 화면 연결 → 오류·캐시 검증 → 문서 결과 갱신 순서로 수행한다.

### Task 1. PR #306 확보와 기본 회귀 보완

**Files:** §4.1의 PR 변경 파일, `packages/api/test/services/bambi-moderation-labels.test.ts`, `native/test/lib/moderation/` 신규 회귀 테스트.

**Interfaces:** 기존 `ReasonDialog.onConfirm(reason): Promise<boolean>`, `SanctionDialog.onConfirm(status, reason)` 유지. 새 복합조치 상태는 `idle → primaryPending → primaryDone → followupPending → done/followupFailed`로 구분하고 처리 대상 ID에 묶는다.

**Implementation:** §5 방식으로 PR 패치를 반영한다. 사유 요청 중 Modal 닫힘을 제어하고 `try/finally`로 pending을 해제한다. 제재 성공 후 신고 종료 실패에서는 제재가 적용됐음을 표시하고 신고 종료만 재시도한다. 채팅 차단은 서버가 신고를 종료하므로 추가 종료 호출을 중복 삽입하지 않는다. `revert_warning` 라벨과 실제 게시판 라벨을 보완한다. 목록 한도 밖 상세는 기존 상한을 유지하며 ‘목록으로’ 복귀시 뒤로갈 Stack이 없으면 해당 목록으로 replace한다.

응답 유실로 첫 조치의 성공 여부를 모르는 경우에는 성공/실패를 임의 확정하지 않는다. 기존 사용자 제재 이력·콘텐츠 상태·신고 상태를 재조회해 반영 여부를 확인하고, 확인되지 않으면 ‘처리 결과 확인 필요’로 남긴다. 경고·포인트·쪽지처럼 반복 시 추가 효과가 나는 요청은 네트워크 오류 뒤 자동 재전송하지 않는다. 새 멱등성 API가 필요해지는 경우에는 별도 계약 변경으로 설계를 먼저 갱신한다.

- [x] PR 변경 28파일 반영
- [x] 라벨·부분 성공 회귀 테스트 및 닫기·목록 오류 대응 코드 반영
- [x] 기존 3탭과 역할 복귀 코드 유지

### Task 2. 공통 서버·DB 변경 반영

**Files:** §6.2 전체 묶음 및 관련 기존 테스트.

**Implementation:** 변경을 기능 단위로 합성한다. 기존 API 응답에 필드를 추가할 때 기존 클라이언트 필드를 삭제하지 않는다. 이번 필수 migration 0115~0116과 스키마 등록을 함께 대조한다. 최신 0117은 기존 이력 중복·번호 충돌 확인 대상으로 유지하되 응답 집계 기능을 함께 이식하지 않는다. 수집 본문/댓글 편집·등급 선택·revision 응답이 Native에서 추론되게 한다. 순수 라벨 승격 모듈이 Drizzle/서버 env를 끌어오지 않는지 검사한다.

- [x] DB·API·server·web·native 타입 계약 대조
- [x] 기존 mobile 추출 모듈 및 알림·채팅·이미지 분할 보존
- [x] migration 원본·journal 확인 및 격리 DB 미구성 기록

### Task 3. 운영자 홈 집계·더보기·일괄 처리

**Source:** 웹 `layout.tsx`, `components/bambi/persona-nav.tsx`, `screens/moderator{,-context}.tsx`, `lib/bambi/moderator-navigation.ts`.

**Files:** `(moderator)/(tabs)/{_layout,more}.tsx`, `(moderator)/_layout.tsx`, §8 공용 UI.

**Navigation:** 탭 순서는 검수 → 신고 → 사용자 → 더보기다. 더보기는 기존 웹 업무 그룹을 표시하고 후기는 `(moderator)/reviews.tsx`, 광고 상품은 `(moderator)/ad-products/index.tsx`로 Stack push한다. 뒤로가기는 더보기로 복귀하고 기존 역할 전환 메뉴로 운영자 영역을 나갈 수 있어야 한다. 메뉴의 라벨·그룹은 공용 업무 데이터에서 읽는다.

**Implementation:** 상단 검수 대기·신고 대기·경고 사용자 집계를 같은 목록 데이터에서 계산하고 기존 웹처럼 해당 목록 필터로 이동한다. 상한 내 집계임을 유지하며 DB 전체 건수라고 표현하지 않는다. 기존 카드 선택에 Checkbox를 추가해 상세 누름과 선택을 분리한다. `bulkSetJobPostStatus`, `bulkSetReportStatus`, `bulkSetUserStatus`를 사용한다. 50건 상한을 넘겨 여러 요청으로 자동 분할하여 다른 정책을 만들지 않는다. 성공·실패 건수와 서버 실패 사유를 한 번 표시하고 관련 캐시를 갱신한다.

- [x] 메뉴 진입·뒤로가기·역할 복귀 코드 연결
- [x] 선택/해제·필터 전환·부분 실패·중복 요청 방어 반영

### Task 4. 검수·공고 관리·운영자 공고 수정

**Source:** 웹 `page.tsx`, `queue/[id]/page.tsx`, `jobs/page.tsx`, `jobs/[id]/edit/page.tsx`, `screens/moderator.tsx`, `job-description-blocks` 정책.

**Files:** 기존 검수 목록/상세 확장, `(moderator)/jobs/{index,[id]/edit}.tsx`, 필요 시 운영자 전용 공고 폼 어댑터.

**API:** `moderation.listJobPosts`, `getJobPostForAdmin`, `setJobPostStatus`, `adminUpdateJobPost`, `adminDeleteJobPost`, `adjustJobPostExposure`, `removeFromListingQueue`.

**Implementation:** 검수는 PR 감지 칩·정렬을 유지한다. 공고 관리는 웹의 상태·검색·노출 정보와 행별 수정·숨김/복구·삭제·노출 기간 조정·대기열 제거를 빠짐없이 옮긴다. 숨김과 `on_hold`를 혼동하지 않는다. 실제 감지 문구만 본문에서 강조한다. 공고 수정은 Native 공고 폼의 입력/본문/미디어를 재사용하되 구인자 create/update 프로시저로 운영자 권한을 우회하지 않는다. 수정하지 않은 배너 JSON·이미지·스냅샷 필드는 보존한다. 전체 삭제의 연결 채팅/후기 영향은 웹 사유·확인 문구를 그대로 제공한다.

**Verify:** 각 상태 탭·정렬, 협의 급여, 이미지 없는 공고/이미지 전용 공고, 이미 처리된 공고, 기간 조정 0·경계·만료, 삭제 취소·실패, 수정 후 목록 복귀와 캐시 갱신.

- [x] 검수 본문 강조·미디어 열람 반영
- [x] 공고 관리·편집·기간·대기열·삭제 구현

### Task 5. 신고·운영자 채팅·면접 일정

**Source:** 웹 `reports/{page,[id]/page}.tsx`, `chats/{page,chat-history-dialog}.tsx`, `interviews/page.tsx`, `screens/moderator.tsx`.

**Files:** 기존 신고 상세/스레드 확장, `(moderator)/chats/index.tsx`, `(moderator)/interviews.tsx`, `managed-file-row`.

**API:** PR 기존 신고/조치 API, `moderation.listAllChatsForModeration`, `getChatMessagesForModeration`, `hardDeleteChatRoom`, `setChatRoomBlocked`, `listInterviewSchedules`.

**Implementation:** PR의 열림/종료 칩 유지. 유형별 당사자·본문·상태·처리 사유를 웹 응답대로 표시한다. 채팅 열람은 운영자 API의 전체 메시지와 첨부 URL을 사용하고 일반 채팅의 읽음 영수증을 보내지 않는다. 삭제된 방은 서버 스냅샷 범위만 표시하고 복원 불가능한 첨부를 있는 것처럼 그리지 않는다. 본문 선택→해당 첨부 찾기, 이미지 확대, PDF 열기·저장은 기존 Native 첨부 컴포넌트에서 필요한 읽기 전용 부분을 재사용한다. 채팅 목록은 기존 서버 페이지 계약과 검색·조치 대상 필터를 유지한다. 면접은 운영자 읽기 전용 목록과 해당 채팅 열람을 제공하고 구인자의 면접 확정/완료 액션을 추가하지 않는다.

**Verify:** 각 신고 대상, 비회원/탈퇴 당사자, 숨김/삭제 대상, 종료 신고, 차단의 신고 자동 종료, 이미지/PDF/기타 첨부 정책, 깨진 URL·만료·파일 저장 취소, 나간 방·하드삭제 방·일반 방.

- [x] 신고 상세 보완·첨부 열람/저장
- [x] 운영자 전용 채팅·면접 조회 연결, 일반 채팅 읽음 요청 미사용

### Task 6. 사용자·가계정·쪽지

**Source:** 웹 `users/{page,[id]/page,create/page}.tsx`, `moderator-users-table.tsx`, `moderator-messages-panel.tsx`, `bambi-test-account-policy.ts`와 create 페이지 테스트.

**Files:** 기존 사용자 목록/상세 확장, `(moderator)/users/create.tsx`, `(moderator)/messages.tsx`, Native 문서 편집기/뷰어.

**API:** PR 사용자 API, `moderation.createTestAccount`, `directMessages.send/listSent/sentDetail`, `siteSettings.getPresencePolicy/updatePresencePolicy`.

**Implementation:** 카드·칩 유지, 휴대폰 인증·누적 신고·경고 필터와 기존 웹 정렬 정보를 카드/선택창에 추가한다. 이름·이메일·아이디 모두 검색한다. 사용자 상세에 서버 인증 번호·생년월일·소속·마지막 활동·접속 표시를 채운다. 특정 사용자 신고 보기의 필터와 돌아올 목록 상태를 보존한다. 가계정 폼은 웹 필드 전체와 규칙을 사용하고 이름·비밀번호 확인은 검증용이며 API에 전송하지 않는다. 비밀번호를 로그·영구 초안에 저장하지 않는다. 쪽지는 기존 역할/개별 수신자 선택·발송 전 확인·본문 편집·발송 이력·수신 상태를 구현한다. 웹의 `allowUpload=false` 정책을 유지한다. 실제 발송은 사용자가 앱에서 확정할 때만 실행한다.

**Verify:** 탈퇴 상태 우선순위·역할 전환 자격, 법률자문·복구 제한, 이름 미저장, 중복 ID, 입력 실패 후 값 보존, 수신 대상 제한, 중복 발송 방지, 발송 후 본문/선택 초기화, 조회 상한 유지.

- [x] 사용자 부족 필드·필터·접속·신고 연결
- [x] 가계정·쪽지 화면과 기존 정책·오류 처리 반영

### Task 7. 업소 승인·팀 합류 승인

**Source:** 웹 `employers/page.tsx`, `team-invites/page.tsx`, `business-document-file-row.tsx`, 기존 Native `business-document-section.tsx`, 최신 사업자 문서 UI 설계.

**Files:** `(moderator)/employers.tsx`, `(moderator)/team-invites.tsx`, 공용 파일 행.

**API:** `moderation.listEmployers/setEmployerVerificationStatus/deleteBusinessDocument`, `listPendingTeamInvitations/setTeamInvitationStatus`; 문서 URL은 기존 응답/열람 API 계약 유지.

**Implementation:** 업체·사업자 정보와 검증 결과·이미지/PDF 원본 열기·저장·삭제를 같은 행으로 제공한다. 이미 verified인 업소는 승인만 비활성화하고 반려 입력/반려 액션을 임의 차단하지 않는다. 미승인·재제출·반려 재승인 상태를 서버 판정에 맡긴다. 팀 초대는 초대자/대상/조직/팀/역할/사유/기한 표시, 승인·반려, 만료·이미 처리된 초대 오류를 처리한다. 비공개 서류를 공개 이미지 업로드 API로 바꾸지 않는다.

**Verify:** 승인 완료 중복 클릭, 문서 0/1/다수, 이미지/PDF 동등한 행, 권한 없음·만료URL·취소, 삭제 경고, 동시 승인/만료 초대.

- [x] 업소·서류·팀 승인 코드 반영

### Task 8. 출석·회원별 포인트·등급·기타 포인트 설정

**Source:** 웹 `attendance/page.tsx`, `member-grades/page.tsx`, `points/**`, `comment-bonus-card.tsx`, `comment-milestone-section.tsx`.

**Files:** `(moderator)/points/{index,attendance,grades,settings,members/[id]}.tsx`와 기능별 작은 섹션 컴포넌트. 웹의 `points/members/page.tsx`는 현재 출석 관리로 redirect하는 호환 경로이므로 별도 회원 목록 화면을 다시 만들지 않는다.

**API:** `attendance.adminList/adminGetMonth/adminAdjustPoints/adminSetGradeAnchor`; `pointSettings.getAdminMember/listAdminMemberHistory/getAdmin/saveMembershipAdmin/savePointJobsAdmin/saveJobPaymentAdmin`; `memberGrades.list/create/update/remove/createIconUpload/getPointsCap/updatePointsCap/commentMilestones.*`; `siteSettings.getCommentBonus/updateCommentBonus`. 서버에 남아 있는 `pointSettings.listAdminMembers`를 이유로 웹에서 없어진 별도 목록을 추가하지 않는다. 설계의 회원별 출석 달력에는 목록 집계만으로 날짜를 표시할 수 없어 admin 전용 월 조회 `adminGetMonth`를 추가했다. 기존 목록/상한과 회원용 `getMine`을 바꾸지 않으며 선택 회원의 해당 월 날짜만 읽는다.

**Implementation:** 출석 달력·회원 검색/필터·포인트 조정·등급 기준 변경, 회원별 원장, 등급 순서/임계값/색/아이콘, 포인트 상한, 가입/본인인증/게시 활동/공고 결제 설정, 댓글 보너스와 마일스톤 관리 전체를 연결한다. grade anchor 변경과 포인트 지급을 다른 액션으로 유지한다. GIF는 기존 서버 제한과 업로드 URL을 사용한다. 실지급액은 서버 응답 `applied`를 사용하고 입력금액을 그대로 성공 문구에 쓰지 않는다. 날짜는 KST, 잔액 초과 차감은 서버 오류를 표시한다. 설정 저장 후 해당 요약·회원·원장·등급·커뮤니티 관련 캐시를 웹과 같이 무효화한다.

**Verify:** 0/음수/소수/상한 입력, 설정 누락, 상한에 의한 일부 지급, 부족 잔액, 참조된 등급 삭제, GIF 실패, 마일스톤 중복/지나간 회차, 원장 페이지 이동, 접속 배지 갱신.

- [x] 출석·원장·등급·설정·마일스톤 코드 반영

### Task 9. 광고 상품·결제·디자인 제작·포인트몰

**Source:** 웹 `ad-products/**`, `payments/**`, `point-shop/page.tsx`, `job-detail-design-dialog.tsx`, 공용 광고상품 폼·가격/노출 정책.

**Files:** `(moderator)/ad-products/{index,new,[placementId]/edit,[placementId]/new,[placementId]/[productId]/edit}.tsx`, `payments.tsx`, `point-shop.tsx`, 디자인 제작 관리 컴포넌트.

**API:** `adProducts.listCatalogAdmin/createPlacement/updatePlacement/deletePlacement/reorderPlacements/createProduct/updateProduct/deleteProduct/reorderProducts`; `moderation.listJobsForPayment/bulkSetJobPostPayment/getJobPostForAdmin/createJobPostDesignMediaUpload/setJobPostDesignMedia/setJobPostDesignStatus`; `boostOptions.listPurchasesForPayment/confirmPurchasePayment/cancelPurchase`; `pointShop.adminListItems/createItem/updateItem/removeItem/adminListOrders/completeOrder/cancelOrder`.

**Implementation:** 상품/게재 위치 CRUD·노출/사용 설정·순서·하위 상품 동반 삭제 확인을 유지한다. 결제 금액은 §7 계산, 미결제/디자인 신청 필터·선택 처리·끌올 구매 결제 상태를 구현한다. 디자인 제작은 이미지 업로드 후 완성본 교체·제작 상태 전환을 기존 API 순서대로 처리한다. 포인트몰은 상품과 주문 관리로 분리하고 혜택 유형·대상·재고·가격·노출·기한·구매 제한을 서버 계약대로 편집한다. 쿠폰은 기존처럼 외부 지급 후 상태를 완료하며 앱이 새로운 쿠폰 발급 서비스를 만들지 않는다. owned/useBenefit 등 구매자 동작을 운영자 지급 버튼으로 대체하지 않는다.

**Verify:** 상품 삭제 참조 영향, 단색/이미지 규격, 가격 변경, 빈금액과 무료 구분, 묶음결제·포인트 차감, 정원 초과 부분 실패, 제작 업로드 실패·원본보존, 완료 주문 재처리 거부, 환급 상한과 실제 환급액.

- [x] 광고·결제·제작·포인트몰 코드 반영

### Task 10. 게시물·게시판·후기·금칙어

**Source:** 웹 `content/page.tsx`, `community-boards/page.tsx`, `reviews/page.tsx`, `banned-words/page.tsx`, `bambi-content-status`와 커뮤니티 권한/포인트 정책.

**Files:** `(moderator)/{content,community-boards,reviews,banned-words}.tsx`, 공용 본문 열람·사유·선택 액션.

**API:** `moderation.listModeratableContent/getModeratableContentDetail`, `community.setPostStatusByAdmin({ postId, reason, status })`, `community.setCommentStatusByAdmin({ commentId, reason, status })`, `moderation.setInquiryStatusByAdmin({ inquiryId, reason, status })`, `moderation.hardDeleteCommunityPost({ postId })`; `communityBoards.list/create/update/setActive/remove/getHomeLayout/updateHomeLayout/getBestBoardIcon/updateBestBoardIcon`; `moderation.listReviews/setReviewStatus`; `bannedWords.list/create/createMany/setActive/remove/removeAll`.

**Implementation:** 콘텐츠 유형별 목록·게시판 필터·펼침 상세·단건/일괄 숨김/복구/삭제·삭제 후 영구삭제를 분리한다. 영구삭제는 이미 삭제 상태인 커뮤니티 글에만 제공하고 선행 삭제의 사유가 있으므로 웹처럼 확인창만 거친다. 선택 삭제와 영구삭제의 대상 건수도 각 조건에 맞게 따로 표시한다. 제목 미리보기와 조치 판단용 전체 본문을 구분한다. 서버 일괄 API가 없는 곳은 웹처럼 개별 요청 결과를 합산하며 성공 대상을 재실행하지 않는다. 게시판 설정의 읽기/쓰기·역할·포인트·순서·홈 배치·베스트 아이콘을 실제 필드 전체로 매핑한다. 새 게시판이 재배포 없이 목록에 반영돼야 한다. 후기는 상태별 처리와 포인트 회수/재적립을 서버에 맡긴다. 금칙어는 입력·다중 입력·선택 활성화/삭제·전체 삭제를 기존 범위와 확인 방식으로 제공한다.

**Verify:** 기본 게시판/글 있는 게시판 삭제 거절, 숨김과 영구삭제 차이, 미처리/이미삭제 대상, 원문 미리보기와 전체내용, 금칙어 중복·공백·scope, 후기 상태 전이와 포인트 중복 이동 방지.

- [x] 콘텐츠·게시판·후기·금칙어 코드 반영

### Task 11. 고객센터·문의 채팅·매뉴얼

**Source:** 웹 `support/page.tsx`, `support-chats/page.tsx`, `manual/moderator/page.tsx`, `lib/bambi/manual{,-content}.ts`, `docs/manual/moderator-manual.md`.

**Files:** `(moderator)/{support,support-chats,manual}.tsx` 및 상세 섹션.

**API:** `support.listInquiriesByAdmin/getInquiry/createInquiryMessage/closeInquiry/listFaq/createFaq/updateFaq/setFaqPublished/removeFaq`; `supportChat.admin.listRooms/getRoom/markRead/sendMessage/setBlocked/setClosed`.

**Implementation:** 문의/FAQ 업무를 분리하고 답변·종료·상태·게시/수정/삭제를 기존 순서대로 제공한다. 익명 문의 채팅은 일반 채팅 참가자 API를 사용하지 않는다. polling 주기·열림/종료·차단·읽음 조건은 웹 소스를 사용하며 앱 background에서는 멈춘다. SSE가 있다고 가정해 새 프로토콜을 만들지 않는다. 매뉴얼은 기존 Markdown 원문을 소스로 네이티브 제목·문단·목록·표·내부 목차를 렌더한다. 번들에서 문서를 소비하는 방식은 기존 자산 빌드 절차 안에 두고 사용설명 내용을 따로 복제해 관리하지 않는다.

**Verify:** 금칙어 답변 거부, 종료 후 답변 차단, 문의방 부재·익명 신원, 재연결/읽음, FAQ 수정 취소·공개 전환, 매뉴얼 목차/긴 표·글자 확대.

- [x] 문의·FAQ·문의 채팅·매뉴얼 코드 반영

### Task 12. 수집 관리·수집 글/댓글·이미지 편집

**Source:** 웹 `crawler/**`, `crawled-image-editor/{crawled-image-editor,crop-dialog}.tsx`, `lib/bambi/crawled-image-editor.ts`, develop 수집 편집 설계와 실제 API.

**Files:** `(moderator)/crawler/{index,jobs/[id]/edit,community/[id]/edit}.tsx`, 공용 Native 이미지/문서 편집기와 순수 어댑터.

**API:** `crawler.getSettings/updateSettings/getSummary/listRuns/runNow/clearRuns/list/listTopics/setIndustryCategory/removePost/restorePost/removePosts/removeTopic/restoreTopic/getTopicForEdit/updateTopic/updateSourceComment/getPostImagesForEdit/getOriginalPostImagesForEdit/updatePostImages`; `siteSettings.getCrawledLimits/updateCrawledLimits/getCrawledExposure/updateCrawledExposure`.

**Implementation:** 사이트/수집 종류·목적 게시판·편집 등급·노출·상한·주기 설정, 회차 상태, 즉시수집, 기록 비우기, 공고·수집 글 목록·선택 삭제·복구·CSV 저장을 구현한다. 즉시수집 ‘접수’와 회차 ‘완료’를 구분한다. 원본 수집 댓글과 밤비 이용자 댓글의 ID/편집 권한을 섞지 않는다. 원본/수정본·revision·선택 게시판은 서버 응답을 사용한다. 이미지 편집은 선택·복수선택·삽입·복사·붙여넣기·상하이동·크기 조절·자르기·삭제·실행취소·원본 복귀·저장·기기 저장을 네이티브로 제공한다. 웹 PointerEvent/Canvas 부분만 Native 제스처와 기존 ImageManipulator로 바꾸고 순수 문서 조작은 공용화한다. 편집된 이미지를 새 원본으로 덮어쓰지 않는다.

**Verify:** 게시판별 같은 원본 독립 저장, 재수집 중 수정본 보존, 수집 댓글만 수정, 등급 변경 반영, revision 충돌, 원본 없는 자료, 큰 세로 이미지·여러 조각·한글 파일명, 취소 후 초안 보존/폐기, CSV 필드·따옴표·한글.

- [x] 수집 설정·회차·목록·CSV 코드 반영
- [x] 글/댓글/이미지 네이티브 편집과 원본 보존 처리 반영

### Task 13. 팝업 관리·네이티브 미리보기

**Source:** 웹 `main-popup/{popup-management,popup-image-editor,popup-text-editor,popup-date-time-picker,main-popup-layer}.tsx`, `lib/bambi/main-popup{,-pages}.ts`, `mainPopups` API.

**Files:** `(moderator)/popups.tsx`, `src/components/moderation/{popup-editor,popup-preview,popup-date-time-picker}.tsx`, 공용 문서/이미지 편집기.

**API:** `mainPopups.listAdmin/setCount/save/delete`.

**Implementation:** 개수 변경·개별 삭제 시 실제 삭제 범위를 확인창에 표시한다. 이미지/글 전환 확인, 원본/편집본·복사/붙여넣기·실행취소·크기·이미지 링크·글 서식·대상·노출 위치·기간·활성화를 관리한다. `targetPages`는 기존 ID와 DB 게시판으로 구성하고 Native route 문자열로 저장하지 않는다. 날짜 선택은 기존 KST 규칙 사용. revision 충돌 시 현재 초안을 남기고 명시적 새로고침 후에만 교체한다. 미리보기는 사용자별 listPublic이 아니라 편집 중 문서로 그려 admin에게도 확인 가능하게 한다. 여러 팝업의 좁은 화면 미리보기는 웹처럼 순서대로 한 개씩 표시한다. ‘오늘 하루 보지 않기’의 24시간/revision 규칙은 후속 일반 사용자 노출 연결 시 같은 순수 정책을 사용한다. 미리보기 조작은 실제 사용자의 숨김 상태를 저장하지 않는다.

**Verify:** 0개·증가·감소·중간 삭제 후 순서, 이미지/글 전환 데이터 보존 경고, 위치 미선택, 유효/무효 링크, 시작/종료 경계, 동시 편집, 긴 글·작은 기기 미리보기. 일반 사용자 화면 전역 부착은 §3.1의 후속 단계다.

- [x] 팝업 관리·편집·미리보기·저장 코드 반영

### Task 14. 사이트 정보·운영 설정

**Source:** 웹 `site-settings/page.tsx`의 모든 섹션과 `siteSettings` API.

**Files:** `(moderator)/site-settings.tsx`, 섹션별 폼 컴포넌트.

**API:** `get/updateExposureSectionConfig`, `get/updateSupportChat`, `get/updateFooter`, `get/updatePrivacyContacts`, `get/updatePaymentAccounts`, `get/updateMemberPolicy`, `get/updateAdRotation`, `updateMinimumWage`, `moderation.purgeWithdrawnAccounts`.

**Implementation:** 광고 섹션/회전·문의 채팅 운영·푸터 사업자/연락 정보·개인정보 담당자·입금 계좌·탈퇴 보존/파기·최저임금 설정을 웹의 필드·기본값·검증 그대로 연결한다. 각 섹션을 별도 mutation으로 저장하고 전체 설정을 한 번에 덮어쓰지 않는다. 파기 실행은 실제 데이터 제거 액션임을 기존 문구로 표시한다. 이 버튼의 자동 검증을 공유 DB에서 실행하지 않는다.

**Verify:** 섹션별 실패 격리, 계좌 추가/삭제·빈값, 정수/시간/기간 경계, 저장 후 재조회, 변경하지 않은 섹션 보존, 사용자 역할별 접근 거부.

- [x] 사이트 설정 섹션과 저장·오류 처리 반영

## 10. 네이티브 문서 편집기의 구체 계약

**기존 재사용:** `JobDescriptionBlockEditor`는 공고 전용 블록 형식이다. Tiptap 문서 전체를 그 형식으로 변환하지 않는다. `MessageBody`/`me-messages`의 읽기 전용 처리는 재사용하되 취소선·글자 크기 등 누락된 서식을 보완한다.

**새 인터페이스:** `ContentDocumentEditor({ value, onChange, capabilities, isDisabled })`. value는 서버의 기존 JSON 문서이며 원문 구조를 보존한다. capabilities는 호출 화면의 기존 웹 확장/업로드 허용값에서 결정한다. 쪽지는 이미지 업로드가 꺼져 있고 팝업 글과 수집 글의 허용 노드가 다르다.

1. **R17 확정:** 문단별 네이티브 입력과 서식 미리보기를 분리한다. 사용자는 입력칸에서 일부 글자를 선택하고 툴바로 해당 범위의 허용 서식을 변경하며, 같은 문서 상태를 사용하는 미리보기에서 결과를 확인한다. 문단 전체만 서식 변경하도록 축소하지 않는다. 문단/제목/인용/코드/글머리/번호 목록/hardBreak/이미지와 bold/italic/strike/link/fontSize는 해당 웹 편집기의 지원 범위대로 처리한다.
2. 입력 선택 범위는 RN TextInput의 selection offset을 사용한다. 텍스트 run을 선택 시작/끝에서 분리하고, 선택 구간의 mark만 수정한 뒤 동등한 인접 run을 합친다. 한글 조합 중인 입력을 toolbar 처리나 미리보기 갱신으로 지우지 않는다.
3. 블록 이동·추가·삭제는 선택 경로를 기준으로 수행한다. 저장용 문서에 임의 식별자 필드를 추가하지 않고 편집 세션용 ID/경로는 별도 메모리에 둔다.
4. 알 수 없는 노드/속성은 원문 그대로 round-trip한다. 편집 불가능한 노드는 원문 보존 상태를 표시하고 해당 노드 외의 변경만 허용한다. 문서 전체를 평문으로 평탄화하거나 빈 JSON으로 대체하지 않는다.
5. 링크 스킴은 기존 허용 규칙을 재사용한다. 표시 텍스트와 href를 분리하고 임의 JS/intent 실행을 허용하지 않는다.
6. 실행취소는 문서 변경 전 스냅샷으로 처리하되 웹 편집기별 기존 이력 상한을 가져온다. 화면 재조회가 편집 중 문서를 덮지 않도록 최초 로드와 명시적 재로드를 분리한다.
7. 저장 payload는 원래 API 계약의 JSON 문자열/객체 구분을 유지한다. 문자 수 검증은 해당 서버의 텍스트 추출 규칙을 사용한다.

**필수 선행 검증:** 선택한 일부 글자 서식·한글/이모지·중첩 목록·링크·기존 문서 round-trip·취소선/글자 크기 표시를 작은 편집 화면에서 먼저 검증한다. 입력과 미리보기의 문서 상태가 어긋나지 않는지, 툴바 조작으로 선택 범위/한글 조합이 사라지지 않는지까지 확인한 뒤 쪽지·팝업·수집 글에 적용한다. 검증 전에는 해당 편집 기능을 완료로 표시하지 않는다. Expo Go에서 구현할 수 없다는 이유로 새 WebView나 별도 프레임워크를 설치하지 않는다. 기술적 제약이 확인되면 구체적인 재현과 영향만 사용자에게 알리고 범위를 임의 축소하지 않는다.

## 11. 파일 열람·다운로드·권한

**기준 mobile 조사 상태:** 이미지 Dialog 확대와 PDF/서류 `openBrowserAsync`가 있었으며 기기 파일 저장 모듈은 직접 의존성에 없었다. 이번 구현에서 Android 시스템 문서 생성과 파일 쓰기를 추가했다(§17).

**계획 인터페이스:** `saveManagedFile({ source, fileName, mimeType }): Promise<SaveResult>`; `source`는 서명 URL 또는 이미 확보된 바이트를 구분한다. 결과는 `saved | cancelled | denied | failed` 판별 유니온으로 반환하고 saved에서만 실제 저장 완료를 표시한다.

- Expo SDK 56 공식 파일 시스템 모듈을 사용한다. 버전은 Expo 설치 호환 해석으로 정하고 package.json/lockfile 실제 diff를 검토한다. 임의 외부 다운로드 라이브러리나 커스텀 네이티브 빌드로 전환하지 않는다.
- Android는 `moneyroad-app`에서 검증한 SDK 56 방식과 같이 `Directory.pickDirectoryAsync()`로 사용자가 저장 폴더를 한 번 고르고 Android 권한 확인을 거친다. 선택한 SAF 트리 URI는 SecureStore에 보관하고 이후 저장에서 다시 사용한다. Android가 Download 루트 선택을 금지하면 사용자가 `Download/Bambi` 같은 하위 폴더를 만들어 선택하며, 앱은 `/storage/emulated/0/Download` 같은 실제 경로를 박지 않는다.
- 저장할 때 동일한 안전화 파일명이 이미 있으면 기존 파일을 교체하고 `Directory.createFile()`로 SAF 문서를 만든 다음 바이트를 기록한다. 취소는 성공으로 표시하지 않으며 기록 후 존재 여부와 바이트 크기를 확인한다. 모든 파일에 불필요한 사진 라이브러리 권한을 요구하지 않는다.
- iOS는 현재 지원 코드를 보존하고 시스템이 허용하는 파일 저장 위치를 사용한다. Android 공용 Download 경로를 iOS에 있다고 가정하지 않는다. Windows 환경에서 iOS 실측은 완료로 기록하지 않는다.
- 기존 파일 동명 처리는 시스템의 확인/생성 계약을 따른다. 사용자 확인 없이 기존 파일을 덮지 않는다.
- 서명 URL은 열람/저장 요청 시 기존 API에서 다시 받고 앱 env로 개발 상대 URL만 해석한다. 토큰·서류 본문·서명 URL을 로그에 남기지 않는다.
- 먼저 작은 파일의 생성·쓰기·존재/바이트 길이 확인·권한 거절·취소를 Android Expo Go에서 검증한 뒤 이미지/PDF/CSV로 확대한다. 지원 여부를 확인하지 않고 성공 구현으로 문서에 체크하지 않는다.
- 다운로드 도중 네트워크 실패/저장 공간 부족/서명 만료를 구분하고 임시 파일만 정리한다. 다른 파일을 지우거나 시스템 권한창 취소 직후 다시 강제로 띄우지 않는다.
- 순수 CSV 직렬화·파일명 정규화·저장 결과 판별은 테스트하고 OS 저장 자체는 기기 확인 목록에 둔다.

참고: [Expo SDK 56 FileSystem](https://docs.expo.dev/versions/v56.0.0/sdk/filesystem/), [Android 문서 저장 계약](https://developer.android.com/training/data-storage/shared/documents-files). 구현 시 해당 버전 API와 설치본을 다시 대조한다.

## 12. 오류·재조회·권한·이탈 공통 규칙

| 상황 | 처리 |
|---|---|
| 최초 로딩 | PR/기존 Native 스켈레톤 또는 LoadingState, 헤더·복귀 동선 유지 |
| 조회 실패 | 재시도 제공. 삭제·빈 목록이라고 단정하지 않음 |
| 빈 목록 | 현재 필터의 빈 결과 안내, 필터 유지/초기화 가능 |
| 대상 없음 | API가 404/삭제를 반환한 경우는 해당 응답 사용. 상한이 있는 목록에서 찾지 못한 경우는 삭제를 단정하지 않고 ‘현재 조회 범위에서 찾을 수 없음’으로 안내, 동일 업무 목록 복귀 |
| 세션 만료·권한 변경 | 기존 admin 가드/로그인 처리, 이전 계정 캐시·편집 데이터 노출 방지 |
| 저장/처리 실패 | 입력 사유·초안 유지, 오류 표시, pending 해제 |
| 중복 탭 | 실제 요청 진행 중 가드. 성공 후 재요청으로 경고·포인트·발송 중복 금지 |
| 복합 요청 일부 성공 | 적용된 단계 표시, 실패 단계만 재시도. 전체 실패로 오안내하지 않음 |
| 동시 편집 | 서버 revision/CONFLICT 그대로 처리, 자동 overwrite 없음 |
| 목록 이탈 | 검색·정렬·필터·페이지 복귀 계약은 웹 원본 재사용. 선택은 업무 변경 시 해제 |
| 편집 이탈 | 기존 웹의 취소·변경 폐기 확인을 RN 뒤로가기·헤더·제스처에 적용 |
| 앱 background | polling/stream 정리, foreground에서 정본 재조회. 사용자 초안을 refetch로 덮지 않음 |
| 입력/팝업 가림 | 기존 KeyboardProvider/Container 사용, 중복 inset/중첩 ScrollView 금지 |

공통 mutation은 대상 업무의 조회 키 전체(필터·페이지 포함)를 갱신한다. 포인트/제재/계정 변경 시 원장·등급·사용자 상세 등 연관 키를 기존 웹 호출부와 대조한다. 조회 상한을 유지하면서 목록 전체가 무제한이라고 표시하지 않는다.

### 12.1 주요 무효화 연결

| 변경 | 무효화/재조회 대상 |
|---|---|
| 검수·공고 상태/편집 | moderation.listJobPosts, getJobPostForAdmin, listJobsForPayment, 기존 jobs 소비 캐시 |
| 사용자 제재·역할·복구 | moderation.listUsers, listUserModerationActions, 해당 신고/상세 |
| 콘텐츠 조치 | moderation.listModeratableContent/getModeratableContentDetail/listReports, community 목록/상세, 영향받은 포인트·등급 |
| 포인트·등급 | attendance.adminList/getMine, pointSettings 회원/원장, memberGrades, 해당 사용자 표시 |
| 광고·결제·디자인 | adProducts 카탈로그, moderation 공고/결제/상세, boostOptions 구매 목록 |
| 문의 답변/닫기 | support 목록/상세; supportChat은 별도 admin 목록/방/읽음 캐시 |
| 수집/편집 | crawler 목록·설정·편집 상세·회차, crawledJobs 상세, community 관련 캐시 |
| 팝업 | mainPopups.listAdmin 및 기존 listPublic 캐시. 편집 중 초안은 별도 유지 |
| 설정 | 해당 get 쿼리 및 실제 소비하는 카탈로그/공개 설정. 다른 섹션의 입력값 초기화 금지 |

## 13. 구현 순서·의미 있는 커밋 단위

1. 설계 문서 확정(현재 작업, 사용자 커밋).
2. PR #306 변경 확보 + 기본 회귀 보완(Task 1).
3. 공통 API/DB/서버 정합성(Task 2), 기존 native 회귀 확인.
4. 네이티브 파일 저장·문서 편집 선행 검증(§10~11). 공용 기반의 실제 가능성을 먼저 확인한다.
5. 더보기·집계·선택/일괄(Task 3), 검수·공고(Task 4).
6. 신고·채팅·면접(Task 5), 사용자·가계정·쪽지(Task 6).
7. 업소/팀(Task 7), 포인트/등급(Task 8).
8. 광고/결제/제작/포인트몰(Task 9).
9. 콘텐츠/게시판/후기/금칙어(Task 10), 고객센터/문의 채팅/매뉴얼(Task 11).
10. 수집/편집(Task 12), 팝업 관리(Task 13), 사이트 설정(Task 14).
11. 전체 요구사항·회귀·문서·최신 mobile 대조 후 대체 PR 준비 자료 제공. 생성/머지는 수행하지 않는다.

각 묶음은 사용자 커밋용 제목과 상세 본문을 함께 제공한다. 수정이 이어져도 완료되지 않은 Task를 완료 체크하지 않는다. 중간 기능을 ‘준비 중’으로 남긴 상태는 해당 Task의 완료가 아니다.

## 14. 검증 계획

### 14.1 순수 로직 테스트

- 공용 라벨/판정/실제 action, 메뉴 키→라우트, 역할별 노출.
- 부분 성공 단계·중복 재시도 방지·일괄 결과 합산·기존 상한.
- 웹 문서 round-trip·마크 선택 범위·한글/이모지·미지원 노드 보존.
- 이미지 조작 문서·복제/순서/크기/자르기·원본 보존·undo.
- 파일명/CSV 인코딩·권한 거절/취소/실패 결과, 서명 URL 개발 경로 해석.
- KST 일시·예약 경계·팝업 revision/콘텐츠 전환.
- presence 이벤트 병합·연결 수명·자동 요청 활동 제외·재접속.
- 금액/포인트/등급은 기존 정책 테스트를 재사용하고 Native 어댑터가 값을 바꾸지 않는지 검증.

신규 Native 테스트는 아래 이름으로 기능별 책임을 분리한다. 테스트를 맞추기 위해 네이티브 컴포넌트 문자열만 검사하지 않고 실제 순수 함수의 입력/출력·상태 전이를 검증한다. 기존 동등 테스트가 있으면 그 파일을 확장한다.

| 계획 테스트 파일(`apps/native/test/lib/moderation/`) | 검증 책임 |
|---|---|
| `navigation.test.ts` | 전 메뉴 목적지·권한·역할 복귀·일반 사용자 화면 임의 추가 없음 |
| `bulk-result.test.ts` | 상한·선택 대상·성공/실패 합산·중복 대상 제거 |
| `action-flow.test.ts` | pending 이탈·첫 조치 성공/후속 실패·불확실 응답의 재실행 방지 |
| `document-edit.test.ts` | 선택 범위 mark 편집·한글/이모지·JSON round-trip·미지원 노드 보존 |
| `image-edit.test.ts` | 원본 분리·크기/자르기 변환·조각 그룹·복사/순서/undo |
| `managed-file.test.ts` | 소스 유형·파일명·취소/거절/실패·부분 저장 결과 |
| `popup-policy.test.ts` | 기존 대상 ID·KST·콘텐츠 유형·revision·미리보기와 실노출 상태 분리 |
| `presence-stream.test.ts` | 이벤트 병합·자동 요청 제외·재연결·다중 기기 상태 |
| `management-adapters.test.ts` | 결제 내역·포인트 실지급·등급·게시판 응답 매핑, enum 원값 노출 방지 |

서버 순수 정책은 기존 `packages/api/test/services` 테스트를 우선 실행한다. 새 네이티브 테스트에서 DB를 import하는 라우터 값은 type-only로 참조하고 실제 DB 연결을 발생시키지 않는다.

### 14.2 명령 검증

구현이 존재하고 의존성을 준비한 뒤 worktree 루트에서 실행한다. 현재 문서 작성 단계에서 실행한 것으로 취급하지 않는다.

```powershell
Set-Location 'C:\Users\user\bambi.worktrees\native-admin-console-expansion'
pnpm --filter native check-types
pnpm --filter @bambi-app/api check-types
pnpm --filter @bambi-app/db check-types
pnpm --filter server check-types
pnpm --filter web check-types
pnpm --filter native test
git diff --check
```

- 각 명령의 종료 코드를 확인해 실패 후 다음 결과와 섞지 않는다. API/Web/Server 타입 검사는 실제 변경 범위에 맞춰 수행한다.
- lint는 `pnpm exec ultracite check <변경된 실제 파일 경로...>`로 수행한다. 문서만 바뀐 이번 단계에서 TypeScript 테스트를 성공한 것으로 기록하지 않는다.
- `packages/api/vitest.config.ts`는 공유 서버 env/DB를 사용할 수 있다. `pnpm --filter @bambi-app/api test` 전체 실행을 기본 명령으로 제공하지 않는다. 검증된 순수 서비스 테스트만 개별 지정하고 DB 의존 테스트는 격리된 DB에서만 실행한다.
- Native 테스트 include는 `{src,test}/**/*.test.ts`다. web의 `src/lib` 고아 테스트를 실행 목록에 넣었다고 착각하지 말고 실제 Vitest 설정과 일치시킨다.
- Android 번들 검증은 구현 후 `pnpm --filter native exec expo export --platform android`로 확인할 수 있다. 기존 실행 중인 Metro/서버를 임의 종료·재시작하지 않는다. 사용자 요구의 빌드 검증과 현재 실행 환경을 함께 확인하고 실행하지 못하면 이유·남은 명령을 기록한다.

### 14.3 화면·실제 상태 변경 검증

- Android Expo Go에서 PR 기존 3탭 진입·역할 복귀·더보기·각 신규 업무를 확인한다.
- 글자 확대·긴 이름/이메일/업소·작은 화면·가로 전환·키보드·하드웨어 뒤로가기·중첩 Dialog·선택 체크와 카드 탭 충돌을 확인한다.
- 실제 상태 변경은 테스트 데이터가 확인된 경우에만 수행한다. 데이터가 없으면 mock/순수 로직 검증과 사용자 수동 확인 목록으로 구분한다.
- DB 접근이 필요한 API 테스트는 지정된 격리 환경이 없으면 미실시로 둔다. 임의 테스트 계정 생성·실제 회원 경고·공고 승인·쪽지 발송·포인트 지급·회차 실행·개인정보 파기는 하지 않는다.
- iOS는 별도 기기/실행 환경이 확인되지 않으면 미실측으로 기록한다. Android 성공으로 iOS 성공을 대신하지 않는다.

## 15. 실제 worktree 실행 안내(구현 시 사용자 실행용)

구현과 자동 검증에 사용한 worktree다. 직접 실행할 때 의존성을 설치하고 환경파일은 **없을 때만** 원본에서 복사한다.

```powershell
Set-Location 'C:\Users\user\bambi.worktrees\native-admin-console-expansion'
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw '의존성 설치 실패' }
foreach ($app in @('server', 'web', 'native')) {
    $destination = Join-Path (Get-Location).Path "apps\$app\.env"
    if (-not (Test-Path -LiteralPath $destination)) {
        $source = Join-Path 'C:\Users\user\bambi' "apps\$app\.env"
        if (-not (Test-Path -LiteralPath $source)) { throw "$app 원본 환경파일 없음" }
        Copy-Item -LiteralPath $source -Destination $destination
    }
}
```

새 SDK 모듈이 승인된 구현에 추가되면 설치/잠금 파일 갱신을 해당 Task에서 수행한다. frozen 설치 실패를 잠금 파일 재생성으로 무조건 해결하지 않는다.

- 서버 터미널: 위 worktree에서 `pnpm dev:server`.
- 웹 터미널: 위 worktree에서 `$env:WATCHPACK_POLLING = 'true'` 후 `pnpm --filter web exec next dev --port 23001`.
- Native 터미널: 위 worktree에서 `adb reverse tcp:23000 tcp:23000`, `adb reverse tcp:23001 tcp:23001`, `adb reverse --list`, `pnpm dev:native`.
- 23000/23001은 사용자 제공 실행 구성과 현재 서버/웹 설정에서 확인한 포트다. 이미 다른 worktree 서버가 해당 포트를 쓰면 중복 기동하지 않는다. 앱이 어느 서버 코드를 호출하는지 확인하고 사용자가 터미널을 전환한다.
- API만 새 worktree로 바꾸고 로컬 업로드 웹은 다른 worktree를 쓰면 파일 저장 위치가 어긋날 수 있다. 해당 테스트에서는 API/웹 미디어 저장 경로를 함께 확인한다.
- native env의 서버/웹 주소는 기존 schema로 확인하고 복사 후 임의 값을 삽입하지 않는다. env 값을 바꾼 경우 Metro 재시작 필요 여부를 사용자에게 안내한다.

## 16. 사용자 실행용 커밋·푸시 명령

에이전트는 커밋·푸시·PR/이슈 생성·병합을 하지 않았다. 아래는 사용자 전용 명령이다. CMU02의 PR #306처럼 제목과 상세 불릿 본문을 사용한다. 설계와 구현을 두 커밋으로 나누되 Native·공통 API·DB·Web·lockfile은 함께 묶어 중간 커밋의 의존성 불일치를 피한다.

```powershell
Set-Location 'C:/Users/user/bambi.worktrees/native-admin-console-expansion'
if ((git branch --show-current).Trim() -ne 'feat/native-admin-console-expansion') {
    throw '작업 브랜치를 확인해 주세요.'
}
git diff --check
if ($LASTEXITCODE -ne 0) { throw '공백 오류를 확인해 주세요.' }
git status --short

function Invoke-BambiUtf8Commit([string] $Message) {
    $messagePath = Join-Path $env:TEMP ('bambi-commit-' + [guid]::NewGuid().ToString() + '.txt')
    try {
        [IO.File]::WriteAllText($messagePath, $Message, [Text.UTF8Encoding]::new($false))
        git -c i18n.commitEncoding=utf-8 commit -F $messagePath
        if ($LASTEXITCODE -ne 0) { throw '커밋 실패' }
    } finally {
        if (Test-Path -LiteralPath $messagePath) { Remove-Item -LiteralPath $messagePath }
    }
}

git add -- 'docs/superpowers/plans/2026-09-08-native-admin-console-expansion.md' 'docs/superpowers/plans/2026-09-07-native-admin-console.md' 'docs/superpowers/specs/2026-09-07-native-admin-console-design.md'
if ($LASTEXITCODE -ne 0) { throw '설계서 스테이징 실패' }
Invoke-BambiUtf8Commit @'
docs: native 운영자 콘솔 확장 설계와 검증 기준 정리

- PR #306 재사용 범위와 develop 운영자 기능 대응 정의
- 네이티브 문서·이미지 편집과 Android 저장 계약 정리
- 공통 API·Drizzle migration 범위 및 실제 검증 결과 명시
- iOS 저장 구현과 실기기 검증 제외 결정 반영
'@

git add -- apps/native apps/server apps/web packages/api packages/db pnpm-lock.yaml
if ($LASTEXITCODE -ne 0) { throw '구현 파일 스테이징 실패' }
git diff --cached --stat
Invoke-BambiUtf8Commit @'
feat(native): 운영자 콘솔 업무와 네이티브 편집 기능 확장

- PR #306 검수·신고·사용자 셸에 더보기와 운영 업무 연결
- 공고·회원·쪽지·포인트·광고·결제·포인트몰 관리 추가
- 게시판·고객센터·수집·팝업·사이트 설정 및 매뉴얼 연결
- 기존 문서 구조를 보존하는 선택 서식 편집과 이미지 편집 추가
- Android 시스템 파일 저장·일괄 처리·감지 문구 강조 보완
- 접속 상태 및 수집 편집 API와 0115·0116 migration 반영
- 타입 검사·순수 테스트·린트·Android 번들 검증
'@

git log -2 --format=%B
git push -u origin feat/native-admin-console-expansion
if ($LASTEXITCODE -ne 0) { throw '푸시 실패' }
```

사용자가 추가로 수정한 파일이 있다면 스테이징 내역에서 포함 범위를 확인한다. PR 생성은 별도 요청 후에만 진행한다. 이슈 번호를 임의로 만들지 않으며 최종 병합은 동기가 담당한다.

## 17. 2026-09-09 구현 대응 및 검증

사용자 결정에 따라 이번 완료 기준은 코드 구현과 자동 검증이다. iOS 저장 구현·검증 및 Android 실기기 검증은 제외한다. 자동 검사를 기기에서의 동작 확인으로 표현하지 않는다.

| Task | 실제 구현 대응 |
|---|---|
| 1 | PR #306 패치, 사유/제재 Dialog pending 방어, 경고 철회 라벨, 대상별 신고 후속 종료 재시도 |
| 2 | 0115 사용자 접속·0116 수집 편집의 API/DB/Server/Web/Native 의존성 |
| 3 | 더보기의 웹 업무 그룹·운영 요약·최대 50건 일괄 처리·실패 항목 선택 유지 |
| 4 | 공고 상태·기간·대기열·삭제·기존 NativeJobFormScreen 수정 및 본문 감지 문구 강조 |
| 5 | 신고 상세·채팅·첨부·면접·조치 후속 처리 |
| 6 | 사용자 필터/정렬·접속·상세·가계정, 쪽지 대상 선택/작성/발송 이력/읽음 상태 |
| 7 | 업소·팀 승인/반려, 기존 인가 API를 통한 서류 열람·저장·삭제 |
| 8 | 출석·회원 원장·등급 기준·등급/GIF·상한·포인트 설정·댓글 보너스·마일스톤 |
| 9 | 광고 위치/상품·가격/기간 할인·결제/일괄 처리·디자인 제작·포인트몰 상품/주문 |
| 10 | 게시물 조치·게시판 편집/배치/아이콘·후기·금칙어 |
| 11 | 문의 답변·FAQ 리치 등록/수정·문의 채팅·원본 매뉴얼 자산/목차 |
| 12 | 수집 설정·노출/상한·회차·CSV·업종·선택 삭제/복구·글/댓글 revision·이미지 편집 |
| 13 | 팝업 개수·유형·이미지/글·기간·대상·활성·Dialog 미리보기·revision 저장 |
| 14 | 노출/회전·푸터·연락처·계좌·문의 공지·탈퇴 보존/파기·최저임금 |

### 실제 파일 구성

- 기존 3탭은 유지하고 더보기를 추가했다. 포인트 업무는 `points.tsx`와 `points/members/[id].tsx`, 광고·결제는 `commerce.tsx`의 업무별 컴포넌트로 구성했다. 메뉴별 쿼리 파라미터로 해당 업무 탭에 진입한다.
- `content-document.ts` / `content-document-editor.tsx`: 문단 선택 범위의 굵게·기울임·취소선·링크, 제목/인용/코드/목록·이미지 URL, 이동/삭제/실행 취소. 알 수 없는 기존 노드와 속성을 보존한다. 글자 크기는 웹처럼 팝업 글에서 켠다.
- `image-document-editor.tsx` / `image-crop-selection.tsx`: 이미지 삽입·복수 선택·복사/붙여넣기·상하 이동·크기·터치 자르기·실행 취소·저장. 웹 순수 함수는 `bambi-crawled-image-editor.ts`로 공용화했다.
- `popup-preview.tsx` / `popup-date-time-picker.tsx`: 현재 편집본을 네이티브 Dialog로 표시하고 한국 시간으로 날짜를 선택한다.
- `managed-file.ts`: SDK 56 `Directory.pickDirectoryAsync()`와 SAF `Directory.createFile()`/`File.write()`를 사용한다. 선택한 폴더 URI를 SecureStore에 보관하고, 취소/실패를 성공으로 표시하지 않으며 존재 및 바이트 크기를 검사한다. Expo SDK 56 `expo-intent-launcher`의 `ACTION_CREATE_DOCUMENT`가 결과 URI 대신 `Intent {...}` 문자열을 반환하는 실제 기기 문제를 피한다.
- `use-unsaved-changes.ts` 및 화면별 초안 상태: 이탈·재조회 대응. 신고는 대상별로 후속 종료 상태를 분리해 제재를 중복 실행하지 않는다.
- 기존 Expo 56·HeroUI Native·Uniwind를 유지하며 새 WebView를 추가하지 않았다. 추가 Expo 모듈은 file-system·asset·intent-launcher다.

파일 저장 근거: [Expo SDK 56 IntentLauncher](https://docs.expo.dev/versions/v56.0.0/sdk/intent-launcher/), [Android 문서 생성 계약](https://developer.android.com/training/data-storage/shared/documents-files). 설치된 SDK Android 파일 쓰기 구현도 확인했다. 실기기 검증을 대신하지 않는다.

### 자동 검증 기록

- Native Vitest: 44파일 405건 통과. 선택 서식·기존 노드 보존·목록 전환/삭제·줄바꿈·서식 토글, 이미지 표시/자르기 배치 보존, 게시물 일괄 처리, 신고 후속 처리 재시도, Android 저장 성공/취소/쓰기 실패/길이 불일치 포함.
- Web 공용 정책: 6파일 48건 통과(이미지 편집·팝업 대상·광고 노출/카탈로그·CSV·매뉴얼 파싱).
- API 순수 서비스: 4파일 21건 통과(운영 라벨·접속 상태·수집 문서 정책·일괄 처리).
- Native·API·Server·Web 타입 검사 최종 통과. API·Web 공용화 후 strict-null 오류도 수정했다. Web의 정적 이미지 타입 오류는 누락됐던 Next 생성 타입을 `pnpm --filter web exec next typegen`으로 생성한 뒤 해소됐다.
- 변경 TS/TSX/JS 168파일을 목록 기반으로 나눠 Ultracite 검사했다. 전체 통과했으며 호환 재수출·포맷 오류도 정리했다.
- 최종 Android export 통과: `pnpm --filter native exec expo export --platform android --output-dir .expo/admin-verification`. 3,160개 모듈과 원본 매뉴얼을 포함한 Hermes 번들을 생성했다. 실기기 실행 검증은 수행하지 않았다.
- migration 0115·0116 SQL/snapshot은 origin/develop blob과 일치하며 journal의 117개 idx/tag 중복이 없다.
- 연결된 DB의 `drizzle.__drizzle_migrations`를 `default_transaction_read_only=on` 연결에서 조회했다. 0115·0116 SQL 해시가 적용 이력에 존재한다. 각각 기록의 created_at은 1788485862448, 1788497179795다. migration 적용이나 데이터 변경은 실행하지 않았다.
- 최신 확인한 origin/mobile 및 HEAD는 `64c110185d22c761697a949906133c184c4bf549`다.

### 제외·미실행

- iOS 저장 구현·검증, Android 실기기/에뮬레이터 UI 검증: 사용자 제외 결정.
- 실제 migration 적용 및 DB 변경 통합 테스트: 격리 DB 미구성으로 미실행. 공유 DB의 설정·계정·콘텐츠를 바꾸는 테스트는 실행하지 않았다. `crawled-community-edit.test.ts`는 환경변수 부재로 수집 전 중단됐으며 통과 수에 포함하지 않았다.
- 실제 운영 데이터의 쪽지 발송·포인트 지급·승인·삭제·수집·개인정보 파기는 실행하지 않았다.
- 커밋·푸시·이슈/PR 생성·병합은 사용자/동기 수행 범위다.

## 18. 재대조에서 발견해 보완한 세부 항목

앞선 완료 표기는 화면과 API 연결 유무에 치우쳐 있었으므로 설계의 세부 요구사항과 웹 처리 코드를 다시 대조했다. 아래 내용은 그 과정에서 실제로 수정한 누락·불일치다.

| 설계 항목 | 발견한 차이 | 보완 |
|---|---|---|
| Task 3 요약 이동 | 목록만 열고 해당 필터를 적용하지 않음 | 검수 전체·미처리 신고·경고 회원 필터 연결, 수동 필터 변경 시 요청 파라미터 정리 |
| Task 8 출석 필터 | 검색만 있고 역할/출석 정렬 없음 | 역할·최근/미출석/누적/월별 정렬 및 대상 변경 시 조정 초안 초기화 |
| Task 8 포인트 상한 | 기존 값을 입력에 채우지 않아 빈 입력 저장이 상한 해제로 이어질 수 있음 | 저장값 표시, 실제 입력 변경 및 조회 성공 후 저장 허용 |
| Task 9 광고 순서·할인 | 정렬값 입력만 있고 전용 순서 동작 없음, 할인 선택 우선순위가 웹과 다름 | 기존 reorder API 연결, 웹 `selectEditableAdCampaign` 공용화·재사용 |
| Task 10 게시물 | 게시판 필터·선택 일괄 조치 누락, 전체 본문에 JSON 노출 가능 | 필터·숨김/복구/삭제·선택 영구 삭제 연결, 실패 항목만 유지, 본문 뷰어 재사용 |
| Task 5 첨부 | PDF 저장만 있고 이미지 저장 없음 | 이미지 확대 화면의 저장 버튼·쓰기 중 중복 동작 방어 |
| Task 11 문의·FAQ | 문의자 일부 정보, FAQ 파일 업로드·이미지 전용 답변 누락 | 기존 조회 필드 표시, 기존 업로드 API 연결, 업로드 중 저장 방어·이미지만 있는 답변 허용 |
| Task 11 매뉴얼 | 본문 링크·강조가 Markdown 원문으로 남음 | 내부 앵커 이동·안전한 외부 링크·강조·코드 표시 |
| Task 12 수집 | 즉시 수집이 저장된 종류만 사용, 글 상태 필터 누락 | 현재 선택한 종류/게시판을 즉시 실행 입력으로 전달, 노출/내린 글 필터 |
| Task 12 이미지 | 축소 너비와 offset을 표시하지 않음, 자르기 후 배치 초기화 | 웹 표시 폭/비율/위치 적용, 웹의 자르기 후 크기/위치 보존 규칙 및 회귀 테스트 |
| Task 12·13 원본 | 이미지 삽입 시 불필요한 재인코딩, 팝업 실행 취소 때 원본 참조 손실 가능 | 선택 원본 바이트 보존, 이미지 자산별 원본 참조 유지 |
| Task 13 팝업 | 개수 감소 범위 미표시, 여러 편집본 순서 미리보기·충돌 후 재로드 없음 | 실제 삭제 슬롯 표시, 현재 초안 순서 미리보기, 확인 후 최신 저장본 로드 |
| Task 12·13 재조회 | 재조회 실패 시 편집 화면이 사라질 수 있음 | 기존 초안 유지, 명시적 재로드 성공 시에만 교체 |
| §10 문서 편집 | 이력 무제한, 지원하지 않는 인라인 요소 안내 없음, 줄바꿈·서식 재누름·이미지 조작 부족 | 설치된 Tiptap 이력 상한 100 적용, 보존 안내, hardBreak/코드 개행 구분, 서식 토글, 이미지 이동·삭제 |
| Task 14 설정 | 한 섹션 실패가 전체 화면을 가림, 파기 후 실행 시각 갱신 누락 | 섹션별 실패/재시도 격리, 회원 정책 캐시 갱신 |

쪽지의 파일 업로드 비활성화, 기존 조회 상한, 운영자 전용 권한, 일반 사용자 화면/기기 푸시 제외 범위는 유지했다. 이번 결과는 코드와 자동 검증 범위이며, 실제 기기·운영 데이터 조작을 검증했다는 뜻이 아니다.
