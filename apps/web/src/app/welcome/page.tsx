import { Suspense } from "react";
import { GuestBlockedToast } from "@/components/bambi/guest-blocked-toast";
import { AdultGateScreen } from "@/components/bambi/screens/adult-gate-screen";

export default function WelcomePage() {
	return (
		<Suspense>
			<GuestBlockedToast />
			<AdultGateScreen />
		</Suspense>
	);
}
