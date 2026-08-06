import { drainPendingChatMessageSyncs } from "@bambi-app/api/services/bambi-chat-sync-queue";
import type { FastifyPluginCallback } from "fastify";

// 채팅 메시지 전파 큐(transactional outbox)의 안전망. 정상 경로는 전송 요청이 커밋 직후
// 직접 비우는 것이라 이 스윕이 할 일은 보통 없다. 여기서 챙기는 건 두 경우다.
// (1) 커밋은 됐는데 전파 도중 프로세스가 죽어 남은 행 → 부팅 직후 한 번 훑는다.
// (2) 소켓·알림 쪽 일시 장애로 실패한 행 → 저빈도로 재시도한다(3회까지, 이후엔 로그만).
// 간격을 짧게 잡을 이유가 없다 — 짧게 잡아야 할 정도로 큐가 밀린다면 그건 재시도가 아니라
// 인프로세스 컨슈머 자체를 갈아야 한다는 신호다.
const SWEEP_INTERVAL_MS = 60 * 1000;

export const chatSyncQueuePlugin: FastifyPluginCallback = (
	app,
	_opts,
	done
) => {
	// drain 자체가 호출을 직렬화하므로(bambi-chat-sync-queue) 여기서 재진입 가드를
	// 따로 두지 않는다. 겹쳐 불려도 앞선 회차 뒤에 붙어 한 번 더 훑을 뿐이다.
	const sweep = () => {
		drainPendingChatMessageSyncs().catch((error) => {
			app.log.error(error, "chat message sync drain failed");
		});
	};

	sweep();

	const timer = setInterval(sweep, SWEEP_INTERVAL_MS);

	app.addHook("onClose", (_instance, hookDone) => {
		clearInterval(timer);
		hookDone();
	});

	done();
};
