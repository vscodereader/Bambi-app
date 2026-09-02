import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/bambi/onboarding/onboarding-flow";
import { homePathForRole } from "@/lib/bambi/home-path";
import { isOnboardingRole } from "@/lib/bambi/onboarding";
import {
	canReplayAudience,
	parseOnboardingReplayRequest,
} from "@/lib/bambi/onboarding-route";
import { resolveOnboardingAccess } from "@/lib/bambi/require-role";

export default async function OnboardingPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const [{ role }, params] = await Promise.all([
		resolveOnboardingAccess(),
		searchParams,
	]);
	if (!isOnboardingRole(role)) {
		redirect(homePathForRole(role));
	}

	const hasReplayQuery =
		params.audience !== undefined || params.source !== undefined;
	const replay = parseOnboardingReplayRequest(params);
	if (hasReplayQuery && !(replay && canReplayAudience(replay.audience, role))) {
		redirect(homePathForRole(role));
	}

	return (
		<OnboardingFlow
			audience={replay?.audience ?? role}
			role={role}
			source={replay ? "replay" : "signup"}
		/>
	);
}
