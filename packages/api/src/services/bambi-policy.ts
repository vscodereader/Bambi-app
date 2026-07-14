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
] as const;
export const accountStatuses = ["active", "warned", "suspended"] as const;
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

interface InitialJobPostStatusInput {
	employerVerificationStatus: EmployerVerificationStatus;
	hasRiskFlags: boolean;
}

interface UpdatedJobPostStatusInput {
	currentStatus: JobPostStatus;
	employerVerificationStatus: EmployerVerificationStatus;
	publicContentChanged: boolean;
}

interface CanStartChatInput {
	accountStatus: AccountStatus;
	isPhoneVerified: boolean;
	jobPostStatus: JobPostStatus;
}

interface CanRevealContactInput {
	interviewStatus: InterviewStatus;
	ownerConsented: boolean;
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
} as const satisfies Record<JobPostStatus, string>;

export const getInitialJobPostStatus = ({
	employerVerificationStatus,
	hasRiskFlags,
}: InitialJobPostStatusInput): JobPostStatus => {
	if (hasRiskFlags) {
		return "pending_review";
	}

	if (employerVerificationStatus === "verified") {
		return "published";
	}

	return "pending_review";
};

export const getUpdatedJobPostStatus = ({
	currentStatus,
	employerVerificationStatus,
	publicContentChanged,
}: UpdatedJobPostStatusInput): JobPostStatus => {
	if (currentStatus !== "published") {
		return currentStatus;
	}

	if (!publicContentChanged) {
		return currentStatus;
	}

	if (employerVerificationStatus === "verified") {
		return "published";
	}

	return "pending_review";
};

export const canStartChat = ({
	accountStatus,
	isPhoneVerified,
	jobPostStatus,
}: CanStartChatInput): boolean =>
	accountStatus !== "suspended" &&
	isPhoneVerified &&
	jobPostStatus === "published";

export const canRevealContact = ({
	interviewStatus,
	ownerConsented,
	ownerPhoneVerified,
}: CanRevealContactInput): boolean =>
	interviewStatus === "confirmed" && ownerConsented && ownerPhoneVerified;

export interface CanViewCounterpartContactInput {
	counterpartConsented: boolean;
	interviewStatus: string;
	mineConsented: boolean;
}

// 상대 연락처는 양쪽이 모두 동의해야 보인다. 내가 동의하지 않은 채 상대 것만 받아가는
// 무임승차를 막으려고 mineConsented를 함께 요구한다.
export const canViewCounterpartContact = ({
	counterpartConsented,
	interviewStatus,
	mineConsented,
}: CanViewCounterpartContactInput): boolean =>
	interviewStatus === "confirmed" && mineConsented && counterpartConsented;

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
