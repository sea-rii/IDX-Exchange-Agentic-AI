// Reads the documents the assistant answers from: every .md and .txt file in data/rag-sources/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceDoc } from "./chunk.ts";

export const SOURCES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/rag-sources");

// "trestle-fields.md" -> "Trestle Fields"
const titleFromFile = (file: string) =>
  path.basename(file, path.extname(file))
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

// The title is the first "# " heading, or the file name if there isn't one.
export function docTitle(file: string, content: string): string {
  const h1 = content.match(/^#\s+(.+?)\s*$/m);
  return h1 ? h1[1] : titleFromFile(file);
}

export function loadSources(dir = SOURCES_DIR): SourceDoc[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(md|txt)$/i.test(f) && !f.startsWith("."))
    .sort()
    .map((file) => {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      return { file, title: docTitle(file, content), content };
    })
    .filter((d) => d.content.trim());
}