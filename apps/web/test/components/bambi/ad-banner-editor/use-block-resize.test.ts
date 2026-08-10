import { describe, expect, it } from "vitest";
import { resizeBlockWidth } from "@/components/bambi/ad-banner-editor/use-block-resize";
import {
	AD_BANNER_WIDTH_MAX,
	AD_BANNER_WIDTH_MIN,
} from "@/lib/bambi/ad-banner-layout";

// 중심 좌표 보정이 이 화면에서 가장 틀리기 쉬운 계산이다. 부호가 뒤집혀도 화면은 "그럴듯하게"
// 움직여서 눈으로는 잡기 어렵다 — 잡은 쪽 반대 모서리가 제자리인지로 못박는다.
const rightEdge = ({ width, x }: { width: number; x: number }) => x + width / 2;
const leftEdge = ({ width, x }: { width: number; x: number }) => x - width / 2;

describe("resizeBlockWidth", () => {
	it("왼쪽 핸들로 넓히면 오른쪽 모서리가 제자리에 남는다", () => {
		const block = { width: 40, x: 50 };
		const next = resizeBlockWidth({ edge: "left", widthDelta: 10, ...block });

		expect(next.width).toBe(50);
		expect(next.x).toBe(45);
		expect(rightEdge(next)).toBe(rightEdge(block));
	});

	it("오른쪽 핸들로 넓히면 왼쪽 모서리가 제자리에 남는다", () => {
		const block = { width: 40, x: 50 };
		const next = resizeBlockWidth({ edge: "right", widthDelta: 10, ...block });

		expect(next.width).toBe(50);
		expect(next.x).toBe(55);
		expect(leftEdge(next)).toBe(leftEdge(block));
	});

	it("좁힐 때도 잡은 쪽 반대 모서리가 제자리에 남는다", () => {
		const block = { width: 60, x: 40 };
		const next = resizeBlockWidth({ edge: "left", widthDelta: -20, ...block });

		expect(next.width).toBe(40);
		expect(rightEdge(next)).toBe(rightEdge(block));
	});

	it("너비 상·하한을 넘으면 클램프하고 중심은 실제 변화량만큼만 민다", () => {
		const narrow = resizeBlockWidth({
			edge: "right",
			width: AD_BANNER_WIDTH_MIN + 2,
			widthDelta: -50,
			x: 50,
		});

		expect(narrow.width).toBe(AD_BANNER_WIDTH_MIN);
		// 실제 변화량은 -2뿐이라 중심도 1만 움직인다(요청한 -50/2 = -25가 아니다).
		expect(narrow.x).toBe(49);

		const wide = resizeBlockWidth({
			edge: "left",
			width: AD_BANNER_WIDTH_MAX - 4,
			widthDelta: 50,
			x: 50,
		});

		expect(wide.width).toBe(AD_BANNER_WIDTH_MAX);
		expect(wide.x).toBe(48);
	});

	it("좌표는 0~100 밖으로 나가지 않는다", () => {
		const next = resizeBlockWidth({
			edge: "left",
			width: 20,
			widthDelta: 80,
			x: 2,
		});

		expect(next.x).toBe(0);
	});
});
