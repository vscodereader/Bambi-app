import { RequireAuth } from "@/components/bambi/require-auth";
import { SeekerMe } from "@/components/bambi/screens/seeker";

export default function SeekerMePage() {
	return (
		<RequireAuth>
			<SeekerMe />
		</RequireAuth>
	);
}
