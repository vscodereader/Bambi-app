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
