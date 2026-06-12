import { devToolsMiddleware } from "@ai-sdk/devtools";
import { google } from "@ai-sdk/google";
import { createContext } from "@bambi-app/api/context";
import { appRouter } from "@bambi-app/api/routers/index";
import { auth } from "@bambi-app/auth";
import { env } from "@bambi-app/env/server";
import fastifyCors from "@fastify/cors";
import { OpenAPIHandler } from "@orpc/openapi/fastify";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fastify";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import {
	convertToModelMessages,
	streamText,
	type UIMessage,
	wrapLanguageModel,
} from "ai";
import { initLogger } from "evlog";
import { createAILogger, createEvlogIntegration } from "evlog/ai";
import {
	type BetterAuthInstance,
	createAuthMiddleware,
} from "evlog/better-auth";
import { evlog, useLogger } from "evlog/fastify";
import Fastify from "fastify";

const baseCorsConfig = {
	origin: env.CORS_ORIGIN,
	methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
	credentials: true,
	maxAge: 86_400,
};

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

initLogger({
	env: { service: "bambi-app-server" },
});

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
	exclude: ["/api/auth/**"],
	maskEmail: true,
});

const fastify = Fastify({
	logger: true,
});

fastify.register(evlog);
fastify.addHook("preHandler", async (request) => {
	await identifyUser(useLogger(), request.headers, request.url);
});
fastify.register(fastifyCors, baseCorsConfig);

fastify.register(async (rpcApp) => {
	// Fully utilize oRPC features by letting oRPC parse the request body.
	rpcApp.addContentTypeParser("*", (_, _payload, done) => {
		done(null, undefined);
	});

	rpcApp.all("/rpc/*", async (request, reply) => {
		const { matched } = await rpcHandler.handle(request, reply, {
			context: await createContext(request.headers),
			prefix: "/rpc",
		});

		if (!matched) {
			reply.status(404).send();
		}
	});

	rpcApp.all("/api-reference/*", async (request, reply) => {
		const { matched } = await apiHandler.handle(request, reply, {
			context: await createContext(request.headers),
			prefix: "/api-reference",
		});

		if (!matched) {
			reply.status(404).send();
		}
	});
});

fastify.route({
	method: ["GET", "POST"],
	url: "/api/auth/*",
	async handler(request, reply) {
		try {
			const url = new URL(request.url, `http://${request.headers.host}`);
			const headers = new Headers();
			Object.entries(request.headers).forEach(([key, value]) => {
				if (value) {
					headers.append(key, value.toString());
				}
			});
			const req = new Request(url.toString(), {
				method: request.method,
				headers,
				body: request.body ? JSON.stringify(request.body) : undefined,
			});
			const response = await auth.handler(req);
			reply.status(response.status);
			response.headers.forEach((value, key) => reply.header(key, value));
			reply.send(response.body ? await response.text() : null);
		} catch (error) {
			fastify.log.error({ err: error }, "Authentication Error:");
			reply.status(500).send({
				error: "Internal authentication error",
				code: "AUTH_FAILURE",
			});
		}
	},
});

interface AiRequestBody {
	id?: string;
	messages: UIMessage[];
}

fastify.post("/ai", async (request) => {
	const { messages } = request.body as AiRequestBody;
	const ai = createAILogger(useLogger());
	const model = wrapLanguageModel({
		model: google("gemini-2.5-flash"),
		middleware: devToolsMiddleware(),
	});
	const result = streamText({
		model: ai.wrap(model),
		messages: await convertToModelMessages(messages),
		experimental_telemetry: {
			isEnabled: true,
			integrations: [createEvlogIntegration(ai)],
		},
	});

	return result.toUIMessageStreamResponse();
});

fastify.get("/", async () => "OK");

fastify.listen({ port: 3000 }, (err) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	console.log("Server running on port 3000");
});
