"use client";
import { cn } from "@bambi-app/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

const links = [
	{ href: "/jobs", id: "jobs", label: "공고" },
	{ href: "/chats", id: "chats", label: "채팅" },
	{ href: "/chats", id: "schedule", label: "일정" },
	{ href: "/employer", id: "employer", label: "구인자 관리" },
] as const;

export default function Header() {
	const pathname = usePathname();
	const activeLinkId = links.find(
		({ href }) => pathname === href || pathname.startsWith(`${href}/`)
	)?.id;

	return (
		<header className="border-b">
			<div className="mx-auto flex min-h-14 w-full max-w-6xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<nav
					aria-label="주요 메뉴"
					className="-mx-1 flex min-w-0 max-w-full items-center gap-1 overflow-x-auto pb-1 sm:mx-0 sm:pb-0"
				>
					{links.map(({ href, id, label }) => {
						const isActive = activeLinkId === id;

						return (
							<Link
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"shrink-0 rounded-md px-2.5 py-2 font-medium text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3",
									isActive && "bg-muted text-foreground"
								)}
								href={href}
								key={id}
							>
								{label}
							</Link>
						);
					})}
				</nav>
				<div className="flex shrink-0 items-center justify-end gap-2">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
