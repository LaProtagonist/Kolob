# CHG-INVESTOR-TERMINAL-V2-RELEASE-AUTH-2026-08-26-01

Decision: DEC-NETWORK-PLANNING-V2-4-2026-08-26-01
Applied: 2026-08-26T13:51:34.294Z
Actor: Codex
Tool: docs-platform change:apply
Before SHA-256: 2cdf46a68538748d1eb1092a2441923e94cdf4a221e7d947c3e79a0f132de70d
After SHA-256: 633023758c8f3622d361ee9ca0650988197c57cf90992f037e616098ec41e37e

## Operations

sources: add SRC-INVESTOR-TERMINAL-V2-RELEASE-BRIEF-2026-08-26
  before_index: null
  after_index:  160
  before_sha256: null
  after_sha256:  1237c0d7ae671b71ce4d732470eacb1f2f42e7caaf480f2fb37b99cd7b064157
  before: null
  after:  {"id":"SRC-INVESTOR-TERMINAL-V2-RELEASE-BRIEF-2026-08-26","title":"Задание на интеграцию и production-публикацию Investor Terminal v2","type":"instruction","location":"User instruction, 2026-08-26","publisher":"project owner","publication_date":"2026-08-26","accessed_at":"2026-08-26","reliability":"primary","notes":"Прямое разрешение владельца закрыть принятую feature-линию Investor Terminal v2, штатно интегрировать её в актуальную production-ветку и опубликовать после полного release verification."}

decisions: add DEC-INVESTOR-TERMINAL-V2-RELEASE-2026-08-26-01
  before_index: null
  after_index:  22
  before_sha256: null
  after_sha256:  ea4652aeb6ab88b6ab3d7c1d3a0cdfea94bfde429c8103b7ad9172d973ebbc4d
  before: null
  after:  {"id":"DEC-INVESTOR-TERMINAL-V2-RELEASE-2026-08-26-01","title":"Выпустить Investor Terminal v2 в составе основного сайта","status":"approved","decision":"Принятую целостную feature-линию feat/investor-terminal-v2 после verification и seal штатно merge-интегрировать с актуальной production-веткой и опубликовать на https://colob.spi.ski. Investor-facing название — «Терминал инвестора»; порядок investor navigation — «Модель развития», «Материалы проекта», «Терминал инвестора», «Обсудить участие».","rationale":"Прямое решение владельца от 2026-08-26. Не утверждает новые финансовые формулы или бизнес-допущения; release включает уже принятые runtime, state, planning и calculation dependencies feature-линии как единое целое.","affected_documents":["DOC-NETWORK-PLANNING-ASSUMPTIONS","DOC-FINANCIAL-MODEL","DOC-INVESTOR-FINANCIAL-SUMMARY","DOC-INVESTOR-START-MODEL"],"approved_by":"project owner","approved_at":"2026-08-26","supersedes":null,"source_ids":["SRC-INVESTOR-TERMINAL-V2-RELEASE-BRIEF-2026-08-26"],"updated_at":"2026-08-26"}
