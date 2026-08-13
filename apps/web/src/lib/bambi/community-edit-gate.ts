// 수정 폼 노출 판정(게이트). 컴포넌트 본체는 orpc·env 의존이라 node vitest에서 못 도는데,
// 이 순수 함수만 떼어 두면 게이트 로직을 가볍게 검증할 수 있다.
// 회원 작성자(isMemberAuthor)는 즉시 열고, 그 외(비회원 전부·비작성자)는 게이트 비번을
// 통과했을 때만 연다. 잠긴 글은 여기서 열지 않는다(잠금 축소 응답이 먼저 걸린다).
export function canOpenEditForm({
	appliedPassword,
	isMemberAuthor,
	locked,
}: {
	appliedPassword: string | undefined;
	isMemberAuthor: boolean;
	locked: boolean | undefined;
}): boolean {
	return locked === false && (isMemberAuthor || Boolean(appliedPassword));
}
