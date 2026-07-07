import { env } from "@bambi-app/env/server";
import fastifyCors from "@fastify/cors";
import fp from "fastify-plugin";

// CORS는 모든 라우트에 적용돼야 하므로 fp로 캡슐화를 해제한다.
export const corsPlugin = fp(
	async (app) => {
		await app.register(fastifyCors, {
			origin: env.CORS_ORIGIN,
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
			credentials: true,
			maxAge: 86_400,
		});
	},
	{ name: "bambi-cors" }
);
