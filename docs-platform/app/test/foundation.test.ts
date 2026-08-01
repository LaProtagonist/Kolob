import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

const platform = path.resolve(import.meta.dirname, "../..");
const canonical = [
  ["PRP-FND-001", "Назначение проекта", "Проект «Колобочная» является основой для создания и развития компании, способной масштабировать новый формат общественного питания федерального уровня.\nВсе стратегические решения внутри проекта принимаются с позиции их влияния на долгосрочное развитие компании, её устойчивость, потенциал масштабирования и способность создавать самостоятельную ценность на каждом этапе своего развития."],
  ["PRP-FND-002", "Главный актив проекта", "Главным активом проекта является не отдельный продукт, технология или объект инфраструктуры, а компания, её способность к развитию, масштабированию и долгосрочному созданию ценности.\nЛюбые материальные и нематериальные активы рассматриваются как инструменты усиления компании, а не как самостоятельная цель её существования."],
  ["PRP-FND-003", "Главная цель проекта", "Главной целью проекта является последовательное увеличение долгосрочной ценности компании.\nРост выручки, прибыли, количества объектов, производственных мощностей, инфраструктуры и иных показателей рассматривается как средство достижения этой цели, а не как самостоятельная цель развития."],
  ["PRP-FND-004", "Принцип развития", "Развитие компании осуществляется через последовательное усиление её конкурентных преимуществ, устойчивости и способности к масштабированию.\nКаждый новый этап развития должен не только решать текущие задачи, но и создавать основу для реализации последующих этапов, увеличивая общую ценность компании."],
  ["PRP-FND-005", "Развитие инфраструктуры", "Развитие собственной инфраструктуры рассматривается как естественный этап эволюции компании по мере её роста и масштабирования.\nСоздание производственных мощностей, логистической системы, собственных объектов, сельскохозяйственных проектов и других элементов инфраструктуры осуществляется только тогда, когда это повышает эффективность, устойчивость и долгосрочную ценность компании."],
  ["PRP-FND-006", "Принцип принятия решений", "Все стратегические решения принимаются на основе объективных данных, практического опыта, проверки гипотез и их влияния на долгосрочную ценность компании.\nНи одно решение не считается верным только потому, что оно соответствует первоначальному замыслу. Любая гипотеза может быть пересмотрена, если накопленные данные подтверждают необходимость такого изменения."],
  ["PRP-FND-007", "Приоритет Foundation", "Foundation определяет базовые принципы проекта и является исходной точкой для разработки всех остальных документов.\nПри возникновении противоречий между Foundation и производными документами в первую очередь проводится анализ причин расхождения. Изменение Foundation допускается только при осознанном пересмотре базовых принципов проекта. Во всех остальных случаях в соответствие с Foundation приводятся производные документы."]
] as const;

function readYaml<T>(name: string): T { return YAML.parse(fs.readFileSync(path.join(platform, "registry", name), "utf8")) as T; }

test("Foundation v1.0 registers the governing document and all canonical PRP blocks exactly", () => {
  const document = fs.readFileSync(path.join(platform, "00-foundation.md"), "utf8");
  const documents = readYaml<{ documents: Array<Record<string, unknown>> }>("documents.yaml").documents;
  const principles = readYaml<{ principles: Array<Record<string, unknown>> }>("principles.yaml").principles;
  const foundation = documents.find(item => item.id === "DOC-FOUNDATION");

  assert.deepEqual(
    foundation,
    {
      id: "DOC-FOUNDATION",
      title: "Foundation",
      type: "internal_governing_document",
      status: "approved",
      google_file_id: null,
      template: null,
      sections: canonical.map(([id]) => id),
      version: "1.0",
      governance_level: "governing",
      local_path: "docs-platform/00-foundation.md",
      updated_at: "2026-07-23"
    }
  );

  assert.equal(principles.filter(item => item.document === "DOC-FOUNDATION").length, 7);
  for (const [id, title, text] of canonical) {
    const principle = principles.find(item => item.id === id);
    assert.deepEqual(principle, {
      id,
      title,
      document: "DOC-FOUNDATION",
      status: "approved",
      version: "1.0",
      canonical_text: text,
      priority: "governing",
      source_ids: ["SRC-FOUNDATION-V1-APPROVAL"],
      decision_id: "DEC-003",
      updated_at: "2026-07-23"
    });

    const marker = `## ${id} — ${title}\n\n`;
    const start = document.indexOf(marker);
    assert.notEqual(start, -1, `${id} heading is missing`);
    const bodyStart = start + marker.length;
    const bodyEnd = document.indexOf("\n\n## ", bodyStart);
    assert.notEqual(bodyEnd, -1, `${id} section boundary is missing`);
    assert.equal(document.slice(bodyStart, bodyEnd), text, `${id} document text differs from canonical text`);
  }
});

test("Foundation dependency map has governing priority and does not invent unregistered derivative documents", () => {
  const dependencies = readYaml<{ dependencies: Array<Record<string, unknown>> }>("dependencies.yaml").dependencies;
  assert.deepEqual(dependencies.find(item => item.id === "DEP-FOUNDATION-DERIVED-DOCUMENTS"), {
    id: "DEP-FOUNDATION-DERIVED-DOCUMENTS",
    source_document_id: "DOC-FOUNDATION",
    priority: "governing_source",
    status: "approved",
    version: "1.0",
    target_documents: [
      { title: "Шаблон инвестиционного меморандума", document_id: "DOC-INVESTMENT-MEMO" },
      { title: "Business Model Architecture", document_id: "DOC-BUSINESS-MODEL-ARCHITECTURE" },
      { title: "CAPEX — Equipment Specification", document_id: "DOC-CAPEX-EQUIPMENT-SPECIFICATION" },
      { title: "Financial Model", document_id: null },
      { title: "Infrastructure Strategy", document_id: null },
      { title: "Investor Presentation", document_id: null },
      { title: "Website Content", document_id: null },
      { title: "Data Room materials", document_id: null }
    ],
    updated_at: "2026-08-01"
  });
});
