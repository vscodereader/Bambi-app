import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const source = readFileSync(
	srcPath("components/bambi/secret-author-mark.tsx"),
	"utf8"
);
const tokenSource = readFileSync(srcPath("styles/bambi/tokens.css"), "utf8");

describe("성별 아이콘 테마", () => {
	it("라이트모드의 남녀 표식 색상을 다크모드에서도 유지한다", () => {
		expect(source).toContain("rounded-full text-ink-900");
		expect(source).toContain('? "bg-sky-200"');
		expect(source).toContain(': "bg-[var(--gender-female-bg)]"');
		expect(source).not.toContain("text-foreground");
		expect(source).not.toContain("bg-primary/15");
		expect(tokenSource).toContain("--gender-female-bg: color-mix(");
	});
});
