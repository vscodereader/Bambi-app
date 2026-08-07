/**
 * 인증 패널의 현재 모드를 URL 쿼리(`auth`)에 기록한 주소를 만든다.
 *
 * 모바일 본인인증은 리디렉션이라 복귀하면 페이지가 새로 뜨고, AuthPanel은 쿼리만 보고
 * 모드를 복원한다. 그래서 모드 전환은 state뿐 아니라 URL에도 남아야 한다. 그 밖의 화면
 * 쿼리는 보존하고, 같은 뜻의 레거시 `mode`는 지워 한 곳(`auth`)만 진실로 남긴다.
 */
export const getAuthModeUrl = (
	pathname: string,
	searchParams: Pick<URLSearchParams, "toString">,
	mode: "sign-in" | "sign-up"
): string => {
	const nextParams = new URLSearchParams(searchParams.toString());

	nextParams.delete("mode");
	nextParams.set("auth", mode === "sign-up" ? "signup" : "login");

	return `${pathname}?${nextParams.toString()}`;
};
