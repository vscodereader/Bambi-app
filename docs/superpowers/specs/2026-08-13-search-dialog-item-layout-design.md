# 공고 검색 다이얼로그 결과 아이템 레이아웃 — 설계

- 날짜: 2026-08-13
- 브랜치: `fix/search-dialog-item-layout` (develop 기반)
- 대상: `apps/web/src/components/bambi/job-search-command.tsx` — `JobSearchResults` 결과 아이템

## 문제

모바일(375px)에서 메인 검색 다이얼로그의 결과 행이
`썸네일(120px) | 제목+업종·지역 | 급여(우측 shrink-0)` 구조라,
가운데 텍스트 컬럼이 수십 px로 쪼그라들어 제목·업종·지역이 한 글자 + "…"로 잘린다.

## 결정 (A안: 3줄 세로 스택)

썸네일은 그대로 두고, 급여를 우측 고정에서 텍스트 컬럼의 셋째 줄로 옮긴다.
브레이크포인트 분기 없이 전 화면 공통.

```
[썸네일 h-14 w-30]  제목            (truncate, font-bold text-sm)
                    업종 · 지역     (truncate, text-muted-foreground text-xs)
                    급여            (truncate, font-extrabold text-sm)
```

- 썸네일 `h-14 w-30`(120×56px)·아이템 패딩(`px-4 py-3`)·gap(`gap-3`) 유지.
- 급여 폰트 스타일(`font-extrabold text-sm`) 유지, 셋째 줄에도 `truncate`.
- 세로 정렬은 CommandItem 기본 `items-center`가 그대로 잡아준다.

## 기각한 대안

- **B안(2줄, 급여를 메타 줄 우측 정렬)**: `월급 12,000,000원`(~145px) 같은 긴 급여가
  375px 텍스트 컬럼(~180px)에서 업종·지역을 다시 한 글자로 밀어냄 — 원래 버그 재현.
  급여 포맷은 `formatMarketplacePay`가 `"{단위} {금액}원"`으로 생성.
- **썸네일 축소**: 사용자가 썸네일 유지 지시.
- **모바일만 분기**: 전 화면 공통으로 확정(코드 단순·룩 일치).

## 검증

순수 JSX 재배치라 로직 테스트 없음. ultracite(경로 지정) + web 타입체크.
시각 확인은 사용자가 HMR로 직접 수행(개발 서버 기동 금지 컨벤션).
