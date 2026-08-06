import { RequireAuth } from "@/components/bambi/require-auth";
import { NotificationsScreen } from "@/components/bambi/screens/notifications-screen";

export default function SeekerNotificationsPage() {
	return (
		<RequireAuth>
			<NotificationsScreen />
		</RequireAuth>
	);
}
