import { chatsRouter } from "./chats";
import { jobsRouter } from "./jobs";
import { moderationRouter } from "./moderation";
import { onboardingRouter } from "./onboarding";

export const bambiRouter = {
	chats: chatsRouter,
	jobs: jobsRouter,
	moderation: moderationRouter,
	onboarding: onboardingRouter,
};
