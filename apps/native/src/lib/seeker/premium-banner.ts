export const premiumBannerHref = (input: {
	id: string;
	source: string;
}): string =>
	input.source === "crawled"
		? `/(seeker)/jobs/crawled/${input.id}`
		: `/(seeker)/jobs/${input.id}`;

export const premiumBannerSlots = <T>(
	items: readonly (T | null)[],
	size = 3
): (T | null)[] =>
	Array.from({ length: size }, (_, index) => items[index] ?? null);
