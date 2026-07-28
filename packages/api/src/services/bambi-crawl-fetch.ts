// 크롤러의 HTTP 계층. 셀렉터·스키마와 완전히 분리해 두어 파서는 네트워크를 모르고
// 문자열만 다루면 된다(파서 테스트가 픽스처만으로 돌아가는 이유).

// 봇을 숨기지 않는다. 상대 운영자가 로그에서 우리를 알아보고 연락하거나 차단할 수 있어야
// 정상적인 크롤링이다. 실제 배포 전에 연락처를 운영 이메일로 바꿔야 한다.
const USER_AGENT =
	"BambiBot/1.0 (구인공고 수집; 문의 admin@bambi.example; 차단을 원하시면 robots.txt에 Disallow를 추가해 주세요)";

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
	sleep?: (ms: number) => Promise<void>;
	timeoutMs?: number;
}

export interface CrawlClient {
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
				accept: "text/html,application/xhtml+xml",
				"accept-language": "ko-KR,ko;q=0.9",
				"user-agent": USER_AGENT,
			},
			redirect: "follow",
			signal: AbortSignal.timeout(timeoutMs),
		});
	};

	const fetchText = async (url: string): Promise<string> => {
		let lastError: unknown = null;

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				const response = await requestOnce(url);

				if (response.ok) {
					return decodeHtml(
						await response.arrayBuffer(),
						response.headers.get("content-type")
					);
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

	const loadRobots = (origin: string): Promise<RobotsRules> => {
		const cached = robotsCache.get(origin);
		if (cached) {
			return cached;
		}

		// robots.txt를 못 받으면 "규칙 없음"이 아니라 "전부 금지"로 본다. 정책을 확인하지
		// 못한 상태에서 계속 긁는 것이 크롤러가 저지르는 가장 흔한 무례다.
		const pending = fetchText(`${origin}/robots.txt`)
			.then(parseRobots)
			.catch((): RobotsRules => ({ allow: [], disallow: ["/"] }));

		robotsCache.set(origin, pending);

		return pending;
	};

	return {
		fetchHtml: fetchText,
		isAllowed: async (url: string): Promise<boolean> => {
			const parsed = new URL(url);
			const rules = await loadRobots(parsed.origin);

			return isPathAllowed(rules, `${parsed.pathname}${parsed.search}`);
		},
	};
};
