import { Suspense } from "react";
import { GuestBlockedToast } from "@/components/bambi/guest-blocked-toast";
import { AdultGateScreen } from "@/components/bambi/screens/adult-gate-screen";
import { SiteFooter } from "@/components/bambi/site-footer";

export default function WelcomePage() {
	return (
		<Suspense>
			<GuestBlockedToast />
			<div className="flex min-h-[100dvh] flex-col bg-secondary">
				<AdultGateScreen />
				<SiteFooter contentWidthClassName="max-w-5xl" />
			</div>
		</Suspense>
	);
}
