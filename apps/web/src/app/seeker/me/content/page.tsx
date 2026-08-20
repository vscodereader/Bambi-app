import { RequireAuth } from "@/components/bambi/require-auth";
import { MyContentScreen } from "@/components/bambi/screens/my-content-screen";

export default function SeekerMyContentPage() {
	return (
		<RequireAuth>
			<MyContentScreen />
		</RequireAuth>
	);
}
