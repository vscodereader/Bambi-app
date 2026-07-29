// 크롤로 얻은 이미지 URL을 우리 공개 버킷으로 미러링한다. 원본 사이트의 이미지를 그대로
// 핫링크하면 상대 트래픽을 우리가 쓰는 셈이고, 상대가 파일을 지우거나 referer로 막는 순간
// 우리 화면이 통째로 깨진다. 그래서 바이트를 우리 쪽으로 옮겨 공고와 함께 보관한다.
//
// 이 파일은 DB를 모른다. 어떤 컬럼에 어떤 URL을 넣을지는 수집기(bambi-crawl-ingest.ts)가 정한다.

import { createHash } from "node:crypto";
import { isIP } from "node:net";

import type { CrawlClient } from "./bambi-crawl-fetch";
import {
	type ALLOWED_JOB_AD_BANNER_MIME_TYPES,
	JOB_POST_IMAGE_MAX_BYTES,
} from "./bambi-job-media-policy";
import {
	findPublicObjectUrl,
	getPublicObjectUrl,
	isPublicBucketConfigured,
	uploadPublicObject,
} from "./gcs";

// 다른 업로드 경로와 같은 네임스페이스 규칙(bambi-*)을 쓴다. 버킷을 열어봤을 때 이 접두사만
// 보고 "사람이 올린 것이 아니라 크롤러가 미러링한 것"임을 구분할 수 있어야 한다.
const CRAWLED_MEDIA_KEY_ROOT = "bambi-crawled-media";
const KEY_HASH_LENGTH = 16;
const KEY_SEGMENT_MAX_LENGTH = 64;

// 확장자는 응답 MIME에서 정한다 — 원본 URL의 확장자는 상대가 적은 값이라 실제 바이트와
// 다를 수 있다(.jpg로 끝나는 HTML 오류 페이지가 실제로 온다). 이 표가 허용 목록을 겸해서,
// 여기 없는 MIME이면 버린다.
//
// 키를 공고 미디어 정책의 유니온으로 묶어 둔다. 정책에 MIME이 늘면 이 표가 컴파일에서 걸려
// 두 곳이 조용히 어긋나지 않는다.
const EXTENSION_BY_MIME: Record<
	(typeof ALLOWED_JOB_AD_BANNER_MIME_TYPES)[number],
	string
> = {
	"image/gif": "gif",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
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
const UNSAFE_KEY_SEGMENT_PATTERN = /[^A-Za-z0-9._-]/g;

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

// 스토리지 키에 그대로 들어가는 값이라 경로 문자를 없앤다. site는 우리가 정한 값이지만
// sourceExternalId는 상대 사이트가 준 값이다.
const sanitizeKeySegment = (value: string): string =>
	value
		.replaceAll(UNSAFE_KEY_SEGMENT_PATTERN, "-")
		.slice(0, KEY_SEGMENT_MAX_LENGTH) || "unknown";

export interface CrawledImageKeyInput {
	site: string;
	sourceExternalId: string;
	url: string;
}

// 키는 원본 URL의 해시로 결정론적으로 정한다 — 매 회차 같은 이미지를 다시 올리지 않기 위해서다.
// 확장자는 응답 MIME이 정하므로 다운로드 전에는 여기까지(끝의 점 포함)만 알 수 있고,
// 그 프리픽스만으로 이미 올라간 객체를 찾는다.
//
// 경로에 site/sourceExternalId를 넣어 객체가 어느 공고의 것인지 키만 보고 알 수 있게 한다.
// 같은 이미지가 두 공고에 걸리면 두 벌이 생기지만, 공고를 지울 때 프리픽스 하나로 정리할 수
// 있는 편이 중복 몇 KB보다 낫다.
export const buildCrawledImageKeyPrefix = ({
	site,
	sourceExternalId,
	url,
}: CrawledImageKeyInput): string => {
	const hash = createHash("sha256")
		.update(url)
		.digest("hex")
		.slice(0, KEY_HASH_LENGTH);

	return `${CRAWLED_MEDIA_KEY_ROOT}/${sanitizeKeySegment(site)}/${sanitizeKeySegment(sourceExternalId)}/${hash}.`;
};

const readMimeType = (contentType: null | string): null | string =>
	contentType?.split(";")[0]?.trim().toLowerCase() || null;

// 이미 우리 버킷 URL이면 다시 올리지 않는다. 수집기가 저장해 둔 값을 그대로 되돌려주는
// 경로가 있어야 재수집이 멱등해진다.
const isMirroredUrl = (url: string): boolean =>
	url.startsWith(getPublicObjectUrl(""));

export interface MirrorCrawledImageInput extends CrawledImageKeyInput {
	client: CrawlClient;
}

export interface MirrorCrawledImagesInput {
	client: CrawlClient;
	site: string;
	sourceExternalId: string;
	urls: string[];
}

export interface MirrorCrawledImagesResult {
	// 못 옮긴 장수. 조용히 삼키면 "이미지가 원래 없는 공고"와 구분되지 않는다.
	failed: number;
	urls: string[];
}

// 원본 이미지 한 장을 버킷으로 옮기고 우리 공개 URL을 돌려준다. 실패·거부는 null이다 —
// 이미지 한 장 때문에 공고 수집 회차가 죽으면 안 된다.
export const mirrorCrawledImage = async ({
	client,
	site,
	sourceExternalId,
	url,
}: MirrorCrawledImageInput): Promise<null | string> => {
	// 버킷이 없는 환경(로컬 대부분)에서는 미러링을 통째로 건너뛰고 원본을 그대로 쓴다.
	// 이 분기가 없으면 로컬에서 크롤러가 이미지 단계마다 실패한다.
	if (!isPublicBucketConfigured()) {
		return url;
	}

	if (isMirroredUrl(url)) {
		return url;
	}

	const target = parseCrawledImageUrl(url);

	if (!target) {
		return null;
	}

	const keyPrefix = buildCrawledImageKeyPrefix({ site, sourceExternalId, url });

	try {
		// 이미 올라가 있으면 원본 서버를 아예 건드리지 않는다. 재수집 때 상대 서버를 다시
		// 두드리지 않는 것이 이 함수에서 제일 중요한 예의다.
		const mirrored = await findPublicObjectUrl(keyPrefix);

		if (mirrored) {
			return mirrored;
		}

		// 이미지를 받는 것도 크롤링이다. robots.txt를 못 받으면 크롤 클라이언트가 "전부 금지"로
		// 보므로, 이미지가 robots.txt 없는 CDN에 있으면 미러링이 통째로 비게 된다 —
		// 그건 버그가 아니라 정책이고, 실패 건수로 드러난다.
		if (!(await client.isAllowed(target))) {
			return null;
		}

		const response = await client.fetchBinary(target, JOB_POST_IMAGE_MAX_BYTES);

		// 리다이렉트 끝이 사설망일 수 있다. 최종 URL도 같은 검사를 통과해야 한다.
		if (!parseCrawledImageUrl(response.url)) {
			return null;
		}

		const mimeType = readMimeType(response.contentType);
		const extension = mimeType
			? EXTENSION_BY_MIME[mimeType as keyof typeof EXTENSION_BY_MIME]
			: undefined;

		// 이미지가 아니면 버린다. 로그인 페이지·에러 HTML이 200으로 오는 경우가 흔하다.
		if (!(mimeType && extension)) {
			return null;
		}

		return await uploadPublicObject({
			buffer: response.bytes,
			mimeType,
			storageKey: `${keyPrefix}${extension}`,
		});
	} catch {
		// 상한 초과·타임아웃·GCS 오류. 호출자는 null 개수로 실패를 집계한다.
		return null;
	}
};

// 여러 장을 순서 그대로 옮긴다. 순차로 도는 건 CrawlClient가 요청 간격을 지키게 하기
// 위해서다(동시 요청을 만들면 그 간격 규약이 무너진다).
export const mirrorCrawledImages = async ({
	client,
	site,
	sourceExternalId,
	urls,
}: MirrorCrawledImagesInput): Promise<MirrorCrawledImagesResult> => {
	const mirrored: string[] = [];
	let failed = 0;

	for (const url of urls) {
		const result = await mirrorCrawledImage({
			client,
			site,
			sourceExternalId,
			url,
		});

		if (result) {
			mirrored.push(result);
		} else {
			failed += 1;
		}
	}

	return { failed, urls: mirrored };
};
