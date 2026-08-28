import { RequireAuth } from "@/components/bambi/require-auth";
import { MessagesScreen } from "@/components/bambi/screens/messages-screen";

export default function SeekerMessagesPage() {
	return (
		<RequireAuth>
			<MessagesScreen />
		</RequireAuth>
	);
}
