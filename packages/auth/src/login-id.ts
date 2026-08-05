// 로그인 아이디(user.login_id) 규칙 — 서버(better-auth username 플러그인)와 웹 회원가입
// 폼이 같은 규칙·같은 문구를 쓰도록 한곳에 모은다. 규칙이 갈리면 폼은 통과시켰는데 서버가
// 거부하는(또는 그 반대) 상황이 생긴다.
//
// 이 모듈은 의존성이 없는 순수 모듈이다 — 웹 클라이언트 번들에 그대로 들어가므로
// db·env 같은 서버 전용 모듈을 여기서 import 하지 않는다.

export const LOGIN_ID_MIN_LENGTH = 3;
export const LOGIN_ID_MAX_LENGTH = 30;

// better-auth username 플러그인의 기본 검증은 `[a-zA-Z0-9_.]`라 하이픈이 거부된다
// ("Username is invalid"). 하이픈을 더하되 마침표는 그대로 남긴다 — 기본 규칙으로 이미
// 가입한 아이디에 마침표가 들어 있을 수 있고, 로그인(/sign-in/username)도 같은 검증을
// 거치므로 여기서 빼면 그 계정이 로그인하지 못한다.
//
// 대문자를 막지 않는다: 저장 직전 소문자로 정규화되므로(normalizeLoginId) 대문자로 쳐도
// 결과는 같고, 로그인 때 대문자로 입력한 사람도 통과해야 한다.
const LOGIN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

// 화면 안내·에러 문구가 규칙과 어긋나지 않도록 문자 집합 설명도 여기서 만든다.
const LOGIN_ID_CHARSET_TEXT = "영문·숫자와 밑줄(_)·마침표(.)·하이픈(-)";

export const LOGIN_ID_HELP_TEXT = `${LOGIN_ID_MIN_LENGTH}~${LOGIN_ID_MAX_LENGTH}자의 ${LOGIN_ID_CHARSET_TEXT}만 쓸 수 있어요. 대문자는 소문자로 저장돼요.`;

export const LOGIN_ID_TAKEN_MESSAGE =
	"이미 사용 중인 아이디예요. 다른 아이디를 입력해 주세요.";

// 저장·조회에 쓰는 형태. username 플러그인의 기본 정규화(소문자)와 동일하게 맞춘다.
export function normalizeLoginId(value: string): string {
	return value.toLowerCase();
}

// 규칙에 어긋나면 한국어 안내를, 통과하면 null을 돌려준다.
// 입력값을 그대로(트림 없이) 본다 — 서버 검증이 받는 값과 어긋나면 안 되기 때문이다.
// 공백을 걷어내는 책임은 값을 만드는 쪽(폼)에 둔다.
export function getLoginIdErrorMessage(value: string): string | null {
	if (value.length < LOGIN_ID_MIN_LENGTH) {
		return `아이디는 ${LOGIN_ID_MIN_LENGTH}자 이상 입력해 주세요.`;
	}
	if (value.length > LOGIN_ID_MAX_LENGTH) {
		return `아이디는 ${LOGIN_ID_MAX_LENGTH}자까지 쓸 수 있어요.`;
	}
	if (!LOGIN_ID_PATTERN.test(value)) {
		return `아이디는 ${LOGIN_ID_CHARSET_TEXT}만 쓸 수 있어요.`;
	}
	return null;
}

// username 플러그인의 usernameValidator로 그대로 넘기는 형태.
export function isValidLoginId(value: string): boolean {
	return getLoginIdErrorMessage(value) === null;
}
