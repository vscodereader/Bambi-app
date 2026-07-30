import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CrawlBinary, CrawlClient } from "./bambi-crawl-fetch";
import {
	buildCrawledImageKeyPrefix,
	mirrorCrawledImage,
	mirrorCrawledImages,
	parseCrawledImageUrl,
} from "./bambi-crawl-media";

// GCS와 네트워크를 전부 대체한다. 실제 버킷·실제 사이트를 때리는 테스트는 만들지 않는다.
const gcs = vi.hoisted(() => ({
	bucketConfigured: true,
	stored: new Map<string, string>(),
}));

const BUCKET_BASE = "https://storage.googleapis.com/bambi-test/";

vi.mock("./gcs", () => ({
	findPublicObjectUrl: (prefix: string) => {
		const key = [...gcs.stored.keys()].find((name) => name.startsWith(prefix));

		return Promise.resolve(key ? `${BUCKET_BASE}${key}` : null);
	},
	getPublicObjectUrl: (storageKey: string) => `${BUCKET_BASE}${storageKey}`,
	isPublicBucketConfigured: () => gcs.bucketConfigured,
	uploadPublicObject: ({
		mimeType,
		storageKey,
	}: {
		mimeType: string;
		storageKey: string;
	}) => {
		if (!gcs.bucketConfigured) {
			return Promise.resolve(null);
		}

		gcs.stored.set(storageKey, mimeType);

		return Promise.resolve(`${BUCKET_BASE}${storageKey}`);
	},
}));

const KEY_PREFIX_PATTERN =
	/^bambi-crawled-media\/queenalba\/12345\/[\da-f]{16}\.$/;
const SANITIZED_KEY_PREFIX_PATTERN =
	/^bambi-crawled-media\/queenalba\/[.a-z-]+\/[\da-f]{16}\.$/;
const WEBP_KEY_PATTERN = /\.webp$/;
const PNG_KEY_PATTERN = /\.png$/;

const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

const createClient = (overrides: Partial<CrawlClient> = {}): CrawlClient => ({
	fetchBinary: (url: string) =>
		Promise.resolve({
			bytes: imageBytes,
			contentType: "image/jpeg",
			url,
		} satisfies CrawlBinary),
	fetchHtml: () => Promise.resolve(""),
	isAllowed: () => Promise.resolve(true),
	...overrides,
});

const mirror = (client: CrawlClient, url: string) =>
	mirrorCrawledImage({
		client,
		site: "queenalba",
		sourceExternalId: "12345",
		url,
	});

beforeEach(() => {
	gcs.bucketConfigured = true;
	gcs.stored.clear();
});

describe("buildCrawledImageKeyPrefix", () => {
	it("derives the same key from the same source url", () => {
		const input = {
			site: "queenalba",
			sourceExternalId: "12345",
			url: "https://img.example.test/a.jpg",
		};

		expect(buildCrawledImageKeyPrefix(input)).toBe(
			buildCrawledImageKeyPrefix(input)
		);
		expect(buildCrawledImageKeyPrefix(input)).toMatch(KEY_PREFIX_PATTERN);
	});

	it("separates different urls and different job posts", () => {
		const base = { site: "queenalba", sourceExternalId: "12345" };
		const first = buildCrawledImageKeyPrefix({
			...base,
			url: "https://img.example.test/a.jpg",
		});

		expect(first).not.toBe(
			buildCrawledImageKeyPrefix({
				...base,
				url: "https://img.example.test/b.jpg",
			})
		);
		expect(first).not.toBe(
			buildCrawledImageKeyPrefix({
				...base,
				sourceExternalId: "99999",
				url: "https://img.example.test/a.jpg",
			})
		);
	});

	// sourceExternalId는 상대 사이트가 준 값이라 경로 문자가 섞여 들어올 수 있다.
	it("keeps foreign ids from escaping their folder", () => {
		expect(
			buildCrawledImageKeyPrefix({
				site: "queenalba",
				sourceExternalId: "../../bambi-job-post-media/org",
				url: "https://img.example.test/a.jpg",
			})
		).toMatch(SANITIZED_KEY_PREFIX_PATTERN);
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

describe("mirrorCrawledImage", () => {
	it("passes the original url through when no bucket is configured", async () => {
		gcs.bucketConfigured = false;

		const fetchBinary = vi.fn();
		const client = createClient({ fetchBinary });

		await expect(
			mirror(client, "https://img.example.test/a.jpg")
		).resolves.toBe("https://img.example.test/a.jpg");
		expect(fetchBinary).not.toHaveBeenCalled();
	});

	it("uploads the bytes under the hashed key and returns our url", async () => {
		const url = "https://img.example.test/a.jpg";
		const mirrored = await mirror(createClient(), url);
		const prefix = buildCrawledImageKeyPrefix({
			site: "queenalba",
			sourceExternalId: "12345",
			url,
		});

		expect(mirrored).toBe(`${BUCKET_BASE}${prefix}jpg`);
		expect(gcs.stored.get(`${prefix}jpg`)).toBe("image/jpeg");
	});

	it("does not re-upload an object it already mirrored", async () => {
		const url = "https://img.example.test/a.jpg";
		const fetchBinary = vi.fn(() =>
			Promise.resolve({
				bytes: imageBytes,
				contentType: "image/jpeg",
				url,
			})
		);
		const client = createClient({ fetchBinary });

		const first = await mirror(client, url);
		const second = await mirror(client, url);

		expect(second).toBe(first);
		expect(fetchBinary).toHaveBeenCalledTimes(1);
	});

	it("passes our own bucket urls through untouched", async () => {
		const fetchBinary = vi.fn();
		const client = createClient({ fetchBinary });

		await expect(mirror(client, `${BUCKET_BASE}whatever.jpg`)).resolves.toBe(
			`${BUCKET_BASE}whatever.jpg`
		);
		expect(fetchBinary).not.toHaveBeenCalled();
	});

	it("never requests a private address", async () => {
		const fetchBinary = vi.fn();
		const client = createClient({ fetchBinary });

		await expect(
			mirror(client, "http://169.254.169.254/computeMetadata/v1/")
		).resolves.toBeNull();
		expect(fetchBinary).not.toHaveBeenCalled();
	});

	// 리다이렉트 끝이 사설망이면 원본 URL 검사만으로는 못 막는다.
	it("drops responses that redirected into a private address", async () => {
		const client = createClient({
			fetchBinary: () =>
				Promise.resolve({
					bytes: imageBytes,
					contentType: "image/jpeg",
					url: "http://169.254.169.254/computeMetadata/v1/",
				}),
		});

		await expect(
			mirror(client, "https://img.example.test/a.jpg")
		).resolves.toBeNull();
		expect(gcs.stored.size).toBe(0);
	});

	it("drops responses that are not an allowed image type", async () => {
		for (const contentType of [
			"text/html; charset=utf-8",
			"image/svg+xml",
			null,
		]) {
			const client = createClient({
				fetchBinary: (url: string) =>
					Promise.resolve({ bytes: imageBytes, contentType, url }),
			});

			await expect(
				mirror(client, `https://img.example.test/${contentType}.jpg`)
			).resolves.toBeNull();
		}

		expect(gcs.stored.size).toBe(0);
	});

	it("takes the extension from the response, not the url", async () => {
		const client = createClient({
			fetchBinary: (url: string) =>
				Promise.resolve({
					bytes: imageBytes,
					contentType: "image/webp",
					url,
				}),
		});

		await expect(
			mirror(client, "https://img.example.test/a.jpg")
		).resolves.toMatch(WEBP_KEY_PATTERN);
	});

	// 상한 초과·타임아웃은 클라이언트가 던진다. 그것이 공고 수집을 죽이면 안 된다.
	it("returns null instead of throwing when the download fails", async () => {
		const client = createClient({
			fetchBinary: () =>
				Promise.reject(new Error("응답이 상한 10485760바이트를 넘는다")),
		});

		await expect(
			mirror(client, "https://img.example.test/huge.jpg")
		).resolves.toBeNull();
	});

	it("respects robots.txt for the image itself", async () => {
		const fetchBinary = vi.fn();
		const client = createClient({
			fetchBinary,
			isAllowed: () => Promise.resolve(false),
		});

		await expect(
			mirror(client, "https://img.example.test/a.jpg")
		).resolves.toBeNull();
		expect(fetchBinary).not.toHaveBeenCalled();
	});
});

describe("mirrorCrawledImages", () => {
	it("keeps the order, drops failures and reports how many", async () => {
		const client = createClient({
			fetchBinary: (url: string) =>
				url.includes("bad")
					? Promise.reject(new Error("실패"))
					: Promise.resolve({
							bytes: imageBytes,
							contentType: "image/png",
							url,
						}),
		});

		const result = await mirrorCrawledImages({
			client,
			site: "queenalba",
			sourceExternalId: "12345",
			urls: [
				"https://img.example.test/1.png",
				"https://img.example.test/bad.png",
				"http://127.0.0.1/2.png",
				"https://img.example.test/3.png",
			],
		});

		expect(result.failed).toBe(2);
		expect(result.urls).toHaveLength(2);
		expect(result.urls[0]).toBe(
			`${BUCKET_BASE}${buildCrawledImageKeyPrefix({
				site: "queenalba",
				sourceExternalId: "12345",
				url: "https://img.example.test/1.png",
			})}png`
		);
		expect(result.urls[1]).toMatch(PNG_KEY_PATTERN);
	});
});
