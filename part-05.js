// --- src/sim/diplomacy.js ---
/** Symmetric, deterministic nation-pair diplomacy. Never keyed by nation NAME. */

const bound=(n,a,b)=>Math.max(a,Math.min(b,n));
const pairKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
function createDiplomacy(nations){
  const pairs={};
  for(let i=0;i<nations.length;i++)for(let j=i+1;j<nations.length;j++)pairs[pairKey(i,j)]={relation:0};
  return {pairs,alliances:[],offers:[],calls:[],courtCooldowns:{},memory:{},history:[],perceptions:{},subjectTreaties:[],subjectOffers:[],subjectCooldowns:{},subjectHistory:[],tributeHistory:[],subjectDiagnostics:v06b1NewDiagnostics(0),independenceFronts:[],independencePledges:[],independenceOffers:[],independenceBackingCooldowns:{},independenceOutreach:{},independenceStats:{demands:0,accepted:0,rejected:0,wars:0,victories:0,defeats:0,frontsProposed:0,frontsAccepted:0,pledgesRequested:0,pledgesAccepted:0,backingProposed:0,backingAccepted:0,backingRejected:0,jointWars:0,externallySupportedWars:0,protectionFought:0,protectionDefeats:0},borderRevision:0,relationRevision:0};
}
/** Permanent while a living nation has one of its former capitals under the other state's sovereignty.
 * Peace/truce never automatically erases an unresolved former-capital grievance. */
function occupiedHistoricCapital(w,grievedId,holderId){
  if(grievedId===holderId||!w.nations[grievedId]?.active||!w.nations[holderId]?.active)return false;
  return w.settlements.some(s=>s.ownerId===holderId&&(s.formerCapitalOf||[]).includes(grievedId));
}
// Historic-capital sovereignty changes only on territory transfers, annexations
// or national extinction. Cache pair decisions by the same ownership revision
// used for border friction, rather than scanning every settlement per AI query.
const e5CapitalCache=new WeakMap();
function capitalGrievance(w,a,b){
 const rev=w.diplomacy?.borderRevision||0;
 let cached=e5CapitalCache.get(w);
 if(!cached||cached.rev!==rev){cached={rev,pairs:new Map()};e5CapitalCache.set(w,cached);}
 const key=pairKey(a,b);
 if(!cached.pairs.has(key))cached.pairs.set(key,occupiedHistoricCapital(w,a,b)||occupiedHistoricCapital(w,b,a)?-45:0);
 return cached.pairs.get(key);
}
/** V0.6A: directed, bounded state. A:B is nation A's assessment of B,
 * NOT a bilateral relation. Events accumulate memory; quarterly updates refresh
 * perceived relative power without inventing past events for old saves.
 * Existing E5 symmetric relations, alliance scars and penalties are untouched.
 */
const V06A_MEMORY_FIELDS=['trust','grievance','favor','betrayalConcern','powerBias'];
const V06A_HALFLIVES={trust:20,grievance:35,favor:12,betrayalConcern:40,powerBias:28};
// V0.6A1: one nation's lived vulnerability is not another nation's equal and opposite confidence.
// Attacks and betrayals can raise the observer's perceived risk by at most 12 points,
// independently of the objective (antisymmetric) power ratio. This does NOT change affinity.
function v06aSubjectiveThreat(m){return Math.min(12,m.grievance*.12+m.betrayalConcern*.08);}
const v06aRound=value=>Math.round(value*100)/100;
const v06aKey=(observer,target)=>`${observer}:${target}`;
function v06aGet(w,observer,target){return w.diplomacy?.perceptions?.[v06aKey(observer,target)]||null;}
function v06aEnsure(w,observer,target){
 if(observer===target||!w.nations[observer]||!w.nations[target])return null;
 const d=w.diplomacy;d.perceptions??={};const key=v06aKey(observer,target);
 return d.perceptions[key]??=( {trust:0,grievance:0,favor:0,betrayalConcern:0,betrayalCount:0,powerBias:0,perceivedPower:0,lastUpdatedDay:w.dayIndex,lastEventDay:null,lastEventKind:null} );
}
function v06aAge(m,day){
 const elapsed=Math.max(0,day-m.lastUpdatedDay);
 if(!elapsed)return;
 for(const field of V06A_MEMORY_FIELDS){
   const hl=V06A_HALFLIVES[field]*DAYS_PER_YEAR;
   m[field]=v06aRound(m[field]*Math.pow(.5,elapsed/hl));
   if(Math.abs(m[field])<.01)m[field]=0;
 }
 m.lastUpdatedDay=day;
}
function v06aRemember(w,observer,target,kind,changes={}){
 const m=v06aEnsure(w,observer,target);if(!m)return;
 v06aAge(m,w.dayIndex);
 for(const field of V06A_MEMORY_FIELDS)if(changes[field]!==undefined){
   const limit=field==='powerBias'?30:100;
   m[field]=v06aRound(bound(m[field]+changes[field],field==='trust'||field==='powerBias'?-limit:0,limit));
 }
 if(changes.betrayalCount)m.betrayalCount+=changes.betrayalCount;
 if(changes.powerBias)m.perceivedPower=Math.round(bound(m.perceivedPower+changes.powerBias,-100,100));
 m.lastEventDay=w.dayIndex;m.lastEventKind=kind;
}
function v06aRememberBoth(w,a,b,kind,changes){v06aRemember(w,a,b,kind,changes);v06aRemember(w,b,a,kind,changes);}
/** All objective strengths are scanned ONCE per military quarter. */
function v06aUpdatePerceptionsQuarter(w){
 const d=w.diplomacy;d.perceptions??={};
 const info=w.nations.map(n=>({population:0,land:0,men:n.active?nationManpower(w,n.id):0,
   gold:Math.max(0,n.gold||0),income:Math.max(0,n.lastQuarter?.goldIncome||0),tech:n.technology?.unlocked?.length||0}));
 for(const s of w.settlements)if(info[s.ownerId])info[s.ownerId].population+=Math.max(0,s.population||0);
 for(const t of w.tiles)if(t.ownerId!==null&&info[t.ownerId])info[t.ownerId].land++;
 const log=(a,b,offset)=>Math.log((a+offset)/(b+offset));
 for(const a of w.nations){if(!a.active)continue;
   for(const b of w.nations){if(!b.active||a.id===b.id)continue;
     const m=v06aEnsure(w,a.id,b.id),own=info[a.id],other=info[b.id];v06aAge(m,w.dayIndex);
     const weights=w.aiProfiles[a.aiProfileId]?.powerPerception||POWER_PERCEPTION_BASE;
     // Economic perception retains A1's treasury:quarterly-income 60:40 split.
     const economy=.6*log(other.gold,own.gold,200)+.4*log(other.income,own.income,100);
     const contrast=(weights.military*log(other.men,own.men,20)+
       weights.population*log(other.population,own.population,100)+
       weights.economy*economy+weights.territory*log(other.land,own.land,8)+
       weights.technology*log(other.tech,own.tech,4))/100;
     m.perceivedPower=Math.round(bound(58*contrast+m.powerBias+v06aSubjectiveThreat(m),-100,100));
   }
 }
}
/** Small bounded modifiers applied to DECISIONS, never rawRelationOf().
 * A high positive power perception means the other state is stronger.
 * A large negative value means the observer feels dominant, not hateful.
 */
function v06aAllianceWeight(w,a,b){
 const m=v06aGet(w,a,b);if(!m)return 0;
 return bound((m.trust*.13)+(m.favor*.09)-(m.grievance*.12)-(m.betrayalConcern*.18)+
   Math.max(0,m.perceivedPower)*.055,-20,18);
}
function v06aDefenseWeight(w,a,b){
 const m=v06aGet(w,a,b);if(!m)return 0;
 return bound(m.trust*.12+m.favor*.22-m.grievance*.07-m.betrayalConcern*.12,-17,22);
}
function v06aAttackWeight(w,a,partner,foe){
 const ally=v06aGet(w,a,partner),enemy=v06aGet(w,a,foe);
 return bound((ally?ally.trust*.07+ally.favor*.08-ally.betrayalConcern*.11:0)+
  (enemy?enemy.grievance*.055-Math.max(0,enemy.perceivedPower)*.08:0),-14,15);
}
function v06aWarWeight(w,a,b){
 const m=v06aGet(w,a,b);if(!m)return 1;
 // A weak rival is a tempting target, but cannot alone cause aggression.
 // Strategic risk, readiness, treaties and personality still govern legality.
 return bound(1+m.grievance*.0015-m.trust*.0012-m.favor*.0008-
  m.betrayalConcern*.0005-m.perceivedPower*.0015,.80,1.20);
}
function v06aRememberWarPeace(w,war,tier,winnerSide){
 const attackers=war.sides?.attackers||[war.attackerId],defenders=war.sides?.defenders||[war.defenderId];
 const strength=tier==='DECISIVE'?13:tier==='CLEAR'?9:tier==='LIMITED'?5:0;
 // One update per opposing nation pair; coalition members are credited once.
 for(const a of attackers)for(const b of defenders){
   if(!w.nations[a]||!w.nations[b])continue;
   if(winnerSide){
     const aWin=winnerSide==='attackers';
     // The defeated side learns a stronger warning than the winner learns confidence.
     // V0.6A gave exact opposites; A1 makes this experience genuinely directional.
     const victorConfidence=Math.round(strength*.65);
     v06aRemember(w,a,b,'WAR_END',{powerBias:aWin?-victorConfidence:strength,grievance:3});
     v06aRemember(w,b,a,'WAR_END',{powerBias:aWin?strength:-victorConfidence,grievance:3});
   }else{
     v06aRemember(w,a,b,'WAR_END',{grievance:2});
     v06aRemember(w,b,a,'WAR_END',{grievance:2});
   }
 }
 // A commitment is not the same as effective help. Credit actual military
 // participation ONCE at peace; never invent contributions from old history.
 for(const [principal,members] of [[war.attackerId,attackers],[war.defenderId,defenders]]){
   for(const helper of members){if(helper===principal)continue;
     const battles=war.battleWins?.[helper]||0,losses=war.casualties?.[helper]||0;
     const costs=war.militaryCosts?.[helper]||0,occupation=war.occupationContributions?.[helper]||0;
     if(battles+losses+costs+occupation<=0)continue;
     const magnitude=Math.min(13,3+battles*2+Math.min(3,Math.floor(losses/25))+Math.min(3,Math.floor(costs/150))+Math.min(3,occupation));
     v06aRemember(w,principal,helper,'WAR_SUPPORT',{trust:3,favor:magnitude});
   }
 }
}
/** E5: bounded, pair-keyed diplomatic memory. Old saves carry live treaties but
 * do not invent already-ended historical treaties. */
const E5_YEAR=DAYS_PER_YEAR;
const E5_BETRAY_GRACE=5*E5_YEAR;
const E5_SCAR_DURATION=10*E5_YEAR;
function e5Memory(w,a,b){return w.diplomacy?.memory?.[pairKey(a,b)]||null;}
function e5TreatyAge(w,a,b){const t=allianceBetween(w,a,b);return t?Math.max(0,w.dayIndex-t.formedDay):0;}
function e5TrustForAge(age){
 return Math.min(24,Math.max(0,Math.floor((age-2*E5_YEAR)/E5_YEAR))*3);
}
function e5TrustBonus(w,a,b){return e5TrustForAge(e5TreatyAge(w,a,b));}
/** E5B: alliance companionship changes the long-run *stored* relation
 * equilibrium, not the instantaneous sentiment modifier. A new treaty
 * gives no immediate bonus; ages 0-2y give 0, 3y +2 ... 6y +8 (cap).
 * Leaving the alliance removes the raised target, not the accumulated base.
 * This calculation is deterministic, has no new saved fields or RNG. */
function e5bRestingOffsetForAge(age){
 return Math.min(8,Math.max(0,(Math.floor(Math.max(0,age)/E5_YEAR)-2)*2));
}
function e5bNeutralResting(w,a,b){
 const p=w.aiProfiles[w.nations[a].aiProfileId],q=w.aiProfiles[w.nations[b].aiProfileId];
 const cooperation=((p?.diplomacy?.cooperation??50)+(q?.diplomacy?.cooperation??50))/2;
 return Math.round((cooperation-50)*.35);
}
function e5bRestingDetails(w,a,b){
 const neutral=e5bNeutralResting(w,a,b);
 const offset=e5bRestingOffsetForAge(e5TreatyAge(w,a,b));
 return {neutral,offset,target:neutral+offset};
}
/** E5A: evaluate renewal at the *last active treaty day*, rather than after
 * allianceBetween() has already stopped recognizing the expiring agreement.
 * No temporary world mutation or persisted cache changes are needed. */
function e5aRenewalDecision(w,t){
 const lastActiveDay=t.endsDay-1;
 const trust=e5TrustForAge(Math.max(0,lastActiveDay-t.formedDay));
 const parts=e5RelationComponents(w,t.a,t.b);
 // Remove the post-expiration trust (normally zero) before adding the final
 // valid day's trust. Decompose before clamping to preserve +/-100 semantics.
 const relation=bound(parts.base+parts.capital+parts.border+parts.betrayal+parts.violence+parts.tension+parts.culture+trust,-100,100);
 const p=w.aiProfiles[w.nations[t.a].aiProfileId],q=w.aiProfiles[w.nations[t.b].aiProfileId];
 const cooperation=(p?.diplomacy?.cooperation??50)+(q?.diplomacy?.cooperation??50);
 const reason=w.nations[t.a].controller!=='AI'||w.nations[t.b].controller!=='AI'?'PLAYER_CONTROLLED':
   relation<25?'LOW_RELATION':cooperation<95?'LOW_COOPERATION':'RENEW';
 return {relation,cooperation,trust,reason,ok:reason==='RENEW'};
}
function e5BorderPenalty(w,a,b){return a===b?0:quarterBorderPairs(w).has(pairKey(a,b))?-8:0;}
function e5BetrayalScar(w,a,b){
 const m=e5Memory(w,a,b),elapsed=w.dayIndex-(m?.lastBetrayalDay??-Infinity);
 return elapsed>=0&&elapsed<E5_SCAR_DURATION?-Math.ceil(15*(E5_SCAR_DURATION-elapsed)/E5_SCAR_DURATION):0;
}
// Relation bonuses are pure within one day unless a treaty, border, or
// betrayal changes. Lazy pair memoization avoids O(alliances) work at the
// many repeated military/AI sentiment call sites; it is never persisted.
const e5RelationCache=new WeakMap();
function e5BilateralModifier(w,a,b){
 const d=w.diplomacy,epoch=d.relationRevision||0,rev=d.borderRevision||0;
 let c=e5RelationCache.get(w);
 if(!c||c.day!==w.dayIndex||c.rev!==rev||c.epoch!==epoch){
   const count=w.nations.length;
   c={day:w.dayIndex,rev,epoch,count,values:new Array(count*count).fill(null)};
   e5RelationCache.set(w,c);
 }
 const index=(a<b?a:b)*c.count+(a<b?b:a);
 let value=c.values[index];
 if(value===null){value=e5BorderPenalty(w,a,b)+e5TrustBonus(w,a,b)+e5BetrayalScar(w,a,b)+v06e5DiplomaticPenalty(w,a,b);c.values[index]=value;}
 return value;
}
function e5InvalidateRelations(w){w.diplomacy.relationRevision=(w.diplomacy.relationRevision||0)+1;e5RelationCache.delete(w);}
function e5RelationComponents(w,a,b){
 if(a===b)return {base:100,capital:0,border:0,trust:0,betrayal:0,violence:0,tension:0,culture:0,total:100};
 const base=w.diplomacy?.pairs?.[pairKey(a,b)]?.relation??0;
const capital=capitalGrievance(w,a,b),border=e5BorderPenalty(w,a,b),violence=v06e5DiplomaticPenalty(w,a,b);
 const trust=e5TrustBonus(w,a,b),betrayal=e5BetrayalScar(w,a,b),tension=allianceTensionOf(w,a,b),culture=e2bCulturalModifier(w,a,b);
 return {base,capital,border,trust,betrayal,violence,tension,culture,total:bound(base+capital+border+trust+betrayal+violence+tension+culture,-100,100)};
}
function e5AppendHistory(w,kind,a,b,extra={}){
 const d=w.diplomacy;d.history??=[];
 d.history.push({dayIndex:w.dayIndex,kind,a:Math.min(a,b),b:Math.max(a,b),...extra});
 if(d.history.length>120)d.history.splice(0,d.history.length-120);
}
function e5EndAlliance(w,t,reason,actorId=null){
 const d=w.diplomacy,key=pairKey(t.a,t.b),age=Math.max(0,w.dayIndex-t.formedDay);
 d.memory??={};const m=d.memory[key]??={};
 m.lastAllianceStartDay=t.formedDay;m.lastAllianceEndedDay=w.dayIndex;
 m.lastAllianceDurationDays=age;m.lastEndReason=reason;
 e5InvalidateRelations(w);
 e5AppendHistory(w,'ALLIANCE_END',t.a,t.b,{reason,actorId,durationDays:age});
 if(reason==='VOLUNTARY'&&actorId!==null)v06aRemember(w,actorId===t.a?t.b:t.a,actorId,'ALLIANCE_END',{trust:-9,grievance:4});
 d.alliances=d.alliances.filter(x=>x!==t);
 w.changeSeq++;
 return age;
}
function e5BetrayalEligible(w,a,b,live=false){
 if(live)return e5TreatyAge(w,a,b)>=5*E5_YEAR;
 const m=e5Memory(w,a,b);
 return Boolean(m&&m.lastAllianceDurationDays>=5*E5_YEAR&&
   w.dayIndex>=m.lastAllianceEndedDay&&w.dayIndex-m.lastAllianceEndedDay<=E5_BETRAY_GRACE);
}
function e5RegisterBetrayal(w,a,b,kind){
 const key=pairKey(a,b),d=w.diplomacy;d.memory??={};const m=d.memory[key]??={};
 m.lastBetrayalDay=w.dayIndex;m.lastBetrayerId=a;m.lastVictimId=b;
 m.betrayalCount=(m.betrayalCount||0)+1;
 e5InvalidateRelations(w);
 // An ordinary declaration already incurs -30; this is the additional breach cost.
 adjustRelation(w,a,b,-45);
 e5AppendHistory(w,'BETRAYAL',a,b,{betrayerId:a,victimId:b,mode:kind});
 v06aRemember(w,b,a,'BETRAYAL',{trust:-22,grievance:15,betrayalConcern:30,betrayalCount:1});
 event(w,`${w.nations[a].name}이(가) 오랜 동맹국 ${w.nations[b].name}을(를) 배신했습니다. (추가 우호도 -45)`,'diplomacy');
 recordHistoricalEvent(w,'war',w.events[w.events.length-1].text,[a,b],`e5:betrayal:${a}:${b}:${w.dayIndex}`);
}
// Border list cached by map ownership epoch rather than changeSeq (which also
// changes on movement, economy and AP usage). Never serialize cached Sets.
const e5BorderCache=new WeakMap();
function e5InvalidateBorders(w){w.diplomacy.borderRevision=(w.diplomacy.borderRevision||0)+1;e5BorderCache.delete(w);e5CapitalCache.delete(w);}
/** E1C: raw bilateral sentiment. Never include alliance backlash in this value:
 * third-party hostility must not recursively depend on itself. */
function rawRelationOf(w,a,b){
  if(a===b)return 100;
  return bound((w.diplomacy?.pairs?.[pairKey(a,b)]?.relation??0)+capitalGrievance(w,a,b)+e5BilateralModifier(w,a,b)+e2bCulturalModifier(w,a,b),-100,100);
}
/** Active war takes priority over the third state's pre-existing hostility. */
function thirdPartyAlliancePenalty(w,third,partner){
  if(warAgainst(w,third,partner))return -10;
  const r=rawRelationOf(w,third,partner);
  return r<=-60?-5:r<=-20?-2:0;
}
/** Cache only a transient derived matrix (WeakMap, never serialized). Recompute when
 * world events/relations change or a treaty naturally expires at a day boundary.
 * No per-relation full alliance scan, and no saved-state contamination. */
const allianceTensionCache=new WeakMap();
function allianceTensions(w){
  const cached=allianceTensionCache.get(w);
  if(cached&&cached.day===w.dayIndex&&cached.seq===w.changeSeq)return cached.values;
  const values=new Map(),d=w.diplomacy;
  if(d?.alliances?.length){
    for(const treaty of d.alliances){
      const {a,b,endsDay}=treaty;
      if(endsDay<=w.dayIndex||!w.nations[a]?.active||!w.nations[b]?.active)continue;
      for(const c of w.nations){
        if(!c.active||c.id===a||c.id===b)continue;
        const pab=thirdPartyAlliancePenalty(w,c.id,b),pba=thirdPartyAlliancePenalty(w,c.id,a);
        if(pab){const key=pairKey(a,c.id);values.set(key,Math.min(values.get(key)||0,pab));}
        if(pba){const key=pairKey(b,c.id);values.set(key,Math.min(values.get(key)||0,pba));}
      }
    }
  }
  allianceTensionCache.set(w,{day:w.dayIndex,seq:w.changeSeq,values});
  return values;
}
function allianceTensionOf(w,a,b){return a===b?0:allianceTensions(w).get(pairKey(a,b))||0;}
function relationOf(w,a,b){
  if(a===b)return 100;
  return bound(rawRelationOf(w,a,b)+allianceTensionOf(w,a,b),-100,100);
}
function adjustRelation(w,a,b,delta){
  if(a===b||!w.diplomacy?.pairs?.[pairKey(a,b)])return;
  const r=w.diplomacy.pairs[pairKey(a,b)];r.relation=bound(Math.round(r.relation+delta),-100,100);
  w.changeSeq++;
}
function hasSharedBorder(w,a,b){
  return w.tiles.some(t=>t.ownerId===a&&neighbors4(t.id,w.size,w.height).some(id=>w.tiles[id].ownerId===b));
}
/** E1: reuse a single nation frontier scan for this quarter's diplomacy. */
function quarterBorderPairs(w){
 const cached=e5BorderCache.get(w),rev=w.diplomacy?.borderRevision||0;
 if(cached&&cached.rev===rev)return cached.borders;
 const borders=new Set();
 for(const t of w.tiles){
   if(t.ownerId===null)continue;
   const x=t.x,y=t.y;
   if(x<w.size-1){const b=w.tiles[t.id+1].ownerId;if(b!==null&&b!==t.ownerId)borders.add(pairKey(t.ownerId,b));}
   if(y<w.height-1){const b=w.tiles[t.id+w.size].ownerId;if(b!==null&&b!==t.ownerId)borders.add(pairKey(t.ownerId,b));}
 }
 e5BorderCache.set(w,{rev,borders});
 return borders;
}
function updateRelationsQuarter(w,frontiers=quarterBorderPairs(w)){
  // E5B: derive active treaty ages once for the existing quarterly relation
  // sweep; no daily scan, new persistent data, or per-pair alliance search.
  const ages=new Map();
  for(const t of w.diplomacy.alliances){
    if(t.endsDay>w.dayIndex&&w.nations[t.a]?.active&&w.nations[t.b]?.active)
      ages.set(pairKey(t.a,t.b),Math.max(0,w.dayIndex-t.formedDay));
  }
  for(let a=0;a<w.nations.length;a++)for(let b=a+1;b<w.nations.length;b++){
    if(!w.nations[a].active||!w.nations[b].active)continue;
    const key=pairKey(a,b),val=w.diplomacy.pairs[key].relation;
    const atWar=w.wars.some(war=>warSide(war,a)&&warSide(war,b)&&warSide(war,a)!==warSide(war,b));
    if(atWar)continue;
    // Existing neutral target is unchanged for all non-allies. Allies gain a
    // slowly rising target, never an immediate relation-score modifier.
    const offset=e5bRestingOffsetForAge(ages.get(key)??0);
    const resting=e5bNeutralResting(w,a,b)+offset;
    // Preserve exact old 2-point drift for non-allies. Only an alliance with
    // an active E5B offset receives a final 1-point settling step instead of
    // oscillating across its raised target.
    let step=val<resting?2:val>resting?-2:0;
    if(offset&&Math.abs(resting-val)===1)step=resting-val;
    if(step)adjustRelation(w,a,b,step);
  }
}



/** E2: bilateral alliances remain non-transitive. Offensive participation is voluntary. */
const ALLIANCE_TERM=10*DAYS_PER_YEAR;
const ALLIANCE_LIMIT=2;
function warSide(war,id){
  if(!war)return null;
  const sides=war.sides;
  if(sides){if(sides.attackers.includes(id))return 'attackers';if(sides.defenders.includes(id))return 'defenders';return null;}
  return war.attackerId===id?'attackers':war.defenderId===id?'defenders':null;
}
function warMembers(war){return war.sides?[...war.sides.attackers,...war.sides.defenders]:[war.attackerId,war.defenderId];}
function warOpponents(war,id){const side=warSide(war,id);return side==='attackers'?(war.sides?.defenders||[war.defenderId]):side==='defenders'?(war.sides?.attackers||[war.attackerId]):[];}
function warFriends(war,id){const side=warSide(war,id);return side==='attackers'?(war.sides?.attackers||[war.attackerId]):side==='defenders'?(war.sides?.defenders||[war.defenderId]):[];}
function warAgainst(w,a,b){if(a===b||a===null||b===null||a===undefined||b===undefined)return null;
 return w.wars.find(v=>warSide(v,a)&&warSide(v,b)&&warSide(v,a)!==warSide(v,b))||null;
}
function warsOfNation(w,id){return w.wars.filter(v=>warSide(v,id));}
function warOfNation(w,id){return w.wars.find(v=>warSide(v,id))||null;}
/** No nation pair may fight twice or support opposite sides in separate wars. */
function c2CanJoinWar(w,id,friends,foes,exceptWarId=null){
 if(!w.nations[id]?.active||friends.includes(id)||foes.includes(id))return false;
 for(const v of w.wars){if(v.id===exceptWarId)continue;
   for(const friend of friends)if(warSide(v,id)&&warSide(v,friend)&&warSide(v,id)!==warSide(v,friend))return false;
   for(const foe of foes)if(warSide(v,id)&&warSide(v,foe))return false;
 }
 return true;
}
function c2CanStartWar(w,attackers,defenders){
 if(new Set([...attackers,...defenders]).size!==attackers.length+defenders.length)return false;
 return attackers.every(id=>w.nations[id]?.active&&c2CanJoinWar(w,id,attackers.filter(v=>v!==id),defenders))&&
   defenders.every(id=>w.nations[id]?.active&&c2CanJoinWar(w,id,defenders.filter(v=>v!==id),attackers));
}
function c2PeaceWar(w,id,act){
 const war=Number.isInteger(act.warId)?w.wars.find(v=>v.id===act.warId):warAgainst(w,id,act.targetNationId);
 return war&&warSide(war,id)&&warSide(war,act.targetNationId)&&warSide(war,id)!==warSide(war,act.targetNationId)?war:null;
}
function allianceBetween(w,a,b){return (w.diplomacy.alliances||[]).find(x=>x.a===Math.min(a,b)&&x.b===Math.max(a,b)&&x.endsDay>w.dayIndex)||null;}
function allianceCount(w,id){return (w.diplomacy.alliances||[]).filter(x=>x.endsDay>w.dayIndex&&(x.a===id||x.b===id)).length;}
function allyAccess(w,armyId,ownerId){
 if(ownerId===armyId)return true;
 return warsOfNation(w,armyId).some(war=>warSide(war,armyId)===warSide(war,ownerId));
}
function allianceOffer(w,a,b){return w.diplomacy.offers.find(x=>x.from===a&&x.to===b&&x.expiresDay>w.dayIndex)||null;}
function allianceActionLegal(w,id,act){
 const target=w.nations[act.targetNationId];if(!target?.active||id===target.id||!w.nations[id]?.active)return false;
 const a=id,b=target.id,d=w.diplomacy;
 switch(act.type){
 case 'IMPROVE_RELATIONS':return !warOfNation(w,a)&&!warOfNation(w,b)&&!occupiedHistoricCapital(w,a,b)&&!occupiedHistoricCapital(w,b,a)&&w.dayIndex>=(d.courtCooldowns?.[a+':'+b]||0);
 case 'OFFER_ALLIANCE':return !v06bSubjectOf(w,a)&&!v06bSubjectOf(w,b)&&!v06bBetween(w,a,b)&&!allianceBetween(w,a,b)&&!warOfNation(w,a)&&!warOfNation(w,b)&&allianceCount(w,a)<ALLIANCE_LIMIT&&allianceCount(w,b)<ALLIANCE_LIMIT&&relationOf(w,a,b)>=38&&!allianceOffer(w,a,b)&&!allianceOffer(w,b,a);
 case 'ACCEPT_ALLIANCE':return Boolean(!v06bSubjectOf(w,a)&&!v06bSubjectOf(w,b)&&!v06bBetween(w,a,b)&&allianceOffer(w,b,a)&&!allianceBetween(w,a,b)&&!warOfNation(w,a)&&!warOfNation(w,b)&&allianceCount(w,a)<ALLIANCE_LIMIT&&allianceCount(w,b)<ALLIANCE_LIMIT);
 case 'REJECT_ALLIANCE':return Boolean(allianceOffer(w,b,a));
 case 'END_ALLIANCE':return Boolean(allianceBetween(w,a,b));
 default:return false;
 }
}
function executeAllianceAction(w,id,act){
 if(!allianceActionLegal(w,id,act))return {ok:false,reason:'동맹/외교 조건 미충족'};
 const d=w.diplomacy,a=id,b=act.targetNationId;
 if(act.type==='IMPROVE_RELATIONS'){
   adjustRelation(w,a,b,8);d.courtCooldowns[a+':'+b]=w.dayIndex+2*DAYS_PER_QUARTER;
   event(w,`${w.nations[a].name}이(가) ${w.nations[b].name}과 친선 교섭을 진행했습니다.`,'diplomacy');
 }else if(act.type==='OFFER_ALLIANCE'){
   d.offers.push({from:a,to:b,dayIndex:w.dayIndex,expiresDay:w.dayIndex+2*DAYS_PER_QUARTER});
   event(w,`${w.nations[a].name}이(가) ${w.nations[b].name}에 군사 동맹을 제안했습니다.`,'diplomacy');
 }else if(act.type==='ACCEPT_ALLIANCE'){
   d.offers=d.offers.filter(x=>!(x.from===b&&x.to===a));
   d.alliances.push({a:Math.min(a,b),b:Math.max(a,b),formedDay:w.dayIndex,endsDay:w.dayIndex+ALLIANCE_TERM});
   e5InvalidateRelations(w);
   e5AppendHistory(w,'ALLIANCE_START',a,b,{formedDay:w.dayIndex});
   v06aRememberBoth(w,a,b,'ALLIANCE_START',{trust:7,favor:2});
   adjustRelation(w,a,b,8);event(w,`${w.nations[a].name}과 ${w.nations[b].name}이(가) 상호 방위 동맹을 체결했습니다.`,'diplomacy');
 }else if(act.type==='REJECT_ALLIANCE'){
   d.offers=d.offers.filter(x=>!(x.from===b&&x.to===a));adjustRelation(w,a,b,-2);
   event(w,`${w.nations[a].name}이(가) ${w.nations[b].name}의 동맹 제안을 거절했습니다.`,'diplomacy');
 }else if(act.type==='END_ALLIANCE'){
   e5EndAlliance(w,allianceBetween(w,a,b),'VOLUNTARY',a);
   repatriateAfterAllianceEnds(w,a,b);
   adjustRelation(w,a,b,-9);event(w,`${w.nations[a].name}이(가) ${w.nations[b].name}과 동맹을 해제했습니다.`,'diplomacy');
 }
 w.changeSeq++;return {ok:true};
}
function requestDefensiveSupport(w,war){
 const b=war.defenderId;
 for(const treaty of w.diplomacy.alliances){
   const id=treaty.a===b?treaty.b:treaty.b===b?treaty.a:null;
   if(id===null||treaty.endsDay<=w.dayIndex||!w.nations[id]?.active||warSide(war,id)||!c2CanJoinWar(w,id,war.sides?.defenders||[war.defenderId],war.sides?.attackers||[war.attackerId])||allianceBetween(w,id,war.attackerId)||v06bBetween(w,id,war.attackerId))continue;
   w.diplomacy.calls.push({warId:war.id,defenderId:b,principalId:b,side:'defenders',allyId:id,status:'PENDING',dayIndex:w.dayIndex,expiresDay:w.dayIndex+2*DAYS_PER_QUARTER});
   event(w,`${w.nations[b].name}이(가) 동맹국 ${w.nations[id].name}에 방어 참전을 요청했습니다.`,'diplomacy');
  }
 // V0.6B: suzerain protects a subject without fabricating a military alliance.
 for(const t of v06bTreaties(w))if(t.subjectId===b){
   const id=t.overlordId;
   if(!w.nations[id]?.active||warSide(war,id)||!c2CanJoinWar(w,id,war.sides?.defenders||[war.defenderId],war.sides?.attackers||[war.attackerId])||
      allianceBetween(w,id,war.attackerId)||v06bBetween(w,id,war.attackerId)||
      w.diplomacy.calls.some(c=>c.warId===war.id&&c.allyId===id&&c.status==='PENDING'))continue;
   w.diplomacy.calls.push({warId:war.id,defenderId:b,principalId:b,side:'defenders',allyId:id,basis:'SUZERAIN',status:'PENDING',dayIndex:w.dayIndex,expiresDay:w.dayIndex+2*DAYS_PER_QUARTER});
   event(w,`${w.nations[b].name}이(가) 종주국 ${w.nations[id].name}에 보호 참전을 요청했습니다.`,'diplomacy');
 }
}
function requestOffensiveSupport(w,war){
 const a=war.attackerId;
 for(const treaty of w.diplomacy.alliances){
  const id=treaty.a===a?treaty.b:treaty.b===a?treaty.a:null;
  if(id===null||treaty.endsDay<=w.dayIndex||!w.nations[id]?.active||v06bSubjectOf(w,id)||warSide(war,id)||!c2CanJoinWar(w,id,war.sides?.attackers||[war.attackerId],war.sides?.defenders||[war.defenderId])||allianceBetween(w,id,war.defenderId)||v06bBetween(w,id,war.defenderId))continue;
  w.diplomacy.calls.push({warId:war.id,principalId:a,side:'attackers',allyId:id,status:'PENDING',dayIndex:w.dayIndex,expiresDay:w.dayIndex+2*DAYS_PER_QUARTER});
  event(w,`${w.nations[a].name}이(가) ${w.nations[id].name}에 공격 지원을 요청했습니다.`,'diplomacy');
 }
}
function defensiveCall(w,warId,allyId){return w.diplomacy.calls.find(x=>x.warId===warId&&x.allyId===allyId&&x.status==='PENDING'&&x.expiresDay>w.dayIndex)||null;}
function callResponseLegal(w,id,act){
 const call=defensiveCall(w,act.warId,id),war=w.wars.find(x=>x.id===act.warId);
 return Boolean(typeof act.accept==='boolean'&&call&&war&&(call.side||'defenders')==='defenders'&&war.defenderId===call.defenderId&&w.nations[id]?.active&&!warSide(war,id)&&c2CanJoinWar(w,id,war.sides?.defenders||[war.defenderId],war.sides?.attackers||[war.attackerId])&&(allianceBetween(w,id,war.defenderId)||v06bSubjectOf(w,war.defenderId)?.overlordId===id)&&!warSupportTreatyConflict(w,id,war,'defenders'));
}
function resolveDefenseCall(w,id,act){
 if(!callResponseLegal(w,id,act))return {ok:false,reason:'방어 요청의 유효 조건 미충족'};
 const call=defensiveCall(w,act.warId,id),war=w.wars.find(x=>x.id===act.warId),def=war.defenderId;
 call.status=act.accept?'ACCEPTED':'DECLINED';call.resolvedDay=w.dayIndex;
 if(call.basis==='SUZERAIN'){
   const treaty=v06bBetween(w,def,id);
   if(treaty){c2TreatyInit(w,treaty);if(act.accept)treaty.protectionHelp++;else treaty.protectionFailures++;}
 }
 if(act.accept){
   war.sides??={attackers:[war.attackerId],defenders:[war.defenderId]};war.sides.defenders.push(id);
   war.fatigue[id]=0;war.lastCasualties[id]=0;
   for(const c of w.diplomacy.calls)if(c.warId===war.id&&c.allyId===id&&c.status==='PENDING')c.status='EXPIRED';
   v06aRemember(w,def,id,'DEFENSE_HELP',{trust:6,favor:6});
   v06aRemember(w,id,def,'DEFENSE_HELP',{trust:4,favor:3});
   event(w,`${w.nations[id].name}이(가) ${w.nations[def].name} 방어전에 참전했습니다.`,'war');
 }else{
   adjustRelation(w,id,def,-12);v06aRemember(w,def,id,'DEFENSE_REFUSED',{trust:-10,grievance:6});event(w,`${w.nations[id].name}이(가) ${w.nations[def].name}의 방어 참전 요청을 거절했습니다.`,'diplomacy');
 }
 w.changeSeq++;return {ok:true,warId:war.id,joined:!!act.accept};
}
function offensiveCall(w,warId,allyId){return w.diplomacy.calls.find(c=>c.warId===warId&&c.allyId===allyId&&c.side==='attackers'&&c.status==='PENDING'&&c.expiresDay>w.dayIndex)||null;}
function warSupportTreatyConflict(w,id,war,side){
 const foes=side==='attackers'?(war.sides?.defenders||[war.defenderId]):(war.sides?.attackers||[war.attackerId]);
 return foes.some(foe=>allianceBetween(w,id,foe)||v06bBetween(w,id,foe)||(w.nations[id].truces?.[foe]||0)>w.dayIndex||(w.nations[foe].truces?.[id]||0)>w.dayIndex);
}
function offensiveCallLegal(w,id,act){
 const call=offensiveCall(w,act.warId,id),war=w.wars.find(x=>x.id===act.warId);
 return Boolean(typeof act.accept==='boolean'&&call&&war&&call.principalId===war.attackerId&&w.nations[id]?.active&&!warSide(war,id)&&c2CanJoinWar(w,id,war.sides?.attackers||[war.attackerId],war.sides?.defenders||[war.defenderId])&&allianceBetween(w,id,war.attackerId)&&!allianceBetween(w,id,war.defenderId)&&!warSupportTreatyConflict(w,id,war,'attackers'));
}
function resolveOffensiveCall(w,id,act){
 if(!offensiveCallLegal(w,id,act))return {ok:false,reason:'공격 참전 요청 유효 조건 미충족'};
 const call=offensiveCall(w,act.warId,id),war=w.wars.find(x=>x.id===act.warId);
 call.status=act.accept?'ACCEPTED':'DECLINED';call.resolvedDay=w.dayIndex;
 if(act.accept){
  war.sides??={attackers:[war.attackerId],defenders:[war.defenderId]};war.sides.attackers.push(id);
  war.fatigue[id]=0;war.lastCasualties[id]=0;
  // Once recruited to either side, unresolved competing requests are invalid.
  for(const c of w.diplomacy.calls)if(c.warId===war.id&&c.allyId===id&&c.status==='PENDING')c.status='EXPIRED';
  v06aRemember(w,war.attackerId,id,'OFFENSE_HELP',{trust:4,favor:7});
  v06aRemember(w,id,war.attackerId,'OFFENSE_HELP',{trust:2});
  event(w,`${w.nations[id].name}이(가) ${w.nations[war.attackerId].name}의 공격전에 참전했습니다.`,'war');
 }else event(w,`${w.nations[id].name}이(가) 공격 지원 요청을 거절했습니다.`,'diplomacy');
 w.changeSeq++;return {ok:true,warId:war.id,joined:!!act.accept};
}
function aiOffensiveCallDecision(w,call,prospectiveWar=null){
 const war=prospectiveWar||w.wars.find(v=>v.id===call.warId);if(!war)return false;
 const n=w.nations[call.allyId],ally=w.nations[war.attackerId],foe=w.nations[war.defenderId];
 const p=w.aiProfiles[n.aiProfileId],own=nationManpower(w,n.id),enemy=nationManpower(w,foe.id);
 const borders=quarterBorderPairs(w);
 const access=borders.has(pairKey(n.id,ally.id))||borders.has(pairKey(n.id,foe.id));
 const fiscal=strategicReport(w,n.id)?.financial;
 const confidence=(p?.diplomacy?.cooperation??50)*.22+(p?.military?.aggression??50)*.30+
  relationOf(w,n.id,ally.id)*.34-relationOf(w,n.id,foe.id)*.17+
  v06aAttackWeight(w,n.id,ally.id,foe.id)+
  Math.min(14,own/Math.max(30,enemy)*12)-(fiscal?.balance<0?16:0);
 return access&&own>=12&&n.gold>=Math.max(90,militaryUpkeep(w,n.id)*2)&&confidence>=43;
}
function aiCallDecision(w,call,prospectiveWar=null){
 const war=prospectiveWar||w.wars.find(v=>v.id===call.warId);if(!war)return false;
 const n=w.nations[call.allyId],foe=w.nations[war.attackerId],p=w.aiProfiles[n.aiProfileId];
 const ally=w.nations[call.defenderId];
 const own=nationManpower(w,n.id),enemy=nationManpower(w,foe.id);
 const dist=Math.abs(w.tiles[n.capitalId].x-w.tiles[ally.capitalId].x)+Math.abs(w.tiles[n.capitalId].y-w.tiles[ally.capitalId].y);
 // Only actually reachable LAND defenders may volunteer in E1. E2 expands coalition transport.
 const connected=w.tiles.some(t=>t.ownerId===n.id&&neighbors4(t.id,w.size,w.height).some(x=>w.tiles[x].ownerId===ally.id));
 const fiscal=strategicReport(w,n.id)?.financial;
 const confidence=(p?.diplomacy?.cooperation??50)*.33+relationOf(w,n.id,ally.id)*.37+
   (p?.military?.defensivePreference??50)*.19+v06aDefenseWeight(w,n.id,ally.id)+Math.min(18,own/Math.max(30,enemy)*12)-(dist>45?22:0)-(fiscal?.balance<0?15:0);
 return connected&&own>=12&&n.gold>=Math.max(60,militaryUpkeep(w,n.id))&&confidence>=37;
}
/** E1C: anticipated diplomatic backlash if A and B form a new alliance.
 * Weigh actual friendly relations, not hostility toward unrelated countries.
 * This is used only in quarterly candidate ranking/acceptance, not the daily SIM. */
function allianceBacklashCost(w,a,b){
  let cost=0;
  for(const c of w.nations){
    if(!c.active||c.id===a||c.id===b)continue;
    const penaltyA=-thirdPartyAlliancePenalty(w,c.id,b);
    const penaltyB=-thirdPartyAlliancePenalty(w,c.id,a);
    cost+=penaltyA*Math.max(0,rawRelationOf(w,a,c.id)-10)/90;
    cost+=penaltyB*Math.max(0,rawRelationOf(w,b,c.id)-10)/90;
  }
  return cost;
}
function allianceBacklashWeight(w,a,b){
  const p=w.aiProfiles[w.nations[a].aiProfileId]?.diplomacy||{};
  const q=w.aiProfiles[w.nations[b].aiProfileId]?.diplomacy||{};
  return .55+((p.cooperation??50)+(q.cooperation??50)+(p.compromise??50)+(q.compromise??50))/400;
}
function allianceCandidateScore(w,a,b,frontiers){
  const p=w.aiProfiles[w.nations[a].aiProfileId]?.diplomacy||{};
  const q=w.aiProfiles[w.nations[b].aiProfileId]?.diplomacy||{};
  return relationOf(w,a,b)+v06aAllianceWeight(w,a,b)+v06aAllianceWeight(w,b,a)*.35+((p.cooperation??50)+(q.cooperation??50))*.20-
    (frontiers.has(pairKey(a,b))?0:30)-allianceBacklashCost(w,a,b)*allianceBacklashWeight(w,a,b);
}
function runAllianceQuarter(w,execute,frontiers=quarterBorderPairs(w)){
 const d=w.diplomacy;
 d.offers=d.offers.filter(x=>x.expiresDay>w.dayIndex&&w.nations[x.from]?.active&&w.nations[x.to]?.active);
 d.calls=d.calls.filter(x=>w.dayIndex-x.dayIndex<10*DAYS_PER_YEAR);
 for(const t of d.alliances.slice()){
   if(!w.nations[t.a]?.active||!w.nations[t.b]?.active){e5EndAlliance(w,t,'NATION_FALL');continue;}
   if(t.endsDay<=w.dayIndex+DAYS_PER_QUARTER){
     const decision=e5aRenewalDecision(w,t);
     if(decision.ok){
       // A renewal extends the scheduled end; the first signing date remains
       // unchanged for continuous trust and betrayal eligibility.
       t.endsDay=Math.max(t.endsDay,w.dayIndex)+ALLIANCE_TERM;
       e5InvalidateRelations(w);
       e5AppendHistory(w,'ALLIANCE_RENEW',t.a,t.b,{formedDay:t.formedDay,renewalRelation:decision.relation,renewalCooperation:decision.cooperation});
       v06aRememberBoth(w,t.a,t.b,'ALLIANCE_RENEW',{trust:5,favor:2,betrayalConcern:-3});
       event(w,`${w.nations[t.a].name}·${w.nations[t.b].name} 동맹 갱신`,'diplomacy');
     }else if(t.endsDay<=w.dayIndex){
       e5EndAlliance(w,t,'EXPIRED');
       // Attach bounded diagnostic fields to the existing END event; no new
       // log array or per-day scans. This explains non-renewals in long runs.
       Object.assign(d.history[d.history.length-1],{renewalBlocker:decision.reason,renewalRelation:decision.relation,renewalCooperation:decision.cooperation});
       repatriateAfterAllianceEnds(w,t.a,t.b);
       event(w,`${w.nations[t.a].name}·${w.nations[t.b].name} 동맹 기간 만료`,'diplomacy');
     }
   }
 }
 for(const call of d.calls.filter(c=>c.status==='PENDING')){
   const war=w.wars.find(x=>x.id===call.warId);
   const side=call.side||'defenders',principal=side==='attackers'?war?.attackerId:war?.defenderId;
   if(!war||!(allianceBetween(w,call.allyId,principal)||(side==='defenders'&&v06bSubjectOf(w,principal)?.overlordId===call.allyId))||!c2CanJoinWar(w,call.allyId,side==='attackers'?war.sides.attackers:war.sides.defenders,side==='attackers'?war.sides.defenders:war.sides.attackers)){call.status='EXPIRED';continue;}
   if(call.expiresDay<=w.dayIndex){call.status='EXPIRED';continue;}
   if(w.nations[call.allyId].controller==='AI')execute(w,call.allyId,{type:side==='attackers'?'RESPOND_ATTACK_CALL':'RESPOND_DEFENSE_CALL',warId:war.id,accept:side==='attackers'?aiOffensiveCallDecision(w,call):call.basis==='SUZERAIN'?v06bSuzerainDefenseDecision(w,call):aiCallDecision(w,call)});
 }
 // Work only on the small nation-pair set once each quarter; no daily AI scans.
 for(const n of w.nations){
   if(!n.active||n.controller!=='AI'||v06bSubjectOf(w,n.id)||warOfNation(w,n.id)||allianceCount(w,n.id)>=ALLIANCE_LIMIT)continue;
   const p=w.aiProfiles[n.aiProfileId],co=p?.diplomacy?.cooperation??50;
   const candidates=w.nations.filter(other=>other.active&&other.id!==n.id&&!warOfNation(w,other.id)&&!allianceBetween(w,n.id,other.id)&&!v06bSubjectOf(w,n.id)&&!v06bSubjectOf(w,other.id)&&allianceCount(w,other.id)<ALLIANCE_LIMIT&&
        !occupiedHistoricCapital(w,n.id,other.id)&&!occupiedHistoricCapital(w,other.id,n.id));
   candidates.sort((a,b)=>{
     const sa=allianceCandidateScore(w,n.id,a.id,frontiers);
     const sb=allianceCandidateScore(w,n.id,b.id,frontiers);
     return sb-sa||a.id-b.id;
   });
   const candidate=candidates.find(o=>frontiers.has(pairKey(n.id,o.id)));if(!candidate||co<35)continue;
   const offer=allianceOffer(w,candidate.id,n.id);
   if(offer){
     if(relationOf(w,n.id,candidate.id)>=30&&allianceCandidateScore(w,n.id,candidate.id,frontiers)>=29&&
       (co+(w.aiProfiles[candidate.aiProfileId]?.diplomacy?.cooperation??50))>=95)
       execute(w,n.id,{type:'ACCEPT_ALLIANCE',targetNationId:candidate.id});
     else execute(w,n.id,{type:'REJECT_ALLIANCE',targetNationId:candidate.id});
   }else if(relationOf(w,n.id,candidate.id)>=38&&allianceCandidateScore(w,n.id,candidate.id,frontiers)>=37){execute(w,n.id,{type:'OFFER_ALLIANCE',targetNationId:candidate.id});}
   else execute(w,n.id,{type:'IMPROVE_RELATIONS',targetNationId:candidate.id});
 }
}
// --- src/sim/suzerainty.js ---
/** V0.6B3 · One-level suzerainty. Independent nation economy/army/tiles remain unchanged.
 * Treaties are separate from bilateral military alliances. All transfers conserve Gold.
 */
const V06B_TRIBUTE_RATE=.10;
const V06B_TERM=50*DAYS_PER_YEAR; // next political review; never an automatic end date
const V06B_LIMIT=2;
const V06B_OFFER_DAYS=2*DAYS_PER_QUARTER;
/** The eligible subordinate must be smaller than 120% of an average living state, capped at 15%.
 * Count all living states (including existing subjects), living-state civilian populations and
 * ALL passable world tiles, including neutral land. >= is ineligible; do not eject grown subjects.
 */
/** C4: a plausible small-state range. Both population and territory must qualify. */
const V06B3_MAX_SHARE=.20;
const V06B3_AVERAGE_MULTIPLIER=1.65;
function v06b3ScaleContext(w){
 const alive=w.nations.filter(n=>n.active).length;
 const limit=alive>0?Math.min(V06B3_MAX_SHARE,V06B3_AVERAGE_MULTIPLIER/alive):0;
 const pops=new Array(w.nations.length).fill(0),land=new Array(w.nations.length).fill(0);
 let totalPop=0,totalLand=0;
 for(const s of w.settlements){if(w.nations[s.ownerId]?.active){pops[s.ownerId]+=Math.max(0,s.population);totalPop+=Math.max(0,s.population);}}
 for(const t of w.tiles){if(t.terrain==='water')continue;totalLand++;if(t.ownerId!==null&&w.nations[t.ownerId]?.active)land[t.ownerId]++;}
 return {alive,limit,pops,land,totalPop,totalLand};
}
function v06b3SizeAssessment(w,id,ctx=null){
 const c=ctx||v06b3ScaleContext(w);
 const popShare=c.totalPop>0?c.pops[id]/c.totalPop:0;
 const landShare=c.totalLand>0?c.land[id]/c.totalLand:0;
 return {eligible:c.alive>0&&popShare<c.limit-1e-12&&landShare<c.limit-1e-12,
   popShare,landShare,limit:c.limit,alive:c.alive};
}
function v06b3EnsureDiagnostics(diag){
 const v=diag.voluntary;
 for(const k of ['choiceEvaluations','choiceApproved','choiceDeclined','suzerainEvaluations','suzerainApproved','suzerainDeclined'])v[k]??=0;
 v.choiceReasons??={};v.suzerainReasons??={};
 return diag;
}
/** Confirmed defeats are allowed to drive a political survival decision; not hypothetical hostility alone. */
function v06b3RecentDefeat(w,id){
 const horizon=12*DAYS_PER_YEAR;
 let severity=0;
 for(const h of w.warHistory||[]){
   if(!Number.isFinite(h.endedDay)||w.dayIndex-h.endedDay<0||w.dayIndex-h.endedDay>horizon||h.winnerId==null)continue;
   const sides=h.participants||{attackers:[h.attackerId],defenders:[h.defenderId]};
   const loserSide=sides.attackers.includes(h.winnerId)?sides.defenders:sides.attackers;
   if(!loserSide.includes(id))continue;
   const ageFactor=1-(w.dayIndex-h.endedDay)/(horizon*1.5);
   severity=Math.max(severity,Math.round((h.tier==='DECISIVE'?34:h.tier==='CLEAR'?25:h.tier==='LIMITED'?13:6)*ageFactor));
 }
 return severity;
}
function v06b3CredibleThreat(w,subjectId,overlordId,borders){
 let pressure=0,enemyId=null;
 const own=Math.max(1,nationManpower(w,subjectId));
 for(const enemy of w.nations){
   if(!enemy.active||enemy.id===subjectId||enemy.id===overlordId||
     !borders.has(pairKey(enemy.id,subjectId))||allianceBetween(w,enemy.id,subjectId))continue;
   const relation=relationOf(w,subjectId,enemy.id);
   const perceived=v06aGet(w,subjectId,enemy.id)?.perceivedPower??0;
   const ratio=nationManpower(w,enemy.id)/own;
   if(relation>5||ratio<1.25||perceived<10)continue;
   // A credible, local military threat, never mere hypothetical dislike.
   const score=19+Math.min(15,(ratio-1.25)*9)+Math.min(10,(perceived-10)*.17)+Math.min(9,(5-relation)*.12);
   if(score>pressure){pressure=score;enemyId=enemy.id;}
 }
 return {pressure:Math.round(pressure),enemyId};
}
/** The AI must explicitly prefer giving up sovereignty over remaining independent or making alliances.
 * No random roll, no new AI-profile fields and no new decision on player orders.
 */
function v06b3SubmissionDecision(w,subjectId,overlordId,assessment=null,borders=null){
 const front=borders||quarterBorderPairs(w),s=w.nations[subjectId];
 const p=w.aiProfiles[s.aiProfileId]||{};
 const pressure=v06b3CredibleThreat(w,subjectId,overlordId,front);
 const defeat=v06b3RecentDefeat(w,subjectId);
 const alliances=allianceCount(w,subjectId);
 const ratio=assessment?.ratio??nationManpower(w,overlordId)/Math.max(1,nationManpower(w,subjectId));
 const rel=relationOf(w,subjectId,overlordId);
 const stress=s.gold<Math.max(100,militaryUpkeep(w,subjectId)*2)?7:0;
 const strategic=(rel>=55&&ratio>=2.1)?13:0;
 const sovereignty=43+(p.military?.aggression??50)*.15+(p.weights?.expansion??50)*.08+
   (p.behavior?.riskTolerance??50)*.08+Math.min(2,alliances)*12;
 const protection=17+Math.min(18,Math.max(0,ratio-1)*10)+pressure.pressure+defeat+
   (rel>=55?10:rel>=35?5:0)+stress+strategic;
 const reasons=[];
 if(!pressure.pressure&&!defeat&&!strategic)reasons.push('NO_CREDIBLE_DANGER_OR_DEFEAT');
 if(protection+1e-9<sovereignty)reasons.push(alliances?'ALLIANCE_OR_SOVEREIGNTY_PREFERRED':'SOVEREIGNTY_PREFERRED');
 return {approve:!reasons.length,reasons,protection:Math.round(protection),sovereignty:Math.round(sovereignty),
   threatId:pressure.enemyId,recentDefeat:defeat,allianceAlternatives:alliances,strategyMotivation:strategic>0};
}
/** An overlord cannot accept every qualifying offer mechanically: benefit vs protection expense. */
function v06b3SuzerainDecision(w,overlordId,subjectId){
 const o=w.nations[overlordId],s=w.nations[subjectId],p=w.aiProfiles[o.aiProfileId]||{};
 const subjects=v06bSubjectsOf(w,overlordId).length;
 const quarterlyTribute=Math.max(0,Math.floor((s.lastQuarter?.goldNet||0)*V06B_TRIBUTE_RATE));
 const ratio=nationManpower(w,overlordId)/Math.max(1,nationManpower(w,subjectId));
 const threatened=v06bThreatened(w,subjectId,overlordId);
 const relation=relationOf(w,overlordId,subjectId);
 const treasuryStrained=o.gold<Math.max(125,militaryUpkeep(w,overlordId)*2);
 const wars=warsOfNation(w,overlordId).length;
 const benefit=27+(p.diplomacy?.cooperation??50)*.33+Math.min(12,quarterlyTribute/65)+
   Math.max(0,relation)*.15+(ratio>=2.5?7:0);
 const cost=23+subjects*14+(threatened?11:0)+(ratio>5?8:ratio>3?3:0)+
   (treasuryStrained?14:0)+wars*9+(p.military?.aggression??50)*.10;
 const reasons=benefit+1e-9>=cost?[]:['PROTECTION_COST_EXCEEDS_BENEFIT'];
 return {approve:!reasons.length,reasons,benefit:Math.round(benefit),cost:Math.round(cost)};
}
function v06b3RecordDecision(w,kind,result){
 const v=v06b1Diag(w).voluntary,actor=kind==='subject'?'choice':'suzerain';
 v[actor+'Evaluations']++;
 v[actor+(result.approve?'Approved':'Declined')]++;
 if(!result.approve)for(const r of result.reasons)v[actor+'Reasons'][r]=(v[actor+'Reasons'][r]||0)+1;
}

/** Cumulative counters intentionally exclude the capped 120-entry historical event rings. */
function v06b1NewDiagnostics(sinceDay=0){
 return {sinceDay,voluntary:{evaluations:0,eligible:0,offered:0,accepted:0,rejected:0,expired:0,invalidated:0,
     reasonsFirst:{},reasonsAll:{},motives:{THREAT:0,STRATEGIC:0,BOTH:0},
     choiceEvaluations:0,choiceApproved:0,choiceDeclined:0,choiceReasons:{},
     suzerainEvaluations:0,suzerainApproved:0,suzerainDeclined:0,suzerainReasons:{}},
   forced:{evaluations:0,eligible:0,offered:0,accepted:0,rejected:0,invalidated:0,
     reasonsFirst:{},reasonsAll:{}},
   treaty:{formed:0,voluntary:0,forced:0,renewed:0,ended:0,endReasons:{}},
   tribute:{quarters:0,due:0,paid:0,unpaid:0}};
}
function v06b1Diag(w){return v06b3EnsureDiagnostics(w.diplomacy.subjectDiagnostics??(w.diplomacy.subjectDiagnostics=v06b1NewDiagnostics(w.dayIndex)));}
function v06b1IncrementReasons(stats,reasons){
 if(!reasons.length)return;
 const first=reasons[0];stats.reasonsFirst[first]=(stats.reasonsFirst[first]||0)+1;
 for(const key of reasons)stats.reasonsAll[key]=(stats.reasonsAll[key]||0)+1;
}
function v06bTreaties(w){return w.diplomacy.subjectTreaties||[];}
function v06bSubjectOf(w,id){return v06bTreaties(w).find(t=>t.subjectId===id)||null;}
function v06bSubjectsOf(w,id){return v06bTreaties(w).filter(t=>t.overlordId===id);}
function v06bBetween(w,a,b){return v06bTreaties(w).find(t=>t.overlordId===a&&t.subjectId===b||t.overlordId===b&&t.subjectId===a)||null;}
function v06bEligiblePair(w,overlordId,subjectId){
 const o=w.nations[overlordId],s=w.nations[subjectId];
 return Boolean(o?.active&&s?.active&&o.id!==s.id&&!v06bSubjectOf(w,o.id)&&!v06bSubjectOf(w,s.id)&&
   !v06bSubjectsOf(w,s.id).length&&v06bSubjectsOf(w,o.id).length<V06B_LIMIT&&
   !warOfNation(w,o.id)&&!warOfNation(w,s.id));
}
/** Force demand eligibility is pure and re-evaluated at both offer and acceptance. */
function v06b1ForceAssessment(w,war,terms){
 const fail=[];
 if(!war||terms?.tier!=='DECISIVE'||terms.winnerId==null||terms.loserId==null){
   return {eligible:false,reasons:['NOT_DECISIVE']};
 }
 const winner=w.nations[terms.winnerId],loser=w.nations[terms.loserId];
 const side=warSide(war,terms.winnerId);
 if(!side||side===warSide(war,terms.loserId)||
    ![war.attackerId,war.defenderId].includes(terms.winnerId)||
    ![war.attackerId,war.defenderId].includes(terms.loserId))fail.push('WRONG_WAR_SIDE');
 if(!winner?.active||!loser?.active)fail.push('NATION_INACTIVE');
 // A subordinate cannot be formed after peace if either principal remains in another war.
 // Reject the term BEFORE quoting it, avoiding zero-reparation peace without a treaty.
 if(winner?.active&&loser?.active&&(
    warsOfNation(w,winner.id).some(v=>v.id!==war.id)||warsOfNation(w,loser.id).some(v=>v.id!==war.id)))
     fail.push('OTHER_ACTIVE_WARS');
 if(winner?.active&&loser?.active){
   if(v06bSubjectOf(w,winner.id)||v06bSubjectOf(w,loser.id)||v06bSubjectsOf(w,loser.id).length||
       v06bSubjectsOf(w,winner.id).length>=V06B_LIMIT)fail.push('SUBJECT_LIMIT_OR_CHAIN');
   if(!v06b3SizeAssessment(w,loser.id).eligible)fail.push('NATION_TOO_LARGE');
   const capital=w.tiles[loser.capitalId];
   const captures=w.tiles.filter(t=>t.ownerId===loser.id&&t.occupiedWarId===war.id&&
     t.occupiedBy!=null&&warSide(war,t.occupiedBy)===side);
   const captureCores=w.settlements.filter(s=>s.ownerId===loser.id&&captures.some(t=>t.id===s.coreTileId)).length;
   const loserCores=w.settlements.filter(s=>s.ownerId===loser.id).length;
   const capitalControlled=capital?.ownerId===loser.id&&capital.occupiedBy!=null&&
     warSide(war,capital.occupiedBy)===side&&capital.occupiedWarId===war.id;
   // Only a decisive victory with documented effective occupation may impose vassalage.
   // Allied capture counts; otherwise a meaningful fraction of real settlement cores is required.
   if(!capitalControlled&&!(captureCores>=2&&captureCores/Math.max(1,loserCores)>=.4))
     fail.push('INSUFFICIENT_CAPITAL_OR_CORE_CONTROL');
 }
 if(side){
   const contribution=coalitionContributionShares(w,war,side)[terms.winnerId]||0;
   if(contribution+1e-9<.48)fail.push('LEADER_CONTRIBUTION_BELOW_48');
 }
 return {eligible:fail.length===0,reasons:fail};
}
function v06bForceEligible(w,war,terms){return v06b1ForceAssessment(w,war,terms).eligible;}
function v06bThreatened(w,subjectId,overlordId,borders=null){
 const fronts=borders||quarterBorderPairs(w);
 return w.nations.some(n=>n.active&&n.id!==subjectId&&n.id!==overlordId&&
   fronts.has(pairKey(n.id,subjectId))&&!allianceBetween(w,n.id,subjectId)&&
   (v06aGet(w,subjectId,n.id)?.perceivedPower??0)>=15&&relationOf(w,subjectId,n.id)<=0);
}
/** Stable diagnostic order; ALL failed predicates remain visible, not just first rejection. */
function v06b1VoluntaryAssessment(w,subjectId,overlordId,borders=null,scale=null){
 const fail=[],fronts=borders||quarterBorderPairs(w);
 const s=w.nations[subjectId],o=w.nations[overlordId];
 if(!v06bEligiblePair(w,overlordId,subjectId))fail.push('BASIC_STATE_OR_TREATY');
 if(!v06b3SizeAssessment(w,subjectId,scale).eligible)fail.push('NATION_TOO_LARGE');
 if(!fronts.has(pairKey(subjectId,overlordId)))fail.push('NO_BORDER');
 if(relationOf(w,subjectId,overlordId)<25)fail.push('RELATION_BELOW_25');
 const perceived=v06aGet(w,subjectId,overlordId)?.perceivedPower??0;
 if(perceived<12)fail.push('PERCEPTION_BELOW_12');
 const ratio=nationManpower(w,overlordId)/Math.max(1,nationManpower(w,subjectId));
 if(ratio<1.4)fail.push('MILITARY_BELOW_1_4');
 const threatened=v06bThreatened(w,subjectId,overlordId,fronts);
 const strategic=perceived>=38&&ratio>=2.0&&relationOf(w,subjectId,overlordId)>=50;
 if(!threatened&&!strategic)fail.push('NO_PROTECTION_MOTIVE');
 if(w.dayIndex<(w.diplomacy.subjectCooldowns?.[pairKey(subjectId,overlordId)]||0))fail.push('COOLDOWN');
 return {eligible:!fail.length,reasons:fail,motive:threatened&&strategic?'BOTH':threatened?'THREAT':strategic?'STRATEGIC':null,
   ratio,perceived};
}
function v06bVoluntaryEligible(w,subjectId,overlordId){return v06b1VoluntaryAssessment(w,subjectId,overlordId).eligible;}
function v06b1RecordVoluntaryAssessment(w,result){
 const d=v06b1Diag(w).voluntary;d.evaluations++;
 if(result.eligible){d.eligible++;d.motives[result.motive]++;}
 else v06b1IncrementReasons(d,result.reasons);
}
function v06b1RecordForceAssessment(w,result){
 const d=v06b1Diag(w).forced;d.evaluations++;
 if(result.eligible)d.eligible++;
 else v06b1IncrementReasons(d,result.reasons);
}
function v06bOffer(w,from,to,kind){return (w.diplomacy.subjectOffers||[]).find(o=>o.from===from&&o.to===to&&o.kind===kind&&o.expiresDay>w.dayIndex)||null;}
function v06bLog(w,kind,overlordId,subjectId,extra={}){
 const h=w.diplomacy.subjectHistory??=[];
 h.push({dayIndex:w.dayIndex,kind,overlordId,subjectId,...extra});if(h.length>120)h.shift();
}
function v06bCreateTreaty(w,overlordId,subjectId,origin,warId=null){
 if(!v06bEligiblePair(w,overlordId,subjectId)||!v06b3SizeAssessment(w,subjectId).eligible)return null;
 // A subject cannot simultaneously owe independent third-party defense commitments.
 for(const t of w.diplomacy.alliances.slice())if(t.a===subjectId||t.b===subjectId){
   const other=t.a===subjectId?t.b:t.a;
   e5EndAlliance(w,t,'SUZERAINTY');repatriateAfterAllianceEnds(w,subjectId,other);
 }
 const d=w.diplomacy;
 d.offers=d.offers.filter(x=>x.from!==subjectId&&x.to!==subjectId);
 d.subjectOffers=d.subjectOffers.filter(o=>o.from!==subjectId&&o.to!==subjectId&&o.from!==overlordId&&o.to!==overlordId);
 const treaty={overlordId,subjectId,origin,warId,formedDay:w.dayIndex,endsDay:w.dayIndex+V06B_TERM,
   rate:V06B_TRIBUTE_RATE,lastPaidDay:null,lastDue:0,lastPaid:0,lastUnpaid:0,totalDue:0,totalPaid:0};
 c2TreatyInit(w,treaty);d.subjectTreaties.push(treaty);
 const stats=v06b1Diag(w).treaty;stats.formed++;stats[origin==='FORCED'?'forced':'voluntary']++;
 v06bLog(w,'SUBJECT_START',overlordId,subjectId,{origin,warId});
 event(w,`${w.nations[subjectId].name}이(가) ${w.nations[overlordId].name}의 종속국이 되었습니다. (${origin==='FORCED'?'전쟁 복속':'자발적 보호'})`,'diplomacy');
 recordHistoricalEvent(w,'diplomacy',w.events[w.events.length-1].text,[overlordId,subjectId]);
 w.changeSeq++;return treaty;
}
function v06bEndTreaty(w,t,reason){
 const d=w.diplomacy;
 if(!d.subjectTreaties.includes(t))return false;
 d.subjectTreaties=d.subjectTreaties.filter(x=>x!==t);
 const stats=v06b1Diag(w).treaty;stats.ended++;stats.endReasons[reason]=(stats.endReasons[reason]||0)+1;
 d.subjectOffers=d.subjectOffers.filter(o=>o.from!==t.subjectId&&o.to!==t.subjectId);
 c2CleanupNation(w,t.subjectId);
 d.subjectCooldowns[pairKey(t.overlordId,t.subjectId)]=w.dayIndex+5*DAYS_PER_YEAR;
 v06bLog(w,'SUBJECT_END',t.overlordId,t.subjectId,{reason});
 event(w,`${w.nations[t.subjectId].name}과 ${w.nations[t.overlordId].name}의 종속 관계가 종료됐습니다. (${reason})`,'diplomacy');
 recordHistoricalEvent(w,'diplomacy',w.events[w.events.length-1].text,[t.overlordId,t.subjectId]);
 w.changeSeq++;return true;
}
function v06bActionLegal(w,id,act){
 if(!w.nations[id]?.active||!Number.isInteger(act.targetNationId)||!w.nations[act.targetNationId]?.active)return false;
 const other=act.targetNationId;
 if(act.type==='OFFER_SUBMISSION')return v06bVoluntaryEligible(w,id,other)&&!v06bOffer(w,id,other,'SUBMIT')&&
   !(w.diplomacy.subjectOffers||[]).some(o=>o.from===id&&o.kind==='SUBMIT'&&o.expiresDay>w.dayIndex);
 if(act.type==='ACCEPT_SUBMISSION')return !!v06bOffer(w,other,id,'SUBMIT')&&v06bVoluntaryEligible(w,other,id);
 if(act.type==='REJECT_SUBMISSION')return !!v06bOffer(w,other,id,'SUBMIT');
 const treaty=v06bBetween(w,id,other);
 if(act.type==='OFFER_RELEASE')return !!treaty&&treaty.status!=='REBELLION'&&w.dayIndex>=treaty.formedDay+5*DAYS_PER_YEAR&&!v06bOffer(w,id,other,'RELEASE')&&w.dayIndex>=(treaty.nextDemandDay||0);
 if(act.type==='ACCEPT_RELEASE'||act.type==='REJECT_RELEASE')return !!treaty&&treaty.status!=='REBELLION'&&!!v06bOffer(w,other,id,'RELEASE');
 return false;
}
function v06bExecuteAction(w,id,act){
 if(!v06bActionLegal(w,id,act))return {ok:false,reason:'종속 관계 제안·응답 조건 불충족'};
 const d=w.diplomacy,other=act.targetNationId;
 if(act.type==='OFFER_SUBMISSION'||act.type==='OFFER_RELEASE'){
   const kind=act.type==='OFFER_SUBMISSION'?'SUBMIT':'RELEASE';
   d.subjectOffers.push({from:id,to:other,kind,dayIndex:w.dayIndex,expiresDay:w.dayIndex+V06B_OFFER_DAYS});
   if(kind==='RELEASE'){const treaty=v06bBetween(w,id,other);if(treaty&&treaty.subjectId===id){treaty.lastDemandDay=w.dayIndex;treaty.nextDemandDay=w.dayIndex+C2_DEMAND_COOLDOWN;c2IndependenceData(w).independenceStats.demands++;}}
   if(kind==='SUBMIT')v06b1Diag(w).voluntary.offered++;
   event(w,`${w.nations[id].name}이(가) ${w.nations[other].name}에 ${kind==='SUBMIT'?'보호·종속':'종속 해제'}를 제안했습니다.`,'diplomacy');
 }else if(act.type==='ACCEPT_SUBMISSION'){
   d.subjectOffers=d.subjectOffers.filter(o=>!(o.from===other&&o.to===id&&o.kind==='SUBMIT'));
   const treaty=v06bCreateTreaty(w,id,other,'VOLUNTARY');
   v06b1Diag(w).voluntary[treaty?'accepted':'invalidated']++;return {ok:!!treaty};
 }else if(act.type==='REJECT_SUBMISSION'){
   d.subjectOffers=d.subjectOffers.filter(o=>!(o.from===other&&o.to===id&&o.kind==='SUBMIT'));
   d.subjectCooldowns[pairKey(id,other)]=w.dayIndex+2*DAYS_PER_YEAR;
   v06b1Diag(w).voluntary.rejected++;
   event(w,`${w.nations[id].name}이(가) 종속 제안을 거절했습니다.`,'diplomacy');
 }else if(act.type==='ACCEPT_RELEASE'){
   d.subjectOffers=d.subjectOffers.filter(o=>!(o.from===other&&o.to===id&&o.kind==='RELEASE'));
   c2IndependenceData(w).independenceStats.accepted++;
   return {ok:v06bEndTreaty(w,v06bBetween(w,id,other),'MUTUAL_RELEASE')};
 }else if(act.type==='REJECT_RELEASE'){
   d.subjectOffers=d.subjectOffers.filter(o=>!(o.from===other&&o.to===id&&o.kind==='RELEASE'));
   const treaty=v06bBetween(w,id,other);if(treaty&&treaty.subjectId===other){treaty.lastRejectedDay=w.dayIndex;treaty.rejectedDemands=(treaty.rejectedDemands||0)+1;treaty.independencePressure=Math.min(100,treaty.independencePressure+8);c2IndependenceData(w).independenceStats.rejected++;}
   event(w,`${w.nations[id].name}이(가) 종속 해제를 거절했습니다.`,'diplomacy');
 }
 w.changeSeq++;return {ok:true};
}
/** Called AFTER real production, trade, payroll and civilian upkeep; before AI investment.
 * The economic ledger remains a PRE-tribute statement, and tribute is separately audited.
 */
function v06bPayTributeQuarter(w){
 const d=w.diplomacy;const entries=[];
 for(const t of v06bTreaties(w)){
   if(t.lastPaidDay===w.dayIndex||!w.nations[t.overlordId]?.active||!w.nations[t.subjectId]?.active)continue;
   const o=w.nations[t.overlordId],s=w.nations[t.subjectId];
   if(t.status==='REBELLION')continue;
   const net=Math.max(0,Math.floor(s.lastQuarter?.goldNet||0));
   const due=Math.floor(net*t.rate),paid=Math.min(due,Math.max(0,s.gold));
   s.gold-=paid;o.gold+=paid;
   t.lastPaidDay=w.dayIndex;t.lastDue=due;t.lastPaid=paid;t.lastUnpaid=due-paid;t.totalDue+=due;t.totalPaid+=paid;
   entries.push({dayIndex:w.dayIndex,overlordId:o.id,subjectId:s.id,due,paid,unpaid:due-paid});
   if(paid||due)v06bLog(w,'TRIBUTE',o.id,s.id,{due,paid,unpaid:due-paid});
 }
 if(entries.length){const stats=v06b1Diag(w).tribute;for(const e of entries){stats.quarters++;stats.due+=e.due;stats.paid+=e.paid;stats.unpaid+=e.unpaid;}}
 d.tributeHistory.push(...entries);
 if(d.tributeHistory.length>120)d.tributeHistory.splice(0,d.tributeHistory.length-120);
 if(entries.length)w.changeSeq++;
}
/** Prefer fulfilling actual protection obligations; not a guarantee when the suzerain is broke or unarmed. */
function v06bSuzerainDefenseDecision(w,call,prospectiveWar=null){
 const war=prospectiveWar||w.wars.find(v=>v.id===call.warId),overlord=w.nations[call.allyId];
 if(!war||!overlord?.active||v06bSubjectOf(w,war.defenderId)?.overlordId!==overlord.id)return false;
 return nationManpower(w,overlord.id)>=12&&overlord.gold>=Math.max(45,militaryUpkeep(w,overlord.id)*.6)&&
   !warSupportTreatyConflict(w,overlord.id,war,'defenders');
}
/** Hierarchical status persists across reviews; a weak suzerain may peacefully let a stronger subject go.
 * Both AI parties must independently consent. Player nations never auto-consent.
 * Independence conflicts/rebellions are reserved for V0.6C.
 */
function v06b2WantsIndependence(w,t){
 const subject=w.nations[t.subjectId],overlord=w.nations[t.overlordId];
 return subject?.controller==='AI'&&overlord?.active&&
   nationManpower(w,subject.id)>=Math.max(1,nationManpower(w,overlord.id))*1.25&&
   relationOf(w,subject.id,overlord.id)<20&&
   !v06bThreatened(w,subject.id,overlord.id);
}
function v06b2AIReleaseConsent(w,t,responderId){
 if(!t||w.nations[responderId]?.controller!=='AI')return false;
 if(responderId===t.overlordId){
   const subjectStrength=nationManpower(w,t.subjectId),overlordStrength=nationManpower(w,t.overlordId);
   const profile=w.aiProfiles[w.nations[responderId].aiProfileId];
   return subjectStrength>=Math.max(1,overlordStrength)*1.25||
     (relationOf(w,t.subjectId,t.overlordId)>=70&&(profile?.diplomacy?.compromise??50)>=80);
 }
 // The subordinate accepts an overlord's voluntary release, but never demands it without an offer.
 return responderId===t.subjectId;
}
function v06bRunQuarter(w,execute){
 const d=w.diplomacy;
 for(const t of d.subjectTreaties.slice()){
   if(!w.nations[t.overlordId]?.active||!w.nations[t.subjectId]?.active){v06bEndTreaty(w,t,'NATION_FALL');continue;}
   if(t.status==='REBELLION'||w.dayIndex<t.endsDay)continue;
   const o=w.nations[t.overlordId],s=w.nations[t.subjectId];
   // An offer is the only peaceful route out. Failed or absent consent cannot expire the treaty.
   do{t.endsDay+=V06B_TERM;}while(t.endsDay<=w.dayIndex);
   v06b1Diag(w).treaty.renewed++;
   v06bLog(w,'SUBJECT_RENEW',o.id,s.id,{reviewYears:50,nextReviewDay:t.endsDay});
   event(w,`${o.name}·${s.name} 종속 관계 50년 재평가 · 양측 합의 해제 전까지 유지`,'diplomacy');w.changeSeq++;
 }
 for(const offer of d.subjectOffers)if(offer.kind==='SUBMIT'&&(offer.expiresDay<=w.dayIndex||!w.nations[offer.from]?.active||!w.nations[offer.to]?.active))v06b1Diag(w).voluntary.expired++;
 d.subjectOffers=d.subjectOffers.filter(o=>o.expiresDay>w.dayIndex&&w.nations[o.from]?.active&&w.nations[o.to]?.active);
 for(const offer of d.subjectOffers.slice()){
   if(w.nations[offer.to].controller!=='AI')continue;
   const p=w.aiProfiles[w.nations[offer.to].aiProfileId];
   if(offer.kind==='SUBMIT'){
     const legal=v06bActionLegal(w,offer.to,{type:'ACCEPT_SUBMISSION',targetNationId:offer.from});
     const judgment=legal?v06b3SuzerainDecision(w,offer.to,offer.from):null;
     if(judgment)v06b3RecordDecision(w,'suzerain',judgment);
     execute(w,offer.to,{type:legal&&judgment?.approve?'ACCEPT_SUBMISSION':'REJECT_SUBMISSION',targetNationId:offer.from});
   }else if(offer.kind==='RELEASE'){
     const t=v06bBetween(w,offer.from,offer.to);
     const agree=c2ReleaseConsent(w,t,offer.to);
execute(w,offer.to,{type:agree?'ACCEPT_RELEASE':'REJECT_RELEASE',targetNationId:offer.from});
   }
 }
 const quarterBorders=quarterBorderPairs(w),scale=v06b3ScaleContext(w);
 for(const n of w.nations){
   if(!n.active||n.controller!=='AI'||v06bSubjectOf(w,n.id)||v06bSubjectsOf(w,n.id).length||warOfNation(w,n.id))continue;
   const borders=quarterBorders,candidates=[];
   for(const o of w.nations){if(o.id===n.id)continue;
     const result=v06b1VoluntaryAssessment(w,n.id,o.id,borders,scale);
     v06b1RecordVoluntaryAssessment(w,result);
     if(result.eligible)candidates.push(o);
   }
   candidates.sort((a,b)=>relationOf(w,n.id,b.id)-relationOf(w,n.id,a.id)||a.id-b.id);
   // A viable treaty partner is NOT automatically worth abandoning sovereignty for.
   for(const candidate of candidates){
     const assessment=v06b1VoluntaryAssessment(w,n.id,candidate.id,borders,scale);
     const decision=v06b3SubmissionDecision(w,n.id,candidate.id,assessment,borders);
     v06b3RecordDecision(w,'subject',decision);
     if(decision.approve){execute(w,n.id,{type:'OFFER_SUBMISSION',targetNationId:candidate.id});break;}
   }
 }
}
function v06bValidate(w,fail){
 const d=w.diplomacy,ts=d.subjectTreaties;
 if(!Array.isArray(ts)||ts.length>w.nations.length||!Array.isArray(d.subjectOffers)||d.subjectOffers.length>w.nations.length*2||
   !Array.isArray(d.subjectHistory)||d.subjectHistory.length>120||!Array.isArray(d.tributeHistory)||d.tributeHistory.length>120||
   !d.subjectCooldowns||typeof d.subjectCooldowns!=='object')fail('V0.6B 외교 자료');
 const subject=new Set(),owners=new Map();
 for(const t of ts){
   if(!w.nations[t.overlordId]?.active||!w.nations[t.subjectId]?.active||t.overlordId===t.subjectId||subject.has(t.subjectId)||
     !['VOLUNTARY','FORCED'].includes(t.origin)||!Number.isSafeInteger(t.formedDay)||t.formedDay>w.dayIndex||
     !Number.isSafeInteger(t.endsDay)||t.endsDay<=t.formedDay||t.rate!==V06B_TRIBUTE_RATE||
     (t.lastPaidDay!==null&&(!Number.isSafeInteger(t.lastPaidDay)||t.lastPaidDay>w.dayIndex))||
     ['lastDue','lastPaid','lastUnpaid','totalDue','totalPaid'].some(k=>!Number.isSafeInteger(t[k])||t[k]<0)||
     t.lastPaid+t.lastUnpaid!==t.lastDue||t.totalPaid>t.totalDue)fail('V0.6B 종속 조약');
   subject.add(t.subjectId);owners.set(t.overlordId,(owners.get(t.overlordId)||0)+1);
   if(w.diplomacy.alliances.some(a=>a.a===t.subjectId||a.b===t.subjectId))fail('V0.6B 종속국 동맹 충돌');
 }
 if([...owners].some(([id,count])=>subject.has(id)||count>V06B_LIMIT))fail('V0.6B 종속 다단계·상한');
 for(const o of d.subjectOffers){
   if(!w.nations[o.from]?.active||!w.nations[o.to]?.active||o.from===o.to||!['SUBMIT','RELEASE'].includes(o.kind)||
     !Number.isSafeInteger(o.dayIndex)||o.dayIndex>w.dayIndex||!Number.isSafeInteger(o.expiresDay)||o.expiresDay<=o.dayIndex)fail('V0.6B 종속 제안');
 }
 for(const h of d.tributeHistory)if(!Number.isSafeInteger(h.dayIndex)||h.dayIndex>w.dayIndex||
   !w.nations[h.overlordId]||!w.nations[h.subjectId]||!Number.isSafeInteger(h.paid)||!Number.isSafeInteger(h.due)||
   !Number.isSafeInteger(h.unpaid)||h.paid<0||h.unpaid<0||h.due!==h.paid+h.unpaid)fail('V0.6B 조공 회계');
 for(const [key,day] of Object.entries(d.subjectCooldowns))if(!/^\d+:\d+$/.test(key)||!Number.isSafeInteger(day)||day<0)fail('V0.6B 재제안 제한');
 const diag=d.subjectDiagnostics;
 if(!diag||!Number.isSafeInteger(diag.sinceDay)||diag.sinceDay<0||diag.sinceDay>w.dayIndex)fail('V0.6B1 진단 시작일');
 for(const [name,keys] of Object.entries({voluntary:['evaluations','eligible','offered','accepted','rejected','expired','invalidated',
    'choiceEvaluations','choiceApproved','choiceDeclined','suzerainEvaluations','suzerainApproved','suzerainDeclined'],
   forced:['evaluations','eligible','offered','accepted','rejected','invalidated'],
   treaty:['formed','voluntary','forced','renewed','ended'],tribute:['quarters','due','paid','unpaid']})){
   const group=diag[name];if(!group||keys.some(k=>!Number.isSafeInteger(group[k])||group[k]<0))fail('V0.6B1 누적 '+name);
 }
 if(diag.tribute.due!==diag.tribute.paid+diag.tribute.unpaid||
   diag.treaty.formed!==diag.treaty.voluntary+diag.treaty.forced||
   diag.voluntary.choiceEvaluations!==diag.voluntary.choiceApproved+diag.voluntary.choiceDeclined||
   diag.voluntary.suzerainEvaluations!==diag.voluntary.suzerainApproved+diag.voluntary.suzerainDeclined)fail('V0.6B3 누적 보존식');
 for(const group of [diag.voluntary,diag.forced])for(const map of [group.reasonsFirst,group.reasonsAll])
   if(!map||Object.values(map).some(x=>!Number.isSafeInteger(x)||x<0))fail('V0.6B1 탈락 진단');
 if(!diag.voluntary.motives||Object.values(diag.voluntary.motives).some(x=>!Number.isSafeInteger(x)||x<0)||
   !diag.treaty.endReasons||Object.values(diag.treaty.endReasons).some(x=>!Number.isSafeInteger(x)||x<0)||
   [diag.voluntary.choiceReasons,diag.voluntary.suzerainReasons].some(m=>!m||Object.values(m).some(v=>!Number.isSafeInteger(v)||v<0)))fail('V0.6B3 세부 진단');
}
// --- src/sim/multi-war.js ---
/** V0.6C2: front assignment never duplicates soldiers or resets formation experience. */
function c2FrontPriority(w,a,war){
  const at=w.tiles[a.tileId],opponents=warOpponents(war,a.nationId);
  let distance=Infinity;
  for(const id of opponents){const capital=w.tiles[w.nations[id]?.capitalId];
    if(capital)distance=Math.min(distance,Math.abs(at.x-capital.x)+Math.abs(at.y-capital.y));}
  const defensive=warSide(war,a.nationId)==='defenders';
  const ownCap=w.tiles[w.nations[a.nationId].capitalId];
  const crisis=defensive&&ownCap&&opponents.some(id=>w.armies.some(b=>b.nationId===id&&
    Math.abs(w.tiles[b.tileId].x-ownCap.x)+Math.abs(w.tiles[b.tileId].y-ownCap.y)<8));
  const ward=defensive&&v06bSubjectOf(w,war.defenderId)?.overlordId===a.nationId;
  const wardCap=ward?w.tiles[w.nations[war.defenderId].capitalId]:null;
  const nearWard=wardCap?Math.abs(at.x-wardCap.x)+Math.abs(at.y-wardCap.y):Infinity;
  const protectorBonus=ward?24+Math.max(0,30-nearWard*1.4):0;
  return (war.kind==='INDEPENDENCE'?35:0)+(crisis?85:0)+(defensive?18:0)+protectorBonus+Math.max(0,35-distance*1.4);
}
/** C6: reuse a national legal-land component graph once per real multi-war review.
 * This is a cheap static *filter*, not a substitute for army A* orders.
 * A fort tile may be assaulted but is not a transit corridor.
 */
function c6LandComponents(w,nationId,fortNet){
  const count=w.tiles.length,open=new Uint8Array(count),labels=new Int32Array(count).fill(-1);
  for(const t of w.tiles)if(TERRAINS[t.terrain]?.passable&&canPassMilitaryTile(w,nationId,t)&&
      !fortLineBlocks(w,t.id,nationId,fortNet))open[t.id]=1;
  let nextComponent=0;
  for(let i=0;i<count;i++){
    if(!open[i]||labels[i]!==-1)continue;
    const q=[i];labels[i]=nextComponent;
    for(let k=0;k<q.length;k++){
      const id=q[k];if(hostileFortUncaptured(w,id,nationId,fortNet))continue;
      for(const nb of neighborsMilitary8(id,w.size,w.height)){
        if(!open[nb]||labels[nb]!==-1||!militaryStepPermitted(w,id,nb,nationId,fortNet))continue;
        labels[nb]=nextComponent;q.push(nb);
      }
    }
    nextComponent++;
  }
  return labels;
}
function c6WarLandAccess(w,army,war,labels){
  const component=labels[army.tileId];if(component<0)return false;
  const foes=new Set(warOpponents(war,army.nationId));
  // Restoring a friendly occupied city is a valid front objective too.
  for(const t of w.tiles)if(labels[t.id]===component&&
    (foes.has(t.ownerId)||foes.has(t.occupiedBy)))return true;
  return false;
}
function c2AssignFronts(w){
  // In the common peace state, skip both expensive per-formation war lists entirely.
  if(!w.wars.length){
    for(const a of w.armies)if(a.assignedWarId!=null){a.assignedWarId=null;delete a.c6FrontDecision;w.changeSeq++;}
    return;
  }
  // Preserve soldiers/XP. Recompute access only for armies whose 30-day front review is due.
  const committed=new Map(),warsByNation=new Map();
  const liveFor=id=>{if(!warsByNation.has(id))warsByNation.set(id,warsOfNation(w,id));return warsByNation.get(id);};
  for(const a of w.armies){
    const live=liveFor(a.nationId);
    if(!live.length){if(a.assignedWarId!=null){a.assignedWarId=null;w.changeSeq++;}if(a.c6FrontDecision)delete a.c6FrontDecision;continue;}
    if(a.engagementId!==null){const e=w.engagements.find(e=>e.id===a.engagementId);if(e)a.assignedWarId=e.warId;}
    if(a.assignedWarId!=null&&live.some(v=>v.id===a.assignedWarId)){
      const key=a.nationId+':'+a.assignedWarId;
      committed.set(key,(committed.get(key)||0)+manpower(a));
    }
  }
  let fortNet=null;
  const componentsByNation=new Map(),accessByNationArmy=new Map();
  for(const a of w.armies){
    const live=liveFor(a.nationId);
    if(!live.length||a.engagementId!==null||a.status==='SAILING'||a.status==='RETREATING'||a.status==='REGROUP')continue;
    if(a.assignedWarId!=null&&live.some(v=>v.id===a.assignedWarId)&&w.dayIndex<(a.c2NextFrontReviewDay||0))continue;
    const old=a.assignedWarId;
    if(old!=null){const key=a.nationId+':'+old;committed.set(key,Math.max(0,(committed.get(key)||0)-manpower(a)));}
    let reach=null;
    if(live.length>1){
      if(!componentsByNation.has(a.nationId)){
        fortNet??=fortificationNetwork(w);
        componentsByNation.set(a.nationId,c6LandComponents(w,a.nationId,fortNet));
      }
      const labels=componentsByNation.get(a.nationId);
      // Cache per origin tile: nearby formations share the same legal-land component.
      const cacheKey=a.nationId+':'+labels[a.tileId];
      reach=accessByNationArmy.get(cacheKey);
      if(!reach){reach=new Map();for(const war of live)reach.set(war.id,c6WarLandAccess(w,a,war,labels));accessByNationArmy.set(cacheKey,reach);}
    }
    const ranked=live.map(war=>({war,reachable:reach?reach.get(war.id):true,
      score:c2FrontPriority(w,a,war)-Math.min(85,(committed.get(a.nationId+':'+war.id)||0)/12)}))
      .sort((x,y)=>y.score-x.score||x.war.id-y.war.id);
    const plausible=ranked.filter(x=>x.reachable);
    const chosen=(plausible[0]||ranked[0]);
    if(chosen.war.id!==old){a.assignedWarId=chosen.war.id;if(!a.hServiceReturn){a.order=null;a.operation=null;a.needsOrders=true;}w.changeSeq++;}
    const key=a.nationId+':'+chosen.war.id;committed.set(key,(committed.get(key)||0)+manpower(a));
    a.c2NextFrontReviewDay=w.dayIndex+30;
    a.c6FrontDecision={dayIndex:w.dayIndex,warId:chosen.war.id,priority:Math.round(chosen.score*100)/100,
      reason:live.length===1?'SINGLE_WAR':!plausible.length?'NO_ACCESSIBLE_WAR':chosen.reachable?'LAND_REACHABLE':'NO_LAND_ACCESS'};
    if(w.c6StrategyStats){w.c6StrategyStats.frontReviews++;if(reach)w.c6StrategyStats.unreachableChecks+=live.filter(v=>!reach.get(v.id)).length;}
  }
}
// --- src/sim/army-lifecycle.js ---
/** C6: bounded, event-driven formation history. No per-day historical snapshots. */
const C6_ARMY_HISTORY_LIMIT=300;
const C6_ARMY_END_REASONS=['BATTLE_LOSS','FIELD_LOSS','SURRENDER','DISBAND','DESERTION','NATION_FALL'];
function c6RecordArmyEnd(w,a,reason){
  if(!C6_ARMY_END_REASONS.includes(reason))throw Error('C6 unknown formation end reason');
  const ledger=w.c6ArmyHistory;
  if(!ledger)return; // historical direct-import diagnostics never creates fake history
  const exp=a.formationExperience||{};
  const row={id:a.id,nationId:a.nationId,createdDay:Number.isSafeInteger(a.c6CreatedDay)?a.c6CreatedDay:null,
    endedDay:w.dayIndex,reason,survivors:manpower(a),xp:Math.max(0,Math.floor(exp.xp||0)),
    combatRounds:Math.max(0,Math.floor(exp.combatRounds||0)),trainingSessions:Math.max(0,Math.floor(exp.trainingSessions||0)),
    ...(a.combatRecord?{combatRecord:structuredClone(a.combatRecord)}:{})};
  ledger.entries.push(row);
  ledger.byReason[reason]=(ledger.byReason[reason]||0)+1;
  if(ledger.entries.length>C6_ARMY_HISTORY_LIMIT){ledger.entries.shift();ledger.dropped++;}
}
function c6ValidateArmyHistory(w){
  const h=w.c6ArmyHistory;
  if(!h||!Array.isArray(h.entries)||h.entries.length>C6_ARMY_HISTORY_LIMIT||!Number.isSafeInteger(h.dropped)||h.dropped<0||!h.byReason||typeof h.byReason!=='object')return false;
  for(const [kind,count] of Object.entries(h.byReason))if(!C6_ARMY_END_REASONS.includes(kind)||!Number.isSafeInteger(count)||count<0)return false;
  const total=Object.values(h.byReason).reduce((s,n)=>s+n,0);
  if(total!==h.entries.length+h.dropped)return false;
  let last=-1;
  for(const r of h.entries){
    if(!Number.isInteger(r.id)||r.id<0||r.id>=w.nextArmyId||!w.nations[r.nationId]||
       !C6_ARMY_END_REASONS.includes(r.reason)||!Number.isSafeInteger(r.endedDay)||r.endedDay<last||r.endedDay>w.dayIndex||
       r.createdDay!==null&&(!Number.isSafeInteger(r.createdDay)||r.createdDay<0||r.createdDay>r.endedDay)||
       [r.survivors,r.xp,r.combatRounds,r.trainingSessions].some(x=>!Number.isSafeInteger(x)||x<0))return false;
    last=r.endedDay;
  }
  for(const a of w.armies)if(a.c6CreatedDay!==undefined&&(!Number.isSafeInteger(a.c6CreatedDay)||a.c6CreatedDay<0||a.c6CreatedDay>w.dayIndex))return false;
  return true;
}
const C6_STRATEGY_FIELDS=['frontReviews','unreachableChecks','pathChecks','noReachableOrders'];
function c6ValidateStrategyStats(w){
 const d=w.c6StrategyStats;
 if(!d||C6_STRATEGY_FIELDS.some(k=>!Number.isSafeInteger(d[k])||d[k]<0))return false;
 for(const a of w.armies){
   const f=a.c6FrontDecision;if(!f)continue;
   if(!Number.isSafeInteger(f.dayIndex)||f.dayIndex>w.dayIndex||f.dayIndex<0||
      !['LAND_REACHABLE','NO_LAND_ACCESS','SINGLE_WAR','NO_ACCESSIBLE_WAR'].includes(f.reason)||
      !Number.isInteger(f.warId)||f.warId<0||!Number.isFinite(f.priority))return false;
 }
 return true;
}
// --- src/sim/independence.js ---
/** C2: treaty-bound independence politics and war-only coalitions.
 * These are not permanent alliances. All parties have to accept a real offer.
 */
const C2_YEAR=DAYS_PER_YEAR,C2_FRONT_TERM=10*C2_YEAR,C2_DEMAND_COOLDOWN=5*C2_YEAR;
const C2_ACTIONS=['OFFER_INDEPENDENCE_FRONT','ACCEPT_INDEPENDENCE_FRONT','REJECT_INDEPENDENCE_FRONT',
 'OFFER_INDEPENDENCE_SUPPORT','ACCEPT_INDEPENDENCE_SUPPORT','REJECT_INDEPENDENCE_SUPPORT',
 'OFFER_INDEPENDENCE_BACKING','ACCEPT_INDEPENDENCE_BACKING','REJECT_INDEPENDENCE_BACKING','DECLARE_INDEPENDENCE'];
function c2TreatyInit(w,t){
 if(t.independencePressure===undefined){t.independencePressure=t.origin==='FORCED'?35:10;t.pressureDay=w.dayIndex;
  t.lastDemandDay=null;t.lastRejectedDay=null;t.rejectedDemands=0;t.nextDemandDay=w.dayIndex+5*C2_YEAR;
  t.protectionHelp=0;t.protectionFailures=0;t.rebellionWarId=null;t.status='ACTIVE';}
 return t;
}
function c2IndependenceData(w){
 const d=w.diplomacy;
 d.independenceFronts??=[];d.independencePledges??=[];
 d.independenceOffers??=[];d.independenceBackingCooldowns??={};d.independenceOutreach??={};
 d.independenceStats??={demands:0,accepted:0,rejected:0,wars:0,victories:0,defeats:0};
 for(const k of ['frontsProposed','frontsAccepted','pledgesRequested','pledgesAccepted','backingProposed','backingAccepted','backingRejected',
    'jointWars','externallySupportedWars','protectionFought','protectionDefeats',
    'outreachStarted','outreachAttempts','outreachProgress','outreachBlocked','outreachContactsEvaluated','outreachGoldSpent'])d.independenceStats[k]??=0;
 d.independenceStats.outreachReasons??={};
 return d;
}
function c2Front(w,a,b){return c2IndependenceData(w).independenceFronts.find(t=>t.a===Math.min(a,b)&&t.b===Math.max(a,b)&&t.expiresDay>w.dayIndex)||null;}
function c2Pledge(w,subjectId,supporterId){return c2IndependenceData(w).independencePledges.find(t=>t.subjectId===subjectId&&t.supporterId===supporterId&&t.expiresDay>w.dayIndex)||null;}
function c2Offer(w,from,to,kind){return c2IndependenceData(w).independenceOffers.find(o=>o.from===from&&o.to===to&&o.kind===kind&&o.expiresDay>w.dayIndex)||null;}
function c2FrontLegal(w,a,b){
 const ta=v06bSubjectOf(w,a),tb=v06bSubjectOf(w,b);
 return Boolean(ta&&tb&&a!==b&&ta.status!=='REBELLION'&&tb.status!=='REBELLION'&&
  c2TreatyInit(w,ta).independencePressure>=50&&c2TreatyInit(w,tb).independencePressure>=50&&
  relationOf(w,a,b)>=10&&!warAgainst(w,a,b));
}
/** C5A: Diplomacy is screened at signing. A ratified pledge is NOT revoked by
 * quarterly neutral-reversion alone, but may fail for real legal conflicts. */
function c5aPledgeStructuralLegal(w,subjectId,supporterId){
 const t=v06bSubjectOf(w,subjectId),independent=w.nations[supporterId];
 return Boolean(t&&t.status!=='REBELLION'&&independent?.active&&!v06bSubjectOf(w,supporterId)&&
  !v06bBetween(w,supporterId,subjectId)&&supporterId!==t.overlordId&&
  !allianceBetween(w,supporterId,t.overlordId)&&
  !(independent.truces?.[t.overlordId]>w.dayIndex)&&
  !warAgainst(w,subjectId,supporterId)&&
  !warAgainst(w,supporterId,t.overlordId));
}
function c5aMatureContact(w,subjectId,supporterId){
 const t=v06bSubjectOf(w,subjectId),o=c5OutreachState(w,subjectId);
 return Boolean(t&&o&&o.targetId===supporterId&&o.progress>=4&&
  o.treatyDay===t.formedDay&&o.overlordId===t.overlordId&&
  relationOf(w,subjectId,supporterId)>=-10&&
  relationOf(w,supporterId,t.overlordId)<=-10);
}
function c2PledgeLegal(w,subjectId,supporterId){
 return c5aPledgeStructuralLegal(w,subjectId,supporterId)&&
  (relationOf(w,subjectId,supporterId)>=15||c5aMatureContact(w,subjectId,supporterId));
}
function c2WarCoalition(w,subjectId){
 const lead=v06bSubjectOf(w,subjectId);if(!lead)return null;
 let attackers=[subjectId],defenders=[lead.overlordId],claims=[{subjectId,overlordId:lead.overlordId}];
 // Stable join order makes a one-war-at-a-time choice deterministic even with 100 nations.
 const fronts=c2IndependenceData(w).independenceFronts.filter(f=>f.expiresDay>w.dayIndex&&(f.a===subjectId||f.b===subjectId));
 for(const front of fronts){
   const id=front.a===subjectId?front.b:front.a,t=v06bSubjectOf(w,id);
   if(!t||t.status==='REBELLION'||t.independencePressure<60||t.lastRejectedDay==null||w.dayIndex-t.lastRejectedDay>15*C2_YEAR)continue;
   const a=[...attackers,id],d=[...new Set([...defenders,t.overlordId])];
   if(c2CanStartWar(w,a,d)){attackers=a;defenders=d;claims.push({subjectId:id,overlordId:t.overlordId});}
 }
 // A support promise is specific to a subject and the current overlord.
 for(const pledge of c2IndependenceData(w).independencePledges){
  if(pledge.expiresDay<=w.dayIndex||pledge.status!=='ACTIVE'||!claims.some(c=>c.subjectId===pledge.subjectId&&c.overlordId===pledge.overlordId))continue;
  if(!w.nations[pledge.supporterId]?.active||
     !c5aPledgeStructuralLegal(w,pledge.subjectId,pledge.supporterId))continue;
  if(attackers.includes(pledge.supporterId))continue;
  if(c2CanStartWar(w,[...attackers,pledge.supporterId],defenders))attackers.push(pledge.supporterId);
 }
 return {attackers,defenders,claims};
}
/** C5: one-quarter, non-serialized power cache. Automatically invalidated on world mutation. */
const c5PowerCache=new WeakMap();
function c4PreparedMen(w,id){
 let cache=c5PowerCache.get(w);
 if(!cache||cache.day!==w.dayIndex||cache.seq!==w.changeSeq||cache.armies!==w.armies.length){
  const ready=new Map();for(const a of w.armies)ready.set(a.nationId,(ready.get(a.nationId)||0)+c3ArmyReady(a));
  cache={day:w.dayIndex,seq:w.changeSeq,armies:w.armies.length,ready};c5PowerCache.set(w,cache);
 }
 return cache.ready.get(id)||0;
}
/** C5: read-only explanation shared by the AI and the nation interface. */
function c5OutreachState(w,subjectId){
 const t=v06bSubjectOf(w,subjectId),o=c2IndependenceData(w).independenceOutreach[subjectId];
 return t&&o?.treatyDay===t.formedDay&&o?.overlordId===t.overlordId?o:null;
}
function c5IndependenceSituation(w,subjectId){
 const t=v06bSubjectOf(w,subjectId);if(!t)return null;
 const outreach=c5OutreachState(w,subjectId);
 const own=c4PreparedMen(w,subjectId),foe=c4PreparedMen(w,t.overlordId);
 const pledged=c2IndependenceData(w).independencePledges.filter(p=>p.subjectId===subjectId&&p.status==='ACTIVE'&&p.expiresDay>w.dayIndex);
 const allies=pledged.reduce((sum,p)=>sum+c4PreparedMen(w,p.supporterId),0);
 const ratio=Math.round(100*(own+allies)/Math.max(1,foe))/100;
 const risk=(w.aiProfiles[w.nations[subjectId].aiProfileId]?.behavior?.riskTolerance??50)/100;
 const threshold=Math.max(.35,.9-risk*.45);
 const blockers=[];
 if(t.status==='REBELLION')blockers.push('독립전쟁 중');
 else{
  if(t.independencePressure<70)blockers.push('독립 압력 70 미만');
  if(t.lastRejectedDay===null||w.dayIndex-t.lastRejectedDay>15*C2_YEAR)blockers.push('최근 독립 요구 거절 이력 없음');
  if(!w.armies.some(a=>a.nationId===subjectId&&manpower(a)>=12))blockers.push('봉기 가능한 편제 부족');
  if(ratio<threshold)blockers.push('예상 연합 전력 부족');
 }
 return {t,own,foe,allies,ratio,threshold,blockers,outreach,pledged};
}
/** C4: deterministic expected payoff of an external commitment, not an RNG coin toss. */
function c4BackingAssessment(w,supporterId,subjectId){
 const t=v06bSubjectOf(w,subjectId),n=w.nations[supporterId];
 if(!t||!n?.active||!c5aPledgeStructuralLegal(w,subjectId,supporterId))
  return {approve:false,reason:'ILLEGAL'};
 if(!c2PledgeLegal(w,subjectId,supporterId))
  return {approve:false,reason:'TRUST_NOT_READY'};
 const p=w.aiProfiles[n.aiProfileId]||{},relation=relationOf(w,supporterId,subjectId),
   rivalRelation=relationOf(w,supporterId,t.overlordId);
 const ready=c4PreparedMen(w,supporterId),foe=c4PreparedMen(w,t.overlordId);
 const ally=c4PreparedMen(w,subjectId);
 const advantage=(ready+ally)/Math.max(1,foe);
 const fronts=warsOfNation(w,supporterId).length;
 const promises=c2IndependenceData(w).independencePledges.filter(x=>x.supporterId===supporterId&&x.status==='ACTIVE'&&x.expiresDay>w.dayIndex).length;
 const contact=c5OutreachState(w,subjectId),engaged=contact?.targetId===supporterId&&contact.progress>=2;
 const mature=c5aMatureContact(w,subjectId,supporterId);
 const strategic=mature||(engaged&&relation>=20&&rivalRelation<=10);
 const historic=relation>=35&&rivalRelation<=-15;
 const attraction=(p.diplomacy?.cooperation??50)*.25+(p.military?.aggression??50)*.12+
    Math.max(0,relation)*.34+Math.max(0,-rivalRelation)*.40+
    Math.min(20,Math.max(-20,(advantage-1)*18))+(strategic?13:0)+(mature?8:0);
 const risk=44+fronts*12+(n.gold<Math.max(200,militaryUpkeep(w,supporterId)*3)?16:0)+
    (advantage<.85?19:0);
 let reason='LOW_EXPECTED_GAIN';
 if(promises>=2)reason='PROMISE_LIMIT';
 else if(ready<12||advantage<.65)reason='MILITARY_RISK';
 else if(t.independencePressure<60)reason='PRESSURE_LOW';
 else if(!historic&&!strategic)reason='RELATION_OR_INTEREST';
 else if(attraction>=risk)reason='STRATEGIC_SUPPORT';
 return {approve:reason==='STRATEGIC_SUPPORT',attraction:Math.round(attraction),risk:Math.round(risk),
    advantage:Math.round(advantage*100)/100,relation,rivalRelation,engaged,mature,reason};
}
function c4FrontAssessment(w,subjectId,peerId){
 const a=v06bSubjectOf(w,subjectId),b=v06bSubjectOf(w,peerId);
 if(!a||!b||!c2FrontLegal(w,subjectId,peerId))return {approve:false};
 const relation=relationOf(w,subjectId,peerId),jointPressure=Math.min(a.independencePressure,b.independencePressure);
 const sameOverlord=a.overlordId===b.overlordId;
 return {approve:relation>=20&&jointPressure>=60&&(sameOverlord||relation>=35),relation,sameOverlord};
}
function c2IndependenceActionLegal(w,id,act){
 const other=act.targetNationId,t=v06bSubjectOf(w,id),kind=act.type;
 if(!w.nations[id]?.active)return false;
 if(kind==='DECLARE_INDEPENDENCE'){
  if(!t||c2TreatyInit(w,t).status==='REBELLION'||t.lastRejectedDay==null||w.dayIndex-t.lastRejectedDay>15*C2_YEAR||
     t.independencePressure<70||w.dayIndex<t.formedDay+5*C2_YEAR||!w.armies.some(a=>a.nationId===id&&manpower(a)>=12))return false;
  const col=c2WarCoalition(w,id);return Boolean(col&&c2CanStartWar(w,col.attackers,col.defenders));
 }
 if(!Number.isInteger(other)||!w.nations[other]?.active||other===id)return false;
 if(kind==='OFFER_INDEPENDENCE_FRONT')return c2FrontLegal(w,id,other)&&!c2Front(w,id,other)&&!c2Offer(w,id,other,'FRONT');
 if(kind==='ACCEPT_INDEPENDENCE_FRONT')return c2FrontLegal(w,id,other)&&!!c2Offer(w,other,id,'FRONT')&&!c2Front(w,id,other);
 if(kind==='REJECT_INDEPENDENCE_FRONT')return !!c2Offer(w,other,id,'FRONT');
 if(kind==='OFFER_INDEPENDENCE_SUPPORT')return c2PledgeLegal(w,id,other)&&!c2Pledge(w,id,other)&&!c2Offer(w,id,other,'SUPPORT')&&
  !c2Offer(w,other,id,'BACKING');
 if(kind==='OFFER_INDEPENDENCE_BACKING')return c2PledgeLegal(w,other,id)&&!c2Pledge(w,other,id)&&!c2Offer(w,id,other,'BACKING')&&
  !c2Offer(w,other,id,'SUPPORT');
 if(kind==='ACCEPT_INDEPENDENCE_BACKING')return c2PledgeLegal(w,id,other)&&!!c2Offer(w,other,id,'BACKING')&&!c2Pledge(w,id,other);
 if(kind==='REJECT_INDEPENDENCE_BACKING')return !!c2Offer(w,other,id,'BACKING');
 if(kind==='ACCEPT_INDEPENDENCE_SUPPORT')return c2PledgeLegal(w,other,id)&&!!c2Offer(w,other,id,'SUPPORT')&&!c2Pledge(w,other,id);
 if(kind==='REJECT_INDEPENDENCE_SUPPORT')return !!c2Offer(w,other,id,'SUPPORT');
 return false;
}
function c2ExecuteIndependence(w,id,act){
 if(!c2IndependenceActionLegal(w,id,act))return {ok:false,reason:'독립 외교 또는 봉기 조건 불충족'};
 const d=c2IndependenceData(w),other=act.targetNationId;
 if(act.type==='DECLARE_INDEPENDENCE'){
  const col=c2WarCoalition(w,id),overlord=v06bSubjectOf(w,id).overlordId;
  const war={id:w.nextWarId++,kind:'INDEPENDENCE',attackerId:id,defenderId:overlord,startedDay:w.dayIndex,
   lastBattleDay:w.dayIndex,score:0,battleCount:0,casualties:{},battleCasualties:{},occupationCasualties:{},supplyCasualties:{},
   battleWins:{},occupationCount:0,goal:chooseWarGoal(w,id,overlord),defenderGoal:defenseGoal(),
   sides:{attackers:col.attackers,defenders:col.defenders},independenceClaims:col.claims,
   fatigue:Object.fromEntries([...col.attackers,...col.defenders].map(x=>[x,0])),
   lastCasualties:Object.fromEntries([...col.attackers,...col.defenders].map(x=>[x,0])),pendingPeace:null,nextPeaceOfferDay:0};
  for(const claim of col.claims){const t=v06bSubjectOf(w,claim.subjectId);t.status='REBELLION';t.rebellionWarId=war.id;
   t.lastDemandDay=w.dayIndex;}
  for(const pledge of d.independencePledges){if(pledge.status==='ACTIVE'&&col.claims.some(c=>c.subjectId===pledge.subjectId&&c.overlordId===pledge.overlordId)){
    pledge.status=col.attackers.includes(pledge.supporterId)?'FULFILLED':'BROKEN';
    if(pledge.status==='BROKEN'){
     v06aRemember(w,pledge.subjectId,pledge.supporterId,'INDEPENDENCE_PLEDGE_BROKEN',{trust:-12,grievance:10});
     adjustRelation(w,pledge.subjectId,pledge.supporterId,-10);
     const msg=`${w.nations[pledge.supporterId].name}이(가) ${w.nations[pledge.subjectId].name}에 대한 독립지원 약속을 이행하지 못했습니다.`;
     event(w,msg,'diplomacy');recordHistoricalEvent(w,'diplomacy',msg,[pledge.subjectId,pledge.supporterId],`c5a:broken:${pledge.subjectId}:${pledge.supporterId}:${war.id}`);
    }
  }}
  d.independenceFronts=d.independenceFronts.filter(f=>!col.claims.some(c=>c.subjectId===f.a||c.subjectId===f.b));
  w.diplomacy.subjectOffers=w.diplomacy.subjectOffers.filter(offer=>
    !col.claims.some(c=>offer.kind==='RELEASE'&&offer.from===c.subjectId&&offer.to===c.overlordId));
  w.wars.push(war);d.independenceStats.wars++;
  if(col.claims.length>1)d.independenceStats.jointWars++;
  if(col.attackers.some(x=>!col.claims.some(c=>c.subjectId===x)))d.independenceStats.externallySupportedWars++;
  for(const x of col.attackers)for(const y of col.defenders)adjustRelation(w,x,y,-12);
  requestDefensiveSupport(w,war);requestOffensiveSupport(w,war);
  event(w,`${col.claims.map(c=>w.nations[c.subjectId].name).join('·')}이(가) 종주국 연합에 독립전쟁을 선포했습니다. (전쟁 #${war.id})`,'war');
  recordHistoricalEvent(w,'war',w.events.at(-1).text,[...col.attackers,...col.defenders],`war:${war.id}:start`);
  return {ok:true,warId:war.id,claims:col.claims.length};
 }
 const offer=act.type.startsWith('OFFER_');
 const backing=act.type.endsWith('_BACKING');
 const kind=backing?'BACKING':act.type.endsWith('_FRONT')?'FRONT':'SUPPORT';
 if(offer){
   d.independenceOffers.push({from:id,to:other,kind,dayIndex:w.dayIndex,expiresDay:w.dayIndex+2*DAYS_PER_QUARTER});
   if(kind==='FRONT')d.independenceStats.frontsProposed++;
   else if(kind==='SUPPORT')d.independenceStats.pledgesRequested++;
   else d.independenceStats.backingProposed++;
   event(w,`${w.nations[id].name}이(가) ${w.nations[other].name}에 ${kind==='FRONT'?'독립 공동전선':kind==='SUPPORT'?'독립 지원 요청':'독립 지원 약속'}을 제안했습니다.`,'diplomacy');
 }else{
   d.independenceOffers=d.independenceOffers.filter(o=>!(o.from===other&&o.to===id&&o.kind===kind));
   if(act.type.startsWith('ACCEPT_')){
     if(kind==='FRONT'){
       d.independenceFronts.push({a:Math.min(id,other),b:Math.max(id,other),formedDay:w.dayIndex,expiresDay:w.dayIndex+C2_FRONT_TERM});
       d.independenceStats.frontsAccepted++;
     }else{
       const subjectId=backing?id:other,supporterId=backing?other:id;
       d.independencePledges.push({subjectId,supporterId,overlordId:v06bSubjectOf(w,subjectId).overlordId,
         formedDay:w.dayIndex,expiresDay:w.dayIndex+C2_FRONT_TERM,status:'ACTIVE'});
       d.independenceStats[backing?'backingAccepted':'pledgesAccepted']++;
     }
     event(w,`${w.nations[id].name}과 ${w.nations[other].name}이(가) ${kind==='FRONT'?'독립 공동전선':'독립 지원 약속'}을 체결했습니다.`,'diplomacy');
     recordHistoricalEvent(w,'diplomacy',w.events.at(-1).text,[id,other],`c5:${kind.toLowerCase()}:${id}:${other}:${w.dayIndex}`);
   }else{
     if(backing){d.independenceStats.backingRejected++;
       d.independenceBackingCooldowns[pairKey(id,other)]=w.dayIndex+3*C2_YEAR;}
     adjustRelation(w,id,other,-2);
     event(w,`${w.nations[id].name}이(가) 독립 외교 제안을 거절했습니다.`,'diplomacy');
   }
 }
 w.changeSeq++;return {ok:true};
}
function c2PressureQuarter(w,t){
 if(t.status==='REBELLION')return;
 if(t.pressureDay===w.dayIndex)return;
 const s=w.nations[t.subjectId],o=w.nations[t.overlordId],rel=relationOf(w,s.id,o.id);
 const strength=nationManpower(w,s.id)/Math.max(1,nationManpower(w,o.id));
 const treasury=s.gold/Math.max(1,militaryUpkeep(w,s.id)*3+100);
 const age=(w.dayIndex-t.formedDay)/C2_YEAR;
 const previous=t.independencePressure;
 const change=(t.origin==='FORCED'?.45:.03)+(age>20?.3:0)+
   (t.lastPaid>0&&treasury<1?.65:0)+(strength>1.2?.9:strength>.8?.3:0)+
   (rel<0?.8:rel>60?-.85:rel>30?-.4:0)+
   (t.protectionFailures>t.protectionHelp?.5:0)+(v06bThreatened(w,s.id,o.id)?-.4:0);
 t.independencePressure=Math.max(0,Math.min(100,Math.round((previous+change)*100)/100));
 t.pressureDay=w.dayIndex;if(previous!==t.independencePressure)w.changeSeq++;
}
function c2ReleaseConsent(w,t,responderId){
 if(!t||w.nations[responderId]?.controller!=='AI')return false;
 if(responderId===t.subjectId)return true;
 const o=w.nations[t.overlordId],p=w.aiProfiles[o.aiProfileId],ratio=nationManpower(w,t.subjectId)/Math.max(1,nationManpower(w,o.id));
 const burden=(o.gold<Math.max(200,militaryUpkeep(w,o.id)*2)?12:0)+(warsOfNation(w,o.id).length*8);
 const score=(t.independencePressure||0)*.28+ratio*24+burden+(relationOf(w,o.id,t.subjectId)>65?12:0)+
   (p?.diplomacy?.compromise??50)*.25-(p?.military?.aggression??50)*.22;
 return score>=62;
}
/** C5: diplomacy preparation occurs only on quarter ticks, at most once per two game years.
 * One persistent outreach record per subject, no diplomat entities or per-day scans.
 * Candidate prescreen is cheap; only three finalists receive a scored comparison.
 */
function c5RunIndependenceOutreach(w){
 const d=c2IndependenceData(w);
 for(const t of v06bTreaties(w)){
  const s=t.subjectId,sub=w.nations[s];
  if(t.status==='REBELLION'||sub?.controller!=='AI'||t.independencePressure<65)continue;
  if(t.lastRejectedDay===null||t.rejectedDemands<2)continue;
  const previous=c5OutreachState(w,s);
  if(previous&&w.dayIndex<previous.nextAttemptDay)continue;
  if(d.independencePledges.some(p=>p.subjectId===s&&p.status==='ACTIVE'&&p.expiresDay>w.dayIndex))continue;
  const st=d.independenceStats;
  const options=[];
  for(const n of w.nations){
   if(!n.active||n.controller!=='AI'||n.id===s||n.id===t.overlordId||v06bSubjectOf(w,n.id))continue;
   if(allianceBetween(w,n.id,t.overlordId)||warAgainst(w,n.id,t.overlordId)||warAgainst(w,n.id,s)||
      (n.truces?.[t.overlordId]||0)>w.dayIndex)continue;
   const relationship=relationOf(w,s,n.id),rival=relationOf(w,n.id,t.overlordId);
   if(relationship< -15||rival>10)continue;
   st.outreachContactsEvaluated++;
   options.push({id:n.id,relationship,rival,score:Math.max(-50,relationship)*.45-rival*.52+
     (w.aiProfiles[n.aiProfileId]?.diplomacy?.cooperation??50)*.12});
  }
  options.sort((a,b)=>b.score-a.score||a.id-b.id);
  const chosen=options.slice(0,3).find(o=>c4PreparedMen(w,o.id)>=12);
  st.outreachAttempts++;
  if(!chosen){
   st.outreachBlocked++;st.outreachReasons.NO_STRATEGIC_PARTNER=(st.outreachReasons.NO_STRATEGIC_PARTNER||0)+1;
   d.independenceOutreach[s]={targetId:null,treatyDay:t.formedDay,overlordId:t.overlordId,startedDay:previous?.startedDay??w.dayIndex,
    lastAttemptDay:w.dayIndex,nextAttemptDay:w.dayIndex+2*C2_YEAR,progress:0,lastReason:'NO_STRATEGIC_PARTNER'};
   continue;
  }
  const prior=previous?.targetId===chosen.id?previous:null;
  // Diplomatic courtship is not an endlessly repeatable +relation exploit.
  if(prior?.progress>=5&&chosen.relationship>=35)continue;
  const first=!prior,progress=Math.min(5,(prior?.progress||0)+1);
  // The target may still refuse to back a war; modest courtship is not a pledge.
  const relationGain=chosen.relationship<15?9:chosen.relationship<35?7:3;
  const expense=Math.min(sub.gold,12);sub.gold-=expense;st.outreachGoldSpent+=expense;
  adjustRelation(w,s,chosen.id,relationGain);
  d.independenceOutreach[s]={targetId:chosen.id,treatyDay:t.formedDay,overlordId:t.overlordId,startedDay:first?w.dayIndex:prior.startedDay,
   lastAttemptDay:w.dayIndex,nextAttemptDay:w.dayIndex+2*C2_YEAR,progress,lastReason:progress>=2?'CONTACT_MATURE':'CONTACT_STARTED'};
  if(first){st.outreachStarted++;
   // One chronicle entry per suzerainty treaty, not one per switched contact.
   if(!t.c5aOutreachAnnounced){
    const msg=`${sub.name}이(가) ${w.nations[t.overlordId].name}로부터의 독립을 준비하며 외국과 외교 접촉을 시작했습니다.`;
    event(w,msg,'diplomacy');recordHistoricalEvent(w,'diplomacy',msg,[s,chosen.id,t.overlordId],`c5a:outreach:${s}:${t.overlordId}:${t.formedDay}`);
    t.c5aOutreachAnnounced=true;
   }
  }else st.outreachProgress++;
  w.changeSeq++;
 }
}
function c2RunIndependenceQuarter(w,execute){
 const d=c2IndependenceData(w);
 for(const [key,until] of Object.entries(d.independenceBackingCooldowns))if(until<=w.dayIndex)delete d.independenceBackingCooldowns[key];
 for(const o of d.independenceOffers)if(o.kind==='BACKING'&&o.expiresDay<=w.dayIndex)
     d.independenceBackingCooldowns[pairKey(o.from,o.to)]=w.dayIndex+2*C2_YEAR;
 d.independenceOffers=d.independenceOffers.filter(o=>o.expiresDay>w.dayIndex&&w.nations[o.from]?.active&&w.nations[o.to]?.active);
 d.independenceFronts=d.independenceFronts.filter(f=>f.expiresDay>w.dayIndex&&c2FrontLegal(w,f.a,f.b));
 // Record material promise expiry/invalidation only; ordinary proposal failures stay out of chronicle.
 for(const p of d.independencePledges){
  if(p.status!=='ACTIVE')continue;
  const changed=v06bSubjectOf(w,p.subjectId)?.overlordId!==p.overlordId;
  if(p.expiresDay>w.dayIndex&&!changed)continue;
  const msg=`${w.nations[p.supporterId].name}의 ${w.nations[p.subjectId].name} 독립지원 약속이 ${changed?'종주 관계 변경으로 무효화':'기간 만료'}되었습니다.`;
  event(w,msg,'diplomacy');recordHistoricalEvent(w,'diplomacy',msg,[p.subjectId,p.supporterId],`c5a:pledge:end:${p.subjectId}:${p.supporterId}:${p.formedDay}`);
 }
 d.independencePledges=d.independencePledges.filter(p=>p.expiresDay>w.dayIndex&&w.nations[p.subjectId]?.active&&w.nations[p.supporterId]?.active&&v06bSubjectOf(w,p.subjectId)?.overlordId===p.overlordId);
 for(const t of v06bTreaties(w).slice()){
  c2TreatyInit(w,t);c2PressureQuarter(w,t);
  if(t.status==='REBELLION')continue;
  const subject=w.nations[t.subjectId];
  if(subject?.controller!=='AI')continue;
  if(t.independencePressure>=60&&w.dayIndex>=t.formedDay+5*C2_YEAR&&w.dayIndex>=(t.nextDemandDay||0)&&
      !v06bOffer(w,t.subjectId,t.overlordId,'RELEASE')){
     execute(w,t.subjectId,{type:'OFFER_RELEASE',targetNationId:t.overlordId});
  }
 }
 for(const offer of d.independenceOffers.slice()){
  if(w.nations[offer.to]?.controller!=='AI')continue;
  const cooperation=w.aiProfiles[w.nations[offer.to].aiProfileId]?.diplomacy?.cooperation??50;
  const accept=offer.kind==='FRONT'?c4FrontAssessment(w,offer.to,offer.from).approve&&cooperation>=25:
    offer.kind==='BACKING'?c2PledgeLegal(w,offer.to,offer.from)&&
      c4BackingAssessment(w,offer.from,offer.to).approve&&cooperation>=25:
    c2PledgeLegal(w,offer.from,offer.to)&&cooperation>=40&&c4BackingAssessment(w,offer.to,offer.from).approve;
  const types=offer.kind==='FRONT'?['ACCEPT_INDEPENDENCE_FRONT','REJECT_INDEPENDENCE_FRONT']:
    offer.kind==='BACKING'?['ACCEPT_INDEPENDENCE_BACKING','REJECT_INDEPENDENCE_BACKING']:
      ['ACCEPT_INDEPENDENCE_SUPPORT','REJECT_INDEPENDENCE_SUPPORT'];
  execute(w,offer.to,{type:types[accept?0:1],targetNationId:offer.from});
 }
 c5RunIndependenceOutreach(w);
 // A single new diplomacy proposal per subject/quarter. No new RNG draws.
 for(const t of v06bTreaties(w).slice()){
  if(t.status==='REBELLION'||w.nations[t.subjectId]?.controller!=='AI'||t.independencePressure<60)continue;
  const s=t.subjectId,p=w.aiProfiles[w.nations[s].aiProfileId];
  if(t.lastRejectedDay!==null&&w.dayIndex-t.lastRejectedDay<=15*C2_YEAR&&t.independencePressure>=70){
   if(c2IndependenceActionLegal(w,s,{type:'DECLARE_INDEPENDENCE'})){
    const coalition=c2WarCoalition(w,s);
    const own=coalition.attackers.reduce((v,id)=>v+nationManpower(w,id),0),
     enemy=coalition.defenders.reduce((v,id)=>v+nationManpower(w,id),0);
    const risk=(p?.behavior?.riskTolerance??50)/100;
    if(own/(enemy+20)>=Math.max(.35,.9-risk*.45)){
      execute(w,s,{type:'DECLARE_INDEPENDENCE'});continue;
    }
   }
  }
  if(t.independencePressure>=65&&!d.independenceOffers.some(o=>o.from===s)&&!d.independenceFronts.some(f=>f.a===s||f.b===s)){
    const peer=v06bTreaties(w).filter(x=>x.subjectId!==s&&x.independencePressure>=60&&
       c4FrontAssessment(w,s,x.subjectId).approve&&!c2Front(w,s,x.subjectId))
       .sort((a,b)=>relationOf(w,s,b.subjectId)-relationOf(w,s,a.subjectId)||a.subjectId-b.subjectId)[0];
    if(peer){execute(w,s,{type:'OFFER_INDEPENDENCE_FRONT',targetNationId:peer.subjectId});continue;}
  }
  if(t.independencePressure>=65&&!d.independenceOffers.some(o=>o.from===s)&&!d.independencePledges.some(x=>x.subjectId===s&&x.status==='ACTIVE')){
    const candidate=w.nations.filter(n=>n.controller==='AI'&&c2PledgeLegal(w,s,n.id)&&
      c4BackingAssessment(w,n.id,s).approve)
      .sort((a,b)=>c4BackingAssessment(w,b.id,s).attraction-c4BackingAssessment(w,a.id,s).attraction||a.id-b.id)[0];
    if(candidate)execute(w,s,{type:'OFFER_INDEPENDENCE_SUPPORT',targetNationId:candidate.id});
  }
 }
 c4RunProactiveBacking(w,execute);
}
/** Independent states may actively offer support; this is a real diplomatic offer,
 * never a manufactured subject request or automatic player consent. */
function c4RunProactiveBacking(w,execute){
 const d=c2IndependenceData(w);
 for(const sponsor of w.nations){
  if(!sponsor.active||sponsor.controller!=='AI'||v06bSubjectOf(w,sponsor.id))continue;
  if(d.independenceOffers.some(o=>o.from===sponsor.id&&o.kind==='BACKING'))continue;
  const targets=v06bTreaties(w).filter(t=>{
     const contact=c5OutreachState(w,t.subjectId),relation=relationOf(w,sponsor.id,t.subjectId),rival=relationOf(w,sponsor.id,t.overlordId);
     return ((relation>=35&&rival<=-15)||c5aMatureContact(w,t.subjectId,sponsor.id)||
       (contact?.targetId===sponsor.id&&contact.progress>=2&&relation>=20&&rival<=10));
    }).filter(t=>t.status!=='REBELLION'&&t.independencePressure>=60&&
     !c2Pledge(w,t.subjectId,sponsor.id)&&!c2Offer(w,t.subjectId,sponsor.id,'SUPPORT')&&
     w.dayIndex>=(d.independenceBackingCooldowns[pairKey(t.subjectId,sponsor.id)]||0)&&
     c4BackingAssessment(w,sponsor.id,t.subjectId).approve)
    .sort((a,b)=>b.independencePressure-a.independencePressure||a.subjectId-b.subjectId);
  if(targets.length){execute(w,sponsor.id,{type:'OFFER_INDEPENDENCE_BACKING',targetNationId:targets[0].subjectId});}
 }
}
/** Observe actual combat contribution and outcome, never count mere nonparticipation as a defeat. */
function c4ReviewProtectionPeace(w,war,terms){
 if(war.kind==='INDEPENDENCE')return;
 const treaty=v06bSubjectOf(w,war.defenderId);
 if(!treaty||treaty.status==='REBELLION'||!w.nations[treaty.overlordId]?.active)return;
 const joined=warSide(war,treaty.overlordId)==='defenders';
 const fought=joined&&((war.battleWins?.[treaty.overlordId]||0)>0||
      (war.battleCasualties?.[treaty.overlordId]||0)>0||
      (war.casualties?.[treaty.overlordId]||0)>0);
 const defeated=terms?.winnerId!=null&&warSide(war,terms.winnerId)==='attackers';
 if(fought){treaty.protectionBattleAid=(treaty.protectionBattleAid||0)+1;
    c2IndependenceData(w).independenceStats.protectionFought++;
    treaty.independencePressure=Math.max(0,treaty.independencePressure-4);}
 if(defeated){treaty.protectionDefeats=(treaty.protectionDefeats||0)+1;
    c2IndependenceData(w).independenceStats.protectionDefeats++;
    treaty.independencePressure=Math.min(100,treaty.independencePressure+6);}
}
function c2AfterPeace(w,war,terms){
 if(war.kind!=='INDEPENDENCE')return null;
 const d=c2IndependenceData(w),outcome=terms?.tier==='WHITE'?'WHITE':warSide(war,terms?.winnerId);
 const won=outcome==='attackers';
 for(const claim of war.independenceClaims||[]){
  const treaty=v06bBetween(w,claim.subjectId,claim.overlordId);
  if(!treaty)continue;
  if(won){v06bEndTreaty(w,treaty,'INDEPENDENCE_WAR');}
  else{treaty.status='ACTIVE';treaty.rebellionWarId=null;treaty.nextDemandDay=w.dayIndex+10*C2_YEAR;
   treaty.independencePressure=Math.max(20,treaty.independencePressure-18);}
 }
 d.independenceStats[won?'victories':'defeats']++;
 return {outcome:won?'INDEPENDENT':outcome==='defenders'?'SUPPRESSED':'WHITE_PEACE',claims:structuredClone(war.independenceClaims||[])};
}
function c2CleanupNation(w,id){
 const d=c2IndependenceData(w);
 d.independenceFronts=d.independenceFronts.filter(f=>f.a!==id&&f.b!==id);
 d.independencePledges=d.independencePledges.filter(p=>p.subjectId!==id&&p.supporterId!==id&&p.overlordId!==id);
 d.independenceOffers=d.independenceOffers.filter(o=>o.from!==id&&o.to!==id);
 delete d.independenceOutreach[id];
 for(const [sid,x] of Object.entries(d.independenceOutreach))if(x.targetId===id)delete d.independenceOutreach[sid];
}
function c2Validate(w,fail){
 const d=c2IndependenceData(w);
 if(!Array.isArray(d.independenceFronts)||!Array.isArray(d.independencePledges)||!Array.isArray(d.independenceOffers)||
    !d.independenceBackingCooldowns||typeof d.independenceBackingCooldowns!=='object'||
    !d.independenceOutreach||typeof d.independenceOutreach!=='object'||Array.isArray(d.independenceOutreach))fail('C5 독립 외교 목록');
 for(const [sid,o] of Object.entries(d.independenceOutreach)){
  if(!/^\d+$/.test(sid)||!w.nations[Number(sid)]||!o||
    !(o.targetId===null||Number.isInteger(o.targetId)&&w.nations[o.targetId])||
    !Number.isInteger(o.progress)||o.progress<0||o.progress>5||
    ![o.startedDay,o.lastAttemptDay,o.nextAttemptDay].every(x=>Number.isSafeInteger(x)&&x>=0)||
    o.lastAttemptDay>w.dayIndex||o.nextAttemptDay<o.lastAttemptDay||
    !Number.isSafeInteger(o.treatyDay)||o.treatyDay<0||
    !Number.isInteger(o.overlordId)||!w.nations[o.overlordId]||
    typeof o.lastReason!=='string'||o.lastReason.length>40)fail('C5A 독립 외교 접촉');
 }
 for(const [k,day] of Object.entries(d.independenceBackingCooldowns))
    if(!/^\d+:\d+$/.test(k)||!Number.isSafeInteger(day)||day<0)fail('C4 독립 지원 재제안 제한');
 for(const t of v06bTreaties(w)){
  if(t.c5aOutreachAnnounced!==undefined&&t.c5aOutreachAnnounced!==true)fail('C5A 최초 외교 연대기');
  if(!Number.isFinite(t.independencePressure)||t.independencePressure<0||t.independencePressure>100||
   !['ACTIVE','REBELLION'].includes(t.status)||t.status==='REBELLION'&&!w.wars.some(v=>v.id===t.rebellionWarId&&v.kind==='INDEPENDENCE'))fail('C2 종속국 독립 상태');
 }
const stats=d.independenceStats;
 for(const k of ['frontsProposed','frontsAccepted','pledgesRequested','pledgesAccepted','backingProposed','backingAccepted','backingRejected',
   'jointWars','externallySupportedWars','protectionFought','protectionDefeats',
   'outreachStarted','outreachAttempts','outreachProgress','outreachBlocked','outreachContactsEvaluated','outreachGoldSpent'])
   if(!Number.isSafeInteger(stats[k])||stats[k]<0)fail('C4 독립 외교 누적 계측');
 if(!stats.outreachReasons||typeof stats.outreachReasons!=='object'||
   Object.values(stats.outreachReasons).some(v=>!Number.isSafeInteger(v)||v<0))fail('C5 외교 탈락 계측');
 if(stats.outreachStarted+stats.outreachProgress+stats.outreachBlocked!==stats.outreachAttempts)fail('C5 접촉 횟수 보존');
 if(stats.frontsAccepted>stats.frontsProposed||stats.pledgesAccepted>stats.pledgesRequested||
    stats.backingAccepted+stats.backingRejected>stats.backingProposed||stats.jointWars>stats.wars||stats.externallySupportedWars>stats.wars)
   fail('C4 독립 외교 누적 보존식');
 for(const war of w.wars)if(war.kind==='INDEPENDENCE'){
  if(!Array.isArray(war.independenceClaims)||!war.independenceClaims.length||war.independenceClaims.some(c=>
   !war.sides.attackers.includes(c.subjectId)||!war.sides.defenders.includes(c.overlordId)||
    v06bBetween(w,c.subjectId,c.overlordId)?.rebellionWarId!==war.id))fail('C2 독립전쟁 청구권');
 }
}
// --- src/sim/strategy.js ---
/** V0.3D: one quarter-local geopolitical assessment shared by diplomacy,
 * military deployment and civilian investment. Does not change game rules.
 * Reports are compact, replay-deterministic, and have no arbitrary AI ID logic.
 */
const geoClamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const geoRound=n=>Math.round(n*100)/100;
function geopoliticalReports(w){return w.strategyReports?.dayIndex===w.dayIndex?w.strategyReports:null;}
function strategicReport(w,nationId){return geopoliticalReports(w)?.nations?.[nationId]||null;}
function buildGeopoliticalReports(w,force=false){
  if(!force&&geopoliticalReports(w))return w.strategyReports;
  const active=w.nations.filter(n=>n.active),stats=new Map(),borders=new Map(),tradeVolume=new Map();
  const key=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
  const target=w.dayIndex;
  for(const n of active){
    const territory=w.tiles.filter(t=>t.ownerId===n.id);
    const towns=w.settlements.filter(s=>s.ownerId===n.id),people=towns.reduce((x,s)=>x+s.population,0);
    const q=n.lastQuarter?.goldIncome!==undefined&&w.dayIndex>0?n.lastQuarter:projectedQuarter(w,n);
    const militaryCost=militaryUpkeep(w,n.id),civil=q.civil?.total??civilUpkeep(w,n.id).total;
    const foodShortage=geoClamp(1-(n.foodPressure??1),0,1);
    const fiscal=geoClamp((q.goldIncome-militaryCost-civil)/Math.max(1,q.goldIncome),-2,1);
    const men=nationManpower(w,n.id),ready=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY').reduce((x,a)=>x+manpower(a),0);
    stats.set(n.id,{people,territory:territory.length,towns:towns.length,gold:n.gold,militaryCost,civil,quarterIncome:q.goldIncome||0,foodShortage,fiscal,men,ready,forts:(w.defenses||[]).filter(b=>w.tiles[b.tileId]?.ownerId===n.id&&fortEffective(b)).length});
  }
  // Edge-sharing only; each pair counted once even if both sides have many border cells.
  for(const t of w.tiles){
    const a=t.ownerId;if(a===null||!stats.has(a))continue;
    for(const id of neighbors4(t.id,w.size,w.height)){
      const b=w.tiles[id].ownerId;if(b===null||a>=b||!stats.has(b))continue;
      borders.set(key(a,b),(borders.get(key(a,b))||0)+1);
    }
  }
  // Only recorded recent trades can reveal specific partners; do not fabricate older bilateral flows.
  for(const tr of w.trade?.history||[]){
    if(target-tr.dayIndex>12*DAYS_PER_QUARTER)continue;
    tradeVolume.set(key(tr.seller,tr.buyer),(tradeVolume.get(key(tr.seller,tr.buyer))||0)+tr.gold);
  }
  const reports={dayIndex:target,nations:{}};
  for(const n of active){
    const p=d1dEffectiveProfile(w,n.id),s=stats.get(n.id);
    const development=(p?.weights?.development??50)/100,expansion=(p?.weights?.expansion??50)/100;
    const aggression=(p?.military?.aggression??50)/100,risk=(p?.behavior?.riskTolerance??50)/100;
    const dependency=tradeDependencyReport(w,n.id);
    const importShock=(dependency?.pressure||0)/100;
    const recovery=geoClamp((.22-s.fiscal)*.7+s.foodShortage*.62+(s.gold<Math.max(200,(s.militaryCost+s.civil)*3)?.24:0)+importShock*.26,0,1);
    const neighbors=[];
    for(const foe of active){
      if(foe.id===n.id)continue;
      const contact=borders.get(key(n.id,foe.id))||0;if(contact===0)continue;
      const o=stats.get(foe.id),relation=relationOf(w,n.id,foe.id),hostility=geoClamp((20-relation)/120,0,1);
      const foeProfile=d1dEffectiveProfile(w,foe.id);
      const relative=o.ready/Math.max(25,s.ready),enemyThreat=geoClamp(relative/1.6,0,1);
      const historical=occupiedHistoricCapital(w,n.id,foe.id)?1:0;
      const trade=tradeVolume.get(key(n.id,foe.id))||0;
      const tradeShare=geoClamp(trade/Math.max(60,(s.quarterIncome||1)*4),0,1);
      const threat=geoClamp(100*(.29*hostility+.24*enemyThreat+.18*(foeProfile?.military?.aggression??50)/100+.15*historical+.14*geoClamp(contact/5,0,1)),0,100);
      const ourBorder=w.tiles.filter(t=>t.ownerId===n.id&&neighbors4(t.id,w.size,w.height).some(id=>w.tiles[id].ownerId===foe.id));
      // Defense burden is a property of actual frontier positions, not combat strength again.
      const foeBorder=w.tiles.filter(t=>t.ownerId===foe.id&&neighbors4(t.id,w.size,w.height).some(id=>w.tiles[id].ownerId===n.id));
      const resistance=foeBorder.length?foeBorder.reduce((sum,t)=>sum+regionalMilitaryStats(w,t.id).resistance,0)/foeBorder.length:0;
      const siegeBurden=geoClamp(Math.log1p(resistance/100)/Math.log(5),0,1);
      const accessible=foeBorder.some(t=>TERRAINS[t.terrain].passable);
      const prize=geoClamp((o.people/Math.max(1,s.people))*.23+o.territory/Math.max(1,s.territory)*.14+contact*.04+.25*historical,0,1);
      const readiness=geoClamp((s.ready+24)/(o.ready+24)/1.8,0,1);
      const tradePenalty=tradeShare*((p?.diplomacy?.cooperation??50)/100);
      // Separate F3 historical supplier concentration from D's recent trade Gold.
      const dependencyRisk=(dependency?.partnerImportShare?.[foe.id]||0)*importShock;
      const financialRisk=geoClamp(recovery*.55+(s.gold<3*(s.militaryCost+s.civil)?.35:0)+importShock*.12,0,1);
      const attraction=geoClamp(100*(.17+aggression*.20+expansion*.17+risk*.09+prize*.20+readiness*.19+hostility*.15+historical*.13-tradePenalty*.35-dependencyRisk*.12-siegeBurden*.15-financialRisk*.23),0,100);
      neighbors.push({id:foe.id,sharedBorder:contact,relation,threat:geoRound(threat),attraction:geoRound(attraction),
        tradeGold:trade,tradeShare:geoRound(tradeShare),resistance:geoRound(resistance),siegeBurden:geoRound(siegeBurden),
        militaryRatio:geoRound((s.ready+24)/(o.ready+24)),prize:geoRound(prize),financeRisk:geoRound(financialRisk),historical:!!historical,reachable:accessible});
    }
    neighbors.sort((a,b)=>b.attraction-a.attraction||a.id-b.id);
    const danger=Math.max(0,...neighbors.map(e=>e.threat))/100;
    const security=geoClamp(danger*(.5+.5*(p?.military?.defensivePreference??50)/100),0,1);
    const prosperity=geoClamp(.22+development*.45+Math.max(0,.25-s.foodShortage)*.25,0,1);
    const opportunity=geoClamp(expansion*.55+aggression*.25+Math.max(0,1-danger)*.12,0,1)*(1-recovery*.7);
    const scores={recovery:geoRound(recovery*100),security:geoRound(security*100),development:geoRound(prosperity*100),expansion:geoRound(opportunity*100)};
    const priority=Object.entries(scores).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];
    reports.nations[n.id]={priority,scores,warIntent:{reason:militaryAtWar(w,n.id)?'전쟁 수행 중':'분기 군사 판단 대기',targetNationId:null,willingness:null},financial:{income:s.quarterIncome,military:s.militaryCost,civil:s.civil,
      balance:Math.round(s.quarterIncome-s.militaryCost-s.civil),gold:s.gold,foodShortage:geoRound(s.foodShortage),tradePressure:dependency?.pressure||0},
      ready:s.ready,men:s.men,neighbors};
  }
  w.strategyReports=reports;
  return reports;
}
function geopoliticalGoalScore(w,attackerId,defenderId,tileId,settlement=null){
  const t=w.tiles[tileId],own=w.nations[attackerId],foe=w.nations[defenderId],p=d1dEffectiveProfile(w,attackerId);
  if(!t||t.ownerId!==defenderId)return -Infinity;
  const ownBorder=neighbors4(tileId,w.size,w.height).filter(id=>w.tiles[id].ownerId===attackerId).length;
  const s=settlement||w.settlements.find(v=>v.coreTileId===tileId&&v.ownerId===defenderId);
  const population=s?.population||0,development=s?.development||0;
  const terrainValue={plain:4,grass:3,forest:4,rock:3,mountain:1}[t.terrain]||0;
  const cultural=s?.formerCapitalOf?.includes(attackerId)?18:0;
  const core=foe.capitalId===tileId?9:0;
  const stat=regionalMilitaryStats(w,tileId);
  const defensePenalty=Math.min(16,Math.log1p(stat.resistance/65)*6+Math.log1p(stat.firepower/65)*4);
  const distance=w.tiles.filter(v=>v.ownerId===attackerId&&neighbors4(v.id,w.size,w.height).some(id=>w.tiles[id].ownerId===defenderId));
  const nearest=distance.length?Math.min(...distance.map(v=>Math.abs(v.x-t.x)+Math.abs(v.y-t.y))):15;
  return (ownBorder*7+terrainValue+core+cultural+Math.min(13,population/300)+development/20-
    defensePenalty-nearest*(.9+(100-(p?.behavior?.riskTolerance??50))/220));
}
function validateStrategicReports(w){
  const r=w.strategyReports;
  if(!r||!Number.isInteger(r.dayIndex)||r.dayIndex<0||r.dayIndex>w.dayIndex||!r.nations||typeof r.nations!=='object'||Object.keys(r.nations).length>w.nations.length)return false;
  for(const [id,s] of Object.entries(r.nations)){
    if(!/^\d+$/.test(id)||!w.nations[Number(id)]||!['recovery','security','development','expansion'].includes(s.priority)||!s.scores||!s.financial||!Array.isArray(s.neighbors)||s.neighbors.length>w.nations.length-1)return false;
    if(Object.values(s.scores).some(v=>!Number.isFinite(v)||v<0||v>100)||!Number.isFinite(s.financial.balance)||s.neighbors.some(x=>!w.nations[x.id]||x.id===Number(id)||!Number.isFinite(x.threat)||!Number.isFinite(x.attraction)||x.threat<0||x.threat>100||x.attraction<0||x.attraction>100))return false;
  }
  return true;
}
// --- src/sim/war-goals.js ---
/** Lightweight war objectives and transparent war-result evaluation. */

const warGoalClamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function warGoalDistance(w,x,y){const a=w.tiles[x],b=w.tiles[y];return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);}
function chooseWarGoal(w,attackerId,defenderId){
  const frontier=w.tiles.filter(t=>t.ownerId===defenderId&&neighbors4(t.id,w.size,w.height).some(nb=>w.tiles[nb].ownerId===attackerId));
  const towns=w.settlements.filter(s=>s.ownerId===defenderId);
  const accessible=new Set(frontier.map(t=>t.id)),queue=[...accessible];
  for(let i=0;i<queue.length;i++)for(const id of neighbors4(queue[i],w.size,w.height)){const t=w.tiles[id];if(t.ownerId===defenderId&&!accessible.has(id)&&TERRAINS[t.terrain].passable){accessible.add(id);queue.push(id);}}
  const options=[];
  for(const town of towns){
    if(!accessible.has(town.coreTileId))continue;
    const score=geopoliticalGoalScore(w,attackerId,defenderId,town.coreTileId,town);
    options.push({score,id:town.coreTileId,goal:{type:'SETTLEMENT',targetTileId:town.coreTileId,settlementId:town.id}});
  }
  for(const tile of frontier){
    const score=geopoliticalGoalScore(w,attackerId,defenderId,tile.id,null);
    options.push({score,id:tile.id,goal:{type:'BORDER',targetTileId:tile.id}});
  }
  options.sort((a,b)=>b.score-a.score||a.id-b.id);
  return options[0]?.goal||{type:'BORDER',targetTileId:w.tiles.find(t=>t.ownerId===defenderId)?.id??null};
}
const defenseGoal=()=>({type:'DEFEND',targetTileId:null});
function goalProgress(w,war){
  const goal=war.goal;if(!goal||goal.targetTileId===null)return 0;
  const t=w.tiles[goal.targetTileId];
  if(!t)return 0;
  const attackers=new Set(war.sides?.attackers||[war.attackerId]);
  const occupied=attackers.has(t.occupiedBy)||attackers.has(t.ownerId);
  if(goal.type==='SETTLEMENT'){
    const s=w.settlements.find(s=>s.id===goal.settlementId);
    if(!s||!s.tileIds.length)return occupied?1:0; // legacy saves without the original settlement
    const captured=s.tileIds.filter(id=>attackers.has(w.tiles[id]?.occupiedBy)||attackers.has(w.tiles[id]?.ownerId)).length;
    if(!captured)return 0;
    return captured===s.tileIds.length?4:Math.min(3.5,.5+3*captured/s.tileIds.length);
  }
  return occupied?2:0;
}
/** Live capital control: a single occupied capital is not a permanent score event. */
function capitalOccupationBonus(w,war,occupyingSide){
  const opposing=warMembers(war).filter(id=>warSide(war,id)!==occupyingSide);
  let value=0;
  for(const id of opposing){
    const capitalId=w.nations[id]?.capitalId,t=w.tiles[capitalId];
    if(t&&t.ownerId===id&&t.occupiedBy!==null&&warSide(war,t.occupiedBy)===occupyingSide)
      value+=id===war.attackerId||id===war.defenderId?6:3;
  }
  return Math.min(9,value);
}
function warCapitalAdvantage(w,war){return capitalOccupationBonus(w,war,'attackers')-capitalOccupationBonus(w,war,'defenders');}
function warBalance(w,war){
  const a=war.attackerId,b=war.defenderId;
  const attackers=new Set(war.sides?.attackers||[a]),defenders=new Set(war.sides?.defenders||[b]);
  const controlledA=w.tiles.filter(t=>defenders.has(t.ownerId)&&attackers.has(t.occupiedBy)).length;
  const controlledB=w.tiles.filter(t=>attackers.has(t.ownerId)&&defenders.has(t.occupiedBy)).length;
  return (war.score||0)+(controlledA-controlledB)*.3+goalProgress(w,war)+warCapitalAdvantage(w,war);
}
function warOutcome(w,war){
  const v=warBalance(w,war),abs=Math.abs(v);
  let tier=abs<2.5?'WHITE':abs<5?'LIMITED':abs<10?'CLEAR':'DECISIVE';
  const att=new Set(war.sides?.attackers||[war.attackerId]),def=new Set(war.sides?.defenders||[war.defenderId]);
  const controlled=w.tiles.filter(t=>att.has(t.ownerId)&&def.has(t.occupiedBy)||def.has(t.ownerId)&&att.has(t.occupiedBy)).length;
  // Tactical victories without any occupied ground cannot amount to major territorial victory.
  if(controlled===0&&tier==='DECISIVE'||controlled===0&&tier==='CLEAR')tier='LIMITED';
  const capitalSecured=capitalOccupationBonus(w,war,v>0?'attackers':'defenders')>=6;
  if(controlled>0&&goalProgress(w,war)===0&&!capitalSecured&&tier==='DECISIVE')tier='CLEAR';
  return {tier,winnerId:tier==='WHITE'?null:v>0?war.attackerId:war.defenderId,
    loserId:tier==='WHITE'?null:v>0?war.defenderId:war.attackerId,
    advantage:Number(v.toFixed(2))};
}
const truceDuration=tier=>({WHITE:240,LIMITED:360,CLEAR:480,DECISIVE:600})[tier]??360;
const cessionLimit=(tier,w=null)=>((w?.size??19)>=39?{WHITE:0,LIMITED:4,CLEAR:13,DECISIVE:20}:{WHITE:0,LIMITED:2,CLEAR:5,DECISIVE:9})[tier]??0;
function updateWarFatigue(w,war){
  war.fatigue??={[war.attackerId]:0,[war.defenderId]:0};
  war.lastCasualties??={[war.attackerId]:0,[war.defenderId]:0};
  for(const id of warMembers(war)){
    const losses=war.casualties[id]||0,increment=Math.max(0,losses-(war.lastCasualties[id]||0));
    const occupied=w.tiles.filter(t=>t.ownerId===id&&t.occupiedBy!==null&&t.occupiedBy!==id).length;
    const pop=w.settlements.filter(s=>s.ownerId===id).reduce((sum,s)=>sum+s.population,0);
    const fiscal=(w.nations[id].military?.unpaidQuarters||0);
    const cashStrain=w.nations[id].lastQuarter?.upkeep&&w.nations[id].lastQuarter.upkeepPaid<w.nations[id].lastQuarter.upkeep?2:0;
    const delta=.9+Math.min(18,increment/Math.max(20,pop)*180)+Math.min(5,occupied*.8)+Math.min(6,fiscal*1.5)+cashStrain;
    war.fatigue[id]=warGoalClamp(Number(((war.fatigue[id]||0)+delta).toFixed(2)),0,100);
    war.lastCasualties[id]=losses;
  }
}
/** E2A: measurable siege progress and finite bargaining delay for a winning AI. */
function strategicCaptureProgress(w,war,side){
  const enemies=new Set(warMembers(war).filter(id=>warSide(war,id)!==side));
  let value=0;
  for(const t of w.tiles)if(enemies.has(t.ownerId)&&t.occupiedBy!==null&&warSide(war,t.occupiedBy)===side)value+=100;
  for(const o of w.occupations)if(o.warId===war.id&&warSide(war,o.nationId)===side)value+=o.progress;
  return value;
}
function strategicSiegeActive(w,war,side){
  return w.occupations.some(o=>o.warId===war.id&&warSide(war,o.nationId)===side&&
    occupyingForces(w,o).some(a=>a.status==='READY'&&hCombatPresence(w,a)>0));
}
function extensionFiscalEmergency(w,war,id){
  const n=w.nations[id],q=n.lastQuarter;
  return (war.fatigue?.[id]||0)>=70||(n.military?.unpaidQuarters||0)>=2||
    (q&&q.upkeep>q.goldIncome&&n.gold<3*(q.upkeep-q.goldIncome));
}
function deferVictoryPeace(w,war,id){
  if(w.nations[id]?.controller!=='AI'||!warMembers(war).includes(id)||
    id!==war.attackerId&&id!==war.defenderId)return false;
  const outcome=warOutcome(w,war);
  if(outcome.winnerId!==id||Math.abs(outcome.advantage)<5||extensionFiscalEmergency(w,war,id))return false;
  const e=war.peaceExtension??{usedDays:0,untilDay:0,baselineProgress:0,lastReviewDay:-1};
  if(w.dayIndex<e.untilDay)return true;
  if(e.usedDays>=360||!strategicSiegeActive(w,war,warSide(war,id)))return false;
  const current=strategicCaptureProgress(w,war,warSide(war,id));
  if(e.usedDays>0&&current<e.baselineProgress+5)return false;
  if(e.lastReviewDay===w.dayIndex)return true;
  war.peaceExtension={usedDays:e.usedDays+120,untilDay:w.dayIndex+120,
    baselineProgress:current,lastReviewDay:w.dayIndex};
  war.peaceExtensions??=[];war.peaceExtensions.push({dayIndex:w.dayIndex,winnerId:id,usedDays:e.usedDays+120,score:outcome.advantage});
  w.changeSeq++;return true;
}
function acceptPeaceOffer(w,war,offer,respondentId){
  if(!offer||offer.proposerId===respondentId)return false;
  const profile=w.aiProfiles[w.nations[respondentId].aiProfileId];
  const compromise=(profile?.diplomacy?.compromise??50)/100;
  const fatigue=war.fatigue?.[respondentId]||0;
  const result=offer.terms;
  const elapsed=w.dayIndex-war.startedDay;
  if(result.tier==='WHITE')return fatigue>=14||elapsed>=660||compromise>=.78&&elapsed>=180;
  if(result.winnerId===respondentId){
    if(deferVictoryPeace(w,war,respondentId))return false;
    return true;
  }
  const severity={LIMITED:1,CLEAR:2,DECISIVE:3}[result.tier]||0;
  const demandRate=Number.isFinite(result.reparationRate)?result.reparationRate:1;
  const burden=quoteWarReparations(w,war,result.tier,result.winnerId,respondentId,demandRate,result).reparations;
  const affordableShare=burden/Math.max(1,w.nations[respondentId].gold);
  const fiscalPenalty=affordableShare*28+(result.subjectDemand?30:0);
  const ownLosses=war.casualties?.[respondentId]||0;
  return fatigue+compromise*30+Math.min(20,ownLosses/4)>=30+severity*14+fiscalPenalty||elapsed>=960&&fatigue>=35;
}
function wantsPeace(w,war,id){
  const elapsed=w.dayIndex-war.startedDay;if(elapsed<90)return false;
  const fatigue=war.fatigue?.[id]||0,goalDone=goalProgress(w,war)>0;
  const outcome=warOutcome(w,war),other=id===war.attackerId?war.defenderId:war.attackerId;
  const endurance=d1dEffectiveProfile(w,id)?.military?.warEndurance??50;
  if(w.nations[id].military?.unpaidQuarters>=2)return true;
  const econ=w.nations[id].lastQuarter;
  if(elapsed>=240&&econ?.upkeep>econ?.goldIncome&&w.nations[id].gold<3*(econ.upkeep-econ.goldIncome))return true; // avoid endless bankrupt warfare
  if(elapsed>=960&&Math.abs(outcome.advantage)<3)return true;
  // A town-center occupation alone does not justify throwing away its unconquered district.
  // Fatigued armies may still negotiate, so a difficult siege cannot freeze war forever.
  if(outcome.winnerId===id&&deferVictoryPeace(w,war,id))return false;
  if(outcome.winnerId===id&&war.goal?.type==='SETTLEMENT'&&id===war.attackerId&&
    goalProgress(w,war)>0&&goalProgress(w,war)<4&&elapsed<300&&fatigue<60)return false;
  if(outcome.winnerId===id&&elapsed>=150&&(goalDone||outcome.tier!=='LIMITED'))return true;
  if(outcome.winnerId===other&&fatigue>38+endurance*.24)return true;
  return fatigue>55+endurance*.18||elapsed>=1350;
}


