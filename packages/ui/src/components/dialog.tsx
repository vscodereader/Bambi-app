"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

function Dialog(props: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogBackdrop({
	className,
	...props
}: DialogPrimitive.Backdrop.Props) {
	return (
		<DialogPrimitive.Backdrop
			className={cn(
				"fixed inset-0 bg-ink-900/25 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
				className
			)}
			data-slot="dialog-backdrop"
			{...props}
		/>
	);
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
	return (
		<DialogPrimitive.Title
			className={cn("m-0 font-extrabold text-xl leading-snug", className)}
			data-slot="dialog-title"
			{...props}
		/>
	);
}

function DialogDescription({
	className,
	...props
}: DialogPrimitive.Description.Props) {
	return (
		<DialogPrimitive.Description
			className={cn("m-0 text-muted-foreground text-sm", className)}
			data-slot="dialog-description"
			{...props}
		/>
	);
}

// 화면 중앙에 뜨는 모달. 포털/백드롭/스택·포커스 트랩은 base-ui가 관리한다.
function DialogContent({
	children,
	className,
	...props
}: DialogPrimitive.Popup.Props) {
	return (
		<DialogPortal>
			<DialogBackdrop />
			<DialogPrimitive.Popup
				className={cn(
					"fixed top-1/2 left-1/2 flex w-[420px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-xl bg-card p-6 shadow-[var(--shadow-lg)] transition-[transform,opacity] duration-200 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
					className
				)}
				data-slot="dialog-content"
				{...props}
			>
				{children}
			</DialogPrimitive.Popup>
		</DialogPortal>
	);
}

export {
	Dialog,
	DialogBackdrop,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
