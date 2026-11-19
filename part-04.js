// --- V0.7F2C2C: era-correct, resource-conserving field artillery AI ---
// Keep the original once-per-quarter decision timing and zero free resources.
function f2c2bArtilleryEraEligible(n){
 const c=n.civilization;
 return Boolean(c&&(c.era==='early_modern'&&c.stage>=4||c.era==='industrial_modern'));
}
function f2c2bArtilleryAIQuarter(w,execute){
 for(const n of w.nations){
  if(!n.active||n.controller!=='AI')continue;
  const st=f2cEnsure(n,w.dayIndex);
  const before=w.armies.filter(a=>a.nationId===n.id).reduce((sum,a)=>sum+e2ArtilleryGroups(a).reduce((v,u)=>v+(u.guns||0),0),0);
  let reason='ERA_LOCKED',eligibleArmies=0,attempts=0,raisedGuns=0,armyId=null;
  if(!f2c2bArtilleryEraEligible(n))reason='ERA_LOCKED';
  else if(!hasTech(w,n.id,'field_artillery_casting'))reason='TECH_LOCKED';
  else if(!e2FieldWorkshop(w,n.id))reason='NO_PRECISION_WORKSHOP';
  else if(militaryAtWar(w,n.id))reason='AT_WAR';
  else{
   const total=nationManpower(w,n.id);
   const gunners=w.armies.filter(a=>a.nationId===n.id).reduce((sum,a)=>sum+e2ArtilleryGroups(a).reduce((v,u)=>v+u.manpower,0),0);
   if(total<80)reason='LOW_FORCE';
   else if(gunners/Math.max(1,total)>=.10)reason='GUNNER_TARGET_REACHED';
   else if(n.gold<400)reason='GOLD_RISK';
   else{
    const candidates=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&!a.order&&a.engagementId===null&&atSafeSettlement(w,a)&&
     manpower(a)>=60&&deployedManpower(a,'front')>=32&&
     (manpower(a)<=142||e2ReserveLevyCrew(a)>=8)).sort((a,b)=>a.id-b.id);
    eligibleArmies=candidates.length;
    reason=candidates.length?'NO_FEASIBLE_CREW':'NO_ELIGIBLE_ARMY';
    for(const a of candidates){
     const capacity=manpower(a)<=142?Math.floor((150-manpower(a))/E2_GUN_CREW):Math.floor(e2ReserveLevyCrew(a)/E2_GUN_CREW);
     const count=Math.min(2,capacity,Math.floor((.15*(total+8)-gunners)/E2_GUN_CREW));
     if(count<1)continue;
     const command={type:'RAISE_ARTILLERY',armyId:a.id,guns:count};attempts++;
     if(!isMilitaryActionLegal(w,n.id,command)){reason='CREW_OR_CAPACITY_SHORT';continue;}
     const price=getActionPrice(w,n.id,command);
     if(!price){reason='ACTION_REJECTED';continue;}
     if(!canAfford(n,price)){
      reason=n.apUnits<price.apUnits?'AP_SHORT':n.gold<price.gold?'GOLD_RISK':'MATERIAL_SHORT';
      continue;
     }
     const result=execute(w,n.id,command);
     if(result?.ok){reason='ARTILLERY_COMMISSIONED';raisedGuns=count;armyId=a.id;break;}
     reason='ACTION_REJECTED';
    }
   }
  }
  st.lastArtilleryDecision={dayIndex:w.dayIndex,reason,gunsBefore:before,gunsRaised:raisedGuns,
   eligibleArmies,attempts,...(armyId===null?{}:{armyId})};
 }
}

function f2cValidate(w){
 const int=x=>Number.isSafeInteger(x)&&x>=0;
 for(const n of w.nations){const v=n.resources.artillery_shells;if(!int(v)||v>F2C_SHELL_STOCK_MAX)return false;
  const st=n.f2cArsenal;if(!st)continue; // Fresh pre-quarter worlds initialize on their first economy quarter.
  if(st.schema!==1||!int(st.introducedDay)||st.introducedDay>w.dayIndex||!Array.isArray(st.history)||st.history.length>48||!int(st.pendingCombat)||!Number.isSafeInteger(st.pendingTransfers)||typeof (st.reserveAP??false)!=='boolean')return false;
  for(const q of [...st.history,st.lastQuarter]){
   if(!q||!int(q.dayIndex)||q.dayIndex>w.dayIndex||['start','end','produced','combatUsed','transfersIn','transfersOut','otherSpent','sites','operated','ironUsed','coalUsed','steelUsed','machinePartsUsed','goldUsed'].some(k=>!int(q[k])))return false;
   if(q.start+q.produced+q.transfersIn!==q.end+q.combatUsed+q.transfersOut+q.otherSpent)return false;
  }
 }
 for(const b of w.buildings)if(b.typeId==='arsenal'&&(!int(b.f2cRuns||0)||b.f2cOperatingDay!=null&&(!int(b.f2cOperatingDay)||b.f2cOperatingDay>w.dayIndex)))return false;
 return true;
}

// V0.7F2C2C — demand-led industrial output, stock hysteresis and audited downtime.
const F2C2C_WINDOW=48;
function f2c2cNewDemand(){return {schema:1,history:[],mode:{machine_parts:false,steel:false},plan:{machine_parts:64,steel:48},lastQuarter:null,lastFactoryBuildYear:-1};}
function f2c2cEnsure(n){return n.f2c2cDemand||(n.f2c2cDemand=f2c2cNewDemand());}
function f2c2cRecentNeed(n,good){
 const history=f2bEnsure(n).history.slice(-12),factories=f2Ensure(n).history;
 if(!history.length)return 0;
 const factoryByDay=new Map(factories.map(r=>[r.dayIndex,r]));
 let total=0;
 for(const q of history){
  const r=q[good];if(!r)continue;
  let use=(r.used||0)+(r.construction||0)+(r.otherSpent||0);
  // Factory maintenance consumes its *own* spare parts and is not an external
  // reason to run a stock-surplus factory. Pump/steelwork/arsenal upkeep remains.
  if(good==='machine_parts')use=Math.max(0,use-(factoryByDay.get(q.dayIndex)?.used||0));
  total+=Math.max(0,use);
 }
 return Math.ceil(total/history.length);
}
function f2c2cPendingNeed(w,n,good){
 const pending=f2bEnsure(n).pendingConstruction?.[good]||0;
 const planned=f2bEnsure(n).plan;
 // Pending, real commitments are counted; historical stockpile is not demand.
 let upcoming=Math.max(0,pending);
 if(planned?.buildingType==='steelworks'&&good==='machine_parts')upcoming+=12;
 if(planned?.buildingType==='steam_pump')upcoming+=good==='machine_parts'?12:good==='steel'?8:0;
 const projects=w.buildings.filter(b=>w.tiles[b.tileId]?.ownerId===n.id&&['CONSTRUCTING','UPGRADING','REDEVELOPING'].includes(b.status));
 if(good==='machine_parts')upcoming+=projects.filter(b=>b.typeId==='factory').length*10;
 return upcoming;
}
function f2c2cPlanProductionQuarter(w){
 for(const n of w.nations){if(!n.active)continue;
  const st=f2c2cEnsure(n),stocks=n.resources;
  const targets={},demand={};
  for(const good of ['machine_parts','steel']){
   const reserve=good==='machine_parts'?64:48;
   const perQuarter=f2c2cRecentNeed(n,good),upcoming=f2c2cPendingNeed(w,n,good);
   const buffer=Math.max(8,Math.ceil(perQuarter*2));
   const target=Math.max(reserve,12*perQuarter+upcoming+buffer);
   targets[good]=target;demand[good]=perQuarter;
   // Hysteresis: only restart below 75%, and then keep running up to target.
   if((stocks[good]||0)>=target)st.mode[good]=false;
   else if((stocks[good]||0)<target*.75)st.mode[good]=true;
  }
  st.plan=targets;
  st.lastQuarter={dayIndex:w.dayIndex,startParts:stocks.machine_parts||0,startSteel:stocks.steel||0,
   partsTarget:targets.machine_parts,steelTarget:targets.steel,partsDemand:demand.machine_parts,steelDemand:demand.steel,
   partsActive:st.mode.machine_parts,steelActive:st.mode.steel,partsOutput:0,steelOutput:0,
   partsOperated:0,steelOperated:0,partsReason:st.mode.machine_parts?'PRODUCING':'STOCK_SURPLUS',
   steelReason:st.mode.steel?'PRODUCING':'STOCK_SURPLUS'};
 }
}
function f2c2cCanProduce(n,good){
 const st=f2c2cEnsure(n),stock=n.resources[good]||0;
 return Boolean(st.mode[good]&&stock<(st.plan?.[good]||0));
}
function f2c2cFinishProductionQuarter(w){
 for(const n of w.nations){if(!n.active)continue;
  const st=f2c2cEnsure(n),q=st.lastQuarter;if(!q||q.dayIndex!==w.dayIndex)continue;
  const f=f2Ensure(n).lastQuarter,b=f2bEnsure(n).lastQuarter;
  q.partsOutput=f.produced;q.steelOutput=b.steel.produced;
  q.partsOperated=f.operated;q.steelOperated=b.steelworksOperated;
  q.endParts=n.resources.machine_parts||0;q.endSteel=n.resources.steel||0;
  // Sufficient stock is a purposeful no-run, not a failed production.
  for(const good of ['machine_parts','steel']){
   const parts=good==='machine_parts',active=parts?q.partsActive:q.steelActive;
   const operated=parts?q.partsOperated:q.steelOperated;
   const sites=parts?f.sites:b.steelworksSites;
   let reason=!active?'STOCK_SURPLUS':operated?'PRODUCING':sites===0?'NO_SITE':'INPUT_SHORT';
   if(active&&!operated&&sites>0){
    if(parts){if(n.resources.coal<3||n.resources.iron<6||n.resources.wood<5)reason='INPUT_SHORT';
      else if(n.gold<42)reason='FISCAL_RISK';else reason='POWER_OR_LABOR_SHORT';}
    else if(n.resources.iron<12||n.resources.coal<5)reason='INPUT_SHORT';
    else if(n.gold<55)reason='FISCAL_RISK';else reason='LABOR_OR_ROAD_SHORT';
   }
   q[parts?'partsReason':'steelReason']=reason;
  }
  st.history.push({...q});if(st.history.length>F2C2C_WINDOW)st.history.shift();
  if(g1Enabled(w))g1RecordQuarter(w,n);
 }
}

function f2c2cValidate(w){
 const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
 for(const n of w.nations){
  const st=n.f2c2cDemand;if(!st)continue; // older saved worlds lazily migrate.
  if(st.schema!==1||!Array.isArray(st.history)||st.history.length>F2C2C_WINDOW||
     !st.plan||!nonnegative(st.plan.machine_parts)||!nonnegative(st.plan.steel)||
     !st.mode||typeof st.mode.machine_parts!=='boolean'||typeof st.mode.steel!=='boolean'||
     !Number.isSafeInteger(st.lastFactoryBuildYear)||st.lastFactoryBuildYear< -1)return false;
  for(const q of [...st.history,...(st.lastQuarter?[st.lastQuarter]:[])]){
   if(!q||!nonnegative(q.dayIndex)||q.dayIndex>w.dayIndex||q.dayIndex%30!==0)return false;
   for(const k of ['startParts','startSteel','partsTarget','steelTarget','partsDemand','steelDemand','partsOutput','steelOutput','partsOperated','steelOperated'])
    if(!nonnegative(q[k]))return false;
   if(typeof q.partsActive!=='boolean'||typeof q.steelActive!=='boolean')return false;
   if(q.endParts!==undefined&&!nonnegative(q.endParts)||q.endSteel!==undefined&&!nonnegative(q.endSteel))return false;
  }
 }
 for(const b of w.buildings)if(b.typeId==='factory'&&(b.f2c2cBonusTenths!==undefined&&
  (!nonnegative(b.f2c2cBonusTenths)||b.f2c2cBonusTenths>=10)))return false;
 return true;
}
function f2c2cDemandSummary(w){return {version:VERSION,dayIndex:w.dayIndex,nations:w.nations.map(n=>({id:n.id,name:n.name,
  mode:f2c2cEnsure(n).mode,targets:f2c2cEnsure(n).plan,lastQuarter:f2c2cEnsure(n).lastQuarter,
  history:f2c2cEnsure(n).history}))};}
// V0.7F2A: real, local, paid factory production and conserved mechanical parts.
// Does not expand RESOURCE_KEYS, whose four-resource legacy telemetry must remain stable.
const F2_FACTORY_LEVELS=Object.freeze({1:{iron:6,wood:5,coal:3,gold:30,pu:35,labor:18,parts:2},2:{iron:15,wood:12,coal:3,gold:55,pu:65,labor:46,parts:5},3:{iron:26,wood:19,coal:3,gold:90,pu:80,labor:88,parts:9},4:{iron:38,wood:28,coal:4,gold:135,pu:110,labor:130,parts:13}});
function f2FactoryUnlocked(w,nationId){return w.nations[nationId]?.civilization?.era==='industrial_modern'&&hasTech(w,nationId,'mechanized_manufacturing');}
function f2EmptyQuarter(day){return {dayIndex:day,start:0,produced:0,used:0,end:0,sites:0,operated:0,woodUsed:0,ironUsed:0,coalUsed:0,goldSpent:0,powerProduced:0,powerUsed:0,powerUnused:0,laborRequired:0,laborSupplied:0};}
function f2NewFactoryState(){return {schema:1,lastQuarter:f2EmptyQuarter(0),history:[]};}
function f2Ensure(n){return n.f2Factory||(n.f2Factory=f2NewFactoryState());}
function f2MigrateWorld(w){for(const n of w.nations){n.resources.machine_parts??=0;f2Ensure(n);}for(const b of w.buildings)if(b.typeId==='factory'){b.powerDevices??={mechanical:false,waterwheel:false,steam:false};}}
function f2FactoryPower(w,n,b){
 const d=f1Devices(b),base=f1PowerBase(w,b,n);
 // Existing workshop power belongs to the workshop. A factory owns ONLY its installed devices.
 const steam=d.steam&&hasTech(w,n.id,'steam_engineering')&&n.resources.coal>=3-techBonus(w,n.id,'industrialSteamCoalSaving')&&n.gold>=12?65:0;
 return {supplied:Math.min(115,base.pu+steam),steam,source:steam?'STEAM':base.source};
}
// V0.7J: one bounded, current-quarter per-factory production status. Old runs are not backfilled.
function f2jProductionNote(b,w,reason,extra={}){
 if(b.level!==4)return;
 b.f2jLastQuarter={dayIndex:w.dayIndex,reason,operated:reason==='PRODUCING',...extra};
}
function f2jEnsure(n){return n.f2jIndustry||(n.f2jIndustry={schema:1,lastDecision:null,lastUpgradeYear:-1});}
function f2jLabel(reason){return ({NO_REAL_DEMAND:'실수요 부족',HISTORY_SHORT:'관측 이력 부족',LOW_UTILIZATION:'기존 공장 저가동',CAPACITY_SUFFICIENT:'현 생산능력 충분',TECH_LOCKED:'기술·시대 조건 미충족',PROJECT_PENDING:'공사 진행 중',FOOD_RISK:'식량 안전 조건 미충족',FISCAL_RISK:'재정 위험',MATERIAL_SHORT:'건설 자재 부족',REGIONAL_FREIGHT_SHORT:'지역 자원·물류 부족',LABOR_SHORT:'현장 노동력 부족',GRID_SHORT:'확보 가능한 동력 부족',ROI_LOW:'개량 수익성 부족',NO_ELIGIBLE_FACTORY:'개량 대상 공장 없음',UPGRADE_STARTED:'Lv.4 개량 착수',NEW_FACTORY_PREFERRED:'신규 공장 투자 우선',NO_FACTORY:'공장 없음',STOCK_SURPLUS:'부품 재고 충분',INPUT_SHORT:'생산 원료 부족',PRODUCING:'정상 생산',OFFLINE:'가동 조건 미충족'})[reason]||reason||'미평가';}
function f2jValidate(w){
 const allowed=new Set(['NO_REAL_DEMAND','HISTORY_SHORT','LOW_UTILIZATION','CAPACITY_SUFFICIENT','TECH_LOCKED','PROJECT_PENDING','FOOD_RISK','FISCAL_RISK','MATERIAL_SHORT','REGIONAL_FREIGHT_SHORT','LABOR_SHORT','GRID_SHORT','ROI_LOW','NO_ELIGIBLE_FACTORY','UPGRADE_STARTED','NEW_FACTORY_PREFERRED','NO_FACTORY']);
 for(const n of w.nations){const x=n.f2jIndustry;if(!x)continue;
  if(x.schema!==1||!Number.isSafeInteger(x.lastUpgradeYear)||x.lastUpgradeYear< -1||x.lastUpgradeYear>Math.floor(w.dayIndex/120))return false;
  if(x.lastDecision&&(typeof x.lastDecision!=='object'||!allowed.has(x.lastDecision.reason)||!Number.isSafeInteger(x.lastDecision.dayIndex)||x.lastDecision.dayIndex>w.dayIndex))return false;
 }
 for(const b of w.buildings)if(b.typeId==='factory'&&b.f2jLastQuarter&&
  (!Number.isSafeInteger(b.f2jLastQuarter.dayIndex)||b.f2jLastQuarter.dayIndex>w.dayIndex||typeof b.f2jLastQuarter.reason!=='string'||typeof b.f2jLastQuarter.operated!=='boolean'))return false;
 return true;
}
function f2RunFactoryQuarter(w,projections){
 const out=new Map(),occupied=new Set((w.occupations||[]).map(o=>o.tileId));
 for(const n of w.nations){if(!n.active)continue;const state=f2Ensure(n),q=f2EmptyQuarter(w.dayIndex);q.start=n.resources.machine_parts||0;state.lastQuarter=q;out.set(n.id,q);}
 const factoryList=w.buildings.filter(b=>b.typeId==='factory').sort((a,b)=>a.id-b.id);
 for(const b of factoryList){
  const t=w.tiles[b.tileId],s=w.settlements.find(x=>x.id===b.settlementId),n=s?.ownerId===t?.ownerId?w.nations[s.ownerId]:null;
  if(!n?.active)continue;const q=out.get(n.id);q.sites++;
  f2jProductionNote(b,w,'STOCK_SURPLUS');
  if(!f2c2cCanProduce(n,'machine_parts'))continue;
  if(b.status!=='ACTIVE'||b.disconnected||t.occupiedBy!==null||occupied.has(t.id)||s.population<1||!f2FactoryUnlocked(w,n.id)){f2jProductionNote(b,w,'OFFLINE');continue;}
  const local=projections.get(n.id)?.regionalEconomy?.towns?.get(s.id),spec=F2_FACTORY_LEVELS[b.level];
  if(!local||!spec||!local.roadNetwork&&t.roadLevel===0&&w.tiles[s.coreTileId]?.roadLevel===0){f2jProductionNote(b,w,'REGIONAL_FREIGHT_SHORT');continue;}
  // Labour is a finite allocation ceiling, not automatically granted by installed machines.
  const workerPool=Math.min(Math.max(0,Math.floor(local.workers||0)),Math.max(0,s.population));
  const workRatio=Math.min(1,workerPool/Math.max(1,local.demand||spec.labor));
  const staffed=Math.floor(spec.labor*workRatio);
  const baseParts=Math.floor(spec.parts*workRatio);
  if(staffed<1||baseParts<1){f2jProductionNote(b,w,'LABOR_SHORT',{workers:workerPool});continue;}
  const productivity=(hasTech(w,n.id,'industrial_process_standardization')?1:0)+(hasTech(w,n.id,'precision_machine_standardization')?1:0);
  const bonusTenths=(b.f2c2cBonusTenths||0)+baseParts*productivity;
  const parts=baseParts+Math.floor(bonusTenths/10);
  const iron=Math.ceil(spec.iron*baseParts/spec.parts),wood=Math.ceil(spec.wood*baseParts/spec.parts);
  const coal=spec.coal,gold=Math.ceil(spec.gold*baseParts/spec.parts);
  const steamCoal=3-techBonus(w,n.id,'industrialSteamCoalSaving');
  const power=f2FactoryPower(w,n,b);
  if(n.resources.iron<iron||n.resources.wood<wood||n.resources.coal<coal+steamCoal*(power.steam>0)||n.gold<gold+12*(power.steam>0)||n.resources.machine_parts+parts>1000000){f2jProductionNote(b,w,n.gold<gold+12*(power.steam>0)?'FISCAL_RISK':'INPUT_SHORT');continue;}
  // Machinery needs a real consumable spare part every fourth operating quarter.
  const maintenance=((b.factoryRuns||0)+1)%4===0?1:0;
  if(n.resources.machine_parts<maintenance){f2jProductionNote(b,w,'INPUT_SHORT');continue;}
  if(!i1Can(w,n,b,{iron,coal:coal+steamCoal*(power.steam>0),machine_parts:maintenance})){f2jProductionNote(b,w,'REGIONAL_FREIGHT_SHORT');continue;}
  const missing=Math.max(0,spec.pu-power.supplied);
  if(missing&&i2Pull(w,n,s.id,missing,b.id)!==missing){f2jProductionNote(b,w,'GRID_SHORT',{missingPU:missing});continue;}
  const localPowerUsed=Math.min(power.supplied,spec.pu);
  n.resources.wood-=wood;n.resources.iron-=iron;n.resources.coal-=coal+steamCoal*(power.steam>0);
  n.gold-=gold+12*(power.steam>0);
  i1Debit(w,n,b,{iron,coal:coal+steamCoal*(power.steam>0),machine_parts:maintenance});
  n.resources.machine_parts+=parts-maintenance;i1Credit(w,n,b,'machine_parts',parts);b.f2c2cBonusTenths=bonusTenths%10;b.factoryRuns=(b.factoryRuns||0)+1;b.lastFactoryOperatedDay=w.dayIndex;if(b.level===4)b.kLevel4OperatedDay=w.dayIndex;
  b.lastPower={dayIndex:w.dayIndex,source:power.source,demand:Math.max(spec.pu,power.supplied),supplied:power.supplied,used:localPowerUsed,unused:power.supplied-localPowerUsed,externalPowerUsed:missing,totalPowerUsed:spec.pu};
  f2jProductionNote(b,w,'PRODUCING',{parts,localPU:localPowerUsed,externalPU:missing,labor:staffed});
  q.operated++;q.produced+=parts;q.used+=maintenance;q.woodUsed+=wood;q.ironUsed+=iron;q.coalUsed+=coal+steamCoal*(power.steam>0);q.goldSpent+=gold+12*(power.steam>0);
  q.laborRequired+=spec.labor;q.laborSupplied+=staffed;q.powerProduced+=power.supplied;q.powerUsed+=localPowerUsed;q.powerUnused+=power.supplied-localPowerUsed;
  const f=f1EnsureIndustry(n).lastQuarter;f.coalOtherSpent+=coal+steamCoal*(power.steam>0);f.powerProduced+=power.supplied;f.powerUsed+=localPowerUsed;f.powerUnused+=power.supplied-localPowerUsed;
  i2Offer(w,n,b,power.supplied-localPowerUsed);
 }
 for(const n of w.nations){if(!n.active)continue;const q=out.get(n.id),st=f2Ensure(n);q.end=n.resources.machine_parts;st.history.push({...q});if(st.history.length>48)st.history.shift();}
 return out;
}
function f2ValidateWorld(w){
 for(const n of w.nations){const s=n.f2Factory;if(!s||s.schema!==1||!Array.isArray(s.history)||s.history.length>48||!s.lastQuarter)return false;
  for(const q of [...s.history,s.lastQuarter]){if(!Number.isSafeInteger(q.dayIndex)||q.dayIndex<0||q.dayIndex>w.dayIndex||q.dayIndex%30!==0)return false;
   for(const k of ['start','produced','used','end','sites','operated','woodUsed','ironUsed','coalUsed','goldSpent','powerProduced','powerUsed','powerUnused','laborRequired','laborSupplied'])if(!Number.isSafeInteger(q[k])||q[k]<0)return false;
   if(q.start+q.produced-q.used!==q.end||q.powerProduced!==q.powerUsed+q.powerUnused||q.laborSupplied>q.laborRequired)return false;
  }
 }
 for(const b of w.buildings)if(b.typeId==='factory'&&(b.level>4||!f1ValidWorkshopPower(w,b)||!Number.isSafeInteger(b.factoryRuns||0)||(b.factoryRuns||0)<0||b.lastFactoryOperatedDay!=null&&(b.lastFactoryOperatedDay>w.dayIndex||b.lastFactoryOperatedDay%30!==0)))return false;
 return f2jValidate(w);
}
// Installed power is an *engineering* capacity check independent of temporary
// coal shortages. Actual production still pays quarterly coal and Gold.
function f2a3InstalledFactoryCapacity(w,n,b){
 const d=f1Devices(b),base=f1PowerBase(w,b,n).pu;
 return Math.min(115,base+(d.steam&&hasTech(w,n.id,'steam_engineering')?65:0));
}
function f2a3InstallFactoryPower(w,n,b,needed){
 if(b.status!=='ACTIVE'||b.disconnected||b.powerProject||n.f2a3LastPowerRepairDay===w.dayIndex||f2a3InstalledFactoryCapacity(w,n,b)>=needed)return false;
 const d=f1Devices(b);
 // Steam is the first required backbone; waterwheel is preferred where legal.
 const sources=d.steam?['WATERWHEEL','MECHANICAL']:['STEAM','WATERWHEEL','MECHANICAL'];
 for(const source of sources){
  if(d[source.toLowerCase()])continue;
  const a={type:'INSTALL_WORKSHOP_POWER',buildingId:b.id,source};
  if(canExecuteNationAction(w,n.id,a)){executeNationAction(w,n.id,a);n.f2a3LastPowerRepairDay=w.dayIndex;return true;}
 }
 return false;
}
function f2a3FactoryRepairQuarter(w){
 if(w.dayIndex%30!==0)return;
 for(const n of w.nations){
  if(!n.active||n.controller!=='AI')continue;
  const broken=w.buildings.filter(b=>b.typeId==='factory'&&b.status==='ACTIVE'&&!b.disconnected&&
    w.tiles[b.tileId]?.ownerId===n.id&&F2_FACTORY_LEVELS[b.level]&&
    f2a3InstalledFactoryCapacity(w,n,b)<F2_FACTORY_LEVELS[b.level].pu)
   .sort((a,b)=>b.level-a.level||a.id-b.id);
  for(const b of broken)if(f2a3InstallFactoryPower(w,n,b,F2_FACTORY_LEVELS[b.level].pu))break;
 }
}
// F2A4: The FIRST factory is an optional, economically justified investment.
// It deliberately does not inherit the first-coal 90%-food emergency exception.
function f2a4FirstFactoryFoodGate(w,n){
 const gate=f2c2BuildFoodGate(w,n);
 return {eligible:gate.eligible,path:gate.path,reason:gate.eligible?gate.reason:'FOOD_RISK',
  sufficiency:gate.sufficiency,observedQuarters:gate.observedQuarters};
}
function f2a4FactoryPresence(w,n){
 return w.buildings.filter(b=>w.tiles[b.tileId]?.ownerId===n.id&&
  (b.typeId==='factory'||b.status==='REDEVELOPING'&&b.redevelopTo==='factory'));
}
function f2a4FactoryDecision(n,w,reason,foodPath='NONE',buildingId=null,financeAfter=null){
 // Overwrite the single annual observation. Never append daily unbounded logs.
 const foodGate=f2c2BuildFoodGate(w,n);
 n.f2a4FirstFactoryDecision={dayIndex:w.dayIndex,reason,foodPath,
  foodSufficiency:foodGate.sufficiency,foodObservedQuarters:foodGate.observedQuarters,foodGateReason:foodGate.reason,
  ...(buildingId!==null?{buildingId}:{}),...(financeAfter!==null?{financeAfter}: {})};
}
function f2a4FactoryLocalReady(w,s,t,local){
 if(!local||s.population<1||!local.workers||!local.demand)return false;
 // Match the actual F2 quarterly road and labor checks before paying anything.
 if(!local.roadNetwork&&t.roadLevel===0&&w.tiles[s.coreTileId]?.roadLevel===0)return false;
 return Math.floor(F2_FACTORY_LEVELS[1].parts*Math.min(1,Math.min(Math.floor(local.workers),s.population)/local.demand))>=1;
}
function f2a4ProjectedWorkshopGold(w,n,b,local){
 const last=n.lastQuarter?.workshop,all=w.buildings.filter(other=>other.typeId==='workshop'&&
  other.status==='ACTIVE'&&!other.disconnected&&w.tiles[other.tileId]?.ownerId===n.id);
 if(b.lastOperatedDay!==w.dayIndex||!last?.operated)return 0;
 if(all.length===1)return last.gold||0;
 const power=b.lastPower?.supplied||0;
 const precision=b.workshopMode==='precision'&&n.civilization?.era==='early_modern'&&
   n.civilization.stage>=3&&hasTech(w,n.id,'precision_workshop_methods');
 return Math.min(last.gold||0,Math.max(0,Math.ceil(72*Math.min(3,b.level)*
   (local?.multiplier||1)*(1+power/100)*(1+techBonus(w,n.id,'workshopGold'))*(precision?1.2:1))));
}
function f2a4FactoryFinanceSafe(w,n,action,b=null,local=null,diagnosis=null){
 const cost=getNationActionCost(w,n.id,action);
 const power=F1_POWER_INSTALL.STEAM;
 if(!cost||!power||!hasTech(w,n.id,'steam_engineering')){if(diagnosis)diagnosis.reason='TECH_MISSING';return null;}
 const last=n.lastQuarter||{},civil=Math.max(0,last.civil?.total||0),military=Math.max(0,last.upkeep||0);
 const lost=b?f2a4ProjectedWorkshopGold(w,n,b,local):0;
 // The first factory is Lv.1; its recurring maximum Gold bill is 30+12 for steam.
 const ongoing=F2_FACTORY_LEVELS[1].gold+12;
 const forecastNet=Number(last.goldNet)-lost-ongoing;
 if(!Number.isFinite(forecastNet)||forecastNet<=Math.max(50,Math.ceil((civil+military)*.01))){if(diagnosis)diagnosis.reason='TREASURY_RISK';return null;}
 // Reserve the real future steam-device price and two quarters of essential bills.
 if(n.gold<cost.gold+power.gold+Math.max(250,2*(civil+military))){if(diagnosis)diagnosis.reason='TREASURY_RISK';return null;}
 const required={wood:(cost.resources.wood||0)+(power.resources.wood||0)+F2_FACTORY_LEVELS[1].wood*4,
  stone:(cost.resources.stone||0)+(power.resources.stone||0),
  iron:(cost.resources.iron||0)+(power.resources.iron||0)+F2_FACTORY_LEVELS[1].iron*4,
  coal:Math.max(24,4*(F2_FACTORY_LEVELS[1].coal+3))};
 for(const [key,amount]of Object.entries(required))if((n.resources[key]||0)<amount){if(diagnosis)diagnosis.reason='RESOURCE_SHORTAGE';return null;}
 return {forecastNet,lostGold:lost,ongoingGold:ongoing};
}
function f2a4StartFirstFactory(w,n){
 if(!f2FactoryUnlocked(w,n.id)){f2a4FactoryDecision(n,w,'TECH_MISSING');return;}
 const present=f2a4FactoryPresence(w,n);
 if(present.length){
  const pending=present.find(b=>b.status==='CONSTRUCTING'||b.status==='REDEVELOPING'||b.status==='UPGRADING');
  const powered=present.find(b=>b.status==='ACTIVE'&&b.lastFactoryOperatedDay===w.dayIndex);
  const needsPower=present.some(b=>b.typeId==='factory'&&b.status==='ACTIVE'&&
    (b.powerProject||f2a3InstalledFactoryCapacity(w,n,b)<(F2_FACTORY_LEVELS[b.level]?.pu||0)));
  f2a4FactoryDecision(n,w,pending?'PROJECT_PENDING':powered?'PRODUCTION_READY':needsPower?'POWER_PENDING':'RESOURCE_SHORTAGE',
   'NONE',(pending||powered||present[0]).id);return;
 }
 const gate=f2a4FirstFactoryFoodGate(w,n);
 if(!gate.eligible){f2a4FactoryDecision(n,w,gate.reason,gate.path);return;}
 if(n.gold<3500||n.resources.iron<150||n.resources.coal<15){
  f2a4FactoryDecision(n,w,'RESOURCE_SHORTAGE',gate.path);return;
 }
 // Only one industrial planner may start the first factory; generic building AI
 // below never produces BUILD_FACILITY(factory) or REDEVELOP_FACILITY(factory).
 // Reuse the site capacity map once, rather than checking every tile expensively.
 const slots=f4d3SiteUsage(w),used=slots.generalUsed,legalLevel=generalTileSlotLimit(w,n.id);
 const forecast=projectedQuarter(w,n);
 let anySite=false,anyLegal=false,anyFinance=false;const failures=new Set();
 const towns=w.settlements.filter(s=>s.ownerId===n.id).sort((a,b)=>a.id-b.id);
 for(const s of towns){
  const local=forecast.regionalEconomy.towns.get(s.id);
  if(!local)continue;
  for(const tid of s.tileIds){
   const t=w.tiles[tid];if(!t||!BUILDINGS.factory.terrains.includes(t.terrain)||
    t.occupiedBy!==null||(used.get(tid)||0)>=legalLevel||!f2a4FactoryLocalReady(w,s,t,local))continue;
   anySite=true;
   const action={type:'BUILD_FACILITY',buildingType:'factory',settlementId:s.id,targetTileId:tid};
   if(!isNationActionLegal(w,n.id,action))continue;
   anyLegal=true;
   const finding={};const finance=f2a4FactoryFinanceSafe(w,n,action,null,local,finding);
   if(!finance){if(finding.reason)failures.add(finding.reason);continue;}
   anyFinance=true;
   if(!canExecuteNationAction(w,n.id,action))continue;
   const result=executeNationAction(w,n.id,action);
   if(result.ok){f2a4FactoryDecision(n,w,'STARTED',gate.path,result.buildingId??null,finance.forecastNet);return;}
  }
 }
 // Fallback: convert only a mature *working* workshop, paying full retrofit
 // costs and later re-installing steam through the unchanged F2A3 power AI.
 const workshops=w.buildings.filter(b=>b.typeId==='workshop'&&b.level>=3&&
  b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===n.id).sort((a,b)=>a.id-b.id);
 if(!workshops.length){f2a4FactoryDecision(n,w,'NO_LV3_WORKSHOP',gate.path);return;}
 let legalRetrofit=false;
 for(const b of workshops){
  const s=w.settlements.find(s=>s.id===b.settlementId),t=w.tiles[b.tileId];
  const local=forecast.regionalEconomy.towns.get(b.settlementId);
  if(!s||!t||!f2a4FactoryLocalReady(w,s,t,local))continue;
  const action={type:'REDEVELOP_FACILITY',buildingId:b.id,buildingType:'factory'};
  if(!isNationActionLegal(w,n.id,action))continue;
  legalRetrofit=true;
  const finding={};const finance=f2a4FactoryFinanceSafe(w,n,action,b,local,finding);
  if(!finance){if(finding.reason)failures.add(finding.reason);continue;}
  anyFinance=true;
  if(!canExecuteNationAction(w,n.id,action))continue;
  const result=executeNationAction(w,n.id,action);
  if(result.ok){f2a4FactoryDecision(n,w,'STARTED',gate.path,b.id,finance.forecastNet);return;}
 }
 f2a4FactoryDecision(n,w,anyFinance?'RESOURCE_SHORTAGE':failures.has('TREASURY_RISK')?'TREASURY_RISK':
  failures.has('RESOURCE_SHORTAGE')?'RESOURCE_SHORTAGE':legalRetrofit||anyLegal?'RESOURCE_SHORTAGE':'NO_SITE',gate.path);
}

// V0.7J: conservative non-consuming preview of operating grid capacity.
// A connected, currently eligible central house is the minimum dependable source;
// idle speculative/temporary generation is deliberately excluded.
function f2jGridCapacityPreview(w,n,b,required){
 const localInstalled=f2a3InstalledFactoryCapacity(w,n,b);
 const missing=Math.max(0,required-localInstalled);
 if(!missing)return {missing:0,external:0,ready:true};
 if(!i2StationOnline(w,i2Station(w,b.settlementId)))return {missing,external:0,ready:false};
 const projections=projectedQuarter(w,n),sources=[];
 for(const plant of i3aEnsure(w).plants){
  if(plant.ownerId!==n.id||!i3aOnline(w,plant))continue;
  const def=I3A_TYPES[plant.type],labor=projections.regionalEconomy.towns.get(plant.settlementId);
  if(!def||!labor||labor.workers<def.workers||n.gold<def.gold+2000||def.coal>0&&n.resources.coal<def.coal+24||
     def.coal>0&&i1Available(w,n,plant.settlementId,'coal')<def.coal*2)continue;
  const path=i2Path(w,n.id,plant.settlementId,b.settlementId);
  if(!path||path.dist>64)continue;
  const recent=plant.lastRun?.dayIndex>=w.dayIndex-30?(plant.lastRun.sent||0):0;
  sources.push({pu:Math.floor(Math.max(0,Math.min(def.pu,100)-recent)*Math.pow(.97,path.dist)),dist:path.dist});
 }
 sources.sort((a,b)=>a.dist-b.dist);
 // Do not add speculative supply from multiple houses: bounded single-house gate.
 const external=sources.length?sources[0].pu:0;
 return {missing,external,ready:external>=missing};
}
function f2jDecision(n,w,reason,details={}){
 const st=f2jEnsure(n);st.lastDecision={dayIndex:w.dayIndex,reason,...details};return false;
}
function f2jTryUpgrade(w,n,existing){
 const year=Math.floor(w.dayIndex/120),st=f2jEnsure(n);
 if(st.lastUpgradeYear===year)return f2jDecision(n,w,'PROJECT_PENDING');
 if(!existing.length)return f2jDecision(n,w,'NO_FACTORY');
 if(!['mechanized_manufacturing','industrial_process_standardization','industrial_quality_control'].every(id=>hasTech(w,n.id,id))||n.civilization?.stage<3)return f2jDecision(n,w,'TECH_LOCKED');
 const hist=f2c2cEnsure(n).history.slice(-8),runs=f2Ensure(n).history.slice(-8);
 if(hist.length<8||runs.length<8)return f2jDecision(n,w,'HISTORY_SHORT',{observedQuarters:Math.min(hist.length,runs.length)});
 const demandQuarters=hist.filter(q=>q.partsActive&&q.endParts<q.partsTarget*.75).length;
 if(demandQuarters<4)return f2jDecision(n,w,'NO_REAL_DEMAND',{demandQuarters});
 const utilization=runs.filter(q=>q.sites>0&&q.operated>0).length/8;
 if(utilization<.75)return f2jDecision(n,w,'LOW_UTILIZATION',{demandQuarters,utilization});
 const active=existing.filter(b=>b.typeId==='factory'&&b.status==='ACTIVE'&&!b.disconnected);
 const capacity=active.reduce((sum,b)=>sum+(F2_FACTORY_LEVELS[b.level]?.parts||0),0);
 const demand=f2c2cRecentNeed(n,'machine_parts');
 if(demand<=capacity*.9)return f2jDecision(n,w,'CAPACITY_SUFFICIENT',{demand,capacity,demandQuarters});
 if(!f2c2BuildFoodGate(w,n).eligible)return f2jDecision(n,w,'FOOD_RISK',{demand,capacity});
 if(existing.some(b=>['CONSTRUCTING','REDEVELOPING','UPGRADING'].includes(b.status)))return f2jDecision(n,w,'PROJECT_PENDING');
 const forecast=projectedQuarter(w,n),costBase=buildPrice('factory',4);
 const candidates=active.filter(b=>b.level===3&&g2LevelUnlocked(w,n.id,'factory',4)).sort((a,b)=>a.id-b.id);
 if(!candidates.length)return f2jDecision(n,w,'NO_ELIGIBLE_FACTORY',{demand,capacity});
 const reasons=new Set();
 for(const b of candidates){
  const spec=F2_FACTORY_LEVELS[4],site=w.settlements.find(s=>s.id===b.settlementId),local=forecast.regionalEconomy.towns.get(b.settlementId);
  const info={buildingId:b.id,demand,capacity,demandQuarters,utilization};
  const workerPool=local&&site?Math.min(Math.floor(local.workers||0),site.population):0;
  if(!local||!site||workerPool<spec.labor||local.demand>0&&workerPool/Math.max(1,local.demand)<.85){reasons.add('LABOR_SHORT');continue;}
  if(!local.roadNetwork&&w.tiles[b.tileId].roadLevel===0&&w.tiles[site.coreTileId].roadLevel===0){reasons.add('REGIONAL_FREIGHT_SHORT');continue;}
  const available=f2jGridCapacityPreview(w,n,b,spec.pu);
  if(!available.ready){reasons.add('GRID_SHORT');continue;}
  const action={type:'UPGRADE_FACILITY',buildingId:b.id},price=getNationActionCost(w,n.id,action);
  if(!price){reasons.add('TECH_LOCKED');continue;}
  // Full construction is charged once and compensated by real remaining capital.
  if(n.gold<Math.max(18000,price.gold*3)||n.gold<price.gold+720){reasons.add('FISCAL_RISK');continue;}
  if(Object.entries(price.resources).some(([g,amt])=>(n.resources[g]||0)<amt)) {reasons.add('MATERIAL_SHORT');continue;}
  const reserve={iron:spec.iron*4,coal:spec.coal*4+12,machine_parts:1};
  if(Object.entries(reserve).some(([g,amt])=>i1Available(w,n,b.settlementId,g)<amt)){reasons.add('REGIONAL_FREIGHT_SHORT');continue;}
  if(n.resources.iron<price.resources.iron+reserve.iron||n.resources.coal<reserve.coal){reasons.add('MATERIAL_SHORT');continue;}
  // Market value of extra four parts minus incremental operational inputs.
  const value=(w.market?.prices?.machine_parts||30000)/1000;
  const ironValue=(w.market?.prices?.iron||1000)/1000;
  const woodValue=(w.market?.prices?.wood||1000)/1000;
  const coalValue=(w.market?.prices?.coal||6000)/1000;
  const deltaParts=F2_FACTORY_LEVELS[4].parts-F2_FACTORY_LEVELS[3].parts;
  const marginal=deltaParts*value-(spec.gold-F2_FACTORY_LEVELS[3].gold)-(spec.iron-F2_FACTORY_LEVELS[3].iron)*ironValue-(spec.wood-F2_FACTORY_LEVELS[3].wood)*woodValue-(spec.coal-F2_FACTORY_LEVELS[3].coal)*coalValue;
  if(marginal<=0||price.gold/marginal>80){reasons.add('ROI_LOW');continue;}
  if(!canExecuteNationAction(w,n.id,action)){reasons.add('MATERIAL_SHORT');continue;}
  const res=executeNationAction(w,n.id,action);
  if(res.ok){st.lastUpgradeYear=year;st.lastDecision={dayIndex:w.dayIndex,reason:'UPGRADE_STARTED',...info,missingPU:available.missing,externalPU:available.external,marginalGold:Math.round(marginal*100)/100,upgradeGold:price.gold};return true;}
 }
 const reason=['GRID_SHORT','REGIONAL_FREIGHT_SHORT','LABOR_SHORT','FISCAL_RISK','MATERIAL_SHORT','ROI_LOW','TECH_LOCKED'].find(r=>reasons.has(r))||'NO_ELIGIBLE_FACTORY';
 return f2jDecision(n,w,reason,{demand,capacity,demandQuarters,utilization});
}
function f2c2cExtraFactoryAI(w,n){
 const st=f2c2cEnsure(n),year=Math.floor(w.dayIndex/120);
 if(st.lastFactoryBuildYear===year)return false;
 const hist=st.history.slice(-8),q=f2Ensure(n).history.slice(-8);
 if(hist.length<8||q.length<8)return false;
 const utilization=q.filter(x=>x.sites>0&&x.operated>0).length/8;
 const shortfalls=hist.filter(x=>x.partsActive&&x.endParts<x.partsTarget*.75).length;
 const demand=Math.max(0,f2c2cRecentNeed(n,'machine_parts'));
 const existing=w.buildings.filter(b=>b.typeId==='factory'&&w.tiles[b.tileId]?.ownerId===n.id);
 if(existing.length>8||utilization<.80||shortfalls<4||demand<=existing.filter(b=>b.status==='ACTIVE').reduce((z,b)=>z+(F2_FACTORY_LEVELS[b.level]?.parts||0),0)*1.25)return false;
 if(!f2c2BuildFoodGate(w,n).eligible||n.gold<5000||n.resources.iron<150||n.resources.coal<15)return false;
 const slots=f4d3SiteUsage(w),used=slots.generalUsed,legal=generalTileSlotLimit(w,n.id);
 const towns=w.settlements.filter(s=>s.ownerId===n.id).sort((a,b)=>b.population-a.population||a.id-b.id);
 const forecast=projectedQuarter(w,n);
 for(const settlement of towns){
  const local=forecast.regionalEconomy.towns.get(settlement.id);if(!local)continue;
  for(const tileId of settlement.tileIds){
   const tile=w.tiles[tileId];if(!tile||!BUILDINGS.factory.terrains.includes(tile.terrain)||tile.occupiedBy!==null||
    (used.get(tileId)||0)>=legal||!f2a4FactoryLocalReady(w,settlement,tile,local))continue;
   const action={type:'BUILD_FACILITY',buildingType:'factory',settlementId:settlement.id,targetTileId:tileId};
   if(!isNationActionLegal(w,n.id,action)||!f2a4FactoryFinanceSafe(w,n,action,null,local)||!canExecuteNationAction(w,n.id,action))continue;
   const result=executeNationAction(w,n.id,action);
   if(result.ok){st.lastFactoryBuildYear=year;f2a4FactoryDecision(n,w,'CAPACITY_SHORT_NEW_FACTORY','NONE',result.buildingId??null);return true;}
  }
 }
 return false;
}
function f2FactoryAIQuarter(w){
 if(w.dayIndex%120!==0)return;
 for(const n of w.nations){
  if(!n.active||n.controller!=='AI')continue;
  if(!f2FactoryUnlocked(w,n.id)){
   f2a4FactoryDecision(n,w,'TECH_MISSING');continue;
  }
  const factories=f2a4FactoryPresence(w,n);
  if(factories.length===0){f2jDecision(n,w,'NO_FACTORY');f2a4StartFirstFactory(w,n);continue;}
  const pending=factories.find(b=>b.status==='CONSTRUCTING'||b.status==='REDEVELOPING'||b.status==='UPGRADING');
  if(pending){f2jDecision(n,w,'PROJECT_PENDING',{buildingId:pending.id});f2a4FactoryDecision(n,w,'PROJECT_PENDING','NONE',pending.id);continue;}
  const operating=factories.filter(b=>b.typeId==='factory'&&b.status==='ACTIVE'&&!b.disconnected);
  f2a4FactoryDecision(n,w,operating.some(b=>b.lastFactoryOperatedDay===w.dayIndex)?'PRODUCTION_READY':
   operating.some(b=>b.powerProject||f2a3InstalledFactoryCapacity(w,n,b)<(F2_FACTORY_LEVELS[b.level]?.pu||0))?'POWER_PENDING':'RESOURCE_SHORTAGE',
   'NONE',operating[0]?.id??null);
  // F2C2C: demand pressure may justify exactly one additional paid factory per year.
  if(f2c2cExtraFactoryAI(w,n)){f2jDecision(n,w,'NEW_FACTORY_PREFERRED');continue;}
  if(f2jTryUpgrade(w,n,operating))continue;
  // F2C2: upgrades use the same food sufficiency rule as first factories.
  const upgradeFood=f2c2BuildFoodGate(w,n);
  if(!upgradeFood.eligible){f2a4FactoryDecision(n,w,'FOOD_RISK',upgradeFood.path,operating[0]?.id??null);continue;}
  if(n.gold<3500||n.resources.iron<150||n.resources.coal<15)continue;
  for(const b of operating){
   const p=f1Devices(b);if(!p.steam){
    const a={type:'INSTALL_WORKSHOP_POWER',buildingId:b.id,source:'STEAM'};
    if(canExecuteNationAction(w,n.id,a)){executeNationAction(w,n.id,a);break;}
   }
   if(b.level<3&&n.resources.machine_parts>=(b.level===1?4:10)+10){
    const required=F2_FACTORY_LEVELS[b.level+1].pu;
    if(f2a3InstalledFactoryCapacity(w,n,b)<required){
     if(f2a3InstallFactoryPower(w,n,b,required))break;continue;
    }
    const a={type:'UPGRADE_FACILITY',buildingId:b.id};
    if(canExecuteNationAction(w,n.id,a)){executeNationAction(w,n.id,a);break;}
   }
  }
 }
}
function f2FactorySummary(w){return {version:VERSION,dayIndex:w.dayIndex,nations:w.nations.map(n=>({id:n.id,name:n.name,coal:n.resources.coal,machine_parts:n.resources.machine_parts,lastQuarter:f2Ensure(n).lastQuarter,firstFactoryDecision:n.f2a4FirstFactoryDecision||null,level4Decision:n.f2jIndustry?.lastDecision||null,factories:w.buildings.filter(b=>b.typeId==='factory'&&w.tiles[b.tileId]?.ownerId===n.id).map(b=>({id:b.id,level:b.level,status:b.status,powerDevices:b.powerDevices,lastOperatedDay:b.lastFactoryOperatedDay||null,jLastQuarter:b.f2jLastQuarter||null}))}))};}

// V0.7E3E3 — paid wood-supply recovery and per-quarter logistics audit.
// Observability is deterministic and bounded. Historical shortage data are NEVER inferred.
const E3E3_SUPPLY_WINDOW=12;
function e3e3NewSupply(){return {schema:1,history:[],pendingConstructionWood:0,lastRecovery:null,f1b:f1bNewWoodState()};}
function e3e3EnsureSupply(n){
 const state=n.e3e3Supply||(n.e3e3Supply=e3e3NewSupply());
 state.f1b??=f1bNewWoodState();
 return state;
}
function e3e3MigrateWorld(w){for(const n of w.nations)e3e3EnsureSupply(n);}
// V0.7F1B — deterministic PAID forest work, no building slot or fictional lumber mill.
// Emergency extraction only on a real, unoccupied, owned forest tile attached to a
// living settlement with at least 12 *uncommitted* local worker capacity.
const F1B_FOREST_WORKERS=12,F1B_FOREST_WOOD=24,F1B_FOREST_GOLD=30;
const F1B_FOREST_MAX_SITES=3,F1B_FOREST_START=150,F1B_FOREST_STOP=360;
const F1B_BUILD_WOOD_RESERVE=72,F1B_BUILD_WOOD_RESERVE_END=260;
function f1bNewWoodState(){return {schema:1,active:false,lastQuarter:null,history:[]};}
function f1bActiveLumberCount(w,n){
 return w.buildings.filter(b=>b.typeId==='lumber'&&b.status==='ACTIVE'&&!b.disconnected&&
   w.tiles[b.tileId]?.ownerId===n.id&&w.tiles[b.tileId]?.occupiedBy===null).length;
}
function f1bOpenLumberSite(w,n,siteUsage=null){
 const used=(siteUsage||f4d3SiteUsage(w)).generalUsed,limit=generalTileSlotLimit(w,n.id);
 return w.tiles.some(t=>t.ownerId===n.id&&t.settlementId!==null&&t.occupiedBy===null&&
   BUILDINGS.lumber.terrains.includes(t.terrain)&&(used.get(t.id)||0)<limit);
}
function f1bWoodReserve(w,n){
 // Existing high-stock industry continues normally. Construction takes priority
 // only where replenishment is fragile; there is no wood creation in this guard.
 return n.resources.wood<F1B_BUILD_WOOD_RESERVE_END&&f1bActiveLumberCount(w,n)===0?
   F1B_BUILD_WOOD_RESERVE:0;
}
function f1bForestQuarter(w,n,q,siteUsage=null){
 const state=e3e3EnsureSupply(n).f1b;
 const snap={dayIndex:w.dayIndex,sites:0,produced:0,goldSpent:0,workersAssigned:0,
   availableForest:0,blockedLabor:0,blockedGold:0,blockedOccupation:0,
   protectedWood:f1bWoodReserve(w,n),workshopDeferred:0,printingDeferred:0,active:false};
 const nationalLumber=f1bActiveLumberCount(w,n);
 // Permanent specialized lumber sites remain the primary means of wood supply.
 if(nationalLumber>0||q.produced.wood>=60||f1bOpenLumberSite(w,n,siteUsage)){
   state.active=false;state.lastQuarter=snap;return snap;
 }
 if(n.resources.wood<F1B_FOREST_START)state.active=true;
 if(n.resources.wood>=F1B_FOREST_STOP)state.active=false;
 if(!state.active){state.lastQuarter=snap;return snap;}
 snap.active=true;
 const occupied=new Set((w.occupations||[]).map(o=>o.tileId));
 const laborBudget=new Map();
 for(const [id,local] of q.regionalEconomy.towns){
   laborBudget.set(id,Math.max(0,Math.floor((local.workers-local.demand)/F1B_FOREST_WORKERS)));
 }
 // Iterate the exact tile order, never randomize sites or infer geological deposits.
 for(const t of w.tiles){
   if(snap.sites>=F1B_FOREST_MAX_SITES)break;
   if(t.ownerId!==n.id||t.terrain!=='forest'||t.settlementId===null)continue;
   const s=w.settlements.find(s=>s.id===t.settlementId&&s.ownerId===n.id&&s.population>0);
   if(!s)continue;
   snap.availableForest++;
   if(t.occupiedBy!==null||occupied.has(t.id)){snap.blockedOccupation++;continue;}
   const remaining=laborBudget.get(s.id)||0;
   if(remaining<1){snap.blockedLabor++;continue;}
   if(n.gold<F1B_FOREST_GOLD){snap.blockedGold++;continue;}
   // Gold is actually destroyed. Labor is allocated only from residual capacity,
   // so preexisting farms and academies keep their original workforce.
   const wood=Math.min(F1B_FOREST_WOOD,1000000-n.resources.wood);
   if(wood<=0)break;
   n.gold-=F1B_FOREST_GOLD;n.resources.wood+=wood;
   q.produced.wood+=wood;
   laborBudget.set(s.id,remaining-1);
   snap.sites++;snap.produced+=wood;snap.goldSpent+=F1B_FOREST_GOLD;
   snap.workersAssigned+=F1B_FOREST_WORKERS;
 }
 state.lastQuarter=snap;
 return snap;
}
function f1bValidateState(state,w){
 if(!state||state.schema!==1||typeof state.active!=='boolean'||!Array.isArray(state.history)||state.history.length>12)return false;
 const rows=state.lastQuarter?[...state.history,state.lastQuarter]:state.history;
 for(const h of rows){
  if(!Number.isSafeInteger(h.dayIndex)||h.dayIndex>w.dayIndex||h.dayIndex<0||typeof h.active!=='boolean')return false;
  for(const key of ['sites','produced','goldSpent','workersAssigned','availableForest','blockedLabor','blockedGold','blockedOccupation','protectedWood','workshopDeferred','printingDeferred'])
   if(!Number.isSafeInteger(h[key])||h[key]<0)return false;
  if(h.sites>F1B_FOREST_MAX_SITES||h.produced>h.sites*F1B_FOREST_WOOD||h.goldSpent!==h.sites*F1B_FOREST_GOLD||h.workersAssigned!==h.sites*F1B_FOREST_WORKERS)return false;
 }
 return true;
}
function e3e3IndirectLimit(w,id){
 return 3000+(hasTech(w,id,'advanced_transport')?500:0)+(hasTech(w,id,'commercial_transport')?500:0)+(hasTech(w,id,'trunk_route_planning')?500:0);
}
function e3e3WoodSignal(w,n,q=null){
 const report=q||n.lastQuarter||projectedQuarter(w,n),s=e3e3EnsureSupply(n),hist=s.history.slice(-4),stock=n.resources.wood||0;
 const produced=report.produced?.wood||0;
 const recentUse=hist.length?hist.reduce((v,h)=>v+h.woodCraftUsed+h.woodPrintingUsed+h.woodBuildingUsed,0)/hist.length:
  (n.lastQuarter?.workshop?.woodUsed||0)+(n.lastQuarter?.printing?.woodUsed||0);
 const needs=Math.max(12,Math.ceil(recentUse));
 const trend=hist.length>=2?(hist.at(-1).woodEnd-hist[0].woodStart)/hist.length:produced-needs;
 const low=stock<Math.max(120,Math.ceil(needs*2));
 const declining=hist.length>=3&&hist.filter(h=>h.woodEnd<h.woodStart).length>=2&&trend<0&&stock+4*trend<Math.max(120,needs*2);
const deficit=produced<needs*.85;
 const woodMarket=w.market?.lastQuarter?.goods?.wood;
 const marketOpportunity=Boolean(woodMarket&&w.market.prices.wood>=e3eBaseMilli('wood')*2.5&&
  woodMarket.requestedBuy>Math.max(500,woodMarket.requestedSell*2)&&
  (report.produced.food||0)>(report.foodConsumed||0)*1.12&&stock<2000&&produced<80);
 const needed=low||(declining&&deficit)||marketOpportunity;
 return {needed,low,declining,marketOpportunity,stock,produced,estimatedUse:needs,trend:Math.round(trend*100)/100,
   forecastFourQuarters:Math.max(0,Math.round(stock+4*trend)),observedQuarters:hist.length,
   confidence:hist.length===4?'MEASURED_4Q':hist.length?'PARTIAL':'INSUFFICIENT_HISTORY'};
}
function e3e3FarmRetrofitSafe(w,n,s,b,q=null){
 if(!s||!b||b.typeId!=='farm'||b.status!=='ACTIVE'||b.disconnected||!BUILDINGS.lumber.terrains.includes(w.tiles[b.tileId]?.terrain))return false;
 const forecast=q||projectedQuarter(w,n),consumed=forecast.foodConsumed||0;
 if(consumed<1||n.foodPressure<.98||n.resources.food<consumed*2)return false;
 const cover=n.demographyE3E2?.coverageQuarters||[];
 if(cover.length===4&&cover.some(e=>e.coverage<.98))return false;
 const tile=w.tiles[b.tileId],base=facilityOutput(b,tile.terrain)?.produced?.food||0,local=forecast.regionalEconomy?.towns?.get(s.id);
 if(!local)return false;
 // Conservatively estimate the lost effective food output, including local productivity.
 const factor=Math.max(1,local.multiplier||1)*(1+techBonus(w,n.id,'farmFood')+
   (tile.terrain==='forest'?techBonus(w,n.id,'forestFarmBonus'):0)+
   (tile.terrain==='grass'?techBonus(w,n.id,'grassFarmBonus'):0)+
   (local.roadNetwork?techBonus(w,n.id,'connectedFarmBonus'):0));
 const loss=Math.ceil(base*factor*1.10);
 if(forecast.produced.food-loss<consumed*1.05)return false;
 // Never remove the last operational farm, or degrade an already food-short town.
 const localFarms=w.buildings.filter(x=>x.settlementId===s.id&&x.typeId==='farm'&&x.status==='ACTIVE'&&!x.disconnected&&w.tiles[x.tileId]?.ownerId===n.id).length;
 if(localFarms<=1||local.produced.food-loss<Math.max(s.population*.38,local.produced.food*.60))return false;
 return true;
}
function e3e3WoodRetrofits(w,n,q,byTown,counts){
 const signal=e3e3WoodSignal(w,n,q),out=[];
 const diag={dayIndex:w.dayIndex,...signal,legalSites:0,candidateCount:0,state:'SUFFICIENT',projectedWood:q.produced.wood||0};
 if(!signal.needed){e3e3EnsureSupply(n).lastRecovery=diag;return out;}
 if(!hasTech(w,n.id,'urban_redevelopment')){diag.state='TECH_MISSING';e3e3EnsureSupply(n).lastRecovery=diag;return out;}
 let terrain=0;
 for(const s of w.settlements){if(s.ownerId!==n.id)continue;
  const choices=[];
  for(const b of byTown.get(s.id)||[]){
   const t=w.tiles[b.tileId];if(!t||!BUILDINGS.lumber.terrains.includes(t.terrain))continue;
   terrain++;
   if(b.status!=='ACTIVE'||b.disconnected||t.occupiedBy!==null||w.dayIndex-(b.lastRedevelopedDay??-99999)<360||b.typeId==='lumber')continue;
   if(b.typeId==='farm'&&!e3e3FarmRetrofitSafe(w,n,s,b,q))continue;
   if(b.typeId==='house'&&s.population>settlementHousing(w,s)*.65)continue;
   if(['academy','quarry','mine'].includes(b.typeId)&&!v07c3SurplusConversionSafe(w,n,s,b,'lumber',q,counts))continue;
   if(!['farm','house','academy','quarry','mine'].includes(b.typeId))continue;
   const action={type:'REDEVELOP_FACILITY',buildingId:b.id,buildingType:'lumber'};
   if(!redevelopmentLegal(w,n.id,action))continue;
   diag.legalSites++;
   const priority={academy:1,quarry:2,mine:3,house:4,farm:5}[b.typeId];
   const labor=q.regionalEconomy.towns.get(s.id)?.utilization||1;
   const utility=(signal.low?3.4:2.9)*Math.min(1.1,Math.max(.65,labor)) + (b.typeId==='farm'?-.25:.15);
   choices.push({action,utility,facility:'lumber',e3e3WoodRecovery:true,conversionFrom:b.typeId,priority});
  }
  choices.sort((a,b)=>a.priority-b.priority||a.action.buildingId-b.action.buildingId);
  if(choices.length)out.push(choices[0]);
  if(out.length>=6)break;
 }
 diag.candidateCount=out.length;
 diag.state=!terrain?'NO_DOMESTIC_SITE':out.length?'RECOVERY_AVAILABLE':'NO_LEGAL_CANDIDATE';
 // A physical site may be legally convertible even if the nation cannot pay yet.
 if(out.length&&!out.some(c=>canExecuteNationAction(w,n.id,c.action)))diag.state='COST_OR_AP_BLOCKED';
 e3e3EnsureSupply(n).lastRecovery=diag;
 return out;
}
function e3e3RecordConstructionWood(n,action,price){
 if(!['BUILD_FACILITY','UPGRADE_FACILITY','REDEVELOP_FACILITY','FOUND_SETTLEMENT','EXPAND_SETTLEMENT','DEVELOP_SETTLEMENT','BUILD_ROAD','UPGRADE_ROAD'].includes(action.type))return;
 e3e3EnsureSupply(n).pendingConstructionWood+=(price.resources?.wood||0);
}
function e3e3StartEconomyQuarter(w){
 const state=new Map();for(const n of w.nations)if(n.active){const s=e3e3EnsureSupply(n);state.set(n.id,{start:n.resources.wood,building:s.pendingConstructionWood});s.pendingConstructionWood=0;}return state;
}
function e3e3FinishEconomyQuarter(w,starts){
 const reports=w.market?.lastNation||[];
 for(const n of w.nations){if(!n.active)continue;
  const x=starts.get(n.id);if(!x)continue;
  const m=reports.find(x=>x.id===n.id),q=n.lastQuarter||{},s=e3e3EnsureSupply(n);
  const entry={dayIndex:w.dayIndex,woodStart:x.start,woodProduced:q.produced?.wood||0,woodImported:m?.bought?.wood||0,woodExported:m?.sold?.wood||0,
   woodCraftUsed:(q.workshop?.woodUsed||0)+(q.factory?.woodUsed||0),woodPrintingUsed:q.printing?.woodUsed||0,woodBuildingUsed:x.building,woodEnd:n.resources.wood,
   woodEmergencyProduced:q.woodRecoveryF1B?.produced||0,woodEmergencyGold:q.woodRecoveryF1B?.goldSpent||0,
   woodEmergencySites:q.woodRecoveryF1B?.sites||0,woodProtectedWorkshops:q.woodRecoveryF1B?.workshopDeferred||0,
   woodProtectedPrinting:q.woodRecoveryF1B?.printingDeferred||0,
   importCap:e3e3IndirectLimit(w,n.id),importUsed:m?.indirectImportFreight||0,exportCap:e3e3IndirectLimit(w,n.id),exportUsed:m?.indirectExportFreight||0};
  // Strict current-quarter balance; between-quarter project spend is reported separately.
  entry.unattributed=Math.max(0,entry.woodStart+entry.woodProduced+entry.woodImported-entry.woodExported-entry.woodCraftUsed-entry.woodPrintingUsed-entry.woodEnd);
  s.history.push(entry);if(s.history.length>E3E3_SUPPLY_WINDOW)s.history.shift();
 }
}
function e3e3ValidateSupply(w){
 for(const n of w.nations){const s=n.e3e3Supply;
  if(!s||s.schema!==1||!Array.isArray(s.history)||s.history.length>E3E3_SUPPLY_WINDOW||!Number.isSafeInteger(s.pendingConstructionWood)||s.pendingConstructionWood<0||!f1bValidateState(s.f1b,w))return false;
  for(const h of s.history){if(h.dayIndex>w.dayIndex||!Number.isInteger(h.dayIndex))return false;
   for(const k of ['woodStart','woodProduced','woodImported','woodExported','woodCraftUsed','woodPrintingUsed','woodBuildingUsed','woodEnd','unattributed','importCap','importUsed','exportCap','exportUsed'])if(!Number.isSafeInteger(h[k])||h[k]<0)return false;
   if(h.importUsed>h.importCap||h.exportUsed>h.exportCap)return false;
   for(const key of ['woodEmergencyProduced','woodEmergencyGold','woodEmergencySites','woodProtectedWorkshops','woodProtectedPrinting'])
     if(h[key]!==undefined&&(!Number.isSafeInteger(h[key])||h[key]<0))return false;
   if(h.woodEmergencyProduced!==undefined&&h.woodEmergencyProduced>h.woodProduced)return false;
  }
 }
 return true;
}
function e3e3SupplySummary(w){return {schema:1,dayIndex:w.dayIndex,nations:w.nations.filter(n=>n.active).map(n=>({id:n.id,name:n.name,wood:n.resources.wood,woodAlert:e3e3WoodSignal(w,n),recovery:e3e3EnsureSupply(n).lastRecovery,quarters:e3e3EnsureSupply(n).history.slice(-4),transportCap:e3e3IndirectLimit(w,n.id),emergencyForestry:e3e3EnsureSupply(n).f1b.lastQuarter}))};}
function e3e3SupplyCsv(w){const columns=['nationId','nation','dayIndex','woodStart','woodProduced','woodImported','woodExported','woodCraftUsed','woodPrintingUsed','woodBuildingUsed','woodEnd','unattributed','importCap','importUsed','exportCap','exportUsed','woodEmergencyProduced','woodEmergencyGold','woodEmergencySites','woodProtectedWorkshops','woodProtectedPrinting'];
 const rows=[columns];for(const n of w.nations)for(const h of n.e3e3Supply?.history||[])rows.push([n.id,n.name,...columns.slice(2).map(k=>h[k]??'')]);
 return '\ufeff'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');}
// V0.7E3E2 — nation-level quarterly food observations and annual settlement demography.
// Deterministic, no RNG. World state, not optional observation telemetry.
const E3E2_DEMOGRAPHY_SCHEMA=1;
const E3E2_FOOD_WINDOW=4;
const E3E2_YEAR_WINDOW=20;
const E3E2_BIRTH_POWER=8;
const E3E2_HUNGER_START=.95;
const E3E2_HUNGER_MAX=.20; // Historic E3E2 record validator accepts pre-F2C1 values.
// V0.7F2C1: 120-day reserve-and-production food sufficiency, NOT the capped
// per-quarter actual foodPressure / shortage indicator. All rates are per 120-day year.
const F2C1_FOOD_QUARTERS=4;
const F2C1_STABLE_LOW=.90,F2C1_STABLE_HIGH=1.10;
const F2C1_SEVERE_LOW=.70,F2C1_ABUNDANT_HIGH=1.60;
const F2C1_NATURAL_DECLINE_CAP=.015,F2C1_NATURAL_GROWTH_CAP=.060; // F2C2A: replace former +1% cap with food-growth potential up to +6%
function f2c1FoodSufficiency(n,q=n.lastQuarter){
 const consumed=q?.foodConsumed,produced=q?.produced?.food;
 // A legacy or just-created nation with no projection has no invented history.
 if(!Number.isFinite(consumed)||!Number.isFinite(produced)||consumed<0||produced<0)return 1;
 if(consumed===0)return 1e4;
 return Math.max(0,Math.min(1e4,(Math.max(0,n.resources.food)+F2C1_FOOD_QUARTERS*produced)/(F2C1_FOOD_QUARTERS*consumed)));
}
function f2c1RollingSufficiency(n){
 const history=n.demographyE3E2?.coverageQuarters||[];
 const sampled=history.filter(h=>Number.isFinite(h.sufficiency));
 // Imported E3E2 quarters contain *coverage*, not sufficiency. Never reinterpret
 // capped coverage=1 as 100% reserve sufficiency or invent historic observations.
 return sampled.length?sampled.reduce((sum,h)=>sum+h.sufficiency,0)/sampled.length:f2c1FoodSufficiency(n);
}
// F2C2: a COMMON, read-only construction food gate. 1.00 means enough
// current stock + four expected production quarters for four consumption quarters.
// It uses the SAME observed F2C1 rolling samples as the population model;
// older saves have no fabricated history and fall back to current real stock.
// A verified acute delivery failure is separately guarded, never inferred
// from a production/consumption ratio alone. No writes, AP, or RNG here.
function f2c2BuildFoodGate(w,n,{q=n.lastQuarter,threshold=1,recovery=false}={}){
 const live=f2c1FoodSufficiency(n,q);
 const sampled=(n.demographyE3E2?.coverageQuarters||[]).filter(x=>Number.isFinite(x.sufficiency));
 const recent=sampled.length&&(!w||w.dayIndex-sampled.at(-1).dayIndex<=30&&w.dayIndex>=sampled.at(-1).dayIndex);
 const sufficiency=recent?f2c1RollingSufficiency(n):live;
 const cover=(n.demographyE3E2?.coverageQuarters||[]).filter(x=>Number.isFinite(x.coverage));
 const two=cover.slice(-2),cons=Math.max(0,q?.foodConsumed||0);
 const acute=Boolean(!recovery&&two.length===2&&(!w||w.dayIndex-two[1].dayIndex<=30&&w.dayIndex>=two[1].dayIndex)&&
  two.every(x=>x.coverage<.75)&&n.resources.food<cons*.25);
 const eligible=recovery||sufficiency+1e-10>=threshold&&!acute;
 const reason=acute?'SEVERE_ACTUAL_SHORTAGE':eligible?'SUFFICIENCY_OK':'SUFFICIENCY_LOW';
 return {eligible,reason,path:reason,sufficiency,live,threshold,observedQuarters:recent?sampled.length:0,
  actualCoverage:n.foodPressure,severe:acute};
}
function f2c1SmoothStep(t){const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);}
// F2C2A: the F2C1 stable (90..110%) and gradual decline curves are preserved.
// Surplus food gives a growth *potential*, while contemporary production / consumption
// determines how much of that potential is usable. The maximum +6% is a safety
// ceiling replacing +1%, not a guaranteed 6% growth. No RNG and no world writes.
const F2C2A_GROWTH_KNOTS=[[1.10,0],[1.30,.0053],[1.60,.015],[2.00,.0195],[3.00,.041],[5.00,.060]];
function f2c2aProductionRatio(n){
 const consumed=n?.lastQuarter?.foodConsumed,produced=n?.lastQuarter?.produced?.food;
 // A newly created nation with no measurable production/consumption is neutral:
 // never invent a surplus merely because the denominator is absent.
 if(!Number.isFinite(consumed)||!Number.isFinite(produced)||consumed<=0||produced<0)return 1;
 return Math.max(0,Math.min(10,produced/consumed));
}
function f2c2aGrowthPotential(sufficiency){
 if(sufficiency<=F2C1_STABLE_HIGH)return 0;
 for(let i=1;i<F2C2A_GROWTH_KNOTS.length;i++){
  const [x1,y1]=F2C2A_GROWTH_KNOTS[i];
  if(sufficiency<=x1){const [x0,y0]=F2C2A_GROWTH_KNOTS[i-1];
   return y0+(y1-y0)*f2c1SmoothStep((sufficiency-x0)/(x1-x0));}
 }
 return F2C1_NATURAL_GROWTH_CAP;
}
function f2c2aProductionFactor(productionRatio){
 // 120% output/consumption ~36%, 150% ~60%, 200%+ full growth potential;
 // a very large reserve with current deficit cannot trigger runaway growth.
 return Math.max(.20,Math.min(1,.20+.80*(productionRatio-1)));
}
function f2c1NaturalRate(sufficiency,productionRatio=1){
 if(sufficiency<F2C1_STABLE_LOW)return -F2C1_NATURAL_DECLINE_CAP*
  f2c1SmoothStep((F2C1_STABLE_LOW-sufficiency)/(F2C1_STABLE_LOW-F2C1_SEVERE_LOW));
 if(sufficiency>F2C1_STABLE_HIGH)return f2c2aGrowthPotential(sufficiency)*f2c2aProductionFactor(productionRatio);
 return 0;
}
function f2c2aNaturalRate(n){return f2c1NaturalRate(f2c1RollingSufficiency(n),f2c2aProductionRatio(n));}
function e3e2NewDemography(){return {schema:E3E2_DEMOGRAPHY_SCHEMA,coverageQuarters:[],lastYear:null,yearlyHistory:[]};}
function e3e2MigrateWorld(w){
  for(const n of w.nations)n.demographyE3E2??=e3e2NewDemography();
}
function e3e2RecordFoodQuarter(n,dayIndex,q=null){
  const d=n.demographyE3E2??(n.demographyE3E2=e3e2NewDemography());
  const h=d.coverageQuarters;
  const entry={dayIndex,coverage:n.foodPressure,sufficiency:f2c1FoodSufficiency(n,q||n.lastQuarter)};
  if(h.length&&h[h.length-1].dayIndex===dayIndex)h[h.length-1]=entry;
  else h.push(entry);
  if(h.length>E3E2_FOOD_WINDOW)h.splice(0,h.length-E3E2_FOOD_WINDOW);
}
function e3e2RollingFood(n){
  const h=n.demographyE3E2?.coverageQuarters||[];
  return h.length?h.reduce((s,r)=>s+r.coverage,0)/h.length:1;
}
function e3e2StressStreak(n){
  const h=n.demographyE3E2?.coverageQuarters||[];
  let count=0;
  for(let i=h.length-1;i>=0&&h[i].coverage<E3E2_HUNGER_START;i--)count++;
  return count;
}
function e3e2HungerRate(n){
 // Acute resource depletion still affects actual quarterly foodPressure and
 // the world economy, but *natural* population decline now uses the agreed
 // gentle food-sufficiency curve rather than the legacy 20%/year famine rule.
 return Math.max(0,-f2c2aNaturalRate(n));
}
const E3E2_LEDGER_KEYS=['startingPopulation','potentialBirths','realizedBirths','ordinaryDeaths','hungerDeaths','roundingAdjustment','housingAdjustment','endingPopulation'];
function e3e2BeginYear(n,dayIndex){
  return {dayIndex,startingPopulation:0,potentialBirths:0,realizedBirths:0,
    ordinaryDeaths:0,hungerDeaths:0,roundingAdjustment:0,housingAdjustment:0,endingPopulation:0,
    rollingCoverage:e3e2RollingFood(n),observedQuarters:n.demographyE3E2.coverageQuarters.length,
    stressStreak:e3e2StressStreak(n),hungerRate:e3e2HungerRate(n),
    foodSufficiency:f2c1RollingSufficiency(n),foodProductionRatio:f2c2aProductionRatio(n),naturalTargetRate:f2c2aNaturalRate(n)};
}
function f2c1FractionalCount(population,rate,carry){
 const exact=Math.max(0,population*rate+(Number.isFinite(carry)&&carry>=0&&carry<1?carry:0));
 const count=Math.floor(exact);
 return {count,carry:exact-count};
}
function e3e2SettlementPopulation(n,s,annual,crowding,maxPopulation){
  const p=s.population;
  const naturalTarget=f2c2aNaturalRate(n);
  // Legacy admin/research/development still influence the real economy and
  // food/housing capacity; old high direct population growth is replaced.
  const ordinaryRate=.010+.19*crowding;
  const hungerRate=Math.max(0,-naturalTarget);
  const birthRate=ordinaryRate+Math.max(0,naturalTarget);
  // Count partial demographic events over multiple years without RNG.
  const births=f2c1FractionalCount(p,birthRate,s.f2c1BirthCarry);
  const ordinary=f2c1FractionalCount(p,ordinaryRate,s.f2c1OrdinaryDeathCarry);
  const hunger=f2c1FractionalCount(p,hungerRate,s.f2c1HungerDeathCarry);
  const potentialBirths=births.count;
  const ordinaryDeaths=Math.min(Math.max(0,p-1),ordinary.count);
  const hungerDeaths=Math.min(Math.max(0,p-1-ordinaryDeaths),hunger.count);
  const housingCap=Math.max(1,maxPopulation);
  const realizedBirths=Math.min(potentialBirths,Math.max(0,housingCap-(p-ordinaryDeaths-hungerDeaths)));
  const naturalPopulation=p+potentialBirths-ordinaryDeaths-hungerDeaths;
  const endingPopulation=Math.max(1,Math.min(housingCap,naturalPopulation));
  const roundingAdjustment=0;
  const housingAdjustment=endingPopulation-(p+realizedBirths-ordinaryDeaths-hungerDeaths);
  return {startingPopulation:p,potentialBirths,realizedBirths,ordinaryDeaths,hungerDeaths,
    roundingAdjustment,housingAdjustment,endingPopulation,
    f2c1BirthCarry:births.carry,
    f2c1OrdinaryDeathCarry:ordinary.count===ordinaryDeaths?ordinary.carry:0,
    f2c1HungerDeathCarry:hunger.count===hungerDeaths?hunger.carry:0};
}
function e3e2AccumulateYear(year,settlement){
  for(const k of E3E2_LEDGER_KEYS)year[k]+=settlement[k];
}
function e3e2YearError(r){
  return r.startingPopulation+r.realizedBirths-r.ordinaryDeaths-r.hungerDeaths+r.roundingAdjustment+r.housingAdjustment-r.endingPopulation;
}
function e3e2FinishYear(n,year){
  if(e3e2YearError(year)!==0)throw Error('E3E2 인구 장부의 변화량이 보존되지 않았습니다.');
  const d=n.demographyE3E2;
  d.lastYear=year;
  d.yearlyHistory.push(year);
  if(d.yearlyHistory.length>E3E2_YEAR_WINDOW)d.yearlyHistory.splice(0,d.yearlyHistory.length-E3E2_YEAR_WINDOW);
}
function e3e2ValidateYearRecord(r,day){
  return Boolean(r&&Number.isInteger(r.dayIndex)&&r.dayIndex>0&&r.dayIndex%120===0&&r.dayIndex<=day&&
    E3E2_LEDGER_KEYS.every(k=>Number.isSafeInteger(r[k])&&(k==='roundingAdjustment'||k==='housingAdjustment'||r[k]>=0))&&
    r.realizedBirths<=r.potentialBirths&&e3e2YearError(r)===0&&
    Number.isFinite(r.rollingCoverage)&&r.rollingCoverage>=0&&r.rollingCoverage<=1&&
    Number.isInteger(r.observedQuarters)&&r.observedQuarters>=0&&r.observedQuarters<=4&&
    Number.isInteger(r.stressStreak)&&r.stressStreak>=0&&r.stressStreak<=4&&
    Number.isFinite(r.hungerRate)&&r.hungerRate>=0&&r.hungerRate<=E3E2_HUNGER_MAX&&
    (r.foodSufficiency===undefined||Number.isFinite(r.foodSufficiency)&&r.foodSufficiency>=0&&r.foodSufficiency<=1e4)&&
    (r.foodProductionRatio===undefined||Number.isFinite(r.foodProductionRatio)&&r.foodProductionRatio>=0&&r.foodProductionRatio<=10)&&
    (r.naturalTargetRate===undefined||Number.isFinite(r.naturalTargetRate)&&r.naturalTargetRate>=-F2C1_NATURAL_DECLINE_CAP&&r.naturalTargetRate<=F2C1_NATURAL_GROWTH_CAP));
}
function e3e2ValidateDemography(n,dayIndex){
  const d=n.demographyE3E2;
  if(!d||d.schema!==1||!Array.isArray(d.coverageQuarters)||d.coverageQuarters.length>4||
     !Array.isArray(d.yearlyHistory)||d.yearlyHistory.length>20)return false;
  let last=-1;
  for(const r of d.coverageQuarters){
    if(!r||!Number.isSafeInteger(r.dayIndex)||r.dayIndex%30!==0||r.dayIndex<=last||r.dayIndex>dayIndex||
       !Number.isFinite(r.coverage)||r.coverage<0||r.coverage>1||
       (r.sufficiency!==undefined&&(!Number.isFinite(r.sufficiency)||r.sufficiency<0||r.sufficiency>1e4)))return false;
    last=r.dayIndex;
  }
  last=-1;
  for(const r of d.yearlyHistory){
    if(!e3e2ValidateYearRecord(r,dayIndex)||r.dayIndex<=last)return false;
    last=r.dayIndex;
  }
  if(d.lastYear!==null&&(!e3e2ValidateYearRecord(d.lastYear,dayIndex)||!d.yearlyHistory.length||
    JSON.stringify(d.lastYear)!==JSON.stringify(d.yearlyHistory[d.yearlyHistory.length-1])))return false;
  if(d.lastYear===null&&d.yearlyHistory.length)return false;
  return true;
}
function e3e2ExportDemography(w){
  const nations=w.nations.filter(n=>n.active).map(n=>{
    const d=n.demographyE3E2;
    return {id:n.id,name:n.name,population:w.settlements.filter(s=>s.ownerId===n.id).reduce((a,s)=>a+s.population,0),
      foodPressure:n.foodPressure,rollingCoverage:e3e2RollingFood(n),stressStreak:e3e2StressStreak(n),
      foodSufficiency:f2c1RollingSufficiency(n),foodProductionRatio:f2c2aProductionRatio(n),naturalTargetRate:f2c2aNaturalRate(n),
      observedQuarters:d.coverageQuarters.length,coverageQuarters:d.coverageQuarters.map(r=>({...r})),
      lastYear:d.lastYear?{...d.lastYear}:null};
  });
  const annual=nations.reduce((s,n)=>{const r=n.lastYear;if(r){s.births+=r.realizedBirths;s.ordinaryDeaths+=r.ordinaryDeaths;
    s.hungerDeaths+=r.hungerDeaths;s.netChange+=r.endingPopulation-r.startingPopulation;s.ledgerError+=e3e2YearError(r);}return s;},
    {births:0,ordinaryDeaths:0,hungerDeaths:0,netChange:0,ledgerError:0});
  return {schema:'vilob-light-e3e2-demography-v1',version:w.version,dayIndex:w.dayIndex,
    population:nations.reduce((a,n)=>a+n.population,0),foodShortageNations:nations.filter(n=>n.rollingCoverage<.95).length,
    annual,nations};
}
function e3e2DemographyCsv(w){
  const cols=['dayIndex','nationId','nation','population','foodPressure','rollingCoverage','observedQuarters','stressStreak',
    'lastYearDay','startingPopulation','potentialBirths','realizedBirths','ordinaryDeaths','hungerDeaths',
    'roundingAdjustment','housingAdjustment','endingPopulation','annualNet','ledgerError',
    'foodSufficiency','foodProductionRatio','naturalTargetRate','lastYearFoodSufficiency','lastYearProductionRatio','lastYearTargetRate'];
  const rows=e3e2ExportDemography(w).nations.map(n=>{
    const r=n.lastYear||{};
    const values=[w.dayIndex,n.id,n.name,n.population,n.foodPressure,n.rollingCoverage,n.observedQuarters,n.stressStreak,
      r.dayIndex??'',...E3E2_LEDGER_KEYS.map(k=>r[k]??''),r.dayIndex===undefined?'':r.endingPopulation-r.startingPopulation,r.dayIndex===undefined?'':e3e2YearError(r),
      n.foodSufficiency,n.foodProductionRatio,n.naturalTargetRate,r.foodSufficiency??'',r.foodProductionRatio??'',r.naturalTargetRate??''];
    return values.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',');
  });
  return '\uFEFF'+[cols.join(','),...rows].join('\n');
}
// UI helpers below are read-only and are not invoked by the simulation engine.
function e3e2NationDemographyPanel(w,n){
  const d=n.demographyE3E2,r=d.lastYear,f=e3e2RollingFood(n),stress=e3e2StressStreak(n);
  const suff=f2c1RollingSufficiency(n),ratio=f2c2aProductionRatio(n),rate=f2c2aNaturalRate(n);
  const box=make('section',{class:'overview-section',id:'e3e2NationDemography'},[make('h3',{text:'F2C2A · 식량 충족률과 인구 성장'}),
    make('div',{class:'muted-line',text:`120일 식량 충족률 ${(suff*100).toFixed(1)}% (신규 관측 ${d.coverageQuarters.filter(q=>q.sufficiency!==undefined).length}/4분기) · 생산/소비 ${(ratio*100).toFixed(1)}% · 식량 기반 자연 변화 목표 ${rate>=0?'+':''}${(rate*100).toFixed(2)}%/년`}),
    make('div',{class:'muted-line',text:`별도 실공급률 최근 4분기 ${(f*100).toFixed(1)}% · 실공급 95% 미만 연속 ${stress}분기 · 자연 기아 사망 ${e3e2HungerRate(n)>0?'적용':'없음'}`})]);
  if(r){box.append(make('div',{class:'economy-grid'},[
    ['전년도 출생',r.realizedBirths],['일반 사망',r.ordinaryDeaths],['기아 사망',r.hungerDeaths],
    ['연간 민간 순증감',r.endingPopulation-r.startingPopulation],['주거·최소인구 보정',r.housingAdjustment],['장부 오차',e3e2YearError(r)]
  ].map(([title,value])=>make('div',{class:'economy-item'},[make('small',{text:title}),make('strong',{text:number.format(value)+'명'})]))));
    box.append(make('div',{class:'muted-line',text:`최근 정산: ${timeAt(r.dayIndex).year}년 · 인구 변화는 정착지 연간 계산만 포함하며 전쟁·이주로 인한 변화는 제외됩니다.`}));
  }else box.append(make('div',{class:'muted-line',text:'패치 적용 후 첫 연간 인구 정산 전입니다. 과거 인구 변화를 소급 생성하지 않습니다.'}));
  return box;
}
function e3e2RenderWorldDemography(){
  const root=document.getElementById('e3e2WorldDemography');if(!root||!app.world)return;
  const data=e3e2ExportDemography(app.world),a=data.annual;
  const stable=data.nations.filter(n=>n.foodSufficiency>=F2C1_STABLE_LOW&&n.foodSufficiency<=F2C1_STABLE_HIGH).length;
  const lines=[`생존 인구 ${number.format(data.population)}명 · 120일 식량 충족률 안정권(90~110%) ${stable}개국 · 실공급률 95% 미만 ${data.foodShortageNations}개국`,
    `최근 국가별 정산 합계 · 출생 ${number.format(a.births)} · 일반 사망 ${number.format(a.ordinaryDeaths)} · 기아 사망 ${number.format(a.hungerDeaths)}`,
    `민간 순증감 ${number.format(a.netChange)}명 · 장부 오차 ${a.ledgerError}명 (국가별 마지막 정산 연도 기준)`];
  root.replaceChildren(...lines.map(t=>make('div',{class:'muted-line',text:t})));
}
function e3e2RenderStatsDemography(){
  if(app.activeTab!=='statistics')return;
  const root=document.getElementById('e3e2StatsDemography');if(!root||!app.world)return;
  const data=e3e2ExportDemography(app.world);
  root.replaceChildren(...data.nations.map(n=>make('div',{class:'era-nation-row'},[
    make('strong',{text:n.name}),make('span',{text:n.lastYear?
      `충족률 ${(n.foodSufficiency*100).toFixed(1)}% · 생산/소비 ${(n.foodProductionRatio*100).toFixed(1)}% · 자연 목표 ${(n.naturalTargetRate*100).toFixed(2)}%/년 · 출생 ${number.format(n.lastYear.realizedBirths)} · 일반 사망 ${number.format(n.lastYear.ordinaryDeaths)} · 기아 사망 ${number.format(n.lastYear.hungerDeaths)} · 순변화 ${number.format(n.lastYear.endingPopulation-n.lastYear.startingPopulation)}`:
      `식량 충족률 ${(n.foodSufficiency*100).toFixed(1)}% · 연간 장부 수집 전`})
  ])));
}
// --- src/sim/settlement-footprint.js ---
/** Settlement Footprint V2: a shared, name-independent, non-random rule set.
 * The same feasibility and costs apply to AI and future PLAYER orders.
 */



const footprintDistance=(a,b,size)=>{const p=pointOf(a,size),q=pointOf(b,size);return Math.abs(p.x-q.x)+Math.abs(p.y-q.y);};
const TYPES_BY_RESOURCE={food:'farm',wood:'lumber',stone:'quarry',iron:'mine'};

function openBuildingSites(world,settlement,kind=null,siteUsage=null){
  const terrains=kind?BUILDINGS[kind].terrains:null;
  let available=0;
  for(const tid of settlement.tileIds){
    const t=world.tiles[tid];
    if(t?.ownerId!==settlement.ownerId||t.occupiedBy!==null||(terrains&&!terrains.includes(t.terrain)))continue;
    available+=kind==='fort'?Math.max(0,DEFENSE_TILE_SLOTS-(siteUsage?(siteUsage.defenseUsed.get(tid)||0):defenseTileSlotsUsed(world,tid))):
      Math.max(0,generalTileSlotLimit(world,settlement.ownerId)-(siteUsage?(siteUsage.generalUsed.get(tid)||0):buildingTileSlotsUsed(world,tid)));
  }
  return available;
}
/** Housing demand, exhausted slots or shortages without a suitable site justify a larger footprint. */
function settlementExpansionDemand(world,s,forecast=null,siteUsage=null){
  if(!s||!world.nations[s.ownerId])return {needed:false,reasons:[],openSlots:0,missingTypes:[],occupancy:0};
  const n=world.nations[s.ownerId];
  const q=forecast||projectedQuarter(world,n);
  const capacity=settlementHousing(world,s),occupancy=s.population/Math.max(1,capacity);
  const openSlots=openBuildingSites(world,s,null,siteUsage);
  const missingTypes=[];
  const shortages={
    food:q.produced.food<q.foodConsumed||n.resources.food<q.foodConsumed*1.2,
    wood:n.resources.wood<16,stone:n.resources.stone<8,iron:n.resources.iron<5
  };
  for(const [resource,kind] of Object.entries(TYPES_BY_RESOURCE)){
    if(shortages[resource]&&openBuildingSites(world,s,kind,siteUsage)===0)missingTypes.push(kind);
  }
  const reasons=[];
  if(occupancy>=.85)reasons.push('HOUSING');
  if(openSlots<=2)reasons.push('SLOTS');
  if(missingTypes.length)reasons.push('TERRAIN');
  return {needed:reasons.length>0,reasons,openSlots,missingTypes,occupancy,shortages};
}
function settlementExpansionCandidate(world,s,tid,demand=null){
  const tile=world.tiles[tid];
  if(!s||!tile||s.tileIds.length>=settlementFootprintCapacity(world,s.ownerId).maxTiles||tile.ownerId!==s.ownerId||tile.settlementId!==null||tile.occupiedBy!==null)return null;
  const radius=footprintDistance(tid,s.coreTileId,world.size);
  if(radius>settlementFootprintCapacity(world,s.ownerId).maxRadius)return null;
  const members=new Set(s.tileIds);
  const contacts=neighbors4(tid,world.size,world.height).filter(id=>members.has(id)).length;
  if(!contacts)return null;
  const need=demand||settlementExpansionDemand(world,s);
  if(!need.needed)return null;
  let value=0;
  // The candidate should answer the specific missing infrastructure need, rather than simply reward terrain.
  if(need.missingTypes.some(kind=>BUILDINGS[kind].terrains.includes(tile.terrain)))value+=20;
  else if(need.shortages.food&&BUILDINGS.farm.terrains.includes(tile.terrain))value+=tile.terrain==='plain'?14:8;
  else if(need.shortages.wood&&tile.terrain==='forest')value+=12;
  else if(need.shortages.iron&&['rock','mountain'].includes(tile.terrain))value+=12;
  else if(need.occupancy>=.85)value+=tile.terrain==='plain'||tile.terrain==='grass'?6:2;
  const score=50+15*(contacts-1)-8*Math.max(0,radius-2)+Math.min(20,value);
  return {contacts,radius,value:Math.min(20,value),score,gold:15+(contacts===1?4:0)+(radius>=4?5:0)+(radius>=5?3*(radius-4):0)};
}

/** Match executeNationAction's primary/secondary selection before checking radii. */
function settlementMergePrimary(world,a,b){
  const nation=world.nations[a.ownerId];
  return a.coreTileId===nation?.capitalId?a:b.coreTileId===nation?.capitalId?b:
    (a.formerCapitalOf?.length||0)?a:(b.formerCapitalOf?.length||0)?b:a;
}
function settlementMergeAssessment(world,a,b){
  if(!a||!b||a.id===b.id||a.ownerId!==b.ownerId)return null;
  // F2B: a merged settlement cannot inherit two separate dedicated industrial sites.
  if(world.buildings.filter(x=>x.industrialSlot&&(x.settlementId===a.id||x.settlementId===b.id)).length>1)return null;
  const cap=settlementFootprintCapacity(world,a.ownerId);
  if(a.tileIds.length+b.tileIds.length>cap.maxTiles)return null;
  if((a.formerCapitalOf?.length||0)&&(b.formerCapitalOf?.length||0))return null;
  const primary=settlementMergePrimary(world,a,b);
  const coreDistance=footprintDistance(a.coreTileId,b.coreTileId,world.size);
  if(coreDistance>cap.maxRadius)return null;
  if([...a.tileIds,...b.tileIds].some(id=>footprintDistance(id,primary.coreTileId,world.size)>cap.maxRadius))return null;
  const bTiles=new Set(b.tileIds);
  let sharedEdges=0;
  for(const tid of a.tileIds)for(const nid of neighbors4(tid,world.size,world.height))if(bTiles.has(nid))sharedEdges++;
  if(sharedEdges===0)return null;
  const housingA=settlementHousing(world,a),housingB=settlementHousing(world,b);
  const crowdedA=a.population/housingA>=.85,crowdedB=b.population/housingB>=.85;
  const slotsA=openBuildingSites(world,a),slotsB=openBuildingSites(world,b);
  const relief=(crowdedA&&slotsA<=2&&slotsB>=2)||(crowdedB&&slotsB<=2&&slotsA>=2);
  // Multiple shared edges are a genuine connected urban area; otherwise only merge for actual space relief.
  if(sharedEdges<2&&!relief)return null;
  return {sharedEdges,coreDistance,relief,housingBefore:housingA+housingB,score:sharedEdges*12+(relief?25:0)};
}


// V0.7D3: bounded opt-in combat observation, grouped by completed round / local clash.
// All state is stored in this WeakMap; nothing is serialized with World or consumes RNG.
const V07D2_TRACE_LIMIT=16384, V07D3_SUMMARY_LIMIT=1024;
const v07d2Traces=new WeakMap();
// The original D2 prefix is preserved byte-for-byte for existing CSV clients.
const V07D2_TRACE_COLUMNS=Object.freeze(['sequence','dayIndex','kind','scope','semantics','warId','engagementId','uprisingId','localArmyId','round','phase','side','armyId','nationId','front','rear','reserve','frontAfter','rearAfter','reserveAfter','frontStable','frontBroken','rangedMen','matchlockMen','fireEligible','matchlockFired','power','ammoPolicy','ammoReady','ammoReason','goldBefore','goldAfter','goldSpent','ironBefore','ironAfter','ironSpent','menBefore','menAfter','casualties','moraleBefore','moraleAfter','active','endReason']);
const V07D3_EXTRA_COLUMNS=Object.freeze(['groupId','groupKind','groupComplete','encounterCoverage','chargeKind','cost','paid','unpaid','arrearsBefore','arrearsAfter','ammoGoldRequired','ammoIronRequired','endConditions','winnerSide','pursuitLosses','prisoners','observedFromDay','detailOmittedRows','detailOmittedReason','accountingScope']);
const V07E1_EXTRA_COLUMNS=Object.freeze(['back','backAfter','firearmMen','flintlockMen']);
const V07E2_EXTRA_COLUMNS=Object.freeze(['gunsFired','artilleryUnits','artilleryGoldSpent','artilleryIronSpent','artilleryLosses']);
const V07E3B_EXTRA_COLUMNS=Object.freeze(['rollbackStatus','errorStage','errorName','errorMessage']);
const V07F2C2C2_EXTRA_COLUMNS=Object.freeze(['rifleMen','rifleFired']);
const V08C_TRACE_COLUMNS=Object.freeze(['machineGunMen','machineGunFired']);
const V07D3_TRACE_COLUMNS=Object.freeze([...V07D2_TRACE_COLUMNS,...V07D3_EXTRA_COLUMNS,...V07E1_EXTRA_COLUMNS,...V07E2_EXTRA_COLUMNS,...V07E3B_EXTRA_COLUMNS,...V07F2C2C2_EXTRA_COLUMNS,...V08C_TRACE_COLUMNS]);
function v07d3NewState(w){return {enabled:true,groups:[],rowsCount:0,written:0,dropped:0,droppedGroups:0,omittedGroups:0,omittedRows:0,
  current:null,phase:null,trace:null,completed:[],encounters:new Map(),summaryOverflow:0,offGaps:0,
  startedDay:w.dayIndex,lastDay:null,firstRetainedDay:null,nextGroupId:1,
  counters:{rounds:0,localClashes:0,charges:0,billed:0,paid:0,unpaid:0,ammoAttempts:0,ammoFired:0,ammoFailed:0,ammoGold:0,ammoIron:0,phaseCasualties:0,pursuitLosses:0,prisoners:0}};}
function v07d2SetObservation(w,enabled){
 let s=v07d2Traces.get(w);if(!s&&enabled){s=v07d3NewState(w);v07d2Traces.set(w,s);}
 if(s){if(enabled&&!s.enabled){s.offGaps++;for(const x of s.encounters.values())x.contiguous=false;}s.enabled=!!enabled;}
 return v07d2ObservationStatus(w);
}
function v07d2ObservationStatus(w){
 const s=v07d2Traces.get(w);
 return {enabled:!!s?.enabled,retained:s?.rowsCount||0,limit:V07D2_TRACE_LIMIT,dropped:s?.dropped||0,
  droppedGroups:s?.droppedGroups||0,omittedGroups:s?.omittedGroups||0,omittedRows:s?.omittedRows||0,
  retainedGroups:s?.groups.length||0,completed:s?.completed.length||0,summaryOverflow:s?.summaryOverflow||0,
  startedDay:s?.startedDay??null,lastDay:s?.lastDay??null,offGaps:s?.offGaps||0,
  localUncharged:0};
}
function v07d2ClearObservation(w){const enabled=!!v07d2Traces.get(w)?.enabled;v07d2Traces.delete(w);return v07d2SetObservation(w,enabled);}
function v07d3EncounterKey(ctx){return ctx.scope==='LOCAL_UPRISING'?`LOCAL:${ctx.uprisingId}:${ctx.localArmyId}:${ctx.round}`:`WAR:${ctx.engagementId}`;}
function v07d3Encounter(s,context,w){
 const key=v07d3EncounterKey(context);let r=s.encounters.get(key);
 if(!r){
  if(s.encounters.size>=V07D3_SUMMARY_LIMIT){const first=s.encounters.keys().next().value;s.encounters.delete(first);s.summaryOverflow++;}
  r={key,scope:context.scope,warId:context.warId,engagementId:context.engagementId,uprisingId:context.uprisingId,
    localArmyId:context.localArmyId,firstObservedDay:w.dayIndex,lastObservedDay:w.dayIndex,startedObserved:context.scope==='LOCAL_UPRISING',
    contiguous:true,observedRounds:0,phaseCasualties:0,ammoGold:0,ammoIron:0,charges:0,billed:0,paid:0,unpaid:0,
    pursuitLosses:0,prisoners:0,armyIds:new Set(),nationIds:new Set(),detailOmitted:false};
  s.encounters.set(key,r);
 }
 r.lastObservedDay=w.dayIndex;return r;
}
function v07d3StartGroup(w,context,kind){
 const s=v07d2Traces.get(w);if(!s?.enabled)return null;
 if(s.current)throw Error('V07D3 nested observer group');
 const group={id:s.nextGroupId++,kind,context,dayIndex:w.dayIndex,rows:[],oversize:false,omitted:0,complete:false,
   observedFromDay:s.startedDay,coverage:'ROUND_ONLY',encounter:v07d3Encounter(s,context,w)};
 s.current=group;return group;
}
function v07d3CommitGroup(w,g,complete=true){
 if(!g)return;const s=v07d2Traces.get(w);if(!s)return;
 if(s.current===g)s.current=null;
 g.complete=complete;
 g.coverage=g.encounter?.startedObserved&&g.encounter?.contiguous?'START_OBSERVED':'PARTIAL_ENCOUNTER';
 if(g.oversize){
  s.omittedGroups++;s.omittedRows+=g.omitted;
  g.encounter&&(g.encounter.detailOmitted=true);
  g.rows=[{sequence:++s.written,dayIndex:g.dayIndex,...g.context,kind:'DETAIL_OMITTED',detailOmittedRows:g.omitted,
    detailOmittedReason:'GROUP_EXCEEDS_16384',accountingScope:'METADATA_ONLY'}];
 }
 if(!g.rows.length)return;
 for(const r of g.rows){r.groupId=g.id;r.groupKind=g.kind;r.groupComplete=g.complete;r.encounterCoverage=g.coverage;r.observedFromDay=s.startedDay;}
 while(s.rowsCount+g.rows.length>V07D2_TRACE_LIMIT&&s.groups.length){
  const old=s.groups.shift();s.rowsCount-=old.rows.length;s.dropped+=old.rows.length;s.droppedGroups++;
  if(old.encounter)old.encounter.detailOmitted=true;
 }
 s.groups.push(g);s.rowsCount+=g.rows.length;
 s.firstRetainedDay=s.groups[0]?.dayIndex??null;
}
function v07d3CountRow(s,row){
 const c=s.counters,g=s.current,e=g?.encounter;
 if(row.kind==='ARMY_PHASE'){
  const value=Math.max(0,row.casualties||0);c.phaseCasualties+=value;if(e)e.phaseCasualties+=value;
 }
 if(row.kind==='AMMO'){
  c.ammoAttempts++;if(row.ammoReady){c.ammoFired++;c.ammoGold+=Math.max(0,row.goldSpent||0);c.ammoIron+=Math.max(0,row.ironSpent||0);}
  else c.ammoFailed++;
  if(e){e.ammoGold+=Math.max(0,row.goldSpent||0);e.ammoIron+=Math.max(0,row.ironSpent||0);}
 }
 if(row.kind==='CHARGE'){
  c.charges++;c.billed+=row.cost||0;c.paid+=row.paid||0;c.unpaid+=row.unpaid||0;
  if(e){e.charges++;e.billed+=row.cost||0;e.paid+=row.paid||0;e.unpaid+=row.unpaid||0;}
 }
 if(row.kind==='ARMY_PHASE'||row.kind==='AMMO'||row.kind==='CHARGE'){
  if(e){if(row.armyId!=null)e.armyIds.add(row.armyId);if(row.nationId!=null)e.nationIds.add(row.nationId);}
 }
}
function v07d2Push(w,row){
 const s=v07d2Traces.get(w);if(!s?.enabled)return;
 s.lastDay=w.dayIndex;v07d3CountRow(s,row);
 const r={sequence:++s.written,dayIndex:w.dayIndex,...row},g=s.current;
 if(g){if(!g.oversize){if(g.rows.length<V07D2_TRACE_LIMIT)g.rows.push(r);else{g.oversize=true;g.omitted=g.rows.length+1;g.rows=[];}}else g.omitted++;return;}
 const singleton={id:s.nextGroupId++,kind:'EVENT',context:{scope:row.scope,warId:row.warId,engagementId:row.engagementId,uprisingId:row.uprisingId,localArmyId:row.localArmyId},
  dayIndex:w.dayIndex,rows:[r],complete:true,coverage:'EVENT_ONLY',observedFromDay:s.startedDay,encounter:null};
 if(row.kind==='ENGAGEMENT_START')v07d3Encounter(s,row,w).startedObserved=true;
 v07d3CommitGroup(w,singleton);
}
function v07d3Summarize(w,ctx,extra={}){
 const s=v07d2Traces.get(w);if(!s?.enabled)return;
 const key=v07d3EncounterKey(ctx),r=s.encounters.get(key),coverage=r?.startedObserved&&r.contiguous?'START_OBSERVED':'PARTIAL_ENCOUNTER';
 const summary={key,scope:ctx.scope,semantics:ctx.semantics,warId:ctx.warId,engagementId:ctx.engagementId,
  uprisingId:ctx.uprisingId,localArmyId:ctx.localArmyId,round:ctx.round,dayIndex:w.dayIndex,
  firstObservedDay:r?.firstObservedDay??w.dayIndex,observedRounds:r?.observedRounds||0,
  encounterCoverage:coverage,detailOmitted:!!r?.detailOmitted,phaseCasualties:r?.phaseCasualties??null,
  pursuitLosses:r?.pursuitLosses??null,prisoners:r?.prisoners??null,
  billed:r?.billed??0,paid:r?.paid??0,unpaid:r?.unpaid??0,ammoGold:r?.ammoGold??0,ammoIron:r?.ammoIron??0,
  armyCount:r?.armyIds.size??0,nationIds:r?[...r.nationIds].sort((a,b)=>a-b):[],...extra};
 if(r?.formationSnapshot){summary.formationSnapshot=r.formationSnapshot;summary.snapshotCoverage=r.snapshotCoverage;}
 if(s.completed.length>=V07D3_SUMMARY_LIMIT){s.completed.shift();s.summaryOverflow++;}
 s.completed.push(summary);s.encounters.delete(key);return summary;
}
function v07d2Observation(w){
 const s=v07d2Traces.get(w),rows=s?s.groups.flatMap(g=>g.rows.map(r=>({...r}))):[];
 const active=s?[...s.encounters.values()].map(r=>({key:r.key,scope:r.scope,firstObservedDay:r.firstObservedDay,lastObservedDay:r.lastObservedDay,
  observedRounds:r.observedRounds,phaseCasualties:r.phaseCasualties,ammoGold:r.ammoGold,ammoIron:r.ammoIron,
  billed:r.billed,paid:r.paid,unpaid:r.unpaid,detailOmitted:r.detailOmitted,encounterCoverage:r.startedObserved&&r.contiguous?'START_OBSERVED':'PARTIAL_ENCOUNTER'})):[];
 return {schema:'vilob-light-combat-observations-v2',version:VERSION,seed:w.seed,dayIndex:w.dayIndex,rngState:w.rngState,
  ...v07d2ObservationStatus(w),observationWindow:{startedDay:s?.startedDay??null,lastObservedDay:s?.lastDay??null,
   firstRetainedDay:s?.firstRetainedDay??null,exportedDay:w.dayIndex,offGaps:s?.offGaps||0,scope:'CURRENT_OBSERVATION_SESSION_ONLY'},
  counters:s?{...s.counters}:v07d3NewState(w).counters,
  completedSummaries:s?s.completed.map(v=>{
   const retained=s.groups.filter(g=>g.context?.scope===v.scope&&v.key===v07d3EncounterKey(g.context));
   const retainedRounds=retained.filter(g=>g.kind==='NATIONAL_ROUND'||g.kind==='LOCAL_CLASH').length;
   const partial=v.detailOmitted||retainedRounds<v.observedRounds||retained.some(g=>g.oversize||!g.complete);
   return {...v,retainedDetailGroups:retainedRounds,detailOmitted:partial,
    detailAvailability:retainedRounds?(partial?'PARTIAL':'RETAINED'):'NOT_RETAINED'};
  }):[],activeSummaries:active,rows};
}
/** E3D: summary-only export; single pass over retained groups; never materializes detailed rows. */
function e3dCombatSummary(w){
 const s=v07d2Traces.get(w),status=v07d2ObservationStatus(w);
 const groupInfo=new Map();
 if(s)for(const g of s.groups){
  if(g.kind!=='NATIONAL_ROUND'&&g.kind!=='LOCAL_CLASH')continue;
  const key=v07d3EncounterKey(g.context),current=groupInfo.get(key)||{count:0,incomplete:false};
  current.count++;current.incomplete ||= !g.complete||g.oversize;groupInfo.set(key,current);
 }
 const completed=(s?.completed||[]).map(v=>{
  const retained=groupInfo.get(v.key),count=retained?.count||0;
  const partial=!!v.detailOmitted||!!retained?.incomplete||count<v.observedRounds;
  return {...v,retainedDetailGroups:count,detailOmitted:partial,
   detailAvailability:count?(partial?'PARTIAL':'RETAINED'):'NOT_RETAINED'};
 });
 const active=(s?[...s.encounters.values()]:[]).map(r=>({key:r.key,scope:r.scope,firstObservedDay:r.firstObservedDay,lastObservedDay:r.lastObservedDay,
  observedRounds:r.observedRounds,phaseCasualties:r.phaseCasualties,ammoGold:r.ammoGold,ammoIron:r.ammoIron,
  billed:r.billed,paid:r.paid,unpaid:r.unpaid,detailOmitted:r.detailOmitted,
  encounterCoverage:r.startedObserved&&r.contiguous?'START_OBSERVED':'PARTIAL_ENCOUNTER'}));
 return {schema:'vilob-light-combat-summary-v1',version:VERSION,seed:w.seed,dayIndex:w.dayIndex,rngState:w.rngState,...status,
  observationWindow:{startedDay:s?.startedDay??null,lastObservedDay:s?.lastDay??null,
    firstRetainedDay:s?.firstRetainedDay??null,exportedDay:w.dayIndex,offGaps:s?.offGaps||0,scope:'CURRENT_OBSERVATION_SESSION_ONLY'},
  counters:s?{...s.counters}:v07d3NewState(w).counters,completedSummaries:completed,activeSummaries:active,
  note:'상세 rows 제외. 관측이 켜진 기간만 포함하며 소실된 기록은 복원하지 않습니다.'};
}
/** Observer-ON compact composition at first observed combat round: no per-unit kill attribution. */
function e3dCaptureRoundComposition(w,e,encounter){
 if(!encounter||encounter.formationSnapshot)return;
 const ids=[...new Set([e.attackerArmyId,e.defenderArmyId,...(e.attackers||[]).map(m=>m.armyId),...(e.defenders||[]).map(m=>m.armyId)])];
 encounter.formationSnapshot=ids.slice(0,48).map(id=>{
  const a=w.armies.find(x=>x.id===id);if(!a)return null;
  const positions=new Map(Object.entries(a.deployment||{}).flatMap(([role,ids])=>ids.map(u=>[u,role])));
  return {armyId:a.id,nationId:a.nationId,manpower:manpower(a),rank:b4aRankIndex(a),
    groups:a.units.filter(u=>u.manpower>0).slice(0,16).map(u=>({typeId:u.typeId,position:positions.get(u.id)||null,
      men:u.manpower,trained:c3ReadyMen(u),guns:u.typeId==='field_artillery'?(u.guns||0):0}))};
 }).filter(Boolean);
 encounter.snapshotCoverage=ids.length>48?'TRUNCATED_48_ARMIES':'FIRST_OBSERVED_ROUND';
}
function v07d2ObservationCSV(w){
 const escape=value=>{if(Array.isArray(value))value=value.join('|');const t=value==null?'':String(value);return /[",\r\n]/.test(t)?'"'+t.replaceAll('"','""')+'"':t;};
 return '\uFEFF'+[V07D3_TRACE_COLUMNS.join(','),...v07d2Observation(w).rows.map(r=>V07D3_TRACE_COLUMNS.map(k=>escape(r[k])).join(','))].join('\r\n')+'\r\n';
}
function v07d2Context(e,local=null){
 return local?{scope:'LOCAL_UPRISING',semantics:'SEPARATE_QUARTER_CLASH',warId:null,engagementId:null,uprisingId:local.f.id,localArmyId:local.d.army.id,round:local.d.engagement.round}:
  {scope:'NATIONAL_WAR',semantics:'PERSISTENT_ENGAGEMENT',warId:e.warId,engagementId:e.id,uprisingId:null,localArmyId:null,round:e.round};
}
function v07d2PhaseBegin(w,e,phase,groups,local=null){
 const state=v07d2Traces.get(w);if(!state?.enabled)return null;
 const context={...v07d2Context(e,local),phase},armies=[],nations=new Map();
 for(const group of groups)for(const item of group.members){
  const a=item.army,n=w.nations[a.nationId],allocation=group.allocation;
  let rangedMen=0,matchlockMen=0,flintlockMen=0,rifleMen=0,machineGunMen=0;
  if(phase==='OPENING'||phase==='SUSTAINED')for(const u of a.units){
   const eligible=allocation?allocation.filter(x=>x.armyId===a.id&&x.unitId===u.id).reduce((s,x)=>s+x.men,0):
    (phase==='OPENING'?[...a.deployment.front,...a.deployment.rear]:item.stable?a.deployment.rear:[]).includes(u.id)?c3CombatMen(u,group.side==='defenders'):0;
   if((WEAPONS[u.weaponId]?.opening||0)>0)rangedMen+=eligible;
   if(u.weaponId==='matchlock')matchlockMen+=eligible;
   if(u.weaponId==='flintlock')flintlockMen+=eligible;
   if(u.weaponId==='rifled_musket')rifleMen+=eligible;
   if(u.weaponId==='machine_gun')machineGunMen+=eligible;
  }
  armies.push({army:a,side:group.side,front:deployedManpower(a,'front'),rear:deployedManpower(a,'rear'),back:deployedManpower(a,'back'),reserve:deployedManpower(a,'reserve'),
   frontStable:item.stable??!item.broken,frontBroken:!!item.broken,rangedMen,matchlockMen,flintlockMen,rifleMen,machineGunMen,firearmMen:matchlockMen+flintlockMen+rifleMen+machineGunMen,menBefore:manpower(a),moraleBefore:a.morale});
  if(n&&!nations.has(n.id))nations.set(n.id,{nationId:n.id,goldBefore:n.gold,ironBefore:n.resources.iron});
 }
 const trace={context,armies,nations,ammo:new Map(),previous:state.phase,previousTrace:state.trace};state.phase=context;state.trace=trace;return trace;
}
function v07d2PhaseEnd(w,trace,powers){
 if(!trace)return;
 const state=v07d2Traces.get(w);
 for(const x of trace.armies){
  const {army:a,...before}=x,hasShot=trace.ammo.get(a.id);
  v07d2Push(w,{...trace.context,kind:'ARMY_PHASE',...before,armyId:a.id,nationId:a.nationId,
   frontAfter:deployedManpower(a,'front'),rearAfter:deployedManpower(a,'rear'),backAfter:deployedManpower(a,'back'),reserveAfter:deployedManpower(a,'reserve'),
   menAfter:manpower(a),casualties:before.menBefore-manpower(a),moraleAfter:a.morale,fireEligible:before.rangedMen>0,
   ammoReady:hasShot??null,matchlockFired:before.matchlockMen>0&&hasShot===true,rifleFired:before.rifleMen>0&&hasShot===true,machineGunFired:before.machineGunMen>0&&hasShot===true,ammoPolicy:'TREASURY_AND_IRON',accountingScope:'ARMY_PHASE_CASUALTIES'});
 }
 for(const x of trace.nations.values()){
  const n=w.nations[x.nationId];
  v07d2Push(w,{...trace.context,kind:'NATION_PHASE',...x,goldAfter:n.gold,ironAfter:n.resources.iron,
   goldSpent:x.goldBefore-n.gold,ironSpent:x.ironBefore-n.resources.iron,accountingScope:'NATION_PHASE_STOCK_DELTA_NOT_EXTRA_CHARGE'});
 }
 if(powers)for(const [side,power] of Object.entries(powers))v07d2Push(w,{...trace.context,kind:'SIDE_PHASE',side,power,
   casualties:trace.armies.filter(x=>x.side===side).reduce((sum,x)=>sum+x.menBefore-manpower(x.army),0),accountingScope:'SIDE_PHASE_DUPLICATE_CASUALTY_SUMMARY'});
 state.phase=trace.previous;state.trace=trace.previousTrace;
}
function v07d2AmmoResult(w,a,men,warId,before,ready,reason,composition=null){
 if(!before)return;
 const n=w.nations[a.nationId],s=v07d2Traces.get(w);
 s?.trace?.ammo.set(a.id,ready);
 v07d2Push(w,{...(s?.phase||{scope:'NATIONAL_WAR',warId}),kind:'AMMO',armyId:a.id,nationId:a.nationId,
  matchlockMen:composition?.matchlockMen??men,flintlockMen:composition?.flintlockMen??0,rifleMen:composition?.rifleMen??0,machineGunMen:composition?.machineGunMen??0,rifleFired:(composition?.rifleMen||0)>0&&ready,machineGunFired:(composition?.machineGunMen||0)>0&&ready,firearmMen:men,ammoPolicy:'TREASURY_AND_IRON',ammoReady:ready,ammoReason:reason,
  ammoGoldRequired:Math.max(1,Math.ceil((men+(composition?.machineGunMen||0))*.25)),ammoIronRequired:Math.max(1,Math.ceil((men+(composition?.machineGunMen||0))/40)),
  goldBefore:before.gold,ironBefore:before.iron,goldAfter:n?.gold??null,ironAfter:n?.resources.iron??null,
  goldSpent:before.gold-(n?.gold??before.gold),ironSpent:before.iron-(n?.resources.iron??before.iron),accountingScope:'ACTUAL_AMMO_CONSUMPTION'});
}
function v07d3ChargeResult(w,id,warId,kind,arrearsBefore,result){
 const s=v07d2Traces.get(w);if(!s?.enabled||!s.current)return;
 const n=w.nations[id],row={...s.current.context,kind:'CHARGE',nationId:id,chargeKind:kind,
  cost:result.cost,paid:result.paid,unpaid:result.unpaid,arrearsBefore,arrearsAfter:n.military.operationArrears||0,
  accountingScope:'REAL_OPERATION_INVOICE_NOT_PHASE_STOCK_DELTA'};
 v07d2Push(w,row);
}
function v07d2RoundBegin(w,e){
 const s=v07d2Traces.get(w);if(!s?.enabled)return null;
 const context=v07d2Context(e);context.round=e.round+1;
 const group=v07d3StartGroup(w,context,'NATIONAL_ROUND');
 e3dCaptureRoundComposition(w,e,group?.encounter);
 const ids=new Set([e.attackerArmyId,e.defenderArmyId,...(e.attackers||[]).map(m=>m.armyId),...(e.defenders||[]).map(m=>m.armyId)]);
 const war=w.wars.find(x=>x.id===e.warId),countries=new Set([...(war?.sides?.attackers||[]),...(war?.sides?.defenders||[])]);
 const armies=w.armies.filter(a=>ids.has(a.id)||countries.has(a.nationId));
 const gold=new Map([...new Set(armies.map(a=>a.nationId))].map(id=>[id,{gold:w.nations[id].gold,iron:w.nations[id].resources.iron,
  arrears:w.nations[id].military.operationArrears||0}]));
 return {group,gold};
}
function v07d3EndDetail(w,e,detail){const s=v07d2Traces.get(w);if(s?.enabled&&s.current){s.current.endDetail=detail;}}
function v07d2RoundEnd(w,e,before,aborted=false){
 if(!before)return;
 const s=v07d2Traces.get(w),g=before.group;
 const active=w.engagements.some(x=>x.id===e.id),ctx={...v07d2Context(e)};
 for(const [nationId,b] of before.gold){
  const n=w.nations[nationId];v07d2Push(w,{...ctx,kind:'NATION_ROUND',nationId,
   goldBefore:b.gold,goldAfter:n.gold,goldSpent:b.gold-n.gold,ironBefore:b.iron,ironAfter:n.resources.iron,
   ironSpent:b.iron-n.resources.iron,arrearsBefore:b.arrears,arrearsAfter:n.military.operationArrears||0,
   active,accountingScope:'NATION_ROUND_STOCK_DELTA_NOT_EXTRA_CHARGE'});
 }
 const d=g.endDetail||{};
 v07d2Push(w,{...ctx,kind:aborted?'ROUND_ABORTED':active?'ROUND_END':'ENGAGEMENT_END',
  endReason:aborted?'EXCEPTION':active?null:d.endReason||'COMBAT',endConditions:d.endConditions||null,
  winnerSide:d.winnerSide??null,pursuitLosses:d.pursuitLosses??null,prisoners:d.prisoners??null,active,
  accountingScope:'ROUND_TERMINATOR'});
 const r=g.encounter;if(r){r.observedRounds++;if(d.pursuitLosses!=null){r.pursuitLosses+=d.pursuitLosses;s.counters.pursuitLosses+=d.pursuitLosses;}
  if(d.prisoners!=null){r.prisoners+=d.prisoners;s.counters.prisoners+=d.prisoners;}}
 s.counters.rounds++;
 v07d3CommitGroup(w,g,!aborted);
 if(!active&&!aborted)v07d3Summarize(w,ctx,{endReason:d.endReason||'COMBAT',endConditions:d.endConditions||null,winnerSide:d.winnerSide??null,
  pursuitLosses:d.pursuitLosses??null,prisoners:d.prisoners??null});
}
function v07d3LocalBegin(w,f,d){
 const s=v07d2Traces.get(w);if(!s?.enabled)return null;
 const ctx=v07d2Context(null,{f,d});ctx.round=d.engagement.round+1;
 return v07d3StartGroup(w,ctx,'LOCAL_CLASH');
}
function v07d3LocalEnd(w,g,record,aborted=false){
 if(!g)return;const s=v07d2Traces.get(w),ctx={...g.context,round:record?.round??g.context.round};
 v07d2Push(w,{...ctx,kind:aborted?'LOCAL_CLASH_ABORTED':'LOCAL_CLASH_END',endReason:aborted?'EXCEPTION':'SEPARATE_QUARTER_CLASH',
  casualties:record?record.rebelLoss+record.governmentLoss:null,active:!aborted,accountingScope:'CLASH_SUMMARY_DUPLICATE_CASUALTIES'});
 g.encounter&&(g.encounter.observedRounds++);s.counters.localClashes++;
 v07d3CommitGroup(w,g,!aborted);
 if(!aborted)v07d3Summarize(w,ctx,{endReason:'SEPARATE_QUARTER_CLASH',governmentLoss:record.governmentLoss,rebelLoss:record.rebelLoss,
   pursuitLosses:null,prisoners:null});
}
function v07d3PeaceEnd(w,e){
 const s=v07d2Traces.get(w);if(!s?.enabled)return;
 const ctx=v07d2Context(e);v07d2Push(w,{...ctx,kind:'ENGAGEMENT_END',endReason:'PEACE',endConditions:'PEACE',active:false,accountingScope:'TERMINAL_EVENT'});
 v07d3Summarize(w,ctx,{endReason:'PEACE',pursuitLosses:null,prisoners:null});
}
/** V0.7E3B — transaction boundary for one NATIONAL_WAR engagement round.
 * Snapshots only mutable combat domains, never the full world, tiles, populations,
 * research, buildings, routes, or history outside the touched war. No RNG draws.
 * A failed day is NOT automatically safe to resume; failure metadata stays out of saves.
 */
const e3bFailures=new WeakMap(),e3bLastCommit=new WeakMap();
let e3bTestFault=null; // Inert in production; deterministic explicit fault injection in test harness only.
let e3bStage='ENTRY';
function e3bMark(stage,w,e){e3bStage=stage;if(e3bTestFault)e3bTestFault(stage,w,e);}
function e3bLastFailure(w){return e3bFailures.get(w)||null;}
function e3bClone(x){return structuredClone(x);}
function e3bRestoreObject(ref,snapshot){
 for(const key of Object.keys(ref))delete ref[key];
 for(const key of Object.keys(snapshot))ref[key]=snapshot[key];
}
function e3bCombatCheckpoint(w,e){
 const war=w.wars.find(x=>x.id===e.warId);
 const countryIds=new Set([e.attackerNationId,e.defenderNationId,
  ...((war?.sides?.attackers)||[]),...((war?.sides?.defenders)||[])]);
 const armyIds=new Set([e.attackerArmyId,e.defenderArmyId,
  ...(e.attackers||[]).map(m=>m.armyId),...(e.defenders||[]).map(m=>m.armyId)]);
 for(const a of w.armies)if(armyIds.has(a.id)||a.tileId===e.tileId||a.tileId===e.attackerOriginTileId)countryIds.add(a.nationId);
 const armies=w.armies.filter(a=>countryIds.has(a.nationId)||armyIds.has(a.id)||a.tileId===e.tileId||a.tileId===e.attackerOriginTileId);
 const touched=[];
 const add=x=>{if(x&&typeof x==='object')touched.push({ref:x,value:e3bClone(x)});};
 for(const a of armies)add(a);
 for(const id of countryIds)if(Number.isInteger(id))add(w.nations[id]);
 for(const v of w.wars)add(v); // SURRENDER may find a different currently-active war.
 add(e);
 for(const d of w.defenses||[])if(d.tileId===e.tileId)add(d);
 add(w.tiles[e.tileId]);
 add(w.e2Artillery);add(w.c6ArmyHistory);add(w.hAutomaton);add(w.v08fArmor);
 const arrayNames=['armies','engagements','wars','battleHistory','events','characters','pastCommanders','occupations'];
 const arrays=arrayNames.filter(key=>Array.isArray(w[key])).map(key=>({key,ref:w[key],members:w[key].slice()}));
 const scalars=Object.keys(w).filter(k=>w[k]===null||['string','number','boolean','undefined','bigint'].includes(typeof w[k]))
  .map(k=>[k,w[k]]);
 return {touched,arrays,scalars,day:w.dayIndex,rng:w.rngState};
}
function e3bRollbackCombat(w,snapshot){
 for(const t of snapshot.touched)e3bRestoreObject(t.ref,t.value);
 for(const a of snapshot.arrays){w[a.key]=a.ref;a.ref.splice(0,a.ref.length,...a.members);}
 for(const [key,val] of snapshot.scalars)w[key]=val;
 if(w.dayIndex!==snapshot.day||w.rngState!==snapshot.rng)throw Error('E3B rollback day/RNG invariant failed');
}
function e3bObserverCheckpoint(w){
 const s=v07d2Traces.get(w);if(!s?.enabled)return null;
 return {s,groups:s.groups.slice(),completed:s.completed.slice(),
  encounters:[...s.encounters].map(([key,r])=>({key,ref:r,data:e3bClone(r)})),
  counters:{...s.counters},scalar:{rowsCount:s.rowsCount,written:s.written,dropped:s.dropped,
   droppedGroups:s.droppedGroups,omittedGroups:s.omittedGroups,omittedRows:s.omittedRows,
   summaryOverflow:s.summaryOverflow,lastDay:s.lastDay,firstRetainedDay:s.firstRetainedDay,nextGroupId:s.nextGroupId},
  current:s.current,phase:s.phase,trace:s.trace};
}
function e3bObserverAbort(w,snapshot,e,problem,stage,restored){
 if(!e3bRestoreObserver(w,snapshot))return;
 // A failed round contributes ZERO charges, ammo, XP, casualties, or completed rounds.
 v07d2Push(w,{...v07d2Context(e),round:e.round+1,kind:'ROUND_ABORTED',endReason:'EXCEPTION',
  errorStage:stage,errorName:problem.name||'Error',errorMessage:String(problem.message||problem).slice(0,180),
  rollbackStatus:restored?'RESTORED':'UNVERIFIED',accountingScope:'ABORTED_ROLLBACK_DIAGNOSTIC_ONLY',active:true});
}

/** Quarterly uprising clashes are independent rounds; guard their narrower mutable domain too. */
function e3bLocalCheckpoint(w,f,d){
 const nId=f.authorityNationId;
 const touched=[w.uprisings,w.nations[nId],w.e2Artillery,w.c6ArmyHistory,
  ...w.armies.filter(a=>a.nationId===nId)].filter(x=>x&&typeof x==='object').map(ref=>({ref,value:e3bClone(ref)}));
 const scalars=Object.keys(w).filter(k=>w[k]===null||['string','number','boolean','undefined','bigint'].includes(typeof w[k])).map(k=>[k,w[k]]);
 return {touched,arrays:[{key:'armies',ref:w.armies,members:w.armies.slice()},
   {key:'events',ref:w.events,members:w.events.slice()}],scalars,day:w.dayIndex,rng:w.rngState};
}
function e3bRestoreObserver(w,snapshot){
 const s=snapshot?.s;if(!s)return false;
 s.groups=snapshot.groups;s.completed=snapshot.completed;
 for(const r of snapshot.encounters)e3bRestoreObject(r.ref,r.data);
 s.encounters=new Map(snapshot.encounters.map(r=>[r.key,r.ref]));
 s.counters={...snapshot.counters};Object.assign(s,snapshot.scalar);
 s.current=snapshot.current;s.phase=snapshot.phase;s.trace=snapshot.trace;
 return true;
}
function e3bLocalAbort(w,snapshot,ctx,problem,stage,restored){
 if(!e3bRestoreObserver(w,snapshot))return;
 v07d2Push(w,{...ctx,kind:'LOCAL_CLASH_ABORTED',endReason:'EXCEPTION',errorStage:stage,
  errorName:problem.name||'Error',errorMessage:String(problem.message||problem).slice(0,180),
  rollbackStatus:restored?'RESTORED':'UNVERIFIED',accountingScope:'ABORTED_ROLLBACK_DIAGNOSTIC_ONLY',active:true});
}

/** Guard against future mixed infantry/artillery phase-contract regressions. */
function e3bValidatePhaseRecords(records){
 for(const r of records){
  if(r.phase==='ARTILLERY'){
   if(!Array.isArray(r.firing)||!r.lossByArmy||typeof r.lossByArmy!=='object')throw Error('E3B artillery phase contract');
  }else if(!Array.isArray(r.xpParticipation)||r.xpParticipation.some(x=>!Array.isArray(x)||x.length!==2||!Number.isInteger(x[0])||!Number.isFinite(x[1])))
   throw Error('E3B infantry XP participation contract');
 }
}
// V0.7E3C — one bounded combat record per national Army/formation.
// No per-soldier simulation, no RNG and no per-tick scans.
// Existing E3B saves start with ZERO verifiable historical results, not invented wins/kills.
function e3cNewFormationRecord(fromDay=0){return {schema:1,fromDay,wins:0,losses:0,enemyKillsCredited:0,ownBattleDeaths:0,warIds:[]};}
function e3cEnsureFormationRecord(a,fromDay=0){
 if(!a.combatRecord)a.combatRecord=e3cNewFormationRecord(fromDay);
 return a.combatRecord;
}
function e3cMigrateFormationRecords(w){
 for(const a of w.armies){
  // On old saves, only a forward-observation baseline is warranted.
  // Fresh worlds and newly raised formations can report from their creation day.
  if(!a.combatRecord)e3cEnsureFormationRecord(a,w.dayIndex===0?(a.c6CreatedDay??0):w.dayIndex);
 }
}
function e3cRecordWar(a,warId,day){
 const r=e3cEnsureFormationRecord(a,day);
 if(Number.isSafeInteger(warId)&&warId>=0&&!r.warIds.includes(warId))r.warIds.push(warId);
 return r;
}
// Stable largest-remainder attribution: total credited kills = real opponents' casualties.
// In a coalition, credited kills represent the relative combat contribution, NOT
// a proof of which unit inflicted each individual fatal blow.
function e3cAttributeKills(kills,members,weights){
 const participants=members.filter(a=>a).sort((a,b)=>a.id-b.id);
 const result=new Map(participants.map(a=>[a.id,0]));
 if(!participants.length||kills<=0)return result;
 const list=participants.map(a=>({id:a.id,weight:Math.max(0,weights?.get(a.id)||0)}));
 let sum=list.reduce((s,x)=>s+x.weight,0);
 if(sum<=0){for(const x of list)x.weight=1;sum=list.length;}
 const values=list.map(x=>({...x,amount:Math.floor(kills*x.weight/sum),fraction:(kills*x.weight/sum)%1}));
 let remaining=kills-values.reduce((s,x)=>s+x.amount,0);
 values.sort((a,b)=>b.fraction-a.fraction||a.id-b.id);
 for(let i=0;i<remaining;i++)values[i%values.length].amount++;
 for(const x of values)result.set(x.id,x.amount);
 return result;
}
function e3cRecordRound(w,e,membersBySide,lossByArmy,weights={}){
 // Preserve *all* actual participants, including formations that later retreat.
 // Engagement side arrays themselves hold only currently engaged armies.
 e.e3cParticipants??={attackers:[],defenders:[]};
 for(const side of ['attackers','defenders']){
  const members=(membersBySide[side]||[]).map(x=>typeof x==='object'&&x.id!==undefined?x:w.armies.find(a=>a.id===x)).filter(Boolean);
  for(const a of members)if(!e.e3cParticipants[side].includes(a.id))e.e3cParticipants[side].push(a.id);
  const enemies=(membersBySide[side==='attackers'?'defenders':'attackers']||[])
    .map(x=>typeof x==='object'&&x.id!==undefined?x:w.armies.find(a=>a.id===x)).filter(Boolean);
  const opponentDeaths=enemies.reduce((sum,a)=>sum+Math.max(0,lossByArmy[a.id]||0),0);
  const kills=e3cAttributeKills(opponentDeaths,members,weights[side]);
  for(const a of members){
   const r=e3cRecordWar(a,e.warId,w.dayIndex);
   r.enemyKillsCredited+=kills.get(a.id)||0;
   r.ownBattleDeaths+=Math.max(0,lossByArmy[a.id]||0);
  }
 }
}
function e3cRecordPursuit(w,winner,loser,killed,warId){
 if(!killed)return;
 if(winner)e3cRecordWar(winner,warId,w.dayIndex).enemyKillsCredited+=killed;
 if(loser)e3cRecordWar(loser,warId,w.dayIndex).ownBattleDeaths+=killed;
}
function e3cRecordOutcome(w,e,winnerSide){
 for(const side of ['attackers','defenders']){
  const ids=new Set([...(e.e3cParticipants?.[side]||[]),(e[side]||[]).map(m=>m.armyId)].flat());
  ids.add(side==='attackers'?e.attackerArmyId:e.defenderArmyId);
  for(const id of ids){
   // A formation eliminated during the final round may already have moved to
   // the bounded C6 end-of-life ledger. Preserve its last result if retained.
   const a=w.armies.find(v=>v.id===id)||w.c6ArmyHistory?.entries?.find(v=>v.id===id&&v.combatRecord);
   if(!a)continue;
   const r=e3cRecordWar(a,e.warId,w.dayIndex);
   if(side===winnerSide)r.wins++;else r.losses++;
  }
 }
}
function e3cValidateFormationRecords(w){
 const valid=(a,r)=>{
  if(!r)return true; // legacy/test fixtures created outside the migration adapter.
  if(r.schema!==1||!Number.isSafeInteger(r.fromDay)||r.fromDay<0||r.fromDay>w.dayIndex||
    ['wins','losses','enemyKillsCredited','ownBattleDeaths'].some(k=>!Number.isSafeInteger(r[k])||r[k]<0)||
    !Array.isArray(r.warIds)||r.warIds.length>10000||
    r.warIds.some(id=>!Number.isSafeInteger(id)||id<0)||new Set(r.warIds).size!==r.warIds.length)return false;
  return true;
 };
 return w.armies.every(a=>valid(a,a.combatRecord))&&
   (w.c6ArmyHistory?.entries||[]).every(h=>valid(h,h.combatRecord));
}
// --- src/sim/combat.js ---
/** V0.1D: cohort-based persistent combat, line assignment and reserves. No soldier Persons. */




const battleClamp=(x,a,b)=>Math.max(a,Math.min(b,x));
/** V0.7D: sustained shot power is a multiplier on the unchanged opening factor. */
const V07D_SUSTAINED=Object.freeze({bow:.60,longbow:.525,crossbow:.40,matchlock:.35,flintlock:.42,rifled_musket:.45,machine_gun:.95});
const V07E1_FIREARMS=new Set(['matchlock','flintlock','rifled_musket','machine_gun']);
function v07dRangedFactor(weapon,weaponId,ammoReady=true){
  return weapon.opening*(V07D_SUSTAINED[weaponId]||0)*(V07E1_FIREARMS.has(weaponId)&&!ammoReady?0:1);
}
function v07dFrontStable(a,initialFront,broken){
  return !broken&&deployedManpower(a,'front')>Math.max(1,Math.floor(Math.max(1,initialFront)*.40));
}
const manpower=army=>army.units.reduce((s,u)=>s+u.manpower,0);
const deployedManpower=(army,position)=>{
  const ids=new Set(army.deployment[position]||[]);return army.units.reduce((s,u)=>s+(ids.has(u.id)?u.manpower:0),0);
};
/** Non-opponent, non-terrain reference power for atlas labels; never used to resolve attacks. */
function getArmyBasePower(world,army){
  if(!army)return 0;
  const cmd=world.characters.find(c=>c.id===army.commanderId&&c.alive);
  const morale=.55+army.morale/180;
  let total=0;
  for(const u of army.units){
    if(!u.manpower)continue;
    const type=UNIT_TYPES[u.typeId],weapon=WEAPONS[u.weaponId];
    if(!type||!weapon)continue;
    const lane=army.deployment.front.includes(u.id)?'front':army.deployment.rear.includes(u.id)?'rear':army.deployment.back?.includes(u.id)?'back':'reserve';
    const value=lane==='front'?(type.melee*weapon.melee+(type.contact+weapon.contact)*.5)/1.5:
      lane==='rear'?weapon.opening*.65:lane==='back'?0:type.melee*weapon.melee*.18;
    total+=c3CombatMen(u,true)*c3CombatScale(u,true)*type.power*value*(.75+25/220);
  }
  const tankVisiblePower=v08fAlive(world,army).reduce((sum,t)=>sum+Math.round((V08F_SPEC.opening+V08F_SPEC.sustained)/2*(v08fEscort(army)>=30?1:v08fEscort(army)>0?.8:.55)*(t.hp>70?1:t.hp>35?.85:.4)),0);
  return Math.max(0,Math.round(total*morale*(1+((cmd?.command||50)-50)/270)*(army.supplyMultiplier??(army.supplied?1:.78))*(1+techBonus(world,army.nationId,'combatPower'))*(1+(army.supplied?techBonus(world,army.nationId,'supplyPower'):0))*(1+b4aPowerBonus(army))+hEffective(world,army)*h2aDesign(H_BLUEPRINT.id).opening*.8+tankVisiblePower));
}
function randCombat(world){
  let v=world.rngState|0;v^=v<<13;v^=v>>>17;v^=v<<5;
  world.rngState=(v>>>0)||0x6d2b79f5;
  return world.rngState/4294967296;
}
const commander=(w,a)=>w.characters.find(c=>c.id===a.commanderId&&c.alive);
/** Real V0.7C matchlock volley ammunition: consume treasury + iron once per actual OPENING.
 * If unfunded, no shots fire; prevents free new-generation gun power. */
function v07cPayMatchlockVolley(w,army,men,warId,composition=null){
  if(men<=0)return false;
  const n=w.nations[army.nationId];
  const before=v07d2Traces.get(w)?.enabled?{gold:n?.gold??0,iron:n?.resources.iron??0}:null;
  if(!n?.active){v07d2AmmoResult(w,army,men,warId,before,false,'INACTIVE_NATION',composition);return false;}
  // Machine gunners cost double rifle ammunition per shooter, counted once per paid phase.
  const billableMen=men+Math.max(0,composition?.machineGunMen||0);
  const iron=Math.max(1,Math.ceil(billableMen/40)),gold=Math.max(1,Math.ceil(billableMen*.25));
  if(n.resources.iron<iron||n.gold<gold){const reason=n.resources.iron<iron?(n.gold<gold?'INSUFFICIENT_BOTH':'INSUFFICIENT_IRON'):'INSUFFICIENT_GOLD';v07d2AmmoResult(w,army,men,warId,before,false,reason,composition);return false;}
  n.resources.iron-=iron;
  chargeMilitaryOperation(w,n.id,gold,warId,composition?.flintlockMen||composition?.rifleMen||composition?.machineGunMen?'firearm_ammunition':'matchlock_ammunition');
  v07d2AmmoResult(w,army,men,warId,before,true,'PAID',composition);
  return true;
}
function v07cVolleyCheck(w,army,allocation,warId){
  const armed=new Map(army.units.filter(u=>V07E1_FIREARMS.has(u.weaponId)).map(u=>[u.id,u.weaponId]));
  const composition={matchlockMen:0,flintlockMen:0,rifleMen:0,machineGunMen:0};
  for(const item of allocation){if(item.armyId!==army.id)continue;
    const weaponId=armed.get(item.unitId);if(weaponId==='matchlock')composition.matchlockMen+=item.men;
    if(weaponId==='flintlock')composition.flintlockMen+=item.men;
    if(weaponId==='rifled_musket')composition.rifleMen+=item.men;
    if(weaponId==='machine_gun')composition.machineGunMen+=item.men;
  }
  const men=composition.matchlockMen+composition.flintlockMen+composition.rifleMen+composition.machineGunMen;
  return !men||v07cPayMatchlockVolley(w,army,men,warId,composition);
}

/** G4 Attack channel definition.  Phase is WHEN; channel is HOW.
 * The physical strike and firearm shot contribute distinct power and armor penetration.
 * FIREARM_SHOT requires a paid per-phase volley; bayonets do not need ammunition.
 */
function g4WeaponChannels(u,phase,ammoReady=true,frontStable=true){
 const type=UNIT_TYPES[u.typeId],weapon=WEAPONS[u.weaponId];
 if(!type||!weapon)return [];
 const gun=V07E1_FIREARMS.has(u.weaponId);
 const pen=G4_FIREARM_PENETRATION[u.weaponId]||0;
 if(phase==='OPENING')return gun?
   (ammoReady?[{kind:'FIREARM_SHOT',pen,factor:weapon.opening}]:[]):
   [{kind:'PROJECTILE',pen:0,factor:weapon.opening}];
 if(phase==='SUSTAINED')return !frontStable?[]:gun?
   (ammoReady?[{kind:'FIREARM_SHOT',pen,factor:v07dRangedFactor(weapon,u.weaponId,true)}]:[]):
   [{kind:'PROJECTILE',pen:0,factor:v07dRangedFactor(weapon,u.weaponId,true)}];
 if(phase==='CONTACT')return [{kind:'PHYSICAL_MELEE',pen:0,factor:(type.contact+weapon.contact)*.55}];
 const channels=[{kind:'PHYSICAL_MELEE',pen:0,factor:type.melee*weapon.melee*(G4_PHYSICAL_MELEE_FACTOR[u.typeId]||1)}];
 if(gun&&ammoReady)channels.push({kind:'FIREARM_SHOT',pen,factor:weapon.opening*(G4_CLOSE_SHOT_FACTOR[u.weaponId]||0)});
 return channels;
}
function g4AddChannel(out,kind,pen,power){
 if(!out||power<=0)return;
 const key=kind+'|'+pen;
 out.set(key,(out.get(key)||0)+power);
}
function g4ArmorMultiplierValue(armor,penetration=0){
 return 100/(100+Math.max(0,Math.max(0,armor)-Math.max(0,penetration)));
}
function g4ArmorMultiplier(armorId,penetration=0){
 return g4ArmorMultiplierValue(ARMORS[armorId]?.armor||0,penetration);
}
function g4WeightedArmorMultiplier(armorId,channels){
 const values=channels instanceof Map?[...channels]:Object.entries(channels||{});
 const total=values.reduce((sum,[,power])=>sum+power,0);
 if(total<=0)return g4ArmorMultiplier(armorId,0);
 return values.reduce((sum,[key,power])=>sum+power*g4ArmorMultiplier(armorId,Number(key.split('|')[1])||0),0)/total;
}
function g4SingleCloseAllocation(army,defending){
 const ids=new Set(army.deployment.front||[]);
 return army.units.filter(u=>ids.has(u.id)&&u.manpower>0).map(u=>({armyId:army.id,unitId:u.id,men:c3CombatMen(u,defending)}));
}
function linePower(world,army,phase,defending,ground,lineBroken,ammoReady=true,frontStable=true,channelOut=null,suppressionRate=0){
  const cmd=commander(world,army),morale=.55+army.morale/180;
  const positions=phase==='OPENING'?['front','rear']:phase==='SUSTAINED'?['rear']:['front'];
  const active=new Set(positions.flatMap(pos=>army.deployment[pos]));
  let base=0;const localChannels=new Map();
  for(const u of army.units){
    if(!active.has(u.id)||!u.manpower)continue;
    const type=UNIT_TYPES[u.typeId],weapon=WEAPONS[u.weaponId];
    const parts=G4_COMBAT_ENABLED?g4WeaponChannels(u,phase,ammoReady,frontStable):null;
    const factor=parts?parts.reduce((v,x)=>v+x.factor,0):
      phase==='OPENING'?(V07E1_FIREARMS.has(u.weaponId)&&!ammoReady?0:weapon.opening):phase==='SUSTAINED'?(frontStable?v07dRangedFactor(weapon,u.weaponId,ammoReady):0):phase==='CONTACT'?(type.contact+weapon.contact)*.55:type.melee*weapon.melee;
    const unitScale=c3CombatMen(u,defending)*c3CombatScale(u,defending)*type.power*(.75+25/220);
    base+=unitScale*factor;
    if(channelOut&&parts)for(const part of parts)g4AddChannel(localChannels,part.kind,part.pen,unitScale*part.factor);
  }
  const terrain=defending?(ground==='mountain'?1.38:ground==='forest'?1.16:ground==='rock'?1.1:1.05):1;
  const command=1+((cmd?.command||50)-50)/270+((defending?cmd?.defense:cmd?.attack)||50)/420;
  // No dormant reserve contributes attack power; a broken line loses cohesion.
  let result=Math.max(0,base*morale*terrain*command*(army.supplyMultiplier??(army.supplied?1:.78))*(1+techBonus(world,army.nationId,'combatPower'))*(1+(army.supplied?techBonus(world,army.nationId,'supplyPower'):0))*(lineBroken?.67:1)*(1+b4aPowerBonus(army)));
  if(suppressionRate>0)result*=1-suppressionRate;
  if(channelOut&&G4_COMBAT_ENABLED&&base>0)for(const [key,value] of localChannels)channelOut.set(key,(channelOut.get(key)||0)+value*result/base);
  return result;
}
function applyLosses(army,loss,phase,politicalDay=null,world=null,attackChannels=null){
  if(loss<=0)return 0;
  // Front protects rear. Reserves are the last to take casualties, not a second active front.
  const priority=['front','rear','back','reserve'];
  const units=new Map(army.units.map(u=>[u.id,u]));
  // A unit's armor mitigates cohort casualties; no per-soldier objects or equipment inventory.
  const frontline=army.deployment.front.map(id=>units.get(id)).filter(u=>u?.manpower);
  const frontPeople=frontline.reduce((sum,u)=>sum+u.manpower,0);
  const mitigated=frontPeople?frontline.reduce((sum,u)=>sum+u.manpower*(G4_COMBAT_ENABLED?g4WeightedArmorMultiplier(u.armorId,attackChannels):1-(ARMORS[u.armorId]?.protection||0)),0)/frontPeople:1;
  loss=Math.max(1,Math.round(loss*mitigated));
  let remaining=loss,removed=0;
  for(const pos of priority)for(const id of (army.deployment[pos]||[])){
    const u=units.get(id);if(!u||remaining<=0)break;
    const take=Math.min(u.manpower,remaining);e2DamageArtilleryGuns(army,u,take,world);c3TakeLoss(u,take,'BATTLE',politicalDay);remaining-=take;removed+=take;
  }
  army.morale=battleClamp(Math.round(army.morale-removed/Math.max(8,manpower(army)+removed)*105-(phase==='MELEE'?5:2)),0,100);
  return removed;
}
function writeBattleEvent(world,text){world.events.push({dayIndex:world.dayIndex,text,kind:'battle'});if(world.events.length>180)world.events.shift();}
function adjacent(id,size,height=size){
  const x=id%size,y=Math.floor(id/size),out=[];
if(x>0)out.push(id-1);if(x<size-1)out.push(id+1);
  if(y>0)out.push(id-size);if(y<height-1)out.push(id+size);
  return out;
}
function blockedByEnemies(world,nationId,id){
  return world.armies.some(a=>a.tileId===id&&a.nationId!==nationId&&!allyAccess(world,nationId,a.nationId)&&hCombatPresence(world,a)>0&&a.status!=='DESTROYED');
}
/** Repatriation permits only expressly named former belligerents/allies, not every foreign nation.
 * Military-safe checks still reject occupied terrain and hostile armies. */
function retreatTilePermitted(world,army,tile,{repatriation=false}={}){
  if(tile.ownerId===null||tile.ownerId===army.nationId||tile.occupiedBy===army.nationId)return true;
  if(allyAccess(world,army.nationId,tile.ownerId))return true;
  return Boolean((repatriation||army.repatriation?.active)&&army.repatriation?.permittedNationIds?.includes(tile.ownerId));
}
/** A permitted withdrawal cannot be blocked by a peaceful former host's stationary garrison.
 * Hostile troops still block the corridor, and no other nation's soldiers become passable. */
function retreatBlockedByArmies(world,army,id){
  return world.armies.some(a=>a.tileId===id&&a.nationId!==army.nationId&&hCombatPresence(world,a)>0&&a.status!=='DESTROYED'&&
    !allyAccess(world,army.nationId,a.nationId)&&
    !(army.repatriation?.active&&army.repatriation.permittedNationIds.includes(a.nationId)&&!warAgainst(world,army.nationId,a.nationId)));
}
/** Route to a safe, owned settlement. Temporary passage must remain valid on rerouting. */
function planRetreat(world,army,{repatriation=false,excludeTileId=null}={}){
  const start=army.tileId,parents=new Int32Array(world.tiles.length).fill(-1),queue=[start];parents[start]=start;
  const safeCore=new Set(world.settlements.filter(s=>s.ownerId===army.nationId).map(s=>s.coreTileId));
  let destination=null;
  for(let i=0;i<queue.length;i++){
    const id=queue[i],tile=world.tiles[id];
    if(id!==excludeTileId&&safeCore.has(id)&&tile.occupiedBy===null&&!retreatBlockedByArmies(world,army,id)){
      destination=id;break;
    }
    for(const nb of neighborsMilitary8(id,world.size,world.height)){
      if(parents[nb]!==-1||!militaryStepPermitted(world,id,nb,army.nationId))continue;
      const t=world.tiles[nb];
      if(!TERRAINS[t.terrain].passable||t.occupiedBy!==null&&t.occupiedBy!==army.nationId||retreatBlockedByArmies(world,army,nb))continue;
      if(!retreatTilePermitted(world,army,t,{repatriation}))continue;
      parents[nb]=id;queue.push(nb);
    }
  }
  if(destination===null)return null;
  const path=[destination];let cur=destination;
  while(cur!==start){cur=parents[cur];path.push(cur);}
  return path.reverse();
}
function startRetreat(world,army,initialTroops,battleTile){
  army.engagementId=null;army.order=null;
  if(!hCombatPresence(world,army)){army.status='DESTROYED';return;}
  // F3F: routed troops may defend and receive real reinforcements at home,
  // but cannot resume offensive operations before regaining minimum readiness.
  army.f3fRout={baseline:Math.max(1,initialTroops),minimumMen:manpower(army)>0?Math.max(F3F_RALLY_MIN_MEN,Math.ceil(initialTroops*F3F_RALLY_FRACTION)):Math.max(1,Math.ceil(initialTroops*F3F_RALLY_FRACTION)),sinceDay:world.dayIndex};
  const lossRatio=1-hCombatPresence(world,army)/Math.max(1,initialTroops);
  const regroupDays=battleClamp(Math.round(18+lossRatio*38+(100-army.morale)*.23),18,78);
  const path=planRetreat(world,army,{excludeTileId:army.tileId===battleTile?battleTile:null});
  if(!path){army.status='TRAPPED';army.regroupDays=regroupDays;army.retreatPath=[];army.nextMoveDay=world.dayIndex+10;return;}
  army.retreatPath=path.slice(1);army.regroupDays=regroupDays;
  army.status='RETREATING';army.nextMoveDay=world.dayIndex+3;
  // Combatants cannot share a freshly conquered battlefield: the retreating defender
  // must make exactly ONE legal adjacent step, never teleport across the map.
  if(army.tileId===battleTile&&army.retreatPath.length){
    army.tileId=army.retreatPath.shift();
  }
  if(!army.retreatPath.length){army.status='REGROUP';army.regroupUntil=world.dayIndex+regroupDays;}
  army.morale=battleClamp(army.morale,5,100);
}
// F3H1: Keep 1:1 combat byte-for-byte in the legacy round branch. Additional armies
// participate only when physically assembled on the appropriate side's tile.
// V0.8H: armored-front support is a pure, derived stability value; NO troop counts,
// combat damage budgets, vehicle inventory, crew pools or RNG are modified here.
function v08hArmoredFrontSupport(w,a){
 if(!w||!a?.v08fTankIds?.length)return 0;
 let result=0;
 for(const t of v08fTanks(w,a)){
  if(!v08fReady(w,a,t))continue;
  result+=t.hp>=71?25:t.hp>=36?15:5;
 }
 return result;
}
function v08hFront(w,a,m=null){
 const baseline=hFrontCount(w,a);
 return baseline+(m?.v08hFrontVersion===1?v08hArmoredFrontSupport(w,a):0);
}
function v08hFrontThreshold(m){return Math.max(1,m?.initialFront||1)*.40;}
function v08hStable(w,a,m){
 if(m?.frontBroken)return false;
 const baseline=Math.max(1,m?.initialFront||1);
 // The no-tank case retains the old SUSTAINED firing formula exactly.
 const oldThreshold=Math.max(1,Math.floor(baseline*.40));
 const current=v08hFront(w,a,m);
 if(current<=oldThreshold)return false;
 // A tank cannot independently keep the infantry rear fire corridor open.
 // This gate is applied only to H8 armored formations; dormant/no-tank worlds are unchanged.
 if(m?.v08hFrontVersion===1&&m.v08hInitialTankSupport>0&&deployedManpower(a,'front')<=0)return false;
 return true;
}
function v08hFrontStats(w,a){
 const humans=deployedManpower(a,'front');
 const machines=hPositionQty(w,a,'front',true);
 const armor=v08hArmoredFrontSupport(w,a);
 return {humans,machines,armor,effective:humans+machines+armor,readyTanks:v08fAlive(w,a).length};
}
// V0.8I · Machine-gun suppression. A persisted engagement-only, deterministic
// pressure model. No additional RNG, casualties, inventory, or battle ammo.
// Suppression reduces HUMAN CONTACT/MELEE power only; vehicles, H-machines
// and artillery have separate attack paths. Maximum effect 25%.
const V08I_MAX_SUPPRESS=.25;
const V08I_ATTACK_BUILD=.35;
const V08I_FADE=.45;
function v08iState(e){
 if(!e.v08iSuppression)e.v08iSuppression={schema:1,attackPressure:0,defensePressure:0};
 return e.v08iSuppression;
}
function v08iMgPaid(army,allocation,paid){
 if(!paid)return 0;
 const ids=new Set(army.units.filter(u=>u.typeId==='machine_gunner'&&u.weaponId==='machine_gun'&&u.manpower>0).map(u=>u.id));
 return allocation.reduce((v,x)=>v+(x.armyId===army.id&&ids.has(x.unitId)?x.men:0),0);
}
function v08iMultiPaid(w,e,side,allocation,paid){
 let result=0;
 for(const m of h1Live(w,e,side)){
  const a=h1Army(w,m.armyId);
  result+=v08iMgPaid(a,allocation,paid.get(m.armyId)?.human!==false);
 }
 return result;
}
function v08iFire(e,phase,mgAttack,mgDefense,attackFront,defenseFront){
 const state=v08iState(e);
 if(phase==='OPENING'||phase==='SUSTAINED'){
  // Front exposure is measured BEFORE this phase's casualties are applied.
  const intensityA=Math.min(1,mgAttack/Math.max(1,defenseFront)/.25);
  const intensityB=Math.min(1,mgDefense/Math.max(1,attackFront)/.25);
  // Opening attacker fire establishes targeting but not an immediate suppression bonus.
  if(phase==='SUSTAINED'){
   state.attackPressure=mgAttack>0?Math.min(intensityA,state.attackPressure+V08I_ATTACK_BUILD*intensityA):state.attackPressure*V08I_FADE;
  }
  if(phase==='OPENING'||phase==='SUSTAINED'){
   state.defensePressure=mgDefense>0?intensityB:state.defensePressure*V08I_FADE;
  }
 }
 return {mgAttack,mgDefense,attackPressure:state.attackPressure,defensePressure:state.defensePressure,
   // Pressure is fired by the opposite side. Delay is already reflected in pressure.
   incomingA:(phase==='CONTACT'||phase==='MELEE')?V08I_MAX_SUPPRESS*state.defensePressure:0,
   incomingB:(phase==='CONTACT'||phase==='MELEE')?V08I_MAX_SUPPRESS*state.attackPressure:0};
}
function v08iPhase(e,phase,mgAttack,mgDefense,frontA,frontB){
 // Laboratory-only switch: never set by the main game; toggles this new rule
 // without requiring a second or reimplemented battle engine.
 if(e.v08iLabSuppressionOff===true)return {mgAttack,mgDefense,attackPressure:0,defensePressure:0,incomingA:0,incomingB:0};
 // No firing => no suppression, but old engagements acquire state on first use.
 return v08iFire(e,phase,mgAttack,mgDefense,frontA,frontB);
}
function v08iPhaseTelemetry(state){return {
 v08iMgFiredA:state.mgAttack,v08iMgFiredB:state.mgDefense,
 v08iPressureA:+state.attackPressure.toFixed(4),v08iPressureB:+state.defensePressure.toFixed(4),
 v08iIncomingA:+(state.incomingA*100).toFixed(2),v08iIncomingB:+(state.incomingB*100).toFixed(2)
};}

const H1_FRONT_CAP={plain:350,grass:350,forest:250,rock:220,mountain:180};
const h1Army=(w,id)=>w.armies.find(a=>a.id===id);
function h1Member(w,a,joinedRound=0){
 hPromoteMachineFront(w,a);
 const armor=v08hArmoredFrontSupport(w,a);
 return {armyId:a.id,joinedDay:w.dayIndex,joinedRound,initialManpower:hCombatPresence(w,a),
   initialFront:hFrontCount(w,a)+armor,v08hFrontVersion:1,v08hInitialTankSupport:armor,frontBroken:false};
}
function h1EnsureMembers(w,e){
  if(!Array.isArray(e.attackers))e.attackers=[{armyId:e.attackerArmyId,joinedDay:e.startedDay,initialManpower:e.initialManpowerA,initialFront:e.initialFrontA,frontBroken:!!e.frontBrokenA,...(e.v08hFrontVersion===1?{v08hFrontVersion:1,v08hInitialTankSupport:e.v08hInitialTankSupportA||0}:{})}];
  if(!Array.isArray(e.defenders))e.defenders=[{armyId:e.defenderArmyId,joinedDay:e.startedDay,initialManpower:e.initialManpowerB,initialFront:e.initialFrontB,frontBroken:!!e.frontBrokenB,...(e.v08hFrontVersion===1?{v08hFrontVersion:1,v08hInitialTankSupport:e.v08hInitialTankSupportB||0}:{})}];
  e.attackerOriginTileId??=h1Army(w,e.attackerArmyId)?.tileId??e.tileId;
  e.attackerNationId??=h1Army(w,e.attackerArmyId)?.nationId;
  e.defenderNationId??=h1Army(w,e.defenderArmyId)?.nationId;
  const war=w.wars.find(x=>x.id===e.warId);
  e.attackerWarSide??=war?warSide(war,e.attackerNationId):null;
  e.defenderWarSide??=war?warSide(war,e.defenderNationId):null;
  e.allAttackerArmyIds??=e.attackers.map(m=>m.armyId);
  e.allDefenderArmyIds??=e.defenders.map(m=>m.armyId);
  e.perArmyLosses??={};
  // Pre-E2 saves have no artillery; preserve any existing progress and never
  // interpret a calendar-day difference as an artillery round difference.
  for(const side of ['attackers','defenders'])for(const m of e[side])m.joinedRound??=0;
  return e;
}
function h1Eligible(w,war,e,a,side){
  const tileId=side==='attackers'?e.attackerOriginTileId:e.tileId;
  const legalAttack=side!=='attackers'||e.attackerOriginTileId===e.tileId||
    (neighbors4(e.attackerOriginTileId,w.size,w.height).includes(e.tileId)&&
      canPassMilitaryTile(w,a.nationId,w.tiles[e.tileId])&&
      !fortLineBlocks(w,e.tileId,a.nationId)&&
      !hostileFortUncaptured(w,e.attackerOriginTileId,a.nationId));
  return legalAttack&&a.tileId===tileId&&a.status==='READY'&&a.engagementId===null&&hCombatPresence(w,a)>0&&
    warSide(war,a.nationId)===(side==='attackers'?e.attackerWarSide:e.defenderWarSide)&&
    (side==='defenders'||armyOffensiveReady(w,a))&&
    (side!=='defenders'||armyOffensiveReady(w,a)||isFriendlyRecoveryTile(w,a,w.tiles[tileId]));
}
function h1Join(w,e,a,side){
  const list=e[side];
  if(list.some(m=>m.armyId===a.id)||a.engagementId!==null)return false;
  list.push(h1Member(w,a,e.round));list.sort((x,y)=>x.armyId-y.armyId);
  const all=side==='attackers'?e.allAttackerArmyIds:e.allDefenderArmyIds;
  if(!all.includes(a.id))all.push(a.id);
  a.engagementId=e.id;a.status='ENGAGED';a.order=null;a.needsOrders=false;
  w.changeSeq++;return true;
}
function h1Gather(w,e){
  h1EnsureMembers(w,e);
  const war=w.wars.find(v=>v.id===e.warId);
  if(!war)return;
  // Only READY, uncommitted forces already standing at the exact source/defense tile.
  for(const side of ['attackers','defenders']){
    const tid=side==='attackers'?e.attackerOriginTileId:e.tileId;
    for(const a of w.armies.filter(a=>a.tileId===tid).sort((a,b)=>a.id-b.id)){
      if(h1Eligible(w,war,e,a,side))h1Join(w,e,a,side);
    }
  }
}
function h1Live(w,e,side){return e[side].filter(m=>{const a=h1Army(w,m.armyId);return a&&a.engagementId===e.id&&a.status==='ENGAGED'&&hCombatPresence(w,a)>0;});}
// Largest remainder, stable by army and unit IDs, and never RNG-consuming.
function h1Allocate(items,cap){
  const total=items.reduce((v,x)=>v+x.count,0),budget=Math.min(cap,total);
  if(!total||!budget)return items.map(x=>({...x,men:0}));
  const result=items.map(x=>({...x,men:Math.floor(budget*x.count/total),remainder:budget*x.count%total}));
  let left=budget-result.reduce((v,x)=>v+x.men,0);
  const byFraction=[...result].sort((a,b)=>b.remainder-a.remainder||a.armyId-b.armyId||a.unitId-b.unitId);
  for(let i=0;i<left;i++)byFraction[i].men++;
  return result;
}
function h1Deployment(w,e,side,phase){
  const members=h1Live(w,e,side);
  const shooters=phase==='SUSTAINED'?members.filter(m=>{
    const a=h1Army(w,m.armyId);
    return v08hStable(w,a,m);
  }):members;
  return h1DeploymentFromArmies(w,shooters.map(m=>h1Army(w,m.armyId)),phase,side==='defenders',e.tileId);
}
function h1DeploymentFromArmies(w,armies,phase,defending,tileId){
  const eligible=[];
  for(const a of armies){
    const positions=phase==='OPENING'?['front','rear']:phase==='SUSTAINED'||phase==='TARGET_REAR'?['rear']:['front'];
    const ids=new Set(positions.flatMap(pos=>a.deployment[pos]));
    for(const u of a.units)if(ids.has(u.id)&&u.manpower>0&&
        (!['OPENING','SUSTAINED'].includes(phase)||(WEAPONS[u.weaponId]?.opening||0)>0))
      eligible.push({armyId:a.id,unitId:u.id,count:c3CombatMen(u,defending),
        abilityKey:JSON.stringify([u.typeId,u.weaponId,u.armorId,u.training])});
    hAddTargets(w,a,eligible,phase);
  }
  const frontCap=H1_FRONT_CAP[w.tiles[tileId]?.terrain]||350;
  const cap=['OPENING','SUSTAINED'].includes(phase)?Math.max(150,Math.ceil(frontCap*.7)):frontCap;
  // Keep *aggregate* weapon/training proportions stable when identical soldiers
  // are repartitioned. The second pass respects every individual UnitGroup.
  const groups=new Map();
  for(const item of eligible){if(!groups.has(item.abilityKey))groups.set(item.abilityKey,[]);groups.get(item.abilityKey).push(item);}
  const groupOrder=[...groups.keys()].sort();
  const quotas=h1Allocate(groupOrder.map((key,i)=>({armyId:i,unitId:i,count:groups.get(key).reduce((v,x)=>v+x.count,0)})),cap);
  return quotas.flatMap((quota,i)=>h1Allocate(groups.get(groupOrder[i]),quota.men));
}
function h1Power(w,army,phase,defending,terrain,broken,alloc,ammoReady=true,channelOut=null,machineAmmo=true,suppressionRate=0){
  const cmd=commander(w,army),morale=.55+army.morale/180;
  const troops=new Map(alloc.filter(x=>x.armyId===army.id).map(x=>[x.unitId,x.men]));
  let base=0;const localChannels=new Map();
  for(const u of army.units){
    const count=troops.get(u.id)||0;if(!count)continue;
    const type=UNIT_TYPES[u.typeId],weapon=WEAPONS[u.weaponId];
    const parts=G4_COMBAT_ENABLED?g4WeaponChannels(u,phase,ammoReady,true):null;
    const factor=parts?parts.reduce((v,x)=>v+x.factor,0):
      phase==='OPENING'?(V07E1_FIREARMS.has(u.weaponId)&&!ammoReady?0:weapon.opening):phase==='SUSTAINED'?v07dRangedFactor(weapon,u.weaponId,ammoReady):phase==='CONTACT'?(type.contact+weapon.contact)*.55:type.melee*weapon.melee;
    const unitScale=count*type.power*c3CombatScale(u,defending)*(.75+25/220);
    base+=unitScale*factor;
    if(channelOut&&parts)for(const part of parts)g4AddChannel(localChannels,part.kind,part.pen,unitScale*part.factor);
  }
  const ground=defending?(terrain==='mountain'?1.38:terrain==='forest'?1.16:terrain==='rock'?1.1:1.05):1;
  const command=1+((cmd?.command||50)-50)/270+((defending?cmd?.defense:cmd?.attack)||50)/420;
  let result=Math.max(0,base*morale*ground*command*(army.supplyMultiplier??(army.supplied?1:.78))*(1+techBonus(w,army.nationId,'combatPower'))*(1+(army.supplied?techBonus(w,army.nationId,'supplyPower'):0))*(broken?.67:1)*(1+b4aPowerBonus(army)));
  if(suppressionRate>0)result*=1-suppressionRate;
  if(channelOut&&G4_COMBAT_ENABLED&&base>0)for(const [key,value] of localChannels)channelOut.set(key,(channelOut.get(key)||0)+value*result/base);
  return result+hMachineChannels(w,army,phase,defending,terrain,broken,channelOut,machineAmmo,alloc);
}
/** F2C2C2: OPENING and SUSTAINED fire hits exposed enemy troops, not just enemy shooters.
 * Real front-line combatants protect rear and reserves. Only when the ENTIRE
 * side has no eligible front-line exposure can rear troops be hit.
 * This is a pure allocation and does not draw RNG or mutate troops.
 */
function v07f2c2c2RangedTargets(w,e,side){
  const front=h1Deployment(w,e,side,'CONTACT');
  if(front.some(x=>x.men>0))return front;
  const armies=h1Live(w,e,side).map(m=>h1Army(w,m.armyId));
  return h1DeploymentFromArmies(w,armies,'TARGET_REAR',side==='defenders',e.tileId);
}
// F3H1A: independent formations and real reserves are retained; the rally bonus
// is earned in proportion to actually committed reserves, once per formation.
function h1Reinforce(e,m,a,w=null){
  const baseline=Math.max(1,m.initialFront||1),threshold=baseline*.40;
  let added=0,broken=false;
  const currentFront=()=>w?v08hFront(w,a,m):deployedManpower(a,'front');
  if(currentFront()<=threshold&&deployedManpower(a,'reserve')>0){
    for(const id of a.deployment.reserve.slice()){
      const unit=a.units.find(u=>u.id===id);if(!unit?.manpower)continue;
      a.deployment.reserve=a.deployment.reserve.filter(x=>x!==id);a.deployment.front.push(id);
      added+=unit.manpower;
      if(currentFront()>threshold)break;
    }
    if(added){
      const granted=m.h1aRallyCredit||0;
      const possible=Math.min(3-granted,3*added/Math.max(1,(m.initialManpower||1)*.10));
      if(possible>0){m.h1aRallyCredit=granted+possible;a.morale=battleClamp(a.morale+possible,0,100);}
    }
  }
  const machineAdvanced=w?hPromoteMachineFront(w,a):0;
  if(currentFront()<=threshold&&deployedManpower(a,'reserve')===0&&!m.frontBroken){
    m.frontBroken=true;a.morale=battleClamp(a.morale-10,0,100);broken=true;
  }
  return {added,broken,machineAdvanced};
}
// F3H1A: apply armor to the whole *side* once, then distribute conserved losses
// across exposed UnitGroups. Splitting an army never grants a free armor round-off.
function h1aSideDamage(w,budget,alloc,phase,resolveArmy=id=>h1Army(w,id),attackChannels=null){
  const rows=[];
  for(const x of alloc){
    if(x.men<=0)continue;
    const a=resolveArmy(x.armyId),u=a?.units.find(u=>u.id===x.unitId);
    const g=typeof x.unitId==='string'&&x.unitId.startsWith('H:')?hGroups(w,a).find(v=>v.id===Number(x.unitId.slice(2))):null;
    if(!a||!u&&!g||u&&u.manpower<=0)continue;
    const exposed=Math.min(x.men,g?g.ready+g.damaged:u.manpower);
    const weight=exposed*(g?(G4_COMBAT_ENABLED?hWeightedMachineArmor(h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision).armor,attackChannels):g4ArmorMultiplierValue(h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision).armor,0)):
      (G4_COMBAT_ENABLED?g4WeightedArmorMultiplier(u.armorId,attackChannels):1-(ARMORS[u.armorId]?.protection||0)));
    rows.push({army:a,unit:u,machineGroup:g,armyId:a.id,unitId:x.unitId,capacity:exposed,weight});
  }
  const byArmy=new Map();
  const totalExposed=rows.reduce((sum,x)=>sum+x.capacity,0);
  const totalWeight=rows.reduce((sum,x)=>sum+x.weight,0);
  const target=Math.min(totalExposed,Math.max(0,Math.round(budget*totalWeight/Math.max(1,totalExposed))));
  for(const r of rows){
    if(!byArmy.has(r.armyId))byArmy.set(r.armyId,{army:r.army,exposed:0,initialMen:manpower(r.army),losses:0});
    byArmy.get(r.armyId).exposed+=r.capacity;
    r.losses=0;
  }
  let pending=target;
  // Capped Hamilton distribution; each allocation is integral, deterministic and
  // bounded by the actual men exposed. Reallocate any unfillable shortfall.
  while(pending>0){
    const available=rows.filter(r=>r.capacity>r.losses);
    if(!available.length)break;
    const weightSum=available.reduce((sum,r)=>sum+r.weight,0);
    if(weightSum<=0)break;
    const initialPending=pending;
    for(const r of available){
      const take=Math.min(r.capacity-r.losses,Math.floor(initialPending*r.weight/weightSum));
      r.losses+=take;pending-=take;
    }
    if(pending<=0)break;
    const sorted=available.filter(r=>r.capacity>r.losses).sort((a,b)=>
      ((initialPending*b.weight/weightSum)%1)-((initialPending*a.weight/weightSum)%1)||
      a.armyId-b.armyId||String(a.unitId).localeCompare(String(b.unitId)));
    if(!sorted.length)break;
    for(const r of sorted){if(pending<=0)break;r.losses++;pending--;}
  }
  const machineByArmy={},machineHits=rows.filter(r=>r.machineGroup).reduce((total,r)=>total+r.losses,0);
  for(const r of rows){
    if(!r.losses)continue;
    if(r.machineGroup){hDamage(w,r.machineGroup,r.losses);machineByArmy[r.armyId]=(machineByArmy[r.armyId]||0)+r.losses;}
    else{e2DamageArtilleryGuns(r.army,r.unit,r.losses,w);c3TakeLoss(r.unit,r.losses,'BATTLE',w.dayIndex);byArmy.get(r.armyId).losses+=r.losses;}
  }
  const overallRatio=totalExposed/Math.max(1,[...byArmy.values()].reduce((sum,x)=>sum+x.initialMen,0));
  const baseFatigue=phase==='MELEE'?5:2;
  const output={};
  for(const [id,entry] of byArmy){
    // Exposure-based fatigue is independent of how many integer hits occurred.
    const exposureRatio=entry.exposed/Math.max(1,entry.initialMen);
    const normalized=overallRatio>0?exposureRatio/overallRatio:0;
    const lossShock=105*entry.losses/Math.max(8,entry.initialMen);
    entry.army.morale=battleClamp(entry.army.morale-baseFatigue*normalized-lossShock,0,100);
    output[id]=entry.losses;
  }
  return {lossByArmy:output,machineByArmy,machineHits,humanLost:Object.values(output).reduce((sum,x)=>sum+x,0),actualLoss:target-pending,exposed:totalExposed};
}
/** E2 cannon losses are separate from crew losses. Non-artillery never calls the ledger. */
function e2DamageArtilleryGuns(army,u,lost,w){
 if(u.typeId!=='field_artillery'||!(u.guns>0)||lost<=0||!w)return 0;
 // One captured crew-equivalent hit can disable/destroy a physical field piece;
 // fewer than eight casualties damage crew without automatically destroying equipment.
 const destroyed=Math.min(u.guns,Math.floor(lost/E2_GUN_CREW));
 if(destroyed){u.guns-=destroyed;e2GunInventory(w).destroyed+=destroyed;}
 return destroyed;
}
/** Nation-level battery fire: after ordinary infantry phases, one independent opportunity per round.
 * Each participating group has its own entry round; 1.5 => 0/0.5/1.0 even in long coalitions.
 * No RNG draw is made, and no gun means no change to prior warfare outcomes. */
function e2ArtilleryRound(w,e){
 const members=[];
 for(const side of ['attackers','defenders'])for(const m of h1Live(w,e,side)){
  const a=h1Army(w,m.armyId);if(a&&e2ArtilleryGroups(a).some(u=>u.guns>0))members.push({m,a,side});
 }
 if(!members.length)return null;
 members.sort((x,y)=>x.a.id-y.a.id);
 const firing=[],tankShots=[],power={attackers:0,defenders:0};
 for(const {m,a,side} of members)for(const u of e2ArtilleryGroups(a).sort((x,y)=>String(x.id).localeCompare(String(y.id)))){
  const ready=e2OperationalGuns(u),localRound=Math.max(1,e.round-(m.joinedRound||0));
  const prep=e2ArtilleryPrep(u),factor=e1RearPreparationMultiplier(localRound,prep);
  let fired=0,shellsFired=0,legacyFired=0,reason=factor<=0?'PREPARING':ready<=0?'CREW_NOT_READY':'FUNDED';
  if(ready>0&&factor>0){
   const n=w.nations[a.nationId];
   // Industrial shells are physically inventoried and paid for when produced.
   // Fallback applies only to remaining ready guns, preserving pre-F2C artillery rules.
   const shells=Math.min(ready,n.resources.artillery_shells||0);
   const legacy=Math.min(ready-shells,Math.floor(n.gold/6),n.resources.iron);
   shellsFired=shells;legacyFired=legacy;fired=shells+legacy;
   if(shells){n.resources.artillery_shells-=shells;f2cTrackBattleShells(n,shells);}
   if(legacy){n.resources.iron-=legacy;chargeMilitaryOperation(w,a.nationId,legacy*6,e.warId,'artillery_ammunition');}
   if(!fired)reason='INSUFFICIENT_AMMUNITION';
   else if(shells&&legacy)reason='MIXED_SHELL_AND_LEGACY';
   else if(shells)reason='INDUSTRIAL_SHELLS';
  }
  // No front line => vulnerable gun site and suppressed cannon output.
  const guard=hFrontCount(w,a)>0?1:.25;
  const morale=.55+a.morale/180;
  const baseSupply=(a.supplyMultiplier??(a.supplied?1:.78));
  const suppression=Math.min(1,baseSupply+(baseSupply<1&&hasTech(w,a.nationId,'military_freight_standardization')?.10:0));
  const terrain=w.tiles[e.tileId]?.terrain;
  const terrainFactor=side==='defenders'?(terrain==='mountain'?1.25:terrain==='forest'?1.12:1.05):1;
  const armored=v08fArtilleryShots(w,e,side,fired);tankShots.push(...armored.shots);
  const contribution=(fired-armored.anti)*90*factor*morale*guard*suppression*terrainFactor*(1+b4aPowerBonus(a));
  power[side]+=contribution;
  // Combat drill is earned only by groups that actually operated and paid for firing.
  if(fired)u.artilleryExperience=Math.min(1,Math.round((u.artilleryExperience+(.025*(hasTech(w,a.nationId,'artillery_drill_manual')?1.5:1)))*10000)/10000);
  firing.push({armyId:a.id,nationId:a.nationId,unitId:u.id,side,localRound,prep:+prep.toFixed(4),factor:+factor.toFixed(4),guns:u.guns,ready,fired,
    goldSpent:legacyFired*6,ironSpent:legacyFired,artilleryShellsSpent:shellsFired,antiTankShots:armored.anti,reason,power:+contribution.toFixed(3)});
 }
 const resolveSide=side=>{
  const armies=h1Live(w,e,side).map(m=>h1Army(w,m.armyId));
  for(const pos of ['front','rear','back','reserve']){
   const alloc=armies.flatMap(a=>{
    const ids=new Set(a.deployment[pos]||[]);
    return a.units.filter(u=>ids.has(u.id)&&u.manpower>0).map(u=>({armyId:a.id,unitId:u.id,men:u.manpower}));
   });
   for(const a of armies)if(pos==='front'||pos==='rear')for(const g of hGroups(w,a))if(g.position===pos&&g.ready+g.damaged>0)alloc.push({armyId:a.id,unitId:'H:'+g.id,men:g.ready+g.damaged});
   if(alloc.length)return alloc;
  }
  return [];
 };
 // Damage budgets and both firepower sums are fully resolved before casualties are applied.
 const rawA=Math.round(power.attackers/75),rawB=Math.round(power.defenders/75);
 const targetA=resolveSide('attackers'),targetB=resolveSide('defenders');
 e3bMark('AFTER_ARTILLERY_AMMO',w,e);
 const resultA=rawB>0?h1aSideDamage(w,rawB,targetA,'ARTILLERY'):{lossByArmy:{},humanLost:0,machineHits:0,actualLoss:0};
 const resultB=rawA>0?h1aSideDamage(w,rawA,targetB,'ARTILLERY'):{lossByArmy:{},humanLost:0,machineHits:0,actualLoss:0};
 const tankCrewLoss=tankShots.length?v08fApplyShots(w,tankShots):{};
 const war=w.wars.find(v=>v.id===e.warId);
 const casualtyRows={...resultA.lossByArmy,...resultB.lossByArmy};
 for(const [id,n] of Object.entries(tankCrewLoss))casualtyRows[id]=(casualtyRows[id]||0)+n;
 const tankCrewA=h1Live(w,e,'attackers').reduce((q,m)=>q+(tankCrewLoss[m.armyId]||0),0),tankCrewB=h1Live(w,e,'defenders').reduce((q,m)=>q+(tankCrewLoss[m.armyId]||0),0);
 for(const [id,lost] of Object.entries(casualtyRows))if(lost){
  e.perArmyLosses??={};e.perArmyLosses[id]=(e.perArmyLosses[id]||0)+lost;
 }
 v07d2Push(w,{...v07d2Context(e),kind:'ARTILLERY_ROUND',phase:'ARTILLERY',power:Math.round(power.attackers+power.defenders),
   gunsFired:firing.reduce((sum,r)=>sum+r.fired,0),artilleryUnits:firing.length,
   artilleryGoldSpent:firing.reduce((sum,r)=>sum+r.goldSpent,0),artilleryIronSpent:firing.reduce((sum,r)=>sum+r.ironSpent,0),
   artilleryLosses:resultA.humanLost+resultB.humanLost+tankCrewA+tankCrewB,machineHits:resultA.machineHits+resultB.machineHits,casualties:resultA.humanLost+resultB.humanLost+tankCrewA+tankCrewB});
 return {phase:'ARTILLERY',aPower:+power.attackers.toFixed(2),bPower:+power.defenders.toFixed(2),
   aLost:resultA.humanLost+tankCrewA,bLost:resultB.humanLost+tankCrewB,aMachineHits:resultA.machineHits,bMachineHits:resultB.machineHits,
   lossByArmy:casualtyRows,firing,
   aRemaining:h1Live(w,e,'attackers').reduce((sum,m)=>sum+manpower(h1Army(w,m.armyId)),0),
   bRemaining:h1Live(w,e,'defenders').reduce((sum,m)=>sum+manpower(h1Army(w,m.armyId)),0)};
}
function h1ResolveMulti(w,e){
  const war=w.wars.find(v=>v.id===e.warId);if(!war){w.engagements=w.engagements.filter(v=>v.id!==e.id);return;}
  h1Gather(w,e);e.isMulti=true;
  const sides=['attackers','defenders'];
  const initialMembers=[h1Live(w,e,'attackers'),h1Live(w,e,'defenders')];
  if(initialMembers.some(m=>!m.length)){
    h1FinishMulti(w,e,initialMembers[0].length?'attackers':'defenders',false);return;
  }
  for(const list of initialMembers)for(const m of list){const a=h1Army(w,m.armyId);chargeMilitaryOperation(w,a.nationId,manpower(a)*.60,e.warId,'battle');}
  e.round++;v08fMoraleShock(w,e);
  const terrain=w.tiles[e.tileId].terrain,phases=e.round===1?['OPENING','CONTACT','MELEE']:['SUSTAINED','MELEE'];
  let lossA=0,lossB=0;
  const roundLosses={},phaseRecords=[],e3cWeights={attackers:new Map(),defenders:new Map()};
  for(const phase of phases){
    let reinforces=[0,0],collapsed=[0,0],machineAdvances=[0,0];
    for(let si=0;si<2;si++)for(const m of h1Live(w,e,sides[si])){
      const a=h1Army(w,m.armyId);if(!manpower(a)&&hCount(w,a))continue;
      const change=h1Reinforce(e,m,a,w);reinforces[si]+=change.added;machineAdvances[si]+=change.machineAdvanced||0;collapsed[si]+=Number(change.broken);
    }
    const allocA=h1Deployment(w,e,'attackers',phase),allocB=h1Deployment(w,e,'defenders',phase);
    const observation=v07d2Traces.get(w)?.enabled?v07d2PhaseBegin(w,e,phase,sides.map((side,i)=>({side,allocation:i?allocB:allocA,members:h1Live(w,e,side).map(m=>({army:h1Army(w,m.armyId),broken:m.frontBroken,stable:v08hStable(w,h1Army(w,m.armyId),m)}))}))):null;
    const ammoA=new Map(),ammoB=new Map();
    if(phase==='OPENING'||phase==='SUSTAINED'||(G4_COMBAT_ENABLED&&phase==='MELEE')){
      for(const m of h1Live(w,e,'attackers')){const a=h1Army(w,m.armyId);ammoA.set(m.armyId,{human:v07cVolleyCheck(w,a,allocA,e.warId),machine:hVolley(w,a,phase,e.warId,allocA)});}
      for(const m of h1Live(w,e,'defenders')){const a=h1Army(w,m.armyId);ammoB.set(m.armyId,{human:v07cVolleyCheck(w,a,allocB,e.warId),machine:hVolley(w,a,phase,e.warId,allocB)});}
    }
    e3bMark('AFTER_AMMO',w,e);
    const mgFiredA=(phase==='OPENING'||phase==='SUSTAINED')?v08iMultiPaid(w,e,'attackers',allocA,ammoA):0;
    const mgFiredB=(phase==='OPENING'||phase==='SUSTAINED')?v08iMultiPaid(w,e,'defenders',allocB,ammoB):0;
    const frontA=h1Live(w,e,'attackers').reduce((s,m)=>s+deployedManpower(h1Army(w,m.armyId),'front'),0);
    const frontB=h1Live(w,e,'defenders').reduce((s,m)=>s+deployedManpower(h1Army(w,m.armyId),'front'),0);
    const mgState=v08iPhase(e,phase,mgFiredA,mgFiredB,frontA,frontB);
    const channelsA=new Map(),channelsB=new Map();
    const sidePower=(side,alloc,defense,ammo,channels)=>h1Live(w,e,side).reduce((v,m)=>{const value=h1Power(w,h1Army(w,m.armyId),phase,defense,terrain,m.frontBroken,alloc,ammo.get(m.armyId)?.human!==false,channels,ammo.get(m.armyId)?.machine!==false,side==='attackers'?mgState.incomingA:mgState.incomingB);e3cWeights[side].set(m.armyId,(e3cWeights[side].get(m.armyId)||0)+value);return v+value;},0);
    const tanksA=v08fPhasePlan(w,e,phase,'attackers'),tanksB=v08fPhasePlan(w,e,phase,'defenders');
    const powerA=sidePower('attackers',allocA,false,ammoA,channelsA)+tanksA.power,powerB=sidePower('defenders',allocB,true,ammoB,channelsB)+tanksB.power;
    const totalA=h1Live(w,e,'attackers').reduce((v,m)=>v+hCombatPresence(w,h1Army(w,m.armyId)),0);
    const totalB=h1Live(w,e,'defenders').reduce((v,m)=>v+hCombatPresence(w,h1Army(w,m.armyId)),0);
    let toB=powerA===0?0:Math.max(1,Math.round(powerA/65*(.74+randCombat(w)*.50)));
    let toA=powerB===0?0:Math.max(1,Math.round(powerB/65*(.74+randCombat(w)*.50)));
    toA=Math.min(toA,Math.ceil(totalA*.22));toB=Math.min(toB,Math.ceil(totalB*.22));
    if(w.v08fArmor?.vehicles.length){toA=v08fShieldBudget(w,e,'attackers',toA,channelsB,phase);toB=v08fShieldBudget(w,e,'defenders',toB,channelsA,phase);}
    // F2C2C2: ranged attackers and the exposed victim front are independent.
    // Reserve/behind-the-line units remain protected unless the full front is gone.
    const ranged=phase==='OPENING'||phase==='SUSTAINED';
    const targetA=ranged?v07f2c2c2RangedTargets(w,e,'attackers'):allocA;
    const targetB=ranged?v07f2c2c2RangedTargets(w,e,'defenders'):allocB;
    const lossByArmy={};let machineHitsA=0,machineHitsB=0;
    // Precalculate both sides' damage before mutating any UnitGroup or morale.
    // Do not consume additional random values compared to F3H1.
    for(const [index,[budget,alloc,channels]] of [[toA,targetA,channelsB],[toB,targetB,channelsA]].entries()){
      const sideResult=h1aSideDamage(w,budget,alloc,phase,undefined,channels);
      if(index===0)machineHitsA=sideResult.machineHits;else machineHitsB=sideResult.machineHits;
      for(const [id,lost] of Object.entries(sideResult.lossByArmy)){
        lossByArmy[id]=(lossByArmy[id]||0)+lost;
        roundLosses[id]=(roundLosses[id]||0)+lost;
        e.perArmyLosses[id]=(e.perArmyLosses[id]||0)+lost;
      }
    }
    if(tanksA.shots.length||tanksB.shots.length){const crewLoss=v08fApplyShots(w,[...tanksA.shots,...tanksB.shots]);for(const [id,n] of Object.entries(crewLoss)){lossByArmy[id]=(lossByArmy[id]||0)+n;roundLosses[id]=(roundLosses[id]||0)+n;e.perArmyLosses[id]=(e.perArmyLosses[id]||0)+n;}}
    const aLost=h1Live(w,e,'attackers').reduce((v,m)=>v+(lossByArmy[m.armyId]||0),0);
    const bLost=h1Live(w,e,'defenders').reduce((v,m)=>v+(lossByArmy[m.armyId]||0),0);
    lossA+=aLost;lossB+=bLost;
    const sideMen=(side,pos)=>h1Live(w,e,side).reduce((v,m)=>v+deployedManpower(h1Army(w,m.armyId),pos),0);
    const sideMachines=(side,pos)=>h1Live(w,e,side).reduce((v,m)=>v+hPositionQty(w,h1Army(w,m.armyId),pos),0);
    phaseRecords.push({phase,aLost,bLost,aRemaining:h1Live(w,e,'attackers').reduce((v,m)=>v+manpower(h1Army(w,m.armyId)),0),
      bRemaining:h1Live(w,e,'defenders').reduce((v,m)=>v+manpower(h1Army(w,m.armyId)),0),
      aPower:Math.round(powerA),bPower:Math.round(powerB),reinforcementA:reinforces[0],reinforcementB:reinforces[1],machineAdvanceA:machineAdvances[0],machineAdvanceB:machineAdvances[1],
      collapseA:collapsed[0],collapseB:collapsed[1],aMachineHits:machineHitsA,bMachineHits:machineHitsB,aFront:sideMen('attackers','front'),aRear:sideMen('attackers','rear'),aReserve:sideMen('attackers','reserve'),aMachineFront:sideMachines('attackers','front'),aMachineRear:sideMachines('attackers','rear'),
      bFront:sideMen('defenders','front'),bRear:sideMen('defenders','rear'),bReserve:sideMen('defenders','reserve'),bMachineFront:sideMachines('defenders','front'),bMachineRear:sideMachines('defenders','rear'),perArmyLosses:lossByArmy,
      v08hArmorA:h1Live(w,e,'attackers').reduce((s,m)=>s+(m.v08hFrontVersion===1?v08hArmoredFrontSupport(w,h1Army(w,m.armyId)):0),0),
      v08hArmorB:h1Live(w,e,'defenders').reduce((s,m)=>s+(m.v08hFrontVersion===1?v08hArmoredFrontSupport(w,h1Army(w,m.armyId)):0),0),
      v08hEffectiveFrontA:h1Live(w,e,'attackers').reduce((s,m)=>s+v08hFront(w,h1Army(w,m.armyId),m),0),
      v08hEffectiveFrontB:h1Live(w,e,'defenders').reduce((s,m)=>s+v08hFront(w,h1Army(w,m.armyId),m),0),
      v08hReadyTanksA:h1Live(w,e,'attackers').reduce((s,m)=>s+v08fAlive(w,h1Army(w,m.armyId)).length,0),
      v08hReadyTanksB:h1Live(w,e,'defenders').reduce((s,m)=>s+v08fAlive(w,h1Army(w,m.armyId)).length,0),
      deployedA:allocA.reduce((v,x)=>v+x.men,0),deployedB:allocB.reduce((v,x)=>v+x.men,0),
      ...v08iPhaseTelemetry(mgState),
      xpParticipation:[...allocA,...allocB].filter(x=>x.men>0).map(x=>[x.armyId,x.men])});
    v07d2PhaseEnd(w,observation,{attackers:powerA,defenders:powerB});
    if(h1Live(w,e,'attackers').reduce((s,m)=>s+hCombatPresence(w,h1Army(w,m.armyId)),0)===0||h1Live(w,e,'defenders').reduce((s,m)=>s+hCombatPresence(w,h1Army(w,m.armyId)),0)===0)break;
  }
  e3bMark('AFTER_INFANTRY_LOSS',w,e);
  const artillery=e2ArtilleryRound(w,e);
  if(artillery){
    e3bMark('AFTER_ARTILLERY_LOSS',w,e);
    phaseRecords.push(artillery);lossA+=artillery.aLost;lossB+=artillery.bLost;
    for(const [id,lost] of Object.entries(artillery.lossByArmy))roundLosses[id]=(roundLosses[id]||0)+lost;
    for(const f of artillery.firing)e3cWeights[f.side].set(f.armyId,(e3cWeights[f.side].get(f.armyId)||0)+(f.power||0));
  }
  const fortOwner=w.tiles[e.tileId]?.ownerId;
  if(fortOwner!==null){
    const fortSide=warSide(war,fortOwner),offensiveImpact=fortSide===e.defenderWarSide?Math.max(1,lossB):fortSide===e.attackerWarSide?Math.max(1,lossA):0;
    if(offensiveImpact)damageFortAt(w,e.tileId,offensiveImpact/8); // exactly once per coalition round
  }
  const sideMen=(side)=>h1Live(w,e,side).reduce((v,m)=>v+manpower(h1Army(w,m.armyId)),0);
  e.history.push({round:e.round,dayIndex:w.dayIndex,phases:phaseRecords,lossA,lossB,manpowerA:sideMen('attackers'),manpowerB:sideMen('defenders'),
    moraleA:Math.round(h1Live(w,e,'attackers').reduce((v,m)=>v+h1Army(w,m.armyId).morale,0)/Math.max(1,h1Live(w,e,'attackers').length)),
    moraleB:Math.round(h1Live(w,e,'defenders').reduce((v,m)=>v+h1Army(w,m.armyId).morale,0)/Math.max(1,h1Live(w,e,'defenders').length)),
    perArmyLosses:roundLosses});
  if(e.history.length>12)e.history.shift();
  war.battleCasualties??={};war.casualties??={};
  for(const [id,lost] of Object.entries(roundLosses)){
    const a=h1Army(w,Number(id));if(!a||!lost)continue;
    war.casualties[a.nationId]=(war.casualties[a.nationId]||0)+lost;
    war.battleCasualties[a.nationId]=(war.battleCasualties[a.nationId]||0)+lost;
  }
  e3bValidatePhaseRecords(phaseRecords);
  e3cRecordRound(w,e,{attackers:initialMembers[0].map(m=>h1Army(w,m.armyId)).filter(Boolean),defenders:initialMembers[1].map(m=>h1Army(w,m.armyId)).filter(Boolean)},roundLosses,e3cWeights);
  e3bMark('BEFORE_XP',w,e);
  // Formation XP: one award per real round and surviving participating army, not per phase.
  const xpMen=new Map();
  // Artillery is a separate phase with gunner XP; it has no infantry xpParticipation list.
  for(const r of phaseRecords)for(const [id,men] of (r.xpParticipation||[]))
    xpMen.set(id,(xpMen.get(id)||0)+men);
  for(const [id,exposed] of xpMen){const a=h1Army(w,id);if(a)b4aRecordCombat(w,a,e.id,e.round,exposed,roundLosses[id]||0);}
  for(const r of phaseRecords)delete r.xpParticipation; // telemetry bounded; do not serialize raw XP allocation lists
  // Each broken formation retreats; it does not take healthy coalition formations with it.
  for(const side of sides){
    const keep=[];
    for(const m of e[side]){
      const a=h1Army(w,m.armyId);
      if(!a||a.engagementId!==e.id)continue;
      const broken=!hCombatPresence(w,a)||a.morale<23||(m.frontBroken&&a.morale<39);
      if(broken){
        const opponents=h1Live(w,e,side==='attackers'?'defenders':'attackers');
        const pursuer=h1Army(w,opponents[0]?.armyId);
        if(pursuer&&manpower(a)>0){
          const pursuit=resolvePursuitLoss(w,e,pursuer,a);
          e.pursuits??=[];e.pursuits.push({armyId:a.id,...pursuit});
        }
        e3bMark('DURING_RETREAT',w,e);
        startRetreat(w,a,m.initialManpower,e.tileId);
      }else keep.push(m);
    }
    e[side]=keep;
  }
  const liveA=h1Live(w,e,'attackers'),liveB=h1Live(w,e,'defenders');
  if(!liveA.length||!liveB.length||e.round>=8){
    const score=side=>h1Live(w,e,side).reduce((v,m)=>{const a=h1Army(w,m.armyId);return v+(manpower(a)+hEffective(w,a))*(.6+a.morale/130);},0);
    const winner=!liveA.length?'defenders':!liveB.length?'attackers':score('attackers')>score('defenders')?'attackers':'defenders';
    h1FinishMulti(w,e,winner,e.round>=8,[!liveA.length?'ATTACKER_SIDE_COLLAPSED':null,!liveB.length?'DEFENDER_SIDE_COLLAPSED':null,e.round>=8?'MAX_ROUNDS':null].filter(Boolean));
  }else{e.nextRoundDay=w.dayIndex+4;w.changeSeq++;}
}
function h1FinishMulti(w,e,winnerSide,withdrawn=false,conditions=[]){
  h1EnsureMembers(w,e);
  const loserSide=winnerSide==='attackers'?'defenders':'attackers';
  const war=w.wars.find(v=>v.id===e.warId);
  const winners=h1Live(w,e,winnerSide),losers=h1Live(w,e,loserSide);
  const nationOf=(side)=>{
    const first=h1Army(w,e[side]?.[0]?.armyId)||h1Army(w,side==='attackers'?e.attackerArmyId:e.defenderArmyId);
    return first?.nationId??(side==='attackers'?e.attackerNationId:e.defenderNationId);
  };
  const winnerNationId=nationOf(winnerSide),loserNationId=nationOf(loserSide);
  if(war){war.lastBattleDay=w.dayIndex;war.battleCount++;war.battleWins??={};
    war.battleWins[winnerNationId]=(war.battleWins[winnerNationId]||0)+1;
    war.score+=warSide(war,winnerNationId)==='attackers'?2:-2;
  }
  e3cRecordOutcome(w,e,winnerSide);
  const leadWinner=h1Army(w,winners[0]?.armyId);
  const pursuits=(e.pursuits||[]).slice();
  let prisoners=0;
  for(const m of losers){
    const a=h1Army(w,m.armyId);if(!a)continue;
    const pursuit=leadWinner?resolvePursuitLoss(w,e,leadWinner,a):{losses:0,reason:'NO_PURSUER'};
    pursuits.push({armyId:a.id,...pursuit});
    e3bMark('DURING_RETREAT',w,e);
    startRetreat(w,a,m.initialManpower,e.tileId);
    if(a.status==='TRAPPED'&&a.tileId===e.tileId)prisoners+=surrenderArmy(w,a,winnerNationId);
  }
  for(const m of winners){
    const a=h1Army(w,m.armyId);if(!a)continue;
    a.engagementId=null;a.status='READY';a.morale=battleClamp(a.morale+8,0,100);a.nextMoveDay=w.dayIndex+8;
    if(winnerSide==='attackers'&&a.tileId!==e.tileId&&neighbors4(a.tileId,w.size,w.height).includes(e.tileId)&&
      canPassMilitaryTile(w,a.nationId,w.tiles[e.tileId])&&!fortLineBlocks(w,e.tileId,a.nationId)&&
      !hostileFortUncaptured(w,a.tileId,a.nationId))a.tileId=e.tileId;
  }
  w.battleHistory.push({id:e.id,tileId:e.tileId,dayIndex:w.dayIndex,attackerArmyId:e.attackerArmyId,defenderArmyId:e.defenderArmyId,
    attackerNationId:nationOf('attackers'),defenderNationId:nationOf('defenders'),winnerNationId,rounds:e.round,history:e.history.slice(-8),
    participantArmyIds:{attackers:e.allAttackerArmyIds.slice(),defenders:e.allDefenderArmyIds.slice()},
    perArmyLosses:{...e.perArmyLosses},pursuits,pursuit:{losses:pursuits.reduce((v,x)=>v+x.losses,0),reason:'COALITION',advantage:pursuits[0]?.advantage||0,rate:pursuits[0]?.rate||0}});
  if(w.battleHistory.length>50)w.battleHistory.shift();
  v07d3EndDetail(w,e,{winnerSide,endReason:withdrawn?'MAX_ROUNDS':'COMBAT',endConditions:conditions,
    pursuitLosses:pursuits.reduce((sum,x)=>sum+(x.losses||0),0),prisoners});
  w.engagements=w.engagements.filter(v=>v.id!==e.id);
  writeBattleEvent(w,`${w.nations[winnerNationId]?.name||'연합군'}군이 ${w.nations[loserNationId]?.name||'적'}군을 격퇴했습니다. (합동전 ${e.round}라운드${withdrawn?'·최종 판정':''})`);
  w.changeSeq++;
}

function startEngagement(world,attacker,defender,tileId,warId){
  if(attacker.engagementId!==null||defender.engagementId!==null)return null;
  const existing=world.engagements.find(x=>x.warId===warId&&x.tileId===tileId);
  if(existing){
    h1EnsureMembers(world,existing);
    if(existing.attackerOriginTileId!==attacker.tileId)return null;
    h1Gather(world,existing);
    return existing;
  }
  const e={id:world.nextEngagementId++,warId,tileId,attackerArmyId:attacker.id,defenderArmyId:defender.id,round:0,
    nextRoundDay:world.dayIndex+2,history:[],startedDay:world.dayIndex,
    initialManpowerA:hCombatPresence(world,attacker),initialManpowerB:hCombatPresence(world,defender),
    initialFrontA:hFrontCount(world,attacker)+v08hArmoredFrontSupport(world,attacker),initialFrontB:hFrontCount(world,defender)+v08hArmoredFrontSupport(world,defender),
    v08hFrontVersion:1,v08hInitialTankSupportA:v08hArmoredFrontSupport(world,attacker),v08hInitialTankSupportB:v08hArmoredFrontSupport(world,defender),
    frontBrokenA:false,frontBrokenB:false};
  world.engagements.push(e);
  for(const a of [attacker,defender]){a.engagementId=e.id;a.status='ENGAGED';a.order=null;}
  h1EnsureMembers(world,e);h1Gather(world,e);
  writeBattleEvent(world,`${world.nations[attacker.nationId].name}군과 ${world.nations[defender.nationId].name}군이 교전을 시작했습니다.`);
  v07d2Push(world,{...v07d2Context(e),kind:'ENGAGEMENT_START',active:true});
  world.changeSeq++;return e;
}
function reinforce(e,army,side){
  const key=side==='A'?'initialFrontA':'initialFrontB',brokenKey=side==='A'?'frontBrokenA':'frontBrokenB';
  const baseline=e[key]||1,front=deployedManpower(army,'front'),reserve=deployedManpower(army,'reserve');
  const threshold=Math.max(1,Math.floor(baseline*.40));
  let added=0,broken=false;
  if(front<=threshold&&reserve>0){
    for(const id of army.deployment.reserve.slice()){
      const unit=army.units.find(u=>u.id===id);
      if(!unit?.manpower)continue;
      army.deployment.reserve=army.deployment.reserve.filter(x=>x!==id);
      army.deployment.front.push(id);
      added+=unit.manpower;
      if(deployedManpower(army,'front')>threshold)break;
    }
    if(added>0){army.morale=battleClamp(army.morale+3,0,100);}
  }
  if(deployedManpower(army,'front')<=threshold&&deployedManpower(army,'reserve')===0){
    if(!e[brokenKey]){e[brokenKey]=true;army.morale=battleClamp(army.morale-10,0,100);broken=true;}
  }
  return {side,added,broken,front:deployedManpower(army,'front'),rear:deployedManpower(army,'rear'),reserve:deployedManpower(army,'reserve')};
}
/** A routed army unable to leave the LOST battlefield capitulates; it does not
 * become an indefinite hostile garrison. Prisoners are NOT counted as dead. */
function surrenderArmy(world,army,winningNationId=null){
  const survivors=manpower(army);
  if(!survivors&&!hCount(world,army,true))return 0;
  const war=world.wars.find(w=>w.id===army.assignedWarId)||world.wars.find(w=>warSide(w,army.nationId)&&
   (winningNationId===null||warSide(w,winningNationId)&&warSide(w,winningNationId)!==warSide(w,army.nationId)));
  if(war){war.surrendered??={};war.surrendered[army.nationId]=(war.surrendered[army.nationId]||0)+survivors;}
  v08fOnArmyRemoved(world,army,'SURRENDER',winningNationId);
  hOnArmyRemoved(world,army,'SURRENDER');
  e2FinaliseGuns(world,army,'SURRENDER',winningNationId);
  c6RecordArmyEnd(world,army,'SURRENDER');
  g3ObserveArmyRemoval(world,army,'SURRENDER');
  world.armies=world.armies.filter(a=>a.id!==army.id);
  const cmd=world.characters.find(c=>c.id===army.commanderId);
  if(cmd){
    world.pastCommanders.push({name:cmd.name,nationId:cmd.nationId,age:cmd.age,victories:cmd.victories||0,captured:true});
    if(world.pastCommanders.length>80)world.pastCommanders.splice(0,world.pastCommanders.length-80);
    world.characters=world.characters.filter(c=>c.id!==cmd.id);
  }
  writeBattleEvent(world,`${world.nations[army.nationId]?.name||'패전국'}군 ${survivors}명이 포위되어 항복했습니다.`);
  world.changeSeq++;
  return survivors;
}
/** V0.3F3F: One deterministic rout/pursuit-loss check per *finished* engagement.
 * Only the actual 1:1 participants' last three resolved rounds are considered.
 * No artificial nationwide army advantage, no duplicate losses per retreat step.
 * A trapped unit still surrenders as prisoners; it is not executed by pursuit.
 * Combat losses flow through the existing wartime casualty accounting.
 */
function resolvePursuitLoss(world,e,winner,loser){
  const empty={losses:0,advantage:0,rate:0,reason:'NONE',loserNationId:loser.nationId};
  const survivors=manpower(loser);
  if(!survivors||!manpower(winner))return {...empty,reason:'NO_SURVIVORS'};
  const retreat=planRetreat(world,loser,{excludeTileId:loser.tileId===e.tileId?e.tileId:null});
  if(!retreat)return {...empty,reason:'TRAPPED_SURRENDER'};
  const winA=e.allAttackerArmyIds?e.allAttackerArmyIds.includes(winner.id):winner.id===e.attackerArmyId;
  let winnerPressure=0,loserPressure=0;
  for(const round of e.history.slice(-3))for(const phase of round.phases||[]){
    winnerPressure+=winA?phase.aPower:phase.bPower;
    loserPressure+=winA?phase.bPower:phase.aPower;
  }
  const advantage=winnerPressure/Math.max(1,loserPressure);
  if(advantage<=1.3)return {...empty,advantage:+advantage.toFixed(3),reason:'ORDERLY_RETREAT'};
  // Smooth interpolation across four agreed bands; bounded at 35% of survivors.
  let rate=advantage<1.7? .05*(advantage-1.3)/.4:
    advantage<2.5? .05+.17*(advantage-1.7)/.8:
    Math.min(.35,.22+.065*(advantage-2.5));
  // Organized retreat and defensive terrain reduce exposure to pursuit.
  if(loser.morale>=65)rate*=.75;
  else if(loser.morale<25)rate*=1.15;
  const terrain=world.tiles[e.tileId]?.terrain;
  if(terrain==='mountain')rate*=.70;
  else if(terrain==='forest'||terrain==='rock')rate*=.85;
  // No extra RNG draws: patch affects combat outcomes, not RNG consumption by itself.
  rate=battleClamp(rate,0,.35);
  const desired=Math.min(survivors,Math.round(survivors*rate));
  if(!desired)return {...empty,advantage:+advantage.toFixed(3),rate:+rate.toFixed(4),reason:'BELOW_ONE'};
  const losses=applyLosses(loser,desired,'PURSUIT',world.dayIndex,world);
  e3cRecordPursuit(world,winner,loser,losses,e.warId);
  const war=world.wars.find(w=>w.id===e.warId);
  if(war&&losses){
    war.casualties??={};war.battleCasualties??={};war.pursuitCasualties??={};
    war.casualties[loser.nationId]=(war.casualties[loser.nationId]||0)+losses;
    war.battleCasualties[loser.nationId]=(war.battleCasualties[loser.nationId]||0)+losses;
    war.pursuitCasualties[loser.nationId]=(war.pursuitCasualties[loser.nationId]||0)+losses;
  }
  return {losses,advantage:+advantage.toFixed(3),rate:+rate.toFixed(4),reason:'ROUT',loserNationId:loser.nationId};
}
function endEngagement(world,e,winner,loser,withdrawn=false,conditions=[]){
  const war=world.wars.find(w=>w.id===e.warId);
  if(war){war.lastBattleDay=world.dayIndex;war.battleCount++;war.battleWins??={};war.battleWins[winner.nationId]=(war.battleWins[winner.nationId]||0)+1;war.score+=warSide(war,winner.nationId)==='attackers'?2:-2;}
  e3cRecordOutcome(world,e,winner.id===e.attackerArmyId?'attackers':'defenders');
  const winN=world.nations[winner.nationId],lossN=world.nations[loser.nationId];
  winner.engagementId=null;winner.status='READY';winner.morale=battleClamp(winner.morale+8,0,100);winner.nextMoveDay=world.dayIndex+8;
  const initial=loser.id===e.attackerArmyId?e.initialManpowerA:e.initialManpowerB;
  const pursuit=resolvePursuitLoss(world,e,winner,loser);
  e3bMark('DURING_RETREAT',world,e);
  startRetreat(world,loser,initial,e.tileId);
  winner.tileId=e.tileId;
  // Battle victory secures the field, not the region. Occupation requires time and resistance.
  world.battleHistory.push({id:e.id,tileId:e.tileId,dayIndex:world.dayIndex,attackerArmyId:e.attackerArmyId,defenderArmyId:e.defenderArmyId,
    attackerNationId:world.armies.find(a=>a.id===e.attackerArmyId)?.nationId,defenderNationId:world.armies.find(a=>a.id===e.defenderArmyId)?.nationId,
    winnerNationId:winner.nationId,rounds:e.round,history:e.history.slice(-8),pursuit});
  if(world.battleHistory.length>50)world.battleHistory.shift();
  world.engagements=world.engagements.filter(v=>v.id!==e.id);
  writeBattleEvent(world,`${winN.name}군이 ${lossN.name}군을 격퇴했습니다. (${e.round}라운드${withdrawn?'·후퇴':''}${pursuit.losses?`·패주 ${pursuit.losses}명`:''})`);
  // No safe retreat route from the battlefield: survivors are captured, not killed.
  const prisoners=loser.status==='TRAPPED'&&loser.tileId===e.tileId?surrenderArmy(world,loser,winner.nationId):0;
  v07d3EndDetail(world,e,{winnerSide:winner.id===e.attackerArmyId?'attackers':'defenders',
    endReason:withdrawn?'MAX_ROUNDS':'COMBAT',endConditions:conditions,pursuitLosses:pursuit.losses||0,prisoners});
  world.changeSeq++;
}
function resolveEngagementRound(world,e){
  const checkpoint=e3bCombatCheckpoint(world,e),obsCheckpoint=e3bObserverCheckpoint(world);
  e3bStage='ENTRY';
  try{
    const observation=v07d2RoundBegin(world,e);
    e3bMark('BEFORE_ROUND',world,e);
    resolveEngagementRoundD1(world,e);
    e3bMark('AFTER_FINISH',world,e);
    v07d2RoundEnd(world,e,observation,false);
    e3bLastCommit.set(world,{dayIndex:world.dayIndex,warId:e.warId,engagementId:e.id,round:e.round});
  }catch(problem){
    const stage=e3bStage;
    let restored=false,rollbackError=null;
    try{e3bRollbackCombat(world,checkpoint);restored=true;}catch(err){rollbackError=err;}
    try{e3bObserverAbort(world,obsCheckpoint,e,problem,stage,restored);}catch(err){rollbackError??=err;}
    const detail={dayIndex:world.dayIndex,warId:e.warId,engagementId:e.id,round:e.round+1,
      stage,errorName:problem.name||'Error',errorMessage:String(problem.message||problem),
      rollbackStatus:restored&&!rollbackError?'RESTORED':'UNVERIFIED',
      lastCommitted:e3bLastCommit.get(world)||null};
    e3bFailures.set(world,detail); // non-serialized: the rest of this day may be incomplete
    const msg=`E3B ${detail.rollbackStatus} · day ${detail.dayIndex} · war ${detail.warId} / engagement ${detail.engagementId} / round ${detail.round} · ${stage} · ${detail.errorName}: ${detail.errorMessage}`;
    const wrapped=new Error(msg,{cause:problem});
    if(rollbackError)wrapped.rollbackError=rollbackError;
    throw wrapped;
  }
}
/** F2C2C2: actual, trained firearm shooters in the single-formation path.
 * linePower uses precisely the same deployed lanes and c3CombatMen predicate;
 * v07cVolleyCheck handles matchlock/flintlock/rifled_musket identically for both paths.
 */
function v07f2c2c2SingleVolleyAllocation(army,phase,frontStable,defending){
  const positions=phase==='OPENING'?['front','rear']:phase==='SUSTAINED'&&frontStable?['rear']:[];
  const ids=new Set(positions.flatMap(pos=>army.deployment[pos]||[]));
  return army.units.filter(u=>ids.has(u.id)&&V07E1_FIREARMS.has(u.weaponId)&&c3CombatMen(u,defending)>0)
    .map(u=>({armyId:army.id,unitId:u.id,men:c3CombatMen(u,defending)}));
}
function resolveEngagementRoundD1(world,e){
  // Refresh support before branch; untouched 1:1 calculation remains the compatibility baseline.
  h1Gather(world,e);
  if(e.isMulti||e.attackers.length+e.defenders.length>2||hCount(world,world.armies.find(a=>a.id===e.attackerArmyId))>0||hCount(world,world.armies.find(a=>a.id===e.defenderArmyId))>0||e.attackers.concat(e.defenders).some(m=>v08fTanks(world,world.armies.find(a=>a.id===m.armyId)).length>0)){
    if(!e.isMulti){
      const leaderA=e.attackers.find(m=>m.armyId===e.attackerArmyId);
      const leaderB=e.defenders.find(m=>m.armyId===e.defenderArmyId);
      if(leaderA)leaderA.frontBroken=!!e.frontBrokenA;
      if(leaderB)leaderB.frontBroken=!!e.frontBrokenB;
    }
    h1ResolveMulti(world,e);return;
  }
  const a=world.armies.find(v=>v.id===e.attackerArmyId),b=world.armies.find(v=>v.id===e.defenderArmyId);
  if(!a||!b){world.engagements=world.engagements.filter(v=>v.id!==e.id);return;}
  // Both participating armies incur campaign expenditure at every resolved round.
  chargeMilitaryOperation(world,a.nationId,manpower(a)*.60,e.warId,'battle');
  chargeMilitaryOperation(world,b.nationId,manpower(b)*.60,e.warId,'battle');
  e.round++;
  const terrain=world.tiles[e.tileId].terrain,phases=e.round===1?['OPENING','CONTACT','MELEE']:['SUSTAINED','MELEE'];
  const phaseRecords=[];let lossA=0,lossB=0;
  for(const phase of phases){
    // Each side reinforces between stages. The inactive reserves never attack.
    const changeA=reinforce(e,a,'A'),changeB=reinforce(e,b,'B');
    const stableA=v07dFrontStable(a,e.initialFrontA,e.frontBrokenA),stableB=v07dFrontStable(b,e.initialFrontB,e.frontBrokenB);
    const observation=v07d2Traces.get(world)?.enabled?v07d2PhaseBegin(world,e,phase,[
      {side:'attackers',members:[{army:a,broken:e.frontBrokenA,stable:stableA}]},
      {side:'defenders',members:[{army:b,broken:e.frontBrokenB,stable:stableB}]}]):null;
    const shooting=phase==='OPENING'||phase==='SUSTAINED'||(G4_COMBAT_ENABLED&&phase==='MELEE');
    const ammoA=!shooting||v07cVolleyCheck(world,a,phase==='MELEE'?g4SingleCloseAllocation(a,false):v07f2c2c2SingleVolleyAllocation(a,phase,stableA,false),e.warId);
    const ammoB=!shooting||v07cVolleyCheck(world,b,phase==='MELEE'?g4SingleCloseAllocation(b,true):v07f2c2c2SingleVolleyAllocation(b,phase,stableB,true),e.warId);
    e3bMark('AFTER_AMMO',world,e);
    const mgFiredA=(phase==='OPENING'||phase==='SUSTAINED')?v08iMgPaid(a,v07f2c2c2SingleVolleyAllocation(a,phase,stableA,false),ammoA):0;
    const mgFiredB=(phase==='OPENING'||phase==='SUSTAINED')?v08iMgPaid(b,v07f2c2c2SingleVolleyAllocation(b,phase,stableB,true),ammoB):0;
    const mgState=v08iPhase(e,phase,mgFiredA,mgFiredB,deployedManpower(a,'front'),deployedManpower(b,'front'));
    const channelsA=new Map(),channelsB=new Map();
    const powerA=linePower(world,a,phase,false,terrain,e.frontBrokenA,ammoA,stableA,channelsA,mgState.incomingA),powerB=linePower(world,b,phase,true,terrain,e.frontBrokenB,ammoB,stableB,channelsB,mgState.incomingB);
    const beforeA=manpower(a),beforeB=manpower(b);
    let toB=powerA===0?0:Math.max(1,Math.round(powerA/65*(.74+randCombat(world)*.50)));
    let toA=powerB===0?0:Math.max(1,Math.round(powerB/65*(.74+randCombat(world)*.50)));
    toA=Math.min(toA,Math.ceil(beforeA*.22));toB=Math.min(toB,Math.ceil(beforeB*.22));
    // Both powers and caps are snapshotted before either side takes losses.
    const aLost=applyLosses(a,toA,phase,world.dayIndex,world,channelsB),bLost=applyLosses(b,toB,phase,world.dayIndex,world,channelsA);
    lossA+=aLost;lossB+=bLost;
    phaseRecords.push({phase,aLost,bLost,aRemaining:manpower(a),bRemaining:manpower(b),
      aPower:Math.round(powerA),bPower:Math.round(powerB),reinforcementA:changeA.added,reinforcementB:changeB.added,
      collapseA:changeA.broken,collapseB:changeB.broken,
      aFront:deployedManpower(a,'front'),aRear:deployedManpower(a,'rear'),aReserve:deployedManpower(a,'reserve'),
      bFront:deployedManpower(b,'front'),bRear:deployedManpower(b,'rear'),bReserve:deployedManpower(b,'reserve'),
      ...v08iPhaseTelemetry(mgState)});
    v07d2PhaseEnd(world,observation,{attackers:powerA,defenders:powerB});
    if(!manpower(a)||!manpower(b))break;
  }
  e3bMark('AFTER_INFANTRY_LOSS',world,e);
  const artillery=e2ArtilleryRound(world,e);
  if(artillery){e3bMark('AFTER_ARTILLERY_LOSS',world,e);phaseRecords.push(artillery);lossA+=artillery.aLost;lossB+=artillery.bLost;}
  const fortOwner=world.tiles[e.tileId]?.ownerId;
  if(fortOwner!==null){
    const offensiveImpact=fortOwner===b.nationId&&a.nationId!==fortOwner?Math.max(1,lossB):
      fortOwner===a.nationId&&b.nationId!==fortOwner?Math.max(1,lossA):0;
    if(offensiveImpact)damageFortAt(world,e.tileId,offensiveImpact/8);
  }
  const rec={round:e.round,dayIndex:world.dayIndex,phases:phaseRecords,lossA,lossB,manpowerA:manpower(a),manpowerB:manpower(b),
    moraleA:a.morale,moraleB:b.morale,frontBrokenA:e.frontBrokenA,frontBrokenB:e.frontBrokenB};
  e.history.push(rec);if(e.history.length>12)e.history.shift();
  const war=world.wars.find(w=>w.id===e.warId);
  if(war){war.battleCasualties??={};for(const [id,loss] of [[a.nationId,lossA],[b.nationId,lossB]]){war.casualties[id]=(war.casualties[id]||0)+loss;war.battleCasualties[id]=(war.battleCasualties[id]||0)+loss;}}
  e3cRecordRound(world,e,{attackers:[a],defenders:[b]},{[a.id]:lossA,[b.id]:lossB});
  e3bMark('BEFORE_XP',world,e);
  // The two combatants participate once in this resolved round (even if defeated).
  b4aRecordCombat(world,a,e.id,e.round,Math.max(0,phaseRecords.reduce((x,r)=>x+(r.aFront||0)+(r.aRear||0),0)),lossA);
  b4aRecordCombat(world,b,e.id,e.round,Math.max(0,phaseRecords.reduce((x,r)=>x+(r.bFront||0)+(r.bRear||0),0)),lossB);
  const brokenA=!manpower(a)||a.morale<23||e.frontBrokenA&&a.morale<39;
  const brokenB=!manpower(b)||b.morale<23||e.frontBrokenB&&b.morale<39;
  if(brokenA||brokenB||e.round>=8){
    let winner,loser;
    if(brokenA!==brokenB){winner=brokenA?b:a;loser=brokenA?a:b;}
    else{const scoreA=manpower(a)*(.6+a.morale/130),scoreB=manpower(b)*(.6+b.morale/130);
      winner=scoreA>scoreB?a:b;loser=winner===a?b:a;}
    endEngagement(world,e,winner,loser,e.round>=8,[brokenA?'ATTACKER_COLLAPSE':null,brokenB?'DEFENDER_COLLAPSE':null,e.round>=8?'MAX_ROUNDS':null].filter(Boolean));
  }else{e.nextRoundDay=world.dayIndex+4;world.changeSeq++;}
}


// --- src/sim/supply.js ---
/** V0.1G2: territory-based supply; no cargo, travelers or soldier Person objects. */
const men=a=>a.units.reduce((n,u)=>n+u.manpower,0);
const safeSettlement=(w,s,nationId)=>Boolean(s&&s.ownerId===nationId&&
  w.tiles[s.coreTileId]?.ownerId===nationId&&w.tiles[s.coreTileId]?.occupiedBy===null&&
  !w.armies.some(a=>a.tileId===s.coreTileId&&a.nationId!==nationId&&a.status!=='DESTROYED'&&men(a)>0&&!allyAccess(w,nationId,a.nationId)));
const atSafeSettlement=(w,a)=>w.settlements.some(s=>s.coreTileId===a.tileId&&safeSettlement(w,s,a.nationId));
const supplyMultiplier=days=>days<10?1:days<30?.85:days<60?.70:.55;
/** Occupied ENEMY land carries supply only if linked to an unoccupied domestic settlement. */
// V0.6F4C: Immediate post-movement supply connectivity. Preindex only for this
// invocation; no cache survives an army move, diplomacy change, or save/load.
// The original F4B1 BFS is preserved as a parity fallback, with identical
// passability, occupation, alliance, blockade and safe-core semantics.
let f4cFastSupplyEnabled=true;
function hasSupplyLine(w,a){
  if(!f4cFastSupplyEnabled)return hasSupplyLineF4B1Legacy(w,a);
  if(!men(a))return false;
  const nationId=a.nationId;
  const safeCores=new Set(w.settlements.filter(s=>allyAccess(w,nationId,s.ownerId)&&safeSettlement(w,s,s.ownerId)).map(s=>s.coreTileId));
  if(!safeCores.size)return false;
  // Original: warsOfNation(...) and warSide(...) repeated for every eligible
  // adjacent tile.  Equivalent same-side membership is computed once here.
  const sameSide=new Set();
  for(const war of warsOfNation(w,nationId)){
    const side=warSide(war,nationId);
    for(const member of warMembers(war))if(warSide(war,member)===side)sameSide.add(member);
  }
  // Original: scan all armies once per adjacent tile. This array preserves
  // the rule that any still-active hostile formation blocks tile entry.
  const enemyTiles=new Uint8Array(w.tiles.length);
  for(const enemy of w.armies)if(enemy.nationId!==nationId&&warAgainst(w,enemy.nationId,nationId)&&
    enemy.tileId>=0&&enemy.tileId<w.tiles.length&&men(enemy)>0&&enemy.status!=='DESTROYED')enemyTiles[enemy.tileId]=1;
  const allyByOwner=new Map();
  const ownerAllowed=owner=>{
    if(!allyByOwner.has(owner))allyByOwner.set(owner,allyAccess(w,nationId,owner));
    return allyByOwner.get(owner);
  };
  const queue=[a.tileId],seen=new Set(queue);
  for(let k=0;k<queue.length;k++){
    const tileId=queue[k];if(safeCores.has(tileId))return true;
    for(const next of neighbors4(tileId,w.size,w.height)){
      const tile=w.tiles[next];
      if(seen.has(next)||!TERRAINS[tile.terrain].passable)continue;
      const occupant=tile.occupiedBy;
      if(occupant!==null&&occupant!==nationId&&!sameSide.has(occupant))continue;
      if(!ownerAllowed(tile.ownerId)&&occupant!==nationId&&!(occupant!==null&&sameSide.has(occupant)))continue;
      if(enemyTiles[next])continue;
      seen.add(next);queue.push(next);
    }
  }
  return false;
}
function hasSupplyLineF4B1Legacy(w,a){
  if(!men(a))return false;
  const safeCores=new Set(w.settlements.filter(s=>allyAccess(w,a.nationId,s.ownerId)&&safeSettlement(w,s,s.ownerId)).map(s=>s.coreTileId));
  if(!safeCores.size)return false;
  const queue=[a.tileId],seen=new Set(queue);
  for(let k=0;k<queue.length;k++){
    const id=queue[k];if(safeCores.has(id))return true;
    for(const next of neighbors4(id,w.size,w.height)){
      const t=w.tiles[next];if(seen.has(next)||!TERRAINS[t.terrain].passable)continue;
      if(t.occupiedBy!==null&&t.occupiedBy!==a.nationId&&!(warsOfNation(w,a.nationId).some(v=>warSide(v,t.occupiedBy)===warSide(v,a.nationId))))continue;
      if(!allyAccess(w,a.nationId,t.ownerId)&&t.occupiedBy!==a.nationId&&!(t.occupiedBy!==null&&warsOfNation(w,a.nationId).some(v=>warSide(v,t.occupiedBy)===warSide(v,a.nationId))))continue;
      if(w.armies.some(enemy=>enemy.nationId!==a.nationId&&warAgainst(w,enemy.nationId,a.nationId)&&enemy.tileId===next&&men(enemy)>0&&enemy.status!=='DESTROYED'))continue;
      seen.add(next);queue.push(next);
    }
  }
  return false;
}
// V0.6F1: one shared reverse connectivity graph per nation for each army-supply sweep.
// The graph only lives inside updateArmySupply; it is neither serialized nor
// retained between military events. Immediate in-movement checks keep the original BFS.
// Setting false is an internal diagnostic switch, not a saved game rule.
let f1SupplyGraphEnabled=true;
let f1SupplyGraphScope=null;
const f1SupplyGraphStats={sweeps:0,queries:0,builds:0,invalidations:0,visitedTiles:0};
function f1SupplyMatrix(w,nationId){
  // This is exactly the original safeCores predicate, including alliance access.
  const safeCores=new Set(w.settlements.filter(s=>allyAccess(w,nationId,s.ownerId)&&
    safeSettlement(w,s,s.ownerId)).map(s=>s.coreTileId));
  const reachable=new Uint8Array(w.tiles.length);
  if(!safeCores.size)return {safeCores,reachable};
  const permitted=new Uint8Array(w.tiles.length);
  const ownWars=warsOfNation(w,nationId);
  const sameSide=new Set();
  for(const war of ownWars){
    const side=warSide(war,nationId);
    for(const id of warMembers(war))if(warSide(war,id)===side)sameSide.add(id);
  }
  // A military enemy on a tile blocks entry, regardless of that tile's owner.
  const enemyTiles=new Uint8Array(w.tiles.length);
  for(const a of w.armies)if(a.nationId!==nationId&&warAgainst(w,a.nationId,nationId)&&
    a.status!=='DESTROYED'&&men(a)>0)enemyTiles[a.tileId]=1;
  for(const tile of w.tiles){
    if(!TERRAINS[tile.terrain].passable||enemyTiles[tile.id])continue;
    const occupant=tile.occupiedBy;
    if(occupant!==null&&occupant!==nationId&&!sameSide.has(occupant))continue;
    if(!allyAccess(w,nationId,tile.ownerId)&&occupant!==nationId&&
      !(occupant!==null&&sameSide.has(occupant)))continue;
    permitted[tile.id]=1;
  }
  const queue=[];
  for(const core of safeCores){
    // Original BFS cannot enter an impassable/blocked safe core from elsewhere.
    // An army starting at that very core is handled separately below.
    if(permitted[core]&&!reachable[core]){reachable[core]=1;queue.push(core);}
  }
  for(let k=0;k<queue.length;k++){
    for(const next of neighbors4(queue[k],w.size,w.height)){
      if(permitted[next]&&!reachable[next]){reachable[next]=1;queue.push(next);}
    }
  }
  f1SupplyGraphStats.builds++;
  f1SupplyGraphStats.visitedTiles+=queue.length;
  return {safeCores,reachable};
}
function f1SupplyConnected(w,a){
  const scope=f1SupplyGraphScope;
  if(!f1SupplyGraphEnabled||!scope||scope.world!==w)return hasSupplyLine(w,a);
  f1SupplyGraphStats.queries++;
  if(!men(a))return false;
  let cache=scope.nations.get(a.nationId);
  if(!cache||cache.changeSeq!==w.changeSeq){
    if(cache)f1SupplyGraphStats.invalidations++;
    cache={changeSeq:w.changeSeq,graph:f1SupplyMatrix(w,a.nationId)};
    scope.nations.set(a.nationId,cache);
  }
  const {safeCores,reachable}=cache.graph;
  if(!safeCores.size)return false;
  // Original BFS checks its starting tile before enforcing entry conditions.
  if(safeCores.has(a.tileId)||reachable[a.tileId])return true;
  for(const next of neighbors4(a.tileId,w.size,w.height))if(reachable[next])return true;
  return false;
}
function militaryLosses(a,n,politicalReason='SUPPLY',politicalDay=null){
  let removed=0;
  for(const pos of POSITIONS)for(const id of (a.deployment[pos]||[])){
    const unit=a.units.find(u=>u.id===id);if(!unit||removed===n)break;
    const loss=Math.min(n-removed,unit.manpower);c3TakeLoss(unit,loss,politicalReason,politicalDay);removed+=loss;
  }
  return removed;
}
/** At most one dated 10-day attrition event per army step, bounded by simulated time. */
function updateArmySupply(w){
  const previousScope=f1SupplyGraphScope;
  if(f1SupplyGraphEnabled){
    f1SupplyGraphScope={world:w,nations:new Map()};
    f1SupplyGraphStats.sweeps++;
  }
  try {f1UpdateArmySupplyCore(w);} finally {f1SupplyGraphScope=previousScope;}
}
function f1UpdateArmySupplyCore(w){
  for(const a of w.armies){
    if(a.status==='DESTROYED'||men(a)===0)continue;
    const last=Number.isInteger(a.supplyCheckedDay)?Math.min(a.supplyCheckedDay,w.dayIndex):w.dayIndex;
    const elapsed=Math.max(0,w.dayIndex-last);
    const connected=f1SupplyConnected(w,a);
    const previous=Number.isInteger(a.unsuppliedDays)?a.unsuppliedDays:0;
    const now=connected?0:previous+elapsed;
    a.supplied=connected;a.unsuppliedDays=now;
    a.supplyMultiplier=supplyMultiplier(now);
    a.supplyCheckedDay=w.dayIndex;
    if(!connected&&elapsed){
      const oldTicks=Math.floor(previous/10),newTicks=Math.floor(now/10);
      for(let tick=oldTicks+1;tick<=newTicks;tick++){
        const days=tick*10;
        if(days<10)continue;
        a.morale=Math.max(0,a.morale-(days>=60?4:days>=30?3:2));
        if(days<30)continue;
        const current=men(a);if(!current)break;
        const rate=days>=60?.02:.01;
        const casualties=militaryLosses(a,Math.max(1,Math.ceil(current*rate*(1-techBonus(w,a.nationId,'supplyAttrition')))),'SUPPLY',w.dayIndex);
        const war=w.wars.find(v=>v.id===a.assignedWarId)||warOfNation(w,a.nationId);
        if(war&&casualties){war.supplyCasualties??={};war.casualties??={};war.supplyCasualties[a.nationId]=(war.supplyCasualties[a.nationId]||0)+casualties;war.casualties[a.nationId]=(war.casualties[a.nationId]||0)+casualties;}
      }
      if(newTicks>oldTicks)w.changeSeq++;
    }
    if(connected&&previous>0)w.changeSeq++;
  }
}


// --- src/sim/occupation.js ---
/** V0.3B: regional absolute resistance & firepower, no ghost soldiers. */
const LIMIT=(v,min,max)=>Math.max(min,Math.min(max,v));
const remaining=a=>a.units.reduce((s,u)=>s+u.manpower,0);
const warFor=(w,a,b)=>warAgainst(w,a,b);
const fighting=(w,a)=>a.status==='ENGAGED'||a.engagementId!==null;
function mark(w,text){w.events.push({dayIndex:w.dayIndex,text,kind:'occupation'});if(w.events.length>180)w.events.shift();w.changeSeq++;}
function roll(w){let s=w.rngState|0;s^=s<<13;s^=s>>>17;s^=s<<5;w.rngState=(s>>>0)||0x6d2b79f5;return w.rngState/4294967296;}
function occupationDefense(w,tid){return regionalMilitaryStats(w,tid).resistance;}
/** Actual headcount and supply used for capture; no virtual reinforcements. */
function occupationEffectiveMen(w,forces){return forces.reduce((s,a)=>s+(remaining(a)+hEffective(w,a)*.35)*(.55+a.morale/210)*(a.supplied?.95:.72),0);}
/** Percent-free absolute resistance. Constant 100 is a balance scale, not a percentage cap. */
function occupationProgressPerTick(effectiveMen,resistance){
  return Math.min(28,6+4.5*Math.log1p(Math.max(0,effectiveMen)/25))/(1+2.5*Math.log1p(Math.max(0,resistance)/100));
}
function occupationAt(w,tid){return w.occupations.find(o=>o.tileId===tid)||null;}
function occupationAlly(w,o,army){
  const war=w.wars.find(v=>v.id===o.warId);
  return Boolean(war&&warSide(war,army.nationId)===warSide(war,o.nationId)&&warSide(war,army.nationId));
}
function isOccupying(w,army){return w.occupations.some(o=>o.tileId===army.tileId&&occupationAlly(w,o,army));}
function beginOccupation(w,army,tid=army.tileId){
  const t=w.tiles[tid];if(!t||t.ownerId===null||!TERRAINS[t.terrain].passable)return null;
  const recapture=allyAccess(w,army.nationId,t.ownerId)&&t.occupiedBy!==null&&t.occupiedBy!==army.nationId;
  if(allyAccess(w,army.nationId,t.ownerId)&&!recapture)return null;
  const war=warFor(w,army.nationId,recapture?t.occupiedBy:t.ownerId);if(!war||
    (army.assignedWarId!=null&&army.assignedWarId!==war.id))return null;
  // E1: defensive allies may liberate the principal defender's land, never annex the attacker's territory.
  // E2: both coalitions may occupy enemy land; allied land may only be liberated.
  if(t.occupiedBy===army.nationId||t.occupiedBy!==null&&warSide(war,t.occupiedBy)===warSide(war,army.nationId))return null;
  if(t.occupiedBy!==null&&t.occupiedWarId!=null&&t.occupiedWarId!==war.id&&!warSide(war,t.occupiedBy))return null;
  const old=occupationAt(w,tid);
  if(old){
    // E2A: a coalition member joins the same siege, never replaces its progress.
    if(old.warId===war.id&&occupationAlly(w,old,army)){
      army.order=null;army.operation={type:'OCCUPY',targetTileId:tid};army.needsOrders=false;
      return old;
    }
    w.occupations=w.occupations.filter(o=>o!==old);
  }
  const stats=regionalMilitaryStats(w,tid);
  const o={tileId:tid,warId:war.id,nationId:army.nationId,defenderId:t.ownerId,
    progress:0,resistance:stats.resistance,firepower:recapture?0:stats.firepower,attackRemainder:0,
    startedDay:w.dayIndex,lastTickDay:w.dayIndex,nextTickDay:w.dayIndex+F3F_SIEGE_DAYS,casualties:0,
    siegeClockDay:w.dayIndex,siegeCreditDays:0,siegeEligible:false};
  w.occupations.push(o);army.order=null;army.operation={type:'OCCUPY',targetTileId:tid};army.needsOrders=false;
  mark(w,`${w.nations[army.nationId].name}군이 (${t.x}, ${t.y}) 지역 점령을 시작했습니다.`);
  return o;
}
function clearOccupationForWar(w,warId){w.occupations=w.occupations.filter(o=>o.warId!==warId);}
function occupyingForces(w,o){
  const war=w.wars.find(v=>v.id===o.warId);
  if(!war)return [];
  const side=warSide(war,o.nationId);
  return w.armies.filter(a=>a.tileId===o.tileId&&warSide(war,a.nationId)===side&&
    hCombatPresence(w,a)>0&&(a.status==='READY'||a.status==='ENGAGED'));
}
function occupationRepresentative(w,o,forces){
  // Keep the initiator while present; otherwise hand leadership to the lowest army ID.
  if(forces.some(a=>a.nationId===o.nationId))return;
  const next=forces.slice().sort((a,b)=>a.id-b.id)[0];
  if(next)o.nationId=next.nationId;
}
/** A fixed region attacks at the SAME strength-to-casualty scale as army melee (~power/65).
 * A single attack every 5 days; fractional damage is carried in the occupation record.
 * Losses are allocated proportional to actual participating army sizes, never to virtual units.
 */
function regionAttackLoss(w,o,forces,firepower){
  if(firepower<=0||!forces.length)return 0;
  const incoming=firepower/65*(.74+roll(w)*.50);
  const accumulated=(o.attackRemainder||0)+incoming;
  const casualties=Math.floor(accumulated+1e-9);
  o.attackRemainder=Math.max(0,accumulated-casualties);
  if(casualties<=0)return 0;
  const originals=forces.map(a=>hCombatPresence(w,a)),total=originals.reduce((a,b)=>a+b,0);
  const actual=Math.min(total,casualties);
  const allocations=originals.map(v=>Math.floor(actual*v/total));
  let unassigned=actual-allocations.reduce((a,b)=>a+b,0);
  const order=originals.map((v,i)=>({i,remainder:actual*v/total-allocations[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
  for(let i=0;i<unassigned;i++)allocations[order[i].i]++;
  let removed=0;
  for(let i=0;i<forces.length;i++){
    const army=forces[i],machine=hCount(w,army),human=manpower(army);
    const mechanicalHits=Math.min(machine,Math.round(allocations[i]*machine/Math.max(1,machine+human)));
    const loss=militaryLosses(army,allocations[i]-mechanicalHits,'BATTLE',w.dayIndex);removed+=loss;
    let mleft=mechanicalHits;
    for(const group of hGroups(w,army)){if(mleft<=0)break;const hit=Math.min(mleft,group.ready+group.damaged);hDamage(w,group,hit,'FIELD');mleft-=hit;}
    if(loss>0)forces[i].morale=LIMIT(forces[i].morale-Math.max(1,Math.round(loss/Math.max(1,originals[i])*80)),0,100);
  }
  return removed;
}
/** The credit belongs to the PREVIOUS interval, never a battle started today. */
function siegeIsUnopposed(w,o,forces,war){
  return !forces.some(a=>fighting(w,a))&&!w.armies.some(a=>a.tileId===o.tileId&&
    warAgainst(w,a.nationId,o.nationId)&&hCombatPresence(w,a)>0);
}
function updateSiegeClock(w,o,forces,war){
  // No daily world scan: interval length is derived from the last military event.
  const elapsed=Math.max(0,w.dayIndex-o.siegeClockDay);
  if(o.siegeEligible&&elapsed>0)o.siegeCreditDays+=elapsed;
  o.siegeClockDay=w.dayIndex;
  const unopposed=siegeIsUnopposed(w,o,forces,war);
  o.siegeEligible=unopposed;
  o.nextTickDay=w.dayIndex+(unopposed?Math.max(1,F3F_SIEGE_DAYS-o.siegeCreditDays):F3F_SIEGE_DAYS);
}
function processOccupationDay(w){
  for(const o of w.occupations.slice()){
    const tile=w.tiles[o.tileId],war=w.wars.find(v=>v.id===o.warId);
    const forces=occupyingForces(w,o);
    if(!war||!tile||tile.ownerId!==o.defenderId||!forces.length||
      (tile.occupiedBy!==null&&warSide(war,tile.occupiedBy)===warSide(war,o.nationId))){
      w.occupations=w.occupations.filter(v=>v!==o);
      for(const a of forces){a.operation=null;a.needsOrders=true;}w.changeSeq++;continue;
    }
    occupationRepresentative(w,o,forces);
    updateSiegeClock(w,o,forces,war);
    if(o.siegeCreditDays<F3F_SIEGE_DAYS)continue;
    // Carry any excess credit from a long event jump, but never mint contested days.
    o.siegeCreditDays-=F3F_SIEGE_DAYS;
    o.lastTickDay=w.dayIndex;
    o.nextTickDay=w.dayIndex+(o.siegeEligible?Math.max(1,F3F_SIEGE_DAYS-o.siegeCreditDays):F3F_SIEGE_DAYS);
    // Region statistics may change with research, upgrades or ownership, not with mean map values.
    const stats=regionalMilitaryStats(w,o.tileId);
    o.resistance=stats.resistance;
    o.firepower=allyAccess(w,o.nationId,tile.ownerId)?0:stats.firepower; // No friendly coalition fort firing on its liberators.
    const before=forces.map(a=>remaining(a));
    const loss=regionAttackLoss(w,o,forces,o.firepower);o.casualties+=loss;
    if(loss){
      // Actual per-army losses; allied casualty ledgers cannot charge only the leader.
      war.occupationCasualties??={};war.casualties??={};
      for(let i=0;i<forces.length;i++){
        const died=before[i]-remaining(forces[i]),id=forces[i].nationId;
        if(died>0){war.casualties[id]=(war.casualties[id]||0)+died;
          war.occupationCasualties[id]=(war.occupationCasualties[id]||0)+died;}
      }
    }
    // Real survivors alone produce progress, with no minimum fictitious one-man advance.
    if(forces.every(a=>hCombatPresence(w,a)===0)){w.occupations=w.occupations.filter(v=>v!==o);w.changeSeq++;continue;}
    let progress=occupationProgressPerTick(occupationEffectiveMen(w,forces),o.resistance);
    // V0.7B: gunpowder is only effective on a real siege tick with a paid invoice.
    const siegeNation=w.nations[o.nationId];
    if(siegeNation?.active&&hasTech(w,o.nationId,'gunpowder_manufacturing')&&siegeNation.gold>=6&&siegeNation.resources.iron>=1){
      siegeNation.gold-=6;siegeNation.resources.iron-=1;
      progress*=1+techBonus(w,o.nationId,'paidSiegeBonus');
      war.gunpowderSpent??={};war.gunpowderSpent[o.nationId]=(war.gunpowderSpent[o.nationId]||0)+6;
      war.militaryCosts??={};war.operationalCosts??={};
      war.militaryCosts[o.nationId]=(war.militaryCosts[o.nationId]||0)+6;
      war.operationalCosts[o.nationId]=(war.operationalCosts[o.nationId]||0)+6;
    }
    // Track real participant shares for later multi-party settlements (E3).
    o.participation??={};war.occupationWork??={};
    const weights=new Map();for(const a of forces){
      const eff=occupationEffectiveMen(w,[a]);weights.set(a.nationId,(weights.get(a.nationId)||0)+eff);
    }
    const total=[...weights.values()].reduce((sum,v)=>sum+v,0);
    if(total>0)for(const [id,effective] of weights){
      const contribution=progress*effective/total;
      o.participation[id]=(o.participation[id]||0)+contribution;
      war.occupationWork[id]=(war.occupationWork[id]||0)+contribution;
    }
if(!allyAccess(w,o.nationId,tile.ownerId))damageFortAt(w,o.tileId,progress);
    o.progress=Math.min(100,o.progress+progress);w.changeSeq++;
    if(o.progress>=100){
      const credited=Object.keys(o.participation).map(Number)
        .sort((a,b)=>(o.participation[b]||0)-(o.participation[a]||0)||a-b)[0]??o.nationId;
      if(allyAccess(w,o.nationId,tile.ownerId)){tile.occupiedBy=null;tile.occupiedWarId=null;}
      else{tile.occupiedBy=credited;tile.occupiedWarId=war.id;war.occupationCount=(war.occupationCount||0)+1;
        war.score+=warSide(war,credited)==='attackers'?.45:-.45;}
      war.occupationContributions??={};
      war.occupationContributions[credited]=(war.occupationContributions[credited]||0)+1;
      w.occupations=w.occupations.filter(v=>v!==o);
      for(const a of forces){a.operation=null;a.needsOrders=true;}
      mark(w,`${w.nations[credited].name}군을 포함한 연합군이 (${tile.x}, ${tile.y}) 지역 점령을 완료했습니다. (${w.dayIndex-o.startedDay}일·손실 ${o.casualties}명)`);
    }
  }
}
function nextOccupationDay(w){return w.occupations.reduce((min,o)=>
  o.siegeEligible?Math.min(min,Math.max(w.dayIndex+1,o.siegeClockDay+Math.max(1,F3F_SIEGE_DAYS-o.siegeCreditDays))):min,Infinity);}
