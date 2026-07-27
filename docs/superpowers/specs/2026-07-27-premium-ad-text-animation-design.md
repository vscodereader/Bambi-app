# 프리미엄 광고 텍스트 애니메이션 배너 설계

- 날짜: 2026-07-27
- 브랜치: `feat/premium-ad-text-animation`
- 상태: 설계 확정

## 배경

프리미엄 광고 배너는 지금 구인자가 올린 이미지 한 장을 슬롯에 그대로 깔아 보여준다.
구인자는 배너 디자인을 직접 만들어 와야 하고, 문구를 고치려면 이미지를 다시 만들어야 한다.
빈 슬롯을 채우는 "광고 등록 문의" 자리표시도 전화번호가 박힌 PNG라 번호가 바뀌면 이미지를
다시 그려야 한다.

이 작업은 배너에 **문구 + 텍스트 애니메이션 + 테마 프리셋**을 얹어, 구인자가 이미지를
직접 디자인하지 않아도 움직이는 배너를 만들 수 있게 한다. 자리표시도 같은 엔진을 쓰는
컴포넌트로 바꿔 전화번호를 운영자가 설정할 수 있게 한다.

## 현재 구조

| 층 | 위치 | 하는 일 |
| --- | --- | --- |
| 저장 | `job_post_media` (`usage = ad_horizontal` 7:3 / `ad_vertical` 4:9) | 배너 이미지 각 1장, GCS 업로드 |
| 검증 | `lib/bambi/job-ad-banner-spec.ts`, `bambi-job-media-policy.ts` | 매직넘버·비율(±15%)·최소크기 |
| 노출 | `services/bambi-ad-exposure.ts` `groupAdBannerJobs` | 프리미엄 풀을 8칸 링에 얹어 로테이션 (상단 2·좌 3·우 3) |
| 렌더 | `components/bambi/ad-banner.tsx` | `HorizontalAdBanner`(7:3) / `AdBanner`(4:9) / `AdSlotPlaceholder` |
| 등록 | `components/bambi/job-post-media-uploader.tsx` | 상품의 `previewTemplate`에 따라 업로드 칸을 연다 |

실제 표시 크기는 가로형이 그리드 한 칸 폭(`sizes` 힌트 272px), 세로형이 `h-52`(208px) 고정에
4:9라 **폭이 약 92px**이다. 이 폭 제약이 세로형 설계를 좌우한다.

## 결정 사항

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 이미지와의 관계 | 이미지를 배경으로 깔고 그 위에 텍스트를 얹는다 | 이미지 업로드·검증 파이프라인을 그대로 쓰고, 텍스트가 없으면 지금과 동일하게 렌더되어 기존 공고 마이그레이션이 필요 없다 |
| 애니메이션 구현 | `motion` 의존성 1개 추가 | React Bits 텍스트 애니메이션 대부분이 `motion/react`를 쓴다. 배너 오버레이를 지연 로드해 광고 없는 페이지엔 번들이 실리지 않게 한다 |
| 커스터마이즈 범위 | 문구 + 애니메이션 5종 + 테마 프리셋 4종 | 색을 자유 지정하면 대비가 무너진 읽을 수 없는 배너가 나온다. 프리셋으로 가독성 하한을 보장한다 |
| 세로형 | 표시 크기 유지, 세로 전용 짧은 문구(8자) | 우측 레일 폭을 키우면 마켓플레이스 레이아웃 전체가 흔들린다 |
| 자리표시 | PNG → 컴포넌트, 전화번호는 운영자 설정 | 번호가 이미지에 박혀 있어 바꾸려면 PNG를 다시 만들어야 한다 |

## 데이터 모델

마이그레이션 `0039` 하나에 아래를 담는다.

### `job_post` 컬럼 5개 (전부 nullable)

| 컬럼 | 타입 | 제한 | 용도 |
| --- | --- | --- | --- |
| `ad_banner_headline` | text | ≤20자 | 가로형 메인 문구 |
| `ad_banner_subline` | text | ≤30자 | 가로형 보조 문구 |
| `ad_banner_vertical_text` | text | ≤8자 | 세로형 전용 문구 |
| `ad_banner_animation` | `ad_banner_animation` enum | — | 애니메이션 종류 |
| `ad_banner_theme` | `ad_banner_theme` enum | — | 오버레이 테마 |

`ad_banner_headline`이 null이면 오버레이를 렌더하지 않는다. 기존 프리미엄 공고는 전부
null이므로 지금과 똑같이 이미지만 나온다 — **데이터 마이그레이션이 없다.**

슬롯별 렌더 판정을 명시한다.

- 가로형 슬롯: `ad_banner_headline`이 있으면 오버레이, 없으면 이미지만
- 세로형 슬롯: `ad_banner_vertical_text`가 있으면 오버레이, 없으면 이미지만.
  헤드라인을 잘라 쓰지 않는다 — 20자를 8자 폭에 우겨넣으면 잘린 문구가 노출된다
- `ad_banner_animation`이 null이면 애니메이션 없이 정적으로 렌더한다.
  폼에서는 항상 하나를 고르게 하지만, 렌더는 null을 정상 입력으로 받는다
- `ad_banner_theme`이 null이면 `dark`로 렌더한다

별도 테이블이 아니라 컬럼인 이유: 공고당 정확히 1행이라 조인을 늘릴 이유가 없다.
jsonb가 아니라 컬럼인 이유: enum 검증과 drizzle 타입을 DB 레벨에서 받는다.

### `bambi_site_settings` 컬럼 1개

| 컬럼 | 타입 | 용도 |
| --- | --- | --- |
| `ad_inquiry_tel` | text, null | 자리표시에 노출할 광고 등록 문의 전화 |

폴백 체인은 `adInquiryTel` → `tel`(고객센터) → `BAMBI_COMPANY.tel`이다. 운영자가 따로
설정하지 않으면 지금 푸터에 쓰는 번호가 그대로 나온다.

## 애니메이션 카탈로그

`apps/web/src/lib/bambi/ad-banner-animations.ts`를 단일 소스로 두고 서버 zod enum과 값을
1:1로 맞춘다. 기존 `ad-preview-templates.ts`가 서버 `AdPreviewTemplate`과 값을 맞추는
방식을 그대로 따른다.

| 값 | 라벨 | React Bits 원본 | 의존성 |
| --- | --- | --- | --- |
| `blur-in` | 블러 등장 | BlurText | motion |
| `decrypt` | 해독 효과 | DecryptedText | motion |
| `typing` | 타이핑 | TextType | 없음 |
| `shiny` | 반짝임 | ShinyText | CSS만 |
| `gradient` | 그라디언트 | GradientText | CSS만 |

DB enum 값을 화면에 그대로 노출하지 않도록 `AD_BANNER_ANIMATION_LABELS` 맵을 함께 둔다.

React Bits 컴포넌트는 npm 패키지가 아니라 소스를 복사해 오는 방식이므로, 가져온 뒤
프로젝트 규칙(Tailwind 전용, 인라인 style 금지, `cn()` 사용)에 맞게 다듬어 넣는다.

## 테마 프리셋

이미지 위에 텍스트를 얹으므로 가독성 확보용 스크림(scrim)이 핵심이다. 강도는 프리셋마다
고정한다.

| 값 | 라벨 | 구성 |
| --- | --- | --- |
| `dark` | 어두운 오버레이 | 어두운 스크림 + 흰 글자 (기본값) |
| `light` | 밝은 오버레이 | 밝은 스크림 + 잉크 글자 |
| `coral` | 코럴 그라디언트 | 코럴 그라디언트 스크림 + 흰 글자 |
| `none` | 오버레이 없음 | 스크림 없이 텍스트 섀도만 |

`AD_BANNER_THEME_LABELS` 맵을 함께 둔다.

## 렌더

`components/bambi/ad-banner-text-overlay.tsx` 하나가 세 가지 variant를 담당한다.

- `horizontal` — 헤드라인 + 서브라인, 기존 `HorizontalAdBanner`의 이미지 위 absolute
- `vertical` — 세로 전용 문구, `writing-mode: vertical-rl` 세로쓰기로 92px 폭에 흘린다
- `placeholder` — "광고 등록 문의" + 운영자 설정 전화번호, 애니메이션은 `shiny` 고정

규칙:

- `motion`은 `next/dynamic`으로 지연 로드한다 — 광고가 없는 페이지엔 번들이 실리지 않는다
- `prefers-reduced-motion`이면 애니메이션 없이 최종 상태로 정적 렌더한다
- 화면에 최대 8칸이 동시에 뜨므로 IntersectionObserver로 뷰포트 진입 시 1회만 재생한다
  (React Bits 기본 동작)
- 오버레이는 `pointer-events-none` — 아래 깔린 공고 상세 링크가 그대로 동작한다

### 자리표시 컴포넌트화

`AdSlotPlaceholder`의 `<Image>`를 걷어내고 코럴 배경 + 확성기 아이콘 + "광고 등록 문의" +
전화번호를 DOM으로 렌더한다.

- 전화번호는 `siteSettings.getFooter`(이미 `publicProcedure`)로 읽는다. 푸터가 모든
  페이지에 있어 같은 queryKey의 캐시가 이미 채워져 있으므로 **추가 네트워크 요청이 없다**
- `aria-hidden`과 클릭 불가는 현행을 유지한다. 8칸이 같은 문구를 반복하면 스크린리더
  소음이고, 빈 슬롯이 클릭되면 실제 광고 배너와 혼동된다
- 현재 자리표시 PNG는 LCP로 잡혀 `loading="eager"`로 로드 중인데, DOM 렌더가 되면 그
  부담 자체가 사라진다
- `public/bambi/placeholder/*.png` 2개를 삭제한다
- 세로형 PNG는 4:9로 그려졌지만 실제 폭이 92px이라 `object-cover`에 눌려 번호가 잘리고
  있었다. 컴포넌트는 실제 폭에 맞춰 흐르므로 잘리지 않는다

호출부 3곳(`ad-banner.tsx`의 레일 2종, `premium-ad-banner-section.tsx`,
`visual-job-exposure-sections.tsx`)은 모두 `AdSlotPlaceholder` 하나만 부르므로 내부만
갈아끼우면 된다.

## 등록 폼

`components/bambi/ad-banner-text-fields.tsx`를 새로 만들어 배너 업로드 슬롯 바로 아래에
붙인다.

- 프리미엄 상품을 골랐을 때만 노출한다 — `getAdBannerUsagesForPreviewTemplate` 재사용
- 문구 입력(헤드라인·서브라인·세로 전용) + 애니메이션 `ToggleGroup` + 테마 `ToggleGroup`
- **실시간 미리보기**: 실제 렌더 컴포넌트를 그대로 써서 가로형·세로형을 나란히 보여준다.
  업로드한 이미지의 `previewUrl`을 배경으로 깔아 실제와 같은 화면을 만든다
- 모바일에서는 미리보기 2종을 세로로 쌓는다

## 서버

- `jobPostInputShape`(`routers/bambi/jobs.ts`)에 5개 필드를 추가한다. 길이 제한과 enum을
  서버에서 검증한다 — 트러스트 바운더리다
- 프리미엄 상품이 아닌 공고가 배너 문구를 보내면 정규화 단계에서 버린다
- `hasRiskFlags`가 보는 텍스트에 배너 문구를 합류시킨다. 금칙어·위험어가 들어간 배너
  문구는 검수 플래그로 잡힌다
- 배너 목록 쿼리에서 새 컬럼을 select 해 `AdBannerItem`에 싣는다
  (`lib/bambi/api-job-mapper.ts`)
- `siteSettings`: `FOOTER_COLUMNS`와 `updateFooterInput`에 `adInquiryTel`을 추가한다.
  의미상 푸터 전용은 아니지만, 이미 공개 조회이고 캐시가 공유되므로 새 라우터를 만들지
  않는다

## 운영자 화면

`/moderator/site-settings` 사이트 정보 폼에 **"광고 등록 문의 전화"** 입력칸을 고객센터
전화 바로 아래에 추가한다. placeholder로 현재 폴백값을 보여줘 미설정 시 무엇이 나가는지
알 수 있게 한다.

## 테스트

| 대상 | 검증 |
| --- | --- |
| `ad-banner-animations.test.ts` | 카탈로그 값 ↔ 서버 zod enum 1:1, 라벨 맵 누락 없음 |
| `api-job-mapper.test.ts` | `toAdBannerItem`이 텍스트 유/무를 모두 옳게 싣는다 |
| `jobs.ts` 서버 테스트 | 문구 길이 초과·잘못된 enum 반려, 무료 공고의 배너 문구 폐기 |
| 금칙어 | 배너 문구의 위험어가 `hasRiskFlags`에 잡힌다 |
| 자리표시 | `adInquiryTel` 미설정 시 `tel` → `BAMBI_COMPANY.tel` 폴백 |

검증은 `pnpm check-types`와 관련 테스트만 돌린다. 개발 서버 기동·스크린샷은 하지 않으며
시각 확인은 사용자가 한다.

## 범위 밖

- 텍스트만으로(이미지 없이) 배너를 만드는 것 — 배경은 이미지가 맡는다
- 자리표시 전화번호의 `tel:` 링크 — 빈 슬롯은 계속 클릭 불가 장식이다
- native 앱 — 프리미엄 배너는 web에만 렌더된다
- 기존 판매된 프리미엄 공고의 배너 문구 자동 생성

## 파일

**신규**

- `apps/web/src/lib/bambi/ad-banner-animations.ts`
- `apps/web/src/lib/bambi/ad-banner-animations.test.ts`
- `apps/web/src/components/bambi/ad-banner-text-overlay.tsx`
- `apps/web/src/components/bambi/ad-banner-text-fields.tsx`
- React Bits에서 가져온 애니메이션 컴포넌트 (`components/bambi/text-animations/`)
- `packages/db/src/migrations/0039_*.sql`

**수정**

- `packages/db/src/schema/bambi.ts`
- `packages/api/src/routers/bambi/jobs.ts`
- `packages/api/src/routers/bambi/site-settings.ts`
- `apps/web/src/lib/bambi/api-job-mapper.ts`
- `apps/web/src/lib/bambi-job-form.ts`
- `apps/web/src/components/bambi/ad-banner.tsx`
- `apps/web/src/components/bambi/job-post-media-uploader.tsx`
- `apps/web/src/app/moderator/site-settings/page.tsx`
- `apps/web/src/app/employer/new/page.tsx`, `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`
- `apps/web/package.json` (`motion` 추가)

**삭제**

- `apps/web/public/bambi/placeholder/horizontal-placeholder.png`
- `apps/web/public/bambi/placeholder/vertical-placeholder.png`
