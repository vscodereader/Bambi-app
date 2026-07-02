interface FieldErrorProps {
	id: string;
	message?: string;
}

interface FormErrorProps {
	message: null | string;
}

export function FieldError({ id, message }: FieldErrorProps) {
	if (!message) {
		return null;
	}

	return (
		<p className="text-destructive text-xs" id={id}>
			{message}
		</p>
	);
}

export function FormError({ message }: FormErrorProps) {
	if (!message) {
		return null;
	}

	return (
		<div
			className="border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm"
			role="alert"
		>
			{message}
		</div>
	);
}
