import { describe, expect, it } from "vitest";

import {
	canRevealContact,
	canStartChat,
	canViewCounterpartContact,
	getEmployerVerificationStatusLabel,
	getInitialJobPostStatus,
	getJobPostStatusLabel,
	getUpdatedJobPostStatus,
	shouldPrioritizeJobPost,
} from "./bambi-policy";

describe("bambi policy", () => {
	it("publishes verified employer posts immediately", () => {
		expect(
			getInitialJobPostStatus({
				employerVerificationStatus: "verified",
				hasRiskFlags: false,
			})
		).toBe("published");
	});

	it("keeps unverified employer posts pending review", () => {
		expect(
			getInitialJobPostStatus({
				employerVerificationStatus: "none",
				hasRiskFlags: false,
			})
		).toBe("pending_review");
	});

	it("keeps risky verified employer posts pending review", () => {
		expect(
			getInitialJobPostStatus({
				employerVerificationStatus: "verified",
				hasRiskFlags: true,
			})
		).toBe("pending_review");
	});

	it("returns approved unverified edited posts to review when public content changes", () => {
		expect(
			getUpdatedJobPostStatus({
				currentStatus: "published",
				employerVerificationStatus: "none",
				publicContentChanged: true,
			})
		).toBe("pending_review");

		expect(
			getUpdatedJobPostStatus({
				currentStatus: "hidden",
				employerVerificationStatus: "none",
				publicContentChanged: true,
			})
		).toBe("hidden");
	});

	it("keeps verified edited posts published when no risk flags exist", () => {
		expect(
			getUpdatedJobPostStatus({
				currentStatus: "published",
				employerVerificationStatus: "verified",
				publicContentChanged: true,
			})
		).toBe("published");

		expect(
			getUpdatedJobPostStatus({
				currentStatus: "published",
				employerVerificationStatus: "verified",
				publicContentChanged: false,
			})
		).toBe("published");
	});

	it("requires phone verification and blocks suspended accounts before chat starts", () => {
		expect(
			canStartChat({
				accountStatus: "active",
				isPhoneVerified: true,
				jobPostStatus: "published",
			})
		).toBe(true);

		expect(
			canStartChat({
				accountStatus: "warned",
				isPhoneVerified: true,
				jobPostStatus: "published",
			})
		).toBe(true);

		expect(
			canStartChat({
				accountStatus: "warned",
				isPhoneVerified: false,
				jobPostStatus: "published",
			})
		).toBe(false);

		expect(
			canStartChat({
				accountStatus: "suspended",
				isPhoneVerified: false,
				jobPostStatus: "published",
			})
		).toBe(false);

		expect(
			canStartChat({
				accountStatus: "suspended",
				isPhoneVerified: true,
				jobPostStatus: "published",
			})
		).toBe(false);
	});

	it("reveals contact only for the employer after a confirmed interview", () => {
		expect(
			canRevealContact({
				interviewStatus: "confirmed",
				ownerConsented: true,
				ownerIsEmployer: true,
				ownerPhoneVerified: true,
			})
		).toBe(true);

		// 구직자 소유자는 다른 조건을 모두 충족해도 공개할 수 없다.
		expect(
			canRevealContact({
				interviewStatus: "confirmed",
				ownerConsented: true,
				ownerIsEmployer: false,
				ownerPhoneVerified: true,
			})
		).toBe(false);

		expect(
			canRevealContact({
				interviewStatus: "proposed",
				ownerConsented: true,
				ownerIsEmployer: true,
				ownerPhoneVerified: true,
			})
		).toBe(false);
	});

	it("keeps revealing contact after the interview is completed", () => {
		// 완료 버튼을 눌러 상태가 completed가 돼도 확정을 거친 면접이라 공개는 유지된다.
		expect(
			canRevealContact({
				interviewStatus: "completed",
				ownerConsented: true,
				ownerIsEmployer: true,
				ownerPhoneVerified: true,
			})
		).toBe(true);

		// declined·canceled는 계속 차단.
		for (const interviewStatus of ["declined", "canceled"] as const) {
			expect(
				canRevealContact({
					interviewStatus,
					ownerConsented: true,
					ownerIsEmployer: true,
					ownerPhoneVerified: true,
				})
			).toBe(false);
		}
	});

	it("prioritizes published verified employer posts", () => {
		expect(
			shouldPrioritizeJobPost({
				employerVerificationStatus: "verified",
				jobPostStatus: "published",
			})
		).toBe(true);

		expect(
			shouldPrioritizeJobPost({
				employerVerificationStatus: "none",
				jobPostStatus: "published",
			})
		).toBe(false);
	});

	it("prioritizes only published posts from verified employers", () => {
		expect(
			shouldPrioritizeJobPost({
				employerVerificationStatus: "verified",
				jobPostStatus: "published",
			})
		).toBe(true);
		expect(
			shouldPrioritizeJobPost({
				employerVerificationStatus: "verified",
				jobPostStatus: "pending_review",
			})
		).toBe(false);
	});

	it("returns Korean labels for employer and job statuses", () => {
		expect(getEmployerVerificationStatusLabel("verified")).toBe("인증 완료");
		expect(getEmployerVerificationStatusLabel("pending")).toBe("인증 대기");
		expect(getJobPostStatusLabel("published")).toBe("공개");
		expect(getJobPostStatusLabel("pending_review")).toBe("검수 대기");
	});
});

describe("canViewCounterpartContact", () => {
	it("lets the job seeker view the employer contact once the employer consented and the interview is confirmed", () => {
		expect(
			canViewCounterpartContact({
				counterpartConsented: true,
				interviewStatus: "confirmed",
				viewerIsEmployer: false,
			})
		).toBe(true);
	});

	it("hides the contact from the job seeker while the employer has not consented", () => {
		expect(
			canViewCounterpartContact({
				counterpartConsented: false,
				interviewStatus: "confirmed",
				viewerIsEmployer: false,
			})
		).toBe(false);
	});

	it("never lets the employer view a counterpart contact", () => {
		// 공개 주체가 구인자뿐이라 구인자는 상대(구직자) 연락처를 볼 수 없다.
		expect(
			canViewCounterpartContact({
				counterpartConsented: true,
				interviewStatus: "confirmed",
				viewerIsEmployer: true,
			})
		).toBe(false);
	});

	it("still lets the job seeker view the employer contact after the interview is completed", () => {
		// 완료된 면접도 확정을 거친 것이라 열람이 유지된다.
		expect(
			canViewCounterpartContact({
				counterpartConsented: true,
				interviewStatus: "completed",
				viewerIsEmployer: false,
			})
		).toBe(true);
	});

	it("requires a confirmed or completed interview", () => {
		for (const interviewStatus of ["proposed", "declined", "canceled"]) {
			expect(
				canViewCounterpartContact({
					counterpartConsented: true,
					interviewStatus,
					viewerIsEmployer: false,
				})
			).toBe(false);
		}
	});
});
