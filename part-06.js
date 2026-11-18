// --- src/sim/warfare.js ---






/** Nation-neutral military orders and lightweight AI; one-to-one wars, cohort-based armies. */







const cap=(n,a,b)=>Math.max(a,Math.min(b,n));
const getArmy=(w,id)=>w.armies.find(a=>a.id===id);
const atWar=(w,a,b)=>warAgainst(w,a,b);
function armyOffensiveReady(w,a){
  const r=a?.f3fRout;if(!r)return true;
  return (manpower(a)>=r.minimumMen||manpower(a)===0&&a.hAutomatonGroupIds?.length>0)&&a.morale>=F3F_RALLY_MORALE;
}
function clearRoutIfRecovered(w,a){
  if(a.f3fRout&&armyOffensiveReady(w,a)){delete a.f3fRout;w.changeSeq++;}
}
function isFriendlyRecoveryTile(w,a,t){
  return Boolean(t&&t.occupiedBy===null&&(t.ownerId===a.nationId||allyAccess(w,a.nationId,t.ownerId)));
}

/** E2: coalition members may cross their own side and invade the opposing side. */
function canPassMilitaryTile(w,id,t){
  if(!t)return false;
  if(allyAccess(w,id,t.ownerId)||t.occupiedBy===id)return true;
  if(t.occupiedBy!==null&&warsOfNation(w,id).some(v=>warSide(v,t.occupiedBy)===warSide(v,id)))return true;
  const war=warAgainst(w,id,t.ownerId);
return Boolean(war&&warSide(war,id)&&warSide(war,id)!==warSide(war,t.ownerId));
}
const nationManpower=(w,id)=>w.armies.filter(a=>a.nationId===id).reduce((s,a)=>s+manpower(a),0);
const ownArmyCount=(w,id)=>w.armies.filter(a=>a.nationId===id).length;
function event(w,text,kind='war'){
  w.events.push({dayIndex:w.dayIndex,text,kind});if(w.events.length>180)w.events.shift();
  if(kind==='fall'||kind==='diplomacy'&&/상호 방위 동맹을 체결|동맹을 해제|동맹 기간 만료|동맹 갱신/.test(text)||kind==='war'&&/참전했습니다/.test(text))recordHistoricalEvent(w,kind,text);
  w.changeSeq++;
}
function spawnCommander(w,nationId){
  const syll=['카르','렌','세','에르','다','미','델','로','아르','베','테','시'];
  const ending=['딘','안','온','릭','렌','미르','리아','아','드','스'];
  const name=syll[Math.floor(randCombat(w)*syll.length)]+ending[Math.floor(randCombat(w)*ending.length)];
  const c={id:w.nextCharacterId++,nationId,role:'commander',name,age:25+Math.floor(randCombat(w)*24),alive:true,
    command:35+Math.round(randCombat(w)*55),attack:30+Math.round(randCombat(w)*60),defense:30+Math.round(randCombat(w)*60),experience:0,victories:0};
  w.characters.push(c);return c;
}
function landRoute(w,start,target,allowed,nationId=null,precomputedFortNet=null){
  if(nationId===null)return shortestRoadPath(w,start,target,allowed,'military',null,null);
  const net=precomputedFortNet||fortificationNetwork(w);
  // A hostile fort is an assault target, never a free transit corridor.
  if(start!==target&&hostileFortUncaptured(w,start,nationId,net))return null;
  return shortestRoadPath(w,start,target,t=>allowed(t)&&!fortLineBlocks(w,t.id,nationId,net),'military',
    id=>!hostileFortUncaptured(w,id,nationId,net),nationId,net);
}
/** V0.3D4: explicit coastal crossing. Only contiguous WATER is traversed; inland
 * targets, neutral coastal conquest and unlimited ocean teleportation are forbidden.
 * The returned path consists of water cells between two coastal land cells. */
const MAX_SEA_TILES=24;
function seaLandingRoute(w,originId,destId,maxWater=MAX_SEA_TILES){
  const start=w.tiles[originId],end=w.tiles[destId];
  if(!start||!end||start.terrain==='water'||end.terrain==='water'||start.id===end.id)return null;
  const starts=neighbors4(originId,w.size,w.height).filter(id=>w.tiles[id].terrain==='water');
  const ends=new Set(neighbors4(destId,w.size,w.height).filter(id=>w.tiles[id].terrain==='water'));
  if(!starts.length||!ends.size)return null;
  const visited=new Int16Array(w.tiles.length).fill(-1),previous=new Int32Array(w.tiles.length).fill(-1),queue=[];
  for(const id of starts){visited[id]=1;queue.push(id);}
  for(let qi=0;qi<queue.length;qi++){
    const id=queue[qi],depth=visited[id];
    if(ends.has(id)){const path=[id];let c=id;while(previous[c]>=0){c=previous[c];path.push(c);}path.reverse();return path;}
    if(depth>=maxWater)continue;
    for(const nb of neighbors4(id,w.size,w.height))if(visited[nb]===-1&&w.tiles[nb].terrain==='water'){
      visited[nb]=depth+1;previous[nb]=id;queue.push(nb);
    }
  }
  return null;
}
function maritimeContact(w,nationId,otherId){
  const shores=w.tiles.filter(t=>t.ownerId===nationId&&t.terrain!=='water'&&neighbors4(t.id,w.size,w.height).some(id=>w.tiles[id].terrain==='water'));
  const targetCoasts=new Set(w.tiles.filter(t=>t.ownerId===otherId&&t.terrain!=='water'&&neighbors4(t.id,w.size,w.height).some(id=>w.tiles[id].terrain==='water')).map(t=>t.id));
  if(!shores.length||!targetCoasts.size)return false;
  const visited=new Uint8Array(w.tiles.length),queue=[];
  for(const t of shores)for(const id of neighbors4(t.id,w.size,w.height))if(w.tiles[id].terrain==='water'&&!visited[id]){visited[id]=1;queue.push(id);}
  for(let i=0;i<queue.length;i++){
    const id=queue[i],depth=visited[id];
    for(const nb of neighbors4(id,w.size,w.height)){
      if(targetCoasts.has(nb))return true;
      if(depth<MAX_SEA_TILES&&w.tiles[nb].terrain==='water'&&!visited[nb]){visited[nb]=depth+1;queue.push(nb);}
    }
  }
  return false;
}
function canLandAt(w,nationId,tile){return !!tile&&tile.terrain!=='water'&&!fortLineBlocks(w,tile.id,nationId)&&
  (tile.ownerId===nationId||tile.occupiedBy===nationId||
    (tile.ownerId!==null&&canPassMilitaryTile(w,nationId,tile)));
}
function finishSeaVoyage(w,a){
  const voyage=a.seaTransit,dest=w.tiles[voyage.destinationId],origin=w.tiles[voyage.originId];
  // If hostilities ended during the voyage, return to the embarkation coast.
  const legal=canLandAt(w,a.nationId,dest);
  const target=legal?dest:origin;
  a.tileId=target.id;a.status='READY';a.seaTransit=null;
  a.nextMoveDay=w.dayIndex+Math.max(2,marchDays(target,w,a.nationId));
  a.needsOrders=true;a.order=null;a.operation=null;
  const defenders=w.armies.filter(v=>v.id!==a.id&&v.tileId===target.id&&v.nationId!==a.nationId&&v.status!=='SAILING'&&atWar(w,v.nationId,a.nationId)&&hCombatPresence(w,v)>0);
  if(defenders.length){const defender=defenders.find(v=>v.engagementId===null);if(defender)startEngagement(w,a,defender,target.id,atWar(w,a.nationId,defender.nationId).id);}
  if(legal&&target.ownerId!==a.nationId&&target.ownerId!==null){const war=atWar(w,a.nationId,target.ownerId);if(war)chargeMilitaryOperation(w,a.nationId,manpower(a)*.15,war.id,'landing');}
  event(w,legal?`${w.nations[a.nationId].name} 제${a.id+1}군이 해안 (${target.x},${target.y})에 상륙했습니다.`:`${w.nations[a.nationId].name} 제${a.id+1}군이 종전/상륙 불가로 원래 해안에 귀항했습니다.`,'army');
  w.changeSeq++;
}
function isSupplied(w,a){return hasSupplyLine(w,a);}
const MILITARY_ACTIONS=['REDEPLOY_COHORT','REARM_ARMY','TRAIN_RESERVES','TRAIN_FORMATION','EMERGENCY_MUSTER','RECRUIT_ARMY','RAISE_ARTILLERY','REINFORCE_ARMY','MOVE_ARMY','LAND_ARMY','DISBAND_ARMY','DECLARE_WAR','BETRAY_ALLIANCE','IMPROVE_RELATIONS','OFFER_ALLIANCE','ACCEPT_ALLIANCE','REJECT_ALLIANCE','END_ALLIANCE','RESPOND_DEFENSE_CALL','RESPOND_ATTACK_CALL','MAKE_PEACE','OFFER_PEACE','ACCEPT_PEACE','REJECT_PEACE','OFFER_SUBMISSION','ACCEPT_SUBMISSION','REJECT_SUBMISSION','OFFER_RELEASE','ACCEPT_RELEASE','REJECT_RELEASE',...C2_ACTIONS];
function isMilitaryActionLegal(w,nationId,act){
  const n=w.nations[nationId];if(!n?.active||!act||!MILITARY_ACTIONS.includes(act.type))return false;
  const army=getArmy(w,act.armyId);
  if(C2_ACTIONS.includes(act.type))return c2IndependenceActionLegal(w,nationId,act);
  if(['OFFER_SUBMISSION','ACCEPT_SUBMISSION','REJECT_SUBMISSION','OFFER_RELEASE','ACCEPT_RELEASE','REJECT_RELEASE'].includes(act.type))return v06bActionLegal(w,nationId,act);
  if(['IMPROVE_RELATIONS','OFFER_ALLIANCE','ACCEPT_ALLIANCE','REJECT_ALLIANCE','END_ALLIANCE'].includes(act.type))return allianceActionLegal(w,nationId,act);
  if(act.type==='RESPOND_DEFENSE_CALL')return callResponseLegal(w,nationId,act);
  if(act.type==='RESPOND_ATTACK_CALL')return offensiveCallLegal(w,nationId,act);
  switch(act.type){
    case 'TRAIN_RESERVES':{
      const s=w.settlements.find(s=>s.id===act.settlementId&&s.ownerId===nationId);
      return Boolean(safeSettlement(w,s,nationId)&&s.population-act.amount>=12&&mayTrain(w,nationId,act.amount));
    }
    case 'TRAIN_FORMATION':return Boolean(army?.nationId===nationId&&army.status==='READY'&&army.engagementId===null&&!army.order&&c3ArmyPending(army)===0&&
       manpower(army)>=12&&atSafeSettlement(w,army)&&army.formationExperience?.xp<b4aTrainingCeiling(army)&&w.dayIndex-army.formationExperience.lastTrainingDay>=30);
    case 'EMERGENCY_MUSTER':return b4aEmergencyEligible(w,nationId,act);
    case 'REDEPLOY_COHORT':return g5RedeployLegal(w,nationId,act);
    case 'REARM_ARMY':return rearmLegal(w,nationId,act);
    case 'RECRUIT_ARMY':{
      const s=w.settlements.find(s=>s.id===act.settlementId&&s.ownerId===nationId);
      return Boolean(safeSettlement(w,s,nationId)&&Number.isInteger(act.amount)&&act.amount>=12&&act.amount<=150&&n.military.reserveReady>=act.amount&&activeManpower(w,nationId)+act.amount<=militaryCapacity(w,nationId)&&ownArmyCount(w,nationId)<armyLimit(w,nationId)&&Boolean(recruitmentPlan(act))&&recruitmentPlan(act).every(part=>loadoutLegal(w,nationId,part.typeId)));
    }
    case 'RAISE_ARTILLERY':{
      const crew=E2_GUN_CREW*act.guns;
      const newRecruits=manpower(army||{units:[]})+crew<=150;
      const levyReserves=army?e2ReserveLevyCrew(army):0;
      return Boolean(Number.isSafeInteger(act.guns)&&act.guns>=1&&act.guns<=3&&
       hasTech(w,nationId,'field_artillery_casting')&&e2FieldWorkshop(w,nationId)&&
       army?.nationId===nationId&&army.status==='READY'&&army.engagementId===null&&!army.order&&!army.rearmPlan&&
       atSafeSettlement(w,army)&&
       (newRecruits?n.military.reserveReady>=crew&&activeManpower(w,nationId)+crew<=militaryCapacity(w,nationId):levyReserves>=crew)&&
       deployedManpower(army,'front')>=crew*2);
    }
    case 'REINFORCE_ARMY':{
      const s=w.settlements.find(s=>s.id===act.settlementId&&s.ownerId===nationId);
      const t=army&&w.tiles[army.tileId];
      return Boolean(safeSettlement(w,s,nationId)&&army?.nationId===nationId&&army.status==='READY'&&army.engagementId===null&&
        army.tileId===s.coreTileId&&t?.ownerId===nationId&&t.occupiedBy===null&&
        Number.isInteger(act.amount)&&act.amount>=1&&act.amount<=100&&n.military.reserveReady>=act.amount&&activeManpower(w,nationId)+act.amount<=militaryCapacity(w,nationId)&&
        reinforcementPlan(army,act.amount,act.unitId??null));
    }
    case 'MOVE_ARMY':{
      if(!army||army.nationId!==nationId||army.status!=='READY'||!Number.isInteger(act.targetTileId)||manpower(army)===0&&hEffective(w,army)<=0&&!h1dTowAllowed(w,army,act.targetTileId))return false;
      const t=w.tiles[act.targetTileId];
      if(!t||!TERRAINS[t.terrain].passable)return false;
      const route=landRoute(w,army.tileId,t.id,x=>canPassMilitaryTile(w,nationId,x),nationId);
      if(!route||v08fTanks(w,army).length&&route.some(id=>w.tiles[id]?.terrain==='mountain'))return false;
      if(!armyOffensiveReady(w,army)&&route.some(id=>!isFriendlyRecoveryTile(w,army,w.tiles[id])))return false;
      return true;
    }
    case 'LAND_ARMY':{
      if(v08fTanks(w,army).length)return false;
      if(!army||army.nationId!==nationId||army.status!=='READY'||army.engagementId!==null||!Number.isInteger(act.targetTileId)||manpower(army)===0&&hEffective(w,army)<=0)return false;
      if(!armyOffensiveReady(w,army)||!canLandAt(w,nationId,w.tiles[act.targetTileId]))return false;
      return Boolean(seaLandingRoute(w,army.tileId,act.targetTileId));
    }
    case 'DISBAND_ARMY':return Boolean(army&&army.nationId===nationId&&army.engagementId===null&&w.tiles[army.tileId]?.ownerId===nationId&&w.settlements.some(s=>safeSettlement(w,s,nationId)&&s.coreTileId===army.tileId));
    case 'DECLARE_WAR':case 'BETRAY_ALLIANCE':{
      const target=w.nations[act.targetNationId];
      const live=Boolean(target&&allianceBetween(w,nationId,target.id));
      if(v06bSubjectOf(w,nationId)||v06bBetween(w,nationId,target?.id)||v06bSubjectOf(w,target?.id)?.overlordId===nationId)return false;
      if(act.type==='BETRAY_ALLIANCE'?!live||!e5BetrayalEligible(w,nationId,target.id,true):live)return false;
      if(!target?.active||target.id===nationId||atWar(w,nationId,target.id)||!c2CanStartWar(w,[nationId],[target.id]))return false;
      if((n.truces?.[target.id]||0)>w.dayIndex||(target.truces?.[nationId]||0)>w.dayIndex)return false;
      if(!w.armies.some(a=>a.nationId===nationId&&hCombatPresence(w,a)>=12))return false;
      return w.tiles.some(t=>t.ownerId===nationId&&neighborsMilitary8(t.id,w.size,w.height).some(x=>w.tiles[x].ownerId===target.id&&militaryStepPermitted(w,t.id,x,nationId)))||(w.size===100&&maritimeContact(w,nationId,target.id));
    }
    case 'OFFER_PEACE':{
      const war=c2PeaceWar(w,nationId,act);
      return Boolean(war&&[war.attackerId,war.defenderId].includes(nationId)&&
        (act.reparationRate===undefined||(Number.isFinite(act.reparationRate)&&act.reparationRate>=0&&act.reparationRate<=1))&&
        (!act.subjectDemand||war.kind!=='INDEPENDENCE'&&v06bForceEligible(w,war,warOutcome(w,war)))&&
        w.dayIndex-war.startedDay>=90&&!war.pendingPeace&&w.dayIndex>=(war.nextPeaceOfferDay||0));
    }
    case 'MAKE_PEACE':case 'ACCEPT_PEACE':{
      const war=c2PeaceWar(w,nationId,act);
      return Boolean(war&&[war.attackerId,war.defenderId].includes(nationId)&&war.pendingPeace&&
        war.pendingPeace.proposerId!==nationId&&w.dayIndex-war.startedDay>=90&&
        (!war.pendingPeace.terms.subjectDemand||v06bForceEligible(w,war,war.pendingPeace.terms)));
    }
    case 'REJECT_PEACE':{
      const war=c2PeaceWar(w,nationId,act);
      return Boolean(war&&[war.attackerId,war.defenderId].includes(nationId)&&war.pendingPeace&&war.pendingPeace.proposerId!==nationId);
    }
    default:return false;
  }
}
function transferCore(w,settlementId,newOwner){
  const s=w.settlements.find(s=>s.id===settlementId);if(!s||s.ownerId===newOwner)return;
  const oldOwner=s.ownerId;
  e1OnSettlementTransfer(w,settlementId,oldOwner,newOwner);
  i2OnTransfer(w,settlementId,oldOwner,newOwner);
  const movedBarracks=w.buildings.filter(b=>b.typeId==='barracks'&&s.tileIds.includes(b.tileId));
  const loser=w.nations[s.ownerId],winner=w.nations[newOwner];
  loser.settlementIds=loser.settlementIds.filter(id=>id!==s.id);winner.settlementIds.push(s.id);
  if(loser.capitalId===s.coreTileId)markCapitalHistory(s,loser.id);
  s.ownerId=newOwner; // The geographic name and historical capitals never change on conquest.
  d1bRecordTransfer(w,s,oldOwner,newOwner);d2aTransfer(w,s);d2bOnTransfer(w,s);
  e5InvalidateBorders(w);
  for(const id of s.tileIds){w.tiles[id].ownerId=newOwner;w.tiles[id].occupiedBy=null;w.tiles[id].occupiedWarId=null;for(const d of w.defenses||[])if(d.tileId===id)delete d.repair;}
  v04e2RegisterBarracksEvent(w,'SETTLEMENT_TRANSFER',[oldOwner,newOwner],s.id,movedBarracks);
  // No physical deletion: candidate selection immediately re-evaluates both owners.
}
/** Select ONLY completed occupied land. Settlement footprints are atomic and
 * may join the existing border through ANY member, not just their core.
 * Re-evaluate adjacency after each transfer, keeping the resulting territory connected. */
function planPeaceCessions(w,winnerId,loserId,tier){
  const max=cessionLimit(tier,w);
  const related=w.wars.find(war=>warSide(war,winnerId)&&warSide(war,loserId)&&warSide(war,winnerId)!==warSide(war,loserId));
  const winners=related?new Set(warFriends(related,winnerId)):new Set([winnerId]);
  const occ=w.tiles.filter(t=>t.ownerId===loserId&&winners.has(t.occupiedBy));
  const occupationIds=new Set(occ.map(t=>t.id));
  const grouped=new Set(),candidates=[];
  let partialSettlementTiles=0;
  for(const s of w.settlements){
    if(s.ownerId!==loserId)continue;
    const parts=s.tileIds.filter(id=>occupationIds.has(id));
    if(!parts.length)continue;
    for(const id of parts)grouped.add(id);
    if(parts.length!==s.tileIds.length){partialSettlementTiles+=parts.length;
      if(parts.includes(s.coreTileId)&&parts.length/s.tileIds.length>=.60&&['CLEAR','DECISIVE'].includes(tier))
        candidates.push({id:`s${s.id}`,settlementId:s.id,tileIds:s.tileIds.slice(),size:s.tileIds.length});
      for(const tid of parts)if(tid!==s.coreTileId)candidates.push({id:`p${tid}`,settlementId:null,partialOf:s.id,tileIds:[tid],size:1});
      continue;}
    candidates.push({id:`s${s.id}`,settlementId:s.id,tileIds:s.tileIds.slice(),size:s.tileIds.length});
  }
  for(const t of occ)if(!grouped.has(t.id)&&t.settlementId===null)
    candidates.push({id:`t${t.id}`,settlementId:null,tileIds:[t.id],size:1});
  const accepted=[],allocated=new Set(),included=new Set(w.tiles.filter(t=>t.ownerId===winnerId).map(t=>t.id));
  const totalCandidateTiles=new Set(candidates.flatMap(c=>c.tileIds)).size;
  const adjacency=c=>c.tileIds.reduce((sum,id)=>sum+neighbors4(id,w.size,w.height).filter(nb=>included.has(nb)).length,0);
  // Theoretical eligibility without cap: expansion through fully occupied groups only.
  const possible=new Set(included);let change=true;
  while(change){change=false;
    for(const c of candidates){
      if(c.tileIds.every(id=>possible.has(id)))continue;
      if(c.tileIds.some(id=>neighbors4(id,w.size,w.height).some(nb=>possible.has(nb)))){
        for(const id of c.tileIds)possible.add(id);change=true;
      }
    }
  }
  const connectedCandidateTiles=new Set(candidates.filter(c=>c.tileIds.every(id=>possible.has(id))).flatMap(c=>c.tileIds)).size;
  const goalTile=w.wars.find(v=>[v.attackerId,v.defenderId].includes(winnerId)&&[v.attackerId,v.defenderId].includes(loserId))?.goal?.targetTileId;
  let acquired=0;
  while(acquired<max){
    let best=null,bestScore=-Infinity;
    for(const c of candidates){
      if(c.selected||acquired+c.size>max||c.tileIds.some(tid=>allocated.has(tid)))continue;
      const contact=adjacency(c);if(!contact)continue;
      // Reward nearby occupied clusters and fully taken towns, but do not favor map ID.
      // A bigger footprint is an atomic investment, so compare border efficiency per tile.
      const goal=c.tileIds.includes(goalTile);
      const singleFaces=c.tileIds.reduce((sum,id)=>sum+neighbors4(id,w.size,w.height).filter(nb=>included.has(nb)).length,0);
      const score=(goal?20:0)+(c.settlementId!==null?4:0)+singleFaces*2.7/Math.sqrt(c.size)+contact*.5-c.size*.13;
      if(score>bestScore||(score===bestScore&&c.tileIds[0]<(best?.tileIds[0]??Infinity))){best=c;bestScore=score;}
    }
    if(!best)break;
    best.selected=true;accepted.push(best);acquired+=best.size;
    for(const id of best.tileIds){included.add(id);allocated.add(id);}
  }
  return {max,occupiedAtPeace:occ.length,partialSettlementTiles,connectedCandidateTiles,
    disconnectedTiles:totalCandidateTiles-connectedCandidateTiles,capOrPriorityRemainder:Math.max(0,connectedCandidateTiles-acquired),
    groups:accepted,acquired};
}

/** E3: normalized same-side contribution shares from actual ledgers. */
function coalitionContributionShares(w,war,side){
  const members=warFriends(war,side==='attackers'?war.attackerId:war.defenderId).slice().sort((a,b)=>a-b);
  const metrics={occupation:Object.create(null),battle:Object.create(null),cost:Object.create(null),loss:Object.create(null)};
  for(const id of members){
    metrics.occupation[id]=Math.max(0,Number(war.occupationWork?.[id]||0))+20*Math.max(0,Number(war.occupationContributions?.[id]||0));
    metrics.battle[id]=Math.max(0,Number(war.battleWins?.[id]||0));
    metrics.cost[id]=Math.max(0,Number(war.militaryCosts?.[id]||0));
    metrics.loss[id]=Math.max(0,Number(war.casualties?.[id]||0));
  }
  const weights={occupation:.40,battle:.30,cost:.20,loss:.10};
  const active=Object.keys(weights).filter(key=>members.some(id=>metrics[key][id]>0));
  const shares=Object.fromEntries(members.map(id=>[id,0]));
  if(!members.length)return shares;
  if(!active.length){shares[side==='attackers'?war.attackerId:war.defenderId]=1;return shares;}
  const activeWeight=active.reduce((sum,key)=>sum+weights[key],0);
  for(const key of active){
    const total=members.reduce((sum,id)=>sum+metrics[key][id],0);
    for(const id of members)shares[id]+=weights[key]/activeWeight*metrics[key][id]/total;
  }
  return shares;
}
/** Stable largest-remainder allocation of ACTUAL transferred gold, with principal diplomatic share. */
function allocateCoalitionGold(amount,shares,principalId){
  const ids=Object.keys(shares).map(Number).sort((a,b)=>a-b);
  const result=Object.fromEntries(ids.map(id=>[id,0]));
  if(!ids.length||amount<=0)return result;
  const raw=ids.map(id=>({id,value:amount*((id===principalId?.30:0)+.70*shares[id])}));
  let left=amount;
  for(const r of raw){result[r.id]=Math.floor(r.value);left-=result[r.id];r.frac=r.value-result[r.id];}
  raw.sort((a,b)=>b.frac-a.frac||a.id-b.id);
  for(let i=0;i<left;i++)result[raw[i%raw.length].id]++;
  return result;
}
/** E3: one coalition-wide cession budget, attributed to actually contiguous winning nations. */
function planCoalitionPeaceCessions(w,war,winnerId,loserId,tier,shares){
  const max=cessionLimit(tier,w),side=warSide(war,winnerId);
  const recipients=warFriends(war,winnerId).slice().sort((a,b)=>a-b);
  const winners=new Set(recipients),occupied=w.tiles.filter(t=>t.ownerId===loserId&&winners.has(t.occupiedBy));
  const occupiedIds=new Set(occupied.map(t=>t.id)),grouped=new Set(),candidates=[];
  let partialSettlementTiles=0;
  for(const settlement of w.settlements){
    if(settlement.ownerId!==loserId)continue;
    const parts=settlement.tileIds.filter(id=>occupiedIds.has(id));
    if(!parts.length)continue;
    for(const id of parts)grouped.add(id);
    if(parts.length!==settlement.tileIds.length){
      partialSettlementTiles+=parts.length;
      if(parts.includes(settlement.coreTileId)&&parts.length/settlement.tileIds.length>=.60&&['CLEAR','DECISIVE'].includes(tier))
        candidates.push({id:`s${settlement.id}`,settlementId:settlement.id,tileIds:settlement.tileIds.slice(),size:settlement.tileIds.length});
      for(const tid of parts)if(tid!==settlement.coreTileId)
        candidates.push({id:`p${tid}`,settlementId:null,partialOf:settlement.id,tileIds:[tid],size:1});
      continue;
    }
    candidates.push({id:`s${settlement.id}`,settlementId:settlement.id,tileIds:settlement.tileIds.slice(),size:settlement.tileIds.length});
  }
  for(const tile of occupied)if(!grouped.has(tile.id)&&tile.settlementId===null)
    candidates.push({id:`t${tile.id}`,settlementId:null,tileIds:[tile.id],size:1});
  const included=Object.fromEntries(recipients.map(id=>[id,new Set(w.tiles.filter(t=>t.ownerId===id).map(t=>t.id))]));
  const reachable=new Set(recipients.flatMap(id=>[...included[id]]));
  let added=true;while(added){added=false;
    for(const c of candidates){if(c.tileIds.every(id=>reachable.has(id)))continue;
      if(c.tileIds.some(id=>neighbors4(id,w.size,w.height).some(nb=>reachable.has(nb)))){
        for(const id of c.tileIds)reachable.add(id);added=true;
      }
    }
  }
  const connectedCandidateTiles=new Set(candidates.filter(c=>c.tileIds.every(id=>reachable.has(id))).flatMap(c=>c.tileIds)).size;
  const totalCandidateTiles=new Set(candidates.flatMap(c=>c.tileIds)).size;
  const selected=[],allocated=new Set();let acquired=0;
  while(acquired<max){
    let choice=null,best=-Infinity;
    for(const c of candidates){if(c.selected||acquired+c.size>max||c.tileIds.some(tid=>allocated.has(tid)))continue;
      for(const id of recipients){
        const contact=c.tileIds.reduce((sum,tileId)=>sum+neighbors4(tileId,w.size,w.height).filter(nb=>included[id].has(nb)).length,0);
        if(!contact)continue;
        const local=c.tileIds.filter(tileId=>w.tiles[tileId].occupiedBy===id).length/c.size;
        const goal=c.tileIds.includes(war.goal?.targetTileId)&&id===war.attackerId;
        const score=(goal?20:0)+(c.settlementId!==null?4:0)+contact*3/Math.sqrt(c.size)+6*(shares[id]||0)+2*local-c.size*.13;
        if(score>best+1e-9||Math.abs(score-best)<=1e-9&&(c.tileIds[0]<(choice?.group.tileIds[0]??Infinity)||c.tileIds[0]===choice?.group.tileIds[0]&&id<choice.recipientId)){
          choice={group:c,recipientId:id};best=score;
        }
      }
    }
    if(!choice)break;
    choice.group.selected=true;selected.push({...choice.group,recipientId:choice.recipientId});
    acquired+=choice.group.size;
    for(const id of choice.group.tileIds){included[choice.recipientId].add(id);allocated.add(id);}
  }
  return {max,occupiedAtPeace:occupied.length,partialSettlementTiles,connectedCandidateTiles,
    disconnectedTiles:totalCandidateTiles-connectedCandidateTiles,capOrPriorityRemainder:Math.max(0,connectedCandidateTiles-acquired),
    groups:selected,acquired};
}

/** Treaty resolves only a valid negotiated offer, or direct scenario/admin call.
 * White peace has no victor. Cessions require ACTUAL completed occupation.
 */
/** V0.3C treaty: cost of THIS war, loser income horizon, loser treasury cap.
 * 'rate' expresses 0-100% of the computed base, not victor treasury share.
 * Legacy offers retain their contractual old model on migration. */
function quoteWarReparations(w,war,tier,winnerId,loserId,rate=1,legacyTerms=null){
  if(winnerId===null||loserId===null)return {model:'v03c',costBase:0,incomeCap:0,treasuryCap:0,demandedGold:0,capGold:0,reparations:0};
  const winner=w.nations[winnerId],loser=w.nations[loserId];
  if(legacyTerms?.reparationModel==='legacy'){
    const winnerGoldAtOffer=legacyTerms.winnerGoldAtOffer??winner.gold;
    const capRate={LIMITED:.20,CLEAR:.40,DECISIVE:.60}[tier]||0;
    const demandedGold=Math.floor(winnerGoldAtOffer*rate),capGold=Math.floor(loser.gold*capRate);
    return {model:'legacy',winnerGoldAtOffer,capRate,demandedGold,capGold,reparations:Math.min(demandedGold,capGold)};
  }
  const factor={LIMITED:.5,CLEAR:1,DECISIVE:1.5}[tier]||0;
  const quarters={LIMITED:4,CLEAR:8,DECISIVE:16}[tier]||0;
  const capRate={LIMITED:.1,CLEAR:.2,DECISIVE:.3}[tier]||0;
const warCost=(warFriends(war,winnerId)||[winnerId]).reduce((sum,id)=>sum+(war.militaryCosts?.[id]||0),0);
  const costBase=Math.floor(warCost*factor);
  const incomeCap=Math.floor(projectedQuarter(w,loser).goldIncome*quarters);
  const treasuryCap=Math.floor(loser.gold*capRate);
  const base=Math.min(costBase,incomeCap,treasuryCap);
  const demandedGold=Math.floor(base*Math.max(0,Math.min(1,rate)));
  return {model:'v03c',warCost,costBase,incomeCap,treasuryCap,capRate,base,demandedGold,capGold:Math.min(incomeCap,treasuryCap),reparations:demandedGold};
}
/** E1B: Persist a narrow withdrawal corridor until home, including re-routes and save/load.
 * Never grant passage across unrelated neutral-country sovereignty. */
function beginArmyRepatriation(w,army,permittedNationIds){
  if(army.status==='DESTROYED'||army.status==='SAILING'||!hCombatPresence(w,army))return false;
  const existing=army.repatriation?.permittedNationIds||[];
  const permitted=[...new Set([...existing,...permittedNationIds])]
    .filter(id=>id!==army.nationId&&w.nations[id]?.active).sort((a,b)=>a-b);
  army.repatriation={active:true,startedDay:army.repatriation?.startedDay??w.dayIndex,
    destinationNationId:army.nationId,permittedNationIds:permitted};
  army.order=null;army.operation=null;army.needsOrders=false;army.engagementId=null;
  const path=planRetreat(w,army,{repatriation:true});
  army.retreatPath=path?path.slice(1):[];army.regroupDays=army.regroupDays||22;
  if(path&&path.length>1){army.status='RETREATING';army.nextMoveDay=w.dayIndex+3;}
  else if(path&&atSafeSettlement(w,army)){
    army.repatriation=null;army.status='REGROUP';army.regroupUntil=w.dayIndex+army.regroupDays;
  }else{army.status='TRAPPED';army.nextMoveDay=w.dayIndex+10;}
  w.changeSeq++;return true;
}
/** Revocation/expiry of a bilateral treaty: only stranded or en-route forces withdraw.
 * Ongoing shared defensive war retains its separate military-access entitlement. */
function repatriateAfterAllianceEnds(w,a,b){
  let count=0;
  for(const army of w.armies){
    const other=army.nationId===a?b:army.nationId===b?a:null;
    if(other===null||allyAccess(w,army.nationId,other))continue;
    if(w.tiles[army.tileId]?.ownerId!==other&&!army.retreatPath?.some(id=>w.tiles[id]?.ownerId===other))continue;
    if(army.status==='ENGAGED')continue; // shared combat must resolve before forcing a route
    if(beginArmyRepatriation(w,army,[other]))count++;
  }
  return count;
}
function settlePeace(w,war,terms=warOutcome(w,war)){
  const observation=v07d2Traces.get(w)?.enabled?w.engagements.filter(e=>e.warId===war.id).slice():null;
  const a=w.nations[war.attackerId],b=w.nations[war.defenderId];
  const tier=terms.tier,winner=terms.winnerId===null?null:w.nations[terms.winnerId];
  const loser=terms.loserId===null?null:w.nations[terms.loserId];
  const attacking=new Set(warFriends(war,a.id)),defending=new Set(warFriends(war,b.id));
  const capitalBonusAtPeace=warCapitalAdvantage(w,war);
  const participants=structuredClone(war.sides||{attackers:[a.id],defenders:[b.id]});
  const participantNames=Object.fromEntries(warMembers(war).map(id=>[id,w.nations[id].name]));
  const winnerSide=winner?warSide(war,winner.id):null;
  const contributionShares=winnerSide?coalitionContributionShares(w,war,winnerSide):{};
  const sideContributions={attackers:coalitionContributionShares(w,war,'attackers'),defenders:coalitionContributionShares(w,war,'defenders')};
  const occupationAtPeace={
    [a.id]:w.tiles.filter(t=>t.occupiedWarId===war.id&&defending.has(t.ownerId)&&attacking.has(t.occupiedBy)).length,
    [b.id]:w.tiles.filter(t=>t.occupiedWarId===war.id&&attacking.has(t.ownerId)&&defending.has(t.occupiedBy)).length
  };
  const subjugation=Boolean(war.kind!=='INDEPENDENCE'&&war.kind!=='SECESSION'&&terms.subjectDemand&&v06bForceEligible(w,war,terms));
  const cession=war.kind!=='INDEPENDENCE'&&war.kind!=='SECESSION'&&winner&&loser&&!subjugation?planCoalitionPeaceCessions(w,war,winner.id,loser.id,tier,contributionShares):null;
  let count=0;
  const territoryAwards=Object.fromEntries((winner?warFriends(war,winner.id):[]).map(id=>[id,0]));
  if(cession){
    for(const group of cession.groups){
      const recipient=group.recipientId;
      if(group.settlementId!==null)transferCore(w,group.settlementId,recipient);
      else for(const id of group.tileIds)detachCededTile(w,id,recipient);
      count+=group.size;territoryAwards[recipient]+=group.size;
    }
  }
  refreshApCaps(w); // G1: peace settlement/core transfers update AP maxima immediately.
  const transferAudit={occupiedAtPeace:cession?.occupiedAtPeace??0,connectedCandidateTiles:cession?.connectedCandidateTiles??0,
    partialSettlementTiles:cession?.partialSettlementTiles??0,disconnectedTiles:cession?.disconnectedTiles??0,
    blockedByCap:cession?.capOrPriorityRemainder??0,cessionLimit:cession?.max??0};
  const demandRate=winner&&!subjugation?Math.max(0,Math.min(1,Number.isFinite(terms.reparationRate)?terms.reparationRate:1)):0;
  // Legacy pending offers use original formula; newly negotiated treaties use costs.
  const quote=quoteWarReparations(w,war,tier,winner?.id??null,loser?.id??null,demandRate,terms);
  if(subjugation||war.kind==='INDEPENDENCE'||war.kind==='SECESSION'){quote.reparations=0;quote.demandedGold=0;quote.capGold=0;quote.model=subjugation?'SUZERAINTY':war.kind;}
  const {reparations,demandedGold,capGold}=quote;
  const capRate=quote.capRate||0;
  const winnerGoldAtOffer=quote.winnerGoldAtOffer??0;
  const loserGoldAtTreaty=loser?.gold??0;
  const advantage=Number.isFinite(terms.advantage)?terms.advantage:warOutcome(w,war).advantage;
  const reparationAwards=winner?allocateCoalitionGold(reparations,contributionShares,winner.id):{};
  if(winner&&loser){
    loser.gold-=reparations;
    for(const [id,gold] of Object.entries(reparationAwards))w.nations[Number(id)].gold+=gold;
  }
  const secessionOutcome=war.kind==='SECESSION'?d2cApplyPeace(w,war,terms):null;
  clearOccupationForWar(w,war.id);
  for(const t of w.tiles)if(t.occupiedWarId===war.id){t.occupiedBy=null;t.occupiedWarId=null;}
  for(const e of w.engagements.filter(v=>v.warId===war.id))for(const id of new Set([...(e.attackers||[]).map(m=>m.armyId),...(e.defenders||[]).map(m=>m.armyId),e.attackerArmyId,e.defenderArmyId])){
    const army=getArmy(w,id);if(army){army.engagementId=null;army.status='REGROUP';army.regroupUntil=w.dayIndex+22;army.retreatPath=[];}
  }
  w.engagements=w.engagements.filter(v=>v.warId!==war.id);
  w.wars=w.wars.filter(v=>v.id!==war.id);
  for(const call of w.diplomacy.calls.filter(c=>c.warId===war.id&&c.status==='PENDING'))call.status='EXPIRED';
  const truce=truceDuration(tier);
  const trucePairs=[];
  for(const attackerId of participants.attackers)for(const defenderId of participants.defenders){
    const left=w.nations[attackerId],right=w.nations[defenderId];
    left.truces??={};right.truces??={};
    left.truces[defenderId]=Math.max(left.truces[defenderId]||0,w.dayIndex+truce);
    right.truces[attackerId]=Math.max(right.truces[attackerId]||0,w.dayIndex+truce);
    trucePairs.push([attackerId,defenderId]);
  }
  for(const army of w.armies){
    if(army.assignedWarId!==war.id)continue;
    army.assignedWarId=null;army.order=null;army.operation=null;army.needsOrders=false;
    if(atSafeSettlement(w,army)){
      army.repatriation=null;army.status='REGROUP';army.regroupUntil=w.dayIndex+22;army.retreatPath=[];army.engagementId=null;
    }else{
      // Treaty peace authorizes physical withdrawal through former war participants only.
      beginArmyRepatriation(w,army,warMembers(war));
}
  }
  for(const n of warMembers(war).map(id=>w.nations[id])){
    const settlements=w.settlements.filter(s=>s.ownerId===n.id);
    if(!settlements.length){
      n.active=false;n.capitalId=null;n.leaderId=null;n.settlementIds=[];
      e5InvalidateBorders(w);
      for(const t of w.tiles)if(t.ownerId===n.id){t.ownerId=null;t.settlementId=null;t.occupiedBy=null;}
      for(const lost of w.armies)if(lost.nationId===n.id){hOnArmyRemoved(w,lost,'NATION_FALL');e2FinaliseGuns(w,lost,'NATION_FALL');c6RecordArmyEnd(w,lost,'NATION_FALL');g3ObserveArmyRemoval(w,lost,'NATION_FALL');}
      // Stored guns of an extinct nation must not remain available to a nonexistent owner.
      const gunLedger=e2GunInventory(w),abandoned=gunLedger.stocks[n.id]||0;
      gunLedger.destroyed+=abandoned;gunLedger.stocks[n.id]=0;
      w.armies=w.armies.filter(v=>v.nationId!==n.id);
      w.characters=w.characters.filter(c=>c.nationId!==n.id);
      event(w,`${n.name}이(가) 마지막 정착지를 잃고 멸망했습니다.`,'fall');
    }else if(!settlements.some(s=>s.coreTileId===n.capitalId)){
      n.capitalId=settlements[0].coreTileId;markCapitalHistory(settlements[0],n.id);
      event(w,`${n.name}이(가) 수도를 ${settlementDisplayName(w,settlements[0])}(으)로 이전했습니다.`,'war');
    }
  }
  // A nation that fell in this treaty cannot keep diplomatic obligations.
  for(const t of v06bTreaties(w).slice())if(!w.nations[t.overlordId].active||!w.nations[t.subjectId].active)v06bEndTreaty(w,t,'NATION_FALL');
  c4ReviewProtectionPeace(w,war,terms);
  const independence=c2AfterPeace(w,war,terms);
  const subjectTreaty=subjugation?v06bCreateTreaty(w,winner.id,loser.id,'FORCED',war.id):null;
  if(subjugation)v06b1Diag(w).forced[subjectTreaty?'accepted':'invalidated']++;
  for(const t of w.diplomacy.alliances.slice())if(!w.nations[t.a].active||!w.nations[t.b].active)e5EndAlliance(w,t,'NATION_FALL');
  w.diplomacy.offers=w.diplomacy.offers.filter(t=>w.nations[t.from].active&&w.nations[t.to].active);
  w.diplomacy.subjectOffers=w.diplomacy.subjectOffers.filter(t=>w.nations[t.from].active&&w.nations[t.to].active);
  // War memory affects later diplomacy but historical names remain unchanged.
  for(const [attackerId,defenderId] of trucePairs)
    adjustRelation(w,attackerId,defenderId,tier==='WHITE'?-4:-12);
  const result={dayIndex:w.dayIndex,warId:war.id,warKind:war.kind||'TERRITORIAL',independence,secessionOutcome,attackerId:a.id,defenderId:b.id,participants:structuredClone(participants),participantNames,tier,winnerId:winner?.id??null,winningSide:winnerSide,
    acquiredTiles:count,subjectTreaty:subjectTreaty?{overlordId:subjectTreaty.overlordId,subjectId:subjectTreaty.subjectId}:null,reparations,reparationModel:quote.model,advantage,warCost:quote.warCost??null,costBase:quote.costBase??null,incomeCap:quote.incomeCap??null,treasuryCap:quote.treasuryCap??null,reparationRate:demandRate,reparationCapRate:capRate,
    winnerGoldAtOffer,loserGoldAtTreaty,demandedGold,capGold,truceUntil:w.dayIndex+truce,goal:war.goal||null,occupationContributions:structuredClone(war.occupationContributions||{}),contributionShares:structuredClone(sideContributions),reparationAwards,territoryAwards,trucePairs,...transferAudit};
  w.peaceHistory.push(result);if(w.peaceHistory.length>80)w.peaceHistory.shift();
  w.warHistory??=[];
  w.warHistory.push({id:war.id,kind:war.kind||'TERRITORIAL',independence,secessionOutcome,attackerId:a.id,defenderId:b.id,participants:structuredClone(participants),participantNames,winningSide:winnerSide,contributionShares:structuredClone(sideContributions),reparationAwards,territoryAwards,trucePairs,startedDay:war.startedDay,endedDay:w.dayIndex,
    goal:war.goal?structuredClone(war.goal):null,tier,winnerId:winner?.id??null,battles:war.battleCount||0,
    battleWins:Object.fromEntries(warMembers(war).map(id=>[id,war.battleWins?.[id]||0])),
    casualties:Object.fromEntries(warMembers(war).map(id=>[id,war.casualties?.[id]||0])),
    battleCasualties:Object.fromEntries(warMembers(war).map(id=>[id,war.battleCasualties?.[id]||0])),
    pursuitCasualties:Object.fromEntries(warMembers(war).map(id=>[id,war.pursuitCasualties?.[id]||0])),
    occupationCasualties:Object.fromEntries(warMembers(war).map(id=>[id,war.occupationCasualties?.[id]||0])),
    supplyCasualties:Object.fromEntries(warMembers(war).map(id=>[id,war.supplyCasualties?.[id]||0])),
    surrendered:Object.fromEntries(warMembers(war).map(id=>[id,war.surrendered?.[id]||0])),
    occupationCount:war.occupationCount||0,occupationAtPeace,acquiredTiles:count,subjectTreaty:subjectTreaty?{overlordId:subjectTreaty.overlordId,subjectId:subjectTreaty.subjectId}:null,...transferAudit,reparations,
    peaceExtensions:structuredClone(war.peaceExtensions||[]),
    reparationRate:demandRate,reparationCapRate:capRate,winnerGoldAtOffer,loserGoldAtTreaty,demandedGold,capGold,reparationModel:quote.model,advantage,warCost:quote.warCost??null,costBase:quote.costBase??null,incomeCap:quote.incomeCap??null,treasuryCap:quote.treasuryCap??null,
    attackerName:a.name,defenderName:b.name,winnerName:winner?.name??null,
    supportContributions:Object.fromEntries(warMembers(war).filter(id=>id!==a.id&&id!==b.id).map(id=>[id,{battleWins:war.battleWins?.[id]||0,casualties:war.casualties?.[id]||0,militaryCosts:war.militaryCosts?.[id]||0,occupationTiles:war.occupationContributions?.[id]||0}])),
    militaryCosts:Object.fromEntries(warMembers(war).map(id=>[id,war.militaryCosts?.[id]||0])),
    upkeepCosts:Object.fromEntries(warMembers(war).map(id=>[id,war.upkeepCosts?.[id]||0])),
    operationalCosts:Object.fromEntries(warMembers(war).map(id=>[id,war.operationalCosts?.[id]||0])),
    occupationContributions:structuredClone(war.occupationContributions||{}),
    occupationWork:structuredClone(war.occupationWork||{}),capitalOccupationBonusAtPeace:capitalBonusAtPeace,
    reparationsFromId:loser?.id??null,reparationsToId:winner?.id??null,truceDays:truce,score:war.score||0});
  if(w.warHistory.length>200)w.warHistory.shift();
  v06aRememberWarPeace(w,war,tier,winnerSide);
  d1dRecordPeace(w,war,winnerSide,tier);
  const verdict=tier==='WHITE'?'백지 평화':`${winner.name} ${ {LIMITED:'제한적 승리',CLEAR:'명확한 승리',DECISIVE:'결정적 승리'}[tier]}`;
  event(w,`${participants.attackers.map(id=>participantNames[id]).join('·')} VS ${participants.defenders.map(id=>participantNames[id]).join('·')} 평화협정: ${verdict} · 승점 차 ${Math.abs(advantage).toFixed(2)} · 영토 ${count}타일 · 배상 ${reparations}G${subjectTreaty?' · 종속 조약 체결':''}${independence?' · 독립전쟁 '+independence.outcome:''} · 휴전 ${truce/DAYS_PER_YEAR}년.`,'peace');
  recordHistoricalEvent(w,'peace',w.events[w.events.length-1].text,warMembers(war),`war:${war.id}:end`);
  // A defeated state may cease to exist while still listed in *other* wars.
  // Keep unrelated surviving wars running: dismiss fallen supporters, and
  // close only wars whose principal no longer exists.
  const fallen=warMembers(war).filter(id=>!w.nations[id]?.active);
  if(fallen.length){
    for(const other of w.wars.slice().sort((x,y)=>x.id-y.id)){
      if(!fallen.some(id=>warSide(other,id)))continue;
      if(fallen.includes(other.attackerId)||fallen.includes(other.defenderId)){
        settlePeace(w,other,{tier:'WHITE',winnerId:null,loserId:null,advantage:0});
      }else{
        other.sides.attackers=other.sides.attackers.filter(id=>!fallen.includes(id));
        other.sides.defenders=other.sides.defenders.filter(id=>!fallen.includes(id));
        for(const id of fallen)if(other.fatigue)delete other.fatigue[id];
        for(const id of fallen)if(other.lastCasualties)delete other.lastCasualties[id];
        for(const c of w.diplomacy.calls)if(c.warId===other.id&&fallen.includes(c.allyId)&&c.status==='PENDING')c.status='EXPIRED';
        w.changeSeq++;
      }
    }
  }
  if(observation)for(const e of observation)if(!w.engagements.some(x=>x.id===e.id))v07d3PeaceEnd(w,e);
  return result;
}

function executeMilitaryAction(w,nationId,act){
  if(!isMilitaryActionLegal(w,nationId,act))return {ok:false,reason:'군사 명령 실행 조건 불충족'};
  const n=w.nations[nationId],cost=getActionPrice(w,nationId,act);
  if(!canAfford(n,cost))return {ok:false,reason:'AP·Gold 또는 자원 부족'};
  payCost(n,cost,v04e3ApCategory(act.type));
  if(C2_ACTIONS.includes(act.type))return c2ExecuteIndependence(w,nationId,act);
  if(['OFFER_SUBMISSION','ACCEPT_SUBMISSION','REJECT_SUBMISSION','OFFER_RELEASE','ACCEPT_RELEASE','REJECT_RELEASE'].includes(act.type))return v06bExecuteAction(w,nationId,act);
  if(['IMPROVE_RELATIONS','OFFER_ALLIANCE','ACCEPT_ALLIANCE','REJECT_ALLIANCE','END_ALLIANCE'].includes(act.type))return executeAllianceAction(w,nationId,act);
  if(act.type==='RESPOND_DEFENSE_CALL')return resolveDefenseCall(w,nationId,act);
  if(act.type==='RESPOND_ATTACK_CALL')return resolveOffensiveCall(w,nationId,act);
  if(act.type==='TRAIN_RESERVES'){
    const s=w.settlements.find(s=>s.id===act.settlementId);
    const cultures=d1CultureTake(s.culturePopulation,act.amount);s.population-=act.amount;d1bSyncGroups(s,w);d2aSyncGroups(w,s);
    n.military.training.push({amount:act.amount,completeDay:w.dayIndex+trainingDays(w,nationId),culturePopulation:cultures});
    n.military.lastTrainingDay=Math.floor(w.dayIndex/30)*30;
    event(w,`${n.name}: 예비병 ${act.amount}명 훈련 시작 (완료 ${w.dayIndex+trainingDays(w,nationId)}일)`, 'army');
    return {ok:true,training:act.amount};
  }
  if(act.type==='TRAIN_FORMATION'){
    const army=getArmy(w,act.armyId),earned=b4aTrainFormation(w,army);
    event(w,`${n.name} 제${army.id+1}군 편제 훈련: +${earned}XP · ${b4aRankLabel(army)}`,'army');
    return {ok:true,earned,armyId:army.id};
  }
  if(act.type==='EMERGENCY_MUSTER')return b4aExecuteEmergency(w,nationId,act);
  if(act.type==='REDEPLOY_COHORT'){
    const a=getArmy(w,act.armyId);a.g5RearRifleBaseline??=g5RoleStats(a).rearRifle;
    a.g5RedeployPlan={unitId:act.unitId,amount:act.amount,completeDay:w.dayIndex+30};
    a.status='REGROUP';a.regroupUntil=a.g5RedeployPlan.completeDay;a.order=null;a.operation=null;a.needsOrders=false;
    n.actionStats.REDEPLOY_COHORT=(n.actionStats.REDEPLOY_COHORT||0)+1;g5Log(w,nationId,'REDEPLOY_STARTED',a,act.amount,{unitId:act.unitId});w.changeSeq++;return {ok:true,armyId:a.id,redeployUntil:a.g5RedeployPlan.completeDay};
  }
  if(act.type==='REARM_ARMY'){
    n.actionStats.REARM_ARMY=(n.actionStats.REARM_ARMY||0)+1;
    const a=getArmy(w,act.armyId);a.rearmPlan={unitType:act.unitType,armorId:act.armorId??null,position:act.position??null,...(act.unitId!==undefined?{unitId:act.unitId,amount:act.amount}:{}),completeDay:w.dayIndex+30};a.status='REGROUP';a.regroupUntil=a.rearmPlan.completeDay;a.order=null;a.operation=null;a.needsOrders=false;w.changeSeq++;return {ok:true,armyId:a.id,rearmUntil:a.rearmPlan.completeDay};
  }
  if(act.type==='RAISE_ARTILLERY'){
    const a=getArmy(w,act.armyId),crew=act.guns*E2_GUN_CREW;
    let culture;
    if(manpower(a)+crew<=150){
      culture=d1CultureTake(n.military.reserveCulturePopulation,crew);n.military.reserveReady-=crew;
    }else culture=e2TransferReserveLevy(a,crew);
    const id=`unit-${a.id}-artillery-${w.dayIndex}-${a.units.length}`;
    const u=c3InitUnit({id,typeId:'field_artillery',weaponId:'field_piece',armorId:'none',manpower:crew,
      guns:act.guns,artilleryExperience:0,allocationWeight:crew,culturePopulation:culture},w,nationId);
    a.units.push(u);a.deployment.back.push(id);
    const ledger=e2GunInventory(w),issued=Math.min(act.guns,ledger.stocks[nationId]||0);
    ledger.stocks[nationId]=(ledger.stocks[nationId]||0)-issued;ledger.produced+=act.guns-issued;
    event(w,`${n.name} 제${a.id+1}군에 전장포 ${act.guns}문(보관 재사용 ${issued}문)과 포병 ${crew}명을 편성했습니다.`,'army');
    return {ok:true,armyId:a.id,guns:act.guns,crew};
  }
  if(act.type==='RECRUIT_ARMY'){
    const s=w.settlements.find(s=>s.id===act.settlementId);
    const cultureDraft=d1CultureTake(n.military.reserveCulturePopulation,act.amount);n.military.reserveReady-=act.amount;
    const commander=spawnCommander(w,nationId),id=w.nextArmyId++,plan=recruitmentPlan(act);
    const units=plan.map((entry,i)=>{
      const l=LOADOUTS[entry.typeId];return c3InitUnit({id:`unit-${id}-${i}`,typeId:l.typeId,weaponId:l.weaponId,armorId:defaultArmorFor(w,nationId,entry.typeId),manpower:entry.amount,allocationWeight:entry.amount,culturePopulation:d1CultureTake(cultureDraft,entry.amount)},w,nationId);
    });
    const deployment={front:[],rear:[],back:[],reserve:[]};
    for(let i=0;i<plan.length;i++)deployment[plan[i].position].push(units[i].id);
    const a={id,nationId,commanderId:commander.id,tileId:s.coreTileId,morale:78,units,deployment,
      status:'READY',order:null,operation:null,needsOrders:false,nextMoveDay:w.dayIndex+3,engagementId:null,regroupUntil:0,formationExperience:b4aNewExperience(w.dayIndex),c6CreatedDay:w.dayIndex,supplied:true,unsuppliedDays:0,supplyMultiplier:1,supplyCheckedDay:w.dayIndex};
    a.militaryPolitics={commanderChangeDays:[]};e3cEnsureFormationRecord(a,w.dayIndex);w.armies.push(a);event(w,`${n.name}에서 ${a.id+1}군 (${act.amount}명)을 편성했습니다. 사령관 ${commander.name}.`,'army');return {ok:true,armyId:a.id};
  }
  const a=getArmy(w,act.armyId);
  if(act.type==='REINFORCE_ARMY'){
    const s=w.settlements.find(s=>s.id===act.settlementId);
    const plan=reinforcementPlan(a,act.amount,act.unitId??null);
    const cultureDraft=d1CultureTake(n.military.reserveCulturePopulation,act.amount);n.military.reserveReady-=act.amount;
    for(const part of plan){
      const unit=a.units.find(u=>u.id===part.unitId);
      c3Reinforce(unit,part.amount,w,nationId);
      const addedCultures=d1CultureTake(cultureDraft,part.amount);d1CultureAdd(unit.culturePopulation,addedCultures);d1cReinforceUnit(unit,addedCultures);
    }
    a.morale=cap(a.morale+3,0,100);
    event(w,`${n.name} 제${a.id+1}군에 ${act.amount}명을 증원했습니다. (총 ${manpower(a)}명)`,'army');
    return {ok:true,armyId:a.id,added:act.amount};
  }
  if(act.type==='MOVE_ARMY'){
    a.order={type:'MOVE',targetTileId:act.targetTileId};a.needsOrders=false;a.nextMoveDay=Math.max(a.nextMoveDay,w.dayIndex+1);w.changeSeq++;return {ok:true};
  }
  if(act.type==='LAND_ARMY'){
    const route=seaLandingRoute(w,a.tileId,act.targetTileId);
    if(!route)return {ok:false,reason:'해상 항로 없음'};
    const origin=a.tileId;
    a.tileId=route[0];a.status='SAILING';a.order=null;a.operation=null;a.needsOrders=false;
    a.seaTransit={originId:origin,destinationId:act.targetTileId,arrivalDay:w.dayIndex+Math.max(10,route.length*4+6),waterTiles:route.length};
    a.nextMoveDay=a.seaTransit.arrivalDay;a.engagementId=null;
    event(w,`${n.name} 제${a.id+1}군 출항 · 바다 ${route.length}타일 · 예정 ${a.seaTransit.arrivalDay-w.dayIndex}일`, 'army');
    return {ok:true,arrivalDay:a.seaTransit.arrivalDay,waterTiles:route.length};
  }
  if(act.type==='DISBAND_ARMY'){
    const s=w.settlements.find(s=>safeSettlement(w,s,nationId)&&s.coreTileId===a.tileId);
    if(s){s.population+=manpower(a);d1CultureAdd(s.culturePopulation,d1CultureArmyPopulation(a));d1bSyncGroups(s,w);d2aSyncGroups(w,s);}hOnArmyRemoved(w,a,'DISBAND');e2FinaliseGuns(w,a,'DISBAND');c6RecordArmyEnd(w,a,'DISBAND');g3ObserveArmyRemoval(w,a,'DISBAND');w.armies=w.armies.filter(v=>v.id!==a.id);
    w.characters=w.characters.filter(c=>c.id!==a.commanderId);
    event(w,`${n.name}이(가) 부대를 해산하고 병력을 귀환시켰습니다.`,'army');return {ok:true};
  }
  if(act.type==='DECLARE_WAR'||act.type==='BETRAY_ALLIANCE'){
    const other=act.targetNationId,live=act.type==='BETRAY_ALLIANCE';
    const betrays=live?e5BetrayalEligible(w,nationId,other,true):e5BetrayalEligible(w,nationId,other,false);
    if(live){
      const treaty=allianceBetween(w,nationId,other);
      e5EndAlliance(w,treaty,'BETRAYAL',nationId);
      repatriateAfterAllianceEnds(w,nationId,other);
    }
    const war={id:w.nextWarId++,kind:'TERRITORIAL',attackerId:nationId,defenderId:act.targetNationId,startedDay:w.dayIndex,lastBattleDay:w.dayIndex,score:0,battleCount:0,casualties:{},battleCasualties:{},occupationCasualties:{},supplyCasualties:{},battleWins:{},occupationCount:0,
      goal:chooseWarGoal(w,nationId,act.targetNationId),defenderGoal:defenseGoal(),sides:{attackers:[nationId],defenders:[act.targetNationId]},fatigue:{[nationId]:0,[act.targetNationId]:0},
      lastCasualties:{[nationId]:0,[act.targetNationId]:0},pendingPeace:null,nextPeaceOfferDay:0};
    w.wars.push(war);requestDefensiveSupport(w,war);requestOffensiveSupport(w,war);adjustRelation(w,nationId,act.targetNationId,-30);
    v06aRemember(w,other,nationId,'WAR_DECLARED',{trust:-16,grievance:19});if(betrays)e5RegisterBetrayal(w,nationId,other,live?'DIRECT':'AFTER_END');event(w,`${n.name}이(가) ${w.nations[act.targetNationId].name}에 선전포고했습니다. (목표: ${war.goal.type==='SETTLEMENT'?'정착지':'국경 영토'} 확보)`,'war');recordHistoricalEvent(w,'war',w.events[w.events.length-1].text,[nationId,act.targetNationId],`war:${war.id}:start`);return {ok:true,warId:war.id};
  }
  if(act.type==='OFFER_PEACE'){
    const war=c2PeaceWar(w,nationId,act);
    const terms=warOutcome(w,war);
    const winner=terms.winnerId===null?null:w.nations[terms.winnerId];
    const defaultRate=terms.winnerId===null?0:1;
    terms.subjectDemand=Boolean(act.subjectDemand&&v06bForceEligible(w,war,terms));
    if(terms.subjectDemand)v06b1Diag(w).forced.offered++;
    terms.reparationRate=terms.subjectDemand?0:winner?(Number.isFinite(act.reparationRate)?Math.max(0,Math.min(1,act.reparationRate)):defaultRate):0;
    terms.reparationModel='v03c';
    terms.winnerGoldAtOffer=winner?.gold??0;
    war.pendingPeace={proposerId:nationId,offerDay:w.dayIndex,terms};
    event(w,`${n.name}이(가) 평화협정을 제안했습니다.`,'diplomacy');return {ok:true};
  }
  if(act.type==='REJECT_PEACE'){
    const war=c2PeaceWar(w,nationId,act);
    if(war.pendingPeace?.terms?.subjectDemand)v06b1Diag(w).forced.rejected++;
    war.pendingPeace=null;war.nextPeaceOfferDay=w.dayIndex+90;
    event(w,`${n.name}이(가) 평화협정을 거절했습니다.`,'diplomacy');return {ok:true};
  }
  if(act.type==='MAKE_PEACE'||act.type==='ACCEPT_PEACE'){
    const war=c2PeaceWar(w,nationId,act);
    const result=settlePeace(w,war,war.pendingPeace.terms);return {ok:true,result};
  }
  return {ok:false};
}
function enemyAt(w,army,tid){return w.armies.find(a=>a.nationId!==army.nationId&&a.tileId===tid&&hCombatPresence(w,a)>0&&atWar(w,a.nationId,army.nationId)&&a.engagementId===null);}
function processMilitaryDay(w,execute){
  // Settle the preceding uncontested interval BEFORE a new battle/movement changes its status.
  processOccupationDay(w);
  // Battles are independent persistent objects and resolve at their own scheduled dates.
  for(const e of w.engagements.slice())if(e.nextRoundDay<=w.dayIndex)resolveEngagementRound(w,e);
  for(const a of w.armies.slice()){
    if(a.status==='DESTROYED'||!hCombatPresence(w,a)&&!a.hServiceReturn?.tow)continue;
    if(a.hServiceReturn&&(['RETREATING','TRAPPED','SAILING','ENGAGED'].includes(a.status)||a.engagementId!==null)){h1dCancelService(w,a);}
    if(a.status==='SAILING'){if(a.seaTransit?.arrivalDay<=w.dayIndex)finishSeaVoyage(w,a);else continue;}
    if(a.status==='RETREATING'&&a.nextMoveDay<=w.dayIndex){
      if(!Array.isArray(a.retreatPath))a.retreatPath=[];
      if(a.retreatPath.length){
        const next=a.retreatPath[0];
        const adjacent=neighborsMilitary8(a.tileId,w.size,w.height).includes(next)&&militaryStepPermitted(w,a.tileId,next,a.nationId);
        const tile=w.tiles[next];
        const blocked=retreatBlockedByArmies(w,a,next);
        if(!adjacent||!TERRAINS[tile.terrain].passable||blocked||(tile.occupiedBy!==null&&tile.occupiedBy!==a.nationId)||!retreatTilePermitted(w,a,tile)){
          const path=planRetreat(w,a,{repatriation:!!a.repatriation?.active});if(!path){a.status='TRAPPED';a.retreatPath=[];a.nextMoveDay=w.dayIndex+10;continue;}
          a.retreatPath=path.slice(1);
        }
        if(a.retreatPath.length){
          const fromTile=a.tileId;
          a.tileId=a.retreatPath.shift();
          a.nextMoveDay=w.dayIndex+Math.ceil((w.tiles[a.tileId].terrain==='mountain'?6:4)*(militaryDiagonal(fromTile,a.tileId,w.size)?Math.SQRT2:1));
          a.supplied=isSupplied(w,a);a.roadSupplied=isRoadSupplied(w,a);w.changeSeq++;
        }
      }
      if(!a.retreatPath.length){
        if(atSafeSettlement(w,a)){a.repatriation=null;a.status='REGROUP';a.regroupUntil=w.dayIndex+(a.regroupDays||30);}
        else{a.status='TRAPPED';a.nextMoveDay=w.dayIndex+10;}
        w.changeSeq++;
      }
    }
    if(a.status==='TRAPPED'&&a.nextMoveDay<=w.dayIndex){
      const path=planRetreat(w,a,{repatriation:!!a.repatriation?.active});
      if(path){
        a.retreatPath=path.slice(1);a.regroupDays??=30;
        if(a.retreatPath.length){a.status='RETREATING';a.nextMoveDay=w.dayIndex+3;}
        else{a.repatriation=null;a.status='REGROUP';a.regroupUntil=w.dayIndex+a.regroupDays;}
      }else a.nextMoveDay=w.dayIndex+10;
      w.changeSeq++;
    }
    if(a.status==='REGROUP'&&a.regroupUntil<=w.dayIndex){
      const rally=w.tiles[a.tileId];
      const emergencyReady=a.emergencyMuster&&rally?.ownerId===a.nationId&&rally.occupiedBy===null&&
        !w.armies.some(v=>v.nationId!==a.nationId&&v.tileId===rally.id&&hCombatPresence(w,v)>0);
      if(atSafeSettlement(w,a)||emergencyReady){
        if(emergencyReady)delete a.emergencyMuster;
        a.repatriation=null;a.status='READY';a.needsOrders=true;a.morale=cap(a.morale+18,0,100);a.retreatPath=[];
        clearRoutIfRecovered(w,a); // keep f3fRout while too depleted to sortie
      }else{a.status='TRAPPED';a.nextMoveDay=w.dayIndex+10;}
      w.changeSeq++;
    }
    if(a.status!=='READY'||!a.order||a.nextMoveDay>w.dayIndex||!manpower(a)&&hEffective(w,a)<=0&&!h1dTowAllowed(w,a,a.order.targetTileId))continue;
    const target=w.tiles[a.order.targetTileId];
    if(!target||a.tileId===target.id){a.order=null;if(a.hServiceReturn&&atSafeSettlement(w,a))h1dServiceOnArrival(w,a);else{h1dCancelService(w,a);a.operation=null;a.needsOrders=true;}continue;}
    const path=landRoute(w,a.tileId,target.id,t=>canPassMilitaryTile(w,a.nationId,t),a.nationId);
    if(!path||path.length<2||a.hServiceReturn&&path.some(id=>w.tiles[id].ownerId!==a.nationId||w.tiles[id].occupiedBy!==null)||!armyOffensiveReady(w,a)&&path.some(id=>!isFriendlyRecoveryTile(w,a,w.tiles[id]))){a.order=null;h1dCancelService(w,a);a.operation=null;a.needsOrders=true;continue;}
    const id=path[1],t=w.tiles[id];
    const defenders=w.armies.filter(v=>v.tileId===id&&v.status!=='SAILING'&&v.nationId!==a.nationId&&atWar(w,v.nationId,a.nationId)&&hCombatPresence(w,v)>0);
    if(defenders.length){
      const defender=defenders.find(v=>v.engagementId===null);
      if(defender)startEngagement(w,a,defender,id,atWar(w,a.nationId,defender.nationId).id);
      else{
        const existing=w.engagements.find(e=>e.tileId===id&&warSide(w.wars.find(x=>x.id===e.warId),a.nationId)===(e.attackerWarSide??warSide(w.wars.find(x=>x.id===e.warId),h1Army(w,e.attackerArmyId)?.nationId)));
        if(existing&&existing.attackerOriginTileId===a.tileId)h1Gather(w,existing);
        if(a.engagementId===null){a.nextMoveDay=w.dayIndex+5;a.order=null;a.needsOrders=true;}
      }
      continue;
    }
    const previousTileId=a.tileId;
    a.tileId=id;a.supplied=isSupplied(w,a);a.roadSupplied=isRoadSupplied(w,a);
    if(t.ownerId!==null&&t.ownerId!==a.nationId){
      const war=atWar(w,a.nationId,t.ownerId);
      if(war)chargeMilitaryOperation(w,a.nationId,manpower(a)*.15,war.id,'march');
    }
    // Keep nextMoveDay integer, carry a fractional day across sequential moves.
    // Cumulative duration approximates ceil(sum of orthogonal/diagonal costs).
    const rawDays=marchDays(t,w,a.nationId)*(militaryDiagonal(previousTileId,id,w.size)?Math.SQRT2:1)*(v08fTanks(w,a).length>0?1.67:1)+(a.g2aMarchCarry||0);
    const stepDays=Math.max(1,Math.ceil(rawDays-1e-10));
    a.g2aMarchCarry=Math.max(-.999999999,Math.min(0,rawDays-stepDays));
    a.nextMoveDay=w.dayIndex+stepDays;
    // Arrival does not imply instant occupation. First establish a timed occupation.
    if((t.ownerId!==a.nationId&&t.ownerId!==null&&atWar(w,a.nationId,t.ownerId)&&t.occupiedBy!==a.nationId)||
       (allyAccess(w,a.nationId,t.ownerId)&&t.occupiedBy!==null&&warAgainst(w,a.nationId,t.occupiedBy))){
      if(t.ownerId===a.nationId){ // Recovery of occupied homeland: remove hostile control only on completion.
        beginOccupation(w,a,id);
      } else beginOccupation(w,a,id);
    }
    if(a.order&&t.id===a.order.targetTileId){a.order=null;if(a.hServiceReturn&&atSafeSettlement(w,a))h1dServiceOnArrival(w,a);else if(!isOccupying(w,a)){h1dCancelService(w,a);a.operation=null;a.needsOrders=true;}}
    w.changeSeq++;
  }
  // Legacy saves and changing fronts can leave routed forces under a victorious army.
  // Such a defeated force cannot keep an occupation on hold indefinitely.
  for(const trapped of w.armies.slice()){
    if(trapped.status!=='TRAPPED'||!hCombatPresence(w,trapped))continue;
    const victor=w.armies.find(v=>v.tileId===trapped.tileId&&v.nationId!==trapped.nationId&&
      hCombatPresence(w,v)>0&&v.status==='READY'&&atWar(w,v.nationId,trapped.nationId));
    if(victor&&!planRetreat(w,trapped,{excludeTileId:trapped.tileId,repatriation:!!trapped.repatriation?.active}))
      surrenderArmy(w,trapped,victor.nationId);
  }
  // Winning a battle can place a force directly onto hostile ground without a MOVE step.
  for(const a of w.armies){
    if(a.status!=='READY'||!hCombatPresence(w,a)||isOccupying(w,a))continue;
    const tile=w.tiles[a.tileId];
    if(tile.ownerId!==null&&(tile.ownerId!==a.nationId||tile.occupiedBy!==null&&tile.occupiedBy!==a.nationId))
      beginOccupation(w,a,a.tileId);
  }
  processOccupationDay(w);
  // Recompute even for STATIONARY armies after a hostile occupation cuts their corridor.
  updateArmySupply(w);
  // Remove destroyed forces; their losses were deducted permanently from recruited manpower.
  for(const a of w.armies.filter(a=>(!hCombatPresence(w,a)&&!(hCount(w,a,true)>0&&(atSafeSettlement(w,a)||a.hServiceReturn?.tow||w.tiles[a.tileId]?.ownerId===a.nationId&&w.tiles[a.tileId]?.occupiedBy===null&&hasTech(w,a.nationId,'automaton_maintenance'))))||a.status==='DESTROYED')){
    event(w,`${w.nations[a.nationId].name}의 군대가 소멸했습니다.`,'battle');
    hOnArmyRemoved(w,a,a.status==='DESTROYED'?'BATTLE_LOSS':'FIELD_LOSS');
    e2FinaliseGuns(w,a,a.status==='DESTROYED'?'BATTLE_LOSS':'FIELD_LOSS');
    c6RecordArmyEnd(w,a,a.status==='DESTROYED'?'BATTLE_LOSS':'FIELD_LOSS');
    g3ObserveArmyRemoval(w,a,a.status==='DESTROYED'?'BATTLE_LOSS':'FIELD_LOSS');
    w.armies=w.armies.filter(v=>v.id!==a.id);
    const c=w.characters.find(c=>c.id===a.commanderId);if(c){
      w.pastCommanders.push({name:c.name,nationId:c.nationId,age:c.age,victories:c.victories||0});
      if(w.pastCommanders.length>80)w.pastCommanders.splice(0,w.pastCommanders.length-80);
      w.characters=w.characters.filter(v=>v.id!==c.id);
    }
  }
  for(const o of w.occupations.slice()){
    if(!occupyingForces(w,o).length){
      w.occupations=w.occupations.filter(v=>v!==o);w.changeSeq++;
    }
  }
  if(execute){assignWarOrders(w,execute,true);d2bAssignSuppression(w,execute);}
}
function nextMilitaryDay(w){
  let next=Infinity;
  for(const e of w.engagements)if(e.nextRoundDay>w.dayIndex)next=Math.min(next,e.nextRoundDay);
  for(const a of w.armies){
    if(a.order&&a.status==='READY')next=Math.min(next,Math.max(w.dayIndex+1,a.nextMoveDay));
    if(a.status==='SAILING'&&a.seaTransit)next=Math.min(next,Math.max(w.dayIndex+1,a.seaTransit.arrivalDay));
    if(a.status==='REGROUP')next=Math.min(next,Math.max(w.dayIndex+1,a.regroupUntil));
    if(a.status==='RETREATING'||a.status==='TRAPPED')next=Math.min(next,Math.max(w.dayIndex+1,a.nextMoveDay));
    next=Math.min(next,Math.max(w.dayIndex+1,(a.supplyCheckedDay??w.dayIndex)+10));
  }
  return Math.min(next,nextOccupationDay(w));
}
function borderEnemies(w,nationId){
  const ids=new Set();for(const t of w.tiles){if(t.ownerId!==nationId)continue;
    for(const near of neighborsMilitary8(t.id,w.size,w.height)){const o=w.tiles[near].ownerId;if(o!==null&&o!==nationId&&w.nations[o].active&&militaryStepPermitted(w,t.id,near,nationId))ids.add(o);}
  }return [...ids];
}
/** E2: a short, war-wide shared objective list calculated once per tactical refresh.
 * This is a strategic preference, not a synthetic merged army or teleport order. */
// F3: The 10-day coalition plan is tactical state. Keeping it on the war
// makes uninterrupted and saved/reloaded play use the same plan. It is bounded
// to ten entries per side, does not trigger any new full-map scan, and is
// discarded automatically when the war ends.
function coalitionFrontPlan(w,war){
 const tick=Math.floor(w.dayIndex/10),cached=war.f3PersistedCoalitionPlan;
 if(cached&&cached.tick===tick)return cached.plans;
 const plans={attackers:[],defenders:[]},townCores=new Set(w.settlements.map(s=>s.coreTileId));
 const attacker=new Set(war.sides?.attackers||[war.attackerId]);
 const defender=new Set(war.sides?.defenders||[war.defenderId]);
 const scoreSide=(friends,foes)=>{
  const options=[];
  for(const t of w.tiles){
   if(!TERRAINS[t.terrain].passable)continue;
   const hostileOwner=foes.has(t.ownerId),hostileOccupier=foes.has(t.occupiedBy);
   const friendlyOwner=friends.has(t.ownerId);
   if(!hostileOwner&&!friendlyOwner||!hostileOwner&&!hostileOccupier)continue;
   let neighboring=0;
   for(const nb of neighborsMilitary8(t.id,w.size,w.height)){
    if(!militaryStepPermitted(w,nb,t.id))continue;
    const v=w.tiles[nb];if(friends.has(v.ownerId)||friends.has(v.occupiedBy))neighboring++;
   }
   const town=townCores.has(t.id);
   const goal=war.goal?.targetTileId===t.id;
   const importance=(hostileOccupier&&friendlyOwner?19:hostileOwner?11:0)+Math.min(3,neighboring)*2+(goal?9:0)+(town?5:0);
   if(importance>12||goal)options.push({id:t.id,value:importance,role:hostileOccupier&&friendlyOwner?'COALITION_DEFEND':'COALITION_FRONT'});
  }
  options.sort((a,b)=>b.value-a.value||a.id-b.id);
  return options.slice(0,10);
 };
 plans.attackers=scoreSide(attacker,defender);
 plans.defenders=scoreSide(defender,attacker);
 war.f3PersistedCoalitionPlan={tick,plans};
 return plans;
}
// F2 non-persistent in-memory instrumentation. No per-day world scans or save bloat.
let f2RoutePrefilterEnabled=true;
const f2RouteStats={prefiltersBuilt:0,skippedAStar:0,operationAStarCalls:0,failedAStar:0};
// F4B: short-lived cache for repeated, identical OPERATION path requests inside a
// single assignWarOrders event. Preserve F2 candidate / pathChecks counters.
let f4bRouteReuseEnabled=true; // internal regression switch; default ON.
const f4bRouteStats={hits:0,misses:0};
function f4bOperationRoute(w,start,end,nationId,fortNet,c6Context){
  if(!f4bRouteReuseEnabled||!c6Context){
    return landRoute(w,start,end,t=>canPassMilitaryTile(w,nationId,t),nationId,fortNet);
  }
  // Input closures here are precisely canPassMilitaryTile(w,nationId,t).
  // The passability graph is stable within the order assignment (no army movement,
  // fort destruction, occupiedBy/ownerId edit, or diplomacy changes). In contrast,
  // changeSeq is intentionally incremented by MOVE_ARMY order / AP updates: using
  // it as a key would invalidate *valid* entries and defeat this optimization.
  // Never extend this memo beyond this invocation. If passability-changing
  // actions are later added inside assignWarOrders, explicitly invalidate then.
  const cache=c6Context.f4bRoutes??(c6Context.f4bRoutes=new Map());
  const key=nationId+':'+start+':'+end;
  const cached=cache.get(key);
  if(cached){
    f4bRouteStats.hits++;
    return cached.path?cached.path.slice():null;
  }
  f4bRouteStats.misses++;
  const path=landRoute(w,start,end,t=>canPassMilitaryTile(w,nationId,t),nationId,fortNet);
  cache.set(key,{path:path?path.slice():null});
  return path;
}
/** Common military planner. No national-name branches: profile numbers affect the scoring. */
function chooseOperation(w,army,war,profile,reserved,sharedTargets=[],c6Context=null){
  const foes=warOpponents(war,army.nationId),friends=new Set(warFriends(war,army.nationId)),hostiles=new Set(foes),foe=warSide(war,army.nationId)==='attackers'?war.defenderId:war.attackerId;
  const own=w.nations[army.nationId],defensive=(profile?.military?.defensivePreference??50)/100,
    aggression=(profile?.military?.aggression??50)/100;
  const key=war.id+':'+warSide(war,army.nationId);
  let enemySoldiers=c6Context?.foes.get(key);
  if(!enemySoldiers){enemySoldiers=w.armies.filter(v=>hostiles.has(v.nationId)&&hCombatPresence(w,v)>0);c6Context?.foes.set(key,enemySoldiers);}
  const fortNet=c6Context?(c6Context.fortNet??=fortificationNetwork(w)):fortificationNetwork(w);
  const tiles=new Map();
  const propose=(id,role,value)=>{const current=tiles.get(id);if(!current||value>current.value)tiles.set(id,{id,role,value});};
  for(const target of sharedTargets)propose(target.id,target.role,target.value+2);
   // G2A: after a completed occupation, favor reachable local continuation rather than
   // repeatedly returning to distant strategic cores. This is a preference only.
   for(const id of neighborsMilitary8(army.tileId,w.size,w.height)){
     const t=w.tiles[id];
     if(!militaryStepPermitted(w,army.tileId,id,army.nationId,fortNet)||!canPassMilitaryTile(w,army.nationId,t))continue;
     if(hostiles.has(t.ownerId)&&!friends.has(t.occupiedBy))propose(id,'LOCAL_PUSH',16+aggression*2);
   }
  if(warSide(war,army.nationId)==='attackers'&&war.goal?.targetTileId!=null){
    const target=w.tiles[war.goal.targetTileId];
    if(target?.ownerId===foe&&!friends.has(target.occupiedBy))propose(target.id,'WAR_GOAL',13+aggression*3);
    // A town objective includes its entire footprint, not only the central tile.
    const goalTown=w.settlements.find(s=>s.id===war.goal.settlementId&&s.ownerId===foe);
    if(goalTown)for(const id of goalTown.tileIds){
      const tile=w.tiles[id];if(!friends.has(tile.occupiedBy))
        propose(id,'WAR_DISTRICT',13+aggression*3+(id===goalTown.coreTileId?1:0));
    }
  }
  // Intercept invaders threatening our own territory; do not retarget friendly garrisons.
  for(const enemy of enemySoldiers){
    const t=w.tiles[enemy.tileId];if(friends.has(t.ownerId)||hostiles.has(t.occupiedBy)&&neighborsMilitary8(t.id,w.size,w.height).some(id=>friends.has(w.tiles[id].ownerId)))
      propose(t.id,'INTERCEPT',11+defensive*7);
  }
  for(const s of w.settlements){
    if(hostiles.has(s.ownerId)&&w.tiles[s.coreTileId].occupiedBy!==own.id)
      propose(s.coreTileId,'ASSAULT',10+aggression*3+(w.nations[foe].capitalId===s.coreTileId?3:0));
    if(friends.has(s.ownerId)&&hostiles.has(w.tiles[s.coreTileId].occupiedBy))
      propose(s.coreTileId,'DEFEND',17+defensive*5);
  }
  // F3D: hostile active forts are legal assault objectives, including remote outposts.
  for(const d of w.defenses||[]){
    const t=w.tiles[d.tileId];
    if(!fortEffective(d)||!t||!hostiles.has(t.ownerId)||friends.has(t.occupiedBy))continue;
    propose(t.id,'FORT_ASSAULT',16+aggression*3);
  }
  // Enemy-owned frontier tiles make an advancing front instead of endlessly revisiting a core.
  for(const t of w.tiles){
    if(hostiles.has(t.ownerId)&&!friends.has(t.occupiedBy)){
      const friendlyEdge=neighborsMilitary8(t.id,w.size,w.height).filter(id=>militaryStepPermitted(w,id,t.id,army.nationId,fortNet)&& (friends.has(w.tiles[id].ownerId)||friends.has(w.tiles[id].occupiedBy))).length;
      // Hold and widen an occupied front instead of drawing a single thin invasion line.
      // Even an undefended road to the enemy capital has a real opportunity cost.
      propose(t.id,'OCCUPY',8+Math.min(4,friendlyEdge)*1.45+aggression*2);
    }else if(friends.has(t.ownerId)&&hostiles.has(t.occupiedBy))propose(t.id,'DEFEND',13+defensive*5);
  }
  const troopsByTile=new Map();
  for(const foeArmy of enemySoldiers)troopsByTile.set(foeArmy.tileId,(troopsByTile.get(foeArmy.tileId)||0)+getArmyBasePower(w,foeArmy));
  const x=army.tileId%w.size,y=Math.floor(army.tileId/w.size);
  const candidateRank=e=>e.value-(Math.max(Math.abs(e.id%w.size-x),Math.abs(Math.floor(e.id/w.size)-y))+(Math.SQRT2-1)*Math.min(Math.abs(e.id%w.size-x),Math.abs(Math.floor(e.id/w.size)-y)))*.58;
  // Never pathfind to every hostile tile for every army on every tactical refresh.
  // Shortlist by cheap octile lower bound, then verify real reachability with 8-way A*.
  const all=[...tiles.values()];
  const promising=all.slice().sort((a,b)=>candidateRank(b)-candidateRank(a)||a.id-b.id).slice(0,28);
  const octile=id=>{const dx=Math.abs(id%w.size-x),dy=Math.abs(Math.floor(id/w.size)-y);return Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy);};
   const nearest=all.slice().sort((a,b)=>octile(a.id)-octile(b.id)||a.id-b.id).slice(0,12);
  const choices=new Map([...promising,...nearest].map(e=>[e.id,e]));
  let best=null,score=-Infinity;
  const ownPower=Math.max(1,getArmyBasePower(w,army));
  // V0.6F2: this cache lives ONLY within this operation decision.  Once the first
  // A* has failed, compute exact military reachability once and skip later
  // unreachable candidate A* searches. Reachable candidates ALWAYS use the
  // unchanged weighted A*, preserving route choice, cost and target scoring.
  let f2Reachable=null;
  const f2BuildReachable=()=>{
    f2RouteStats.prefiltersBuilt++;
    const found=new Set([army.tileId]);
    if(hostileFortUncaptured(w,army.tileId,army.nationId,fortNet))return found;
    const queue=[army.tileId];
    for(let qi=0;qi<queue.length;qi++){
      const u=queue[qi];
      if(u!==army.tileId&&hostileFortUncaptured(w,u,army.nationId,fortNet))continue;
      for(const v of neighborsMilitary8(u,w.size,w.height)){
        if(found.has(v))continue;
        const t=w.tiles[v];
        if(!TERRAINS[t.terrain].passable||!canPassMilitaryTile(w,army.nationId,t)||
           fortLineBlocks(w,v,army.nationId,fortNet)||!militaryStepPermitted(w,u,v,army.nationId,fortNet))continue;
        found.add(v);queue.push(v);
      }
    }
    return found;
  };
  for(const entry of choices.values()){
    if(entry.id===army.tileId)continue;
    // Strongly discourage selecting targets with a defender beyond safe strength unless defensive.
    if(w.c6StrategyStats)w.c6StrategyStats.pathChecks++; // Original historical counter semantics.
    if(f2RoutePrefilterEnabled&&f2Reachable&&!f2Reachable.has(entry.id)){
      f2RouteStats.skippedAStar++;
      continue;
    }
    f2RouteStats.operationAStarCalls++;
    const path=f4bOperationRoute(w,army.tileId,entry.id,army.nationId,fortNet,c6Context);
    if(!path){
      f2RouteStats.failedAStar++;
      if(f2RoutePrefilterEnabled&&!f2Reachable)f2Reachable=f2BuildReachable();
      continue;
}
    const defenders=troopsByTile.get(entry.id)||0;
    const relative=defenders/ownPower;
    const risk=(profile?.behavior?.riskTolerance??50)/100;
    const danger=defenders>0&&relative>1?Math.min(12,(relative-1)*6*(1.3-risk*.5)):0;
    // Defenseless and weaker opposing positions are legitimate opportunities.
    // Duplicate strategic targets may receive several troops; no imaginary joint power.
    const advantage=defenders===0?1.0:relative<.85?1.4:0;
    const occupiedByFriend=friends.has(w.tiles[entry.id].occupiedBy);
    const borderFaces=neighborsMilitary8(entry.id,w.size,w.height).filter(id=>{
       if(!militaryStepPermitted(w,id,entry.id,army.nationId,fortNet))return false;
      const t=w.tiles[id];return friends.has(t.ownerId)&&!hostiles.has(t.occupiedBy)||friends.has(t.occupiedBy);
    }).length;
    const enemyRun=path.slice(1).filter(id=>hostiles.has(w.tiles[id].ownerId)&&!friends.has(w.tiles[id].occupiedBy)).length;
    const forwardPenalty=Math.max(0,enemyRun-1)*.92;
    const flankBonus=borderFaces>=2?1.7:0;
    const geoGoal=entry.role==='WAR_GOAL'||entry.role==='WAR_DISTRICT'?1.8:0;
    const resistance=hostiles.has(w.tiles[entry.id].ownerId)?regionalMilitaryStats(w,entry.id).resistance:0;
    const siegePenalty=Math.min(4,Math.log1p(resistance/80)*1.8);
    const routeDays=path.slice(1).reduce((total,id,i)=>total+marchDays(w.tiles[id],w,army.nationId)*(militaryDiagonal(path[i],id,w.size)?Math.SQRT2:1),0);
     const value=entry.value-routeDays*.14-forwardPenalty-danger+advantage+flankBonus+geoGoal-siegePenalty-(reserved.has(entry.id)?1.2:0)-(occupiedByFriend?5:0);
    if(value>score||(value===score&&entry.id<(best?.id??Infinity))){best=entry;score=value;}
  }
  return best;
}
function assignWarOrders(w,execute,reactive=false){
  c2AssignFronts(w);
  // Order generation never mutates territory or fortifications; share these derived inputs.
  const c6Context={fortNet:null,foes:new Map()}; // F4B f4bRoutes lazily allocated, discarded on return
  for(const war of w.wars){
    const coalition=coalitionFrontPlan(w,war);
    for(const id of warMembers(war)){
      const common=coalition[warSide(war,id)]||[];
      const n=w.nations[id];if(!n.active||n.controller!=='AI')continue;
      // E2: both supporting sides share coalition targets and ordinary operational planning.
      const profile=d1dEffectiveProfile(w,n.id);
      const armies=w.armies.filter(a=>a.nationId===id&&hCombatPresence(w,a)>0&&a.assignedWarId===war.id).sort((a,b)=>a.id-b.id);
      const reserved=new Set(armies.filter(a=>a.order&&a.status==='READY').map(a=>a.order.targetTileId));
      for(const a of armies){
        if(a.status!=='READY'||a.engagementId!==null||a.hServiceReturn)continue;
        if(a.operation?.type==='BORDER_GARRISON'){a.order=null;a.operation=null;a.needsOrders=true;w.changeSeq++;}
        // An active siege may continue for a while on carried supplies, but after
        // prolonged isolation survival takes priority over capture progress.
        if(isOccupying(w,a)&&(a.supplied||(a.unsuppliedDays||0)<60))continue;
        // Cut-off units retreat along actual traversable steps if an escape exists.
        // No instant teleport and no fictitious friendly reinforcement in enemy land.
        if(!a.supplied&&(a.unsuppliedDays||0)>=30){
          if(a.order&&a.operation?.type==='SUPPLY_RETURN')continue;
          const escape=planRetreat(w,a);
          if(escape?.length>1){
            // Forced tactical withdrawal follows the retreat path, including neutral
            // escape corridors where ordinary offensive MOVE orders are forbidden.
            a.order=null;a.retreatPath=escape.slice(1);a.regroupDays=24;
            a.status='RETREATING';a.nextMoveDay=w.dayIndex+3;
            a.operation={type:'SUPPLY_RETURN',targetTileId:escape[escape.length-1],assignedDay:w.dayIndex};
            a.needsOrders=false;w.changeSeq++;continue;
          }
        }
        if(a.order){
          const target=w.tiles[a.order.targetTileId];
          const friendsHere=new Set(warFriends(war,id));
          const stale=target&&(friendsHere.has(target.occupiedBy)||friendsHere.has(target.ownerId)&&target.occupiedBy===null);
          const reassess=!reactive&&(w.dayIndex-(a.operation?.assignedDay??w.dayIndex)>=30);
          if(!stale&&!reassess)continue;
          // Keep legal in-flight orders unless an alternative is better, never interrupt every day.
          const previous=a.order,priorRole=a.operation;
          reserved.delete(previous.targetTileId);
          const alternative=chooseOperation(w,a,war,profile,reserved,common,c6Context);
          if(alternative&&alternative.id!==previous.targetTileId){
            if(execute(w,id,{type:'MOVE_ARMY',armyId:a.id,targetTileId:alternative.id}).ok){
              a.operation={type:alternative.role,targetTileId:alternative.id,assignedDay:w.dayIndex};
              reserved.add(alternative.id);continue;
            }
          }
          if(!stale){reserved.add(previous.targetTileId);continue;}
          a.order=null;a.operation=null;a.needsOrders=true;
        }
        // Revisit genuinely idle armies every 20 days; a 10-day supply tick is already scheduled.
         // Do not interrupt an in-flight order or a legitimate occupation.
         if(reactive&&!a.needsOrders&&w.dayIndex<(a.g2aNextOrderReviewDay||0))continue;
        // A combat victor may already be standing on hostile land: begin occupation first.
        const t=w.tiles[a.tileId];if(t.ownerId!==null&&t.ownerId!==id&&t.occupiedBy!==id&&atWar(w,id,t.ownerId)){
          // Coalition-controlled land can be traversed; never lock an army attempting a second occupation.
          if(beginOccupation(w,a,a.tileId))continue;
        }
        if(c3ArmyReady(a)<Math.ceil(manpower(a)*.75)&&atSafeSettlement(w,a)){a.g2aOrderStatus='TRAINING';a.g2aNextOrderReviewDay=w.dayIndex+20;continue;}
        if(!armyOffensiveReady(w,a)){
           a.g2aOrderStatus='RECOVERING';a.g2aNextOrderReviewDay=w.dayIndex+20;continue;
         }
         // A MOVE_ARMY order costs 0.2 AP. Record a real shortage instead of
         // misclassifying a valid target as a pathfinding/AI order failure.
         if(n.apUnits<2){a.needsOrders=false;a.g2aOrderStatus='AP_SHORTAGE';a.g2aNextOrderReviewDay=w.dayIndex+20;continue;}
         const next=chooseOperation(w,a,war,profile,reserved,common,c6Context);
         a.needsOrders=false;a.g2aNextOrderReviewDay=w.dayIndex+20;
         if(!next){a.g2aOrderStatus='NO_REACHABLE_TARGET';if(w.c6StrategyStats)w.c6StrategyStats.noReachableOrders++;continue;}
         const sent=execute(w,id,{type:'MOVE_ARMY',armyId:a.id,targetTileId:next.id});
         if(sent.ok){
           a.operation={type:next.role,targetTileId:next.id,assignedDay:w.dayIndex};reserved.add(next.id);
           a.g2aOrderStatus='ADVANCING';
         }else{a.g2aOrderStatus='ORDER_REJECTED';}

      }
    }
  }
}
/** D5: reserve a 10% staffing margin below the 150-soldier organization ceiling.
 * This is a target, not a change to real enlistment capacity or the 150 limit.
 * At small populations, demographic mobilization remains the binding cap.
 */
function militaryStrengthTarget(w,nationId){
  const slots=armyLimit(w,nationId);
  // Never force a pre-existing <=16-army nation to downsize merely because the
  // new staffing target is below its former 150-per-army fielded strength.
  const investment=w.aiProfiles[w.nations[nationId].aiProfileId]?.military?.militaryInvestment??50;
  const fill=militaryClamp(.65+.0035*investment,.65,1);
  return Math.min(Math.floor(militaryCapacity(w,nationId)*fill),150*slots);
}
function freeRecruitmentSettlements(w,nationId){
  return w.settlements.filter(s=>safeSettlement(w,s,nationId)&&s.population>=30)
    .sort((a,b)=>b.population-a.population||a.id-b.id);
}
// E4A: recovery is a logistics decision, never a teleport or free resupply.
// A bounded shortlist keeps the extra A* work independent of world army count.
function v04e4RecoveryCandidates(w,n,settlements,ready,deficit){
  if(ready<1||deficit<=0||militaryAtWar(w,n.id))return [];
  const current=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&a.engagementId===null&&
    !isOccupying(w,a)&&manpower(a)<150&&manpower(a)>0&&w.tiles[a.tileId]?.ownerId===n.id);
  const activeTowns=new Set(settlements.map(s=>s.coreTileId));
  return current.filter(a=>{
    if(activeTowns.has(a.tileId))return false;
    if(a.order)return false; // do not overwrite a march, occupation or existing recovery.
    if(a.operation?.type==='REARM'&&w.dayIndex-(a.operation.assignedDay||0)<120)return false;
    return true;
  }).sort((a,b)=>manpower(a)-manpower(b)||a.id-b.id);
}
function v04e4OrderRecovery(w,n,settlements,field,execute,diag){
  if(!field.length||!settlements.length)return;
  // Single bounded replacement per nation per YEAR; keep peacetime garrison
  // routing dominant rather than launching numerous extra paths each quarter.
  if(w.dayIndex-(n.military.e4RecoveryLastOrderDay??-120)<120)return;
  if(w.armies.some(a=>a.nationId===n.id&&a.operation?.type==='REARM'&&w.dayIndex-(a.operation.assignedDay||0)<120))return;
  let issued=0;
  for(const army of field.slice(0,2)){
    if(issued>=1)break;
    // Choose only 4 nearby reachable-looking towns; the actual MOVE_ARMY
    // legality performs full pathfinding only for those few finalists.
    const reachable=garrisonDistances(w,army.tileId,n.id);
    const towns=settlements.filter(s=>reachable[s.coreTileId]>=0).map(s=>
      ({s,d:reachable[s.coreTileId]})).sort((a,b)=>a.d-b.d||b.s.population-a.s.population||a.s.id-b.s.id).slice(0,2);
    let ok=false;
    const previousAPFailures=diag.failReasons.AP_SHORTAGE||0;
    for(const {s} of towns){
      if(execute(w,n.id,{type:'MOVE_ARMY',armyId:army.id,targetTileId:s.coreTileId}).ok){
        army.operation={type:'REARM',targetTileId:s.coreTileId,assignedDay:w.dayIndex};
        issued++;n.military.e4RecoveryLastOrderDay=w.dayIndex;diag.recoveryOrders++;ok=true;break;
      }
    }
    // An unaffordable MOVE order is not a pathfinding failure.
    if(!ok&&(diag.failReasons.AP_SHORTAGE||0)===previousAPFailures)diag.recoveryNoRoute++;
  }
}
function levyReinforcement(army,amount){
  const levies=army.units.filter(u=>u.typeId==='levy');
  if(!levies.length)return null;
  const front=new Set(army.deployment.front);
  return {type:'REINFORCE_ARMY',armyId:army.id,amount,unitId:(levies.find(u=>front.has(u.id))||levies[0]).id};
}
function provisionArmy(w,n,army,settlement,deficit,execute){
  const amount=Math.min(deficit,150-manpower(army),100,n.military.reserveReady);
  if(amount<=0)return false;
  const proposed={type:'REINFORCE_ARMY',armyId:army.id,settlementId:settlement.id,amount};
  if(execute(w,n.id,proposed).ok)return true;
  // Insufficient iron/wood should not permanently block cheap levy replenishment.
  const alternative=levyReinforcement(army,amount);
  return Boolean(alternative&&execute(w,n.id,{...alternative,settlementId:settlement.id}).ok);
}
function preferredRecruitment(w,n,settlement,amount,profile,execute){
  const mil=profile.military;
  const archers=Math.floor(amount*(.04+mil.rangedPreference*.003));
  const spears=Math.floor(amount*(.06+mil.spearPreference*.003));
  const reserve=Math.max(1,Math.floor(amount*(.12+mil.reservePreference*.0012)));
  const levies=amount-reserve-archers-spears;
  const strongestMelee=['heavy_infantry','pikeman','swordsman'].find(id=>loadoutLegal(w,n.id,id)&&n.resources.iron>100)||'spearman';
  const strongestRanged=['rifle_infantry','flintlock','matchlock','crossbowman','longbowman'].find(id=>loadoutLegal(w,n.id,id)&&n.resources.wood>150&&(!LOADOUTS[id].machine_parts||n.resources.machine_parts>=Math.max(1,archers)*LOADOUTS[id].machine_parts)&&(!LOADOUTS[id].steel||n.resources.steel>=Math.ceil(Math.max(1,archers)*LOADOUTS[id].steel)))||'archer';
  const composition=[{typeId:'levy',position:'front',amount:levies},
    {typeId:strongestMelee,position:'front',amount:spears},
    {typeId:strongestRanged,position:'rear',amount:archers},
    {typeId:'levy',position:'reserve',amount:reserve}].filter(v=>v.amount>0);
  const action={type:'RECRUIT_ARMY',settlementId:settlement.id,amount,composition};
  // AI has no exemption from common costs; use basic levy if metal or wood is lacking.
  return execute(w,n.id,action).ok||execute(w,n.id,{type:'RECRUIT_ARMY',settlementId:settlement.id,amount}).ok;
}

// V0.8C: 20-30% desired rear-line machine-gun support, 35% rebalancing threshold.
// The country keeps the original one-rearm-per-quarter limit, and each paid
// partial conversion uses the existing G5 slice machinery (<= 24 people).
// Existing excess machine gunners are converted to riflemen gradually, never deleted.
function v08cMachineGunSupportQuarter(w,n,armies,execute){
 if(!loadoutLegal(w,n.id,'machine_gunner')||!loadoutLegal(w,n.id,'rifle_infantry'))return false;
 if(!armies.length)return false;
 const start=Math.floor(w.dayIndex/30)%armies.length;
 for(let offset=0;offset<armies.length;offset++){
  const a=armies[(start+offset)%armies.length];
  if(a.rearmPlan||a.g5RedeployPlan||!atSafeSettlement(w,a))continue;
  const rear=rearmGroups(a,'rear').filter(u=>u.manpower>0);
  const total=rear.reduce((sum,u)=>sum+u.manpower,0);
  if(total<8)continue;
  const guns=rear.filter(u=>u.typeId==='machine_gunner').reduce((sum,u)=>sum+u.manpower,0);
  const rifle=rear.filter(u=>u.typeId==='rifle_infantry').reduce((sum,u)=>sum+u.manpower,0);
  // When already above 35%, trim toward 30%; below 20%, expand toward 25%.
  const excess=guns/total>.35?guns-Math.floor(total*.30):0;
  const missing=guns/total<.20&&rifle>0?Math.floor(total*.25)-guns:0;
  const target=excess>0?'rifle_infantry':missing>0?'machine_gunner':null;
  if(!target)continue;
  const candidate=rear.find(u=>u.typeId===(excess>0?'machine_gunner':'rifle_infantry'));
  if(!candidate)continue;
  const amount=Math.min(G5_MOVE_CAP,candidate.manpower,excess>0?excess:missing);
  if(amount<=0)continue;
  const action={type:'REARM_ARMY',armyId:a.id,unitType:target,position:'rear',unitId:candidate.id,amount};
  if(!rearmLegal(w,n.id,action))continue;
  const price=rearmPrice(w,n.id,action);
  if(!price||!canAfford(n,price))continue;
  if(execute(w,n.id,action).ok){
   if(g1Enabled(w))g1Record(w,n,'CANDIDATE','STARTED',{armyId:a.id,position:'rear',target,people:amount,price,unitId:candidate.id,v08cSupport:true,oldRatio:Math.round(10000*guns/total)/100});
   return true;
  }
 }
 return false;
}

function militaryReadiness(w,nationId){
  const target=militaryStrengthTarget(w,nationId);
  const men=nationManpower(w,nationId);
  const ready=w.armies.filter(a=>a.nationId===nationId&&a.status==='READY')
    .reduce((sum,a)=>sum+manpower(a),0);
  return {target,men,ready,ratio:cap(men/Math.max(target,1),0,1),readyRatio:cap(ready/Math.max(target,1),0,1)};
}
// V0.4E2: observation only. No random calls and no changes to action legality.
const V04E2_DIAG_WINDOW=12;
const V04E2_DIAG_REASONS=new Set(['TARGET_MET','NO_SAFE_SETTLEMENT','NO_READY_RESERVES','TRAINING_LIMIT','ARMY_LIMIT','EQUIPMENT_SHORTAGE','GOLD_SHORTAGE','AP_SHORTAGE','REINFORCEMENT_BLOCKED','NO_RECOVERY_ROUTE','FISCAL_PRESSURE','TRAINING_PENDING','POPULATION_LIMIT','FORMATION_LIMIT','RECOVERY_NEEDED','RECOVERY_IN_PROGRESS','REINFORCEMENT_AVAILABLE','ACTION_REJECTED','RECRUITED','REINFORCED','TRAINING_STARTED','RECOVERY_ORDERED','DEMOBILIZED','EMERGENCY_MUSTERED','NO_ACTION','FISCAL_DEMOBILIZED','NO_ELIGIBLE_SAFE_ARMY','DEFENSE_FLOOR']);
const V04E2_DIAG_ACTIONS=['TRAIN_RESERVES','RECRUIT_ARMY','RAISE_ARTILLERY','REINFORCE_ARMY','MOVE_ARMY','DISBAND_ARMY'];
function v04e2NewMobilizationReport(w,n){
 const men=activeManpower(w,n.id),target=militaryStrengthTarget(w,n.id);
 return {dayIndex:w.dayIndex,target,men,deficit:Math.max(0,target-men),capacity:militaryCapacity(w,n.id),
  ready:n.military.reserveReady,pending:pendingManpower(n),trainingLimit:trainingRate(w,n.id),
  armyCount:ownArmyCount(w,n.id),armyLimit:armyLimit(w,n.id),gold:n.gold,
  militaryUpkeep:militaryUpkeep(w,n.id),safeSettlements:0,recoveryEligible:0,recoveryOrders:0,recoveryInProgress:0,recoveryNoRoute:0,understrengthFormations:0,
  attempts:{},success:{},failed:{},failReasons:{},reason:'NO_ACTION'};
}
function v04e2FailureReason(w,n,action){
 const cost=getActionPrice(w,n.id,action); // Same quoted costs; never mutate resources.
 if(cost&&n.apUnits<cost.apUnits)return 'AP_SHORTAGE';
 if(cost&&n.gold<cost.gold)return 'GOLD_SHORTAGE';
 if(cost&&Object.entries(cost.resources||{}).some(([key,value])=>(n.resources[key]||0)<value))return 'EQUIPMENT_SHORTAGE';
 if(action.type==='RECRUIT_ARMY'&&ownArmyCount(w,n.id)>=armyLimit(w,n.id))return 'ARMY_LIMIT';
 if(action.type==='TRAIN_RESERVES'&&n.military.lastTrainingDay===v04eQuarterDay(w))return 'TRAINING_LIMIT';
 if(action.type==='REINFORCE_ARMY')return 'REINFORCEMENT_BLOCKED';
 return 'ACTION_REJECTED';
}
function v04e2RecordMobilizationAction(w,n,r,action,result){
 const key=action.type;if(!V04E2_DIAG_ACTIONS.includes(key))return;
 r.attempts[key]=(r.attempts[key]||0)+1;
 const bucket=result.ok?r.success:r.failed;bucket[key]=(bucket[key]||0)+1;
 if(!result.ok){const reason=v04e2FailureReason(w,n,action);r.failReasons[reason]=(r.failReasons[reason]||0)+1;if(reason==='AP_SHORTAGE'){const ap=v04e3ApReport(n);if(ap)ap.blockedAP++;}}
}
function v04e2FinishMobilization(w,n,r){
 // Capture real post-action state as well as the pre-action decision context.
 r.finalMen=activeManpower(w,n.id);r.finalReady=n.military.reserveReady;
 r.finalPending=pendingManpower(n);r.finalGold=n.gold;
 if(!V04E2_DIAG_REASONS.has(r.reason))r.reason='NO_ACTION';
 n.military.mobilizationDiagnostics??=[];
 n.military.mobilizationDiagnostics.push(r);
 if(n.military.mobilizationDiagnostics.length>V04E2_DIAG_WINDOW)
  n.military.mobilizationDiagnostics.splice(0,n.military.mobilizationDiagnostics.length-V04E2_DIAG_WINDOW);
}
function v04e2MobilizationCsv(w){
 const fields=['nationId','nation','dayIndex','year','quarter','reason','failReasons','barracksAiReason','barracksAiGenerated','barracksAiLegal','barracksAiAffordable','barracksAiSelected','target','men','deficit','finalMen','capacity','ready','pending','trainingLimit','armyCount','armyLimit','gold','finalGold','militaryUpkeep','safeSettlements','recoveryEligible','recoveryOrders','recoveryInProgress','recoveryNoRoute','understrengthFormations',
  'h2d1_pressure','h2d1_outcome','h2d1_armyId','h2d1_returnedMen','h2d1_returnedMachines','h2d1_beforeMen','h2d1_afterMen','h2d1_target','h2d1_beforeUpkeep','h2d1_afterUpkeep','h2d1_estimatedSaving','h2d1_safeCandidates','h2d1_lastPowerStatus','h2d1_lastCivilUnpaid'];
 const rows=[fields.concat(V04E2_DIAG_ACTIONS.flatMap(t=>['attempts_'+t,'success_'+t,'failed_'+t]))];
 for(const n of w.nations)for(const r of n.military.mobilizationDiagnostics||[]){
  const b=n.military.barracksAiDiagnostics?.find(x=>x.dayIndex===r.dayIndex);
  rows.push(fields.map(k=>k==='nationId'?n.id:k==='nation'?n.name:k==='year'?Math.floor(r.dayIndex/120)+1:k==='quarter'?Math.floor((r.dayIndex%120)/30)+1:
    k==='failReasons'?JSON.stringify(r.failReasons):k==='barracksAiReason'?b?.reason||'':k==='barracksAiGenerated'?b?.generated??'':
    k==='barracksAiLegal'?b?.legal??'':k==='barracksAiAffordable'?b?.affordable??'':k==='barracksAiSelected'?b?.chosen??'':k.startsWith('h2d1_')?(r.h2d1Fiscal?.[k.slice(5)]??''):r[k]??'')
   .concat(V04E2_DIAG_ACTIONS.flatMap(t=>[r.attempts[t]||0,r.success[t]||0,r.failed[t]||0])));
 }
 return rows.map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
/** B4: deterministic per-quarter war decisions. Diagnostics never consume RNG. */
const V06B4_HISTORY_LIMIT=96;
const V06B4_LOSS_WINDOW=12*DAYS_PER_YEAR;
function v06b4NewDiagnostics(sinceDay=0){
 return {sinceDay,evaluations:0,targetEvaluations:0,candidateApproved:0,candidateBlocked:0,
   declared:0,declarationFailed:0,blockReasons:{},history:[]};
}
function v06b4Diagnostics(w){return w.warDecisionDiagnostics??(w.warDecisionDiagnostics=v06b4NewDiagnostics(w.dayIndex));}
function v06b4ValidateDiagnostics(w,fail){
 const d=w.warDecisionDiagnostics;
 if(!d||!Number.isSafeInteger(d.sinceDay)||d.sinceDay<0||d.sinceDay>w.dayIndex||
   ['evaluations','targetEvaluations','candidateApproved','candidateBlocked','declared','declarationFailed'].some(k=>!Number.isSafeInteger(d[k])||d[k]<0)||
   !d.blockReasons||typeof d.blockReasons!=='object'||Object.values(d.blockReasons).some(v=>!Number.isSafeInteger(v)||v<0)||
   !Array.isArray(d.history)||d.history.length>V06B4_HISTORY_LIMIT||d.history.some(h=>
      !Number.isSafeInteger(h.dayIndex)||h.dayIndex<d.sinceDay||h.dayIndex>w.dayIndex||
      !Number.isInteger(h.nationId)||!w.nations[h.nationId]||
      h.targetNationId!==null&&(!Number.isInteger(h.targetNationId)||!w.nations[h.targetNationId])||
      typeof h.reason!=='string'||h.reason.length>60||typeof h.approved!=='boolean'||
      h.willingness!==null&&!Number.isFinite(h.willingness)||
      h.strategicRatio!==null&&!Number.isFinite(h.strategicRatio)))fail('B4 선전포고 판단 진단');
}
function v06b4WarHistoryLoss(w,id,foeId){
 let weighted=0,count=0,sameFoe=0,decisive=0,landLoss=0,casualtyLoss=0,lastLossDay=null;
 for(const h of w.warHistory||[]){
   const age=w.dayIndex-h.endedDay;
   if(age<0||age>V06B4_LOSS_WINDOW||h.winnerId==null)continue;
   const attackers=h.participants?.attackers||[h.attackerId],defenders=h.participants?.defenders||[h.defenderId];
   const won=attackers.includes(h.winnerId)?attackers:defenders;
   const lost=attackers.includes(h.winnerId)?defenders:attackers;
   if(!lost.includes(id)||won.includes(id))continue;
   const freshness=1-age/V06B4_LOSS_WINDOW;
   const magnitude=h.tier==='DECISIVE'?1.5:h.tier==='CLEAR'?1.2:h.tier==='LIMITED'?.85:.55;
   weighted+=magnitude*(.35+.65*freshness);count++;
   if(h.tier==='DECISIVE')decisive++;
   if(won.includes(foeId))sameFoe++;
   if(h.territoryAwards)landLoss+=Object.values(h.territoryAwards).reduce((t,v)=>t+Math.max(0,Number(v)||0),0)*freshness;
   casualtyLoss+=Math.max(0,Number(h.casualties?.[id])||0)*freshness;
   lastLossDay=Math.max(lastLossDay??-1,h.endedDay);
 }
 return {count,weighted:Math.round(weighted*100)/100,sameFoe,decisive,landLoss:Math.round(landLoss),casualtyLoss:Math.round(casualtyLoss),lastLossDay};
}
/** Anticipated support applies the actual call eligibility and AI response rules.
 * AI-only joining is estimated; a human-controlled ally is never assumed to auto-join.
 * AI responses are discounted for uncertainty, not invented as mandatory engagements.
 */
function v06b4ProjectedCoalition(w,attackerId,defenderId,readiness=null){
 const ready=id=>readiness?.get(id)||militaryReadiness(w,id);
 const war={attackerId,defenderId,sides:{attackers:[attackerId],defenders:[defenderId]}};
 const defensive=[],offensive=[],used=new Set([attackerId,defenderId]);
 const possible=(id,side)=>w.nations[id]?.active&&w.nations[id].controller==='AI'&&!used.has(id)&&
   c2CanJoinWar(w,id,side==='defenders'?[defenderId]:[attackerId],side==='defenders'?[attackerId]:[defenderId]);
 const add=(id,side,basis)=>{
   if(!possible(id,side)||warSupportTreatyConflict(w,id,war,side))return;
   const call={allyId:id,defenderId,principalId:side==='defenders'?defenderId:attackerId,basis};
   const joins=side==='defenders'?(basis==='SUZERAIN'?v06bSuzerainDefenseDecision(w,call,war):aiCallDecision(w,call,war)):
     aiOffensiveCallDecision(w,call,war);
   if(!joins)return;
   const men=ready(id).ready;
   if(men<12)return;
   // The actual joining response occurs next quarterly tick and is not certain.
   const multiplier=basis==='SUZERAIN'?.90:side==='defenders'?.78:.57;
   const effective=Math.round(b4aReadyPower(w,id)*multiplier*Math.max(.25,1-warsOfNation(w,id).length*.3));
   const entry={id,basis,ready:men,effective};
   (side==='defenders'?defensive:offensive).push(entry);used.add(id);
 };
 // Defensive requests are processed first by diplomacy, and take priority when
 // a supporter is technically allied to both sides (those are excluded anyway).
 for(const t of w.diplomacy.alliances||[]){
   if(t.endsDay<=w.dayIndex)continue;
   const id=t.a===defenderId?t.b:t.b===defenderId?t.a:null;
   if(id!==null)add(id,'defenders','ALLIANCE');
 }
 const subject=v06bSubjectOf(w,defenderId);
 if(subject)add(subject.overlordId,'defenders','SUZERAIN');
 for(const t of w.diplomacy.alliances||[]){
   if(t.endsDay<=w.dayIndex)continue;
   const id=t.a===attackerId?t.b:t.b===attackerId?t.a:null;
   if(id!==null&&!v06bSubjectOf(w,id))add(id,'attackers','ALLIANCE');
 }
 const sum=a=>a.reduce((v,e)=>v+e.effective,0);
 return {defensive,offensive,defenseSupport:sum(defensive),attackSupport:sum(offensive)};
}
function v06b4WarAssessment(w,attackerId,defenderId,context={}){
 const own=context.own||militaryReadiness(w,attackerId),their=context.their||militaryReadiness(w,defenderId);
 const p=d1dEffectiveProfile(w,attackerId);
 const agg=(p?.military?.aggression??50)/100,risk=(p?.behavior?.riskTolerance??50)/100;
 const join=v06b4ProjectedCoalition(w,attackerId,defenderId,context.readiness);
 const ownForce=b4aReadyPower(w,attackerId)*Math.max(.25,1-warsOfNation(w,attackerId).length*.30)+join.attackSupport;
 const enemyForce=b4aReadyPower(w,defenderId)+join.defenseSupport+24;
 const strategicRatio=ownForce/Math.max(1,enemyForce);
 const losses=v06b4WarHistoryLoss(w,attackerId,defenderId);
 const geo=context.geo||null;
 const valuedTarget=Boolean(geo?.historical||geo?.prize>=.5);
 const targetValue=geo?.attraction??50;
 // Aggressive states may take unequal battles, but cannot erase a catastrophic mismatch.
 const baseThreshold=cap(1.27-.47*agg-.25*risk,.55,1.10);
 const lossPenalty=Math.min(.25,losses.weighted*.09)+Math.min(.12,losses.sameFoe*.06)+
   Math.min(.07,losses.landLoss*.004)+Math.min(.06,losses.casualtyLoss/15000);
 const recoveryPenalty=losses.count&&own.ratio<.8?Math.min(.18,(.8-own.ratio)*.6):0;
 const valuableDiscount=valuedTarget?Math.min(.12,Math.max(.04,(targetValue-45)*.0025)):0;
 const threshold=Math.max(.47,baseThreshold+lossPenalty+recoveryPenalty-valuableDiscount);
 let reason='APPROVED';
 if(strategicRatio<threshold){
   reason=join.defenseSupport>0&&strategicRatio<threshold?'COALITION_RISK':
     losses.sameFoe>0?'SAME_FOE_RECENT_DEFEAT':losses.count>0?'RECENT_DEFEAT':'LOW_STRATEGIC_RATIO';
 }
 else if(losses.count>0&&own.ratio<.68&&strategicRatio<Math.max(1.05,threshold+.20))reason='RECOVERY_INCOMPLETE';
 else if(geo&&geo.prize<.17&&!geo.historical&&strategicRatio<1.12)reason='LOW_STRATEGIC_VALUE';
 if(reason==='APPROVED'){const survival=b4aWarConstraint(w,attackerId,{strategicRatio,valuedTarget});if(survival)reason=survival;}
 return {approve:reason==='APPROVED',reason,strategicRatio,threshold,ownReady:own.ready,theirReady:their.ready,
    projectedAttack:ownForce,projectedDefense:enemyForce,join,losses,valuedTarget};
}
function v06b4RecordWarDecision(w,id,reason,target=null,assessment=null){
 const d=v06b4Diagnostics(w);d.evaluations++;
 const item={dayIndex:w.dayIndex,nationId:id,targetNationId:target?.id??null,reason:reason.slice(0,60),
   approved:!!target,willingness:target?geoRound(target.willingness):null,
   strategicRatio:assessment?geoRound(assessment.strategicRatio):null,
   threshold:assessment?geoRound(assessment.threshold):null,
   projectedAttack:assessment?.projectedAttack??null,projectedDefense:assessment?.projectedDefense??null,
   defensiveAllies:assessment?.join.defensive||[],offensiveAllies:assessment?.join.offensive||[],
   recentDefeats:assessment?.losses.count??0,sameFoeDefeats:assessment?.losses.sameFoe??0,declared:false};
 d.history.push(item);if(d.history.length>V06B4_HISTORY_LIMIT)d.history.splice(0,d.history.length-V06B4_HISTORY_LIMIT);
 return item;
}
/** Eligible AI attacks are ranked AFTER coalition, recovery and prize checks. */
function warDecision(w,nationId){
 const n=w.nations[nationId],profile=n&&d1dEffectiveProfile(w,nationId);
 const report=strategicReport(w,nationId);
 const record=(reason,target=null,assessment=null)=>{
   if(report)report.warIntent={reason,targetNationId:target?.id??null,willingness:target?geoRound(target.willingness):null,
     strategicRatio:assessment?geoRound(assessment.strategicRatio):null,threshold:assessment?geoRound(assessment.threshold):null};
   v06b4RecordWarDecision(w,nationId,reason,target,assessment);
   return target;
 };
 if(!n?.active||!profile||v06bSubjectOf(w,nationId)||w.dayIndex<3*DAYS_PER_YEAR)return record('INELIGIBLE_OR_PREPARING');
 const own=militaryReadiness(w,n.id),budget=militaryUpkeep(w,n.id);
 const income=n.lastQuarter?.goldIncome||0;
 if(n.military?.unpaidQuarters>0||n.gold<Math.max(200,budget*2)||budget>income*1.75)return record('FISCAL_PRESSURE');
 const liveWars=warsOfNation(w,n.id);
 if(liveWars.length>=3)return record('MULTI_WAR_OVEREXTENSION');
 const committed=liveWars.length?Math.min(.66,liveWars.length*.27):0;
 if(own.men*(1-committed)<18||own.ratio*(1-committed)<.55||own.readyRatio*(1-committed)<.45)return record('MILITARY_NOT_READY');
 const enemies=borderEnemies(w,n.id).filter(id=>{
   const foe=w.nations[id];return foe.active&&c2CanStartWar(w,[n.id],[id])&&!allianceBetween(w,n.id,id)&&!v06bBetween(w,n.id,id)&&
     (n.truces?.[id]??0)<=w.dayIndex&&(foe.truces?.[n.id]??0)<=w.dayIndex;
 });
 if(!enemies.length)return record('NO_LEGAL_BORDER_TARGET');
 const d=v06b4Diagnostics(w),readiness=new Map([[n.id,own]]);
 let best=null,bestRejected=null;
 for(const id of enemies){
   const their=readiness.get(id)||militaryReadiness(w,id);readiness.set(id,their);
   const geo=report?.neighbors.find(e=>e.id===id);
   const aggression=profile.military.aggression/100,risk=profile.behavior.riskTolerance/100;
   const advantage=own.ready/(their.ready+24);
   const strengthFactor=cap(.76+.24*Math.log(Math.max(.1,advantage)),.38,1.28);
   const diplomaticPressure=1+(-relationOf(w,n.id,id)/100)*.30-(profile.diplomacy.cooperation/100)*.15;
   const legacy=(.30+.57*aggression+.11*risk)*(.52+.48*own.ratio)*strengthFactor*diplomaticPressure;
   const geoFactor=geo?(.66+geo.attraction/160):1;
   const willingness=legacy*geoFactor*v06aWarWeight(w,n.id,id);
   const assessment=v06b4WarAssessment(w,n.id,id,{own,their,geo,readiness});
   d.targetEvaluations++;
   const reason=!assessment.approve?assessment.reason:willingness<.63?'LOW_WILLINGNESS':'APPROVED';
   if(reason!=='APPROVED'){
     if(reason==='SURVIVAL_CRISIS'||reason==='DECISIVE_DEFEAT_RECOVERY'||reason==='STRATEGIC_RECOVERY')n.survival.warBlocked++;
     d.candidateBlocked++;d.blockReasons[reason]=(d.blockReasons[reason]||0)+1;
     if(!bestRejected||willingness>bestRejected.willingness)bestRejected={id,willingness,assessment,reason};
     continue;
   }
   d.candidateApproved++;
   if(!best||willingness>best.willingness||(willingness===best.willingness&&id<best.id))best={id,willingness,advantage,assessment};
 }
 return record(best?'APPROVED':bestRejected?.reason||'NO_SUITABLE_TARGET',best,best?.assessment||bestRejected?.assessment||null);
}
/** One passable friendly-land flood fill for ALL candidate posts from an army's origin.
 * This avoids the legacy army x border-post full A* explosion in large worlds.
 * Final selected routes are still validated using the unchanged actual march A*.
 */
function garrisonDistances(w,start,nationId){
 const distances=new Int32Array(w.tiles.length).fill(-1),queue=[start];distances[start]=0;
 for(let i=0;i<queue.length;i++){
   const at=queue[i];for(const next of neighbors4(at,w.size,w.height)){
     const t=w.tiles[next];if(distances[next]>=0||!TERRAINS[t.terrain].passable||t.ownerId!==nationId||t.occupiedBy!==null)continue;
     distances[next]=distances[at]+1;queue.push(next);
   }
 }
 return distances;
}
/** V0.3A1: score physically reachable safe border garrisons; only at quarter boundaries. */
function peacetimeBorderPosts(w,nationId){
  const nation=w.nations[nationId],p=nation&&w.aiProfiles[nation.aiProfileId];
  if(!nation?.active||!p)return [];
  const posts=[];
  const foeReadiness=new Map(),ownReport=strategicReport(w,nationId),settlementCores=new Set(w.settlements.filter(s=>s.ownerId===nationId).map(s=>s.coreTileId));
  for(const t of w.tiles){
    if(t.ownerId!==nationId||t.occupiedBy!==null||!TERRAINS[t.terrain].passable)continue;
    const threats=neighbors4(t.id,w.size,w.height).map(id=>w.tiles[id].ownerId)
      .filter(id=>id!==null&&id!==nationId&&w.nations[id]?.active);
    if(!threats.length)continue;
    const unique=[...new Set(threats)];
    let score=0;
    for(const foeId of unique){
      const foe=w.nations[foeId],relation=relationOf(w,nationId,foeId),f=w.aiProfiles[foe.aiProfileId];
      if(!foeReadiness.has(foeId))foeReadiness.set(foeId,militaryReadiness(w,foeId).men);
      const readiness=foeReadiness.get(foeId);
      const hostility=Math.max(0,-relation)*.16;
      const aggression=(f?.military?.aggression??50)*.12;
      const historical=occupiedHistoricCapital(w,nationId,foeId)?13:0;
      score=Math.max(score,22+hostility+aggression+historical+Math.min(10,readiness/30));
      const geo=ownReport?.neighbors.find(e=>e.id===foeId);
      if(geo)score+=geo.threat*.18;
    }
    const defense=fortDefense(w,t.id);
    score+=Math.min(5,defense/10)+(settlementCores.has(t.id)?3:0)+Math.min(4,threats.length*1.5);
    posts.push({tileId:t.id,score:Number(score.toFixed(3))});
  }
  return posts.sort((a,b)=>b.score-a.score||a.tileId-b.tileId);
}
function assignPeacetimeGarrisons(w,execute){
  // E4 performance: garrison routes are identical for armies starting at the
  // same tile within one quarter; ownership and fort positions cannot change
  // during this assignment pass. Cache only for this call, never in saves.
  const distancesMemo=new Map(),routeMemo=new Map();
  for(const nation of w.nations){
    if(!nation.active||nation.controller!=='AI'||militaryAtWar(w,nation.id))continue;
    const posts=peacetimeBorderPosts(w,nation.id);if(!posts.length)continue;
    const armies=w.armies.filter(a=>a.nationId===nation.id&&manpower(a)>=12&&a.status==='READY'&&a.engagementId===null&&!a.f3fRout&&!a.hServiceReturn)
      .sort((a,b)=>a.id-b.id);
    const assigned=[];
    const keepReserve=armies.length>=4?Math.max(1,Math.floor(armies.length*.17)):0;
    const deployable=armies.slice(0,Math.max(0,armies.length-keepReserve));
    for(const army of deployable){
      if(c3ArmyPending(army)>0&&atSafeSettlement(w,army))continue; // train recruits before sending them to border outposts
      // Never interrupt other orders, replenishment trips, or a recent re-positioning.
      if(army.operation?.type==='REARM'&&manpower(army)<150&&w.dayIndex-(army.operation.assignedDay||0)<120)continue;
      if(army.order&&army.operation?.type!=='BORDER_GARRISON')continue;
      if(army.order&&army.operation?.type==='BORDER_GARRISON'){
        assigned.push(army.order.targetTileId);continue;
      }
      const distKey=nation.id+':'+army.tileId;
      let distances=distancesMemo.get(distKey);
      if(!distances){distances=garrisonDistances(w,army.tileId,nation.id);distancesMemo.set(distKey,distances);}
      // Cheap shortest-step ranking first, followed by actual road-weighted
      // route checks for the best candidates only. No hidden teleporting.
      const shortlist=[];
      for(const post of posts){
        if(distances[post.tileId]<0)continue;
        if(assigned.some(id=>Math.abs(id%w.size-post.tileId%w.size)+Math.abs(Math.floor(id/w.size)-Math.floor(post.tileId/w.size))<3))continue;
        shortlist.push({...post,value:post.score-.28*distances[post.tileId]});
      }
      shortlist.sort((a,b)=>b.value-a.value||a.tileId-b.tileId);
      // F4D2: Prove the final "stay at current border post" decision before
      // evaluating all weighted A* candidates. A route length penalty is
      // non-negative: if every raw score <= current.score+5, no valid route
      // can force departure. Still require at least one legal route; if none
      // exists, preserve the original no-scored-candidate result.
      const topPosts=shortlist.slice(0,8),currentPost=posts.find(p=>p.tileId===army.tileId);
      const canKeepEarly=!!currentPost&&topPosts.every(p=>currentPost.score>=p.score-5);
      const scored=[];
      for(const post of topPosts){
        const pathKey=distKey+':'+post.tileId;
        let path=routeMemo.get(pathKey);
        if(path===undefined){
          path=landRoute(w,army.tileId,post.tileId,t=>t.ownerId===nation.id&&t.occupiedBy===null,nation.id)||null;
          routeMemo.set(pathKey,path);
        }
        if(path){
          scored.push({...post,value:post.score-.28*(path.length-1)});
          if(canKeepEarly)break; // same assigned.push(army.tileId) after original check
        }
      }
      scored.sort((a,b)=>b.value-a.value||a.tileId-b.tileId);
      if(!scored.length)continue;
      const best=scored[0],current=posts.find(p=>p.tileId===army.tileId);
      if(current&&current.score>=best.score-5){assigned.push(army.tileId);continue;}
      if(army.tileId===best.tileId){assigned.push(army.tileId);continue;}
      if(army.operation?.type==='BORDER_GARRISON'&&w.dayIndex-(army.operation.assignedDay||0)<120){
        assigned.push(army.tileId);continue;
      }
      if(execute(w,nation.id,{type:'MOVE_ARMY',armyId:army.id,targetTileId:best.tileId}).ok){
        army.operation={type:'BORDER_GARRISON',targetTileId:best.tileId,assignedDay:w.dayIndex};
        assigned.push(best.tileId);
      }
    }
  }
}

function recallRoutedArmies(w,execute){
  for(const a of w.armies){
    if(!a.f3fRout||a.hServiceReturn||a.status!=='READY'||a.engagementId!==null||armyOffensiveReady(w,a))continue;
    const own=w.nations[a.nationId];if(!own?.active||own.controller!=='AI')continue;
    if(atSafeSettlement(w,a)){a.operation={type:'REARM',targetTileId:a.tileId,assignedDay:w.dayIndex};continue;}
    // Never teleport; use legal owned-land route to closest safe settlement.
    const candidate=w.settlements.filter(t=>t.ownerId===a.nationId)
      .map(t=>({s:t,path:landRoute(w,a.tileId,t.coreTileId,x=>x.ownerId===a.nationId&&x.occupiedBy===null,a.nationId)}))
      .filter(x=>x.path).sort((x,y)=>x.path.length-y.path.length||x.s.id-y.s.id)[0];
    if(!candidate)continue;
    if(a.order&&a.operation?.type==='REARM'&&a.order.targetTileId===candidate.s.coreTileId)continue;
    if(execute(w,a.nationId,{type:'MOVE_ARMY',armyId:a.id,targetTileId:candidate.s.coreTileId}).ok)
      a.operation={type:'REARM',targetTileId:candidate.s.coreTileId,assignedDay:w.dayIndex};
  }
}
// V0.7G1: session-only, opt-in observability. Never attach these objects to world/save.
// No RNG calls, extra AI actions, or resource changes are permitted in this module.
// G2: add per-nation, time-scoped decision audit to the opt-in G1 session observer.
// Never persist any G2 state in the world; never call RNG or execute an AI action.
const G1_RUNTIME=new WeakMap();
const G1_MAX_EVENTS=960,G1_MAX_QUARTERS=576,G2_MAX_OUTCOMES=576,G2_MAX_INTERVALS=64;
function g1Store(w){let s=G1_RUNTIME.get(w);if(!s){s={enabled:false,events:[],quarters:[],counts:{},sampleCounts:{},sampleDay:-1,sampledOut:0,dropped:0,
  startedDay:null,firstEnabledDay:null,resetDay:null,intervals:[],nationCounts:{},nationKinds:{},kindCounts:{},nationShortages:{},shortageCounts:{},
  work:{},outcomes:[],outcomesLost:0,orders:{},ordersMatched:0,ordersUnmatched:0,apRearm:{},activeObservationDays:0, g3Closed:{},g3History:[],g3HistoryLost:0,g3Perf:{},g3PerfTotal:{checked:0,measuredLegal:0,measuredPrice:0}};G1_RUNTIME.set(w,s);}return s;}
function g1Enabled(w){return G1_RUNTIME.get(w)?.enabled===true;}
function g2EndInterval(s,day){const last=s.intervals.at(-1);if(last&&last.endDay===null){last.endDay=day;s.activeObservationDays+=Math.max(0,day-last.startDay);}}
function g1SetEnabled(w,enabled){const s=g1Store(w),on=Boolean(enabled);if(s.enabled===on)return s.enabled;
 if(!on){g3ReconcileOrders(w);for(const id of Object.keys(s.orders))g3CloseOrder(w,id,'OBSERVATION_GAP','OBSERVATION_DISABLED');g2EndInterval(s,w.dayIndex);s.enabled=false;}
 else{s.enabled=true;if(s.firstEnabledDay===null)s.firstEnabledDay=w.dayIndex;if(s.startedDay===null)s.startedDay=w.dayIndex;
  s.intervals.push({startDay:w.dayIndex,endDay:null});if(s.intervals.length>G2_MAX_INTERVALS)s.intervals.shift();}
 return s.enabled;}
function g1Reset(w){const s=g1Store(w),on=s.enabled;s.events=[];s.quarters=[];s.counts={};s.sampleCounts={};s.sampleDay=-1;s.sampledOut=0;s.dropped=0;
 s.startedDay=on?w.dayIndex:null;s.firstEnabledDay=on?w.dayIndex:null;s.resetDay=w.dayIndex;s.intervals=on?[{startDay:w.dayIndex,endDay:null}]:[];
 s.activeObservationDays=0;s.nationCounts={};s.nationKinds={};s.kindCounts={};s.nationShortages={};s.shortageCounts={};
 s.work={};s.outcomes=[];s.outcomesLost=0;s.orders={};s.ordersMatched=0;s.ordersUnmatched=0;s.apRearm={};s.g3Closed={};s.g3History=[];s.g3HistoryLost=0;s.g3Perf={};s.g3PerfTotal={checked:0,measuredLegal:0,measuredPrice:0};}
// G3: session-only lifecycle closure. These functions never touch a World field.
const G3_ORDER_HISTORY_LIMIT=960;
function g3FinishTracked(w,armyId,status,reason){
 const s=G1_RUNTIME.get(w);if(!s?.enabled)return false;
 const key=String(armyId),order=s.orders[key];if(!order)return false;
 delete s.orders[key];g2Bump(s.g3Closed,status);
 if(status==='COMPLETED')s.ordersMatched++;
 const record={orderKey:order.key,armyId:Number(armyId),nationId:order.nationId,startedDay:order.startedDay,
  expectedCompleteDay:order.completeDay,lastSeenDay:order.lastSeenDay??order.startedDay,endDay:w.dayIndex,status,endReason:reason};
 s.g3History.push(record);if(s.g3History.length>G3_ORDER_HISTORY_LIMIT){s.g3History.shift();s.g3HistoryLost++;}
 return record;
}
function g3CloseOrder(w,armyId,status,reason){
 const order=g3FinishTracked(w,armyId,status,reason);if(!order)return false;
 const n=w.nations[order.nationId];
 if(n)g1Record(w,n,'LIFECYCLE',status,{armyId:Number(armyId),orderKey:order.orderKey,startedDay:order.startedDay,endDay:w.dayIndex,endReason:reason});
 return true;
}
function g3ObserveArmyRemoval(w,a,reason){if(a)g3CloseOrder(w,a.id,'ARMY_REMOVED',reason);}
function g3ReconcileOrders(w){
 const s=G1_RUNTIME.get(w);if(!s?.enabled)return;
 // The observer is checked independently of world mutation; one scan per report/quarter.
 const present=new Map(w.armies.map(a=>[String(a.id),a]));
 for(const [id,record] of Object.entries(s.orders)){
  const a=present.get(id);
  if(!a){g3CloseOrder(w,id,'ARMY_MISSING_UNCONFIRMED','NOT_PRESENT_AT_RECONCILE');continue;}
  if(!a.rearmPlan){g3CloseOrder(w,id,'PLAN_MISSING_UNCONFIRMED','NO_REARM_PLAN_AT_RECONCILE');continue;}
  if(a.rearmPlan.completeDay!==record.completeDay||a.rearmPlan.unitType!==record.target||a.rearmPlan.position!==record.position){
   g3CloseOrder(w,id,'PLAN_MISSING_UNCONFIRMED','PLAN_CHANGED_WITHOUT_MATCH');continue;
  }
  record.lastSeenDay=w.dayIndex;
 }
}
function g3Clock(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
function g3TimingBegin(w,n){const s=G1_RUNTIME.get(w);if(!s?.enabled)return null;
 return {start:g3Clock(),nationId:n.id,checked:0,sampled:0,legalMs:0,priceMs:0,legalSamples:0,priceSamples:0,selectionMs:0};}
function g3TimingEnd(w,n,timing){if(!timing)return;
 const s=G1_RUNTIME.get(w),key=String(n.id),q=s.g3Perf[key]||(s.g3Perf[key]={quarters:0,candidates:0,selectionMs:0,legalMs:0,priceMs:0,totalMs:0,legalSamples:0,priceSamples:0});
 q.quarters++;q.candidates+=timing.checked;q.selectionMs+=timing.selectionMs;q.legalMs+=timing.legalMs;q.priceMs+=timing.priceMs;
 q.legalSamples+=timing.legalSamples;q.priceSamples+=timing.priceSamples;q.totalMs+=g3Clock()-timing.start;
 s.g3PerfTotal.checked+=timing.checked;s.g3PerfTotal.measuredLegal+=timing.legalSamples;s.g3PerfTotal.measuredPrice+=timing.priceSamples;
}
function g2Bump(object,key){object[key]=(object[key]||0)+1;}
function g2Work(s,n,day){const key=String(n.id);let p=s.work[key];if(!p||p.dayIndex!==day){p={dayIndex:day,nationId:n.id,nation:n.name,checked:0,unique:0,duplicates:0,shortages:{},started:0,legality:0,best:0,prices:0,firstShortage:null,seen:new Set()};s.work[key]=p;}return p;}
function g2Retain(s,entry){s.events.push(entry);if(s.events.length>G1_MAX_EVENTS){s.events.shift();s.dropped++;}}
function g2Count(s,n,kind,reason){g2Bump(s.counts,reason);g2Bump(s.kindCounts,kind);
 const id=String(n.id);const per=s.nationCounts[id]||(s.nationCounts[id]={});g2Bump(per,reason);
 const kinds=s.nationKinds[id]||(s.nationKinds[id]={});g2Bump(kinds,kind);}
function g2RecordOutcome(s,n,day,base,work){
 let final=base;
 if(base==='NO_REARM_STARTED'){
  if((work?.shortages.AP_SHORT||0)>0)final='NO_AP';
  else if((work?.shortages.MACHINE_PARTS_SHORT||0)>0||(work?.shortages.STEEL_SHORT||0)>0)final='NO_INDUSTRIAL_PARTS';
  else if(work?.firstShortage)final='OTHER_COST';
  else final='NO_UPGRADE';
 }
 const record={dayIndex:day,nationId:n.id,nation:n.name,result:final,source:base,candidateChecks:work?.checked||0,
  distinctCandidates:work?.unique||0,duplicateCandidates:work?.duplicates||0,started:work?.started||0,
  alreadyBest:work?.best||0,legalityBlocked:work?.legality||0,shortages:{...(work?.shortages||{})}};
 s.outcomes.push(record);if(s.outcomes.length>G2_MAX_OUTCOMES){s.outcomes.shift();s.outcomesLost++;}
 return record;
}
function g2TrackRecord(w,s,n,kind,reason,entry){
 const day=w.dayIndex,work=g2Work(s,n,day);
 if(kind==='CANDIDATE'){
  work.checked++;
  if(reason==='ALREADY_BEST')work.best++;
  if(reason==='LEGALITY_BLOCKED')work.legality++;
  if(reason==='STARTED')work.started++;
  if(entry?.armyId!==undefined){const key=entry.armyId+'|'+entry.position+'|'+entry.target;
   if(work.seen.has(key))work.duplicates++;else{work.seen.add(key);work.unique++;}}
  const shortages=entry?.shortages||[];
  for(const shortage of new Set(shortages)){g2Bump(work.shortages,shortage);g2Bump(s.shortageCounts,shortage);
   const id=String(n.id),r=s.nationShortages[id]||(s.nationShortages[id]={});g2Bump(r,shortage);
   if(work.firstShortage===null)work.firstShortage=shortage;}
 }
 if(kind==='GATE'||kind==='QUARTER'){g2RecordOutcome(s,n,day,reason,work);delete s.work[String(n.id)];}
 if(kind==='CANDIDATE'&&reason==='STARTED'&&entry?.armyId!==undefined){
  const key=entry.armyId+'|'+day+'|'+entry.position+'|'+entry.target;
  entry.orderKey=key;entry.completeDay=getArmy(w,entry.armyId)?.rearmPlan?.completeDay??null;
  s.orders[String(entry.armyId)]={key,nationId:n.id,startedDay:day,lastSeenDay:day,completeDay:entry.completeDay,target:entry.target,position:entry.position};
  const byDay=s.apRearm[String(n.id)]||(s.apRearm[String(n.id)]={});byDay[day]=(byDay[day]||0)+(entry.price?.apUnits||0);
 }
 if(kind==='COMPLETED'&&entry?.armyId!==undefined){const id=String(entry.armyId),order=s.orders[id];
  if(order){entry.orderKey=order.key;entry.startedDay=order.startedDay;g3FinishTracked(w,id,'COMPLETED','NORMAL_REARM_COMPLETION');}
  else{s.ordersUnmatched++;entry.orderKey=null;entry.note='Start before enabled window / not observed';}}
}
function g1Record(w,n,kind,reason,data=null){
 const s=G1_RUNTIME.get(w);if(!s?.enabled)return;
 g2Count(s,n,kind,reason);
 // Raw events are only examples, counters include EVERY observed evaluation.
 if(s.sampleDay!==w.dayIndex){s.sampleDay=w.dayIndex;s.sampleCounts={};}
 const key=n.id+'|'+kind+'|'+reason;
 const entry={dayIndex:w.dayIndex,nationId:n.id,nation:n.name,kind,reason,...(data||{})};
 g2TrackRecord(w,s,n,kind,reason,entry);
 if(kind==='CANDIDATE'&&reason!=='STARTED'){
  const count=s.sampleCounts[key]||0;
  if(count>=3){s.sampledOut++;return;}
  s.sampleCounts[key]=count+1;
 }
 g2Retain(s,entry);
}
// Hot-path form avoids building an object millions of times for ALREADY_BEST.
function g2RecordAlreadyBest(w,n,armyId,position,target){const s=G1_RUNTIME.get(w);if(!s?.enabled)return;
 g2Count(s,n,'CANDIDATE','ALREADY_BEST');
 const work=g2Work(s,n,w.dayIndex);work.checked++;work.best++;
 const key=armyId+'|'+position+'|'+target;if(work.seen.has(key))work.duplicates++;else{work.seen.add(key);work.unique++;}
 if(s.sampleDay!==w.dayIndex){s.sampleDay=w.dayIndex;s.sampleCounts={};}
 const sampleKey=n.id+'|CANDIDATE|ALREADY_BEST',count=s.sampleCounts[sampleKey]||0;
 if(count>=3){s.sampledOut++;return;}
 s.sampleCounts[sampleKey]=count+1;
 g2Retain(s,{dayIndex:w.dayIndex,nationId:n.id,nation:n.name,kind:'CANDIDATE',reason:'ALREADY_BEST',armyId,position,target});
}
function g1Shortages(n,price){const arr=[];
 if(n.apUnits<price.apUnits)arr.push('AP_SHORT');
 if(n.gold<price.gold)arr.push('GOLD_SHORT');
 if(n.knowledge<price.knowledge)arr.push('KNOWLEDGE_SHORT');
 for(const [good,v] of Object.entries(price.resources||{}))if((n.resources[good]||0)<v)arr.push(({'machine_parts':'MACHINE_PARTS_SHORT','steel':'STEEL_SHORT','iron':'IRON_SHORT','wood':'WOOD_SHORT'}[good])||'RESOURCE_SHORT');
 return arr;
}
function g1RecordQuarter(w,n){
 const s=G1_RUNTIME.get(w);if(!s?.enabled)return;
 const d=n.f2c2cDemand?.lastQuarter,b=n.f2bIndustry?.lastQuarter;
 if(!d||d.dayIndex!==w.dayIndex)return;
 const audit={};for(const good of ['machine_parts','steel']){
  const q=b?.[good];if(!q)continue;
  const left=(q.start||0)+(q.produced||0)+(q.imports||0)+(q.transfersIn||0);
  const right=(q.end||0)+(q.used||0)+(q.construction||0)+(q.exports||0)+(q.transfersOut||0)+(q.otherSpent||0);
  audit[good]={left,right,difference:left-right};
 }
 s.quarters.push({dayIndex:w.dayIndex,nationId:n.id,nation:n.name,partsTarget:d.partsTarget,steelTarget:d.steelTarget,
  startParts:d.startParts,startSteel:d.startSteel,endParts:d.endParts,endSteel:d.endSteel,
  partsOutput:d.partsOutput,steelOutput:d.steelOutput,partsDemand:d.partsDemand,steelDemand:d.steelDemand,
  partsActive:d.partsActive,steelActive:d.steelActive,partsReason:d.partsReason,steelReason:d.steelReason,
  partsOperated:d.partsOperated,steelOperated:d.steelOperated,
  machinePartsAudit:audit.machine_parts||null,steelAudit:audit.steel||null});
 if(s.quarters.length>G1_MAX_QUARTERS)s.quarters.splice(0,s.quarters.length-G1_MAX_QUARTERS);
}
function g1LayoutSummary(w,n){
 const ret={front:0,rear:0,reserve:0,back:0,rifle:0,byType:{},rifleByPosition:{front:0,rear:0,reserve:0}};
 for(const a of w.armies){if(a.nationId!==n.id)continue;
  for(const u of a.units){const men=Math.max(0,u.manpower||0);ret.byType[u.typeId]=(ret.byType[u.typeId]||0)+men;
   if(u.typeId==='rifle_infantry')ret.rifle+=men;
  }
  for(const pos of ['front','rear','reserve','back'])for(const u of rearmGroups(a,pos)){
   const men=Math.max(0,u.manpower||0);ret[pos]+=men;
   if(u.typeId==='rifle_infantry'&&pos in ret.rifleByPosition)ret.rifleByPosition[pos]+=men;
  }
 }
 ret.total=Object.values(ret.byType).reduce((sum,v)=>sum+v,0);
 ret.rifleRatio=ret.total?Math.round(ret.rifle/ret.total*10000)/100:0;
 return ret;
}
function g1PendingRifleView(w,n){
 // This is a *hypothetical eligible upper bound*, NOT a commitment or a purchase forecast.
 let armies=0,people=0,parts=0,steel=0,blockedResources=0,ongoing=0;
 const examples=[];
 for(const a of w.armies){if(a.nationId!==n.id)continue;
  if(a.rearmPlan){ongoing++;continue;}
  if(a.status!=='READY'||a.engagementId!==null||!atSafeSettlement(w,a)||manpower(a)<30)continue;
  const groups=rearmGroups(a,'rear');if(!groups.some(u=>u.manpower>0&&u.typeId!=='rifle_infantry'))continue;
  if(!loadoutLegal(w,n.id,'rifle_infantry'))continue;
  const action={type:'REARM_ARMY',armyId:a.id,unitType:'rifle_infantry',position:'rear'};
  if(!rearmLegal(w,n.id,action))continue;
  const price=rearmPrice(w,n.id,action);if(!price)continue;
  armies++;const count=groups.reduce((acc,u)=>acc+(u.manpower||0),0);people+=count;
  parts+=(price.resources.machine_parts||0);steel+=(price.resources.steel||0);
  if(!canAfford(n,price))blockedResources++;
  if(examples.length<6)examples.push({armyId:a.id,people:count,parts:price.resources.machine_parts||0,steel:price.resources.steel||0,shortages:g1Shortages(n,price)});
 }
 return {type:'HYPOTHETICAL_NOT_COMMITTED',candidateArmies:armies,people,parts,steel,blockedResources,ongoing,examples};
}
function g1IndustryNation(w,n){
 const d=n.f2c2cDemand||{},last=d.lastQuarter||null,b=n.f2bIndustry||{},q=b.lastQuarter||{},f=n.f2Factory||{};
 const per=n.f2bIndustry?.history?.slice(-12)||[],count=per.length;
 const consumed={machine_parts:0,steel:0};
 for(const row of per)for(const good of ['machine_parts','steel']){
  const r=row[good]||{};consumed[good]+=(r.used||0)+(r.construction||0)+(r.otherSpent||0);
 }
 // Actual planner's own reported consumption is preferred; historical attribution is unknown.
 const recentQuarter={machine_parts:last?.partsDemand??(count?Math.ceil(consumed.machine_parts/count):0),steel:last?.steelDemand??(count?Math.ceil(consumed.steel/count):0)};
 return {nationId:n.id,name:n.name,era:n.civilization?.era,stage:n.civilization?.stage,
  actual:{machine_parts:n.resources.machine_parts||0,steel:n.resources.steel||0},
  target:{machine_parts:d.plan?.machine_parts??64,steel:d.plan?.steel??48},
  restartBelow:{machine_parts:(d.plan?.machine_parts??64)*.75,steel:(d.plan?.steel??48)*.75},
  running:{machine_parts:d.mode?.machine_parts??false,steel:d.mode?.steel??false},
  recentQuarter,constructionCommitted:{machine_parts:b.pendingConstruction?.machine_parts||0,steel:b.pendingConstruction?.steel||0},
  factorySites:f.lastQuarter?.sites||0,steelworksSites:q.steelworksSites||0,
  lastQuarter:last,ledger:q,projectedRearm:g1PendingRifleView(w,n),layout:g1LayoutSummary(w,n)};
}
function g1Report(w){g3ReconcileOrders(w);const r=G1_RUNTIME.get(w),enabled=r?.enabled||false;
 const duration=(r?.activeObservationDays||0)+(enabled&&r?.intervals.at(-1)?.endDay===null?Math.max(0,w.dayIndex-r.intervals.at(-1).startDay):0);
 return {schema:'vilob-light-v07g3-observability-v1',version:VERSION,seed:w.seed,dayIndex:w.dayIndex,
  sessionOnly:true,enabled,startedDay:r?.startedDay??null,firstEnabledDay:r?.firstEnabledDay??null,resetDay:r?.resetDay??null,
  activeObservationDays:duration,intervals:r?.intervals.map(x=>({...x}))||[],intervalHistoryLimit:G2_MAX_INTERVALS,
  eventsLost:r?.dropped||0,eventsSampledOut:r?.sampledOut||0,outcomesLost:r?.outcomesLost||0,
  eventCounts:{...(r?.counts||{})},eventKindCounts:{...(r?.kindCounts||{})},nationEventCounts:structuredClone(r?.nationCounts||{}),
  nationEventKinds:structuredClone(r?.nationKinds||{}),shortageCounts:{...(r?.shortageCounts||{})},nationShortages:structuredClone(r?.nationShortages||{}),
  orderMatches:{matched:r?.ordersMatched||0,unmatched:r?.ordersUnmatched||0,ongoing:Object.keys(r?.orders||{}).length},
  g3OrderAudit:{started:r?.counts?.STARTED||0,closed:{...(r?.g3Closed||{})},live:Object.keys(r?.orders||{}).length,
   conservationDelta:(r?.counts?.STARTED||0)-Object.values(r?.g3Closed||{}).reduce((a,b)=>a+b,0)-Object.keys(r?.orders||{}).length,
   closedHistory:r?.g3History.slice()||[],closedHistoryLost:r?.g3HistoryLost||0,
   liveOrders:Object.entries(r?.orders||{}).map(([armyId,o])=>({armyId:Number(armyId),...o,status:'IN_PROGRESS'}))},
  g5Doctrine:g5Summary(w),
  g3Performance:{scope:'OBSERVED_REARM_DECISION_ONLY_SAMPLED',totals:{...(r?.g3PerfTotal||{})},byNation:structuredClone(r?.g3Perf||{})},
  caveats:['No AI or battle calculation changes','Events are collected only while toggled ON, not restored from saves',
   'AP spending tagged as rearm is observed only while ON, not reconstructed from historical military totals',
   'Military AP spending includes non-rearm actions','G2 hypothetical front conversion is an illustrative upper bound, not actual G5 demand; see g5Doctrine for real action counts',
   'Candidate counts are evaluations, not unique armies, and shortages can co-occur',
   'Quarter result is a diagnostic classification with one exclusive outcome per AI nation per quarter',
   'Projected rifle rearm is an eligible upper bound, NOT planned or committed demand',
   'Production restarts on the regular 30-day decision boundary, not immediately after a purchase'],
  nations:w.nations.filter(n=>n.active).map(n=>{const b=g1IndustryNation(w,n),m=g2HypotheticalModernization(w,n);return {...b,apAudit:g2ApAudit(n,r),modernization:m,doctrine:g3DoctrinalStatus(w,n,b,m)};}),
  quarters:r?.quarters.slice()||[],outcomes:r?.outcomes.slice()||[],events:r?.events.slice()||[]};
}
function g3DoctrinalStatus(w,n,base,hypo){
 // Zero eligible rear candidates means the CURRENT role-based doctrine is saturated.
 // This is not proof that every army is technologically optimal, nor an AI rearm order.
 const unlocked=loadoutLegal(w,n.id,'rifle_infantry'),pending=base.projectedRearm;
 const state=!unlocked?'RIFLE_NOT_UNLOCKED':pending.candidateArmies===0?(pending.ongoing>0?'REAR_REARM_IN_PROGRESS':'CURRENT_DOCTRINE_SATURATED'):
  pending.blockedResources>=pending.candidateArmies?'CURRENT_DOCTRINE_RESOURCE_BLOCKED':'CURRENT_DOCTRINE_ELIGIBLE';
 return {state,meaning:'CURRENT_AI_ROLE_POLICY_ONLY',rearCandidates:pending.candidateArmies,ongoing:pending.ongoing,
  nextDoctrine:'HYPOTHETICAL_DOCTRINE_ONLY',hypotheticalFrontPeople:hypo.frontConversion.people,
  hypotheticalFrontParts:hypo.frontConversion.illustrativeParts,hypotheticalFrontSteel:hypo.frontConversion.illustrativeSteel,
  notCommittedToProduction:true};
}
// G2: per-nation AP ledger and inferred *hypothetical* modernization, computed on demand.
function g2HypotheticalModernization(w,n){
 let frontMen=0,frontArmies=0,readyFrontMen=0,readyFrontArmies=0;
 for(const a of w.armies){if(a.nationId!==n.id)continue;const groups=rearmGroups(a,'front');
  const men=groups.filter(u=>u.typeId!=='rifle_infantry'&&unitBranch(u.typeId)!=='artillery').reduce((sum,u)=>sum+(u.manpower||0),0);
  if(men>0){frontMen+=men;frontArmies++;if(a.status==='READY'&&a.engagementId===null&&!a.rearmPlan&&atSafeSettlement(w,a)){
    readyFrontMen+=men;readyFrontArmies++;}}
 }
 const current=activeManpower(w,n.id),capacity=militaryCapacity(w,n.id);
 return {type:'HYPOTHETICAL_DOCTRINE_ONLY',frontConversion:{armies:frontArmies,people:frontMen,readySafeArmies:readyFrontArmies,readySafePeople:readyFrontMen,
  illustrativeParts:frontMen,illustrativeSteel:Math.ceil(frontMen*.25),currentPolicy:'NOT_ALLOWED_BY_AI_ROLE_TARGETS'},
  recruitmentHeadroom:{maxManpower:capacity,currentManpower:current,unfilled:Math.max(0,capacity-current),
   note:'Capacity headroom, NOT planned recruitment, equipment demand or available trained reserves'}};
}
function g2ApAudit(n,s){
 const id=String(n.id),byDay=s?.apRearm?.[id]||{},history=n.apLedger?.history||[];
 return {unitsPerAP:10,currentAP:n.apUnits/10,maxAP:n.apMaxUnits/10,
  quarters:history.map(r=>{const rearm=byDay[r.dayIndex]||0;return {dayIndex:r.dayIndex,openingAP:r.opening/10,receivedAP:r.received/10,
   offeredAP:r.offered/10,civilAP:r.spent.civil/10,militaryAP:r.spent.military/10,researchAP:r.spent.research/10,
   observedRearmAP:rearm/10,otherMilitaryAPObservedWindow:Math.max(0,r.spent.military-rearm)/10,
   closingAP:(r.opening+r.received-r.spent.civil-r.spent.military-r.spent.research)/10,
   observedRearmOnly: true};}),
  note:'Only observed AI rearm orders are tagged as rearm AP while ON; player orders and older AI orders are not retrospectively attributed. Quarter ledger is rolling save history.'};
}
function g2AuditCsv(w){const r=g1Report(w),rows=[];
 for(const n of r.nations){const id=String(n.nationId),reasons=r.nationEventCounts[id]||{},shortages=r.nationShortages[id]||{};
  for(const ap of n.apAudit.quarters)rows.push({nationId:n.nationId,nation:n.name,...ap,
   totalCandidateChecks:reasons.ALREADY_BEST||0,totalAPShortCandidates:shortages.AP_SHORT||0,totalPartsShortCandidates:shortages.MACHINE_PARTS_SHORT||0,
   totalSteelShortCandidates:shortages.STEEL_SHORT||0,totalRearmStarts:reasons.STARTED||0,totalCompletions:reasons.COMPLETED||0});}
 return g1Csv(rows,['nationId','nation','dayIndex','openingAP','receivedAP','offeredAP','civilAP','militaryAP','researchAP','observedRearmAP','otherMilitaryAPObservedWindow','closingAP','totalCandidateChecks','totalAPShortCandidates','totalPartsShortCandidates','totalSteelShortCandidates','totalRearmStarts','totalCompletions']);
}
function g1CsvCell(v){if(v===null||v===undefined)return '';const s=typeof v==='object'?JSON.stringify(v):String(v);return '"'+s.replace(/"/g,'""')+'"';}
function g1Csv(rows,fields){return [fields.join(','),...rows.map(r=>fields.map(k=>g1CsvCell(r[k])).join(','))].join('\n');}
function g1IndustryCsv(w){const report=g1Report(w);const rows=report.nations.map(n=>({nationId:n.nationId,nation:n.name,dayIndex:report.dayIndex,
  partsStock:n.actual.machine_parts,partsTarget:n.target.machine_parts,partsRestart:n.restartBelow.machine_parts,partsRunning:n.running.machine_parts,
  steelStock:n.actual.steel,steelTarget:n.target.steel,steelRestart:n.restartBelow.steel,steelRunning:n.running.steel,
  partsRecentQuarter:n.recentQuarter.machine_parts,steelRecentQuarter:n.recentQuarter.steel,
  partsConstruction:n.constructionCommitted.machine_parts,steelConstruction:n.constructionCommitted.steel,
  factorySites:n.factorySites,steelworksSites:n.steelworksSites,
  partsReason:n.lastQuarter?.partsReason||'UNKNOWN',steelReason:n.lastQuarter?.steelReason||'UNKNOWN',
  hypotheticalRiflePeople:n.projectedRearm.people,hypotheticalRifleParts:n.projectedRearm.parts,hypotheticalRifleSteel:n.projectedRearm.steel,
  rifleMen:n.layout.rifle,allMen:n.layout.total,riflePct:n.layout.rifleRatio}));
 const fields=['nationId','nation','dayIndex','partsStock','partsTarget','partsRestart','partsRunning','steelStock','steelTarget','steelRestart','steelRunning','partsRecentQuarter','steelRecentQuarter','partsConstruction','steelConstruction','factorySites','steelworksSites','partsReason','steelReason','hypotheticalRiflePeople','hypotheticalRifleParts','hypotheticalRifleSteel','rifleMen','allMen','riflePct'];
 return g1Csv(rows,fields);
}
function g1RearmCsv(w){return g1Csv(g1Report(w).events,['dayIndex','nationId','nation','kind','reason','armyId','position','target','people','shortages','price','stock','note','orderKey','startedDay','completeDay','endDay','endReason']);}
function g3OrderCsv(w){const r=g1Report(w),rows=[...r.g3OrderAudit.closedHistory,...r.g3OrderAudit.liveOrders];return g1Csv(rows,['orderKey','armyId','nationId','startedDay','expectedCompleteDay','lastSeenDay','endDay','status','endReason']);}
function g5HistoryCsv(w){return g1Csv(g5Summary(w).history,['dayIndex','nationId','kind','armyId','people','unitId','sourceUnitId','reason','price']);}
function g3PerfCsv(w){const r=g1Report(w),rows=Object.entries(r.g3Performance.byNation).map(([nationId,v])=>({nationId,...v,avgQuarterMs:v.quarters?v.totalMs/v.quarters:0}));return g1Csv(rows,['nationId','quarters','candidates','selectionMs','legalMs','priceMs','totalMs','legalSamples','priceSamples','avgQuarterMs']);}
let g1RefreshUI=null;
function g1WireUI(){const toggle=document.getElementById('g1ObserveToggle');if(!toggle)return;
 const status=document.getElementById('g1ObserveStatus'),root=document.getElementById('g1NationSummary');
 function update(){if(!app.world)return;const w=app.world,s=g1Store(w),data=g1Report(w);
  toggle.checked=s.enabled;
  status.textContent='G3 주문 진행 '+data.g3OrderAudit.live+'건 · 종료 '+Object.values(data.g3OrderAudit.closed).reduce((a,b)=>a+b,0)+'건 · 주문 검산 '+data.g3OrderAudit.conservationDelta+' · '+(s.enabled?'ON':'OFF')+' · 실제 관측 '+data.activeObservationDays+'일 · 누적 후보 '+(data.eventKindCounts.CANDIDATE||0)+'회 · 국가별 결과 '+data.outcomes.length+'건 · 원시 예시 '+s.events.length+'건 · 표본 제외 '+s.sampledOut+'건 · 초과 삭제 '+s.dropped+'건 (현재 탭에서만 보관)';
  const show=data.nations.filter(n=>n.layout.rifle>0||n.factorySites>0||n.steelworksSites>0).sort((a,b)=>b.layout.rifle-a.layout.rifle).slice(0,6);
  root.replaceChildren(...show.map(n=>make('p',{class:'scope-note',text:`${n.name} · 소총병 ${n.layout.rifle}/${n.layout.total} (${n.layout.rifleRatio}%) · 부품 ${n.actual.machine_parts}/${n.target.machine_parts} · 강철 ${n.actual.steel}/${n.target.steel} · 현 교리 ${n.doctrine.state} · 후열 교체 ${n.projectedRearm.candidateArmies}군 · 전열 가상전환 ${n.modernization.frontConversion.people}명(현 AI 미지원) · AP ${n.apAudit.currentAP.toFixed(1)}/${n.apAudit.maxAP.toFixed(1)} · ${n.lastQuarter?.partsReason||'UNKNOWN'}`})));
 }
 g1RefreshUI=update;
 toggle.addEventListener('change',()=>{g1SetEnabled(app.world,toggle.checked);update();});
 document.getElementById('g1ObserveRefresh').addEventListener('click',update);
 document.getElementById('g1ObserveClear').addEventListener('click',()=>{g1Reset(app.world);update();});
 document.getElementById('g1ObserveJson').addEventListener('click',()=>download(`vilob-g3-diagnostics-day${app.world.dayIndex}.json`,JSON.stringify(g1Report(app.world),null,2),'application/json'));
 document.getElementById('g1IndustryCsv').addEventListener('click',()=>download(`vilob-g3-industry-day${app.world.dayIndex}.csv`,g1IndustryCsv(app.world),'text/csv;charset=utf-8'));
 document.getElementById('g1RearmCsv').addEventListener('click',()=>download(`vilob-g3-rearm-day${app.world.dayIndex}.csv`,g1RearmCsv(app.world),'text/csv;charset=utf-8'));
 document.getElementById('g2AuditCsv').addEventListener('click',()=>download(`vilob-g3-ap-audit-day${app.world.dayIndex}.csv`,g2AuditCsv(app.world),'text/csv;charset=utf-8'));
 document.getElementById('g3OrderCsv').addEventListener('click',()=>download(`vilob-g3-order-lifecycle-day${app.world.dayIndex}.csv`,g3OrderCsv(app.world),'text/csv;charset=utf-8'));
 document.getElementById('g5DoctrineCsv')?.addEventListener('click',()=>download(`vilob-g5-frontline-day${app.world.dayIndex}.csv`,g5DoctrineCsv(app.world),'text/csv;charset=utf-8'));
 document.getElementById('g5HistoryCsv')?.addEventListener('click',()=>download(`vilob-g5-doctrine-history-day${app.world.dayIndex}.csv`,g5HistoryCsv(app.world),'text/csv;charset=utf-8'));
 document.getElementById('g3PerfCsv').addEventListener('click',()=>download(`vilob-g3-rearm-performance-day${app.world.dayIndex}.csv`,g3PerfCsv(app.world),'text/csv;charset=utf-8'));
 update();
}
// -- end V0.7G1 observability --

function runMilitaryQuarter(w,execute){
  g3ReconcileOrders(w);
  const frontiers=quarterBorderPairs(w);
  v06aUpdatePerceptionsQuarter(w);
  updateRelationsQuarter(w,frontiers);
  runAllianceQuarter(w,execute,frontiers);
  v06bRunQuarter(w,execute);
  c2RunIndependenceQuarter(w,execute);
  for(const a of w.armies){
    a.roadSupplied=isRoadSupplied(w,a);
    if(H2I_MORALE_ENABLED){
      if(a.status==='READY'){a.supplied=isSupplied(w,a);
       const safe=atSafeSettlement(w,a),own=w.tiles[a.tileId]?.ownerId===a.nationId,base=a.supplied?(safe?4:own&&a.roadSupplied?2:1):0;
       const routed=a.f3fRout?(safe?7:own&&a.roadSupplied?3:base):base;
       a.morale=Math.min(100,a.morale+routed);
      }
    }else{
      if(a.roadSupplied&&a.status==='READY')a.morale=Math.min(100,a.morale+1);
      if(a.f3fRout&&a.status==='READY'){
       if(atSafeSettlement(w,a))a.morale=Math.min(100,a.morale+6);
       else if(w.tiles[a.tileId]?.ownerId===a.nationId&&w.tiles[a.tileId].occupiedBy===null&&a.roadSupplied)a.morale=Math.min(100,a.morale+2);
      }
    }
    if(a.status==='READY')clearRoutIfRecovered(w,a);
  }
  // E2: paid, settlement-based gun drill, distinct from 180-day crew certification.
  for(const a of w.armies){
    if(a.status!=='READY'||a.order||a.engagementId!==null||!atSafeSettlement(w,a))continue;
    const n=w.nations[a.nationId];if(!n?.active)continue;
    for(const u of e2ArtilleryGroups(a)){
      if(u.guns<=0||c3ReadyMen(u)<E2_GUN_CREW||u.artilleryExperience>=1||u.artilleryLastDrillDay===w.dayIndex)continue;
      const cost=Math.max(1,Math.ceil(c3ReadyMen(u)*.08));
      if(n.gold<cost)continue;
      chargeMilitaryOperation(w,n.id,cost,null,'artillery_drill');
      const step=hasTech(w,n.id,'artillery_drill_manual')?.045:.03;
      u.artilleryExperience=Math.min(1,Math.round((u.artilleryExperience+step)*10000)/10000);
      u.artilleryLastDrillDay=w.dayIndex;
    }
  }
  f2c2bArtilleryAIQuarter(w,execute);
  // G AI: actual 30-day rearm at an owned safe settlement, limited to one army/nation/quarter.
  for(const n of w.nations){
    if(!n.active||n.controller!=='AI')continue;
    // Preserve the original gate and short-circuit order exactly; diagnostics run only when ON.
    if(militaryAtWar(w,n.id)){if(g1Enabled(w))g1Record(w,n,'GATE','AT_WAR');continue;}
    if(n.gold<1000){if(g1Enabled(w))g1Record(w,n,'GATE','GOLD_POLICY_GATE',{stock:{gold:n.gold}});continue;}
    // Role-aware upgrades: a ranged cohort must never replace the frontline just
    // because crossbows are the best technology. Correct legacy all-ranged armies
    // gradually through normal 30-day paid REARM_ARMY actions (one/nation/quarter).
    const g3time=g3TimingBegin(w,n);
    const g3sel=g3time?g3Clock():0;
    const melee=['heavy_infantry','pikeman','swordsman','spearman','levy'].filter(id=>loadoutLegal(w,n.id,id));
    // Machine guns are a limited rear SUPPORT specialization, not an all-rear ranged upgrade.
    const ranged=['rifle_infantry','flintlock','matchlock','crossbowman','longbowman','archer'].filter(id=>unitBranch(id)==='ranged'&&loadoutLegal(w,n.id,id));
    const armies=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&a.engagementId===null&&atSafeSettlement(w,a)&&manpower(a)>=30).sort((a,b)=>a.id-b.id);
    if(!armies.length){if(g1Enabled(w))g1Record(w,n,'GATE','NO_SAFE_READY_ARMY');continue;}
    if(g3time)g3time.selectionMs+=g3Clock()-g3sel;
    const g5done=g5DoctrineQuarter(w,n,armies,execute);
    if(g5done){g3TimingEnd(w,n,g3time);if(g1Enabled(w))g1Record(w,n,'QUARTER',g5done==='PARTIAL_REARM_STARTED'?'REARM_STARTED':'G5_REDEPLOY_STARTED');continue;}
    // V0.8C: one legal, paid partial rearm at most per nation/quarter; restores overbuilt
    // legacy B saves without confiscating equipment or changing soldiers for free.
    const supportAction=v08cMachineGunSupportQuarter(w,n,armies,execute);
    if(supportAction){g3TimingEnd(w,n,g3time);if(g1Enabled(w))g1Record(w,n,'QUARTER','REARM_STARTED');continue;}
    const start=Math.floor(w.dayIndex/30)%armies.length;
    let upgraded=false;
    // Repair incorrect deployments first, then improve already-correct loadouts.
    for(const repairOnly of [true,false]){
      for(let offset=0;offset<armies.length&&!upgraded;offset++){
        const a=armies[(start+offset)%armies.length];
        for(const [position,targets] of [['front',melee],['reserve',melee],['rear',ranged]]){
          if(position==='front'&&g5Eligible(w,n))continue; // G5 partial rifle front replaces full-position legacy rearm.
          const groups=rearmGroups(a,position);
          if(!groups.length)continue;
          const isRanged=id=>unitBranch(id)==='ranged';
          const incorrect=groups.some(u=>position==='rear'?!isRanged(u.typeId):isRanged(u.typeId));
          if(incorrect!==repairOnly)continue;
          const currentBest=Math.max(...groups.map(u=>UNIT_TYPES[u.typeId]?.power||0));
          for(const target of targets){
            if(g3time)g3time.checked++;
            // Never downgrade a properly assigned cohort merely to consume a budget.
            if(!incorrect&&(UNIT_TYPES[target]?.power||0)<=currentBest){
              if(g1Enabled(w))g2RecordAlreadyBest(w,n,a.id,position,target);
              continue;
            }
            const action={type:'REARM_ARMY',armyId:a.id,unitType:target,position};
            const g3legalSample=g3time&&g3time.sampled<12, g3legalTick=g3legalSample?g3Clock():0;
            const g3legalOK=rearmLegal(w,n.id,action);
            if(g3legalSample){g3time.legalMs+=g3Clock()-g3legalTick;g3time.legalSamples++;g3time.sampled++;}
            if(!g3legalOK){
              if(g1Enabled(w))g1Record(w,n,'CANDIDATE','LEGALITY_BLOCKED',{armyId:a.id,position,target});
              continue;
            }
            const g3priceSample=g3time&&g3time.sampled<12,g3priceTick=g3priceSample?g3Clock():0;
            const price=rearmPrice(w,n.id,action);
            if(g3priceSample){g3time.priceMs+=g3Clock()-g3priceTick;g3time.priceSamples++;g3time.sampled++;}
            // Keep the baseline single canAfford() test and execute() call in the same sequence.
            if(price&&canAfford(n,price)){
              const ok=execute(w,n.id,action).ok;
              if(g1Enabled(w))g1Record(w,n,'CANDIDATE',ok?'STARTED':'EXECUTE_BLOCKED',{armyId:a.id,position,target,people:rearmGroups(a,position).reduce((sum,u)=>sum+u.manpower,0),price});
              if(ok){upgraded=true;break;}
            }else if(g1Enabled(w)){
              const shortages=price?g1Shortages(n,price):['PRICE_INVALID'];
              g1Record(w,n,'CANDIDATE',shortages[0]||'RESOURCE_SHORT',{armyId:a.id,position,target,people:rearmGroups(a,position).reduce((sum,u)=>sum+u.manpower,0),shortages,price,stock:{gold:n.gold,apUnits:n.apUnits,machine_parts:n.resources.machine_parts||0,steel:n.resources.steel||0,iron:n.resources.iron||0}});
            }
          }
          if(upgraded)break;
        }
      }
      if(upgraded)break;
    }
    g3TimingEnd(w,n,g3time);
    if(g1Enabled(w))g1Record(w,n,'QUARTER',upgraded?'REARM_STARTED':'NO_REARM_STARTED');
  }
  for(const war of w.wars.slice()){
    updateWarFatigue(w,war);
    if(war.pendingPeace&&w.dayIndex-war.pendingPeace.offerDay>120){
      const recipient=war.pendingPeace.proposerId===war.attackerId?war.defenderId:war.attackerId;
      if(w.nations[recipient].controller!=='PLAYER')war.pendingPeace=null;
    }
    if(war.pendingPeace?.terms?.subjectDemand&&!v06bForceEligible(w,war,war.pendingPeace.terms)){
      v06b1Diag(w).forced.invalidated++;war.pendingPeace=null;war.nextPeaceOfferDay=w.dayIndex+90;
    }
    if(war.pendingPeace){
      const recipient=war.pendingPeace.proposerId===war.attackerId?war.defenderId:war.attackerId;
      if(w.nations[recipient].controller==='AI'){
        if(acceptPeaceOffer(w,war,war.pendingPeace,recipient))execute(w,recipient,{type:'ACCEPT_PEACE',warId:war.id,targetNationId:war.pendingPeace.proposerId});
        else execute(w,recipient,{type:'REJECT_PEACE',warId:war.id,targetNationId:war.pendingPeace.proposerId});
      }
      continue;
    }
    for(const id of [war.attackerId,war.defenderId]){
      if(w.nations[id].controller!=='AI'||!wantsPeace(w,war,id))continue;
      const other=id===war.attackerId?war.defenderId:war.attackerId;
      const outcome=warOutcome(w,war),p=d1dEffectiveProfile(w,id);
      const assess=outcome.winnerId===id?v06b1ForceAssessment(w,war,outcome):null;
      if(assess)v06b1RecordForceAssessment(w,assess);
      const demand=!!assess?.eligible&&
        (p?.military?.aggression??50)>=65&&v06bSubjectsOf(w,id).length<V06B_LIMIT;
      execute(w,id,{type:'OFFER_PEACE',warId:war.id,targetNationId:other,subjectDemand:demand});break;
    }
  }
  // Limited training throughput and treasury-aware mobilization. Shared rules for AI and PLAYER.
  for(const n of w.nations){
    if(!n.active||n.controller!=='AI'||w.dayIndex<2*DAYS_PER_YEAR)continue;
    const diag=v04e2NewMobilizationReport(w,n);
    const recordExec=(ww,id,act)=>{const result=execute(ww,id,act);v04e2RecordMobilizationAction(ww,n,diag,act,result);return result;};
    try{
    const target=militaryStrengthTarget(w,n.id),men=nationManpower(w,n.id);
    const settlements=freeRecruitmentSettlements(w,n.id);
    diag.safeSettlements=settlements.length;
    if(!settlements.length){diag.reason="NO_SAFE_SETTLEMENT";b4aRunEmergencyAI(w,n,recordExec,diag);continue;}
    const source=settlements[0],ready=n.military.reserveReady,pending=pendingManpower(n),forecast=militaryUpkeep(w,n.id);
    const war=militaryAtWar(w,n.id);
    const fiscal=strategicReport(w,n.id)?.financial;
    // H2D1: fiscal pressure must block NEW mobilization, not legitimate peacetime demobilization.
    // No pressure => keep the H2D action path, ordering and RNG exactly unchanged.
    const fiscalPressure=!war&&fiscal&&(fiscal.balance<0||n.gold<Math.max(200,(fiscal.military+fiscal.civil)*2));
    if(fiscalPressure){
      const oldUpkeep=militaryUpkeep(w,n.id);
      const info={pressure:true,outcome:'FISCAL_PRESSURE',armyId:null,returnedMen:0,returnedMachines:0,
        beforeMen:men,afterMen:men,target,beforeUpkeep:oldUpkeep,afterUpkeep:oldUpkeep,
        estimatedSaving:0,safeCandidates:0,lastPowerStatus:n.hAutomaton&&w.hAutomaton?.logistics?.nations?.[n.id]?.last?.status||'UNKNOWN',
        lastCivilUnpaid:n.civilFinance?.unpaidLastQuarter??0};
      diag.h2d1Fiscal=info;
      if(men>target*1.12){
        const home=w.armies.filter(a=>a.nationId===n.id&&a.engagementId===null&&atSafeSettlement(w,a))
          .sort((a,b)=>manpower(a)-manpower(b)||a.id-b.id);
        info.safeCandidates=home.length;
        if(!home.length){info.outcome=diag.reason='NO_ELIGIBLE_SAFE_ARMY';}
        else if(manpower(home[0])<=0||men-manpower(home[0])<target){info.outcome=diag.reason='DEFENSE_FLOOR';}
        else{
          const a=home[0],id=a.id;
          const returnMen=manpower(a);
          const returnMachines=hGroups(w,a).reduce((sum,g)=>sum+g.ready+g.damaged+g.disabled,0);
          const actionResult=recordExec(w,n.id,{type:'DISBAND_ARMY',armyId:id});
          if(actionResult.ok){
            info.outcome=diag.reason='FISCAL_DEMOBILIZED';
            info.armyId=id;info.returnedMen=returnMen;info.returnedMachines=returnMachines;
            info.afterMen=nationManpower(w,n.id);info.afterUpkeep=militaryUpkeep(w,n.id);
            info.estimatedSaving=Math.max(0,oldUpkeep-info.afterUpkeep);
          }else{info.outcome=diag.reason='FISCAL_PRESSURE';}
        }
      }else{diag.reason='FISCAL_PRESSURE';}
      continue;
    }
    // Unchanged H2D no-pressure path (same ordering and one-army limit).
    if(!war&&men>target*1.12){
      const home=w.armies.filter(a=>a.nationId===n.id&&a.engagementId===null&&atSafeSettlement(w,a))
        .sort((a,b)=>manpower(a)-manpower(b)||a.id-b.id);
      if(home.length&&men-manpower(home[0])>=target*.65){recordExec(w,n.id,{type:'DISBAND_ARMY',armyId:home[0].id});diag.reason='DEMOBILIZED';continue;}
    }
    if(men>=target-4){diag.reason='TARGET_MET';continue;}
    const income=n.lastQuarter?.goldIncome??0;
    const monthlyRoom=Math.max(0,income-forecast);
    if(n.gold<Math.max(80,forecast*1.3)&&monthlyRoom<forecast*.25){diag.reason='GOLD_SHORTAGE';continue;}
    const deficit=Math.max(0,target-men);
    const home=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&a.engagementId===null&&atSafeSettlement(w,a)&&manpower(a)<150)
      .sort((a,b)=>manpower(a)-manpower(b)||a.id-b.id);
    if(ready>0){
      const a=home[0];
      if(a){const town=settlements.find(s=>s.coreTileId===a.tileId);
        if(town&&provisionArmy(w,n,a,town,deficit,recordExec)){diag.reason='REINFORCED';continue;}}
      const desiredCount=Math.min(armyLimit(w,n.id),Math.ceil(target/135));
      // Do not spawn another understrength formation while a safe unit can be refilled.
      // A stranded field unit is recalled through the regular REARM path below.
      // A unit may be safe but still impossible to replenish (equipment,
      // supply, or per-action resource constraints). Do not block the whole
      // national expansion plan while a single such unit remains underfull.
      if(ownArmyCount(w,n.id)<desiredCount){
        const size=Math.min(100,deficit,ready,150);
        if(size>=12&&preferredRecruitment(w,n,source,size,w.aiProfiles[n.aiProfileId],recordExec)){diag.reason='RECRUITED';continue;}
      }
    }
    // E4A: a full formation roster must not hide replenishable field units.
    // This is a bounded subset of national armies, computed once per quarter.
    const ownFormations=w.armies.filter(a=>a.nationId===n.id);
    diag.understrengthFormations=ownFormations.filter(a=>manpower(a)<150).length;
    const activeTowns=new Set(settlements.map(s=>s.coreTileId));
    diag.recoveryInProgress=ownFormations.filter(a=>a.operation?.type==='REARM'&&a.order).length;
    const recoveryCandidates=v04e4RecoveryCandidates(w,n,settlements,ready,deficit);
    diag.recoveryEligible=recoveryCandidates.length;
    // Do not break military orders during war. A simple peacetime relocation
    // costs the standard MOVE_ARMY 0.2 AP and still respects all path rules.
    // E4A performance budget: at most ~2 nations are eligible to issue
    // recovery orders per quarter on the 12-nation default map. Rotate fairly.
    const recoverySlot=((Math.floor(w.dayIndex/30)+n.id)%6===0);
    if(recoverySlot&&ready>0&&home.length===0&&ownFormations.length>=armyLimit(w,n.id)&&recoveryCandidates.length){
      v04e4OrderRecovery(w,n,settlements,recoveryCandidates,recordExec,diag);
      if(diag.recoveryOrders)diag.reason='RECOVERY_ORDERED';
    }
// Train only what population, reserve cap, and a reasonable treasury buffer can sustain.
    const need=Math.max(0,target-men-ready-pending);
    const affordable=Math.floor((n.gold-Math.max(40,forecast))/.85);
    const amount=Math.min(need,trainingRate(w,n.id),source.population-12,affordable);
    if(amount>=12){const trained=recordExec(w,n.id,{type:'TRAIN_RESERVES',settlementId:source.id,amount});if(trained.ok)diag.reason='TRAINING_STARTED';}
    if(diag.reason==='NO_ACTION'){
      if(diag.failed.REINFORCE_ARMY)diag.reason='REINFORCEMENT_BLOCKED';
      else if(diag.failed.RECRUIT_ARMY)diag.reason=Object.keys(diag.failReasons)[0]||'ACTION_REJECTED';
      else if(diag.recoveryInProgress)diag.reason='RECOVERY_IN_PROGRESS';
      else if(diag.recoveryNoRoute)diag.reason='NO_RECOVERY_ROUTE';
      else if(diag.armyCount>=diag.armyLimit)diag.reason=diag.understrengthFormations?'RECOVERY_NEEDED':'FORMATION_LIMIT';
      else if(n.military.lastTrainingDay===v04eQuarterDay(w))diag.reason='TRAINING_LIMIT';
      else if(pending>0)diag.reason='TRAINING_PENDING';
      else if(ready<12)diag.reason='NO_READY_RESERVES';
      else if(amount<12)diag.reason=source.population-12<12?'POPULATION_LIMIT':'NO_RECOVERY_ROUTE';
    }
    }finally{v04e2FinishMobilization(w,n,diag);}
  }
  b4aRunFormationTrainingAI(w,execute);
  recallRoutedArmies(w,execute);
  assignWarOrders(w,execute,false);
  assignPeacetimeGarrisons(w,execute);
  for(const n of w.nations){
    if(!n.active||n.controller!=='AI')continue;
    const decision=warDecision(w,n.id);
    if(decision){
      // Small per-quarter probability preserves uncertainty and avoids relentless wars.
      const chance=cap(.025+(decision.willingness-.63)*.24,.025,.19);
      if(randCombat(w)<chance){
        const result=execute(w,n.id,{type:'DECLARE_WAR',targetNationId:decision.id});
        const d=v06b4Diagnostics(w),last=d.history[d.history.length-1];
        if(result.ok){d.declared++;if(last?.nationId===n.id&&last.dayIndex===w.dayIndex)last.declared=true;}
        else d.declarationFailed++;
      }
    }else{
      // E5: an exceptional, deliberate betrayal, not a normal war candidate.
      // No extra RNG calls for nations without any qualifying active alliance.
      const profile=d1dEffectiveProfile(w,n.id);
      const aggression=profile?.military?.aggression??50,cooperation=profile?.diplomacy?.cooperation??50;
      if(aggression>=72&&cooperation<=65&&ownArmyCount(w,n.id)>0){
        const partners=w.diplomacy.alliances.filter(t=>(t.a===n.id||t.b===n.id)&&t.endsDay>w.dayIndex&&w.dayIndex-t.formedDay>=5*E5_YEAR);
        for(const t of partners){
          const foe=t.a===n.id?t.b:t.a;
          if(relationOf(w,n.id,foe)>5||v06aAllianceWeight(w,n.id,foe)>-7||
            (v06aGet(w,n.id,foe)?.perceivedPower??0)>-25||nationManpower(w,n.id)<1.65*Math.max(1,nationManpower(w,foe)))continue;
          const action={type:'BETRAY_ALLIANCE',targetNationId:foe};
          const verdict=v06b4WarAssessment(w,n.id,foe,{own:militaryReadiness(w,n.id),their:militaryReadiness(w,foe)});
          if(!verdict.approve){if(['SURVIVAL_CRISIS','DECISIVE_DEFEAT_RECOVERY','STRATEGIC_RECOVERY'].includes(verdict.reason))n.survival.warBlocked++;const d=v06b4Diagnostics(w);d.candidateBlocked++;d.blockReasons['BETRAYAL_'+verdict.reason]=(d.blockReasons['BETRAYAL_'+verdict.reason]||0)+1;continue;}
          if(canExecuteNationAction(w,n.id,action)&&randCombat(w)<.004){const result=execute(w,n.id,action);if(result.ok)v06b4Diagnostics(w).declared++;break;}
        }
      }
    }
  }
}
function ageCommanders(w){
  for(const c of w.characters.slice()){
    if(c.role!=='commander'||!c.alive)continue;
    c.age++;
    if(c.age>=77||(c.age>=62&&randCombat(w)<(c.age-60)/160)){
      c.alive=false;c.role='retired';
      const army=w.armies.find(a=>a.commanderId===c.id);
      if(army){const replacement=spawnCommander(w,c.nationId);army.commanderId=replacement.id;d1cCommanderChanged(w,army);event(w,`${w.nations[c.nationId].name}: ${c.name} 사령관 퇴임, ${replacement.name} 부임.`,'commander');}
    }
  }
  // Retired characters are archived only as compact entries, not actively simulated.
  w.pastCommanders.push(...w.characters.filter(c=>c.role==='retired').map(c=>({name:c.name,nationId:c.nationId,age:c.age,victories:c.victories||0})));
  if(w.pastCommanders.length>80)w.pastCommanders.splice(0,w.pastCommanders.length-80);
  w.characters=w.characters.filter(c=>c.role!=='retired');
}


// --- src/sim/survival-experience.js ---
/** V0.6B4A: formation heritage, state-level survival, and resource-conserving emergency musters.
 * All calculations are deterministic. Neither diagnostics nor XP consume simulation RNG.
 */
const B4A_XP_THRESHOLDS=[0,100,300,600,1000,1500,2000];
const B4A_RANK_LABELS=['신병','숙련병','정예병','베테랑','전쟁 숙련병','백전노장'];
const B4A_RANK_BONUSES=[0,.03,.06,.09,.13,.17,.20];
const B4A_HISTORY_YEARS=20;
function b4aNewExperience(day=0){return {xp:0,lastActiveDay:day,lastDecayDay:day,lastTrainingDay:-30,lastBattleKey:'',combatRounds:0,trainingSessions:0,unlockedRank:2};}
function b4aExperience(army){return army.formationExperience;}
function b4aRankIndex(army){
 const xp=Math.max(0,b4aExperience(army)?.xp||0);
 let i=0;while(i<5&&xp>=B4A_XP_THRESHOLDS[i+1])i++;return i;
}
function b4aRankLabel(army){return B4A_RANK_LABELS[b4aRankIndex(army)];}
function b4aReadyPower(w,id){return w.armies.filter(a=>a.nationId===id&&a.status==='READY').reduce((sum,a)=>sum+manpower(a)*(1+b4aPowerBonus(a)),0);}
function b4aPowerBonus(army){
 const xp=Math.min(2000,Math.max(0,b4aExperience(army)?.xp||0));
 let i=0;while(i<5&&xp>=B4A_XP_THRESHOLDS[i+1])i++;
 const lower=B4A_XP_THRESHOLDS[i],upper=B4A_XP_THRESHOLDS[i+1];
 return B4A_RANK_BONUSES[i]+(B4A_RANK_BONUSES[i+1]-B4A_RANK_BONUSES[i])*(xp-lower)/(upper-lower);
}
/** A combat encounter may unlock the NEXT rank when actual battle XP crosses its boundary.
 * Training alone cannot cross the high-rank 600/1000/1500 thresholds.
 */
function b4aRecordCombat(w,army,engagementId,round,exposed,losses=0){
 if(!army||manpower(army)<=0||exposed<=0)return 0;
 const x=army.formationExperience,key=`${engagementId}:${round}`;
 if(!x||x.lastBattleKey===key)return 0;
 const earned=Math.max(6,Math.min(20,5+Math.floor(exposed/25)+Math.min(4,Math.floor(losses/8))));
 x.xp=Math.min(2000,x.xp+earned);
 x.lastActiveDay=w.dayIndex;x.lastDecayDay=w.dayIndex;x.lastBattleKey=key;x.combatRounds++;
 // Reaching a new tier must result from real combat XP; previously unlocked tiers are historical.
 x.unlockedRank=Math.max(x.unlockedRank,b4aRankIndex(army));
 w.changeSeq++;return earned;
}
function b4aTrainingCeiling(army){
 const x=army.formationExperience;
 const highest=Math.max(2,Math.min(5,x.unlockedRank));
 return highest>=5?2000:B4A_XP_THRESHOLDS[highest+1]-1;
}
function b4aTrainFormation(w,army){
 const x=army.formationExperience;
 const paid=v04eBarracksEffects(w,army.nationId).paid;
 const earned=10+Math.min(4,paid*2);
 // Rank IV+ can be re-earned by training only if real combat unlocked it previously.
 const ceiling=b4aTrainingCeiling(army);
 const before=x.xp;x.xp=Math.min(ceiling,2000,x.xp+earned);
 x.lastActiveDay=w.dayIndex;x.lastDecayDay=w.dayIndex;x.lastTrainingDay=w.dayIndex;x.trainingSessions++;
 w.changeSeq++;return x.xp-before;
}
function b4aDecayFormations(w){
 for(const army of w.armies){
   const x=army.formationExperience;if(!x||x.xp<=0)continue;
   if(w.dayIndex-x.lastActiveDay<120)continue;
   const elapsed=w.dayIndex-Math.max(x.lastDecayDay,x.lastActiveDay+90);
   const ticks=Math.floor(elapsed/30);if(ticks<=0)continue;
   for(let i=0;i<ticks;i++)x.xp=Math.max(0,Math.round(x.xp*.995));
   x.lastDecayDay=w.dayIndex;
   w.changeSeq++;
 }
}
function b4aTerritory(w,id){return w.tiles.reduce((s,t)=>s+(t.ownerId===id?1:0),0);}
function b4aPopulation(w,id){return w.settlements.reduce((s,t)=>s+(t.ownerId===id?t.population:0),0);}
function b4aNewSurvival(w,id){return {state:'NORMAL',reason:'BASELINE',changedDay:w.dayIndex,history:[{dayIndex:w.dayIndex,territory:b4aTerritory(w,id),population:b4aPopulation(w,id)}],
 territoryLossRatio:0,populationLossRatio:0,rebuildReadiness:1,lastDecisiveDefeatDay:null,warBlocked:0,emergencyAttempts:0,emergencySuccess:0,emergencyFailures:{}};}
function b4aLastDecisiveLossDay(w,id){
 let result=null;
 for(const h of w.warHistory){
   if(h.tier!=='DECISIVE'||h.winnerId==null)continue;
   const attackers=h.participants?.attackers||[h.attackerId],defenders=h.participants?.defenders||[h.defenderId];
   const losers=attackers.includes(h.winnerId)?defenders:attackers;
   if(losers.includes(id))result=Math.max(result??-1,h.endedDay);
 }
 return result;
}
function b4aRecordYear(w){
 for(const n of w.nations){
   if(!n.active)continue;
   const s=n.survival??(n.survival=b4aNewSurvival(w,n.id));
   if(s.history.at(-1)?.dayIndex===w.dayIndex)continue;
   s.history.push({dayIndex:w.dayIndex,territory:b4aTerritory(w,n.id),population:b4aPopulation(w,n.id)});
   while(s.history.length>B4A_HISTORY_YEARS+1)s.history.shift();
 }
}
function b4aUpdateSurvival(w){
 for(const n of w.nations){
   const s=n.survival??(n.survival=b4aNewSurvival(w,n.id));
   if(!n.active){s.state='NORMAL';continue;}
   const territory=b4aTerritory(w,n.id),population=b4aPopulation(w,n.id);
   const recent=s.history.filter(x=>w.dayIndex-x.dayIndex<=B4A_HISTORY_YEARS*DAYS_PER_YEAR);
   const peakTerritory=Math.max(territory,...recent.map(x=>x.territory));
   const peakPopulation=Math.max(population,...recent.map(x=>x.population));
   const lostTiles=peakTerritory-territory,lostPeople=peakPopulation-population;
   s.territoryLossRatio=peakTerritory>0?lostTiles/peakTerritory:0;
   s.populationLossRatio=peakPopulation>0?lostPeople/peakPopulation:0;
   const loss20=(lostTiles>=4&&s.territoryLossRatio>=.20)||(lostPeople>=300&&s.populationLossRatio>=.20);
   const loss35=(lostTiles>=4&&s.territoryLossRatio>=.35)||(lostPeople>=300&&s.populationLossRatio>=.35);
   const target=Math.max(1,militaryStrengthTarget(w,n.id));
   s.rebuildReadiness=Math.min(1.5,nationManpower(w,n.id)/target);
   s.lastDecisiveDefeatDay=b4aLastDecisiveLossDay(w,n.id);
   const defeatFresh=s.lastDecisiveDefeatDay!==null&&w.dayIndex-s.lastDecisiveDefeatDay<4*DAYS_PER_YEAR;
   const war=militaryAtWar(w,n.id),noSafe=!w.settlements.some(t=>safeSettlement(w,t,n.id));
   const crisis=Boolean(war&&noSafe||loss35&&s.rebuildReadiness<.65||territory<=5&&war&&s.rebuildReadiness<.5);
   const recovery=loss20||defeatFresh&&s.rebuildReadiness<.85;
   const state=crisis?'CRISIS':recovery?'RECOVERY':'NORMAL';
   const reason=crisis?(war&&noSafe?'NO_SAFE_SETTLEMENT':loss35?'MAJOR_LOSS':'LAST_TERRITORY'):
     recovery?(loss20?'LONG_TERM_LOSS':'DECISIVE_DEFEAT'):'STABLE';
   if(state!==s.state){s.changedDay=w.dayIndex;w.changeSeq++;}
   s.state=state;s.reason=reason;
 }
}
function b4aWarConstraint(w,id,assessment){
 const s=w.nations[id]?.survival;if(!s)return null;
 if(s.state==='CRISIS')return 'SURVIVAL_CRISIS';
 const decisive=s.lastDecisiveDefeatDay!==null&&w.dayIndex-s.lastDecisiveDefeatDay<4*DAYS_PER_YEAR;
 const exceptional=assessment.strategicRatio>=1.6&&assessment.valuedTarget&&s.rebuildReadiness>=.9;
 if(decisive&&!exceptional)return 'DECISIVE_DEFEAT_RECOVERY';
 if(s.state==='RECOVERY'&&s.rebuildReadiness<.85&&!exceptional)return 'STRATEGIC_RECOVERY';
 return null;
}
function b4aEmergencyTile(w,s){
 return s.tileIds.map(id=>w.tiles[id]).filter(t=>t?.ownerId===s.ownerId&&TERRAINS[t.terrain].passable&&t.occupiedBy===null&&
   !w.armies.some(a=>a.nationId!==s.ownerId&&a.tileId===t.id&&manpower(a)>0))
   .sort((a,b)=>a.id-b.id)[0]||null;
}
function b4aEmergencyEligible(w,id,act){
 const n=w.nations[id],s=w.settlements.find(s=>s.id===act.settlementId&&s.ownerId===id);
 const war=warsOfNation(w,id).find(v=>warSide(v,id)==='defenders')||null;
 if(!n?.active||!war||warSide(war,id)!=='defenders'||!s||s.population<24||
    w.settlements.some(t=>safeSettlement(w,t,id))||ownArmyCount(w,id)>=armyLimit(w,id)||
    n.military.emergencyLastMusterDay===v04eQuarterDay(w))return false;
 if(!Number.isInteger(act.amount)||act.amount<12||act.amount>40||s.population-act.amount<12||
    activeManpower(w,id)+act.amount>militaryCapacity(w,id))return false;
 const tile=w.tiles[act.targetTileId];
 return Boolean(tile&&s.tileIds.includes(tile.id)&&tile.ownerId===id&&TERRAINS[tile.terrain].passable&&tile.occupiedBy===null&&
   !w.armies.some(a=>a.nationId!==id&&a.tileId===tile.id&&manpower(a)>0)&&recruitmentPrice({amount:act.amount,composition:[{typeId:'levy',position:'front',amount:act.amount}] }));
}
function b4aExecuteEmergency(w,id,act){
 const n=w.nations[id],s=w.settlements.find(s=>s.id===act.settlementId);
 const tile=w.tiles[act.targetTileId],commander=spawnCommander(w,id),armyId=w.nextArmyId++;
 const cultureDraft=d1CultureTake(s.culturePopulation,act.amount);s.population-=act.amount;d1bSyncGroups(s,w);d2aSyncGroups(w,s);refreshSettlementLevel(s);
 const front=Math.max(1,Math.floor(act.amount*.8)),reserve=act.amount-front;
 const units=[{id:`unit-${armyId}-0`,typeId:'levy',weaponId:'basic_arms',armorId:'none',manpower:front,allocationWeight:front,training:0}];
 if(reserve>0)units.push({id:`unit-${armyId}-1`,typeId:'levy',weaponId:'basic_arms',armorId:'none',manpower:reserve,allocationWeight:reserve,training:0});
 for(const u of units){u.culturePopulation=d1CultureTake(cultureDraft,u.manpower);c3InitUnit(u,w,id,{emergency:true});}
 const a={id:armyId,nationId:id,commanderId:commander.id,tileId:tile.id,morale:35,units,
   deployment:{front:[units[0].id],rear:[],back:[],reserve:reserve?[units[1].id]:[]},
   status:'REGROUP',order:null,operation:null,needsOrders:false,nextMoveDay:w.dayIndex+30,engagementId:null,
   regroupUntil:w.dayIndex+30,supplied:true,unsuppliedDays:0,supplyMultiplier:1,supplyCheckedDay:w.dayIndex,
   emergencyMuster:true,formationExperience:b4aNewExperience(w.dayIndex),c6CreatedDay:w.dayIndex};
 a.militaryPolitics={commanderChangeDays:[]};e3cEnsureFormationRecord(a,w.dayIndex);w.armies.push(a);n.military.emergencyLastMusterDay=v04eQuarterDay(w);
 n.survival.emergencySuccess++;
 event(w,`${n.name} 비상 소집: ${s.name}의 주민 ${act.amount}명이 제${armyId+1}군을 조직했습니다. (30일 집결)`,'army');
 return {ok:true,armyId,amount:act.amount};
}
function b4aRunEmergencyAI(w,n,execute,diag){
 const s=n.survival;
 const war=warsOfNation(w,n.id).find(v=>warSide(v,n.id)==='defenders')||null;
 if(s?.state!=='CRISIS'||!war||warSide(war,n.id)!=='defenders')return false;
 s.emergencyAttempts++;
 const sites=w.settlements.filter(v=>v.ownerId===n.id&&v.population>=24).sort((a,b)=>b.population-a.population||a.id-b.id);
 let reason='NO_LEGAL_CANDIDATE';
 for(const site of sites){
   const tile=b4aEmergencyTile(w,site);if(!tile){reason='NO_RALLY_TILE';continue;}
   const max=Math.min(40,site.population-12,militaryCapacity(w,n.id)-activeManpower(w,n.id));
   const amount=Math.floor(max);
   if(amount<12){reason='POPULATION_OR_CAPACITY';continue;}
   const act={type:'EMERGENCY_MUSTER',settlementId:site.id,targetTileId:tile.id,amount};
   if(!b4aEmergencyEligible(w,n.id,act)){reason='LEGALITY';continue;}
   const price=getActionPrice(w,n.id,act);
   if(!canAfford(n,price)){reason='AP_GOLD_OR_EQUIPMENT';continue;}
   const result=execute(w,n.id,act);
   if(result.ok){diag.reason='EMERGENCY_MUSTERED';return true;}
   reason='ACTION_REJECTED';
 }
 s.emergencyFailures[reason]=(s.emergencyFailures[reason]||0)+1;
 return false;
}
function b4aRunFormationTrainingAI(w,execute){
 for(const n of w.nations){
   if(!n.active||n.controller!=='AI')continue;
   const state=n.survival?.state||'NORMAL',target=militaryStrengthTarget(w,n.id),men=nationManpower(w,n.id);
   const budget=militaryUpkeep(w,n.id);
   if(n.gold<Math.max(350,budget*4)||target>men*1.6)continue;
   const eligible=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&a.engagementId===null&&manpower(a)>=12&&
     a.formationExperience?.xp<b4aTrainingCeiling(a)&&w.dayIndex-a.formationExperience.lastTrainingDay>=30&&atSafeSettlement(w,a)&&!a.order&&c3ArmyPending(a)===0)
     .sort((a,b)=>(a.formationExperience?.trainingSessions||0)-(b.formationExperience?.trainingSessions||0)||b4aRankIndex(a)-b4aRankIndex(b)||a.id-b.id);
   if(!eligible.length)continue;
   const max=state==='NORMAL'?1:2;let trained=0;
   for(const army of eligible){
     if(trained>=max)break;
     if(execute(w,n.id,{type:'TRAIN_FORMATION',armyId:army.id}).ok)trained++;
   }
 }
}
function b4aValidate(w,fail){
 for(const n of w.nations){
   const s=n.survival;
   if(!s||!['NORMAL','RECOVERY','CRISIS'].includes(s.state)||!Array.isArray(s.history)||s.history.length<1||s.history.length>21||
      s.history.some((h,i)=>!Number.isSafeInteger(h.dayIndex)||h.dayIndex<0||h.dayIndex>w.dayIndex||
        !Number.isSafeInteger(h.territory)||h.territory<0||!Number.isSafeInteger(h.population)||h.population<0||
        i>0&&h.dayIndex<=s.history[i-1].dayIndex)||!Number.isSafeInteger(s.warBlocked)||s.warBlocked<0||
      !Number.isSafeInteger(s.emergencyAttempts)||s.emergencyAttempts<0||!Number.isSafeInteger(s.emergencySuccess)||s.emergencySuccess<0||
      !Number.isInteger(n.military.emergencyLastMusterDay)||n.military.emergencyLastMusterDay>w.dayIndex)fail('B4A 국가 생존 상태');
 }
 for(const army of w.armies){
   const x=army.formationExperience;
   if(!x||!Number.isInteger(x.xp)||x.xp<0||x.xp>2000||!Number.isSafeInteger(x.lastActiveDay)||x.lastActiveDay>w.dayIndex||
!Number.isSafeInteger(x.lastDecayDay)||x.lastDecayDay>w.dayIndex||!Number.isInteger(x.unlockedRank)||x.unlockedRank<2||x.unlockedRank>5||
      !Number.isInteger(x.combatRounds)||x.combatRounds<0||!Number.isInteger(x.trainingSessions)||x.trainingSessions<0||
      typeof x.lastBattleKey!=='string'||x.lastBattleKey.length>50||
      (army.emergencyMuster!==undefined&&typeof army.emergencyMuster!=='boolean'))fail('B4A 편제 숙련 상태');
 }
}
// --- src/sim/actions.js ---



/** 컨트롤러 공통 행동 처리: AI 결정과 미래 플레이어 명령이 동일한 규칙을 사용한다. */









const costs=Object.freeze({INSTALL_WORKSHOP_POWER:1,SET_WORKSHOP_MODE:1,REDEVELOP_FACILITY:1,CLAIM_TILE:18,FOUND_SETTLEMENT:40,DEVELOP_SETTLEMENT:22,EXPAND_SETTLEMENT:16,INVEST_KNOWLEDGE:28,MERGE_SETTLEMENTS:15,TRADE_BUY:0,TRADE_SELL:0,BUILD_FACILITY:1,UPGRADE_FACILITY:1,REPAIR_FORT:1,BUILD_ROAD:1,UPGRADE_ROAD:1,START_RESEARCH:1});
const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b,size)=>{const p=pointOf(a,size),q=pointOf(b,size);return Math.abs(p.x-q.x)+Math.abs(p.y-q.y);};
const findSettlement=(world,id)=>world.settlements.find(s=>s.id===id);
const tilesOwned=(world,id)=>world.tiles.some(t=>t.ownerId===id);
function getNationActionCost(world,nationId,action,metrics=null){
  if(MILITARY_ACTIONS.includes(action?.type))return getActionPrice(world,nationId,action,metrics);
  if(!world.nations[nationId]||!Object.hasOwn(costs,action?.type))return null;
  return getActionPrice(world,nationId,action,metrics);
}
function isNationActionLegal(world,nationId,action,metrics=null){
  const n=world.nations[nationId],type=action?.type;
  if(MILITARY_ACTIONS.includes(type))return isMilitaryActionLegal(world,nationId,action);
  if(!n?.active||!Object.hasOwn(costs,type))return false;
  const tile=world.tiles[action.targetTileId],s=findSettlement(world,action.settlementId);
  switch(type){
    case 'TRADE_BUY':case 'TRADE_SELL':{
      if(!Number.isSafeInteger(action.amount)||action.amount<1||action.amount>10000)return false;
      const seller=type==='TRADE_BUY'?action.targetNationId:nationId;
      const buyer=type==='TRADE_BUY'?nationId:action.targetNationId;
      const q=tradeQuote(world,seller,buyer,action.resource,action.amount);
      return Boolean(q&&q.maxQuantity>=action.amount);
    }
    case 'START_RESEARCH':return researchLegal(world,nationId,action.technologyId);
    case 'INSTALL_WORKSHOP_POWER':return f1PowerInstallLegal(world,nationId,action);
    case 'SET_WORKSHOP_MODE':{
      const b=world.buildings.find(v=>v.id===action.buildingId),mode=action.mode;
      return Boolean(b?.typeId==='workshop'&&b.level===3&&b.status==='ACTIVE'&&!b.disconnected&&
        world.tiles[b.tileId]?.ownerId===nationId&&world.tiles[b.tileId]?.occupiedBy===null&&
        !world.occupations.some(o=>o.tileId===b.tileId)&&['standard','precision'].includes(mode)&&
        (b.workshopMode||'standard')!==mode&&
        (mode==='standard'||n.civilization.era==='early_modern'&&n.civilization.stage>=3&&hasTech(world,nationId,'precision_workshop_methods')));
    }
    case 'BUILD_ROAD':case 'UPGRADE_ROAD':return roadLegal(world,nationId,action);
    case 'BUILD_FACILITY':return buildingSiteLegal(world,nationId,action,metrics?.f4d3SiteUsage);
    case 'REDEVELOP_FACILITY':return redevelopmentLegal(world,nationId,action);
    case 'UPGRADE_FACILITY':return upgradeSiteLegal(world,nationId,action);
    case 'REPAIR_FORT':return fortRepairLegal(world,nationId,action.buildingId);
    case 'CLAIM_TILE': return getClaimCost(world,nationId,action.targetTileId,metrics)!==null;
    case 'FOUND_SETTLEMENT':return Boolean(tile&&tile.ownerId===nationId&&tile.settlementId===null&&world.nations[nationId].settlementIds.length<settlementCapacity(world,nationId,metrics).limit&&world.settlements.every(s=>s.ownerId!==nationId||distance(s.coreTileId,tile.id,world.size)>=3));
    case 'DEVELOP_SETTLEMENT':return Boolean(s&&s.ownerId===nationId&&s.development<100);
    case 'EXPAND_SETTLEMENT':return Boolean(s&&s.ownerId===nationId&&settlementExpansionCandidate(world,s,action.targetTileId,metrics?.footprintDemands?.get(s.id))); 
    case 'INVEST_KNOWLEDGE':return n.researchLevel<100;
    case 'MERGE_SETTLEMENTS':{
      const other=findSettlement(world,action.otherSettlementId);
      return Boolean(s&&other&&s.ownerId===nationId&&other.ownerId===nationId&&settlementMergeAssessment(world,s,other));
    }
    default:return false;
  }
}
function canExecuteNationAction(world,nationId,action,metrics=null){
 if(action&&['TANK_BUILD','TANK_DEPLOY','TANK_REPAIR','TANK_CREW','TANK_STORE'].includes(action.type))return v08fActionLegal(world,nationId,action)&&canAfford(world.nations[nationId],v08fActionPrice(world,nationId,action));
 if(action?.type==='I2_BUILD_STATION')return i2BuildLegal(world,nationId,'STATION',action)&&canAfford(world.nations[nationId],i2Cost(world,nationId,'STATION',action));
 if(action?.type==='I2_BUILD_LINE'){
  if(!i2BuildLegal(world,nationId,'LINE',action))return false;
  return canAfford(world.nations[nationId],i2Cost(world,nationId,'LINE',{path:i1RoadPath(world,world.nations[nationId],action.from,action.to)}));
 }
 if(action?.type==='I2_REPAIR'){
  if(!i2BuildLegal(world,nationId,'REPAIR',action))return false;
  const object=(action.kind==='STATION'?i2Ensure(world).stations:i2Ensure(world).lines).find(x=>x.id===action.id);
  return canAfford(world.nations[nationId],i2Cost(world,nationId,'REPAIR',object));
 }
 if(action&&['H_BUILD_PARTS','H_ASSEMBLE','H_DEPLOY','H_REPAIR','H_REFIT','H2G_SAVE_DESIGN','H2G_MAKE_MODULE','H2G_UPGRADE_MODULE','H2G_REFIT'].includes(action.type))return hLegal(world,nationId,action)&&canAfford(world.nations[nationId],hActionPrice(world,nationId,action));
  if(MILITARY_ACTIONS.includes(action?.type))return isMilitaryActionLegal(world,nationId,action)&&canAfford(world.nations[nationId],getActionPrice(world,nationId,action));
  if(!isNationActionLegal(world,nationId,action,metrics))return false;
  const price=getNationActionCost(world,nationId,action,metrics);
  return canAfford(world.nations[nationId],price);
}
function recordActionEvent(world,text,kind='growth'){
  world.events.push({dayIndex:world.dayIndex,text,kind});
  if(kind==='settlement'&&text.includes('설립했습니다'))recordHistoricalEvent(world,'settlement',text);
  if(world.events.length>180)world.events.splice(0,world.events.length-180);
}
function advanceLevel(s){
  const score=s.development+Math.min(70,s.population/4);
  s.level=score>=140?4:score>=93?3:score>=53?2:1;
}
function executeNationAction(world,nationId,action){
 if(action&&['TANK_BUILD','TANK_DEPLOY','TANK_REPAIR','TANK_CREW','TANK_STORE'].includes(action.type))return v08fActionExecute(world,nationId,action);
 if(action?.type==='I2_BUILD_STATION')return i2Build(world,nationId,'STATION',action);
 if(action?.type==='I2_BUILD_LINE')return i2Build(world,nationId,'LINE',action);
 if(action?.type==='I2_REPAIR')return i2Build(world,nationId,'REPAIR',{...action,type:action.kind});
  if(action&&['H_BUILD_PARTS','H_ASSEMBLE','H_DEPLOY','H_REPAIR','H_REFIT','H2G_SAVE_DESIGN','H2G_MAKE_MODULE','H2G_UPGRADE_MODULE','H2G_REFIT'].includes(action.type))return hExecute(world,nationId,action);
  // this function intentionally does not inspect controller or AIProfile
  if(MILITARY_ACTIONS.includes(action?.type)){const r=executeMilitaryAction(world,nationId,action);if(r.ok)world.setupLocked=true;return r;}
  if(!canExecuteNationAction(world,nationId,action))return {ok:false,reason:'실행 조건 또는 국가 역량 부족'};
  const n=world.nations[nationId],type=action.type,delta={};
  if(type==='TRADE_BUY'||type==='TRADE_SELL'){
    const seller=type==='TRADE_BUY'?action.targetNationId:nationId,buyer=type==='TRADE_BUY'?nationId:action.targetNationId;
    const result=executeTrade(world,seller,buyer,action.resource,action.amount);
    if(result.ok){world.setupLocked=true;n.actionStats[type]=(n.actionStats[type]||0)+1;refreshManualTradeDependency(world);}
    return result;
  }
  world.setupLocked=true;
  const price=getNationActionCost(world,nationId,action);
  payCost(n,price,v04e3ApCategory(type));
  if(['BUILD_FACILITY','REDEVELOP_FACILITY','UPGRADE_FACILITY'].includes(type))f2bTrackConstruction(n,price);
  e3e3RecordConstructionWood(n,action,price);
  n.actionStats[type]=(n.actionStats[type]||0)+1;
  const tile=world.tiles[action.targetTileId],s=findSettlement(world,action.settlementId);
  switch(type){
    case 'START_RESEARCH':{n.technology.currentResearch=action.technologyId;n.technology.progress=0;delta.technologyId=action.technologyId;break;}
    case 'INSTALL_WORKSHOP_POWER':{const b=world.buildings.find(v=>v.id===action.buildingId);b.powerProject={source:action.source,completeDay:world.dayIndex+f1PowerInstallDays(action.source)};delta.buildingId=b.id;delta.completeDay=b.powerProject.completeDay;break;}
    case 'SET_WORKSHOP_MODE':{const b=world.buildings.find(b=>b.id===action.buildingId);b.workshopMode=action.mode;delta.buildingId=b.id;delta.mode=b.workshopMode;break;}
    case 'BUILD_ROAD':case 'UPGRADE_ROAD':{
      const raw=roadPrice(action),discount=Math.min(.5,techBonus(world,nationId,'roadBuildCostDiscount'));
      n.roadDiscountCarry??={wood:0,stone:0};
      for(const [key,base] of Object.entries(raw.resources)){
        const paid=price.resources[key]||0;
        const next=(n.roadDiscountCarry[key]||0)+paid-base*(1-discount);
        n.roadDiscountCarry[key]=Math.max(0,Math.min(.999999,Math.round(next*1000000)/1000000));
      }
      tile.roadLevel=type==='BUILD_ROAD'?1:2;delta.tileId=tile.id;break;}
    case 'REDEVELOP_FACILITY':{
      const b=world.buildings.find(b=>b.id===action.buildingId);
      b.redevelopFrom=b.typeId;b.redevelopTo=action.buildingType;b.status='REDEVELOPING';
      b.completeDay=world.dayIndex+Math.max(30,v04dConstructionDays(world,nationId,action.buildingType,BUILDINGS[action.buildingType].days,true));
      delta.buildingId=b.id;delta.completeDay=b.completeDay;break;
    }
    case 'BUILD_FACILITY':{
      const definition=BUILDINGS[action.buildingType],id=world.nextBuildingId++;
      const f2bSpecial=F2B_INDUSTRIAL_TYPES.includes(action.buildingType)&&(action.industrialSlot===true||buildingTileSlotsUsed(world,action.targetTileId)>=generalTileSlotLimit(world,nationId));
      (action.buildingType==='fort'?world.defenses:world.buildings).push({id,typeId:action.buildingType,...(f2bSpecial?{industrialSlot:true}:{}),...(F2B_INDUSTRIAL_TYPES.includes(action.buildingType)?{f2bRuns:0,f2bOperatingDay:null}:{}),...(action.buildingType==='arsenal'?{f2cRuns:0,f2cOperatingDay:null}:{}),tileId:action.targetTileId,settlementId:action.buildingType==='fort'?world.tiles[action.targetTileId].settlementId:action.settlementId,level:1,...(action.buildingType==='fort'?{hp:fortMaxHP({level:1}),zeroHpSince:null}:{disconnected:false,...(['workshop','factory'].includes(action.buildingType)?{powerDevices:{mechanical:false,waterwheel:false,steam:false}}:{})}),status:'CONSTRUCTING',completeDay:world.dayIndex+Math.max(1,v04dConstructionDays(world,nationId,action.buildingType,buildingDays(action.buildingType,1)))});
      if(action.buildingType==='coal_pit')f2b1EnsureCoalSeam(world,tile);
      delta.buildingId=id;break;
    }
    case 'REPAIR_FORT':{
      const d=(world.defenses||[]).find(d=>d.id===action.buildingId);
      const missing=fortMaxHP(d)-d.hp;
      d.repair={ownerId:nationId,completeDay:world.dayIndex+Math.ceil(20+90*missing/fortMaxHP(d)),restoreHp:missing};
      delta.buildingId=d.id;delta.completeDay=d.repair.completeDay;break;
    }
    case 'UPGRADE_FACILITY':{
      const b=getStructure(world,action.buildingId);b.status='UPGRADING';b.targetLevel=b.level+1;
      b.completeDay=world.dayIndex+Math.max(1,v04dConstructionDays(world,nationId,b.typeId,buildingDays(b.typeId,b.level+1)));delta.buildingId=b.id;break;
    }
    case 'CLAIM_TILE':tile.ownerId=nationId;e5InvalidateBorders(world);delta.tileId=tile.id;
      if(n.actionStats.CLAIM_TILE===1||n.actionStats.CLAIM_TILE%6===0)recordActionEvent(world,`${n.name}이(가) 새로운 영토를 개척했습니다. (${tile.x}, ${tile.y})`,'territory');break;
    case 'FOUND_SETTLEMENT':{
      const id=world.nextSettlementId++;
      const settlement={id,ownerId:nationId,coreTileId:tile.id,name:`${n.name} 제${n.actionStats.FOUND_SETTLEMENT+1} 정착지`,founderNationId:nationId,formerCapitalOf:[],foundedDay:world.dayIndex,tileIds:[tile.id],population:12+Math.floor(n.researchLevel/12),development:9,level:1};
      settlement.culturePopulation=d1CulturePool(n.primaryCultureId,settlement.population);d1bNewSettlement(world,settlement);d2aInitSettlement(world,settlement);
      world.settlements.push(settlement);n.settlementIds.push(id);tile.settlementId=id;reconnectAnnexedFacilities(world,tile.id,id);delta.settlementId=id;
      recordActionEvent(world,`${n.name}이(가) ${settlement.name}을(를) 설립했습니다.`,'settlement');break;
    }
    case 'DEVELOP_SETTLEMENT':{const oldLevel=s.level; s.development=limit(s.development+12+Math.floor(n.researchLevel/22)+(roadConnections(world,nationId).bonusByCore.get(s.coreTileId)>0?2:0),0,100);advanceLevel(s);delta.settlementId=s.id;
      if(oldLevel!==s.level)recordActionEvent(world,`${s.name}이(가) 발전 단계 ${s.level}에 도달했습니다.`,'settlement');break;}
    case 'EXPAND_SETTLEMENT':{const oldLevel=s.level;s.tileIds.push(tile.id);tile.settlementId=s.id;reconnectAnnexedFacilities(world,tile.id,s.id);s.development=limit(s.development+2,0,100);advanceLevel(s);delta.settlementId=s.id;
      if(oldLevel!==s.level)recordActionEvent(world,`${s.name}이(가) 발전 단계 ${s.level}에 도달했습니다.`,'settlement');break;}
    case 'INVEST_KNOWLEDGE':{const before=n.researchLevel;n.researchLevel=limit(n.researchLevel+7,0,100);
      if(Math.floor(before/25)<Math.floor(n.researchLevel/25))recordActionEvent(world,`${n.name}의 발전 역량이 ${Math.floor(n.researchLevel/25)*25}단계에 도달했습니다.`,'knowledge');break;}
    case 'MERGE_SETTLEMENTS':{
      const other=findSettlement(world,action.otherSettlementId);
      // Preserve capital and otherwise the larger/older center.
      const primary=settlementMergePrimary(world,s,other);
      const secondary=primary===s?other:s;
      const housingBefore=settlementHousing(world,primary)+settlementHousing(world,secondary);
      const assertI1Merge=i1OnSettlementMerge(world,nationId,primary.id,secondary.id);
      e1OnSettlementMerge(world,nationId,primary.id,secondary.id);
      d2bMergeSettlement(world,primary,secondary);
      d2aMerge(world,primary,secondary);
      d1bMergeSettlements(primary,secondary);
      primary.tileIds.push(...secondary.tileIds);primary.population+=secondary.population;d1CultureAdd(primary.culturePopulation,secondary.culturePopulation);d1bSyncGroups(primary,world);d2aSyncGroups(world,primary);
      // Never erase the historical-capital center in a merger.
      for(const id of secondary.formerCapitalOf)markCapitalHistory(primary,id);
      primary.development=limit(Math.max(primary.development,secondary.development)+2,0,100);advanceLevel(primary);
      for(const id of secondary.tileIds)world.tiles[id].settlementId=primary.id;
      for(const b of allStructures(world))if(b.settlementId===secondary.id)b.settlementId=primary.id;
      // Preserve prior housing capacity, including all transferred houses exactly once.
      primary.inheritedHousing=(primary.inheritedHousing||0)+Math.max(0,housingBefore-settlementHousing(world,primary));
      n.settlementIds=n.settlementIds.filter(id=>id!==secondary.id);
      world.settlements=world.settlements.filter(v=>v.id!==secondary.id);
      assertI1Merge();
      recordActionEvent(world,`${n.name}의 ${secondary.name}이(가) ${primary.name}에 병합되었습니다.`,'settlement');break;
    }
  }
  if(type==='CLAIM_TILE')refreshApCaps(world);
  world.changeSeq++;
  return {ok:true,action:type,cost:price,...delta};
}
function refreshSettlementLevel(s){advanceLevel(s);}
/** Fixed base prices. CLAIM_TILE has a dynamic final price: getNationActionCost(). */
function getActionCosts(){return {...costs};}


/** E4 war/economy observability. No RNG, decisions, path-finding or action changes. */
const E4_AUDIT_MAX_YEARS=180;
const E4_AUDIT_COLUMNS=['dayIndex','year','nations','population','ownedTiles','armies','wars','coalitionWars','alliances','occupations','warEndsRecorded','whitePeace','limitedPeace','clearPeace','decisivePeace','totalCededTiles','zeroCessionNonWhite','totalReparations','avgWarDays','upkeepRecorded','operationRecorded','supportUpkeepRecorded','financeMismatch'];
function e4CompletedWars(w){return w.warHistory||[];}
function e4WarFinance(w){
 const all=[...(w.wars||[]),...e4CompletedWars(w)];
 let upkeep=0,operations=0,supportUpkeep=0,mismatches=0;
 for(const war of all){
  const ids=[...(war.participants?.attackers||war.sides?.attackers||[war.attackerId]),...(war.participants?.defenders||war.sides?.defenders||[war.defenderId])];
  for(const id of new Set(ids)){
   const a=Math.max(0,Number(war.militaryCosts?.[id])||0),b=Math.max(0,Number(war.upkeepCosts?.[id])||0),c=Math.max(0,Number(war.operationalCosts?.[id])||0);
   upkeep+=b;operations+=c;if(id!==war.attackerId&&id!==war.defenderId)supportUpkeep+=b;
   if(Math.abs(a-b-c)>0.00001)mismatches++;
  }
 }
 return {upkeepRecorded:upkeep,operationRecorded:operations,supportUpkeepRecorded:supportUpkeep,financeMismatch:mismatches};
}
function warAuditSnapshot(w){
 const ended=e4CompletedWars(w),totalDays=ended.reduce((s,h)=>s+Math.max(0,h.endedDay-h.startedDay),0);
 const countTier=tier=>ended.filter(h=>h.tier===tier).length;
 return {
  dayIndex:w.dayIndex,year:Math.floor(w.dayIndex/DAYS_PER_YEAR)+1,
  nations:w.nations.filter(n=>n.active).length,population:w.settlements.reduce((s,x)=>s+x.population,0),
  ownedTiles:w.tiles.reduce((s,t)=>s+(t.ownerId!==null?1:0),0),armies:w.armies.length,wars:w.wars.length,
  coalitionWars:w.wars.filter(war=>(war.sides?.attackers?.length||1)+(war.sides?.defenders?.length||1)>2).length,
  alliances:w.diplomacy.alliances.length,occupations:w.occupations.length,warEndsRecorded:ended.length,
  whitePeace:countTier('WHITE'),limitedPeace:countTier('LIMITED'),clearPeace:countTier('CLEAR'),decisivePeace:countTier('DECISIVE'),
  totalCededTiles:ended.reduce((s,h)=>s+(h.acquiredTiles||0),0),
  zeroCessionNonWhite:ended.filter(h=>h.tier!=='WHITE'&&!(h.acquiredTiles>0)).length,
  totalReparations:ended.reduce((s,h)=>s+(h.reparations||0),0),
  avgWarDays:ended.length?Math.round(totalDays/ended.length*10)/10:0,
  ...e4WarFinance(w)
 };
}
/** Collect once per calendar year, keep 180 recent samples. Bounded save growth. */
function recordAnnualWarAudit(w){
 const samples=w.warAuditYears??(w.warAuditYears=[]);
 const snap=warAuditSnapshot(w);
 if(samples.length&&samples[samples.length-1].dayIndex===snap.dayIndex)samples[samples.length-1]=snap;
 else samples.push(snap);
 if(samples.length>E4_AUDIT_MAX_YEARS)samples.splice(0,samples.length-E4_AUDIT_MAX_YEARS);
}
function warAuditReport(w){
 const current=warAuditSnapshot(w),years=w.warAuditYears||[];
 return {version:VERSION,schema:'vilob-light-war-audit-e4',seed:w.seed,map:{width:w.size,height:w.height,nations:w.nations.length},
generatedDay:w.dayIndex,dayPerYear:DAYS_PER_YEAR,
   limitations:['Annual samples begin when E4 is first run; earlier years cannot be reconstructed from a save.',
   'War-end totals are based on the bounded warHistory (up to 200 records), not all-time historical counts.',
   'War finance is incurred cost, including arrears, not necessarily treasury cash paid.'],
   current,years:years.map(s=>({...s})),
   perNation:w.nations.map(n=>({id:n.id,name:n.name,active:n.active,warHistoryCount:e4CompletedWars(w).filter(h=>[...(h.participants?.attackers||[h.attackerId]),...(h.participants?.defenders||[h.defenderId])].includes(n.id)).length,
      currentWarId:w.wars.find(war=>warSide(war,n.id)!==null)?.id??null,
      militaryCostRecorded:[...w.wars,...e4CompletedWars(w)].reduce((s,war)=>s+(war.militaryCosts?.[n.id]||0),0)}))};
}
function warAuditCsv(w){
 const rows=[E4_AUDIT_COLUMNS,...(w.warAuditYears||[]).map(s=>E4_AUDIT_COLUMNS.map(key=>s[key]??''))];
 return '\ufeff'+rows.map(row=>row.map(v=>String(v).replace(/\"/g,'\"\"')).map(v=>'\"'+v+'\"').join(',')).join('\n');
}
