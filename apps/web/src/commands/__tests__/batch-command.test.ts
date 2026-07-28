import { describe, expect, test } from "bun:test";
import { BatchCommand } from "../batch-command";
import { Command } from "../base-command";

class StepCommand extends Command {
	executions = 0;
	undos = 0;

	constructor(private readonly shouldThrow = false) {
		super();
	}

	execute() {
		this.executions += 1;
		if (this.shouldThrow) throw new Error("step failed");
		return undefined;
	}

	undo() {
		this.undos += 1;
	}
}

describe("BatchCommand", () => {
	test("rolls back completed steps when a later plan step throws", () => {
		const first = new StepCommand();
		const failing = new StepCommand(true);
		const unreachable = new StepCommand();
		const batch = new BatchCommand([first, failing, unreachable]);

		expect(() => batch.execute()).toThrow("step failed");
		expect(first.executions).toBe(1);
		expect(first.undos).toBe(1);
		expect(failing.executions).toBe(1);
		expect(unreachable.executions).toBe(0);
	});
});
