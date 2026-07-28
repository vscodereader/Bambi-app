// 로그인 입력 한 칸으로 아이디·이메일을 모두 받기 위한 판별.
//
// better-auth의 username 플러그인은 기본 검증이 영숫자+언더스코어라 아이디에 "@"가
// 들어갈 수 없다(packages/auth/src/index.ts — 옵션 오버라이드 없이 기본값 사용).
// 그래서 "@" 포함 여부만으로 두 값을 안전하게 가를 수 있다. 여기서 하는 일은
// signIn.email과 signIn.username 중 어디로 보낼지 고르는 것뿐이고, 실제 형식·존재
// 검증은 서버가 한다 — 화면에서 "이메일 형식이 아니에요"까지 따지면 아이디를 넣은
// 사람에게 엉뚱한 오류를 보이게 된다.
export const isEmailLoginId = (value: string): boolean => value.includes("@");
