import type { DirectManipulationFeedback } from "@/timeline";
import { cn } from "@/utils/ui";

export function DirectManipulationHud({
	feedback,
}: {
	feedback: DirectManipulationFeedback | null;
}) {
	if (!feedback) return null;

	return (
		<div
			role="status"
			aria-live="polite"
			data-testid="direct-manipulation-feedback"
			data-feedback-kind={feedback.kind}
			data-feedback-tone={feedback.tone}
			className={cn(
				"pointer-events-none absolute right-3 bottom-3 z-50 min-w-56 max-w-[min(28rem,70%)] rounded-md border px-3 py-2 shadow-xl backdrop-blur-md",
				feedback.tone === "positive" &&
					"border-emerald-400/40 bg-emerald-950/90 text-emerald-50",
				feedback.tone === "warning" &&
					"border-amber-400/40 bg-amber-950/90 text-amber-50",
				feedback.tone === "negative" &&
					"border-rose-400/40 bg-rose-950/90 text-rose-50",
			)}
		>
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"size-2 shrink-0 rounded-full",
						feedback.tone === "positive" && "bg-emerald-400",
						feedback.tone === "warning" && "bg-amber-400",
						feedback.tone === "negative" && "bg-rose-400",
					)}
				/>
				<strong className="text-xs font-semibold">{feedback.title}</strong>
			</div>
			<p className="mt-1 text-[10px] leading-snug opacity-80">
				{feedback.detail}
			</p>
		</div>
	);
}
