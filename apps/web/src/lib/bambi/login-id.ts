// 로그인 입력 한 칸으로 아이디·이메일을 모두 받기 위한 판별.
//
// 아이디 규칙(@bambi-app/auth의 login-id.ts)은 영문·숫자와 밑줄·마침표·하이픈만 허용해
// "@"가 들어갈 수 없다. 그래서 "@" 포함 여부만으로 두 값을 안전하게 가를 수 있다. 여기서 하는 일은
// signIn.email과 signIn.username 중 어디로 보낼지 고르는 것뿐이고, 실제 형식·존재
// 검증은 서버가 한다 — 화면에서 "이메일 형식이 아니에요"까지 따지면 아이디를 넣은
// 사람에게 엉뚱한 오류를 보이게 된다.
export const isEmailLoginId = (value: string): boolean => value.includes("@");
