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
import { Slider } from "@bambi-app/ui/components/slider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowDown,
	ArrowUp,
	Copy,
	Crop,
	Download,
	Ellipsis,
	ImagePlus,
	RotateCcw,
	Save,
	Trash2,
	Undo2,
} from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import {
	anchoredResizeOffsets,
	type CrawledImageAsset,
	type CrawledImageDocument,
	type CrawledImageItem,
	cleanUnusedAssets,
	cloneImageDocument,
	crawledImageDocumentSizeError,
	crawledImageSaveErrorMessage,
	duplicateItems,
	imageExtension,
	imageMime,
	moveItems,
	type ResizeHandle,
	resizeDimensionsFromHandleDrag,
	resizeItemDimensions,
	resizeItems,
} from "@/lib/bambi/crawled-image-editor";
import { orpc } from "@/utils/orpc";
import { CropDialog } from "./crop-dialog";

interface CrawledImageEditorProps {
	postId: string;
	returnHref: Route;
}
interface Snapshot {
	dirty: boolean;
	document: CrawledImageDocument;
	useOriginalFallback: boolean;
}
interface MenuPosition {
	x: number;
	y: number;
}

const HISTORY_LIMIT = 50;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_ITEMS = 60;
const RESIZE_HANDLES: ResizeHandle[] = [
	"nw",
	"n",
	"ne",
	"e",
	"se",
	"s",
	"sw",
	"w",
];

const resizeHandleClass = (handle: ResizeHandle): string => {
	const edgeClasses: Partial<Record<ResizeHandle, string>> = {
		e: "top-5 -right-2 bottom-5 w-5 cursor-ew-resize bg-transparent",
		n: "-top-2 right-5 left-5 h-5 cursor-ns-resize bg-transparent",
		s: "right-5 -bottom-2 left-5 h-5 cursor-ns-resize bg-transparent",
		w: "top-5 bottom-5 -left-2 w-5 cursor-ew-resize bg-transparent",
	};
	const edgeClass = edgeClasses[handle];
	if (edgeClass) {
		return `absolute z-20 touch-none border-0 ${edgeClass}`;
	}
	return `absolute z-20 size-5 touch-none rounded-full border-2 border-white bg-primary ${handle === "nw" || handle === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"} ${handle.includes("n") ? "-top-2" : "-bottom-2"} ${handle.includes("w") ? "-left-2" : "-right-2"}`;
};

const resizeEdgeMarkerClass = (handle: ResizeHandle): string =>
	handle === "n" || handle === "s"
		? "pointer-events-none absolute top-1/2 left-1/2 h-3 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary"
		: "pointer-events-none absolute top-1/2 left-1/2 h-5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary";

const readFileAsDataUrl = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
		reader.onload = () => resolve(String(reader.result));
		reader.readAsDataURL(file);
	});

const readImageSize = async (
	dataUrl: string
): Promise<{ height: number; width: number }> => {
	const image = new window.Image();
	image.src = dataUrl;
	await image.decode();
	return { height: image.naturalHeight, width: image.naturalWidth };
};

const downloadAsset = (
	asset: CrawledImageAsset,
	postId: string,
	index: number
) => {
	const link = document.createElement("a");
	link.download = `수집공고-${postId}-이미지-${index + 1}.${imageExtension(asset.dataUrl)}`;
	link.href = asset.dataUrl;
	link.click();
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 한 편집 세션의 선택·undo·파일·저장 상태를 조율하는 최상위 경계다.
export function CrawledImageEditor({
	postId,
	returnHref,
}: CrawledImageEditorProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const resizeRef = useRef<{
		handle: ResizeHandle;
		itemId: string;
		pointerId: number;
		startHeight: number;
		startOffsetX: number;
		startOffsetY: number;
		startWidth: number;
		startX: number;
		startY: number;
	} | null>(null);
	const widthEditSnapshotRef = useRef<Snapshot | null>(null);
	const dragItemIdRef = useRef<string | null>(null);
	const anchorIdRef = useRef<string | null>(null);
	const [documentState, setDocumentState] =
		useState<CrawledImageDocument | null>(null);
	const [useOriginalFallback, setUseOriginalFallback] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [revision, setRevision] = useState(0);
	const [history, setHistory] = useState<Snapshot[]>([]);
	const [clipboard, setClipboard] = useState<CrawledImageItem[]>([]);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
	const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
	const [cropItemId, setCropItemId] = useState<string | null>(null);
	const [showCancelConfirm, setShowCancelConfirm] = useState(false);
	const [lastEditor, setLastEditor] = useState<{
		at: Date | null;
		name: string | null;
	}>({ at: null, name: null });

	const editQuery = useQuery(
		orpc.bambi.crawler.getPostImagesForEdit.queryOptions({
			input: { id: postId },
		})
	);
	useEffect(() => {
		if (!editQuery.data || documentState) {
			return;
		}
		const initial = cloneImageDocument(
			editQuery.data.document as CrawledImageDocument
		);
		const originalFallback = !editQuery.data.hasEditedDocument;
		setDocumentState(initial);
		setUseOriginalFallback(originalFallback);
		setRevision(editQuery.data.detailImageEditRevision);
		setLastEditor({
			at: editQuery.data.detailImagesEditedAt,
			name: editQuery.data.detailImagesEditedByName,
		});
		setDirty(false);
	}, [documentState, editQuery.data]);
	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!dirty) {
				return;
			}
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [dirty]);
	useEffect(() => {
		if (!menuPosition) {
			return;
		}
		const closeMenu = (event: PointerEvent) => {
			if (
				!(
					event.target instanceof Element &&
					event.target.closest("[data-image-menu]")
				)
			) {
				setMenuPosition(null);
			}
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setMenuPosition(null);
			}
		};
		window.addEventListener("pointerdown", closeMenu);
		window.addEventListener("keydown", closeOnEscape);
		return () => {
			window.removeEventListener("pointerdown", closeMenu);
			window.removeEventListener("keydown", closeOnEscape);
		};
	}, [menuPosition]);
	useEffect(() => {
		const stopResize = () => {
			resizeRef.current = null;
		};
		window.addEventListener("pointerup", stopResize);
		window.addEventListener("pointercancel", stopResize);
		return () => {
			window.removeEventListener("pointerup", stopResize);
			window.removeEventListener("pointercancel", stopResize);
		};
	}, []);

	const pushHistory = useCallback(() => {
		if (!documentState) {
			return;
		}
		setHistory((current) => [
			...current.slice(-(HISTORY_LIMIT - 1)),
			{ dirty, document: documentState, useOriginalFallback },
		]);
	}, [dirty, documentState, useOriginalFallback]);

	const applyChange = useCallback(
		(next: CrawledImageDocument, originalFallback = false) => {
			pushHistory();
			setDocumentState(next);
			setUseOriginalFallback(originalFallback);
			setDirty(true);
			setMenuPosition(null);
		},
		[pushHistory]
	);

	const saveMutation = useMutation(
		orpc.bambi.crawler.updatePostImages.mutationOptions({
			onError: (error) =>
				toast.error(crawledImageSaveErrorMessage(error.message)),
			onSuccess: async (result) => {
				if (!documentState) {
					return;
				}
				setRevision(result.detailImageEditRevision);
				setLastEditor({
					at: result.detailImagesEditedAt,
					name: result.detailImagesEditedByName,
				});
				setHistory([]);
				setClipboard([]);
				setDirty(false);
				toast.success("이미지 편집 결과를 저장했습니다.");
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.crawler.getPostImagesForEdit.queryKey({
							input: { id: postId },
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.crawledJobs.getById.queryKey({
							input: { id: postId },
						}),
					}),
				]);
				router.replace(returnHref);
			},
		})
	);

	const selectedItems = useMemo(
		() => documentState?.items.filter((item) => selectedIds.has(item.id)) ?? [],
		[documentState, selectedIds]
	);
	const selectedItem = selectedItems.length === 1 ? selectedItems[0] : null;
	const selectedAsset = selectedItem
		? (documentState?.assets.find(
				(asset) => asset.id === selectedItem.assetId
			) ?? null)
		: null;
	const resizeItem = selectedItems[0] ?? null;
	const resizeAsset = resizeItem
		? (documentState?.assets.find((asset) => asset.id === resizeItem.assetId) ??
			null)
		: null;
	const resizeWidth = resizeItem?.displayWidthPx ?? resizeAsset?.width ?? 0;
	const resizeHeight =
		resizeItem?.displayHeightPx ??
		(resizeAsset
			? Math.round((resizeWidth * resizeAsset.height) / resizeAsset.width)
			: 0);
	const cropAsset =
		cropItemId && documentState
			? (documentState.assets.find(
					(asset) =>
						asset.id ===
						documentState.items.find((item) => item.id === cropItemId)?.assetId
				) ?? null)
			: null;

	const selectItem = (
		itemId: string,
		event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }
	) => {
		if (!documentState) {
			return;
		}
		if (event.shiftKey && anchorIdRef.current) {
			const start = documentState.items.findIndex(
				(item) => item.id === anchorIdRef.current
			);
			const end = documentState.items.findIndex((item) => item.id === itemId);
			if (start >= 0 && end >= 0) {
				setSelectedIds(
					new Set(
						documentState.items
							.slice(Math.min(start, end), Math.max(start, end) + 1)
							.map((item) => item.id)
					)
				);
			}
			return;
		}
		anchorIdRef.current = itemId;
		setSelectedIds((current) => {
			if (!(event.ctrlKey || event.metaKey)) {
				return new Set([itemId]);
			}
			const next = new Set(current);
			if (next.has(itemId)) {
				next.delete(itemId);
			} else {
				next.add(itemId);
			}
			return next;
		});
	};

	const copySelection = useCallback(() => {
		if (selectedItems.length === 0) {
			return;
		}
		setClipboard(selectedItems.map((item) => ({ ...item })));
		setMenuPosition(null);
		toast.success(`${selectedItems.length}장을 복사했습니다.`);
	}, [selectedItems]);

	const pasteClipboard = useCallback(() => {
		const targetIndex =
			insertionIndex ?? (documentState?.items.length === 0 ? 0 : null);
		if (
			!documentState ||
			targetIndex === null ||
			clipboard.length === 0 ||
			documentState.items.length + clipboard.length > MAX_ITEMS
		) {
			return;
		}
		const result = duplicateItems(documentState, clipboard, targetIndex);
		applyChange(result.document);
		setSelectedIds(new Set(result.insertedIds));
		setInsertionIndex(targetIndex + result.insertedIds.length);
	}, [applyChange, clipboard, documentState, insertionIndex]);

	const deleteSelection = useCallback(() => {
		if (!documentState || selectedIds.size === 0) {
			return;
		}
		applyChange(
			cleanUnusedAssets({
				...documentState,
				items: documentState.items.filter((item) => !selectedIds.has(item.id)),
			})
		);
		setSelectedIds(new Set());
	}, [applyChange, documentState, selectedIds]);

	const undo = useCallback(() => {
		const previous = history.at(-1);
		if (!previous) {
			return;
		}
		setDocumentState(previous.document);
		setUseOriginalFallback(previous.useOriginalFallback);
		setDirty(previous.dirty);
		setHistory((current) => current.slice(0, -1));
		setMenuPosition(null);
	}, [history]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const command = event.ctrlKey || event.metaKey;
			if (command && event.key.toLowerCase() === "c") {
				event.preventDefault();
				copySelection();
			} else if (command && event.key.toLowerCase() === "v") {
				event.preventDefault();
				pasteClipboard();
			} else if (command && event.key.toLowerCase() === "a" && documentState) {
				event.preventDefault();
				setSelectedIds(new Set(documentState.items.map((item) => item.id)));
			} else if (command && event.key.toLowerCase() === "z") {
				event.preventDefault();
				undo();
			} else if (event.key === "Delete") {
				event.preventDefault();
				deleteSelection();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [copySelection, deleteSelection, documentState, pasteClipboard, undo]);

	if (editQuery.isLoading || !documentState) {
		return (
			<PageShell title="수집 공고 이미지 편집">
				<p>이미지를 불러오는 중입니다…</p>
			</PageShell>
		);
	}
	if (editQuery.isError) {
		return (
			<PageShell title="수집 공고 이미지 편집">
				<EmptyState
					description="수집됨 상태의 공고만 편집할 수 있습니다."
					title="공고 이미지를 불러오지 못했습니다"
				/>
			</PageShell>
		);
	}

	const previewWidth = (width: number) => {
		if (!widthEditSnapshotRef.current) {
			widthEditSnapshotRef.current = {
				dirty,
				document: documentState,
				useOriginalFallback,
			};
		}
		setDocumentState(resizeItems(documentState, selectedIds, width));
		setUseOriginalFallback(false);
		setDirty(true);
	};
	const commitWidth = () => {
		const snapshot = widthEditSnapshotRef.current;
		if (!snapshot) {
			return;
		}
		setHistory((current) => [...current.slice(-(HISTORY_LIMIT - 1)), snapshot]);
		widthEditSnapshotRef.current = null;
	};
	const moveSelection = (direction: -1 | 1) =>
		applyChange(moveItems(documentState, selectedIds, direction));
	const openCrop = () => {
		if (!(selectedItem && selectedAsset)) {
			return;
		}
		if (imageMime(selectedAsset.dataUrl) === "image/gif") {
			toast.error("GIF 이미지는 자를 수 없어요.");
			return;
		}
		setCropItemId(selectedItem.id);
		setMenuPosition(null);
	};

	return (
		<PageShell
			description="크롤링 원본은 보존되며 저장한 편집본만 구직자 상세 화면에 반영됩니다."
			title="수집 공고 이미지 편집"
		>
			<div className="flex flex-col gap-4">
				<Card>
					<CardHeader>
						<CardTitle>{editQuery.data?.title}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
						<span>
							{lastEditor.at
								? `마지막 편집: ${lastEditor.name ?? "알 수 없는 운영자"} · ${new Date(lastEditor.at).toLocaleString("ko-KR")}`
								: "아직 편집한 운영자가 없습니다."}
						</span>
						<div className="flex flex-wrap gap-2">
							<Button
								onClick={() => {
									if (
										insertionIndex === null &&
										documentState.items.length > 0
									) {
										toast.error("이미지를 추가할 위치를 먼저 클릭하세요.");
										return;
									}
									fileInputRef.current?.click();
								}}
								variant="outline"
							>
								<ImagePlus />
								이미지 추가
							</Button>
							<Button
								onClick={async () => {
									const original = await queryClient.fetchQuery(
										orpc.bambi.crawler.getOriginalPostImagesForEdit.queryOptions(
											{ input: { id: postId } }
										)
									);
									applyChange(original as CrawledImageDocument, true);
									setSelectedIds(new Set());
									setInsertionIndex(null);
								}}
								variant="outline"
							>
								<RotateCcw />
								원본으로 초기화
							</Button>
							<Button
								disabled={history.length === 0}
								onClick={undo}
								variant="outline"
							>
								<Undo2 />
								실행 취소
							</Button>
						</div>
						<input
							accept="image/jpeg,image/png,image/gif,image/webp"
							className="hidden"
							onChange={async (event) => {
								const file = event.target.files?.[0];
								event.target.value = "";
								const targetIndex =
									insertionIndex ??
									(documentState.items.length === 0 ? 0 : null);
								if (!file || targetIndex === null) {
									return;
								}
								if (
									file.size > MAX_ASSET_BYTES ||
									![
										"image/jpeg",
										"image/png",
										"image/gif",
										"image/webp",
									].includes(file.type)
								) {
									toast.error(
										"JPEG·PNG·GIF·WebP 8MB 이하 파일만 추가할 수 있습니다."
									);
									return;
								}
								const dataUrl = await readFileAsDataUrl(file);
								const size = await readImageSize(dataUrl);
								const asset = { dataUrl, ...size, id: crypto.randomUUID() };
								const item = {
									assetId: asset.id,
									displayHeightPx: null,
									displayWidthPx: null,
									id: crypto.randomUUID(),
									offsetX: 0,
									offsetY: 0,
								};
								const items = [...documentState.items];
								items.splice(targetIndex, 0, item);
								applyChange({
									assets: [...documentState.assets, asset],
									items,
									version: 1,
								});
								setSelectedIds(new Set([item.id]));
								setInsertionIndex(targetIndex + 1);
							}}
							ref={fileInputRef}
							type="file"
						/>
					</CardContent>
				</Card>

				{resizeAsset && resizeItem ? (
					<Card>
						<CardContent className="grid items-center gap-3 pt-6 md:grid-cols-[auto_1fr_110px_auto]">
							<span className="font-medium text-sm">
								{selectedItems.length > 1
									? `${selectedItems.length}장 일괄 크기`
									: "표시 크기"}{" "}
								{resizeWidth} × {resizeHeight} px
							</span>
							<Slider
								aria-label="이미지 표시 너비"
								max={resizeAsset.width}
								min={Math.min(50, resizeAsset.width)}
								onValueChange={(value) => {
									const width = Array.isArray(value) ? value[0] : value;
									if (typeof width === "number") {
										previewWidth(width);
									}
								}}
								onValueCommitted={commitWidth}
								value={resizeWidth}
							/>
							<Input
								aria-label="표시 너비 px"
								max={resizeAsset.width}
								min={Math.min(50, resizeAsset.width)}
								onBlur={commitWidth}
								onChange={(event) => previewWidth(Number(event.target.value))}
								type="number"
								value={resizeWidth}
							/>
							<div className="flex gap-1">
								<Button
									aria-label="위로 이동"
									onClick={() => moveSelection(-1)}
									size="icon-sm"
									variant="outline"
								>
									<ArrowUp />
								</Button>
								<Button
									aria-label="아래로 이동"
									onClick={() => moveSelection(1)}
									size="icon-sm"
									variant="outline"
								>
									<ArrowDown />
								</Button>
							</div>
						</CardContent>
					</Card>
				) : null}

				<Card>
					<CardContent
						className="pt-6"
						onClick={() => {
							setSelectedIds(new Set());
							setInsertionIndex(null);
							anchorIdRef.current = null;
						}}
					>
						{documentState.items.length === 0 ? (
							<EmptyState
								description="이미지를 추가하거나 원본으로 초기화할 수 있습니다. 이 상태로 저장하면 공개 상세에는 이미지가 보이지 않습니다."
								title="상세 이미지가 없습니다"
							/>
						) : (
							<div className="flex flex-col gap-2">
								{documentState.items.map((item, index) => {
									const asset = documentState.assets.find(
										(candidate) => candidate.id === item.assetId
									);
									if (!asset) {
										return null;
									}
									const selected = selectedIds.has(item.id);
									const width = item.displayWidthPx ?? asset.width;
									const height =
										item.displayHeightPx ??
										Math.round((width * asset.height) / asset.width);
									return (
										<div key={item.id}>
											<button
												aria-label={`이미지 ${index + 1} 앞에 삽입 위치 지정`}
												aria-pressed={insertionIndex === index}
												className="flex h-5 w-full items-center justify-center border-0 bg-transparent outline-none focus:outline-none focus-visible:outline-none"
												onClick={(event) => {
													event.stopPropagation();
													setSelectedIds(new Set());
													setInsertionIndex(index);
													anchorIdRef.current = null;
													event.currentTarget.blur();
												}}
												type="button"
											>
												{insertionIndex === index ? (
													<span className="h-4 w-0.5 animate-pulse bg-primary" />
												) : null}
											</button>
											<div
												aria-selected={selected}
												className="group relative mx-auto flex justify-center p-2"
												draggable
												onDragOver={(event) => event.preventDefault()}
												onDragStart={() => {
													dragItemIdRef.current = item.id;
												}}
												onDrop={() => {
													const sourceId = dragItemIdRef.current;
													if (!sourceId || sourceId === item.id) {
														return;
													}
													pushHistory();
													const items = [...documentState.items];
													const from = items.findIndex(
														(candidate) => candidate.id === sourceId
													);
													const to = items.findIndex(
														(candidate) => candidate.id === item.id
													);
													const [moved] = items.splice(from, 1);
													if (moved) {
														items.splice(to, 0, moved);
													}
													setDocumentState({ ...documentState, items });
													setUseOriginalFallback(false);
													setDirty(true);
												}}
												role="option"
												style={{ marginBottom: item.offsetY }}
												tabIndex={-1}
											>
												<div
													className={`relative max-w-full ${selected ? "ring-2 ring-primary" : ""}`}
													style={{
														aspectRatio:
															item.displayHeightPx === null
																? undefined
																: `${width} / ${height}`,
														transform: `translate(${item.offsetX}px, ${item.offsetY}px)`,
														width,
													}}
												>
													<Image
														alt={`${editQuery.data?.title} 상세 이미지 ${index + 1}`}
														className={`${item.displayHeightPx === null ? "h-auto" : "h-full"} w-full max-w-full select-none rounded`}
														height={asset.height}
														src={asset.dataUrl}
														unoptimized
														width={asset.width}
													/>
													<button
														aria-label={`이미지 ${index + 1} 선택`}
														className="absolute inset-0 z-10 cursor-default bg-transparent"
														onClick={(event) => {
															event.stopPropagation();
															setInsertionIndex(null);
															selectItem(item.id, event);
														}}
														onContextMenu={(event) => {
															event.preventDefault();
															if (!selected) {
																setSelectedIds(new Set([item.id]));
															}
															setMenuPosition({
																x: event.clientX,
																y: event.clientY,
															});
														}}
														type="button"
													/>
													{selected
														? RESIZE_HANDLES.map((handle) => (
																<button
																	aria-label={`${index + 1}번 이미지 ${handle} 크기 조절`}
																	className={resizeHandleClass(handle)}
																	key={handle}
																	onClick={(event) => {
																		event.stopPropagation();
																	}}
																	onLostPointerCapture={() => {
																		resizeRef.current = null;
																	}}
																	onPointerCancel={() => {
																		resizeRef.current = null;
																	}}
																	onPointerDown={(event) => {
																		if (event.button !== 0) {
																			return;
																		}
																		event.preventDefault();
																		event.stopPropagation();
																		event.currentTarget.setPointerCapture(
																			event.pointerId
																		);
																		const bounds =
																			event.currentTarget.parentElement?.getBoundingClientRect();
																		setSelectedIds(new Set([item.id]));
																		anchorIdRef.current = item.id;
																		pushHistory();
																		resizeRef.current = {
																			handle,
																			itemId: item.id,
																			pointerId: event.pointerId,
																			startHeight: bounds?.height ?? height,
																			startOffsetX: item.offsetX,
																			startOffsetY: item.offsetY,
																			startWidth: bounds?.width ?? width,
																			startX: event.clientX,
																			startY: event.clientY,
																		};
																	}}
																	onPointerMove={(event) => {
																		const resize = resizeRef.current;
																		if (
																			!resize ||
																			resize.pointerId !== event.pointerId ||
																			event.buttons !== 1
																		) {
																			resizeRef.current = null;
																			return;
																		}
																		const resizedDocument =
																			resizeItemDimensions(
																				documentState,
																				new Set([resize.itemId]),
																				resizeDimensionsFromHandleDrag({
																					deltaX: event.clientX - resize.startX,
																					deltaY: event.clientY - resize.startY,
																					handle: resize.handle,
																					startHeight: resize.startHeight,
																					startWidth: resize.startWidth,
																				}),
																				resize.handle.length === 2
																			);
																		const resizedItem =
																			resizedDocument.items.find(
																				(candidate) =>
																					candidate.id === resize.itemId
																			);
																		if (!resizedItem) {
																			return;
																		}
																		const nextWidth =
																			resizedItem.displayWidthPx ?? width;
																		const nextHeight =
																			resizedItem.displayHeightPx ?? height;
																		const offsets = anchoredResizeOffsets({
																			handle: resize.handle,
																			nextHeight,
																			nextWidth,
																			startHeight: resize.startHeight,
																			startOffsetX: resize.startOffsetX,
																			startOffsetY: resize.startOffsetY,
																			startWidth: resize.startWidth,
																		});
																		setDocumentState({
																			...resizedDocument,
																			items: resizedDocument.items.map(
																				(candidate) =>
																					candidate.id === resize.itemId
																						? { ...candidate, ...offsets }
																						: candidate
																			),
																		});
																		setUseOriginalFallback(false);
																		setDirty(true);
																	}}
																	onPointerUp={() => {
																		resizeRef.current = null;
																	}}
																	type="button"
																>
																	{handle.length === 1 ? (
																		<span
																			className={resizeEdgeMarkerClass(handle)}
																		/>
																	) : null}
																</button>
															))
														: null}
												</div>
												<Button
													aria-label={`이미지 ${index + 1} 메뉴`}
													className="absolute top-3 right-3 md:hidden"
													onClick={(event) => {
														event.stopPropagation();
														setSelectedIds(new Set([item.id]));
														const bounds =
															event.currentTarget.getBoundingClientRect();
														setMenuPosition({
															x: bounds.right,
															y: bounds.bottom,
														});
													}}
													size="icon-sm"
													variant="secondary"
												>
													<Ellipsis />
												</Button>
											</div>
										</div>
									);
								})}
								<button
									aria-label="마지막 삽입 위치 지정"
									aria-pressed={insertionIndex === documentState.items.length}
									className="flex h-5 w-full items-center justify-center border-0 bg-transparent outline-none focus:outline-none focus-visible:outline-none"
									onClick={(event) => {
										event.stopPropagation();
										setSelectedIds(new Set());
										setInsertionIndex(documentState.items.length);
										anchorIdRef.current = null;
										event.currentTarget.blur();
									}}
									type="button"
								>
									{insertionIndex === documentState.items.length ? (
										<span className="h-4 w-0.5 animate-pulse bg-primary" />
									) : null}
								</button>
							</div>
						)}
					</CardContent>
				</Card>

				<div className="sticky bottom-4 flex justify-end gap-2 rounded-lg bg-background/95 p-3 shadow-lg ring-1 ring-border backdrop-blur">
					<Button
						onClick={() => {
							if (dirty) {
								setShowCancelConfirm(true);
							} else {
								router.push(returnHref);
							}
						}}
						variant="outline"
					>
						취소
					</Button>
					<Button
						disabled={!dirty || saveMutation.isPending}
						onClick={() => {
							const document = useOriginalFallback
								? null
								: cleanUnusedAssets(documentState);
							const sizeError = document
								? crawledImageDocumentSizeError(document)
								: null;
							if (sizeError) {
								toast.error(sizeError);
								return;
							}
							saveMutation.mutate({
								document,
								expectedRevision: revision,
								id: postId,
							});
						}}
					>
						<Save />
						{saveMutation.isPending ? "저장 중…" : "저장"}
					</Button>
				</div>
			</div>

			{menuPosition ? (
				<div
					className="fixed z-50 grid min-w-48 rounded-lg border bg-popover p-1 shadow-lg"
					data-image-menu
					style={{
						left: Math.min(menuPosition.x, window.innerWidth - 210),
						top: Math.min(menuPosition.y, window.innerHeight - 330),
					}}
				>
					<Button
						disabled={selectedItems.length !== 1}
						onClick={openCrop}
						variant="ghost"
					>
						<Crop />
						자르기
					</Button>
					<Button
						disabled={selectedItems.length === 0}
						onClick={copySelection}
						variant="ghost"
					>
						<Copy />
						복사
					</Button>
					<Button
						disabled={
							(insertionIndex === null && documentState.items.length > 0) ||
							clipboard.length === 0 ||
							documentState.items.length + clipboard.length > MAX_ITEMS
						}
						onClick={pasteClipboard}
						variant="ghost"
					>
						<Copy />
						붙여넣기
					</Button>
					<Button
						disabled={documentState.items.length === 0}
						onClick={() => {
							setSelectedIds(
								new Set(documentState.items.map((item) => item.id))
							);
							setMenuPosition(null);
						}}
						variant="ghost"
					>
						전체 선택
					</Button>
					<Button
						disabled={!selectedAsset || selectedItems.length !== 1}
						onClick={() => {
							if (selectedAsset && selectedItem) {
								downloadAsset(
									selectedAsset,
									postId,
									documentState.items.indexOf(selectedItem)
								);
							}
							setMenuPosition(null);
						}}
						variant="ghost"
					>
						<Download />
						다른 이름으로 저장
					</Button>
					<Button
						disabled={selectedItems.length === 0}
						onClick={deleteSelection}
						variant="ghost"
					>
						<Trash2 />
						삭제
					</Button>
					<Button
						disabled={history.length === 0}
						onClick={undo}
						variant="ghost"
					>
						<Undo2 />
						실행 취소
					</Button>
				</div>
			) : null}

			<CropDialog
				asset={cropAsset}
				onClose={() => setCropItemId(null)}
				onComplete={(newAsset) => {
					if (!cropItemId) {
						return;
					}
					const item = documentState.items.find(
						(candidate) => candidate.id === cropItemId
					);
					if (!item) {
						return;
					}
					applyChange(
						cleanUnusedAssets({
							assets: [...documentState.assets, newAsset],
							items: documentState.items.map((candidate) =>
								candidate.id === cropItemId
									? {
											...candidate,
											assetId: newAsset.id,
											displayHeightPx:
												candidate.displayHeightPx === null
													? null
													: Math.min(
															candidate.displayHeightPx,
															newAsset.height
														),
											displayWidthPx:
												candidate.displayWidthPx === null
													? null
													: Math.min(candidate.displayWidthPx, newAsset.width),
											offsetX: Math.max(
												-newAsset.width,
												Math.min(newAsset.width, candidate.offsetX)
											),
											offsetY: Math.max(
												-newAsset.height,
												Math.min(newAsset.height, candidate.offsetY)
											),
										}
									: candidate
							),
							version: 1,
						})
					);
					setCropItemId(null);
				}}
			/>
			<AlertDialog onOpenChange={setShowCancelConfirm} open={showCancelConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>저장하지 않고 나갈까요?</AlertDialogTitle>
						<AlertDialogDescription>
							현재 편집 화면의 모든 변경이 사라집니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>계속 편집</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setShowCancelConfirm(false);
								router.replace(returnHref);
							}}
							variant="destructive"
						>
							변경 버리기
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageShell>
	);
}
