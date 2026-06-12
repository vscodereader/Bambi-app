"use client";
import { cn } from "@bambi-app/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

const links = [
	{ href: "/jobs", label: "공고" },
	{ href: "/chats", label: "채팅" },
	{ href: "/chats", label: "일정" },
	{ href: "/employer", label: "구인자 관리" },
] as const;

export default function Header() {
	const pathname = usePathname();

	return (
		<header className="border-b">
			<div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
				<nav aria-label="주요 메뉴" className="flex min-w-0 items-center gap-1">
					{links.map(({ href, label }) => {
						const isActive =
							pathname === href || pathname.startsWith(`${href}/`);

						return (
							<Link
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"rounded-md px-3 py-2 font-medium text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									isActive && "bg-muted text-foreground"
								)}
								href={href}
								key={`${href}-${label}`}
							>
								{label}
							</Link>
						);
					})}
				</nav>
				<div className="flex items-center gap-2">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
