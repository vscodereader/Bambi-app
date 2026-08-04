import { describe, expect, it } from "vitest";
import {
	cleanUnusedAssets,
	duplicateItems,
	moveItems,
	resizeItems,
} from "./crawled-image-editor";

const document = {
	assets: [
		{
			dataUrl: "data:image/png;base64,AA==",
			height: 100,
			id: "asset-1",
			width: 200,
		},
		{
			dataUrl: "data:image/png;base64,AA==",
			height: 100,
			id: "asset-2",
			width: 80,
		},
	],
	items: [
		{ assetId: "asset-1", displayWidthPx: null, id: "item-1" },
		{ assetId: "asset-2", displayWidthPx: null, id: "item-2" },
	],
	version: 1 as const,
};

describe("crawled image editor state", () => {
	it("duplicates items without duplicating their base64 asset", () => {
		const result = duplicateItems(document, [document.items[0]], 1);
		expect(result.document.items).toHaveLength(3);
		expect(result.document.assets).toHaveLength(2);
		expect(result.document.items[1]?.assetId).toBe("asset-1");
	});

	it("clamps a shared pixel resize to each natural width", () => {
		const resized = resizeItems(document, new Set(["item-1", "item-2"]), 150);
		expect(resized.items.map((item) => item.displayWidthPx)).toEqual([150, 80]);
	});

	it("moves a selected group and removes only unused assets", () => {
		const moved = moveItems(document, new Set(["item-2"]), -1);
		expect(moved.items.map((item) => item.id)).toEqual(["item-2", "item-1"]);
		const cleaned = cleanUnusedAssets({ ...moved, items: [moved.items[0]] });
		expect(cleaned.assets.map((asset) => asset.id)).toEqual(["asset-2"]);
	});
});
