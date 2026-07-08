import { RequireAuth } from "@/components/bambi/require-auth";
import { BlockedUsersScreen } from "@/components/bambi/screens/blocked-users-screen";

export default function SeekerBlocksPage() {
	return (
		<RequireAuth>
			<BlockedUsersScreen />
		</RequireAuth>
	);
}
