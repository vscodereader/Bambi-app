export interface CrawledImageAsset {
	dataUrl: string;
	height: number;
	id: string;
	width: number;
}

export interface CrawledImageItem {
	assetId: string;
	displayWidthPx: number | null;
	id: string;
}

export interface CrawledImageDocument {
	assets: CrawledImageAsset[];
	items: CrawledImageItem[];
	version: 1;
}

export type ResizeHandle = "e" | "n" | "ne" | "nw" | "s" | "se" | "sw" | "w";

const DATA_URL_MIME_PATTERN = /^data:([^;]+);base64,/;

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
		return {
			...item,
			displayWidthPx: Math.max(
				minimumWidth,
				Math.min(asset.width, Math.round(targetWidth))
			),
		};
	}),
});

export const resizeWidthFromHandleDrag = ({
	aspectRatio,
	handle,
	deltaX,
	deltaY,
	startWidth,
}: {
	aspectRatio: number;
	handle: ResizeHandle;
	deltaX: number;
	deltaY: number;
	startWidth: number;
}): number => {
	let horizontalDelta: number | null = null;
	if (handle.includes("w")) {
		horizontalDelta = -deltaX;
	} else if (handle.includes("e")) {
		horizontalDelta = deltaX;
	}
	let verticalDelta: number | null = null;
	if (handle.includes("n")) {
		verticalDelta = -deltaY * aspectRatio;
	} else if (handle.includes("s")) {
		verticalDelta = deltaY * aspectRatio;
	}
	if (horizontalDelta === null) {
		return startWidth + (verticalDelta ?? 0);
	}
	if (verticalDelta === null) {
		return startWidth + horizontalDelta;
	}
	const widthDelta =
		Math.abs(horizontalDelta) >= Math.abs(verticalDelta)
			? horizontalDelta
			: verticalDelta;
	return startWidth + widthDelta;
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
