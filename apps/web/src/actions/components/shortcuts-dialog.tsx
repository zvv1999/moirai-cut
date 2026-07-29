"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Search, Upload } from "lucide-react";
import {
	type KeyboardShortcut,
	useKeyboardShortcutsHelp,
} from "@/actions/use-keyboard-shortcuts-help";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { filterKeyboardShortcuts } from "@/actions/shortcut-management";
import { parseImportedKeybindings } from "@/actions/keybindings/persistence";
import type { KeybindingConfig } from "@/actions/keybinding";
import { ACTIONS } from "@/actions/definitions";
import { downloadBlob } from "@/utils/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

const CATEGORY_LABELS: Record<string, string> = {
	assets: "素材",
	controls: "操作",
	editing: "编辑",
	history: "历史",
	navigation: "导航",
	playback: "播放",
	selection: "选择",
	timeline: "时间线",
};

export function ShortcutsDialog({
	isOpen,
	onOpenChange,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [recordingShortcut, setRecordingShortcut] =
		useState<KeyboardShortcut | null>(null);
	const [query, setQuery] = useState("");
	const importInputRef = useRef<HTMLInputElement>(null);

	const {
		updateKeybinding,
		removeKeybinding,
		getKeybindingString,
		validateKeybinding,
		getKeybindingsForAction,
		setIsRecording,
		resetToDefaults,
		importKeybindings,
		exportKeybindings,
		isCustomized,
		isRecording,
	} = useKeybindingsStore();

	const { shortcuts } = useKeyboardShortcutsHelp();
	const filteredShortcuts = useMemo(
		() => filterKeyboardShortcuts({ shortcuts, query }),
		[query, shortcuts],
	);
	const categories = Array.from(
		new Set(filteredShortcuts.map((shortcut) => shortcut.category)),
	);

	useEffect(() => {
		if (!isRecording || !recordingShortcut) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const keyString = getKeybindingString(e);
			if (keyString) {
				const conflict = validateKeybinding({
					key: keyString,
					action: recordingShortcut.action,
				});
				if (conflict) {
					toast.error(
						`按键“${keyString}”已被“${ACTIONS[conflict.existingAction].description}”占用`,
					);
					setIsRecording(false);
					setRecordingShortcut(null);
					return;
				}

				const oldKeys = getKeybindingsForAction(recordingShortcut.action);
				for (const key of oldKeys) {
					removeKeybinding(key);
				}

				updateKeybinding({
					key: keyString,
					action: recordingShortcut.action,
				});

				setIsRecording(false);
				setRecordingShortcut(null);
			}
		};

		const handleClickOutside = () => {
			setRecordingShortcut(null);
			setIsRecording(false);
		};

		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("click", handleClickOutside);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("click", handleClickOutside);
		};
	}, [
		recordingShortcut,
		getKeybindingString,
		updateKeybinding,
		removeKeybinding,
		validateKeybinding,
		getKeybindingsForAction,
		setIsRecording,
		isRecording,
	]);

	const handleStartRecording = (shortcut: KeyboardShortcut) => {
		setRecordingShortcut(shortcut);
		setIsRecording(true);
	};

	const handleExport = () => {
		downloadBlob({
			blob: new Blob([JSON.stringify(exportKeybindings(), null, 2)], {
				type: "application/json",
			}),
			filename: "opencut-shortcuts.json",
		});
		toast.success("快捷键配置已导出");
	};

	const handleImport = async (file: File | undefined) => {
		if (!file) return;

		try {
			const parsed = parseImportedKeybindings({
				config: JSON.parse(await file.text()) as unknown,
			});
			// `parseImportedKeybindings` validates every runtime key and action.
			const config = Object.fromEntries(parsed) as KeybindingConfig;
			importKeybindings(config);
			toast.success(`已导入 ${parsed.size} 个快捷键绑定`);
		} catch {
			toast.error("无法导入快捷键配置，请检查文件格式。");
		} finally {
			if (importInputRef.current) importInputRef.current.value = "";
		}
	};

	const handleReset = () => {
		resetToDefaults();
		setRecordingShortcut(null);
		setIsRecording(false);
		toast.success("快捷键已恢复为默认设置");
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[82vh] max-w-3xl flex-col p-0">
				<DialogHeader>
					<div className="flex items-center justify-between gap-4 pr-8">
						<div>
							<DialogTitle>快捷键</DialogTitle>
							<p className="mt-1 text-xs text-muted-foreground">
								{shortcuts.length} 条命令
								{isCustomized ? " · 自定义配置" : " · 默认配置"}
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => importInputRef.current?.click()}
							>
								<Upload />
								导入
							</Button>
							<Button variant="outline" size="sm" onClick={handleExport}>
								<Download />
								导出
							</Button>
						</div>
					</div>
					<input
						ref={importInputRef}
						type="file"
						accept="application/json,.json"
						className="hidden"
						aria-label="导入快捷键配置"
						onChange={(event) => void handleImport(event.target.files?.[0])}
					/>
				</DialogHeader>

				<DialogBody className="scrollbar-thin grow overflow-y-auto">
					<div className="relative mb-5">
						<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="搜索命令、分类、操作或按键"
							aria-label="搜索快捷键"
							className="pl-9"
							showClearIcon
							onClear={() => setQuery("")}
						/>
					</div>
					<div className="flex flex-col gap-6">
						{categories.map((category) => (
							<div key={category} className="flex flex-col gap-1">
								<h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
									{CATEGORY_LABELS[category] ?? category}
								</h3>
								<div className="flex flex-col gap-1">
									{filteredShortcuts
										.filter((shortcut) => shortcut.category === category)
										.map((shortcut) => (
											<ShortcutItem
												key={shortcut.action}
												shortcut={shortcut}
												isRecording={
													shortcut.action === recordingShortcut?.action
												}
												onStartRecording={() => handleStartRecording(shortcut)}
											/>
										))}
								</div>
							</div>
						))}
						{filteredShortcuts.length === 0 && (
							<div className="py-12 text-center text-sm text-muted-foreground">
								未找到与“{query}”匹配的快捷键。
							</div>
						)}
					</div>
				</DialogBody>
				<DialogFooter>
					<div className="mr-auto text-xs text-muted-foreground">
						单击按键即可录入新快捷键；冲突设置不会保存。
					</div>
					<Button
						variant="destructive-foreground"
						onClick={handleReset}
						disabled={!isCustomized}
					>
						恢复默认设置
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ShortcutItem({
	shortcut,
	isRecording,
	onStartRecording,
}: {
	shortcut: KeyboardShortcut;
	isRecording: boolean;
	onStartRecording: (params: { shortcut: KeyboardShortcut }) => void;
}) {
	const displayKeys = shortcut.keys.filter((key: string) => {
		if (
			key.includes("Cmd") &&
			shortcut.keys.includes(key.replace("Cmd", "Ctrl"))
		)
			return false;

		return true;
	});

	return (
		<div className="flex min-h-9 items-center justify-between gap-4 rounded-md px-2 hover:bg-accent/50">
			<div className="flex items-center gap-3">
				{shortcut.icon && (
					<div className="text-muted-foreground">{shortcut.icon}</div>
				)}
				<span className="text-sm">{shortcut.description}</span>
			</div>
			<div className="flex items-center gap-2">
				{isRecording ? (
					<Button
						variant="outline"
						size="sm"
						className="border-primary bg-primary/10 text-primary"
						onClick={(event) => event.stopPropagation()}
					>
						请按下快捷键…
					</Button>
				) : displayKeys.length === 0 ? (
					<Button
						variant="outline"
						size="sm"
						className="text-muted-foreground"
						onClick={() => onStartRecording({ shortcut })}
					>
						未分配
					</Button>
				) : (
					displayKeys.map((key: string, index: number) => (
						<div key={key} className="flex items-center gap-2">
							<div className="flex items-center gap-1">
								{key.split("+").map((keyPart: string, partIndex: number) => {
									const keyId = `${shortcut.id}-${index}-${partIndex}`;
									return (
										<EditableShortcutKey
											key={keyId}
											isRecording={false}
											onStartRecording={() => onStartRecording({ shortcut })}
										>
											{keyPart}
										</EditableShortcutKey>
									);
								})}
							</div>
							{index < displayKeys.length - 1 && (
								<span className="text-muted-foreground text-xs">或</span>
							)}
						</div>
					))
				)}
			</div>
		</div>
	);
}

function EditableShortcutKey({
	children,
	isRecording,
	onStartRecording,
}: {
	children: React.ReactNode;
	isRecording: boolean;
	onStartRecording: () => void;
}) {
	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onStartRecording();
	};

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={handleClick}
			title={isRecording ? "请按下任意组合键…" : "单击编辑快捷键"}
		>
			{children}
		</Button>
	);
}
