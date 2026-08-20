import { accountRecoveryRouter } from "./account-recovery";
import { adPeriodTiersRouter } from "./ad-period-tiers";
import { adProductsRouter } from "./ad-products";
import { analyticsRouter } from "./analytics";
import { attendanceRouter } from "./attendance";
import { bannedWordsRouter } from "./banned-words";
import { blocksRouter } from "./blocks";
import { boostOptionsRouter } from "./boost-options";
import { chatsRouter } from "./chats";
import { communityRouter } from "./community";
import { communityBoardsRouter } from "./community-boards";
import { contentHistoryRouter } from "./content-history";
import { crawledJobsRouter } from "./crawled-jobs";
import { crawlerRouter } from "./crawler";
import { jobsRouter } from "./jobs";
import { mainPopupsRouter } from "./main-popups";
import { memberGradesRouter } from "./member-grades";
import { moderationRouter } from "./moderation";
import { notificationsRouter } from "./notifications";
import { onboardingRouter } from "./onboarding";
import { organizationsRouter } from "./organizations";
import { pointSettingsRouter } from "./point-settings";
import { pointShopRouter } from "./point-shop";
import { promotionsRouter } from "./promotions";
import { regionsRouter } from "./regions";
import { reviewsRouter } from "./reviews";
import { siteSettingsRouter } from "./site-settings";
import { supportRouter } from "./support";
import { supportChatRouter } from "./support-chat";
import { teamsRouter } from "./teams";

// 라우터가 커지며 추론 타입이 tsc의 선언 직렬화 한도를 넘어(TS7056) appRouter와
// 같은 방식으로 명시 주석을 단다 — typeof 참조라 클라이언트 타입 추론은 그대로다.
export const bambiRouter: {
	accountRecovery: typeof accountRecoveryRouter;
	adPeriodTiers: typeof adPeriodTiersRouter;
	adProducts: typeof adProductsRouter;
	analytics: typeof analyticsRouter;
	attendance: typeof attendanceRouter;
	bannedWords: typeof bannedWordsRouter;
	blocks: typeof blocksRouter;
	boostOptions: typeof boostOptionsRouter;
	chats: typeof chatsRouter;
	community: typeof communityRouter;
	communityBoards: typeof communityBoardsRouter;
	contentHistory: typeof contentHistoryRouter;
	crawledJobs: typeof crawledJobsRouter;
	crawler: typeof crawlerRouter;
	jobs: typeof jobsRouter;
	mainPopups: typeof mainPopupsRouter;
	memberGrades: typeof memberGradesRouter;
	moderation: typeof moderationRouter;
	notifications: typeof notificationsRouter;
	onboarding: typeof onboardingRouter;
	organizations: typeof organizationsRouter;
	pointSettings: typeof pointSettingsRouter;
	pointShop: typeof pointShopRouter;
	promotions: typeof promotionsRouter;
	regions: typeof regionsRouter;
	reviews: typeof reviewsRouter;
	siteSettings: typeof siteSettingsRouter;
	support: typeof supportRouter;
	supportChat: typeof supportChatRouter;
	teams: typeof teamsRouter;
} = {
	accountRecovery: accountRecoveryRouter,
	adPeriodTiers: adPeriodTiersRouter,
	adProducts: adProductsRouter,
	analytics: analyticsRouter,
	attendance: attendanceRouter,
	bannedWords: bannedWordsRouter,
	blocks: blocksRouter,
	boostOptions: boostOptionsRouter,
	chats: chatsRouter,
	community: communityRouter,
	communityBoards: communityBoardsRouter,
	contentHistory: contentHistoryRouter,
	crawledJobs: crawledJobsRouter,
	crawler: crawlerRouter,
	jobs: jobsRouter,
	mainPopups: mainPopupsRouter,
	memberGrades: memberGradesRouter,
	moderation: moderationRouter,
	notifications: notificationsRouter,
	onboarding: onboardingRouter,
	organizations: organizationsRouter,
	pointSettings: pointSettingsRouter,
	pointShop: pointShopRouter,
	promotions: promotionsRouter,
	regions: regionsRouter,
	reviews: reviewsRouter,
	siteSettings: siteSettingsRouter,
	support: supportRouter,
	supportChat: supportChatRouter,
	teams: teamsRouter,
};
