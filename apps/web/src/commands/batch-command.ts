import { Command, type CommandResult } from "./base-command";

export class BatchCommand extends Command {
	constructor(private commands: Command[]) {
		super();
	}

	execute(): CommandResult | undefined {
		let latestSelectionResult: CommandResult | undefined;
		const attempted: Command[] = [];

		try {
			for (const command of this.commands) {
				// Include the current command before executing it: a command may
				// save its previous state, mutate, and only then throw. Its undo is
				// therefore part of the transactional rollback too.
				attempted.push(command);
				const result = command.execute();
				if (result?.selection !== undefined) {
					latestSelectionResult = result;
				}
			}
		} catch (error) {
			for (const command of attempted.reverse()) {
				command.undo();
			}
			throw error;
		}

		return latestSelectionResult;
	}

	undo(): void {
		for (const command of [...this.commands].reverse()) {
			command.undo();
		}
	}

	redo(): CommandResult | undefined {
		let latestSelectionResult: CommandResult | undefined;
		const attempted: Command[] = [];

		try {
			for (const command of this.commands) {
				attempted.push(command);
				const result = command.redo();
				if (result?.selection !== undefined) {
					latestSelectionResult = result;
				}
			}
		} catch (error) {
			for (const command of attempted.reverse()) {
				command.undo();
			}
			throw error;
		}

		return latestSelectionResult;
	}
}
