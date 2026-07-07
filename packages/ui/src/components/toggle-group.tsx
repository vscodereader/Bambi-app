"use client";

import { toggleVariants } from "@bambi-app/ui/components/toggle";
import { cn } from "@bambi-app/ui/lib/utils";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import type { VariantProps } from "class-variance-authority";
import { createContext, useContext } from "react";

const ToggleGroupContext = createContext<
	VariantProps<typeof toggleVariants> & {
		orientation?: "horizontal" | "vertical";
	}
>({
	size: "default",
	variant: "default",
	orientation: "horizontal",
});

function ToggleGroup<Value extends string>({
	className,
	variant,
	size,
	orientation = "horizontal",
	children,
	...props
}: ToggleGroupPrimitive.Props<Value> &
	VariantProps<typeof toggleVariants> & {
		orientation?: "horizontal" | "vertical";
	}) {
	return (
		<ToggleGroupPrimitive
			className={cn(
				"group/toggle-group flex w-fit flex-row items-center gap-2 data-vertical:flex-col data-vertical:items-stretch",
				className
			)}
			data-orientation={orientation}
			data-size={size}
			data-slot="toggle-group"
			data-variant={variant}
			{...props}
		>
			<ToggleGroupContext.Provider value={{ variant, size, orientation }}>
				{children}
			</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive>
	);
}

function ToggleGroupItem({
	className,
	children,
	variant = "default",
	size = "default",
	...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
	const context = useContext(ToggleGroupContext);

	return (
		<TogglePrimitive
			className={cn(
				"shrink-0 focus:z-10 focus-visible:z-10",
				toggleVariants({
					variant: context.variant || variant,
					size: context.size || size,
				}),
				className
			)}
			data-size={context.size || size}
			data-slot="toggle-group-item"
			data-variant={context.variant || variant}
			{...props}
		>
			{children}
		</TogglePrimitive>
	);
}

export { ToggleGroup, ToggleGroupItem };
