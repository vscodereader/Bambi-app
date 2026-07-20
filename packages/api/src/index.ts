import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";
import { requireAdminProfile } from "./services/bambi-authz";

export const o = os.$context<Context>();

export const publicProcedure = o;

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
