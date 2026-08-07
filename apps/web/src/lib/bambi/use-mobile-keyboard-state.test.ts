import { describe, expect, it } from "vitest";
import { getMobileKeyboardState } from "./use-mobile-keyboard-state";

describe("getMobileKeyboardState", () => {
	it("가려진 높이가 임계값 이하면 키보드가 닫힌 상태다", () => {
		expect(
			getMobileKeyboardState({ innerHeight: 800, viewportHeight: 680 })
		).toEqual({
			isKeyboardOpen: false,
			visualViewportHeight: 680,
		});
	});

	it("가려진 높이가 임계값을 넘으면 키보드가 열린 상태다", () => {
		expect(
			getMobileKeyboardState({ innerHeight: 800, viewportHeight: 679 })
		).toEqual({
			isKeyboardOpen: true,
			visualViewportHeight: 679,
		});
	});
});
