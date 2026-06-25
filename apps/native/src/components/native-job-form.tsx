import { Button, Input, Surface, TextField } from "heroui-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
	emptyNativeJobForm,
	industryOptions,
	type NativeJobForm,
	type NativeJobFormErrors,
	type NativeJobPostInput,
	payUnitOptions,
	regionOptions,
	validateNativeJobForm,
} from "@/src/lib/bambi-native";

interface PostingScope {
	organizationDisplayName: string;
	organizationId: string;
	scopeType: "organization" | "team";
	teamDisplayName: null | string;
	teamId: null | string;
}

interface NativeJobFormProps {
	initialValue?: NativeJobForm;
	isSubmitting: boolean;
	onSubmit: (input: NativeJobPostInput) => void;
	postingScopes: PostingScope[];
	submitLabel: string;
}

interface ChoiceGroupProps<TValue extends string> {
	label: string;
	onChange: (value: TValue) => void;
	options: readonly TValue[];
	value: TValue;
}

const getPostingScopeValue = (scope: PostingScope): string =>
	JSON.stringify([scope.organizationId, scope.teamId]);

const getPostingScopeLabel = (scope: PostingScope): string => {
	if (scope.scopeType === "organization") {
		return `${scope.organizationDisplayName} / 전체 조직`;
	}

	return `${scope.organizationDisplayName} / ${scope.teamDisplayName ?? scope.teamId}`;
};

const toInitialForm = (value?: NativeJobForm): NativeJobForm => ({
	...emptyNativeJobForm,
	...value,
});

function ChoiceGroup<TValue extends string>({
	label,
	onChange,
	options,
	value,
}: ChoiceGroupProps<TValue>) {
	return (
		<View className="gap-2">
			<Text className="font-semibold text-foreground text-sm" selectable>
				{label}
			</Text>
			<View className="flex-row flex-wrap gap-2">
				{options.map((option) => {
					const isSelected = option === value;

					return (
						<Pressable
							className={`rounded-full border px-3 py-2 active:opacity-75 ${
								isSelected
									? "border-accent bg-accent"
									: "border-border bg-background"
							}`}
							key={option}
							onPress={() => onChange(option)}
						>
							<Text
								className={
									isSelected
										? "font-semibold text-accent-foreground text-sm"
										: "font-semibold text-foreground text-sm"
								}
							>
								{option}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

function FieldError({
	errors,
	field,
}: {
	errors: NativeJobFormErrors;
	field: keyof NativeJobForm;
}) {
	const message = errors[field];

	if (!message) {
		return null;
	}

	return (
		<Text className="text-danger text-xs" selectable>
			{message}
		</Text>
	);
}

export function NativeJobFormScreen({
	initialValue,
	isSubmitting,
	onSubmit,
	postingScopes,
	submitLabel,
}: NativeJobFormProps) {
	const [form, setForm] = useState<NativeJobForm>(() =>
		toInitialForm(initialValue)
	);
	const [errors, setErrors] = useState<NativeJobFormErrors>({});
	const [formMessage, setFormMessage] = useState<null | string>(null);
	const postingScopeOptions = useMemo(
		() =>
			postingScopes.map((scope) => ({
				label: getPostingScopeLabel(scope),
				scope,
				value: getPostingScopeValue(scope),
			})),
		[postingScopes]
	);
	const selectedScopeValue = getPostingScopeValue({
		organizationDisplayName: "",
		organizationId: form.organizationId,
		scopeType: form.teamId ? "team" : "organization",
		teamDisplayName: null,
		teamId: form.teamId || null,
	});

	const updateForm = (patch: Partial<NativeJobForm>) => {
		setForm((current) => ({ ...current, ...patch }));
	};
	const handleScopeChange = (value: string) => {
		const selected = postingScopeOptions.find(
			(option) => option.value === value
		);

		if (!selected) {
			return;
		}

		updateForm({
			organizationId: selected.scope.organizationId,
			teamId: selected.scope.teamId ?? "",
		});
	};
	const handleSubmit = () => {
		const validation = validateNativeJobForm(form, {
			teamScopes: postingScopes
				.filter((scope) => scope.teamId)
				.map((scope) => ({
					organizationId: scope.organizationId,
					teamId: scope.teamId ?? "",
				})),
		});

		if (!validation.ok) {
			setErrors(validation.errors);
			setFormMessage(validation.message);
			return;
		}

		setErrors({});
		setFormMessage(null);
		onSubmit(validation.input);
	};

	return (
		<View className="gap-4">
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<View className="gap-2">
					<Text className="font-semibold text-foreground text-sm" selectable>
						등록 범위
					</Text>
					<View className="gap-2">
						{postingScopeOptions.map((option) => {
							const isSelected = option.value === selectedScopeValue;

							return (
								<Pressable
									className={`rounded-lg border p-3 active:opacity-75 ${
										isSelected
											? "border-accent bg-accent"
											: "border-border bg-background"
									}`}
									key={option.value}
									onPress={() => handleScopeChange(option.value)}
								>
									<Text
										className={
											isSelected
												? "font-semibold text-accent-foreground"
												: "font-semibold text-foreground"
										}
									>
										{option.label}
									</Text>
								</Pressable>
							);
						})}
					</View>
					<FieldError errors={errors} field="organizationId" />
				</View>

				<TextField>
					<Input
						onChangeText={(title) => updateForm({ title })}
						placeholder="공고 제목"
						value={form.title}
					/>
				</TextField>
				<FieldError errors={errors} field="title" />

				<ChoiceGroup
					label="업종"
					onChange={(industryCategory) => updateForm({ industryCategory })}
					options={industryOptions}
					value={form.industryCategory}
				/>
				<FieldError errors={errors} field="industryCategory" />

				<ChoiceGroup
					label="지역"
					onChange={(region) => updateForm({ region })}
					options={regionOptions}
					value={form.region}
				/>
				<FieldError errors={errors} field="region" />

				<View className="flex-row gap-3">
					<View className="flex-1">
						<TextField>
							<Input
								keyboardType="number-pad"
								onChangeText={(payAmount) => updateForm({ payAmount })}
								placeholder="급여"
								value={form.payAmount}
							/>
						</TextField>
						<FieldError errors={errors} field="payAmount" />
					</View>
					<View className="flex-1">
						<ChoiceGroup
							label="단위"
							onChange={(payUnit) => updateForm({ payUnit })}
							options={payUnitOptions}
							value={form.payUnit}
						/>
						<FieldError errors={errors} field="payUnit" />
					</View>
				</View>

				<TextField>
					<Input
						onChangeText={(workSchedule) => updateForm({ workSchedule })}
						placeholder="근무 일정"
						value={form.workSchedule}
					/>
				</TextField>
				<FieldError errors={errors} field="workSchedule" />

				<TextField>
					<Input
						multiline
						onChangeText={(description) => updateForm({ description })}
						placeholder="상세 설명"
						value={form.description}
					/>
				</TextField>
				<FieldError errors={errors} field="description" />

				<TextField>
					<Input
						multiline
						onChangeText={(interviewNotes) => updateForm({ interviewNotes })}
						placeholder="면접 안내"
						value={form.interviewNotes}
					/>
				</TextField>
				<FieldError errors={errors} field="interviewNotes" />

				{formMessage ? (
					<Text className="text-danger text-sm" selectable>
						{formMessage}
					</Text>
				) : null}

				<Button isDisabled={isSubmitting} onPress={handleSubmit}>
					<Button.Label>{isSubmitting ? "저장 중" : submitLabel}</Button.Label>
				</Button>
			</Surface>
		</View>
	);
}
