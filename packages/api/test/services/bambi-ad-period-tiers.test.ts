import { describe, expect, it } from "vitest";
import {
	AD_PERIOD_TIER_ICON_MAX_BYTES,
	isAdPeriodTierColorClassValid,
	isAdPeriodTierRangeValid,
	validateAdPeriodTierIconUpload,
} from "@/services/bambi-ad-period-tiers";

describe("isAdPeriodTierRangeValid", () => {
	it("상한 없음(null)은 항상 유효(최상위 등급)", () => {
		expect(isAdPeriodTierRangeValid(721, null)).toBe(true);
	});
	it("최소 ≤ 최대면 유효(경계 포함)", () => {
		expect(isAdPeriodTierRangeValid(91, 180)).toBe(true);
		expect(isAdPeriodTierRangeValid(100, 100)).toBe(true);
	});
	it("최소 > 최대면 무효", () => {
		expect(isAdPeriodTierRangeValid(200, 180)).toBe(false);
	});
});

describe("isAdPeriodTierColorClassValid", () => {
	it("브랜드색 text-primary(숫자 없음) 통과", () => {
		expect(isAdPeriodTierColorClassValid("text-primary")).toBe(true);
	});
	it("팔레트 색 text-amber-500(숫자 있음) 통과", () => {
		expect(isAdPeriodTierColorClassValid("text-amber-500")).toBe(true);
	});
	it("raw hex·비-text 유틸은 거부", () => {
		expect(isAdPeriodTierColorClassValid("text-#fff")).toBe(false);
		expect(isAdPeriodTierColorClassValid("bg-red-500")).toBe(false);
	});
});

describe("validateAdPeriodTierIconUpload", () => {
	const base = { byteSize: 1024, fileName: "tier.gif", mimeType: "image/gif" };

	// 공용 미디어 정책(bambi-media-policy)은 GIF를 막는다 — 등급 아이콘만 예외로 받는 것이
	// 이 함수를 따로 둔 이유라, GIF 통과가 깨지면 요구사항 자체가 깨진 것이다.
	it("GIF를 허용한다(공용 정책과 갈리는 지점)", () => {
		expect(validateAdPeriodTierIconUpload(base).ok).toBe(true);
	});

	it("PNG·WebP·JPG도 허용", () => {
		for (const mimeType of ["image/png", "image/webp", "image/jpeg"]) {
			expect(validateAdPeriodTierIconUpload({ ...base, mimeType }).ok).toBe(
				true
			);
		}
	});

	it("이미지가 아닌 타입은 거부", () => {
		expect(
			validateAdPeriodTierIconUpload({
				...base,
				mimeType: "application/pdf",
			})
		).toEqual({ code: "unsupported_type", ok: false });
		expect(
			validateAdPeriodTierIconUpload({ ...base, mimeType: "image/svg+xml" })
		).toEqual({ code: "unsupported_type", ok: false });
	});

	it("상한(2MB) 초과는 거부, 경계값은 허용", () => {
		expect(
			validateAdPeriodTierIconUpload({
				...base,
				byteSize: AD_PERIOD_TIER_ICON_MAX_BYTES,
			}).ok
		).toBe(true);
		expect(
			validateAdPeriodTierIconUpload({
				...base,
				byteSize: AD_PERIOD_TIER_ICON_MAX_BYTES + 1,
			})
		).toEqual({ code: "file_too_large", ok: false });
	});

	it("빈 파일명은 거부", () => {
		expect(
			validateAdPeriodTierIconUpload({ ...base, fileName: "   " })
		).toEqual({ code: "empty_file_name", ok: false });
	});
});
