"use client";

import type { Route } from "next";
import { notFound, useParams, useRouter } from "next/navigation";
import { SeekerJobDetailResponsive } from "@/components/bambi/screens/seeker-job-detail-responsive";
import { JOBS } from "@/lib/bambi/data";

export default function SeekerJobPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const job = JOBS.find((j) => j.id === id);
	if (!job) {
		notFound();
	}
	return (
		<SeekerJobDetailResponsive
			job={job}
			onBack={() => router.push("/seeker")}
			onReport={() => router.push(`/seeker/chats/${job.id}` as Route)}
			onStartChat={() => router.push(`/seeker/chats/${job.id}` as Route)}
		/>
	);
}
