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

export const shouldPrioritizeJobPost = ({
	employerVerificationStatus,
	jobPostStatus,
}: ShouldPrioritizeJobPostInput): boolean =>
	employerVerificationStatus === "verified" && jobPostStatus === "published";
