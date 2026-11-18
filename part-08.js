// --- src/core/world.js ---













const CLAMP=(n,a,b)=>Math.max(a,Math.min(b,n));
const dir4=[[1,0],[-1,0],[0,1],[0,-1]];
// G2A: deterministic 8-way tactical neighbors; ordinary territory/roads stay 4-way.
const militaryDir8=[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[1,1],[-1,-1],[-1,1]];
function tileId(x,y,size=MAP_SIZE){return y*size+x;}
function pointOf(id,size=MAP_SIZE){return {x:id%size,y:Math.floor(id/size)};}
function timeAt(dayIndex){return {year:Math.floor(dayIndex/DAYS_PER_YEAR)+1,quarter:Math.floor(dayIndex%DAYS_PER_YEAR/DAYS_PER_QUARTER)+1,day:dayIndex%DAYS_PER_QUARTER+1};}
function neighbors4(id,size=MAP_SIZE,height=size){
  const {x,y}=pointOf(id,size),ans=[];
  for(const [dx,dy] of dir4){const xx=x+dx, yy=y+dy;if(xx>=0&&yy>=0&&xx<size&&yy<height)ans.push(tileId(xx,yy,size));}
  return ans;
}
function neighborsMilitary8(id,size=MAP_SIZE,height=size){
  const x=id%size,y=Math.floor(id/size),ans=[];
  for(const [dx,dy] of militaryDir8){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<size&&yy<height)ans.push(yy*size+xx);}
  return ans;
}
function militaryDiagonal(from,to,size){return from%size!==to%size&&Math.floor(from/size)!==Math.floor(to/size);}
/** Diagonal land crossing cannot tunnel through a water-water corner.
 * Neutral or non-belligerent owners on orthogonal flanks do not block legal diagonal attacks.
 * A complete pair of hostile protected fort-line shoulders is also not bypassed. */
function militaryStepPermitted(w,from,to,nationId=null,fortNet=null){
  const a=w.tiles[from],b=w.tiles[to];if(!a||!b||!TERRAINS[b.terrain]?.passable)return false;
  const dx=b.x-a.x,dy=b.y-a.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))!==1)return false;
  if(!dx||!dy)return true;
  const p=w.tiles[a.y*w.size+b.x],q=w.tiles[b.y*w.size+a.x];
  if((!TERRAINS[p.terrain]?.passable)&&(!TERRAINS[q.terrain]?.passable))return false;
  if(nationId!==null){
    const guarded=t=>fortLineBlocks(w,t.id,nationId,fortNet)||hostileFortUncaptured(w,t.id,nationId,fortNet);
    if(guarded(p)&&guarded(q))return false;
  }
  return true;
}

function elevation(seed,x,y,size,height=size){
  // 대규모 대륙·해안 + 중규모 굴곡 + 소규모 변화
  const radius=Math.hypot((x-(size-1)/2)/((size-1)/2),(y-(height-1)/2)/((height-1)/2));
  const continent=smoothNoise(seed,x+33,y+17,10,1);
  const lobes=smoothNoise(seed,x,y,5,2);
  const fine=smoothNoise(seed,x,y,2.2,3);
  return 0.74+0.46*(continent-.5)+0.25*(lobes-.5)+0.09*(fine-.5)-radius*.44;
}
function terrainAt(seed,x,y,size,threshold,height=size){
  const e=elevation(seed,x,y,size,height);
  if(e<threshold)return 'water';
  const relief=smoothNoise(seed,x,y,5,8)*.60+smoothNoise(seed,x,y,2.8,9)*.40;
  const humidity=smoothNoise(seed,x+137,y-89,6,10)*.70+smoothNoise(seed,x,y,3,11)*.30;
  const high=e-threshold;
  if((relief>.69&&high>.22)||(relief>.79&&high>.12))return 'mountain';
  if(relief>.62&&high>.12)return 'rock';
  if(humidity>.57&&relief<.64)return 'forest';
  return humidity>.41?'grass':'plain';
}
function landComponents(tiles,size,height=size){
  const seen=new Set(),parts=[];
  for(const t of tiles){
    if(!TERRAINS[t.terrain].passable||seen.has(t.id))continue;
    const q=[t.id],part=[];seen.add(t.id);
    for(let i=0;i<q.length;i++){
      const id=q[i];part.push(id);
      for(const n of neighbors4(id,size,height))if(!seen.has(n)&&TERRAINS[tiles[n].terrain].passable){seen.add(n);q.push(n);}
    }
    parts.push(part);
  }
  return parts.sort((a,b)=>b.length-a.length);
}
function generateTerrain(seed,size,height=size){
  const total=size*height;
  // 물 비율을 가급적 일정하게 맞추되 지형별 연속성 보존
  const heights=Array.from({length:total},(_,i)=>elevation(seed,i%size,Math.floor(i/size),size,height)).sort((a,b)=>a-b);
  const threshold=heights[Math.floor(total*.245)];
  const tiles=Array.from({length:total},(_,id)=>{
    const {x,y}=pointOf(id,size);
    return {id,x,y,terrain:terrainAt(seed,x,y,size,threshold,height),ownerId:null,settlementId:null,occupiedBy:null};
  });
  // 좁은 바다/호수가 형성되더라도 거주 가능한 주 대륙 확보
  const parts=landComponents(tiles,size,height);
  const principal=parts[0]||[];
  // 최소 대륙 면적 보장: 섬 조각이 많은 경우 주요 섬을 잇는 얕은 육지 회랑 생성
  if(principal.length < Math.floor(total*.56)){
    const principalSet=new Set(principal);
    for(const part of parts.slice(1)){
      if(principalSet.size>=Math.floor(total*.64))break;
      let a,b,min=Infinity;
      for(const i of principalSet)for(const j of part){
        const p=pointOf(i,size),q=pointOf(j,size),d=Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
        if(d<min){min=d;a=p;b=q;}
      }
      if(!a||!b)continue;
      let {x,y}=a;
      while(x!==b.x||y!==b.y){
        if(x!==b.x)x+=Math.sign(b.x-x); else y+=Math.sign(b.y-y);
        const t=tiles[tileId(x,y,size)];if(t.terrain==='water')t.terrain='grass';
        principalSet.add(t.id);
      }
      for(const id of part)principalSet.add(id);
    }
  }
  return tiles;
}
function chooseCapitals(tiles,seed,size,count,height=size){
  const rng=createRandom(seed^0x765ced),land=landComponents(tiles,size,height)[0]||[];
  const main=new Set(land);
  const candidates=land.filter(id=>{
    const t=tiles[id];
    return t.x>=1&&t.y>=1&&t.x<size-1&&t.y<height-1&&['grass','plain','forest'].includes(t.terrain)&&neighbors4(id,size,height).filter(n=>main.has(n)).length>=3;
  });
  if(candidates.length<count)throw Error('적합한 수도 후보가 부족합니다.');
  const quality=id=>{
    const t=tiles[id];
    const around=neighbors4(id,size,height);
    const soft=around.filter(n=>['grass','plain','forest'].includes(tiles[n].terrain)).length;
    const terrain=t.terrain==='plain'?1:t.terrain==='grass'?.8:.6;
    return soft*.24+terrain+.3*coordRandom(seed,t.x,t.y,29);
  };
  if(height!==size){
    // Spread starts across wide land while safeguarding early expansion and resource access.
    // Pure function + local seeded RNG: same seed and dimensions yield identical capitals.
    const nearby=new Map(candidates.map(id=>{
      const p=pointOf(id,size);let land=0,soft=0,resources=0;
      for(let y=Math.max(0,p.y-3);y<=Math.min(height-1,p.y+3);y++)
        for(let x=Math.max(0,p.x-3);x<=Math.min(size-1,p.x+3);x++){
          if(Math.abs(x-p.x)+Math.abs(y-p.y)>4)continue;
          const terrain=tiles[tileId(x,y,size)].terrain;
          if(terrain!=='water'){land++;if(['plain','grass','forest'].includes(terrain))soft++;if(['rock','mountain','forest'].includes(terrain))resources++;}
        }
      return [id,{land,soft,resources}];
    }));
    const fair=candidates.filter(id=>nearby.get(id).land>=15&&nearby.get(id).soft>=7);
    const pool=fair.length>=count?fair:candidates;
    const picked=[];
    const spacing=count>c1DefaultNationCount(size,height)?Math.max(2.2,Math.min(5,Math.sqrt(land.length/count)*.49)):0;
    // Deterministic randomized tie noise is evaluated once per location, not on each round.
    const jitter=new Map(pool.map(id=>[id,rng.next()]));
    const nearestDistances=new Map(pool.map(id=>[id,Infinity]));
    while(picked.length<count){
      let best=null,bestScore=-Infinity;
      for(const id of pool){
        if(picked.includes(id))continue;
        const p=pointOf(id,size),a=nearby.get(id);
        const nearest=picked.length?nearestDistances.get(id):0;
        if(picked.length&&nearest<spacing)continue;
        const site=a.land*.13+a.soft*.085+Math.min(10,a.resources)*.11;
        const score=picked.length?nearest*4.5+site+(jitter.get(id)||0)*.65:site-(Math.hypot((p.x-(size-1)/2)/1.6,p.y-(height-1)/2))*.06+(jitter.get(id)||0)*.65;
        if(score>bestScore){bestScore=score;best=id;}
      }
      if(best===null)throw Error('공정한 수도 간격을 확보할 수 없습니다. 국가 수를 줄이세요.');
      picked.push(best);
      const q=pointOf(best,size);
      for(const id of pool){const p=pointOf(id,size);const distance=Math.hypot(p.x-q.x,p.y-q.y);if(distance<nearestDistances.get(id))nearestDistances.set(id,distance);}
    }
    for(let i=picked.length-1;i>0;i--){const j=rng.int(i+1);[picked[i],picked[j]]=[picked[j],picked[i]];}
    return picked;
  }
  // 첫 수도는 중부 근처, 이후엔 기존 수도에서 멀수록 유리하게 선택
  const center={x:(size-1)/2,y:(height-1)/2};
  const first=candidates.slice().sort((a,b)=>{
    const pa=pointOf(a,size),pb=pointOf(b,size);
    const sa=quality(a)-.1*Math.hypot(pa.x-center.x,pa.y-center.y);
    const sb=quality(b)-.1*Math.hypot(pb.x-center.x,pb.y-center.y);
    return sb-sa||a-b;
  })[0];
  const selected=[first];
  const nearestDistances=new Map(candidates.map(id=>{const p=pointOf(id,size);return [id,Math.hypot(p.x-center.x,p.y-center.y)];}));
  const firstPoint=pointOf(first,size);
  for(const id of candidates){const p=pointOf(id,size);nearestDistances.set(id,Math.hypot(p.x-firstPoint.x,p.y-firstPoint.y));}
  const spacing=count>c1DefaultNationCount(size,height)?Math.max(2.2,Math.min(5,Math.sqrt(land.length/count)*.49)):0;
  while(selected.length<count){
    let best=null,bestScore=-Infinity;
    for(const id of candidates){
      if(selected.includes(id))continue;
      const p=pointOf(id,size);
      const nearest=nearestDistances.get(id);
      if(nearest<spacing)continue;
      const score=nearest*5 + quality(id)*.85 + rng.next()*.75;
      if(score>bestScore){bestScore=score;best=id;}
    }
    if(best===null)throw Error('공정한 수도 간격을 확보할 수 없습니다. 국가 수를 줄이세요.');
    selected.push(best);
    const q=pointOf(best,size);
    for(const id of candidates){const p=pointOf(id,size);const distance=Math.hypot(p.x-q.x,p.y-q.y);if(distance<nearestDistances.get(id))nearestDistances.set(id,distance);}
  }
  // 선택 순서가 성향/국가의 위치 우열로 고착되지 않도록 독립 시드로 혼합
  for(let i=selected.length-1;i>0;i--){const j=rng.int(i+1);[selected[i],selected[j]]=[selected[j],selected[i]];}
  return selected;
}
function createWorld(seedText='vilob-light-01',size=MAP_SIZE,height=size,customSetup=null){
  if(typeof size==='object'&&size!==null){height=size.height;size=size.width;}
  if(!c1ValidMapSize(size,height))throw Error('지원하지 않는 지도 크기 또는 10,000타일 초과입니다.');
  const seedString=String(seedText).trim().slice(0,100)||'vilob-light-01';
  const count=customSetup?.nationCount??c1DefaultNationCount(size,height);
  if(!Number.isInteger(count)||count<c1DefaultNationCount(size,height)||count>c1NationCapacity(size,height))
    throw Error(`이 지도는 ${c1DefaultNationCount(size,height)}~${c1NationCapacity(size,height)}개국을 지원합니다.`);
  const seed=hashSeed(seedString),tiles=generateTerrain(seed,size,height);
  const templates=c1Templates(size,height,count);
  const capitals=chooseCapitals(tiles,seed,size,templates.length,height);
  const configuredProfiles=buildProfileLibrary(true);
  if(customSetup?.profiles){for(const [id,p] of Object.entries(customSetup.profiles)){validateProfile(p);if(id!==p.id||Object.hasOwn(configuredProfiles,id))throw Error('새 세계 커스텀 프로필 ID 중복');configuredProfiles[id]=v06a2EnsureProfile(structuredClone(p));}}
  const nations=templates.map((n,id)=>({
    id,name:validateNationName(customSetup?.nations?.[id]?.name??n.name),color:customSetup?.nations?.[id]?.color?validColor(customSetup.nations[id].color):n.color,personality:n.personality,description:n.description,
    controller:'AI',aiProfileId:customSetup?.nations?.[id]?.profileId??n.profile,leaderId:null,active:true,truces:{},technology:initialTechnology(),civilization:initialCivilization(),knowledgeExchange:initialKnowledgeExchange(),military:newMilitaryState(),survival:null,...newEconomy(),
    trade:{exports:0,imports:0,exportValue:0,importValue:0,quarterExports:0,quarterImports:0,quarterExportValue:0,quarterImportValue:0},
    actionStats:{},capitalId:capitals[id],settlementIds:[id],governance:e1NewGovernance()
  }));
  if(new Set(nations.map(n=>n.name)).size!==nations.length)throw Error('새 세계 국가명이 중복됩니다.');
  for(const n of nations)if(!configuredProfiles[n.aiProfileId])throw Error('새 세계 국가 프로필이 존재하지 않습니다.');
  const settlements=nations.map(n=>({id:n.id,ownerId:n.id,coreTileId:n.capitalId,
    name:`${n.name} 수도`,founderNationId:n.id,formerCapitalOf:[n.id],tileIds:[n.capitalId],population:17,development:12,level:1}));
  for(const t of tiles)t.roadLevel=0;
  for(const s of settlements){tiles[s.coreTileId].ownerId=s.ownerId;tiles[s.coreTileId].settlementId=s.id;}
  const world={schema:'vilob-light-v03d',version:VERSION,barracksEvents:[],seed:seedString,size,height,dayIndex:0,setupLocked:false,rngState:hash32(seed^0x71a78b09)||1,
    rngPolicy:{fixed:true,intervalDays:120,lastReseedDay:null,reseedCount:0},
    tiles,riverSchemaVersion:RIVER_SCHEMA_VERSION,riverSegments:generateRiverSegments(seedString,size,height,tiles),nations,settlements,trade:initialTrade(),market:e3eInitialMarket(),diplomacy:createDiplomacy(nations),peaceHistory:[],warHistory:[],buildings:[],defenses:[],nextBuildingId:0,aiProfiles:configuredProfiles,characters:[],pastLeaders:[],pastCommanders:[],nextCharacterId:0,armies:[],wars:[],engagements:[],occupations:[],battleHistory:[],nextArmyId:0,nextWarId:0,nextEngagementId:0,
    e2Artillery:{produced:0,destroyed:0,stocks:{}},v08fArmor:{schema:1,nextId:1,produced:0,destroyed:0,stocks:{},vehicles:[],history:[]},e2aPolicyAIEnabled:true,e3FiscalAIEnabled:true,e7bFiscalStabilityEnabled:true,v06e5Violence:v06e5NewWorldState(),v06e6Policy:v06e6NewWorldState(),nextSettlementId:settlements.length,changeSeq:0,c6ArmyHistory:{entries:[],dropped:0,byReason:{}},c6StrategyStats:{frontReviews:0,unreachableChecks:0,pathChecks:0,noReachableOrders:0},aiDecisions:[],warDecisionDiagnostics:v06b4NewDiagnostics(),strategyReports:{dayIndex:0,nations:{}},historicalChronicle:initialHistoricalChronicle(),events:[{dayIndex:0,text:`${count}개 국가가 세계에 정착했습니다.`,kind:'world'}]};
  for(const n of nations){makeLeader(world,n.id);n.survival=b4aNewSurvival(world,n.id);n.governance.unifiedAI=v06e6NewNationAI();}
  v06e7aInit(world);
  refreshApCaps(world);
  d1InitializeCultureWorld(world);
  d1bInitializeWorld(world);
  d1cInitializeWorld(world);
  d1dInitializeWorld(world);
  d2aInitWorld(world);
  d2bInitWorld(world);
  hInit(world);
  for(const n of world.nations){kEnsure(n);iEnsure(n);i1Ensure(n,world);}
  world.diplomacy.reunification=e2bNewState();
  return world;
}
function advanceDays(world,days=1,entropySource=null){if(days>0)world.setupLocked=true;return advanceSimulation(world,days,entropySource);}
function worldSummary(world){
  const t=timeAt(world.dayIndex),owned=world.tiles.filter(tile=>tile.ownerId!==null).length;
  return {...t,nations:world.nations.filter(n=>n.active).length,settlements:world.settlements.length,owned,armies:world.armies.length,wars:world.wars.length,
    population:world.settlements.reduce((sum,s)=>sum+s.population,0),
    neutral:world.tiles.filter(tile=>tile.ownerId===null&&tile.terrain!=='water').length,
    water:world.tiles.filter(tile=>tile.terrain==='water').length};
}
// F3: bounded, schema-validated tactical cache. Old saves may omit it.
function f3ValidCoalitionPlan(w,entry){
 if(!entry||Array.isArray(entry)||typeof entry!=='object'||
    !Number.isSafeInteger(entry.tick)||entry.tick<0||entry.tick>Math.floor(w.dayIndex/10)||
    !entry.plans||Array.isArray(entry.plans)||typeof entry.plans!=='object'||
    Object.keys(entry).length!==2||Object.keys(entry.plans).length!==2)return false;
 for(const side of ['attackers','defenders']){
  const items=entry.plans[side];
  if(!Array.isArray(items)||items.length>10)return false;
  const used=new Set();let prevValue=Infinity,prevId=-1;
  for(const item of items){
   if(!item||Array.isArray(item)||typeof item!=='object'||Object.keys(item).length!==3||
      !Number.isSafeInteger(item.id)||item.id<0||item.id>=w.tiles.length||
      !Number.isSafeInteger(item.value)||item.value<0||item.value>64||
      !['COALITION_DEFEND','COALITION_FRONT'].includes(item.role)||used.has(item.id)||
      item.value>prevValue||(item.value===prevValue&&item.id<=prevId))return false;
   used.add(item.id);prevValue=item.value;prevId=item.id;
  }
 }
 return true;
}
function validateWorld(w){
  const fail=what=>{throw Error('월드 검증 실패: '+what);};
  if(!w||w.schema!=='vilob-light-v03d'||w.version!==VERSION)fail('세이브 형식');
  if(w.v08eRecovery&&(w.v08eRecovery.schema!==1||w.v08eRecovery.kind!=='AUDITED_TERRITORIAL_F2B_79530'||w.v08eRecovery.sourceVersion!=='V0.8D'||w.v08eRecovery.originDay!==79530||w.v08eRecovery.machineParts!==6||w.v08eRecovery.steel!==16||w.v08eRecovery.donorNationId!==6||w.v08eRecovery.receiverNationId!==10||!Number.isSafeInteger(w.v08eRecovery.dayIndex)||w.v08eRecovery.dayIndex>w.dayIndex))fail('V0.8E 산업 회계 복구 기록');
  if(!hValidate(w))fail('H 오토마톤 실물·파츠 회계');
 if(!v08fValidate(w))fail('V0.8F 돌격전차 실물·승무원 보존식');
 if(!i1Valid(w))fail('I1 실물 지역 재고·수송 보존식');
 if(w.v07lRecovery&&(!Array.isArray(w.v07lRecovery.pruned)||w.v07lRecovery.pruned.length>256||w.v07lRecovery.schema!==1||!Number.isSafeInteger(w.v07lRecovery.dayIndex)||w.v07lRecovery.dayIndex>w.dayIndex||w.v07lRecovery.pruned.some(p=>!Number.isSafeInteger(p.nationId)||!Number.isSafeInteger(p.settlementId))))fail('I1L 복구 이력');
 for(const n of w.nations||[])if(!iValid(w,n))fail('I 산업 수송 계획 장부');
  for(const n of w.nations||[])if(!kValid(w,n))fail('H2K 국가 프로젝트 투자 장부');
  if(!validateHistoricalChronicle(w))fail('장기 역사 기록');
  if(!c6ValidateArmyHistory(w))fail('C6 편제 수명주기 기록');
  if(!e3cValidateFormationRecords(w))fail('E3C 편제 전투 기록');
  if(!c6ValidateStrategyStats(w))fail('C6 전선·경로 진단');
  for(const n of w.nations||[]){
    const s=n.constructionProcurement;
    if(!s||!Array.isArray(s.history)||s.history.length>V05B_PROCUREMENT_WINDOW||
      s.plan!==null&&(!V05B_PROCUREMENT_TYPES.has(s.plan.action?.type)||!Number.isFinite(s.plan.score)||!Number.isSafeInteger(s.plan.startedDay)||s.plan.startedDay>w.dayIndex)||
      s.history.some(h=>!Number.isSafeInteger(h.dayIndex)||h.dayIndex<0||h.dayIndex>w.dayIndex||
        !['NO_PLAN','PLANNED','NO_PURCHASE','FUNDED','PARTIAL_IMPORT','NO_ROUTE','NO_SELLER_SURPLUS','GOLD_OR_FREIGHT_LIMIT'].includes(h.status)||
        !h.needed||!h.imported||V05B_BUILD_GOODS.some(g=>!Number.isSafeInteger(h.needed[g])||h.needed[g]<0||!Number.isSafeInteger(h.imported[g])||h.imported[g]<0)||
        !Number.isSafeInteger(h.importGold)||h.importGold<0))fail('V0.5B 건설 조달 기록');
  }
  for(const n of w.nations||[]){
    const history=n.economicRecovery?.history;
    if(!Array.isArray(history)||history.length>V05A_HISTORY_WINDOW||history.some(h=>
      !Number.isSafeInteger(h.dayIndex)||h.dayIndex<0||h.dayIndex>w.dayIndex||
      !h.goods||RESOURCE_KEYS.some(g=>!h.goods[g]||
        ['stock','produced','consumed','deficit','geologicalTiles','candidates','legal','executable','bestGain','imports','blockedImports'].some(k=>
          !Number.isFinite(h.goods[g][k])||h.goods[g][k]<0))))fail('V0.5A 경제 회복 진단');
  }
  if(!Array.isArray(w.barracksEvents)||w.barracksEvents.length>V04E2_BARRACKS_EVENTS_MAX||w.barracksEvents.some(e=>!Number.isSafeInteger(e.dayIndex)||e.dayIndex<0||e.dayIndex>w.dayIndex||!['SETTLEMENT_TRANSFER','DETACH','RECONNECT'].includes(e.kind)||!Array.isArray(e.buildingIds)||e.buildingIds.some(id=>!Number.isInteger(id))))fail('병영 소유권 이벤트');
  if(!validateTrade(w))fail('국제 교역 상태');
  if(!e3eValidateMarket(w))fail('E3E 국제 시장 회계');
  if(!e3e3ValidateSupply(w))fail('E3E3 자원·물류 장부');
  if(!f1ValidateWorld(w))fail('F1 석탄·동력·노동 회계');
  if(!f2ValidateWorld(w))fail('F2A 공장·기계 부품 회계');
  if(!kValidateFactoryEvidence(w))fail('V0.7K Lv.4 실제 가동 증거');
  if(!f2c2cValidate(w))fail('F2C2C 산업 수요 및 생산 가동 상태');
  if(!f2bValidate(w))fail('F2B 산업 시설·강철 회계');
 if(!f2cValidate(w))fail('F2C 군수 제작소·산업제 포탄 회계');
  if(!validateStrategicReports(w))fail('AI 전략 진단');
  if(!c1ValidMapSize(w.size,w.height)||!Number.isSafeInteger(w.dayIndex)||w.dayIndex<0||typeof w.setupLocked!=='boolean'||w.dayIndex>0&&!w.setupLocked)fail('시간·크기·초기 설정 잠금');
  if(!Number.isInteger(w.rngState)||w.rngState<0||w.rngState>0xffffffff)fail('RNG');
  const policy=w.rngPolicy;
  if(!policy||typeof policy.fixed!=='boolean'||![30,120].includes(policy.intervalDays)||!Number.isSafeInteger(policy.reseedCount)||policy.reseedCount<0||
    !(policy.lastReseedDay===null||Number.isSafeInteger(policy.lastReseedDay)&&policy.lastReseedDay>=0&&policy.lastReseedDay<=w.dayIndex&&policy.lastReseedDay%policy.intervalDays===0))fail('RNG 설정');
  if(w.riverSchemaVersion!==RIVER_SCHEMA_VERSION)fail('하천 스키마 버전');
  try{riverValidate(w.tiles,w.size,w.height,w.riverSegments);}catch(error){fail(error.message);}
  if(!Array.isArray(w.tiles)||w.tiles.length!==w.size*w.height||!Array.isArray(w.nations)||(w.nations.length<c1DefaultNationCount(w.size,w.height)||w.nations.length>c1NationCapacity(w.size,w.height)))fail('지도·국가');
  if(!w.aiProfiles||Object.keys(w.aiProfiles).length>104)fail('AI 프로필');
  if(!Array.isArray(w.aiDecisions)||w.aiDecisions.length>240||w.aiDecisions.some(d=>!Number.isInteger(d.nationId)||!w.nations[d.nationId]||!Number.isInteger(d.dayIndex)||d.dayIndex<0||d.dayIndex>w.dayIndex||typeof d.action!=='string'||d.action.length>80||!Number.isFinite(d.score)))fail('AI 행동 진단');
  for(const [id,p] of Object.entries(w.aiProfiles)){try{validateProfile(p);if(!p.powerPerception)throw Error('missing perception weights');}catch{fail('AI 프로필 수치');}if(id!==p.id)fail('AI 프로필 ID');}
  if(w.warAuditYears!==undefined&&(!Array.isArray(w.warAuditYears)||w.warAuditYears.length>E4_AUDIT_MAX_YEARS||w.warAuditYears.some((s,i)=>!Number.isSafeInteger(s.dayIndex)||s.dayIndex<0||s.dayIndex>w.dayIndex||s.dayIndex%DAYS_PER_YEAR!==0||(i>0&&s.dayIndex<=w.warAuditYears[i-1].dayIndex)||E4_AUDIT_COLUMNS.some(k=>!Number.isFinite(s[k])||s[k]<0))))fail('E4 연간 전쟁 진단');
  if(!w.diplomacy?.pairs||!Array.isArray(w.diplomacy.alliances)||!Array.isArray(w.diplomacy.offers)||!Array.isArray(w.diplomacy.calls)||!Array.isArray(w.peaceHistory)||!Array.isArray(w.warHistory)||w.warHistory.length>200)fail('외교·전쟁사 데이터');
  if(!w.diplomacy.memory||typeof w.diplomacy.memory!=='object'||!Array.isArray(w.diplomacy.history)||w.diplomacy.history.length>120||
    !Number.isSafeInteger(w.diplomacy.borderRevision)||w.diplomacy.borderRevision<0||
    !Number.isSafeInteger(w.diplomacy.relationRevision)||w.diplomacy.relationRevision<0)fail('E5 외교 기억 자료');
  v06bValidate(w,fail);
  v06b4ValidateDiagnostics(w,fail);
  b4aValidate(w,fail);
  if(!w.diplomacy.perceptions||typeof w.diplomacy.perceptions!=='object'||Array.isArray(w.diplomacy.perceptions)||Object.keys(w.diplomacy.perceptions).length>w.nations.length*(w.nations.length-1))fail('V0.6A 인식 목록');
  for(const [key,m] of Object.entries(w.diplomacy.perceptions)){
    const ids=key.split(':').map(Number);
    if(ids.length!==2||ids[0]===ids[1]||!Number.isInteger(ids[0])||!Number.isInteger(ids[1])||!w.nations[ids[0]]||!w.nations[ids[1]]||!m||
      !Number.isSafeInteger(m.lastUpdatedDay)||m.lastUpdatedDay<0||m.lastUpdatedDay>w.dayIndex||
      (m.lastEventDay!==null&&(!Number.isSafeInteger(m.lastEventDay)||m.lastEventDay<0||m.lastEventDay>w.dayIndex))||
      (m.lastEventKind!==null&&(typeof m.lastEventKind!=='string'||m.lastEventKind.length>30))||
      !Number.isSafeInteger(m.betrayalCount)||m.betrayalCount<0||
      !Number.isInteger(m.perceivedPower)||Math.abs(m.perceivedPower)>100||
      V06A_MEMORY_FIELDS.some(field=>!Number.isFinite(m[field])||m[field]<(field==='trust'||field==='powerBias'?(field==='powerBias'?-30:-100):0)||m[field]>(field==='powerBias'?30:100)))fail('V0.6A 국가별 외교 기억');
  }
  for(const [key,m] of Object.entries(w.diplomacy.memory)){
    const ids=key.split(':').map(Number);
    if(ids.length!==2||!Number.isSafeInteger(ids[0])||!Number.isSafeInteger(ids[1])||ids[0]>=ids[1]||!w.nations[ids[0]]||!w.nations[ids[1]]||
      !Number.isInteger(m.lastAllianceEndedDay)||!Number.isInteger(m.lastAllianceDurationDays)||m.lastAllianceDurationDays<0||
      (m.lastBetrayalDay!==undefined&&(!Number.isInteger(m.lastBetrayalDay)||!w.nations[m.lastBetrayerId]||!w.nations[m.lastVictimId])))fail('E5 관계 이력');
  }
  for(const t of w.diplomacy.alliances){if(!w.nations[t.a]?.active||!w.nations[t.b]?.active||t.a>=t.b||!Number.isInteger(t.endsDay)||!Number.isInteger(t.formedDay))fail('동맹 목록');}
  if(w.nations.some(n=>allianceCount(w,n.id)>ALLIANCE_LIMIT))fail('동맹 수');
  for(const h of w.warHistory){if(!Number.isInteger(h.id)||!Number.isInteger(h.startedDay)||!Number.isInteger(h.endedDay)||h.endedDay<h.startedDay||!Number.isInteger(h.battles)||h.battles<0||!w.nations[h.attackerId]||!w.nations[h.defenderId]||!h.casualties||!h.battleWins||!['WHITE','LIMITED','CLEAR','DECISIVE'].includes(h.tier))fail('전쟁사 기록');}
  for(let a=0;a<w.nations.length;a++)for(let b=a+1;b<w.nations.length;b++){
    const p=w.diplomacy.pairs[`${a}:${b}`];if(!p||!Number.isInteger(p.relation)||p.relation<-100||p.relation>100)fail('국가 관계');
  }
  const nations=new Map();
  for(const n of w.nations){
    if(!Number.isInteger(n.id)||nations.has(n.id)||!['AI','PLAYER'].includes(n.controller)||!w.aiProfiles[n.aiProfileId]||typeof n.active!=='boolean')fail('국가·컨트롤러');
    nations.set(n.id,n);
    if(!e3e2ValidateDemography(n,w.dayIndex))fail('E3E2 인구·식량 장부');
    if(!validCivilization(n.civilization,w.dayIndex))fail('문명 시대 데이터');
    if(!validateKnowledgeExchange(n.knowledgeExchange,w,n))fail('지식 교류 회계');
    if(n.civilization.era==='ancient'&&n.technology?.currentResearch&&!techEraAllowed(n,n.technology.currentResearch))fail('시대별 연구 잠금');
    if(n.civilization.era==='medieval'&&n.technology?.pausedResearch&&!n.technology?.currentResearch)fail('중세 연구 자동 복원 누락');
    if(n.civilization.era==='medieval'&&n.civilization.stage<3&&n.civilization.stage>=1&&
       n.technology.unlocked.includes(MEDIEVAL_STAGE_CORE[n.civilization.stage])&&w.dayIndex%30===0&&
       n.civilization.stageReachedDay!==null&&n.civilization.stageReachedDay<w.dayIndex)fail('중세 단계 진척 누락');
    try{if(validateNationName(n.name)!==n.name)fail('국가명 공백');}catch{fail('국가명');}
    try{validColor(n.color);}catch{fail('국가 색상');}
    if(!Array.isArray(n.military?.mobilizationDiagnostics)||n.military.mobilizationDiagnostics.length>V04E2_DIAG_WINDOW||n.military.mobilizationDiagnostics.some(r=>!Number.isSafeInteger(r.dayIndex)||r.dayIndex<0||r.dayIndex>w.dayIndex||!V04E2_DIAG_REASONS.has(r.reason)||!Number.isSafeInteger(r.target)||!Number.isSafeInteger(r.men)||!Number.isSafeInteger(r.deficit)||!Number.isSafeInteger(r.finalMen)||!r.attempts||!r.success||!r.failed||!r.failReasons||
      (r.h2d1Fiscal&&(!['FISCAL_PRESSURE','FISCAL_DEMOBILIZED','NO_ELIGIBLE_SAFE_ARMY','DEFENSE_FLOOR'].includes(r.h2d1Fiscal.outcome)||
        !Number.isSafeInteger(r.h2d1Fiscal.returnedMen)||r.h2d1Fiscal.returnedMen<0||
        !Number.isSafeInteger(r.h2d1Fiscal.returnedMachines)||r.h2d1Fiscal.returnedMachines<0||
        !Number.isSafeInteger(r.h2d1Fiscal.estimatedSaving)||r.h2d1Fiscal.estimatedSaving<0))))fail('군사 동원 진단');
    if(!Array.isArray(n.military?.barracksAiDiagnostics)||n.military.barracksAiDiagnostics.length>V04E2_DIAG_WINDOW||n.military.barracksAiDiagnostics.some(r=>!Number.isSafeInteger(r.dayIndex)||r.dayIndex<0||r.dayIndex>w.dayIndex||['generated','legal','affordable','unaffordable'].some(k=>!Number.isInteger(r[k])||r[k]<0)||typeof r.chosen!=='boolean'))fail('병영 AI 투자 진단');
    if(!n.military||!n.military.barracksFinance||['specialistTrainingSpent','specialistTrainingSpentThisQuarter','specialistTrainingSpentLastQuarter'].some(k=>!Number.isSafeInteger(n.military[k])||n.military[k]<0)||['billedLastQuarter','paidLastQuarter','unpaidLastQuarter','totalPaid','totalUnpaid'].some(k=>!Number.isSafeInteger(n.military.barracksFinance[k])||n.military.barracksFinance[k]<0)||n.military.barracksFinance.billedLastQuarter!==n.military.barracksFinance.paidLastQuarter+n.military.barracksFinance.unpaidLastQuarter||!Number.isSafeInteger(n.military.reserveReady)||n.military.reserveReady<0||!Array.isArray(n.military.training)||n.military.training.some(t=>!Number.isInteger(t.amount)||t.amount<12||!Number.isInteger(t.completeDay)||t.completeDay<0)||!Number.isInteger(n.military.lastTrainingDay)||!Number.isInteger(n.military.unpaidQuarters)||n.military.unpaidQuarters<0||!Number.isInteger(n.military.desertedLastQuarter)||n.military.desertedLastQuarter<0||['operationArrears','operationPaidThisQuarter','operationBilledThisQuarter','operationPaidLastQuarter','operationBilledLastQuarter','totalOperationPaid'].some(key=>!Number.isSafeInteger(n.military[key])||n.military[key]<0))fail('군사 동원 상태');
    if(!n.apLedger||!Array.isArray(n.apLedger.history)||n.apLedger.history.length>V04E3_AP_WINDOW||n.apLedger.history.some(r=>
      !Number.isSafeInteger(r.dayIndex)||r.dayIndex<0||r.dayIndex>w.dayIndex||
      ['opening','cap','offered','received','wasted','blockedAP','main','auxiliary','mainDeferred','mainMissed','reserved'].some(k=>!Number.isSafeInteger(r[k])||r[k]<0)||
      !r.spent||['civil','military','research'].some(k=>!Number.isSafeInteger(r.spent[k])||r.spent[k]<0)||r.received+r.wasted!==r.offered))fail('AP 회계 진단');
    if(!n.civilFinance||['billedLastQuarter','paidLastQuarter','unpaidLastQuarter','totalPaid','totalUnpaid'].some(k=>!Number.isSafeInteger(n.civilFinance[k])||n.civilFinance[k]<0))fail('민간 운영비 회계');
    if(!Number.isSafeInteger(n.apUnits)||n.apUnits<0||!Number.isSafeInteger(n.apMaxUnits)||n.apMaxUnits<0||n.apUnits>n.apMaxUnits||!Number.isSafeInteger(n.gold)||n.gold<0||!Number.isSafeInteger(n.knowledge)||n.knowledge<0||!Number.isFinite(n.researchLevel)||n.researchLevel<0||n.researchLevel>100||!validateTechnologyState(n.technology)||!n.resources||['food','wood','stone','iron','coal','machine_parts','steel','artillery_shells'].some(k=>!Number.isSafeInteger(n.resources[k])||n.resources[k]<0)||!Number.isFinite(n.foodPressure)||n.foodPressure<0||n.foodPressure>1||!Array.isArray(n.settlementIds)||!n.truces||typeof n.truces!=='object')fail('국가 상태');
  }
  for(const n of w.nations){const candidate=v04eBarracksCandidates(w,n.id);
    if(candidate.length>3||new Set(candidate.map(b=>b.settlementId)).size!==candidate.length)fail('병영 운영 한도');}
  if(w.nations.some(n=>n.roadDiscountCarry&&Object.entries(n.roadDiscountCarry).some(([k,v])=>!['wood','stone'].includes(k)||!Number.isFinite(v)||v<0||v>=1)))fail('도로 할인 누적');
  if(new Set(w.nations.map(n=>n.name)).size!==w.nations.length)fail('국가명 중복');
  const sMap=new Map(),member=new Set();
  if(!Array.isArray(w.settlements)||w.settlements.length>w.tiles.length)fail('정착지 수');
  for(const s of w.settlements){
    if(!Number.isInteger(s.id)||sMap.has(s.id)||!nations.get(s.ownerId)?.active||!Array.isArray(s.tileIds)||s.tileIds.length<1||s.tileIds.length>19||!s.tileIds.includes(s.coreTileId)||new Set(s.tileIds).size!==s.tileIds.length)fail('정착지');
    if(!Number.isInteger(s.population)||s.population<0||!Number.isFinite(s.development)||s.development<0||s.development>100||
      !Number.isSafeInteger(s.inheritedHousing||0)||(s.inheritedHousing||0)<0||
      ['f2c1BirthCarry','f2c1OrdinaryDeathCarry','f2c1HungerDeathCarry'].some(k=>s[k]!==undefined&&(!Number.isFinite(s[k])||s[k]<0||s[k]>=1)))fail('인구·발전');
    if(typeof s.name!=='string'||!s.name.trim()||!nations.has(s.founderNationId)||!Array.isArray(s.formerCapitalOf)||
      new Set(s.formerCapitalOf).size!==s.formerCapitalOf.length||s.formerCapitalOf.some(id=>!nations.has(id)))fail('정착지 연혁');
    sMap.set(s.id,s);
    for(const id of s.tileIds){if(member.has(id)||w.tiles[id]?.ownerId!==s.ownerId||w.tiles[id]?.settlementId!==s.id)fail('정착지 타일 소유');member.add(id);}
  }
  for(let i=0;i<w.tiles.length;i++){
    const t=w.tiles[i];if(!t||t.id!==i||t.x!==i%w.size||t.y!==Math.floor(i/w.size)||!TERRAINS[t.terrain]||![0,1,2].includes(t.roadLevel)||t.terrain==='water'&&t.roadLevel>0)fail('타일 좌표·지형·도로');
    if(t.ownerId!==null&&!nations.has(t.ownerId)||t.ownerId!==null&&!nations.get(t.ownerId).active||t.terrain==='water'&&t.ownerId!==null)fail('타일 국가');
    if(t.settlementId!==null&&!member.has(i))fail('정착지 멤버십');
    if(t.occupiedBy!==null&&(!nations.get(t.occupiedBy)?.active||t.ownerId===t.occupiedBy||!warAgainst(w,t.occupiedBy,t.ownerId)))fail('점령권');
  }
  // V0.7D: total building-list safety bound must match V0.7C3 physical 6-slot tile ceiling.
  if(!Array.isArray(w.buildings)||!Array.isArray(w.defenses)||!Number.isSafeInteger(w.nextBuildingId)||w.nextBuildingId<0||w.buildings.length>w.tiles.length*6+w.settlements.length||w.defenses.length>w.tiles.length*DEFENSE_TILE_SLOTS)fail('시설 목록');
  const buildingIds=new Set(),occupiedSlots=new Map(),industrialSlots=new Set();
  for(const b of allStructures(w)){
    const tile=w.tiles[b.tileId],s=sMap.get(b.settlementId),def=BUILDINGS[b.typeId];
    const isDefense=b.typeId==='fort',inDefense=w.defenses.includes(b);
    if(isDefense!==inDefense)fail('일반 시설·방어시설 분류');
    if(!Number.isInteger(b.id)||b.id<0||buildingIds.has(b.id)||!def||!tile||!(isDefense&&b.settlementId===null&&tile.settlementId===null||!isDefense&&b.disconnected===true&&b.settlementId===null&&tile.settlementId===null||s&&s.tileIds.includes(tile.id)&&tile.ownerId===s.ownerId)||
      !def.terrains.includes(tile.terrain)||!Number.isInteger(b.level)||b.level<1||b.level>maxBuildingLevel(b.typeId)||
      !['ACTIVE','CONSTRUCTING','UPGRADING','REDEVELOPING'].includes(b.status)||!Number.isInteger(b.completeDay)||b.completeDay<0||
      (b.status==='UPGRADING'&&b.targetLevel!==b.level+1)||
      (b.status==='CONSTRUCTING'&&b.level!==1)||
      (b.status==='REDEVELOPING'&&(!BUILDINGS[b.redevelopTo]||b.redevelopTo==='fort'||!BUILDINGS[b.redevelopTo].terrains.includes(tile.terrain)||b.redevelopTo===b.typeId)))fail('건물 상태');
    if(b.pausedRemainingDays!==undefined&&(!Number.isInteger(b.pausedRemainingDays)||b.pausedRemainingDays<1))fail('시설 공사 중단');
    if(isDefense){
      if(!Number.isInteger(b.hp)||b.hp<0||b.hp>fortMaxHP(b)||
        (b.hp===0&&(!Number.isInteger(b.zeroHpSince)||b.zeroHpSince<0||b.zeroHpSince>w.dayIndex))||
        (b.hp>0&&b.zeroHpSince!==null)||
        (b.repair&&(!Number.isInteger(b.repair.ownerId)||!Number.isInteger(b.repair.completeDay)||!Number.isInteger(b.repair.restoreHp)||b.repair.restoreHp<=0)))fail('요새 HP·수리');
    }else if(b.disconnected!==undefined&&typeof b.disconnected!=='boolean')fail('시설 연결 상태');
    if(b.typeId==='barracks'&&b.barracksPaidQuarter!==undefined&&(!Number.isSafeInteger(b.barracksPaidQuarter)||b.barracksPaidQuarter<-1||b.barracksPaidQuarter>w.dayIndex))fail('병영 지급시점');
    if(['workshop','factory'].includes(b.typeId)&&!f1ValidWorkshopPower(w,b))fail('F1/F2 시설 동력 설비');
    if(b.typeId==='workshop'&&((b.workshopMode!==undefined&&!['standard','precision'].includes(b.workshopMode))||
        (b.lastOperatedDay!==undefined&&b.lastOperatedDay!==null&&(!Number.isSafeInteger(b.lastOperatedDay)||b.lastOperatedDay<0||b.lastOperatedDay>w.dayIndex||b.lastOperatedDay%30!==0))))fail('E1 공방 가동 상태');
    buildingIds.add(b.id);const key=(isDefense?'D:':'B:')+tile.id;
    if(b.industrialSlot){
      if(isDefense||!F2B_INDUSTRIAL_TYPES.includes(b.typeId))fail('F2B 산업 전용 부지');
      if(b.settlementId!==null){if(industrialSlots.has(b.settlementId))fail('F2B 산업 전용 부지');industrialSlots.add(b.settlementId);}
    }else occupiedSlots.set(key,(occupiedSlots.get(key)||0)+1);
    // V0.7C3: mixed-use construction extends the absolute physical ceiling to six.
    // Existing 6-slot sites acquired in war remain valid even if their new owner
    // lacks the technology; new construction still uses the owner's tech gate.
    if(occupiedSlots.get(key)>(isDefense?2:6))fail('시설 슬롯 초과'); // Legacy 0.3A permits two forts; new forts use one defense slot.
  }
  if(buildingIds.size&&Math.max(...buildingIds)>=w.nextBuildingId)fail('시설 ID');
  for(const n of w.nations){
    if(new Set(n.settlementIds).size!==n.settlementIds.length||n.settlementIds.some(id=>sMap.get(id)?.ownerId!==n.id))fail('국가 정착지 목록');
    if(n.active&&(!n.settlementIds.length||!n.settlementIds.some(id=>sMap.get(id).coreTileId===n.capitalId&&sMap.get(id).formerCapitalOf.includes(n.id))))fail('활성 국가 수도');
    if(!n.active&&(n.settlementIds.length||n.capitalId!==null||n.leaderId!==null))fail('멸망 국가');
  }
  if(!Array.isArray(w.characters)||!Array.isArray(w.pastLeaders)||!Array.isArray(w.pastCommanders))fail('인물 목록');
  const charIds=new Set();for(const c of w.characters){
    if(charIds.has(c.id)||!c.alive||!['leader','commander'].includes(c.role)||!nations.get(c.nationId)?.active||!Number.isInteger(c.age)||c.age<0||c.age>130)fail('인물');
    charIds.add(c.id);
  }
  for(const n of w.nations)if(n.active&&!w.characters.some(c=>c.id===n.leaderId&&c.nationId===n.id&&c.role==='leader'))fail('국가 지도자');
  c2Validate(w,fail);
  if(!Array.isArray(w.armies)||!Array.isArray(w.wars)||!Array.isArray(w.engagements)||!Array.isArray(w.occupations)||!Array.isArray(w.battleHistory))fail('군사 목록');
  const armyIds=new Set();const allUnitIds=new Set();
  e2ValidateGuns(w,fail);
  for(const a of w.armies){
    if(armyIds.has(a.id)||!nations.get(a.nationId)?.active||!w.tiles[a.tileId]||(w.tiles[a.tileId].terrain==='water'&&a.status!=='SAILING')||!Array.isArray(a.units)||(!a.units.length&&!hCount(w,a,true))||!['READY','RETREATING','REGROUP','ENGAGED','TRAPPED','SAILING'].includes(a.status)||a.morale<0||a.morale>100)fail('군대');
    armyIds.add(a.id);
    if(a.commanderId!==null&&!w.characters.some(c=>c.id===a.commanderId&&c.role==='commander'&&c.nationId===a.nationId)||a.commanderId===null&&a.units.length>0)fail('사령관');
    const local=new Set();
    for(const u of a.units){if(local.has(u.id)||allUnitIds.has(u.id)||!Number.isInteger(u.manpower)||u.manpower<0||u.manpower>1000000||!UNIT_TYPES[u.typeId]||!WEAPONS[u.weaponId]||!ARMORS[u.armorId])fail('병력 집단');c3ValidateUnit(u,fail);local.add(u.id);allUnitIds.add(u.id);}
    if(!Array.isArray(a.deployment?.back)||a.deployment.back.some(id=>!(['field_artillery','tank_crew'].includes(a.units.find(u=>u.id===id)?.typeId))))fail('E1 후방 배치');
    const placements=[...a.deployment.front,...a.deployment.rear,...a.deployment.back,...a.deployment.reserve];
    if(placements.length!==local.size||new Set(placements).size!==placements.length||placements.some(id=>!local.has(id)))fail('전열 배치');
    if(a.assignedWarId!=null&&!w.wars.some(v=>v.id===a.assignedWarId&&warSide(v,a.nationId)))fail('V0.6C2 편제 전선');
    if(a.rearmPlan&&(!LOADOUTS[a.rearmPlan.unitType]||!rearmArmorLegal(w,a.nationId,a.rearmPlan.armorId)||(a.rearmPlan.position!=null&&!POSITIONS.includes(a.rearmPlan.position))||!Number.isInteger(a.rearmPlan.completeDay)||a.rearmPlan.completeDay<=0||
      (a.rearmPlan.unitId!==undefined&&(!Number.isSafeInteger(a.rearmPlan.amount)||a.rearmPlan.amount<=0||a.rearmPlan.amount>G5_MOVE_CAP||typeof a.rearmPlan.unitId!=='string'))))fail('재무장');
    if(a.hRepairPlan&&(!Number.isSafeInteger(a.hRepairPlan.amount)||a.hRepairPlan.amount<1||a.hRepairPlan.amount>24||!Number.isSafeInteger(a.hRepairPlan.completeDay)||a.hRepairPlan.completeDay<=w.dayIndex))fail('H 수리 예정');
    if(a.hServiceReturn){const p=a.hServiceReturn;if(!Number.isSafeInteger(p.targetTileId)||!w.tiles[p.targetTileId]||!Number.isSafeInteger(p.startedDay)||p.startedDay<0||p.startedDay>w.dayIndex||typeof p.tow!=='boolean'||!TERRAINS[w.tiles[p.targetTileId].terrain]?.passable)fail('H1D 정비 복귀 경로');}
    if(a.g5RearRifleBaseline!==undefined&&(!Number.isSafeInteger(a.g5RearRifleBaseline)||a.g5RearRifleBaseline<0))fail('G5 후열 초기 기준');
    if(a.g5RedeployPlan){const p=a.g5RedeployPlan;
     if(a.rearmPlan||!Number.isSafeInteger(p.amount)||p.amount<1||p.amount>G5_MOVE_CAP||!Number.isSafeInteger(p.completeDay)||p.completeDay<=w.dayIndex||typeof p.unitId!=='string')fail('G5 전열 재배치');
    }
    if(!Number.isInteger(a.unsuppliedDays)||a.unsuppliedDays<0||
      !Number.isInteger(a.supplyCheckedDay)||a.supplyCheckedDay>w.dayIndex||a.supplyCheckedDay<0||
      !Number.isFinite(a.supplyMultiplier)||a.supplyMultiplier<.5||a.supplyMultiplier>1)fail('군대 보급');
    if(a.status==='SAILING'){
      const v=a.seaTransit;
      if(!v||a.engagementId!==null||a.order!==null||w.tiles[a.tileId].terrain!=='water'||!Number.isInteger(v.originId)||!Number.isInteger(v.destinationId)||!Number.isInteger(v.arrivalDay)||v.arrivalDay<=w.dayIndex||v.originId<0||v.destinationId<0||!w.tiles[v.originId]||!w.tiles[v.destinationId]||w.tiles[v.originId].terrain==='water'||w.tiles[v.destinationId].terrain==='water')fail('상륙 항해 상태');
    }
    if(a.repatriation!==undefined&&a.repatriation!==null){
      const r=a.repatriation;
      if(r.active!==true||!Number.isInteger(r.startedDay)||!Number.isInteger(r.destinationNationId)||r.destinationNationId!==a.nationId||
        !Array.isArray(r.permittedNationIds)||new Set(r.permittedNationIds).size!==r.permittedNationIds.length||
        r.permittedNationIds.some(id=>!Number.isInteger(id)||id===a.nationId||!nations.has(id)))fail('귀환 통행권');
    }
    if(a.f3fRout!==undefined&&(!Number.isInteger(a.f3fRout.baseline)||a.f3fRout.baseline<1||
      !Number.isInteger(a.f3fRout.minimumMen)||a.f3fRout.minimumMen<(manpower(a)===0&&hCount(w,a,true)>0?1:F3F_RALLY_MIN_MEN)||a.f3fRout.minimumMen>Math.max(12,a.f3fRout.baseline)||
      !Number.isInteger(a.f3fRout.sinceDay)||a.f3fRout.sinceDay<0||a.f3fRout.sinceDay>w.dayIndex))fail('패전군 재출동 상태');
    if(a.status==='RETREATING'){
      if(a.engagementId!==null||!Array.isArray(a.retreatPath)||a.retreatPath.length>w.tiles.length||!Number.isInteger(a.nextMoveDay)||!Number.isInteger(a.regroupDays))fail('후퇴 상태');
      let previous=a.tileId;
      for(const next of a.retreatPath){
        if(!w.tiles[next]||!TERRAINS[w.tiles[next].terrain].passable||!neighborsMilitary8(previous,w.size,w.height).includes(next)||!militaryStepPermitted(w,previous,next))fail('후퇴 경로');
        previous=next;
      }
    }
  }
  const warIds=new Set(),pairSides=new Map();
  for(const war of w.wars){
    if(war.f3PersistedCoalitionPlan!==undefined&&!f3ValidCoalitionPlan(w,war.f3PersistedCoalitionPlan))fail('F3 전선 캐시');
    if(warIds.has(war.id)||!nations.get(war.attackerId)?.active||!nations.get(war.defenderId)?.active||war.attackerId===war.defenderId||warMembers(war).some(id=>!nations.get(id)?.active)||new Set(warMembers(war)).size!==warMembers(war).length||war.sides&&(war.sides.attackers[0]!==war.attackerId||war.sides.defenders[0]!==war.defenderId||!war.sides.attackers.length||!war.sides.defenders.length))fail('전쟁');
    if(war.occupationContributions&&Object.entries(war.occupationContributions).some(([id,n])=>!warMembers(war).includes(Number(id))||!Number.isInteger(n)||n<0))fail('연합 점령 기여도');
    if(war.occupationWork&&Object.entries(war.occupationWork).some(([id,n])=>!warMembers(war).includes(Number(id))||!Number.isFinite(n)||n<0))fail('점령 참여 기여도');
    if(war.peaceExtension&&(!Number.isInteger(war.peaceExtension.usedDays)||war.peaceExtension.usedDays<0||war.peaceExtension.usedDays>360||
      !Number.isInteger(war.peaceExtension.untilDay)||!Number.isFinite(war.peaceExtension.baselineProgress)||war.peaceExtension.baselineProgress<0))fail('전쟁 연장');
    if(war.goal&&(!['BORDER','SETTLEMENT'].includes(war.goal.type)||war.goal.targetTileId!==null&&!w.tiles[war.goal.targetTileId]))fail('전쟁 목표');
    if(war.fatigue&&[war.attackerId,war.defenderId].some(id=>!Number.isFinite(war.fatigue[id])||war.fatigue[id]<0||war.fatigue[id]>100))fail('전쟁 피로');
    if(war.pendingPeace&&(![war.attackerId,war.defenderId].includes(war.pendingPeace.proposerId)||!war.pendingPeace.terms||!Number.isInteger(war.pendingPeace.offerDay)))fail('평화 제안');
    warIds.add(war.id);
    const members=warMembers(war);
    for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){
      const key=pairKey(members[i],members[j]),side=warSide(war,members[i])===warSide(war,members[j])?'ALLY':'FOE';
      if(pairSides.has(key)&&pairSides.get(key)!==side)fail('V0.6C2 전쟁 간 진영 모순');
      if(pairSides.has(key)&&side==='FOE')fail('V0.6C2 중복 교전');
      pairSides.set(key,side);
    }
  }
  const occupationTiles=new Set();
  for(const o of w.occupations){
    const t=w.tiles[o.tileId],war=w.wars.find(x=>x.id===o.warId);
    if(occupationTiles.has(o.tileId)||!t||!war||!Number.isInteger(o.nationId)||!Number.isInteger(o.defenderId)||
      !warSide(war,o.nationId)||!Number.isFinite(o.progress)||o.progress<0||o.progress>=100||
      t.ownerId!==o.defenderId||o.nationId===o.defenderId&&t.occupiedBy===null||
      t.occupiedBy!==null&&warSide(war,t.occupiedBy)===warSide(war,o.nationId)||!Number.isInteger(o.nextTickDay)||!Number.isInteger(o.lastTickDay)||
      !Number.isInteger(o.siegeClockDay)||o.siegeClockDay<o.startedDay||o.siegeClockDay>w.dayIndex||
      !Number.isInteger(o.siegeCreditDays)||o.siegeCreditDays<0||o.siegeCreditDays>=F3F_SIEGE_DAYS||
      typeof o.siegeEligible!=='boolean'||
      !Number.isFinite(o.resistance)||o.resistance<0||!Number.isFinite(o.firepower)||o.firepower<0||!Number.isFinite(o.attackRemainder)||o.attackRemainder<0||o.attackRemainder>=1||!Number.isInteger(o.casualties)||o.casualties<0||
      !w.armies.some(a=>a.tileId===o.tileId&&warSide(war,a.nationId)===warSide(war,o.nationId)&&hCombatPresence(w,a)>0)||
      (o.participation&&Object.entries(o.participation).some(([id,val])=>warSide(war,Number(id))!==warSide(war,o.nationId)||!Number.isFinite(val)||val<0)))fail('점령 진행');
    occupationTiles.add(o.tileId);
  }
  const usedInBattle=new Set();
  for(const e of w.engagements){
    const war=w.wars.find(v=>v.id===e.warId);
    if(!war||!w.tiles[e.tileId]||!Number.isInteger(e.round)||e.round<0||e.round>8||!Number.isInteger(e.nextRoundDay))fail('교전');
    h1EnsureMembers(w,e);
    if(!Number.isInteger(e.attackerOriginTileId)||!w.tiles[e.attackerOriginTileId])fail('교전 출발지');
    if(e.attackers.length===0||e.defenders.length===0)fail('교전 진영 공백');
    if(new Set([...e.allAttackerArmyIds,...e.allDefenderArmyIds]).size!==e.allAttackerArmyIds.length+e.allDefenderArmyIds.length)fail('교전 전체 참가 중복');
    for(const side of ['attackers','defenders'])for(const m of e[side]){
      const a=h1Army(w,m.armyId);
      if(!a||usedInBattle.has(a.id)||a.engagementId!==e.id||a.status!=='ENGAGED'||warSide(war,a.nationId)!==(side==='attackers'?e.attackerWarSide:e.defenderWarSide)||
        a.tileId!==(side==='attackers'?e.attackerOriginTileId:e.tileId)||
        !Number.isInteger(m.initialFront)||m.initialFront<0||!Number.isInteger(m.initialManpower)||m.initialManpower<0||
        (m.v08hFrontVersion!==undefined&&(m.v08hFrontVersion!==1||!Number.isInteger(m.v08hInitialTankSupport)||m.v08hInitialTankSupport<0||m.v08hInitialTankSupport>50))||
        !e[side==='attackers'?'allAttackerArmyIds':'allDefenderArmyIds'].includes(a.id))fail('교전 참가자');
      usedInBattle.add(a.id);
    }
    if(!e.isMulti&&e.attackers.length+e.defenders.length===2&&
      (e.attackers[0].armyId!==e.attackerArmyId||e.defenders[0].armyId!==e.defenderArmyId))fail('단독 교전 대표 ID');
  }
  for(const a of w.armies)if((a.status==='ENGAGED'||a.engagementId!==null)&&!usedInBattle.has(a.id))fail('고아 교전 편제');
  if(!Array.isArray(w.events)||w.events.length>180||!Number.isInteger(w.nextArmyId)||!Number.isInteger(w.nextEngagementId)||!Number.isInteger(w.nextWarId))fail('기록·ID');
  d1ValidateCultureWorld(w,fail);
  d1bValidate(w,fail);
  d1cValidate(w,fail);
  d1dValidate(w,fail);
  d2aValidate(w,fail);
  d2bValidate(w,fail);
  d2cValidate(w,fail);
  e1Validate(w,fail);
  e2aValidate(w,fail);
  e2bValidate(w,fail);
  e3Validate(w,fail);
  e3aValidate(w,fail);
  if(!i2Valid(w))fail('I2 동력망 회계 및 시설');
 if(!i3aValid(w))fail('I3A 중앙 동력소 및 회계');
  e4Validate(w,fail);
  v06e5Validate(w,fail);
  v06e6Validate(w,fail);
  v06e7aValidate(w,fail);
  return true;
}
function validateTradeLegacyForMigration(w){
  const t=w.trade;
  return Boolean(t&&Number.isSafeInteger(t.nextId)&&t.nextId>=0&&Number.isInteger(t.quarterDay)&&t.quarterDay>=0&&t.quarterDay<=w.dayIndex&&Array.isArray(t.history)&&t.history.length<=MAX_EVENTS&&t.used&&typeof t.used==='object'&&
    t.history.every(h=>Number.isInteger(h.seller)&&Number.isInteger(h.buyer)&&h.seller!==h.buyer&&w.nations[h.seller]&&w.nations[h.buyer]&&TRADE_GOODS[h.good]&&Number.isSafeInteger(h.quantity)&&h.quantity>0&&Number.isSafeInteger(h.unitPrice)&&h.unitPrice>0&&h.gold===h.quantity*h.unitPrice));
}
/** D1B1 uses a new social schema; older saves are intentionally not migrated. */
function deserializeWorld(json){
 const parsed=JSON.parse(json);
 if(parsed?.historicalChronicle?.format===CHRONICLE_COMPACT_FORMAT)parsed.historicalChronicle=i1aUnpackChronicle(parsed.historicalChronicle);
 const f1NativeSave=[VERSION,'V0.8G','V0.8F','V0.8E','V0.8D','V0.8C','V0.8B','V0.7L','V0.7K','V0.7J','V0.7I3A2','V0.7I3A1','V0.7I3A','V0.7I2A','V0.7I2','V0.7I1A','V0.7I1','V0.7I0','V0.7I','V0.7H2L','V0.7H2K','V0.7H2J','V0.7H2I1','V0.7H2I','V0.7H2H','V0.7H2G','V0.7H2F','V0.7H2E','V0.7H2D1','V0.7H2D','V0.7H2C','V0.7H2B1','V0.7H2B','V0.7H2A','V0.7H1E1','V0.7H1E','V0.7H1D','V0.7H1C','V0.7H1B1','V0.7H1B','V0.7H1A','V0.7H1','V0.7H','V0.7G5','V0.7G4','V0.7G3','V0.7G2','V0.7G1','V0.7F2C2C2','V0.7F2C2C1','V0.7F2C2C','V0.7F2C2B','V0.7F2C2A','V0.7F2C2','V0.7F2C1','V0.7F2C','V0.7F2B3','V0.7F2B2','V0.7F2B1','V0.7F2B','V0.7F2A5','V0.7F2A4','V0.7F2A3A','V0.7F2A3','V0.7F2A2','V0.7F2A1','V0.7F2A','V0.7F1','V0.7F1A','V0.7F1B','V0.7F1C1','V0.7F1C2'].includes(parsed?.version);
 const e3e2NativeSave=[VERSION,'V0.8G','V0.8F','V0.8E','V0.8D','V0.8C','V0.8B','V0.7L','V0.7K','V0.7J','V0.7I3A2','V0.7I3A1','V0.7I3A','V0.7I2A','V0.7I2','V0.7I1A','V0.7I1','V0.7I0','V0.7I','V0.7H2L','V0.7H2K','V0.7H2J','V0.7H2I1','V0.7H2I','V0.7H2H','V0.7H2G','V0.7H2F','V0.7H2E','V0.7H2D1','V0.7H2D','V0.7H2C','V0.7H2B1','V0.7H2B','V0.7H2A','V0.7H1E1','V0.7H1E','V0.7H1D','V0.7H1C','V0.7H1B1','V0.7H1B','V0.7H1A','V0.7H1','V0.7H','V0.7G5','V0.7G4','V0.7G3','V0.7G2','V0.7G1','V0.7F2C2C2','V0.7F2C2C1','V0.7F2C2C','V0.7F2C2B','V0.7F2C2A','V0.7F2C2','V0.7F2C1','V0.7F2C','V0.7F2B3','V0.7F2B2','V0.7F2B1','V0.7F2B','V0.7F2A5','V0.7F2A4','V0.7F2A3A','V0.7F2A3','V0.7F2A2','V0.7F2A1','V0.7F2A','V0.7E3E2','V0.7E3E3','V0.7F1','V0.7F1A','V0.7F1B','V0.7F1C1','V0.7F1C2'].includes(parsed?.version);
 const accepted=['V0.8G','V0.8F','V0.8E','V0.8D','V0.8C','V0.8B','V0.7L','V0.7K','V0.7J','V0.7I3A2','V0.7I3A1','V0.7I3A','V0.7I2A','V0.7I2','V0.7I1A','V0.7I1','V0.7I0','V0.7I','V0.7H2L','V0.7H2K','V0.7H2J','V0.7H2I1','V0.7H2I','V0.7H2H','V0.7H2G','V0.7H2F','V0.7H2E','V0.7H2D1','V0.7H2D','V0.7H2C','V0.7H2B1','V0.7H2B','V0.7H2A','V0.7H1E1','V0.7H1E','V0.7H1D','V0.7H1C','V0.7H1B1','V0.7H1B','V0.7H1A','V0.7H1','V0.7H','V0.7G5','V0.7G4','V0.7G3','V0.7G2','V0.7G1','V0.7F2C2C2','V0.7F2C2C1','V0.7F2C2C','V0.7F2C2B','V0.7F2C2A','V0.7F2C2','V0.7F2C1','V0.7F2C','V0.7F2B3','V0.7F2B2','V0.7F2B1','V0.7F2B','V0.7F2A5','V0.7F2A4','V0.7F2A3A','V0.7F2A3','V0.7F2A2','V0.7F2A1','V0.7F2A','V0.7F1C2','V0.7F1C1','V0.7F1B','V0.7F1A','V0.7F1','V0.7E3E3','V0.7E3E2','V0.7E3E1','V0.7E3E','V0.7E3D','V0.7E3C','V0.7E3B','V0.7E3A','V0.7E3','V0.7E2','V0.7E1','V0.7D3','V0.7D2','V0.7D1','V0.7D','V0.7C3','V0.7C2','V0.7C1','V0.7C','V0.7B','V0.7A1B1','V0.7A1B','V0.7A1A','V0.7A1','V0.7A','V0.6F4D3','V0.6F4D2','V0.6F4D1','V0.6F4C','V0.6F4B1','V0.6F4B','V0.6F4A','V0.6F3','V0.6E7C','V0.6E1','V0.6E2','V0.6E2A','V0.6E2B','V0.6E3','V0.6E3H1','V0.6E3A','V0.6E4','V0.6E5','V0.6E6','V0.6E7A','V0.6E7A1','V0.6E7B','V0.6F1','V0.6F2',VERSION];
 if(parsed?.schema!=='vilob-light-v03d'||!accepted.includes(parsed?.version))
   throw Error('지원하지 않는 저장 버전입니다 (V0.7G5~기존 지원 버전 호환).');
 const v08eSourceVersion=parsed.version;
 const v08gSourceVersion=parsed.version;
 if(parsed.version!==VERSION){
   const was=parsed.version;parsed.version=VERSION;
   if(!['V0.8G','V0.8F','V0.8E','V0.8D','V0.8C','V0.8B','V0.7L','V0.7K','V0.7J','V0.7I3A2','V0.7I3A1','V0.7I3A','V0.7I2A','V0.7I2','V0.7I1A','V0.7I1','V0.7I0','V0.7I','V0.7H2L','V0.7H2K','V0.7H2J','V0.7H2I1','V0.7H2I','V0.7H2H','V0.7H2G','V0.7H2F','V0.7H2E','V0.7H2D1','V0.7H2D','V0.7H2C','V0.7H2B1','V0.7H2B','V0.7H2A','V0.7H1E1','V0.7H1E','V0.7H1D','V0.7H1C','V0.7H1B1','V0.7H1B','V0.7H1A','V0.7H1','V0.7H','V0.7G5','V0.7G4','V0.7G3','V0.7G2','V0.7G1','V0.7F2C2C2','V0.7F2C2C1','V0.7F2C2C','V0.7F2C2B','V0.7F2C2A','V0.7F2C2','V0.7F2C1','V0.7F2C','V0.7F2B3','V0.7F2B2','V0.7F2B1','V0.7F2B','V0.7F2A5','V0.7F2A4','V0.7F2A3A','V0.7F2A3','V0.7F2A2','V0.7F2A1','V0.7F2A','V0.7F1C2','V0.7F1C1','V0.7F1B','V0.7F1A','V0.7F1','V0.7E3E3','V0.7E3E2','V0.7E3E1','V0.7E3E','V0.7E3D','V0.7E3C','V0.7E3B','V0.7E3A','V0.7E3','V0.7E2','V0.7E1','V0.7D3','V0.7D2','V0.7D1','V0.7D','V0.7C3','V0.7C2','V0.7C1','V0.7C','V0.7B','V0.7A1','V0.7A1A','V0.7A1B','V0.7A1B1'].includes(was)){ 
   if(was==='V0.7A') {parsed.riverSchemaVersion=RIVER_SCHEMA_VERSION;parsed.riverSegments=[];}
   // F4D3 is the immediate baseline: do not apply historical E-era migrations.
   if(was==='V0.6F4D3')for(const n of parsed.nations)n.civilization=migrateMedievalStage(n.civilization,n.technology);
   if(was!=='V0.7A'&&was!=='V0.6F4D3'&&was!=='V0.6E4'&&was!=='V0.6E5'&&was!=='V0.6E6'&&was!=='V0.6E7A'&&was!=='V0.6E7A1'&&was!=='V0.6E7B'&&was!=='V0.6E7C'&&was!=='V0.6F1'&&was!=='V0.6F2'&&was!=='V0.6F3'&&was!=='V0.6F4A'&&was!=='V0.6F4B'&&was!=='V0.6F4B1'&&was!=='V0.6F4C'&&was!=='V0.6F4D1'&&was!=='V0.6F4D2'){
    if(!['V0.6E2A','V0.6E2B','V0.6E3','V0.6E3H1'].includes(was))e2aMigrateWorld(parsed);
    parsed.diplomacy.reunification??=e2bNewState();
    if(!['V0.6E3','V0.6E3H1','V0.6E3A'].includes(was))e3MigrateWorld(parsed);
    if(was!=='V0.6E3A')e3aMigrateWorld(parsed);
    e4MigrateWorld(parsed);
   }
   if(was!=='V0.7A'&&was!=='V0.6F4D3'&&was!=='V0.6E5'&&was!=='V0.6E6'&&was!=='V0.6E7A'&&was!=='V0.6E7A1'&&was!=='V0.6E7B'&&was!=='V0.6E7C'&&was!=='V0.6F1'&&was!=='V0.6F2'&&was!=='V0.6F3'&&was!=='V0.6F4A'&&was!=='V0.6F4B'&&was!=='V0.6F4B1'&&was!=='V0.6F4C'&&was!=='V0.6F4D1'&&was!=='V0.6F4D2')v06e5MigrateWorld(parsed);
   if(was!=='V0.7A'&&was!=='V0.6F4D3')for(const n of parsed.nations)n.civilization=migrateMedievalStage(n.civilization,n.technology);
   } // V0.7A1/A1A/A1B require only a version update; do NOT re-run old E-era migrations.
 }
 parsed.riverSchemaVersion??=RIVER_SCHEMA_VERSION;
 parsed.riverSegments??=[];
 v06e6MigrateWorld(parsed);
 e7bMigrateWorld(parsed);
 if(!parsed.v06e7aDiagnostics)v06e7aInit(parsed);
 else if(parsed.v06e7aDiagnostics.mode==='OFF')for(const n of parsed.nations){
  const s=parsed.v06e7aDiagnostics.nations[n.id]??(parsed.v06e7aDiagnostics.nations[n.id]=v06e7aNation());
  v06e7aSyncBaseline(parsed,n,s);s.pendingForecast=null;s.grievanceStreaks={};s.lastGrievanceDay=null;
 }
 // E1 save adapter: no inferred historic production, no troop transfers.
 for(const b of parsed.buildings||[])if(b.typeId==='workshop'){b.workshopMode??='standard';b.lastOperatedDay??=null;}
 for(const a of parsed.armies||[])a.deployment.back??=[];
 parsed.e2Artillery??={produced:0,destroyed:0,stocks:{}};
 v08fEnsure(parsed);for(const a of parsed.armies||[])a.v08fTankIds??=[];
 v08gRepairLegacyCrew(parsed,v08gSourceVersion);
 // E3E: start price history at import, never invent past market transactions.
 parsed.market??=e3eInitialMarket();
 e3eMigrateMarket(parsed);
 if(!e3e2NativeSave)e3e2MigrateWorld(parsed); // Older saves get an empty clock; native saves must pass strict validation.
 e3e3MigrateWorld(parsed); // Forward-only recorded quarters; never infer historical supply.
 f1MigrateWorld(parsed,f1NativeSave);
 f2MigrateWorld(parsed);
 f2bMigrateWorld(parsed);
 v08eRepairAudited79530Claim(parsed,v08eSourceVersion);
 f2cMigrateWorld(parsed);
 e3cMigrateFormationRecords(parsed);
 // H1: tolerate stale saved commander histories, retaining the strict daily limit.
  d1cPruneCommanderHistory(parsed);
 h2fMigrateWorld(parsed); // H2E/H2A fixed slot-IDs -> actual modular rev.2 (idempotent).
 hInit(parsed);
 hMigratePositions(parsed); // old saves retain all machines; only assign an initial tactical lane.
 h2jMigrateWorld(parsed); // one-time naming/source migration; NEVER change physical designs.
 for(const n of parsed.nations){kEnsure(n);iEnsure(n);} // historic I planning records preserved
 i1lRepairZeroOrphans(parsed); // V0.7L: prune only provably empty, unreferenced orphan rows
 i1Migrate(parsed); // one-time bounded location allocation, no fabricated shipments
 i2Ensure(parsed); // I2 starts with no retroactively fabricated network
 i3aEnsure(parsed); // I3A starts with no fabricated historical production
 // An older J save may contain one authentic Lv.4 quarter; never infer it from Lv.3 factoryRuns.
 for(const b of parsed.buildings||[])if(b.typeId==='factory'&&b.level===4&&b.kLevel4OperatedDay==null&&b.f2jLastQuarter?.operated===true){
  b.kLevel4OperatedDay=b.f2jLastQuarter.dayIndex;
 }
 validateWorld(parsed);return parsed;
}
function serializeWorld(world){
 i2Ensure(world);i3aEnsure(world);
 for(const n of world.nations){i1Reconcile(world,n);i1aSyncPreviousQuarter(i1Ensure(n,world));}
 validateWorld(world);
 return JSON.stringify(world,(key,val)=>key==='historicalChronicle'&&val===world.historicalChronicle?i1aPackChronicle(val):val,2);
}


// --- src/core/map-import.js ---
// V0.3D3 custom-map scenario input. Map blueprints intentionally exclude ongoing simulation state.
const CUSTOM_MAP_SCHEMA='vilob-light-custom-map-v1';
const CUSTOM_MAP_SCHEMA_V2='vilob-light-custom-map-v2';
function parseCustomMap(input){
  const map=typeof input==='string'?JSON.parse(input):input;
  const error=msg=>{throw Error('커스텀 맵 검증 실패: '+msg);};
  if(!map||Array.isArray(map)||!((map.schema===CUSTOM_MAP_SCHEMA&&map.version===1)||(map.schema===CUSTOM_MAP_SCHEMA_V2&&map.version===2)))error('지원하지 않는 맵 형식');
  const width=map.width,height=map.height;
  if(!((width===19&&height===19)||(width===39&&height===21)||(width===50&&height===50)||(width===100&&height===100)||(width===80&&height===120)))error('지도 크기는 19×19, 39×21, 50×50, 100×100 또는 80×120만 지원');
  const count=map.nations?.length;
  if(!Number.isInteger(count)||!(width===19?count===7:(width===39||width===50)?count===12:width===80?count===12:[12,16].includes(count)))error('국가 수');
  if(!Array.isArray(map.tiles)||map.tiles.length!==width*height)error('타일 수');
  if(!Array.isArray(map.nations)||map.nations.length!==count)error('국가 수');
  if(typeof map.seed!=='string'||!map.seed.trim()||map.seed.length>100)error('시드');
  const knownProfiles=buildProfileLibrary(true);
  const names=new Set(),capitals=new Set(),nations=[];
  for(let i=0;i<count;i++){
    const n=map.nations[i];
    if(!n||n.id!==i)error('국가 ID/순서');
    let name,color;
    try{name=validateNationName(n.name);color=validColor(n.color);}catch{error(`${i+1}번 국가명 또는 색상`);}
    if(name!==n.name||names.has(name))error('국가 이름 중복 또는 공백');
    names.add(name);
    if(typeof n.profileId!=='string'||!knownProfiles[n.profileId]&&!(map.profiles&&map.profiles[n.profileId]))error('AI 프로필');
    if(!Number.isInteger(n.capitalTileId)||n.capitalTileId<0||n.capitalTileId>=map.tiles.length||capitals.has(n.capitalTileId))error('수도 위치/중복');
    capitals.add(n.capitalTileId);
    nations.push({id:i,name,color,profileId:n.profileId,capitalTileId:n.capitalTileId});
  }
  const tiles=map.tiles.map((t,i)=>{
    if(!t||!Object.hasOwn(TERRAINS,t.terrain))error(`${i}번 타일 지형`);
    if(!(t.ownerId===null||Number.isInteger(t.ownerId)&&t.ownerId>=0&&t.ownerId<count))error(`${i}번 타일 국가`);
    if(!Number.isInteger(t.roadLevel)||t.roadLevel<0||t.roadLevel>2)error(`${i}번 타일 도로`);
    if(t.terrain==='water'&&(t.ownerId!==null||t.roadLevel!==0))error(`${i}번 물 타일의 영토/도로`);
    return {terrain:t.terrain,ownerId:t.ownerId,roadLevel:t.roadLevel};
  });
  for(const n of nations)if(tiles[n.capitalTileId].terrain==='water'||tiles[n.capitalTileId].ownerId!==n.id)error(`${n.name} 수도 소유권`);
  const segments=map.version===2?map.riverSegments:[];
  try{riverValidate(tiles,width,height,segments);}catch(e){error(e.message);}
  const result={schema:map.schema,version:map.version,riverSegments:structuredClone(segments||[]),name:typeof map.name==='string'?map.name.slice(0,80):'사용자 제작 지도',seed:map.seed,width,height,tiles,nations};
  if(map.profiles){
    if(typeof map.profiles!=='object'||Array.isArray(map.profiles)||Object.keys(map.profiles).length>24)error('커스텀 AI 프로필');
    result.profiles={};
    for(const [id,p] of Object.entries(map.profiles)){
      try{validateProfile(p);}catch{error(`커스텀 AI 프로필 ${id}`);}
      if(id!==p.id||Object.hasOwn(knownProfiles,id))error('커스텀 AI 프로필 ID');
      result.profiles[id]=structuredClone(p);
    }
  }
  return result;
}
function createWorldFromMap(input){
  const map=parseCustomMap(input),width=map.width,height=map.height;
  // Reuse the native country/economy/diplomacy/leader constructors, not a second simulation engine.
  const setup={profiles:map.profiles||{},nations:{},nationCount:map.nations.length};
  for(const n of map.nations)setup.nations[n.id]={name:n.name,color:n.color,profileId:n.profileId};
  const w=createWorld(map.seed,width,height,setup);
  // Custom nation identity and AI identity can use a different order from built-in presets.
  for(const n of w.nations){
    n.personality=w.aiProfiles[n.aiProfileId]?.name||n.personality;
    n.description=`${n.personality} · 사용자 제작 맵 국가`;
  }
  for(let id=0;id<map.tiles.length;id++){
    const src=map.tiles[id],dest=w.tiles[id];
    dest.terrain=src.terrain;dest.ownerId=src.ownerId;dest.settlementId=null;dest.occupiedBy=null;dest.roadLevel=src.roadLevel;
  }
  const settlements=[],maxTiles=13;
  // Partition owned land into connected, <=13-tile settlements; capital settlements retain nation IDs.
  for(const n of w.nations){
    const cap=map.nations[n.id].capitalTileId;
    n.capitalId=cap;n.settlementIds=[];
    const remaining=new Set(w.tiles.filter(t=>t.ownerId===n.id).map(t=>t.id));
    let first=true;
    while(remaining.size){
      const core=first?cap:remaining.values().next().value;
      const ids=[core];remaining.delete(core);
      for(let q=0;q<ids.length&&ids.length<maxTiles;q++){
        for(const neighbor of neighbors4(ids[q],width,height)){
          if(remaining.has(neighbor)&&ids.length<maxTiles){remaining.delete(neighbor);ids.push(neighbor);}
        }
      }
      const sid=first?n.id:w.nations.length+settlements.filter(s=>s.id>=w.nations.length).length;
      const settlement={id:sid,ownerId:n.id,coreTileId:core,name:first?`${n.name} 수도`:`${n.name} 제${n.settlementIds.length+1} 정착지`,
        founderNationId:n.id,formerCapitalOf:first?[n.id]:[],tileIds:ids,population:first?17:8,development:first?12:6,level:1};
      settlement.culturePopulation=d1CulturePool(n.primaryCultureId,settlement.population);
      for(const id of ids)w.tiles[id].settlementId=sid;
      settlements.push(settlement);n.settlementIds.push(sid);first=false;
    }
  }
  w.riverSegments=structuredClone(map.riverSegments||[]);w.riverSchemaVersion=RIVER_SCHEMA_VERSION;
  w.settlements=settlements;for(const s of settlements){d1bNewSettlement(w,s);d2aInitSettlement(w,s);}w.nextSettlementId=Math.max(...settlements.map(s=>s.id))+1;
  w.setupLocked=true; // Keep the authored terrain and capital ownership safe from procedural reconfiguration.
  w.events=[{dayIndex:0,text:`커스텀 맵 「${map.name}」에서 ${w.nations.length}개 국가가 시작했습니다.`,kind:'world'}];
  validateWorld(w);
  return w;
}
// --- src/core/rivers.js ---
// V0.7A1A River Geography Polish. Grid-boundary hydrology; never touches world.rngState.
const RIVER_SCHEMA_VERSION=1;
function riverVertex(id,width){return {x:id%(width+1),y:Math.floor(id/(width+1))};}
function riverVertexId(x,y,width){return y*(width+1)+x;}
function riverCoastalVertex(tiles,width,height,id){
  const {x,y}=riverVertex(id,width);let land=0,water=0;
  for(let dy=-1;dy<=0;dy++)for(let dx=-1;dx<=0;dx++){
    const xx=x+dx,yy=y+dy;
    if(xx<0||yy<0||xx>=width||yy>=height){water++;continue;}
    if(tiles[yy*width+xx].terrain==='water')water++;else land++;
  }
  return land>0&&water>0;
}
// A strict sea mouth requires actual water within the map, not the map edge.
// Keep riverCoastalVertex() permissive for historical V0.7A1/A1A saves.
function riverSeaMouthVertex(tiles,width,height,id){
  const {x,y}=riverVertex(id,width);let land=false,sea=false;
  for(let dy=-1;dy<=0;dy++)for(let dx=-1;dx<=0;dx++){
    const xx=x+dx,yy=y+dy;
    if(xx<0||yy<0||xx>=width||yy>=height)continue;
    if(tiles[yy*width+xx].terrain==='water')sea=true;else land=true;
  }
  return land&&sea;
}
// Internal grid edges must be adjacent to TWO land tiles; the land itself is preserved.
function riverEdgeLegal(tiles,width,height,from,to){
  const n=(width+1)*(height+1);
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<0||from>=n||to>=n||from===to)return false;
  const a=riverVertex(from,width),b=riverVertex(to,width),dx=b.x-a.x,dy=b.y-a.y;
  if(Math.abs(dx)+Math.abs(dy)!==1)return false;
  if(dx){const x=Math.min(a.x,b.x),y=a.y;return y>0&&y<height&&tiles[(y-1)*width+x].terrain!=='water'&&tiles[y*width+x].terrain!=='water';}
  const x=a.x,y=Math.min(a.y,b.y);
  return x>0&&x<width&&tiles[y*width+x-1].terrain!=='water'&&tiles[y*width+x].terrain!=='water';
}
function riverValidate(tiles,width,height,segments,max=2*width*height){
  const fail=s=>{throw Error('하천 데이터 검증 실패: '+s);};
  if(!Array.isArray(segments)||segments.length>max)fail('선분 수');
  const next=new Map(),prev=new Map(),undirected=new Set(),n=(width+1)*(height+1);
  for(const [i,s] of segments.entries()){
    if(!s||!Number.isSafeInteger(s.from)||!Number.isSafeInteger(s.to)||!Number.isInteger(s.flow)||s.flow<1||s.flow>3)fail(i+'번 선분 형식/유량');
    if(!riverEdgeLegal(tiles,width,height,s.from,s.to))fail(i+'번 선분은 양쪽이 육지인 타일 경계여야 합니다');
    const key=[Math.min(s.from,s.to),Math.max(s.from,s.to)].join(':');
    if(undirected.has(key))fail('중복 선분');undirected.add(key);
    if(next.has(s.from))fail('하천 내부 분기');next.set(s.from,s);
    if(!prev.has(s.to))prev.set(s.to,[]);prev.get(s.to).push(s);
  }
  for(const s of segments){
    const out=next.get(s.to);
    if(out&&out.flow<s.flow)fail('합류 후 유량이 감소합니다');
    // All headwaters must terminate at a river mouth, without a cycle.
    let at=s.to;const visited=new Set([s.from]);
    while(next.has(at)){if(visited.has(at))fail('유향 순환');visited.add(at);at=next.get(at).to;if(visited.size>n)fail('경로 과다');}
    if(!riverCoastalVertex(tiles,width,height,at))fail('하천 하구가 바다 또는 지도 외곽과 접하지 않습니다');
  }
  return true;
}
function riverAdjacentTileInfo(world,id){
 const width=world.size,height=world.height,river=world.riverSegments||[];
 const x=id%width,y=Math.floor(id/width);let count=0,maxFlow=0;
 for(const seg of river){
   const a=riverVertex(seg.from,width),b=riverVertex(seg.to,width);
   const touches=(a.x===x&&b.x===x&&Math.min(a.y,b.y)===y)||
     (a.x===x+1&&b.x===x+1&&Math.min(a.y,b.y)===y)||
     (a.y===y&&b.y===y&&Math.min(a.x,b.x)===x)||
     (a.y===y+1&&b.y===y+1&&Math.min(a.x,b.x)===x);
   if(touches){count++;maxFlow=Math.max(maxFlow,seg.flow);}
 }
 return {count,maxFlow,riverbank:count>0};
}
// V0.7A1B: independently seeded catchment routing; every new mouth touches actual sea.
// Natural-shape constraints are evaluated on the RIVER NETWORK, never painted as a false curve.
function generateRiverSegments(seedText,width,height,tiles){
  if(!Array.isArray(tiles)||tiles.length!==width*height)throw Error('하천 생성 대상 지형이 잘못되었습니다');
  const seed=hashSeed(String(seedText))^0x71d5b39a,terrainSeed=hashSeed(String(seedText));
  const row=width+1,n=row*(height+1),adj=Array.from({length:n},()=>[]),elev=new Float64Array(n);
  const sea=[];
  const noise=(x,y,scale,salt)=>smoothNoise(seed,x,y,scale,salt);
  const mountainNear=new Uint8Array(n),rockNear=new Uint8Array(n);
  for(let id=0;id<n;id++){
    const {x,y}=riverVertex(id,width);let value=0,weight=0,mountains=0,rocks=0;
    for(let dy=-1;dy<=0;dy++)for(let dx=-1;dx<=0;dx++){
      const xx=x+dx,yy=y+dy;
      if(xx<0||yy<0||xx>=width||yy>=height)continue;
      const t=tiles[yy*width+xx];
      if(t.terrain==='water')continue;
      value+=elevation(terrainSeed,xx,yy,width,height);weight++;
      mountains+=t.terrain==='mountain';rocks+=t.terrain==='rock';
    }
    elev[id]=weight?value/weight:0;mountainNear[id]=mountains;rockNear[id]=rocks;
    if(riverSeaMouthVertex(tiles,width,height,id))sea.push(id);
    if(x<width){let j=id+1;if(riverEdgeLegal(tiles,width,height,id,j)){adj[id].push(j);adj[j].push(id);}}
    if(y<height){let j=id+row;if(riverEdgeLegal(tiles,width,height,id,j)){adj[id].push(j);adj[j].push(id);}}
  }
  if(!sea.length)return [];
  // Distance to true coastline, using *legal inland paths*. No simulated RNG consumed.
  const seaDistance=new Int32Array(n).fill(-1),q=[];
  for(const id of sea){seaDistance[id]=0;q.push(id);}
  for(let qi=0;qi<q.length;qi++)for(const to of adj[q[qi]])if(seaDistance[to]<0){seaDistance[to]=seaDistance[q[qi]]+1;q.push(to);}
  // Score upland headwaters using elevation, nearby rocky/mountain terrain and depth inland.
  const sourceCandidates=[];
  const minDepth=Math.max(3,Math.round(Math.min(width,height)*.19));
  for(let id=0;id<n;id++){
    if(!adj[id].length||seaDistance[id]<minDepth)continue;
    const {x,y}=riverVertex(id,width);
    if(x<1||y<1||x>=width||y>=height)continue;
    const relief=mountainNear[id]*.14+rockNear[id]*.038;
    const score=relief+elev[id]*1.0+Math.min(14,seaDistance[id])*.014+noise(x,y,5,199)*.14;
    sourceCandidates.push({id,x,y,score});
  }
  sourceCandidates.sort((a,b)=>b.score-a.score||a.id-b.id);
  const mainTarget=Math.min(8,Math.max(1,Math.round(width*height/230)));
  const minSpread=Math.max(4,Math.min(11,Math.round(Math.sqrt(width*height/mainTarget)*.43)));
  const mains=[];
  for(const item of sourceCandidates){
    if(mains.some(other=>Math.hypot(other.x-item.x,other.y-item.y)<minSpread))continue;
    mains.push(item);if(mains.length>=mainTarget)break;
  }
  if(!mains.length)return [];
  // Weighted Dijkstra with heading state. High slopes and rocky barriers matter,
  // but coherent valley noise lets a channel traverse non-straight lowlands.
  const heading=(a,b)=>b===a+1?0:b===a-1?1:b===a+row?2:3;
  const heapPush=(heap,d,id)=>{let i=heap.length;heap.push([d,id]);while(i){const j=(i-1)>>1;if(heap[j][0]<d||heap[j][0]===d&&heap[j][1]<=id)break;heap[i]=heap[j];i=j;}heap[i]=[d,id];};
const heapPop=heap=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1,k=j+1;if(k<heap.length&&(heap[k][0]<heap[j][0]||heap[k][0]===heap[j][0]&&heap[k][1]<heap[j][1]))j=k;if(heap[j][0]>last[0]||heap[j][0]===last[0]&&heap[j][1]>=last[1])break;heap[i]=heap[j];i=j;}heap[i]=last;}return top;};
  // Cache the terrain/valley cost for each directed edge once. Dijkstra repeatedly
  // evaluates these same edges for main stems and tributaries, especially on large maps.
  const dirWeights=new Float64Array(n*4);
  for(let v=0;v<n;v++){
    const {x,y}=riverVertex(v,width);
    for(const to of adj[v]){
      const dir=heading(v,to),t=riverVertex(to,width);
      const up=Math.max(0,elev[to]-elev[v]),down=Math.max(0,elev[v]-elev[to]);
      const mx=(x+t.x)*.5,my=(y+t.y)*.5;
      const valley=noise(mx,my,4.5,37),wide=noise(mx,my,9,53);
      const local=1+2.2*(valley-.5)+1.0*(wide-.5)+Math.max(0,mountainNear[to]-mountainNear[v])*.14;
      dirWeights[v*4+dir]=Math.max(.30,local)+up*25-Math.min(.23,down*5);
    }
  }
  const sizeStates=n*5;
  const routeFrom=(start,preferredTargets)=>{
    const dist=new Float64Array(sizeStates).fill(Infinity),parent=new Int32Array(sizeStates).fill(-1),heap=[];
    dist[start*5+4]=0;heapPush(heap,0,start*5+4);
    while(heap.length){
      const [d,state]=heapPop(heap);if(d>dist[state]+1e-8)continue;
      const v=Math.floor(state/5),prevDir=state%5;
      for(const to of adj[v]){
        const dir=heading(v,to),s=to*5+dir,turn=prevDir===4||prevDir===dir?0:.30;
        const cost=dirWeights[v*4+dir]+turn;
        const nd=d+cost;
        if(nd+1e-8<dist[s]){dist[s]=nd;parent[s]=state;heapPush(heap,nd,s);}
      }
    }
    const ends=[];
    for(const target of preferredTargets){
      let best=-1,weight=Infinity;
      for(let dir=0;dir<4;dir++){
        const state=target*5+dir;if(dist[state]<weight){best=state;weight=dist[state];}
      }
      if(best<0||!Number.isFinite(weight))continue;
      const reverse=[],seen=new Set();let s=best;
      while(s>=0){let id=Math.floor(s/5);if(seen.has(id))break;seen.add(id);reverse.push(id);s=parent[s];}
      const route=reverse.reverse();if(route[0]!==start)continue;
      let turns=0,longest=1,run=1,prev=-1,climb=0;
      for(let i=1;i<route.length;i++){
        const dir=heading(route[i-1],route[i]);
        if(prev!==-1&&prev!==dir){turns++;longest=Math.max(longest,run);run=1;}else if(prev!==-1)run++;
        prev=dir;climb+=Math.max(0,elev[route[i]]-elev[route[i-1]]);
      }
      longest=Math.max(longest,run);
      ends.push({route,cost:weight,turns,longest,climb});
    }
    return ends;
  };
  const network=new Map(),mouths=[];const baseMinLength=Math.max(5,Math.round(Math.min(width,height)*.38));
  const appendRoute=(route)=>{
    let used=0;
    for(let i=0;i<route.length-1;i++){
      const from=route[i],to=route[i+1];
      if(network.has(from))break;
      network.set(from,to);used++;
      if(network.has(to))break;
    }
    return used;
  };
  // Collect coherent independent trunks. Prefer real mouths in differing coastal regions;
  // do not mandate bends or invent diagonals, but disfavor trivial ruler-straight channels.
  for(const source of mains){
    const paths=routeFrom(source.id,sea);const lenMin=Math.max(baseMinLength,Math.round(seaDistance[source.id]*1.08));
    const choices=paths.filter(p=>p.route.length-1>=Math.max(4,seaDistance[source.id]))
      .map(p=>{
        const len=p.route.length-1,mouth=p.route.at(-1),v=riverVertex(mouth,width);
        let nearExisting=0;for(const id of mouths){let t=riverVertex(id,width);nearExisting=Math.max(nearExisting,Math.max(0,7-Math.hypot(t.x-v.x,t.y-v.y)));}
        const targetDepth=Math.min(Math.max(baseMinLength,seaDistance[source.id]+3),Math.round(Math.min(width,height)*1.25));
        // The first source establishes the network; later sources seek distinct coastal basins.
        const slopeBonus=Math.min(.8,Math.max(0,elev[source.id]-elev[mouth])*1.2);
        const penaltyShort=Math.max(0,lenMin-len)*1.15;
        const penaltyStraight=Math.max(0,p.longest-Math.max(5,Math.round(len*.57)))*.50;
        const penaltyTurns=turns=>turns<3?1.5*(3-turns):turns>Math.ceil(len/2)?(turns-len/2)*.9:0;
        const endpointBias=(noise(v.x,v.y,8,91)-.5)*1.2;
        const score=p.cost*.80+penaltyShort+penaltyStraight+penaltyTurns(p.turns)+Math.abs(len-targetDepth)*.29+nearExisting*2.0+endpointBias-slopeBonus;
        return {p,score,mouth,len};
      }).sort((a,b)=>a.score-b.score||a.mouth-b.mouth);
    const picked=choices.find(c=>{
      const overlap=c.p.route.reduce((sum,id)=>sum+(network.has(id)?1:0),0);
      return overlap<=Math.round(c.len*.4);
    })||choices[0];
    if(!picked)continue;
    const inserted=appendRoute(picked.p.route);
    if(inserted>=Math.max(3,baseMinLength-2))mouths.push(picked.mouth);
  }
  // Headwater tributaries drain into existing trunks rather than finding unrelated mouths.
  // Multi-source drainage distances guarantee a genuine Y-shaped confluence and reduce work.
  const maxTributaries=Math.min(12,Math.max(1,Math.round(width*height/230)));
  const tribSources=[];
  for(let tr=0;tr<maxTributaries;tr++){
    const nodes=new Set(network.keys());for(const to of network.values())nodes.add(to);
    const dist=new Float64Array(n).fill(Infinity),parent=new Int32Array(n).fill(-1),heap=[];
    for(const v of nodes){if(riverSeaMouthVertex(tiles,width,height,v))continue;dist[v]=0;heapPush(heap,0,v);}
    while(heap.length){
      const [d,v]=heapPop(heap);if(d>dist[v]+1e-8)continue;
      for(const u of adj[v]){
        if(nodes.has(u))continue;
        const cost=dirWeights[u*4+heading(u,v)];
        const nd=d+cost;
        if(nd+1e-8<dist[u]){dist[u]=nd;parent[u]=v;heapPush(heap,nd,u);}
      }
    }
    const candidates=[];
    for(const c of sourceCandidates){
      if(!Number.isFinite(dist[c.id])||nodes.has(c.id))continue;
      if(mains.some(s=>Math.hypot(s.x-c.x,s.y-c.y)<Math.max(3,minSpread*.48)))continue;
      if(tribSources.some(s=>Math.hypot(s.x-c.x,s.y-c.y)<Math.max(3,minSpread*.62)))continue;
      const path=[c.id],seen=new Set(path);let v=c.id;
      while(parent[v]>=0&&!nodes.has(v)&&path.length<Math.max(12,Math.round(Math.min(width,height)*.85))){
        v=parent[v];if(seen.has(v))break;seen.add(v);path.push(v);
      }
      if(!nodes.has(path.at(-1)))continue;
      const len=path.length-1;
      if(len<3||len>Math.max(10,Math.round(Math.min(width,height)*.70)))continue;
      if(!path.slice(1,-1).every(id=>!nodes.has(id)))continue;
      let turns=0,prevDir=-1;
      for(let i=1;i<path.length;i++){const dir=heading(path[i-1],path[i]);if(prevDir!==-1&&dir!==prevDir)turns++;prevDir=dir;}
      const score=c.score+Math.min(7,len)*.065-.14*Math.max(0,turns-3);
      candidates.push({c,path,len,score});
    }
    candidates.sort((a,b)=>b.score-a.score||a.c.id-b.c.id);
    if(!candidates.length)break;
    const chosen=candidates[0];if(appendRoute(chosen.path)!==chosen.len)throw Error('하천 지류 연결 오류');
    tribSources.push(chosen.c);
  }
  // Flow is the number of independently draining tributary headwaters, capped at 3.
  const incoming=new Map();for(const [from,to] of network)incoming.set(to,(incoming.get(to)||[]).concat(from));
  const count=new Map();
  function upstream(id,stack=new Set()){
    if(count.has(id))return count.get(id);
    if(stack.has(id))throw Error('하천 생성 오류: 순환');stack.add(id);
    const entries=incoming.get(id)||[];
    const value=entries.length?entries.reduce((s,v)=>s+upstream(v,stack),0):1;
    stack.delete(id);count.set(id,value);return value;
  }
  const result=[...network].map(([from,to])=>({from,to,flow:Math.min(3,upstream(from))}))
    .sort((a,b)=>a.from-b.from||a.to-b.to);
  riverValidate(tiles,width,height,result);
  for(const s of result){let v=s.to,guard=0;while(network.has(v)&&guard++<n)v=network.get(v);if(!riverSeaMouthVertex(tiles,width,height,v))throw Error('하천 생성 오류: 실제 바다에 닿지 않는 하구');}
  return result;
}
// --- src/core/performance.js ---
/** VILOB Light SIM/BATCH: no rendering or idle time; perf data is runtime-only. */
const SIM_BATCH_INTERVAL_MS = 550;
// V0.5B1: runtime-only adaptive scheduler. The simulation and RNG remain unchanged.
const AUTO_SPEED_HIGH_MS=1500,AUTO_SPEED_LOW_MS=1000;
const AUTO_SPEED_CONFIRM=3,AUTO_SPEED_COOLDOWN_MS=2000;
const AUTO_SPEED_FRAME_BUDGET_MS=12,AUTO_SPEED_MAX_BATCHES=16,AUTO_SPEED_UI_INTERVAL_MS=200;
function createAutoSpeedState(){return {enabled:false,mode:'MAX',highCount:0,lowCount:0,lastSwitchAt:-Infinity};}
function updateAutoSpeedMode(auto,simMs,now){
  if(!auto.enabled||!Number.isFinite(simMs))return false;
  if(auto.mode==='MAX'){
    auto.highCount=simMs>AUTO_SPEED_HIGH_MS?auto.highCount+1:0;
    auto.lowCount=0;
    if(auto.highCount>=AUTO_SPEED_CONFIRM&&now-auto.lastSwitchAt>=AUTO_SPEED_COOLDOWN_MS){
      auto.mode='SAFE';auto.highCount=0;auto.lastSwitchAt=now;return true;
    }
  }else{
    auto.lowCount=simMs<AUTO_SPEED_LOW_MS?auto.lowCount+1:0;
    auto.highCount=0;
    if(auto.lowCount>=AUTO_SPEED_CONFIRM&&now-auto.lastSwitchAt>=AUTO_SPEED_COOLDOWN_MS){
      auto.mode='MAX';auto.lowCount=0;auto.lastSwitchAt=now;return true;
    }
  }
  return false;
}
function createSimMeter(){
  return {samples:0,simMs:null,msPerDay:null,lastBatchDays:0,lastRawMs:null};
}
function measureSimBatch(meter,days,simulate,now=()=>performance.now()){
  if(!Number.isSafeInteger(days)||days<1)throw Error('SIM batch days must be a positive integer');
  const start=now();
simulate();
  const elapsed=Math.max(0,now()-start);
  // Manual 30d and automatic x10 batches must not contaminate each other's moving average.
  if(meter.lastBatchDays&&meter.lastBatchDays!==days){meter.samples=0;meter.simMs=null;meter.msPerDay=null;}
  const perDay=elapsed/days;
  // Original VILOB uses .42 while warming up, .22 after 12 samples.
  const alpha=meter.samples>12?.22:.42;
  meter.simMs=meter.samples===0?elapsed:meter.simMs*(1-alpha)+elapsed*alpha;
  meter.msPerDay=meter.samples===0?perDay:meter.msPerDay*(1-alpha)+perDay*alpha;
  meter.lastBatchDays=days;
  meter.lastRawMs=elapsed;
  meter.samples++;
  return meter;
}
function formatSimMs(ms){
  if(!Number.isFinite(ms))return '—';
  return ms<1?ms.toFixed(3):ms.toFixed(1);
}


// V0.4E historical-era color scale shared by map and statistical distribution.
const V04C_ERA_COLORS=Object.freeze({ancient:'#9DA67C',medieval:'#6596C6',early_modern:'#B7A26A',industrial_modern:'#B78A58',future:'#A990CB'});
function v04cEraColor(nation){return V04C_ERA_COLORS[nation?.civilization?.era]||V04C_ERA_COLORS.ancient;}

// --- src/ui/military-politics-d1c.js ---
/** D1C UI: lazily expanded UnitGroup details, no writes to world state. */
const D1C_LABELS=Object.freeze({pay:'급여',supply:'보급',war:'전쟁 피로',command:'지휘 불안정',culture:'정치·문화'});
const d1cShow=v=>(v/10).toFixed(1);
const D1C_OPEN_ARMIES=new Set();
function d1cCauseLabel(g){return `${D1C_CAUSES[g.lastCause]||'압박 없음'}${g.lastCauseDay===null?'':` · ${Math.floor(g.lastCauseDay/120)+1}년`}`;}
function d1cMeter(label,raw){
 const wrap=make('div',{class:'d1c-meter'});
 wrap.append(make('div',{class:'d1c-meter-header'},[make('span',{text:label}),make('strong',{text:d1cShow(raw)})]));
 wrap.append(make('div',{class:'d1c-meter-track'},[make('span',{class:raw>=600?'d1c-meter-critical':'d1c-meter-normal',style:{width:Math.max(0,raw/10)+'%'}})]));
 return wrap;
}
function d1cNationPanel(w,n){
 const armies=w.armies.filter(a=>a.nationId===n.id),s=d1cSummarize(w,armies),box=make('section',{class:'overview-section d1c-overview'});
 box.append(make('h3',{text:'D1C · 군부 정치 불만 (전투 사기와 별도)'}));
 const intro=make('div',{class:'d1c-political-summary'},[
  make('div',{},[make('small',{text:'현역 병력 가중 정치 불만'}),make('strong',{text:d1cShow(s.overall)+' / 100'})]),
  make('div',{},[make('small',{text:'중대 불만 병력 (원인 60점 이상)'}),make('strong',{text:`${number.format(s.criticalPopulation)} / ${number.format(s.population)}명`})]),
  make('div',{},[make('small',{text:'현역 편제'}),make('strong',{text:`${s.armyCount}개`})])]);
 box.append(intro,make('small',{class:'muted-line',text:'별도 군부 정치 지표입니다. 민간 불만·전투 사기·종속국 독립 압력에 영향을 주지 않습니다.'}));
 const meters=make('div',{class:'d1c-meters'});
 for(const k of D1C_FIELDS)meters.append(d1cMeter(`${D1C_LABELS[k]} · 60점 이상 ${number.format(s.byCause[k])}명`,s.values[k]));
 box.append(meters);
 const history=n.military.politicalHistory||[],details=make('details',{class:'d1c-trend'});
 details.append(make('summary',{text:`최근 ${history.length}/${D1C_WINDOW}분기 군부 정치 불만 추이` }));
 if(history.length){
  for(const k of D1C_FIELDS){
   const graph=make('div',{class:'d1c-trend-row'});
   graph.append(make('small',{text:D1C_LABELS[k]}));
   const chart=make('div',{class:'d1c-trend-bars'});
   for(const entry of history){const value=entry.values[k];chart.append(make('span',{class:'d1c-trend-bar',style:{height:`${Math.max(3,value/10)}%`,background:value>=600?'#E98079':'#82A8C2'},title:`${Math.floor(entry.dayIndex/120)+1}년 ${Math.floor(entry.dayIndex%120/30)+1}분기 · ${d1cShow(value)}`}));}
   graph.append(chart);details.append(graph);
  }
 }else details.append(make('div',{class:'muted-line',text:'30일 경계에서 최초 기록됩니다.'}));
 box.append(details);return box;
}
function d1cArmyDetails(w,a){
 const summary=d1cSummarize(w,[a]);
 const root=make('details',{class:'d1c-army-details','data-d1c-army':String(a.id)});
 root.open=D1C_OPEN_ARMIES.has(a.id);
 root.append(make('summary',{text:`정치 상태 · ${d1cShow(summary.overall)} / 100 · 중대 불만 ${number.format(summary.criticalPopulation)}명 · 전투 사기 ${Math.round(a.morale)}와 별도`}));
 // Avoid building potentially hundreds of unit-group bars until the user opens this unit.
 root.addEventListener('toggle',()=>{
  if(root.open)D1C_OPEN_ARMIES.add(a.id);else D1C_OPEN_ARMIES.delete(a.id);
  if(!root.open||root.dataset.d1cLoaded==='1')return;
  root.dataset.d1cLoaded='1';
  const body=make('div',{class:'d1c-army-expanded'});
  for(const k of D1C_FIELDS)body.append(d1cMeter(D1C_LABELS[k],summary.values[k]));
  const groups=make('div',{class:'d1c-unit-groups'});
  for(const u of a.units){
   if(!u.manpower)continue;
   const wrap=make('details',{class:'d1c-unit-card'});
   wrap.append(make('summary',{text:`${UNIT_TYPES[u.typeId]?.label||u.typeId} · ${number.format(u.manpower)}명 · 문화별 정치 상태` }));
   for(const [id,count] of Object.entries(u.culturePopulation||{})){
    if(!count)continue;
    const g=u.militaryGrievances?.groups[id];if(!g)continue;
    const info=d1cGroupSummary(w,a,id,g),name=w.cultures.find(c=>c.id===id)?.name||id;
    const part=make('div',{class:'d1c-culture-cohort'});
    part.append(make('strong',{text:`${name} · ${number.format(count)}명 · 종합 ${d1cShow(info.overall)}`}));
    for(const k of D1C_FIELDS)part.append(d1cMeter(D1C_LABELS[k],info.scores[k]));
    part.append(make('small',{class:'muted-line',text:`전쟁 피로: 지속 ${d1cShow(info.scores.warBase)} + 손실 충격 ${d1cShow(info.scores.battleShock)} · 실제 전투 손실 누적 ${g.battleLosses}명` }));
    part.append(make('small',{class:'muted-line',text:`최근 원인: ${d1cCauseLabel(g)}` }));
    wrap.append(part);
   }
   groups.append(wrap);
  }
  body.append(groups);root.append(body);
 });
 return root;
}
function d1cArmyCritical(w,a){
 for(const u of a.units){for(const [id,count] of Object.entries(u.culturePopulation||{})){
  if(count<=0)continue;const g=u.militaryGrievances?.groups[id];
  if(g&&d1cGroupSummary(w,a,id,g).critical)return true;
 }}return false;
}
/** Map warning marker: only 60+ grievance troops, only if military labels visible, spatially de-duplicated. */
function d1cDrawMapWarnings(ctx,scale,ox,oy,cw,ch){
 if(this.armyLabelMode==='off'||!this.world)return;
 const w=this.world,old=this.d1cWarningCache;
 if(!old||old.world!==w||old.day!==w.dayIndex||old.seq!==w.changeSeq){
  const tiles=[];
  for(const a of w.armies){if(manpower(a)>0&&d1cArmyCritical(w,a))tiles.push(a.tileId);}
  this.d1cWarningCache={world:w,day:w.dayIndex,seq:w.changeSeq,tiles};
 }
 const seen=new Set();
 ctx.save();ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.clip();
 for(const tid of this.d1cWarningCache.tiles){
  const tile=w.tiles[tid];if(!tile)continue;
  const x=ox+(tile.x+.75)*scale,y=oy+(tile.y+.2)*scale;
  if(x<8||x>cw-8||y<8||y>ch-8)continue;
  const key=`${Math.round(x/18)}:${Math.round(y/18)}`;
  if(seen.has(key))continue;seen.add(key);
  ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fillStyle='rgba(50,22,23,.95)';ctx.fill();
  ctx.strokeStyle='#ffb77c';ctx.lineWidth=1.4;ctx.stroke();
  ctx.fillStyle='#ffe4bb';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 10px system-ui,sans-serif';ctx.fillText('!',x,y+.6);
 }
 ctx.restore();
}
// --- end D1C military politics UI ---
// --- src/ui/map-renderer.js ---






function hexRgb(h){return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));}
function blend(a,b,k){const aa=hexRgb(a),bb=hexRgb(b);return '#'+aa.map((v,i)=>Math.round(v*(1-k)+bb[i]*k).toString(16).padStart(2,'0')).join('');}
// Atlas camera zoom is independent of the chosen FIT/COVER framing.
// 1.0 is the default full-map framing; users may zoom out below it.
const MIN_MAP_ZOOM=0.4;
const MAX_MAP_ZOOM=3.25;
/** F3D: render the same concrete, occupied-aware lines that constrain army routes. */
function buildFortificationNetwork(w){
  const graph=fortificationNetwork(w);
  const nodes=(w.defenses||[]).filter(d=>w.tiles[d.tileId]).map(d=>({id:d.tileId,level:d.level,hp:d.hp,status:d.status,owner:w.tiles[d.tileId].ownerId,
    occupied:w.tiles[d.tileId].occupiedBy!==null})).sort((a,b)=>a.id-b.id);
  return {nodes,solid:graph.lines.flatMap(path=>path.slice(1).map((id,i)=>[path[i],id])),dashed:[]};
}

/** B2: category priority war > subject > alliance > truce. Pure UI-only lookups. */
function diplomaticBorderRelations(w){
  const kinds=new Map();
  for(let a=0;a<w.nations.length;a++)for(let b=a+1;b<w.nations.length;b++){
    if(Math.max(w.nations[a].truces?.[b]||0,w.nations[b].truces?.[a]||0)>w.dayIndex)
      kinds.set(pairKey(a,b),'truce');
  }
  for(const a of w.diplomacy?.alliances||[])if(a.endsDay>w.dayIndex)kinds.set(pairKey(a.a,a.b),'alliance');
  for(const t of w.diplomacy?.subjectTreaties||[])if(w.nations[t.overlordId]?.active&&w.nations[t.subjectId]?.active)
    kinds.set(pairKey(t.overlordId,t.subjectId),'subject');
  for(const war of w.wars||[]){
    const attackers=war.sides?.attackers||[war.attackerId],defenders=war.sides?.defenders||[war.defenderId];
    for(const a of attackers)for(const b of defenders)kinds.set(pairKey(a,b),'war');
  }
  return kinds;
}
/** Directions always refer to diplomatic status, not real-time military movement.
 * Subject → overlord; original declaring (attacking) SIDE → defending SIDE.
 */
function diplomaticBorderDirections(w){
  const directions=new Map();
  for(const t of w.diplomacy?.subjectTreaties||[])if(w.nations[t.overlordId]?.active&&w.nations[t.subjectId]?.active)
    directions.set(pairKey(t.overlordId,t.subjectId),{kind:'subject',from:t.subjectId,to:t.overlordId});
  for(const war of w.wars||[]){
    const attackers=war.sides?.attackers||[war.attackerId],defenders=war.sides?.defenders||[war.defenderId];
    for(const a of attackers)for(const b of defenders)
      directions.set(pairKey(a,b),{kind:'war',from:a,to:b});
  }
  return directions;
}
/** Sovereign neighbor borders, one segment per pair of adjacent unlike nation tiles. */
function buildDiplomaticBorderSegments(w){
  const segments=[],width=w.size,height=w.height??width;
  for(const t of w.tiles){
    if(t.ownerId===null)continue;
    const x=t.id%width,y=Math.floor(t.id/width);
    if(x<width-1){const o=w.tiles[t.id+1].ownerId;if(o!==null&&o!==t.ownerId)segments.push([x+1,y,x+1,y+1,t.ownerId,o]);}
    if(y<height-1){const o=w.tiles[t.id+width].ownerId;if(o!==null&&o!==t.ownerId)segments.push([x,y+1,x+1,y+1,t.ownerId,o]);}
  }
  return segments;
}

// B4C: pure camera-space collision/aggregation helpers (render-only; never use SIM RNG).
function b4cOverlap(a,b,pad=3){return a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;}
// V0.7C2: each regular-map army marker belongs to exactly one real tile.
// Combining neighboring tiles and averaging their screen centers made the visible
// badge wander across tile boundaries whenever zoom changed. Same-tile groups are
// already combined upstream in armyBadges, so no cross-tile aggregation is needed.
function b4cArmyClusters(badges,tiles,scale,ox,oy,selectedId,zoom){
  const result=[];
  for(const [tid,factions] of [...badges].sort((a,b)=>a[0]-b[0]))for(const item of factions){
    if(item.amount<=0&&item.machineCount<=0)continue;
    const t=tiles[tid];if(!t)continue;
    const x=ox+(t.x+.5)*scale,y=oy+(t.y+.5)*scale;
    result.push({nationId:item.nationId,x,y,amount:item.amount,machineCount:item.machineCount||0,strength:item.strength,
      weightedXP:item.weightedXP,types:{...item.types},members:[{tid,armyGroups:item.armies}],
      selected:tid===selectedId,allSailing:item.allSailing,soonestArrival:item.soonestArrival});
  }
  return result;
}
// Marker geometry is expressed around the actual tile-center, with one common
// transform for seal, weapon, era tab, commander star, morale bar and troop count.
const V07C2_ARMY_MARKER_SCALE=.82;
function v07c2MarkerGeometry(x,y,compact,tileScale){
  const factor=compact?Math.min(V07C2_ARMY_MARKER_SCALE,Math.max(.64,tileScale/36*.82)):V07C2_ARMY_MARKER_SCALE;
  const w=compact?57:65,h=compact?61:75;
  const centerYOffset=compact?23:30;
  return {factor,drawRect:{x:x-w/2,y:y-centerYOffset,w,h},
    hitRect:{x:x-(compact?27:32)*factor,y:y-(compact?28:34)*factor,
      w:(compact?55:66)*factor,h:(compact?63:75)*factor}};
}
function b4cFindLabelSpot(anchor,w,h,used,vw,vh){
  const x=anchor.x,y=anchor.y;
  const offsets=[[0,-h-5],[0,5],[-w*.64,-h*.70],[w*.64,-h*.70],[-w*.68,h*.58],[w*.68,h*.58],[0,-h-26],[0,27],[-w-8,-h*.35],[w+8,-h*.35]];
  for(const [dx,dy] of offsets){
    const rect={x:Math.round(x+dx-w/2),y:Math.round(y+dy),w,h};
    if(rect.x<5||rect.y<5||rect.x+w>vw-5||rect.y+h>vh-5)continue;
    if(!used.some(r=>b4cOverlap(rect,r)))return rect;
  }
  return null;
}
function b4cDominant(types){return Object.entries(types).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||'levy';}
function b4cTypeSymbol(type){return ['archer','longbowman','crossbowman'].includes(type)?'🏹':['heavy_infantry','pikeman'].includes(type)?'🛡':'⚔';}
// V0.7C: visual-only B3 circle seal + M4 vertical morale gauge.
// No world writes, no RNG, and never conflate equipment era with formation XP.
const V07C_EQUIPMENT_RANK=Object.freeze({basic_arms:0,spear:0,bow:0,sword:2,pike:2,longbow:1,crossbow:2,steel_blade:3,matchlock:5,flintlock:6,rifled_musket:7,machine_gun:7});
const V08B_VISUAL_PRIORITY=Object.freeze({machine_gunner:4,rifle_infantry:3,field_artillery:2,flintlock:1,matchlock:0});
const V07C_ARMOR_RANK=Object.freeze({none:0,light:0,medium:1,heavy:2,plate:3});
// V0.7D1: visual-only rank and weighted formation level.
// The featured weapon icon and era tab MUST resolve from the same 10%-eligible unit type.
function v07cArmyVisual(armies){
 const candidates=new Map(),members=[];
 let total=0,morale=0,levelWeighted=0;
 for(const army of armies){
  const count=manpower(army);if(count<=0)continue;
  total+=count;morale+=count*(Number.isFinite(army.morale)?Math.max(0,Math.min(100,army.morale)):0);
  levelWeighted+=count*(b4aRankIndex(army)+1);members.push(army.id);
  for(const u of army.units){if(u.manpower<=0)continue;
   const rank=Math.min(7,Math.max(V07C_EQUIPMENT_RANK[u.weaponId]??0,V07C_ARMOR_RANK[u.armorId]??0));
   const entry=candidates.get(u.typeId)||{men:0,rank:0};entry.men+=u.manpower;entry.rank=Math.max(entry.rank,rank);candidates.set(u.typeId,entry);
  }
 }
 const featured=[...candidates.entries()].filter(([,v])=>v.men>=total*.10)
   .sort((a,b)=>b[1].rank-a[1].rank||(V08B_VISUAL_PRIORITY[b[0]]||0)-(V08B_VISUAL_PRIORITY[a[0]]||0)||b[1].men-a[1].men||a[0].localeCompare(b[0]))[0];
 const tanks=armies.reduce((s,a)=>s+(a.v08fTankIds?.length||0),0);
 const type=tanks?'assault_tank':featured?.[0]||'mixed',rank=tanks?8:featured?.[1].rank??0;
 const era=rank>=8?'IND IV':rank>=7?'IND I':rank>=6?'E III':rank>=5?'E I':rank===4?'M IV':rank===3?'M III':rank===2?'M II':rank===1?'M I':'A';
 return {types:Object.fromEntries([...candidates].map(([k,v])=>[k,v.men])),type,rank,era,total,
   morale:total?morale/total:null,averageLevel:total?levelWeighted/total:null,members};
}
// Pure UI snapshot: active participants can be on the neighboring ATTACKER origin tile.
// The shared battle marker is pinned to the real engagement tile, not averaged army positions.
function v07d1BattleGroups(w){
 if(!(w.engagements||[]).length)return [];
 const armies=new Map(w.armies.filter(a=>a.status==='ENGAGED'&&(manpower(a)>0||a.hAutomatonGroupIds?.length>0&&hCount(w,a)>0)).map(a=>[a.id,a]));
 const tiles=new Map();
 for(const e of w.engagements||[]){
  const sides={};const ids=new Set();const countries=new Set();
  for(const side of ['attackers','defenders']){
   const data=Array.isArray(e[side])?e[side].map(v=>v.armyId):[side==='attackers'?e.attackerArmyId:e.defenderArmyId];
   sides[side]=[];
   for(const id of data){if(ids.has(id))continue;
    const army=armies.get(id);if(!army||army.engagementId!==e.id||army.status!=='ENGAGED')continue;
    ids.add(id);countries.add(army.nationId);
    const member=Array.isArray(e[side])?e[side].find(m=>m.armyId===id):null;
    sides[side].push({army,member});
   }
  }
  if(countries.size<2)continue;
  let entry=tiles.get(e.tileId);if(!entry){entry={tileId:e.tileId,engagements:[],nationIds:new Set(),armies:new Set()};tiles.set(e.tileId,entry);}
  entry.engagements.push({id:e.id,round:e.round??0,sides});
  for(const n of countries)entry.nationIds.add(n);
  for(const id of ids)entry.armies.add(id);
 }
 return [...tiles.values()].sort((a,b)=>a.tileId-b.tileId);
}
// B: orange halo and crossed swords at 9 o'clock. Follows marker-local 82% scaling.
function v07d1DrawEngagedRing(ctx,cx,cy,r){
 ctx.save();ctx.strokeStyle='#ffb66b';ctx.lineWidth=2.5;
 ctx.beginPath();ctx.arc(cx,cy,r+5,0,Math.PI*2);ctx.stroke();
 const x=cx-r-6,y=cy;
 ctx.fillStyle='#a64a22';ctx.strokeStyle='#ffdc9f';ctx.lineWidth=1.2;
 ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 12px system-ui,sans-serif';ctx.fillStyle='#fff5d9';ctx.fillText('⚔',x,y+.3);
 ctx.restore();
}
// C: draw ABOVE regular army pins and territory overlays; screen-space and tile-pinned.
function v07d1DrawSharedBattle(ctx,x,y,battle,nations,overview=false){
 const ids=[...battle.nationIds].sort((a,b)=>a-b);
 const r=overview?9:20;
 ctx.save();ctx.shadowColor='#e75c25';ctx.shadowBlur=overview?3:6;
 ctx.fillStyle='#10293d';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
 ctx.lineWidth=overview?2.6:4;
 // Two nations receive equal half-rings; 3+ coalition nations retain every actual color.
 for(let i=0;i<ids.length;i++){
  const start=Math.PI/2+i*Math.PI*2/ids.length;
  ctx.strokeStyle=nations[ids[i]]?.color||'#6ecbda';ctx.beginPath();
  ctx.arc(x,y,r,start,start+Math.PI*2/ids.length);ctx.stroke();
 }
 ctx.strokeStyle='#ffbd6b';ctx.lineWidth=overview?1.25:1.6;
 ctx.beginPath();ctx.arc(x,y,r+4,0,Math.PI*2);ctx.stroke();
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffebc7';
 ctx.font=overview?'bold 14px system-ui,sans-serif':'bold 24px system-ui,sans-serif';ctx.fillText('⚔',x,y+.5);
 if(!overview){
  ctx.strokeStyle='rgba(12,32,48,.98)';ctx.lineWidth=3;
  ctx.font='800 10px system-ui,sans-serif';ctx.strokeText('전투 중',x,y-r-13);ctx.fillText('전투 중',x,y-r-13);
  const text=`${ids.length}국 · ${battle.armies.size}편제${battle.engagements.length>1?' · '+battle.engagements.length+'교전':''}`;
  ctx.font='800 9px system-ui,sans-serif';const tw=Math.max(61,ctx.measureText(text).width+11);
  ctx.fillStyle='#122e42';ctx.strokeStyle='#a98051';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(x-tw/2,y+r+7,tw,17,5);ctx.fill();ctx.stroke();
  ctx.fillStyle='#ffeac8';ctx.fillText(text,x,y+r+15.5);
 }
 ctx.restore();return {x:x-(overview?14:34),y:y-(overview?15:41),w:overview?28:68,h:overview?30:93};
}
function v07cMoraleColor(m){return m===null?'#7d91a1':m>=70?'#2ed17d':m>=40?'#f0d45d':m>=15?'#f2933d':'#e34a52';}
// V0.7C1: original B3-M4 design-lab vector paths, with chosen L2/G2 revisions.
// Every weapon path below is copied from the approved SVG design, not redrawn as simple lines.
// Render-time geometry is cacheable, does not mutate world state or use RNG.
const V07C1_ICON_PATHS=Object.freeze({"levy":[["path","line","M18 50 L42 22"],["path","fill","M34 21 Q36 11 46 10 Q56 10 55 18 Q54 25 43 30 Z"],["path","accent","M19 43 L24 46"],["circle","disk",29.0,42.0,12.0],["circle","pint",29.0,42.0,3.0]],"spearman":[["path","line","M15 52 L46 16"],["path","fill","M50 7 L43 24 L37 18 Z"],["path","light","M22 45 L37 28"],["path","line","M14 51 L21 54"]],"swordsman":[["path","fill","M49 8 L52 11 L30 40 L25 35 Z"],["path","line","M19 30 L34 45 M25 36 L15 49"],["path","light","M18 52 L12 46"]],"pikeman":[["path","line","M20 54 L20 14 M43 54 L43 12"],["path","fill","M20 5 L26 18 L14 18 Z M43 3 L49 16 L37 16 Z"],["path","light","M18 38 L22 38 M41 38 L45 38"]],"heavy_infantry":[["path","line","M20 23 Q22 7 32 9 Q44 7 46 23 L44 31 L20 31 Z"],["path","light","M23 21 L41 21"],["path","fill","M14 31 Q32 26 50 31 L47 48 L32 58 L17 48 Z"],["path","accent","M32 34 L32 50 M24 41 L40 41"]],"archer":[["path","line","M41 14 Q16 32 41 50 M41 14 L41 50"],["path","light","M13 31 L54 31"],["path","fill","M54 31 L44 27 L44 35 Z"]],"longbowman":[["path","line","M45 4 Q8 32 45 60 M45 4 L45 60"],["path","light","M12 32 L56 32"],["path","fill","M56 32 L45 27 L45 37 Z"],["path","accent","M41 7 L46 9 M41 55 L46 57"]],"crossbowman":[["path","line","M8 24 Q32 7 56 24 M8 24 Q32 31 56 24 M32 24 L32 56 M26 48 L38 48"],["path","light","M8 24 L56 24 M32 22 L32 40"],["path","fill","M32 12 L27 21 L37 21 Z"]],"matchlock":[["path","line","M6 35 H60"],["path","accent","M40 31 H59"],["path","fill","M7 34 L21 31 L27 36 L21 43 L10 47 L4 45 L12 38 Z"],["path","line","M31 36 Q36 41 40 34 L38 29"],["path","accent","M40 29 Q36 25 41 22"],["circle","ember",42.0,20.0,2.8]],"flintlock":[["path","line","M5 33 L60 30"],["path","accent","M35 27 L59 26"],["path","fill","M5 33 L19 31 L27 37 L22 43 L9 48 L4 45 L12 38 Z"],["path","line","M33 33 L33 26 L39 24 L43 31"],["path","accent","M43 31 L48 35 M39 24 L45 22"],["circle","pint",41,26,2.5]],"machine_gunner":[["path","fill","M12 22 L27 22 L31 26 L27 30 L12 30 L7 26 L7 24 Z"],["path","fill","M30 22 H52 Q58 22 58 26 Q58 30 52 30 H30 Z"],["path","line","M31 26 H56"],["path","light","M30 24 H49"],["path","line","M32 31 L25 55 M32 31 L33 53 M32 31 L43 55"],["path","accent","M16 34 L15 47 M20 34 L19 45 M24 34 L23 43"]],"mixed":[["path","line","M14 53 L46 12 M50 52 L18 17"],["path","fill","M51 6 L42 20 L36 14 Z M13 10 L25 19 L19 25 Z"],["path","light","M16 47 L21 52 M45 47 L50 52"],["path","accent","M32 25 L32 42"]]});
const V07C1_PATH_CACHE=new Map();
function v07c1GetIcon(type){
 const t=Object.hasOwn(V07C1_ICON_PATHS,type)?type:'mixed';
 let items=V07C1_PATH_CACHE.get(t);
 if(items)return items;
 items=V07C1_ICON_PATHS[t].map(raw=>raw[0]==='path'
   ?{kind:'path',style:raw[1],path:new Path2D(raw[2])}
   :{kind:'circle',style:raw[1],x:raw[2],y:raw[3],r:raw[4]});
 V07C1_PATH_CACHE.set(t,items);return items;
}
function v07cDrawWeaponIcon(ctx,type,compact=false){
 const ink='#fff9e9',detail='#ffda8c';
 ctx.save();
 ctx.lineCap='round';ctx.lineJoin='round';ctx.miterLimit=2;
 // Approved G2 diagonal matchlock: rotate the ENTIRE original grouped vector -23 degrees.
 if(type==='matchlock'){ctx.translate(32,32);ctx.rotate(-23*Math.PI/180);ctx.translate(-32,-32);}
 for(const item of v07c1GetIcon(type)){
  const role=item.style;
  // At very small zoom suppress only low-information filigree; weapon silhouettes remain exact.
  if(compact&&role==='accent')continue;
  if(item.kind==='circle'){
   ctx.beginPath();ctx.arc(item.x,item.y,item.r,0,Math.PI*2);
   if(role==='disk'){ctx.fillStyle='#254861';ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=2.6;ctx.stroke();}
   else if(role==='pint'){ctx.fillStyle=detail;ctx.fill();}
   else if(role==='ember'){ctx.fillStyle='#ffad51';ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='#ffc77a';ctx.stroke();}
  }else if(role==='fill'){
   ctx.fillStyle=ink;ctx.fill(item.path);ctx.strokeStyle=ink;ctx.lineWidth=1;ctx.stroke(item.path);
  }else{
   ctx.strokeStyle=role==='line'?ink:detail;
   ctx.lineWidth=role==='line'?4.2:1.8;
   ctx.stroke(item.path);
  }
 }
 ctx.restore();
}

// Exact approved V8 P8-B/H · H8-2 visual configuration, independently of game state.
const F2C2C_FRAME_SETTINGS=Object.freeze({toothDepth:100,metal:'bright',jadeTint:22,hatchOpacity:45,ringGap:1.9,haloWidth:1.3});
function f2c2cRadialLugPath(ctx, r, count, settings={}){
 const outerAdd = settings.outerAdd ?? 7.2;
 const rootAdd = settings.rootAdd ?? 5.25;
 const bodyInset = settings.bodyInset ?? 3.8;
 const innerHalf = settings.innerHalf ?? 5.2;
 const tipHalf = settings.tipHalf ?? 4.2;
 const rounded = settings.rounded ?? false;
 const pointy = settings.pointy ?? false;
 const shoulder = settings.shoulder ?? 1.25;
 const start = -Math.PI/2;
 for(let i=0;i<count;i++){
   const ang = start + i * (Math.PI*2/count);
   ctx.save();
   ctx.rotate(ang);
   ctx.beginPath();
   if(rounded){
      const x0 = r-bodyInset, x1 = r+rootAdd, x2 = r+outerAdd;
      const h0 = innerHalf, h1 = tipHalf;
      ctx.moveTo(x0,-h0);
      ctx.lineTo(x1,-h0);
      ctx.quadraticCurveTo(x2,-h1,x2,0);
      ctx.quadraticCurveTo(x2,h1,x1,h0);
      ctx.lineTo(x0,h0);
      ctx.closePath();
   } else if(pointy){
      const x0 = r-bodyInset, x1 = r+rootAdd, x2 = r+outerAdd;
      const h0 = innerHalf, h1 = tipHalf;
      ctx.moveTo(x0,-h0);
      ctx.lineTo(x1,-h0);
      ctx.lineTo(x2-shoulder,-h1);
      ctx.lineTo(x2,0);
      ctx.lineTo(x2-shoulder,h1);
      ctx.lineTo(x1,h0);
      ctx.lineTo(x0,h0);
      ctx.closePath();
   } else {
      ctx.moveTo(r-bodyInset,-innerHalf);
      ctx.lineTo(r+rootAdd,-innerHalf);
      ctx.lineTo(r+outerAdd,-tipHalf);
      ctx.lineTo(r+outerAdd,tipHalf);
      ctx.lineTo(r+rootAdd,innerHalf);
      ctx.lineTo(r-bodyInset,innerHalf);
      ctx.closePath();
   }
   ctx.fill();
   ctx.stroke();
   ctx.restore();
 }
}

// P8-B platinum / extremely pale jade finished ring. Paint only the light inner ring:
// the sovereign color ring, gear silhouette, and weapon glyph are deliberately untouched.
function f2c2cPaintPlatinumJadeBand(ctx,r,compact,finish){
 const ringRadius=r-2.0, bandWidth=compact?4.65:4.85;
 const ro=ringRadius+bandWidth/2,ri=ringRadius-bandWidth/2;
 const tint=F2C2C_FRAME_SETTINGS.jadeTint/50, strength=F2C2C_FRAME_SETTINGS.hatchOpacity/100;
 const jadeA=Math.round(225-35*tint),jadeB=Math.round(234-20*tint);
 const grad=ctx.createLinearGradient(-r,-r*.85,r*.85,r);
 grad.addColorStop(0,'#ffffff');
 grad.addColorStop(.19,'#e8f3f0');
 grad.addColorStop(.43,`rgb(${jadeA},${Math.min(255,jadeB+11)},${Math.min(255,jadeB+9)})`);
 grad.addColorStop(.69,`rgb(${Math.max(200,jadeA-10)},${jadeB},${Math.min(255,jadeB+7)})`);
 grad.addColorStop(1,'#f9fcfa');
 ctx.save();
 ctx.beginPath();ctx.arc(0,0,ro,0,Math.PI*2);ctx.arc(0,0,ri,0,Math.PI*2,true);
 ctx.fillStyle=grad;ctx.fill('evenodd');
 // Clip precisely to the metal band so diagonal engraving never crosses the icon itself.
 if(finish!=='satin'&&strength>0){
   ctx.save();ctx.beginPath();ctx.arc(0,0,ro-.13,0,Math.PI*2);ctx.arc(0,0,ri+.12,0,Math.PI*2,true);ctx.clip('evenodd');
   const pitch=finish==='engraved'?4.9:5.7;
   const opacity=(finish==='engraved'?.42:.25)*strength;
   const dark=F2C2C_FRAME_SETTINGS.metal==='bronze'?'#668f86':'#5e8f91';
   ctx.strokeStyle=dark;ctx.globalAlpha=opacity;
   ctx.lineWidth=finish==='engraved'?.9:.65;
   for(let k=-r*3;k<=r*3;k+=pitch){
     ctx.beginPath();ctx.moveTo(k-r*2,-r*2);ctx.lineTo(k+r*2,r*2);ctx.stroke();
   }
   // A restrained hairline beside each dark cut gives a machined platinum highlight.
   ctx.strokeStyle='#ffffff';ctx.globalAlpha=opacity*.72;ctx.lineWidth=.55;
   for(let k=-r*3;k<=r*3;k+=pitch){ctx.beginPath();ctx.moveTo(k-r*2+1.05,-r*2);ctx.lineTo(k+r*2+1.05,r*2);ctx.stroke();}
   ctx.restore();
 }
 ctx.strokeStyle='#fcfffe';ctx.globalAlpha=.78;ctx.lineWidth=compact?.58:.75;
 ctx.beginPath();ctx.arc(0,0,ro-.45,-Math.PI*.95,Math.PI*.15);ctx.stroke();
 ctx.strokeStyle='#5e8793';ctx.globalAlpha=.65;ctx.lineWidth=.65;
 ctx.beginPath();ctx.arc(0,0,ri+.3,Math.PI*.10,Math.PI*.93);ctx.stroke();
 ctx.restore();
}
// The added white halo must never meet the tooth tips. The *outermost* radius is
// normalized to that of the legacy marker (r + 4) at all zoom levels.
function f2c2cHaloGeometry(r,compact){
 const width=F2C2C_FRAME_SETTINGS.haloWidth*(compact?1.35:1.0);
 const toothTip=r+7.25*F2C2C_FRAME_SETTINGS.toothDepth/100+0.6;
 const radius=toothTip+F2C2C_FRAME_SETTINGS.ringGap+width/2;
 const fullOuter=radius+width/2;
 const fit=(r+4)/fullOuter;
 return {width,radius,fullOuter,fit,gap:F2C2C_FRAME_SETTINGS.ringGap};
}
function f2c2cPaintFloatingHalo(ctx,r,compact){
 const h=f2c2cHaloGeometry(r,compact);
 ctx.save();
 ctx.strokeStyle='#f9fffd';
 ctx.globalAlpha=.97;
 ctx.lineWidth=h.width;
 ctx.beginPath();ctx.arc(0,0,h.radius,0,Math.PI*2);ctx.stroke();
 ctx.restore();
}
function f2c2cPaintWing8Badge(ctx,r,variant,nation,compact,finish,halo=true){
 const metal=F2C2C_FRAME_SETTINGS.metal==='steel'?['#d5e2e7','#243947','#eef6f7','#5f7b8c']:
             F2C2C_FRAME_SETTINGS.metal==='bronze'?['#cfaf77','#5a4739','#f0ddae','#8e724a']:
             ['#dce9e9','#213746','#ffffff','#678599'];
 const depthMult = F2C2C_FRAME_SETTINGS.toothDepth/100;
 const isP1 = variant==='w8p1';
 const isP2 = variant==='w8p2';
 const isP3 = variant==='w8p3';
 const isP4 = variant==='w8p4';
 ctx.save();
 ctx.fillStyle='#0b1b28';
 ctx.beginPath();ctx.arc(0,0,r+5.1,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=metal[0]; ctx.strokeStyle=metal[1]; ctx.lineWidth=1.15;
 if(isP4){
   f2c2cRadialLugPath(ctx,r,8,{outerAdd:7.2*depthMult,rootAdd:5.1,bodyInset:4.05,innerHalf:4.15,tipHalf:2.7,pointy:true,shoulder:2.2});
 } else if(isP3){
   f2c2cRadialLugPath(ctx,r,8,{outerAdd:7.4*depthMult,rootAdd:5.0,bodyInset:4.1,innerHalf:3.9,tipHalf:2.2,pointy:true,shoulder:1.15});
 } else if(isP2){
   f2c2cRadialLugPath(ctx,r,8,{outerAdd:7.25*depthMult,rootAdd:5.2,bodyInset:4.0,innerHalf:4.15,tipHalf:2.9,pointy:true,shoulder:1.55});
 } else {
   f2c2cRadialLugPath(ctx,r,8,{outerAdd:7.1*depthMult,rootAdd:5.15,bodyInset:4.0,innerHalf:4.2,tipHalf:3.35,pointy:true,shoulder:1.85});
 }
 ctx.strokeStyle='#122737';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,r+1.1,0,Math.PI*2);ctx.stroke();
 ctx.strokeStyle=nation;ctx.lineWidth=3.8;ctx.beginPath();ctx.arc(0,0,r+1.1,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle='#10293d';ctx.beginPath();ctx.arc(0,0,r-5.05,0,Math.PI*2);ctx.fill();
 f2c2cPaintPlatinumJadeBand(ctx,r,compact,finish);
 if(halo)f2c2cPaintFloatingHalo(ctx,r,compact);
 if(isP4){
   ctx.strokeStyle=metal[3];ctx.lineWidth=0.9;
   for(let i=0;i<8;i++){
     const ang=-Math.PI/2 + i*(Math.PI/4), rr=r+3.15;
     ctx.beginPath();
     ctx.moveTo(Math.cos(ang)*(rr-1.1),Math.sin(ang)*(rr-1.1));
     ctx.lineTo(Math.cos(ang)*(rr+0.95),Math.sin(ang)*(rr+0.95));
     ctx.stroke();
   }
 }
 ctx.restore();
}

// V11 D: the real selected alternative, not a reconstructed one-line gun.
function f2c2cRifleGlyphD(ctx,compact){
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 const cream='#fff7e7',gold='#efcc91',pale='#d8f6ec',dark='#112839';
 const stroke=(color,width,coords)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(coords[0],coords[1]);for(let i=2;i<coords.length;i+=2)ctx.lineTo(coords[i],coords[i+1]);ctx.stroke();};
 const fillPath=(svg,color)=>{ctx.fillStyle=color;ctx.fill(new Path2D(svg));};
 stroke(dark,9,[15,48,48,21]);
 stroke(cream,6,[15,46,49,20]);
 stroke(pale,2.0,[23,38,47,20]);
 fillPath('M21 39 L9 53 L17 57 L30 44 Z',gold);
 stroke(gold,2.1,[29,34,36,42,43,39]);
 stroke(pale,2.3,[49,20,56,9]);fillPath('M54 11 L58 2 L60 15 Z',cream);
 ctx.restore();
}
function v08bMachineGunGlyph(ctx,compact){
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 const cream='#fff7e7',gold='#efcc91',pale='#d8f6ec';
 const stroke=(color,width,coords)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(coords[0],coords[1]);for(let i=2;i<coords.length;i+=2)ctx.lineTo(coords[i],coords[i+1]);ctx.stroke();};
 const fillPath=(svg,color)=>{ctx.fillStyle=color;ctx.fill(new Path2D(svg));};
 fillPath('M12 20 L28 20 L32 24 L28 28 L12 28 L7 24 L7 22 Z',cream);
 fillPath('M31 20 H53 Q59 20 59 24 Q59 28 53 28 H31 Z',cream);
 stroke(cream,5.2,[31,24,57,24]);
 stroke(pale,1.9,[31,22,50,22]);
 stroke(gold,2.2,[16,32,15,45,20,32,19,43,24,32,23,40]);
 stroke(cream,4.2,[33,29,26,56,34,54,43,56]);
 ctx.restore();
}
// V0.8H A-1R-H: EXACT preview body geometry (36x36), excluding the enclosing badge.
function v08fDrawTankGlyph(ctx){
 ctx.save();ctx.scale(64/36,64/36);ctx.lineJoin='round';ctx.lineCap='round';
 const cache=v08fDrawTankGlyph._paths??(v08fDrawTankGlyph._paths=new Map());
 const path=(d,fill,stroke=null,width=1)=>{let p=cache.get(d);if(!p){p=new Path2D(d);cache.set(d,p);}if(fill){ctx.fillStyle=fill;ctx.fill(p);}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke(p);}};
 // Significantly thickened A-1R-H hull; A-1R ORIGINAL thin tracks unchanged.
 path('M8 19.2h15.1l5.3 4.7-3.7 4.7H7.9l-3.1-4.3z','#fff4dd');
 ctx.globalAlpha=.62;path('M9.4 20.7h14.2l2.25 2.1H7.85z','#f6deaf');ctx.globalAlpha=1;
 ctx.globalAlpha=.8;path('M8.5 23h16.3',null,'#d7caa9',.45);ctx.globalAlpha=1;
 path('M14.1 18.2h5.2l2 2.8h-9.2z','#fff4dd');
 path('M20.2 19.3h9.1',null,'#f5f3e9',2.1);
 path('M8.3 25.2h16.4l-1.4 2.7H9.3z','#334550','#f6deaf',.9);
 path('M12 25.6v1.7m4.7-1.7v1.7m4.7-1.7v1.7',null,'#b9c4c5',1);
 ctx.restore();
}
function f2c2cPaintIndustrialUnit(ctx,cx,cy,r,nationColor,compact,type='rifle_infantry'){
 const iw=compact?27:37,fit=f2c2cHaloGeometry(r,compact).fit;
 ctx.save();ctx.translate(cx,cy);ctx.scale(fit,fit);
 f2c2cPaintWing8Badge(ctx,r,'w8p2',nationColor,compact,'hatch',true);
 ctx.save();ctx.translate(-iw/2,-iw/2);ctx.scale(iw/64,iw/64);
 if(type==='assault_tank')v08fDrawTankGlyph(ctx);
 else if(type==='machine_gunner')v08bMachineGunGlyph(ctx,compact);
 else f2c2cRifleGlyphD(ctx,compact);
 ctx.restore();ctx.restore();
}
// H1E1: first-generation automaton B proposal (eight-lug gear, one cyclopean
// lens, jaw plate). Canvas vectors, no image/font dependency; same round seal
// and screen-size scaling as the infantry marker family.
function v07h1e1DrawMachineEye(ctx,compact){
 ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
 // Normalized 64 x 64 icon space shared by v07cDrawWeaponIcon.
 const cx=32,cy=32,r=22;
 ctx.beginPath();
 for(let i=0;i<16;i++){
  const theta=-Math.PI/2+i*Math.PI/8;
  const rr=i%2===0?r*1.18:r;
  if(i===0)ctx.moveTo(cx+Math.cos(theta)*rr,cy+Math.sin(theta)*rr);
  else ctx.lineTo(cx+Math.cos(theta)*rr,cy+Math.sin(theta)*rr);
 }
 ctx.closePath();ctx.fillStyle='#dce8ed';ctx.strokeStyle='#63879c';ctx.lineWidth=2.2;ctx.fill();ctx.stroke();
 ctx.beginPath();ctx.arc(cx,cy,16,0,Math.PI*2);ctx.fillStyle='#11283a';ctx.fill();
 ctx.strokeStyle='#62859c';ctx.lineWidth=1.3;ctx.stroke();
 ctx.fillStyle='#d0e9f0';ctx.strokeStyle='#5b7d92';ctx.lineWidth=1.8;
 ctx.beginPath();ctx.roundRect(18,20,28,23,7);ctx.fill();ctx.stroke();
 ctx.fillStyle='#102839';ctx.beginPath();ctx.arc(32,30,7.9,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#8ad6ff';ctx.lineWidth=2;ctx.stroke();
 ctx.fillStyle='#8ad6ff';ctx.beginPath();ctx.arc(32,30,3,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#6f96a8';ctx.lineWidth=2.1;
 ctx.beginPath();ctx.moveTo(23,44);ctx.lineTo(28,49);ctx.lineTo(36,49);ctx.lineTo(41,44);ctx.stroke();
 ctx.restore();
}
function v07h1e1DrawMixedBadge(ctx,cx,cy,r,compact){
 const x=cx-r-1,y=cy+r-2,rr=compact?7:8.25;
 ctx.save();ctx.fillStyle='#102535';ctx.strokeStyle='#b8e9ef';ctx.lineWidth=1.35;
 ctx.beginPath();ctx.arc(x,y,rr+1,0,Math.PI*2);ctx.fill();ctx.stroke();
 // Compact physical gear, not a platform-specific emoji glyph.
 ctx.translate(x,y);ctx.beginPath();
 for(let i=0;i<16;i++){
  const a=-Math.PI/2+i*Math.PI/8,rad=i%2?rr*.61:rr*.85;
  if(i===0)ctx.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);
  else ctx.lineTo(Math.cos(a)*rad,Math.sin(a)*rad);
 }
 ctx.closePath();ctx.fillStyle='#e3f0f3';ctx.fill();
 ctx.fillStyle='#17425a';ctx.beginPath();ctx.arc(0,0,rr*.31,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#8edcff';ctx.beginPath();ctx.arc(0,0,rr*.13,0,Math.PI*2);ctx.fill();ctx.restore();
}
function v07h1e1VisualForMarker(armies,group){
 const v=v07cArmyVisual(armies);v.machineCount=group.machineCount||0;
 if((group.amount??v.total)===0&&v.machineCount>0){
  v.type='automaton';v.era='AUTO';
  // Existing army morale and formation XP remain meaningful for machine-only forces.
  const machineArmies=armies.filter(a=>a.hAutomatonGroupIds?.length>0);
  v.morale=machineArmies.length?machineArmies.reduce((n,a)=>n+Math.max(0,Math.min(100,a.morale||0)),0)/machineArmies.length:null;
  v.averageLevel=machineArmies.length?machineArmies.reduce((n,a)=>n+b4aRankIndex(a)+1,0)/machineArmies.length:null;
 }
 return v;
}
function v07cDrawArmySeal(ctx,rect,group,visual,nation,compact=false){
 // B3 emblem, M4 morale bar and the source-designed weapon glyph.
 const cx=rect.x+rect.w/2, cy=rect.y+(compact?23:30),r=compact?15:20;
 ctx.save();
 if(visual.type==='rifle_infantry'||visual.type==='machine_gunner'){
  // Approved P8-B/H 8-point steel lugs, platinum-jade hatch and floating H8-2 halo.
  // The fit is on the badge ONLY; gauges, counts and labels retain game anchors.
  f2c2cPaintIndustrialUnit(ctx,cx,cy,r,nation.color,compact,visual.type);
 }else{
  ctx.fillStyle=nation.color;ctx.globalAlpha=.16;
  ctx.beginPath();ctx.arc(cx,cy,r+3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  ctx.lineWidth=compact?3:4;ctx.strokeStyle=nation.color;
  ctx.beginPath();ctx.arc(cx,cy,r+2,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#10293d';ctx.beginPath();ctx.arc(cx,cy,r-3,0,Math.PI*2);ctx.fill();
  ctx.lineWidth=1.6;ctx.strokeStyle='#f7f8f2';ctx.stroke();
  ctx.strokeStyle='#47738a';ctx.lineWidth=.65;
  ctx.beginPath();ctx.arc(cx,cy,r-6,0,Math.PI*2);ctx.stroke();
  const iconWidth=compact?27:37;
  ctx.save();ctx.translate(cx-iconWidth/2,cy-iconWidth/2);
  ctx.scale(iconWidth/64,iconWidth/64);
  if(visual.type==='automaton')v07h1e1DrawMachineEye(ctx,compact);
  else v07cDrawWeaponIcon(ctx,visual.type,compact);
  ctx.restore();
 }
 // M4 right-hand morale bar. Color communicates state, fill height reflects exact morale.
 const bx=cx+r+5,by=cy-r*.83,bh=r*1.75,bw=compact?5:6;
 ctx.fillStyle='#203d50';ctx.strokeStyle='#7f9baf';ctx.lineWidth=.9;
 ctx.beginPath();ctx.roundRect(bx,by,bw,bh,2.5);ctx.fill();ctx.stroke();
 if(visual.morale!==null){const fill=Math.max(0,Math.min(bh,bh*visual.morale/100));
  ctx.fillStyle=v07cMoraleColor(visual.morale);
  if(fill>0){ctx.beginPath();ctx.roundRect(bx+1,by+bh-fill,bw-2,fill,Math.min(1,fill/2));ctx.fill();}
 }
 if(!compact){
  ctx.fillStyle='#12354d';ctx.strokeStyle='#55839a';ctx.lineWidth=1.1;
  ctx.beginPath();ctx.roundRect(cx-r-7,cy-r-10,31,15,4);ctx.fill();ctx.stroke();
  ctx.fillStyle='#f2f7ff';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='800 9px system-ui,sans-serif';ctx.fillText(visual.era,cx-r+8.5,cy-r-2.5);
 }
 // B-style 1-decimal troop-weighted formation level replaces ubiquitous commander star.
 if(visual.averageLevel!==null){
  const sx=cx+r-1,sy=cy-r-5,label=visual.averageLevel.toFixed(1);
  ctx.fillStyle='#0e283b';ctx.strokeStyle='#edc979';ctx.lineWidth=1.25;
  ctx.beginPath();ctx.roundRect(sx-13,sy-8,27,16,5);ctx.fill();ctx.stroke();
  ctx.font='800 10px system-ui,sans-serif';ctx.fillStyle='#ffedbe';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,sx+.5,sy+.2);
 }
 if(visual.machineCount>0&&visual.total>0)v07h1e1DrawMixedBadge(ctx,cx,cy,r,compact);
 if(visual.engaged)v07d1DrawEngagedRing(ctx,cx,cy,r);
 const armies=group.members.reduce((n,m)=>n+m.armyGroups.length,0);
 const men=group.amount>=1000?(group.amount/1000).toFixed(1)+'k':String(group.amount);
 const machines=group.machineCount||0;
 const text=(machines?(group.amount?men+' · ⚙'+machines:'⚙'+machines):men)+(armies>1?' ×'+armies:'');
 ctx.font='700 10px system-ui,sans-serif';const tw=ctx.measureText(text).width+10;
 ctx.fillStyle='#0a2337';ctx.strokeStyle='#5d879f';ctx.lineWidth=.9;
 ctx.beginPath();ctx.roundRect(cx-tw/2,cy+r+3,tw,15,5);ctx.fill();ctx.stroke();
 ctx.fillStyle='#f8fbff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,cx,cy+r+10.3);
 ctx.restore();
}


// --- V0.7F1A · B2 절삭 브래킷 · render-only module ---
const F1A_INDUSTRY_PALETTE={
 coal:{main:'#f3f9ff',light:'#ffffff',fill:'rgba(13,31,47,.35)'},
 power:{main:'#ffcd51',light:'#fff4b5',fill:'rgba(250,148,28,.28)'},
 idle:{main:'#8d959e',light:'#d0d5da',fill:'rgba(35,46,55,.23)'}
};
let f1aVisuals={enabled:true,coal:true,power:true,steamOnly:true,glyph:true};
const f1aIndustryOverlayCache=new WeakMap();
function f1aIndustryTileSnapshot(world){
 const prev=f1aIndustryOverlayCache.get(world);
 if(prev?.seq===world.changeSeq&&prev?.day===world.dayIndex)return prev.sites;
 const sites=new Map(),quarter=Math.floor(world.dayIndex/30)*30;
 for(const b of world.buildings||[]){
   if(!Number.isInteger(b.tileId)||!world.tiles[b.tileId]||b.status==='DESTROYED'||b.status==='DEMOLISHED')continue;
   let kind=null,operating=false;
   if(b.typeId==='coal_pit'){
     kind='coal';operating=b.status==='ACTIVE'&&!b.disconnected&&b.lastCoalMinedDay===quarter;
   }else if(b.typeId==='workshop'||b.typeId==='factory'){
     const p=b.powerDevices||{};
     if(!p.steam&&(!p.mechanical&&!p.waterwheel||f1aVisuals.steamOnly))continue;
     kind='power';operating=b.status==='ACTIVE'&&!b.disconnected&&b.lastPower?.dayIndex===quarter&&
       (b.typeId==='factory'?b.lastPower?.supplied>0:(p.steam?b.lastPower?.source==='STEAM':b.lastPower?.source==='MECHANICAL'||b.lastPower?.source==='WATERWHEEL'));
   }else continue;
   const f=sites.get(b.tileId)||{coal:false,power:false,coalOperating:false,powerOperating:false};
   f[kind]=true;f[kind+'Operating'] ||= operating;sites.set(b.tileId,f);
 }
 f1aIndustryOverlayCache.set(world,{seq:world.changeSeq,day:world.dayIndex,sites});
 return sites;
}
function f1aB2CoalGlyph(c,x,y,s){
 c.save();c.translate(x,y);c.scale(s/20,s/20);c.lineJoin='round';c.fillStyle='#152531';c.strokeStyle='#d0d8d8';c.lineWidth=.9;
 c.beginPath();c.moveTo(2,15);c.lineTo(5,6);c.lineTo(9,5);c.lineTo(11,10);c.lineTo(16,7);c.lineTo(19,15);c.lineTo(16,18);c.lineTo(4,18);c.closePath();c.fill();c.stroke();
 c.strokeStyle='#7b929a';c.lineWidth=.8;c.beginPath();c.moveTo(6,10);c.lineTo(10,12);c.lineTo(14,10);c.stroke();c.restore();
}
function f1aB2BoltGlyph(c,x,y,s,off){
 c.save();c.translate(x,y);c.scale(s/20,s/20);c.fillStyle=off?'#c6c3bf':'#fff0b4';c.strokeStyle=off?'#62686c':'#8b5727';c.lineWidth=.5;
 c.beginPath();c.moveTo(11,1);c.lineTo(3,11);c.lineTo(9,11);c.lineTo(7,19);c.lineTo(17,9);c.lineTo(11,9);c.closePath();c.fill();c.stroke();c.restore();
}
function f1aB2Corner(c,px,py,dx,dy,s,palette,thick){
 const seg=s*.215,bend=s*.069;
 c.lineJoin='bevel';c.lineCap='square';c.strokeStyle=palette.main;c.lineWidth=thick;c.globalAlpha=.93;
 c.beginPath();c.moveTo(px+dx*seg,py);c.lineTo(px+dx*bend,py);c.lineTo(px,py+dy*bend);c.lineTo(px,py+dy*seg);c.stroke();
 c.fillStyle=palette.light;c.beginPath();c.arc(px+dx*(bend+Math.min(2,s*.055)),py+dy*(bend+Math.min(2,s*.055)),Math.max(.55,s*.017),0,Math.PI*2);c.fill();c.globalAlpha=1;
}
function f1aB2PaintTile(c,x,y,s,flags){
 const hasCoal=flags.coal&&f1aVisuals.coal,hasPower=flags.power&&f1aVisuals.power;
 if(!hasCoal&&!hasPower||s<5)return;
 // Hard clip: no bracket/glyph/shine may escape one tile, including at high zoom.
 c.save();c.beginPath();c.rect(x+.1,y+.1,s-.2,s-.2);c.clip();
 const coalOff=hasCoal&&!flags.coalOperating,powerOff=hasPower&&!flags.powerOperating;
 const gap=Math.max(1.8,s*.07),left=x+gap,right=x+s-gap,top=y+gap,bottom=y+s-gap;
 const thick=Math.max(1.35,s*.085);
 c.fillStyle=hasCoal&&hasPower?'rgba(23,39,42,.075)':hasPower?(powerOff?F1A_INDUSTRY_PALETTE.idle.fill:F1A_INDUSTRY_PALETTE.power.fill):coalOff?F1A_INDUSTRY_PALETTE.idle.fill:F1A_INDUSTRY_PALETTE.coal.fill;
 c.fillRect(left,top,right-left,bottom-top);
 for(const side of [0,1])for(const vertical of [0,1]){
   const off=hasCoal&&hasPower?(side?powerOff:coalOff):hasCoal?coalOff:powerOff;
   const type=hasCoal&&hasPower?(side?'power':'coal'):hasCoal?'coal':'power';
   const p=off?F1A_INDUSTRY_PALETTE.idle:F1A_INDUSTRY_PALETTE[type];
   f1aB2Corner(c,side?right:left,vertical?bottom:top,side?-1:1,vertical?-1:1,s,p,thick);
 }
 if(f1aVisuals.glyph&&s>=14){
   const z=Math.max(8,Math.min(15,s*.30));
   if(hasCoal&&hasPower){f1aB2CoalGlyph(c,x+gap+.5,y+s-gap-z-.5,z);f1aB2BoltGlyph(c,x+s-gap-z-.5,y+s-gap-z-.5,z,powerOff);}
   else if(hasCoal)f1aB2CoalGlyph(c,x+s-gap-z-.65,y+s-gap-z-.55,z);
   else f1aB2BoltGlyph(c,x+s-gap-z-.5,y+s-gap-z-.5,z,powerOff);
 }
 c.restore();
}
function f1aDrawIndustryTileOverlay(ctx,world,scale,ox,oy,cw,ch){
 if(!f1aVisuals.enabled||!world||scale<5)return;
 // Screen-space rendering keeps the approved B2 pixel sizes independent of map transforms.
 const sites=f1aIndustryTileSnapshot(world);
 ctx.save();ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.clip();
 for(const [tid,flags] of sites){
   const tile=world.tiles[tid],x=ox+tile.x*scale,y=oy+tile.y*scale;
   if(x+scale<0||y+scale<0||x>cw||y>ch)continue;
   f1aB2PaintTile(ctx,x,y,scale,flags);
 }
 ctx.restore();
}
// --- end F1A B2 module ---


// F2C A: left-side Arsenal rail, render-only, drawn after the approved B2 industry brackets.
const f2cArsenalOverlayCache=new WeakMap();
function f2cDrawArsenalTileOverlay(ctx,world,scale,ox,oy,cw,ch){
 if(!world||scale<12)return;
 let entry=f2cArsenalOverlayCache.get(world);
 if(!entry||entry.seq!==world.changeSeq||entry.day!==world.dayIndex){
  const sites=new Map();
  for(const b of world.buildings){if(b.typeId!=='arsenal'||!world.tiles[b.tileId])continue;
   sites.set(b.tileId,(sites.get(b.tileId)||false)||(b.status==='ACTIVE'&&!b.disconnected));}
  entry={seq:world.changeSeq,day:world.dayIndex,sites};f2cArsenalOverlayCache.set(world,entry);
 }
 ctx.save();ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.clip();
 for(const [id,active] of entry.sites){const t=world.tiles[id],x=ox+t.x*scale,y=oy+t.y*scale;
  if(x+scale<0||y+scale<0||x>cw||y>ch)continue;
  const px=x+scale*.145,top=y+scale*.26,bot=y+scale*.73,hook=scale*.10;
  ctx.save();ctx.beginPath();ctx.rect(x+.1,y+.1,scale-.2,scale-.2);ctx.clip();
  ctx.strokeStyle='rgba(29,21,33,.65)';ctx.lineWidth=Math.max(1.5,scale*.10);ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(px+hook,top);ctx.lineTo(px,top);ctx.lineTo(px,bot);ctx.lineTo(px+hook,bot);ctx.stroke();
  ctx.strokeStyle=active?'#e887a5':'#9a969e';ctx.lineWidth=Math.max(1.1,scale*.043);
  ctx.beginPath();ctx.moveTo(px+hook,top);ctx.lineTo(px,top);ctx.lineTo(px,bot);ctx.lineTo(px+hook,bot);ctx.stroke();
  ctx.fillStyle=active?'#ffe0df':'#c7c1c9';
  for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(px+scale*.035,top+(i+.5)*(bot-top)/3,Math.max(.65,scale*.022),0,Math.PI*2);ctx.fill();}
  ctx.restore();
 }
 ctx.restore();
}
class MapRenderer {
  constructor(canvas,{onSelect,onHover}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    this.onSelect=onSelect;this.onHover=onHover;
    this.world=null;this.selectedId=null;this.focusArmyId=null;this.mode='political';this.showBorders=true;this.showDiplomaticBorders=true;this.borderOverlayCache=null;this.showRoads=true;this.showRivers=true;this.riverPreviewSegments=null;this.armyLabelMode='auto';this.buildingLabelMode='auto';this.settlementLabelMode='auto';this.defenseLabelMode='network';this.fortGraphCache=null;this.zoom=1;this.detailDismissedFor=null;
    this.offset={x:0,y:0};this.width=0;this.height=0;this.scale=1;this.originX=0;this.originY=0;
    // F3G1: renderer-private caches; nothing persists in saves or advances the SIM RNG.
    this.frameHandle=null;this.visualCache=null;this.d2CultureCache=null;this.cultureDisplay="dominant";this.d1bSocialCache=null;this.socialDisplay="overall";this.fortDetailKey=null;this.fortDetailShown=false;
    this.fortAverageCache=null;this.staticAtlasCache=null;this.labelCache=null;this.staticAtlasStats={builds:0,hits:0,skipped:0};
    this.pointers=new Map();this.drag=null;this.pinch=null;this.hoverId=null;this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown',e=>this.pointerDown(e));
    canvas.addEventListener('pointermove',e=>this.pointerMove(e));
    canvas.addEventListener('pointerup',e=>this.pointerUp(e));
    canvas.addEventListener('pointercancel',e=>this.pointerUp(e));
    canvas.addEventListener('wheel',e=>{e.preventDefault();const p=this.point(e);this.zoomAt(e.deltaY>0?1/1.13:1.13,p.x,p.y);},{passive:false});
    canvas.addEventListener('dblclick',e=>{e.preventDefault();const p=this.point(e);this.zoomAt(1.28,p.x,p.y);});
  }
  setWorld(world){this.world=world;this.d2aOverlayCache=null;this.d2CultureCache=null;this.d1bSocialCache=null;this.fortGraphCache=null;this.borderOverlayCache=null;this.visualCache=null;this.fortDetailKey=null;this.fortAverageCache=null;this.staticAtlasCache=null;this.labelCache=null;this.detailDismissedFor=null;this.zoom=1;this.offset={x:0,y:0};this.selectedId=world.nations[0].capitalId;this.focusArmyId=null;this.closeArmyCluster();this.draw();}
  // F3G1 P0: coalesce high-frequency pointer/pinch/wheel events to one draw per frame.
  requestDraw(){
    if(this.frameHandle!==null)return;
    this.frameHandle=requestAnimationFrame(()=>{this.frameHandle=null;this.draw();});
  }
  // Manual invalidation is safe for editor/synthetic direct world mutations without changeSeq.
  invalidateVisualCache(){this.d2aOverlayCache=null;this.d1bSocialCache=null;this.d2CultureCache=null;this.visualCache=null;this.fortAverageCache=null;this.fortDetailKey=null;this.staticAtlasCache=null;}
  // F3G1 P2: build groups and derived army strengths once per world revision.
  getVisualData(){
    const w=this.world,previous=this.visualCache;
    if(previous&&previous.world===w&&previous.day===w.dayIndex&&previous.seq===w.changeSeq&&
       previous.buildingCount===w.buildings.length&&previous.armyCount===w.armies.length)return previous;
    const buildingsByTile=new Map();
    for(const b of w.buildings){
      let group=buildingsByTile.get(b.tileId);
      if(!group){group=[];buildingsByTile.set(b.tileId,group);}
      group.push(b);
    }
    const buildingBadges=new Map();
    for(const [id,group] of buildingsByTile){
      buildingBadges.set(id,{
        compact:group.length+' ▣',
        detail:group.slice(0,2).map(b=>BUILDINGS[b.typeId]?.symbol||'?').join(''),
        unfinished:group.some(b=>b.status!=='ACTIVE')
      });
    }
    // H1E1: index machine groups once per map revision. Human population/units
    // remain untouched; disabled machines still have a physical map presence.
    const armyById=new Map(w.armies.map(a=>[a.id,a]));
    const machinesByArmy=new Map();
    for(const g of w.hAutomaton?.groups||[]){
      const owner=armyById.get(g.armyId);
      if(!owner||!owner.hAutomatonGroupIds?.includes(g.id))continue;
      const count=(g.ready||0)+(g.damaged||0)+(g.disabled||0);
      if(count>0)machinesByArmy.set(owner.id,(machinesByArmy.get(owner.id)||0)+count);
    }
    const armiesByTile=new Map();
    for(const army of w.armies){
      let byNation=armiesByTile.get(army.tileId);
      if(!byNation){byNation=new Map();armiesByTile.set(army.tileId,byNation);}
      let item=byNation.get(army.nationId);
      if(!item){item={nationId:army.nationId,armies:[],amount:0,machineCount:0,strength:0,weightedXP:0,types:{},allSailing:true,soonestArrival:Infinity};byNation.set(army.nationId,item);}
      item.armies.push(army);item.amount+=manpower(army);
      item.machineCount+=machinesByArmy.get(army.id)||0;
      item.strength+=getArmyBasePower(w,army);
      item.weightedXP+=(army.formationExperience?.xp||0)*manpower(army);
      for(const u of army.units){if(u.manpower>0)item.types[u.typeId]=(item.types[u.typeId]||0)+u.manpower;}
      item.allSailing&&=army.status==='SAILING';
      item.soonestArrival=Math.min(item.soonestArrival,army.seaTransit?.arrivalDay??w.dayIndex);
    }
    const armyBadges=new Map();
    for(const [id,byNation] of armiesByTile)armyBadges.set(id,[...byNation.values()].sort((a,b)=>a.nationId-b.nationId));
    const next={world:w,day:w.dayIndex,seq:w.changeSeq,buildingCount:w.buildings.length,
      armyCount:w.armies.length,buildingBadges,armyBadges};
    this.visualCache=next;return next;
  }
  // F3G1 P1: the average is camera-invariant and need not be recomputed while panning.
  getFortAverage(){
    const w=this.world,signature=this.fortGraphCache?.hash??0,c=this.fortAverageCache;
    if(c&&c.world===w&&c.seq===w.changeSeq&&c.day===w.dayIndex&&c.signature===signature)return c.value;
    const value=fortressWorldAverages(w);
    this.fortAverageCache={world:w,seq:w.changeSeq,day:w.dayIndex,signature,value};
    return value;
  }
  getFortGraph(){
    const w=this.world;if(!w)return {nodes:[],solid:[],dashed:[]};
    const cache=this.fortGraphCache;
    // HP can change independently of ownership; keep the displayed network in sync.
    // Check a cheap fortress-only signature even if changeSeq has not changed.
    let fortState=2166136261;
    for(const d of w.defenses||[]){
      fortState=Math.imul(fortState^((d.tileId+1)*17+(d.hp>0?1:0)+(d.level||0)*8+(d.status==='ACTIVE'?256:d.status==='UPGRADING'?512:0)),16777619)>>>0;
    }
    if(cache&&cache.world===w&&cache.changeSeq===w.changeSeq&&cache.fortState===fortState)return cache.graph;
    // Distinguish ordinary SIM changes from changes to fortifications / land ownership.
    // No BFS is rerun if just population, gold or army positions changed.
    let h=2166136261;
    for(const t of w.tiles){h=Math.imul(h^((t.ownerId??-1)+3),16777619)>>>0;h=Math.imul(h^((t.occupiedBy??-1)+3),16777619)>>>0;}
    for(const d of w.defenses||[]){
      h=Math.imul(h^(d.tileId+1),16777619)>>>0;
      h=Math.imul(h^((d.level||0)+((d.status==='ACTIVE'?1:d.status==='UPGRADING'?2:d.status==='CONSTRUCTING'?3:0)<<8)+(d.hp>0?4096:0)),16777619)>>>0;
    }
    const graph=cache&&cache.world===w&&cache.hash===h?cache.graph:buildFortificationNetwork(w);
    this.fortGraphCache={world:w,changeSeq:w.changeSeq,fortState,hash:h,graph};
    return graph;
  }
  getDiplomaticBorderSegments(){
    const w=this.world,cache=this.borderOverlayCache;
    if(cache&&cache.world===w&&cache.changeSeq===w.changeSeq)return cache.segments;
    let h=2166136261;
    for(const t of w.tiles)h=Math.imul(h^((t.ownerId??-1)+3),16777619)>>>0;
    const segments=cache&&cache.world===w&&cache.hash===h?cache.segments:buildDiplomaticBorderSegments(w);
    this.borderOverlayCache={world:w,changeSeq:w.changeSeq,hash:h,segments};
    return segments;
  }
  drawDiplomaticBorders(ctx,scale,bounds=null){
    if(!this.showBorders||!this.showDiplomaticBorders)return;
    const kinds=diplomaticBorderRelations(this.world),directions=diplomaticBorderDirections(this.world);
    const segments=this.getDiplomaticBorderSegments();
    const visible=segments.filter(([x1,y1,x2,y2])=>!bounds||
      !(Math.max(x1,x2)<bounds.x0-1||Math.min(x1,x2)>bounds.x1+1||
        Math.max(y1,y2)<bounds.y0-1||Math.min(y1,y2)>bounds.y1+1));
    const colors={war:'#E4A0A4',subject:'#D6C1FA',alliance:'#93D5AC',truce:'#DEE3E5'};
    ctx.save();ctx.lineCap='butt';ctx.lineJoin='miter';
    for(const kind of ['truce','alliance','subject','war']){
      const lines=visible.filter(([, , , ,a,b])=>kinds.get(pairKey(a,b))===kind);
      if(!lines.length)continue;
      ctx.beginPath();
      for(const [x1,y1,x2,y2] of lines){ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);}
      ctx.strokeStyle='rgba(9,22,30,.85)';ctx.lineWidth=Math.max(.088,3.04/scale);ctx.stroke();
      ctx.strokeStyle=colors[kind];ctx.globalAlpha=.93;
      ctx.lineWidth=Math.max(.06,(kind==='war'?2.4:kind==='subject'?2.2:1.8)/scale);ctx.stroke();ctx.globalAlpha=1;
      if(kind==='subject'){
        // A parallel dashed line on the SUBJECT side makes the border asymmetric,
        // even when arrows are suppressed at low zoom.
        const offset=Math.min(.12,1.55/scale);
        ctx.beginPath();
        for(const [x1,y1,x2,y2,a,b] of lines){
          const dir=directions.get(pairKey(a,b));if(!dir||dir.kind!=='subject')continue;
          const orientation=dir.from===a?-1:1;
          const ox=x1===x2?orientation*offset:0,oy=y1===y2?orientation*offset:0;
          ctx.moveTo(x1+ox,y1+oy);ctx.lineTo(x2+ox,y2+oy);
        }
        ctx.setLineDash([Math.max(.08,4.2/scale),Math.max(.06,3/scale)]);
        ctx.strokeStyle='#9674C7';ctx.lineWidth=Math.max(.043,1.28/scale);ctx.stroke();ctx.setLineDash([]);
      }
    }
    // A bounded number of directional triangle markers per national frontier.
    // Avoid unreadable glyphs or overdraw at overview/mobile scale.
    if(scale>=14){
      const directionalGroups=new Map();
      for(const seg of visible){
        const key=pairKey(seg[4],seg[5]),kind=kinds.get(key),dir=directions.get(key);
        if((kind!=='war'&&kind!=='subject')||!dir||dir.kind!==kind)continue;
        if(!directionalGroups.has(key))directionalGroups.set(key,[]);
        directionalGroups.get(key).push(seg);
      }
      const spacing=scale>=32?4:scale>=22?5:7;
      const radius=Math.min(.32,Math.max(.19,5.1/scale));
      for(const group of directionalGroups.values()){
        const stride=group.length>2?spacing:group.length;
        const marks=[];
        if(group.length<=stride)marks.push(group[Math.floor(group.length/2)]);
        else for(let i=Math.floor(stride/2);i<group.length;i+=stride)marks.push(group[i]);
        for(const [x1,y1,x2,y2,a,b] of marks){
          const dir=directions.get(pairKey(a,b));
          // Segment a is left (vertical) or upper (horizontal); b is opposite.
          const sign=dir.from===a?1:-1,ux=x1===x2?sign:0,uy=y1===y2?sign:0;
          const tx=-uy,ty=ux,cx=(x1+x2)/2,cy=(y1+y2)/2;
          ctx.beginPath();
          ctx.moveTo(cx+ux*radius*.82,cy+uy*radius*.82);
          ctx.lineTo(cx-ux*radius*.65+tx*radius*.58,cy-uy*radius*.65+ty*radius*.58);
          ctx.lineTo(cx-ux*radius*.65-tx*radius*.58,cy-uy*radius*.65-ty*radius*.58);
          ctx.closePath();
          ctx.fillStyle=dir.kind==='war'?'#FFE0E0':'#EEE0FF';ctx.fill();
          ctx.strokeStyle=dir.kind==='war'?'#934B59':'#53436E';
          ctx.lineWidth=Math.max(.033,.95/scale);ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  drawFortNetwork(ctx,ts,scale){
    if(this.defenseLabelMode!=='network')return;
    const {solid,dashed}=this.getFortGraph();
    if(!solid.length&&!dashed.length)return;
    const visible=this.currentVisibleBounds;
    const lineVisible=(a,b)=>!visible||(
      Math.max(ts[a].x,ts[b].x)>=visible.x0-1&&Math.min(ts[a].x,ts[b].x)<=visible.x1+1&&
      Math.max(ts[a].y,ts[b].y)>=visible.y0-1&&Math.min(ts[a].y,ts[b].y)<=visible.y1+1);
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    // E1C1: quieter ochre defensive network; deliberately distinct from thin roads.
    ctx.strokeStyle='rgba(54,43,26,.66)';ctx.lineWidth=Math.max(.12,5.4/scale);
    ctx.beginPath();for(const [a,b] of solid){if(!lineVisible(a,b))continue;ctx.moveTo(ts[a].x+.5,ts[a].y+.5);ctx.lineTo(ts[b].x+.5,ts[b].y+.5);}ctx.stroke();
    ctx.strokeStyle='rgba(217,189,119,.84)';ctx.lineWidth=Math.max(.08,3.2/scale);
    ctx.beginPath();for(const [a,b] of solid){if(!lineVisible(a,b))continue;ctx.moveTo(ts[a].x+.5,ts[a].y+.5);ctx.lineTo(ts[b].x+.5,ts[b].y+.5);}ctx.stroke();
    ctx.setLineDash([Math.max(.16,3.8/scale),Math.max(.19,4.2/scale)]);
    ctx.strokeStyle='rgba(232,211,155,.72)';ctx.lineWidth=Math.max(.065,2.3/scale);
    ctx.beginPath();for(const path of dashed){path.forEach((id,k)=>{if(k===0)ctx.moveTo(ts[id].x+.5,ts[id].y+.5);else ctx.lineTo(ts[id].x+.5,ts[id].y+.5);});}ctx.stroke();
    ctx.restore();
  }
  drawFortMarkers(ctx,ts,scale,originX,originY,w,h){
    if(this.defenseLabelMode==='off')return;
    const coreTiles=new Set(this.world.settlements.map(s=>s.coreTileId));
    const {nodes}=this.getFortGraph();
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
    for(const n of nodes){
      // B4C: minor forts remain on the tactical layer when closely zoomed or explicitly requested.
      if(this.defenseLabelMode==='network'&&this.zoom<2.30&&n.level<2&&n.id!==this.selectedId)continue;
      const t=ts[n.id],core=coreTiles.has(n.id);
      const px=originX+(t.x+(core?.82:.5))*scale,py=originY+(t.y+(core?.20:.5))*scale;
      if(px<-18||py<-18||px>w+18||py>h+18)continue;
      const radius=Math.max(3.7,Math.min(8.5,scale*(core?.24:.30)));
      ctx.save();ctx.translate(px,py);ctx.globalAlpha=n.hp<=0?.48:n.status==='CONSTRUCTING'?.43:1;
      const ruined=n.hp<=0,taken=n.occupied,outline=ruined?'#7a8180':taken?'#e8a48b':n.level>=3?'#e3d2a5':'#cdb477';
      const dark='#302c22';
      if(n.level>=3){ctx.strokeStyle=outline;ctx.lineWidth=1.15;ctx.strokeRect(-radius-2,-radius-2,2*radius+4,2*radius+4);}
      // Pixel-like battlements are visibly a castle at any zoom, never a plain dot.
      ctx.fillStyle=dark;ctx.strokeStyle=outline;ctx.lineWidth=radius<5?1:1.35;
      ctx.beginPath();
      ctx.moveTo(-radius,-radius*.35);ctx.lineTo(-radius,-radius*.9);
      ctx.lineTo(-radius*.56,-radius*.9);ctx.lineTo(-radius*.56,-radius*.53);
      ctx.lineTo(-radius*.20,-radius*.53);ctx.lineTo(-radius*.20,-radius);
      ctx.lineTo(radius*.20,-radius);ctx.lineTo(radius*.20,-radius*.53);
      ctx.lineTo(radius*.56,-radius*.53);ctx.lineTo(radius*.56,-radius*.9);
      ctx.lineTo(radius,-radius*.9);ctx.lineTo(radius,radius);
      ctx.lineTo(-radius,radius);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle=n.level>=2?'#e1cea0':'#cbb67f';
      ctx.fillRect(-radius*.60,-radius*.18,radius*.27,radius*.30);
      ctx.fillRect(radius*.32,-radius*.18,radius*.27,radius*.30);
      ctx.fillStyle='#efe2bc';ctx.fillRect(-radius*.21,radius*.22,radius*.42,radius*.77);
      ctx.restore();
    }
    ctx.restore();
  }
  setSelected(id){this.closeArmyCluster();this.selectedId=id;this.focusArmyId=null;this.detailDismissedFor=null;this.fortDetailKey=null;this.draw();}
  focusArmy(id){this.focusArmyId=id;this.requestDraw();}
  drawC6ArmyObjective(ctx,scale,ox,oy){
    if(this.focusArmyId===null)return;
    const w=this.world,a=w?.armies.find(v=>v.id===this.focusArmyId);
    if(!a)return;
    const targetId=a.order?.targetTileId??a.operation?.targetTileId;
    const from=w.tiles[a.tileId],to=w.tiles[targetId];if(!from||!to||from.id===to.id)return;
    const ax=ox+(from.x+.5)*scale,ay=oy+(from.y+.5)*scale,
      bx=ox+(to.x+.5)*scale,by=oy+(to.y+.5)*scale;
    ctx.save();ctx.beginPath();ctx.rect(0,0,this.width,this.height);ctx.clip();
    ctx.setLineDash([6,5]);ctx.lineWidth=2.5;ctx.strokeStyle='#f7d68d';
    ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#0f2530';ctx.strokeStyle='#f7d68d';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(ax,ay,5,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.arc(bx,by,7,0,Math.PI*2);ctx.stroke();
    ctx.restore();
  }
  dismissSelectedFortress(){this.detailDismissedFor=this.selectedId;this.updateDefensePopover();}
  setMode(mode){this.mode=['terrain','political','era','independence','culture','social'].includes(mode)?mode:'political';this.staticAtlasCache=null;this.draw();}
  setCultureDisplay(mode){this.cultureDisplay=mode==='mix'?'mix':'dominant';if(this.mode==='culture')this.requestDraw();}
  getCultureOverlayData(){
    const w=this.world,cache=this.d2CultureCache;
    if(cache&&cache.world===w&&cache.day===w.dayIndex&&cache.seq===w.changeSeq&&cache.count===w.settlements.length)return cache.markers;
    const lookup=d2CultureLookup(w);
    const markers=w.settlements.map(s=>{
      const stat=d2CultureSummary(s.culturePopulation);
      return {id:s.id,tileId:s.coreTileId,population:stat.population,dominant:stat.dominant,
        color:lookup.get(stat.dominant)?.color||'#9DB9C0',mix:stat.mix};
    }).filter(x=>x.population>0).sort((a,b)=>b.population-a.population||a.id-b.id);
    this.d2CultureCache={world:w,day:w.dayIndex,seq:w.changeSeq,count:w.settlements.length,markers};return markers;
  }
  setSocialDisplay(mode){this.socialDisplay=D1B_SOCIAL_VIEWS.includes(mode)?mode:'overall';this.d1bSocialCache=null;if(this.mode==='social')this.requestDraw();}
  getSocialOverlayData(){
    const w=this.world,cache=this.d1bSocialCache;
    if(cache&&cache.world===w&&cache.day===w.dayIndex&&cache.seq===w.changeSeq&&cache.mode===this.socialDisplay&&cache.count===w.settlements.length)return cache.markers;
    const markers=w.settlements.map(s=>({id:s.id,tileId:s.coreTileId,population:s.population,
      score:d1bSummary(w,[s],this.socialDisplay).selected})).filter(m=>m.population>0).sort((a,b)=>b.population-a.population||a.id-b.id);
    this.d1bSocialCache={world:w,day:w.dayIndex,seq:w.changeSeq,count:w.settlements.length,mode:this.socialDisplay,markers};
    return markers;
  }
  drawSocialOverlay(ctx,scale,ox,oy,cw,ch){
    if(this.mode!=='social')return;
    const w=this.world,markers=this.getSocialOverlayData(),small=scale<22,occupied=new Set();
    ctx.save();ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.clip();
    for(const m of markers){
      const t=w.tiles[m.tileId];if(!t)continue;
      const px=ox+(t.x+(small?.5:.76))*scale,py=oy+(t.y+(small?.5:.23))*scale;
      if(px< -15||px>cw+15||py< -15||py>ch+15)continue;
      if(small){const key=Math.floor(px/12)+':'+Math.floor(py/12);if(occupied.has(key))continue;occupied.add(key);}
      const r=small?Math.max(2.8,Math.min(5,scale*.34)):Math.max(4.5,Math.min(9,scale*.21));
      const color=blend('#4B9F98','#E36A65',Math.min(1,m.score/750));
      ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fillStyle='rgba(9,25,35,.9)';ctx.fill();
      ctx.beginPath();ctx.arc(px,py,r-.9,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      ctx.strokeStyle=m.tileId===this.selectedId?'#FFF0BA':'#112B37';ctx.lineWidth=m.tileId===this.selectedId?2.2:1.4;ctx.stroke();
      if(!small&&scale>=32){ctx.fillStyle='#11202A';ctx.font='bold 9px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(Math.round(m.score/10)),px,py);}
    }
    ctx.restore();
  }
  /** Screen-space settlement markers: never imply population on every owned tile. */
  drawCultureOverlay(ctx,scale,ox,oy,cw,ch){
    if(this.mode!=='culture')return;
    const w=this.world,markers=this.getCultureOverlayData(),small=scale<22,occupied=new Set();
    ctx.save();ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.clip();
    for(const m of markers){
      const t=w.tiles[m.tileId];if(!t)continue;
      const px=ox+(t.x+(small?.5:.76))*scale,py=oy+(t.y+(small?.5:.23))*scale;
      if(px< -14||px>cw+14||py< -14||py>ch+14)continue;
      if(small){const cell=12,key=Math.floor(px/cell)+':'+Math.floor(py/cell);if(occupied.has(key))continue;occupied.add(key);}
      const r=small?Math.max(2.8,Math.min(5,scale*.34)):Math.max(4.5,Math.min(9,scale*.21));
      const color=this.cultureDisplay==='mix'?blend('#3A8E90','#E4A36E',Math.min(1,m.mix/70)):m.color;
      ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fillStyle='rgba(9,25,35,.88)';ctx.fill();
      ctx.beginPath();ctx.arc(px,py,r-.85,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      ctx.strokeStyle=m.tileId===this.selectedId?'#FFF0BA':'#112B37';ctx.lineWidth=m.tileId===this.selectedId?2.2:1.5;ctx.stroke();
      if(this.cultureDisplay==='dominant'&&m.mix>=2){
        ctx.beginPath();ctx.arc(px,py,r-.9,-Math.PI/2,-Math.PI/2+2*Math.PI*m.mix/100);
        ctx.strokeStyle='#F2D79C';ctx.lineWidth=Math.max(1.5,r*.34);ctx.stroke();
      }
    }
    ctx.restore();
  }
resetView(){this.closeArmyCluster();this.zoom=1;this.offset={x:0,y:0};this.draw();}
  centerOn(id){
    if(!this.world||!this.world.tiles[id])return;
    const t=this.world.tiles[id],scale=this.baseScale()*this.zoom;
    this.offset.x=(this.world.size/2-(t.x+.5))*scale;
    this.offset.y=((this.world.height??this.world.size)/2-(t.y+.5))*scale;
    this.clampPan();this.draw();
  }
  setZoom(z){this.closeArmyCluster();this.zoom=Math.max(MIN_MAP_ZOOM,Math.min(MAX_MAP_ZOOM,z));this.clampPan();this.draw();}
  zoomAt(factor,pX=this.width/2,pY=this.height/2){
    if(!this.world)return;
    const before=this.zoom,next=Math.max(MIN_MAP_ZOOM,Math.min(MAX_MAP_ZOOM,this.zoom*factor));
    if(Math.abs(before-next)<.001)return;
    const {originX,originY,scale}=this.mapGeometry();
    const mapX=(pX-originX)/scale,mapY=(pY-originY)/scale;
    this.zoom=next;this.closeArmyCluster();
    const newScale=this.baseScale()*next;
    const newOriginX=(this.width-this.world.size*newScale)/2;
    const newOriginY=(this.height-(this.world.height??this.world.size)*newScale)/2;
    this.offset.x=pX-newOriginX-mapX*newScale;
    this.offset.y=pY-newOriginY-mapY*newScale;
    this.clampPan();this.requestDraw();
  }
  baseScale(){
    if(!this.world)return 1;
    const mapWidth=this.world.size,mapHeight=this.world.height??this.world.size;
    const fit=Math.min(this.width/mapWidth,this.height/mapHeight);
    const cover=Math.max(this.width/mapWidth,this.height/mapHeight);
    return (document.body.classList.contains('atlas-cover')?cover:fit)*.962;
  }
  clampPan(){
    if(!this.world)return;
    const extentX=this.world.size*this.baseScale()*this.zoom;
    const extentY=(this.world.height??this.world.size)*this.baseScale()*this.zoom;
    const maxX=Math.max(0,(extentX-this.width)/2+this.baseScale()*.6);
    this.offset.x=Math.max(-maxX,Math.min(maxX,this.offset.x));
    if(document.body.classList.contains('atlas-mode')){
      // The canvas covers the viewport, but the north map edge must be exposable
      // BELOW the floating world-time bar (plus a little outside-map margin).
      const bar=document.querySelector('.topbar')?.getBoundingClientRect();
      const tabs=document.querySelector('.bottom-tabs')?.getBoundingClientRect();
      const rect=this.canvas.getBoundingClientRect();
      const tileScale=this.baseScale()*this.zoom;
      const margin=Math.max(12,Math.min(24,tileScale*.25));
      const upper=(bar?bar.bottom-rect.top:0)+margin;
      const lower=(tabs?tabs.top-rect.top:this.height)-margin;
      const available=Math.max(1,lower-upper);
      const centered=(this.height-extentY)/2;
      if(extentY<=available){
        // In whole-map mode, fit between top and bottom floating interfaces.
        this.offset.y=(upper+lower-extentY)/2-centered;
      }else{
        const minOffset=lower-extentY-centered;
        const maxOffset=upper-centered;
        this.offset.y=Math.max(minOffset,Math.min(maxOffset,this.offset.y));
      }
    }else{
      const maxY=Math.max(0,(extentY-this.height)/2+this.baseScale()*.6);
      this.offset.y=Math.max(-maxY,Math.min(maxY,this.offset.y));
    }
  }
  mapGeometry(){
    const scale=this.baseScale()*this.zoom;
    return {scale,originX:(this.width-this.world.size*scale)/2+this.offset.x,originY:(this.height-(this.world.height??this.world.size)*scale)/2+this.offset.y};
  }
  resize(){
    const rect=this.canvas.getBoundingClientRect();
    this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);
    const dpr=Math.min(2.5,window.devicePixelRatio||1);
    const w=Math.round(this.width*dpr),h=Math.round(this.height*dpr);
    if(this.canvas.width!==w)this.canvas.width=w;
    if(this.canvas.height!==h)this.canvas.height=h;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.clampPan();this.draw();
  }
  point(e){const rect=this.canvas.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top};}
  hit(x,y){
    if(!this.world)return null;
    const {scale,originX,originY}=this.mapGeometry();
    const tx=Math.floor((x-originX)/scale),ty=Math.floor((y-originY)/scale);
    return tx>=0&&ty>=0&&tx<this.world.size&&ty<(this.world.height??this.world.size)?ty*this.world.size+tx:null;
  }
  pointerDown(e){
    if(!this.world)return;
    e.preventDefault();this.canvas.setPointerCapture(e.pointerId);
    const p=this.point(e);this.pointers.set(e.pointerId,p);
    if(this.pointers.size===1){this.drag={start:p,original:{...this.offset},moved:false};this.pinch=null;}
    if(this.pointers.size===2){
      const [a,b]=[...this.pointers.values()];
      this.pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:this.zoom,center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
      this.drag=null;
    }
  }
  pointerMove(e){
    if(!this.world)return;
    const p=this.point(e);
    if(!this.pointers.has(e.pointerId)){
      const id=this.hit(p.x,p.y);
      if(id!==this.hoverId){this.hoverId=id;this.onHover?.(id);}
      return;
    }
    this.pointers.set(e.pointerId,p);
    if(this.pointers.size===2&&this.pinch){
      const [a,b]=[...this.pointers.values()],distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
      // pinch center remains stable with both square and wide world maps
      const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const target=this.pinch.zoom*distance/Math.max(1,this.pinch.distance);
      this.zoomAt(target/this.zoom,midpoint.x,midpoint.y);
    }else if(this.drag){
      const dx=p.x-this.drag.start.x,dy=p.y-this.drag.start.y;
      if(Math.hypot(dx,dy)>6){this.drag.moved=true;this.closeArmyCluster();}
      if(this.drag.moved){this.offset.x=this.drag.original.x+dx;this.offset.y=this.drag.original.y+dy;this.clampPan();this.requestDraw();}
    }
  }
  pointerUp(e){
    if(!this.pointers.has(e.pointerId))return;
const p=this.point(e),wasDrag=this.drag;
    this.pointers.delete(e.pointerId);
    if(this.pointers.size===0){
      if(wasDrag&&!wasDrag.moved){
        const battle=(this.battleHitBoxes||[]).slice().reverse().find(g=>p.x>=g.rect.x&&p.x<=g.rect.x+g.rect.w&&p.y>=g.rect.y&&p.y<=g.rect.y+g.rect.h);
        if(battle){this.onSelect?.(battle.battle.tileId);this.openBattleCluster(battle.battle,p);this.drag=null;this.pinch=null;return;}
        const label=(this.armyHitBoxes||[]).slice().reverse().find(g=>p.x>=g.rect.x&&p.x<=g.rect.x+g.rect.w&&p.y>=g.rect.y&&p.y<=g.rect.y+g.rect.h);
        if(label&&(label.group.members.length>1||label.group.members.some(m=>m.armyGroups.length>1))){this.openArmyCluster(label.group,p);}
        else {this.closeArmyCluster();const id=label?label.group.members[0].tid:this.hit(p.x,p.y);if(id!==null){this.onSelect?.(id);if(label){const a=label.group.members.flatMap(m=>m.armyGroups);if(a.length===1)this.focusArmy(a[0].id);}}}
      }
      this.drag=null;this.pinch=null;
    }else{this.drag=null;this.pinch=null;}
  }
  // F3G2 A: tile coordinates of the true viewport (plus a seam-safe margin).
  visibleBounds(originX,originY,scale,w,h,padding=2){
    const size=this.world.size,height=this.world.height??size;
    return {x0:Math.max(0,Math.floor((0-originX)/scale)-padding),
      x1:Math.min(size-1,Math.ceil((w-originX)/scale)+padding),
      y0:Math.max(0,Math.floor((0-originY)/scale)-padding),
      y1:Math.min(height-1,Math.ceil((h-originY)/scale)+padding)};
  }
  visibleTiles(bounds){
    const result=[],tiles=this.world.tiles,width=this.world.size;
    for(let y=bounds.y0;y<=bounds.y1;y++)for(let x=bounds.x0;x<=bounds.x1;x++)result.push(tiles[y*width+x]);
    return result;
  }
  isTileVisible(id,b){
    const x=id%this.world.size,y=Math.floor(id/this.world.size);
    return x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1;
  }
  // F3G2 B/C: fingerprint only the fields the backdrop actually paints.
  // No writes to world, SIM counters or RNG. Catches direct editor changes without changeSeq.
  staticAtlasSignature(){
    const w=this.world;
    let h=2166136261;
    const push=n=>{h=Math.imul(h^(n>>>0),16777619)>>>0;};
    push(Math.floor(w.dayIndex/30)%4);push(this.mode==='political'?1:this.mode==='era'?2:this.mode==='independence'?3:0);
    push(this.showRoads?1:0);push(this.showRivers?1:0);push(this.riverPreviewSegments?.length||0);push(this.showBorders?1:0);push(this.showDiplomaticBorders?1:0);
    const str=v=>{for(let i=0;i<v.length;i++)push(v.charCodeAt(i));push(31);};
    for(const n of w.nations){str(n.color||'');str(n.civilization?.era||'ancient');}
    for(const t of w.tiles){
      push(t.ownerId===null?65535:t.ownerId+1);push(t.occupiedBy===null?65535:t.occupiedBy+1);
      push(t.settlementId===null?65535:t.settlementId+1);push(t.roadLevel||0);str(t.terrain||'');
    }
    if(this.showBorders&&this.showDiplomaticBorders){
      const relations=diplomaticBorderRelations(w);
      const dirs=diplomaticBorderDirections(w);
      for(const [key,val] of [...relations].sort((a,b)=>a[0].localeCompare(b[0]))){
        str(key);str(val);const direction=dirs.get(key);
        if(direction){push(direction.from+1);push(direction.to+1);}
      }
    }
    return h;
  }
  // F3G2 B: viewport-sized overscan bitmap in screen pixels. No global zoom atlas.
  drawStaticAtlas(ctx,scale,originX,originY,w,h){
    const dpr=Math.min(2.5,window.devicePixelRatio||1),margin=w<=600?104:176;
    const cw=w+2*margin,ch=h+2*margin;
    const bw=Math.round(cw*dpr),bh=Math.round(ch*dpr);
    // 28 MB safety cap; large canvases fall back to direct drawing, no accumulation.
    if(bw*bh*4>28*1024*1024||bw<1||bh<1){this.staticAtlasCache=null;this.staticAtlasStats.skipped++;return false;}
    const signature=this.staticAtlasSignature();
    let cache=this.staticAtlasCache;
    const canReuse=cache&&cache.world===this.world&&cache.signature===signature&&
      cache.scale===scale&&cache.bw===bw&&cache.bh===bh&&cache.dpr===dpr&&
      Math.abs(originX-cache.originX)<=margin-2&&Math.abs(originY-cache.originY)<=margin-2;
    if(!canReuse){
      // Reuse the existing bitmap allocation when only the camera or map state changed.
      const canvas=cache&&cache.bw===bw&&cache.bh===bh&&cache.dpr===dpr?cache.canvas:document.createElement('canvas');
      if(canvas.width!==bw)canvas.width=bw;
      if(canvas.height!==bh)canvas.height=bh;
      const c=canvas.getContext('2d',{alpha:true});
      if(!c){this.staticAtlasCache=null;return false;}
      c.setTransform(dpr,0,0,dpr,0,0);
      c.clearRect(0,0,cw,ch);
      // Static ownership/road signature invalidates cached border segments as well.
      this.borderOverlayCache=null;
      const bounds=this.visibleBounds(originX+margin,originY+margin,scale,cw,ch,2);
      c.save();c.beginPath();c.rect(0,0,cw,ch);c.clip();
      c.translate(originX+margin,originY+margin);c.scale(scale,scale);
      this.paintStaticBackground(c,this.visibleTiles(bounds),scale,bounds);
      c.restore();
      cache={canvas,world:this.world,signature,scale,originX,originY,cw,ch,bw,bh,dpr};
      this.staticAtlasCache=cache;this.staticAtlasStats.builds++;
    }else this.staticAtlasStats.hits++;
    const dx=originX-cache.originX,dy=originY-cache.originY;
    // Copy only the visible viewport, not the entire overscan bitmap (critical on high-DPR mobile).
    ctx.drawImage(cache.canvas,(margin-dx)*dpr,(margin-dy)*dpr,w*dpr,h*dpr,0,0,w,h);
    return true;
  }
  paintStaticBackground(ctx,tiles,scale,bounds){
    const world=this.world,ts=world.tiles,size=world.size,height=world.height??size;
    // F3G2: background remains behind every dynamic layer, preserving draw order.
    ctx.lineJoin='round';
    const quarter=Math.floor(world.dayIndex/30)%4;
    for(const t of tiles){
      const x=t.x,y=t.y,tc=TERRAINS[t.terrain];
      let base=tc.color;
      if((this.mode==='political'||this.mode==='independence')&&t.ownerId!==null)base=blend(base,world.nations[t.ownerId].color,.56);
      else if(this.mode==='era'&&t.ownerId!==null)base=blend(base,v04cEraColor(world.nations[t.ownerId]),.82);
      if(quarter===3&&t.terrain!=='water')base=blend(base,'#b8c7c7',.10);
      else if(quarter===2&&t.terrain!=='water')base=blend(base,'#d6a66e',.06);
      const f=(coordRandom(77821,t.x,t.y,1)-.5)*.11;
      ctx.fillStyle=blend(base,f>0?'#ffffff':'#000000',Math.abs(f));
      ctx.fillRect(x,y,1.012,1.012);
      // 절제된 지형 텍스처 (의미가 없는 랜덤 점으로 지도를 어지럽히지 않음)
      const texture=coordRandom(9127,t.x,t.y,3);
      if(t.terrain==='water'){
        ctx.strokeStyle='rgba(158,201,219,.25)';ctx.lineWidth=.045;ctx.beginPath();ctx.moveTo(x+.20,y+.43);ctx.quadraticCurveTo(x+.39,y+.37,x+.58,y+.42);ctx.stroke();
        if(texture>.48){ctx.beginPath();ctx.moveTo(x+.43,y+.72);ctx.lineTo(x+.73,y+.69);ctx.stroke();}
      }else if(t.terrain==='forest'){
        ctx.fillStyle='rgba(27,68,57,.52)';
        ctx.beginPath();ctx.arc(x+.33,y+.48,.14,0,Math.PI*2);ctx.arc(x+.64,y+.35,.18,0,Math.PI*2);ctx.arc(x+.60,y+.65,.14,0,Math.PI*2);ctx.fill();
      }else if(t.terrain==='mountain'){
        ctx.fillStyle='rgba(41,52,60,.55)';ctx.beginPath();ctx.moveTo(x+.14,y+.77);ctx.lineTo(x+.50,y+.20);ctx.lineTo(x+.89,y+.77);ctx.closePath();ctx.fill();
        ctx.strokeStyle='rgba(235,234,217,.52)';ctx.lineWidth=.052;ctx.beginPath();ctx.moveTo(x+.5,y+.2);ctx.lineTo(x+.65,y+.43);ctx.stroke();
      }else if(t.terrain==='rock'){
        ctx.fillStyle='rgba(48,56,63,.36)';ctx.beginPath();ctx.moveTo(x+.24,y+.70);ctx.lineTo(x+.46,y+.33);ctx.lineTo(x+.70,y+.62);ctx.closePath();ctx.fill();
      }else if(texture>.68){
        ctx.fillStyle='rgba(26,65,44,.22)';ctx.fillRect(x+.26,y+.66,.09,.12);ctx.fillRect(x+.63,y+.27,.09,.12);
      }
      // Wartime occupation overlays sovereign ownership rather than changing it.
      if(t.occupiedBy!==null){
        const occupier=world.nations[t.occupiedBy];
        ctx.fillStyle=occupier.color+'77';ctx.fillRect(x+.08,y+.08,.84,.84);
        ctx.strokeStyle=occupier.color;ctx.lineWidth=.11;ctx.strokeRect(x+.09,y+.09,.82,.82);
      }
      // Settlement footprint, distinct from the country's sovereign territory.
      if(t.settlementId!==null){
        ctx.strokeStyle='rgba(248,222,168,.43)';ctx.lineWidth=.034;
        ctx.strokeRect(x+.095,y+.095,.81,.81);
      }
      ctx.strokeStyle='rgba(5,17,21,.12)';ctx.lineWidth=.018;ctx.strokeRect(x+.009,y+.009,.982,.982);
    }
    // Road network is world infrastructure. Draw continuous edges beneath capitals, armies and borders.
    if(this.showRoads){
    ctx.lineCap='round';
    for(const t of tiles){
      if(!(t.roadLevel>0)||t.terrain==='water'||t.ownerId===null)continue;
      const adj=neighbors4(t.id,size,height).filter(id=>{
        const n=ts[id];return n.ownerId===t.ownerId&&n.roadLevel>0;
      });
      const cx=t.x+.5,cy=t.y+.5;
      for(const id of adj){
        if(id<t.id&&ts[id].roadLevel>0)continue;
        const other=ts[id],dx=other.x-t.x,dy=other.y-t.y;
        ctx.strokeStyle='rgba(29,38,37,.82)';ctx.lineWidth=t.roadLevel===2?.15:.12;
        ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+dx,cy+dy);ctx.stroke();
        ctx.strokeStyle=t.roadLevel===2?'#f7e4a7':'#cbb78b';ctx.lineWidth=t.roadLevel===2?.08:.06;
        ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+dx,cy+dy);ctx.stroke();
      }
      ctx.fillStyle=t.roadLevel===2?'#fbe5a7':'#d7c3a0';ctx.beginPath();ctx.arc(cx,cy,.06,0,Math.PI*2);ctx.fill();
    }
    }
    if(this.showBorders){
      ctx.beginPath();ctx.lineWidth=.075;ctx.strokeStyle='#111725';
      for(const t of tiles){
        if(t.ownerId===null)continue;
        const x=t.x,y=t.y,owner=t.ownerId;
        if(x===0||ts[t.id-1].ownerId!==owner){ctx.moveTo(x,y);ctx.lineTo(x,y+1);}
        if(y===0||ts[t.id-size].ownerId!==owner){ctx.moveTo(x,y);ctx.lineTo(x+1,y);}
        if(x===size-1||ts[t.id+1].ownerId!==owner){ctx.moveTo(x+1,y);ctx.lineTo(x+1,y+1);}
        if(y===height-1||ts[t.id+size].ownerId!==owner){ctx.moveTo(x,y+1);ctx.lineTo(x+1,y+1);}
      }
      ctx.stroke();
      this.drawDiplomaticBorders(ctx,scale,bounds);
    }
    this.drawRiversInWorldCoords(ctx,scale,bounds);
  }
  // V0.7A1A: keep the ENTIRE stream centerline exactly on the tile boundary.
  // Group strokes into two global passes to avoid dark seams at confluences.
  // The only rounding is a small, consistent cap/join at a grid vertex.
  drawRiversInWorldCoords(ctx,scale,bounds){
    if(!this.showRivers)return;
    const w=this.world,segments=this.riverPreviewSegments||w.riverSegments||[];
    if(!segments.length)return;
    const byFlow=[[],[],[]];
    for(const seg of segments){
      const a=riverVertex(seg.from,w.size),b=riverVertex(seg.to,w.size);
      if(bounds&&(Math.max(a.x,b.x)<bounds.x0-1||Math.min(a.x,b.x)>bounds.x1+1||Math.max(a.y,b.y)<bounds.y0-1||Math.min(a.y,b.y)>bounds.y1+1))continue;
      byFlow[seg.flow-1].push({a,b});
    }
    const widths=[.09,.14,.20];
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    // Outline every river first; fill every river second. No wiggling or diagonal curves.
    for(let pass=0;pass<2;pass++)for(let flow=0;flow<3;flow++){
      const group=byFlow[flow];if(!group.length)continue;
      ctx.beginPath();
      for(const {a,b} of group){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
      ctx.lineWidth=widths[flow]+(pass===0?.045:0);
      ctx.strokeStyle=pass===0?'#315a6c':(this.riverPreviewSegments?'#91d4e1':'#70b7ce');
      ctx.stroke();
    }
    ctx.restore();
  }
  drawRiverOverlay(ctx,scale,ox,oy,w,h){
    if(!this.showRivers)return;
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();ctx.translate(ox,oy);ctx.scale(scale,scale);
    this.drawRiversInWorldCoords(ctx,scale,null);ctx.restore();
  }

  /** G1: planar territory label candidates, owned-area PCA and footprint containment. */
  getNationLabelPlans(){
    const w=this.world;let sig=2166136261;
    for(const t of w.tiles)sig=Math.imul(sig^((t.ownerId??-1)+2),16777619)>>>0;
    for(const n of w.nations)for(let i=0;i<n.name.length;i++)sig=Math.imul(sig^n.name.charCodeAt(i),16777619)>>>0;
    if(this.labelCache?.world===w&&this.labelCache.sig===sig)return this.labelCache.plans;
    const width=w.size,height=w.height,used=new Uint8Array(w.tiles.length),plans=[];
    for(const nation of w.nations){
      if(!nation.active)continue;
      let largest=[];
      for(const t of w.tiles){
        if(t.ownerId!==nation.id||used[t.id])continue;
        const queue=[t.id];used[t.id]=1;
        for(let h=0;h<queue.length;h++){
          for(const j of neighbors4(queue[h],width,height))if(!used[j]&&w.tiles[j].ownerId===nation.id){used[j]=1;queue.push(j);}
        }
        if(queue.length>largest.length)largest=queue;
      }
      if(largest.length<2)continue;
      const cells=new Set(largest),num=largest.length;
      let cx=0,cy=0;for(const id of largest){cx+=(id%width)+.5;cy+=Math.floor(id/width)+.5;}cx/=num;cy/=num;
      let xx=0,yy=0,xy=0;
      for(const id of largest){const dx=id%width+.5-cx,dy=Math.floor(id/width)+.5-cy;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;}
      let theta=Math.atan2(2*xy,xx-yy)/2;
      if(Math.abs(xx-yy)<num*.45&&Math.abs(xy)<num*.2)theta=0;
      if(theta>Math.PI/2)theta-=Math.PI;
      if(theta< -Math.PI/2)theta+=Math.PI;
      // Usually long-axis rotation. Avoid upside-down names.
      const angles=[theta,0,Math.max(-1.4,Math.min(1.4,theta+.20)),Math.max(-1.4,Math.min(1.4,theta-.20))];
      const anchors=[[cx,cy],...largest.filter((_,i)=>i%Math.max(1,Math.floor(num/18))===0).map(id=>[id%width+.5,Math.floor(id/width)+.5])];
      // A stable font-agnostic width estimate is refined at draw time using canvas.measureText.
      plans.push({id:nation.id,name:nation.name,cells,angles,anchors,num,color:nation.color});
    }
    this.labelCache={world:w,sig,plans};return plans;
  }
  drawStrategicAtlas(ctx,scale,ox,oy,cw,ch){
    const w=this.world,ts=w.tiles,size=w.size,height=w.height;
    const b=this.visibleBounds(ox,oy,scale,cw,ch,1);
    ctx.save();ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.clip();ctx.translate(ox,oy);ctx.scale(scale,scale);
    for(let y=b.y0;y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++){
      const t=ts[y*size+x],terrain=TERRAINS[t.terrain];
      ctx.fillStyle=t.ownerId===null?terrain.color:(this.mode==='political'||this.mode==='independence')?blend(terrain.color,w.nations[t.ownerId].color,.75):this.mode==='era'?blend(terrain.color,v04cEraColor(w.nations[t.ownerId]),.91):terrain.color;
      ctx.fillRect(x,y,1.012,1.012);
    }
    // Sovereign borders stay visible regardless of diplomatic-border toggle.
    ctx.beginPath();ctx.strokeStyle='#111d29';ctx.lineWidth=Math.max(.055,1.2/scale);
    for(let y=b.y0;y<=b.y1;y++)for(let x=b.x0;x<=b.x1;x++){
      const t=ts[y*size+x],owner=t.ownerId;
      if(owner===null)continue;
      if(x===0||ts[t.id-1].ownerId!==owner){ctx.moveTo(x,y);ctx.lineTo(x,y+1);}
      if(y===0||ts[t.id-size].ownerId!==owner){ctx.moveTo(x,y);ctx.lineTo(x+1,y);}
      if(x===size-1||ts[t.id+1].ownerId!==owner){ctx.moveTo(x+1,y);ctx.lineTo(x+1,y+1);}
      if(y===height-1||ts[t.id+size].ownerId!==owner){ctx.moveTo(x,y+1);ctx.lineTo(x+1,y+1);}
    }
    ctx.stroke();
    this.drawDiplomaticBorders(ctx,scale,b);
    const placed=[];
    for(const p of this.getNationLabelPlans()){
      const nation=w.nations[p.id];let best=null;
      for(const font of [1.4,1.12,.92,.72,.54,.40]){
        if(font*scale<9)continue; // Never draw unreadable micro-text on giant maps.
        ctx.font=`800 ${font}px system-ui,sans-serif`;
        const textWidth=ctx.measureText(p.name).width,rectW=textWidth+.35,rectH=font*1.2;
        for(const angle of p.angles)for(const [cx,cy] of p.anchors){
          if(ox+cx*scale< -rectW*scale||ox+cx*scale>cw+rectW*scale||oy+cy*scale< -rectW*scale||oy+cy*scale>ch+rectW*scale)continue;
          const co=Math.cos(angle),si=Math.sin(angle);
          let inside=true;
          for(let a=-2;a<=2&&inside;a++)for(let d=-1;d<=1;d++){
            const dx=rectW*a/4,dy=rectH*d/2;
            const x=cx+dx*co-dy*si,y=cy+dx*si+dy*co;
            if(!p.cells.has(Math.floor(y)*size+Math.floor(x))){inside=false;break;}
          }
          if(!inside)continue;
          const collision=placed.some(q=>Math.hypot(q.x-cx,q.y-cy)<(q.r+rectW*.48));
          if(collision)continue;
          best={x:cx,y:cy,angle,font,r:rectW*.45};break;
        }
        if(best)break;
      }
      if(!best)continue;
      placed.push(best);
      ctx.save();ctx.translate(best.x,best.y);ctx.rotate(best.angle);
      ctx.font=`800 ${best.font}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineJoin='round';ctx.lineWidth=best.font*.16;ctx.strokeStyle='rgba(5,17,25,.80)';ctx.strokeText(p.name,0,0);
      ctx.fillStyle='#f5f2e7';ctx.fillText(p.name,0,0);ctx.restore();
    }
    ctx.restore();
    // At whole-world scale show compact strategic troop concentrations, not detailed badges.
    if(this.armyLabelMode!=='off'){
      const groups=new Map();
      for(const a of w.armies){
        const t=ts[a.tileId];if(!t)continue;
        // V0.7C2: even overview aggregates pin to a real army tile, rather
        // than an interpolated point between tiles. Keep one grid size across
        // overview zoom levels so the representative tile does not jump.
        const unit=3,k=`${a.nationId}:${Math.floor(t.x/unit)}:${Math.floor(t.y/unit)}`;
        let g=groups.get(k);if(!g){g={nation:a.nationId,repTid:null,repMen:-1,n:0,pop:0};groups.set(k,g);}
        const m=hCombatPresence(w,a);if(m<=0)continue;
        if(m>g.repMen||(m===g.repMen&&(g.repTid===null||t.id<g.repTid))){g.repMen=m;g.repTid=t.id;}
        g.pop+=m;g.n++;
      }
      const drawn=[];
      for(const g of [...groups.values()].sort((a,b)=>b.pop-a.pop)){
        if(!g.pop)continue;
        const anchor=ts[g.repTid];if(!anchor)continue;
        const x=ox+(anchor.x+.5)*scale,y=oy+(anchor.y+.5)*scale;
        if(x<8||y<8||x>cw-8||y>ch-8||drawn.some(d=>Math.hypot(x-d.x,y-d.y)<16))continue;
        const nation=w.nations[g.nation],r=Math.max(4,Math.min(10,4+Math.sqrt(g.pop)*.1));
        ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=nation.color;
        ctx.fill();ctx.strokeStyle='#10202b';ctx.lineWidth=1.5;ctx.stroke();drawn.push({x,y});
      }
    }
  }

  /** C5 screen-space overlay: only visible in the explicit diplomacy map mode. */
  drawIndependenceOverlay(ctx,scale,ox,oy,cw,ch){
    if(this.mode!=='independence')return;
    const w=this.world;
    if(!w?.diplomacy?.subjectTreaties?.length)return;
    ctx.save();ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.clip();
    for(const t of w.diplomacy.subjectTreaties){
      const sub=w.nations[t.subjectId],over=w.nations[t.overlordId];
      if(!sub?.active||!over?.active)continue;
      const a=w.tiles[sub.capitalId],b=w.tiles[over.capitalId];if(!a||!b)continue;
      const sx=ox+(a.x+.5)*scale,sy=oy+(a.y+.5)*scale;
      const ex=ox+(b.x+.5)*scale,ey=oy+(b.y+.5)*scale;
      if(Math.max(sx,ex)<-30||Math.min(sx,ex)>cw+30||Math.max(sy,ey)<-30||Math.min(sy,ey)>ch+30)continue;
      const pressure=Math.round(t.independencePressure||0),color=pressure>=80?'#F47D72':pressure>=50?'#F0C477':'#A9B5C5';
      // Committed supporters use a solid mint link; mature contact is a subtle dotted link.
      const p=(w.diplomacy.independencePledges||[]).find(p=>p.subjectId===t.subjectId&&p.overlordId===t.overlordId&&p.status==='ACTIVE'&&p.expiresDay>w.dayIndex);
      const o=w.diplomacy.independenceOutreach?.[t.subjectId];
      const supporter=p?.supporterId??((o?.treatyDay===t.formedDay&&o?.overlordId===t.overlordId&&o.progress>=4)?o.targetId:null);
      if(supporter!==null&&supporter!==undefined&&w.nations[supporter]?.active){
       const loc=w.tiles[w.nations[supporter].capitalId];
       if(loc){
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ox+(loc.x+.5)*scale,oy+(loc.y+.5)*scale);
        ctx.strokeStyle=p?'#68D8A2':'#91CAD8';ctx.lineWidth=p?2.8:1.4;
        ctx.globalAlpha=.9;ctx.setLineDash(p?[]:[2,5]);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
       }
      }
      ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);ctx.strokeStyle=color;
      ctx.lineWidth=1.8;ctx.globalAlpha=.88;ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      if(sx>=-15&&sy>=-15&&sx<=cw+15&&sy<=ch+15){
        ctx.beginPath();ctx.arc(sx,sy,Math.max(6,Math.min(12,scale*.30)),0,Math.PI*2);
        ctx.fillStyle='rgba(13,23,34,.88)';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();
        if(scale>=13){ctx.font='bold 10px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#FFFFFF';ctx.fillText(String(pressure),sx,sy);}
      }
    }
    ctx.restore();
  }
  draw(){
    if(this.frameHandle!==null){cancelAnimationFrame(this.frameHandle);this.frameHandle=null;}
    const ctx=this.ctx,w=this.width,h=this.height;
    if(!ctx||w<1||h<1)return;
    ctx.fillStyle='#0b1722';ctx.fillRect(0,0,w,h);
    if(!this.world)return;
    const world=this.world,ts=world.tiles,size=world.size,height=world.height??size;
    const {scale,originX,originY}=this.mapGeometry();
    if(scale<22){
      this.armyHitBoxes=[];this.battleHitBoxes=[];
      this.scale=scale;this.originX=originX;this.originY=originY;
      this.drawStrategicAtlas(ctx,scale,originX,originY,w,h);
      f1aDrawIndustryTileOverlay(ctx,world,scale,originX,originY,w,h);
      f2cDrawArsenalTileOverlay(ctx,world,scale,originX,originY,w,h);
      i2DrawPowerOverlay(ctx,world,scale,originX,originY,w,h);
      this.drawRiverOverlay(ctx,scale,originX,originY,w,h);
      this.drawCultureOverlay(ctx,scale,originX,originY,w,h);
      this.drawSocialOverlay(ctx,scale,originX,originY,w,h);
      this.drawIndependenceOverlay(ctx,scale,originX,originY,w,h);
      d2aDrawOverlay.call(this,ctx,scale,originX,originY,w,h,'area');
      d2aDrawOverlay.call(this,ctx,scale,originX,originY,w,h,'pins');
      d2bDrawOverlay.call(this,ctx,scale,originX,originY,w,h,'area');
      d2bDrawOverlay.call(this,ctx,scale,originX,originY,w,h,'pins');
      d1cDrawMapWarnings.call(this,ctx,scale,originX,originY,w,h);
      this.drawC6ArmyObjective(ctx,scale,originX,originY);
      this.drawBattleOverlays(ctx,scale,originX,originY,w,h,true);
      const p=document.getElementById('fortressDetail');if(p)p.hidden=true;
      return;
    }
    const visuals=this.getVisualData();
    this.scale=scale;this.originX=originX;this.originY=originY;
    const visible=this.visibleBounds(originX,originY,scale,w,h,2);
    this.currentVisibleBounds=visible;
    if(!this.drawStaticAtlas(ctx,scale,originX,originY,w,h)){
      ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
      ctx.translate(originX,originY);ctx.scale(scale,scale);
      this.paintStaticBackground(ctx,this.visibleTiles(visible),scale,visible);
      ctx.restore();
    }
    f1aDrawIndustryTileOverlay(ctx,world,scale,originX,originY,w,h);
    f2cDrawArsenalTileOverlay(ctx,world,scale,originX,originY,w,h);
      i2DrawPowerOverlay(ctx,world,scale,originX,originY,w,h);
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
    ctx.translate(originX,originY);ctx.scale(scale,scale);
    ctx.lineJoin='round';
    // Facility symbols share a small corner of the tile, never replace capital or army labels.
    if(this.buildingLabelMode==='detail'||(this.buildingLabelMode==='auto'&&this.zoom>=1.58&&scale>=35)){
      const placed=visuals.buildingBadges;
      const detail=this.buildingLabelMode==='detail'||this.zoom>=1.8;
      for(const [tid,badge] of placed){
        if(!this.isTileVisible(tid,visible))continue;
        const t=ts[tid],x=t.x,y=t.y;
        ctx.fillStyle='rgba(7,24,28,.78)';ctx.beginPath();ctx.roundRect(x+.04,y+.69,.47,.25,.06);ctx.fill();
        ctx.font='bold .18px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillStyle='#ffdfaa';
        const label=detail?badge.detail:badge.compact;
        ctx.fillText(label,x+.275,y+.815,.43);
        if(badge.unfinished){ctx.fillStyle='#f8ae6c';ctx.fillRect(x+.05,y+.67,.11,.055);}
      }
    }
    // E1A: draw fortification connections without obscuring settlement centers.
    this.drawFortNetwork(ctx,ts,scale);
    // All settlement centers, symbol size/style reflects actual stage.
    for(const s of world.settlements){
      if(!this.isTileVisible(s.coreTileId,visible))continue;
      const {x,y}=ts[s.coreTileId],owner=world.nations[s.ownerId];
      ctx.save();ctx.translate(x+.5,y+.5);
      const radius=Math.min(.39,.23+s.level*.038);
      ctx.fillStyle='#10242b';ctx.strokeStyle=s.coreTileId===owner.capitalId?'#f8eac4':'#c6e5d4';ctx.lineWidth=.065;
      ctx.beginPath();ctx.moveTo(0,-radius);ctx.lineTo(radius,-.08);ctx.lineTo(radius*.86,radius*.80);ctx.lineTo(-radius*.86,radius*.80);ctx.lineTo(-radius,-.08);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle=owner.color;ctx.fillRect(-.12,-.07,.24,.24);ctx.fillStyle='#ffe9b0';ctx.fillRect(-.06,-.18,.12,.10);
      if(s.level>=3){ctx.fillStyle='#ffe9b0';ctx.fillRect(-.22,.03,.08,.09);ctx.fillRect(.14,.03,.08,.09);}
      if(s.coreTileId===owner.capitalId){
        // Crown is distinct from level; a small capital need not be a metropolis.
        ctx.fillStyle='#f3cb64';ctx.strokeStyle='#422d1f';ctx.lineWidth=.033;
        ctx.beginPath();ctx.moveTo(-.24,-radius-.10);ctx.lineTo(-.25,-radius-.29);
        ctx.lineTo(-.11,-radius-.18);ctx.lineTo(0,-radius-.34);ctx.lineTo(.11,-radius-.18);
        ctx.lineTo(.25,-radius-.29);ctx.lineTo(.24,-radius-.10);ctx.closePath();ctx.fill();ctx.stroke();
      }
      ctx.restore();
    }
    // D1A2 screen-space cultural markers remain separate from static map bitmaps.
    ctx.restore();
    this.drawCultureOverlay(ctx,scale,originX,originY,w,h);
    this.drawSocialOverlay(ctx,scale,originX,originY,w,h);
    d2aDrawOverlay.call(this,ctx,scale,originX,originY,w,h,'area');
    d2bDrawOverlay.call(this,ctx,scale,originX,originY,w,h,'area');
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();ctx.translate(originX,originY);ctx.scale(scale,scale);
    // Contested territory: amber progress perimeter, not the solid finished-occupation overlay.
    for(const o of world.occupations){
      if(!this.isTileVisible(o.tileId,visible))continue;
      const tile=ts[o.tileId];if(!tile)continue;
      const x=tile.x,y=tile.y;
      ctx.fillStyle='rgba(240,163,57,.13)';ctx.fillRect(x+.10,y+.10,.80,.80);
      ctx.lineWidth=.11;ctx.strokeStyle='#f3ba6b';ctx.strokeRect(x+.055,y+.055,.89,.89);
      ctx.fillStyle='#f7dc9f';ctx.fillRect(x+.15,y+.82,.7,.09);
      ctx.fillStyle=world.nations[o.nationId].color;ctx.fillRect(x+.15,y+.82,.7*o.progress/100,.09);
    }
    // Active engagement is a stronger orange battlefield marker than tile selection.
    for(const e of world.engagements){if(!this.isTileVisible(e.tileId,visible))continue;const tile=ts[e.tileId];if(!tile)continue;
      ctx.fillStyle='rgba(232,100,39,.20)';ctx.fillRect(tile.x+.06,tile.y+.06,.88,.88);
      ctx.strokeStyle='#ff9f4d';ctx.lineWidth=.115;ctx.strokeRect(tile.x+.025,tile.y+.025,.95,.95);
      ctx.fillStyle='#ffefc9';ctx.font='bold .43px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('⚔',tile.x+.5,tile.y+.5);
    }
    const liveBattles=new Set(world.engagements.map(e=>e.tileId));
    const recent=new Set(world.battleHistory.filter(b=>world.dayIndex-b.dayIndex<=60&&!liveBattles.has(b.tileId)).map(b=>b.tileId));
    for(const id of recent){if(!this.isTileVisible(id,visible))continue;const tile=ts[id];if(!tile)continue;
      ctx.fillStyle='rgba(157,90,59,.10)';ctx.fillRect(tile.x+.11,tile.y+.11,.78,.78);
      ctx.strokeStyle='rgba(195,126,103,.44)';ctx.lineWidth=.045;ctx.strokeRect(tile.x+.12,tile.y+.12,.76,.76);
    }
    const byTile=visuals.armyBadges;
    if(this.selectedId!==null){
      const t=ts[this.selectedId];if(t){
        const hasFort=this.defenseLabelMode!=='off'&&(world.defenses||[]).some(d=>d.tileId===t.id&&(d.status==='ACTIVE'||d.status==='UPGRADING'));
        const center=world.settlements.some(s=>s.coreTileId===t.id);
        if(hasFort&&center){
          // Selected fortress stands out locally, without covering neighboring tiles.
          ctx.lineWidth=.074;ctx.strokeStyle='#ffe3a0';ctx.beginPath();ctx.arc(t.x+.5,t.y+.5,.463,0,Math.PI*2);ctx.stroke();
        }else if(hasFort){
          ctx.strokeStyle='#ffe3a0';ctx.lineWidth=.07;ctx.strokeRect(t.x+.58,t.y+.01,.40,.40);
        }else{
          ctx.strokeStyle='#ffda82';ctx.lineWidth=.10;ctx.strokeRect(t.x+.07,t.y+.07,.86,.86);
          ctx.strokeStyle='#111827';ctx.lineWidth=.035;ctx.strokeRect(t.x+.13,t.y+.13,.74,.74);
        }
      }
    }
    ctx.restore();
    // E1A: screen-size fortress badges stay visible even when the atlas is zoomed out.
    this.drawFortMarkers(ctx,ts,scale,originX,originY,w,h);
    this.drawIndependenceOverlay(ctx,scale,originX,originY,w,h);
    this.drawC6ArmyObjective(ctx,scale,originX,originY);
    this.drawAdaptiveLabelsB4C(ctx,visuals,scale,originX,originY,w,h);
    d2aDrawOverlay.call(this,ctx,scale,originX,originY,w,h,'pins');
    d2bDrawOverlay.call(this,ctx,scale,originX,originY,w,h,'pins');
    d1cDrawMapWarnings.call(this,ctx,scale,originX,originY,w,h);
    this.drawBattleOverlays(ctx,scale,originX,originY,w,h,false);
    this.updateDefensePopover();
  }

  // UI-only combat overlay, always drawn last so no army icon can obscure it.
  drawBattleOverlays(ctx,scale,ox,oy,w,h,overview){
    const hits=[];
    for(const battle of v07d1BattleGroups(this.world)){
      const tile=this.world.tiles[battle.tileId];if(!tile)continue;
      const x=ox+(tile.x+.5)*scale,y=oy+(tile.y+.5)*scale;
      if(x< -70||x>w+70||y< -80||y>h+80)continue;
      const rect=v07d1DrawSharedBattle(ctx,x,y,battle,this.world.nations,overview);
      hits.push({rect,battle});
    }
    this.battleHitBoxes=hits;
  }
  // Select a shared marker to inspect each REAL engagement and its two live sides.
  openBattleCluster(battle,point){
    const panel=document.getElementById('mapArmyClusterPanel');if(!panel)return;
    panel.replaceChildren();
    const title=document.createElement('strong');title.textContent=`⚔ 진행 중 전투 · ${battle.nationIds.size}국 · ${battle.armies.size}편제`;
    panel.append(title);
    const rows=document.createElement('div');rows.className='b4c-cluster-rows';
    for(const e of battle.engagements){
      const heading=document.createElement('strong');heading.textContent=`교전 #${e.id} · ${e.round}라운드`;rows.append(heading);
      for(const [side,label] of [['attackers','공격'],['defenders','방어']]){
        for(const {army,member} of e.sides[side]){
          const btn=document.createElement('button');btn.type='button';
          const stats=v08hFrontStats(this.world,army),front=v08hFront(this.world,army,member),stable=member?v08hStable(this.world,army,member):true;
          btn.textContent=`${label} · ${this.world.nations[army.nationId]?.name||army.nationId} · 제${army.id+1}군 · 인간 ${manpower(army)}명 · ⚙ ${hCount(this.world,army,true)}대 · 전열 ${front}전력 (인간 ${stats.humans}·기계 ${stats.machines}·기갑 +${member?.v08hFrontVersion===1?stats.armor:0}, ${stable?'유지':'붕괴'})`;
          btn.addEventListener('click',()=>{this.closeArmyCluster();this.onSelect?.(army.tileId);this.focusArmy(army.id);});
          rows.append(btn);
        }
      }
    }
    panel.append(rows);panel.hidden=false;
    const cw=this.width,ch=this.height,pw=panel.offsetWidth,ph=panel.offsetHeight;
    panel.style.left=`${Math.max(8,Math.min(Math.max(8,cw-pw-8),point.x+8))}px`;
    panel.style.top=`${Math.max(8,Math.min(Math.max(8,ch-ph-8),point.y+15))}px`;
  }
  closeArmyCluster(){
    const panel=document.getElementById('mapArmyClusterPanel');
    if(panel){panel.hidden=true;panel.replaceChildren();}
  }
  openArmyCluster(group,point){
    const panel=document.getElementById('mapArmyClusterPanel');if(!panel)return;
    panel.replaceChildren();
    const title=document.createElement('strong');title.textContent=`${this.world.nations[group.nationId].name} · 편제 ${group.members.reduce((n,m)=>n+m.armyGroups.length,0)}개 · 인간 ${group.amount}명 · ⚙ ${group.machineCount||0}대`;
    panel.append(title);
    const rows=document.createElement('div');rows.className='b4c-cluster-rows';
    for(const m of group.members)for(const a of m.armyGroups){
      const btn=document.createElement('button');btn.type='button';
      const machineCount=hCount(this.world,a,true),visual=v07h1e1VisualForMarker([a],{machineCount});
      btn.textContent=`제${a.id+1}군 · 인간 ${manpower(a)}명 · 오토마톤 ${machineCount}대 · ${visual.type==='automaton'?'초기형 오토마톤':UNIT_TYPES[visual.type]?.label||'혼성군'} · ${visual.era} · 사기 ${Math.round(visual.morale??0)} · 숙련 ${b4aRankLabel(a)}`;
      btn.addEventListener('click',()=>{this.closeArmyCluster();this.onSelect?.(m.tid);this.focusArmy(a.id);});rows.append(btn);
    }
    panel.append(rows);panel.hidden=false;
    const cw=this.width,ch=this.height,pw=panel.offsetWidth,ph=panel.offsetHeight;
    panel.style.left=`${Math.max(8,Math.min(Math.max(8,cw-pw-8),point.x+8))}px`;
    panel.style.top=`${Math.max(8,Math.min(Math.max(8,ch-ph-8),point.y+15))}px`;
  }
  drawAdaptiveLabelsB4C(ctx,visuals,scale,ox,oy,w,h){
    const world=this.world,ts=world.tiles;
    const used=[],names=[],hits=[];
    const labelMode=this.settlementLabelMode;
    const showNames=labelMode!=='off';
    const showSecondary=labelMode==='all'||(labelMode==='auto'&&this.zoom>=1.52&&scale>=35);
    // Capitals are reserved first; non-capital names wait for army labels and
    // quietly disappear if there is no free space. Selected settlement is exempt.
    if(showNames){
      const capitals=[],regular=[];
      for(const s of world.settlements){
        const t=ts[s.coreTileId],n=world.nations[s.ownerId];if(!t||!n)continue;
        const isCapital=s.coreTileId===n.capitalId,selected=s.coreTileId===this.selectedId;
        if(!isCapital&&!showSecondary&&!selected)continue;
        const x=ox+(t.x+.5)*scale,y=oy+(t.y+.95)*scale+5;
        if(x<-60||x>w+60||y<-25||y>h+25)continue;
        const size=isCapital?Math.max(11,Math.min(14,scale*.34)):Math.max(10,Math.min(12,scale*.31));
        ctx.font=`${isCapital?750:600} ${size}px system-ui,sans-serif`;
        const text=settlementDisplayName(world,s);
        const entry={text,isCapital,selected,size,x,y,w:ctx.measureText(text).width+7,h:size+5};
        (isCapital||selected?capitals:regular).push(entry);
      }
      for(const entry of capitals.sort((a,b)=>Number(b.selected)-Number(a.selected)||Number(b.isCapital)-Number(a.isCapital))){
        const rect=b4cFindLabelSpot({x:entry.x,y:entry.y+entry.h/2},entry.w,entry.h,used,w,h);
        if(rect){entry.rect=rect;names.push(entry);used.push(rect);}
      }
      // Store optional names until after armies have reserved their spots.
      this.b4cOptionalNames=regular;
    }else this.b4cOptionalNames=[];
    if(this.armyLabelMode!=='off'){
      const clusters=b4cArmyClusters(visuals.armyBadges,ts,scale,ox,oy,this.selectedId,this.zoom);
      const liveEngagementIds=new Set(world.engagements.map(e=>e.id));
      clusters.sort((a,b)=>Number(b.selected)-Number(a.selected)||(b.amount+b.machineCount)-(a.amount+a.machineCount)||a.nationId-b.nationId);
      const overview=scale<31||this.zoom<.80;
      const detailed=this.armyLabelMode==='detail'||(this.armyLabelMode==='auto'&&this.zoom>=2.2);
      for(const g of clusters){
        if(g.x<-110||g.x>w+110||g.y<-60||g.y>h+60)continue;
        const nation=world.nations[g.nationId];if(!nation)continue;
        const count=g.members.reduce((n,m)=>n+m.armyGroups.length,0);
        const xp=Math.round(g.weightedXP/Math.max(1,g.amount));
        const rank=['I','II','III','IV','V','VI'][b4aRankIndex({formationExperience:{xp}})];
        const troops=g.amount>=1000?(g.amount/1000).toFixed(1)+'k':String(g.amount);
        const groupArmies=g.members.flatMap(m=>m.armyGroups);
        const visual=v07h1e1VisualForMarker(groupArmies,g);
        visual.engaged=groupArmies.some(a=>(manpower(a)>0||a.hAutomatonGroupIds?.length>0)&&a.status==='ENGAGED'&&liveEngagementIds.has(a.engagementId));
        const compact=this.armyLabelMode==='compact'||overview;
        const marker=v07c2MarkerGeometry(g.x,g.y,compact,scale);
        const rect=marker.hitRect;
        // Never offset an army icon to an empty label slot. This is a *tile pin*,
        // not a movable caption. Even if two markers overlap, their anchor is true.
        if(rect.x+rect.w<0||rect.y+rect.h<0||rect.x>w||rect.y>h)continue;
        used.push(rect);hits.push({rect,group:g});
        ctx.save();
        ctx.translate(g.x,g.y);ctx.scale(marker.factor,marker.factor);ctx.translate(-g.x,-g.y);
        v07cDrawArmySeal(ctx,marker.drawRect,g,visual,nation,compact);
        ctx.restore();
      }
    }
    this.armyHitBoxes=hits;
    for(const entry of this.b4cOptionalNames){
      const rect=b4cFindLabelSpot({x:entry.x,y:entry.y+entry.h/2},entry.w,entry.h,used,w,h);
      if(rect){entry.rect=rect;names.push(entry);used.push(rect);}
    }
    ctx.save();ctx.textBaseline='middle';ctx.textAlign='center';ctx.lineJoin='round';
    for(const n of names){
      ctx.font=`${n.isCapital?750:600} ${n.size}px system-ui,sans-serif`;
      ctx.lineWidth=n.isCapital?2.5:2.3;ctx.strokeStyle='rgba(7,18,26,.94)';
      const x=n.rect.x+n.rect.w/2,y=n.rect.y+n.rect.h/2;
      ctx.strokeText(n.text,x,y);ctx.fillStyle=n.isCapital?'#ffe4a6':'#edf4f5';ctx.fillText(n.text,x,y);
    }
    ctx.restore();
  }
  updateDefensePopover(){
    const panel=document.getElementById('fortressDetail');
    if(!panel)return;
    const world=this.world,id=this.selectedId;
    if(!world||id===null||this.defenseLabelMode==='off'||this.detailDismissedFor===id||
       (window.innerWidth<=720&&document.body.classList.contains('atlas-inspector-open'))){panel.hidden=true;return;}
    const fortresses=(world.defenses||[]).filter(d=>d.tileId===id&&(d.status==='ACTIVE'||d.status==='UPGRADING'));
    const tile=world.tiles[id];
    if(!tile||!fortresses.length){panel.hidden=true;return;}
    // Camera-only movement must not recompute all-world military averages or DOM text.
    // Include the fort-line signature so a zero-HP transition refreshes immediately.
    const fortHash=this.fortGraphCache?.hash??0;
    const contentKey=`${world.dayIndex}:${world.changeSeq}:${fortHash}:${id}:${fortresses.map(f=>f.hp+'-'+f.status).join(',')}`;
    if(this.fortDetailKey!==contentKey){
    const stats=regionalMilitaryStats(world,id),averages=this.getFortAverage();
    const settlement=world.settlements.find(s=>s.coreTileId===id)||world.settlements.find(s=>s.tileIds.includes(id));
    const title=settlement?settlementDisplayName(world,settlement):`요새 · (${tile.x}, ${tile.y})`;
    const delta=(value,average)=>average>0?`${value>=average?'▲ +':'▼ −'}${Math.round(Math.abs(value/average-1)*100)}%`:'비교 불가';
    const set=(key,value)=>{const el=document.getElementById(key);if(el)el.textContent=String(value);};
    set('fortressDetailTitle',title);
    set('fortressDetailMeta',`${tile.x}, ${tile.y} · ${fortresses.length===1?`요새 ${fortresses[0].level}단계 · HP ${fortresses[0].hp}/${fortMaxHP(fortresses[0])}`:`요새 ${fortresses.length}동`} · 방어선 거리 ${FORT_LINE_RANGE}`);
    set('fortressResistanceValue',Math.round(stats.resistance).toLocaleString('ko-KR'));
    set('fortressFirepowerValue',Math.round(stats.firepower).toLocaleString('ko-KR'));
    set('fortressResistanceDelta',delta(stats.resistance,averages.resistance));
    set('fortressFirepowerDelta',delta(stats.firepower,averages.firepower));
    set('fortressResistanceMean',averages.resistance.toFixed(1));
    set('fortressFirepowerMean',averages.firepower.toFixed(1));
    const barR=document.getElementById('fortressResistanceTrack'),barA=document.getElementById('fortressFirepowerTrack');
    if(barR)barR.style.width=`${(fortressThickness(stats.resistance,averages.resistance)*100).toFixed(1)}%`;
    if(barA)barA.style.width=`${(fortressThickness(stats.firepower,averages.firepower)*100).toFixed(1)}%`;
    const badgeR=document.getElementById('fortressResistanceDelta'),badgeA=document.getElementById('fortressFirepowerDelta');
    if(badgeR)badgeR.className='fortress-delta '+(stats.resistance>=averages.resistance?'positive':'negative');
    if(badgeA)badgeA.className='fortress-delta '+(stats.firepower>=averages.firepower?'positive':'negative');
    this.fortDetailKey=contentKey;
    }
    panel.hidden=false;
    const bounds=this.canvas.getBoundingClientRect(),pw=panel.offsetWidth,ph=panel.offsetHeight;
    if(!bounds.width||!bounds.height)return;
    const {scale,originX,originY}=this.mapGeometry();
    const px=originX+(tile.x+.5)*scale,py=originY+(tile.y+.5)*scale;
    // Account for the canvas position relative to the containing .canvas-area.
    const container=panel.parentElement.getBoundingClientRect();
    const localX=px+bounds.left-container.left,localY=py+bounds.top-container.top;
    const availableWidth=container.width,availableHeight=container.height;
    // Avoid the right-hand inspector dock, which sits above the map in atlas view.
    const side=document.querySelector('#tab-map .map-side');
    const sideBounds=side?.getBoundingClientRect();
    const dockVisible=document.body.classList.contains('atlas-mode')&&window.innerWidth>720&&
      !document.body.classList.contains('atlas-inspector-hidden')&&sideBounds?.width>0;
    const rightLimit=dockVisible?Math.min(availableWidth-10,sideBounds.left-container.left-16):availableWidth-10;
    let left=localX+scale*.55+13;
    if(left+pw>rightLimit)left=localX-scale*.55-pw-13;
    left=Math.max(10,Math.min(Math.max(10,rightLimit-pw),left));
    let top=Math.max(12,Math.min(availableHeight-ph-12,localY-ph*.45));
    if(!Number.isFinite(top))top=12;
    panel.style.left=`${left}px`;panel.style.top=`${top}px`;
  }
}


// --- src/ui/navigation.js ---
/** UI only: keep world simulation, selected objects and camera independent of navigation. */
function bindTabs(onSwitch){
  const tabs=[...document.querySelectorAll('[data-tab]')];
  function activate(name){
    const active=tabs.some(b=>b.dataset.tab===name)?name:'map';
    for(const tab of tabs){
      const yes=tab.dataset.tab===active;
      tab.classList.toggle('active',yes);
      if(yes)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
    }
    for(const panel of document.querySelectorAll('.tab-panel'))panel.classList.toggle('is-active',panel.id==='tab-'+active);
    onSwitch?.(active);
    return active;
  }
  tabs.forEach(button=>button.addEventListener('click',()=>activate(button.dataset.tab)));
  return {activate};
}


// --- src/ui/player-controls.js ---

/** V0.2B observer -> one-nation player controls. Actions always pass the shared
 * legality, treasury and execution path; no UI-side cheats or shadow economy.
 */






const ACTIONS=[
 ['CLAIM_TILE','중립 타일 개척'],['FOUND_SETTLEMENT','정착지 설립'],['EXPAND_SETTLEMENT','정착지 확장'],
 ['DEVELOP_SETTLEMENT','정착지 개발'],['MERGE_SETTLEMENTS','정착지 병합'],['BUILD_FACILITY','시설 건설'],
 ['REDEVELOP_FACILITY','시설 재개발'],['INSTALL_WORKSHOP_POWER','공방·공장 동력 설비 설치'],['SET_WORKSHOP_MODE','공방 생산 방식 전환'],['UPGRADE_FACILITY','시설 개량'],['REPAIR_FORT','요새 수리'],['BUILD_ROAD','도로 건설'],['UPGRADE_ROAD','도로 개량'],
 ['INVEST_KNOWLEDGE','기초 연구 역량 투자'],['START_RESEARCH','기술 연구 시작'],
 ['TRAIN_RESERVES','예비병 훈련'],['TRAIN_FORMATION','편제 훈련'],['EMERGENCY_MUSTER','최후 거점 비상 소집'],['RECRUIT_ARMY','부대 징병'],['RAISE_ARTILLERY','전장포 제작·포병 편성'],['REINFORCE_ARMY','부대 증원'],['REARM_ARMY','부대 재무장'],['MOVE_ARMY','부대 이동'],
 ['LAND_ARMY','해안 상륙 (해상 수송)'],['DISBAND_ARMY','부대 해산'],['TRADE_BUY','자원 수입'],['TRADE_SELL','자원 수출'],['DECLARE_WAR','선전포고'],['BETRAY_ALLIANCE','장기 동맹 배신 선전포고'],['OFFER_PEACE','평화 제안'],
 ['ACCEPT_PEACE','평화 수락'],['REJECT_PEACE','평화 거절'],
 ['IMPROVE_RELATIONS','외교 친선 교섭'],['OFFER_ALLIANCE','군사 동맹 제안'],['ACCEPT_ALLIANCE','동맹 수락'],
 ['REJECT_ALLIANCE','동맹 거절'],['END_ALLIANCE','동맹 해제'],
 ['OFFER_SUBMISSION','보호 요청 · 자발적 종속'],['ACCEPT_SUBMISSION','종속 제안 수락'],['REJECT_SUBMISSION','종속 제안 거절'],
 ['OFFER_INDEPENDENCE_FRONT','독립 공동전선 제안'],['ACCEPT_INDEPENDENCE_FRONT','독립 공동전선 수락'],['REJECT_INDEPENDENCE_FRONT','독립 공동전선 거절'],['OFFER_INDEPENDENCE_SUPPORT','독립국에 지원 요청'],['ACCEPT_INDEPENDENCE_SUPPORT','독립 지원 약속 수락'],['REJECT_INDEPENDENCE_SUPPORT','독립 지원 약속 거절'],['OFFER_INDEPENDENCE_BACKING','종속국에 독립 지원 제안'],['ACCEPT_INDEPENDENCE_BACKING','독립국 지원 제안 수락'],['REJECT_INDEPENDENCE_BACKING','독립국 지원 제안 거절'],['DECLARE_INDEPENDENCE','독립전쟁 선포'],['OFFER_RELEASE','종속 관계 해제 제안'],['ACCEPT_RELEASE','종속 해제 수락'],['REJECT_RELEASE','종속 해제 거절'],['RESPOND_DEFENSE_CALL','방어 참전 요청 응답'],['RESPOND_ATTACK_CALL','공격 참전 요청 응답']
];
const E=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
const group=(label,control)=>{const l=E('label','player-field');l.append(E('span','',label),control);return l;};
const select=(items,value,onChange)=>{
 const el=E('select','player-input');
 for(const [id,label] of items){const opt=E('option','',label);opt.value=String(id);el.append(opt);}
 if(items.some(x=>String(x[0])===String(value)))el.value=String(value);
 el.addEventListener('change',()=>onChange(el.value));return el;
};
const tileName=t=>`(${t.x},${t.y}) · ${TERRAINS[t.terrain]?.label||t.terrain}${t.settlementId!==null?' · 정착지':''}`;
const priceDescription=p=>!p?'행동 조건 미충족':`AP ${(p.apUnits/10).toFixed(1)} · Gold ${p.gold} · K ${p.knowledge} · ${Object.entries(p.resources||{}).map(([k,v])=>`${({wood:'목재',stone:'석재',iron:'철',food:'식량'}[k]||k)} ${v}`).join(' · ')||'추가 자재 없음'}`;
/** Called on nation selection / explicit player commands. During every SIM day,
 * the controls stay mounted so selections and focus aren't stolen. */
function mountPlayerControls(box,{world:w,nationId,selectedTileId,onSwitch,onAction,onPickTile}){
 const n=w.nations[nationId],player=w.nations.find(x=>x.controller==='PLAYER');
 box.replaceChildren();if(!n)return;
 const title=E('div','player-control-header');title.append(E('strong','',`직접 조종 · ${n.name}`),E('small','',player?`현재 플레이어: ${player.name}`:'현재 전 국가 AI 조종'));
 box.append(title);
 const toggle=E('button','player-main-button',player?.id===nationId?'AI 조종으로 복귀':player?'이 국가로 조종 전환':'이 국가 직접 조종');
 toggle.type='button';toggle.disabled=!n.active;
 toggle.addEventListener('click',()=>onSwitch(nationId));box.append(toggle);
 if(n.controller!=='PLAYER'||!n.active){box.append(E('p','player-note','플레이어로 지정하면 이 국가의 자동 건설·연구·징병·작전·외교 판단이 중단됩니다. 다른 국가들은 계속 AI로 행동합니다.'));return;}
 const actions=E('div','player-action-card');box.append(actions);
 actions.append(E('h3','','국가 행동 명령'),E('p','player-note','실제 국가 AP·Gold·자재를 소비합니다. 타일·부대·연구를 선택하고 실행하세요. 지도에서 타일을 선택한 뒤 국가 탭에 돌아올 수도 있습니다.'));
 const draft={type:'CLAIM_TILE',targetTileId:selectedTileId};
 const actionField=select(ACTIONS,draft.type,v=>{draft.type=v;delete draft.settlementId;delete draft.otherSettlementId;delete draft.buildingId;delete draft.armyId;delete draft.technologyId;delete draft.mode;delete draft.source;delete draft.buildingType;delete draft.targetNationId;delete draft.unitType;delete draft.amount;delete draft.guns;delete draft.reparationRate;delete draft.subjectDemand;delete draft.resource;delete draft.warId;delete draft.accept;drawFields();});
 actions.append(group('명령 유형',actionField));
 const fields=E('div','player-action-fields'),status=E('p','player-cost-preview'),run=E('button','player-main-button','명령 실행');run.type='button';
 actions.append(fields,status,run);
 const settlements=()=>w.settlements.filter(s=>s.ownerId===n.id);
 const armies=()=>w.armies.filter(a=>a.nationId===n.id);
 const options=(key,label,items,defaultValue=null)=>{
   const choices=items.map(([id,title])=>[String(id),title]);
   if(!choices.length){fields.append(E('div','player-note',`${label}: 선택 가능한 대상이 없습니다.`));draft[key]=undefined;return;}
   let chosen=choices.some(([id])=>id===String(draft[key]))?String(draft[key]):choices.some(([id])=>id===String(defaultValue))?String(defaultValue):choices[0][0];
   draft[key]=/^\d+$/.test(chosen)?Number(chosen):chosen;
   const field=select(choices,chosen,v=>{draft[key]=/^\d+$/.test(v)?Number(v):v;drawFields();});
   fields.append(group(label,field));
 };
 const tiles=(predicate)=>w.tiles.filter(t=>TERRAINS[t.terrain].passable&&predicate(t)).map(t=>[t.id,tileName(t)]);
 const ownedSettlements=()=>settlements().map(s=>[s.id,`${s.name} · 인구 ${s.population}`]);
 const ownedArmies=()=>armies().map(a=>[a.id,`제${a.id+1}군 · ${manpower(a)}명 · (${w.tiles[a.tileId].x},${w.tiles[a.tileId].y}) · ${a.status}`]);
 const borders=()=>w.wars.filter(v=>warSide(v,n.id));
 const nations=(filter)=>w.nations.filter(x=>x.id!==n.id&&x.active&&filter(x)).map(x=>[x.id,x.name]);
 function buildAction(){
   const a={type:draft.type};
   for(const key of ['targetTileId','settlementId','otherSettlementId','buildingId','buildingType','technologyId','armyId','unitType','armorId','targetNationId','amount','reparationRate','subjectDemand','resource','warId','accept','mode','source','guns'])if(draft[key]!==undefined)a[key]=draft[key];
   if(a.type==='RECRUIT_ARMY'){
     const typeId=draft.unitType||'levy';a.composition=[{typeId,position:unitBranch(typeId)==='ranged'?'rear':'front',amount:a.amount}];
   }
   return a;
 }
 function updatePreview(){
   let legal=false,price=null;
   const action=buildAction();
   try{legal=isNationActionLegal(w,n.id,action);if(legal)price=getNationActionCost(w,n.id,action);}catch{}
   const affordable=legal&&canExecuteNationAction(w,n.id,action);
   if(['TRADE_BUY','TRADE_SELL'].includes(action.type)){
     const seller=action.type==='TRADE_BUY'?action.targetNationId:n.id,buyer=action.type==='TRADE_BUY'?n.id:action.targetNationId;
     const q=tradeQuote(w,seller,buyer,action.resource,action.amount);
     status.textContent=q?`${affordable?'실행 가능':'실행 불가'} · ${q.unitPrice} G/개 · 총 ${q.amount} G · 현재 최대 ${q.maxQuantity}개 · 남은 수송 ${q.remaining}`:'교역로가 없거나 교역 조건을 충족하지 않습니다.';
   }else status.textContent=(affordable?'실행 가능':'실행 불가')+' · '+priceDescription(price)+(legal&&!affordable?' · 자원 또는 AP 부족':'');
   run.disabled=!affordable;
 }
 function drawFields(){
   fields.replaceChildren();
   const type=draft.type;
   const settlementChoice=()=>options('settlementId','정착지',ownedSettlements());
   const tileChoice=(predicate)=>options('targetTileId','대상 타일',tiles(predicate),selectedTileId);
   const armyChoice=()=>options('armyId','부대',ownedArmies());
   if(type==='CLAIM_TILE')tileChoice(t=>t.ownerId===null);
   if(type==='FOUND_SETTLEMENT')tileChoice(t=>t.ownerId===n.id&&t.settlementId===null);
   if(['EXPAND_SETTLEMENT','DEVELOP_SETTLEMENT','MERGE_SETTLEMENTS','TRAIN_RESERVES','RECRUIT_ARMY','REINFORCE_ARMY','EMERGENCY_MUSTER'].includes(type))settlementChoice();
   if(type==='EXPAND_SETTLEMENT')tileChoice(t=>t.ownerId===n.id&&t.settlementId===null);
   if(type==='MERGE_SETTLEMENTS')options('otherSettlementId','병합 대상',ownedSettlements().filter(([id])=>id!==draft.settlementId));
   if(type==='BUILD_FACILITY'){
     options('buildingType','시설 종류',Object.entries(BUILDINGS).filter(([id])=>(id!=='workshop'||hasTech(w,n.id,'guild_organization'))&&(id!=='barracks'||hasTech(w,n.id,'military_drills')&&v04e1ReservedBarracks(w,n.id).length<3)&&(id!=='coal_pit'||hasTech(w,n.id,'coal_extraction'))&&(id!=='factory'||f2FactoryUnlocked(w,n.id))&&(!F2B_INDUSTRIAL_TYPES.includes(id)||f2bCanBuild(w,n.id,id))).map(([id,b])=>[id,b.label]));
     if(draft.buildingType==='fort'){draft.settlementId=undefined;tileChoice(t=>t.ownerId===n.id&&t.occupiedBy===null);}else{settlementChoice();tileChoice(t=>t.ownerId===n.id&&t.settlementId===draft.settlementId);}
   }
   if(type==='REDEVELOP_FACILITY'){
     options('buildingId','교체할 시설',w.buildings.filter(b=>b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===n.id).map(b=>[b.id,`${BUILDINGS[b.typeId].label} Lv.${b.level} · (${w.tiles[b.tileId].x},${w.tiles[b.tileId].y})`]));
     options('buildingType','신규 시설',Object.entries(BUILDINGS).filter(([id])=>id!=='fort'&&(id!=='workshop'||hasTech(w,n.id,'guild_organization'))&&(id!=='barracks'||hasTech(w,n.id,'military_drills')&&v04e1ReservedBarracks(w,n.id).length<3)&&(id!=='coal_pit'||hasTech(w,n.id,'coal_extraction'))&&(id!=='factory'||f2FactoryUnlocked(w,n.id))&&(!F2B_INDUSTRIAL_TYPES.includes(id)||f2bCanBuild(w,n.id,id))).map(([id,b])=>[id,b.label]));
   }
   if(type==='INSTALL_WORKSHOP_POWER'){
     options('buildingId','공방·공장',w.buildings.filter(b=>['workshop','factory'].includes(b.typeId)&&b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===n.id).map(b=>[b.id,`${BUILDINGS[b.typeId].label} #${b.id} · Lv.${b.level} · 설치 ${Object.entries(f1Devices(b)).filter(([k,v])=>v).map(([k])=>k).join('/')||'없음'}`]));
     options('source','동력원',[['MECHANICAL','기계 보조 (60일)'],['WATERWHEEL','수차 (90일 · 강변 필수)'],['STEAM','증기기관 (120일 · 공방 Lv.3/공장 Lv.1+)']]);
   }
   if(type==='SET_WORKSHOP_MODE'){
     options('buildingId','Lv.3 공방',w.buildings.filter(b=>b.typeId==='workshop'&&b.level===3&&b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===n.id).map(b=>[b.id,`공방 #${b.id} · ${b.workshopMode==='precision'?'정밀':'표준'} · (${w.tiles[b.tileId].x}, ${w.tiles[b.tileId].y})`]));
     options('mode','생산 방식', [['precision','정밀 생산 · 목재 16 / 철 9 · Gold ×1.20'],['standard','표준 생산 · 목재 12 / 철 6']]);
   }
   if(type==='REPAIR_FORT')options('buildingId','수리할 요새',(w.defenses||[]).filter(d=>fortRepairLegal(w,n.id,d.id)).map(d=>[d.id,`요새 ${d.level}단계 · HP ${d.hp}/${fortMaxHP(d)} · (${w.tiles[d.tileId].x},${w.tiles[d.tileId].y})`]));
   if(type==='UPGRADE_FACILITY')options('buildingId','개량 시설',allStructures(w).filter(b=>b.level<maxBuildingLevel(b.typeId)&&g2LevelUnlocked(w,n.id,b.typeId,b.level+1)&&b.status==='ACTIVE'&&w.tiles[b.tileId]?.ownerId===n.id&&(b.typeId==='fort'||settlements().some(s=>s.id===b.settlementId))).map(b=>[b.id,`${BUILDINGS[b.typeId].label} Lv.${b.level} · (${w.tiles[b.tileId].x},${w.tiles[b.tileId].y})`]));
   if(type==='BUILD_ROAD')tileChoice(t=>t.ownerId===n.id&&!t.roadLevel);
   if(type==='UPGRADE_ROAD')tileChoice(t=>t.ownerId===n.id&&t.roadLevel===1);
   if(type==='START_RESEARCH')options('technologyId','연구 기술',TECHNOLOGIES.filter(t=>techEraAllowed(n,t.id)&&!n.technology.unlocked.includes(t.id)).map(t=>[t.id,`${t.name} · ${t.cost} K`]));
   if(['RAISE_ARTILLERY','REINFORCE_ARMY','MOVE_ARMY','LAND_ARMY','DISBAND_ARMY','REARM_ARMY','TRAIN_FORMATION'].includes(type))armyChoice();
   if(type==='EMERGENCY_MUSTER')tileChoice(t=>w.settlements.some(s=>s.id===draft.settlementId&&s.tileIds.includes(t.id))&&t.ownerId===n.id&&t.occupiedBy===null);
   if(type==='REARM_ARMY'){options('unitType','재무장 병종',Object.values(UNIT_TYPES).filter(v=>v.branch!=='artillery'&&loadoutLegal(w,n.id,v.id)).map(v=>[v.id,v.label]));options('armorId','재무장 갑옷',Object.entries(ARMORS).filter(([id])=>rearmArmorLegal(w,n.id,id)).map(([id,a])=>[id,a.label]),defaultArmorFor(w,n.id,draft.unitType));}
   if(type==='LAND_ARMY')tileChoice(t=>neighbors4(t.id,w.size,w.height).some(id=>w.tiles[id].terrain==='water')&&(t.ownerId===n.id||t.occupiedBy===n.id||canPassMilitaryTile(w,n.id,t)));
   if(type==='MOVE_ARMY')tileChoice(t=>t.ownerId===n.id||t.occupiedBy===n.id||canPassMilitaryTile(w,n.id,t));
   if(['TRAIN_RESERVES','RECRUIT_ARMY','REINFORCE_ARMY','EMERGENCY_MUSTER'].includes(type)){
     const input=E('input','player-input');input.type='number';input.min=type==='REINFORCE_ARMY'?'1':'12';input.max=type==='TRAIN_RESERVES'?String(trainingRate(w,n.id)):type==='RECRUIT_ARMY'?'150':type==='EMERGENCY_MUSTER'?'40':'100';input.step='1';
     input.value=String(draft.amount??(type==='REINFORCE_ARMY'?10:30));draft.amount=Number(input.value);
     input.addEventListener('input',()=>{draft.amount=Number(input.value);updatePreview();});fields.append(group('인원',input));
   }
   if(type==='RAISE_ARTILLERY'){
     const input=E('input','player-input');input.type='number';input.min='1';input.max='3';input.step='1';input.value=String(draft.guns??1);draft.guns=Number(input.value);
     input.addEventListener('input',()=>{draft.guns=Number(input.value);updatePreview();});
     fields.append(group('전장포 수 (문 · 8명/문; 정원 150명일 때 보병 소수 재편)',input));
   }
   if(type==='RECRUIT_ARMY')options('unitType','병종',Object.values(UNIT_TYPES).filter(v=>v.branch!=='artillery'&&loadoutLegal(w,n.id,v.id)).map(v=>[v.id,v.label]));
   if(['TRADE_BUY','TRADE_SELL'].includes(type)){
     options('targetNationId','교역 상대',nations(other=>Boolean(tradeRoute(w,n.id,other.id))));
     options('resource','자원',Object.entries(TRADE_GOODS).map(([id,g])=>[id,g.label]));
     const input=E('input','player-input');input.type='number';input.min='1';input.max='10000';input.step='1';input.value=String(draft.amount??10);draft.amount=Number(input.value);
     input.addEventListener('input',()=>{draft.amount=Number(input.value);updatePreview();});fields.append(group('거래 수량',input));
   }
   if(type==='RESPOND_DEFENSE_CALL'||type==='RESPOND_ATTACK_CALL'){
     const available=w.diplomacy.calls.filter(c=>c.allyId===n.id&&c.status==='PENDING'&&c.expiresDay>w.dayIndex&&w.wars.some(x=>x.id===c.warId)&&(type==='RESPOND_ATTACK_CALL'?c.side==='attackers':(c.side||'defenders')==='defenders'));
     options('warId',type==='RESPOND_ATTACK_CALL'?'공격 요청':'방어 요청',available.map(c=>[c.warId,`${w.nations[c.principalId??c.defenderId].name} 지원 (전쟁 #${c.warId})`]));
     options('accept','참전 여부',[[true,'참전 수락'],[false,'참전 거절']],true);
     draft.accept=draft.accept===true||draft.accept==='true';
   }
   if(['OFFER_PEACE','ACCEPT_PEACE','REJECT_PEACE'].includes(type)){
     const compatible=borders().filter(war=>[war.attackerId,war.defenderId].includes(n.id)&&
       (type==='OFFER_PEACE'?!war.pendingPeace:war.pendingPeace&&war.pendingPeace.proposerId!==n.id));
     options('warId','대상 전쟁',compatible.map(war=>[war.id,`#${war.id} · ${war.kind==='INDEPENDENCE'?'독립전쟁':'영토전쟁'} · ${w.nations[war.attackerId].name} vs ${w.nations[war.defenderId].name}`]));
     if(draft.warId!=null){const war=compatible.find(w=>w.id===draft.warId);
       if(war)draft.targetNationId=war.attackerId===n.id?war.defenderId:war.attackerId;}
   }
   if(type==='OFFER_PEACE'){
     const input=E('input','player-input');input.type='number';input.min='0';input.max='100';input.step='1';
     input.value=String(Math.round((draft.reparationRate??1)*100));draft.reparationRate=Number(input.value)/100;
     input.addEventListener('input',()=>{draft.reparationRate=Math.max(0,Math.min(1,Number(input.value)/100));updatePreview();});
     fields.append(group('기준 배상금 대비 요구 강도 (%)',input));
     const opts=borders().filter(war=>war.attackerId===n.id||war.defenderId===n.id);
     const eligible=opts.some(war=>v06bForceEligible(w,war,warOutcome(w,war))&&warOutcome(w,war).winnerId===n.id);
     if(eligible){
       const cb=E('input','');cb.type='checkbox';cb.checked=!!draft.subjectDemand;
       cb.addEventListener('change',()=>{draft.subjectDemand=cb.checked;updatePreview();});
       fields.append(group('결정적 승리: 영토·배상금 대신 종속 요구',cb));
     }else draft.subjectDemand=false;
   }
   if(['DECLARE_WAR','BETRAY_ALLIANCE','IMPROVE_RELATIONS','OFFER_ALLIANCE','ACCEPT_ALLIANCE','REJECT_ALLIANCE','END_ALLIANCE','OFFER_SUBMISSION','ACCEPT_SUBMISSION','REJECT_SUBMISSION','OFFER_RELEASE','ACCEPT_RELEASE','REJECT_RELEASE',...C2_ACTIONS.filter(t=>t!=='DECLARE_INDEPENDENCE')].includes(type)){
     options('targetNationId','상대 국가',nations(other=>{
       const war=borders().find(v=>v.attackerId===other.id||v.defenderId===other.id);
       if(C2_ACTIONS.includes(type))return c2IndependenceActionLegal(w,n.id,{type,targetNationId:other.id});
       if(['OFFER_SUBMISSION','ACCEPT_SUBMISSION','REJECT_SUBMISSION','OFFER_RELEASE','ACCEPT_RELEASE','REJECT_RELEASE'].includes(type))return v06bActionLegal(w,n.id,{type,targetNationId:other.id});
       if(type==='IMPROVE_RELATIONS')return allianceActionLegal(w,n.id,{type,targetNationId:other.id});
       if(type==='OFFER_ALLIANCE')return allianceActionLegal(w,n.id,{type,targetNationId:other.id});
       if(type==='ACCEPT_ALLIANCE'||type==='REJECT_ALLIANCE'||type==='END_ALLIANCE')return allianceActionLegal(w,n.id,{type,targetNationId:other.id});
       return type==='BETRAY_ALLIANCE'?isMilitaryActionLegal(w,n.id,{type,targetNationId:other.id}):type==='DECLARE_WAR'?isMilitaryActionLegal(w,n.id,{type,targetNationId:other.id}):false;
     }));
   }
   updatePreview();
 }
 run.addEventListener('click',()=>{
   updatePreview();if(run.disabled)return;
   const action=buildAction();const result=onAction(n.id,action);
   if(!result?.ok)updatePreview();
 });
 drawFields();
}


