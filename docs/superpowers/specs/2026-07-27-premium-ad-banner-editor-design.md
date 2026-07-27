# 프리미엄 광고 배너 에디터 설계

- 날짜: 2026-07-27
- 선행 작업: `2026-07-27-premium-ad-text-animation-design.md` (병합 완료)
- 상태: 설계 검토 대기

## 배경

직전 작업으로 프리미엄 광고 배너에 문구·연출·테마를 얹을 수 있게 했다. 다만 입력 형태가
공고 등록 폼 안의 고정 필드 3개(헤드라인·서브라인·세로 전용)였고, 문구 위치는 코드가
정한 자리에 고정이었다. 실제로 써 보니 두 가지가 걸렸다.

- 등록 폼이 이미 길어 배너 설정이 묻힌다
- 문구가 항상 같은 자리에 같은 크기로 나와 광고마다 차별화가 안 된다

이 작업은 배너를 **별도 에디터에서 자유롭게 편집**하게 바꾼다. 구인자는 문구를 여러 개
놓고, 원하는 위치로 끌어다 두고, 크기·색·연출을 각각 고른다. 편집 결과는 고정 컬럼이
아니라 **JSON 레이아웃**으로 저장한다.

## 무엇이 대체되고 무엇이 남는가

| 대상 | 처리 |
| --- | --- |
| `job_post`의 배너 문구·연출·테마 컬럼 5개 | **제거** — JSON 레이아웃으로 대체 |
| `ad_banner_animation`·`ad_banner_theme` pgEnum | **제거** — 값이 4종으로 바뀌고 검증이 zod로 옮겨간다 |
| 폼 내 입력 UI (`ad-banner-text-fields.tsx`) | **제거** — 에디터로 대체 |
| 고정 배치 오버레이 (`ad-banner-text-overlay.tsx`) | **재작성** — 자유 배치 렌더러로 |
| 애니메이션 컴포넌트 (blur·typing) | **재사용** + split·glitch 추가 |
| 대비 계산 근거 | **재사용** — 에디터의 경고 판정에 그대로 쓴다 |
| 자리표시 컴포넌트, 광고 문의 전화 설정 | **그대로 유지** — 배너 문구와 무관 |
| 검수 배선 (`hasRiskFlags`) | **유지** — 입력 형태만 JSON에서 추출로 바뀐다 |

**데이터 이관은 없다.** 로컬 dev DB 확인 결과 공고 42건 중 배너 문구가 들어간 행은 0건이고,
프로덕션(Cloud SQL)에는 마이그레이션 0039가 아직 적용되지 않아 컬럼 자체가 없다.

## 결정 사항

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 문구 위치 | 자유 드래그, `{x, y}` 백분율 저장 | 슬롯 폭이 272~600px로 변해도 비율이 유지된다 |
| 폰트 크기 | 컨테이너 폭 대비 백분율(`cqw`) | 고정 px는 좁은 화면에서 넘친다. 좌표와 같은 원리로 반응형이 닫힌다 |
| 슬롯 편집 | 가로형(7:3)·세로형(4:9) 각각 따로 | 비율이 극단적으로 달라 하나의 배치가 양쪽에 맞을 수 없다 |
| 배경 | 업로드 이미지 또는 단색 중 선택 | |
| 색 자유도 | 자유 지정 + 대비 미달 시 경고(저장은 허용) | 구인자 의도를 막지 않되 결과를 알린다 |
| 연출 | Split · Type · Glitch · Blur 4종 | |
| 에디터 진입 | 등록 폼의 버튼 → 데스크톱 새창 / 모바일 전체화면 다이얼로그 | 모바일 브라우저는 새창 팝업을 막거나 탭으로 열어 드래그가 어렵다 |
| 저장 시점 | 팝업이 부모 폼에 `postMessage`로 반환 → 공고 저장 시 함께 커밋 | 공고 ID가 없는 신규 등록에서도 편집 가능하고, 등록을 취소하면 배너도 함께 사라져 고아 데이터가 안 생긴다 |
| 문구 개수 | 슬롯당 최대 5개 | 무제한이면 검수·렌더 비용이 커진다 |

## 데이터 모델

### 새 테이블 (마이그레이션 0040)

```sql
create table job_ad_banner_layout (
  job_post_id uuid primary key references job_post(id) on delete cascade,
  layout jsonb not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);
```

`job_post_id`가 PK다 — 공고당 레이아웃은 정확히 하나이고, 조인 없이 존재 여부로 "배너를
편집했는가"를 판정한다. `on delete cascade`로 공고가 지워지면 함께 사라진다.

### 같은 마이그레이션에서 제거

- `job_post`의 `ad_banner_headline`·`ad_banner_subline`·`ad_banner_vertical_text`·
  `ad_banner_animation`·`ad_banner_theme`
- pgEnum `ad_banner_animation`·`ad_banner_theme`

`bambi_site_settings.ad_inquiry_tel`은 **유지한다** — 자리표시 문의 번호라 배너 문구와 무관하다.

### JSON 스키마

```ts
interface AdBannerLayout {
  // 스키마 변경 시 렌더러가 분기할 수 있도록 버전을 박아 둔다.
  version: 1;
  horizontal: AdBannerSlotLayout;
  vertical: AdBannerSlotLayout;
}

interface AdBannerSlotLayout {
  background:
    | { type: "image" }              // 업로드된 배너 이미지를 그대로 쓴다
    | { type: "color"; color: string }; // #rrggbb
  // 이미지 배경 위 문구 가독성 보조. 색 배경이면 무의미하므로 무시한다.
  scrim: { enabled: boolean; opacity: number }; // opacity 0~100
  texts: AdBannerTextBlock[];      // 최대 5개
}

interface AdBannerTextBlock {
  id: string;                       // uuid, 드래그 중 리스트 키
  content: string;                  // 1~40자
  x: number;                        // 0~100, 블록 중심의 가로 위치(%)
  y: number;                        // 0~100, 블록 중심의 세로 위치(%)
  fontSize: number;                 // 2~20, 컨테이너 폭 대비 %
  color: string;                    // #rrggbb
  weight: "normal" | "bold" | "extrabold";
  align: "left" | "center" | "right";
  animation: "split" | "typing" | "glitch" | "blur" | null; // null이면 정적
}
```

좌표는 **블록 중심** 기준이다(`translate(-50%, -50%)`). 좌상단 기준이면 폰트 크기를 바꿀
때 블록이 한쪽으로 밀려 편집 중 위치가 흔들린다.

`fontSize`는 컨테이너 폭 대비 백분율이고 렌더러가 `cqw`로 변환한다. 세로 슬롯은 폭이
약 92px이라 같은 값이라도 훨씬 작게 나오는데, 슬롯별로 따로 편집하므로 문제가 되지 않는다.

## 서버 검증

JSON으로 옮기면서 DB enum·길이 제약이 사라지므로 **서버 zod가 유일한 방어선**이 된다.
트러스트 바운더리이므로 다음을 전부 서버에서 강제한다.

- `version`은 리터럴 `1`
- `texts` 길이 0~5, `content` 1~40자(trim 후)
- `x`·`y` 0~100, `fontSize` 2~20, `scrim.opacity` 0~100
- `color`와 `background.color`는 `/^#[0-9a-f]{6}$/i`
- `animation`은 4종 + null, `weight`·`align`은 지정 값만
- 알 수 없는 키는 `strict()`로 거부 — 클라이언트가 임의 필드를 실어 보내지 못하게 한다

배너형 노출이 아닌 공고가 레이아웃을 보내면 **저장하지 않는다**(선행 작업의
`normalizeAdBannerText`와 같은 이유 — 상품이 나중에 배너형으로 바뀔 때 검수받지 않은 문구가
조용히 노출되는 것을 막는다).

### 검수

`layout.horizontal.texts[].content`와 `layout.vertical.texts[].content`를 전부 뽑아 공백으로
이어 붙인 뒤 기존 `hasRiskFlags`에 넘긴다. 배치·색은 검수 대상이 아니다.

## 에디터

`/employer/ad-banner-editor` 라우트를 새로 만든다. 등록 폼의 "에디터로 편집하기" 버튼이
데스크톱에서는 `window.open`으로, 모바일에서는 같은 페이지 위 전체화면 다이얼로그로 띄운다.
**에디터 본체는 같은 컴포넌트를 쓰고 껍데기만 다르다.**

### 화면 구성

- 상단: 가로형 / 세로형 탭
- 좌측(모바일은 상단): 캔버스 — 실제 슬롯 비율(7:3 / 4:9)을 유지하고 문구 블록을 드래그
- 우측(모바일은 하단): 선택된 블록의 속성 — 문구, 크기, 색, 굵기, 정렬, 연출
- 하단: 배경(이미지/단색), 스크림 토글, 문구 추가 버튼, 저장·취소

### 드래그

라이브러리를 쓰지 않고 Pointer Events로 구현한다. `pointerdown` → `setPointerCapture` →
`pointermove`로 캔버스 기준 백분율 계산 → `pointerup`. 터치·마우스가 같은 코드로 동작하고
새 의존성이 없다.

블록 중심이 캔버스를 벗어나지 않도록 0~100으로 클램프한다.

### 대비 경고

- 배경이 **단색**이면 배경색과 글자색으로 WCAG 대비를 계산해 4.5:1 미만이면 경고 배지
- 배경이 **이미지**면 픽셀을 알 수 없으므로 계산하지 않고, 대신 스크림이 꺼져 있으면
  "사진에 따라 글자가 안 보일 수 있다"고 안내한다

경고는 안내일 뿐 저장을 막지 않는다.

### 부모 폼과의 통신

```
에디터 ──(postMessage: { type: "ready" })──────────────────▶ 부모 폼
부모 폼 ──(postMessage: { type: "init", layout, files })───▶ 에디터
에디터 ──(postMessage: { type: "save", layout })───────────▶ 부모 폼
```

`postMessage`는 `window.location.origin`으로 대상을 한정하고, 수신 측도 `event.origin`을
검사한다. 초기 데이터는 쿼리스트링에 싣기엔 크므로 에디터가 `ready`를 보내면 부모가
응답하는 핸드셰이크로 넘긴다.

**배경 이미지는 URL이 아니라 `File` 객체 자체를 넘긴다.** 배너 이미지는 공고를 제출할 때에야
GCS로 올라가고, 그 전까지 폼이 들고 있는 건 `URL.createObjectURL`로 만든 `blob:` URL뿐이다.
blob URL은 생성한 문서에 묶여 있어 다른 창에서 로드되는지가 브라우저마다 갈리고, 부모 창이
닫히거나 revoke되면 무효가 된다. `File`은 structured clone 대상이라 `postMessage`로 그대로
복사되므로, 에디터가 받아서 자기 문서에서 `createObjectURL`을 다시 호출한다. 수정 화면처럼
이미 업로드된 이미지가 있으면 그때는 GCS URL을 넘긴다.

모바일 다이얼로그 경로는 같은 React 트리 안이라 `postMessage` 없이 콜백으로 받는다. 에디터
본체는 초기 데이터와 저장 콜백을 props로 받는 순수 컴포넌트로 두고, 팝업·다이얼로그 두
껍데기가 각자 방식으로 그것을 채운다.

## 렌더

`ad-banner-layout-renderer.tsx`를 새로 만들어 `ad-banner-text-overlay.tsx`를 대체한다.

- 슬롯 컨테이너에 `container-type: inline-size`를 걸어 `cqw`가 슬롯 폭을 기준으로 잡히게 한다
- 각 블록은 `absolute` + `left: {x}%` / `top: {y}%` + `translate(-50%, -50%)`
- 배경이 단색이면 이미지 대신 색을 깔고, 이미지면 기존 `<Image>`를 그대로 쓴다
- 스크림은 슬롯 전체를 덮는 한 겹으로, `scrim.opacity`를 그대로 반영한다
- 레이아웃이 없으면(`null`) 기존처럼 이미지만 렌더한다 — 배너를 편집하지 않은 공고 대응

선행 작업에서 확보한 두 가지를 그대로 유지한다.

- **서버 HTML에 문구가 남는다** — 애니메이션 게이트(`useAnimationEnabled`, 초기값 `false`)
  뒤에서만 연출 컴포넌트가 마운트되고, 그 전에는 정적 텍스트가 나간다
- **`prefers-reduced-motion`이면 연출이 돌지 않는다** — 같은 게이트가 겸한다

## 애니메이션 4종

**신규 npm 패키지가 필요 없다.** `SplitText.js`·`ScrollTrigger.js`가 이미 설치된
gsap 3.15.0 패키지 안에 들어 있고(Standard no-charge 라이선스), `@gsap/react`의 `useGSAP`은
기존 `gsap.context()` + `useLayoutEffect` 패턴으로 대체한다.

| 값 | 라벨 | 구현 |
| --- | --- | --- |
| `split` | 글자 분리 | gsap `SplitText`로 글자 단위 분해 후 stagger |
| `typing` | 타이핑 | 기존 컴포넌트 재사용(의존성 없음) |
| `glitch` | 글리치 | CSS keyframes + `clip-path` |
| `blur` | 블러 등장 | 기존 컴포넌트 재사용(gsap) |

React Bits 원본에서 걷어낼 것:

- **`ScrollTrigger`** — 우리는 마운트 시 1회 재생 정책이고 게이트가 그 역할을 한다
- **인라인 `style`** — 프로젝트 규칙 위반. Tailwind arbitrary property로 옮긴다
- **raw hex/색상명**(`#120F17`·`red`·`cyan`) — 토큰 경유
- **`tailwind.config.js` keyframes** — v4는 config 파일을 쓰지 않는다. `index.css`의 `@theme`에
  정의한다(기존 `--animate-shiny`와 같은 방식)

유지할 것:

- **`document.fonts.ready` 대기** — 폰트 로드 전에 글자를 쪼개면 잘못된 위치로 분리된다

### 글리치의 구조적 제약

원본 글리치는 `::before`/`::after`로 텍스트를 두 벌 복제하고 **배경색을 깔아 원본을 가린 뒤**
`clip-path`로 잘라 어긋나게 보여준다. **배경색이 효과의 부품**이라 투명하게 두면 세 겹이
겹쳐 뭉개진 글자가 된다.

따라서 pseudo 요소 배경색을 CSS 변수로 주입한다.

- 배경이 **단색**이면 그 색
- 배경이 **이미지**면 스크림 색(스크림이 꺼져 있으면 글리치 선택 시 자동으로 켠다)

또한 글리치는 무한 반복 애니메이션이라 상시 리페인트가 발생한다. 광고 슬롯이 최대 8칸까지
동시에 뜨므로 **재생을 6초로 제한하고 이후 정적 상태로 고정한다**(`animation-iteration-count`를
유한값으로). 에디터 미리보기에서는 반복해 보여준다.

## 운영자

운영자 공고 편집 화면에서도 같은 에디터로 진입할 수 있게 한다. 배너 문구가 검수 대상인데
운영자가 고칠 수 없으면 사각지대가 된다(선행 작업에서 같은 이유로 운영자 폼에 입력 UI를
넣었다).

## 테스트

| 대상 | 검증 |
| --- | --- |
| 레이아웃 zod 스키마 | 좌표·크기 범위 밖, 색 형식 오류, 문구 6개, 알 수 없는 키 전부 반려 |
| 검수 텍스트 추출 | 두 슬롯의 모든 `content`가 빠짐없이 `hasRiskFlags`에 넘어간다 |
| 배너형 아닌 노출 | 레이아웃을 보내도 저장되지 않는다 |
| 드래그 클램프 | 캔버스 밖으로 끌어도 0~100을 벗어나지 않는다 |
| 대비 판정 | 단색 배경에서 4.5:1 경계값 앞뒤로 경고가 갈린다 |
| 렌더러 폴백 | 레이아웃이 없으면 이미지만 렌더한다 |

검증은 `pnpm check-types`와 vitest만 돌린다. web 테스트는 저장소 루트에서
`pnpm vitest run apps/web`으로 실행한다 — `pnpm -F web test`는 `apps/web`에 `test` 스크립트가
없어 아무것도 실행하지 않고 조용히 성공하는 함정이다. web 테스트에서 `@/` alias는 해석되지
않으므로 상대 경로를 쓴다.

## 범위 밖

- 이미지 필터·도형·아이콘 등 텍스트 외 요소
- 블록 회전, 겹침 순서(z-index) 조정
- 템플릿 갤러리 — 프리셋은 후속으로 검토
- 에디터 실행 취소(undo/redo)
- native 앱 — 프리미엄 배너는 web에만 렌더된다

## 파일

**신규**

- `packages/db/src/migrations/0040_*.sql`
- `apps/web/src/lib/bambi/ad-banner-layout.ts` — JSON 타입·기본값·상수·대비 계산
- `apps/web/src/lib/bambi/ad-banner-layout.test.ts`
- `apps/web/src/components/bambi/ad-banner-layout-renderer.tsx`
- `apps/web/src/components/bambi/ad-banner-editor/` — 캔버스·속성 패널·드래그 훅
- `apps/web/src/app/employer/ad-banner-editor/page.tsx`
- `apps/web/src/components/bambi/text-animations/split-text.tsx`, `glitch-text.tsx`

**수정**

- `packages/db/src/schema/bambi.ts`
- `packages/api/src/routers/bambi/jobs.ts` — 레이아웃 입력·저장·조회, 검수 텍스트 추출
- `apps/web/src/lib/bambi/api-job-mapper.ts` — `AdBannerItem.layout`
- `apps/web/src/lib/bambi-job-form.ts`
- `apps/web/src/components/bambi/ad-banner.tsx` — 렌더러 연결
- `apps/web/src/components/bambi/job-post-media-uploader.tsx` — 에디터 진입 버튼
- `apps/web/src/app/employer/new/page.tsx`, `.../jobs/[id]/edit/page.tsx`,
  `.../moderator/jobs/[id]/edit/page.tsx`
- `apps/web/src/index.css` — 글리치 keyframes 추가, 쓰이지 않게 되는 `--animate-shiny`·
  `--animate-gradient`와 그 `@keyframes` 제거

**삭제**

- `apps/web/src/components/bambi/ad-banner-text-fields.tsx`
- `apps/web/src/components/bambi/ad-banner-text-overlay.tsx`
- `apps/web/src/components/bambi/text-animations/decrypted-text.tsx`
- `apps/web/src/lib/bambi/ad-banner-animations.ts` — 레이아웃 상수로 흡수
- `packages/api/src/routers/bambi/ad-banner-catalog-parity.test.ts` — 대조 대상 enum이 사라진다
