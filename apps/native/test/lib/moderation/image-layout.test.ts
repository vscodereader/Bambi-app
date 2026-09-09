import { expect, it } from "vitest";
import {
	croppedItem,
	imageLayout,
} from "../../../src/lib/moderation/image-layout";

const asset = { id: "asset", dataUrl: "", width: 800, height: 1600 };
const item = {
	id: "item",
	assetId: "asset",
	displayWidthPx: null,
	displayHeightPx: null,
	offsetX: 12,
	offsetY: -8,
};
it("fits a large image without changing its ratio or saved position", () => {
	expect(imageLayout(asset, item, 320)).toEqual({
		width: 320,
		height: 640,
		offsetX: 12,
		offsetY: -8,
	});
});
it("shows a resized image at its actual width rather than stretching to the screen", () => {
	expect(
		imageLayout(
			asset,
			{ ...item, displayWidthPx: 100, displayHeightPx: 120 },
			320
		)
	).toEqual({ width: 100, height: 120, offsetX: 12, offsetY: -8 });
});

it("preserves display geometry after cropping and clamps it to the new asset", () => {
	const original = {
		...item,
		displayWidthPx: 200,
		displayHeightPx: 300,
		offsetX: 120,
		offsetY: -160,
	};
	expect(
		croppedItem(original, { ...asset, id: "crop", width: 100, height: 150 })
	).toEqual({
		...original,
		assetId: "crop",
		displayWidthPx: 100,
		displayHeightPx: 150,
		offsetX: 100,
		offsetY: -150,
	});
	expect(original.assetId).toBe("asset");
});
