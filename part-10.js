// --- src/main.js ---

























const $=id=>document.getElementById(id);
const number=new Intl.NumberFormat('ko-KR');
const B4_REASON_LABELS={APPROVED:'공격 후보 승인',INELIGIBLE_OR_PREPARING:'국가 상태·종속 관계·초기 준비',FISCAL_PRESSURE:'군사비·국고 부담',
 MILITARY_NOT_READY:'병력·준비도 부족',NO_LEGAL_BORDER_TARGET:'국경·휴전·진행 중 전쟁 제한',
 COALITION_RISK:'방어 연합군 참전 위험',SAME_FOE_RECENT_DEFEAT:'같은 상대에게 최근 패전',RECENT_DEFEAT:'최근 패전·재건 필요',
 LOW_STRATEGIC_RATIO:'예상 전력 부족',RECOVERY_INCOMPLETE:'패전 후 전력 회복 미완료',
 LOW_STRATEGIC_VALUE:'전쟁 목표의 낮은 기대가치',LOW_WILLINGNESS:'공격 동기 부족',NO_SUITABLE_TARGET:'적절한 공격 대상 없음'};
function b4ReasonLabel(reason){return B4_REASON_LABELS[reason]||reason||'평가 대기';}

function armySupplyLabel(a){
  if(a.supplied)return a.roadSupplied?'정상·도로 연결':'정상';
  const days=a.unsuppliedDays||0;
  const level=days<10?'휴대 보급':days<30?'보급 부족':days<60?'고립':'심각한 고립';
  return `${level} (${days}일)`;
}
const SAVE_KEY='vilob-light-v08f-world';
// Single-file release: embedded editor is opened from a Blob URL, without depending on editor.html.
const embeddedEditorElement=document.getElementById('vilobEmbeddedEditor');
const editorLink=document.querySelector('.custom-map-editor-link');
if(embeddedEditorElement&&editorLink){
  try{const bytes=Uint8Array.from(atob(embeddedEditorElement.textContent),c=>c.charCodeAt(0));
      const editorUrl=URL.createObjectURL(new Blob([bytes],{type:'text/html;charset=utf-8'}));
      editorLink.href=editorUrl;editorLink.title='내장된 맵 에디터 열기 (오프라인 사용 가능)';
      window.addEventListener('pagehide',()=>URL.revokeObjectURL(editorUrl),{once:true});
  }catch(error){console.warn('내장 에디터 초기화 실패:',error);}
}

const LEGACY_SAVE_KEYS=['vilob-light-v08e-world','vilob-light-v08d-world','vilob-light-v08c-world','vilob-light-v08b-world','vilob-light-v07l-world','vilob-light-v07k-world','vilob-light-v07j-world','vilob-light-v07i3a2-world','vilob-light-v07i3a1-world','vilob-light-v07i3a-world','vilob-light-v07i2a-world','vilob-light-v07i2-world','vilob-light-v07i1a-world','vilob-light-v07h2e-world','vilob-light-v07h2d1-world','vilob-light-v07h2d-world','vilob-light-v07h2c-world','vilob-light-v07h2b1-world','vilob-light-v07f2b3-world','vilob-light-v07f2b2-world','vilob-light-v07f2b1-world','vilob-light-v07f2b-world','vilob-light-v07f2a5-world','vilob-light-v07f2a4-world','vilob-light-v07f2a3a-world','vilob-light-v07f2a3-world','vilob-light-v07f2a2-world','vilob-light-v07f1c2-world','vilob-light-v07f1c1-world','vilob-light-v07f1b-world','vilob-light-v07f1a-world','vilob-light-v07e3e-world','vilob-light-v07e3d-world','vilob-light-v07e3c-world','vilob-light-v07e3b-world','vilob-light-v07c-world','vilob-light-v07b-world','vilob-light-v07a1b1-world','vilob-light-v07a1b-world','vilob-light-v07a1a-world','vilob-light-v07a1-world','vilob-light-v07a-world','vilob-light-v06f4d3-world','vilob-light-v06f4d2-world','vilob-light-v06f4d1-world','vilob-light-v06f4c-world','vilob-light-v06f4b1-world','vilob-light-v06f4b-world','vilob-light-v06f4a-world','vilob-light-v06f3-world','vilob-light-v06f2-world','vilob-light-v06f1-world','vilob-light-v06e7c-world','vilob-light-v06e7b-world','vilob-light-v06e7a1-world','vilob-light-v06e7a-world','vilob-light-v06e6-world','vilob-light-v06e5-world','vilob-light-v06e4-world','vilob-light-v06e3a-world','vilob-light-v06e3h1-world','vilob-light-v06e2b-world']; // read-only fallback
const PROFILE_KEY='vilob-light-v03a-profiles';
const editorState=createAIEditorState();
let persistentProfiles=Object.create(null);
function persistProfiles(){try{localStorage.setItem(PROFILE_KEY,JSON.stringify(persistentProfiles));return true;}catch{showToast('세계에는 반영됐지만 브라우저 라이브러리는 저장되지 않았습니다. JSON 내보내기를 이용하세요.');return false;}}
try{const stored=localStorage.getItem(PROFILE_KEY);if(stored)persistentProfiles=validateCustomLibrary(JSON.parse(stored));}catch(error){console.warn('AI 프로필 라이브러리 읽기 실패:',error.message);}
for(const id of ['gameVersionLabel','atlasVersionLabel','footerVersionLabel']){const el=document.getElementById(id);if(el)el.textContent=VERSION;}document.title=`VILOB Light · ${VERSION}`;
const app={world:null,running:false,speed:1,selectedId:null,selectedNationId:0,selectedBattleId:null,comparisonMetric:'population',comparisonSort:'desc',v04cStatsGroup:'population',v04cNationFilter:'all',v04cEraMetric:'countries',v04cValueMode:'absolute',v04cStatsCache:null,activeTab:'map',h1bMilitaryPage:'regular',h1bAutoScope:'world',i0AutoTab:'overview',i0OpenBlocks:{},i0AutoArmyId:null,i0AutoArmyQuery:'',h1bAutoArmyFilter:'all',h1bAutoArmyPage:0,h1bAssembleAmount:8,h2aSelectedBlueprint:'light_infantry_support_i',h2gSelectedRevision:2,h2gDraft:null,h2gEditingId:null,h2gPartsSlot:'chassis',h2gPartsModule:'reinforced_frame_i',h2gPartsAmount:1,h2cTypeFilter:'all',nationSubtab:'overview',warHistoryPage:1,chroniclePage:1,chronicleKind:'all',chronicleNation:'all',frame:0,lastFrame:null,accumulator:0,toastTimer:0,simMeter:createSimMeter(),autoSpeed:createAutoSpeedState(),autoUiDirty:false,autoLastUiAt:0,lastNationPanelId:null,lastNationPanelSubtab:null};
const map=new MapRenderer($('worldCanvas'),{
  onSelect:id=>selectTile(id),
  onHover:id=>{$('coordinateLabel').textContent=id===null?'X — · Y —':`X ${id%app.world.size} · Y ${Math.floor(id/app.world.size)}`;}
});
function make(tag,props={},children=[]){
  const el=document.createElement(tag);
  for(const [key,value] of Object.entries(props)){
    if(key==='class')el.className=value;
    else if(key==='text')el.textContent=value;
    else if(key==='style')Object.assign(el.style,value);
    else el.setAttribute(key,value);
  }
  for(const child of children)el.append(child);
  return el;
}
function showToast(message){
  const el=$('toast');el.textContent=message;el.classList.add('visible');
  clearTimeout(app.toastTimer);app.toastTimer=setTimeout(()=>el.classList.remove('visible'),3000);
}
function updateTime(){
  const {year,quarter,day}=timeAt(app.world.dayIndex);
  $('timeLabel').textContent=`${number.format(year)}년 · ${quarter}분기 · ${day}일`;
}
function updateStats(){
  const s=worldSummary(app.world);
  const values=[['총인구',s.population],['정착지',s.settlements],['군대 / 전쟁',`${s.armies} / ${s.wars}`],['소유 타일',s.owned]];
  $('atlasStatItems').replaceChildren(...values.map(([label,v])=>make('div',{class:'stat'},[make('span',{text:label}),make('b',{text:typeof v==='number'?number.format(v):v})])));
  $('seedBadge').textContent=`SEED · ${app.world.seed}`;
  $('mapDimensionLabel').textContent=`${app.world.size} × ${app.world.height} WORLD`;
  $('nationRosterTitle').textContent=`${app.world.nations.length}개 국가`;
  $('nationRosterTotal').textContent=`${app.world.nations.filter(n=>n.active).length} / ${app.world.nations.length}`;
  $('worldSizeSelect').value=`${app.world.size}x${app.world.height}`;
}
function selectTile(id){
  if(id===null||!app.world.tiles[id])return;
  app.selectedId=id;if(app.world.tiles[id].ownerId!==null)app.selectedNationId=app.world.tiles[id].ownerId;
  map.setSelected(id);renderInspector();renderNationList();renderNationOverview();renderPlayerPanel();renderV04CStats();
}
const lineCount=(a,position)=>deployedManpower(a,position);
function renderInspector(){
  const t=app.world.tiles[app.selectedId],box=$('tileInspector');if(!t)return;
  const nation=t.ownerId===null?null:app.world.nations[t.ownerId];
  const settlement=t.settlementId===null?null:app.world.settlements.find(s=>s.id===t.settlementId);
  const terra=TERRAINS[t.terrain],occupation=occupationAt(app.world,t.id);
  $('tileCoord').textContent=`${t.x}, ${t.y}`;
  const banner=make('div',{class:'tile-banner'},[
    make('div',{},[make('div',{class:'terrain-title',text:terra.label}),make('div',{class:'terrain-subtitle',text:`타일 #${String(t.id).padStart(3,'0')} · ${terra.passable?'육지':'수역'}`})]),
    make('div',{class:'terrain-glyph',text:terra.symbol,style:{background:terra.color}})
  ]);
  const cell=(label,value)=>make('div',{class:'detail-item'},[make('small',{text:label}),make('strong',{text:value})]);
  const rows=[cell('도로',roadLevel(t)===2?'개량 도로':roadLevel(t)===1?'기본 도로':'없음'),cell('소속 국가',nation?nation.name:'중립'),cell('문명 시대',nation?civilizationLabel(nation):'—'),cell('지형',terra.label),cell('하천',(()=>{const r=riverAdjacentTileInfo(app.world,t.id);return r.riverbank?`강변 · ${['','소하천','중하천','대하천'][r.maxFlow]} (${r.count}구간)`:'없음';})()),cell('정착지',settlement?settlementDisplayName(app.world,settlement):'없음'),cell('타일 유형',settlement?(t.id===settlement.coreTileId?'정착지 중심':'정착지 구성 타일'):'일반 타일')];
  if(t.occupiedBy!==null)rows.push(cell('전시 점령국',app.world.nations[t.occupiedBy].name));
  const localArmies=app.world.armies.filter(a=>a.tileId===t.id);
  if(localArmies.length)rows.push(cell('주둔 군대',localArmies.map(a=>`${app.world.nations[a.nationId].name} ${a.id+1}군 ${manpower(a)}명 · 기초 전투력 ${getArmyBasePower(app.world,a)}`).join(' · ')));
  if(settlement){
    rows.push(cell('최초 설립국',app.world.nations[settlement.founderNationId]?.name||'기록 없음'));
    if(settlement.formerCapitalOf.length)rows.push(cell('수도 연혁',capitalHistoryLabel(app.world,settlement)+(isCurrentCapital(app.world,settlement)?' · 현재 수도':' · 현재는 고도')));
    rows.push(cell('정착지 인구 / 주거',`${number.format(settlement.population)} / ${number.format(settlementHousing(app.world,settlement))}명`),cell('발전 · 단계',settlement.development+' / 100 · '+settlement.level+'단계'));
    const c=d2CultureSummary(settlement.culturePopulation),main=app.world.cultures.find(x=>x.id===c.dominant);
    rows.push(cell('주요 주민 문화',main?`${main.name} · ${d2Percent(c.dominantCount,c.population)}`:'주민 없음'),cell('문화 혼합도',c.mix.toFixed(1)+'% · '+c.groups+'개 문화'));}
  if(terra.passable) {const stats=regionalMilitaryStats(app.world,t.id);rows.push(cell('지역 저항력 R',number.format(stats.resistance)),cell('지역 공격력 A',number.format(stats.firepower)));}
  box.replaceChildren(banner,make('div',{class:'detail-grid'},rows));
  if(settlement){box.append(d2MakeCultureDetails(app.world,settlement.culturePopulation,'정착지 문화별 민간 인구 (타일 전체의 인구 아님)'));box.append(d1bInspectorPanel(app.world,settlement));box.append(d2aInspectorPanel(app.world,settlement));box.append(d2bInspectorPanel(app.world,settlement));}
  const tileBuildings=app.world.buildings.filter(b=>b.tileId===t.id);
  if(tileBuildings.length)box.append(make('section',{class:'facility-mini'},[
    make('strong',{text:`일반 시설 ${tileBuildings.length} / ${t.ownerId===null?BUILDING_TILE_SLOTS:generalTileSlotLimit(app.world,t.ownerId)}`}),
    ...tileBuildings.map(b=>make('div',{class:'muted-line',text:`${BUILDINGS[b.typeId]?.symbol||'▣'} ${BUILDINGS[b.typeId]?.label||b.typeId} ${b.level}단계${b.industrialSlot?' · 산업 전용 부지':''}${b.typeId==='coal_pit'&&t.coalSeam?' · 고품위 탄층 '+number.format(t.coalSeam.remaining)+'/'+number.format(t.coalSeam.initial)+' · 채굴 효율 '+(f2b1CoalYieldPermille(t.coalSeam)/10).toFixed(1)+'% · 참고 소진 '+(f2b3SeamForecastYears(t.coalSeam,tileBuildings.filter(x=>x.typeId==='coal_pit'&&x.status==='ACTIVE'&&!x.disconnected).length*(t.terrain==='rock'||t.terrain==='mountain'?F2B2_COAL_BASE_HARD:F2B2_COAL_BASE_OTHER))??'—')+'년':''} · ${b.hp===0?'파손·수리 필요':b.disconnected?'정착지 미연결·비활성':b.status==='ACTIVE'?'가동':`${b.status==='UPGRADING'?'개량':b.status==='REDEVELOPING'?`${BUILDINGS[b.redevelopTo]?.label||'시설'} 전환`:'건설'} 중 (${Math.max(0,b.completeDay-app.world.dayIndex)}일)`}`}))
  ]));
  const tileDefenses=app.world.defenses.filter(b=>b.tileId===t.id);
  if(tileDefenses.length)box.append(make('section',{class:'facility-mini defensive-mini'},[
    make('strong',{text:`♜ 방어시설 ${tileDefenses.length} / ${DEFENSE_TILE_SLOTS}`}),
    ...tileDefenses.map(b=>make('div',{class:'muted-line',text:`요새 ${b.level}단계 · 저항력 +${b.hp>0?g2LevelValue('fortDefense',b.level):0} · 공격력 +${b.hp>0?g2LevelValue('fortFirepower',b.level):0} · ${b.hp===0?'파손·수리 필요':b.disconnected?'정착지 미연결·비활성':b.status==='ACTIVE'?'가동':`${b.status==='UPGRADING'?'개량':b.status==='REDEVELOPING'?`${BUILDINGS[b.redevelopTo]?.label||'시설'} 전환`:'건설'} 중 (${Math.max(0,b.completeDay-app.world.dayIndex)}일)`}`}))
  ]));
  i3aAppendInspector(box,app.world,t.id);
  if(tileDefenses.length){const stats=regionalMilitaryStats(app.world,t.id),mean=fortressWorldAverages(app.world);box.append(make('div',{class:'inspector-note',text:`세계 요새 지역 평균 R ${mean.resistance.toFixed(1)} · A ${mean.firepower.toFixed(1)} / 상대 표시 R ${(fortressThickness(stats.resistance,mean.resistance)*100).toFixed(0)}% · A ${(fortressThickness(stats.firepower,mean.firepower)*100).toFixed(0)}%`}));}
  if(occupation){
    const occupier=app.world.nations[occupation.nationId];
    const active=occupyingForces(app.world,occupation).filter(a=>manpower(a)>0);
    const card=make('section',{class:'occupation-card'},[
      make('strong',{text:`⚑ ${occupier.name} · 점령 진행 ${occupation.progress.toFixed(1)}%`}),
      make('div',{class:'occupation-track'},[make('span',{style:{width:`${occupation.progress.toFixed(1)}%`,background:occupier.color}})]),
      make('small',{text:`저항력 R ${occupation.resistance} · 공격력 A ${occupation.firepower} · 누적 지역 공격 피해 ${occupation.casualties}명 · 연합 점령군 ${active.reduce((sum,a)=>sum+manpower(a),0)}명 · 유효 공성 ${occupation.siegeCreditDays}/5일 · ${occupation.siegeEligible?`다음 판정 ${Math.max(0,occupation.nextTickDay-app.world.dayIndex)}일 후`:`교전·방해 중`}`})
    ]);box.append(card);
  }
  if(localArmies.length){const details=localArmies.map(a=>{const cmd=app.world.characters.find(c=>c.id===a.commanderId);return make('div',{class:'army-detail'},[make('strong',{text:`⚔ ${app.world.nations[a.nationId].name} 제${a.id+1}군 · ${manpower(a)}명 · 전투력 ${getArmyBasePower(app.world,a)} · ${b4aRankLabel(a)} ${a.formationExperience?.xp||0}XP`}),make('span',{text:`사령관 ${cmd?.name||'없음'} · 사기 ${Math.round(a.morale)} · 군대 장비 ${v07cArmyVisual([a]).era} · 대표 병종 ${(UNIT_TYPES[v07cArmyVisual([a]).type]?.label||(v07cArmyVisual([a]).type==='assault_tank'?'돌격전차':'혼성군'))} · ${a.status==='SAILING'?`항해 중 · 상륙 ${Math.max(0,a.seaTransit?.arrivalDay-app.world.dayIndex||0)}일 후`:a.status==='ENGAGED'?'교전 중':a.status==='RETREATING'?'후퇴 중':a.status==='REGROUP'?'재편 중':a.status==='TRAPPED'?'포위됨':a.order?'진군 중':'대기 중'} · 보급 ${armySupplyLabel(a)} · 편제 숙련 ${b4aRankLabel(a)} ${a.formationExperience?.xp||0}XP (+${(b4aPowerBonus(a)*100).toFixed(1)}%)`}),make('small',{text:`전열 인간 ${lineCount(a,'front')}명/기계 ${hPositionQty(app.world,a,'front')}대 · 후열 인간 ${lineCount(a,'rear')}명/기계 ${hPositionQty(app.world,a,'rear')}대 · 후방 ${lineCount(a,'back')}명 · 예비 ${lineCount(a,'reserve')}명 · 정규 전투 준비 ${c3ArmyReady(a)}명 / 전문훈련 ${c3ArmyPending(a)}명`})]);
    const groupRoles=new Map(Object.entries(a.deployment).flatMap(([role,ids])=>ids.map(id=>[id,({front:'전열',rear:'후열',back:'후방',reserve:'예비'})[role]||role])));
    const grouping=a.units.filter(u=>u.manpower>0).map(u=>`${UNIT_TYPES[u.typeId]?.label||u.typeId} (${groupRoles.get(u.id)||'미배치'}) ${u.manpower}명 / 정규 ${c3ReadyMen(u)}명 · 전문훈련 ${c3PendingMen(u)}명 (${u.training??100}%) / ${WEAPONS[u.weaponId]?.label||u.weaponId} / ${ARMORS[u.armorId]?.label||u.armorId}`).join(' · ');
details[details.length-1].append(make('small',{text:grouping}));
    });box.append(make('div',{class:'army-list'},details));}
  if(nation){
    const label=make('div',{class:'nation-pill'},[make('span',{class:'nation-dot',style:{background:nation.color}}),make('span',{text:`${nation.name} · ${nation.personality}`})]);
    const leader=app.world.characters.find(c=>c.id===nation.leaderId);
    const population=app.world.settlements.filter(s=>s.ownerId===nation.id).reduce((a,s)=>a+s.population,0);
    const cohesion=getTerritoryMetrics(app.world,nation.id);
    const cap=settlementCapacity(app.world,nation.id,cohesion);
    const econ=projectedQuarter(app.world,nation);
    const roads=roadConnections(app.world,nation.id);
    const partners=app.world.nations.filter(other=>other.active&&other.id!==nation.id).map(other=>({other,route:tradeRoute(app.world,nation.id,other.id)})).filter(v=>v.route);
    box.append(make('div',{class:'inspector-note'},[label,
      make('div',{text:`${nation.description} · ${nation.controller} · 인구 ${number.format(population)}명`}),
      make('div',{text:`지도자 ${leader?.name||'없음'} (${leader?.age||'?'}세) · 행정 ${leader?.administration||'?'} / 확장 ${leader?.ambition||'?'}`}),
      make('div',{class:'economy-grid'},[
        ['Gold',`${number.format(nation.gold)} G`,`분기 세수 +${econ.goldIncome} / 군 유지 -${econ.upkeep} / 민간 운영 -${econ.civil.total}`],
        ['AP',`${apDisplay(nation.apUnits)} / ${apDisplay(nation.apMaxUnits)}`,`분기 회복 +${apDisplay(econ.apRecovery)}`],
        ['Knowledge',`${number.format(nation.knowledge)} K`,`분기 생산 +${econ.knowledgeIncome} · 연구 발전 ${nation.researchLevel}/100`],
        ['식량',number.format(nation.resources.food),`분기 +${econ.produced.food} / -${econ.foodConsumed}`],
        ['목재',number.format(nation.resources.wood),`분기 +${econ.produced.wood}`],
        ['석재',number.format(nation.resources.stone),`분기 +${econ.produced.stone}`],
        ['철',number.format(nation.resources.iron),`분기 +${econ.produced.iron}`]
      ].map(([key,value,sub])=>make('div',{class:'economy-item'},[make('small',{text:key}),make('strong',{text:value}),make('small',{text:sub})]))),
      make('div',{text:`국제 교역: ${partners.length?partners.map(v=>`${v.other.name} (분기 수송 ${v.route.capacity})`).join(' · '):'현재 연결된 교역 상대 없음'}`}),
      make('div',{text:`정착지 편제 ${nation.settlementIds.length}/${cap.limit}개 · 기술 정착 밀도 +${Math.round(cap.bonus*100)}% · 정착지 크기 ${settlementFootprintCapacity(app.world,nation.id).maxTiles}타일 / 반경 ${settlementFootprintCapacity(app.world,nation.id).maxRadius}`}),
      make('div',{text:`도로 ${roads.roadTiles}타일(개선 ${roads.upgradedTiles}) · 정착지 연결 ${roads.connected}쌍 · 연결망 ${roads.networks.filter(v=>v.cores.length>=2).length}개 · 행정 효율 ${(cohesion.efficiency*100).toFixed(1)}% · 국경 부담 ${(cohesion.borderPenalty*100).toFixed(1)}% · 거리 부담 ${(cohesion.distancePenalty*100).toFixed(1)}% · 식량 충족 ${(nation.foodPressure*100).toFixed(0)}%`})]));
  }else{
    const frontier=app.world.nations.map(n=>({nation:n,claim:getClaimCost(app.world,n.id,t.id)})).filter(v=>v.claim);
    const extra=frontier.length?' 개척 비용: '+frontier.map(v=>`${v.nation.name} ${v.claim.cost}`).join(' · '):'';
    box.append(make('div',{class:'inspector-note',text:t.terrain==='water'?'수역은 개척할 수 없습니다.':'현재 어느 국가에도 속하지 않은 중립 타일입니다.'+extra}));
  }
  const player=app.world.nations.find(v=>v.controller==='PLAYER'&&v.active);
  if(player){
    const shortcut=make('button',{class:'jump-button',type:'button',text:`⚑ ${player.name}의 명령 선택 · 이 타일 이용`});
    shortcut.addEventListener('click',()=>{app.selectedNationId=player.id;setActiveTab('nation');renderNationList();renderNationOverview();renderPlayerPanel();});
    box.append(make('section',{class:'inspector-note'},[shortcut,make('small',{class:'muted-line',text:'선택한 타일을 대상으로 개척·건설·이동 명령을 지정할 수 있습니다.'})]));
  }
}
function renderNationList(){
  const els=app.world.nations.map(n=>{
    const owned=app.world.tiles.filter(t=>t.ownerId===n.id).length;
    const selected=app.selectedNationId===n.id;
    const letter=n.name.slice(0,1);
    const population=app.world.settlements.filter(s=>s.ownerId===n.id).reduce((sum,s)=>sum+s.population,0);
    const soldiers=app.world.armies.filter(a=>a.nationId===n.id).reduce((sum,a)=>sum+manpower(a),0);
    const row=make('button',{class:'nation-row'+(selected?' active':''),type:'button',title:`${n.name} 수도 선택`},[
      make('span',{class:'nation-badge',text:letter,style:{background:n.color}}),
      make('span',{class:'nation-text'},[make('strong',{text:n.name}),make('small',{text:n.active?n.personality:'멸망'})]),
      make('span',{class:'nation-count',text:`${n.controller==='PLAYER'?'🎮 · ':''}${owned} ▣ · ⚔ ${soldiers} · ${apDisplay(n.apUnits)}AP`})
    ]);
    row.addEventListener('click',()=>{app.selectedNationId=n.id;renderNationList();renderNationOverview();renderPlayerPanel();renderV04CStats();});
    return row;
  });
  $('nationList').replaceChildren(...els);
}
function renderPlayerPanel(){
  const box=$('playerControlPanel');if(!box||!app.world)return;
  mountPlayerControls(box,{world:app.world,nationId:app.selectedNationId,selectedTileId:app.selectedId,
    onSwitch:togglePlayerNation,onAction:issuePlayerAction,onPickTile:()=>setActiveTab('map')});
}
function togglePlayerNation(nationId){
  const world=app.world,target=world.nations[nationId];if(!target?.active)return;
  const old=world.nations.find(n=>n.controller==='PLAYER');
  if(old?.id===nationId){target.controller='AI';e2aOnControllerChange(world,target,'AI');showToast(`${target.name}: AI 조종으로 복귀했습니다.`);}
  else{
    if(old){old.controller='AI';e2aOnControllerChange(world,old,'AI');}target.controller='PLAYER';e2aOnControllerChange(world,target,'PLAYER');
    if(target.constructionProcurement)target.constructionProcurement.plan=null;
    // AI's pending offensives must not continue to masquerade as player orders.
    for(const a of world.armies.filter(a=>a.nationId===nationId&&a.status==='READY'&&a.engagementId===null)){
      a.order=null;a.operation=null;a.needsOrders=false;
    }
    showToast(`${target.name}: 직접 조종 시작 · 자동 국가 명령 중단`);
  }
  world.setupLocked=true;world.changeSeq++;c1RefreshWorldControls();refreshPlayerUI();
}
function issuePlayerAction(nationId,action){
  const n=app.world.nations[nationId];if(!n?.active||n.controller!=='PLAYER')return {ok:false,reason:'직접 조종 중인 국가가 아닙니다.'};
  if((action.type==='DECLARE_WAR'||action.type==='BETRAY_ALLIANCE')&&!window.confirm(`${app.world.nations[action.targetNationId]?.name||'대상국'}에 ${action.type==='BETRAY_ALLIANCE'?'동맹을 배신하고 ':''}선전포고할까요?`))return {ok:false,reason:'선전포고가 취소되었습니다.'};
  const result=executeNationAction(app.world,nationId,action);
  showToast(result.ok?`${n.name}: ${action.type} 명령을 실행했습니다.`:`명령 실패: ${result.reason||'조건을 확인하세요.'}`);
  if(result.ok){c1RefreshWorldControls();map.draw();updateStats();renderChronicle();renderInspector();refreshPlayerUI();renderWorldTrade();}
  return result;
}
function refreshPlayerUI(){renderNationList();renderNationOverview();renderPlayerPanel();renderWarfare();renderMilitaryRoster();renderWarHistory();renderComparisons();e3e2RenderStatsDemography();}

const C5_BACKING_REASONS={TRUST_NOT_READY:'지원 계약 신뢰 부족 (일반 관계 +15 또는 성숙 접촉 필요)',ILLEGAL:'전쟁·휴전·종주 관계 등 지원 불가',PROMISE_LIMIT:'지원 약속 상한',MILITARY_RISK:'지원국 군사력·승산 부족',PRESSURE_LOW:'독립 압력 부족',RELATION_OR_INTEREST:'관계·전략적 이해관계 부족',LOW_EXPECTED_GAIN:'지원 비용이 기대 이익보다 큼',STRATEGIC_SUPPORT:'지원 조건 충족'};
function c5BackingReason(reason){return C5_BACKING_REASONS[reason]||reason||'관측 대기';}
/** C5A: one source of truth for the two diplomacy panels. No duplicate AI decision model. */
function c5aSigningBlockExplanation(w,subjectId,sponsorId){
 const t=v06bSubjectOf(w,subjectId),supporter=w.nations[sponsorId];
 if(!t||!supporter?.active)return '유효한 종속국·지원국 상태가 아님';
 if(v06bSubjectOf(w,sponsorId))return '지원 후보도 다른 나라의 종속국';
 if(sponsorId===t.overlordId||v06bBetween(w,sponsorId,subjectId))return '지원 불가능한 종주 관계';
 if(warAgainst(w,sponsorId,t.overlordId))return '지원 후보와 종주국이 이미 전쟁 중';
 if(warAgainst(w,sponsorId,subjectId))return '지원 후보와 종속국이 전쟁 중';
 if(allianceBetween(w,sponsorId,t.overlordId))return '지원 후보가 종주국과 동맹 관계';
 if((supporter.truces?.[t.overlordId]||0)>w.dayIndex)return '지원 후보와 종주국의 휴전 기간';
 return '지원 계약의 정치·법적 조건 미충족';
}
function c5aSupportExplanation(w,subjectId,situation=null){
 const info=situation||c5IndependenceSituation(w,subjectId),o=info?.outreach;
 if(!info)return '종속 관계 없음';
 if(info.pledged.length){
  const names=info.pledged.map(p=>w.nations[p.supporterId]?.name||'?').join('·');
  return `독립지원 약속 체결 · ${names} · 실제 참전은 전쟁·휴전·동맹 등 법적 조건에 따라 결정`;
 }
 if(!o)return '독립 외교 접촉 대기 · 압력 65 이상·독립 요구 2회 거절 후 시작';
 if(o.targetId===null)return `지원 후보 없음 · ${Math.max(0,Math.ceil((o.nextAttemptDay-w.dayIndex)/DAYS_PER_YEAR))}년 뒤 재검토`;
 const name=w.nations[o.targetId]?.name||'알 수 없음';
 const decision=c4BackingAssessment(w,o.targetId,subjectId);
 const mature=c5aMatureContact(w,subjectId,o.targetId);
 const stage=decision.approve?'지원 심사 통과·계약 미체결':
  mature?'접촉 성숙·전략/합법성 심사':o.progress>=4?'접촉 5단계 달성·실제 지원 조건 미충족':'외교 접촉 진행 중';
 const reason=decision.reason==='ILLEGAL'?c5aSigningBlockExplanation(w,subjectId,o.targetId):c5BackingReason(decision.reason);
 return `${name} · 접촉 ${o.progress}/5 · ${stage} · ${reason} · ${Math.max(0,Math.ceil((o.nextAttemptDay-w.dayIndex)/DAYS_PER_YEAR))}년 뒤 접촉 가능`;
}
function renderC5IndependenceDashboard(){
 const target=$('c5IndependenceDashboard');if(!target||!app.world)return;
 const w=app.world,ts=(w.diplomacy.subjectTreaties||[]).filter(t=>w.nations[t.subjectId]?.active);
 const d=w.diplomacy.independenceStats;
 target.replaceChildren(make('h3',{text:`독립 위기 · 종속국 ${ts.length}개`}),
  make('div',{class:'muted-line',text:`외교 접촉 ${d.outreachAttempts||0}회 · 시작 ${d.outreachStarted||0}건 · 진행 ${d.outreachProgress||0}회 · 후보 없음 ${d.outreachBlocked||0}회 · 접촉 비용 ${number.format(d.outreachGoldSpent||0)}G · 지원 약속 ${d.pledgesAccepted+d.backingAccepted}건`}));
 if(!ts.length){target.append(make('div',{class:'muted-line',text:'현재 활성 종속 관계가 없습니다.'}));return;}
 for(const t of [...ts].sort((a,b)=>b.independencePressure-a.independencePressure||a.subjectId-b.subjectId).slice(0,8)){
  const s=c5IndependenceSituation(w,t.subjectId),o=s.outreach,partner=o?.targetId!==null&&o?.targetId!==undefined?w.nations[o.targetId]?.name:null;
  const txt=`${w.nations[t.subjectId].name} → ${w.nations[t.overlordId].name} · 독립 압력 ${t.independencePressure.toFixed(1)}/100 · ${s.blockers.join('·')||'봉기 요건 검토 가능'}`;
  const detail=c5aSupportExplanation(w,t.subjectId,s);
  const card=make('div',{class:'c5-diplomacy-entry'},[make('strong',{text:txt}),make('div',{class:'c5-pressure-track'},[make('div',{class:'c5-pressure-fill',style:{width:`${Math.min(100,t.independencePressure)}%`,background:t.independencePressure>=80?'#e68a7b':'#c6a56d'}})]),make('small',{text:detail})]);
  target.append(card);
 }
}
function renderWarAudit(){
  const target=$('warAuditSummary');if(!target||!app.world)return;
  const w=app.world,r=warAuditReport(w),s=r.current;
  renderC5IndependenceDashboard();
  const fields=[['종전 기록 / 진행 중',`${s.warEndsRecorded} / ${s.wars}건`],
    ['진행 중 다자전쟁 / 동맹',`${s.coalitionWars} / ${s.alliances}건`],
    ['C2 복수 전쟁 참가국',`${w.nations.filter(n=>n.active&&warsOfNation(w,n.id).length>=2).length}개국`],
    ['C2 진행 중 독립전쟁',`${w.wars.filter(v=>v.kind==='INDEPENDENCE').length}건`],
    ['C2 독립 요구 / 승인 / 거절',`${w.diplomacy.independenceStats.demands} / ${w.diplomacy.independenceStats.accepted} / ${w.diplomacy.independenceStats.rejected}`],
    ['종전 평균 기간',`${(s.avgWarDays/DAYS_PER_YEAR).toFixed(1)}년 (${s.avgWarDays}일)`],
    ['명확·결정적 승리 / 백지 평화',`${s.clearPeace+s.decisivePeace} / ${s.whitePeace}건`],
    ['비백지 종전 중 영토 0',`${s.zeroCessionNonWhite}건`],
    ['양도 영토 / 배상금',`${number.format(s.totalCededTiles)}타일 / ${number.format(s.totalReparations)}G`],
    ['군 유지비 발생 / 작전비',`${number.format(s.upkeepRecorded)} / ${number.format(s.operationRecorded)}G`],
    ['그중 지원국 유지비',`${number.format(s.supportUpkeepRecorded)}G`],
    ['군사비 장부 불일치',`${s.financeMismatch}건${s.financeMismatch?' · 기존 세이브의 과거 비용 기록도 포함':''}`]];
  target.replaceChildren(...fields.map(([label,value])=>make('div',{class:'economy-item'},[make('small',{text:label}),make('strong',{text:value})])));
  const warTarget=$('b4WarDiagnostics');
  if(warTarget){
    const d=w.warDecisionDiagnostics;
    const reasons=Object.entries(d?.blockReasons||{}).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    const recent=(d?.history||[]).slice(-8).reverse();
    const rows=d?[
      ['관측 시작',`${timeAt(d.sinceDay).year}년 ${timeAt(d.sinceDay).quarter}분기`],
      ['AI 전쟁 평가 / 후보 평가',`${number.format(d.evaluations)} / ${number.format(d.targetEvaluations)}`],
      ['후보 승인 / 보류',`${number.format(d.candidateApproved)} / ${number.format(d.candidateBlocked)}`],
      ['실제 선전포고 / 실패',`${number.format(d.declared)} / ${number.format(d.declarationFailed)}`],
      ['전쟁 후보 보류 이유',reasons.slice(0,12).map(([k,v])=>`${b4ReasonLabel(k)} (${k}): ${number.format(v)}`).join(' · ')||'없음'],
      ['최근 평가',recent.map(h=>`${timeAt(h.dayIndex).year}년 ${w.nations[h.nationId]?.name} → ${h.targetNationId===null?'대상 없음':w.nations[h.targetNationId]?.name} / ${b4ReasonLabel(h.reason)}${h.strategicRatio!==null?` (${h.strategicRatio} / 최소 ${h.threshold})`:''}${h.declared?' · 선전포고':''}${h.defensiveAllies.length?' · 방어측 예상 지원 '+h.defensiveAllies.map(e=>w.nations[e.id]?.name).join(','):''}`).join(' / ')||'없음']
    ]:[['관측 없음','다음 분기부터 기록됩니다.']];
    warTarget.replaceChildren(...rows.map(([label,value])=>make('div',{class:'economy-item'},[make('small',{text:label}),make('strong',{text:value})])));
  }
  const subjectTarget=$('subjectB1Diagnostics');
  if(subjectTarget){
    const d=w.diplomacy.subjectDiagnostics,fmt=map=>Object.entries(map||{}).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([key,value])=>`${key} ${number.format(value)}`).join(' · ')||'없음';
    const fields=d?[
      ['계측 시작일',`${timeAt(d.sinceDay).year}년 ${timeAt(d.sinceDay).quarter}분기`],
      ['자발 평가 / 적격 / 제안',`${number.format(d.voluntary.evaluations)} / ${number.format(d.voluntary.eligible)} / ${number.format(d.voluntary.offered)}`],
      ['C4 독립 공동전선 제안 / 수락',`${w.diplomacy.independenceStats.frontsProposed} / ${w.diplomacy.independenceStats.frontsAccepted}`],
      ['C4 종속국 지원 요청 / 성립',`${w.diplomacy.independenceStats.pledgesRequested} / ${w.diplomacy.independenceStats.pledgesAccepted}`],
      ['C4 독립국 선제 지원 제안 / 수락 / 거절',`${w.diplomacy.independenceStats.backingProposed} / ${w.diplomacy.independenceStats.backingAccepted} / ${w.diplomacy.independenceStats.backingRejected}`],
      ['C4 연합 독립전쟁 / 외국 지원 독립전쟁',`${w.diplomacy.independenceStats.jointWars} / ${w.diplomacy.independenceStats.externallySupportedWars}`],
      ['C4 실전 보호 / 종속국 방어 패배',`${w.diplomacy.independenceStats.protectionFought} / ${w.diplomacy.independenceStats.protectionDefeats}`],
      ['B3 자발 AI 전략 판단 / 선택 / 독립 선호',`${d.voluntary.choiceEvaluations} / ${d.voluntary.choiceApproved} / ${d.voluntary.choiceDeclined}`],
      ['B3 자발 AI 거절 사유',fmt(d.voluntary.choiceReasons)],
      ['B3 종주국 평가 / 수락 / 거절',`${d.voluntary.suzerainEvaluations} / ${d.voluntary.suzerainApproved} / ${d.voluntary.suzerainDeclined}`],
      ['B3 종주국 거절 사유',fmt(d.voluntary.suzerainReasons)],
      ['B3 국가 규모 제한',`생존 ${w.nations.filter(n=>n.active).length}개국 · 인구·영토 각각 ${(Math.min(V06B3_MAX_SHARE,V06B3_AVERAGE_MULTIPLIER/Math.max(1,w.nations.filter(n=>n.active).length))*100).toFixed(2)}% 미만`],
      ['자발 수락 / 거절 / 만료 / 재검증 무효',`${d.voluntary.accepted} / ${d.voluntary.rejected} / ${d.voluntary.expired} / ${d.voluntary.invalidated}`],
      ['동기 (위협 / 전략 / 중복)',`${d.voluntary.motives.THREAT} / ${d.voluntary.motives.STRATEGIC} / ${d.voluntary.motives.BOTH}`],
      ['자발 최초 탈락 사유',fmt(d.voluntary.reasonsFirst)],
      ['자발 전체 탈락 사유',fmt(d.voluntary.reasonsAll)],
      ['강제 평가 / 적격 / 요구',`${d.forced.evaluations} / ${d.forced.eligible} / ${d.forced.offered}`],
      ['강제 성립 / 거절 / 무효',`${d.forced.accepted} / ${d.forced.rejected} / ${d.forced.invalidated}`],
      ['강제 최초 탈락 사유',fmt(d.forced.reasonsFirst)],
      ['강제 전체 탈락 사유',fmt(d.forced.reasonsAll)],
      ['조약 성립 / 50년 재평가 유지 / 해제',`${d.treaty.formed} / ${d.treaty.renewed} / ${d.treaty.ended}`],
      ['종료 사유',fmt(d.treaty.endReasons)],
      ['조공 청구 / 수령 / 미지급',`${number.format(d.tribute.due)} / ${number.format(d.tribute.paid)} / ${number.format(d.tribute.unpaid)} G`]
    ]:[['계측 시작 전','다음 분기부터 기록됩니다.']];
    subjectTarget.replaceChildren(...fields.map(([label,value])=>make('div',{class:'economy-item'},[make('small',{text:label}),make('strong',{text:value})])));
  }
  $('warAuditYearCount').textContent=`${r.years.length}개 연도`;
}
function renderWarfare(){
  renderWarAudit();
  const w=app.world
  const target=$('militaryEconomySummary');
  if(target){
    const n=w.nations[app.selectedNationId]||w.nations[0],men=w.armies.filter(a=>a.nationId===n.id).reduce((sum,a)=>sum+manpower(a),0),econ=projectedQuarter(w,n);
    const content=[['기준 국가',n.name],['C2 참여 중인 전쟁',warsOfNation(w,n.id).map(v=>`#${v.id} ${v.kind==='INDEPENDENCE'?'독립전쟁':'영토전쟁'} ${warSide(v,n.id)==='attackers'?'공격':'방어'} · 배정 ${number.format(w.armies.filter(a=>a.assignedWarId===v.id&&a.nationId===n.id).reduce((s,a)=>s+manpower(a),0))}명`).join(' / ')||'없음'],['현역 / 목표 병력',`${number.format(men)} / ${number.format(militaryStrengthTarget(w,n.id))}명`],['병영 동원 상한',`${number.format(militaryCapacity(w,n.id))}명 · 가동 ${v04eBarracksEffects(w,n.id).paid}/${v04eBarracksEffects(w,n.id).built}채`],['병영 시설 현황',`${v04e1BarracksInventory(w,n.id).built}채 보유 · 건설 중 ${v04e1BarracksInventory(w,n.id).constructing}채 · 전환 예약 ${v04e1BarracksInventory(w,n.id).pending}채 · 한도 초과 ${v04e1BarracksInventory(w,n.id).overLimit}채 · 단절 ${v04e1BarracksInventory(w,n.id).detached}채`],['분기 예비병 훈련 상한',`${number.format(trainingRate(w,n.id))}명`],['군사 투자 성향',`${w.aiProfiles[n.aiProfileId]?.military?.militaryInvestment??50} / 100`],['병영 운영비 납부',`${number.format(n.military.barracksFinance.paidLastQuarter)} / ${number.format(n.military.barracksFinance.billedLastQuarter)} G · 미납 ${number.format(n.military.barracksFinance.unpaidLastQuarter)} G`],['동원 가능 / 훈련 중',`${n.military.reserveReady} / ${pendingManpower(n)}명`],['군대 편제',`${w.armies.filter(a=>a.nationId===n.id).length} / ${armyLimit(w,n.id)}개 · 여유 ${Math.max(0,armyLimit(w,n.id)-w.armies.filter(a=>a.nationId===n.id).length)}개`],['B4A 국가 생존',`${n.survival?.state||'NORMAL'} · ${n.survival?.reason||'BASELINE'} · 공격 보류 ${n.survival?.warBlocked||0}회 · 비상 소집 ${n.survival?.emergencySuccess||0}회`],['편제 수용량 / 목표',`${number.format(armyLimit(w,n.id)*150)} / ${number.format(militaryStrengthTarget(w,n.id))}명`],['분기 군 유지비·체납',`${number.format(econ.upkeep)} Gold`],['분기 예상 Gold 수지',`${number.format(econ.goldIncome-econ.upkeep-econ.civil.total)} Gold`],['민간 운영비',`${number.format(econ.civil.total)} G · 미납 ${number.format(n.civilFinance?.unpaidLastQuarter||0)} G`],['분기 작전비 청구 / 실지급',`${number.format(n.military.operationBilledLastQuarter||0)} / ${number.format(n.military.operationPaidLastQuarter||0)} G`],['미지급 군사비',`${number.format(n.military.operationArrears||0)} Gold`],['급여 미지급 / 최근 탈영',`${n.military.unpaidQuarters}분기 / ${n.military.desertedLastQuarter}명`]];
    target.replaceChildren(...content.map(([label,value])=>make('div',{class:'economy-item'},[make('small',{text:label}),make('strong',{text:value})])));
    const count=w.armies.filter(a=>a.nationId===n.id).length,limit=armyLimit(w,n.id),targetMen=militaryStrengthTarget(w,n.id);
    const fill=(ratio)=>make('div',{class:'military-meter-fill',style:{width:`${Math.max(0,Math.min(100,ratio*100)).toFixed(1)}%`}});
    const bar=(title,description,ratio)=>make('div',{class:'military-meter-row'},[
      make('div',{class:'military-meter-description'},[make('span',{text:title}),make('strong',{text:description})]),
      make('div',{class:'military-meter-track','role':'progressbar','aria-label':title,'aria-valuemin':'0','aria-valuemax':'100','aria-valuenow':String(Math.round(Math.max(0,Math.min(100,ratio*100))))},[fill(ratio)])
    ]);
    target.append(make('section',{class:'military-capacity-meter'},[
      bar('부대 편제 활용률',`${count} / ${limit}개`,limit?count/limit:0),
      bar('목표 현역 충원률',`${number.format(men)} / ${number.format(targetMen)}명`,targetMen?men/targetMen:0)
    ]));
  }
  const diagTarget=$('militaryMobilizationDiagnostics');
  if(diagTarget){const n=w.nations[app.selectedNationId]||w.nations[0],d=n.military.mobilizationDiagnostics.at(-1);
    const recent=n.military.mobilizationDiagnostics;
    const summary=d?[['최근 평가일',`${Math.floor(d.dayIndex/120)+1}년 ${Math.floor((d.dayIndex%120)/30)+1}분기`],['대표 판정',d.reason],['현역 / 목표 / 부족',`${d.men} / ${d.target} / ${d.deficit}명`],['훈련완료 / 훈련중',`${d.ready} / ${d.pending}명`],['안전 거점 / 부대 편제',`${d.safeSettlements}곳 / ${d.armyCount}/${d.armyLimit}개`],['정원 미달 부대 / 복귀 후보',`${d.understrengthFormations||0} / ${d.recoveryEligible||0}개`],['복귀 명령 / 진행 중 / 경로 실패',`${d.recoveryOrders||0} / ${d.recoveryInProgress||0} / ${d.recoveryNoRoute||0}개`],['실제 시도 / 성공 / 실패',`${Object.values(d.attempts).reduce((a,b)=>a+b,0)} / ${Object.values(d.success).reduce((a,b)=>a+b,0)} / ${Object.values(d.failed).reduce((a,b)=>a+b,0)}회`],['거절 원인별 횟수',Object.entries(d.failReasons).map(([k,v])=>`${k} ${v}`).join(' · ')||'실패 없음'],['병영 AI 후보 진단',(()=>{const b=n.military.barracksAiDiagnostics.at(-1);return b?`${b.reason} · 후보 ${b.generated} / 적법 ${b.legal} / 실행가능 ${b.affordable}`:'계측 시작 전';})()]]:[['진단 시작 전', '이전 저장의 과거 행동은 추정하지 않습니다. 다음 분기부터 기록됩니다.']];
    if(d?.h2d1Fiscal){const f=d.h2d1Fiscal;
      summary.push(['H2D1 재정 감군 판정',`${f.outcome} · 안전한 해산 후보 ${f.safeCandidates}개`]);
      summary.push(['H2D1 감군 / 반환',`${f.armyId===null?'해산 없음':`군대 #${f.armyId}`} · ${f.returnedMen}명 · 기체 ${f.returnedMachines}대`]);
      summary.push(['H2D1 예상 다음 분기 유지비 절감',`${f.estimatedSaving} Gold · 현재 병력 ${f.afterMen}/${f.target}명`]);
    }
    diagTarget.replaceChildren(...summary.map(([label,value])=>make('div',{class:'economy-item'},[make('small',{text:label}),make('strong',{text:value})])));
    const failures=recent.filter(r=>r.deficit>0&&r.reason!=='TARGET_MET').length;
    diagTarget.append(make('div',{class:'scope-note',text:`보존 ${recent.length}/${V04E2_DIAG_WINDOW}분기 · 목표 미달 평가 ${failures}분기 · 군사 AI 행동만 계측` }));
  }
  const allies=$('allianceList');
  if(allies){const treaties=w.diplomacy.alliances.map(a=>make('div',{class:'war-row'},[
       make('strong',{text:`${w.nations[a.a].name} ↔ ${w.nations[a.b].name}`}),
       make('small',{text:`상호 방위 · 종료까지 ${Math.max(0,Math.ceil((a.endsDay-w.dayIndex)/DAYS_PER_YEAR))}년`})]));
    const calls=w.diplomacy.calls.filter(c=>c.status==='PENDING'&&c.expiresDay>w.dayIndex).map(c=>make('div',{class:'war-row'},[
       make('strong',{text:`${w.nations[c.principalId??c.defenderId].name} → ${w.nations[c.allyId].name} ${c.side==='attackers'?'공격':'방어'} 지원 요청`}),
       make('small',{text:`전쟁 #${c.warId} · ${(c.expiresDay-w.dayIndex)}일 후 만료`})]));
    allies.replaceChildren(...(treaties.length||calls.length?[...treaties,...calls]:[make('div',{class:'war-empty',text:'체결된 동맹과 진행 중인 지원 요청이 없습니다.'})]));
    $('allianceCount').textContent=`${treaties.length}건`;
  }
  const body=$('warList'),occupationBody=$('occupationList'),engagementBody=$('engagementList');
  const panels=w.wars.map(war=>{
    const a=w.nations[war.attackerId],b=w.nations[war.defenderId];
    return make('div',{class:'war-row'},[make('strong',{text:`${(war.sides?.attackers||[a.id]).map(id=>w.nations[id].name).join(' + ')} ⚔ ${(war.sides?.defenders||[b.id]).map(id=>w.nations[id].name).join(' + ')}`}),
      make('small',{text:`전쟁 ${Math.floor((w.dayIndex-war.startedDay)/120)+1}년차 · ${war.goal?.type==='SETTLEMENT'?'정착지 확보':'국경 확보'} · 교전 ${war.battleCount}회 · 공격국 기준 승점 차 ${warBalance(w,war)>=0?'+':''}${warBalance(w,war).toFixed(2)}점 · 목표 ${goalProgress(w,war)>0?'달성':'진행 중'}`}),
      make('small',{text:`수도 점령 승점 ${warCapitalAdvantage(w,war)>=0?'+':''}${warCapitalAdvantage(w,war).toFixed(1)} · ${war.peaceExtension&&war.peaceExtension.untilDay>w.dayIndex?`우세국 추가 작전 ${war.peaceExtension.untilDay-w.dayIndex}일 남음 (${war.peaceExtension.usedDays}/360일 사용)`: '추가 작전 없음'}`}),
      make('small',{text:`전쟁 피로: ${a.name} ${(war.fatigue?.[a.id]||0).toFixed(1)} / ${b.name} ${(war.fatigue?.[b.id]||0).toFixed(1)} · ${war.pendingPeace?`${w.nations[war.pendingPeace.proposerId].name} 평화 제안 대기`:'협상 제안 없음'}`}),
      make('small',{text:'C6 전선 배정: '+warMembers(war).map(id=>{
        const assigned=w.armies.filter(a=>a.nationId===id&&a.assignedWarId===war.id),
          men=assigned.reduce((sum,a)=>sum+manpower(a),0),
          blocked=assigned.filter(a=>a.g2aOrderStatus==='NO_REACHABLE_TARGET'||a.c6FrontDecision?.reason==='NO_ACCESSIBLE_WAR').length;
        return `${w.nations[id].name} ${assigned.length}개 편제·${number.format(men)}명${blocked?` (접근·목표 제한 ${blocked}개)`:''}`;
      }).join(' / ')})]);
  });
  const occupations=[];
  for(const o of w.occupations.slice(0,15)){
    const t=w.tiles[o.tileId],n=w.nations[o.nationId];
    const card=make('div',{class:'war-row occupation-row'},[
      make('strong',{text:`⚑ ${n.name} · (${t.x}, ${t.y}) 점령 중 ${o.progress}%`}),
      make('div',{class:'occupation-track'},[make('span',{style:{width:`${o.progress}%`,background:n.color}})]),
      make('small',{text:`저항력 R ${o.resistance} · 공격력 A ${o.firepower} · 지역 공격 피해 ${o.casualties}명 · 유효 공성 ${o.siegeCreditDays}/5일 · ${o.siegeEligible?`다음 판정 ${Math.max(0,o.nextTickDay-w.dayIndex)}일 후`:`교전·방해 중`}`})
    ]);
    const jump=make('button',{class:'jump-button',text:'▦ 지도에서 보기',type:'button'});jump.addEventListener('click',()=>goToMap(o.tileId));card.append(jump);occupations.push(card);
  }
  const engagements=[];
  const active=w.engagements.slice(0,8);
  for(const e of active){
    const a=w.armies.find(v=>v.id===e.attackerArmyId),b=w.armies.find(v=>v.id===e.defenderArmyId);
    const selected=app.selectedBattleId===e.id;
    const attackLive=(e.attackers||[{armyId:e.attackerArmyId}]).map(m=>h1Army(w,m.armyId)).filter(Boolean);
    const defenseLive=(e.defenders||[{armyId:e.defenderArmyId}]).map(m=>h1Army(w,m.armyId)).filter(Boolean);
    const card=make('button',{type:'button',class:'war-row battle-choice'+(selected?' selected-battle':''),
      'aria-expanded':String(selected)},[
      make('strong',{text:`⚔ 교전 #${e.id+1} · ${e.round}라운드`}),
      make('small',{text:`공격 ${attackLive.length}개 편제 · ${attackLive.reduce((n,x)=>n+manpower(x),0)}명 / 방어 ${defenseLive.length}개 편제 · ${defenseLive.reduce((n,x)=>n+manpower(x),0)}명`}),
      make('small',{text:`${e.history.length?'최근 피해 '+e.history.at(-1).lossA+' / '+e.history.at(-1).lossB+'명':'첫 라운드 대기'} · 눌러서 상세보기`})
    ]);
    card.addEventListener('click',()=>{
      app.selectedBattleId=selected?null:e.id;
      selectTile(e.tileId);renderWarfare();
    });
    engagements.push(card);
  }
  const selected=w.engagements.find(e=>e.id===app.selectedBattleId);
  const recent=w.battleHistory.at(-1);
  const report=selected||recent;
  if(report){
    const live=Boolean(selected),a=w.armies.find(v=>v.id===report.attackerArmyId),b=w.armies.find(v=>v.id===report.defenderArmyId);
    const card=make('div',{class:'battle-report'},[
      make('div',{class:'report-head'},[
        make('strong',{text:live?`교전 #${report.id+1} · 상세 현황`:`최근 교전 #${report.id+1} · 결과`}),
        make('small',{text:live?`다음 라운드 ${Math.max(0,report.nextRoundDay-w.dayIndex)}일 후`:`${report.rounds}라운드 · ${w.nations[report.winnerNationId]?.name||'미상'} 승리`})
      ])
    ]);
    if(live){
      const pair=make('div',{class:'combat-pair'});
      for(const side of ['attackers','defenders']){
        const column=make('div',{class:'combat-side'});
        const members=report[side]||[{armyId:side==='attackers'?report.attackerArmyId:report.defenderArmyId}];
        column.append(make('strong',{text:`${side==='attackers'?'공격':'방어'} · ${members.length}개 편제`}));
        for(const m of members){const army=h1Army(w,m.armyId);if(!army)continue;
          const n=w.nations[army.nationId];
          column.append(make('small',{text:`${n.name} #${army.id+1}: ${manpower(army)}명 · 국가 ${civilizationLabel(n)} / 장비 ${v07cArmyVisual([army]).era} · 대표 ${(UNIT_TYPES[v07cArmyVisual([army]).type]?.label||(v07cArmyVisual([army]).type==='assault_tank'?'돌격전차':'혼성군'))} · 편제 숙련 ${b4aRankLabel(army)} · 사기 ${Math.round(army.morale)} · 전열 인간 ${lineCount(army,'front')}명/기계 ${hPositionQty(w,army,'front')}대 · 후열 인간 ${lineCount(army,'rear')}명/기계 ${hPositionQty(w,army,'rear')}대 · 후방 ${lineCount(army,'back')} / 예비 ${lineCount(army,'reserve')}`}));
          column.append(make('div',{class:'combat-morale-track'},[make('span',{style:{width:`${army.morale}%`,background:n.color}})]));
        }
        pair.append(column);
      }
      card.append(pair);
    }
    const history=report.history.slice(-3).reverse();
    for(const r of history){
      const row=make('div',{class:'combat-round'},[make('strong',{text:`라운드 ${r.round} · 손실 ${r.lossA}/${r.lossB}명 · 사기 ${r.moraleA}/${r.moraleB}`})]);
      for(const phase of r.phases){
        row.append(make('small',{text:`${({OPENING:'개시 사격',CONTACT:'접촉전',MELEE:'근접전',SUSTAINED:'지속 사격'})[phase.phase]||phase.phase}: 인간 피해 ${phase.aLost}/${phase.bLost}${phase.aMachineHits!==undefined?` · 오토마톤 피격 ${phase.aMachineHits}/${phase.bMachineHits}`:''} · 인간 전열 ${phase.aFront}/${phase.bFront}${phase.aMachineFront!==undefined?` · 기계 전열 ${phase.aMachineFront}/${phase.bMachineFront} · 기계 후열 ${phase.aMachineRear}/${phase.bMachineRear}`:''} · 예비 ${phase.aReserve}/${phase.bReserve}${phase.deployedA!==undefined?` · 실제 투입 ${phase.deployedA}/${phase.deployedB}`:''}`}));
        if(phase.perArmyLosses&&Object.keys(phase.perArmyLosses).length)row.append(make('small',{text:`편제별 손실: ${Object.entries(phase.perArmyLosses).map(([id,loss])=>`#${Number(id)+1} ${loss}명`).join(' · ')}`}));
        const events=[];
        if(phase.reinforcementA)events.push(`공격군 예비 ${phase.reinforcementA}명 투입`);
        if(phase.reinforcementB)events.push(`방어군 예비 ${phase.reinforcementB}명 투입`);
        if(phase.collapseA)events.push('공격군 전열 붕괴');
        if(phase.collapseB)events.push('방어군 전열 붕괴');
        if(events.length)row.append(make('small',{class:'combat-event',text:events.join(' · ')}));
      }
      card.append(row);
    }
    if(!live&&report.pursuit){const p=report.pursuit;card.append(make('small',{class:'combat-event',text:p.losses?`패주·추격 피해 ${p.losses}명 (실제 교전 우세 ${p.advantage}배, 적용률 ${(p.rate*100).toFixed(1)}%)`:p.reason==='TRAPPED_SURRENDER'?'퇴로 차단: 패주 피해 대신 포로 처리':`추격 추가 피해 없음 (전투력 우세 ${p.advantage||0}배)`}));}
    if(!history.length)card.append(make('small',{text:'첫 교전 라운드를 준비하고 있습니다.'}));
    if(report.tileId!==undefined){const jump=make('button',{class:'jump-button',text:'▦ 전투 지역 지도에서 보기',type:'button'});jump.addEventListener('click',()=>goToMap(report.tileId));card.append(jump);}
    engagements.push(card);
  }
  engagementBody.replaceChildren(...(engagements.length?engagements:[make('div',{class:'war-empty',text:'현재 진행 중인 교전이 없습니다.'})]));
  $('engagementCount').textContent=w.engagements.length+'건';
  body.replaceChildren(...(panels.length?panels:[make('div',{class:'war-empty',text:'현재 진행 중인 전쟁이 없습니다.'})]));
  $('warCount').textContent=`${w.wars.length}전쟁`;
  if(occupationBody){
    const preservedScroll=occupationBody.scrollTop;
    occupationBody.replaceChildren(...(occupations.length?occupations:[make('div',{class:'war-empty',text:'현재 점령 중인 타일이 없습니다.'})]));
    occupationBody.scrollTop=preservedScroll;
    $('occupationCount').textContent=`${w.occupations.length}건`+(w.occupations.length>15?' · 상위 15건':'');
  }
}

// UI aggregation reads current World only; no historic timeseries or simulation ticks.
let navigation=null;
function setActiveTab(tab){navigation?.activate(tab);}
function goToMap(tileId){
  if(tileId===null||!app.world.tiles[tileId]){setActiveTab('map');return;}
  selectTile(tileId);setActiveTab('map');
  requestAnimationFrame(()=>{map.resize();map.centerOn(tileId);});
}
/** G2: only selected nation's armies. Never render a global roster in Military tab. */
function makeNationMilitaryPanel(w,n){
  const sorted=w.armies.filter(a=>a.nationId===n.id).sort((a,b)=>a.id-b.id);
  const total=sorted.reduce((sum,a)=>sum+manpower(a),0),prepared=sorted.reduce((sum,a)=>sum+c3ArmyReady(a),0),trainees=total-prepared;
  const machines=sorted.reduce((sum,a)=>{const x=h1b1ArmyMachineStats(w,a);sum.total+=x.total;sum.ready+=x.ready;sum.damaged+=x.damaged;sum.disabled+=x.disabled;sum.powered+=x.powered;return sum;},{total:0,ready:0,damaged:0,disabled:0,powered:0});
  const box=make('section',{class:'overview-section g2-nation-military'},[
    make('h3',{text:`군사 현황 · 군대 ${sorted.length}개 / 인간 ${number.format(total)}명 · 오토마톤 ${number.format(machines.total)}대`}),
    make('div',{class:'muted-line',text:`인간 현역 ${number.format(total)}명 · 전문훈련 완료 ${number.format(prepared)}명 / 진행 중 ${number.format(trainees)}명 · 전문훈련 수용량 ${c3TrainingCapacity(w,n.id)}명 · 누적 훈련비 ${number.format(n.military.specialistTrainingSpent||0)} Gold · 편제 XP는 별도 유지`}),
    make('div',{class:'h1b1-machine-summary',text:`오토마톤 현역 ${number.format(machines.total)}대 · 정상 ${number.format(machines.ready)}대 (동력 공급 ${number.format(machines.powered)}대) · 손상 ${number.format(machines.damaged)}대 · 기능 정지 ${number.format(machines.disabled)}대 · 창고 ${number.format(n.hAutomaton?.stored||0)}대 (별도)`})
  ]);
  const activeWars=warsOfNation(w,n.id);
  const front=make('div',{class:'military-list'});
  if(activeWars.length){
    front.append(make('strong',{text:'C6 · 전쟁별 배정 현황'}));
    for(const war of activeWars){
      const assigned=sorted.filter(a=>a.assignedWarId===war.id),men=assigned.reduce((v,a)=>v+manpower(a),0),auto=assigned.reduce((v,a)=>v+hCount(w,a,true),0);
      const stuck=assigned.filter(a=>a.g2aOrderStatus==='NO_REACHABLE_TARGET'||a.c6FrontDecision?.reason==='NO_ACCESSIBLE_WAR').length;
      front.append(make('div',{class:'army-detail'},[
        make('strong',{text:`전쟁 #${war.id+1} · ${war.kind==='INDEPENDENCE'?'독립전쟁':'영토전쟁'} · ${warSide(war,n.id)==='attackers'?'공격':'방어'}`}),
        make('small',{text:`배정 ${assigned.length}개 편제 / 인간 ${number.format(men)}명 · 오토마톤 ${number.format(auto)}대 · 경로·목표 제약 ${stuck}개 편제`})
      ]));
    }
  }
  const history=w.c6ArmyHistory?.entries.filter(r=>r.nationId===n.id).slice(-10).reverse()||[];
  const labels={BATTLE_LOSS:'전투로 소멸',FIELD_LOSS:'작전 중 소멸·원인 미확정',SURRENDER:'항복',DISBAND:'평시 해산',DESERTION:'군사비 체납·탈영',NATION_FALL:'국가 멸망'};
  const ledger=make('div',{class:'military-list'},[
    make('strong',{text:'C6 · 편제 소멸 기록 (최근 10건)'}),
    make('div',{class:'muted-line',text:`세계 누적 ${Object.values(w.c6ArmyHistory?.byReason||{}).reduce((a,b)=>a+b,0)}건 · 상세 ${w.c6ArmyHistory?.entries.length||0}/300건 · 오래된 기록 ${w.c6ArmyHistory?.dropped||0}건 집계 보존`})
  ]);
  for(const h of history)ledger.append(make('div',{class:'army-detail'},[
    make('strong',{text:`제${h.id+1}군 · ${labels[h.reason]||h.reason} · ${Math.floor(h.endedDay/120)+1}년`}),
    make('small',{text:`창설 ${h.createdDay===null?'과거 기록 없음':`${Math.floor(h.createdDay/120)+1}년`} · 마지막 ${h.xp}XP / 교전 ${h.combatRounds}라운드 · 생존 ${h.survivors}명`}),
    ...(h.combatRecord?[make('small',{text:`전적 기록 시작 ${Math.floor(h.combatRecord.fromDay/120)+1}년 · ${h.combatRecord.wins}승 ${h.combatRecord.losses}패 · 적 전투 사망 기여 ${h.combatRecord.enemyKillsCredited}명 / 아군 전투 사망 ${h.combatRecord.ownBattleDeaths}명 · 참전 ${h.combatRecord.warIds.length}전쟁`})]:[])
  ]));
  if(!history.length)ledger.append(make('div',{class:'war-empty',text:'기록된 편제 소멸이 없습니다.'}));
  box.append(d1cNationPanel(w,n));
  box.append(front);
  if(!sorted.length){box.append(make('div',{class:'war-empty',text:'편성된 군대가 없습니다.'}),ledger);return box;}
  const roster=e3dBuildNationRoster(w,n,sorted);
  box.append(roster,ledger);return box;
}
/* Read-only national trait overlay: sparse UI built only on open panel. */
function d1dNationPanel(w,n,compact=false){
 const box=make('section',{class:'overview-section d1d-overview'});
 box.append(make('h3',{text:'D1D · 경험 기반 AI 성향'}));
 const a=n.aiAdaptation,base=w.aiProfiles[n.aiProfileId];if(!base||!a)return box;
 box.append(make('div',{class:'muted-line',text:`원본 AIProfile: ${base.name} · ${w.d1dAdaptiveEnabled?'적응 활성':'적응 OFF (원본 성향 사용)'} · 마지막 갱신 ${a.lastUpdatedDay?timeAt(a.lastUpdatedDay).year+'년':'관측 전'}`}));
 const toggle=make('button',{class:'jump-button',type:'button',text:w.d1dAdaptiveEnabled?'전체 국가 적응 OFF (비교용)':'전체 국가 적응 ON'});
 toggle.addEventListener('click',()=>{w.d1dAdaptiveEnabled=!w.d1dAdaptiveEnabled;w.changeSeq++;buildGeopoliticalReports(w,true);renderNationOverview();renderAIEditor();});
 box.append(toggle);
 const eff=d1dEffectiveProfile(w,n.id),table=make('div',{class:'d1d-traits'});
 table.append(make('div',{class:'d1d-trait d1d-trait-head'},[make('span',{text:'성향'}),make('span',{text:'기본'}),make('span',{text:'변화'}),make('span',{text:'현재'})]));
 for(const k of D1D_KEYS){const b=d1dBaseValue(base,k),delta=a.deltas[k]/100,now=d1dBaseValue(eff,k);
  table.append(make('div',{class:'d1d-trait'},[make('span',{text:D1D_LABELS[k]}),make('span',{text:String(b)}),make('span',{class:delta>0?'d1d-up':delta<0?'d1d-down':'',text:(delta>0?'+':'')+delta.toFixed(2)}),make('strong',{text:now.toFixed(2)})]));
 }
 box.append(table);
 box.append(make('div',{class:'muted-line',text:`최근 식량 압박 ${a.foodStressQuarters}분기 · 기억된 종전 ${a.warResults.length}건 · 이력 ${a.recentChanges.length}/${D1D_WINDOW}건` }));
 for(const reason of a.lastReasons)box.append(make('div',{class:'muted-line',text:'• '+reason}));
 const history=make('details',{class:'d1d-history'});history.append(make('summary',{text:`최근 성향 변화 기록 (${a.recentChanges.length}건)`}));
 for(const h of a.recentChanges.slice(-12).reverse()){const changed=D1D_KEYS.map(k=>`${D1D_LABELS[k]} ${(h.deltas[k]/100>=0?'+':'')+(h.deltas[k]/100).toFixed(1)}`).join(' · ');
  history.append(make('div',{class:'muted-line',text:`${timeAt(h.dayIndex).year}년 · ${changed}`}));
 }
 box.append(history);return box;
}

function renderNationOverview(){
  const box=$('nationOverview');if(!box||!app.world)return;
  const w=app.world,n=w.nations[app.selectedNationId]||w.nations[0];
  if(!n)return;
  // The quarterly strategy panel is reconstructed on ticks; preserve nested scroll only
  // while the same nation and subtab stay selected (never carry it to another nation).
  const samePanel=app.lastNationPanelId===n.id&&app.lastNationPanelSubtab===app.nationSubtab;
  const neighborScroll=samePanel?box.querySelector('.strategy-neighbors')?.scrollTop??0:0;
  const tabScroll=box.querySelector('.nation-subtabs')?.scrollLeft??0;
  const expanded=samePanel?[...box.querySelectorAll('.nation-subtab-content details')].map((el,i)=>[el.id||String(i),el.open]):[];
  const expandedByKey=new Map(expanded);
  const settlements=w.settlements.filter(s=>s.ownerId===n.id),armies=w.armies.filter(a=>a.nationId===n.id),
    leader=w.characters.find(c=>c.id===n.leaderId),pop=settlements.reduce((x,s)=>x+s.population,0),
    territory=w.tiles.filter(t=>t.ownerId===n.id).length,econ=projectedQuarter(w,n),
    townCapacity=settlementCapacity(w,n.id,{nationId:n.id,ownedCount:territory});
  const top=make('div',{class:'nation-summary'},[
    make('span',{class:'nation-badge',style:{background:n.color},text:n.name.slice(0,1)}),
    make('div',{},[make('div',{class:'overview-heading',text:n.name+(n.active?'':' · 멸망')}),make('small',{class:'muted-line',text:n.personality+' · '+n.controller+' · '+(w.aiProfiles[n.aiProfileId]?.name||'')+' · '+civilizationLabel(n)})])]);
  const jump=make('button',{class:'jump-button',text:'▦ 수도 지도에서 보기',type:'button'});
  jump.disabled=n.capitalId===null;jump.addEventListener('click',()=>goToMap(n.capitalId));
  const grid=make('div',{class:'nation-overview-grid'},[
    ...[['인구',number.format(pop)+'명'],['영토',territory+'타일'],['Gold',number.format(n.gold)+' G'],['AP',`${apDisplay(n.apUnits)} / ${apDisplay(n.apMaxUnits)}`],
      ['Knowledge',number.format(n.knowledge)+' K'],['병력 목표',`${number.format(armies.reduce((sum,a)=>sum+manpower(a),0))} / ${number.format(militaryStrengthTarget(w,n.id))}명`],['군사력',number.format(armies.reduce((sum,a)=>sum+getArmyBasePower(w,a),0))],
      ['예비병 / 훈련중',`${n.military.reserveReady} / ${pendingManpower(n)}명`],['예비병 훈련상한',`${trainingRate(w,n.id)}명/분기`],['동원 상한 / 병영',`${number.format(militaryCapacity(w,n.id))}명 · ${v04eBarracksEffects(w,n.id).paid}/${v04eBarracksEffects(w,n.id).built}채 가동`],['병영 보유·건설·전환·초과·단절',`${v04e1BarracksInventory(w,n.id).built} / ${v04e1BarracksInventory(w,n.id).constructing} / ${v04e1BarracksInventory(w,n.id).pending} / ${v04e1BarracksInventory(w,n.id).overLimit} / ${v04e1BarracksInventory(w,n.id).detached}채`],['병영 유지비',`${n.military.barracksFinance.paidLastQuarter} / ${n.military.barracksFinance.billedLastQuarter} G · 미납 ${n.military.barracksFinance.unpaidLastQuarter} G`],['군대 편제',`${armies.length} / ${armyLimit(w,n.id)}개 · 최대 ${number.format(armyLimit(w,n.id)*150)}명`],['군 급여',`${n.military.unpaidQuarters}분기 미지급 · 최근 탈영 ${n.military.desertedLastQuarter}명`],
      ['식량',number.format(n.resources.food)],['석탄',number.format(n.resources.coal||0)],['기계 부품',number.format(n.resources.machine_parts||0)],['강철',number.format(n.resources.steel||0)],['산업제 포탄',number.format(n.resources.artillery_shells||0)],['목재 / 석재 / 철',`${n.resources.wood} / ${n.resources.stone} / ${n.resources.iron}`]]
      .map(([label,value])=>make('div',{class:'economy-item'},[make('small',{text:label}),make('strong',{text:value})]))]);
  const trade=n.trade;
  const marketInfo=app.world.market?.lastNation?.find(x=>x.id===n.id);
  const trading=make('section',{class:'overview-section'},[
    make('h3',{text:'국제 교역'}),
    make('div',{class:'muted-line',text:`총 수출 ${number.format(trade.exportValue)} Gold · 총 수입 ${number.format(trade.importValue)} Gold · 최근 분기 수출 ${trade.quarterExportValue} / 수입 ${trade.quarterImportValue} Gold`}),
    make('div',{class:'muted-line',text:'거래 가능 국가: '+(w.nations.filter(other=>other.active&&other.id!==n.id&&tradeRoute(w,n.id,other.id)).map(v=>v.name).join(', ')||'현재 없음')})]);
  const marketLine=make('div',{class:'muted-line',text:`E3E1 시장 · 최근 분기 매입 ${number.format(Object.values(marketInfo?.bought||{}).reduce((a,b)=>a+b,0))}개 / 매도 ${number.format(Object.values(marketInfo?.sold||{}).reduce((a,b)=>a+b,0))}개 · 실제 지출 ${number.format(marketInfo?.buyerPaid||0)} / 수령 ${number.format(marketInfo?.sellerReceived||0)} G`});
  const marketJump=make('button',{class:'jump-button',type:'button',text:'◇ 국제 시장 보기'});marketJump.addEventListener('click',()=>{e3eSelectedNation=n.id;setActiveTab('market');});
  trading.append(marketLine,
    make('div',{class:'muted-line',text:`간접 시장 · 수입 화물 ${number.format(marketInfo?.indirectImportFreight||0)}/${number.format(e3e3IndirectLimit(w,n.id))} · 수출 화물 ${number.format(marketInfo?.indirectExportFreight||0)}/${number.format(e3e3IndirectLimit(w,n.id))} · 추가 운송 수수료 ${number.format(marketInfo?.indirectFeeGold||0)} G`}),marketJump);
  const dependency=tradeDependencyReport(w,n.id);
  if(dependency){
    const pressure=dependency.pressure;
    trading.append(make('div',{class:'muted-line',text:`F3 · 교역 압박 ${pressure}/100 · 최근 완료 ${dependency.dataQuarters}분기 기반 · 차단 교역 상대 ${dependency.blockedPartners.length}국`}));
    if(!dependency.dataQuarters)trading.append(make('div',{class:'muted-line',text:'새 교역 관측 시작 전: 기존 저장의 과거 거래를 추정하지 않습니다. 다음 분기부터 누적됩니다.'}));
    const detail=make('div',{class:'economy-grid'},GOODS.map(g=>{
      const r=dependency.goods[g],source=r.dominantSellerId===null?'없음':w.nations[r.dominantSellerId]?.name||'없음';
      return make('div',{class:'economy-item'},[
        make('small',{text:TRADE_GOODS[g].label+' · 교역 의존'}),
        make('strong',{text:`${(r.importReliance*100).toFixed(1)}% · 압박 ${r.pressure}`}),
        make('small',{text:`재고 ${number.format(r.stock)} / 안전재고 ${number.format(r.reserve)}`}),
        make('small',{text:`주요 수입국 ${source} · 집중도 ${(r.concentration*100).toFixed(0)}%`}),
        make('small',{text:`차단된 과거 수입 ${number.format(r.blockedImports)} / ${number.format(r.priorImports)} · 금분기 수입 ${number.format(r.quarterImports)}`})
      ]);
    }));
    trading.append(detail);
  }
  // Show the most recent completed quarterly report on every intervening day.
  // The simulation's strategicReport() intentionally requires an exact-day cache and is unchanged.
  const strategy=w.strategyReports?.dayIndex<=w.dayIndex?w.strategyReports?.nations?.[n.id]||null:null;
  const strategic=make('section',{class:'overview-section strategy-overview'},[
    make('h3',{text:'D · 지정학적 전략 진단'}),
    make('div',{class:'muted-line',text:strategy?`평가일 ${timeAt(w.strategyReports.dayIndex).year}년 ${timeAt(w.strategyReports.dayIndex).quarter}분기 · 현재 우선순위: ${({recovery:'경제 회복',security:'안보 강화',development:'경제 개발',expansion:'영토 확장'})[strategy.priority]}`:'다음 분기 평가 이후 표시됩니다.'}),
    ...(strategy?[make('div',{class:'muted-line',text:'전쟁 판단: '+b4ReasonLabel(strategy.warIntent?.reason||'상태 확인 중')+(strategy.warIntent?.targetNationId!==null&&strategy.warIntent?.targetNationId!==undefined?' · '+(w.nations[strategy.warIntent.targetNationId]?.name||'')+' (의욕 '+strategy.warIntent.willingness+(strategy.warIntent.strategicRatio!==null&&strategy.warIntent.strategicRatio!==undefined?' · 예상 전력비 '+strategy.warIntent.strategicRatio:'')+')':'')}),make('div',{class:'strategy-metrics'},Object.entries(strategy.scores).map(([key,value])=>
      make('div',{class:'strategy-metric'},[make('span',{text:({recovery:'회복',security:'안보',development:'개발',expansion:'확장'})[key]}),make('div',{class:'strategy-track'},[make('span',{style:{width:value+'%'}})]),make('b',{text:value.toFixed(0)})]))),
      make('div',{class:'muted-line',text:`분기 전망: 수입 ${number.format(strategy.financial.income)} · 군사비 ${number.format(strategy.financial.military)} · 민간 운영 ${number.format(strategy.financial.civil)} · 순여력 ${number.format(strategy.financial.balance)} G · 최근 기록된 거래에 기초한 의존도`}),
      make('div',{class:'strategy-neighbors'},strategy.neighbors.length?strategy.neighbors.map(v=>make('div',{class:'strategy-neighbor'},[
        make('span',{text:w.nations[v.id].name}),make('strong',{text:`위협 ${v.threat.toFixed(0)} · 전쟁 매력도 ${v.attraction.toFixed(0)}`}),
        make('small',{text:`관계 ${v.relation} · 상대 전력비 ${v.militaryRatio.toFixed(2)} · 요새 저항 ${v.resistance.toFixed(0)} · 최근 양자 교역 ${number.format(v.tradeGold)}G`})])):
        [make('div',{class:'muted-line',text:'현재 육상 국경을 공유한 국가가 없습니다.'})])]:[])
  ]);
  const leadership=make('section',{class:'overview-section'},[
    make('h3',{text:'지도자와 분기 경제'}),
    make('div',{class:'muted-line',text:`${leader?.name||'없음'} · ${leader?.age||'—'}세 · 행정 ${leader?.administration||'—'}`}),
    make('div',{class:'muted-line',text:`분기 세수 +${econ.goldIncome} G · 군 유지 -${econ.upkeep} G · 민간 운영 -${econ.civil.total} G (행정 ${econ.civil.services} / 시설 ${econ.civil.buildings} / 요새 ${econ.civil.forts} / 도로 ${econ.civil.roads}) · 최근 미납 ${n.civilFinance?.unpaidLastQuarter||0} G · AP +${apDisplay(econ.apRecovery)} · 연구 +${econ.knowledgeIncome} K`}),
    make('div',{class:'muted-line',text:`V0.7E3A 공방: 최근 분기 가동 ${n.lastQuarter?.workshop?.operated||0}/${n.lastQuarter?.workshop?.sites||0}개 · 원료 목재 ${n.lastQuarter?.workshop?.woodUsed||0} / 철 ${n.lastQuarter?.workshop?.ironUsed||0} 소모 · 정밀 가동 ${n.lastQuarter?.workshop?.precisionOperated||0}개 · +${n.lastQuarter?.workshop?.gold||0} G · 수차 ${n.lastQuarter?.workshop?.watermills||0}개 · 인쇄실 ${n.lastQuarter?.printing?.operated||0}개 · 인쇄 Knowledge +${n.lastQuarter?.printing?.knowledge||0}`})]);
  const tech=n.technology||{unlocked:[],currentResearch:null,progress:0};
  const current=tech.currentResearch?TECHNOLOGY_BY_ID[tech.currentResearch]:null;
  const readiness=medievalReadiness(w,n);
  const era=n.civilization.era;
  const eraInfo=make('section',{class:'era-info', 'aria-label':'국가 문명 시대'},[
    make('div',{class:'era-info-head'},[
      make('strong',{text:`문명 시대 · ${civilizationLabel(n)}`}),
      make('small',{text:n.civilization.stageReachedDay!==null&&(era==='medieval'||(era==='early_modern'||era==='industrial_modern')&&n.civilization.stage>=2)?`${Math.floor(n.civilization.stageReachedDay/120)+1}년 ${Math.floor((n.civilization.stageReachedDay%120)/30)+1}분기 단계 진입`:(n.civilization.eraReachedDay===null?'시대 진입일 미기록':`${Math.floor(n.civilization.eraReachedDay/120)+1}년 진입`)})
    ]),
    ...(era==='ancient'?[make('div',{class:'muted-line',text:'다음 시대: 중세 · 기술 및 가동 시설 조건'}),
      ...readiness.technologies.map(t=>make('div',{class:'era-check '+(t.ready?'met':''),text:`${t.ready?'✓':'○'} ${t.label} 연구`})),
      make('div',{class:'era-check '+(readiness.facility?'met':''),text:`${readiness.facility?'✓':'○'} 소유 정착지에 정상 가동 중인 Lv.2 이상 일반 시설`})]:
      [make('div',{class:'muted-line',text:medievalNextCore(n)?`다음 단계: ${MEDIEVAL_STAGE_LABELS[n.civilization.stage+1]} · 핵심 기술 ${TECHNOLOGY_BY_ID[medievalNextCore(n)].name}`:(era==='industrial_modern'?(n.civilization.stage===1?'다음 단계: 산업 근대 II · 산업 기반 통합 체계 + 공장·제강소 운영 증거 또는 10배 Knowledge 대체':n.civilization.stage===2?'다음 단계: 산업 근대 III · 오토마톤 조립 연구 + 소유 공장 실가동 여건':n.civilization.stage===3?'다음 단계: 산업 근대 IV · 통합 공장 운영 체계 + Lv.4 실제 생산 또는 가동 이력이 있는 Lv.3 공장·제강소':'산업 근대 IV · 현재 구현된 최고 단계'):(era==='early_modern'?(n.civilization.stage===1?'다음 단계: 근세 II · 공방 집적화 연구 필요':n.civilization.stage===2?'다음 단계: 근세 III · 기계 부품 규격화 + 실제 가동 Lv.3 공방':n.civilization.stage===3?'다음 단계: 근세 IV · 대형 기계 조립 + 실제 정밀 가동 Lv.3 공방':'다음 시대: 산업 근대 I · 석탄 채굴·증기 동력 실증 또는 10배 Knowledge 대체'):'다음 시대: 근세 I · 활판 인쇄 + 정상 가동 공방/학술원 필요'))})])
  ]);
  // K: show individual, presently-owned industrial readiness rather than claiming
  // a Knowledge-only shortcut for Industrial Modern IV.
  if(era==='industrial_modern'&&n.civilization.stage===3){
   const k=kIndustrialIVReadiness(w,n);
   eraInfo.append(make('div',{class:'era-check '+(k.technology?'met':''),text:`${k.technology?'✓':'○'} 통합 공장 운영 체계 연구`}),
    make('div',{class:'era-check '+(k.advanced?'met':''),text:`${k.advanced?'✓':'○'} 경로 A: 실제 유상 가동한 현재 소유 Lv.4 공장`}),
    make('div',{class:'era-check '+(k.factory?'met':''),text:`${k.factory?'✓':'○'} 경로 B: 실제 유상 가동한 현재 소유 Lv.3+ 공장`}),
    make('div',{class:'era-check '+(k.steelworks?'met':''),text:`${k.steelworks?'✓':'○'} 경로 B: 실제 유상 가동한 현재 소유 제강소`}));
  }
  const f2a1Next=f2a1KnowledgeAlternative(n);
  if(f2a1Next.reference){
    eraInfo.append(make('div',{class:'muted-line',text:
      `F2A1 10배 Knowledge 대체 승급: ${number.format(f2a1Next.cost)} K 필요 · 현재 ${number.format(n.knowledge)} K · ${f2a1Next.ready?'지불 가능':'Knowledge 부족'} · 선행 기술/시설/가동 불필요 · 기술 자동 해금 없음`}));
  }
  // E1: show observed, owned workshop evidence, never infer historic operation from stock.
  if(era==='early_modern'&&n.civilization.stage===2){
    const readiness3=v07e1Modern3Readiness(w,n);
    eraInfo.append(...readiness3.technology.map(t=>make('div',{class:'era-check '+(t.ready?'met':''),text:`${t.ready?'✓':'○'} ${TECHNOLOGY_BY_ID[t.id].name}`})),
      make('div',{class:'era-check '+(readiness3.operated?'met':''),text:`${readiness3.operated?'✓':'○'} 최근 분기 실제 가동한 소유 Lv.3 공방` }));
  }
  const c3diag=v07c3DevelopmentDiagnosis(w,n,econ);
  const c3reason=c3diag.blockers.map(code=>V07C3_DEVELOPMENT_REASON[code]||code).join(' · ');
  const c3development=make('section',{class:'overview-section', 'aria-label':'근세 개발 장애 진단'},[
    make('h3',{text:'F1C2 · 도시 건설·근세 발전 진단'}),
    make('div',{class:'muted-line',text:`일반 시설 슬롯: 타일당 기본 ${BUILDING_TILE_SLOTS} + 연구 보너스 ${generalTileSlotLimit(w,n.id)-BUILDING_TILE_SLOTS} = 최대 ${generalTileSlotLimit(w,n.id)}칸 · 신규 기술 도시 복합 건축 ${hasTech(w,n.id,'mixed_use_construction')?'연구 완료':'미연구'}`}),
    make('div',{class:'muted-line',text:`근세 진입 조건 · ${c3diag.tech?'✓':'○'} 활판 인쇄 · ${c3diag.academy?'✓':'○'} 가동 학술원 · ${c3diag.workshop?'✓':'○'} 가동 공방`}),
    make('div',{class:'muted-line',text:`공방 ${c3diag.built}/${c3diag.cap}개 · 식량 생산/소비 ${number.format(c3diag.foodProduced)} / ${number.format(c3diag.foodConsumed)} · 120일 충족률 ${(c3diag.foodSufficiency*100).toFixed(1)}% (기준 100%) · 실제 공급률 ${(c3diag.foodPressure*100).toFixed(1)}% · ${c3diag.foodPath}`}),
    make('div',{class:'muted-line',text:`합법적 공방 부지: 신축 ${c3diag.openSites}곳(강변 ${c3diag.riverOpen}) · 안전 재개발 ${c3diag.surplusSites}곳(강변 ${c3diag.riverSurplus})`}),
    make('div',{class:'muted-line',text:c3diag.blockers.length?`공방 개발 제한: ${c3reason}`:'공방 개발 조건 충족 · 실제 착공은 국가 AI 평가와 자재/AP에 따름'}),
    make('div',{class:'muted-line',text:`공방 동력: 기초 기계동력 ${hasTech(w,n.id,'basic_mechanical_power')?'연구 완료':'미연구'} · 강변 ×${v07dWorkshopPowerFactors(w,n.id).watermill.toFixed(2)} / 대체 ×${v07dWorkshopPowerFactors(w,n.id).alternative.toFixed(2)} · 최근 수차 ${n.lastQuarter?.workshop?.watermills||0}개 · 대체 ${n.lastQuarter?.workshop?.alternativePower||0}개 · 공방 Lv.3 ${w.buildings.filter(b=>b.typeId==='workshop'&&b.level===3&&w.tiles[b.tileId]?.ownerId===n.id).length}개`})
  ]);
  // Facility-level mode is preserved in saves; actual operation timestamp is passive evidence.
  const workshopsE1=w.buildings.filter(b=>b.typeId==='workshop'&&w.tiles[b.tileId]?.ownerId===n.id).sort((a,b)=>a.id-b.id);
  if(workshopsE1.length)c3development.append(make('div',{class:'muted-line',text:'공방별 E1: '+workshopsE1.map(b=>`#${b.id} Lv.${b.level} · ${b.workshopMode==='precision'?'정밀':'표준'} · 마지막 가동 ${b.lastOperatedDay==null?'E1 이후 기록 없음':b.lastOperatedDay+'일'}`).join(' / ')}));
  const research=make('section',{class:'overview-section tech-overview'},[
    eraInfo,
    make('h3',{text:`기술·연구 · ${tech.unlocked.length} / ${TECHNOLOGIES.length}개 해금`}),
    make('div',{class:'muted-line',text:`기초 연구 역량 ${n.researchLevel}/100 · Knowledge ${number.format(n.knowledge)} K · 분기 연구 상한 ${researchCapacity(w,n.id)} K${(era==='early_modern'||era==='industrial_modern')?' (근세·산업 근대 전용 상한)':era==='medieval'?' (중세 +10%)':''}`}),
    make('div',{class:'tech-current',text:current?`연구 중: ${current.name} · ${tech.progress}/${current.cost} K (${Math.floor(100*tech.progress/current.cost)}%)`:'진행 중인 연구 없음'}),
    ...(current?[make('div',{class:'tech-progress'},[make('span',{style:{width:`${tech.progress/current.cost*100}%`}})])]:[]),
    ...(tech.pausedResearch?[make('div',{class:'muted-line',text:`보류된 중세 연구: ${TECHNOLOGY_BY_ID[tech.pausedResearch.id].name} · ${tech.pausedResearch.progress} K 보존 · 중세 진입 시 재개`})]:[]),
    make('div',{class:'muted-line',text:(era==='early_modern'||era==='industrial_modern')?'근세·산업 근대: 실제 학술원 레벨·연구 역량에 따른 분기 연구 상한(최대 600 K) · 시설 건설 기간 보너스 유지':(CIVILIZATION_ERAS[era]?.order||0)>=1?'중세: 연구 상한 +10% · 일반 시설 건설 기간 -5%':'중세 진입 시 연구 상한 +10% · 일반 시설 건설 기간 -5% 적용'})
  ]);
  const exchange=n.knowledgeExchange,last=exchange.lastQuarter;
  const border=app.nationSubtab==='research'?quarterBorderPairs(w):new Set();
  const possible=w.nations.filter(other=>other.active&&other.id!==n.id&&
    (CIVILIZATION_ERAS[other.civilization.era]?.order??0)>(CIVILIZATION_ERAS[n.civilization.era]?.order??0)&&
    border.has(pairKey(n.id,other.id))&&!v04dWarBetween(w,n.id,other.id));
  const exchangeSection=make('section',{class:'v04d-exchange'},[
    make('h3',{text:'국경 지식 교류 · 중세 문명 추격'}),
    make('div',{class:'muted-line',text:`직접 인접한 선진 국가: ${possible.length?possible.map(v=>v.name).join(' · '):'없음'} · 교류 ${exchange.enabled?'허용':'중단'} · 연구 상한 최대 +25% · 실제 추가 연구 1K당 60 Gold (상대 70% 수령)`}),
    make('div',{class:'muted-line',text:`최근 분기: ${last.partnerId===null?'추가 연구 없음':`${w.nations[last.partnerId]?.name||'상대 국가'}에서 +${last.extraKnowledge} K · ${number.format(last.goldSpent)} Gold 지출 (상대 ${number.format(last.goldReceived)} / 운영비 ${number.format(last.operatingCost)})`}`}),
...(n.controller==='PLAYER'?[make('div',{class:'muted-line',text:'플레이어는 아래 버튼으로 자동 교류를 켜거나 끌 수 있습니다. 다음 연구 분기부터 적용합니다.'})]:[])
  ]);
  if(n.controller==='PLAYER'){
    const toggle=make('button',{type:'button',class:'jump-button',text:exchange.enabled?'지식 교류 중단':'지식 교류 허용'});
    toggle.addEventListener('click',()=>{n.knowledgeExchange.enabled=!n.knowledgeExchange.enabled;w.changeSeq++;renderNationOverview();});
    exchangeSection.append(toggle);
  }
  research.append(exchangeSection);
  for(let stage=0;stage<F2A3A_RESEARCH_STAGE_LABELS.length;stage++){
    // H1: one canonical stage-label list; previously stage 11 rendered `undefined`.
    const stageTitle=(`${['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ','Ⅹ','Ⅺ','Ⅻ'][stage]||stage+1}. ${stage===0?'고대 기술':F2A3A_RESEARCH_STAGE_LABELS[stage]||'미정 기술 단계'}`);
    research.append(make('h3',{text:stageTitle+(f2a3aResearchStageLocked(n,stage)?' · 단계 잠금':'')}));
    for(const [branch,label] of Object.entries(TECH_BRANCHES)){
    const group=make('div',{class:'tech-branch'},[make('strong',{text:label})]);
    for(const t of TECHNOLOGIES.filter(v=>v.branch===branch&&(f2a3aResearchStage(v.id))===stage)){
      const unlocked=tech.unlocked.includes(t.id),researching=tech.currentResearch===t.id,eraLocked=!techEraAllowed(n,t.id),available=!eraLocked&&!unlocked&&t.requires.every(id=>tech.unlocked.includes(id));
      const dependencies=t.requires.map(id=>TECHNOLOGY_BY_ID[id].name).join(' + ');
      const effect=Object.entries(t.effects).map(([key,value])=>({forestFarmBonus:'숲 농장 추가 생산',grassFarmBonus:'초원 농장 추가 생산',connectedFarmBonus:'도로망 연결 농장 추가 생산',recycledBuildMaterials:'일반 시설 신축·개량 자재 절감',farmFood:'농장 식량',passiveFood:'기초 식량',lumberWood:'목재 생산',quarryStone:'석재 생산',mineIron:'철 생산',materialDiscount:'건축 재료 절감',buildSpeed:'건설 속도',housing:'주거 용량',goldIncome:'세수',apUnits:'AP 회복',roadTravel:'도로 이동',upgradedTravel:'개량도로 이동',roadGold:'도로 세수',supplyPower:'보급 전투력',supplyAttrition:'고립 손실 경감',combatPower:'전투력',buildingSlots:'일반 시설 슬롯',redevelopmentRecovery:'재개발 자재 회수',redevelopmentCostDiscount:'재개발 Gold 절감',redevelopmentSpeed:'재개발 공사 속도',roadBuildCostDiscount:'도로 자재 절감',roadUpkeepDiscount:'도로 유지비 절감',advancedFarmBonus:'고급 농장 식량',workshopGold:'공방 Gold 산출',tradeCapacity:'육로 교역 운송 한도',paidSiegeBonus:'비용 납부 공성 효율',academyKnowledge:'학술원 지식',factoryOutput:'공장 생산량',steelworksYield:'제강소 추가 생산',industrialSteamCoalSaving:'증기기관 석탄 절감',mobilizationBonus:'동원률 보너스',armyLimitBonus:'군대 편제 상한',trainingRateBonus:'분기 훈련 인원',tradeFreightDiscount:'교역 운송 부담 감소',researchCapBonus:'분기 연구 상한(K)',workshopCap:'국가 공방 상한',printingKnowledge:'인쇄실 Knowledge'}[key]||key)+` ${key.endsWith('Travel')?'-'+value+'일':key==='apUnits'?'+'+(value/10).toFixed(1):key==='roadGold'?'+'+value+' G':key==='buildingSlots'?'+'+value+'칸':key==='workshopCap'?'+'+value+'개':['researchCapBonus','trainingRateBonus','steelworksYield','industrialSteamCoalSaving'].includes(key)?'+'+value:(key==='mobilizationBonus'?'+2.0%p':Math.round(value*100)+'%')}`).join(' · ');
      const names={'action:REDEVELOP_FACILITY':'시설 재개발','road:mountain_level_1':'산악 도로 건설','road:mountain_level_2':'산악 도로 개량','armor:medium':'중형 갑옷','armor:heavy':'중갑','armor:plate':'판금갑','material:steel_grade':'강철 장비 제작','loadout:swordsman':'검병','loadout:pikeman':'장창병','loadout:longbowman':'장궁병','loadout:crossbowman':'쇠뇌병','loadout:heavy_infantry':'중보병','era:medieval':'중세 문명 진입 핵심','building:workshop':'수공업 공방 건설','workshop:mechanical_power':'초기 기계동력','era:early_modern':'근세 진입 핵심 기술','academy:printing_room':'학술원 인쇄실','workshop:level_2':'공방 Lv.2','loadout:matchlock':'화승총병','era:early_modern_2':'근세 II 진입 핵심','workshop:level_3':'공방 Lv.3','workshop:power_transmission':'공방 동력 개선','workshop:precision':'정밀 공방 모드','era:early_modern_3':'근세 III 승격 핵심','loadout:flintlock':'머스킷병','era:early_modern_4':'근세 IV 승격 핵심','loadout:field_artillery':'전장포','loadout:machine_gunner':'기관총병','weapon:machine_gun':'기관총','artillery:training':'포병 훈련','artillery:supply':'포병 군수'};
      const levelUnlocks=Object.entries(G2_LEVEL_TECH).flatMap(([type,techs])=>techs.flatMap((id,index)=>id===t.id?[`해금: ${BUILDINGS[type].label} Lv.${index+4}`]:[]));
      const unlockText=[...(t.unlocks||[]).map(id=>'해금: '+(names[id]||id.split(':').pop())),...levelUnlocks].join(' · ');
      group.append(make('div',{class:'tech-item '+(unlocked?'is-unlocked':researching?'is-researching':available?'is-available':'is-locked')},[
        make('span',{class:'tech-status',text:unlocked?'✓':researching?'◷':available?'◇':'🔒'}),
        make('div',{},[make('strong',{text:t.name+' · '+t.cost+' K · '+F2A3A_RESEARCH_STAGE_LABELS[f2a3aResearchStage(t.id)]+(['regional_governance','ore_refining','construction_management','advanced_transport','workshop_concentration','mechanical_components'].includes(t.id)?' · ★ 전환 핵심':'')}),make('small',{text:(eraLocked?(V07E2_MODERN4_TECH_IDS.has(t.id)?'근세 IV 진입 후 연구 가능 · ':V07E1_MODERN3_TECH_IDS.has(t.id)?'근세 III 진입 후 연구 가능 · ':V07D_MODERN2_TECH_IDS.has(t.id)?'근세 II 진입 후 연구 가능 · ':V07D_MODERN1_TECH_IDS.has(t.id)?'근세 I 진입 후 연구 가능 · ':'해당 중세 단계 진입 후 연구 가능 · '):'')+[effect,unlockText].filter(Boolean).join(' · ')+(dependencies?' · 선행: '+dependencies:'')})])
      ]));
    }
    if(group.children.length>1)research.append(group);
    }
  }
  const places=make('section',{class:'overview-section'},[make('h3',{text:`정착지 · ${settlements.length} / ${townCapacity.limit}개`})]);
  places.append(make('div',{class:'muted-line',text:'F1 · 지역 시설 생산 전망 (분기 기준) · 노동 가동률·발전도·도로 반영 · 전국 기초 채집 및 기술 보너스 별도 · 정착지 재고 없음'}));
  places.append(make('div',{class:'muted-line',text:`국가 분기 예상 (기술·기초 채집 포함) · 식량 +${econ.produced.food} / 소비 -${econ.foodConsumed} · 목재 +${econ.produced.wood} · 석재 +${econ.produced.stone} · 철 +${econ.produced.iron} · 연구 +${econ.knowledgeIncome}`}));
  const f1c1Footprint=settlementFootprintCapacity(w,n.id);
  places.append(make('div',{class:'muted-line',text:`F1C1 · 소유 영토 ${townCapacity.ownedCount}타일 · 간격 ${townCapacity.spacing}타일 · 기술 밀도 +${Math.round(townCapacity.bonus*100)}% · 신규 설립 여유 ${Math.max(0,townCapacity.limit-settlements.length)}개 · 정착지 상한 ${f1c1Footprint.maxTiles}타일 / 중심 반경 ${f1c1Footprint.maxRadius}`}));
  for(const settlement of settlements){
    const row=make('div',{class:'nation-action-row'},[
      make('div',{},[make('strong',{text:settlementDisplayName(w,settlement)+(settlement.coreTileId===n.capitalId?' ♛':'')}),make('div',{class:'muted-line',text:`인구 ${number.format(settlement.population)} / 주거 ${number.format(settlementHousing(w,settlement))} · 발전 ${settlement.development} · ${settlement.level}단계 · 면적 ${settlement.tileIds.length}/${f1c1Footprint.maxTiles}타일 · 현재 반경 ${Math.max(0,...settlement.tileIds.map(id=>footprintDistance(id,settlement.coreTileId,w.size)))}/${f1c1Footprint.maxRadius}`})])]);
    const facility=settlementBuildings(w,settlement.id),summary={};
    for(const b of facility)summary[b.typeId]=(summary[b.typeId]||0)+1;
    row.firstChild.append(make('div',{class:'muted-line',text:facility.length?`시설 ${facility.length}개 · ${Object.entries(summary).map(([type,count])=>`${BUILDINGS[type]?.label||type} ${count}`).join(' · ')}`:'시설 없음'}));
    const local=econ.regionalEconomy.towns.get(settlement.id);
    if(local){
      const pct=Math.round(local.utilization*100);
      row.firstChild.append(make('div',{class:'muted-line',text:`노동 역량 ${local.workers} / 필요 ${local.demand} · 시설 가동률 ${pct}% · 발전 +${Math.round((local.developmentFactor-1)*100)}% · 도로 +${(local.roadBonus*100).toFixed(1)}%`}));
      if(local.roadNetwork){
        const net=local.roadNetwork;
        row.firstChild.append(make('div',{class:'muted-line',text:`인프라 연결망 ${net.cores.length}개 정착지 · 도로 ${net.roadTiles}타일(개선 ${net.upgradedTiles}) · 개선 비율 ${(net.quality*100).toFixed(1)}% · 생산 보너스 +${(local.roadBonus*100).toFixed(1)}% · 개발 행동 +2`}));
      }else row.firstChild.append(make('div',{class:'muted-line',text:'인프라 연결망 없음 · 생산 보너스 +0%'}));
      row.firstChild.append(make('div',{class:'muted-line',text:`시설 분기 생산(기술 전) · 식량 ${local.produced.food} · 목재 ${local.produced.wood} · 석재 ${local.produced.stone} · 철 ${local.produced.iron} · 연구 ${local.knowledge}`}));
    }
    const btn=make('button',{class:'jump-button',type:'button',text:'지도에서 보기'});btn.addEventListener('click',()=>goToMap(settlement.coreTileId));row.append(btn);places.append(row);
  }
  const diplomacy=make('section',{class:'overview-section'},[make('h3',{text:'외교 관계 · 휴전 · 종주 관계'})]);
  const suzerain=v06bSubjectOf(w,n.id),subjects=v06bSubjectsOf(w,n.id);
  const role=suzerain?`종속국 · 종주국 ${w.nations[suzerain.overlordId].name}`:subjects.length?`종주국 · 종속국 ${subjects.map(t=>w.nations[t.subjectId].name).join('·')}`:'독립국';
  diplomacy.append(make('div',{class:'muted-line',text:`정치적 지위: ${role} · 조공률 10% (종속 관계에만 적용) · 직속 종속국 상한 2개` }));
  if(suzerain){const status=c5IndependenceSituation(w,n.id),out=status.outreach,partner=out?.targetId!==null&&out?.targetId!==undefined?w.nations[out.targetId]?.name:null;
   diplomacy.append(make('div',{class:'muted-line',text:`C5 독립 판단 · 준비 병력 ${number.format(status.own)} / 종주국 ${number.format(status.foe)} · 외부 지원 ${number.format(status.allies)} · 예상 비율 ${status.ratio.toFixed(2)} (봉기 기준 ${status.threshold.toFixed(2)}) · 주요 제약: ${status.blockers.join(' / ')||'조건 충족 가능'}`}));
   diplomacy.append(make('div',{class:'muted-line',text:`C5A 독립 외교 · ${c5aSupportExplanation(w,n.id,status)}`}));}
  if(suzerain)diplomacy.append(make('div',{class:'muted-line',text:`C2 독립 압력 ${suzerain.independencePressure.toFixed(1)}/100 · ${suzerain.status==='REBELLION'?'독립전쟁 중':'평화적 종속'} · 거절 ${suzerain.rejectedDemands||0}회 · 다음 요구 ${Math.max(0,Math.ceil(((suzerain.nextDemandDay||0)-w.dayIndex)/DAYS_PER_YEAR))}년 후` }));
  if(suzerain)diplomacy.append(make('div',{class:'muted-line',text:`종주 조약: ${suzerain.origin==='FORCED'?'전쟁 복속':'자발적 보호'} · ${timeAt(suzerain.formedDay).year}년 시작 · ${Math.max(0,Math.ceil((suzerain.endsDay-w.dayIndex)/DAYS_PER_YEAR))}년 후 50년 관계 재평가 · 지난 분기 ${number.format(suzerain.lastPaid)} / 청구 ${number.format(suzerain.lastDue)} G · 총 조공 ${number.format(suzerain.totalPaid)} G` }));
  if(suzerain)diplomacy.append(make('div',{class:'muted-line',text:`C4 종주국 보호 실적 · 방어 요청 수락 ${suzerain.protectionHelp||0} / 거절 ${suzerain.protectionFailures||0} · 실제 교전 지원 ${suzerain.protectionBattleAid||0} · 방어전 패배 ${suzerain.protectionDefeats||0}` }));
  for(const t of subjects)diplomacy.append(make('div',{class:'muted-line',text:`C2 종속국 ${w.nations[t.subjectId].name} · 독립 압력 ${t.independencePressure.toFixed(1)}/100 · ${t.status==='REBELLION'?'봉기 중':'평시'}` }));
  for(const t of subjects)diplomacy.append(make('div',{class:'muted-line',text:`종속국 ${w.nations[t.subjectId].name}: 지난 분기 ${number.format(t.lastPaid)} G 수령 · 누적 ${number.format(t.totalPaid)} G · ${Math.ceil((t.endsDay-w.dayIndex)/DAYS_PER_YEAR)}년 후 50년 관계 재평가` }));
  for(const t of subjects)diplomacy.append(make('div',{class:'muted-line',text:`C4 ${w.nations[t.subjectId].name} 보호 실적 · 방어 요청 수락 ${t.protectionHelp||0} · 실제 교전 지원 ${t.protectionBattleAid||0} · 방어전 패배 ${t.protectionDefeats||0}` }));
  e2bPanel(w,n,diplomacy);
  const independenceOffers=(w.diplomacy.independenceOffers||[]).filter(o=>o.to===n.id&&o.expiresDay>w.dayIndex);
  for(const o of independenceOffers)diplomacy.append(make('div',{class:'muted-line',text:`독립 외교 제안: ${w.nations[o.from].name} · ${o.kind==='FRONT'?'공동전선':o.kind==='BACKING'?'독립국의 지원 제안':'독립 지원 요청'} · ${o.expiresDay-w.dayIndex}일 남음`}));
  for(const front of w.diplomacy.independenceFronts||[])if(front.a===n.id||front.b===n.id)diplomacy.append(make('div',{class:'muted-line',text:`독립 공동전선: ${w.nations[front.a===n.id?front.b:front.a].name} · 만료까지 ${front.expiresDay-w.dayIndex}일`}));
  for(const pledge of w.diplomacy.independencePledges||[])if(pledge.subjectId===n.id||pledge.supporterId===n.id)diplomacy.append(make('div',{class:'muted-line',text:`독립지원 약속: ${w.nations[pledge.supporterId].name} → ${w.nations[pledge.subjectId].name} · ${pledge.status}`}));
  const subjectOffers=(w.diplomacy.subjectOffers||[]).filter(o=>o.to===n.id&&o.expiresDay>w.dayIndex);
  for(const o of subjectOffers)diplomacy.append(make('div',{class:'muted-line',text:`요청 수신: ${w.nations[o.from].name} · ${o.kind==='SUBMIT'?'보호·종속 제안':'종속 관계 해제 제안'} · ${o.expiresDay-w.dayIndex}일 남음 (직접 조종 시 명령에서 응답)` }));
  const ds=w.diplomacy.subjectDiagnostics;
  if(ds)diplomacy.append(make('div',{class:'muted-line',text:`B1 누적 종속 진단 (${timeAt(ds.sinceDay).year}년 이후): 자발 평가 ${ds.voluntary.evaluations} / 적격 ${ds.voluntary.eligible} / 제안 ${ds.voluntary.offered} / 성립 ${ds.voluntary.accepted} / 거절 ${ds.voluntary.rejected} · 강제 적격 ${ds.forced.eligible}/${ds.forced.evaluations} / 요구 ${ds.forced.offered} / 성립 ${ds.forced.accepted} / 거절 ${ds.forced.rejected} · 누적 조공 ${number.format(ds.tribute.paid)}/${number.format(ds.tribute.due)} G` }));
  const recentTributes=(w.diplomacy.tributeHistory||[]).filter(x=>x.overlordId===n.id||x.subjectId===n.id).slice(-4).reverse();
  for(const h of recentTributes)diplomacy.append(make('div',{class:'muted-line',text:`${timeAt(h.dayIndex).year}년 ${timeAt(h.dayIndex).quarter}분기 · ${w.nations[h.subjectId].name} → ${w.nations[h.overlordId].name} 조공 ${number.format(h.paid)}/${number.format(h.due)} G${h.unpaid?' · 미지급 '+number.format(h.unpaid)+' G':''}` }));
  for(const other of w.nations){
    if(other.id===n.id)continue;
    const relation=relationOf(w,n.id,other.id);
    const until=Math.max(n.truces?.[other.id]||0,other.truces?.[n.id]||0);
    const atWar=Boolean(warAgainst(w,n.id,other.id));
    const alliance=allianceBetween(w,n.id,other.id);const offer=allianceOffer(w,n.id,other.id),received=allianceOffer(w,other.id,n.id);
    const subjectTreaty=v06bBetween(w,n.id,other.id);
    const subjectState=subjectTreaty?subjectTreaty.overlordId===n.id?'종속국':'종주국':null;
    const state=atWar?'전쟁 중':subjectState?subjectState:alliance?`동맹 · ${Math.ceil((alliance.endsDay-w.dayIndex)/DAYS_PER_YEAR)}년 남음`:received?'동맹 제안 수신':offer?'동맹 제안 전송':until>w.dayIndex?`휴전 ${until-w.dayIndex}일`:relation<=-60?'적대':relation<=-20?'긴장':relation>=50?'친밀':relation>=20?'우호':'중립';
    const breakdown=e5RelationComponents(w,n.id,other.id),memory=e5Memory(w,n.id,other.id);
    const signed=x=>(x>0?'+':'')+x;
    const age=alliance?` · 연속 동맹 ${(e5TreatyAge(w,n.id,other.id)/DAYS_PER_YEAR).toFixed(1)}년`:'';
    const stability=e5bRestingDetails(w,n.id,other.id);
    const parts=[`기본 ${signed(breakdown.base)}`,`문화 관계 ${signed(breakdown.culture)}`,`국경 마찰 ${signed(breakdown.border)}`,`동맹 신뢰 ${signed(breakdown.trust)}`];
    if(breakdown.capital)parts.push(`옛 수도 갈등 ${signed(breakdown.capital)}`);
    if(breakdown.betrayal)parts.push(`배신의 불신 ${signed(breakdown.betrayal)}`);
    if(breakdown.tension)parts.push(`제3국 동맹 긴장 ${signed(breakdown.tension)}`);
    if(memory?.lastBetrayalDay!==undefined)parts.push(`마지막 배신 ${Math.floor(memory.lastBetrayalDay/DAYS_PER_YEAR)+1}년 (${w.nations[memory.lastBetrayerId]?.name} → ${w.nations[memory.lastVictimId]?.name})`);
    const row=make('div',{class:'nation-action-row'},[
      make('span',{class:'nation-badge',text:other.name.slice(0,1),style:{background:other.color}}),
      make('div',{},[make('strong',{text:`${other.name} · ${relation>0?'+':''}${relation}`}),make('div',{class:'muted-line',text:state+age}),
        make('div',{class:'muted-line',text:'우호도 구성 · '+parts.join(' · ')}),
        ...(alliance?[make('div',{class:'muted-line',text:`장기 관계 안정 · 기본 우호도 수렴 목표 ${signed(stability.target)} (중립 ${signed(stability.neutral)} · 동맹 유지에 따른 목표 +${stability.offset}/8) · 현재 기본 ${signed(breakdown.base)} · 즉시 가산 아님`})]:[])])]);
    const perception=v06aGet(w,n.id,other.id),reverse=v06aGet(w,other.id,n.id);
    const describePower=x=>x>=65?'매우 강한 상대':x>=25?'강대국 경계':x>-25?'대등·중립':x>-65?'약소국 인식':'압도적 우위';
    const perceptionLine=(observer,target,m)=>m?`${observer.name} → ${target.name} · 신뢰 ${signed(v06aRound(m.trust))} / 원한 ${v06aRound(m.grievance)} / 은혜 ${v06aRound(m.favor)} / 배신 우려 ${v06aRound(m.betrayalConcern)} (${m.betrayalCount}회) / 세력 인식 ${signed(m.perceivedPower)} [${describePower(m.perceivedPower)}]`:
      `${observer.name} → ${target.name} · 외교 기억 없음 (다음 분기부터 세력 인식 계산)`;
    const insight=make('details',{class:'v06a-perception-details'},[
      make('summary',{text:`외교 기억 보기 · 세력 인식 ${perception?signed(perception.perceivedPower):'미기록'} / 역방향 ${reverse?signed(reverse.perceivedPower):'미기록'}`}),
      make('div',{class:'muted-line',text:perceptionLine(n,other,perception)}),
      make('div',{class:'muted-line',text:perceptionLine(other,n,reverse)})]);
    if(perception){const weights=`AI 판단 보정 · 동맹 ${signed(v06aRound(v06aAllianceWeight(w,n.id,other.id)))} / 방어 지원 ${signed(v06aRound(v06aDefenseWeight(w,n.id,other.id)))} / 전쟁 의지 ×${v06aWarWeight(w,n.id,other.id).toFixed(2)}`;
      insight.append(make('div',{class:'muted-line',text:weights}));}
    row.children[1].append(insight);
    diplomacy.append(row);
  }
  const memoryEvents=(w.diplomacy.history||[]).filter(e=>e.a===n.id||e.b===n.id).slice(-8).reverse();
  if(memoryEvents.length){
    diplomacy.append(make('h3',{text:'외교 관계 기억 · 최근 8건'}));
    for(const e of memoryEvents){const other=w.nations[e.a===n.id?e.b:e.a],year=Math.floor(e.dayIndex/DAYS_PER_YEAR)+1;
      const description=e.kind==='BETRAYAL'?`${w.nations[e.betrayerId]?.name} → ${w.nations[e.victimId]?.name} 동맹 배신`:e.kind==='ALLIANCE_END'?`${other?.name} 동맹 종료 (${(e.durationDays/DAYS_PER_YEAR).toFixed(1)}년 · ${e.reason}${e.renewalBlocker?' · 갱신: '+({LOW_RELATION:'우호도 부족',LOW_COOPERATION:'협력 성향 부족',PLAYER_CONTROLLED:'직접 조종'}[e.renewalBlocker]||e.renewalBlocker)+' · 우호도 '+e.renewalRelation+'/25 · 협력 '+e.renewalCooperation+'/95':''})`:e.kind==='ALLIANCE_START'?`${other?.name} 동맹 체결`:e.kind==='ALLIANCE_RENEW'?`${other?.name} 동맹 갱신`:e.kind;
      diplomacy.append(make('div',{class:'muted-line',text:`${year}년 · ${description}`}));
    }
  }
  const calls=w.diplomacy.calls.filter(c=>c.allyId===n.id&&c.status==='PENDING'&&c.expiresDay>w.dayIndex&&w.wars.some(x=>x.id===c.warId));
  if(calls.length){diplomacy.append(make('h3',{text:'동맹군 참전 요청'}));for(const c of calls)diplomacy.append(make('div',{class:'muted-line',text:`${w.nations[c.principalId??c.defenderId].name}의 ${c.side==='attackers'?'공격':'방어'} 지원 요청 · 전쟁 #${c.warId} · ${(c.expiresDay-w.dayIndex)}일 남음 · 직접 조종 시 명령에서 응답` }));}
  const treaties=w.peaceHistory.filter(v=>[...(v.participants?.attackers||[v.attackerId]),...(v.participants?.defenders||[v.defenderId])].includes(n.id)).slice(-5).reverse();
  if(treaties.length){
    diplomacy.append(make('h3',{text:'최근 평화협정'}));
    for(const v of treaties){
      const sides=v.participants||{attackers:[v.attackerId],defenders:[v.defenderId]};
      const names=id=>v.participantNames?.[id]||w.nations[id]?.name||'국가 없음';
      const opponent=sides.attackers.includes(n.id)?sides.defenders:sides.attackers;
      const kinds={WHITE:'백지 평화',LIMITED:'제한적 승리',CLEAR:'명확한 승리',DECISIVE:'결정적 승리'};
      const gained=(v.reparationAwards?.[n.id]||0),landGained=(v.territoryAwards?.[n.id]||0);
      diplomacy.append(make('div',{class:'muted-line',text:`${Math.floor(v.dayIndex/120)+1}년 · 상대 진영 ${opponent.map(names).join('·')} · ${kinds[v.tier]||v.tier}${Number.isFinite(v.advantage)?' · 승점 차 '+Math.abs(v.advantage).toFixed(2)+'점':' · 승점 기록 없음'} · 진영 전체 양도 ${v.acquiredTiles}타일 · 개인 보상 ${landGained}타일 / ${gained} Gold${v.subjectTreaty?' · 종속 조약 '+names(v.subjectTreaty.subjectId)+' → '+names(v.subjectTreaty.overlordId):''}`}));
    }
  }
  const recoverySection=make('section',{class:'overview-section'},[make('h3',{text:'V0.5A · 자원 회복 AI (최근 분기)'})]);
  const recent=n.economicRecovery?.history?.at(-1);
  if(!recent)recoverySection.append(make('div',{class:'muted-line',text:'아직 회복 AI 판단 기록이 없습니다. 다음 AI 분기부터 기록됩니다.'}));
  else{
    const resourceNames={food:'식량',wood:'목재',stone:'석재',iron:'철'};
    const stateNames={SUFFICIENT:'정상',TERRAIN_UNAVAILABLE:'전용 생산시설 입지 없음',NO_LEGAL_CANDIDATE:'합법 시설 후보 없음',COST_OR_AP_BLOCKED:'비용 또는 AP 제약',RECOVERY_AVAILABLE:'회복 후보 실행 가능'};
    recoverySection.append(make('div',{class:'muted-line',text:`진단 ${Math.floor(recent.dayIndex/120)+1}년 ${Math.floor(recent.dayIndex%120/30)+1}분기 · 보관 ${n.economicRecovery.history.length}/12분기 · 선택 ${recent.selected||'회복 시설 외 행동'}${recent.selected?recent.completed?' · 실행 성공':' · 실행 미완료':''}` }));
    for(const [good,g] of Object.entries(recent.goods||{})){
      recoverySection.append(make('div',{class:'muted-line',text:`${resourceNames[good]}: ${stateNames[g.state]||g.state} · 재고 ${number.format(g.stock)} · 생산 ${number.format(g.produced)}${good==='food'?` / 소비 ${number.format(g.consumed)} · 부족 ${number.format(g.deficit)}`:''} · 후보 ${g.legal}/${g.executable} (합법/실행가능) · 예상 최대 증산 +${g.bestGain}/분기${g.state==='TERRAIN_UNAVAILABLE'?' · 지형 확보 또는 교역 필요':''}` }));
    }
  }
  const recoveryDownload=make('button',{class:'jump-button',type:'button',text:'최근 12분기 경제 회복 진단 CSV'});
  recoveryDownload.addEventListener('click',()=>download(`vilob-v05a-economic-recovery-y${timeAt(w.dayIndex).year}.csv`,v05aRecoveryCsv(w),'text/csv;charset=utf-8'));
  recoverySection.append(recoveryDownload);
  const procurement=make('section',{class:'overview-section'},[make('h3',{text:'V0.5B · 건설 자원 조달 AI'})]);
  const cp=n.constructionProcurement,plan=cp?.plan,latest=cp?.history?.at(-1);
  if(plan){
    const cost=getNationActionCost(w,n.id,plan.action);
    const shortage=cost?V05B_BUILD_GOODS.map(g=>`${RESOURCE_LABELS[g]} ${Math.max(0,(cost.resources[g]||0)-(n.resources[g]||0))}`).filter(x=>!x.endsWith(' 0')).join(' · '):'계획 재검토 필요';
    procurement.append(make('div',{class:'muted-line',text:`현재 계획: ${plan.action.type} · 시설 ${plan.action.buildingId??plan.action.buildingType??'-'} · 부족 ${shortage||'조달 완료'}`}));
  }else procurement.append(make('div',{class:'muted-line',text:'현재 등록된 조달 계획 없음'}));
  if(latest)procurement.append(make('div',{class:'muted-line',text:`최근 분기 ${latest.status} · 실제 수입 ${V05B_BUILD_GOODS.map(g=>RESOURCE_LABELS[g]+' '+latest.imported[g]).join(' · ')} · 조달 수입액 ${number.format(latest.importGold)} Gold · 기록 ${cp.history.length}/12분기`}));
  const procurementDownload=make('button',{class:'jump-button',type:'button',text:'최근 12분기 건설 자원 조달 CSV'});
  procurementDownload.addEventListener('click',()=>download(`vilob-v05b-procurement-y${timeAt(w.dayIndex).year}.csv`,v05bProcurementCsv(w),'text/csv;charset=utf-8'));
  procurement.append(procurementDownload);
  const e3e3Signal=e3e3WoodSignal(w,n),e3e3Wood=e3e3EnsureSupply(n),e3e3Last=e3e3Wood.history.at(-1);
  const supplyPanel=make('section',{class:'overview-section'},[make('h3',{text:'V0.7E3E3 · 목재 공급·간접 운송'})]);
  supplyPanel.append(make('div',{class:'muted-line',text:`목재 재고 ${number.format(n.resources.wood)} · 분기 생산 ${number.format(e3e3Signal.produced)} · 예상 소모 ${number.format(e3e3Signal.estimatedUse)} · 4분기 예상 잔량 ${number.format(e3e3Signal.forecastFourQuarters)} · ${e3e3Signal.needed?'공급 회복 필요':'공급 양호'}`}),
   make('div',{class:'muted-line',text:`재개발: ${e3e3Wood.lastRecovery?.state||'진단 대기'} · 후보 ${e3e3Wood.lastRecovery?.candidateCount||0}개 · 관측 ${e3e3Signal.observedQuarters}/4분기 (${e3e3Signal.confidence}) · 임시 산림 작업 ${e3e3Wood.f1b?.lastQuarter?.sites||0}곳 / 목재 +${e3e3Wood.f1b?.lastQuarter?.produced||0} · 인쇄/공방 비축 보류 ${e3e3Wood.f1b?.lastQuarter?.printingDeferred||0}/${e3e3Wood.f1b?.lastQuarter?.workshopDeferred||0}`}),
   make('div',{class:'muted-line',text:`간접 수입 ${number.format(e3e3Last?.importUsed||0)}/${number.format(e3e3IndirectLimit(w,n.id))} 화물 · 간접 수출 ${number.format(e3e3Last?.exportUsed||0)}/${number.format(e3e3IndirectLimit(w,n.id))} 화물 · 최근 목재 구매 ${number.format(e3e3Last?.woodImported||0)} / 판매 ${number.format(e3e3Last?.woodExported||0)} · 건설 자재 지출 ${number.format(e3e3Last?.woodBuildingUsed||0)}` }));
  const demographyPanel=e3e2NationDemographyPanel(w,n);
  const tabs=[['overview','개요·경제'],['freight','산업·동력망'],['governance','정책'],['strategy','지정학 전략'],['research','기술'],['projects','국가 프로젝트'],['diplomacy','외교'],['settlements','정착지'],['culture','사회·문화'],['military','군사'],['adaptation','AI 적응']];
  if(!tabs.some(([id])=>id===app.nationSubtab))app.nationSubtab='overview';
  const tabBar=make('div',{class:'nation-subtabs',role:'tablist','aria-label':n.name+' 세부 정보'});
  const panels={freight:[i3aPanel(w,n),i2Panel(w,n),i1Panel(w,n),iPanel(w,n)],overview:[grid,leadership,demographyPanel,trading,supplyPanel,c3development,recoverySection,procurement],governance:[],strategy:[strategic],research:[research,c3development],projects:[kProjectsPanel(w,n)],diplomacy:[diplomacy],settlements:[places]};
  if(app.nationSubtab==='governance')panels.governance=[e1GovernancePanel(w,n)];
  if(app.nationSubtab==='culture')panels.culture=[d1bNationPanel(w,n),d2aNationPanel(w,n),d2bNationPanel(w,n),d2MakeNationCulturePanel(w,n)];
  if(app.nationSubtab==='military')panels.military=[makeNationMilitaryPanel(w,n)];
  if(app.nationSubtab==='adaptation')panels.adaptation=[d1dNationPanel(w,n)];
  const content=make('div',{class:'nation-subtab-content',id:'nationSubtabContent',role:'tabpanel','aria-label':tabs.find(([id])=>id===app.nationSubtab)[1]},panels[app.nationSubtab]);
  for(const [id,label] of tabs){
    const selected=id===app.nationSubtab;
    const btn=make('button',{class:'nation-subtab'+(selected?' selected':''),type:'button',role:'tab','aria-selected':String(selected),tabindex:selected?'0':'-1',text:label});
    btn.addEventListener('click',()=>{if(app.nationSubtab!==id){app.nationSubtab=id;renderNationOverview();}});
    btn.addEventListener('keydown',event=>{
      if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
      event.preventDefault();const index=tabs.findIndex(([key])=>key===id);
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      app.nationSubtab=tabs[next][0];renderNationOverview();
      $('nationOverview').querySelectorAll('[role=tab]')[next]?.focus();
    });
    tabBar.append(btn);
  }
  box.replaceChildren(top,jump,tabBar,content);
  for(const [i,el] of [...content.querySelectorAll('details')].entries()){
    const key=el.id||String(i);if(expandedByKey.has(key))el.open=expandedByKey.get(key);
  }
  const neighbors=box.querySelector('.strategy-neighbors');
  if(neighbors)neighbors.scrollTop=neighborScroll;
  const tabStrip=box.querySelector('.nation-subtabs');
  if(tabStrip)tabStrip.scrollLeft=tabScroll;
  app.lastNationPanelId=n.id;app.lastNationPanelSubtab=app.nationSubtab;
}
function renderWarHistory(){
  const list=$('warHistoryList'),counter=$('warHistoryCount'),pager=$('warHistoryPager');
  if(!list||!pager||!app.world)return;
  const w=app.world,history=(w.warHistory||[]).slice().reverse(),pageSize=5;
  counter.textContent=history.length+'건';
  const pages=Math.max(1,Math.ceil(history.length/pageSize));
  app.warHistoryPage=Math.max(1,Math.min(pages,app.warHistoryPage||1));
  const page=app.warHistoryPage;
  const recordSignature=h=>[h.id,h.endedDay,h.tier,h.winnerId,h.advantage??'legacy',h.reparations,h.acquiredTiles].join(':');
  const historyKey=`${w.seed}|${page}|${history.map(recordSignature).join('|')}|${w.nations.map(n=>n.name).join(',')}`;
  if(list.dataset.historyKey===historyKey)return;
  const verdict={WHITE:'백지 평화',LIMITED:'제한적 승리',CLEAR:'명확한 승리',DECISIVE:'결정적 승리'};
  const fmt=n=>number.format(Number(n)||0);
  const textField=(label,value)=>make('div',{class:'war-stat-cell'},[make('small',{text:label}),make('strong',{text:String(value)})]);
  const notes=(label,value)=>make('div',{class:'war-history-note'},[make('span',{text:label}),make('span',{text:String(value)})]);
  const visible=history.slice((page-1)*pageSize,page*pageSize);
  const entries=visible.map(h=>{
    const A=w.nations[h.attackerId],B=w.nations[h.defenderId],a=h.attackerId,b=h.defenderId;
    const Aname=h.attackerName||A?.name||'공격국',Bname=h.defenderName||B?.name||'수비국';
    const sides=h.participants||{attackers:[a],defenders:[b]};
    const allMembers=[...new Set([...sides.attackers,...sides.defenders])];
    const historicalNationName=id=>h.participantNames?.[id]||(id===a?Aname:id===b?Bname:w.nations[id]?.name||'국가 없음');
    const attackersLabel=sides.attackers.map(historicalNationName).join(' · ');
    const defendersLabel=sides.defenders.map(historicalNationName).join(' · ');
    const winner=h.winnerId===null||h.winnerId===undefined?null:historicalNationName(h.winnerId);
    const loser=h.winnerId===a?Bname:h.winnerId===b?Aname:null;
    const advantage=Number.isFinite(h.advantage)?h.advantage:null;
    const scoreLabel=advantage===null?'최종 승점 미기록':`승점 격차 ${Math.abs(advantage).toFixed(2)}점`;
    const duration=h.endedDay-h.startedDay;
    const casualtiesA=sides.attackers.reduce((sum,id)=>sum+(h.casualties?.[id]||0),0);
    const casualtiesB=sides.defenders.reduce((sum,id)=>sum+(h.casualties?.[id]||0),0);
    const lossMax=Math.max(1,...allMembers.map(id=>h.casualties?.[id]||0));
    const money=h.reparations||0,land=h.acquiredTiles||0;
    const wrap=make('details',{class:'war-history-entry','data-war-id':String(h.id),'data-record-key':recordSignature(h)});
    const summary=make('summary',{class:'war-history-summary'},[
      make('div',{class:'war-history-summary-main'},[
        make('div',{class:'war-history-names'},[
          make('span',{class:'compare-dot',style:{background:A?.color||'#d18a69'}}),make('strong',{text:attackersLabel}),
          make('span',{class:'war-versus',text:'공격  VS  수비'}),
          make('span',{class:'compare-dot',style:{background:B?.color||'#65a7ae'}}),make('strong',{text:defendersLabel})]),
        make('span',{class:'war-history-period',text:`${Math.floor(h.startedDay/120)+1}년 → ${Math.floor(h.endedDay/120)+1}년 · ${fmt(duration)}일`})]),
      make('div',{class:'war-history-summary-result'},[
        make('strong',{class:'war-tier war-tier-'+h.tier.toLowerCase(),text:verdict[h.tier]||h.tier}),
        make('span',{text:winner?`${winner} 승리`:'승패 없음'}),
        make('small',{text:scoreLabel})]),
      make('span',{class:'war-history-chevron','aria-hidden':'true',text:'⌄'})]);
    wrap.append(summary);
    const body=make('div',{class:'war-history-details'});
    const headline=make('div',{class:'war-result-hero'},[
      make('div',{class:'war-result-hero-title',text:winner?`${winner} 승리${loser?' · '+loser+' 패배':''}`:'백지 평화'}),
      make('div',{class:'war-result-hero-subtitle',text:verdict[h.tier]||h.tier}),
      make('div',{class:'war-result-score',text:advantage===null?'기존 기록 · 최종 승점 없음':`승점 격차 ${Math.abs(advantage).toFixed(2)}점`}),
      make('small',{text:advantage===null?`기존 전황 점수 ${Number(h.score||0).toFixed(1)}점 (최종 승점 아님)`:`공격국 기준 최종 승점 ${(advantage>=0?'+':'')+advantage.toFixed(2)}점`})]);
    body.append(headline);
    const overview=make('div',{class:'war-summary-metrics'},[
      textField('전쟁 기간',fmt(duration)+'일'),
      textField('총 교전',fmt(h.battles)+'회'),
      textField('점령 완료',fmt(h.occupationCount)+'회'),
      textField('실제 영토 양도',fmt(land)+'타일')]);
    body.append(overview);
    const battle=make('section',{class:'war-detail-section'},[
      make('h4',{text:'⚔ 전투 결과 및 인명 손실'}),
      make('div',{class:'war-loss-rows'},allMembers.map(id=>[id,historicalNationName(id),w.nations[id]?.color,h.casualties?.[id]||0]).map(([id,name,color,loss])=>make('div',{class:'war-loss-row'},[
        make('div',{class:'war-loss-head'},[make('strong',{text:name}),make('span',{text:`${fmt(loss)}명 손실 · 교전 ${fmt(h.battleWins?.[id]||0)}승`})]),
        make('div',{class:'war-loss-track'},[make('span',{style:{width:(loss/lossMax*100).toFixed(2)+'%',background:color||'#83b7b3'}})]),
        make('small',{text:`교전 ${fmt(h.battleCasualties?.[id])} (패주 ${fmt(h.pursuitCasualties?.[id])} 포함) · 지역 공격 ${fmt(h.occupationCasualties?.[id])} · 고립 ${fmt(h.supplyCasualties?.[id])}`})])))]);
    if(h.surrendered)battle.append(notes('항복·포로 (손실과 별도)',allMembers.map(id=>`${historicalNationName(id)} ${fmt(h.surrendered[id])}명`).join(' / ')));
    body.append(battle);
    const shares=h.contributionShares?.[h.winningSide]||{};
    const contributions=make('section',{class:'war-detail-section'},[
      make('h4',{text:'▣ 참전국별 기여·보상'}),
      make('div',{class:'war-history-muted',text:`공격 진영: ${attackersLabel}  /  방어 진영: ${defendersLabel}`})
    ]);
    for(const id of allMembers){
      const earned=h.reparationAwards?.[id]||0,awarded=h.territoryAwards?.[id]||0;
      const side=sides.attackers.includes(id)?'공격':'방어';
      const contribution=h.contributionShares?.[side==='공격'?'attackers':'defenders']?.[id];
      const cells=[textField('기여도',contribution===undefined?'미기록':(contribution*100).toFixed(1)+'%'),
        textField('점령 작업량',Number(h.occupationWork?.[id]||0).toFixed(1)),
        textField('점령 완료',fmt(h.occupationContributions?.[id])+'회'),
        textField('배상 수령',fmt(earned)+' G'),textField('획득 영토',fmt(awarded)+'타일')];
      contributions.append(make('div',{class:'war-history-note'},[make('strong',{text:`${historicalNationName(id)} · ${side}${id===a||id===b?' 대표':' 지원'}`}),make('span',{text:`${fmt(h.battleWins?.[id])}승 · 군사비 ${fmt(h.militaryCosts?.[id])} G`})]));
      contributions.append(make('div',{class:'war-history-treaty-grid'},cells));
    }
    body.append(contributions);
    const landSection=make('section',{class:'war-detail-section'},[
      make('h4',{text:'▦ 점령지와 영토 양도'}),
      make('div',{class:'war-history-treaty-grid'},[
        textField('종전 직전 점령',h.occupiedAtPeace===undefined?'기록 없음':fmt(h.occupiedAtPeace)+'타일'),
        textField('양도 가능 후보',h.connectedCandidateTiles===undefined?'기록 없음':fmt(h.connectedCandidateTiles)+'타일'),
        textField('실제 양도',fmt(land)+'타일'),
        textField('협정 상한',h.cessionLimit===undefined?'기록 없음':fmt(h.cessionLimit)+'타일')]),
      make('div',{class:'war-history-muted',text:`전쟁 목표: ${h.goal?.type==='SETTLEMENT'?'정착지 확보':'국경 확보'} · 정착지 부분 점령 ${fmt(h.partialSettlementTiles)}타일 · 불연결 ${fmt(h.disconnectedTiles)}타일 · 상한/선정 ${fmt(h.blockedByCap)}타일`})]);
    body.append(landSection);
    const goldSection=make('section',{class:'war-detail-section'},[
      make('h4',{text:'◈ 배상금과 군사비'}),
      make('div',{class:'war-money-hero'},[
        make('strong',{text:fmt(money)+' Gold'}),
        make('span',{text:h.reparationsFromId!==null&&h.reparationsFromId!==undefined?historicalNationName(h.reparationsFromId)+' → '+Object.entries(h.reparationAwards||{[h.reparationsToId]:h.reparations}).filter(([,v])=>v>0).map(([id,v])=>historicalNationName(Number(id))+' '+fmt(v)+' G').join(' · '):'배상금 이전 없음'})]),
      make('div',{class:'war-history-treaty-grid'},[
        textField('공격 진영 군사비',fmt(sides.attackers.reduce((sum,id)=>sum+(h.militaryCosts?.[id]||0),0))+' G'),
        textField('방어 진영 군사비',fmt(sides.defenders.reduce((sum,id)=>sum+(h.militaryCosts?.[id]||0),0))+' G')]),
      make('div',{class:'war-history-muted',text:'군사비 세부 · '+allMembers.map(id=>`${historicalNationName(id)}: 유지 ${fmt(h.upkeepCosts?.[id])} / 작전 ${fmt(h.operationalCosts?.[id])} G`).join(' · ')})]);
    if(h.reparationRate!==undefined){
      const reparation=h.reparationModel==='v03c'
        ?`V0.3C 기준 · 승전국 전쟁비용 ${fmt(h.warCost)} G → 등급 기준 ${fmt(h.costBase)} G · 수입 상한 ${fmt(h.incomeCap)} G · 국고 상한 ${fmt(h.treasuryCap)} G · 요구 강도 ${(h.reparationRate*100).toFixed(0)}%`
        :`기존 배상 기준 · 승전국 국고 ${fmt(h.winnerGoldAtOffer)} G × ${(h.reparationRate*100).toFixed(0)}% = 요구 ${fmt(h.demandedGold)} G · 패전국 체결 국고 ${fmt(h.loserGoldAtTreaty)} G × ${((h.reparationCapRate||0)*100).toFixed(0)}% = 상한 ${fmt(h.capGold)} G`;
      goldSection.append(make('div',{class:'war-history-muted',text:reparation}));
    }
    body.append(goldSection,make('div',{class:'war-history-final',text:`${verdict[h.tier]||h.tier} · 휴전 ${fmt(h.truceDays)}일 · 영토 ${fmt(land)}타일 · 배상 ${fmt(money)} Gold`}));
    wrap.append(body);return wrap;
  });
  // Reuse visible details nodes if the history has not changed; prevent blink/closed cards.
  const existing=new Map([...list.querySelectorAll('details[data-war-id]')].map(node=>[node.dataset.warId,node]));
  list.replaceChildren(...(entries.length?entries.map(node=>{
    const old=existing.get(node.dataset.warId);
    if(old?.dataset.recordKey===node.dataset.recordKey)return old;
    if(old?.open)node.open=true;
    return node;
  }):[make('div',{class:'war-empty',text:'아직 종결된 전쟁이 없습니다.'})]));
  const prev=make('button',{type:'button',class:'war-page-button',text:'← 이전'});prev.disabled=page===1;
  const next=make('button',{type:'button',class:'war-page-button',text:'다음 →'});next.disabled=page===pages;
  const status=make('span',{class:'war-page-status',text:`${page} / ${pages} 페이지 · ${history.length?((page-1)*5+1)+'–'+Math.min(page*5,history.length):'0'} / ${history.length}건`});
  prev.addEventListener('click',()=>{if(app.warHistoryPage>1){app.warHistoryPage--;list.dataset.historyKey='';renderWarHistory();}});
  next.addEventListener('click',()=>{if(app.warHistoryPage<pages){app.warHistoryPage++;list.dataset.historyKey='';renderWarHistory();}});
  pager.replaceChildren(prev,status,next);
  list.dataset.historyKey=historyKey;
}

function renderMilitaryRoster(){
  const box=$('armyRoster');if(!box||!app.world)return;
  const w=app.world;const sorted=[...w.armies].sort((a,b)=>a.nationId-b.nationId||a.id-b.id);
  $('armyRosterCount').textContent=sorted.length+'개';
  const cards=sorted.map(a=>{
    const n=w.nations[a.nationId],cmd=w.characters.find(c=>c.id===a.commanderId),
      card=make('div',{class:'army-detail'});
    card.append(make('strong',{text:`⚔ ${n.name} 제${a.id+1}군 · 인간 ${manpower(a)}명 · 오토마톤 ${hCount(w,a,true)}기`}),
      make('small',{text:`전투력 ${getArmyBasePower(w,a)} · 사기 ${Math.round(a.morale)} · 장비 ${v07cArmyVisual([a]).era} · 주력 ${(UNIT_TYPES[v07cArmyVisual([a]).type]?.label||(v07cArmyVisual([a]).type==='assault_tank'?'돌격전차':'혼성군'))} · 사령관 ${cmd?.name||'없음'} · ${b4aRankLabel(a)} ${a.formationExperience?.xp||0}XP (+${(b4aPowerBonus(a)*100).toFixed(1)}%)`}),
      make('small',{text:`전열 인간 ${lineCount(a,'front')}명/기계 ${hPositionQty(w,a,'front')}대 · 후열 인간 ${lineCount(a,'rear')}명/기계 ${hPositionQty(w,a,'rear')}대 · 후방 ${lineCount(a,'back')} · 예비 ${lineCount(a,'reserve')} · ${a.status==='TRAPPED'?'포위':a.status} · 보급 ${armySupplyLabel(a)} · ${a.operation?.type||'대기'}`}));
    if(a.assignedWarId!==null){
      const reason={LAND_REACHABLE:'접근 가능한 전선',NO_ACCESSIBLE_WAR:'육로 전선 없음',SINGLE_WAR:'단일 전쟁'};
      const why=a.g2aOrderStatus==='NO_REACHABLE_TARGET'?' · 도달 가능한 목표 없음':
        a.g2aOrderStatus==='AP_SHORTAGE'?' · 명령 AP 부족':a.g2aOrderStatus==='RECOVERING'?' · 사기·병력 재편 중':
        a.g2aOrderStatus==='TRAINING'?' · 전문훈련 중':'';
      card.append(make('small',{text:`C6 전쟁 #${a.assignedWarId+1} · ${reason[a.c6FrontDecision?.reason]||'전선 배정'}${why}`}));
    }
    if(a.f3fRout&&!armyOffensiveReady(w,a))card.append(make('small',{text:manpower(a)>0?`패전 후 출동 제한 · 사기 ${Math.round(a.morale)}/${F3F_RALLY_MORALE} · 병력 ${manpower(a)}/${a.f3fRout.minimumMen}명 · 본국 방어/증원 가능`:`기계 부대 패전 후 출동 제한 · 사기 ${Math.round(a.morale)}/${F3F_RALLY_MORALE} · 오토마톤 ${hCount(w,a,true)}대 · 본국 방어/정비 가능`}));
    if(v08fTanks(w,a).length){const ts=v08fTanks(w,a);card.append(make('small',{text:`V0.8F 기갑 · 전차 ${ts.length}대 / 가동 ${v08fAlive(w,a).length}대 · `+ts.map(t=>`#${t.id} HP ${t.hp}/100, 승무원 ${v08fCrew(a,t)?.manpower||0}/6, ${t.fueled?'연료 정상':'연료 부족'}`).join(' · ')}));}
    if(n.controller==='PLAYER'){
      const controls=make('div',{class:'military-meta'});
      const actions=[{type:'TANK_DEPLOY',armyId:a.id},...v08fTanks(w,a).flatMap(t=>[{type:'TANK_REPAIR',armyId:a.id,tankId:t.id},{type:'TANK_CREW',armyId:a.id,tankId:t.id},{type:'TANK_STORE',armyId:a.id,tankId:t.id}])];
      for(const action of actions){if(!canExecuteNationAction(w,n.id,action))continue;
        const names={TANK_DEPLOY:'전차 배치',TANK_REPAIR:'전차 수리',TANK_CREW:'승무원 보충',TANK_STORE:'전차 회수'};
        const button=make('button',{class:'jump-button',type:'button',text:names[action.type]+(action.tankId?' #'+action.tankId:'')});
        button.addEventListener('click',()=>{const r=executeNationAction(w,n.id,action);showToast(r.ok?'기갑 행동 완료':r.reason);refreshPlayerUI();});controls.append(button);
      }card.append(controls);
    }
    const types=make('div',{class:'military-meta'});
    const positionNames={front:'전열',rear:'후열',back:'후방',reserve:'예비'};
    const positionByGroup=new Map(Object.entries(a.deployment).flatMap(([role,ids])=>ids.map(id=>[id,positionNames[role]||role])));
    for(const u of a.units.filter(u=>u.manpower))types.append(make('span',{class:'unit-pill',text:`${UNIT_TYPES[u.typeId]?.label||u.typeId} (${positionByGroup.get(u.id)||'미배치'}) ${u.manpower}명 · 준비 ${c3ReadyMen(u)} / 훈련 ${c3PendingMen(u)} (${u.training??100}%)` }));
    const jump=make('button',{class:'jump-button',type:'button',text:'▦ 지도에서 보기'});jump.addEventListener('click',()=>{goToMap(a.tileId);map.focusArmy(a.id);});
    const crew=d2CultureCollect(a.units.map(u=>u.culturePopulation));
    card.append(types,d2MakeCultureDetails(w,crew,'부대 문화별 현역 인원'),d1cArmyDetails(w,a),jump);return card;
  });
  const countryCards=w.nations.filter(n=>n.active).map(n=>{
    const b=v04eBarracksEffects(w,n.id),men=activeManpower(w,n.id),target=militaryStrengthTarget(w,n.id),capacity=militaryCapacity(w,n.id);
    const panel=make('div',{class:'army-detail'},[make('strong',{text:`${n.name} · 동원 체계`}),
      make('small',{text:`현역 ${number.format(men)}명 / 목표 ${number.format(target)}명 / 동원 상한 ${number.format(capacity)}명 · 목표 달성 ${target?Math.round(men/target*100):0}%`}),
      make('small',{text:`병영 가동 ${b.paid}/${b.built}채 · 건설 중 ${b.constructing}채 · 전환 예약 ${b.pending}채 · 한도 초과 ${b.overLimit}채 · 분기 훈련 ${trainingRate(w,n.id)}명 · 편제 ${ownArmyCount(w,n.id)}/${armyLimit(w,n.id)}개 · 투자 성향 ${w.aiProfiles[n.aiProfileId]?.military?.militaryInvestment??50}`}),
      make('small',{text:`병영 유지비 최근 분기 ${n.military.barracksFinance.paidLastQuarter}/${n.military.barracksFinance.billedLastQuarter} Gold · 미납 ${n.military.barracksFinance.unpaidLastQuarter} Gold · 초과 병영은 보존하되 운영하지 않음 (시설 재개발로 교체 가능)`})]);
    if(hasTech(w,n.id,'armored_combat_doctrine')){const s=v08fEnsure(w);panel.append(make('small',{text:`V0.8F 전차 제작 누계 ${s.produced}대 · 국가 창고 ${s.stocks[n.id]||0}대 · 전투 배치 ${v08fNationVehicles(w,n.id)}대 · 세계 격파 ${s.destroyed}대`}));}
    if(n.controller==='PLAYER'&&canExecuteNationAction(w,n.id,{type:'TANK_BUILD'})){const button=make('button',{class:'jump-button',type:'button',text:'궤도식 돌격전차 제작 (950 Gold)'});button.addEventListener('click',()=>{const r=executeNationAction(w,n.id,{type:'TANK_BUILD'});showToast(r.ok?'돌격전차 제작 완료':r.reason);refreshPlayerUI();});panel.append(button);}
    return panel;
  });
  box.replaceChildren(make('h3',{text:'국가별 동원 체계'}),...countryCards,make('h3',{text:'군대 명부'}),...(cards.length?cards:[make('div',{class:'war-empty',text:'아직 편성된 군대가 없습니다.'})]));
}
// V0.4E: current-world analytics only. No SIM mutation or RNG calls.
const V04C_STAT_GROUPS=Object.freeze([
  {id:'population',title:'인구·영토',icon:'♟',metrics:[['population','총인구','명','현재 정착지의 주민 합계'],['territory','소유 영토','타일','국가가 소유한 육지 타일 수'],['settlements','정착지 수','개','현재 국가가 소유한 정착지'],['density','타일당 인구','명/타일','총인구 ÷ 소유 육지 타일'],['avgPopulation','평균 정착지 인구','명','총인구 ÷ 정착지 수']]},
  {id:'economy',title:'경제',icon:'◈',metrics:[['gold','보유 Gold','G','현재 국고 보유량'],['projectedNet','예상 분기 재정수지','G','현재 조건의 예상 세입 − 군사 유지비 − 민간 유지비 · 전망치이며 교역·작전비·지식 교류 등 변동액은 제외'],['food','식량 재고','개','국가 공공 식량 재고'],['quarterExports','최근 분기 수출액','G','최근 분기 교역 수출 누적액 · 전체 역사 누적과 별개'],['quarterImports','최근 분기 수입액','G','최근 분기 교역 수입 누적액'],['tradeBalance','최근 분기 교역수지','G','최근 분기 수출액 − 수입액'],['exports','누적 수출액','G','게임 시작 이후 누적 수출액'],['imports','누적 수입액','G','게임 시작 이후 누적 수입액'],['exchangeSpend','최근 분기 지식 교류 지출','G','선진 인접 국가에게 지불하고 소모된 실제 추가 연구 비용'],['exchangeEarned','최근 분기 지식 교류 수령','G','선진 국가로서 후진 인접 국가의 연구 교류를 제공해 수령한 Gold']]},
  {id:'military',title:'군사',icon:'⚔',metrics:[['military','기초 군사력','','실제 부대의 기본 전투력 합계 · 지형·교전 보정 제외'],['troops','현역 병력','명','현재 배치한 부대 인원 합계'],['reserve','훈련된 예비병','명','국가의 동원 가능한 훈련 완료 예비병'],['mobilization','현역 병력 비율','%','현역 병력 ÷ 군사 인구(민간인·현역·예비병·훈련병)'],['militaryUpkeep','예상 분기 군 유지비','G','현 부대 위치·전쟁 상태 기준 예상 유지비 · 전망치'],['barracks','운영 병영','채','운영비 납부 및 접근 조건을 충족한 병영'],['mobilizationCap','동원 상한','명','군사 성향·기술·병영에 따른 최대 동원 인원'],['militaryTarget','AI 목표 병력','명','군사 투자 성향·동원 상한·편제 수를 반영한 목표'],['targetFulfillment','목표 병력 달성률','%','현역 ÷ 목표 병력'],['trainingCapacity','분기 훈련 상한','명','기본 훈련 상한과 운영 병영의 증가분'],['militaryInvestment','군사 투자 성향','','AI 프로필 군사 투자 값']]},
  {id:'civilization',title:'기술·문명',icon:'✦',metrics:[['era','현재 문명 시대','단계','고대 1 · 중세 I~IV 2~5 · 근세 I~IV 6~9 · 산업 근대 I~III 10~12 · 미래 13 (미개방)'],['technologies','완료한 기술','개','국가가 연구 완료한 기술 개수'],['knowledge','Knowledge','K','현재 국가가 보유한 지식 자원'],['researchLevel','연구 수준','','국가 연구 수준 수치']]},
  {id:'infrastructure',title:'정착지·인프라',icon:'⌂',metrics:[['buildings','가동 시설 수','개','소유 영토의 ACTIVE·연결된 시설 수 · 요새 제외'],['buildingLevel','가동 시설 평균 레벨','Lv','가동 시설의 평균 레벨'],['roads','도로 보유 타일','타일','국가 소유 타일 중 도로 레벨 1 이상'],['development','평균 정착지 발전도','','정착지 development의 산술 평균'],['laborUtilization','시설 노동 충족률','%','생산 시설 노동 수요 대비 투입 가능한 노동자 · 수요가 없는 경우 100%']]}]);
const V04C_METRIC_LOOKUP=Object.fromEntries(V04C_STAT_GROUPS.flatMap(g=>g.metrics.map(m=>[m[0],{key:m[0],title:m[1],unit:m[2],help:m[3],group:g.id}])));
// V0.7B: subdivisions now include the playable medieval IV stage.
const V04C_STAGE_BUCKETS=Object.freeze([
  {id:'ancient',label:'고대',color:V04C_ERA_COLORS.ancient},
  {id:'medieval_1',label:'중세 I',color:'#89ACCF'},
  {id:'medieval_2',label:'중세 II',color:'#729FCD'},
  {id:'medieval_3',label:'중세 III',color:'#5687BA'},
  {id:'medieval_4',label:'중세 IV',color:'#3E6C9E'},
  {id:'early_modern_1',label:'근세 I',color:V04C_ERA_COLORS.early_modern},
  {id:'early_modern_2',label:'근세 II',color:'#CAB77C'},
  {id:'early_modern_3',label:'근세 III',color:'#CBAE82'},{id:'early_modern_4',label:'근세 IV',color:'#D4B28E'},
  {id:'industrial_modern_1',label:'산업 근대 I',color:'#B78A58'},
  {id:'industrial_modern_2',label:'산업 근대 II',color:'#CB985E'},
  {id:'industrial_modern_3',label:'산업 근대 III',color:'#D9AD7C'},
  {id:'industrial_modern_4',label:'산업 근대 IV',color:'#E6C89F'},
  {id:'future',label:'미래',color:V04C_ERA_COLORS.future,planned:true}
]);
function v04cStageBucket(n){
  const era=n?.civilization?.era||'ancient';
  if(era==='early_modern')return 'early_modern_'+Math.min(4,n.civilization?.stage||1);
  if(era==='industrial_modern')return 'industrial_modern_'+Math.max(1,Math.min(4,n.civilization?.stage||1));
  if(era!=='medieval')return era;
  const stage=n.civilization.stage;
  return 'medieval_'+(Number.isInteger(stage)&&stage>=1&&stage<=4?stage:1);
}
function v04cStageOrder(n){
  const key=v04cStageBucket(n),index=V04C_STAGE_BUCKETS.findIndex(b=>b.id===key);
  return index<0?1:index+1;
}
function v04cStatsSnapshot(){
  const w=app.world,cache=app.v04cStatsCache;
  if(cache&&cache.world===w&&cache.day===w.dayIndex&&cache.seq===w.changeSeq&&cache.buildings===w.buildings.length&&cache.armies===w.armies.length)return cache;
  const rows=w.nations.map(n=>({n,population:0,territory:0,settlements:0,development:0,buildings:0,buildingLevels:0,roads:0,troops:0,military:0}));
  for(const t of w.tiles)if(t.ownerId!==null&&rows[t.ownerId]){
    const r=rows[t.ownerId];if(t.terrain!=='water')r.territory++;if(t.roadLevel>0)r.roads++;
  }
  for(const t of w.settlements)if(rows[t.ownerId]){const r=rows[t.ownerId];r.population+=t.population;r.settlements++;r.development+=t.development;}
  for(const b of w.buildings){const id=w.tiles[b.tileId]?.ownerId;if(rows[id]&&b.status==='ACTIVE'&&!b.disconnected){rows[id].buildings++;rows[id].buildingLevels+=b.level||1;}}
  for(const a of w.armies)if(rows[a.nationId]){const r=rows[a.nationId];r.troops+=manpower(a);r.military+=getArmyBasePower(w,a);}
  const snap={world:w,day:w.dayIndex,seq:w.changeSeq,buildings:w.buildings.length,armies:w.armies.length,rows,projections:new Map()};
  app.v04cStatsCache=snap;return snap;
}
function v04cProjection(snap,id){
  if(!snap.projections.has(id))snap.projections.set(id,projectedQuarter(snap.world,snap.world.nations[id]));
  return snap.projections.get(id);
}
function v04cMetricValue(snap,r,key){
  const n=r.n;
  switch(key){
    case 'population':return r.population;
    case 'territory':return r.territory;
    case 'settlements':return r.settlements;
    case 'density':return r.territory?r.population/r.territory:0;
    case 'avgPopulation':return r.settlements?r.population/r.settlements:0;
    case 'gold':return n.gold;
    case 'projectedNet':{const q=v04cProjection(snap,n.id);return q.goldIncome-q.upkeep-q.civil.total;}
    case 'food':return n.resources.food;
    case 'quarterExports':return n.trade?.quarterExportValue||0;
    case 'quarterImports':return n.trade?.quarterImportValue||0;
    case 'tradeBalance':return (n.trade?.quarterExportValue||0)-(n.trade?.quarterImportValue||0);
    case 'exports':return n.trade?.exportValue||0;
    case 'imports':return n.trade?.importValue||0;
    case 'exchangeSpend':return n.knowledgeExchange?.lastQuarter?.goldSpent||0;
    case 'exchangeEarned':return snap.world.nations.reduce((sum,other)=>sum+(other.knowledgeExchange?.lastQuarter?.partnerId===n.id?other.knowledgeExchange.lastQuarter.goldReceived:0),0);
    case 'military':return r.military;
    case 'troops':return r.troops;
    case 'reserve':return n.military?.reserveReady||0;
    case 'mobilization':{const total=militaryPopulation(snap.world,n.id);return total?100*r.troops/total:0;}
    case 'militaryUpkeep':return militaryUpkeep(snap.world,n.id);
    case 'barracks':return v04eBarracksEffects(snap.world,n.id).paid;
    case 'mobilizationCap':return militaryCapacity(snap.world,n.id);
    case 'militaryTarget':return militaryStrengthTarget(snap.world,n.id);
    case 'targetFulfillment':{const t=militaryStrengthTarget(snap.world,n.id);return t?100*r.troops/t:0;}
    case 'trainingCapacity':return trainingRate(snap.world,n.id);
    case 'militaryInvestment':return snap.world.aiProfiles[n.aiProfileId]?.military?.militaryInvestment??50;
    case 'era':return v04cStageOrder(n);
    case 'technologies':return n.technology?.unlocked?.length||0;
    case 'knowledge':return n.knowledge;
    case 'researchLevel':return n.researchLevel;
    case 'buildings':return r.buildings;
    case 'buildingLevel':return r.buildings?r.buildingLevels/r.buildings:0;
    case 'roads':return r.roads;
    case 'development':return r.settlements?r.development/r.settlements:0;
    case 'laborUtilization':{
      const towns=v04cProjection(snap,n.id).regionalEconomy.towns;
      let demand=0,covered=0;
      for(const local of towns.values()){demand+=local.demand;covered+=Math.min(local.workers,local.demand);}
      return demand?100*covered/demand:100;
    }
    default:return 0;
  }
}
function v04cFormat(value,metric){
  if(metric.key==='era')return V04C_STAGE_BUCKETS[Math.max(0,Math.min(V04C_STAGE_BUCKETS.length-1,value-1))]?.label||'고대';
  const n=Number(value)||0;const str=Number.isInteger(n)?number.format(n):n.toLocaleString('ko-KR',{maximumFractionDigits:2});
  return str+(metric.unit?` ${metric.unit}`:'');
}
function renderComparisons(){
  const target=$('comparisonRows');if(!target||!app.world||app.activeTab!=='statistics')return;
  const snap=v04cStatsSnapshot(),metric=V04C_METRIC_LOOKUP[app.comparisonMetric]||V04C_METRIC_LOOKUP.population;
  const filter=app.v04cNationFilter||'all';
  let values=snap.rows.filter(r=>filter==='all'||filter==='active'&&r.n.active||filter===String(r.n.id)).map(r=>({...r,value:v04cMetricValue(snap,r,metric.key)}));
  if(app.comparisonSort==='default')values.sort((a,b)=>a.n.id-b.n.id);
  if(app.comparisonSort==='desc')values.sort((a,b)=>b.value-a.value||a.n.id-b.n.id);
  if(app.comparisonSort==='asc')values.sort((a,b)=>a.value-b.value||a.n.id-b.n.id);
  const max=Math.max(1,...values.map(v=>Math.abs(v.value))),sum=values.reduce((v,r)=>v+Math.max(0,r.value),0);
  const shareAllowed=!['era','density','avgPopulation','projectedNet','tradeBalance','mobilization','buildingLevel','development','laborUtilization','researchLevel','targetFulfillment','militaryInvestment'].includes(metric.key);
  const share=app.v04cValueMode==='share'&&shareAllowed;
  $('v04cValueMode').querySelector('option[value="share"]').disabled=!shareAllowed;
  if(!shareAllowed&&app.v04cValueMode==='share'){app.v04cValueMode='absolute';$('v04cValueMode').value='absolute';}
  $('v04cMetricInfo').textContent=metric.help+(share?' · 선택한 국가 사이의 비중을 표시합니다.':'');
  target.replaceChildren(...values.map((r,i)=>{
    const row=make('div',{class:'compare-row'+(app.selectedNationId===r.n.id?' active':'')+(!r.n.active?' inactive':'')});
    const name=make('button',{class:'compare-name',type:'button'});
    name.style.background='none';name.style.border='none';name.style.padding='0';name.style.color='inherit';name.style.cursor='pointer';name.style.textAlign='left';
    name.append(make('span',{class:'compare-dot',style:{background:r.n.color}}),make('span',{class:'compare-name-stack'},[make('span',{class:'compare-nation-label',text:r.n.name+(!r.n.active?' †':'')}),make('span',{class:'compare-era-label',text:civilizationLabel(r.n)})]));
    name.addEventListener('click',()=>{app.selectedNationId=r.n.id;app.nationSubtab='overview';setActiveTab('nation');renderNationList();renderNationOverview();renderPlayerPanel();});
    const width=share?(sum?Math.max(0,r.value)/sum*100:0):Math.abs(r.value)/max*100;
    const bar=make('div',{class:'compare-track'},[make('div',{class:'compare-fill',style:{width:`${width}%`,background:r.n.active?r.n.color:'#637481'}})]);
    const value=metric.key==='era'?civilizationLabel(r.n):share?(sum?(Math.max(0,r.value)/sum*100).toFixed(1):'0.0')+' %':v04cFormat(r.value,metric);
    row.append(name,make('span',{class:'compare-rank',text:`${i+1}위`}),bar,make('span',{class:'compare-value',text:value}));return row;
  }));
  $('v04cStatsScope').textContent=`${metric.title} · ${values.length}개국 비교 · ${app.comparisonSort==='default'?'국가순':app.comparisonSort==='desc'?'내림차순':'오름차순'} · 지표는 현재 세이브 상태 기준입니다.`;
}
function renderV04CWorldStats(){
  if(!app.world||app.activeTab!=='statistics')return;
  const snap=v04cStatsSnapshot(),alive=snap.rows.filter(r=>r.n.active),t=timeAt(snap.world.dayIndex);
  $('v04cStatsDate').textContent=`${t.year}년 ${t.quarter}분기 ${t.day}일`;
  const items=[['생존 국가',alive.length,'개국'],['총인구',alive.reduce((v,r)=>v+r.population,0),'명'],['소유 영토',alive.reduce((v,r)=>v+r.territory,0),'타일'],['세계 국고',alive.reduce((v,r)=>v+r.n.gold,0),'G'],['총 현역 병력',alive.reduce((v,r)=>v+r.troops,0),'명'],['기초 군사력',alive.reduce((v,r)=>v+r.military,0),''],['총 정착지',alive.reduce((v,r)=>v+r.settlements,0),'개'],['국가당 평균 기술',alive.length?alive.reduce((v,r)=>v+(r.n.technology?.unlocked?.length||0),0)/alive.length:0,'개']];
  $('v04cWorldSummary').replaceChildren(...items.map(([label,num,unit])=>make('div',{class:'v04c-summary-item'},[
    make('span',{text:label}),make('strong',{text:v04cFormat(num,{key:'world',unit})})])));
  const eraMetric=app.v04cEraMetric||'countries',counts=Object.fromEntries(V04C_STAGE_BUCKETS.map(k=>[k.id,0]));
  for(const r of alive)counts[v04cStageBucket(r.n)]+=eraMetric==='countries'?1:eraMetric==='population'?r.population:r.territory;
  const total=Object.values(counts).reduce((a,b)=>a+b,0),suffix=eraMetric==='countries'?'개국':eraMetric==='population'?'명':'타일';
  $('v04cEraSummary').replaceChildren(...V04C_STAGE_BUCKETS.map(info=>{
    const count=counts[info.id]||0,portion=total?100*count/total:0;
    const item=make('div',{class:'v04c-era-item'});
    item.append(make('div',{class:'v04c-era-item-head'},[
      make('span',{},[make('span',{class:'v04c-era-swatch',style:{background:info.color}}),document.createTextNode(info.label)]),make('strong',{text:`${number.format(count)} ${suffix}`})]));
    item.append(make('div',{class:'v04c-era-track'},[make('span',{style:{width:portion+'%',background:info.color}})]),make('small',{text:portion.toFixed(1)+'%'+(info.planned?' · 미개방 단계':'' )}));return item;
  }),make('div',{class:'v04c-era-total',text:`중세 전체 ${number.format([1,2,3,4].reduce((sum,s)=>sum+counts['medieval_'+s],0))} ${suffix} · 산업 근대 전체 ${number.format([1,2,3].reduce((sum,s)=>sum+counts['industrial_modern_'+s],0))} ${suffix} · 단계별 중복 집계 없음`}));
}
function v04cInitStatsUI(){
  $('v04cStatCategories').replaceChildren(...V04C_STAT_GROUPS.map(g=>{
    const b=make('button',{type:'button',text:`${g.icon} ${g.title}`});b.dataset.statGroup=g.id;
    b.addEventListener('click',()=>{app.v04cStatsGroup=g.id;app.comparisonMetric=g.metrics[0][0];v04cSyncStatsUI();renderComparisons();e3e2RenderStatsDemography();});return b;
  }));
  $('v04cEraMetricControls').querySelectorAll('[data-era-metric]').forEach(b=>b.addEventListener('click',()=>{
    app.v04cEraMetric=b.dataset.eraMetric;v04cSyncStatsUI();renderV04CWorldStats();
  }));
  $('v04cMetricSelect').addEventListener('change',e=>{app.comparisonMetric=e.target.value;renderComparisons();e3e2RenderStatsDemography();});
  $('v04cNationFilter').addEventListener('change',e=>{app.v04cNationFilter=e.target.value;renderComparisons();e3e2RenderStatsDemography();});
  $('v04cValueMode').addEventListener('change',e=>{app.v04cValueMode=e.target.value;renderComparisons();e3e2RenderStatsDemography();});
  v04cSyncStatsUI();
}
function v04cSyncStatsUI(){
  const g=V04C_STAT_GROUPS.find(g=>g.id===app.v04cStatsGroup)||V04C_STAT_GROUPS[0];
  document.querySelectorAll('[data-stat-group]').forEach(b=>{const yes=b.dataset.statGroup===g.id;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',String(yes));});
  document.querySelectorAll('[data-era-metric]').forEach(b=>{const yes=b.dataset.eraMetric===(app.v04cEraMetric||'countries');b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',String(yes));});
  $('v04cMetricSelect').replaceChildren(...g.metrics.map(m=>make('option',{value:m[0],text:m[1]})));
  if(!g.metrics.some(m=>m[0]===app.comparisonMetric))app.comparisonMetric=g.metrics[0][0];
  $('v04cMetricSelect').value=app.comparisonMetric;
  $('comparisonSort').value=app.comparisonSort;
  const select=$('v04cNationFilter'),previous=app.v04cNationFilter||'all';
  select.replaceChildren(make('option',{value:'all',text:'전체 국가'}),make('option',{value:'active',text:'생존 국가만'}),...(app.world?.nations||[]).map(n=>make('option',{value:String(n.id),text:n.name+(!n.active?' (멸망)':'')})));
  select.value=previous;
}
function renderV04CStats(){if(!app.world||app.activeTab!=='statistics')return;renderV04CWorldStats();renderComparisons();e3e2RenderStatsDemography();}
function redrawNationPresentation(){
  map.draw();renderInspector();renderNationList();renderNationOverview();renderWarfare();renderV04CStats();renderMilitaryRoster();
}
function profileContext(){return {
  world:()=>app.world,
  worldShape:()=>$('worldSizeSelect').value,
  newWorldNationCount:()=>Number($('newNationCount').value)||c1DefaultNationCount(...$('worldSizeSelect').value.split('x').map(Number)),
  exportJson:(filename,text)=>download(filename,text,'application/json'),
  message:showToast,
  saveProfile:(profile,oldId)=>{
    // World profiles are live instances; browser library survives creation of a new world.
    const previous=app.world.aiProfiles[oldId];
    const isRename=oldId!==profile.id&&previous&&!BASE_PROFILE_IDS.has(oldId);
    if(isRename&&app.world.nations.some(n=>n.aiProfileId===oldId))throw Error('사용 중인 프로필 ID는 바꿀 수 없습니다.');
    if(profile.id!==oldId&&app.world.aiProfiles[profile.id])throw Error('이미 존재하는 프로필 ID입니다.');
    saveCustomProfile(app.world,profile);
    if(isRename){removeCustomProfile(app.world,oldId);delete persistentProfiles[oldId];}
    persistentProfiles[profile.id]=cloneProfile(profile);
    const persisted=persistProfiles();
    redrawNationPresentation();if(persisted)showToast('AI 프로필이 저장되었습니다.');
  },
  deleteProfile:id=>{removeCustomProfile(app.world,id);delete persistentProfiles[id];if(persistProfiles())showToast('AI 프로필을 삭제했습니다.');},
  assignProfile:(id,profileId)=>{applyNationProfile(app.world,id,profileId);redrawNationPresentation();showToast('국가 AI 프로필을 변경했습니다.');},
  setColor:(id,color)=>{setNationColor(app.world,id,color);redrawNationPresentation();},
  renameNation:(id,name)=>{renameNation(app.world,id,name);redrawNationPresentation();$('warHistoryList').dataset.historyKey='';renderWarHistory();showToast('국가명을 변경했습니다.');},
  importProfiles:profiles=>{
    // Atomic preflight: reject ID conflicts before mutating world/library.
    if(Object.keys(app.world.aiProfiles).length+profiles.length>104)throw Error('프로필 104개 상한을 초과합니다.');
    for(const p of profiles){validateProfile(p);if(app.world.aiProfiles[p.id]||persistentProfiles[p.id])throw Error('이미 존재하는 프로필 ID: '+p.id);}
    const next={...persistentProfiles};for(const p of profiles)next[p.id]=cloneProfile(p);
    validateCustomLibrary(next);
    for(const p of profiles)saveCustomProfile(app.world,p);
    persistentProfiles=next;if(persistProfiles())showToast(profiles.length+'개 커스텀 AI 프로필을 가져왔습니다.');
  }
};}
function renderAIEditor(){if($('aiEditorRoot')&&app.world)mountAIEditor($('aiEditorRoot'),profileContext(),editorState);}
function renderWorldEras(){
  const target=$('worldEraList');if(!target||!app.world)return;
  const w=app.world,active=w.nations.filter(n=>n.active);
  const counts=Object.fromEntries(Object.keys(CIVILIZATION_ERAS).map(id=>[id,active.filter(n=>n.civilization.era===id).length]));
  $('worldEraTotal').textContent=`생존 ${active.length}개국`;
  const summary=make('div',{class:'era-distribution'},[
    ...Object.values(CIVILIZATION_ERAS).filter(info=>!['early_modern','industrial_modern'].includes(info.id)).map(info=>make('div',{class:'era-count'},[make('span',{text:info.label}),make('strong',{text:String(counts[info.id])})])),
    ...[1,2,3,4].map(stage=>make('div',{class:'era-count'},[make('span',{text:'근세 '+['','I','II','III','IV'][stage]}),make('strong',{text:String(active.filter(n=>n.civilization.era==='early_modern'&&n.civilization.stage===stage).length)})])),
    ...[1,2,3,4].map(stage=>make('div',{class:'era-count'},[make('span',{text:'산업 근대 '+['','I','II','III','IV'][stage]}),make('strong',{text:String(active.filter(n=>n.civilization.era==='industrial_modern'&&n.civilization.stage===stage).length)})]))
  ]);
  const stageTotals=Object.fromEntries([1,2,3,4].map(i=>[i,active.filter(n=>n.civilization.era==='medieval'&&n.civilization.stage===i).length]));
  const modern1=active.filter(n=>n.civilization.era==='early_modern'&&n.civilization.stage===1).length;
  const modern2=active.filter(n=>n.civilization.era==='early_modern'&&n.civilization.stage===2).length;
  const modern3=active.filter(n=>n.civilization.era==='early_modern'&&n.civilization.stage===3).length;
  const modern4=active.filter(n=>n.civilization.era==='early_modern'&&n.civilization.stage===4).length;
  const note=make('p',{class:'scope-note',text:`기술 난도 Tier와 문명 단계는 별개입니다. 중세 I ${stageTotals[1]}개국 · II ${stageTotals[2]}개국 · III ${stageTotals[3]}개국 · IV ${stageTotals[4]}개국 · 근세 I ${modern1}개국 · 근세 II ${modern2}개국 · 근세 III ${modern3}개국 · 근세 IV ${modern4}개국. 산업 근대 I~IV도 각 단계로 구분합니다. 단계 승급은 해당 기술 및 실제 시설 요건에 따릅니다.`});
  const rows=active.map(n=>{
    const row=make('button',{class:'era-nation-row',type:'button'});
    row.append(make('span',{class:'nation-dot',style:{background:n.color}}),
      make('strong',{text:n.name}),make('span',{text:civilizationLabel(n)}));
    row.addEventListener('click',()=>{app.selectedNationId=n.id;app.nationSubtab='research';setActiveTab('nation');renderNationList();renderNationOverview();});
    return row;
  });
  target.replaceChildren(summary,note,...rows);
}
function renderWorldTrade(){
  const target=$('worldTradeList');if(!target||!app.world)return;
  const w=app.world,h=w.trade.history;
  const totals=h.reduce((v,t)=>v+t.gold,0);
  $('worldTradeTotal').textContent=`최근 ${h.length}건 · ${number.format(totals)} G`;
  const rows=h.slice(-30).reverse().map(t=>make('div',{class:'trade-log-row'},[
    make('span',{class:'trade-date',text:`${Math.floor(t.dayIndex/120)+1}년`}),
    make('strong',{text:`${w.nations[t.seller]?.name} → ${w.nations[t.buyer]?.name}`}),
    make('span',{text:`${TRADE_GOODS[t.good].label} ${t.quantity}개 · ${number.format(t.gold)} G${t.market?' · 시장: 구매 '+number.format(t.buyerPaid)+' / 판매 '+number.format(t.sellerReceived)+' G':''}`})
  ]));
  target.replaceChildren(...(rows.length?rows:[make('div',{class:'muted-line',text:'아직 국제 거래 기록이 없습니다.'})]));
}
const HISTORICAL_LABELS={era:'시대 전환',technology:'기술',settlement:'개척',diplomacy:'외교',leader:'지도자',fall:'멸망',war:'전쟁',peace:'종전'};
const HISTORICAL_GLYPHS={era:'◆',technology:'✦',settlement:'⌂',diplomacy:'◇',leader:'♛',fall:'✝',war:'⚔',peace:'⚑'};
function historicalWarIds(h){return [...new Set([...(h.participants?.attackers||[h.attackerId]),...(h.participants?.defenders||[h.defenderId])])];}
let i1aChronicleCache=null;
function historicalRecords(w){
  const stamp=[w.historicalChronicle?.nextId||0,w.historicalChronicle?.entries?.length||0,w.warHistory?.length||0,w.wars?.length||0].join(':');
  // During pause/page/filter selection reuse the already sorted event array.
  if(i1aChronicleCache?.world===w&&i1aChronicleCache.stamp===stamp)return i1aChronicleCache.records;
  const saved=w.historicalChronicle?.entries||[],used=new Set(saved.map(e=>e.sourceKey).filter(Boolean));
  const records=saved.map(e=>({...e,key:`saved:${e.id}`,warId:e.sourceKey?.startsWith('war:')?Number(e.sourceKey.split(':')[1]):null}));
  const add=(war,kind,day,text)=>{
    const key=`war:${war.id}:${kind==='war'?'start':'end'}`;
    if(!used.has(key))records.push({key,dayIndex:day,kind,text,nationIds:historicalWarIds(war),warId:war.id});
  };
  // Era transition dates are canonical and survive bounded chronicle eviction.
  for(const nation of w.nations){
    const day=nation.civilization?.eraReachedDay,key=`era:${nation.id}:medieval`;
    if(['medieval','early_modern'].includes(nation.civilization?.era)&&day!==null&&day!==undefined&&!used.has(key))
      records.push({key,dayIndex:day,kind:'era',text:`${nation.name}: 고대에서 중세로 진입했습니다.`,nationIds:[nation.id],warId:null});
  }
  for(const nation of w.nations){
    const c=nation.civilization;if(c?.era!=='medieval'||c.stage<=1||c.stageReachedDay===null)continue;
    const key=`era:${nation.id}:stage:${c.stage}`;
    if(!used.has(key))records.push({key,dayIndex:c.stageReachedDay,kind:'era',text:`${nation.name}: ${civilizationLabel(nation)} 진입`,nationIds:[nation.id],warId:null});
  }
  for(const war of w.warHistory||[]){
    const names=war.participantNames||{};
    const a=war.attackerName||names[war.attackerId]||w.nations[war.attackerId]?.name||'공격국';
    const b=war.defenderName||names[war.defenderId]||w.nations[war.defenderId]?.name||'방어국';
    add(war,'war',war.startedDay,`${a} · ${b} 전쟁 발발`);
    add(war,'peace',war.endedDay,`${a} · ${b} 전쟁 종결 · ${war.tier==='WHITE'?'백지 평화':war.winnerName||'승리국'} · 영토 ${war.acquiredTiles||0}타일 · 배상 ${war.reparations||0}G`);
  }
  for(const war of w.wars||[]){
    const key=`war:${war.id}:start`;
    if(!used.has(key))records.push({key,dayIndex:war.startedDay,kind:'war',text:`${w.nations[war.attackerId]?.name||'공격국'} · ${w.nations[war.defenderId]?.name||'방어국'} 전쟁 발발 (진행 중)`,nationIds:[...new Set([...(war.sides?.attackers||[war.attackerId]),...(war.sides?.defenders||[war.defenderId])])],warId:war.id});
  }
  records.sort((a,b)=>b.dayIndex-a.dayIndex||String(b.key).localeCompare(String(a.key)));
  i1aChronicleCache={world:w,stamp,records};return records;
}
function resetChronicleFilterOptions(){
  const filter=$('chronicleNationFilter');filter.replaceChildren(new Option('모든 국가','all'));
  for(const n of app.world.nations)filter.append(new Option(n.name+(n.active?'':' · 멸망'),String(n.id)));
  filter.value=app.chronicleNation; if(filter.value!==app.chronicleNation){app.chronicleNation='all';filter.value='all';}
  $('chronicleKindFilter').value=app.chronicleKind;
}
function renderChronicle(){
  if(!app.world)return;
  // Only draw this relatively costly document view while it is visible.
  if(app.activeTab!=='chronicle')return;
  const w=app.world,h=w.historicalChronicle;
  resetChronicleFilterOptions();
  const allRecords=historicalRecords(w);
  const records=allRecords.filter(e=>(app.chronicleKind==='all'||e.kind===app.chronicleKind)&&
    (app.chronicleNation==='all'||e.nationIds.includes(Number(app.chronicleNation))));
  const size=20,pages=Math.max(1,Math.ceil(records.length/size));
  app.chroniclePage=Math.max(1,Math.min(pages,app.chroniclePage));
  const visible=records.slice((app.chroniclePage-1)*size,app.chroniclePage*size);
  $('chronicleTotal').textContent=`${records.length}건 / 총 ${allRecords.length}건`;
  $('chronicleScope').textContent=`장기 기록 ${h.entries.length}/${CHRONICLE_MAX}건 · 오래된 기록 생략 ${h.dropped}건 · 종전 기록은 기존 전쟁사와 연결 · V0.4A 이전 비전쟁 사건은 복원하지 않습니다.`;
  const items=visible.map(e=>{
    const t=timeAt(e.dayIndex),body=make('div',{class:'chronicle-entry-main'});
    body.append(make('div',{class:'chronicle-entry-head'},[
      make('span',{text:`${t.year}년 · ${t.quarter}분기 · ${t.day}일`}),
      make('span',{text:HISTORICAL_LABELS[e.kind]||e.kind})]),make('div',{class:'chronicle-entry-text',text:e.text}));
    const linked=(w.warHistory||[]).some(h=>h.id===e.warId);
    if(linked&&['peace','war'].includes(e.kind)){
      const btn=make('button',{type:'button',text:'전쟁사 상세 보기'});
      btn.addEventListener('click',()=>{
        const order=w.warHistory.slice().reverse().findIndex(h=>h.id===e.warId);
        app.warHistoryPage=Math.floor(order/5)+1;
        $('warHistoryList').dataset.historyKey='';navigation.activate('military');
        requestAnimationFrame(()=>{const item=$('warHistoryList').querySelector(`[data-war-id="${e.warId}"]`);if(item){item.open=true;item.scrollIntoView({behavior:'smooth',block:'center'});}});
      });
      body.append(make('div',{class:'chronicle-entry-actions'},[btn]));
    }
    return make('article',{class:'chronicle-entry'},[make('div',{class:'chronicle-symbol',text:HISTORICAL_GLYPHS[e.kind]||'•'}),body]);
  });
  $('chronicleTimeline').replaceChildren(...(items.length?items:[make('div',{class:'muted-line',text:'선택한 조건에 해당하는 역사 기록이 없습니다.'})]));
  const prev=make('button',{type:'button',class:'war-page-button',text:'← 이전'}),next=make('button',{type:'button',class:'war-page-button',text:'다음 →'});
  prev.disabled=app.chroniclePage===1;next.disabled=app.chroniclePage===pages;
  prev.addEventListener('click',()=>{app.chroniclePage--;renderChronicle();});
  next.addEventListener('click',()=>{app.chroniclePage++;renderChronicle();});
  $('chroniclePager').replaceChildren(prev,make('span',{class:'war-page-status',text:`${app.chroniclePage} / ${pages} 페이지`}),next);
  const recent=w.events.slice(-30).reverse();
  $('recentActivityCount').textContent=`${w.events.length}건`;
  $('recentActivityList').replaceChildren(...recent.map(e=>{const t=timeAt(e.dayIndex);return make('div',{class:'recent-activity-item',text:`${t.year}년 ${t.quarter}분기 ${t.day}일 · ${e.text}`});}));
}


// E3C: on-demand audit console. Never rebuild this content during SIM ticks.
function e3cRefreshPolicyAudit(){
 const card=$('e3cPolicyAuditCard'),target=$('e3cPolicyAuditContent'),select=$('e3cAuditNation');
 if(!card?.open||!app.world||!target)return;
 const w=app.world,id=Number(select.value),n=w.nations[id]||w.nations.find(x=>x.active)||w.nations[0];
 target.replaceChildren(v06f4aAuditPanel(w),v06e7cAuditPanel(w,n),v06e7aPanel(w,n),e3cUnifiedPolicyTelemetry(w,n));
}
function e3cSyncPolicyAuditNation(){
 const select=$('e3cAuditNation');if(!select||!app.world)return;
 const old=Number(select.value);const chosen=app.world.nations.some(n=>n.id===old)?old:app.selectedNationId;
 select.replaceChildren(...app.world.nations.map(n=>make('option',{value:String(n.id),text:n.name+(n.active?'':' · 멸망')})));
 select.value=String(chosen);
 if($('e3cPolicyAuditCard').open)e3cRefreshPolicyAudit();
}
$('e3e2WorldJson').addEventListener('click',()=>{if(app.world)download(`vilob-e3e2-demography-day${app.world.dayIndex}.json`,JSON.stringify(e3e2ExportDemography(app.world),null,2),'application/json');});
$('e3e2WorldCsv').addEventListener('click',()=>{if(app.world)download(`vilob-e3e2-demography-day${app.world.dayIndex}.csv`,e3e2DemographyCsv(app.world),'text/csv;charset=utf-8');});
$('e3e3SupplyJson').addEventListener('click',()=>{if(app.world)download(`vilob-e3e3-resource-day${app.world.dayIndex}.json`,JSON.stringify(e3e3SupplySummary(app.world),null,2),'application/json');});
$('e3e3SupplyCsv').addEventListener('click',()=>{if(app.world)download(`vilob-e3e3-resource-day${app.world.dayIndex}.csv`,e3e3SupplyCsv(app.world),'text/csv;charset=utf-8');});
$('e3cPolicyAuditCard').addEventListener('toggle',()=>e3cRefreshPolicyAudit());
$('e3cAuditNation').addEventListener('change',()=>e3cRefreshPolicyAudit());

function setWorld(world){
  pendingRiverPreview=null;map.riverPreviewSegments=null;document.getElementById('riverApplyBtn').disabled=true;document.getElementById('riverStatus').textContent=`현재 하천 ${(world.riverSegments||[]).length}구간 · 이전 세이브에 자동 추가하지 않습니다.`;
  D1C_OPEN_ARMIES.clear();
  v07d2ClearObservation(world);v07d2SetObservation(world,false);
  app.lastNationPanelId=null;app.lastNationPanelSubtab=null;app.v04cStatsCache=null;
  app.h1bMilitaryPage='regular';app.h1bAutoScope='world';app.i0AutoTab='overview';app.h1bAutoArmyFilter='all';app.h1bAutoArmyPage=0;app.i0AutoArmyQuery='';app.i0AutoArmyId=null;app.h1bAssembleAmount=8;app.h2aSelectedBlueprint=H_BLUEPRINT.id;h1bSyncMilitaryPage();
  $('cultureAuditResult').textContent='검사 전 · 현재 세계의 문화 인구 회계를 확인할 수 있습니다.';
  app.running=false;app.accumulator=0;app.lastFrame=null;app.world=world;e3cMigrateFormationRecords(world);app.simMeter=createSimMeter();
  app.autoSpeed.mode='MAX';app.autoSpeed.highCount=0;app.autoSpeed.lowCount=0;app.autoSpeed.lastSwitchAt=-Infinity;
  app.autoUiDirty=false;app.autoLastUiAt=0;updateAutoSpeedButton();
  app.selectedId=world.nations.find(n=>n.active)?.capitalId??0;app.selectedNationId=world.tiles[app.selectedId]?.ownerId??0;app.selectedBattleId=null;app.warHistoryPage=1;app.chroniclePage=1;app.chronicleKind='all';app.chronicleNation='all';
  // Default wide worlds to whole-map framing instead of clipping the east/west coasts.
  atlasMapCover=world.size===19;
  map.setWorld(world);syncAtlasLayout();
  $('seedInput').value=world.seed;
  $('worldSizeSelect').value=`${world.size}x${world.height}`;
  $('newNationCount').value=String(world.nations.length);
  $('setupNationCount').value=String(world.nations.length);
  c1RefreshWorldControls();
  refreshRngControls();
  $('warHistoryList').dataset.historyKey='';
  editorState.draft=null;editorState.draftSource=null;
  v07d2UpdateObservationUI();e3cSyncPolicyAuditNation();
  updatePlay();updateSimStatus();updateTime();updateStats();renderInspector();renderNationList();renderWarfare();renderChronicle();renderNationOverview();renderMilitaryRoster();d2RenderMilitaryCultures();renderWarHistory();renderComparisons();e3e2RenderStatsDemography();renderPlayerPanel();renderAIEditor();renderWorldTrade();renderWorldEras();e3e2RenderWorldDemography();e3e3RenderWorldSupply();if(app.activeTab==='world')d2RenderWorldCultures();
  e3eRenderMarketPanel();h1bRenderAutomaton();
  $('coordinateLabel').textContent='X — · Y —';
  if(g1RefreshUI)g1RefreshUI();
}
function refreshRngControls(){
  const p=app.world.rngPolicy;
  $('rngFixedToggle').checked=p.fixed;
  $('rngPeriodSelect').value=String(p.intervalDays);
  $('rngPeriodSelect').disabled=p.fixed;
  $('rngPolicyStatus').textContent=p.fixed?'고정 RNG · 같은 시드와 같은 초기 조건에서 동일한 역사를 재현합니다.':
    `변동 RNG · ${p.intervalDays===30?'분기':'연도'} 경계부터 외부 난수 주입 · 적용 ${p.reseedCount}회`;
}
function externalRandomUint32(){
  const values=new Uint32Array(1);
if(window.crypto?.getRandomValues)window.crypto.getRandomValues(values);
  else values[0]=Math.floor(Math.random()*4294967296);
  return values[0];
}
function updateAutoSpeedButton(){
  const button=$('autoSpeedBtn'),auto=app.autoSpeed;
  button.classList.toggle('active',auto.enabled);
  button.classList.toggle('auto-safe',auto.enabled&&auto.mode==='SAFE');
  button.textContent=auto.enabled?(auto.mode==='MAX'?'AUTO MAX':'AUTO ×10'):'AUTO';
  button.setAttribute('aria-pressed',String(auto.enabled));
  button.setAttribute('aria-label',auto.enabled?'자동 최대 속도 끄기':'자동 최대 속도 켜기');
  button.title=auto.enabled?(auto.mode==='MAX'?'AUTO · 최대 속도':'AUTO · SIM 보호: ×10'):'자동 최대 속도 켜기 (SIM >1500ms이면 ×10 제한, <1000ms이면 MAX)';
}
function updatePlay(){
  $('playBtn').innerHTML=app.running?'Ⅱ <span>일시정지</span>':'▶ <span>재생</span>';
  $('playBtn').setAttribute('aria-label',app.running?'일시정지':'재생');
  $('runtimeStatus').textContent=(app.running?'시간 진행 중':'일시정지')+(app.autoSpeed.enabled?' · AUTO '+(app.autoSpeed.mode==='MAX'?'MAX':'×10'):'');
}
function updateSimStatus(){
  const meter=app.simMeter;
  const label=$('simPerformance');
  label.textContent=meter.samples===0?'SIM — ms/batch · — ms/day':
    `SIM ${formatSimMs(meter.simMs)}ms/batch · ${formatSimMs(meter.msPerDay)}ms/day · ${meter.lastBatchDays}d`;
  label.title='시뮬레이션 계산만 측정한 최근 평활값. 지도 렌더링과 대기시간 제외. 최근 배치의 일수(d)를 함께 표시합니다.';
}
function refreshSimulationView(redraw){
  refreshRngControls();updateTime();updateSimStatus();v07d2UpdateObservationUI();
  if(redraw){
    map.draw();updateStats();renderChronicle();
    if(app.activeTab==='map')renderInspector();
    if(app.activeTab==='nation'){renderNationList();renderNationOverview();}
    if(app.activeTab==='military'){if(app.h1bMilitaryPage==='automaton')h1bRenderAutomaton();else{renderWarfare();renderMilitaryRoster();d2RenderMilitaryCultures();renderWarHistory();}}
    if(app.activeTab==='market')e3eRenderMarketPanel();
    if(app.activeTab==='statistics')renderV04CStats();
    if(app.activeTab==='world'){renderWorldTrade();renderWorldEras();e3e2RenderWorldDemography();e3e3RenderWorldSupply();d2RenderWorldCultures();}
    if(app.activeTab==='chronicle')renderChronicle();
  }
}
function flushAutoView(){
  refreshSimulationView(app.autoUiDirty);
  app.autoUiDirty=false;
  app.autoLastUiAt=performance.now();
}
function setAutoSpeed(enabled){
  // Flush deferred UI before leaving MAX; speed is a runtime option, not saved world state.
  if(app.autoSpeed.enabled&&app.autoUiDirty)flushAutoView();
  const auto=app.autoSpeed;
  auto.enabled=Boolean(enabled);auto.mode='MAX';auto.highCount=0;auto.lowCount=0;auto.lastSwitchAt=-Infinity;
  app.accumulator=0;app.lastFrame=null;app.autoUiDirty=false;app.autoLastUiAt=0;
  if(auto.enabled)app.simMeter=createSimMeter(); // Start hysteresis with comparable 10-day batches.
  updateAutoSpeedButton();updatePlay();updateSimStatus();
}
function setRunning(yes){
  if(yes&&e3bLastFailure(app.world)){showToast('이 날짜는 오류로 중단되어 미검증 상태입니다. 직전 정상 저장을 다시 불러와 주세요.');return;}
  if(!yes&&app.autoSpeed.enabled&&app.autoUiDirty)flushAutoView();
  app.running=Boolean(yes);app.accumulator=0;app.lastFrame=null;updatePlay();
}
function step(days,deferUI=false){
  if(e3bLastFailure(app.world))throw Error('E3B 미검증 날짜에서 재실행할 수 없습니다. 정상 저장을 불러와 주세요.');
  const wasInitial=app.world.dayIndex===0&&!app.world.setupLocked;
  const lastQuarter=Math.floor(app.world.dayIndex/30),lastChange=app.world.changeSeq;
  measureSimBatch(app.simMeter,days,()=>advanceDays(app.world,days,externalRandomUint32));
  const redraw=app.world.changeSeq!==lastChange||Math.floor(app.world.dayIndex/30)!==lastQuarter;
  if(wasInitial&&app.world.dayIndex>0)c1RefreshWorldControls();
  if(deferUI)app.autoUiDirty=app.autoUiDirty||redraw;
  else{refreshSimulationView(redraw||app.autoUiDirty);app.autoUiDirty=false;app.autoLastUiAt=performance.now();}
  // Meter is always computed on the same 10-day batch in MAX and AUTO ×10.
  if(app.running&&app.autoSpeed.enabled&&days===10){
    if(updateAutoSpeedMode(app.autoSpeed,app.simMeter.simMs,performance.now())){
      app.lastFrame=null;app.accumulator=0;updateAutoSpeedButton();updatePlay();
    }
  }
}
function animate(now){
 try{
  if(app.running){
    if(app.autoSpeed.enabled&&app.autoSpeed.mode==='MAX'){
      // Cooperative burst: do not queue a second RAF/timer or block indefinitely.
      const started=performance.now();let batches=0;
      do{
        step(10,true);batches++;
      }while(app.running&&app.autoSpeed.enabled&&app.autoSpeed.mode==='MAX'&&
        batches<AUTO_SPEED_MAX_BATCHES&&performance.now()-started<AUTO_SPEED_FRAME_BUDGET_MS);
      if(performance.now()-app.autoLastUiAt>=AUTO_SPEED_UI_INTERVAL_MS||app.autoSpeed.mode!=='MAX')flushAutoView();
    }else{
      if(app.lastFrame===null)app.lastFrame=now;
      const elapsed=Math.min(1000,Math.max(0,now-app.lastFrame));app.lastFrame=now;
      app.accumulator+=elapsed;
      // Manual ×1/×3/×10 unchanged; AUTO SAFE uses the exact same ×10 cadence.
      if(app.accumulator>=SIM_BATCH_INTERVAL_MS){
        app.accumulator%=SIM_BATCH_INTERVAL_MS;
        step(app.autoSpeed.enabled?10:app.speed);
      }
    }
  }
 }catch(error){
  app.running=false;app.accumulator=0;app.lastFrame=null;
  console.error('VILOB 시뮬레이션 예외 (긴급 백업을 권장합니다)',error);
  const failure=e3bLastFailure(app.world);
  try{updatePlay();showToast(failure?'전투 라운드 복원 '+failure.rollbackStatus+' · '+failure.dayIndex+'일 · 전투 중단. 현재 날짜의 나머지 시뮬레이션은 미검증이므로 직전 정상 저장에서 재개하세요.':'시뮬레이션 오류: '+error.message+' · 월드 JSON 긴급 백업을 확인하세요.');}catch(_ignore){}
 }finally{app.frame=requestAnimationFrame(animate);}
}
function download(name,content,mime){
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type:mime}));
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function randomSeed(){
  const array=new Uint32Array(1);
  if(window.crypto?.getRandomValues)window.crypto.getRandomValues(array);
  else array[0]=Math.floor(Math.random()*4294967295);
  return `light-${array[0].toString(36)}`;
}
navigation=bindTabs(tab=>{
  app.activeTab=tab;
  syncAtlasLayout();
  // A hidden canvas has zero layout size; refresh dimensions only upon visible navigation.
  if(tab==='map')requestAnimationFrame(()=>map.resize());
  else if(tab==='nation'){renderNationOverview();renderPlayerPanel();}
  else if(tab==='military'){h1bSetMilitaryPage('regular');renderMilitaryRoster();renderWarfare();d2RenderMilitaryCultures();renderWarHistory();}
  else if(tab==='market')e3eRenderMarketPanel();
  else if(tab==='statistics'){v04cSyncStatsUI();renderV04CStats();}
  else if(tab==='world'){renderAIEditor();renderWorldTrade();renderWorldEras();e3e2RenderWorldDemography();e3e3RenderWorldSupply();d2RenderWorldCultures();}
  else if(tab==='chronicle'){renderChronicle();window.scrollTo(0,0);}
});
$('e3eMarketCsv').addEventListener('click',()=>{download('vilob-e3e1-market-prices-day'+app.world.dayIndex+'.csv',e3eMarketCsv(app.world),'text/csv;charset=utf-8');});
$('e3eMarketJson').addEventListener('click',()=>{download('vilob-e3e1-market-summary-day'+app.world.dayIndex+'.json',JSON.stringify(e3eMarketSummary(app.world),null,2),'application/json');});
$('chronicleNationFilter').addEventListener('change',e=>{app.chronicleNation=e.target.value;app.chroniclePage=1;renderChronicle();});
$('chronicleKindFilter').addEventListener('change',e=>{app.chronicleKind=e.target.value;app.chroniclePage=1;renderChronicle();});
$('comparisonSort').addEventListener('change',e=>{app.comparisonSort=e.target.value;renderComparisons();e3e2RenderStatsDemography();});
v04cInitStatsUI();
$('playBtn').addEventListener('click',()=>setRunning(!app.running));
$('autoSpeedBtn').addEventListener('click',()=>setAutoSpeed(!app.autoSpeed.enabled));
for(const el of document.querySelectorAll('.speed'))el.addEventListener('click',()=>{
  if(app.autoSpeed.enabled)setAutoSpeed(false);
  app.speed=Number(el.dataset.speed);
  document.querySelectorAll('.speed').forEach(e=>{e.classList.toggle('active',e===el);e.setAttribute('aria-pressed',String(e===el));});
});
$('stepBtn').addEventListener('click',()=>{if(app.autoSpeed.enabled){setRunning(false);setAutoSpeed(false);}step(1);});
$('monthBtn').addEventListener('click',()=>{if(app.autoSpeed.enabled){setRunning(false);setAutoSpeed(false);}step(30);});
for(const btn of document.querySelectorAll('[data-map-mode]'))btn.addEventListener('click',()=>{
  document.querySelectorAll('[data-map-mode]').forEach(b=>b.classList.toggle('selected',b===btn));
  map.setMode(btn.dataset.mapMode);
  document.querySelectorAll('.v04c-era-key').forEach(el=>el.hidden=btn.dataset.mapMode!=='era');
  document.querySelectorAll('.c5-independence-key').forEach(el=>el.hidden=btn.dataset.mapMode!=='independence');
  document.querySelectorAll('.d2-culture-map-key').forEach(el=>el.hidden=btn.dataset.mapMode!=='culture');
  document.querySelectorAll('.d1b-social-map-key').forEach(el=>el.hidden=btn.dataset.mapMode!=='social');
  $('d1bSocialModeControl').hidden=btn.dataset.mapMode!=='social';
  $('d2CultureModeControl').hidden=btn.dataset.mapMode!=='culture';
});
$('d2CultureMode').addEventListener('change',e=>map.setCultureDisplay(e.target.value));
$('d1bSocialMode').addEventListener('change',e=>map.setSocialDisplay(e.target.value));
$('d2MilitaryCultureCard').addEventListener('toggle',()=>d2RenderMilitaryCultures());
$('bordersToggle').addEventListener('change',e=>{map.showBorders=e.target.checked;map.draw();});
$('diplomaticBordersToggle').addEventListener('change',e=>{map.showDiplomaticBorders=e.target.checked;map.draw();});
$('riversToggle').addEventListener('change',e=>{map.showRivers=e.target.checked;map.staticAtlasCache=null;map.draw();});
$('roadsToggle').addEventListener('change',e=>{map.showRoads=e.target.checked;map.draw();});
$('i3aNetworkEnabled').addEventListener('change',e=>{i3aMapOptions.enabled=e.target.checked;map.draw();renderInspector();});
$('i3aNetworkSize').addEventListener('input',e=>{i3aMapOptions.size=Number(e.target.value)/100;$('i3aNetworkSizeValue').textContent=e.target.value+'%';map.draw();});
$('i3aNetworkFlows').addEventListener('change',e=>{i3aMapOptions.flows=e.target.checked;map.draw();});
$('armyLabels').addEventListener('change',e=>{map.armyLabelMode=e.target.value;map.closeArmyCluster();map.draw();});
$('settlementLabels').addEventListener('change',e=>{map.settlementLabelMode=e.target.value;map.draw();});
$('buildingLabels').addEventListener('change',e=>{map.buildingLabelMode=e.target.value;map.draw();});
for(const [id,key] of [['f1aIndustryToggle','enabled'],['f1aCoalToggle','coal'],['f1aPowerToggle','power'],['f1aSteamOnly','steamOnly']]){
 $(id).addEventListener('change',e=>{f1aVisuals[key]=e.target.checked;
   if(key==='steamOnly'&&map.world)f1aIndustryOverlayCache.delete(map.world);
   map.draw();});
}
$('defenseLabels').addEventListener('change',e=>{map.defenseLabelMode=e.target.value;map.draw();});
$('fortressDetailClose').addEventListener('click',()=>map.dismissSelectedFortress());
$('zoomInBtn').addEventListener('click',()=>map.zoomAt(1.35));
$('zoomOutBtn').addEventListener('click',()=>map.zoomAt(1/1.35));
$('resetViewBtn').addEventListener('click',()=>map.resetView());
$('randomSeedBtn').addEventListener('click',()=>{$('seedInput').value=randomSeed();});
$('rngFixedToggle').addEventListener('change',e=>{
  app.world.setupLocked=true;app.world.rngPolicy.fixed=e.target.checked;app.world.changeSeq++;refreshRngControls();c1RefreshWorldControls();
  showToast(e.target.checked?'RNG 고정이 활성화되었습니다.':'RNG 변동 활성화 · 다음 설정된 달력 경계부터 적용');
});
$('rngPeriodSelect').addEventListener('change',e=>{
  app.world.setupLocked=true;app.world.rngPolicy.intervalDays=Number(e.target.value);app.world.rngPolicy.lastReseedDay=null;c1RefreshWorldControls();
  app.world.changeSeq++;refreshRngControls();
});

function c1RefreshWorldControls(){
 if(!app.world)return;
 const [w,h]=$('worldSizeSelect').value.split('x').map(Number);
 const capacity=c1NationCapacity(w,h),min=c1DefaultNationCount(w,h);
 const input=$('newNationCount');input.min=min;input.max=capacity;
 const proposed=input.value===''?NaN:Number(input.value);
 const validProposal=Number.isInteger(proposed)&&proposed>=min&&proposed<=capacity;
 $('newWorldBtn').disabled=!validProposal;
 $('newNationStatus').textContent=`${w} × ${h} · ${(w*h).toLocaleString('ko-KR')}타일 · ${validProposal?proposed+'개국':'국가 수 확인 필요'} (가능 ${min}~${capacity})${w*h>=5000?' · 대형 지도 시험용':''}`;
 const present=app.world.nations.length;
 const enabled=app.world.dayIndex===0&&!app.world.setupLocked;
 const edit=$('setupNationCount'),cap=c1NationCapacity(app.world.size,app.world.height),base=c1DefaultNationCount(app.world.size,app.world.height);
 edit.min=base;edit.max=cap;edit.disabled=!enabled;
 const target=edit.value===''?NaN:Number(edit.value);
 const valid=Number.isInteger(target)&&target>=base&&target<=cap;
 $('reconfigureWorldBtn').disabled=!enabled||!valid||target===present;
 $('setupCurrentStatus').textContent=`현재 ${app.world.size} × ${app.world.height} · ${present}개국 / 최대 ${cap}개국 · ${enabled?'명령·시간 진행 전: 재배치 가능':'시작 후 잠금: 새 세계 생성만 가능'}`;
 $('setupCountPreview').textContent=valid?`${present}개국 → ${target}개국${target>present?' · 추가 '+(target-present)+'개국':target<present?' · 감소 '+(present-target)+'개국':' · 변경 없음'}`:'허용 범위를 확인하세요.';
 const added=valid&&target>base?c1Templates(app.world.size,app.world.height,target).slice(base).map(t=>t.name).join(' · '):valid?'기본 국가만 유지':'국가 수가 유효하지 않습니다.';
 $('setupNationPreview').textContent=`추가 국가 순서: ${added}`;
}
$('newNationCount').addEventListener('input',()=>{c1RefreshWorldControls();renderAIEditor();});
$('setupNationCount').addEventListener('input',c1RefreshWorldControls);
for(const [id,delta] of [['setupMinus',-1],['setupPlus',1]])$(id).addEventListener('click',()=>{
 const inp=$('setupNationCount');inp.value=String(Math.max(Number(inp.min),Math.min(Number(inp.max),Number(inp.value)+delta)));
 c1RefreshWorldControls();
});
$('reconfigureWorldBtn').addEventListener('click',()=>{
 try{
  const old=app.world;
  if(old.dayIndex!==0||old.setupLocked)throw Error('1년 1분기 1일 · 명령 전의 세계에서만 재배치할 수 있습니다.');
  const count=Number($('setupNationCount').value);
  const existing=Object.fromEntries(old.nations.slice(0,count).map(n=>[n.id,{name:n.name,color:n.color,profileId:n.aiProfileId}]));
  for(let i=old.nations.length;i<count;i++)if(editorState.newNationSetup[i])existing[i]=editorState.newNationSetup[i];
  const customProfiles=Object.fromEntries(Object.entries(old.aiProfiles).filter(([id])=>!BASE_PROFILE_IDS.has(id)));
  const fresh=createWorld(old.seed,old.size,old.height,{nationCount:count,profiles:{...persistentProfiles,...customProfiles},nations:existing});
  // Keep exactly the original terrain (the deterministic generator uses the same seed),
  // while all capitals, ownership, initial settlements, diplomacy and leaders are rebuilt atomically.
  if(fresh.tiles.some((t,i)=>t.terrain!==old.tiles[i].terrain))throw Error('원본 지형 일치 검증 실패');
  validateWorld(fresh);setWorld(fresh);
  showToast(`${count}개국으로 초기 세계 전체를 재배치했습니다.`);
 }catch(error){showToast('국가 수 재배치 실패: '+error.message);}
});
$('newWorldBtn').addEventListener('click',()=>{
  try{
    const seed=$('seedInput').value.trim()||'vilob-light-01';
    if((app.world.dayIndex>0||app.world.setupLocked)&&!window.confirm('현재 세계를 새로 생성하면 저장하지 않은 진행과 명령이 초기화됩니다. 계속할까요?'))return;
    const shape=$('worldSizeSelect').value;
    const selectedTemplates=Number($('newNationCount').value);
    const customSetup={profiles:persistentProfiles,nations:{},nationCount:selectedTemplates};
    for(let i=0;i<selectedTemplates;i++)if(editorState.newNationSetup[i])customSetup.nations[i]=editorState.newNationSetup[i];
    const [width,height]=shape.split('x').map(Number);
    setWorld(createWorld(seed,width,height,customSetup));showToast('커스텀 AI 설정을 반영해 새 세계를 생성했습니다.');
  }catch(error){showToast(`생성 실패: ${error.message}`);}
});
$('worldSizeSelect').addEventListener('change',()=>{const [w,h]=$('worldSizeSelect').value.split('x').map(Number);$('newNationCount').value=String(c1DefaultNationCount(w,h));c1RefreshWorldControls();renderAIEditor();});
$('seedInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('newWorldBtn').click();});
$('mobilizationCsvBtn').addEventListener('click',()=>{try{download(`vilob-e2-mobilization-y${timeAt(app.world.dayIndex).year}.csv`,v04e2MobilizationCsv(app.world),'text/csv;charset=utf-8');}catch(e){showToast('동원 진단 CSV 실패: '+e.message);}});
$('barracksEventsCsvBtn').addEventListener('click',()=>{try{download(`vilob-e2-barracks-events-y${timeAt(app.world.dayIndex).year}.csv`,v04e2BarracksEventsCsv(app.world),'text/csv;charset=utf-8');}catch(e){showToast('병영 진단 CSV 실패: '+e.message);}});
$('warAuditJsonBtn').addEventListener('click',()=>{try{download(`vilob-e4-war-audit-y${timeAt(app.world.dayIndex).year}.json`,JSON.stringify(warAuditReport(app.world),null,2),'application/json');}catch(e){showToast('진단 JSON 실패: '+e.message);}});
$('warAuditCsvBtn').addEventListener('click',()=>{try{download(`vilob-e4-war-audit-y${timeAt(app.world.dayIndex).year}.csv`,warAuditCsv(app.world),'text/csv;charset=utf-8');}catch(e){showToast('진단 CSV 실패: '+e.message);}});
$('exportGzipBtn').addEventListener('click',async()=>{
 if(typeof CompressionStream!=='function'){showToast('이 브라우저는 gzip 저장을 지원하지 않습니다. JSON 저장을 사용하세요.');return;}
 try{
  const raw=serializeWorld(app.world);
  const stream=new Blob([raw],{type:'application/json'}).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed=await new Response(stream).blob();
  download(`vilob-light-${app.world.seed.replace(/[^\w\-.가-힣]/g,'_')}-y${timeAt(app.world.dayIndex).year}.json.gz`,compressed,'application/gzip');
  showToast('압축 월드 JSON.gz를 내보냈습니다.');
 }catch(error){console.error('I1A gzip world save',error);showToast('압축 저장 실패: '+error.message+' · 일반 JSON 저장을 확인하세요.');}
});
$('exportBtn').addEventListener('click',()=>{
  if(e3bLastFailure(app.world)){
    const failure=e3bLastFailure(app.world);
    try{download(`vilob-UNVALIDATED-E3B-rollback-day${app.world.dayIndex}.json`,JSON.stringify(app.world,null,2),'application/json');
      showToast('전투 라운드는 복원되었으나 해당 날짜 진행은 미완료입니다. 미검증 백업만 저장했습니다.');}
    catch(err){showToast('미검증 백업 실패: '+err.message);}
    return;
  }
  try{download(`vilob-light-${app.world.seed.replace(/[^\w\-.가-힣]/g,'_')}-y${timeAt(app.world.dayIndex).year}.json`,serializeWorld(app.world),'application/json');showToast('월드 JSON을 내보냈습니다.');}
  catch(error){
   // F4B1: validation failure must never make the sole in-memory historical world unrecoverable.
   // Mark NaN/Infinity rather than silently nulling them: emergency files require review before import.
   try{
    const backup=JSON.stringify(app.world,(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?`__VILOB_NONFINITE__:${String(v)}`:v);
    download(`vilob-UNVALIDATED-emergency-day${app.world.dayIndex}.json`,backup,'application/json');
    console.warn('정상 월드 검증 실패, 미검증 원본 백업만 내보냈습니다:',error);
    showToast('월드 검증 실패: 미검증 긴급 백업을 다운로드했습니다. 오류 수정 전 직접 가져오지 마세요.');
   }catch(backupError){console.error('긴급 백업 실패',backupError);showToast('긴급 백업 실패: '+backupError.message);}
  }
});
// Map blueprint import is intentionally separate from the full world-save import.
let pendingCustomMap=null;
let pendingRiverPreview=null;
const updateRiverStatus=msg=>{$('riverStatus').textContent=msg;};
$('riverPreviewBtn').addEventListener('click',()=>{
  try{
    pendingRiverPreview=generateRiverSegments(app.world.seed,app.world.size,app.world.height,app.world.tiles);
    map.riverPreviewSegments=pendingRiverPreview;map.staticAtlasCache=null;map.draw();
    $('riverApplyBtn').disabled=!pendingRiverPreview.length;
    updateRiverStatus(`미리보기: ${pendingRiverPreview.length}개 선분 · 기존 하천 ${app.world.riverSegments?.length||0}개 · 확인 후 적용하면 기존 하천을 교체합니다. 미리보기만으로는 저장이 바뀌지 않습니다.`);
  }catch(e){showToast('하천 미리보기 실패: '+e.message);}
});
$('riverApplyBtn').addEventListener('click',()=>{
  if(!pendingRiverPreview?.length)return;
  const replacing=Boolean(app.world.riverSegments?.length);
  if(!window.confirm(replacing?'현재 세계의 기존 하천을 미리보기 경로로 교체할까요? 기존 경로는 되돌릴 수 없으니 먼저 세계 JSON을 저장하는 것을 권장합니다. 영토·경제·군사는 바뀌지 않습니다.':'기존 세계에 미리보기 하천을 추가할까요? 기존 영토·자원·군사에는 영향을 주지 않으며 저장 파일에 하천이 포함됩니다.'))return;
  app.world.riverSegments=structuredClone(pendingRiverPreview);app.world.riverSchemaVersion=RIVER_SCHEMA_VERSION;
  validateWorld(app.world);map.riverPreviewSegments=null;pendingRiverPreview=null;map.staticAtlasCache=null;map.draw();renderInspector();
  $('riverApplyBtn').disabled=true;updateRiverStatus(`${app.world.riverSegments.length}개 하천 구간 적용 완료 · 저장 파일에 포함됩니다.`);showToast(replacing?'하천 경로를 교체했습니다.':'하천을 세계에 추가했습니다.');
});
$('riverCancelBtn').addEventListener('click',()=>{pendingRiverPreview=null;map.riverPreviewSegments=null;map.staticAtlasCache=null;map.draw();$('riverApplyBtn').disabled=true;updateRiverStatus('미리보기 취소 · 현재 저장된 하천에는 영향이 없습니다.');});
$('customMapInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  pendingCustomMap=null;$('customMapStartBtn').disabled=true;
  const preview=$('customMapPreview');preview.className='custom-map-preview';
  if(file.size>3_000_000){preview.textContent='맵 JSON은 3MB 이하여야 합니다.';preview.classList.add('error');return;}
  try{
    const blueprint=parseCustomMap(await file.text());
    // Validate the complete playable world before offering to replace the current session.
    const world=createWorldFromMap(blueprint);validateWorld(world);
    pendingCustomMap=blueprint;$('customMapStartBtn').disabled=false;
    const owned=blueprint.tiles.filter(t=>t.ownerId!==null).length,roads=blueprint.tiles.filter(t=>t.roadLevel>0).length;
    preview.textContent=`✓ 「${blueprint.name}」 · ${blueprint.width}×${blueprint.height} · ${blueprint.nations.length}개국 · 시작 영토 ${owned}타일 · 도로 ${roads}타일 · 하천 ${blueprint.riverSegments.length}구간 · 검증 통과`;
    preview.classList.add('ready');showToast('맵 검증 완료 · 새 세계 시작 버튼을 누르세요.');
  }catch(error){preview.textContent='맵 가져오기 실패: '+error.message;preview.classList.add('error');showToast('커스텀 맵을 확인하세요.');}
});
$('customMapStartBtn').addEventListener('click',()=>{
  if(!pendingCustomMap)return;
  if(app.world.dayIndex>0&&!window.confirm('현재 세계 진행 상황이 초기화됩니다. 커스텀 맵에서 새 세계를 시작할까요?'))return;
  try{const world=createWorldFromMap(pendingCustomMap);setWorld(world);$('worldSizeSelect').value=`${world.size}x${world.height}`;
    $('customMapPreview').textContent=`✓ 「${pendingCustomMap.name}」 커스텀 맵에서 새 세계가 시작되었습니다.`;
    showToast('커스텀 맵으로 새 세계를 시작했습니다.');
  }catch(error){showToast('커스텀 맵 실행 실패: '+error.message);}
});
$('importInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(file.size>80_000_000){showToast('월드 파일은 80MB를 초과할 수 없습니다.');return;}
  try{
   const zipped=/\.json\.gz$/i.test(file.name);
   if(zipped&&typeof DecompressionStream!=='function')throw Error('이 브라우저는 gzip 압축 해제를 지원하지 않습니다. 일반 JSON으로 불러오세요.');
   const raw=zipped?await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text():await file.text();
   if(raw.length>100_000_000)throw Error('압축 해제된 월드 데이터가 100MB를 넘습니다.');
   const data=deserializeWorld(raw);setWorld(data);showToast(data.v07lRecovery?.pruned?.length?`월드 불러오기 성공 · I1 안전 복구 기록 ${data.v07lRecovery.pruned.length}건 (원본 파일 보존)`:(zipped?'압축 월드 JSON.gz를 불러왔습니다.':'월드 JSON을 불러왔습니다.'));
  }
  catch(error){showToast('불러오기 실패: '+error.message);}
});
$('cultureAuditBtn').addEventListener('click',()=>{
  try{const x=d1CultureAudit(app.world);$('cultureAuditResult').textContent=`✓ 검증 통과 · ${x.cultures}개 문화 · 민간 ${x.civilians.toLocaleString('ko-KR')}명 · 훈련 ${x.trainees.toLocaleString('ko-KR')}명 · 예비 ${x.reserves.toLocaleString('ko-KR')}명 · 현역 ${x.soldiers.toLocaleString('ko-KR')}명 · 민병대 ${x.militia.toLocaleString('ko-KR')}명 · 전체 ${x.total.toLocaleString('ko-KR')}명 · 이관 ${x.bootstrap.source}`;}
  catch(e){$('cultureAuditResult').textContent='검증 실패: '+e.message;showToast('문화 회계 오류: '+e.message);}
});
$('cultureAuditJsonBtn').addEventListener('click',()=>{
  try{download(`vilob-d1a1-cultures-day${app.world.dayIndex}.json`,JSON.stringify(d1CultureAudit(app.world),null,2),'application/json');}
  catch(e){showToast('문화 회계 JSON 실패: '+e.message);}
});
$('saveBtn').addEventListener('click',()=>{
  try{localStorage.setItem(SAVE_KEY,serializeWorld(app.world));showToast('브라우저에 저장했습니다.');}
  catch(error){showToast('저장할 수 없습니다: '+error.message);}
});
$('loadBtn').addEventListener('click',()=>{
  try{
    const keys=[SAVE_KEY,...LEGACY_SAVE_KEYS];
    const key=keys.find(k=>localStorage.getItem(k)),raw=key?localStorage.getItem(key):null;
    if(!raw){showToast('저장된 월드가 없습니다.');return;}
    setWorld(deserializeWorld(raw));showToast('저장된 세계를 불러왔습니다.');
  }catch(error){showToast('불러오기 실패: '+error.message);}
});
document.addEventListener('keydown',e=>{
  const editing=e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement;
  if(!editing&&e.code==='Space'&&!e.repeat){e.preventDefault();setRunning(!app.running);}
  if(!editing&&e.target===$('worldCanvas')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();const t=app.world.tiles[app.selectedId],d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    const x=t.x+d[0],y=t.y+d[1];if(x>=0&&x<app.world.size&&y>=0&&y<app.world.height)selectTile(y*app.world.size+x);
  }
});
$('worldCanvas').setAttribute('tabindex','0');
// V0.1G3 — Atlas is the only map layout; other tabs preserve their own document flow.
 let g1FocusMode=false,g1PreviousTab='map';
 $('atlasFocusToggle').addEventListener('click',()=>{
   g1FocusMode=!g1FocusMode;
   if(g1FocusMode){g1PreviousTab=app.activeTab;if(app.activeTab!=='map')navigation.activate('map');}
   document.body.classList.toggle('g1-map-focus',g1FocusMode);
   $('atlasFocusToggle').setAttribute('aria-pressed',String(g1FocusMode));
   $('atlasFocusToggle').setAttribute('aria-label',g1FocusMode?'전체 UI 표시':'전체 UI 숨기기');
   $('atlasFocusToggle').title=g1FocusMode?'UI 복원':'지도 집중 모드';
   if(!g1FocusMode&&g1PreviousTab!=='map')navigation.activate(g1PreviousTab);
   requestAnimationFrame(()=>map.resize());
 });
 $('tileInspectorClose').addEventListener('click',()=>{atlasInspectorOpen=false;syncAtlasLayout();});
 let atlasSettingsOpen=true;
let atlasStatsOpen=true;
let atlasTabsOpen=true;
let atlasLegendOpen=false;
let atlasMapCover=true;
let atlasInspectorOpen=window.matchMedia('(min-width: 721px)').matches;
function syncAtlasLayout(){
  const active=app.activeTab==='map';
  document.body.classList.toggle('atlas-mode',active);
  document.body.classList.toggle('atlas-tabs-collapsed',active&&!atlasTabsOpen);
  $('atlasTabsToggle').setAttribute('aria-expanded',String(atlasTabsOpen));
  $('atlasTabsToggle').setAttribute('aria-label',atlasTabsOpen?'하단 탭 접기':'하단 탭 펼치기');
  $('atlasTabsToggle').title=atlasTabsOpen?'하단 탭 접기':'하단 탭 펼치기';
  $('atlasTabsToggle').textContent=atlasTabsOpen?'›':'‹';
  for(const btn of document.querySelectorAll('.bottom-tab'))btn.tabIndex=active&&!atlasTabsOpen?-1:0;
  document.body.classList.toggle('atlas-cover',active&&atlasMapCover);
  document.body.classList.toggle('atlas-settings-collapsed',active&&!atlasSettingsOpen);
  document.body.classList.toggle('atlas-stats-collapsed',active&&!atlasStatsOpen);
  $('atlasStatsToggle').setAttribute('aria-expanded',String(atlasStatsOpen));
  $('atlasStatsToggle').setAttribute('aria-label',atlasStatsOpen?'세계 현황 접기':'세계 현황 펼치기');
  $('atlasStatsToggle').title=atlasStatsOpen?'세계 현황 접기':'세계 현황 펼치기';
  $('atlasStatsToggle').textContent=atlasStatsOpen?'⌃':'⌄';
  document.body.classList.toggle('atlas-legend-open',active&&atlasLegendOpen);
  $('atlasSettingsToggle').setAttribute('aria-expanded',String(atlasSettingsOpen));
  $('atlasSettingsToggle').setAttribute('aria-label',atlasSettingsOpen?'지도 설정 접기':'지도 설정 펼치기');
  $('atlasSettingsToggle').title=atlasSettingsOpen?'지도 설정 접기':'지도 설정 펼치기';
  $('atlasLegendToggle').setAttribute('aria-expanded',String(atlasLegendOpen));
   $('atlasLegendToggle').textContent=atlasLegendOpen?'◇ 범례 숨기기':'◇ 범례 보기';
   $('atlasLegendToggle').title=atlasLegendOpen?'범례 숨기기':'범례 보기';
  document.body.classList.toggle('atlas-inspector-open',active&&atlasInspectorOpen);
  document.body.classList.toggle('atlas-inspector-hidden',active&&!atlasInspectorOpen);
  $('atlasMapFitToggle').textContent=atlasMapCover?'◧ 지도 전체':'▣ 화면 채움';
  $('atlasMapFitToggle').setAttribute('aria-pressed',String(atlasMapCover));
  $('atlasInspectorToggle').textContent=atlasInspectorOpen?'◧ 정보 숨기기':'◩ 타일 정보';
  $('atlasInspectorToggle').setAttribute('aria-expanded',String(atlasInspectorOpen));
  requestAnimationFrame(()=>map.resize());
}
$('atlasTabsToggle').addEventListener('click',()=>{atlasTabsOpen=!atlasTabsOpen;syncAtlasLayout();});
$('atlasStatsToggle').addEventListener('click',()=>{atlasStatsOpen=!atlasStatsOpen;syncAtlasLayout();});
$('atlasSettingsToggle').addEventListener('click',()=>{atlasSettingsOpen=!atlasSettingsOpen;syncAtlasLayout();});
$('atlasLegendToggle').addEventListener('click',()=>{atlasLegendOpen=!atlasLegendOpen;syncAtlasLayout();});
$('atlasMapFitToggle').addEventListener('click',()=>{
  atlasMapCover=!atlasMapCover;syncAtlasLayout();requestAnimationFrame(()=>map.resetView());
});
$('atlasInspectorToggle').addEventListener('click',()=>{atlasInspectorOpen=!atlasInspectorOpen;syncAtlasLayout();});
// Selecting a tile opens the inspector on small screens without altering the selection logic.
const originalMapSelection=map.onSelect;
map.onSelect=(id)=>{
  originalMapSelection(id);
  const fortSelected=app.world.defenses.some(d=>d.tileId===id&&(d.status==='ACTIVE'||d.status==='UPGRADING'))&&map.defenseLabelMode!=='off';
  if(!g1FocusMode&&window.innerWidth<=720&&!atlasInspectorOpen&&app.activeTab==='map'&&!fortSelected){
    atlasInspectorOpen=true;syncAtlasLayout();
  }
};
syncAtlasLayout();

d2aWireMapControls(map);
d2bWireControls(map);

// 브라우저 테스트 및 외부 진단용: 현재 시뮬레이션 데이터를 직접 바꾸지 않는 최소 API
window.VILOBLight=Object.freeze({version:VERSION,getSummary:()=>worldSummary(app.world),getSeed:()=>app.world.seed,getSelected:()=>app.selectedId,getSIM:()=>({...app.simMeter}),getAutoSpeed:()=>({...app.autoSpeed}),getActiveTab:()=>app.activeTab,getCultureAudit:()=>d1CultureAudit(app.world),getAssimilationAudit:()=>e4Audit(app.world),getViolenceAudit:()=>v06e5Audit(app.world),getPolicyAIAudit:()=>v06e6Audit(app.world),getE7ADiagnostics:()=>v06e7aAudit(app.world),getF1SupplyStats:()=>({...f1SupplyGraphStats,enabled:f1SupplyGraphEnabled}),getF2RouteStats:()=>({...f2RouteStats,enabled:f2RoutePrefilterEnabled}),getF4AIntegrationAudit:()=>v06f4aIntegrationAudit(app.world),getF4BRouteStats:()=>({...f4bRouteStats,enabled:f4bRouteReuseEnabled}),getF4CSupplyMode:()=>({optimized:f4cFastSupplyEnabled}),getCombatObservation:()=>v07d2Observation(app.world),getG1Diagnostics:()=>g1Report(app.world),getG2Diagnostics:()=>g1Report(app.world),getG3Diagnostics:()=>g1Report(app.world),getG5Doctrine:()=>g5Summary(app.world),getG4CombatRules:()=>({version:VERSION,machineGunnerAmmoFactor:2,aiMachineGunnerRatioTarget:0.25,aiMachineGunnerRatioMax:0.35,armor:Object.fromEntries(Object.values(ARMORS).map(a=>[a.id,{armor:a.armor,damageReductionPct:Number((100*(1-g4ArmorMultiplier(a.id))).toFixed(1))}])),penetration:G4_FIREARM_PENETRATION,closeShot:G4_CLOSE_SHOT_FACTOR}),getMarket:()=>e3eMarketSummary(app.world),getIndustry:()=>f1IndustrySummary(app.world),getCoalDeposits:()=>({version:VERSION,dayIndex:app.world.dayIndex,deepYieldPct:F2B1_DEEP_YIELD_PERMILLE/10,nations:app.world.nations.filter(n=>n.active).map(n=>({id:n.id,name:n.name,...f2b1CoalSeamSummary(app.world,n.id)}))}),getFactories:()=>f2FactorySummary(app.world),getArtilleryAI:()=>app.world.nations.filter(n=>n.active).map(n=>({id:n.id,name:n.name,era:n.civilization?.era,stage:n.civilization?.stage,artillery:n.f2cArsenal?.lastArtilleryDecision??null,arsenal:n.f2cArsenal?.lastDecision??null,shells:n.resources.artillery_shells||0}))});
setWorld(createWorld('vilob-light-01',39,21,{profiles:persistentProfiles}));
h1bWireMilitaryUI();
v07d2WireObservationUI();
g1WireUI();

// H1B: top-level military pages. Observing machines never changes nation selection.
function h1bSyncMilitaryPage(){
 const regular=document.getElementById('h1bMilitaryOverview'),automaton=document.getElementById('h1bAutoPage');
 if(!regular||!automaton)return;
 const isAuto=app.h1bMilitaryPage==='automaton';regular.hidden=isAuto;automaton.hidden=!isAuto;
 for(const [id,active] of [['h1bMilitaryRegularBtn',!isAuto],['h1bMilitaryAutoBtn',isAuto]]){
  const button=document.getElementById(id);button?.classList.toggle('active',active);
  if(button){button.setAttribute('aria-pressed',String(active));if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
 }
}
function h1bSetMilitaryPage(page){
 app.h1bMilitaryPage=page==='automaton'?'automaton':'regular';
 if(page==='automaton'){
  app.h1bAutoScope='world';app.i0AutoTab='overview';app.h1bAutoArmyFilter='all';app.h1bAutoArmyPage=0;
 }
 h1bSyncMilitaryPage();
 if(app.h1bMilitaryPage==='automaton')h1bRenderAutomaton();
}
function h1bWireMilitaryUI(){
 document.getElementById('h1bMilitaryRegularBtn').addEventListener('click',()=>h1bSetMilitaryPage('regular'));
 document.getElementById('h1bMilitaryAutoBtn').addEventListener('click',()=>h1bSetMilitaryPage('automaton'));
 h1bSyncMilitaryPage();
}
function h1bElem(tag,cls,textContent,parent){
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(textContent!==undefined&&textContent!==null)el.textContent=String(textContent);
 if(parent)parent.append(el);return el;
}
function h1bMetric(parent,label,value){
 const div=h1bElem('div','h1b-auto-kpi',null,parent);h1bElem('span',null,label,div);h1bElem('strong',null,typeof value==='string'?value:number.format(value),div);
}
function h1bCard(parent,title){const card=h1bElem('section','h1b-auto-card',null,parent);if(title)h1bElem('h3',null,title,card);return card;}
function h1bNationStats(w,n){
 const inv=n.hAutomaton||hMakeInventory();const groups=(w.hAutomaton?.groups||[]).filter(g=>g.ownerNationId===n.id);
 const count=key=>groups.reduce((s,g)=>s+g[key],0);
 const ready=count('ready'),damaged=count('damaged'),disabled=count('disabled');
 const fueling=groups.reduce((s,g)=>s+(g.fueled===false?0:g.ready+g.damaged),0);
 const repairing=w.armies.filter(a=>a.nationId===n.id&&a.hRepairPlan).reduce((s,a)=>s+a.hRepairPlan.amount,0);
 return {inv,ready,damaged,disabled,deployed:ready+damaged+disabled,fueling,repairing,front:groups.filter(g=>g.position==='front').reduce((s,g)=>s+hAliveMachine(w,g),0),rear:groups.filter(g=>g.position==='rear').reduce((s,g)=>s+hAliveMachine(w,g),0),
  fuelBill:Math.ceil(groups.reduce((s,g)=>s+(g.ready+g.damaged)*h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision).fuelFactor,0)/8),fuelGold:4*Math.ceil(groups.reduce((s,g)=>s+(g.ready+g.damaged)*h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision).fuelFactor,0)/8),
  parts:Math.min(...H_SLOT_KEYS.map(k=>inv.parts?.[k]||0))};
}
function h1bResultReason(w,n,act){
 if(!n.active)return '멸망한 국가';
 if(n.controller!=='PLAYER')return 'AI 조종 국가 · 직접 조종으로 전환해야 명령 가능';
 if(!hUnlocked(w,n.id))return '산업 근대 III 및 오토마톤 제작 기술 필요';
 if(!hFactory(w,n.id))return '가동 중인 자국 공장 필요';
 if(!hWorksite(w,n.id))return '안전한 자국 작업 정착지 필요';
 if(act.type==='H_REFIT'){
  const a=getArmy(w,act.armyId);
  if(!a||a.nationId!==n.id)return '대상 부대 없음';
  if(!h2bEligibleRefit(w,a,n.id))return '안전한 정지·무명령 READY 부대만 개장 가능';
  if(!H2B_REFIT_PRICE[act.blueprintId]||!h2aCanDesign(w,n.id,act.blueprintId))return '개장 설계 기술 미보유';
  if(h2bRefittable(w,a)<act.amount)return '정상 가동 중인 기본 경량형 기체 부족';
 }
 if(act.type==='H_REPAIR'){
  if(!hasTech(w,n.id,'automaton_maintenance'))return '기계 장비 정비 표준 기술 필요';
  const a=getArmy(w,act.armyId);
  if(!a||a.nationId!==n.id)return '대상 부대를 찾을 수 없음';
  if(a.hRepairPlan||a.status==='REGROUP')return '이미 재편·수리 중';
  if(a.status!=='READY'||a.engagementId!==null)return '교전·후퇴 등 명령 불가 상태';
  if(a.order||a.operation||a.rearmPlan||a.g5RedeployPlan)return '이동·작전·재무장 등 다른 명령 수행 중';
  if(!atSafeSettlement(w,a))return '안전한 자국 정착지에 주둔해야 수리 가능';
 }
 if(act.type==='H_DEPLOY'&&act.armyId!=null){
  const a=getArmy(w,act.armyId);
  if(a?.order||a?.operation)return '부대가 이동·작전 명령 수행 중';
  if(a?.status!=='READY'||a?.engagementId!==null)return '부대가 배치 불가 상태';
  if(!atSafeSettlement(w,a))return '안전한 자국 정착지에 있어야 배치 가능';
 }
 if(act.type==='H_DEPLOY'&&act.armyId==null&&!hasTech(w,n.id,'automaton_field_control'))return '자율기계 야전 통제 기술 필요';
 if((act.type==='H_ASSEMBLE'||act.type==='H_DEPLOY')&&!h2gCanDesign(w,n.id,h2aActionDesign(act),act.revision))return '선택한 기종의 기술 조건 미충족';
 if(act.type==='H_ASSEMBLE'&&!H_SLOT_KEYS.every(k=>n.hAutomaton.h2g.stock[H2A_DESIGNS[act.blueprintId]?H2G_BASE_IDS[k]:h2gResolve(w,n.id,act.blueprintId,act.revision)?.moduleIds[k]]>=act.amount))return '선택한 설계에 필요한 개별 파츠 재고 부족';
 if(act.type==='H_DEPLOY'&&h2gStored(w,n.id,h2aActionDesign(act),act.revision)<act.amount)return '선택 설계 개정판의 창고 기체 부족';
 if(!hLegal(w,n.id,act))return '부대 상한·수리 대상 수량·편성 등 규칙 조건 불충족';
 const price=hActionPrice(w,n.id,act);
 if(!canAfford(n,price)){
  const missing=[];
  if(n.apUnits<price.apUnits)missing.push('AP '+((price.apUnits-n.apUnits)/10).toFixed(1));
  if(n.gold<price.gold)missing.push('Gold '+(price.gold-n.gold));
  for(const [id,qty] of Object.entries(price.resources||{}))if((n.resources[id]||0)<qty)missing.push(id+' '+(qty-(n.resources[id]||0)));
  return '부족: '+missing.join(' · ');
 }
 return '';
}
function h1bActionButton(parent,w,n,label,act){
 const reason=h1bResultReason(w,n,act),wrap=h1bElem('div','h1b-auto-actions',null,parent);
 const button=h1bElem('button',null,label,wrap);button.type='button';button.disabled=Boolean(reason);
 if(reason){button.title=reason;h1bElem('span','h1b-auto-muted',reason,wrap);}
 button.addEventListener('click',()=>{
  // Re-check permission and official execution conditions at the moment of clicking.
  const current=w.nations[n.id],why=h1bResultReason(w,current,act);
  if(why){showToast(why);h1bRenderAutomaton();return;}
  const result=issuePlayerAction(n.id,act);
  if(result.ok){refreshSimulationView(true);h1bRenderAutomaton();}
 });
 return button;
}
function h1bSetScope(value){
 app.h1bAutoScope=value;app.h1bAutoArmyFilter='all';app.h1bAutoArmyPage=0;app.i0AutoArmyQuery='';app.i0AutoArmyId=null;app.h1bAssembleAmount=8;app.h2aSelectedBlueprint=H_BLUEPRINT.id;app.h2gSelectedRevision=2;app.h2gDraft=null;app.h2gEditingId=null;
 h1bRenderAutomaton();
}

function h2cRenderPanel(w,root){
 const o=h2cEnsure(w),card=h1bCard(root,'전투·군수 누적 관측');
 const info=h1bElem('p','h1b-auto-muted',`관측 ${o.startedDay}일 → ${w.dayIndex}일 · ${Math.max(0,w.dayIndex-o.startedDay)}일 분량 · H2C 적용 이전 과거는 소급하지 않음. 게임 규칙·RNG 비변경.`,card);
 const toolbar=h1bElem('div','h1b-auto-toolbar',null,card);
 const toggleLabel=h1bElem('label','h1b-auto-muted','기록 활성',toolbar),toggle=h1bElem('input',null,null,toggleLabel);toggle.type='checkbox';toggle.checked=o.enabled;
 toggle.addEventListener('change',()=>{o.enabled=toggle.checked;h1bRenderAutomaton();});
 h1bElem('label','h1b-auto-muted','기종 필터',toolbar);
 const typeSelect=h1bElem('select',null,null,toolbar);typeSelect.id='h2cTypeFilter';typeSelect.setAttribute('aria-label','H2C 관측 기종 필터');
 typeSelect.add(new Option('전체 기종','all'));
 for(const id of H2A_DESIGN_IDS)typeSelect.add(new Option(h2aDesign(id).blueprint.name,id));
 const nationFilter=app.h1bAutoScope==='world'?w.nations:[w.nations[Number(app.h1bAutoScope)]];
 for(const country of nationFilter||[])if(country)for(const id of Object.keys(country.hAutomaton?.h2g?.current||{})){
  const d=h2gResolve(w,country.id,id);if(d)typeSelect.add(new Option(country.name+' · '+d.blueprint.name,id));
 }
 if(!app.h2cTypeFilter||app.h2cTypeFilter!=='all'&&![...typeSelect.options].some(opt=>opt.value===app.h2cTypeFilter))app.h2cTypeFilter='all';
 typeSelect.value=app.h2cTypeFilter;typeSelect.addEventListener('change',()=>{app.h2cTypeFilter=typeSelect.value;h1bRenderAutomaton();});
 const scope=app.h1bAutoScope==='world'?null:Number(app.h1bAutoScope);
 const doc=h2cExport(w,scope,typeSelect.value==='all'?null:typeSelect.value);
 const buttons=h1bElem('div','h1b-auto-actions',null,card);
 for(const [label,format] of [['↓ 기종 실적 CSV','csv'],['↓ 기종 실적 JSON','json']]){
  const btn=h1bElem('button',null,label,buttons);btn.type='button';
  btn.addEventListener('click',()=>{const live=h2cExport(app.world,app.h1bAutoScope==='world'?null:Number(app.h1bAutoScope),app.h2cTypeFilter==='all'?null:app.h2cTypeFilter);
   download(`vilob-h2c-observation-day${app.world.dayIndex}.${format}`,format==='csv'?h2cCsv(live):JSON.stringify(live,null,2),format==='csv'?'text/csv;charset=utf-8':'application/json');});
 }
 h1bElem('p','h1b-auto-muted','전투 공격력은 단계별 실제 계산 기여량이며 적군 사살 수가 아닙니다. 손상/정지/파괴는 단계 전이 횟수(동일 기체 중복 가능). 탄약·연료는 국가 단위 공동 실지출로 기록하며 기종별 비용으로 임의 배분하지 않습니다.',card);
 const wrap=h1bElem('div','h1b-auto-tablewrap',null,card),table=h1bElem('table','h1b-auto-table',null,wrap),head=h1bElem('tr',null,null,h1bElem('thead',null,null,table));
 for(const name of ['국가','기종','준비/손상/정지','개전·지속·접촉·근접 기여','전투 손상/정지/파괴','야전 손상/정지/파괴','조립/배치/개장/수리','탄약 차단 노출'])h1bElem('th',null,name,head);
 const body=h1bElem('tbody',null,null,table);
 const fmt=x=>Number(x||0).toLocaleString('ko-KR',{maximumFractionDigits:2});
 for(const r of doc.rows){
  const tr=h1bElem('tr',null,null,body);
  for(const value of [r.nation,r.blueprint.replace(' 오토마톤',''),[r.ready,r.damaged,r.disabled].join('/'),H2C_PHASES.map(p=>fmt(r.phases[p].power)).join(' / '),
   [r.damageBattle.damaged,r.damageBattle.disabled,r.damageBattle.destroyed].join('/'),
   [r.damageField.damaged,r.damageField.disabled,r.damageField.destroyed].join('/'),
   [r.assembled,r.deployed,r.refitIn,r.repaired].join('/'),fmt(r.ammoBlocked)])h1bElem('td',null,String(value),tr);
 }
 const cost=h1bCard(root,'실제 군수비 지급');
 h1bElem('p','h1b-auto-muted','행동별 제작/조립/수리/개장 비용과 전투 탄약·분기 동력료를 분리합니다. 전투 탄약 및 동력료는 국가 단위 지출이며 기종별 독립 소모량이 아닙니다.',cost);
 const cwrap=h1bElem('div','h1b-auto-tablewrap',null,cost),ct=h1bElem('table','h1b-auto-table',null,cwrap),ch=h1bElem('tr',null,null,h1bElem('thead',null,null,ct));
 for(const label of ['국가','행동 Gold','행동 철','행동 석탄','행동 부품','사격 Gold / 철','사격 유료 / 차단','동력 Gold / 석탄','동력 성공 / 실패'])h1bElem('th',null,label,ch);
 const cb=h1bElem('tbody',null,null,ct);
 for(const r of doc.nationCosts){const tr=h1bElem('tr',null,null,cb);
  for(const v of [r.nation,r.paid.gold,r.paid.iron,r.paid.coal,r.paid.machine_parts,
   r.volley.gold+' / '+r.volley.iron,r.volley.paid+' / '+r.volley.blocked,
   r.power.gold+' / '+r.power.coal,r.power.paidQuarters+' / '+r.power.blockedQuarters])h1bElem('td',null,String(v),tr);
 }
}

function h2dRenderPanel(w,root){
 if(!H2D_ENABLED)return;
 const s=h2dEnsure(w),scope=app.h1bAutoScope==='world'?null:Number(app.h1bAutoScope);
 const doc=h2dExport(w,scope),card=h1bCard(root,'동력·군수 · 동력 공급 상태 및 결산 진단');
 h1bElem('p','h1b-auto-muted',`진단 시작 ${s.startedDay}일 → ${w.dayIndex}일 · H2C 이전 지급 실패의 원인은 재구성하지 않습니다. 전액 지급 시 H2C 원래 방식, 부족 시 실제 지불 가능한 그룹만 선택합니다.`,card);
 const buttons=h1bElem('div','h1b-auto-actions',null,card);
 for(const [format,label] of [['csv','↓ H2D 군수 진단 CSV'],['json','↓ H2D 군수 진단 JSON']]){
  const b=h1bElem('button',null,label,buttons);b.type='button';
  b.addEventListener('click',()=>{const d=h2dExport(app.world,app.h1bAutoScope==='world'?null:Number(app.h1bAutoScope));
   download(`vilob-h2d-logistics-day${app.world.dayIndex}.${format}`,format==='csv'?h2dCsv(d):JSON.stringify(d,null,2),format==='csv'?'text/csv;charset=utf-8':'application/json');});
 }
 const labels={FULL:'전액 공급',PARTIAL:'부분 공급',NONE:'공급 불가',IDLE:'청구 없음',GOLD_SHORT:'Gold 부족',COAL_SHORT:'석탄 부족',BOTH_SHORT:'Gold·석탄 부족'};
 const wrap=h1bElem('div','h1b-auto-tablewrap',null,card),table=h1bElem('table','h1b-auto-table',null,wrap);
 const head=h1bElem('tr',null,null,h1bElem('thead',null,null,table));
 for(const label of ['국가','직전 분기 공급','부족 원인','청구 G / 석탄','실제 지출 G / 석탄','가동 / 미가동','누적 전액/부분/불가','부족 원인 Gold/석탄/양쪽'])h1bElem('th',null,label,head);
 const body=h1bElem('tbody',null,null,table);
 for(const r of doc.nations){const l=r.last,tr=h1bElem('tr',null,null,body);
  for(const v of [r.nation,labels[l.status]||l.status,labels[l.cause]||'없음',l.dueGold+' / '+l.dueCoal,l.paidGold+' / '+l.paidCoal,
   l.funded+' / '+l.unfunded,[r.fullQuarters,r.partialQuarters,r.noneQuarters].join('/'),[r.causes.GOLD_SHORT,r.causes.COAL_SHORT,r.causes.BOTH_SHORT].join('/')])h1bElem('td',null,String(v),tr);
 }
 h1bElem('p','h1b-auto-muted',`누적 청구와 실지출은 H2D 관측 시작 이후만 집계합니다. 최근 부족 사건 최대 ${H2D_EVENT_LIMIT}건을 JSON/CSV에 기록하며, 기종별 독립 Gold·석탄 원가로 임의 배분하지 않습니다.`,card);
}

function h2eRenderPanel(w,root){
 const scope=app.h1bAutoScope==='world'?null:Number(app.h1bAutoScope);
 const doc=h2eExport(w,scope),card=h1bCard(root,'전술 분석 · 혼성군 배치·개장 전술 진단');
 h1bElem('p','h1b-auto-muted',`관측 ${doc.startedDay}일 → ${doc.endDay}일 · 배치·개장 시 실제 인간 전열/예비/후열과 동력 공급을 고려한 후보 우선순위. 점수는 예상 승률이나 사살 수가 아닙니다. 이전 버전의 과거는 소급하지 않습니다.`,card);
 const actions=h1bElem('div','h1b-auto-actions',null,card);
 for(const [format,label] of [['csv','↓ H2E 전술 진단 CSV'],['json','↓ H2E 전술 진단 JSON']]){
  const b=h1bElem('button',null,label,actions);b.type='button';
  b.addEventListener('click',()=>{const d=h2eExport(app.world,app.h1bAutoScope==='world'?null:Number(app.h1bAutoScope));
   download(`vilob-h2e-tactics-day${app.world.dayIndex}.${format}`,format==='csv'?h2eCsv(d):JSON.stringify(d,null,2),format==='csv'?'text/csv;charset=utf-8':'application/json');});
 }
 const wrap=h1bElem('div','h1b-auto-tablewrap',null,card),table=h1bElem('table','h1b-auto-table',null,wrap),header=h1bElem('tr',null,null,h1bElem('thead',null,null,table));
 for(const v of ['국가','누적 배치','누적 유상 개장','조건/자원 차단','최근 행동일','최근 부대','선택 기종','판단 점수'])h1bElem('th',null,v,header);
 const body=h1bElem('tbody',null,null,table);
 for(const r of doc.nations){const tr=h1bElem('tr',null,null,body),last=r.last;
  for(const x of [r.nation,r.deploy,r.refit,r.blocked,last?.day??'—',last?.armyId??'—',last?.blueprintId?h2aDesign(last.blueprintId).blueprint.name:'—',last?.score??'—'])h1bElem('td',null,String(x),tr);
 }
 const note=h1bCard(root,'전술 분석 · 최근 실제 AI 전술 선택');
 h1bElem('p','h1b-auto-muted','최근 최대 60건, 군대 제거 후에도 선택 당시 인적 편제 정보 유지. 기체 이동·무상 개장 없음.',note);
 const ww=h1bElem('div','h1b-auto-tablewrap',null,note),t=h1bElem('table','h1b-auto-table',null,ww),tr=h1bElem('tr',null,null,h1bElem('thead',null,null,t));
 for(const v of ['일자','국가','행동','대상 부대','기종','대수','당시 인간 전열/예비/후열','전술 점수'])h1bElem('th',null,v,tr);
 const tbody=h1bElem('tbody',null,null,t);
 for(const e of doc.events.slice(-24).reverse()){
  const row=h1bElem('tr',null,null,tbody);
  for(const x of [e.day,e.nation,e.kind,e.armyId??'독립 편제',e.blueprintId?(h2gResolve(w,e.nationId,e.blueprintId)?.blueprint.name||e.blueprintId):'—',e.amount,
   e.front===null?'—':`${e.front}/${e.reserve}/${e.rear}`,e.score??'—'])h1bElem('td',null,String(x),row);
 }
}

// H2J — nation-level design catalogue, including archived revisions and real inventory.
function h2jExport(w,nid=null){
 return {schema:'vilob-light-h2j-design-lineage-v1',version:VERSION,day:w.dayIndex,
  caveat:'Legacy AI intention labels are inferred retrospectively from actual fitted modules; no historic AI thought is invented. Revision-level destroyed totals are not separately attributed.',
  nations:w.nations.filter(n=>nid===null||n.id===nid).map(n=>({nationId:n.id,nation:n.name,
   models:h2jNationDesigns(w,n.id).map(m=>({id:m.id,currentRevision:m.current,
    observedDestroyedByModel:h2jModelDestroyed(w,n.id,m.id),
    revisions:m.revs.map(bp=>({id:bp.id,name:bp.name,revision:bp.revision,origin:bp.origin,modelNumber:bp.modelNumber||null,designIntent:bp.designIntent||null,intentReason:bp.intentReason||null,createdDay:bp.createdDay,
     moduleIds:h2gBpParts(bp),inventory:h2jRevisionInventory(w,n.id,m.id,bp.revision)}))})),
   sharedStandards:H2A_DESIGN_IDS.map(id=>({id,name:h2jDisplayName(H2A_DESIGNS[id].blueprint),inventory:h2jRevisionInventory(w,n.id,id,H2A_DESIGNS[id].blueprint.revision)}))}))};
}
function h2jRevisionInventory(w,nid,id,rev){
 const deployed=w.hAutomaton.groups.filter(g=>g.ownerNationId===nid&&g.blueprintId===id&&g.revision===rev);
 const qty=deployed.reduce((s,g)=>s+hAliveMachine(w,g),0),ready=deployed.reduce((s,g)=>s+g.ready,0);
 const damaged=deployed.reduce((s,g)=>s+g.damaged,0),disabled=deployed.reduce((s,g)=>s+g.disabled,0);
 const powered=deployed.reduce((s,g)=>s+(g.fueled===false?0:g.ready+g.damaged),0);
 const stored=H2A_DESIGNS[id]?(w.nations[nid].hAutomaton.storedByBlueprint[id]||0):w.nations[nid].hAutomaton.h2g.finished[id+'@'+rev]||0;
 return {qty,ready,damaged,disabled,powered,stored};
}
function h2jModelDestroyed(w,nid,id){
 const s=w.hAutomaton?.observation?.nations?.[nid]?.byType?.[id];
 return s?s.removedDestroyed+s.damageBattle.destroyed+s.damageField.destroyed:null;
}
function h2jNationDesigns(w,nid){
 const all=w.hAutomaton.blueprints.filter(bp=>bp.ownerNationId===nid&&/^h2g_n\d+_\d+$/.test(bp.id));
 const ids=[...new Set(all.map(x=>x.id))];
 return ids.map(id=>({id,revs:all.filter(x=>x.id===id).sort((a,b)=>a.revision-b.revision),current:w.nations[nid].hAutomaton.h2g.current[id]}))
  .filter(x=>x.revs.length).sort((a,b)=>{
   const aiA=h2jIsAi(a.revs[0]),aiB=h2jIsAi(b.revs[0]);
   return Number(aiB)-Number(aiA)||(a.revs[0].modelNumber||999)-(b.revs[0].modelNumber||999)||a.id.localeCompare(b.id);
  });
}
function h2jRenderPanel(w,root){
 const scope=app.h1bAutoScope==='world'?null:Number(app.h1bAutoScope);
 const card=h1bCard(root,'국가별 설계 계보');
 h1bElem('p','h1b-auto-muted','국가 고유 모델명 · 설계 의도 · 개정별 실물 현황. 구형 개정은 그대로 보존되며, 창고/배치 수는 실제 기체만 셉니다. AI/사용자 설계와 공통 표준형을 구분합니다.',card);
 if(scope===null){
  const wrap=h1bElem('div','h1b-auto-tablewrap',null,card),table=h1bElem('table','h1b-auto-table',null,wrap),tr=h1bElem('tr',null,null,h1bElem('thead',null,null,table));
  for(const label of ['국가','AI / 사용자 설계 계열','전체 개정','현재 주력 전열','현재 주력 후열','현역 / 창고'])h1bElem('th',null,label,tr);
  const body=h1bElem('tbody',null,null,table);
  for(const n of w.nations){
   const models=h2jNationDesigns(w,n.id),latest=models.map(m=>h2gResolve(w,n.id,m.id,m.current)).filter(Boolean),ai=latest.filter(x=>h2jIsAi(x.blueprint));
   const front=ai.find(d=>d.role==='front'),rear=ai.find(d=>d.role==='rear');
   const deployed=w.hAutomaton.groups.filter(g=>g.ownerNationId===n.id).reduce((a,g)=>a+hAliveMachine(w,g),0);
   const row=h1bElem('tr',null,null,body),cell=h1bElem('td',null,null,row),link=h1bElem('button','h1b-auto-country',n.name,cell);
   link.type='button';link.addEventListener('click',()=>h1bSetScope(String(n.id)));
   for(const value of [ai.length+' / '+(latest.length-ai.length),models.reduce((s,m)=>s+m.revs.length,0),front?h2jDisplayName(front.blueprint):'—',rear?h2jDisplayName(rear.blueprint):'—',deployed+' / '+n.hAutomaton.stored])h1bElem('td',null,String(value),row);
  }
  return;
 }
 const n=w.nations[scope],models=h2jNationDesigns(w,scope),allRevisions=models.reduce((a,m)=>a+m.revs.length,0),ai=models.filter(m=>h2jIsAi(m.revs[0]));
 const totals=w.hAutomaton.groups.filter(g=>g.ownerNationId===scope).reduce((a,g)=>a+hAliveMachine(w,g),0),metrics=h1bElem('div','h1b-auto-grid',null,card);
 for(const [k,v] of [['AI 모델',ai.length],['사용자 모델',models.length-ai.length],['전체 개정',allRevisions],['배치 실물',totals],['완제품 창고',n.hAutomaton.stored]])h1bMetric(metrics,k,v);
 const exportBtn=h1bElem('button',null,'H2J 국가별 설계·개정·실물 JSON 내보내기',card);exportBtn.type='button';
 exportBtn.addEventListener('click',()=>{
  const live=app.world;download('vilob-h2j-design-lineage-day'+live.dayIndex+'-nation'+scope+'.json',JSON.stringify(h2jExport(live,scope),null,2),'application/json');
 });
 if(!models.length)h1bElem('p','h1b-auto-empty','등록된 국가 고유 설계가 없습니다. 아래에 공통 표준 설계를 표시합니다.',card);
 const list=h1bElem('div','h1b-auto-list',null,card);
 for(const m of models){
  const latest=m.revs.find(x=>x.revision===m.current)||m.revs[m.revs.length-1],role=h2gResolve(w,scope,m.id,m.current)?.role;
  const sum=m.revs.reduce((acc,bp)=>{const x=h2jRevisionInventory(w,scope,m.id,bp.revision);acc.field+=x.qty;acc.warehouse+=x.stored;return acc;},{field:0,warehouse:0});
  const detail=h1bElem('details','h1b-auto-list-item h2j-model',null,list),header=h1bElem('summary','h2j-summary',null,detail);
  if(!app.i0ModelOpen)app.i0ModelOpen={};const modelKey=scope+'@'+m.id;detail.open=Boolean(app.i0ModelOpen[modelKey]);detail.addEventListener('toggle',()=>{app.i0ModelOpen[modelKey]=detail.open;});
  h1bElem('strong',null,h2jDisplayName(latest),header);
  h1bElem('span','h1b-auto-key',(h2jIsAi(latest)?'AI 개발':'사용자 설계')+' · '+(role==='front'?'전열':'후열')+' · '+m.revs.length+'개 개정',header);
  const destroyed=h2jModelDestroyed(w,scope,m.id);
  h1bElem('span','h1b-auto-muted',`현역 ${sum.field}대 · 창고 ${sum.warehouse}대 · ${destroyed===null?'파괴 기록 없음':'H2C 관측 파괴 '+destroyed+'대'}`,header);
  h1bElem('p','h1b-auto-muted',`모델 ID ${m.id} · 최신 R${m.current} · ${latest.designIntent||'사용자 지정'}${latest.origin==='AI'?' · '+latest.intentReason:''}`,detail);
  for(const bp of [...m.revs].reverse()){
   const d=h2gResolve(w,scope,m.id,bp.revision),real=h2jRevisionInventory(w,scope,m.id,bp.revision);
   if(!d)continue;
   const prior=m.revs.find(x=>x.revision===bp.revision-1),from=prior?h2gBpParts(prior):null,to=d.moduleIds;
   const changes=from?H_SLOT_KEYS.filter(slot=>from[slot]!==to[slot]).map(slot=>H2J_SLOT_LABELS[slot]+': '+(H2F_MODULES[slot][from[slot]]?.name||from[slot])+' → '+(H2F_MODULES[slot][to[slot]]?.name||to[slot])):[];
   const item=h1bElem('div','h2j-revision',null,detail);
   h1bElem('strong',null,`R${bp.revision} · ${h2jDisplayName(bp)} ${bp.revision===m.current?'· 최신':'· 이전 개정'}`,item);
   h1bElem('p','h1b-auto-muted',`등록 ${bp.createdDay??'—'}일 · 현역 ${real.qty} (준비 ${real.ready} / 손상 ${real.damaged} / 정지 ${real.disabled} / 동력 ${real.powered}) · 창고 ${real.stored}`,item);
   h1bElem('p','h1b-auto-muted',`HP ${d.hp} · 장갑 ${d.armor} · 관통 ${d.penetration} · 개시 ${d.opening.toFixed(2)} / 지속 ${d.sustained.toFixed(2)} / 근접 ${d.melee.toFixed(2)} · 연료 ×${d.fuelFactor}`,item);
   h1bElem('p','h1b-auto-muted','장착 파츠: '+H_SLOT_KEYS.map(slot=>H2J_SLOT_LABELS[slot]+' '+H2F_MODULES[slot][to[slot]].name).join(' · '),item);
   if(changes.length)h1bElem('p','h2j-change','개정 변경: '+changes.join(' / '),item);
   else if(prior)h1bElem('p','h1b-auto-muted','직전 개정과 파츠 구성 동일',item);
   const obs=w.hAutomaton.h2i?.nations?.[scope]?.observed?.[m.id+'@'+bp.revision];
   if(obs)h1bElem('p','h1b-auto-muted',`H2I 이후 관측: 교전 ${obs.engagements} · 손상 ${obs.damaged} · 비활성 ${obs.disabled} · 동력 공급 ${obs.funded}/${obs.funded+obs.unfunded} (실제 전과 아님)`,item);
  }
 }
 const common=h1bElem('details','h1b-auto-list-item h2j-model',null,card),summary=h1bElem('summary','h2j-summary',null,common);
 const standardKey=scope+'@standard';common.open=Boolean(app.i0ModelOpen?.[standardKey]);common.addEventListener('toggle',()=>{if(!app.i0ModelOpen)app.i0ModelOpen={};app.i0ModelOpen[standardKey]=common.open;});
 h1bElem('strong',null,'공통 표준 설계 · 3종',summary);
 h1bElem('span','h1b-auto-muted','국가 자체 개발 모델이 아니므로 국가명 미부여',summary);
 for(const id of H2A_DESIGN_IDS){const d=h2aDesign(id),real=h2jRevisionInventory(w,scope,id,d.blueprint.revision);
  h1bElem('p','h1b-auto-muted',`${h2jDisplayName(d.blueprint)} · ${d.role==='front'?'전열':'후열'} · 현역 ${real.qty} · 창고 ${real.stored}`,common);
 }
}

function h2hRenderPanel(w,root){
 const card=h1bCard(root,'AI 설계 및 생산 전략');
 h1bElem('p','h1b-auto-muted','AI 성향별 점수 공식과 실제 교전·피해·동력 결산으로 학습하며, 조건 충족 시 설계를 개정합니다. 역사 데이터는 학습에 소급하지 않습니다.',card);
 const nations=w.nations.filter(n=>app.h1bAutoScope==='world'||String(n.id)===app.h1bAutoScope);
 const scroll=h1bElem('div','h1b-auto-tablewrap',null,card),table=h1bElem('table','h1b-auto-table',null,scroll),head=h1bElem('tr',null,null,h1bElem('thead',null,null,table));
 for(const label of ['국가','상태','전략 설계','역할','생산 단계','제작','조립','배치','개장','억제','차단 원인','마지막 행동(수량)'])h1bElem('th',null,label,head);
 const tb=h1bElem('tbody',null,null,table);
 for(const n of nations){const r=h2hEnsure(w).nations[n.id],d=r.designId?h2gResolve(w,n.id,r.designId,r.revision):null,tr=h1bElem('tr',null,null,tb);
  for(const value of [n.name,n.controller,d?.blueprint.name||'—',r.role==='front'?'전열':r.role==='rear'?'후열':'—',r.phase,r.parts+r.upgrades,r.assemblies,r.deployments,r.refits,r.suppressed,r.blocked||'—',r.lastAction?`${r.lastAction.kind} (${r.lastAction.amount||0})`:'—'])h1bElem('td',null,String(value),tr);
 }
 const btn=h1bElem('button',null,'H2H AI 설계·생산 관측 JSON 내보내기',card);btn.type='button';
 btn.addEventListener('click',()=>download('vilob-h2h-ai-day'+w.dayIndex+'.json',JSON.stringify(h2hExport(w,app.h1bAutoScope==='world'?null:Number(app.h1bAutoScope)),null,2),'application/json'));
}

function h2iRenderPanel(w,root){
 const card=h1bCard(root,'오토마톤 설계 학습과 진화');
 h1bElem('p','h1b-auto-muted','교전 출력은 적에게 실제로 입힌 피해량이 아닌 전투 기여 대리 지표. 설계 개정별로 이번 패치 이후만 관측합니다. 국가는 공격·생존·가동·경제성 점수와 학습 속도가 각각 다릅니다.',card);
 const scope=app.h1bAutoScope==='world'?null:Number(app.h1bAutoScope),ns=w.nations.filter(n=>scope===null||n.id===scope),d=h2iExport(w,scope);
 const wrap=h1bElem('div','h1b-auto-tablewrap',null,card),t=h1bElem('table','h1b-auto-table',null,wrap),head=h1bElem('tr',null,null,h1bElem('thead',null,null,t));
 for(const name of ['국가','전열 공격/방어/경제/가동 가중치','후열 공격/방어/경제/가동 가중치','전열/후열 학습','개정','예비 창고 이동','동력 청구 적자 분기'])h1bElem('th',null,name,head);
 const body=h1bElem('tbody',null,null,t);
 for(const n of ns){const r=d.nations.find(x=>x.nationId===n.id),fmt=x=>[x.attack,x.survival,x.economy,x.uptime].map(v=>v.toFixed(2)).join(' / '),tr=h1bElem('tr',null,null,body);
  for(const v of [n.name,fmt(r.frontDoctrine),fmt(r.rearDoctrine),r.roles.front.updates+' / '+r.roles.rear.updates,r.redesigns,r.reserved,r.economy.strikes])h1bElem('td',null,String(v),tr);
 }
 const buttons=h1bElem('div','h1b-auto-actions',null,card),btn=h1bElem('button',null,'H2I 학습·설계 개정 JSON 내보내기',buttons);btn.type='button';
 btn.addEventListener('click',()=>download('vilob-h2i-learning-day'+app.world.dayIndex+'.json',JSON.stringify(h2iExport(app.world,app.h1bAutoScope==='world'?null:Number(app.h1bAutoScope)),null,2),'application/json'));
 const recent=h1bCard(root,'최근 학습 및 설계 변경');
 for(const e of d.events.slice(-16).reverse())h1bElem('p','h1b-auto-muted',`${e.day}일 · ${w.nations[e.nationId]?.name||''} · ${e.kind} · ${e.detail||''}${e.designId?' · '+e.designId+' 개정 '+(e.revision||''):''}`,recent);
}

// V0.7I0: four purpose-focused, UI-only panes; no save/world state or RNG changes.
const I0_AUTO_TABS=[['overview','현황'],['design','설계·제작'],['operations','운용·정비'],['analysis','분석·기록']];
function i0SwitchAutoTab(next){
 if(!I0_AUTO_TABS.some(([key])=>key===next))return;
 app.i0AutoTab=next;
 if(next==='operations'&&app.h1bAutoArmyFilter==='all')app.h1bAutoArmyFilter='machines';
 h1bRenderAutomaton();
 document.getElementById('i0AutoTab-'+next)?.focus({preventScroll:true});
}
function i0Action(parent,label,tab){
 const b=h1bElem('button','i0-link-button',label,parent);b.type='button';b.addEventListener('click',()=>i0SwitchAutoTab(tab));return b;
}
function i0LazyBlock(root,key,label,render){
 const d=h1bElem('details','i0-disclosure',null,root);
 const title=h1bElem('summary',null,label,d),content=h1bElem('div','i0-disclosure-content',null,d);
 let populated=false;
 const paint=()=>{if(!populated){render(content);populated=true;}};
 d.open=Boolean(app.i0OpenBlocks[key]);
 if(d.open)paint();
 d.addEventListener('toggle',()=>{app.i0OpenBlocks[key]=d.open;if(d.open)paint();});
 return d;
}
function i0NationOverview(w,n,root){
 const x=h1bNationStats(w,n),inv=x.inv,card=h1bCard(root,n.name+' · 운용 현황'+(n.active?'':' · 멸망'));
 const grid=h1bElem('div','h1b-auto-grid i0-core-grid',null,card);
 for(const [label,value] of [['전체 보유',x.deployed+inv.stored],['현역',x.deployed],['준비 상태',x.ready],['창고',inv.stored],['손상·정지',x.damaged+x.disabled],['전열 / 후열',x.front+' / '+x.rear]])h1bMetric(grid,label,value);
 h1bElem('p','h1b-auto-muted',`AI 목표 ${number.format(h2kTarget(w,n))}대 · 공장 능력 ${h2kFactoryStrength(w,n.id)} · 1회 조립 ${h2kBatch(w,n.id)}대 · 분기 연료 석탄 ${x.fuelBill} / Gold ${x.fuelGold} · 동력 공급 ${x.fueling}대`,card);
 const actions=h1bElem('div','i0-jump-actions',null,card);
 i0Action(actions,'설계 계보·제작 보기','design');i0Action(actions,'부대 배치·정비 보기','operations');
 const strategies=h1bCard(root,'국가 대표 설계 · 현재 개정'),models=h2jNationDesigns(w,n.id);
 const latest=models.map(m=>h2gResolve(w,n.id,m.id,m.current)).filter(Boolean);
 for(const role of ['front','rear']){
  const best=latest.filter(d=>h2jIsAi(d.blueprint)&&d.role===role).sort((a,b)=>b.blueprint.createdDay-a.blueprint.createdDay)[0];
  const line=h1bElem('div','i0-feature-row',null,strategies);
  h1bElem('strong',null,role==='front'?'전열 설계':'후열 설계',line);
  h1bElem('span',null,best?h2jDisplayName(best.blueprint):'AI 고유 설계 없음',line);
 }
 h1bElem('p','h1b-auto-muted',`국가 고유 설계 ${models.length}계열 · 기체 누적 조립 ${number.format(inv.built)} · 파괴·제거 ${number.format(inv.destroyed)} · 수리 ${number.format(inv.repairs)}`,strategies);
 const r=h2hEnsure(w).nations[n.id];
 const aiCard=h1bCard(root,'산업·운용 판단');
 h1bElem('p','h1b-auto-muted',`현재 생산 단계 ${r.phase||'—'} · 최근 행동 ${r.lastAction?r.lastAction.kind+' '+(r.lastAction.amount||0)+'대':'기록 없음'} · 생산 제약 ${r.blocked||'기록 없음'}`,aiCard);
}
function i0WorldOverview(w,root){
 const rows=w.nations.map(n=>({n,x:h1bNationStats(w,n)})),active=rows.filter(r=>r.n.active);
 const sum=(list,f)=>list.reduce((v,r)=>v+f(r),0);
 const card=h1bCard(root,'세계 오토마톤 운용 현황'),grid=h1bElem('div','h1b-auto-grid i0-core-grid',null,card);
 for(const [k,v] of [['운용 국가',active.length],['현역',sum(active,r=>r.x.deployed)],['창고',sum(active,r=>r.x.inv.stored)],['준비 상태',sum(active,r=>r.x.ready)],['손상·정지',sum(active,r=>r.x.damaged+r.x.disabled)],['동력 공급',sum(active,r=>r.x.fueling)]])h1bMetric(grid,k,v);
 h1bElem('p','h1b-auto-muted','국가를 선택하면 해당 국가의 설계·제작·부대 운용을 관리할 수 있습니다. 전 세계 비교는 관측 전용입니다.',card);
 const comp=h1bCard(root,'국가별 운용 비교'),wrap=h1bElem('div','h1b-auto-tablewrap',null,comp),t=h1bElem('table','h1b-auto-table',null,wrap),tr=h1bElem('tr',null,null,h1bElem('thead',null,null,t));
 for(const k of ['국가','현역','창고','준비','손상·정지','연료 공급'])h1bElem('th',null,k,tr);
 const tb=h1bElem('tbody',null,null,t);
 for(const {n,x} of rows){const row=h1bElem('tr',null,null,tb),cell=h1bElem('td',null,null,row),btn=h1bElem('button','h1b-auto-country',n.name+(!n.active?' †':''),cell);btn.type='button';btn.addEventListener('click',()=>h1bSetScope(String(n.id)));
  for(const v of [x.deployed,x.inv.stored,x.ready,x.damaged+x.disabled,x.fueling])h1bElem('td',null,number.format(v),row);
 }
}
function h1bRenderAutomaton(){
 if(!app.world||app.activeTab!=='military'||app.h1bMilitaryPage!=='automaton')return;
 const body=document.getElementById('h1bAutoBody');if(!body)return;
 const w=app.world;hInit(w);body.replaceChildren();
 const root=h1bElem('div','h1b-auto i0-auto',null,body);
 const top=h1bCard(root),header=h1bElem('div','h1b-auto-header',null,top),intro=h1bElem('div',null,null,header);
 h1bElem('h2',null,'⚙ 오토마톤',intro);
 h1bElem('p','h1b-auto-muted','국가별 설계·생산·운용 관리 · 분석 자료는 별도 보기',intro);
 const label=h1bElem('label',null,'조회 범위',header),scope=h1bElem('select',null,null,label);
 scope.id='h1bScope';scope.setAttribute('aria-label','오토마톤 조회 국가');
 scope.add(new Option('전 세계','world'));
 for(const n of w.nations)scope.add(new Option(n.name+(!n.active?' (멸망)':''),String(n.id)));
 if(app.h1bAutoScope!=='world'&&!w.nations[Number(app.h1bAutoScope)])app.h1bAutoScope='world';
 scope.value=app.h1bAutoScope;scope.addEventListener('change',()=>h1bSetScope(scope.value));
 if(!I0_AUTO_TABS.some(([key])=>key===app.i0AutoTab))app.i0AutoTab='overview';
 const nav=h1bElem('div','i0-auto-tabs',null,root);nav.setAttribute('role','tablist');nav.setAttribute('aria-label','오토마톤 관리 항목');
 for(const [key,text] of I0_AUTO_TABS){const b=h1bElem('button','i0-auto-tab'+(app.i0AutoTab===key?' is-active':''),text,nav);
  b.type='button';b.id='i0AutoTab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls','i0AutoPane');b.setAttribute('aria-selected',String(app.i0AutoTab===key));b.tabIndex=app.i0AutoTab===key?0:-1;
  b.addEventListener('click',()=>i0SwitchAutoTab(key));
  b.addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft'&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();const i=I0_AUTO_TABS.findIndex(([k])=>k===key),next=e.key==='Home'?0:e.key==='End'?3:(i+(e.key==='ArrowRight'?1:3))%4;i0SwitchAutoTab(I0_AUTO_TABS[next][0]);});
 }
 const pane=h1bElem('div','i0-auto-pane',null,root);pane.id='i0AutoPane';pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby','i0AutoTab-'+app.i0AutoTab);
 const nid=app.h1bAutoScope==='world'?null:Number(app.h1bAutoScope),n=nid===null?null:w.nations[nid];
 if(app.i0AutoTab==='overview'){
  if(n)i0NationOverview(w,n,pane);else i0WorldOverview(w,pane);
 }else if(app.i0AutoTab==='design'){
  h2jRenderPanel(w,pane);
  if(n)h1bRenderNationProduction(w,n,pane);
  else h1bElem('p','h1b-auto-note','국가 고유 설계·제작 기능을 사용하려면 위에서 국가를 선택하세요.',pane);
 }else if(app.i0AutoTab==='operations'){
  if(n)h1bRenderNationOperations(w,n,pane);
  else h1bElem('p','h1b-auto-note','배치·수리·개장을 관리하려면 위에서 국가를 선택하세요. 세계 비교는 현황에 있습니다.',pane);
 }else{
  const activeScope=app.h1bAutoScope;
  i0LazyBlock(pane,'record-'+activeScope,'운용 이벤트 · 최근 기록',host=>h1bRenderHistory(w,host,nid));
  if(!n)i0LazyBlock(pane,'account-world','세계 기체·파츠 보존 기록',host=>h1bRenderWorldAccounting(w,host));
  i0LazyBlock(pane,'combat-'+activeScope,'전투 실적 및 실제 군수비',host=>{h2cRenderPanel(w,host);h2dRenderPanel(w,host);});
  i0LazyBlock(pane,'tactics-'+activeScope,'전술·배치 분석 및 AI 생산 전략',host=>{h2eRenderPanel(w,host);h2hRenderPanel(w,host);});
  i0LazyBlock(pane,'learning-'+activeScope,'설계 학습·개정 기록',host=>h2iRenderPanel(w,host));
  h1bElem('p','h1b-auto-muted','고급 분석을 펼치면 기존 전투·동력·전술·AI 학습 자료와 CSV/JSON 내보내기 도구를 사용할 수 있습니다.',pane);
 }
}
function h1bRenderWorldAccounting(w,root){
 const rows=w.nations.map(n=>({n,x:h1bNationStats(w,n)})),activeRows=rows.filter(r=>r.n.active);
 const total=(collection,key)=>collection.reduce((s,r)=>s+(key==='stored'||key==='built'||key==='destroyed'?r.x.inv[key]:r.x[key]),0);
 const all=rows;
 const historical=h1bCard(root,'생산 · 소실 · 재고 보존');
 h1bElem('p','h1b-auto-muted',`전체 ${w.nations.length}개국 역사 누계: 조립 ${number.format(total(all,'built'))}대 = 현재 배치 ${number.format(total(all,'deployed'))} + 창고 ${number.format(total(all,'stored'))} + 파괴·제거 ${number.format(total(all,'destroyed'))}. 국가별 보존식도 저장 검증에서 확인됩니다.`,historical);
 const parts=h1bCard(root,'부품 및 운용 제약'),partLine=H_SLOT_KEYS.map(k=>H_CATALOG[k].name+': '+number.format(activeRows.reduce((s,r)=>s+(r.x.inv.parts?.[k]||0),0))).join(' · ');
 h1bElem('p','h1b-auto-muted',partLine,parts);
 const byDesign=h1bCard(root,'기종별 완성품 재고 · 현역'),dgrid=h1bElem('div','h1b-auto-grid',null,byDesign);
 for(const id of H2A_DESIGN_IDS){
  const stored=rows.reduce((sum,r)=>sum+h2aStored(r.x.inv,id),0);
  const deployed=rows.reduce((sum,r)=>sum+h2aTypeTotals(w,r.n.id)[id],0);
  h1bMetric(dgrid,h2aDesign(id).blueprint.name+' · 현역',deployed);
  h1bMetric(dgrid,h2aDesign(id).blueprint.name+' · 창고',stored);
 }
 h1bElem('div','h1b-auto-note','전 세계 화면은 관측 전용입니다. 제작·조립·배치·수리는 국가별 조회에서 현재 직접 조종 중인 국가에만 명령할 수 있습니다.',parts);

}
function h2gRenderEditor(w,n,root){
 const card=h1bCard(root,'사용자 정의 기체 설계실'),h=n.hAutomaton.h2g;
 h1bElem('p','h1b-auto-muted',`국가 전용 설계 ${Object.keys(h.current).length}/${H2G_MAX_DESIGNS}개 · 산업 근대 III · 정비 기술 필요 · 기존 기체는 개정 전 설계를 유지합니다. 한 분야당 파츠 1개를 선택합니다.`,card);
 const toolbar=h1bElem('div','h1b-auto-toolbar',null,card);
 const button=(title,fn)=>{const btn=h1bElem('button',null,title,toolbar);btn.type='button';btn.addEventListener('click',fn);return btn;};
 const reset=(ids,name,id=null)=>{app.h2gDraft={name,modules:{...ids}};app.h2gEditingId=id;h1bRenderAutomaton();};
 const standard=h2aDesign(H_BLUEPRINT.id);
 button('새 설계',()=>reset(standard.moduleIds,'신규 오토마톤'));
 const current=h2gResolve(w,n.id,app.h2aSelectedBlueprint,app.h2gSelectedRevision)||standard;
 button('선택 설계 복제',()=>reset(current.moduleIds,current.blueprint.name+' 개량형'));
 if(!H2A_DESIGNS[current.blueprint.id]&&h.current[current.blueprint.id]===current.blueprint.revision)
  button('선택 설계 개정',()=>reset(current.moduleIds,current.blueprint.name,current.blueprint.id));
 const draft=app.h2gDraft||(app.h2gDraft={name:'신규 오토마톤',modules:{...standard.moduleIds}});
 h1bElem('p','h1b-auto-note',app.h2gEditingId?'기존 설계 '+app.h2gEditingId+'의 새 개정판을 작성하고 있습니다.':'새 국가 전용 설계 작성 중',card);
 const nameRow=h1bElem('div','h1b-auto-toolbar',null,card),nameLabel=h1bElem('label','h1b-auto-muted','설계 이름 ',nameRow),nameInput=h1bElem('input',null,null,nameLabel);
 nameInput.type='text';nameInput.maxLength=36;nameInput.value=draft.name;nameInput.placeholder='1~36자';nameInput.style.maxWidth='260px';
 nameInput.addEventListener('input',()=>{draft.name=nameInput.value;});
 const cols=h1bElem('div','h1b-auto-cols',null,card);
 for(const slot of H_SLOT_KEYS){
  const line=h1bElem('div','h1b-auto-list-item',null,cols),lbl=h1bElem('label','h1b-auto-muted',({chassis:'프레임',power:'동력',mobility:'이동',weapon:'무장',armor:'장갑',utility:'보조'})[slot]+' ',line),sel=h1bElem('select',null,null,lbl);
  for(const part of Object.values(H2F_MODULES[slot])){
   const ok=h2gCanModule(w,n.id,part.id),opt=new Option(part.name+(ok?'':' · 기술 미보유'),part.id);opt.disabled=!ok;sel.add(opt);
  }
  sel.value=draft.modules[slot]||H2G_BASE_IDS[slot];sel.addEventListener('change',()=>{draft.modules[slot]=sel.value;h1bRenderAutomaton();});
 }
 const bp=h2gDraftBlueprint(draft.name,draft.modules),stat=bp?h2fEvaluate(bp):null;
 h1bElem('p','h1b-auto-muted',stat?`예상 HP ${stat.hp} · 장갑 ${stat.armor} · 관통 ${stat.penetration} · 개시 ${stat.opening.toFixed(2)} / 지속 ${stat.sustained.toFixed(2)} / 접촉 ${stat.contact.toFixed(2)} / 근접 ${stat.melee.toFixed(2)} · 중량 ${stat.weight}/${stat.capacity} · 출력 ${stat.supply}/${stat.power} · 연료 ×${stat.fuelFactor} · 탄약 ×${stat.ammoFactor}`:'설계 이름과 파츠를 입력해 주세요.',card);
 const invalid=!stat||stat.overloaded||stat.powerMargin<0||H_SLOT_KEYS.some(k=>!h2gCanModule(w,n.id,draft.modules[k]));
 if(invalid)h1bElem('p','h1b-auto-note',!stat?'설계 입력 오류':stat.overloaded?'중량 초과':stat.powerMargin<0?'동력 부족':'기술 조건 미충족',card);
 const save=h1bElem('button',null,app.h2gEditingId?'개정 설계 등록 (AP 0.1)':'국가 설계 등록 (AP 0.1)',card);save.type='button';save.disabled=invalid||n.controller!=='PLAYER'||!hUnlocked(w,n.id);
 save.addEventListener('click',()=>{
  const act={type:'H2G_SAVE_DESIGN',name:nameInput.value.trim(),modules:{...draft.modules},designId:app.h2gEditingId};
  const why=h1bResultReason(w,n,act);if(why){showToast(why);h1bRenderAutomaton();return;}
  const r=issuePlayerAction(n.id,act);if(r.ok){app.h2aSelectedBlueprint=r.blueprintId;app.h2gSelectedRevision=r.revision;app.h2gEditingId=null;app.h2gDraft=null;refreshSimulationView(true);h1bRenderAutomaton();}
 });
 if(n.controller!=='PLAYER')h1bElem('p','h1b-auto-muted','이 국가를 직접 조종해야 사용자 설계를 등록할 수 있습니다.',card);
}
function h2gRenderParts(w,n,root){
 const card=h1bCard(root,'종류별 파츠 제작·보관'),h=n.hAutomaton.h2g;
 h1bElem('p','h1b-auto-muted','기본 파츠는 자원으로 제작하고, 특수 파츠는 같은 분야의 기본 파츠와 추가 자원을 지불해 업그레이드합니다. 기본 3종의 기존 자동 개량 조립은 종전 비용을 유지합니다.',card);
 const cols=h1bElem('div','h1b-auto-cols',null,card);
 for(const slot of H_SLOT_KEYS){
  const item=h1bElem('div','h1b-auto-list-item',null,cols);
  const title=({chassis:'프레임',power:'동력',mobility:'이동',weapon:'무장',armor:'장갑',utility:'보조'})[slot];
  h1bElem('div','h1b-auto-list-title',title+' 합계 '+h2gStockSum(n.hAutomaton,slot)+'개',item);
  h1bElem('div','h1b-auto-muted',Object.values(H2F_MODULES[slot]).map(m=>m.name+' '+h.stock[m.id]).join(' · '),item);
 }
 const toolbar=h1bElem('div','h1b-auto-toolbar',null,card),lbl=h1bElem('label','h1b-auto-muted','제작 분야 ',toolbar),slotSel=h1bElem('select',null,null,lbl);
 for(const slot of H_SLOT_KEYS)slotSel.add(new Option(({chassis:'프레임',power:'동력',mobility:'이동',weapon:'무장',armor:'장갑',utility:'보조'})[slot],slot));
 slotSel.value=app.h2gPartsSlot;
 slotSel.addEventListener('change',()=>{app.h2gPartsSlot=slotSel.value;app.h2gPartsModule=Object.keys(H2F_MODULES[slotSel.value]).find(x=>x!==H2G_BASE_IDS[slotSel.value]);h1bRenderAutomaton();});
 const lbl2=h1bElem('label','h1b-auto-muted','업그레이드 대상 ',toolbar),modSel=h1bElem('select',null,null,lbl2);
 for(const p of Object.values(H2F_MODULES[app.h2gPartsSlot]))if(p.id!==H2G_BASE_IDS[app.h2gPartsSlot]){
  const opt=new Option(p.name+(h2gCanModule(w,n.id,p.id)?'':' · 기술 미보유'),p.id);opt.disabled=!h2gCanModule(w,n.id,p.id);modSel.add(opt);
 }
 if(!H2F_MODULES[app.h2gPartsSlot][app.h2gPartsModule]||app.h2gPartsModule===H2G_BASE_IDS[app.h2gPartsSlot])app.h2gPartsModule=modSel.options[0]?.value;
 modSel.value=app.h2gPartsModule;modSel.addEventListener('change',()=>{app.h2gPartsModule=modSel.value;h1bRenderAutomaton();});
 const lbl3=h1bElem('label','h1b-auto-muted','수량 ',toolbar),qtySel=h1bElem('select',null,null,lbl3);
 for(let q=1;q<=h2kBatch(w,n.id);q++)qtySel.add(new Option(q+'개',String(q)));
 qtySel.value=String(Math.min(h2kBatch(w,n.id),Math.max(1,app.h2gPartsAmount)));app.h2gPartsAmount=Number(qtySel.value);qtySel.addEventListener('change',()=>{app.h2gPartsAmount=Number(qtySel.value);h1bRenderAutomaton();});
 const make={type:'H2G_MAKE_MODULE',slot:app.h2gPartsSlot,moduleId:H2G_BASE_IDS[app.h2gPartsSlot],amount:app.h2gPartsAmount};
 const upgrade={type:'H2G_UPGRADE_MODULE',slot:app.h2gPartsSlot,moduleId:app.h2gPartsModule,amount:app.h2gPartsAmount};
 const price=h2gModuleCost(upgrade);
 if(price)h1bElem('p','h1b-auto-muted',`선택 업그레이드 비용 · ${price.gold}G · ${Object.entries(price.resources).map(([k,v])=>k+' '+v).join(' / ')} · 기본 부품 ${upgrade.amount}개`,card);
 h1bActionButton(card,w,n,'선택 분야 기본 파츠 '+make.amount+'개 제작',make);
 if(upgrade.moduleId)h1bActionButton(card,w,n,'선택 파츠 '+upgrade.amount+'개로 업그레이드',upgrade);
}

function h1bRenderNationProduction(w,n,root){
 const inv=n.hAutomaton||hMakeInventory();
 const production=h1bCard(root,'기체 제작 · 조립'),spec=hModuleSummary();
 h1bElem('p','h1b-auto-muted',`공통 표준 설계는 범용 부품을 소비하며, 국가 고유 설계는 정확한 종류별 파츠 6개가 필요합니다. H2K는 산업 규모에 따라 한 번의 조립량이 확대됩니다.`,production);
 const designRow=h1bElem('div','h1b-auto-toolbar',null,production),designLabel=h1bElem('label','h1b-auto-muted','설계도 선택',designRow);
 const designSelect=h1bElem('select',null,null,designLabel);designSelect.id='h2aBlueprintSelect';designSelect.setAttribute('aria-label','오토마톤 설계 선택');
 for(const d of h2gAllDesigns(w,n.id)){
  const id=d.blueprint.id,revision=d.blueprint.revision;
  designSelect.add(new Option(d.blueprint.name+' · 개정 '+revision+(h2gCanDesign(w,n.id,id)?'':' · 기술 미보유'),id+'@'+revision));
 }
 for(const [key,qty] of Object.entries(inv.h2g.finished))if(qty>0){const at=key.lastIndexOf('@'),id=key.slice(0,at),revision=Number(key.slice(at+1));
  if(revision!==inv.h2g.current[id]){const d=h2gResolve(w,n.id,id,revision);if(d)designSelect.add(new Option(d.blueprint.name+' · 구 개정 '+revision+' · 창고 '+qty,id+'@'+revision));}
 }
 if(!h2gResolve(w,n.id,app.h2aSelectedBlueprint,app.h2gSelectedRevision)){app.h2aSelectedBlueprint=H_BLUEPRINT.id;app.h2gSelectedRevision=2;}
 designSelect.value=app.h2aSelectedBlueprint+'@'+app.h2gSelectedRevision;
 if(!designSelect.value)designSelect.value=H_BLUEPRINT.id+'@2';
 designSelect.addEventListener('change',()=>{const at=designSelect.value.lastIndexOf('@');app.h2aSelectedBlueprint=designSelect.value.slice(0,at);app.h2gSelectedRevision=Number(designSelect.value.slice(at+1));h1bRenderAutomaton();});
 const selected=h2gResolve(w,n.id,app.h2aSelectedBlueprint,app.h2gSelectedRevision),selectedStored=h2gStored(w,n.id,app.h2aSelectedBlueprint,app.h2gSelectedRevision);
 h1bElem('p','h1b-auto-muted',`${selected.blueprint.name} · 전투 역할 ${selected.role==='front'?'전열':'후열'} · 표시 HP ${selected.healthLabel} · 실제 장갑 ${selected.armor} · 관통 ${selected.penetration} · OPENING ${selected.opening} / SUSTAINED ${selected.sustained} / CONTACT ${selected.contact} / MELEE ${selected.melee}`,production);
 h1bElem('p','h1b-auto-muted',`보유 기술 ${h2gCanDesign(w,n.id,app.h2aSelectedBlueprint,app.h2gSelectedRevision)?'✓':'미충족 ('+selected.requiredTech+')'} · 선택 기종 창고 ${number.format(selectedStored)}대 · 조립 추가비/대 Gold ${H2A_DESIGNS[app.h2aSelectedBlueprint]?selected.extraGold:0} · ${H2A_DESIGNS[app.h2aSelectedBlueprint]?Object.entries(selected.extra).map(([k,v])=>k+' '+v).join(' · ')||'추가 자원 없음':'이미 완성된 파츠만 소비'}`,production);
 h1bElem('p','h1b-auto-note',`실제 장착 파츠 (개정 ${selected.blueprint.revision}) · ${H_SLOT_KEYS.map(k=>H2F_MODULES[k][selected.moduleIds[k]].name).join(' / ')}`,production);
 h1bElem('p','h1b-auto-muted',`모듈 산출: 질량 ${selected.weight}/${selected.capacity} · 출력 ${selected.supply} / 소요 ${selected.power} · 동력 여유 ${selected.powerMargin} · 연료 계수 ×${selected.fuelFactor} · 탄약 계수 ×${selected.ammoFactor} · ${selected.overloaded?'중량 초과':'중량 적합'} · 개별 파츠 재고·회계 H2G`,production);

 h1bElem('p','h1b-auto-muted',`산업 근대 III ${hUnlocked(w,n.id)?'✓':'필요'} · 공장 ${hFactory(w,n.id)?'가동':'없음'} · 작업 거점 ${hWorksite(w,n.id)?'확보':'없음'} · 국고 ${number.format(n.gold)}G · AP ${(n.apUnits/10).toFixed(1)}`,production);
 const parts=h1bElem('div','h1b-auto-cols',null,production);
 for(const k of H_SLOT_KEYS){
  const item=h1bElem('div','h1b-auto-list-item',null,parts);
  h1bElem('div','h1b-auto-list-title',H_CATALOG[k].name+' · '+number.format(inv.parts[k])+'개',item);
 }
 h1bElem('p','h1b-auto-muted',`부품 8세트 제작 원가: Gold ${H_BATCH_COST.gold} · ${Object.entries(H_BATCH_COST.resources).map(([key,value])=>key+' '+value).join(' · ')} · 누적 제작 ${inv.batches}회`,production);
 for(const qty of [8,16,24].filter(q=>q<=h2kBatch(w,n.id)))h1bActionButton(production,w,n,`기본 부품 ${qty}세트 제작`,{type:'H_BUILD_PARTS',amount:qty});
 const selectRow=h1bElem('div','h1b-auto-toolbar',null,production);
 h1bElem('label','h1b-auto-muted',`조립 수량 (1~${h2kBatch(w,n.id)}대)`,selectRow);
 const assemble=h1bElem('select',null,null,selectRow);assemble.id='h1bAssembleQuantity';assemble.setAttribute('aria-label','오토마톤 조립 수량');
 for(let i=1;i<=h2kBatch(w,n.id);i++)assemble.add(new Option(i+'대',String(i)));
 assemble.value=String(Math.min(h2kBatch(w,n.id),Math.max(1,app.h1bAssembleAmount)));assemble.addEventListener('change',()=>{app.h1bAssembleAmount=Number(assemble.value);h1bRenderAutomaton();});
 h1bActionButton(production,w,n,`${selected.blueprint.name} ${assemble.value}대 조립`,{type:'H_ASSEMBLE',blueprintId:app.h2aSelectedBlueprint,revision:app.h2gSelectedRevision,amount:Number(assemble.value)});
 i0LazyBlock(root,'editor-'+n.id,'사용자 설계실 · 신규 등록 / 복제 / 개정',host=>h2gRenderEditor(w,n,host));
 i0LazyBlock(root,'parts-'+n.id,'정밀 파츠 재고 및 개량 제작',host=>h2gRenderParts(w,n,host));

}
function h1bRenderNationOperations(w,n,root){
 const inv=n.hAutomaton||hMakeInventory();
 const selector=h1bCard(root,'운용할 설계 선택'),label=h1bElem('label','h1b-auto-muted','배치·개장 대상 설계',selector),select=h1bElem('select',null,null,label);
 select.id='i0OpsDesignSelect';
 for(const d of h2gAllDesigns(w,n.id))select.add(new Option(h2jDisplayName(d.blueprint)+' · R'+d.blueprint.revision,d.blueprint.id+'@'+d.blueprint.revision));
 for(const [key,qty] of Object.entries(inv.h2g.finished||{}))if(qty>0){const at=key.lastIndexOf('@'),id=key.slice(0,at),rev=Number(key.slice(at+1));if(rev!==inv.h2g.current[id]){const d=h2gResolve(w,n.id,id,rev);if(d)select.add(new Option(h2jDisplayName(d.blueprint)+' · 구 개정 · 창고 '+qty,key));}}
 if(!h2gResolve(w,n.id,app.h2aSelectedBlueprint,app.h2gSelectedRevision)){app.h2aSelectedBlueprint=H_BLUEPRINT.id;app.h2gSelectedRevision=2;}
 select.value=app.h2aSelectedBlueprint+'@'+app.h2gSelectedRevision;
 select.addEventListener('change',()=>{const at=select.value.lastIndexOf('@');app.h2aSelectedBlueprint=select.value.slice(0,at);app.h2gSelectedRevision=Number(select.value.slice(at+1));h1bRenderAutomaton();});
 const selected=h2gResolve(w,n.id,app.h2aSelectedBlueprint,app.h2gSelectedRevision),selectedStored=h2gStored(w,n.id,app.h2aSelectedBlueprint,app.h2gSelectedRevision);
 h1bElem('p','h1b-auto-muted','선택 설계 창고 '+number.format(selectedStored)+'대 · 배치/개장은 기존 실물·AP·기술·안전 거점 규칙을 따릅니다.',selector);
 const operations=h1bCard(root,'부대 배치 · 정비 · 유상 개장'),opp=h1bElem('div','h1b-auto-note',`완성 기계 창고 ${inv.stored}대 · 부대당 최대 ${H_MAX_PER_ARMY}대 · 국가 총량은 생산·유지 능력에 따라 확장 · 수리 30일 (한 번에 최대 24대).`,operations);
 if(selectedStored>0)h1bActionButton(operations,w,n,`${selected.blueprint.name} 독립 편제 ${Math.min(16,selectedStored)}대`,{type:'H_DEPLOY',armyId:null,blueprintId:app.h2aSelectedBlueprint,revision:app.h2gSelectedRevision,amount:Math.min(16,selectedStored)});
 h1bRenderArmyRoster(w,n,operations);

}
function h1bRenderArmyRoster(w,n,parent){
 const armies=w.armies.filter(a=>a.nationId===n.id).sort((a,b)=>a.id-b.id);
 const filterWrap=h1bElem('div','h1b-auto-toolbar',null,parent),label=h1bElem('label','h1b-auto-muted','부대 필터',filterWrap),filter=h1bElem('select',null,null,label);
 filter.id='h1bArmyFilter';filter.setAttribute('aria-label','오토마톤 부대 필터');
 for(const [value,text] of [['all','전체 부대'],['machines','오토마톤 보유'],['repair','수리 필요'],['deploy','배치 가능']])filter.add(new Option(text,value));
 filter.value=app.h1bAutoArmyFilter;filter.addEventListener('change',()=>{app.h1bAutoArmyFilter=filter.value;app.h1bAutoArmyPage=0;h1bRenderAutomaton();});
 const search=h1bElem('label','h1b-auto-muted','부대 검색',filterWrap),query=h1bElem('input',null,null,search);query.type='search';query.className='i0-army-query';query.placeholder='군 번호 · 타일 번호';query.setAttribute('aria-label','부대 번호 또는 타일 검색');query.value=app.i0AutoArmyQuery||'';
 const commit=()=>{app.i0AutoArmyQuery=query.value.trim();app.h1bAutoArmyPage=0;h1bRenderAutomaton();};
 const searchButton=h1bElem('button','i0-link-button','찾기',filterWrap);searchButton.type='button';searchButton.addEventListener('click',commit);
 query.addEventListener('change',commit);query.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();}});
 const list=armies.filter(a=>{
  const term=(app.i0AutoArmyQuery||'').trim().toLocaleLowerCase('ko-KR');
  if(term&&!('제'+(a.id+1)+'군 '+(a.id+1)+' '+a.id+' '+a.tileId).toLocaleLowerCase('ko-KR').includes(term))return false;
  const h=hGroups(w,a),total=h.reduce((s,g)=>s+g.ready+g.damaged+g.disabled,0),damage=h.reduce((s,g)=>s+g.damaged+g.disabled,0);
  if(filter.value==='machines')return total>0;
  if(filter.value==='repair')return damage>0||Boolean(a.hRepairPlan);
  if(filter.value==='deploy')return hLegal(w,n.id,{type:'H_DEPLOY',armyId:a.id,blueprintId:app.h2aSelectedBlueprint,amount:1});
  return true;
 });
 const pageSize=12,pages=Math.max(1,Math.ceil(list.length/pageSize));app.h1bAutoArmyPage=Math.max(0,Math.min(pages-1,app.h1bAutoArmyPage));
 h1bElem('span','h1b-auto-muted',`${number.format(list.length)}개 부대 · ${app.h1bAutoArmyPage+1}/${pages}페이지`,filterWrap);
 const wrap=h1bElem('div','h1b-auto-list',null,parent);
 if(!list.length)h1bElem('p','h1b-auto-empty','선택한 조건에 해당하는 부대가 없습니다.',wrap);
 for(const a of list.slice(app.h1bAutoArmyPage*pageSize,(app.h1bAutoArmyPage+1)*pageSize)){
  const g=hGroups(w,a),ready=g.reduce((s,g)=>s+g.ready,0),damaged=g.reduce((s,g)=>s+g.damaged,0),disabled=g.reduce((s,g)=>s+g.disabled,0);
  const item=h1bElem('details','h1b-auto-list-item i0-army',null,wrap),hdr=h1bElem('summary','h1b-auto-list-title',null,item);
  item.open=app.i0AutoArmyId===a.id;
  item.addEventListener('toggle',()=>{if(item.open){app.i0AutoArmyId=a.id;for(const other of wrap.querySelectorAll('details.i0-army'))if(other!==item)other.open=false;}else if(app.i0AutoArmyId===a.id)app.i0AutoArmyId=null;});
  h1bElem('span',null,`제${a.id+1}군 · 인간 ${number.format(manpower(a))}명 · 오토마톤 ${ready+damaged+disabled}대`,hdr);
  h1bElem('span','h1b-auto-key',a.status,hdr);
  h1bElem('div','h1b-auto-muted',`타일 #${a.tileId} · 전열 ${hPositionQty(w,a,'front')}대 / 후열 ${hPositionQty(w,a,'rear')}대 · 정상 ${ready} / 손상 ${damaged} / 정지 ${disabled} · 연료 ${g.every(g=>g.fueled)?'정상':'일부/전체 미공급'} · ${a.hServiceReturn?'정비 거점 복귀·대기':a.hRepairPlan?'수리 진행 중':a.order||a.operation?'이동/작전 중':'명령 없음'}`,item);
  if(g.length)h1bElem('div','h1b-auto-muted',g.map(v=>`${h2gResolve(w,v.ownerNationId,v.blueprintId,v.revision).blueprint.name} ${hAliveMachine(w,v)}대 (${v.position==='front'?'전열':'후열'})`).join(' · '),item);
  if(a.hRepairPlan)h1bElem('div','h1b-auto-note',`수리 중 ${a.hRepairPlan.amount}대 · 완료 예정 ${timeAt(a.hRepairPlan.completeDay).year}년 ${timeAt(a.hRepairPlan.completeDay).quarter}분기 ${timeAt(a.hRepairPlan.completeDay).day}일 · ${Math.max(0,a.hRepairPlan.completeDay-w.dayIndex)}일 남음`,item);
  const qty=Math.min(8,h2gStored(w,n.id,app.h2aSelectedBlueprint,app.h2gSelectedRevision),H_MAX_PER_ARMY-ready-damaged-disabled);
  if(qty>0)h1bActionButton(item,w,n,`${h2gResolve(w,n.id,app.h2aSelectedBlueprint,app.h2gSelectedRevision).blueprint.name} +${qty}대 배치`,{type:'H_DEPLOY',armyId:a.id,blueprintId:app.h2aSelectedBlueprint,revision:app.h2gSelectedRevision,amount:qty});
  if(H2B_REFIT_PRICE[app.h2aSelectedBlueprint]&&h2bRefittable(w,a)>0&&h2bEligibleRefit(w,a,n.id)){
   const refitQty=Math.min(8,h2bRefittable(w,a));
   h1bActionButton(item,w,n,`기본 경량형 ${refitQty}대 → ${h2jDisplayName(h2aDesign(app.h2aSelectedBlueprint).blueprint)} 기존 유상 개장`,
    {type:'H_REFIT',armyId:a.id,blueprintId:app.h2aSelectedBlueprint,amount:refitQty});
  }
  if(h2bEligibleRefit(w,a,n.id)&&hasTech(w,n.id,'automaton_maintenance')){
   for(const source of g.filter(v=>v.ready>0&&v.fueled!==false&&!(v.blueprintId===app.h2aSelectedBlueprint&&v.revision===app.h2gSelectedRevision)).slice(0,2)){
    const q=Math.min(8,source.ready),act={type:'H2G_REFIT',armyId:a.id,fromBlueprintId:source.blueprintId,fromRevision:source.revision,blueprintId:app.h2aSelectedBlueprint,revision:app.h2gSelectedRevision,amount:q};
    if(h2gCanRefit(w,n.id,act))h1bActionButton(item,w,n,`${h2gResolve(w,n.id,source.blueprintId,source.revision).blueprint.name} ${q}대 → ${h2gResolve(w,n.id,app.h2aSelectedBlueprint,app.h2gSelectedRevision).blueprint.name} 파츠 교체 개장`,act);
   }
  }
  if(damaged+disabled>0)h1bActionButton(item,w,n,`${Math.min(24,damaged+disabled)}대 수리`,{type:'H_REPAIR',armyId:a.id,amount:Math.min(24,damaged+disabled)});
 }
 if(pages>1){
  const pager=h1bElem('div','h1b-auto-pager',null,parent),prev=h1bElem('button',null,'← 이전',pager);prev.disabled=app.h1bAutoArmyPage===0;prev.addEventListener('click',()=>{app.h1bAutoArmyPage--;h1bRenderAutomaton();});
  h1bElem('span','h1b-auto-muted',`${app.h1bAutoArmyPage+1}/${pages}`,pager);
  const next=h1bElem('button',null,'다음 →',pager);next.disabled=app.h1bAutoArmyPage>=pages-1;next.addEventListener('click',()=>{app.h1bAutoArmyPage++;h1bRenderAutomaton();});
 }
}
function invSafeStored(n){return Math.max(0,n.hAutomaton?.stored||0);}
function h1bRenderHistory(w,parent,nid){
 const card=h1bCard(parent,'오토마톤 운용 기록 · 최근 이벤트'),history=(w.hAutomaton?.history||[]).filter(e=>nid==null||e.nationId===nid).slice(-20).reverse();
 const kinds={DESIGN_SAVED:'설계 등록/개정',MODULE_BUILT:'개별 파츠 제작',MODULE_UPGRADED:'파츠 개량',MODULE_REFIT:'실물 파츠 교체 개장',REFIT:'기종 개장',PARTS_BUILT:'파츠 제작',ASSEMBLED:'조립',DEPLOYED:'부대 배치',REPAIR_STARTED:'수리 착수',REPAIR_COMPLETED:'수리 완료',BATTLE_DESTROYED:'전투 파괴',DESTROYED_BY_ARMY_REMOVAL:'부대 제거',RETURNED:'창고 회수'};
 if(!history.length){h1bElem('p','h1b-auto-empty','최근 기록이 없습니다. 전체 보존 기록의 최대 120개 항목만 표시할 수 있습니다.',card);return;}
 const list=h1bElem('div','h1b-auto-list',null,card);
 for(const e of history){
  const t=timeAt(e.dayIndex),line=h1bElem('div','h1b-auto-muted',`${t.year}년 ${t.quarter}분기 ${t.day}일 · ${w.nations[e.nationId]?.name||'미상'} · ${kinds[e.kind]||e.kind} ${number.format(e.amount)}대${e.armyId==null?'':' · 제'+(e.armyId+1)+'군'}${e.kind==='REFIT'?' · '+h2aDesign(e.toBlueprintId).blueprint.name+' · '+e.goldCost+'G':''}`,list);
 }
}

requestAnimationFrame(animate);