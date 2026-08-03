import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { applyRegister, generateCsv, previewRegister } from "./capex/workflow.js";
import { readRegister, registerStatistics, sourceMarkdownPath, validateRegister } from "./capex/register.js";
import { applyModularIteration, applyModularReverse, buildConfiguration, listFormats, listModules, materializeModularRollbackPayload, prepareModularReverse, previewConfiguration, previewModularIteration, previewModularReverse, validateConfigurations, writeApprovedModularPayload } from "./capex/modular-workflow.js";
import { applyPriceIteration, previewPriceIteration, previewPriceReverse, writeApprovedPriceArtifacts } from "./capex/price-workflow.js";
import { appendConfiguratorTimeline, applyConfiguratorAudit, previewConfiguratorAudit, previewConfiguratorReverse, writeConfiguratorAuditArtifacts } from "./capex/configurator-audit-workflow.js";
import { checkWebSnapshot, writeWebSnapshot } from "./capex/web-snapshot.js";
import { readPriceResearch, validatePriceResearch } from "./capex/price-research.js";
import { applyChange, loadRegistry, previewReverseChange, printChangePreview, readYaml, registryKinds, requireChange, validateRegistry, writeReverseChange } from "./governance/registry.js";
import { appendTimelineEvent, generateTimeline, readTimelineEvents, renderTimeline, validateTimeline, type TimelineEventInput } from "./governance/timeline.js";
import { authorizeInteractively, authorizeProjectFolderInteractively } from "./google/auth.js";
import { applyCapexRegisterSheet, importCapexOverrides, previewCapexRegisterSheet } from "./google/capex-register-publisher.js";
import { applyPublication, buildPublicationPreview } from "./google/publisher.js";
import { cleanupTests, createTests, doctor, inspectFolder, readTests, updateTests } from "./google/workspace.js";

function flag(args: string[], name: string) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] ?? "" : ""; }
function applyOptions(args: string[]) { return { apply: args.includes("--apply"), decisionId: flag(args, "--decision") }; }
function requireArgument(args: string[], label: string) { if (!args[0]) throw new Error(`Specify ${label}.`); return args[0]; }

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "registry:validate") {
    const errors = validateRegistry();
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("registry validation: OK");
  } else if (["registry:list", "documents:list", "decisions:list"].includes(command)) {
    const registry = loadRegistry();
    const kinds: readonly (typeof registryKinds[number])[] = command === "documents:list" ? ["documents"] : command === "decisions:list" ? ["decisions"] : registryKinds;
    for (const kind of kinds) for (const item of registry[kind]) console.log(`${item.id}\t${item.status ?? "-"}\t${item.title}`);
  } else if (command === "change:preview") {
    const { change } = requireChange(requireArgument(args, "a change-file"));
    printChangePreview(change);
  } else if (command === "change:apply") {
    const { change, absolute } = requireChange(requireArgument(args, "a change-file"));
    applyChange(change, absolute);
  } else if (command === "change:reverse:preview") {
    const receipt = path.resolve(requireArgument(args, "a change receipt"));
    console.log(YAML.stringify(previewReverseChange(receipt, flag(args, "--change-id"), flag(args, "--decision")), { lineWidth: 0 }));
  } else if (command === "change:reverse:prepare") {
    const receipt = path.resolve(requireArgument(args, "a change receipt"));
    const result = writeReverseChange(receipt, flag(args, "--change-id"), flag(args, "--decision"));
    console.log(YAML.stringify({ ...result, destination: path.relative(process.cwd(), result.destination) }, { lineWidth: 0 }));
  } else if (command === "timeline:append") {
    const input = readYaml(path.resolve(requireArgument(args, "an event file"))) as TimelineEventInput;
    console.log(JSON.stringify(appendTimelineEvent(input), null, 2));
  } else if (command === "timeline:validate") {
    const errors = validateTimeline();
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(`timeline validation: OK (${readTimelineEvents().length} events)`);
  } else if (command === "timeline:generate") {
    console.log(`timeline generated: ${generateTimeline()}`);
  } else if (command === "timeline:preview") {
    console.log(renderTimeline());
  } else if (command === "capex:register:preview") {
    previewRegister();
  } else if (command === "capex:register:apply") {
    applyRegister(applyOptions(args));
  } else if (command === "capex:register:csv") {
    generateCsv();
  } else if (command === "capex:register:validate") {
    const register = readRegister();
    const source = fs.readFileSync(sourceMarkdownPath(), "utf8");
    const errors = validateRegister(register, source);
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(JSON.stringify({ validation: "OK", ...registerStatistics(register) }, null, 2));
  } else if (command === "capex:modular:payload") {
    writeApprovedModularPayload();
  } else if (command === "capex:modular:preview") {
    previewModularIteration();
  } else if (command === "capex:modular:apply") {
    applyModularIteration(applyOptions(args));
  } else if (command === "capex:modular:reverse:preview") {
    const receipt = path.resolve(requireArgument(args, "a modular iteration receipt"));
    console.log(YAML.stringify(previewModularReverse(receipt, flag(args, "--change-id"), flag(args, "--decision")), { lineWidth: 0 }));
  } else if (command === "capex:modular:reverse:prepare") {
    prepareModularReverse(path.resolve(requireArgument(args, "a modular iteration receipt")), flag(args, "--change-id"), flag(args, "--decision"));
  } else if (command === "capex:modular:reverse:apply") {
    applyModularReverse(path.resolve(requireArgument(args, "an approved modular reverse change set")), applyOptions(args));
  } else if (command === "capex:modular:rollback:materialize") {
    materializeModularRollbackPayload(args[0] ? path.resolve(args[0]) : undefined);
  } else if (command === "capex:price:artifacts") {
    writeApprovedPriceArtifacts();
  } else if (command === "capex:price:preview") {
    previewPriceIteration();
  } else if (command === "capex:price:apply") {
    applyPriceIteration(applyOptions(args));
  } else if (command === "capex:price:validate") {
    const research = readPriceResearch();
    const errors = validatePriceResearch(research, readRegister());
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(JSON.stringify({ validation: "OK", ...research.summary }, null, 2));
  } else if (command === "capex:price:reverse:preview") {
    previewPriceReverse(args[0] ? path.resolve(args[0]) : undefined, flag(args, "--change-id"), flag(args, "--decision"));
  } else if (command === "capex:configurator:artifacts") {
    writeConfiguratorAuditArtifacts();
  } else if (command === "capex:configurator:preview") {
    previewConfiguratorAudit();
  } else if (command === "capex:configurator:apply") {
    applyConfiguratorAudit(applyOptions(args));
  } else if (command === "capex:configurator:reverse:preview") {
    previewConfiguratorReverse(args[0] ? path.resolve(args[0]) : undefined, flag(args, "--change-id"), flag(args, "--decision"));
  } else if (command === "capex:configurator:timeline") {
    appendConfiguratorTimeline();
  } else if (command === "capex:web:sync") {
    writeWebSnapshot();
  } else if (command === "capex:web:check") {
    checkWebSnapshot();
  } else if (command === "capex:formats:list") {
    listFormats();
  } else if (command === "capex:modules:list") {
    listModules();
  } else if (command === "capex:configuration:validate") {
    validateConfigurations();
  } else if (command === "capex:configuration:preview") {
    previewConfiguration(requireArgument(args, "a configuration ID"));
  } else if (command === "capex:configuration:build") {
    buildConfiguration(requireArgument(args, "a configuration ID"));
  } else if (command === "capex:sheet:preview") {
    await previewCapexRegisterSheet();
  } else if (command === "capex:sheet:apply") {
    await applyCapexRegisterSheet(applyOptions(args));
  } else if (command === "google:capex:overrides:import") {
    await importCapexOverrides({ preview: args.includes("--preview"), apply: args.includes("--apply") });
  } else if (command === "google:doctor") await doctor();
  else if (command === "google:auth") await authorizeInteractively();
  else if (command === "google:folder:authorize") await authorizeProjectFolderInteractively();
  else if (command === "google:folder:inspect") await inspectFolder(args.includes("--create"));
  else if (command === "google:publish:preview") await buildPublicationPreview();
  else if (command === "google:publish:apply") await applyPublication(applyOptions(args));
  else if (command === "google:test:create") await createTests();
  else if (command === "google:test:read") await readTests();
  else if (command === "google:test:update") await updateTests(args);
  else if (command === "google:test:cleanup") await cleanupTests();
  else throw new Error("commands: registry:*|change:*|timeline:*|capex:register:*|capex:modular:*|capex:price:*|capex:configurator:*|capex:web:*|capex:configuration:*|capex:formats:list|capex:modules:list|capex:sheet:*|google:*|documents:list|decisions:list");
} catch (error) {
  console.error(`ERROR: ${(error as Error).message}`);
  process.exitCode = 1;
}
