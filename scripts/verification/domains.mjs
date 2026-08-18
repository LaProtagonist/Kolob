import { dependencyClosure } from "./affected.mjs";
import { unique } from "./utils.mjs";

export const LEVELS = { fast: 0, targeted: 1, integration: 2, release: 3 };

export function normalizeLevel(level) {
  if (level === "0") return "fast";
  if (level === "1") return "targeted";
  if (level === "2") return "integration";
  if (level === "3") return "release";
  if (!(level in LEVELS)) throw new Error(`Unknown verification level: ${level}`);
  return level;
}

export function checksForDomain(domain, level = "targeted", profile = "direct") {
  if (profile === "dependency") return unique(domain.dependency || []);
  const normalized = normalizeLevel(level);
  const checks = [...(domain.fast || [])];
  if (LEVELS[normalized] >= LEVELS.targeted) checks.push(...(domain.targeted || []));
  if (LEVELS[normalized] >= LEVELS.integration) checks.push(...(domain.integration || []));
  return unique(checks);
}

function topologicalOrder(domainIds, config) {
  const selected = new Set(domainIds);
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = id => {
    if (visited.has(id)) return;
    if (visiting.has(id)) return;
    visiting.add(id);
    for (const upstream of config.domains[id]?.upstream || []) {
      if (selected.has(upstream)) visit(upstream);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(id);
  };
  for (const id of domainIds) visit(id);
  return ordered;
}

export function buildPlan({ config, directDomains, affectedDomains, visualImpact = {}, level = "targeted", forceVisual = false }) {
  const normalized = normalizeLevel(level);
  const direct = new Set(directDomains);
  return topologicalOrder(affectedDomains, config).map(domainId => {
    const profile = direct.has(domainId) ? "direct" : "dependency";
    const domainLevel = profile === "dependency" ? "integration" : normalized;
    const impact = forceVisual && config.domains[domainId].visual?.route
      ? (visualImpact[domainId] === "none" ? "high" : visualImpact[domainId])
      : (visualImpact[domainId] || "none");
    return {
      domain: domainId,
      profile,
      level: domainLevel,
      checks: checksForDomain(config.domains[domainId], normalized, profile),
      visualImpact: impact,
      visual: Boolean(config.domains[domainId].visual?.route && impact !== "none" && profile === "direct"),
    };
  });
}

export function planExplicitDomain(config, domainId, { level = "targeted", includeDownstream = false, visualImpact = "none" } = {}) {
  if (!config.domains[domainId]) throw new Error(`Unknown domain: ${domainId}`);
  const affectedDomains = includeDownstream ? dependencyClosure([domainId], config) : [domainId];
  return buildPlan({ config, directDomains: [domainId], affectedDomains, visualImpact: { [domainId]: visualImpact }, level });
}

export function downstreamOf(domainId, config) {
  return new Set(dependencyClosure([domainId], config).slice(1));
}
