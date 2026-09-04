import { randomUUID } from "node:crypto";
import { clientIpFromHeaders, createContext } from "@bambi-app/api/context";
import { requireAdminProfile } from "@bambi-app/api/services/bambi-authz";
import {
	parseUserPresenceEvent,
	USER_PRESENCE_CHANNEL,
	USER_PRESENCE_SSE_EVENT,
	USER_PRESENCE_SSE_HEARTBEAT_EVENT,
	USER_PRESENCE_SSE_PATH,
} from "@bambi-app/api/services/bambi-user-presence";
import {
	resolveRealtimeConnectRateLimit,
	takeRateLimit,
} from "@bambi-app/api/services/rate-limit";
import { env } from "@bambi-app/env/server";
import type { FastifyPluginCallback } from "fastify";
import { Client } from "pg";
import {
	REALTIME_HEARTBEAT_INTERVAL_MS,
	REALTIME_SESSION_RECHECK_EVERY_HEARTBEATS,
} from "./realtime-connection-policy";

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

export const presencePlugin: FastifyPluginCallback = (app, _opts, done) => {
	const subscribers = new Map<
		string,
		{ close: () => void; send: (payload: string) => void }
	>();
	let listener: Client | null = null;
	let reconnectTimer: null | ReturnType<typeof setTimeout> = null;
	let reconnectAttempt = 0;
	let closing = false;

	const scheduleReconnect = () => {
		if (closing || reconnectTimer) {
			return;
		}
		const delay = Math.min(RETRY_BASE_MS * 2 ** reconnectAttempt, RETRY_MAX_MS);
		reconnectAttempt += 1;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connectListener().catch((error) => {
				app.log.error({ err: error }, "presence LISTEN reconnect failed");
				scheduleReconnect();
			});
		}, delay);
	};

	async function connectListener(): Promise<void> {
		if (closing || listener) {
			return;
		}
		const client = new Client({ connectionString: env.DATABASE_URL });
		const isReconnect = reconnectAttempt > 0;
		client.on("notification", (message) => {
			if (message.channel !== USER_PRESENCE_CHANNEL || !message.payload) {
				return;
			}
			const event = parseUserPresenceEvent(message.payload);
			if (!event) {
				return;
			}
			const payload = JSON.stringify(event);
			for (const subscriber of subscribers.values()) {
				subscriber.send(payload);
			}
		});
		client.on("error", (error) => {
			app.log.error({ err: error }, "presence LISTEN connection failed");
			if (listener === client) {
				listener = null;
			}
			client.end().catch(() => undefined);
			scheduleReconnect();
		});
		client.on("end", () => {
			if (listener === client) {
				listener = null;
				scheduleReconnect();
			}
		});
		try {
			await client.connect();
			if (closing) {
				await client.end();
				return;
			}
			await client.query(`LISTEN ${USER_PRESENCE_CHANNEL}`);
			listener = client;
			reconnectAttempt = 0;
			if (isReconnect) {
				const payload = JSON.stringify({ type: "resync" });
				for (const subscriber of subscribers.values()) {
					subscriber.send(payload);
				}
			}
		} catch (error) {
			await client.end().catch(() => undefined);
			throw error;
		}
	}

	connectListener().catch((error) => {
		app.log.error({ err: error }, "presence LISTEN startup failed");
		scheduleReconnect();
	});

	app.get(USER_PRESENCE_SSE_PATH, async (request, reply) => {
		const connectLimit = resolveRealtimeConnectRateLimit({
			clientIp: clientIpFromHeaders(request.headers),
			scope: "presence",
		});
		if (
			!takeRateLimit({
				key: connectLimit.key,
				limit: connectLimit.limit,
				now: Date.now(),
				windowMs: connectLimit.windowMs,
			})
		) {
			reply.status(429).send({ error: "연결 요청이 너무 잦아요." });
			return;
		}

		const context = await createContext(request.headers);
		try {
			await requireAdminProfile(context.session);
		} catch {
			reply.status(403).send({ error: "운영자만 이용할 수 있습니다." });
			return;
		}

		const raw = reply.raw;
		const subscriberId = randomUUID();
		let heartbeatCount = 0;
		let closed = false;
		let heartbeatTimer: null | ReturnType<typeof setInterval> = null;

		const close = () => {
			if (closed) {
				return;
			}
			closed = true;
			if (heartbeatTimer) {
				clearInterval(heartbeatTimer);
			}
			subscribers.delete(subscriberId);
			raw.end();
		};
		const writeEvent = (event: string, data: string) => {
			if (closed || raw.writableEnded) {
				return;
			}
			try {
				raw.write(`event: ${event}\ndata: ${data}\n\n`);
			} catch (error) {
				app.log.error({ err: error }, "presence SSE write failed");
				close();
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
			"X-Accel-Buffering": "no",
		});
		writeEvent(USER_PRESENCE_SSE_HEARTBEAT_EVENT, "{}");
		subscribers.set(subscriberId, {
			close,
			send: (payload) => writeEvent(USER_PRESENCE_SSE_EVENT, payload),
		});

		heartbeatTimer = setInterval(() => {
			writeEvent(USER_PRESENCE_SSE_HEARTBEAT_EVENT, "{}");
			heartbeatCount += 1;
			if (heartbeatCount % REALTIME_SESSION_RECHECK_EVERY_HEARTBEATS === 0) {
				createContext(request.headers)
					.then((current) => requireAdminProfile(current.session))
					.catch(close);
			}
		}, REALTIME_HEARTBEAT_INTERVAL_MS);
		request.raw.on("close", close);
		raw.on("close", close);
		raw.on("error", close);
	});

	app.addHook("onClose", async () => {
		closing = true;
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
		}
		for (const subscriber of Array.from(subscribers.values())) {
			subscriber.close();
		}
		const current = listener;
		listener = null;
		if (current) {
			await current.end().catch(() => undefined);
		}
	});
	done();
};
