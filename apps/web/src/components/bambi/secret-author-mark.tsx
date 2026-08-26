import { cn } from "@bambi-app/ui/lib/utils";
import { MarsIcon, VenusIcon } from "lucide-react";

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
					"inline-flex shrink-0 items-center justify-center rounded-full text-ink-900",
					size === "md" ? "size-10" : "size-7",
					gender === "male" ? "bg-sky-200" : "bg-[var(--gender-female-bg)]"
				)}
			>
				<Icon aria-hidden className={size === "md" ? "size-5" : "size-4"} />
			</span>
			{showName ? <span>밤비</span> : null}
		</span>
	);
}
