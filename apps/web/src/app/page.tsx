import { redirectToRoleHome } from "@/lib/bambi/require-role";

export default async function Home() {
	await redirectToRoleHome();
	return null;
}
