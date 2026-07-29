import { describe, expect, it } from "vitest";

import { createCrawlClient, isHeaderValueSafe } from "./bambi-crawl-fetch";

// HTTP 헤더 값은 ByteString(latin1)이다. UA나 쿠키에 한글이 한 글자라도 섞이면 fetch가
// 요청을 보내기도 전에 TypeError를 던지고, 그게 robots.txt 실패로 번져
// "robots.txt가 수집을 허용하지 않는다"라는 엉뚱한 이유로 모든 수집이 죽는다.
// 스텁 클라이언트를 쓰는 테스트로는 절대 잡히지 않아서, 실제 요청 경로를 여기서 세운다.

const okResponse = (body: string): Response =>
	new Response(body, {
		headers: { "content-type": "text/html; charset=utf-8" },
	});

const PLAIN_TEXT_ACCEPT_PATTERN = /text\/plain|\*\/\*/;
const OVER_LIMIT_ERROR_PATTERN = /상한/;

describe("isHeaderValueSafe", () => {
	it("rejects values that fetch cannot put in a header", () => {
		expect(isHeaderValueSafe("BambiBot/1.0 (job listing crawler)")).toBe(true);
		expect(isHeaderValueSafe("adultname=%EC%B5%9C%ED%98%84%EC%A4%80")).toBe(
			true
		);
		expect(isHeaderValueSafe("구인공고 수집")).toBe(false);
		// 브라우저 쿠키 표를 복사하면 탭·개행이 딸려온다. 그것도 fetch가 거부한다.
		expect(isHeaderValueSafe("PHPSESSID=abc\tadultcode=zzz")).toBe(false);
		expect(isHeaderValueSafe("PHPSESSID=abc\nadultcode=zzz")).toBe(false);
	});
});

describe("createCrawlClient 요청 헤더", () => {
	// 기본 UA가 latin1을 벗어나면 실제 fetch가 통째로 실패한다. 상수를 한글로 되돌리는
	// 회귀를 여기서 잡는다.
	it("sends a user-agent the platform can actually encode", async () => {
		const seen: Record<string, string>[] = [];
		const client = createCrawlClient({
			fetchImpl: (_url, init) => {
				seen.push((init?.headers ?? {}) as Record<string, string>);

				return Promise.resolve(okResponse("<html></html>"));
			},
			minRequestIntervalMs: 0,
		});

		await client.fetchHtml("https://example.test/page");

		const headers = seen[0] ?? {};

		expect(headers["user-agent"]).toBeDefined();
		for (const value of Object.values(headers)) {
			expect(isHeaderValueSafe(value)).toBe(true);
		}

		// 실제 Headers 생성이 던지지 않는지까지 확인한다 — 위 검사가 놓치는 표현이 있어도
		// 이 줄이 걸린다.
		expect(() => new Headers(headers)).not.toThrow();
	});

	// 같은 클라이언트로 robots.txt(text/plain)도 받는다. HTML만 받겠다고 하면 내용 협상하는
	// 서버가 406을 주고(여우알바 IIS), robots를 못 받아 "전부 금지" 폴백이 걸린다.
	it("accepts plain text so robots.txt does not 406", async () => {
		const seen: Record<string, string>[] = [];
		const client = createCrawlClient({
			fetchImpl: (_url, init) => {
				seen.push((init?.headers ?? {}) as Record<string, string>);

				return Promise.resolve(okResponse("User-agent: *\nAllow: /\n"));
			},
			minRequestIntervalMs: 0,
		});

		await client.isAllowed("https://example.test/page");

		const accept = seen[0]?.accept ?? "";

		expect(accept).toMatch(PLAIN_TEXT_ACCEPT_PATTERN);
	});

	it("merges source-specific headers over the defaults", async () => {
		const seen: Record<string, string>[] = [];
		const client = createCrawlClient({
			fetchImpl: (_url, init) => {
				seen.push((init?.headers ?? {}) as Record<string, string>);

				return Promise.resolve(okResponse("<html></html>"));
			},
			minRequestIntervalMs: 0,
			requestHeaders: { cookie: "PHPSESSID=abc; adultcode=zzz" },
		});

		await client.fetchHtml("https://example.test/page");

		expect(seen[0]?.cookie).toBe("PHPSESSID=abc; adultcode=zzz");
	});
});

// 이미지 다운로드는 상대가 크기를 정하는 유일한 경로다. 상한이 새면 공고 하나가 서버 메모리를
// 통째로 먹는다.
describe("createCrawlClient fetchBinary", () => {
	const binaryClient = (response: Response) =>
		createCrawlClient({
			fetchImpl: () => Promise.resolve(response),
			minRequestIntervalMs: 0,
		});

	it("returns the bytes and the declared content type", async () => {
		const client = binaryClient(
			new Response(new Uint8Array([1, 2, 3]), {
				headers: { "content-type": "image/png" },
			})
		);

		const binary = await client.fetchBinary("https://example.test/a.png", 100);

		expect([...binary.bytes]).toEqual([1, 2, 3]);
		expect(binary.contentType).toBe("image/png");
	});

	it("refuses a body the header already declares too large", async () => {
		const client = binaryClient(
			new Response(new Uint8Array(10), {
				headers: { "content-length": "999999" },
			})
		);

		await expect(
			client.fetchBinary("https://example.test/a.png", 100)
		).rejects.toThrow(OVER_LIMIT_ERROR_PATTERN);
	});

	// content-length는 상대가 적는 값이라 거짓일 수 있다. 실제 읽은 바이트로도 끊어야 한다.
	it("cuts the stream when the header lied about the size", async () => {
		const client = binaryClient(
			new Response(new Uint8Array(500), {
				headers: { "content-length": "10" },
			})
		);

		await expect(
			client.fetchBinary("https://example.test/a.png", 100)
		).rejects.toThrow(OVER_LIMIT_ERROR_PATTERN);
	});
});
