import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = (fileName: string) =>
	path.join(import.meta.dirname, fileName);

const readComponent = (fileName: string) =>
	fs.readFileSync(componentPath(fileName), "utf8");

describe("visual job marketplace components", () => {
	it("defines a compact visual job card with promotion, safety, and chat affordances", () => {
		const source = readComponent("visual-job-card.tsx");

		expect(source).toContain("export function VisualJobCard");
		expect(source).toContain('tone: "recommended" | "special" | "urgent"');
		expect(source).toContain("연락처 보호");
		expect(source).toContain("job.promotionLabel ?? toneLabel[tone]");
		expect(source).toContain("rightIcon={<Message />}");
	});

	it("defines a dense job row with selected state, verification, and chat affordances", () => {
		const source = readComponent("dense-job-row.tsx");

		expect(source).toContain("export function DenseJobRow");
		expect(source).toContain("active = false");
		expect(source).toContain("job.verified");
		expect(source).toContain("검수");
		expect(source).toContain("rightIcon={<Message />}");
	});
});
