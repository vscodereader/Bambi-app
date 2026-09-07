import { afterEach, describe, expect, it, vi } from "vitest";

import { readLocalFileBytes } from "./local-file-bytes";

// fetch를 stub해 expo/fetch(arrayBuffer 경로)를 흉내 낸다 — Blob은 거치지 않는다.
const stubFetch = (opts: {
	body?: ArrayBuffer;
	contentType?: null | string;
	ok?: boolean;
	status?: number;
}) => {
	vi.stubGlobal(
		"fetch",
		vi.fn(() =>
			Promise.resolve({
				arrayBuffer: () => Promise.resolve(opts.body ?? new ArrayBuffer(0)),
				headers: { get: () => opts.contentType ?? null },
				ok: opts.ok ?? true,
				status: opts.status ?? 200,
			})
		)
	);
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("readLocalFileBytes", () => {
	it("arrayBuffer를 Uint8Array로 바꾸고 byteLength가 실측 크기다", async () => {
		const source = new Uint8Array([1, 2, 3, 4, 5]);
		stubFetch({ body: source.buffer, contentType: "image/jpeg" });

		const { bytes, mimeType } = await readLocalFileBytes("file:///photo.jpg");

		expect(bytes).toBeInstanceOf(Uint8Array);
		expect(bytes.byteLength).toBe(5);
		expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
		expect(mimeType).toBe("image/jpeg");
	});

	it("content-type이 없으면 mimeType은 null이다", async () => {
		stubFetch({ body: new Uint8Array([9]).buffer, contentType: null });

		const { mimeType } = await readLocalFileBytes("file:///x.bin");

		expect(mimeType).toBeNull();
	});

	it("!ok면 throw한다", async () => {
		stubFetch({ ok: false, status: 404 });

		await expect(readLocalFileBytes("file:///missing")).rejects.toThrow(
			"local file read failed: 404"
		);
	});
});
