import { enforceRoleRouting } from "@/lib/bambi/require-role";

export default async function Home() {
	await enforceRoleRouting();
	return null;
}
