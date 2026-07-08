import { analyticsRouter } from "./analytics";
import { blocksRouter } from "./blocks";
import { chatsRouter } from "./chats";
import { jobsRouter } from "./jobs";
import { moderationRouter } from "./moderation";
import { onboardingRouter } from "./onboarding";
import { organizationsRouter } from "./organizations";
import { promotionsRouter } from "./promotions";
import { reviewsRouter } from "./reviews";
import { teamsRouter } from "./teams";

export const bambiRouter = {
	analytics: analyticsRouter,
	blocks: blocksRouter,
	chats: chatsRouter,
	jobs: jobsRouter,
	moderation: moderationRouter,
	onboarding: onboardingRouter,
	organizations: organizationsRouter,
	promotions: promotionsRouter,
	reviews: reviewsRouter,
	teams: teamsRouter,
};
