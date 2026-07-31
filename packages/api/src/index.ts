import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";
import { requireAdminProfile } from "./services/bambi-authz";
import { takeRateLimit } from "./services/rate-limit";

export const o = os.$context<Context>();

export const publicProcedure = o;

// 로그인 없이 부를 수 있으면서 비용·피해가 큰 프로시저용(본인인증 발급·계정 복구).
// 한도는 게스트 라우트(/api/guest)와 같은 IP당 시간당 10회 — 정상 사용자는 1~3회면 끝난다.
const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// 버킷 키에 프로시저 경로를 넣어 프로시저마다 따로 센다. 한 흐름이 여러 프로시저를
// 순서대로 부르므로(발급 → 아이디 찾기 → 재설정) 한 버킷을 공유하면 정상 사용자가 먼저 막힌다.
const rateLimitByIp = o.middleware(({ context, next, path }) => {
	if (
		!takeRateLimit({
			key: `${path.join(".")}:${context.clientIp}`,
			limit: RATE_LIMIT,
			now: Date.now(),
			windowMs: RATE_LIMIT_WINDOW_MS,
		})
	) {
		throw new ORPCError("TOO_MANY_REQUESTS", {
			message: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
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
