"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./overlay-scrollbars.css";

type Bar = {
	el: HTMLElement;
	axis: "x" | "y";
	left: number;
	top: number;
	length: number;
	thumb: number;
	position: number;
	max: number;
	value: number;
};

export function OverlayScrollbars() {
	const [bars, setBars] = useState<Bar[]>([]);
	useEffect(() => {
		const assignedIds = new Map<HTMLElement, string>();
		let targets: HTMLElement[] = [];
		let frame = 0;
		let dragging: { bar: Bar; start: number; value: number } | null = null;
		const root = document.documentElement;
		const update = () => {
			frame = 0;
			const next: Bar[] = [];
			for (const el of targets) {
				if (!el.isConnected) continue;
				const isRoot = el === document.scrollingElement;
				const rect = isRoot
					? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
					: el.getBoundingClientRect();
				const style = getComputedStyle(el);
				if (el.closest(".scrollbar-hidden")) continue;
				for (const axis of ["y", "x"] as const) {
					const vertical = axis === "y";
					if (
						el.classList.contains(
							vertical ? "scrollbar-y-hidden" : "scrollbar-x-hidden",
						)
					)
						continue;
					if (
						!isRoot &&
						!/auto|scroll|overlay/.test(
							vertical ? style.overflowY : style.overflowX,
						)
					)
						continue;
					const viewport = vertical ? el.clientHeight : el.clientWidth;
					const total = vertical ? el.scrollHeight : el.scrollWidth;
					const max = total - viewport;
					if (max <= 1) continue;
					if (!el.id) {
						el.id = `scroll-region-${crypto.randomUUID()}`;
						assignedIds.set(el, el.id);
					}
					const start = Math.max(0, vertical ? rect.top : rect.left) + 3;
					const end =
						Math.min(
							vertical ? innerHeight : innerWidth,
							vertical ? rect.bottom : rect.right,
						) - 3;
					const length = end - start;
					if (length < 30) continue;
					const thumb = Math.min(
						length,
						Math.max(28, (length * viewport) / total),
					);
					const value = vertical ? el.scrollTop : el.scrollLeft;
					next.push({
						el,
						axis,
						left: vertical ? rect.right - 9 : start,
						top: vertical ? start : rect.bottom - 9,
						length,
						thumb,
						position: ((length - thumb) * value) / max,
						max,
						value,
					});
				}
			}
			setBars(next);
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		const observer = new ResizeObserver(schedule);
		const move = (event: PointerEvent) => {
			if (dragging) {
				const { bar, start, value } = dragging;
				const delta =
					(bar.axis === "y" ? event.clientY : event.clientX) - start;
				const offset =
					value + (delta * bar.max) / Math.max(1, bar.length - bar.thumb);
				if (bar.axis === "y") bar.el.scrollTop = offset;
				else bar.el.scrollLeft = offset;
				schedule();
				return;
			}
			const element = event.target;
			if (
				!(element instanceof Element) ||
				element.closest(".overlay-scrollbar")
			)
				return;
			const next: HTMLElement[] = [];
			for (let el: Element | null = element; el; el = el.parentElement) {
				if (
					el instanceof HTMLElement &&
					(el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
				)
					next.push(el);
			}
			if (
				document.scrollingElement instanceof HTMLElement &&
				!next.includes(document.scrollingElement)
			)
				next.push(document.scrollingElement);
			targets = next;
			observer.disconnect();
			targets.forEach((el) => observer.observe(el));
			schedule();
		};
		const down = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			const handle = target.closest<HTMLElement>(".overlay-scrollbar");
			if (!handle) return;
			const el = (handle as HTMLElement & { scrollTarget?: HTMLElement })
				.scrollTarget;
			if (!el) return;
			const axis = handle.dataset.axis === "y" ? "y" : "x";
			const bar = {
				el,
				axis,
				max: Number(handle.dataset.max),
				length: Number(handle.dataset.length),
				thumb: Number(handle.dataset.thumb),
			} as Bar;
			dragging = {
				bar,
				start: axis === "y" ? event.clientY : event.clientX,
				value: axis === "y" ? el.scrollTop : el.scrollLeft,
			};
			handle.setPointerCapture(event.pointerId);
			event.preventDefault();
		};
		const up = () => {
			dragging = null;
		};
		const leave = () => {
			if (!dragging) {
				targets = [];
				schedule();
			}
		};
		root.classList.add("has-overlay-scrollbars");
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerdown", down);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", up);
		document.addEventListener("pointerleave", leave);
		document.addEventListener("scroll", schedule, true);
		window.addEventListener("resize", schedule);
		return () => {
			assignedIds.forEach((id, el) => {
				if (el.id === id) el.removeAttribute("id");
			});
			root.classList.remove("has-overlay-scrollbars");
			cancelAnimationFrame(frame);
			observer.disconnect();
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerdown", down);
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", up);
			document.removeEventListener("pointerleave", leave);
			document.removeEventListener("scroll", schedule, true);
			window.removeEventListener("resize", schedule);
		};
	}, []);
	if (typeof document === "undefined") return null;
	return createPortal(
		bars.map((bar, i) => (
			<div
				key={i}
				className="overlay-scrollbar"
				role="scrollbar"
				aria-controls={bar.el.id}
				tabIndex={0}
				ref={(el) => {
					if (el)
						(el as HTMLElement & { scrollTarget?: HTMLElement }).scrollTarget =
							bar.el;
				}}
				aria-label={bar.axis === "y" ? "垂直滚动" : "水平滚动"}
				aria-orientation={bar.axis === "y" ? "vertical" : "horizontal"}
				aria-valuemin={0}
				aria-valuemax={Math.round(bar.max)}
				aria-valuenow={Math.round(bar.value)}
				data-axis={bar.axis}
				data-max={bar.max}
				data-length={bar.length}
				data-thumb={bar.thumb}
				style={{
					left: bar.left + (bar.axis === "x" ? bar.position : 0),
					top: bar.top + (bar.axis === "y" ? bar.position : 0),
					width: bar.axis === "x" ? bar.thumb : 6,
					height: bar.axis === "y" ? bar.thumb : 6,
				}}
				onKeyDown={(event) => {
					const delta = ["ArrowDown", "ArrowRight", "PageDown"].includes(
						event.key,
					)
						? 40
						: ["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)
							? -40
							: 0;
					if (!delta && !["Home", "End"].includes(event.key)) return;
					event.preventDefault();
					const value =
						event.key === "Home"
							? 0
							: event.key === "End"
								? bar.max
								: bar.value + delta;
					if (bar.axis === "y") bar.el.scrollTop = value;
					else bar.el.scrollLeft = value;
				}}
			/>
		)),
		document.body,
	);
}
