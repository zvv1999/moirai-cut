"use client";

import { useRef, useState } from "react";
import type { ParamValues } from "@/params";
import type { Effect } from "@/effects/types";
import type { EffectElement, VisualElement } from "@/timeline";
import { effectsRegistry } from "@/effects";
import { useEditor } from "@/editor/use-editor";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
	SectionFields,
} from "@/components/section";
import { PropertyParamField } from "@/components/editor/panels/properties/components/property-param-field";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Delete02Icon,
	ViewIcon,
	ViewOffSlashIcon,
	MagicWand05Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";
import { Separator } from "@/components/ui/separator";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { parseCubeLut } from "@/visual/appearance";
import { toast } from "sonner";
import {
	applyEffectPreset,
	createEffectPreset,
	duplicateEffectPreset,
	exportEffectPresets,
	importEffectPresets,
	type EffectPreset,
} from "@/effects/presets";
import { generateUUID } from "@/utils/id";

export function StandaloneEffectTab({
	element,
	trackId,
}: {
	element: EffectElement;
	trackId: string;
}) {
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const effect: Effect = {
		id: element.id,
		type: element.effectType,
		params: element.params,
		enabled: true,
	};

	const previewParam = (key: string) => (value: number | string | boolean) => {
		previewUpdates({
			params: { ...(renderElement as EffectElement).params, [key]: value },
		});
	};

	return (
		<div className="flex flex-col h-full">
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center">
				<SectionTitle>Adjustment layer</SectionTitle>
			</div>
			<EffectSection
				effect={effect}
				renderParams={(renderElement as EffectElement).params}
				previewParam={previewParam}
				onCommit={commit}
			/>
		</div>
	);
}

export function ClipEffectsTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const editor = useEditor();
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const effects: Effect[] = element.effects ?? [];

	const getRenderParams = ({ effectId }: { effectId: string }): ParamValues => {
		return (
			(renderElement as VisualElement).effects?.find((ef) => ef.id === effectId)
				?.params ??
			effects.find((ef) => ef.id === effectId)?.params ??
			{}
		);
	};

	const buildPreviewParam =
		(effectId: string) =>
		(key: string) =>
		(value: number | string | boolean) => {
			const updatedEffects = (
				(renderElement as VisualElement).effects ?? []
			).map((existing) =>
				existing.id !== effectId
					? existing
					: { ...existing, params: { ...existing.params, [key]: value } },
			);
			previewUpdates({ effects: updatedEffects });
		};

	const handleDragStart = ({ index }: { index: number }) => setDragIndex(index);

	const handleDragOver = ({
		event,
		index,
	}: {
		event: React.DragEvent;
		index: number;
	}) => {
		event.preventDefault();
		if (index !== dropIndex) setDropIndex(index);
	};

	const handleDrop = ({ toIndex }: { toIndex: number }) => {
		if (dragIndex !== null && dragIndex !== toIndex) {
			editor.timeline.reorderClipEffects({
				trackId,
				elementId: element.id,
				fromIndex: dragIndex,
				toIndex,
			});
		}
		setDragIndex(null);
		setDropIndex(null);
	};

	const handleDragEnd = () => {
		setDragIndex(null);
		setDropIndex(null);
	};

	return (
		<div className="flex flex-col h-full">
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center">
				<SectionTitle>Effects</SectionTitle>
			</div>
			<EffectPresetLibrary
				effects={effects}
				trackId={trackId}
				elementId={element.id}
			/>
			{effects.length === 0 ? (
				<EmptyView />
			) : (
				<ul className="flex flex-col">
					{effects.map((effect, index) => {
						const resolvedDragIndex = dragIndex ?? -1;
						const isDragging = dragIndex === index;
						const isDropTarget =
							dropIndex === index && dragIndex !== null && dragIndex !== index;
						const showTopDropIndicator =
							isDropTarget && index < resolvedDragIndex;
						const showBottomDropIndicator =
							isDropTarget && index > resolvedDragIndex;

						return (
							<li
								key={effect.id}
								draggable
								onDragStart={() => handleDragStart({ index })}
								onDragOver={(event) => handleDragOver({ event, index })}
								onDrop={() => handleDrop({ toIndex: index })}
								onDragEnd={handleDragEnd}
								className={cn(
									"group list-none",
									isDragging && "opacity-40",
									showTopDropIndicator && "border-t-2 border-primary",
									showBottomDropIndicator && "border-b-2 border-primary",
								)}
							>
								<EffectSection
									effect={effect}
									renderParams={getRenderParams({ effectId: effect.id })}
									previewParam={buildPreviewParam(effect.id)}
									onCommit={commit}
									onToggle={() =>
										editor.timeline.toggleClipEffect({
											trackId,
											elementId: element.id,
											effectId: effect.id,
										})
									}
									onRemove={() =>
										editor.timeline.removeClipEffect({
											trackId,
											elementId: element.id,
											effectId: effect.id,
										})
									}
								/>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function EffectPresetLibrary({
	effects,
	trackId,
	elementId,
}: {
	effects: Effect[];
	trackId: string;
	elementId: string;
}) {
	const editor = useEditor();
	const presets = useEditor(
		(e) => e.project.getActive().settings.effectPresets ?? [],
	);
	const importRef = useRef<HTMLInputElement>(null);
	const [selectedId, setSelectedId] = useState(presets[0]?.id ?? "");
	const selected = presets.find((preset) => preset.id === selectedId) ?? null;
	const [name, setName] = useState(selected?.name ?? "My effect chain");
	const [folder, setFolder] = useState(selected?.folder ?? "Custom");

	const savePresets = ({ next }: { next: EffectPreset[] }) => {
		void editor.project.updateSettings({ settings: { effectPresets: next } });
	};
	const selectPreset = ({ preset }: { preset: EffectPreset }) => {
		setSelectedId(preset.id);
		setName(preset.name);
		setFolder(preset.folder);
	};
	const createFromChain = () => {
		if (effects.length === 0) {
			toast.error("Add at least one effect before saving a preset");
			return;
		}
		const preset = createEffectPreset({
			id: generateUUID(),
			name,
			folder,
			effects: effects.map(({ type, enabled, params }) => ({
				type,
				enabled,
				params,
			})),
		});
		savePresets({ next: [...presets, preset] });
		selectPreset({ preset });
		toast.success(`Saved preset “${preset.name}”`);
	};
	const updateSelected = () => {
		if (!selected) {
			toast.error("Choose a preset first");
			return;
		}
		const updated = createEffectPreset({
			id: selected.id,
			name,
			folder,
			effects:
				effects.length > 0
					? effects.map(({ type, enabled, params }) => ({
							type,
							enabled,
							params,
						}))
					: selected.effects,
		});
		savePresets({
			next: presets.map((preset) =>
				preset.id === selected.id ? updated : preset,
			),
		});
		selectPreset({ preset: updated });
		toast.success(`Updated preset “${updated.name}”`);
	};
	const applySelected = ({ mode }: { mode: "append" | "replace" }) => {
		if (!selected) {
			toast.error("Choose a preset first");
			return;
		}
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId,
					patch: {
						effects: applyEffectPreset({
							existing: effects,
							preset: selected,
							mode,
							idFactory: generateUUID,
						}),
					},
				},
			],
		});
		toast.success(
			`${mode === "replace" ? "Replaced with" : "Applied"} “${selected.name}”`,
		);
	};
	const duplicateSelected = () => {
		if (!selected) return;
		const duplicate = duplicateEffectPreset({
			preset: selected,
			id: generateUUID(),
		});
		savePresets({ next: [...presets, duplicate] });
		selectPreset({ preset: duplicate });
	};
	const exportAll = () => {
		if (presets.length === 0) {
			toast.error("There are no effect presets to export");
			return;
		}
		const blob = new Blob([exportEffectPresets({ presets })], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "opencut-effect-presets.json";
		anchor.click();
		URL.revokeObjectURL(url);
	};
	const importFile = async (file: File) => {
		try {
			const imported = importEffectPresets({ source: await file.text() });
			for (const preset of imported) {
				for (const effect of preset.effects) {
					if (!effectsRegistry.has(effect.type)) {
						throw new Error(`Unknown effect in preset: ${effect.type}`);
					}
				}
			}
			const merged = new Map(presets.map((preset) => [preset.id, preset]));
			for (const preset of imported) merged.set(preset.id, preset);
			savePresets({ next: [...merged.values()] });
			if (imported[0]) selectPreset({ preset: imported[0] });
			toast.success(`Imported ${imported.length} effect presets`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not import presets",
			);
		}
	};

	return (
		<Section sectionKey="effect-presets">
			<SectionHeader>
				<SectionTitle>Effect presets</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<input
						ref={importRef}
						type="file"
						accept="application/json,.json"
						className="hidden"
						aria-label="Import effect presets"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) void importFile(file);
							event.currentTarget.value = "";
						}}
					/>
					<label className="flex flex-col gap-1 text-xs">
						<span className="text-muted-foreground">Preset</span>
						<select
							className="h-8 rounded-md border bg-background px-2 text-xs"
							aria-label="Effect preset"
							value={selectedId}
							onChange={(event) => {
								const preset = presets.find(
									(candidate) => candidate.id === event.target.value,
								);
								if (preset) selectPreset({ preset });
							}}
						>
							<option value="">Choose preset</option>
							{presets.map((preset) => (
								<option key={preset.id} value={preset.id}>
									{preset.folder} / {preset.name}
								</option>
							))}
						</select>
					</label>
					<input
						className="h-8 rounded-md border bg-background px-2 text-xs"
						aria-label="Effect preset name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Preset name"
					/>
					<input
						className="h-8 rounded-md border bg-background px-2 text-xs"
						aria-label="Effect preset folder"
						value={folder}
						onChange={(event) => setFolder(event.target.value)}
						placeholder="Folder"
					/>
					<div className="grid grid-cols-2 gap-1.5">
						<Button size="sm" onClick={createFromChain}>
							Save chain
						</Button>
						<Button size="sm" variant="outline" onClick={updateSelected}>
							Update
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => applySelected({ mode: "append" })}
						>
							Apply
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => applySelected({ mode: "replace" })}
						>
							Replace
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={!selected}
							onClick={duplicateSelected}
						>
							Duplicate
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={!selected}
							onClick={() => {
								if (!selected) return;
								savePresets({
									next: presets.filter((preset) => preset.id !== selected.id),
								});
								setSelectedId("");
							}}
						>
							Delete
						</Button>
						<Button size="sm" variant="ghost" onClick={exportAll}>
							Export
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => importRef.current?.click()}
						>
							Import
						</Button>
					</div>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}

function EmptyView() {
	const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);

	return (
		<div className="flex flex-col h-full items-center justify-center gap-4 text-center">
			<HugeiconsIcon
				icon={MagicWand05Icon}
				className="size-10 text-muted-foreground"
				strokeWidth={1}
			/>
			<div className="flex flex-col gap-2">
				<h3 className="font-medium text-foreground">No effects</h3>
				<p className="text-muted-foreground text-sm text-balance max-w-44">
					Add effects to this layer from the Assets panel.
				</p>
			</div>
			<Button
				variant="default"
				size="sm"
				onClick={() => setActiveTab("effects")}
			>
				Open effects
			</Button>
		</div>
	);
}

function EffectSection({
	effect,
	renderParams,
	previewParam,
	onCommit,
	onToggle,
	onRemove,
}: {
	effect: Effect;
	renderParams: ParamValues;
	previewParam: (key: string) => (value: number | string | boolean) => void;
	onCommit: () => void;
	onToggle?: () => void;
	onRemove?: () => void;
}) {
	const definition = effectsRegistry.get(effect.type);
	const lutInputRef = useRef<HTMLInputElement>(null);
	const lutSource =
		typeof renderParams.lutSource === "string" ? renderParams.lutSource : "";
	let lutTitle = "";
	if (lutSource) {
		try {
			lutTitle = parseCubeLut({ source: lutSource }).title;
		} catch {
			lutTitle = "Invalid LUT";
		}
	}

	const importLut = async (file: File) => {
		try {
			const source = await file.text();
			const lut = parseCubeLut({ source });
			previewParam("lutSource")(source);
			onCommit();
			toast.success(`Imported LUT: ${lut.title}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not import LUT",
			);
		}
	};

	return (
		<Section
			sectionKey={onToggle ? `clip-effect:${effect.id}` : undefined}
			showTopBorder={false}
		>
			<SectionHeader
				className={cn(onToggle && "cursor-move")}
				trailing={
					onToggle && (
						<div className="flex items-center gap-1">
							<Button
								variant={effect.enabled ? "secondary" : "ghost"}
								size="icon"
								aria-label={`Toggle ${definition.name}`}
								onClick={onToggle}
							>
								<HugeiconsIcon
									icon={effect.enabled ? ViewIcon : ViewOffSlashIcon}
								/>
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`Remove ${definition.name}`}
								onClick={onRemove}
							>
								<HugeiconsIcon icon={Delete02Icon} />
							</Button>
						</div>
					)
				}
			>
				<SectionTitle
					className={cn(onToggle && !effect.enabled && "text-muted-foreground")}
				>
					{definition.name}
				</SectionTitle>
			</SectionHeader>
			<SectionContent
				className={cn("p-0", onToggle && !effect.enabled && "opacity-50")}
			>
				<SectionFields>
					{definition.type === "background-removal" ? (
						<div className="border-b px-4 pb-3 text-xs">
							<div className="font-medium text-emerald-600">
								Live processing ready
							</div>
							<div className="text-muted-foreground">
								Corner-sampled subject extraction · preview/export matched
							</div>
						</div>
					) : null}
					{definition.type === "chroma-key" ? (
						<div className="border-b px-4 pb-3 text-xs">
							<div className="font-medium text-emerald-600">
								Live color key ready
							</div>
							<div className="text-muted-foreground">
								Soft alpha edge and spill suppression enabled
							</div>
						</div>
					) : null}
					{definition.type === "color-grade" ? (
						<div className="flex flex-col gap-2 border-b px-4 pb-3">
							<input
								ref={lutInputRef}
								type="file"
								accept=".cube,text/plain"
								className="hidden"
								aria-label="Import LUT file"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (file) void importLut(file);
									event.currentTarget.value = "";
								}}
							/>
							<div className="text-muted-foreground text-xs">
								{lutSource ? `LUT: ${lutTitle}` : "No LUT imported"}
							</div>
							<div className="grid grid-cols-2 gap-1.5">
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => lutInputRef.current?.click()}
								>
									Import .cube
								</Button>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									disabled={!lutSource}
									onClick={() => {
										previewParam("lutSource")("");
										onCommit();
									}}
								>
									Remove LUT
								</Button>
							</div>
						</div>
					) : null}
					{definition.params
						.filter((param) => param.key !== "lutSource")
						.map((param) => (
							<div key={param.key} className="flex flex-col gap-3.5">
								<div className="px-4">
									<PropertyParamField
										param={param}
										value={renderParams[param.key] ?? param.default}
										onPreview={previewParam(param.key)}
										onCommit={onCommit}
									/>
								</div>
								<Separator />
							</div>
						))}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}
