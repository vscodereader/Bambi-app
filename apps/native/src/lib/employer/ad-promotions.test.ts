import { describe, expect, it } from "vitest";

import {
	type AdBoostFields,
	autoBoostBadge,
	countActiveAds,
	exposureLabel,
	getAdGroupId,
	getBoostState,
	manualBoostBadges,
	premiumQueueBadge,
} from "./ad-promotions";

const NOW = new Date("2026-09-04T12:00:00+09:00");
const PAST = new Date("2026-09-01T12:00:00+09:00");
const FUTURE = new Date("2026-09-30T12:00:00+09:00");

// 기본은 "끌어올릴 수 있는 유료 공고". 각 케이스는 어긋나게 만들 필드만 덮는다.
const makeAd = (overrides: Partial<AdBoostFields> = {}): AdBoostFields => ({
	autoBoostsPerDay: 0,
	autoBoostsUsedToday: 0,
	boostCountRemaining: 0,
	boostOptionAutoPerDay: 0,
	boostOptionManualPerDay: 0,
	boostsUsedToday: 0,
	exposureEndsAt: FUTURE,
	exposureType: "standard",
	manualBoostsPerDay: 3,
	paymentStatus: "paid",
	status: "published",
	...overrides,
});

describe("getBoostState", () => {
	it.each([
		{
			expected: "배너 광고는 끌어올리기 대상이 아니에요.",
			name: "배너 광고는 대상이 아니다",
			overrides: { exposureType: "premium-banner" },
		},
		{
			expected:
				"사용할 수 있는 끌어올리기가 없어요. 웹에서 끌어올리기 옵션을 구매할 수 있어요.",
			name: "한도도 횟수권도 없으면 옵션 구매를 안내한다",
			overrides: { boostCountRemaining: 0, manualBoostsPerDay: 0 },
		},
		{
			expected: "노출 중인 공고만 끌어올릴 수 있어요.",
			name: "미결제는 끌어올릴 수 없다",
			overrides: { paymentStatus: "unpaid" },
		},
		{
			expected: "노출 중인 공고만 끌어올릴 수 있어요.",
			name: "검수 대기는 끌어올릴 수 없다",
			overrides: { status: "pending_review" },
		},
		{
			expected: "노출 중인 공고만 끌어올릴 수 있어요.",
			name: "노출이 끝났으면 끌어올릴 수 없다",
			overrides: { exposureEndsAt: PAST },
		},
		{
			expected: "오늘 끌어올리기를 모두 사용했어요.",
			name: "하루 한도를 다 쓰고 횟수권도 없으면 막힌다",
			overrides: { boostsUsedToday: 3 },
		},
	])("$name", ({ expected, overrides }) => {
		expect(getBoostState(makeAd(overrides), NOW)).toEqual({
			canBoost: false,
			disabledReason: expected,
		});
	});

	it.each([
		{ name: "한도가 남아 있으면 누를 수 있다", overrides: {} },
		{
			name: "하루 한도를 다 써도 횟수권이 있으면 누를 수 있다",
			overrides: { boostCountRemaining: 2, boostsUsedToday: 3 },
		},
		{
			name: "기간제 옵션만 산 무료 공고도 누를 수 있다",
			overrides: { boostOptionManualPerDay: 2, manualBoostsPerDay: 0 },
		},
		{
			name: "노출 만료일이 없으면 노출 중으로 본다",
			overrides: { exposureEndsAt: null },
		},
	])("$name", ({ overrides }) => {
		expect(getBoostState(makeAd(overrides), NOW)).toEqual({
			canBoost: true,
			disabledReason: null,
		});
	});
});

describe("getAdGroupId", () => {
	it.each([
		{
			expected: "expired",
			name: "노출 만료가 미결제보다 우선이다",
			overrides: { exposureEndsAt: PAST, paymentStatus: "unpaid" },
		},
		{
			expected: "pending_payment",
			name: "미결제는 결제 대기다",
			overrides: { paymentStatus: "unpaid" },
		},
		{
			expected: "active",
			name: "결제된 공개 공고는 진행 중이다",
			overrides: {},
		},
		{
			expected: "active",
			name: "만료일이 없어도 진행 중이다",
			overrides: { exposureEndsAt: null },
		},
		{
			expected: "other",
			name: "결제됐지만 미공개면 어느 탭에도 들지 않는다",
			overrides: { status: "pending_review" },
		},
	] as const)("$name", ({ expected, overrides }) => {
		expect(getAdGroupId(makeAd(overrides), NOW)).toBe(expected);
	});
});

describe("배지", () => {
	it("한도와 횟수권을 각각 배지로 나눈다", () => {
		expect(
			manualBoostBadges(makeAd({ boostCountRemaining: 2, boostsUsedToday: 1 }))
		).toEqual([
			{ label: "남은 2회 / 일일 3회", tone: "success" },
			{ label: "횟수권 2회", tone: "success" },
		]);
	});

	it("끌어올리기가 아예 없으면 미포함이다", () => {
		expect(manualBoostBadges(makeAd({ manualBoostsPerDay: 0 }))).toEqual([
			{ label: "미포함", tone: "neutral" },
		]);
	});

	it("자동 끌어올리기는 오늘 실행 수를 적고, 없으면 미설정이다", () => {
		expect(
			autoBoostBadge(makeAd({ autoBoostsPerDay: 2, autoBoostsUsedToday: 1 }))
		).toEqual({ label: "오늘 1/2회 실행", tone: "success" });
		expect(autoBoostBadge(makeAd())).toEqual({
			label: "미설정",
			tone: "neutral",
		});
	});

	it("대기열은 진행 가능 여부에 따라 톤이 갈린다", () => {
		expect(
			premiumQueueBadge({ progressable: true, queuePosition: null, rank: 1 })
		).toEqual({ label: "진행 가능", tone: "success" });
		expect(
			premiumQueueBadge({ progressable: false, queuePosition: 2, rank: 5 })
		).toEqual({ label: "대기열 2번째", tone: "warning" });
		expect(premiumQueueBadge(null)).toBeNull();
	});
});

describe("표기", () => {
	it("노출 타입은 라벨 맵을 거친다", () => {
		expect(exposureLabel("premium-banner")).toBe("프리미엄 배너");
		expect(exposureLabel("standard")).toBe("일반 구인");
	});

	it("진행 중 광고는 상품이 붙은 공고만 센다", () => {
		expect(
			countActiveAds(
				[
					{ ...makeAd(), adProductName: "프리미엄 광고" },
					{ ...makeAd(), adProductName: null },
					{ ...makeAd({ paymentStatus: "unpaid" }), adProductName: "스페셜" },
				],
				NOW
			)
		).toBe(1);
	});
});
