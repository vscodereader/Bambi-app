import { buttonVariants } from "@bambi-app/ui/components/button";
import Link from "next/link";
import { MANUAL_LABELS, type ManualKey, manualPath } from "@/lib/bambi/manual";

// 열람 가능 매뉴얼이 2개 이상인 역할(구인자·운영자)에게만 보이는 전환 링크.
// 내비 링크라 primary는 쓰지 않는다 — 활성은 secondary, 비활성은 ghost.
export function ManualTabs({
	active,
	keys,
}: {
	active: ManualKey;
	keys: ManualKey[];
}) {
	if (keys.length < 2) {
		return null;
	}
	return (
		<nav aria-label="매뉴얼 전환" className="flex flex-wrap gap-2">
			{keys.map((key) => (
				<Link
					className={buttonVariants({
						size: "sm",
						variant: key === active ? "secondary" : "ghost",
					})}
					href={manualPath(key)}
					key={key}
				>
					{MANUAL_LABELS[key]}
				</Link>
			))}
		</nav>
	);
}
