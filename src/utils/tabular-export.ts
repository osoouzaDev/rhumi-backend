import type { ExportFormat } from "../schemas/audit.schemas.js";

export interface ExportColumn<Row> {
    label: string;
    value: (row: Row) => unknown;
}

export interface ExportArtifact {
    body: Buffer;
    contentType: string;
    extension: "csv" | "xls" | "pdf";
}

const stringValue = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
};

const csvCell = (value: unknown): string => {
    const text = stringValue(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const xmlCell = (value: unknown): string => stringValue(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const buildCsv = <Row>(columns: ExportColumn<Row>[], rows: Row[]): Buffer => {
    const lines = [
        columns.map((column) => csvCell(column.label)).join(","),
        ...rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(",")),
    ];
    return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
};

const buildSpreadsheet = <Row>(
    title: string,
    columns: ExportColumn<Row>[],
    rows: Row[],
): Buffer => {
    const tableRows = [
        `<Row>${columns.map((column) => (
            `<Cell><Data ss:Type="String">${xmlCell(column.label)}</Data></Cell>`
        )).join("")}</Row>`,
        ...rows.map((row) => `<Row>${columns.map((column) => (
            `<Cell><Data ss:Type="String">${xmlCell(column.value(row))}</Data></Cell>`
        )).join("")}</Row>`),
    ].join("");
    const document = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${xmlCell(title).slice(0, 31)}"><Table>${tableRows}</Table></Worksheet>
</Workbook>`;
    return Buffer.from(document, "utf8");
};

const pdfText = (value: unknown): string => stringValue(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");

const buildPdf = <Row>(
    title: string,
    columns: ExportColumn<Row>[],
    rows: Row[],
): Buffer => {
    const rawLines = [
        title,
        columns.map((column) => column.label).join(" | "),
        ...rows.map((row) => columns.map((column) => stringValue(column.value(row))).join(" | ")),
    ].map((line) => line.length > 115 ? `${line.slice(0, 112)}...` : line);
    const chunks: string[][] = [];
    for (let index = 0; index < rawLines.length; index += 48) {
        chunks.push(rawLines.slice(index, index + 48));
    }
    if (chunks.length === 0) chunks.push([title]);

    const objects = new Map<number, string>();
    const pageIds: number[] = [];
    objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
    objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    chunks.forEach((lines, index) => {
        const pageId = 4 + index * 2;
        const contentId = pageId + 1;
        pageIds.push(pageId);
        const commands = lines.map((line, lineIndex) => (
            `${lineIndex === 0 ? "" : "T* "}(${pdfText(line)}) Tj`
        )).join("\n");
        const stream = `BT /F1 8 Tf 40 800 Td 0 -15 TD ${commands} ET`;
        objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]
 /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
        objects.set(contentId, `<< /Length ${Buffer.byteLength(stream, "latin1")} >>
stream
${stream}
endstream`);
    });
    objects.set(2, `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(
        (id) => `${id} 0 R`,
    ).join(" ")}] >>`);

    const maximumObjectId = 3 + chunks.length * 2;
    let output = "%PDF-1.4\n";
    const offsets = [0];
    for (let id = 1; id <= maximumObjectId; id += 1) {
        offsets[id] = Buffer.byteLength(output, "latin1");
        output += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
    }
    const xrefOffset = Buffer.byteLength(output, "latin1");
    output += `xref\n0 ${maximumObjectId + 1}\n`;
    output += "0000000000 65535 f \n";
    for (let id = 1; id <= maximumObjectId; id += 1) {
        output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    }
    output += `trailer\n<< /Size ${maximumObjectId + 1} /Root 1 0 R >>\n`;
    output += `startxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(output, "latin1");
};

export const exportTable = <Row>(
    format: ExportFormat,
    title: string,
    columns: ExportColumn<Row>[],
    rows: Row[],
): ExportArtifact => {
    if (format === "xls") {
        return {
            body: buildSpreadsheet(title, columns, rows),
            contentType: "application/vnd.ms-excel; charset=utf-8",
            extension: "xls",
        };
    }
    if (format === "pdf") {
        return {
            body: buildPdf(title, columns, rows),
            contentType: "application/pdf",
            extension: "pdf",
        };
    }
    return {
        body: buildCsv(columns, rows),
        contentType: "text/csv; charset=utf-8",
        extension: "csv",
    };
};
