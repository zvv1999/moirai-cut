"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	BreakApartCompoundClipCommand,
	CreateCompoundClipCommand,
	UpdateCompoundChildCommand,
} from "@/commands";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { planCompoundClip } from "@/timeline/compound-clips";
import { generateUUID } from "@/utils/id";
import {
	mediaTime,
	mediaTimeToSeconds,
	TICKS_PER_SECOND,
} from "@/wasm";

export function CompoundClipPopover() {
	const editor = useEditor();
	const tracks = useEditor(
		(currentEditor) => currentEditor.scenes.getActiveScene().tracks,
	);
	const { selectedElements } = useElementSelection();
	const [name, setName] = useState("Compound clip");
	const selected =
		selectedElements.length === 1
			? (editor.timeline.getElementsWithTracks({
					elements: selectedElements,
				})[0] ?? null)
			: null;
	const selectedCompound = selected?.element.compound;
	const plan = useMemo(
		() => planCompoundClip({ tracks, selection: selectedElements }),
		[selectedElements, tracks],
	);
	const compoundCount = useMemo(
		() =>
			[...tracks.overlay, tracks.main, ...tracks.audio].reduce(
				(count, track) =>
					count + track.elements.filter((element) => element.compound).length,
				0,
			),
		[tracks],
	);

	useEffect(() => {
		if (selectedCompound && selected) setName(selected.element.name);
	}, [selected?.element.name, selectedCompound?.id]);

	const create = () => {
		if (!plan.available) return;
		editor.command.execute({
			command: new CreateCompoundClipCommand({
				selection: selectedElements,
				compoundId: generateUUID(),
				name,
			}),
		});
	};
	const rename = () => {
		if (!selected) return;
		editor.timeline.updateElements({
			updates: [
				{
					trackId: selected.track.id,
					elementId: selected.element.id,
					patch: { name: name.trim() || "Compound clip" },
				},
			],
		});
	};
	const breakApart = () => {
		if (!selectedCompound) return;
		editor.command.execute({
			command: new BreakApartCompoundClipCommand(selectedCompound.id),
		});
	};
	const updateChild = ({
		childElementId,
		childName,
		relativeSeconds,
	}: {
		childElementId: string;
		childName?: string;
		relativeSeconds?: number;
	}) => {
		if (!selected || !selectedCompound) return;
		editor.command.execute({
			command: new UpdateCompoundChildCommand({
				compoundId: selectedCompound.id,
				childElementId,
				compoundRef: {
					trackId: selected.track.id,
					elementId: selected.element.id,
				},
				patch: {
					...(childName !== undefined ? { name: childName } : {}),
					...(relativeSeconds !== undefined
						? {
								relativeStartTime: mediaTime({
									ticks: Math.round(relativeSeconds * TICKS_PER_SECOND),
								}),
							}
						: {}),
				},
			}),
		});
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="relative rounded-sm"
					aria-label={`Open compound clip manager (${compoundCount})`}
				>
					<HugeiconsIcon icon={Layers01Icon} />
					{compoundCount > 0 ? (
						<span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 min-w-3 rounded-full px-0.5 text-[8px] leading-3">
							{compoundCount}
						</span>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="bottom"
				className="flex w-96 flex-col gap-3 p-3"
			>
				<div>
					<p className="text-sm font-semibold">
						{selectedCompound ? "Open compound clip" : "Create compound clip"}
					</p>
					<p className="text-muted-foreground text-[11px]">
						Children keep relative timing and their original media identity.
					</p>
				</div>

				<div className="flex gap-2">
					<input
						className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs"
						aria-label="Compound clip name"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
					{selectedCompound ? (
						<Button type="button" size="sm" onClick={rename}>
							Rename
						</Button>
					) : (
						<Button
							type="button"
							size="sm"
							disabled={!plan.available}
							onClick={create}
						>
							Create
						</Button>
					)}
				</div>

				{selectedCompound && selected ? (
					<>
						<div className="border-border bg-muted/25 rounded-md border p-2 text-xs">
							<strong>{selectedCompound.children.length} nested clips</strong>
							<span className="text-muted-foreground ml-2">
								{mediaTimeToSeconds({
									time: selected.element.duration,
								}).toFixed(2)}
								s container
							</span>
						</div>
						<div className="max-h-64 space-y-2 overflow-y-auto">
							{selectedCompound.children.map((child, index) => {
								const relativeSeconds = mediaTimeToSeconds({
									time: child.relativeStartTime,
								});
								return (
									<div
										key={child.element.id}
										className="border-border rounded-md border p-2"
									>
										<div className="flex items-center gap-2">
											<span className="text-muted-foreground w-5 text-[10px]">
												{index + 1}
											</span>
											<input
												className="border-input bg-background min-w-0 flex-1 rounded border px-2 py-1 text-xs"
												aria-label={`Rename nested clip ${child.element.name}`}
												defaultValue={child.element.name}
												onBlur={(event) =>
													updateChild({
														childElementId: child.element.id,
														childName: event.target.value,
													})
												}
											/>
											<span className="w-14 text-right font-mono text-[10px]">
												{relativeSeconds.toFixed(2)}s
											</span>
										</div>
										<div className="mt-2 grid grid-cols-2 gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline"
												onClick={() =>
													updateChild({
														childElementId: child.element.id,
														relativeSeconds: Math.max(
															0,
															relativeSeconds - 0.1,
														),
													})
												}
											>
												Earlier 0.1s
											</Button>
											<Button
												type="button"
												size="sm"
												variant="outline"
												onClick={() =>
													updateChild({
														childElementId: child.element.id,
														relativeSeconds: relativeSeconds + 0.1,
													})
												}
											>
												Later 0.1s
											</Button>
										</div>
									</div>
								);
							})}
						</div>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={breakApart}
						>
							Break apart
						</Button>
					</>
				) : (
					<p
						className={
							plan.available
								? "border-border bg-muted/30 rounded-md border p-2 text-xs"
								: "border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-2 text-xs"
						}
						role="status"
					>
						{plan.available
							? `${plan.elementIds.length} clips · ${mediaTimeToSeconds({ time: plan.duration }).toFixed(2)}s nested span`
							: plan.reason}
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
