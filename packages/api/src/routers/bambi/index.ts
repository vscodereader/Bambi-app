import { chatsRouter } from "./chats";
import { jobsRouter } from "./jobs";
import { moderationRouter } from "./moderation";
import { onboardingRouter } from "./onboarding";
import { organizationsRouter } from "./organizations";
import { promotionsRouter } from "./promotions";
import { teamsRouter } from "./teams";

export const bambiRouter = {
	chats: chatsRouter,
	jobs: jobsRouter,
	moderation: moderationRouter,
	onboarding: onboardingRouter,
	organizations: organizationsRouter,
	promotions: promotionsRouter,
	teams: teamsRouter,
};
