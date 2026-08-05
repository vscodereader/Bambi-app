import { accountRecoveryRouter } from "./account-recovery";
import { adProductsRouter } from "./ad-products";
import { analyticsRouter } from "./analytics";
import { bannedWordsRouter } from "./banned-words";
import { blocksRouter } from "./blocks";
import { chatsRouter } from "./chats";
import { communityRouter } from "./community";
import { crawledJobsRouter } from "./crawled-jobs";
import { crawlerRouter } from "./crawler";
import { jobsRouter } from "./jobs";
import { mainPopupsRouter } from "./main-popups";
import { moderationRouter } from "./moderation";
import { onboardingRouter } from "./onboarding";
import { organizationsRouter } from "./organizations";
import { promotionsRouter } from "./promotions";
import { regionsRouter } from "./regions";
import { reviewsRouter } from "./reviews";
import { siteSettingsRouter } from "./site-settings";
import { supportRouter } from "./support";
import { teamsRouter } from "./teams";

export const bambiRouter = {
	accountRecovery: accountRecoveryRouter,
	adProducts: adProductsRouter,
	analytics: analyticsRouter,
	bannedWords: bannedWordsRouter,
	blocks: blocksRouter,
	chats: chatsRouter,
	community: communityRouter,
	crawledJobs: crawledJobsRouter,
	crawler: crawlerRouter,
	jobs: jobsRouter,
	mainPopups: mainPopupsRouter,
	moderation: moderationRouter,
	onboarding: onboardingRouter,
	organizations: organizationsRouter,
	promotions: promotionsRouter,
	regions: regionsRouter,
	reviews: reviewsRouter,
	siteSettings: siteSettingsRouter,
	support: supportRouter,
	teams: teamsRouter,
};
