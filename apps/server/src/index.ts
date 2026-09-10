import Fastify from "fastify";

import { aiPlugin } from "./plugins/ai";
import { authBridgePlugin } from "./plugins/auth-bridge";
import { autoBoostPlugin } from "./plugins/auto-boost";
import { chatSyncQueuePlugin } from "./plugins/chat-sync-queue";
import { corsPlugin } from "./plugins/cors";
import { crawlPlugin } from "./plugins/crawl";
import { healthPlugin } from "./plugins/health";
import { listingPromotionPlugin } from "./plugins/listing-promotion";
import { observabilityPlugin } from "./plugins/observability";
import { orpcPlugin } from "./plugins/orpc";
import { pointShopExpiryPlugin } from "./plugins/point-shop-expiry";
import { presencePlugin } from "./plugins/presence";
import { realtimePlugin } from "./plugins/realtime";
import { ssePlugin } from "./plugins/sse";
import { withdrawalPurgePlugin } from "./plugins/withdrawal-purge";

const fastify = Fastify({
	logger: true,
});
fastify.register(observabilityPlugin);
fastify.register(corsPlugin);
fastify.register(realtimePlugin);
fastify.register(ssePlugin);
fastify.register(presencePlugin);
fastify.register(orpcPlugin);
fastify.register(authBridgePlugin);
fastify.register(aiPlugin);
fastify.register(healthPlugin);
fastify.register(autoBoostPlugin);
fastify.register(listingPromotionPlugin);
fastify.register(crawlPlugin);
fastify.register(withdrawalPurgePlugin);
fastify.register(pointShopExpiryPlugin);
// 소켓 전송을 쓰므로 realtimePlugin이 붙은 뒤에 등록한다(부팅 직후 잔여 행 drain).
fastify.register(chatSyncQueuePlugin);

// Cloud Run은 인스턴스를 회수할 때 SIGTERM을 보내고 잠깐 유예를 준다. 핸들러가 없으면
// 프로세스가 즉시 죽어 preClose(소켓 정리)·onClose(SSE 스트림 종료) 훅이 한 번도 돌지 않고,
// 진행 중인 요청도 그대로 끊긴다. 컨테이너는 node를 PID 1로 띄우므로 명시 핸들러가 필요하다.
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

const closeGracefully = (signal: (typeof SHUTDOWN_SIGNALS)[number]) => {
	fastify.log.info({ signal }, "shutting down");
	fastify
		.close()
		.then(() => process.exit(0))
		.catch((error) => {
			fastify.log.error(error);
			process.exit(1);
		});
};

for (const signal of SHUTDOWN_SIGNALS) {
	process.once(signal, () => closeGracefully(signal));
}

fastify.listen({ port: 23_000, host: "0.0.0.0" }, (err) => {
	if (err) {
		fastify.log.error(err);
		process.exit(1);
	}
	console.log("Server running on port 23000");
});
