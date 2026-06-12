import { env } from "@bambi-app/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import {
	account,
	accountRelations,
	invitation,
	invitationRelations,
	member,
	memberRelations,
	organization,
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
} from "./schema/auth";
import {
	adminModerationAction,
	bambiProfile,
	bambiProfileRelations,
	chatMessage,
	chatRoom,
	contactRevealConsent,
	employerOrganizationProfile,
	employerOrganizationProfileRelations,
	employerTeamProfile,
	employerTeamProfileRelations,
	interviewSchedule,
	jobPost,
	jobPostRelations,
	report,
	review,
	userBlock,
} from "./schema/bambi";
import { todo } from "./schema/todo";

const schema = {
	account,
	accountRelations,
	adminModerationAction,
	bambiProfile,
	bambiProfileRelations,
	chatMessage,
	chatRoom,
	contactRevealConsent,
	employerOrganizationProfile,
	employerOrganizationProfileRelations,
	employerTeamProfile,
	employerTeamProfileRelations,
	interviewSchedule,
	invitation,
	invitationRelations,
	jobPost,
	jobPostRelations,
	member,
	memberRelations,
	organization,
	organizationRelations,
	report,
	review,
	session,
	sessionRelations,
	team,
	teamMember,
	teamMemberRelations,
	teamRelations,
	todo,
	user,
	userBlock,
	userRelations,
	verification,
};

export function createDb() {
	return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();
