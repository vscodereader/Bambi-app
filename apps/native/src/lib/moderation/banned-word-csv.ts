const SEPARATOR = /[\n,]/;

export const parseBannedWordCsv = (text: string): string[] => {
	const seen = new Set<string>();
	const terms: string[] = [];
	for (const value of text.split(SEPARATOR)) {
		const term = value.trim();
		if (term && !seen.has(term)) {
			seen.add(term);
			terms.push(term);
		}
	}
	return terms;
};
