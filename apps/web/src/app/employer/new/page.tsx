"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	EmployerPost,
	EmployerPostResult,
} from "@/components/bambi/screens/employer";

export default function EmployerNewPage() {
	const router = useRouter();
	const [result, setResult] = useState<string | null>(null);

	if (result !== null) {
		return (
			<EmployerPostResult
				onDone={() => router.push("/employer")}
				state={result}
			/>
		);
	}
	return (
		<EmployerPost
			model="hybrid"
			onBack={() => router.push("/employer")}
			onDone={(state) => setResult(state)}
			tone="calm"
		/>
	);
}
