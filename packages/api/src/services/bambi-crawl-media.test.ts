import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";

import type { CrawlBinary, CrawlClient } from "./bambi-crawl-fetch";
import {
	CRAWLED_IMAGE_MAX_BYTES,
	embedCrawledImage,
	embedCrawledImages,
	parseCrawledImageUrl,
	sniffImageMimeType,
} from "./bambi-crawl-media";

// 실제 사이트를 때리는 테스트는 만들지 않는다. 네트워크는 CrawlClient 스텁으로 대체한다.
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const gif = new Uint8Array(Buffer.from("GIF89a__gif_", "latin1"));
const webp = new Uint8Array(Buffer.from("RIFF____WEBPVP8 ", "latin1"));
const html = new Uint8Array(Buffer.from("<!doctype html><html>", "latin1"));

const createClient = (overrides: Partial<CrawlClient> = {}): CrawlClient => ({
	fetchBinary: (url: string) =>
		Promise.resolve({
			bytes: jpeg,
			contentType: "image/jpeg",
			url,
		} satisfies CrawlBinary),
	fetchHtml: () => Promise.resolve(""),
	isAllowed: () => Promise.resolve(true),
	...overrides,
});

const embed = (client: CrawlClient, url: string) =>
	embedCrawledImage({ client, url });

const withBytes = (bytes: Uint8Array, contentType: null | string = null) =>
	createClient({
		fetchBinary: (url: string) => Promise.resolve({ bytes, contentType, url }),
	});

describe("sniffImageMimeType", () => {
	// 배너는 확장자가 없고 서버가 text/plain을 준다. 헤더를 믿으면 정작 목표인 배너를 버린다.
	it("reads the type from the bytes, not the header", () => {
		expect(sniffImageMimeType(Buffer.from(jpeg))).toBe("image/jpeg");
		expect(sniffImageMimeType(Buffer.from(png))).toBe("image/png");
		expect(sniffImageMimeType(Buffer.from(gif))).toBe("image/gif");
		expect(sniffImageMimeType(Buffer.from(webp))).toBe("image/webp");
	});

	it("rejects things that are not images", () => {
		expect(sniffImageMimeType(Buffer.from(html))).toBeNull();
		// 시그니처를 판정할 만큼 길지도 않은 응답.
		expect(sniffImageMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
	});
});

describe("parseCrawledImageUrl", () => {
	it("accepts ordinary image origins", () => {
		expect(parseCrawledImageUrl("https://img.example.test/a.jpg")).toBe(
			"https://img.example.test/a.jpg"
		);
		expect(parseCrawledImageUrl("http://img.example.test/a.jpg")).toBe(
			"http://img.example.test/a.jpg"
		);
	});

	it("rejects non-http protocols", () => {
		expect(parseCrawledImageUrl("data:image/png;base64,AAAA")).toBeNull();
		expect(parseCrawledImageUrl("file:///etc/passwd")).toBeNull();
		expect(parseCrawledImageUrl("javascript:alert(1)")).toBeNull();
		expect(parseCrawledImageUrl("/relative/a.jpg")).toBeNull();
		expect(parseCrawledImageUrl("")).toBeNull();
	});

	// 남의 사이트가 준 URL로 우리 서버가 요청을 보낸다. 사설망이 열리면 SSRF다.
	it("rejects private, loopback and link-local targets", () => {
		for (const url of [
			"http://127.0.0.1/a.jpg",
			"http://127.9.9.9/a.jpg",
			"http://10.1.2.3/a.jpg",
			"http://172.16.0.1/a.jpg",
			"http://172.31.255.255/a.jpg",
			"http://192.168.0.1/a.jpg",
			"http://169.254.169.254/computeMetadata/v1/",
			"http://0.0.0.0/a.jpg",
			"http://[::1]/a.jpg",
			"http://[fd00::1]/a.jpg",
			"http://[fe80::1]/a.jpg",
			"http://[::ffff:127.0.0.1]/a.jpg",
			"http://localhost/a.jpg",
			"http://metadata.google.internal/computeMetadata/v1/",
			"http://build.internal/a.jpg",
			"http://printer.local/a.jpg",
			// isIP가 IP로 인정하지 않는 10진·16진 표기(둘 다 127.0.0.1).
			"http://2130706433/a.jpg",
			"http://0x7f000001/a.jpg",
		]) {
			expect(parseCrawledImageUrl(url)).toBeNull();
		}

		// 172.16/12 밖은 공인 대역이라 통과해야 한다(과하게 막지 않는지 확인).
		expect(parseCrawledImageUrl("http://172.32.0.1/a.jpg")).not.toBeNull();
	});
});

describe("embedCrawledImage", () => {
	it("returns a data uri whose type comes from the bytes", async () => {
		// content-type이 text/plain인데 바이트는 GIF다 — 실물 배너가 정확히 이 모양이다.
		await expect(
			embed(withBytes(gif, "text/plain"), "https://img.example.test/banner")
		).resolves.toBe(
			`data:image/gif;base64,${Buffer.from(gif).toString("base64")}`
		);
	});

	it("passes an already embedded image through without a request", async () => {
		const fetchBinary = vi.fn();
		const client = createClient({ fetchBinary });
		const stored = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;

		await expect(embed(client, stored)).resolves.toBe(stored);
		expect(fetchBinary).not.toHaveBeenCalled();
	});

	it("never requests a private address", async () => {
		const fetchBinary = vi.fn();
		const client = createClient({ fetchBinary });

		await expect(
			embed(client, "http://169.254.169.254/computeMetadata/v1/")
		).resolves.toBeNull();
		expect(fetchBinary).not.toHaveBeenCalled();
	});

	// 리다이렉트 끝이 사설망이면 원본 URL 검사만으로는 못 막는다.
	it("drops responses that redirected into a private address", async () => {
		const client = createClient({
			fetchBinary: () =>
				Promise.resolve({
					bytes: jpeg,
					contentType: "image/jpeg",
					url: "http://169.254.169.254/computeMetadata/v1/",
				}),
		});

		await expect(
			embed(client, "https://img.example.test/a.jpg")
		).resolves.toBeNull();
	});

	it("drops responses that are not an image", async () => {
		await expect(
			embed(withBytes(html, "image/jpeg"), "https://img.example.test/a.jpg")
		).resolves.toBeNull();
	});

	it("asks the client to cap the download size", async () => {
		const fetchBinary = vi.fn((url: string) =>
			Promise.resolve({ bytes: jpeg, contentType: null, url })
		);

		await embed(
			createClient({ fetchBinary }),
			"https://img.example.test/a.jpg"
		);

		expect(fetchBinary).toHaveBeenCalledWith(
			"https://img.example.test/a.jpg",
			CRAWLED_IMAGE_MAX_BYTES
		);
	});

	// 상한 초과·타임아웃은 클라이언트가 던진다. 그것이 공고 수집을 죽이면 안 된다.
	it("returns null instead of throwing when the download fails", async () => {
		const client = createClient({
			fetchBinary: () => Promise.reject(new Error("응답이 상한을 넘는다")),
		});

		await expect(
			embed(client, "https://img.example.test/huge.jpg")
		).resolves.toBeNull();
	});

	it("respects robots.txt for the image itself", async () => {
		const fetchBinary = vi.fn();
		const client = createClient({
			fetchBinary,
			isAllowed: () => Promise.resolve(false),
		});

		await expect(
			embed(client, "https://img.example.test/a.jpg")
		).resolves.toBeNull();
		expect(fetchBinary).not.toHaveBeenCalled();
	});
});

describe("embedCrawledImages", () => {
	it("keeps the order, drops failures and reports how many", async () => {
		const client = createClient({
			fetchBinary: (url: string) =>
				url.includes("bad")
					? Promise.reject(new Error("실패"))
					: Promise.resolve({ bytes: png, contentType: null, url }),
		});

		const result = await embedCrawledImages({
			client,
			urls: [
				"https://img.example.test/1.png",
				"https://img.example.test/bad.png",
				"http://127.0.0.1/2.png",
				"https://img.example.test/3.png",
			],
		});

		expect(result.failed).toBe(2);
		expect(result.images).toHaveLength(2);
		expect(
			result.images.every((image) => image.startsWith("data:image/png;"))
		).toBe(true);
	});

	// 상세 이미지를 20장 붙이는 공고가 있어 장수 상한만으로는 행 하나가 수십 MB가 된다.
	it("stops embedding once the per-post budget is spent", async () => {
		// 실제 클라이언트처럼 상한을 넘는 응답을 거부하는 스텁이라야 예산이 줄어드는 것을 본다.
		const fetchBinary = vi.fn((url: string, maxBytes: number) =>
			png.length > maxBytes
				? Promise.reject(new Error(`응답이 상한 ${maxBytes}바이트를 넘는다`))
				: Promise.resolve({ bytes: png, contentType: null, url })
		);
		const result = await embedCrawledImages({
			client: createClient({ fetchBinary }),
			totalMaxBytes: 40,
			urls: [
				"https://img.example.test/1.png",
				"https://img.example.test/2.png",
				"https://img.example.test/3.png",
			],
		});

		// 첫 장이 예산을 거의 다 쓰므로 남은 예산으로는 어느 장도 담기지 못한다.
		expect(result.images).toHaveLength(1);
		expect(result.failed).toBe(2);
		expect(fetchBinary).toHaveBeenLastCalledWith(
			"https://img.example.test/3.png",
			expect.any(Number)
		);
	});
});
