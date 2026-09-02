// 게스트 본인인증 토큰의 클라이언트 측 파싱. 서버(packages/api/services/bambi-guest-token
// 의 parsePayload)와 같은 페이로드 규칙을 쓰되, 서명은 검증하지 않는다 — 진위 판정은
// 서명 키를 아는 서버(context.ts)만 하고, 여기서 푼 값은 화면 분기(익명/게스트/멤버,
// 커뮤니티 노출)용일 뿐이다. react-native·expo를 import 하지 않아 노드에서 그대로
// 테스트된다(identity-verification.ts와 같은 규칙).

export const GUEST_TOKEN_STORAGE_KEY = "bambi-app.guest-token";

export interface GuestVisitor {
	gender: "female" | "male" | null;
	gid: string | null;
	token: string;
}

const BASE64URL_DASH = /-/g;
const BASE64URL_UNDERSCORE = /_/g;

// TextDecoder는 Hermes 호환이 불확실해 쓰지 않는다 — atob(Hermes에 있음)으로 base64url을
// 풀고(-,_ 치환·패딩 복원) JSON.parse 한다.
const decodePayload = (payloadPart: string): unknown => {
	try {
		let base64 = payloadPart
			.replace(BASE64URL_DASH, "+")
			.replace(BASE64URL_UNDERSCORE, "/");
		// base64url은 패딩을 떼고 오므로 4의 배수로 복원한다.
		const remainder = base64.length % 4;
		if (remainder) {
			base64 += "=".repeat(4 - remainder);
		}
		return JSON.parse(atob(base64));
	} catch {
		return null;
	}
};

// 토큰 "payloadB64url.sigB64url"의 첫 부분만 읽어 방문자 정보를 돌려준다. 서버
// parsePayload와 같은 규칙: v가 1|2, exp 숫자, gender가 male|female|null, gid는 문자열
// (없을 수 있음). exp가 지났으면 만료로 null, 파싱 실패도 null.
export const resolveGuestVisitor = (
	token: string | null | undefined,
	now: Date
): GuestVisitor | null => {
	if (!token) {
		return null;
	}
	const parsed = decodePayload(token.split(".")[0] ?? "");
	if (typeof parsed !== "object" || parsed === null) {
		return null;
	}
	const { exp, gender, gid, v } = parsed as Record<string, unknown>;
	if ((v !== 1 && v !== 2) || typeof exp !== "number") {
		return null;
	}
	if (gender !== "male" && gender !== "female" && gender !== null) {
		return null;
	}
	if (exp <= Math.floor(now.getTime() / 1000)) {
		return null;
	}
	return {
		gender,
		gid: typeof gid === "string" && gid !== "" ? gid : null,
		token,
	};
};

// 커뮤니티 노출 자격. 규칙의 출처는 웹 resolve-gate.ts의 GateInput 주석("gid + 여성")과
// 서버 resolveCommunityActor(여성 한정)이라 gid + gender === "female"까지 본다. 웹
// proxy.ts:71의 isCommunityGuest = Boolean(guest?.gender && guest.gid)는 성별 무관(남성도
// 통과)이라 자기 주석("여성 토큰만")과 어긋나 있다 — native는 서버 판정과 같은 축을 따른다.
export const isCommunityGuest = (guest: GuestVisitor | null): boolean =>
	Boolean(guest?.gid && guest.gender === "female");
