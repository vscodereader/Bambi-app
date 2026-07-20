"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Switch } from "@bambi-app/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";

export default function ModeratorBannedWordsPage() {
	const queryClient = useQueryClient();
	const [term, setTerm] = useState("");

	const listQuery = useQuery(
		orpc.bambi.bannedWords.list.queryOptions({
			input: { includeInactive: true },
		})
	);

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.bannedWords.key(),
		});
	};

	const createMutation = useMutation(
		orpc.bambi.bannedWords.create.mutationOptions({
			onError: (error) => toast(error.message || "금칙어를 등록하지 못했어요."),
			onSuccess: async () => {
				toast("금칙어를 등록했어요.");
				setTerm("");
				await invalidate();
			},
		})
	);

	const setActiveMutation = useMutation(
		orpc.bambi.bannedWords.setActive.mutationOptions({
			onError: (error) => toast(error.message || "상태를 바꾸지 못했어요."),
			onSuccess: invalidate,
		})
	);

	const removeMutation = useMutation(
		orpc.bambi.bannedWords.remove.mutationOptions({
			onError: (error) => toast(error.message || "삭제하지 못했어요."),
			onSuccess: async () => {
				toast("금칙어를 삭제했어요.");
				await invalidate();
			},
		})
	);

	const items = listQuery.data?.items ?? [];

	return (
		<div className="flex flex-col gap-5 px-5 py-6 md:px-6">
			<header className="flex flex-col gap-2">
				<h1 className="m-0 font-extrabold text-xl">금칙어 관리</h1>
				<p className="m-0 text-muted-foreground text-sm">
					등록된 단어가 제목·본문에 있으면 커뮤니티·고객센터 글이 게시되지
					않습니다. 공백과 특수문자는 무시하고 비교하므로 "성 매매"처럼 띄어
					써도 걸립니다.
				</p>
			</header>

			<div className="flex flex-wrap items-center gap-2">
				<Input
					className="max-w-80"
					maxLength={100}
					onChange={(event) => setTerm(event.target.value)}
					placeholder="추가할 금칙어"
					value={term}
				/>
				<Button
					disabled={term.trim().length === 0 || createMutation.isPending}
					onClick={() => createMutation.mutate({ term })}
				>
					추가
				</Button>
			</div>

			<div className="w-full overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>금칙어</TableHead>
							<TableHead>정규화형</TableHead>
							<TableHead>사용</TableHead>
							<TableHead>삭제</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.length === 0 ? (
							<TableRow>
								<TableCell
									className="text-muted-foreground text-sm"
									colSpan={4}
								>
									등록된 금칙어가 없어요.
								</TableCell>
							</TableRow>
						) : null}
						{items.map((item) => (
							<TableRow key={item.id}>
								<TableCell className="font-bold">{item.term}</TableCell>
								<TableCell className="text-muted-foreground">
									<Badge variant="outline">{item.normalizedTerm}</Badge>
								</TableCell>
								<TableCell>
									<Switch
										checked={item.isActive}
										onCheckedChange={(checked) =>
											setActiveMutation.mutate({
												id: item.id,
												isActive: checked,
											})
										}
									/>
								</TableCell>
								<TableCell>
									<Button
										onClick={() => removeMutation.mutate({ id: item.id })}
										size="sm"
										variant="destructive"
									>
										삭제
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
