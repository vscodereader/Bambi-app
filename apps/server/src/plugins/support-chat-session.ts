import { resolveGuestTokenSecret } from "@bambi-app/api/services/bambi-guest-token";
import {
	createSupportChatToken,
	SUPPORT_CHAT_COOKIE_MAX_AGE,
	SUPPORT_CHAT_ISSUE_LIMIT,
	SUPPORT_CHAT_ISSUE_WINDOW_MS,
} from "@bambi-app/api/services/bambi-support-chat-token";
import {
	DEFAULT_TRUSTED_PROXY_HOPS,
	resolveClientIp,
} from "@bambi-app/api/services/client-ip";
import { takeRateLimit } from "@bambi-app/api/services/rate-limit";
import { env } from "@bambi-app/env/server";
import type { FastifyPluginCallback } from "fastify";

export const supportChatSessionPlugin: FastifyPluginCallback = (
	app,
	_opts,
	done
) => {
	app.post("/support-chat/session", async (request, reply) => {
		const forwarded = request.headers["x-forwarded-for"];
		const forwardedFor = Array.isArray(forwarded) ? forwarded[0] : forwarded;
		const clientIp = resolveClientIp({
			directIp: forwardedFor ? null : request.ip,
			forwardedFor,
			trustedProxyHops: DEFAULT_TRUSTED_PROXY_HOPS,
		});
		if (
			!takeRateLimit({
				key: `supportChat.issue:ip:${clientIp}`,
				limit: SUPPORT_CHAT_ISSUE_LIMIT,
				now: Date.now(),
				windowMs: SUPPORT_CHAT_ISSUE_WINDOW_MS,
			})
		) {
			return reply.code(429).send({ ok: false });
		}
		const token = await createSupportChatToken({
			maxAgeSeconds: SUPPORT_CHAT_COOKIE_MAX_AGE,
			now: new Date(),
			secret: resolveGuestTokenSecret(
				env.BAMBI_GUEST_TOKEN_SECRET,
				env.NODE_ENV
			),
		});
		return { ok: true, token };
	});
	done();
};
