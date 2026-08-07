const PORTONE_RETURN_PARAMS = [
	"identityVerificationId",
	"code",
	"message",
] as const;

/**
 * PortOne 모바일 리디렉션 결과만 URL에서 제거한다.
 *
 * 회원가입 진입 의도를 나타내는 `auth=signup`/`mode=sign-up`과 그 밖의 화면 상태는
 * 그대로 남겨야 인증 결과 처리 중 페이지가 다시 렌더돼도 로그인 폼으로 돌아가지 않는다.
 */
export const getPortOneReturnUrl = (
	pathname: string,
	searchParams: Pick<URLSearchParams, "toString">
): string => {
	const nextParams = new URLSearchParams(searchParams.toString());

	for (const key of PORTONE_RETURN_PARAMS) {
		nextParams.delete(key);
	}

	const query = nextParams.toString();
	return query ? `${pathname}?${query}` : pathname;
};
