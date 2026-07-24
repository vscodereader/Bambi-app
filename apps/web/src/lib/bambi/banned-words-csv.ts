// 단일 컬럼 금칙어 목록 CSV/텍스트를 파싱한다. 개행·쉼표를 구분자로, trim·빈값 제거·중복 제거.
const SEPARATOR_RE = /[\n,]/;

export function parseBannedWordsCsv(text: string): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of text.split(SEPARATOR_RE)) {
		const term = raw.trim();
		if (term.length === 0 || seen.has(term)) {
			continue;
		}
		seen.add(term);
		result.push(term);
	}
	return result;
}
