// docs/manual/*.md를 읽어 파싱한다. node:fs를 쓰는 서버 전용 모듈 —
// 클라이언트에서 import 금지(순수 파싱은 manual-parse.ts에 있다).
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ManualKey } from "./manual";
import { type ParsedManual, parseManual } from "./manual-parse";

const MANUAL_FILES: Record<ManualKey, string> = {
	seeker: "seeker-manual.md",
	employer: "employer-manual.md",
	moderator: "moderator-manual.md",
};

// next dev/build의 cwd는 apps/web, 루트에서 도는 도구는 리포 루트 — 둘 다 시도한다.
const MANUAL_DIR_CANDIDATES = [
	["..", "..", "docs", "manual"],
	["docs", "manual"],
];

export async function loadManual(key: ManualKey): Promise<ParsedManual | null> {
	for (const segments of MANUAL_DIR_CANDIDATES) {
		const filePath = path.join(process.cwd(), ...segments, MANUAL_FILES[key]);
		try {
			const raw = await fs.readFile(filePath, "utf8");
			return parseManual(raw);
		} catch {
			// 다음 후보 경로 시도. 전부 실패하면 null → 페이지가 notFound() 처리.
		}
	}
	return null;
}
