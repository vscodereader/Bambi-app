# 2026-09-10 신규 PR #379~#385

6개 기능 PR과 1개 구현 보류 문서 PR이며 모두 mobile 대상 Open임. 테스트 수치는 PR 작성자의 검증 기록으로 이번 문서화에서 재실행하지 않음.

## [#379 feat(native): 구직자 수다방 전체 기능 연결](prs/379.md)

Closes #372

## 요약

mobile의 수다방 준비 화면을 게시판 탐색·글·댓글 상호작용과 게스트·법률자문·수집 게시글을 지원하는 Expo SDK 56 화면으로 교체합니다.

- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-community-design.md`

## 주요 변경

- 홈 수다방 미리보기와 게시판 허브·검색·필터·페이지네이션 구현
- 게시글 문서 편집·이미지 업로드와 생성·상세·수정·삭제 연결
- 댓글·답글 CRUD, 추천·신고, 비밀글·익명·게스트 작성 지원
- 법률자문·남성·미인증·정지 계정의 게시판 권한 적용
- 수집 게시글 상세와 커뮤니티 알림 착지 경로 추가
- 일반 구직자의 공지 작성 노출과 미인증 계정 범용 오류를 Android AVD QA에서 수정

## 검증

- Android Studio AVD / Expo Go: 홈 미리보기, 게시판, 검색, 글 CRUD, 추천, 댓글·답글, 신고, 남성·미인증 권한 확인
- `pnpm --filter native test`: 39 files / 395 tests 통과
- `pnpm --filter native check-types` 통과
- `pnpm check` 통과
- `git diff --check` 통과

## 주의사항

- DB migration과 신규 native 의존성은 없습니다.
- 공유 개발 DB 기반 community 통합 테스트 일부는 기존 `board_key`·픽스처 잔존과 충돌하며 상세 결과를 설계서에 기록했습니다.
- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.

## [#380 feat(native): 구직자 고객센터와 상담 채팅 연결](prs/380.md)

Closes #373

## 요약

구직자 mobile에 FAQ, 문의 글과 추가 답변, 회원·비회원 1:1 상담 채팅을 추가합니다. 최신 develop의 support 계약과 문구를 공유하고 UI만 Expo SDK 56, HeroUI Native, Uniwind로 구현했습니다.

- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-support-design.md`

## 주요 변경

- 고객센터 홈과 FAQ 목록·펼침 구현
- 문의 작성·목록·상세·추가 답변과 상태 표시 연결
- 회원 상담방 목록·상세·메시지·읽음 처리 구현
- 비회원 HMAC 상담 세션 endpoint와 SecureStore 토큰 수명주기 추가
- 문의 문서 편집·이미지 업로드와 markdown 이용 가이드 지원
- 문의·문의 채팅 알림의 native 착지 경로 추가

## 검증

- Android Studio AVD / Expo Go: 문의 작성·목록·상세·추가 답변, 회원 상담, 비회원 상담 메시지 왕복 확인
- `pnpm --filter native test`: 39 files / 393 tests 통과
- `pnpm --filter native check-types` 통과
- `pnpm check` 통과
- `git diff --check` 통과

## 주의사항

- `expo-asset`, `expo-file-system` SDK 56 호환 의존성과 lockfile 변경이 포함됩니다.
- DB migration은 없습니다.
- 개발 DB에 공개 FAQ가 없어 AVD에서는 빈 상태를 확인했고 FAQ 변환·표시 규칙은 자동 테스트로 검증했습니다.
- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.

## [#381 feat(native): 구직자 공고 탐색과 포인트 기능 확장](prs/381.md)

Closes #374

## 요약

구직자 mobile 홈에 최신 develop의 프리미엄 배너, 고급 공고 필터, HIT와 포인트 공고 보상 흐름을 연결합니다.

- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-marketplace-points-design.md`

## 주요 변경

- 프리미엄 배너 3개 슬롯과 실제 소재·문의 폴백·링크 처리
- 지역·세부지역·업종·최소 시급·인증·당일면접·초보 필터와 초기화 구현
- 순수·수집 공고 API에 선택 boolean 필터 연결
- 유료 공고 성과 기준 HIT 표시와 대상 제외 정책 적용
- 포인트 공고 보상 상태·수령·중복·쿨다운 처리
- 보유 혜택의 적용 가능 공고 선택과 최종 확인 흐름 연결

## 검증

- Android Studio AVD / Expo Go: 배너 실제 소재·빈 슬롯 폴백 확인
- 고급 필터 적용 결과 57→2건, 초기화 후 2→57건 확인
- 포인트몰 0P와 50,000P 상품의 잔액 부족 상태 확인
- `pnpm --filter native test`: 39 files / 384 tests 통과
- `pnpm --filter native check-types` 통과
- `pnpm check` 통과
- `git diff --check` 통과

## 주의사항

- DB migration과 신규 의존성은 없습니다.
- 개발 DB에 HIT·공고 보상 대상 데이터가 없어 해당 경계·중복 수령·쿨다운은 자동 테스트로 검증했습니다.
- 공고 조회 API 입력이 확장되지만 기존 호출은 기본값으로 동일하게 동작합니다.
- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.

## [#382 feat(native): 구직자 공고 상세와 후기 열람 안전 흐름 연결](prs/382.md)

Closes #375

## 요약

구직자 공고 상세에 인증 연락처, 채팅 사전 안전 확인, 후기 목록과 포인트 열람을 추가하고 후기 차감의 잔액 부족·중복 요청을 안전하게 처리합니다.

- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-job-detail-design.md`

## 주요 변경

- 공고 메타데이터·등록자·후기 평균과 건수 표시
- 인증 구인자 전화번호 노출과 Android 전화 앱 연결
- 로그인·구직자 프로필·휴대폰 인증·공고 상태의 채팅 사전 확인 화면 추가
- 후기 목록·페이지네이션·익명 표시와 내 후기 무료 열람 구현
- 타인 후기 포인트 확인창과 본문 잠금 해제 연결
- 원장 잔액 부족을 사용자 BAD_REQUEST 문구로 변환
- 사용자·후기별 external key와 음수 거래 중복 검사로 재차감 방지

## 검증

- Android Studio AVD / Expo Go: 인증 연락처·전화 앱, 사전 확인 4단계, 채팅방 생성 확인
- 익명 후기·별점·10P 확인창과 0P 잔액 부족 문구 확인
- 첫 열람 후 0P, 앱 재실행 뒤 같은 후기 재열람 후에도 0P 유지 확인
- `pnpm --filter native test`: 39 files / 384 tests 통과
- `pnpm --filter native check-types` 통과
- 변경 파일 Ultracite와 `git diff --check` 통과

## 주의사항

- DB migration과 신규 의존성은 없습니다.
- API 후기 DB 테스트는 공유 개발 DB의 면접 상태·후기 unique 잔존·공고 인증 시드 충돌로 5건 중 1건 통과했습니다. 수정된 잔액 부족과 중복 열람 경로는 AVD에서 실제 API 왕복으로 재검증했습니다.
- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.

## [#383 feat(native): 구직자 채팅 상태와 면접 정보 동등성 구현](prs/383.md)

Closes #376

## 요약

구직자 mobile 채팅에 최신 develop의 상대 접속 상태·평균 응답시간, 면접 확인 정책과 공고·면접 정보 패널을 연결합니다.

- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-chat-parity-design.md`

## 주요 변경

- 사용자 presence lifecycle과 server SSE·Socket.IO 상태 전파 구현
- 온라인·오프라인·실시간 연결·평균 응답시간 표시
- 차단·탈퇴·나간 방에서 presence와 응답 정보 차단
- 면접 및 연락처 공개에 공통 확인창 적용
- 확인·거절·우상단 닫기·Android back과 중복 실행 방지 정책 반영
- 공고·면접 정보 패널과 공고 이동·인증 연락처 구현
- 사용자 presence, 수집 게시판 편집 정본, 채팅 응답 활동 migrations 0115~0117 포함

## 검증

- Android Studio AVD / Expo Go: 빈 방 숨김, 메시지 송신, 읽지 않음, 오프라인·대화 가능·실시간 연결 확인
- 정보 패널의 공고·면접·연락처와 면접 거절·확정 확인
- `pnpm --filter native test`: 38 files / 384 tests 통과
- presence·응답시간 서비스: 2 files / 13 tests 통과
- `pnpm --filter native check-types` 통과
- `pnpm --filter @bambi-app/db exec drizzle-kit check` 통과
- `pnpm check`, `git diff --check` 통과

## 주의사항

- 운영 DB에 Drizzle migration 0115, 0116, 0117을 순서대로 적용해야 합니다. `db:push`는 사용하지 않습니다.
- server realtime/presence와 lockfile 변경이 포함됩니다.
- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.

## [#384 feat(native): 구직자 계정 상태와 이용 안내 경험 구현](prs/384.md)

Closes #377

## 요약

구직자 mobile에 계정 경고·정지 안내, 5단계 이용 안내와 3단계 코치마크, 사용자용 메인 팝업을 추가합니다.

- 설계·검증: `docs/superpowers/plans/2026-09-10-native-seeker-account-experience-design.md`

## 주요 변경

- 경고 배너 닫기·제재별 재노출과 정지 사유·이의 신청 안내 구현
- 닫을 수 없는 정지 배너와 제한 상태 우선 표시
- 5단계 이용 안내의 이전·다음·스와이프·건너뛰기·완료 구현
- 완료 뒤 3단계 기능 코치마크와 설정의 다시 보기 연결
- 메인 팝업 역할·화면·기간·순서·닫기·링크·24시간 숨김 구현
- SecureStore 허용 문자 키와 비동기 저장·조회 적용
- 키 형식 회귀 테스트 추가

## 검증

- Android Studio AVD / Expo Go: 팝업 2건 순서 노출과 각각의 24시간 숨김·재실행 미노출 확인
- 경고 닫기 영속성과 정지 배너 지속 노출 확인
- 5단계 안내와 3단계 코치마크 전체 조작 및 완료 저장 확인
- `pnpm --filter native test`: 39 files / 388 tests 통과
- `pnpm --filter native check-types` 통과
- `pnpm check`, `git diff --check` 통과

## 주의사항

- DB migration과 신규 의존성은 없습니다.
- 기존 잘못된 `:` SecureStore 키는 저장 단계에서 거부됐으므로 별도 데이터 migration은 필요하지 않습니다.
- 이 PR은 최신 `origin/mobile`에서 독립 분기했으며 다른 구직자 PR에 의존하지 않습니다.

## [#385 docs(native): 원격 푸시 알림 구현 보류 조건 정리](prs/385.md)

Closes #378

## 요약

Expo 계정·프로젝트와 Android FCM·iOS APNs 자격이 준비되지 않아 보류한 원격 푸시 알림의 구현 범위, 재개 조건과 검증 계획을 문서로 고정합니다.

- 보류 설계: `docs/superpowers/plans/2026-09-10-native-push-notifications-design.md`

## 주요 변경

- 현재 foreground SSE 알림과 원격 푸시 전달 계층의 경계 정리
- Expo SDK 56·expo-notifications 기반 권한·토큰 수명주기 계획
- 서버 토큰 저장·발송 실패 격리·invalid token 처리 계획
- foreground·background·cold start 딥링크와 badge 동기화 계획
- Drizzle migration과 Expo·FCM·APNs secret 관리 원칙 정리
- 다른 구직자 브랜치에 의존하지 않는 재개 방식 명시

## 검증

- 설계 문서 외 코드·의존성·DB·API·server 변경 없음 확인
- 최신 `origin/mobile` 기준 독립 브랜치와 원격 동기화 확인

## 주의사항

- 이 PR은 기능을 활성화하지 않는 보류 문서 PR입니다.
- Expo projectId, FCM, APNs 자격과 build profile이 준비되기 전에는 구현하지 않습니다.
- DB migration 및 배포 영향은 없습니다.

