export type InlineMark = {
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  linkUrl?: string;
};

export type ParagraphBlock = {
  type: "paragraph";
  text: string;
  marks: InlineMark[];
  headingLevel?: number;
  list?: "bullet" | "number";
  quote?: boolean;
  codeBlock?: boolean;
  horizontalRule?: boolean;
};

export type TableBlock = {
  type: "table";
  rows: Array<Array<{ text: string; marks: InlineMark[] }>>;
};

export type MarkdownBlock = ParagraphBlock | TableBlock;

export type ParsedMarkdown = {
  blocks: MarkdownBlock[];
  headingCount: number;
  sectionCount: number;
  tableCount: number;
};

export function renderInline(source: string) {
  let text = "";
  const marks: InlineMark[] = [];
  const open: Partial<Record<"bold" | "italic" | "code", number>> = {};

  function toggle(kind: "bold" | "italic" | "code") {
    const start = open[kind];
    if (typeof start === "number") {
      if (text.length > start) marks.push({ start, end: text.length, [kind]: true });
      delete open[kind];
    } else open[kind] = text.length;
  }

  for (let index = 0; index < source.length;) {
    if (source[index] === "\\" && index + 1 < source.length) {
      text += source[index + 1];
      index += 2;
      continue;
    }
    const link = source.slice(index).match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    if (link) {
      const start = text.length;
      text += link[1];
      marks.push({ start, end: text.length, linkUrl: link[2] });
      index += link[0].length;
      continue;
    }
    if (source.startsWith("**", index) || source.startsWith("__", index)) {
      toggle("bold");
      index += 2;
      continue;
    }
    if (source[index] === "`") {
      toggle("code");
      index += 1;
      continue;
    }
    if (source[index] === "*" || source[index] === "_") {
      toggle("italic");
      index += 1;
      continue;
    }
    text += source[index];
    index += 1;
  }
  return { text: text.replace(/ {2}$/, ""), marks };
}

function tableRow(line: string) {
  return line.split("\t").map(cell => renderInline(cell.trim()));
}

export function parseMarkdown(source: string): ParsedMarkdown {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let headingCount = 0;
  let sectionCount = 0;

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = line.match(/^```/);
    if (fence) {
      const content: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) content.push(lines[index++]);
      if (index >= lines.length) throw new Error("Unclosed Markdown code fence.");
      index += 1;
      blocks.push({ type: "paragraph", text: content.join("\n"), marks: [], codeBlock: true });
      continue;
    }
    if (line.includes("\t")) {
      const rows: TableBlock["rows"] = [];
      const columns = line.split("\t").length;
      if (columns < 2) throw new Error("A table row must have at least two columns.");
      while (index < lines.length && lines[index].includes("\t")) {
        const row = tableRow(lines[index]);
        if (row.length !== columns) throw new Error(`Inconsistent TSV table width near line ${index + 1}.`);
        rows.push(row);
        index += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const rendered = renderInline(heading[2]);
      const headingLevel = heading[1].length;
      blocks.push({ type: "paragraph", ...rendered, headingLevel });
      headingCount += 1;
      if (headingLevel === 2) sectionCount += 1;
      index += 1;
      continue;
    }
    if (/^(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: "paragraph", text: "", marks: [], horizontalRule: true });
      index += 1;
      continue;
    }
    const bullet = line.match(/^\s*[-+*]\s+(.+)$/);
    if (bullet) {
      blocks.push({ type: "paragraph", ...renderInline(bullet[1]), list: "bullet" });
      index += 1;
      continue;
    }
    const number = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (number) {
      blocks.push({ type: "paragraph", ...renderInline(number[1]), list: "number" });
      index += 1;
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push({ type: "paragraph", ...renderInline(quote[1]), quote: true });
      index += 1;
      continue;
    }
    blocks.push({ type: "paragraph", ...renderInline(line) });
    index += 1;
  }

  return { blocks, headingCount, sectionCount, tableCount: blocks.filter(block => block.type === "table").length };
}

export function semanticSegments(parsed: ParsedMarkdown) {
  const segments: string[] = [];
  for (const block of parsed.blocks) {
    if (block.type === "table") {
      for (const row of block.rows) for (const cell of row) if (cell.text) segments.push(cell.text);
      continue;
    }
    if (block.horizontalRule) continue;
    for (const line of block.text.split("\n")) if (line) segments.push(line);
  }
  return segments;
}
