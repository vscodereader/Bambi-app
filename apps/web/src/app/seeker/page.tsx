import { Suspense } from "react";
import { AuthDialog } from "@/components/bambi/auth/auth-dialog";
import { GuestBlockedToast } from "@/components/bambi/guest-blocked-toast";
import { SeekerMarketplaceScreen } from "@/components/bambi/screens/seeker-marketplace";

export default function SeekerHomePage() {
	return (
		<>
			{/* 둘 다 useSearchParams를 쓰므로 Suspense 경계가 필요하다. */}
			<Suspense>
				<GuestBlockedToast />
				<AuthDialog />
			</Suspense>
			<SeekerMarketplaceScreen />
		</>
	);
}
