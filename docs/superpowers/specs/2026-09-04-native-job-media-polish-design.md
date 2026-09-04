# native 공고 소재·폼 마감(상세 디자인 신청·배너 단색 배경·슬라이싱·폼 UX) 설계

- 날짜: 2026-09-04
- 브랜치: `feat/native-job-media-polish` — **`feat/native-recruiter-boost`(PR #297) 위에 스택**. 남은 항목이 `job-exposure-section.tsx`·공고 폼을 건드리는데 #297이 같은 파일을 이미 고쳐 뒀다. #297이 먼저 머지되는 전제다.
- 선행: PR #292(구인자 영역), PR #295(광고·성과·팀), PR #297(끌어올리기·채팅·계좌·임시저장)
- 범위 결정(사용자): 네 항목을 **한 PR**로, 배너는 **단색 배경만**, 슬라이싱은 **`expo-image-manipulator` 추가 허가**

## 1. 배경

PR #292가 이연한 소재 3건(상세 디자인 제작 신청 · 배너 레이아웃 편집 · 슬라이싱 생성)과, #292 UI/UX 라운드에서 미반영으로 남긴 공고 폼 5건을 마무리한다. **서버·DB 변경 없음, 마이그레이션 없음.** 새 의존성은 `expo-image-manipulator` 하나다.

## 2. 상세 디자인 제작 신청

### 2.1 서버 계약(기존)

`packages/api/src/services/bambi-job-detail-design.ts`

- `resolveJobDetailDesign({ expectedAmount, productDetailDesignPrice, ... })` — `not_offered`/`amount_changed`/`completed_locked`/성공(스냅샷)을 판정한다. **가격의 정본은 서버**이며 클라이언트가 보낸 `detailDesignAmount`는 "사용자가 본 가격"의 재확인용이다.
- `sumJobPaymentAmount(exposureAmount, detailDesignAmount)` — 결제 예정 총액.
- `jobs.ts`의 `jobPostInput`: `detailDesignRequested: boolean().optional()`(생략 = 기존 상태 유지), `detailDesignAmount: number().nullish()`.
- 옵션 금액이 바뀌면 결제 상태가 `unpaid`로 되돌아간다(노출 변경과 같은 취급).
- `completed`(운영자가 제작 완료) 건은 상품가 변동과 무관하게 동결된다.

업로드는 없다 — 구인자는 신청만 하고, 완성 이미지는 운영자가 `job-detail-design-dialog.tsx`에서 올린다.

### 2.2 앱에 넣을 것

- 노출 화면(`job-exposure-section.tsx`)에 **상품의 `detailDesignPrice`가 있을 때만** 신청 스위치와 가격을 노출한다. 상품을 바꿔 옵션이 사라지면 선택도 해제한다.
- 결제 예정 총액 표기를 `sumJobPaymentAmount(exposureAmount, detailDesignAmount)`로 바꾼다. 지금은 노출 금액만 보여 준다.
- **수정 화면에도 넣는다.** 현재 `job-update.ts`는 `detailDesignRequested`를 항상 생략해 기존 신청이 보존만 되고 신청·해제가 불가능하다. **사용자가 값을 바꿨을 때만** 두 키를 싣는다(안 바꿨으면 계속 생략해 서버 보존 경로를 탄다).
- `completed` 상태는 잠긴 것으로 표시하고 끄지 못하게 한다(서버가 어차피 거부한다).

## 3. 배너 레이아웃 — 단색 배경

### 3.1 데이터와 보존 규칙

- 저장 위치는 `job_ad_banner_layout`(공고당 1행, `layout` jsonb). `jobs.ts` 입력은 `adBannerLayout`이며 **키 생략 = 보존**, `null` = 삭제다.
- 스키마(`services/bambi-ad-banner-layout.ts`)는 `strict`다. 슬롯마다 `background`·`scrim`·`texts`가 모두 있어야 한다.
- **`getEditableById`가 `adBannerLayout`을 내려준다**(`jobs.ts:2202`). 앱은 그 값을 읽어 **`background`만 바꿔** 되돌려 보낸다 — 웹에서 만든 문구 블록과 스크림이 보존된다. 통째로 새로 만들어 보내면 웹 작업물이 사라진다.
- 레이아웃이 없던 공고는 웹 기본값과 같은 빈 레이아웃으로 시작한다: `scrim { enabled: true, opacity: 65 }`, `texts: []`, 단색 선택 시 기본색 `#1f2937`.

### 3.2 화면

- 가로형(7:3)·세로형(4:9) 각각에 **이미지 / 단색** 선택. 단색이면 색을 고른다.
- 색 선택은 **새 라이브러리 없이** 프리셋 팔레트 + hex 직접 입력으로 한다. 입력은 6자리 hex만 받는다(서버 정규식과 동일, 8자리를 허용하면 웹의 대비 경고가 조용히 꺼진다).
- 문구 블록 편집은 만들지 않는다. 웹에서 만든 블록이 있으면 "문구 N개는 웹에서 편집" 같은 읽기 전용 요약만 보여 준다.

### 3.3 필수 배너 게이트

`ad-exposure.ts`의 `getMissingBannerUsages`가 지금은 레이아웃과 무관하게 두 슬롯 이미지를 모두 요구한다. **단색 배경을 고른 슬롯은 이미지가 필요 없다**(웹 `isAdBannerImageRequired`와 같은 규칙). 판정에 레이아웃을 넘기도록 고친다.

## 4. 상세 이미지 슬라이싱

### 4.1 왜 native에 필요한가

웹의 `detail-image-slicing.ts`는 **안드로이드 RN(Fresco)이 GPU 텍스처 한계를 넘는 비트맵을 다운샘플해 흐려지는 것**을 막으려고 만들었다. 정작 웹에는 필요 없는 로직이고, native가 본래 수요처다.

### 4.2 분할 계획 공유

세로 3500px(`DETAIL_SLICE_MAX_HEIGHT`) 초과 시 균등 분할하는 **계획 함수(`planDetailSlices`)를 `packages/api` 서비스로 올려** 웹·native가 공유한다. 조각을 실제로 만드는 부분만 플랫폼별로 둔다.

- 웹: `createImageBitmap` + canvas (기존 코드 유지, import 경로만 서비스로)
- native: `expo-image-manipulator`의 crop을 계획대로 반복 호출

### 4.3 업로드 계약

- 새 조각 그룹은 `sliceGroupId`(신규 UUID)와 0부터의 `sliceIndex`를 실어 올린다.
- 5장 제한은 **원본 단위**로 센다 — `sliceIndex`가 0이거나 없는 항목만 카운트한다(`bambi-job-media-policy.ts`).
- 삭제는 그룹 단위다. 웹처럼 같은 `sliceGroupId`를 한 항목으로 묶어 보여 주고 함께 지운다.
- 임계값 이하 이미지는 자르지 않고 지금처럼 한 장으로 올린다.

`expo-image-manipulator`는 네이티브 모듈이다 — Expo Go에서 동작하더라도 **자체 dev build·스토어 빌드는 재빌드가 한 번 필요하다.**

## 5. 공고 폼 UX 5건

| 항목 | 현재 | 바꿀 것 |
|---|---|---|
| 제출 실패 시 첫 오류로 이동 | 고정 바에 요약 문구만 | `BambiScreen`의 `scrollViewProps`로 ScrollView ref를 넘기고, 검증 실패 시 첫 오류 필드의 `onLayout` 좌표로 스크롤 |
| 뒤로가기 경고 | 가드 없음 | `expo-router`가 재수출하는 `useNavigation()`의 `beforeRemove` 리스너. **`@react-navigation/native`를 직접 import하지 않는다** — native의 직접 의존성이 아니라 pnpm에서 해석되지 않는다 |
| 급여 천단위·"원" | 순수 문자열 그대로 | state는 숫자 문자열 유지, 표시만 `toLocaleString("ko-KR")`. 라벨/보조 문구에 "원" |
| 상세 설명 | `Input multiline` | heroui `TextArea`로 교체 |
| 섹션 그룹 | 한 `Surface`에 15개가 평면 나열 | 기본정보 / 근무조건 / 이미지 / 부가옵션으로 나눈다. 순서와 로직은 그대로 |

이탈 경고는 **작성 중 내용이 있을 때만** 띄운다. 빈 폼에서 뒤로가기마다 확인창이 뜨면 방해가 된다.

## 6. 테스트

순수 로직만 콜로케이션 vitest로 덮는다.

- 분할 계획: 임계값 이하 → null, 초과 → 균등 분할 개수·오프셋, 최대 조각 수 상한
- 배너 레이아웃 병합: 기존 문구 블록 보존, 없던 공고에 기본값 생성, 단색 슬롯의 이미지 필수 해제
- 상세 디자인: 상품에 옵션이 없으면 선택 해제, 수정 화면에서 "바뀐 경우만 전송" 판정
- 폼: 급여 표시 포맷, 이탈 경고 필요 여부 판정, 첫 오류 필드 선택

화면 렌더 테스트는 만들지 않는다(기존 native 방침).

## 7. 검증과 배포

- `pnpm --filter native check-types`, `npx ultracite check <경로>`, `pnpm --filter native test`, `packages/api`의 `test/services`
- **마이그레이션 없음**, 서버 로직 변경 없음(§4.2의 분할 계획 이동은 동작 무변경)
- 실기기 확인(사용자):
  - 상세 디자인 옵션이 있는 상품에서 신청 → 총액 합산, 수정 화면에서 해제가 실제로 반영되는지
  - 단색 배경을 고른 슬롯이 이미지 없이도 제출되는지, 웹에서 문구를 넣어 둔 공고를 앱에서 저장해도 문구가 남는지
  - 3500px 넘는 상세 이미지를 올렸을 때 조각으로 갈라지고 상세 화면에서 이어져 보이는지, 삭제가 그룹 단위인지 (**재빌드 후**)
  - 필수 항목을 비우고 제출했을 때 첫 오류로 스크롤되는지, 작성 중 뒤로가기에 경고가 뜨고 빈 폼에서는 안 뜨는지
