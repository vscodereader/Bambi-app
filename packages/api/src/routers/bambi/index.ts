import { accountRecoveryRouter } from "./account-recovery";
import { adProductsRouter } from "./ad-products";
import { analyticsRouter } from "./analytics";
import { attendanceRouter } from "./attendance";
import { bannedWordsRouter } from "./banned-words";
import { blocksRouter } from "./blocks";
import { boostOptionsRouter } from "./boost-options";
import { chatsRouter } from "./chats";
import { communityRouter } from "./community";
import { communityBoardsRouter } from "./community-boards";
import { crawledJobsRouter } from "./crawled-jobs";
import { crawlerRouter } from "./crawler";
import { jobsRouter } from "./jobs";
import { mainPopupsRouter } from "./main-popups";
import { moderationRouter } from "./moderation";
import { notificationsRouter } from "./notifications";
import { onboardingRouter } from "./onboarding";
import { organizationsRouter } from "./organizations";
import { promotionsRouter } from "./promotions";
import { regionsRouter } from "./regions";
import { reviewsRouter } from "./reviews";
import { siteSettingsRouter } from "./site-settings";
import { supportRouter } from "./support";
import { teamsRouter } from "./teams";

// 라우터가 커지며 추론 타입이 tsc의 선언 직렬화 한도를 넘어(TS7056) appRouter와
// 같은 방식으로 명시 주석을 단다 — typeof 참조라 클라이언트 타입 추론은 그대로다.
export const bambiRouter: {
	accountRecovery: typeof accountRecoveryRouter;
	adProducts: typeof adProductsRouter;
	analytics: typeof analyticsRouter;
	attendance: typeof attendanceRouter;
	bannedWords: typeof bannedWordsRouter;
	blocks: typeof blocksRouter;
	boostOptions: typeof boostOptionsRouter;
	chats: typeof chatsRouter;
	community: typeof communityRouter;
	communityBoards: typeof communityBoardsRouter;
	crawledJobs: typeof crawledJobsRouter;
	crawler: typeof crawlerRouter;
	jobs: typeof jobsRouter;
	mainPopups: typeof mainPopupsRouter;
	moderation: typeof moderationRouter;
	notifications: typeof notificationsRouter;
	onboarding: typeof onboardingRouter;
	organizations: typeof organizationsRouter;
	promotions: typeof promotionsRouter;
	regions: typeof regionsRouter;
	reviews: typeof reviewsRouter;
	siteSettings: typeof siteSettingsRouter;
	support: typeof supportRouter;
	teams: typeof teamsRouter;
} = {
	accountRecovery: accountRecoveryRouter,
	adProducts: adProductsRouter,
	analytics: analyticsRouter,
	attendance: attendanceRouter,
	bannedWords: bannedWordsRouter,
	blocks: blocksRouter,
	boostOptions: boostOptionsRouter,
	chats: chatsRouter,
	community: communityRouter,
	communityBoards: communityBoardsRouter,
	crawledJobs: crawledJobsRouter,
	crawler: crawlerRouter,
	jobs: jobsRouter,
	mainPopups: mainPopupsRouter,
	moderation: moderationRouter,
	notifications: notificationsRouter,
	onboarding: onboardingRouter,
	organizations: organizationsRouter,
	promotions: promotionsRouter,
	regions: regionsRouter,
	reviews: reviewsRouter,
	siteSettings: siteSettingsRouter,
	support: supportRouter,
	teams: teamsRouter,
};
