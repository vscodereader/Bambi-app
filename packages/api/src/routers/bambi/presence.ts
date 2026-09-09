import z from "zod";

import { protectedProcedure } from "../../index";
import {
	disconnectUserPresenceConnection,
	disconnectUserPresenceSession,
	registerUserPresenceConnection,
	renewUserPresenceConnection,
} from "../../services/bambi-user-presence-db";

const connectionInput = z.object({ connectionId: z.uuid() });

export const presenceRouter = {
	connect: protectedProcedure
		.input(connectionInput)
		.handler(async ({ context, input }) => {
			await registerUserPresenceConnection({
				connectionId: input.connectionId,
				platform: "native",
				sessionId: context.session.session.id,
				userId: context.session.user.id,
			});
			return { ok: true };
		}),
	disconnect: protectedProcedure
		.input(connectionInput)
		.handler(async ({ context, input }) => ({
			offline: await disconnectUserPresenceConnection({
				connectionId: input.connectionId,
				sessionId: context.session.session.id,
				userId: context.session.user.id,
			}),
		})),
	disconnectSession: protectedProcedure.handler(async ({ context }) => ({
		offline: await disconnectUserPresenceSession({
			sessionId: context.session.session.id,
			userId: context.session.user.id,
		}),
	})),
	renew: protectedProcedure
		.input(connectionInput)
		.handler(async ({ context, input }) => {
			await renewUserPresenceConnection({
				connectionId: input.connectionId,
				sessionId: context.session.session.id,
				userId: context.session.user.id,
			});
			return { ok: true };
		}),
};
