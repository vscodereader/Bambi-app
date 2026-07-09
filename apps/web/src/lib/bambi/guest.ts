export const GUEST_COOKIE_NAME = "bambi_guest";
export const GUEST_COOKIE_VALUE = "1";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// 휴대폰 본인인증 결과 쿠키. 지금은 실제 인증 API가 없어 목(mock) 폼 입력으로 세팅한다.
// 실인증 도입 시 이 상수·매핑과 목 폼을 함께 걷어낸다. 쿠키명은 인증 규격을 그대로
// 따른다(생년월일 adultbrith는 규격상 철자 유지).
export const ADULT_NAME_COOKIE = "adultname";
export const ADULT_BIRTH_COOKIE = "adultbrith";
export const ADULT_PHONE_COOKIE = "adultphone";
export const ADULT_SEX_COOKIE = "adultsex";
export const ADULT_CODE_COOKIE = "adultcode";

// 세션이 생기거나 로그아웃할 때 게스트 쿠키와 함께 만료시킬 인증 쿠키 목록.
export const ADULT_COOKIE_NAMES = [
	ADULT_NAME_COOKIE,
	ADULT_BIRTH_COOKIE,
	ADULT_PHONE_COOKIE,
	ADULT_SEX_COOKIE,
	ADULT_CODE_COOKIE,
] as const;

export type BambiGenderValue = "male" | "female";
// adultsex 규격: 1=남, 2=여.
export type AdultSexCode = "1" | "2";

export const genderToAdultSex = (gender: BambiGenderValue): AdultSexCode =>
	gender === "male" ? "1" : "2";

export const adultSexToGender = (sex: string): BambiGenderValue | null => {
	if (sex === "1") {
		return "male";
	}
	if (sex === "2") {
		return "female";
	}
	return null;
};

// 쿠키 문자열에서 성인인증 성별(adultsex)을 읽는다. clearGuestCookie가 adultsex를
// 만료시키기 전에 회원 프로필로 성별을 옮길 때 쓴다.
export const readAdultGenderFromCookieString = (
	cookie: string
): BambiGenderValue | null => {
	const entry = cookie
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${ADULT_SEX_COOKIE}=`));
	if (!entry) {
		return null;
	}
	return adultSexToGender(entry.slice(ADULT_SEX_COOKIE.length + 1));
};

// 목 인증 폼이 서버 라우트로 보내는 입력. adultcode(CI/DI)는 사용자가 입력하지 않고
// 서버가 목 랜덤 문자열로 생성한다.
export interface MockPhoneVerifyInput {
	birth: string;
	gender: BambiGenderValue;
	name: string;
	phone: string;
}

export const readGuestFromCookieString = (cookie: string): boolean =>
	cookie
		.split(";")
		.map((part) => part.trim())
		.some((part) => part === `${GUEST_COOKIE_NAME}=${GUEST_COOKIE_VALUE}`);

// 게스트 열람 쿠키를 서버 라우트를 통해 만료시킨다. 세팅(POST /api/guest)과 동일
// 경로로 처리해 쿠키 속성이 어긋나 삭제가 누락되는 일을 막는다. 회원가입·로그인으로
// 실제 세션이 생기면 더 이상 게스트가 아니므로 호출한다; 남겨두면 로그아웃·세션 만료
// 후에도 게스트 열람 권한이 잔존한다. 삭제 실패는 로그인/로그아웃 흐름을 막지 않는다.
export const clearGuestCookie = async (): Promise<void> => {
	try {
		await fetch("/api/guest", { method: "DELETE" });
	} catch {
		// 네트워크 실패 시 조용히 넘어간다(다음 진입 때 재시도 여지).
	}
};
