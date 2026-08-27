"use client";

import {
	formatProbabilityPercent,
	PROBABILITY_PERCENT_DECIMAL_PLACES,
	PROBABILITY_UNITS_PER_PERCENT,
	parseProbabilityPercent,
	resolvePrizeProbabilities,
	TOTAL_PROBABILITY_UNITS,
} from "@bambi-app/api/services/bambi-point-draw";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { Button } from "@bambi-app/ui/components/button";
import { Card } from "@bambi-app/ui/components/card";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	GripVerticalIcon,
	Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";

const moveItem = <T,>(items: readonly T[], from: number, to: number): T[] => {
	const next = [...items];
	const [moving] = next.splice(from, 1);
	if (moving === undefined) {
		return next;
	}
	next.splice(Math.max(0, Math.min(to, next.length)), 0, moving);
	return next;
};

interface PrizeDraft {
	draftId: string;
	id: null | string;
	isActive: boolean;
	points: string;
	probabilityPercent: string;
}

const prizeDraftSignature = (drafts: readonly PrizeDraft[]): string =>
	JSON.stringify(
		drafts.map(({ id, isActive, points, probabilityPercent }) => ({
			id,
			isActive,
			points,
			probabilityPercent,
		}))
	);

const updatePrizeDraft = (
	drafts: readonly PrizeDraft[],
	draftId: string,
	update: Partial<Omit<PrizeDraft, "draftId" | "id">>
): PrizeDraft[] =>
	drafts.map((draft) =>
		draft.draftId === draftId ? { ...draft, ...update } : draft
	);

const probabilityInputValid = (value: string): boolean => {
	if (value.trim() === "") {
		return true;
	}
	const units = parseProbabilityPercent(value);
	return units !== null && units > 0 && units <= TOTAL_PROBABILITY_UNITS;
};

const resolvePrizeDraftState = (drafts: readonly PrizeDraft[]) => {
	const parsedDrafts = drafts.map((draft) => {
		const points = Number(draft.points);
		const probabilityUnits =
			draft.probabilityPercent.trim() === ""
				? null
				: parseProbabilityPercent(draft.probabilityPercent);
		return {
			...draft,
			points,
			probabilityUnits,
			valid:
				Number.isInteger(points) &&
				points > 0 &&
				probabilityInputValid(draft.probabilityPercent),
		};
	});
	const draftsValid = parsedDrafts.every((draft) => draft.valid);
	const activePrizes = parsedDrafts
		.filter((prize) => prize.isActive && prize.valid)
		.map((prize) => ({
			id: prize.draftId,
			points: prize.points,
			probabilityUnits: prize.probabilityUnits,
		}));
	let error: null | string = draftsValid
		? null
		: `당첨 포인트는 1 이상의 정수, 당첨 확률은 0% 초과 100% 이하의 소수점 ${PROBABILITY_PERCENT_DECIMAL_PLACES}자리 이내 숫자로 입력해 주세요.`;
	let resolvedPrizes: ReturnType<typeof resolvePrizeProbabilities> = [];
	if (error === null && activePrizes.length > 0) {
		try {
			resolvedPrizes = resolvePrizeProbabilities(activePrizes);
		} catch (caughtError) {
			error =
				caughtError instanceof Error
					? caughtError.message
					: "당첨 확률 설정을 확인해 주세요.";
		}
	}
	return {
		activePrizes,
		appliedProbabilityById: new Map(
			resolvedPrizes.map((prize) => [prize.id, prize.appliedProbabilityUnits])
		),
		draftsValid,
		error,
		fixedProbabilityUnits: activePrizes.reduce(
			(sum, prize) => sum + (prize.probabilityUnits ?? 0),
			0
		),
		parsedDrafts,
	};
};

interface FeaturedItemRowProps {
	canMoveDown: boolean;
	canMoveUp: boolean;
	isFeatured: boolean;
	item: { id: string; name: string };
	onDragStart: () => void;
	onDrop: () => void;
	onMoveDown: () => void;
	onMoveUp: () => void;
	onToggle: (checked: boolean) => void;
}

function FeaturedItemRow({
	canMoveDown,
	canMoveUp,
	isFeatured,
	item,
	onDragStart,
	onDrop,
	onMoveDown,
	onMoveUp,
	onToggle,
}: FeaturedItemRowProps): React.JSX.Element {
	return (
		/* biome-ignore lint/a11y/useSemanticElements: draggable composite row contains a switch and move buttons */
		<div
			className="flex items-center gap-2 rounded-lg border border-border p-3"
			draggable={isFeatured}
			onDragOver={(event) => event.preventDefault()}
			onDragStart={onDragStart}
			onDrop={onDrop}
			role="button"
			tabIndex={isFeatured ? 0 : -1}
		>
			<Switch checked={isFeatured} onCheckedChange={onToggle} />
			<span className="flex-1 font-semibold text-sm">{item.name}</span>
			<div
				aria-hidden={!isFeatured}
				className={`flex gap-1 ${isFeatured ? "" : "invisible"}`}
			>
				<Button
					aria-label="인기상품 위로"
					disabled={!(isFeatured && canMoveUp)}
					onClick={onMoveUp}
					size="icon-sm"
					variant="ghost"
				>
					<ArrowUpIcon />
				</Button>
				<Button
					aria-label="인기상품 아래로"
					disabled={!(isFeatured && canMoveDown)}
					onClick={onMoveDown}
					size="icon-sm"
					variant="ghost"
				>
					<ArrowDownIcon />
				</Button>
			</div>
		</div>
	);
}

export function CatalogSettings(): React.JSX.Element {
	const queryClient = useQueryClient();
	const layoutQuery = useQuery(
		orpc.bambi.pointShop.adminGetCatalogLayout.queryOptions()
	);
	const itemsQuery = useQuery(
		orpc.bambi.pointShop.adminListItems.queryOptions()
	);
	const prizesQuery = useQuery(
		orpc.bambi.pointDraw.adminListPrizes.queryOptions()
	);
	const productTypesQuery = useQuery(
		orpc.bambi.pointShop.adminListProductTypes.queryOptions()
	);
	const [rows, setRows] = useState<
		Array<{ categoryId: null | string; id: string }>
	>([]);
	const [newCategoryName, setNewCategoryName] = useState("");
	const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
	const [newPrizePoints, setNewPrizePoints] = useState("");
	const [newPrizeProbability, setNewPrizeProbability] = useState("");
	const [newProductTypeName, setNewProductTypeName] = useState("");
	const [editingProductTypeName, setEditingProductTypeName] = useState("");
	const [editingShowInInventory, setEditingShowInInventory] = useState(false);
	const [prizeDrafts, setPrizeDrafts] = useState<PrizeDraft[]>([]);
	const [savedPrizeSignature, setSavedPrizeSignature] = useState("");
	const [draggedIndex, setDraggedIndex] = useState<null | number>(null);
	const [draggedFeaturedId, setDraggedFeaturedId] = useState<null | string>(
		null
	);

	useEffect(() => {
		if (layoutQuery.data) {
			setRows(
				layoutQuery.data.rows.map((row) => ({
					categoryId: row.categoryId,
					id: row.id,
				}))
			);
		}
	}, [layoutQuery.data]);

	useEffect(() => {
		if (!prizesQuery.data) {
			return;
		}
		const drafts = prizesQuery.data.map((prize) => ({
			draftId: prize.id,
			id: prize.id,
			isActive: prize.isActive,
			points: String(prize.points),
			probabilityPercent:
				prize.probabilityUnits === null
					? ""
					: formatProbabilityPercent(prize.probabilityUnits),
		}));
		setPrizeDrafts(drafts);
		setSavedPrizeSignature(prizeDraftSignature(drafts));
	}, [prizesQuery.data]);

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.pointShop.key(),
		});
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.pointDraw.key(),
		});
	};
	const saveRows = useMutation(
		orpc.bambi.pointShop.adminSaveLayoutRows.mutationOptions({
			onSuccess: async () => {
				toast.success("포인트몰 위치를 저장했어요.");
				await invalidate();
			},
		})
	);
	const createCategory = useMutation(
		orpc.bambi.pointShop.adminCreateCategory.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				setNewCategoryName("");
				setCategoryDialogOpen(false);
				toast.success("분류를 만들었어요.");
				await invalidate();
			},
		})
	);
	const updateCategory = useMutation(
		orpc.bambi.pointShop.adminUpdateCategory.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: invalidate,
		})
	);
	const removeCategory = useMutation(
		orpc.bambi.pointShop.adminRemoveCategory.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: invalidate,
		})
	);
	const saveFeatured = useMutation(
		orpc.bambi.pointShop.adminSaveFeaturedItems.mutationOptions({
			onSuccess: invalidate,
		})
	);
	const createProductType = useMutation(
		orpc.bambi.pointShop.adminCreateProductType.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				setNewProductTypeName("");
				await invalidate();
			},
		})
	);
	const removeProductType = useMutation(
		orpc.bambi.pointShop.adminRemoveProductType.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: invalidate,
		})
	);
	const updateProductType = useMutation(
		orpc.bambi.pointShop.adminUpdateProductType.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				toast.success("상품 유형을 저장했어요.");
				await invalidate();
			},
		})
	);
	const savePrizes = useMutation(
		orpc.bambi.pointDraw.adminSavePrizes.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				toast.success("당첨 설정을 저장했어요.");
				await invalidate();
			},
		})
	);

	const categoryById = new Map(
		(layoutQuery.data?.categories ?? []).map((category) => [
			category.id,
			category,
		])
	);
	const rowPositionByCategoryId = new Map(
		rows.flatMap((row, position) =>
			row.categoryId === null ? [] : [[row.categoryId, position] as const]
		)
	);
	const managedCategories = [...(layoutQuery.data?.categories ?? [])].sort(
		(left, right) =>
			(rowPositionByCategoryId.get(left.id) ?? Number.POSITIVE_INFINITY) -
			(rowPositionByCategoryId.get(right.id) ?? Number.POSITIVE_INFINITY)
	);
	const featuredIds =
		layoutQuery.data?.featuredItems.map((item) => item.itemId) ?? [];
	const featuredSet = new Set(featuredIds);
	const activeItems = (itemsQuery.data ?? []).filter(
		(item) => item.isActive && item.pricePoints !== null
	);
	const {
		activePrizes,
		appliedProbabilityById,
		draftsValid: prizeDraftsValid,
		error: probabilityError,
		fixedProbabilityUnits,
		parsedDrafts: parsedPrizeDrafts,
	} = resolvePrizeDraftState(prizeDrafts);
	const prizeDraftsChanged =
		prizeDraftSignature(prizeDrafts) !== savedPrizeSignature;
	const newProbabilityValid = probabilityInputValid(newPrizeProbability);

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<Accordion>
					<AccordionItem className="border-0" value="layout">
						<AccordionTrigger className="px-6 py-5">
							포인트몰 위치 설정
						</AccordionTrigger>
						<AccordionContent className="flex flex-col gap-4 px-6 pb-5">
							<div className="flex flex-col gap-2">
								{rows.map((row, index) => {
									const category = row.categoryId
										? categoryById.get(row.categoryId)
										: null;
									return (
										/* biome-ignore lint/a11y/useSemanticElements: draggable composite row contains independent action buttons */
										<div
											className="flex items-center gap-2 rounded-lg border border-border p-3"
											draggable={index > 0}
											key={row.id}
											onDragOver={(event) => event.preventDefault()}
											onDragStart={() => setDraggedIndex(index)}
											onDrop={() => {
												if (
													draggedIndex !== null &&
													draggedIndex > 0 &&
													index > 0
												) {
													setRows(moveItem(rows, draggedIndex, index));
												}
												setDraggedIndex(null);
											}}
											onKeyDown={(event) => {
												if (event.key === "ArrowUp" && index > 1) {
													setRows(moveItem(rows, index, index - 1));
												}
												if (
													event.key === "ArrowDown" &&
													index > 0 &&
													index < rows.length - 1
												) {
													setRows(moveItem(rows, index, index + 1));
												}
											}}
											role="button"
											tabIndex={index > 0 ? 0 : -1}
										>
											<GripVerticalIcon className="size-4 text-muted-foreground" />
											<span className="w-12 text-muted-foreground text-xs">
												{index + 1}행
											</span>
											<span className="flex-1 font-semibold">
												{category?.name ?? "빈 행"}
											</span>
											{category?.kind === "featured" ? (
												<span className="text-muted-foreground text-xs">
													고정
												</span>
											) : null}
											<Button
												aria-label="위로"
												disabled={index <= 1}
												onClick={() =>
													setRows(moveItem(rows, index, index - 1))
												}
												size="icon-sm"
												variant="ghost"
											>
												<ArrowUpIcon />
											</Button>
											<Button
												aria-label="아래로"
												disabled={index === 0 || index >= rows.length - 1}
												onClick={() =>
													setRows(moveItem(rows, index, index + 1))
												}
												size="icon-sm"
												variant="ghost"
											>
												<ArrowDownIcon />
											</Button>
										</div>
									);
								})}
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									onClick={() => setCategoryDialogOpen(true)}
									variant="outline"
								>
									행 추가
								</Button>
								<Button
									disabled={saveRows.isPending || rows.length === 0}
									onClick={() =>
										saveRows.mutate({
											categoryIds: rows.map((row) => row.categoryId),
										})
									}
								>
									위치 저장
								</Button>
							</div>
							<div className="flex flex-col gap-2">
								{managedCategories.map((category) => (
									<div
										className="flex items-center gap-2 rounded-lg bg-muted/40 p-3"
										key={category.id}
									>
										<Input
											defaultValue={category.name}
											onBlur={(event) => {
												const name = event.target.value.trim();
												if (name && name !== category.name) {
													updateCategory.mutate({
														id: category.id,
														isActive: category.isActive,
														name,
													});
												}
											}}
										/>
										<Switch
											checked={category.isActive}
											onCheckedChange={(isActive) =>
												updateCategory.mutate({
													id: category.id,
													isActive,
													name: category.name,
												})
											}
										/>
										{category.kind === "featured" ? null : (
											<Button
												aria-label="분류 삭제"
												disabled={(itemsQuery.data ?? []).some(
													(item) => item.categoryId === category.id
												)}
												onClick={() =>
													removeCategory.mutate({ id: category.id })
												}
												size="icon-sm"
												variant="ghost"
											>
												<Trash2Icon />
											</Button>
										)}
									</div>
								))}
							</div>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</Card>

			<Card>
				<Accordion>
					<AccordionItem className="border-0" value="product-types">
						<AccordionTrigger className="px-6 py-5">
							상품 유형 설정
						</AccordionTrigger>
						<AccordionContent className="flex flex-col gap-3 px-6 pb-5">
							<div className="flex flex-col gap-2 sm:flex-row">
								<Input
									onChange={(event) =>
										setNewProductTypeName(event.target.value)
									}
									placeholder="새 상품 유형명"
									value={newProductTypeName}
								/>
								<Button
									disabled={!newProductTypeName.trim()}
									onClick={() =>
										createProductType.mutate({
											name: newProductTypeName.trim(),
										})
									}
								>
									유형 추가
								</Button>
							</div>
							<Accordion className="rounded-lg border border-border">
								{(productTypesQuery.data ?? []).map((type) => (
									<AccordionItem key={type.id} value={type.id}>
										<AccordionTrigger
											className="px-3 hover:no-underline"
											onClick={() => {
												setEditingProductTypeName(type.name);
												setEditingShowInInventory(type.showInInventory);
											}}
										>
											{type.name}
										</AccordionTrigger>
										<AccordionContent className="flex flex-col gap-3 px-3 pb-3">
											<div className="flex flex-col gap-2">
												<Label>유형명</Label>
												<Input
													onChange={(event) =>
														setEditingProductTypeName(event.target.value)
													}
													value={editingProductTypeName}
												/>
											</div>
											<div className="flex items-center gap-2">
												<Checkbox
													checked={editingShowInInventory}
													id={`product-type-inventory-${type.id}`}
													onCheckedChange={(checked) =>
														setEditingShowInInventory(checked === true)
													}
												/>
												<Label htmlFor={`product-type-inventory-${type.id}`}>
													내 아이템에 표시
												</Label>
											</div>
											<div className="flex justify-end gap-2">
												<Button
													onClick={() =>
														removeProductType.mutate({ id: type.id })
													}
													variant="destructive"
												>
													삭제
												</Button>
												<Button
													disabled={!editingProductTypeName.trim()}
													onClick={() =>
														updateProductType.mutate({
															id: type.id,
															name: editingProductTypeName.trim(),
															showInInventory: editingShowInInventory,
														})
													}
												>
													저장
												</Button>
											</div>
										</AccordionContent>
									</AccordionItem>
								))}
							</Accordion>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</Card>

			<Card>
				<Accordion>
					<AccordionItem className="border-0" value="featured">
						<AccordionTrigger className="px-6 py-5">
							인기상품 설정
						</AccordionTrigger>
						<AccordionContent className="flex flex-col gap-3 px-6 pb-5">
							{activeItems.map((item) => {
								const itemIndex = featuredIds.indexOf(item.id);
								const isFeatured = featuredSet.has(item.id);
								return (
									<FeaturedItemRow
										canMoveDown={itemIndex < featuredIds.length - 1}
										canMoveUp={itemIndex > 0}
										isFeatured={isFeatured}
										item={item}
										key={item.id}
										onDragStart={() => setDraggedFeaturedId(item.id)}
										onDrop={() => {
											if (draggedFeaturedId && isFeatured) {
												saveFeatured.mutate({
													itemIds: moveItem(
														featuredIds,
														featuredIds.indexOf(draggedFeaturedId),
														itemIndex
													),
												});
											}
											setDraggedFeaturedId(null);
										}}
										onMoveDown={() =>
											saveFeatured.mutate({
												itemIds: moveItem(
													featuredIds,
													itemIndex,
													itemIndex + 1
												),
											})
										}
										onMoveUp={() =>
											saveFeatured.mutate({
												itemIds: moveItem(
													featuredIds,
													itemIndex,
													itemIndex - 1
												),
											})
										}
										onToggle={(checked) =>
											saveFeatured.mutate({
												itemIds: checked
													? [...featuredIds, item.id]
													: featuredIds.filter((id) => id !== item.id),
											})
										}
									/>
								);
							})}
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</Card>

			<Card>
				<Accordion>
					<AccordionItem className="border-0" value="draw-prizes">
						<AccordionTrigger className="px-6 py-5">
							포인트 랜덤 뽑기 설정
						</AccordionTrigger>
						<AccordionContent className="flex flex-col gap-3 px-6 pb-5">
							<p className="m-0 text-muted-foreground text-sm">
								확률을 숫자로 직접 입력하세요. 비워 둔 활성 항목은 남은 확률을
								자동으로 똑같이 나눕니다. 변경 내용은 아래 저장 버튼을 눌러야
								반영됩니다.
							</p>
							{prizeDrafts.map((prize) => (
								<div
									className="grid grid-cols-1 items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
									key={prize.draftId}
								>
									<div className="flex flex-col gap-2">
										<Label className="px-3">당첨 포인트</Label>
										<Input
											onChange={(event) =>
												setPrizeDrafts((current) =>
													updatePrizeDraft(current, prize.draftId, {
														points: event.target.value,
													})
												)
											}
											type="number"
											value={prize.points}
										/>
									</div>
									<div className="flex flex-col gap-2">
										<Label className="px-3">
											당첨 확률(%) · 계산{" "}
											{prize.isActive &&
											appliedProbabilityById.has(prize.draftId)
												? `${formatProbabilityPercent(appliedProbabilityById.get(prize.draftId) ?? 0)}%`
												: "0%"}
										</Label>
										<Input
											min={1 / PROBABILITY_UNITS_PER_PERCENT}
											onChange={(event) =>
												setPrizeDrafts((current) =>
													updatePrizeDraft(current, prize.draftId, {
														probabilityPercent: event.target.value,
													})
												)
											}
											placeholder="자동 계산"
											step={1 / PROBABILITY_UNITS_PER_PERCENT}
											type="number"
											value={prize.probabilityPercent}
										/>
									</div>
									<Switch
										checked={prize.isActive}
										onCheckedChange={(isActive) =>
											setPrizeDrafts((current) =>
												updatePrizeDraft(current, prize.draftId, { isActive })
											)
										}
									/>
									<Button
										aria-label="당첨 설정 삭제"
										onClick={() =>
											setPrizeDrafts((current) =>
												current.filter((item) => item.draftId !== prize.draftId)
											)
										}
										size="icon-sm"
										variant="ghost"
									>
										<Trash2Icon />
									</Button>
								</div>
							))}
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
								<Input
									min={1}
									onChange={(event) => setNewPrizePoints(event.target.value)}
									placeholder="당첨 포인트"
									type="number"
									value={newPrizePoints}
								/>
								<Input
									aria-invalid={!newProbabilityValid}
									min={1 / PROBABILITY_UNITS_PER_PERCENT}
									onChange={(event) =>
										setNewPrizeProbability(event.target.value)
									}
									placeholder="당첨 확률(%) · 비우면 자동"
									step={1 / PROBABILITY_UNITS_PER_PERCENT}
									type="number"
									value={newPrizeProbability}
								/>
								<Button
									disabled={
										!(
											Number.isInteger(Number(newPrizePoints)) &&
											Number(newPrizePoints) > 0 &&
											newProbabilityValid
										)
									}
									onClick={() => {
										setPrizeDrafts((current) => [
											...current,
											{
												draftId: crypto.randomUUID(),
												id: null,
												isActive: true,
												points: newPrizePoints,
												probabilityPercent: newPrizeProbability,
											},
										]);
										setNewPrizePoints("");
										setNewPrizeProbability("");
									}}
								>
									당첨 항목 추가
								</Button>
							</div>
							{activePrizes.length === 0 ? (
								<p className="m-0 text-destructive text-sm">
									활성 당첨 항목이 없어 사용자 뽑기가 비활성화됩니다.
								</p>
							) : null}
							{activePrizes.length > 0 ? (
								<p
									className={`m-0 text-sm ${probabilityError ? "text-destructive" : "text-muted-foreground"}`}
								>
									{probabilityError ??
										`직접 입력 합계 ${formatProbabilityPercent(fixedProbabilityUnits)}% · 자동 계산 후 전체 100%`}
								</p>
							) : null}
							<div className="flex justify-end">
								<Button
									disabled={
										!(prizeDraftsChanged && prizeDraftsValid) ||
										probabilityError !== null ||
										savePrizes.isPending
									}
									onClick={() =>
										savePrizes.mutate({
											prizes: parsedPrizeDrafts.map((prize) => ({
												id: prize.id,
												isActive: prize.isActive,
												points: prize.points,
												probabilityUnits: prize.probabilityUnits,
											})),
										})
									}
								>
									당첨 설정 저장
								</Button>
							</div>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</Card>

			<Dialog onOpenChange={setCategoryDialogOpen} open={categoryDialogOpen}>
				<DialogContent>
					<DialogTitle>포인트몰 행 추가</DialogTitle>
					<DialogDescription>
						새 행의 이름을 입력하면 포인트몰 위치의 가장 아래에 추가됩니다.
					</DialogDescription>
					<div className="flex flex-col gap-2">
						<Label htmlFor="point-shop-new-row-name">행 이름</Label>
						<Input
							id="point-shop-new-row-name"
							maxLength={40}
							onChange={(event) => setNewCategoryName(event.target.value)}
							placeholder="예: 이벤트 상품"
							value={newCategoryName}
						/>
					</div>
					<div className="flex justify-end gap-2">
						<Button
							onClick={() => setCategoryDialogOpen(false)}
							variant="outline"
						>
							취소
						</Button>
						<Button
							disabled={!newCategoryName.trim() || createCategory.isPending}
							onClick={() =>
								createCategory.mutate({ name: newCategoryName.trim() })
							}
						>
							저장
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
