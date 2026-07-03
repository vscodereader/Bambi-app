import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { client } from "@/utils/orpc";
import { resolveRoleRedirect } from "./resolve-role-redirect";

export async function enforceRoleRouting(): Promise<void> {
	const pathname = (await headers()).get("x-bambi-pathname") ?? "/";

	let routing: Awaited<ReturnType<typeof client.bambi.onboarding.getMyRouting>>;
	try {
		routing = await client.bambi.onboarding.getMyRouting();
	} catch {
		redirect("/welcome");
	}

	const to = resolveRoleRedirect({
		role: routing.role,
		approvalStatus: routing.employerApprovalStatus,
		pathname,
	});

	if (to) {
		redirect(to);
	}
}
