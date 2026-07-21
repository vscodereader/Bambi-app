# 광고 배너 1시간 랜덤 로테이션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 좌/우 사이드(3슬롯)·프리미엄(2슬롯) 배너를 매시간 시드 셔플로 완전 랜덤 선발해 모든 활성 배너가 동일 확률로 노출되게 한다.

**Architecture:** `groupAdBannerJobs(rows, now)` 내부에 시간 버킷(`⌊now/1h⌋`)+위치 타입을 시드로 한 결정적 Fisher–Yates 셔플을 넣고 앞에서 슬롯수만큼 자른다. DB·크론·라우터·프론트 데이터 흐름 무변경. 스펙: `docs/superpowers/specs/2026-07-21-banner-rotation-design.md`.

**Tech Stack:** TypeScript 순수 함수(의존성 없는 FNV-1a 해시 + mulberry32 PRNG), vitest.

## Global Constraints

- 새 npm 의존성 추가 금지(사용자 규칙). PRNG·해시는 소형 인라인 구현.
- 서브에이전트는 **커밋·git stash 금지** — 커밋은 세션 컨트롤러가 수행한다.
- 빌드·dev 서버 기동 금지. 검증은 vitest + `check-types`만.
- 주석·문구는 한국어, 기존 파일의 주석 밀도·톤을 따른다.
- 테스트 실행은 레포 루트에서 `pnpm exec vitest run <파일경로>` (web/api 패키지에 test 스크립트 없음).

---

### Task 1: 시간 시드 랜덤 로테이션 (api 서비스 + 테스트)

**Files:**
- Modify: `packages/api/src/services/bambi-ad-exposure.ts:141-171` (AdBannerRow~groupAdBannerJobs 구간)
- Test: `packages/api/src/services/bambi-ad-exposure.test.ts` (기존 `describe("groupAdBannerJobs")` 확장)

**Interfaces:**
- Consumes: 기존 `isExposureActive(exposureEndsAt, now)`, `AdBannerRow`, `AdBannerExposureType`, `SIDE_BANNER_MAX_SLOTS`.
- Produces: `PREMIUM_BANNER_MAX_SLOTS = 2` export(상수), `groupAdBannerJobs` 시그니처 불변 — Task 2와 호출부(jobs.ts:776)는 수정 불필요.

- [ ] **Step 1: 실패하는 테스트 작성**

`bambi-ad-exposure.test.ts`의 기존 `groupAdBannerJobs` describe에 로테이션 테스트를 추가한다. 기존 테스트 중 **배열 순서·앞자리 선발을 단정하는 부분은 집합(포함 여부) 단정으로 고쳐야 한다**(셔플로 순서가 바뀜). 기존 헬퍼(row 생성 함수)가 있으면 재사용하고, 없으면 아래 `makeRow`를 추가한다.

```ts
const HOUR_MS = 60 * 60 * 1000;

const makeRow = (id: string, exposureType: string) => ({
	exposureEndsAt: null,
	exposureType,
	id,
});

const idsOf = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

describe("groupAdBannerJobs 1시간 랜덤 로테이션", () => {
	const leftRows = Array.from({ length: 8 }, (_, i) =>
		makeRow(`left-${i}`, "left-banner")
	);
	const premiumRows = Array.from({ length: 8 }, (_, i) =>
		makeRow(`prem-${i}`, "premium-banner")
	);

	it("같은 시간 버킷에서는 몇 번을 호출해도 같은 선발을 돌려준다", () => {
		const now = new Date("2026-07-21T03:10:00Z");
		const again = new Date("2026-07-21T03:50:00Z"); // 같은 버킷(03시)
		const first = groupAdBannerJobs(leftRows, now);
		const second = groupAdBannerJobs(leftRows, again);
		expect(second.leftBanner.map((r) => r.id)).toEqual(
			first.leftBanner.map((r) => r.id)
		);
	});

	it("시간 버킷이 지나면 선발이 바뀐다(72버킷 중 최소 1회 변화)", () => {
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const selections = new Set<string>();
		for (let hour = 0; hour < 72; hour++) {
			const groups = groupAdBannerJobs(leftRows, new Date(base + hour * HOUR_MS));
			selections.add(groups.leftBanner.map((r) => r.id).join(","));
		}
		expect(selections.size).toBeGreaterThan(1);
	});

	it("슬롯 초과 후보 전원이 72버킷 안에 최소 1회 선발된다(고정 배제 없음)", () => {
		const base = new Date("2026-07-21T00:00:00Z").getTime();
		const seen = new Set<string>();
		for (let hour = 0; hour < 72; hour++) {
			const groups = groupAdBannerJobs(leftRows, new Date(base + hour * HOUR_MS));
			for (const row of groups.leftBanner) {
				seen.add(row.id);
			}
		}
		expect([...seen].sort()).toEqual(idsOf(leftRows));
	});

	it("프리미엄은 2개로 캡되고 좌/우는 3개를 유지한다", () => {
		const rows = [
			...leftRows,
			...premiumRows,
			...Array.from({ length: 8 }, (_, i) => makeRow(`right-${i}`, "right-banner")),
		];
		const groups = groupAdBannerJobs(rows, new Date("2026-07-21T03:00:00Z"));
		expect(groups.premiumBanner).toHaveLength(PREMIUM_BANNER_MAX_SLOTS);
		expect(groups.leftBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
		expect(groups.rightBanner).toHaveLength(SIDE_BANNER_MAX_SLOTS);
	});

	it("후보가 슬롯 이하면 전원 노출된다(집합 기준)", () => {
		const few = leftRows.slice(0, 2);
		const groups = groupAdBannerJobs(few, new Date("2026-07-21T03:00:00Z"));
		expect(idsOf(groups.leftBanner)).toEqual(idsOf(few));
	});

	it("만료된 배너는 로테이션 후보에서 빠진다", () => {
		const now = new Date("2026-07-21T03:00:00Z");
		const rows = [
			{ ...makeRow("left-live", "left-banner") },
			{
				exposureEndsAt: new Date("2026-07-20T00:00:00Z"),
				exposureType: "left-banner",
				id: "left-expired",
			},
		];
		const groups = groupAdBannerJobs(rows, now);
		expect(idsOf(groups.leftBanner)).toEqual(["left-live"]);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run(레포 루트): `pnpm exec vitest run packages/api/src/services/bambi-ad-exposure.test.ts`
Expected: FAIL — `PREMIUM_BANNER_MAX_SLOTS` 미정의(import 에러) 또는 프리미엄 캡·로테이션 미구현 단정 실패.

- [ ] **Step 3: 구현**

`bambi-ad-exposure.ts`의 `SIDE_BANNER_MAX_SLOTS`~`groupAdBannerJobs` 구간을 다음으로 교체한다(기존 주석 대체 포함).

```ts
// 좌/우 사이드 배너의 위치별 최대 슬롯 수. 프리미엄은 1행 2열 고정이라 2개로 캡한다.
export const SIDE_BANNER_MAX_SLOTS = 3;
export const PREMIUM_BANNER_MAX_SLOTS = 2;

// 로테이션 주기. 같은 버킷 안에서는 어떤 요청·인스턴스든 같은 선발을 돌려준다.
const ROTATION_INTERVAL_MS = 60 * 60 * 1000;

// 문자열을 32비트 시드로 접는 FNV-1a. 시간 버킷+위치 타입을 시드화하는 용도라
// 암호학적 강도는 필요 없다.
const hashSeed = (input: string): number => {
	let hash = 0x81_1c_9d_c5;
	for (let index = 0; index < input.length; index++) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 0x01_00_01_93);
	}
	return hash >>> 0;
};

// mulberry32 — 의존성 없는 결정적 PRNG. 시드가 같으면 수열이 같다.
const createSeededRandom = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d_2b_79_f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
};

// 시드 고정 Fisher–Yates. 입력을 훼손하지 않고 새 배열을 돌려준다.
const shuffleWithSeed = <T>(items: T[], seed: number): T[] => {
	const result = [...items];
	const random = createSeededRandom(seed);
	for (let index = result.length - 1; index > 0; index--) {
		const target = Math.floor(random() * (index + 1));
		[result[index], result[target]] = [
			result[target] as T,
			result[index] as T,
		];
	}
	return result;
};

// 결제완료된 배너형 공고를 노출 위치별로 그룹핑한다. 활성(미만료) 후보가 슬롯을 초과하면
// 시간 버킷(1시간)+위치 타입을 시드로 한 랜덤 셔플로 매시간 새로 선발한다 — 정해진 순서를
// 도는 순환이 아니라 매시간 독립 추첨이라 모든 배너가 동일 확률로 노출된다. 후보가 슬롯
// 이하면 전원 노출되고 표시 순서만 매시간 섞인다.
export const groupAdBannerJobs = <TRow extends AdBannerRow>(
	rows: TRow[],
	now: Date
): { leftBanner: TRow[]; premiumBanner: TRow[]; rightBanner: TRow[] } => {
	const hourBucket = Math.floor(now.getTime() / ROTATION_INTERVAL_MS);
	const pick = (type: AdBannerExposureType, maxSlots: number): TRow[] => {
		// id 정렬로 DB 정렬 순서 의존을 끊어야 같은 버킷=같은 선발이 보장된다.
		const matched = rows
			.filter(
				(item) =>
					item.exposureType === type &&
					isExposureActive(item.exposureEndsAt, now)
			)
			.sort((a, b) => a.id.localeCompare(b.id));
		return shuffleWithSeed(matched, hashSeed(`${hourBucket}:${type}`)).slice(
			0,
			maxSlots
		);
	};

	return {
		leftBanner: pick("left-banner", SIDE_BANNER_MAX_SLOTS),
		premiumBanner: pick("premium-banner", PREMIUM_BANNER_MAX_SLOTS),
		rightBanner: pick("right-banner", SIDE_BANNER_MAX_SLOTS),
	};
};
```

주의: `as T` 캐스트는 `noUncheckedIndexedAccess` 대비다. 타입체크가 캐스트 없이 통과하면 캐스트를 빼고, biome이 숫자 구분자·스왑 구문을 지적하면 지적대로 따른다.

- [ ] **Step 4: 통과 확인**

Run(레포 루트): `pnpm exec vitest run packages/api/src/services/bambi-ad-exposure.test.ts`
Expected: PASS (기존 단정 중 순서 의존이 남아 있으면 집합 단정으로 정리 후 재실행).

- [ ] **Step 5: 타입체크**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: 에러 0.

### Task 2: 프론트 주석·안내 문구 동기화 (web)

**Files:**
- Modify: `apps/web/src/components/bambi/premium-ad-banner-section.tsx:11-13` (섹션 주석)
- Modify: 광고 가이드·매뉴얼 중 배너 노출 방식을 서술한 파일(아래 Step 1에서 탐색)

**Interfaces:**
- Consumes: Task 1의 서버 캡(프리미엄 2) — 웹 코드는 내려온 배열을 그대로 렌더하므로 로직 수정 없음.
- Produces: 없음(주석·문구만).

- [ ] **Step 1: 배너 노출 방식 서술 위치 탐색**

Run(워크트리 루트): `grep -rn "배너" docs/manual apps/web/src --include="*.md" --include="*.tsx" -l` 후, 슬롯 수·노출 순서·"최대 3개" 류 서술이 있는 광고 가이드/매뉴얼 파일만 추린다. 서술이 없으면 이 파일 수정은 건너뛴다(주석 갱신만 수행).

- [ ] **Step 2: 주석·문구 갱신**

`premium-ad-banner-section.tsx` 상단 주석을 서버 캡 기준으로 고친다:

```tsx
// 목록 상단 프리미엄 광고 섹션. 서버가 활성 프리미엄 배너 중 시간당 랜덤 2개를
// 선발해 내려주므로(1행 2열, 모바일 1열) 여기서는 받은 배열을 그대로 배치한다.
// 판매분이 없어도 섹션을 렌더하고, 빈 칸은 "광고 모집중" 자리표시로 채운다(0개면 2개).
```

Step 1에서 찾은 가이드·매뉴얼 파일에는 "판매분이 슬롯(좌/우 3개·프리미엄 2개)을 초과하면 1시간 단위로 랜덤 로테이션 노출됩니다" 취지의 문구를 기존 문체에 맞춰 반영한다.

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter web check-types`
Expected: 에러 0 (주석·문구 변경뿐이므로 실패 시 원인 규명 필수).
