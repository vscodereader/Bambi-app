"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

function Sheet(props: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetPortal(props: DialogPrimitive.Portal.Props) {
	return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetBackdrop({
	className,
	...props
}: DialogPrimitive.Backdrop.Props) {
	return (
		<DialogPrimitive.Backdrop
			className={cn(
				"fixed inset-0 z-50 bg-ink-900/25 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
				className
			)}
			data-slot="sheet-backdrop"
			{...props}
		/>
	);
}

function SheetClose(props: DialogPrimitive.Close.Props) {
	return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetTrigger(props: DialogPrimitive.Trigger.Props) {
	return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
	return (
		<DialogPrimitive.Title
			className={cn("m-0 font-extrabold text-xl leading-snug", className)}
			data-slot="sheet-title"
			{...props}
		/>
	);
}

// 우측에서 슬라이드되는 드로어 시트 — 포털/백드롭/스택은 base-ui가 관리한다.
// z-50은 Dialog와 같은 층 — 이게 없으면 z-index를 가진 고정 셸(sticky 헤더 z-30,
// 모바일 채팅방 패널 z-40) 아래로 깔려 서랍이 열려도 안 보인다.
function SheetContent({
	children,
	className,
	...props
}: DialogPrimitive.Popup.Props) {
	return (
		<SheetPortal>
			<SheetBackdrop />
			<DialogPrimitive.Popup
				className={cn(
					"fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[88vw] flex-col overflow-y-auto bg-card p-5 shadow-[var(--shadow-lg)] transition-transform duration-200 data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full",
					className
				)}
				data-slot="sheet-content"
				{...props}
			>
				{children}
			</DialogPrimitive.Popup>
		</SheetPortal>
	);
}

export { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger };
