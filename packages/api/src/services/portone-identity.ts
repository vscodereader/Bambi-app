// 포트원 V2 본인인증 결과 처리 — 단건조회·성인 판정·CI 해시.
// web의 게스트 라우트(/api/guest)와 api의 onboarding 라우터가 함께 import 하므로
// env·db에 의존하지 않는 순수 모듈로 유지한다(웹은 next.config transpilePackages 경유).

// 법정 연령 하한. 만 나이 기준 — 생일이 지나야 통과한다(연나이보다 엄격).
// 미성년 통과는 처벌 대상이지만 과잉 차단은 아니므로 보수적인 쪽을 택했다.
export const ADULT_MIN_AGE = 19;

export const UNDERAGE_MESSAGE = `만 ${ADULT_MIN_AGE}세 이상만 이용할 수 있어요.`;

export interface PortOneVerifiedCustomer {
	birthDate?: string;
	ci?: string;
	di?: string;
	gender?: string;
	name?: string;
	operator?: string;
	phoneNumber?: string;
}

export interface PortOneIdentityVerification {
	// 인증창을 태운 채널(SelectedChannelType: "LIVE" | "TEST"). 테스트 채널은 통신사
	// 대조를 하지 않아 아무 생년월일·주민번호 뒷자리나 통과시키므로, 호출부가 프로덕션에서
	// 걸러낼 수 있게 응답에서 살려 둔다.
	channel?: { type?: string };
	status: string;
	verifiedCustomer?: PortOneVerifiedCustomer;
}

const PORTONE_API_BASE = "https://api.portone.io";

// 본인인증 단건조회. 인증창(SDK)이 완료된 identityVerificationId의 진위를 서버가
// 직접 확인한다 — 클라이언트가 보낸 값은 신뢰하지 않는다.
export async function fetchIdentityVerification(
	apiSecret: string,
	identityVerificationId: string
): Promise<PortOneIdentityVerification> {
	const response = await fetch(
		`${PORTONE_API_BASE}/identity-verifications/${encodeURIComponent(identityVerificationId)}`,
		{ headers: { Authorization: `PortOne ${apiSecret}` } }
	);
	if (!response.ok) {
		throw new Error(
			`포트원 본인인증 조회에 실패했습니다(HTTP ${response.status}).`
		);
	}
	return (await response.json()) as PortOneIdentityVerification;
}

// 포트원 성별(MALE/FEMALE)을 프로필 enum으로. 그 외 값은 null(성별 미기록).
export function mapPortOneGender(
	gender: string | null | undefined
): "female" | "male" | null {
	const normalized = gender?.toUpperCase();
	if (normalized === "MALE") {
		return "male";
	}
	if (normalized === "FEMALE") {
		return "female";
	}
	return null;
}

const BIRTH8_PATTERN = /^\d{8}$/;

// 포트원 birthDate("1995-01-01")를 프로필 저장 형식(YYYYMMDD)으로.
export function toBirth8(birthDate: string | null | undefined): string | null {
	const digits = (birthDate ?? "").replace(/\D/g, "");
	return BIRTH8_PATTERN.test(digits) ? digits : null;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 만 나이 성인 판정. 서버가 UTC로 돌아도 한국 법정 나이는 한국 날짜 기준이어야 하므로
// KST로 환산한 오늘 날짜를 쓴다. YYYYMMDD 숫자 비교는 연도에 ADULT_MIN_AGE를 더하는
// 것과 동치라 생일 당일부터 통과한다(2/29생은 평년에 3/1부터 — 통상 해석과 일치).
export function isAdultBirth8(birth8: string, now: Date): boolean {
	if (!BIRTH8_PATTERN.test(birth8)) {
		return false;
	}
	const kst = new Date(now.getTime() + KST_OFFSET_MS);
	const todayYmd =
		kst.getUTCFullYear() * 10_000 +
		(kst.getUTCMonth() + 1) * 100 +
		kst.getUTCDate();
	return Number(birth8) + ADULT_MIN_AGE * 10_000 <= todayYmd;
}

// CI(연계정보)·DI(중복확인정보)는 사람마다/사이트별로 고유한 민감값이라 원문을
// 저장하지 않고 SHA-256 해시로만 보관한다(중복가입 판정용). 값 자체가 고엔트로피
// 비공개 값이라 무염 해시로 충분하다. CI·DI 둘 다 이 함수로 처리한다.
export async function hashIdentityValue(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value)
	);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
