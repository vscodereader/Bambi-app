const INDUSTRY_SEGMENT_SEPARATOR = /\s*·\s*|\s+[-–—]\s+/u;

const normalizeMetadataValue = (value: null | string | undefined): string =>
	value?.replace(/\s+/gu, " ").trim() ?? "";

export interface JobMetadataInput {
	district?: null | string;
	industryCategory?: null | string;
	industryRaw?: null | string;
	region?: null | string;
}

export interface JobMetadataItem {
	kind: "district" | "industry" | "region";
	label: string;
}

export const buildJobMetadataItems = ({
	district,
	industryCategory,
	industryRaw,
	region,
}: JobMetadataInput): JobMetadataItem[] => {
	const values: JobMetadataItem[] = [
		{ kind: "region", label: normalizeMetadataValue(region) },
		{ kind: "district", label: normalizeMetadataValue(district) },
		{ kind: "industry", label: normalizeMetadataValue(industryCategory) },
	];
	const rawIndustrySegments = normalizeMetadataValue(industryRaw)
		.split(INDUSTRY_SEGMENT_SEPARATOR)
		.map(normalizeMetadataValue)
		.map((label): JobMetadataItem => ({ kind: "industry", label }));
	values.push(...rawIndustrySegments);

	const seen = new Set<string>();
	const result: JobMetadataItem[] = [];
	for (const item of values) {
		const normalized = normalizeMetadataValue(item.label);
		if (!normalized || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		result.push({ ...item, label: normalized });
	}
	return result;
};
