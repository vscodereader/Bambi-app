"use client";

import { useRouter } from "next/navigation";
import { EmployerPostings } from "@/components/bambi/screens/employer";

export default function EmployerPage() {
	const router = useRouter();
	return <EmployerPostings onNew={() => router.push("/employer/new")} />;
}
