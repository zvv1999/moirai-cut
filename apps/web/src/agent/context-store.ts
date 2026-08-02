import { create } from "zustand";
import type { AgentContextReference } from "./context-references";

interface AgentContextStore {
	references: AgentContextReference[];
	addReferences: (references: AgentContextReference[]) => void;
	removeReference: (uri: string) => void;
	clearReferences: () => void;
}

export const useAgentContextStore = create<AgentContextStore>((set) => ({
	references: [],
	addReferences: (incoming) =>
		set((current) => {
			const byUri = new Map(
				current.references.map((reference) => [reference.uri, reference]),
			);
			for (const reference of incoming) {
				byUri.set(reference.uri, reference);
			}
			return { references: [...byUri.values()] };
		}),
	removeReference: (uri) =>
		set((current) => ({
			references: current.references.filter(
				(reference) => reference.uri !== uri,
			),
		})),
	clearReferences: () => set({ references: [] }),
}));
