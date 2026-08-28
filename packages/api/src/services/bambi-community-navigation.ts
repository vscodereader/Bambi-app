export interface CommunityNavigationCandidate {
	boardKey: string;
	createdAt: Date;
	id: string;
	source: "crawled" | "native";
	title: string;
}

export const compareCommunityNavigationCandidates = (
	left: CommunityNavigationCandidate,
	right: CommunityNavigationCandidate
): number => {
	const createdAtDifference =
		left.createdAt.getTime() - right.createdAt.getTime();
	return createdAtDifference || left.id.localeCompare(right.id);
};

export const pickCommunityNavigationNeighbor = (
	candidates: Array<CommunityNavigationCandidate | null>,
	direction: "next" | "previous"
): CommunityNavigationCandidate | undefined => {
	const ordered = candidates
		.filter(
			(candidate): candidate is CommunityNavigationCandidate =>
				candidate !== null
		)
		.toSorted(compareCommunityNavigationCandidates);
	return direction === "previous" ? ordered.at(-1) : ordered.at(0);
};
