import { RequireAuth } from "@/components/bambi/require-auth";
import { UpcomingInterviewsScreen } from "@/components/bambi/screens/upcoming-interviews-screen";

export default function SeekerInterviewsPage() {
	return (
		<RequireAuth>
			<UpcomingInterviewsScreen />
		</RequireAuth>
	);
}
