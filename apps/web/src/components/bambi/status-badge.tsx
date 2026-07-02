import { Badge } from "@bambi-app/ui/components/badge";

const toneVariants = {
	default: "secondary",
	good: "success",
	warning: "warning",
	danger: "destructive",
} as const;

interface StatusBadgeProps {
	children: React.ReactNode;
	tone?: keyof typeof toneVariants;
}

export function StatusBadge({ children, tone = "default" }: StatusBadgeProps) {
	return <Badge variant={toneVariants[tone]}>{children}</Badge>;
}
