import { RequireAuth } from "@/components/bambi/require-auth";
import { PointOrdersScreen } from "@/components/bambi/screens/point-orders-screen";

export default function SeekerPointOrdersPage() {
	return (
		<RequireAuth>
			<PointOrdersScreen />
		</RequireAuth>
	);
}
