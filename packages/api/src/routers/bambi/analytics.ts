import { ORPCError } from "@orpc/server";

import { protectedProcedure } from "../../index";
import { getEmployerJobPerformanceSummary } from "../../services/bambi-analytics";
import { requireActiveBambiProfile } from "../../services/bambi-authz";

export const analyticsRouter = {
	summary: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		if (profile.role === "job_seeker") {
			throw new ORPCError("FORBIDDEN");
		}

		return getEmployerJobPerformanceSummary(profile.userId);
	}),
};
