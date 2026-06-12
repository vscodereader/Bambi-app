import { chatsRouter } from "./chats";
import { jobsRouter } from "./jobs";
import { moderationRouter } from "./moderation";

export const bambiRouter = {
	chats: chatsRouter,
	jobs: jobsRouter,
	moderation: moderationRouter,
};
