"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/utils/ui";

const Slider = React.forwardRef<
	React.ElementRef<typeof SliderPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
		className?: string;
		trackClassName?: string;
		rangeClassName?: string;
		thumbClassName?: string;
		thumbAriaLabel?: string;
	}
>(
	(
		{
			className,
			trackClassName,
			rangeClassName,
			thumbClassName,
			thumbAriaLabel,
			...props
		},
		ref,
	) => (
		<SliderPrimitive.Root
			ref={ref}
			className={cn(
				"relative flex w-full touch-none items-center select-none",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				className={cn(
					"bg-accent relative h-1.5 w-full grow overflow-hidden rounded-full",
					trackClassName,
				)}
			>
				<SliderPrimitive.Range
					className={cn("bg-primary absolute h-full", rangeClassName)}
				/>
			</SliderPrimitive.Track>
			<SliderPrimitive.Thumb
				aria-label={thumbAriaLabel}
				className={cn(
					"border-primary/50 bg-background focus-visible:ring-ring block size-4 rounded-full border shadow-sm focus-visible:ring-1 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50",
					thumbClassName,
				)}
			/>
		</SliderPrimitive.Root>
	),
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
