import type {
	CrawledJobEditedImageAsset,
	CrawledJobEditedImageDocument,
} from "@bambi-app/db/schema/bambi";
import { z } from "zod";

const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;
const MAX_ASSETS = 30;
const MAX_ITEMS = 60;
const DATA_URL_PATTERN =
	/^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

const imageAssetSchema = z
	.object({
		dataUrl: z.string(),
		height: z.number().int().positive(),
		id: z.uuid(),
		width: z.number().int().positive(),
	})
	.strict();

const imageItemSchema = z
	.object({
		assetId: z.uuid(),
		displayHeightPx: z
			.number()
			.int()
			.positive()
			.nullable()
			.optional()
			.default(null),
		displayWidthPx: z.number().int().positive().nullable(),
		id: z.uuid(),
	})
	.strict();

const hasExpectedMagicBytes = (mime: string, bytes: Buffer): boolean => {
	if (mime === "image/jpeg") {
		return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	}
	if (mime === "image/png") {
		return bytes
			.subarray(0, 8)
			.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	}
	if (mime === "image/gif") {
		const header = bytes.subarray(0, 6).toString("ascii");
		return header === "GIF87a" || header === "GIF89a";
	}
	return (
		mime === "image/webp" &&
		bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
		bytes.subarray(8, 12).toString("ascii") === "WEBP"
	);
};

const readJpegDimensions = (
	bytes: Buffer
): { height: number; width: number } | null => {
	let offset = 2;
	while (offset + 8 < bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		const marker = bytes[offset + 1] ?? 0;
		const length = bytes.readUInt16BE(offset + 2);
		if (marker >= 0xc0 && marker <= 0xc3) {
			return {
				height: bytes.readUInt16BE(offset + 5),
				width: bytes.readUInt16BE(offset + 7),
			};
		}
		if (length < 2) {
			return null;
		}
		offset += 2 + length;
	}
	return null;
};

const readWebpDimensions = (
	bytes: Buffer
): { height: number; width: number } | null => {
	const chunk = bytes.subarray(12, 16).toString("ascii");
	if (chunk === "VP8X" && bytes.length >= 30) {
		return {
			height: 1 + bytes.readUIntLE(27, 3),
			width: 1 + bytes.readUIntLE(24, 3),
		};
	}
	if (chunk === "VP8 " && bytes.length >= 30) {
		return {
			height: bytes.readUInt16LE(28) % 16_384,
			width: bytes.readUInt16LE(26) % 16_384,
		};
	}
	if (chunk === "VP8L" && bytes.length >= 25) {
		const bits = bytes.readUInt32LE(21);
		return {
			height: 1 + (Math.floor(bits / 16_384) % 16_384),
			width: 1 + (bits % 16_384),
		};
	}
	return null;
};

const readImageDimensions = (
	mime: string,
	bytes: Buffer
): { height: number; width: number } | null => {
	if (mime === "image/png" && bytes.length >= 24) {
		return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
	}
	if (mime === "image/gif" && bytes.length >= 10) {
		return { height: bytes.readUInt16LE(8), width: bytes.readUInt16LE(6) };
	}
	if (mime === "image/jpeg") {
		return readJpegDimensions(bytes);
	}
	return mime === "image/webp" ? readWebpDimensions(bytes) : null;
};

const decodeAsset = (
	asset: Pick<CrawledJobEditedImageAsset, "dataUrl">
): {
	bytes: Buffer;
	dimensions: { height: number; width: number };
	mime: string;
} | null => {
	const match = DATA_URL_PATTERN.exec(asset.dataUrl);
	if (!match) {
		return null;
	}
	const bytes = Buffer.from(match[2] ?? "", "base64");
	const mime = match[1] ?? "";
	const dimensions = readImageDimensions(mime, bytes);
	return hasExpectedMagicBytes(mime, bytes) && dimensions
		? { bytes, dimensions, mime }
		: null;
};

export const crawledJobEditedImageDocumentSchema = z
	.object({
		assets: z.array(imageAssetSchema).max(MAX_ASSETS),
		items: z.array(imageItemSchema).max(MAX_ITEMS),
		version: z.literal(1),
	})
	.strict()
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 서로 참조하는 이미지·배치·용량 제약을 한 검증 결과로 모은다.
	.superRefine((document, context) => {
		const assetIds = new Set<string>();
		const itemIds = new Set<string>();
		let totalBytes = 0;

		for (const asset of document.assets) {
			if (assetIds.has(asset.id)) {
				context.addIssue({
					code: "custom",
					message: "이미지 ID가 중복되었습니다.",
				});
			}
			assetIds.add(asset.id);
			const decoded = decodeAsset(asset);
			if (!decoded) {
				context.addIssue({
					code: "custom",
					message: "지원하지 않거나 손상된 이미지입니다.",
				});
				continue;
			}
			if (
				decoded.dimensions.width !== asset.width ||
				decoded.dimensions.height !== asset.height
			) {
				context.addIssue({
					code: "custom",
					message: "이미지 크기 정보가 실제 파일과 다릅니다.",
				});
			}
			if (decoded.bytes.byteLength > MAX_ASSET_BYTES) {
				context.addIssue({
					code: "custom",
					message: "이미지 한 장은 8MB 이하여야 합니다.",
				});
			}
			totalBytes += decoded.bytes.byteLength;
		}

		for (const item of document.items) {
			if (itemIds.has(item.id)) {
				context.addIssue({
					code: "custom",
					message: "배치 항목 ID가 중복되었습니다.",
				});
			}
			itemIds.add(item.id);
			const asset = document.assets.find(
				(candidate) => candidate.id === item.assetId
			);
			if (!asset) {
				context.addIssue({
					code: "custom",
					message: "배치 항목이 없는 이미지를 참조합니다.",
				});
				continue;
			}
			const minimumWidth = Math.min(50, asset.width);
			const minimumHeight = Math.min(50, asset.height);
			if (
				item.displayWidthPx !== null &&
				(item.displayWidthPx < minimumWidth ||
					item.displayWidthPx > asset.width)
			) {
				context.addIssue({
					code: "custom",
					message: "표시 너비가 허용 범위를 벗어났습니다.",
				});
			}
			if (
				item.displayHeightPx !== null &&
				(item.displayHeightPx < minimumHeight ||
					item.displayHeightPx > asset.height)
			) {
				context.addIssue({
					code: "custom",
					message: "표시 높이가 허용 범위를 벗어났습니다.",
				});
			}
		}

		const referencedIds = new Set(document.items.map((item) => item.assetId));
		if (document.assets.some((asset) => !referencedIds.has(asset.id))) {
			context.addIssue({
				code: "custom",
				message: "사용하지 않는 이미지가 포함되었습니다.",
			});
		}
		if (totalBytes > MAX_DOCUMENT_BYTES) {
			context.addIssue({
				code: "custom",
				message: "전체 이미지는 16MB 이하여야 합니다.",
			});
		}
	});

export const createOriginalImageDocument = (
	detailImageUrls: string[]
): CrawledJobEditedImageDocument => {
	const assets = detailImageUrls.flatMap((dataUrl) => {
		const decoded = decodeAsset({ dataUrl });
		return decoded
			? [
					{
						dataUrl,
						height: decoded.dimensions.height,
						id: crypto.randomUUID(),
						width: decoded.dimensions.width,
					},
				]
			: [];
	});
	return attachOriginalItems({ assets, items: [], version: 1 });
};

export const attachOriginalItems = (
	document: CrawledJobEditedImageDocument
): CrawledJobEditedImageDocument => ({
	...document,
	items: document.assets.map((asset) => ({
		assetId: asset.id,
		displayHeightPx: null,
		displayWidthPx: null,
		id: crypto.randomUUID(),
	})),
});
