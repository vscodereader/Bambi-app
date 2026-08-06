import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";
import { requireAdminProfile } from "./services/bambi-authz";
import { resolvePublicRateLimit, takeRateLimit } from "./services/rate-limit";

export const o = os.$context<Context>();

export const publicProcedure = o;

// 로그인 없이 부를 수 있으면서 비용·피해가 큰 프로시저용(본인인증 발급·계정 복구).
// 한도·윈도·버킷 키 규칙은 web의 게스트 라우트(/api/guest)와 공유한다
// (services/rate-limit의 resolvePublicRateLimit) — 두 곳이 어긋나면 한 흐름 안에서
// 한쪽만 먼저 막힌다.
const rateLimitByIp = o.middleware(({ context, next, path }) => {
	const { key, limit, windowMs } = resolvePublicRateLimit({
		clientIp: context.clientIp,
		scope: path.join("."),
	});
	if (!takeRateLimit({ key, limit, now: Date.now(), windowMs })) {
		throw new ORPCError("TOO_MANY_REQUESTS", {
			message:
				"요청이 너무 많아요. 잠시 기다렸다가 다시 시도해 주세요. 계속 막히면 1시간 뒤에 다시 이용할 수 있어요.",
		});
	}
	return next();
});

export const rateLimitedPublicProcedure = publicProcedure.use(rateLimitByIp);

const requireAuth = o.middleware(({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({
		context: {
			session: context.session,
		},
	});
});

export const protectedProcedure = publicProcedure.use(requireAuth);

// 운영자 전용 게이트. 기존 프로시저는 핸들러 첫 줄에서 requireAdminProfile을 직접 부르지만,
// 그 방식은 한 줄만 빠뜨려도 그대로 뚫린다. 신규 admin 프로시저는 이 미들웨어를 쓴다.
const requireAdmin = o.middleware(async ({ context, next }) => {
	await requireAdminProfile(context.session);
	return next();
});

export const adminProcedure = protectedProcedure.use(requireAdmin);
