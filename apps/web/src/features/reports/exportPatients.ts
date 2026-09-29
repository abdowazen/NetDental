import type { NewPatientReportRow } from "@clinic/shared";

export type PatientExportColumn = {
  header: string;
  value: (patient: NewPatientReportRow) => string;
  width: number;
};

type PatientExportOptions = {
  rows: NewPatientReportRow[];
  columns: PatientExportColumn[];
  title: string;
  period: string;
  filename: string;
};

const encoder = new TextEncoder();

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function download(bytes: Uint8Array, type: string, filename: string) {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function join(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function binary(size: number, values: [number, number, number][]) {
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  for (const [offset, width, value] of values) {
    if (width === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
  }
  return result;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: { name: string; content: string }[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);
    const localHeader = binary(30, [[0,4,0x04034b50],[4,2,20],[6,2,0x0800],[8,2,0],[10,2,0],[12,2,0],[14,4,crc],[18,4,data.length],[22,4,data.length],[26,2,name.length],[28,2,0]]);
    localParts.push(localHeader, name, data);
    const centralHeader = binary(46, [[0,4,0x02014b50],[4,2,20],[6,2,20],[8,2,0x0800],[10,2,0],[12,2,0],[14,2,0],[16,4,crc],[20,4,data.length],[24,4,data.length],[28,2,name.length],[30,2,0],[32,2,0],[34,2,0],[36,2,0],[38,4,0],[42,4,localOffset]]);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + data.length;
  }
  const central = join(centralParts);
  const end = binary(22, [[0,4,0x06054b50],[4,2,0],[6,2,0],[8,2,entries.length],[10,2,entries.length],[12,4,central.length],[16,4,localOffset],[20,2,0]]);
  return join([...localParts, central, end]);
}

function cellName(column: number, row: number) {
  let label = "";
  for (let value = column + 1; value; value = Math.floor((value - 1) / 26)) label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return `${label}${row}`;
}

export function exportPatientsExcel({ rows, columns, title, period, filename }: PatientExportOptions) {
  const values = [[title], [period], [], columns.map((column) => column.header), ...rows.map((patient) => columns.map((column) => column.value(patient)))];
  const sheetRows = values.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${cellName(columnIndex, rowIndex + 1)}" t="inlineStr"${rowIndex === 0 || rowIndex === 3 ? ' s="1"' : ""}><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join("")}</row>`).join("");
  const columnWidths = columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`).join("");
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${columnWidths}</cols><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(title.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;
  const archive = zip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", content: worksheet },
    { name: "xl/styles.xml", content: styles },
  ]);
  download(archive, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${filename}.xlsx`);
}

function fitText(context: CanvasRenderingContext2D, value: string, width: number) {
  if (context.measureText(value).width <= width) return value;
  let text = value;
  while (text && context.measureText(`${text}…`).width > width) text = text.slice(0, -1);
  return `${text}…`;
}

function jpegBytes(canvas: HTMLCanvasElement) {
  const encoded = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
  const binaryValue = atob(encoded);
  return Uint8Array.from(binaryValue, (character) => character.charCodeAt(0));
}

function pdfFromJpegs(images: { bytes: Uint8Array; width: number; height: number }[]) {
  const objectCount = 2 + images.length * 3;
  const objects = new Map<number, Uint8Array>();
  objects.set(1, encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"));
  const pageIds = images.map((_, index) => 3 + index * 3);
  objects.set(2, encoder.encode(`<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`));
  images.forEach((image, index) => {
    const pageId = pageIds[index], imageId = pageId + 1, contentId = pageId + 2;
    objects.set(pageId, encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Image${index} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    objects.set(imageId, join([encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`), image.bytes, encoder.encode("\nendstream")]));
    const command = `q 595 0 0 842 0 0 cm /Image${index} Do Q`;
    objects.set(contentId, encoder.encode(`<< /Length ${command.length} >>\nstream\n${command}\nendstream`));
  });
  const parts: Uint8Array[] = [encoder.encode("%PDF-1.4\n%NetDenty\n")];
  const offsets = [0];
  let offset = parts[0].length;
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = offset;
    const object = join([encoder.encode(`${id} 0 obj\n`), objects.get(id)!, encoder.encode("\nendobj\n")]);
    parts.push(object); offset += object.length;
  }
  const xrefOffset = offset;
  const xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(encoder.encode(xref));
  return join(parts);
}

export function exportPatientsPdf({ rows, columns, title, period, filename }: PatientExportOptions) {
  const pageWidth = 1240, pageHeight = 1754, margin = 60, rowHeight = 46, rowsPerPage = 30;
  const widths = [120, 250, 210, 105, 165, 270];
  const pages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const images = Array.from({ length: pages }, (_, pageIndex) => {
    const canvas = document.createElement("canvas"); canvas.width = pageWidth; canvas.height = pageHeight;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, pageWidth, pageHeight);
    context.fillStyle = "#10233f"; context.font = "bold 30px Segoe UI, Arial, sans-serif"; context.fillText(title, margin, 70);
    context.fillStyle = "#5b6b82"; context.font = "18px Segoe UI, Arial, sans-serif"; context.fillText(period, margin, 105);
    context.textAlign = "right"; context.fillText(`${pageIndex + 1} / ${pages}`, pageWidth - margin, 70); context.textAlign = "left";
    let y = 140;
    context.fillStyle = "#e9f4f2"; context.fillRect(margin, y, pageWidth - margin * 2, rowHeight);
    context.fillStyle = "#10233f"; context.font = "bold 16px Segoe UI, Arial, sans-serif";
    let x = margin;
    columns.forEach((column, index) => { context.fillText(fitText(context, column.header, widths[index] - 16), x + 8, y + 29); x += widths[index]; });
    rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage).forEach((patient, rowIndex) => {
      y += rowHeight;
      if (rowIndex % 2) { context.fillStyle = "#f7f9fb"; context.fillRect(margin, y, pageWidth - margin * 2, rowHeight); }
      context.strokeStyle = "#d7e0e8"; context.beginPath(); context.moveTo(margin, y + rowHeight); context.lineTo(pageWidth - margin, y + rowHeight); context.stroke();
      context.fillStyle = "#24364d"; context.font = "15px Segoe UI, Arial, sans-serif"; x = margin;
      columns.forEach((column, index) => { context.fillText(fitText(context, column.value(patient), widths[index] - 16), x + 8, y + 29); x += widths[index]; });
    });
    return { bytes: jpegBytes(canvas), width: pageWidth, height: pageHeight };
  });
  download(pdfFromJpegs(images), "application/pdf", `${filename}.pdf`);
}
