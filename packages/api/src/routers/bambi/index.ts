import { adProductsRouter } from "./ad-products";
import { analyticsRouter } from "./analytics";
import { bannedWordsRouter } from "./banned-words";
import { blocksRouter } from "./blocks";
import { chatsRouter } from "./chats";
import { communityRouter } from "./community";
import { crawlerRouter } from "./crawler";
import { jobsRouter } from "./jobs";
import { moderationRouter } from "./moderation";
import { onboardingRouter } from "./onboarding";
import { organizationsRouter } from "./organizations";
import { promotionsRouter } from "./promotions";
import { reviewsRouter } from "./reviews";
import { siteSettingsRouter } from "./site-settings";
import { supportRouter } from "./support";
import { teamsRouter } from "./teams";

export const bambiRouter = {
	adProducts: adProductsRouter,
	analytics: analyticsRouter,
	bannedWords: bannedWordsRouter,
	blocks: blocksRouter,
	chats: chatsRouter,
	community: communityRouter,
	crawler: crawlerRouter,
	jobs: jobsRouter,
	moderation: moderationRouter,
	onboarding: onboardingRouter,
	organizations: organizationsRouter,
	promotions: promotionsRouter,
	reviews: reviewsRouter,
	siteSettings: siteSettingsRouter,
	support: supportRouter,
	teams: teamsRouter,
};
