import { createDb } from "@bambi-app/db";
import {
	account,
	accountRelations,
	invitation,
	invitationRelations,
	member,
	memberRelations,
	organizationRelations,
	organization as organizationTable,
	session,
	sessionRelations,
	team,
	teamMember,
	teamMemberRelations,
	teamRelations,
	user,
	userRelations,
	verification,
} from "@bambi-app/db/schema/auth";
import { env } from "@bambi-app/env/server";
import { expo } from "@better-auth/expo";
import { i18n } from "@better-auth/i18n";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { koTranslations } from "./locales/ko";

const schema = {
	account,
	accountRelations,
	invitation,
	invitationRelations,
	member,
	memberRelations,
	organization: organizationTable,
	organizationRelations,
	session,
	sessionRelations,
	team,
	teamMember,
	teamMemberRelations,
	teamRelations,
	user,
	userRelations,
	verification,
};

export function createAuth() {
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",

			schema,
		}),
		trustedOrigins: [
			env.CORS_ORIGIN,
			"bambi-app://",
			"exp://",
			"http://localhost:8081",
		],
		emailAndPassword: {
			enabled: true,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			// 서버(api.bambialba.com / test.bambialba.com)와 웹(bambialba.com 서브도메인)이
			// 같은 세션 쿠키를 보도록 apex로 스코프. domain 미지정 시 baseURL 호스트네임
			// (api.…)으로 잡혀 웹과 공유되지 않으므로 반드시 명시한다. 로컬(dev)은 비활성.
			crossSubDomainCookies: {
				enabled: env.NODE_ENV === "production",
				domain: ".bambialba.com",
			},
			defaultCookieAttributes: {
				// 웹↔서버가 같은 사이트(bambialba.com)라 lax로 충분 — none(3rd-party 전제)은
				// Safari 차단 + CSRF 노출이라 쓰지 않는다.
				sameSite: "lax",
				secure: true,
				httpOnly: true,
			},
		},
		plugins: [
			expo(),
			organization({
				teams: {
					enabled: true,
					allowRemovingAllTeams: false,
				},
			}),
			// 한국 대상 서비스라 브라우저 언어와 무관하게 항상 한국어 에러를 낸다:
			// 감지된 locale은 translations에 등록된 것 중에서만 채택되고 없으면
			// defaultLocale로 폴백하므로, ko만 등록하면 모든 요청이 ko가 된다.
			// 사전에 없는 코드는 영어 원문 유지(번역돼도 원문은 originalMessage에 보존).
			i18n({
				translations: { ko: koTranslations },
				defaultLocale: "ko",
			}),
		],
	});
}

export const auth = createAuth();
