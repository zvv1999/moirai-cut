"use client";

import { Button } from "../ui/button";
import { useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { RenameProjectDialog } from "@/project/components/rename-project-dialog";
import { DeleteProjectDialog } from "@/project/components/delete-project-dialog";
import { useRouter } from "next/navigation";
import { ExportButton } from "./export-button";
import { FeedbackPopover } from "@/feedback/components/feedback-popover";
import { DEFAULT_LOGO_URL } from "@/site/brand";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { CommandIcon, Logout05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShortcutsDialog } from "@/actions/components/shortcuts-dialog";
import Image from "next/image";
import { cn } from "@/utils/ui";
import { AlertCircle, Check, Cloud, Loader2 } from "lucide-react";

export function EditorHeader() {
	return (
		<header className="editor-studio-header flex h-10 shrink-0 items-center justify-between border-b px-2">
			<div className="flex min-w-0 items-center gap-1">
				<ProjectDropdown />
				<span className="mx-1 h-4 w-px bg-white/10" aria-hidden="true" />
				<EditableProjectName />
			</div>
			<nav className="flex items-center gap-2">
				<SaveStatusIndicator />
				<FeedbackPopover />
				<ExportButton />
			</nav>
		</header>
	);
}

function SaveStatusIndicator() {
	const editor = useEditor();
	const save = useEditor((instance) => instance.save.getState());
	const projectConflict = useEditor((instance) =>
		instance.project.getFileConflict(),
	);
	const conflictRevision =
		save.conflictRevision ?? projectConflict?.revision ?? null;

	const content = {
		idle: {
			label: "自动保存已就绪",
			icon: <Cloud className="size-3.5" />,
			className: "text-muted-foreground",
		},
		dirty: {
			label: "有未保存的更改",
			icon: <Cloud className="size-3.5" />,
			className: "text-amber-600 dark:text-amber-400",
		},
		saving: {
			label: "正在保存…",
			icon: <Loader2 className="size-3.5 animate-spin" />,
			className: "text-blue-600 dark:text-blue-400",
		},
		saved: {
			label:
				save.revision === null ? "已保存" : `已保存 · 版本 ${save.revision}`,
			icon: <Check className="size-3.5" />,
			className: "text-emerald-600 dark:text-emerald-400",
		},
		error: {
			label:
				conflictRevision !== null
					? "磁盘版本已更新 · 请检查"
					: "保存失败 · 点击重试",
			icon: <AlertCircle className="size-3.5" />,
			className: "text-destructive",
		},
	}[save.status];

	return (
		<button
			type="button"
			aria-label={content.label}
			title={save.error ?? content.label}
			disabled={save.status !== "error"}
			onClick={() => {
				if (conflictRevision !== null) {
					toast.error("另一处编辑器更新了该工程", {
						description: "请在历史记录中检查并手动载入磁盘版本。",
					});
					return;
				}
				void editor.save.retry();
			}}
			className={cn(
				"flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium disabled:cursor-default",
				content.className,
				save.status === "error" && "hover:bg-destructive/10",
			)}
		>
			{content.icon}
			<span className="hidden xl:inline">{content.label}</span>
		</button>
	);
}

function ProjectDropdown() {
	const [openDialog, setOpenDialog] = useState<
		"delete" | "rename" | "shortcuts" | null
	>(null);
	const [isExiting, setIsExiting] = useState(false);
	const router = useRouter();
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());

	const handleExit = async () => {
		if (isExiting) return;
		setIsExiting(true);

		try {
			await editor.project.prepareExit();
			editor.project.closeProject();
		} catch (error) {
			console.error("Failed to prepare project exit:", error);
		} finally {
			editor.project.closeProject();
			router.push("/projects");
		}
	};

	const handleSaveProjectName = async (newName: string) => {
		if (
			activeProject &&
			newName.trim() &&
			newName !== activeProject.metadata.name
		) {
			try {
				await editor.project.renameProject({
					id: activeProject.metadata.id,
					name: newName.trim(),
				});
			} catch (error) {
				toast.error("工程重命名失败", {
					description: error instanceof Error ? error.message : "请稍后重试",
				});
			} finally {
				setOpenDialog(null);
			}
		}
	};

	const handleDeleteProject = async () => {
		if (activeProject) {
			try {
				await editor.project.deleteProjects({
					ids: [activeProject.metadata.id],
				});
				router.push("/projects");
			} catch (error) {
				toast.error("删除工程失败", {
					description: error instanceof Error ? error.message : "请稍后重试",
				});
			} finally {
				setOpenDialog(null);
			}
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="p-1 rounded-sm size-8">
						<Image
							src={DEFAULT_LOGO_URL}
							alt="工程菜单"
							width={32}
							height={32}
							className="size-5"
						/>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="z-100 w-44">
					<DropdownMenuItem
						onClick={handleExit}
						disabled={isExiting}
						icon={<HugeiconsIcon icon={Logout05Icon} />}
					>
						退出工程
					</DropdownMenuItem>

					<DropdownMenuItem
						onClick={() => setOpenDialog("shortcuts")}
						icon={<HugeiconsIcon icon={CommandIcon} />}
					>
						快捷键
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<RenameProjectDialog
				isOpen={openDialog === "rename"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "rename" : null)}
				onConfirm={(newName) => handleSaveProjectName(newName)}
				projectName={activeProject?.metadata.name || ""}
			/>
			<DeleteProjectDialog
				isOpen={openDialog === "delete"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "delete" : null)}
				onConfirm={handleDeleteProject}
				projectNames={[activeProject?.metadata.name || ""]}
			/>
			<ShortcutsDialog
				isOpen={openDialog === "shortcuts"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "shortcuts" : null)}
			/>
		</>
	);
}

function EditableProjectName() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const originalNameRef = useRef("");

	const projectName = activeProject?.metadata.name || "";

	const startEditing = () => {
		if (isEditing) return;
		originalNameRef.current = projectName;
		setIsEditing(true);

		requestAnimationFrame(() => {
			inputRef.current?.select();
		});
	};

	const saveEdit = async () => {
		if (!inputRef.current || !activeProject) return;
		const newName = inputRef.current.value.trim();
		setIsEditing(false);

		if (!newName) {
			inputRef.current.value = originalNameRef.current;
			return;
		}

		if (newName !== originalNameRef.current) {
			try {
				await editor.project.renameProject({
					id: activeProject.metadata.id,
					name: newName,
				});
			} catch (error) {
				toast.error("工程重命名失败", {
					description: error instanceof Error ? error.message : "请稍后重试",
				});
			}
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			inputRef.current?.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			if (inputRef.current) {
				inputRef.current.value = originalNameRef.current;
				inputRef.current.setSelectionRange(0, 0);
			}
			setIsEditing(false);
			inputRef.current?.blur();
		}
	};

	return (
		<input
			ref={inputRef}
			type="text"
			defaultValue={projectName}
			readOnly={!isEditing}
			onClick={startEditing}
			onBlur={saveEdit}
			onKeyDown={handleKeyDown}
			style={{ fieldSizing: "content" }}
			className={cn(
				"h-8 max-w-[28rem] truncate rounded-md bg-transparent px-2 py-1 text-[0.82rem] font-medium tracking-wide text-foreground/90 outline-none transition-colors hover:bg-white/5 hover:text-foreground",
				isEditing && "cursor-text bg-white/5 ring-1 ring-primary/45",
			)}
		/>
	);
}
