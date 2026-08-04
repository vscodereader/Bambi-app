import { describe, expect, it } from "vitest";
import {
	crawledJobEditedImageDocumentSchema,
	createOriginalImageDocument,
} from "./bambi-crawled-image-document";

const PNG_1X1 =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const ASSET_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";

const document = {
	assets: [{ dataUrl: PNG_1X1, height: 1, id: ASSET_ID, width: 1 }],
	items: [{ assetId: ASSET_ID, displayWidthPx: null, id: ITEM_ID }],
	version: 1 as const,
};

describe("crawledJobEditedImageDocumentSchema", () => {
	it("accepts a valid original image and reads its dimensions", () => {
		expect(
			crawledJobEditedImageDocumentSchema.safeParse(document).success
		).toBe(true);
		const original = createOriginalImageDocument([PNG_1X1]);
		expect(original.assets[0]).toMatchObject({ height: 1, width: 1 });
		expect(original.items).toHaveLength(1);
	});

	it("allows copied items to share one asset", () => {
		const copied = {
			...document,
			items: [
				...document.items,
				{ ...document.items[0], id: "33333333-3333-4333-8333-333333333333" },
			],
		};
		expect(crawledJobEditedImageDocumentSchema.safeParse(copied).success).toBe(
			true
		);
	});

	it("rejects unused assets, broken references and false dimensions", () => {
		expect(
			crawledJobEditedImageDocumentSchema.safeParse({ ...document, items: [] })
				.success
		).toBe(false);
		expect(
			crawledJobEditedImageDocumentSchema.safeParse({
				...document,
				items: [
					{
						...document.items[0],
						assetId: "44444444-4444-4444-8444-444444444444",
					},
				],
			}).success
		).toBe(false);
		expect(
			crawledJobEditedImageDocumentSchema.safeParse({
				...document,
				assets: [{ ...document.assets[0], width: 2 }],
			}).success
		).toBe(false);
	});
});
