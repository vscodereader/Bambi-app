// `@/` alias는 web용 vitest config가 없어 풀리지 않는다. 상대 경로로 import한다.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	createMediaItemFromFile,
	revokeMediaItemPreview,
} from "./job-media-item";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const makeFile = (bytes: number[], type: string, name = "banner.png"): File =>
	new File([new Uint8Array([...bytes, 0, 0, 0, 0])], name, { type });

// jsdom/node 어디에도 없는 브라우저 API라 스텁이 없으면 테스트가 아니라 환경이 터진다.
const stubBrowserApis = ({
	height = 300,
	width = 700,
}: {
	height?: number;
	width?: number;
} = {}) => {
	const revokeObjectURL = vi.fn();

	vi.stubGlobal("URL", {
		createObjectURL: vi.fn(() => "blob:preview"),
		revokeObjectURL,
	});
	vi.stubGlobal(
		"createImageBitmap",
		vi.fn(() => Promise.resolve({ close: vi.fn(), height, width }))
	);

	return { revokeObjectURL };
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("createMediaItemFromFile", () => {
	it("rejects a file whose magic number contradicts its declared type", async () => {
		// 확장자·File.type만 바꾼 위조 파일. 여기서 막지 않으면 업로드 인텐트까지 흘러간다.
		stubBrowserApis();

		const result = await createMediaItemFromFile(
			makeFile([0x00, 0x01, 0x02, 0x03], "image/png")
		);

		expect(result).toEqual({ reason: "signature-mismatch" });
	});

	it("attaches a preview url and the source dimensions", async () => {
		// 치수가 빠지면 비율 검증이 판단할 근거를 잃어 모든 배너가 "크기를 확인하지 못했습니다"로
		// 반려된다.
		stubBrowserApis({ height: 300, width: 700 });

		const result = await createMediaItemFromFile(
			makeFile(PNG_SIGNATURE, "image/png"),
			"가로 배너"
		);

		expect(result).toEqual({
			item: expect.objectContaining({
				altText: "가로 배너",
				height: 300,
				mimeType: "image/png",
				previewUrl: "blob:preview",
				width: 700,
			}),
		});
	});

	it("still returns the item when the dimensions cannot be read", async () => {
		// 손상된 파일이어도 업로드 자체는 막지 않는다 — 폼 검증이 잡는다.
		vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview") });
		vi.stubGlobal(
			"createImageBitmap",
			vi.fn(() => Promise.reject(new Error("decode failed")))
		);

		const result = await createMediaItemFromFile(
			makeFile(PNG_SIGNATURE, "image/png")
		);

		expect(result).toEqual({
			item: expect.objectContaining({ previewUrl: "blob:preview" }),
		});
		expect(result).not.toHaveProperty("item.width");
	});
});

describe("revokeMediaItemPreview", () => {
	it("releases a blob preview", async () => {
		const { revokeObjectURL } = stubBrowserApis();
		const result = await createMediaItemFromFile(
			makeFile(PNG_SIGNATURE, "image/png")
		);

		revokeMediaItemPreview("item" in result ? result.item : null);

		expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
	});

	it("leaves an uploaded GCS url alone", () => {
		// storageKey가 있는 항목의 previewUrl은 공개 URL이다. revoke하면 안 되고, 해도 아무
		// 효과가 없어야 한다 — blob: 접두사 검사가 유일한 가드다.
		const { revokeObjectURL } = stubBrowserApis();

		revokeMediaItemPreview({
			altText: "",
			byteSize: 1,
			fileName: "banner.png",
			mimeType: "image/png",
			previewUrl: "https://storage.googleapis.com/bambi-storage-public/a.png",
			storageKey: "a.png",
		});
		revokeMediaItemPreview(null);

		expect(revokeObjectURL).not.toHaveBeenCalled();
	});
});
