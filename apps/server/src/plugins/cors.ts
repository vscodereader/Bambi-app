import { USER_ACTIVITY_HEADER } from "@bambi-app/api/services/bambi-user-presence";
import { env } from "@bambi-app/env/server";
import fastifyCors from "@fastify/cors";
import fp from "fastify-plugin";

// CORS는 모든 라우트에 적용돼야 하므로 fp로 캡슐화를 해제한다.
export const corsPlugin = fp(
	async (app) => {
		await app.register(fastifyCors, {
			origin: env.CORS_ORIGIN,
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			// x-bambi-guest·x-bambi-support-chat: 게스트/문의 쿠키는 host-only라 이 서버로
			// 오지 않아서, 브라우저 클라이언트가 값을 헤더로 옮겨 붙인다(web utils/orpc).
			// 허용 목록에 없으면 preflight에서 잘리는데, 단순히 그 신원만 빠지는 게 아니라
			// 브라우저가 **본요청 자체를 차단**해 모든 orpc 호출이 죽는다 — 새 신원 헤더를
			// 추가할 때는 반드시 여기도 함께 늘려야 한다.
			allowedHeaders: [
				"Content-Type",
				"Authorization",
				"X-Requested-With",
				"x-bambi-guest",
				"x-bambi-support-chat",
				USER_ACTIVITY_HEADER,
			],
			credentials: true,
			maxAge: 86_400,
		});
	},
	{ name: "bambi-cors" }
);
