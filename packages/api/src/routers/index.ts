import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { bambiRouter } from "./bambi";
import { todoRouter } from "./todo";

const healthCheck = publicProcedure.handler(() => "OK");
const privateData = protectedProcedure.handler(({ context }) => ({
	message: "This is private",
	user: context.session?.user,
}));

export const appRouter: {
	bambi: typeof bambiRouter;
	healthCheck: typeof healthCheck;
	privateData: typeof privateData;
	todo: typeof todoRouter;
} = {
	healthCheck,
	privateData,
	bambi: bambiRouter,
	todo: todoRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
