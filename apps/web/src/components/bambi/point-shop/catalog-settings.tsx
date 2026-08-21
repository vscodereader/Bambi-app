"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { Button } from "@bambi-app/ui/components/button";
import { Card } from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
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
	const [rows, setRows] = useState<
		Array<{ categoryId: null | string; id: string }>
	>([]);
	const [newCategoryName, setNewCategoryName] = useState("");
	const [newCategoryRow, setNewCategoryRow] = useState("last");
	const [newPrizePoints, setNewPrizePoints] = useState("");
	const [newPrizeWeight, setNewPrizeWeight] = useState("");
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
			onSuccess: async () => {
				setNewCategoryName("");
				setNewCategoryRow("last");
				toast.success("분류를 만들었어요.");
				await invalidate();
			},
		})
	);
	const updateCategory = useMutation(
		orpc.bambi.pointShop.adminUpdateCategory.mutationOptions({
			onSuccess: invalidate,
		})
	);
	const removeCategory = useMutation(
		orpc.bambi.pointShop.adminRemoveCategory.mutationOptions({
			onSuccess: invalidate,
		})
	);
	const saveFeatured = useMutation(
		orpc.bambi.pointShop.adminSaveFeaturedItems.mutationOptions({
			onSuccess: invalidate,
		})
	);
	const createPrize = useMutation(
		orpc.bambi.pointDraw.adminCreatePrize.mutationOptions({
			onSuccess: async () => {
				setNewPrizePoints("");
				setNewPrizeWeight("");
				await invalidate();
			},
		})
	);
	const updatePrize = useMutation(
		orpc.bambi.pointDraw.adminUpdatePrize.mutationOptions({
			onSuccess: invalidate,
		})
	);
	const removePrize = useMutation(
		orpc.bambi.pointDraw.adminRemovePrize.mutationOptions({
			onSuccess: invalidate,
		})
	);

	const categoryById = new Map(
		(layoutQuery.data?.categories ?? []).map((category) => [
			category.id,
			category,
		])
	);
	const featuredIds =
		layoutQuery.data?.featuredItems.map((item) => item.itemId) ?? [];
	const featuredSet = new Set(featuredIds);
	const activeItems = (itemsQuery.data ?? []).filter((item) => item.isActive);
	const totalWeight = (prizesQuery.data ?? [])
		.filter((prize) => prize.isActive)
		.reduce((sum, prize) => sum + prize.weight, 0);
	const emptyRowPositions = rows.flatMap((row, position) =>
		row.categoryId === null && position > 0 ? [position] : []
	);

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
									onClick={() =>
										setRows([
											...rows,
											{ categoryId: null, id: crypto.randomUUID() },
										])
									}
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
							<div className="flex flex-col gap-2 border-border border-t pt-4 sm:flex-row">
								<Input
									onChange={(event) => setNewCategoryName(event.target.value)}
									placeholder="새 분류 이름"
									value={newCategoryName}
								/>
								<Select
									items={[
										{ label: "마지막 행", value: "last" },
										...emptyRowPositions.map((position) => ({
											label: `${position + 1}행`,
											value: String(position),
										})),
									]}
									onValueChange={(value) => value && setNewCategoryRow(value)}
									value={newCategoryRow}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="last">마지막 행</SelectItem>
										{emptyRowPositions.map((position) => (
											<SelectItem key={position} value={String(position)}>
												{position + 1}행
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									disabled={!newCategoryName.trim()}
									onClick={() =>
										createCategory.mutate({
											name: newCategoryName.trim(),
											rowPosition:
												newCategoryRow === "last"
													? undefined
													: Number(newCategoryRow),
										})
									}
								>
									분류 만들기
								</Button>
							</div>
							<div className="flex flex-col gap-2">
								{(layoutQuery.data?.categories ?? [])
									.filter((category) => category.kind === "standard")
									.map((category) => (
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
											<Button
												aria-label="분류 삭제"
												onClick={() =>
													removeCategory.mutate({ id: category.id })
												}
												size="icon-sm"
												variant="ghost"
											>
												<Trash2Icon />
											</Button>
										</div>
									))}
							</div>
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
							{activeItems.map((item) => (
								/* biome-ignore lint/a11y/useSemanticElements: draggable composite row contains a switch and move buttons */
								<div
									className="flex items-center gap-2 rounded-lg border border-border p-3"
									draggable={featuredSet.has(item.id)}
									key={item.id}
									onDragOver={(event) => event.preventDefault()}
									onDragStart={() => setDraggedFeaturedId(item.id)}
									onDrop={() => {
										if (draggedFeaturedId && featuredSet.has(item.id)) {
											saveFeatured.mutate({
												itemIds: moveItem(
													featuredIds,
													featuredIds.indexOf(draggedFeaturedId),
													featuredIds.indexOf(item.id)
												),
											});
										}
										setDraggedFeaturedId(null);
									}}
									role="button"
									tabIndex={featuredSet.has(item.id) ? 0 : -1}
								>
									<Switch
										checked={featuredSet.has(item.id)}
										onCheckedChange={(checked) =>
											saveFeatured.mutate({
												itemIds: checked
													? [...featuredIds, item.id]
													: featuredIds.filter((id) => id !== item.id),
											})
										}
									/>
									<span className="flex-1 font-semibold text-sm">
										{item.name}
									</span>
									{featuredSet.has(item.id) ? (
										<div className="flex gap-1">
											<Button
												aria-label="인기상품 위로"
												disabled={featuredIds.indexOf(item.id) <= 0}
												onClick={() =>
													saveFeatured.mutate({
														itemIds: moveItem(
															featuredIds,
															featuredIds.indexOf(item.id),
															featuredIds.indexOf(item.id) - 1
														),
													})
												}
												size="icon-sm"
												variant="ghost"
											>
												<ArrowUpIcon />
											</Button>
											<Button
												aria-label="인기상품 아래로"
												disabled={
													featuredIds.indexOf(item.id) >= featuredIds.length - 1
												}
												onClick={() =>
													saveFeatured.mutate({
														itemIds: moveItem(
															featuredIds,
															featuredIds.indexOf(item.id),
															featuredIds.indexOf(item.id) + 1
														),
													})
												}
												size="icon-sm"
												variant="ghost"
											>
												<ArrowDownIcon />
											</Button>
										</div>
									) : null}
								</div>
							))}
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
							{(prizesQuery.data ?? []).map((prize) => (
								<div
									className="grid grid-cols-1 items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
									key={prize.id}
								>
									<div>
										<Label>당첨 포인트</Label>
										<Input
											defaultValue={prize.points}
											onBlur={(event) => {
												const points = Number(event.target.value);
												if (Number.isInteger(points) && points > 0) {
													updatePrize.mutate({ ...prize, points });
												}
											}}
											type="number"
										/>
									</div>
									<div>
										<Label>
											가중치 · 예상{" "}
											{totalWeight > 0 && prize.isActive
												? `${((prize.weight / totalWeight) * 100).toFixed(2)}%`
												: "0%"}
										</Label>
										<Input
											defaultValue={prize.weight}
											onBlur={(event) => {
												const weight = Number(event.target.value);
												if (Number.isInteger(weight) && weight > 0) {
													updatePrize.mutate({ ...prize, weight });
												}
											}}
											type="number"
										/>
									</div>
									<Switch
										checked={prize.isActive}
										onCheckedChange={(isActive) =>
											updatePrize.mutate({ ...prize, isActive })
										}
									/>
									<Button
										aria-label="당첨 설정 삭제"
										onClick={() => removePrize.mutate({ id: prize.id })}
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
									min={1}
									onChange={(event) => setNewPrizeWeight(event.target.value)}
									placeholder="가중치"
									type="number"
									value={newPrizeWeight}
								/>
								<Button
									disabled={
										!(Number(newPrizePoints) > 0 && Number(newPrizeWeight) > 0)
									}
									onClick={() =>
										createPrize.mutate({
											isActive: true,
											points: Number(newPrizePoints),
											sortOrder: prizesQuery.data?.length ?? 0,
											weight: Number(newPrizeWeight),
										})
									}
								>
									당첨 항목 추가
								</Button>
							</div>
							{totalWeight === 0 ? (
								<p className="m-0 text-destructive text-sm">
									활성 당첨 항목이 없어 사용자 뽑기가 비활성화됩니다.
								</p>
							) : null}
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</Card>
		</div>
	);
}
