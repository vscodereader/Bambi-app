import { describe, expect, it } from "vitest";

import {
	canRevealContact,
	canStartChat,
	canViewCounterpartContact,
	getEmployerVerificationStatusLabel,
	getJobPostStatusLabel,
	getUpdatedJobPostStatus,
	isWithdrawalPurgeDue,
	resolveWithdrawalPurgeCutoff,
	shouldPrioritizeJobPost,
} from "./bambi-policy";

describe("탈퇴 파기 보존기간 경계", () => {
	const now = new Date("2026-08-05T09:00:00.000Z");

	it("보존기간(일)만큼 과거를 경계로 잡는다", () => {
		expect(resolveWithdrawalPurgeCutoff(now, 30).toISOString()).toBe(
			"2026-07-06T09:00:00.000Z"
		);
	});

	it("보존기간을 줄이면 경계가 현재에 가까워진다", () => {
		expect(resolveWithdrawalPurgeCutoff(now, 1).getTime()).toBeGreaterThan(
			resolveWithdrawalPurgeCutoff(now, 30).getTime()
		);
	});
});

// KST 기준 판정이라 UTC로 9시간 뺀 시각을 쓴다(KST 04:00 = 전날 19:00 UTC).
describe("파기 배치 실행 도래 판정", () => {
	const kst = (iso: string) => new Date(new Date(`${iso}+09:00`).toISOString());

	it("설정 시각 전에는 돌지 않는다", () => {
		expect(
			isWithdrawalPurgeDue(
				{ hour: 4, lastRunAt: null },
				kst("2026-08-05T03:59:00")
			)
		).toBe(false);
	});

	it("설정 시각이 지나고 그날 실행이 없으면 돈다", () => {
		expect(
			isWithdrawalPurgeDue(
				{ hour: 4, lastRunAt: null },
				kst("2026-08-05T04:00:00")
			)
		).toBe(true);
	});

	it("그날 설정 시각 이후에 이미 돌았으면 건너뛴다", () => {
		expect(
			isWithdrawalPurgeDue(
				{ hour: 4, lastRunAt: kst("2026-08-05T04:10:00") },
				kst("2026-08-05T23:50:00")
			)
		).toBe(false);
	});

	it("어제 실행분은 오늘 몫을 대신하지 않는다", () => {
		expect(
			isWithdrawalPurgeDue(
				{ hour: 4, lastRunAt: kst("2026-08-04T04:10:00") },
				kst("2026-08-05T04:00:00")
			)
		).toBe(true);
	});

	it("설정 시각 전 실행은 그날 몫으로 치지 않는다(수동 실행 뒤 예약 실행)", () => {
		// 새벽 1시에 운영자가 수동 실행 → 04:00 예약 실행은 그대로 돈다.
		expect(
			isWithdrawalPurgeDue(
				{ hour: 4, lastRunAt: kst("2026-08-05T01:00:00") },
				kst("2026-08-05T04:00:00")
			)
		).toBe(true);
	});

	it("설정 시각을 지나 재시작해도 그날 몫을 캐치업한다", () => {
		expect(
			isWithdrawalPurgeDue(
				{ hour: 4, lastRunAt: kst("2026-08-04T04:10:00") },
				kst("2026-08-05T15:00:00")
			)
		).toBe(true);
	});

	it("시각 미설정이면 기본값(새벽 4시)을 쓴다", () => {
		expect(
			isWithdrawalPurgeDue(
				{ hour: null, lastRunAt: null },
				kst("2026-08-05T03:00:00")
			)
		).toBe(false);
		expect(
			isWithdrawalPurgeDue(
				{ hour: null, lastRunAt: null },
				kst("2026-08-05T05:00:00")
			)
		).toBe(true);
	});

	it("자정(0시)으로 설정하면 KST 하루가 바뀌자마자 돈다", () => {
		expect(
			isWithdrawalPurgeDue(
				{ hour: 0, lastRunAt: kst("2026-08-04T00:10:00") },
				kst("2026-08-05T00:00:00")
			)
		).toBe(true);
	});

	it("UTC 기준으로 전날이어도 KST 시각으로 판정한다", () => {
		// 2026-08-05 15:00 UTC = 2026-08-06 00:00 KST → KST로는 새 하루의 4시 이전.
		expect(
			isWithdrawalPurgeDue(
				{ hour: 4, lastRunAt: new Date("2026-08-05T00:00:00.000Z") },
				new Date("2026-08-05T15:00:00.000Z")
			)
		).toBe(false);
	});
});

describe("bambi policy", () => {
	it("공개 중 공고를 수정하면 검수 대기로 내린다", () => {
		expect(getUpdatedJobPostStatus({ currentStatus: "published" })).toBe(
			"pending_review"
		);
	});

	it("숨김·반려·검수 보류 공고를 수정해도 검수 대기로 보낸다", () => {
		expect(getUpdatedJobPostStatus({ currentStatus: "hidden" })).toBe(
			"pending_review"
		);
		expect(getUpdatedJobPostStatus({ currentStatus: "rejected" })).toBe(
			"pending_review"
		);
		expect(getUpdatedJobPostStatus({ currentStatus: "on_hold" })).toBe(
			"pending_review"
		);
	});

	it("검수 보류는 공개 게이트를 통과하지 못한다", () => {
		expect(getJobPostStatusLabel("on_hold")).toBe("검수 보류");
		expect(
			canStartChat({
				accountStatus: "active",
				isPhoneVerified: true,
				jobPostStatus: "on_hold",
			})
		).toBe(false);
	});

	it("임시 저장은 제출 전이라 그대로 둔다", () => {
		expect(getUpdatedJobPostStatus({ currentStatus: "draft" })).toBe("draft");
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
