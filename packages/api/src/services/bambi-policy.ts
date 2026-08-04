export const employerVerificationStatuses = [
	"none",
	"pending",
	"verified",
	"rejected",
] as const;
export const jobPostStatuses = [
	"draft",
	"pending_review",
	"published",
	"hidden",
	"rejected",
	"on_hold",
] as const;
export const accountStatuses = ["active", "warned", "suspended"] as const;

// 탈퇴 계정 개인정보 보존기간 기본값(일). 실제 적용값은 운영자 사이트 설정
// (bambi_site_settings.withdrawal_retention_days)이 우선하고, 미설정이면 이 값을 쓴다.
// 해석은 bambi-member-policy의 resolveWithdrawalRetentionDays가 담당한다.
export const DEFAULT_WITHDRAWAL_RETENTION_DAYS = 30;

// 공고 상세의 급여 옆 보조 표기에 쓰는 최저시급 기본값. 실제 적용값은 운영자 사이트 설정
// (bambi_site_settings.minimum_wage_year / minimum_wage_hourly)이 우선하고, 미설정이면 이 값을 쓴다.
// 연도를 함께 두는 이유: 최저시급은 매년 바뀌고 다음 해 값이 8월에 미리 고시되므로
// new Date().getFullYear()로 유추하면 연말에 틀린 연도가 붙는다.
export const DEFAULT_MINIMUM_WAGE = { hourly: 10_320, year: 2026 } as const;
export const interviewStatuses = [
	"proposed",
	"confirmed",
	"declined",
	"canceled",
	"completed",
] as const;

export type EmployerVerificationStatus =
	(typeof employerVerificationStatuses)[number];
export type JobPostStatus = (typeof jobPostStatuses)[number];
export type AccountStatus = (typeof accountStatuses)[number];
export type InterviewStatus = (typeof interviewStatuses)[number];

interface UpdatedJobPostStatusInput {
	currentStatus: JobPostStatus;
}

interface CanStartChatInput {
	accountStatus: AccountStatus;
	isPhoneVerified: boolean;
	jobPostStatus: JobPostStatus;
}

interface CanRevealContactInput {
	interviewStatus: InterviewStatus;
	ownerConsented: boolean;
	ownerIsEmployer: boolean;
	ownerPhoneVerified: boolean;
}

interface ShouldPrioritizeJobPostInput {
	employerVerificationStatus: EmployerVerificationStatus;
	jobPostStatus: JobPostStatus;
}

const employerVerificationStatusLabels = {
	none: "미인증",
	pending: "인증 대기",
	verified: "인증 완료",
	rejected: "인증 반려",
} as const satisfies Record<EmployerVerificationStatus, string>;

const jobPostStatusLabels = {
	draft: "임시 저장",
	pending_review: "검수 대기",
	published: "공개",
	hidden: "숨김",
	rejected: "반려",
	on_hold: "검수 보류",
} as const satisfies Record<JobPostStatus, string>;

// 공고는 등록도 수정도 예외 없이 운영자 검수를 거친다. 업소 인증 여부나 내용 변경 여부로
// 검수를 건너뛰면, 승인된 본문을 나중에 갈아끼우는 우회가 열린다.
// draft만 예외다 — 아직 제출되지 않은 임시 저장이라 검수 대상이 아니다.
export const getUpdatedJobPostStatus = ({
	currentStatus,
}: UpdatedJobPostStatusInput): JobPostStatus =>
	currentStatus === "draft" ? "draft" : "pending_review";

export const canStartChat = ({
	accountStatus,
	isPhoneVerified,
	jobPostStatus,
}: CanStartChatInput): boolean =>
	accountStatus !== "suspended" &&
	isPhoneVerified &&
	jobPostStatus === "published";

// 완료된 면접도 확정을 거친 것이므로 연락처 흐름을 유지한다(완료 버튼을 눌러도
// 연락처 보기·공개가 꺼지지 않게). confirmed·completed만 인정하고 declined·canceled는
// 계속 차단한다. 두 정책이 같은 판정을 쓰도록 이 게이트 한 곳으로 모은다.
export const isContactRevealEligibleInterviewStatus = (
	status: string
): boolean => status === "confirmed" || status === "completed";

export const canRevealContact = ({
	interviewStatus,
	ownerConsented,
	ownerIsEmployer,
	ownerPhoneVerified,
}: CanRevealContactInput): boolean =>
	ownerIsEmployer &&
	isContactRevealEligibleInterviewStatus(interviewStatus) &&
	ownerConsented &&
	ownerPhoneVerified;

export interface CanViewCounterpartContactInput {
	counterpartConsented: boolean;
	interviewStatus: string;
	viewerIsEmployer: boolean;
}

// 연락처 공개는 구인자만 한다. 구직자는 공개할 연락처가 없으므로 구인자 동의만으로
// 열람하고, 구인자는 상대(구직자) 연락처를 볼 수 없다(공개 주체가 없음).
export const canViewCounterpartContact = ({
	counterpartConsented,
	interviewStatus,
	viewerIsEmployer,
}: CanViewCounterpartContactInput): boolean =>
	!viewerIsEmployer &&
	isContactRevealEligibleInterviewStatus(interviewStatus) &&
	counterpartConsented;

export const getEmployerVerificationStatusLabel = (
	status: EmployerVerificationStatus
): string => employerVerificationStatusLabels[status];

export const getJobPostStatusLabel = (status: JobPostStatus): string =>
	jobPostStatusLabels[status];

export const shouldPrioritizeJobPost = ({
	employerVerificationStatus,
	jobPostStatus,
}: ShouldPrioritizeJobPostInput): boolean =>
	employerVerificationStatus === "verified" && jobPostStatus === "published";
