export const mergeReviewPages = <T extends { id: string }>(
	pages: readonly { items: readonly T[] }[]
): T[] => {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const item of pages.flatMap((page) => page.items)) {
		if (!seen.has(item.id)) {
			seen.add(item.id);
			result.push(item);
		}
	}
	return result;
};

export const reviewStars = (rating: number): string =>
	"★".repeat(Math.max(0, Math.min(5, rating))) +
	"☆".repeat(Math.max(0, 5 - Math.min(5, rating)));
