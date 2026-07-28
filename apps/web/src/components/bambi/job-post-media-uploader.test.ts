import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 원래 이 가드는 업로더 안에 있던 시그니처 검증 호출을 지켰다. 그 호출이 공용 모듈로 옮겨
// 갔으므로 가드도 따라간다 — 지키려는 계약은 "파일을 받는 화면은 매직넘버 검증을 우회할 수
// 없다"이지 "특정 파일에 그 문자열이 있다"가 아니다.
// 파일을 못 읽으면 readFileSync가 던진다. 존재 확인 후 건너뛰면 경로가 바뀐 순간 가드가
// 조용히 사라진다.
const read = (relativePath: string) =>
	readFileSync(new URL(relativePath, import.meta.url), "utf8");

const mediaItemSource = read("../../lib/bambi/job-media-item.ts");

// 파일을 받아 폼 상태로 만드는 화면들. 배너 이미지가 에디터로 옮겨가면서 진입점이 둘이 됐다.
const fileConsumers = [
	["공고 미디어 업로더", read("./job-post-media-uploader.tsx")],
	["배너 에디터 이미지 슬롯", read("./ad-banner-editor/editor-image-slot.tsx")],
] as const;

describe("업로드 파일 시그니처 검증", () => {
	it("공용 모듈이 매직넘버로 형식을 실제 검증한다", () => {
		expect(mediaItemSource).toContain("detectImageSignature");
		expect(mediaItemSource).toContain("isSignatureMismatch");
	});

	for (const [label, source] of fileConsumers) {
		it(`${label}이 공용 모듈을 거쳐 파일을 받는다`, () => {
			// 여기를 우회해 직접 File을 폼 항목으로 만들면 위조된 확장자가 그대로 통과하고,
			// 원본 치수도 붙지 않아 배너 비율 검증이 통째로 무력해진다.
			expect(source).toContain("createMediaItemFromFile");
		});
	}
});
