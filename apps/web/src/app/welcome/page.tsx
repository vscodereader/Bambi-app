import { Suspense } from "react";
import { AdultGateScreen } from "@/components/bambi/screens/adult-gate-screen";

export default function WelcomePage() {
	return (
		<Suspense>
			<AdultGateScreen />
		</Suspense>
	);
}
