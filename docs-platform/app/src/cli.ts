import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { applyRegister, generateCsv, previewRegister } from "./capex/workflow.js";
import { readRegister, registerStatistics, sourceMarkdownPath, validateRegister } from "./capex/register.js";
import { applyModularIteration, applyModularReverse, buildConfiguration, listFormats, listModules, materializeModularRollbackPayload, prepareModularReverse, previewConfiguration, previewModularIteration, previewModularReverse, validateConfigurations, writeApprovedModularPayload } from "./capex/modular-workflow.js";
import { applyPriceIteration, previewPriceIteration, previewPriceReverse, writeApprovedPriceArtifacts } from "./capex/price-workflow.js";
import { appendConfiguratorTimeline, applyConfiguratorAudit, previewConfiguratorAudit, previewConfiguratorReverse, writeConfiguratorAuditArtifacts } from "./capex/configurator-audit-workflow.js";
import { appendPilotTimeline, applyPilotIteration, previewPilotIteration, previewPilotReverse, writePilotArtifacts } from "./capex/pilot-expansion-workflow.js";
import { applyRemainingPriceIteration, previewRemainingPriceIteration, previewRemainingPriceReverse, writeRemainingPriceArtifacts } from "./capex/remaining-price-workflow.js";
import { checkWebSnapshot, writeWebSnapshot } from "./capex/web-snapshot.js";
import { writeCapexGovernanceProjection } from "./capex/governance-projection.js";
import { readPriceResearch, validatePriceResearch } from "./capex/price-research.js";
import { applyChange, loadRegistry, previewReverseChange, printChangePreview, readYaml, registryKinds, requireChange, validateRegistry, writeReverseChange } from "./governance/registry.js";
import { appendTimelineEvent, generateTimeline, readTimelineEvents, renderTimeline, validateTimeline, type TimelineEventInput } from "./governance/timeline.js";
import { validateArtifacts } from "./governance/artifacts.js";
import { buildContext, onboardReport, validateContext } from "./governance/context.js";
import { deploymentDriftCheck, googleDriftCheck } from "./governance/external.js";
import { readDeploymentManifest, recordDeploymentReceipt, writeDeploymentManifest } from "./governance/deployment.js";
import { backfillCommittedEvents, createHistoricalIterationTags, importLegacyHistory, verifyHistoricalTags, writeGitLinkAuditMarkdown } from "./governance/history.js";
import { commitIteration, finalizeIteration, governanceValidationErrors, sealIteration } from "./governance/git-workflow.js";
import { validateImmutability } from "./governance/immutability.js";
import { historicalCompensationPreview, prepareRollbackLatest, rollbackLatestPreview } from "./governance/reversal.js";
import { createRequiredHistoricalSnapshots, validateSnapshots } from "./governance/snapshots.js";
import { authorizeInteractively, authorizeProjectFolderInteractively } from "./google/auth.js";
import { applyCapexRegisterSheet, finalizeCapexRegisterSheetReceipt, importCapexOverrides, previewCapexRegisterSheet } from "./google/capex-register-publisher.js";
import { applyPublication, buildPublicationPreview } from "./google/publisher.js";
import { cleanupTests, createTests, doctor, inspectFolder, readTests, updateTests } from "./google/workspace.js";
import { applyInvestorStartModel, checkInvestorStartModel, previewInvestorStartModel, previewInvestorStartReverse } from "./investor/start-model.js";
import { checkRevenueWebSnapshot, validateRevenueModel, writeRevenueWebSnapshot } from "./investor/revenue-model.js";
import { checkFinancialProjection, readFinancialModel, validateFinancialModel, writeFinancialProjection } from "./financial/financial-model.js";
import { checkFinancialGoogleSheetsPayload, writeFinancialGoogleSheetsPayload } from "./financial/google-sheet.js";
import { applyFinancialModelSheet, previewFinancialModelSheet, readbackFinancialModelSheet } from "./google/financial-model-publisher.js";

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
  } else if (command === "history:backfill") {
    const imported = importLegacyHistory();
    const committed = backfillCommittedEvents();
    writeGitLinkAuditMarkdown();
    const snapshots = createRequiredHistoricalSnapshots();
    console.log(JSON.stringify({ legacy_imported: imported.length, committed_backfilled: committed.length, snapshots: snapshots.length }, null, 2));
  } else if (command === "history:tags") {
    console.log(JSON.stringify({ created: createHistoricalIterationTags() }, null, 2));
  } else if (command === "history:validate") {
    const errors = [...validateImmutability(), ...validateTimeline(), ...verifyHistoricalTags(), ...validateSnapshots()];
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("governance history validation: OK");
  } else if (command === "context:build") {
    console.log(YAML.stringify(buildContext(), { lineWidth: 0 }));
  } else if (command === "context:validate") {
    validateContext();
    console.log("context validation: OK");
  } else if (command === "project:onboard") {
    const report = onboardReport();
    console.log(report.output);
    if (report.errors.length) throw new Error(report.errors.join("\n"));
  } else if (command === "iteration:commit") {
    console.log(commitIteration(flag(args, "--iteration"), flag(args, "--message")));
  } else if (command === "iteration:seal") {
    console.log(JSON.stringify(sealIteration(flag(args, "--iteration")), null, 2));
  } else if (command === "iteration:finalize") {
    console.log(JSON.stringify(finalizeIteration(flag(args, "--iteration"), flag(args, "--message")), null, 2));
  } else if (command === "iteration:rollback:preview") {
    console.log(YAML.stringify(rollbackLatestPreview(Number(flag(args, "--steps"))), { lineWidth: 0 }));
  } else if (command === "iteration:rollback:prepare") {
    console.log(prepareRollbackLatest(Number(flag(args, "--steps"))));
  } else if (command === "iteration:compensate:preview") {
    console.log(YAML.stringify(historicalCompensationPreview(flag(args, "--iteration")), { lineWidth: 0 }));
  } else if (command === "google:drift:check") {
    console.log(JSON.stringify(googleDriftCheck(), null, 2));
  } else if (command === "deployment:drift:check") {
    const remoteManifestPath = flag(args, "--remote-manifest");
    const remote = remoteManifestPath ? readDeploymentManifest(path.resolve(remoteManifestPath)) : null;
    console.log(JSON.stringify(deploymentDriftCheck(remote ? { [remote.deployment_id]: remote } : {}, false), null, 2));
  } else if (command === "deployment:manifest:write") {
    console.log(JSON.stringify(writeDeploymentManifest({
      iterationId: flag(args, "--iteration"),
      contentCommitHash: flag(args, "--content-commit"),
      sealCommitHash: flag(args, "--seal-commit"),
      deploymentId: flag(args, "--deployment-id"),
      productionUrl: flag(args, "--production-url") || undefined,
      builtAt: flag(args, "--built-at"),
      deployedAt: flag(args, "--deployed-at"),
    }), null, 2));
  } else if (command === "deployment:receipt:record") {
    console.log(YAML.stringify(recordDeploymentReceipt({
      manifestPath: path.resolve(flag(args, "--manifest") || path.join("dist", "deployment-manifest.json")),
      smokeTestResult: (flag(args, "--smoke") || "failed") as "passed" | "failed",
    }), { lineWidth: 0 }));
  } else if (command === "artifact:validate") {
    const errors = validateArtifacts();
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("artifact validation: OK");
  } else if (command === "governance:validate") {
    const errors = governanceValidationErrors();
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("governance validation: OK");
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
  } else if (command === "capex:remaining-prices:artifacts") {
    writeRemainingPriceArtifacts();
  } else if (command === "capex:remaining-prices:preview") {
    previewRemainingPriceIteration();
  } else if (command === "capex:remaining-prices:apply") {
    applyRemainingPriceIteration(applyOptions(args));
  } else if (command === "capex:remaining-prices:reverse:preview") {
    previewRemainingPriceReverse(args[0] ? path.resolve(args[0]) : undefined, flag(args, "--change-id"), flag(args, "--decision"));
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
  } else if (command === "capex:pilot:artifacts") {
    writePilotArtifacts();
  } else if (command === "capex:pilot:preview") {
    previewPilotIteration();
  } else if (command === "capex:pilot:apply") {
    applyPilotIteration(applyOptions(args));
  } else if (command === "capex:pilot:reverse:preview") {
    previewPilotReverse(args[0] ? path.resolve(args[0]) : undefined, flag(args, "--change-id"), flag(args, "--decision"));
  } else if (command === "capex:pilot:timeline") {
    appendPilotTimeline();
  } else if (command === "capex:web:sync") {
    writeWebSnapshot();
  } else if (command === "capex:web:check") {
    checkWebSnapshot();
  } else if (command === "capex:governance:sync") {
    console.log(JSON.stringify(writeCapexGovernanceProjection(), null, 2));
  } else if (command === "investor:start:preview") {
    previewInvestorStartModel();
  } else if (command === "investor:start:apply") {
    applyInvestorStartModel(applyOptions(args));
  } else if (command === "investor:start:validate") {
    checkInvestorStartModel();
  } else if (command === "investor:start:reverse:preview") {
    previewInvestorStartReverse(args[0] ? path.resolve(args[0]) : undefined, flag(args, "--change-id"), flag(args, "--decision"));
  } else if (command === "revenue:model:validate") {
    const errors = validateRevenueModel();
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("revenue model validation: OK");
  } else if (command === "revenue:web:sync") {
    console.log(JSON.stringify(writeRevenueWebSnapshot(), null, 2));
  } else if (command === "revenue:web:check") {
    console.log(JSON.stringify(checkRevenueWebSnapshot(), null, 2));
  } else if (command === "financial:model:validate") {
    const errors = validateFinancialModel(readFinancialModel());
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("financial model validation: OK");
  } else if (command === "financial:model:sync") {
    console.log(JSON.stringify(writeFinancialProjection(), null, 2));
  } else if (command === "financial:model:check") {
    console.log(JSON.stringify(checkFinancialProjection(), null, 2));
  } else if (command === "financial:sheet:payload") {
    console.log(JSON.stringify(writeFinancialGoogleSheetsPayload(), null, 2));
  } else if (command === "financial:sheet:check") {
    console.log(JSON.stringify(checkFinancialGoogleSheetsPayload(), null, 2));
  } else if (command === "financial:sheet:preview") {
    await previewFinancialModelSheet();
  } else if (command === "financial:sheet:apply") {
    await applyFinancialModelSheet(applyOptions(args));
  } else if (command === "financial:sheet:readback") {
    await readbackFinancialModelSheet();
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
  } else if (command === "capex:sheet:receipt:finalize") {
    finalizeCapexRegisterSheetReceipt(flag(args, "--content-commit"));
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
  else throw new Error("commands: registry:*|change:*|timeline:*|history:*|context:*|project:onboard|iteration:*|artifact:*|governance:*|capex:*|investor:start:*|revenue:*|financial:*|google:*|deployment:*|documents:list|decisions:list");
} catch (error) {
  console.error(`ERROR: ${(error as Error).message}`);
  process.exitCode = 1;
}
