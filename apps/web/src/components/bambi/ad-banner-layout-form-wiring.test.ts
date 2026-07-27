import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// jobs.update·moderation.adminUpdateJobPost는 입력 전체를 교체한다. 배너 레이아웃을
// 프리필해서 되돌려 보내지 않는 수정 폼은 저장 한 번으로 구인자의 배너 편집물을 지운다.
// 업로더 prop(adBannerLayout)은 필수라 타입이 잡아주지만, "서버 값으로 채웠는지"는
// 타입이 못 잡으므로 여기서 소스로 확인한다.
const appDir = path.join(import.meta.dirname, "..", "..", "app");

// 경로가 틀리면 readFileSync가 던진다. 존재 확인 후 건너뛰는 식으로 만들면 파일이
// 옮겨졌을 때 가드가 조용히 사라진다.
const readSource = (...segments: string[]) =>
	fs.readFileSync(path.join(appDir, ...segments), "utf8");

// 배너 에디터 결과를 받는 핸들러 본문만 잘라 본다. 파일 전체에서 setMedia를 찾으면 일반
// 이미지 슬롯의 onChange가 대신 통과시켜, 배너 미디어 배선이 빠져도 가드가 초록으로 남는다.
// (prop 정렬상 onAdBannerChange 바로 다음이 onChange다.)
const readAdBannerHandler = (label: string, source: string): string => {
	const start = source.indexOf("onAdBannerChange=");
	const end = source.indexOf("onChange=", start + 1);

	if (start === -1 || end === -1) {
		throw new Error(`${label}: onAdBannerChange 핸들러를 찾지 못했습니다.`);
	}

	return source.slice(start, end);
};

const newPage = [
	"구인자 공고 등록",
	readSource("employer", "new", "page.tsx"),
] as const;
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

describe("배너 레이아웃·이미지 폼 배선", () => {
	it("등록 폼이 배너 레이아웃을 업로더에 잇는다", () => {
		const [, source] = newPage;

		expect(source).toContain("adBannerLayout={form.adBannerLayout}");
		expect(source).toContain("onAdBannerChange=");
	});

	for (const [label, source] of editPages) {
		it(`${label} 폼이 기존 배너 레이아웃을 프리필해 되돌려 보낸다`, () => {
			expect(source).toContain("toJobAdBannerLayoutForm(job)");
			expect(source).toContain("adBannerLayout={form.adBannerLayout}");
			expect(source).toContain("onAdBannerChange=");
		});
	}

	// 배너 이미지는 이제 업로드 슬롯이 아니라 에디터에서 온다. 에디터가 돌려준 media를 폼
	// 상태에 반영하지 않으면 필수 배너 게이트·제출 시 업로드가 그 이미지를 못 본다.
	for (const [label, source] of [newPage, ...editPages]) {
		it(`${label} 폼이 에디터가 돌려준 배너 이미지를 폼 미디어에 반영한다`, () => {
			const handler = readAdBannerHandler(label, source);

			expect(handler).toContain("adBannerLayout: layout");
			expect(handler).toContain("setMedia(nextMedia)");
		});
	}
});
