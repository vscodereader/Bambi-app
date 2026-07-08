import { RequireAuth } from "@/components/bambi/require-auth";
import { MyReportsScreen } from "@/components/bambi/screens/my-reports-screen";

export default function SeekerMyReportsPage() {
	return (
		<RequireAuth>
			<MyReportsScreen />
		</RequireAuth>
	);
}
