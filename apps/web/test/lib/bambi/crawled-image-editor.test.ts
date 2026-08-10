import { describe, expect, it } from "vitest";
import {
	anchoredResizeOffsets,
	base64DataUrlByteLength,
	CRAWLED_IMAGE_SIZE_ERROR_MESSAGE,
	cleanUnusedAssets,
	crawledImageDocumentSizeError,
	crawledImageSaveErrorMessage,
	duplicateItems,
	moveItems,
	resizeDimensionsFromHandleDrag,
	resizeItems,
} from "@/lib/bambi/crawled-image-editor";

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
		{
			assetId: "asset-1",
			displayHeightPx: null,
			displayWidthPx: null,
			id: "item-1",
			offsetX: 0,
			offsetY: 0,
		},
		{
			assetId: "asset-2",
			displayHeightPx: null,
			displayWidthPx: null,
			id: "item-2",
			offsetX: 0,
			offsetY: 0,
		},
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

	it("keeps the drag-start ratio only for corner handles", () => {
		expect(
			resizeDimensionsFromHandleDrag({
				deltaX: 20,
				deltaY: 5,
				handle: "se",
				startHeight: 100,
				startWidth: 200,
			})
		).toEqual({ height: 110, width: 220 });
		expect(
			resizeDimensionsFromHandleDrag({
				deltaX: 2,
				deltaY: 20,
				handle: "se",
				startHeight: 100,
				startWidth: 200,
			})
		).toEqual({ height: 120, width: 240 });
	});

	it("changes only one axis for side handles", () => {
		expect(
			resizeDimensionsFromHandleDrag({
				deltaX: -20,
				deltaY: 50,
				handle: "e",
				startHeight: 100,
				startWidth: 200,
			})
		).toEqual({ height: 100, width: 180 });
		expect(
			resizeDimensionsFromHandleDrag({
				deltaX: 50,
				deltaY: -20,
				handle: "s",
				startHeight: 100,
				startWidth: 200,
			})
		).toEqual({ height: 80, width: 200 });
	});

	it("keeps the opposite edge fixed with persistent offsets", () => {
		expect(
			anchoredResizeOffsets({
				handle: "w",
				nextHeight: 100,
				nextWidth: 160,
				startHeight: 100,
				startOffsetX: 0,
				startOffsetY: 0,
				startWidth: 200,
			})
		).toEqual({ offsetX: 20, offsetY: 0 });
		expect(
			anchoredResizeOffsets({
				handle: "n",
				nextHeight: 70,
				nextWidth: 200,
				startHeight: 100,
				startOffsetX: 0,
				startOffsetY: 0,
				startWidth: 200,
			})
		).toEqual({ offsetX: 0, offsetY: 30 });
	});

	it("moves a selected group and removes only unused assets", () => {
		const moved = moveItems(document, new Set(["item-2"]), -1);
		expect(moved.items.map((item) => item.id)).toEqual(["item-2", "item-1"]);
		const cleaned = cleanUnusedAssets({ ...moved, items: [moved.items[0]] });
		expect(cleaned.assets.map((asset) => asset.id)).toEqual(["asset-2"]);
	});

	it("calculates decoded Base64 byte lengths including padding", () => {
		expect(base64DataUrlByteLength("data:image/png;base64,AA==")).toBe(1);
		expect(base64DataUrlByteLength("data:image/png;base64,AAA=")).toBe(2);
		expect(base64DataUrlByteLength("data:image/png;base64,AAAA")).toBe(3);
	});

	it("blocks a document whose combined images exceed the save limit", () => {
		const payload = "A".repeat(4 * 1024 * 1024);
		const oversized = {
			...document,
			assets: Array.from({ length: 22 }, (_, index) => ({
				dataUrl: `data:image/png;base64,${payload}`,
				height: 100,
				id: `asset-${index}`,
				width: 200,
			})),
		};
		expect(crawledImageDocumentSizeError(oversized)).toBe(
			CRAWLED_IMAGE_SIZE_ERROR_MESSAGE
		);
	});

	it("replaces payload and network size errors with an actionable message", () => {
		expect(crawledImageSaveErrorMessage("Failed to fetch")).toBe(
			CRAWLED_IMAGE_SIZE_ERROR_MESSAGE
		);
		expect(crawledImageSaveErrorMessage("413 Request Body Too Large")).toBe(
			CRAWLED_IMAGE_SIZE_ERROR_MESSAGE
		);
		expect(crawledImageSaveErrorMessage("revision conflict")).toBe(
			"revision conflict"
		);
	});
});
