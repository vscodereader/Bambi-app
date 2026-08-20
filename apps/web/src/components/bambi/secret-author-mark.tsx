import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { MarsIcon, VenusIcon } from "lucide-react";
import { useState } from "react";
import { orpc } from "@/utils/orpc";
import { useBambiAuth } from "./auth-client-provider";

export type SecretAuthorGender = "female" | "male";

export function SecretAuthorMark({
	gender,
	size = "sm",
	showName = true,
}: {
	gender: SecretAuthorGender;
	size?: "md" | "sm";
	showName?: boolean;
}) {
	const Icon = gender === "male" ? MarsIcon : VenusIcon;
	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				className={cn(
					"inline-flex shrink-0 items-center justify-center rounded-full text-foreground",
					size === "md" ? "size-10" : "size-7",
					gender === "male" ? "bg-sky-200" : "bg-primary/15"
				)}
			>
				<Icon aria-hidden className={size === "md" ? "size-5" : "size-4"} />
			</span>
			{showName ? <span>밤비</span> : null}
		</span>
	);
}

export function SecretAuthorIdentityMark({
	gender,
	id,
	targetType,
}: {
	gender: SecretAuthorGender;
	id: string;
	targetType: "comment" | "post";
}) {
	const { role } = useBambiAuth();
	const [revealed, setRevealed] = useState(false);
	const query = useQuery({
		...orpc.bambi.community.getSecretAuthorIdentity.queryOptions({
			input: { id, targetType },
		}),
		enabled: revealed && role === "admin",
	});
	if (role !== "admin") {
		return <SecretAuthorMark gender={gender} />;
	}
	return (
		<button
			aria-label="작성자 실명 표시 전환"
			className="rounded-md border-0 bg-transparent p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={() => setRevealed((current) => !current)}
			type="button"
		>
			<span className="inline-flex items-center gap-1.5">
				<SecretAuthorMark gender={gender} showName={false} />
				<span>
					{revealed ? (query.data?.realName ?? "확인 중...") : "밤비"}
				</span>
			</span>
		</button>
	);
}
