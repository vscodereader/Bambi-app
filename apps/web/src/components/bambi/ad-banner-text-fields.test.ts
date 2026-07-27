import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// jobs.update·moderation.adminUpdateJobPost는 입력 전체를 교체한다. 배너 문구 5필드를
// 프리필해서 되돌려 보내지 않는 수정 폼은 저장 한 번으로 문구를 null로 지운다.
// 업로더 prop(adBannerText)은 필수라 타입이 잡아주지만, "서버 값으로 채웠는지"는
// 타입이 못 잡으므로 여기서 소스로 확인한다.
const appDir = path.join(import.meta.dirname, "..", "..", "app");

const readSource = (...segments: string[]) =>
	fs.readFileSync(path.join(appDir, ...segments), "utf8");

const editPages = [
	[
		"구인자 공고 수정",
		readSource("employer", "jobs", "[id]", "edit", "page.tsx"),
	],
	[
		"운영자 공고 수정",
		readSource("moderator", "jobs", "[id]", "edit", "page.tsx"),
	],
] as const;

describe("배너 문구 폼 배선", () => {
	it("등록 폼이 배너 문구를 업로더에 잇는다", () => {
		const source = readSource("employer", "new", "page.tsx");

		expect(source).toContain("adBannerText={form}");
		expect(source).toContain("onAdBannerTextChange=");
	});

	for (const [label, source] of editPages) {
		it(`${label} 폼이 기존 배너 문구를 프리필해 되돌려 보낸다`, () => {
			expect(source).toContain("toJobAdBannerTextForm(job)");
			expect(source).toContain("adBannerText={form}");
			expect(source).toContain("onAdBannerTextChange=");
		});
	}
});
