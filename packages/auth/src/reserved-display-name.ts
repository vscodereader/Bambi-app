const DISPLAY_NAME_IGNORED_CHARACTERS = /[\s\p{P}\p{S}]/gu;

export interface ReservedDisplayNameEntry {
	normalizedTerm: string;
	term: string;
}

export const normalizeReservedDisplayName = (value: string): string =>
	value.toLowerCase().replace(DISPLAY_NAME_IGNORED_CHARACTERS, "");

export const findReservedDisplayNameTerm = (
	value: string,
	entries: ReservedDisplayNameEntry[]
): string | null => {
	const normalized = normalizeReservedDisplayName(value);

	return (
		entries.find(
			(entry) =>
				entry.normalizedTerm.length > 0 &&
				normalized.includes(entry.normalizedTerm)
		)?.term ?? null
	);
};

export const getReservedDisplayNameErrorMessage = (
	value: string,
	entries: ReservedDisplayNameEntry[]
): string | null => {
	const term = findReservedDisplayNameTerm(value, entries);

	return term
		? `닉네임 또는 작성인에 사용할 수 없는 단어가 포함되어 있습니다: '${term}'`
		: null;
};
