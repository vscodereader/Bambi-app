const TITLE_MIN_LENGTH = 2;
const TITLE_MAX_LENGTH = 80;
const OPTION_MAX_LENGTH = 80;
const PAY_UNIT_MAX_LENGTH = 30;
const WORK_SCHEDULE_MAX_LENGTH = 200;
const DESCRIPTION_MIN_LENGTH = 10;
const DESCRIPTION_MAX_LENGTH = 2000;
const INTERVIEW_NOTES_MAX_LENGTH = 500;

export type NativeHomeRoute =
	| "/(employer)"
	| "/(moderator)"
	| "/(seeker)"
	| "/onboarding";

export type NativeProfileRole = "admin" | "employer" | "job_seeker";

export interface NativeJobForm {
	description: string;
	industryCategory: string;
	interviewNotes: string;
	organizationId: string;
	payAmount: string;
	payUnit: string;
	region: string;
	teamId: string;
	title: string;
	workSchedule: string;
}

export interface NativeJobPostInput {
	description: string;
	// 서버 입력이 업종 enum이라 제출 페이로드는 확정 목록 값으로 좁힌다(폼 상태는 string 유지).
	industryCategory: NativeIndustryOption;
	interviewNotes?: string;
	organizationId: string;
	payAmount: number;
	payUnit: string;
	region: string;
	teamId?: string;
	title: string;
	workSchedule: string;
}

export interface NativeJobTeamScope {
	organizationId: string;
	teamId: string;
}

export type NativeJobFormErrors = Partial<Record<keyof NativeJobForm, string>>;

type NativeJobFormValidationResult =
	| {
			errors: NativeJobFormErrors;
			message: string;
			ok: false;
	  }
	| {
			input: NativeJobPostInput;
			ok: true;
	  };

export interface NativeScheduleSummary {
	id: string;
	status: string;
}

export const industryOptions = [
	"룸싸롱",
	"텐프로/쩜오",
	"노래주점",
	"단란주점",
	"다방",
	"BAR",
	"마사지",
	"요정",
] as const;

export type NativeIndustryOption = (typeof industryOptions)[number];

export const regionOptions = [
	"서울",
	"경기",
	"인천",
	"부산",
	"대구",
	"대전",
	"광주",
	"기타",
] as const;
export const payUnitOptions = ["시급", "일급", "주급", "월급"] as const;

export const jobStatusLabels = {
	draft: "임시 저장",
	hidden: "숨김",
	on_hold: "검수 보류",
	pending_review: "검수 대기",
	published: "공개",
	rejected: "반려",
} as const;

export const verificationStatusLabels = {
	none: "미인증",
	pending: "인증 대기",
	rejected: "인증 반려",
	verified: "인증 완료",
} as const;

export const emptyNativeJobForm: NativeJobForm = {
	description: "",
	industryCategory: industryOptions[0] ?? "",
	interviewNotes: "",
	organizationId: "",
	payAmount: "",
	payUnit: payUnitOptions[0] ?? "",
	region: regionOptions[0] ?? "",
	teamId: "",
	title: "",
	workSchedule: "",
};

const trim = (value: string): string => value.trim();

const isLengthBetween = (value: string, min: number, max: number): boolean =>
	value.length >= min && value.length <= max;

const findFirstError = (errors: NativeJobFormErrors): string | undefined =>
	Object.values(errors).find((message) => Boolean(message));

export const getNativeHomeRoute = (
	role: NativeProfileRole | null | undefined
): NativeHomeRoute => {
	switch (role) {
		case "admin":
			return "/(moderator)";
		case "employer":
			return "/(employer)";
		case "job_seeker":
			return "/(seeker)";
		default:
			return "/onboarding";
	}
};

export const validateNativeJobForm = (
	form: NativeJobForm,
	options: { teamScopes?: NativeJobTeamScope[] } = {}
): NativeJobFormValidationResult => {
	const errors: NativeJobFormErrors = {};
	const organizationId = trim(form.organizationId);
	const teamId = trim(form.teamId);
	const title = trim(form.title);
	const industryCategory = trim(form.industryCategory);
	const region = trim(form.region);
	const payAmountText = trim(form.payAmount);
	const payAmount = Number(payAmountText);
	const payUnit = trim(form.payUnit);
	const workSchedule = trim(form.workSchedule);
	const description = trim(form.description);
	const interviewNotes = trim(form.interviewNotes);

	if (!organizationId) {
		errors.organizationId = "공고를 등록할 조직을 선택해 주세요.";
	}

	const teamMatchesOrganization = options.teamScopes?.some(
		(scope) =>
			scope.organizationId === organizationId && scope.teamId === teamId
	);

	if (teamId && options.teamScopes && !teamMatchesOrganization) {
		errors.teamId = "선택한 팀이 조직에 속해 있는지 확인해 주세요.";
	}

	if (!isLengthBetween(title, TITLE_MIN_LENGTH, TITLE_MAX_LENGTH)) {
		errors.title = "공고 제목은 2자 이상 80자 이하로 입력해 주세요.";
	}

	// 서버 입력이 업종 enum이라 길이가 아니라 확정 목록 소속으로 검사한다.
	if (!(industryOptions as readonly string[]).includes(industryCategory)) {
		errors.industryCategory = "업종을 선택해 주세요.";
	}

	if (!(region.length > 0 && region.length <= OPTION_MAX_LENGTH)) {
		errors.region = "지역을 선택해 주세요.";
	}

	if (!(Number.isInteger(payAmount) && payAmount > 0)) {
		errors.payAmount = "급여 금액은 1 이상의 정수로 입력해 주세요.";
	}

	if (!(payUnit.length > 0 && payUnit.length <= PAY_UNIT_MAX_LENGTH)) {
		errors.payUnit = "급여 단위를 선택해 주세요.";
	}

	if (
		!(
			workSchedule.length > 0 && workSchedule.length <= WORK_SCHEDULE_MAX_LENGTH
		)
	) {
		errors.workSchedule = "근무 일정은 200자 이하로 입력해 주세요.";
	}

	if (
		!isLengthBetween(
			description,
			DESCRIPTION_MIN_LENGTH,
			DESCRIPTION_MAX_LENGTH
		)
	) {
		errors.description = "상세 설명은 10자 이상 2000자 이하로 입력해 주세요.";
	}

	if (interviewNotes.length > INTERVIEW_NOTES_MAX_LENGTH) {
		errors.interviewNotes = "면접 안내는 500자 이하로 입력해 주세요.";
	}

	const firstError = findFirstError(errors);

	if (firstError) {
		return {
			errors,
			message: firstError,
			ok: false,
		};
	}

	return {
		input: {
			description,
			// 위 검증이 industryOptions 소속을 보장한 뒤에만 이 분기에 온다.
			industryCategory: industryCategory as NativeIndustryOption,
			interviewNotes: interviewNotes || undefined,
			organizationId,
			payAmount,
			payUnit,
			region,
			teamId: teamId || undefined,
			title,
			workSchedule,
		},
		ok: true,
	};
};

export const getConfirmedScheduleId = (
	schedules: NativeScheduleSummary[]
): null | string =>
	schedules.find((schedule) => schedule.status === "confirmed")?.id ?? null;
