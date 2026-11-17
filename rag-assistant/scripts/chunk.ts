// Splits source documents into chunks for the RAG index.
//
// The handbook cuts every 600 characters, which can split a word, a sentence or a table row in
// half. Here each chunk stays inside one section (a markdown heading) and is cut at line or
// paragraph breaks, with about 100 characters of overlap when a section is too long.

export interface SourceDoc {
  title: string; // e.g. "Real Estate Data Analyst Primer"
  file: string; // e.g. "primer.md"
  content: string;
}

export interface Chunk {
  source: string; // document title
  section: string; // heading path inside the document, "" if none
  text: string; // chunk text, without the source/section label
}

export const CHUNK_SIZE = 1000;
export const OVERLAP = 100;
// A single line longer than this is split by words. Shorter long lines (like a list of all the
// columns in a table) are kept whole so the answer isn't cut in half.
export const MAX_LINE = 8000;

interface Section {
  path: string[];
  lines: string[];
}

// Breaks markdown into sections by heading (#, ##, ###...). Text before the first heading gets
// an empty heading path.
export function splitSections(content: string): Section[] {
  const sections: Section[] = [];
  const path: string[] = [];
  let current: Section = { path: [], lines: [] };
  let inCode = false;
  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    const h = !inCode && line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      sections.push(current);
      const level = h[1].length;
      path.length = Math.min(path.length, level - 1);
      while (path.length < level - 1) path.push("");
      path.push(h[2]);
      current = { path: path.filter(Boolean), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections.filter((s) => s.lines.some((l) => l.trim()));
}

// Splits a line that is too long at word breaks.
function splitLongLine(line: string, size: number): string[] {
  const parts: string[] = [];
  let cur = "";
  for (const word of line.split(/(\s+)/)) {
    if (cur.length + word.length > size && cur.trim()) {
      parts.push(cur.trim());
      cur = "";
    }
    cur += word;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// Packs lines into pieces of about `size` characters. Each new piece starts with the last
// lines of the previous one (up to `overlap` characters), so a sentence at a break isn't lost.
export function packLines(text: string, size = CHUNK_SIZE, overlap = OVERLAP, maxLine = MAX_LINE): string[] {
  const lines = text
    .split("\n")
    .flatMap((l) => (l.length > maxLine ? splitLongLine(l, size) : [l]));

  const pieces: string[] = [];
  let cur: string[] = [];
  let len = 0;
  const flush = () => {
    const piece = cur.join("\n").trim();
    if (piece) pieces.push(piece);
  };

  for (const line of lines) {
    if (len + line.length > size && cur.some((l) => l.trim())) {
      flush();
      // Carry over the last lines for overlap.
      const carry: string[] = [];
      let carryLen = 0;
      for (let i = cur.length - 1; i >= 0; i--) {
        if (carryLen + cur[i].length > overlap) break;
        carry.unshift(cur[i]);
        carryLen += cur[i].length + 1;
      }
      cur = carry;
      len = carryLen;
    }
    cur.push(line);
    len += line.length + 1;
  }
  flush();
  return pieces;
}

export function chunkDoc(doc: SourceDoc, size = CHUNK_SIZE, overlap = OVERLAP): Chunk[] {
  const chunks: Chunk[] = [];
  for (const s of splitSections(doc.content)) {
    // The document title is usually the first heading, so don't repeat it in the section path.
    const pathParts = s.path[0] === doc.title ? s.path.slice(1) : s.path;
    const section = pathParts.join(" > ");
    for (const text of packLines(s.lines.join("\n"), size, overlap)) {
      chunks.push({ source: doc.title, section, text });
    }
  }
  return chunks;
}

// The label goes in front of the text that is embedded and shown to the model, so a chunk from
// the "Days on Market (DOM)" section is found by "What does DOM mean?" even if the text itself
// only says "the number of days".
export const chunkLabel = (c: Pick<Chunk, "source" | "section">) =>
  c.section ? `${c.source} > ${c.section}` : c.source;

export const embedText = (c: Chunk) => `${chunkLabel(c)}\n\n${c.text}`;