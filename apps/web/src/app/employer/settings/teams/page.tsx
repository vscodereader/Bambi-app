"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { TeamForm } from "@/components/bambi/team-form";
import { TeamMemberList } from "@/components/bambi/team-member-list";
import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";
import { formatDateTime, formatNullable } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const getErrorCode = (error: Error | null): string | undefined =>
	error && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;

export default function EmployerTeamSettingsPage() {
	const session = authClient.useSession();
	const isSignedIn = Boolean(session.data?.user);
	const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
	const [editingTeamId, setEditingTeamId] = useState<null | string>(null);
	const organizationsQuery = useQuery({
		...orpc.bambi.organizations.getMine.queryOptions(),
		enabled: isSignedIn,
	});
	const organizations = organizationsQuery.data ?? [];
	const selectedOrganization = organizations.find(
		(organization) => organization.organizationId === selectedOrganizationId
	);
	const teamsQuery = useQuery({
		...orpc.bambi.teams.list.queryOptions({
			input: { organizationId: selectedOrganizationId },
		}),
		enabled: Boolean(selectedOrganizationId),
	});
	const teams = useMemo(
		() =>
			(teamsQuery.data ?? []).map((team) => ({
				...team,
				displayName: team.displayName ?? team.teamId,
			})),
		[teamsQuery.data]
	);

	useEffect(() => {
		if (!(selectedOrganizationId || organizations.length === 0)) {
			setSelectedOrganizationId(organizations[0].organizationId);
		}
	}, [organizations, selectedOrganizationId]);

	if (session.isPending || organizationsQuery.isLoading) {
		return <Loader />;
	}

	if (
		!isSignedIn ||
		getErrorCode(organizationsQuery.error) === "UNAUTHORIZED"
	) {
		return (
			<PageShell
				description="팀 관리는 로그인 후 이용할 수 있습니다."
				title="팀 관리"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/login">
							로그인
						</Link>
					}
					description="구인자 계정으로 로그인하면 조직별 팀과 멤버 초대를 관리할 수 있습니다."
					title="로그인이 필요합니다"
				/>
			</PageShell>
		);
	}

	if (organizationsQuery.isError) {
		return (
			<PageShell
				description="팀 관리 정보를 불러오지 못했습니다."
				title="팀 관리"
			>
				<EmptyState
					action={
						<Button onClick={() => organizationsQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="팀 관리를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	let teamsContent: React.ReactNode;

	if (teamsQuery.isLoading) {
		teamsContent = <Loader />;
	} else if (teamsQuery.isError) {
		teamsContent = (
			<EmptyState
				action={
					<Button onClick={() => teamsQuery.refetch()} type="button">
						다시 시도
					</Button>
				}
				description="팀 목록을 불러오지 못했습니다."
				title="팀 정보를 확인할 수 없습니다"
			/>
		);
	} else if (teams.length > 0) {
		teamsContent = (
			<div className="divide-y border">
				{teams.map((team) => {
					const isEditing = editingTeamId === team.teamId;

					return (
						<div className="p-4" key={team.teamId}>
							{isEditing ? (
								<TeamForm
									onCancel={() => setEditingTeamId(null)}
									organizations={organizations}
									team={{
										displayName: team.displayName,
										organizationId: team.organizationId,
										region: team.region,
										teamId: team.teamId,
									}}
								/>
							) : (
								<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
									<div className="min-w-0">
										<h3 className="break-words font-medium text-sm">
											{team.displayName}
										</h3>
										<p className="mt-1 text-muted-foreground text-xs">
											{formatNullable(team.region)} · 수정{" "}
											{team.updatedAt
												? formatDateTime(team.updatedAt)
												: "미입력"}
										</p>
									</div>
									<Button
										onClick={() => setEditingTeamId(team.teamId)}
										size="sm"
										type="button"
										variant="outline"
									>
										수정
									</Button>
								</div>
							)}
						</div>
					);
				})}
			</div>
		);
	} else {
		teamsContent = (
			<EmptyState
				description="아직 생성된 팀이 없습니다. 위 입력란에서 첫 팀을 만들어 보세요."
				title="팀이 없습니다"
			/>
		);
	}

	return (
		<PageShell
			description="팀을 만들고 수정하며 멤버 초대와 권한을 관리합니다."
			title="팀 관리"
		>
			<div className="flex flex-wrap gap-2">
				<Link
					className={buttonVariants({ variant: "outline" })}
					href={"/employer/settings" as Route}
				>
					조직 설정
				</Link>
				<Link
					className={buttonVariants({ variant: "outline" })}
					href={"/employer" as Route}
				>
					내 공고
				</Link>
			</div>

			{organizations.length > 0 ? (
				<>
					<section aria-labelledby="team-scope" className="space-y-3">
						<div className="grid gap-2 sm:max-w-sm">
							<label
								className="font-medium text-sm"
								htmlFor="team-scope-organization"
							>
								관리 조직
							</label>
							<select
								className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
								id="team-scope-organization"
								onChange={(event) => {
									setSelectedOrganizationId(event.target.value);
									setEditingTeamId(null);
								}}
								value={selectedOrganizationId}
							>
								{organizations.map((organization) => (
									<option
										key={organization.organizationId}
										value={organization.organizationId}
									>
										{organization.displayName}
									</option>
								))}
							</select>
						</div>
					</section>

					<TeamForm organizations={organizations} />

					<section aria-labelledby="teams-list" className="space-y-3">
						<div>
							<h2 className="font-medium text-base" id="teams-list">
								팀 목록
							</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								조직에 소속된 팀과 지역 정보를 확인합니다.
							</p>
						</div>
						{teamsContent}
					</section>

					{selectedOrganization ? (
						<TeamMemberList organization={selectedOrganization} teams={teams} />
					) : null}
				</>
			) : (
				<EmptyState
					action={
						<Link
							className={buttonVariants()}
							href={"/employer/settings" as Route}
						>
							조직 설정으로 이동
						</Link>
					}
					description="조직 소유자 또는 매니저 권한이 있으면 팀을 관리할 수 있습니다."
					title="관리 가능한 조직이 없습니다"
				/>
			)}
		</PageShell>
	);
}
