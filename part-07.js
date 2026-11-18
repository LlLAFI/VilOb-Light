// --- src/sim/simulation.js ---











const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const clampInt=(n,a,b)=>Math.round(clamp(n,a,b));
const syllablesA=['라','카','세','에','마','벨','나','도','테','아','리','켈','이','파','소','델'];
const syllablesB=['딘','렌','안','린','로','리아','온','아','민','엘','다','크','엔','시아','르','티'];
function rand(world){
  let state=world.rngState|0;
  state^=state<<13;state^=state>>>17;state^=state<<5;
  world.rngState=(state>>>0)||0x6d2b79f5;
  return world.rngState/4294967296;
}
/** Non-deterministic entropy is only introduced at explicit calendar boundaries.
 * By passing an entropy source, simulation tests can precisely replay injection events.
 * Fixed worlds never call entropySource, keeping old deterministic traces unchanged. */
function reseedAtBoundary(world,entropySource){
  const policy=world.rngPolicy;
  if(!policy||policy.fixed||world.dayIndex===0||world.dayIndex%policy.intervalDays!==0||policy.lastReseedDay===world.dayIndex)return false;
  if(typeof entropySource!=='function')throw Error('변동 RNG를 위한 외부 난수 공급원이 필요합니다.');
  const entropy=entropySource();
  if(!Number.isInteger(entropy)||entropy<0||entropy>0xffffffff)throw Error('유효하지 않은 RNG 외부 난수입니다.');
  world.rngState=hash32((world.rngState ^ entropy ^ world.dayIndex ^ 0x1b873593)>>>0)||0x6d2b79f5;
  policy.lastReseedDay=world.dayIndex;
  policy.reseedCount++;
  world.changeSeq++;
  return true;
}
function recordSimEvent(world,text,kind){world.events.push({dayIndex:world.dayIndex,text,kind});if(world.events.length>180)world.events.shift();if(kind==='leader')recordHistoricalEvent(world,kind,text);}
function makeLeader(world,nationId){
  const n=world.nations[nationId];
  const name=syllablesA[Math.floor(rand(world)*syllablesA.length)]+syllablesB[Math.floor(rand(world)*syllablesB.length)];
  const c={id:world.nextCharacterId++,nationId,role:'leader',name,age:29+Math.floor(rand(world)*30),
    administration:clampInt(25+rand(world)*70,0,100),ambition:clampInt(20+rand(world)*75,0,100),
    prudence:clampInt(20+rand(world)*75,0,100),reignStartDay:world.dayIndex,alive:true};
  world.characters.push(c);n.leaderId=c.id;
  return c;
}
function getLeader(world,n){return world.characters.find(c=>c.id===n.leaderId&&c.alive);}
function nearby(world,tid){return neighbors4(tid,world.size,world.height).map(id=>world.tiles[id]);}
// V0.5A · Economic Recovery V1. One lightweight national assessment per AI quarter.
// No resource transfer, building creation, route changes, or added daily ticks.
const V05A_HISTORY_WINDOW=12;
const V05A_RESOURCE_FACILITY=Object.freeze({food:'farm',wood:'lumber',stone:'quarry',iron:'mine'});
const V05A_FACILITY_RESOURCE=Object.freeze({farm:'food',lumber:'wood',quarry:'stone',mine:'iron'});
const V05A_RECOVERY_THRESHOLD=Object.freeze({wood:80,stone:60,iron:40});
function v05aEconomicNeeds(w,n){
  const q=n.lastQuarter||{produced:{},foodConsumed:0},trade=tradeDependencyReport(w,n.id)?.goods||{};
  const result={dayIndex:w.dayIndex,goods:{}};
  for(const good of RESOURCE_KEYS){
    const stock=n.resources[good]||0,produced=q.produced?.[good]||0;
    const consumed=good==='food'?q.foodConsumed||0:0;
    const deficit=good==='food'?Math.max(0,consumed-produced):0;
    const threshold=good==='food'?Math.max(30,consumed*1.5):V05A_RECOVERY_THRESHOLD[good];
    // Food production gap and actual post-trade stock must agree before applying
    // a strong farming priority; industrial shortages use physical stock only.
    const need=good==='food'?consumed>0&&(deficit>0||stock<consumed):stock<threshold;
    const severity=!need?0:good==='food'?
      Math.min(1,deficit/Math.max(1,consumed)*1.5+Math.max(0,1-stock/Math.max(1,consumed))*0.5):
      Math.min(1,Math.max(0,1-stock/Math.max(1,threshold)));
    result.goods[good]={need,stock,produced,consumed,deficit,threshold,
      severity:Math.round(severity*1000)/1000,imports:trade[good]?.quarterImports||0,
      blockedImports:trade[good]?.blockedImports||0,geologicalTiles:0,
      candidates:0,legal:0,executable:0,bestGain:0,state:need?'UNASSESSED':'SUFFICIENT'};
  }
  return result;
}
// Estimate marginal quarterly production using the ALREADY calculated local
// productivity snapshot. This is a ranking heuristic, not minted production.
function v05aCandidateGain(w,n,q,c,buildingById){
  const kind=c.facility,good=V05A_FACILITY_RESOURCE[kind];
  if(!good||!['BUILD_FACILITY','UPGRADE_FACILITY','REDEVELOP_FACILITY'].includes(c.action.type))return null;
  const a=c.action,b=a.buildingId===undefined?null:buildingById.get(a.buildingId);
  const tile=w.tiles[a.targetTileId??b?.tileId];if(!tile)return null;
  const townId=a.settlementId??b?.settlementId;
  const local=q.regionalEconomy.towns.get(townId);
  if(!local)return null;
  const before=b?facilityOutput(b,tile.terrain)?.produced?.[good]||0:0;
  const level=a.type==='UPGRADE_FACILITY'?(b?.level||1)+1:1;
  const after=facilityOutput({typeId:kind,level,status:'ACTIVE',disconnected:false},tile.terrain)?.produced?.[good]||0;
  // A depleted local workforce cannot operate another full plant at face value.
  const demand=local.demand||0,workers=local.workers||0;
  const addition=LOCAL_LABOR_DEMAND[kind]||0;
  const laborFactor=demand+addition>workers&&demand+addition>0?
    Math.max(.65,Math.min(1,workers/(demand+addition))):1;
  const modifier=1+techBonus(w,n.id,{food:'farmFood',wood:'lumberWood',stone:'quarryStone',iron:'mineIron'}[good])+
    (good==='food'&&kind==='farm'?((tile.terrain==='forest'?techBonus(w,n.id,'forestFarmBonus'):0)+(tile.terrain==='grass'?techBonus(w,n.id,'grassFarmBonus'):0)+(local.roadNetwork?techBonus(w,n.id,'connectedFarmBonus'):0)):0);
  const gain=Math.max(0,Math.floor((after-before)*local.multiplier*modifier*laborFactor));
  return {good,gain};
}
function v05aCompleteDiagnosis(w,n,context,selected,completed){
  // One owned-land pass per AI nation, once a quarter, only for scarce goods.
  const scarce=RESOURCE_KEYS.filter(g=>context.goods[g].need).map(g=>[context.goods[g],BUILDINGS[V05A_RESOURCE_FACILITY[g]].terrains]);
  if(scarce.length)for(const t of w.tiles){if(t.ownerId!==n.id)continue;
    for(const [g,terrains] of scarce)if(terrains.includes(t.terrain))g.geologicalTiles++;
  }
  for(const good of RESOURCE_KEYS){const g=context.goods[good];if(!g.need)continue;
    g.state=!g.geologicalTiles?'TERRAIN_UNAVAILABLE':!g.legal?'NO_LEGAL_CANDIDATE':
      !g.executable?'COST_OR_AP_BLOCKED':'RECOVERY_AVAILABLE';
  }
  const event={dayIndex:w.dayIndex,goods:context.goods,selected:selected||null,completed:Boolean(completed)};
  n.economicRecovery??={history:[]};n.economicRecovery.history.push(event);
  if(n.economicRecovery.history.length>V05A_HISTORY_WINDOW)n.economicRecovery.history.shift();
  return event;
}
function v05aRecoveryCsv(w){
  const cols=['nationId','nation','dayIndex','resource','state','stock','produced','consumed','deficit','terrainTiles','candidates','legal','executable','bestGain','quarterImports','blockedImports','chosenAction','completed'];
  const rows=[cols];for(const n of w.nations)for(const h of n.economicRecovery?.history||[]){
    for(const good of RESOURCE_KEYS){const g=h.goods?.[good];if(!g)continue;
      rows.push([n.id,n.name,h.dayIndex,good,g.state,g.stock,g.produced,g.consumed,g.deficit,g.geologicalTiles,g.candidates,g.legal,g.executable,g.bestGain,g.imports,g.blockedImports,h.selected||'',h.completed?1:0]);}
  }
  return rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
function candidatesForNation(world,n,territory,recovery=null){
  const out=[],owned=world.tiles.filter(t=>t.ownerId===n.id);
  const frontier=new Set();
  for(const t of owned)for(const nbr of nearby(world,t.id))if(nbr.ownerId===null&&TERRAINS[nbr.terrain].passable)frontier.add(nbr.id);
  for(const tid of frontier){
    const t=world.tiles[tid];
    const adjacent=nearby(world,tid),neutral=adjacent.filter(t=>t.ownerId===null&&TERRAINS[t.terrain].passable).length;
    const threats=adjacent.filter(t=>t.ownerId!==null&&t.ownerId!==n.id).length;
    const claim=getClaimCost(world,n.id,tid,territory);
    out.push({developmentPressure:0,action:{type:'CLAIM_TILE',targetTileId:tid},utility:.90+(t.terrain==='plain'?.06:0),terrain:t.terrain,neutral,threats,
      adjacentOwned:claim.adjacentOwned,tendrilDepth:claim.tendrilDepth,naturalPassage:claim.naturalPassage,claimCost:claim.cost});
  }
  // D5A: preselect only geographically viable outposts. Avoid evaluating every owned
  // tile against every existing settlement (O(owned * settlements) candidate legality).
  const capacity=settlementCapacity(world,n.id,territory);
  const unassigned=owned.reduce((sum,t)=>sum+(t.settlementId===null?1:0),0);
  territory.developmentPressure=capacity.limit>n.settlementIds.length?
    Math.max(0,Math.min(1,(unassigned/Math.max(20,owned.length)-.45)*1.8)):0;
  for(const c of out)c.developmentPressure=territory.developmentPressure;
  // Do not turn a huge country into a chain of empty, undeveloped 1-tile outposts.
  // New towns must first receive a real house and a farm (including in-progress builds).
  // This constraint affects the AI's choice, NEVER the player's territorial limit.
  const startupCounts=new Map();
  for(const b of world.buildings){
    if(b.typeId!=='house'&&b.typeId!=='farm')continue;
    const counts=startupCounts.get(b.settlementId)||{house:0,farm:0};
    counts[b.typeId]++;startupCounts.set(b.settlementId,counts);
  }
  const awaitingInfrastructure=world.settlements.some(s=>s.ownerId===n.id&&
    Number.isInteger(s.foundedDay)&&s.foundedDay>=0&&
    ((startupCounts.get(s.id)?.house||0)<1||(startupCounts.get(s.id)?.farm||0)<1));
  if(n.settlementIds.length<capacity.limit&&!awaitingInfrastructure){
    // Manhattan radius 2 is forbidden; derive a tiny mask instead of repeated scans.
    const blocked=new Uint8Array(world.tiles.length);
    for(const s of world.settlements){
      if(s.ownerId!==n.id)continue;
      const pos=pointOf(s.coreTileId,world.size);
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        if(Math.abs(dx)+Math.abs(dy)>2)continue;
        const x=pos.x+dx,y=pos.y+dy;
        if(x>=0&&y>=0&&x<world.size&&y<world.height)blocked[y*world.size+x]=1;
      }
    }
    const sites=[];
    for(const t of owned){
      if(t.settlementId!==null||blocked[t.id]||!BUILDINGS.farm.terrains.includes(t.terrain))continue;
      const adjacent=nearby(world,t.id);
      const adjacentOwned=adjacent.reduce((sum,v)=>sum+(v.ownerId===n.id?1:0),0);
      if(adjacentOwned<2)continue;
      const remote=territory.distances[t.id];
      if(remote<3)continue;
      const open=adjacent.filter(v=>v.ownerId===n.id||v.ownerId===null).length;
      const soft=adjacent.filter(v=>['plain','grass','forest'].includes(v.terrain)).length;
      const utility=.86+.055*open+.12*Math.min(7,remote-3)+soft*.035;
      const rank=utility+adjacentOwned*.025;
      sites.push({action:{type:'FOUND_SETTLEMENT',targetTileId:t.id},utility,remote,adjacentOwned,rank});
    }
    // A bounded shortlist also limits expensive strategic scoring/RNG calls in large worlds.
    sites.sort((a,b)=>b.rank-a.rank||a.action.targetTileId-b.action.targetTileId);
    const chosen=[];
    for(const site of sites){
      if(chosen.length>=24)break;
      const pos=pointOf(site.action.targetTileId,world.size);
      if(chosen.some(v=>{const p=pointOf(v.action.targetTileId,world.size);return Math.abs(p.x-pos.x)+Math.abs(p.y-pos.y)<5;}))continue;
      site.developmentPressure=territory.developmentPressure;
      chosen.push(site);
    }
    out.push(...chosen);
  }
  const forecast=projectedQuarter(world,n);
  // Rebuilt for each nation after the preceding nation's actions. A planning-only
  // memo on the ephemeral territory metrics, never on the saved World.
  const siteUsage=f4d3SiteUsage(world);
  territory.f4d3SiteUsage=siteUsage;
  territory.footprintDemands=new Map(); // Quarter-local memo only; never saved on the world.
  for(const s of world.settlements){
    if(s.ownerId!==n.id)continue;
    if(s.development<100)out.push({action:{type:'DEVELOP_SETTLEMENT',settlementId:s.id},utility:.92+(100-s.development)/240+(Math.min(150,s.population)/700)});
    if(s.tileIds.length<settlementFootprintCapacity(world,n.id).maxTiles){
      const demand=settlementExpansionDemand(world,s,forecast,siteUsage);
      territory.footprintDemands.set(s.id,demand);
      if(demand.needed){
        const possible=new Set();
        for(const tid of s.tileIds)for(const near of nearby(world,tid))if(near.ownerId===n.id&&near.settlementId===null)possible.add(near.id);
        for(const tid of possible){
          const shape=settlementExpansionCandidate(world,s,tid,demand);
          if(!shape)continue;
          out.push({action:{type:'EXPAND_SETTLEMENT',settlementId:s.id,targetTileId:tid},
            utility:(.66+shape.score/145)*(.9+Math.min(1.2,demand.occupancy)*.10),shape});
        }
      }
    }
  }
  // Trunk roads are a real investment choice, not an automatic decoration.
  const road=roadCandidate(world,n.id);if(road)out.push(road);
  // Buildings can remain useful after the original 100-point development ceiling.
  out.push(...buildingCandidates(world,n,recovery,forecast,siteUsage));
  if(n.researchLevel<100)out.push({action:{type:'INVEST_KNOWLEDGE'},utility:1.04+(100-n.researchLevel)/350});
  // Merge is rare and strictly optional; only adjacent settlements, not a separate AI type.
  if(world.dayIndex>=12*DAYS_PER_YEAR){
    const mine=world.settlements.filter(s=>s.ownerId===n.id);
    for(let i=0;i<mine.length;i++)for(let j=i+1;j<mine.length;j++){
      const action={type:'MERGE_SETTLEMENTS',settlementId:mine[i].id,otherSettlementId:mine[j].id};
      const assessment=settlementMergeAssessment(world,mine[i],mine[j]);
      if(assessment&&canExecuteNationAction(world,n.id,action))out.push({action,utility:.35+assessment.score/170});
    }
  }
  return out;
}
/** F3D: spatially bounded, profile-neutral strategic fort site shortlist.
 * Candidate screening is O(owned + nearby frontiers); only up to nine actual
 * frontier-to-settlement A* paths are computed per nation and quarter.
 * Scores represent route interception, core protection, line linking,
 * natural cover and fiscal isolation risk, NOT forced defensive outcomes.
 */
function strategicFortCandidates(w,n){
  const owned=w.tiles.filter(t=>t.ownerId===n.id&&TERRAINS[t.terrain]?.passable&&t.occupiedBy===null);
  if(!owned.length)return [];
  const price=buildPrice('fort');
  if(n.gold<price.gold*.7||n.resources.stone<price.resources.stone*.7||n.resources.wood<price.resources.wood*.7)return [];
  const existing=(w.defenses||[]).filter(d=>w.tiles[d.tileId]?.ownerId===n.id);
  const already=new Set(existing.map(d=>d.tileId)),active=existing.filter(d=>fortEffective(d)&&w.tiles[d.tileId]?.occupiedBy===null);
  const towns=w.settlements.filter(s=>s.ownerId===n.id).sort((a,b)=>
    (b.coreTileId===n.capitalId?1:0)-(a.coreTileId===n.capitalId?1:0)||b.population-a.population||a.id-b.id);
  const frontier=[];
  for(const t of owned)if(neighbors4(t.id,w.size,w.height).some(id=>{
    const v=w.tiles[id];return v.ownerId!==null&&v.ownerId!==n.id&&
      (warAgainst(w,n.id,v.ownerId)||relationOf(w,n.id,v.ownerId)<15);
  }))frontier.push(t.id);
  // A fort is expensive strategic infrastructure: reserve capacity for genuinely
  // threatened fronts and population centers instead of saturating every tile.
  // This is an AI planning threshold, NOT a player construction restriction.
  const desired=Math.max(1,Math.ceil(frontier.length/5)+Math.ceil(towns.length/2)+(militaryAtWar(w,n.id)?2:0));
  if(existing.length>=desired)return [];
  const currentLines=fortificationNetwork(w).blocked;
  const threatDist=new Int16Array(w.tiles.length).fill(-1),queue=[];
  for(const id of frontier){threatDist[id]=0;queue.push(id);}
  for(let i=0;i<queue.length;i++){
    const id=queue[i],d=threatDist[id];if(d>=8)continue;
    for(const nb of neighbors4(id,w.size,w.height)){
      const tile=w.tiles[nb];if(threatDist[nb]!==-1||tile.ownerId!==n.id||tile.occupiedBy!==null||!TERRAINS[tile.terrain]?.passable)continue;
      threatDist[nb]=d+1;queue.push(nb);
    }
  }
  const pathVisits=new Uint8Array(w.tiles.length);
  const strategicCores=towns.slice(0,3);
  const entrances=frontier.slice().sort((a,b)=>{
    const distance=id=>Math.min(...strategicCores.map(s=>Math.abs(id%w.size-s.coreTileId%w.size)+Math.abs(Math.floor(id/w.size)-Math.floor(s.coreTileId/w.size))));
    return distance(a)-distance(b)||a-b;
  }).slice(0,w.tiles.length>4000?2:3);
  for(const start of entrances)for(const s of strategicCores.slice(0,w.tiles.length>4000?2:3)){
    const path=shortestRoadPath(w,start,s.coreTileId,t=>t.ownerId===n.id&&t.occupiedBy===null,'march');
    if(path)for(const id of path)pathVisits[id]=Math.min(255,pathVisits[id]+1);
  }
  const atWar=!!militaryAtWar(w,n.id);
  const sites=[];
  for(const t of owned){
    if(already.has(t.id)||defenseTileSlotsUsed(w,t.id)>=DEFENSE_TILE_SLOTS)continue;
    const d=threatDist[t.id],minCore=Math.min(...strategicCores.map(s=>Math.abs(t.x-w.tiles[s.coreTileId].x)+Math.abs(t.y-w.tiles[s.coreTileId].y)));
    if((d<0||d>6)&&minCore>3)continue;
    const adjacent=neighbors4(t.id,w.size,w.height),ownExits=adjacent.filter(id=>w.tiles[id].ownerId===n.id&&w.tiles[id].occupiedBy===null&&TERRAINS[w.tiles[id].terrain]?.passable).length;
    const closeForts=active.filter(f=>{
      const ft=w.tiles[f.tileId],dist=Math.abs(ft.x-t.x)+Math.abs(ft.y-t.y);
      return dist<=2&&dist>0;
    });
    let linkCount=0;
    for(const f of closeForts){
      const ft=w.tiles[f.tileId];
      if(neighbors4(t.id,w.size,w.height).includes(ft.id)||
        neighbors4(t.id,w.size,w.height).some(mid=>w.tiles[mid].ownerId===n.id&&w.tiles[mid].occupiedBy===null&&TERRAINS[w.tiles[mid].terrain]?.passable&&neighbors4(mid,w.size,w.height).includes(ft.id)))linkCount++;
    }
    // Weighted terms (30 / 25 / 20 / 15 / 10) are inspectable dimensions.
    const gate=Math.min(1,Math.max(pathVisits[t.id]/4,ownExits<=2&&d>=0&&d<=3?.7:0,d===0?.45:0));
    const protect=Math.max(0,1-minCore/6)*(t.id===n.capitalId?1:.85);
    const network=Math.min(1,linkCount/2);
    const natural={mountain:1,rock:.83,forest:.62,grass:.35,plain:.30}[t.terrain]||.3;
    const isolation=ownExits<=1?.1:d<0?.35:1;
    const value=(gate*30+protect*25+network*20+natural*15+isolation*10)/100;
    // Already protected line tiles are a poor new fort site unless they add
    // meaningful interception or link several existing strongholds.
    if(currentLines.has(t.id)&&gate<.55&&linkCount<2)continue;
    const redundant=existing.some(f=>Math.abs(w.tiles[f.tileId].x-t.x)+Math.abs(w.tiles[f.tileId].y-t.y)===1);
    const utility=(.3+value*9.4)*(atWar?1.15:.9)*(redundant?.70:1)/(1+Math.max(0,existing.length-4)*.12);
    if(utility<1.2)continue;
    sites.push({action:{type:'BUILD_FACILITY',buildingType:'fort',settlementId:t.settlementId,targetTileId:t.id},facility:'fort',utility,
      fortFactors:{gate,protect,network,natural,isolation}});
  }
  return sites.sort((a,b)=>b.utility-a.utility||a.action.targetTileId-b.action.targetTileId).slice(0,12);
}

/** V0.7C3: a rebuild target may only remove a truly redundant *working* non-residential
 * site. Protect actual food output, the last academy, strategic military buildings and
 * production needed for scarce resources. No free slots or hidden stock creation. */
function v07c3SurplusConversionSafe(w,n,s,b,target,q=null,counts=null){
  if(!hasTech(w,n.id,'urban_redevelopment')||!b||b.disconnected||b.status!=='ACTIVE'||b.level>2||
     w.dayIndex-(b.lastRedevelopedDay??-99999)<360||!['academy','lumber','quarry','mine'].includes(b.typeId)||
     !BUILDINGS[target]?.terrains.includes(w.tiles[b.tileId]?.terrain))return false;
  const localCount=counts?.local?.get(s.id+':'+b.typeId)??w.buildings.filter(x=>x.settlementId===s.id&&x.typeId===b.typeId&&x.status==='ACTIVE'&&!x.disconnected&&w.tiles[x.tileId]?.ownerId===n.id).length;
  if(localCount<2)return false; // no last-type removal in a settlement
  const nationCount=counts?.nation?.get(b.typeId)??w.buildings.filter(x=>x.typeId===b.typeId&&x.status==='ACTIVE'&&!x.disconnected&&w.tiles[x.tileId]?.ownerId===n.id).length;
  if(nationCount<2)return false;
  if(b.typeId==='academy')return true; // guaranteed at least one academy remains
  const good={lumber:'wood',quarry:'stone',mine:'iron'}[b.typeId];
  const threshold={wood:1200,stone:1200,iron:500}[good];
  if(n.resources[good]<threshold)return false;
  const forecast=q||projectedQuarter(w,n);
  const existing=facilityOutput(b,w.tiles[b.tileId].terrain)?.produced?.[good]||0;
  return forecast.produced[good]>=Math.max(3,existing*2); // keep useful national production
}
/** The new waterwheel choice is derived from the installed output coefficients,
 * not an unconditional river bonus; only valid sites may enter the comparison. */
function v07dWorkshopCap(w,n){return Math.min(8,Math.max(1,Math.floor(n.settlementIds.length/4)))+techBonus(w,n.id,'workshopCap');}
function v07dWorkshopPowerFactors(w,nationId){
  return hasTech(w,nationId,'power_transmission')?{watermill:1.32,alternative:1.18}:{watermill:1.20,alternative:1.12};
}
function v07c3WorkshopPowerPreference(w,nationId,tileId){
  if(!hasTech(w,nationId,'basic_mechanical_power'))return 1;
  const p=v07dWorkshopPowerFactors(w,nationId);
  return riverAdjacentTileInfo(w,tileId).riverbank?p.watermill/p.alternative:1;
}
/** Pure observation; never changes the simulation world or consumes RNG. */
function v07c3DevelopmentDiagnosis(w,n,q=null,siteUsage=null){
  const forecast=q||projectedQuarter(w,n),usage=siteUsage||f4d3SiteUsage(w);
  const owned=w.settlements.filter(s=>s.ownerId===n.id),required=Math.max(1,forecast.foodConsumed);
  const byTown=new Map(),localTypes=new Map(),nationTypes=new Map();
  const workshops=[];
  for(const b of w.buildings){
    if(w.tiles[b.tileId]?.ownerId!==n.id)continue;
    if(b.typeId==='workshop')workshops.push(b);
    if(!byTown.has(b.settlementId))byTown.set(b.settlementId,[]);
    byTown.get(b.settlementId).push(b);
    if(b.status==='ACTIVE'&&!b.disconnected){
      const k=b.settlementId+':'+b.typeId;
      localTypes.set(k,(localTypes.get(k)||0)+1);
      nationTypes.set(b.typeId,(nationTypes.get(b.typeId)||0)+1);
    }
  }
  const counts={local:localTypes,nation:nationTypes};
  const cap=v07dWorkshopCap(w,n);
  const foodCover=n.resources.food/required;
  const foodGate=v07f1c1WorkshopFoodGate(forecast,n,w);
  const eligible=foodGate.eligible;
  let openSites=0,riverOpen=0,surplusSites=0,riverSurplus=0;
  for(const s of owned){
    const town=byTown.get(s.id)||[];
    if(town.some(b=>b.typeId==='workshop'))continue;
    const housing=settlementHousing(w,s);
    for(const tid of s.tileIds){
      const t=w.tiles[tid];if(!t||t.ownerId!==n.id||t.occupiedBy!==null||!BUILDINGS.workshop.terrains.includes(t.terrain))continue;
      if((usage.generalUsed.get(tid)||0)<generalTileSlotLimit(w,n.id)){
        openSites++;if(riverAdjacentTileInfo(w,tid).riverbank)riverOpen++;
      }
    }
    for(const b of town){
      if(w.tiles[b.tileId]?.occupiedBy!==null)continue;
      const spareHouse=b.typeId==='house'&&b.status==='ACTIVE'&&!b.disconnected&&s.population<=housing*.68&&
        w.dayIndex-(b.lastRedevelopedDay??-99999)>=360;
      const surplus=spareHouse||v07c3SurplusConversionSafe(w,n,s,b,'workshop',forecast,counts);
      if(!surplus)continue;
      const action={type:'REDEVELOP_FACILITY',buildingId:b.id,buildingType:'workshop'};
      if(!redevelopmentLegal(w,n.id,action))continue;
      surplusSites++;if(riverAdjacentTileInfo(w,b.tileId).riverbank)riverSurplus++;
    }
  }
  const codes=[];
  if(!hasTech(w,n.id,'guild_organization'))codes.push('TECH_MISSING');
  if(workshops.length>=cap)codes.push('WORKSHOP_CAP_REACHED');
  if(!eligible)codes.push(foodGate.reason==='SEVERE_ACTUAL_SHORTAGE'?'FOOD_SEVERE_ACTUAL_SHORTAGE':'FOOD_SUFFICIENCY_LOW');
  if(n.resources.wood<=Math.max(100,forecast.produced.wood*3)||n.resources.iron<=Math.max(40,forecast.produced.iron*3))codes.push('RESOURCE_SHORTAGE');
  if(n.gold<=Math.max(1500,(forecast.upkeep+forecast.civil.total)*4))codes.push('TREASURY_SHORTAGE');
  if(!openSites&&!surplusSites)codes.push('NO_WORKSHOP_SITE');
  const readiness=v07cEarlyModernReadiness(w,n);
  return {tech:readiness.tech,academy:readiness.academy,workshop:readiness.workshop,ready:readiness.ready,
    built:workshops.length,cap,foodProduced:forecast.produced.food,foodConsumed:forecast.foodConsumed,
    foodStock:n.resources.food,foodCover,foodRequired:Math.max(0,4*(forecast.foodConsumed-forecast.produced.food)),foodSufficiency:foodGate.sufficiency,foodThreshold:foodGate.threshold,foodPressure:n.foodPressure,foodPath:foodGate.path,foodHistoryCount:foodGate.historyCount,foodHistoryHealthy:foodGate.historyHealthy,
    openSites,surplusSites,riverOpen,riverSurplus,eligible,blockers:codes};
}
const V07C3_DEVELOPMENT_REASON=Object.freeze({
 TECH_MISSING:'길드 조직 미연구',WORKSHOP_CAP_REACHED:'국가 공방 수 상한',
 FOOD_SUFFICIENCY_LOW:'120일 식량 충족률 100% 미달',FOOD_SEVERE_ACTUAL_SHORTAGE:'실제 식량 공급의 지속적 심각 부족',RESOURCE_SHORTAGE:'목재·철 착공 자원 부족',
 TREASURY_SHORTAGE:'건설 자금 부족',NO_WORKSHOP_SITE:'합법적 신축·재개발 부지 없음'});

/** F1C1: keep the original 2Q food gate, and add a conservative 1Q/4Q-history path.
 * History is existing quarter telemetry, never synthesized; four consecutive
 * records are required and must end at the current or preceding quarter.
 */
function v07f1c1WorkshopFoodGate(q,n,world=null){
 const gate=f2c2BuildFoodGate(world,n,{q});
 const c=Math.max(0,q?.foodConsumed||0),produced=Math.max(0,q?.produced?.food||0);
 // Keep local farm/labor safeguards for a workshop relying on food reserves
 // rather than adequate current food output, not for every stable workshop.
 const stable=gate.eligible&&c>0&&(produced<c*.98||n.foodPressure<.95);
 return {...gate,strict:gate.eligible&&!stable,stable,
  historyCount:gate.observedQuarters,historyHealthy:gate.observedQuarters>=4,
  reserveQuarters:c>0?n.resources.food/c:Infinity};
}
function foodRatioSafeForWorkshop(q,n,world=null){return v07f1c1WorkshopFoodGate(q,n,world).eligible;}
function v07f1c1TownWorkshopSafe(world,s,n,q,buildings){
  if(!s||s.population>settlementHousing(world,s)*1.02)return false;
  if(!buildings.some(b=>b.typeId==='farm'&&b.status==='ACTIVE'&&!b.disconnected&&world.tiles[b.tileId]?.ownerId===n.id))return false;
  const local=q.regionalEconomy?.towns?.get(s.id);
  if(!local)return false;
  return local.demand<=0||local.workers>=local.demand*.65;
}
/** F1C2: persistent domestic food-production crisis, not a mere low pantry.
 * Four actual consecutive 30-day production reports must show <95% coverage.
 * A newly imported old save receives no manufactured history. */
function f1c2FarmCrisis(w,n,q){
 const consumed=q.foodConsumed||0;
 if(!(consumed>0&&q.produced.food<consumed*.95))return false;
 const history=n.economicRecovery?.history||[];
 if(history.length<4)return false;
 const four=history.slice(-4);
 return four.every((h,i)=>{
   const f=h.goods?.food;
   return Number.isSafeInteger(h.dayIndex)&&h.dayIndex>=0&&w.dayIndex-h.dayIndex>=0&&
     (i===0||h.dayIndex-four[i-1].dayIndex===30)&&
     (i!==3||w.dayIndex-h.dayIndex<=30)&&f&&Number.isFinite(f.produced)&&Number.isFinite(f.consumed)&&
     f.consumed>0&&f.produced<f.consumed*.95;
 });
}
/** A house can be repurposed only when its loss leaves a 3% housing margin.
 * Status=REDEVELOPING removes the old house capacity immediately, so this
 * checks the actual in-construction state rather than assuming future homes. */
function f1c2HousingAfterConversion(w,n,s,b,housing){
 const capacity=facilityOutput(b,w.tiles[b.tileId]?.terrain)?.capacity||0;
 return housing-Math.ceil(capacity*(1+techBonus(w,n.id,'housing')));
}
/** Paid conversion candidates share the standard redevelopment action, AP,
 * materials, building schedule and physical slot. No emergency-free production. */
function f1c2FamineFarmCandidates(w,n,q,byTown,existing){
 if(!hasTech(w,n.id,'urban_redevelopment')||!f1c2FarmCrisis(w,n,q))return [];
 const result=[];
 for(const s of w.settlements){
  if(s.ownerId!==n.id)continue;
  const housing=settlementHousing(w,s),options=[];
  for(const b of byTown.get(s.id)||[]){
   const t=w.tiles[b.tileId];
   if(!t||t.ownerId!==n.id||t.occupiedBy!==null||b.status!=='ACTIVE'||b.disconnected||
      w.dayIndex-(b.lastRedevelopedDay??-99999)<360||
      !BUILDINGS.farm.terrains.includes(t.terrain)||b.typeId==='farm')continue;
   if(b.typeId==='house'){
    if(f1c2HousingAfterConversion(w,n,s,b,housing)<Math.ceil(s.population*1.03))continue;
   }else{
    // Only a demonstrably redundant level-1/2 material or research facility;
    // never remove the last local type, national lumber or food production.
    if(!['academy','lumber','quarry','mine'].includes(b.typeId))continue;
    if(!v07c3SurplusConversionSafe(w,n,s,b,'farm',q))continue;
   }
   const action={type:'REDEVELOP_FACILITY',buildingId:b.id,buildingType:'farm'};
   if(!redevelopmentLegal(w,n.id,action)||existing.some(c=>c.action.type==='REDEVELOP_FACILITY'&&c.action.buildingId===b.id))continue;
   const local=q.regionalEconomy?.towns?.get(s.id),localGap=Math.max(0,s.population*.38-(local?.produced?.food||0));
   // Prefer converting small expendable houses, then superior farming terrain.
   const yieldFactor=relativeYield('farm',t.terrain);
   options.push({action,facility:'farm',f1c2FamineRecovery:true,
     utility:5.1+Math.min(1.4,localGap/Math.max(20,s.population*.38))*1.2+yieldFactor*.25-(b.typeId==='house'?b.level*.09:0)});
  }
  options.sort((a,b)=>b.utility-a.utility||a.action.buildingId-b.action.buildingId);
  if(options.length)result.push(options[0]); // one per settlement in candidate shortlist
 }
 return result;
}
function buildingCandidates(world,n,recovery=null,forecast=null,siteUsage=null){
  const candidates=[],q=forecast||projectedQuarter(world,n),reserve=n.resources,p=d1dEffectiveProfile(world,n.id);
  const structures=allStructures(world),byTown=new Map(),byTownType=new Map(),activeByTownType=new Map(),v07c3LocalTypes=new Map(),v07c3NationTypes=new Map();
  const byBuildingId=new Map(world.buildings.map(b=>[b.id,b]));
  const sites=siteUsage||f4d3SiteUsage(world);
  const generalUsed=sites.generalUsed,defenseUsed=sites.defenseUsed,generalLimit=generalTileSlotLimit(world,n.id);
  for(const b of structures){
    if(!byTown.has(b.settlementId))byTown.set(b.settlementId,[]);
    byTown.get(b.settlementId).push(b);
    const k=b.settlementId+':'+b.typeId;
    byTownType.set(k,(byTownType.get(k)||0)+1);
    if(b.status==='ACTIVE')activeByTownType.set(k,(activeByTownType.get(k)||0)+1);
    if(b.status==='ACTIVE'&&!b.disconnected&&world.tiles[b.tileId]?.ownerId===n.id){
      v07c3LocalTypes.set(k,(v07c3LocalTypes.get(k)||0)+1);
      v07c3NationTypes.set(b.typeId,(v07c3NationTypes.get(b.typeId)||0)+1);
    }
  }
  const v07c3Counts={local:v07c3LocalTypes,nation:v07c3NationTypes};
  const poorFood=Math.max(0,q.foodConsumed-q.produced.food),foodCover=q.foodConsumed?reserve.food/q.foodConsumed:99;
  const atWar=militaryAtWar(world,n.id);
  const barracksCount=v04e1ReservedBarracks(world,n.id).length;
  const workshopCount=world.buildings.filter(b=>b.typeId==='workshop'&&world.tiles[b.tileId]?.ownerId===n.id).length;
  const workshopCap=v07dWorkshopCap(world,n);
  const f1c1FoodGate=v07f1c1WorkshopFoodGate(q,n,world);
  const workshopEligible=hasTech(world,n.id,'guild_organization')&&workshopCount<workshopCap&&
    f1c1FoodGate.eligible&&reserve.wood>Math.max(100,q.produced.wood*3)&&reserve.iron>Math.max(40,q.produced.iron*3)&&
    n.gold>Math.max(1500,(q.upkeep+q.civil.total)*4);
  const barracksMil=p.military?.militaryInvestment??50;
  const barracksHealth=q.goldIncome-q.upkeep-q.civil.total;
  const barracksFoodGate=f2c2BuildFoodGate(world,n,{q,threshold:atWar ? 0.90 : 1});
  const barracksEligible=hasTech(world,n.id,'military_drills')&&barracksCount<3&&barracksFoodGate.eligible&&barracksHealth>120&&n.gold>Math.max(1600,(q.upkeep+q.civil.total)*3);
  const foodRatio=q.foodConsumed>0?q.produced.food/q.foodConsumed:3;
  const foodSurplus=foodRatio>=1.12&&foodCover>=5;
  const foodSecurity=foodRatio>=1.03&&foodCover>=2;
  const resourceUrgency=(good)=>{
    const stock=reserve[good]||0;
    const threshold={wood:420,stone:550,iron:300}[good]||300;
    return stock<35?2.65:stock<threshold*.5?1.8:stock<threshold?1.2:stock>850?.30:.65;
  };
  const f1bHasNationalLumber=f1bActiveLumberCount(world,n)>0;
  const strategy=strategicReport(world,n.id);
  for(const s of world.settlements){
    if(s.ownerId!==n.id)continue;
    const housing=settlementHousing(world,s),occupancy=s.population/Math.max(1,housing);
    const local=q.regionalEconomy.towns.get(s.id);
    const localFoodNeed=s.population*.38;
    const localFoodGap=local?Math.max(0,localFoodNeed-local.produced.food)/Math.max(20,localFoodNeed):0;
    const townBuildings=byTown.get(s.id)||[];
    for(const tid of s.tileIds){
      const t=world.tiles[tid];if(t.occupiedBy!==null)continue;
      const generalOpen=(generalUsed.get(tid)||0)<generalLimit,defenseOpen=(defenseUsed.get(tid)||0)<DEFENSE_TILE_SLOTS;
      for(const [kind,def] of Object.entries(BUILDINGS)){
        if(F2B_INDUSTRIAL_TYPES.includes(kind))continue;
        if(!def.terrains.includes(t.terrain)||!(kind==='fort'?defenseOpen:generalOpen))continue;
        let utility=0;
        switch(kind){
          case 'house':utility=(.30+Math.min(2.2,Math.max(0,occupancy-.55)*3.4))*(foodSecurity&&occupancy>.91?1.85:1);break;
          case 'farm':utility=(.30+Math.min(2.5,poorFood/Math.max(15,q.foodConsumed)*2.8)+Math.max(0,1.8-foodCover)*.8)*(foodSurplus?.14:foodSecurity?.45:1);break;
          case 'lumber':utility=(.32+Math.max(0,1-reserve.wood/80)*1.4+Math.max(0,10-q.produced.wood)*.045)*resourceUrgency('wood');
            if(!f1bHasNationalLumber)utility*=2.2;break;
          case 'quarry':utility=(.28+Math.max(0,1-reserve.stone/90)*1.15)*resourceUrgency('stone');break;
          case 'mine':utility=(.25+Math.max(0,1-reserve.iron/70)*1.1)*resourceUrgency('iron');break;
          case 'fort':utility=0;break; // F3D: produced only by strategicFortCandidates.
          case 'academy':utility=.22+((n.researchLevel<100)?(.15+n.researchLevel/500):.04);break;
          case 'factory':utility=0;break; // F2A4: first factory exclusively industrial AI
          case 'workshop':utility=workshopEligible&&(!f1c1FoodGate.stable||v07f1c1TownWorkshopSafe(world,s,n,q,townBuildings))&&!(byTownType.get(s.id+':workshop')||0)&&
            (t.roadLevel>0||world.tiles[s.coreTileId]?.roadLevel>0||local?.roadNetwork)?
              (2.0+Math.min(.5,(n.gold-1000)/10000))*v07c3WorkshopPowerPreference(world,n.id,tid):0;break;
          case 'barracks':utility=barracksEligible&&v04e1BarracksSlotAvailable(world,n.id,s.id)?(.30+barracksMil/100*1.35+(atWar?.20:0))*Math.min(1.3,Math.max(.3,(militaryStrengthTarget(world,n.id)-activeManpower(world,n.id))/Math.max(1,militaryStrengthTarget(world,n.id)))):0;break;
        }
        if((kind==='fort'||kind==='barracks'||kind==='workshop'||kind==='factory')&&utility<=0)continue;
        // Encourage farming where people live; do not create a local hunger model.
        if(kind==='farm')utility+=Math.min(.55,localFoodGap*.45);
        if(kind==='farm'&&foodCover<.9)utility+=.5;
        if(kind==='farm'&&poorFood>Math.max(10,q.foodConsumed*.04))utility*=1.30;
        if(['farm','lumber','quarry','mine','academy'].includes(kind)&&local){
          const utilization=local.demand?Math.min(1,local.workers/local.demand):1;
          utility*=.77+.28*utilization;
          utility*=1+Math.min(.10,Math.max(0,s.development)/1000);
          if(local.roadBonus)utility*=1.045;
        }
        if(strategy?.priority==='recovery'&&kind==='farm')utility*=1.3;
        if(strategy?.priority==='security'&&kind==='fort')utility*=1.3;
        if(strategy?.priority==='development'&&['house','farm','lumber','quarry','mine'].includes(kind))utility*=1.13;
        if(kind==='house'&&occupancy>.85)utility+=.4;
        // First infrastructure for a new outpost is a prerequisite to further founding.
        if(Number.isInteger(s.foundedDay)&&s.foundedDay>=0){
          if(kind==='house'&&(byTownType.get(s.id+':house')||0)===0)utility=Math.max(utility,3.1);
          if(kind==='farm'&&(byTownType.get(s.id+':farm')||0)===0)utility=Math.max(utility,3.1);
        }
        // Diminishing appetite for redundant infrastructure, regardless of nation name.
        const same=byTownType.get(s.id+':'+kind)||0;
        // Emergency housing must not be suppressed by a long history of same-type houses.
        utility/=(1+(kind==='house'&&occupancy>=.90?Math.min(3,same):same)*.30);
        if(kind==='fort'){if(same>0)utility*=.15; if(reserve.stone<30)utility*=.5;}
        candidates.push({action:{type:'BUILD_FACILITY',settlementId:s.id,targetTileId:tid,buildingType:kind},utility,facility:kind});
      }
    }
    // G2: bound per-settlement candidate expansion. All upgrades use the same
    // legal action and real costs as player actions; no RNG or free production.
    const admitted=new Map();
    for(const b of townBuildings){
      if(b.settlementId!==s.id||b.status!=='ACTIVE'||b.disconnected||b.level>=maxBuildingLevel(b.typeId)||
         !g2LevelUnlocked(world,n.id,b.typeId,b.level+1)||world.tiles[b.tileId].occupiedBy!==null)continue;
      const kind=b.typeId,used=admitted.get(kind)||0;
      if(kind==='factory')continue; // V0.7J: factory upgrades are handled exclusively by the F2 industrial planner.
      if(used>=4)continue;
      if(kind==='fort'&&b.level>=3&&!atWar)continue;
      if(kind==='academy'&&n.technology.unlocked.length===g4ResearchCount())continue;
      if(kind==='barracks'&&(!barracksEligible&&!(atWar&&n.gold>(q.upkeep+q.civil.total)*4)))continue;
      const before=facilityOutput(b,world.tiles[b.tileId].terrain),after=facilityOutput({...b,level:b.level+1},world.tiles[b.tileId].terrain);
      if(!before||!after)continue;
      const price=buildPrice(kind,b.level+1);if(!price)continue;
      const gainFood=after.produced.food-before.produced.food;
      const gainHousing=after.capacity-before.capacity;
      const gainResource=Object.entries(after.produced).reduce((sum,[k,v])=>sum+(k!=='food'?Math.max(0,v-before.produced[k]):0),0);
      const localLabor=local?.utilization??1;
      let utility=.24;
      if(kind==='farm')utility=(.30+(gainFood/100)*(.5+Math.min(2.5,poorFood/Math.max(1,q.foodConsumed)*8))+
        (foodCover<1.5?1.0:0)+Math.min(.4,localFoodGap*.3))*(foodSurplus?.065:foodSecurity?.35:1);
      // F2A5: rank real, paid Lv.6–7 upgrades ahead of lower-value
      // discretionary construction in a persistent famine. No extra AP or resources.
      if(kind==='farm'&&b.level>=5&&f1c2FarmCrisis(world,n,q))
        utility+=Math.min(3.0,1.3+(gainFood/40)*.8);
      if(kind==='house')utility=((poorFood>0&&foodCover<2? .04:.35)+
        (Math.max(0,occupancy-.78)*2.1)+gainHousing/360)*(foodSecurity&&occupancy>.92?2.8:1);
      if(kind==='lumber')utility=(.30+gainResource/65*(reserve.wood<250?1.5:.45))*resourceUrgency('wood');
      if(kind==='quarry')utility=(.30+gainResource/45*(reserve.stone<300?1.4:.4))*resourceUrgency('stone');
      if(kind==='mine')utility=(.30+gainResource/28*(reserve.iron<200?1.3:.45))*resourceUrgency('iron');
      if(kind==='academy')utility=.12+(n.technology.unlocked.length<g4ResearchCount()?.9:0);
      if(kind==='workshop'&&b.level<=2){
        // E3: the real upgrade price and current readiness matter, not arbitrary
        // 180/270 wood or 3000/4600 Gold inventory gates. Procurement may plan
        // an unfunded action; execution still uses the unchanged paid price.
        const ready3=n.civilization?.era==='early_modern'&&n.civilization.stage===2&&
          ['precision_metalworking','power_transmission','mechanical_components'].every(id=>hasTech(world,n.id,id));
        const ready4=n.civilization?.era==='early_modern'&&n.civilization.stage===3&&
          ['precision_workshop_methods','scientific_instrumentation','large_machine_assembly'].every(id=>hasTech(world,n.id,id));
        const targetMissing=ready3&&!world.buildings.some(x=>x.typeId==='workshop'&&x.level===3&&
          x.status==='ACTIVE'&&!x.disconnected&&world.tiles[x.tileId]?.ownerId===n.id);
        if(b.level===1&&hasTech(world,n.id,'professional_workshops'))utility=targetMissing?3.1:1.65;
        if(b.level===2&&hasTech(world,n.id,'precision_metalworking'))utility=targetMissing?4.0:ready4?2.15:1.72;
        if(n.resources.wood<(price.resources.wood||0)||n.resources.iron<(price.resources.iron||0))
          utility*=1.05; // keep a legitimate, procurable upgrade in the candidate set
      }
      if(kind==='fort')utility=atWar?1.25:.18;
      if(kind==='barracks')utility=.20+barracksMil/150+(atWar?.25:0);
      if(kind!=='house'&&kind!=='fort')utility*=.70+.30*localLabor;
      // More output per resource and shorter completion wins ties; high-level
      // farms remain attractive when a starving nation has no spare slots.
      utility/=1+Math.log1p(price.gold/200)*.13;
      if(kind==='house'&&poorFood>0&&foodCover<1&&occupancy<.98)utility*=.08;
      if(utility<=.02)continue;
      admitted.set(kind,used+1);
      candidates.push({action:{type:'UPGRADE_FACILITY',buildingId:b.id},utility,facility:kind,fromLevel:b.level});
    }
  }

  // V0.4E military conversion: one actual redundant structure is sacrificed.
  // This does not grant free slots, population, equipment, or materials.
  if(barracksEligible){
    const targetCount=v04e1ReservedBarracks(world,n.id).length;
    if(targetCount<3){
      for(const s of world.settlements){
        if(s.ownerId!==n.id||!v04e1BarracksSlotAvailable(world,n.id,s.id))continue;
        const all=(byTown.get(s.id)||[]).filter(b=>b.typeId!=='fort'&&b.status==='ACTIVE'&&!b.disconnected&&world.tiles[b.tileId]?.occupiedBy===null);
        const countType=kind=>all.filter(b=>b.typeId===kind).length;
        // Preserve the only farm/academy/production site; convert surplus housing
        // only when housing headroom is ample.
        const options=all.filter(b=>b.level<=3&&(
          (b.typeId==='house'&&s.population<=settlementHousing(world,s)*.68&&s.population<=settlementHousing(world,s)-Math.ceil((facilityOutput(b,world.tiles[b.tileId].terrain)?.capacity||0)*(1+techBonus(world,n.id,'housing'))))||
          (['lumber','quarry','mine','academy'].includes(b.typeId)&&countType(b.typeId)>1)
        )).sort((a,b)=>(a.typeId==='house'?0:1)-(b.typeId==='house'?0:1)||a.level-b.level||a.id-b.id);
        const b=options[0];if(!b)continue;
        const act={type:'REDEVELOP_FACILITY',buildingId:b.id,buildingType:'barracks'};
        if(redevelopmentLegal(world,n.id,act))candidates.push({action:act,utility:.60+barracksMil/100*1.55+(atWar?.20:0),facility:'barracks'});
      }
    }
  }
  // V0.7B: mature worlds are often slot-saturated. Permit one carefully
  // chosen surplus house to become a guild workshop, never evict residents.
  if(workshopEligible&&hasTech(world,n.id,'urban_redevelopment')){
    for(const s of world.settlements){
      if(s.ownerId!==n.id||(byTownType.get(s.id+':workshop')||0)>0||f1c1FoodGate.stable&&!v07f1c1TownWorkshopSafe(world,s,n,q,byTown.get(s.id)||[]))continue;
      const housing=settlementHousing(world,s);
      // Only surplus *housing* needs the strict occupancy gate; converting a
      // redundant lumber/quarry/mine/academy never removes a house.
      const spare=(s.population<=housing*.68?(byTown.get(s.id)||[]):[]).filter(b=>b.typeId==='house'&&b.status==='ACTIVE'&&!b.disconnected&&b.level<=5&&
        world.dayIndex-(b.lastRedevelopedDay??-99999)>=360&&world.tiles[b.tileId]?.occupiedBy===null&&
        BUILDINGS.workshop.terrains.includes(world.tiles[b.tileId].terrain));
      spare.sort((a,b)=>a.level-b.level||a.id-b.id);
      const surplus=(byTown.get(s.id)||[]).filter(b=>v07c3SurplusConversionSafe(world,n,s,b,'workshop',q,v07c3Counts));
      const options=[...spare,...surplus].sort((a,b)=>
        v07c3WorkshopPowerPreference(world,n.id,b.tileId)-v07c3WorkshopPowerPreference(world,n.id,a.tileId)||
        (a.typeId==='house'?0:1)-(b.typeId==='house'?0:1)||a.level-b.level||a.id-b.id);
      for(const b of options){
        const action={type:'REDEVELOP_FACILITY',buildingId:b.id,buildingType:'workshop'};
        if(redevelopmentLegal(world,n.id,action)){
          candidates.push({action,facility:'workshop',utility:1.5*v07c3WorkshopPowerPreference(world,n.id,b.tileId)});break;
        }
      }
    }
  }
  // G: only replace strictly surplus facilities for a proven national shortage.
  // No house removals; each desired replacement must improve real deficits.
  if(hasTech(world,n.id,'urban_redevelopment')){
    const foodGap=Math.max(0,poorFood),foodEmergency=foodGap>Math.max(10,q.foodConsumed*.04);
    const resourceNeed=[['farm','food',foodEmergency],['lumber','wood',e3e3WoodSignal(world,n,q).needed],['quarry','stone',reserve.stone<12],['mine','iron',reserve.iron<12]];
    for(const s of world.settlements){if(s.ownerId!==n.id)continue;
      const local=q.regionalEconomy.towns.get(s.id);
      const academyCount=activeByTownType.get(s.id+':academy')||0;
      for(const b of byTown.get(s.id)||[]){
        if(b.settlementId!==s.id||b.status!=='ACTIVE'||b.disconnected||world.dayIndex-(b.lastRedevelopedDay??-99999)<360||!['academy','lumber','quarry','mine','farm','house'].includes(b.typeId))continue;
        // Keep the last academy while any new technology remains to research.
        if(b.typeId==='academy'&&academyCount<=1&&n.technology.unlocked.length<g4ResearchCount())continue;
        for(const [target,resource,needed] of resourceNeed){
          if(!needed||F2B_INDUSTRIAL_TYPES.includes(target)||target===b.typeId||!BUILDINGS[target].terrains.includes(world.tiles[b.tileId].terrain))continue;
          if(b.typeId==='farm'&&(foodEmergency||(target==='lumber'&&!e3e3FarmRetrofitSafe(world,n,s,b,q))))continue;
          if(b.typeId==='house'){
            if(target!=='farm'||!foodEmergency)continue;
            if(s.population>settlementHousing(world,s)*.78)continue;
          }
          const oldProduction=facilityOutput(b,world.tiles[b.tileId].terrain)?.produced||{};
          if((oldProduction[resource]||0)>0)continue;
          const a={type:'REDEVELOP_FACILITY',buildingId:b.id,buildingType:target};
          if(redevelopmentLegal(world,n.id,a))candidates.push({action:a,utility:target==='farm'?2.65:1.55,facility:target});
          break;
        }
        if(candidates.length>80)break;
      }
    }
  }

  // F2A4: no generic factory redevelopment candidates; one exclusive industrial planner.

  // F1C2: 4-quarter confirmed famine can rezone surplus housing with real costs;
  // does not bypass housing protection, material payment or normal construction.
  candidates.push(...f1c2FamineFarmCandidates(world,n,q,byTown,candidates));

  // E3E3: safety-gated, actually paid wood recovery in mature slot-saturated worlds.
  candidates.push(...e3e3WoodRetrofits(world,n,q,byTown,v07c3Counts));

  // V0.7C3: in a genuine deficit, allow legal conversion of *redundant*
  // non-food production, without touching the last academy or the last local
  // lumber/quarry/mine. Ordinary resource-preserving rebuild costs still apply.
  if(hasTech(world,n.id,'urban_redevelopment')&&poorFood>Math.max(10,q.foodConsumed*.04)){
    for(const s of world.settlements){
      if(s.ownerId!==n.id)continue;
      let added=0;
      for(const b of byTown.get(s.id)||[]){
        if(added>=2)break;
        if(world.tiles[b.tileId]?.occupiedBy!==null||!v07c3SurplusConversionSafe(world,n,s,b,'farm',q,v07c3Counts))continue;
        const action={type:'REDEVELOP_FACILITY',buildingId:b.id,buildingType:'farm'};
        if(!redevelopmentLegal(world,n.id,action)||candidates.some(c=>c.action.type==='REDEVELOP_FACILITY'&&c.action.buildingId===b.id&&c.action.buildingType==='farm'))continue;
        const local=q.regionalEconomy.towns.get(s.id);
        const localGap=Math.max(0,s.population*.38-(local?.produced.food||0));
        candidates.push({action,utility:3.2+Math.min(.8,localGap/Math.max(20,s.population*.38)),facility:'farm'});
        added++;
      }
    }
  }
  for(const d of world.defenses||[]){
    if(!fortRepairLegal(world,n.id,d.id))continue;
    const frac=(fortMaxHP(d)-d.hp)/fortMaxHP(d);
    candidates.push({action:{type:'REPAIR_FORT',buildingId:d.id},utility:(militaryAtWar(world,n.id)?2.3:1.25)*(.45+frac),facility:'fort'});
  }
  candidates.push(...strategicFortCandidates(world,n));
  // Independent forts are not in byTown; keep upgrading them under the same AP/cost law.
  for(const b of world.defenses||[]){
    if(b.settlementId!==null||world.tiles[b.tileId]?.ownerId!==n.id||b.status!=='ACTIVE'||b.level>=maxBuildingLevel(b.typeId)||!g2LevelUnlocked(world,n.id,b.typeId,b.level+1)||world.tiles[b.tileId].occupiedBy!==null)continue;
    candidates.push({action:{type:'UPGRADE_FACILITY',buildingId:b.id},utility:militaryAtWar(world,n.id)?1.08:.28,facility:'fort'});
  }
  // Only the most useful upgrade targets of each type reach the expensive
  // country strategy/scoring loop. Does not change action legality.
  const quotas={farm:4,house:2,lumber:1,quarry:1,mine:1,academy:1,workshop:1,fort:1,barracks:1};
  const selected=new Set(),counts={};
  const upgrades=candidates.filter(c=>c.action.type==='UPGRADE_FACILITY')
    .sort((a,b)=>b.utility-a.utility||a.action.buildingId-b.action.buildingId);
  for(const c of upgrades){const kind=c.facility;if((counts[kind]||0)>=(quotas[kind]||1))continue;
    counts[kind]=(counts[kind]||0)+1;selected.add(c.action.buildingId);}
  const final=candidates.filter(c=>c.action.type!=='UPGRADE_FACILITY'||selected.has(c.action.buildingId));
  // Only add marginal-yield hints to actual shortlisted construction candidates.
  if(recovery){
    for(const c of final){const good=V05A_FACILITY_RESOURCE[c.facility];
      if(!good||!recovery.goods[good]?.need)continue;
      const info=v05aCandidateGain(world,n,q,c,byBuildingId);
      if(info&&info.gain>0)c.v05aRecovery=info;
    }
  }
  return final;
}
function actionWeight(type,p,c){
  if(type==='BUILD_ROAD'||type==='UPGRADE_ROAD')return p.weights.development*.65+p.weights.founding*.35;
  if(type==='BUILD_FACILITY'||type==='UPGRADE_FACILITY'||type==='REPAIR_FORT'||type==='REDEVELOP_FACILITY'){
    if(c.facility==='academy')return p.weights.knowledge;
    if(c.facility==='fort')return (p.weights.development*.35+p.military.defensivePreference*.65);
    if(c.facility==='barracks')return p.military.militaryInvestment;
    return p.weights.development;
  }
  if(type==='CLAIM_TILE')return p.weights.expansion;
  if(type==='FOUND_SETTLEMENT')return p.weights.founding;
  if(type==='DEVELOP_SETTLEMENT'||type==='EXPAND_SETTLEMENT'||type==='MERGE_SETTLEMENTS')return p.weights.development;
  return p.weights.knowledge;
}
function actionScore(world,n,p,leader,c,recovery=null){
  const a=c.action,base=actionWeight(a.type,p,c)/100;
  let score=base*c.utility;
  const strategy=strategicReport(world,n.id);
  if(strategy){
    const reserve=Math.max(60,strategy.financial.military+strategy.financial.civil);
    const strained=strategy.financial.balance<0||n.gold<reserve*3;
    if(strained){
      if(['CLAIM_TILE','FOUND_SETTLEMENT','EXPAND_SETTLEMENT','BUILD_ROAD','UPGRADE_ROAD'].includes(a.type))score*=.56;
      if(c.facility==='fort'||c.facility==='barracks')score*=.64;
    }
    if(strategy.priority==='security'&&c.facility==='fort')score*=1.20;
    if(strategy.priority==='recovery'&&c.facility==='farm')score*=1.28;
    if(strategy.priority==='development'&&['DEVELOP_SETTLEMENT','BUILD_FACILITY','UPGRADE_FACILITY'].includes(a.type)&&c.facility!=='fort')score*=1.13;
    if(strategy.priority==='expansion'&&a.type==='CLAIM_TILE')score*=1.13;
  }
  if(a.type==='CLAIM_TILE'){
    if(c.developmentPressure)score*=1-.23*c.developmentPressure;
    const terrainValue=p.terrainPreference[c.terrain]/100;
    score*=.65+.5*terrainValue;
    const density=((c.adjacentOwned||1)-1)/3;
    const exploration=(c.neutral||0)/3;
    const frontierBias=(p.behavior.frontierPreference-50)/50;
    // No double neutral-neighbor bonus. Frontier preference changes SHAPE, not physical costs.
    score*=1+.29*density+.09*frontierBias*(exploration-density);
    // Repeated one-tile-wide extensions are poor borders, unless terrain forces a pass.
    // Expansionist profiles still explore; no candidate is made illegal.
    if(c.adjacentOwned===1&&c.tendrilDepth>=2){
      const severity=c.naturalPassage?.045:.095;
      score*=Math.max(.27,1-severity*Math.min(5,c.tendrilDepth-1));
    }
    // AI considers actual shared-rule expense; the player pays the same cost.
    score*=Math.sqrt(18/c.claimCost);
    score*=1-((100-p.behavior.riskTolerance)/100)*(.11*(c.threats||0)+.15*(c.terrain==='mountain'?1:0));
    score*=.8+leader.ambition/260;
  }else if(a.type==='FOUND_SETTLEMENT'){
    score*=.9+leader.administration/700;
    score*=1+.60*(c.developmentPressure||0);
  }
  else if(a.type==='DEVELOP_SETTLEMENT'||a.type==='EXPAND_SETTLEMENT')score*=.82+leader.administration/370;
  if(a.type==='EXPAND_SETTLEMENT'){
    // Shared actual Gold cost discourages narrow / remote tendrils for AI and PLAYER alike.
    score*=Math.sqrt(15/(c.shape?.gold||15));
  }
  else if(a.type==='BUILD_FACILITY'||a.type==='UPGRADE_FACILITY'||a.type==='REPAIR_FORT'||a.type==='REDEVELOP_FACILITY'){
    score*=.82+leader.administration/370;
    if(c.facility==='fort'){const price=getNationActionCost(world,n.id,a);if(price)score*=Math.sqrt(150/Math.max(150,price.gold));}
  }
  else if(a.type==='INVEST_KNOWLEDGE')score*=.92+leader.administration/700;
  // Recovery priorities are resource-driven, not nation-name driven.
  // Recover farming capacity before accumulating optional roads or distant claims.
  if(a.type==='BUILD_FACILITY'||a.type==='UPGRADE_FACILITY'||a.type==='REDEVELOP_FACILITY'){
    const q=n.lastQuarter||projectedQuarter(world,n);
    if(c.facility==='farm'&&(n.foodPressure<.85||n.resources.food<Math.max(10,q.foodConsumed||0)))score*=2.0;
    if(c.f1c2FamineRecovery)score*=1.35;
    if(c.facility==='quarry'&&n.resources.stone<5)score*=1.45;
    if(c.facility==='lumber'&&n.resources.wood<7)score*=1.4;
    if(c.e3e3WoodRecovery&&e3e3WoodSignal(world,n).needed)score*=1.35;
  }
  // F3: a severed historical import route only changes actual construction
  // priorities when the corresponding REAL domestic stock is low.
  const exposure=tradeDependencyReport(world,n.id);
  if(exposure&&(a.type==='BUILD_FACILITY'||a.type==='UPGRADE_FACILITY')){
    const resource={farm:'food',lumber:'wood',quarry:'stone',mine:'iron'}[c.facility];
    const g=resource&&exposure.goods[resource];
if(g&&g.blockedImports>0&&g.shortage>0){
      score*=1+Math.min(.65,g.importReliance*g.blockedShare*g.shortage*1.5);
    }
  }
  // V0.5A: real shortages and positive output gain raise priority without
  // fabricating construction opportunities or bypassing legal/price checks.
  const improvement=c.v05aRecovery,need=improvement&&recovery?.goods?.[improvement.good];
  if(need?.need&&improvement.gain>0){
    const relative=improvement.gain/Math.max(1,need.consumed||need.threshold);
    score*=1+Math.min(.75,need.severity*(.42+Math.min(.33,relative*1.2)));
  }
  // B4A: genuine existing economy candidates receive priority in recovery; no free projects.
  const survival=n.survival?.state||'NORMAL';
  if(survival!=='NORMAL'&&['BUILD_FACILITY','UPGRADE_FACILITY','REDEVELOP_FACILITY'].includes(a.type)){
    if(['farm','house','lumber','quarry'].includes(c.facility))score*=survival==='CRISIS'?1.85:1.40;
    if(c.facility==='barracks')score*=survival==='CRISIS'?1.15:1.25;
  }
  // Variable noise only breaks near-ties and uses the saved simulation RNG.
  return score*(.965+rand(world)*.07);
}
// V0.6D2A — Political Movements V1. Observation only: never calls rand(), never alters SIM decisions.
const D2A_SCHEMA=1,D2A_SCORE_MAX=1000,D2A_HISTORY_LIMIT=60,D2A_TREND_LIMIT=12;
const D2A_TYPES=Object.freeze({ECONOMIC:{label:'경제 개혁',icon:'₩',color:'#EBC76C'},SAFETY:{label:'안전·반전',icon:'✚',color:'#66C6EA'},AUTONOMY:{label:'지역 자치',icon:'◎',color:'#B791E9'},INDEPENDENCE:{label:'독립',icon:'⚑',color:'#E974A1'},REUNIFICATION:{label:'재통합',icon:'↶',color:'#EFA775'}});
const D2A_TYPE_ORDER=Object.freeze(['REUNIFICATION','INDEPENDENCE','AUTONOMY','ECONOMIC','SAFETY']);
const d2aClamp=n=>Math.max(0,Math.min(D2A_SCORE_MAX,Math.round(n)));
const d2aInt=n=>Math.max(0,Math.round(n));
const d2aYearDay=d=>Math.floor(d/120)+1;
function d2aNewGroup(day=0){return {lastUpdatedDay:day,streaks:{ECONOMIC:0,SAFETY:0,AUTONOMY:0,INDEPENDENCE:0,REUNIFICATION:0},movement:null,cooldownUntil:0};}
function d2aInitWorld(w){
  w.politicalMovements={schema:D2A_SCHEMA,lastUpdatedDay:w.dayIndex,events:[],byNation:{}};
  for(const n of w.nations)w.politicalMovements.byNation[n.id]=[];
  for(const s of w.settlements)d2aInitSettlement(w,s);
  return w;
}
function d2aInitSettlement(w,s){s.politicalMovementGroups={};for(const [id,count] of Object.entries(s.culturePopulation||{}))if(count>0)s.politicalMovementGroups[id]=d2aNewGroup(w.dayIndex);}
function d2aSyncGroups(w,s){
  const groups=s.politicalMovementGroups||(s.politicalMovementGroups={});
  for(const id of Object.keys(groups))if(!(s.culturePopulation?.[id]>0))delete groups[id];
  for(const [id,count] of Object.entries(s.culturePopulation||{}))if(count>0&&!groups[id])groups[id]=d2aNewGroup(w.dayIndex);
  for(const [id,g] of Object.entries(groups))if(g.movement){
    g.movement.supporters=Math.min(g.movement.supporters,s.culturePopulation[id]||0);
    g.movement.authorityNationId=s.ownerId;
  }
}
function d2aEvent(w,s,id,type,kind,reason){
  const list=w.politicalMovements.events;
  list.push({dayIndex:w.dayIndex,settlementId:s.id,cultureId:id,type,kind,reason,ownerNationId:s.ownerId});
  if(list.length>D2A_HISTORY_LIMIT)list.splice(0,list.length-D2A_HISTORY_LIMIT);
}
function d2aHistoricalClaim(w,s,id){
  const owner=w.nations[s.ownerId],founder=w.nations[s.founderNationId];
  const historic= s.founderNationId!==s.ownerId || (s.formerCapitalOf||[]).some(n=>n!==s.ownerId);
  const foreign=Boolean(owner&&id!==owner.primaryCultureId);
  const claim=founder?.active&&founder.id!==owner?.id&&founder.primaryCultureId===id?founder.id:
    (s.formerCapitalOf||[]).find(nid=>nid!==s.ownerId&&w.nations[nid]?.active&&w.nations[nid]?.primaryCultureId===id)??null;
  return {historic,foreign,claim};
}
function d2aQualifiers(w,s,id,gr){
  const g=s.civilGrievances?.groups?.[id],p=s.culturePopulation?.[id]||0;
  const o={ECONOMIC:false,SAFETY:false,AUTONOMY:false,INDEPENDENCE:false,REUNIFICATION:false};
  if(p<100||!g)return o;
  const {historic,foreign,claim}=d2aHistoricalClaim(w,s,id),safe=g.safety,eco=g.economy,govern=g.governance;
  o.ECONOMIC=eco>=600;
  o.SAFETY=safe>=600;
  o.AUTONOMY=foreign&&historic&&(safe>=600||govern>=600);
  o.INDEPENDENCE=foreign&&historic&&(safe>=800||govern>=800);
  o.REUNIFICATION=foreign&&historic&&claim!==null&&(safe>=600||govern>=600);
  return o;
}
function d2aTypeScore(w,s,id,type){
  const g=s.civilGrievances.groups[id];
  return type==='ECONOMIC'?g.economy:type==='SAFETY'?g.safety:
    Math.max(g.safety,g.governance);
}
function d2aGoal(w,s,id,type){const claim=d2aHistoricalClaim(w,s,id).claim;
  return type==='REUNIFICATION'?claim:null;
}
function d2aQuarter(w){
  if(!w.politicalMovements)return;
  for(const s of w.settlements){
    d2aSyncGroups(w,s);
    for(const [id,group] of Object.entries(s.politicalMovementGroups)){
      if(group.lastUpdatedDay>=w.dayIndex)continue;
      const pop=s.culturePopulation[id]||0,qual=d2aQualifiers(w,s,id,group);
      for(const type of D2A_TYPE_ORDER)group.streaks[type]=qual[type]?Math.min(10000,(group.streaks[type]||0)+1):0;
      let choice=null;
      for(const type of D2A_TYPE_ORDER){
        if(qual[type]&&group.streaks[type]>=(type==='INDEPENDENCE'?8:4)){choice=type;break;}
      }
      const previous=group.movement;
      if(!previous&&choice&&w.dayIndex>=group.cooldownUntil){
        const pressure=d2aTypeScore(w,s,id,choice);
        const goalCount=Math.round(pop*(100+Math.max(0,pressure-600))/1000);
        if(goalCount>=20){
          group.movement={type:choice,foundedDay:w.dayIndex,lastChangedDay:w.dayIndex,supporters:0,
            organization:0,radicalization:0,authorityNationId:s.ownerId,claimNationId:d2aGoal(w,s,id,choice),
            lowPressureQuarters:0,reason:'sustained_'+choice};
          d2aEvent(w,s,id,choice,'FORMED','지속적인 불만으로 형성');
        }
      }
      const m=group.movement;
      if(!m){group.lastUpdatedDay=w.dayIndex;continue;}
      // Reevaluate only once per year; switching preserves organization and supporter accounting.
      if(choice&&choice!==m.type&&w.dayIndex-m.lastChangedDay>=120){
        const old=m.type;m.type=choice;m.lastChangedDay=w.dayIndex;m.claimNationId=d2aGoal(w,s,id,choice);
        m.reason='shift_'+old+'_to_'+choice;d2aEvent(w,s,id,choice,'CHANGED',old+' → '+choice);
      }
      m.authorityNationId=s.ownerId;
      if(m.type==='REUNIFICATION')m.claimNationId=d2aGoal(w,s,id,m.type);
      else m.claimNationId=null;
      const active=qual[m.type];
      const pressure=active?d2aTypeScore(w,s,id,m.type):0;
      const target=active?Math.min(pop,Math.round(pop*(100+Math.max(0,pressure-600))/1000)):0;
      const supporterStep=target-m.supporters;
      const shift=supporterStep===0?0:Math.sign(supporterStep)*Math.max(1,Math.round(Math.abs(supporterStep)*.25));
      m.supporters=Math.max(0,Math.min(pop,m.supporters+shift));
      const supportRatio=m.supporters/Math.max(1,pop);
      const ageQuarters=Math.max(1,Math.floor((w.dayIndex-m.foundedDay)/30)+1);
      const orgTarget=active?d2aClamp(120+supportRatio*1100+Math.min(240,ageQuarters*7)):0;
      const orgGap=orgTarget-m.organization;
      m.organization=d2aClamp(m.organization+Math.max(-40,Math.min(40,Math.round(orgGap*.22))));
      const radTarget=active?d2aClamp(Math.max(0,pressure-700)*1.65+Math.min(220,ageQuarters*4)+
        (['INDEPENDENCE','REUNIFICATION'].includes(m.type)?70:0)):0;
      const radGap=radTarget-m.radicalization;
      m.radicalization=d2aClamp(m.radicalization+Math.max(-28,Math.min(28,Math.round(radGap*.20))));
      if(active)m.lowPressureQuarters=0;else m.lowPressureQuarters=Math.min(10000,m.lowPressureQuarters+1);
      // Organizations do not vanish the moment the pressure ends.
      if(m.lowPressureQuarters>=8&&m.organization<=100&&m.supporters<=Math.max(2,Math.floor(pop*.002))){
        d2aEvent(w,s,id,m.type,'DISSOLVED','지속적인 압박 완화');
        group.movement=null;group.cooldownUntil=w.dayIndex+120;
      }
      group.lastUpdatedDay=w.dayIndex;
    }
  }
  d2aNationHistory(w);
  w.politicalMovements.lastUpdatedDay=w.dayIndex;
}
function d2aNationHistory(w){
  const agg=w.nations.map(()=>({movements:0,supporters:0,highOrganization:0,highRadicalization:0}));
  for(const s of w.settlements)for(const state of Object.values(s.politicalMovementGroups||{})){
    const m=state.movement;if(!m)continue;const a=agg[s.ownerId];if(!a)continue;
    a.movements++;a.supporters+=m.supporters;
    if(m.organization>=600)a.highOrganization++;
    if(m.radicalization>=600)a.highRadicalization++;
  }
  for(const n of w.nations){
    const arr=w.politicalMovements.byNation[n.id]||(w.politicalMovements.byNation[n.id]=[]);
    const entry={dayIndex:w.dayIndex,...agg[n.id]};
    if(arr.length&&arr.at(-1).dayIndex===w.dayIndex)arr[arr.length-1]=entry;else arr.push(entry);
    if(arr.length>D2A_TREND_LIMIT)arr.splice(0,arr.length-D2A_TREND_LIMIT);
  }
}
function d2aTransfer(w,s){if(!s.politicalMovementGroups)return;
  for(const state of Object.values(s.politicalMovementGroups))if(state.movement){
    const m=state.movement;m.authorityNationId=s.ownerId;
    if(m.type==='REUNIFICATION')m.claimNationId=null; // next quarterly reassessment resolves new claim
  }
}
/** Called before population pools merge, so both weights still represent distinct pools. */
function d2aMerge(w,primary,secondary){
  d2aSyncGroups(w,primary);d2aSyncGroups(w,secondary);
  for(const [id,pop] of Object.entries(secondary.culturePopulation||{})){
    if(pop<=0)continue;
    const from=secondary.politicalMovementGroups?.[id];if(!from)continue;
    const left=primary.politicalMovementGroups[id],lp=primary.culturePopulation[id]||0;
    if(!left){primary.politicalMovementGroups[id]=structuredClone(from);continue;}
    const total=lp+pop;
    for(const type of D2A_TYPE_ORDER)left.streaks[type]=Math.round(((left.streaks[type]||0)*lp+(from.streaks[type]||0)*pop)/total);
    if(left.movement&&from.movement&&left.movement.type===from.movement.type&&left.movement.claimNationId===from.movement.claimNationId){
      const a=left.movement,b=from.movement;
      a.supporters=Math.min(total,a.supporters+b.supporters);
      a.organization=Math.round((a.organization*lp+b.organization*pop)/total);
      a.radicalization=Math.round((a.radicalization*lp+b.radicalization*pop)/total);
      a.foundedDay=Math.min(a.foundedDay,b.foundedDay);
      a.lastChangedDay=Math.max(a.lastChangedDay,b.lastChangedDay);
      a.lowPressureQuarters=Math.min(a.lowPressureQuarters,b.lowPressureQuarters);
    }else if(from.movement&&(!left.movement||from.movement.supporters>left.movement.supporters)){
      left.movement=structuredClone(from.movement);
    }
    if(left.movement)left.movement.supporters=Math.min(total,left.movement.supporters);
    left.cooldownUntil=Math.max(left.cooldownUntil,from.cooldownUntil);
    left.lastUpdatedDay=Math.min(left.lastUpdatedDay,from.lastUpdatedDay);
  }
}
function d2aMovementsAt(w,s){return Object.entries(s?.politicalMovementGroups||{}).flatMap(([id,g])=>g.movement?[{cultureId:id,population:s.culturePopulation[id]||0,settlement:s,...g.movement}]:[]);}
function d2aValidate(w,fail){
  const state=w.politicalMovements;
  if(!state||state.schema!==D2A_SCHEMA||!Number.isSafeInteger(state.lastUpdatedDay)||state.lastUpdatedDay>w.dayIndex||!Array.isArray(state.events)||state.events.length>D2A_HISTORY_LIMIT||!state.byNation)fail('D2A 정치 운동 기본 상태');
  const validType=x=>Object.hasOwn(D2A_TYPES,x);
  for(const e of state.events)if(!Number.isSafeInteger(e.dayIndex)||e.dayIndex>w.dayIndex||!validType(e.type)||!['FORMED','CHANGED','DISSOLVED'].includes(e.kind))fail('D2A 운동 사건 기록');
  for(const n of w.nations){const arr=state.byNation[n.id];if(!Array.isArray(arr)||arr.length>D2A_TREND_LIMIT||arr.some(h=>!Number.isSafeInteger(h.dayIndex)||h.dayIndex>w.dayIndex||['movements','supporters','highOrganization','highRadicalization'].some(k=>!Number.isSafeInteger(h[k])||h[k]<0)))fail('D2A 국가별 운동 이력');}
  for(const s of w.settlements){
    const groups=s.politicalMovementGroups;if(!groups||typeof groups!=='object')fail('D2A 정착지 운동 상태');
    const populationKeys=Object.keys(s.culturePopulation||{}).filter(id=>s.culturePopulation[id]>0).sort();
    if(JSON.stringify(Object.keys(groups).sort())!==JSON.stringify(populationKeys))fail('D2A 문화집단 누락');
    for(const [id,g] of Object.entries(groups)){
      if(!Number.isSafeInteger(g.lastUpdatedDay)||g.lastUpdatedDay>w.dayIndex||!Number.isSafeInteger(g.cooldownUntil)||g.cooldownUntil<0||
        D2A_TYPE_ORDER.some(type=>!Number.isSafeInteger(g.streaks?.[type])||g.streaks[type]<0||g.streaks[type]>10000))fail('D2A 지속성 기록');
      const m=g.movement;if(!m)continue;
      if(!validType(m.type)||m.authorityNationId!==s.ownerId||!Number.isSafeInteger(m.foundedDay)||m.foundedDay>w.dayIndex||
        !Number.isSafeInteger(m.lastChangedDay)||m.lastChangedDay>w.dayIndex||
        !Number.isSafeInteger(m.supporters)||m.supporters<0||m.supporters>s.culturePopulation[id]||
        !Number.isSafeInteger(m.organization)||m.organization<0||m.organization>1000||
        !Number.isSafeInteger(m.radicalization)||m.radicalization<0||m.radicalization>1000||
        !Number.isSafeInteger(m.lowPressureQuarters)||m.lowPressureQuarters<0||
        m.claimNationId!==null&&(!w.nations[m.claimNationId]||m.type!=='REUNIFICATION'))fail('D2A 운동 인구·목표');
    }
  }
  return true;
}

// V0.6D2A — canvas overlay, map controls, and read-only panels.
const D2A_OVERLAY_METRICS=Object.freeze({support:'지지율',organization:'조직력',radicalization:'급진화'});
function d2aGetOverlayData(renderer){
  const w=renderer.world;if(!w)return {bySettlement:new Map(),markers:[]};
  const key=[w.dayIndex,w.changeSeq,w.settlements.length,renderer.d2aTypeFilter].join(':');
  if(renderer.d2aOverlayCache?.world===w&&renderer.d2aOverlayCache.key===key)return renderer.d2aOverlayCache;
  const bySettlement=new Map(),markers=[];
  for(const s of w.settlements){
    const all=d2aMovementsAt(w,s).filter(m=>renderer.d2aTypeFilter==='all'||m.type===renderer.d2aTypeFilter);
    if(!all.length)continue;
    all.sort((a,b)=>b.supporters-a.supporters||b.organization-a.organization||a.cultureId.localeCompare(b.cultureId));
    const top=all[0],supporters=all.reduce((n,m)=>n+m.supporters,0);
    const entry={settlement:s,top,movements:all,supporters,population:s.population};
    bySettlement.set(s.id,entry);markers.push(entry);
  }
  const result={world:w,key,bySettlement,markers};renderer.d2aOverlayCache=result;return result;
}
function d2aDrawOverlay(ctx,scale,ox,oy,cw,ch,phase){
  if(!this.d2aEnabled||!this.world||this.d2aStyle==='off')return;
  const showArea=(this.d2aStyle==='combined'||this.d2aStyle==='area');
  const showPins=(this.d2aStyle==='combined'||this.d2aStyle==='pins');
  if(phase==='area'&&!showArea||phase==='pins'&&!showPins)return;
  const world=this.world,{bySettlement,markers}=d2aGetOverlayData(this);
  if(!markers.length)return;
  ctx.save();ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.clip();
  if(phase==='area'){
    // Settlement-based area, preserving political nation fills, borders and infrastructure.
    ctx.translate(ox,oy);ctx.scale(scale,scale);
    const mode=this.d2aMetric||'support';
    for(const t of world.tiles){
      if(t.settlementId===null)continue;
      const e=bySettlement.get(t.settlementId);if(!e)continue;
      const m=e.top,v=mode==='support'?e.supporters/Math.max(1,e.population)*1000:m[mode];
      const alpha=Math.min(.35,Math.max(.065,.055+v/1000*.29))*Math.max(.2,this.d2aIntensity);
      if(alpha<=.015)continue;
      // rgba() with parseable source color, to avoid compositing over dark-mode country labels.
      const rgb=D2A_TYPES[m.type].color.match(/\w\w/g).map(h=>parseInt(h,16));
      ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
      ctx.fillRect(t.x+.035,t.y+.035,.93,.93);
      if(this.d2aMetric==='organization'&&m.organization>=600){
        ctx.save();ctx.beginPath();ctx.rect(t.x+.05,t.y+.05,.90,.90);ctx.clip();
        ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},.36)`;ctx.lineWidth=.045;
        for(let k=-1;k<2;k++){ctx.beginPath();ctx.moveTo(t.x+k,t.y+1);ctx.lineTo(t.x+k+1,t.y);ctx.stroke();}
        ctx.restore();
      }
    }
  }else{
    const compact=scale<19,used=new Set(),markerSize=compact?7:scale<32?8.5:10.5;
    for(const e of markers){
      const tile=world.tiles[e.settlement.coreTileId];if(!tile)continue;
      const x=ox+(tile.x+.78)*scale,y=oy+(tile.y+.20)*scale;
      if(x<-20||y<-20||x>cw+20||y>ch+20)continue;
      if(compact){const cell=Math.floor(x/17)+':'+Math.floor(y/17);if(used.has(cell))continue;used.add(cell);}
      const m=e.top,kind=D2A_TYPES[m.type],r=markerSize;
      ctx.fillStyle='rgba(8,21,34,.93)';ctx.strokeStyle='#EAF4F2';ctx.lineWidth=1.1;
      ctx.beginPath();ctx.arc(x,y,r+1.4,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle=kind.color;ctx.beginPath();ctx.arc(x,y,r-1.2,0,Math.PI*2);ctx.fill();
      const progress=m.organization/1000;
      ctx.strokeStyle='#FFFFFF';ctx.lineWidth=Math.max(1.5,r*.19);
      ctx.beginPath();ctx.arc(x,y,r+2.1,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke();
      ctx.fillStyle='#102331';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${Math.round(r*1.22)}px system-ui,sans-serif`;
      ctx.fillText(kind.icon,x,y+.5);
      if(m.radicalization>=600){ctx.fillStyle='#F36D69';ctx.strokeStyle='#18212D';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(x+r,y-r,3.4,0,2*Math.PI);ctx.fill();ctx.stroke();}
      if(e.movements.length>1&&!compact){ctx.fillStyle='#112634';ctx.strokeStyle='#F1ECE0';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x-r+1,y+r-1,5,0,2*Math.PI);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.font='700 8px sans-serif';ctx.fillText(String(e.movements.length),x-r+1,y+r-1);}
    }
  }
  ctx.restore();
}
function d2aTrack(label,value,color){
  return make('div',{class:'d2a-meter'},[
    make('div',{class:'d2a-meter-label'},[make('span',{text:label}),make('strong',{text:(value/10).toFixed(1)})]),
    make('div',{class:'d2a-meter-base'},[make('div',{class:'d2a-meter-fill',style:{width:(value/10)+'%',background:color}})])
  ]);
}
function d2aMovementCard(w,entry,includeSettlement=false){
  const m=entry,kind=D2A_TYPES[m.type],s=m.settlement,cul=w.cultures.find(c=>c.id===m.cultureId);
  const card=make('div',{class:'d2a-movement-card'});
  card.append(make('div',{class:'d2a-movement-title'},[
    make('span',{class:'d2a-movement-icon',text:kind.icon,style:{background:kind.color}}),
    make('div',{},[make('strong',{text:kind.label+(includeSettlement?' · '+settlementDisplayName(w,s):'')}),
      make('small',{text:`${cul?.name||m.cultureId} 문화 · ${number.format(m.supporters)}명 / ${number.format(m.population)}명 (${m.population?(m.supporters/m.population*100).toFixed(1):'0'}%)`})])
  ]));
  card.append(d2aTrack('조직력',m.organization,'#79c5b3'),d2aTrack('급진화',m.radicalization,'#e69b80'));
  card.append(make('div',{class:'muted-line',text:`${d2aYearDay(m.foundedDay)}년 형성 · 통치: ${w.nations[m.authorityNationId]?.name||'—'}${m.claimNationId!==null?' · 재통합 대상: '+(w.nations[m.claimNationId]?.name||'—'):''}`}));
  if(includeSettlement){const btn=make('button',{class:'d2a-jump',type:'button',text:'지도에서 찾기'});
    btn.addEventListener('click',()=>{setActiveTab('map');selectTile(s.coreTileId);});card.append(btn);}
  return card;
}
function d2aInspectorPanel(w,s){
  const movements=d2aMovementsAt(w,s),section=make('section',{class:'d2a-panel'});
  section.append(make('h3',{text:`⚑ D2A · 정치 운동 (${movements.length})`}));
  if(movements.length){for(const m of movements.sort((a,b)=>b.supporters-a.supporters))section.append(d2aMovementCard(w,m));}
  else section.append(make('div',{class:'muted-line',text:'현재 활동 중인 정치 운동이 없습니다. 불만이 지속되면 형성될 수 있습니다.'}));
  return section;
}
function d2aNationPanel(w,n){
  const movements=w.settlements.filter(s=>s.ownerId===n.id).flatMap(s=>d2aMovementsAt(w,s)),sum=movements.reduce((x,m)=>x+m.supporters,0),section=make('section',{class:'overview-section d2a-nation-panel'});
  section.append(make('h3',{text:'V0.6D2A · 정치 운동'}),make('div',{class:'muted-line',text:`활동 중 ${movements.length}개 · 지지자 ${number.format(sum)}명 · 조직력 60 이상 ${movements.filter(m=>m.organization>=600).length}개 · 급진화 60 이상 ${movements.filter(m=>m.radicalization>=600).length}개`}));
  const categories=make('div',{class:'d2a-type-counts'});
  for(const [type,kind] of Object.entries(D2A_TYPES)){
    const c=movements.filter(m=>m.type===type).length;
    if(c)categories.append(make('span',{style:{borderColor:kind.color},text:`${kind.icon} ${kind.label} ${c}`}));
  }
  section.append(categories);
  if(!movements.length)section.append(make('div',{class:'muted-line',text:'현재 조직화된 정치 운동은 없습니다.'}));
  else for(const entry of movements.sort((a,b)=>b.supporters-a.supporters||a.settlement.id-b.settlement.id).slice(0,24))section.append(d2aMovementCard(w,entry,true));
  const history=w.politicalMovements?.byNation?.[n.id]||[];
  if(history.length){const d=make('details',{class:'d2a-trend'},[make('summary',{text:`최근 ${history.length}분기 정치 운동 변화 보기`})]);
    for(const h of history.slice().reverse())d.append(make('div',{class:'muted-line',text:`${d2aYearDay(h.dayIndex)}년 ${Math.floor(h.dayIndex%120/30)+1}분기 · 운동 ${h.movements}개 · 지지 ${number.format(h.supporters)}명 · 강한 조직 ${h.highOrganization}개`}));
    section.append(d);
  }
  return section;
}
function d2aWireMapControls(map){
  const $=id=>document.getElementById(id);
  const enabled=$('d2aEnabled'),style=$('d2aStyle'),metric=$('d2aMetric'),type=$('d2aTypeFilter'),intensity=$('d2aIntensity');
  const apply=()=>{
    map.d2aEnabled=enabled.checked;map.d2aStyle=style.value;map.d2aMetric=metric.value;
    map.d2aTypeFilter=type.value;map.d2aIntensity=Number(intensity.value)/100;
    map.d2aOverlayCache=null;map.requestDraw();
    const summary=$('d2aOverlayStatus');if(summary)summary.textContent=!map.d2aEnabled?'정치 운동 숨김':`정치 운동 · ${style.selectedOptions[0].textContent} · ${metric.selectedOptions[0].textContent}`;
  };
  for(const e of [enabled,style,metric,type,intensity])e.addEventListener('input',apply);
  apply();
}

// -- end V0.6D2A module --
// V0.6D2B1 — Rebel Army Formations & Local Combat V1.
// Militia share the existing Army/UnitGroup, exposure, armor, morale and formation-XP calculations.
// Uprising armies have negative IDs and never enter w.armies or national war/diplomacy machinery.
const D2B_SCHEMA=3,D2B_HISTORY_LIMIT=90,D2B_MIN_SUPPORTERS=300,D2B_COOLDOWN_DAYS=600;
const D2B_INITIAL_RATE=.08,D2C_INITIAL_CAP_RATE=.07,D2B_REINFORCE_RATE=.01,D2C_LIFETIME_CAP_RATE=.15;
const d2bSize=f=>f.militia.reduce((v,d)=>v+manpower(d.army),0);
function d2bInitWorld(w){w.uprisings={schema:D2B_SCHEMA,nextId:1,nextRebelArmyId:1,lastQuarterDay:w.dayIndex,active:[],history:[],mobilized:0,returned:0,killedMilitia:0,killedGovernment:0,promoted:0,founded:0,reconquered:0,independent:0,foundingChecks:0,foundingBlocked:{}};}
function d2bLog(w,f,kind,reason){
 const h=w.uprisings.history;h.push({dayIndex:w.dayIndex,id:f.id,kind,type:f.type,authorityNationId:f.authorityNationId,claimNationId:f.claimNationId,men:d2bSize(f),reason});
 if(h.length>D2B_HISTORY_LIMIT)h.splice(0,h.length-D2B_HISTORY_LIMIT);
 event(w,`봉기 #${f.id}: ${reason}`,'world');
}
function d2bMovementAt(w,d){const s=w.settlements.find(s=>s.id===d.settlementId);return s?.politicalMovementGroups?.[d.cultureId]?.movement||null;}
function d2bPrep(w,s,id,m){
 const p=m.d2bPrep;
 if(!p||p.type!==m.type||p.authorityNationId!==s.ownerId||p.claimNationId!==m.claimNationId||w.dayIndex-p.dayIndex>30){
   m.d2bPrep={type:m.type,authorityNationId:s.ownerId,claimNationId:m.claimNationId,quarters:0,dayIndex:w.dayIndex};
 }
 return m.d2bPrep;
}
function d2bIsQualified(w,s,id,m){
 return (m.type==='INDEPENDENCE'||m.type==='REUNIFICATION')&&
   (m.type!=='REUNIFICATION'||w.nations[m.claimNationId]?.active)&&
   m.organization>=800&&m.radicalization>=700&&m.supporters>=D2B_MIN_SUPPORTERS&&
   s.population>=30&&(s.culturePopulation[id]||0)>=D2B_MIN_SUPPORTERS&&w.nations[s.ownerId]?.active&&
   w.tiles[s.coreTileId]?.occupiedBy===null;
}
function d2bFactionKey(owner,type,claim,culture){return `${owner}:${type}:${claim===null?'none':claim}:${culture}`;}
function d2bDetachCivilians(w,s,id,count){
 if(count<1||count>(s.culturePopulation[id]||0))throw Error('D2B1 모집 대상 문화 인구 부족');
 s.culturePopulation[id]-=count;if(s.culturePopulation[id]===0)delete s.culturePopulation[id];
 s.population-=count;d1bSyncGroups(s,w);d2aSyncGroups(w,s);refreshSettlementLevel(s);w.changeSeq++;
}
function d2bUnit(id,people,culture){
 const u={id,typeId:'levy',weaponId:'basic_arms',armorId:'none',manpower:people,allocationWeight:people,
   culturePopulation:d1CulturePool(culture,people),trainingRequirementDays:0,trainedManpower:people,
   trainingBatches:[],emergencySpecialist:true,training:100};
 d1cEnsureUnit(u);return u;
}
function d2bNewDetachment(w,f,s,id,count){
 const armyId=-(w.uprisings.nextRebelArmyId++),front=Math.max(1,Math.ceil(count*.8)),reserve=count-front;
 const frontUnit=d2bUnit(`uprising-${f.id}-${-armyId}-front`,front,id);
 const units=[frontUnit],deployment={front:[frontUnit.id],rear:[],back:[],reserve:[]};
 if(reserve){const u=d2bUnit(`uprising-${f.id}-${-armyId}-reserve`,reserve,id);units.push(u);deployment.reserve.push(u.id);}
 const army={id:armyId,nationId:null,affiliation:{kind:'UPRISING',uprisingId:f.id},commanderId:null,tileId:s.coreTileId,
   morale:55,units,deployment,status:'READY',order:null,operation:null,needsOrders:false,nextMoveDay:w.dayIndex,
   engagementId:null,regroupUntil:0,formationExperience:b4aNewExperience(w.dayIndex),c6CreatedDay:w.dayIndex,
   supplied:true,unsuppliedDays:0,supplyMultiplier:1,supplyCheckedDay:w.dayIndex};
 return {settlementId:s.id,cultureId:id,tileId:s.coreTileId,men:count,initialMen:count,mobilizedTotal:count,
   localControl:0,suppressedQuarters:0,equipment:'IMPROVISED',army,
   engagement:{round:0,lastDay:null,history:[],lastResult:'NOT_ENGAGED'}};
}
// Stable Hamilton apportionment. All regions receive their share before any civilians are detached.
function d2bAllocate(groups,rate){
 return [...groups].sort((a,b)=>a.s.id-b.s.id||a.id.localeCompare(b.id)).map(g=>{
   const base=g.s.culturePopulation[g.id]||0;
   const cap=Math.floor(base*D2C_INITIAL_CAP_RATE);
   const count=Math.min(base,cap,Math.floor(g.m.supporters*rate));
   return {...g,count,baselinePopulation:base,initialCap:cap,lifetimeCap:Math.floor(base*D2C_LIFETIME_CAP_RATE)};
 }).filter(g=>g.count>0);
}
function d2bReturnCivilians(w,d){
 const available=manpower(d.army);if(available<=0){d.men=0;return 0;}
 const s=w.settlements.find(x=>x.id===d.settlementId);if(!s)throw Error('D2B1 민병대 귀환 정착지 누락');
 s.population+=available;d1CultureAdd(s.culturePopulation,d1CulturePool(d.cultureId,available));
 for(const u of d.army.units){u.manpower=0;u.trainedManpower=0;u.trainingBatches=[];u.culturePopulation={};c3RefreshUnit(u);}
 d.men=0;d.mobilizationLedger.returnedTotal+=available;
 const faction=w.uprisings.active.find(f=>f.militia.includes(d));if(faction)faction.returnedTotal+=available;
 w.uprisings.returned+=available;
 d1bSyncGroups(s,w);d2aSyncGroups(w,s);refreshSettlementLevel(s);w.changeSeq++;
 return available;
}
function d2bEnd(w,f,reason){
 let returned=0;
 for(const d of f.militia){returned+=d2bReturnCivilians(w,d);
   const s=w.settlements.find(s=>s.id===d.settlementId),state=s?.politicalMovementGroups?.[d.cultureId];
   if(state?.movement)state.movement.d2bCooldownUntil=Math.max(state.movement.d2bCooldownUntil||0,w.dayIndex+D2B_COOLDOWN_DAYS);
 }
 d2bLog(w,f,'ENDED',`${reason} · 당일 ${returned}명 귀환 · 봉기 전체 귀환 ${f.returnedTotal}명`,
  );
 const last=w.uprisings.history.at(-1);if(last){last.endReason=reason;last.mobilizedTotal=f.mobilizedTotal;
   last.killedTotal=f.lostMilitia;last.returnedTotal=f.returnedTotal;last.maxLocalControl=Math.max(...f.militia.map(d=>d.maxLocalControl||0));
   last.totalFullControlQuarters=f.militia.reduce((n,d)=>n+(d.totalFullControlQuarters||0),0);}
 w.uprisings.active=w.uprisings.active.filter(x=>x!==f);w.changeSeq++;
}
function d2bCreate(w,groups){
 const first=groups[0],owner=first.s.ownerId,type=first.m.type,claim=first.m.claimNationId;
 const f={id:w.uprisings.nextId++,type,authorityNationId:owner,claimNationId:claim,formedDay:w.dayIndex,
   lastUpdatedDay:w.dayIndex,status:'ACTIVE',cultureId:first.id,militia:[],lostMilitia:0,lostGovernment:0,mobilizedTotal:0,returnedTotal:0,promotedTotal:0};
 for(const {s,id,m,count,baselinePopulation,initialCap,lifetimeCap} of d2bAllocate(groups,D2B_INITIAL_RATE)){
   d2bDetachCivilians(w,s,id,count);
   const d=d2bNewDetachment(w,f,s,id,count);
   d.mobilizationLedger={sourceSettlementId:s.id,cultureId:id,joinedDay:w.dayIndex,baselinePopulation,initialCap,lifetimeCap,mobilizedTotal:count,killedTotal:0,returnedTotal:0,promotedTotal:0};
   d.initialFront=Math.max(1,Math.ceil(count*.8));d.fullControlSinceDay=null;d.fullControlQuarters=0;d.totalFullControlQuarters=0;d.maxLocalControl=0;
   f.militia.push(d);
   m.supporters=Math.max(0,m.supporters-count);
   f.mobilizedTotal+=count;
 }
 if(!f.militia.length)return;
 w.uprisings.active.push(f);w.uprisings.mobilized+=f.mobilizedTotal;
 for(const d of f.militia){const m=d2bMovementAt(w,d);if(m){m.d2bCooldownUntil=w.dayIndex+D2B_COOLDOWN_DAYS;m.d2bPrep=null;}}
 d2bLog(w,f,'FORMED',`${w.nations[owner].name}의 ${D2A_TYPES[type].label} 무장 봉기 · 실제 편제 ${d2bSize(f)}명`);
}
function d2bGarrison(w,f,s){
 return w.armies.filter(a=>a.nationId===f.authorityNationId&&a.status==='READY'&&a.engagementId===null&&manpower(a)>0&&s.tileIds.includes(a.tileId)).sort((a,b)=>a.id-b.id);
}
// This uses the exact regular H1 terrain cap and capped-largest-remainder deployment allocation.
function d2bCombatAlloc(w,armies,phase,defending,tileId){
 return h1DeploymentFromArmies(w,armies,phase,defending,tileId);
}
function d2bLocalCombat(w,f,d,garrison){
 const checkpoint=e3bLocalCheckpoint(w,f,d),observer=e3bObserverCheckpoint(w);
 const ctx=v07d2Context(null,{f,d});ctx.round=d.engagement.round+1;
 e3bStage='LOCAL_ENTRY';
 try{return d2bLocalCombatD1(w,f,d,garrison);}
 catch(problem){
   const stage=e3bStage;let restored=false,rollbackError=null;
   try{e3bRollbackCombat(w,checkpoint);restored=true;}catch(err){rollbackError=err;}
   try{e3bLocalAbort(w,observer,ctx,problem,stage,restored);}catch(err){rollbackError??=err;}
   const detail={dayIndex:w.dayIndex,scope:'LOCAL_UPRISING',uprisingId:f.id,localArmyId:d.army.id,round:ctx.round,
     stage,errorName:problem.name||'Error',errorMessage:String(problem.message||problem),
     rollbackStatus:restored&&!rollbackError?'RESTORED':'UNVERIFIED',lastCommitted:e3bLastCommit.get(w)||null};
   e3bFailures.set(w,detail);
   const err=new Error(`E3B ${detail.rollbackStatus} · day ${detail.dayIndex} · uprising ${detail.uprisingId} / round ${detail.round} · ${stage} · ${detail.errorName}: ${detail.errorMessage}`,{cause:problem});
   if(rollbackError)err.rollbackError=rollbackError;
   throw err;
 }
}
function d2bLocalCombatD1(w,f,d,garrison){
 const d3group=v07d3LocalBegin(w,f,d);
 let d3completed=false;
 try{
 const rebel=d.army,terrain=w.tiles[d.tileId]?.terrain||'plain',record={dayIndex:w.dayIndex,
   round:++d.engagement.round,phaseResults:[],rebelLoss:0,governmentLoss:0,powerRebel:0,powerGovernment:0};
 const lookup=id=>id===rebel.id?rebel:w.armies.find(a=>a.id===id);
 const initialRebel=manpower(rebel),initialGov=garrison.reduce((s,a)=>s+manpower(a),0);
 let rebelExposure=0;const govExposure=new Map();
 for(const phase of ['OPENING','CONTACT','MELEE']){
   if(!manpower(rebel)||!garrison.some(a=>manpower(a)>0))break;
   const allocR=d2bCombatAlloc(w,[rebel],phase,false,d.tileId);
   const allocG=d2bCombatAlloc(w,garrison.filter(a=>manpower(a)>0),phase,true,d.tileId);
   const observation=v07d2Traces.get(w)?.enabled?v07d2PhaseBegin(w,null,phase,[
     {side:'rebels',allocation:allocR,members:[{army:rebel,broken:!!d.frontBroken}]},
     {side:'government',allocation:allocG,members:garrison.filter(a=>manpower(a)>0).map(army=>({army,broken:false}))}],{f,d}):null;
   const rebelChannels=new Map(),governmentChannels=new Map();
   const useGunAmmo=phase==='OPENING'||(G4_COMBAT_ENABLED&&phase==='MELEE');
   const rebelAmmo=!G4_COMBAT_ENABLED||!useGunAmmo||v07cVolleyCheck(w,rebel,allocR,null);
   const rebelMachineAmmo=hVolley(w,rebel,phase,null,allocR);
   const pR=h1Power(w,rebel,phase,false,terrain,false,allocR,rebelAmmo,rebelChannels,rebelMachineAmmo);
   // All armed participants must pay for actual shots; none for bayonet strikes.
   const governmentAmmo=new Map();
   if(useGunAmmo)for(const army of garrison){
     governmentAmmo.set(army.id,{human:v07cVolleyCheck(w,army,allocG,null),machine:hVolley(w,army,phase,null,allocG)});
   }
   e3bMark('AFTER_LOCAL_AMMO',w,null);
   const pG=garrison.reduce((s,a)=>s+h1Power(w,a,phase,true,terrain,false,allocG,governmentAmmo.get(a.id)?.human!==false,governmentChannels,governmentAmmo.get(a.id)?.machine!==false),0);
   // Ranged fire can hit a front with no ranged weapons. Use the shared H1 exposure
   // and armor allocator while keeping ranged eligibility for *attacking* power only.
   const shieldR=phase==='OPENING'?d2bCombatAlloc(w,[rebel],'CONTACT',false,d.tileId):[];
   const shieldG=phase==='OPENING'?d2bCombatAlloc(w,garrison,'CONTACT',true,d.tileId):[];
   const targetR=shieldR.some(x=>x.men>0)?shieldR:allocR;
   const targetG=shieldG.some(x=>x.men>0)?shieldG:allocG;
   const eligibleR=targetR.reduce((s,x)=>s+x.men,0),eligibleG=targetG.reduce((s,x)=>s+x.men,0);
   for(const x of allocG)if(x.men>0)govExposure.set(x.armyId,(govExposure.get(x.armyId)||0)+x.men);
   const toGov=!pR?0:Math.min(Math.ceil(eligibleG*.22),Math.max(1,Math.round(pR/65)));
   const toRebel=!pG?0:Math.min(Math.ceil(eligibleR*.22),Math.max(1,Math.round(pG/65)));
   // Budget both sides before mutating formations. Same h1aSideDamage calculation as national wars.
   const hitsG=h1aSideDamage(w,toGov,targetG,phase,lookup,rebelChannels);
   const hitsR=h1aSideDamage(w,toRebel,targetR,phase,lookup,governmentChannels);
   e3bMark('AFTER_LOCAL_DAMAGE',w,null);
   record.rebelLoss+=hitsR.humanLost;record.governmentLoss+=hitsG.humanLost;
   record.powerRebel+=pR;record.powerGovernment+=pG;rebelExposure+=eligibleR;
   record.phaseResults.push({phase,powerRebel:Math.round(pR),powerGovernment:Math.round(pG),rebelLoss:hitsR.actualLoss,
     governmentLoss:hitsG.humanLost,governmentMachineHits:hitsG.machineHits,exposedRebel:eligibleR,exposedGovernment:eligibleG});
   v07d2PhaseEnd(w,observation,{rebels:pR,government:pG});
 }
 if(rebelExposure>0&&manpower(rebel)>0)b4aRecordCombat(w,rebel,100000+f.id,record.round,rebelExposure,record.rebelLoss);
 for(const [id,exposed] of govExposure){
   const army=garrison.find(a=>a.id===id);if(army&&manpower(army)>0)
     b4aRecordCombat(w,army,100000+f.id,record.round,exposed,Math.max(0,initialGov-garrison.reduce((s,a)=>s+manpower(a),0)));
 }
 e3bMark('AFTER_LOCAL_XP',w,null);
 // Real reserve UnitGroups are committed, rather than being copied, once the front collapses.
 const member={initialFront:Math.max(1,d.initialFront||Math.ceil(d.initialMen*.8)),initialManpower:Math.max(1,d.initialMen),
   frontBroken:!!d.frontBroken,h1aRallyCredit:d.rallyCredit||0};
 h1Reinforce(null,member,rebel);
 d.frontBroken=!!member.frontBroken;d.rallyCredit=member.h1aRallyCredit||0;
 const lossR=initialRebel-manpower(rebel),lossG=initialGov-garrison.reduce((s,a)=>s+manpower(a),0);
 record.rebelLoss=lossR;record.governmentLoss=lossG;
 d.engagement.history.push(record);if(d.engagement.history.length>8)d.engagement.history.shift();
 d.engagement.lastDay=w.dayIndex;d.engagement.lastResult=lossR>lossG?'UNDER_PRESSURE':'CONTESTED';
 d.men=manpower(rebel);f.lostMilitia+=lossR;f.lostGovernment+=lossG;
 w.uprisings.killedMilitia+=lossR;w.uprisings.killedGovernment+=lossG;d.mobilizationLedger.killedTotal+=lossR;
 // Successful repression reduces local control but does not rewrite formal sovereignty.
 if(record.powerGovernment>record.powerRebel){d.localControl=Math.max(0,d.localControl-90);d.suppressedQuarters=Math.min(20,d.suppressedQuarters+1);}
 else{d.localControl=Math.min(1000,d.localControl+70);d.suppressedQuarters=0;d.engagement.lastResult='RESISTED';}
 v07d3LocalEnd(w,d3group,record);d3completed=true;
 e3bMark('AFTER_LOCAL_FINISH',w,null);
 w.changeSeq++;
 return record;
 }finally{if(!d3completed)v07d3LocalEnd(w,d3group,null,true);}
}
function d2bReinforce(w,f){
 for(const d of f.militia){
   const ledger=d.mobilizationLedger;
   if(d.men<=0||d.army.morale<24||!ledger)continue;
   const s=w.settlements.find(s=>s.id===d.settlementId),m=d2bMovementAt(w,d);
   if(!s||s.ownerId!==f.authorityNationId||!m||m.organization<800||m.radicalization<700)continue;
   const budget=Math.max(0,ledger.lifetimeCap-ledger.mobilizedTotal);
   const n=Math.min(budget,Math.floor(m.supporters*D2B_REINFORCE_RATE),s.culturePopulation[d.cultureId]||0);
   if(n<=0)continue;
   d2bDetachCivilians(w,s,d.cultureId,n);
   const front=d.army.units.find(u=>d.army.deployment.front.includes(u.id))||d.army.units[0];
   front.manpower+=n;front.trainedManpower+=n;d1CultureAdd(front.culturePopulation,d1CulturePool(d.cultureId,n));
   c3RefreshUnit(front);d1cReinforceUnit(front,d1CulturePool(d.cultureId,n));
   d.men=manpower(d.army);d.mobilizedTotal+=n;ledger.mobilizedTotal+=n;f.mobilizedTotal+=n;
   w.uprisings.mobilized+=n;m.supporters=Math.max(0,m.supporters-n);
 }
 w.changeSeq++;
}
function d2bResolve(w,f){
 if(!w.nations[f.authorityNationId]?.active){d2bEnd(w,f,'통치국 소멸로 무장 조직 해산');return;}
 if(f.type==='REUNIFICATION'&&!w.nations[f.claimNationId]?.active){d2bEnd(w,f,'재통합 대상국 소멸로 무장 조직 해산');return;}
 for(const d of f.militia){
   if(d.men<=0)continue;
   const s=w.settlements.find(s=>s.id===d.settlementId);if(!s)continue;
   if(s.ownerId!==f.authorityNationId){d2bEnd(w,f,'통치권 변경으로 무장 조직 해산');return;}
   const garrison=d2bGarrison(w,f,s);
   if(garrison.length){
     d2bLocalCombat(w,f,d,garrison);
     if(d.men>0&&(d.army.morale<23||(d.localControl===0&&d.suppressedQuarters>=3))){
       const returned=d2bReturnCivilians(w,d);
       d.surrendered=true;d.engagement.lastResult='SURRENDERED';
     }
   }else if(w.tiles[s.coreTileId]?.occupiedBy!==null&&w.tiles[s.coreTileId]?.occupiedBy!==f.authorityNationId){
     d.suppressedQuarters=0;
   }else{d.localControl=Math.min(1000,d.localControl+220);d.suppressedQuarters=0;}
 }
 for(const d of f.militia){
   d.maxLocalControl=Math.max(d.maxLocalControl||0,d.localControl);
   if(d.men>0&&d.localControl===1000){
     if(d.fullControlSinceDay===null){d.fullControlSinceDay=w.dayIndex;d.fullControlQuarters=0;}
     else {d.fullControlQuarters=Math.floor((w.dayIndex-d.fullControlSinceDay)/DAYS_PER_QUARTER);d.totalFullControlQuarters++;}
   }else{d.fullControlSinceDay=null;d.fullControlQuarters=0;}
 }
 f.lastUpdatedDay=w.dayIndex;
 if(d2bSize(f)===0){d2bEnd(w,f,'정부군에 진압되거나 민병대 해산');return;}
 d2bReinforce(w,f);
 f.status=f.militia.some(d=>d.men>0&&d.localControl>=800)?'LOCAL_CONTROL':'ACTIVE';
}
function d2bQuarter(w){
 const state=w.uprisings;if(!state)return;
 for(const f of state.active.slice())d2bResolve(w,f);
 const candidates=new Map(),activeOwners=new Set(state.active.map(f=>f.authorityNationId));
 for(const s of w.settlements)for(const [id,g] of Object.entries(s.politicalMovementGroups||{})){
   const m=g.movement;if(!m)continue;
   const prep=d2bPrep(w,s,id,m),qualified=d2bIsQualified(w,s,id,m);
   prep.quarters=qualified?Math.min(10000,prep.quarters+1):0;prep.dayIndex=w.dayIndex;
   if(!qualified||prep.quarters<8||w.dayIndex<(m.d2bCooldownUntil||0)||activeOwners.has(s.ownerId))continue;
   const key=d2bFactionKey(s.ownerId,m.type,m.claimNationId,id);
   if(!candidates.has(key))candidates.set(key,[]);candidates.get(key).push({s,id,m});
 }
 for(const key of [...candidates.keys()].sort()){
   const groups=candidates.get(key),owner=groups[0].s.ownerId;
   if(activeOwners.has(owner))continue;
   d2bCreate(w,groups);activeOwners.add(owner);
 }
 state.lastQuarterDay=w.dayIndex;
}
function d2bAssignSuppression(w,execute){
 const targeted=new Set();
 for(const f of w.uprisings.active){
   const n=w.nations[f.authorityNationId];if(!n?.active||n.controller!=='AI')continue;
   for(const d of f.militia){
     if(d.men<=0)continue;
     const s=w.settlements.find(s=>s.id===d.settlementId);if(!s||d2bGarrison(w,f,s).length)continue;
     const eligible=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&a.engagementId===null&&
       a.assignedWarId==null&&manpower(a)>0&&!a.order&&!targeted.has(a.id)&&
       w.tiles[a.tileId]?.ownerId===n.id).sort((a,b)=>{
         const ta=w.tiles[a.tileId],tb=w.tiles[b.tileId],goal=w.tiles[s.coreTileId];
         return (Math.abs(ta.x-goal.x)+Math.abs(ta.y-goal.y))-(Math.abs(tb.x-goal.x)+Math.abs(tb.y-goal.y))||a.id-b.id;
       });
     let assigned=false;
     for(const a of eligible.slice(0,6)){
       if(a.tileId===s.coreTileId){targeted.add(a.id);assigned=true;break;}
       const route=landRoute(w,a.tileId,s.coreTileId,t=>canPassMilitaryTile(w,n.id,t),n.id);
       if(!route||route.length<2)continue;
       const result=execute(w,n.id,{type:'MOVE_ARMY',armyId:a.id,targetTileId:s.coreTileId});
       if(result.ok){a.operation={type:'UPRISING_SUPPRESSION',targetTileId:s.coreTileId,assignedDay:w.dayIndex};targeted.add(a.id);assigned=true;break;}
     }
     if(assigned)break;
   }
 }
}
function d2bOnTransfer(w,s){for(const f of w.uprisings.active.slice())if(f.militia.some(d=>d.settlementId===s.id)&&s.ownerId!==f.authorityNationId){if(w.d2cTransferGuard?.uprisingId===f.id&&w.d2cTransferGuard.settlementIds.includes(s.id))continue;d2bEnd(w,f,'정착지 통치권 변경');}}
function d2bMergeSettlement(w,primary,secondary){
 for(const f of w.uprisings.active)for(const d of f.militia)if(d.settlementId===secondary.id){
   d.settlementId=primary.id;d.tileId=primary.coreTileId;d.army.tileId=primary.coreTileId;
 }
}
function d2bValidate(w,fail){
 const state=w.uprisings;
 if(!state||state.schema!==D2B_SCHEMA||!Number.isSafeInteger(state.nextId)||state.nextId<1||
   !Number.isSafeInteger(state.nextRebelArmyId)||state.nextRebelArmyId<1||
   !Number.isSafeInteger(state.lastQuarterDay)||state.lastQuarterDay>w.dayIndex||
   !Array.isArray(state.active)||!Array.isArray(state.history)||state.history.length>D2B_HISTORY_LIMIT||
   ['mobilized','returned','killedMilitia','killedGovernment'].some(k=>!Number.isSafeInteger(state[k])||state[k]<0))fail('D2B1 봉기 기본 상태');
 const ids=new Set(),armyIds=new Set(w.armies.map(a=>a.id)),unitIds=new Set(w.armies.flatMap(a=>a.units.map(u=>u.id))),owners=new Set();let soldiers=0;
 for(const f of state.active){
   if(!Number.isSafeInteger(f.id)||f.id<1||f.id>=state.nextId||ids.has(f.id)||owners.has(f.authorityNationId)||!w.nations[f.authorityNationId]||
     !['INDEPENDENCE','REUNIFICATION'].includes(f.type)||!['ACTIVE','LOCAL_CONTROL'].includes(f.status)||!Array.isArray(f.militia)||!f.militia.length||f.militia.length>100||
     !Number.isSafeInteger(f.formedDay)||f.formedDay>w.dayIndex||!Number.isSafeInteger(f.lastUpdatedDay)||f.lastUpdatedDay>w.dayIndex||
     !Number.isSafeInteger(f.lostMilitia)||f.lostMilitia<0||!Number.isSafeInteger(f.lostGovernment)||f.lostGovernment<0||
     !Number.isSafeInteger(f.mobilizedTotal)||f.mobilizedTotal<0||!w.cultures.some(c=>c.id===f.cultureId)||
     (f.type==='REUNIFICATION'&&!w.nations[f.claimNationId]))fail('D2B1 봉기 세력');
   ids.add(f.id);owners.add(f.authorityNationId);let factionDrafted=0;
   for(const d of f.militia){
     const town=w.settlements.find(x=>x.id===d.settlementId),a=d.army;
     if(!town||town.ownerId!==f.authorityNationId||!w.cultures.some(c=>c.id===d.cultureId)||d.tileId!==town.coreTileId||
       !Number.isSafeInteger(d.men)||d.men<0||!Number.isSafeInteger(d.initialMen)||d.initialMen<1||
       !Number.isSafeInteger(d.mobilizedTotal)||d.mobilizedTotal<d.initialMen||d.mobilizedTotal>f.mobilizedTotal||
       !Number.isSafeInteger(d.localControl)||d.localControl<0||d.localControl>1000||
       !Number.isSafeInteger(d.suppressedQuarters)||d.suppressedQuarters<0||d.equipment!=='IMPROVISED'||
       !d.mobilizationLedger||d.mobilizationLedger.mobilizedTotal!==d.mobilizedTotal||
       d.mobilizationLedger.initialCap!==Math.floor(d.mobilizationLedger.baselinePopulation*D2C_INITIAL_CAP_RATE)||
       d.mobilizationLedger.lifetimeCap!==Math.floor(d.mobilizationLedger.baselinePopulation*D2C_LIFETIME_CAP_RATE)||
       d.mobilizedTotal>d.mobilizationLedger.lifetimeCap||d.initialMen>d.mobilizationLedger.initialCap||
       d.mobilizedTotal!==d.men+d.mobilizationLedger.killedTotal+d.mobilizationLedger.returnedTotal+d.mobilizationLedger.promotedTotal||
       !Number.isSafeInteger(d.fullControlQuarters)||d.fullControlQuarters<0||
       !Number.isSafeInteger(d.maxLocalControl)||d.maxLocalControl<0||d.maxLocalControl>1000||
       !Number.isSafeInteger(d.totalFullControlQuarters)||d.totalFullControlQuarters<0||
       !a||!Number.isSafeInteger(a.id)||a.id>=0||-a.id>=state.nextRebelArmyId||armyIds.has(a.id)||a.affiliation?.kind!=='UPRISING'||a.affiliation.uprisingId!==f.id||
       a.nationId!==null||a.commanderId!==null||a.tileId!==d.tileId||!Array.isArray(a.units)||!a.units.length||!a.deployment||
       !Number.isFinite(a.morale)||a.morale<0||a.morale>100||!a.formationExperience||
       !d.engagement||!Number.isSafeInteger(d.engagement.round)||d.engagement.round<0||!Array.isArray(d.engagement.history)||d.engagement.history.length>8)fail('D2B1 민병대 Army');
     armyIds.add(a.id);
     const lanes=[...a.deployment.front,...a.deployment.rear,...a.deployment.reserve];
     if(lanes.length!==a.units.length||new Set(lanes).size!==a.units.length||a.units.some(u=>!lanes.includes(u.id)))fail('D2B1 민병대 전열·예비대');
     for(const u of a.units){
       if(unitIds.has(u.id)||!Number.isSafeInteger(u.manpower)||u.manpower<0||
         d1CultureTotal(u.culturePopulation)!==u.manpower||Object.keys(u.culturePopulation).some(id=>id!==d.cultureId)||
         !['levy'].includes(u.typeId)||u.weaponId!=='basic_arms'||u.armorId!=='none'||
         !Number.isSafeInteger(u.trainedManpower)||u.trainedManpower!==u.manpower||
         !Array.isArray(u.trainingBatches)||u.trainingBatches.length||!u.emergencySpecialist)fail('D2B1 UnitGroup 회계');
       unitIds.add(u.id);
     }
     if(d.men!==manpower(a)||d.men>d.mobilizedTotal)fail('D2B1 민병대 수 중복');
     factionDrafted+=d.mobilizedTotal;soldiers+=d.men;
   }
   if(factionDrafted!==f.mobilizedTotal)fail('D2B1 봉기 누적 동원 불일치');
 }
 if(state.mobilized!==soldiers+state.returned+state.killedMilitia+state.promoted)fail(`D2C 인구 회계 ${state.mobilized} != ${soldiers}+${state.returned}+${state.killedMilitia}+${state.promoted}`);
 for(const h of state.history)if(!Number.isSafeInteger(h.dayIndex)||h.dayIndex>w.dayIndex||!['FORMED','ENDED','FOUNDED'].includes(h.kind)||!Number.isSafeInteger(h.men)||h.men<0)fail('D2B1 이력');
 for(const town of w.settlements)for(const g of Object.values(town.politicalMovementGroups||{})){
   const m=g.movement;if(!m)continue;
   if(m.d2bPrep!==null&&m.d2bPrep!==undefined&&(!Number.isSafeInteger(m.d2bPrep.dayIndex)||m.d2bPrep.dayIndex>w.dayIndex||!Number.isSafeInteger(m.d2bPrep.quarters)||m.d2bPrep.quarters<0))fail('D2B1 준비 상태');
   if(m.d2bCooldownUntil!==undefined&&(!Number.isSafeInteger(m.d2bCooldownUntil)||m.d2bCooldownUntil<0))fail('D2B1 재봉기 제한');
 }
 return true;
}

// V0.6D2B1 — real rebel formation combat power on map, settlement Inspector and country panel.
function d2bDrawOverlay(ctx,scale,ox,oy,cw,ch,phase){
 if(!this.d2bEnabled||!this.world?.uprisings?.active.length)return;
 const w=this.world;ctx.save();ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.clip();
 for(const f of w.uprisings.active)for(const d of f.militia){
  const men=manpower(d.army);if(!men)continue;
  const s=w.settlements.find(s=>s.id===d.settlementId);if(!s)continue;
  if(phase==='area'){
    const alpha=.07+d.localControl/1000*.20;ctx.fillStyle=`rgba(242,132,101,${alpha.toFixed(3)})`;
    for(const tid of s.tileIds){const t=w.tiles[tid],x=ox+t.x*scale,y=oy+t.y*scale;
      if(x+scale<0||x>cw||y+scale<0||y>ch)continue;
      ctx.fillRect(x+scale*.06,y+scale*.06,scale*.88,scale*.88);
    }
  }else{
    const t=w.tiles[s.coreTileId],x=ox+(t.x+.30)*scale,y=oy+(t.y+.79)*scale;
    if(x<-25||x>cw+25||y<-25||y>ch+25)continue;
    const r=scale<22?7.5:10;
    ctx.fillStyle='#4d2b38';ctx.strokeStyle=d.localControl>=800?'#ffce75':'#f5a38a';ctx.lineWidth=2.1;
    ctx.beginPath();ctx.roundRect(x-r,y-r,r*2,r*2,3);ctx.fill();ctx.stroke();
    ctx.fillStyle='#ffe4c6';ctx.font=`bold ${Math.round(r*1.45)}px sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(d.localControl>=800?'⚑':'⚔',x,y+.5);
    if(scale>=29){
      const power=getArmyBasePower(w,d.army);
      ctx.font=`bold ${Math.max(9,Math.round(r*.92))}px sans-serif`;
      const label=`${men} · ⚔${power}`;
      const width=ctx.measureText(label).width+10;
      ctx.fillStyle='rgba(14,25,37,.88)';ctx.fillRect(x-width/2,y+r+2,width,14);
      ctx.fillStyle='#ffebd6';ctx.textBaseline='middle';ctx.fillText(label,x,y+r+9);
    }
  }
 }
 ctx.restore();
}
function d2bUprisingCard(w,f,d,showTown){
 const s=w.settlements.find(x=>x.id===d.settlementId),body=make('div',{class:'d2b-card'}),ty=D2A_TYPES[f.type];
 const army=d.army,government=s?d2bGarrison(w,f,s):[],gMen=government.reduce((v,a)=>v+manpower(a),0),
   gPower=government.reduce((v,a)=>v+getArmyBasePower(w,a),0),rPower=getArmyBasePower(w,army);
 body.append(make('strong',{text:`⚔ #${f.id} · ${ty.label}${showTown&&s?' · '+settlementDisplayName(w,s):''}`}));
 body.append(make('div',{class:'muted-line',text:`반란군 ${number.format(manpower(army))}명 · 기초 전투력 ${number.format(rPower)} · 사기 ${army.morale.toFixed(1)} · ${b4aRankLabel(army)}`}));
 body.append(make('div',{class:'muted-line',text:`전열 ${deployedManpower(army,'front')}명 / 예비 ${deployedManpower(army,'reserve')}명 · 급조 장비(기본 무장) · 실제 문화 ${w.cultures.find(c=>c.id===d.cultureId)?.name||d.cultureId}`}));
 body.append(make('div',{class:'muted-line',text:`정부 주둔군 ${number.format(gMen)}명 · 기초 전투력 ${number.format(gPower)} · 실제 참여 인원은 지형별 상한에 따름`}));
 body.append(d2aTrack('지역 장악도',d.localControl,'#f4a476'));
 body.append(make('div',{class:'muted-line',text:`동원 원천 ${number.format(d.mobilizationLedger.baselinePopulation)}명 · 최초 상한 ${number.format(d.mobilizationLedger.initialCap)}명(7%) · 누적 상한 ${number.format(d.mobilizationLedger.lifetimeCap)}명(15%) · 현재 누적 ${number.format(d.mobilizationLedger.mobilizedTotal)}명 · 완전 장악 ${d.fullControlQuarters||0}/2분기`}));
 const last=d.engagement?.history?.at(-1);
 if(last)body.append(make('div',{class:'muted-line',text:`지역 봉기 · 분기별 별도 접전 ${d.engagement.round}회: 반란군 피해 ${last.rebelLoss}명 / 정부군 피해 ${last.governmentLoss}명 · ${timeAt(last.dayIndex).year}년 · ${last.phaseResults.map(p=>p.phase).join('→')}`}));
 body.append(make('div',{class:'muted-line',text:`상태: ${d.localControl>=800?'지역 점거':'지역 무장 봉기'} · 최초 ${number.format(d.initialMen)}명, 누적 동원 ${number.format(d.mobilizedTotal)}명 · 정규 국가 소유권은 유지`}));
 return body;
}
function d2bInspectorPanel(w,s){
 const section=make('section',{class:'d2b-panel'}),list=w.uprisings.active.flatMap(f=>f.militia.filter(d=>d.settlementId===s.id&&d.men>0).map(d=>({f,d})));
 section.append(make('h3',{text:`⚔ D2C · 반란군 편제 (${list.length})`}));
 for(const {f,d} of list)section.append(d2bUprisingCard(w,f,d,false));
 if(!list.length)section.append(make('div',{class:'muted-line',text:'현재 정착지에 활동 중인 반란군 편제는 없습니다.'}));
 return section;
}
function d2bNationPanel(w,n){
 const list=w.uprisings.active.filter(f=>f.authorityNationId===n.id),sum=list.reduce((a,f)=>a+d2bSize(f),0),section=make('section',{class:'overview-section d2b-panel'});
 section.append(make('h3',{text:'⚔ V0.6E3 · 재통합 외교·문화 우호도 · 재정·시설 정책 AI'}),make('div',{class:'muted-line',text:`활동 중인 봉기 ${list.length}세력 · 반란군 ${number.format(sum)}명 · 국가군과 별도 소속·실제 편제 전투력 적용`}));
 for(const f of list)for(const d of f.militia)if(d.men>0)section.append(d2bUprisingCard(w,f,d,true));
 if(n.rebelOrigin)section.append(make('div',{class:'muted-line',text:`⚑ 봉기에서 성립 · 봉기 #${n.rebelOrigin.uprisingId} · 과거 통치국 ${w.nations[n.rebelOrigin.originNationId]?.name||'미상'} · ${n.rebelOrigin.status} · 참여 문화 ${n.rebelOrigin.cultureId}`}));
 if(!list.length)section.append(make('div',{class:'muted-line',text:'현재 활동 중인 무장 봉기가 없습니다.'}));
 return section;
}
function d2bWireControls(renderer){
 const cb=document.getElementById('d2bMapEnabled');if(!cb)return;
 cb.addEventListener('change',()=>{renderer.d2bEnabled=cb.checked;renderer.requestDraw();});
 renderer.d2bEnabled=cb.checked;
}

// V0.6D2C — Rebel State Formation & Secession War V1.
// An uprising owns real formations already; founding transfers that existing manpower, not duplicates it.
const D2C_FULL_CONTROL_QUARTERS=2,D2C_MIN_FOUNDING_MEN=30,D2C_HISTORY_LIMIT=90;
function d2cState(w){return w.uprisings;}
function d2cLedgerFor(f,d){return d.mobilizationLedger;}
function d2cAppendHistory(w,f,kind,reason,extra={}){
 const h=w.uprisings.history;
 h.push({dayIndex:w.dayIndex,id:f.id,kind,type:f.type,authorityNationId:f.authorityNationId,
   claimNationId:f.claimNationId,men:d2bSize(f),reason,...extra});
 if(h.length>D2B_HISTORY_LIMIT)h.splice(0,h.length-D2B_HISTORY_LIMIT);
}
function d2cBlock(w,reason){const s=w.uprisings; s.foundingChecks=(s.foundingChecks||0)+1;
 if(reason){s.foundingBlocked??={};s.foundingBlocked[reason]=(s.foundingBlocked[reason]||0)+1;}}
function d2cCheckRegion(w,f,d){
 const s=w.settlements.find(s=>s.id===d.settlementId);
 if(!s||s.ownerId!==f.authorityNationId)return 'OWNER_CHANGED';
 if(d.men<D2C_MIN_FOUNDING_MEN)return 'INSUFFICIENT_MILITIA';
 if(d.localControl<1000)return 'CONTROL_INCOMPLETE';
 if((d.fullControlQuarters||0)<D2C_FULL_CONTROL_QUARTERS)return 'CONTROL_HOLD';
 if(w.armies.some(a=>a.nationId===f.authorityNationId&&manpower(a)>0&&s.tileIds.includes(a.tileId)))return 'GOVERNMENT_GARRISON';
 if(s.tileIds.some(id=>w.tiles[id]?.occupiedBy!==null&&w.tiles[id].occupiedBy!==f.authorityNationId))return 'FOREIGN_OCCUPATION';
 return null;
}
function d2cName(w,f){
 const culture=w.cultures.find(c=>c.id===f.cultureId);
 const root=(culture?.name||'신생 문화').replace(/\s*문화$/,'').trim()||'신생';
 const suffix=f.type==='REUNIFICATION'?'재통합국':'계승국';
 const base=validateNationName(`${root} ${suffix}`);
 let name=base,i=2;
 while(w.nations.some(n=>n.name===name)){name=validateNationName(`${base} ${i}`);i++;}
 return name;
}
function d2cNation(w,f,capital){
 const source=w.nations[f.authorityNationId],id=w.nations.length;
 const econ=newEconomy();econ.gold=0;econ.knowledge=0;
 for(const k of [...RESOURCE_KEYS,'coal','machine_parts','steel','artillery_shells'])econ.resources[k]=0;
 const color=c1HslHex((id*137+23)%360,72,58);
 const tech=structuredClone(source.technology);tech.currentResearch=null;tech.pausedResearch=null;tech.progress=0;
 const nation={id,name:d2cName(w,f),color,personality:source.personality,description:'지역 무장 봉기에서 성립한 신생 국가',
  controller:'AI',aiProfileId:source.aiProfileId,leaderId:null,active:true,truces:{},
  technology:tech,civilization:structuredClone(source.civilization),knowledgeExchange:initialKnowledgeExchange(),
  military:newMilitaryState(),survival:null,...econ,
  trade:{exports:0,imports:0,exportValue:0,importValue:0,quarterExports:0,quarterImports:0,quarterExportValue:0,quarterImportValue:0},
  actionStats:{},capitalId:capital.coreTileId,settlementIds:[],primaryCultureId:f.cultureId,
  aiAdaptation:d1dNewNation(),roadDiscountCarry:{},governance:{...e1NewGovernance(w.dayIndex),unifiedAI:v06e6NewNationAI()},
  rebelOrigin:{uprisingId:f.id,originNationId:f.authorityNationId,claimNationId:f.claimNationId,
    cultureId:f.cultureId,formedDay:w.dayIndex,type:f.type,status:'SECESSION'}
 };
 nation.military.reserveCulturePopulation={};nation.military.politicalHistory=[];
 w.nations.push(nation);
 if(w.v06e7aDiagnostics)w.v06e7aDiagnostics.nations[id]=v06e7aNation();
 for(let other=0;other<id;other++)w.diplomacy.pairs[pairKey(other,id)]={relation:other===f.authorityNationId?-80:0};
 w.socialHistory.byNation[id]=[];w.politicalMovements.byNation[id]=[];
 makeLeader(w,id);w.nations[id].survival=b4aNewSurvival(w,id);
 return nation;
}
function d2cTransferEconomy(w,old,newNation,captured){
 // Only physically existing treasury and inventory move. No free founding grants.
 const basis=w.settlements.filter(s=>s.ownerId===old.id).reduce((a,s)=>a+s.population,0)+captured.reduce((a,s)=>a+s.population,0);
 const local=captured.reduce((a,s)=>a+s.population,0);
 const rate=Math.min(.25,Math.max(0,local/Math.max(1,basis))*.35);
 for(const key of ['gold',...RESOURCE_KEYS,'coal','machine_parts','steel','artillery_shells']){
  const from=key==='gold'?old.gold:old.resources[key];
  const amount=Math.max(0,Math.floor(from*rate));
  if(key==='gold'){old.gold-=amount;newNation.gold+=amount;}
  else{old.resources[key]-=amount;newNation.resources[key]+=amount;f2bTrackTransfer(old,newNation,key,amount);f2cTrackTransfer(old,newNation,key,amount);}
 }
}
function d2cMakeWar(w,nation,parent,f){
 if(!parent.active||!parent.settlementIds.length)return null;
 const id=w.nextWarId++;
 const war={id,kind:'SECESSION',secessionUprisingId:f.id,secessionNationId:nation.id,secessionParentId:parent.id,
  attackerId:nation.id,defenderId:parent.id,startedDay:w.dayIndex,lastBattleDay:w.dayIndex,
  score:0,battleCount:0,casualties:{},battleCasualties:{},occupationCasualties:{},supplyCasualties:{},battleWins:{},occupationCount:0,
  goal:chooseWarGoal(w,nation.id,parent.id),defenderGoal:defenseGoal(),sides:{attackers:[nation.id],defenders:[parent.id]},
  fatigue:{[nation.id]:0,[parent.id]:0},lastCasualties:{[nation.id]:0,[parent.id]:0},pendingPeace:null,nextPeaceOfferDay:0};
 w.wars.push(war);adjustRelation(w,nation.id,parent.id,-20);
 return war;
}
function d2cPromote(w,f,newNation,captured){
 let promoted=0;
 const rally=captured[0].coreTileId;
 for(const d of f.militia){
  const a=d.army,men=manpower(a);if(!men)continue;
  const newArmyId=w.nextArmyId++;
  // Preserve troop location when legally within the newly liberated territory;
  // other regional cells stay where they stand as uprising pockets in the secession war.
  a.id=newArmyId;a.nationId=newNation.id;a.affiliation={kind:'NATION',originUprisingId:f.id};
  a.commanderId=spawnCommander(w,newNation.id).id;a.militaryPolitics={commanderChangeDays:[]};a.engagementId=null;a.assignedWarId=null;
  a.order=null;a.operation=null;a.needsOrders=true;a.status='READY';
  a.supplyMultiplier=1;a.supplied=true;a.unsuppliedDays=0;a.supplyCheckedDay=w.dayIndex;
  a.c6CreatedDay=Math.min(a.c6CreatedDay||w.dayIndex,w.dayIndex);
  // Army UnitGroup ID remains unchanged; it has always been globally unique.
  e3cEnsureFormationRecord(a,a.c6CreatedDay);w.armies.push(a);promoted+=men;
  d.promotedTotal=(d.promotedTotal||0)+men;d.mobilizationLedger.promotedTotal+=men;d.men=0;
 }
 f.promotedTotal=(f.promotedTotal||0)+promoted;
 w.uprisings.promoted=(w.uprisings.promoted||0)+promoted;
 return promoted;
}
function d2cFound(w,f,eligible){
 const parent=w.nations[f.authorityNationId];
 if(!eligible.length||!parent?.active||w.nations.length>=c1NationCapacity(w.size,w.height))return false;
 if(w.wars.some(war=>war.kind==='SECESSION'&&war.secessionParentId===parent.id))return false;
 const settlements=eligible.map(x=>x.s).sort((a,b)=>a.id-b.id),capital=settlements[0];
 const before=d2bSize(f),newNation=d2cNation(w,f,capital);
 // Transfer guard prevents the normal d2bOnTransfer hook from dismissing the founding faction.
 w.d2cTransferGuard={uprisingId:f.id,settlementIds:settlements.map(s=>s.id)};
 try{for(const s of settlements)transferCore(w,s.id,newNation.id);}finally{delete w.d2cTransferGuard;}
 markCapitalHistory(capital,newNation.id);
 d2cTransferEconomy(w,parent,newNation,settlements);
 const promoted=d2cPromote(w,f,newNation,settlements);
 if(promoted!==before)throw Error('D2C founding army conservation failed');
 newNation.rebelOrigin.mobilizationLedgers=f.militia.map(d=>structuredClone(d.mobilizationLedger));
 newNation.rebelOrigin.promotedAtFounding=promoted;
 const war=d2cMakeWar(w,newNation,parent,f);
 if(war){for(const a of w.armies)if(a.nationId===newNation.id)a.assignedWarId=war.id;}
 if(!parent.settlementIds.length){
   parent.active=false;parent.capitalId=null;parent.leaderId=null;
   for(const a of w.armies.filter(a=>a.nationId===parent.id).slice())surrenderArmy(w,a,newNation.id);
   w.characters=w.characters.filter(c=>c.nationId!==parent.id);
   for(const t of w.tiles)if(t.ownerId===parent.id){t.ownerId=null;t.settlementId=null;t.occupiedBy=null;t.occupiedWarId=null;}
   for(const ally of w.diplomacy.alliances.filter(a=>a.a===parent.id||a.b===parent.id).slice())e5EndAlliance(w,ally,'NATION_FALL');
   for(const treaty of v06bTreaties(w).filter(t=>t.subjectId===parent.id||t.overlordId===parent.id).slice())v06bEndTreaty(w,t,'NATION_FALL');
   w.diplomacy.offers=w.diplomacy.offers.filter(o=>o.from!==parent.id&&o.to!==parent.id);
   w.diplomacy.subjectOffers=w.diplomacy.subjectOffers.filter(o=>o.from!==parent.id&&o.to!==parent.id);
   c2CleanupNation(w,parent.id);
   for(const other of w.wars.filter(war=>war.id!==war?.id&&warMembers(war).includes(parent.id)).slice())
     settlePeace(w,other,{tier:'WHITE',winnerId:null,loserId:null,advantage:0});
   newNation.rebelOrigin.status='INDEPENDENT';w.uprisings.independent++;
 }
 refreshApCaps(w);e5InvalidateBorders(w);
 w.uprisings.founded=(w.uprisings.founded||0)+1;
 d2cAppendHistory(w,f,'FOUNDED',`${newNation.name} 건국 · 반란군 ${promoted}명 정규군 승격`,
   {nationId:newNation.id,warId:war?.id??null,promoted,settlementIds:settlements.map(s=>s.id),
    mobilizedTotal:f.mobilizedTotal,killedTotal:f.lostMilitia,returnedTotal:f.returnedTotal,
    maxLocalControl:Math.max(...f.militia.map(d=>d.maxLocalControl||0))});
 const msg=`${newNation.name}이(가) ${parent.name}에서 분리 건국했습니다. 기존 봉기군 ${promoted}명 승격${war?' · 분리독립 전쟁 #'+war.id:''}.`;
 event(w,msg,'world');recordHistoricalEvent(w,'war',msg,[newNation.id,parent.id],`d2c:found:${newNation.id}`);
 w.uprisings.active=w.uprisings.active.filter(x=>x!==f);w.changeSeq++;
 return true;
}
function d2cQuarter(w){
 for(const f of w.uprisings.active.slice()){
  const ready=[];
  for(const d of f.militia){
   const s=w.settlements.find(s=>s.id===d.settlementId);
   if(!s)continue;
   const reason=d2cCheckRegion(w,f,d);
   if(!reason)ready.push({s,d});
   else if(d.localControl===1000)d2cBlock(w,reason);
  }
  if(!ready.length)continue;
  if(w.nations.length>=c1NationCapacity(w.size,w.height)){d2cBlock(w,'NATION_CAP');continue;}
  if(w.wars.some(war=>war.kind==='SECESSION'&&war.secessionParentId===f.authorityNationId)){
   d2cBlock(w,'EXISTING_SECESSION');continue;
  }
  d2cBlock(w,null);d2cFound(w,f,ready);
 }
}
function d2cApplyPeace(w,war,terms){
 if(war.kind!=='SECESSION')return null;
 const rebel=w.nations[war.secessionNationId],parent=w.nations[war.secessionParentId];
 const reconquered=terms.winnerId===parent.id&&terms.tier!=='WHITE';
 if(reconquered){
  for(const s of w.settlements.filter(s=>s.ownerId===rebel.id).slice())transferCore(w,s.id,parent.id);
  for(const a of w.armies.filter(a=>a.nationId===rebel.id).slice())surrenderArmy(w,a,parent.id);
  rebel.rebelOrigin.status='RECONQUERED';rebel.rebelOrigin.endedDay=w.dayIndex;
  w.uprisings.reconquered=(w.uprisings.reconquered||0)+1;
 }else{
  rebel.rebelOrigin.status='INDEPENDENT';rebel.rebelOrigin.endedDay=w.dayIndex;
  w.uprisings.independent=(w.uprisings.independent||0)+1;
 }
 return reconquered?'RECONQUERED':'INDEPENDENT';
}
function d2cValidate(w,fail){
 const u=w.uprisings;
 if(!Number.isSafeInteger(u.promoted)||u.promoted<0||!Number.isSafeInteger(u.founded)||u.founded<0||
  !Number.isSafeInteger(u.foundingChecks)||u.foundingChecks<0||!u.foundingBlocked||
  Object.values(u.foundingBlocked).some(v=>!Number.isSafeInteger(v)||v<0))fail('D2C founding counters');
 for(const n of w.nations){const r=n.rebelOrigin;if(!r)continue;
  if(!Number.isSafeInteger(r.uprisingId)||!w.nations[r.originNationId]||!w.cultures.some(c=>c.id===r.cultureId)||
    !['SECESSION','INDEPENDENT','RECONQUERED','REUNIFIED'].includes(r.status)||!Number.isSafeInteger(r.formedDay)||
    r.formedDay>w.dayIndex||n.primaryCultureId!==r.cultureId||
    !Array.isArray(r.mobilizationLedgers)||r.mobilizationLedgers.some(l=>l.cultureId!==r.cultureId||!Number.isSafeInteger(l.baselinePopulation)||
    l.initialCap!==Math.floor(l.baselinePopulation*D2C_INITIAL_CAP_RATE)||l.lifetimeCap!==Math.floor(l.baselinePopulation*D2C_LIFETIME_CAP_RATE)||
    l.mobilizedTotal>l.lifetimeCap||l.promotedTotal<0)||r.mobilizationLedgers.reduce((v,l)=>v+l.promotedTotal,0)!==r.promotedAtFounding)fail('D2C rebel-state origin');
 }
 for(const war of w.wars.filter(war=>war.kind==='SECESSION'))
  if(war.secessionNationId!==war.attackerId||war.secessionParentId!==war.defenderId||
    w.nations[war.attackerId]?.rebelOrigin?.uprisingId!==war.secessionUprisingId)fail('D2C secession war');
 return true;
}

// -- end V0.6D2C module --
// V0.6E1 — National Governance & Policy Foundation V1.
// E1 registers upcoming policies but deliberately does not activate their effects.
// The live-world policy engine is sparse; work is O(active policies), not O(all structures).
const E1_SCHEMA=1,E1_HISTORY_MAX=48,E1_ELIGIBLE_FACILITIES=Object.freeze(['farm','lumber','quarry','mine','academy','barracks']);
const E1_DEFINITIONS={
 FACILITY_FOCUS:{scope:'facility',label:'시설 생산 집중',release:'E2',enabled:true,gold:0,apUnits:0},
 TAX:{scope:'nation',label:'조세',release:'E3',enabled:true,gold:0,apUnits:0},
 PUBLIC_SERVICES:{scope:'nation',label:'공공서비스',release:'E3',enabled:true,gold:0,apUnits:0},
 RELIEF:{scope:'nation',label:'구휼',release:'E3A',enabled:true,gold:0,apUnits:0},
 SECURITY:{scope:'nation',label:'치안',release:'E3A',enabled:true,gold:0,apUnits:0},
 ASSIMILATION:{scope:'culture',label:'동화',release:'E4',enabled:true,gold:0,apUnits:0},
 MASS_KILLING:{scope:'culture',label:'학살',release:'E5',enabled:true,gold:0,apUnits:0}
};
function e1NewGovernance(day=0){return {policyAI:e2aNewState(day,120),serviceFinance:e3NewServiceFinance(),socialFinance:e3aNewSocialFinance(),assimilationFinance:e4NewFinance(),violenceFinance:v06e5NewFinance(),fiscalAI:e3NewFiscalAI(day),schema:E1_SCHEMA,national:{tax:'NORMAL',publicServices:'NORMAL',relief:'OFF',security:'OFF'},facilities:{},cultures:{},
 finance:{lastQuarterDay:null,billedGold:0,paidGold:0,unpaidGold:0,billedAPUnits:0,paidAPUnits:0,unpaidAPUnits:0,
  totalPaidGold:0,totalUnpaidGold:0,totalPaidAPUnits:0,totalUnpaidAPUnits:0,activeCount:0,fundedCount:0},history:[]};}
function e1InitWorld(w){for(const n of w.nations)n.governance=e1NewGovernance();}
function e1History(w,n,kind,policyId,scope,target,reason){
 const history=n.governance.history;history.push({dayIndex:w.dayIndex,kind,policyId,scope,target:String(target),reason});
 if(history.length>E1_HISTORY_MAX)history.splice(0,history.length-E1_HISTORY_MAX);
}
function e1Key(scope,target){
 if(scope==='facility')return Number.isSafeInteger(target)?String(target):null;
 if(scope==='culture')return Number.isSafeInteger(target?.settlementId)&&typeof target.cultureId==='string'?`${target.settlementId}|${target.cultureId}`:null;
 return scope==='nation'?'nation':null;
}
// Transient lookup is not attached to the serializable world; invalidate by object/length/revision.
const E1_BUILDING_INDEX=new WeakMap();
function e1Building(w,id){
 let c=E1_BUILDING_INDEX.get(w);
 if(!c||c.array!==w.buildings||c.size!==w.buildings.length||c.revision!==w.changeSeq){
  c={array:w.buildings,size:w.buildings.length,revision:w.changeSeq,byId:new Map(w.buildings.map(b=>[b.id,b]))};
  E1_BUILDING_INDEX.set(w,c);
 }
 return c.byId.get(id);
}
function e1FacilityOwned(w,nationId,buildingId){
 const b=e1Building(w,buildingId);
 return Boolean(b&&E1_ELIGIBLE_FACILITIES.includes(b.typeId)&&w.tiles[b.tileId]?.ownerId===nationId);
}
function e1FacilityValid(w,nationId,buildingId){
 const b=e1Building(w,buildingId);
 return Boolean(b&&E1_ELIGIBLE_FACILITIES.includes(b.typeId)&&b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===nationId&&w.tiles[b.tileId]?.occupiedBy===null);
}
function e1CultureValid(w,nationId,target){
 const s=w.settlements.find(s=>s.id===target.settlementId);
 return Boolean(s&&s.ownerId===nationId&&(s.culturePopulation?.[target.cultureId]||0)>0&&target.cultureId!==w.nations[nationId]?.primaryCultureId);
}
function e1CanChange(w,nationId,policyId,target,enable){
 const n=w.nations[nationId],definition=E1_DEFINITIONS[policyId];
 if(!n?.active||!n.governance||typeof enable!=='boolean'||!definition?.enabled)return {ok:false,reason:'미구현 정책 또는 비활성 국가'};
 const scope=definition.scope,key=e1Key(scope,target);if(key===null)return {ok:false,reason:'유효하지 않은 정책 대상'};
 if(scope==='nation')return {ok:false,reason:'국가 조세·공공서비스 정책은 수준별 변경 API 이용'};
 if(scope==='facility'&&enable&&!e1FacilityValid(w,nationId,Number(key)))return {ok:false,reason:'소유·가동 시설이 아니거나 정책 대상 제외'};
 if(scope==='culture'&&enable&&!e1CultureValid(w,nationId,target))return {ok:false,reason:'대상 문화집단 없음'};
 const bucket=scope==='facility'?n.governance.facilities:n.governance.cultures,old=bucket[key];
 if(enable&&old)return {ok:false,reason:'이미 활성화된 정책'};
 if(!enable&&(!old||old.policyId!==policyId))return {ok:false,reason:'활성화된 정책이 아님'};
 if(enable&&scope==='culture'&&Object.hasOwn(bucket,key))return {ok:false,reason:'동일 문화에 중복 정책 불가'};
 return {ok:true,scope,key,definition};
}
function e1ChangePolicy(w,nationId,policyId,target,enable,actor='PLAYER'){
 const check=e1CanChange(w,nationId,policyId,target,enable);if(!check.ok)return check;
 if(['ASSIMILATION','MASS_KILLING'].includes(policyId)){
   const owner=w.nations[nationId];
   const allowed=actor==='PLAYER'&&owner?.controller==='PLAYER'||actor==='AI'&&owner?.controller==='AI'&&w.v06e6Policy?.enabled===true&&(policyId==='ASSIMILATION'||w.v06e6Policy.allowAIViolence===true);
   if(!allowed)return {ok:false,reason:'문화 정책 변경 권한 없음 (E6 AI 허용 설정 확인)'};
 }
 const n=w.nations[nationId],bucket=check.scope==='facility'?n.governance.facilities:n.governance.cultures;
 if(enable)bucket[check.key]={policyId,startedDay:w.dayIndex,lastChangedDay:w.dayIndex,paidQuarterDay:null,
  ...(policyId==='ASSIMILATION'?{carryProgress:0,lastConverted:0,totalConverted:0,lastConvertedDay:null}: {}),
  ...(policyId==='MASS_KILLING'?{carryProgress:0,lastKilled:0,totalKilled:0,lastKilledDay:null}: {})};
 else delete bucket[check.key];
 e1History(w,n,enable?'START':'STOP',policyId,check.scope,check.key,actor==='AI'?'AI':'PLAYER');
 w.changeSeq++;return {ok:true,policyId,scope:check.scope,key:check.key,enabled:enable};
}
function e1PrunePolicy(w,n,scope,key,reason){
 const b=scope==='facility'?n.governance.facilities:n.governance.cultures;
 if(!b[key])return false;
 const id=b[key].policyId;delete b[key];e1History(w,n,'ENDED',id,scope,key,reason);return true;
}
function e1OnSettlementTransfer(w,settlementId,oldOwnerId,newOwnerId){
 const n=w.nations[oldOwnerId];if(!n?.governance)return;
 const gov=n.governance;
 const fKeys=Object.keys(gov.facilities),cKeys=Object.keys(gov.cultures);
 if(!fKeys.length&&!cKeys.length)return; // Zero-policy fast path for frequent wartime transfers.
 for(const key of fKeys)if(e1Building(w,Number(key))?.settlementId===settlementId)
  e1PrunePolicy(w,n,'facility',key,'SETTLEMENT_TRANSFER');
 for(const key of cKeys)if(key.startsWith(`${settlementId}|`))e1PrunePolicy(w,n,'culture',key,'SETTLEMENT_TRANSFER');
}
function e1OnSettlementMerge(w,nationId,primaryId,secondaryId){
 const n=w.nations[nationId];if(!n?.governance)return;
 const gov=n.governance;
 for(const key of Object.keys(gov.cultures).filter(k=>k.startsWith(`${secondaryId}|`))){
   const newKey=`${primaryId}|${key.split('|').slice(1).join('|')}`;
   if(!Object.hasOwn(gov.cultures,newKey))gov.cultures[newKey]=gov.cultures[key];
   else {
    const incumbent=gov.cultures[newKey],incoming=gov.cultures[key];
    if(incumbent.policyId==='ASSIMILATION'&&incoming.policyId==='ASSIMILATION'){
      incumbent.carryProgress+=incoming.carryProgress;
      incumbent.totalConverted+=incoming.totalConverted;
      incumbent.lastConverted+=incoming.lastConverted;
      if(incoming.lastConvertedDay!==null&&(incumbent.lastConvertedDay===null||incoming.lastConvertedDay>incumbent.lastConvertedDay))incumbent.lastConvertedDay=incoming.lastConvertedDay;
    }else if(incumbent.policyId==='MASS_KILLING'&&incoming.policyId==='MASS_KILLING'){
      incumbent.carryProgress+=incoming.carryProgress;
      incumbent.totalKilled+=incoming.totalKilled;
      incumbent.lastKilled+=incoming.lastKilled;
      if(incoming.lastKilledDay!==null&&(incumbent.lastKilledDay===null||incoming.lastKilledDay>incumbent.lastKilledDay))incumbent.lastKilledDay=incoming.lastKilledDay;
    } else e1History(w,n,'ENDED',incoming.policyId,'culture',key,'MERGE_CONFLICT');
   }
   delete gov.cultures[key];
 }
}
function e1CheckActive(w,n,scope,key,entry){
 if(scope==='facility')return e1FacilityValid(w,n.id,Number(key));
 const [settlementId,cultureId]=key.split('|');return e1CultureValid(w,n.id,{settlementId:Number(settlementId),cultureId});
}
function e1SettleQuarter(w,n){
 const gov=n.governance;if(!gov)return;
 const fin=gov.finance;
 fin.lastQuarterDay=w.dayIndex;fin.billedGold=0;fin.paidGold=0;fin.unpaidGold=0;
 fin.billedAPUnits=0;fin.paidAPUnits=0;fin.unpaidAPUnits=0;fin.activeCount=0;fin.fundedCount=0;
 // The early return is the zero-policy fast path; E1 does not charge any unreleased policy.
 if(!Object.keys(gov.facilities).length&&!Object.keys(gov.cultures).length)return;
 for(const scope of ['facility','culture']){
  const bucket=scope==='facility'?gov.facilities:gov.cultures;
  const keys=Object.keys(bucket).sort((a,b)=>scope==='facility'?Number(a)-Number(b):a.localeCompare(b));
  for(const key of keys){
   const e=bucket[key],def=E1_DEFINITIONS[e.policyId];
   if(!def?.enabled||def.scope!==scope||!(scope==='facility'?e1FacilityOwned(w,n.id,Number(key)):e1CheckActive(w,n,scope,key,e))){
      e1PrunePolicy(w,n,scope,key,'NO_LONGER_ELIGIBLE');continue;
   }
   // Incomplete/upgrading/disconnected buildings retain intent, but receive no funding.
   if(!e1CheckActive(w,n,scope,key,e)||scope==='facility'&&e.policyId===E2_FOCUS_POLICY&&!e2FocusBillable(w,n,e1Building(w,Number(key)))){e.paidQuarterDay=null;continue;}
   fin.activeCount++;
   const gold=e.policyId===E2_FOCUS_POLICY?e2FocusQuarterCost(e1Building(w,Number(key))):
     e.policyId==='ASSIMILATION'?e4QuarterCost(w,key):
     e.policyId==='MASS_KILLING'?v06e5QuarterCost(w,key):Math.max(0,Math.floor(def.gold)),apUnits=Math.max(0,Math.floor(def.apUnits));
   if(e.policyId==='ASSIMILATION')e4RecordInvoice(w,n,e,gold);
   if(e.policyId==='MASS_KILLING')v06e5RecordInvoice(w,n,e,gold);
   fin.billedGold+=gold;fin.billedAPUnits+=apUnits;
   const price={gold,apUnits,knowledge:0,resources:{}};
   const paid=payCost(n,price,'civil');
   if(paid){fin.paidGold+=gold;fin.paidAPUnits+=apUnits;fin.fundedCount++;e.paidQuarterDay=w.dayIndex;}
   else{fin.unpaidGold+=gold;fin.unpaidAPUnits+=apUnits;e.paidQuarterDay=null;}
   if(e.policyId==='ASSIMILATION')e4RecordPayment(w,n,gold,paid);
   if(e.policyId==='MASS_KILLING')v06e5RecordPayment(w,n,gold,paid);
  }
 }
 fin.totalPaidGold+=fin.paidGold;fin.totalUnpaidGold+=fin.unpaidGold;
 fin.totalPaidAPUnits+=fin.paidAPUnits;fin.totalUnpaidAPUnits+=fin.unpaidAPUnits;
 // Preserve existing quarterly-report semantics if a future policy is actually funded.
 if(fin.paidGold&&n.lastQuarter)n.lastQuarter.goldNet-=fin.paidGold;
}
function e1Validate(w,fail){
 const int=(v)=>Number.isSafeInteger(v)&&v>=0;
 for(const n of w.nations){
  const g=n.governance,f=g?.finance;
  if(!g||g.schema!==E1_SCHEMA||!g.national||!Object.hasOwn(E3_TAX_RATES,g.national.tax)||!Object.hasOwn(E3_SERVICE_RATES,g.national.publicServices)||!E3A_SOCIAL_TIERS.includes(g.national.relief)||!E3A_SOCIAL_TIERS.includes(g.national.security)||
    !g.facilities||Array.isArray(g.facilities)||!g.cultures||Array.isArray(g.cultures)||!f||!Array.isArray(g.history)||g.history.length>E1_HISTORY_MAX)
     fail('E1 정책 구조');
  const kv=['billedGold','paidGold','unpaidGold','billedAPUnits','paidAPUnits','unpaidAPUnits','totalPaidGold','totalUnpaidGold','totalPaidAPUnits','totalUnpaidAPUnits','activeCount','fundedCount'];
  if(kv.some(k=>!int(f[k]))||!(f.lastQuarterDay===null||int(f.lastQuarterDay)&&f.lastQuarterDay<=w.dayIndex&&f.lastQuarterDay%30===0)||
    f.paidGold+f.unpaidGold!==f.billedGold||f.paidAPUnits+f.unpaidAPUnits!==f.billedAPUnits||f.fundedCount>f.activeCount)fail('E1 정책 회계');
  if(g.history.some(h=>!int(h.dayIndex)||h.dayIndex>w.dayIndex||!['START','STOP','ENDED'].includes(h.kind)||
    !['facility','culture','nation'].includes(h.scope)||typeof h.policyId!=='string'||h.policyId.length>80||typeof h.target!=='string'||h.target.length>150||typeof h.reason!=='string'||h.reason.length>80))fail('E1 정책 이력');
  for(const scope of ['facility','culture']){
    const bucket=scope==='facility'?g.facilities:g.cultures;
    if(Object.keys(bucket).length>10000)fail('E1 정책 개수 상한');
    for(const [key,e] of Object.entries(bucket)){
      const def=E1_DEFINITIONS[e?.policyId];
      if(!def?.enabled||def.scope!==scope||!int(e.startedDay)||!int(e.lastChangedDay)||e.startedDay>w.dayIndex||e.lastChangedDay>w.dayIndex||
        !(e.paidQuarterDay===null||int(e.paidQuarterDay)&&e.paidQuarterDay<=w.dayIndex&&e.paidQuarterDay%30===0)||
        (scope==='facility'&&(!/^(0|[1-9]\d*)$/.test(key)||!e1FacilityOwned(w,n.id,Number(key))))||
        (scope==='culture'&&(!/^\d+\|[^|]+$/.test(key)||!e1CheckActive(w,n,scope,key,e)))||
        (e.policyId==='ASSIMILATION'&&!e4ValidEntry(w,e))||
        (e.policyId==='MASS_KILLING'&&!v06e5ValidEntry(w,e)))fail('E1 정책 대상');
    }
  }
 }
 return true;
}
function e1GovernancePanel(w,n){const wrapper=make('div');wrapper.append(v06e6PolicyPanel(w,n),e3FiscalPanel(w,n),e4AssimilationPanel(w,n),v06e5PolicyPanel(w,n),e2GovernancePanel(w,n));return wrapper;}
// E3C: diagnostic-only records for policies moved out of nation policy controls.
function e3cUnifiedPolicyTelemetry(w,n){
 const section=make('section',{class:'overview-section','aria-label':'E6 E3A E4 E5 E2 E2A 통합 정책 진단'},[
   make('h3',{text:'E6 · E3A · E4 · E5 · E2 / E2A 통합 상태'}),
   make('p',{class:'muted-line',text:'국가 정책의 실제 조작은 국가 > 정책에서 진행합니다. 이 화면은 계측 상태만 확인합니다.'})]);
 const u=n.governance.unifiedAI,f=n.governance.fiscalAI,q=n.governance.serviceFinance,
   e2=n.governance.policyAI,viol=n.governance.violenceFinance,assim=n.governance.assimilationFinance;
 const text=(name,value)=>section.append(make('div',{class:'muted-line',text:name+' · '+value}));
 text('E6 정책 AI',`평가 ${u.assessments}회 · 변경 ${u.changes}회 · 마지막 ${u.lastReason}`);
 for(const h of (u.history||[]).slice(-5).reverse())text('E6 이력',`${h.dayIndex}일 · ${h.action} · ${h.key||'-'} · ${h.reason}`);
 text('E3A 재정 AI',`평가 ${f.assessments}회 · 변경 ${f.changes}회 · ${f.lastReason} · 복원 보류 ${f.e7b.blockedRestores}회`);
 for(const h of (f.history||[]).slice(-5).reverse())text('E3A 이력',`${h.dayIndex}일 · ${h.kind} · ${h.from}→${h.to} · ${h.reason}`);
 text('E3A 정책 지급',`서비스 ${q.paid}/${q.billed} G · 미납 ${q.totalUnpaid} G`);
 text('E4 문화 동화',`최근 전환 ${assim.converted}명 · 총 전환 ${assim.totalConverted}명 · 누적 지급 ${assim.totalPaid} G`);
 text('E5 국가폭력',`최근 사망 ${viol.killed}명 · 누적 ${viol.totalKilled}명 · 누적 지급 ${viol.totalPaid} G`);
 text('E2 생산 집중',`활성 시설 ${Object.keys(n.governance.facilities).length}개 · 최근 비용 ${n.governance.finance.paidGold}/${n.governance.finance.billedGold} G`);
 if(e2){section.append(e2aGovernanceSummary(w,n));}
 return section;
}
// -- end V0.6E1 policy foundation --

// V0.6E4 — deterministic, conservation-only cultural assimilation V1.
// Manual nation settlement/culture policy; E6 AI never starts this policy here.
// One quarter = 30 days. 0.004 per remaining target, saved fractional carry.
const E4_RATE=.004,E4_GOLD_PER_PERSON=.02,E4_CULTURE_PRESSURE=18;
function e4NewFinance(){return {lastQuarterDay:null,billed:0,paid:0,unpaid:0,converted:0,
 totalBilled:0,totalPaid:0,totalUnpaid:0,totalConverted:0};}
function e4MigrateWorld(w){for(const n of w.nations)n.governance.assimilationFinance??=e4NewFinance();}
function e4QuarterCost(w,key){
 const [sid,id]=key.split('|'),s=w.settlements.find(t=>t.id===Number(sid));
 const count=s?.culturePopulation?.[id]||0;
 return count>0?Math.max(1,Math.ceil(count*E4_GOLD_PER_PERSON)):0;
}
function e4RecordInvoice(w,n,e,gold){
 const f=n.governance.assimilationFinance;
 if(f.lastQuarterDay!==w.dayIndex){f.lastQuarterDay=w.dayIndex;f.billed=0;f.paid=0;f.unpaid=0;f.converted=0;}
 f.billed+=gold;f.totalBilled+=gold;
 e.lastBilledGold=gold;
}
function e4RecordPayment(w,n,gold,success){
 const f=n.governance.assimilationFinance;
 if(success){f.paid+=gold;f.totalPaid+=gold;}
 else{f.unpaid+=gold;f.totalUnpaid+=gold;}
}
function e4PruneAbsent(w,s){
 const n=w.nations[s.ownerId],bucket=n?.governance?.cultures;if(!bucket)return;
 const prefix=`${s.id}|`;
 for(const key of Object.keys(bucket))if(key.startsWith(prefix)){
  const id=key.slice(prefix.length);
  if(!(s.culturePopulation?.[id]>0)||id===n.primaryCultureId)e1PrunePolicy(w,n,'culture',key,'CULTURE_NOT_PRESENT');
 }
}
function e4CulturePressure(w,s,id){
 const e=w.nations[s.ownerId]?.governance?.cultures?.[`${s.id}|${id}`];
 return e?.policyId==='ASSIMILATION'&&e.paidQuarterDay===w.dayIndex?E4_CULTURE_PRESSURE:0;
}
function e4ValidEntry(w,e){
 const valid=x=>Number.isSafeInteger(x)&&x>=0;
 return Number.isFinite(e.carryProgress)&&e.carryProgress>=0&&e.carryProgress<10000&&
  valid(e.lastConverted)&&valid(e.totalConverted)&&e.lastConverted<=e.totalConverted&&
  (e.lastConvertedDay===null||valid(e.lastConvertedDay)&&e.lastConvertedDay<=w.dayIndex&&e.lastConvertedDay%30===0)&&
  (e.lastBilledGold===undefined||valid(e.lastBilledGold));
}
/** Preserve source cohorts' grievances and movement supporters when culture membership changes. */
function e4CarrySocial(w,s,source,target,amount){
 const pool=s.culturePopulation,oldTarget=pool[target]||0,fromCount=pool[source]||0;
 if(!amount||fromCount<amount)return;
 const src=s.civilGrievances.groups[source]||d1bNewGroup(),dst=s.civilGrievances.groups[target]||d1bNewGroup();
 const total=oldTarget+amount;
 const mix=(a,b)=>Math.round((a*oldTarget+b*amount)/total);
 for(const key of D1B_KEYS){
  if(key==='culture')continue; // recompute culture floor for the new identity
  dst[key]=mix(dst[key],src[key]);
  dst.delta[key]=mix(dst.delta[key],src.delta[key]);
  dst.ceilingQuarters[key]=mix(dst.ceilingQuarters[key],src.ceilingQuarters[key]);
  if(amount>oldTarget){dst.reasons[key]=src.reasons[key];dst.lastPressure[key]=src.lastPressure[key];dst.lastPressureDay[key]=src.lastPressureDay[key];}
 }
 dst.cultureEvent=mix(dst.cultureEvent,src.cultureEvent);
 dst.culture=d1bCultureScore(w,s,target,dst);
 dst.delta.culture=mix(dst.delta.culture,src.delta.culture);
 dst.ceilingQuarters.culture=mix(dst.ceilingQuarters.culture,src.ceilingQuarters.culture);
 if(amount>oldTarget){dst.reasons.culture=src.reasons.culture;dst.lastPressure.culture=src.lastPressure.culture;dst.lastPressureDay.culture=src.lastPressureDay.culture;}
 s.civilGrievances.groups[target]=dst;
 const political=s.politicalMovementGroups||{},srcPol=political[source]||d2aNewGroup(w.dayIndex),dstPol=political[target]||d2aNewGroup(w.dayIndex);
 for(const type of D2A_TYPE_ORDER)dstPol.streaks[type]=mix(dstPol.streaks[type],srcPol.streaks[type]);
 dstPol.cooldownUntil=Math.max(dstPol.cooldownUntil,srcPol.cooldownUntil);
 if(srcPol.movement){
  const movedSupport=Math.min(srcPol.movement.supporters,Math.floor(srcPol.movement.supporters*amount/fromCount));
  srcPol.movement.supporters-=movedSupport;
  if(!dstPol.movement){dstPol.movement=structuredClone(srcPol.movement);dstPol.movement.supporters=movedSupport;}
  else{dstPol.movement.supporters=Math.min(total,dstPol.movement.supporters+movedSupport);
   dstPol.movement.organization=mix(dstPol.movement.organization,srcPol.movement.organization);
   dstPol.movement.radicalization=mix(dstPol.movement.radicalization,srcPol.movement.radicalization);}
  dstPol.movement.authorityNationId=s.ownerId;
  if(dstPol.movement.type==='REUNIFICATION')dstPol.movement.claimNationId=d2aGoal(w,s,target,'REUNIFICATION');
 }
 political[target]=dstPol;
}
function e4ApplyQuarter(w){
 if(w.dayIndex%30!==0)return;
 for(const n of w.nations){
  const gov=n.governance,f=gov.assimilationFinance;
  if(f.lastQuarterDay!==w.dayIndex){f.lastQuarterDay=w.dayIndex;f.billed=0;f.paid=0;f.unpaid=0;f.converted=0;}
  const keys=Object.keys(gov.cultures).sort();
  for(const key of keys){
   const entry=gov.cultures[key];if(entry?.policyId!=='ASSIMILATION'||entry.paidQuarterDay!==w.dayIndex)continue;
   const [sid,source]=key.split('|'),s=w.settlements.find(t=>t.id===Number(sid));
   if(!s||s.ownerId!==n.id)continue;
   const count=s.culturePopulation?.[source]||0;
   const target=n.primaryCultureId;
   if(count<=0||source===target)continue;
   const progress=count*E4_RATE+entry.carryProgress;
   const converted=Math.min(count,Math.floor(progress+1e-10));
   entry.carryProgress=Math.max(0,progress-converted);
   entry.lastConverted=converted;
   entry.lastConvertedDay=w.dayIndex;
   if(converted){
    e4CarrySocial(w,s,source,target,converted);
    s.culturePopulation[source]-=converted;
    if(!s.culturePopulation[source])delete s.culturePopulation[source];
    s.culturePopulation[target]=(s.culturePopulation[target]||0)+converted;
    // No civilians created/lost and no changes to reserve, trainee or field armies.
    entry.totalConverted+=converted;f.converted+=converted;f.totalConverted+=converted;
    d1bSyncGroups(s,w);d2aSyncGroups(w,s);w.changeSeq++;
   }
   if(!(s.culturePopulation[source]>0))e1PrunePolicy(w,n,'culture',key,'CULTURE_FULLY_ASSIMILATED');
  }
 }
}
function e4Validate(w,fail){
 const integer=x=>Number.isSafeInteger(x)&&x>=0;
 for(const n of w.nations){
  const f=n.governance?.assimilationFinance;
  if(!f||['billed','paid','unpaid','converted','totalBilled','totalPaid','totalUnpaid','totalConverted'].some(k=>!integer(f[k]))||
    f.billed!==f.paid+f.unpaid||f.totalBilled!==f.totalPaid+f.totalUnpaid||f.paid>f.billed||f.converted>f.totalConverted||
    !(f.lastQuarterDay===null||integer(f.lastQuarterDay)&&f.lastQuarterDay<=w.dayIndex&&f.lastQuarterDay%30===0))fail('E4 동화 비용·인구 회계');
  if(f.lastQuarterDay===null&&(f.billed||f.paid||f.converted))fail('E4 정산 시점');
 }
}
function e4Audit(w){
 return {version:w.version,dayIndex:w.dayIndex,rate:E4_RATE,settlements:w.settlements.length,
  byNation:w.nations.map(n=>({id:n.id,name:n.name,activePolicies:Object.keys(n.governance.cultures).length,
   ...n.governance.assimilationFinance}))};
}
function e4AssimilationPanel(w,n){
 const section=make('section',{class:'overview-section','aria-label':'E4 정착지별 문화 동화 정책'});
 section.append(make('h3',{text:'E4 · 문화 동화 정책'}));
 const f=n.governance.assimilationFinance,control=n.controller==='PLAYER'&&n.active;
 section.append(make('p',{class:'muted-line',text:`대상 문화 인구 × 0.40% / 분기 · 분기당 대상 1인 × 0.02 Gold(올림) · 전액 지급 시에만 전환 · AI는 E6 재정·사회 평가에 따라 채택`}));
 section.append(make('p',{class:'muted-line',text:`최근 ${f.lastQuarterDay??'미정산'}일: 청구 ${number.format(f.billed)} G / 지급 ${number.format(f.paid)} G / 동화 ${number.format(f.converted)}명 · 누적 동화 ${number.format(f.totalConverted)}명`}));
 const rows=[];
 for(const s of w.settlements.filter(s=>s.ownerId===n.id).sort((a,b)=>a.id-b.id))
  for(const [id,count] of Object.entries(s.culturePopulation).filter(([id,c])=>id!==n.primaryCultureId&&c>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])))
   rows.push({s,id,count,record:n.governance.cultures[`${s.id}|${id}`]?.policyId==='ASSIMILATION'?n.governance.cultures[`${s.id}|${id}`]:null,blocked:n.governance.cultures[`${s.id}|${id}`]?.policyId==='MASS_KILLING'});
 if(!rows.length)section.append(make('p',{class:'muted-line',text:'동화 가능한 타문화 민간 집단이 없습니다.'}));
 for(const {s,id,count,record,blocked} of rows.slice(0,80)){
  const label=w.cultures.find(c=>c.id===id)?.name||id,due=Math.max(1,Math.ceil(count*E4_GOLD_PER_PERSON));
  const row=make('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',flexWrap:'wrap',padding:'7px 8px',border:'1px solid var(--line, #51606a)',borderRadius:'7px',margin:'6px 0'}});
  row.append(make('div',{},[
   make('strong',{text:`${settlementDisplayName(w,s)} · ${label} ${number.format(count)}명`}),
   make('div',{class:'muted-line',text:`${number.format(due)} G / 분기 · ${record?'ON':blocked?'학살 정책 시행 중':'OFF'}${record?` · 이번 분기 ${number.format(record.lastConverted)}명 · 누적 ${number.format(record.totalConverted)}명`:''}`})]));
  if(control){
   const button=make('button',{type:'button',class:'jump-button',text:record?'동화 OFF':blocked?'다른 정책 시행 중':'동화 ON','aria-label':`${s.name} ${label} 문화 동화 ${record?'중단':'시작'}`});
   button.disabled=!!blocked;
   button.addEventListener('click',()=>{
    const result=e1ChangePolicy(w,n.id,'ASSIMILATION',{settlementId:s.id,cultureId:id},!record,'PLAYER');
    showToast(result.ok?`${s.name} · ${label}: 동화 ${record?'OFF':'ON'}`:result.reason);renderNationOverview();
   });row.append(button);
  }
  section.append(row);
 }
 if(rows.length>80)section.append(make('p',{class:'muted-line',text:`동화 대상 ${rows.length}개 집단 중 80개만 표시` }));
 section.append(make('p',{class:'scope-note',text:'문화 인구 이외의 민간 인구, 군대·훈련·예비병은 동화가 변경하지 않습니다. 정책 집행은 문화적 반발을 유발할 수 있고, 기존 사회 불만·정치운동은 인구와 함께 승계합니다.'}));
 return section;
}
// -- end V0.6E4 assimilation --

// V0.6E5 — civilian state violence V1 (separate from legacy diplomatic E5*).
// Player-only, sparse settlement/culture policy. All outcomes deterministic and invoiced.
const V06E5_RATE=.005,V06E5_GOLD_PER_PERSON=.05,V06E5_HISTORY_LIMIT=120,V06E5_DIPLO_DAYS=1800;
const V06E5_PRESSURE=Object.freeze({safety:230,governance:180,culture:230});
function v06e5NewFinance(){return {lastQuarterDay:null,billed:0,paid:0,unpaid:0,killed:0,totalBilled:0,totalPaid:0,totalUnpaid:0,totalKilled:0};}
function v06e5NewWorldState(){return {schema:1,totalKilled:0,byTarget:{},events:[],reputation:{}};}
function v06e5MigrateWorld(w){
 w.v06e5Violence??=v06e5NewWorldState();
 for(const n of w.nations)n.governance.violenceFinance??=v06e5NewFinance();
}
function v06e5QuarterCost(w,key){
 const [sid,cid]=key.split('|'),s=w.settlements.find(t=>t.id===Number(sid));
 const count=s?.culturePopulation?.[cid]||0;
 return count>0?Math.max(1,Math.ceil(count*V06E5_GOLD_PER_PERSON)):0;
}
function v06e5RecordInvoice(w,n,e,gold){
 const f=n.governance.violenceFinance;
 if(f.lastQuarterDay!==w.dayIndex){f.lastQuarterDay=w.dayIndex;f.billed=0;f.paid=0;f.unpaid=0;f.killed=0;}
 f.billed+=gold;f.totalBilled+=gold;e.lastBilledGold=gold;
}
function v06e5RecordPayment(w,n,gold,paid){
 const f=n.governance.violenceFinance;
 if(paid){f.paid+=gold;f.totalPaid+=gold;}else{f.unpaid+=gold;f.totalUnpaid+=gold;}
}
function v06e5Pressure(w,s,cultureId,key){
 const e=w.nations[s.ownerId]?.governance?.cultures?.[`${s.id}|${cultureId}`];
 return e?.policyId==='MASS_KILLING'&&e.paidQuarterDay===w.dayIndex?(V06E5_PRESSURE[key]||0):0;
}
function v06e5ValidEntry(w,e){
 const int=x=>Number.isSafeInteger(x)&&x>=0;
 return Number.isFinite(e.carryProgress)&&e.carryProgress>=0&&e.carryProgress<10000&&
  int(e.lastKilled)&&int(e.totalKilled)&&e.lastKilled<=e.totalKilled&&
  (e.lastKilledDay===null||int(e.lastKilledDay)&&e.lastKilledDay<=w.dayIndex&&e.lastKilledDay%30===0)&&
  (e.lastBilledGold===undefined||int(e.lastBilledGold));
}
function v06e5ReputationStep(w,nationId,cultureId,killed){
 const r=w.v06e5Violence.reputation,old=r[nationId],prev=old?.severity||0;
 // Recent incidents accumulate, capped. No all-to-all stored relations are mutated.
 const validPrevious=old&&w.dayIndex-old.lastIncidentDay<V06E5_DIPLO_DAYS;
 const strength=Math.min(30,Math.max(8,Math.round(Math.log2(1+killed)*3)));
 r[nationId]={lastIncidentDay:w.dayIndex,severity:Math.min(45,(validPrevious?prev:0)+Math.max(1,Math.round(strength/6))),
  totalKilled:(old?.totalKilled||0)+killed,lastVictimCultureId:cultureId};
 // Invalidates cached bilateral sentiment on the same day without changing RNG.
 e5InvalidateRelations(w);
}
function v06e5DiplomaticPenalty(w,a,b){
 const by=w.v06e5Violence?.reputation;if(!by||a===b)return 0;
 let total=0;
 for(const [perp,other] of [[a,b],[b,a]]){
  const r=by[perp];if(!r)continue;
  const elapsed=w.dayIndex-r.lastIncidentDay;
  if(elapsed<0||elapsed>=V06E5_DIPLO_DAYS)continue;
  const related=(w.nations[other]?.primaryCultureId===r.lastVictimCultureId);
  total+=Math.ceil((r.severity+(related?8:0))*(V06E5_DIPLO_DAYS-elapsed)/V06E5_DIPLO_DAYS);
 }
 return total?-Math.min(60,total):0;
}
function v06e5ApplyQuarter(w){
 if(w.dayIndex%30!==0)return;
 const state=w.v06e5Violence;
 for(const n of w.nations){
  const f=n.governance.violenceFinance;
  if(f.lastQuarterDay!==w.dayIndex){f.lastQuarterDay=w.dayIndex;f.billed=0;f.paid=0;f.unpaid=0;f.killed=0;}
  // The player may transfer control after invoicing but before effects; never let AI continue it.
  if(n.controller!=='PLAYER'&&!(n.controller==='AI'&&w.v06e6Policy?.enabled===true&&w.v06e6Policy.allowAIViolence===true)){
   for(const [key,e] of Object.entries(n.governance.cultures))if(e.policyId==='MASS_KILLING')e1PrunePolicy(w,n,'culture',key,'AI_CONTROL_TRANSFER');
   continue;
  }
  for(const key of Object.keys(n.governance.cultures).sort()){
   const e=n.governance.cultures[key];
   if(e?.policyId!=='MASS_KILLING'||e.paidQuarterDay!==w.dayIndex)continue;
   const [sid,cid]=key.split('|'),s=w.settlements.find(x=>x.id===Number(sid));
   if(!s||s.ownerId!==n.id||!(s.culturePopulation?.[cid]>0))continue;
   const original=s.culturePopulation[cid];
   const accumulated=original*V06E5_RATE+e.carryProgress;
   const killed=Math.min(original,Math.floor(accumulated+1e-10));
   e.carryProgress=Math.max(0,accumulated-killed);
   e.lastKilled=killed;e.lastKilledDay=w.dayIndex;
   if(killed<=0)continue;
   // Physical headcount changes ONLY in targeted civilians. No army, reserve or trainee is touched.
   s.population-=killed;s.culturePopulation[cid]-=killed;
   if(s.culturePopulation[cid]===0)delete s.culturePopulation[cid];
   e.totalKilled+=killed;f.killed+=killed;f.totalKilled+=killed;state.totalKilled+=killed;
   const record=state.byTarget[key]||(state.byTarget[key]={totalKilled:0,lastIncidentDay:null,lastPerpetratorId:null});
   record.totalKilled+=killed;record.lastIncidentDay=w.dayIndex;record.lastPerpetratorId=n.id;
   state.events.push({dayIndex:w.dayIndex,nationId:n.id,settlementId:s.id,cultureId:cid,killed});
   if(state.events.length>V06E5_HISTORY_LIMIT)state.events.splice(0,state.events.length-V06E5_HISTORY_LIMIT);
   v06e5ReputationStep(w,n.id,cid,killed);
   // Distribute lost supporters proportionally within the surviving cultural cohort.
   const movement=s.politicalMovementGroups?.[cid]?.movement;
   if(movement)movement.supporters=Math.min(original-killed,Math.round(movement.supporters*(original-killed)/original));
   d1bSyncGroups(s,w);d2aSyncGroups(w,s);refreshSettlementLevel(s);w.changeSeq++;
   if(!(s.culturePopulation[cid]>0))e1PrunePolicy(w,n,'culture',key,'CULTURE_DEPOPULATED');
  }
 }
}
function v06e5Validate(w,fail){
 const int=x=>Number.isSafeInteger(x)&&x>=0,st=w.v06e5Violence;
 if(!st||st.schema!==1||!int(st.totalKilled)||!st.byTarget||!st.reputation||!Array.isArray(st.events)||st.events.length>V06E5_HISTORY_LIMIT)fail('E5 국가폭력 장부');
 let sum=0;
 for(const [key,r] of Object.entries(st.byTarget)){
  const [sid,cid]=key.split('|');
  if(!/^\d+\|culture_\d+$/.test(key)||!w.cultures.some(c=>c.id===cid)||
   !int(r.totalKilled)||!int(r.lastIncidentDay)||r.lastIncidentDay>w.dayIndex||!w.nations[r.lastPerpetratorId])fail('E5 피해 대상 역사');
  sum+=r.totalKilled;
 }
 if(sum!==st.totalKilled)fail('E5 총 사망 인구 합계');
 for(const e of st.events)if(!int(e.dayIndex)||e.dayIndex>w.dayIndex||e.dayIndex%30||!w.nations[e.nationId]||!int(e.settlementId)||!w.cultures.some(c=>c.id===e.cultureId)||!int(e.killed)||e.killed<1)fail('E5 사건 이력');
 for(const [nid,r] of Object.entries(st.reputation))if(!w.nations[Number(nid)]||!int(r.lastIncidentDay)||r.lastIncidentDay>w.dayIndex||!int(r.totalKilled)||!int(r.severity)||r.severity>45||!w.cultures.some(c=>c.id===r.lastVictimCultureId))fail('E5 외교 평판');
 let nationDeaths=0;
 for(const n of w.nations){
  const f=n.governance?.violenceFinance;
  if(!f||['billed','paid','unpaid','killed','totalBilled','totalPaid','totalUnpaid','totalKilled'].some(k=>!int(f[k]))||
   f.billed!==f.paid+f.unpaid||f.totalBilled!==f.totalPaid+f.totalUnpaid||f.killed>f.totalKilled||
   !(f.lastQuarterDay===null||int(f.lastQuarterDay)&&f.lastQuarterDay<=w.dayIndex&&f.lastQuarterDay%30===0))fail('E5 운영비·사망 회계');
  nationDeaths+=f.totalKilled;
 }
 if(nationDeaths!==st.totalKilled)fail('E5 국가별 누적 사망 합계');
}
function v06e5Audit(w){
 return {version:w.version,dayIndex:w.dayIndex,totalKilled:w.v06e5Violence.totalKilled,byTarget:w.v06e5Violence.byTarget,
   recentEvents:w.v06e5Violence.events.slice(-15),byNation:w.nations.map(n=>({id:n.id,name:n.name,...n.governance.violenceFinance}))};
}
function v06e5PolicyPanel(w,n){
 const section=make('section',{class:'overview-section','aria-label':'E5 국가폭력·학살 정책'});
 section.append(make('h3',{text:'E5 · 국가폭력·학살 정책'}));
 const f=n.governance.violenceFinance,control=n.controller==='PLAYER'&&n.active;
 section.append(make('p',{class:'muted-line',text:'정착지·타문화 집단별 수동 시행 / 분기당 대상 인구 0.5% 사망 / 1인 × 0.05 Gold 청구 / 미납 시 시행 중단 / AI 자동 시행 없음'}));
 section.append(make('p',{class:'muted-line',text:`최근 분기: 사망 ${number.format(f.killed)}명 · 청구 ${number.format(f.billed)} G · 지급 ${number.format(f.paid)} G · 누적 사망 ${number.format(f.totalKilled)}명 · 전 세계 누적 ${number.format(w.v06e5Violence.totalKilled)}명`}));
 const rows=[];
 for(const s of w.settlements.filter(s=>s.ownerId===n.id).sort((a,b)=>a.id-b.id))
  for(const [cid,count] of Object.entries(s.culturePopulation).filter(([id,c])=>id!==n.primaryCultureId&&c>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])))
   rows.push({s,cid,count,e:n.governance.cultures[`${s.id}|${cid}`]});
 if(!rows.length)section.append(make('p',{class:'muted-line',text:'대상으로 지정할 타문화 민간집단이 없습니다.'}));
 for(const {s,cid,count,e} of rows.slice(0,80)){
  const label=w.cultures.find(c=>c.id===cid)?.name||cid,enabled=e?.policyId==='MASS_KILLING';
  const row=make('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',flexWrap:'wrap',padding:'7px 8px',border:'1px solid var(--line, #51606a)',borderRadius:'7px',margin:'6px 0'}});
  row.append(make('div',{},[make('strong',{text:`${settlementDisplayName(w,s)} · ${label} ${number.format(count)}명`}),
   make('div',{class:'muted-line',text:`${number.format(Math.max(1,Math.ceil(count*V06E5_GOLD_PER_PERSON)))} G / 분기 · ${enabled?'ON':(e?.policyId==='ASSIMILATION'?'동화 정책 시행 중':'OFF')}${enabled?` · 누적 사망 ${number.format(e.totalKilled)}명`:''}`})]));
  if(control){
   const b=make('button',{type:'button',class:'jump-button',text:enabled?'정책 중단':e?'다른 정책 중':'정책 시행'});
   b.disabled=!!e&&!enabled;
   b.addEventListener('click',()=>{
    if(!enabled&&!window.confirm(`${s.name}의 ${label} 민간인을 대상으로 국가폭력을 시행할까요? 실제 인구 감소와 사회적·외교적 결과가 발생합니다.`))return;
    const result=e1ChangePolicy(w,n.id,'MASS_KILLING',{settlementId:s.id,cultureId:cid},!enabled,'PLAYER');
    showToast(result.ok?`${s.name} · ${label}: 국가폭력 ${enabled?'종료':'시행'}`:result.reason);renderNationOverview();
   });row.append(b);
  }
  section.append(row);
 }
 section.append(make('p',{class:'scope-note',text:'실제 민간인 사망은 문화 인구 및 정착지 총인구에서 차감합니다. 군대·예비병·훈련병은 직접 변경하지 않습니다. 시행 중단 이후에도 사망 기록과 외교 평판이 보존됩니다.'}));
 return section;
}
// -- end V0.6E5 state violence module --



// V0.6E7A — observation-only policy AI diagnostics. Never reads RNG or writes simulation resources.
const V06E7A_HISTORY=48,V06E7A_TOP=12,V06E7A_TRANSITIONS=160;
const V06E7A_CULTURE_REASONS=Object.freeze(['LOW_POPULATION','LOW_SHARE','ALREADY_POLICY','LOW_SCORE','FISCAL_REJECT','QUALIFIED','AI_VIOLENCE_DISABLED','VIOLENCE_PROFILE','VIOLENCE_SOCIAL','VIOLENCE_WAR','VIOLENCE_POP_SHARE','VIOLENCE_SCORE','VIOLENCE_FISCAL','VIOLENCE_ALREADY_POLICY','VIOLENCE_QUALIFIED']);
function v06e7aNation(){return {evaluations:{FACILITY:0,FISCAL:0,FISCAL_EMERGENCY:0,CULTURE:0},changes:0,holds:0,shortReversals:0,longReversals:0,holdDays:0,durations:[],reasonCounts:{},candidateCounts:{},history:[],quarters:[],transitions:{},lastPopulation:null,lastConverted:null,lastKilled:null,grievanceStreaks:{},lastGrievanceDay:null,pendingForecast:null};}
function v06e7aInit(w,mode='LIGHT'){
 w.v06e7aDiagnostics={schema:1,mode,nations:{},lastQuarterDay:null};
 for(const n of w.nations){const s=v06e7aNation();s.lastConverted=n.governance?.assimilationFinance?.totalConverted||0;s.lastKilled=n.governance?.violenceFinance?.totalKilled||0;s.lastPopulation=w.settlements.reduce((a,t)=>a+(t.ownerId===n.id?t.population:0),0);w.v06e7aDiagnostics.nations[n.id]=s;}
}
// E7A1: Keep observation baselines current even when collection is OFF. No game state is touched.
function v06e7aSyncBaseline(w,n,s){
 s.lastPopulation=w.settlements.reduce((sum,t)=>sum+(t.ownerId===n.id?t.population:0),0);
 s.lastConverted=n.governance?.assimilationFinance?.totalConverted||0;
 s.lastKilled=n.governance?.violenceFinance?.totalKilled||0;
}
function v06e7aSetMode(w,mode){
 const state=w.v06e7aDiagnostics;
 if(!state||!['OFF','LIGHT','DETAIL'].includes(mode))return false;
 if(state.mode===mode)return true;
 // Drop any forecast made before or during an unobserved period.
 if(state.mode==='OFF'||mode==='OFF')for(const n of w.nations){
  const s=state.nations[n.id]??(state.nations[n.id]=v06e7aNation());
  v06e7aSyncBaseline(w,n,s);s.pendingForecast=null;
  s.grievanceStreaks={};s.lastGrievanceDay=null;
 }
 state.mode=mode;return true;
}
function v06e7aState(w,n){if(!w.v06e7aDiagnostics||w.v06e7aDiagnostics.mode==='OFF')return null;return w.v06e7aDiagnostics.nations[n.id]??(w.v06e7aDiagnostics.nations[n.id]=v06e7aNation());}
function v06e7aCount(obj,key,n=1){obj[key]=(obj[key]||0)+n;}
function v06e7aRecord(w,n,kind,action,detail={}){
 const s=v06e7aState(w,n);if(!s)return;
 if(action==='EVALUATE'&&kind in s.evaluations)v06e7aCount(s.evaluations,kind);
 if(action==='HOLD')s.holds++;
 v06e7aCount(s.reasonCounts,detail.reason||action);
 if(action==='CHANGE')s.changes++;
 const entry={dayIndex:w.dayIndex,kind,action,reason:detail.reason||action};
 if(detail.key!==undefined)entry.key=detail.key;
 if(detail.from!==undefined)entry.from=detail.from;
 if(detail.to!==undefined)entry.to=detail.to;
 if(detail.expectedNet!==undefined)entry.expectedNet=Math.round(detail.expectedNet);
 if(detail.score!==undefined)entry.score=Number(detail.score.toFixed(2));
 s.history.push(entry);if(s.history.length>V06E7A_HISTORY)s.history.shift();
}
function v06e7aCandidate(w,n,reason,detail=null){
 const s=v06e7aState(w,n);if(!s)return;
 v06e7aCount(s.candidateCounts,reason);
 if(w.v06e7aDiagnostics.mode==='DETAIL'&&detail){
  const key=`CANDIDATE:${reason}`;
  if(s.history.filter(x=>x.kind===key&&x.dayIndex===w.dayIndex).length<2){
   s.history.push({dayIndex:w.dayIndex,kind:key,action:'REJECT_OR_QUALIFY',reason,key:detail.key,score:detail.score===undefined?undefined:Number(detail.score.toFixed(2))});
   if(s.history.length>V06E7A_HISTORY)s.history.shift();
  }
 }
}
function v06e7aTransition(w,n,key,from,to){
 const s=v06e7aState(w,n);if(!s||from===to)return;
 const previous=s.transitions[key];
 if(previous&&previous.to===from&&previous.from===to){const span=w.dayIndex-previous.dayIndex;if(span<=240)s.shortReversals++;if(span<=480)s.longReversals++;if(span>=0)s.holdDays+=span;}
 if(previous&&from!=='OFF'&&to==='OFF'&&previous.to===from){s.durations.push(w.dayIndex-previous.dayIndex);if(s.durations.length>V06E7A_HISTORY)s.durations.shift();}
 s.transitions[key]={dayIndex:w.dayIndex,from,to};
 // Bounded journal: retain the most recent transitions only.
 if(Object.keys(s.transitions).length>V06E7A_TRANSITIONS){const first=Object.entries(s.transitions).sort((a,b)=>a[1].dayIndex-b[1].dayIndex||a[0].localeCompare(b[0]))[0];delete s.transitions[first[0]];}
}
function v06e7aForecastRecord(w,n,kind,forecast){
 const s=v06e7aState(w,n);if(!s||!forecast)return;
 s.pendingForecast={madeDay:w.dayIndex,source:kind,income:Math.round(forecast.income),essential:Math.round(forecast.essential),net:Math.round(forecast.net),dues:Math.round(forecast.dues||0)};
}
function v06e7aQuarter(w){
 const state=w.v06e7aDiagnostics;
 if(!state||w.dayIndex%30!==0)return;
 if(state.mode==='OFF'){
  // E7A1: OFF quarters are NOT recorded, but their cumulative counters must not
  // be charged to the first quarter after observation resumes.
  for(const n of w.nations){
   const s=state.nations[n.id]??(state.nations[n.id]=v06e7aNation());
   v06e7aSyncBaseline(w,n,s);s.pendingForecast=null;
   s.grievanceStreaks={};s.lastGrievanceDay=null;
  }
  return;
 }
 state.lastQuarterDay=w.dayIndex;
 for(const n of w.nations){
  let s=state.nations[n.id];if(!s){s=v06e7aNation();state.nations[n.id]=s;}
  const population=w.settlements.reduce((sum,t)=>sum+(t.ownerId===n.id?t.population:0),0);
  const converted=n.governance?.assimilationFinance?.totalConverted||0,killed=n.governance?.violenceFinance?.totalKilled||0;
  const actual=n.lastQuarter||{};
  const actualDue=(n.governance?.finance?.paidGold||0)+(n.governance?.serviceFinance?.paid||0)+(n.governance?.socialFinance?.paid||0);
  const next={dayIndex:w.dayIndex,population,netPopulation:s.lastPopulation===null?null:population-s.lastPopulation,converted:Math.max(0,converted-(s.lastConverted??converted)),killed:Math.max(0,killed-(s.lastKilled??killed)),policyPaid:actualDue,civilUnpaid:actual.civilUnpaid||0,forecast:null,caps:0};
  // Forecast from the preceding AI assessment is NOT the same-quarter invoice; label as next-settlement comparison.
  if(s.pendingForecast&&s.pendingForecast.madeDay<w.dayIndex){const p=s.pendingForecast;next.forecast={madeDay:p.madeDay,source:p.source,expectedNet:p.net,actualNet:typeof actual.goldNet==='number'?Math.round(actual.goldNet):null,error:typeof actual.goldNet==='number'?Math.round(actual.goldNet-p.net):null};s.pendingForecast=null;}
  if(s.lastGrievanceDay!==w.dayIndex){
   const seen=new Set();
   for(const town of w.settlements){if(town.ownerId!==n.id)continue;
    for(const [cid,group] of Object.entries(town.civilGrievances?.groups||{})){
     const values=group?.values||group||{};
     if(!['economy','safety','governance','culture'].some(field=>Number(values[field])>=1000))continue;
     const key=`${town.id}|${cid}`;seen.add(key);next.caps++;
     const old=s.grievanceStreaks[key];s.grievanceStreaks[key]={days:(old?.lastDay===w.dayIndex-30?(old.days+30):30),lastDay:w.dayIndex};
    }
   }
   for(const key of Object.keys(s.grievanceStreaks))if(!seen.has(key))delete s.grievanceStreaks[key];
   s.lastGrievanceDay=w.dayIndex;
  }
  s.lastPopulation=population;s.lastConverted=converted;s.lastKilled=killed;
  s.quarters.push(next);if(s.quarters.length>V06E7A_HISTORY)s.quarters.shift();
 }
}
function v06e7aValidate(w,fail){
 const root=w.v06e7aDiagnostics;
 if(!root||root.schema!==1||!['OFF','LIGHT','DETAIL'].includes(root.mode)||typeof root.nations!=='object'||Array.isArray(root.nations))fail('E7A 진단 설정');
 for(const n of w.nations){const s=root.nations[n.id];
  if(!s||!s.evaluations||!s.reasonCounts||!s.candidateCounts||!Array.isArray(s.history)||s.history.length>V06E7A_HISTORY||!Array.isArray(s.quarters)||s.quarters.length>V06E7A_HISTORY||!Array.isArray(s.durations)||s.durations.length>V06E7A_HISTORY||s.durations.some(x=>!Number.isSafeInteger(x)||x<0)||!s.transitions||typeof s.transitions!=='object'||Object.keys(s.transitions).length>V06E7A_TRANSITIONS||!s.grievanceStreaks||typeof s.grievanceStreaks!=='object'||s.history.some(h=>!Number.isSafeInteger(h.dayIndex)||h.dayIndex>w.dayIndex)||s.quarters.some((q,i)=>!Number.isSafeInteger(q.dayIndex)||q.dayIndex>w.dayIndex||q.dayIndex%30||i>0&&s.quarters[i-1].dayIndex>=q.dayIndex||['population','converted','killed','policyPaid','civilUnpaid','caps'].some(k=>!Number.isSafeInteger(q[k])||q[k]<0))||!['FACILITY','FISCAL','FISCAL_EMERGENCY','CULTURE'].every(k=>Number.isSafeInteger(s.evaluations[k])&&s.evaluations[k]>=0)||Object.values(s.evaluations).some(v=>!Number.isSafeInteger(v)||v<0)||!Number.isSafeInteger(s.holdDays)||s.holdDays<0||Object.values(s.candidateCounts).some(v=>!Number.isSafeInteger(v)||v<0)||Object.values(s.reasonCounts).some(v=>!Number.isSafeInteger(v)||v<0)||['changes','holds','shortReversals','longReversals'].some(key=>!Number.isSafeInteger(s[key])||s[key]<0)||s.shortReversals>s.longReversals)fail('E7A 국가 진단 장부');
 }
}
function v06e7aAudit(w){
 const d=w.v06e7aDiagnostics;
 return {version:w.version,dayIndex:w.dayIndex,mode:d.mode,nations:w.nations.map(n=>({id:n.id,name:n.name,controller:n.controller,...structuredClone(d.nations[n.id])}))};
}
function v06e7aCSV(w){
 const escape=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 const columns=['nationId','nation','dayIndex','population','netPopulation','converted','killed','policyPaid','civilUnpaid','caps','expectedNet','actualNet','forecastError'];
 const rows=[columns.map(escape).join(',')];
 for(const n of w.nations)for(const q of w.v06e7aDiagnostics.nations[n.id]?.quarters||[]){
  const rec={nationId:n.id,nation:n.name,...q,expectedNet:q.forecast?.expectedNet,actualNet:q.forecast?.actualNet,forecastError:q.forecast?.error};rows.push(columns.map(key=>escape(rec[key])).join(','));
 }
 return '\uFEFF'+rows.join('\n');
}
function v06e7aPanel(w,n){
 const d=w.v06e7aDiagnostics,s=d.nations[n.id]??(d.nations[n.id]=v06e7aNation());
 const section=make('section',{class:'overview-section','aria-label':'E7A1 정책 AI 진단'},[make('h3',{text:'E7A1 · 정책 AI 진단'})]);
 section.append(make('p',{class:'muted-line',text:`계측 ${d.mode} · 평가 시설 ${s.evaluations.FACILITY} / 재정 ${s.evaluations.FISCAL} / 긴급 ${s.evaluations.FISCAL_EMERGENCY} / 문화 ${s.evaluations.CULTURE} · 변경 ${s.changes} · 240일 역전 ${s.shortReversals} · 480일 역전 ${s.longReversals}`}));
 const c=Object.entries(s.candidateCounts).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([a,b])=>`${a}:${b}`).join(' · ');
 section.append(make('p',{class:'muted-line',text:`정책 후보·탈락 사유: ${c||'관측 대기'}`}));
 const q=s.quarters.at(-1);
 if(s.durations.length){const sorted=s.durations.slice().sort((a,b)=>a-b),average=Math.round(s.durations.reduce((a,b)=>a+b,0)/s.durations.length),median=sorted[Math.floor(sorted.length/2)];section.append(make('p',{class:'muted-line',text:`완료된 정책 유지기간 ${s.durations.length}건 · 평균 ${average}일 · 중앙값 ${median}일`}));}
 if(q)section.append(make('p',{class:'muted-line',text:`최근 분기 ${q.dayIndex}일 · 동화 ${q.converted}명 · 정책 사망 ${q.killed}명 · 실제 E1·공공·사회정책 지급 ${q.policyPaid}G · 불만 상한 집단 ${q.caps}개${q.forecast?` · 예측 대비 실제 골드 순변화 오차 ${q.forecast.error??'미기록'}G`:''}`}));
 const actions=make('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',margin:'9px 0'}});
 for(const mode of ['OFF','LIGHT','DETAIL']){
  const button=make('button',{type:'button',class:'jump-button',text:`${mode}${d.mode===mode?' ✓':''}`,'aria-label':`E7A ${mode}`});
  button.addEventListener('click',()=>{v06e7aSetMode(w,mode);e3cRefreshPolicyAudit();showToast(`E7A1 진단 ${mode}`);});actions.append(button);
 }
 for(const [type,label] of [['json','진단 JSON'],['csv','분기 CSV']]){
  const button=make('button',{type:'button',class:'jump-button',text:label});
  button.addEventListener('click',()=>{if(type==='json')download(`vilob-e7a1-ai-day${w.dayIndex}.json`,JSON.stringify(v06e7aAudit(w),null,2),'application/json');else download(`vilob-e7a1-quarter-day${w.dayIndex}.csv`,v06e7aCSV(w),'text/csv');});actions.append(button);
 }
 section.append(actions);
 for(const entry of s.history.slice(-4).reverse())section.append(make('p',{class:'muted-line',text:`${entry.dayIndex}일 · ${entry.kind} ${entry.action} · ${entry.reason}${entry.key?' · '+entry.key:''}`}));
 section.append(make('p',{class:'scope-note',text:'관측 전용: AI 판단·자원·RNG는 변경하지 않음. OFF 기간 정책 효과는 재활성화 분기에 합산하지 않음. 재정 예측·실제 장부는 서로 다른 시점이며 후보별 거절 사유는 E6 평가 시 집계.'}));
 return section;
}
// -- end V0.6E7A --

// V0.6E7C — National Policy Final Audit V1.
// Read-only, on-demand, linear-time scan. Not referenced from daily / quarterly simulation.
// No RNG reads, no persistent fields, no projectedQuarter() or extra per-tick forecast.
function v06e7cAuditWorld(w){
 const isInt=x=>Number.isSafeInteger(x)&&x>=0;
 const counts=new Map(),caps=new Map(),groups=new Map();
 for(const s of w.settlements){
  if(!counts.has(s.ownerId))counts.set(s.ownerId,{population:0,settlements:0});
  const entry=counts.get(s.ownerId);entry.population+=s.population;entry.settlements++;
  for(const g of Object.values(s.civilGrievances?.groups||{})){
   const v=g?.values||g||{};
   const present=['economy','safety','governance','culture'].some(k=>v[k]>=1000);
   if(present)caps.set(s.ownerId,(caps.get(s.ownerId)||0)+1);
   groups.set(s.ownerId,(groups.get(s.ownerId)||0)+1);
  }
 }
 const summary={activeNations:0,aiNations:0,population:0,crisis:0,recovery:0,normal:0,
  snapshotRisk:0,underfundedBuffer:0,negativeNet:0,civilUnpaidNations:0,militaryArrearsNations:0,
  lastQuarterCivilUnpaid:0,assimilated:0,killed:0,cappedGroups:0,policyLedgerDiscrepancies:0};
 const issues=[];const records=[];
 for(const n of w.nations){
  const last=n.lastQuarter||{},c=last.civil||{},f=n.governance?.fiscalAI?.e7b||{};
  const civ=n.civilFinance||{},g=n.governance||{};
  const due=w.v06e6Policy?.enabled&&n.active?v06e6PolicyDues(w,n):0;
  const essential=Math.max(1,(last.upkeep||0)+(c.total||0)+due);
  const net=(last.goldIncome||0)-essential,buffer=n.gold/essential;
  const arrears={civil:(last.civilUnpaid||0)>0,military:(n.military?.unpaidQuarters||0)>0,operations:(n.military?.operationArrears||0)>0};
  const crisis=arrears.civil||arrears.military||arrears.operations||buffer<3||net<0&&buffer<6;
  const healthy=!arrears.civil&&!arrears.military&&!arrears.operations&&net>=0&&buffer>=E7B_RECOVERY_BUFFER;
  const ledgers=[['CIVIL',civ.billedLastQuarter,civ.paidLastQuarter,civ.unpaidLastQuarter],
   ['E1_POLICY_GOLD',g.finance?.billedGold,g.finance?.paidGold,g.finance?.unpaidGold],
   ['E1_POLICY_AP',g.finance?.billedAPUnits,g.finance?.paidAPUnits,g.finance?.unpaidAPUnits],
   ['PUBLIC_SERVICE',g.serviceFinance?.billed,g.serviceFinance?.paid,g.serviceFinance?.unpaid],
   ['SOCIAL',g.socialFinance?.billed,g.socialFinance?.paid,g.socialFinance?.unpaid],
   ['ASSIMILATION',g.assimilationFinance?.billed,g.assimilationFinance?.paid,g.assimilationFinance?.unpaid],
   ['STATE_VIOLENCE',g.violenceFinance?.billed,g.violenceFinance?.paid,g.violenceFinance?.unpaid]];
  for(const [kind,billed,paid,unpaid] of ledgers){
   if(!isInt(billed)||!isInt(paid)||!isInt(unpaid)||billed!==paid+unpaid)
    issues.push({nationId:n.id,kind,reason:'BILLED_NE_PAID_PLUS_UNPAID',billed,paid,unpaid});
  }
  // Public/social policy invoices are components of civilian maintenance: never sum these twice.
  const knownCivil=g.serviceFinance?.billed||0,knownSocial=g.socialFinance?.billed||0;
  if(knownCivil+knownSocial>(civ.billedLastQuarter||0))issues.push({nationId:n.id,kind:'CIVIL_COMPONENTS',reason:'SUBINVOICE_EXCEEDS_TOTAL'});
  if(n.active){summary.activeNations++;summary.population+=(counts.get(n.id)?.population||0);
   if(n.controller==='AI')summary.aiNations++;
   if(f.phase==='CRISIS')summary.crisis++;
   if(f.phase==='RECOVERY')summary.recovery++;
   if(f.phase==='NORMAL')summary.normal++;
   if(crisis)summary.snapshotRisk++;
   if(buffer<3)summary.underfundedBuffer++;
   if(net<0)summary.negativeNet++;
   if(arrears.civil)summary.civilUnpaidNations++;
   if(arrears.military||arrears.operations)summary.militaryArrearsNations++;
   summary.lastQuarterCivilUnpaid+=(last.civilUnpaid||0);
   summary.cappedGroups+=(caps.get(n.id)||0);
  }
  summary.assimilated+=g.assimilationFinance?.totalConverted||0;
  summary.killed+=g.violenceFinance?.totalKilled||0;
  records.push({nationId:n.id,nation:n.name,active:n.active,controller:n.controller,
   population:counts.get(n.id)?.population||0,settlements:counts.get(n.id)?.settlements||0,
   cultureGroups:groups.get(n.id)||0,cappedGroups:caps.get(n.id)||0,
   fiscalPhase:f.phase||'UNINITIALIZED',gold:n.gold,essential,estimatedNet:net,
   bufferQuarters:Number(buffer.toFixed(4)),snapshotRisk:crisis,recoveryEligibleNow:healthy,
   reasons:{civilUnpaid:arrears.civil,militaryUnpaidRecord:arrears.military,operationArrears:arrears.operations,
    bufferBelow3:buffer<3,negativeNet:net<0,negativeNetLowBuffer:net<0&&buffer<6},
   lastQuarterCivilUnpaid:last.civilUnpaid||0,cumulativeCivilUnpaid:civ.totalUnpaid||0,
   lastQuarterE1Paid:g.finance?.paidGold||0,converted:g.assimilationFinance?.totalConverted||0,
   killed:g.violenceFinance?.totalKilled||0,blockedRestores:f.blockedRestores||0});
 }
 summary.policyLedgerDiscrepancies=issues.length;
 const historicalKilled=w.v06e5Violence?.totalKilled;
 if(isInt(historicalKilled)&&historicalKilled!==summary.killed)
  issues.push({kind:'WORLD_VIOLENCE_TOTAL',reason:'GLOBAL_VS_NATIONS',historicalKilled,nationTotal:summary.killed});
 summary.policyLedgerDiscrepancies=issues.length;
 return {schema:'vilob-light-v06e7c-audit-v1',version:w.version,seed:w.seed,dayIndex:w.dayIndex,
  source:'READ_ONLY_ON_DEMAND',caveat:'Snapshot budget uses E7B lastQuarter and current active policy dues; not a next-quarter invoice. Fiscal phase is the historical state machine, snapshotRisk is a current snapshot.',
  summary,issues,nations:records};
}
function v06e7cAuditCSV(audit){
 const cols=['nationId','nation','active','controller','population','settlements','cultureGroups','cappedGroups','fiscalPhase','gold','essential','estimatedNet','bufferQuarters','snapshotRisk','recoveryEligibleNow','lastQuarterCivilUnpaid','cumulativeCivilUnpaid','converted','killed','blockedRestores','civilUnpaid','militaryUnpaidRecord','operationArrears','bufferBelow3','negativeNet','negativeNetLowBuffer'];
 const esc=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 const lines=[cols.map(esc).join(',')];
 for(const n of audit.nations){const entry={...n,...n.reasons};lines.push(cols.map(k=>esc(entry[k])).join(','));}
 return '\uFEFF'+lines.join('\n');
}
function v06e7cAuditPanel(w,n){
 const section=make('section',{class:'overview-section','aria-label':'E7C 국가 정책 감사'},[
  make('h3',{text:'E7C · 정책·재정 최종 감사'}),
  make('p',{class:'muted-line',text:'필요할 때만 실행: 국가별 위기 원인·민간 및 정책 장부·문화 불만을 점검합니다. 평소 SIM/BATCH에서 추가 계산하지 않습니다.'})]);
 const bar=make('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',margin:'9px 0'}});
 const result=make('p',{class:'muted-line',text:'감사 전 · 기존 E7B 정책 AI와 군사 AI 판단은 변경되지 않습니다.'});
 const inspect=make('button',{type:'button',class:'jump-button',text:'현재 세계 감사','aria-label':'E7C 현재 세계 감사'});
 inspect.addEventListener('click',()=>{const t=performance.now();const a=v06e7cAuditWorld(w),s=a.summary;
  result.textContent=`국가 ${s.activeNations} · E7B 위기 ${s.crisis} / 회복 ${s.recovery} / 정상 ${s.normal} · 현재 위기 조건 ${s.snapshotRisk}국 · 국고 완충 부족 ${s.underfundedBuffer}국 · 민간 미납 ${s.lastQuarterCivilUnpaid}G · 장부 이상 ${a.issues.length}건 · 감사 ${Math.round(performance.now()-t)}ms`;
 });bar.append(inspect);
 for(const [type,label] of [['json','감사 JSON'],['csv','감사 CSV']]){
  const button=make('button',{type:'button',class:'jump-button',text:label});
  button.addEventListener('click',()=>{const a=v06e7cAuditWorld(w);download(`vilob-e7c-policy-audit-day${w.dayIndex}.${type}`,type==='json'?JSON.stringify(a,null,2):v06e7cAuditCSV(a),type==='json'?'application/json':'text/csv');});bar.append(button);
 }
 section.append(bar,result,make('p',{class:'scope-note',text:'상태 구분: E7B 기록된 phase와 E7C 현재 수치 재계산(snapshotRisk)은 별도 표시합니다. 감사는 세계를 수정하거나 재정 설정을 변경하지 않습니다.'}));
 return section;
}
// -- end V0.6E7C --

// V0.6F4A — one-shot integration snapshot. This function never runs in SIM/BATCH.
// It audits the LIVE world and produces only an external report: no new save fields,
// policy decisions, random draws, or military state transitions.
function v06f4aIntegrationAudit(w){
 validateWorld(structuredClone(w)); // validate legacy normalizers on a copy, never mutate live world
 const policy=v06e7cAuditWorld(w);
 const fortNet=fortificationNetwork(w); // existing transient WeakMap cache; no world state mutation
 const statuses={};let soldiers=0,supplied=0,unsupplied=0;
 for(const a of w.armies){
  statuses[a.status]=(statuses[a.status]||0)+1;
  soldiers+=manpower(a);
  if(a.supplied)supplied++;else unsupplied++;
 }
 const storedPlans=w.wars.filter(war=>war.f3PersistedCoalitionPlan!==undefined);
 const activePlanCache=storedPlans.filter(war=>war.f3PersistedCoalitionPlan.tick===Math.floor(w.dayIndex/10)).length;
 const sourceStats=w.c6StrategyStats||{};
 return {schema:'vilob-light-v06f4a-integration-audit-v1',version:w.version,
  seed:w.seed,dayIndex:w.dayIndex,rngState:w.rngState,
  source:'READ_ONLY_ON_DEMAND',
  notes:['CPU time is measured in an external fixed-checkpoint benchmark, not inferred from cumulative pathChecks.',
   'This audit does not change fort lines, military AI, policy, or supply rules.',
   'E7C fiscal snapshot estimates are not invoices for the next quarter.'],
  validWorld:true,
  military:{armies:w.armies.length,soldiers,statuses,supplied,unsupplied,
   activeWars:w.wars.length,engagements:w.engagements.length,occupations:w.occupations.length,
   forts:w.defenses.length,fortLineLinks:fortNet.links.length,fortLineBlockedTiles:fortNet.blocked.size,
   persistedCoalitionPlans:storedPlans.length,currentTickPlans:activePlanCache,
   strategyStats:{...sourceStats}},
  policy:{summary:policy.summary,issues:policy.issues},
  runtimeDiagnosticCounters:{
   f1Supply:{...f1SupplyGraphStats,enabled:f1SupplyGraphEnabled},
   f2Routes:{...f2RouteStats,enabled:f2RoutePrefilterEnabled},
   f4bRoutes:{...f4bRouteStats,enabled:f4bRouteReuseEnabled}},
  // Counters above are session-scoped and do not persist in the save.
  warning:'Run repeated F4A vs F4B benchmarks with the SAME starting checkpoint to evaluate performance.'};
}
function v06f4aAuditCSV(a){
 const values={dayIndex:a.dayIndex,seed:a.seed,rngState:a.rngState,
  armies:a.military.armies,soldiers:a.military.soldiers,activeWars:a.military.activeWars,
  engagements:a.military.engagements,occupations:a.military.occupations,
  fortLineLinks:a.military.fortLineLinks,fortLineBlockedTiles:a.military.fortLineBlockedTiles,
  persistedCoalitionPlans:a.military.persistedCoalitionPlans,
  policyLedgerDiscrepancies:a.policy.summary.policyLedgerDiscrepancies,
  fiscalCrisisNations:a.policy.summary.crisis,negativeNetNations:a.policy.summary.negativeNet};
 const esc=s=>'"'+String(s??'').replaceAll('"','""')+'"';
 const keys=Object.keys(values);return '\uFEFF'+keys.map(esc).join(',')+'\n'+keys.map(k=>esc(values[k])).join(',');
}
function v06f4aAuditPanel(w){
 const section=make('section',{class:'overview-section','aria-label':'F4A 군사 정책 통합 감사'},[
  make('h3',{text:'F4A · 군사·정책 통합 감사'}),
  make('p',{class:'muted-line',text:'요청할 때만 세계·전선 캐시·요새선·재정 장부를 검사합니다. SIM/BATCH 진행 중 상시 실행되지 않습니다.'})]);
 const row=make('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',margin:'9px 0'}});
 const output=make('p',{class:'muted-line',text:'감사 전 · 군사/정책 규칙 변경 없음.'});
 const call=()=>v06f4aIntegrationAudit(w);
 const inspect=make('button',{type:'button',class:'jump-button',text:'F4A 통합 감사'});
 inspect.addEventListener('click',()=>{try{const t=performance.now(),a=call();output.textContent=`월드 PASS · 군대 ${a.military.armies}개 / ${a.military.soldiers}명 · 전쟁 ${a.military.activeWars}건 · 요새선 ${a.military.fortLineLinks}개 · F3 캐시 ${a.military.persistedCoalitionPlans}건 · 정책 장부 오류 ${a.policy.issues.length}건 · 감사 ${Math.round(performance.now()-t)}ms`;}catch(e){output.textContent='감사 실패: '+e.message;}});
 row.append(inspect);
 for(const [ext,label] of [['json','통합 JSON'],['csv','통합 CSV']]){
  const btn=make('button',{type:'button',class:'jump-button',text:label});
  btn.addEventListener('click',()=>{try{const a=call();download(`vilob-f4a-integration-day${w.dayIndex}.${ext}`,ext==='json'?JSON.stringify(a,null,2):v06f4aAuditCSV(a),ext==='json'?'application/json':'text/csv;charset=utf-8');}catch(e){showToast('F4A 감사 실패: '+e.message);}});row.append(btn);
 }
 section.append(row,output,make('p',{class:'scope-note',text:'F1/F2 함수 호출 수는 브라우저 세션 통계이며 세이브에는 포함되지 않습니다. 성능 향상률은 동일 체크포인트 반복 측정으로 확인해야 합니다.'}));
 return section;
}



// V0.6E6 — Unified National Policy AI V1 (no RNG, policy budget ledger, opt-in civilian-violence AI).
const V06E6_REVIEW_DAYS=120,V06E6_CULTURE_MIN_DAYS=480,V06E6_HISTORY_LIMIT=32;
const V06E6_CULTURE_MIN_POP=200,V06E6_CULTURE_MIN_SHARE=.10;
const V06E6_POLICY_DEFAULTS=Object.freeze({
 survival:[18,0],diplomatic:[25,0],expansionist:[58,12],balanced:[43,0],urbanist:[38,0],resource_seeker:[47,0],technologist:[36,0],road_admin:[48,0],fortress:[55,0],diplomatic_cautious:[17,0],expansionist_opportunist:[69,20],urbanist_productive:[40,0],agrarian_self_sufficient:[29,0],coalition_diplomat:[15,0],elite_military:[60,15],strategic_merchant:[25,0]
});
function v06e6EnsureProfile(profile){
 if(!profile.policy){const preset=V06E6_POLICY_DEFAULTS[profile.id]||[45,0];profile.policy={assimilationPreference:preset[0],stateViolencePreference:preset[1]};}
 return profile;
}
function v06e6NewWorldState(){return {schema:1,enabled:true,allowAIViolence:false};}
function v06e6NewNationAI(){return {schema:1,lastReviewDay:null,assessments:0,changes:0,lastReason:'NOT_EVALUATED',history:[]};}
function v06e6MigrateWorld(w){
 w.v06e6Policy??=v06e6NewWorldState();
 for(const n of w.nations)n.governance.unifiedAI??=v06e6NewNationAI();
 for(const p of Object.values(w.aiProfiles||{}))v06e6EnsureProfile(p);
}
function v06e6PolicyDues(w,n){
 let total=0;
 for(const [id,e] of Object.entries(n.governance.facilities))if(e.policyId===E2_FOCUS_POLICY){
  const building=e1Building(w,Number(id));
  if(building&&e2FocusBillable(w,n,building))total+=e2FocusQuarterCost(building);
 }
 for(const [key,e] of Object.entries(n.governance.cultures)){
  if(e.policyId==='ASSIMILATION')total+=e4QuarterCost(w,key);
  else if(e.policyId==='MASS_KILLING')total+=v06e5QuarterCost(w,key);
 }
 return total;
}
function v06e6Forecast(w,n,additional=0,projection=null){
 const q=projection||projectedQuarter(w,n),dues=v06e6PolicyDues(w,n)+additional;
 const essential=Math.max(1,q.upkeep+q.civil.total+dues);
 const net=q.goldIncome-essential;
 return {income:q.goldIncome,essential,dues,net,buffer:n.gold/essential,unpaid:(n.lastQuarter?.civilUnpaid||0)>0||(n.military?.unpaidQuarters||0)>0||(n.military?.operationArrears||0)>0};
}
function v06e6Affordable(w,n,additional,{purpose='CULTURE',forecast=null,alreadyCommitted=0}={}){
 const f=forecast?{...forecast,essential:forecast.essential+additional+alreadyCommitted,net:forecast.net-additional-alreadyCommitted,buffer:n.gold/(forecast.essential+additional+alreadyCommitted)}:v06e6Forecast(w,n,additional);
 const minNet=purpose==='VIOLENCE'?.20:purpose==='CULTURE'?.045:.015;
 const minBuffer=purpose==='VIOLENCE'?18:purpose==='CULTURE'?10:5;
 return !f.unpaid&&f.net>f.essential*minNet&&f.buffer>minBuffer&&n.gold>=f.essential*minBuffer;
}
function v06e6Log(w,n,action,key,reason,score=0){
 const ai=n.governance.unifiedAI;
 ai.lastReason=reason;
 if(action!=='HOLD')ai.changes++;
 ai.history.push({dayIndex:w.dayIndex,action,key,reason,score:Math.max(0,Math.min(100,Math.round(score)))});
 if(ai.history.length>V06E6_HISTORY_LIMIT)ai.history.shift();
}
function v06e6StopAI(w,n,key,e,reason){
 const [sid,cid]=key.split('|');
 const result=e1ChangePolicy(w,n.id,e.policyId,{settlementId:Number(sid),cultureId:cid},false,'AI');
 if(result.ok){v06e6Log(w,n,'STOP',key,reason);v06e7aRecord(w,n,'CULTURE','CHANGE',{reason,key,from:e.policyId,to:'OFF'});v06e7aTransition(w,n,`CULTURE:${key}`,e.policyId,'OFF');}
 return result.ok;
}
function v06e6Quarter(w){
 if(w.dayIndex%30!==0)return;
 // Turning the violence AI permission OFF also stops existing AI-started violence at the next quarter boundary.
 for(const n of w.nations){
  if(n.controller!=='AI')continue;
  for(const [key,e] of Object.entries(n.governance?.cultures||{}))if(e.policyId==='MASS_KILLING'&&(!w.v06e6Policy?.enabled||!w.v06e6Policy.allowAIViolence))
   e1PrunePolicy(w,n,'culture',key,'AI_VIOLENCE_DISABLED');
 }
 if(w.v06e6Policy?.enabled!==true||w.dayIndex%V06E6_REVIEW_DAYS!==0)return;
 for(const n of w.nations){
  if(!n.active||n.controller!=='AI')continue;
  const ai=n.governance.unifiedAI,bridge=n.governance.policyAI;
  if(w.dayIndex<(bridge?.graceUntilDay||0))continue;
  ai.lastReviewDay=w.dayIndex;ai.assessments++;
  const forecast=v06e6Forecast(w,n),emergency=forecast.unpaid||forecast.net<0||forecast.buffer<3;
  v06e7aRecord(w,n,'CULTURE','EVALUATE',{reason:emergency?'FISCAL_EMERGENCY':'REVIEW',expectedNet:forecast.net});
  v06e7aForecastRecord(w,n,'CULTURE',forecast);
  const entries=Object.entries(n.governance.cultures).sort(([a],[b])=>a.localeCompare(b));
  if(emergency){
   const expensive=entries.filter(([key,e])=>e.policyId==='ASSIMILATION'||e.policyId==='MASS_KILLING')
    .sort((a,b)=>v06e6PolicyCostEntry(w,b[0],b[1])-v06e6PolicyCostEntry(w,a[0],a[1])||a[0].localeCompare(b[0]));
   if(expensive.length&&v06e6StopAI(w,n,expensive[0][0],expensive[0][1],'FISCAL_EMERGENCY'))continue;
   v06e6Log(w,n,'HOLD','', 'FISCAL_EMERGENCY');continue;
  }
  // Stop one established policy per review if the grievance has accumulated to a critical level.
  let acted=false;
  for(const [key,e] of entries){
   if(w.dayIndex-e.startedDay<V06E6_CULTURE_MIN_DAYS)continue;
   const [sid,cid]=key.split('|'),town=w.settlements.find(s=>s.id===Number(sid));
   const group=town?.civilGrievances?.groups?.[cid];
   const gv=group?.values||group||{};
   const culturePressure=Number(gv.culture)||0;
   const governancePressure=Number(gv.governance)||0;
   if(culturePressure>=800||governancePressure>=850){
    if(v06e6StopAI(w,n,key,e,'HIGH_CULTURAL_UNREST')){acted=true;break;}
   }
  }
  if(acted)continue;
  const profile=v06e6EnsureProfile(w.aiProfiles[n.aiProfileId]||{});
  const pref=profile.policy?.assimilationPreference??45,violencePref=profile.policy?.stateViolencePreference??0;
  const candidates=[];
  for(const town of w.settlements){
   if(town.ownerId!==n.id||town.population<=0)continue;
   for(const [cultureId,count] of Object.entries(town.culturePopulation||{})){
    if(cultureId===n.primaryCultureId)continue;
    if(count<V06E6_CULTURE_MIN_POP){v06e7aCandidate(w,n,'LOW_POPULATION');continue;}
    if(count/town.population<V06E6_CULTURE_MIN_SHARE){v06e7aCandidate(w,n,'LOW_SHARE');continue;}
    const key=`${town.id}|${cultureId}`,e=n.governance.cultures[key];if(e){v06e7aCandidate(w,n,'ALREADY_POLICY');continue;}
    const gr=town.civilGrievances?.groups?.[cultureId];
    const v=gr?.values||gr||{};
    const social=Math.max(0,Number(v.safety)||0,Number(v.governance)||0,Number(v.culture)||0);
    const share=count/town.population;
    const score=pref+Math.min(16,count/650)+Math.min(12,share*16)-social*.09;
    const due=e4QuarterCost(w,key);
    if(score>=65){if(v06e6Affordable(w,n,due,{forecast})){v06e7aCandidate(w,n,'QUALIFIED',{key,score});candidates.push({key,town,cultureId,score,due,type:'ASSIMILATION'});}else v06e7aCandidate(w,n,'FISCAL_REJECT',{key,score});}
    else v06e7aCandidate(w,n,'LOW_SCORE',{key,score});
    // E7A1: classify the first failed E6 violence gate without changing the candidate threshold.
    // The exact same safeguards and score/cost functions are used, only their reasons are recorded.
    if(!w.v06e6Policy.allowAIViolence)v06e7aCandidate(w,n,'AI_VIOLENCE_DISABLED');
    else if(violencePref<85)v06e7aCandidate(w,n,'VIOLENCE_PROFILE');
    else if(social>=200)v06e7aCandidate(w,n,'VIOLENCE_SOCIAL');
    else if(militaryAtWar(w,n.id))v06e7aCandidate(w,n,'VIOLENCE_WAR');
    else if(count<300||share<.20)v06e7aCandidate(w,n,'VIOLENCE_POP_SHARE');
    else if(Object.values(n.governance.cultures).some(p=>p.policyId==='MASS_KILLING'))v06e7aCandidate(w,n,'VIOLENCE_ALREADY_POLICY');
    else{
     const violentScore=violencePref+Math.min(10,share*20)-social*.03;
     if(violentScore<91)v06e7aCandidate(w,n,'VIOLENCE_SCORE',{key,score:violentScore});
     else if(!v06e6Affordable(w,n,v06e5QuarterCost(w,key),{purpose:'VIOLENCE',forecast}))v06e7aCandidate(w,n,'VIOLENCE_FISCAL',{key,score:violentScore});
     else{
      v06e7aCandidate(w,n,'VIOLENCE_QUALIFIED',{key,score:violentScore});
      candidates.push({key,town,cultureId,score:violentScore,due:v06e5QuarterCost(w,key),type:'MASS_KILLING'});
     }
    }
   }
  }
  candidates.sort((a,b)=>b.score-a.score||a.town.id-b.town.id||a.cultureId.localeCompare(b.cultureId));
  const picked=candidates[0];
  if(picked){
   const result=e1ChangePolicy(w,n.id,picked.type,{settlementId:picked.town.id,cultureId:picked.cultureId},true,'AI');
   if(result.ok){v06e6Log(w,n,picked.type==='ASSIMILATION'?'START_ASSIMILATION':'START_VIOLENCE',picked.key,'PROFILE_BUDGET_SOCIAL',picked.score);v06e7aRecord(w,n,'CULTURE','CHANGE',{reason:'PROFILE_BUDGET_SOCIAL',key:picked.key,from:'OFF',to:picked.type,score:picked.score});v06e7aTransition(w,n,`CULTURE:${picked.key}`,'OFF',picked.type);continue;}
  }
  v06e7aRecord(w,n,'CULTURE','HOLD',{reason:'NO_ELIGIBLE_CANDIDATE'});
  v06e6Log(w,n,'HOLD','', 'NO_ELIGIBLE_CANDIDATE');
 }
}
function v06e6PolicyCostEntry(w,key,e){return e.policyId==='ASSIMILATION'?e4QuarterCost(w,key):e.policyId==='MASS_KILLING'?v06e5QuarterCost(w,key):0;}
function v06e6SetFlag(w,flag,value){
 if(!Object.hasOwn(v06e6NewWorldState(),flag)||flag==='schema'||typeof value!=='boolean')return false;
 if(!w.v06e6Policy)return false;
 w.v06e6Policy[flag]=value;
 if(flag==='enabled'&&!value||flag==='allowAIViolence'&&!value){
  for(const n of w.nations)if(n.controller==='AI')
   for(const [key,e] of Object.entries(n.governance.cultures))if(e.policyId==='MASS_KILLING'||flag==='enabled'&&e.policyId==='ASSIMILATION')
    e1PrunePolicy(w,n,'culture',key,'E6_GLOBAL_DISABLED');
 }
 w.changeSeq++;return true;
}
function v06e6Validate(w,fail){
 const global=w.v06e6Policy;
 if(!global||global.schema!==1||typeof global.enabled!=='boolean'||typeof global.allowAIViolence!=='boolean')fail('E6 세계 정책 AI 설정');
 for(const n of w.nations){
  const a=n.governance?.unifiedAI;
  if(!a||a.schema!==1||!Number.isSafeInteger(a.assessments)||a.assessments<0||!Number.isSafeInteger(a.changes)||a.changes<0||
    !(a.lastReviewDay===null||Number.isSafeInteger(a.lastReviewDay)&&a.lastReviewDay<=w.dayIndex&&a.lastReviewDay%120===0)||
    typeof a.lastReason!=='string'||!Array.isArray(a.history)||a.history.length>V06E6_HISTORY_LIMIT||
    a.history.some(h=>!Number.isSafeInteger(h.dayIndex)||h.dayIndex>w.dayIndex||!['START_ASSIMILATION','START_VIOLENCE','STOP','HOLD'].includes(h.action)||
      typeof h.key!=='string'||typeof h.reason!=='string'||!Number.isSafeInteger(h.score)||h.score<0||h.score>100))fail('E6 국가 AI 판단 이력');
 }
 for(const profile of Object.values(w.aiProfiles))if(!profile.policy||['assimilationPreference','stateViolencePreference'].some(k=>!Number.isSafeInteger(profile.policy[k])||profile.policy[k]<0||profile.policy[k]>100))fail('E6 AI 문화 정책 성향');
}
function v06e6Audit(w){return {dayIndex:w.dayIndex,settings:{...w.v06e6Policy},nations:w.nations.map(n=>({id:n.id,name:n.name,controller:n.controller,policy:n.governance.unifiedAI,policyCosts:v06e6PolicyDues(w,n),activeCulturePolicies:Object.entries(n.governance.cultures).map(([key,e])=>({key,policyId:e.policyId}))}))};}
function v06e6PolicyPanel(w,n){
 const p=w.v06e6Policy,ai=n.governance.unifiedAI,f=v06e6Forecast(w,n);
 const section=make('section',{class:'overview-section','aria-label':'E6 국가 정책 통합 AI'},[
  make('h3',{text:'E6 · 통합 국가 정책 AI'}),
  make('div',{class:'muted-line',text:`통합 AI ${p.enabled?'ON':'OFF'} · AI 국가폭력 ${p.allowAIViolence?'허용':'차단(기본값)'} · 다음 정책 선택 ${Math.ceil((w.dayIndex+1)/120)*120}일`}),
  make('div',{class:'muted-line',text:`예상 분기 수입 ${number.format(f.income)}G · 필수+정책 유지비 ${number.format(f.essential)}G (E1 정책 ${number.format(f.dues)}G) · 예상 잔액 변화 ${number.format(f.net)}G · 국고 완충 ${f.buffer.toFixed(1)}분기`}),
  make('div',{class:'muted-line',text:`${n.name} 통합 정책 AI: ${p.enabled?'운영 중':'중지'} · 다음 정책 검토 ${Math.ceil((w.dayIndex+1)/120)*120}일`})
 ]);
 // One world-level setting, available without taking control of a nation.
 const opts=make('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',margin:'9px 0'}});
 for(const [key,label] of [['enabled','통합 AI'],['allowAIViolence','AI 국가폭력 허용']]){
  const button=make('button',{type:'button',class:'jump-button',text:`${label}: ${p[key]?'ON':'OFF'}`,'aria-label':`${label} 전환`});
  button.addEventListener('click',()=>{
   const on=!w.v06e6Policy[key];
   if(key==='allowAIViolence'&&on&&!window.confirm('AI가 조건을 만족하는 타문화 주민에게 국가폭력 정책을 자율적으로 시행할 수 있습니다. 이 설정을 켤까요?'))return;
   v06e6SetFlag(w,key,on);renderNationOverview();showToast(`${label} ${on?'ON':'OFF'}`);
  });opts.append(button);
 }
 section.append(opts);
 const prefs=w.aiProfiles[n.aiProfileId]?.policy;
 section.append(make('div',{class:'muted-line',text:`${n.name} 정책 성향: 동화 ${prefs?.assimilationPreference??45}/100 · 국가폭력 ${prefs?.stateViolencePreference??0}/100 · 변경: AI 에디터`}));
 // E6 AI decision history is available in the dedicated World audit.
 return section;
}
// -- end V0.6E6 Unified National Policy AI --

// V0.6E2 — Facility Production Focus V1
// Per-building opt-in: 5 producing types and barracks, excluding houses and forts.
// Fees are paid at the end of a quarter, benefits are used in the NEXT quarter.
// V0.6E2A — deterministic, bounded AI facility-focus governance.
// No additional RNG; decisions are performed after all E2 quarterly invoices/actions.
const E2A_POLICY_HISTORY_LIMIT=24;
const E2A_PERIOD=120;
const E2A_FOCUS_TARGETS=Object.freeze({wood:260,stone:200,iron:130});
const E2A_FOCUS_TECH=Object.freeze({food:'farmFood',wood:'lumberWood',stone:'quarryStone',iron:'mineIron'});
function e2aNewState(day=0,grace=120){
 const at=Math.ceil((day+grace)/E2A_PERIOD)*E2A_PERIOD;
 return {schema:1,nextReviewDay:Math.max(120,at),graceUntilDay:day+grace,lastReviewDay:null,controllerSeen:'AI',
  assessments:0,emergencyAssessments:0,turnedOn:0,turnedOff:0,kept:0,noChange:0,
lastReason:'NOT_EVALUATED',history:[]};
}
function e2aMigrateWorld(w){
 w.e2aPolicyAIEnabled=true;
 for(const n of w.nations)n.governance.policyAI=e2aNewState(w.dayIndex,120);
}
function e2aOnControllerChange(w,n,controller){
 const state=n?.governance?.policyAI;
 if(!state)return;
 state.controllerSeen=controller;
 if(controller==='AI'){state.graceUntilDay=w.dayIndex+120;state.nextReviewDay=Math.max(state.nextReviewDay,Math.ceil(state.graceUntilDay/120)*120);
   for(const [key,e] of Object.entries(n.governance?.cultures||{}))if(e.policyId==='MASS_KILLING')e1PrunePolicy(w,n,'culture',key,'AI_CONTROL_TRANSFER');
 }
 const fiscal=n.governance?.fiscalAI;if(fiscal){fiscal.controllerSeen=controller;
  if(controller==='AI'){fiscal.graceUntilDay=w.dayIndex+120;fiscal.nextReviewDay=Math.max(fiscal.nextReviewDay,Math.ceil(fiscal.graceUntilDay/120)*120);}}
}
function e2aLog(w,n,action,b,reason,detail={}){
 const s=n.governance.policyAI;
 const entry={dayIndex:w.dayIndex,action,buildingId:b?.id??null,typeId:b?.typeId??null,reason,
  delta:Math.max(0,Math.floor(detail.delta||0)),cost:Math.max(0,Math.floor(detail.cost||0))};
 s.history.push(entry);if(s.history.length>E2A_POLICY_HISTORY_LIMIT)s.history.shift();
 s.lastReason=reason;
 if(action==='ON')s.turnedOn++;
 if(action==='OFF')s.turnedOff++;
  if(action==='ON'||action==='OFF'){v06e7aRecord(w,n,'FACILITY','CHANGE',{reason,key:String(b?.id??''),from:action==='ON'?'OFF':'ON',to:action});v06e7aTransition(w,n,`FACILITY:${b?.id}` ,action==='ON'?'OFF':'ON',action);}
 // KEEP is logged as a representative event; the full kept count is added below.
 if(action==='NONE')s.noChange++;
 return entry;
}
function e2aFoodTarget(w,n,q){
 const consumed=q.foodConsumed||0;
 if(!consumed)return 0;
 const stocked=(n.resources.food||0)/Math.max(1,consumed);
 // Protect next quarter without requiring universal overproduction; distinguish
 // structural shortage from large buffers accumulated in previous years.
 const margin=stocked<1?.045:stocked<3?.015:stocked<6?0:-.025;
 return Math.ceil(consumed*(1+margin));
}
function e2aMarginal(w,n,b,q){
 const tile=w.tiles[b.tileId];if(!tile)return {gain:0,cost:e2FocusQuarterCost(b),good:null};
 const base=facilityOutput(b,tile.terrain),local=q.regionalEconomy.towns.get(b.settlementId);
 if(!base||!local)return {gain:0,cost:e2FocusQuarterCost(b),good:null};
 const cost=e2FocusQuarterCost(b);
 if(b.typeId==='barracks'){
  const d=V04E_BARRACKS[b.level];
  return {good:'training',gain:Math.floor(d.training*.3),cost};
 }
 if(b.typeId==='academy')return {good:'knowledge',gain:Math.floor(base.knowledge*.3*local.multiplier),cost};
 const good=V05A_FACILITY_RESOURCE[b.typeId];
 if(!good)return {gain:0,cost,good:null};
 const modifier=1+techBonus(w,n.id,E2A_FOCUS_TECH[good]);
 const occupied=w.tiles[b.tileId]?.occupiedBy!==null||w.occupations.some(x=>x.tileId===b.tileId);
 const gain=Math.max(0,Math.floor((base.produced[good]||0)*.3*local.multiplier*modifier*(occupied?.5:1)));
 return {good,gain,cost};
}
function e2aTypeBias(profile,kind){
 const w=profile?.weights||{},m=profile?.military||{};
 if(kind==='farm')return (w.development||50)*.007+((profile?.id==='survival'||profile?.id==='agrarian_self_sufficient')?.30:0)+.55;
 if(['lumber','quarry','mine'].includes(kind))return (w.expansion||50)*.006+(w.development||50)*.003+.45;
 if(kind==='academy')return .5+(w.knowledge||50)*.012;
 if(kind==='barracks')return .45+(m.militaryInvestment||50)*.012;
 return 1;
}
function e2aTrainingDemand(w,n){
 const queue=pendingManpower(n),rate=trainingRate(w,n.id);
 const atWar=Boolean(militaryAtWar(w,n.id));
 return queue>Math.max(40,rate*.8)||atWar&&queue>30;
}
function e2aNeed(w,n,b,q,info,foodTarget){
 const good=info.good,stock=n.resources[good]||0;
 if(info.gain<=0)return {needed:false,reason:'ZERO_GAIN',priority:0};
 if(good==='food'){
  const shortfall=Math.max(0,foodTarget-q.produced.food);
  return {needed:shortfall>0,reason:shortfall>0?'FOOD_DEFICIT':'FOOD_SECURE',priority:Math.min(3,shortfall/Math.max(1,q.foodConsumed)*7+1.2)};
 }
 if(good==='knowledge'){
  const unfinished=n.technology.unlocked.length<g4ResearchCount();
  const scarce=unfinished&&n.knowledge<35000;
  return {needed:scarce,reason:scarce?'RESEARCH_DEMAND':'RESEARCH_SATURATED',priority:scarce?1.3:0};
 }
 if(good==='training'){
  const wants=e2aTrainingDemand(w,n);
  return {needed:wants,reason:wants?'TRAINING_BACKLOG':'NO_TRAINING_DEMAND',priority:wants?1.3:0};
 }
 const target=E2A_FOCUS_TARGETS[good];
 const scarce=stock<target;
 return {needed:scarce,reason:scarce?good.toUpperCase()+'_SCARCITY':'INVENTORY_SUFFICIENT',priority:scarce?1+Math.min(2,(target-stock)/target*2):0};
}
function e2aEconomyRisk(n,q,activeFee){
 const essentials=q.upkeep+q.civil.total;
 const reserve=Math.max(500,Math.ceil(essentials*3+activeFee*2));
 const missed=(n.lastQuarter?.civilUnpaid||0)>0||(n.military?.operationArrears||0)>0||
  (n.military?.unpaidQuarters||0)>0;
 return {reserve,emergency:missed||n.gold<reserve,profit:n.lastQuarter?.goldNet??0,
  budget:Math.max(0,Math.floor(q.goldIncome*.15))};
}
function e2aAssessNation(w,n,emergencyOnly=false){
 const s=n.governance.policyAI;
 const q=projectedQuarter(w,n); // ONE snapshot for all candidates of the nation.
 const profile=d1dEffectiveProfile(w,n.id)||w.aiProfiles[n.aiProfileId];
 const owned=w.buildings.filter(b=>Object.hasOwn(E2_FOCUS_LABELS,b.typeId)&&w.tiles[b.tileId]?.ownerId===n.id);
 const focused=n.governance.facilities;
 const focusFee=owned.reduce((v,b)=>v+(focused[b.id]&&e2FocusBillable(w,n,b)?e2FocusQuarterCost(b):0),0);
 const risk=e2aEconomyRisk(n,q,focusFee),foodTarget=e2aFoodTarget(w,n,q);
 const emergency=emergencyOnly||risk.emergency;
 s.assessments++;if(emergencyOnly)s.emergencyAssessments++;
 v06e7aRecord(w,n,'FACILITY','EVALUATE',{reason:emergencyOnly?'EMERGENCY_REVIEW':emergency?'FISCAL_RISK':'REGULAR_REVIEW'});
 s.lastReviewDay=w.dayIndex;
 let remaining=emergencyOnly?2:3,changed=0,kept=0;
 const active=owned.filter(b=>focused[b.id]).sort((a,b)=>a.id-b.id);
 const enabled=owned.filter(b=>!focused[b.id]&&e2FocusBillable(w,n,b)).sort((a,b)=>a.id-b.id);
 // Assess each focused building by its marginal contribution. A shortage is a
 // binding constraint; free cash alone never makes a facility worth focusing.
 let adjustedFood=q.produced.food,adjustedFees=focusFee;
 const off=[];
 for(const b of active){
  const info=e2aMarginal(w,n,b,q);
  const decision=e2aNeed(w,n,b,q,info,foodTarget);
  let reason=null;
  if(!e1FacilityValid(w,n.id,b.id)){kept++;continue;} // transient upgrades retain intent.
  if(emergency)reason='FISCAL_EMERGENCY';
  else if(info.good==='food'){
   if(adjustedFood-info.gain>=foodTarget)reason='FOOD_SURPLUS';
  }else if(!decision.needed)reason=decision.reason;
  if(reason){
   // During a surplus, trim the least valuable facility first. In an emergency,
   // free the largest invoice first. Simulated food is updated after each OFF.
   const score=emergency?info.cost:(info.cost/Math.max(1,info.gain));
   off.push({b,info,reason,score});
  }else kept++;
 }
 off.sort((a,b)=>b.score-a.score||a.b.id-b.b.id);
 for(const c of off){
  if(!remaining)break;
  if(!emergency&&w.dayIndex-(focused[c.b.id]?.lastChangedDay??0)<240)continue;
  if(c.info.good==='food'&&!emergency&&adjustedFood-c.info.gain<foodTarget)continue;
  const res=e1ChangePolicy(w,n.id,E2_FOCUS_POLICY,c.b.id,false,'AI');
  if(!res.ok)continue;
  if(c.info.good==='food')adjustedFood-=c.info.gain;
  adjustedFees=Math.max(0,adjustedFees-c.info.cost);
  e2aLog(w,n,'OFF',c.b,c.reason,{...c.info,delta:c.info.gain});
  remaining--;changed++;
 }
 // Annual growth only if essential bills can still be paid and there is a
 // surplus in current quarterly income. No emergency ON to avoid debt spirals.
 if(!emergency&&remaining>0&&risk.profit>=0&&n.gold>risk.reserve){
  const candidates=[];
  const projected={...q,produced:{...q.produced,food:adjustedFood}};
  for(const b of enabled){
   if(!e1FacilityValid(w,n.id,b.id)){v06e7aCandidate(w,n,'FACILITY_INVALID');continue;}
   const info=e2aMarginal(w,n,b,q),need=e2aNeed(w,n,b,projected,info,foodTarget);
   if(!need.needed||info.cost<=0){v06e7aCandidate(w,n,info.cost<=0?'FACILITY_ZERO_COST':'FACILITY_NOT_NEEDED');continue;}
   const score=(info.gain/info.cost)*need.priority*e2aTypeBias(profile,b.typeId);
   v06e7aCandidate(w,n,'FACILITY_ELIGIBLE',{key:String(b.id),score});
   candidates.push({b,info,score,need});
  }
  candidates.sort((a,b)=>b.score-a.score||a.b.id-b.b.id);
  let budgetLeft=Math.max(0,risk.budget-adjustedFees);
  const sharedForecast=w.v06e6Policy?.enabled?v06e6Forecast(w,n,0,q):null;
  let committedCost=0;
  for(const c of candidates){
   if(!remaining||budgetLeft<=0)break;
   if(c.info.cost>budgetLeft||risk.profit<c.info.cost||n.gold<risk.reserve+c.info.cost){v06e7aCandidate(w,n,'FACILITY_BUDGET');continue;}
   if(w.v06e6Policy?.enabled&&!v06e6Affordable(w,n,c.info.cost,{purpose:'FACILITY',forecast:sharedForecast,alreadyCommitted:committedCost})){v06e7aCandidate(w,n,'FACILITY_FISCAL');continue;}
   if(c.info.good==='food'&&adjustedFood>=foodTarget){v06e7aCandidate(w,n,'FACILITY_FOOD_SECURE');continue;}
   const res=e1ChangePolicy(w,n.id,E2_FOCUS_POLICY,c.b.id,true,'AI');
   if(!res.ok)continue;
   budgetLeft-=c.info.cost;adjustedFees+=c.info.cost;committedCost+=c.info.cost;
   if(c.info.good==='food')adjustedFood+=c.info.gain;
   e2aLog(w,n,'ON',c.b,c.need.reason,{...c.info,delta:c.info.gain});
   remaining--;changed++;
  }
 }
 if(!changed){
  if(kept>0)e2aLog(w,n,'KEEP',active[0]||null,emergency?'EMERGENCY_HOLD':'POLICY_STILL_NEEDED');
  else e2aLog(w,n,'NONE',null,emergency?'FISCAL_HOLD':'NO_VALUABLE_CHANGE');
 }
 s.kept+=Math.max(0,kept);
 return {changed,kept,emergency,risk};
}
function e2aQuarter(w){
 if(w.e2aPolicyAIEnabled!==true)return; // Strict E2 engine parity when switched off.
 for(const n of w.nations){
  if(!n.active)continue;
  const s=n.governance?.policyAI;if(!s)continue;
  // Player control is authoritative. A nation returned to AI gets a full
  // additional year's grace for previously hand-selected policy commitments.
  if(s.controllerSeen!==n.controller)e2aOnControllerChange(w,n,n.controller);
  if(n.controller!=='AI')continue;
  if(w.dayIndex>=s.nextReviewDay&&w.dayIndex%120===0){
   e2aAssessNation(w,n,false);s.nextReviewDay=w.dayIndex+E2A_PERIOD;
  }else if(w.dayIndex%30===0&&w.dayIndex>=s.graceUntilDay&&Object.keys(n.governance.facilities).length){
   // Quarterly exception: only stop overspending, never open new invoices.
   const q=n.lastQuarter||{},essentials=(q.upkeep||0)+(q.civil?.total||0);
   if(q.civilUnpaid>0||n.military.unpaidQuarters>0||n.military.operationArrears>0||n.gold<Math.max(500,essentials*3))e2aAssessNation(w,n,true);
  }
 }
}
function e2aValidate(w,fail){
 const nonnegative=v=>Number.isSafeInteger(v)&&v>=0;
 if(typeof w.e2aPolicyAIEnabled!=='boolean')fail('E2A 활성 상태');
 for(const n of w.nations){
  const s=n.governance?.policyAI;
  if(!s||s.schema!==1||!nonnegative(s.nextReviewDay)||s.nextReviewDay%120!==0||!nonnegative(s.graceUntilDay)||
    !(s.lastReviewDay===null||nonnegative(s.lastReviewDay)&&s.lastReviewDay<=w.dayIndex)||
    !['AI','PLAYER'].includes(s.controllerSeen)||
    ['assessments','emergencyAssessments','turnedOn','turnedOff','kept','noChange'].some(k=>!nonnegative(s[k]))||
    typeof s.lastReason!=='string'||s.lastReason.length>100||!Array.isArray(s.history)||s.history.length>E2A_POLICY_HISTORY_LIMIT||
    s.history.some(e=>!nonnegative(e.dayIndex)||e.dayIndex>w.dayIndex||!['ON','OFF','KEEP','NONE'].includes(e.action)||
     !(e.buildingId===null||nonnegative(e.buildingId))||!(e.typeId===null||Object.hasOwn(E2_FOCUS_LABELS,e.typeId))||
     typeof e.reason!=='string'||e.reason.length>100||!nonnegative(e.delta)||!nonnegative(e.cost)))fail('E2A 국가 정책 AI 기록');
 }
 return true;
}
function e2aGovernanceSummary(w,n){
 const s=n.governance?.policyAI;if(!s)return null;
 const outer=make('section',{class:'overview-section','aria-label':'E2A AI 시설 정책 판단'},[
  make('h3',{text:'E2A · 시설 운영 AI'}),
  make('div',{class:'muted-line',text:`AI 자동 판단 ${w.e2aPolicyAIEnabled?'ON':'OFF'} · 평가 ${number.format(s.assessments)}회 · ON ${number.format(s.turnedOn)} / OFF ${number.format(s.turnedOff)} · 다음 정기 평가 ${s.nextReviewDay}일`}),
  make('div',{class:'muted-line',text:'국가 상황·자원 부족·정책 유지비를 고려합니다. 직접 조종 중인 국가는 자동 변경하지 않습니다.'})
 ]);
 for(const h of s.history.slice(-6).reverse()){
  const description=h.buildingId===null?'전체 검토':`${E2_FOCUS_LABELS[h.typeId]||h.typeId} #${h.buildingId}`;
  outer.append(make('div',{class:'muted-line',text:`${h.dayIndex}일 · ${h.action} · ${description} · ${h.reason}${h.cost?' · '+h.cost+' G/분기':''}`}));
 }
 return outer;
}
// -- end V0.6E2A facility governance AI --

const E2_FOCUS_POLICY='FACILITY_FOCUS';
const E2_FOCUS_FACTOR=1.30;
const E2_FOCUS_LABELS=Object.freeze({farm:'농장',lumber:'벌목장',quarry:'채석장',mine:'광산',academy:'학술원',barracks:'병영'});
// Civil upkeep is exactly the same schedule as civilUpkeep().
function e2FocusQuarterCost(b){
 if(!b||!Object.hasOwn(E2_FOCUS_LABELS,b.typeId))return 0;
 if(b.typeId==='barracks')return Math.ceil(V04E_BARRACKS[b.level].upkeep*0.5);
 const base=b.level<=3?3+2*b.level:b.level===4?16:25;
 return base*5;
}
function e2FocusBillable(w,n,b){
 if(!b||!e1FacilityValid(w,n.id,b.id))return false;
 if(b.typeId!=='barracks')return true;
 // No extra focus fee or bonus for a barracks that failed its original operating bill,
 // or is outside the three actually selected barracks.
 return b.barracksPaidQuarter===v04eQuarterDay(w) && v04eBarracksCandidates(w,n.id).some(x=>x.id===b.id);
}
function e2FocusActive(w,nationId,b){
 const n=w.nations[nationId];
 const e=n?.governance?.facilities?.[b?.id];
 if(e?.policyId!==E2_FOCUS_POLICY||!b||b.status!=='ACTIVE'||b.disconnected||w.tiles[b.tileId]?.ownerId!==nationId||w.tiles[b.tileId]?.occupiedBy!==null)return false;
 // During the exact quarter boundary, local production is calculated BEFORE the current invoice.
 // After the invoice is paid, UI/train forecast can use the newly funded next period.
 const currentQuarter=Math.floor(w.dayIndex/30)*30;
 const funded=e.paidQuarterDay===currentQuarter || (w.dayIndex%30===0&&e.paidQuarterDay===currentQuarter-30);
 if(!funded)return false;
 if(b.typeId==='barracks')return b.barracksPaidQuarter===v04eQuarterDay(w) && v04eBarracksCandidates(w,nationId).some(x=>x.id===b.id);
 return true;
}
function e2OnDetachedTile(w,previousOwner,tileId){
 const n=w.nations[previousOwner],facilities=n?.governance?.facilities;
 if(!facilities||!Object.keys(facilities).length)return;
 for(const key of Object.keys(facilities))if(e1Building(w,Number(key))?.tileId===tileId)e1PrunePolicy(w,n,'facility',key,'TILE_TRANSFER');
}
function e2GovernancePanel(w,n){
 const g=n.governance,f=g.finance;
 const section=make('section',{class:'overview-section','aria-label':'E2 시설 생산 집중'},[
  make('h3',{text:'E2 · 시설 생산 집중'}),
  make('div',{class:'muted-line',text:'농장·벌목장·채석장·광산·학술원: 산출량 ×1.30 / 병영: 훈련 보너스 ×1.30(기존 국가 상한 480 적용)'}),
  make('div',{class:'muted-line',text:'30일마다 추가 Gold 유지비를 지급합니다. 지급한 다음 분기에만 효과가 적용됩니다. 주택·요새 제외 · AI 시설 운영 E2A.'}),
  make('div',{class:'muted-line',text:`활성 시설 ${Object.keys(g.facilities).length}개 · 최근 지급 ${number.format(f.paidGold)}/${number.format(f.billedGold)} G · 미납 ${number.format(f.unpaidGold)} G · 누적 ${number.format(f.totalPaidGold)} G`})
 ]);
 // E2A observation-only diagnostics live in World > integrated policy audit.
 const settlements=w.settlements.filter(s=>s.ownerId===n.id);
 const facilityTypes=new Set(Object.keys(E2_FOCUS_LABELS));
 const all=w.buildings.filter(b=>facilityTypes.has(b.typeId)&&w.tiles[b.tileId]?.ownerId===n.id);
 const byTown=new Map();
 for(const b of all){
  const sid=b.settlementId;
  if(!byTown.has(sid))byTown.set(sid,[]);
  byTown.get(sid).push(b);
 }
 const validTowns=settlements.filter(s=>byTown.get(s.id)?.length).sort((a,b)=>a.id-b.id);
 const controller=n.active&&n.controller==='PLAYER';
 const focusRecords=g.facilities;
 if(!validTowns.length){section.append(make('p',{class:'muted-line',text:'소유한 정책 대상 시설이 없습니다.'}));return section;}
 if(!controller)section.append(make('div',{class:'muted-line',text:'관찰 중 · 정책 변경은 직접 조종 중인 국가에서만 가능합니다.'}));
 const idKey='e2FocusedSettlementId';
 const previously=app[idKey]?.[n.id];
 const selected=validTowns.some(x=>x.id===previously)?previously:validTowns[0].id;
 const row=make('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',margin:'10px 0'}});
 row.append(make('label',{text:'정착지 선택',for:'e2-town-selector'}));
 const chooser=make('select',{id:'e2-town-selector','aria-label':'시설 집중 정착지 선택',style:{maxWidth:'100%',minWidth:'165px',padding:'5px'}});
 for(const s of validTowns){const opt=make('option',{value:String(s.id),text:`${s.name} · ${byTown.get(s.id).length}개`});opt.selected=s.id===selected;chooser.append(opt);}
 chooser.addEventListener('change',()=>{app[idKey]??={};app[idKey][n.id]=Number(chooser.value);renderNationOverview();});
 row.append(chooser);section.append(row);
 const selectedBuildings=(byTown.get(selected)||[]).sort((a,b)=>a.id-b.id);
 const eligible=selectedBuildings.filter(b=>e1FacilityValid(w,n.id,b.id));
 const active=selectedBuildings.filter(b=>focusRecords[b.id]);
 const cost=active.reduce((sum,b)=>sum+(e2FocusBillable(w,n,b)?e2FocusQuarterCost(b):0),0);
 section.append(make('div',{class:'muted-line',text:`선택 정착지: 대상 ${selectedBuildings.length}개 · 활성 ${active.length}개 · 예상 추가 청구 ${number.format(cost)} G/분기 (현재 가동 기준)`}));
 function changeMany(items,enabled){
  if(!controller)return;
  let changed=0;for(const b of items){const should=!!focusRecords[b.id];if(should===enabled)continue;
   if(e1ChangePolicy(w,n.id,E2_FOCUS_POLICY,b.id,enabled).ok)changed++;
  }
  showToast(`${n.name} 생산 집중: ${changed}개 시설 ${enabled?'활성화':'해제'}`);
  renderNationOverview();
 }
 if(controller){
  const bulk=make('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap',margin:'8px 0'}});
  for(const [label,enabled] of [['정착지 모두 켜기',true],['정착지 모두 끄기',false]]){
   const button=make('button',{type:'button',class:'jump-button',text:label});
   button.addEventListener('click',()=>changeMany(enabled?eligible:selectedBuildings,enabled));bulk.append(button);
  }
  section.append(bulk);
 }
 const typeList=make('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'8px'}});
 if(controller)for(const typeId of Object.keys(E2_FOCUS_LABELS)){
  const items=selectedBuildings.filter(b=>b.typeId===typeId);if(!items.length)continue;
  for(const enabled of [true,false]){
   const button=make('button',{type:'button',class:'jump-button',text:`${E2_FOCUS_LABELS[typeId]} ${enabled?'일괄 ON':'일괄 OFF'}`});
   button.addEventListener('click',()=>changeMany(enabled?items.filter(b=>e1FacilityValid(w,n.id,b.id)):items,enabled));typeList.append(button);
  }
 }
 section.append(typeList);
 const list=make('div',{style:{display:'grid',gap:'5px'}});
 for(const b of selectedBuildings){
  const rec=focusRecords[b.id],valid=e1FacilityValid(w,n.id,b.id),operating=e2FocusBillable(w,n,b),working=e2FocusActive(w,n.id,b);
  const r=make('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',padding:'6px 8px',border:'1px solid var(--line, #51606a)',borderRadius:'7px',flexWrap:'wrap'}});
  const info=make('div',{},[
   make('div',{text:`${E2_FOCUS_LABELS[b.typeId]} Lv.${b.level} · #${b.id} · ${number.format(e2FocusQuarterCost(b))} G/분기`}),
   make('small',{class:'muted-line',text:!valid?'현재 비가동':rec?(working?'집중 가동 중':operating?'다음 분기 적용 대기 / 미납':'집중 중단 · 기본 운영 상태 확인'):'집중 OFF'})
  ]);r.append(info);
  if(controller){
   const btn=make('button',{type:'button',class:'jump-button',text:rec?'집중 OFF':'집중 ON','aria-label':`${E2_FOCUS_LABELS[b.typeId]} ${b.id} 생산 집중 ${rec?'해제':'활성화'}`});
   btn.disabled=!rec&&!valid;
   btn.addEventListener('click',()=>{const res=e1ChangePolicy(w,n.id,E2_FOCUS_POLICY,b.id,!rec);showToast(res.ok?`${E2_FOCUS_LABELS[b.typeId]} #${b.id} 생산 집중 ${rec?'해제':'활성화'}`:res.reason);renderNationOverview();});
   r.append(btn);
  }else r.append(make('span',{class:'muted-line',text:rec?'ON':'OFF'}));
  list.append(r);
 }
 section.append(list);
 section.append(make('div',{class:'muted-line',text:'구휼·치안 E3A 및 동화 E4는 상단 국가 정책에서 운영합니다. 국가폭력 E5 수동 시행 / 정책 AI 통합 E6'}));
 return section;
}
// -- end V0.6E2 facility production focus --


// V0.6E3A — paid-only social protection (no free food, land, recruits, or RNG).
const E3A_SOCIAL_KEYS=Object.freeze(['relief','security']);
const E3A_SOCIAL_TIERS=Object.freeze(['OFF','ON']);
const E3A_EFFECTS=Object.freeze({relief:{economy:-12},security:{safety:-10}});
function e3aNewSocialFinance(){return {lastQuarterDay:null,billed:0,paid:0,unpaid:0,totalPaid:0,totalUnpaid:0,
  reliefBilled:0,reliefPaid:0,securityBilled:0,securityPaid:0};}
function e3aSocialDue(pop,kind){
  if(pop<=0)return 0;
  return Math.max(1,Math.ceil(pop*(kind==='relief'?.035:.028)));
}
function e3aMigrateWorld(w){
  for(const n of w.nations){
    const gov=n.governance;
    if(!gov)continue;
    gov.national.relief=E3A_SOCIAL_TIERS.includes(gov.national.relief)?gov.national.relief:'OFF';
    gov.national.security=E3A_SOCIAL_TIERS.includes(gov.national.security)?gov.national.security:'OFF';
    gov.socialFinance??=e3aNewSocialFinance();
    const fiscal=gov.fiscalAI;
    if(fiscal){fiscal.lastChanged??={tax:null,publicServices:null};
      for(const key of E3A_SOCIAL_KEYS)fiscal.lastChanged[key]??=null;}
  }
}
function e3aGrievanceDelta(w,n,key){
  const gov=n?.governance;if(!gov)return 0;
  const fin=gov.socialFinance;
  if(!fin||fin.lastQuarterDay!==w.dayIndex)return 0;
  if(key==='economy'&&gov.national.relief==='ON'&&fin.reliefBilled>0&&fin.reliefPaid===fin.reliefBilled)return E3A_EFFECTS.relief.economy;
  if(key==='safety'&&gov.national.security==='ON'&&fin.securityBilled>0&&fin.securityPaid===fin.securityBilled)return E3A_EFFECTS.security.safety;
  return 0;
}
function e3aSetSocial(w,nationId,kind,tier,actor='PLAYER'){
  const field=kind==='RELIEF'?'relief':kind==='SECURITY'?'security':null;
  const n=w.nations[nationId];
  if(!n?.active||!field||!E3A_SOCIAL_TIERS.includes(tier)||!['AI','PLAYER'].includes(actor))return {ok:false,reason:'사회 정책 종류·수준 또는 국가 오류'};
  if(n.controller!==actor)return {ok:false,reason:'국가 통제권 없음'};
  const previous=n.governance.national[field];
  if(previous===tier)return {ok:false,reason:'이미 선택된 정책'};
  n.governance.national[field]=tier;
  e1History(w,n,'STOP',kind,'nation',previous,actor);
  e1History(w,n,'START',kind,'nation',tier,actor);
  if(actor==='PLAYER'&&n.governance.fiscalAI)n.governance.fiscalAI.lastChanged[field]=w.dayIndex;
  w.changeSeq++;
  return {ok:true,kind,old:previous,level:tier};
}
function e3aValidate(w,fail){
 const int=x=>Number.isSafeInteger(x)&&x>=0;
 for(const n of w.nations){
  const g=n.governance,f=g?.socialFinance;
  if(!g||E3A_SOCIAL_KEYS.some(k=>!E3A_SOCIAL_TIERS.includes(g.national[k])))fail('E3A social policies');
  if(!f||['billed','paid','unpaid','totalPaid','totalUnpaid','reliefBilled','reliefPaid','securityBilled','securityPaid'].some(k=>!int(f[k]))||
    f.billed!==f.paid+f.unpaid||f.billed!==f.reliefBilled+f.securityBilled||f.paid!==f.reliefPaid+f.securityPaid||
    f.reliefPaid>f.reliefBilled||f.securityPaid>f.securityBilled||
    (f.reliefPaid!==0&&f.reliefPaid!==f.reliefBilled)||(f.securityPaid!==0&&f.securityPaid!==f.securityBilled)||
    !(f.lastQuarterDay===null||int(f.lastQuarterDay)&&f.lastQuarterDay<=w.dayIndex&&f.lastQuarterDay%30===0))fail('E3A social finance');
  if(f.lastQuarterDay!==null){
    if(f.billed>n.civilFinance?.billedLastQuarter)fail('E3A invoice exceeds civil');
    if(f.paid>n.civilFinance?.paidLastQuarter)fail('E3A payment exceeds civil');
  }
 }
}
// -- end V0.6E3A paid social policy primitives --

// V0.6E3 — Fiscal & Public Services V1.
// Policy selection is deterministic, has no AP charges, and uses existing civil Gold invoices.
const E3_TAX_RATES=Object.freeze({LOW:.90,NORMAL:1,HIGH:1.12});
const E3_SERVICE_RATES=Object.freeze({LOW:.75,NORMAL:1,HIGH:1.5});
const E3_TAX_GRIEVANCES=Object.freeze({LOW:-6,NORMAL:0,HIGH:10});
const E3_SERVICE_GRIEVANCES=Object.freeze({LOW:{governance:8,safety:4},NORMAL:{governance:0,safety:0},HIGH:{governance:-10,safety:-4}});
const E3_FISCAL_HISTORY_MAX=24,E3_FISCAL_PERIOD=120,E3_FISCAL_COOLDOWN=240;
// E7B: 2 consecutive 30-day paid/positive quarters before restoring discretionary policies.
const E7B_HEALTHY_QUARTERS=2,E7B_RECOVERY_NET_MARGIN=.04,E7B_RECOVERY_BUFFER=6,E7B_STABILIZE_DAYS=480,E7B_HISTORY_MAX=24;
function e3NewServiceFinance(){return {lastQuarterDay:null,billed:0,paid:0,unpaid:0,totalPaid:0,totalUnpaid:0};}
function e3NewFiscalAI(day=0){return {schema:1,nextReviewDay:Math.max(120,Math.ceil((day+120)/120)*120),graceUntilDay:day+120,
  controllerSeen:'AI',lastReviewDay:null,assessments:0,emergencies:0,changes:0,lastReason:'NOT_EVALUATED',lastChanged:{tax:null,publicServices:null,relief:null,security:null},history:[],e7b:e7bNewFiscalState()};}
function e7bNewFiscalState(){return {schema:1,phase:'NORMAL',healthyQuarters:0,lastObservedDay:null,lastCrisisDay:null,blockedRestores:0,stagedRestores:0,crisisQuarters:0,lastReason:'NOT_OBSERVED',history:[]};}
function e7bMigrateWorld(w){
 if(typeof w.e7bFiscalStabilityEnabled!=='boolean')w.e7bFiscalStabilityEnabled=true;
 for(const n of w.nations){if(n.governance?.fiscalAI)n.governance.fiscalAI.e7b??=e7bNewFiscalState();}
}
function e7bLog(s,day,reason){
 const x=s.e7b;x.lastReason=reason;
 x.history.push({dayIndex:day,phase:x.phase,reason});
 if(x.history.length>E7B_HISTORY_MAX)x.history.shift();
}
function e7bFiscalObserve(w,n){
 if(w.e7bFiscalStabilityEnabled!==true||n.controller!=='AI')return;
 const s=n.governance?.fiscalAI,x=s?.e7b;if(!x||x.lastObservedDay===w.dayIndex)return;
 const last=n.lastQuarter||{},civil=last.civil||{};
 const essential=Math.max(1,(last.upkeep||0)+(civil.total||0)+(w.v06e6Policy?.enabled?v06e6PolicyDues(w,n):0));
 const net=(last.goldIncome||0)-essential;
 const buffer=n.gold/essential;
 const arrears=(last.civilUnpaid||0)>0||(n.military?.unpaidQuarters||0)>0||(n.military?.operationArrears||0)>0;
 const crisis=arrears||buffer<3||net<0&&buffer<6;
 const healthy=!arrears&&net>=0&&buffer>=E7B_RECOVERY_BUFFER;
 x.lastObservedDay=w.dayIndex;
 if(crisis){
  x.crisisQuarters++;x.healthyQuarters=0;x.lastCrisisDay=w.dayIndex;
  if(x.phase!=='CRISIS'){x.phase='CRISIS';e7bLog(s,w.dayIndex,'FISCAL_CRISIS');}
 }else if(x.phase!=='NORMAL'){
  x.healthyQuarters=healthy?Math.min(1000000,x.healthyQuarters+1):0;
  if(x.phase==='CRISIS'&&x.healthyQuarters>=E7B_HEALTHY_QUARTERS){x.phase='RECOVERY';e7bLog(s,w.dayIndex,'TWO_HEALTHY_QUARTERS');}
  else if(x.phase==='RECOVERY'&&x.healthyQuarters>=E7B_HEALTHY_QUARTERS&&w.dayIndex-x.lastCrisisDay>=E7B_STABILIZE_DAYS){x.phase='NORMAL';e7bLog(s,w.dayIndex,'RECOVERY_COMPLETE');}
 }
}
function e7bRecoveryMove(field,from,to){
 return field==='tax'?({LOW:0,NORMAL:1,HIGH:2}[to]<{LOW:0,NORMAL:1,HIGH:2}[from]):
  field==='publicServices'?({LOW:0,NORMAL:1,HIGH:2}[to]>{LOW:0,NORMAL:1,HIGH:2}[from]):
  (field==='relief'||field==='security')&&from==='OFF'&&to==='ON';
}
function e7bCanRestore(w,n,q,field,from,to,alreadyRestored){
 if(w.e7bFiscalStabilityEnabled!==true||!e7bRecoveryMove(field,from,to))return true;
 const x=n.governance?.fiscalAI?.e7b;
 if(!x||x.phase==='NORMAL')return true;
 if(x.phase==='CRISIS'||alreadyRestored>=1)return false;
 const proposal=e3aBudget(w,n,q,{...n.governance.national,[field]:to});
 return proposal.net>=proposal.essential*E7B_RECOVERY_NET_MARGIN&&proposal.buffer>=E7B_RECOVERY_BUFFER;
}
function e7bSetEnabled(w,on){if(typeof on!=='boolean')return false;w.e7bFiscalStabilityEnabled=on;
 if(on)for(const n of w.nations){const x=n.governance?.fiscalAI?.e7b;if(x){x.lastObservedDay=null;x.healthyQuarters=0;}}
 return true;
}
function e3MigrateWorld(w){
 w.e3FiscalAIEnabled=true;
 for(const n of w.nations){n.governance.serviceFinance??=e3NewServiceFinance();n.governance.fiscalAI??=e3NewFiscalAI(w.dayIndex);}
}
function e3ServiceDue(base,level){return Math.floor(base*(E3_SERVICE_RATES[level]??1));}
function e3TaxGold(base,level){return Math.floor(base*(E3_TAX_RATES[level]??1));}
function e3ServiceFunded(w,n){
 const f=n.governance?.serviceFinance;
 return !!f&&f.lastQuarterDay===w.dayIndex&&f.paid===f.billed&&f.billed>0;
}
function e3GrievanceDelta(w,n,key){
 if(!n?.governance)return 0;
 if(key==='economy')return E3_TAX_GRIEVANCES[n.governance.national.tax]||0;
 if(key!=='governance'&&key!=='safety')return 0;
 const tier=n.governance.national.publicServices;
 // No additional punitive duplicate when civil upkeep is in arrears. D1B accounts for it already.
 if(tier==='LOW'){
  const f=n.governance.serviceFinance;
  // Even when a small settlement rounds the reduced bill to zero, reduced service
  // remains a deliberate choice with a social cost. Do not duplicate civil arrears.
  if(!f||f.lastQuarterDay!==w.dayIndex||f.unpaid>0||f.billed===0&&(n.civilFinance?.unpaidLastQuarter||0)>0)return 0;
 }else if(!e3ServiceFunded(w,n))return 0;
 return E3_SERVICE_GRIEVANCES[tier]?.[key]||0;
}
function e3SetNational(w,nationId,kind,tier,actor='PLAYER'){
 const n=w.nations[nationId],field=kind==='TAX'?'tax':kind==='PUBLIC_SERVICES'?'publicServices':null;
 if(!n?.active||!field||!Object.hasOwn(E3_TAX_RATES,tier)||!['AI','PLAYER'].includes(actor))return {ok:false,reason:'정책 종류·수준 또는 국가 오류'};
 if(n.controller!==actor)return {ok:false,reason:'국가 통제권 없음'};
 const gov=n.governance,previous=gov.national[field];
 if(previous===tier)return {ok:false,reason:'이미 선택된 정책 수준'};
 gov.national[field]=tier;
 e1History(w,n,'STOP',kind,'nation',previous,actor);
 e1History(w,n,'START',kind,'nation',tier,actor);
 if(actor==='PLAYER'&&gov.fiscalAI){gov.fiscalAI.lastChanged[field]=w.dayIndex;}
 w.changeSeq++;
 return {ok:true,kind,old:previous,level:tier};
}
/** Counterfactual budget: evaluate the bill AFTER changing policy, never current cost. */
function e3aBudget(w,n,q,policy){
 const population=w.settlements.reduce((sum,t)=>sum+(t.ownerId===n.id?t.population:0),0);
 const settlements=w.settlements.filter(t=>t.ownerId===n.id);
 const owned=w.tiles.filter(t=>t.ownerId===n.id);
 const dev=settlements.reduce((sum,t)=>sum+t.development,0);
 const taxable=(6+population*.34+dev*.18+owned.length*.15)*(1+techBonus(w,n.id,'goldIncome'));
 const current=n.governance.national;
 const income=q.goldIncome+e3TaxGold(taxable,policy.tax)-e3TaxGold(taxable,current.tax);
 const civil=q.civil.total-q.civil.services-(q.civil.relief||0)-(q.civil.security||0)+
   e3ServiceDue(Math.floor(population*.06),policy.publicServices)+
   (policy.relief==='ON'?e3aSocialDue(population,'relief'):0)+
   (policy.security==='ON'?e3aSocialDue(population,'security'):0);
 const policyFees=w.v06e6Policy?.enabled?v06e6PolicyDues(w,n):0;
 const essential=Math.max(1,q.upkeep+civil+policyFees);
 return {income,civil,policyFees,essential,net:income-essential,buffer:n.gold/essential};
}
function e3AIAssess(w,n,emergency=false){
 const s=n.governance?.fiscalAI;
 if(!s||n.controller!=='AI'||w.dayIndex<s.graceUntilDay)return;
 // Use today's state; previous invoices are evidence of arrears, not a forecast.
 const q=projectedQuarter(w,n),last=n.lastQuarter||{},current=n.governance.national;
 const h=w.socialHistory?.byNation?.[n.id]||[];
 const social=h[h.length-1]?.values||{economy:0,governance:0,safety:0};
 const plan={tax:current.tax,publicServices:current.publicServices,relief:current.relief,security:current.security};
 const initial=e3aBudget(w,n,q,plan);
 const needsMoney=last.civilUnpaid>0||n.military.unpaidQuarters>0||n.military.operationArrears>0||initial.buffer<3;
 const canChange=field=>emergency||s.lastChanged[field]===null||w.dayIndex-s.lastChanged[field]>=E3_FISCAL_COOLDOWN;
 // Financial crisis overrides cool-down only to raise tax, lower services and disable social measures.
 if(canChange('tax')){
   if(needsMoney||initial.net<0&&initial.buffer<6)plan.tax='HIGH';
   else if(!emergency){
     const low=e3aBudget(w,n,q,{...plan,tax:'LOW'});
     const keepLow=current.tax==='LOW'&&low.net>=-low.essential*.03&&low.buffer>10;
     plan.tax=keepLow||social.economy>190&&low.net>low.essential*.12&&low.buffer>18?'LOW':'NORMAL';
   }
 }
 if(canChange('publicServices')){
   const now=e3aBudget(w,n,q,plan);
   if(needsMoney||now.net< -now.essential*.08&&now.buffer<6)plan.publicServices='LOW';
   else if(!emergency){
     const high=e3aBudget(w,n,q,{...plan,publicServices:'HIGH'});
     const keepHigh=current.publicServices==='HIGH'&&high.net>=-high.essential*.08&&high.buffer>5&&
       (social.governance>50||social.safety>105);
     const enterHigh=(social.governance>100||social.safety>190)&&high.net>high.essential*.13&&high.buffer>12;
     const normal=e3aBudget(w,n,q,{...plan,publicServices:'NORMAL'});
     const stayLow=current.publicServices==='LOW'&&(normal.net< -normal.essential*.015||normal.buffer<4);
     plan.publicServices=keepHigh||enterHigh?'HIGH':stayLow?'LOW':'NORMAL';
   }
 }
 for(const field of E3A_SOCIAL_KEYS){
   if(!canChange(field))continue;
   if(emergency){if(needsMoney)plan[field]='OFF';continue;}
   const isOn=current[field]==='ON';
   const highNeed=field==='relief'?social.economy>175||n.foodPressure<.85&&social.economy>105:
     social.safety>195||militaryAtWar(w,n.id)&&social.safety>145;
   const keepNeed=field==='relief'?social.economy>105||n.foodPressure<.7:
     social.safety>125||militaryAtWar(w,n.id)&&social.safety>110;
   const proposed=e3aBudget(w,n,q,{...plan,[field]:'ON'});
   const affordable=proposed.net>(isOn?-proposed.essential*.035:proposed.essential*.065)&&proposed.buffer>(isOn?5:9);
   plan[field]=!needsMoney&&affordable&&(isOn?keepNeed:highNeed)?'ON':'OFF';
 }
 s.assessments++;if(emergency)s.emergencies++;
 v06e7aRecord(w,n,emergency?'FISCAL_EMERGENCY':'FISCAL','EVALUATE',{reason:needsMoney?'FISCAL_CRISIS':'REVIEW',expectedNet:initial.net});
 s.lastReviewDay=w.dayIndex;
 let changes=0,restoresThisReview=0;
 for(const [kind,field] of [['TAX','tax'],['PUBLIC_SERVICES','publicServices'],['RELIEF','relief'],['SECURITY','security']]){
  const want=plan[field],old=n.governance.national[field];
  if(want===old)continue;
  if(emergency&&!(field==='tax'&&want==='HIGH'||field==='publicServices'&&want==='LOW'||E3A_SOCIAL_KEYS.includes(field)&&want==='OFF'))continue;
  if(!canChange(field)){v06e7aCandidate(w,n,'FISCAL_COOLDOWN');continue;}
  if(!emergency&&!e7bCanRestore(w,n,q,field,old,want,restoresThisReview)){
   n.governance.fiscalAI.e7b.blockedRestores++;
   v06e7aCandidate(w,n,'E7B_RECOVERY_HOLD');
   continue;
  }
  const isRecoveryMove=!emergency&&e7bRecoveryMove(field,old,want);
  const result=E3A_SOCIAL_KEYS.includes(field)?e3aSetSocial(w,n.id,kind,want,'AI'):e3SetNational(w,n.id,kind,want,'AI');
  if(!result.ok)continue;
  s.lastChanged[field]=w.dayIndex;changes++;s.changes++;
  if(w.e7bFiscalStabilityEnabled===true&&isRecoveryMove&&s.e7b?.phase==='RECOVERY'){restoresThisReview++;s.e7b.stagedRestores++;e7bLog(s,w.dayIndex,'STAGED_RESTORE_'+field.toUpperCase());}
  v06e7aRecord(w,n,'FISCAL','CHANGE',{reason:needsMoney?'FISCAL_CRISIS':'POLICY_ADJUSTMENT',key:field,from:old,to:want});
  v06e7aTransition(w,n,`FISCAL:${field}`,old,want);
  s.history.push({dayIndex:w.dayIndex,kind,from:old,to:want,reason:needsMoney?'FISCAL_CRISIS':
    field==='tax'?want==='LOW'?'ECONOMIC_GRIEVANCE':'FISCAL_BALANCE':
    field==='publicServices'?want==='HIGH'?'SERVICE_DEMAND':'BUDGET_ADJUSTMENT':
    want==='ON'?'SOCIAL_NEED':'SOCIAL_RECOVERY_OR_BUDGET'});
  if(s.history.length>E3_FISCAL_HISTORY_MAX)s.history.shift();
 }
 s.lastReason=changes?'POLICY_CHANGED':emergency?'EMERGENCY_HOLD':'POLICY_HELD';
 return changes;
}
function e3FiscalAIQuarter(w){
 if(w.e3FiscalAIEnabled!==true)return;
 for(const n of w.nations){
  if(!n.active)continue;
  const s=n.governance?.fiscalAI;if(!s)continue;
  if(s.controllerSeen!==n.controller){
   s.controllerSeen=n.controller;
   if(n.controller==='AI'){s.graceUntilDay=w.dayIndex+120;s.nextReviewDay=Math.max(s.nextReviewDay,Math.ceil(s.graceUntilDay/120)*120);}
  }
  if(n.controller!=='AI'||w.dayIndex<s.graceUntilDay)continue;
  e7bFiscalObserve(w,n);
  if(w.dayIndex>=s.nextReviewDay&&w.dayIndex%120===0){e3AIAssess(w,n);s.nextReviewDay=w.dayIndex+E3_FISCAL_PERIOD;}
  else if(w.dayIndex%30===0){
   const q=n.lastQuarter||{},essential=(q.upkeep||0)+(q.civil?.total||0);
   if(q.civilUnpaid>0||n.military.unpaidQuarters>0||n.gold<Math.max(150,essential*3))e3AIAssess(w,n,true);
  }
 }
}
function e3Validate(w,fail){
 const integer=x=>Number.isSafeInteger(x)&&x>=0;
 if(typeof w.e3FiscalAIEnabled!=='boolean')fail('E3 fiscal AI enabled flag');
 if(typeof w.e7bFiscalStabilityEnabled!=='boolean')fail('E7B stabilization enabled flag');
 for(const n of w.nations){
  const g=n.governance,f=g?.serviceFinance,s=g?.fiscalAI;
  if(!g||!Object.hasOwn(E3_TAX_RATES,g.national.tax)||!Object.hasOwn(E3_SERVICE_RATES,g.national.publicServices))fail('E3 national policy');
  if(!f||['billed','paid','unpaid','totalPaid','totalUnpaid'].some(k=>!integer(f[k]))||
    f.billed!==f.paid+f.unpaid||!(f.lastQuarterDay===null||integer(f.lastQuarterDay)&&f.lastQuarterDay<=w.dayIndex&&f.lastQuarterDay%30===0))fail('E3 service finance');
  if(f.lastQuarterDay!==null&&n.civilFinance&&f.billed>n.civilFinance.billedLastQuarter)fail('E3 service invoice exceeds civil');
  if(!s||s.schema!==1||!integer(s.nextReviewDay)||s.nextReviewDay%120!==0||!integer(s.graceUntilDay)||
    !['AI','PLAYER'].includes(s.controllerSeen)||!(s.lastReviewDay===null||integer(s.lastReviewDay)&&s.lastReviewDay<=w.dayIndex)||
    ['assessments','emergencies','changes'].some(k=>!integer(s[k]))||!s.lastChanged||
    ['tax','publicServices','relief','security'].some(k=>!(s.lastChanged[k]===null||integer(s.lastChanged[k])&&s.lastChanged[k]<=w.dayIndex))||
    !Array.isArray(s.history)||s.history.length>E3_FISCAL_HISTORY_MAX||s.history.some(h=>!integer(h.dayIndex)||h.dayIndex>w.dayIndex||
      !['TAX','PUBLIC_SERVICES','RELIEF','SECURITY'].includes(h.kind)||
      !(h.kind==='RELIEF'||h.kind==='SECURITY'?E3A_SOCIAL_TIERS.includes(h.from)&&E3A_SOCIAL_TIERS.includes(h.to):
       Object.hasOwn(E3_TAX_RATES,h.from)&&Object.hasOwn(E3_TAX_RATES,h.to))||typeof h.reason!=='string')||
    typeof s.lastReason!=='string')fail('E3 fiscal AI state');
  const e=s?.e7b;
  if(!e||e.schema!==1||!['NORMAL','CRISIS','RECOVERY'].includes(e.phase)||!['healthyQuarters','blockedRestores','stagedRestores','crisisQuarters'].every(k=>integer(e[k]))||e.healthyQuarters>1000000||!(e.lastObservedDay===null||integer(e.lastObservedDay)&&e.lastObservedDay<=w.dayIndex&&e.lastObservedDay%30===0)||!(e.lastCrisisDay===null||integer(e.lastCrisisDay)&&e.lastCrisisDay<=w.dayIndex&&e.lastCrisisDay%30===0)||typeof e.lastReason!=='string'||!Array.isArray(e.history)||e.history.length>E7B_HISTORY_MAX||e.history.some(h=>!integer(h.dayIndex)||h.dayIndex>w.dayIndex||!['NORMAL','CRISIS','RECOVERY'].includes(h.phase)||typeof h.reason!=='string'))fail('E7B fiscal stability');
 }
}
function e3FiscalPanel(w,n){
 const section=make('section',{class:'overview-section','aria-label':'E3A 조세 공공서비스 구휼 치안'},[
  make('h3',{text:'E3A · 재정과 사회 안정 정책'}),
  make('div',{class:'muted-line',text:'조세 LOW ×0.90 / NORMAL ×1.00 / HIGH ×1.12 · 공공서비스 LOW ×0.75 / NORMAL ×1.00 / HIGH ×1.50'}),
  make('div',{class:'muted-line',text:'구휼: 경제 불만 −12 / 치안: 안전 불만 −10 (분기별, 운영비 완납 시에만 적용). 사회 정책은 기본 민간 유지비 이후 결제하며 식량·병력을 생성하지 않습니다. 정책 변경 AP 비용 0.'})
 ]);
 const g=n.governance,f=g.serviceFinance,q=projectedQuarter(w,n);
 section.append(make('div',{class:'muted-line',text:`예상 분기 세입 ${number.format(q.goldIncome)} G · 서비스 청구 ${number.format(q.civil.services)} G · 최근 실제 지급 ${number.format(f.paid)}/${number.format(f.billed)} G · 누적 미납 ${number.format(f.totalUnpaid)} G`}));
 for(const [kind,field,label] of [['TAX','tax','조세'],['PUBLIC_SERVICES','publicServices','공공서비스']]){
  const bar=make('div',{style:{display:'flex',flexWrap:'wrap',gap:'7px',alignItems:'center',margin:'9px 0'}});
  bar.append(make('strong',{text:`${label} · ${g.national[field]}`}));
  for(const tier of ['LOW','NORMAL','HIGH']){
   const b=make('button',{class:'jump-button',type:'button',text:tier,'aria-label':`${label} ${tier}로 변경`});
   b.disabled=n.controller!=='PLAYER'||!n.active||g.national[field]===tier;
   b.addEventListener('click',()=>{const result=e3SetNational(w,n.id,kind,tier,'PLAYER');showToast(result.ok?`${n.name} ${label} ${tier}`:result.reason);renderNationOverview();});
   bar.append(b);
  }
  section.append(bar);
 }
 const social=g.socialFinance;
 section.append(make('div',{class:'muted-line',text:`구휼 청구·지급 ${number.format(social.reliefBilled)}/${number.format(social.reliefPaid)} G · 치안 청구·지급 ${number.format(social.securityBilled)}/${number.format(social.securityPaid)} G · 누적 사회 정책 미납 ${number.format(social.totalUnpaid)} G` }));
 for(const [kind,field,label] of [['RELIEF','relief','구휼'],['SECURITY','security','치안']]){
  const bar=make('div',{style:{display:'flex',flexWrap:'wrap',gap:'7px',alignItems:'center',margin:'9px 0'}});
  bar.append(make('strong',{text:`${label} · ${g.national[field]}`}));
  for(const tier of E3A_SOCIAL_TIERS){
   const btn=make('button',{class:'jump-button',type:'button',text:tier,'aria-label':`${label} ${tier} 전환`});
   btn.disabled=n.controller!=='PLAYER'||!n.active||g.national[field]===tier;
   btn.addEventListener('click',()=>{const r=e3aSetSocial(w,n.id,kind,tier,'PLAYER');showToast(r.ok?`${n.name} ${label} ${tier}`:r.reason);renderNationOverview();});
   bar.append(btn);
  }
  section.append(bar);
 }
 const s=g.fiscalAI;
 const stable=s.e7b;
 const stabilityBar=make('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',margin:'8px 0'}});
 stabilityBar.append(make('span',{class:'muted-line',text:`E7B 재정 복원 안정화 ${w.e7bFiscalStabilityEnabled?'ON':'OFF'} · 현재 ${stable.phase}`}));
 const toggle=make('button',{type:'button',class:'jump-button',text:w.e7bFiscalStabilityEnabled?'E7B 안정화 끄기':'E7B 안정화 켜기','aria-label':'E7B 재정 복원 안정화 전환'});
 toggle.addEventListener('click',()=>{e7bSetEnabled(w,!w.e7bFiscalStabilityEnabled);renderNationOverview();showToast(`E7B 재정 안정화 ${w.e7bFiscalStabilityEnabled?'ON':'OFF'}`);});stabilityBar.append(toggle);
 section.append(stabilityBar);
 section.append(make('div',{class:'muted-line',text:'E7B: 재정 위기에 즉시 대응, 2분기 연속 회복을 확인한 뒤 기존 240일 변경 제한 및 분기별 단계 복원을 적용. 문화·군사 정책 계수는 변경하지 않음.'}));
 section.append(make('div',{class:'muted-line',text:`재정 AI ${w.e3FiscalAIEnabled?'ON':'OFF'} · 다음 판단 ${s.nextReviewDay}일`}));
 // Fiscal AI action history is restricted to consolidated audit tools.
 return section;
}
// Majority culture uses the currently owned civilian population, not founding cultural identity.
// A tie or an empty population is explicitly ineligible for subject integration.
function e3MajorityCulture(w,nationId){
 const counts=new Map();
 for(const town of w.settlements)if(town.ownerId===nationId)
  for(const [id,count] of Object.entries(town.culturePopulation||{}))if(count>0)counts.set(id,(counts.get(id)||0)+count);
 let best=null,max=0,tie=false;
 for(const [id,count] of counts){if(count>max){best=id;max=count;tie=false;}else if(count===max)tie=true;}
 return tie||!max?null:best;
}
// -- end V0.6E3 module --

// V0.6E2B — cultural affinity and voluntary reunification; no RNG calls.
const E2B_SAME_CULTURE_BONUS=8;
const E2B_DIFFERENT_CULTURE_PENALTY=-3;
const E2B_OFFER_TTL=240;
const E2B_COOLDOWN=5*DAYS_PER_YEAR;
const E2B_HISTORY_WINDOW=80;
function e2bCulturalModifier(w,a,b){
 if(a===b)return 0;
 const x=w.nations[a],y=w.nations[b];
 if(!x?.primaryCultureId||!y?.primaryCultureId)return 0;
 return x.primaryCultureId===y.primaryCultureId?E2B_SAME_CULTURE_BONUS:E2B_DIFFERENT_CULTURE_PENALTY;
}
function e2bNewState(){return {schema:1,offers:[],cooldowns:{},history:[],reunified:0};}
function e2bState(w){return w.diplomacy.reunification??(w.diplomacy.reunification=e2bNewState());}
function e2bRecord(w,kind,sourceId,targetId,extra={}){
 const s=e2bState(w);
 s.history.push({dayIndex:w.dayIndex,kind,sourceId,targetId,...extra});
 if(s.history.length>E2B_HISTORY_WINDOW)s.history.splice(0,s.history.length-E2B_HISTORY_WINDOW);
}
function e2bPending(w,sourceId){return e2bState(w).offers.find(o=>o.sourceId===sourceId&&o.expiresDay>w.dayIndex)||null;}
function e2bAssessment(w,sourceId){
 const source=w.nations[sourceId],r=source?.rebelOrigin,subject=source?.active?v06bSubjectOf(w,sourceId):null;
 const route=subject?'SUBJECT':'REUNIFICATION',targetId=subject?subject.overlordId:r?.claimNationId,target=w.nations[targetId],blocks=[];
 if(!source?.active||!target?.active||targetId===sourceId||route==='REUNIFICATION'&&
   (r?.type!=='REUNIFICATION'||r.status!=='INDEPENDENT'))blocks.push('NOT_INDEPENDENT_REUNIFICATION');
 if(route==='SUBJECT'){
   const a=e3MajorityCulture(w,sourceId),b=e3MajorityCulture(w,targetId);
   if(!a||!b||a!==b)blocks.push('MAJORITY_CULTURE_MISMATCH');
   if(subject.status==='REBELLION')blocks.push('SUBJECT_REBELLION');
 }else if(target?.primaryCultureId!==source?.primaryCultureId)blocks.push('CULTURE_MISMATCH');
 if(source?.active&&target?.active){
  if(warOfNation(w,sourceId)||warOfNation(w,targetId))blocks.push('ACTIVE_WAR');
  if((route!=='SUBJECT'&&v06bSubjectOf(w,sourceId))||v06bSubjectOf(w,targetId)||v06bSubjectsOf(w,sourceId).length)blocks.push('SUBJECT_TREATY');
  if(w.diplomacy.alliances.some(t=>(t.a===sourceId||t.b===sourceId)&&t.endsDay>w.dayIndex))blocks.push('SOURCE_ALLIANCE');
  if((w.armies||[]).some(a=>a.nationId===sourceId&&(
    !['READY','REGROUP'].includes(a.status)||a.engagementId!==null||a.assignedWarId!==null||
    a.repatriation?.active||a.seaTransit||a.order||a.operation||a.retreatPath?.length)))blocks.push('ARMY_IN_TRANSIT');
  const stores=['knowledge',...RESOURCE_KEYS,'coal','machine_parts','steel','artillery_shells'];
  if(stores.some(k=>(k==='knowledge'?(source.knowledge||0)+(target.knowledge||0):
    (source.resources[k]||0)+(target.resources[k]||0))>1000000))blocks.push('STOCK_CAP');
  if(!Number.isSafeInteger((source.gold||0)+(target.gold||0)))blocks.push('GOLD_OVERFLOW');
  if(!w.settlements.some(s=>s.ownerId===sourceId))blocks.push('NO_SETTLEMENT');
 }
 if(route!=='SUBJECT'&&r&&w.dayIndex<(r.endedDay??r.formedDay)+DAYS_PER_YEAR)blocks.push('RECENT_SECESSION');
 const cooldown=e2bState(w).cooldowns[sourceId]||0;
 if(w.dayIndex<cooldown)blocks.push('COOLDOWN');
 const relation=target?relationOf(w,sourceId,target.id):0;
 return {sourceId,targetId,route,relation,eligible:blocks.length===0,blocks};
}
function e2bOffer(w,sourceId,actor='PLAYER'){
 const a=e2bAssessment(w,sourceId),s=e2bState(w);
 if(!a.eligible||e2bPending(w,sourceId))return {ok:false,reason:a.blocks.join(',')||'이미 제안 중'};
 // A player may seek reconciliation across mild hostility. War blocks remain absolute.
 if(a.relation< -15)return {ok:false,reason:'현재 우호도가 지나치게 낮음'};
 if(actor==='AI'&&w.nations[sourceId].controller!=='AI')return {ok:false,reason:'플레이어 조종 국가'};
 if(actor==='PLAYER'&&w.nations[sourceId].controller!=='PLAYER')return {ok:false,reason:'직접 조종 필요'};
 s.offers.push({sourceId,targetId:a.targetId,route:a.route,formedDay:w.dayIndex,expiresDay:w.dayIndex+E2B_OFFER_TTL});
 e2bRecord(w,'OFFER',sourceId,a.targetId,{relation:a.relation,actor});
 const msg=`${w.nations[sourceId].name}이(가) ${w.nations[a.targetId].name}에 평화적 재통합을 제안했습니다.`;
 event(w,msg,'diplomacy');recordHistoricalEvent(w,'diplomacy',msg,[sourceId,a.targetId]);w.changeSeq++;
 return {ok:true};
}
function e2bAIPropose(w,a){
 const x=w.nations[a.sourceId],y=w.nations[a.targetId];
 const cooperation=w.aiProfiles[x.aiProfileId]?.diplomacy?.cooperation??50;
 // Strategic independence remains a legitimate outcome. Low relation blocks offers.
 return a.eligible&&a.relation>=5&&cooperation>=25&&
    (a.relation*.6+cooperation*.25)>=15;
}
function e2bAIConsent(w,a){
 if(!a.eligible)return false;
 const src=w.nations[a.sourceId],dest=w.nations[a.targetId];
 const p=w.aiProfiles[dest.aiProfileId],cooperation=p?.diplomacy?.cooperation??50;
 const popSrc=w.settlements.filter(s=>s.ownerId===src.id).reduce((t,s)=>t+s.population,0);
 const popDest=w.settlements.filter(s=>s.ownerId===dest.id).reduce((t,s)=>t+s.population,0);
 const burden=popSrc>popDest*1.5?9:0;
 // Not automatically accepted merely because of shared culture.
 return a.relation>=8&&a.relation*.65+cooperation*.32-burden>=20;
}
function e2bIntegrate(w,sourceId,targetId){
 const assessment=e2bAssessment(w,sourceId);
 if(!assessment.eligible||assessment.targetId!==targetId)return {ok:false,reason:assessment.blocks.join(',')||'대상 불일치'};
 const src=w.nations[sourceId],dst=w.nations[targetId],s=e2bState(w);
 const prior={gold:src.gold,knowledge:src.knowledge,resources:{...src.resources},settlements:src.settlementIds.length,
   armies:w.armies.filter(a=>a.nationId===src.id).length,men:nationManpower(w,src.id),
   reserves:src.military.reserveReady,trainees:pendingManpower(src)};
 const settlements=w.settlements.filter(q=>q.ownerId===src.id).slice();
 w.e2bPeacefulTransfer=true;
 try{for(const town of settlements)transferCore(w,town.id,dst.id);}
 finally{delete w.e2bPeacefulTransfer;}
 // Detached sovereign land is not part of any settlement; transfer it without minting tiles.
 for(const tile of w.tiles)if(tile.ownerId===src.id){
   if(tile.settlementId!==null)throw Error('E2B stray settlement ownership');
   e2OnDetachedTile(w,src.id,tile.id);tile.ownerId=dst.id;tile.occupiedBy=null;tile.occupiedWarId=null;
 }
 dst.gold+=src.gold;src.gold=0;
 dst.knowledge+=src.knowledge;src.knowledge=0;
 for(const key of [...RESOURCE_KEYS,'coal','machine_parts','steel','artillery_shells']){const amount=src.resources[key];dst.resources[key]+=amount;src.resources[key]=0;f2bTrackTransfer(src,dst,key,amount);f2cTrackTransfer(src,dst,key,amount);}
 dst.researchLevel=Math.max(dst.researchLevel,src.researchLevel);
 const acquired=new Set(dst.technology.unlocked);
 for(const tech of src.technology.unlocked)acquired.add(tech);
 dst.technology.unlocked=[...new Set(TECHNOLOGIES.filter(t=>acquired.has(t.id)).map(t=>t.id))];
 // A newly inherited discovery can finish the recipient's current project; prevent
 // a completed technology from remaining queued as active or paused research.
 if(dst.technology.currentResearch&&acquired.has(dst.technology.currentResearch)){dst.technology.currentResearch=null;dst.technology.progress=0;}
 if(dst.technology.pausedResearch&&acquired.has(dst.technology.pausedResearch.id))dst.technology.pausedResearch=null;
 const reserve=src.military.reserveReady;
 dst.military.reserveReady+=reserve;src.military.reserveReady=0;
 d1CultureAdd(dst.military.reserveCulturePopulation,src.military.reserveCulturePopulation);
 src.military.reserveCulturePopulation={};
 dst.military.training.push(...src.military.training);src.military.training=[];
 for(const a of w.armies)if(a.nationId===src.id){a.nationId=dst.id;
   a.order=null;a.operation=null;a.needsOrders=false;a.repatriation=null;a.assignedWarId=null;a.engagementId=null;}
 const oldLeader=w.characters.find(c=>c.id===src.leaderId);
 if(oldLeader){
  w.pastLeaders.push({id:oldLeader.id,nationId:src.id,name:oldLeader.name,age:oldLeader.age,
   reignStartDay:oldLeader.reignStartDay,endDay:w.dayIndex,reunified:true});
  if(w.pastLeaders.length>180)w.pastLeaders.splice(0,w.pastLeaders.length-180);
 }
 w.characters=w.characters.filter(c=>c.id!==src.leaderId);
 for(const c of w.characters)if(c.nationId===src.id)c.nationId=dst.id;
 // The player must not lose control because their requesting country was absorbed.
 if(src.controller==='PLAYER'){dst.controller='PLAYER';e2aOnControllerChange(w,dst,'PLAYER');
  if(typeof app!=='undefined'&&app.selectedNationId===src.id)app.selectedNationId=dst.id;}
 src.controller='AI';src.active=false;src.capitalId=null;src.leaderId=null;src.settlementIds=[];src.apUnits=0;
 if(src.rebelOrigin){src.rebelOrigin.status='REUNIFIED';src.rebelOrigin.reunifiedIntoNationId=dst.id;src.rebelOrigin.reunifiedDay=w.dayIndex;}
 for(const t of w.diplomacy.alliances.filter(t=>t.a===src.id||t.b===src.id).slice())e5EndAlliance(w,t,'REUNIFICATION');
 for(const t of v06bTreaties(w).filter(t=>t.subjectId===src.id||t.overlordId===src.id).slice())v06bEndTreaty(w,t,'REUNIFICATION');
 const d=w.diplomacy;
 d.offers=d.offers.filter(o=>o.from!==src.id&&o.to!==src.id);
 d.subjectOffers=d.subjectOffers.filter(o=>o.from!==src.id&&o.to!==src.id);
 d.calls=d.calls.filter(c=>c.allyId!==src.id&&c.principalId!==src.id&&c.defenderId!==src.id);
 c2CleanupNation(w,src.id);
 s.offers=s.offers.filter(o=>o.sourceId!==src.id&&o.targetId!==src.id);
 e5InvalidateBorders(w);e5InvalidateRelations(w);refreshApCaps(w);
 s.reunified++;e2bRecord(w,'REUNIFIED',sourceId,targetId,{route:assessment.route,...prior});
 const msg=`${src.name}이(가) ${dst.name}에 평화적으로 통합됐습니다. 정착지 ${prior.settlements}곳·군대 ${prior.armies}개·병력 ${prior.men}명 보존.`;
 event(w,msg,'diplomacy');recordHistoricalEvent(w,'diplomacy',msg,[sourceId,targetId],`e2b:reunified:${sourceId}`);
 w.changeSeq++;
 return {ok:true,...prior};
}
function e2bRespond(w,sourceId,accept,actor='PLAYER'){
 const s=e2bState(w),offer=e2bPending(w,sourceId);
 if(!offer)return {ok:false,reason:'유효한 제안이 없습니다.'};
 const receiver=w.nations[offer.targetId];
 if(receiver.controller!==actor)return {ok:false,reason:'제안 수신국의 통제권이 없습니다.'};
 const a=e2bAssessment(w,sourceId);
 if(accept&&(!a.eligible||a.targetId!==offer.targetId))return {ok:false,reason:a.blocks.join(',')||'통합 불가'};
 s.offers=s.offers.filter(o=>o!==offer);
 if(!accept){s.cooldowns[sourceId]=w.dayIndex+E2B_COOLDOWN;e2bRecord(w,'REJECTED',sourceId,offer.targetId,{actor});
  const msg=`${receiver.name}이(가) ${w.nations[sourceId].name}의 재통합 제안을 거절했습니다.`;
  event(w,msg,'diplomacy');recordHistoricalEvent(w,'diplomacy',msg,[sourceId,offer.targetId]);w.changeSeq++;return {ok:true,rejected:true};}
 return e2bIntegrate(w,sourceId,offer.targetId);
}
function e2bQuarter(w){
 const s=e2bState(w);
 for(const o of s.offers.slice()){
  if(o.expiresDay>w.dayIndex&&w.nations[o.sourceId]?.active&&w.nations[o.targetId]?.active)continue;
  s.offers=s.offers.filter(x=>x!==o);s.cooldowns[o.sourceId]=w.dayIndex+E2B_COOLDOWN;
  e2bRecord(w,'EXPIRED',o.sourceId,o.targetId);
 }
 for(const o of s.offers.slice()){
  const a=e2bAssessment(w,o.sourceId);
  if(w.nations[o.targetId]?.controller==='AI')e2bRespond(w,o.sourceId,e2bAIConsent(w,a),'AI');
 }
 // Autonomous proposals are sparse: one yearly consideration per active claimant.
 if(w.dayIndex%DAYS_PER_YEAR!==0)return;
 for(const n of w.nations.slice()){
  if(!n.active||n.controller!=='AI'||!(n.rebelOrigin?.type==='REUNIFICATION'||v06bSubjectOf(w,n.id))||e2bPending(w,n.id))continue;
  const a=e2bAssessment(w,n.id);
  if(e2bAIPropose(w,a))e2bOffer(w,n.id,'AI');
 }
}
function e2bValidate(w,fail){
 const r=w.diplomacy.reunification;
 if(!r||r.schema!==1||!Array.isArray(r.offers)||r.offers.length>w.nations.length||
  !r.cooldowns||typeof r.cooldowns!=='object'||!Array.isArray(r.history)||r.history.length>E2B_HISTORY_WINDOW||
  !Number.isSafeInteger(r.reunified)||r.reunified<0)fail('E2B 재통합 상태');
 const seen=new Set();
 for(const o of r.offers){if(!Number.isInteger(o.sourceId)||!(w.nations[o.sourceId]?.rebelOrigin||o.route==='SUBJECT')||
  !w.nations[o.targetId]||o.sourceId===o.targetId||seen.has(o.sourceId)||
  !Number.isSafeInteger(o.formedDay)||!Number.isSafeInteger(o.expiresDay)||o.formedDay>o.expiresDay||o.formedDay>w.dayIndex)fail('E2B 재통합 제안');seen.add(o.sourceId);}
 for(const [id,day] of Object.entries(r.cooldowns))if(!w.nations[Number(id)]||!Number.isSafeInteger(day)||day<0)fail('E2B 재통합 쿨다운');
 for(const h of r.history)if(!['OFFER','REJECTED','EXPIRED','REUNIFIED'].includes(h.kind)||!w.nations[h.sourceId]||!w.nations[h.targetId]||h.dayIndex>w.dayIndex)fail('E2B 재통합 이력');
 for(const n of w.nations)if(n.rebelOrigin?.status==='REUNIFIED'&&
  (n.active||!w.nations[n.rebelOrigin.reunifiedIntoNationId]||!Number.isSafeInteger(n.rebelOrigin.reunifiedDay)))fail('E2B 재통합 국가');
}
function e2bPanel(w,n,section){
 const r=n.rebelOrigin,source=n.active&&(r?.type==='REUNIFICATION'||v06bSubjectOf(w,n.id))?n:null;
 const applicants=w.nations.filter(x=>x.active&&(x.rebelOrigin?.claimNationId===n.id&&x.rebelOrigin.type==='REUNIFICATION'||v06bSubjectOf(w,x.id)?.overlordId===n.id));
 if(!source&&!applicants.length)return;
 section.append(make('h3',{text:'E3 · 평화적 재통합·종속국 통합'}));
 if(source){
  const a=e2bAssessment(w,n.id),offer=e2bPending(w,n.id),target=w.nations[a.targetId];
  section.append(make('div',{class:'muted-line',text:`합류 대상 ${target?.name||'없음'} · ${a.route==='SUBJECT'?'종속국: 양국 주류 문화 일치 필수':'독립 재통합국'} · ${offer?'제안 대기 '+(offer.expiresDay-w.dayIndex)+'일':a.eligible?'조건 충족':'보류: '+a.blocks.join(' / ')} · 주류 문화 ${w.cultures.find(c=>c.id===e3MajorityCulture(w,n.id))?.name||e3MajorityCulture(w,n.id)||'동률/없음'}`}));
  if(n.controller==='PLAYER'&&!offer){const button=make('button',{class:'jump-button',text:a.route==='SUBJECT'?'종속국 통합 제안':'재통합 제안',type:'button'});button.disabled=!a.eligible||a.relation< -15;
   button.addEventListener('click',()=>{const x=e2bOffer(w,n.id,'PLAYER');showToast(x.ok?'평화적 통합 제안 전송':x.reason);if(x.ok){renderNationOverview();renderChronicle();}});section.append(button);}
 }
 for(const src of applicants){const offer=e2bPending(w,src.id),a=e2bAssessment(w,src.id);
  if(offer&&offer.targetId===n.id){section.append(make('div',{class:'muted-line',text:`${src.name}의 재통합 제안 · ${offer.expiresDay-w.dayIndex}일 남음 · ${a.eligible?'통합 조건 충족':'통합 보류: '+a.blocks.join(' / ')}`}));
   if(n.controller==='PLAYER'){const controls=make('div',{class:'comparison-controls'});
    for(const [yes,label] of [[true,a.route==='SUBJECT'?'종속국 통합 수락':'재통합 수락'],[false,a.route==='SUBJECT'?'종속국 통합 거절':'재통합 거절']]){const b=make('button',{class:'jump-button',type:'button',text:label});b.disabled=yes&&!a.eligible;
     b.addEventListener('click',()=>{if(yes&&!window.confirm(`${src.name}의 정착지·군대·자원을 ${n.name}에 합류시킬까요?`))return;
       const x=e2bRespond(w,src.id,yes,'PLAYER');showToast(x.ok?yes?'재통합 완료':'제안 거절':x.reason);
       if(x.ok){map.draw();updateStats();renderChronicle();refreshPlayerUI();} });controls.append(b);}section.append(controls);}
  }
 }
 const logs=e2bState(w).history.filter(h=>h.sourceId===n.id||h.targetId===n.id).slice(-4).reverse();
 for(const h of logs)section.append(make('div',{class:'muted-line',text:`${timeAt(h.dayIndex).year}년 · ${w.nations[h.sourceId]?.name} → ${w.nations[h.targetId]?.name} · ${h.kind}`}));
}

function runQuarter(world){
  const h1dPerfBegin=h1dTelemetry.enabled?performance.now():0;
  refreshApCaps(world);
  completeBuildings(world);
  runEconomyQuarter(world);
  iQuarter(world); // I: read-only freight demand planning; never move or charge inventory.
  kQuarter(world); // pay projects only after real economic bills and payroll.
  for(const n of world.nations)if(n.active&&n.controller==='AI')kAutoChoose(world,n);
  v06bPayTributeQuarter(world);
  processResearchQuarter(world);
  buildGeopoliticalReports(world);
  b4aDecayFormations(world);
  b4aUpdateSurvival(world);
  e4ApplyQuarter(world);
  v06e5ApplyQuarter(world);
  d1bQuarter(world);
  d2aQuarter(world);
  d2bQuarter(world);
  d2cQuarter(world);
  d1cQuarter(world);
  d1dQuarter(world);
  // E3: reserve the real 1-AP precision-mode decision before other AI
  // development choices consume all recovered AP this quarter.
  v07e3WorkshopModeQuarter(world);
  f1IndustryAIQuarter(world);
  i2AIQuarter(world);
  i3aAIQuarter(world);
  const followUp=[];
  for(const n of world.nations){
    if(!n.active||n.controller!=='AI')continue;
    // F2C: an AI preparing an eligible paid arsenal may bank its existing AP for one quarter.
    // This is not an AP grant: the action still pays its full 5 AP on construction.
    if(n.f2cArsenal?.reserveAP)continue;
    const territory=getTerritoryMetrics(world,n.id);
    const leader=getLeader(world,n),profile=d1dEffectiveProfile(world,n.id);
    if(!leader||!profile)continue;
    const research=chooseAIResearch(world,n.id);
    if(research)executeNationAction(world,n.id,{type:'START_RESEARCH',technologyId:research});
    let best=null,bestScore=-Infinity,bestRecovery=null,remoteFounding=null,remoteFoundingScore=-Infinity;
    const diagnosticCandidates=[],auxOptions=[];
    const recovery=v05aEconomicNeeds(world,n);
    let strongestBlockedScore=-Infinity;
    let v05bBestBlocked=null,v05bOldMatched=false;
    const v05bPrior=v05bState(n).plan,v05bPriorKey=v05bPrior?v05bActionKey(v05bPrior.action):null;
    const apRecordAtSelection=v04e3ApReport(n),auxQuarter=n.lastQuarter||projectedQuarter(world,n);
    if(apRecordAtSelection){apRecordAtSelection.auxCandidates=0;apRecordAtSelection.auxExecutable=0;apRecordAtSelection.auxBlocked=0;apRecordAtSelection.mainCandidates=0;apRecordAtSelection.mainExecutable=0;apRecordAtSelection.bestBlockedReason='NONE';apRecordAtSelection.bestBlockedAction='';}
    const barracksDiag={dayIndex:world.dayIndex,generated:0,legal:0,affordable:0,unaffordable:0,chosen:false,reason:'NO_CANDIDATE'};
    for(const c of candidatesForNation(world,n,territory,recovery)){
      const recoveryInfo=c.v05aRecovery,g=recoveryInfo&&recovery.goods[recoveryInfo.good];
      if(g?.need){g.candidates++;g.bestGain=Math.max(g.bestGain,recoveryInfo.gain);}
      const barracksCandidate=c.facility==='barracks';
      if(barracksCandidate)barracksDiag.generated++;
      const legal=isNationActionLegal(world,n.id,c.action,territory);
      if(barracksCandidate&&legal)barracksDiag.legal++;
      if(!legal)continue;
      if(g?.need)g.legal++;
      if(apRecordAtSelection)apRecordAtSelection.mainCandidates++;
      const score=actionScore(world,n,profile,leader,c,recovery);
      // Legality was proven directly above, with no intervening world mutation.
      // Preserve price calculation and affordability, but do not re-enter the
      // same legality checks for every candidate. Actual executeNationAction,
      // post-military deferrals and secondary actions still revalidate fully.
      const executable=canAfford(n,getNationActionCost(world,n.id,c.action,territory));
      if(!executable&&V05B_PROCUREMENT_TYPES.has(c.action.type)){
        const price=getNationActionCost(world,n.id,c.action,territory);
        if(v05bOnlyResourceBlocked(n,price)){
          const key=v05bActionKey(c.action);
          if(key===v05bPriorKey)v05bOldMatched=true;
          if(!v05bBestBlocked||score>v05bBestBlocked.score)v05bBestBlocked={action:c.action,key,score};
        }
      }
      if(executable&&g?.need)g.executable++;
      if(barracksCandidate){if(executable)barracksDiag.affordable++;else barracksDiag.unaffordable++;}
      if(!executable&&apRecordAtSelection&&score>strongestBlockedScore){
        strongestBlockedScore=score;
        const price=getNationActionCost(world,n.id,c.action,territory);
        apRecordAtSelection.bestBlockedReason=!price?'NO_PRICE':n.apUnits<price.apUnits?'AP_SHORTAGE':
          n.gold<price.gold?'GOLD_SHORTAGE':n.knowledge<price.knowledge?'KNOWLEDGE_SHORTAGE':
          RESOURCE_KEYS.some(k=>(n.resources[k]||0)<(price.resources[k]||0))?'RESOURCE_SHORTAGE':'OTHER_CONSTRAINT';
        apRecordAtSelection.bestBlockedAction=c.action.type+(c.facility?':'+c.facility:'');
      }
      if(executable){
        if(apRecordAtSelection)apRecordAtSelection.mainExecutable++;
        const insert=diagnosticCandidates.findIndex(v=>score>v.score);
        if(insert>=0)diagnosticCandidates.splice(insert,0,{action:c.action.type,score});
        else if(diagnosticCandidates.length<3)diagnosticCandidates.push({action:c.action.type,score});
        if(diagnosticCandidates.length>3)diagnosticCandidates.length=3;
        // Inexpensive civilian actions compete for ONE secondary slot after military.
        const cost=getNationActionCost(world,n.id,c.action,territory);
        if(v04e4AuxEligible(c,n,auxQuarter)&&cost?.apUnits<=16){
          if(apRecordAtSelection)apRecordAtSelection.auxCandidates++;
          auxOptions.push({action:c.action,score});
          auxOptions.sort((a,b)=>b.score-a.score);
          if(auxOptions.length>6)auxOptions.length=6;
        }
      }
      if(executable&&score>bestScore){best=c.action;bestScore=score;bestRecovery=c.v05aRecovery||null;}
      const minRemote=4+(100-profile.weights.founding)/30;
      if(c.action.type==='FOUND_SETTLEMENT'&&executable&&profile.weights.founding>=35&&c.remote>=minRemote&&c.adjacentOwned>=2&&score>remoteFoundingScore){
        remoteFounding=c.action;remoteFoundingScore=score;
      }
    }
    if(apRecordAtSelection&&apRecordAtSelection.mainCandidates===0)apRecordAtSelection.bestBlockedReason='NO_LEGAL_CANDIDATE';
const chosen=remoteFounding&&remoteFoundingScore>bestScore*1.05?remoteFounding:best;
    const selectedRecovery=chosen===best&&bestRecovery&&recovery.goods[bestRecovery.good]?.need?
      chosen.type+':'+V05A_RESOURCE_FACILITY[bestRecovery.good]:null;
    const recoverEntry=v05aCompleteDiagnosis(world,n,recovery,selectedRecovery,false);
    v05bUpdatePlan(world,n,v05bBestBlocked,v05bOldMatched);
    v05bLogQuarter(world,n,v05bState(n).lastTrade?.dayIndex===world.dayIndex?v05bState(n).lastTrade:null);
    barracksDiag.chosen=Boolean(chosen&&['BUILD_FACILITY','UPGRADE_FACILITY','REDEVELOP_FACILITY'].includes(chosen.type)&&
      (chosen.buildingType==='barracks'||world.buildings.some(b=>b.id===chosen.buildingId&&b.typeId==='barracks')));
    barracksDiag.reason=barracksDiag.chosen?'SELECTED':barracksDiag.generated===0?'NO_CANDIDATE':
      barracksDiag.legal===0?'ILLEGAL':barracksDiag.affordable===0?'UNAFFORDABLE':'OTHER_PRIORITY';
    n.military.barracksAiDiagnostics.push(barracksDiag);
    if(n.military.barracksAiDiagnostics.length>V04E2_DIAG_WINDOW)n.military.barracksAiDiagnostics.shift();
    const apRecord=v04e3ApReport(n),reserve=v04e3MilitaryReserve(world,n);
    if(apRecord)apRecord.reserved=reserve;
    const candidatePrice=chosen?getNationActionCost(world,n.id,chosen,territory):null;
    // No AP is actually withheld. Only delay the major decision when it would
    // consume the planned military budget; unused budget returns to civil use.
    const deferred=Boolean(chosen&&reserve&&candidatePrice&&n.apUnits-candidatePrice.apUnits<reserve);
    if(deferred&&apRecord)apRecord.mainDeferred++;
    if(chosen&&!deferred){
      const result=executeNationAction(world,n.id,chosen);
      if(apRecord&&result.ok)apRecord.main++;
      if(recoverEntry.selected&&result.ok)recoverEntry.completed=true;
      if(barracksDiag.chosen&&!result.ok)barracksDiag.reason='SELECTED_FAILED';
      world.aiDecisions.push({nationId:n.id,dayIndex:world.dayIndex,action:chosen.type,score:Number((chosen===remoteFounding?remoteFoundingScore:bestScore).toFixed(3)),ok:result.ok,top:diagnosticCandidates.map(v=>({action:v.action,score:Number(v.score.toFixed(3))}))});
      if(world.aiDecisions.length>240)world.aiDecisions.splice(0,world.aiDecisions.length-240);
    }
    followUp.push({id:n.id,chosen:deferred?chosen:null,score:chosen===remoteFounding?remoteFoundingScore:bestScore,top:diagnosticCandidates,barracksDiag,auxOptions,original:chosen,recoverEntry});
  }
  const h1dPerfBeforeMilitary=h1dTelemetry.enabled?performance.now():0;
  const h2b1EarlyCompleted=new Set();
  if(H2B_AI_ENABLED)for(const n of world.nations)if(h2b1PriorityRefit(world,n))h2b1EarlyCompleted.add(n.id);
  runMilitaryQuarter(world,executeNationAction);
  const h1dPerfBeforeAuto=h1dTelemetry.enabled?performance.now():0;
  hQuarter(world,h2b1EarlyCompleted);
  v08fQuarter(world);
  const h1dPerfAfterAuto=h1dTelemetry.enabled?performance.now():0;
  for(const entry of followUp){
    const n=world.nations[entry.id];if(!n.active)continue;
    const apRecord=v04e3ApReport(n);
    if(entry.chosen){
      // Military actions ran first; a postponed primary is now free to use the
      // remaining AP but must still satisfy full shared legality and resources.
      if(canExecuteNationAction(world,n.id,entry.chosen)){
        const result=executeNationAction(world,n.id,entry.chosen);
        if(apRecord&&result.ok)apRecord.main++;
        if(entry.recoverEntry?.selected&&result.ok)entry.recoverEntry.completed=true;
        if(entry.barracksDiag.chosen&&!result.ok)entry.barracksDiag.reason='SELECTED_FAILED';
        world.aiDecisions.push({nationId:n.id,dayIndex:world.dayIndex,action:entry.chosen.type,score:Number(entry.score.toFixed(3)),ok:result.ok,top:entry.top.map(v=>({action:v.action,score:Number(v.score.toFixed(3))}))});
        if(world.aiDecisions.length>240)world.aiDecisions.splice(0,world.aiDecisions.length-240);
      }else if(apRecord){apRecord.mainMissed++;if(entry.barracksDiag.chosen)entry.barracksDiag.reason='SELECTED_FAILED';}
    }
if(!apRecord)continue; // E4B: a valid minor action may proceed without a primary.
    const base=entry.original;
    const baseTownId=base?.settlementId??(base?.buildingId!==undefined?world.buildings.find(b=>b.id===base.buildingId)?.settlementId:undefined);
    for(const item of entry.auxOptions){
      const a=item.action;
      // Never repeat the main action or apply two simultaneous improvements to one location.
      if(base&&a.type===base.type&&a.targetTileId===base.targetTileId&&a.settlementId===base.settlementId&&a.buildingId===base.buildingId)continue;
      if(base&&a.settlementId!==undefined&&a.settlementId===base.settlementId&&['DEVELOP_SETTLEMENT','EXPAND_SETTLEMENT','MERGE_SETTLEMENTS'].includes(base.type))continue;
      // No duplicate civil improvements to one facility or town in the same quarter.
      const auxTownId=a.settlementId??(a.buildingId!==undefined?world.buildings.find(b=>b.id===a.buildingId)?.settlementId:undefined);
      if(base&&baseTownId!==undefined&&auxTownId===baseTownId&&
        ['BUILD_FACILITY','UPGRADE_FACILITY','REDEVELOP_FACILITY','DEVELOP_SETTLEMENT','EXPAND_SETTLEMENT'].includes(base.type))continue;
      if(!canExecuteNationAction(world,n.id,a)){apRecord.auxBlocked++;continue;}
      const price=getNationActionCost(world,n.id,a);
      // A voluntary secondary development must not strand next quarter's
      // necessary 1.0-AP recruitment order, even when current funds are abundant.
      if(!price||n.apUnits-price.apUnits<15){apRecord.auxBlocked++;continue;}
      const result=executeNationAction(world,n.id,a);
      if(result.ok){apRecord.auxiliary++;apRecord.auxExecutable++;
        if(!entry.recoverEntry?.selected&&['BUILD_FACILITY','UPGRADE_FACILITY','REDEVELOP_FACILITY'].includes(a.type)){
          const facility=a.buildingType||world.buildings.find(b=>b.id===a.buildingId)?.typeId;
          if(Object.values(V05A_RESOURCE_FACILITY).includes(facility)){entry.recoverEntry.selected=a.type+':'+facility;entry.recoverEntry.completed=true;}
        }
        break;}
    }
  }
  e2aQuarter(world);
  e3FiscalAIQuarter(world);
  v06e6Quarter(world);
  e2bQuarter(world);
  refreshApCaps(world);
  processCivilizationEraQuarter(world);
  v06e7aQuarter(world);
  if(h1dTelemetry.enabled){const t=performance.now(),q={dayIndex:world.dayIndex,totalMs:+(t-h1dPerfBegin).toFixed(2),preMilitaryMs:+(h1dPerfBeforeMilitary-h1dPerfBegin).toFixed(2),militaryMs:+(h1dPerfBeforeAuto-h1dPerfBeforeMilitary).toFixed(2),automatonMs:+(h1dPerfAfterAuto-h1dPerfBeforeAuto).toFixed(2),postMs:+(t-h1dPerfAfterAuto).toFixed(2)};h1dTelemetry.quarters++;h1dTelemetry.lastQuarterMs=q.totalMs;h1dTelemetry.maxQuarterMs=Math.max(h1dTelemetry.maxQuarterMs,q.totalMs);h1dTelemetry.samples.push(q);if(h1dTelemetry.samples.length>32)h1dTelemetry.samples.shift();}
}
/** E3 AI action: candidate selection only, uses the same paid SET_WORKSHOP_MODE. */
function v07e3WorkshopModeQuarter(world){
  // E3: forecast the NEXT quarter's real inputs, replacing fixed 320/190 stock
  // requirements. Stable building-ID priority, no free materials, no RNG.
  // The legal player action and the actual workshop consumption path are unchanged.
  for(const n of world.nations){
    if(!n.active||n.controller!=='AI'||n.civilization.era!=='early_modern'||n.civilization.stage<3||
       !hasTech(world,n.id,'precision_workshop_methods'))continue;
    const workshops=world.buildings.filter(b=>b.typeId==='workshop'&&b.status==='ACTIVE'&&!b.disconnected&&
      world.tiles[b.tileId]?.ownerId===n.id&&world.tiles[b.tileId]?.occupiedBy===null&&
      world.settlements.some(s=>s.id===b.settlementId&&s.ownerId===n.id&&s.population>0))
      .sort((a,b)=>a.id-b.id);
    const q=projectedQuarter(world,n);
    const expectedWood=n.resources.wood+q.produced.wood,expectedIron=n.resources.iron+q.produced.iron;
    let neededWood=workshops.reduce((s,b)=>s+(b.level===3&&b.workshopMode==='precision'?16:4*Math.min(3,b.level)),0);
    let neededIron=workshops.reduce((s,b)=>s+(b.level===3&&b.workshopMode==='precision'?9:2*Math.min(3,b.level)),0);
    const woodBuffer=Math.min(6,Math.floor(q.produced.wood/2));
    const ironBuffer=Math.min(3,Math.floor(q.produced.iron/2));
    // Only one real AP-costing switch per nation per quarter, as before.
    for(const b of workshops){
      if(b.level!==3)continue;
      const precise=b.workshopMode==='precision';
      const desiredWood=neededWood+(precise?0:4),desiredIron=neededIron+(precise?0:3);
      const canSupply=expectedWood>=desiredWood+woodBuffer&&expectedIron>=desiredIron+ironBuffer;
      const want=canSupply?'precision':'standard';
      const action={type:'SET_WORKSHOP_MODE',buildingId:b.id,mode:want};
      if(canExecuteNationAction(world,n.id,action)){
        executeNationAction(world,n.id,action);
        neededWood+=want==='precision'?4:-4;
        neededIron+=want==='precision'?3:-3;
        break;
      }
    }
  }
}
function runYear(world){
  for(const n of world.nations){
    if(!n.active)continue;
    const leader=getLeader(world,n);
    const yearRecord=e3e2BeginYear(n,world.dayIndex);
    for(const s of world.settlements){
      if(s.ownerId!==n.id)continue;
      const maxPopulation=settlementHousing(world,s);
      const annual=.034+s.development/2000+n.researchLevel/3300+(leader?.administration||50)/8500-.029*s.population/maxPopulation;
      const crowding=Math.max(0,s.population/maxPopulation-.88);
      const result=e3e2SettlementPopulation(n,s,annual,crowding,maxPopulation);
      // Fractions survive save/reload, war, migration and skipped integer years.
      s.f2c1BirthCarry=result.f2c1BirthCarry;
      s.f2c1OrdinaryDeathCarry=result.f2c1OrdinaryDeathCarry;
      s.f2c1HungerDeathCarry=result.f2c1HungerDeathCarry;
      e3e2AccumulateYear(yearRecord,result);
      const next=result.endingPopulation;
      if(next!==s.population){d1CultureResize(s.culturePopulation,next,n.primaryCultureId);s.population=next;d1bSyncGroups(s,world);d2aSyncGroups(world,s);refreshSettlementLevel(s);world.changeSeq++;}
    }
    e3e2FinishYear(n,yearRecord);
    if(leader){
      leader.age++;
      const mortality=leader.age<65?0:leader.age>=91?1:(leader.age-64)/150;
      if(rand(world)<mortality){
        leader.alive=false;
        world.pastLeaders.push({id:leader.id,nationId:n.id,name:leader.name,age:leader.age,
          reignStartDay:leader.reignStartDay,endDay:world.dayIndex});
        if(world.pastLeaders.length>180)world.pastLeaders.shift();
        world.characters=world.characters.filter(c=>c.id!==leader.id);
        const successor=makeLeader(world,n.id);
        recordSimEvent(world,`${n.name}: 지도자 ${leader.name}의 뒤를 이어 ${successor.name}이(가) 즉위했습니다.`,'leader');
        world.changeSeq++;
      }
    }
  }
  ageCommanders(world);
}
/** Boundary jumping: no per-person, per-day or per-tile daily simulation. */
function advanceSimulation(world,days,entropySource=null){
  if(!Number.isInteger(days)||days<0||days>1000000)throw Error('날짜 이동량이 올바르지 않습니다.');
  let remaining=days;
  while(remaining>0){
    const until=DAYS_PER_QUARTER-world.dayIndex%DAYS_PER_QUARTER;
    const nextMilitaryEvent=nextMilitaryDay(world);
    const nextFortEvent=nextFortProjectDay(world);
    const nextSpecialistEvent=c3NextTrainingDay(world);
    const fortIn=nextFortEvent-world.dayIndex;
    const militaryIn=nextMilitaryEvent-world.dayIndex;
    const jump=Math.min(until,remaining,militaryIn>0?militaryIn:until,fortIn>0?fortIn:until,nextSpecialistEvent>world.dayIndex?nextSpecialistEvent-world.dayIndex:until);
    c3AdvanceTraining(world,jump);
    world.dayIndex+=jump;remaining-=jump;
    d1cPruneCommanderHistory(world); // H1: exact 360-day retention, even on non-quarter days.
    processFortProjects(world);
    completeRearming(world);
    g5RedeployFinish(world);
    hFinishRepairs(world);
    const quarterBoundary=world.dayIndex%DAYS_PER_QUARTER===0;
    if(quarterBoundary){
      reseedAtBoundary(world,entropySource);
      completeRearming(world);
      g5RedeployFinish(world);
      hFinishRepairs(world);
      runQuarter(world);
      if(world.dayIndex%DAYS_PER_YEAR===0){runYear(world);b4aRecordYear(world);recordAnnualWarAudit(world);}
    }
    // A requested SIM batch boundary is NOT a world event. In particular x10
    // must not run the military planner more often than a single 120-day step.
    if(quarterBoundary||world.dayIndex===nextMilitaryEvent){
      processMilitaryDay(world,executeNationAction);
      for(const n of world.nations)i1Reconcile(world,n); // national military spending is an explicit legacy draw
      if(quarterBoundary)i1CloseQuarter(world); // only unspent stock may depart at end of quarter
    }
  }
  return world;
}


