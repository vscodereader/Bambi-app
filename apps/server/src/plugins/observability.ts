import { auth } from "@bambi-app/auth";
import { initLogger } from "evlog";
import {
	type BetterAuthInstance,
	createAuthMiddleware,
} from "evlog/better-auth";
import { evlog, useLogger } from "evlog/fastify";
import fp from "fastify-plugin";

// 전역 로깅·사용자 식별. 훅이 모든 라우트에 걸려야 하므로 fp로 캡슐화를 해제한다.
export const observabilityPlugin = fp(
	async (app) => {
		initLogger({
			env: { service: "bambi-app-server" },
		});

		await app.register(evlog);

		const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
			exclude: ["/api/auth/**"],
			maskEmail: true,
		});

		app.addHook("preHandler", async (request) => {
			await identifyUser(useLogger(), request.headers, request.url);
		});
	},
	{ name: "bambi-observability" }
);
