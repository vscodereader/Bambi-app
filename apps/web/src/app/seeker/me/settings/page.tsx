import { RequireAuth } from "@/components/bambi/require-auth";
import { AccountSettingsScreen } from "@/components/bambi/screens/account-settings-screen";

export default function SeekerAccountSettingsPage() {
	return (
		<RequireAuth>
			<AccountSettingsScreen />
		</RequireAuth>
	);
}
