import { cn } from "@bambi-app/ui/lib/utils";

const toneClassNames = {
	default: "border-border bg-muted text-muted-foreground",
	good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
	warning:
		"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
	danger:
		"border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
} as const;

interface StatusBadgeProps {
	children: React.ReactNode;
	tone?: keyof typeof toneClassNames;
}

export function StatusBadge({ children, tone = "default" }: StatusBadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex h-6 items-center rounded-md border px-2 font-medium text-xs",
				toneClassNames[tone]
			)}
		>
			{children}
		</span>
	);
}
