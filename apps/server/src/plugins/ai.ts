import { devToolsMiddleware } from "@ai-sdk/devtools";
import { google } from "@ai-sdk/google";
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
	app.post("/ai", async (request) => {
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
	done();
};
