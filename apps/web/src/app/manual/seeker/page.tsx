import type { Metadata } from "next";
import { ManualScreen } from "@/components/bambi/manual/manual-screen";

export const metadata: Metadata = { title: "구직자 가이드" };

export default function SeekerManualPage() {
	return <ManualScreen manualKey="seeker" />;
}
