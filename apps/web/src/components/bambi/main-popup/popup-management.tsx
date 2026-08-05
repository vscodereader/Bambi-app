"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/react";
import { ClipboardPaste, ImagePlus, Save, Undo2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	clonePopupDraft,
	EMPTY_TEXT_DOCUMENT,
	type MainPopupDraft,
	type PopupImageAsset,
	readPopupImage,
} from "@/lib/bambi/main-popup";
import { orpc } from "@/utils/orpc";
import { PopupDateTimePicker } from "./popup-date-time-picker";
import { PopupImageEditor } from "./popup-image-editor";
import { PopupTextEditor } from "./popup-text-editor";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const handleClass = (handle: Handle) =>
	`absolute z-20 size-4 touch-none rounded-full border-2 border-background bg-primary ${({ e: "top-1/2 -right-2 -translate-y-1/2 cursor-ew-resize", n: "-top-2 left-1/2 -translate-x-1/2 cursor-ns-resize", ne: "-top-2 -right-2 cursor-nesw-resize", nw: "-top-2 -left-2 cursor-nwse-resize", s: "-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize", se: "-right-2 -bottom-2 cursor-nwse-resize", sw: "-bottom-2 -left-2 cursor-nesw-resize", w: "top-1/2 -left-2 -translate-y-1/2 cursor-ew-resize" } as const)[handle]}`;

const toDraft = (row: Record<string, unknown>): MainPopupDraft => ({
	contentHeight: Number(row.contentHeight),
	contentType: row.contentType as "image" | "text",
	contentWidth: Number(row.contentWidth),
	editedImage: row.editedImage as PopupImageAsset | null,
	enabled: Boolean(row.enabled),
	endsAt: row.endsAt ? new Date(row.endsAt as string | Date) : null,
	id: String(row.id),
	linkPath: row.linkPath ? String(row.linkPath) : null,
	originalImage: row.originalImage as PopupImageAsset | null,
	revision: Number(row.revision),
	slotIndex: Number(row.slotIndex),
	startsAt: row.startsAt ? new Date(row.startsAt as string | Date) : null,
	textDocument: row.textDocument as JSONContent | null,
	updatedAt: new Date(row.updatedAt as string | Date),
	updatedByName: row.updatedByName ? String(row.updatedByName) : null,
});

export function PopupManagement() {
	const queryClient = useQueryClient();
	const query = useQuery(orpc.bambi.mainPopups.listAdmin.queryOptions());
	const [drafts, setDrafts] = useState<MainPopupDraft[]>([]);
	const [histories, setHistories] = useState<Record<string, MainPopupDraft[]>>(
		{}
	);
	const [count, setCount] = useState(0);
	const [pendingCount, setPendingCount] = useState<number | null>(null);
	const [pendingPasteId, setPendingPasteId] = useState<string | null>(null);
	const [clipboard, setClipboard] = useState<PopupImageAsset | null>(null);
	useEffect(() => {
		if (query.data) {
			const next = query.data.items.map((item) =>
				toDraft(item as unknown as Record<string, unknown>)
			);
			setDrafts(next);
			setCount(next.length);
		}
	}, [query.data]);
	const countMutation = useMutation(
		orpc.bambi.mainPopups.setCount.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.mainPopups.listAdmin.queryKey(),
				});
				setHistories({});
				toast.success("팝업 개수를 저장했습니다.");
			},
			onError: (error) => toast.error(error.message),
		})
	);
	const saveMutation = useMutation(
		orpc.bambi.mainPopups.save.mutationOptions({
			onSuccess: async (saved) => {
				setHistories((current) => ({ ...current, [saved.id]: [] }));
				localStorage.setItem(
					"bambi:main-popup:revision-signal",
					String(Date.now())
				);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.mainPopups.listAdmin.queryKey(),
				});
				toast.success("팝업 설정을 저장했습니다.");
			},
			onError: (error) => toast.error(error.message),
		})
	);
	const update = (
		id: string,
		change: (current: MainPopupDraft) => MainPopupDraft,
		record = true
	) =>
		setDrafts((current) =>
			current.map((draft) => {
				if (draft.id !== id) {
					return draft;
				}
				if (record) {
					setHistories((all) => ({
						...all,
						[id]: [...(all[id] ?? []).slice(-49), clonePopupDraft(draft)],
					}));
				}
				return change(draft);
			})
		);
	const undo = (id: string) => {
		const history = histories[id] ?? [];
		const previous = history.at(-1);
		if (!previous) {
			return;
		}
		setDrafts((current) =>
			current.map((draft) => (draft.id === id ? previous : draft))
		);
		setHistories((all) => ({ ...all, [id]: history.slice(0, -1) }));
	};
	const pasteInto = (id: string) => {
		if (!clipboard) {
			return;
		}
		update(id, (current) => ({
			...current,
			contentHeight: clipboard.height,
			contentType: "image",
			contentWidth: clipboard.width,
			editedImage: structuredClone(clipboard),
			linkPath: current.contentType === "image" ? current.linkPath : null,
			originalImage: structuredClone(clipboard),
			textDocument: null,
		}));
	};
	if (query.isLoading) {
		return <p>팝업 설정을 불러오는 중입니다.</p>;
	}
	return (
		<div className="flex flex-col gap-6">
			<section>
				<h1 className="font-semibold text-2xl">팝업 설정</h1>
				<p className="text-muted-foreground">
					메인 화면 팝업을 운영자만 설정할 수 있습니다.
				</p>
			</section>
			<Card>
				<CardHeader>
					<CardTitle>1. 팝업창 개수 설정</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-wrap items-end gap-3">
					<div className="grid gap-2">
						<Label htmlFor="popup-count">팝업 개수</Label>
						<Input
							id="popup-count"
							min={0}
							onChange={(event) =>
								setCount(Math.max(0, Number(event.target.value)))
							}
							type="number"
							value={count}
						/>
					</div>
					<Button
						disabled={countMutation.isPending || count === drafts.length}
						onClick={() =>
							count < drafts.length
								? setPendingCount(count)
								: countMutation.mutate({ count })
						}
					>
						개수 저장
					</Button>
				</CardContent>
			</Card>
			{drafts.map((draft) => (
				<PopupCard
					clipboard={clipboard}
					draft={draft}
					historyCount={histories[draft.id]?.length ?? 0}
					key={draft.id}
					onCancel={() => {
						const saved = query.data?.items.find(
							(item) => item.id === draft.id
						);
						if (saved) {
							setDrafts((current) =>
								current.map((item) =>
									item.id === draft.id
										? toDraft(saved as unknown as Record<string, unknown>)
										: item
								)
							);
							setHistories((current) => ({ ...current, [draft.id]: [] }));
						}
					}}
					onCopy={() => {
						if (draft.editedImage) {
							setClipboard(structuredClone(draft.editedImage));
							toast.success(`${draft.slotIndex}번 팝업 이미지를 복사했습니다.`);
						}
					}}
					onPaste={() => {
						if (!clipboard) {
							return;
						}
						if (draft.editedImage) {
							setPendingPasteId(draft.id);
						} else {
							pasteInto(draft.id);
						}
					}}
					onSave={() =>
						saveMutation.mutate({
							contentHeight: draft.contentHeight,
							contentType: draft.contentType,
							contentWidth: draft.contentWidth,
							editedImage:
								draft.contentType === "image" ? draft.editedImage : null,
							enabled: draft.enabled,
							endsAt: draft.endsAt,
							expectedRevision: draft.revision,
							id: draft.id,
							linkPath: draft.contentType === "image" ? draft.linkPath : null,
							originalImage:
								draft.contentType === "image" ? draft.originalImage : null,
							startsAt: draft.startsAt,
							textDocument:
								draft.contentType === "text"
									? ((draft.textDocument ?? EMPTY_TEXT_DOCUMENT) as Record<
											string,
											unknown
										>)
									: null,
						})
					}
					onUndo={() => undo(draft.id)}
					update={(change, record) => update(draft.id, change, record)}
				/>
			))}
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingCount(null);
					}
				}}
				open={pendingCount !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>팝업을 완전히 삭제할까요?</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingCount ?? 0}개 이후 팝업과 설정·내용이 복구할 수 없게
							삭제됩니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingCount !== null) {
									countMutation.mutate({ count: pendingCount });
								}
								setPendingCount(null);
							}}
							variant="destructive"
						>
							삭제 후 저장
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingPasteId(null);
					}
				}}
				open={pendingPasteId !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>이미지를 교체할까요?</AlertDialogTitle>
						<AlertDialogDescription>
							대상 팝업의 기존 이미지를 복사한 이미지로 교체합니다. 저장 전에는
							취소할 수 있습니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingPasteId) {
									pasteInto(pendingPasteId);
								}
								setPendingPasteId(null);
							}}
						>
							교체
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function PopupCard({
	clipboard,
	draft,
	historyCount,
	onCancel,
	onCopy,
	onPaste,
	onSave,
	onUndo,
	update,
}: {
	clipboard: PopupImageAsset | null;
	draft: MainPopupDraft;
	historyCount: number;
	onCancel: () => void;
	onCopy: () => void;
	onPaste: () => void;
	onSave: () => void;
	onUndo: () => void;
	update: (
		change: (current: MainPopupDraft) => MainPopupDraft,
		record?: boolean
	) => void;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [pendingType, setPendingType] = useState<"image" | "text" | null>(null);
	const [showSizeEditor, setShowSizeEditor] = useState(false);
	const textResize = useRef<{
		handle: Handle;
		height: number;
		width: number;
		x: number;
		y: number;
	} | null>(null);
	const applyType = (contentType: "image" | "text") => {
		if (draft.contentType === contentType) {
			return;
		}
		update((current) => ({
			...current,
			contentHeight: contentType === "text" ? 320 : current.contentHeight,
			contentType,
			contentWidth: contentType === "text" ? 420 : current.contentWidth,
			editedImage: contentType === "image" ? current.editedImage : null,
			linkPath: null,
			originalImage: contentType === "image" ? current.originalImage : null,
			textDocument: contentType === "text" ? EMPTY_TEXT_DOCUMENT : null,
		}));
	};
	const requestType = (contentType: "image" | "text") => {
		if (draft.contentType === contentType) {
			return;
		}
		const hasContent =
			draft.contentType === "image"
				? Boolean(draft.editedImage)
				: Boolean(draft.textDocument);
		if (hasContent) {
			setPendingType(contentType);
		} else {
			applyType(contentType);
		}
	};
	const resizeText = (event: React.PointerEvent<HTMLButtonElement>) => {
		const drag = textResize.current;
		if (!drag) {
			return;
		}
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		let widthDelta = 0;
		if (drag.handle.includes("w")) {
			widthDelta = -dx;
		} else if (drag.handle.includes("e")) {
			widthDelta = dx;
		}
		let heightDelta = 0;
		if (drag.handle.includes("n")) {
			heightDelta = -dy;
		} else if (drag.handle.includes("s")) {
			heightDelta = dy;
		}
		const width = Math.min(
			window.innerWidth * 0.9,
			Math.max(280, Math.round(drag.width + widthDelta))
		);
		const height = Math.min(
			window.innerHeight * 0.8,
			Math.max(160, Math.round(drag.height + heightDelta))
		);
		update(
			(current) => ({ ...current, contentHeight: height, contentWidth: width }),
			false
		);
	};
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between">
				<CardTitle>{draft.slotIndex}번 팝업창</CardTitle>
				<div className="flex items-center gap-2">
					<Label htmlFor={`enabled-${draft.id}`}>사용</Label>
					<Switch
						checked={draft.enabled}
						id={`enabled-${draft.id}`}
						onCheckedChange={(enabled) =>
							update((current) => ({ ...current, enabled }))
						}
					/>
				</div>
			</CardHeader>
			<CardContent className="grid gap-5">
				<div className="flex flex-wrap gap-2">
					<Button
						onClick={() => requestType("image")}
						variant={draft.contentType === "image" ? "default" : "outline"}
					>
						이미지
					</Button>
					<Button
						onClick={() => requestType("text")}
						variant={draft.contentType === "text" ? "default" : "outline"}
					>
						글 작성
					</Button>
					<Button
						disabled={historyCount === 0}
						onClick={onUndo}
						variant="outline"
					>
						<Undo2 />
						실행 취소
					</Button>
				</div>
				{draft.contentType === "image" ? (
					<>
						<div className="flex flex-wrap gap-2">
							<Button
								onClick={() => fileRef.current?.click()}
								variant="outline"
							>
								<ImagePlus />
								이미지 추가
							</Button>
							<Button disabled={!clipboard} onClick={onPaste} variant="outline">
								<ClipboardPaste />
								붙여넣기
							</Button>
							<Button
								onClick={() => setShowSizeEditor((current) => !current)}
								variant="outline"
							>
								3. 팝업창 사이즈 조절
							</Button>
							<input
								accept="image/jpeg,image/png,image/webp"
								className="hidden"
								onChange={async (event) => {
									const file = event.target.files?.[0];
									event.target.value = "";
									if (!file) {
										return;
									}
									try {
										const image = await readPopupImage(file);
										update((current) => ({
											...current,
											contentHeight: image.height,
											contentWidth: image.width,
											editedImage: image,
											originalImage: image,
										}));
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: "이미지를 추가하지 못했습니다."
										);
									}
								}}
								ref={fileRef}
								type="file"
							/>
						</div>
						{showSizeEditor ? (
							<PopupImageEditor
								asset={draft.editedImage}
								height={draft.contentHeight}
								onChange={(editedImage) =>
									update((current) => ({ ...current, editedImage }))
								}
								onCopy={onCopy}
								onDelete={() =>
									update((current) => ({ ...current, editedImage: null }))
								}
								onReset={() => {
									if (draft.originalImage) {
										update((current) => ({
											...current,
											contentHeight:
												current.originalImage?.height ?? current.contentHeight,
											contentWidth:
												current.originalImage?.width ?? current.contentWidth,
											editedImage: structuredClone(current.originalImage),
										}));
									}
								}}
								onResize={(contentWidth, contentHeight) =>
									update(
										(current) => ({ ...current, contentHeight, contentWidth }),
										false
									)
								}
								onResizeStart={() => update((current) => current)}
								onUndo={onUndo}
								width={draft.contentWidth}
							/>
						) : null}
						{!showSizeEditor && draft.editedImage ? (
							<div className="flex justify-center rounded-md bg-muted p-4">
								<Image
									alt="팝업 이미지 미리보기"
									className="h-auto max-h-96 max-w-full"
									height={draft.contentHeight}
									src={draft.editedImage.dataUrl}
									unoptimized
									width={draft.contentWidth}
								/>
							</div>
						) : null}
						<div className="grid gap-2">
							<Label htmlFor={`link-${draft.id}`}>
								5. 링크 삽입 (밤비 내부 주소)
							</Label>
							<Input
								id={`link-${draft.id}`}
								onChange={(event) =>
									update((current) => ({
										...current,
										linkPath: event.target.value || null,
									}))
								}
								placeholder="/seeker/jobs/..."
								value={draft.linkPath ?? ""}
							/>
						</div>
					</>
				) : (
					<div className="grid gap-3">
						<Button
							className="w-fit"
							onClick={() => setShowSizeEditor((current) => !current)}
							variant="outline"
						>
							3. 팝업창 사이즈 조절 및 글 작성
						</Button>
						{showSizeEditor ? (
							<div className="max-h-[80vh] overflow-auto rounded-md bg-muted p-8">
								<div className="relative mx-auto h-fit w-fit">
									<svg
										aria-label="글 팝업 크기 미리보기"
										height={draft.contentHeight}
										role="img"
										width={draft.contentWidth}
									>
										<foreignObject height="100%" width="100%">
											<PopupTextEditor
												onAutoHeight={(contentHeight) => {
													if (contentHeight > draft.contentHeight) {
														update(
															(current) => ({ ...current, contentHeight }),
															false
														);
													}
												}}
												onChange={(textDocument) =>
													update((current) => ({ ...current, textDocument }))
												}
												value={draft.textDocument ?? EMPTY_TEXT_DOCUMENT}
											/>
										</foreignObject>
									</svg>
									{HANDLES.map((handle) => (
										<button
											aria-label={`${handle} 팝업 크기 조절`}
											className={handleClass(handle)}
											key={handle}
											onPointerDown={(event) => {
												event.preventDefault();
												event.currentTarget.setPointerCapture(event.pointerId);
												update((current) => current);
												textResize.current = {
													handle,
													height: draft.contentHeight,
													width: draft.contentWidth,
													x: event.clientX,
													y: event.clientY,
												};
											}}
											onPointerMove={resizeText}
											onPointerUp={() => {
												textResize.current = null;
											}}
											type="button"
										/>
									))}
								</div>
							</div>
						) : (
							<p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
								사이즈 조절 및 글 작성 버튼을 눌러 실제 팝업 크기로 편집하세요.
							</p>
						)}
					</div>
				)}
				<div className="grid gap-3 md:grid-cols-2">
					<div className="grid gap-2">
						<Label>4. 시작 일시 (KST)</Label>
						<PopupDateTimePicker
							kind="start"
							onChange={(startsAt) =>
								update((current) => ({ ...current, startsAt }))
							}
							value={draft.startsAt}
						/>
					</div>
					<div className="grid gap-2">
						<Label>종료 일시 (KST)</Label>
						<PopupDateTimePicker
							kind="end"
							onChange={(endsAt) =>
								update((current) => ({ ...current, endsAt }))
							}
							value={draft.endsAt}
						/>
					</div>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
					<p className="text-muted-foreground text-sm">
						마지막 편집: {draft.updatedByName ?? "없음"} ·{" "}
						{draft.updatedAt.toLocaleString("ko-KR")}
					</p>
					<div className="flex gap-2">
						<Button
							disabled={historyCount === 0}
							onClick={onCancel}
							variant="outline"
						>
							취소
						</Button>
						<Button onClick={onSave}>
							<Save />
							저장
						</Button>
					</div>
				</div>
			</CardContent>
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingType(null);
					}
				}}
				open={pendingType !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>팝업 유형을 전환할까요?</AlertDialogTitle>
						<AlertDialogDescription>
							전환 후 저장하면 기존 내용은 삭제됩니다. 취소하면 서버 저장본이
							유지됩니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingType) {
									applyType(pendingType);
								}
								setPendingType(null);
							}}
							variant="destructive"
						>
							전환
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
}
