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
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

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
			defaultCookieAttributes: {
				sameSite: "none",
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
		],
	});
}

export const auth = createAuth();
