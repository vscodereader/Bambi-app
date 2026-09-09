import type {
	CrawledImageAsset,
	CrawledImageItem,
} from "@bambi-app/api/services/bambi-crawled-image-editor";

export function imageLayout(
	asset: CrawledImageAsset,
	item: CrawledImageItem,
	availableWidth: number
) {
	const requestedWidth = item.displayWidthPx ?? asset.width;
	const requestedHeight =
		item.displayHeightPx ??
		Math.round((requestedWidth * asset.height) / asset.width);
	const width = Math.min(requestedWidth, Math.max(0, availableWidth));
	return {
		width,
		height: (width * requestedHeight) / requestedWidth,
		offsetX: item.offsetX,
		offsetY: item.offsetY,
	};
}

export function croppedItem(
	item: CrawledImageItem,
	asset: CrawledImageAsset
): CrawledImageItem {
	return {
		...item,
		assetId: asset.id,
		displayWidthPx:
			item.displayWidthPx === null
				? null
				: Math.min(item.displayWidthPx, asset.width),
		displayHeightPx:
			item.displayHeightPx === null
				? null
				: Math.min(item.displayHeightPx, asset.height),
		offsetX: Math.max(-asset.width, Math.min(asset.width, item.offsetX)),
		offsetY: Math.max(-asset.height, Math.min(asset.height, item.offsetY)),
	};
}
