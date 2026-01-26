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
  private static sanitizeQuestionTitle(raw: unknown): string {
    if (typeof raw !== "string") return "-";
    const title = raw.trim();
    return title || "-";
  }

  private static formatDatePtBr(date: Date): string {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  }

  private static getSectionLabels(sections: any[]) {
    return sections.map((section) => {
      const label = (section?.customLabel || "").trim()
        ? `${section.item} - ${section.customLabel}`
        : section?.item;
      return label || "-";
    });
  }

  private static collectDeficiencias(sections: any[]) {
    const items: Array<{
      sectionLabel: string;
      questionTitle: string;
      deficiencia: string;
      criticidade?: string;
      recomendacao?: string;
    }> = [];
    sections.forEach((section) => {
      const sectionLabel = (section?.customLabel || "").trim()
        ? `${section.item} - ${section.customLabel}`
        : section?.item;
      (section?.questions || []).forEach((question: any) => {
        if (!question?.deficienciaTexto) return;
        items.push({
          sectionLabel: sectionLabel || "-",
          questionTitle: ReportService.sanitizeQuestionTitle(question?.texto),
          deficiencia: String(question.deficienciaTexto),
          criticidade: question?.criticidade ? String(question.criticidade) : undefined,
          recomendacao: question?.recomendacaoTexto
            ? String(question.recomendacaoTexto)
            : undefined,
        });
      });
    });
    return items;
  }

  private static buildDocxFullWidthTitle(
    text: string,
    alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT
  ) {
    return new Paragraph({
      text,
      heading: HeadingLevel.HEADING_1,
      alignment,
    });
  }

  private static buildDocxCard(children: Array<Paragraph | Table>) {
    const cardWidthTwips = 9360; // Largura da A4 com margens de 1 polegada
    return new Table({
      layout: TableLayoutType.FIXED,
      width: { size: cardWidthTwips, type: WidthType.DXA },
      columnWidths: [cardWidthTwips],
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        left: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        right: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 0, color: "FFFFFF" },
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
          size: 24,
        }),
      ],
    });
  }

  private static buildExecutionItemTitleDocx(text: string) {
    return new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text,
          bold: true,
          size: 22,
        }),
      ],
    });
  }

  private static buildDocxCardSectionTitle(text: string) {
    return new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [new TextRun({ text, bold: true })],
    });
  }

  private static buildCriteriaTableDocx(
    rows: Array<{ label: string; description: string; labelFill: string }>
  ) {
    const tableWidth = 9360;
    const labelWidth = 2200;
    const descWidth = tableWidth - labelWidth;
    return new Table({
      layout: TableLayoutType.FIXED,
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: [labelWidth, descWidth],
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        left: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        right: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
        insideVertical: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
      },
      rows: rows.map((row) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: labelWidth, type: WidthType.DXA },
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
              shading: {
                type: ShadingType.CLEAR,
                color: "auto",
                fill: row.labelFill.replace(/^#/, ""),
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: row.label, bold: true })],
                }),
              ],
            }),
            new TableCell({
              width: { size: descWidth, type: WidthType.DXA },
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: row.description })],
                }),
              ],
            }),
          ],
        })
      ),
    });
  }

  private static buildCriticidadeTableDocx() {
    return ReportService.buildCriteriaTableDocx([
      {
        label: "ALTA",
        description:
          "Quando a deficiência comprometer de maneira significativa a efetividade do controle de PLD/FTP associado.",
        labelFill: "#FEE2E2",
      },
      {
        label: "MÉDIA",
        description:
          "Quando a deficiência corresponder a inobservância de boa prática de PLD/FTP ou quando a deficiência comprometer parcialmente a efetividade do controle de PLD/FTP associado.",
        labelFill: "#FEF9C3",
      },
      {
        label: "BAIXA",
        description:
          "Quando a deficiência não compromete a efetividade do controle de PLD/FTP associado.",
        labelFill: "#DCFCE7",
      },
    ]);
  }

  private static buildEfetividadeTableDocx() {
    return ReportService.buildCriteriaTableDocx([
      {
        label: "EFETIVO",
        description:
          "Quando o programa de PLD/FTP atingir a maioria dos resultados esperados, sem a identificação de deficiências de alta criticidade nos procedimentos de monitoramento, seleção, análise e comunicação de operações atípicas, nos procedimentos de verificação de sanções CSNU, e nos procedimentos conheça seu cliente.",
        labelFill: "#DCFCE7",
      },
      {
        label: "PARCIALMENTE EFETIVO",
        description:
          "Quando o programa de PLD/FTP atingir a maioria dos resultados esperados, com a identificação de algumas deficiências de alta criticidade nos procedimentos conheça seu cliente ou nos procedimentos de monitoramento, seleção, análise e comunicação de operações atípicas.",
        labelFill: "#FEF9C3",
      },
      {
        label: "POUCO EFETIVO",
        description:
          "Quando o programa de PLD/FTP não atingir a maioria dos resultados esperados, com a identificação de deficiências de alta criticidade nos procedimentos de monitoramento, seleção, análise e comunicação de operações atípicas, nos procedimentos de verificação de sanções CSNU, e nos procedimentos conheça seu cliente.",
        labelFill: "#FEE2E2",
      },
    ]);
  }

  private static buildConclusaoRows(sections: any[]) {
    const rows = sections.map((section) => {
      const label = (section?.customLabel || "").trim()
        ? `${section.item} - ${section.customLabel}`
        : section?.item || "-";
      const counts = { baixa: 0, media: 0, alta: 0 };
      (section?.questions || []).forEach((question: any) => {
        if (!question?.deficienciaTexto) return;
        const crit = String(question?.criticidade || "").toUpperCase();
        if (crit === "BAIXA") counts.baixa += 1;
        else if (crit === "MEDIA" || crit === "MÉDIA") counts.media += 1;
        else if (crit === "ALTA") counts.alta += 1;
      });
      const total = counts.baixa + counts.media + counts.alta;
      return { label, ...counts, total };
    });

    const totalRow = rows.reduce(
      (acc, row) => {
        acc.baixa += row.baixa;
        acc.media += row.media;
        acc.alta += row.alta;
        acc.total += row.total;
        return acc;
      },
      { label: "TOTAL", baixa: 0, media: 0, alta: 0, total: 0 }
    );

    return [...rows, totalRow];
  }

  private static buildConclusaoTableDocx(
    rows: Array<{ label: string; baixa: number; media: number; alta: number; total: number }>
  ) {
    const tableWidth = 9360;
    const labelWidth = 5200;
    const colWidth = Math.floor((tableWidth - labelWidth) / 4);
    const baixaFill = "DCFCE7";
    const mediaFill = "FEF9C3";
    const altaFill = "FEE2E2";

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
          width: { size: colWidth, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: baixaFill },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "BAIXA", bold: true })],
            }),
          ],
        }),
        new TableCell({
          width: { size: colWidth, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: mediaFill },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "MÉDIA", bold: true })],
            }),
          ],
        }),
        new TableCell({
          width: { size: colWidth, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: altaFill },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "ALTA", bold: true })],
            }),
          ],
        }),
        new TableCell({
          width: { size: colWidth, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1F5F9" },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "TOTAL", bold: true })],
            }),
          ],
        }),
      ],
    });

    const bodyRows = rows.map((row) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: labelWidth, type: WidthType.DXA },
            children: [new Paragraph({ text: row.label })],
          }),
          new TableCell({
            width: { size: colWidth, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: baixaFill },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                text: String(row.baixa),
              }),
            ],
          }),
          new TableCell({
            width: { size: colWidth, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: mediaFill },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                text: String(row.media),
              }),
            ],
          }),
          new TableCell({
            width: { size: colWidth, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: altaFill },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                text: String(row.alta),
              }),
            ],
          }),
          new TableCell({
            width: { size: colWidth, type: WidthType.DXA },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                text: String(row.total),
              }),
            ],
          }),
        ],
      })
    );

    return new Table({
      layout: TableLayoutType.FIXED,
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: [labelWidth, colWidth, colWidth, colWidth, colWidth],
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: "94A3B8" },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "94A3B8" },
        left: { style: BorderStyle.SINGLE, size: 8, color: "94A3B8" },
        right: { style: BorderStyle.SINGLE, size: 8, color: "94A3B8" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 8, color: "94A3B8" },
        insideVertical: { style: BorderStyle.SINGLE, size: 8, color: "94A3B8" },
      },
      rows: [headerRow, ...bodyRows],
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

  private static buildBuilderAttachmentLink(att: any, baseUrl: string) {
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

  static async generatePldUserFormReport(
    formId: string,
    requester: { requesterId: string; requesterRole?: string | null; requesterEmail?: string | null },
    format: "PDF" | "DOCX" = "PDF"
  ) {
    const requesterUser = await prisma.user.findUnique({
      where: { id: requester.requesterId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!requesterUser) throw new Error("Usuário não encontrado");

    const reportForm = await (prisma as any).report.findUnique({ where: { id: formId } });
    if (!reportForm || reportForm.type !== "BUILDER_FORM") {
      throw new Error("Formulário não encontrado");
    }

    const requesterRole = (requester.requesterRole || requesterUser.role || "").toUpperCase();
    const requesterEmail = (requester.requesterEmail || requesterUser.email || "").toLowerCase();

    // Permissões:
    // - ADMIN pode gerar
    // - TRIAL_ADMIN pode gerar se for o dono do formulário
    // - usuário comum só se for o email atribuído
    if (requesterRole === "ADMIN") {
      // ok
    } else if (requesterRole === "TRIAL_ADMIN") {
      if (reportForm.userId !== requesterUser.id) {
        throw new Error("Você não tem permissão para gerar este relatório");
      }
    } else {
      const assigned = (reportForm.assignedToEmail || "").toLowerCase();
      if (!assigned || assigned !== requesterEmail) {
        throw new Error("Você não tem permissão para gerar este relatório");
      }
    }

    let payload: any = null;
    try {
      payload = reportForm.content ? JSON.parse(reportForm.content) : null;
    } catch {
      payload = null;
    }
    if (!payload || typeof payload !== "object") {
      throw new Error("Conteúdo do formulário inválido");
    }

    const sections: any[] = Array.isArray(payload.sections) ? payload.sections : [];
    const metadata: any = payload.metadata || null;
    const helpTexts: any = payload.helpTexts || null;

    const introInstituicoes = Array.isArray(metadata?.instituicoes)
      ? metadata.instituicoes
      : [];
    const introAvaliador = (metadata?.qualificacaoAvaliador || "").toString().trim();
    const mostrarMetodologia = (metadata?.mostrarMetodologia || "MOSTRAR").toString();
    const incluirRecomendacoes = (metadata?.incluirRecomendacoes || "INCLUIR").toString();
    const deficiencias = ReportService.collectDeficiencias(sections);

    const baseUrl = (process.env.PUBLIC_BASE_URL || "http://localhost:3001")
      .replace(/\/api\/?$/, "")
      .replace(/\/+$/, "");
    const generatedAt = new Date().toLocaleString("pt-BR");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportsDir = getReportsDir();

    const title = "Relatório PLD";
    const formName = (reportForm.name || "Formulário").toString().trim() || "Formulário";
    const reportName = `Relatório PLD - ${formName}`;

    const safeDate = (value: any) => {
      if (!value) return null;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      return d;
    };

    if (format === "DOCX") {
      const filename = `pld-form-report-${formId}-${timestamp}.docx`;
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
              text: `Gerado por: ${requesterUser.name} <${requesterUser.email}>`,
              break: 1,
            }),
            new TextRun({ text: `Formulário: ${formName}`, break: 1 }),
            new TextRun({
              text: reportForm.assignedToEmail
                ? `Atribuído a: ${reportForm.assignedToEmail}`
                : "",
              break: reportForm.assignedToEmail ? 1 : 0,
            }),
            new TextRun({ text: `Data: ${generatedAt}`, break: 1 }),
          ].filter(Boolean) as any,
        }),
        ReportService.buildDocxFullWidthTitle("1- Introdução"),
        ...(introInstituicoes.length
          ? [
              new Paragraph({
                spacing: { after: 120 },
                children: [new TextRun({ text: "Instituição(ões)", bold: true })],
              }),
              ...introInstituicoes.map((inst: any) =>
                new Paragraph({
                  bullet: { level: 0 },
                  children: [
                    new TextRun({
                      text: `${((inst?.nome || "-") + "").trim()}${inst?.cnpj ? ` (CNPJ: ${inst.cnpj})` : ""}`,
                    }),
                  ],
                })
              ),
            ]
          : [
              new Paragraph({
                spacing: { after: 120 },
                children: [new TextRun({ text: "Instituição(ões): -", bold: true })],
              }),
            ]),
        new Paragraph({
          spacing: { before: 120, after: 120 },
          children: [new TextRun({ text: "Descrição do avaliador", bold: true })],
        }),
        new Paragraph({ text: introAvaliador || "-", spacing: { after: 160 } }),
        ReportService.buildDocxFullWidthTitle("2- Configurações"),
        ReportService.buildDocxCard([
          ReportService.buildLabelValueParagraph(
            "Metodologia - Resultado da Avaliação",
            mostrarMetodologia === "MOSTRAR" ? "MOSTRAR" : "NÃO MOSTRAR"
          ),
          ReportService.buildLabelValueParagraph(
            "Recomendações",
            incluirRecomendacoes === "INCLUIR" ? "INCLUIR" : "NÃO INCLUIR",
            { spacingAfter: 0 }
          ),
        ]),
        new Paragraph({ text: "", spacing: { after: 200 } }),
      ];

      if (mostrarMetodologia === "MOSTRAR") {
        children.push(
          ReportService.buildDocxFullWidthTitle("3- Metodologia - Resultado da Avaliação")
        );
        const metodologiaTexto =
          typeof helpTexts?.metodologia === "string" ? helpTexts.metodologia.trim() : "";
        children.push(new Paragraph({ text: metodologiaTexto || "-", spacing: { after: 200 } }));
      }

      children.push(ReportService.buildDocxFullWidthTitle("4- Execução"));

      sections.forEach((section: any, sectionIndex: number) => {
        const sectionLabel = (section?.customLabel || "").trim()
          ? `${section.item} - ${section.customLabel}`
          : section.item;
        const itemPrefix = `4.${sectionIndex + 1}`;
        children.push(
          ReportService.buildExecutionItemTitleDocx(`${itemPrefix} ${sectionLabel || "-"}`)
        );
        children.push(
          ReportService.buildLabelValueParagraph(
            "Descrição do item avaliado",
            section?.descricao ? String(section.descricao) : "-",
            { spacingAfter: 160 }
          )
        );

        const sectionDeficiencias = deficiencias.filter(
          (def) => def.sectionLabel === (sectionLabel || "-")
        );

        (section?.questions || []).forEach((question: any, index: number) => {
          const showTestDetails = String(question?.testStatus || "").toUpperCase() === "SIM";
          const card: Paragraph[] = [
            ...(showTestDetails
              ? [
                  ReportService.buildLabelValueParagraph(
                    "Teste (descrição)",
                    question?.testDescription ? String(question.testDescription) : "-"
                  ),
                  ReportService.buildLabelValueParagraph(
                    "Referência (requisição)",
                    question?.requisicaoRef ? String(question.requisicaoRef) : "-"
                  ),
                  ReportService.buildLabelValueParagraph(
                    "Referência (resposta)",
                    question?.respostaTesteRef ? String(question.respostaTesteRef) : "-"
                  ),
                  ReportService.buildLabelValueParagraph(
                    "Referência (amostra)",
                    question?.amostraRef ? String(question.amostraRef) : "-"
                  ),
                  ReportService.buildLabelValueParagraph(
                    "Referência (evidências)",
                    question?.evidenciasRef ? String(question.evidenciasRef) : "-"
                  ),
                ]
              : []),
          ];

          const atts = Array.isArray(question?.attachments) ? question.attachments : [];
          const uniqueAtts = Array.from(
            atts
              .reduce((acc: Map<string, any>, att: any) => {
                acc.set(`${att.category}|${att.path}`, att);
                return acc;
              }, new Map<string, any>())
              .values()
          );
          const attachmentGroups = [
            {
              label: "Requisição",
              categories: ["TEST_REQUISICAO", "TESTE_REQUISICAO"],
            },
            {
              label: "Resposta",
              categories: ["TEST_RESPOSTA", "TESTE_RESPOSTA"],
            },
            {
              label: "Amostra",
              categories: ["TEST_AMOSTRA", "TESTE_AMOSTRA"],
            },
            {
              label: "Evidências",
              categories: ["TEST_EVIDENCIAS", "TESTE_EVIDENCIAS"],
            },
          ];
          if (showTestDetails) {
            attachmentGroups.forEach((group) => {
              const groupAtts = uniqueAtts.filter((att: any) =>
                group.categories.includes(att.category)
              );
              if (groupAtts.length === 0) return;
              card.push(ReportService.buildDocxCardSectionTitle(`Arquivos - ${group.label}`));
              groupAtts.forEach((att: any) => {
                card.push(
                  new Paragraph({
                    bullet: { level: 0 },
                    children: [new TextRun({ text: att.originalName || att.filename || "Arquivo" })],
                  })
                );
              });
            });
          }

          children.push(ReportService.buildDocxCard(card));
          children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
        });

        children.push(
          new Paragraph({
            text: `${itemPrefix}.1 Apontamentos`,
            heading: HeadingLevel.HEADING_3,
          })
        );
        if (sectionDeficiencias.length === 0) {
          children.push(
            new Paragraph({
              text: "Nenhuma deficiência identificada.",
              spacing: { after: 160 },
            })
          );
        } else {
          sectionDeficiencias.forEach((def, defIndex) => {
            children.push(
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: `${defIndex + 1}. Deficiência: ${def.deficiencia}`,
                    bold: true,
                  }),
                ],
              })
            );
            if (def.criticidade) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: `Criticidade: ${def.criticidade}` })],
                })
              );
            }
            if (incluirRecomendacoes === "INCLUIR" && def.recomendacao) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: `Recomendação: ${def.recomendacao}` })],
                })
              );
            }
            children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
          });
        }

        children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
      });

      const conclusaoRows = ReportService.buildConclusaoRows(sections);
      children.push(ReportService.buildDocxFullWidthTitle("5- CONCLUSÃO"));
      children.push(
        new Paragraph({
          text:
            "A tabela abaixo mostra a relação de deficiências e respectiva criticidade identificadas como resultado da avaliação dos diversos itens do Programa de PLD/FTP da Instituição.",
          spacing: { after: 120 },
        })
      );
      children.push(ReportService.buildConclusaoTableDocx(conclusaoRows));

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
          type: "BUILDER_FORM_USER_REPORT",
          format: "DOCX",
          content: null,
          filePath: path.join("uploads", "reports", filename),
          userId: requesterUser.id,
        },
      });

      return report;
    }

    // PDF
    const filename = `pld-form-report-${formId}-${timestamp}.pdf`;
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

    const h2Item = (text: string) => {
      ensureSpace(28);
      pdf
        .fillColor(textDark)
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(text, marginLeft, pdf.y, { width: contentWidth });
      pdf.moveDown(0.35);
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

    const titleBlock = (text: string, align: "left" | "center" = "left") => {
      ensureSpace(28);
      const paddingX = 8;
      const paddingY = 6;
      const textHeight = measureTextHeight(text, {
        width: contentWidth - paddingX * 2,
        font: "Helvetica-Bold",
        fontSize: 11,
        lineGap: 2,
      });
      const boxHeight = textHeight + paddingY * 2;
      const startY = pdf.y;
      pdf.save();
      pdf.fillColor("#E2E8F0").rect(marginLeft, startY, contentWidth, boxHeight).fill();
      pdf
        .fillColor(textDark)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(text, marginLeft + paddingX, startY + paddingY, {
          width: contentWidth - paddingX * 2,
          align,
        });
      pdf.restore();
      pdf.y = startY + boxHeight + 6;
    };

    const bulletItem = (text: string) => {
      ensureSpace(18);
      pdf
        .fillColor(textMuted)
        .font("Helvetica")
        .fontSize(10.5)
        .text(`• ${text}`, marginLeft + 10, pdf.y, {
          width: contentWidth - 10,
          lineGap: 2,
        });
      pdf.moveDown(0.2);
    };

    const drawCriteriaTable = (
      rows: Array<{ label: string; description: string; labelFill: string }>
    ) => {
      const labelWidth = 120;
      const descWidth = contentWidth - labelWidth;
      const paddingX = 6;
      const paddingY = 6;

      rows.forEach((row) => {
        const labelHeight = measureTextHeight(row.label, {
          width: labelWidth - paddingX * 2,
          font: "Helvetica-Bold",
          fontSize: 10,
          lineGap: 1,
        });
        const descHeight = measureTextHeight(row.description, {
          width: descWidth - paddingX * 2,
          font: "Helvetica",
          fontSize: 10,
          lineGap: 2,
        });
        const rowHeight = Math.max(labelHeight, descHeight) + paddingY * 2;

        ensureSpace(rowHeight + 6);
        const startY = pdf.y;

        pdf.save();
        pdf.fillColor(row.labelFill).rect(marginLeft, startY, labelWidth, rowHeight).fill();
        pdf
          .fillColor("#FFFFFF")
          .rect(marginLeft + labelWidth, startY, descWidth, rowHeight)
          .fill();
        pdf.restore();

        pdf
          .strokeColor(lineColor)
          .rect(marginLeft, startY, contentWidth, rowHeight)
          .stroke();
        pdf
          .strokeColor(lineColor)
          .moveTo(marginLeft + labelWidth, startY)
          .lineTo(marginLeft + labelWidth, startY + rowHeight)
          .stroke();

        pdf
          .fillColor(textDark)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(row.label, marginLeft + paddingX, startY + paddingY, {
            width: labelWidth - paddingX * 2,
            lineGap: 1,
          });
        pdf
          .fillColor(textMuted)
          .font("Helvetica")
          .fontSize(10)
          .text(row.description, marginLeft + labelWidth + paddingX, startY + paddingY, {
            width: descWidth - paddingX * 2,
            lineGap: 2,
          });

        pdf.y = startY + rowHeight;
      });

      pdf.moveDown(0.6);
    };

    h1(title);
    pdf
      .fillColor(textMuted)
      .font("Helvetica")
      .fontSize(11)
      .text(`Gerado por: ${requesterUser.name} <${requesterUser.email}>`, {
        align: "center",
      });
    pdf.text(`Formulário: ${formName}`, { align: "center" });
    if (reportForm.assignedToEmail) {
      pdf.text(`Atribuído a: ${reportForm.assignedToEmail}`, { align: "center" });
    }
    pdf.text(`Data: ${generatedAt}`, { align: "center" });
    pdf.moveDown(1.0);
    hr();

    titleBlock("1- Introdução");
    if (introInstituicoes.length > 0) {
      h3("Instituição(ões)");
      introInstituicoes.forEach((inst: any, idx: number) => {
        const nome = ((inst?.nome || "-") + "").trim() || "-";
        const cnpj = ((inst?.cnpj || "") + "").trim();
        p(`${idx + 1}. ${nome}${cnpj ? ` (CNPJ: ${cnpj})` : ""}`);
      });
    } else {
      p("Instituição(ões): -");
    }
    h3("Descrição do avaliador");
    p(introAvaliador || "-");
    hr();

    titleBlock("2- Configurações");
    kv(
      "Metodologia - Resultado da Avaliação",
      mostrarMetodologia === "MOSTRAR" ? "MOSTRAR" : "NÃO MOSTRAR"
    );
    kv(
      "Recomendações",
      incluirRecomendacoes === "INCLUIR" ? "INCLUIR" : "NÃO INCLUIR"
    );
    hr();

    if (mostrarMetodologia === "MOSTRAR") {
      titleBlock("3- Metodologia - Resultado da Avaliação");
      const metodologiaTexto =
        typeof helpTexts?.metodologia === "string" ? helpTexts.metodologia.trim() : "";
      p(metodologiaTexto || "-");
      hr();
    }

    titleBlock("4- Execução");

    sections.forEach((section: any, sectionIndex: number) => {
      if (sectionIndex > 0) {
        pdf.addPage();
      }

      const sectionLabel = (section?.customLabel || "").trim()
        ? `${section.item} - ${section.customLabel}`
        : section.item;
      const itemPrefix = `4.${sectionIndex + 1}`;
      h2Item(`${itemPrefix} ${sectionLabel || "-"}`);

      kv(
        "Descrição do item avaliado",
        section?.descricao ? String(section.descricao) : "-"
      );
      pdf.moveDown(0.4);

      const sectionDeficiencias = deficiencias.filter(
        (def) => def.sectionLabel === (sectionLabel || "-")
      );

      hr();

      (section?.questions || []).forEach((question: any, index: number) => {
        const boxX = marginLeft;
        const boxW = contentWidth;
        const boxPaddingX = 16;
        const boxPaddingY = 14;
        const innerX = boxX + boxPaddingX;
        const innerW = boxW - boxPaddingX * 2;
        const showTestDetails = String(question?.testStatus || "").toUpperCase() === "SIM";

        const plannedLines: Array<{ label: string; value: string | undefined }> = [
          ...(showTestDetails
            ? [
                {
                  label: "Teste (descrição)",
                  value: question?.testDescription ? String(question.testDescription) : "-",
                },
                {
                  label: "Referência (requisição)",
                  value: question?.requisicaoRef ? String(question.requisicaoRef) : "-",
                },
                {
                  label: "Referência (resposta)",
                  value: question?.respostaTesteRef ? String(question.respostaTesteRef) : "-",
                },
                {
                  label: "Referência (amostra)",
                  value: question?.amostraRef ? String(question.amostraRef) : "-",
                },
                {
                  label: "Referência (evidências)",
                  value: question?.evidenciasRef ? String(question.evidenciasRef) : "-",
                },
              ]
            : []),
        ];

        const atts = Array.isArray(question?.attachments) ? question.attachments : [];

        let estimatedHeight = 0;
        estimatedHeight += boxPaddingY;
        plannedLines.forEach(({ label, value }) => {
          estimatedHeight += measureTextHeight(`${label}: ${value || "-"}`, {
            width: innerW,
            font: "Helvetica",
            fontSize: 10,
            lineGap: 1,
          });
          estimatedHeight += 2;
        });

        const uniqueAttachmentsForEstimate = Array.from(
          atts
            .reduce((acc: Map<string, any>, att: any) => {
              acc.set(`${att.category}|${att.path}`, att);
              return acc;
            }, new Map<string, any>())
            .values()
        );
        const attachmentGroups = [
          {
            label: "Requisição",
            categories: ["TEST_REQUISICAO", "TESTE_REQUISICAO"],
          },
          {
            label: "Resposta",
            categories: ["TEST_RESPOSTA", "TESTE_RESPOSTA"],
          },
          {
            label: "Amostra",
            categories: ["TEST_AMOSTRA", "TESTE_AMOSTRA"],
          },
          {
            label: "Evidências",
            categories: ["TEST_EVIDENCIAS", "TESTE_EVIDENCIAS"],
          },
        ];
        if (showTestDetails) {
          attachmentGroups.forEach((group) => {
            const groupAtts = uniqueAttachmentsForEstimate.filter((att: any) =>
              group.categories.includes(att.category)
            );
            if (groupAtts.length === 0) return;
            estimatedHeight += 14;
            estimatedHeight += measureTextHeight(`Arquivos - ${group.label}`, {
              width: innerW,
              font: "Helvetica-Bold",
              fontSize: 10.5,
            });
            groupAtts.forEach((att: any) => {
              estimatedHeight += measureTextHeight(
                `• ${att.originalName || att.filename || "Arquivo"}`,
                { width: innerW, font: "Helvetica", fontSize: 10, lineGap: 2 }
              );
              estimatedHeight += 2;
            });
          });
        }
        estimatedHeight += boxPaddingY + 10;

        ensureSpace(Math.ceil(estimatedHeight));
        const boxY = pdf.y;

        pdf.y = boxY + boxPaddingY;
        pdf.fillColor(textMuted).font("Helvetica").fontSize(10);
        if (showTestDetails) {
          kv(
            "Teste (descrição)",
            question?.testDescription ? String(question.testDescription) : "-",
            innerX,
            innerW
          );
          kv(
            "Referência (requisição)",
            question?.requisicaoRef ? String(question.requisicaoRef) : "-",
            innerX,
            innerW
          );
          kv(
            "Referência (resposta)",
            question?.respostaTesteRef ? String(question.respostaTesteRef) : "-",
            innerX,
            innerW
          );
          kv(
            "Referência (amostra)",
            question?.amostraRef ? String(question.amostraRef) : "-",
            innerX,
            innerW
          );
          kv(
            "Referência (evidências)",
            question?.evidenciasRef ? String(question.evidenciasRef) : "-",
            innerX,
            innerW
          );
        }

        const uniqueAtts = Array.from(
          atts
            .reduce((acc: Map<string, any>, att: any) => {
              acc.set(`${att.category}|${att.path}`, att);
              return acc;
            }, new Map<string, any>())
            .values()
        );
        if (showTestDetails) {
          attachmentGroups.forEach((group) => {
            const groupAtts = uniqueAtts.filter((att: any) =>
              group.categories.includes(att.category)
            );
            if (groupAtts.length === 0) return;
            pdf.moveDown(0.4);
            pdf
              .fillColor(textDark)
              .font("Helvetica-Bold")
              .fontSize(10.5)
              .text(`Arquivos - ${group.label}`, innerX, pdf.y);
            pdf.moveDown(0.2);
            groupAtts.forEach((att: any) => {
              ensureSpace(18);
              pdf
                .fillColor(textMuted)
                .font("Helvetica")
                .fontSize(10)
                .text(`• ${att.originalName || att.filename || "Arquivo"}`, innerX, pdf.y, {
                  width: innerW,
                  lineGap: 2,
                });
            });
          });
        }

        const boxEndY = pdf.y + boxPaddingY;
        pdf
          .strokeColor(lineColor)
          .rect(boxX, boxY, boxW, boxEndY - boxY)
          .stroke();
        pdf.y = boxEndY + 10;
      });

      h3(`${itemPrefix}.1 Apontamentos`);
      if (sectionDeficiencias.length === 0) {
        p("Nenhuma deficiência identificada.");
      } else {
        sectionDeficiencias.forEach((def, defIndex) => {
          ensureSpace(24);
          pdf
            .fillColor(textDark)
            .font("Helvetica-Bold")
            .fontSize(11)
            .text(`${defIndex + 1}. Deficiência: ${def.deficiencia}`, marginLeft, pdf.y, {
              width: contentWidth,
              lineGap: 2,
            });
          pdf.moveDown(0.2);
          if (def.criticidade) {
            pdf
              .fillColor(textMuted)
              .font("Helvetica")
              .fontSize(10.5)
              .text(`Criticidade: ${def.criticidade}`, marginLeft, pdf.y, {
                width: contentWidth,
                lineGap: 2,
              });
          }
          if (incluirRecomendacoes === "INCLUIR" && def.recomendacao) {
            pdf
              .fillColor(textMuted)
              .font("Helvetica")
              .fontSize(10.5)
              .text(`Recomendação: ${def.recomendacao}`, marginLeft, pdf.y, {
                width: contentWidth,
                lineGap: 2,
              });
          }
        });
      }
    });

    titleBlock("5- CONCLUSÃO");
    p(
      "A tabela abaixo mostra a relação de deficiências e respectiva criticidade identificadas como resultado da avaliação dos diversos itens do Programa de PLD/FTP da Instituição."
    );

    const conclusaoRows = ReportService.buildConclusaoRows(sections);
    const drawConclusaoTable = (
      rows: Array<{ label: string; baixa: number; media: number; alta: number; total: number }>
    ) => {
      const labelWidth = 220;
      const colWidth = Math.floor((contentWidth - labelWidth) / 4);
      const paddingX = 6;
      const paddingY = 6;
      const fillHeader = "#F1F5F2";
      const borderColor = "#94A3B8";
      const fillBaixa = "#DCFCE7";
      const fillMedia = "#FEF9C3";
      const fillAlta = "#FEE2E2";

      const drawRow = (
        values: string[],
        isHeader: boolean
      ) => {
        const rowHeight = Math.max(
          measureTextHeight(values[0], {
            width: labelWidth - paddingX * 2,
            font: isHeader ? "Helvetica-Bold" : "Helvetica",
            fontSize: 10,
            lineGap: 1,
          }),
          measureTextHeight(values[1], {
            width: colWidth - paddingX * 2,
            font: isHeader ? "Helvetica-Bold" : "Helvetica",
            fontSize: 10,
            lineGap: 1,
          })
        ) + paddingY * 2;

        ensureSpace(rowHeight + 4);
        const startY = pdf.y;

        const fill = isHeader ? fillHeader : "#FFFFFF";
        pdf.save();
        pdf.fillColor(fill).rect(marginLeft, startY, labelWidth, rowHeight).fill();
        pdf
          .fillColor(fillBaixa)
          .rect(marginLeft + labelWidth + 0 * colWidth, startY, colWidth, rowHeight)
          .fill();
        pdf
          .fillColor(fillMedia)
          .rect(marginLeft + labelWidth + 1 * colWidth, startY, colWidth, rowHeight)
          .fill();
        pdf
          .fillColor(fillAlta)
          .rect(marginLeft + labelWidth + 2 * colWidth, startY, colWidth, rowHeight)
          .fill();
        pdf
          .fillColor(fill)
          .rect(marginLeft + labelWidth + 3 * colWidth, startY, colWidth, rowHeight)
          .fill();
        pdf.restore();

        pdf
          .strokeColor(borderColor)
          .rect(marginLeft, startY, contentWidth, rowHeight)
          .stroke();
        for (let i = 0; i < 4; i++) {
          pdf
            .strokeColor(borderColor)
            .moveTo(marginLeft + labelWidth + i * colWidth, startY)
            .lineTo(marginLeft + labelWidth + i * colWidth, startY + rowHeight)
            .stroke();
        }

        pdf
          .fillColor(textDark)
          .font(isHeader ? "Helvetica-Bold" : "Helvetica")
          .fontSize(10)
          .text(values[0], marginLeft + paddingX, startY + paddingY, {
            width: labelWidth - paddingX * 2,
            lineGap: 1,
          });

        values.slice(1).forEach((val, idx) => {
          pdf
            .fillColor(textDark)
            .font(isHeader ? "Helvetica-Bold" : "Helvetica")
            .fontSize(10)
            .text(val, marginLeft + labelWidth + idx * colWidth + paddingX, startY + paddingY, {
              width: colWidth - paddingX * 2,
              align: "center",
              lineGap: 1,
            });
        });

        pdf.y = startY + rowHeight;
      };

      drawRow(["Item avaliado", "BAIXA", "MÉDIA", "ALTA", "TOTAL"], true);
      rows.forEach((row) => {
        drawRow(
          [
            row.label,
            String(row.baixa),
            String(row.media),
            String(row.alta),
            String(row.total),
          ],
          false
        );
      });
    };

    drawConclusaoTable(conclusaoRows);

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
        type: "BUILDER_FORM_USER_REPORT",
        format: "PDF",
        content: null,
        filePath: path.join("uploads", "reports", filename),
        userId: requesterUser.id,
      },
    });

    return report;
  }

  static async generatePldBuilderReport(
    userId: string,
    format: "PDF" | "DOCX" = "DOCX",
    opts?: {
      name?: string | null
      metadata?: {
        instituicoes?: Array<{ nome?: string; cnpj?: string }>
        qualificacaoAvaliador?: string
        incluirRecomendacoes?: string
      } | null
    }
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    // Builder (ADMIN) usa createdById = null; não misturar seções de outros usuários.
    const sections = await prisma.pldSection.findMany({
      where: { createdById: null },
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
    const baseUrl = (process.env.PUBLIC_BASE_URL || "http://localhost:3001")
      .replace(/\/api\/?$/, "")
      .replace(/\/+$/, "");
    const generatedAt = new Date().toLocaleString("pt-BR");

    const title = "Relatório PLD";
    const introName = (opts?.name || "").trim();
    const introInstituicoes = Array.isArray(opts?.metadata?.instituicoes)
      ? opts?.metadata?.instituicoes ?? []
      : [];
    const introAvaliador = (opts?.metadata?.qualificacaoAvaliador || "").trim();
    const incluirRecomendacoes =
      String(opts?.metadata?.incluirRecomendacoes || "INCLUIR").toUpperCase();
    const introInstituicoesInline = introInstituicoes.length
      ? introInstituicoes
          .map((inst) =>
            `${(inst.nome || "-").trim()}${inst.cnpj ? ` (CNPJ: ${inst.cnpj})` : ""}`
          )
          .join(", ")
      : "-";
    const formCreatedAtText = ReportService.formatDatePtBr(new Date());
    const sectionLabels = ReportService.getSectionLabels(sections);
    const deficiencias = ReportService.collectDeficiencias(sections);

    const reportName = introName ? `Relatório PLD Builder - ${introName}` : `Relatório PLD Builder - ${user.name}`;

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
        ReportService.buildDocxFullWidthTitle("1- Introdução"),
        new Paragraph({
          text:
            "Conforme artigo 62 da Circular BCB nº 3.978, de 23 de janeiro de 2020, as instituições autorizadas a funcionar pelo Banco Central do Brasil devem avaliar anualmente a efetividade da política, dos procedimentos e dos controles internos por elas implementados para a prevenção à lavagem de dinheiro e ao financiamento do terrorismo.",
          spacing: { after: 160 },
        }),
        new Paragraph({
          text: `Este relatório contém o resultado da avaliação dos diversos itens do programa de PLD/FTP das instituições ${introInstituicoesInline}.`,
          spacing: { after: 160 },
        }),
        new Paragraph({
          text:
            "Para fins de elaboração deste relatório, Instituição será doravante adotado para designar ambas as instituições.",
          spacing: { after: 160 },
        }),
        new Paragraph({
          text:
            "Em atendimento ao disposto no § 1º do artigo 62 da Circular BCB nº 3.978/20, este relatório descreve a metodologia empregada nessa avaliação, os testes aplicados, a qualificação do avaliador, os itens avaliados e o resultado dessa avaliação (deficiências identificadas).",
          spacing: { after: 160 },
        }),
        new Paragraph({
          text: `A avaliação considerou o programa de PLD/FTP vigente em ${formCreatedAtText}.`,
          spacing: { after: 160 },
        }),
        ReportService.buildDocxFullWidthTitle("2- Metodologia de Avaliação"),
        new Paragraph({
          text: "A metodologia de avaliação consistiu na:",
          spacing: { after: 120 },
        }),
        ...[
          "verificação da existência, formalização, conteúdo, atualização e, quando for o caso, a divulgação dos documentos exigidos expressamente na Circular BCB nº 3.978/20:",
        ].map((item) =>
          new Paragraph({
            bullet: { level: 0 },
            text: item,
          })
        ),
        ...[
          "Política de PLD/FTP;",
          "Manual de Procedimentos Conheça seu Cliente;",
          "Manual de Procedimentos de Monitoramento, Seleção, Análise e Comunicação de Operações Suspeitas (Procedimentos MSAC);",
          "Procedimentos Conheça seu Funcionário;",
          "Procedimentos Conheça seu Parceiro;",
          "Procedimentos Conheça seu Prestador de Serviço Terceirizado;",
          "Relatório de Avaliação Interna de Risco",
          "Relatório de Avaliação de Efetividade do ano anterior;",
          "Plano de Ação para correção das deficiências identificadas no Relatório de Avaliação de Efetividade do ano anterior;",
          "Relatório de Acompanhamento do Plano de Ação;",
        ].map((item) =>
          new Paragraph({
            bullet: { level: 1 },
            text: item,
          })
        ),
        ...[
          "avaliação da estrutura e dos procedimentos de governança de PLD/FTP;",
          "avaliação do programa de treinamento em PLD/FTP e das ações de promoção da cultura organizacional de PLD/FTP;",
          "avaliação dos procedimentos MSAC, incluindo a adequação da área de PLD/FTP;",
          "avaliação dos procedimentos relacionados ao cumprimento das disposições da Lei nº 13.810/19, regulamentados pela Resolução BCB nº 44/20 e Instrução Normativa BCB nº 262/22;",
          "avaliação dos procedimentos antifraude;",
          "avaliação dos mecanismos de acompanhamento e de controle de que trata o Capítulo X da Circular BCB nº 3.978/20, incluindo auditoria interna;",
          "realização de testes com o propósito de verificar a aderência dos procedimentos vigentes em relação ao disposto nos documentos internos, por meio de: entrevistas; requisição de evidências; amostragem; acompanhamento, por meio de reuniões remotas, da execução dos procedimentos e controles de PLD/FTP pelos responsáveis diretos por tal execução; e na análise de relatórios gerenciais e de estatísticas relativas ao sistema de monitoramento e aos procedimentos conheça seu cliente.",
        ].map((item) =>
          new Paragraph({
            bullet: { level: 0 },
            text: item,
          })
        ),
        new Paragraph({
          text: "Os itens avaliados do programa de PLD/FTP da Instituição foram:",
          spacing: { before: 120, after: 80 },
        }),
        ...(sectionLabels.length > 0
          ? sectionLabels.map((label, idx) =>
              new Paragraph({
                bullet: { level: 0 },
                text: `${idx + 1}. ${label}`,
              })
            )
          : [new Paragraph({ text: "-" })]),
        new Paragraph({
          text:
            "A descrição detalhada da avaliação de cada item, incluindo os testes realizados, consta no item EXECUÇÃO.",
          spacing: { before: 160, after: 120 },
        }),
        new Paragraph({
          text:
            "Como resultado dessa avaliação, a deficiência identificada recebeu um grau de criticidade definido conforme tabela abaixo.",
          spacing: { after: 120 },
        }),
        ReportService.buildDocxFullWidthTitle("GRAU DE CRITICIDADE", AlignmentType.CENTER),
        ReportService.buildCriticidadeTableDocx(),
        new Paragraph({
          text:
            "O resultado da avaliação de efetividade resultará na atribuição de um dos conceitos, mostrados a seguir, ao programa de PLD/FTP da Instituição.",
          spacing: { before: 160, after: 120 },
        }),
        ReportService.buildDocxFullWidthTitle(
          "CRITÉRIOS DE AVALIAÇÃO DE EFETIVIDADE",
          AlignmentType.CENTER
        ),
        ReportService.buildEfetividadeTableDocx(),
        ReportService.buildDocxFullWidthTitle("3- Qualificação do Avaliador"),
        new Paragraph({ text: introAvaliador || "-", spacing: { after: 160 } }),
        ReportService.buildDocxFullWidthTitle("4- Execução"),
      ];

      sections.forEach((section, sectionIndex) => {
        const sectionLabel = section.customLabel?.trim()
          ? `${section.item} - ${section.customLabel}`
          : section.item;
        const itemPrefix = `4.${sectionIndex + 1}`;
        children.push(
          ReportService.buildExecutionItemTitleDocx(`${itemPrefix} ${sectionLabel || "-"}`)
        );
        children.push(
          ReportService.buildLabelValueParagraph(
            "Descrição do item avaliado",
            section.descricao ? String(section.descricao) : "-",
            { spacingAfter: 160 }
          )
        );

        const sectionDeficiencias = deficiencias.filter(
          (def) => def.sectionLabel === (sectionLabel || "-")
        );

        (section.questions || []).forEach((question, index) => {
          const qRef = question as any;
          const showTestDetails = String(qRef?.testStatus || "").toUpperCase() === "SIM";
          const card: Paragraph[] = [
            ...(showTestDetails
              ? [
                  ReportService.buildLabelValueParagraph(
                    "Teste (descrição)",
                    qRef.testDescription ? String(qRef.testDescription) : "-"
                  ),
                  ReportService.buildLabelValueParagraph(
                    "Referência (requisição)",
                    qRef.requisicaoRef ? String(qRef.requisicaoRef) : "-"
                  ),
                  ReportService.buildLabelValueParagraph(
                    "Referência (resposta)",
                    qRef.respostaTesteRef ? String(qRef.respostaTesteRef) : "-"
                  ),
                  ReportService.buildLabelValueParagraph(
                    "Referência (amostra)",
                    qRef.amostraRef ? String(qRef.amostraRef) : "-"
                  ),
                  ReportService.buildLabelValueParagraph(
                    "Referência (evidências)",
                    qRef.evidenciasRef ? String(qRef.evidenciasRef) : "-"
                  ),
                ]
              : []),
          ];

          const atts = question.attachments || [];
          const uniqueAtts = Array.from(
            atts
              .reduce((acc, att) => {
                acc.set(`${att.category}|${att.path}`, att);
                return acc;
              }, new Map<string, (typeof atts)[number]>())
              .values()
          );
          const attachmentGroups = [
            {
              label: "Requisição",
              categories: ["TEST_REQUISICAO", "TESTE_REQUISICAO"],
            },
            {
              label: "Resposta",
              categories: ["TEST_RESPOSTA", "TESTE_RESPOSTA"],
            },
            {
              label: "Amostra",
              categories: ["TEST_AMOSTRA", "TESTE_AMOSTRA"],
            },
            {
              label: "Evidências",
              categories: ["TEST_EVIDENCIAS", "TESTE_EVIDENCIAS"],
            },
          ];
          if (showTestDetails) {
            attachmentGroups.forEach((group) => {
              const groupAtts = uniqueAtts.filter((att) =>
                group.categories.includes(att.category)
              );
              if (groupAtts.length === 0) return;
              card.push(ReportService.buildDocxCardSectionTitle(`Arquivos - ${group.label}`));
              groupAtts.forEach((att) => {
                card.push(
                  new Paragraph({
                    bullet: { level: 0 },
                    children: [new TextRun({ text: att.originalName })],
                  })
                );
              });
            });
          }

          children.push(ReportService.buildDocxCard(card));
          children.push(new Paragraph({ text: "", spacing: { after: 160 } }));
        });

        children.push(
          new Paragraph({
            text: `${itemPrefix}.1 Apontamentos`,
            heading: HeadingLevel.HEADING_3,
          })
        );
        if (sectionDeficiencias.length === 0) {
          children.push(
            new Paragraph({
              text: "Nenhuma deficiência identificada.",
              spacing: { after: 160 },
            })
          );
        } else {
          sectionDeficiencias.forEach((def, defIndex) => {
            children.push(
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: `${defIndex + 1}. Deficiência: ${def.deficiencia}`,
                    bold: true,
                  }),
                ],
              })
            );
            if (def.criticidade) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: `Criticidade: ${def.criticidade}` })],
                })
              );
            }
            if (incluirRecomendacoes === "INCLUIR" && def.recomendacao) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: `Recomendação: ${def.recomendacao}` })],
                })
              );
            }
            children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
          });
        }

        children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
      });

      const conclusaoRows = ReportService.buildConclusaoRows(sections);
      children.push(ReportService.buildDocxFullWidthTitle("5- CONCLUSÃO"));
      children.push(
        new Paragraph({
          text:
            "A tabela abaixo mostra a relação de deficiências e respectiva criticidade identificadas como resultado da avaliação dos diversos itens do Programa de PLD/FTP da Instituição.",
          spacing: { after: 120 },
        })
      );
      children.push(ReportService.buildConclusaoTableDocx(conclusaoRows));

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

    const h2Item = (text: string) => {
      ensureSpace(28);
      pdf
        .fillColor(textDark)
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(text, marginLeft, pdf.y, { width: contentWidth });
      pdf.moveDown(0.35);
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

    const titleBlock = (text: string, align: "left" | "center" = "left") => {
      ensureSpace(28);
      const paddingX = 8;
      const paddingY = 6;
      const textHeight = measureTextHeight(text, {
        width: contentWidth - paddingX * 2,
        font: "Helvetica-Bold",
        fontSize: 11,
        lineGap: 2,
      });
      const boxHeight = textHeight + paddingY * 2;
      const startY = pdf.y;
      pdf.save();
      pdf.fillColor("#E2E8F0").rect(marginLeft, startY, contentWidth, boxHeight).fill();
      pdf
        .fillColor(textDark)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(text, marginLeft + paddingX, startY + paddingY, {
          width: contentWidth - paddingX * 2,
          align,
        });
      pdf.restore();
      pdf.y = startY + boxHeight + 6;
    };

    const bulletItem = (text: string) => {
      ensureSpace(18);
      pdf
        .fillColor(textMuted)
        .font("Helvetica")
        .fontSize(10.5)
        .text(`• ${text}`, marginLeft + 10, pdf.y, {
          width: contentWidth - 10,
          lineGap: 2,
        });
      pdf.moveDown(0.2);
    };

    const bulletItemSecondary = (text: string) => {
      ensureSpace(18);
      pdf
        .fillColor(textMuted)
        .font("Helvetica")
        .fontSize(10.5)
        .text(`- ${text}`, marginLeft + 24, pdf.y, {
          width: contentWidth - 24,
          lineGap: 2,
        });
      pdf.moveDown(0.2);
    };

    const drawCriteriaTable = (
      rows: Array<{ label: string; description: string; labelFill: string }>
    ) => {
      const labelWidth = 120;
      const descWidth = contentWidth - labelWidth;
      const paddingX = 6;
      const paddingY = 6;

      rows.forEach((row) => {
        const labelHeight = measureTextHeight(row.label, {
          width: labelWidth - paddingX * 2,
          font: "Helvetica-Bold",
          fontSize: 10,
          lineGap: 1,
        });
        const descHeight = measureTextHeight(row.description, {
          width: descWidth - paddingX * 2,
          font: "Helvetica",
          fontSize: 10,
          lineGap: 2,
        });
        const rowHeight = Math.max(labelHeight, descHeight) + paddingY * 2;

        ensureSpace(rowHeight + 6);
        const startY = pdf.y;

        pdf.save();
        pdf.fillColor(row.labelFill).rect(marginLeft, startY, labelWidth, rowHeight).fill();
        pdf
          .fillColor("#FFFFFF")
          .rect(marginLeft + labelWidth, startY, descWidth, rowHeight)
          .fill();
        pdf.restore();

        pdf
          .strokeColor(lineColor)
          .rect(marginLeft, startY, contentWidth, rowHeight)
          .stroke();
        pdf
          .strokeColor(lineColor)
          .moveTo(marginLeft + labelWidth, startY)
          .lineTo(marginLeft + labelWidth, startY + rowHeight)
          .stroke();

        pdf
          .fillColor(textDark)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(row.label, marginLeft + paddingX, startY + paddingY, {
            width: labelWidth - paddingX * 2,
            lineGap: 1,
          });
        pdf
          .fillColor(textMuted)
          .font("Helvetica")
          .fontSize(10)
          .text(row.description, marginLeft + labelWidth + paddingX, startY + paddingY, {
            width: descWidth - paddingX * 2,
            lineGap: 2,
          });

        pdf.y = startY + rowHeight;
      });

      pdf.moveDown(0.6);
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

    titleBlock("1- Introdução");
    p(
      "Conforme artigo 62 da Circular BCB nº 3.978, de 23 de janeiro de 2020, as instituições autorizadas a funcionar pelo Banco Central do Brasil devem avaliar anualmente a efetividade da política, dos procedimentos e dos controles internos por elas implementados para a prevenção à lavagem de dinheiro e ao financiamento do terrorismo."
    );
    p(
      `Este relatório contém o resultado da avaliação dos diversos itens do programa de PLD/FTP das instituições ${introInstituicoesInline}.`
    );
    p(
      "Para fins de elaboração deste relatório, Instituição será doravante adotado para designar ambas as instituições."
    );
    p(
      "Em atendimento ao disposto no § 1º do artigo 62 da Circular BCB nº 3.978/20, este relatório descreve a metodologia empregada nessa avaliação, os testes aplicados, a qualificação do avaliador, os itens avaliados e o resultado dessa avaliação (deficiências identificadas)."
    );
    p(`A avaliação considerou o programa de PLD/FTP vigente em ${formCreatedAtText}.`);
    hr();

    titleBlock("2- Metodologia de Avaliação");
    p("A metodologia de avaliação consistiu na:");
    [
      "verificação da existência, formalização, conteúdo, atualização e, quando for o caso, a divulgação dos documentos exigidos expressamente na Circular BCB nº 3.978/20:",
    ].forEach(bulletItem);
    [
      "Política de PLD/FTP;",
      "Manual de Procedimentos Conheça seu Cliente;",
      "Manual de Procedimentos de Monitoramento, Seleção, Análise e Comunicação de Operações Suspeitas (Procedimentos MSAC);",
      "Procedimentos Conheça seu Funcionário;",
      "Procedimentos Conheça seu Parceiro;",
      "Procedimentos Conheça seu Prestador de Serviço Terceirizado;",
      "Relatório de Avaliação Interna de Risco",
      "Relatório de Avaliação de Efetividade do ano anterior;",
      "Plano de Ação para correção das deficiências identificadas no Relatório de Avaliação de Efetividade do ano anterior;",
      "Relatório de Acompanhamento do Plano de Ação;",
    ].forEach(bulletItemSecondary);
    [
      "avaliação da estrutura e dos procedimentos de governança de PLD/FTP;",
      "avaliação do programa de treinamento em PLD/FTP e das ações de promoção da cultura organizacional de PLD/FTP;",
      "avaliação dos procedimentos MSAC, incluindo a adequação da área de PLD/FTP;",
      "avaliação dos procedimentos relacionados ao cumprimento das disposições da Lei nº 13.810/19, regulamentados pela Resolução BCB nº 44/20 e Instrução Normativa BCB nº 262/22;",
      "avaliação dos procedimentos antifraude;",
      "avaliação dos mecanismos de acompanhamento e de controle de que trata o Capítulo X da Circular BCB nº 3.978/20, incluindo auditoria interna;",
      "realização de testes com o propósito de verificar a aderência dos procedimentos vigentes em relação ao disposto nos documentos internos, por meio de: entrevistas; requisição de evidências; amostragem; acompanhamento, por meio de reuniões remotas, da execução dos procedimentos e controles de PLD/FTP pelos responsáveis diretos por tal execução; e na análise de relatórios gerenciais e de estatísticas relativas ao sistema de monitoramento e aos procedimentos conheça seu cliente.",
    ].forEach(bulletItem);
    p("Os itens avaliados do programa de PLD/FTP da Instituição foram:");
    if (sectionLabels.length > 0) {
      sectionLabels.forEach((label, idx) => {
        bulletItem(`${idx + 1}. ${label}`);
      });
    } else {
      p("-");
    }
    p(
      "A descrição detalhada da avaliação de cada item, incluindo os testes realizados, consta no item EXECUÇÃO."
    );
    p(
      "Como resultado dessa avaliação, a deficiência identificada recebeu um grau de criticidade definido conforme tabela abaixo."
    );
    titleBlock("GRAU DE CRITICIDADE", "center");
    drawCriteriaTable([
      {
        label: "ALTA",
        description:
          "Quando a deficiência comprometer de maneira significativa a efetividade do controle de PLD/FTP associado.",
        labelFill: "#FEE2E2",
      },
      {
        label: "MÉDIA",
        description:
          "Quando a deficiência corresponder a inobservância de boa prática de PLD/FTP ou quando a deficiência comprometer parcialmente a efetividade do controle de PLD/FTP associado.",
        labelFill: "#FEF9C3",
      },
      {
        label: "BAIXA",
        description:
          "Quando a deficiência não compromete a efetividade do controle de PLD/FTP associado.",
        labelFill: "#DCFCE7",
      },
    ]);
    p(
      "O resultado da avaliação de efetividade resultará na atribuição de um dos conceitos, mostrados a seguir, ao programa de PLD/FTP da Instituição."
    );
    titleBlock("CRITÉRIOS DE AVALIAÇÃO DE EFETIVIDADE", "center");
    drawCriteriaTable([
      {
        label: "EFETIVO",
        description:
          "Quando o programa de PLD/FTP atingir a maioria dos resultados esperados, sem a identificação de deficiências de alta criticidade nos procedimentos de monitoramento, seleção, análise e comunicação de operações atípicas, nos procedimentos de verificação de sanções CSNU, e nos procedimentos conheça seu cliente.",
        labelFill: "#DCFCE7",
      },
      {
        label: "PARCIALMENTE EFETIVO",
        description:
          "Quando o programa de PLD/FTP atingir a maioria dos resultados esperados, com a identificação de algumas deficiências de alta criticidade nos procedimentos conheça seu cliente ou nos procedimentos de monitoramento, seleção, análise e comunicação de operações atípicas.",
        labelFill: "#FEF9C3",
      },
      {
        label: "POUCO EFETIVO",
        description:
          "Quando o programa de PLD/FTP não atingir a maioria dos resultados esperados, com a identificação de deficiências de alta criticidade nos procedimentos de monitoramento, seleção, análise e comunicação de operações atípicas, nos procedimentos de verificação de sanções CSNU, e nos procedimentos conheça seu cliente.",
        labelFill: "#FEE2E2",
      },
    ]);
    hr();

    titleBlock("3- Qualificação do Avaliador");
    p(introAvaliador || "-");
    hr();

    titleBlock("4- Execução");

    sections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) {
        pdf.addPage();
      }

      const sectionLabel = section.customLabel?.trim()
        ? `${section.item} - ${section.customLabel}`
        : section.item;
      const itemPrefix = `4.${sectionIndex + 1}`;
      h2Item(`${itemPrefix} ${sectionLabel}`);

      kv(
        "Descrição do item avaliado",
        section.descricao ? String(section.descricao) : "-"
      );
      pdf.moveDown(0.4);

      const sectionDeficiencias = deficiencias.filter(
        (def) => def.sectionLabel === (sectionLabel || "-")
      );

      hr();
      (section.questions || []).forEach((question, index) => {
        const boxX = marginLeft;
        const boxW = contentWidth;
        const boxPaddingX = 16;
        const boxPaddingY = 14;
        const innerX = boxX + boxPaddingX;
        const innerW = boxW - boxPaddingX * 2;
        const qRef = question as any;
        const showTestDetails = String(qRef?.testStatus || "").toUpperCase() === "SIM";

        // Estimate height to avoid breaking the card across pages.
        const plannedLines: Array<{
          label: string;
          value: string | undefined;
        }> = [
          ...(showTestDetails
            ? [
                {
                  label: "Teste (descrição)",
                  value: qRef.testDescription ? String(qRef.testDescription) : "-",
                },
                {
                  label: "Referência (requisição)",
                  value: qRef.requisicaoRef ? String(qRef.requisicaoRef) : "-",
                },
                {
                  label: "Referência (resposta)",
                  value: qRef.respostaTesteRef ? String(qRef.respostaTesteRef) : "-",
                },
                {
                  label: "Referência (amostra)",
                  value: qRef.amostraRef ? String(qRef.amostraRef) : "-",
                },
                {
                  label: "Referência (evidências)",
                  value: qRef.evidenciasRef ? String(qRef.evidenciasRef) : "-",
                },
              ]
            : []),
        ];

        const atts = question.attachments || [];

        let estimatedHeight = 0;
        estimatedHeight += boxPaddingY; // top padding
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
        const attachmentGroups = [
          {
            label: "Requisição",
            categories: ["TEST_REQUISICAO", "TESTE_REQUISICAO"],
          },
          {
            label: "Resposta",
            categories: ["TEST_RESPOSTA", "TESTE_RESPOSTA"],
          },
          {
            label: "Amostra",
            categories: ["TEST_AMOSTRA", "TESTE_AMOSTRA"],
          },
          {
            label: "Evidências",
            categories: ["TEST_EVIDENCIAS", "TESTE_EVIDENCIAS"],
          },
        ];
        if (showTestDetails) {
          attachmentGroups.forEach((group) => {
            const groupAtts = uniqueAttachmentsForEstimate.filter((att) =>
              group.categories.includes(att.category)
            );
            if (groupAtts.length === 0) return;
            estimatedHeight += 14; // spacing + header
            estimatedHeight += measureTextHeight(`Arquivos - ${group.label}`, {
              width: innerW,
              font: "Helvetica-Bold",
              fontSize: 10.5,
            });
            groupAtts.forEach((att) => {
              estimatedHeight += measureTextHeight(
                `• ${att.originalName}`,
                {
                  width: innerW,
                  font: "Helvetica",
                  fontSize: 10,
                  lineGap: 2,
                }
              );
              estimatedHeight += 2;
            });
          });
        }
        estimatedHeight += boxPaddingY + 10; // bottom padding + after-box spacing

        ensureSpace(Math.ceil(estimatedHeight));
        const boxY = pdf.y;

        pdf.y = boxY + boxPaddingY;
        pdf.fillColor(textMuted).font("Helvetica").fontSize(10);
        if (showTestDetails) {
          kv(
            "Teste (descrição)",
            qRef.testDescription ? String(qRef.testDescription) : "-",
            innerX,
            innerW
          );
          kv(
            "Referência (requisição)",
            qRef.requisicaoRef ? String(qRef.requisicaoRef) : "-",
            innerX,
            innerW
          );
          kv(
            "Referência (resposta)",
            qRef.respostaTesteRef ? String(qRef.respostaTesteRef) : "-",
            innerX,
            innerW
          );
          kv(
            "Referência (amostra)",
            qRef.amostraRef ? String(qRef.amostraRef) : "-",
            innerX,
            innerW
          );
          kv(
            "Referência (evidências)",
            qRef.evidenciasRef ? String(qRef.evidenciasRef) : "-",
            innerX,
            innerW
          );
        }

        const uniqueAtts = Array.from(
          atts
            .reduce((acc, att) => {
              acc.set(`${att.category}|${att.path}`, att);
              return acc;
            }, new Map<string, (typeof atts)[number]>())
            .values()
        );
        if (showTestDetails) {
          attachmentGroups.forEach((group) => {
            const groupAtts = uniqueAtts.filter((att) =>
              group.categories.includes(att.category)
            );
            if (groupAtts.length === 0) return;
            pdf.moveDown(0.4);
            pdf
              .fillColor(textDark)
              .font("Helvetica-Bold")
              .fontSize(10.5)
              .text(`Arquivos - ${group.label}`, innerX, pdf.y);
            pdf.moveDown(0.2);
            groupAtts.forEach((att, attIndex) => {
              ensureSpace(18);
              pdf
                .fillColor(textMuted)
                .font("Helvetica")
                .fontSize(10)
                .text(`• ${att.originalName}`, innerX, pdf.y, {
                  width: innerW,
                  lineGap: 2,
                });
              if (attIndex < groupAtts.length - 1) pdf.moveDown(0.1);
            });
          });
        }

        const boxEndY = pdf.y + boxPaddingY;
        pdf
          .strokeColor(lineColor)
          .rect(boxX, boxY, boxW, boxEndY - boxY)
          .stroke();
        pdf.y = boxEndY + 10;
      });

      h3(`${itemPrefix}.1 Apontamentos`);
      if (sectionDeficiencias.length === 0) {
        p("Nenhuma deficiência identificada.");
      } else {
        sectionDeficiencias.forEach((def, defIndex) => {
          ensureSpace(24);
          pdf
            .fillColor(textDark)
            .font("Helvetica-Bold")
            .fontSize(10.5)
            .text(`${defIndex + 1}. Deficiência: ${def.deficiencia}`, marginLeft, pdf.y, {
              width: contentWidth,
              lineGap: 2,
            });
          pdf.moveDown(0.2);
          if (def.criticidade) {
            pdf
              .fillColor(textMuted)
              .font("Helvetica")
              .fontSize(10.5)
              .text(`Criticidade: ${def.criticidade}`, marginLeft, pdf.y, {
                width: contentWidth,
                lineGap: 2,
              });
          }
          if (incluirRecomendacoes === "INCLUIR" && def.recomendacao) {
            pdf
              .fillColor(textMuted)
              .font("Helvetica")
              .fontSize(10.5)
              .text(`Recomendação: ${def.recomendacao}`, marginLeft, pdf.y, {
                width: contentWidth,
                lineGap: 2,
              });
          }
        });
      }
    });

    titleBlock("5- CONCLUSÃO");
    p(
      "A tabela abaixo mostra a relação de deficiências e respectiva criticidade identificadas como resultado da avaliação dos diversos itens do Programa de PLD/FTP da Instituição."
    );

    const conclusaoRows = ReportService.buildConclusaoRows(sections);
    const drawConclusaoTable = (
      rows: Array<{ label: string; baixa: number; media: number; alta: number; total: number }>
    ) => {
      const labelWidth = 220;
      const colWidth = Math.floor((contentWidth - labelWidth) / 4);
      const paddingX = 6;
      const paddingY = 6;
      const fillHeader = "#F1F5F9";
      const borderColor = "#94A3B8";
      const fillBaixa = "#DCFCE7";
      const fillMedia = "#FEF9C3";
      const fillAlta = "#FEE2E2";

      const drawRow = (
        values: string[],
        isHeader: boolean
      ) => {
        const rowHeight = Math.max(
          measureTextHeight(values[0], {
            width: labelWidth - paddingX * 2,
            font: isHeader ? "Helvetica-Bold" : "Helvetica",
            fontSize: 10,
            lineGap: 1,
          }),
          measureTextHeight(values[1], {
            width: colWidth - paddingX * 2,
            font: isHeader ? "Helvetica-Bold" : "Helvetica",
            fontSize: 10,
            lineGap: 1,
          })
        ) + paddingY * 2;

        ensureSpace(rowHeight + 4);
        const startY = pdf.y;

        const fill = isHeader ? fillHeader : "#FFFFFF";
        pdf.save();
        pdf.fillColor(fill).rect(marginLeft, startY, labelWidth, rowHeight).fill();
        pdf
          .fillColor(fillBaixa)
          .rect(marginLeft + labelWidth + 0 * colWidth, startY, colWidth, rowHeight)
          .fill();
        pdf
          .fillColor(fillMedia)
          .rect(marginLeft + labelWidth + 1 * colWidth, startY, colWidth, rowHeight)
          .fill();
        pdf
          .fillColor(fillAlta)
          .rect(marginLeft + labelWidth + 2 * colWidth, startY, colWidth, rowHeight)
          .fill();
        pdf
          .fillColor(fill)
          .rect(marginLeft + labelWidth + 3 * colWidth, startY, colWidth, rowHeight)
          .fill();
        pdf.restore();

        pdf
          .strokeColor(borderColor)
          .rect(marginLeft, startY, contentWidth, rowHeight)
          .stroke();
        for (let i = 0; i < 4; i++) {
          pdf
            .strokeColor(borderColor)
            .moveTo(marginLeft + labelWidth + i * colWidth, startY)
            .lineTo(marginLeft + labelWidth + i * colWidth, startY + rowHeight)
            .stroke();
        }

        pdf
          .fillColor(textDark)
          .font(isHeader ? "Helvetica-Bold" : "Helvetica")
          .fontSize(10)
          .text(values[0], marginLeft + paddingX, startY + paddingY, {
            width: labelWidth - paddingX * 2,
            lineGap: 1,
          });

        values.slice(1).forEach((val, idx) => {
          pdf
            .fillColor(textDark)
            .font(isHeader ? "Helvetica-Bold" : "Helvetica")
            .fontSize(10)
            .text(val, marginLeft + labelWidth + idx * colWidth + paddingX, startY + paddingY, {
              width: colWidth - paddingX * 2,
              align: "center",
              lineGap: 1,
            });
        });

        pdf.y = startY + rowHeight;
      };

      drawRow(["Item avaliado", "BAIXA", "MÉDIA", "ALTA", "TOTAL"], true);
      rows.forEach((row) => {
        drawRow(
          [
            row.label,
            String(row.baixa),
            String(row.media),
            String(row.alta),
            String(row.total),
          ],
          false
        );
      });
    };

    drawConclusaoTable(conclusaoRows);

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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

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
    const baseUrl = (process.env.PUBLIC_BASE_URL || "http://localhost:3001")
      .replace(/\/api\/?$/, "")
      .replace(/\/+$/, "");

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
                      `${index + 1}. ${ReportService.sanitizeQuestionTitle(question.title)}`
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

        const titleText = `${index + 1}. ${ReportService.sanitizeQuestionTitle(question.title)}`;
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
