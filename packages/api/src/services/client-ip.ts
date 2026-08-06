// 레이트리밋 버킷 키로 쓸 클라이언트 IP를 요청 헤더에서 뽑는다. env·db에 의존하지 않는
// 순수 모듈로 유지한다 — api 서버(context.ts)와 web의 게스트 라우트(/api/guest)가 함께
// 쓰고, 두 곳의 규칙이 어긋나면 같은 사용자가 서로 다른 버킷에 들어간다.
//
// x-forwarded-for는 "호출자가 보낸 값"과 "프록시가 덧붙인 값"이 한 줄에 섞여 있다.
// 프로덕션 api 서버는 글로벌 외부 ALB(scripts/setup-gcp-lb.sh: bambi-api-lb) 뒤에 있고,
// 구글 외부 ALB는 문서대로 기존 값 **뒤에** 두 칸을 덧붙인다:
//   x-forwarded-for: <호출자가 보낸 값>,<실제 클라이언트 IP>,<LB IP>
// 즉 맨 왼쪽 칸은 호출자가 마음대로 채우는 자리다. 그 칸을 그대로 버킷 키로 쓰면
//   (1) 사내·학교·통신사 프록시가 사설 IP(10.x·192.168.x)를 넣는 순간 서로 다른 사용자가
//       한 버킷으로 합쳐져 정상 사용자끼리 한도를 밀어내고,
//   (2) 봇은 값만 바꿔 한도를 무한히 우회하며,
//   (3) 남의 IP를 적어 넣어 그 사용자를 429로 잠글 수도 있다.
// 그래서 실제 클라이언트는 "오른쪽 끝에서 우리 인프라가 덧붙인 칸 수(trustedProxyHops)만큼
// 세어 들어간 자리"로 잡는다.

export const UNKNOWN_CLIENT_IP = "unknown";

// api 서버 기본 홉 수. 프로덕션·dev 모두 글로벌 외부 ALB가 마지막에 자기 IP 한 칸을
// 덧붙이므로 1이다. LB를 걷어내거나 앞단(Cloudflare 프록시 등)을 더하면 배포 환경에서
// TRUSTED_PROXY_HOPS로 조정한다.
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;

const BRACKETED = /^\[([^\]]+)\](?::\d+)?$/;
const IPV4_WITH_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;
const HEXTET = /^[0-9a-f]{1,4}$/;
const IPV6_GROUP_COUNT = 8;
// IPv6는 가입자 회선 하나에 /64가 통째로 배정돼 주소를 얼마든지 바꿔 쓸 수 있다. 주소를
// 그대로 키로 쓰면 한도가 사실상 없는 것과 같아, 버킷은 /64 프리픽스로 묶는다.
const IPV6_BUCKET_GROUPS = 4;

// "::" 축약을 풀어 8개 그룹으로 되돌린다. 형식이 IPv6가 아니면 null.
const expandIpv6 = (address: string): null | string[] => {
	const halves = address.split("::");
	if (halves.length > 2) {
		return null;
	}
	const head = halves[0] ? halves[0].split(":") : [];
	if (halves.length === 1) {
		return head.length === IPV6_GROUP_COUNT ? head : null;
	}
	const tail = halves[1] ? halves[1].split(":") : [];
	const filler = IPV6_GROUP_COUNT - head.length - tail.length;
	if (filler < 0) {
		return null;
	}
	return [...head, ...Array.from({ length: filler }, () => "0"), ...tail];
};

const toIpv6Bucket = (address: string): string => {
	const groups = expandIpv6(address);
	// 파싱에 실패하면(embedded IPv4 등 드문 표기) 원문을 그대로 키로 쓴다 — 정확도는
	// 떨어져도 서로 다른 주소가 한 버킷으로 합쳐지지는 않는다.
	if (groups === null || !groups.every((group) => HEXTET.test(group))) {
		return address;
	}
	const prefix = groups
		.slice(0, IPV6_BUCKET_GROUPS)
		.map((group) => Number.parseInt(group, 16).toString(16))
		.join(":");
	return `${prefix}::/64`;
};

// 표기 차이(대소문자·포트·대괄호·zone·선행 0)로 같은 주소가 다른 버킷이 되지 않게 맞춘다.
const normalizeIp = (raw: string): string => {
	const trimmed = raw.trim().toLowerCase();
	if (trimmed === "") {
		return "";
	}
	const withoutBrackets = BRACKETED.exec(trimmed)?.[1] ?? trimmed;
	const ipv4WithPort = IPV4_WITH_PORT.exec(withoutBrackets)?.[1];
	if (ipv4WithPort) {
		return ipv4WithPort;
	}
	const zoneIndex = withoutBrackets.indexOf("%");
	const address =
		zoneIndex === -1 ? withoutBrackets : withoutBrackets.slice(0, zoneIndex);
	const mapped = IPV4_MAPPED.exec(address)?.[1];
	if (mapped) {
		return mapped;
	}
	if (!address.includes(":")) {
		return address;
	}
	return toIpv6Bucket(address);
};

export interface ClientIpSource {
	// 신뢰 프록시가 직접 채워 넣는 단일 값 헤더(Vercel의 x-vercel-forwarded-for 등).
	// 호출자가 위조할 수 없는 값이라 있으면 최우선으로 쓴다.
	directIp?: null | string;
	forwardedFor?: null | string;
	// 오른쪽 끝에서 "우리 인프라가" 덧붙인 칸 수. 구글 외부 ALB 뒤면 LB IP 한 칸이라 1.
	trustedProxyHops?: number;
}

export function resolveClientIp({
	directIp,
	forwardedFor,
	trustedProxyHops = 0,
}: ClientIpSource): string {
	const direct = normalizeIp(directIp ?? "");
	if (direct !== "") {
		return direct;
	}
	const chain = (forwardedFor ?? "")
		.split(",")
		.map((entry) => normalizeIp(entry))
		.filter((entry) => entry !== "");
	if (chain.length === 0) {
		return UNKNOWN_CLIENT_IP;
	}
	const hops =
		Number.isInteger(trustedProxyHops) && trustedProxyHops > 0
			? trustedProxyHops
			: 0;
	// 체인이 홉 수보다 짧으면 우리가 덧붙인 칸이 없다는 뜻이므로(로컬·프록시 미구성)
	// 종전처럼 맨 앞 값을 쓴다 — 그게 유일한 후보다.
	return chain.at(-1 - hops) ?? chain[0] ?? UNKNOWN_CLIENT_IP;
}

// 배포 튜닝용 선택 값이라 t3-env 스키마 대신 process.env를 직접 읽는다. 값이 비었거나
// 이상하면 조용히 기본값으로 떨어진다(부팅을 막을 만한 값이 아니다).
export function parseTrustedProxyHops(raw: null | string | undefined): number {
	if (!raw || raw.trim() === "") {
		return DEFAULT_TRUSTED_PROXY_HOPS;
	}
	const parsed = Number.parseInt(raw, 10);
	return Number.isInteger(parsed) && parsed >= 0
		? parsed
		: DEFAULT_TRUSTED_PROXY_HOPS;
}
