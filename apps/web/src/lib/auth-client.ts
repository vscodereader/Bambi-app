"use client";

import { env } from "@bambi-app/env/web";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: env.NEXT_PUBLIC_SERVER_URL,
	plugins: [
		organizationClient({
			teams: {
				enabled: true,
			},
		}),
	],
});
