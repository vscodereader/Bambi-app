// 크롤로 얻은 이미지를 **DB에 base64 data URI로** 담는다. 원본 URL을 그대로 저장하면
// 상대 트래픽을 우리가 쓰는 셈이고, 상대가 파일을 지우거나 referer로 막는 순간 우리 화면이
// 통째로 깨진다. 버킷 대신 DB를 고른 것은 운영 결정이다 — 버킷 업로드는 로컬 자격증명 없이
// 조용히 실패해 이미지 컬럼이 전부 null로 남았다.
//
// 저장 형태는 `data:image/jpeg;base64,...`다. 이 문자열은 그대로 <img src>에 들어가므로
// 클라이언트가 URL이든 data URI든 구분할 필요가 없고 기존 컬럼 이름을 그대로 쓸 수 있다.
//
// ponytail: 행 안에 바이트가 들어가므로 그 컬럼을 고르는 쿼리가 바이트를 함께 끌고 온다.
// 실측 크기는 썸네일 16KB(→base64 21KB)·상세 이미지 1.4MB(→1.8MB)라 목록에 실리는 썸네일은
// 문제없고 상세 이미지는 상세 화면에서만 읽어야 한다. 총량이 부담되면 별도 테이블(post_id,
// usage, bytea)로 빼고 이 컬럼이 그 행을 가리키게 바꾼다 — 그때까지는 컬럼 하나로 끝낸다.
//
// 이 파일은 DB를 모른다. 어떤 컬럼에 무엇을 넣을지는 수집기(bambi-crawl-ingest.ts)가 정한다.

import { Buffer } from "node:buffer";
import { isIP } from "node:net";

import type { CrawlClient } from "./bambi-crawl-fetch";

// 한 장 상한. 이보다 큰 이미지는 담지 않는다 — 행 하나가 목록 응답을 흔드는 것을 막는 천장이다.
// 실측 상세 이미지가 1.4MB여서 2MB로 잡았다(그 위는 전단 여러 장을 이어붙인 경우다).
export const CRAWLED_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

// 공고 한 건에 담는 총량 상한. 상세 이미지를 20장 붙이는 공고가 있어 장수 상한만으로는
// 행 하나가 수십 MB까지 갈 수 있다.
export const CRAWLED_IMAGE_TOTAL_MAX_BYTES = 8 * 1024 * 1024;

// 매직 넘버로 실제 이미지인지 본다. content-type을 믿지 않는 이유가 양쪽으로 있다:
//  - 배너(mobile_img/banner/<md5>)는 확장자가 없고 서버가 text/plain을 준다 → 헤더를 믿으면
//    정작 목표인 배너를 전부 버린다(실제로 그렇게 버려졌다).
//  - .jpg로 끝나는 URL이 HTML 오류 페이지를 200으로 주는 경우가 있다 → 헤더·확장자를 믿으면
//    HTML을 이미지로 저장한다.
// 바이트는 거짓말을 하지 않으므로 여기서만 판정한다.
const IMAGE_SIGNATURES: readonly {
	mimeType: string;
	test: (bytes: Buffer) => boolean;
}[] = [
	{
		mimeType: "image/jpeg",
		test: (bytes) =>
			bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
	},
	{
		mimeType: "image/png",
		test: (bytes) =>
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47,
	},
	{
		mimeType: "image/gif",
		test: (bytes) => bytes.subarray(0, 4).toString("latin1") === "GIF8",
	},
	{
		mimeType: "image/webp",
		test: (bytes) =>
			bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
			bytes.subarray(8, 12).toString("latin1") === "WEBP",
	},
];

const SIGNATURE_MIN_BYTES = 12;

export const sniffImageMimeType = (bytes: Buffer): null | string => {
	if (bytes.length < SIGNATURE_MIN_BYTES) {
		return null;
	}

	return (
		IMAGE_SIGNATURES.find((signature) => signature.test(bytes))?.mimeType ??
		null
	);
};

// 클라우드 메타데이터 서버·내부 전용 이름. 이름만으로 사설망을 가리키는 것이 확실한 것들이다.
const BLOCKED_HOSTNAMES = new Set([
	"broadcasthost",
	"localhost",
	"metadata",
	"metadata.google.internal",
]);
const BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localhost"];

const UNIQUE_LOCAL_IPV6_PATTERN = /^f[cd]/;
const LINK_LOCAL_IPV6_PATTERN = /^fe[89ab]/;
const IPV6_BRACKET_PATTERN = /^\[|]$/g;
// 10진(2130706433)·16진(0x7f000001) 표기의 IP. isIP가 IP로 인정하지 않아 호스트명으로 새어
// 나가지만, 스택은 IP로 해석한다.
const NUMERIC_LABEL_PATTERN = /^(\d+|0x[\da-f]+)$/;

const IPV4_MAPPED_IPV6_PREFIX = "::ffff:";

const isBlockedIpv4 = (host: string): boolean => {
	const [first = -1, second = -1] = host.split(".").map(Number);

	return (
		first === 0 ||
		first === 10 ||
		first === 127 ||
		(first === 169 && second === 254) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168)
	);
};

const HEX_RADIX = 16;
const OCTET_SIZE = 256;

// IPv4 매핑 주소를 점 표기로 되돌린다. URL 파서가 ::ffff:127.0.0.1을 ::ffff:7f00:1로
// 정규화해 버리기 때문에, 점 표기만 보고 있으면 루프백이 그대로 통과한다.
const readIpv4MappedIpv6 = (host: string): null | string => {
	if (!host.startsWith(IPV4_MAPPED_IPV6_PREFIX)) {
		return null;
	}

	const rest = host.slice(IPV4_MAPPED_IPV6_PREFIX.length);

	if (rest.includes(".")) {
		return rest;
	}

	// 앞의 ::가 비는 자리를 모두 채우므로 마지막 두 hextet이 v4의 32비트다.
	const groups = rest.split(":");
	const low = Number.parseInt(groups.at(-1) ?? "", HEX_RADIX);
	const high =
		groups.length > 1 ? Number.parseInt(groups.at(-2) ?? "", HEX_RADIX) : 0;

	if (!(Number.isFinite(low) && Number.isFinite(high))) {
		return null;
	}

	return [
		Math.floor(high / OCTET_SIZE),
		high % OCTET_SIZE,
		Math.floor(low / OCTET_SIZE),
		low % OCTET_SIZE,
	].join(".");
};

const isBlockedIpv6 = (host: string): boolean => {
	const mapped = readIpv4MappedIpv6(host);

	// IPv4 매핑 주소(::ffff:127.0.0.1)는 v4 규칙으로 다시 본다.
	if (mapped) {
		return isBlockedIpv4(mapped);
	}

	// ::(미지정)·::1(루프백)·fc00::/7(유니크 로컬)·fe80::/10(링크 로컬).
	return (
		host === "::" ||
		host === "::1" ||
		UNIQUE_LOCAL_IPV6_PATTERN.test(host) ||
		LINK_LOCAL_IPV6_PATTERN.test(host)
	);
};

// ponytail: DNS를 조회하지 않는다. 공개 이름이 사설 IP를 가리키도록 만든 DNS 리바인딩은
// 이 검사를 통과한다 — 막으려면 직접 resolve한 뒤 그 IP로 요청해야 하는데(그래도 TOCTOU가
// 남는다), 크롤 이미지 한 장의 위험 대비 품이 크다. 내부망에 실제로 민감한 HTTP 엔드포인트가
// 생기면 그때 올린다.
const isBlockedHost = (rawHost: string): boolean => {
	// URL.hostname은 IPv6를 대괄호째 준다.
	const host = rawHost.replace(IPV6_BRACKET_PATTERN, "").toLowerCase();

	if (
		BLOCKED_HOSTNAMES.has(host) ||
		BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
	) {
		return true;
	}

	const version = isIP(host);

	if (version === 4) {
		return isBlockedIpv4(host);
	}

	if (version === 6) {
		return isBlockedIpv6(host);
	}

	// 점 없는 이름(사내 짧은 호스트)과 라벨이 전부 숫자인 이름을 막는다. 공개 이미지 호스트는
	// 어느 쪽도 아니고, isIP가 정규 표기만 IP로 인정해 흘려보내는 10진·8진 IP가 여기서 걸린다.
	const labels = host.split(".");

	return (
		labels.length < 2 ||
		labels.every((label) => NUMERIC_LABEL_PATTERN.test(label))
	);
};

// 남의 사이트가 준 URL로 우리 서버가 요청을 보내는 자리다. 여기가 신뢰 경계이므로
// 프로토콜과 목적지를 여기서 한 번에 판정하고, 통과한 URL만 클라이언트에 넘긴다.
export const parseCrawledImageUrl = (raw: string): null | string => {
	let parsed: URL;

	try {
		parsed = new URL(raw);
	} catch {
		// 상대 경로·빈 문자열. 절대 URL로 만드는 건 파서의 책임이다.
		return null;
	}

	// data:·file:·javascript: 등은 이미지 출처가 될 수 없다.
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return null;
	}

	return isBlockedHost(parsed.hostname) ? null : parsed.href;
};

const DATA_URI_PREFIX = "data:image/";

// 이미 담아둔 data URI인지. 재수집 때 같은 이미지를 다시 내려받지 않기 위한 판정이다.
export const isEmbeddedImage = (value: string): boolean =>
	value.startsWith(DATA_URI_PREFIX);

export interface EmbedCrawledImageInput {
	client: CrawlClient;
	maxBytes?: number;
	url: string;
}

// 이미지 한 장을 data URI로 만든다. 실패·거부는 null이다 — 이미지 한 장 때문에 공고 수집
// 회차가 죽으면 안 된다.
export const embedCrawledImage = async ({
	client,
	maxBytes = CRAWLED_IMAGE_MAX_BYTES,
	url,
}: EmbedCrawledImageInput): Promise<null | string> => {
	if (isEmbeddedImage(url)) {
		return url;
	}

	const target = parseCrawledImageUrl(url);

	if (!target) {
		return null;
	}

	try {
		// 이미지를 받는 것도 크롤링이다. robots.txt를 못 받으면 크롤 클라이언트가 "전부 금지"로
		// 보므로, 이미지가 robots.txt 없는 CDN에 있으면 수집이 통째로 비게 된다 —
		// 그건 버그가 아니라 정책이고, 실패 건수로 드러난다.
		if (!(await client.isAllowed(target))) {
			return null;
		}

		const response = await client.fetchBinary(target, maxBytes);

		// 리다이렉트 끝이 사설망일 수 있다. 최종 URL도 같은 검사를 통과해야 한다.
		if (!parseCrawledImageUrl(response.url)) {
			return null;
		}

		const bytes = Buffer.from(response.bytes);
		const mimeType = sniffImageMimeType(bytes);

		// 이미지가 아니면 버린다. 로그인 페이지·에러 HTML이 200으로 오는 경우가 흔하다.
		if (!mimeType) {
			return null;
		}

		return `data:${mimeType};base64,${bytes.toString("base64")}`;
	} catch {
		// 상한 초과·타임아웃. 호출자는 null 개수로 실패를 집계한다.
		return null;
	}
};

export interface EmbedCrawledImagesInput {
	client: CrawlClient;
	totalMaxBytes?: number;
	urls: string[];
}

export interface EmbedCrawledImagesResult {
	// 담지 못한 장수. 조용히 삼키면 "이미지가 원래 없는 공고"와 구분되지 않는다.
	failed: number;
	images: string[];
}

// 여러 장을 순서 그대로 담는다. 순차로 도는 건 CrawlClient가 요청 간격을 지키게 하기
// 위해서다(동시 요청을 만들면 그 간격 규약이 무너진다).
export const embedCrawledImages = async ({
	client,
	totalMaxBytes = CRAWLED_IMAGE_TOTAL_MAX_BYTES,
	urls,
}: EmbedCrawledImagesInput): Promise<EmbedCrawledImagesResult> => {
	const images: string[] = [];
	let failed = 0;
	let used = 0;

	for (const url of urls) {
		const remaining = totalMaxBytes - used;

		if (remaining <= 0) {
			failed += 1;
			continue;
		}

		const image = await embedCrawledImage({
			client,
			maxBytes: Math.min(CRAWLED_IMAGE_MAX_BYTES, remaining),
			url,
		});

		if (image) {
			images.push(image);
			used += image.length;
		} else {
			failed += 1;
		}
	}

	return { failed, images };
};
