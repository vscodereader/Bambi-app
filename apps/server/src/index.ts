import Fastify from "fastify";

import { aiPlugin } from "./plugins/ai";
import { authBridgePlugin } from "./plugins/auth-bridge";
import { autoBoostPlugin } from "./plugins/auto-boost";
import { corsPlugin } from "./plugins/cors";
import { crawlPlugin } from "./plugins/crawl";
import { healthPlugin } from "./plugins/health";
import { observabilityPlugin } from "./plugins/observability";
import { orpcPlugin } from "./plugins/orpc";
import { realtimePlugin } from "./plugins/realtime";

const fastify = Fastify({
	logger: true,
});

fastify.register(observabilityPlugin);
fastify.register(corsPlugin);
fastify.register(realtimePlugin);
fastify.register(orpcPlugin);
fastify.register(authBridgePlugin);
fastify.register(aiPlugin);
fastify.register(healthPlugin);
fastify.register(autoBoostPlugin);
fastify.register(crawlPlugin);

fastify.listen({ port: 23_000, host: "0.0.0.0" }, (err) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	console.log("Server running on port 23000");
});
