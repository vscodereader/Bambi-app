"use client";

import { Button } from "@bambi-app/ui/components/button";
import { cn } from "@bambi-app/ui/lib/utils";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
	return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props) {
	return (
		<AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
	);
}

function AlertDialogPortal(props: AlertDialogPrimitive.Portal.Props) {
	return (
		<AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
	);
}

function AlertDialogBackdrop({
	className,
	...props
}: AlertDialogPrimitive.Backdrop.Props) {
	return (
		<AlertDialogPrimitive.Backdrop
			className={cn(
				"fixed inset-0 bg-ink-900/25 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none",
				className
			)}
			data-slot="alert-dialog-backdrop"
			{...props}
		/>
	);
}

// 되돌릴 수 없는 동작 앞에 세우는 모달. Dialog와 달리 Esc·바깥 클릭으로 닫히지 않는다
// (base-ui AlertDialog의 기본 동작) — 답을 고르지 않고 빠져나가는 길이 없어야 한다.
function AlertDialogContent({
	className,
	...props
}: AlertDialogPrimitive.Popup.Props) {
	return (
		<AlertDialogPortal>
			<AlertDialogBackdrop />
			<AlertDialogPrimitive.Popup
				className={cn(
					"fixed top-1/2 left-1/2 flex w-[420px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto overscroll-contain rounded-xl bg-card p-6 shadow-[var(--shadow-lg)] outline-none transition-[transform,opacity] duration-200 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none motion-reduce:data-[ending-style]:scale-100 motion-reduce:data-[starting-style]:scale-100",
					className
				)}
				data-slot="alert-dialog-content"
				{...props}
			/>
		</AlertDialogPortal>
	);
}

function AlertDialogHeader({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col gap-2", className)}
			data-slot="alert-dialog-header"
			{...props}
		/>
	);
}

function AlertDialogFooter({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
				className
			)}
			data-slot="alert-dialog-footer"
			{...props}
		/>
	);
}

function AlertDialogTitle({
	className,
	...props
}: AlertDialogPrimitive.Title.Props) {
	return (
		<AlertDialogPrimitive.Title
			className={cn(
				"m-0 text-pretty font-extrabold text-xl leading-snug",
				className
			)}
			data-slot="alert-dialog-title"
			{...props}
		/>
	);
}

function AlertDialogDescription({
	className,
	...props
}: AlertDialogPrimitive.Description.Props) {
	return (
		<AlertDialogPrimitive.Description
			className={cn("m-0 text-pretty text-muted-foreground text-sm", className)}
			data-slot="alert-dialog-description"
			{...props}
		/>
	);
}

// 확정 동작. 닫기는 호출부가 onClick에서 함께 처리한다 — 실패하면 열린 채로 남겨야 하는
// 경우가 있어 Close로 묶지 않는다.
function AlertDialogAction(props: React.ComponentProps<typeof Button>) {
	return <Button data-slot="alert-dialog-action" {...props} />;
}

function AlertDialogCancel({
	size = "default",
	variant = "outline",
	...props
}: AlertDialogPrimitive.Close.Props &
	Pick<React.ComponentProps<typeof Button>, "size" | "variant">) {
	return (
		<AlertDialogPrimitive.Close
			data-slot="alert-dialog-cancel"
			render={<Button size={size} variant={variant} />}
			{...props}
		/>
	);
}

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogBackdrop,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
};
