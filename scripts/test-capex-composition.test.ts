import test from 'node:test';
import assert from 'node:assert/strict';
import { capexData, buildCapexRows, buildFormatCapexRows, emptyCapexParameters, formatCompositionSummary } from '../src/lib/capex-runtime';
import { calculateLaunchBudget, defaultLaunchBudgetState } from '../src/lib/launch-budget';
import { createNetworkPointCohort, defaultInvestorConfiguration } from '../src/lib/investor-configuration';
import { networkScalingProjection } from '../src/lib/network-scaling';
import { allocatePropertyFunding } from '../src/lib/property-funding';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compatibleFinancialCapexImport } from '../docs-platform/app/src/capex/import-compatibility';

// Detects leaked production/coffee, duplicate devices, dropped funds and legacy migration.
// A type check cannot verify these monetary and applicability contracts.
const options = { barEnabled: true, washMode: 'manual' as const };
const parameters = emptyCapexParameters({ seatCount: 26, cashierPostCount: 2, hotKitchenPostCount: 2, fillingCount: 8 });
const rows = buildFormatCapexRows('FMT-RESTAURANT-SEATING', 'base', parameters, options);
const result = formatCompositionSummary('FMT-RESTAURANT-SEATING', 'base', rows, options);
const row = (id:string) => rows.find(row => row.item.id === id)!;

test('seated format consumes generated BOM and preserves mandatory device counts', () => {
  const bom = capexData.formats.find(format => format.id === 'FMT-RESTAURANT-SEATING')!.composition!.bom;
  assert.deepEqual([...rows.map(row => row.item.id)].sort(), [...bom.equipment.map(row => row.item_id)].sort());
  for (const item of bom.equipment) assert.equal(row(item.item_id).quantity, item.calculated_quantity, item.item_id);
  for (const [id, quantity] of [['CAPEX-02-001',2],['CAPEX-02-002',3],['CAPEX-02-003',24],['CAPEX-02-004',1],['CAPEX-02-058',2],['CAPEX-02-059',1],['CAPEX-01-025',4],['CAPEX-04-001',2],['CAPEX-04-003',3],['CAPEX-04-004',2]] as const) assert.equal(row(id).quantity, quantity, id);
  assert.equal(new Set(rows.map(row => row.item.id)).size, rows.length);
});

test('filter excludes prep, GROW, production accounting, dome wash and engineering duplicates', () => {
  for (const id of ['CAPEX-01-001','CAPEX-01-002','CAPEX-01-003','CAPEX-01-018','CAPEX-01-012','CAPEX-04-002','CAPEX-08-001']) assert.ok(!row(id), id);
  assert.ok(rows.every(row => !row.item.id.startsWith('CAPEX-03-') && !row.includedInParent));
  assert.ok(rows.every(row => !/кофемаш|кофемол|молочный холодильник/i.test(row.item.name)));
  assert.equal(row('CAPEX-02-006').quantity, 2, 'neutral tables already present');
});

test('cash reserve reclassification conserves funding and is separate from physical equipment', () => {
  assert.equal(result.reserveRub, 39320);
  assert.equal(row('CAPEX-02-056').lineTotal, 281600);
  assert.equal(row('CAPEX-02-057').lineTotal, 111600);
  const additions = rows.filter(row => row.item.compositionProfile && row.item.costKind === 'equipment');
  const newPhysical = additions.reduce((sum,row)=>sum+(row.lineTotal ?? 0),0) + row('CAPEX-01-025').lineTotal!;
  const physical = result.groups.filter(group=>group.kind==='equipment').reduce((sum,group)=>sum+group.knownRub,0) + 26*8500;
  assert.equal(2061433 - 39320, 2022113);
  assert.equal(physical, 2022113 + newPhysical);
  assert.equal(physical, 2385495);
  assert.equal(result.groups.find(group=>group.id==='point-prepaid')!.knownRub,5000);
});

test('18-function completeness remains open when engineering or quotes are unresolved', () => {
  assert.equal(result.functions.length,18);
  assert.equal(result.complete,false);
  assert.equal(result.functions.find(fn=>fn.id==='network')!.status,'open');
  assert.equal(row('CAPEX-04-009').unitPrice,null);
  assert.equal(row('CAPEX-02-060').lineTotal,null);
  assert.equal(result.groups.reduce((sum,group)=>sum+group.missingCount,0),7);
});

test('compact machine is optional, incremental and never activates the historical dome bundle', () => {
  const machine = buildFormatCapexRows('FMT-RESTAURANT-SEATING','base',parameters,{...options,washMode:'machine'});
  assert.ok(!row('CAPEX-08-007'));
  assert.equal(machine.find(row=>row.item.id==='CAPEX-08-007')?.lineTotal,179466);
  assert.ok(!machine.some(row=>row.item.id==='CAPEX-08-001'));
  assert.equal(machine.filter(row=>row.item.id==='CAPEX-01-019').length,1);
  assert.equal(machine.reduce((s,r)=>s+(r.lineTotal??0),0)-rows.reduce((s,r)=>s+(r.lineTotal??0),0),179466);
});

test('format parameters alter quantities through shared rules and can switch BAR off', () => {
  const alternative = buildFormatCapexRows('FMT-RESTAURANT-SEATING','base',{...parameters,seatCount:18,cashierPostCount:1},{...options,barEnabled:false});
  assert.equal(alternative.find(row=>row.item.id==='CAPEX-05-028')?.quantity,18);
  assert.equal(alternative.find(row=>row.item.id==='CAPEX-04-004')?.quantity,1);
  assert.ok(!alternative.some(row=>row.moduleIds.includes('MOD-BAR')));
});

test('existing launch and saved cohorts never opt into new composition implicitly', () => {
  const launch = calculateLaunchBudget(defaultLaunchBudgetState());
  assert.equal(launch.equipment.total,5298993.33);
  const cfg=defaultInvestorConfiguration();
  const legacy=createNetworkPointCohort(cfg.launchBudget,{format:'with_seating',totalAreaM2:73.5,guestAreaM2:42,barEnabled:true});
  assert.equal(legacy.capexCompositionProfile,undefined);
  cfg.networkScaling.cohorts=[cfg.networkScaling.cohorts[0],legacy];
  const old=networkScalingProjection(cfg).cohorts[1];
  const ids=['point-retail-equipment','point-bar','point-pos-kds','point-wash','furniture'];
  assert.equal(old.pointItems.filter(item=>ids.some(id=>item.id===id||item.id.endsWith(':'+id))).reduce((s,i)=>s+(i.amountRub??0),0),2061433);
  const all=buildCapexRows(new Set(capexData.modules.map(m=>m.id)),'base',parameters);
  assert.ok(all.every(row=>row.item.compositionProfile===null));
});

test('engineering payer reallocates known cost, preserves total, and keeps unknown works unresolved', () => {
  const work={id:'power',label:'Power',payer:'operator' as const,amountRub:200,includedInPreparation:true};
  assert.deepEqual(allocatePropertyFunding(1000,[work]),{ownerRub:0,operatorRub:1000,totalKnownRub:1000,unresolved:[]});
  assert.deepEqual(allocatePropertyFunding(1000,[{...work,payer:'owner'}]),{ownerRub:200,operatorRub:800,totalKnownRub:1000,unresolved:[]});
  const unknown={...work,amountRub:null,payer:'owner' as const};
  assert.equal(allocatePropertyFunding(1000,[unknown]).totalKnownRub,1000);
  assert.deepEqual(allocatePropertyFunding(1000,[unknown]).unresolved,[unknown]);
});

// A total-only assertion misses offsetting price changes; require every old row unchanged.
test('legacy import compatibility rejects altered prices, quantities, unknown pins and absent evidence', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'capex-import-'));
  try {
    fs.mkdirSync(path.join(root,'docs-platform/working'),{recursive:true});fs.mkdirSync(path.join(root,'src/content'),{recursive:true});
    const pin=JSON.parse(fs.readFileSync('docs-platform/working/capex-financial-import-pin.json','utf8'));
    fs.writeFileSync(path.join(root,'docs-platform/working/capex-financial-import-pin.json'),JSON.stringify(pin));
    const file=path.join(root,'src/content/capex-configurator-data.json');
    const original=JSON.parse(fs.readFileSync('src/content/capex-configurator-data.json','utf8'));
    fs.writeFileSync(file,JSON.stringify(original));
    assert.equal(compatibleFinancialCapexImport(root,pin.importedContentStateSha256),true);
    assert.equal(compatibleFinancialCapexImport(root,'0'.repeat(64)),false);
    for(const field of ['unitPriceRub','quantity']) {
      const changed=structuredClone(original);changed.items[0].scenarios.base[field]+=1;
      fs.writeFileSync(file,JSON.stringify(changed));
      assert.equal(compatibleFinancialCapexImport(root,pin.importedContentStateSha256),false,field);
    }
    fs.unlinkSync(file);assert.equal(compatibleFinancialCapexImport(root,pin.importedContentStateSha256),false);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
