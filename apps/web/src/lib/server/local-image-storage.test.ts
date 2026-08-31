import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { putLocalImage, readLocalImage } from "./local-image-storage";

const PNG_BYTES = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
	"base64"
);
const TEST_KEY_ROOT = "test-local-image";
const TEST_STORAGE_DIRECTORY = "test-local-images";

describe("local image storage", () => {
	it("writes and reads the exact image bytes within the configured key root", async () => {
		const fileName = `${randomUUID()}.png`;
		const storageKey = `${TEST_KEY_ROOT}/${fileName}`;
		const url = `http://localhost/bambi/test?key=${encodeURIComponent(storageKey)}`;
		const filePath = path.resolve(
			process.cwd(),
			".local-storage",
			TEST_STORAGE_DIRECTORY,
			fileName
		);

		try {
			const putResponse = await putLocalImage({
				keyRoot: TEST_KEY_ROOT,
				request: new NextRequest(url, {
					body: PNG_BYTES,
					headers: {
						"Content-Length": String(PNG_BYTES.byteLength),
						"Content-Type": "image/png",
					},
					method: "PUT",
				}),
				storageDirectory: TEST_STORAGE_DIRECTORY,
			});
			expect(putResponse.status).toBe(204);

			const getResponse = await readLocalImage({
				keyRoot: TEST_KEY_ROOT,
				request: new NextRequest(url),
				storageDirectory: TEST_STORAGE_DIRECTORY,
			});
			expect(getResponse?.status).toBe(200);
			if (!getResponse) {
				throw new Error("Expected the stored image response.");
			}
			expect(
				Buffer.from(await getResponse.arrayBuffer()).equals(PNG_BYTES)
			).toBe(true);
		} finally {
			await unlink(filePath).catch(() => undefined);
		}
	});

	it("rejects path traversal and mismatched file signatures", async () => {
		const traversal = await putLocalImage({
			keyRoot: TEST_KEY_ROOT,
			request: new NextRequest(
				`http://localhost/bambi/test?key=${encodeURIComponent(`${TEST_KEY_ROOT}/../escape.png`)}`,
				{
					body: PNG_BYTES,
					headers: {
						"Content-Length": String(PNG_BYTES.byteLength),
						"Content-Type": "image/png",
					},
					method: "PUT",
				}
			),
			storageDirectory: TEST_STORAGE_DIRECTORY,
		});
		expect(traversal.status).toBe(400);

		const mismatch = await putLocalImage({
			keyRoot: TEST_KEY_ROOT,
			request: new NextRequest(
				`http://localhost/bambi/test?key=${TEST_KEY_ROOT}/mismatch.jpg`,
				{
					body: PNG_BYTES,
					headers: {
						"Content-Length": String(PNG_BYTES.byteLength),
						"Content-Type": "image/jpeg",
					},
					method: "PUT",
				}
			),
			storageDirectory: TEST_STORAGE_DIRECTORY,
		});
		expect(mismatch.status).toBe(400);
	});
});
