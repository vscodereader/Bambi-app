// 게스트 본인인증 토큰 — "base64url(payload).base64url(HMAC-SHA256)" 서명 쿠키 값.
// web(edge 미들웨어·/api/guest 라우트·클라이언트 UI)과 api(context의 게스트 신원 해석)가
// 함께 import 하므로 env·db에 의존하지 않는 순수 모듈로 유지한다(웹은 next.config
// transpilePackages 경유). Web Crypto만 사용해 edge와 Node 양쪽에서 동작한다.
//
// 이전의 평문 bambi_guest=1 쿠키는 devtools에서 document.cookie 한 줄로 위조돼 성인
// 게이트가 그대로 뚫렸다. 페이로드는 클라이언트도 읽을 수 있게 두고(성별 UI·가입 시 이관),
// 진위 판정은 서명을 아는 서버(미들웨어·라우트·api context)만 한다.

export const GUEST_COOKIE_NAME = "bambi_guest";

// 서명 키가 없으면 게스트 토큰을 만들 수도 검증할 수도 없다. 개발 편의를 위한 폴백이며,
// 프로덕션은 env(web.ts·server.ts)의 부팅 가드가 누락을 막는다. web이 발급한 토큰을 api
// 서버가 검증하므로 양쪽 폴백이 같은 값이어야 한다 — 그래서 상수 하나로 둔다.
export const DEV_GUEST_TOKEN_SECRET =
	"bambi-dev-guest-token-secret-not-for-prod";

export const resolveGuestTokenSecret = (
	configuredSecret: string | undefined,
	nodeEnv: string | undefined
): string =>
	nodeEnv === "production"
		? (configuredSecret ?? DEV_GUEST_TOKEN_SECRET)
		: DEV_GUEST_TOKEN_SECRET;

export interface GuestTokenPayload {
	// 만료(Unix 초). 쿠키 maxAge와 별개로 토큰 자체에도 만료를 박아, 훔친 쿠키를
	// 무기한 재사용하는 것을 막는다.
	exp: number;
	// 인증에서 확인된 성별. 가입 시 프로필로 이관하고, 게스트 쓰기 자격 판정에도 쓴다.
	gender: "female" | "male" | null;
	// 게스트 식별자(UUID). 발급 시 부여하며 추천 중복방지·레이트리밋 버킷 키로 쓴다.
	// 이 필드가 없는 토큰(v1과 gid 도입 이전 v2)은 읽기 게이트에서는 그대로 유효하고,
	// 쓰기 경로만 gid를 요구한다 — 게스트 열람을 끊지 않기 위해 버전을 올리지 않았다.
	gid?: string;
	// 토큰 포맷 버전. 1·2 모두 유효하다. 2는 한때 인증 건 ID(ivId)를 함께 싣던
	// 포맷인데, 그 필드는 더 이상 쓰지도 읽지도 않는다(자체점검 항목 4 — 인증 건 ID는
	// 유효시간 30분짜리인데 쿠키는 30일을 들고 있어, JS로 읽히는 채로 남겨둘 이유가
	// 없다). 이미 발급된 토큰은 여분 필드를 무시하고 그대로 통과시킨다.
	v: 1 | 2;
}

const encoder = new TextEncoder();

const BASE64_PLUS = /\+/g;
const BASE64_SLASH = /\//g;
const BASE64_PADDING = /=+$/;
const BASE64URL_DASH = /-/g;
const BASE64URL_UNDERSCORE = /_/g;

export const toBase64Url = (bytes: Uint8Array): string =>
	btoa(String.fromCharCode(...bytes))
		.replace(BASE64_PLUS, "-")
		.replace(BASE64_SLASH, "_")
		.replace(BASE64_PADDING, "");

// 반환 타입을 Uint8Array<ArrayBuffer>로 못박는다: 기본 인자(ArrayBufferLike)로 두면
// DOM 타입이 있는 web 쪽 컴파일에서 crypto.subtle.verify의 BufferSource에 맞지 않는다.
export const fromBase64Url = (
	value: string
): Uint8Array<ArrayBuffer> | null => {
	try {
		const base64 = value
			.replace(BASE64URL_DASH, "+")
			.replace(BASE64URL_UNDERSCORE, "/");
		const binary = atob(base64);
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
};

// 반환 타입을 적지 않는 이유: api 패키지는 lib DOM 없이(types: node) 컴파일돼
// CryptoKey·BufferSource 같은 DOM 타입 이름을 쓸 수 없다. 추론에 맡긴다.
export const importHmacKey = (secret: string) =>
	crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"]
	);

export async function createGuestToken({
	gender,
	maxAgeSeconds,
	now,
	secret,
}: {
	gender: "female" | "male" | null;
	maxAgeSeconds: number;
	now: Date;
	secret: string;
}): Promise<string> {
	const payload: GuestTokenPayload = {
		exp: Math.floor(now.getTime() / 1000) + maxAgeSeconds,
		gender,
		gid: crypto.randomUUID(),
		v: 2,
	};
	const payloadPart = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const key = await importHmacKey(secret);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(payloadPart)
	);
	return `${payloadPart}.${toBase64Url(new Uint8Array(signature))}`;
}

const parsePayload = (payloadPart: string): GuestTokenPayload | null => {
	const bytes = fromBase64Url(payloadPart);
	if (!bytes) {
		return null;
	}
	try {
		const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
		if (typeof parsed !== "object" || parsed === null) {
			return null;
		}
		// 아는 필드만 뽑아 재구성한다 — 구 토큰에 남아 있는 ivId 같은 여분 필드는
		// 여기서 자연히 떨어져 나가고, 토큰은 계속 유효하다.
		const { exp, gender, gid, v } = parsed as Record<string, unknown>;
		if ((v !== 1 && v !== 2) || typeof exp !== "number") {
			return null;
		}
		if (gender !== "male" && gender !== "female" && gender !== null) {
			return null;
		}
		// gid는 있는 토큰만 실어 보낸다 — 호출부는 gid 유무로 쓰기 자격을 가른다.
		return typeof gid === "string" && gid !== ""
			? { exp, gender, gid, v }
			: { exp, gender, v };
	} catch {
		return null;
	}
};

// 서명·만료를 검증하고 페이로드를 돌려준다. 실패는 전부 null — 게이트는 null이면 닫힌다.
export async function verifyGuestToken(
	token: string,
	secret: string,
	now: Date
): Promise<GuestTokenPayload | null> {
	const [payloadPart, signaturePart, extra] = token.split(".");
	if (!(payloadPart && signaturePart) || extra !== undefined) {
		return null;
	}
	const signature = fromBase64Url(signaturePart);
	if (!signature) {
		return null;
	}
	const key = await importHmacKey(secret);
	const isValid = await crypto.subtle.verify(
		"HMAC",
		key,
		signature,
		encoder.encode(payloadPart)
	);
	if (!isValid) {
		return null;
	}
	const payload = parsePayload(payloadPart);
	if (!payload || payload.exp <= Math.floor(now.getTime() / 1000)) {
		return null;
	}
	return payload;
}

// 클라이언트에서 서명 검증 없이 성별만 읽는다(UI 분기·가입 이관용). 게이트 판정에는
// 절대 쓰지 않는다 — 위조 가능한 값이다.
export function decodeGuestTokenGender(
	token: string
): "female" | "male" | null {
	const payloadPart = token.split(".")[0];
	if (!payloadPart) {
		return null;
	}
	return parsePayload(payloadPart)?.gender ?? null;
}

// Cookie 헤더(또는 document.cookie) 문자열에서 게스트 토큰만 뽑는다. 값이 비어 있으면
// null — 만료 처리로 빈 값이 남은 쿠키를 토큰으로 오인하지 않는다.
export const readGuestTokenFromCookieString = (
	cookie: string
): string | null => {
	const entry = cookie
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${GUEST_COOKIE_NAME}=`));
	const value = entry?.slice(GUEST_COOKIE_NAME.length + 1);
	return value ? value : null;
};
