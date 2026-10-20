import fs from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { initializeStyleSeed } from "./initialize-style-seed.mjs";

const root = process.env.PILOT_OUTPUT ?? join(homedir(), "Downloads", "checklist-headline-20260929");
const saved = await initializeStyleSeed("checklist-headline.json");
await fs.mkdir(root, { recursive: true });
await fs.writeFile(root + "/definition.json", JSON.stringify(saved, null, 2));
console.log(JSON.stringify({ assetId: saved.id, revision: saved.revision, root }));
