import { useEffect, useRef, useState } from "react";
import type {
  Scenario,
  Parameter,
  EquipmentSelection,
} from "../lib/franchise-model-types";
import { parameters, parameterStatus } from "../lib/franchise-model-scenario";
import {
  referenceData,
  referenceProvenance,
  sourceById,
  inputState,
  maintenanceReference,
  referenceValues,
} from "../lib/franchise-model-data";
import { equipmentBom, equipmentGroups } from "../lib/franchise-model-bom";
import {
  formatInput,
  formatMoney,
  formatNumber,
  formatPercent,
  parseControlNumber,
} from "../lib/control-format";

export function ControlNumberField({
  label,
  value,
  onChange,
  unit = "",
  inherit = false,
  min = 0,
  max,
  reset,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  unit?: string;
  inherit?: boolean;
  min?: number;
  max?: number;
  reset?: () => void;
}) {
  const [text, setText] = useState(formatInput(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatInput(value));
  }, [value]);
  const parsed = parseControlNumber(text),
    invalid =
      parsed.kind === "invalid" ||
      (parsed.kind === "value" &&
        (parsed.value < min || (max !== undefined && parsed.value > max)));
  return (
    <div>
      <div className="fm-number">
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={text}
          aria-invalid={invalid}
          placeholder={inherit ? "Из сценария" : "Требуются данные"}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            if (parsed.kind === "value") setText(formatInput(parsed.value));
          }}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseControlNumber(e.target.value);
            onChange(n.kind === "value" ? n.value : null);
          }}
        />
        {unit && <span>{unit}</span>}
        {reset && (
          <button
            type="button"
            className="fm-reset"
            title={`Сбросить: ${label}`}
            aria-label={`Сбросить: ${label}`}
            onClick={() => {
              focused.current = false;
              reset();
            }}
          >
            ↺
          </button>
        )}
      </div>
      {invalid && (
        <small role="alert">Введите число в допустимом диапазоне.</small>
      )}
    </div>
  );
}
export function Provenance({ p }: { p: Parameter }) {
  const info = referenceProvenance[p.id],
    source = info ? sourceById(info.source) : null;
  return (
    <details className="fm-source" data-provenance>
      <summary>Источник и допущение</summary>
      <p>{source?.title ?? "Задание владельца и рабочий сценарий"}</p>
      <small>{info?.note || p.source}</small>
      {p.id === "fitout" && (
        <p>
          3,5 млн ₽ — ориентир из задания v0.1. Текущая старая финансовая
          проекция содержит 11 млн ₽ для иной конфигурации помещения.
        </p>
      )}
      <code>{info?.assumptionId ?? p.assumptionId}</code>
      {info && (
        <>
          <code>{info.selector}</code>
          <code>{source?.path}</code>
        </>
      )}
    </details>
  );
}
export function DataCoverage({
  s,
  ids,
  title,
}: {
  s: Scenario;
  ids: string[];
  title: string;
}) {
  const unique = [...new Set(ids)],
    items = parameters.filter((p) => unique.includes(p.id));
  const counts = { traceable: 0, working: 0, missing: 0, na: 0 };
  for (const p of items) {
    const status = parameterStatus(s, p.id);
    if (status === "MISSING") counts.missing++;
    else if (status === "NOT_APPLICABLE") counts.na++;
    else if (status === "WORKING") counts.working++;
    else counts.traceable++;
  }
  return (
    <section className="fm-coverage" aria-label={`Полнота данных: ${title}`}>
      <strong>{title}</strong>
      <span>Прослеживаемые: {counts.traceable}</span>
      <span>Рабочие: {counts.working}</span>
      <span>Требуют данных: {counts.missing}</span>
      <span>Не применяются: {counts.na}</span>
    </section>
  );
}
export function NotApplicable({ s, p }: { s: Scenario; p: Parameter }) {
  const state = inputState(s, p);
  return state.kind === "not_applicable" ? (
    <p className="fm-na">
      Не применяется <small>{state.reason}</small>
    </p>
  ) : null;
}
export function BomEditor({
  s,
  update,
  kind,
}: {
  s: Scenario;
  update: (s: Scenario) => void;
  kind: "node" | "franchise";
}) {
  const i = s.integration;
  if (!i) return null;
  const bom = equipmentBom(s, kind),
    key = kind === "node" ? "nodeBom" : "franchiseBom";
  const set = (id: string, patch: Partial<EquipmentSelection>) =>
    update({
      ...s,
      integration: {
        ...i,
        [key]: i[key].map((row) =>
          row.itemId === id ? { ...row, ...patch } : row,
        ),
      },
    });
  return (
    <section className="fm-panel fm-bom" data-testid={`fm-bom-${kind}`}>
      <h3>
        {kind === "node"
          ? "Оборудование первого узла"
          : "Оборудование компактной франчайзинговой точки"}
      </h3>
      {kind === "node" ? (
        <>
          <div className="fm-inline">
            <label>
              Способ оценки{" "}
              <select
                aria-label="Способ оценки оборудования"
                value={i.equipmentMode}
                onChange={(e) =>
                  update({
                    ...s,
                    integration: {
                      ...i,
                      equipmentMode: e.target.value as "bom" | "manual",
                    },
                  })
                }
              >
                <option value="bom">По выбранному составу оборудования</option>
                <option value="manual">Ручная общая оценка</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={i.bar}
                onChange={(e) =>
                  update({ ...s, integration: { ...i, bar: e.target.checked } })
                }
              />
              Модуль напитков (BAR)
            </label>
            <label>
              <input
                type="checkbox"
                checked={i.grow}
                onChange={(e) =>
                  update({
                    ...s,
                    integration: { ...i, grow: e.target.checked },
                  })
                }
              />
              Выращивание зелени (GROW)
            </label>
          </div>
          <p>
            Старая стоимость оборудования, справочно:{" "}
            <strong>{formatMoney(referenceValues.equipment)}</strong>. Состав
            нового узла: <strong>{formatMoney(bom.knownTotal)}</strong>.
          </p>
          <div className="fm-bom-breakdown">
            {bom.breakdown.map((g) => (
              <div key={g.group}>
                <span>{g.label}</span>
                <strong>
                  {g.count ? formatMoney(g.amount) : "Не применяется"}
                </strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <p>
            Рабочий профиль компактной точки. Количества взяты из существующей
            базовой комплектации и доступны для изменения; производительность не
            подтверждена.
          </p>
          <strong className="fm-partial">
            {bom.complete
              ? "Оценённое оборудование"
              : "Частичные инвестиции в оборудование"}
            : {formatMoney(bom.knownTotal)}
          </strong>
          <p>Неоценённых позиций и статей: {bom.unpriced}</p>
        </>
      )}
      <p className="fm-note">
        Цены — справочные из реестра и исследования цен. Требуют коммерческого
        предложения: {bom.quoteCount}. Цены не копируются в сценарий. Ручная
        цена помечается как переопределение.
      </p>
      <details className="fm-bom-items">
        <summary>Выбор позиций, количество и переопределения цены</summary>
        {bom.rows.map((row) => (
          <article className="fm-bom-row" key={row.itemId}>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={(e) =>
                    set(row.itemId, { selected: e.target.checked })
                  }
                />
                {row.item?.name
                  .replace("Robot Coupe", "Кухонный процессор")
                  .replace("post-mix", "смешивающая") ??
                  "Требует классификации"}
              </label>
              <small>
                {row.item
                  ? equipmentGroups[row.item.group]
                  : "Требует классификации"}{" "}
                · {row.applicable ? "В расчёте" : "Не применяется"}
              </small>
              <details data-provenance>
                <summary>Источник позиции</summary>
                <code>{row.itemId}</code>
                <code>{row.item?.sourceId}</code>
                <p>{row.item?.note}</p>
              </details>
            </div>
            <label>
              Количество
              <ControlNumberField
                label={`Количество ${kind === "node" ? "узла" : "франшизы"}: ${row.itemId}`}
                value={row.quantity}
                onChange={(n) => set(row.itemId, { quantity: n })}
                unit="шт."
              />
            </label>
            <div>
              <small>Цена источника</small>
              <strong>{formatMoney(row.item?.unitPrice, 2)}</strong>
            </div>
            <label>
              Своя цена за единицу
              <ControlNumberField
                label={`Своя цена ${kind === "node" ? "узла" : "франшизы"}: ${row.itemId}`}
                value={row.override}
                inherit
                onChange={(n) => set(row.itemId, { override: n })}
                reset={() => set(row.itemId, { override: null })}
              />
              {row.override !== null && (
                <small className="fm-status">Переопределено в сценарии</small>
              )}
            </label>
            <div>
              <small>Сумма</small>
              <strong>
                {row.applicable ? formatMoney(row.total) : "Не применяется"}
              </strong>
            </div>
          </article>
        ))}
      </details>
      {bom.gaps.length > 0 && (
        <div className="fm-notice">
          <strong>Состав ещё неполон</strong>
          <ul>
            {bom.gaps.map((g) => (
              <li key={g.id}>
                <strong>{g.label}.</strong> {g.note}
                <details data-provenance>
                  <summary>Источник</summary>
                  <code>{g.selector}</code>
                </details>
              </li>
            ))}
          </ul>
          <p>
            Срок возврата инвестиций франчайзи не рассчитывается до определения
            полных инвестиций в открытие. Частичный итог оборудования не
            подставляется вместо них.
          </p>
        </div>
      )}
    </section>
  );
}
export function IntegrationControls({
  s,
  update,
  area,
}: {
  s: Scenario;
  update: (s: Scenario) => void;
  area: "own" | "network" | "investor";
}) {
  const i = s.integration;
  if (!i) return null;
  const patch = (change: Partial<typeof i>) =>
    update({ ...s, integration: { ...i, ...change } });
  if (area === "own")
    return (
      <section className="fm-panel">
        <h3>Структура расходов собственной точки</h3>
        <label>
          Способ расчёта{" "}
          <select
            aria-label="Способ расчёта расходов собственной точки"
            value={i.ownOpexMode}
            onChange={(e) =>
              patch({ ownOpexMode: e.target.value as "structured" | "manual" })
            }
          >
            <option value="structured">По статьям расходов</option>
            <option value="manual">Сохранённая ручная общая сумма</option>
          </select>
        </label>
        <p>
          Коммунальные и центральные административные функции встроенной точки
          учитываются в расходах узла один раз. Сервис оборудования отделён от
          инвестиций в поддержание активов.
        </p>
      </section>
    );
  if (area === "network")
    return (
      <section className="fm-panel fm-reference-controls">
        <h3>Запуск продаж и сезонность</h3>
        <label>
          <input
            type="checkbox"
            checked={i.seasonality}
            onChange={(e) => patch({ seasonality: e.target.checked })}
          />
          Учитывать сезонность
        </label>
        <label>
          Календарный месяц первого месяца модели{" "}
          <select
            aria-label="Календарный месяц старта"
            value={i.calendarStartMonth}
            onChange={(e) =>
              patch({ calendarStartMonth: Number(e.target.value) })
            }
          >
            {[
              "Январь",
              "Февраль",
              "Март",
              "Апрель",
              "Май",
              "Июнь",
              "Июль",
              "Август",
              "Сентябрь",
              "Октябрь",
              "Ноябрь",
              "Декабрь",
            ].map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <p>
          Профиль запуска выбирается для каждой точки. Зрелая экономика точки
          показана без сезонности.
        </p>
        <details data-provenance>
          <summary>Справочные профили из финансовой модели</summary>
          <p>
            Выход на выручку:{" "}
            {referenceData.ramp
              .map((r) => `М${r.month}: ${formatPercent(r.ramp_factor)}`)
              .join(" · ")}
          </p>
          <p>
            Сезонность:{" "}
            {referenceData.seasonality
              .map(
                (r) =>
                  `М${r.month}: ${formatPercent(r.seasonality_coefficient)}`,
              )
              .join(" · ")}
          </p>
          <code>
            docs-platform/working/financial-model.yaml · model.ramp_up_profile /
            model.seasonality_profile
          </code>
        </details>
      </section>
    );
  const maintenance = maintenanceReference(s);
  return (
    <section className="fm-panel">
      <h3>Справочная налоговая модель и поддержание активов</h3>
      <div className="fm-fields">
        <label>
          Налоги
          <select
            aria-label="Налоговая модель"
            value={i.taxMode}
            onChange={(e) => {
              const mode = e.target.value as "reference" | "manual";
              let next = { ...s, integration: { ...i, taxMode: mode } };
              if (mode === "reference") {
                next = {
                  ...next,
                  inputs: {
                    ...s.inputs,
                    tax_profit: referenceValues.tax_profit,
                    tax_sales: referenceValues.tax_sales,
                  },
                  edited: s.edited.filter(
                    (k) => !["tax_profit", "tax_sales"].includes(k),
                  ),
                };
              }
              update(next);
            }}
          >
            <option value="reference">
              Справочная модель существующего расчётного контура
            </option>
            <option value="manual">Ручные рабочие ставки</option>
          </select>
        </label>
        <label>
          Поддержание активов
          <select
            aria-label="Модель поддержания активов"
            value={i.maintenanceMode}
            onChange={(e) =>
              patch({
                maintenanceMode: e.target.value as "reference" | "manual",
              })
            }
          >
            <option value="reference">
              Справочная формула: оборудование и мебель
            </option>
            <option value="manual">Ручная общая сумма</option>
          </select>
        </label>
      </div>
      <p>
        Налог: максимум из {formatPercent(s.inputs.tax_profit)} положительного
        результата и {formatPercent(s.inputs.tax_sales)} поступлений. Подлежит
        уточнению после выбора юридической структуры группы и платежей
        франчайзи.
      </p>
      <p>
        Поддерживающие инвестиции:{" "}
        {formatPercent(referenceValues.maintenance_rate)} в год от оборудования
        и мебели = {formatMoney(maintenance.equipmentAndFurniture)} / мес. Новые
        цифровые активы и расширение — отдельные пробелы, пока их расходы не
        заполнены.
      </p>
      <details data-provenance>
        <summary>Источники и методика</summary>
        <code>ASM-FINANCIAL-TAX-PROXY</code>
        <code>
          financial-model.yaml · tax.scenarios.base / maintenance_capex
        </code>
        <p>
          Чистые функции существующего расчётного контура. Исходные ставки,
          документы и публичный расчёт не изменяются.
        </p>
      </details>
    </section>
  );
}
