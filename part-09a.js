// V0.9A — genuine paid naval hulls, crews, and water-only movement.
// This module intentionally does NOT create sea combat, trade shipments or army transport.
const NAVY_SHIP_TYPES=Object.freeze({
 coastal_galley:{label:'연안 노선',portLevel:1,tech:'timber_processing',gold:600,apUnits:10,resources:{wood:75,iron:5},days:90,crew:8,hp:60,daysPerTile:5,coast:2,upkeep:8},
 medieval_galley:{label:'중세 갤리선',portLevel:2,tech:'commercial_transport',gold:1800,apUnits:18,resources:{wood:135,iron:35},days:140,crew:24,hp:110,daysPerTile:3,coast:3,upkeep:22},
 sailing_transport:{label:'대형 범선',portLevel:3,tech:'commercial_transport',gold:2400,apUnits:20,resources:{wood:170,iron:45},days:180,crew:15,hp:125,daysPerTile:3,coast:Infinity,upkeep:30},
 steam_transport:{label:'증기 수송선',portLevel:3,tech:'steam_engineering',gold:4400,apUnits:25,resources:{wood:110,iron:80,steel:20,machine_parts:20},days:240,crew:18,hp:140,daysPerTile:2,coast:Infinity,coalPer:3,upkeep:38}
});
function navyNew(){return {schema:1,nextShipId:1,nextFleetId:1,produced:0,scrapped:0,lost:0,ships:[],fleets:[],events:[],lastAIDay:-120};}
function navyEnsure(w){if(!w.navy)w.navy=navyNew();return w.navy;}
function navyLog(w,status,nationId,details=''){
 const nv=navyEnsure(w);nv.events.push({dayIndex:w.dayIndex,status,nationId,details:String(details).slice(0,130)});
 if(nv.events.length>100)nv.events.splice(0,nv.events.length-100);
 w.changeSeq++;
}
function navyIsCoast(w,tid){return !!w.tiles[tid]&&w.tiles[tid].terrain!=='water'&&neighbors4(tid,w.size,w.height).some(id=>w.tiles[id].terrain==='water');}
function navyWaterAtPort(w,b){if(!b||b.typeId!=='port'||!['ACTIVE','UPGRADING'].includes(b.status)||b.disconnected)return null;
 const tile=w.tiles[b.tileId],s=w.settlements.find(s=>s.id===b.settlementId);
 if(!tile||!s||tile.ownerId!==s.ownerId||tile.occupiedBy!==null)return null;
 return neighbors4(tile.id,w.size,w.height).filter(id=>w.tiles[id].terrain==='water').sort((a,b)=>a-b)[0]??null;
}
function navyCoastDistance(w,tileId){if(w.tiles[tileId]?.terrain!=='water')return Infinity;
 if(neighbors4(tileId,w.size,w.height).some(id=>w.tiles[id].terrain!=='water'))return 0;
 let nodes=[tileId],seen=new Set(nodes);
 for(let d=1;d<=3;d++){const next=[];for(const id of nodes)for(const nb of neighbors4(id,w.size,w.height)){
  if(w.tiles[nb].terrain!=='water')return d-1;
  if(!seen.has(nb)){seen.add(nb);next.push(nb);}
 }nodes=next;}return 3;
}
function navyPath(w,start,target,coast=Infinity){
 if(!Number.isInteger(start)||!Number.isInteger(target)||w.tiles[start]?.terrain!=='water'||w.tiles[target]?.terrain!=='water')return null;
 if(start===target)return [start];
 const previous=new Map([[start,-1]]),queue=[start];
 for(let at=0;at<queue.length;at++){
  const id=queue[at];for(const next of neighbors4(id,w.size,w.height)){
   if(previous.has(next)||w.tiles[next]?.terrain!=='water'||navyCoastDistance(w,next)>coast)continue;
   previous.set(next,id);if(next===target){const path=[target];for(let cur=id;cur!==-1;cur=previous.get(cur))path.push(cur);return path.reverse();}
   queue.push(next);
  }
 }
 return null;
}
function navyWaterSize(w,tileId,cap=10001){
 if(w.tiles[tileId]?.terrain!=='water')return 0;
 const seen=new Set([tileId]),q=[tileId];for(let at=0;at<q.length&&q.length<cap;at++)for(const nb of neighbors4(q[at],w.size,w.height))if(!seen.has(nb)&&w.tiles[nb].terrain==='water'){seen.add(nb);q.push(nb);}return q.length;
}
function navyPortLegal(w,nationId,settlementId,tileId){
 const s=w.settlements.find(s=>s.id===settlementId&&s.ownerId===nationId);
 return Boolean(s&&s.tileIds.includes(tileId)&&navyIsCoast(w,tileId)&&!w.buildings.some(b=>b.typeId==='port'&&b.settlementId===settlementId));
}
function navyShipPrice(typeId){const type=NAVY_SHIP_TYPES[typeId];return type?{gold:type.gold,apUnits:type.apUnits,knowledge:0,resources:{...type.resources}}:null;}
function navyPortOwner(w,b,nationId){return Boolean(b?.typeId==='port'&&['ACTIVE','UPGRADING'].includes(b.status)&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===nationId&&w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===nationId));}
function navyActionLegal(w,nationId,a){
 const n=w.nations[nationId],nv=navyEnsure(w);if(!n?.active||!a)return false;
 if(a.type==='NAVY_BUILD_SHIP'){
  const p=w.buildings.find(b=>b.id===a.portId),type=NAVY_SHIP_TYPES[a.shipType];
  if(!p||!type||!navyPortOwner(w,p,nationId)||p.level<type.portLevel||navyWaterAtPort(w,p)===null||!hasTech(w,nationId,type.tech))return false;
  if(nv.ships.some(s=>s.homePortBuildingId===p.id&&s.status==='BUILDING'))return false;
  return canAfford(n,navyShipPrice(a.shipType));
 }
 if(a.type==='NAVY_CREW'){
  const ship=nv.ships.find(s=>s.id===a.shipId&&s.nationId===nationId),port=ship&&w.buildings.find(b=>b.id===ship.homePortBuildingId),town=port&&w.settlements.find(s=>s.id===port.settlementId),type=ship&&NAVY_SHIP_TYPES[ship.typeId];
  return Boolean(ship&&ship.status==='UNCREWED'&&port&&navyPortOwner(w,port,nationId)&&town&&town.population>=type.crew+10&&ship.tileId===navyWaterAtPort(w,port));
 }
 if(a.type==='NAVY_SAIL'){
  const fleet=nv.fleets.find(f=>f.id===a.fleetId&&f.nationId===nationId),ships=fleet?.shipIds.map(id=>nv.ships.find(s=>s.id===id));
  if(!fleet||fleet.status==='SAILING'||!ships?.length||ships.some(s=>!s||s.status!=='READY'||s.tileId!==fleet.tileId))return false;
  const coast=Math.min(...ships.map(s=>NAVY_SHIP_TYPES[s.typeId].coast));
  const path=navyPath(w,fleet.tileId,a.targetTileId,coast);
  if(!path||path.length<2)return false;
  const coal=ships.reduce((sum,s)=>sum+(NAVY_SHIP_TYPES[s.typeId].coalPer?Math.ceil((path.length-1)/NAVY_SHIP_TYPES[s.typeId].coalPer):0),0);
  return (n.resources.coal||0)>=coal;
 }
 if(a.type==='NAVY_DECOMMISSION'){
  const ship=nv.ships.find(s=>s.id===a.shipId&&s.nationId===nationId),fleet=ship&&nv.fleets.find(f=>f.shipIds.includes(ship.id)),port=ship&&w.buildings.find(b=>b.id===ship.homePortBuildingId);
  return Boolean(ship&&ship.status!=='BUILDING'&&fleet?.status!=='SAILING'&&port&&navyPortOwner(w,port,nationId)&&ship.tileId===navyWaterAtPort(w,port));
 }
 return false;
}
function navyActionExecute(w,nationId,a){
 if(!navyActionLegal(w,nationId,a))return {ok:false,reason:'해군 행동 조건·자원·항로 부족'};
 const nv=navyEnsure(w),n=w.nations[nationId];
 if(a.type==='NAVY_BUILD_SHIP'){
  const type=NAVY_SHIP_TYPES[a.shipType],port=w.buildings.find(b=>b.id===a.portId),price=navyShipPrice(a.shipType);
  if(!payCost(n,price))return {ok:false,reason:'자원 부족'};
  const tid=navyWaterAtPort(w,port),id=nv.nextShipId++,fleetId=nv.nextFleetId++;
  nv.ships.push({id,nationId,typeId:a.shipType,homePortBuildingId:port.id,tileId:tid,hp:type.hp,crew:0,crewCulturePopulation:{},status:'BUILDING',startedDay:w.dayIndex,completeDay:w.dayIndex+type.days,serviceSteps:0});
  nv.fleets.push({id:fleetId,nationId,shipIds:[id],tileId:tid,status:'DOCKED',path:[],nextArrivalDay:null,targetTileId:null});
  nv.produced++;i1Reconcile(w,n);navyLog(w,'SHIP_STARTED',nationId,`${type.label} #${id}`);
  return {ok:true,shipId:id,fleetId,completeDay:w.dayIndex+type.days};
 }
 if(a.type==='NAVY_CREW'){
  const s=nv.ships.find(s=>s.id===a.shipId),port=w.buildings.find(b=>b.id===s.homePortBuildingId),town=w.settlements.find(x=>x.id===port.settlementId),required=NAVY_SHIP_TYPES[s.typeId].crew;
  const culture=d1CultureTake(town.culturePopulation,required);town.population-=required;s.crew=required;s.crewCulturePopulation=culture;s.crewOriginSettlementId=town.id;s.status='READY';
  d1bSyncGroups(town,w);d2aSyncGroups(w,town);refreshSettlementLevel(town);
  navyLog(w,'CREW_RECRUITED',nationId,`${s.id}:${required}`);return {ok:true,shipId:s.id,crew:required};
 }
 if(a.type==='NAVY_SAIL'){
  const f=nv.fleets.find(f=>f.id===a.fleetId),ships=f.shipIds.map(id=>nv.ships.find(s=>s.id===id)),coast=Math.min(...ships.map(s=>NAVY_SHIP_TYPES[s.typeId].coast)),path=navyPath(w,f.tileId,a.targetTileId,coast);
  const coal=ships.reduce((sum,s)=>sum+(NAVY_SHIP_TYPES[s.typeId].coalPer?Math.ceil((path.length-1)/NAVY_SHIP_TYPES[s.typeId].coalPer):0),0);
  n.resources.coal=(n.resources.coal||0)-coal;i1Reconcile(w,n);
  f.path=path.slice(1);f.targetTileId=a.targetTileId;f.status='SAILING';f.coalReserved=coal;
  f.nextArrivalDay=w.dayIndex+Math.max(...ships.map(s=>NAVY_SHIP_TYPES[s.typeId].daysPerTile));
  ships.forEach(s=>{s.status='SAILING';});navyLog(w,'SAILED',nationId,`${f.id}: ${path.length-1} tiles, coal ${coal}`);
  return {ok:true,fleetId:f.id,arrivalDay:f.nextArrivalDay,coal};
 }
 if(a.type==='NAVY_DECOMMISSION'){
  const ship=nv.ships.find(s=>s.id===a.shipId),fleet=nv.fleets.find(f=>f.shipIds.includes(ship.id)),town=w.settlements.find(s=>s.id===ship.crewOriginSettlementId&&s.ownerId===nationId)||w.settlements.find(s=>s.ownerId===nationId);
  if(ship.crew>0&&!town)return {ok:false,reason:'선원 귀환 가능 정착지 없음'};
  if(town&&ship.crew){town.population+=ship.crew;d1CultureAdd(town.culturePopulation,ship.crewCulturePopulation);d1bSyncGroups(town,w);d2aSyncGroups(w,town);refreshSettlementLevel(town);}
  nv.ships=nv.ships.filter(s=>s.id!==ship.id);fleet.shipIds=fleet.shipIds.filter(id=>id!==ship.id);if(!fleet.shipIds.length)nv.fleets=nv.fleets.filter(f=>f.id!==fleet.id);
  nv.scrapped++;navyLog(w,'DECOMMISSIONED',nationId,ship.id);return {ok:true};
 }
 return {ok:false,reason:'알 수 없는 해군 행동'};
}
function navyNextDay(w){const nv=navyEnsure(w);let day=Infinity;
 for(const ship of nv.ships)if(ship.status==='BUILDING'&&ship.completeDay>w.dayIndex)day=Math.min(day,ship.completeDay);
 for(const fleet of nv.fleets)if(fleet.status==='SAILING'&&fleet.nextArrivalDay>w.dayIndex)day=Math.min(day,fleet.nextArrivalDay);
 return day;
}
function navyProcessDay(w){const nv=navyEnsure(w);
 for(const s of nv.ships)if(s.status==='BUILDING'&&s.completeDay<=w.dayIndex){s.status='UNCREWED';navyLog(w,'SHIP_COMPLETED',s.nationId,s.id);}
 for(const f of nv.fleets)if(f.status==='SAILING'&&f.nextArrivalDay<=w.dayIndex){
  const next=f.path.shift();if(w.tiles[next]?.terrain!=='water')throw Error('해군 이동 경로에 육지가 포함됨');
  f.tileId=next;for(const id of f.shipIds){const s=nv.ships.find(s=>s.id===id);if(!s)throw Error('함대 선박 참조 손상');s.tileId=next;s.serviceSteps++;}
  if(f.path.length){f.nextArrivalDay=w.dayIndex+Math.max(...f.shipIds.map(id=>NAVY_SHIP_TYPES[nv.ships.find(s=>s.id===id).typeId].daysPerTile));}
  else {f.nextArrivalDay=null;f.status='DOCKED';f.targetTileId=null;f.coalReserved=0;for(const id of f.shipIds)nv.ships.find(s=>s.id===id).status='READY';navyLog(w,'DOCKED',f.nationId,`${f.id}@${next}`);}
  w.changeSeq++;
 }
}
function navyPortCandidates(w,nationId){
 const out=[];for(const s of w.settlements.filter(s=>s.ownerId===nationId).sort((a,b)=>a.id-b.id)){
  if(w.buildings.some(b=>b.typeId==='port'&&b.settlementId===s.id))continue;
  for(const tid of s.tileIds.slice().sort((a,b)=>a-b)){
   const a={type:'BUILD_FACILITY',buildingType:'port',targetTileId:tid,settlementId:s.id};
   if(buildingSiteLegal(w,nationId,a)){out.push({action:a,water:navyWaterAtLand(w,tid)});break;}
  }
 }return out;
}
function navyWaterAtLand(w,tid){return neighbors4(tid,w.size,w.height).filter(id=>w.tiles[id].terrain==='water').sort((a,b)=>a-b)[0]??null;}
function navyQuarterUpkeep(w){const nv=navyEnsure(w);
 for(const n of w.nations){if(!n.active)continue;
  const ports=w.buildings.filter(b=>b.typeId==='port'&&['ACTIVE','UPGRADING'].includes(b.status)&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===n.id);
  const ships=nv.ships.filter(s=>s.nationId===n.id&&s.status!=='BUILDING');
  const billed=ports.reduce((total,p)=>total+(p.level===1?16:p.level===2?35:70),0)+ships.reduce((total,s)=>total+NAVY_SHIP_TYPES[s.typeId].upkeep,0);
  nv.upkeepArrears??={};const due=billed+(nv.upkeepArrears[n.id]||0),paid=Math.min(n.gold,due);n.gold-=paid;nv.upkeepArrears[n.id]=due-paid;
  if(billed){nv.upkeepBilled=(nv.upkeepBilled||0)+billed;nv.upkeepPaid=(nv.upkeepPaid||0)+paid;}
 }
}
function navyAIQuarter(w){if(w.dayIndex%120!==0)return;const nv=navyEnsure(w);nv.lastAIDay=w.dayIndex;
 for(const n of w.nations){if(!n.active||n.controller!=='AI'||!hasTech(w,n.id,'timber_processing'))continue;
  const ports=w.buildings.filter(b=>b.typeId==='port'&&w.tiles[b.tileId]?.ownerId===n.id).sort((a,b)=>a.id-b.id),ships=nv.ships.filter(s=>s.nationId===n.id),fleet=nv.fleets.filter(f=>f.nationId===n.id);
  if(!ports.length){const pick=navyPortCandidates(w,n.id).filter(p=>p.water!==null&&navyWaterSize(w,p.water,6)>=6)[0];
   if(pick&&n.gold>=1750&&canExecuteNationAction(w,n.id,pick.action))executeNationAction(w,n.id,pick.action);
   continue;
  }
  const p=ports.find(p=>navyPortOwner(w,p,n.id)&&navyWaterAtPort(w,p)!==null);
  if(!p)continue;
  // V0.9A observation-first cap: one completed/pending hull per nation until sea trade becomes useful.
  if(!ships.length){const types=['coastal_galley','medieval_galley','sailing_transport','steam_transport'];
   const choice=types.findLast(type=>p.level>=NAVY_SHIP_TYPES[type].portLevel&&hasTech(w,n.id,NAVY_SHIP_TYPES[type].tech)&&n.gold>=NAVY_SHIP_TYPES[type].gold*3&&navyActionLegal(w,n.id,{type:'NAVY_BUILD_SHIP',portId:p.id,shipType:type}));
   if(choice)navyActionExecute(w,n.id,{type:'NAVY_BUILD_SHIP',portId:p.id,shipType:choice});continue;
  }
  for(const ship of ships){if(ship.status==='UNCREWED'){navyActionExecute(w,n.id,{type:'NAVY_CREW',shipId:ship.id});break;}}
  for(const f of fleet){if(f.status!=='DOCKED'||!f.shipIds.every(id=>nv.ships.find(s=>s.id===id)?.status==='READY'))continue;
   const dock=navyWaterAtPort(w,p),coast=Math.min(...f.shipIds.map(id=>NAVY_SHIP_TYPES[nv.ships.find(s=>s.id===id).typeId].coast));
   if(f.tileId!==dock){if(navyActionLegal(w,n.id,{type:'NAVY_SAIL',fleetId:f.id,targetTileId:dock}))navyActionExecute(w,n.id,{type:'NAVY_SAIL',fleetId:f.id,targetTileId:dock});}
   else {const target=neighbors4(dock,w.size,w.height).filter(id=>w.tiles[id].terrain==='water'&&navyCoastDistance(w,id)<=coast).sort((a,b)=>a-b)[0];
     if(target!==undefined&&navyActionLegal(w,n.id,{type:'NAVY_SAIL',fleetId:f.id,targetTileId:target}))navyActionExecute(w,n.id,{type:'NAVY_SAIL',fleetId:f.id,targetTileId:target});}
  }
 }
}
function navyValidate(w,fail){const nv=w.navy;if(!nv||nv.schema!==1||!Array.isArray(nv.ships)||!Array.isArray(nv.fleets)||!Array.isArray(nv.events)||nv.events.length>100)return fail('V0.9A 해군 상태');
 if(!Number.isSafeInteger(nv.produced)||!Number.isSafeInteger(nv.scrapped)||!Number.isSafeInteger(nv.lost)||nv.produced!==nv.ships.length+nv.scrapped+nv.lost||nv.ships.length>w.tiles.length*3||nv.fleets.length>nv.ships.length)return fail('V0.9A 선박 실물 보존식');
 const shipIDs=new Set(),fleetIDs=new Set(),fleetShips=new Set();
 for(const s of nv.ships){const t=NAVY_SHIP_TYPES[s.typeId],b=w.buildings.find(b=>b.id===s.homePortBuildingId);
  if(!Number.isSafeInteger(s.id)||shipIDs.has(s.id)||!w.nations[s.nationId]||!t||!b||b.typeId!=='port'||w.tiles[s.tileId]?.terrain!=='water'||!Number.isInteger(s.hp)||s.hp<1||s.hp>t.hp||!Number.isSafeInteger(s.crew)||s.crew<0||s.crew>t.crew||d1CultureTotal(s.crewCulturePopulation)!==s.crew||!['BUILDING','UNCREWED','READY','SAILING'].includes(s.status)||!Number.isSafeInteger(s.completeDay)||s.completeDay<s.startedDay||s.startedDay>w.dayIndex||s.status==='BUILDING'&&s.crew>0||s.status!=='BUILDING'&&s.crew!==0&&s.crew!==t.crew)return fail('V0.9A 선박·선원');
  if(s.status==='BUILDING'&&s.completeDay<=w.dayIndex)return fail('V0.9A 선박 건조 완료 누락');
  if(Object.keys(s.crewCulturePopulation).some(id=>!w.cultures.some(c=>c.id===id)))return fail('V0.9A 선원 문화 ID');
  shipIDs.add(s.id);
 }
 for(const f of nv.fleets){if(!Number.isSafeInteger(f.id)||fleetIDs.has(f.id)||!w.nations[f.nationId]||w.tiles[f.tileId]?.terrain!=='water'||!Array.isArray(f.shipIds)||!f.shipIds.length||!Array.isArray(f.path)||!['DOCKED','SAILING'].includes(f.status))return fail('V0.9A 함대');
  if(f.status==='SAILING'&&(!Number.isSafeInteger(f.nextArrivalDay)||f.nextArrivalDay<=w.dayIndex||!f.path.length)||f.status==='DOCKED'&&(f.nextArrivalDay!==null||f.path.length))return fail('V0.9A 함대 이동 일정');
  if(f.path.some(id=>w.tiles[id]?.terrain!=='water'))return fail('V0.9A 함대 경로');
  for(const id of f.shipIds){const s=nv.ships.find(s=>s.id===id);if(!s||fleetShips.has(id)||s.nationId!==f.nationId||s.tileId!==f.tileId||s.status==='SAILING'!==(f.status==='SAILING'))return fail('V0.9A 함대 선박 참조');fleetShips.add(id);}
  fleetIDs.add(f.id);
 }
 if(fleetShips.size!==nv.ships.length)return fail('V0.9A 미배치 함선');
 for(const e of nv.events)if(!Number.isSafeInteger(e.dayIndex)||e.dayIndex>w.dayIndex||!w.nations[e.nationId]||typeof e.status!=='string')return fail('V0.9A 해군 이력');
 return true;
}
function navySummary(w){const nv=navyEnsure(w);return {version:w.version,dayIndex:w.dayIndex,ports:w.buildings.filter(b=>b.typeId==='port').length,ships:nv.ships.length,fleets:nv.fleets.length,crew:nv.ships.reduce((n,s)=>n+s.crew,0),produced:nv.produced,scrapped:nv.scrapped,events:nv.events.slice(-15)};}
function navyDrawOverlay(renderer){if(!renderer.world?.navy?.fleets?.length)return;const ctx=renderer.ctx,scale=renderer.scale,ox=renderer.originX,oy=renderer.originY;
 ctx.save();for(const f of renderer.world.navy.fleets){const t=renderer.world.tiles[f.tileId];if(!t)continue;const x=ox+(t.x+.5)*scale,y=oy+(t.y+.52)*scale;if(x<-20||y<-20||x>renderer.width+20||y>renderer.height+20)continue;
  ctx.beginPath();ctx.arc(x,y,Math.max(7,Math.min(14,scale*.28)),0,Math.PI*2);ctx.fillStyle='#07364d';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=renderer.world.nations[f.nationId]?.color||'#d9edf9';ctx.stroke();ctx.font=`bold ${Math.max(11,Math.min(18,scale*.40))}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f5fbff';ctx.fillText('⛵',x,y);
 }ctx.restore();}
function navyRenderPanel(){if(typeof app==='undefined'||!app.world)return;const host=document.getElementById('navyPanel');if(!host)return;
 const w=app.world,nv=navyEnsure(w),n=w.nations[app.selectedNationId]||w.nations[0],ports=w.buildings.filter(b=>b.typeId==='port'&&w.tiles[b.tileId]?.ownerId===n.id),ships=nv.ships.filter(s=>s.nationId===n.id);
 host.replaceChildren();const h=document.createElement('h3');h.textContent=`⚓ V0.9A 해군 · ${n.name} · 항구 ${ports.length} / 선박 ${ships.length} / 선원 ${ships.reduce((a,s)=>a+s.crew,0)}명`;host.append(h);
 const note=document.createElement('p');note.className='muted-line';note.textContent='고대 연안 노선부터 시작 · 항해·건조·승무원 실물 장부. 해전/해상 수송/교역은 추후 업데이트.';host.append(note);
 function button(parent,label,action){const b=document.createElement('button');b.type='button';b.className='jump-button';b.textContent=label;b.addEventListener('click',()=>{let r=executeNationAction(w,n.id,action);if(!r.ok)showToast(r.reason||'실행 불가');else showToast(label+' 완료');navyRenderPanel();map.draw();updateStats();});parent.append(b);}
 if(n.controller==='PLAYER'){
  for(const {action} of navyPortCandidates(w,n.id).slice(0,5))if(canExecuteNationAction(w,n.id,action))button(host,`항구 Lv.1 착공 · 타일 ${action.targetTileId}`,action);
 }
 for(const p of ports){const line=document.createElement('div');line.className='army-detail';line.textContent=`⚓ ${w.settlements.find(s=>s.id===p.settlementId)?.name||'정착지'} 항구 Lv.${p.level} · ${p.status} · 타일 ${p.tileId}`;host.append(line);
  if(n.controller==='PLAYER'){
   const up={type:'UPGRADE_FACILITY',buildingId:p.id};if(canExecuteNationAction(w,n.id,up))button(line,'항구 개량',up);
   for(const [type,spec] of Object.entries(NAVY_SHIP_TYPES)){const act={type:'NAVY_BUILD_SHIP',portId:p.id,shipType:type};if(navyActionLegal(w,n.id,act))button(line,`${spec.label} 건조 (${spec.gold}G)`,act);}
  }
 }
 for(const s of ships){const fleet=nv.fleets.find(f=>f.shipIds.includes(s.id)),spec=NAVY_SHIP_TYPES[s.typeId],line=document.createElement('div');line.className='army-detail';line.textContent=`⛵ #${s.id} ${spec.label} · ${s.status} · HP ${s.hp}/${spec.hp} · 선원 ${s.crew}/${spec.crew} · 물 타일 ${s.tileId}${s.status==='BUILDING'?' · 완공 '+s.completeDay+'일':''}${fleet?.status==='SAILING'?' · 다음 이동 '+fleet.nextArrivalDay+'일':''}`;host.append(line);
  if(n.controller==='PLAYER'){
   const crew={type:'NAVY_CREW',shipId:s.id};if(navyActionLegal(w,n.id,crew))button(line,'선원 모집',crew);
   if(s.status==='READY'&&fleet?.status==='DOCKED'){
    const row=document.createElement('div');line.append(row);const inp=document.createElement('input');inp.type='number';inp.min=0;inp.max=w.tiles.length-1;inp.placeholder='목표 물 타일 ID';inp.style.width='150px';row.append(inp);
    const sail=document.createElement('button');sail.className='jump-button';sail.textContent='항해 명령';sail.addEventListener('click',()=>{const a={type:'NAVY_SAIL',fleetId:fleet.id,targetTileId:Number(inp.value)};const r=navyActionExecute(w,n.id,a);showToast(r.ok?'함대 출항':'항로·석탄·조건 부족');navyRenderPanel();map.draw();});row.append(sail);
    const quit={type:'NAVY_DECOMMISSION',shipId:s.id};if(navyActionLegal(w,n.id,quit))button(line,'퇴역 (선원 귀환)',quit);
   }
  }
 }
}
