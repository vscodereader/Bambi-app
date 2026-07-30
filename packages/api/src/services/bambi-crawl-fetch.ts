// 크롤러의 HTTP 계층. 셀렉터·스키마와 완전히 분리해 두어 파서는 네트워크를 모르고
// 문자열만 다루면 된다(파서 테스트가 픽스처만으로 돌아가는 이유).

import { Buffer } from "node:buffer";

// 봇을 숨기지 않는다. 상대 운영자가 로그에서 우리를 알아보고 연락하거나 차단할 수 있어야
// 정상적인 크롤링이다. 실제 배포 전에 연락처를 운영 이메일로 바꿔야 한다.
//
// 반드시 ASCII만 쓴다. HTTP 헤더 값은 ByteString(latin1)이라 한글이 한 글자라도 섞이면
// fetch가 요청을 보내기도 전에 TypeError를 던진다. 그러면 robots.txt부터 못 받고,
// "못 받으면 전부 금지" 폴백이 걸려 모든 수집이 "robots.txt가 허용하지 않는다"로 죽는다 —
// 원인은 상대 사이트가 아닌데 그렇게 보이는, 찾기 고약한 실패다.
const USER_AGENT =
	"BambiBot/1.0 (job listing crawler; contact admin@bambi.example; to block us add a Disallow to robots.txt)";

// 헤더 값에 넣을 수 있는 문자인지. latin1(0x20~0xFF) 밖은 전부 막는다 — 한글은 물론이고
// 개행·탭도 fetch가 거부한다. 운영자가 브라우저 쿠키 표를 복사해 붙이면 탭과 개행이 그대로
// 딸려오기 때문에 이 검사가 실제로 걸린다.
const HEADER_VALUE_MIN_CODE = 0x20;
const HEADER_VALUE_MAX_CODE = 0xff;

export const isHeaderValueSafe = (value: string): boolean => {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);

		if (code < HEADER_VALUE_MIN_CODE || code > HEADER_VALUE_MAX_CODE) {
			return false;
		}
	}

	return true;
};

// 요청 간 최소 간격. 상대 서버를 밀지 않기 위한 값이며 동시 요청은 1로 고정한다 —
// 수집이 몇 시간에 한 번이라 빨라서 얻는 이득이 없다.
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 2000;

const CHARSET_PATTERN = /charset=["']?([\w-]+)/i;
const SNIFF_BYTE_LIMIT = 2048;

// WHATWG 인코딩 레이블로 정규화한다. 국내 ASP/PHP 사이트는 EUC-KR을 cp949·ks_c_5601-1987로
// 표기하는 경우가 흔한데, TextDecoder는 cp949를 모른다.
const normalizeCharset = (raw: string | undefined): string => {
	const label = (raw ?? "").toLowerCase().trim();

	if (label === "cp949" || label === "ms949" || label === "windows-949") {
		return "euc-kr";
	}

	return label.length > 0 ? label : "utf-8";
};

// 응답 바이트를 문자열로 만든다. 여우알바는 EUC-KR이라 fetch().text()로 읽으면 한글이
// 전부 깨진다 — 헤더 charset을 먼저 보고, 없으면 앞부분을 latin1로 훑어 meta charset을 찾는다
// (한글 바이트가 섞여 있어도 태그·속성은 ASCII라 이 훑기는 안전하다).
export const decodeHtml = (
	buffer: ArrayBuffer,
	contentType: string | null
): string => {
	const headerCharset = contentType?.match(CHARSET_PATTERN)?.[1];
	const sniffed =
		headerCharset ??
		new TextDecoder("latin1")
			.decode(buffer.slice(0, SNIFF_BYTE_LIMIT))
			.match(CHARSET_PATTERN)?.[1];

	try {
		return new TextDecoder(normalizeCharset(sniffed)).decode(buffer);
	} catch {
		// 알 수 없는 레이블이면 UTF-8로 떨어뜨린다. 깨진 문자가 나오더라도 수집 자체를
		// 멈추지는 않는다(수율 판정이 뒤에서 걸러낸다).
		return new TextDecoder("utf-8").decode(buffer);
	}
};

export interface RobotsRules {
	allow: string[];
	disallow: string[];
}

const ROBOTS_LINE_PATTERN = /^([a-z-]+)\s*:\s*(.*)$/i;

// robots.txt에서 우리에게 적용되는 규칙(User-agent: *)만 추린다. 특정 봇 이름을 지정한
// 그룹은 우리 UA와 무관하므로 무시한다.
export const parseRobots = (text: string): RobotsRules => {
	const rules: RobotsRules = { allow: [], disallow: [] };
	let inWildcardGroup = false;

	for (const rawLine of text.split("\n")) {
		const line = rawLine.split("#")[0]?.trim() ?? "";
		const match = line.match(ROBOTS_LINE_PATTERN);

		if (!match) {
			continue;
		}

		const field = match[1]?.toLowerCase() ?? "";
		const value = match[2]?.trim() ?? "";

		if (field === "user-agent") {
			inWildcardGroup = value === "*";
			continue;
		}

		if (!inWildcardGroup || value.length === 0) {
			continue;
		}

		if (field === "disallow") {
			rules.disallow.push(value);
		} else if (field === "allow") {
			rules.allow.push(value);
		}
	}

	return rules;
};

const longestMatchLength = (patterns: string[], target: string): number => {
	let longest = -1;

	for (const pattern of patterns) {
		if (target.startsWith(pattern) && pattern.length > longest) {
			longest = pattern.length;
		}
	}

	return longest;
};

// 표준대로 가장 긴 일치가 이기고, 길이가 같으면 Allow가 이긴다.
// target은 경로만이 아니라 쿼리스트링까지 포함해야 한다 — 개별 글을 URL 통째로
// 막아두는 사이트가 있기 때문이다(퀸알바의 bbs_detail.php?bbs_num=... 형태).
export const isPathAllowed = (rules: RobotsRules, target: string): boolean =>
	longestMatchLength(rules.allow, target) >=
	longestMatchLength(rules.disallow, target);

export interface CrawlClientOptions {
	fetchImpl?: typeof globalThis.fetch;
	maxAttempts?: number;
	minRequestIntervalMs?: number;
	// 성인인증·로그인 게이트가 있는 소스에 붙일 헤더(주로 cookie). 값 자체는 소스마다 다르고
	// 만료되므로 코드가 아니라 env로 주입한다(bambi-crawl-ingest.ts의 crawlRequestHeaders).
	requestHeaders?: Record<string, string>;
	sleep?: (ms: number) => Promise<void>;
	timeoutMs?: number;
}

// 이미지 등 바이너리 응답. 리다이렉트를 따라간 뒤의 최종 URL을 함께 준다 — 호출자가
// 원본 URL에만 검사를 걸면 리다이렉트로 사설망에 들어가는 길이 열리기 때문이다.
export interface CrawlBinary {
	bytes: Uint8Array;
	contentType: null | string;
	url: string;
}

export interface CrawlClient {
	// maxBytes를 넘으면 스트림을 끊고 던진다. 상한을 호출자가 정하는 이유는 이 계층이
	// 미디어 정책을 모르기 때문이다(정책은 bambi-job-media-policy.ts에 있다).
	fetchBinary: (url: string, maxBytes: number) => Promise<CrawlBinary>;
	fetchHtml: (url: string) => Promise<string>;
	isAllowed: (url: string) => Promise<boolean>;
}

const defaultSleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

// 5xx·네트워크 오류만 재시도한다. 404·403은 재시도해도 같은 답이 오고, 상대 서버에
// 불필요한 부하만 준다.
const isRetryableStatus = (status: number): boolean => status >= 500;

export const createCrawlClient = (
	options: CrawlClientOptions = {}
): CrawlClient => {
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const sleep = options.sleep ?? defaultSleep;
	const minInterval =
		options.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

	// 요청 간 간격을 지키기 위한 직전 요청 시각. 동시 요청을 만들지 않으므로 단일 값으로 충분하다.
	let lastRequestAt = 0;
	// 오리진별 robots 규칙 캐시. 한 회차 안에서 robots.txt를 반복해 받지 않는다.
	const robotsCache = new Map<string, Promise<RobotsRules>>();

	const requestOnce = async (url: string): Promise<Response> => {
		const waitMs = lastRequestAt + minInterval - Date.now();
		if (waitMs > 0) {
			await sleep(waitMs);
		}
		lastRequestAt = Date.now();

		return await fetchImpl(url, {
			headers: {
				// EUC-KR 사이트가 Accept-Charset을 보고 응답을 바꾸는 경우가 있어 지정하지 않는다.
				//
				// text/plain과 */*를 반드시 남겨둔다. 같은 클라이언트로 robots.txt(text/plain)도
				// 받는데, HTML만 받겠다고 하면 내용 협상하는 서버가 406을 준다(여우알바 IIS가
				// 실제로 그런다). 그러면 robots를 못 받아 "전부 금지" 폴백이 걸리고, 수집이
				// 상대 사이트 탓처럼 보이는 메시지로 죽는다.
				accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
				"accept-language": "ko-KR,ko;q=0.9",
				"user-agent": USER_AGENT,
				...options.requestHeaders,
			},
			redirect: "follow",
			signal: AbortSignal.timeout(timeoutMs),
		});
	};

	// 본문은 재시도 밖에서 읽는다. 안에서 읽으면 "상한 초과"로 끊은 이미지를 상한까지 세 번
	// 더 받아 상대 서버를 그만큼 더 두드리게 된다.
	const requestWithRetry = async (url: string): Promise<Response> => {
		let lastError: unknown = null;

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				const response = await requestOnce(url);

				if (response.ok) {
					return response;
				}

				if (!isRetryableStatus(response.status)) {
					throw new Error(`${url} 응답 ${response.status}`);
				}

				lastError = new Error(`${url} 응답 ${response.status}`);
			} catch (error) {
				// AbortSignal.timeout과 네트워크 오류가 여기로 온다. 재시도 대상이다.
				lastError = error;
			}

			if (attempt < maxAttempts) {
				await sleep(RETRY_BASE_DELAY_MS * attempt);
			}
		}

		throw lastError instanceof Error
			? lastError
			: new Error(`${url} 요청 실패`);
	};

	const fetchText = async (url: string): Promise<string> => {
		const response = await requestWithRetry(url);

		return decodeHtml(
			await response.arrayBuffer(),
			response.headers.get("content-type")
		);
	};

	// content-length는 상대가 적는 값이라 믿지 않는다. 선언값으로 먼저 거르되, 실제로 읽은
	// 바이트가 상한을 넘는 순간 스트림을 끊는다 — 헤더가 거짓이거나 아예 없어도 메모리는 는다.
	const fetchBinary = async (
		url: string,
		maxBytes: number
	): Promise<CrawlBinary> => {
		const response = await requestWithRetry(url);
		const tooLarge = new Error(`${url} 응답이 상한 ${maxBytes}바이트를 넘는다`);
		const declared = Number(response.headers.get("content-length"));

		if (Number.isFinite(declared) && declared > maxBytes) {
			await response.body?.cancel();

			throw tooLarge;
		}

		const contentType = response.headers.get("content-type");
		const reader = response.body?.getReader();

		if (!reader) {
			throw new Error(`${url} 응답 본문이 없다`);
		}

		const chunks: Uint8Array[] = [];
		let total = 0;
		let chunk = await reader.read();

		while (!chunk.done) {
			total += chunk.value.byteLength;

			if (total > maxBytes) {
				await reader.cancel();

				throw tooLarge;
			}

			chunks.push(chunk.value);
			chunk = await reader.read();
		}

		// 리다이렉트가 없으면 response.url이 비는 구현이 있다. 요청 URL로 되돌린다.
		return {
			bytes: Buffer.concat(chunks),
			contentType,
			url: response.url || url,
		};
	};

	// robots.txt 전용 요청. 응답 상태 코드로 폴백을 가른다:
	//  - 2xx: robots 규칙 그대로 파싱.
	//  - 4xx: "규칙 없음(전부 허용)". RFC 9309 §2.3.1.3 — 4xx는 robots.txt가 unavailable,
	//    즉 우리에게 적용할 제약이 없다는 뜻이다. 외부 CDN은 robots.txt가 404인 경우가
	//    대부분이라, 이 구분 없이는 외부 이미지 수집이 통째로 빈다.
	//  - 5xx·네트워크 오류·타임아웃: "전부 금지". 정책을 확인하지 못한 상태에서 계속 긁는
	//    것이 크롤러가 저지르는 가장 흔한 무례다.
	// fetchText→requestWithRetry는 404를 상태 코드 없는 Error로 던져 이 구분이 불가능하므로,
	// 여기서는 requestOnce로 status를 직접 보고 분기한다(재시도는 5xx·네트워크 오류에만).
	const fetchRobots = async (origin: string): Promise<RobotsRules> => {
		const url = `${origin}/robots.txt`;

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				const response = await requestOnce(url);

				if (response.ok) {
					return parseRobots(
						decodeHtml(
							await response.arrayBuffer(),
							response.headers.get("content-type")
						)
					);
				}

				// 4xx는 재시도해도 답이 같고 애초에 "규칙 없음"이므로 바로 허용으로 끝낸다.
				if (!isRetryableStatus(response.status)) {
					return { allow: [], disallow: [] };
				}
			} catch {
				// AbortSignal.timeout·네트워크 오류. 재시도 대상이라 아래에서 대기 후 다시 돈다.
			}

			if (attempt < maxAttempts) {
				await sleep(RETRY_BASE_DELAY_MS * attempt);
			}
		}

		// 5xx·네트워크 오류가 끝까지 이어졌다 — 정책을 확인 못했으므로 전부 금지.
		return { allow: [], disallow: ["/"] };
	};

	const loadRobots = (origin: string): Promise<RobotsRules> => {
		const cached = robotsCache.get(origin);
		if (cached) {
			return cached;
		}

		const pending = fetchRobots(origin);

		robotsCache.set(origin, pending);

		return pending;
	};

	return {
		fetchBinary,
		fetchHtml: fetchText,
		isAllowed: async (url: string): Promise<boolean> => {
			const parsed = new URL(url);
			const rules = await loadRobots(parsed.origin);

			return isPathAllowed(rules, `${parsed.pathname}${parsed.search}`);
		},
	};
};
