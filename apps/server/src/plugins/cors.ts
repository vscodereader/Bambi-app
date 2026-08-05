import { env } from "@bambi-app/env/server";
import fastifyCors from "@fastify/cors";
import fp from "fastify-plugin";

// CORS는 모든 라우트에 적용돼야 하므로 fp로 캡슐화를 해제한다.
export const corsPlugin = fp(
	async (app) => {
		await app.register(fastifyCors, {
			origin: env.CORS_ORIGIN,
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			// x-bambi-guest: 게스트 인증 쿠키는 host-only라 이 서버로 오지 않아서, 브라우저
			// 클라이언트가 값을 헤더로 옮겨 붙인다(web utils/orpc). 허용 목록에 없으면
			// preflight에서 잘려 비회원 신원이 서버까지 오지 못한다.
			allowedHeaders: [
				"Content-Type",
				"Authorization",
				"X-Requested-With",
				"x-bambi-guest",
			],
			credentials: true,
			maxAge: 86_400,
		});
	},
	{ name: "bambi-cors" }
);
