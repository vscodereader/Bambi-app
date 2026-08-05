import { randomUUID } from "node:crypto";

import { clientIpFromHeaders, createContext } from "@bambi-app/api/context";
import {
	BAMBI_SSE_HEARTBEAT_FRAME,
	configureBambiNotificationStream,
	registerBambiNotificationSubscriber,
	serializeBambiNotificationEvent,
	unregisterBambiNotificationSubscriber,
} from "@bambi-app/api/services/bambi-notification-stream";
import {
	resolveRealtimeConnectRateLimit,
	takeRateLimit,
} from "@bambi-app/api/services/rate-limit";
import { env } from "@bambi-app/env/server";
import type { FastifyPluginCallback } from "fastify";

// 프록시·로드밸런서의 유휴 연결 타임아웃(보통 60초)보다 짧게 잡아야 스트림이 끊기지 않는다.
const HEARTBEAT_INTERVAL_MS = 30_000;

// 하트비트 몇 번마다 세션을 다시 확인할지. 스트림은 한 번 열리면 몇 시간씩 유지되는데
// 연결 시점 검사만 하면 다른 기기에서 로그아웃·탈퇴하거나 계정이 정지돼도 그 탭으로는
// 알림이 계속 흘러간다. 매 하트비트마다 DB를 두드리지 않도록 간격을 둔다(5분).
const SESSION_RECHECK_EVERY_HEARTBEATS = 10;

// 재연결 간격 힌트. 고정값이면 인스턴스 교체·배포로 전원이 동시에 끊겼을 때 정확히 같은
// 시점에 되돌아온다 — 연결마다 흔들어 준다.
const RETRY_BASE_MS = 5000;
const RETRY_JITTER_MS = 10_000;

const buildRetryHint = (): number =>
	RETRY_BASE_MS + Math.floor(Math.random() * RETRY_JITTER_MS);

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
		// 스트림 하나가 인스턴스 동시 슬롯 하나를 잡고, 개시마다 세션 조회가 붙는다.
		// 세션을 보기 전에 IP 기준으로 "새로 여는 속도"부터 끊는다.
		const connectLimit = resolveRealtimeConnectRateLimit({
			clientIp: clientIpFromHeaders(request.headers),
			scope: "sse",
		});

		if (
			!takeRateLimit({
				key: connectLimit.key,
				limit: connectLimit.limit,
				now: Date.now(),
				windowMs: connectLimit.windowMs,
			})
		) {
			reply.status(429).send({
				code: "TOO_MANY_REQUESTS",
				error: "연결 요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.",
			});
			return;
		}

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
		let heartbeatCount = 0;
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

		// 세션이 무효화(로그아웃·탈퇴·정지)됐는데 스트림만 살아 있으면 권한이 지난 채널이
		// 된다. 주기적으로 같은 세션인지 다시 확인하고, 아니면 끊어 클라이언트가 재인증하게 한다.
		const recheckSession = async () => {
			try {
				const current = await createContext(request.headers);

				if (current.session?.user.id !== userId) {
					closeStream();
				}
			} catch (error) {
				app.log.error(
					{ err: error },
					"sse notification session recheck failed"
				);
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
		write(`: connected\n\nretry: ${buildRetryHint()}\n\n`);

		// 계정당 상한을 넘기면 레지스트리가 가장 오래된 스트림을 이 콜백으로 닫는다.
		const evicted = registerBambiNotificationSubscriber({
			close: closeStream,
			send: (event) => {
				write(serializeBambiNotificationEvent(event));
			},
			subscriberId,
			userId,
		});

		if (evicted > 0) {
			app.log.info({ evicted, userId }, "sse notification stream evicted");
		}

		openStreams.add(closeStream);

		heartbeatTimer = setInterval(() => {
			write(BAMBI_SSE_HEARTBEAT_FRAME);
			heartbeatCount += 1;

			if (heartbeatCount % SESSION_RECHECK_EVERY_HEARTBEATS === 0) {
				recheckSession().catch(() => undefined);
			}
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
