import { analyticsRouter } from "./analytics";
import { bannedWordsRouter } from "./banned-words";
import { blocksRouter } from "./blocks";
import { chatsRouter } from "./chats";
import { communityRouter } from "./community";
import { jobsRouter } from "./jobs";
import { moderationRouter } from "./moderation";
import { onboardingRouter } from "./onboarding";
import { organizationsRouter } from "./organizations";
import { promotionsRouter } from "./promotions";
import { reviewsRouter } from "./reviews";
import { supportRouter } from "./support";
import { teamsRouter } from "./teams";

export const bambiRouter = {
	analytics: analyticsRouter,
	bannedWords: bannedWordsRouter,
	blocks: blocksRouter,
	chats: chatsRouter,
	community: communityRouter,
	jobs: jobsRouter,
	moderation: moderationRouter,
	onboarding: onboardingRouter,
	organizations: organizationsRouter,
	promotions: promotionsRouter,
	reviews: reviewsRouter,
	support: supportRouter,
	teams: teamsRouter,
};
