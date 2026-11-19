// --- src/core/config.js ---
/** VILOB Light: 새 구현. 국가명/색/성향 명칭만 본편의 콘텐츠를 참고한다. */
const VERSION = 'V0.8I'; // 0.8I: machine-gun suppression; V0.8H armored front and A-1R-H visuals preserved
// Current-version labels are driven by VERSION at bootstrap, not copied from older releases.
const F3G_FORT_HP=[0,100,180,260,380,540];
const F3G_FORT_RUIN_DAYS=3*120;
/** F3F: siege days are credited only when occupation remains uncontested. */
const F3F_SIEGE_DAYS=5;
const F3F_RALLY_MORALE=40;
const F3F_RALLY_MIN_MEN=12;
const F3F_RALLY_FRACTION=.25;
const MAP_SIZE = 19; // Keep map helper fallback stable for historic saves; startup explicitly selects 39x21.
const WIDE_WORLD_WIDTH = 39;
const WIDE_WORLD_HEIGHT = 21;
const DAYS_PER_QUARTER = 30;
const QUARTERS_PER_YEAR = 4;
const DAYS_PER_YEAR = DAYS_PER_QUARTER * QUARTERS_PER_YEAR;

const TERRAINS = Object.freeze({
  water:    { label: '물', color: '#255067', passable: false, symbol:'≈' },
  plain:    { label: '평야', color: '#a6ad79', passable: true, symbol: '·' },
  grass:    { label: '초지', color: '#829d73', passable: true, symbol: '·' },
  forest:   { label: '숲', color: '#587d68', passable: true, symbol: '♣' },
  rock:     { label: '암지', color: '#8d8980', passable: true, symbol: '◆' },
  mountain: { label: '산', color: '#6f7980', passable: true, symbol: '▲' },
});

const NATION_TEMPLATES = Object.freeze([
  {name:'키오',    profile:'survival',        personality:'생존안정형',   color:'#62a8ff', description:'안정과 방어를 중시하는 국가'},
  {name:'델마',    profile:'diplomatic',      personality:'교역외교형',   color:'#74d69c', description:'교류와 합의를 선호하는 국가'},
  {name:'벨른',    profile:'expansionist',    personality:'영토확장형',   color:'#ff8b91', description:'영토 확보에 적극적인 국가'},
  {name:'라엔',    profile:'balanced',        personality:'균형형',       color:'#bd9cff', description:'여러 목표를 균형 있게 추구하는 국가'},
  {name:'티아',    profile:'urbanist',        personality:'도시집약형',   color:'#f2b45b', description:'정착지 집중 개발을 지향하는 국가'},
  {name:'에브',    profile:'resource_seeker', personality:'자원개척형',   color:'#5fd0cf', description:'자원과 새로운 땅을 중시하는 국가'},
  {name:'카이렌',  profile:'technologist',    personality:'기술개발형',   color:'#e889c7', description:'지식과 발전 역량을 중시하는 국가'},
]);

/** Wide world's five additional nations. Legacy seven preserve their IDs, colors and profiles. */
const WIDE_NATION_TEMPLATES = Object.freeze([
  ...NATION_TEMPLATES,
  {name:'아르덴', profile:'road_admin',personality:'도로행정형',color:'#e5ca76',description:'도로망과 정착지의 연결을 우선하는 국가'},
  {name:'노르바', profile:'fortress',personality:'요새방어형',color:'#acaaa0',description:'방비를 다지고 위협에 대응하는 국가'},
  {name:'세렌', profile:'diplomatic_cautious',personality:'외교안정형',color:'#63a9a4',description:'교류와 안정을 중시하면서도 개척하는 국가'},
  {name:'로반', profile:'expansionist_opportunist',personality:'기회확장형',color:'#df855b',description:'군사적 기회를 활용해 빠르게 영토를 넓히는 국가'},
  {name:'베시아', profile:'urbanist_productive',personality:'생산도시형',color:'#be85cd',description:'인구와 도시 생산시설에 집중하는 국가'},
]);



/** C1: reusable independent AI identities, not a nation-count limit. */
const C1_EXTRA_NATIONS = Object.freeze([
  {name:'오르넬', profile:'agrarian_self_sufficient',personality:'농업자급형',color:'#D4A468',description:'식량 자급과 내부 안정에 우선 투자하는 국가'},
  {name:'세이른', profile:'coalition_diplomat',personality:'연합외교형',color:'#69B8E8',description:'동맹과 집단안보를 적극 추구하는 국가'},
  {name:'루미르', profile:'elite_military',personality:'군사정예형',color:'#CE7FDA',description:'편제의 훈련·숙련·보존을 중시하는 국가'},
  {name:'베르카', profile:'strategic_merchant',personality:'전략무역형',color:'#A8D86C',description:'교역 수입과 부족 물자 조달을 중시하는 국가'},
]);
const C1_WIDE_SIZES=Object.freeze([[48,27],[64,36],[80,45],[96,54],[112,63],[128,72],[132,75]]);
function c1ValidMapSize(w,h){return Number.isInteger(w)&&Number.isInteger(h)&&w*h<=10000&&(
 (w===19&&h===19)||(w===39&&h===21)||(w===50&&h===50)||(w===100&&h===100)||(w===80&&h===120)||C1_WIDE_SIZES.some(p=>p[0]===w&&p[1]===h));}
function c1DefaultNationCount(w,h){return w===19&&h===19?7:12;}
/** Conservative capacity gate; actual capital placement also checks separations. */
function c1NationCapacity(w,h){return Math.min(100,Math.max(c1DefaultNationCount(w,h),Math.floor(w*h*.55/16)));}
function c1Templates(w,h,count){
 const initial=w===19&&h===19?NATION_TEMPLATES:WIDE_NATION_TEMPLATES;
 const all=[...initial];
 for(let i=0;all.length<count;i++){
  const template=C1_EXTRA_NATIONS[i%4],cycle=Math.floor(i/4);
  const hue=(i*137+17)%360;
  // Deterministic color wheel for repetitions; the four original colors never change.
  const color=cycle===0?template.color:c1HslHex(hue,58,52);
  all.push({...template,name:cycle?`${template.name} 제${cycle+1}국`:template.name,color});
 }
 return all;
}
function c1HslHex(h,s,l){
 s/=100;l/=100;const a=s*Math.min(l,1-l);
 const channel=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');};
 return `#${channel(0)}${channel(8)}${channel(4)}`;
}
// --- src/core/rng.js ---
// 순수 함수 기반 난수. 본편 RNG 및 월드 생성 알고리즘을 사용하지 않는다.
function hashSeed(input) {
  const s=String(input);
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}
function hash32(n){
  n=(n+0x9e3779b9)|0;
  n=Math.imul(n^(n>>>16),0x21f0aaad);
  n=Math.imul(n^(n>>>15),0x735a2d97);
  return (n^(n>>>15))>>>0;
}
function coordRandom(seed,x,y,salt=0){
  return hash32((seed^Math.imul(x+101,374761393)^Math.imul(y+317,668265263)^Math.imul(salt+1,2246822519))>>>0)/4294967296;
}
function createRandom(seed){
  let state=hash32(seed)||0x6d2b79f5;
  return {next(){state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;},
          int(n){return Math.floor(this.next()*n);},
          get state(){return state>>>0;}};
}
function smoothNoise(seed,x,y,frequency,salt=0){
  const u=x/frequency,v=y/frequency,x0=Math.floor(u),y0=Math.floor(v);
  const fx=u-x0,fy=v-y0;
  const tx=fx*fx*(3-2*fx),ty=fy*fy*(3-2*fy);
  const a=coordRandom(seed,x0,y0,salt),b=coordRandom(seed,x0+1,y0,salt);
  const c=coordRandom(seed,x0,y0+1,salt),d=coordRandom(seed,x0+1,y0+1,salt);
  return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
}


// --- src/core/settlement-names.js ---
/** Stable settlement names, separate from sovereignty and present capital status. */
function markCapitalHistory(settlement,nationId){
  if(!Array.isArray(settlement.formerCapitalOf))settlement.formerCapitalOf=[];
  if(!settlement.formerCapitalOf.includes(nationId))settlement.formerCapitalOf.push(nationId);
}
function isCurrentCapital(world,settlement){
  const owner=world.nations[settlement.ownerId];
  return Boolean(owner?.active&&owner.capitalId===settlement.coreTileId);
}
function settlementDisplayName(world,settlement){
  const current=isCurrentCapital(world,settlement);
  const histories=settlement.formerCapitalOf||[];
  const first=histories[0],founder=world.nations[first];
  // Original proper names never change when sovereignty changes.
  // Initial '델마 수도' becomes '델마 고도' if it is no longer the actual capital.
  let historical=settlement.name;
  if(histories.length){
    historical=founder&&settlement.name===`${founder.name} 수도`
      ?`${founder.name} 고도`:`${settlement.name} · 고도`;
  }
  if(!current)return historical;
  const owner=world.nations[settlement.ownerId];
  if(histories.length===1&&histories[0]===owner.id&&settlement.name===`${owner.name} 수도`)
    return settlement.name;
  // Capital relocations and reconquests don't erase the historic name.
  return histories.length?`${owner.name} 수도 · ${historical}`:`${settlement.name} · 수도`;
}
function capitalHistoryLabel(world,settlement){
  return (settlement.formerCapitalOf||[]).map(id=>world.nations[id]?.name).filter(Boolean).join(' · ');
}


// --- src/sim/nation-identity.js ---
/** Stable nation identity, independent of AI profile and map colour. */
function validateNationName(name){
  if(typeof name!== 'string')throw Error('국가명은 문자열이어야 합니다.');
  const value=name.trim().replace(/\s+/g,' ');
  if(!value||value.length>30||/[<>\u0000-\u001f]/.test(value))throw Error('국가명은 1~30자이며 제어 문자와 < >를 사용할 수 없습니다.');
  return value;
}
function renameNation(world,nationId,input){
  const n=world.nations[nationId];if(!n)throw Error('없는 국가입니다.');
  const name=validateNationName(input);
  if(world.nations.some(other=>other.id!==n.id&&other.name===name))throw Error('동일한 국가명이 이미 존재합니다.');
  const old=n.name;if(old===name)return false;
  // Lock the historical names on existing completed-war reports before changing identity.
  for(const h of world.warHistory||[]){
    h.attackerName??=world.nations[h.attackerId]?.name;
    h.defenderName??=world.nations[h.defenderId]?.name;
    h.winnerName??=h.winnerId===null?null:world.nations[h.winnerId]?.name;
    h.participantNames??=Object.fromEntries([...(h.participants?.attackers||[h.attackerId]),...(h.participants?.defenders||[h.defenderId])].map(id=>[id,world.nations[id]?.name||'국가 없음']));
  }
  for(const treaty of world.peaceHistory||[]){
    treaty.participantNames??=Object.fromEntries([...(treaty.participants?.attackers||[treaty.attackerId]),...(treaty.participants?.defenders||[treaty.defenderId])].map(id=>[id,world.nations[id]?.name||'국가 없음']));
  }
  for(const s of world.settlements){
    if(s.founderNationId===n.id&&s.name===`${old} 수도`)s.name=`${name} 수도`;
  }
  n.name=name;world.changeSeq++;
  return true;
}


// --- src/sim/profiles.js ---
/** 국가명·프로필 ID와 무관한 AI 판단 데이터. 값 0~100. */
const militaryById={agrarian_self_sufficient:[19,37,82,43],coalition_diplomat:[27,45,73,55],elite_military:[57,88,81,77],strategic_merchant:[26,51,63,44],survival:[25,54,88,42],diplomatic:[18,40,70,35],expansionist:[88,80,38,78],balanced:[56,63,58,62],urbanist:[31,54,76,50],resource_seeker:[62,65,52,58],technologist:[30,59,62,52],road_admin:[28,51,77,54],fortress:[31,78,99,83],diplomatic_cautious:[23,47,78,42],expansionist_opportunist:[81,81,44,69],urbanist_productive:[26,57,68,50]};
const compositionById={agrarian_self_sufficient:[38,66,70],coalition_diplomat:[45,58,64],elite_military:[63,79,57],strategic_merchant:[55,54,61],survival:[22,68,74],diplomatic:[48,50,66],expansionist:[46,61,43],balanced:[52,52,51],urbanist:[60,52,60],resource_seeker:[37,72,43],technologist:[75,46,58],road_admin:[43,63,61],fortress:[30,80,70],diplomatic_cautious:[45,62,66],expansionist_opportunist:[48,66,47],urbanist_productive:[61,51,57]};
const palette={agrarian_self_sufficient:'#D4A468',coalition_diplomat:'#69B8E8',elite_military:'#CE7FDA',strategic_merchant:'#A8D86C',survival:'#62A8FF',diplomatic:'#74D69C',expansionist:'#FF8B91',balanced:'#BD9CFF',urbanist:'#F2B45B',resource_seeker:'#5FD0CF',technologist:'#E889C7',road_admin:'#E5CA76',fortress:'#ACAAA0',diplomatic_cautious:'#63A9A4',expansionist_opportunist:'#DF855B',urbanist_productive:'#BE85CD'};
/** V0.6A2: five observer-specific shares, not bilateral relation or raw strength. */
const POWER_PERCEPTION_KEYS=Object.freeze(['military','population','economy','territory','technology']);
const POWER_PERCEPTION_BASE=Object.freeze({military:25,population:20,economy:20,territory:15,technology:20});
const POWER_PERCEPTION_BY_ID=Object.freeze({
  agrarian_self_sufficient:[18,23,31,16,12], coalition_diplomat:[22,13,31,9,25],
  elite_military:[43,12,13,19,13], strategic_merchant:[15,16,43,10,16],
  survival:[38,18,17,17,10], diplomatic:[15,12,38,10,25],
  expansionist:[43,12,10,25,10], balanced:[25,20,20,15,20],
  urbanist:[15,25,35,10,15], resource_seeker:[20,15,38,22,5],
  technologist:[18,10,18,9,45], road_admin:[18,15,30,27,10],
  fortress:[44,13,12,25,6], diplomatic_cautious:[29,13,28,12,18],
  expansionist_opportunist:[40,10,23,22,5], urbanist_productive:[14,24,40,9,13]
});
/** Largest-remainder percentages, stable order, deterministic, no RNG. */
function v06a2NormalizeWeights(raw,total=100){
 const values=POWER_PERCEPTION_KEYS.map(k=>Math.max(0,Number(raw[k])||0));
 const sum=values.reduce((a,b)=>a+b,0);
 if(sum<=0){const base=POWER_PERCEPTION_BASE;return total===100?{...base}:v06a2NormalizeWeights(base,total);}
 const scaled=values.map(v=>v/sum*total),parts=scaled.map(Math.floor);
 const order=parts.map((_,i)=>i).sort((a,b)=>(scaled[b]-parts[b])-(scaled[a]-parts[a])||a-b);
 for(let left=total-parts.reduce((a,b)=>a+b,0),i=0;left>0;i++,left--)parts[order[i]]++;
 return Object.fromEntries(POWER_PERCEPTION_KEYS.map((key,i)=>[key,parts[i]]));
}
function v06a2LegacyWeights(profile){
 const preset=POWER_PERCEPTION_BY_ID[profile.id];
 if(preset)return Object.fromEntries(POWER_PERCEPTION_KEYS.map((key,i)=>[key,preset[i]]));
 const w=profile.weights||{},m=profile.military||{};
 return v06a2NormalizeWeights({
  military:.55*(m.militaryInvestment??50)+.45*(m.defensivePreference??50),
  population:.65*(w.development??50)+.35*(w.founding??50),
  economy:.6*(w.development??50)+.4*(w.knowledge??50),
  territory:.65*(w.expansion??50)+.35*(w.founding??50),
  technology:w.knowledge??50
 });
}
function v06a2EnsureProfile(profile){
 v06e6EnsureProfile(profile);
 if(profile.powerPerception===undefined)profile.powerPerception=v06a2LegacyWeights(profile);
 return profile;
}
/** Editing one share rebalances the other four; the chosen value is exact. */
function v06a2RebalanceWeights(values,key,newValue){
 const fixed=Math.max(0,Math.min(100,Math.round(Number(newValue)||0)));
 const other=POWER_PERCEPTION_KEYS.filter(k=>k!==key);
 const rest=100-fixed;
 const sum=other.reduce((a,k)=>a+(values[k]||0),0);
 const scaled=other.map(k=>sum>0?(values[k]||0)/sum*rest:rest/other.length);
 const parts=scaled.map(Math.floor);
 const order=parts.map((_,i)=>i).sort((a,b)=>(scaled[b]-parts[b])-(scaled[a]-parts[a])||a-b);
 for(let left=rest-parts.reduce((a,b)=>a+b,0),i=0;left>0;i++,left--)parts[order[i]]++;
 return {...values,...Object.fromEntries(other.map((k,i)=>[k,parts[i]])),[key]:fixed};
}
const makeProfile=(id,name,weights,behavior,terrainPreference)=>({id,name,schemaVersion:4,recommendedColor:palette[id],weights,behavior,terrainPreference,powerPerception:v06a2LegacyWeights({id}),diplomacy:{cooperation:({survival:52,diplomatic:88,expansionist:18,balanced:55,urbanist:60,resource_seeker:35,technologist:48,agrarian_self_sufficient:42,coalition_diplomat:97,elite_military:31,strategic_merchant:80}[id]??50),compromise:({survival:64,diplomatic:84,expansionist:25,balanced:55,urbanist:67,resource_seeker:40,technologist:57,agrarian_self_sufficient:58,coalition_diplomat:92,elite_military:48,strategic_merchant:85}[id]??50)},military:Object.fromEntries(['aggression','militaryInvestment','defensivePreference','warEndurance','rangedPreference','spearPreference','reservePreference'].map((k,i)=>[k,i<4?militaryById[id][i]:compositionById[id][i-4]]))});
const terrain={plain:65,grass:65,forest:48,rock:32,mountain:12};
const DEFAULT_PROFILES=Object.freeze([
  makeProfile('survival','생존안정형',{expansion:42,founding:43,development:78,knowledge:48},{riskTolerance:25,frontierPreference:24},{...terrain,plain:82,grass:78}),
  makeProfile('diplomatic','교역외교형',{expansion:44,founding:62,development:75,knowledge:65},{riskTolerance:35,frontierPreference:32},{...terrain,plain:78,grass:78}),
  makeProfile('expansionist','영토확장형',{expansion:96,founding:72,development:38,knowledge:25},{riskTolerance:85,frontierPreference:84},{...terrain,rock:46,mountain:25}),
  makeProfile('balanced','균형형',{expansion:65,founding:64,development:65,knowledge:63},{riskTolerance:52,frontierPreference:50},{...terrain}),
  makeProfile('urbanist','도시집약형',{expansion:26,founding:25,development:98,knowledge:78},{riskTolerance:24,frontierPreference:18},{...terrain,plain:83}),
  makeProfile('resource_seeker','자원개척형',{expansion:84,founding:69,development:45,knowledge:43},{riskTolerance:70,frontierPreference:73},{...terrain,forest:95,rock:92,mountain:56}),
  makeProfile('technologist','기술개발형',{expansion:38,founding:44,development:67,knowledge:100},{riskTolerance:40,frontierPreference:35},{...terrain,rock:62}),
  makeProfile('road_admin','도로행정형',{expansion:50,founding:91,development:99,knowledge:58},{riskTolerance:27,frontierPreference:29},{...terrain,plain:86,grass:83}),
  makeProfile('fortress','요새방어형',{expansion:43,founding:48,development:90,knowledge:51},{riskTolerance:19,frontierPreference:24},{...terrain,rock:61,mountain:42}),
  makeProfile('diplomatic_cautious','외교안정형',{expansion:48,founding:64,development:79,knowledge:71},{riskTolerance:30,frontierPreference:33},{...terrain,plain:80,grass:80}),
  makeProfile('expansionist_opportunist','기회확장형',{expansion:93,founding:67,development:48,knowledge:37},{riskTolerance:76,frontierPreference:78},{...terrain,forest:66,rock:50}),
  makeProfile('urbanist_productive','생산도시형',{expansion:32,founding:32,development:100,knowledge:73},{riskTolerance:27,frontierPreference:23},{...terrain,plain:87,grass:84}),
  makeProfile('agrarian_self_sufficient','농업자급형',{expansion:24,founding:42,development:98,knowledge:46},{riskTolerance:19,frontierPreference:17},{...terrain,plain:98,grass:96,forest:45,rock:19,mountain:6}),
  makeProfile('coalition_diplomat','연합외교형',{expansion:48,founding:70,development:69,knowledge:73},{riskTolerance:36,frontierPreference:39},{...terrain,plain:81,grass:82,forest:52,rock:26,mountain:8}),
  makeProfile('elite_military','군사정예형',{expansion:57,founding:49,development:65,knowledge:74},{riskTolerance:38,frontierPreference:33},{...terrain,plain:70,grass:70,forest:51,rock:48,mountain:27}),
  makeProfile('strategic_merchant','전략무역형',{expansion:46,founding:80,development:83,knowledge:74},{riskTolerance:34,frontierPreference:35},{...terrain,plain:95,grass:89,forest:57,rock:30,mountain:9})
]);
const weightKeys=['expansion','founding','development','knowledge'];
const behaviorKeys=['riskTolerance','frontierPreference'];
const terrainKeys=['plain','grass','forest','rock','mountain'];
const militaryKeys=['aggression','militaryInvestment','defensivePreference','warEndurance','rangedPreference','spearPreference','reservePreference'];
function validateProfile(profile){
  if(!profile||typeof profile!=='object'||typeof profile.id!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(profile.id)||['__proto__','constructor','prototype'].includes(profile.id))throw Error('AI 프로필 ID가 올바르지 않습니다.');
  if(typeof profile.name!=='string'||!profile.name.trim()||profile.name.length>60||profile.schemaVersion!==4)throw Error('AI 프로필 이름 또는 형식이 잘못되었습니다.');
  for(const [group,keys] of [['weights',weightKeys],['behavior',behaviorKeys],['terrainPreference',terrainKeys],['military',militaryKeys],['diplomacy',['cooperation','compromise']]]){
    if(!profile[group]||typeof profile[group]!=='object')throw Error('AI 프로필 항목이 없습니다: '+group);
    for(const key of keys){const value=profile[group][key];if(!Number.isFinite(value)||value<0||value>100)throw Error('AI 프로필 수치가 0~100 범위를 벗어났습니다: '+group+'.'+key);}
  }
  if(profile.policy!==undefined&&(!profile.policy||typeof profile.policy!=='object'||['assimilationPreference','stateViolencePreference'].some(k=>!Number.isSafeInteger(profile.policy[k])||profile.policy[k]<0||profile.policy[k]>100)))throw Error('E6 문화 정책 성향이 0~100 범위를 벗어났습니다.');
  if(profile.powerPerception!==undefined){
    const p=profile.powerPerception;
    if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==5||
       POWER_PERCEPTION_KEYS.some(k=>!Number.isSafeInteger(p[k])||p[k]<0||p[k]>100)||
       POWER_PERCEPTION_KEYS.reduce((sum,k)=>sum+p[k],0)!==100)
      throw Error('상대 세력 인식 가중치는 정수 0~100이며 총합이 100이어야 합니다.');
  }
  if(profile.recommendedColor!==undefined&&(typeof profile.recommendedColor!=='string'||!/^#[0-9a-fA-F]{6}$/.test(profile.recommendedColor)))throw Error('AI 추천 색상이 올바르지 않습니다.');
  return true;
}
function buildProfileLibrary(wide=false){return Object.fromEntries((wide?DEFAULT_PROFILES:DEFAULT_PROFILES.slice(0,7)).map(p=>[p.id,v06a2EnsureProfile(structuredClone(p))]));}
function addAIProfile(world,profile){
  validateProfile(profile);
  world.aiProfiles[profile.id]=v06a2EnsureProfile(JSON.parse(JSON.stringify(profile)));
  return profile.id;
}
function assignAIProfile(world,nationId,profileId){
  const n=world.nations[nationId];if(!n||!world.aiProfiles[profileId])throw Error('국가 또는 AI 프로필이 없습니다.');
  n.aiProfileId=profileId;
}
function setController(world,nationId,controller){
  const n=world.nations[nationId];if(!n||!['AI','PLAYER'].includes(controller))throw Error('국가 또는 컨트롤러가 잘못되었습니다.');
  n.controller=controller;
  if(world.v06e6Policy?.enabled)e2aOnControllerChange(world,n,controller); // E6 immediate handoff: inherited E5 policy must not execute under AI.
  if(controller!=='AI'&&n.constructionProcurement)n.constructionProcurement.plan=null;
}


// --- src/sim/profile-editor.js ---
/** V0.2C: validated profile library and nation presentation metadata. Pure, RNG-free operations. */

const PROFILE_GROUPS=Object.freeze({
  policy:{label:'E6 문화·국가 정책',fields:{assimilationPreference:'문화 동화 선호',stateViolencePreference:'국가폭력 정책 성향'}},
  weights:{label:'국가 개발',fields:{expansion:'영토 확장',founding:'정착지·도로',development:'건설·도시 개발',knowledge:'지식 투자'}},
  behavior:{label:'판단 성향',fields:{riskTolerance:'위험 감수',frontierPreference:'국경 개척 선호'}},
  terrainPreference:{label:'지형 선호',fields:{plain:'평야',grass:'초지',forest:'숲',rock:'암지',mountain:'산'}},
  military:{label:'군사',fields:{aggression:'공격 성향',militaryInvestment:'군사 투자',defensivePreference:'방어 선호',warEndurance:'전쟁 지속',rangedPreference:'궁병 선호',spearPreference:'창병 선호',reservePreference:'예비대 선호'}},
  diplomacy:{label:'외교',fields:{cooperation:'협력 성향',compromise:'타협 성향'}},
  powerPerception:{label:'상대 국력 인식',fields:{military:'군사력',population:'인구',economy:'경제력',territory:'영토',technology:'기술력'}}
});
const HEX_COLOR=/^#[0-9a-fA-F]{6}$/;
const BASE_PROFILE_IDS=new Set(DEFAULT_PROFILES.map(p=>p.id));
const cloneProfile=p=>v06a2EnsureProfile(structuredClone(p));
function validColor(value){if(typeof value!=='string'||!HEX_COLOR.test(value))throw Error('색상은 #RRGGBB 형식이어야 합니다.');return value.toUpperCase();}
function validateCustomLibrary(library){
  if(!library||typeof library!=='object'||Array.isArray(library)||Object.keys(library).length>88)throw Error('프로필 라이브러리 형식이나 개수가 올바르지 않습니다.');
  const out=Object.create(null);
  for(const [id,p] of Object.entries(library)){
    if(BASE_PROFILE_IDS.has(id)||id!==p?.id)throw Error('기본 프로필은 덮어쓸 수 없습니다.');
    validateProfile(p);out[id]=cloneProfile(p);
  }
  return out;
}
function saveCustomProfile(world,profile){
  validateProfile(profile);
  if(BASE_PROFILE_IDS.has(profile.id))throw Error('기본 프로필을 직접 수정할 수 없습니다. 복제해 주세요.');
  if(!world.aiProfiles[profile.id]&&Object.keys(world.aiProfiles).length>=104)throw Error('프로필은 104개까지 등록할 수 있습니다.');
  world.aiProfiles[profile.id]=cloneProfile(profile);world.changeSeq++;
  return profile.id;
}
function removeCustomProfile(world,id){
  if(BASE_PROFILE_IDS.has(id))throw Error('기본 프로필은 삭제할 수 없습니다.');
  if(world.nations.some(n=>n.aiProfileId===id))throw Error('국가에 사용 중인 프로필입니다. 국가 배정을 먼저 변경해 주세요.');
  if(!world.aiProfiles[id])throw Error('프로필이 없습니다.');
  delete world.aiProfiles[id];world.changeSeq++;
}
function setNationColor(world,nationId,color){
  const nation=world.nations[nationId];if(!nation)throw Error('국가가 없습니다.');
  nation.color=validColor(color);world.changeSeq++;
}
function applyNationProfile(world,nationId,profileId){
  if(!world.aiProfiles[profileId]||!world.nations[nationId])throw Error('국가 또는 프로필이 없습니다.');
  world.nations[nationId].aiProfileId=profileId;world.changeSeq++;
}
function encodeProfileJson(profile){validateProfile(profile);return JSON.stringify(profile,null,2);}
function decodeProfilesJson(json){
  if(typeof json!=='string'||json.length>100000)throw Error('프로필 JSON이 너무 큽니다.');
  const value=JSON.parse(json),array=Array.isArray(value)?value:[value];
  if(array.length>88)throw Error('한번에 가져올 수 있는 프로필이 너무 많습니다.');
  const seen=new Set();for(const p of array){validateProfile(p);if(seen.has(p.id)||BASE_PROFILE_IDS.has(p.id))throw Error('프로필 ID 중복 또는 기본 ID 충돌: '+p.id);seen.add(p.id);}
  return array.map(cloneProfile);
}


// V0.7H — independent modular automatons. Human population and UnitGroups are never reused.
const H_ENABLED=true;
const H_TECH_IDS=new Set(['automaton_assembly','automaton_field_control','automaton_maintenance']);
const H_SLOT_KEYS=Object.freeze(['chassis','power','mobility','weapon','armor','utility']);
const H_CATALOG=Object.freeze({
 chassis:Object.freeze({id:'light_frame_i',name:'경량 본체 I',hp:35,armor:3,capacity:55,mass:0,powerDraw:0,price8:{gold:16,resources:{wood:4,iron:8}}}),
 power:Object.freeze({id:'compact_steam_i',name:'소형 동력원 I',mass:7,powerOutput:8,powerDraw:0,price8:{gold:8,resources:{iron:2,coal:4,machine_parts:1}}}),
 mobility:Object.freeze({id:'simple_walker_i',name:'기본 보행 장치 I',mass:11,powerDraw:2,price8:{gold:8,resources:{iron:2}}}),
 weapon:Object.freeze({id:'light_shooter_i',name:'소형 사격 장치 I',mass:9,powerDraw:2,penetration:18,opening:2.20,sustained:1.16,melee:.16,price8:{gold:12,resources:{wood:2,iron:2}}}),
 armor:Object.freeze({id:'thin_iron_i',name:'경량 철제 장갑 I',mass:8,armor:9,powerDraw:0,price8:{gold:6,resources:{iron:2}}}),
 utility:Object.freeze({id:'basic_magazine_i',name:'기본 탄약 장치 I',mass:5,powerDraw:0,price8:{gold:6,resources:{wood:2}}})
});
// H2F — real, immutable fitted modules. One module per slot in the initial
// three standard blueprints; multi-slot expansion belongs to H2G.
// Baseline production still manufactures six GENERIC slot-parts (8 per batch).
// Module-specific production and inventory must NOT be inferred here.
const H2F_MODULES=Object.freeze({
 chassis:Object.freeze({
  light_frame_i:Object.freeze(H_CATALOG.chassis),
  reinforced_frame_i:Object.freeze({id:'reinforced_frame_i',name:'강화 프레임 I',hp:50,armor:3,capacity:78,mass:6,powerDraw:0,
   assemblyGold:5,assemblyResources:Object.freeze({iron:2,coal:1}),repairGold:1,repairIron:.125}),
  support_frame_i:Object.freeze({id:'support_frame_i',name:'화력지원 프레임 I',hp:30,armor:3,capacity:65,mass:2,powerDraw:0,
   assemblyGold:9,assemblyResources:Object.freeze({iron:2,machine_parts:1}),repairGold:2,repairIron:.25})}),
 power:Object.freeze({
  compact_steam_i:Object.freeze(H_CATALOG.power),
  reinforced_steam_i:Object.freeze({id:'reinforced_steam_i',name:'강화 증기기관 I',mass:10,powerOutput:13,powerDraw:0,fuelFactor:1.5}),
  pressurized_steam_i:Object.freeze({id:'pressurized_steam_i',name:'가압 증기기관 I',mass:8,powerOutput:10,powerDraw:0,fuelFactor:1.35})}),
 mobility:Object.freeze({
  simple_walker_i:Object.freeze(H_CATALOG.mobility),
  heavy_walker_i:Object.freeze({id:'heavy_walker_i',name:'중량 보행 장치 I',mass:15,powerDraw:4}),
  stable_walker_i:Object.freeze({id:'stable_walker_i',name:'안정화 보행 장치 I',mass:10,powerDraw:2})}),
 weapon:Object.freeze({
  light_shooter_i:Object.freeze({...H_CATALOG.weapon,contact:.12}),
  frontline_weapon_i:Object.freeze({id:'frontline_weapon_i',name:'전열 대응 무장 I',mass:12,powerDraw:3,penetration:8,opening:.45,sustained:.32,contact:.28,melee:.70}),
  heavy_shooter_i:Object.freeze({id:'heavy_shooter_i',name:'강화 사격 장치 I',mass:14,powerDraw:5,penetration:31,opening:3.5,sustained:2.2,contact:.07,melee:.08})}),
 armor:Object.freeze({
  thin_iron_i:Object.freeze(H_CATALOG.armor),
  reinforced_iron_i:Object.freeze({id:'reinforced_iron_i',name:'중장갑 철판 I',mass:17,armor:23,powerDraw:0}),
  thin_support_i:Object.freeze({id:'thin_support_i',name:'초경량 방호판 I',mass:7,armor:4,powerDraw:0})}),
 utility:Object.freeze({
  basic_magazine_i:Object.freeze(H_CATALOG.utility),
  armored_service_i:Object.freeze({id:'armored_service_i',name:'전열 방호 장치 I',mass:5,powerDraw:0,ammoFactor:.7}),
  precision_aim_i:Object.freeze({id:'precision_aim_i',name:'기계식 조준 보조 I',mass:5,powerDraw:1,ammoFactor:1.7})})
});
const H2F_BLUEPRINT_DATA=Object.freeze([
 Object.freeze({id:'light_infantry_support_i',name:'경량 보병지원-01',requiredTech:'automaton_assembly',
  chassisId:'light_frame_i',slots:Object.freeze({power:['compact_steam_i'],mobility:['simple_walker_i'],weapon:['light_shooter_i'],armor:['thin_iron_i'],utility:['basic_magazine_i']})}),
 Object.freeze({id:'armored_frontline_i',name:'중장갑 전열-02',requiredTech:'automaton_maintenance',
  chassisId:'reinforced_frame_i',slots:Object.freeze({power:['reinforced_steam_i'],mobility:['heavy_walker_i'],weapon:['frontline_weapon_i'],armor:['reinforced_iron_i'],utility:['armored_service_i']})}),
 Object.freeze({id:'fire_support_i',name:'화력지원-03',requiredTech:'automaton_field_control',
  chassisId:'support_frame_i',slots:Object.freeze({power:['pressurized_steam_i'],mobility:['stable_walker_i'],weapon:['heavy_shooter_i'],armor:['thin_support_i'],utility:['precision_aim_i']})})
]);
// Hash changes only with canonical fitted module IDs; never with UI labels/costs.
// Rev.2 is intentionally distinct from the old identical-slot rev.1 save records.
function h2fHash(bp){
 const names=[bp.chassisId,...H_SLOT_KEYS.slice(1).map(slot=>bp.slots[slot].join('+'))];
 let v=2166136261;
 for(const c of names.join('|')){v^=c.charCodeAt(0);v=Math.imul(v,16777619);}
 return 'H2F-'+(v>>>0).toString(16).padStart(8,'0');
}
function h2fBlueprint(data){return Object.freeze({id:data.id,revision:2,name:data.name,chassisId:data.chassisId,
 slots:data.slots,designHash:h2fHash(data)});}
function h2fEvaluate(bp){
 const fitted=Object.create(null);
 fitted.chassis=H2F_MODULES.chassis[bp.chassisId];
 if(!fitted.chassis)throw Error('H2F 알 수 없는 프레임: '+bp.chassisId);
 for(const slot of H_SLOT_KEYS.slice(1)){
  const ids=bp.slots?.[slot];
  if(!Array.isArray(ids)||ids.length!==1||!H2F_MODULES[slot][ids[0]])throw Error('H2F 잘못된 슬롯 '+slot+' / '+bp.id);
  fitted[slot]=H2F_MODULES[slot][ids[0]];
 }
 const parts=H_SLOT_KEYS.map(slot=>fitted[slot]),add=key=>parts.reduce((s,p)=>s+(p[key]||0),0);
 const multiplier=key=>parts.reduce((v,p)=>v*(p[key]??1),1);
 const assemblyResources={};
 for(const p of parts)for(const [resource,qty] of Object.entries(p.assemblyResources||{}))assemblyResources[resource]=(assemblyResources[resource]||0)+qty;
 const result={weight:add('mass'),capacity:fitted.chassis.capacity,power:add('powerDraw'),supply:add('powerOutput'),
  armor:add('armor'),hp:add('hp'),penetration:add('penetration'),
  opening:add('opening'),sustained:add('sustained'),contact:add('contact'),melee:add('melee'),
  fuelFactor:multiplier('fuelFactor'),ammoFactor:multiplier('ammoFactor'),
  repairGold:add('repairGold'),repairIron:add('repairIron'),extraGold:add('assemblyGold'),extra:Object.freeze(assemblyResources),
  moduleIds:Object.freeze(Object.fromEntries(H_SLOT_KEYS.map(slot=>[slot,fitted[slot].id]))),
  powerMargin:add('powerOutput')-add('powerDraw'),overloaded:add('mass')>fitted.chassis.capacity,
  healthLabel:add('hp')};
 for(const key of ['weight','capacity','power','supply','armor','hp','penetration','opening','sustained','contact','melee','fuelFactor','ammoFactor','repairGold','repairIron','extraGold'])
  if(!Number.isFinite(result[key])||result[key]<0)throw Error('H2F 모듈 산출값 유효하지 않음: '+bp.id+' '+key);
 return Object.freeze(result);
}
function h2fRecommendedRole(spec){return spec.armor>=20&&spec.melee>=.6?'front':'rear';}
const H2A_DESIGNS=Object.freeze(Object.fromEntries(H2F_BLUEPRINT_DATA.map(data=>{
 const blueprint=h2fBlueprint(data),performance=h2fEvaluate(blueprint);
 return [data.id,Object.freeze({blueprint,role:h2fRecommendedRole(performance),requiredTech:data.requiredTech,...performance})];
})));
const H_BLUEPRINT=H2A_DESIGNS.light_infantry_support_i.blueprint;
// One-time conversion only, before strict save validation. No machine, cost,
// resource, nation, RNG, army, or historical counter changes.
const H2F_LEGACY_HASHES=Object.freeze({light_infantry_support_i:'H1-light-v1',armored_frontline_i:'H2A-armored-v1',fire_support_i:'H2A-fire-v1'});
function h2fMigrateWorld(w){
 const state=w.hAutomaton;if(!state||!Array.isArray(state.blueprints)||!Array.isArray(state.groups))return;
 const migrated=new Set();
 for(const bp of state.blueprints){
  const target=H2A_DESIGNS[bp.id]?.blueprint;
  if(!target||bp.revision!==1||bp.designHash!==H2F_LEGACY_HASHES[bp.id])continue;
  const owner=bp.ownerNationId;
  Object.assign(bp,structuredClone(target));bp.ownerNationId=owner;
  migrated.add(owner+':'+bp.id);
 }
 for(const g of state.groups)if(g.revision===1&&migrated.has(g.ownerNationId+':'+g.blueprintId))g.revision=2;
}
// Guardrail: H2F module arithmetic must reproduce ALL H2E baseline stats.
// These are assertion references, never used to supply combat values.
function h2fRegressionCatalog(){
 const expected={
  light_infantry_support_i:[12,18,2.20,1.16,.12,.16,1,1,35,0,0],
  armored_frontline_i:[26,8,.45,.32,.28,.70,1.5,.7,50,5,1],
  fire_support_i:[7,31,3.5,2.2,.07,.08,1.35,1.7,30,9,2]};
 for(const [id,arr] of Object.entries(expected)){
  const d=H2A_DESIGNS[id],actual=[d.armor,d.penetration,d.opening,d.sustained,d.contact,d.melee,d.fuelFactor,d.ammoFactor,d.hp,d.extraGold,d.repairGold];
  if(actual.some((value,i)=>Math.abs(value-arr[i])>1e-9)||d.overloaded||d.powerMargin<0)
   throw Error('H2F 기본 설계 회귀: '+id);
 }
 return true;
}
h2fRegressionCatalog();


// H2G — Nation-owned revisioned designs and physical per-module stocks.
// Standard AI keeps H2F's paid preset auto-upgrade path. A player custom
// machine instead needs exact already-manufactured module IDs in inventory.
const H2G_MAX_DESIGNS=6;
const H2G_MODULE_KEYS=Object.freeze(H_SLOT_KEYS.flatMap(slot=>Object.keys(H2F_MODULES[slot])));
const H2G_BASE_IDS=Object.freeze(Object.fromEntries(H_SLOT_KEYS.map(k=>[k,H_CATALOG[k].id])));
const H2G_MODULE_SLOT=Object.freeze(Object.fromEntries(H_SLOT_KEYS.flatMap(k=>Object.keys(H2F_MODULES[k]).map(id=>[id,k]))));
const H2G_UPGRADE_PRICES=Object.freeze({
 reinforced_frame_i:{gold:5,resources:{iron:2,coal:1}},
 support_frame_i:{gold:9,resources:{iron:2,machine_parts:1}},
 reinforced_steam_i:{gold:3,resources:{iron:1,coal:1}},
 pressurized_steam_i:{gold:3,resources:{iron:1,coal:1}},
 heavy_walker_i:{gold:2,resources:{iron:2}},
 stable_walker_i:{gold:2,resources:{iron:1}},
 frontline_weapon_i:{gold:3,resources:{iron:2}},
 heavy_shooter_i:{gold:4,resources:{iron:2,machine_parts:1}},
 reinforced_iron_i:{gold:3,resources:{iron:2}},
 thin_support_i:{gold:2,resources:{iron:1}},
 armored_service_i:{gold:2,resources:{iron:1}},
 precision_aim_i:{gold:3,resources:{machine_parts:1}}
});
function h2gModuleTech(id){
 if(['support_frame_i','heavy_shooter_i','thin_support_i','precision_aim_i','pressurized_steam_i','stable_walker_i'].includes(id))return 'automaton_field_control';
 if(H2G_UPGRADE_PRICES[id])return 'automaton_maintenance';
 return 'automaton_assembly';
}
function h2gCanModule(w,nid,id){return !!H2G_MODULE_SLOT[id]&&hasTech(w,nid,h2gModuleTech(id));}
function h2gBpParts(bp){return Object.fromEntries(H_SLOT_KEYS.map(k=>[k,k==='chassis'?bp.chassisId:bp.slots[k][0]]));}
const h2gPerformanceCache=new Map();
function h2gResolve(w,nid,id,revision=null){
 const standard=H2A_DESIGNS[id];if(standard)return standard;
 const inv=w.nations[nid]?.hAutomaton;
 const rev=revision??inv?.h2g?.current?.[id];
 const bp=w.hAutomaton?.blueprints?.find(x=>x.ownerNationId===nid&&x.id===id&&x.revision===rev&&id.startsWith('h2g_n'));
 if(!bp)return null;
 const key=nid+'|'+id+'|'+bp.revision+'|'+bp.designHash;
 let d=h2gPerformanceCache.get(key);
 if(!d){const performance=h2fEvaluate(bp);d=Object.freeze({role:h2fRecommendedRole(performance),requiredTech:'automaton_assembly',...performance});h2gPerformanceCache.set(key,d);}
 return {...d,blueprint:bp};
}
function h2gAllDesigns(w,nid){
 const ids=Object.keys(w.nations[nid].hAutomaton.h2g.current);
 return [...H2A_DESIGN_IDS.map(id=>H2A_DESIGNS[id]),...ids.map(id=>h2gResolve(w,nid,id)).filter(Boolean)];
}
function h2gCanDesign(w,nid,id,revision=null){
 const d=h2gResolve(w,nid,id,revision);
 return !!d&&(H2A_DESIGNS[id]?h2aCanDesign(w,nid,id):H_SLOT_KEYS.every(k=>h2gCanModule(w,nid,d.moduleIds[k])));
}
function h2gStored(w,nid,id,revision=null){
 const inv=w.nations[nid].hAutomaton;
 if(H2A_DESIGNS[id])return h2aStored(inv,id);
 const rev=revision??inv.h2g.current[id];
 return inv.h2g.finished[id+'@'+rev]||0;
}
function h2gStockSum(inv,slot){return Object.entries(inv.h2g.stock).reduce((v,[id,qty])=>v+(H2G_MODULE_SLOT[id]===slot?qty:0),0);}
function h2gChangeStock(inv,id,amount){
 if(!Number.isSafeInteger(amount)||!H2G_MODULE_SLOT[id])throw Error('H2G 잘못된 파츠 이동');
 const next=inv.h2g.stock[id]+amount;
 if(!Number.isSafeInteger(next)||next<0)throw Error('H2G 파츠 재고 부족: '+id);
 inv.h2g.stock[id]=next;inv.parts[H2G_MODULE_SLOT[id]]+=amount;
}
function h2gExternal(inv,id,amount){inv.h2g.delta[id]+=amount;}
function h2gCountInstalled(w,nid){
 const out=Object.fromEntries(H2G_MODULE_KEYS.map(id=>[id,0]));
 const inv=w.nations[nid].hAutomaton;
 const count=(bp,qty)=>{if(!qty)return;for(const id of Object.values(h2gBpParts(bp)))out[id]+=qty;};
 for(const group of w.hAutomaton.groups)if(group.ownerNationId===nid){
  const d=h2gResolve(w,nid,group.blueprintId,group.revision);if(!d)return null;
  count(d.blueprint,hAliveMachine(w,group));
 }
 for(const [id,qty] of Object.entries(inv.storedByBlueprint))if(H2A_DESIGNS[id])count(H2A_DESIGNS[id].blueprint,qty);
 for(const [key,qty] of Object.entries(inv.h2g.finished)){
  const at=key.lastIndexOf('@'),id=key.slice(0,at),rev=Number(key.slice(at+1));
  const d=h2gResolve(w,nid,id,rev);if(!d)return null;count(d.blueprint,qty);
 }
 return out;
}
function h2gEnsure(w){
 if(!w.hAutomaton||w.hAutomaton.h2gVersion===1&&w.hAutomaton.h2gNationCount===w.nations.length)return;
 w.hAutomaton.h2gVersion=1;w.hAutomaton.h2gNextId??=1;
 for(const n of w.nations){
  const inv=n.hAutomaton;
  if(inv.h2g)continue;
  const stock=Object.fromEntries(H2G_MODULE_KEYS.map(id=>[id,0]));
  for(const slot of H_SLOT_KEYS)stock[H2G_BASE_IDS[slot]]=inv.parts[slot];
  inv.h2g={schema:1,stock,opening:null,delta:Object.fromEntries(H2G_MODULE_KEYS.map(id=>[id,0])),current:{},finished:{}};
 }
 for(const n of w.nations){
  const inv=n.hAutomaton;
  if(inv.h2g.opening)continue;
  const installed=h2gCountInstalled(w,n.id);
  if(!installed)throw Error('H2G 초기 기체 설계 참조 실패');
  inv.h2g.opening=Object.fromEntries(H2G_MODULE_KEYS.map(id=>[id,installed[id]+inv.h2g.stock[id]]));
 }
 w.hAutomaton.h2gNationCount=w.nations.length;
}
function h2gValidated(w){
 if(w.hAutomaton.h2gVersion!==1)return false;
 for(const n of w.nations){
  const inv=n.hAutomaton,h=inv.h2g;if(!h||h.schema!==1||!h.current||!h.finished)return false;
  if(Object.keys(h.current).length>H2G_MAX_DESIGNS)return false;
  for(const [id,rev] of Object.entries(h.current)){
   if(!/^h2g_n\d+_\d+$/.test(id)||!Number.isSafeInteger(rev)||rev<1||!h2gResolve(w,n.id,id,rev))return false;
  }
  for(const [key,qty] of Object.entries(h.finished)){
   const at=key.lastIndexOf('@');if(at<1||!Number.isSafeInteger(qty)||qty<0||!h2gResolve(w,n.id,key.slice(0,at),Number(key.slice(at+1))))return false;
  }
  const installed=h2gCountInstalled(w,n.id);if(!installed)return false;
  for(const id of H2G_MODULE_KEYS){
   if(!Number.isSafeInteger(h.stock[id])||h.stock[id]<0||!Number.isSafeInteger(h.opening[id])||h.opening[id]<0||!Number.isSafeInteger(h.delta[id]))return false;
   if(h.opening[id]+h.delta[id]!==h.stock[id]+installed[id])return false;
  }
  for(const slot of H_SLOT_KEYS)if(inv.parts[slot]!==h2gStockSum(inv,slot))return false;
  for(const id of Object.keys(h.current))if(Object.entries(h.finished).filter(([key])=>key.startsWith(id+'@')).reduce((sum,[,qty])=>sum+qty,0)!==inv.storedByBlueprint[id])return false;
 }
 return true;
}
function h2gValidBlueprint(bp){
 if(!bp||typeof bp.id!=='string'||!/^h2g_n\d+_\d+$/.test(bp.id)||!Number.isSafeInteger(bp.revision)||bp.revision<1||bp.revision>99||typeof bp.name!=='string'||bp.name.trim()!==bp.name||bp.name.length<1||bp.name.length>36||!bp.chassisId||!bp.slots||Object.keys(bp.slots).length!==5)return false;
 try{const stats=h2fEvaluate(bp);return bp.designHash===h2fHash(bp)&&!stats.overloaded&&stats.powerMargin>=0;}catch{return false;}
}
function h2gDraftBlueprint(name,ids,id='h2g_n0_0',revision=1){
 if(typeof name!=='string'||name.trim()!==name||name.length<1||name.length>36)return null;
 if(!ids||H_SLOT_KEYS.some(k=>!H2F_MODULES[k][ids[k]]))return null;
 const bp={id,revision,name,chassisId:ids.chassis,slots:Object.fromEntries(H_SLOT_KEYS.slice(1).map(k=>[k,[ids[k]]]))};
 bp.designHash=h2fHash(bp);
 return bp;
}
function h2gModuleCost(act){
 const count=act.amount;
 const price=H_CATALOG[act.slot]?.price8;if(!price||!Number.isSafeInteger(count)||count<1||count>h2kBatchActionMax)return null;
 if(act.type==='H2G_MAKE_MODULE'&&act.moduleId===H2G_BASE_IDS[act.slot])return {apUnits:5,gold:Math.ceil(price.gold*count/8),knowledge:0,resources:Object.fromEntries(Object.entries(price.resources).map(([k,v])=>[k,Math.ceil(v*count/8)]))};
 if(act.type==='H2G_UPGRADE_MODULE'&&H2G_MODULE_SLOT[act.moduleId]===act.slot&&H2G_UPGRADE_PRICES[act.moduleId]){
  const p=H2G_UPGRADE_PRICES[act.moduleId];return {apUnits:5,gold:p.gold*count,knowledge:0,resources:Object.fromEntries(Object.entries(p.resources).map(([k,v])=>[k,v*count]))};
 }
 return null;
}
function h2gCanRefit(w,nid,act){
 const a=getArmy(w,act.armyId),from=h2gResolve(w,nid,act.fromBlueprintId,act.fromRevision),to=h2gResolve(w,nid,act.blueprintId,act.revision),inv=w.nations[nid].hAutomaton;
 if(!a||!from||!to||!h2bEligibleRefit(w,a,nid)||!hasTech(w,nid,'automaton_maintenance')||!h2gCanDesign(w,nid,act.blueprintId,act.revision)||!Number.isInteger(act.amount)||act.amount<1||act.amount>8||from.blueprint.id===to.blueprint.id&&from.blueprint.revision===to.blueprint.revision)return false;
 const ready=hGroups(w,a).filter(g=>g.blueprintId===from.blueprint.id&&g.revision===from.blueprint.revision&&g.ready>0&&g.fueled!==false).reduce((sum,g)=>sum+g.ready,0);
 if(ready<act.amount)return false;
 for(const slot of H_SLOT_KEYS){const f=from.moduleIds[slot],t=to.moduleIds[slot];if(f!==t&&inv.h2g.stock[t]<act.amount)return false;}
 return true;
}
function h2gRefitCost(w,nid,act){
 const from=h2gResolve(w,nid,act.fromBlueprintId,act.fromRevision),to=h2gResolve(w,nid,act.blueprintId,act.revision);
 if(!from||!to)return null;
 const changed=H_SLOT_KEYS.filter(slot=>from.moduleIds[slot]!==to.moduleIds[slot]).length;
 return {apUnits:5,gold:act.amount*(2+changed),knowledge:0,resources:{}};
}
function h2gCustomCurrent(w,nid,id){return w.nations[nid].hAutomaton.h2g.current[id]||null;}
function h2gSaveAllowed(w,nid,act){
 if(!hasTech(w,nid,'automaton_maintenance'))return false;
 const inv=w.nations[nid].hAutomaton,ids=act.modules;
 if(!ids||H_SLOT_KEYS.some(k=>!h2gCanModule(w,nid,ids[k])))return false;
 const bp=h2gDraftBlueprint(act.name,ids);if(!bp)return false;
 const stats=h2fEvaluate(bp);if(stats.overloaded||stats.powerMargin<0)return false;
 if(act.designId){const rev=h2gCustomCurrent(w,nid,act.designId);return Boolean(rev&&rev<99&&h2gResolve(w,nid,act.designId,rev));}
 return Object.keys(inv.h2g.current).length<H2G_MAX_DESIGNS;
}
function h2gBlueprintRecord(w,nid,id,rev=null){
 const d=h2gResolve(w,nid,id,rev);if(!d)return null;
 if(!H2A_DESIGNS[id])return d.blueprint;
 return hBlueprint(w,nid,id);
}

// H2A compatibility name: existing action/AI and telemetry IDs are retained.
const H2A_DESIGN_IDS=Object.freeze(Object.keys(H2A_DESIGNS));
function h2aDesign(id){return H2A_DESIGNS[id]||H2A_DESIGNS[H_BLUEPRINT.id];}
function h2aActionDesign(act){return act?.blueprintId||H_BLUEPRINT.id;}
function h2aCanDesign(w,nid,id){const d=H2A_DESIGNS[id];return !!d&&(id===H_BLUEPRINT.id||hasTech(w,nid,d.requiredTech));}
function h2aStored(inv,id=H_BLUEPRINT.id){return inv.storedByBlueprint?.[id]??(id===H_BLUEPRINT.id?inv.stored:0);}
function h2aTypeTotals(w,nid){const totals=Object.fromEntries(H2A_DESIGN_IDS.map(id=>[id,0]));
 for(const g of w.hAutomaton?.groups||[])if(g.ownerNationId===nid&&totals[g.blueprintId]!==undefined)totals[g.blueprintId]+=hAliveMachine(w,g);
 return totals;}
function h2aRepairExtras(w,armyId,amount){
 const a=getArmy(w,armyId);if(!a)return {gold:0,iron:0};
 let remaining=amount,gold=0,iron=0;
 const groups=hGroups(w,a).sort((x,y)=>x.id-y.id);
 for(const key of ['disabled','damaged'])for(const g of groups){
  const qty=Math.min(remaining,g[key]);if(!qty)continue;remaining-=qty;
  const d=h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision);gold+=qty*d.repairGold;iron+=qty*d.repairIron;
 }
 return {gold:Math.ceil(gold),iron:Math.ceil(iron)};
}

const h2kBatchActionMax=24;
const H_BATCH_COST=Object.freeze(H_SLOT_KEYS.reduce((total,slot)=>{
 const item=H_CATALOG[slot].price8;total.gold+=item.gold;
 for(const [resource,amount] of Object.entries(item.resources))total.resources[resource]=(total.resources[resource]||0)+amount;
 return total;
},{gold:0,resources:{wood:0,iron:0,coal:0,machine_parts:0}}));
const H_MAX_PER_ARMY=96; // H2K: no fixed nation-wide machine cap; paid materials and factories still apply.
// H2K scalable production: fixed army composition limit stays, no country-wide 320 machine cap.
function h2kFactoryStrength(w,nid){
 return w.buildings.filter(b=>b.typeId==='factory'&&b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===nid&&w.tiles[b.tileId]?.occupiedBy===null&&w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===nid&&s.population>0)).reduce((v,b)=>v+Math.max(1,b.level),0);
}
function h2kBatch(w,nid){return Math.min(24,8*Math.max(1,Math.floor(h2kFactoryStrength(w,nid)/3)));}
function h2kTarget(w,n){
 const base=Math.max(16,Math.ceil(nationManpower(w,n.id)/12));
 const strength=h2kFactoryStrength(w,n.id);
 if(!hUnlocked(w,n.id)||strength===0)return base;
 const funds=Math.max(0,n.gold-100000),wealth=Math.floor(Math.sqrt(funds/200000)*160);
 const military=w.aiProfiles[n.aiProfileId]?.military||{};
 const urgency=militaryAtWar(w,n.id)?1.18:1+(Math.max(0,(military.aggression??50)-50)/500);
 // Real factories constrain production even in rich nations. The nation can expand industry separately.
 const industry=240*strength;const desired=Math.max(base,Math.floor((base+wealth)*urgency));
 const fiscal=n.hAutomaton?.h2d?.last??w.hAutomaton?.logistics?.nations?.[n.id]?.last;
 const powerProblem=fiscal&&['GOLD_SHORT','COAL_SHORT','BOTH_SHORT'].includes(fiscal.status);
 return Math.max(16,Math.min(industry,powerProblem?Math.max(base,hAllNation(w,n.id)):desired));
}
function h2kObsolete(w,n,plan){
 const to=h2gResolve(w,n.id,plan.designId,plan.revision);if(!to)return 0;
 return w.hAutomaton.groups.filter(g=>g.ownerNationId===n.id).reduce((sum,g)=>{
  const d=h2gResolve(w,n.id,g.blueprintId,g.revision);
  return sum+(d&&d.role===to.role&&(g.blueprintId!==plan.designId||g.revision!==plan.revision)?g.ready:0);
 },0);
}

// H2B feature gate: only AI decisions are gated, for deterministic H2A comparison.
// Refits are an explicit paid action; no global cache or persistent AI state.
const H2B_AI_ENABLED=true;
const H2B_REFIT_PRICE=Object.freeze({
 armored_frontline_i:Object.freeze({gold:10,resources:Object.freeze({iron:3,coal:1})}),
 fire_support_i:Object.freeze({gold:15,resources:Object.freeze({iron:3,machine_parts:1})})
});
const h2bTelemetry={enabled:false,assembly:{},deploy:{},refit:{},blocked:{}};
function h2bRecord(field,key){if(h2bTelemetry.enabled){const x=h2bTelemetry[field];x[key]=(x[key]||0)+1;}}
function h2bTypeCount(w,n){
 const total=h2aTypeTotals(w,n.id);
 for(const id of H2A_DESIGN_IDS)total[id]+=h2aStored(n.hAutomaton,id);
 return total;
}
function h2bPolicy(w,n){
 const p=w.aiProfiles[n.aiProfileId]?.military||{};
 const defense=Math.max(0,Math.min(100,p.defensivePreference??50));
 const ranged=Math.max(0,Math.min(100,p.rangedPreference??50));
 const atWar=militaryAtWar(w,n.id);
 // Preserve general-purpose models even for specialized profiles. No RNG.
 let front=.30+(defense-50)*.0022+(atWar?.035:0);
 let fire=.20+(ranged-50)*.0022+(atWar?.015:0);
 front=Math.max(.14,Math.min(.48,front));fire=Math.max(.10,Math.min(.38,fire));
 if(front+fire>.78){const k=.78/(front+fire);front*=k;fire*=k;}
 return {[H_BLUEPRINT.id]:1-front-fire,armored_frontline_i:front,fire_support_i:fire};
}
function h2bRank(w,n,counts=null){
 const owned=counts||h2bTypeCount(w,n),policy=h2bPolicy(w,n);
 const total=H2A_DESIGN_IDS.reduce((sum,id)=>sum+owned[id],0);
 // At small populations, future target counts are based on an attainable near-term force.
 const target=Math.max(32,total+8);
 return H2A_DESIGN_IDS.filter(id=>h2aCanDesign(w,n.id,id)).map(id=>({
  id,score:target*policy[id]-owned[id],target:target*policy[id],owned:owned[id]
 })).sort((a,b)=>b.score-a.score||H2A_DESIGN_IDS.indexOf(a.id)-H2A_DESIGN_IDS.indexOf(b.id));
}
function h2bSustainable(w,n,act){
 const price=hActionPrice(w,n.id,act);
 if(!price||!canAfford(n,price))return false;
 const groups=w.hAutomaton.groups.filter(g=>g.ownerNationId===n.id);
 let weighted=groups.reduce((sum,g)=>sum+(g.ready+g.damaged)*h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision).fuelFactor,0);
 if(act.type==='H_ASSEMBLE'||act.type==='H_REFIT'){
  const d=h2aDesign(act.blueprintId);
  weighted+=act.type==='H_REFIT'?act.amount*(d.fuelFactor-1):act.amount*d.fuelFactor;
 }
 const reserveBlocks=Math.ceil(Math.max(0,weighted)/8);
 const coalAfter=n.resources.coal-(price.resources?.coal||0);
 const goldAfter=n.gold-price.gold;
 // Two future quarters of basic power maintenance, only when nonzero.
 return coalAfter>=reserveBlocks*2&&goldAfter>=reserveBlocks*8;
}
function h2bEligibleRefit(w,a,nid){
 return a.nationId===nid&&a.status==='READY'&&a.engagementId===null&&
  !a.order&&!a.operation&&!a.hRepairPlan&&!a.rearmPlan&&!a.g5RedeployPlan&&
  !a.hServiceReturn&&!isOccupying(w,a)&&atSafeSettlement(w,a);
}
function h2bRefittable(w,a){
 return hGroups(w,a).filter(g=>g.blueprintId===H_BLUEPRINT.id&&g.fueled!==false&&g.ready>0)
  .reduce((sum,g)=>sum+g.ready,0);
}


// H2E — Mixed-force tactical placement/paid refit V1.
// Disable this constant for strict H2D1 AI-policy regression; observation does not affect play.
const H2E_AI_ENABLED=true;
const H2E_EVENT_LIMIT=60;
function h2eNationRow(){return {deploy:0,refit:0,blocked:0,blockedByReason:{},byType:Object.fromEntries(H2A_DESIGN_IDS.map(id=>[id,{deploy:0,refit:0}])),last:null};}
function h2eEnsure(w){
 const s=w.hAutomaton;if(!s)return null;
 if(!s.tactics)s.tactics={schema:1,startedDay:w.dayIndex,nations:{},events:[]};
 for(const n of w.nations)if(!s.tactics.nations[n.id])s.tactics.nations[n.id]=h2eNationRow();
 return s.tactics;
}
// H2F: capabilities now derive from the actual fitted-module recipe; the
// H2E candidate-ranking policy itself remains unchanged.
function h2eCapabilities(w,nid,id,revision=null){const d=h2gResolve(w,nid,id,revision);return {armor:d.armor,opening:d.opening,sustained:d.sustained,melee:d.melee,penetration:d.penetration};}
function h2eArmyProfile(w,a){
 const humans={front:deployedManpower(a,'front'),reserve:deployedManpower(a,'reserve'),rear:deployedManpower(a,'rear')};
 let front=humans.front,rear=humans.rear,frontArmor=0,rearFire=0;
 const types=Object.fromEntries(H2A_DESIGN_IDS.map(id=>[id,0]));
 for(const g of hGroups(w,a)){
  const count=g.ready+g.damaged+g.disabled;types[g.blueprintId]=(types[g.blueprintId]||0)+count;
  const effective=g.fueled===false?0:g.ready+g.damaged*.5;
  if(effective<=0)continue;
  const cap=h2eCapabilities(w,g.ownerNationId,g.blueprintId,g.revision);
  if(g.position==='front'){front+=effective;frontArmor+=effective*(cap.armor/26);}
  else if(g.position==='rear'){rear+=effective;rearFire+=effective*((cap.opening+cap.sustained)/5.7);}
 }
 return {humans,front,rear,reserve:humans.reserve,frontArmor,rearFire,types,totalMachines:hCount(w,a,true)};
}
function h2eRoleNeed(w,a,id,p=null){
 p=p||h2eArmyProfile(w,a);
 // All scores measure relative placement need, NOT combat win chance.
 const neededFront=Math.max(24,p.rear*.70+24);
 const protection=Math.min(1,(p.front+p.reserve*.65)/Math.max(20,p.rear*.45+16));
 const frontShort=Math.max(0,1-(p.front+p.reserve*.65)/neededFront);
 const rearShort=Math.max(0,1-p.rearFire/Math.max(12,p.front*.35));
 const already=p.types[id]||0;
 const concentration=Math.min(22,p.totalMachines/H_MAX_PER_ARMY*22);
 let raw;
 const design=h2gResolve(w,a.nationId,id),frontRole=design?.role==='front';
 if(frontRole)raw=70*frontShort+18*Math.max(0,1-p.frontArmor/16)+12*Math.min(1,p.rear/48);
 else if(design&&design.role==='rear'&&id!==H_BLUEPRINT.id)raw=70*protection+22*rearShort+8*Math.min(1,p.front/60);
 else raw=45*frontShort+35*protection+20*rearShort;
 const duplicate=Math.min(24,already/16*12);
 return {score:Math.round((raw-concentration-duplicate)*1000)/1000,
  frontShort:Math.round(frontShort*1000)/1000,protection:Math.round(protection*1000)/1000,
  rearShort:Math.round(rearShort*1000)/1000,concentration:Math.round(concentration*1000)/1000,duplicate:Math.round(duplicate*1000)/1000};
}
function h2eRankCandidates(w,candidates,id){
 return candidates.map(x=>{const a=x.army||x,p=h2eArmyProfile(w,a);return {army:a,ready:x.ready,
  profile:p,need:h2eRoleNeed(w,a,id,p)};}).sort((a,b)=>b.need.score-a.need.score||a.army.id-b.army.id);
}
function h2eRecord(w,kind,n,a,id,amount,info=null,reason=null){
 const root=h2eEnsure(w),row=root?.nations[n.id];if(!row)return;
 if(kind==='DEPLOY'||kind==='REFIT'){row[kind.toLowerCase()]++;row.byType[id]??={deploy:0,refit:0};row.byType[id][kind.toLowerCase()]++;}
 else row.blocked++;
 const e={day:w.dayIndex,nationId:n.id,armyId:a?.id??null,kind,blueprintId:id??null,amount:amount||0,
  score:info?.need?.score??null,front:info?.profile?.humans.front??null,
  reserve:info?.profile?.humans.reserve??null,rear:info?.profile?.humans.rear??null,
  protection:info?.need?.protection??null,frontShort:info?.need?.frontShort??null,
  rearShort:info?.need?.rearShort??null,reason:reason??null};
 row.last=e;root.events.push(e);if(root.events.length>H2E_EVENT_LIMIT)root.events.splice(0,root.events.length-H2E_EVENT_LIMIT);
}
function h2eBlocked(w,n,reason){
 if(!H2E_AI_ENABLED)return;
 const row=h2eEnsure(w)?.nations[n.id];if(!row)return;
 row.blocked++;row.blockedByReason[reason]=(row.blockedByReason[reason]||0)+1;
}
function h2eValid(w){
 const s=w.hAutomaton?.tactics;if(!s)return true; // older saves migrate in hInit()
 const nat=w.nations;
 const int=x=>Number.isSafeInteger(x)&&x>=0;
 if(s.schema!==1||!int(s.startedDay)||s.startedDay>w.dayIndex||!Array.isArray(s.events)||s.events.length>H2E_EVENT_LIMIT||!s.nations)return false;
 for(const n of nat){const r=s.nations[n.id];if(!r||!int(r.deploy)||!int(r.refit)||!int(r.blocked)||!r.byType||!r.blockedByReason||Object.values(r.blockedByReason).some(v=>!int(v)))return false;
  for(const id of H2A_DESIGN_IDS)if(!r.byType[id]||!int(r.byType[id].deploy)||!int(r.byType[id].refit))return false;
 }
 return s.events.every(e=>int(e.day)&&e.day<=w.dayIndex&&int(e.nationId)&&!!nat[e.nationId]&&
  (e.armyId===null||int(e.armyId))&&['DEPLOY','REFIT','BLOCKED'].includes(e.kind)&&
  (e.blueprintId===null||!!h2gResolve(w,e.nationId,e.blueprintId))&&int(e.amount)&&
  (e.score===null||Number.isFinite(e.score))&&
  (e.reason===null||typeof e.reason==='string'));
}
function h2eExport(w,nid=null){
 const s=h2eEnsure(w),ns=w.nations.filter(n=>nid===null||n.id===nid);
 return {schema:'vilob-light-h2e-tactics-v1',version:VERSION,startedDay:s.startedDay,endDay:w.dayIndex,
  policyEnabled:H2E_AI_ENABLED,interpretation:'Scores rank candidates, not predicted kills/win chance; no historical reconstruction.',
  nations:ns.map(n=>{const r=s.nations[n.id];return {nationId:n.id,nation:n.name,deploy:r.deploy,refit:r.refit,blocked:r.blocked,blockedByReason:r.blockedByReason,
   byType:r.byType,last:r.last};}),
  events:s.events.filter(e=>nid===null||e.nationId===nid).map(e=>({...e,nation:w.nations[e.nationId]?.name||''}))};
}
function h2eCsv(doc){
 const cell=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
 const keys=['nationId','nation','deploy','refit','blocked','blockedReasons','lastDay','lastArmyId','lastKind','lastBlueprint','lastScore'];
 const lines=[keys.map(cell).join(',')];
 for(const r of doc.nations)lines.push([r.nationId,r.nation,r.deploy,r.refit,r.blocked,JSON.stringify(r.blockedByReason),r.last?.day,r.last?.armyId,r.last?.kind,r.last?.blueprintId,r.last?.score].map(cell).join(','));
 lines.push('','# RECENT_TACTICAL_SELECTIONS', ['day','nationId','nation','armyId','kind','blueprintId','amount','score','front','reserve','rear','protection','frontShort','rearShort','reason'].map(cell).join(','));
 for(const e of doc.events)lines.push([e.day,e.nationId,e.nation,e.armyId,e.kind,e.blueprintId,e.amount,e.score,e.front,e.reserve,e.rear,e.protection,e.frontShort,e.rearShort,e.reason].map(cell).join(','));
 return '\ufeff'+lines.join('\n');
}

// H2C: bounded, save-persistent, type x nation x phase counters.
// This is observational metadata only. Never use it in combat, RNG or AI decisions.
const H2C_PHASES=Object.freeze(['OPENING','SUSTAINED','CONTACT','MELEE']);
const H2C_RESOURCE_KEYS=Object.freeze(['iron','coal','machine_parts','wood']);
const H2C_ACTION_KEYS=Object.freeze(['H_BUILD_PARTS','H_ASSEMBLE','H_DEPLOY','H_REFIT','H_REPAIR']);
function h2cTypeRow(){return {phases:Object.fromEntries(H2C_PHASES.map(p=>[p,{calls:0,units:0,power:0}])),
 ammoBlocked:0,damageBattle:{damaged:0,disabled:0,destroyed:0},damageField:{damaged:0,disabled:0,destroyed:0},
 removedDestroyed:0,returned:0,assembled:0,deployed:0,refitIn:0,refitOut:0,repaired:0,
 powerFundedQuarters:0,powerUnfundedQuarters:0};}
function h2cNationRow(){return {byType:Object.fromEntries(H2A_DESIGN_IDS.map(id=>[id,h2cTypeRow()])),
 paid:{gold:0,iron:0,coal:0,machine_parts:0,wood:0,apUnits:0},
 paidByAction:Object.fromEntries(H2C_ACTION_KEYS.map(k=>[k,{calls:0,gold:0,iron:0,coal:0,machine_parts:0,wood:0,apUnits:0}])),
 volley:{paid:0,blocked:0,gold:0,iron:0},power:{paidQuarters:0,blockedQuarters:0,gold:0,coal:0}};}
function h2cEnsure(w){
 const s=w.hAutomaton;if(!s)return null;
 if(!s.observation){s.observation={schema:1,enabled:true,startedDay:w.dayIndex,nations:Object.fromEntries(w.nations.map(n=>[n.id,h2cNationRow()]))};}
 // New nations may appear after the initial observation clock. Keep a fixed-size row per nation,
 // without backfilling earlier centuries or deleting historic rows in ordinary games.
 for(const n of w.nations)if(!s.observation.nations[n.id])s.observation.nations[n.id]=h2cNationRow();
 if(!w.setupLocked&&w.dayIndex===0)for(const id of Object.keys(s.observation.nations))if(!w.nations.some(n=>String(n.id)===id))delete s.observation.nations[id];
 return s.observation;
}
function h2cStat(w,nid,id){
 const o=w.hAutomaton?.observation;if(!o?.enabled||!o.nations[nid])return null;
 const row=o.nations[nid];if(!row.byType[id]&&!H2A_DESIGNS[id]&&h2gResolve(w,nid,id))row.byType[id]=h2cTypeRow();
 return row.byType[id]||null;
}
function h2cNation(w,nid){const o=w.hAutomaton?.observation;return o?.enabled?o.nations[nid]:null;}
function h2cAttack(w,nid,id,phase,units,power){
 const row=h2cStat(w,nid,id)?.phases[phase];if(!row||!units||!Number.isFinite(power))return;
 row.calls++;row.units+=units;row.power+=power;
}
function h2cDamage(w,g,result,source='BATTLE'){
 h2iDamage(w,g,result,source);
 const row=h2cStat(w,g.ownerNationId,g.blueprintId);if(!row)return;
 const dest=source==='FIELD'?row.damageField:row.damageBattle;
 for(const key of ['damaged','disabled','destroyed'])dest[key]+=result[key];
}
function h2cPayment(w,nid,key,price){
 const r=h2cNation(w,nid);if(!r)return;
 const target=r.paidByAction[key];if(!target)return;
 target.calls++;
 for(const k of ['gold','apUnits']){target[k]+=price[k]||0;r.paid[k]+=price[k]||0;}
 for(const k of H2C_RESOURCE_KEYS){target[k]+=price.resources?.[k]||0;r.paid[k]+=price.resources?.[k]||0;}
}
function h2cVolley(w,a,paid,iron=0,gold=0,alloc=null){
 const r=h2cNation(w,a.nationId);if(!r)return;
 if(paid){r.volley.paid++;r.volley.iron+=iron;r.volley.gold+=gold;return;}
 r.volley.blocked++;
 const selection=alloc?new Map(alloc.filter(x=>x.armyId===a.id&&typeof x.unitId==='string'&&x.unitId.startsWith('H:')).map(x=>[Number(x.unitId.slice(2)),x.men])):null;
 for(const g of hGroups(w,a)){
  const units=selection?Math.min(g.ready+g.damaged,selection.get(g.id)||0):g.ready+g.damaged;
  if(units>0){const row=h2cStat(w,g.ownerNationId,g.blueprintId);if(row)row.ammoBlocked+=units;}
 }
}
function h2cPower(w,n,groups,funded,coal=0,gold=0){
 const r=h2cNation(w,n.id);if(!r)return;
 if(funded){r.power.paidQuarters++;r.power.coal+=coal;r.power.gold+=gold;}
 else r.power.blockedQuarters++;
 for(const g of groups){const row=h2cStat(w,g.ownerNationId,g.blueprintId);if(row){if(funded)row.powerFundedQuarters+=g.ready+g.damaged;else row.powerUnfundedQuarters+=g.ready+g.damaged;}}
}
function h2cValid(w){
 const o=w.hAutomaton?.observation;
 if(!o||o.schema!==1||typeof o.enabled!=='boolean'||!Number.isSafeInteger(o.startedDay)||o.startedDay<0||o.startedDay>w.dayIndex||!o.nations)return false;
 const scalar=r=>r&&Object.values(r).every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);
 for(const n of w.nations){
  const r=o.nations[n.id];if(!r||!H2A_DESIGN_IDS.every(id=>r.byType?.[id])||!scalar(r.paid)||!scalar(r.volley)||!scalar(r.power))return false;
  for(const k of H2C_ACTION_KEYS)if(!scalar(r.paidByAction?.[k]))return false;
  for(const id of Object.keys(r.byType)){
   if(!H2A_DESIGNS[id]&&!h2gResolve(w,n.id,id))return false;
   const t=r.byType[id];if(!t||!scalar(t.damageBattle)||!scalar(t.damageField)||Object.keys(t.phases||{}).length!==H2C_PHASES.length)return false;
   for(const p of H2C_PHASES)if(!scalar(t.phases[p]))return false;
   for(const k of ['ammoBlocked','removedDestroyed','returned','assembled','deployed','refitIn','refitOut','repaired','powerFundedQuarters','powerUnfundedQuarters'])if(!Number.isFinite(t[k])||t[k]<0)return false;
  }
 }
 return true;
}
function h2cExport(w,nid=null,id=null){
 hInit(w);const o=w.hAutomaton.observation,rows=[];
 for(const n of w.nations){if(nid!==null&&n.id!==nid)continue;
  for(const type of Object.keys(o.nations[n.id].byType)){if(id&&id!==type)continue;
   const x=o.nations[n.id].byType[type],inventory=n.hAutomaton;
   const gs=w.hAutomaton.groups.filter(g=>g.ownerNationId===n.id&&g.blueprintId===type);
   const live={ready:gs.reduce((v,g)=>v+g.ready,0),damaged:gs.reduce((v,g)=>v+g.damaged,0),disabled:gs.reduce((v,g)=>v+g.disabled,0)};
   const d=h2gResolve(w,n.id,type);if(!d)continue;
   rows.push({nationId:n.id,nation:n.name,blueprintId:type,blueprint:d.blueprint.name,
    ...live,stored:inventory.storedByBlueprint[type]||0,...structuredClone(x)});
  }
 }
 return {schema:'vilob-light-h2c-observation-v1',version:VERSION,startedDay:o.startedDay,endDay:w.dayIndex,enabled:o.enabled,
  interpretation:'Computed attack-channel contribution is not attributed kills. Volley and fuel spending are exact nation-level shared payments, not estimated type costs. No pre-H2C historical reconstruction.',
  rows,nationCosts:w.nations.filter(n=>nid===null||n.id===nid).map(n=>({nationId:n.id,nation:n.name,...structuredClone(o.nations[n.id])})).map(r=>{delete r.byType;return r;})};
}
function h2cCsv(doc){
 const header=['nationId','nation','blueprintId','startedDay','endDay','ready','damaged','disabled','stored',
  ...H2C_PHASES.flatMap(p=>[p+'_calls',p+'_units',p+'_power']),
  'ammoBlocked','battleDamaged','battleDisabled','battleDestroyed','fieldDamaged','fieldDisabled','fieldDestroyed',
  'removedDestroyed','returned','assembled','deployed','refitIn','refitOut','repaired','powerFundedQuarters','powerUnfundedQuarters'];
 const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 const items=doc.rows.map(x=>[x.nationId,x.nation,x.blueprintId,doc.startedDay,doc.endDay,x.ready,x.damaged,x.disabled,x.stored,
  ...H2C_PHASES.flatMap(p=>[x.phases[p].calls,x.phases[p].units,x.phases[p].power.toFixed(4)]),
  x.ammoBlocked,x.damageBattle.damaged,x.damageBattle.disabled,x.damageBattle.destroyed,
  x.damageField.damaged,x.damageField.disabled,x.damageField.destroyed,x.removedDestroyed,x.returned,x.assembled,x.deployed,x.refitIn,x.refitOut,x.repaired,x.powerFundedQuarters,x.powerUnfundedQuarters]);
 const costs=['nationId','nation','paidGold','paidIron','paidCoal','paidMachineParts','paidWood','paidApUnits',
  'volleyPaid','volleyBlocked','volleyGold','volleyIron','powerPaidQuarters','powerBlockedQuarters','powerGold','powerCoal'];
 const payments=doc.nationCosts.map(r=>[r.nationId,r.nation,r.paid.gold,r.paid.iron,r.paid.coal,r.paid.machine_parts,r.paid.wood,r.paid.apUnits,
  r.volley.paid,r.volley.blocked,r.volley.gold,r.volley.iron,r.power.paidQuarters,r.power.blockedQuarters,r.power.gold,r.power.coal]);
 return '\ufeff'+[header.map(cell).join(','),...items.map(a=>a.map(cell).join(',')),'',
  '# NATIONAL_ACTUAL_EXPENDITURES (nation-level shared costs; not attributable to blueprints)',costs.map(cell).join(','),...payments.map(a=>a.map(cell).join(','))].join('\n');
}

// H2D — real-resource bounded nation-level mechanical power supply. Never alter
// H2C's fully-funded path, prices, blueprints, or RNG consumption.
const H2D_ENABLED=true;
const H2D_AI_ENABLED=true;
const H2D_EVENT_LIMIT=24;
const H2D_CAUSES=Object.freeze(['GOLD_SHORT','COAL_SHORT','BOTH_SHORT']);
function h2dNationRow(){return {
 fullQuarters:0,partialQuarters:0,noneQuarters:0,idleQuarters:0,
 causes:{GOLD_SHORT:0,COAL_SHORT:0,BOTH_SHORT:0},
 billed:{gold:0,coal:0},paid:{gold:0,coal:0},unfunded:{gold:0,coal:0},
 fundedUnitQuarters:0,unfundedUnitQuarters:0,
 byType:Object.fromEntries(H2A_DESIGN_IDS.map(id=>[id,{funded:0,unfunded:0}])),
 last:{day:null,status:'IDLE',cause:null,dueGold:0,dueCoal:0,paidGold:0,paidCoal:0,funded:0,unfunded:0}
};}
function h2dEnsure(w){
 if(!H2D_ENABLED||!w.hAutomaton)return null;
 const a=w.hAutomaton;
 if(!a.logistics)a.logistics={schema:1,startedDay:w.dayIndex,nations:{},events:[]};
 for(const n of w.nations)if(!a.logistics.nations[n.id])a.logistics.nations[n.id]=h2dNationRow();
 return a.logistics;
}
function h2dBill(w,groups){
 let weighted=0;
 for(const g of groups)weighted+=(g.ready+g.damaged)*h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision).fuelFactor;
 const coal=Math.ceil(weighted/8);
 return {gold:coal*4,coal,weighted};
}
function h2dPriority(w,army,atWar){
 if(!army)return 4;
 if(army.engagementId!==null&&army.engagementId!==undefined)return 0;
 if(army.operation||army.order||isOccupying(w,army))return 1;
 if(atWar)return 2;
 return 3;
}
function h2dRecord(w,n,groups,due,paid,status,cause){
 const root=h2dEnsure(w);if(!root)return;
 const row=root.nations[n.id];
 const key=status.toLowerCase()+'Quarters';row[key]++;
 if(cause)row.causes[cause]++;
 row.billed.gold+=due.gold;row.billed.coal+=due.coal;
 row.paid.gold+=paid.gold;row.paid.coal+=paid.coal;
 row.unfunded.gold+=due.gold-paid.gold;row.unfunded.coal+=due.coal-paid.coal;
 let funded=0,unfunded=0;
 for(const g of groups){
  const count=g.ready+g.damaged;if(!count)continue;
  const t=row.byType[g.blueprintId]||(row.byType[g.blueprintId]={funded:0,unfunded:0}),on=g.fueled!==false;
  if(on){funded+=count;t.funded+=count;}else{unfunded+=count;t.unfunded+=count;}
 }
 row.fundedUnitQuarters+=funded;row.unfundedUnitQuarters+=unfunded;
 row.last={day:w.dayIndex,status,cause,dueGold:due.gold,dueCoal:due.coal,paidGold:paid.gold,paidCoal:paid.coal,funded,unfunded};
 if(status==='PARTIAL'||status==='NONE'){
  root.events.push({day:w.dayIndex,nationId:n.id,status,cause,dueGold:due.gold,dueCoal:due.coal,paidGold:paid.gold,paidCoal:paid.coal,funded,unfunded});
  if(root.events.length>H2D_EVENT_LIMIT)root.events.splice(0,root.events.length-H2D_EVENT_LIMIT);
 }
}
function h2dPower(w,n,groups){
 const due=h2dBill(w,groups),coal=due.coal,gold=due.gold;
 if(!coal){h2dRecord(w,n,groups,due,{gold:0,coal:0},'IDLE',null);h2iPower(w,n,groups);return;}
 if(n.resources.coal>=coal&&n.gold>=gold){
  // H2C full-payment branch remains byte-for-byte equivalent in its game effects.
  n.resources.coal-=coal;n.gold-=gold;n.hAutomaton.maintainedQuarters++;
  for(const g of groups)g.fueled=true;
  h2cPower(w,n,groups,true,coal,gold);
  h2dRecord(w,n,groups,due,{gold,coal},'FULL',null);h2iPower(w,n,groups);return;
 }
 const cause=n.resources.coal<coal?(n.gold<gold?'BOTH_SHORT':'COAL_SHORT'):'GOLD_SHORT';
 // Priority sort happens ONLY on shortage. It does not use RNG/pathfinding.
 const armyById=new Map(w.armies.map(a=>[a.id,a]));
 const atWar=!!militaryAtWar(w,n.id);
 const ranked=groups.filter(g=>g.ready+g.damaged>0).map(g=>({g,a:armyById.get(g.armyId)}))
  .sort((x,y)=>h2dPriority(w,x.a,atWar)-h2dPriority(w,y.a,atWar)||x.g.armyId-y.g.armyId||x.g.id-y.g.id);
 for(const g of groups)g.fueled=false;
 let weighted=0,selected=0;
 for(const {g} of ranked){
  const candidate=weighted+(g.ready+g.damaged)*h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision).fuelFactor;
  const need=Math.ceil(candidate/8);
  if(need<=n.resources.coal&&need*4<=n.gold){
   weighted=candidate;selected++;g.fueled=true;
  }
 }
 const paidCoal=Math.ceil(weighted/8),paidGold=paidCoal*4;
 // Only the nation's combined invoice is charged. No group-level rounding.
 if(paidCoal){n.resources.coal-=paidCoal;n.gold-=paidGold;}
 n.hAutomaton.unfundedQuarters++;
 const status=selected>0?'PARTIAL':'NONE';
 // Existing H2C nation counters retain full-success vs not-full quarter semantics;
 // partial actual payments are included in the paid totals, never phantom costs.
 const old=h2cNation(w,n.id);
 if(old){
  old.power.blockedQuarters++;old.power.coal+=paidCoal;old.power.gold+=paidGold;
  for(const g of groups){const row=h2cStat(w,g.ownerNationId,g.blueprintId);if(row){
   if(g.fueled!==false)row.powerFundedQuarters+=g.ready+g.damaged;
   else row.powerUnfundedQuarters+=g.ready+g.damaged;
  }}
 }
 h2dRecord(w,n,groups,due,{gold:paidGold,coal:paidCoal},status,cause);h2iPower(w,n,groups);
}
function h2dAiPause(w,n){
 if(!H2D_ENABLED||!H2D_AI_ENABLED||n.controller!=='AI')return false;
 const last=w.hAutomaton?.logistics?.nations?.[n.id]?.last;
 return last&&(last.status==='PARTIAL'||last.status==='NONE');
}
function h2dValid(w){
 if(!H2D_ENABLED)return true;
 const s=w.hAutomaton?.logistics;
 if(!s||s.schema!==1||!Number.isSafeInteger(s.startedDay)||s.startedDay<0||s.startedDay>w.dayIndex||!Array.isArray(s.events)||s.events.length>H2D_EVENT_LIMIT)return false;
 const integer=x=>Number.isSafeInteger(x)&&x>=0;
 const totals=x=>x&&integer(x.gold)&&integer(x.coal);
 for(const n of w.nations){
  const row=s.nations?.[n.id];if(!row)return false;
  if(!['fullQuarters','partialQuarters','noneQuarters','idleQuarters','fundedUnitQuarters','unfundedUnitQuarters'].every(k=>integer(row[k])))return false;
  if(!H2D_CAUSES.every(k=>integer(row.causes?.[k])))return false;
  if(!totals(row.billed)||!totals(row.paid)||!totals(row.unfunded))return false;
  for(const k of ['gold','coal'])if(row.paid[k]+row.unfunded[k]!==row.billed[k])return false;
  if(!H2A_DESIGN_IDS.every(id=>integer(row.byType?.[id]?.funded)&&integer(row.byType?.[id]?.unfunded))||Object.entries(row.byType||{}).some(([id,v])=>!H2A_DESIGNS[id]&&!h2gResolve(w,n.id,id)||!integer(v.funded)||!integer(v.unfunded)))return false;
  const l=row.last;
  if(!l||!['FULL','PARTIAL','NONE','IDLE'].includes(l.status)||!(l.day===null||integer(l.day)&&l.day<=w.dayIndex)||
     !(l.cause===null||H2D_CAUSES.includes(l.cause))||
     !['dueGold','dueCoal','paidGold','paidCoal','funded','unfunded'].every(k=>integer(l[k]))||
     l.paidGold>l.dueGold||l.paidCoal>l.dueCoal)return false;
 }
 for(const e of s.events)if(!Number.isSafeInteger(e.day)||e.day<s.startedDay||e.day>w.dayIndex||!w.nations[e.nationId]||
  !['PARTIAL','NONE'].includes(e.status)||!H2D_CAUSES.includes(e.cause)||
  !['dueGold','dueCoal','paidGold','paidCoal','funded','unfunded'].every(k=>integer(e[k])))return false;
 return true;
}
function h2dExport(w,nid=null){
 const s=h2dEnsure(w);return {schema:'vilob-light-h2d-logistics-v1',version:VERSION,startedDay:s.startedDay,endDay:w.dayIndex,
  interpretation:'FULL unchanged; PARTIAL pays exact shared nation-level fuel invoice. Historical H2C shortage causes are not reconstructed.',
  nations:w.nations.filter(n=>nid===null||n.id===nid).map(n=>({nationId:n.id,nation:n.name,...structuredClone(s.nations[n.id])})),
  events:s.events.filter(e=>nid===null||e.nationId===nid).map(e=>({...e,nation:w.nations[e.nationId]?.name||''}))};
}
function h2dCsv(doc){
 const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 const columns=['nationId','nation','lastDay','lastStatus','lastCause','lastDueGold','lastDueCoal','lastPaidGold','lastPaidCoal','lastFunded','lastUnfunded',
  'fullQuarters','partialQuarters','noneQuarters','idleQuarters','goldShort','coalShort','bothShort','billedGold','billedCoal','paidGold','paidCoal','unfundedGold','unfundedCoal','fundedUnitQuarters','unfundedUnitQuarters'];
 const lines=[columns.map(cell).join(',')];
 for(const r of doc.nations){const a=[r.nationId,r.nation,r.last.day,r.last.status,r.last.cause,r.last.dueGold,r.last.dueCoal,r.last.paidGold,r.last.paidCoal,r.last.funded,r.last.unfunded,
  r.fullQuarters,r.partialQuarters,r.noneQuarters,r.idleQuarters,r.causes.GOLD_SHORT,r.causes.COAL_SHORT,r.causes.BOTH_SHORT,
  r.billed.gold,r.billed.coal,r.paid.gold,r.paid.coal,r.unfunded.gold,r.unfunded.coal,r.fundedUnitQuarters,r.unfundedUnitQuarters];lines.push(a.map(cell).join(','));}
 lines.push('','# RECENT_SHORTAGE_EVENTS', ['day','nationId','nation','status','cause','dueGold','dueCoal','paidGold','paidCoal','funded','unfunded'].map(cell).join(','));
 for(const e of doc.events)lines.push([e.day,e.nationId,e.nation,e.status,e.cause,e.dueGold,e.dueCoal,e.paidGold,e.paidCoal,e.funded,e.unfunded].map(cell).join(','));
 return '\ufeff'+lines.join('\n');
}
function hMakeInventory(){return {parts:Object.fromEntries(H_SLOT_KEYS.map(k=>[k,0])),stored:0,storedByBlueprint:Object.fromEntries(H2A_DESIGN_IDS.map(id=>[id,0])),built:0,destroyed:0,repairs:0,batches:0,maintainedQuarters:0,unfundedQuarters:0};}
function hInit(w){
 w.hAutomaton??={schema:2,nextId:1,groups:[],blueprints:[],history:[]};
 const legacy=w.hAutomaton.schema===1;
 for(const n of w.nations){
  n.hAutomaton??=hMakeInventory();
  const inv=n.hAutomaton;
  if(!inv.storedByBlueprint){
   // One-time forward migration: every pre-H2A stored unit was the original first design.
   inv.storedByBlueprint=Object.fromEntries(H2A_DESIGN_IDS.map(id=>[id,id===H_BLUEPRINT.id?inv.stored:0]));
  }
 }
 if(legacy)w.hAutomaton.schema=2;
 for(const a of w.armies)a.hAutomatonGroupIds??=[];
 h2cEnsure(w);
 h2dEnsure(w);
 h2eEnsure(w);
 h2gEnsure(w);
 h2hEnsure(w);
 h2iEnsure(w);
 return w.hAutomaton;
}
function hBlueprint(w,nid,id=H_BLUEPRINT.id){
 const state=hInit(w),design=h2aDesign(id).blueprint;
 let bp=state.blueprints.find(b=>b.ownerNationId===nid&&b.id===design.id&&b.revision===design.revision);
 if(!bp){bp={...structuredClone(design),ownerNationId:nid,createdDay:w.dayIndex};state.blueprints.push(bp);}return bp;
}
function hModuleSummary(id=H_BLUEPRINT.id){return h2fEvaluate(h2aDesign(id).blueprint);}
function hGroups(w,a){if(!a?.hAutomatonGroupIds?.length)return [];const ids=new Set(a.hAutomatonGroupIds);return (w.hAutomaton?.groups||[]).filter(g=>ids.has(g.id)&&g.armyId===a.id);}
// H1C: persist the tactical lane on the *machine group*, never in human UnitGroups.
// Legacy H1/H1B1 groups migrate once; ongoing worlds do not silently reshuffle.
function hDefaultMachinePosition(a){return deployedManpower(a,'front')>0?'rear':'front';}
function hMigratePositions(w){
 for(const a of w.armies){
  for(const g of hGroups(w,a))if(g.position===undefined)g.position=hDefaultMachinePosition(a);
 }
 for(const e of w.engagements||[]){
  for(const [side,armyId] of [['A',e.attackerArmyId],['B',e.defenderArmyId]]){
   const a=getArmy(w,armyId);if(!a)continue;
   e['initialFront'+side]=Math.max(e['initialFront'+side]||0,hFrontCount(w,a));
  }
  for(const side of ['attackers','defenders'])for(const m of e[side]||[]){
   const a=getArmy(w,m.armyId);if(a)m.initialFront=Math.max(m.initialFront||0,hFrontCount(w,a));
  }
 }
}
function hPositionQty(w,a,role,activeOnly=false){
 return hGroups(w,a).filter(g=>g.position===role).reduce((sum,g)=>sum+g.ready+g.damaged+(activeOnly?0:g.disabled),0);
}
function hFrontCount(w,a){return deployedManpower(a,'front')+hPositionQty(w,a,'front',true);}
function hMachineReadyPower(g){return g.fueled===false?0:g.ready+g.damaged*.5;}
function hPromoteMachineFront(w,a){
 // Human reserves deploy first; if the frontline truly empties, rear machines advance.
 if(hFrontCount(w,a)>0||deployedManpower(a,'reserve')>0)return 0;
 let moved=0;
 for(const g of hGroups(w,a).sort((x,y)=>x.id-y.id))if(g.position==='rear'&&g.ready+g.damaged>0){g.position='front';moved+=g.ready+g.damaged;}
 if(moved)w.changeSeq++;
 return moved;
}
function hMachinePhaseAllowed(position,phase){
 return phase==='OPENING'?position==='front'||position==='rear':phase==='SUSTAINED'||phase==='TARGET_REAR'?position==='rear':position==='front';
}
function hCount(w,a,includingDisabled=false){return hGroups(w,a).reduce((s,g)=>s+g.ready+g.damaged+(includingDisabled?g.disabled:0),0);}
function hCombatPresence(w,a){return manpower(a)+hCount(w,a);}
function hEffective(w,a){return hGroups(w,a).reduce((s,g)=>s+(g.fueled===false?0:g.ready+g.damaged*.5),0);}
function hAliveMachine(w,g){return g.ready+g.damaged+g.disabled;}
function hAllNation(w,nid){return (w.hAutomaton?.groups||[]).filter(g=>g.ownerNationId===nid).reduce((s,g)=>s+hAliveMachine(w,g),0)+(w.nations[nid]?.hAutomaton?.stored||0);}
function hLog(w,kind,nid,amount=0,armyId=null){const s=hInit(w);s.history.push({dayIndex:w.dayIndex,kind,nationId:nid,amount,armyId});if(s.history.length>120)s.history.shift();}
function hFactory(w,nid){return w.buildings.some(b=>b.typeId==='factory'&&b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===nid&&w.tiles[b.tileId]?.occupiedBy===null&&w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===nid));}
function hWorksite(w,nid){return w.settlements.find(s=>s.ownerId===nid&&s.population>=1&&w.tiles[s.coreTileId]?.occupiedBy===null)||null;}
function hUnlocked(w,nid){return H_ENABLED&&w.nations[nid]?.active&&w.nations[nid].civilization?.era==='industrial_modern'&&w.nations[nid].civilization.stage>=3&&hasTech(w,nid,'automaton_assembly');}
function hActionPrice(w,nid,act){
 const make=(ap,gold=0,res={})=>({apUnits:Math.round(ap*10),gold,knowledge:0,resources:res});
 switch(act.type){
 case 'H_BUILD_PARTS':{const groups=(act.amount??8)/8;return make(.5,H_BATCH_COST.gold*groups,Object.fromEntries(Object.entries(H_BATCH_COST.resources).map(([k,v])=>[k,v*groups])));}
 case 'H2G_SAVE_DESIGN':return make(.1,0,{});
 case 'H2G_MAKE_MODULE':case 'H2G_UPGRADE_MODULE':return h2gModuleCost(act);
 case 'H2G_REFIT':return h2gRefitCost(w,nid,act);
 case 'H2I_RESERVE':return make(.5,0,{});
 case 'H_ASSEMBLE':{
  const d=h2gResolve(w,nid,h2aActionDesign(act),act.revision);if(!d)return null;
  return !H2A_DESIGNS[h2aActionDesign(act)]?make(.2,0,{}):make(.2,(act.amount||0)*d.extraGold,Object.fromEntries(Object.entries(d.extra).map(([k,v])=>[k,v*(act.amount||0)])));
 }
 case 'H_DEPLOY':return make(.5,0,{});
 case 'H_REFIT':{
  const p=H2B_REFIT_PRICE[act.blueprintId];if(!p)return null;
  return make(.5,(act.amount||0)*p.gold,Object.fromEntries(Object.entries(p.resources).map(([k,v])=>[k,v*(act.amount||0)])));
 }
 case 'H_REPAIR':{
  const ex=h2aRepairExtras(w,act.armyId,act.amount||0);
  return make(.5,Math.ceil((act.amount||0)*1.5)+ex.gold,{iron:Math.ceil((act.amount||0)/4)+ex.iron,coal:Math.ceil((act.amount||0)/8)});
 }
 default:return null;
 }
}
function hLegal(w,nid,act){
 const n=w.nations[nid];if(!hUnlocked(w,nid)||!n||!hFactory(w,nid)||!hWorksite(w,nid))return false;
 const inv=n.hAutomaton||(n.hAutomaton=hMakeInventory());
 if(act.type==='H2G_SAVE_DESIGN')return h2gSaveAllowed(w,nid,act);
 if(act.type==='H2G_MAKE_MODULE')return Number.isSafeInteger(act.amount)&&act.amount<=h2kBatch(w,nid)&&H2G_MODULE_SLOT[act.moduleId]===act.slot&&act.moduleId===H2G_BASE_IDS[act.slot]&&h2gCanModule(w,nid,act.moduleId)&&!!h2gModuleCost(act)&&Number.isSafeInteger(hAllNation(w,nid)+inv.parts[act.slot]+act.amount);
 if(act.type==='H2G_UPGRADE_MODULE')return Number.isSafeInteger(act.amount)&&act.amount<=h2kBatch(w,nid)&&H2G_MODULE_SLOT[act.moduleId]===act.slot&&h2gCanModule(w,nid,act.moduleId)&&!!h2gModuleCost(act)&&inv.h2g.stock[H2G_BASE_IDS[act.slot]]>=act.amount;
 if(act.type==='H2G_REFIT')return h2gCanRefit(w,nid,act);
 if(act.type==='H2I_RESERVE'){const a=getArmy(w,act.armyId),g=w.hAutomaton.groups.find(x=>x.id===act.groupId);
  return Boolean(H2I_ENABLED&&a&&a.nationId===nid&&a.status==='READY'&&a.engagementId===null&&!a.order&&!a.operation&&atSafeSettlement(w,a)&&g&&g.ownerNationId===nid&&g.armyId===a.id&&g.ready>act.amount&&g.damaged===0&&g.disabled===0&&Number.isInteger(act.amount)&&act.amount>=1&&act.amount<=8);
 }
 if(act.type==='H_BUILD_PARTS'){const qty=act.amount??8;return Number.isSafeInteger(qty)&&qty>=8&&qty<=h2kBatch(w,nid)&&qty%8===0;}
 if(act.type==='H_ASSEMBLE'){
  const id=h2aActionDesign(act),d=h2gResolve(w,nid,id,act.revision);
  if(!d||!h2gCanDesign(w,nid,id,act.revision)||!Number.isInteger(act.amount)||act.amount<1||act.amount>h2kBatch(w,nid)||!Number.isSafeInteger(hAllNation(w,nid)+act.amount))return false;
  if(H2A_DESIGNS[id])return H_SLOT_KEYS.every(k=>inv.h2g.stock[H2G_BASE_IDS[k]]>=act.amount);
  return H_SLOT_KEYS.every(k=>inv.h2g.stock[d.moduleIds[k]]>=act.amount);
 }
 if(act.type==='H_DEPLOY'){
  if(!h2gCanDesign(w,nid,h2aActionDesign(act),act.revision)||!Number.isInteger(act.amount)||act.amount<1||act.amount>48||h2gStored(w,nid,h2aActionDesign(act),act.revision)<act.amount)return false;
  if(act.armyId===null||act.armyId===undefined)return hasTech(w,nid,'automaton_field_control')&&w.armies.filter(a=>a.nationId===nid&&a.units.length===0&&hCount(w,a,true)>0).length<Math.max(2,Math.min(10,w.buildings.filter(b=>b.typeId==='factory'&&w.tiles[b.tileId]?.ownerId===nid).length*2));
  const a=getArmy(w,act.armyId);return Boolean(a&&a.nationId===nid&&a.status==='READY'&&!a.order&&!a.operation&&a.engagementId===null&&atSafeSettlement(w,a)&&hCount(w,a,true)+act.amount<=H_MAX_PER_ARMY);
 }
 if(act.type==='H_REFIT'){
  if(!H2B_REFIT_PRICE[act.blueprintId]||!h2aCanDesign(w,nid,act.blueprintId)||
     !hasTech(w,nid,'automaton_maintenance')||!Number.isInteger(act.amount)||act.amount<1||act.amount>8)return false;
  const a=getArmy(w,act.armyId);
  return Boolean(a&&h2bEligibleRefit(w,a,nid)&&h2bRefittable(w,a)>=act.amount);
 }
 if(act.type==='H_REPAIR'){
  if(!hasTech(w,nid,'automaton_maintenance'))return false;
  const a=getArmy(w,act.armyId);if(!a||a.nationId!==nid||a.status!=='READY'||a.engagementId!==null||a.hRepairPlan||a.rearmPlan||a.g5RedeployPlan||a.order||a.operation||!atSafeSettlement(w,a))return false;
  return Number.isInteger(act.amount)&&act.amount>=1&&act.amount<=24&&hGroups(w,a).reduce((total,g)=>total+g.damaged+g.disabled,0)>=act.amount;
 }
 return false;
}
function hCreateArmy(w,nid){
 const site=hWorksite(w,nid),id=w.nextArmyId++;
 // Mechanical formations have no human units and no real population recruitment.
 const a={id,nationId:nid,commanderId:null,tileId:site.coreTileId,morale:78,units:[],deployment:{front:[],rear:[],back:[],reserve:[]},hAutomatonGroupIds:[],
   status:'READY',order:null,operation:null,needsOrders:false,nextMoveDay:w.dayIndex+3,engagementId:null,regroupUntil:0,
   formationExperience:b4aNewExperience(w.dayIndex),c6CreatedDay:w.dayIndex,supplied:true,unsuppliedDays:0,supplyMultiplier:1,supplyCheckedDay:w.dayIndex,
   militaryPolitics:{commanderChangeDays:[]}};
 e3cEnsureFormationRecord(a,w.dayIndex);w.armies.push(a);return a;
}
function hExecute(w,nid,act){
 if(!hLegal(w,nid,act))return {ok:false,reason:'오토마톤 명령 실행 조건 불충족'};
 const n=w.nations[nid],price=hActionPrice(w,nid,act);if(!price||!canAfford(n,price))return {ok:false,reason:'AP·Gold·자원 부족'};
 payCost(n,price,'military');const inv=n.hAutomaton,s=hInit(w);
 h2cPayment(w,nid,act.type,price);
 if(act.type==='H2G_SAVE_DESIGN'){
  const h=inv.h2g,id=act.designId||('h2g_n'+nid+'_'+w.hAutomaton.h2gNextId++),revision=(h.current[id]||0)+1;
  const bp=h2gDraftBlueprint(act.name,act.modules,id,revision);bp.ownerNationId=nid;bp.createdDay=w.dayIndex;bp.origin='USER';
  s.blueprints.push(bp);h.current[id]=revision;inv.storedByBlueprint[id]??=0;
  if(s.observation?.nations[nid]&&!s.observation.nations[nid].byType[id])s.observation.nations[nid].byType[id]=h2cTypeRow();
  hLog(w,'DESIGN_SAVED',nid,1);w.changeSeq++;return {ok:true,blueprintId:id,revision};
 }
 if(act.type==='H2G_MAKE_MODULE'){
  h2gChangeStock(inv,act.moduleId,act.amount);h2gExternal(inv,act.moduleId,act.amount);
  hLog(w,'MODULE_BUILT',nid,act.amount);w.changeSeq++;return {ok:true,moduleId:act.moduleId,amount:act.amount};
 }
 if(act.type==='H2G_UPGRADE_MODULE'){
  const base=H2G_BASE_IDS[act.slot];h2gChangeStock(inv,base,-act.amount);h2gExternal(inv,base,-act.amount);
  h2gChangeStock(inv,act.moduleId,act.amount);h2gExternal(inv,act.moduleId,act.amount);
  hLog(w,'MODULE_UPGRADED',nid,act.amount);w.changeSeq++;return {ok:true,moduleId:act.moduleId,amount:act.amount};
 }
 if(act.type==='H_BUILD_PARTS'){const qty=act.amount??8;for(const k of H_SLOT_KEYS){h2gChangeStock(inv,H2G_BASE_IDS[k],qty);h2gExternal(inv,H2G_BASE_IDS[k],qty);}inv.batches+=qty/8;hBlueprint(w,nid);hLog(w,'PARTS_BUILT',nid,qty);w.changeSeq++;return {ok:true,parts:qty};}
 if(act.type==='H_ASSEMBLE'){
  const id=h2aActionDesign(act),d=h2gResolve(w,nid,id,act.revision),basic=!!H2A_DESIGNS[id];
  for(const slot of H_SLOT_KEYS){
   const base=H2G_BASE_IDS[slot],target=d.moduleIds[slot];
   h2gChangeStock(inv,basic?base:target,-act.amount);
   if(basic&&base!==target){h2gExternal(inv,base,-act.amount);h2gExternal(inv,target,act.amount);}
  }
  inv.stored+=act.amount;inv.storedByBlueprint[id]+=act.amount;inv.built+=act.amount;
  if(!basic){const key=id+'@'+d.blueprint.revision;inv.h2g.finished[key]=(inv.h2g.finished[key]||0)+act.amount;}
  const observed=h2cStat(w,nid,id);if(observed)observed.assembled+=act.amount;
  h2gBlueprintRecord(w,nid,id,act.revision);hLog(w,'ASSEMBLED',nid,act.amount);w.changeSeq++;return {ok:true,stored:inv.stored,blueprintId:id};
 }
 if(act.type==='H_DEPLOY'){
  const id=h2aActionDesign(act),d=h2gResolve(w,nid,id,act.revision);
  const a=act.armyId===null||act.armyId===undefined?hCreateArmy(w,nid):getArmy(w,act.armyId);
  let g=hGroups(w,a).find(g=>g.blueprintId===id&&g.revision===d.blueprint.revision&&g.fueled!==false);
  if(!g){g={id:s.nextId++,ownerNationId:nid,armyId:a.id,blueprintId:id,revision:d.blueprint.revision,ready:0,damaged:0,disabled:0,fueled:true,
   position:id===H_BLUEPRINT.id?hDefaultMachinePosition(a):d.role};s.groups.push(g);a.hAutomatonGroupIds.push(g.id);}
  g.ready+=act.amount;inv.stored-=act.amount;inv.storedByBlueprint[id]-=act.amount;
  if(!H2A_DESIGNS[id])inv.h2g.finished[id+'@'+d.blueprint.revision]-=act.amount;
  const observed=h2cStat(w,nid,id);if(observed)observed.deployed+=act.amount;
  a.needsOrders=true;hLog(w,'DEPLOYED',nid,act.amount,a.id);w.changeSeq++;return {ok:true,armyId:a.id,deployed:act.amount,blueprintId:id};
 }
 if(act.type==='H_REFIT'){
  const id=act.blueprintId,d=h2aDesign(id),a=getArmy(w,act.armyId),qty=act.amount;
  // Paid conversion of existing, ready first-type machines. No free machines/parts.
  // H2A produced/built/destroyed/stored accounting is untouched.
  const sources=hGroups(w,a).filter(g=>g.blueprintId===H_BLUEPRINT.id&&g.fueled!==false&&g.ready>0).sort((x,y)=>x.id-y.id);
  let remaining=qty;
  for(const g of sources){const moved=Math.min(remaining,g.ready);g.ready-=moved;remaining-=moved;if(!remaining)break;}
  if(remaining!==0)throw Error('H2B refit precondition mismatch');
  for(const g of sources)if(hAliveMachine(w,g)===0){s.groups.splice(s.groups.indexOf(g),1);a.hAutomatonGroupIds.splice(a.hAutomatonGroupIds.indexOf(g.id),1);}
  hBlueprint(w,nid,id);
  let target=hGroups(w,a).find(g=>g.blueprintId===id&&g.revision===d.blueprint.revision&&g.fueled===true&&g.position===d.role);
  if(!target){target={id:s.nextId++,ownerNationId:nid,armyId:a.id,blueprintId:id,revision:d.blueprint.revision,ready:0,damaged:0,disabled:0,fueled:true,position:d.role};s.groups.push(target);a.hAutomatonGroupIds.push(target.id);}
  target.ready+=qty;
  for(const slot of H_SLOT_KEYS){h2gExternal(inv,H2A_DESIGNS[H_BLUEPRINT.id].moduleIds[slot],-qty);h2gExternal(inv,d.moduleIds[slot],qty);}
  const fromObs=h2cStat(w,nid,H_BLUEPRINT.id),toObs=h2cStat(w,nid,id);
  if(fromObs)fromObs.refitOut+=qty;if(toObs)toObs.refitIn+=qty;
  hLog(w,'REFIT',nid,qty,a.id);
  const ev=s.history[s.history.length-1];ev.fromBlueprintId=H_BLUEPRINT.id;ev.toBlueprintId=id;ev.goldCost=price.gold;ev.resourceCost={...price.resources};
  w.changeSeq++;return {ok:true,armyId:a.id,converted:qty,blueprintId:id,costGold:price.gold};
 }
 if(act.type==='H2G_REFIT'){
  const a=getArmy(w,act.armyId),from=h2gResolve(w,nid,act.fromBlueprintId,act.fromRevision),to=h2gResolve(w,nid,act.blueprintId,act.revision),qty=act.amount;
  for(const slot of H_SLOT_KEYS){const f=from.moduleIds[slot],t=to.moduleIds[slot];if(f!==t){h2gChangeStock(inv,t,-qty);h2gChangeStock(inv,f,qty);}}
  let remaining=qty;
  for(const g of hGroups(w,a).filter(g=>g.blueprintId===from.blueprint.id&&g.revision===from.blueprint.revision&&g.ready>0&&g.fueled!==false).sort((x,y)=>x.id-y.id)){
   const moved=Math.min(remaining,g.ready);g.ready-=moved;remaining-=moved;
   if(!remaining)break;
  }
  if(remaining)throw Error('H2G 실물 개장 인원 수량 불일치');
  for(const g of hGroups(w,a).filter(g=>g.blueprintId===from.blueprint.id))if(!hAliveMachine(w,g)){
   s.groups.splice(s.groups.indexOf(g),1);a.hAutomatonGroupIds.splice(a.hAutomatonGroupIds.indexOf(g.id),1);
  }
  let t=hGroups(w,a).find(g=>g.blueprintId===to.blueprint.id&&g.revision===to.blueprint.revision&&g.position===to.role&&g.fueled!==false);
  if(!t){t={id:s.nextId++,ownerNationId:nid,armyId:a.id,blueprintId:to.blueprint.id,revision:to.blueprint.revision,ready:0,damaged:0,disabled:0,fueled:true,position:to.role};s.groups.push(t);a.hAutomatonGroupIds.push(t.id);}
  t.ready+=qty;h2gBlueprintRecord(w,nid,to.blueprint.id,to.blueprint.revision);
  const fromObs=h2cStat(w,nid,from.blueprint.id),toObs=h2cStat(w,nid,to.blueprint.id);if(fromObs)fromObs.refitOut+=qty;if(toObs)toObs.refitIn+=qty;
  hLog(w,'MODULE_REFIT',nid,qty,a.id);w.changeSeq++;
  return {ok:true,converted:qty,blueprintId:to.blueprint.id,revision:to.blueprint.revision};
 }
 if(act.type==='H2I_RESERVE'){const g=w.hAutomaton.groups.find(x=>x.id===act.groupId),d=h2gResolve(w,nid,g.blueprintId,g.revision);
  g.ready-=act.amount;inv.stored+=act.amount;inv.storedByBlueprint[g.blueprintId]+=act.amount;
  if(!H2A_DESIGNS[g.blueprintId]){const key=g.blueprintId+'@'+g.revision;inv.h2g.finished[key]=(inv.h2g.finished[key]||0)+act.amount;}
  const observed=h2cStat(w,nid,g.blueprintId);if(observed)observed.returned+=act.amount;
  hLog(w,'H2I_RESERVE',nid,act.amount,g.armyId);w.changeSeq++;return {ok:true,stored:act.amount,blueprintId:d.blueprint.id};
 }
 if(act.type==='H_REPAIR'){
  const a=getArmy(w,act.armyId);
  a.order=null;a.operation=null;a.hRepairPlan={amount:act.amount,completeDay:w.dayIndex+30};a.status='REGROUP';a.regroupUntil=a.hRepairPlan.completeDay;a.needsOrders=false;
  hLog(w,'REPAIR_STARTED',nid,act.amount,a.id);w.changeSeq++;return {ok:true,armyId:a.id,completeDay:a.hRepairPlan.completeDay};
 }
 return {ok:false};
}
function hFinishRepairs(w){
 for(const a of w.armies){
  const plan=a.hRepairPlan;if(!plan||plan.completeDay>w.dayIndex)continue;
  let left=plan.amount;
  const groups=hGroups(w,a).sort((x,y)=>x.id-y.id);
  for(const key of ['disabled','damaged'])for(const g of groups){
   if(left<=0)break;
   const repaired=Math.min(left,g[key]);g[key]-=repaired;g.ready+=repaired;left-=repaired;
   const observed=h2cStat(w,g.ownerNationId,g.blueprintId);if(observed)observed.repaired+=repaired;
  }
  w.nations[a.nationId].hAutomaton.repairs+=plan.amount-left;
  hLog(w,'REPAIR_COMPLETED',a.nationId,plan.amount-left,a.id);
  delete a.hRepairPlan;w.changeSeq++;
 }
}
function hOnArmyRemoved(w,a,reason){
 v08fOnArmyRemoved(w,a,reason);
 const s=w.hAutomaton;if(!s)return;
 for(const g of hGroups(w,a)){
  const qty=hAliveMachine(w,g);const n=w.nations[g.ownerNationId];
  if(reason==='DISBAND'&&n?.active&&atSafeSettlement(w,a)){const observed=h2cStat(w,g.ownerNationId,g.blueprintId);if(observed)observed.returned+=qty;n.hAutomaton.stored+=qty;n.hAutomaton.storedByBlueprint[g.blueprintId]+=qty;if(!H2A_DESIGNS[g.blueprintId]){const key=g.blueprintId+'@'+g.revision;n.hAutomaton.h2g.finished[key]=(n.hAutomaton.h2g.finished[key]||0)+qty;}hLog(w,'RETURNED',g.ownerNationId,qty,a.id);}
  else{const observed=h2cStat(w,g.ownerNationId,g.blueprintId);if(observed)observed.removedDestroyed+=qty;if(n){n.hAutomaton.destroyed+=qty;const d=h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision);for(const slot of H_SLOT_KEYS)h2gExternal(n.hAutomaton,d.moduleIds[slot],-qty);}hLog(w,'DESTROYED_BY_ARMY_REMOVAL',g.ownerNationId,qty,a.id);}
  if(reason!=='DISBAND'||!n?.active||!atSafeSettlement(w,a))h2iObserveRemoved(w,g,qty);
  s.groups=s.groups.filter(x=>x!==g);
 }
 a.hAutomatonGroupIds=[];
}
// Session-only H1B opt-in diagnostics. No extra keys in long-running world saves.
const h1bAiTelemetry={enabled:false,repairCandidates:0,repairStarts:0,repairUnits:0,deployCandidatesRejected:0,deployStarts:0,deployUnits:0,blocked:{}};
function h1bAiBlock(kind){if(h1bAiTelemetry.enabled)h1bAiTelemetry.blocked[kind]=(h1bAiTelemetry.blocked[kind]||0)+1;}
function h1bTryAi(w,n,act){return hLegal(w,n.id,act)&&canAfford(n,hActionPrice(w,n.id,act))&&hExecute(w,n.id,act).ok;}
// H2H — deterministic nation-specific automaton design + demand-led parts economy.
// H2H uses only existing H2G paid actions; no generated machines, no RNG calls.
// Learning from battle outcomes is intentionally reserved for the next version.
const H2H_AI_ENABLED=true;
const H2I_ENABLED=true; // H2I learning remains on by default.
const H2J_ENABLED=H2I_ENABLED; // H2J new planning/economic logic shares its parent feature gate.
const H2I_EVENT_LIMIT=100;
const H2I_REVIEW_DAYS=120;
const H2I_REDESIGN_COOLDOWN=480;
const H2I_MAX_TRACKED=80;
const H2I_MORALE_ENABLED=true;
const H2H_EVENT_LIMIT=90;
const H2H_MAX_AI_DESIGNS=3;
const H2H_REVIEW_DAYS=120;
function h2hNewNation(){return {role:null,designId:null,revision:null,target:0,lastReview:-120,score:null,candidates:0,phase:'IDLE',blocked:'',decisions:0,designs:0,parts:0,upgrades:0,assemblies:0,deployments:0,refits:0,suppressed:0,lastAction:null};}
function h2hEnsure(w){
 const s=w.hAutomaton;
 if(!s.h2h)s.h2h={schema:1,startedDay:w.dayIndex,nations:{},events:[]};
 for(const n of w.nations)s.h2h.nations[n.id]??=h2hNewNation();
 return s.h2h;
}
function h2hLog(w,n,kind,reason='',extra={}){
 const s=h2hEnsure(w),row=s.nations[n.id];
 row.lastAction={day:w.dayIndex,kind,reason,...extra};
 if(kind==='BLOCKED')row.blocked=reason;
 else if(kind!=='SUPPRESS'){row.blocked='';row.decisions++;}
 if(kind==='SUPPRESS')row.suppressed++;
 if(kind==='DESIGN')row.designs++;
 if(kind==='PARTS')row.parts++;
 if(kind==='UPGRADE')row.upgrades++;
 if(kind==='ASSEMBLE')row.assemblies++;
 if(kind==='DEPLOY')row.deployments++;
 if(kind==='REFIT')row.refits++;
 if(kind==='BLOCKED'&&row.lastAction?.reason===reason&&s.events.at(-1)?.reason===reason&&s.events.at(-1)?.nationId===n.id&&s.events.at(-1)?.kind==='BLOCKED')return;
 s.events.push({day:w.dayIndex,nationId:n.id,kind,reason,designId:row.designId,revision:row.revision,role:row.role,...extra});
 if(s.events.length>H2H_EVENT_LIMIT)s.events.splice(0,s.events.length-H2H_EVENT_LIMIT);
}
function h2hValid(w){
 const s=w.hAutomaton?.h2h;
 if(!s||s.schema!==1||!Number.isSafeInteger(s.startedDay)||s.startedDay<0||s.startedDay>w.dayIndex||!Array.isArray(s.events)||s.events.length>H2H_EVENT_LIMIT)return false;
 for(const n of w.nations){const r=s.nations?.[n.id];if(!r||r.lastReview>w.dayIndex||!Number.isSafeInteger(r.lastReview)||!['front','rear',null].includes(r.role)||!Number.isSafeInteger(r.target)||r.target<0||!Number.isSafeInteger(r.candidates)||r.candidates<0)return false;
  if((r.designId!==null||r.revision!==null)&&!h2gResolve(w,n.id,r.designId,r.revision))return false;
  for(const k of ['decisions','designs','parts','upgrades','assemblies','deployments','refits','suppressed'])if(!Number.isSafeInteger(r[k])||r[k]<0)return false;
 }
 return s.events.every(e=>Number.isSafeInteger(e.day)&&e.day<=w.dayIndex&&w.nations[e.nationId]&&typeof e.kind==='string'&&typeof e.reason==='string');
}
function h2hExport(w,nid=null){
 const s=h2hEnsure(w);return {schema:'vilob-light-h2h-ai-v1',version:VERSION,startedDay:s.startedDay,endDay:w.dayIndex,
  interpretation:'Deterministic profile/resource design, not reinforcement or learned weights. Events are bounded.',
  nations:w.nations.filter(n=>nid===null||n.id===nid).map(n=>({nationId:n.id,nation:n.name,controller:n.controller,...structuredClone(s.nations[n.id])})),
  events:s.events.filter(e=>nid===null||e.nationId===nid).map(e=>({...e,nation:w.nations[e.nationId]?.name||''}))};
}
function h2hProfile(w,n){const p=w.aiProfiles[n.aiProfileId]?.military||{};
 const clip=(v,def=50)=>Math.max(0,Math.min(100,Number.isFinite(v)?v:def));
 return {defense:clip(p.defensivePreference),ranged:clip(p.rangedPreference),aggression:clip(p.aggression),investment:clip(p.militaryInvestment)};
}
// 64 capped structural candidates across presets and their slot mutations.
function h2hCandidates(w,n,role){
 const pool=[],used=new Set(),push=m=>{const key=H_SLOT_KEYS.map(k=>m[k]).join('|');if(!used.has(key)){used.add(key);pool.push(m);}};
 const preferred=role==='front'?['armored_frontline_i','light_infantry_support_i','fire_support_i']:['fire_support_i','light_infantry_support_i','armored_frontline_i'];
 for(const id of preferred){const base={...H2A_DESIGNS[id].moduleIds};push(base);
  for(const slot of H_SLOT_KEYS)for(const mod of Object.keys(H2F_MODULES[slot]))push({...base,[slot]:mod});
  for(const [a,b] of [['chassis','weapon'],['power','weapon'],['armor','utility'],['chassis','armor'],['power','mobility'],['weapon','armor']]){
   for(const aa of Object.keys(H2F_MODULES[a]))for(const bb of Object.keys(H2F_MODULES[b]))push({...base,[a]:aa,[b]:bb});
  }
 }
 // Guarantee that every standard recipe and its single-part alternatives are examined.
 // The remainder is a deterministic spread of two-part mutations (never RNG).
 const out=[],selected=new Set(),add=m=>{const key=H_SLOT_KEYS.map(k=>m[k]).join('|');if(!selected.has(key)&&out.length<64){selected.add(key);out.push(m);}};
 for(const id of preferred){const base={...H2A_DESIGNS[id].moduleIds};add(base);
  for(const slot of H_SLOT_KEYS)for(const mod of Object.keys(H2F_MODULES[slot]))add({...base,[slot]:mod});
 }
 const remaining=pool.filter(m=>!selected.has(H_SLOT_KEYS.map(k=>m[k]).join('|'))),space=64-out.length;
 for(let i=0;i<space&&i<remaining.length;i++)add(remaining[Math.floor(i*remaining.length/space)]);
 return out;
}
function h2hUnitCost(modules){
 let gold=0,iron=0,coal=0,machine_parts=0;
 for(const slot of H_SLOT_KEYS){const p=H2G_UPGRADE_PRICES[modules[slot]];if(!p)continue;
  gold+=p.gold;iron+=p.resources.iron||0;coal+=p.resources.coal||0;machine_parts+=p.resources.machine_parts||0;
 }
 return {gold,iron,coal,machine_parts};
}
function h2hScore(w,n,role,spec,modules){
 if(H2I_ENABLED)return h2iScore(w,n,role,spec,modules);
 const p=h2hProfile(w,n),cost=h2hUnitCost(modules),resources=n.resources;
 const strain=Math.max(0,150-resources.iron)/150+Math.max(0,40-resources.machine_parts)/40+Math.max(0,500-n.gold)/500;
 const economy=1.0+(100-p.investment)/80+Math.min(3,strain)*1.2;
 const dmg=role==='front'?(spec.melee*54+spec.contact*45+spec.penetration*.20):
  (spec.opening*23+spec.sustained*26+spec.penetration*.78+spec.contact*9);
 const defense=role==='front'?spec.armor*(.85+p.defense/80)+spec.hp*(.48+p.defense/300):
  spec.armor*(.18+p.defense/220)+spec.hp*.17;
 const ranged=role==='rear'?dmg*(.70+p.ranged/110):dmg*(.90+p.aggression/250);
 const survival=(spec.powerMargin>=2?2:0)+(spec.capacity-spec.weight)*.11;
 const fuel=spec.fuelFactor*(role==='rear'?14:10)*(1.2-p.investment/220);
 const expense=economy*(cost.gold*.27+cost.iron*.38+cost.machine_parts*1.5+cost.coal*.4);
 return Math.round((defense+ranged+survival-fuel-expense)*1000)/1000;
}
function h2hBest(w,n,role){
 let best=null,baseline=-Infinity,seen=0;
 const standardId=role==='front'?'armored_frontline_i':'fire_support_i';
 const preset=h2aCanDesign(w,n.id,standardId)?H2A_DESIGNS[standardId]:H2A_DESIGNS[H_BLUEPRINT.id];
 baseline=h2hScore(w,n,role,preset,preset.moduleIds);
 for(const ids of (H2I_ENABLED?h2iCandidates(w,n,role):h2hCandidates(w,n,role))){
  if(H_SLOT_KEYS.some(k=>!h2gCanModule(w,n.id,ids[k])))continue;
  const bp=h2gDraftBlueprint('AI 후보',ids);if(!bp)continue;
  const spec=h2fEvaluate(bp);if(spec.overloaded||spec.powerMargin<0||h2fRecommendedRole(spec)!==role)continue;
  seen++;const score=h2hScore(w,n,role,spec,ids);
  if(!best||score>best.score+1e-9||(score===best.score&&h2fHash(bp)<best.hash))best={ids,score,hash:h2fHash(bp),spec};
 }
 return {best,baseline,seen};
}
function h2hCountRoles(w,n){const counts={front:0,rear:0};
 for(const g of w.hAutomaton.groups)if(g.ownerNationId===n.id){const d=h2gResolve(w,n.id,g.blueprintId,g.revision);if(d)counts[d.role]+=hAliveMachine(w,g);}
 for(const [id,count] of Object.entries(n.hAutomaton.storedByBlueprint)){if(!count)continue;const d=h2gResolve(w,n.id,id);if(d)counts[d.role]+=count;}
 return counts;
}
function h2hDesiredRole(w,n){const counts=h2hCountRoles(w,n),p=h2hProfile(w,n);
 const target=h2kTarget(w,n);
 const front=Math.max(.2,Math.min(.55,.28+(p.defense-50)*.003+(p.aggression-50)*.0006));
 // Blend actual role shortage with each nation's military doctrine. A merely historical
 // rear-heavy composition must not erase a distinctly defensive national preference.
 const shortage=(target*front-counts.front)-(target*(1-front)-counts.rear);
 const doctrine=(p.defense-50)*.9+(p.aggression-50)*.2-(p.ranged-50);
 return shortage*.3+doctrine>0?'front':'rear';
}
function h2hFutureFunded(w,n,act){
 if(!['H_ASSEMBLE','H2G_REFIT'].includes(act.type))return true;
 const price=hActionPrice(w,n.id,act),to=h2gResolve(w,n.id,act.blueprintId,act.revision);
 if(!price||!to)return false;
 let weighted=w.hAutomaton.groups.filter(g=>g.ownerNationId===n.id).reduce((v,g)=>v+(g.ready+g.damaged)*(h2gResolve(w,n.id,g.blueprintId,g.revision)?.fuelFactor||1),0);
 if(act.type==='H2G_REFIT'){
  const from=h2gResolve(w,n.id,act.fromBlueprintId,act.fromRevision);if(!from)return false;
  weighted+=act.amount*(to.fuelFactor-from.fuelFactor);
 }else weighted+=act.amount*to.fuelFactor;
 const blocks=Math.ceil(Math.max(0,weighted)/8);
 return n.resources.coal-(price.resources?.coal||0)>=blocks*2&&n.gold-price.gold>=blocks*8;
}
function h2hExecute(w,n,act,kind,reason=''){
 if(!h2hFutureFunded(w,n,act))return null;
 if(!hLegal(w,n.id,act)||!canAfford(n,hActionPrice(w,n.id,act)))return null;
 const result=hExecute(w,n.id,act);if(!result.ok)return null;
 if(H2J_ENABLED&&kind==='DESIGN'&&result.blueprintId)h2jTagAi(w,n.id,result.blueprintId,result.revision,reason);
 h2hLog(w,n,kind,reason,{amount:act.amount||0,blueprintId:act.blueprintId||result.blueprintId||null});
 return result;
}
function h2hPickDesign(w,n,plan){
 if(H2J_ENABLED)return h2jPickDesign(w,n,plan);
 const inv=n.hAutomaton,custom=Object.keys(inv.h2g.current).filter(id=>id.startsWith('h2g_n'+n.id+'_'));
 // Reuse an existing AI design, without overwriting a player's historical revisions.
 const role=h2hDesiredRole(w,n);
 const existing=custom.map(id=>h2gResolve(w,n.id,id)).filter(d=>d&&h2jIsAi(d.blueprint));
 const same=existing.find(d=>d.role===role);
 const desired=existing.length>=2&&same?role:existing.length>=2?(existing[0]?.role||role):role;
 if(H2I_ENABLED){const lr=h2iEnsure(w).nations[n.id];lr.reviews++;h2iUpdate(w,n);}
 const {best,baseline,seen}=h2hBest(w,n,desired);
 plan.candidates=seen;plan.role=desired;plan.lastReview=w.dayIndex;
 if(!best){plan.blocked='NO_VALID_DESIGN';return false;}
 const matching=existing.find(d=>d.blueprint.designHash===best.hash);
 if(matching){plan.designId=matching.blueprint.id;plan.revision=matching.blueprint.revision;plan.score=best.score;return false;}
 if(same){
  const originalScore=h2hScore(w,n,desired,same,same.moduleIds),learning=H2I_ENABLED?h2iEnsure(w).nations[n.id]:null;
  const elapsed=H2I_ENABLED?w.dayIndex-(learning.lastRedesign[desired]??-10000):0;
  const economicStress=H2I_ENABLED&&learning.economy.funded+learning.economy.unfunded>80&&
   learning.economy.funded/Math.max(1,learning.economy.funded+learning.economy.unfunded)<.75;
  const meaningfullyDifferent=best.hash!==same.blueprint.designHash&&
   (best.score>originalScore+Math.max(4,Math.abs(originalScore)*.065)||economicStress&&best.spec.fuelFactor<same.fuelFactor-.24&&best.score>originalScore-4);
  if(H2I_ENABLED&&meaningfullyDifferent&&elapsed>=H2I_REDESIGN_COOLDOWN&&same.blueprint.revision<99){
   const result=h2hExecute(w,n,{type:'H2G_SAVE_DESIGN',designId:same.blueprint.id,name:same.blueprint.name,modules:best.ids},'DESIGN','H2I_LEARNED_REVISION');
   if(result){plan.designId=result.blueprintId;plan.revision=result.revision;plan.score=best.score;plan.phase='REVISED';
    learning.lastRedesign[desired]=w.dayIndex;learning.redesigns++;h2iLog(w,n,'REVISION','PERFORMANCE_OR_ECONOMY',{designId:result.blueprintId,revision:result.revision,oldScore:originalScore,newScore:best.score});return true;}
  }
  plan.designId=same.blueprint.id;plan.revision=same.blueprint.revision;plan.score=originalScore;return false;
 }
 if(existing.length>=H2H_MAX_AI_DESIGNS||custom.length>=H2G_MAX_DESIGNS){const keep=existing.find(d=>d.role===desired)||existing[0];if(keep){plan.designId=keep.blueprint.id;plan.revision=keep.blueprint.revision;}return false;}
 if(best.score<baseline*.87){plan.blocked='STANDARD_DESIGN_BETTER';return false;}
 const prefix=desired==='front'?'전열':'화력';
 const name='AI '+prefix+' '+(existing.length+1)+'식';
 const result=h2hExecute(w,n,{type:'H2G_SAVE_DESIGN',name,modules:best.ids},'DESIGN',`${desired} ${best.score.toFixed(1)}/${baseline.toFixed(1)}`);
 if(!result){plan.blocked='DESIGN_RESOURCE_OR_AP';return false;}
 plan.designId=result.blueprintId;plan.revision=result.revision;plan.score=best.score;return true;
}
function h2hDeploy(w,n,plan){
 if(H2I_ENABLED){const econ=h2iEnsure(w).nations[n.id].economy,last=w.hAutomaton.logistics?.nations[n.id]?.last;
  if(last&&(last.status!=='FULL'&&last.status!=='IDLE'||econ.fullStreak<3||n.gold<Math.max(100,last.dueGold*3)||n.resources.coal<Math.max(20,last.dueCoal*3)))return false;}
 if(!plan.designId)return false;
 const stored=h2gStored(w,n.id,plan.designId,plan.revision);
 if(!stored)return false;
 const maxQty=Math.min(h2kBatch(w,n.id),stored,48);
 const candidates=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&!a.order&&!a.operation&&a.engagementId===null&&atSafeSettlement(w,a)&&hCount(w,a,true)<H_MAX_PER_ARMY);
 const sorted=H2E_AI_ENABLED?h2eRankCandidates(w,candidates,plan.designId):candidates.map(a=>({army:a,need:{score:0}}));
 for(const x of sorted.slice(0,12)){
  const a=x.army,qty=Math.min(maxQty,H_MAX_PER_ARMY-hCount(w,a,true));
  if(qty<1)continue;
  if(h2hExecute(w,n,{type:'H_DEPLOY',armyId:a.id,blueprintId:plan.designId,revision:plan.revision,amount:qty},'DEPLOY','H2L_BATCH')){
   if(H2E_AI_ENABLED)h2eRecord(w,'DEPLOY',n,a,plan.designId,qty,x);
   return true;
  }
 }
 const result=h2hExecute(w,n,{type:'H_DEPLOY',armyId:null,blueprintId:plan.designId,revision:plan.revision,amount:maxQty},'DEPLOY','INDEPENDENT');
 if(result&&H2E_AI_ENABLED)h2eRecord(w,'DEPLOY',n,null,plan.designId,maxQty,null,'INDEPENDENT');
 return !!result;
}
function h2hRefitTarget(w,n,plan){
 const to=h2gResolve(w,n.id,plan.designId,plan.revision);if(!to)return null;
 const armies=w.armies.filter(a=>a.nationId===n.id&&h2bEligibleRefit(w,a,n.id)).sort((a,b)=>a.id-b.id);
 let best=null;
 for(const a of armies)for(const g of hGroups(w,a).sort((x,y)=>x.id-y.id)){
  if(g.ready<1||g.fueled===false||g.blueprintId===plan.designId&&g.revision===plan.revision)continue;
  const from=h2gResolve(w,n.id,g.blueprintId,g.revision);if(!from)continue;
  if(from.role!==to.role&&g.blueprintId!==H_BLUEPRINT.id)continue;
  // A new model is not necessarily better: require a real performance improvement
  // under this nation's current front/rear doctrine before spending actual modules.
  const scoreTo=h2hScore(w,n,to.role,to,to.moduleIds);
  const scoreFrom=h2hScore(w,n,to.role,from,from.moduleIds);
  const benefit=scoreTo-scoreFrom,threshold=Math.max(3,Math.abs(scoreFrom)*.035);
  if(benefit<=threshold)continue;
  const changed=H_SLOT_KEYS.filter(k=>to.moduleIds[k]!==from.moduleIds[k]).length;
  if(!changed)continue; // Avoid paying to relabel an otherwise identical physical machine.
  const amount=Math.min(8,g.ready);
  const efficiency=benefit/(2+changed);
  if(!best||efficiency>best.efficiency+1e-6||efficiency===best.efficiency&&(a.id<best.army.id||a.id===best.army.id&&g.id<best.group.id))
   best={army:a,group:g,amount,benefit,efficiency};
 }
 return best;
}
function h2hPartsFor(w,n,plan,qty){
 const d=h2gResolve(w,n.id,plan.designId,plan.revision);if(!d)return false;
 const inv=n.hAutomaton,needed=H_SLOT_KEYS.map(slot=>({slot,id:d.moduleIds[slot],missing:Math.max(0,qty-inv.h2g.stock[d.moduleIds[slot]])})).filter(x=>x.missing>0);
 if(!needed.length)return false;
 // Prevent unrelated base-parts production when there is no outstanding build/refit demand.
 for(const item of needed){
  if(item.id!==H2G_BASE_IDS[item.slot]){
   const base=inv.h2g.stock[H2G_BASE_IDS[item.slot]];
   if(base>=1){const amount=Math.min(h2kBatch(w,n.id),item.missing,base);
    if(h2hExecute(w,n,{type:'H2G_UPGRADE_MODULE',slot:item.slot,moduleId:item.id,amount},'UPGRADE',item.id))return true;
   }
  }
 }
 // If four or more slots require base parts, use the preexisting 8x6 batch only when stocks are low.
 const lacking=needed.filter(x=>inv.h2g.stock[H2G_BASE_IDS[x.slot]]<x.missing);
 if(lacking.length>=4&&H_SLOT_KEYS.every(slot=>inv.h2g.stock[H2G_BASE_IDS[slot]]<24)){
  if(h2hExecute(w,n,{type:'H_BUILD_PARTS',amount:Math.max(8,Math.ceil(Math.min(qty,h2kBatch(w,n.id))/8)*8)},'PARTS','TARGET_BATCH'))return true;
 }
 for(const item of needed){const base=H2G_BASE_IDS[item.slot];
  if(item.id!==base&&inv.h2g.stock[base]>0)continue;
  const amount=Math.min(h2kBatch(w,n.id),item.missing-(item.id!==base?inv.h2g.stock[base]:0));
  if(amount<=0)continue;
  if(h2hExecute(w,n,{type:'H2G_MAKE_MODULE',slot:item.slot,moduleId:base,amount},'PARTS',item.slot))return true;
 }
 plan.blocked='PARTS_RESOURCE_OR_AP';return false;
}
function h2hAiQuarter(w,n){
 const plan=h2hEnsure(w).nations[n.id],inv=n.hAutomaton;
 if(H2I_ENABLED&&h2dAiPause(w,n)){plan.phase='POWER_PAUSE';return h2iTryReserve(w,n);}
 if(h2dAiPause(w,n)){plan.phase='POWER_PAUSE';return false;}
 if(!hasTech(w,n.id,'automaton_maintenance')){
  plan.phase='STANDARD_TECH_WAIT';
  if(inv.stored>0&&h2bTryAiDeployment(w,n,inv))return true;
  const target=h2kTarget(w,n);
  if(hAllNation(w,n.id)>=target)return false;
  if(H_SLOT_KEYS.every(k=>inv.parts[k]>0)&&h2bTryAiAssemble(w,n,inv))return true;
  // One batch only if at least 8 machines are still needed AND stocks are genuinely low.
  if(target-hAllNation(w,n.id)>=8&&Math.min(...H_SLOT_KEYS.map(k=>inv.parts[k]))<8&&
     H_SLOT_KEYS.every(k=>inv.h2g.stock[H2G_BASE_IDS[k]]<24))return !!h2hExecute(w,n,{type:'H_BUILD_PARTS'},'PARTS','PRE_TECH');
  return false;
 }
 if(!plan.designId||!h2gResolve(w,n.id,plan.designId,plan.revision)||
  (w.dayIndex-plan.lastReview>=H2H_REVIEW_DAYS&&!(H2I_ENABLED?['PRODUCING_PARTS','ASSEMBLED']:['PRODUCING_PARTS','ASSEMBLED','RESOURCE_BLOCK']).includes(plan.phase))){
  if(h2hPickDesign(w,n,plan))return true;
 }
 const d=plan.designId&&h2gResolve(w,n.id,plan.designId,plan.revision);
 if(!d){plan.phase='NO_DESIGN';return false;}
 if(h2hDeploy(w,n,plan)){plan.phase='DEPLOYED';return true;}
 const targetTotal=h2kTarget(w,n);
 const capacity=Math.min(h2kBatch(w,n.id),Math.max(0,targetTotal-hAllNation(w,n.id)));
 const retrofit=h2hRefitTarget(w,n,plan);
 const outdated=retrofit?h2kObsolete(w,n,plan):0;
 // One quarter in three may prioritize a beneficial refit while an expansion target
 // remains unmet; a production failure can also fall back to a paid refit.
 const reviewSlot=(Math.floor(w.dayIndex/30)+n.id)%3===0;
 const prioritizeRefit=!!(retrofit&&outdated>=8&&
  (capacity===0||reviewSlot&&retrofit.benefit>Math.max(4,Math.abs(plan.score||0)*.035)));
 const choices=[];
 if(prioritizeRefit)choices.push('REFIT');
 if(capacity)choices.push('ASSEMBLE');
 if(retrofit&&!prioritizeRefit)choices.push('REFIT');
 if(!choices.length){plan.phase='TARGET_MET';h2hLog(w,n,'SUPPRESS','NO_UNMET_DEMAND');return false;}
 for(const kind of choices){
  const amount=kind==='ASSEMBLE'?capacity:retrofit.amount;
  plan.target=amount;
  const action=kind==='ASSEMBLE'?{type:'H_ASSEMBLE',blueprintId:plan.designId,revision:plan.revision,amount}:
   {type:'H2G_REFIT',armyId:retrofit.army.id,fromBlueprintId:retrofit.group.blueprintId,fromRevision:retrofit.group.revision,
    blueprintId:plan.designId,revision:plan.revision,amount};
  if(hLegal(w,n.id,action)&&h2hExecute(w,n,action,kind,kind==='ASSEMBLE'?'NEW_FORCE':'H2L_BENEFICIAL_UPGRADE')){
   if(kind==='REFIT'&&H2E_AI_ENABLED){const a=retrofit.army;h2eRecord(w,'REFIT',n,a,plan.designId,amount,
    {profile:h2eArmyProfile(w,a),need:h2eRoleNeed(w,a,plan.designId)});}
   plan.phase=kind==='ASSEMBLE'?'ASSEMBLED':'REFITTED';return true;
  }
  // First affordable action wins; parts are fabricated only for a genuinely
  // outstanding planned assembly/refit, never synthesized from future demand.
  if(h2hPartsFor(w,n,plan,amount)){plan.phase='PRODUCING_PARTS';return true;}
 }
 plan.phase='RESOURCE_BLOCK';plan.blocked='ASSEMBLY_OR_REFIT_RESOURCE_AP';return false;
}


// H2I — append-only, bounded and deterministic online evidence from actual operations.
// The founding save's historical H2C totals are not reinterpreted as training examples.
function h2iNewRole(){return {attack:0,survival:0,economy:0,uptime:0,updates:0,lastUpdate:-1,trained:{engagements:0,attackUnits:0,attackPower:0,damage:0,funded:0,unfunded:0}};}
function h2iNewNation(){return {roles:{front:h2iNewRole(),rear:h2iNewRole()},observed:{},economy:{funded:0,unfunded:0,strikes:0,fullStreak:0},reviews:0,redesigns:0,explorations:0,reserved:0,lastLearnDay:-120,lastRedesign:{front:-10000,rear:-10000}};}
function h2iEnsure(w){
 const ha=w.hAutomaton;if(!ha)return null;
 if(!ha.h2i)ha.h2i={schema:1,startedDay:w.dayIndex,nations:{},events:[]};
 for(const n of w.nations)ha.h2i.nations[n.id]??=h2iNewNation();
 return ha.h2i;
}
function h2iLog(w,n,kind,detail,extra={}){
 const s=h2iEnsure(w);if(!s)return;
 s.events.push({day:w.dayIndex,nationId:n.id,kind,detail,...extra});
 if(s.events.length>H2I_EVENT_LIMIT)s.events.splice(0,s.events.length-H2I_EVENT_LIMIT);
}
function h2iSample(w,nid,id,revision){
 const ledger=h2iEnsure(w)?.nations[nid];if(!ledger)return null;
 const key=id+'@'+revision;
 if(!ledger.observed[key]){
  // Prevent unbounded historical growth. Live samples are preserved first;
  // drop only the oldest inactive experiment with no fitted or stored machines.
  const entries=Object.entries(ledger.observed);
  if(entries.length>=H2I_MAX_TRACKED){
   const live=new Set(w.hAutomaton.groups.filter(g=>g.ownerNationId===nid).map(g=>g.blueprintId+'@'+g.revision));
   const finished=w.nations[nid].hAutomaton.h2g?.finished||{};
   const removable=entries.filter(([k])=>!live.has(k)&&!(finished[k]>0)).sort((a,b)=>a[1].lastDay-b[1].lastDay);
   if(removable.length)delete ledger.observed[removable[0][0]];
   else return null;
  }
  const d=h2gResolve(w,nid,id,revision);
  if(!d)return null;
  ledger.observed[key]={id,revision,role:d.role,startedDay:w.dayIndex,lastDay:w.dayIndex,
   engagements:0,lastEncounter:null,seenEncounters:[],phaseCalls:0,attackUnits:0,attackPower:0,
   damaged:0,disabled:0,destroyed:0,removed:0,repaired:0,
   funded:0,unfunded:0,ammoBlocked:0};
 }
 const row=ledger.observed[key];row.lastDay=w.dayIndex;return row;
}
function h2iBattle(w,g,phase,units,power,engagementId){
 if(!H2I_ENABLED)return;
 const r=h2iSample(w,g.ownerNationId,g.blueprintId,g.revision);if(!r)return;
 const enc=Number.isSafeInteger(engagementId)?engagementId:null;
 if(enc!==null&&!r.seenEncounters.includes(enc)){r.engagements++;r.seenEncounters.push(enc);if(r.seenEncounters.length>32)r.seenEncounters.shift();r.lastEncounter=enc;}
 r.phaseCalls++;r.attackUnits+=units;r.attackPower+=Math.max(0,power);
}
function h2iDamage(w,g,result,source){
 if(!H2I_ENABLED)return;
 const r=h2iSample(w,g.ownerNationId,g.blueprintId,g.revision);if(!r)return;
 r.damaged+=result.damaged||0;r.disabled+=result.disabled||0;r.destroyed+=result.destroyed||0;
}
function h2iPower(w,n,groups){
 if(!H2I_ENABLED)return;
 const s=h2iEnsure(w).nations[n.id];let funded=0,unfunded=0;
 for(const g of groups){const qty=g.ready+g.damaged;if(!qty)continue;
  const r=h2iSample(w,n.id,g.blueprintId,g.revision);if(!r)continue;
  if(g.fueled===false){r.unfunded+=qty;unfunded+=qty;}else{r.funded+=qty;funded+=qty;}
 }
 s.economy.funded+=funded;s.economy.unfunded+=unfunded;
 const last=w.hAutomaton.logistics?.nations[n.id]?.last;
 if(last?.status==='PARTIAL'||last?.status==='NONE'){s.economy.strikes++;s.economy.fullStreak=0;}
 else if(last?.status==='FULL'){s.economy.strikes=0;s.economy.fullStreak++;}
}
function h2iObserveRemoved(w,g,qty){
 if(!H2I_ENABLED||qty<=0)return;
 const r=h2iSample(w,g.ownerNationId,g.blueprintId,g.revision);if(r)r.removed+=qty;
}
function h2iLearningRate(w,n,role){
 const p=h2hProfile(w,n);
 // National doctrine changes *how quickly* bad outcomes alter military doctrine.
 return role==='front'?(.045+.0004*p.defense+.0002*p.aggression):(.045+.0004*p.ranged+.0002*p.aggression);
}
function h2iUpdate(w,n){
 if(!H2I_ENABLED)return;
 const ledger=h2iEnsure(w).nations[n.id];
 if(w.dayIndex-ledger.lastLearnDay<H2I_REVIEW_DAYS)return;
 ledger.lastLearnDay=w.dayIndex;
 const clip=v=>Math.max(-.45,Math.min(.45,v));
 for(const role of ['front','rear']){
  const records=Object.values(ledger.observed).filter(r=>r.role===role);
  const enc=records.reduce((a,r)=>a+r.engagements,0),units=records.reduce((a,r)=>a+r.attackUnits,0),power=records.reduce((a,r)=>a+r.attackPower,0);
  const damaged=records.reduce((a,r)=>a+r.damaged+r.disabled*1.8+r.destroyed*2.5+r.removed*.5,0);
  const funded=records.reduce((a,r)=>a+r.funded,0),unfunded=records.reduce((a,r)=>a+r.unfunded,0);
  const q=ledger.roles[role],prev=q.trained,rate=h2iLearningRate(w,n,role);
  const encounters=enc-prev.engagements,exposure=units-prev.attackUnits,attack=power-prev.attackPower;
  const suffered=damaged-prev.damage,fuelOk=funded-prev.funded,fuelMiss=unfunded-prev.unfunded;
  let learned=false;
  // Require distinct post-import engagements and enough exposure. Never learn from
  // all-time aggregate values again when a quarter has no new battle data.
  if(encounters>=5&&exposure>=32){
   const yieldPerUnit=attack/Math.max(1,exposure),survivalLoss=suffered/Math.max(1,exposure);
   q.attack=clip(q.attack+rate*Math.max(-.7,Math.min(.7,(yieldPerUnit-1.35)/1.8)));
   q.survival=clip(q.survival+rate*Math.max(-.7,Math.min(.7,survivalLoss*4-.10)));
   prev.engagements=enc;prev.attackUnits=units;prev.attackPower=power;prev.damage=damaged;learned=true;
  }
  if(fuelOk+fuelMiss>=64){
   const availability=fuelOk/(fuelOk+fuelMiss);
   q.economy=clip(q.economy+rate*(availability<.85?(.85-availability)*1.7:-.025));
   q.uptime=clip(q.uptime+rate*(availability<.85?(.85-availability)*1.1:-.015));
   prev.funded=funded;prev.unfunded=unfunded;learned=true;
  }
  if(learned){q.updates++;q.lastUpdate=w.dayIndex;
   h2iLog(w,n,'LEARN',role,{newEngagements:encounters,exposure,availability:fuelOk+fuelMiss?Math.round(1000*fuelOk/(fuelOk+fuelMiss))/1000:null,weights:{...q,trained:undefined}});
  }
 }
}
function h2iDoctrine(w,n,role){
 const p=h2hProfile(w,n),r=h2iEnsure(w).nations[n.id].roles[role];
 // Nonlinear national formula: an aggressive ranged doctrine rewards the *product*
 // of penetration and firepower, whereas defense prefers an armor/HP blend.
 const defensive=(p.defense/100),aggressive=p.aggression/100,ranged=p.ranged/100,investment=p.investment/100;
 return {attack:(role==='rear'?(.82+.72*ranged+.24*aggressive):(.85+.53*aggressive))*(1+r.attack),
  survival:(role==='front'?(.9+.88*defensive):(.5+.48*defensive))*(1+r.survival),
  economy:(1.85-.72*investment+.25*(1-defensive))*(1+r.economy),
  uptime:(.65+.85*(1-investment)+.3*(1-aggressive))*(1+r.uptime),
  special:role==='rear'?.2+.7*ranged:.3+.8*defensive,rate:h2iLearningRate(w,n,role)};
}
function h2iRevisionEvidence(w,n,role,modules){
 // Compare only the same six installed modules, including obsolete revisions.
 // This confidence-weighted term is a bounded empirical bandit correction;
 // unknown designs are not treated as proven winners or losers.
 const ledger=h2iEnsure(w).nations[n.id],hash=h2fHash(h2gDraftBlueprint('경험 검토',modules));
 let engagements=0,exposure=0,power=0,damage=0,funded=0,unfunded=0;
 for(const bp of w.hAutomaton.blueprints){
  if(bp.ownerNationId!==n.id||bp.designHash!==hash)continue;
  const o=ledger.observed[bp.id+'@'+bp.revision];if(!o||o.role!==role)continue;
  engagements+=o.engagements;exposure+=o.attackUnits;power+=o.attackPower;
  damage+=o.damaged+o.disabled*1.5+o.destroyed*2+o.removed*.5;
  funded+=o.funded;unfunded+=o.unfunded;
 }
 let bonus=0;
 if(engagements>=5&&exposure>=32){
  const confidence=Math.min(1,engagements/12,exposure/128);
  const contribution=Math.max(-1,Math.min(1,(power/Math.max(1,exposure)-1.4)/2));
  const attrition=Math.max(0,Math.min(1,damage/Math.max(1,exposure)*3));
  bonus+=confidence*(6*contribution-7*attrition);
 }
 if(funded+unfunded>=64){
  const reliability=funded/(funded+unfunded),confidence=Math.min(1,(funded+unfunded)/512);
  bonus+=confidence*6*(reliability-.85);
 }
 return Math.max(-9,Math.min(9,bonus));
}
function h2iScore(w,n,role,spec,modules){
 const d=h2iDoctrine(w,n,role),cost=h2hUnitCost(modules);
 const scarcity=Math.max(0,(300-n.gold)/300)+Math.max(0,(80-n.resources.iron)/80)+Math.max(0,(20-n.resources.machine_parts)/20);
 const rear=role==='rear';
 const offense=rear?(spec.opening*20+spec.sustained*23+spec.penetration*.75+spec.contact*6):
  spec.contact*46+spec.melee*52+spec.penetration*.21;
 const staying=rear?spec.hp*.17+spec.armor*.32:spec.hp*.43+spec.armor*1.0;
 const synergy=rear?d.special*(spec.penetration/22)*(spec.opening+spec.sustained)*1.8:
  d.special*Math.sqrt(Math.max(0,spec.hp*spec.armor))*.9;
 const upkeep=spec.fuelFactor*(rear?14:11)*d.uptime;
 const economy=(cost.gold*.29+cost.iron*.38+cost.machine_parts*1.5+cost.coal*.4)*d.economy*(1+Math.min(2,scarcity)*.32);
 const safety=Math.min(8,Math.max(0,spec.powerMargin))*.5+(spec.capacity-spec.weight)*.12;
 return Math.round((offense*d.attack+staying*d.survival+synergy+safety-upkeep-economy+h2iRevisionEvidence(w,n,role,modules))*1000)/1000;
}
// Preserve all six module slots and select a deterministic cross-section of the 3^6
// cartesian product. A nation and role use different phases in the exploration cycle.
function h2iCandidates(w,n,role){
 const out=[],seen=new Set(),push=ids=>{if(!ids||out.length>=64)return;
  const k=H_SLOT_KEYS.map(slot=>ids[slot]).join('|');if(!seen.has(k)){seen.add(k);out.push(ids);}};
 const preferred=role==='front'?['armored_frontline_i','light_infantry_support_i','fire_support_i']:['fire_support_i','light_infantry_support_i','armored_frontline_i'];
 for(const id of preferred)push({...H2A_DESIGNS[id].moduleIds});
 const nation=h2iEnsure(w).nations[n.id];
 const existing=Object.keys(n.hAutomaton.h2g.current).map(id=>h2gResolve(w,n.id,id)).filter(x=>x&&h2jIsAi(x.blueprint)&&x.role===role);
 for(const d of existing){push({...d.moduleIds});for(const slot of H_SLOT_KEYS)for(const m of Object.keys(H2F_MODULES[slot]))push({...d.moduleIds,[slot]:m});}
 const phase=(Math.floor(w.dayIndex/H2I_REVIEW_DAYS)+n.id*11+(role==='rear'?23:0))%729;
 const options=H_SLOT_KEYS.map(slot=>Object.keys(H2F_MODULES[slot]));
 for(let i=0;i<729&&out.length<64;i++){
  let index=(phase*37+i*31)%729;const modules={};
  for(let j=0;j<6;j++){modules[H_SLOT_KEYS[j]]=options[j][index%3];index=Math.floor(index/3);}
  push(modules);
 }
 nation.explorations++;return out;
}
function h2iValid(w){
 const s=w.hAutomaton?.h2i;if(!s||s.schema!==1||!Number.isSafeInteger(s.startedDay)||s.startedDay<0||s.startedDay>w.dayIndex||!Array.isArray(s.events)||s.events.length>H2I_EVENT_LIMIT)return false;
 const validCount=v=>Number.isSafeInteger(v)&&v>=0,validNum=v=>Number.isFinite(v)&&v>=0;
 for(const n of w.nations){const r=s.nations?.[n.id];if(!r||!Number.isInteger(r.lastLearnDay)||r.lastLearnDay>w.dayIndex||!validCount(r.reviews)||!validCount(r.redesigns)||!validCount(r.explorations)||!validCount(r.reserved)||!r.roles||!r.observed||!r.economy||Object.keys(r.observed).length>H2I_MAX_TRACKED)return false;
  for(const role of ['front','rear']){const a=r.roles[role];if(!a||!a.trained||!['engagements','attackUnits','funded','unfunded'].every(k=>validCount(a.trained[k]))||!validNum(a.trained.damage)||!validNum(a.trained.attackPower)||!validCount(a.updates)||!Number.isInteger(a.lastUpdate)||a.lastUpdate>w.dayIndex||['attack','survival','economy','uptime'].some(k=>!Number.isFinite(a[k])||Math.abs(a[k])>.451))return false;}
  if(['funded','unfunded','strikes','fullStreak'].some(k=>!validCount(r.economy[k])))return false;
  for(const [key,obs] of Object.entries(r.observed)){
   if(key!==obs.id+'@'+obs.revision||!h2gResolve(w,n.id,obs.id,obs.revision)||!['front','rear'].includes(obs.role)||!validCount(obs.startedDay)||!validCount(obs.lastDay)||obs.lastDay>w.dayIndex||obs.startedDay>obs.lastDay||
     (!Array.isArray(obs.seenEncounters)||obs.seenEncounters.length>32)||!['engagements','phaseCalls','attackUnits','damaged','disabled','destroyed','removed','repaired','funded','unfunded','ammoBlocked'].every(k=>validCount(obs[k]))||!validNum(obs.attackPower))return false;
  }
 }
 return s.events.every(e=>validCount(e.day)&&e.day<=w.dayIndex&&w.nations[e.nationId]&&typeof e.kind==='string');
}
function h2iExport(w,nid=null){const s=h2iEnsure(w);return {schema:'vilob-light-h2i-learning-v1',version:VERSION,startedDay:s.startedDay,day:w.dayIndex,
 interpretation:'Actual post-import revision-specific observations; attack power is NOT verified enemy damage; no retroactive learning. Bounded deterministic updates.',
 nations:w.nations.filter(n=>nid===null||n.id===nid).map(n=>({nationId:n.id,nation:n.name,profile:h2hProfile(w,n),frontDoctrine:h2iDoctrine(w,n,'front'),rearDoctrine:h2iDoctrine(w,n,'rear'),...structuredClone(s.nations[n.id])})),
 events:s.events.filter(e=>nid===null||e.nationId===nid)};}
// Paid move to physical warehouse for ready machines at a safe idle base.
// Keep at least one machine in each group to avoid ghost formations.
function h2iTryReserve(w,n){
 if(!H2I_ENABLED||!hasTech(w,n.id,'automaton_maintenance')||h2iEnsure(w).nations[n.id].economy.strikes<2)return false;
 const candidates=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&a.engagementId===null&&!a.order&&!a.operation&&atSafeSettlement(w,a)&&(!militaryAtWar(w,n.id)||h2jRearSafe(w,a)))
  .sort((a,b)=>a.id-b.id);
 for(const a of candidates){for(const g of hGroups(w,a).sort((x,y)=>x.id-y.id)){
  if(g.ready<=1||g.damaged||g.disabled)continue;
  const amount=Math.min(8,g.ready-1);
  if(h2hExecute(w,n,{type:'H2I_RESERVE',armyId:a.id,groupId:g.id,amount},'RESERVE','POWER_SHORTAGE')){
   h2iEnsure(w).nations[n.id].reserved+=amount;h2iLog(w,n,'WAREHOUSE','POWER_SHORTAGE',{armyId:a.id,designId:g.blueprintId,revision:g.revision,amount});return true;
  }
 }}return false;
}

// H2J — AI-origin metadata is explicit, never determined by a mutable display name.
// Legacy migration recognizes only H2H's exact generated-name grammar.
const H2J_LEGACY_AI_NAME=/^AI (?:전열|화력) [1-9][0-9]*식$/;
const H2J_STANDARD_NAMES=Object.freeze({light_infantry_support_i:'경량 보병지원-01',armored_frontline_i:'중장갑 전열-02',fire_support_i:'화력지원-03'});
const H2J_SLOT_LABELS=Object.freeze({chassis:'프레임',power:'동력',mobility:'이동',weapon:'무장',armor:'장갑',utility:'보조'});
function h2jIsAi(bp){return !!bp&&(bp.origin==='AI'||(!bp.origin&&H2J_LEGACY_AI_NAME.test(bp.name)));}
function h2jDisplayName(bp){return H2J_STANDARD_NAMES[bp?.id]||bp?.name||'—';}
function h2jIntent(w,nid,role,spec,ids){
 const n=w.nations[nid],military=n?h2hProfile(w,n):{defense:50,ranged:50,aggression:50,investment:50};
 if(role==='front'){
  if(spec.armor>=24&&military.defense>=military.aggression-10)return '중장방호';
  if(spec.armor>=20&&spec.melee>=.52)return '중장돌격';
  if(ids.weapon==='frontline_weapon_i'&&spec.contact>=.22)return '돌격전열';
  if(ids.mobility==='stable_walker_i')return '안정전열';
  if(spec.fuelFactor<=.9||military.investment<=35&&spec.fuelFactor<=1)return '경제전열';
  return spec.armor>=18?'견고전열':'범용전열';
 }
 if(spec.armor>=22&&military.defense>military.ranged+10)return '중장화력';
 if(ids.weapon==='heavy_shooter_i'&&spec.penetration>=28)return '관통화력';
 if(ids.weapon==='heavy_shooter_i')return '중화력';
 if(ids.utility==='precision_aim_i')return '정밀사격';
 if(spec.fuelFactor<=.9||military.investment<=35&&spec.fuelFactor<=1)return '경량지원';
 return '화력지원';
}
function h2jAiNumber(w,nid,id){
 const related=w.hAutomaton.blueprints.filter(bp=>bp.ownerNationId===nid&&bp.id===id&&Number.isInteger(bp.modelNumber));
 if(related.length)return related[0].modelNumber;
 const used=new Set(w.hAutomaton.blueprints.filter(bp=>bp.ownerNationId===nid&&bp.id!==id&&bp.origin==='AI'&&Number.isInteger(bp.modelNumber)).map(bp=>bp.modelNumber));
 for(let i=1;i<1000;i++)if(!used.has(i))return i;
 return 999;
}
function h2jName(n,intent,number,revision){
 const suffix=' '+intent+'-'+String(number).padStart(2,'0')+(revision>1?' R'+revision:'');
 return n.name.slice(0,Math.max(1,36-suffix.length))+suffix;
}
function h2jTagAi(w,nid,id,revision,reason='AI 학습 설계'){
 const bp=w.hAutomaton.blueprints.find(x=>x.ownerNationId===nid&&x.id===id&&x.revision===revision);
 if(!bp)return false;
 const n=w.nations[nid],d=h2gResolve(w,nid,id,revision);
 if(!d)return false;
 const num=h2jAiNumber(w,nid,id),intent=h2jIntent(w,nid,d.role,d,d.moduleIds);
 const prior=revision>1?h2gResolve(w,nid,id,revision-1):null;
 const changed=prior?H_SLOT_KEYS.filter(slot=>prior.moduleIds[slot]!==d.moduleIds[slot]).map(slot=>H2J_SLOT_LABELS[slot]+' 변경'):[];
 const p=h2hProfile(w,n);
 bp.origin='AI';bp.modelNumber=num;bp.designIntent=intent;
 bp.intentReason=(revision>1?`${intent} 중심 개량 · ${changed.join(' / ')||'배치 성능 재평가'}`:
  `${intent} 중심 최초 설계 · 국가 성향(방어 ${p.defense}, 원거리 ${p.ranged}, 공격 ${p.aggression}) 반영`).slice(0,120);
 bp.name=h2jName(n,intent,num,revision);
 return true;
}
function h2jMigrateWorld(w){
 if(!w.hAutomaton||!Array.isArray(w.hAutomaton.blueprints))return;
 // Assign stable nation-local model numbers in first-registration order. This is
 // metadata-only: IDs, revision counters, modules, machine groups and stocks stay untouched.
 for(const n of w.nations){
  const records=w.hAutomaton.blueprints.filter(b=>b.ownerNationId===n.id&&/^h2g_n\d+_\d+$/.test(b.id));
  const aiIds=[...new Set(records.filter(h2jIsAi).map(b=>b.id))].sort((a,b)=>{
   const ar=records.filter(x=>x.id===a).sort((x,y)=>x.revision-y.revision)[0];
   const br=records.filter(x=>x.id===b).sort((x,y)=>x.revision-y.revision)[0];
   return (ar.createdDay??0)-(br.createdDay??0)||a.localeCompare(b);
  });
  // Preserve already explicit model numbers on future loads.
  const occupied=new Set(records.filter(b=>b.origin==='AI'&&Number.isInteger(b.modelNumber)).map(b=>b.modelNumber));
  const numbers=new Map();
  for(const id of aiIds){const old=records.find(b=>b.id===id&&Number.isInteger(b.modelNumber));
   if(old){numbers.set(id,old.modelNumber);continue;}
   let number=1;while(occupied.has(number))number++;
   occupied.add(number);numbers.set(id,number);
  }
  for(const bp of records){
   if(bp.origin==='USER'||!aiIds.includes(bp.id)){bp.origin??='USER';continue;}
   const d=h2gResolve(w,n.id,bp.id,bp.revision);if(!d)continue;
   const intent=bp.designIntent||h2jIntent(w,n.id,d.role,d,d.moduleIds);
   bp.origin='AI';bp.modelNumber=numbers.get(bp.id);bp.designIntent=intent;
   if(!bp.intentReason)bp.intentReason='H2J 이관: 기존 파츠 구성에서 추정한 설계 의도 (당시 AI 판단 기록 아님)';
   if(!bp.name.startsWith(n.name+' ')||H2J_LEGACY_AI_NAME.test(bp.name))bp.name=h2jName(n,intent,bp.modelNumber,bp.revision);
  }
 }
}
function h2jValid(w){
 for(const bp of w.hAutomaton?.blueprints||[]){
  if(!/^h2g_n\d+_\d+$/.test(bp.id))continue;
  if(!['AI','USER'].includes(bp.origin))return false;
  if(bp.origin==='AI'&&(!Number.isSafeInteger(bp.modelNumber)||bp.modelNumber<1||bp.modelNumber>999||typeof bp.designIntent!=='string'||bp.designIntent.length>24||!bp.designIntent||typeof bp.intentReason!=='string'||bp.intentReason.length>120))return false;
 }
 return true;
}
function h2jRearSafe(w,a){
 if(!atSafeSettlement(w,a))return false;
 const start=w.tiles[a.tileId];if(!start)return false;
 for(const t of w.tiles){if(Math.abs(start.x-t.x)+Math.abs(start.y-t.y)>2)continue;
  if(t.ownerId!==null&&t.ownerId!==a.nationId&&w.nations[t.ownerId]?.active)return false;
  if(t.occupiedBy!==null&&t.occupiedBy!==a.nationId)return false;
 }
 return true;
}
// Compare front and rear every review, then spend at most one normal military
// action. If no revision is justified, production resumes on the old preferred model.
function h2jPickDesign(w,n,plan){
 const inv=n.hAutomaton,ids=Object.keys(inv.h2g.current).filter(id=>id.startsWith('h2g_n'+n.id+'_'));
 const existing=ids.map(id=>h2gResolve(w,n.id,id)).filter(d=>d&&h2jIsAi(d.blueprint));
 const desired=h2hDesiredRole(w,n),learning=h2iEnsure(w).nations[n.id];learning.reviews++;h2iUpdate(w,n);
 const scans=['front','rear'].map(role=>{
  const current=existing.find(d=>d.role===role)||null,search=h2hBest(w,n,role),{best,baseline,seen}=search;
  const score=current?h2hScore(w,n,role,current,current.moduleIds):-Infinity;
  const elapsed=w.dayIndex-(learning.lastRedesign[role]??-10000);
  const econ=learning.economy,stressed=econ.funded+econ.unfunded>=80&&econ.funded/Math.max(1,econ.funded+econ.unfunded)<.75;
  const gain=best&&current?best.score-score:0;
  const threshold=current?Math.max(4,Math.abs(score)*.065):0;
  const change=best&&current&&best.hash!==current.blueprint.designHash;
  const upgrade=change&&elapsed>=H2I_REDESIGN_COOLDOWN&&current.blueprint.revision<99&&
    (gain>threshold||stressed&&best.spec.fuelFactor<current.fuelFactor-.24&&gain>-4);
  const create=!current&&best&&existing.length<H2H_MAX_AI_DESIGNS&&ids.length<H2G_MAX_DESIGNS&&best.score>=baseline*.87;
  return {role,current,best,baseline,seen,score,gain,threshold,upgrade,create};
 });
 plan.lastReview=w.dayIndex;plan.candidates=scans.reduce((a,r)=>a+r.seen,0);
 const proposals=scans.filter(x=>x.upgrade||x.create).sort((a,b)=>{
  const importance=x=>x.create?2+(x.role===desired?1:0):x.gain/Math.max(1,Math.abs(x.score));
  return importance(b)-importance(a)||(a.role===desired?-1:1);
 });
 for(const p of proposals){
  if(p.upgrade){
   const action={type:'H2G_SAVE_DESIGN',designId:p.current.blueprint.id,name:p.current.blueprint.name,modules:p.best.ids};
   const result=h2hExecute(w,n,action,'DESIGN','H2J_DUAL_ROLE_REVISION');
   if(!result)continue;
   plan.role=p.role;plan.designId=result.blueprintId;plan.revision=result.revision;plan.score=p.best.score;plan.phase='REVISED';
   learning.lastRedesign[p.role]=w.dayIndex;learning.redesigns++;
   h2iLog(w,n,'REVISION','DUAL_ROLE_LEARNED',{designId:result.blueprintId,revision:result.revision,role:p.role,oldScore:p.score,newScore:p.best.score});
   return true;
  }
  if(p.create){
   const name='AI '+(p.role==='front'?'전열':'화력')+' '+(existing.length+1)+'식';
   const result=h2hExecute(w,n,{type:'H2G_SAVE_DESIGN',name,modules:p.best.ids},'DESIGN','H2J_DUAL_ROLE_NEW');
   if(!result)continue;
   plan.role=p.role;plan.designId=result.blueprintId;plan.revision=result.revision;plan.score=p.best.score;plan.phase='NEW_DESIGN';return true;
  }
 }
 const keep=existing.find(d=>d.role===desired)||existing[0];
 if(keep){plan.role=keep.role;plan.designId=keep.blueprint.id;plan.revision=keep.blueprint.revision;
  plan.score=scans.find(x=>x.role===keep.role)?.score??null;plan.blocked='';return false;}
 plan.role=desired;plan.designId=null;plan.revision=null;plan.score=null;plan.blocked='NO_VALID_DESIGN';return false;
}

// H2B: per-quarter, deterministic type policy. No saved AI counters or RNG.
function h2bTryAiRefit(w,n){
 if(h2dAiPause(w,n)){h2eBlocked(w,n,'REFIT_POWER_HALT');return false;}
 const target=h2kTarget(w,n);
 if(hAllNation(w,n.id)<Math.max(16,target-8)||n.apUnits<5)return false;
 const counts=h2bTypeCount(w,n),rank=h2bRank(w,n,counts);
 const targets=rank.filter(x=>x.id!==H_BLUEPRINT.id&&x.score>=1);
 if(!targets.length){h2bRecord('blocked','REFIT_TARGET_MET');return false;}
 const candidates=w.armies.filter(a=>a.nationId===n.id&&a.hAutomatonGroupIds?.length&&a.status==='READY'&&!a.order&&!a.operation&&a.engagementId===null)
  .map(a=>({army:a,ready:h2bRefittable(w,a)}))
  .filter(x=>x.ready>0&&h2bEligibleRefit(w,x.army,n.id));
 if(!H2E_AI_ENABLED)candidates.sort((a,b)=>b.ready-a.ready||a.army.id-b.army.id);
 for(const x of targets.slice(0,2)){
  const ordered=H2E_AI_ENABLED?h2eRankCandidates(w,candidates,x.id).slice(0,6):candidates.slice(0,6);
  for(const entry of ordered){
   const cap=Math.min(8,Math.floor(x.score),entry.ready);
   const sizes=[cap,Math.min(4,cap),1].filter((q,i,a)=>q>=1&&a.indexOf(q)===i);
   for(const qty of sizes){
    const act={type:'H_REFIT',armyId:entry.army.id,blueprintId:x.id,amount:qty};
    if(!h2bSustainable(w,n,act))continue;
    if(h1bTryAi(w,n,act)){
     h2bRecord('refit',x.id);
     if(H2E_AI_ENABLED)h2eRecord(w,'REFIT',n,entry.army,x.id,qty,entry);
     return true;
    }
   }
  }
 }
 h2bRecord('blocked','REFIT_UNAVAILABLE');h2eBlocked(w,n,'REFIT_UNAVAILABLE');return false;
}
function h2bTryAiDeployment(w,n,inv){
 if(inv.stored<1)return false;
 const owned=h2bTypeCount(w,n),rank=h2bRank(w,n,owned);
 const ids=rank.map(x=>x.id).filter(id=>h2aStored(inv,id)>0);
 if(!ids.length)return false;
 const armies=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&atSafeSettlement(w,a)&&hCount(w,a,true)<H_MAX_PER_ARMY)
  .sort((a,b)=>hCount(w,a,true)-hCount(w,b,true)||a.id-b.id);
 for(const id of ids){
  const ranked=H2E_AI_ENABLED?h2eRankCandidates(w,armies,id):null;
  const sorted=ranked?ranked.map(x=>x.army):id==='armored_frontline_i'?armies.slice().sort((a,b)=>
   (hPositionQty(w,a,'front',true)+deployedManpower(a,'front'))-(hPositionQty(w,b,'front',true)+deployedManpower(b,'front'))||a.id-b.id):
   id==='fire_support_i'?armies.slice().sort((a,b)=>
    (deployedManpower(b,'front')+hPositionQty(w,b,'front',true))-(deployedManpower(a,'front')+hPositionQty(w,a,'front',true))||a.id-b.id):armies;
  for(let i=0;i<sorted.length;i++){
   const a=sorted[i],qty=Math.min(16,h2aStored(inv,id),H_MAX_PER_ARMY-hCount(w,a,true));
   const act={type:'H_DEPLOY',armyId:a.id,blueprintId:id,amount:qty};
   if(qty>0&&h1bTryAi(w,n,act)){
    h2bRecord('deploy',id);
    if(H2E_AI_ENABLED)h2eRecord(w,'DEPLOY',n,a,id,qty,ranked[i]);
    return true;
   }
   if(h1bAiTelemetry.enabled)h1bAiTelemetry.deployCandidatesRejected++;
  }
  const independent={type:'H_DEPLOY',armyId:null,blueprintId:id,amount:Math.min(16,h2aStored(inv,id))};
  if(h1bTryAi(w,n,independent)){
   h2bRecord('deploy',id);
   if(H2E_AI_ENABLED)h2eRecord(w,'DEPLOY',n,null,id,independent.amount,null,'INDEPENDENT_FALLBACK');
   return true;
  }
 }
 h2bRecord('blocked','DEPLOY_NO_TARGET');h2eBlocked(w,n,'DEPLOY_NO_TARGET');return false;
}
function h2bTryAiAssemble(w,n,inv){
 if(h2dAiPause(w,n))return false;
 const rank=h2bRank(w,n),cap=Math.min(h2kBatch(w,n.id),...H_SLOT_KEYS.map(k=>inv.parts[k]));
 for(const x of rank){
  if(x.score<.5)continue;
  // Preserve pre-H2B 8-unit assembly habit, except final 1..7 slots near cap.
  const qty=Math.min(cap,Math.max(0,h2kTarget(w,n)-hAllNation(w,n.id)));
  if(qty<1)break;
  const act={type:'H_ASSEMBLE',blueprintId:x.id,amount:qty};
  if(!h2bSustainable(w,n,act))continue;
  if(h1bTryAi(w,n,act)){h2bRecord('assembly',x.id);return true;}
 }
 h2bRecord('blocked','ASSEMBLE_UNAVAILABLE');return false;
}
// H2B1: strictly limited AP-priority rescue for stagnant mono-type AI forces.
// A successful early conversion counts as this quarter's sole automaton action.
function h2b1PriorityRefit(w,n){
 if(h2dAiPause(w,n))return false;
 if(H2H_AI_ENABLED&&hasTech(w,n.id,'automaton_maintenance'))return false;
 if(!H2B_AI_ENABLED||!n.active||n.controller!=='AI'||n.apUnits<5||
    militaryAtWar(w,n.id)||!hUnlocked(w,n.id)||!hFactory(w,n.id)||!hWorksite(w,n.id))return false;
 const target=h2kTarget(w,n);
 const owned=hAllNation(w,n.id);
 if(owned<Math.max(32,target-8))return false;
 const counts=h2bTypeCount(w,n);
 const advanced=counts.armored_frontline_i+counts.fire_support_i;
 if(advanced>Math.floor(owned*.15))return false;
 return h2bTryAiRefit(w,n);
}
function h1bFindAiRepair(w,n){
 if(!hasTech(w,n.id,'automaton_maintenance'))return false;
 const candidates=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&a.engagementId===null&&!a.hRepairPlan&&!a.rearmPlan&&!a.g5RedeployPlan&&!a.order&&!a.operation&&atSafeSettlement(w,a))
   .map(a=>({army:a,disabled:hGroups(w,a).reduce((v,g)=>v+g.disabled,0),damaged:hGroups(w,a).reduce((v,g)=>v+g.damaged,0)}))
   .filter(x=>x.disabled+x.damaged>0)
   .sort((a,b)=>b.disabled-a.disabled||b.damaged-a.damaged||a.army.id-b.army.id);
 if(h1bAiTelemetry.enabled)h1bAiTelemetry.repairCandidates+=candidates.length;
 for(const x of candidates){
  // Check affordable quantities from large to small, preserving original AP/Gold/material cost.
  for(let qty=Math.min(24,x.disabled+x.damaged);qty>=1;qty--){
   if(h1bTryAi(w,n,{type:'H_REPAIR',armyId:x.army.id,amount:qty})){
    if(h1bAiTelemetry.enabled){h1bAiTelemetry.repairStarts++;h1bAiTelemetry.repairUnits+=qty;}
    return true;
   }
  }
 }
 if(candidates.length)h1bAiBlock('REPAIR_NO_AFFORDABLE_ORDER');
 return false;
}
function h1bTryAiDeployment(w,n,inv){
 if(inv.stored<1)return false;
 const armies=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&atSafeSettlement(w,a)&&hCount(w,a,true)<H_MAX_PER_ARMY)
   .sort((a,b)=>hCount(w,a,true)-hCount(w,b,true)||a.id-b.id);
 for(const army of armies){
  const act={type:'H_DEPLOY',armyId:army.id,amount:Math.min(16,inv.stored,H_MAX_PER_ARMY-hCount(w,army,true))};
  if(h1bTryAi(w,n,act)){
   if(h1bAiTelemetry.enabled){h1bAiTelemetry.deployStarts++;h1bAiTelemetry.deployUnits+=act.amount;}
   return true;
  }
  if(h1bAiTelemetry.enabled)h1bAiTelemetry.deployCandidatesRejected++;
 }
 const independent={type:'H_DEPLOY',armyId:null,amount:Math.min(16,inv.stored)};
 if(h1bTryAi(w,n,independent)){
  if(h1bAiTelemetry.enabled){h1bAiTelemetry.deployStarts++;h1bAiTelemetry.deployUnits+=independent.amount;}
  return true;
 }
 h1bAiBlock('DEPLOY_NO_AFFORDABLE_TARGET');
 return false;
}
// H1D: no RNG, teleportation, free repair, or persistent performance history.
// Return planning is capped at one new field army per nation/quarter; combat and
// forced retreat override voluntary maintenance travel.
const h1dTelemetry={enabled:false,quarters:0,returnStarts:0,towStarts:0,arrivals:0,localClears:0,formationMoves:0,blocked:{},lastQuarterMs:0,maxQuarterMs:0,samples:[]};
function h1dBlock(why){if(h1dTelemetry.enabled)h1dTelemetry.blocked[why]=(h1dTelemetry.blocked[why]||0)+1;}
function h1dDamaged(w,a){return hGroups(w,a).reduce((s,g)=>s+g.damaged+g.disabled,0);}
function h1dServiceSafe(w,a){return a.status==='READY'&&a.engagementId===null&&!a.hRepairPlan&&!a.rearmPlan&&!a.g5RedeployPlan&&!isOccupying(w,a);}
function h1dTowAllowed(w,a,target){
 const p=a?.hServiceReturn;
 return !!(p?.tow&&p.targetTileId===target&&a.status==='READY'&&hCount(w,a,true)>0&&manpower(a)===0&&hEffective(w,a)<=0&&
   hasTech(w,a.nationId,'automaton_maintenance')&&w.tiles[a.tileId]?.ownerId===a.nationId&&
   landRoute(w,a.tileId,target,t=>t.ownerId===a.nationId&&t.occupiedBy===null,a.nationId));
}
function h1dCancelService(w,a){
 if(!a.hServiceReturn)return;
 if(a.operation?.type==='H_SERVICE_RETURN'||a.operation?.type==='H_SERVICE_WAIT')a.operation=null;
 if(a.order&&a.order.targetTileId===a.hServiceReturn.targetTileId)a.order=null;
 delete a.hServiceReturn;a.needsOrders=true;w.changeSeq++;
}
function h1dServiceOnArrival(w,a){
 if(!a.hServiceReturn)return;
 if(atSafeSettlement(w,a)){
  a.order=null;a.operation={type:'H_SERVICE_WAIT',targetTileId:a.tileId,assignedDay:w.dayIndex};
  a.needsOrders=false;
  if(h1dTelemetry.enabled)h1dTelemetry.arrivals++;
  w.changeSeq++;
 }
}
function h1dPrepareLocal(w,n){
 // An old REARM / SUPPLY_RETURN *label* is not an active rearmPlan or retreat.
 // Clear only completed, stationary, non-occupying duties so paid repair can run.
 let freed=0;
 for(const a of w.armies){
  if(a.nationId!==n.id||!h1dServiceSafe(w,a)||!atSafeSettlement(w,a)||h1dDamaged(w,a)<=0||a.order)continue;
  if(a.operation&&['REARM','SUPPLY_RETURN','BORDER_GARRISON','H_SERVICE_RETURN','H_SERVICE_WAIT'].includes(a.operation.type)){
   a.operation=null;freed++;w.changeSeq++;
  }
  if(a.hServiceReturn){delete a.hServiceReturn;w.changeSeq++;}
 }
 if(h1dTelemetry.enabled)h1dTelemetry.localClears+=freed;
}
function h1dFindReturn(w,n){
 if(!hasTech(w,n.id,'automaton_maintenance'))return false;
 if(n.apUnits<2){h1dBlock('MOVE_AP_SHORTAGE');return false;}
 const already=w.armies.filter(a=>a.nationId===n.id&&a.hServiceReturn);
 // One en-route formation per nation, avoiding repeated route searches and AP spikes.
 if(already.some(a=>a.order&&a.status==='READY'))return false;
 const cores=w.settlements.filter(t=>safeSettlement(w,t,n.id)).map(t=>t.coreTileId);
 if(!cores.length){h1dBlock('NO_SAFE_CORE');return false;}
 const candidates=w.armies.filter(a=>a.nationId===n.id&&h1dDamaged(w,a)>0&&!atSafeSettlement(w,a)&&h1dServiceSafe(w,a)&&!a.hServiceReturn&&
   w.tiles[a.tileId]?.ownerId===n.id&&w.tiles[a.tileId]?.occupiedBy===null&&
   (!a.order||h1dDamaged(w,a)>=8)&&!['OCCUPY','SUPPLY_RETURN'].includes(a.operation?.type))
   .sort((a,b)=>hGroups(w,b).reduce((s,g)=>s+g.disabled,0)-hGroups(w,a).reduce((s,g)=>s+g.disabled,0)||h1dDamaged(w,b)-h1dDamaged(w,a)||a.id-b.id);
 // Bounded routing work; a closer valid army will be reconsidered next quarter.
 for(const a of candidates.slice(0,8)){
  const targets=cores.slice().sort((x,y)=>{
   const p=pointOf(a.tileId,w.size),q=pointOf(x,w.size),r=pointOf(y,w.size);
   return (Math.abs(p.x-q.x)+Math.abs(p.y-q.y))-(Math.abs(p.x-r.x)+Math.abs(p.y-r.y))||x-y;
  });
  let target=null;
  for(const id of targets.slice(0,10))if(landRoute(w,a.tileId,id,t=>t.ownerId===n.id&&t.occupiedBy===null,n.id)){target=id;break;}
  if(target===null){h1dBlock('NO_OWN_ROUTE');continue;}
  const tow=manpower(a)===0&&hEffective(w,a)<=0;
  // Immobile machines require a paid logistics team, not an instant relocation.
  const towGold=tow?8+Math.ceil(h1dDamaged(w,a)*1.5):0,towCoal=tow?Math.max(1,Math.ceil(hCount(w,a,true)/8)):0;
  if(tow&&(!hFactory(w,n.id)||n.gold<towGold||n.resources.coal<towCoal)){
   h1dBlock('NO_TOW_RESOURCES');continue;
  }
  const oldPlan=a.hServiceReturn,oldOperation=a.operation;
  a.hServiceReturn={targetTileId:target,startedDay:w.dayIndex,tow};
  const result=executeNationAction(w,n.id,{type:'MOVE_ARMY',armyId:a.id,targetTileId:target});
  if(!result.ok){if(oldPlan)a.hServiceReturn=oldPlan;else delete a.hServiceReturn;a.operation=oldOperation;h1dBlock('MOVE_REJECTED');continue;}
  if(tow){n.gold-=towGold;n.resources.coal-=towCoal;}
  a.operation={type:'H_SERVICE_RETURN',targetTileId:target,assignedDay:w.dayIndex};
  a.needsOrders=false;
  if(h1dTelemetry.enabled){h1dTelemetry.returnStarts++;if(tow)h1dTelemetry.towStarts++;}
  w.changeSeq++;return true;
 }
 return false;
}
function h1dPeacetimeFormation(w){
 // Passive, once per quarter. Never rearrange machines during war or engagements.
 let moved=0;
 for(const a of w.armies){
  if(a.status!=='READY'||a.engagementId!==null||w.nations[a.nationId]?.controller!=='AI'||militaryAtWar(w,a.nationId)||a.order||a.hRepairPlan||a.rearmPlan||a.g5RedeployPlan)continue;
  if(!atSafeSettlement(w,a))continue;
  const humanFront=deployedManpower(a,'front'),humanReserve=deployedManpower(a,'reserve');
  const desired=humanFront>0?'rear':humanReserve===0?'front':null;
  for(const g of hGroups(w,a)){
   // Legacy first model keeps H1D's human-front-dependent positioning.
   // H2A advanced types return to their designed front/rear only after war,
   // at a safe idle base. No change while battling, marching or occupying.
   const target=g.blueprintId===H_BLUEPRINT.id?desired:h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision).role;
   if(!target||g.position===target||g.ready+g.damaged<=0)continue;
   if(g.blueprintId!==H_BLUEPRINT.id&&(a.operation||a.hServiceReturn||isOccupying(w,a)))continue;
   g.position=target;moved+=hAliveMachine(w,g);w.changeSeq++;
  }
 }
 if(h1dTelemetry.enabled)h1dTelemetry.formationMoves+=moved;
 return moved;
}
function hQuarter(w,h2b1EarlyCompleted=null){
 if(!H_ENABLED)return;
 hInit(w);
 h1dPeacetimeFormation(w);
 for(const n of w.nations){
  if(!n.active||!hUnlocked(w,n.id))continue;
  const groups=w.hAutomaton.groups.filter(g=>g.ownerNationId===n.id);
  if(H2D_ENABLED)h2dPower(w,n,groups);
  else{ // Exact legacy H2C branch for gate-OFF parity.
   const count=groups.reduce((sum,g)=>sum+(g.ready+g.damaged)*h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision).fuelFactor,0),blocks=Math.ceil(count/8);
   if(blocks){const coal=blocks,gold=blocks*4;
    if(n.resources.coal>=coal&&n.gold>=gold){n.resources.coal-=coal;n.gold-=gold;n.hAutomaton.maintainedQuarters++;for(const g of groups)g.fueled=true;h2cPower(w,n,groups,true,coal,gold);}
    else{n.hAutomaton.unfundedQuarters++;for(const g of groups)g.fueled=false;h2cPower(w,n,groups,false);}
   }
  }
  if(n.controller!=='AI'||!hFactory(w,n.id)||!hWorksite(w,n.id))continue;
  // H1D: stale stationary orders must not block real maintenance forever.
  h1dPrepareLocal(w,n);
  // H2B1 early conversion already used this quarter's single H action.
  if(h2b1EarlyCompleted?.has(n.id)){h1dFindReturn(w,n);continue;}
  // One successful H action per AI nation/quarter. Repair takes precedence over new manufacture.
  if(h1bFindAiRepair(w,n)){h1dFindReturn(w,n);continue;}
  h1dFindReturn(w,n);
  const inv=n.hAutomaton;
  if(H2H_AI_ENABLED){h2hAiQuarter(w,n);continue;}
  if(H2B_AI_ENABLED){
   // Repairs and urgent returns remain first. One successful H action per quarter.
   if(h2bTryAiRefit(w,n))continue;
   if(inv.stored>0&&h2bTryAiDeployment(w,n,inv))continue;
   if(H_SLOT_KEYS.every(k=>inv.parts[k]>=1)&&h2bTryAiAssemble(w,n,inv))continue;
  }else{
   // Exact H2A AI fallthrough for parity and regression testing.
   if(inv.stored>=8&&h1bTryAiDeployment(w,n,inv))continue;
   if(H_SLOT_KEYS.every(k=>inv.parts[k]>=8)&&h1bTryAi(w,n,{type:'H_ASSEMBLE',amount:8}))continue;
  }
  if(!h2dAiPause(w,n)&&hAllNation(w,n.id)<h2kTarget(w,n)&&n.resources.machine_parts>=3&&n.resources.iron>=32&&n.gold>=300)
   h1bTryAi(w,n,{type:'H_BUILD_PARTS'});
 }
}
function hMachineAllocationPower(w,a,alloc){
 const selected=new Map((alloc||[]).filter(x=>x.armyId===a.id&&typeof x.unitId==='string'&&x.unitId.startsWith('H:')).map(x=>[Number(x.unitId.slice(2)),x.men]));
 return hGroups(w,a).reduce((sum,g)=>sum+Math.min(g.ready+g.damaged,selected.get(g.id)||0)*hMachineReadyPower(g)/Math.max(1,g.ready+g.damaged),0);
}
function hVolley(w,a,phase,warId,alloc=null){
 if(!['OPENING','SUSTAINED'].includes(phase))return true;
 let active=alloc?hMachineAllocationPower(w,a,alloc):hEffective(w,a);
 const groups=hGroups(w,a);
 if(groups.some(g=>g.blueprintId!==H_BLUEPRINT.id)){
  const selected=new Map((alloc||[]).filter(x=>x.armyId===a.id&&typeof x.unitId==='string'&&x.unitId.startsWith('H:')).map(x=>[Number(x.unitId.slice(2)),x.men]));
  active=groups.reduce((sum,g)=>{const qty=alloc?Math.min(g.ready+g.damaged,selected.get(g.id)||0):g.ready+g.damaged;
   return sum+qty*hMachineReadyPower(g)/Math.max(1,g.ready+g.damaged)*h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision).ammoFactor;},0);
 }
 active=Math.floor(active);if(active<=0)return true;
 const n=w.nations[a.nationId],iron=Math.max(1,Math.ceil(active/40)),gold=Math.max(1,Math.ceil(active*.11));
 if(n.resources.iron<iron||n.gold<gold){h2cVolley(w,a,false,0,0,alloc);return false;}
 n.resources.iron-=iron;chargeMilitaryOperation(w,a.nationId,gold,warId,'battle');h2cVolley(w,a,true,iron,gold,alloc);return true;
}
function hMachineChannels(w,a,phase,defending,terrain,broken,channelOut,ammo=true,alloc=null){
 if(!H_ENABLED||(!ammo&&['OPENING','SUSTAINED'].includes(phase)))return 0;
 // Combat contribution is limited to the ACTUAL phase/terrain allocation. No
 // rear machine melee, no frontline sustained fire, no power beyond the cap.
 const qty=alloc?hMachineAllocationPower(w,a,alloc):hEffective(w,a);if(!qty)return 0;
 const kind=phase==='OPENING'||phase==='SUSTAINED'?'FIREARM_SHOT':'MELEE_PHYSICAL';
 const ground=defending?(terrain==='mountain'?1.38:terrain==='forest'?1.16:terrain==='rock'?1.1:1.05):1;
 const scale=(.55+a.morale/180)*ground*(a.supplyMultiplier??1)*(broken?.67:1);
 const groups=hGroups(w,a);
 if(!groups.some(g=>g.blueprintId!==H_BLUEPRINT.id)){
  // Exact pre-H2A arithmetic and channel generation for legacy-only worlds.
  const weapon=h2aDesign(H_BLUEPRINT.id),factor=phase==='OPENING'?weapon.opening:phase==='SUSTAINED'?weapon.sustained:phase==='CONTACT'?weapon.contact:weapon.melee;
  const pen=kind==='FIREARM_SHOT'?weapon.penetration:0;
  const power=qty*factor*(.55+a.morale/180)*ground*(a.supplyMultiplier??1)*(broken?.67:1);
  if(channelOut&&G4_COMBAT_ENABLED)g4AddChannel(channelOut,kind,pen,power);
  h2cAttack(w,a.nationId,H_BLUEPRINT.id,phase,qty,power);
  if(H2I_ENABLED)for(const g of groups){const q=alloc?Math.min(g.ready+g.damaged,new Map(alloc.filter(x=>x.armyId===a.id&&x.unitId==='H:'+g.id).map(x=>[g.id,x.men])).get(g.id)||0):g.ready+g.damaged;if(q)h2iBattle(w,g,phase,q,power*q/Math.max(1,qty),a.engagementId);}
  return power;
 }
 const selected=new Map((alloc||[]).filter(x=>x.armyId===a.id&&typeof x.unitId==='string'&&x.unitId.startsWith('H:')).map(x=>[Number(x.unitId.slice(2)),x.men]));
 let total=0;
 for(const g of groups){
  const q=alloc?Math.min(g.ready+g.damaged,selected.get(g.id)||0):g.ready+g.damaged;
  if(!q)continue;
  const effective=q*hMachineReadyPower(g)/Math.max(1,g.ready+g.damaged),d=h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision);
  const factor=phase==='OPENING'?d.opening:phase==='SUSTAINED'?d.sustained:phase==='CONTACT'?d.contact:d.melee;
  const power=effective*factor*scale;
  if(channelOut&&G4_COMBAT_ENABLED)g4AddChannel(channelOut,kind,kind==='FIREARM_SHOT'?d.penetration:0,power);
  h2cAttack(w,g.ownerNationId,g.blueprintId,phase,q,power);
  if(H2I_ENABLED)h2iBattle(w,g,phase,q,power,a.engagementId);
  total+=power;
 }
 return total;
}
function hWeightedMachineArmor(armor,channels){
 const values=channels instanceof Map?[...channels]:Object.entries(channels||{});
 const total=values.reduce((sum,[,power])=>sum+power,0);
 if(total<=0)return g4ArmorMultiplierValue(armor,0);
 return values.reduce((sum,[key,power])=>sum+power*g4ArmorMultiplierValue(armor,Number(key.split('|')[1])||0),0)/total;
}
function hDamage(w,g,hits,source='BATTLE'){
 // Each discrete hit advances at most one damage state; aggregate O(1) for group.
 // Always prioritize repairable ready machines, then damaged machines; disabled are non-combat.
 let rem=hits;
 const a=Math.min(g.ready,rem);g.ready-=a;g.damaged+=a;rem-=a;
 const b=Math.min(g.damaged-a,rem);g.damaged-=b;g.disabled+=b;rem-=b;
 const c=Math.min(g.disabled-b,rem);g.disabled-=c;rem-=c;
 if(c){w.nations[g.ownerNationId].hAutomaton.destroyed+=c;
  const inv=w.nations[g.ownerNationId].hAutomaton,d=h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision);for(const slot of H_SLOT_KEYS)h2gExternal(inv,d.moduleIds[slot],-c);
  hLog(w,'BATTLE_DESTROYED',g.ownerNationId,c,g.armyId);}
 const result={damaged:a,disabled:b,destroyed:c};h2cDamage(w,g,result,source);return result;
}
function hAddTargets(w,army,eligible,phase){
 for(const g of hGroups(w,army)){
  const count=g.ready+g.damaged;if(!count||!hMachinePhaseAllowed(g.position,phase))continue;
  eligible.push({armyId:army.id,unitId:'H:'+g.id,count,abilityKey:'H:'+g.blueprintId+':'+g.revision+':'+g.position});
 }
}
function hValidate(w){
 if(!h2cValid(w)||!h2dValid(w)||!h2eValid(w)||!h2hValid(w)||!h2iValid(w)||!h2jValid(w))return false;
 const s=w.hAutomaton;if(!s||s.schema!==2||!Number.isSafeInteger(s.nextId)||!Array.isArray(s.groups)||!Array.isArray(s.blueprints)||!Array.isArray(s.history)||s.history.length>120)return false;
 const seen=new Set(),bpSeen=new Set();
 for(const bp of s.blueprints){const key=bp.ownerNationId+':'+bp.id+':'+bp.revision,known=H2A_DESIGNS[bp.id]?.blueprint||bp;
  if(bpSeen.has(key)||!known||bp.revision!==known.revision||bp.designHash!==known.designHash||!w.nations[bp.ownerNationId]||!H2A_DESIGNS[bp.id]&&(!h2gValidBlueprint(bp)||!bp.id.startsWith('h2g_n'+bp.ownerNationId+'_')))return false;bpSeen.add(key);}
 for(const g of s.groups){
  if(!Number.isSafeInteger(g.id)||seen.has(g.id)||g.id<1||g.id>=s.nextId||!h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision)||!bpSeen.has(g.ownerNationId+':'+g.blueprintId+':'+g.revision))return false;
  seen.add(g.id);const army=getArmy(w,g.armyId);if(!army||army.nationId!==g.ownerNationId||!army.hAutomatonGroupIds?.includes(g.id)||typeof g.fueled!=='boolean'||!['front','rear'].includes(g.position)||[g.ready,g.damaged,g.disabled].some(v=>!Number.isSafeInteger(v)||v<0)||!hAliveMachine(w,g))return false;
 }
 for(const a of w.armies){const ids=a.hAutomatonGroupIds||[];if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!seen.has(id)))return false;}
 for(const n of w.nations){const inv=n.hAutomaton;if(!inv||!inv.parts||!inv.storedByBlueprint||H_SLOT_KEYS.some(k=>!Number.isSafeInteger(inv.parts[k])||inv.parts[k]<0)||[inv.stored,inv.built,inv.destroyed,inv.repairs,inv.batches].some(v=>!Number.isSafeInteger(v)||v<0))return false;
  if(H2A_DESIGN_IDS.some(id=>!Number.isSafeInteger(inv.storedByBlueprint[id])||inv.storedByBlueprint[id]<0)||Object.entries(inv.storedByBlueprint).some(([id,qty])=>!Number.isSafeInteger(qty)||qty<0||!h2gResolve(w,n.id,id)))return false;
  if(Object.values(inv.storedByBlueprint).reduce((sum,x)=>sum+x,0)!==inv.stored)return false;
  const live=s.groups.filter(g=>g.ownerNationId===n.id).reduce((v,g)=>v+hAliveMachine(w,g),0);
  if(inv.built!==inv.stored+live+inv.destroyed)return false;
  const installed=inv.built-inv.destroyed-inv.stored;
  if(!inv.h2g||Object.entries(inv.h2g.finished).some(([key,qty])=>{const id=key.slice(0,key.lastIndexOf('@'));return !inv.storedByBlueprint[id]&&qty>0;}))return false;
  if(installed<0)return false;
 }
 return h2gValidated(w);
}
function hSummary(w){hInit(w);return {version:VERSION,dayIndex:w.dayIndex,blueprint:H_BLUEPRINT,stats:hModuleSummary(),h2fModuleDesigns:Object.fromEntries(H2A_DESIGN_IDS.map(id=>[id,{modules:h2aDesign(id).moduleIds,stats:hModuleSummary(id)}])),nations:w.nations.filter(n=>n.active).map(n=>({nationId:n.id,name:n.name,stage:civilizationLabel(n),stocks:{...n.hAutomaton},deployed:w.hAutomaton.groups.filter(g=>g.ownerNationId===n.id).map(g=>({armyId:g.armyId,ready:g.ready,damaged:g.damaged,disabled:g.disabled,fueled:g.fueled,position:g.position}))}))};}


// H2K — National projects: payable staged investment, no AP cost, research-independent queue.
const K_PROJECT_TECH='national_project_planning';
const K_PROJECTS=Object.freeze({
 ap_capacity:Object.freeze({name:'행정 기반 확충',cost:100000,duration:240,category:'administration',description:'국가 AP 최대 보유량 +1.0'}),
 ap_recovery:Object.freeze({name:'행정 운영 효율화',cost:180000,duration:360,category:'administration',description:'분기 AP 회복량 +0.2'}),
 mining:Object.freeze({name:'광업 생산성 향상',cost:220000,duration:480,category:'industry',description:'실제 광업 시설 생산량 +5%'}),
});
const K_PROJECT_KEYS=Object.freeze(Object.keys(K_PROJECTS));
const K_PROJECT_HISTORY_MAX=24;
function kNewProjects(){return {schema:1,levels:{ap_capacity:0,ap_recovery:0,mining:0},active:null,history:[],spent:0,lastQuarterPaid:0,lastQuarterStatus:'IDLE',lastQuarterDay:0,lastDecision:null};}
function kEnsure(n){const p=n.nationalProjects||(n.nationalProjects=kNewProjects());p.lastDecision??=null;return p;}
function kCost(key,level){const p=K_PROJECTS[key];if(!p||!Number.isSafeInteger(level)||level<1||level>100)return null;return Math.ceil(p.cost*Math.pow(1.6,level-1)-1e-8);}
function kEligible(w,nid,key){return Boolean(K_PROJECTS[key]&&w.nations[nid]?.active&&hasTech(w,nid,K_PROJECT_TECH));}
function kStart(w,nid,key,source='PLAYER'){
 const n=w.nations[nid],state=n&&kEnsure(n);
 if(!kEligible(w,nid,key)||state.active)return {ok:false,reason:'연구 미완료 또는 다른 프로젝트 진행 중'};
 const level=state.levels[key]+1,cost=kCost(key,level);if(!Number.isSafeInteger(cost)||n.gold<Math.ceil(cost/(K_PROJECTS[key].duration/30)))return {ok:false,reason:'1분기 투자금 부족'};
 state.active={key,level,cost,paid:0,completedDays:0,startedDay:w.dayIndex,source};
 state.lastQuarterStatus='STARTED';w.changeSeq++;return {ok:true,key,level,cost};
}
function kCancel(w,nid){const n=w.nations[nid],state=n&&kEnsure(n);if(!state?.active)return {ok:false};
 kHistory(state,w.dayIndex,'CANCEL',state.active);state.active=null;state.lastQuarterStatus='CANCEL';w.changeSeq++;return {ok:true};
}
function kHistory(state,day,kind,a){state.history.push({dayIndex:day,kind,key:a.key,level:a.level,cost:a.cost,paid:a.paid});if(state.history.length>K_PROJECT_HISTORY_MAX)state.history.shift();}
function kQuarter(w){
 for(const n of w.nations){const p=kEnsure(n);if(p.lastQuarterDay===w.dayIndex)continue;p.lastQuarterPaid=0;p.lastQuarterDay=w.dayIndex;
  const a=p.active;if(!n.active||!a){p.lastQuarterStatus='IDLE';continue;}
  const def=K_PROJECTS[a.key],term=def.duration/30,part=Math.ceil(a.cost/term),due=Math.min(part,a.cost-a.paid);
  if(n.gold<due){p.lastQuarterStatus='GOLD_SHORT';continue;}
  n.gold-=due;p.spent+=due;a.paid+=due;a.completedDays+=30;p.lastQuarterPaid=due;p.lastQuarterStatus='PROGRESS';
  if(a.paid>=a.cost){p.levels[a.key]=a.level;p.active=null;p.lastQuarterStatus='COMPLETED';kHistory(p,w.dayIndex,'COMPLETE',a);
   if(a.key==='ap_capacity')refreshApCaps(w);
   const msg=`${n.name}: 국가 프로젝트 ${def.name} ${a.level}단계 완료`;
   w.events.push({dayIndex:w.dayIndex,text:msg,kind:'building'});if(w.events.length>180)w.events.splice(0,w.events.length-180);
  }
  w.changeSeq++;
 }
}
// H2L: bounded AP history + real mining facilities; evaluation is quarterly,
// read-only, and does not generate or spend any resources by itself.
function h2lProjectSignals(w,n){
 const records=(n.apLedger?.history||[]).slice(-8),count=Math.max(1,records.length);
 let spent=0,received=0,offered=0,wasted=0,blocked=0,low=0,high=0;
 for(const r of records){
  spent+=(r.spent?.civil||0)+(r.spent?.military||0)+(r.spent?.research||0);
  received+=r.received||0;offered+=r.offered||0;wasted+=r.wasted||0;blocked+=r.blockedAP||0;
  if(r.opening<r.cap*.30)low++;
  if(r.opening>r.cap*.82)high++;
 }
 const sites={quarry:0,mine:0,coal_pit:0};
 for(const b of w.buildings){if(!Object.prototype.hasOwnProperty.call(sites,b.typeId)||b.status!=='ACTIVE'||b.disconnected||w.tiles[b.tileId]?.ownerId!==n.id||w.tiles[b.tileId]?.occupiedBy!==null)continue;
  const town=w.settlements.find(t=>t.id===b.settlementId&&t.ownerId===n.id&&t.population>0);if(town)sites[b.typeId]++;}
 const factory=h2kFactoryStrength(w,n.id),quarter=n.lastQuarter||projectedQuarter(w,n);
 const fuel=w.hAutomaton?.logistics?.nations?.[n.id]?.last?.dueCoal||0;
 const ironDemand=Math.max(180,200+factory*75),coalDemand=Math.max(350,Math.ceil(fuel*10)+factory*45);
 const ironShort=Math.max(0,1-(n.resources.iron||0)/ironDemand),coalShort=Math.max(0,1-(n.resources.coal||0)/coalDemand);
 const stoneShort=Math.max(0,1-(n.resources.stone||0)/Math.max(250,150+factory*30));
 return {sample:records.length,spent:spent/count,received:received/count,offered:offered/count,
  wastedRatio:wasted/Math.max(1,offered),blocked:blocked/count,low:low/count,high:high/count,
  sites,siteCount:sites.quarry+sites.mine+sites.coal_pit,factory,ironShort,coalShort,stoneShort,
  goldNet:quarter.goldNet??n.lastQuarter?.goldNet??0};
}
function h2lProjectOptions(w,n){
 const p=kEnsure(n),m=h2lProjectSignals(w,n),rows=[];
 const spendRatio=m.spent/Math.max(1,m.received);
 for(const key of K_PROJECT_KEYS){
  const cost=kCost(key,p.levels[key]+1),initial=K_PROJECTS[key].cost;
  let score=0,reason='';
  if(key==='ap_capacity'){
   score=3+m.blocked*2.5+Math.max(0,spendRatio-1)*2+m.high*2-m.wastedRatio*12-m.low*5;
   reason=m.wastedRatio>.20?'회복 AP 낭비가 많아 상한 확대 효용 낮음':'장기 AP 소비와 행동 제약';
  }else if(key==='ap_recovery'){
   score=4+m.low*13+m.blocked*2+Math.min(7,Math.max(0,spendRatio-1)*6)-m.wastedRatio*20-m.high*5;
   reason=m.low>.35?'반복적인 AP 부족 관측':'기존 AP 회복 대비 실제 소비';
  }else{
   const resourceNeed=m.ironShort*7+m.coalShort*5+m.stoneShort*2;
   const scale=Math.min(5,m.factory*.5+m.siteCount*.6);
   score=m.siteCount?(2+resourceNeed+scale):0;
   if(m.siteCount&&resourceNeed<.8)score-=6;
   reason=m.siteCount?`가동 광업 ${m.siteCount}곳, 원료 부족도 평가`:'가동 광업 시설 없음';
  }
  score-=Math.log2(Math.max(1,cost/initial))*2.8; // diminishing marginal return per level
  const reserve=Math.max(200000,Math.ceil(Math.max(0,n.lastQuarter?.upkeep||0)*8));
  const eligible=!!cost&&Number.isSafeInteger(cost)&&n.gold>=cost*1.5&&n.gold-cost>=reserve&&
   (key!=='mining'||m.siteCount>0);
  rows.push({key,score:Math.round(score*100)/100,cost,eligible,reason});
 }
 return {rows,signals:m};
}
function kAutoChoose(w,n){
 const p=kEnsure(n);if(p.active||!kEligible(w,n.id,'ap_capacity'))return false;
 const result=h2lProjectOptions(w,n),ranked=result.rows.filter(x=>x.eligible).sort((a,b)=>b.score-a.score||K_PROJECT_KEYS.indexOf(a.key)-K_PROJECT_KEYS.indexOf(b.key));
 const best=ranked[0]||null;
 p.lastDecision={dayIndex:w.dayIndex,key:best?.score>=4?best.key:null,score:best?.score??0,
  reason:best?best.score>=4?best.reason:'기대 효용 부족':'자금·가동시설 조건 미달',
  evaluated:result.rows.map(x=>({key:x.key,score:x.score,eligible:x.eligible}))};
 if(!best||best.score<4)return false;
 return kStart(w,n.id,best.key,'AI').ok;
}
function kValid(w,n){
 const p=n.nationalProjects;
 if(!p||p.schema!==1||!p.levels||K_PROJECT_KEYS.some(k=>!Number.isSafeInteger(p.levels[k])||p.levels[k]<0||p.levels[k]>100)||
  !Number.isSafeInteger(p.spent)||p.spent<0||!Number.isSafeInteger(p.lastQuarterPaid)||p.lastQuarterPaid<0||!Number.isSafeInteger(p.lastQuarterDay)||p.lastQuarterDay<0||p.lastQuarterDay>w.dayIndex||
  !['IDLE','STARTED','GOLD_SHORT','PROGRESS','COMPLETED','CANCEL'].includes(p.lastQuarterStatus)||!Array.isArray(p.history)||p.history.length>K_PROJECT_HISTORY_MAX)return false;
 if(p.lastDecision!==null&&p.lastDecision!==undefined){const d=p.lastDecision;
  if(!Number.isSafeInteger(d.dayIndex)||d.dayIndex<0||d.dayIndex>w.dayIndex||!Number.isFinite(d.score)||
    (d.key!==null&&!K_PROJECT_KEYS.includes(d.key))||typeof d.reason!=='string'||d.reason.length>200||
    !Array.isArray(d.evaluated)||d.evaluated.length!==K_PROJECT_KEYS.length||
    d.evaluated.some(x=>!K_PROJECT_KEYS.includes(x.key)||!Number.isFinite(x.score)||typeof x.eligible!=='boolean'))return false;
 }
 if(p.active){const a=p.active,def=K_PROJECTS[a.key];if(!def||!hasTech(w,n.id,K_PROJECT_TECH)||a.level!==p.levels[a.key]+1||a.cost!==kCost(a.key,a.level)||
   !Number.isSafeInteger(a.paid)||a.paid<0||a.paid>a.cost||!Number.isSafeInteger(a.completedDays)||a.completedDays<0||a.completedDays>def.duration||a.completedDays%30!==0||
   !Number.isSafeInteger(a.startedDay)||a.startedDay<0||a.startedDay>w.dayIndex||!['AI','PLAYER'].includes(a.source))return false;}
 if(p.history.some(h=>!K_PROJECTS[h.key]||!['COMPLETE','CANCEL'].includes(h.kind)||!Number.isSafeInteger(h.dayIndex)||h.dayIndex<0||h.dayIndex>w.dayIndex||
  !Number.isSafeInteger(h.level)||h.level<1||h.level>100||h.cost!==kCost(h.key,h.level)||!Number.isSafeInteger(h.paid)||h.paid<0||h.paid>h.cost||h.kind==='COMPLETE'&&h.paid!==h.cost))return false;
 return true;
}
function kProjectsPanel(w,n){
 const state=kEnsure(n),has=hasTech(w,n.id,K_PROJECT_TECH),root=make('section',{class:'overview-section k-projects-panel'},[
 make('h3',{text:'H2L · 국가 프로젝트'}),make('div',{class:'muted-line',text:`국가사업 계획체계 ${has?'연구 완료':'미연구 (산업 물류 합리화 → 국가사업 계획체계 35,000 K)'} · 기술 연구와 독립적으로 진행 · 30일마다 실제 Gold 납부`}),
 make('div',{class:'muted-line',text:`누적 프로젝트 투자 ${number.format(state.spent)} G · 최근 분기 납부 ${number.format(state.lastQuarterPaid)} G · 상태 ${state.lastQuarterStatus}`}),
 make('div',{class:'muted-line',text:`영구 효과: AP 상한 +${state.levels.ap_capacity}.0 · 분기 회복 +${(state.levels.ap_recovery*.2).toFixed(1)} · 광업 산출 +${state.levels.mining*5}%`})]);
 if(state.lastDecision&&n.controller==='AI')root.append(make('div',{class:'muted-line',text:`AI 최근 투자 평가 · ${state.lastDecision.key?K_PROJECTS[state.lastDecision.key].name:'보류'} · ${state.lastDecision.reason} · AP/광업 평가점수 ${state.lastDecision.evaluated.map(e=>K_PROJECTS[e.key].name+' '+e.score.toFixed(1)).join(' / ')}`}));
 if(state.active){const a=state.active,def=K_PROJECTS[a.key];root.append(make('div',{class:'k-active-project'},[
  make('strong',{text:`진행 중: ${def.name} ${a.level}단계`}),
  make('div',{class:'muted-line',text:`${a.completedDays}/${def.duration}일 · 납부 ${number.format(a.paid)}/${number.format(a.cost)} G · 잔여 ${number.format(a.cost-a.paid)} G${state.lastQuarterStatus==='GOLD_SHORT'?' · Gold 부족으로 일시정지':''}`}),
  make('div',{class:'tech-progress'},[make('span',{style:{width:`${100*a.paid/a.cost}%`}})])]));
  if(n.controller==='PLAYER'){const b=make('button',{type:'button',class:'jump-button',text:'진행 사업 취소 (이미 납부한 Gold는 반환되지 않음)'});b.addEventListener('click',()=>{const r=kCancel(w,n.id);showToast(r.ok?'국가 프로젝트 취소':'취소 실패');renderNationOverview();});root.append(b);}
 }
 for(const key of K_PROJECT_KEYS){const def=K_PROJECTS[key],level=state.levels[key]+1,cost=kCost(key,level),term=def.duration/30,install=Math.ceil(cost/term);
  const row=make('div',{class:'nation-action-row'},[make('div',{},[
   make('strong',{text:`${def.name} · ${level}단계`}),
   make('div',{class:'muted-line',text:`${def.description} · ${number.format(cost)} Gold / ${def.duration}일 · 분기 ${number.format(install)} G · 완료 ${level-1}회`})])]);
  if(n.controller==='PLAYER'){const b=make('button',{type:'button',class:'jump-button',text:!has?'기술 잠금':state.active?'진행 중':'착수'});
   b.disabled=!has||!!state.active||n.gold<install;b.addEventListener('click',()=>{const result=kStart(w,n.id,key,'PLAYER');showToast(result.ok?`${def.name} 프로젝트 착수`:result.reason);renderNationOverview();});row.append(b);}
  root.append(row);
 }
 if(state.history.length){root.append(make('h3',{text:'최근 프로젝트 완료·취소 기록'}));for(const h of state.history.slice(-6).reverse())root.append(make('div',{class:'muted-line',text:`${timeAt(h.dayIndex).year}년 · ${K_PROJECTS[h.key].name} ${h.level}단계 · ${h.kind==='COMPLETE'?'완료':'취소'} · 실제 납부 ${number.format(h.paid)} G` }));}
 return root;
}


// --- V0.7I: Industrial Freight Planning V1 ---
// This is a READ-ONLY plan, not shipments. National stocks remain the single
// authoritative account. Never subtract, reserve, or manufacture resources here.
const I_GOODS=Object.freeze(['coal','iron','steel','machine_parts']);
const I_GOOD_NAMES=Object.freeze({coal:'석탄',iron:'철',steel:'강철',machine_parts:'기계부품'});
const I_HISTORY_LIMIT=24;
const I_SOURCE_TYPES=Object.freeze({coal:['coal_pit'],iron:['mine'],steel:['steelworks'],machine_parts:['factory']});
function iEmpty(dayIndex=0,status='LOCKED'){
 return {dayIndex,status,sites:0,suppliers:0,roadTiles:0,roadQuality:0,priority:'NONE',priorityGood:null,
  goods:Object.fromEntries(I_GOODS.map(k=>[k,{demand:0,stock:0,sourceSites:0,reachableSites:0,disconnectedSites:0,capacity:0,planPotential:0,unmet:0,shortStock:0,shortRoute:0,shortCapacity:0}])),
  sitesDetail:[]};
}
function iNew(){return {schema:1,lastQuarter:iEmpty(),history:[]};}
function iEnsure(n){return n.iFreight||(n.iFreight=iNew());}
function iActiveSites(w,n){
 const occupied=new Set((w.occupations||[]).map(o=>o.tileId));
 return w.buildings.filter(b=>{
  const t=w.tiles[b.tileId],s=w.settlements.find(x=>x.id===b.settlementId);
  return t?.ownerId===n.id&&s?.ownerId===n.id&&b.status==='ACTIVE'&&!b.disconnected&&t.occupiedBy===null&&!occupied.has(b.tileId)&&['coal_pit','mine','factory','steelworks','arsenal','steam_pump'].includes(b.typeId);
 }).sort((a,b)=>a.id-b.id);
}
function iDemand(b){
 if(b.typeId==='factory'){
  const a=F2_FACTORY_LEVELS[b.level]||F2_FACTORY_LEVELS[1];
  return {coal:a.coal+(b.powerDevices?.steam?3:0),iron:a.iron,steel:0,machine_parts:0};
 }
 if(b.typeId==='steelworks')return {coal:5,iron:12,steel:0,machine_parts:1}; // maintenance reserve, 1 per 4 runs
 if(b.typeId==='arsenal')return {coal:2,iron:6,steel:3,machine_parts:1};
 if(b.typeId==='steam_pump')return {coal:2,iron:0,steel:0,machine_parts:1};
 return {coal:0,iron:0,steel:0,machine_parts:0};
}
// Road and local facility endpoints may be traversed; intermediate tiles must
// have a road. Own-land-only 4-neighbor connectivity, so enemy land and sea
// never create an artificial domestic route. This is a potential route graph.
function iReachable(w,n,sourceTiles,siteTiles){
 const endpoints=new Set(siteTiles),seen=new Set(),queue=[];
 for(const id of sourceTiles){if(!seen.has(id)){seen.add(id);queue.push(id);}}
 for(let at=0;at<queue.length;at++){
  const id=queue[at];
  for(const nb of neighbors4(id,w.size,w.height)){
   if(seen.has(nb))continue;
   const t=w.tiles[nb];
   if(t?.ownerId!==n.id||!TERRAINS[t.terrain]?.passable||!(t.roadLevel>0||endpoints.has(nb)))continue;
   seen.add(nb);queue.push(nb);
  }
 }
 return seen;
}
function iQuarter(w){
 for(const n of w.nations){
  const ledger=iEnsure(n);if(ledger.lastQuarter.dayIndex===w.dayIndex&&ledger.history.length&&ledger.history.at(-1).dayIndex===w.dayIndex)continue;
  const unlocked=n.active&&hasTech(w,n.id,'industrial_freight_coordination');
  const r=iEmpty(w.dayIndex,unlocked?'PLANNED':'LOCKED');
  if(unlocked){
   const sites=iActiveSites(w,n),tiles=new Set(sites.map(b=>b.tileId));r.sites=sites.length;
   for(const t of w.tiles)if(t.ownerId===n.id&&t.roadLevel>0){r.roadTiles++;r.roadQuality+=t.roadLevel;}
   const suppliers=new Set();
   for(const good of I_GOODS){
    const q=r.goods[good],from=sites.filter(b=>I_SOURCE_TYPES[good].includes(b.typeId));
    q.sourceSites=from.length;for(const b of from)suppliers.add(b.id);
    q.stock=Math.max(0,Math.floor(n.resources[good]||0));
    const reachable=iReachable(w,n,from.map(b=>b.tileId),tiles);
    for(const b of sites){
     const amount=iDemand(b)[good]||0;if(!amount)continue;q.demand+=amount;
     // Same-settlement facilities may share the town's local supply without a road.
     const local=from.some(src=>src.settlementId===b.settlementId),access=local||reachable.has(b.tileId);
     if(access)q.reachableSites++;else q.disconnectedSites++;
     const road=w.tiles[b.tileId]?.roadLevel||w.tiles[w.settlements.find(s=>s.id===b.settlementId)?.coreTileId]?.roadLevel||0;
     const limit=access?Math.max(1,8+road*8):0;
     q.capacity+=limit;
     r.sitesDetail.push({buildingId:b.id,settlementId:b.settlementId,typeId:b.typeId,good,need:amount,reachable:access,capacity:limit});
    }
    // Multiple goods share national stock, but are independently counted.
    // The estimate is deliberately NOT assigned to an individual warehouse.
    const accessible=r.sitesDetail.filter(x=>x.good===good&&x.reachable);
    const reachableDemand=accessible.reduce((a,x)=>a+x.need,0);
    const routedCapacity=accessible.reduce((a,x)=>a+Math.min(x.need,x.capacity),0);
    q.planPotential=Math.min(q.stock,routedCapacity);
    q.unmet=q.demand-q.planPotential;
    q.shortRoute=q.demand-reachableDemand;
    q.shortCapacity=reachableDemand-routedCapacity;
    q.shortStock=Math.max(0,routedCapacity-q.stock);
   }
   r.suppliers=suppliers.size;
   const ranked=I_GOODS.map(g=>({good:g,...r.goods[g]})).sort((a,b)=>b.unmet-a.unmet||I_GOODS.indexOf(a.good)-I_GOODS.indexOf(b.good));
   const top=ranked[0];if(top?.unmet>0){
    r.priorityGood=top.good;
    r.priority=top.shortRoute>0?'CONNECT_ROAD':top.shortCapacity>0?'UPGRADE_ROAD':top.shortStock>0?'INCREASE_SUPPLY':'RECHECK';
   }
   // Small bounded diagnostic history: top 20 site exceptions, not all buildings.
   r.sitesDetail=r.sitesDetail.filter(x=>!x.reachable||x.need>x.capacity).slice(0,20);
  }
  ledger.lastQuarter=r;ledger.history.push(structuredClone(r));if(ledger.history.length>I_HISTORY_LIMIT)ledger.history.shift();
 }
}
function iValid(w,n){
 const v=n.iFreight;
 if(!v||v.schema!==1||!Array.isArray(v.history)||v.history.length>I_HISTORY_LIMIT||!v.lastQuarter)return false;
 const valid=r=>r&&Number.isSafeInteger(r.dayIndex)&&r.dayIndex>=0&&r.dayIndex<=w.dayIndex&&['LOCKED','PLANNED'].includes(r.status)&&['NONE','CONNECT_ROAD','UPGRADE_ROAD','INCREASE_SUPPLY','RECHECK'].includes(r.priority)&&(r.priorityGood===null||I_GOODS.includes(r.priorityGood))&&
  ['sites','suppliers','roadTiles','roadQuality'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0)&&
  Array.isArray(r.sitesDetail)&&r.sitesDetail.length<=20&&r.sitesDetail.every(x=>Number.isSafeInteger(x.buildingId)&&Number.isSafeInteger(x.need)&&x.need>=0&&typeof x.reachable==='boolean')&&
  r.goods&&I_GOODS.every(g=>{const q=r.goods[g];return q&&['demand','stock','sourceSites','reachableSites','disconnectedSites','capacity','planPotential','unmet','shortStock','shortRoute','shortCapacity'].every(k=>Number.isSafeInteger(q[k])&&q[k]>=0)&&q.unmet===q.demand-q.planPotential&&q.planPotential<=q.demand&&q.planPotential<=q.stock&&q.planPotential<=q.capacity;});
 return valid(v.lastQuarter)&&v.history.every(valid)&&v.history.every((r,i)=>i===0||r.dayIndex>v.history[i-1].dayIndex)&&(!v.history.length||JSON.stringify(v.lastQuarter)===JSON.stringify(v.history.at(-1)));
}
function iCsv(w,n){
 const header=['dayIndex','status','good','demand','nationalStock','sources','reachableSites','disconnectedSites','estimatedCapacity','potentialAllocation','unmet','stockShortage','routeShortage','capacityShortage'];
 const rows=[header.join(',')];for(const r of iEnsure(n).history)for(const g of I_GOODS){const q=r.goods[g];rows.push([r.dayIndex,r.status,g,q.demand,q.stock,q.sourceSites,q.reachableSites,q.disconnectedSites,q.capacity,q.planPotential,q.unmet,q.shortStock,q.shortRoute,q.shortCapacity].join(','));}
 return '\ufeff'+rows.join('\n');
}
function iPanel(w,n){
 const st=iEnsure(n),r=st.lastQuarter,has=hasTech(w,n.id,'industrial_freight_coordination');
 const root=make('section',{class:'overview-section'},[
  make('h3',{text:'V0.7I · 예측 물류 (기존 계획 모델)'}),
  make('div',{class:'muted-line',text:has?'산업 수송 관리체계 연구 완료 · 30일마다 추정 수요/운송 계획 기록':'기술 잠금 · 산업 물류 합리화 → 산업 수송 관리체계 (42,000 K, 산업 근대 III)'}),
  make('div',{class:'muted-line',text:'이 패널은 기존 I의 경로 잠재량 예측치이며 실제 운송 실적이 아닙니다. I1의 실물 장부는 아래 전용 패널에서 확인하세요.'})]);
 if(has&&r.status==='PLANNED'){
  root.append(make('div',{class:'muted-line',text:`기준 ${r.dayIndex}일 · 산업 거점 ${r.sites}곳 · 공급 시설 ${r.suppliers}곳 · 도로 ${r.roadTiles}타일 (등급 합 ${r.roadQuality})`}));
  const grid=make('div',{class:'economy-grid'});
  for(const good of I_GOODS){const q=r.goods[good];grid.append(make('div',{class:'economy-item'},[
   make('small',{text:I_GOOD_NAMES[good]}),make('strong',{text:`수요 ${number.format(q.demand)} · 계획상 공급 ${number.format(q.planPotential)}`}),
   make('small',{text:`국가 재고 ${number.format(q.stock)} · 추정 수송 수용량 ${number.format(q.capacity)}`}),
   make('small',{text:`미충족 ${number.format(q.unmet)} · 미연결 시설 ${q.disconnectedSites}개 · 원료부족 ${q.shortStock} · 경로부족 ${q.shortRoute} · 수송능력 부족 ${q.shortCapacity}`})]));}
  root.append(grid);
  const advice={NONE:'현재 계획상 중대 병목 없음',CONNECT_ROAD:'육상 도로 연결 검토',UPGRADE_ROAD:'도로 등급·수송 능력 확장 검토',INCREASE_SUPPLY:'생산·수입·광업 투자 검토',RECHECK:'공급 조건 재점검'};
  root.append(make('div',{class:'muted-line',text:`산업 AI 참고 우선과제 · ${r.priorityGood?I_GOOD_NAMES[r.priorityGood]+' · ':''}${advice[r.priority]} (진단만 수행, 자동 행동 변경 없음)`}));
  if(r.sitesDetail.length){root.append(make('h3',{text:'접근 경로·용량 진단 (최대 20건)'}));for(const d of r.sitesDetail.slice(0,12))root.append(make('div',{class:'muted-line',text:`${d.typeId} #${d.buildingId} / 정착지 #${d.settlementId} · ${I_GOOD_NAMES[d.good]} 필요 ${d.need} · ${d.reachable?'경로 확인':'육상 도로 접근 미확인'}`}));}
 }else root.append(make('div',{class:'muted-line',text:'연구 완료 후 첫 분기부터 기록합니다. 과거의 운송 기록은 소급 생성하지 않습니다.'}));
 const csv=make('button',{class:'jump-button',type:'button',text:'최근 24분기 산업 물류 계획 CSV'});
 csv.addEventListener('click',()=>download(`vilob-i-freight-day${w.dayIndex}-nation${n.id}.csv`,iCsv(w,n),'text/csv;charset=utf-8'));
 const json=make('button',{class:'jump-button',type:'button',text:'산업 물류 진단 JSON'});
 json.addEventListener('click',()=>download(`vilob-i-freight-day${w.dayIndex}-nation${n.id}.json`,JSON.stringify(st,null,2),'application/json'));
 root.append(csv,json);return root;
}

// --- V0.7I1: physically accounted regional industrial freight V1 ---
// The existing nation.resources ledger remains the AUTHORITATIVE total.  Locations
// are a partition of that stock, not a second copy. National non-industrial
// consumers spend unassigned central reserve; where old spending cannot be
// redirected, the explicit legacy draw reconciler debits regional holdings.
const I1_HISTORY_LIMIT=12,I1_TRANSIT_LIMIT=480;
function i1Blank(day=0){return {schema:1,createdDay:day,activated:false,anchor:null,regional:{},transit:[],nextShipment:1,
 lastQuarter:{dayIndex:day,departed:0,delivered:0,held:0,localUsed:0,produced:0,blocked:0,legacyDraw:0,legacyRegionalDraw:0,cargoDiverted:0,confiscated:0,requests:0,reachable:0,disconnected:0,capacityBlocked:0},history:[],recent:[],
 cumulative:{sinceDay:day,departed:0,delivered:0,cargoDiverted:0,legacyRegionalDraw:0}};}
const I1A_UPGRADED=new WeakSet();
function i1Ensure(n,w=null){
 const st=n.i1Freight||(n.i1Freight=i1Blank(w?.dayIndex||0));
 if(I1A_UPGRADED.has(st))return st;
 // For I1 imports, never reconstruct the historic canceled cargo from a 12-quarter log.
 // Cumulation starts on first I1A import; existing quarter snapshots are preserved.
 st.cumulative??={sinceDay:w?.dayIndex??st.createdDay,departed:0,delivered:0,cargoDiverted:0,legacyRegionalDraw:0};
 for(const q of [st.lastQuarter,...(st.history||[])])if(q){q.cargoDiverted??=0;q.legacyRegionalDraw??=0;}
 for(const p of st.transit||[])p.initialAmount??=p.amount;
 I1A_UPGRADED.add(st);return st;
}
function i1Active(w,n){return !!n?.active&&hasTech(w,n.id,'industrial_freight_coordination');}
function i1Anchor(w,n){const cap=w.settlements.find(s=>s.ownerId===n.id&&s.coreTileId===n.capitalId)||w.settlements.find(s=>s.ownerId===n.id);return cap?.id??null;}
function i1Row(st,sid){const key=String(sid);return st.regional[key]||(st.regional[key]=Object.fromEntries(I_GOODS.map(g=>[g,0])));}
function i1Held(st,g){let sum=0;for(const p of st.transit)if(p.good===g)sum+=p.amount;return sum;}
function i1RegionalTotal(st,g){let sum=0;for(const r of Object.values(st.regional))sum+=r[g]||0;return sum;}
function i1Central(n,g){const st=i1Ensure(n);return Math.max(0,(n.resources[g]||0)-i1RegionalTotal(st,g)-i1Held(st,g));}
function i1Log(st,event){st.recent.push(event);if(st.recent.length>30)st.recent.shift();}
function i1aBook(st,key,qty){if(!qty)return;
 st.lastQuarter[key]=(st.lastQuarter[key]||0)+qty;
 if(st.cumulative&&Object.prototype.hasOwnProperty.call(st.cumulative,key))st.cumulative[key]+=qty;
 const last=st.history?.at(-1);
 if(last?.dayIndex===st.lastQuarter.dayIndex)last[key]=st.lastQuarter[key];
}
function i1aSyncPreviousQuarter(st){const last=st.history?.at(-1);
 if(last?.dayIndex===st.lastQuarter.dayIndex)Object.assign(last,st.lastQuarter);
}
function i1Reconcile(w,n){const st=i1Ensure(n,w);for(const g of I_GOODS){
  let excess=i1RegionalTotal(st,g)+i1Held(st,g)-(n.resources[g]||0);
  if(excess<=0)continue;
  // Legacy national spending is still authoritative. Debit local free inventory first.
  for(const sid of Object.keys(st.regional).sort((a,b)=>Number(b)-Number(a))){
   const row=st.regional[sid],take=Math.min(row[g]||0,excess);
   if(take){row[g]-=take;excess-=take;i1aBook(st,'legacyDraw',take);i1aBook(st,'legacyRegionalDraw',take);
    i1Log(st,{dayIndex:w.dayIndex,kind:'LEGACY_REGIONAL_DRAW',settlementId:Number(sid),good:g,amount:take});}
   if(!excess)break;
  }
  // If the national legacy consumer spent stock already shipped, record a *real*
  // cargo cancellation, including shipment ID and original source/destination.
  // Never claim the canceled quantity arrived; the nation total already decreased.
  for(const p of [...st.transit].reverse())if(excess&&p.good===g){
   const take=Math.min(p.amount,excess);if(!take)continue;
   p.amount-=take;excess-=take;i1aBook(st,'legacyDraw',take);i1aBook(st,'cargoDiverted',take);
   i1Log(st,{dayIndex:w.dayIndex,kind:'LEGACY_CARGO_DIVERTED',id:p.id,from:p.from,to:p.to,good:g,amount:take,remaining:p.amount});
  }
  st.transit=st.transit.filter(p=>p.amount>0);
  if(excess)throw Error('I1A 국가-지역 재고 조정 실패 '+n.id+' '+g);
 }}
function i1Activate(w,n){const st=i1Ensure(n,w);if(st.activated||!i1Active(w,n))return;
 st.activated=true;st.anchor=i1Anchor(w,n);
 // One-time allocation: up to two quarterly input batches at existing active
 // industrial facilities, in building-ID order. No resource is produced/moved.
 for(const b of iActiveSites(w,n)){
  if(!['factory','steelworks','arsenal','steam_pump'].includes(b.typeId))continue;
  const row=i1Row(st,b.settlementId),want=iDemand(b);
  for(const g of I_GOODS){const available=i1Central(n,g),alloc=Math.min(available,Math.max(0,(want[g]||0)*2));if(alloc)row[g]+=alloc;}
 }
 i1Log(st,{dayIndex:w.dayIndex,kind:'INITIAL_ALLOCATION',amount:0});
}
function i1Migrate(w){for(const n of w.nations){i1Ensure(n,w);i1Activate(w,n);i1Reconcile(w,n);}}
// V0.7L: remap physical I1 partition at the exact settlement merge boundary.
// All nations are scanned: conquest can leave historical owners with zero-value
// rows (or pending physical holdings) at a site they no longer own.  Those stocks
// must not be discarded when its new owner later merges the settlement.
function i1lLiveReferences(w,context='I1L'){
 const ids=new Set(w.settlements.map(s=>s.id));
 for(const n of w.nations){const st=i1Ensure(n,w);
  for(const sid of Object.keys(st.regional))if(!ids.has(Number(sid)))throw Error(context+': 국가 '+n.id+' 삭제된 정착지 지역장부 #'+sid);
  for(const p of st.transit)if(!ids.has(p.from)||!ids.has(p.to))throw Error(context+': 국가 '+n.id+' 화물 #'+p.id+' 삭제된 정착지 참조');
  if(st.anchor!=null&&!ids.has(st.anchor))throw Error(context+': 국가 '+n.id+' 중앙 비축 거점 #'+st.anchor+' 없음');
 }
}
function i1lPartition(st,n){return Object.fromEntries(I_GOODS.map(g=>[g,[i1RegionalTotal(st,g),i1Held(st,g),n.resources[g]||0]]));}
function i1OnSettlementMerge(w,nationId,primaryId,secondaryId){
 const primary=w.settlements.find(s=>s.id===primaryId),secondary=w.settlements.find(s=>s.id===secondaryId);
 if(!primary||!secondary||primaryId===secondaryId||primary.ownerId!==nationId||secondary.ownerId!==nationId)
  throw Error('I1L 병합 대상/소유자 불일치 '+primaryId+'/'+secondaryId);
 i1lLiveReferences(w,'I1L 병합 전');
 const key=String(secondaryId),toKey=String(primaryId),snapshots=[];
 // Check every allocation before changing a single shipment or regional stock.
 for(const n of w.nations){const st=i1Ensure(n,w),from=st.regional[key],to=st.regional[toKey];
  for(const row of [from,to])if(row&&I_GOODS.some(g=>!Number.isSafeInteger(row[g])||row[g]<0))
   throw Error('I1L 병합 지역 재고 불량: 국가 '+n.id);
  for(const g of I_GOODS)if(!Number.isSafeInteger((from?.[g]||0)+(to?.[g]||0)))
   throw Error('I1L 병합 재고 정수 범위 초과: 국가 '+n.id+' '+g);
  snapshots.push(i1lPartition(st,n));
 }
 // No resource, cumulative counter, delivery day, or RNG draw changes.
 for(const n of w.nations){const st=i1Ensure(n,w),from=st.regional[key];
  if(from){const into=i1Row(st,primaryId);for(const g of I_GOODS)into[g]+=from[g];delete st.regional[key];}
  for(const p of st.transit){if(p.from===secondaryId)p.from=primaryId;if(p.to===secondaryId)p.to=primaryId;}
  if(st.anchor===secondaryId)st.anchor=primaryId;
 }
 return ()=>{ // Invoke after the deleted settlement leaves the world.
  i1lLiveReferences(w,'I1L 병합 후');
  for(let i=0;i<w.nations.length;i++){
   const n=w.nations[i],after=i1lPartition(i1Ensure(n,w),n),before=snapshots[i];
   for(const g of I_GOODS)if(after[g].some((v,j)=>v!==before[g][j]))
    throw Error('I1L 병합 보존식 위반: 국가 '+n.id+' '+g);
  }
 };
}
// Safe, narrowly bounded import repair: absent zero regional rows may be pruned.
// Non-zero stock, cargo, or anchor to an unknown ID is never invented/deleted.
function i1lRepairZeroOrphans(w){
 const ids=new Set((w.settlements||[]).map(s=>s.id)),pruned=[];
 for(const n of w.nations||[]){const st=n.i1Freight;if(!st)continue;
  if(!st.regional||!Array.isArray(st.transit))throw Error('I1L 복구 불가: 국가 '+n.id+' 장부 형식 오류');
  for(const p of st.transit)if(!ids.has(p.from)||!ids.has(p.to))
   throw Error('I1L 안전복구 거부: 국가 '+n.id+' 운송 화물 #'+p.id+'의 출발/도착 정착지가 없음');
  if(st.anchor!=null&&!ids.has(st.anchor))
   throw Error('I1L 안전복구 거부: 국가 '+n.id+' 중앙 비축 거점 #'+st.anchor+' 없음');
  for(const [sid,row] of Object.entries(st.regional)){
   if(ids.has(Number(sid)))continue;
   if(!row||I_GOODS.some(g=>row[g]!==0))
    throw Error('I1L 안전복구 거부: 국가 '+n.id+' 삭제된 정착지 #'+sid+'에 미확인/비영 재고 존재');
   pruned.push({nationId:n.id,settlementId:Number(sid)});
  }
 }
 // Only commit after every nation has been examined and rejected conditions excluded.
 if(pruned.length>256)throw Error('I1L 복구 항목이 256건을 초과함');
 for(const {nationId,settlementId} of pruned)delete w.nations[nationId].i1Freight.regional[String(settlementId)];
 if(pruned.length){
  w.v07lRecovery={schema:1,dayIndex:w.dayIndex,pruned};
 }
 return pruned;
}
function i1ClaimSites(w){
 const changes=[];
 for(const n of w.nations){const st=i1Ensure(n,w);for(const [sid,row] of Object.entries(st.regional)){
  const to=w.settlements.find(s=>s.id===Number(sid))?.ownerId;
  if(to===n.id)continue;
  for(const g of I_GOODS){const qty=row[g]||0;if(!qty)continue;
   const newOwner=w.nations[to];const move=Math.min(qty,n.resources[g]||0);
   if(move&&newOwner){n.resources[g]-=move;newOwner.resources[g]=(newOwner.resources[g]||0)+move;i1Row(i1Ensure(newOwner,w),sid)[g]+=move;f1TrackI1TerritoryQuarter(w,n,newOwner,g,move);f2bTrackI1TerritoryQuarter(w,n,newOwner,g,move);changes.push([n.id,to,sid,g,move]);}
   row[g]-=qty; // if no successor, remaining stock leaves local allocation and becomes central
  }
 }}
 for(const [from,to,sid,g,amount] of changes){i1Ensure(w.nations[from]).lastQuarter.confiscated+=amount;i1Log(i1Ensure(w.nations[to]),{dayIndex:w.dayIndex,kind:'TERRITORY_TRANSFER',from,to,settlementId:+sid,good:g,amount});}
}
function i1Receive(w){for(const n of w.nations){const st=i1Ensure(n,w),remain=[];
 for(const p of st.transit){
  if(p.arriveDay>w.dayIndex){remain.push(p);continue;}
  // While occupied/cut off, the shipment remains physically in transit.
  if(w.settlements.find(s=>s.id===p.to)?.ownerId!==n.id||!i1RoadPath(w,n,p.from,p.to)){
   p.arriveDay=w.dayIndex+30;p.held=(p.held||0)+1;st.lastQuarter.held+=p.amount;remain.push(p);continue;
  }
  i1Row(st,p.to)[p.good]+=p.amount;i1aBook(st,'delivered',p.amount);
  i1Log(st,{dayIndex:w.dayIndex,kind:'DELIVERED',id:p.id,from:p.from,to:p.to,good:p.good,amount:p.amount});
 }
 st.transit=remain;}}
function i1StartQuarter(w){
 // Legacy draws from the prior quarter must be recorded BEFORE opening a new quarter.
 for(const n of w.nations){const st=i1Ensure(n,w);i1Reconcile(w,n);i1aSyncPreviousQuarter(st);
  st.lastQuarter={dayIndex:w.dayIndex,departed:0,delivered:0,held:0,localUsed:0,produced:0,blocked:0,legacyDraw:0,legacyRegionalDraw:0,cargoDiverted:0,confiscated:0,requests:0,reachable:0,disconnected:0,capacityBlocked:0};
 }
 i1Migrate(w);i1ClaimSites(w);
 for(const n of w.nations){const st=i1Ensure(n,w),next=i1Anchor(w,n);
  if(st.activated&&st.anchor!==next){i1Log(st,{dayIndex:w.dayIndex,kind:'CENTRAL_ANCHOR_REASSIGN',from:st.anchor,to:next,amount:0});st.anchor=next;}
  i1Reconcile(w,n);
 }
 i1Receive(w);
}
function i1Available(w,n,sid,g){if(!i1Active(w,n))return n.resources[g]||0;const st=i1Ensure(n,w),local=st.regional[String(sid)]?.[g]||0;return local+(st.anchor===sid?i1Central(n,g):0);}
function i1Can(w,n,b,inputs){if(!i1Active(w,n))return true;i1Reconcile(w,n);for(const [g,amount] of Object.entries(inputs))if(amount>i1Available(w,n,b.settlementId,g)){
 i1Ensure(n,w).lastQuarter.blocked++;return false;
 }return true;}
// Must be called after (not instead of) the original production routine's
// national-resource deduction, preserving the original F1/F2 fiscal ledgers.
function i1Debit(w,n,b,inputs){if(!i1Active(w,n))return;const st=i1Ensure(n,w),row=i1Row(st,b.settlementId);
 for(const [g,amount] of Object.entries(inputs))if(I_GOODS.includes(g)&&amount>0){const local=Math.min(row[g]||0,amount);row[g]-=local;st.lastQuarter.localUsed+=amount;}
}
function i1Credit(w,n,b,g,amount){if(!i1Active(w,n)||!amount||!I_GOODS.includes(g))return;i1Row(i1Ensure(n,w),b.settlementId)[g]+=amount;i1Ensure(n,w).lastQuarter.produced+=amount;}
// One route per source+target in this quarter; town interiors are traversable,
// but all intermediate land must actually have a road. Strict national ownership.
function i1RoadPath(w,n,fromSid,toSid){
 if(fromSid===toSid)return [];
 const from=w.settlements.find(s=>s.id===fromSid&&s.ownerId===n.id),to=w.settlements.find(s=>s.id===toSid&&s.ownerId===n.id);
 if(!from||!to)return null;
 const start=from.coreTileId,goal=to.coreTileId,seen=new Set([start]),queue=[start],parent=new Map();
 for(let at=0;at<queue.length;at++){
  const id=queue[at];if(id===goal)break;
  for(const nb of neighbors4(id,w.size,w.height)){
   const t=w.tiles[nb];if(seen.has(nb)||t?.ownerId!==n.id||!TERRAINS[t.terrain]?.passable||t.occupiedBy!==null)continue;
   const current=w.tiles[id],insideSame=(current.settlementId===t.settlementId)&&
      (current.settlementId===fromSid||current.settlementId===toSid);
   // A roadless core/town interior may be traversed, but a connection
   // crossing from one settlement into another needs roads at BOTH banks.
   if(!insideSame&&!(current.roadLevel>0&&t.roadLevel>0))continue;
   seen.add(nb);parent.set(nb,id);queue.push(nb);
  }
 }
 if(!seen.has(goal))return null;
 const route=[goal];for(let at=goal;at!==start;){at=parent.get(at);route.push(at);}return route.reverse();
}
function i1AnchorPath(w,n,from,to,cache){const key=from+':'+to;if(cache.has(key))return cache.get(key);const path=i1RoadPath(w,n,from,to);cache.set(key,path);return path;}
function i1RouteCapacity(w,path,used){let max=Infinity;for(let k=1;k<path.length;k++){
 const a=path[k-1],b=path[k],key=Math.min(a,b)+'-'+Math.max(a,b);
 const level=Math.max(1,Math.min(Math.max(1,w.tiles[a].roadLevel||0),Math.max(1,w.tiles[b].roadLevel||0)));
 max=Math.min(max,Math.max(0,20+level*20-(used.get(key)||0)));
 }return max;
}
function i1ReserveRoute(path,used,qty){for(let k=1;k<path.length;k++){const a=path[k-1],b=path[k],key=Math.min(a,b)+'-'+Math.max(a,b);used.set(key,(used.get(key)||0)+qty);}}
function i1FreightQuarter(w){for(const n of w.nations){if(!i1Active(w,n))continue;i1Reconcile(w,n);
 const st=i1Ensure(n,w);if(st.anchor==null)st.anchor=i1Anchor(w,n);
 const targets=new Map();
 for(const b of iActiveSites(w,n)){
  if(!['factory','steelworks','arsenal','steam_pump'].includes(b.typeId))continue;
  const row=targets.get(b.settlementId)||Object.fromEntries(I_GOODS.map(g=>[g,0]));const demand=iDemand(b);
  for(const g of I_GOODS)row[g]+=(demand[g]||0)*2;targets.set(b.settlementId,row);
 }
 // V0.8F: order genuine I1 shipments for a future armored production batch.
 for(const site of [v08fSite(w,n.id)].filter(Boolean))if(hasTech(w,n.id,'armored_combat_doctrine')){
   const row=targets.get(site.settlementId)||Object.fromEntries(I_GOODS.map(g=>[g,0]));
   row.iron=Math.max(row.iron,50);row.steel=Math.max(row.steel,8);row.machine_parts=Math.max(row.machine_parts,10);
   targets.set(site.settlementId,row);
 }
 // I3A operating steam power houses demand *physical coal* at their home settlement.
 for(const plant of (w.i3Power?.plants||[]))if(plant.ownerId===n.id&&plant.type==='STEAM'&&plant.hp>0&&
  (plant.status==='ACTIVE'||plant.status==='CONSTRUCTING'&&plant.completeDay<=w.dayIndex+60)){
   const row=targets.get(plant.settlementId)||Object.fromEntries(I_GOODS.map(g=>[g,0]));
   row.coal+=I3A_TYPES.STEAM.coal*2;targets.set(plant.settlementId,row);
 }
 const capacityUsed=new Map(),routes=new Map();
 for(const [sid,want] of [...targets.entries()].sort((a,b)=>a[0]-b[0]))for(const g of I_GOODS){
  let need=Math.max(0,want[g]-i1Available(w,n,sid,g)-st.transit.filter(p=>p.to===sid&&p.good===g).reduce((sum,p)=>sum+p.amount,0));
  if(!need)continue;st.lastQuarter.requests+=need;
  const sources=[...Object.keys(st.regional).map(Number),st.anchor].filter((x,i,a)=>x!=null&&x!==sid&&a.indexOf(x)===i).sort((a,b)=>a-b);
  for(const source of sources){if(need<=0||st.transit.length>=I1_TRANSIT_LIMIT)break;
   const row=st.regional[String(source)],available=(row?.[g]||0)+(source===st.anchor?i1Central(n,g):0);
   if(available<=0)continue;const path=i1AnchorPath(w,n,source,sid,routes);if(!path){st.lastQuarter.disconnected++;continue;}
   st.lastQuarter.reachable++;const capacity=i1RouteCapacity(w,path,capacityUsed);
   if(capacity<=0){st.lastQuarter.capacityBlocked++;continue;}
   const amount=Math.min(need,available,capacity);if(!amount)continue;
   const allocated=Math.min(row?.[g]||0,amount);if(allocated)row[g]-=allocated;
   // Central stock at the real capital is assigned to cargo on departure;
   // national inventory does not change while it changes location.
   const duration=Math.max(30,30*Math.ceil((path.length-1)/12));
   st.transit.push({id:st.nextShipment++,good:g,amount,initialAmount:amount,from:source,to:sid,departDay:w.dayIndex,arriveDay:w.dayIndex+duration});
   i1ReserveRoute(path,capacityUsed,amount);i1aBook(st,'departed',amount);need-=amount;
   i1Log(st,{dayIndex:w.dayIndex,kind:'DEPARTED',from:source,to:sid,good:g,amount,due:w.dayIndex+duration});
  }
 }
 const snap={...st.lastQuarter};st.history.push(snap);if(st.history.length>I1_HISTORY_LIMIT)st.history.shift();
 }}
function i1CloseQuarter(w){for(const n of w.nations){i1Reconcile(w,n);}i1FreightQuarter(w);}
function i1Valid(w){const goodAmount=x=>Number.isSafeInteger(x)&&x>=0;for(const n of w.nations){const s=n.i1Freight;if(!s||s.schema!==1||typeof s.activated!=='boolean'||!Array.isArray(s.transit)||s.transit.length>I1_TRANSIT_LIMIT||!Array.isArray(s.history)||s.history.length>I1_HISTORY_LIMIT||!Array.isArray(s.recent)||s.recent.length>30||!goodAmount(s.nextShipment)||s.nextShipment<1)return false;
  if(s.anchor!=null&&(!Number.isSafeInteger(s.anchor)||!w.settlements.some(x=>x.id===s.anchor))||Object.keys(s.regional).length>w.settlements.length+10)return false;
  for(const [sid,r] of Object.entries(s.regional)){if(!Number.isInteger(Number(sid))||!w.settlements.some(x=>x.id===Number(sid))||I_GOODS.some(g=>!goodAmount(r[g])))return false;}
  for(const p of s.transit)if(!goodAmount(p.amount)||!p.amount||!goodAmount(p.initialAmount)||p.initialAmount<p.amount||!I_GOODS.includes(p.good)||!goodAmount(p.departDay)||!goodAmount(p.arriveDay)||p.departDay>p.arriveDay||p.arriveDay>w.dayIndex+10000||!w.settlements.some(x=>x.id===p.from)||!w.settlements.some(x=>x.id===p.to))return false;
  for(const g of I_GOODS)if(i1RegionalTotal(s,g)+i1Held(s,g)>(n.resources[g]||0))return false;
  if(s.lastQuarter?.dayIndex>w.dayIndex||s.history.some(x=>x.dayIndex>w.dayIndex))return false;
  if(!s.cumulative||!goodAmount(s.cumulative.sinceDay)||s.cumulative.sinceDay>w.dayIndex||
    ['departed','delivered','cargoDiverted','legacyRegionalDraw'].some(k=>!goodAmount(s.cumulative[k]))||
    [s.lastQuarter,...s.history].some(q=>!q||!goodAmount(q.cargoDiverted)||!goodAmount(q.legacyRegionalDraw)||q.cargoDiverted>q.legacyDraw))return false;
 }return true;}
function i1Panel(w,n){const st=i1Ensure(n,w),active=i1Active(w,n),root=make('section',{class:'overview-section'},[
 make('h3',{text:'I1 · 실물 산업 재고 및 국내 수송'}),make('p',{class:'muted-line',text:active?'국가 재고 = 중앙 비축 + 각 정착지 실물 재고 + 수송 중 물자':'산업 수송 관리체계 연구 후 실제 지역 물류 적용. 이전 경제 방식 유지.'})]);
 if(!active)return root;
 const grid=make('div',{class:'economy-grid'});for(const g of I_GOODS){const local=i1RegionalTotal(st,g),moving=i1Held(st,g),central=i1Central(n,g);
  grid.append(make('div',{class:'economy-item'},[make('small',{text:I_GOOD_NAMES[g]}),make('strong',{text:`중앙 ${number.format(central)} · 지역 ${number.format(local)} · 운송 중 ${number.format(moving)}`}),make('small',{text:`국가 합계 ${number.format(n.resources[g]||0)} · 검산 ${number.format(central+local+moving)}`})]));}
 root.append(grid);
 const q=st.lastQuarter;root.append(make('p',{class:'muted-line',text:`최근 분기 · 출발 ${q.departed} · 도착 ${q.delivered} · 산업 투입 ${q.localUsed} · 생산지역 배정 ${q.produced} · 원료 부족 가동 차단 ${q.blocked}회 · 기존 국가 지출 조정 ${q.legacyDraw} (지역 ${q.legacyRegionalDraw} / 화물 취소 ${q.cargoDiverted}) · 경로 단절 ${q.disconnected}`}));
 root.append(make('p',{class:'muted-line',text:`I1A 누적 (기준 ${st.cumulative.sinceDay}일 이후) · 출발 ${st.cumulative.departed} · 도착 ${st.cumulative.delivered} · 기존 지출로 화물 취소 ${st.cumulative.cargoDiverted} · 지역 재고 조정 ${st.cumulative.legacyRegionalDraw} · 이전 기록은 소급하지 않음`}));
 const rows=Object.entries(st.regional).map(([id,stock])=>({id,stock,total:I_GOODS.reduce((a,g)=>a+(stock[g]||0),0)})).filter(x=>x.total).sort((a,b)=>b.total-a.total).slice(0,12);
 if(rows.length){root.append(make('h3',{text:'정착지별 산업 재고 · 상위 12곳'}));for(const r of rows)root.append(make('p',{class:'muted-line',text:`${w.settlements.find(s=>s.id===+r.id)?.name||'#'+r.id} · `+I_GOODS.map(g=>I_GOOD_NAMES[g]+' '+r.stock[g]).join(' / ')}));}
 if(st.transit.length){root.append(make('h3',{text:`실제 운송 중 · ${st.transit.length}건`}));for(const p of st.transit.slice(-12))root.append(make('p',{class:'muted-line',text:`#${p.id} ${I_GOOD_NAMES[p.good]} ${p.amount} · ${p.from} → ${p.to} · 도착 예정 ${p.arriveDay}일`}));}
 for(const [label,ext,mime,body] of [['실물 운송 JSON','json','application/json',()=>JSON.stringify(st,null,2)],['실물 운송 CSV','csv','text/csv;charset=utf-8',()=>i1Csv(w,n)]]){const b=make('button',{class:'jump-button',type:'button',text:label});b.addEventListener('click',()=>download(`vilob-i1-freight-day${w.dayIndex}-nation${n.id}.${ext}`,body(),mime));root.append(b);}
 return root;}
function i1Csv(w,n){const s=i1Ensure(n,w),rows=[['dayIndex','departed','delivered','cargoDiverted','legacyRegionalDraw','held','localUsed','produced','blocked','legacyDraw','requests','disconnected','capacityBlocked']];for(const r of s.history)rows.push(rows[0].map(k=>r[k]||0));return '\ufeff'+rows.map(r=>r.join(',')).join('\n');}

