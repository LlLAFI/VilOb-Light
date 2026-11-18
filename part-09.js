// --- src/ui/ai-editor.js ---
/** V0.2C AI profile editor. UI state survives simulation updates; no RNG consumption. */



const e=(tag,cls='',content='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content!==undefined)n.textContent=String(content);return n;};
const field=(parent,label,input)=>{const row=e('label','ai-field');row.append(e('span','',label),input);parent.append(row);return row;};
const btn=(label,handler,cls='text-button')=>{const b=e('button',cls,label);b.type='button';b.addEventListener('click',handler);return b;};
const picker=(options,value,handler)=>{const node=e('select');for(const [id,name] of options){const o=e('option','',name);o.value=String(id);node.append(o);}node.value=String(value);node.addEventListener('change',()=>handler(node.value));return node;};
const inp=(type,value,handler,attrs={})=>{const node=e('input');node.type=type;node.value=value;for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);node.addEventListener(type==='range'||type==='color'?'input':'change',()=>handler(node.value));return node;};
function createAIEditorState(){return {selected:'survival',nation:0,group:'weights',draft:null,newNationSetup:{},expanded:false};}
function mountAIEditor(root,ctx,state){
  const world=ctx.world(),lib=world.aiProfiles,selected=lib[state.selected]||state.draftSource===state.selected?state.selected:Object.keys(lib)[0];state.selected=selected;
  const working=state.draft&&state.draftSource===selected?state.draft:structuredClone(lib[selected]);
  const options=Object.values(lib).map(p=>[p.id,`${p.name} · ${p.id}${BASE_PROFILE_IDS.has(p.id)?' [기본]':''}`]);
  root.replaceChildren();
  const heading=e('div','seed-heading');heading.append(e('span','head-icon','♜'),e('strong','','AI 프로필 관리 · 20개 행동 성향 + 국력 인식 5개 / 국가 색상'));root.append(heading);
  const caption=e('p','scope-note','프로필 성향과 국가 지도 색상은 별도로 저장됩니다. 편집은 저장하기 전까지 세계에 적용되지 않습니다.');root.append(caption);
  if(!lib[selected]&&state.draft)options.push([selected,`${state.draft.name} · 미저장`]);
  const actions=e('div','ai-toolbar');actions.append(
    picker(options,selected,id=>{state.selected=id;state.draft=null;state.draftSource=null;mountAIEditor(root,ctx,state);}),
    btn('선택 프로필 복제',()=>{
      let i=1;while(lib[`${selected}_custom${i}`])i++;
      const copy=structuredClone(lib[selected]);copy.id=`${selected}_custom${i}`;copy.name=`${copy.name} 복제 ${i}`;state.selected=copy.id;state.draft=copy;state.draftSource=copy.id;
      mountAIEditor(root,ctx,state);
    }),
    btn('JSON 내보내기',()=>ctx.exportJson(`${selected}.json`,JSON.stringify(working,null,2))),
    btn('전체 JSON 내보내기',()=>ctx.exportJson('vilob-light-ai-profiles.json',JSON.stringify(Object.values(lib).filter(p=>!BASE_PROFILE_IDS.has(p.id)),null,2)))
  );root.append(actions);
  const editor=e('div','ai-editor-grid'),left=e('div','ai-editor-fields'),right=e('div','ai-editor-side');editor.append(left,right);root.append(editor);
  const identity=e('div','ai-identities');field(identity,'프로필 ID (영문·숫자·_-)',inp('text',working.id,v=>{working.id=v.trim();state.draft=working;state.draftSource=selected;},{maxlength:48}));field(identity,'프로필 이름',inp('text',working.name,v=>{working.name=v;state.draft=working;state.draftSource=selected;},{maxlength:60}));left.append(identity);
  const groups=picker(Object.entries(PROFILE_GROUPS).map(([id,g])=>[id,g.label]),state.group,id=>{state.draft=working;state.draftSource=selected;state.group=id;mountAIEditor(root,ctx,state);});field(left,'성향 분야',groups);
  const form=e('div','ai-parameter-list');const group=PROFILE_GROUPS[state.group];
  const groupControls={};
  for(const [key,label] of Object.entries(group.fields)){
    const row=e('div','ai-parameter'),head=e('div','ai-param-head'),range=inp('range',working[state.group][key],v=>assign(v),{min:0,max:100,step:1}),number=inp('number',working[state.group][key],v=>assign(v),{min:0,max:100,step:1});
    function assign(v){
      const value=Math.max(0,Math.min(100,Math.round(Number(v)||0)));
      if(state.group==='powerPerception'){
        working.powerPerception=v06a2RebalanceWeights(working.powerPerception,key,value);
        for(const [name,controls] of Object.entries(groupControls)){
          controls.range.value=working.powerPerception[name];controls.number.value=working.powerPerception[name];
        }
      }else{working[state.group][key]=value;range.value=value;number.value=value;}
      state.draft=working;state.draftSource=selected;
    }
    head.append(e('span','',label),number);row.append(head,range);form.append(row);
    groupControls[key]={range,number};
  }
  if(state.group==='powerPerception')form.append(e('p','scope-note',
    '다섯 비중의 합계는 항상 100%입니다. 한 항목을 변경하면 다른 항목이 비례 조정됩니다. 경제력은 국고 60% + 분기 소득 40%입니다.'));
  left.append(form);
const row=e('div','ai-button-row');row.append(btn('프로필 저장',()=>{
    try{validateProfile(working);ctx.saveProfile(working,selected);state.selected=working.id;state.draft=null;state.draftSource=null;mountAIEditor(root,ctx,state);}catch(err){ctx.message('프로필 저장 실패: '+err.message);}
  },'primary-button'));
  if(!BASE_PROFILE_IDS.has(selected))row.append(btn('프로필 삭제',()=>{
    if(!window.confirm(`'${selected}' 프로필을 삭제할까요?`))return;
    try{ctx.deleteProfile(selected);state.selected='survival';state.draft=null;state.draftSource=null;mountAIEditor(root,ctx,state);}catch(err){ctx.message(err.message);}
  }));left.append(row);
  const compare=e('div','ai-compare');compare.append(e('strong','','원본 대비 변경 사항'));
  const origin=lib[selected];const differences=[];
  if(origin)for(const [grp,g] of Object.entries(PROFILE_GROUPS))for(const [key,label] of Object.entries(g.fields))if(working[grp][key]!==origin[grp][key])differences.push(`${label}: ${origin[grp][key]} → ${working[grp][key]}`);
  compare.append(e('p','scope-note',differences.length?differences.join(' · '):origin?'성향 수치 변경 없음':'새 커스텀 프로필'));left.append(compare);
  const profColor=e('div','ai-color-card');profColor.append(e('h3','','프로필 추천 색상'));const colorBox=e('div','ai-color-controls');
  const swatch=e('span','ai-swatch');swatch.style.background=working.recommendedColor||'#808080';
  const colorInput=inp('color',working.recommendedColor||'#808080',v=>setColor(v));
  const hexInput=inp('text',working.recommendedColor||'#808080',v=>{try{setColor(validColor(v));}catch(err){ctx.message(err.message);}},{maxlength:7});
  function setColor(v){working.recommendedColor=v.toUpperCase();state.draft=working;state.draftSource=selected;swatch.style.background=v;colorInput.value=v;hexInput.value=v.toUpperCase();}
  colorBox.append(swatch,colorInput,hexInput);profColor.append(colorBox,e('p','scope-note','이 색상은 추천값입니다. 같은 프로필을 사용하는 국가도 서로 다른 지도 색을 쓸 수 있습니다.'));right.append(profColor);
  const nationBox=e('div','ai-color-card');nationBox.append(e('h3','','현재 국가에 프로필·색상 적용'));
  const nationSel=picker(world.nations.map(n=>[n.id,n.name]),state.nation,v=>{state.nation=Number(v);state.draft=working;state.draftSource=selected;mountAIEditor(root,ctx,state);});field(nationBox,'적용할 국가',nationSel);
  const nation=world.nations[state.nation]||world.nations[0];
  const nationName=inp('text',nation.name,()=>{},{maxlength:30});
  field(nationBox,'국가명',nationName);
  nationBox.append(btn('국가명 변경',()=>{try{ctx.renameNation(nation.id,nationName.value);state.draft=working;state.draftSource=selected;mountAIEditor(root,ctx,state);}catch(err){ctx.message(err.message);}},'primary-button'));
  nationBox.append(btn('선택 프로필 이름을 국가명으로',()=>{try{ctx.renameNation(nation.id,working.name);state.draft=working;state.draftSource=selected;mountAIEditor(root,ctx,state);}catch(err){ctx.message(err.message);}}));
const assignment=picker(options,nation.aiProfileId,v=>{try{ctx.assignProfile(nation.id,v);state.draft=working;state.draftSource=selected;mountAIEditor(root,ctx,state);}catch(err){ctx.message(err.message);}});field(nationBox,'현재 지정 프로필',assignment);
  const nc=e('div','ai-color-controls'),nColor=e('span','ai-swatch');nColor.style.background=nation.color;
  const ncPicker=inp('color',nation.color,v=>colorNation(v)),ncHex=inp('text',nation.color,v=>{try{colorNation(validColor(v));}catch(err){ctx.message(err.message);}},{maxlength:7});
  function colorNation(v){try{ctx.setColor(nation.id,v);nColor.style.background=v;ncPicker.value=v;ncHex.value=v.toUpperCase();if(typeof parts!=='undefined'){[1,3,5].forEach((pos,i)=>{parts[i]=parseInt(v.slice(pos,pos+2),16);rgbControls[i].value=parts[i];});}updateSimilarColors();}catch(err){ctx.message(err.message);}}
  nc.append(nColor,ncPicker,ncHex);field(nationBox,'국가 실제 지도 색',nc);
  const rgb=e('div','ai-rgb');const parts=[1,3,5].map(i=>parseInt(nation.color.slice(i,i+2),16));const rgbControls=[];
  ['R','G','B'].forEach((name,i)=>{const control=inp('number',parts[i],v=>{parts[i]=Math.max(0,Math.min(255,Math.round(Number(v)||0)));colorNation('#'+parts.map(x=>x.toString(16).padStart(2,'0')).join(''));},{min:0,max:255,step:1});rgbControls.push(control);field(rgb,name,control);});nationBox.append(rgb);
  nationBox.append(btn('프로필 추천 색을 국가에 적용',()=>{try{ctx.setColor(nation.id,working.recommendedColor||'#808080');state.draft=working;state.draftSource=selected;mountAIEditor(root,ctx,state);}catch(err){ctx.message(err.message);}}));
  const colorWarning=e('p','ai-color-warning');function updateSimilarColors(){const hex=nColor.style.background;const components=(value)=>{const color=value.startsWith('#')?value:'#'+value;return [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));};const active=components(ncHex.value),near=world.nations.filter(n=>n.id!==nation.id).filter(n=>{const rgb=components(n.color);return Math.sqrt(rgb.reduce((sum,v,i)=>sum+(v-active[i])**2,0))<70;});colorWarning.textContent=near.length?'주의: '+near.map(n=>n.name).join(', ')+'와 비슷한 지도 색상입니다.':'';}nationBox.append(colorWarning);updateSimilarColors();
  right.append(nationBox);
  const diagnostic=e('div','ai-diagnostics');diagnostic.append(e('h3','','최근 AI 행동 진단'));
  const decisions=(world.aiDecisions||[]).filter(d=>d.nationId===nation.id).slice(-10).reverse();
  const stats=nation.actionStats||{};diagnostic.append(e('p','scope-note','누적 행동: '+(Object.entries(stats).map(([id,count])=>`${id} ${count}회`).join(' · ')||'기록 없음')));
  for(const d of decisions){const r=e('div','ai-decision');r.append(e('strong','',`${Math.floor(d.dayIndex/120)+1}년 · ${d.action} ${d.ok?'✓':'실패'} · ${d.score.toFixed(2)}점`),e('small','',`상위 후보: ${d.top?.map(v=>`${v.action} ${v.score.toFixed(2)}`).join(' / ')||'없음'}`));diagnostic.append(r);}
  if(!decisions.length)diagnostic.append(e('p','scope-note','30일 이상 AI 행동이 진행된 뒤 판단 기록이 표시됩니다. 플레이어 조종 중에는 자동 행동 기록이 추가되지 않습니다.'));
  right.append(diagnostic);
  const d1dEditor=e('div','ai-diagnostics');d1dEditor.append(e('h3','','D1D · 선택 국가 경험 적응'));
  const d1dState=nation.aiAdaptation;d1dEditor.append(e('p','scope-note',`${world.d1dAdaptiveEnabled?'적응 ON':'적응 OFF'} · 식량 압박 ${d1dState?.foodStressQuarters||0}분기 · 경험 전쟁 ${d1dState?.warResults?.length||0}건`));
  if(d1dState){for(const k of D1D_KEYS){const delta=(d1dState.deltas[k]||0)/100;d1dEditor.append(e('div','muted-line',`${D1D_LABELS[k]} · 기본 ${d1dBaseValue(lib[nation.aiProfileId],k)} · 변화 ${delta>=0?'+':''}${delta.toFixed(2)} · 현재 ${(Math.max(0,Math.min(100,d1dBaseValue(lib[nation.aiProfileId],k)+(world.d1dAdaptiveEnabled?delta:0)))).toFixed(2)}`));}for(const reason of d1dState.lastReasons)d1dEditor.append(e('small','muted-line',reason));}
  right.append(d1dEditor);
  const fileBox=e('div','ai-file-import');const loader=inp('file','',async()=>{const file=loader.files?.[0];if(!file)return;try{if(file.size>100000)throw Error('100KB 이하 JSON만 가져올 수 있습니다.');const profiles=decodeProfilesJson(await file.text());ctx.importProfiles(profiles);state.selected=profiles[0]?.id||state.selected;state.draft=null;state.draftSource=null;mountAIEditor(root,ctx,state);}catch(err){ctx.message('JSON 불러오기 실패: '+err.message);}},{accept:'.json,application/json'});field(fileBox,'커스텀 프로필 JSON 가져오기',loader);root.append(fileBox);
  const worldBox=e('div','ai-new-world');worldBox.append(e('h3','','새 세계의 국가명·프로필·색상 사전 지정'),e('p','scope-note','현재 선택한 월드 크기에 맞춰 새 세계 생성 시 적용됩니다. 위의 국가 실시간 변경과 별도입니다.'));
  const dims=ctx.worldShape().split('x').map(Number);
  const templates=c1Templates(dims[0],dims[1],ctx.newWorldNationCount());
  for(const [i,t] of templates.entries()){
    const conf=state.newNationSetup[i]||{profileId:t.profile,color:t.color,name:t.name};const wrap=e('div','ai-new-nation-row');wrap.append(e('strong','',`#${i+1}`));
    const newName=inp('text',conf.name??t.name,v=>{state.newNationSetup[i]={...conf,...state.newNationSetup[i],name:v};},{maxlength:30});wrap.append(newName);
    wrap.append(picker(options,lib[conf.profileId]?conf.profileId:t.profile,v=>{state.newNationSetup[i]={...conf,...state.newNationSetup[i],profileId:v};}));
    const col=inp('color',conf.color,v=>{state.newNationSetup[i]={...state.newNationSetup[i],profileId:state.newNationSetup[i]?.profileId||conf.profileId,color:v.toUpperCase()};});wrap.append(col);worldBox.append(wrap);
  }
  worldBox.append(btn('새 세계 국가 배정 초기화',()=>{state.newNationSetup={};state.draft=working;state.draftSource=selected;mountAIEditor(root,ctx,state);}));root.append(worldBox);
}


// V0.7D3 observation controls: memory-only, JSON v2, bounded round/clash groups.
function v07d2UpdateObservationUI(){
  const target=document.getElementById('combatObservationStatus');if(!target||!app.world)return;
  const s=v07d2ObservationStatus(app.world),toggle=document.getElementById('combatObservationEnabled');
  toggle.checked=s.enabled;
  target.textContent=`${s.enabled?'관측 중':'관측 OFF'} · ${s.retained.toLocaleString('ko-KR')}/${s.limit.toLocaleString('ko-KR')}행 · ${s.retainedGroups}묶음 `+
`· 교체 ${s.droppedGroups}묶음/${s.dropped}행 · 초대형 생략 ${s.omittedGroups}건 · 완료 요약 ${s.completed}/${V07D3_SUMMARY_LIMIT}`+
    ` · 관측 시작 day ${s.startedDay??'—'} · 최신 day ${s.lastDay??'—'}`+(s.offGaps?` · OFF 구간 ${s.offGaps}회`: '');
  for(const id of ['combatObservationCsv','combatObservationJson','combatObservationClear'])document.getElementById(id).disabled=!s.retained;
  for(const id of ['combatObservationSummary','combatObservationGzip'])document.getElementById(id).disabled=(!s.completed&&!s.retained)||(id==='combatObservationGzip'&&typeof CompressionStream!=='function');
}
function v07d2WireObservationUI(){
  document.getElementById('combatObservationEnabled').addEventListener('change',event=>{v07d2SetObservation(app.world,event.target.checked);v07d2UpdateObservationUI();});
  document.getElementById('combatObservationClear').addEventListener('click',()=>{v07d2ClearObservation(app.world);v07d2UpdateObservationUI();});
  document.getElementById('combatObservationJson').addEventListener('click',()=>download(`vilob-combat-day${app.world.dayIndex}.json`,JSON.stringify(v07d2Observation(app.world),null,2),'application/json'));
  document.getElementById('combatObservationCsv').addEventListener('click',()=>download(`vilob-combat-day${app.world.dayIndex}.csv`,v07d2ObservationCSV(app.world),'text/csv;charset=utf-8'));
  document.getElementById('combatObservationSummary').addEventListener('click',()=>download(`vilob-combat-summary-day${app.world.dayIndex}.json`,JSON.stringify(e3dCombatSummary(app.world),null,2),'application/json'));
  const gz=document.getElementById('combatObservationGzip');
  if(typeof CompressionStream!=='function'){
    gz.disabled=true;gz.title='이 브라우저는 CompressionStream(gzip)을 지원하지 않습니다. 요약 JSON을 사용하세요.';
  }else gz.addEventListener('click',async()=>{
    try{
      const json=JSON.stringify(v07d2Observation(app.world));
      const stream=new Blob([json],{type:'application/json'}).stream().pipeThrough(new CompressionStream('gzip'));
      const zip=await new Response(stream).blob();
      const url=URL.createObjectURL(zip),a=document.createElement('a');a.href=url;a.download=`vilob-combat-day${app.world.dayIndex}.json.gz`;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(err){showToast('전투 관측 gzip 실패: '+err.message);}
  });
  v07d2UpdateObservationUI();
}

// V0.7E3D: Nation > Military integrated A2 formation visualizer.
// Read-only UI; never mutates World, RNG, recruitment, training or combat state.
const e3dVisuals=(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TYPES={levy:['민병','#91a5aa','sword'],spearman:['창병','#78b1a9','spear'],archer:['궁병','#d5a868','bow'],swordsman:['검병','#9cb9cc','sword'],pikeman:['장창병','#77af9a','pike'],longbowman:['장궁병','#caa06c','bow'],crossbowman:['쇠뇌병','#be9dcd','crossbow'],heavy_infantry:['중보병','#7e9eb8','shield'],matchlock:['화승총병','#ce8d69','gun'],flintlock:['머스킷병','#c6ad80','gun'],rifle_infantry:['강선 소총병','#8fb4cf','gun'],machine_gunner:['기관총병','#7ea8c9','machinegun'],field_artillery:['전장포','#c6846c','cannon']};
const POSITION=[['front','전열'],['rear','후열'],['back','후방'],['reserve','예비']];
const RANKS=[{name:'신병',roman:'I',base:'#788a95',light:'#c4d0d4',accent:'#4a6876',shape:'round',detail:'철제 원형장 · 기본 문장'}, {name:'숙련병',roman:'II',base:'#bd855a',light:'#efd1a2',accent:'#795332',shape:'hex',detail:'청동 육각장 · 쌍선 문장'}, {name:'정예병',roman:'III',base:'#99adbd',light:'#f3f7f7',accent:'#537f94',shape:'shield',detail:'은제 방패장 · 삼중 날개'}, {name:'베테랑',roman:'IV',base:'#d1ae5c',light:'#fff3bf',accent:'#846330',shape:'star',detail:'금제 별장 · 방사 문장'}, {name:'전쟁 숙련병',roman:'V',base:'#a9506d',light:'#ffcee0',accent:'#6e3450',shape:'sun',detail:'진홍 월계장 · 오각 광휘'}, {name:'백전노장',roman:'VI',base:'#90c9c4',light:'#eefcf9',accent:'#44798c',shape:'laurel',detail:'백금 왕관장 · 월계와 날개'}];
const TH=[0,100,300,600,1000,1500,2000];


function rankFromXp(xp){let i=0;while(i<5&&xp>=TH[i+1])i++;return i;}
function winrate(a){return a.wins+a.losses?a.wins/(a.wins+a.losses):null;}
function kd(a){return a.deaths?a.kills/a.deaths:(a.kills>0?Infinity:null);}
function dayLabel(d){return d===null||d===undefined?'기록 없음':`${Math.floor(d/120)+1}년 ${Math.floor((d%120)/30)+1}분기`;}
function unitIcon(type){let meta=TYPES[type]||['기타','#a0adbe','sword'],c=meta[1],kind=meta[2];
 const weapon={sword:'<path d="M35 5l3 26-2 8-4-8 1-26z" fill="#d2e1e1"/><path d="M28 34l13-2M34 33l-5 18" stroke="#c7a46b" stroke-width="3" stroke-linecap="round"/>',spear:'<path d="M37 4v53" stroke="#d9c69e" stroke-width="2.8"/><path d="M32 11l5-9 5 9-5 10z" fill="#cedde5"/>',pike:'<path d="M37 0v59" stroke="#d9c69e" stroke-width="2"/><path d="M33 6l4-6 4 6-4 10z" fill="#cedde5"/>',bow:'<path d="M38 7Q22 28 38 53" fill="none" stroke="#d8ad68" stroke-width="4"/><path d="M38 7v46" stroke="#d9e7e3" stroke-width="1"/><path d="M38 28l-14 0m5-3-5 3 5 3" stroke="#dee1d8" stroke-width="2"/>',crossbow:'<path d="M26 32h22m-12-8v17m-11-10Q36 16 48 31" fill="none" stroke="#c9a16e" stroke-width="3"/><path d="M20 31h27" stroke="#e2e8e7" stroke-width="1.5"/>',shield:'<path d="M35 8l3 24-3 8" stroke="#d7d9db" stroke-width="3"/><path d="M3 32L19 27v19L11 55 3 46z" fill="#bdcdd2" stroke="#7e9cb1" stroke-width="2"/><path d="M11 31v19" stroke="#899dab" stroke-width="2"/>',gun:'<path d="M26 27h23v4H28l-5 7-4-2z" fill="#b8cdd4" stroke="#d9e2e4" stroke-width="1"/><path d="M26 31l-5 9" stroke="#916e4d" stroke-width="4"/>',machinegun:'<path d="M13 25h16l4 4-4 4H13l-5-4v-4z" fill="#f1efe2" stroke="#d9e2e4" stroke-width="1.2"/><path d="M32 25h16c5 0 7 1.3 7 4s-2 4-7 4H32z" fill="#f1efe2" stroke="#d9e2e4" stroke-width="1.2"/><path d="M33 33l-7 19m7-19 1 19m0-19 10 19" stroke="#ece9df" stroke-width="3.2" stroke-linecap="round"/><path d="M18 36l-1 13m4-13-1 11m4-11-1 9" stroke="#d2a764" stroke-width="2.4" stroke-linecap="round"/><path d="M32 27h17" stroke="#d8f6ec" stroke-width="1.2" stroke-linecap="round"/>',cannon:''}[kind];
 if(kind==='cannon')return `<svg viewBox="0 0 56 64" aria-hidden="true"><circle cx="28" cy="32" r="26" fill="#17323d"/><ellipse cx="24" cy="51" rx="18" ry="4" fill="#0c1c27"/><path d="M13 21l30-3 4 12-28 6z" fill="${c}" stroke="#e3c09b" stroke-width="2"/><circle cx="19" cy="41" r="9" fill="#2d4250" stroke="#dfc19d" stroke-width="3"/><circle cx="19" cy="41" r="3" fill="#d2ac80"/><path d="M31 36l10 17M18 49L8 54" stroke="#d8ad7d" stroke-width="3"/></svg>`;
 return `<svg viewBox="0 0 56 64" aria-hidden="true"><ellipse cx="27" cy="59" rx="24" ry="4" fill="#0b1925" opacity=".5"/><path d="M17 52h9v8h-12zm15 0h9l3 8H31z" fill="#1a2830"/><path d="M14 33c3-6 21-7 28 0l2 21-31 0z" fill="${c}" stroke="#c3dee1" stroke-opacity=".35" stroke-width="2"/><path d="M18 36l-8 12m28-12 8 12" stroke="${c}" stroke-width="7" stroke-linecap="round"/><path d="M22 33l7 7 7-7" stroke="#b8d2df" stroke-width="1" fill="none"/><rect x="20" y="13" width="16" height="19" rx="7" fill="#e0b994"/><path d="M18 22c0-11 7-17 13-17 8 0 12 7 12 17H18z" fill="#7a98aa" stroke="#d3e2df" stroke-width="1.5"/><path d="M19 23h24" stroke="#c4d6dd" stroke-width="3"/><path d="M26 26h9" stroke="#5b5148" stroke-width="2"/>${weapon}</svg>`;
}
let medalSequence=0;
function medal(t,mini=false){const r=RANKS[t],base=r.base,light=r.light,accent=r.accent;const uid=`medal-${t}-${++medalSequence}`;
 const geom={round:`<circle cx="58" cy="74" r="31" fill="url(#${uid})" stroke="${light}" stroke-width="4"/><circle cx="58" cy="74" r="23" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="3 5"/>`,hex:`<polygon points="58,38 85,52 85,88 58,106 31,88 31,52" fill="url(#${uid})" stroke="${light}" stroke-width="4"/><path d="M39 57h38m-38 30h38" stroke="${accent}" stroke-width="3"/>`,shield:`<path d="M58 36L88 49 83 88 58 110 33 88 28 49z" fill="url(#${uid})" stroke="${light}" stroke-width="4"/><path d="M40 55L58 44 76 55" stroke="${accent}" stroke-width="3" fill="none"/>`,star:`<path d="M58 33l12 25 28 4-20 19 5 27-25-13-25 13 5-27-20-19 28-4z" fill="url(#${uid})" stroke="${light}" stroke-width="3"/>`,sun:`<path d="M58 26l10 14 16-8 2 18 18 5-11 14 11 14-18 6-2 18-16-8-10 14-10-14-16 8-2-18-18-6 11-14-11-14 18-5 2-18 16 8z" fill="url(#${uid})" stroke="${light}" stroke-width="3"/>`,laurel:`<path d="M58 29L89 48l-5 45-26 18-26-18-5-45z" fill="url(#${uid})" stroke="${light}" stroke-width="4"/><path d="M25 103Q11 78 28 54M91 103q14-25-3-49" stroke="${light}" stroke-width="4" fill="none"/><path d="M18 84l-9-8M20 71l-12-9M26 58l-9-10M98 84l9-8M96 71l12-9M90 58l9-10" stroke="${light}" stroke-width="3"/><path d="M43 29l5-11 10 9 10-9 5 11z" fill="${light}"/>`}[r.shape];
 const stars=t>=3?`<path d="M47 26l3-6 3 6 6 1-5 5 1 6-5-3-5 3 1-6-5-5z" fill="${light}"/>`:'';
 return `<svg class="medal" viewBox="0 0 116 132" role="img" aria-label="${esc(r.name)} 훈장"><defs><linearGradient id="${uid}" x1="0" x2="1" y1="0" y2=".9"><stop stop-color="${light}"/><stop offset=".52" stop-color="${base}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><path d="M37 4l18 0 4 40-18 4z" fill="${base}" stroke="${light}" stroke-width="1.2"/><path d="M61 4l18 0-4 44-18-4z" fill="${accent}" stroke="${light}" stroke-width="1.2"/><path d="M42 4l6 38M71 4l-6 38" stroke="${light}" stroke-opacity=".8" stroke-width="2.5"/>${stars}${geom}<circle cx="58" cy="73" r="17" fill="#203645" stroke="${light}" stroke-width="2.4"/><text x="58" y="80" font-size="19" font-weight="900" fill="${light}" text-anchor="middle" font-family="serif">${r.roman}</text><circle cx="58" cy="73" r="35" fill="none" stroke="${accent}" stroke-width="1.1" stroke-dasharray="1 12"/></svg>`;
}

return {TYPES,POSITION,RANKS,unitIcon,medal};
})();

const e3dNationStates=new Map();
function e3dState(nationId){
 if(!e3dNationStates.has(nationId))e3dNationStates.set(nationId,{selected:null,sort:'id',query:'',min:0,scroll:0,previewTier:null,medalsOpen:false});
 return e3dNationStates.get(nationId);
}
function e3dStat(rec){const r=rec||{};return {wins:r.wins||0,losses:r.losses||0,kills:r.enemyKillsCredited||0,deaths:r.ownBattleDeaths||0,wars:r.warIds?.length||0,battles:(r.wins||0)+(r.losses||0)};}
function e3dRate(r){return r.battles?100*r.wins/r.battles:null;}
function e3dKD(r){return r.deaths? r.kills/r.deaths:null;}
function e3dQuarter(day){if(!Number.isSafeInteger(day))return '기록 없음';const t=timeAt(day);return `${t.year}년 ${t.quarter}분기`;}
function e3dIcon(type){const span=make('span',{class:'e3d-unit-portrait','aria-hidden':'true'});span.innerHTML=e3dVisuals.unitIcon(type);return span;}
function e3dMedal(tier){const span=make('span',{class:'e3d-medal-art'});span.innerHTML=e3dVisuals.medal(tier);return span;}
function e3dCell(label,value){return make('div',{class:'e3d-score'},[make('small',{text:label}),make('strong',{text:value})]);}
// H1B1: independent automaton troop counters for per-nation military UI.
// Never add machines to human manpower, recruitment, or military training totals.
function h1b1ArmyMachineStats(w,a){
 const groups=hGroups(w,a);
 const ready=groups.reduce((n,g)=>n+g.ready,0);
 const damaged=groups.reduce((n,g)=>n+g.damaged,0);
 const disabled=groups.reduce((n,g)=>n+g.disabled,0);
 const powered=groups.reduce((n,g)=>n+(g.fueled===false?0:g.ready),0);
 return {groups,ready,damaged,disabled,powered,total:ready+damaged+disabled};
}
function h1b1ArmyMachineDetail(w,a){
 const status=h1b1ArmyMachineStats(w,a);
 if(!status.total)return null;
 const panel=make('section',{class:'h1b1-machine-panel','aria-label':`제${a.id+1}군 오토마톤 구성`});
 panel.append(make('h4',{class:'e3d-section-title',text:`⚙ 오토마톤 독립 편제 · ${number.format(status.total)}대`}),
  make('div',{class:'h1b1-machine-summary',text:`정상 ${number.format(status.ready)}대 (동력 공급 ${number.format(status.powered)}대) · 손상 ${number.format(status.damaged)}대 · 기능 정지 ${number.format(status.disabled)}대 · ${status.groups.length}개 기계 그룹`}),
  make('small',{class:'e3d-note',text:'오토마톤은 인간 인원·훈련과 분리 집계하되, 실제 전투 위치는 아래 전열/후열 편제에 함께 표시합니다.'}));
 for(const g of status.groups){
  const blueprint=w.hAutomaton?.blueprints?.find(b=>b.id===g.blueprintId&&b.ownerNationId===g.ownerNationId&&b.revision===g.revision);
  panel.append(make('div',{class:'h1b1-machine-group'},[
   make('strong',{text:`${blueprint?.name||H_BLUEPRINT.name} · 그룹 #${g.id} · ${g.position==='front'?'전열':'후열'}`}),
   make('small',{text:`정상 ${number.format(g.ready)}대 · 손상 ${number.format(g.damaged)}대 · 기능 정지 ${number.format(g.disabled)}대 · ${g.fueled===false?'동력 공급 중단':'동력 공급 가능'}`})]));
 }
 if(a.hServiceReturn)panel.append(make('small',{class:'h1b1-machine-repair',text:`정비 거점 복귀 · 목표 타일 #${a.hServiceReturn.targetTileId} · ${a.hServiceReturn.tow?'유상 견인':'자력 이동'}`}));
 if(a.hRepairPlan)panel.append(make('small',{class:'h1b1-machine-repair',text:`정비 중 ${a.hRepairPlan.amount}대 · 완료 예정 ${e3dQuarter(a.hRepairPlan.completeDay)} (${Math.max(0,a.hRepairPlan.completeDay-w.dayIndex)}일 후)`}));
 return panel;
}
function e3dCompositionBar(a){
 const wrap=make('div',{class:'e3d-composition'}),bar=make('div',{class:'e3d-bar'}),legend=make('div',{class:'e3d-legend'}),tot=manpower(a)||1;
 const types=new Map();for(const u of a.units)if(u.manpower>0)types.set(u.typeId,(types.get(u.typeId)||0)+u.manpower);
 for(const [type,men] of [...types].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))){
  const color=e3dVisuals.TYPES[type]?.[1]||'#9bb4c1',name=UNIT_TYPES[type]?.label||type;
  const seg=make('span',{title:`${name} ${men}명`,style:{width:`${100*men/tot}%`,background:color}});bar.append(seg);
  legend.append(make('span',{},[make('i',{class:'e3d-dot',style:{background:color}}),document.createTextNode(`${name} ${number.format(men)}명`)]));
 }
 wrap.append(bar,legend);return wrap;
}
function e3dUnitCard(u){
 const name=UNIT_TYPES[u.typeId]?.label||u.typeId,men=u.manpower;
 const totalTrained=c3ReadyMen(u),pending=c3PendingMen(u),card=make('div',{class:'e3d-unit-card'});
 const content=make('div',{class:'e3d-unit-text'},[
  make('strong',{text:`${name} · ${number.format(men)}명`}),
  make('small',{text:`${WEAPONS[u.weaponId]?.label||u.weaponId||'기본 무기'} · ${ARMORS[u.armorId]?.label||u.armorId||'무갑'}`}),
  make('small',{text:`전문훈련 완료 ${number.format(totalTrained)}명 / 진행 ${number.format(pending)}명 (${men?Math.round(totalTrained/men*100):0}%)`})
 ]);
 if(u.typeId==='field_artillery')content.append(make('small',{class:'e3d-guns',text:`실제 전장포 ${number.format(u.guns||0)}문 · 운용 인원 ${number.format(men)}명 (별도 단위)`}));
 card.append(e3dIcon(u.typeId),content);return card;
}
function e3dFormationDetail(w,n,a,state){
 const detail=make('section',{class:'e3d-selected',id:'e3d-selected-detail','aria-label':`제${a.id+1}군 상세`});
 const record=e3dStat(a.combatRecord),rank=b4aRankIndex(a),show=state.previewTier===null?rank:state.previewTier;
 const currentXP=Math.max(0,a.formationExperience?.xp||0),next=B4A_XP_THRESHOLDS[Math.min(6,rank+1)],previous=B4A_XP_THRESHOLDS[rank];
 const progress=Math.min(100,Math.max(0,100*(currentXP-previous)/Math.max(1,next-previous)));
 const cmd=w.characters.find(c=>c.id===a.commanderId),header=make('div',{class:'e3d-detail-heading'},[
  make('div',{},[make('small',{class:'e3d-eyebrow',text:'SELECTED FORMATION · LIVE WORLD'}),make('h3',{text:`제${a.id+1}군 · 인간 ${number.format(manpower(a))}명 · 오토마톤 ${number.format(hCount(w,a,true))}대`}),make('small',{text:`${a.status} · 지휘관 ${cmd?.name||'없음'} · 창설 ${e3dQuarter(a.c6CreatedDay)} · 위치 타일 #${a.tileId}`})]),
  make('span',{class:'e3d-status',text:`사기 ${Math.round(a.morale)} · 보급 ${armySupplyLabel(a)}`})]);
 detail.append(header);
 const rankPanel=make('div',{class:'e3d-rank-panel'}),art=make('div',{class:'e3d-rank-art'},[
  e3dMedal(show),make('strong',{text:`훈련도 Lv. ${e3dVisuals.RANKS[show].roman}`}),make('small',{text:e3dVisuals.RANKS[show].name}),
  ...(show!==rank?[make('small',{class:'e3d-preview-warning',text:'도감 미리보기 · 실제 숙련도 변경 없음'})]:[])]);
 const info=make('div',{class:'e3d-rank-info'},[
  make('small',{class:'e3d-eyebrow',text:'FORMATION EXPERIENCE · 6 RANKS'}),
  make('h4',{text:`실제 등급: Lv. ${e3dVisuals.RANKS[rank].roman} · ${b4aRankLabel(a)}`}),
  make('small',{text:'편제 숙련도(전투 경험·정규 훈련)이며 병종별 전문훈련 완료율과는 다른 지표입니다.'}),
  make('div',{class:'e3d-xp-track'},[make('span',{style:{width:`${progress}%`}})]),
  make('div',{class:'e3d-between'},[make('strong',{text:`${number.format(currentXP)} XP`}),make('small',{text:rank===5?'최고 등급':`다음 등급 ${number.format(next)} XP`})]),
  make('small',{text:`전투 경험 ${a.formationExperience?.combatRounds||0}라운드 · 정규 훈련 ${a.formationExperience?.trainingSessions||0}회 · 전투력 보정 +${(b4aPowerBonus(a)*100).toFixed(1)}%`})]);
 rankPanel.append(art,info);detail.append(rankPanel);
 const stats=make('div',{class:'e3d-scores'},[
  e3dCell('승리 / 패배',`${record.wins}승 ${record.losses}패`),
  e3dCell('승률',e3dRate(record)===null?'—':e3dRate(record).toFixed(1)+'%'),
  e3dCell('적 처치 추정 기여',number.format(record.kills)+'명'),
  e3dCell('손실 대비 처치',e3dKD(record)===null?'손실 0 · 비율 제외':e3dKD(record).toFixed(2)),
  e3dCell('아군 전투 사망',number.format(record.deaths)+'명'),
  e3dCell('참전 전쟁',record.wars+'개'),
  e3dCell('교전당 처치',record.battles?(record.kills/record.battles).toFixed(1)+'명':'—'),
  e3dCell('교전당 손실',record.battles?(record.deaths/record.battles).toFixed(1)+'명':'—')]);
 detail.append(stats,make('small',{class:'e3d-note',text:`전적은 ${e3dQuarter(a.combatRecord?.fromDay)} 이후의 결과 · 적 처치는 합동전 편제 기여도 비례 배분(추정) · 전투 사망은 패주 손실 포함 · 기존 세이브의 과거 기록은 소급하지 않음`}));
 detail.append(make('h4',{class:'e3d-section-title',text:'▦ 현재 인간 병종 구성 및 비율'}),e3dCompositionBar(a));
 if(!manpower(a))detail.append(make('small',{class:'e3d-note',text:'인간 병력 없음 · 기계 편제는 아래에서 별도 표시합니다.'}));
 const machinePanel=h1b1ArmyMachineDetail(w,a);if(machinePanel)detail.append(machinePanel);
 detail.append(make('h4',{class:'e3d-section-title',text:'♟ 편제 구성 병력 · 전열 배치'}));
 const indexed=new Map(a.units.map(u=>[u.id,u]));
 for(const [role,label] of e3dVisuals.POSITION){
  const groups=(a.deployment?.[role]||[]).map(id=>indexed.get(id)).filter(u=>u?.manpower>0),sum=groups.reduce((s,u)=>s+u.manpower,0);
  const machineGroups=hGroups(w,a).filter(g=>g.position===role);
  const machines=machineGroups.reduce((total,g)=>total+hAliveMachine(w,g),0);
  const block=make('section',{class:'e3d-role'},[
   make('div',{class:'e3d-role-heading'},[make('strong',{text:`${label} · 인간 ${number.format(sum)}명 · 오토마톤 ${number.format(machines)}대`}),make('small',{text:`인간 ${groups.length}그룹 · 기계 ${machineGroups.length}그룹`})])]);
  const grid=make('div',{class:'e3d-unit-grid'});
  for(const u of groups)grid.append(e3dUnitCard(u));
  for(const g of machineGroups){const card=make('div',{class:'e3d-unit-card'},[
    make('span',{class:'e3d-unit-portrait',text:'⚙'}),
    make('div',{class:'e3d-unit-text'},[
      make('strong',{text:`${h2gResolve(w,g.ownerNationId,g.blueprintId,g.revision).blueprint.name} · ${number.format(hAliveMachine(w,g))}대`}),
      make('small',{text:`정상 ${g.ready} · 손상 ${g.damaged} · 기능 정지 ${g.disabled}`}),
      make('small',{text:`그룹 #${g.id} · ${g.fueled?'동력 공급':'동력 부족'}`})])]);grid.append(card);}
  if(!groups.length&&!machineGroups.length)grid.append(make('small',{class:'e3d-empty',text:'배치 병력 없음'}));
  block.append(grid);detail.append(block);
 }
 const gallery=make('details',{class:'e3d-gallery',id:'e3d-medal-gallery'});gallery.open=state.medalsOpen;
 gallery.append(make('summary',{text:'✦ 편제 훈장 6등급 도감 · 선택해 모양 미리보기'}));
 const medals=make('div',{class:'e3d-medal-gallery'});
 e3dVisuals.RANKS.forEach((r,i)=>{
  const b=make('button',{type:'button',class:'e3d-gallery-btn'+(show===i?' selected':''),'aria-label':`훈련도 ${r.name} 시각화 미리보기`});
  b.append(e3dMedal(i),make('strong',{text:`Lv. ${r.roman}`}),make('small',{text:r.name}));
  b.addEventListener('click',()=>{state.previewTier=i;e3dRefreshDetail();});medals.append(b);
 });gallery.append(medals);gallery.addEventListener('toggle',()=>{state.medalsOpen=gallery.open;});detail.append(gallery);
 if(state.previewTier!==null){const reset=make('button',{class:'jump-button',type:'button',text:'실제 훈장으로 돌아가기'});reset.addEventListener('click',()=>{state.previewTier=null;e3dRefreshDetail();});detail.append(reset);}
 const legacy=make('details',{class:'e3d-legacy-details',id:`e3d-extra-${n.id}-${a.id}`});
 legacy.append(make('summary',{text:'기존 군사 AI · 훈련·전선·정치 상태 상세'}));
 const extras=make('div',{class:'e3d-legacy-body'});
 extras.append(make('small',{text:`전투력 ${getArmyBasePower(w,a)} · 이동/명령 ${a.operation?.type||'대기'} · 전문훈련 완료 ${c3ArmyReady(a)}명 / 진행 ${c3ArmyPending(a)}명 · ${c3TrainingBlockReason(w,a)}`}));
 if(a.g2aOrderStatus)extras.append(make('small',{text:`군사 AI: ${a.g2aOrderStatus} · 재검토 ${Math.max(0,(a.g2aNextOrderReviewDay||w.dayIndex)-w.dayIndex)}일 후`}));
 if(a.assignedWarId!==null)extras.append(make('small',{text:`C6 전선 #${a.assignedWarId+1} · 배정 사유 ${a.c6FrontDecision?.reason||'검토 중'}`}));
 if(a.f3fRout&&!armyOffensiveReady(w,a))extras.append(make('small',{text:`패전 후 출동 제한 · 사기 ${Math.round(a.morale)}/${F3F_RALLY_MORALE}`}));
 extras.append(d1cArmyDetails(w,a));legacy.append(extras);
 legacy.open=state.extraOpen||false;legacy.addEventListener('toggle',()=>{state.extraOpen=legacy.open;});
 detail.append(legacy);
 const jump=make('button',{class:'jump-button',type:'button',text:'▦ 지도에서 이 편제 보기'});
 jump.addEventListener('click',()=>{goToMap(a.tileId);map.focusArmy(a.id);});detail.append(jump);
 return detail;
}
function e3dBuildNationRoster(w,n,armies){
 const state=e3dState(n.id),wrap=make('section',{class:'e3d-roster','aria-label':`${n.name}의 편제 시각화 및 전투 전적`});
 wrap.append(make('h3',{text:'E3D · 편제 현황 및 전투 성적'}));
 const top=make('div',{class:'e3d-controls'});
 const query=make('input',{type:'search','aria-label':'편제 번호 또는 병종 검색',placeholder:'편제 번호 / 병종 검색'});query.value=state.query;
 const sort=make('select',{'aria-label':'편제 정렬'});
 for(const [value,label] of [['id','편제 번호순'],['kills','적 처치 많은 순'],['kd','처치/손실 높은 순'],['winrate','승률 높은 순'],['perKill','교전당 처치 높은 순'],['perLoss','교전당 손실 적은 순'],['xp','숙련도 높은 순'],['wars','참전 전쟁 많은 순'],['created','창설 빠른 순']])sort.append(make('option',{value,text:label}));
 sort.value=state.sort;
 const min=make('select',{'aria-label':'최소 판정 교전 수'});for(const m of [0,5,10,30])min.append(make('option',{value:m,text:m?`${m}전 이상`:'전체 교전'}));min.value=String(state.min);
 top.append(query,sort,min);wrap.append(top);
 const layout=make('div',{class:'e3d-roster-layout'}),list=make('div',{class:'e3d-army-list','aria-label':'국가 편제 목록'}),focus=make('div',{class:'e3d-focus'});
 layout.append(list,focus);wrap.append(layout);
 function visible(){
  const q=state.query.toLocaleLowerCase('ko-KR');
  const rows=armies.filter(a=>{
   const r=e3dStat(a.combatRecord);return r.battles>=state.min&&(!q||`제${a.id+1}군 ${a.id+1} ${a.id} ${a.units.map(u=>UNIT_TYPES[u.typeId]?.label||u.typeId).join(' ')} ${hCount(w,a,true)>0?'오토마톤 기계부대':''}`.toLocaleLowerCase('ko-KR').includes(q));
  });
  const metric=a=>{const r=e3dStat(a.combatRecord);switch(state.sort){case 'kills':return r.kills;case 'kd':return e3dKD(r)??-1;case 'winrate':return e3dRate(r)??-1;case 'perKill':return r.battles?r.kills/r.battles:-1;case 'perLoss':return r.battles?r.deaths/r.battles:Infinity;case 'xp':return a.formationExperience?.xp||0;case 'wars':return r.wars;case 'created':return a.c6CreatedDay??w.dayIndex;default:return a.id;}};
  rows.sort((a,b)=>(state.sort==='id'||state.sort==='created'||state.sort==='perLoss'?metric(a)-metric(b):metric(b)-metric(a))||a.id-b.id);
  return rows;
 }
 function renderList(){
  const before=list.scrollTop,items=visible();list.replaceChildren();
  for(const a of items){
   const r=e3dStat(a.combatRecord),rank=b4aRankIndex(a),button=make('button',{type:'button',class:'e3d-army-item'+(a.id===state.selected?' selected':''),'aria-pressed':String(a.id===state.selected)});
   button.append(make('strong',{text:`⚔ 제${a.id+1}군 · 인간 ${number.format(manpower(a))}명 · 오토마톤 ${number.format(hCount(w,a,true))}대`}));
   button.append(make('small',{text:`Lv.${e3dVisuals.RANKS[rank].roman} ${b4aRankLabel(a)} · ${r.wins}승 ${r.losses}패 · 처치 ${r.kills} / 사망 ${r.deaths}`}));
   const xp=make('div',{class:'e3d-army-xp'},[make('span',{style:{width:`${Math.min(100,100*(a.formationExperience?.xp||0)/2000)}%`}})]);button.append(xp);
   button.addEventListener('click',()=>{state.selected=a.id;state.previewTier=null;renderList();renderDetail();});list.append(button);
  }
  if(!items.length)list.append(make('small',{class:'e3d-empty',text:'조건에 맞는 편제가 없습니다.'}));
  list.scrollTop=before;
 }
 function renderDetail(){
  const a=armies.find(a=>a.id===state.selected)||armies[0];
  if(!a){focus.replaceChildren(make('div',{class:'e3d-empty',text:'현재 국가에는 군대가 없습니다.'}));return;}
  if(state.selected===null||!armies.some(x=>x.id===state.selected))state.selected=a.id;
  focus.replaceChildren(e3dFormationDetail(w,n,a,state));
 }
 // e3dRefreshDetail is a module-scoped handler to preserve the approved preview's rank gallery interactions.
 const oldRefresh=e3dRefreshDetail;
 e3dRefreshDetail=()=>{if(!wrap.isConnected)return;renderDetail();};
 query.addEventListener('input',()=>{state.query=query.value;list.scrollTop=0;renderList();});
 sort.addEventListener('change',()=>{state.sort=sort.value;list.scrollTop=0;renderList();});
 min.addEventListener('change',()=>{state.min=Number(min.value);list.scrollTop=0;renderList();});
 list.addEventListener('scroll',()=>{state.scroll=list.scrollTop;},{passive:true});
 renderList();list.scrollTop=state.scroll;renderDetail();
 return wrap;
}
let e3dRefreshDetail=()=>{};
// V0.7E3E — International market data view.  This UI NEVER updates simulation state.
const E3E_MARKET_LABELS={food:'식량',wood:'목재',stone:'석재',iron:'철',coal:'석탄',machine_parts:'기계 부품',steel:'강철'};
let e3eSelectedGood='food',e3eSelectedNation=null;
function e3eMarketSparkline(quarters,good){
 const xmlns='http://www.w3.org/2000/svg',svg=document.createElementNS(xmlns,'svg');
 svg.setAttribute('viewBox','0 0 620 148');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${E3E_MARKET_LABELS[good]} 최근 시장가격 변화`);
 svg.classList.add('e3e-market-plot');
 const values=quarters.map(q=>({day:q.dayIndex,p:(q.pricesBefore?.[good]??e3eBaseMilli(good))/1000}));
 if(quarters.length)values.push({day:quarters.at(-1).dayIndex+30,p:(quarters.at(-1).pricesAfter?.[good]??e3eBaseMilli(good))/1000});
 if(!values.length)return make('p',{class:'muted-line',text:'시장 관측은 첫 분기부터 시작됩니다.'});
 const mx=Math.max(...values.map(x=>x.p)),mn=Math.min(...values.map(x=>x.p)),low=Math.max(0,mn-(mx-mn||1)*.2),high=mx+(mx-mn||1)*.2;
 const scale=(i,v)=>[24+(values.length===1?0:i*(570/(values.length-1))),130-(v-low)/(high-low)*110];
 for(let j=0;j<4;j++){
  const y=20+j*36,line=document.createElementNS(xmlns,'line');
  for(const [k,v] of [['x1',24],['x2',597],['y1',y],['y2',y]])line.setAttribute(k,String(v));
  line.setAttribute('stroke','rgba(140,175,190,.18)');line.setAttribute('stroke-width','1');svg.append(line);
 }
 const path=document.createElementNS(xmlns,'path');path.setAttribute('d',values.map((x,i)=>{const [a,b]=scale(i,x.p);return `${i?'L':'M'}${a.toFixed(2)},${b.toFixed(2)}`;}).join(' '));
 path.setAttribute('fill','none');path.setAttribute('stroke','#85d4c4');path.setAttribute('stroke-width','3');path.setAttribute('stroke-linejoin','round');svg.append(path);
 const [endX,endY]=scale(values.length-1,values.at(-1).p),dot=document.createElementNS(xmlns,'circle');dot.setAttribute('cx',endX);dot.setAttribute('cy',endY);dot.setAttribute('r','4');dot.setAttribute('fill','#e5cc93');svg.append(dot);
 return svg;
}
function e3eRenderMarketPanel(){
 const w=app.world,el=$('e3eMarketBody');if(!w||!el)return;
 const m=e3eEnsureMarket(w),good=e3eSelectedGood;
 const chosenNation=e3eSelectedNation===null?app.selectedNationId:e3eSelectedNation;
 const nation=w.nations[chosenNation]||w.nations[0],lq=m.lastQuarter;
 const top=make('div',{class:'e3e-market-overview'});
 top.append(make('div',{class:'e3e-market-stat'},[make('small',{text:'시장 상태'}),make('strong',{text:m.openedDay===null?'체결 전 · 개장 대기':'개장 · '+(timeAt(m.openedDay).year)+'년'}),make('small',{text:'직접 교역 우선 · 간접 중개 가능'})]),
   make('div',{class:'e3e-market-stat'},[make('small',{text:'최근 분기 체결'}),make('strong',{text:number.format(lq?.trades||0)+'건'}),make('small',{text:number.format(lq?.totalVolume||0)+'개 실물 이전'})]),
   make('div',{class:'e3e-market-stat'},[make('small',{text:'누적 거래대금'}),make('strong',{text:number.format(m.totals.buyerPaid)+' G'}),make('small',{text:'실제 구매자 지출 · 수수료 포함'})]),
   make('div',{class:'e3e-market-stat'},[make('small',{text:'누적 공식 수수료 소멸'}),make('strong',{text:number.format(m.totals.feesSink)+' G'}),make('small',{text:'기본 각 10% + 간접 구매 추가 15%p'})]));
 const modeSummary=make('div',{class:'e3e-market-detail'});
 modeSummary.append(make('h3',{text:'이번 분기 직접 · 간접 거래'}),make('div',{class:'e3e-market-grid'},[
  ...[['직접 거래량',lq?.directVolume||0],['간접 거래량',lq?.indirectVolume||0],['간접 거래 횟수',lq?.indirectTrades||0],['간접 추가 운송비',lq?.indirectFeeGold||0]].map(([label,value])=>make('div',{class:'e3e-market-mini'},[make('small',{text:label}),make('strong',{text:number.format(value)})]))]));
 const prices=make('div',{class:'e3e-market-prices'});
 for(const g of E3E_GOOD_INDEX){
   const prev=lq?.pricesBefore?.[g]||e3eBaseMilli(g),current=m.prices[g],pct=prev?(current/prev-1)*100:0;
   const b=make('button',{type:'button',class:'e3e-market-good'+(good===g?' selected':'')});
   b.append(make('small',{text:E3E_MARKET_LABELS[g]}),make('strong',{text:e3ePriceText(current)+' G'}),make('small',{text:`최근 분기 ${pct>=0?'+':''}${pct.toFixed(1)}% · 기준 ${TRADE_GOODS[g].price} G`}));
   b.addEventListener('click',()=>{e3eSelectedGood=g;e3eRenderMarketPanel();});prices.append(b);
 }
 const q=lq?.goods?.[good],data=make('div',{class:'e3e-market-detail'});
 data.append(make('h3',{text:`${E3E_MARKET_LABELS[good]} · 국제 가격 추이`}),e3eMarketSparkline(m.quarters,good));
 data.append(make('div',{class:'e3e-market-grid'},[
   ...[['유효 매수 주문',q?.validDemand||0],['유효 매도 주문',q?.validSupply||0],['실제 거래 수량',q?.volume||0],['미체결 매수',q?.unfilledBuy||0],['미체결 매도',q?.unfilledSell||0],['최근 분기 수수료',q?.feesSink||0],['직접 체결량',q?.directVolume||0],['간접 체결량',q?.indirectVolume||0]].map(([t,v])=>make('div',{class:'e3e-market-mini'},[make('small',{text:t}),make('strong',{text:number.format(v)})]))]));
 // F2A5-C: explain observed food order scarcity without changing any market rules.
 if(good==='food'&&q){
  const orderGap=Math.max(0,q.requestedBuy-q.requestedSell);
  const diagnosis=q.requestedBuy>q.requestedSell?
    (q.unfilledSell===0?'식량 매도 주문 전량 체결 · 매수 대비 공급 주문 부족':'매수 주문이 매도 주문보다 많고 거래 제약도 존재'):
    (q.unfilledBuy>0?'매도 주문은 있으나 미체결 매수 존재 · 거래 조건을 확인':'요청량 기준 공급 충분');
  data.append(make('p',{class:'muted-line',text:`식량 공급 진단: ${diagnosis} · 매수 ${number.format(q.requestedBuy)} / 매도 ${number.format(q.requestedSell)} · 주문량 격차 ${number.format(orderGap)}. 미체결의 실제 사유는 아래 주문·차단 내역을 확인하세요.`}));
 }
 const selector=make('select',{id:'e3eMarketNationSelect','aria-label':'시장 국가 선택'});
 for(const n of w.nations)selector.append(make('option',{value:String(n.id),text:n.name+(n.active?'':' · 멸망')}));
 selector.value=String(nation.id);
 selector.addEventListener('change',()=>{e3eSelectedNation=Number(selector.value);e3eRenderMarketPanel();});
 const info=m.lastNation.find(x=>x.id===nation.id),nationBox=make('div',{class:'e3e-market-detail'});
 nationBox.append(make('div',{class:'e3e-market-subhead'},[make('h3',{text:'국가별 시장 거래'}),selector]));
 nationBox.append(make('p',{class:'muted-line',text:`${nation.name} · ${nation.controller==='PLAYER'?'플레이어 조종':'AI 자동 주문'} · 식량 ${number.format(nation.resources.food)} · 목재 ${number.format(nation.resources.wood)} · 석재 ${number.format(nation.resources.stone)} · 철 ${number.format(nation.resources.iron)} · 석탄 ${number.format(nation.resources.coal||0)} · 기계 부품 ${number.format(nation.resources.machine_parts||0)} · 강철 ${number.format(nation.resources.steel||0)} · 포탄 ${number.format(nation.resources.artillery_shells||0)} · 국고 ${number.format(nation.gold)} G`}));
 const woodStatus=e3e3WoodSignal(w,nation),woodRecovery=e3e3EnsureSupply(nation).lastRecovery;
 nationBox.append(make('p',{class:'muted-line',text:`목재 공급 진단: ${woodStatus.needed?'회복 필요':'충분'} · 생산 ${number.format(woodStatus.produced)}/분기 · 예상 지출 ${number.format(woodStatus.estimatedUse)} · 4분기 예상 재고 ${number.format(woodStatus.forecastFourQuarters)} · ${woodRecovery?.state||'관측 중'} · 실제 관측 ${woodStatus.observedQuarters}/4분기` }));
 nationBox.append(make('div',{class:'e3e-market-grid'},[
  ...[['금분기 매입량',Object.values(info?.bought||{}).reduce((a,b)=>a+b,0)],['금분기 매도량',Object.values(info?.sold||{}).reduce((a,b)=>a+b,0)],['금분기 구매 지출',info?.buyerPaid||0],['금분기 판매 수령',info?.sellerReceived||0],['간접 수입 화물',`${number.format(info?.indirectImportFreight||0)} / ${number.format(e3e3IndirectLimit(w,nation.id))}`],['간접 수출 화물',`${number.format(info?.indirectExportFreight||0)} / ${number.format(e3e3IndirectLimit(w,nation.id))}`],['간접 추가 수수료',info?.indirectFeeGold||0]].map(([t,v])=>make('div',{class:'e3e-market-mini'},[make('small',{text:t}),make('strong',{text:typeof v==='string'?v:number.format(v)})]))]));
 // Registered manual player orders are executed at the next economic quarter, not instantly.
 if(nation.controller==='PLAYER'&&nation.active){
   const action=make('div',{class:'e3e-market-detail'},[make('h3',{text:'플레이어 시장 지정가 주문'})]);
   action.append(make('p',{class:'muted-line',text:'시장 주문은 30일 분기 결산에서 재고·국고·거래 가능한 상대국이 있을 때만 체결됩니다. 직접 교역을 먼저 시도하고 나머지는 추가 비용을 내는 간접 거래로 체결할 수 있습니다. 체결 전에는 자원/Gold가 차감되지 않으며, 4분기 뒤 만료됩니다.'}));
   const controls=make('div',{class:'e3e-market-order-form'});
   const direction=make('select',{id:'e3eMarketSide'});
   direction.append(make('option',{value:'BUY',text:'매수'}),make('option',{value:'SELL',text:'매도'}));
   const quantity=make('input',{type:'number',min:'1',max:'10000',step:'1',value:'50','aria-label':'시장 주문 수량'});
   const limit=make('input',{type:'number',min:String(TRADE_GOODS[good].price*.5),max:String(TRADE_GOODS[good].price*3),step:'.001',value:e3ePriceText(m.prices[good]),'aria-label':'시장 지정가 (Gold)'});
   const submit=make('button',{type:'button',class:'jump-button',text:'주문 등록 / 갱신'});
   submit.addEventListener('click',()=>{
      const r=e3eSetManualOrder(app.world,nation.id,good,direction.value,Number(quantity.value),Math.round(Number(limit.value)*1000));
      showToast(r.reason);e3eRenderMarketPanel();
   });
   const estimate=make('p',{class:'muted-line',text:'매수 시 수수료: 직접 +10%, 간접 +25% (기본 10% + 물류 15%). 지정가는 수수료 전 시장가격입니다.'});
   action.append(estimate);
   controls.append(make('label',{},[make('small',{text:'방향'}),direction]),make('label',{},[make('small',{text:'수량 (개)'}),quantity]),make('label',{},[make('small',{text:'지정가 (G/개)'}),limit]),submit);
   action.append(controls);
   const pending=m.pendingOrders.filter(o=>o.nationId===nation.id);
   for(const o of pending){const r=make('div',{class:'e3e-market-pending'},[
     make('span',{text:`#${o.id} · ${E3E_MARKET_LABELS[o.good]} ${o.side==='BUY'?'매수':'매도'} · 잔량 ${o.remaining}개 · ${e3ePriceText(o.limitPriceMilli)}G 지정가`})]);
     const cancel=make('button',{type:'button',class:'text-button',text:'취소'});
     cancel.addEventListener('click',()=>{e3eCancelManualOrder(app.world,o.id);e3eRenderMarketPanel();});r.append(cancel);action.append(r);
   }
   nationBox.append(action);
 }
 const orders=m.lastOrders.filter(x=>x.good===good).sort((a,b)=>a.side.localeCompare(b.side)||a.nationId-b.nationId);
 const table=make('div',{class:'e3e-market-detail'},[make('h3',{text:`${E3E_MARKET_LABELS[good]} · 최근 분기 주문 (최대 24개 표시)`})]);
 table.append(make('p',{class:'muted-line',text:'미체결 주문은 다음 분기에 새 재고·국고·교역로 조건으로 재평가됩니다. 임의의 가상 판매자는 없습니다.'}));
 const list=make('div',{class:'e3e-market-order-list'});
 for(const o of orders.slice(0,24))list.append(make('div',{class:'e3e-market-row'},[make('strong',{text:w.nations[o.nationId]?.name||'—'}),
  make('span',{text:o.side==='BUY'?'매수':'매도'}),make('span',{text:`요청 ${number.format(o.requested)} · 체결 ${number.format(o.filled)}`}),
  make('span',{text:o.unfilled?`미체결 ${number.format(o.unfilled)} · ${({'NO_BUYER':'매수국 없음','NO_SELLER_SURPLUS':'판매 잉여 없음','DIPLOMATIC_BLOCK':'외교 제한','LIMIT_PRICE':'지정가 불일치','INDIRECT_IMPORT_CAP':'간접 수입 한도','INDIRECT_EXPORT_CAP':'간접 수출 한도','GOLD':'구매 자금 부족','SAFE_STOCK':'안전 재고 보호','FREIGHT_OR_COUNTERPARTY_CAP':'운송·상대국 한도','DIRECT_FREIGHT_CAP':'직접 운송 한도','NO_MATCHING_COUNTERPARTY':'잔여 거래 가능 상대 없음'})[o.blockReason]||'거래 제약'}`:'전량 체결'})]));
 if(!orders.length)list.append(make('p',{class:'muted-line',text:'이 품목에 접수된 주문이 없습니다.'}));table.append(list);
 const fills=m.fills.filter(x=>x.good===good).slice(-15).reverse(),recent=make('div',{class:'e3e-market-detail'},[make('h3',{text:'최근 체결 내역'})]);
 const fillList=make('div',{class:'e3e-market-order-list'});
 for(const f of fills)fillList.append(make('div',{class:'e3e-market-row'},[make('strong',{text:`${w.nations[f.seller]?.name||'?'} → ${w.nations[f.buyer]?.name||'?'}`}),
  make('span',{text:timeAt(f.dayIndex).year+'년 · '+(f.mode==='INDIRECT'?'간접':'직접')}),make('span',{text:`${number.format(f.quantity)}개 · ${e3ePriceText(f.priceMilli)} G/개`}),
  make('span',{text:`구매 ${number.format(f.buyerPaid)} / 판매 ${number.format(f.sellerReceived)} G · 기본 수수료 ${number.format(f.baseFeeGold??f.feeGold)}G + 간접 ${number.format(f.indirectFeeGold||0)}G`})]));
 if(!fills.length)fillList.append(make('p',{class:'muted-line',text:'체결 이력이 없습니다.'}));recent.append(fillList);
 const blockBox=make('div',{class:'e3e-market-detail'},[make('h3',{text:'이번 분기 미체결 주요 원인'})]);
 const reasons={'NO_BUYER':'매수국 없음','NO_SELLER_SURPLUS':'판매 잉여 부족','DIPLOMATIC_BLOCK':'외교 제한','DIRECT_ROUTE_CAP':'직접 운송 한도','INDIRECT_IMPORT_CAP':'간접 수입 한도','INDIRECT_EXPORT_CAP':'간접 수출 한도','GOLD':'Gold 부족','LIMIT_PRICE':'지정가 불일치','SAFE_STOCK':'안전 재고','FREIGHT_OR_COUNTERPARTY_CAP':'운송·거래 상대국 한도','NO_MATCHING_COUNTERPARTY':'잔여 거래 가능 상대 없음'};
 const blockEntries=Object.entries(m.lastBlocks||{}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,7);
 blockBox.append(make('p',{class:'muted-line',text:blockEntries.length?blockEntries.map(([k,v])=>`${reasons[k]||k}: ${number.format(v)}개`).join(' · '):'최근 분기 미체결 기록이 없습니다.'}));
 const note=make('p',{class:'e3e-market-hint',text:'실제 육로 연결이 있으면 먼저 직접 거래하고, 주문 잔량은 비적대국 국제시장 중개로 간접 체결할 수 있습니다. 간접 거래의 구매 수수료는 25%(기본 10% + 추가 운송비 15%), 판매 수수료는 10%입니다. 국가별 간접 수입·수출은 기본 3,000 화물이며 고도 수송망·상업 교통망·간선망 계획 기술별로 500씩 증가해 최대 4,500 화물입니다. 실물 재고와 Gold를 이전합니다. 기존 세이브의 이전 거래는 직접 거래로만 보존됩니다.'});
 const industry=make('div',{class:'e3e-market-detail'});
 const power=f1EnsureIndustry(nation),x=power.lastQuarter;
 const d=nation.f2a4FirstFactoryDecision;
 industry.append(make('h3',{text:'F2A4 · 첫 공장 투자 진단'}),make('p',{class:'muted-line',text:d?`최종 연간 평가 ${Math.floor(d.dayIndex/120)+1}년 · ${d.reason} · 식량 ${d.foodPath}${d.foodSufficiency===undefined?'':' · 충족률 '+(d.foodSufficiency*100).toFixed(1)+'%'}${d.buildingId!==undefined?' · 시설 #'+d.buildingId:''}${d.financeAfter!==undefined?' · 예상 분기 순수입 '+number.format(d.financeAfter)+' G':''}`:'아직 평가 기록이 없습니다.'}));
  industry.append(make('h3',{text:'F2A~F2B · 국가별 산업 재고/생산'}),make('p',{class:'muted-line',text:`기계 부품 재고 ${number.format(nation.resources.machine_parts||0)} · 강철 ${number.format(nation.resources.steel||0)} · 제강소 ${number.format(w.buildings.filter(b=>b.typeId==='steelworks'&&w.tiles[b.tileId]?.ownerId===nation.id).length)} · 양수장 ${number.format(w.buildings.filter(b=>b.typeId==='steam_pump'&&w.tiles[b.tileId]?.ownerId===nation.id).length)} · 이번 분기 생산 ${number.format(nation.f2Factory?.lastQuarter?.produced||0)} · 소비 ${number.format(nation.f2Factory?.lastQuarter?.used||0)} · 공장 가동 ${number.format(nation.f2Factory?.lastQuarter?.operated||0)}곳 · 공장 전력 ${number.format(nation.f2Factory?.lastQuarter?.powerUsed||0)} PU`}),make('p',{class:'muted-line',text:`석탄 재고 ${number.format(nation.resources.coal||0)} · 실제 채굴 ${number.format(x?.coalProduced||0)}/분기 (감산 ${number.format(x?.coalDepletionLoss||0)}) · 고품위 탄층 잔여 ${f2b1CoalSeamSummary(w,nation.id).remainingPct??'—'}% · 광맥 ${f2b1CoalSeamSummary(w,nation.id).siteCount}곳 · 최저 채굴 효율 45% · 연료 소모 ${number.format(x?.coalConsumed||0)}/분기 · 동력 ${number.format(x?.powerUsed||0)}/${number.format(x?.powerProduced||0)} PU · 동력 절감 노동 수요 ${number.format(x?.laborSaved||0)}명분 · 증기 가동 ${number.format(x?.steamSites||0)}개 · ${civilizationLabel(nation)}` }));
 const fq=f2bEnsure(nation).lastQuarter,decision=f2bEnsure(nation).lastDecision;
 industry.append(make('h3',{text:'F2C · 산업 근대 I 군수 제작'}),make('p',{class:'muted-line',text:`군수 제작소 ${nation.f2cArsenal?.lastQuarter?.operated||0}/${nation.f2cArsenal?.lastQuarter?.sites||0} 가동 · 포탄 생산 ${nation.f2cArsenal?.lastQuarter?.produced||0} · 포탄 전투 사용 ${nation.f2cArsenal?.lastQuarter?.combatUsed||0} · 현재 포탄 재고 ${number.format(nation.resources.artillery_shells||0)} · 군수 투자 ${nation.f2cArsenal?.lastDecision?.reason||'—'} · 건설 식량 충족률 ${nation.f2cArsenal?.lastDecision?.foodSufficiency===undefined?'—':(nation.f2cArsenal.lastDecision.foodSufficiency*100).toFixed(1)+'%'} (${nation.f2cArsenal?.lastDecision?.foodGate||'미평가'}) · 전장포 AI ${nation.f2cArsenal?.lastArtilleryDecision?.reason||'미평가'} · 전장포 편성 ${nation.f2cArsenal?.lastArtilleryDecision?.gunsRaised||0}문 · 후보 ${nation.f2cArsenal?.lastArtilleryDecision?.eligibleArmies??0}개 부대` }));
  const dm=f2c2cEnsure(nation),dq=dm.lastQuarter;
  industry.append(make('h3',{text:'F2C2C · 산업 수요·설비 가동'}),
   make('p',{class:'muted-line',text:`기계부품 목표 ${dm.plan.machine_parts} / 실제 ${nation.resources.machine_parts||0} · ${dq?.partsReason||'미평가'} · 최근 생산 ${dq?.partsOutput||0} · 제강 목표 ${dm.plan.steel} / 실제 ${nation.resources.steel||0} · ${dq?.steelReason||'미평가'} · 최근 생산 ${dq?.steelOutput||0} · 기록 ${dm.history.length}/48분기`}),
   make('p',{class:'muted-line',text:`휴업은 계획된 재고 조절이며 건물 파괴가 아닙니다. 가동률·재고 부족 이력을 이용해 필요한 국가만 공장 증설을 시도합니다.`}));
  const j=f2jEnsure(nation),jF=w.buildings.filter(b=>b.typeId==='factory'&&w.tiles[b.tileId]?.ownerId===nation.id),jL4=jF.filter(b=>b.level===4);
  const jRun=jL4.filter(b=>b.f2jLastQuarter?.operated).length;
  industry.append(make('h3',{text:'V0.7J · 공장 Lv.4와 설비 투자'}),
   make('p',{class:'muted-line',text:`공장 총 ${jF.length} · Lv.4 ${jL4.length} · 이번 분기 Lv.4 가동 ${jRun}/${jL4.length} · 최근 투자 ${f2jLabel(j.lastDecision?.reason)} · 부족 관측 ${j.lastDecision?.demandQuarters??'—'}/8분기 · 부품 수요 ${j.lastDecision?.demand??'—'}/분기 · 현재 생산상한 ${j.lastDecision?.capacity??'—'}/분기`}),
   make('p',{class:'muted-line',text:jL4.length?jL4.map(b=>`#${b.id} Lv.4: ${f2jLabel(b.f2jLastQuarter?.reason)} · 부품 ${b.f2jLastQuarter?.parts??0}개 · 외부동력 ${b.f2jLastQuarter?.externalPU??0} PU`).join(' / '):'Lv.4 설치 전 — 최근 수요·인력·지역 자재·송력 연결을 충족하는 국가만 증설합니다.'}));
  industry.append(make('h3',{text:'F2B · 강철과 산업 부지'}),make('p',{class:'muted-line',text:`제강소 ${fq.steelworksOperated}/${fq.steelworksSites} 가동 · 강철 +${fq.steel.produced} 생산, ${fq.steel.imports} 수입, ${fq.steel.exports} 수출 · 양수장 ${fq.pumpsOperated}/${fq.pumpSites} 가동 · 부품 사용 ${fq.machine_parts.used}개 · 관개 식량 +${fq.pumpExtraFood} · 신규 산업 투자 ${decision.reason}`}),make('p',{class:'muted-line',text:`제강소 투입 철 ${fq.ironUsed} · 석탄 ${fq.coalUsed} · Gold ${fq.goldUsed} · 강철 재고 ${nation.resources.steel||0} · 산업 전용 부지 ${w.buildings.filter(b=>b.industrialSlot&&b.settlementId!==null&&w.tiles[b.tileId]?.ownerId===nation.id).length}개` }));
 for(const [label,ext,content,mime] of [['동력·석탄 JSON','json',()=>JSON.stringify(f1IndustrySummary(w),null,2),'application/json'],['동력·석탄 CSV','csv',()=>f1IndustryCsv(w),'text/csv;charset=utf-8']]){
  const b=make('button',{type:'button',class:'jump-button',text:label});
  b.addEventListener('click',()=>download(`vilob-f1-industry-day${w.dayIndex}.${ext}`,content(),mime));industry.append(b);
 }
 el.replaceChildren(top,modeSummary,prices,data,nationBox,industry,table,recent,blockBox,note);
}

// V0.7E3E3 — quarter-only country wood and freight overview.
function e3e3RenderWorldSupply(){
 const el=document.getElementById('e3e3WorldSupply'),w=app.world;if(!el||!w)return;
 const lines=[];
 for(const n of w.nations.filter(n=>n.active)){
  const a=e3e3WoodSignal(w,n),s=e3e3EnsureSupply(n),last=s.history.at(-1);
  lines.push(make('div',{class:'muted-line',text:`${n.name}: 목재 ${number.format(n.resources.wood)} · ${a.needed?'공급 위험':'안정'} · 분기 생산 ${number.format(a.produced)} · ${s.lastRecovery?.state||'후보 관측 중'} · 응급 벌목 ${number.format(s.f1b?.lastQuarter?.produced||0)} (${s.f1b?.lastQuarter?.sites||0}곳) · 석탄 ${number.format(n.resources.coal||0)} · 기계 부품 ${number.format(n.resources.machine_parts||0)} · 동력 ${number.format(n.f1Industry?.lastQuarter.powerUsed||0)} PU · 간접 ${number.format(last?.importUsed||0)}/${number.format(last?.importCap||e3e3IndirectLimit(w,n.id))} (수입), ${number.format(last?.exportUsed||0)}/${number.format(last?.exportCap||e3e3IndirectLimit(w,n.id))} (수출)`}));
 }
 el.replaceChildren(...lines);
}
