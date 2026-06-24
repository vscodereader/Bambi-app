import { chatsRouter } from "./chats";
import { jobsRouter } from "./jobs";
import { moderationRouter } from "./moderation";
import { onboardingRouter } from "./onboarding";
import { promotionsRouter } from "./promotions";

export const bambiRouter = {
	chats: chatsRouter,
	jobs: jobsRouter,
	moderation: moderationRouter,
	onboarding: onboardingRouter,
	promotions: promotionsRouter,
};
