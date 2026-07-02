export const getVisibleModerationData = <T>({
	apiData,
	hasApiData,
	previewData,
}: {
	apiData: T[] | undefined;
	hasApiData: boolean;
	previewData: T[];
}): T[] => {
	if (hasApiData) {
		return apiData ?? [];
	}

	return previewData;
};
