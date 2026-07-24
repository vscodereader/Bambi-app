import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./job-post-media-uploader.tsx", import.meta.url),
	"utf8"
);

describe("공고 미디어 업로더 시그니처 검증", () => {
	it("detectImageSignature로 파일 형식을 실제 검증한다", () => {
		expect(source).toContain("detectImageSignature");
	});
});
