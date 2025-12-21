import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableLayoutType,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import prisma from "../config/database";
import { FormService } from "./form.services";
import { getReportsDir } from "../config/paths";
import { getStorageProvider, uploadFileToStorage } from "../config/storage";

export class ReportService {
  private static buildDocxCard(children: Paragraph[]) {
    // Approx A4 page content width with default 1" margins: ~6.5" => 9360 twips.
    // Use a safe fixed width to prevent Word from collapsing/minimizing the table.
    const cardWidthTwips = 9360;
    return new Table({
      layout: TableLayoutType.FIXED,
      width: { size: cardWidthTwips, type: WidthType.DXA },
      columnWidths: [cardWidthTwips],
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        left: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        right: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        insideHorizontal: {
          style: BorderStyle.SINGLE,
          size: 0,
          color: "FFFFFF",
        },
        insideVertical: { style: BorderStyle.SINGLE, size: 0, color: "FFFFFF" },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: cardWidthTwips, type: WidthType.DXA },
              margins: { top: 160, bottom: 160, left: 240, right: 240 },
              shading: {
                type: ShadingType.CLEAR,
                color: "auto",
                fill: "FFFFFF",
              },
              children,
            }),
          ],
        }),
      ],
    });
  }

  private static buildDocxCardTitle(text: string) {
    return new Paragraph({
      spacing: { after: 140 },
      children: [
        new TextRun({
          text,
          bold: true,
          size: 24
		  ,
        }),
      ],
    });
  }

  private static buildDocxCardSectionTitle(text: string) {
    return new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [new TextRun({ text, bold: true})

	  ],
    });
  }

  private static buildEvidenceLink(ev: any, baseUrl: string) {
    const normalizedPath = (ev.path || "").replace(/\\/g, "/");
    const hasUploads = normalizedPath.toLowerCase().includes("uploads/");
    const relativeSegment = hasUploads
      ? normalizedPath.slice(normalizedPath.toLowerCase().indexOf("uploads/"))
      : `uploads/${ev.filename}`;
    return `${baseUrl}/${relativeSegment}`;
  }

  private static buildBuilderAttachmentLink(
    att: { path?: string; filename?: string },
    baseUrl: string
  ) {
    const normalizedPath = (att.path || "").replace(/\\/g, "/");
    const hasUploads = normalizedPath.toLowerCase().includes("uploads/");
    const relativeSegment = hasUploads
      ? normalizedPath.slice(normalizedPath.toLowerCase().indexOf("uploads/"))
      : `uploads/${normalizedPath || att.filename || ""}`;
    return `${baseUrl}/${relativeSegment.replace(/^\/+/, "")}`;
  }

  private static buildLabelValueParagraph(
    label: string,
    value: string,
    options?: { spacingAfter?: number }
  ) {
    return new Paragraph({
      spacing: { after: options?.spacingAfter ?? 80 },
      children: [
        new TextRun({ text: `${label}: `, bold: true }),
        new TextRun({ text: value }),
      ],
    });
  }

  static async generatePldBuilderReport(
    userId: string,
    format: "PDF" | "DOCX" = "DOCX"
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    const sections = await prisma.pldSection.findMany({
      include: {
        attachments: true,
        questions: {
          include: { attachments: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    });

    const reportsDir = getReportsDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3001";
    const generatedAt = new Date().toLocaleString("pt-BR");

    const title = "Relatório PLD";
    const reportName = `Relatório PLD Builder - ${user.name}`;

    if (format === "DOCX") {
      const filename = `pld-builder-report-${userId}-${timestamp}.docx`;
      const filePath = path.join(reportsDir, filename);

      const children: Array<Paragraph | Table> = [
        new Paragraph({
          text: title,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [
            new TextRun({
              text: `Gerado por: ${user.name} <${user.email}>`,
              break: 1,
            }),
            new TextRun({ text: `Data: ${generatedAt}`, break: 1 }),
          ],
        }),
        
      ];

      sections.forEach((section) => {
        const sectionLabel = section.customLabel?.trim()
          ? `${section.item} - ${section.customLabel}`
          : section.item;
        children.push(
          new Paragraph({ text: sectionLabel, heading: HeadingLevel.HEADING_1 })
        );
        if (section.descricao) {
          children.push(
            new Paragraph({ text: section.descricao, spacing: { after: 160 } })
          );
        }

        const normaFiles = (section.attachments || []).filter(
          (a) => a.category === "NORMA"
        );
        const uniqueNormaFiles = Array.from(
          normaFiles
            .reduce((acc, att) => {
              acc.set(`${att.category}|${att.path}`, att);
              return acc;
            }, new Map<string, (typeof normaFiles)[number]>())
            .values()
        );
        if (uniqueNormaFiles.length > 0) {
          const normaCard: Paragraph[] = [
            new Paragraph({
              children: [
                new TextRun({ text: "Norma interna (arquivos)", bold: true }),
              ],
              spacing: { after: 120 },
            }),
          ];
          uniqueNormaFiles.forEach((att) => {
            const link = ReportService.buildBuilderAttachmentLink(att, baseUrl);
            normaCard.push(
              new Paragraph({
                bullet: { level: 0 },
                children: [
                  new ExternalHyperlink({
                    link,
                    children: [
                      new TextRun({
                        text: att.originalName,
                        style: "Hyperlink",
                        color: "0563C1",
                        underline: {},
                      }),
                    ],
                  }),
                ],
              })
            );
          });
          children.push(ReportService.buildDocxCard(normaCard));
          children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
        }

        (section.questions || []).forEach((question, index) => {
          const card: Paragraph[] = [
            ReportService.buildDocxCardTitle(
              `${index + 1}. ${question.texto || "-"}`
            ),
            ReportService.buildLabelValueParagraph(
              "Aplicável",
              question.aplicavel ? "Sim" : "Não"
            ),
          ];
          if (question.capitulacao)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Capitulação",
                question.capitulacao
              )
            );
          if (question.criticidade)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Criticidade",
                String(question.criticidade)
              )
            );
          if (question.resposta)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Resposta",
                question.resposta
              )
            );
          if (question.respostaTexto)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Resposta (texto)",
                question.respostaTexto
              )
            );
          if (question.deficienciaTexto)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Deficiência",
                question.deficienciaTexto
              )
            );
          if (question.recomendacaoTexto)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Recomendação",
                question.recomendacaoTexto
              )
            );
          if (question.testStatus)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Teste (status)",
                String(question.testStatus)
              )
            );
          if (question.testDescription)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Teste (descrição)",
                question.testDescription
              )
            );
          if (question.actionOrigem)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Ação (origem)",
                question.actionOrigem
              )
            );
          if (question.actionResponsavel)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Ação (responsável)",
                question.actionResponsavel
              )
            );
          if (question.actionDescricao)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Ação (descrição)",
                question.actionDescricao
              )
            );
          if (question.actionDataApontamento) {
            card.push(
              ReportService.buildLabelValueParagraph(
                "Ação (data apontamento)",
                new Date(question.actionDataApontamento).toLocaleDateString(
                  "pt-BR"
                )
              )
            );
          }
          if (question.actionPrazoOriginal) {
            card.push(
              ReportService.buildLabelValueParagraph(
                "Ação (prazo original)",
                new Date(question.actionPrazoOriginal).toLocaleDateString(
                  "pt-BR"
                )
              )
            );
          }
          if (question.actionPrazoAtual) {
            card.push(
              ReportService.buildLabelValueParagraph(
                "Ação (prazo atual)",
                new Date(question.actionPrazoAtual).toLocaleDateString("pt-BR")
              )
            );
          }
          if (question.actionComentarios)
            card.push(
              ReportService.buildLabelValueParagraph(
                "Ação (comentários)",
                question.actionComentarios
              )
            );

          const atts = question.attachments || [];
          const uniqueAtts = Array.from(
            atts
              .reduce((acc, att) => {
                acc.set(`${att.category}|${att.path}`, att);
                return acc;
              }, new Map<string, (typeof atts)[number]>())
              .values()
          );
          if (uniqueAtts.length > 0) {
            card.push(ReportService.buildDocxCardSectionTitle("Arquivos"));
            uniqueAtts.forEach((att) => {
              const link = ReportService.buildBuilderAttachmentLink(
                att,
                baseUrl
              );
              card.push(
                new Paragraph({
                  bullet: { level: 0 },
                  children: [
                    new TextRun({ text: `[${att.category}] ` }),
                    new ExternalHyperlink({
                      link,
                      children: [
                        new TextRun({
                          text: att.originalName,
                          style: "Hyperlink",
                          color: "0563C1",
                          underline: {},
                        }),
                      ],
                    }),
                  ],
                })
              );
              if (att.referenceText) {
                card.push(
                  new Paragraph({
                    indent: { left: 360 },
                    children: [
                      new TextRun({ text: `Referência: ${att.referenceText}` }),
                    ],
                  })
                );
              }
            });
          }

          children.push(ReportService.buildDocxCard(card));
          children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
        });

        children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
      });

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: children as any,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filePath, buffer);

      if (getStorageProvider() === "supabase") {
        await uploadFileToStorage({
          localPath: filePath,
          objectKey: `reports/${filename}`,
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          deleteLocal: true,
        });
      }

      const report = await (prisma as any).report.create({
        data: {
          name: reportName,
          type: "BUILDER",
          format: "DOCX",
          content: null,
          filePath: path.join("uploads", "reports", filename),
          userId: user.id,
        },
      });

      return report;
    }

    const filename = `pld-builder-report-${userId}-${timestamp}.pdf`;
    const filePath = path.join(reportsDir, filename);

    const pdf = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(filePath);
    pdf.pipe(stream);

    const marginLeft = pdf.page.margins.left;
    const marginRight = pdf.page.margins.right;
    const contentWidth = pdf.page.width - marginLeft - marginRight;
    const lineColor = "#e2e8f0";
    const textMuted = "#475569";
    const textDark = "#0f172a";
    const linkColor = "#1d4ed8";

    const ensureSpace = (minSpace: number) => {
      const bottom = pdf.page.height - pdf.page.margins.bottom;
      if (pdf.y + minSpace > bottom) {
        pdf.addPage();
      }
    };

    const hr = () => {
      ensureSpace(14);
      pdf.moveDown(0.2);
      pdf
        .moveTo(marginLeft, pdf.y)
        .lineTo(marginLeft + contentWidth, pdf.y)
        .strokeColor(lineColor)
        .stroke();
      pdf.moveDown(0.6);
    };

    const h1 = (text: string) => {
      ensureSpace(40);
      pdf
        .fillColor(textDark)
        .font("Helvetica-Bold")
        .fontSize(18)
        .text(text, { align: "center" });
      pdf.moveDown(0.8);
    };

    const h2 = (text: string) => {
      ensureSpace(30);
      pdf
        .fillColor(textDark)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text(text, marginLeft, pdf.y, { width: contentWidth });
      pdf.moveDown(0.4);
    };

    const h3 = (text: string) => {
      ensureSpace(24);
      pdf
        .fillColor(textDark)
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(text, marginLeft, pdf.y, { width: contentWidth });
      pdf.moveDown(0.3);
    };

    const p = (text: string) => {
      ensureSpace(24);
      pdf
        .fillColor(textMuted)
        .font("Helvetica")
        .fontSize(10.5)
        .text(text, marginLeft, pdf.y, { width: contentWidth, lineGap: 2 });
      pdf.moveDown(0.3);
    };

    const kv = (
      label: string,
      value: string,
      x: number = marginLeft,
      width: number = contentWidth
    ) => {
      ensureSpace(18);
      pdf
        .fillColor(textDark)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(`${label}: `, x, pdf.y, { continued: true, width });
      pdf
        .fillColor(textMuted)
        .font("Helvetica")
        .fontSize(10)
        .text(value || "-", { width, lineGap: 1 });
    };

    const measureTextHeight = (
      text: string,
      options: {
        width: number;
        font?: "Helvetica" | "Helvetica-Bold";
        fontSize: number;
        lineGap?: number;
      }
    ) => {
      const { width, font = "Helvetica", fontSize, lineGap = 0 } = options;
      return pdf
        .font(font)
        .fontSize(fontSize)
        .heightOfString(text || "-", { width, lineGap });
    };

    h1(title);
    pdf
      .fillColor(textMuted)
      .font("Helvetica")
      .fontSize(11)
      .text(`Gerado por: ${user.name} <${user.email}>`, { align: "center" });
    pdf.text(`Data: ${generatedAt}`, { align: "center" });
    pdf.moveDown(1.0);
    hr();

    sections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) {
        pdf.addPage();
      }

      const sectionLabel = section.customLabel?.trim()
        ? `${section.item} - ${section.customLabel}`
        : section.item;
      h2(sectionLabel);

      if (section.descricao) {
        p(section.descricao);
      }

      const normaFiles = (section.attachments || []).filter(
        (a) => a.category === "NORMA"
      );
      const uniqueNormaFiles = Array.from(
        normaFiles
          .reduce((acc, att) => {
            acc.set(`${att.category}|${att.path}`, att);
            return acc;
          }, new Map<string, (typeof normaFiles)[number]>())
          .values()
      );
      if (uniqueNormaFiles.length > 0) {
        h3("Norma interna (arquivos)");
        uniqueNormaFiles.forEach((att, idx) => {
          ensureSpace(18);
          const link = ReportService.buildBuilderAttachmentLink(att, baseUrl);
          pdf
            .fillColor(linkColor)
            .font("Helvetica")
            .fontSize(10.5)
            .text(`${idx + 1}. ${att.originalName}`, marginLeft, pdf.y, {
              width: contentWidth,
              link,
              underline: true,
              lineGap: 2,
            });
          pdf.fillColor(textMuted);
        });
        pdf.moveDown(0.6);
      }

      hr();
      (section.questions || []).forEach((question, index) => {
        const boxX = marginLeft;
        const boxW = contentWidth;
        const boxPaddingX = 16;
        const boxPaddingY = 14;
        const innerX = boxX + boxPaddingX;
        const innerW = boxW - boxPaddingX * 2;

        // Estimate height to avoid breaking the card across pages.
        const plannedLines: Array<{
          label: string;
          value: string | undefined;
        }> = [
          { label: "Aplicável", value: question.aplicavel ? "Sim" : "Não" },
          { label: "Capitulação", value: question.capitulacao },
          {
            label: "Criticidade",
            value:
              question.criticidade != null
                ? String(question.criticidade)
                : undefined,
          },
          { label: "Resposta", value: question.resposta },
          { label: "Resposta (texto)", value: question.respostaTexto },
          { label: "Deficiência", value: question.deficienciaTexto },
          { label: "Recomendação", value: question.recomendacaoTexto },
          {
            label: "Teste (status)",
            value:
              question.testStatus != null
                ? String(question.testStatus)
                : undefined,
          },
          { label: "Teste (descrição)", value: question.testDescription },
          { label: "Plano de ação (origem)", value: question.actionOrigem },
          {
            label: "Plano de ação (responsável)",
            value: question.actionResponsavel,
          },
          {
            label: "Plano de ação (descrição)",
            value: question.actionDescricao,
          },
          {
            label: "Plano de ação (data apontamento)",
            value: question.actionDataApontamento
              ? new Date(question.actionDataApontamento).toLocaleDateString(
                  "pt-BR"
                )
              : undefined,
          },
          {
            label: "Plano de ação (prazo original)",
            value: question.actionPrazoOriginal
              ? new Date(question.actionPrazoOriginal).toLocaleDateString(
                  "pt-BR"
                )
              : undefined,
          },
          {
            label: "Plano de ação (prazo atual)",
            value: question.actionPrazoAtual
              ? new Date(question.actionPrazoAtual).toLocaleDateString("pt-BR")
              : undefined,
          },
          {
            label: "Plano de ação (comentários)",
            value: question.actionComentarios,
          },
        ]
          .filter((lv) => lv.value != null && String(lv.value).trim() !== "")
          .map((lv) => ({ label: lv.label, value: String(lv.value) }));

        const atts = question.attachments || [];

        let estimatedHeight = 0;
        estimatedHeight += boxPaddingY; // top padding
        estimatedHeight += measureTextHeight(
          `${index + 1}. ${question.texto || "-"}`,
          {
            width: innerW,
            font: "Helvetica-Bold",
            fontSize: 12,
            lineGap: 2,
          }
        );
        estimatedHeight += 10; // spacing after title
        plannedLines.forEach(({ label, value }) => {
          estimatedHeight += measureTextHeight(`${label}: ${value || "-"}`, {
            width: innerW,
            font: "Helvetica",
            fontSize: 10,
            lineGap: 1,
          });
          estimatedHeight += 2;
        });

        // Estimate attachments block
        const uniqueAttachmentsForEstimate = Array.from(
          atts
            .reduce((acc, att) => {
              acc.set(`${att.category}|${att.path}`, att);
              return acc;
            }, new Map<string, (typeof atts)[number]>())
            .values()
        );
        if (uniqueAttachmentsForEstimate.length > 0) {
          estimatedHeight += 14; // spacing + header
          estimatedHeight += measureTextHeight("Arquivos", {
            width: innerW,
            font: "Helvetica-Bold",
            fontSize: 10.5,
          });
          uniqueAttachmentsForEstimate.forEach((att) => {
            estimatedHeight += measureTextHeight(
              `• [${att.category}] ${att.originalName}`,
              {
                width: innerW,
                font: "Helvetica",
                fontSize: 10,
                lineGap: 2,
              }
            );
            if (att.referenceText) {
              estimatedHeight += measureTextHeight(
                `  Referência: ${att.referenceText}`,
                {
                  width: innerW - 10,
                  font: "Helvetica",
                  fontSize: 9.5,
                  lineGap: 2,
                }
              );
            }
            estimatedHeight += 2;
          });
        }
        estimatedHeight += boxPaddingY + 10; // bottom padding + after-box spacing

        ensureSpace(Math.ceil(estimatedHeight));
        const boxY = pdf.y;

        pdf.y = boxY + boxPaddingY;
        pdf
          .fillColor(textDark)
          .font("Helvetica-Bold")
          .fontSize(12)
          .text(`${index + 1}. ${question.texto || "-"}`, innerX, pdf.y, {
            width: innerW,
            lineGap: 2,
          });
        pdf.moveDown(0.4);

        pdf.fillColor(textMuted).font("Helvetica").fontSize(10);
        kv("Aplicável", question.aplicavel ? "Sim" : "Não", innerX, innerW);
        if (question.capitulacao)
          kv("Capitulação", question.capitulacao, innerX, innerW);
        if (question.criticidade)
          kv("Criticidade", String(question.criticidade), innerX, innerW);
        if (question.resposta)
          kv("Resposta", question.resposta, innerX, innerW);
        if (question.respostaTexto)
          kv("Resposta (texto)", question.respostaTexto, innerX, innerW);
        if (question.deficienciaTexto)
          kv("Deficiência", question.deficienciaTexto, innerX, innerW);
        if (question.recomendacaoTexto)
          kv("Recomendação", question.recomendacaoTexto, innerX, innerW);
        if (question.testStatus)
          kv("Teste (status)", String(question.testStatus), innerX, innerW);
        if (question.testDescription)
          kv("Teste (descrição)", question.testDescription, innerX, innerW);
        if (question.actionOrigem)
          kv("Plano de ação (origem)", question.actionOrigem, innerX, innerW);
        if (question.actionResponsavel)
          kv(
            "Plano de ação (responsável)",
            question.actionResponsavel,
            innerX,
            innerW
          );
        if (question.actionDescricao)
          kv(
            "Plano de ação (descrição)",
            question.actionDescricao,
            innerX,
            innerW
          );
        if (question.actionDataApontamento) {
          kv(
            "Plano de ação (data apontamento)",
            new Date(question.actionDataApontamento).toLocaleDateString(
              "pt-BR"
            ),
            innerX,
            innerW
          );
        }
        if (question.actionPrazoOriginal) {
          kv(
            "Plano de ação (prazo original)",
            new Date(question.actionPrazoOriginal).toLocaleDateString("pt-BR"),
            innerX,
            innerW
          );
        }
        if (question.actionPrazoAtual) {
          kv(
            "Plano de ação (prazo atual)",
            new Date(question.actionPrazoAtual).toLocaleDateString("pt-BR"),
            innerX,
            innerW
          );
        }
        if (question.actionComentarios)
          kv(
            "Plano de ação (comentários)",
            question.actionComentarios,
            innerX,
            innerW
          );

        const uniqueAtts = Array.from(
          atts
            .reduce((acc, att) => {
              acc.set(`${att.category}|${att.path}`, att);
              return acc;
            }, new Map<string, (typeof atts)[number]>())
            .values()
        );
        if (uniqueAtts.length > 0) {
          pdf.moveDown(0.4);
          pdf
            .fillColor(textDark)
            .font("Helvetica-Bold")
            .fontSize(10.5)
            .text("Arquivos", innerX, pdf.y);
          pdf.moveDown(0.2);
          uniqueAtts.forEach((att, attIndex) => {
            ensureSpace(18);
            const link = ReportService.buildBuilderAttachmentLink(att, baseUrl);
            pdf
              .fillColor(linkColor)
              .font("Helvetica")
              .fontSize(10)
              .text(`• [${att.category}] ${att.originalName}`, innerX, pdf.y, {
                width: innerW,
                link,
                underline: true,
                lineGap: 2,
              });
            pdf.fillColor(textMuted);
            if (att.referenceText) {
              pdf
                .fillColor(textMuted)
                .font("Helvetica")
                .fontSize(9.5)
                .text(
                  `  Referência: ${att.referenceText}`,
                  innerX + 10,
                  pdf.y,
                  {
                    width: innerW - 10,
                    lineGap: 2,
                  }
                );
            }
            // keep small spacing between attachments
            if (attIndex < uniqueAtts.length - 1) pdf.moveDown(0.1);
          });
        }

        const boxEndY = pdf.y + boxPaddingY;
        pdf
          .strokeColor(lineColor)
          .rect(boxX, boxY, boxW, boxEndY - boxY)
          .stroke();
        pdf.y = boxEndY + 10;
      });
    });

    pdf.end();
    await new Promise<void>((resolve, reject) => {
      stream.on("finish", () => resolve());
      stream.on("error", (err) => reject(err));
    });

    if (getStorageProvider() === "supabase") {
      await uploadFileToStorage({
        localPath: filePath,
        objectKey: `reports/${filename}`,
        contentType: "application/pdf",
        deleteLocal: true,
      });
    }

    const report = await (prisma as any).report.create({
      data: {
        name: reportName,
        type: "BUILDER",
        format: "PDF",
        content: null,
        filePath: path.join("uploads", "reports", filename),
        userId: user.id,
      },
    });

    return report;
  }

  static async generateUserReport(
    userId: string,
    type: "PARTIAL" | "FULL" = "FULL",
    format: "PDF" | "DOCX" = "PDF",
    topicIds?: string[]
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    const fullProgress = await FormService.calculateProgress(userId);

    let data = await FormService.getFormData(userId);
    if (topicIds && topicIds.length > 0) {
      const allowed = new Set(topicIds);
      data = (data as any[]).filter((t: any) => allowed.has(t.id));
    }

    const progress = (() => {
      if (!topicIds || topicIds.length === 0) return fullProgress;
      let totalApplicable = 0;
      let totalAnswered = 0;
      let totalQuestions = 0;
      (data as any[]).forEach((topic: any) => {
        (topic.questions || []).forEach((q: any) => {
          totalQuestions += 1;
          if (q.isApplicable) {
            totalApplicable += 1;
            if (q.answer) {
              totalAnswered += 1;
            }
          }
        });
      });
      const pct =
        totalApplicable > 0
          ? Math.round((totalAnswered / totalApplicable) * 100)
          : 0;
      return { progress: pct, totalApplicable, totalAnswered, totalQuestions };
    })();

    if (type === "FULL" && progress.progress < 100) {
      throw new Error(
        "Relatório final só pode ser gerado com 100% de conclusão"
      );
    }

    const reportsDir = getReportsDir();
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3001";

    if (format === "DOCX") {
      const filename = `pld-report-${userId}-${timestamp}.docx`;
      const filePath = path.join(reportsDir, filename);

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: "Relatório de Conformidade PLD",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 240 },
                children: [
                  new TextRun({
                    text: `Usuário: ${user.name} <${user.email}>`,
                    break: 1,
                  }),
                  new TextRun({
                    text: `Data: ${new Date().toLocaleString("pt-BR")}`,
                    break: 1,
                  }),
                  new TextRun({
                    text: `Tipo de relatório: ${
                      type === "FULL" ? "Final" : "Parcial"
                    }`,
                    break: 1,
                  }),
                ],
              }),
              new Paragraph({
                text: "Resumo de Progresso",
                heading: HeadingLevel.HEADING_2,
              }),
              ReportService.buildDocxCard([
                ReportService.buildLabelValueParagraph(
                  "Progresso",
                  `${progress.progress}%`
                ),
                ReportService.buildLabelValueParagraph(
                  "Perguntas aplicáveis",
                  String(progress.totalApplicable)
                ),
                ReportService.buildLabelValueParagraph(
                  "Perguntas respondidas",
                  String(progress.totalAnswered)
                ),
                ReportService.buildLabelValueParagraph(
                  "Total de perguntas",
                  String(progress.totalQuestions),
                  { spacingAfter: 0 }
                ),
              ]),
              new Paragraph({ text: "", spacing: { after: 200 } }),
              new Paragraph({
                text: "Detalhamento por Tópico",
                heading: HeadingLevel.HEADING_2,
              }),
              ...((data as any[]).flatMap((topic: any, topicIndex: number) => {
                const topicBlocks: Array<Paragraph | Table> = [
                  ...(topicIndex > 0
                    ? [new Paragraph({ children: [new PageBreak()] })]
                    : []),
                  new Paragraph({
                    text: `Tópico: ${topic.name}`,
                    heading: HeadingLevel.HEADING_3,
                  }),
                ];

                if (topic.description) {
                  topicBlocks.push(
                    new Paragraph({ text: `Descrição: ${topic.description}` })
                  );
                }
                if (topic.internalNorm) {
                  topicBlocks.push(
                    new Paragraph({
                      text: `Identificação: ${topic.internalNorm}`,
                    })
                  );
                }
                if (topic.normOriginalName) {
                  topicBlocks.push(
                    new Paragraph({
                      text: `Arquivo da norma: ${topic.normOriginalName}`,
                    })
                  );
                }
                topicBlocks.push(
                  new Paragraph({ text: "", spacing: { after: 120 } })
                );

                topic.questions.forEach((question: any, index: number) => {
                  const qCard: Paragraph[] = [
                    ReportService.buildDocxCardTitle(
                      `${index + 1}. ${question.title || "-"}`
                    ),
                  ];

                  if (question.description) {
                    qCard.push(
                      new Paragraph({
                        spacing: { after: 120 },
                        children: [
                          new TextRun({
                            text: `Descrição: ${question.description}`,
                          }),
                        ],
                      })
                    );
                  }

                  if (!question.isApplicable) {
                    qCard.push(
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Status: Não aplicável",
                            italics: true,
                          }),
                        ],
                        spacing: { after: 0 },
                      })
                    );
                    topicBlocks.push(ReportService.buildDocxCard(qCard));
                    topicBlocks.push(
                      new Paragraph({ text: "", spacing: { after: 160 } })
                    );
                    return;
                  }

                  const answer = question.answer;
                  if (!answer) {
                    qCard.push(
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Status: Não respondida",
                            italics: true,
                          }),
                        ],
                        spacing: { after: 0 },
                      })
                    );
                    topicBlocks.push(ReportService.buildDocxCard(qCard));
                    topicBlocks.push(
                      new Paragraph({ text: "", spacing: { after: 160 } })
                    );
                    return;
                  }

                  qCard.push(
                    ReportService.buildLabelValueParagraph(
                      "Resposta",
                      answer.response ? "Sim" : "Não"
                    )
                  );
                  if (answer.justification)
                    qCard.push(
                      ReportService.buildLabelValueParagraph(
                        "Justificativa",
                        answer.justification
                      )
                    );
                  if (answer.deficiency)
                    qCard.push(
                      ReportService.buildLabelValueParagraph(
                        "Deficiência",
                        answer.deficiency
                      )
                    );
                  if (answer.recommendation)
                    qCard.push(
                      ReportService.buildLabelValueParagraph(
                        "Recomendação",
                        answer.recommendation
                      )
                    );

                  if (answer.evidences && answer.evidences.length > 0) {
                    qCard.push(
                      ReportService.buildDocxCardSectionTitle("Evidências")
                    );
                    answer.evidences.forEach((ev: any) => {
                      const link = ReportService.buildEvidenceLink(ev, baseUrl);
                      qCard.push(
                        new Paragraph({
                          bullet: { level: 0 },
                          children: [
                            new ExternalHyperlink({
                              link,
                              children: [
                                new TextRun({
                                  text: ev.originalName,
                                  style: "Hyperlink",
                                  color: "0563C1",
                                  underline: {},
                                }),
                              ],
                            }),
                          ],
                        })
                      );
                    });
                  }

                  topicBlocks.push(ReportService.buildDocxCard(qCard));
                  topicBlocks.push(
                    new Paragraph({ text: "", spacing: { after: 160 } })
                  );
                });

                topicBlocks.push(
                  new Paragraph({ text: "", spacing: { after: 200 } })
                );
                return topicBlocks;
              }) as Paragraph[]),
            ],
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filePath, buffer);

      if (getStorageProvider() === "supabase") {
        await uploadFileToStorage({
          localPath: filePath,
          objectKey: `reports/${filename}`,
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          deleteLocal: true,
        });
      }

      const report = await (prisma as any).report.create({
        data: {
          name: `Relatório PLD - ${user.name}`,
          type,
          format: "DOCX",
          content: null,
          filePath: path.join("uploads", "reports", filename),
          userId: user.id,
        },
      });

      return report;
    }

    // PDF com links
    const filename = `pld-report-${userId}-${timestamp}.pdf`;
    const filePath = path.join(reportsDir, filename);

    const pdf = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(filePath);
    pdf.pipe(stream);

    const marginLeft = pdf.page.margins.left;
    const marginRight = pdf.page.margins.right;
    const contentWidth = pdf.page.width - marginLeft - marginRight;
    const lineColor = "#e2e8f0";
    const textMuted = "#475569";
    const textDark = "#0f172a";
    const linkColor = "#1d4ed8";
    const generatedAt = new Date().toLocaleString("pt-BR");

    const ensureSpace = (minSpace: number) => {
      const bottom = pdf.page.height - pdf.page.margins.bottom;
      if (pdf.y + minSpace > bottom) {
        pdf.addPage();
      }
    };

    const hr = () => {
      ensureSpace(14);
      pdf.moveDown(0.2);
      pdf
        .moveTo(marginLeft, pdf.y)
        .lineTo(marginLeft + contentWidth, pdf.y)
        .strokeColor(lineColor)
        .stroke();
      pdf.moveDown(0.6);
    };

    const h1 = (text: string) => {
      ensureSpace(40);
      pdf
        .fillColor(textDark)
        .font("Helvetica-Bold")
        .fontSize(18)
        .text(text, { align: "center" });
      pdf.moveDown(0.8);
    };

    const h2 = (text: string) => {
      ensureSpace(30);
      pdf
        .fillColor(textDark)
        .font("Helvetica-Bold")
        .fontSize(14)
        .text(text, marginLeft, pdf.y, { width: contentWidth });
      pdf.moveDown(0.4);
    };

    const p = (text: string) => {
      ensureSpace(22);
      pdf
        .fillColor(textMuted)
        .font("Helvetica")
        .fontSize(10.5)
        .text(text, marginLeft, pdf.y, { width: contentWidth, lineGap: 2 });
      pdf.moveDown(0.25);
    };

    const kv = (
      label: string,
      value: string,
      x: number = marginLeft,
      width: number = contentWidth
    ) => {
      ensureSpace(18);
      pdf
        .fillColor(textDark)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(`${label}: `, x, pdf.y, { continued: true, width });
      pdf
        .fillColor(textMuted)
        .font("Helvetica")
        .fontSize(10)
        .text(value || "-", { width, lineGap: 1 });
    };

    const measureTextHeight = (
      text: string,
      options: {
        width: number;
        font?: "Helvetica" | "Helvetica-Bold";
        fontSize: number;
        lineGap?: number;
      }
    ) => {
      const { width, font = "Helvetica", fontSize, lineGap = 0 } = options;
      return pdf
        .font(font)
        .fontSize(fontSize)
        .heightOfString(text || "-", { width, lineGap });
    };

    h1("Relatório de Conformidade PLD");
    pdf
      .fillColor(textMuted)
      .font("Helvetica")
      .fontSize(11)
      .text(`Usuário: ${user.name} <${user.email}>`, { align: "center" });
    pdf.text(`Data: ${generatedAt}`, { align: "center" });
    pdf.text(`Tipo de relatório: ${type === "FULL" ? "Final" : "Parcial"}`, {
      align: "center",
    });
    pdf.moveDown(0.8);
    hr();

    h2("Resumo de Progresso");
    {
      const boxX = marginLeft;
      const boxY = pdf.y;
      const boxW = contentWidth;
      const boxPaddingX = 16;
      const boxPaddingY = 14;
      const innerX = boxX + boxPaddingX;
      const innerW = boxW - boxPaddingX * 2;
      const estimated =
        boxPaddingY +
        measureTextHeight("Progresso: 100%", {
          width: innerW,
          font: "Helvetica",
          fontSize: 10,
          lineGap: 1,
        }) *
          4 +
        boxPaddingY +
        8;
      ensureSpace(Math.ceil(estimated));

      pdf.y = boxY + boxPaddingY;
      kv("Progresso", `${progress.progress}%`, innerX, innerW);
      kv(
        "Perguntas aplicáveis",
        String(progress.totalApplicable),
        innerX,
        innerW
      );
      kv(
        "Perguntas respondidas",
        String(progress.totalAnswered),
        innerX,
        innerW
      );
      kv("Total de perguntas", String(progress.totalQuestions), innerX, innerW);
      const boxEndY = pdf.y + boxPaddingY;
      pdf
        .strokeColor(lineColor)
        .rect(boxX, boxY, boxW, boxEndY - boxY)
        .stroke();
      pdf.y = boxEndY + 10;
    }

    hr();
    h2("Detalhamento por Tópico");
    (data as any[]).forEach((topic: any, topicIndex: number) => {
      if (topicIndex > 0) {
        pdf.addPage();
      }

      const topicTitle = topic?.name ? `Tópico: ${topic.name}` : "Tópico";
      h2(topicTitle);
      if (topic.description) p(`Descrição: ${topic.description}`);
      if (topic.internalNorm) p(`Identificação: ${topic.internalNorm}`);
      if (topic.normOriginalName)
        p(`Arquivo da norma: ${topic.normOriginalName}`);
      hr();
      (topic.questions || []).forEach((question: any, index: number) => {
        const boxX = marginLeft;
        const boxW = contentWidth;
        const boxPaddingX = 16;
        const boxPaddingY = 14;
        const innerX = boxX + boxPaddingX;
        const innerW = boxW - boxPaddingX * 2;

        const titleText = `${index + 1}. ${question.title || "-"}`;
        let estimatedHeight = 0;
        estimatedHeight += boxPaddingY;
        estimatedHeight += measureTextHeight(titleText, {
          width: innerW,
          font: "Helvetica-Bold",
          fontSize: 12,
          lineGap: 2,
        });
        estimatedHeight += 8;

        if (question.description) {
          estimatedHeight += measureTextHeight(
            `Descrição: ${question.description}`,
            {
              width: innerW,
              font: "Helvetica",
              fontSize: 10,
              lineGap: 2,
            }
          );
          estimatedHeight += 4;
        }

        const isApplicable = !!question.isApplicable;
        if (!isApplicable) {
          estimatedHeight += measureTextHeight("Status: Não aplicável", {
            width: innerW,
            font: "Helvetica",
            fontSize: 10,
            lineGap: 2,
          });
          estimatedHeight += boxPaddingY + 10;
          ensureSpace(Math.ceil(estimatedHeight));
        } else {
          const answer = question.answer;
          if (!answer) {
            estimatedHeight += measureTextHeight("Status: Não respondida", {
              width: innerW,
              font: "Helvetica",
              fontSize: 10,
              lineGap: 2,
            });
            estimatedHeight += boxPaddingY + 10;
            ensureSpace(Math.ceil(estimatedHeight));
          } else {
            estimatedHeight += measureTextHeight(
              `Resposta: ${answer.response ? "Sim" : "Não"}`,
              {
                width: innerW,
                font: "Helvetica",
                fontSize: 10,
                lineGap: 2,
              }
            );
            if (answer.justification) {
              estimatedHeight += measureTextHeight(
                `Justificativa: ${answer.justification}`,
                {
                  width: innerW,
                  font: "Helvetica",
                  fontSize: 10,
                  lineGap: 2,
                }
              );
            }
            if (answer.deficiency) {
              estimatedHeight += measureTextHeight(
                `Deficiência: ${answer.deficiency}`,
                {
                  width: innerW,
                  font: "Helvetica",
                  fontSize: 10,
                  lineGap: 2,
                }
              );
            }
            if (answer.recommendation) {
              estimatedHeight += measureTextHeight(
                `Recomendação: ${answer.recommendation}`,
                {
                  width: innerW,
                  font: "Helvetica",
                  fontSize: 10,
                  lineGap: 2,
                }
              );
            }
            if (answer.evidences && answer.evidences.length > 0) {
              estimatedHeight += 10;
              estimatedHeight += measureTextHeight("Evidências", {
                width: innerW,
                font: "Helvetica-Bold",
                fontSize: 10.5,
              });
              answer.evidences.forEach((ev: any, evIndex: number) => {
                estimatedHeight += measureTextHeight(
                  `• ${evIndex + 1}. ${ev.originalName}`,
                  {
                    width: innerW,
                    font: "Helvetica",
                    fontSize: 10,
                    lineGap: 2,
                  }
                );
              });
            }
            estimatedHeight += boxPaddingY + 10;
            ensureSpace(Math.ceil(estimatedHeight));
          }
        }

        const boxY = pdf.y;
        pdf.y = boxY + boxPaddingY;
        pdf
          .fillColor(textDark)
          .font("Helvetica-Bold")
          .fontSize(12)
          .text(titleText, innerX, pdf.y, { width: innerW, lineGap: 2 });
        pdf.moveDown(0.25);
        if (question.description) {
          pdf
            .fillColor(textMuted)
            .font("Helvetica")
            .fontSize(10)
            .text(`Descrição: ${question.description}`, innerX, pdf.y, {
              width: innerW,
              lineGap: 2,
            });
          pdf.moveDown(0.15);
        }

        if (!question.isApplicable) {
          pdf
            .fillColor(textMuted)
            .font("Helvetica-Oblique")
            .fontSize(10)
            .text("Status: Não aplicável", innerX, pdf.y, {
              width: innerW,
              lineGap: 2,
            });
        } else {
          const answer = question.answer;
          if (!answer) {
            pdf
              .fillColor(textMuted)
              .font("Helvetica-Oblique")
              .fontSize(10)
              .text("Status: Não respondida", innerX, pdf.y, {
                width: innerW,
                lineGap: 2,
              });
          } else {
            kv("Resposta", answer.response ? "Sim" : "Não", innerX, innerW);
            if (answer.justification)
              kv("Justificativa", answer.justification, innerX, innerW);
            if (answer.deficiency)
              kv("Deficiência", answer.deficiency, innerX, innerW);
            if (answer.recommendation)
              kv("Recomendação", answer.recommendation, innerX, innerW);

            if (answer.evidences && answer.evidences.length > 0) {
              pdf.moveDown(0.25);
              pdf
                .fillColor(textDark)
                .font("Helvetica-Bold")
                .fontSize(10.5)
                .text("Evidências", innerX, pdf.y);
              pdf.moveDown(0.15);
              answer.evidences.forEach((ev: any, evIndex: number) => {
                ensureSpace(18);
                const link = ReportService.buildEvidenceLink(ev, baseUrl);
                pdf
                  .fillColor(linkColor)
                  .font("Helvetica")
                  .fontSize(10)
                  .text(`• ${evIndex + 1}. ${ev.originalName}`, innerX, pdf.y, {
                    width: innerW,
                    link,
                    underline: true,
                    lineGap: 2,
                  });
                pdf.fillColor(textMuted);
              });
            }
          }
        }

        const boxEndY = pdf.y + boxPaddingY;
        pdf
          .strokeColor(lineColor)
          .rect(boxX, boxY, boxW, boxEndY - boxY)
          .stroke();
        pdf.y = boxEndY + 10;
      });
    });

    pdf.end();

    await new Promise<void>((resolve, reject) => {
      stream.on("finish", () => resolve());
      stream.on("error", (err) => reject(err));
    });

    if (getStorageProvider() === "supabase") {
      await uploadFileToStorage({
        localPath: filePath,
        objectKey: `reports/${filename}`,
        contentType: "application/pdf",
        deleteLocal: true,
      });
    }

    const report = await (prisma as any).report.create({
      data: {
        name: `Relatório PLD - ${user.name}`,
        type,
        format: "PDF",
        content: null,
        filePath: path.join("uploads", "reports", filename),
        userId: user.id,
      },
    });

    return report;
  }

  static async getReportById(id: string) {
    return (prisma as any).report.findUnique({ where: { id } });
  }
}
