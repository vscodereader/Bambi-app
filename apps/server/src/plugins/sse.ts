import { randomUUID } from "node:crypto";

import { createContext } from "@bambi-app/api/context";
import {
	BAMBI_SSE_HEARTBEAT_FRAME,
	configureBambiNotificationStream,
	registerBambiNotificationSubscriber,
	serializeBambiNotificationEvent,
	unregisterBambiNotificationSubscriber,
} from "@bambi-app/api/services/bambi-notification-stream";
import { env } from "@bambi-app/env/server";
import type { FastifyPluginCallback } from "fastify";

// 프록시·로드밸런서의 유휴 연결 타임아웃(보통 60초)보다 짧게 잡아야 스트림이 끊기지 않는다.
const HEARTBEAT_INTERVAL_MS = 30_000;

// 알림 SSE 스트림. 채팅 실시간(socket.io)과 달리 "알림이 생겼다"만 밀어 주는 단방향
// 채널이라, 방에 들어와 있지 않은 사용자도 새 메시지를 즉시 알 수 있다.
// 응답을 직접 쓰기 때문에(reply.hijack) CORS 헤더도 여기서 직접 붙인다 — @fastify/cors가
// reply.header()로 쌓아 둔 헤더는 hijack한 raw 응답에는 실리지 않는다.
export const ssePlugin: FastifyPluginCallback = (app, _opts, done) => {
	const openStreams = new Set<() => void>();

	configureBambiNotificationStream({
		error(error, message) {
			app.log.error({ err: error }, message);
		},
	});

	app.get("/sse/notifications", async (request, reply) => {
		const context = await createContext(request.headers);
		const userId = context.session?.user.id;

		if (!userId) {
			reply.status(401).send({
				code: "UNAUTHORIZED",
				error: "로그인 후 다시 시도해 주세요.",
			});
			return;
		}

		const raw = reply.raw;
		const subscriberId = randomUUID();
		let heartbeatTimer: null | ReturnType<typeof setInterval> = null;
		let closed = false;

		const closeStream = () => {
			if (closed) {
				return;
			}
			closed = true;

			if (heartbeatTimer) {
				clearInterval(heartbeatTimer);
				heartbeatTimer = null;
			}

			openStreams.delete(closeStream);
			unregisterBambiNotificationSubscriber({ subscriberId, userId });
			raw.end();
		};

		const write = (frame: string) => {
			if (closed || raw.writableEnded) {
				return;
			}

			try {
				raw.write(frame);
			} catch (error) {
				app.log.error({ err: error }, "sse notification write failed");
				closeStream();
			}
		};

		reply.hijack();
		raw.writeHead(200, {
			"Access-Control-Allow-Credentials": "true",
			"Access-Control-Allow-Origin": env.CORS_ORIGIN,
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"Content-Type": "text/event-stream; charset=utf-8",
			Vary: "Origin",
			// nginx 계열 프록시가 스트림을 버퍼링해 이벤트를 묶어 두지 않게 한다.
			"X-Accel-Buffering": "no",
		});
		// 첫 프레임을 바로 흘려 헤더가 클라이언트까지 도달하게 하고, 재연결 간격도 넉넉히 준다.
		write(": connected\n\nretry: 5000\n\n");

		registerBambiNotificationSubscriber({
			send: (event) => {
				write(serializeBambiNotificationEvent(event));
			},
			subscriberId,
			userId,
		});
		openStreams.add(closeStream);

		heartbeatTimer = setInterval(() => {
			write(BAMBI_SSE_HEARTBEAT_FRAME);
		}, HEARTBEAT_INTERVAL_MS);

		request.raw.on("close", closeStream);
		raw.on("close", closeStream);
		raw.on("error", closeStream);

		// 리스너를 달기 전에 이미 끊긴 연결은 'close'를 다시 내보내지 않는다.
		// 구독자가 영원히 남지 않도록 여기서 한 번 더 확인한다.
		if (request.raw.destroyed || raw.writableEnded) {
			closeStream();
		}
	});

	app.addHook("onClose", (_instance, hookDone) => {
		for (const closeStream of Array.from(openStreams)) {
			closeStream();
		}
		configureBambiNotificationStream(null);
		hookDone();
	});

	done();
};
