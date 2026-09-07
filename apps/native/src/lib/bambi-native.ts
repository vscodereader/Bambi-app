import type { AdBannerLayoutInput } from "@bambi-app/api/services/bambi-ad-banner-layout";
import type { JobDescriptionBlock } from "@bambi-app/api/services/bambi-job-description-blocks";
import {
	buildLocalMediaUrl,
	isJobPostMediaStorageKey,
	LOCAL_JOB_MEDIA_PATH,
} from "@bambi-app/api/services/bambi-storage-policy";
import { getLoginIdErrorMessage } from "@bambi-app/auth/login-id";

import type { AdPreviewTemplateValue } from "@/src/lib/employer/ad-exposure";
import type { JobMediaUploadItem } from "@/src/lib/employer/job-media";

const TITLE_MIN_LENGTH = 2;
const TITLE_MAX_LENGTH = 80;
// 서버 jobPostInput이 지역 마스터의 법정동코드(10자리)만 받는다.
const REGION_CODE_LENGTH = 10;
const PAY_UNIT_MAX_LENGTH = 30;
const WORK_SCHEDULE_MAX_LENGTH = 200;
const DESCRIPTION_MIN_LENGTH = 10;
const DESCRIPTION_MAX_LENGTH = 2000;
const INTERVIEW_NOTES_MAX_LENGTH = 500;
// packages/auth가 emailAndPassword 길이를 지정하지 않아 better-auth 기본값(8/128)이 그대로
// 서버 규칙이다. 서버가 min/maxPasswordLength를 설정하면 이 두 값도 같이 옮겨야 한다.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

export type NativeHomeRoute = "/(seeker)" | "/onboarding";

export type NativeProfileRole = "admin" | "employer" | "job_seeker";

export type NativeRoleAreaRoute = "/(employer)" | "/(moderator)";

export interface NativeRoleTab {
	href: NativeRoleAreaRoute;
	title: string;
}

export interface NativeJobForm {
	description: string;
	// 시/도(regionCode) 안의 시군구. 빈 문자열이면 미선택 = "시/도 전체"(서버가 키 없음으로 처리).
	districtCode: string;
	industryCategory: string;
	interviewNotes: string;
	organizationId: string;
	payAmount: string;
	payUnit: string;
	regionCode: string;
	teamId: string;
	title: string;
	workSchedule: string;
}

export interface NativeJobPostInput {
	// 배너 레이아웃(단색 배경 등). 키 생략 = 서버가 기존 값 보존, null = 삭제. 앱은 background만
	// 바꿔 되돌려 웹에서 만든 문구 블록을 보존한다(bambi-ad-banner-layout).
	adBannerLayout?: AdBannerLayoutInput | null;
	adProductId?: null | string;
	beginnerFriendly?: boolean;
	description: string;
	descriptionBlocks?: JobDescriptionBlock[];
	detailDesignAmount?: null | number;
	// 상세이미지 디자인 제작 애드온. 키 생략 = 서버가 기존 신청 상태 보존(값이 바뀐 경우에만
	// 싣는다). detailDesignAmount는 "클라이언트가 본 가격"이라 서버가 재확인용으로만 쓴다.
	detailDesignRequested?: boolean;
	// 세부지역(시군구). 미선택이면 웹 폼과 같이 키 자체를 빼서 보낸다(서버가 "시/도 전체").
	districtCode?: string;
	exposureAmount?: null | number;
	exposureDurationDays?: null | number;
	// 서버 입력이 업종 enum이라 제출 페이로드는 확정 목록 값으로 좁힌다(폼 상태는 string 유지).
	industryCategory: NativeIndustryOption;
	instantInterview?: boolean;
	interviewNotes?: string;
	// 배너(adHorizontal/adVertical)는 native가 편집하지 않지만, media는 전량 교체라 web이 올린
	// 배너를 되돌려 보내지 않으면 서버가 배너 행·GCS 객체를 지운다 — 수정 시 그대로 실어 보낸다.
	media?: {
		adHorizontal?: JobMediaUploadItem;
		adVertical?: JobMediaUploadItem;
		cover?: JobMediaUploadItem;
		detail: JobMediaUploadItem[];
	};
	organizationId: string;
	// "협의" 단위는 금액이 없다 — 서버 jobPostInput refine이 짝을 강제한다.
	payAmount: null | number;
	paymentMethod?: "bank_transfer" | "card" | null;
	payUnit: string;
	// 이번 결제에 쓸 포인트(1P=1원). 서버 jobPostInput이 min(0).default(0)로 받으므로 무료면 0.
	pointsToUse?: number;
	regionCode: string;
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

export const payUnitOptions = ["시급", "일급", "주급", "월급", "협의"] as const;

// 급여 협의 단위 — 금액 없이 저장한다(web bambi-options.ts의 NEGOTIABLE_PAY_UNIT과 같은 값).
export const NEGOTIABLE_PAY_UNIT = "협의";

export const jobStatusLabels = {
	draft: "임시 저장",
	hidden: "숨김",
	on_hold: "검수 보류",
	pending_review: "검수 대기",
	published: "공개",
	rejected: "반려",
} as const;

export const verificationStatusLabels = {
	changes_unsubmitted: "변경사항 미제출",
	none: "미인증",
	pending: "인증 대기",
	rejected: "인증 반려",
	verified: "인증 완료",
} as const;

export const emptyNativeJobForm: NativeJobForm = {
	description: "",
	// 세부지역은 선택 항목이라 기본은 미선택(빈 문자열).
	districtCode: "",
	industryCategory: industryOptions[0] ?? "",
	interviewNotes: "",
	organizationId: "",
	payAmount: "",
	payUnit: payUnitOptions[0] ?? "",
	// 지역은 서버 마스터(bambi.regions.list)에서 고르므로 기본값을 둘 수 없다.
	regionCode: "",
	teamId: "",
	title: "",
	workSchedule: "",
};

const trim = (value: string): string => value.trim();

const isLengthBetween = (value: string, min: number, max: number): boolean =>
	value.length >= min && value.length <= max;

const findFirstError = (errors: NativeJobFormErrors): string | undefined =>
	Object.values(errors).find((message) => Boolean(message));

// 세부지역(선택 항목) 검증. 값이 없으면 빈 객체라 errors에 키가 남지 않고, 값이 있으면
// regionCode와 같은 10자리만 허용한다. 오류 없음도 빈 객체로 돌려 호출부가 분기 없이 합친다.
const districtCodeErrors = (districtCode: string): NativeJobFormErrors =>
	districtCode && districtCode.length !== REGION_CODE_LENGTH
		? { districtCode: "세부지역을 다시 선택해 주세요." }
		: {};

// 협의 단위면 금액을 받지 않고, 그 외 단위만 1 이상 정수를 요구한다. 검증 함수의 인지
// 복잡도를 낮추려 조건식을 이름 있는 헬퍼로 뺐다(동작은 그대로).
const isValidPayAmount = (
	payAmount: null | number,
	isNegotiable: boolean
): boolean =>
	isNegotiable || (Number.isInteger(payAmount) && (payAmount ?? 0) > 0);

// 앱 시작 홈은 역할과 무관하게 구직자 홈이다(웹 redirectToRoleHome과 같은 규칙 —
// 루트는 항상 /seeker로 보내고, 구인자·운영자는 하단 탭의 역할 탭으로 자기 영역에 들어간다).
// 프로필이 없는 사용자만 온보딩으로 보낸다.
export const getNativeHomeRoute = (
	role: NativeProfileRole | null | undefined
): NativeHomeRoute => (role ? "/(seeker)" : "/onboarding");

// 구직자 하단 탭에서 수다방과 내 정보 사이에 끼우는 역할 탭. 구직자·미가입은 탭이 없다
// (웹 mobile-tab-bar의 "구인 관리"·"운영자 모드" 탭과 같은 축).
export const getNativeRoleTab = (
	role: NativeProfileRole | null | undefined
): NativeRoleTab | null => {
	if (role === "employer") {
		return { href: "/(employer)", title: "구인자 관리" };
	}
	if (role === "admin") {
		return { href: "/(moderator)", title: "운영자 페이지" };
	}
	return null;
};

// 구직자 화면도 전환 대상이지만 새 라우트 문자열을 만들지 않는다 — 홈 라우트가 이미
// 같은 경로를 갖고 있어 그걸 좁혀 쓴다(경로가 바뀌면 한 곳만 고치면 된다).
const SEEKER_AREA_ROUTE = "/(seeker)" satisfies NativeHomeRoute;

export type NativeAreaRoute = NativeRoleAreaRoute | typeof SEEKER_AREA_ROUTE;

export interface NativeAreaOption {
	href: NativeAreaRoute;
	title: string;
}

// 역할 영역 헤더의 화면 전환 메뉴가 그릴 목록. 역할 영역은 루트 스택에 push된 별도 탭
// 셸이라 자체 탭바·헤더 어디에도 구직자로 돌아갈 길이 없다 — 그 출구를 여기서 만든다.
// 구직자·미가입은 오갈 곳이 없어 빈 배열이고, 호출부는 메뉴 자체를 그리지 않는다.
export const getNativeAreaOptions = (
	role: NativeProfileRole | null | undefined
): NativeAreaOption[] => {
	// 역할 영역 항목은 하단 역할 탭을 그대로 재사용한다 — 같은 대상을 탭과 메뉴가 다른
	// 이름으로 부르면 안 되므로 문구를 복제하지 않고 한 벌만 둔다.
	const roleTab = getNativeRoleTab(role);

	return roleTab
		? [{ href: SEEKER_AREA_ROUTE, title: "메인 공고 화면으로 이동" }, roleTab]
		: [];
};

export type NativeAreaSwitchAction = "back" | "replace";

// 역할 영역에서 구직자 화면으로 나갈 때 스택을 되감을지 새로 이동할지. 역할 탭으로 push해
// 들어온 경우엔 되감아야 구직자 탭의 선택 상태·스크롤이 그대로 살아 있다. 반대로 딥링크로
// 역할 영역이 곧장 열렸으면 되돌아갈 화면이 아예 없어(back은 앱을 닫는다) 이동해야 한다.
export const getNativeAreaSwitchAction = (
	canGoBack: boolean
): NativeAreaSwitchAction => (canGoBack ? "back" : "replace");

export const validateNativeJobForm = (
	form: NativeJobForm,
	options: { teamScopes?: NativeJobTeamScope[] } = {}
): NativeJobFormValidationResult => {
	const errors: NativeJobFormErrors = {};
	const organizationId = trim(form.organizationId);
	const teamId = trim(form.teamId);
	const title = trim(form.title);
	const industryCategory = trim(form.industryCategory);
	const regionCode = trim(form.regionCode);
	const districtCode = trim(form.districtCode);
	const payAmountText = trim(form.payAmount);
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

	if (regionCode.length !== REGION_CODE_LENGTH) {
		errors.regionCode = "지역을 선택해 주세요.";
	}

	// 세부지역은 선택 항목이라 비어 있으면 오류가 아니다. 값이 있으면 regionCode와 같은
	// 10자리(법정동코드)만 서버가 받으므로 그 길이만 확인한다. 검증 함수의 인지 복잡도가
	// 이미 상한이라 분기를 늘리지 않으려고 헬퍼 결과를 합쳐 넣는다.
	Object.assign(errors, districtCodeErrors(districtCode));

	const isNegotiable = payUnit === NEGOTIABLE_PAY_UNIT;
	const payAmount = isNegotiable ? null : Number(payAmountText);

	if (!(payUnit.length > 0 && payUnit.length <= PAY_UNIT_MAX_LENGTH)) {
		errors.payUnit = "급여 단위를 선택해 주세요.";
	}

	if (!isValidPayAmount(payAmount, isNegotiable)) {
		errors.payAmount = "급여 금액은 1 이상의 정수로 입력해 주세요.";
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
			// 미선택이면 키 자체를 뺀다(undefined를 넣으면 키가 남아 서버가 "시/도 전체"로
			// 처리하지 못한다). 웹 폼과 같은 취급이다.
			...(districtCode ? { districtCode } : {}),
			// 위 검증이 industryOptions 소속을 보장한 뒤에만 이 분기에 온다.
			industryCategory: industryCategory as NativeIndustryOption,
			interviewNotes: interviewNotes || undefined,
			organizationId,
			payAmount,
			payUnit,
			regionCode,
			teamId: teamId || undefined,
			title,
			workSchedule,
		},
		ok: true,
	};
};

export interface NativeLoginErrors {
	loginId?: string;
	password?: string;
}

// 아이디 규칙(@bambi-app/auth의 login-id.ts)이 영문·숫자와 밑줄·마침표·하이픈만 허용해
// "@"가 들어갈 수 없다. 그래서 웹(apps/web의 isEmailLoginId)과 똑같이 "@" 포함 여부만으로
// signIn.email과 signIn.username을 가른다. 형식·존재 검증은 서버가 한다.
export const isEmailLoginId = (value: string): boolean => value.includes("@");

export const validateNativeLoginInput = (
	loginId: string,
	password: string
): NativeLoginErrors => {
	const errors: NativeLoginErrors = {};

	if (!trim(loginId)) {
		errors.loginId = "아이디 또는 이메일을 입력해 주세요.";
	}

	if (password.length < PASSWORD_MIN_LENGTH) {
		errors.password = "비밀번호는 8자 이상이어야 해요.";
	} else if (password.length > PASSWORD_MAX_LENGTH) {
		errors.password = "비밀번호는 128자까지 입력할 수 있어요.";
	}

	return errors;
};

// 계정복구의 새 비밀번호 검증. 서버 resetPasswordInput(8~128)과 같은 규칙을 클라에서 먼저
// 걸러 인증 건을 헛되이 소진시키지 않는다. 확인 입력 일치까지 한 함수에서 본다.
export const validateNewPassword = (
	password: string,
	passwordConfirm: string
): null | string => {
	if (password.length < PASSWORD_MIN_LENGTH) {
		return "비밀번호를 8자 이상 입력해 주세요.";
	}
	if (password.length > PASSWORD_MAX_LENGTH) {
		return "비밀번호는 128자까지 입력할 수 있어요.";
	}
	if (password !== passwordConfirm) {
		return "비밀번호가 일치하지 않아요.";
	}
	return null;
};

export type SignupRole = "job_seeker" | "employer";

export interface SignupFormValues {
	agreedToTerms: boolean;
	email: string;
	nickname: string;
	password: string;
	passwordConfirm: string;
	username: string;
}

export type SignupSubmitValues = SignupFormValues & { role: SignupRole };

// 웹 getValidationError(auth-panel.tsx:65) + 약관 동의 가드와 같은 규칙·문구·순서.
// username·nickname은 웹과 동일하게 trim해서 검사한다.
export const validateSignupInput = (
	values: SignupFormValues
): null | string => {
	if (values.nickname.trim().length < 2) {
		return "닉네임을 2자 이상 입력해 주세요.";
	}
	const loginIdError = getLoginIdErrorMessage(values.username.trim());
	if (loginIdError) {
		return loginIdError;
	}
	if (
		!values.email.includes("@") ||
		values.password.length < PASSWORD_MIN_LENGTH
	) {
		return "이메일과 8자 이상 비밀번호를 확인해 주세요.";
	}
	if (values.password !== values.passwordConfirm) {
		return "비밀번호가 일치하지 않아요.";
	}
	if (!values.agreedToTerms) {
		return "이용약관과 개인정보 처리방침에 동의해주세요";
	}
	return null;
};

// 목록 한 행이 쓰는 필드만 좁혀 둔 클라이언트 타입. 서버 응답(bambi.jobs.list)은 더 넓은
// 객체를 주지만 구조적 타이핑으로 그대로 들어온다. 연락처 계열 필드는 서버 selection에
// 애초에 없으므로 여기에도 추가하지 않는다.
export interface NativeSeekerJob {
	// 유료 카드(스페셜·급구·추천)에만 부착되는 조직 단위 누적 광고 집계. 서버 jobs.list가
	// inPaidSection일 때만 채우고 그 외(전체 공고·수집)엔 null이다 — 카드는 값이 있을 때만
	// 등급 배지를 그린다.
	adPeriod?: { count: number; totalDays: number } | null;
	// 순수 공고(job_post)의 커버 미디어. 서버는 storageKey 등 여러 필드를 주지만 카드는
	// storageKey만 써서 공개 버킷 URL을 조립한다. 수집 공고·커버 없는 공고는 null이다.
	coverImage?: { storageKey: string } | null;
	// 수집 공고(crawled)의 대표 이미지. job_post_media 행이 아니라 미러링된 한 줄(현재
	// base64 data URI)이라 storageKey 조립을 거치지 않고 그대로 <Image>에 넣는다.
	coverImageUrl?: null | string;
	employerDisplayName: null | string;
	employerVerificationStatus: null | string;
	id: string;
	industryCategory: string;
	instantInterview: boolean | null;
	payAmount: null | number;
	// 크롤 공고가 섞여 내려오는 목록이라 단위가 비어 있을 수 있다.
	payUnit: null | string;
	promotionLabel: null | string;
	region: string;
	// "crawled"면 jobs.getById가 job_post만 조회해 상세가 NOT_FOUND다 — 링크를 걸지 않는다.
	// job_post 쪽 값은 "converted" | "original"이다.
	source: string;
	title: string;
	workSchedule: null | string;
}

export interface NativeJobBadge {
	label: string;
	tone: "success" | "warning";
}

export interface NativeSeekerJobPage {
	sections: {
		organic: NativeSeekerJob[];
		recommended: NativeSeekerJob[];
		special: NativeSeekerJob[];
		urgent: NativeSeekerJob[];
	};
}

export const jobSectionTitles = {
	organic: "전체 공고",
	recommended: "추천 광고",
	special: "스페셜 광고",
	urgent: "급구 광고",
} as const;

export type NativeJobSectionKey = keyof typeof jobSectionTitles;

// 선택한 노출 상품의 프리뷰 템플릿 → 목록 미리보기가 그릴 섹션. 리스팅 계열만 자기 섹션으로
// 올라가고, 프리미엄·사이드 배너 상품과 무료 공고는 전체 공고(organic)로 미리 보여 준다
// — 배너 상품은 목록 카드가 아니라 상단·레일에 별도로 노출되므로 목록에서는 일반 카드다.
export const adPreviewTemplateToSectionKey = (
	template: AdPreviewTemplateValue | null | undefined
): NativeJobSectionKey => {
	switch (template) {
		case "special-list":
			return "special";
		case "urgent-list":
			return "urgent";
		case "recommended-list":
			return "recommended";
		default:
			return "organic";
	}
};

// 웹의 세로 액센트 바 색 언어를 그대로 옮긴다(스페셜=coral, 급구=amber, 추천=blue).
const jobSectionAccentClassNames = {
	organic: "bg-border",
	recommended: "bg-link",
	special: "bg-accent",
	urgent: "bg-warning",
} as const;

export interface NativeJobSection {
	accentClassName: (typeof jobSectionAccentClassNames)[NativeJobSectionKey];
	data: NativeSeekerJob[];
	key: NativeJobSectionKey;
	title: string;
}

// 유료 자리는 첫 페이지에서만 내려온다(2페이지부터는 organic만 이어진다). 배열 순서가
// 곧 화면 순서다.
const paidJobSectionKeys = ["special", "urgent", "recommended"] as const;

const toJobSection = (
	key: NativeJobSectionKey,
	data: NativeSeekerJob[]
): NativeJobSection => ({
	accentClassName: jobSectionAccentClassNames[key],
	data,
	key,
	title: jobSectionTitles[key],
});

export const buildSeekerJobSections = (
	pages: NativeSeekerJobPage[],
	config: { urgentHidden: boolean }
): NativeJobSection[] => {
	const [firstPage] = pages;
	const paidSections = paidJobSectionKeys
		.filter((key) => !(key === "urgent" && config.urgentHidden))
		.map((key) => toJobSection(key, firstPage?.sections[key] ?? []));
	// 서버가 수집 행을 유료 섹션과 전체 공고에 동시에 담으므로 전체 공고에서 걷어낸다.
	// 페이지끼리도 겹칠 수 있다 — organicOffset이 offset 기반이라 1페이지를 받은 뒤 새
	// 공고가 목록 앞에 삽입되면 밀려난 행이 2페이지에 다시 내려온다. 그대로 두면
	// SectionList가 duplicate key 경고를 내고 같은 카드가 두 번 그려진다.
	const seenIds = new Set(
		paidSections.flatMap((section) => section.data.map((job) => job.id))
	);
	const organic: NativeSeekerJob[] = [];

	for (const job of pages.flatMap((page) => page.sections.organic)) {
		if (seenIds.has(job.id)) {
			continue;
		}

		seenIds.add(job.id);
		organic.push(job);
	}

	return [...paidSections, toJobSection("organic", organic)].filter(
		(section) => section.data.length > 0
	);
};

// 배지 예산은 카드당 2개다 — 규칙을 더 넣으면 여기서 잘라내야 한다. 지역·업종·평점은
// 배지로 승격하지 않고 회색 메타 줄로 내린다.
export const buildJobCardBadges = (job: NativeSeekerJob): NativeJobBadge[] => {
	const badges: NativeJobBadge[] = [];

	// 두 필드 모두 truthy 검사다. 크롤 행은 false/"none"으로 내려오므로 기본값 true나 !!
	// 강제를 넣으면 우리가 확인한 적 없는 업소에 "인증 완료"가 붙는다.
	if (job.instantInterview) {
		badges.push({ label: "당일면접", tone: "warning" });
	}

	if (job.employerVerificationStatus === "verified") {
		badges.push({ label: verificationStatusLabels.verified, tone: "success" });
	}

	return badges;
};

const TRAILING_SLASH_RE = /\/$/;

// 공개 버킷 객체 URL 조립(server gcs.ts getPublicObjectUrl과 같은 모양). base가 없으면
// (개발·env 미설정) 만들 수 없으므로 null — 호출부가 각자 폴백을 고른다.
// dev의 공고 미디어는 GCS가 아니라 web 앱 로컬 라우트에 올라간다(job-image-upload가
// EXPO_PUBLIC_WEB_URL로 PUT) — web의 jobMediaPublicUrl과 같은 규칙으로 그 키는 같은 라우트
// (GET)에서 읽는다. 이 모듈은 순수(테스트가 노드에서 돈다)라 env 스키마를 import하지 않고
// process.env를 직접 본다(Expo가 EXPO_PUBLIC_*를 빌드 시 인라인한다).
export const publicObjectUri = (
	storageKey: string,
	gcsPublicBaseUrl: string | undefined,
	webUrl: string | undefined = process.env.EXPO_PUBLIC_WEB_URL
): null | string => {
	if (
		process.env.NODE_ENV !== "production" &&
		webUrl &&
		isJobPostMediaStorageKey(storageKey)
	) {
		return `${webUrl.replace(TRAILING_SLASH_RE, "")}${buildLocalMediaUrl(
			LOCAL_JOB_MEDIA_PATH,
			storageKey
		)}`;
	}

	return gcsPublicBaseUrl
		? `${gcsPublicBaseUrl.replace(TRAILING_SLASH_RE, "")}/${storageKey}`
		: null;
};

// 목록 카드 커버 이미지의 소스 URI를 고른다(web api-job-mapper의 커버 우선순위 이식).
// 순수 공고는 공개 버킷 base + storageKey로 URL을 조립하고, 수집 공고는 base64 data URI를
// 그대로 쓴다. base가 없거나(개발) 이미지가 아예 없으면 null → 카드가 업소명 타일로 폴백한다.
export const resolveJobCoverUri = (
	job: Pick<NativeSeekerJob, "coverImage" | "coverImageUrl">,
	gcsPublicBaseUrl: string | undefined
): null | string => {
	const storageKey = job.coverImage?.storageKey;

	return (
		(storageKey ? publicObjectUri(storageKey, gcsPublicBaseUrl) : null) ??
		job.coverImageUrl ??
		null
	);
};

// bambi-screen.tsx의 formatPay와 같은 규칙. 이 파일은 react-native를 import 하지 않는
// 순수 모듈이라(테스트가 노드에서 그대로 돈다) 컴포넌트 모듈에서 끌어오지 않고 같이 둔다.
const formatJobPay = (amount: null | number, unit: null | string): string => {
	if (amount === null) {
		return "급여 협의";
	}

	const money = `${amount.toLocaleString("ko-KR")}원`;

	return unit ? `${money} / ${unit}` : money;
};

// 행 하나를 한 문장으로 합성해 카드의 accessibilityLabel에 넣는다. 카드 내부 Text가
// 6~7노드로 쪼개져 낭독되면 20행 페이지에 120회 넘는 스와이프가 필요하다.
export const describeJobForScreenReader = (
	job: NativeSeekerJob,
	badges: NativeJobBadge[] = buildJobCardBadges(job)
): string =>
	[
		job.title,
		job.employerDisplayName ?? "밤비알바 구인자",
		job.region,
		job.workSchedule ?? "일정 협의",
		formatJobPay(job.payAmount, job.payUnit),
		...badges.map((badge) => badge.label),
	].join(", ");

// 누적 광고일수 등급 — 웹 apps/web/src/lib/bambi/ad-period.ts의 순수 로직만 이식한다.
// native는 웹의 colorClass(amber/slate 등 Tailwind 팔레트)를 쓰지 않는다 — heroui 토큰만
// 허용되고 그 팔레트가 native 테마에 없으므로, 렌더 레이어(index.tsx)가 icon 판별자로
// 색을 정한다. 여기서는 icon 종류·누적일수 경계·운영자 업로드 아이콘 URL만 옮긴다.
export interface NativeAdPeriodTier {
	// 카드가 이 값으로 아이콘을 고른다(웹 lucide crown/medal → native Ionicons trophy/medal).
	icon: "crown" | "medal";
	// 운영자가 올린 아이콘 이미지(GIF 등) URL. 있으면 icon 프리셋 대신 이걸 그린다.
	iconImageUrl?: null | string;
	label: string;
	// 티어 최대 누적 일수. 최상위는 상한 없음(null).
	maxDays: null | number;
	minDays: number;
}

// 웹 AD_PERIOD_TIERS와 같은 5구간(≤90 / 91–180 / 181–360 / 361–720 / ≥721). 운영자가
// 등급을 설정하지 않았을 때의 폴백이다.
export const NATIVE_AD_PERIOD_TIERS: readonly NativeAdPeriodTier[] = [
	{ icon: "medal", label: "브론즈", maxDays: 90, minDays: 0 },
	{ icon: "medal", label: "실버", maxDays: 180, minDays: 91 },
	{ icon: "medal", label: "골드", maxDays: 360, minDays: 181 },
	{ icon: "crown", label: "플래티넘", maxDays: 720, minDays: 361 },
	{ icon: "crown", label: "다이아", maxDays: null, minDays: 721 },
];

// 누적 일수 → 티어. tiers를 주입할 수 있고(운영자 설정값), 비었으면 상수로 폴백한다.
// 웹과 동일하게, 모든 구간을 넘긴 일수는 최하위가 아니라 최상위로 떨어뜨린다(오름차순 전제).
export const adPeriodTier = (
	totalDays: number,
	tiers: readonly NativeAdPeriodTier[] = NATIVE_AD_PERIOD_TIERS
): NativeAdPeriodTier => {
	const list = tiers.length > 0 ? tiers : NATIVE_AD_PERIOD_TIERS;
	return (
		list.find((tier) => tier.maxDays === null || totalDays <= tier.maxDays) ??
		list.at(-1) ??
		list[0]
	);
};

// "22회 900일". totalDays가 0이어도(백필 기간 null 행) 정직하게 그대로 노출한다.
export const formatAdPeriod = ({
	count,
	totalDays,
}: {
	count: number;
	totalDays: number;
}): string =>
	`${count.toLocaleString("ko-KR")}회 ${totalDays.toLocaleString("ko-KR")}일`;

// media.detail 상세 이미지 한 행. sliceGroupId가 있으면 세로로 긴 원본을 잘라 저장한
// 조각이고(같은 id끼리 한 장), 없으면(null) 비조각 단독 이미지다.
export interface DetailImageSliceItem {
	assetId: string;
	id: string;
	sliceGroupId?: null | string;
}

// 한 조각의 그룹 내 위치. 그룹 위/아래 끝에만 라운드·상하 테두리를 걸기 위한 플래그다.
export interface DetailImageSlicePiece {
	assetId: string;
	id: string;
	isGroupEnd: boolean;
	isGroupStart: boolean;
}

// 렌더 그룹: 조각들을 간격 0으로 이어 한 장처럼 그린다. key는 첫 조각 id.
export interface DetailImageSliceGroup {
	key: string;
	pieces: readonly DetailImageSlicePiece[];
}

// 상세 이미지 행들을 렌더 그룹으로 묶는다. 같은 sliceGroupId를 공유하는 "연속" 조각이
// 한 그룹이 되고, sliceGroupId가 없는 비조각 이미지는 각자 단독 그룹이 된다. 조각은
// 서버가 sliceIndex 오름차순으로 연속 배치해 내려주므로 여기선 인접 런만 묶으면 된다.
export const groupDetailImageSlices = (
	items: readonly DetailImageSliceItem[]
): DetailImageSliceGroup[] => {
	const runs: { groupId: null | string; items: DetailImageSliceItem[] }[] = [];
	for (const item of items) {
		const groupId = item.sliceGroupId ?? null;
		const current = runs.at(-1);
		if (groupId !== null && current?.groupId === groupId) {
			current.items.push(item);
		} else {
			runs.push({ groupId, items: [item] });
		}
	}

	return runs.map((run) => ({
		key: run.items[0].id,
		pieces: run.items.map((item, index) => ({
			assetId: item.assetId,
			id: item.id,
			isGroupEnd: index === run.items.length - 1,
			isGroupStart: index === 0,
		})),
	}));
};

// 역할 enum 원값을 화면에 내보내지 않는다 — 웹 my-page-shell의 ROLE_LABELS와 같은 표.
// 미등록 역할은 "구직자"로 폴백(법률자문 등 구직자 계정에 얹는 역할의 자연스러운 기본값).
const PROFILE_ROLE_LABELS: Record<string, string> = {
	admin: "관리자",
	employer: "구인자",
	job_seeker: "구직자",
	legal_advisor: "법률자문가",
};

export const profileRoleLabel = (role: null | string | undefined): string =>
	PROFILE_ROLE_LABELS[role ?? ""] ?? "구직자";

export interface NativeAccountStatusBadge {
	label: string;
	tone: "danger" | "neutral" | "success" | "warning";
}

// 계정 상태 enum 원값 노출 금지 — 웹 employer/me의 accountStatusLabels와
// getAccountStatusTone을 라벨·톤 한 쌍으로 합쳐 옮긴다(Pill tone에 그대로 꽂힌다).
const ACCOUNT_STATUS_BADGES: Record<string, NativeAccountStatusBadge> = {
	active: { label: "정상", tone: "success" },
	suspended: { label: "정지", tone: "danger" },
	warned: { label: "주의", tone: "warning" },
};

// 웹은 미등록 상태를 원값 그대로 흘리지만 native는 중립 문구로 떨어뜨린다.
export const accountStatusBadge = (
	status: null | string | undefined
): NativeAccountStatusBadge =>
	ACCOUNT_STATUS_BADGES[status ?? ""] ?? {
		label: "확인 필요",
		tone: "neutral",
	};

// 웹 MyPointsSummaryCard의 "다음 등급까지" 문구와 같은 규칙.
export const pointsToNextLabel = (
	nextGrade: { minPoints: number; name: string } | null,
	pointsToNext: null | number
): string =>
	nextGrade
		? `${(pointsToNext ?? 0).toLocaleString("ko-KR")}P 남음`
		: "최고 등급입니다";
