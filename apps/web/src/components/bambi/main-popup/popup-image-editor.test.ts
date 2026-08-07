import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fitPopupImageSize, resizePopupImage } from "./popup-image-editor";

const maximum = { height: 500, width: 600 };
const source = readFileSync(
	new URL("./popup-image-editor.tsx", import.meta.url),
	"utf8"
);

describe("popup image resize calculations", () => {
	it("fits oversized saved dimensions for display without changing the input", () => {
		const persisted = { height: 800, width: 1200 };

		expect(fitPopupImageSize(persisted, maximum)).toEqual({
			height: 400,
			width: 600,
		});
		expect(persisted).toEqual({ height: 800, width: 1200 });
	});

	it.each([
		"nw",
		"ne",
		"se",
		"sw",
	] as const)("keeps the starting ratio from the %s corner", (handle) => {
		const next = resizePopupImage({
			dx: handle.includes("w") ? -100 : 100,
			dy: handle.includes("n") ? -75 : 75,
			handle,
			maximum,
			start: { height: 300, width: 400 },
		});

		expect(next).toEqual({ height: 375, width: 500 });
	});

	it("resizes side handles on one axis and clamps at each boundary", () => {
		expect(
			resizePopupImage({
				dx: 300,
				dy: 200,
				handle: "e",
				maximum,
				start: { height: 300, width: 400 },
			})
		).toEqual({ height: 300, width: 600 });
		expect(
			resizePopupImage({
				dx: 0,
				dy: -400,
				handle: "s",
				maximum,
				start: { height: 300, width: 400 },
			})
		).toEqual({ height: 50, width: 400 });
	});

	it("stops a ratio-preserving corner at the first maximum boundary", () => {
		expect(
			resizePopupImage({
				dx: 1000,
				dy: 1000,
				handle: "se",
				maximum: { height: 350, width: 600 },
				start: { height: 300, width: 400 },
			})
		).toEqual({ height: 350, width: 467 });
	});

	it("keeps the existing desktop renderer and resize path outside mobile", () => {
		expect(source).toContain(
			'const MOBILE_EDITOR_QUERY = "(max-width: 767px)"'
		);
		expect(source).toContain(": resizePopupImageOnDesktop(");
		expect(source).toContain("height={height}");
		expect(source).toContain("width={width}");
	});
});
