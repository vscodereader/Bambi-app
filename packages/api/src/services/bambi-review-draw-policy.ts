export function resolveReviewDrawRewardDecision(args: {
	accountActive: boolean;
	eligibleAt: Date;
	now: Date;
	recipientRole: string;
	reviewStatus: string;
}): "award" | "disqualify" | "wait" {
	if (args.now.getTime() < args.eligibleAt.getTime()) {
		return "wait";
	}
	if (
		args.reviewStatus !== "published" ||
		args.recipientRole !== "employer" ||
		!args.accountActive
	) {
		return "disqualify";
	}
	return "award";
}
