export interface CrawledImageAsset {
	dataUrl: string;
	height: number;
	id: string;
	width: number;
}

export interface CrawledImageItem {
	assetId: string;
	displayHeightPx: number | null;
	displayWidthPx: number | null;
	id: string;
	offsetX: number;
	offsetY: number;
}

export interface CrawledImageDocument {
	assets: CrawledImageAsset[];
	items: CrawledImageItem[];
	version: 1;
}

export type ResizeHandle = "e" | "n" | "ne" | "nw" | "s" | "se" | "sw" | "w";

export interface ResizeDimensions {
	height: number;
	width: number;
}

export interface ResizeOffsets {
	offsetX: number;
	offsetY: number;
}

const DATA_URL_MIME_PATTERN = /^data:([^;]+);base64,/;
const BASE64_DATA_URL_PATTERN = /^data:[^;]+;base64,([A-Za-z0-9+/]+={0,2})$/;

export const CRAWLED_IMAGE_MAX_ASSET_BYTES = 32 * 1024 * 1024;
export const CRAWLED_IMAGE_MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;

export const CRAWLED_IMAGE_SIZE_ERROR_MESSAGE =
	"이미지 용량이 저장 가능한 크기를 초과하여 저장할 수 없습니다. 이미지 크기를 줄이거나 일부 이미지를 삭제해 주세요.";

export const base64DataUrlByteLength = (dataUrl: string): number | null => {
	const payload = BASE64_DATA_URL_PATTERN.exec(dataUrl)?.[1];
	if (!payload) {
		return null;
	}
	let padding = 0;
	if (payload.endsWith("==")) {
		padding = 2;
	} else if (payload.endsWith("=")) {
		padding = 1;
	}
	return Math.floor((payload.length * 3) / 4) - padding;
};

export const crawledImageDocumentSizeError = (
	document: CrawledImageDocument
): string | null => {
	let totalBytes = 0;
	for (const asset of document.assets) {
		const byteLength = base64DataUrlByteLength(asset.dataUrl);
		if (byteLength === null) {
			continue;
		}
		if (byteLength > CRAWLED_IMAGE_MAX_ASSET_BYTES) {
			return CRAWLED_IMAGE_SIZE_ERROR_MESSAGE;
		}
		totalBytes += byteLength;
	}
	return totalBytes > CRAWLED_IMAGE_MAX_DOCUMENT_BYTES
		? CRAWLED_IMAGE_SIZE_ERROR_MESSAGE
		: null;
};

export const crawledImageSaveErrorMessage = (message: string): string => {
	const normalized = message.toLowerCase();
	return normalized.includes("failed to fetch") ||
		normalized.includes("request body too large") ||
		normalized.includes("content too large") ||
		normalized.includes("413")
		? CRAWLED_IMAGE_SIZE_ERROR_MESSAGE
		: message || "이미지 편집 결과를 저장하지 못했습니다.";
};

export const cloneImageDocument = (
	document: CrawledImageDocument
): CrawledImageDocument => structuredClone(document);

export const cleanUnusedAssets = (
	document: CrawledImageDocument
): CrawledImageDocument => {
	const referenced = new Set(document.items.map((item) => item.assetId));
	return {
		...document,
		assets: document.assets.filter((asset) => referenced.has(asset.id)),
	};
};

export const resizeItems = (
	document: CrawledImageDocument,
	itemIds: ReadonlySet<string>,
	targetWidth: number
): CrawledImageDocument => ({
	...document,
	items: document.items.map((item) => {
		if (!itemIds.has(item.id)) {
			return item;
		}
		const asset = document.assets.find(
			(candidate) => candidate.id === item.assetId
		);
		if (!asset) {
			return item;
		}
		const minimumWidth = Math.min(50, asset.width);
		const currentWidth = item.displayWidthPx ?? asset.width;
		const currentHeight =
			item.displayHeightPx ??
			Math.round((currentWidth * asset.height) / asset.width);
		return {
			...item,
			displayHeightPx: currentHeight,
			displayWidthPx: Math.max(
				minimumWidth,
				Math.min(asset.width, Math.round(targetWidth))
			),
		};
	}),
});

export const resizeItemDimensions = (
	document: CrawledImageDocument,
	itemIds: ReadonlySet<string>,
	target: ResizeDimensions,
	preserveAspectRatio = false
): CrawledImageDocument => ({
	...document,
	items: document.items.map((item) => {
		if (!itemIds.has(item.id)) {
			return item;
		}
		const asset = document.assets.find(
			(candidate) => candidate.id === item.assetId
		);
		if (!asset) {
			return item;
		}
		const minimumWidth = Math.min(50, asset.width);
		const minimumHeight = Math.min(50, asset.height);
		if (preserveAspectRatio) {
			const targetAspectRatio = target.width / target.height;
			const aspectRatio =
				Number.isFinite(targetAspectRatio) && targetAspectRatio > 0
					? targetAspectRatio
					: asset.width / asset.height;
			const width = Math.max(
				Math.max(minimumWidth, minimumHeight * aspectRatio),
				Math.min(
					Math.min(asset.width, asset.height * aspectRatio),
					target.width
				)
			);
			return {
				...item,
				displayHeightPx: Math.round(width / aspectRatio),
				displayWidthPx: Math.round(width),
			};
		}
		return {
			...item,
			displayHeightPx: Math.max(
				minimumHeight,
				Math.min(asset.height, Math.round(target.height))
			),
			displayWidthPx: Math.max(
				minimumWidth,
				Math.min(asset.width, Math.round(target.width))
			),
		};
	}),
});

export const resizeDimensionsFromHandleDrag = ({
	handle,
	deltaX,
	deltaY,
	startHeight,
	startWidth,
}: {
	handle: ResizeHandle;
	deltaX: number;
	deltaY: number;
	startHeight: number;
	startWidth: number;
}): ResizeDimensions => {
	let horizontalDelta: number | null = null;
	if (handle.includes("w")) {
		horizontalDelta = -deltaX;
	} else if (handle.includes("e")) {
		horizontalDelta = deltaX;
	}
	let verticalDelta: number | null = null;
	if (handle.includes("n")) {
		verticalDelta = -deltaY;
	} else if (handle.includes("s")) {
		verticalDelta = deltaY;
	}
	if (horizontalDelta === null) {
		return { height: startHeight + (verticalDelta ?? 0), width: startWidth };
	}
	if (verticalDelta === null) {
		return { height: startHeight, width: startWidth + horizontalDelta };
	}
	const aspectRatio = startWidth / startHeight;
	const verticalWidthDelta = verticalDelta * aspectRatio;
	const widthDelta =
		Math.abs(horizontalDelta) >= Math.abs(verticalWidthDelta)
			? horizontalDelta
			: verticalWidthDelta;
	const width = startWidth + widthDelta;
	return { height: width / aspectRatio, width };
};

export const anchoredResizeOffsets = ({
	handle,
	nextHeight,
	nextWidth,
	startHeight,
	startOffsetX,
	startOffsetY,
	startWidth,
}: {
	handle: ResizeHandle;
	nextHeight: number;
	nextWidth: number;
	startHeight: number;
	startOffsetX: number;
	startOffsetY: number;
	startWidth: number;
}): ResizeOffsets => {
	let offsetX = startOffsetX;
	if (handle.includes("w")) {
		offsetX += (startWidth - nextWidth) / 2;
	} else if (handle.includes("e")) {
		offsetX += (nextWidth - startWidth) / 2;
	}
	const offsetY = handle.includes("n")
		? startOffsetY + startHeight - nextHeight
		: startOffsetY;
	return { offsetX: Math.round(offsetX), offsetY: Math.round(offsetY) };
};

export const moveItems = (
	document: CrawledImageDocument,
	itemIds: ReadonlySet<string>,
	direction: -1 | 1
): CrawledImageDocument => {
	const items = [...document.items];
	const indexes = items.flatMap((item, index) =>
		itemIds.has(item.id) ? [index] : []
	);
	if (indexes.length === 0) {
		return document;
	}
	const first = indexes[0] ?? 0;
	const last = indexes.at(-1) ?? first;
	if (
		(direction === -1 && first === 0) ||
		(direction === 1 && last === items.length - 1)
	) {
		return document;
	}
	const selected = items.filter((item) => itemIds.has(item.id));
	const remaining = items.filter((item) => !itemIds.has(item.id));
	const target = direction === -1 ? first - 1 : first + 1;
	remaining.splice(target, 0, ...selected);
	return { ...document, items: remaining };
};

export const duplicateItems = (
	document: CrawledImageDocument,
	items: CrawledImageItem[],
	insertionIndex: number
): { document: CrawledImageDocument; insertedIds: string[] } => {
	const duplicates = items.map((item) => ({
		...item,
		id: crypto.randomUUID(),
	}));
	const nextItems = [...document.items];
	nextItems.splice(
		Math.max(0, Math.min(insertionIndex, nextItems.length)),
		0,
		...duplicates
	);
	return {
		document: { ...document, items: nextItems },
		insertedIds: duplicates.map((item) => item.id),
	};
};

export const imageMime = (dataUrl: string): string =>
	DATA_URL_MIME_PATTERN.exec(dataUrl)?.[1] ?? "application/octet-stream";

export const imageExtension = (dataUrl: string): string => {
	const mime = imageMime(dataUrl);
	return mime === "image/jpeg" ? "jpg" : mime.replace("image/", "");
};
