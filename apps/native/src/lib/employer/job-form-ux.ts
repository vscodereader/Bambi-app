// 공고 폼의 자잘한 UX 순수 로직. 화면(native-job-form)에서 떼어내 단위 테스트한다.

// 화면에 그려지는 순서. getFirstErrorField가 이 순서로 첫 오류를 고른다 — 객체 키 순서에
// 기대면 안 된다. 이름은 native-job-form의 fieldErrors 키(= NativeJobForm 키)와 정확히 맞춘다.
// 그룹 순서: 기본 정보 → 근무 조건 → 상세 소개(설명이 면접 안내보다 뒤에 온다).
export const FORM_FIELD_ORDER = [
	"organizationId",
	"title",
	"industryCategory",
	"regionCode",
	"districtCode",
	"payAmount",
	"payUnit",
	"workSchedule",
	"interviewNotes",
	"description",
] as const;

// 저장값은 순수 숫자다 — 표시 포맷(콤마)이 state로 새어 들어가면 서버로 콤마가 간다.
// 그래서 이 함수는 표시용으로만 쓰고, state에는 숫자만 추출해 넣는다.
export const formatPayAmountInput = (value: string): string => {
	const digits = value.replace(/[^0-9]/gu, "");

	// 천단위 콤마. Number 변환을 피해 큰 값·앞자리 0에서도 자릿수가 안 흔들린다.
	return digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
};

// 폼 순서상 가장 먼저 나오는 오류 필드. 없으면 null(스크롤/포커스 대상 없음).
export const getFirstErrorField = (
	errors: Record<string, string | undefined>
): string | null =>
	FORM_FIELD_ORDER.find((field) => Boolean(errors[field])) ?? null;

// 작성한 내용이 있으면(isDirty) 이탈을 경고한다. 단, 제출로 화면을 떠나는 것(isSubmitting)은
// 막지 않는다 — 성공 후 이동까지 확인창이 뜨면 안 된다.
export const shouldWarnOnLeave = ({
	isDirty,
	isSubmitting,
}: {
	isDirty: boolean;
	isSubmitting: boolean;
}): boolean => isDirty && !isSubmitting;
