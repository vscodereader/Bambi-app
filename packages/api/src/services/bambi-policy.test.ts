import { describe, expect, it } from "vitest";

import {
	canRevealContact,
	canStartChat,
	getInitialJobPostStatus,
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

	it("reveals contact only after confirmed interview and owner consent", () => {
		expect(
			canRevealContact({
				interviewStatus: "confirmed",
				ownerConsented: true,
				ownerPhoneVerified: true,
			})
		).toBe(true);

		expect(
			canRevealContact({
				interviewStatus: "proposed",
				ownerConsented: true,
				ownerPhoneVerified: true,
			})
		).toBe(false);
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
});
