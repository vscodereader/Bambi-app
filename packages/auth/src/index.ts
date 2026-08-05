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
import { APIError, createAuthMiddleware } from "better-auth/api";
import { organization, username } from "better-auth/plugins";
import { koTranslations } from "./locales/ko";
import {
	getLoginIdErrorMessage,
	isValidLoginId,
	LOGIN_ID_MAX_LENGTH,
	LOGIN_ID_MIN_LENGTH,
	LOGIN_ID_TAKEN_MESSAGE,
	normalizeLoginId,
} from "./login-id";
import { getReservedDisplayNameErrorMessage } from "./reserved-display-name";

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

// 로그인 아이디 검증을 username 플러그인보다 "먼저" 돌려 한국어로 답하는 훅.
//
// 플러그인은 회원가입(/sign-up/email)·정보수정(/update-user)의 아이디 검증을 before 훅에서
// 하는데, before 훅에서 던진 에러는 after 훅을 타지 않는다(better-auth to-auth-endpoints:
// runBeforeHooks의 throw가 runAfterHooks 앞에서 빠져나간다). 에러 한국어화를 담당하는 i18n
// 플러그인이 바로 그 after 훅이라, 이 두 경로만 영어 원문("Username is invalid")이 그대로
// 노출된다. 최상위 옵션 hooks.before는 플러그인 훅보다 앞에 등록되므로(getHooks), 같은
// 규칙을 여기서 먼저 검사해 한국어 메시지로 돌려준다 — 여기를 통과한 값은 플러그인 검증도
// 반드시 통과하므로(같은 규칙·같은 길이 제한) 영어 문구에 닿을 일이 없다.
const loginIdGuard = createAuthMiddleware(async (ctx) => {
	if (ctx.path !== "/sign-up/email" && ctx.path !== "/update-user") {
		return;
	}
	const body: unknown = ctx.body;
	const rawLoginId =
		typeof body === "object" && body !== null && "username" in body
			? (body as { username: unknown }).username
			: undefined;
	// 아이디 없이 부르는 경로(개발 시드 signUpEmail, auth 테스트)는 그대로 통과시킨다.
	if (typeof rawLoginId !== "string") {
		return;
	}
	const message = getLoginIdErrorMessage(rawLoginId);
	if (message) {
		throw new APIError("BAD_REQUEST", { message });
	}
	// 중복 아이디도 플러그인 before 훅이 던지는 영어 문구라 같은 이유로 여기서 먼저 본다.
	// 회원가입만 본다 — /update-user는 "내 아이디"인지 세션과 대조해야 하고, 웹·앱 어디에도
	// 아이디를 바꾸는 화면이 없어 실제로 도달하지 않는다(도달하면 플러그인이 막는다).
	if (ctx.path !== "/sign-up/email") {
		return;
	}
	const existing = await ctx.context.adapter.findOne<{ id: string }>({
		model: "user",
		where: [{ field: "username", value: normalizeLoginId(rawLoginId) }],
	});
	if (existing) {
		throw new APIError("BAD_REQUEST", { message: LOGIN_ID_TAKEN_MESSAGE });
	}
});

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
		// 플러그인 훅보다 먼저 도는 최상위 훅. 지금은 로그인 아이디 검증만 담당한다.
		hooks: {
			before: loginIdGuard,
		},
		// 로그인은 어떤 방식이든 세션 생성을 지나므로 여기서 탈퇴 계정을 차단한다.
		// 탈퇴 시 기존 세션은 전부 삭제되지만, 보존기간 동안 이메일·비밀번호가 남아
		// 있어 재로그인을 막는 최종 관문이 필요하다.
		databaseHooks: {
			user: {
				create: {
					before: async (userData) => {
						const entries = await db.query.bannedWord.findMany({
							columns: { normalizedTerm: true, term: true },
							where: (fields, operators) =>
								operators.and(
									operators.eq(fields.scope, "display_name"),
									operators.eq(fields.isActive, true)
								),
						});
						const message = getReservedDisplayNameErrorMessage(
							userData.name,
							entries
						);
						if (message) {
							throw new APIError("BAD_REQUEST", { message });
						}
						return { data: userData };
					},
				},
			},
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
			// 그대로 동작한다.
			// 검증은 기본값(영숫자+언더스코어+마침표) 대신 login-id.ts의 공용 규칙으로
			// 바꾼다 — 기본 규칙은 하이픈을 거부해 "bambi-alba" 같은 아이디를 못 만든다.
			// 길이(3~30)는 기본값과 같지만, 공용 상수와 어긋나지 않도록 함께 넘긴다.
			// 논리 필드 username/displayUsername를 각각 user.login_id / user.login_id_display
			// 컬럼에 매핑한다(drizzle adapter는 이 fieldName으로 schemaModel[fieldName] 컬럼을
			// 찾으므로 drizzle property 이름도 login_id/login_id_display여야 한다 — schema/auth.ts).
			// displayUsernameNormalization을 소문자로 걸어 login_id_display가 항상 login_id와
			// 동일한 소문자 미러가 되게 한다. validationOrder는 기본값을 유지한다 —
			// post-normalization으로 바꾸면 /sign-in/username만 반대로(정규화 전 값으로) 검증돼
			// 대문자로 입력한 로그인이 막힌다(플러그인 구현이 두 경로에서 반대로 해석한다).
			username({
				schema: {
					user: {
						fields: {
							username: "login_id",
							displayUsername: "login_id_display",
						},
					},
				},
				displayUsernameNormalization: (v) => v.toLowerCase(),
				maxUsernameLength: LOGIN_ID_MAX_LENGTH,
				minUsernameLength: LOGIN_ID_MIN_LENGTH,
				usernameValidator: isValidLoginId,
			}),
		],
	});
}

export const auth = createAuth();
