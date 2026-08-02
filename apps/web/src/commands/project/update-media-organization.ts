import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { MediaOrganization } from "@/media/organization";
import type { TProject } from "@/project/types";

export class UpdateMediaOrganizationCommand extends Command {
	private previousOrganization: MediaOrganization | undefined;
	private previousUpdatedAt: Date | null = null;

	constructor(private organization: MediaOrganization) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const activeProject = editor.project.getActiveOrNull();
		if (!activeProject) return;

		this.previousOrganization = activeProject.mediaOrganization;
		this.previousUpdatedAt = activeProject.metadata.updatedAt;
		this.apply({
			project: activeProject,
			organization: this.organization,
			updatedAt: new Date(),
		});
	}

	undo(): void {
		const editor = EditorCore.getInstance();
		const activeProject = editor.project.getActiveOrNull();
		if (!activeProject || !this.previousUpdatedAt) return;
		this.apply({
			project: activeProject,
			organization: this.previousOrganization,
			updatedAt: this.previousUpdatedAt,
		});
	}

	private apply({
		project,
		organization,
		updatedAt,
	}: {
		project: TProject;
		organization: MediaOrganization | undefined;
		updatedAt: Date;
	}) {
		const editor = EditorCore.getInstance();
		editor.project.setActiveProject({
			project: {
				...project,
				mediaOrganization: organization,
				metadata: { ...project.metadata, updatedAt },
			},
		});
		editor.save.markDirty();
	}
}
