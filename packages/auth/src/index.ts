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
import { APIError } from "better-auth/api";
import { organization, username } from "better-auth/plugins";
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
			// dev/prod가 같은 apex(.bambialba.com)로 쿠키를 스코프하므로, 쿠키 이름 prefix를
			// 환경별로 분리해 충돌을 막는다(prod=bambi, dev=bambi-dev). undefined(로컬)면
			// better-auth 기본 prefix라 개발 동작 무변경. 웹 미들웨어(proxy)도 같은 값으로
			// getSessionCookie를 읽어 일치시킨다.
			cookiePrefix: env.BAMBI_COOKIE_PREFIX,
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
		// 로그인은 어떤 방식이든 세션 생성을 지나므로 여기서 탈퇴 계정을 차단한다.
		// 탈퇴 시 기존 세션은 전부 삭제되지만, 보존기간 동안 이메일·비밀번호가 남아
		// 있어 재로그인을 막는 최종 관문이 필요하다.
		databaseHooks: {
			session: {
				create: {
					before: async (sessionData) => {
						const target = await db.query.user.findFirst({
							columns: { deletedAt: true },
							where: (fields, operators) =>
								operators.eq(fields.id, sessionData.userId),
						});
						if (target?.deletedAt) {
							throw new APIError("FORBIDDEN", {
								message: "탈퇴한 계정이에요. 로그인할 수 없어요.",
							});
						}
						return { data: sessionData };
					},
				},
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
			// 로그인 아이디(username) 지원. 스키마상 username은 required:false라 회원가입 시
			// 선택 — username 없이 호출하는 기존 경로(개발 시드 signUpEmail, auth 테스트)는
			// 그대로 동작한다. 기본 검증(min 3·max 30·영숫자+언더스코어, 소문자 정규화 후
			// 저장)이 한국 서비스에 무리 없어 옵션 오버라이드 없이 기본값 사용.
			// user 모델의 username/displayUsername 컬럼은 schema(위 drizzleAdapter)로 인식.
			username(),
		],
	});
}

export const auth = createAuth();
