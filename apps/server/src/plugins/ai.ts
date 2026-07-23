import { devToolsMiddleware } from "@ai-sdk/devtools";
import { google } from "@ai-sdk/google";
import { createContext } from "@bambi-app/api/context";
import {
	convertToModelMessages,
	streamText,
	type UIMessage,
	wrapLanguageModel,
} from "ai";
import { createAILogger, createEvlogIntegration } from "evlog/ai";
import { useLogger } from "evlog/fastify";
import type { FastifyPluginCallback } from "fastify";

interface AiRequestBody {
	id?: string;
	messages: UIMessage[];
}

export const aiPlugin: FastifyPluginCallback = (app, _opts, done) => {
	app.post("/ai", async (request, reply) => {
		// useLogger는 fastify 요청 로거 헬퍼다(React 훅 아님). 조기 반환 앞에서 무조건
		// 호출해 rules-of-hooks 린트 오탐을 피한다.
		const logger = useLogger();

		// 무인증 공개 라우트였다. better-auth 세션이 없으면 401로 막는다(오용·비용 유발
		// 방지). createContext가 orpc와 동일하게 세션을 검증한다.
		const { session } = await createContext(request.headers);
		if (!session) {
			return reply.status(401).send({ error: "로그인이 필요해요." });
		}

		const { messages } = request.body as AiRequestBody;
		const ai = createAILogger(logger);
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
	done();
};
