import { buttonVariants } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { VariantProps } from "class-variance-authority";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	MoreHorizontalIcon,
} from "lucide-react";
import type { ComponentProps } from "react";

function Pagination({ className, ...props }: ComponentProps<"nav">) {
	return (
		<nav
			aria-label="페이지네이션"
			className={cn("mx-auto flex w-full justify-center", className)}
			data-slot="pagination"
			{...props}
		/>
	);
}

function PaginationContent({ className, ...props }: ComponentProps<"ul">) {
	return (
		<ul
			className={cn("flex flex-row items-center gap-1", className)}
			data-slot="pagination-content"
			{...props}
		/>
	);
}

function PaginationItem(props: ComponentProps<"li">) {
	return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = useRender.ComponentProps<"a"> & {
	isActive?: boolean;
	size?: VariantProps<typeof buttonVariants>["size"];
};

function PaginationLink({
	className,
	isActive,
	size = "icon",
	render,
	...props
}: PaginationLinkProps) {
	return useRender({
		defaultTagName: "a",
		props: mergeProps<"a">(
			{
				"aria-current": isActive ? "page" : undefined,
				className: cn(
					buttonVariants({
						variant: isActive ? "outline" : "ghost",
						size,
					}),
					className
				),
			},
			props
		),
		render,
		state: {
			active: isActive,
			slot: "pagination-link",
		},
	});
}

function PaginationPrevious({
	className,
	...props
}: ComponentProps<typeof PaginationLink>) {
	return (
		<PaginationLink
			aria-label="이전 페이지로 이동"
			className={cn("gap-1 px-2.5 sm:pl-2.5", className)}
			size="default"
			{...props}
		>
			<ChevronLeftIcon />
			<span className="hidden sm:block">이전</span>
		</PaginationLink>
	);
}

function PaginationNext({
	className,
	...props
}: ComponentProps<typeof PaginationLink>) {
	return (
		<PaginationLink
			aria-label="다음 페이지로 이동"
			className={cn("gap-1 px-2.5 sm:pr-2.5", className)}
			size="default"
			{...props}
		>
			<span className="hidden sm:block">다음</span>
			<ChevronRightIcon />
		</PaginationLink>
	);
}

function PaginationEllipsis({ className, ...props }: ComponentProps<"span">) {
	return (
		<span
			aria-hidden
			className={cn("flex size-8 items-center justify-center", className)}
			data-slot="pagination-ellipsis"
			{...props}
		>
			<MoreHorizontalIcon className="size-4" />
		</span>
	);
}

export {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
};
