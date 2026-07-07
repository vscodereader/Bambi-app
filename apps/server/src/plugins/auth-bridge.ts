import { auth } from "@bambi-app/auth";
import type { FastifyPluginCallback } from "fastify";

// better-auth 핸들러(Web Request/Response)를 Fastify 라우트로 브리지한다.
export const authBridgePlugin: FastifyPluginCallback = (app, _opts, done) => {
	app.route({
		method: ["GET", "POST"],
		url: "/api/auth/*",
		async handler(request, reply) {
			try {
				const url = new URL(request.url, `http://${request.headers.host}`);
				const headers = new Headers();
				for (const [key, value] of Object.entries(request.headers)) {
					if (value) {
						headers.append(key, value.toString());
					}
				}
				const req = new Request(url.toString(), {
					method: request.method,
					headers,
					body: request.body ? JSON.stringify(request.body) : undefined,
				});
				const response = await auth.handler(req);
				reply.status(response.status);
				for (const [key, value] of response.headers) {
					reply.header(key, value);
				}
				reply.send(response.body ? await response.text() : null);
			} catch (error) {
				app.log.error({ err: error }, "Authentication Error:");
				reply.status(500).send({
					error: "Internal authentication error",
					code: "AUTH_FAILURE",
				});
			}
		},
	});
	done();
};
