const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, BorderStyle, TableLayoutType, ShadingType } = require('docx');
const fs = require('fs');

async function testDocx() {
  const tableWidth = 9360;
  const labelWidth = 3600;
  const filesWidth = tableWidth - labelWidth;

  const headerRow = new TableRow({
    children: [
      new TableCell({
        width: { size: labelWidth, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F5F9" },
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Item avaliado", bold: true })],
          }),
        ],
      }),
      new TableCell({
        width: { size: filesWidth, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F5F9" },
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Arquivos (nome)", bold: true })],
          }),
        ],
      }),
    ],
  });

  const bodyRow = new TableRow({
    children: [
      new TableCell({
        width: { size: labelWidth, type: WidthType.DXA },
        children: [new Paragraph({ text: "4.1 Item teste" })],
      }),
      new TableCell({
        width: { size: filesWidth, type: WidthType.DXA },
        children: [
          new Paragraph({ text: "• arquivo1.pdf" }),
          new Paragraph({ text: "• arquivo2.pdf" }),
        ],
      }),
    ],
  });

  const table = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: [labelWidth, filesWidth],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
      left: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
      right: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
      insideVertical: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
    },
    rows: [headerRow, bodyRow],
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: "6- ANEXO EVIDÊNCIAS" }),
          new Paragraph({ text: "Descrição da tabela" }),
          table,
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('./test-output.docx', buffer);
  console.log('Arquivo criado: test-output.docx');
  console.log('Tamanho:', buffer.length, 'bytes');
  
  // Verifica conteúdo
  const content = buffer.toString('utf-8', 0, buffer.length);
  console.log('Contém "Item avaliado":', content.includes('Item avaliado'));
  console.log('Contém "arquivo1.pdf":', content.includes('arquivo1.pdf'));
}

testDocx().catch(console.error);
