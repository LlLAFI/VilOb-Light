// --- src/sim/roads.js ---
/** Road V1: permanent tile infrastructure, no individual travelers, carts or laborers. */



const TERRAIN_TIME={plain:3,grass:3,forest:5,rock:4,mountain:7};
const roadLevel=t=>t?.roadLevel||0;
function roadLegal(w,nationId,act){
  const t=w.tiles[act?.targetTileId];
  return Boolean(t&&TERRAINS[t.terrain].passable&&t.ownerId===nationId&&t.occupiedBy===null&&
    (act.type==='BUILD_ROAD'&&roadLevel(t)===0&&(t.terrain!=='mountain'||hasTech(w,nationId,'mountain_engineering'))||act.type==='UPGRADE_ROAD'&&roadLevel(t)===1&&(t.terrain!=='mountain'||hasTech(w,nationId,'rock_cutting'))));
}
function roadPrice(act,w=null,nationId=null){
const raw=act.type==='UPGRADE_ROAD'?{apUnits:6,gold:22,knowledge:0,resources:{wood:3,stone:5}}:{apUnits:5,gold:12,knowledge:0,resources:{wood:5,stone:1}};
 const discount=w&&nationId!==null?Math.min(.5,techBonus(w,nationId,'roadBuildCostDiscount')):0;
 const carry=w&&nationId!==null?(w.nations[nationId].roadDiscountCarry||{}):{};
 return {...raw,resources:Object.fromEntries(Object.entries(raw.resources).map(([k,v])=>[k,Math.max(0,Math.ceil(v*(1-discount)-(carry[k]||0)-1e-9))]))};
}
function marchDays(t,w=null,nationId=null){
  const base=TERRAIN_TIME[t.terrain]??4;
  const level=roadLevel(t),tech=w&&nationId!==null&&level>0?techBonus(w,nationId,'roadTravel')+(level===2?techBonus(w,nationId,'upgradedTravel'):0):0;
  return Math.max(2,base-(level===2?2:level===1?1:0)-tech);
}
/** Weighted A* with binary heap. Uses the ACTUAL road travel time for each step. */
function shortestRoadPath(w,start,end,allowed,mode='march',canExpand=null,nationId=null,fortNet=null){
  if(start===end)return [start];
  if(!w.tiles[start]||!w.tiles[end])return null;
  const cost=new Float64Array(w.tiles.length).fill(Infinity),prev=new Int32Array(w.tiles.length).fill(-1);
  const heap=[];const size=w.size,ex=end%size,ey=Math.floor(end/size);
  const estimate=id=>{
     if(mode!=='march'&&mode!=='military')return 0;
     const dx=Math.abs(id%size-ex),dy=Math.abs(Math.floor(id/size)-ey);
     return mode==='military'?2*(Math.max(dx,dy)-Math.min(dx,dy)+Math.SQRT2*Math.min(dx,dy)):2*(dx+dy);
   };
  const push=(f,id)=>{let i=heap.length;heap.push([f,id]);while(i>0){const p=(i-1)>>1;if(heap[p][0]<=f)break;heap[i]=heap[p];i=p;}heap[i]=[f,id];};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}return top;};
  cost[start]=0;push(estimate(start),start);
  while(heap.length){
    const [rank,u]=pop();if(rank>cost[u]+estimate(u)+1e-8)continue;if(u===end)break;
    if(canExpand&&u!==start&&!canExpand(u))continue;
    for(const v of (mode==='military'?neighborsMilitary8(u,size,w.height):neighbors4(u,size,w.height))){
      const t=w.tiles[v];if(!TERRAINS[t.terrain].passable||!allowed(t))continue;
      if(mode==='military'&&!militaryStepPermitted(w,u,v,nationId,fortNet))continue;
      // G2A tactical A*: both actual road/tech speed and sqrt(2) diagonal cost.
      // Civil road-building retains its old path metric and 4-neighbor graph.
      const step=mode==='build'?(t.terrain==='mountain'?3.3:t.terrain==='rock'?2.2:t.terrain==='forest'?1.6:1)+(roadLevel(t)>0?-0.82:0):
        mode==='military'?marchDays(t,w,nationId)*(militaryDiagonal(u,v,size)?Math.SQRT2:1):marchDays(t);
      const next=cost[u]+step;
      if(next<cost[v]){cost[v]=next;prev[v]=u;push(next+estimate(v),v);}
    }
  }
  if(!Number.isFinite(cost[end]))return null;
  const path=[end];let cursor=end;
  while(cursor!==start){cursor=prev[cursor];if(cursor<0)return null;path.push(cursor);}
  return path.reverse();
}
/** Only contiguous roads with safe friendly ownership count as settlement connections. */
/** F2: one flood-fill of the safe national road graph.
 * The existing segments/connected fields stay compatible with military and fiscal logic.
 * Supplementary component metrics live only in this transient return object.
 */
function roadConnections(w,nationId){
  const cores=w.settlements.filter(s=>s.ownerId===nationId&&w.tiles[s.coreTileId]?.occupiedBy===null).map(s=>s.coreTileId);
  const coreSet=new Set(cores),visited=new Set(),segments=[],networks=[],coreNetwork=new Map(),bonusByCore=new Map();
  let connected=0,roadTiles=0,upgradedTiles=0;
  for(const t of w.tiles)if(t.ownerId===nationId&&t.roadLevel>0){roadTiles++;if(t.roadLevel===2)upgradedTiles++;}
  for(const core of cores){
    if(visited.has(core)||roadLevel(w.tiles[core])===0)continue;
    const queue=[core],segment=[];visited.add(core);let count=0,advanced=0;
    for(let k=0;k<queue.length;k++){
      const id=queue[k],tile=w.tiles[id];count++;if(tile.roadLevel===2)advanced++;
      if(coreSet.has(id))segment.push(id);
      for(const next of neighbors4(id,w.size,w.height)){
        const t=w.tiles[next];
        if(visited.has(next)||t.ownerId!==nationId||t.occupiedBy!==null||roadLevel(t)===0)continue;
        visited.add(next);queue.push(next);
      }
    }
    const index=networks.length,quality=count?advanced/count:0;
    const bonus=segment.length>=2?Math.min(.10,.05+.01*Math.min(3,segment.length-2)+.02*quality):0;
    const component={cores:segment,roadTiles:count,upgradedTiles:advanced,quality,bonus};
    networks.push(component);segments.push(segment);
    for(const id of segment){coreNetwork.set(id,index);bonusByCore.set(id,bonus);}
    connected+=Math.max(0,segment.length-1);
  }
  return {settlements:cores.length,connected,roadTiles,upgradedTiles,segments,networks,coreNetwork,bonusByCore};
}
function isRoadSupplied(w,army){
  const t=w.tiles[army.tileId];if(!t||t.ownerId!==army.nationId||t.occupiedBy!==null||!roadLevel(t))return false;
  const targetCores=new Set(w.settlements.filter(s=>s.ownerId===army.nationId).map(s=>s.coreTileId));
  const queue=[army.tileId],seen=new Set(queue);
  for(let k=0;k<queue.length;k++){
    const id=queue[k];if(targetCores.has(id))return true;
    for(const nb of neighbors4(id,w.size,w.height)){
      const x=w.tiles[nb];if(seen.has(nb)||x.ownerId!==army.nationId||x.occupiedBy!==null||roadLevel(x)===0)continue;
      seen.add(nb);queue.push(nb);
    }
  }
  return false;
}
/** F2: bounded component-to-component shortlist instead of O(S^2) A* searches.
 * A long trunk is built one affordable tile per quarter, with no bonus until complete.
 */
function roadCandidate(w,nationId){
  const mine=w.settlements.filter(s=>s.ownerId===nationId&&w.tiles[s.coreTileId]?.occupiedBy===null);
  if(mine.length<2)return null;
  const net=roadConnections(w,nationId);
  const component=new Map();
  for(const s of mine)component.set(s.coreTileId,net.coreNetwork.get(s.coreTileId)??('isolated-'+s.coreTileId));
  const candidates=[],seenPairs=new Set();
  const activeFacilities=new Map();
  for(const x of w.buildings)if(x.status==='ACTIVE')activeFacilities.set(x.settlementId,(activeFacilities.get(x.settlementId)||0)+1);
  const townByCore=new Map(mine.map(s=>[s.coreTileId,s]));
  // Limit candidate discovery to the nearest six OTHER components for each town.
  // This is O(S^2) cheap arithmetic, but only a small bounded number of costly A* calls.
  for(const s of mine){
    const a=s.coreTileId,ax=a%w.size,ay=Math.floor(a/w.size);
    const nearest=[];
    for(const t of mine){
      const b=t.coreTileId;if(a===b||component.get(a)===component.get(b))continue;
      const dist=Math.abs(ax-b%w.size)+Math.abs(ay-Math.floor(b/w.size));
      if(dist>160)continue;
      nearest.push({a:Math.min(a,b),b:Math.max(a,b),dist});
    }
    nearest.sort((x,y)=>x.dist-y.dist||x.b-y.b);
    for(const pair of nearest.slice(0,4)){
      const key=pair.a+':'+pair.b;
      if(!seenPairs.has(key)){seenPairs.add(key);candidates.push(pair);}
    }
  }
  candidates.sort((a,b)=>a.dist-b.dist||a.a-b.a||a.b-b.b);
  let best=null,bestValue=-Infinity;
  // Prefer feasible short trunks; consider at most eight actual paths each evaluation.
  for(const pair of candidates.slice(0,8)){
    const path=shortestRoadPath(w,pair.a,pair.b,t=>t.ownerId===nationId&&t.occupiedBy===null&&(t.terrain!=='mountain'||t.roadLevel>0||hasTech(w,nationId,'mountain_engineering')),'build');
    if(!path||path.length>161)continue;
    const unbuilt=path.filter(id=>roadLevel(w.tiles[id])===0);
    if(!unbuilt.length)continue;
    const sa=townByCore.get(pair.a),sb=townByCore.get(pair.b);
    const populations=(sa?.population||0)+(sb?.population||0);
    // Facility count is a rough economic benefit signal, not a new resource ledger.
    const facilities=(activeFacilities.get(sa?.id)||0)+(activeFacilities.get(sb?.id)||0);
    const economic=(Math.min(350,populations)/350)*.12+Math.min(8,facilities)*.016;
    const cost=unbuilt.length,dist=path.length-1;
    const value=1.12+economic-Math.min(160,dist)*.0027-Math.min(160,cost)*.0024;
    if(value>bestValue){bestValue=value;best={action:{type:'BUILD_ROAD',targetTileId:unbuilt[0]},utility:value};}
  }
  if(best)return best;
  // Improve busy trunk roads first. Avoid speculative costly upgrades.
  if(net.connected&&w.nations[nationId].gold>220&&net.upgradedTiles<Math.floor(net.roadTiles/3)){
    const bestNet=net.networks.filter(n=>n.cores.length>=2).sort((a,b)=>b.cores.length-a.cores.length||b.roadTiles-a.roadTiles)[0];
    if(bestNet){
      const important=new Set(bestNet.cores);
      const close=new Set(bestNet.cores);
      for(const core of bestNet.cores)for(const tid of neighbors4(core,w.size,w.height))close.add(tid);
      const candidate=w.tiles.find(t=>t.ownerId===nationId&&t.roadLevel===1&&t.occupiedBy===null&&close.has(t.id)&&roadLegal(w,nationId,{type:'UPGRADE_ROAD',targetTileId:t.id}));
      if(candidate)return {action:{type:'UPGRADE_ROAD',targetTileId:candidate.id},utility:.70+Math.min(3,bestNet.cores.length)*.02};
    }
  }
  return null;
}
function roadEconomyBonus(w,nationId){
  const info=roadConnections(w,nationId);
  // Small but tangible tax/admin bonus; not a resource transport model.
  return {gold:info.connected*3,apRecoveryUnits:Math.min(5,info.connected),...info};
}


// --- src/sim/local-economy.js ---
/** V0.3F2: transient quarterly settlement production plan.
 * No laborer entities, local inventories, or additional daily simulation ticks.
 * Technology multipliers remain nation-wide, floored once in projectedQuarter.
 */
const LOCAL_WORKERS_PER_PERSON=.45;
const LOCAL_MIN_WORKERS=6;
const LOCAL_LABOR_DEMAND=Object.freeze({farm:16,lumber:12,quarry:16,mine:20,academy:14,workshop:22,coal_pit:20,factory:18,steelworks:35,steam_pump:12,arsenal:22});
function localProductivityReport(w,nationId,roadInfo=null){
  const towns=new Map();
  const produced={food:0,wood:0,stone:0,iron:0};let knowledge=0,foodConditionalBonus=0;
  const forestBonus=techBonus(w,nationId,'forestFarmBonus'),grassBonus=techBonus(w,nationId,'grassFarmBonus'),connectedBonus=techBonus(w,nationId,'connectedFarmBonus');
  const road=roadInfo||roadConnections(w,nationId);
  const connectedCores=new Set(),bonusByCore=new Map(),networkByCore=new Map();
  for(const [i,segment] of road.segments.entries())if(segment.length>=2){
    const network=road.networks?.[i];
    const bonus=network?.bonus??.05;
    for(const id of segment){connectedCores.add(id);bonusByCore.set(id,bonus);networkByCore.set(id,network||{cores:segment,roadTiles:0,upgradedTiles:0,quality:0,bonus});}
  }
  for(const s of w.settlements){
    if(s.ownerId!==nationId)continue;
    const workers=Math.max(LOCAL_MIN_WORKERS,Math.floor(s.population*LOCAL_WORKERS_PER_PERSON));
    towns.set(s.id,{id:s.id,name:s.name,population:s.population,development:s.development,
      workers,demand:0,utilization:1,developmentFactor:1,roadBonus:bonusByCore.get(s.coreTileId)||0,roadNetwork:networkByCore.get(s.coreTileId)||null,
      multiplier:1,activeFacilities:0,produced:{food:0,wood:0,stone:0,iron:0},knowledge:0});
  }
  // One pass groups eligible production facilities by settlement, with no world-wide
  // settlement lookup or occupation lookup per building.
  const groups=new Map();
  const occupied=new Set(w.occupations.map(o=>o.tileId));
  for(const b of w.buildings){
    const local=towns.get(b.settlementId),tile=w.tiles[b.tileId];
    if(!local||!tile||tile.ownerId!==nationId||tile.occupiedBy!==null)continue;
    const base=facilityOutput(b,tile.terrain);if(!base)continue;
    // F2C2C: a deliberately idled industrial site uses no production labor.
    if(b.typeId==='factory'&&!f2c2cCanProduce(w.nations[nationId],'machine_parts'))continue;
    if(b.typeId==='steelworks'&&!f2c2cCanProduce(w.nations[nationId],'steel'))continue;
    if(!groups.has(b.settlementId))groups.set(b.settlementId,[]);
    groups.get(b.settlementId).push({b,base,terrain:tile.terrain,underAttack:occupied.has(b.tileId)});
    const rawDemand=b.typeId==='factory'?(F2_FACTORY_LEVELS[b.level]?.labor||18):b.typeId==='steelworks'?v08jSteelSpec(b.level).labor:(LOCAL_LABOR_DEMAND[b.typeId]||0)*g2LevelLabor(b.level);
    const saving=b.typeId==='workshop'?f1LaborSavings(w,b,w.nations[nationId],rawDemand):0;
    local.demand+=rawDemand-saving;local.powerLaborSaved=(local.powerLaborSaved||0)+saving;
    if(LOCAL_LABOR_DEMAND[b.typeId])local.activeFacilities++;
  }
  for(const local of towns.values()){
    const raw=local.demand?Math.min(1,local.workers/local.demand):1;
    local.utilization=.65+.35*raw;
    local.developmentFactor=1+.10*Math.max(0,Math.min(100,local.development))/100;
    local.multiplier=local.utilization*local.developmentFactor*(1+local.roadBonus);
    // Floors apply once per settlement/resource after aggregating all local sites;
    // multiplying an already-rounded tile yield on each facility would drift with
    // the number of buildings and create artificial production per build.
    const total={food:0,wood:0,stone:0,iron:0};let academy=0,conditionalFarmRaw=0;
    let f2bFarmRaw=0;
    for(const {b,base,terrain,underAttack} of groups.get(local.id)||[]){
      const penalty=(underAttack?.5:1)*(e2FocusActive(w,nationId,b)?E2_FOCUS_FACTOR:1);
      for(const k of RESOURCE_KEYS)total[k]+=base.produced[k]*penalty;
      if(b.typeId==='farm'){
        f2bFarmRaw+=base.produced.food*penalty;
        const extra=(terrain==='forest'?forestBonus:0)+(terrain==='grass'?grassBonus:0)+(local.roadNetwork?connectedBonus:0);
        if(b.level>=3)conditionalFarmRaw+=base.produced.food*penalty*techBonus(w,nationId,'advancedFarmBonus');
        if(extra)conditionalFarmRaw+=base.produced.food*penalty*extra;
      }
      academy+=base.knowledge*penalty;
    }
    for(const k of RESOURCE_KEYS){
      local.produced[k]=Math.floor(total[k]*local.multiplier);
      produced[k]+=local.produced[k];
    }
    const f2bPump=groups.get(local.id)?.some(x=>x.b.typeId==='steam_pump'&&x.b.f2bOperatingDay===w.dayIndex);
    if(f2bPump){const added=Math.floor(f2bFarmRaw*local.multiplier*(1+techBonus(w,nationId,'farmFood'))*.02);
      if(added>0){local.produced.food+=added;produced.food+=added;f2bEnsure(w.nations[nationId]).lastQuarter.pumpExtraFood+=added;}
    }
    foodConditionalBonus+=conditionalFarmRaw*local.multiplier;
    local.knowledge=Math.floor(academy*local.multiplier*(1+techBonus(w,nationId,'academyKnowledge')));
    knowledge+=local.knowledge;
  }
  return {towns,produced,knowledge,foodConditionalBonus,road};
}
// --- src/sim/economy.js ---



/** V0.1D1: nation-level treasury, goods, decimal AP, and research stock.
 * Units are aggregated; no person or item logistics entities exist.
 * apUnits stores tenths as integers; multipliers floor ONCE after combining.
 */





const RESOURCE_KEYS=['food','wood','stone','iron'];
const AP_SCALE=10;
const AP_MAX_UNITS=80;
const RESOURCE_LABELS=Object.freeze({food:'식량',wood:'목재',stone:'석재',iron:'철',coal:'석탄',machine_parts:'기계 부품',steel:'강철',artillery_shells:'산업제 포탄'});
const apDisplay=units=>(units/AP_SCALE).toFixed(1);
function apFloorUnits(ap){return Math.max(0,Math.floor((ap+1e-9)*AP_SCALE));}
/** G1: AP capacity stored in tenths; calculation never grants free AP. */
function g1ApCapFor(w,nationId,counts=null){
  const owned=counts?counts[nationId]||0:w.tiles.reduce((sum,t)=>sum+(t.ownerId===nationId&&t.terrain!=='water'?1:0),0);
  return AP_MAX_UNITS+Math.min(70,Math.floor(owned/9))+techBonus(w,nationId,'apCapUnits')+(w.nations[nationId]?.nationalProjects?.levels?.ap_capacity||0)*10;
}
function refreshApCaps(w){
  const counts=new Array(w.nations.length).fill(0);
  for(const t of w.tiles)if(t.ownerId!==null&&t.terrain!=='water')counts[t.ownerId]++;
  for(const n of w.nations){n.apMaxUnits=g1ApCapFor(w,n.id,counts);n.apUnits=Math.min(n.apUnits,n.apMaxUnits);}
}
function newEconomy(){return {constructionProcurement:{plan:null,history:[]},economicRecovery:{history:[]},apLedger:{history:[]},civilFinance:{billedLastQuarter:0,paidLastQuarter:0,unpaidLastQuarter:0,totalPaid:0,totalUnpaid:0},iFreight:iNew(),gold:140,apUnits:50,apMaxUnits:AP_MAX_UNITS,knowledge:0,researchLevel:0,
  resources:{food:130,wood:30,stone:20,iron:3,coal:0,machine_parts:0,steel:0,artillery_shells:0},foodPressure:1,f2bIndustry:f2bNewIndustry(),f2Factory:f2NewFactoryState(),f1Industry:f1NewIndustry(),demographyE3E2:e3e2NewDemography(),e3e3Supply:e3e3NewSupply(),
  lastQuarter:{goldIncome:0,upkeep:0,goldNet:0,apRecovery:0,knowledgeIncome:0,produced:{food:0,wood:0,stone:0,iron:0},foodConsumed:0}};}
function technicalBuildingPrice(w,nationId,base,recycle=false){
  if(!base)return null;const discount=Math.min(.65,techBonus(w,nationId,'materialDiscount')+(recycle?techBonus(w,nationId,'recycledBuildMaterials'):0));
  if(!discount)return base;return {...base,resources:Object.fromEntries(Object.entries(base.resources).map(([k,v])=>[k,Math.ceil(v*(1-discount))]))};
}
function getActionPrice(world,nationId,action,territory=null){
  const nation=world.nations[nationId];if(!nation||!action)return null;
  const make=(ap,gold=0,resources={},knowledge=0)=>({apUnits:apFloorUnits(ap),gold,resources,knowledge});
  switch(action.type){
    case 'BUILD_ROAD':case 'UPGRADE_ROAD':return roadPrice(action,world,nationId);
    case 'BUILD_FACILITY':return technicalBuildingPrice(world,nationId,buildPrice(action.buildingType),action.buildingType!=='fort');
    case 'REDEVELOP_FACILITY':return redevelopmentPrice(world,nationId,action);
    case 'UPGRADE_FACILITY':{const b=getStructure(world,action.buildingId);return b?technicalBuildingPrice(world,nationId,buildPrice(b.typeId,b.level+1),b.typeId!=='fort'):null;}
    case 'REPAIR_FORT':{const d=(world.defenses||[]).find(d=>d.id===action.buildingId);return d?technicalBuildingPrice(world,nationId,repairFortPrice(d)):null;}
    case 'CLAIM_TILE':{const claim=getClaimCost(world,nationId,action.targetTileId,territory);return claim?make(1,claim.cost):null;}
    case 'FOUND_SETTLEMENT':return make(2,60,{wood:12,stone:5});
    case 'DEVELOP_SETTLEMENT':return make(1,25,{wood:6,stone:2});
    case 'EXPAND_SETTLEMENT':{
      const settlement=world.settlements.find(s=>s.id===action.settlementId&&s.ownerId===nationId);
      const candidate=settlementExpansionCandidate(world,settlement,action.targetTileId,territory?.footprintDemands?.get(action.settlementId));
      return candidate?make(.8,candidate.gold,{wood:3}):null;
    }
    case 'MERGE_SETTLEMENTS':return make(.8,12);
    case 'INVEST_KNOWLEDGE':return make(1,30,{},12);
    case 'START_RESEARCH':return researchLegal(world,nationId,action.technologyId)?make(.3):null;
    case 'SET_WORKSHOP_MODE':return make(.1);
    case 'INSTALL_WORKSHOP_POWER':return f1PowerInstallPrice(world,nationId,action);
    case 'TRADE_BUY':case 'TRADE_SELL':return make(0);
    case 'TRAIN_RESERVES':return make(.5,Math.ceil(action.amount*.85));
    case 'TRAIN_FORMATION':{const a=world.armies.find(a=>a.id===action.armyId&&a.nationId===nationId);return a?make(.5,Math.max(30,Math.ceil(manpower(a)*.35))):null;}
    case 'EMERGENCY_MUSTER':return make(1.5,recruitmentPrice({amount:action.amount,composition:[{typeId:'levy',position:'front',amount:action.amount}]})?.gold||0);
    case 'RAISE_ARTILLERY':{
      const count=action.guns;
      if(!Number.isSafeInteger(count)||count<1||count>3)return null;
      const crew=E2_GUN_CREW*count,kit=LOADOUTS.field_artillery;
      const existing=Math.min(count,world.e2Artillery?.stocks?.[nationId]||0),fabricated=count-existing;
      return make(1.5,Math.ceil(fabricated*E2_GUN_PRICE.gold+crew*kit.gold),
        {wood:fabricated*E2_GUN_PRICE.wood,iron:fabricated*E2_GUN_PRICE.iron});
    }
    case 'RECRUIT_ARMY':{const q=recruitmentPrice(action);return q?make(1,q.gold,q.resources):null;}
    case 'REDEPLOY_COHORT':return make(.5);
    case 'REARM_ARMY':return rearmPrice(world,nationId,action);
    case 'REINFORCE_ARMY':{const army=world.armies.find(a=>a.id===action.armyId&&a.nationId===nationId);const q=army?reinforcementPrice(army,action.amount,action.unitId??null):null;return q?make(1,q.gold,q.resources):null;}
    case 'MOVE_ARMY':return make(.2);
    case 'LAND_ARMY':return make(.8,Math.max(15,Math.ceil((world.armies.find(a=>a.id===action.armyId)?.units.reduce((s,u)=>s+u.manpower,0)||0)*.35))); // chartered transport, no fleet entity
    case 'DISBAND_ARMY':return make(0);
    case 'DECLARE_WAR':case 'BETRAY_ALLIANCE':return make(1.5,20);
    case 'IMPROVE_RELATIONS':return make(.5,18);
    case 'OFFER_ALLIANCE':return make(.5,30);
    case 'OFFER_SUBMISSION':case 'ACCEPT_SUBMISSION':case 'REJECT_SUBMISSION':case 'OFFER_RELEASE':case 'ACCEPT_RELEASE':case 'REJECT_RELEASE':
    case 'ACCEPT_ALLIANCE':case 'REJECT_ALLIANCE':case 'END_ALLIANCE':case 'RESPOND_DEFENSE_CALL':case 'RESPOND_ATTACK_CALL':return make(0);
    case 'MAKE_PEACE':case 'OFFER_PEACE':case 'ACCEPT_PEACE':case 'REJECT_PEACE':
    case 'OFFER_INDEPENDENCE_FRONT':case 'ACCEPT_INDEPENDENCE_FRONT':case 'REJECT_INDEPENDENCE_FRONT':
    case 'OFFER_INDEPENDENCE_SUPPORT':case 'ACCEPT_INDEPENDENCE_SUPPORT':case 'REJECT_INDEPENDENCE_SUPPORT':
    case 'OFFER_INDEPENDENCE_BACKING':case 'ACCEPT_INDEPENDENCE_BACKING':case 'REJECT_INDEPENDENCE_BACKING':
    case 'DECLARE_INDEPENDENCE':return make(0);
    default:return null;
  }
}
function canAfford(nation,price){
  return Boolean(nation?.active&&price&&nation.apUnits>=price.apUnits&&nation.gold>=price.gold&&nation.knowledge>=price.knowledge&&
    Object.entries(price.resources||{}).every(([k,v])=>Number.isSafeInteger(v)&&v>=0&&(nation.resources[k]||0)>=v));
}
// V0.4E5: forward-only AP budget ledger; figures are in tenths, not floating AP.
const V04E3_AP_WINDOW=12;
const V04E3_AUX_TYPES=new Set(['BUILD_ROAD','UPGRADE_ROAD','DEVELOP_SETTLEMENT','EXPAND_SETTLEMENT','MERGE_SETTLEMENTS','REPAIR_FORT','INVEST_KNOWLEDGE']);
function v04e4AuxEligible(c,n,q){
  if(V04E3_AUX_TYPES.has(c.action.type))return true;
  if(c.action.type!=='UPGRADE_FACILITY'||!['farm','lumber','quarry','mine','house'].includes(c.facility))return false;
  // Only modest economic recovery projects, never high-level or military construction.
  if(c.fromLevel!==1)return false;
  if(c.facility==='farm')return n.resources.food<Math.max(30,(q.foodConsumed||0)*2)||n.foodPressure<.95||(q.produced?.food||0)<(q.foodConsumed||0);
  if(c.facility==='house')return false; // housing urgency remains a major decision.
  if(c.facility==='lumber')return n.resources.wood<Math.max(30,(q.produced?.wood||0)*12);
  if(c.facility==='quarry')return n.resources.stone<Math.max(30,(q.produced?.stone||0)*12);
  return n.resources.iron<Math.max(20,(q.produced?.iron||0)*12);
}
function v04e3ApCategory(type){
 if(['START_RESEARCH','INVEST_KNOWLEDGE'].includes(type))return 'research';
 if(['REDEPLOY_COHORT','TRAIN_RESERVES','TRAIN_FORMATION','EMERGENCY_MUSTER','RECRUIT_ARMY','RAISE_ARTILLERY','REINFORCE_ARMY','REARM_ARMY','MOVE_ARMY','LAND_ARMY','DISBAND_ARMY','DECLARE_WAR','BETRAY_ALLIANCE','IMPROVE_RELATIONS','OFFER_ALLIANCE','ACCEPT_ALLIANCE','REJECT_ALLIANCE','END_ALLIANCE','RESPOND_DEFENSE_CALL','RESPOND_ATTACK_CALL','MAKE_PEACE','OFFER_PEACE','ACCEPT_PEACE','REJECT_PEACE','OFFER_SUBMISSION','ACCEPT_SUBMISSION','REJECT_SUBMISSION','OFFER_RELEASE','ACCEPT_RELEASE','REJECT_RELEASE',...C2_ACTIONS].includes(type))return 'military';
 return 'civil';
}
function v04e3ApReport(n){return n.apLedger?.history?.at(-1)||null;}
function v04e3OpenQuarter(n,dayIndex,offered){
 n.apLedger??={history:[]};
 const before=n.apUnits,received=Math.min(offered,Math.max(0,n.apMaxUnits-before));
 const rec={dayIndex,opening:before,cap:n.apMaxUnits,offered,received,wasted:offered-received,
   spent:{civil:0,military:0,research:0},blockedAP:0,main:0,auxiliary:0,mainDeferred:0,mainMissed:0,reserved:0,bestBlockedReason:'NONE',bestBlockedAction:'',auxCandidates:0,auxExecutable:0,auxBlocked:0,mainCandidates:0,mainExecutable:0};
 n.apLedger.history.push(rec);
 if(n.apLedger.history.length>V04E3_AP_WINDOW)n.apLedger.history.shift();
}
function v04e3RecordSpent(n,apUnits,category){
 const r=v04e3ApReport(n);if(!r||!Number.isSafeInteger(apUnits)||apUnits<=0)return;
 r.spent[category]=(r.spent[category]||0)+apUnits;
}
function v04e3MilitaryReserve(w,n){
 if(n.controller!=='AI'||w.dayIndex<2*DAYS_PER_YEAR)return 0;
 const target=militaryStrengthTarget(w,n.id),short=Math.max(0,target-activeManpower(w,n.id));
 if(short<12)return 0;
 const fiscal=strategicReport(w,n.id)?.financial;
 if(!militaryAtWar(w,n.id)&&fiscal&&(fiscal.balance<0||n.gold<Math.max(200,(fiscal.military+fiscal.civil)*2)))return 0;
 const mil=w.aiProfiles[n.aiProfileId]?.military?.militaryInvestment??50;
 const urgent=Boolean(militaryAtWar(w,n.id))||mil>=45&&n.military.reserveReady>=12||short>=Math.max(100,target*.15)&&mil>=55;
 return urgent?10:short>=Math.max(120,target*.20)?5:0;
}
function v04e3ApCsv(w){
 const fields=['nationId','nation','dayIndex','year','quarter','opening','cap','offered','received','wasted','spentCivil','spentMilitary','spentResearch','blockedAP','reserved','main','mainDeferred','mainMissed','auxiliary','auxCandidates','auxExecutable','auxBlocked','mainCandidates','mainExecutable','bestBlockedReason','bestBlockedAction'];
 const lines=[fields];
 for(const n of w.nations)for(const r of n.apLedger?.history||[])lines.push([n.id,n.name,r.dayIndex,Math.floor(r.dayIndex/120)+1,Math.floor((r.dayIndex%120)/30)+1,
   ...['opening','cap','offered','received','wasted'].map(k=>r[k]/10),r.spent.civil/10,r.spent.military/10,r.spent.research/10,r.blockedAP,r.reserved/10,r.main,r.mainDeferred,r.mainMissed,r.auxiliary,r.auxCandidates||0,r.auxExecutable||0,r.auxBlocked||0,r.mainCandidates||0,r.mainExecutable||0,r.bestBlockedReason||'NONE',r.bestBlockedAction||'']);
 return lines.map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
function payCost(nation,price,category='civil'){
  if(!canAfford(nation,price))return false;
  nation.apUnits-=price.apUnits;v04e3RecordSpent(nation,price.apUnits,category);nation.gold-=price.gold;nation.knowledge-=price.knowledge;
  for(const [k,v] of Object.entries(price.resources||{}))nation.resources[k]-=v;
  return true;
}
/** Civil operations destroy Gold (not transferred); military payroll has priority.
 * Only completed structures incur fees. All amounts are whole Gold. */
function civilUpkeep(world,nationId){
  const pop=world.settlements.filter(s=>s.ownerId===nationId).reduce((sum,s)=>sum+s.population,0);
  const buildings=world.buildings.filter(b=>b.typeId!=='barracks'&&world.tiles[b.tileId]?.ownerId===nationId&&b.status==='ACTIVE'&&!b.disconnected)
    .reduce((sum,b)=>sum+(b.level<=3?3+2*b.level:b.level===4?16:25),0);
  const forts=(world.defenses||[]).filter(b=>world.tiles[b.tileId]?.ownerId===nationId&&fortEffective(b))
    .reduce((sum,b)=>sum+g2FortUpkeep(b.level),0);
  const roadDiscount=Math.min(.6,techBonus(world,nationId,'roadUpkeepDiscount'));
  const roads=world.tiles.filter(t=>t.ownerId===nationId)
    .reduce((sum,t)=>sum+(t.roadLevel===2?3:t.roadLevel===1?1:0),0);
  const roadCosts=Math.ceil(roads*(1-roadDiscount));
  const gov=world.nations[nationId]?.governance?.national||{};
  const services=e3ServiceDue(Math.floor(pop*.06),gov.publicServices||'NORMAL');
  const relief=gov.relief==='ON'?e3aSocialDue(pop,'relief'):0;
  const security=gov.security==='ON'?e3aSocialDue(pop,'security'):0;
  const barracks=v04eBarracksCandidates(world,nationId).reduce((sum,b)=>sum+V04E_BARRACKS[b.level].upkeep,0);
  return {services,relief,security,buildings,forts,roads:roadCosts,barracks,total:services+relief+security+buildings+forts+roadCosts+barracks};
}
function ensureCivilFinance(n){
  if(!n.civilFinance)n.civilFinance={billedLastQuarter:0,paidLastQuarter:0,unpaidLastQuarter:0,totalPaid:0,totalUnpaid:0};
  return n.civilFinance;
}
function projectedQuarter(world,nation){
  const owned=world.tiles.filter(t=>t.ownerId===nation.id);
  const settlements=world.settlements.filter(s=>s.ownerId===nation.id);
  const pop=settlements.reduce((s,t)=>s+t.population,0),dev=settlements.reduce((s,t)=>s+t.development,0);
  const terrain={plain:0,grass:0,forest:0,rock:0,mountain:0};for(const t of owned)terrain[t.terrain]=(terrain[t.terrain]||0)+1;
  // 30% terrain gathering + one unit/quarter safety floor for active settled nations. Specialized sites remain superior.
  const passive={food:Math.floor((7+terrain.plain*3+terrain.grass*2+settlements.length*6+dev*.15)*.30),
    wood:Math.max(settlements.length?1:0,Math.floor((2+terrain.forest*2.5+terrain.grass*.25+settlements.length)*.30)),
    stone:Math.max(settlements.length?1:0,Math.floor((1+terrain.rock*2.2+terrain.mountain*2.6+settlements.length*.5)*.30)),
    iron:Math.floor(((terrain.rock+terrain.mountain)*.4+dev/140)*.30)};
  // Reuse the single roads graph for both local productivity and national fiscal income.
  const network=roadEconomyBonus(world,nation.id);
  const regionalEconomy=localProductivityReport(world,nation.id,network);
  const facilities={produced:regionalEconomy.produced,knowledge:regionalEconomy.knowledge};
  const produced=Object.fromEntries(RESOURCE_KEYS.map(k=>{
    const miningBonus=(nation.nationalProjects?.levels?.mining||0)*.05;
     const bonus={food:techBonus(world,nation.id,'farmFood'),wood:techBonus(world,nation.id,'lumberWood'),stone:techBonus(world,nation.id,'quarryStone')+miningBonus,iron:techBonus(world,nation.id,'mineIron')+miningBonus}[k];
    const gathered=k==='food'?Math.floor(passive[k]*(1+techBonus(world,nation.id,'passiveFood'))):passive[k];
    return [k,gathered+Math.floor(facilities.produced[k]*(1+bonus)+(k==='food'?regionalEconomy.foodConditionalBonus:0))];
  }));
  const goldIncome=e3TaxGold((6+pop*.34+dev*.18+owned.length*.15)*(1+techBonus(world,nation.id,'goldIncome')),nation.governance?.national?.tax||'NORMAL')+network.gold+network.connected*techBonus(world,nation.id,'roadGold');
  const foodConsumed=Math.ceil(pop*.38);
  const knowledgeIncome=Math.max(1,Math.floor(settlements.length+dev/55))+facilities.knowledge;
  const upkeepBase=militaryUpkeep(world,nation.id);
  const arrears=nation.military?.operationArrears||0;
  const upkeep=upkeepBase+arrears;
  const civil=civilUpkeep(world,nation.id);
  const territory=getTerritoryMetrics(world,nation.id);
  const baseRecovery=2.0+settlements.length*.18;
  const leader=world.characters.find(c=>c.id===nation.leaderId);
  const leadership=1+((leader?.administration??50)-50)/650;
  // Round-off only once, and retain no hidden fractions.
  const apRecovery=apFloorUnits(baseRecovery*territory.efficiency*leadership)+network.apRecoveryUnits+techBonus(world,nation.id,'apUnits')+(nation.nationalProjects?.levels?.ap_recovery||0)*2;
  return {produced,foodConsumed,goldIncome,upkeep,upkeepBase,civil,operationArrears:arrears,knowledgeIncome,apRecovery,territoryEfficiency:territory.efficiency,regionalEconomy};
}
/** V0.7B: real resource-consuming craft production, exactly once per economic quarter.
 * Independent of trade and no RNG. Building-id order is stable for stock contention. */
function v07bWorkshopQuarter(world,projections){
  const results=new Map();
  const riverbank=new Set();
  // Each watercourse edge is recorded only at the beginning of the quarter.
  if((world.riverSegments||[]).length)for(const b of world.buildings){
    if(b.typeId==='workshop'&&riverAdjacentTileInfo(world,b.tileId).riverbank)riverbank.add(b.id);
  }
  for(const n of world.nations){if(n.active)results.set(n.id,{dayIndex:world.dayIndex,sites:0,operated:0,woodUsed:0,ironUsed:0,gold:0,watermills:0,alternativePower:0,precisionOperated:0,precisionGold:0});}
  const occupied=new Set((world.occupations||[]).map(o=>o.tileId));
  const sorted=world.buildings.filter(b=>b.typeId==='workshop'&&b.status==='ACTIVE'&&!b.disconnected).sort((a,b)=>a.id-b.id);
  for(const b of sorted){
    const t=world.tiles[b.tileId],s=world.settlements.find(s=>s.id===b.settlementId);
    const n=t?.ownerId===s?.ownerId?world.nations[s.ownerId]:null;
    if(!n?.active)continue;
    const r=results.get(n.id);r.sites++;
    if(t.occupiedBy!==null||occupied.has(t.id)||s.population<=0)continue;
    const local=projections.get(n.id)?.regionalEconomy?.towns?.get(s.id);
    if(!local||local.workers<=0||(!local.roadNetwork&&t.roadLevel===0&&world.tiles[s.coreTileId]?.roadLevel===0))continue;
    const inputLevel=Math.min(3,Math.max(1,b.level));
    const precision=inputLevel===3&&b.workshopMode==='precision'&&n.civilization?.era==='early_modern'&&
      n.civilization.stage>=3&&hasTech(world,n.id,'precision_workshop_methods');
    const wood=precision?16:4*inputLevel,iron=precision?9:2*inputLevel;
    if(n.resources.wood<wood||n.resources.iron<iron)continue;
    if(n.resources.wood-wood<f1bWoodReserve(world,n)){
      e3e3EnsureSupply(n).f1b.lastQuarter.workshopDeferred++;continue;
    }
    const choice=f1ChoosePower(world,b,n,local,riverbank.has(b.id));
    const outside=i2Pull(world,n,s.id,Math.max(0,65-choice.pu),b.id,true);
    const power=1+(choice.pu+outside)/100;
    n.resources.wood-=wood;n.resources.iron-=iron;
    if(choice.source==='STEAM'){n.resources.coal-=3-techBonus(world,n.id,'industrialSteamCoalSaving');n.gold-=12;}
    f1RecordWorkshopPower(world,n,b,choice,local);
    b.lastPower.externalPowerUsed=outside;
    i2Offer(world,n,b,b.lastPower.unused);
    // Use the existing settlement labor/development/roads utilization, with one floor.
    const gold=Math.max(0,Math.floor(72*inputLevel*local.multiplier*power*(1+techBonus(world,n.id,'workshopGold'))*(precision?1.20:1)));
    n.gold+=gold;r.operated++;r.woodUsed+=wood;r.ironUsed+=iron;r.gold+=gold;
b.lastOperatedDay=world.dayIndex;if(precision){r.precisionOperated++;r.precisionGold+=gold;}
    if(choice.source==='WATERWHEEL')r.watermills++;else if(choice.source==='MECHANICAL')r.alternativePower++;
  }
  return results;
}
function runEconomyQuarter(world){
  f2bOpenQuarter(world);
  f2cOpenQuarter(world);
  const e3e3WoodStarts=e3e3StartEconomyQuarter(world);
  f1StartEconomyQuarter(world);
  i1StartQuarter(world); // receive actual delivered cargo, reconcile prior legacy spending
  i2StartQuarter(world); // I2 non-storable power: new quarter, no free generation
  f2bRunPumpsBeforeProduction(world);
  finishTrainingQuarter(world);
  f2c2cPlanProductionQuarter(world);
  const projections=new Map(world.nations.filter(n=>n.active).map(n=>[n.id,projectedQuarter(world,n)]));
  for(const n of world.nations){
    if(!n.active)continue;
    const q=projections.get(n.id);
    v04e3OpenQuarter(n,world.dayIndex,q.apRecovery);
    n.apUnits=Math.min(n.apMaxUnits,n.apUnits+q.apRecovery);
    n.gold+=q.goldIncome;
    const ironBefore=n.resources.iron;
    for(const key of RESOURCE_KEYS)n.resources[key]=Math.min(1000000,n.resources[key]+q.produced[key]);
    if(i1Active(world,n)){
      let left=n.resources.iron-ironBefore;
      for(const [sid,town] of q.regionalEconomy.towns){const qty=Math.min(left,town.produced.iron||0);
        if(qty){i1Credit(world,n,{settlementId:sid},'iron',qty);left-=qty;}if(!left)break;}
    }
    f1RunCoalQuarter(world,n,q);
  }
  // Reserve physical materials for craft production BEFORE international trade.
  // Emergency forestry runs after normal physical production and before optional
  // craft/trade. It cannot take land or labor already occupied by regular industry.
  const f1bWoodResults=new Map(),f1bSites=f4d3SiteUsage(world);
  for(const n of world.nations)if(n.active)f1bWoodResults.set(n.id,f1bForestQuarter(world,n,projections.get(n.id),f1bSites));
  i2aPrepareStandby(world,projections);
  const workshopResults=v07bWorkshopQuarter(world,projections);
  const factoryResults=f2RunFactoryQuarter(world,projections);
  i2FinishQuarter(world); // actual operated surplus only; conservation audited
  f2bRunSteelworksQuarter(world,projections);
  f2cRunArsenalQuarter(world,projections);
  // All states receive current-quarter output before bilateral trade; consume only afterward.
  runTradeQuarter(world,projections);
  for(const n of world.nations){
    if(!n.active)continue;
    const q=projections.get(n.id);
    const foodAvailable=n.resources.food;
    n.resources.food=Math.max(0,foodAvailable-q.foodConsumed);
    n.foodPressure=q.foodConsumed===0?1:Math.min(1,foodAvailable/q.foodConsumed);
    e3e2RecordFoodQuarter(n,world.dayIndex,q); // F2C1: record real post-trade, post-consumption stock + next 120-day forecast.
    // Real military payroll; prolonged deficits cause deterministic desertion (never invent replacement soldiers).
    const paid=Math.min(n.gold,q.upkeep);n.gold-=paid;
    n.military.upkeepPaidLastQuarter=paid;n.military.desertedLastQuarter=0;
    // Incurred operational invoices are paid only once; remaining base pay becomes a debt.
    n.military.operationArrears=Math.max(0,q.upkeep-paid);
    n.military.operationPaidLastQuarter=n.military.operationPaidThisQuarter||0;
    n.military.operationBilledLastQuarter=n.military.operationBilledThisQuarter||0;
    n.military.operationPaidThisQuarter=0;n.military.operationBilledThisQuarter=0;
    n.military.specialistTrainingSpentLastQuarter=n.military.specialistTrainingSpentThisQuarter||0;
    n.military.specialistTrainingSpentThisQuarter=0;
    // Attribute the ACTUAL one-time military upkeep across all wars, without
    // duplicating one nation's payroll in every concurrent war history.
    const wars=warsOfNation(world,n.id).sort((a,b)=>a.id-b.id);
    if(wars.length){
      const men=wars.map(war=>world.armies.filter(a=>a.nationId===n.id&&a.assignedWarId===war.id).reduce((sum,a)=>sum+manpower(a),0));
      const total=men.reduce((x,y)=>x+y,0);
      const weights=total>0?men:wars.map(()=>1);
      const weightTotal=weights.reduce((x,y)=>x+y,0);
      const shares=weights.map(weight=>Math.floor(q.upkeepBase*weight/weightTotal));
      let remainder=q.upkeepBase-shares.reduce((x,y)=>x+y,0);
      // Integer remainder follows a stable war-id order.
      for(let i=0;remainder>0;i=(i+1)%shares.length,remainder--)shares[i]++;
      wars.forEach((war,i)=>{
        war.militaryCosts??={};war.upkeepCosts??={};
        war.militaryCosts[n.id]=(war.militaryCosts[n.id]||0)+shares[i];
        war.upkeepCosts[n.id]=(war.upkeepCosts[n.id]||0)+shares[i];
      });
    }
    if(paid<q.upkeep){
      n.military.unpaidQuarters++;
      const ratio=q.upkeep?1-paid/q.upkeep:0;
      for(const a of world.armies.filter(a=>a.nationId===n.id)){
        a.morale=Math.max(5,a.morale-5-Math.ceil(7*ratio));
        if(n.military.unpaidQuarters<2||a.engagementId!==null)continue;
        const quota=Math.max(1,Math.floor(a.units.reduce((sum,u)=>sum+u.manpower,0)*ratio*Math.min(.13,.025*n.military.unpaidQuarters)));
        let remaining=quota;
        for(const group of a.units){const loss=Math.min(group.manpower,remaining);c3TakeLoss(group,loss,'DESERTION',world.dayIndex);remaining-=loss;n.military.desertedLastQuarter+=loss;if(!remaining)break;}
      }
    }else n.military.unpaidQuarters=0;
    // Destroyed cohorts can no longer occupy a map tile. Remove only outside active battles.
    for(const a of world.armies.filter(a=>a.nationId===n.id&&a.engagementId===null&&a.units.every(u=>u.manpower<=0)&&hCount(world,a,true)===0)){
      e2FinaliseGuns(world,a,n.military.desertedLastQuarter>0?'DESERTION':'FIELD_LOSS');
      c6RecordArmyEnd(world,a,n.military.desertedLastQuarter>0?'DESERTION':'FIELD_LOSS');
      world.armies=world.armies.filter(other=>other.id!==a.id);
      world.characters=world.characters.filter(c=>c.id!==a.commanderId);
      world.occupations=world.occupations.filter(o=>o.armyId!==a.id);
    }
    if(n.military.desertedLastQuarter){world.events.push({dayIndex:world.dayIndex,text:`${n.name}: 군사 급여 미지급으로 ${n.military.desertedLastQuarter}명 탈영`,kind:'army'});if(world.events.length>180)world.events.shift();}

    // Civil upkeep is charged after real military payroll; no fabricated Gold/debt.
    // V0.4E: bill each barracks in stable ID order. Only fully paid, owned,
    // connected structures may grant bonuses until the next quarterly invoice.
    const barracksFinance=n.military.barracksFinance;
    let barracksPaid=0;
    for(const b of v04eBarracksCandidates(world,n.id)){
      const due=V04E_BARRACKS[b.level].upkeep;
      if(n.gold>=due){n.gold-=due;barracksPaid+=due;b.barracksPaidQuarter=v04eQuarterDay(world);}
      else b.barracksPaidQuarter=-1;
    }
    barracksFinance.billedLastQuarter=q.civil.barracks;
    barracksFinance.paidLastQuarter=barracksPaid;
    barracksFinance.unpaidLastQuarter=q.civil.barracks-barracksPaid;
    barracksFinance.totalPaid+=barracksPaid;
    barracksFinance.totalUnpaid+=q.civil.barracks-barracksPaid;
    // E3A: the old civil invoice retains priority; discretionary social measures
    // are all-or-nothing and cannot crowd out the previous public-service payment.
    const finance=ensureCivilFinance(n),baseDue=q.civil.total-q.civil.barracks-q.civil.relief-q.civil.security;
    const otherCivilPaid=Math.min(n.gold,baseDue);
    n.gold-=otherCivilPaid;
    const serviceFinance=n.governance.serviceFinance,servicePaid=Math.min(otherCivilPaid,q.civil.services);
    serviceFinance.lastQuarterDay=world.dayIndex;serviceFinance.billed=q.civil.services;serviceFinance.paid=servicePaid;serviceFinance.unpaid=q.civil.services-servicePaid;
    serviceFinance.totalPaid+=servicePaid;serviceFinance.totalUnpaid+=serviceFinance.unpaid;
    const social=n.governance.socialFinance;
    let socialPaid=0;
    social.lastQuarterDay=world.dayIndex;
    for(const key of E3A_SOCIAL_KEYS){
      const due=q.civil[key];
      const paid=due>0&&n.gold>=due?due:0;
      n.gold-=paid;socialPaid+=paid;
      social[key+'Billed']=due;social[key+'Paid']=paid;
    }
    social.billed=q.civil.relief+q.civil.security;social.paid=socialPaid;social.unpaid=social.billed-socialPaid;
    social.totalPaid+=socialPaid;social.totalUnpaid+=social.unpaid;
    const civilPaid=barracksPaid+otherCivilPaid+socialPaid;
    finance.billedLastQuarter=q.civil.total;finance.paidLastQuarter=civilPaid;
    finance.unpaidLastQuarter=q.civil.total-civilPaid;finance.totalPaid+=civilPaid;finance.totalUnpaid+=finance.unpaidLastQuarter;
    // V0.7C: attached academy print rooms, paid after mandatory upkeep.
    // Real wood + treasury expenses; Knowledge is minted only if both can be paid.
    const printing={dayIndex:world.dayIndex,sites:0,operated:0,woodUsed:0,goldUsed:0,knowledge:0};
    if(hasTech(world,n.id,'publishing_organization'))for(const b of world.buildings){
      if(b.typeId!=='academy'||b.status!=='ACTIVE'||b.disconnected||world.tiles[b.tileId]?.ownerId!==n.id||world.tiles[b.tileId]?.occupiedBy!==null)continue;
      const town=world.settlements.find(s=>s.id===b.settlementId&&s.ownerId===n.id&&s.population>0);
      const local=town&&projections.get(n.id)?.regionalEconomy?.towns?.get(town.id);
      if(!town||!local||local.workers<=0)continue;
      printing.sites++;
      const wood=2*b.level,gold=24*b.level,knowledge=Math.floor(12*b.level*(1+techBonus(world,n.id,'printingKnowledge')));
      if(n.resources.wood<wood||n.gold<gold)continue;
      if(n.resources.wood-wood<f1bWoodReserve(world,n)){
        e3e3EnsureSupply(n).f1b.lastQuarter.printingDeferred++;continue;
      }
      n.resources.wood-=wood;n.gold-=gold;printing.operated++;printing.woodUsed+=wood;printing.goldUsed+=gold;printing.knowledge+=knowledge;
    }
    n.knowledge=Math.min(1000000,n.knowledge+q.knowledgeIncome+printing.knowledge);
    // Transient town Maps are not persisted in the national quarterly ledger.
    const {regionalEconomy:localReport,...accounting}=q;
    const workshop=workshopResults.get(n.id);
    n.lastQuarter={...accounting,workshop,factory:factoryResults.get(n.id),f1:f1EnsureIndustry(n).lastQuarter,woodRecoveryF1B:f1bWoodResults.get(n.id),printing,knowledgeIncome:q.knowledgeIncome+printing.knowledge,goldIncome:q.goldIncome+(workshop?.gold||0),goldNet:q.goldIncome+(workshop?.gold||0)-paid-civilPaid-printing.goldUsed-(f1bWoodResults.get(n.id)?.goldSpent||0)-(f1EnsureIndustry(n).lastQuarter.steamOperatingGold||0)-(i2Ensure(world).lastQuarter.standbyByNation?.[n.id]?.basicGold||0)-(f1EnsureIndustry(n).lastQuarter.coalSites||0)*F2B2_COAL_PIT_OPERATING_GOLD-(factoryResults.get(n.id)?.goldSpent||0)-(n.f2cArsenal?.lastQuarter?.goldUsed||0)+n.trade.quarterExportValue-n.trade.quarterImportValue,upkeepPaid:paid,civilPaid,civilUnpaid:finance.unpaidLastQuarter,tradeImportValue:n.trade.quarterImportValue,tradeExportValue:n.trade.quarterExportValue};
    e1SettleQuarter(world,n);
  }
  // F3 diagnostics run after real deliveries, consumption and upkeep.
  updateTradeDependency(world,projections);
  f1FinishEconomyQuarter(world);
  f2cCloseQuarter(world);
  f2bCloseQuarter(world);
  f2c2cFinishProductionQuarter(world);
  e3e3FinishEconomyQuarter(world,e3e3WoodStarts);
  // I1A: actual freight dispatch is deferred until quarterly national + military charges finish.
  for(const n of world.nations){if(!n.active)continue;
    const state=e3e3EnsureSupply(n).f1b;
    state.history.push({...state.lastQuarter});if(state.history.length>12)state.history.shift();
  }
  world.changeSeq++;
}


// --- src/sim/trade.js ---
/** V0.3A1: conservation-only, quarter-based bilateral overland trade. */


const TRADE_GOODS=Object.freeze({food:{label:'식량',price:1,freight:1},wood:{label:'목재',price:3,freight:1},stone:{label:'석재',price:4,freight:2},iron:{label:'철',price:9,freight:4},coal:{label:'석탄',price:6,freight:3},machine_parts:{label:'기계 부품',price:60,freight:3},steel:{label:'강철',price:45,freight:4}});
const GOODS=['food','wood','stone','iron']; // Legacy dependency/production schema stays four-core-resource only.
const MAX_EVENTS=160;
const tradeClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** F3 uses only recorded real flows. A legacy F2 save has no fabricated history. */
function initialTradeDependency(){return {quarters:[],reports:{dayIndex:0,nations:{}}};}
function initialTrade(){return {quarterDay:0,used:{},history:[],nextId:0,dependency:initialTradeDependency()};}
function ensureTradeDependency(w){
  if(!w.trade.dependency)w.trade.dependency=initialTradeDependency();
  return w.trade.dependency;
}
function dependencyQuarter(w){
  const d=ensureTradeDependency(w),dayIndex=Math.floor(w.dayIndex/DAYS_PER_QUARTER)*DAYS_PER_QUARTER;
  let q=d.quarters.find(q=>q.dayIndex===dayIndex);
  if(!q){q={dayIndex,flows:[],production:{}};d.quarters.push(q);d.quarters.sort((a,b)=>a.dayIndex-b.dayIndex);}
  // Four preceding quarters, plus the in-progress quarter. Never grow with world age.
  while(d.quarters.length>5)d.quarters.shift();
  return q;
}
function recordDependencyTrade(w,seller,buyer,good,quantity,gold,mode='DIRECT'){
  const q=dependencyQuarter(w);
  let flow=q.flows.find(f=>f.seller===seller&&f.buyer===buyer&&f.good===good);
  if(!flow){flow={seller,buyer,good,quantity:0,gold:0,indirectQuantity:0,indirectGold:0};q.flows.push(flow);}
  flow.quantity+=quantity;flow.gold+=gold;
  if(mode==='INDIRECT'){flow.indirectQuantity=(flow.indirectQuantity||0)+quantity;flow.indirectGold=(flow.indirectGold||0)+gold;}
}
function tradeDependencyReport(w,id){return w.trade?.dependency?.reports?.nations?.[id]||null;}
const ratio2=value=>Math.round(Math.max(0,Math.min(1,value))*10000)/10000;
/** Completed-quarter evidence, genuine land route failures and remaining physical stock.
 * An interrupted shipment is a missed opportunity, NEVER a second inventory charge.
 * Called once per economic quarter, after resource consumption and real trade settlement.
 */
function updateTradeDependency(w,projections,recordProduction=true){
  const d=ensureTradeDependency(w),current=dependencyQuarter(w);
  if(recordProduction)for(const n of w.nations){
    if(!n.active)continue;
    const produced=projections.get(n.id)?.produced||{};
    current.production[n.id]=Object.fromEntries(GOODS.map(g=>[g,produced[g]||0]));
  }
  const past=d.quarters.filter(q=>q.dayIndex<current.dayIndex&&q.dayIndex>=current.dayIndex-4*DAYS_PER_QUARTER);
  const reports={dayIndex:w.dayIndex,nations:{}},routeAvailability=new Map();
  const allowed=(a,b)=>{
    const key=pairKey(a,b);
    if(!routeAvailability.has(key))routeAvailability.set(key,{direct:Boolean(tradeRoute(w,a,b)),indirect:e3eMarketEligible(w,a,b)});
    return routeAvailability.get(key);
  };
  for(const n of w.nations){
    if(!n.active)continue;
    const goods={},partners={},importGold={},blockedPartners=new Set();
    let totalPressure=0,blockedGold=0,allImportGold=0;
    for(const good of GOODS){
      let priorImports=0,priorProduction=0,blockedImports=0,blockedValue=0;
      const sources=new Map();
      for(const q of past){
        priorProduction+=q.production[n.id]?.[good]||0;
        for(const f of q.flows){if(f.buyer!==n.id||f.good!==good)continue;
          priorImports+=f.quantity;
          const old=sources.get(f.seller)||{quantity:0,gold:0};old.quantity+=f.quantity;old.gold+=f.gold;sources.set(f.seller,old);
          importGold[f.seller]=(importGold[f.seller]||0)+f.gold;allImportGold+=f.gold;
        }
      }
      let dominant=null,dominantVolume=0;
      for(const [seller,flow] of sources){
        if(flow.quantity>dominantVolume||(flow.quantity===dominantVolume&&(dominant===null||seller<dominant))){dominant=seller;dominantVolume=flow.quantity;}
        const availability=allowed(n.id,seller),indirectQty=flow.indirectQuantity||0,indirectGold=flow.indirectGold||0;
        const lostDirect=availability.direct?0:flow.quantity-indirectQty,lostIndirect=availability.indirect?0:indirectQty;
        if(lostDirect+lostIndirect){blockedImports+=lostDirect+lostIndirect;blockedValue+=(availability.direct?0:flow.gold-indirectGold)+(availability.indirect?0:indirectGold);blockedPartners.add(seller);}
      }
      const reserve=safeStock(w,n,good),stock=n.resources[good];
      const shortage=ratio2((reserve-stock)/Math.max(1,reserve));
      const importReliance=ratio2(priorImports/Math.max(1,priorImports+priorProduction));
      const blockedShare=ratio2(blockedImports/Math.max(1,priorImports));
      // Exposure alone does not take resources or induce scarcity. Only actual
      // stock shortage * historically imported capacity * severed routes hurts.
      const pressure=Math.round(100*shortage*importReliance*blockedShare);
      totalPressure=Math.max(totalPressure,pressure);blockedGold+=blockedValue;
      const quarterImports=current.flows.filter(f=>f.buyer===n.id&&f.good===good).reduce((sum,f)=>sum+f.quantity,0);
      goods[good]={stock,reserve,priorImports,priorProduction,quarterImports,importReliance,dominantSellerId:dominant,concentration:ratio2(dominantVolume/Math.max(1,priorImports)),blockedImports,blockedShare,shortage,pressure};
    }
    for(const [id,gold] of Object.entries(importGold))partners[id]=ratio2(gold/Math.max(1,allImportGold));
    reports.nations[n.id]={pressure:totalPressure,blockedGold,blockedPartners:[...blockedPartners].sort((a,b)=>a-b),
      dataQuarters:past.length,partnerImportShare:partners,goods};
  }
  d.reports=reports;
  return reports;
}
/** Manually ordered trade can occur between quarter ticks. Keep its display current. */
function refreshManualTradeDependency(w){
  // Manual orders should not overwrite the last completed production ledger.
  updateTradeDependency(w,new Map(),false);
}

function ensureTrade(w){if(!w.trade)w.trade=initialTrade();return w.trade;}
function tradeStats(n){if(!n.trade)n.trade={exports:0,imports:0,exportValue:0,importValue:0,quarterExports:0,quarterImports:0,quarterExportValue:0,quarterImportValue:0};return n.trade;}
function refreshTradeQuarter(w){
  const t=ensureTrade(w);if(t.quarterDay===w.dayIndex)return;
  t.quarterDay=w.dayIndex;t.used={};
  for(const n of w.nations){const s=tradeStats(n);for(const k of ['quarterExports','quarterImports','quarterExportValue','quarterImportValue'])s[k]=0;}
}
/** The path may use only both partners' owned land, and at most four contiguous neutral tiles.
 * Third-party land, occupied tiles and water block travel. No naval or transit rights yet. */
function tradeRoute(w,a,b){
  if(a===b||!w.nations[a]?.active||!w.nations[b]?.active||warAgainst(w,a,b)||relationOf(w,a,b)<-45)return null;
  const starts=w.tiles.filter(t=>t.ownerId===a&&t.occupiedBy===null);
  if(!starts.length)return null;
  const visited=new Set(),queue=[];
  for(const t of starts){queue.push({id:t.id,neutral:0,dist:0,roads:t.roadLevel||0});visited.add(`${t.id}:0`);}
  for(let i=0;i<queue.length;i++){
    const at=queue[i];if(at.dist>12)continue;
    for(const id of neighbors4(at.id,w.size,w.height)){
      const t=w.tiles[id];if(t.terrain==='water'||t.occupiedBy!==null||![null,a,b].includes(t.ownerId))continue;
      const neutral=at.neutral+(t.ownerId===null?1:0);if(neutral>4)continue;
      if(t.ownerId===b){
        const roadBoost=(at.roads>0?Math.min(2,at.roads):0)+(t.roadLevel||0);
        const capacity=Math.max(125,Math.round((80+roadBoost*40)*(1-.05*neutral)*(roadBoost>=2?8:roadBoost>=1?6.5:5)));
        const guildBonus=Math.max(techBonus(w,a,'tradeCapacity'),techBonus(w,b,'tradeCapacity'));
        return {distance:at.dist+1,neutral,roadBoost,capacity:Math.floor(capacity*(1+guildBonus)),key:pairKey(a,b)};
      }
      const key=`${id}:${neutral}`;if(!visited.has(key)){visited.add(key);queue.push({id,neutral,dist:at.dist+1,roads:at.roads+(t.roadLevel||0)});}
    }
  }
  return null;
}
function safeStock(w,n,good){
  const population=w.settlements.reduce((s,t)=>s+(t.ownerId===n.id?t.population:0),0);
  const profile=w.aiProfiles[n.aiProfileId];
  const risk=profile?.behavior?.riskTolerance??50;
  const development=profile?.weights?.development??50;
  const investment=profile?.military?.militaryInvestment??50;
  if(good==='food')return Math.ceil(Math.max(60,population*.38*2)*(1+(50-risk)/250));
  if(good==='wood')return Math.ceil(Math.max(18,population*.015)*(1+(development-50)/200));
  if(good==='stone')return Math.ceil(Math.max(14,population*.012)*(1+(development-50)/200));
  if(good==='coal')return hasTech(w,n.id,'coal_extraction')||hasTech(w,n.id,'steam_engineering')?Math.max(12,Math.ceil(w.buildings.filter(b=>b.typeId==='workshop'&&w.tiles[b.tileId]?.ownerId===n.id&&b.powerDevices?.steam).length*6)):0;
  if(good==='iron')return Math.ceil(Math.max(5,population*.007)*(1+(investment-50)/160));
  return 0;
}
function tradeUnitPrice(w,seller,buyer,good){
  const base=TRADE_GOODS[good]?.price;if(!base)return null;
  const sellerStock=w.nations[seller].resources[good],buyerStock=w.nations[buyer].resources[good];
  const buyerNeed=safeStock(w,w.nations[buyer],good),sellerNeed=safeStock(w,w.nations[seller],good);
  const scarcity=buyerNeed>0?tradeClamp((buyerNeed-buyerStock)/buyerNeed,0,1):0;
  const surplus=sellerNeed>0?tradeClamp((sellerStock-sellerNeed)/sellerNeed,0,2):0;
  return Math.max(1,Math.round(base*(1+.35*scarcity-.12*surplus)));
}
/** Offer includes actual available reserves, Gold and shared quarterly route quota. */
function v07cFreightUnits(w,buyer,good,amount){const base=TRADE_GOODS[good].freight*amount;return Math.max(1,Math.ceil(base*(1-techBonus(w,buyer,'tradeFreightDiscount'))));}
function tradeQuote(w,seller,buyer,good,requested=null,route=null,autoSellerFloor=null){
  if(!Object.hasOwn(TRADE_GOODS,good))return null;
  const r=route||tradeRoute(w,seller,buyer);if(!r)return null;
  const s=w.nations[seller],b=w.nations[buyer],price=tradeUnitPrice(w,seller,buyer,good);
  const used=ensureTrade(w).quarterDay===w.dayIndex?(w.trade.used[r.key]||0):0;
  const remaining=Math.max(0,r.capacity-used);
  // V0.5C: auto trade must not re-export a valid construction project's supplies.
  // Manual trade deliberately preserves the previous safe-stock limit.
  const sellerFloor=autoSellerFloor===null?safeStock(w,s,good):Math.max(safeStock(w,s,good),autoSellerFloor);
  const stock=Math.max(0,s.resources[good]-sellerFloor);
  const affordable=Math.floor(b.gold/price);
  const maxQuantity=Math.max(0,Math.min(stock,affordable,Math.floor(remaining/Math.max(.001,TRADE_GOODS[good].freight*(1-techBonus(w,buyer,'tradeFreightDiscount'))))));
  let quantity=requested===null?maxQuantity:Math.min(maxQuantity,requested);
  // Rounding up the aggregate freight never exceeds route capacity.
  while(quantity>0&&v07cFreightUnits(w,buyer,good,quantity)>remaining)quantity--;
  return {seller,buyer,good,unitPrice:price,route:r,remaining,maxQuantity,quantity,amount:quantity*price};
}
function executeTrade(w,seller,buyer,good,requested,route=null,autoSellerFloor=null){
  if(!Number.isSafeInteger(requested)||requested<1||requested>10000)return {ok:false,reason:'거래 수량은 1~10,000의 정수여야 합니다.'};
  const quote=tradeQuote(w,seller,buyer,good,requested,route,autoSellerFloor);
  if(!quote||quote.maxQuantity<requested)return {ok:false,reason:'국가 관계·교역로·안전 재고·국고·분기 운송량이 부족합니다.'};
  const from=w.nations[seller],to=w.nations[buyer],amount=requested*quote.unitPrice;
  from.resources[good]-=requested;to.resources[good]+=requested;
  to.gold-=amount;from.gold+=amount;
  const t=ensureTrade(w),priorUsed=t.used[quote.route.key]||0,freight=v07cFreightUnits(w,buyer,good,requested);t.used[quote.route.key]=priorUsed+freight;
  recordDependencyTrade(w,seller,buyer,good,requested,amount);
  const fs=tradeStats(from),ts=tradeStats(to);
  fs.exports+=requested;fs.exportValue+=amount;fs.quarterExports+=requested;fs.quarterExportValue+=amount;
  ts.imports+=requested;ts.importValue+=amount;ts.quarterImports+=requested;ts.quarterImportValue+=amount;
  t.history.push({id:t.nextId++,dayIndex:w.dayIndex,seller,buyer,good,quantity:requested,unitPrice:quote.unitPrice,gold:amount,routeDistance:quote.route.distance});
  if(t.history.length>MAX_EVENTS)t.history.splice(0,t.history.length-MAX_EVENTS);
  // Relationship bonus is bounded to one adjustment per pair per quarter.
  if(priorUsed===0)adjustRelation(w,seller,buyer,1);
  w.changeSeq++;
  return {ok:true,action:'TRADE',quantity:requested,gold:amount,unitPrice:quote.unitPrice};
}
/** V0.3C: one route discovery per AI pair each quarter. Rank actual food deficits
 * before other goods; recalculate live stock and price on every settlement. */
// V0.5B · One procurement intention per AI nation, carried across quarters.
// Consumes ONLY already-scored legal, non-affordable building candidates.
// No new trade route lookup, no daily simulation work, no RNG.
const V05B_PROCUREMENT_WINDOW=12;
const V05B_PROCUREMENT_TYPES=new Set(['BUILD_FACILITY','UPGRADE_FACILITY','REDEVELOP_FACILITY']);
const V05B_BUILD_GOODS=['wood','stone','iron'];
function v05bState(n){return n.constructionProcurement??(n.constructionProcurement={plan:null,history:[]});}
function v05bActionKey(a){return JSON.stringify(a);}
function v05bOnlyResourceBlocked(n,cost){
  return Boolean(cost&&n.apUnits>=cost.apUnits&&n.gold>=cost.gold&&n.knowledge>=cost.knowledge&&
    V05B_BUILD_GOODS.some(k=>(n.resources[k]||0)<(cost.resources[k]||0))&&
    (n.resources.food||0)>=(cost.resources.food||0));
}
function v05bValidatePlan(w,n,p){
  if(!p||!V05B_PROCUREMENT_TYPES.has(p.action?.type)||!n.active||n.controller!=='AI')return 'INVALID_PLAN';
  if(!isNationActionLegal(w,n.id,p.action))return 'INVALID_PLAN';
  const price=getNationActionCost(w,n.id,p.action);
  if(!price)return 'INVALID_PLAN';
  if(n.apUnits<price.apUnits||n.gold<price.gold||n.knowledge<price.knowledge)return 'OTHER_COST';
  if(!V05B_BUILD_GOODS.some(g=>(n.resources[g]||0)<(price.resources[g]||0)))return 'FUNDED';
  return null;
}
function v05bTradeIntent(w,n){
  const state=v05bState(n),p=state.plan;
  if(!p)return null;
  const reason=v05bValidatePlan(w,n,p);
  if(reason){state.plan=null;return null;}
  const price=getNationActionCost(w,n.id,p.action);
  return {plan:p,price,received:{wood:0,stone:0,iron:0},gold:0,reason:'NO_PURCHASE'};
}
function v05bUpdatePlan(w,n,top,previousMatched){
  const state=v05bState(n),old=state.plan;
  if(!n.active||n.controller!=='AI'){state.plan=null;return;}
  if(old&&!previousMatched)state.plan=null;
  if(top){
    const current=state.plan;
    if(!current||top.key===v05bActionKey(current.action)||top.score>current.score*1.15){
      // A new goal does not reserve AP, Gold, or materials; only directs next trade.
      state.plan={action:{...top.action},score:Math.round(top.score*1000)/1000,startedDay:current&&top.key===v05bActionKey(current.action)?current.startedDay:w.dayIndex};
    }
  }
}
function v05bLogQuarter(w,n,trade){
  const state=v05bState(n),p=state.plan;
  const event={dayIndex:w.dayIndex,plan:p?{...p.action}:null,needed:{wood:0,stone:0,iron:0},
    imported:trade?.received||{wood:0,stone:0,iron:0},importGold:trade?.gold||0,
    status:trade?.reason||'NO_PLAN'};
  if(p){const price=getNationActionCost(w,n.id,p.action);
    if(price)for(const good of V05B_BUILD_GOODS)event.needed[good]=Math.max(0,(price.resources[good]||0)-(n.resources[good]||0));
    if(!trade)event.status='PLANNED';
  }
  state.history.push(event);
  if(state.history.length>V05B_PROCUREMENT_WINDOW)state.history.shift();
}
function v05bProcurementCsv(w){
  const rows=[['nationId','nation','dayIndex','action','targetTileId','buildingId','neededWood','neededStone','neededIron','importedWood','importedStone','importedIron','importGold','status']];
  for(const n of w.nations)for(const r of n.constructionProcurement?.history||[]){
    rows.push([n.id,n.name,r.dayIndex,r.plan?.type||'',r.plan?.targetTileId??'',r.plan?.buildingId??'',...V05B_BUILD_GOODS.map(g=>r.needed[g]||0),...V05B_BUILD_GOODS.map(g=>r.imported[g]||0),r.importGold,r.status]);
  }
  const quote=x=>'"'+String(x).replace(/"/g,'""')+'"';
  return '\ufeff'+rows.map(row=>row.map(quote).join(',')).join('\n');
}

function runTradeQuarter(w,projections=null){
  if(w.market)return e3eRunMarketQuarter(w,projections);
  refreshTradeQuarter(w);
  const routes=[],needs=new Map(),procure=new Map();
  for(const n of w.nations)if(n.constructionProcurement)n.constructionProcurement.lastTrade=null;
  for(const n of w.nations){
    if(!n.active||n.controller!=='AI')continue;
    const q=projections?.get(n.id)||projectedQuarter(w,n);
    // Projection already added before trade. Target one consumed quarter plus a
    // replenishable reserve quarter; this is a QUANTITY target, never a percentage.
    const target={food:Math.max(safeStock(w,n,'food'),2*q.foodConsumed),wood:safeStock(w,n,'wood'),stone:safeStock(w,n,'stone'),iron:safeStock(w,n,'iron')};
    const intent=v05bTradeIntent(w,n);
    if(intent){
      for(const good of V05B_BUILD_GOODS)target[good]=Math.max(target[good],intent.price.resources[good]||0);
      procure.set(n.id,intent);
    }
    needs.set(n.id,target);
  }
  for(let a=0;a<w.nations.length;a++)for(let b=a+1;b<w.nations.length;b++){
    if(!needs.has(a)||!needs.has(b))continue;
    const route=tradeRoute(w,a,b);if(route)routes.push({a,b,route});
  }
  for(const good of GOODS){
    const requests=[];
    for(const {a,b,route} of routes){
      for(const [buyer,seller] of [[a,b],[b,a]]){
        const bn=w.nations[buyer],sn=w.nations[seller];
        const lack=Math.max(0,needs.get(buyer)[good]-bn.resources[good]);
        // Same already-computed, validated procurement floor used for imports.
        // Food has no construction reserve; unplanned resources stay unchanged.
        const sellerFloor=good==='food'?safeStock(w,sn,good):needs.get(seller)[good];
        const excess=Math.max(0,sn.resources[good]-sellerFloor);
        if(!lack||!excess)continue;
        const urgency=good==='food'?lack/Math.max(1,needs.get(buyer)[good]):lack/Math.max(1,safeStock(w,bn,good));
        requests.push({buyer,seller,route,urgency,lack,excess});
      }
    }
    // Deterministic ordering: most critical shortages first; stable numeric IDs.
    requests.sort((x,y)=>y.urgency-x.urgency||y.lack-x.lack||x.buyer-y.buyer||x.seller-y.seller);
    for(const r of requests){
      const bn=w.nations[r.buyer],sn=w.nations[r.seller];
      const lack=Math.max(0,needs.get(r.buyer)[good]-bn.resources[good]);
      const sellerFloor=good==='food'?safeStock(w,sn,good):needs.get(r.seller)[good];
      if(!lack||sn.resources[good]<=sellerFloor)continue;
      const quote=tradeQuote(w,r.seller,r.buyer,good,null,r.route,sellerFloor);
      if(!quote||!quote.maxQuantity)continue;
      const intent=procure.get(r.buyer);
      const reservedCost=intent?.price?.gold||0;
      const upkeep=projections?.get(r.buyer);
      const overhead=upkeep?upkeep.upkeep+upkeep.civil.total:0;
      const reserveGold=Math.max(30,Math.floor(bn.gold*.12),intent&&good!=='food'?reservedCost+overhead:0);
      const budget=Math.max(0,Math.floor((bn.gold-reserveGold)/quote.unitPrice));
      const cooperation=((w.aiProfiles[sn.aiProfileId]?.diplomacy?.cooperation??50)+(w.aiProfiles[bn.aiProfileId]?.diplomacy?.cooperation??50))/2;
      const willingness=.65+cooperation/180;
      // Food scale uses true deficit; other goods retain smaller purchasing preferences.
      const preferred=good==='food'?Math.max(1,Math.ceil(lack*willingness)):
        Math.max(1,Math.ceil(lack*Math.min(1,willingness)*.55));
      const quantity=Math.min(10000,quote.maxQuantity,budget,lack,preferred);
      if(quantity>0){
        const before=bn.resources[good];
        const result=executeTrade(w,r.seller,r.buyer,good,quantity,r.route,sellerFloor);
        if(result.ok&&intent&&V05B_BUILD_GOODS.includes(good)){
          // Track imports into the project's missing target, including baseline imports.
          const consumed=Math.max(0,Math.min(quantity,Math.max(0,(intent.price.resources[good]||0)-before)));
          intent.received[good]+=consumed;intent.gold+=consumed*quote.unitPrice;
        }
      }
    }
  }
  // Observe results using the already-discovered route list. Zero additional BFS.
  for(const [id,intent] of procure){
    const n=w.nations[id];
    const missing=V05B_BUILD_GOODS.filter(g=>(n.resources[g]||0)<(intent.price.resources[g]||0));
    if(!missing.length)intent.reason='FUNDED';
    else if(Object.values(intent.received).some(x=>x>0))intent.reason='PARTIAL_IMPORT';
    else{
      const relevant=routes.filter(r=>r.a===id||r.b===id);
      if(!relevant.length)intent.reason='NO_ROUTE';
      else if(!missing.some(g=>relevant.some(r=>{
        const other=w.nations[r.a===id?r.b:r.a];
        const protectedFloor=needs.get(other.id)?.[g]??safeStock(w,other,g);
        return other.resources[g]>protectedFloor;
      })))intent.reason='NO_SELLER_SURPLUS';
      else intent.reason='GOLD_OR_FREIGHT_LIMIT';
    }
  }
  // The saved report is written after AI has made the next procurement choice.
  for(const [id,intent] of procure)w.nations[id].constructionProcurement.lastTrade={received:intent.received,gold:intent.gold,reason:intent.reason,dayIndex:w.dayIndex};
}

function validateTradeDependency(w){
  const d=w.trade?.dependency;
  if(!d||!Array.isArray(d.quarters)||d.quarters.length>5||!d.reports||!Number.isSafeInteger(d.reports.dayIndex)||d.reports.dayIndex<0||d.reports.dayIndex>w.dayIndex||!d.reports.nations||typeof d.reports.nations!=='object')return false;
  if(Object.keys(d.reports.nations).length>w.nations.length)return false;
  let prior=-1;
  for(const q of d.quarters){
    if(!Number.isSafeInteger(q.dayIndex)||q.dayIndex<0||q.dayIndex>w.dayIndex||q.dayIndex%DAYS_PER_QUARTER!==0||q.dayIndex<=prior||!Array.isArray(q.flows)||q.flows.length>w.nations.length*(w.nations.length-1)*E3E_GOOD_INDEX.length||!q.production||typeof q.production!=='object')return false;
    prior=q.dayIndex;
    const seen=new Set();
    for(const f of q.flows){
      const key=[f.seller,f.buyer,f.good].join(':');
      if(!w.nations[f.seller]||!w.nations[f.buyer]||f.seller===f.buyer||!TRADE_GOODS[f.good]||seen.has(key)||!Number.isSafeInteger(f.quantity)||f.quantity<1||!Number.isSafeInteger(f.gold)||f.gold<1||!Number.isSafeInteger(f.indirectQuantity??0)||(f.indirectQuantity||0)<0||(f.indirectQuantity||0)>f.quantity||!Number.isSafeInteger(f.indirectGold??0)||(f.indirectGold||0)<0||(f.indirectGold||0)>f.gold)return false;
      seen.add(key);
    }
    for(const [id,produced] of Object.entries(q.production))if(!/^\d+$/.test(id)||!w.nations[Number(id)]||!produced||GOODS.some(g=>!Number.isSafeInteger(produced[g])||produced[g]<0))return false;
  }
  for(const [id,r] of Object.entries(d.reports.nations)){
    if(!/^\d+$/.test(id)||!w.nations[Number(id)]||!Number.isInteger(r.pressure)||r.pressure<0||r.pressure>100||!Number.isInteger(r.blockedGold)||r.blockedGold<0||!Number.isInteger(r.dataQuarters)||r.dataQuarters<0||r.dataQuarters>4||!r.goods||!r.partnerImportShare||!Array.isArray(r.blockedPartners))return false;
    if(Object.values(r.partnerImportShare).some(x=>!Number.isFinite(x)||x<0||x>1)||r.blockedPartners.some(x=>!Number.isInteger(x)||!w.nations[x]))return false;
    for(const g of GOODS){const x=r.goods[g];if(!x||['stock','reserve','priorImports','priorProduction','quarterImports','blockedImports','pressure'].some(k=>!Number.isSafeInteger(x[k])||x[k]<0)||['importReliance','concentration','blockedShare','shortage'].some(k=>!Number.isFinite(x[k])||x[k]<0||x[k]>1)||x.pressure>100||x.blockedImports>x.priorImports||!(x.dominantSellerId===null||Number.isInteger(x.dominantSellerId)&&w.nations[x.dominantSellerId]))return false;}
  }
  return true;
}
function validateTrade(w){
  const t=w.trade;if(!t||!Number.isInteger(t.quarterDay)||t.quarterDay<0||t.quarterDay>w.dayIndex||!Number.isSafeInteger(t.nextId)||t.nextId<0||!Array.isArray(t.history)||t.history.length>MAX_EVENTS||!t.used||typeof t.used!=='object')return false;
  if(Object.entries(t.used).some(([key,value])=>!/^\d+:\d+$/.test(key)||!Number.isSafeInteger(value)||value<0))return false;
  if(t.history.some(h=>!Number.isSafeInteger(h.id)||h.id<0||!Number.isSafeInteger(h.dayIndex)||h.dayIndex<0||h.dayIndex>w.dayIndex||!w.nations[h.seller]||!w.nations[h.buyer]||h.seller===h.buyer||!TRADE_GOODS[h.good]||!Number.isSafeInteger(h.quantity)||h.quantity<1||!Number.isSafeInteger(h.gold)||h.gold<1|| (h.market===true? !Number.isSafeInteger(h.priceMilli)||h.priceMilli<1||!Number.isSafeInteger(h.buyerPaid)||!Number.isSafeInteger(h.sellerReceived)||!Number.isSafeInteger(h.feeGold)||h.gold!==e3ePriceAmount(h.quantity,h.priceMilli)||h.buyerPaid!==h.sellerReceived+h.feeGold||h.mode==='INDIRECT'&&(h.routeDistance!==null||!Number.isSafeInteger(h.indirectFeeGold)||h.indirectFeeGold<0) : h.gold!==h.quantity*h.unitPrice)))return false;
  if(!validateTradeDependency(w))return false;
  return w.nations.every(n=>{const s=n.trade;return s&&['exports','imports','exportValue','importValue','quarterExports','quarterImports','quarterExportValue','quarterImportValue'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0);});
}


// --- V0.7E3E: International physical-spot market (quarter only; deterministic; no RNG). ---
const E3E_MARKET_HISTORY_LIMIT=48, E3E_MARKET_FILLS_LIMIT=120;
const E3E_MARKET_FEE_RATE=10; // percentage charged separately to buyers and sellers
const E3E_MARKET_PRICE_STEP=150; // 15% of current price at full one-sided order imbalance
const E3E_GOOD_INDEX=['food','wood','stone','iron','coal','machine_parts','steel'];
// E3E1: indirect brokered physical trade, no synthetic resource or pathfinder.
const E3E1_INDIRECT_FREIGHT_LIMIT=3000, E3E1_INDIRECT_FEE_RATE=15;
function e3eInitialMarket(){
 const prices={};for(const good of E3E_GOOD_INDEX)prices[good]=TRADE_GOODS[good].price*1000;
 return {schema:2,coalIntroducedDay:0,f2bIntroducedDay:0,openedDay:null,quarterDay:null,prices,quarters:[],fills:[],nextFillId:0,pendingOrders:[],nextOrderId:0,
  totals:{volume:0,baseGold:0,buyerPaid:0,sellerReceived:0,feesSink:0,trades:0,directVolume:0,indirectVolume:0,indirectFeeGold:0,directTrades:0,indirectTrades:0},
  lastOrders:[],lastNation:[],lastBlocks:{},lastQuarter:null};
}
function e3eMigrateMarket(w){
 const m=w.market??(w.market=e3eInitialMarket());
 m.coalIntroducedDay??=Math.floor(w.dayIndex/30)*30+30;
 m.prices.coal??=e3eBaseMilli('coal');
 m.f2bIntroducedDay??=Math.floor(w.dayIndex/30)*30+30;
 for(const g of ['machine_parts','steel'])m.prices[g]??=e3eBaseMilli(g);
 if(m.schema===1){m.schema=2;
  for(const f of m.fills){f.mode??='DIRECT';f.indirectFeeGold??=0;f.baseFeeGold??=f.feeGold;}
  for(const f of w.trade?.history||[])if(f.market===true){f.mode??='DIRECT';f.indirectFeeGold??=0;f.baseFeeGold??=f.feeGold;}
  for(const q of m.quarters){q.directVolume??=q.totalVolume;q.indirectVolume??=0;q.directTrades??=q.trades;q.indirectTrades??=0;q.indirectFeeGold??=0;
   for(const g of E3E_GOOD_INDEX){const x=q.goods?.[g];if(x){x.directVolume??=x.volume;x.indirectVolume??=0;x.directTrades??=x.trades;x.indirectTrades??=0;x.indirectFeeGold??=0;}}}
  if(m.lastQuarter){const q=m.lastQuarter;q.directVolume??=q.totalVolume;q.indirectVolume??=0;q.directTrades??=q.trades;q.indirectTrades??=0;q.indirectFeeGold??=0;
   for(const g of E3E_GOOD_INDEX){const x=q.goods?.[g];if(x){x.directVolume??=x.volume;x.indirectVolume??=0;x.directTrades??=x.trades;x.indirectTrades??=0;x.indirectFeeGold??=0;}}}
  for(const n of m.lastNation){n.directBought??=n.bought;n.directSold??=n.sold;n.indirectBought??={};n.indirectSold??={};n.indirectImportFreight??=0;n.indirectExportFreight??=0;n.indirectFeeGold??=0;}
  m.totals.directVolume??=m.totals.volume;m.totals.indirectVolume??=0;m.totals.directTrades??=m.totals.trades;m.totals.indirectTrades??=0;m.totals.indirectFeeGold??=0;
 }
 for(const q of w.trade?.dependency?.quarters||[])for(const f of q.flows){f.indirectQuantity??=0;f.indirectGold??=0;}
 return m;
}
function e3eEnsureMarket(w){if(!w.market)w.market=e3eInitialMarket();return w.market;}
function e3eBaseMilli(good){return TRADE_GOODS[good].price*1000;}
function e3eBoundPrice(good,v){const b=e3eBaseMilli(good);return Math.max(Math.round(b/2),Math.min(b*3,Math.round(v)));}
function e3ePriceText(milli){return (milli/1000).toFixed(3);}
function e3ePriceAmount(qty,priceMilli){return Math.max(1,Math.round(qty*priceMilli/1000));}
function e3eFee(base){return Math.ceil(base*E3E_MARKET_FEE_RATE/100);}
function e3ePayment(qty,priceMilli,mode='DIRECT'){
 const base=e3ePriceAmount(qty,priceMilli),fee=e3eFee(base),indirectFeeGold=mode==='INDIRECT'?Math.ceil(base*E3E1_INDIRECT_FEE_RATE/100):0;
 return {base,buyerPaid:base+fee+indirectFeeGold,sellerReceived:base-fee,feeGold:2*fee+indirectFeeGold,baseFeeGold:2*fee,indirectFeeGold};
}
function e3eMarketEligible(w,a,b){return a!==b&&Boolean(w.nations[a]?.active&&w.nations[b]?.active)&&!warAgainst(w,a,b)&&relationOf(w,a,b)>=-45;}
function e3eConserveTrade(w,seller,buyer,good,qty,r,priceMilli,mode='DIRECT',indirectUsage=null){
 const market=e3eEnsureMarket(w),from=w.nations[seller],to=w.nations[buyer],s=e3ePayment(qty,priceMilli,mode);
 if(!e3eMarketEligible(w,seller,buyer)||qty<1||qty>10000||from.resources[good]<qty||to.gold<s.buyerPaid)return null;
 const freight=v07cFreightUnits(w,buyer,good,qty),t=ensureTrade(w);
 let used=0;
 if(mode==='DIRECT'){
  if(!r)return null;
  used=t.used[r.key]||0;
  if(used+freight>r.capacity)return null;
 }else if(mode==='INDIRECT'){
  if(!indirectUsage||indirectUsage.import[buyer]+freight>e3e3IndirectLimit(w,buyer)||indirectUsage.export[seller]+freight>e3e3IndirectLimit(w,seller))return null;
 }else return null;
 from.resources[good]-=qty;to.resources[good]+=qty;to.gold-=s.buyerPaid;from.gold+=s.sellerReceived;
 if(mode==='DIRECT')t.used[r.key]=used+freight;
 else{indirectUsage.import[buyer]+=freight;indirectUsage.export[seller]+=freight;}
 recordDependencyTrade(w,seller,buyer,good,qty,s.base,mode);
 const fs=tradeStats(from),ts=tradeStats(to);
 fs.exports+=qty;fs.exportValue+=s.sellerReceived;fs.quarterExports+=qty;fs.quarterExportValue+=s.sellerReceived;
 ts.imports+=qty;ts.importValue+=s.buyerPaid;ts.quarterImports+=qty;ts.quarterImportValue+=s.buyerPaid;
 const tradeId=t.nextId++;
 t.history.push({id:tradeId,dayIndex:w.dayIndex,seller,buyer,good,quantity:qty,unitPrice:priceMilli/1000,gold:s.base,
   market:true,mode,freightUsed:freight,priceMilli,buyerPaid:s.buyerPaid,sellerReceived:s.sellerReceived,feeGold:s.feeGold,
   baseFeeGold:s.baseFeeGold,indirectFeeGold:s.indirectFeeGold,routeDistance:mode==='DIRECT'?r.distance:null});
 if(t.history.length>MAX_EVENTS)t.history.splice(0,t.history.length-MAX_EVENTS);
 const e={id:market.nextFillId++,tradeId,dayIndex:w.dayIndex,seller,buyer,good,quantity:qty,priceMilli,mode,freightUsed:freight,
  baseGold:s.base,buyerPaid:s.buyerPaid,sellerReceived:s.sellerReceived,feeGold:s.feeGold,
  baseFeeGold:s.baseFeeGold,indirectFeeGold:s.indirectFeeGold,routeDistance:mode==='DIRECT'?r.distance:null};
 market.fills.push(e);if(market.fills.length>E3E_MARKET_FILLS_LIMIT)market.fills.shift();
 for(const [key,n] of [['volume',qty],['baseGold',s.base],['buyerPaid',s.buyerPaid],['sellerReceived',s.sellerReceived],['feesSink',s.feeGold],['trades',1],
  [mode==='DIRECT'?'directVolume':'indirectVolume',qty],[mode==='DIRECT'?'directTrades':'indirectTrades',1],['indirectFeeGold',s.indirectFeeGold]])market.totals[key]+=n;
 if(mode==='DIRECT'&&used===0)adjustRelation(w,seller,buyer,1);
 w.changeSeq++;return e;
}
/** F1C2: the first indirect food pass may consume 70% of each nation's
 * import/export freight budget. Non-food goods then take available freight;
 * a second food pass reclaims whatever is unused. Direct trade is unchanged. */
const F1C2_FOOD_INITIAL_FREIGHT_SHARE=0.70;
function e3eMaxFill(w,buyer,seller,good,max,r,priceMilli,buyerReserve,sellerFloor,mode='DIRECT',indirectUsage=null,indirectFraction=1){
 const maxIndirect=id=>Math.floor(e3e3IndirectLimit(w,id)*indirectFraction);
 const freightRemaining=mode==='DIRECT'?(r?Math.max(0,r.capacity-(ensureTrade(w).used[r.key]||0)):0):
  Math.max(0,Math.min(maxIndirect(buyer)-(indirectUsage?.import[buyer]||0),maxIndirect(seller)-(indirectUsage?.export[seller]||0)));
 let hi=Math.max(0,Math.min(10000,Math.floor(max),Math.ceil(freightRemaining/Math.max(.001,TRADE_GOODS[good].freight*(1-techBonus(w,buyer,'tradeFreightDiscount')))),
   w.nations[seller].resources[good]-sellerFloor));
 let lo=0;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);
  if(v07cFreightUnits(w,buyer,good,mid)<=freightRemaining&&e3ePayment(mid,priceMilli,mode).buyerPaid<=Math.max(0,w.nations[buyer].gold-buyerReserve))lo=mid;
  else hi=mid-1;
 }
 return lo;
}
function e3eTargets(w,n,projections){
 const q=projections?.get(n.id)||projectedQuarter(w,n);
 const target={food:Math.max(safeStock(w,n,'food'),2*q.foodConsumed),wood:safeStock(w,n,'wood'),stone:safeStock(w,n,'stone'),iron:safeStock(w,n,'iron'),coal:safeStock(w,n,'coal'),machine_parts:f2bMarketTarget(w,n,'machine_parts'),steel:f2bMarketTarget(w,n,'steel')};
 const intent=v05bTradeIntent(w,n);
 if(intent)for(const g of V05B_BUILD_GOODS)target[g]=Math.max(target[g],intent.price.resources[g]||0);
 return {target,intent,upkeep:(q.upkeep||0)+(q.civil?.total||0)};
}
function e3eRunMarketQuarter(w,projections=null){
 refreshTradeQuarter(w);
 const market=e3eEnsureMarket(w),current=w.dayIndex,eligible=w.nations.filter(n=>n.active).sort((a,b)=>a.id-b.id),needs=new Map(),routes=[],pairs=[],routeMap=new Map();
 for(const n of w.nations)if(n.constructionProcurement)n.constructionProcurement.lastTrade=null;
 for(const n of eligible)needs.set(n.id,n.controller==='AI'?e3eTargets(w,n,projections):{target:Object.fromEntries(E3E_GOOD_INDEX.map(g=>[g,safeStock(w,n,g)])),intent:null,upkeep:0});
 market.pendingOrders=market.pendingOrders.filter(o=>w.nations[o.nationId]?.active&&w.nations[o.nationId]?.controller==='PLAYER'&&o.expiresDay>=current&&o.remaining>0);
 // Exactly one route probe per physically eligible pair in a quarter.
 for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
  const a=eligible[i].id,b=eligible[j].id;if(!e3eMarketEligible(w,a,b))continue;
  pairs.push({a,b});const route=tradeRoute(w,a,b);if(route){routes.push({a,b,route});routeMap.set(pairKey(a,b),route);}
 }
 const usage={import:Array(w.nations.length).fill(0),export:Array(w.nations.length).fill(0)};
 const report={dayIndex:current,pricesBefore:{...market.prices},pricesAfter:{},goods:{},totalVolume:0,totalGold:0,feesSink:0,trades:0,availableRoutes:routes.length,
  eligiblePairs:pairs.length,directVolume:0,indirectVolume:0,directTrades:0,indirectTrades:0,indirectFeeGold:0};
 const nationRecords=new Map(eligible.map(n=>[n.id,{id:n.id,bought:{},sold:{},directBought:{},directSold:{},indirectBought:{},indirectSold:{},buyerPaid:0,sellerReceived:0,fees:0,
  indirectFeeGold:0,indirectImportFreight:0,indirectExportFreight:0,indirectImportCap:e3e3IndirectLimit(w,n.id),indirectExportCap:e3e3IndirectLimit(w,n.id)}]));
 const finalOrders=[],blocks={},goodContexts=[];
 for(const good of E3E_GOOD_INDEX){
  const priceMilli=market.prices[good],orders=[],byId=new Map();
  for(const n of eligible){
   if(n.controller==='PLAYER'){
    for(const pending of market.pendingOrders.filter(o=>o.nationId===n.id&&o.good===good)){
     const max=pending.side==='SELL'?Math.max(0,n.resources[good]-safeStock(w,n,good)):n.gold>0?Math.floor(n.gold/Math.max(1,Math.ceil(priceMilli*1.1/1000))):0;
     const qty=Math.min(pending.remaining,max,10000);if(!qty)continue;
     const o={nationId:n.id,good,side:pending.side,requested:qty,filled:0,limitPriceMilli:pending.limitPriceMilli,pendingId:pending.id};
     orders.push(o);byId.set(`${n.id}:${pending.side}`,o);
    }
    continue;
   }
   const x=needs.get(n.id),stock=n.resources[good],target=x.target[good],safe=safeStock(w,n,good),sellerFloor=Math.max(safe,target);
   const goldReserve=Math.max(30,Math.floor(n.gold*.12),x.intent&&good!=='food'?x.intent.price.gold+x.upkeep:0);
   const availableGold=Math.max(0,n.gold-goldReserve),lack=Math.max(0,target-stock),excess=Math.max(0,stock-sellerFloor);
   const urgency=lack/Math.max(1,target),cooperation=w.aiProfiles[n.aiProfileId]?.diplomacy?.cooperation??50;
   const maxPriceMilli=Math.max(priceMilli,Math.round(e3eBaseMilli(good)*(urgency>.6?3:1.5+(cooperation/300))));
   const purchaseCap=availableGold>0?Math.floor(availableGold/Math.max(1,Math.ceil(priceMilli*1.1/1000))):0;
   const want=Math.min(10000,lack,purchaseCap),ask=Math.min(['machine_parts','steel'].includes(good)?200:10000,excess);
   if(want>0){const o={nationId:n.id,good,side:'BUY',requested:want,filled:0,limitPriceMilli:maxPriceMilli};orders.push(o);byId.set(`${n.id}:BUY`,o);}
   if(ask>0){const o={nationId:n.id,good,side:'SELL',requested:ask,filled:0,limitPriceMilli:e3eBaseMilli(good)/2};orders.push(o);byId.set(`${n.id}:SELL`,o);}
  }
  const requests=[];
  for(const {a,b} of pairs)for(const [buyer,seller] of [[a,b],[b,a]]){
   const bo=byId.get(`${buyer}:BUY`),so=byId.get(`${seller}:SELL`);
   if(!bo||!so||priceMilli>bo.limitPriceMilli||priceMilli<so.limitPriceMilli)continue;
   const need=needs.get(buyer).target[good]-w.nations[buyer].resources[good];
   requests.push({buyer,seller,route:routeMap.get(pairKey(a,b))||null,urgency:need/Math.max(1,needs.get(buyer).target[good])});
  }
  requests.sort((a,b)=>b.urgency-a.urgency||a.buyer-b.buyer||a.seller-b.seller);
  // No duplicated orders: one buyer or seller contributes only its capped quantity.
  const validBuy=new Map(),validSell=new Map();
  for(const r of requests){
   const freightFactor=Math.max(.001,TRADE_GOODS[good].freight*(1-techBonus(w,r.buyer,'tradeFreightDiscount')));
   const directFreight=r.route?Math.max(0,r.route.capacity-(w.trade.used[r.route.key]||0)):0;
   const indirectFreight=Math.max(0,Math.min(e3e3IndirectLimit(w,r.buyer)-usage.import[r.buyer],e3e3IndirectLimit(w,r.seller)-usage.export[r.seller]));
   const possible=Math.max(0,Math.floor((directFreight+indirectFreight)/freightFactor));
   const bo=byId.get(`${r.buyer}:BUY`),so=byId.get(`${r.seller}:SELL`);
   const quantity=Math.min(possible,bo.requested,so.requested);
   if(quantity>0){validBuy.set(r.buyer,Math.max(validBuy.get(r.buyer)||0,quantity));validSell.set(r.seller,Math.max(validSell.get(r.seller)||0,quantity));}
  }
  const demand=orders.filter(o=>o.side==='BUY').reduce((s,o)=>s+Math.min(o.requested,validBuy.get(o.nationId)||0),0);
  const supply=orders.filter(o=>o.side==='SELL').reduce((s,o)=>s+Math.min(o.requested,validSell.get(o.nationId)||0),0);
  const sums={volume:0,trades:0,buyerPaid:0,sellerReceived:0,feesSink:0,directVolume:0,indirectVolume:0,directTrades:0,indirectTrades:0,indirectFeeGold:0};
  const settle=(r,mode,indirectFraction=1)=>{
   const buyer=w.nations[r.buyer],seller=w.nations[r.seller],bo=byId.get(`${r.buyer}:BUY`),so=byId.get(`${r.seller}:SELL`);
   if(!bo||!so||bo.filled>=bo.requested||so.filled>=so.requested)return;
   const budget=buyer.controller==='PLAYER'?0:Math.max(30,Math.floor(buyer.gold*.12),needs.get(buyer.id).intent&&good!=='food'?needs.get(buyer.id).intent.price.gold+needs.get(buyer.id).upkeep:0);
   const floor=Math.max(safeStock(w,seller,good),needs.get(seller.id).target[good]);
   const qty=e3eMaxFill(w,r.buyer,r.seller,good,Math.min(bo.requested-bo.filled,so.requested-so.filled),r.route,priceMilli,budget,floor,mode,usage,indirectFraction);
   if(!qty)return;
   const before=buyer.resources[good],e=e3eConserveTrade(w,r.seller,r.buyer,good,qty,r.route,priceMilli,mode,usage);if(!e)return;
   bo.filled+=qty;so.filled+=qty;
   for(const [k,value] of [['volume',qty],['trades',1],['buyerPaid',e.buyerPaid],['sellerReceived',e.sellerReceived],['feesSink',e.feeGold],
    [mode==='DIRECT'?'directVolume':'indirectVolume',qty],[mode==='DIRECT'?'directTrades':'indirectTrades',1],['indirectFeeGold',e.indirectFeeGold]])sums[k]+=value;
   const bn=nationRecords.get(buyer.id),sn=nationRecords.get(seller.id),bx=mode==='DIRECT'?'directBought':'indirectBought',sx=mode==='DIRECT'?'directSold':'indirectSold';
   bn.bought[good]=(bn.bought[good]||0)+qty;bn[bx][good]=(bn[bx][good]||0)+qty;bn.buyerPaid+=e.buyerPaid;bn.fees+=e.feeGold-e3eFee(e.baseGold);bn.indirectFeeGold+=e.indirectFeeGold;
   sn.sold[good]=(sn.sold[good]||0)+qty;sn[sx][good]=(sn[sx][good]||0)+qty;sn.sellerReceived+=e.sellerReceived;sn.fees+=e3eFee(e.baseGold);
   if(mode==='INDIRECT'){bn.indirectImportFreight+=e.freightUsed;sn.indirectExportFreight+=e.freightUsed;}
   const intent=needs.get(buyer.id).intent;if(intent&&V05B_BUILD_GOODS.includes(good)){
    const imported=Math.max(0,Math.min(qty,(intent.price.resources[good]||0)-before));intent.received[good]+=imported;
    intent.gold+=imported?Math.round(e.buyerPaid*imported/qty):0;
   }
  };
  goodContexts.push({good,priceMilli,orders,requests,demand,supply,sums,settle});
 }
 // Keep E3E1 direct-first contract across all goods. Only the indirect pass
 // reserves a meaningful 30% of EACH country's shipping cap for non-food
 // demand, then returns unused freight to food. No extra trade budget is minted.
 for(const ctx of goodContexts)for(const r of ctx.requests)if(r.route)ctx.settle(r,'DIRECT');
 const foodContext=goodContexts.find(ctx=>ctx.good==='food');
 if(foodContext)for(const r of foodContext.requests)foodContext.settle(r,'INDIRECT',F1C2_FOOD_INITIAL_FREIGHT_SHARE);
 for(const ctx of goodContexts)if(ctx.good!=='food')for(const r of ctx.requests)ctx.settle(r,'INDIRECT');
 if(foodContext)for(const r of foodContext.requests)foodContext.settle(r,'INDIRECT');
 for(const ctx of goodContexts){
  const {good,priceMilli,orders,requests,demand,supply,sums}=ctx;
  const imbalance=demand+supply?(demand-supply)/(demand+supply):0,base=e3eBaseMilli(good);
  const delta=Math.round(priceMilli*E3E_MARKET_PRICE_STEP*imbalance/1000),next=e3eBoundPrice(good,priceMilli+delta+Math.round(.03*(base-priceMilli)));
  market.prices[good]=next;report.pricesAfter[good]=next;
  report.goods[good]={priceMilli,nextPriceMilli:next,validDemand:demand,validSupply:supply,requestedBuy:orders.filter(o=>o.side==='BUY').reduce((s,o)=>s+o.requested,0),
   requestedSell:orders.filter(o=>o.side==='SELL').reduce((s,o)=>s+o.requested,0),...sums,
   unfilledBuy:orders.filter(o=>o.side==='BUY').reduce((s,o)=>s+o.requested-o.filled,0),
   unfilledSell:orders.filter(o=>o.side==='SELL').reduce((s,o)=>s+o.requested-o.filled,0)};
  for(const o of orders){o.unfilled=o.requested-o.filled;
   if(o.unfilled){const opposites=orders.filter(x=>x.side!==(o.side)&&x.nationId!==o.nationId&&x.requested>0);
    const allowed=opposites.filter(x=>e3eMarketEligible(w,x.nationId,o.nationId));
    const compatible=allowed.filter(x=>o.side==='BUY'?priceMilli<=o.limitPriceMilli&&priceMilli>=x.limitPriceMilli:priceMilli>=o.limitPriceMilli&&priceMilli<=x.limitPriceMilli);
    const n=w.nations[o.nationId],isBuy=o.side==='BUY',freightLimit=isBuy?usage.import[n.id]:usage.export[n.id];
    const possible=compatible.filter(x=>x.requested>x.filled);
    const theirCapacity=possible.filter(x=>{
     const other=w.nations[x.nationId];if(isBuy)return other.resources[good]>Math.max(safeStock(w,other,good),needs.get(other.id).target[good]);
     return other.gold>=e3ePayment(1,priceMilli,'INDIRECT').buyerPaid;
    });
    const routeOpen=theirCapacity.some(x=>{
      const r=routeMap.get(pairKey(n.id,x.nationId));return r&&(w.trade.used[r.key]||0)<r.capacity;
    });
    const indirectOtherOpen=theirCapacity.some(x=>{
      const cap=e3e3IndirectLimit(w,x.nationId),used=isBuy?usage.export[x.nationId]:usage.import[x.nationId];return used<cap;
    });
    const reason=!opposites.length?(isBuy?'NO_SELLER_SURPLUS':'NO_BUYER'):!allowed.length?'DIPLOMATIC_BLOCK':!compatible.length?'LIMIT_PRICE':
     isBuy&&n.gold<e3ePayment(1,priceMilli,'INDIRECT').buyerPaid?'GOLD':
     !isBuy&&n.resources[good]<=Math.max(safeStock(w,n,good),needs.get(n.id).target[good])?'SAFE_STOCK':
     !possible.length?(isBuy?'NO_SELLER_SURPLUS':'NO_BUYER'):
     !theirCapacity.length?(isBuy?'NO_SELLER_SURPLUS':'GOLD'):
     freightLimit>=e3e3IndirectLimit(w,n.id)?(isBuy?'INDIRECT_IMPORT_CAP':'INDIRECT_EXPORT_CAP'):
     !indirectOtherOpen?(isBuy?'INDIRECT_EXPORT_CAP':'INDIRECT_IMPORT_CAP'):
     !routeOpen?'NO_MATCHING_COUNTERPARTY':'DIRECT_FREIGHT_CAP';
    o.blockReason=reason;blocks[reason]=(blocks[reason]||0)+o.unfilled;
   }
   finalOrders.push(o);
   if(o.pendingId!==undefined){const saved=market.pendingOrders.find(p=>p.id===o.pendingId);if(saved)saved.remaining-=o.filled;}
  }
  for(const [k,v] of Object.entries(sums))if(k==='volume')report.totalVolume+=v;else if(k==='buyerPaid')report.totalGold+=v;else if(k==='feesSink')report.feesSink+=v;else if(k!=='sellerReceived')report[k]+=v;
 }
 for(const [id,x] of needs){const n=w.nations[id],intent=x.intent;if(!intent)continue;
  const missing=V05B_BUILD_GOODS.filter(g=>n.resources[g]<(intent.price.resources[g]||0));
  if(!missing.length)intent.reason='FUNDED';
  else if(Object.values(intent.received).some(v=>v>0))intent.reason='PARTIAL_IMPORT';
  else if(!pairs.some(r=>r.a===id||r.b===id))intent.reason='NO_ROUTE';
  else if(!missing.some(g=>pairs.some(r=>{if(r.a!==id&&r.b!==id)return false;
   const other=w.nations[r.a===id?r.b:r.a];return other.resources[g]>(needs.get(other.id)?.target[g]||safeStock(w,other,g));})))intent.reason='NO_SELLER_SURPLUS';
  else intent.reason='GOLD_OR_FREIGHT_LIMIT';
  n.constructionProcurement.lastTrade={received:intent.received,gold:intent.gold,reason:intent.reason,dayIndex:current};
 }
 market.pendingOrders=market.pendingOrders.filter(o=>o.remaining>0&&o.expiresDay>current);
 if(report.trades>0&&market.openedDay===null)market.openedDay=current;
 report.opened=market.openedDay!==null;market.quarterDay=current;market.lastQuarter=report;market.quarters.push(report);
 if(market.quarters.length>E3E_MARKET_HISTORY_LIMIT)market.quarters.shift();
 market.lastOrders=finalOrders;market.lastNation=[...nationRecords.values()];market.lastBlocks=blocks;
 return report;
}
function e3eSetManualOrder(w,id,good,side,quantity,limitPriceMilli){
 const n=w.nations[id],m=e3eEnsureMarket(w);
 if(!n?.active||n.controller!=='PLAYER')return {ok:false,reason:'현재 직접 조종하는 국가만 시장 주문을 등록할 수 있습니다.'};
 if(!TRADE_GOODS[good]||!['BUY','SELL'].includes(side)||!Number.isSafeInteger(quantity)||quantity<1||quantity>10000||
  !Number.isSafeInteger(limitPriceMilli)||limitPriceMilli<e3eBaseMilli(good)/2||limitPriceMilli>3*e3eBaseMilli(good))return {ok:false,reason:'상품·거래 방향·수량(1~10,000)·지정가(기준가의 0.5~3배)를 확인하세요.'};
 if(side==='SELL'&&n.resources[good]<=safeStock(w,n,good))return {ok:false,reason:'안전 재고를 초과하는 실제 자원이 있어야 매도할 수 있습니다.'};
 if(side==='BUY'&&n.gold<e3ePayment(1,limitPriceMilli).buyerPaid)return {ok:false,reason:'구매 국고가 부족합니다.'};
 const existing=m.pendingOrders.find(o=>o.nationId===id&&o.good===good&&o.side===side);
 if(existing){existing.quantity=quantity;existing.remaining=quantity;existing.limitPriceMilli=limitPriceMilli;existing.placedDay=w.dayIndex;existing.expiresDay=w.dayIndex+120;}
 else{if(m.pendingOrders.length>=8)return {ok:false,reason:'플레이어 시장 주문은 최대 8개입니다.'};
   m.pendingOrders.push({id:m.nextOrderId++,nationId:id,good,side,quantity,remaining:quantity,limitPriceMilli,placedDay:w.dayIndex,expiresDay:w.dayIndex+120});}
 w.changeSeq++;return {ok:true,reason:'다음 분기 시장 체결을 위해 주문을 등록했습니다.'};
}
function e3eCancelManualOrder(w,id){const m=e3eEnsureMarket(w),i=m.pendingOrders.findIndex(o=>o.id===id&&w.nations[o.nationId]?.controller==='PLAYER');
 if(i<0)return false;m.pendingOrders.splice(i,1);w.changeSeq++;return true;}
function e3eMarketSummary(w){const m=e3eEnsureMarket(w);return {openedDay:m.openedDay,quarterDay:m.quarterDay,prices:{...m.prices},lastQuarter:m.lastQuarter,totals:{...m.totals},lastOrders:m.lastOrders,lastNation:m.lastNation,lastBlocks:m.lastBlocks,pendingOrders:m.pendingOrders};}
function e3eMarketCsv(w){const m=e3eEnsureMarket(w),head=['dayIndex','good','priceMilli','nextPriceMilli','validDemand','validSupply','volume','trades','buyerPaid','sellerReceived','feesSink','unfilledBuy','unfilledSell','directVolume','indirectVolume','directTrades','indirectTrades','indirectFeeGold'];
 const rows=[head.join(',')];for(const q of m.quarters)for(const good of E3E_GOOD_INDEX){const x=q.goods[good];if(x)rows.push([q.dayIndex,good,...head.slice(2).map(k=>x[k]||0)].join(','));}
 return '\ufeff'+rows.join('\n');
}
function e3eValidateMarket(w){const m=w.market,integer=(x,min=0)=>Number.isSafeInteger(x)&&x>=min;
 if(!m||m.schema!==2||!m.prices||!m.totals||!Array.isArray(m.quarters)||m.quarters.length>E3E_MARKET_HISTORY_LIMIT||!Array.isArray(m.fills)||m.fills.length>E3E_MARKET_FILLS_LIMIT||!Array.isArray(m.pendingOrders)||m.pendingOrders.length>8||!integer(m.nextOrderId)||!Array.isArray(m.lastOrders)||m.lastOrders.length>w.nations.length*E3E_GOOD_INDEX.length*2||!Array.isArray(m.lastNation)||m.lastNation.length>w.nations.length||!integer(m.nextFillId)||!integer(m.coalIntroducedDay)||!integer(m.f2bIntroducedDay)||!(['number','object'].includes(typeof m.openedDay))||m.openedDay!==null&&(!integer(m.openedDay)||m.openedDay>w.dayIndex)||m.quarterDay!==null&&(!integer(m.quarterDay)||m.quarterDay>w.dayIndex))return false;
 if(E3E_GOOD_INDEX.some(g=>!integer(m.prices[g],1)||m.prices[g]!==e3eBoundPrice(g,m.prices[g])))return false;
 if(['volume','baseGold','buyerPaid','sellerReceived','feesSink','trades','directVolume','indirectVolume','directTrades','indirectTrades','indirectFeeGold'].some(k=>!integer(m.totals[k]))||(m.totals.buyerPaid!==m.totals.sellerReceived+m.totals.feesSink||m.totals.volume!==m.totals.directVolume+m.totals.indirectVolume||m.totals.trades!==m.totals.directTrades+m.totals.indirectTrades))return false;
 let day=-1;
 for(const q of m.quarters){if(!integer(q.dayIndex)||!integer(q.directVolume)||!integer(q.indirectVolume)||q.directVolume+q.indirectVolume!==q.totalVolume||!integer(q.directTrades)||!integer(q.indirectTrades)||q.directTrades+q.indirectTrades!==q.trades||!integer(q.indirectFeeGold)||q.dayIndex<=day||q.dayIndex>w.dayIndex||q.dayIndex%DAYS_PER_QUARTER!==0||!q.goods||!integer(q.availableRoutes)||!integer(q.trades)||!integer(q.totalVolume)||!integer(q.totalGold)||!integer(q.feesSink))return false;
   for(const g of E3E_GOOD_INDEX){const x=q.goods[g];if(g==='coal'&&!x&&q.dayIndex<m.coalIntroducedDay)continue;if(['machine_parts','steel'].includes(g)&&!x&&q.dayIndex<m.f2bIntroducedDay)continue;if(!x||!integer(x.priceMilli,1)||!integer(x.nextPriceMilli,1)||['validDemand','validSupply','requestedBuy','requestedSell','volume','trades','buyerPaid','sellerReceived','feesSink','unfilledBuy','unfilledSell'].some(k=>!integer(x[k]))||x.buyerPaid!==x.sellerReceived+x.feesSink||!integer(x.directVolume)||!integer(x.indirectVolume)||x.directVolume+x.indirectVolume!==x.volume||!integer(x.indirectFeeGold))return false;}
   day=q.dayIndex;
 }
 if(m.quarterDay!==null&&day!==m.quarterDay)return false;
 for(const e of m.fills)if(!integer(e.id)||!integer(e.dayIndex)||e.dayIndex>w.dayIndex||!w.nations[e.seller]||!w.nations[e.buyer]||e.seller===e.buyer||!TRADE_GOODS[e.good]||!integer(e.quantity,1)||!integer(e.priceMilli,1)||!integer(e.baseGold,1)||!integer(e.buyerPaid)||!integer(e.sellerReceived)||!integer(e.feeGold)||e.buyerPaid!==e.sellerReceived+e.feeGold||!['DIRECT','INDIRECT'].includes(e.mode)||!integer(e.indirectFeeGold)||!integer(e.baseFeeGold)||e.baseFeeGold+e.indirectFeeGold!==e.feeGold||e.mode==='INDIRECT'&&(e.routeDistance!==null||!integer(e.freightUsed,1)))return false;
 for(const o of m.pendingOrders)if(!integer(o.id)||!w.nations[o.nationId]||!TRADE_GOODS[o.good]||!['BUY','SELL'].includes(o.side)||!integer(o.quantity,1)||o.quantity>10000||!integer(o.remaining,1)||o.remaining>o.quantity||!integer(o.placedDay)||!integer(o.expiresDay)||o.placedDay>w.dayIndex||o.expiresDay<o.placedDay||!integer(o.limitPriceMilli,1)||o.limitPriceMilli<e3eBaseMilli(o.good)/2||o.limitPriceMilli>e3eBaseMilli(o.good)*3)return false;
 for(const o of m.lastOrders)if(!w.nations[o.nationId]||!TRADE_GOODS[o.good]||!['BUY','SELL'].includes(o.side)||!integer(o.requested,1)||!integer(o.filled)||o.filled>o.requested||!integer(o.unfilled)||o.filled+o.unfilled!==o.requested||!integer(o.limitPriceMilli,1))return false;
 return true;
}
// V0.7I3A — purpose-built central mechanical power houses, not electrical generation.
// These structures consume no normal building or industrial lot, and never mint power for storage.
const I3A_TYPES=Object.freeze({STEAM:{label:'중앙 증기 동력소',pu:160,gold:26,coal:6,workers:5,ap:35,buildDays:150,priceGold:2400,materials:{wood:50,stone:40,iron:80,steel:8,machine_parts:12}},
 HYDRO:{label:'중앙 수력 동력소',pu:95,gold:10,coal:0,workers:4,ap:28,buildDays:120,priceGold:1800,materials:{wood:35,stone:35,iron:50,steel:4,machine_parts:8}}});
const I3A_HP=120,I3A_HISTORY=48;
const i3aMapOptions={enabled:false,size:1,flows:true};
function i3aEmptyQuarter(day){return {dayIndex:day,generated:0,exported:0,delivered:0,loss:0,goldSpent:0,coalUsed:0,steamPU:0,hydroPU:0,transactions:0,activePlants:0,byNation:{}};}
function i3aEnsure(w){const s=w.i3Power||(w.i3Power={schema:1,nextId:1,plants:[],lastQuarter:i3aEmptyQuarter(Math.floor(w.dayIndex/30)*30),history:[],recent:[],lastNetwork:{dayIndex:null,lines:{},stations:{}}});
 s.aiDiagnostics??={};return s;}
// I3A1: one bounded, non-historic investment snapshot per nation; no AI RNG or generation effect.
const I3A1_DECISIONS=new Set(['TECH_LOCKED','NO_RECENT_POWER_SAMPLE','NO_REAL_DEFICIT','NO_STATION','NO_ELIGIBLE_SITE','SITE_DEMAND_LOW','COAL_RESERVE_LOW','FUEL_SUPPLY_UNVERIFIED','ROUTE_BLOCKED','BUDGET_LOW','ROI_LOW','UNAFFORDABLE','BUILD_ILLEGAL','BUILD_FAILED','PROJECT_STARTED']);
const I3A2_OPERATION_REASONS=new Set(['CONSTRUCTING','OFFLINE','RUNNING','WORKERS_LOW','GOLD_LOW','NATIONAL_COAL_LOW','LOCAL_COAL_LOW','NO_RECIPIENT_DEMAND','DISPATCH_NOT_ECONOMIC','UNOBSERVED']);
function i3a2OperationLabel(reason){return ({CONSTRUCTING:'건설 중',OFFLINE:'시설·연결망 차단',RUNNING:'이번 분기 발전함',WORKERS_LOW:'지역 노동력 부족',GOLD_LOW:'운영 Gold 부족',NATIONAL_COAL_LOW:'국가 석탄 부족',LOCAL_COAL_LOW:'발전소 지역 석탄 부족',NO_RECIPIENT_DEMAND:'수신 공방 수요 없음',DISPATCH_NOT_ECONOMIC:'수신 수요 있으나 경제적 송출 불성립',UNOBSERVED:'실제 운전 조건 미관측'})[reason]||reason||'—';}
function i3a2PlantStatus(w,p){const q=i3aEnsure(w).lastQuarter,op=p.lastOperation;return op?.dayIndex===q.dayIndex?op:null;}
function i3a1WorkshopPowerDemand(w,b){
 const p=b?.lastPower;if(!p||b.typeId!=='workshop'||b.status!=='ACTIVE'||b.disconnected||
  !Number.isSafeInteger(p.dayIndex)||p.dayIndex<0||p.dayIndex>w.dayIndex||w.dayIndex-p.dayIndex>240||
  !Number.isSafeInteger(p.demand)||p.demand<=0||!Number.isSafeInteger(p.supplied)||p.supplied<0||
  (p.externalPowerUsed!==undefined&&(!Number.isSafeInteger(p.externalPowerUsed)||p.externalPowerUsed<0)))return null;
 const own=Math.min(p.demand,p.supplied),external=Math.min(p.demand-own,p.externalPowerUsed??0),total=own+external;
 return {ownPU:own,externalPU:external,totalPU:total,demandPU:p.demand,unmetPU:Math.max(0,p.demand-total),dayIndex:p.dayIndex};
}
function i3a1DecisionLabel(reason){return ({TECH_LOCKED:'송력 기술 미해금',NO_RECENT_POWER_SAMPLE:'최근 공방 동력 기록 없음',NO_REAL_DEFICIT:'실제 동력 부족 없음',NO_STATION:'연결 가능한 동력 연결소 없음',NO_ELIGIBLE_SITE:'투자 가능한 동력소 입지 없음',SITE_DEMAND_LOW:'정착지 부족량이 투자 문턱 미달',COAL_RESERVE_LOW:'국가 석탄 예비량 부족',FUEL_SUPPLY_UNVERIFIED:'완공 후 지역 석탄 조달 불확실',ROUTE_BLOCKED:'수송 도로 경로 단절',BUDGET_LOW:'AI 투자 예비 Gold 부족',ROI_LOW:'투자 수익성 부족',UNAFFORDABLE:'AP·Gold·건설 물자 부족',BUILD_ILLEGAL:'시설 건설 요건 미충족',BUILD_FAILED:'건설 시도 실패',PROJECT_STARTED:'동력소 건설 착수'})[reason]||reason||'미평가';}
function i3aLog(w,kind,data={}){const s=i3aEnsure(w);s.recent.push({dayIndex:w.dayIndex,kind,...data});if(s.recent.length>50)s.recent.splice(0,s.recent.length-50);}
function i3aPlant(w,sid){return i3aEnsure(w).plants.find(p=>p.settlementId===sid);}
function i3aSiteProxy(p){return {settlementId:p.settlementId,tileId:p.tileId};}
function i3aOnline(w,p){if(!p||p.status!=='ACTIVE'||p.hp<1)return false;
 const s=w.settlements.find(x=>x.id===p.settlementId),t=w.tiles[p.tileId];
 return Boolean(s&&t&&s.ownerId===p.ownerId&&t.ownerId===p.ownerId&&t.occupiedBy===null&&i2StationOnline(w,i2Station(w,p.settlementId))&&
 !w.occupations.some(o=>o.tileId===t.id));}
function i3aBuildLegal(w,nid,sid,type){const p=I3A_TYPES[type],n=w.nations[nid],s=w.settlements.find(x=>x.id===sid),t=s&&w.tiles[s.coreTileId];
 return Boolean(p&&n?.active&&n.civilization?.era==='industrial_modern'&&hasTech(w,nid,'power_transmission')&&
 (type==='HYDRO'||hasTech(w,nid,'steam_engineering'))&&s&&s.ownerId===nid&&s.population>=1&&
 t?.ownerId===nid&&t.occupiedBy===null&&!w.occupations.some(o=>o.tileId===t.id)&&!i3aPlant(w,sid)&&
 i2StationOnline(w,i2Station(w,sid))&&(type!=='HYDRO'||riverAdjacentTileInfo(w,t.id).riverbank));}
function i3aPrice(type){const def=I3A_TYPES[type];return def&&{apUnits:def.ap,gold:def.priceGold,knowledge:0,resources:{...def.materials}};}
function i3aBuild(w,nid,sid,type){if(!i3aBuildLegal(w,nid,sid,type))return {ok:false,reason:'시설·기술·강변·동력 연결소 조건 부족'};
 const n=w.nations[nid],price=i3aPrice(type);if(!canAfford(n,price))return {ok:false,reason:'AP·Gold·물자 부족'};
 payCost(n,price,'civil');i1Reconcile(w,n);const site=w.settlements.find(x=>x.id===sid),s=i3aEnsure(w);
 const p={id:s.nextId++,type,settlementId:sid,tileId:site.coreTileId,ownerId:nid,hp:I3A_HP,status:'CONSTRUCTING',completeDay:w.dayIndex+I3A_TYPES[type].buildDays};
 s.plants.push(p);w.setupLocked=true;w.changeSeq++;i3aLog(w,'BUILD_START',{id:p.id,nationId:nid,settlementId:sid,type});return {ok:true,id:p.id,completeDay:p.completeDay};}
function i3aRepair(w,nid,id){const p=i3aEnsure(w).plants.find(x=>x.id===id);if(!p||p.ownerId!==nid||p.status!=='ACTIVE'||p.hp>=I3A_HP||p.repair)return {ok:false,reason:'수리 대상 없음'};
 const s=w.settlements.find(x=>x.id===p.settlementId);if(s?.ownerId!==nid)return {ok:false,reason:'타국 소유'};
 const missing=I3A_HP-p.hp,price={apUnits:6,gold:Math.ceil(250*missing/I3A_HP),knowledge:0,resources:{iron:Math.ceil(10*missing/I3A_HP),stone:Math.ceil(5*missing/I3A_HP)}};
 if(!canAfford(w.nations[nid],price))return {ok:false,reason:'수리 자원 부족'};payCost(w.nations[nid],price,'civil');i1Reconcile(w,w.nations[nid]);p.repair={ownerId:nid,completeDay:w.dayIndex+Math.ceil(25+75*missing/I3A_HP)};w.changeSeq++;i3aLog(w,'REPAIR_START',{id});return {ok:true};}
function i3aAdvance(w){const s=i3aEnsure(w);for(const p of s.plants){const site=w.settlements.find(q=>q.id===p.settlementId);
  if(site&&site.ownerId!==p.ownerId){p.ownerId=site.ownerId;delete p.repair;w.changeSeq++;i3aLog(w,'TRANSFER',{id:p.id,nationId:p.ownerId});}
  if(p.status==='CONSTRUCTING'&&p.completeDay<=w.dayIndex&&site?.ownerId===p.ownerId){p.status='ACTIVE';w.changeSeq++;i3aLog(w,'COMPLETED',{id:p.id});}
  if(p.repair&&p.repair.completeDay<=w.dayIndex){if(p.repair.ownerId===p.ownerId){p.hp=I3A_HP;w.changeSeq++;i3aLog(w,'REPAIRED',{id:p.id});}delete p.repair;}
 }}
function i3aDamageAt(w,tid,progress){if(!w.i3Power||!Number.isFinite(progress)||progress<=0)return;
 const loss=Math.max(1,Math.ceil(progress*.50));for(const p of w.i3Power.plants)if(p.tileId===tid&&p.status==='ACTIVE'){
  const before=p.hp;p.hp=Math.max(0,p.hp-loss);if(p.hp!==before){w.changeSeq++;if(p.hp===0){delete p.repair;i3aLog(w,'DESTROYED',{id:p.id,tileId:tid});recordHistoricalEvent(w,'war',`중앙 동력소 #${p.id}이(가) 전투로 파괴되었습니다.`,[p.ownerId]);}}
 }}
function i3aOnTransfer(w,sid,oldOwner,newOwner){const p=i3aPlant(w,sid);if(p){p.ownerId=newOwner;delete p.repair;w.changeSeq++;i3aLog(w,'TRANSFER',{id:p.id,oldOwner,newOwner});}}
function i3aStartQuarter(w){const state=i3aEnsure(w);state.lastQuarter=i3aEmptyQuarter(w.dayIndex);state.lastQuarter.activePlants=state.plants.filter(p=>i3aOnline(w,p)).length;}
function i3aPrepareOffers(w,projections){if(!i2Runtime||i2Runtime.world!==w||i2Runtime.day!==w.dayIndex)return;
 const state=i3aEnsure(w);i2Runtime.i3aEligibility=new Map();
 for(const p of state.plants){if(!i3aOnline(w,p)){i2Runtime.i3aEligibility.set(p.id,'OFFLINE');continue;}
  const n=w.nations[p.ownerId],spec=I3A_TYPES[p.type],local=projections.get(p.ownerId)?.regionalEconomy?.towns?.get(p.settlementId);
  const blocked=!n?.active?'OFFLINE':!local||local.workers<spec.workers?'WORKERS_LOW':n.gold<spec.gold?'GOLD_LOW':n.resources.coal<spec.coal?'NATIONAL_COAL_LOW':'ELIGIBLE';
  i2Runtime.i3aEligibility.set(p.id,blocked);if(blocked!=='ELIGIBLE')continue;
  // No idle speculative generation; paid activation happens only when a recipient commits a real transaction.
  i2Runtime.offers.push({nationId:n.id,settlementId:p.settlementId,buildingId:-p.id,available:spec.pu,kind:'POWER_HOUSE',standby:true,
   powerHouse:p,mode:p.type,goldCost:spec.gold,coalCost:spec.coal,activated:false});
 }}
function i3aTrackTransfer(w,o,sent,received,loss,lineIds){const q=i3aEnsure(w).lastQuarter,p=o.powerHouse;
 q.generated+=sent;q.exported+=sent;q.delivered+=received;q.loss+=loss;q.transactions++;
 if(p.type==='STEAM')q.steamPU+=sent;else q.hydroPU+=sent;
 const b=q.byNation[p.ownerId]??=( {generated:0,delivered:0,loss:0,goldSpent:0,coalUsed:0,transactions:0});
 b.generated+=sent;b.delivered+=received;b.loss+=loss;b.transactions++;
 if(!o.i3aCharged){b.goldSpent+=o.goldCost;b.coalUsed+=o.coalCost;q.goldSpent+=o.goldCost;q.coalUsed+=o.coalCost;o.i3aCharged=true;}
 p.lastRun={dayIndex:w.dayIndex,sent:(p.lastRun?.dayIndex===w.dayIndex?p.lastRun.sent:0)+sent,delivered:(p.lastRun?.dayIndex===w.dayIndex?p.lastRun.delivered:0)+received};
}
function i3aFinishQuarter(w,flows){const s=i3aEnsure(w),q=s.lastQuarter;
 if(q.generated!==q.exported||q.exported!==q.delivered+q.loss)throw Error('I3A 발전 회계 불일치');
 // Distinguish physical availability from production. lastRun is retained as an
 // immutable historical last-success record; only lastOperation is current-quarter.
 for(const p of s.plants){const n=w.nations[p.ownerId],spec=I3A_TYPES[p.type],sent=p.lastRun?.dayIndex===w.dayIndex?(p.lastRun.sent||0):0;
  let reason=p.status==='CONSTRUCTING'?'CONSTRUCTING':!i3aOnline(w,p)?'OFFLINE':sent>0?'RUNNING':
   i2Runtime?.i3aEligibility?.get(p.id)||'UNOBSERVED';
  if(reason==='ELIGIBLE'){
   if(spec.coal&&i1Available(w,n,p.settlementId,'coal')<spec.coal)reason='LOCAL_COAL_LOW';
   else {const demand=w.buildings.some(b=>b.typeId==='workshop'&&b.status==='ACTIVE'&&!b.disconnected&&
      w.tiles[b.tileId]?.ownerId===p.ownerId&&b.lastPower?.dayIndex===w.dayIndex&&
      i3a1WorkshopPowerDemand(w,b)?.unmetPU>0&&i2Path(w,p.ownerId,p.settlementId,b.settlementId));
    reason=demand?'DISPATCH_NOT_ECONOMIC':'NO_RECIPIENT_DEMAND';}
  }
  p.lastOperation={dayIndex:w.dayIndex,reason,sent};
 }

 const lines={},stations={},directions={};for(const f of flows){let at=f.from;for(const id of f.lineIds){lines[id]=(lines[id]||0)+f.sent;const l=w.i2Power.lines.find(x=>x.id===id);if(l){const sign=l.from===at?1:-1;directions[id]=(directions[id]||0)+sign*f.sent;at=l.from===at?l.to:l.from;}}stations[f.from]=(stations[f.from]||0)+f.sent;}
 s.lastNetwork={dayIndex:w.dayIndex,lines,stations,directions};s.history.push({...q});if(s.history.length>I3A_HISTORY)s.history.shift();}
// I3A1: assess only real, fresh power deficits. Existing plant output/price/physical supply is unchanged.
// I3A2: conservative physical coal delivery estimate. Evaluates a funded power house,
// not a new freight entitlement. No stock or route is created by this assessment.
const I3A2_FUEL_QUARTERS=6;
function i3a2FuelReadiness(w,n,site,def){
 const sid=site.id,local=i1Available(w,n,sid,'coal'),required=def.coal*I3A2_FUEL_QUARTERS;
 if(!def.coal)return {ready:true,local,inbound:0,transportable:0,available:0,required:0,reason:'NOT_REQUIRED'};
 // A reserved cargo counts only if it is already paid/held in I1 transit, still has
 // a valid national road and would arrive no later than the first working quarter.
 const st=i1Ensure(n,w),deadline=w.dayIndex+def.buildDays+30;
 const inbound=st.transit.filter(p=>p.good==='coal'&&p.to===sid&&p.arriveDay<=deadline&&
   w.settlements.find(t=>t.id===p.from)?.ownerId===n.id&&
   i1RoadPath(w,n,p.from,sid)!==null).reduce((a,p)=>a+p.amount,0);
 const sources=[...Object.keys(st.regional).map(Number),st.anchor].filter((id,i,arr)=>id!=null&&id!==sid&&arr.indexOf(id)===i).sort((a,b)=>a-b);
 let rawReachable=0,routeCapacity=0;
 for(const source of sources){const row=st.regional[String(source)],stock=(row?.coal||0)+(source===st.anchor?i1Central(n,'coal'):0);
  if(!stock)continue;
  const path=i1RoadPath(w,n,source,sid);if(!path)continue;
  // I1 begins supplying constructing plants only during the final 60 days.
  const deliveryDays=Math.max(30,30*Math.ceil((path.length-1)/12));if(deliveryDays>60)continue;
  const cap=i1RouteCapacity(w,path,new Map());
  rawReachable+=Math.min(stock,2*cap);routeCapacity+=2*cap;
 }
 // Already observed regional legacy draws are real national uses. Never pledge the
 // same freshly mined stock simultaneously to a future plant and existing consumers.
 // The maximum of three snapshots is a conservative bound; no future mine output
 // is assumed, since actual production/ownership may change before commissioning.
 const past=[st.lastQuarter,...st.history.slice(-3)];
 const competingDrain=Math.max(0,...past.map(q=>q?.legacyRegionalDraw||0));
 const transportable=Math.max(0,Math.min(rawReachable,routeCapacity)-competingDrain);
 const available=local+inbound+transportable;
 return {ready:available>=required,local,inbound,transportable,available,required,
  competingDrain,reason:available>=required?'FUEL_READY':'FUEL_SUPPLY_UNVERIFIED'};
}
// I3A2: observed fuel opportunity cost is charged to investment ROI only.
// Physical operation still consumes exactly the original 6 coal + 26 Gold.
function i3a2CoalValueGold(w,def){return def.coal?Math.ceil(def.coal*(w.market?.prices?.coal||6000)/1000):0;}
function i3aAIQuarter(w){if(w.dayIndex%120!==0)return;
 const state=i3aEnsure(w),diagnostics=state.aiDiagnostics;
 const workshops=w.buildings.filter(b=>b.typeId==='workshop'&&b.status==='ACTIVE'&&!b.disconnected);
 for(const n of w.nations){if(!n.active||n.controller!=='AI')continue;
  const own=workshops.filter(b=>w.tiles[b.tileId]?.ownerId===n.id),valid=own.map(b=>({b,p:i3a1WorkshopPowerDemand(w,b)})).filter(x=>x.p);
  const unmetPU=valid.reduce((v,x)=>v+x.p.unmetPU,0);
  const result={dayIndex:w.dayIndex,decision:'NO_REAL_DEFICIT',workshops:own.length,recentSamples:valid.length,
   staleSamples:own.length-valid.length,unmetPU,sites:0,considered:0,candidatePU:0,siteId:null,type:null,
   estimatedGain:0,netGold:0,estimatedBuildGold:0,paybackQuarters:null,coalStock:n.resources.coal||0,
   localCoal:null,roadReachable:null,legal:null,affordable:null,plantId:null,
   coalValueGold:0,fuelRequired:0,fuelAvailable:0,fuelInbound:0,fuelTransportable:0,fuelCompetingDrain:0};
  diagnostics[n.id]=result;
  if(!hasTech(w,n.id,'power_transmission')){result.decision='TECH_LOCKED';continue;}
  if(!valid.length){result.decision='NO_RECENT_POWER_SAMPLE';continue;}
  if(unmetPU<=0)continue;
  const onlineSites=w.settlements.filter(t=>t.ownerId===n.id&&i2StationOnline(w,i2Station(w,t.id)));
  const towns=onlineSites.filter(t=>!i3aPlant(w,t.id));
  if(!towns.length){result.decision=onlineSites.length?'NO_ELIGIBLE_SITE':'NO_STATION';continue;}
  result.sites=towns.length;result.decision='NO_ELIGIBLE_SITE';
  const anchor=i1Anchor(w,n);
  for(const site of towns){const users=valid.filter(x=>x.b.settlementId===site.id&&x.p.ownPU<52&&x.p.unmetPU>0);
   if(!users.length)continue;
   result.considered++;
   const demand=users.reduce((a,x)=>a+x.p.unmetPU,0);
   const type=riverAdjacentTileInfo(w,site.coreTileId).riverbank?'HYDRO':'STEAM',def=I3A_TYPES[type];
   const gain=users.reduce((a,x)=>a+i2aWorkshopBenefit(w,n,x.b,x.p.totalPU,Math.min(x.p.unmetPU,Math.floor(def.pu/users.length))),0);
   const coalValueGold=i3a2CoalValueGold(w,def),net=gain-def.gold-coalValueGold;
   const reachable=anchor===site.id||anchor!==null&&Boolean(i1RoadPath(w,n,anchor,site.id));
   // Avoid expensive route/stock forecasting for obviously ineligible projects.
   const eligibleFuel=type==='STEAM'&&demand>=30&&n.gold>=5500&&n.resources.coal>=def.coal*12&&reachable;
   const fuel=eligibleFuel?i3a2FuelReadiness(w,n,site,def):null;
   const legal=i3aBuildLegal(w,n.id,site.id,type),price=i3aPrice(type),affordable=canAfford(n,price);
   const reason=demand<30?'SITE_DEMAND_LOW':n.gold<5500?'BUDGET_LOW':
    type==='STEAM'&&n.resources.coal<def.coal*12?'COAL_RESERVE_LOW':
    type==='STEAM'&&!reachable?'ROUTE_BLOCKED':
    fuel&&!fuel.ready?'FUEL_SUPPLY_UNVERIFIED':
    net<30||def.priceGold>net*80?'ROI_LOW':!legal?'BUILD_ILLEGAL':!affordable?'UNAFFORDABLE':'PROJECT_STARTED';
   const details={decision:reason,candidatePU:demand,siteId:site.id,type,estimatedGain:gain,netGold:net,
    estimatedBuildGold:def.priceGold,paybackQuarters:net>0?Math.ceil(def.priceGold/net):null,
    localCoal:type==='STEAM'?fuel?.local??i1Available(w,n,site.id,'coal'):null,
    roadReachable:reachable,legal,affordable,coalValueGold,fuelRequired:fuel?.required||0,
    fuelAvailable:fuel?.available||0,fuelInbound:fuel?.inbound||0,fuelTransportable:fuel?.transportable||0,
    fuelCompetingDrain:fuel?.competingDrain||0};
   if(demand>result.candidatePU||result.siteId===null)Object.assign(result,details);
   if(reason!=='PROJECT_STARTED')continue;
   const built=i3aBuild(w,n.id,site.id,type);
   if(built.ok){Object.assign(result,details,{decision:'PROJECT_STARTED',plantId:built.id});break;}
   result.decision='BUILD_FAILED';
  }
 }
}
function i3aValid(w){const s=i3aEnsure(w),num=x=>Number.isSafeInteger(x)&&x>=0;
 if(!s.aiDiagnostics||Array.isArray(s.aiDiagnostics)||typeof s.aiDiagnostics!=='object'||Object.keys(s.aiDiagnostics).length>w.nations.length)return false;
 for(const [id,d] of Object.entries(s.aiDiagnostics)){if(!w.nations[Number(id)]||!d||!I3A1_DECISIONS.has(d.decision)||!num(d.dayIndex)||d.dayIndex>w.dayIndex||d.dayIndex%120!==0||
   ['workshops','recentSamples','staleSamples','unmetPU','sites','considered','candidatePU','estimatedGain','estimatedBuildGold','coalStock'].some(k=>!num(d[k]))||
   !Number.isSafeInteger(d.netGold)||d.recentSamples+d.staleSamples!==d.workshops||
   (d.siteId!==null&&!num(d.siteId))||(d.plantId!==null&&!num(d.plantId))||
   (d.type!==null&&!I3A_TYPES[d.type])||(d.paybackQuarters!==null&&!num(d.paybackQuarters))||
   (d.localCoal!==null&&!num(d.localCoal))||
   (d.roadReachable!==null&&typeof d.roadReachable!=='boolean')||
   (d.legal!==null&&typeof d.legal!=='boolean')||(d.affordable!==null&&typeof d.affordable!=='boolean')||
   ['coalValueGold','fuelRequired','fuelAvailable','fuelInbound','fuelTransportable','fuelCompetingDrain'].some(k=>d[k]!==undefined&&!num(d[k])))return false;}
 if(s.schema!==1||!num(s.nextId)||!Array.isArray(s.plants)||s.plants.length>w.settlements.length||!Array.isArray(s.history)||s.history.length>I3A_HISTORY||!Array.isArray(s.recent)||s.recent.length>50||!s.lastQuarter||!s.lastNetwork)return false;
 const seen=new Set(),ids=new Set();for(const p of s.plants){const st=w.settlements.find(x=>x.id===p.settlementId);
  if(!st||seen.has(p.settlementId)||ids.has(p.id)||!num(p.id)||!I3A_TYPES[p.type]||!w.nations[p.ownerId]||p.tileId!==st.coreTileId||!num(p.hp)||p.hp>I3A_HP||!['ACTIVE','CONSTRUCTING'].includes(p.status)||!num(p.completeDay)||p.completeDay>w.dayIndex+1200)return false;
  if(p.repair&&(!num(p.repair.completeDay)||p.repair.completeDay>w.dayIndex+1200))return false;
  if(p.lastOperation&&(!num(p.lastOperation.dayIndex)||p.lastOperation.dayIndex>w.dayIndex||p.lastOperation.dayIndex%30!==0||!num(p.lastOperation.sent)||!I3A2_OPERATION_REASONS.has(p.lastOperation.reason)))return false;
  seen.add(p.settlementId);ids.add(p.id);
 }
 for(const q of [...s.history,s.lastQuarter]){if(!q||!num(q.dayIndex)||q.dayIndex>w.dayIndex||q.dayIndex%30!==0||['generated','exported','delivered','loss','goldSpent','coalUsed','steamPU','hydroPU','transactions','activePlants'].some(k=>!num(q[k]))||q.generated!==q.exported||q.exported!==q.delivered+q.loss||q.generated!==q.steamPU+q.hydroPU)return false;
  for(const b of Object.values(q.byNation||{}))if(['generated','delivered','loss','goldSpent','coalUsed','transactions'].some(k=>!num(b[k]))||b.generated!==b.delivered+b.loss)return false;
 }
 return true;}
function i3aDrawPowerHouses(ctx,w,scale,ox,oy,cw,ch){const s=w.i3Power;if(!s)return;
 const r=Math.max(4,Math.min(10,scale*.23))*i3aMapOptions.size;
 for(const p of s.plants){const t=w.tiles[p.tileId],x=ox+(t.x+.66)*scale,y=oy+(t.y+.33)*scale;if(x<-25||x>cw+25||y<-25||y>ch+25)continue;
  ctx.beginPath();ctx.roundRect(x-r*.85,y-r*.85,r*1.7,r*1.7,Math.max(2,r*.25));ctx.fillStyle=p.status==='CONSTRUCTING'?'#9e9fa4':i3aOnline(w,p)?p.type==='STEAM'?'#d9a669':'#68bfe2':'#cb6765';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.25;ctx.stroke();
  if(scale>15){ctx.font='bold '+Math.max(7,r*.9)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#102334';ctx.fillText(p.type==='STEAM'?'S':'H',x,y+.3);}
 }}
function i3aAppendInspector(box,w,tid){if(!i3aMapOptions.enabled)return;const s=w.i3Power;if(!s)return;
 const plants=s.plants.filter(p=>p.tileId===tid),stations=(w.i2Power?.stations||[]).filter(p=>p.tileId===tid),lines=(w.i2Power?.lines||[]).filter(l=>l.path.includes(tid));
 if(!plants.length&&!stations.length&&!lines.length)return;
 const section=make('section',{class:'facility-mini'},[make('strong',{text:'I3A · 동력 공급망'})]);
 for(const p of plants){const op=i3a2PlantStatus(w,p);section.append(make('div',{class:'muted-line',text:`${I3A_TYPES[p.type].label} #${p.id} · ${p.status} · HP ${p.hp}/${I3A_HP} · 설비 ${i3aOnline(w,p)?'연결 정상':'차단'} · 이번 분기 ${op?.sent??'—'} PU (${op?i3a2OperationLabel(op.reason):'미관측'}) · 마지막 발전 ${p.lastRun?.dayIndex??'—'}일`}));}
 for(const p of stations)section.append(make('div',{class:'muted-line',text:`연결소 #${p.id} · HP ${p.hp}/100 · ${i2StationOnline(w,p)?'정상':'차단'}`}));
 for(const l of lines)section.append(make('div',{class:'muted-line',text:`송력선 #${l.id} · ${l.path.length-1}타일 · HP ${l.hp}/100 · ${i2LineOnline(w,l)?'정상':'차단'} · 지난 분기 통과 ${s.lastNetwork?.lines?.[l.id]||0}/100 PU`}));
 box.append(section);
}
function i3aPanel(w,n){const s=i3aEnsure(w),q=s.lastQuarter,own=s.plants.filter(p=>p.ownerId===n.id),area=make('section',{class:'overview-section'},[make('h3',{text:'I3A · 중앙 증기·수력 동력소'})]);
 const nq=q.byNation[n.id]||{};
 area.append(make('p',{class:'muted-line',text:`중앙 동력소 ${own.length}곳 (가동 가능 ${own.filter(p=>i3aOnline(w,p)).length}) · 이번 분기 생산 ${nq.generated||0} PU / 도착 ${nq.delivered||0} PU / 손실 ${nq.loss||0} PU · 운영 Gold ${nq.goldSpent||0} · 석탄 ${nq.coalUsed||0}`}));
 area.append(make('p',{class:'muted-line',text:'공장 생산과 무관한 전용 시설 · 일반 건물 슬롯 0 · 실제 동력 수요가 있을 때만 유상 운전 · 증기 160 PU / 수력 95 PU'}));
 const diag=s.aiDiagnostics?.[n.id];
 if(n.controller==='AI')area.append(make('p',{class:'muted-line',text:diag?
  `I3A2 투자 AI · 최근 ${diag.dayIndex}일 · ${i3a1DecisionLabel(diag.decision)} · 실제 미충족 ${diag.unmetPU} PU · 공방 표본 ${diag.recentSamples}/${diag.workshops} · 후보 정착지 ${diag.siteId??'—'} (${diag.candidatePU} PU) · 예상 순익 ${diag.netGold} G/분기 (석탄 가치 ${diag.coalValueGold??0} G 차감) · 회수 ${diag.paybackQuarters??'—'}분기 · 국가 석탄 ${diag.coalStock}${diag.localCoal===null?'':` / 후보 지역 ${diag.localCoal}`} · 완공 이후 확보 전망 ${diag.fuelAvailable??'—'}/${diag.fuelRequired??'—'} 석탄 (입고 ${diag.fuelInbound??0}, 도달 가능 여유 ${diag.fuelTransportable??0}, 기존 지출 예비 ${diag.fuelCompetingDrain??0})`:
  'I3A2 투자 AI · 아직 평가 기록 없음 (최대 120일 간격)',}));
 for(const p of own){const t=w.settlements.find(x=>x.id===p.settlementId),op=i3a2PlantStatus(w,p);const desc=make('div',{class:'muted-line',text:`${t?.name||p.settlementId} · ${I3A_TYPES[p.type].label} #${p.id} · ${p.status} · HP ${p.hp}/${I3A_HP} · 설비 ${i3aOnline(w,p)?'정상':'차단'} · 이번 분기 ${op?.sent??'—'} PU · ${op?i3a2OperationLabel(op.reason):'미관측'} · 마지막 발전 ${p.lastRun?.dayIndex??'—'}일`});area.append(desc);
  if(n.controller==='PLAYER'&&p.status==='ACTIVE'&&p.hp<I3A_HP&&!p.repair){const b=make('button',{class:'jump-button',type:'button',text:'동력소 수리'});b.addEventListener('click',()=>{const r=i3aRepair(w,n.id,p.id);showToast(r.ok?'동력소 수리 착수':r.reason);renderNationOverview();map.draw();});area.append(b);}
 }
 if(n.controller==='PLAYER'&&n.active){for(const t of w.settlements.filter(x=>x.ownerId===n.id&&!i3aPlant(w,x.id)&&i2StationOnline(w,i2Station(w,x.id)))){
  for(const type of riverAdjacentTileInfo(w,t.coreTileId).riverbank?['HYDRO','STEAM']:['STEAM']){const def=I3A_TYPES[type],btn=make('button',{class:'jump-button',type:'button',text:`${t.name} · ${def.label} 건설 (${def.priceGold} G)`});btn.disabled=!i3aBuildLegal(w,n.id,t.id,type);btn.addEventListener('click',()=>{const r=i3aBuild(w,n.id,t.id,type);showToast(r.ok?'중앙 동력소 건설 착수':r.reason);renderNationOverview();map.draw();});area.append(btn);}
 }}
 const dl=make('button',{class:'jump-button',type:'button',text:'I3A 동력소 JSON 내보내기'});dl.addEventListener('click',()=>download(`vilob-i3a-power-day${w.dayIndex}.json`,JSON.stringify({version:VERSION,dayIndex:w.dayIndex,plants:s.plants,lastQuarter:s.lastQuarter,history:s.history,recent:s.recent,lastNetwork:s.lastNetwork,aiDiagnostics:s.aiDiagnostics},null,2),'application/json'));area.append(dl);return area;}

// V0.7I2 — paid, destructible mechanical power stations and road-aligned transmission lines.
// Power is non-storable and transferred only after its actual source has operated.
const I2_STATION_PRICE={apUnits:12,gold:650,knowledge:0,resources:{wood:20,stone:25,iron:25,machine_parts:4}};
const I2_LINE_AP=8,I2_STATION_HP=100,I2_LINE_HP=100,I2_HISTORY=48;
let i2Runtime=null;
function i2EmptyQuarter(day){return {dayIndex:day,generatedSurplus:0,exported:0,delivered:0,loss:0,unallocated:0,transactions:0,activeStations:0,activeLines:0,standbyPU:0,standbyGold:0,standbyBasicGold:0,standbySteamGold:0,standbyCoal:0,standbyStarts:0,partialWorkshopPU:0,standbyByNation:{}};}
function i2Ensure(w){return w.i2Power||(w.i2Power={schema:1,nextStationId:1,nextLineId:1,stations:[],lines:[],lastQuarter:i2EmptyQuarter(Math.floor(w.dayIndex/30)*30),history:[],recent:[],aiDiagnostics:{}});}
function i2Log(w,kind,data={}){const st=i2Ensure(w);st.recent.push({dayIndex:w.dayIndex,kind,...data});if(st.recent.length>50)st.recent.splice(0,st.recent.length-50);}
function i2Station(w,sid){return i2Ensure(w).stations.find(x=>x.settlementId===sid);}
function i2StationOnline(w,station){if(!station||station.status!=='ACTIVE'||station.hp<1)return false;
 const s=w.settlements.find(x=>x.id===station.settlementId),t=w.tiles[station.tileId];
 return Boolean(s&&t&&s.ownerId===station.ownerId&&t.ownerId===station.ownerId&&t.occupiedBy===null&&
  station.tileId===s.coreTileId&&!w.occupations.some(o=>o.tileId===station.tileId));}
function i2LineOnline(w,line){const a=i2Station(w,line.from),b=i2Station(w,line.to);
 if(line.status!=='ACTIVE'||line.hp<1||!i2StationOnline(w,a)||!i2StationOnline(w,b)||a.ownerId!==b.ownerId||line.ownerId!==a.ownerId)return false;
 // An old, paid line does not spontaneously reroute when the geography changes.
 for(let k=0;k<line.path.length;k++){const t=w.tiles[line.path[k]];
  if(!t||t.ownerId!==line.ownerId||t.occupiedBy!==null||w.occupations.some(o=>o.tileId===t.id))return false;
  if(k){const prev=w.tiles[line.path[k-1]],sameTown=prev.settlementId===t.settlementId&&[line.from,line.to].includes(t.settlementId);
   if(!neighbors4(t.id,w.size,w.height).includes(prev.id)||!sameTown&&!(prev.roadLevel>0&&t.roadLevel>0))return false;}
 }
 return true;
}
function i2Cost(w,nid,kind,arg){
 if(kind==='STATION')return I2_STATION_PRICE;
 if(kind==='LINE'){
  const length=arg.path.length-1;
  return {apUnits:I2_LINE_AP,gold:150+60*length,knowledge:0,resources:{wood:3*length,stone:2*length,iron:4*length,machine_parts:length}};
 }
 if(kind==='REPAIR'){
  const missing=100-arg.hp;
  return {apUnits:4,gold:Math.max(1,Math.ceil(150*missing/100)),knowledge:0,resources:{wood:Math.max(1,Math.ceil(5*missing/100)),iron:Math.max(1,Math.ceil(8*missing/100))}};
 }
 return null;
}
function i2BuildLegal(w,nid,kind,arg){
 const n=w.nations[nid];if(!n?.active||!hasTech(w,nid,'power_transmission'))return false;
 if(kind==='STATION'){
  const s=w.settlements.find(x=>x.id===arg.settlementId),tile=s&&w.tiles[s.coreTileId];
  return Boolean(s&&s.ownerId===nid&&s.population>0&&tile?.ownerId===nid&&tile.occupiedBy===null&&!w.occupations.some(o=>o.tileId===tile.id)&&!i2Station(w,s.id));
 }
 if(kind==='LINE'){
  const a=i2Station(w,arg.from),b=i2Station(w,arg.to);
  if(!a||!b||a===b||a.ownerId!==nid||b.ownerId!==nid||!i2StationOnline(w,a)||!i2StationOnline(w,b))return false;
  const lines=i2Ensure(w).lines;
  if(lines.some(x=>(x.from===arg.from&&x.to===arg.to||x.from===arg.to&&x.to===arg.from)))return false;
  if(lines.filter(x=>x.from===arg.from||x.to===arg.from).length>=4||lines.filter(x=>x.from===arg.to||x.to===arg.to).length>=4)return false;
  const path=i1RoadPath(w,n,arg.from,arg.to);
  return Boolean(path&&path.length>1&&path.length<=9);
 }
 if(kind==='REPAIR'){
  const ob=arg.type==='STATION'?i2Ensure(w).stations.find(x=>x.id===arg.id):i2Ensure(w).lines.find(x=>x.id===arg.id);
  if(!ob||ob.ownerId!==nid||ob.hp>=100||ob.repair||ob.status!=='ACTIVE')return false;
  if(arg.type==='STATION')return w.settlements.find(s=>s.id===ob.settlementId)?.ownerId===nid&&w.tiles[ob.tileId]?.occupiedBy===null;
  return i2Station(w,ob.from)?.ownerId===nid&&i2Station(w,ob.to)?.ownerId===nid;
 }
 return false;
}
function i2Build(w,nid,kind,arg){
 if(!i2BuildLegal(w,nid,kind,arg))return {ok:false,reason:'기술·경로·시설 조건 부족'};
 const n=w.nations[nid],path=kind==='LINE'?i1RoadPath(w,n,arg.from,arg.to):null;
 const object=kind==='REPAIR'?(arg.type==='STATION'?i2Ensure(w).stations:i2Ensure(w).lines).find(x=>x.id===arg.id):null;
 const price=i2Cost(w,nid,kind,kind==='LINE'?{path}:kind==='REPAIR'?object:arg);
 if(!canAfford(n,price))return {ok:false,reason:'AP·Gold·건설 자재 부족'};
 payCost(n,price,'civil');i1Reconcile(w,n); // Preserve existing national/local resource accounting for paid construction.
 const st=i2Ensure(w),day=w.dayIndex;
 if(kind==='STATION'){
  const s=w.settlements.find(x=>x.id===arg.settlementId);
  st.stations.push({id:st.nextStationId++,settlementId:s.id,tileId:s.coreTileId,ownerId:nid,hp:100,status:'CONSTRUCTING',completeDay:day+90});
 }else if(kind==='LINE'){
  st.lines.push({id:st.nextLineId++,from:arg.from,to:arg.to,ownerId:nid,path:path.slice(),hp:100,status:'CONSTRUCTING',completeDay:day+30+path.length*10-10});
 }else{
  object.repair={ownerId:nid,completeDay:day+Math.ceil(30+60*(100-object.hp)/100)};
 }
 w.setupLocked=true;w.changeSeq++;i2Log(w,kind+'_START',{nationId:nid,from:arg.from,to:arg.to,settlementId:arg.settlementId,id:kind==='STATION'?st.stations.at(-1).id:kind==='LINE'?st.lines.at(-1).id:object?.id??null});
 return {ok:true,completeDay:kind==='REPAIR'?object.repair.completeDay:kind==='STATION'?st.stations.at(-1).completeDay:st.lines.at(-1).completeDay};
}
function i2Advance(w){i3aAdvance(w);const st=i2Ensure(w);
 // Synchronized once per day; every online test checks current tile/settlement ownership immediately.
 for(const node of st.stations){const owner=w.settlements.find(s=>s.id===node.settlementId)?.ownerId;
  if(owner!==null&&owner!==undefined&&node.ownerId!==owner){const previous=node.ownerId;node.ownerId=owner;delete node.repair;
   i2Log(w,'STATION_CONQUERED',{id:node.id,previousOwner:previous,newOwner:owner});w.changeSeq++;}
 }
 for(const ob of [...st.stations,...st.lines]){
  if(ob.status==='CONSTRUCTING'&&ob.completeDay<=w.dayIndex){
   // When conquered, the paid structure remains unfinished until its owner regains control.
   const legal=ob.settlementId!==undefined?w.settlements.find(s=>s.id===ob.settlementId)?.ownerId===ob.ownerId:
    i2Station(w,ob.from)?.ownerId===ob.ownerId&&i2Station(w,ob.to)?.ownerId===ob.ownerId;
   if(legal){ob.status='ACTIVE';i2Log(w,'COMPLETED',{id:ob.id,type:ob.settlementId!==undefined?'STATION':'LINE'});w.changeSeq++;}
  }
  if(ob.repair&&ob.repair.completeDay<=w.dayIndex){
   if(ob.ownerId===ob.repair.ownerId){ob.hp=100;i2Log(w,'REPAIRED',{id:ob.id});w.changeSeq++;}
   delete ob.repair;
  }
 }
}
function i2DamageAt(w,tileId,progress){i3aDamageAt(w,tileId,progress);if(!w.i2Power||!Number.isFinite(progress)||progress<=0)return;
 const st=i2Ensure(w),loss=Math.max(1,Math.ceil(progress*.50));
 const affected=st.stations.filter(x=>x.tileId===tileId&&x.status==='ACTIVE').concat(st.lines.filter(x=>x.status==='ACTIVE'&&x.path.includes(tileId)));
 for(const ob of affected){const before=ob.hp;ob.hp=Math.max(0,before-loss);if(ob.hp!==before){w.changeSeq++;if(ob.hp===0){delete ob.repair;i2Log(w,'DESTROYED',{id:ob.id,tileId,structureKind:ob.settlementId!==undefined?'STATION':'LINE'});
  recordHistoricalEvent(w,'war',`동력망 시설 #${ob.id}이(가) 전투로 파괴되었습니다.`,[ob.ownerId]);}}}
}
function i2OnTransfer(w,sid,oldOwner,newOwner){i3aOnTransfer(w,sid,oldOwner,newOwner);const st=i2Ensure(w),ob=i2Station(w,sid);if(ob){ob.ownerId=newOwner;delete ob.repair;}
 // Lines are not automatically annexed: original owner's physical rights lapse.
 for(const l of st.lines)if(l.from===sid||l.to===sid){l.hp=0;delete l.repair;i2Log(w,'CONQUEST_LINE_DISABLED',{id:l.id,from:oldOwner,to:newOwner});}
}
function i2StartQuarter(w){const st=i2Ensure(w);st.lastQuarter=i2EmptyQuarter(w.dayIndex);i2Runtime={world:w,day:w.dayIndex,offers:[],used:new Map(),flows:[]};i3aStartQuarter(w);
 st.lastQuarter.activeStations=st.stations.filter(x=>i2StationOnline(w,x)).length;
 st.lastQuarter.activeLines=st.lines.filter(x=>i2LineOnline(w,x)).length;
}
function i2Offer(w,n,b,ownUnused){if(!i2Runtime||i2Runtime.world!==w||i2Runtime.day!==w.dayIndex||ownUnused<=0)return;
 const station=i2Station(w,b.settlementId);if(!i2StationOnline(w,station))return;
 i2Runtime.offers.push({nationId:n.id,settlementId:b.settlementId,buildingId:b.id,available:ownUnused,kind:b.typeId});
 i2Ensure(w).lastQuarter.generatedSurplus+=ownUnused;
}
// I2A: idle factories may dispatch installed equipment for settlement/line customers.
// No energy is created and no operation is paid until a valid recipient actually uses it.
function i2aPrepareStandby(w,projections){
 if(!i2Runtime||i2Runtime.world!==w||i2Runtime.day!==w.dayIndex)return;
 const occupied=new Set((w.occupations||[]).map(o=>o.tileId));
 i2Runtime.reservedSteamCoal=new Map();
 if(f1QuarterPlanDay===w.dayIndex&&f1QuarterPlan)for(const [id,power] of f1QuarterPlan){
  if(power.source!=='STEAM')continue;
  const b=w.buildings.find(b=>b.id===id),nid=b&&w.tiles[b.tileId]?.ownerId;
  if(nid===null||nid===undefined)continue;
  i2Runtime.reservedSteamCoal.set(nid,(i2Runtime.reservedSteamCoal.get(nid)||0)+3-techBonus(w,nid,'industrialSteamCoalSaving'));
 }
 for(const b of w.buildings){if(b.typeId!=='factory'||b.status!=='ACTIVE'||b.disconnected)continue;
  const t=w.tiles[b.tileId],s=w.settlements.find(x=>x.id===b.settlementId),n=s?.ownerId===t?.ownerId?w.nations[s.ownerId]:null;
  if(!n?.active||!f2FactoryUnlocked(w,n.id)||f2c2cCanProduce(n,'machine_parts')||t.occupiedBy!==null||occupied.has(t.id)||s.population<1||!i2StationOnline(w,i2Station(w,s.id)))continue;
  const local=projections.get(n.id)?.regionalEconomy?.towns?.get(s.id);
  if(!local||local.workers<3||!local.roadNetwork&&t.roadLevel===0&&w.tiles[s.coreTileId]?.roadLevel===0)continue;
  const base=f1PowerBase(w,b,n);
  if(base.pu>0)i2Runtime.offers.push({nationId:n.id,settlementId:s.id,buildingId:b.id,available:base.pu,kind:'factory',standby:true,mode:base.source,goldCost:4,coalCost:0,activated:false});
  const coal=3-techBonus(w,n.id,'industrialSteamCoalSaving');
  if(f1Devices(b).steam&&hasTech(w,n.id,'steam_engineering')&&n.gold>=12&&n.resources.coal>=coal){
   i2Runtime.offers.push({nationId:n.id,settlementId:s.id,buildingId:b.id,available:65,kind:'factory',standby:true,mode:'STEAM',goldCost:12,coalCost:coal,activated:false});
  }
 }
 i3aPrepareOffers(w,projections);
}
function i2aWorkshopBenefit(w,n,b,basePU,additionalPU){
 const lev=Math.max(1,Math.min(3,b.level)),m=(1+techBonus(w,n.id,'workshopGold'))*(b.workshopMode==='precision'?1.2:1);
 return Math.floor(72*lev*m*(1+(basePU+additionalPU)/100))-Math.floor(72*lev*m*(1+basePU/100));
}
function i2Path(w,nid,from,to){if(from===to)return {lines:[],dist:0};
 const st=i2Ensure(w),queue=[{sid:from,lines:[],dist:0}],best=new Map([[from,0]]);
 while(queue.length){queue.sort((a,b)=>a.dist-b.dist||a.sid-b.sid);const cur=queue.shift();if(cur.sid===to)return cur;
 for(const line of st.lines){if(line.ownerId!==nid||!i2LineOnline(w,line))continue;
  const next=line.from===cur.sid?line.to:line.to===cur.sid?line.from:null;if(next===null)continue;
  const dist=cur.dist+line.path.length-1;if(dist>64||dist>=(best.get(next)??Infinity))continue;
  best.set(next,dist);queue.push({sid:next,lines:[...cur.lines,line.id],dist});}
 }return null;
}
// Commit only a fully fundable demand: never consume power if production will not run.
function i2Pull(w,n,sid,need,recipientId,allowPartial=false){if(!need||!i2Runtime||i2Runtime.world!==w||i2Runtime.day!==w.dayIndex||!i2StationOnline(w,i2Station(w,sid)))return 0;
 const st=i2Ensure(w),offers=[];
 for(const o of i2Runtime.offers){if(o.nationId!==n.id||o.buildingId===recipientId||o.available<=0)continue;
  const path=i2Path(w,n.id,o.settlementId,sid);if(path&&path.dist<=64)offers.push({o,path});}
 offers.sort((a,b)=>a.path.dist-b.path.dist||Number(!!a.o.standby)-Number(!!b.o.standby)||
  (a.o.goldCost||0)-(b.o.goldCost||0)||a.o.buildingId-b.o.buildingId);
 let remain=need;const planned=[],temporary=new Map(i2Runtime.used);
 let shadowGold=n.gold-(f1ReservedSteamGold?.get(n.id)||0),shadowCoal=n.resources.coal-(i2Runtime.reservedSteamCoal?.get(n.id)||0);
 const recipient=allowPartial?w.buildings.find(b=>b.id===recipientId):null;
 const originalPU=recipient?.lastPower?.dayIndex===w.dayIndex?recipient.lastPower.supplied:
  recipient?f1ChoosePower(w,recipient,n,{multiplier:1}).pu:0;
 for(const {o,path} of offers){if(remain<=0)break;
  const cap=path.lines.reduce((v,id)=>Math.min(v,Math.max(0,100-(temporary.get(id)||0))),Infinity);
  const sendMax=Math.min(o.available,cap,Math.ceil(remain/Math.pow(.97,path.dist)));
  if(sendMax<=0)continue;
  const received=Math.min(remain,Math.floor(sendMax*Math.pow(.97,path.dist)));
  if(received<=0)continue;
  if(o.standby&&!o.activated){
   if(shadowGold<o.goldCost||shadowCoal<o.coalCost)continue;
   if(o.coalCost&&!i1Can(w,n,o.powerHouse?i3aSiteProxy(o.powerHouse):w.buildings.find(b=>b.id===o.buildingId),{coal:o.coalCost}))continue;
   if(allowPartial&&recipient){
    const marginal=i2aWorkshopBenefit(w,n,recipient,originalPU+need-remain,received);
    const coalPrice=(w.market?.prices?.coal||6000)/1000;
    if(marginal<=o.goldCost+o.coalCost*coalPrice)continue;
   }
   shadowGold-=o.goldCost;shadowCoal-=o.coalCost;
  }
  planned.push({o,path,sent:sendMax,received,loss:sendMax-received});remain-=received;
  for(const id of path.lines)temporary.set(id,(temporary.get(id)||0)+sendMax);
 }
 if((remain>0&&!allowPartial)||planned.length===0)return 0;
 for(const p of planned){p.o.available-=p.sent;
  const source=p.o.powerHouse?i3aSiteProxy(p.o.powerHouse):w.buildings.find(b=>b.id===p.o.buildingId),power=source?.lastPower;
  const fq=f1EnsureIndustry(w.nations[p.o.nationId]).lastQuarter;
  if(p.o.standby){
   if(!p.o.activated){
    if(n.gold<p.o.goldCost||n.resources.coal<p.o.coalCost)throw Error('I2A 운전비 부족');
    n.gold-=p.o.goldCost;n.resources.coal-=p.o.coalCost;
    if(p.o.coalCost){i1Debit(w,n,source,{coal:p.o.coalCost});if(!p.o.powerHouse){fq.coalConsumed+=p.o.coalCost;fq.steamSites++;fq.steamOperatingGold+=p.o.goldCost;f1EnsureIndustry(n).steamOperatedEver=true;}}
    const aq=st.lastQuarter;aq.standbyGold+=p.o.goldCost;aq.standbyCoal+=p.o.coalCost;
    if(p.o.coalCost)aq.standbySteamGold+=p.o.goldCost;else aq.standbyBasicGold+=p.o.goldCost;
    aq.standbyStarts++;
    if(!p.o.powerHouse&&source.lastStandbyPower?.dayIndex!==w.dayIndex)source.lastStandbyPower={dayIndex:w.dayIndex,produced:0,sent:0,goldSpent:0,coalUsed:0};
    if(!p.o.powerHouse){source.lastStandbyPower.goldSpent+=p.o.goldCost;source.lastStandbyPower.coalUsed+=p.o.coalCost;}
    const unit=aq.standbyByNation[n.id]??=( {pu:0,gold:0,coal:0,basicGold:0,steamGold:0});
    unit.gold+=p.o.goldCost;unit.coal+=p.o.coalCost;if(p.o.coalCost)unit.steamGold+=p.o.goldCost;else unit.basicGold+=p.o.goldCost;
    p.o.activated=true;
   }
   fq.powerProduced+=p.sent;fq.powerUsed+=p.sent;
   st.lastQuarter.generatedSurplus+=p.sent;st.lastQuarter.standbyPU+=p.sent;
   if(p.o.powerHouse)i3aTrackTransfer(w,p.o,p.sent,p.received,p.loss,p.path.lines);
   st.lastQuarter.standbyByNation[n.id].pu+=p.sent;
   if(!p.o.powerHouse&&source.lastStandbyPower?.dayIndex!==w.dayIndex)source.lastStandbyPower={dayIndex:w.dayIndex,produced:0,sent:0,goldSpent:0,coalUsed:0};
   if(!p.o.powerHouse){source.lastStandbyPower.produced+=p.sent;source.lastStandbyPower.sent+=p.sent;}
   // Gold/coal are accounted once per activated device, never per transmission.
  }else{
   if(!power||power.dayIndex!==w.dayIndex||power.unused<p.sent)throw Error('I2 동력 생산 회계');
   power.unused-=p.sent;power.used+=p.sent;power.exported=(power.exported||0)+p.sent;
   fq.powerUnused-=p.sent;fq.powerUsed+=p.sent;
   if(p.o.kind==='factory'){const f2=f2Ensure(w.nations[p.o.nationId]).lastQuarter;f2.powerUnused-=p.sent;f2.powerUsed+=p.sent;}
  }
  for(const id of p.path.lines)i2Runtime.used.set(id,(i2Runtime.used.get(id)||0)+p.sent);
  st.lastQuarter.exported+=p.sent;st.lastQuarter.delivered+=p.received;st.lastQuarter.loss+=p.loss;st.lastQuarter.transactions++;
  i2Runtime.flows.push({from:p.o.settlementId,to:sid,sourceBuildingId:p.o.buildingId,targetBuildingId:recipientId,sent:p.sent,received:p.received,loss:p.loss,lineIds:p.path.lines});
 }
 if(allowPartial)st.lastQuarter.partialWorkshopPU+=need-remain;
 return need-remain;
}
function i2FinishQuarter(w){if(!i2Runtime||i2Runtime.world!==w||i2Runtime.day!==w.dayIndex)return;
 const st=i2Ensure(w);st.lastQuarter.unallocated=i2Runtime.offers.reduce((sum,o)=>sum+(o.standby?0:o.available),0);
 i3aFinishQuarter(w,i2Runtime.flows);
 if(st.lastQuarter.generatedSurplus!==st.lastQuarter.exported+st.lastQuarter.unallocated||
    st.lastQuarter.exported!==st.lastQuarter.delivered+st.lastQuarter.loss)throw Error('I2 분기 동력 보존 실패');
 st.history.push({...st.lastQuarter});if(st.history.length>I2_HISTORY)st.history.shift();
 if(i2Runtime.flows.length){for(const f of i2Runtime.flows.slice(-12))i2Log(w,'POWER_TRANSFER',f);}
 i2Runtime=null;
}
// I2A investments are based on *potential paid supply* and actual workshop utilisation,
// not a stale 240-day factory lastPower sample. One paid action per nation/evaluation.
function i2AIQuarter(w){if(w.dayIndex%120!==0)return;
 const diagnostics=i2Ensure(w).aiDiagnostics??=(Object.create(null));
 for(const n of w.nations){if(!n.active||n.controller!=='AI'||!hasTech(w,n.id,'power_transmission'))continue;
  const facilities=w.buildings.filter(b=>['factory','workshop'].includes(b.typeId)&&b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===n.id);
  const workshops=facilities.map(b=>({b,p:i3a1WorkshopPowerDemand(w,b)})).filter(x=>x.p&&x.p.unmetPU>0);
  const idles=facilities.filter(b=>b.typeId==='factory'&&!f2c2cCanProduce(n,'machine_parts')&&f1PowerBase(w,b,n).pu>=12);
  const factories=facilities.filter(b=>b.typeId==='factory'&&f2c2cCanProduce(n,'machine_parts')&&
   f2FactoryPower(w,n,b).supplied<(F2_FACTORY_LEVELS[b.level]?.pu||0));
  let chosen=null,reject='NO_POSITIVE_PROJECT',considered=0;
  if(n.gold<1800)reject='BUDGET_LOW';
  else for(const source of idles){for(const {b:target,p:shortfall} of workshops){
   if(source.id===target.id)continue;
   const sourcePU=f1PowerBase(w,source,n).pu;
   const sid=source.settlementId,tid=target.settlementId;
   if(sid===tid&&i2StationOnline(w,i2Station(w,sid)))continue;
   if(sid!==tid&&i2Path(w,n.id,sid,tid))continue;
   const path=sid===tid?[]:i1RoadPath(w,n,sid,tid);
   if(!path||path.length>9||path.length<=1&&sid!==tid)continue;
   const dist=path.length?path.length-1:0;
   const extra=Math.min(shortfall.unmetPU,Math.floor(sourcePU*Math.pow(.97,dist)));
   if(extra<6)continue;
   const gross=i2aWorkshopBenefit(w,n,target,shortfall.totalPU,extra),net=gross-4;
   const missing=[sid,tid].filter((x,i,a)=>a.indexOf(x)===i&&!i2Station(w,x));
   const stationCost=missing.length*650;
   const hasLine=sid===tid||i2Ensure(w).lines.some(l=>(l.from===sid&&l.to===tid||l.from===tid&&l.to===sid)&&l.status==='ACTIVE'&&l.hp>0);
   const lineCost=sid===tid||hasLine?0:150+60*dist;
   const total=stationCost+lineCost;
   if(net<10||total>net*80){reject='INSUFFICIENT_RETURN';continue;}
   considered++;
   const candidate={sourceId:source.id,targetId:target.id,from:sid,to:tid,expectedPU:extra,netGold:net,estimatedBuildGold:total,dist,missing,hasLine};
   if(!chosen||candidate.netGold>chosen.netGold||candidate.netGold===chosen.netGold&&candidate.estimatedBuildGold<chosen.estimatedBuildGold)chosen=candidate;
  }}
  let decision=chosen?'AWAITING_CONSTRUCTION':reject;
  if(chosen){
   let started=false;
   for(const sid of chosen.missing){if(i2BuildLegal(w,n.id,'STATION',{settlementId:sid})&&i2Build(w,n.id,'STATION',{settlementId:sid}).ok){started=true;decision='STATION_STARTED';break;}}
   if(!started&&chosen.from!==chosen.to&&!chosen.hasLine&&i2BuildLegal(w,n.id,'LINE',{from:chosen.from,to:chosen.to})&&
      i2Build(w,n.id,'LINE',{from:chosen.from,to:chosen.to}).ok){started=true;decision='LINE_STARTED';}
   if(!started){const stat=i2Station(w,chosen.from),dest=i2Station(w,chosen.to);
    decision=(!i2StationOnline(w,stat)||!i2StationOnline(w,dest))?'AWAITING_STATION':
     (chosen.from===chosen.to||chosen.hasLine)?'NETWORK_ACTIVE':'NETWORK_PENDING_OR_UNAFFORDABLE';}
  }
  // Preserve I2 repair logic; still one paid action per evaluation, priority to valuable new projects.
  if(!['STATION_STARTED','LINE_STARTED'].includes(decision))for(const ob of [...i2Ensure(w).stations,...i2Ensure(w).lines]){
   const type=ob.settlementId!==undefined?'STATION':'LINE';
   if(ob.ownerId===n.id&&ob.hp<100&&ob.status==='ACTIVE'&&i2Build(w,n.id,'REPAIR',{type,id:ob.id}).ok){decision='REPAIR_STARTED';break;}
  }
  diagnostics[n.id]={dayIndex:w.dayIndex,decision:decision==='NO_POSITIVE_PROJECT'&&!workshops.length?'NO_REAL_DEFICIT':decision,workshopDemand:workshops.length,unmetPU:workshops.reduce((v,x)=>v+x.p.unmetPU,0),
   recentSamples:facilities.filter(b=>b.typeId==='workshop'&&i3a1WorkshopPowerDemand(w,b)).length,idleFactorySources:idles.length,
   factoryShortage:factories.length,candidates:considered,
   ...(chosen?{sourceId:chosen.sourceId,targetId:chosen.targetId,expectedPU:chosen.expectedPU,netGold:chosen.netGold,estimatedBuildGold:chosen.estimatedBuildGold,distance:chosen.dist}:{})};
 }
}
function i2Valid(w){const st=i2Ensure(w),num=x=>Number.isSafeInteger(x)&&x>=0;if(st.schema!==1||!num(st.nextStationId)||!num(st.nextLineId)||!Array.isArray(st.stations)||!Array.isArray(st.lines)||!Array.isArray(st.history)||st.history.length>I2_HISTORY||st.stations.length>w.settlements.length||st.lines.length>4*w.settlements.length||!Array.isArray(st.recent)||st.recent.length>50)return false;
 const seenSid=new Set(),sid=new Map(),nid=new Set(),lid=new Set();
 for(const x of st.stations){const s=w.settlements.find(y=>y.id===x.settlementId);if(!s||seenSid.has(s.id)||nid.has(x.id)||!num(x.id)||!num(x.ownerId)||!w.nations[x.ownerId]||x.tileId!==s.coreTileId||!num(x.hp)||x.hp>100||!['CONSTRUCTING','ACTIVE'].includes(x.status)||!num(x.completeDay)||x.completeDay>w.dayIndex+1200)return false;
  if(x.repair&&(!num(x.repair.completeDay)||x.repair.completeDay>w.dayIndex+1200))return false;seenSid.add(s.id);nid.add(x.id);sid.set(s.id,x);}
 const degree=new Map();
 for(const l of st.lines){if(lid.has(l.id)||!num(l.id)||!w.nations[l.ownerId]||!sid.has(l.from)||!sid.has(l.to)||l.from===l.to||!Array.isArray(l.path)||l.path.length<2||l.path.length>9||!num(l.hp)||l.hp>100||!['CONSTRUCTING','ACTIVE'].includes(l.status)||!num(l.completeDay)||l.completeDay>w.dayIndex+1200)return false;
  if(l.path[0]!==sid.get(l.from).tileId||l.path.at(-1)!==sid.get(l.to).tileId||l.path.some(id=>!w.tiles[id]))return false;
  lid.add(l.id);degree.set(l.from,(degree.get(l.from)||0)+1);degree.set(l.to,(degree.get(l.to)||0)+1);
  if(l.repair&&(!num(l.repair.completeDay)||l.repair.completeDay>w.dayIndex+1200))return false;
 }
 if([...degree.values()].some(x=>x>4))return false;
 for(const q of [...st.history,st.lastQuarter]){
  if(!q||!num(q.dayIndex)||q.dayIndex>w.dayIndex||q.dayIndex%30!==0)return false;
  for(const key of ['generatedSurplus','exported','delivered','loss','unallocated','transactions','activeStations','activeLines'])if(!num(q[key]))return false;
  if(q.generatedSurplus!==q.exported+q.unallocated||q.exported!==q.delivered+q.loss)return false;
  for(const k of ['standbyPU','standbyGold','standbyBasicGold','standbySteamGold','standbyCoal','standbyStarts','partialWorkshopPU'])if(q[k]!==undefined&&!num(q[k]))return false;
  if(q.standbyGold!==undefined&&q.standbyGold!==(q.standbyBasicGold||0)+(q.standbySteamGold||0))return false;
  if(q.standbyByNation&&Object.values(q.standbyByNation).reduce((s,v)=>s+(v.pu||0),0)!==(q.standbyPU||0))return false;
 }
 return true;
}
function i2DrawPowerOverlay(ctx,w,scale,ox,oy,cw,ch){
 if(!i3aMapOptions.enabled)return;
 const st=w.i2Power;if(!st||(st.stations.length===0&&st.lines.length===0)||scale<10)return;
 ctx.save();ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.clip();
 // These visible routes are built lines, not merely passable roads.
 for(const line of st.lines){if(line.status==='CONSTRUCTING'||line.path.length<2)continue;
  const online=i2LineOnline(w,line);ctx.beginPath();let visible=false;
  for(let k=0;k<line.path.length;k++){const t=w.tiles[line.path[k]],x=ox+(t.x+.5)*scale,y=oy+(t.y+.5)*scale;
   if(x>=-20&&x<=cw+20&&y>=-20&&y<=ch+20)visible=true;
   if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  if(!visible)continue;
  ctx.strokeStyle=!online?'rgba(196,102,95,.70)':i3aMapOptions.flows?(Math.min(100,w.i3Power?.lastNetwork?.lines?.[line.id]||0)>=95?'rgba(239,188,86,.94)':(w.i3Power?.lastNetwork?.lines?.[line.id]||0)>0?'rgba(66,224,192,.94)':'rgba(125,145,155,.55)'):'rgba(50,205,184,.74)';ctx.lineWidth=(scale>=24?2.5:1.4)*i3aMapOptions.size;
  ctx.setLineDash(online?[]:[4,3]);ctx.stroke();
  if(online&&i3aMapOptions.flows&&(w.i3Power?.lastNetwork?.lines?.[line.id]||0)>0&&line.path.length>=2){const mid=Math.min(line.path.length-2,Math.floor((line.path.length-1)/2)),sgn=Math.sign(w.i3Power?.lastNetwork?.directions?.[line.id]||0);if(sgn){const a=w.tiles[line.path[mid]],b=w.tiles[line.path[mid+1]],dx=(b.x-a.x)*sgn,dy=(b.y-a.y)*sgn,x=ox+(a.x+b.x+1)*scale*.5,y=oy+(a.y+b.y+1)*scale*.5,r=4*i3aMapOptions.size;ctx.beginPath();ctx.moveTo(x+dx*r,y+dy*r);ctx.lineTo(x-dx*r-dy*r*.6,y-dy*r+dx*r*.6);ctx.lineTo(x-dx*r+dy*r*.6,y-dy*r-dx*r*.6);ctx.closePath();ctx.fillStyle=ctx.strokeStyle;ctx.fill();}}
 }
 ctx.setLineDash([]);
 for(const node of st.stations){if(node.status==='CONSTRUCTING')continue;
  const t=w.tiles[node.tileId],x=ox+(t.x+.5)*scale,y=oy+(t.y+.5)*scale;
  if(x<0||x>cw||y<0||y>ch)continue;
  const active=i2StationOnline(w,node);
  ctx.beginPath();ctx.arc(x,y,Math.max(3,Math.min(8,scale*.19))*i3aMapOptions.size,0,Math.PI*2);
  ctx.fillStyle=active?'#209b92':'#b45b4e';ctx.fill();
  ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.stroke();
  if(scale>=20){ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold '+Math.max(7,Math.min(11,scale*.24))*i3aMapOptions.size+'px sans-serif';ctx.fillStyle='#fff';ctx.fillText('⚙',x,y+.5);}
 }
 i3aDrawPowerHouses(ctx,w,scale,ox,oy,cw,ch);
 ctx.restore();
}
function i2Csv(w,n){
 const st=i2Ensure(w),cols=['dayIndex','generatedSurplus','exported','delivered','loss','unallocated','transactions','activeStations','activeLines','standbyPU','standbyGold','standbyCoal','standbyStarts','partialWorkshopPU'];
 return [cols.join(','),...st.history.map(q=>cols.map(k=>q[k]??0).join(','))].join('\n');
}
function i2Panel(w,n){const st=i2Ensure(w),area=make('section',{class:'overview-section'},[make('h3',{text:'I2 · 동력 연결소 및 송력선'})]);
 const stations=st.stations.filter(x=>x.ownerId===n.id),lines=st.lines.filter(x=>x.ownerId===n.id);
 area.append(make('p',{class:'muted-line',text:`동력 연결소 ${stations.filter(x=>i2StationOnline(w,x)).length}/${stations.length} 정상 · 송력선 ${lines.filter(x=>i2LineOnline(w,x)).length}/${lines.length} 정상 · 실제 송력 ${st.lastQuarter.delivered} PU · 손실 ${st.lastQuarter.loss} PU · 잉여 ${st.lastQuarter.unallocated} PU`}),
  make('p',{class:'muted-line',text:`I2A 공급전용 ${st.lastQuarter.standbyPU||0} PU · Gold ${st.lastQuarter.standbyGold||0} · 석탄 ${st.lastQuarter.standbyCoal||0} · 공방 부분 공급 ${st.lastQuarter.partialWorkshopPU||0} PU · 실제 미충족 ${st.aiDiagnostics?.[n.id]?.unmetPU??'—'} PU (${st.aiDiagnostics?.[n.id]?.workshopDemand??'—'}공방) · AI ${st.aiDiagnostics?.[n.id]?.decision||'미평가'}`}),
 make('p',{class:'muted-line',text:`건설 슬롯 사용 없음 · 연결소당 송력선 4개 · 직접 경로 최대 8타일 · 용량 100 PU/분기 · 타일당 3% 손실`}));
 for(const s of stations){const site=w.settlements.find(x=>x.id===s.settlementId);
  const item=make('div',{class:'muted-line',text:`${site?.name||s.settlementId}: ${s.status} · HP ${s.hp}/100 ${i2StationOnline(w,s)?'· 사용 중':'· 연결 불가'}`});area.append(item);
  if(n.controller==='PLAYER'&&s.hp<100&&s.status==='ACTIVE'&&!s.repair){const b=make('button',{class:'jump-button',text:'수리',type:'button'});b.disabled=!i2BuildLegal(w,n.id,'REPAIR',{type:'STATION',id:s.id});b.addEventListener('click',()=>{const r=i2Build(w,n.id,'REPAIR',{type:'STATION',id:s.id});showToast(r.ok?'동력 연결소 수리 착수':r.reason);renderNationOverview();});area.append(b);}
 }
 for(const l of lines){const a=w.settlements.find(x=>x.id===l.from),b=w.settlements.find(x=>x.id===l.to);
  area.append(make('div',{class:'muted-line',text:`송력선 #${l.id} ${a?.name||l.from} ↔ ${b?.name||l.to} · ${l.path.length-1}타일 · ${l.status} · HP ${l.hp}/100 · ${i2LineOnline(w,l)?'연결':'차단'}`}));
  if(n.controller==='PLAYER'&&l.status==='ACTIVE'&&l.hp<100&&!l.repair){const btn=make('button',{class:'jump-button',text:'송력선 수리',type:'button'});btn.disabled=!i2BuildLegal(w,n.id,'REPAIR',{type:'LINE',id:l.id});btn.addEventListener('click',()=>{const r=i2Build(w,n.id,'REPAIR',{type:'LINE',id:l.id});showToast(r.ok?'송력선 수리 착수':r.reason);renderNationOverview();});area.append(btn);}
 }
 if(n.controller==='PLAYER'&&n.active&&hasTech(w,n.id,'power_transmission')){
  for(const s of w.settlements.filter(x=>x.ownerId===n.id&&!i2Station(w,x.id))){const btn=make('button',{class:'jump-button',type:'button',text:`${s.name} · 동력 연결소 건설 (650 G)`});btn.disabled=!i2BuildLegal(w,n.id,'STATION',{settlementId:s.id});btn.addEventListener('click',()=>{const r=i2Build(w,n.id,'STATION',{settlementId:s.id});showToast(r.ok?`${s.name} 연결소 건설 착수`:r.reason);renderNationOverview();});area.append(btn);}
  for(let i=0;i<stations.length;i++)for(let j=i+1;j<stations.length;j++){
   const a=stations[i],b=stations[j],args={from:a.settlementId,to:b.settlementId};if(!i2BuildLegal(w,n.id,'LINE',args))continue;
   const path=i1RoadPath(w,n,args.from,args.to),btn=make('button',{class:'jump-button',type:'button',text:`${w.settlements.find(s=>s.id===args.from)?.name} ↔ ${w.settlements.find(s=>s.id===args.to)?.name} 송력선 (${path.length-1}타일)`});
   btn.addEventListener('click',()=>{const r=i2Build(w,n.id,'LINE',args);showToast(r.ok?'송력선 건설 착수':r.reason);renderNationOverview();});area.append(btn);
  }
 }
 const dl=make('button',{class:'jump-button',type:'button',text:'I2 동력망 JSON 내보내기'});
 dl.addEventListener('click',()=>download(`vilob-i2-power-day${w.dayIndex}.json`,JSON.stringify({version:VERSION,dayIndex:w.dayIndex,stations,lines,lastQuarter:st.lastQuarter,history:st.history,recent:st.recent,aiDiagnostics:st.aiDiagnostics||{}},null,2),'application/json'));
 const csv=make('button',{class:'jump-button',type:'button',text:'I2 동력망 분기 CSV 내보내기'});
 csv.addEventListener('click',()=>download(`vilob-i2-power-day${w.dayIndex}.csv`,i2Csv(w,n),'text/csv;charset=utf-8'));
 area.append(dl,csv);return area;
}

// V0.7F1: physical coal, attached mechanical power and explicit labor demand savings.
// Quarterly-only accounting; no RNG, energy storage, nationwide wireless network, or new labor entities.
const F1_POWER_PU=Object.freeze({MECHANICAL:18,WATERWHEEL:32,STEAM:65});
const F1_POWER_INSTALL=Object.freeze({
 MECHANICAL:{apUnits:10,gold:120,resources:{wood:8,iron:4},days:60},
 WATERWHEEL:{apUnits:15,gold:180,resources:{wood:16,iron:6},days:90},
 STEAM:{apUnits:35,gold:1200,resources:{wood:40,stone:24,iron:45},days:120}
});
const F1_POWER_SOURCES=['MECHANICAL','WATERWHEEL','STEAM'];
const F1_HISTORY_WINDOW=48;
// H1A: tile-wide high-grade reserves x16 vs H1 and base yield x4.
// Historical extraction is preserved when upgrading schema 2->3.
// Deep low-grade coal remains indefinitely accessible at >=45% yield.
// No RNG change; multiple pits on one tile share ONE coal seam.
const F2B1_COAL_SEAM_SCHEMA=3, F2B1_DEEP_YIELD_PERMILLE=450;
// Keep the original F2B3 2x adapter constant for legacy schema-1 saves.
const F2B3_SEAM_RESERVE_FACTOR=2;
const H1A_COAL_RESERVE_MULTIPLIER=16, H1A_COAL_YIELD_MULTIPLIER=4;
const F2B2_COAL_BASE_HARD=30*H1A_COAL_YIELD_MULTIPLIER, F2B2_COAL_BASE_OTHER=20*H1A_COAL_YIELD_MULTIPLIER, F2B2_COAL_PIT_OPERATING_GOLD=30;
function f2b1CoalSeamInitial(w,t){
 const hard=t.terrain==='rock'||t.terrain==='mountain';
 const h=hashSeed(String(w.seed)+'|f2b1-coal|'+String(t.id));
 return H1A_COAL_RESERVE_MULTIPLIER*F2B3_SEAM_RESERVE_FACTOR*((hard?6500:4200)+(h%(hard?3501:2301)));
}
function f2b1EnsureCoalSeam(w,t){
 if(!t)return null;
 if(!t.coalSeam){const initial=f2b1CoalSeamInitial(w,t);t.coalSeam={schema:F2B1_COAL_SEAM_SCHEMA,initial,remaining:initial};}
 return t.coalSeam;
}
function f2b1CoalYieldPermille(seam){
 return F2B1_DEEP_YIELD_PERMILLE+Math.floor((1000-F2B1_DEEP_YIELD_PERMILLE)*seam.remaining/seam.initial);
}
function f2b3SeamForecastYears(seam,basePotential){
 if(!seam||basePotential<=0)return null;
 if(seam.remaining===0)return 0;
 // Analytic estimate for dR/dquarter=-P*(0.45+0.55*R/I); ignores integer
 // rounding, intermittent operation and changes of workforce or mine count.
 const ratio=seam.remaining/seam.initial;
 const q=(seam.initial/(.55*basePotential))*Math.log((.45+.55*ratio)/.45);
 return Math.round(q/4*10)/10; // 120 simulation days = 1 year
}
function f2b1CoalSeamSummary(w,nationId){
 const seen=new Set(),sites=[];
 for(const b of w.buildings){
  if(b.typeId!=='coal_pit'||w.tiles[b.tileId]?.ownerId!==nationId||seen.has(b.tileId))continue;
  seen.add(b.tileId);
  const t=w.tiles[b.tileId],d=t.coalSeam;
  if(d){const pits=w.buildings.filter(x=>x.typeId==='coal_pit'&&x.tileId===t.id);
   const activePits=pits.filter(x=>x.status==='ACTIVE'&&!x.disconnected).length;
   const basePotential=activePits*(t.terrain==='rock'||t.terrain==='mountain'?F2B2_COAL_BASE_HARD:F2B2_COAL_BASE_OTHER);
   sites.push({tileId:t.id,initial:d.initial,remaining:d.remaining,yieldPermille:f2b1CoalYieldPermille(d),pitCount:pits.length,activePitCount:activePits,estimatedYears:f2b3SeamForecastYears(d,basePotential)});
  }
 }
 const total=sites.reduce((a,d)=>a+d.initial,0),left=sites.reduce((a,d)=>a+d.remaining,0);
 return {siteCount:sites.length,remainingRich: left,initialRich:total,remainingPct:total?Math.round(left/total*1000)/10:null,deepYieldPct:F2B1_DEEP_YIELD_PERMILLE/10,sites};
}
function f2b1ValidateCoalSeams(w){
 for(const t of w.tiles){
  const s=t.coalSeam;if(!s)continue;
  if(!BUILDINGS.coal_pit.terrains.includes(t.terrain)||s.schema!==F2B1_COAL_SEAM_SCHEMA||!Number.isSafeInteger(s.initial)||s.initial<1||!Number.isSafeInteger(s.remaining)||s.remaining<0||s.remaining>s.initial)return false;
 }
 return w.buildings.every(b=>b.typeId!=='coal_pit'||Boolean(w.tiles[b.tileId]?.coalSeam));
}

let f1QuarterPlan=null,f1QuarterPlanDay=-1,f1ReservedSteamGold=null;
function f1EmptyQuarter(day){return {dayIndex:day,coalProduced:0,coalConsumed:0,coalImported:0,coalExported:0,coalTerritoryIn:0,coalTerritoryOut:0,coalStart:0,coalEnd:0,coalOtherSpent:0,coalPotential:0,coalDepletionLoss:0,powerProduced:0,powerUsed:0,powerUnused:0,laborSaved:0,steamSites:0,steamOperatingGold:0,coalSites:0};}
function f1NewIndustry(){return {schema:1,coalMinedEver:false,steamOperatedEver:false,lastQuarter:f1EmptyQuarter(0),history:[]};}
function f1EnsureIndustry(n){return n.f1Industry||(n.f1Industry=f1NewIndustry());}
function f1Devices(b){return b.powerDevices||{mechanical:false,waterwheel:false,steam:false};}
function f1PowerInstallDays(source){return F1_POWER_INSTALL[source]?.days||0;}
function f1PowerInstallLegal(w,nationId,action){
 const b=w.buildings.find(x=>x.id===action.buildingId),s=b&&w.settlements.find(x=>x.id===b.settlementId),t=b&&w.tiles[b.tileId],source=action.source;
 if(!F1_POWER_INSTALL[source]||!b||!['workshop','factory'].includes(b.typeId)||b.status!=='ACTIVE'||b.disconnected||b.powerProject||s?.ownerId!==nationId||t?.ownerId!==nationId||t.occupiedBy!==null||w.occupations.some(o=>o.tileId===t.id))return false;
 if(f1Devices(b)[source.toLowerCase()])return false;
 if(source==='STEAM')return (b.typeId==='factory'||b.level>=3)&&hasTech(w,nationId,'steam_engineering');
 if(!hasTech(w,nationId,'basic_mechanical_power'))return false;
 return source==='MECHANICAL'||riverAdjacentTileInfo(w,b.tileId).riverbank;
}
function f1PowerInstallPrice(w,nationId,action){
 if(!f1PowerInstallLegal(w,nationId,action))return null;
 const price=F1_POWER_INSTALL[action.source],b=w.buildings.find(x=>x.id===action.buildingId);return {apUnits:b?.typeId==='factory'?Math.min(price.apUnits,20):price.apUnits,gold:price.gold,knowledge:0,resources:{...price.resources}};
}
function f1AdvancePowerProjects(w){
 for(const b of w.buildings){
  const pr=b.powerProject;if(!pr||pr.completeDay>w.dayIndex||b.status!=='ACTIVE'||b.disconnected)continue;
  const t=w.tiles[b.tileId],s=w.settlements.find(x=>x.id===b.settlementId);
  if(t?.ownerId!==s?.ownerId||t.occupiedBy!==null)continue;
  b.powerDevices??={mechanical:false,waterwheel:false,steam:false};b.powerDevices[pr.source.toLowerCase()]=true;
  delete b.powerProject;w.events.push({dayIndex:w.dayIndex,text:`${s.name}: ${b.id}번 공방 ${pr.source} 동력원 설치 완료`,kind:'building'});
  w.changeSeq++;
 }
 if(w.events.length>180)w.events.splice(0,w.events.length-180);
}
function f1MigrateWorld(w,native=false){
 for(const n of w.nations){n.resources.coal??=0;if(!native)n.f1Industry=f1NewIndustry();else f1EnsureIndustry(n);}
 // Convert all previously established seams, including those with no current pit.
  // Schema 1 -> 2: preserve the historical F2B3 doubling (no repeated migration).
  // Schema 2 -> 3: retroactively unlock 15x additional high-grade reserves.
  // Already extracted coal (old initial - old remaining) stays extracted.
  // Newly generated schema-3 seams are never enlarged a second time.
 for(const t of w.tiles){
  const seam=t.coalSeam;
  if(!seam||!Number.isSafeInteger(seam.initial)||seam.initial<1||!Number.isSafeInteger(seam.remaining)||seam.remaining<0||seam.remaining>seam.initial)continue;
  if(seam.schema===1){
   seam.initial*=F2B3_SEAM_RESERVE_FACTOR;seam.remaining*=F2B3_SEAM_RESERVE_FACTOR;
   seam.schema=2;
  }
  if(seam.schema===2){
   const extra=seam.initial*(H1A_COAL_RESERVE_MULTIPLIER-1);
   seam.initial+=extra;seam.remaining+=extra;
   seam.schema=F2B1_COAL_SEAM_SCHEMA;
  }
 }
 for(const b of w.buildings)if(b.typeId==='coal_pit')f2b1EnsureCoalSeam(w,w.tiles[b.tileId]); // no inferred historical mining
 if(!native){
  for(const b of w.buildings){if(b.typeId!=='workshop')continue;
   const t=w.tiles[b.tileId],owner=t?.ownerId;
   const has=owner!==null&&hasTech(w,owner,'basic_mechanical_power');
   const water=has&&riverAdjacentTileInfo(w,b.tileId).riverbank;
   b.powerDevices={mechanical:has&&!water,waterwheel:water,steam:false};
   if(has)b.powerMigration='LEGACY_IMPLICIT_POWER';
  }
  w.market.coalIntroducedDay=Math.floor(w.dayIndex/30)*30+30;
  w.market.prices.coal??=e3eBaseMilli('coal');
 }
}
function f1PowerBase(w,b,n){
 const dev=f1Devices(b),has=hasTech(w,n.id,'basic_mechanical_power'),upgraded=hasTech(w,n.id,'power_transmission');
 if(!has)return {source:'NONE',pu:0};
 const mechanical=dev.mechanical?{source:'MECHANICAL',pu:upgraded?18:12}:{source:'NONE',pu:0};
 const water=dev.waterwheel&&riverAdjacentTileInfo(w,b.tileId).riverbank?{source:'WATERWHEEL',pu:upgraded?32:20}:null;
 return water&&water.pu>mechanical.pu?water:mechanical;
}
function f1ChoosePower(w,b,n,local=null,riverbankHint=null){
 const planned=f1QuarterPlanDay===w.dayIndex?f1QuarterPlan?.get(b.id):null;
 if(planned)return planned;
 return f1ChoosePowerUnplanned(w,b,n,local,riverbankHint);
}
function f1ChoosePowerUnplanned(w,b,n,local=null,riverbankHint=null){
 const fallback=f1PowerBase(w,b,n),dev=f1Devices(b);
 if(!dev.steam||b.level<3||!hasTech(w,n.id,'steam_engineering')||n.resources.coal<3-techBonus(w,n.id,'industrialSteamCoalSaving')||n.gold<12)return fallback;
 // Conservative revenue test: never consume fuel just to lower the national treasury.
 const multiplier=(local?.multiplier||1)*(1+techBonus(w,n.id,'workshopGold'))*(b.workshopMode==='precision'?1.20:1);
 const extra=Math.floor(72*3*multiplier*1.65)-Math.floor(72*3*multiplier*(1+fallback.pu/100));
 const coalValue=(w.market?.prices?.coal||6000)/1000;
 if(extra<=12+(3-techBonus(w,n.id,'industrialSteamCoalSaving'))*coalValue)return fallback;
 return {source:'STEAM',pu:65};
}
function f1LaborSavings(w,b,n,raw){
 const selected=f1ChoosePower(w,b,n,{multiplier:1});
 if(selected.source==='STEAM')return Math.max(0,raw-(Math.ceil(raw*.75)+4));
 if(selected.source==='WATERWHEEL')return Math.max(0,raw-(Math.ceil(raw*.9)+2));
 return 0;
}
function f1StartEconomyQuarter(w){
 for(const n of w.nations){if(!n.active)continue;const industry=f1EnsureIndustry(n);industry.lastQuarter=f1EmptyQuarter(w.dayIndex);industry.lastQuarter.coalStart=n.resources.coal||0;}
 // Reserve an exact per-site power choice BEFORE calculating settlement labor demand.
 // The source may not consume newly mined or imported coal in this same quarter.
 f1QuarterPlan=new Map();f1ReservedSteamGold=new Map();f1QuarterPlanDay=w.dayIndex;
 const stock=new Map(w.nations.filter(n=>n.active).map(n=>[n.id,{coal:n.resources.coal,gold:n.gold}]));
 const occupied=new Set((w.occupations||[]).map(x=>x.tileId));
 for(const b of w.buildings.filter(b=>b.typeId==='workshop'&&b.status==='ACTIVE'&&!b.disconnected).sort((a,b)=>a.id-b.id)){
  const tile=w.tiles[b.tileId],s=w.settlements.find(x=>x.id===b.settlementId),n=s?.ownerId===tile?.ownerId?w.nations[s.ownerId]:null;
  if(!n?.active||!stock.has(n.id))continue;
  const shadow=stock.get(n.id),candidateN={...n,gold:shadow.gold,resources:{...n.resources,coal:shadow.coal}};
  const candidate=f1ChoosePowerUnplanned(w,b,candidateN,{multiplier:1});
  if(candidate.source==='STEAM'&&(tile.occupiedBy!==null||occupied.has(tile.id)||!s.population))continue;
  f1QuarterPlan.set(b.id,candidate);
  if(candidate.source==='STEAM'){shadow.coal-=3-techBonus(w,n.id,'industrialSteamCoalSaving');shadow.gold-=12;f1ReservedSteamGold.set(n.id,(f1ReservedSteamGold.get(n.id)||0)+12);}
 }
}
function f1RunCoalQuarter(w,n,q){
 if(!hasTech(w,n.id,'coal_extraction'))return;
 const r=f1EnsureIndustry(n).lastQuarter;
 const active=w.buildings.filter(b=>b.typeId==='coal_pit'&&b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===n.id).sort((a,b)=>a.id-b.id);
 const occupied=new Set((w.occupations||[]).map(o=>o.tileId));
 for(const b of active){const t=w.tiles[b.tileId],s=w.settlements.find(x=>x.id===b.settlementId);
  const local=q.regionalEconomy.towns.get(b.settlementId);
  if(!s||s.ownerId!==n.id||s.population<1||t.occupiedBy!==null||occupied.has(t.id)||!local?.workers||(!local.roadNetwork&&t.roadLevel===0&&w.tiles[s.coreTileId]?.roadLevel===0)||n.gold<F2B2_COAL_PIT_OPERATING_GOLD+(f1ReservedSteamGold?.get(n.id)||0))continue;
  const base=['rock','mountain'].includes(t.terrain)?F2B2_COAL_BASE_HARD:F2B2_COAL_BASE_OTHER;
  const potential=Math.max(0,Math.floor(base*local.multiplier));
  if(potential<1)continue;
  const seam=f2b1EnsureCoalSeam(w,t),yieldPermille=f2b1CoalYieldPermille(seam);
  // Flat 45% deep-seam yield is independent of the finite high-grade lens;
  // at least 1 unit survives whenever the mine could originally produce.
  const rawAmount=Math.max(1,Math.ceil(potential*F2B1_DEEP_YIELD_PERMILLE/1000),Math.round(potential*yieldPermille/1000));
  const amount=Math.max(1,Math.floor(rawAmount*(1+(n.nationalProjects?.levels?.mining||0)*.05)));
  if(n.resources.coal+amount>1000000)continue;
  n.gold-=F2B2_COAL_PIT_OPERATING_GOLD;n.resources.coal+=amount;i1Credit(w,n,b,'coal',amount);b.lastCoalMinedDay=w.dayIndex;
  seam.remaining=Math.max(0,seam.remaining-Math.min(seam.remaining,amount));
  const actualPotential=Math.max(amount,Math.floor(potential*(1+(n.nationalProjects?.levels?.mining||0)*.05)));
  r.coalProduced+=amount;r.coalPotential+=actualPotential;r.coalDepletionLoss+=actualPotential-amount;
  r.coalSites++;f1EnsureIndustry(n).coalMinedEver=true;
 }
}
function f1RecordWorkshopPower(w,n,b,choice,local){
 const q=f1EnsureIndustry(n).lastQuarter;
 const delivered=Math.min(65,choice.pu);
 q.powerProduced+=choice.pu;q.powerUsed+=delivered;q.powerUnused+=choice.pu-delivered;
 q.laborSaved+=(choice.source==='STEAM'?Math.max(0,22*b.level-(Math.ceil(22*b.level*.75)+4)):
  choice.source==='WATERWHEEL'?Math.max(0,22*b.level-(Math.ceil(22*b.level*.9)+2)):0);
 if(choice.source==='STEAM'){q.coalConsumed+=3-techBonus(w,n.id,'industrialSteamCoalSaving');q.steamSites++;q.steamOperatingGold+=12;f1EnsureIndustry(n).steamOperatedEver=true;}
 b.lastPower={dayIndex:w.dayIndex,source:choice.source,supplied:choice.pu,used:delivered,unused:choice.pu-delivered,demand:65};
}
// V0.8E F1 coal double-entry alongside F2B steel/parts. These are real
// territorial transfers, not imports/exports through the global market.
function f1TrackI1TerritoryQuarter(w,from,to,good,amount){
 if(good!=='coal'||!amount)return;
 for(const [n,k] of [[from,'coalTerritoryOut'],[to,'coalTerritoryIn']]){
  const q=f1EnsureIndustry(n).lastQuarter;
  if(n.active&&q?.dayIndex===w.dayIndex){
   if(!Number.isSafeInteger((q[k]||0)+amount))throw Error('V0.8E F1 석탄 영토 이관 정수 오버플로');
   q[k]=(q[k]||0)+amount;
  }
 }
}
function f1FinishEconomyQuarter(w){
 for(const n of w.nations){if(!n.active)continue;
  const i=f1EnsureIndustry(n),r=i.lastQuarter,m=(w.market.lastNation||[]).find(x=>x.id===n.id);
  r.coalImported=m?.bought?.coal||0;r.coalExported=m?.sold?.coal||0;r.coalEnd=n.resources.coal;
  r.coalOtherSpent=r.coalStart+r.coalProduced+r.coalImported+(r.coalTerritoryIn||0)-r.coalExported-(r.coalTerritoryOut||0)-r.coalConsumed-r.coalEnd;
  i.history.push({...r});if(i.history.length>F1_HISTORY_WINDOW)i.history.shift();
 }
 f1QuarterPlan=null;f1QuarterPlanDay=-1;f1ReservedSteamGold=null;
}
function f1PromoteIndustrial(w){
 for(const n of w.nations){if(!n.active||n.civilization.era!=='early_modern'||n.civilization.stage!==4||n.civilization.stageReachedDay===w.dayIndex)continue;
  const f=f1EnsureIndustry(n);
  const normal=hasTech(w,n.id,'coal_extraction')&&hasTech(w,n.id,'steam_engineering')&&f.coalMinedEver&&f.steamOperatedEver;
  const alternative=!normal&&f2a1UseKnowledgeAlternative(w,n,'산업 근대 I');
  if(!normal&&!alternative)continue;
  n.civilization={era:'industrial_modern',eraReachedDay:w.dayIndex,stage:1,stageReachedDay:w.dayIndex};
  const text=alternative?`${n.name}: Knowledge 대체 요건으로 산업 근대 I에 진입했습니다.`:
    `${n.name}: 자국 석탄 채굴과 증기 공방 실증으로 산업 근대 I에 진입했습니다.`;
  w.events.push({dayIndex:w.dayIndex,text,kind:'era'});recordHistoricalEvent(w,'era',text,[n.id],`era:${n.id}:industrial_modern`);
  if(w.events.length>180)w.events.splice(0,w.events.length-180);w.changeSeq++;
 }
}
// F2A3: coal/steam startup is a one-time infrastructure investment, not a
// license to ignore a persistent food collapse. Evidence is the LAST four
// actual quarterly food records, not estimates or fabricated backfill.
function f2a3IndustrialFoodGate(w,n,firstInfrastructure){
 const gate=f2c2BuildFoodGate(w,n);
 if(gate.eligible)return 'SUFFICIENCY_120D';
 if(gate.severe||!firstInfrastructure||gate.sufficiency<.90||
    n.gold<Math.max(4000,3*((n.lastQuarter?.upkeep||0)+(n.lastQuarter?.civil?.total||0))))return 'BLOCKED';
 // Existing F2A3 first-coal/first-steam exception: four real 90%-production
 // quarters are still required, so new low-sufficiency states are not invented.
 const four=(n.economicRecovery?.history||[]).slice(-4);
 if(four.length!==4||four.some((r,i)=>!Number.isSafeInteger(r.dayIndex)||
   i>0&&r.dayIndex-four[i-1].dayIndex!==30)||w.dayIndex-four[3].dayIndex>30||w.dayIndex<four[3].dayIndex)return 'BLOCKED';
 if(!four.every(r=>r.goods?.food&&Number.isFinite(r.goods.food.produced)&&
   Number.isFinite(r.goods.food.consumed)&&(r.goods.food.consumed===0||r.goods.food.produced>=r.goods.food.consumed*.90)))return 'BLOCKED';
 return 'FIRST_INDUSTRY_90PCT_4Q';
}
function f2a3CoalRetrofitSafe(w,n,b,owned){
 if(!['quarry','mine','academy','barracks'].includes(b.typeId))return false;
 if(b.typeId==='academy'&&owned.filter(x=>x.typeId==='academy').length<=1)return false;
 // No wartime conversions; never remove the last usable training facility.
 if(b.typeId==='barracks'&&(militaryAtWar(w,n.id)||v04e1ReservedBarracks(w,n.id).length<=1))return false;
 return true;
}
function f1IndustryAIQuarter(w){
 // Repair is evaluated quarterly and requires neither a 2Q food reserve nor
 // a new factory. At most one paid repair per AI country per quarter.
 f2a3FactoryRepairQuarter(w);
 f2FactoryAIQuarter(w);
 f2bIndustrialAIQuarter(w);
 f2cArsenalAIQuarter(w);
 // Each nation's new industrial investment attempts at most one action per year.
 if(w.dayIndex%120!==0)return;
 for(const n of w.nations){if(!n.active||n.controller!=='AI'||n.civilization?.era!=='early_modern'&&n.civilization?.era!=='industrial_modern')continue;
  if(n.civilization.era==='early_modern'&&n.civilization.stage<4)continue;
  if(n.gold<350)continue;
  const owned=w.buildings.filter(b=>b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===n.id);
  if(hasTech(w,n.id,'coal_extraction')){
   const pits=owned.filter(b=>b.typeId==='coal_pit');
   const firstCoal=pits.length===0&&!f1EnsureIndustry(n).coalMinedEver;
   if(pits.length<Math.max(1,Math.min(3,Math.ceil(owned.filter(b=>b.typeId==='workshop').length/2)))&&
      f2a3IndustrialFoodGate(w,n,firstCoal)!=='BLOCKED'){
    let action=null;
    for(const s of w.settlements.filter(s=>s.ownerId===n.id)){
     for(const tid of s.tileIds){const t=w.tiles[tid];if(!BUILDINGS.coal_pit.terrains.includes(t.terrain))continue;
      const a={type:'BUILD_FACILITY',buildingType:'coal_pit',settlementId:s.id,targetTileId:tid};
      if(canExecuteNationAction(w,n.id,a)){action=a;break;}
     }if(action)break;
    }
    if(!action){const candidates=owned.filter(b=>f2a3CoalRetrofitSafe(w,n,b,owned))
      .sort((a,b)=>['quarry','mine','academy','barracks'].indexOf(a.typeId)-['quarry','mine','academy','barracks'].indexOf(b.typeId)||a.id-b.id);
     for(const b of candidates){
      const a={type:'REDEVELOP_FACILITY',buildingType:'coal_pit',buildingId:b.id};if(canExecuteNationAction(w,n.id,a)){action=a;break;}
    }}
    if(action){executeNationAction(w,n.id,action);continue;}
   }
  }
  // Install a real device. Existing converted workshops already possess their historical equipment.
  for(const b of owned.filter(b=>b.typeId==='workshop').sort((a,b)=>b.level-a.level||a.id-b.id)){
   const devices=f1Devices(b);let type=null;
   if(b.level>=3&&hasTech(w,n.id,'steam_engineering')&&!devices.steam&&n.resources.coal>=6&&n.gold>=1800&&
      f2a3IndustrialFoodGate(w,n,!f1EnsureIndustry(n).steamOperatedEver)!=='BLOCKED')type='STEAM';
   else if(hasTech(w,n.id,'basic_mechanical_power')&&!devices.mechanical&&!devices.waterwheel&&
      f2a3IndustrialFoodGate(w,n,false)!=='BLOCKED'){type=riverAdjacentTileInfo(w,b.tileId).riverbank?'WATERWHEEL':'MECHANICAL';}
   if(!type)continue;
   const a={type:'INSTALL_WORKSHOP_POWER',buildingId:b.id,source:type};if(canExecuteNationAction(w,n.id,a)){executeNationAction(w,n.id,a);break;}
  }
 }
}
function f1ValidWorkshopPower(w,b){
 const d=b.powerDevices;
 if(!d||typeof d!=='object'||['mechanical','waterwheel','steam'].some(x=>typeof d[x]!=='boolean'))return false;
 if(b.powerProject&&(!F1_POWER_INSTALL[b.powerProject.source]||!Number.isSafeInteger(b.powerProject.completeDay)||b.powerProject.completeDay>w.dayIndex+1200||d[b.powerProject.source.toLowerCase()]))return false;
 if(b.lastPower&&(b.lastPower.dayIndex>w.dayIndex||b.lastPower.dayIndex%30!==0||!['NONE',...F1_POWER_SOURCES].includes(b.lastPower.source)||!Number.isSafeInteger(b.lastPower.supplied)||b.lastPower.used>b.lastPower.supplied||b.lastPower.supplied>b.lastPower.demand||b.lastPower.used+b.lastPower.unused!==b.lastPower.supplied))return false;
 return true;
}
function f1ValidateWorld(w){
 for(const n of w.nations){const r=n.f1Industry;if(!r||r.schema!==1||!Array.isArray(r.history)||r.history.length>F1_HISTORY_WINDOW||typeof r.coalMinedEver!=='boolean'||typeof r.steamOperatedEver!=='boolean'||!r.lastQuarter)return false;
  for(const q of [...r.history,r.lastQuarter]){
   if(!Number.isSafeInteger(q.dayIndex)||q.dayIndex>w.dayIndex||q.dayIndex%30!==0)return false;
   for(const k of ['coalProduced','coalConsumed','coalImported','coalExported','coalStart','coalEnd','coalOtherSpent','powerProduced','powerUsed','powerUnused','laborSaved','steamSites','steamOperatingGold','coalSites'])if(!Number.isSafeInteger(q[k])||q[k]<0)return false;
   // F2C2C1: F2C2C industrial steam efficiency reduces workshop coal per
   // operating site from 3 to 2. Historic quarters must retain their original
   // audited figures; never compare all history against today's tech state.
   // Each fully completed quarter uses one fixed steam rate (2 or 3).
   const validSteamCoal=q.coalConsumed===q.steamSites*3||q.coalConsumed===q.steamSites*2;
   if(['coalTerritoryIn','coalTerritoryOut'].some(k=>q[k]!==undefined&&(!Number.isSafeInteger(q[k])||q[k]<0))||['coalPotential','coalDepletionLoss'].some(k=>q[k]!==undefined&&(!Number.isSafeInteger(q[k])||q[k]<0))||q.coalPotential!==undefined&&q.coalPotential!==q.coalProduced+(q.coalDepletionLoss||0)||q.powerProduced!==q.powerUsed+q.powerUnused||!validSteamCoal||q.steamOperatingGold!==q.steamSites*12||q.coalStart+q.coalProduced+q.coalImported+(q.coalTerritoryIn||0)!==q.coalConsumed+q.coalExported+(q.coalTerritoryOut||0)+q.coalEnd+q.coalOtherSpent)return false;
  }
 }
 if(w.buildings.some(b=>b.typeId==='coal_pit'&&b.level!==1)||!f2b1ValidateCoalSeams(w))return false;
 return true;
}
function f1IndustrySummary(w){return {version:VERSION,dayIndex:w.dayIndex,nations:w.nations.map(n=>({id:n.id,name:n.name,era:civilizationLabel(n),coal:n.resources.coal,coalSeams:f2b1CoalSeamSummary(w,n.id),coalMinedEver:f1EnsureIndustry(n).coalMinedEver,steamOperatedEver:f1EnsureIndustry(n).steamOperatedEver,lastQuarter:f1EnsureIndustry(n).lastQuarter,workshops:w.buildings.filter(b=>b.typeId==='workshop'&&w.tiles[b.tileId]?.ownerId===n.id).map(b=>({id:b.id,powerDevices:b.powerDevices,project:b.powerProject||null,lastPower:b.lastPower||null}))}))};}
function f1IndustryCsv(w){const keys=['dayIndex','coalStart','coalProduced','coalPotential','coalDepletionLoss','coalImported','coalExported','coalTerritoryIn','coalTerritoryOut','coalConsumed','coalEnd','coalOtherSpent','powerProduced','powerUsed','powerUnused','laborSaved','steamSites','steamOperatingGold','coalSites'];const rows=[['nationId','nation',...keys]];for(const n of w.nations)for(const h of f1EnsureIndustry(n).history)rows.push([n.id,n.name,...keys.map(k=>h[k]??(k==='coalPotential'?(h.coalProduced||0):0))]);return '\ufeff'+rows.map(a=>a.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');}
// --- V0.7F2B: resource-conserving steelworks, steam pumps, industrial materials. ---
// State is bounded to 48 quarterly entries. Industrial sites remain ordinary building
// objects; industrialSlot only bypasses a single general tile slot (at most one/town).
const F2B_HISTORY_LIMIT=48, F2B_MAX_STOCK=1000000;
function f2bEmptyQuarter(day,parts=0,steel=0){return {dayIndex:day,
 machine_parts:{start:parts,produced:0,imports:0,exports:0,used:0,construction:0,transfersIn:0,transfersOut:0,otherSpent:0,end:parts},
 steel:{start:steel,produced:0,imports:0,exports:0,used:0,construction:0,transfersIn:0,transfersOut:0,otherSpent:0,end:steel},
 steelworksSites:0,steelworksOperated:0,pumpSites:0,pumpsOperated:0,pumpExtraFood:0,
 ironUsed:0,coalUsed:0,goldUsed:0};}
function f2bNewIndustry(day=0,parts=0,steel=0){return {schema:1,introducedDay:day,
 lastQuarter:f2bEmptyQuarter(day,parts,steel),history:[],pendingConstruction:{machine_parts:0,steel:0},pendingTransfers:{machine_parts:0,steel:0},
 plan:null,lastDecision:{dayIndex:day,reason:'NOT_EVALUATED'}};}
function f2bEnsure(n,day=0){return n.f2bIndustry||(n.f2bIndustry=f2bNewIndustry(day,n.resources.machine_parts||0,n.resources.steel||0));}
function f2bMigrateWorld(w){
 for(const n of w.nations){n.resources.steel??=0;f2bEnsure(n,w.dayIndex);}
 for(const b of w.buildings)if(b.typeId==='steelworks'||b.typeId==='steam_pump'){b.f2bRuns??=0;b.f2bOperatingDay??=null;}
}
function f2bTrackTransfer(from,to,good,amount){
 if(!['steel','machine_parts'].includes(good)||amount<=0)return;
 f2bEnsure(from).pendingTransfers[good]-=amount;f2bEnsure(to).pendingTransfers[good]+=amount;
}
// V0.8E: i1ClaimSites is executed AFTER f2bOpenQuarter.  Unlike transfers
// between quarters, territorial physical-stock movement must be recognized on
// the *already opened* F2B quarter, never queued for the next one.  This is
// real double-entry bookkeeping, not a compensating or masked residual.
function f2bTrackI1TerritoryQuarter(w,from,to,good,amount){
 if((good!=='machine_parts'&&good!=='steel')||amount<=0||from.id===to.id)return;
 if(!Number.isSafeInteger(amount))throw Error('V0.8E 비정수 산업 재고 영토 이관');
 const source=f2bEnsure(from,w.dayIndex),target=f2bEnsure(to,w.dayIndex);
 for(const [nation,st,key,sign] of [[from,source,'transfersOut',-1],[to,target,'transfersIn',1]]){
  // An inactive country does not open an F2B quarter. Defer its signed transfer
  // until its first eligible quarter, as with other inter-quarter transfers.
  if(nation.active&&st.lastQuarter?.dayIndex===w.dayIndex){
   const row=st.lastQuarter[good];
   if(!Number.isSafeInteger(row[key]+amount))throw Error('V0.8E 장부 정수 오버플로');
   row[key]+=amount;
  }else{
   if(!Number.isSafeInteger(st.pendingTransfers[good]+sign*amount))throw Error('V0.8E 이월 이전 정수 오버플로');
   st.pendingTransfers[good]+=sign*amount;
  }
 }
}
function f2bTrackConstruction(n,price){
 const state=f2bEnsure(n),materials=price?.resources||{};
 for(const g of ['machine_parts','steel'])state.pendingConstruction[g]+=(materials[g]||0);
}
function f2bOpenQuarter(w){
 for(const n of w.nations){if(!n.active)continue;
  const st=f2bEnsure(n,w.dayIndex),last=st.lastQuarter,q=f2bEmptyQuarter(w.dayIndex);
  for(const g of ['machine_parts','steel']){
   q[g].start=last?.[g]?.end??(n.resources[g]||0);
   q[g].construction=st.pendingConstruction[g]||0;
   const net=st.pendingTransfers?.[g]||0;q[g].transfersIn=Math.max(0,net);q[g].transfersOut=Math.max(0,-net);
   st.pendingConstruction[g]=0;st.pendingTransfers[g]=0;
  }
  st.lastQuarter=q;
 }
}
function f2bServiceLegal(w,b,n,minPopulation=1){
 const tile=w.tiles[b.tileId],s=w.settlements.find(x=>x.id===b.settlementId);
 if(!tile||!s||!n?.active||s.ownerId!==n.id||tile.ownerId!==n.id||tile.occupiedBy!==null||
  w.occupations.some(o=>o.tileId===tile.id)||b.disconnected||b.status!=='ACTIVE'||s.population<minPopulation)return null;
 if(!f2bCanBuild(w,n.id,b.typeId))return null;
 if(tile.roadLevel===0&&w.tiles[s.coreTileId]?.roadLevel===0)return null;
 return s;
}
function f2bRunPumpsBeforeProduction(w){
 const farms=new Map();for(const b of w.buildings)if(b.typeId==='farm'&&b.status==='ACTIVE'&&!b.disconnected){farms.set(b.settlementId,(farms.get(b.settlementId)||0)+1);}
 for(const b of w.buildings.filter(b=>b.typeId==='steam_pump').sort((a,b)=>a.id-b.id)){
  const n=w.nations[w.tiles[b.tileId]?.ownerId],s=f2bServiceLegal(w,b,n,27);
  if(!n?.active)continue;
  const q=f2bEnsure(n).lastQuarter;q.pumpSites++;
  if(!s||!(farms.get(s.id)>0)||n.resources.coal<2||n.resources.machine_parts<1||n.gold<30)continue;
  const runs=(b.f2bRuns||0)+1,steelNeeded=runs%8===0?1:0;
  if(n.resources.steel<steelNeeded||!i1Can(w,n,b,{coal:2,machine_parts:1,steel:steelNeeded}))continue;
  n.resources.coal-=2;n.resources.machine_parts-=1;n.resources.steel-=steelNeeded;n.gold-=30;
  i1Debit(w,n,b,{coal:2,machine_parts:1,steel:steelNeeded});
  q.coalUsed+=2;q.goldUsed+=30;q.machine_parts.used++;q.steel.used+=steelNeeded;q.pumpsOperated++;
  b.f2bRuns=runs;b.f2bOperatingDay=w.dayIndex;
 }
}
// V0.8J: level-specific physical steel production; Lv.1 identical to V0.8I.
const V08J_STEEL_LEVELS=Object.freeze({1:{output:6,iron:12,coal:5,gold:55,labor:35,maintEvery:4},2:{output:10,iron:18,coal:8,gold:85,labor:55,maintEvery:3}});
function v08jSteelSpec(level){return V08J_STEEL_LEVELS[level]||V08J_STEEL_LEVELS[1];}
function f2bRunSteelworksQuarter(w,projections){
 for(const b of w.buildings.filter(b=>b.typeId==='steelworks').sort((a,b)=>a.id-b.id)){
  const n=w.nations[w.tiles[b.tileId]?.ownerId],spec=v08jSteelSpec(b.level),s=f2bServiceLegal(w,b,n,spec.labor);
  if(!n?.active)continue;
  const q=f2bEnsure(n).lastQuarter;q.steelworksSites++;
  if(!s||!f2c2cCanProduce(n,'steel'))continue;
  const local=projections.get(n.id)?.regionalEconomy?.towns?.get(s.id);
  const steelOutput=spec.output+techBonus(w,n.id,'steelworksYield');
  if(!local||local.workers<spec.labor||n.resources.iron<spec.iron||n.resources.coal<spec.coal||n.gold<spec.gold||n.resources.steel+steelOutput>F2B_MAX_STOCK)continue;
  const runs=(b.f2bRuns||0)+1,maintenance=runs%spec.maintEvery===0?1:0;
  const bill={iron:spec.iron,coal:spec.coal,machine_parts:maintenance};
  if(n.resources.machine_parts<maintenance||!i1Can(w,n,b,bill))continue;
  n.resources.iron-=spec.iron;n.resources.coal-=spec.coal;n.gold-=spec.gold;n.resources.machine_parts-=maintenance;
  i1Debit(w,n,b,bill);
  n.resources.steel+=steelOutput;i1Credit(w,n,b,'steel',steelOutput);q.steel.produced+=steelOutput;q.machine_parts.used+=maintenance;
  q.ironUsed+=spec.iron;q.coalUsed+=spec.coal;q.goldUsed+=spec.gold;q.steelworksOperated++;
  b.f2bRuns=runs;b.f2bOperatingDay=w.dayIndex;
 }
}
function f2bCloseQuarter(w){
 const reports=new Map((w.market?.lastNation||[]).map(r=>[r.id,r]));
 for(const n of w.nations){if(!n.active)continue;
  const st=f2bEnsure(n),q=st.lastQuarter,r=reports.get(n.id)||{};
  for(const g of ['machine_parts','steel']){
   const row=q[g];row.imports=r.bought?.[g]||0;row.exports=r.sold?.[g]||0;
   if(g==='machine_parts'){
    row.produced=f2Ensure(n).lastQuarter.produced||0;
    row.used+=f2Ensure(n).lastQuarter.used||0;
   }
   row.end=n.resources[g]||0;
   row.otherSpent=row.start+row.produced+row.imports+row.transfersIn-row.exports-row.used-row.construction-row.transfersOut-row.end;
  }
  st.history.push(structuredClone(q));if(st.history.length>F2B_HISTORY_LIMIT)st.history.shift();
 }
}
function f2bMarketTarget(w,n,good){
 const st=f2bEnsure(n,w.dayIndex),plan=st.plan;
 const owned=w.buildings.filter(b=>w.tiles[b.tileId]?.ownerId===n.id&&b.status==='ACTIVE'&&!b.disconnected);
 const steel=owned.filter(b=>b.typeId==='steelworks').length,pumps=owned.filter(b=>b.typeId==='steam_pump').length,
  factories=owned.filter(b=>b.typeId==='factory').length;
 const planned=plan&&plan.targetTileId!=null&&w.tiles[plan.targetTileId]?.ownerId===n.id?plan:null;
 if(good==='machine_parts'){
  if(!planned&&!steel&&!pumps&&!factories)return 0;
  return Math.max(0,Math.min(500,(planned?(planned.buildingType==='steelworks'?40:24):0)+Math.ceil(steel/4)+pumps*4+Math.ceil(factories/4)+4));
 }
 if(good==='steel')return !pumps&&planned?.buildingType!=='steam_pump'?0:
  Math.max(0,Math.min(500,(planned?.buildingType==='steam_pump'?24:0)+Math.ceil(pumps/8)+1));
 return 0;
}
function f2bCandidateSite(w,n,type){
 const settlements=w.settlements.filter(s=>s.ownerId===n.id&&s.population>40).sort((a,b)=>{
  const score=s=>(type==='steam_pump'?w.buildings.filter(x=>x.typeId==='farm'&&x.settlementId===s.id&&x.status==='ACTIVE').length*500:0)+s.population;
  return score(b)-score(a)||a.id-b.id;});
 for(const s of settlements){
  if(type==='steam_pump'&&w.buildings.some(b=>b.settlementId===s.id&&(b.typeId==='steam_pump'||b.redevelopTo==='steam_pump')))continue;
  for(const tid of s.tileIds){const t=w.tiles[tid];if(!BUILDINGS[type].terrains.includes(t.terrain)||t.occupiedBy!==null)continue;
   const industrialSlot=buildingTileSlotsUsed(w,tid)>=generalTileSlotLimit(w,n.id);
   const action={type:'BUILD_FACILITY',buildingType:type,settlementId:s.id,targetTileId:tid,...(industrialSlot?{industrialSlot:true}:{})};
   if(buildingSiteLegal(w,n.id,action))return action;
  }
 }
 return null;
}
function f2bIndustrialAIQuarter(w){
 if(w.dayIndex%120!==0)return;
 for(const n of w.nations){if(!n.active||n.controller!=='AI')continue;
  const st=f2bEnsure(n),owned=w.buildings.filter(b=>w.tiles[b.tileId]?.ownerId===n.id),canSteel=f2bCanBuild(w,n.id,'steelworks'),canPump=f2bCanBuild(w,n.id,'steam_pump');
  const steelSites=owned.filter(b=>b.typeId==='steelworks'||b.redevelopTo==='steelworks').length;
  const pumpSites=owned.filter(b=>b.typeId==='steam_pump'||b.redevelopTo==='steam_pump').length;
  const food=n.lastQuarter||{},foodRatio=food.foodConsumed>0?(food.produced?.food||0)/food.foodConsumed:1;
  let type=null;
  if(canSteel&&!steelSites&&n.resources.iron>=130&&n.resources.coal>=10&&n.gold>=5200)type='steelworks';
  else if(canPump&&pumpSites<2&&foodRatio<.995&&n.gold>=3500&&
   w.buildings.filter(b=>b.typeId==='farm'&&w.tiles[b.tileId]?.ownerId===n.id&&b.status==='ACTIVE').length>=6)type='steam_pump';
  if(!type){st.plan=null;st.lastDecision={dayIndex:w.dayIndex,reason:'NO_ECONOMIC_NEED'};continue;}
  const action=f2bCandidateSite(w,n,type);
  if(!action){st.plan=null;st.lastDecision={dayIndex:w.dayIndex,reason:'NO_INDUSTRIAL_SLOT'};continue;}
  st.plan={...action,startedDay:w.dayIndex};
  if(!canExecuteNationAction(w,n.id,action)){
   const price=getNationActionCost(w,n.id,action);
   const lacking=price&&Object.entries(price.resources||{}).filter(([g,v])=>(n.resources[g]||0)<v).map(([g])=>g);
   st.lastDecision={dayIndex:w.dayIndex,reason:lacking?.length?'MATERIAL_SHORT':n.apUnits<(price?.apUnits||0)?'AP_SHORT':'FISCAL_RESERVE',missing:lacking||[]};
   continue;
  }
  const result=executeNationAction(w,n.id,action);
  if(result.ok){st.plan=null;st.lastDecision={dayIndex:w.dayIndex,reason:'CONSTRUCTION_STARTED',buildingType:type,buildingId:result.buildingId??null};}
 }
}
// V0.8E: conservative recovery for the independently audited V0.8D
// vilob-light-01 79,530 territorial claim.  Matching a negative residual
// alone is NEVER sufficient evidence to repair any other historical save.
function v08eRepairAudited79530Claim(w,sourceVersion){
 if(sourceVersion!=='V0.8D'||w.seed!=='vilob-light-01'||w.size!==39||w.height!==21||w.dayIndex<79530)return false;
 const donor=w.nations[6],receiver=w.nations[10];
 if(donor?.name!=='카이렌'||receiver?.name!=='로반')return false;
 const get=(n)=>n.f2bIndustry?.history?.filter(q=>q.dayIndex===79530);
 const dd=get(donor),rr=get(receiver);
 if(dd?.length!==1||rr?.length!==1)return false;
 const d=dd[0],r=rr[0],spec=[['machine_parts',6],['steel',16]];
 // Inspect all four sides and their arithmetic first. No partial repair.
 for(const [good,amount] of spec){
  const a=d[good],b=r[good];
  if(!a||!b||a.transfersIn!==0||a.transfersOut!==0||a.otherSpent!==amount||
     b.transfersIn!==0||b.transfersOut!==0||b.otherSpent!==-amount||
     !Number.isSafeInteger(a.start)||!Number.isSafeInteger(b.start)||
     a.start+a.produced+a.imports+a.transfersIn!==a.exports+a.used+a.construction+a.transfersOut+a.otherSpent+a.end||
     b.start+b.produced+b.imports+b.transfersIn!==b.exports+b.used+b.construction+b.transfersOut+b.otherSpent+b.end)
    return false;
 }
 for(const [good,amount] of spec){d[good].transfersOut=amount;d[good].otherSpent=0;r[good].transfersIn=amount;r[good].otherSpent=0;}
 w.v08eRecovery={schema:1,kind:'AUDITED_TERRITORIAL_F2B_79530',sourceVersion,dayIndex:w.dayIndex,
  originDay:79530,donorNationId:6,receiverNationId:10,machineParts:6,steel:16};
 return true;
}
function f2bValidate(w){
 for(const n of w.nations){const s=n.f2bIndustry;if(!s||s.schema!==1||!Array.isArray(s.history)||s.history.length>F2B_HISTORY_LIMIT||!s.lastQuarter||
   !Number.isSafeInteger(n.resources.steel)||n.resources.steel<0||n.resources.steel>F2B_MAX_STOCK||
   !s.pendingConstruction||!s.pendingTransfers||['machine_parts','steel'].some(g=>!Number.isSafeInteger(s.pendingConstruction[g])||s.pendingConstruction[g]<0||!Number.isSafeInteger(s.pendingTransfers[g])))return false;
  if(s.plan&&(!F2B_INDUSTRIAL_TYPES.includes(s.plan.buildingType)||!Number.isSafeInteger(s.plan.settlementId)||!Number.isSafeInteger(s.plan.targetTileId)))return false;
  for(const q of [...s.history,s.lastQuarter]){
   if(!Number.isSafeInteger(q.dayIndex)||q.dayIndex>w.dayIndex||q.dayIndex<0)return false;
   for(const g of ['machine_parts','steel']){
    const r=q[g];if(!r||['start','produced','imports','exports','used','construction','transfersIn','transfersOut','otherSpent','end'].some(k=>!Number.isSafeInteger(r[k])||r[k]<0))return false;
    if(r.start+r.produced+r.imports+r.transfersIn!==r.exports+r.used+r.construction+r.transfersOut+r.otherSpent+r.end)return false;
   }
   for(const k of ['steelworksSites','steelworksOperated','pumpSites','pumpsOperated','pumpExtraFood','ironUsed','coalUsed','goldUsed'])if(!Number.isSafeInteger(q[k])||q[k]<0)return false;
  }
 }
 for(const b of w.buildings)if(F2B_INDUSTRIAL_TYPES.includes(b.typeId)&&(!Number.isSafeInteger(b.f2bRuns||0)|| (b.f2bOperatingDay!=null&&(!Number.isSafeInteger(b.f2bOperatingDay)||b.f2bOperatingDay>w.dayIndex))))return false;
 return true;
}


// --- V0.7F2C: Industrial Modern I, resource-conserving arsenal and ammunition. ---
const F2C_SHELL_TARGET_MIN=24,F2C_SHELL_TARGET_MAX=96,F2C_SHELL_BATCH=24,F2C_SHELL_STOCK_MAX=1000000;
function f2cShellTarget(w,id){
 const guns=w.armies.filter(a=>a.nationId===id).reduce((sum,a)=>sum+a.units.reduce((z,u)=>z+(u.typeId==='field_artillery'?(u.guns||0):0),0),0);
 return guns?Math.min(F2C_SHELL_TARGET_MAX,Math.max(F2C_SHELL_TARGET_MIN,guns*4)):0;
}
function f2cEmptyQuarter(day,stock){return {dayIndex:day,start:stock,end:stock,produced:0,combatUsed:0,transfersIn:0,transfersOut:0,otherSpent:0,sites:0,operated:0,ironUsed:0,coalUsed:0,steelUsed:0,machinePartsUsed:0,goldUsed:0};}
function f2cNewState(day,stock){return {schema:1,introducedDay:day,lastQuarter:f2cEmptyQuarter(day,stock),history:[],pendingCombat:0,pendingTransfers:0,reserveAP:false,lastDecision:{dayIndex:day,reason:'NOT_EVALUATED'}};}
function f2cEnsure(n,day=0){return n.f2cArsenal||(n.f2cArsenal=f2cNewState(day,n.resources.artillery_shells||0));}
function f2cMigrateWorld(w){
 for(const n of w.nations){n.resources.artillery_shells??=0;f2cEnsure(n,w.dayIndex);}
 for(const b of w.buildings)if(b.typeId==='arsenal'){b.f2cRuns??=0;b.f2cOperatingDay??=null;}
}
function f2cTrackBattleShells(n,count){if(count>0)f2cEnsure(n).pendingCombat+=count;}
function f2cTrackTransfer(from,to,good,count){if(good!=='artillery_shells'||!count)return;f2cEnsure(from).pendingTransfers-=count;f2cEnsure(to).pendingTransfers+=count;}
function f2cOpenQuarter(w){
 for(const n of w.nations){if(!n.active)continue;const st=f2cEnsure(n,w.dayIndex),last=st.lastQuarter,q=f2cEmptyQuarter(w.dayIndex,last?.end??n.resources.artillery_shells);
  q.combatUsed=st.pendingCombat;q.transfersIn=Math.max(0,st.pendingTransfers);q.transfersOut=Math.max(0,-st.pendingTransfers);
  st.pendingCombat=0;st.pendingTransfers=0;st.lastQuarter=q;
 }
}
function f2cRunArsenalQuarter(w,projections){
 for(const b of w.buildings.filter(b=>b.typeId==='arsenal').sort((a,b)=>a.id-b.id)){
  const n=w.nations[w.tiles[b.tileId]?.ownerId];if(!n?.active)continue;
  const q=f2cEnsure(n).lastQuarter;q.sites++;
  const town=f2bServiceLegal(w,b,n,22);if(!town)continue;
  const local=projections.get(n.id)?.regionalEconomy?.towns?.get(town.id);
  if(!local||local.workers<22||n.resources.artillery_shells+F2C_SHELL_BATCH>F2C_SHELL_STOCK_MAX||n.resources.artillery_shells>=f2cShellTarget(w,n.id))continue;
  if(n.resources.steel<3||n.resources.iron<6||n.resources.coal<2||n.resources.machine_parts<1||n.gold<30||!i1Can(w,n,b,{steel:3,iron:6,coal:2,machine_parts:1}))continue;
  n.resources.steel-=3;n.resources.iron-=6;n.resources.coal-=2;n.resources.machine_parts-=1;n.gold-=30;
  i1Debit(w,n,b,{steel:3,iron:6,coal:2,machine_parts:1});
  n.resources.artillery_shells+=F2C_SHELL_BATCH;q.produced+=F2C_SHELL_BATCH;q.operated++;q.steelUsed+=3;q.ironUsed+=6;q.coalUsed+=2;q.machinePartsUsed++;q.goldUsed+=30;
  const fq=f2bEnsure(n).lastQuarter;fq.steel.used+=3;fq.machine_parts.used++;
  b.f2cRuns=(b.f2cRuns||0)+1;b.f2cOperatingDay=w.dayIndex;
 }
}
function f2cCloseQuarter(w){
 for(const n of w.nations){if(!n.active)continue;const st=f2cEnsure(n),q=st.lastQuarter;
  q.end=n.resources.artillery_shells;
  q.otherSpent=q.start+q.produced+q.transfersIn-q.combatUsed-q.transfersOut-q.end;
  st.history.push(structuredClone(q));if(st.history.length>48)st.history.shift();
 }
}
function f2cArsenalAIQuarter(w){
 if(w.dayIndex%30!==0)return;
 for(const n of w.nations){if(!n.active||n.controller!=='AI')continue;
  const st=f2cEnsure(n,w.dayIndex);if(w.dayIndex%120!==0&&!st.reserveAP)continue;
  const guns=f2cShellTarget(w,n.id);st.reserveAP=false;
  const sites=w.buildings.filter(b=>(b.typeId==='arsenal'||b.redevelopTo==='arsenal')&&w.tiles[b.tileId]?.ownerId===n.id);
  const foodGate=f2c2BuildFoodGate(w,n);
  let reason='NO_ARTILLERY_NEED';
  if(!guns||sites.length){reason=sites.length?'ALREADY_BUILT':'NO_ARTILLERY_NEED';}
  else if(!f2bCanBuild(w,n.id,'arsenal'))reason='TECH_LOCKED';
  else if(!foodGate.eligible)reason='FOOD_RISK';
  else if(n.gold<6500)reason='GOLD_RISK';
  else if(n.resources.coal<15)reason='COAL_RISK';
  else if(w.buildings.filter(b=>b.typeId==='steelworks'&&w.tiles[b.tileId]?.ownerId===n.id&&b.status==='ACTIVE').length===0)reason='STEEL_SUPPLY_RISK';
  else{
   let action=f2bCandidateSite(w,n,'arsenal');
   if(!action){
    const pool=w.buildings.filter(b=>b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===n.id&&['quarry','academy','barracks','workshop'].includes(b.typeId)).sort((a,b)=>a.id-b.id);
    for(const b of pool){
     const a={type:'REDEVELOP_FACILITY',buildingType:'arsenal',buildingId:b.id};
     if(redevelopmentLegal(w,n.id,a)){action=a;break;}
    }
   }
   if(!action)reason='NO_LEGAL_SITE';
   else if(!canExecuteNationAction(w,n.id,action)){
    const price=getNationActionCost(w,n.id,action);
    const materialsReady=price&&Object.entries(price.resources||{}).every(([key,value])=>(n.resources[key]||0)>=value)&&n.gold>=price.gold;
    if(materialsReady&&n.apUnits<(price?.apUnits||0)){st.reserveAP=true;reason='AP_RESERVATION';}
    else reason='MATERIAL_OR_AP_SHORT';
   }
   else{const result=executeNationAction(w,n.id,action);reason=result.ok?'CONSTRUCTION_STARTED':'ACTION_REJECTED';}
  }
  st.lastDecision={dayIndex:w.dayIndex,reason,foodSufficiency:foodGate.sufficiency,foodGate:foodGate.reason,foodObservedQuarters:foodGate.observedQuarters};
 }
}

