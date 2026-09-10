import { createContext } from "@bambi-app/api/context";
import { appRouter } from "@bambi-app/api/routers/index";
import { OpenAPIHandler } from "@orpc/openapi/fastify";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fastify";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { FastifyPluginCallback } from "fastify";

const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

// 팝업 이미지는 원본과 편집본을 각각 Base64로 저장한다. 파일당 10MB 두 벌과
// Base64·RPC JSON 오버헤드를 수용하되 다른 Fastify 경로의 기본 한도는 유지한다.
export const RPC_BODY_LIMIT_BYTES = 40 * 1024 * 1024;

// fp로 감싸지 않는다: "*" content-type 파서 오버라이드를 이 스코프에 가둬
// 다른 라우트(/api/auth, /ai)의 기본 JSON 파싱을 보존한다.
export const orpcPlugin: FastifyPluginCallback = (app, _opts, done) => {
	// Fully utilize oRPC features by letting oRPC parse the request body.
	app.addContentTypeParser("*", (_, _payload, done) => {
		done(null, undefined);
	});

	app.all(
		"/rpc/*",
		{ bodyLimit: RPC_BODY_LIMIT_BYTES },
		async (request, reply) => {
			const { matched } = await rpcHandler.handle(request, reply, {
				context: await createContext(request.headers),
				prefix: "/rpc",
			});

			if (!matched) {
				reply.status(404).send();
			}
		}
	);

	app.all("/api-reference/*", async (request, reply) => {
		const { matched } = await apiHandler.handle(request, reply, {
			context: await createContext(request.headers),
			prefix: "/api-reference",
		});

		if (!matched) {
			reply.status(404).send();
		}
	});

	done();
};
