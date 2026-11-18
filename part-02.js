// --- src/sim/technology.js ---
/** V0.2A: nation-level research. No individual researchers, resources or RNG. */
const TECHNOLOGIES=Object.freeze([
  // V0.7K: researched, not retroactively unlocked on existing saves.
  {id:'continuous_industrial_process',name:'연속 산업공정',branch:'resources',tier:25,cost:42000,requires:['industrial_process_standardization','industrial_quality_control'],effects:{}},
  {id:'integrated_factory_management',name:'통합 공장 운영 체계',branch:'administration',tier:26,cost:48000,requires:['continuous_industrial_process','industrial_freight_coordination','industrial_research_organization'],effects:{},unlocks:['era:industrial_modern_4']},
  {id:'precision_machine_standardization',name:'정밀 기계 생산 표준',branch:'resources',tier:27,cost:52000,requires:['integrated_factory_management','industrial_quality_control'],effects:{factoryOutput:.10}},
  {id:'machine_gun_corps',name:'기관총 운용대 편성',branch:'military',tier:27,cost:56500,requires:['integrated_factory_management','precision_machine_standardization','rifled_musket_manufacture','standardized_field_training'],effects:{},unlocks:['loadout:machine_gunner','weapon:machine_gun']},
  {id:'tracked_vehicle_engineering',name:'궤도식 차체 공학',branch:'resources',tier:28,cost:59000,requires:['large_machine_assembly','steam_engineering','steel_quality_improvement','precision_machine_standardization'],effects:{}},
  {id:'armored_combat_doctrine',name:'시제 기갑 운용 교리',branch:'military',tier:29,cost:62000,requires:['tracked_vehicle_engineering','machine_gun_corps','field_artillery_casting','integrated_factory_management'],effects:{},unlocks:['vehicle:early_assault_tank']},
  ...(H_ENABLED?[
  {id:'automaton_assembly',name:'경량 오토마톤 제작법',branch:'resources',tier:23,cost:34000,requires:['industrial_quality_control','industrial_process_standardization'],effects:{},unlocks:['era:industrial_modern_3','automaton:light_infantry_support_i']},
  {id:'automaton_field_control',name:'자율기계 야전 통제',branch:'military',tier:24,cost:37000,requires:['automaton_assembly','standardized_field_training'],effects:{}},
  {id:'automaton_maintenance',name:'기계 장비 정비 표준',branch:'resources',tier:24,cost:36000,requires:['automaton_assembly','industrial_logistics_rationalization'],effects:{}},]:[]),
  // G4: new technologies locked to Industrial Modern II, never auto granted on old saves.
  {id:'industrial_quality_control',name:'공업 품질 관리',branch:'resources',tier:22,cost:28000,requires:['integrated_industrial_system','steel_quality_improvement'],effects:{steelworksYield:1}},
  {id:'industrial_freight_coordination',name:'산업 수송 관리체계',branch:'roads',tier:24,cost:42000,requires:['industrial_logistics_rationalization'],effects:{},unlocks:['산업 수송 계획·병목 진단']},
  {id:'industrial_logistics_rationalization',name:'산업 물류 합리화',branch:'roads',tier:22,cost:31000,requires:['industrial_freight_network','integrated_industrial_system'],effects:{tradeFreightDiscount:.05}},
  {id:'national_project_planning',name:'국가사업 계획체계',branch:'administration',tier:22,cost:35000,requires:['industrial_logistics_rationalization'],effects:{},unlocks:['국가 프로젝트 개방']},
  {id:'standardized_field_training',name:'표준화 야전 훈련',branch:'military',tier:22,cost:33000,requires:['national_conscription_system','modern_field_logistics'],effects:{trainingRateBonus:18}},
  // F2C2C — 5 industrial general, 3 military and 1 era-promotion technology.
  {id:'industrial_process_standardization',name:'산업 공정 표준화',branch:'resources',tier:17,cost:17800,requires:['mechanized_manufacturing','precision_workshop_methods'],effects:{factoryOutput:.10}},
  {id:'steel_quality_improvement',name:'제강 품질 개선',branch:'resources',tier:17,cost:18200,requires:['mechanized_manufacturing','steelmaking','scientific_instrumentation'],effects:{steelworksYield:1}},
  {id:'steam_engine_efficiency',name:'증기기관 효율화',branch:'resources',tier:18,cost:19800,requires:['industrial_process_standardization','steam_engineering'],effects:{industrialSteamCoalSaving:1}},
  {id:'industrial_freight_network',name:'산업 화물 운송망',branch:'roads',tier:18,cost:20500,requires:['mechanized_manufacturing','commercial_transport'],effects:{tradeFreightDiscount:.10}},
  {id:'industrial_research_organization',name:'산업 연구 조직',branch:'administration',tier:18,cost:21500,requires:['industrial_process_standardization','scientific_instrumentation'],effects:{academyKnowledge:.12,researchCapBonus:20}},
  {id:'rifled_musket_manufacture',name:'강선 소총 제조법',branch:'military',tier:19,cost:24800,requires:['industrial_process_standardization','flintlock_mechanism','alloy_processing'],effects:{},unlocks:['loadout:rifle_infantry','weapon:rifled_musket']},
  {id:'modern_field_logistics',name:'근대 야전 병참학',branch:'military',tier:19,cost:25800,requires:['industrial_freight_network','military_freight_standardization'],effects:{supplyPower:.08,supplyAttrition:.10}},
  {id:'national_conscription_system',name:'국민 징병 제도',branch:'military',tier:20,cost:27400,requires:['modern_field_logistics','industrial_research_organization'],effects:{mobilizationBonus:.02,armyLimitBonus:.20,trainingRateBonus:30}},
  {id:'integrated_industrial_system',name:'산업 기반 통합 체계',branch:'administration',tier:21,cost:31500,requires:['industrial_process_standardization','steel_quality_improvement','industrial_freight_network','industrial_research_organization'],effects:{},unlocks:['era:industrial_modern_2']},

  {id:'coal_extraction',name:'석탄 채굴법',branch:'resources',tier:7,cost:11800,requires:['deep_mining','large_machine_assembly'],effects:{}},
  {id:'steam_engineering',name:'실용 증기기관',branch:'resources',tier:7,cost:13400,requires:['power_transmission','large_machine_assembly','scientific_instrumentation'],effects:{}},
  {id:'mechanized_manufacturing',name:'기계식 공장제',branch:'resources',tier:16,cost:15600,requires:['steam_engineering','coal_extraction','large_machine_assembly'],effects:{}},
  {id:'basic_farming',name:'기초 농법',branch:'agriculture',tier:1,cost:160,requires:[],effects:{farmFood:.10}},
  {id:'crop_rotation',name:'윤작법',branch:'agriculture',tier:2,cost:420,requires:['basic_farming'],effects:{farmFood:.12,passiveFood:.05}},
  {id:'intensive_farming',name:'집약 농업',branch:'agriculture',tier:3,cost:1060,requires:['crop_rotation'],effects:{farmFood:.18}},
  {id:'timber_processing',name:'목재 가공',branch:'resources',tier:1,cost:165,requires:[],effects:{lumberWood:.18}},
  {id:'stonecraft',name:'채석 기술',branch:'resources',tier:2,cost:430,requires:['timber_processing'],effects:{quarryStone:.22}},
  {id:'specialized_mining',name:'전문 채굴',branch:'resources',tier:3,cost:1050,requires:['stonecraft'],effects:{mineIron:.25}},
  {id:'architecture',name:'건축술',branch:'administration',tier:1,cost:175,requires:[],effects:{materialDiscount:.18,buildSpeed:.10}},
  {id:'urban_planning',name:'도시 계획',branch:'administration',tier:2,cost:440,requires:['architecture'],effects:{housing:.12}},
  {id:'administrative_system',name:'행정 조직',branch:'administration',tier:3,cost:1100,requires:['urban_planning'],effects:{goldIncome:.08,apUnits:2}},
  {id:'regional_governance',name:'지방 통치 체계',branch:'administration',tier:3,cost:900,requires:['urban_planning','stonecraft'],effects:{},unlocks:['era:medieval']},
  // V0.3A1: independently unlock one additional general-facility tile slot each.
  {id:'dense_construction',name:'밀집 건축',branch:'administration',tier:3,cost:950,requires:['urban_planning'],effects:{buildingSlots:1}},
  {id:'vertical_construction',name:'다층 건축',branch:'administration',tier:4,cost:1600,requires:['dense_construction','administrative_system'],effects:{buildingSlots:1}},
  {id:'road_maintenance',name:'도로 정비',branch:'roads',tier:1,cost:160,requires:[],effects:{roadTravel:1}},
  {id:'paved_roads',name:'포장 도로',branch:'roads',tier:2,cost:420,requires:['road_maintenance'],effects:{upgradedTravel:1,roadGold:1,roadUpkeepDiscount:.05}},
  {id:'supply_organization',name:'보급 조직',branch:'roads',tier:3,cost:1020,requires:['paved_roads'],effects:{supplyPower:.08,supplyAttrition:.25}},
  {id:'military_drills',name:'군사 훈련',branch:'military',tier:1,cost:180,requires:[],effects:{combatPower:.08}},
  {id:'equipment_standardization',name:'장비 표준화',branch:'military',tier:2,cost:450,requires:['military_drills'],effects:{combatPower:.08}},
  {id:'tactical_advances',name:'전술 발전',branch:'military',tier:3,cost:1100,requires:['equipment_standardization'],effects:{combatPower:.12}},
  {"id":"soil_management","name":"토양 관리","branch":"agriculture","tier":4,"cost":1650,"requires":["intensive_farming"],"effects":{"farmFood":0.03,"forestFarmBonus":0.06},"unlocks":[]},
  {"id":"seed_selection","name":"종자 선별","branch":"agriculture","tier":4,"cost":1800,"requires":["intensive_farming"],"effects":{"farmFood":0.06},"unlocks":[]},
  {"id":"irrigation_networks","name":"관개망","branch":"agriculture","tier":4,"cost":2150,"requires":["soil_management","paved_roads"],"effects":{"farmFood":0.04,"grassFarmBonus":0.06},"unlocks":[]},
  {"id":"multiple_cropping","name":"다모작","branch":"agriculture","tier":5,"cost":2650,"requires":["seed_selection","irrigation_networks"],"effects":{"farmFood":0.07},"unlocks":[]},
  {"id":"agricultural_logistics","name":"농업 물류 체계","branch":"agriculture","tier":5,"cost":2800,"requires":["irrigation_networks","supply_organization"],"effects":{"farmFood":0.02,"connectedFarmBonus":0.05},"unlocks":[]},
  {"id":"precision_cultivation","name":"개량 농법","branch":"agriculture","tier":6,"cost":4100,"requires":["multiple_cropping","agricultural_logistics"],"effects":{"farmFood":0.08},"unlocks":[]},
  {"id":"precision_quarrying","name":"정밀 채석","branch":"resources","tier":4,"cost":1700,"requires":["stonecraft"],"effects":{"quarryStone":0.1},"unlocks":[]},
  {"id":"deep_mining","name":"심부 채굴","branch":"resources","tier":4,"cost":1850,"requires":["specialized_mining"],"effects":{"mineIron":0.1},"unlocks":[]},
  {"id":"ore_refining","name":"광석 선별법","branch":"resources","tier":4,"cost":2050,"requires":["deep_mining","precision_quarrying"],"effects":{"mineIron":0.06},"unlocks":[]},
  {"id":"steelmaking","name":"제강술","branch":"resources","tier":5,"cost":2600,"requires":["ore_refining","architecture"],"effects":{},"unlocks":["material:steel_grade","armor:medium"]},
  {"id":"alloy_processing","name":"합금 가공","branch":"resources","tier":6,"cost":3400,"requires":["steelmaking","precision_quarrying"],"effects":{},"unlocks":["armor:plate"]},
  {"id":"materials_recycling","name":"자재 재활용","branch":"resources","tier":5,"cost":2750,"requires":["precision_quarrying","urban_redevelopment"],"effects":{"recycledBuildMaterials":0.05},"unlocks":[]},
  {"id":"urban_redevelopment","name":"시설 재개발","branch":"administration","tier":4,"cost":1800,"requires":["vertical_construction","administrative_system"],"effects":{"apCapUnits":3},"unlocks":["action:REDEVELOP_FACILITY"]},
  {"id":"structural_reinforcement","name":"구조 보강","branch":"administration","tier":4,"cost":1750,"requires":["architecture","stonecraft"],"effects":{"housing":0.04},"unlocks":[]},
  {"id":"adaptive_zoning","name":"용도 전환","branch":"administration","tier":5,"cost":2500,"requires":["urban_redevelopment","urban_planning"],"effects":{"redevelopmentCostDiscount":0.1},"unlocks":[]},
  {"id":"construction_management","name":"건설 공정 관리","branch":"administration","tier":5,"cost":2700,"requires":["structural_reinforcement","administrative_system"],"effects":{"buildSpeed":0.08,"redevelopmentSpeed":0.1,"apCapUnits":5},"unlocks":[]},
  {"id":"demolition_salvage","name":"해체 자재 회수","branch":"administration","tier":5,"cost":2600,"requires":["urban_redevelopment","precision_quarrying"],"effects":{"redevelopmentRecovery":0.12},"unlocks":[]},
  {"id":"high_density_housing","name":"고밀도 주거","branch":"administration","tier":6,"cost":3600,"requires":["construction_management","adaptive_zoning","vertical_construction"],"effects":{"housing":0.12},"unlocks":[]},
  {"id":"topographic_survey","name":"지형 측량","branch":"roads","tier":3,"cost":850,"requires":["road_maintenance","stonecraft"],"effects":{"roadBuildCostDiscount":0.05},"unlocks":[]},
  {"id":"mountain_engineering","name":"산악 토목","branch":"roads","tier":4,"cost":1800,"requires":["topographic_survey","architecture"],"effects":{},"unlocks":["road:mountain_level_1"]},
  {"id":"trunk_route_planning","name":"간선망 계획","branch":"roads","tier":4,"cost":1950,"requires":["paved_roads","administrative_system"],"effects":{"roadUpkeepDiscount":0.08,"apCapUnits":3},"unlocks":[]},
  {"id":"rock_cutting","name":"암반 절개","branch":"roads","tier":5,"cost":2850,"requires":["mountain_engineering","specialized_mining","paved_roads"],"effects":{},"unlocks":["road:mountain_level_2"]},
  {"id":"supply_depots","name":"보급거점 운영","branch":"roads","tier":5,"cost":2600,"requires":["supply_organization","trunk_route_planning"],"effects":{"supplyAttrition":0.06,"supplyPower":0.03},"unlocks":[]},
  {"id":"advanced_transport","name":"고도 수송망","branch":"roads","tier":6,"cost":3850,"requires":["supply_depots","rock_cutting"],"effects":{"roadUpkeepDiscount":0.07,"supplyPower":0.04,"apCapUnits":4},"unlocks":[]},
  {"id":"advanced_blades","name":"강철 검 제작","branch":"military","tier":4,"cost":1900,"requires":["equipment_standardization","steelmaking"],"effects":{},"unlocks":["loadout:swordsman","weapon:sword"]},
  {"id":"pike_drills","name":"장창 전술","branch":"military","tier":4,"cost":1950,"requires":["tactical_advances","steelmaking"],"effects":{},"unlocks":["loadout:pikeman","weapon:pike"]},
  {"id":"longbow_craft","name":"장궁 제작","branch":"military","tier":4,"cost":1900,"requires":["equipment_standardization","timber_processing"],"effects":{},"unlocks":["loadout:longbowman","weapon:longbow"]},
  {"id":"crossbow_engineering","name":"쇠뇌 제작","branch":"military","tier":5,"cost":2800,"requires":["longbow_craft","ore_refining"],"effects":{},"unlocks":["loadout:crossbowman","weapon:crossbow"]},
  {"id":"heavy_armor_forging","name":"중갑 제작","branch":"military","tier":5,"cost":2900,"requires":["steelmaking","pike_drills"],"effects":{},"unlocks":["armor:heavy"]},
  {"id":"elite_infantry","name":"정예 보병 교리","branch":"military","tier":6,"cost":3800,"requires":["heavy_armor_forging","advanced_blades","tactical_advances"],"effects":{},"unlocks":["loadout:heavy_infantry","weapon:steel_blade"]},
  {id:'improved_farm_tools',name:'농기구 개량',branch:'agriculture',tier:7,cost:4300,requires:['precision_cultivation','steelmaking'],effects:{advancedFarmBonus:.06}},
  {id:'guild_organization',name:'길드 조직',branch:'administration',tier:7,cost:4500,requires:['adaptive_zoning','urban_redevelopment'],effects:{buildingSlots:1},unlocks:['building:workshop']},
  {id:'basic_mechanical_power',name:'기초 기계동력',branch:'resources',tier:7,cost:4900,requires:['construction_management','alloy_processing'],effects:{},unlocks:['workshop:mechanical_power']},
  {id:'craft_standardization',name:'수공업 표준화',branch:'resources',tier:8,cost:5100,requires:['guild_organization','basic_mechanical_power'],effects:{workshopGold:.15}},
  {id:'commercial_transport',name:'상업 교통망',branch:'roads',tier:7,cost:4700,requires:['advanced_transport','guild_organization'],effects:{tradeCapacity:.15}},
  {id:'gunpowder_manufacturing',name:'화약 제조',branch:'military',tier:7,cost:5200,requires:['steelmaking','alloy_processing'],effects:{paidSiegeBonus:.05}},
  {id:'movable_type_printing',name:'활판 인쇄',branch:'administration',tier:8,cost:6200,requires:['craft_standardization','guild_organization'],effects:{academyKnowledge:.10},unlocks:['era:early_modern']},
  {id:'publishing_organization',name:'출판 조직',branch:'administration',tier:9,cost:6400,requires:['movable_type_printing','guild_organization'],effects:{},unlocks:['academy:printing_room']},
  {id:'commercial_accounting',name:'상업 회계',branch:'roads',tier:9,cost:6600,requires:['commercial_transport','movable_type_printing'],effects:{tradeFreightDiscount:.10}},
  {id:'professional_workshops',name:'전문 공방',branch:'resources',tier:9,cost:7000,requires:['craft_standardization','guild_organization'],effects:{},unlocks:['workshop:level_2']},
  {id:'matchlock_crafting',name:'화승총 제작',branch:'military',tier:9,cost:7400,requires:['gunpowder_manufacturing','crossbow_engineering'],effects:{},unlocks:['loadout:matchlock']},
  {id:'empirical_research',name:'실증 연구법',branch:'administration',tier:10,cost:7200,requires:['publishing_organization','construction_management'],effects:{researchCapBonus:12}},
  // V0.7C3: old dense/vertical/guild bonuses already total three slots; fourth is a distinct late-medieval technology.
  {id:'mixed_use_construction',name:'도시 복합 건축',branch:'administration',tier:8,cost:5600,requires:['vertical_construction','guild_organization'],effects:{buildingSlots:1}},
  // V0.7D: Early Modern II industrial workshops (not Industrial Modern).
  {id:'workshop_concentration',name:'공방 집적화',branch:'administration',tier:10,cost:7800,requires:['professional_workshops','commercial_accounting'],effects:{workshopCap:1},unlocks:['era:early_modern_2']},
  {id:'precision_metalworking',name:'정밀 금속 가공',branch:'resources',tier:11,cost:8400,requires:['workshop_concentration','alloy_processing'],effects:{},unlocks:['workshop:level_3']},
  {id:'power_transmission',name:'동력 전달 장치',branch:'resources',tier:11,cost:8700,requires:['workshop_concentration','basic_mechanical_power'],effects:{},unlocks:['workshop:power_transmission']},
  {id:'commercial_credit',name:'상업 어음제',branch:'roads',tier:11,cost:8100,requires:['workshop_concentration','commercial_accounting'],effects:{tradeCapacity:.10}},
  {id:'scholarly_print_network',name:'학술 인쇄망',branch:'administration',tier:11,cost:8600,requires:['workshop_concentration','publishing_organization'],effects:{printingKnowledge:.10}},
  // E1: a core technology researched in Modern II; the remaining four unlock IN Modern III.
  {id:'mechanical_components',name:'기계 부품 규격화',branch:'resources',tier:12,cost:9400,requires:['precision_metalworking','power_transmission'],effects:{},unlocks:['era:early_modern_3']},
  {id:'precision_workshop_methods',name:'정밀 공방 공정',branch:'resources',tier:13,cost:10100,requires:['mechanical_components'],effects:{},unlocks:['workshop:precision']},
  {id:'interregional_trade_network',name:'광역 상업 조직',branch:'roads',tier:13,cost:9600,requires:['commercial_credit','mechanical_components'],effects:{tradeCapacity:.10}},
  {id:'scientific_instrumentation',name:'계측 기구 제작',branch:'administration',tier:13,cost:10200,requires:['scholarly_print_network','mechanical_components'],effects:{academyKnowledge:.08}},
  {id:'flintlock_mechanism',name:'부싯돌 격발 장치',branch:'military',tier:13,cost:10500,requires:['matchlock_crafting','mechanical_components'],effects:{},unlocks:['loadout:flintlock']},
  // E2: III->IV core, followed by the first dedicated field artillery technology.
  {id:'large_machine_assembly',name:'대형 기계 조립',branch:'resources',tier:14,cost:11400,requires:['precision_workshop_methods','scientific_instrumentation'],effects:{},unlocks:['era:early_modern_4']},
  {id:'field_artillery_casting',name:'야포 주조 기술',branch:'military',tier:15,cost:12300,requires:['large_machine_assembly','flintlock_mechanism'],effects:{},unlocks:['loadout:field_artillery']},
  {id:'artillery_drill_manual',name:'포병 운용 교범',branch:'military',tier:15,cost:11800,requires:['field_artillery_casting'],effects:{},unlocks:['artillery:training']},
  {id:'military_freight_standardization',name:'군수 운송 표준화',branch:'roads',tier:15,cost:11600,requires:['large_machine_assembly','interregional_trade_network'],effects:{},unlocks:['artillery:supply']},
]);
const G_TECH_IDS=new Set(["soil_management", "seed_selection", "irrigation_networks", "multiple_cropping", "agricultural_logistics", "precision_cultivation", "precision_quarrying", "deep_mining", "ore_refining", "steelmaking", "alloy_processing", "materials_recycling", "urban_redevelopment", "structural_reinforcement", "adaptive_zoning", "construction_management", "demolition_salvage", "high_density_housing", "topographic_survey", "mountain_engineering", "trunk_route_planning", "rock_cutting", "supply_depots", "advanced_transport", "advanced_blades", "pike_drills", "longbow_craft", "crossbow_engineering", "heavy_armor_forging", "elite_infantry", "improved_farm_tools", "guild_organization", "basic_mechanical_power", "craft_standardization", "commercial_transport", "gunpowder_manufacturing", "movable_type_printing", "mixed_use_construction"]);
const V07F1_TECH_IDS=new Set(['coal_extraction','steam_engineering','mechanized_manufacturing']);
const I_INDUSTRIAL_III_TECH_IDS=new Set(['industrial_freight_coordination']);
const K_INDUSTRIAL_III_TECH_IDS=new Set(['continuous_industrial_process','integrated_factory_management']);
const K_INDUSTRIAL_IV_TECH_IDS=new Set(['precision_machine_standardization','machine_gun_corps','tracked_vehicle_engineering','armored_combat_doctrine']);
const G4_INDUSTRIAL_II_TECH_IDS=new Set(['industrial_quality_control','industrial_logistics_rationalization','standardized_field_training','national_project_planning']);
const F2C2C_INDUSTRIAL_TECH_IDS=new Set(['industrial_process_standardization','steel_quality_improvement','steam_engine_efficiency','industrial_freight_network','industrial_research_organization','rifled_musket_manufacture','modern_field_logistics','national_conscription_system','integrated_industrial_system']);
const TECHNOLOGY_BY_ID=Object.freeze(Object.fromEntries(TECHNOLOGIES.map(t=>[t.id,t])));
const V07D_MODERN2_TECH_IDS=new Set(['precision_metalworking','power_transmission','commercial_credit','scholarly_print_network','mechanical_components']);
const V07D_MODERN1_TECH_IDS=new Set(['publishing_organization','commercial_accounting','professional_workshops','matchlock_crafting','empirical_research','workshop_concentration']);
const V07E1_MODERN3_TECH_IDS=new Set(['precision_workshop_methods','interregional_trade_network','scientific_instrumentation','flintlock_mechanism','large_machine_assembly']);
const V07E2_MODERN4_TECH_IDS=new Set(['field_artillery_casting','artillery_drill_manual','military_freight_standardization']);
const V07C_MODERN_TECH_IDS=new Set([...V07D_MODERN1_TECH_IDS,...V07D_MODERN2_TECH_IDS,...V07E1_MODERN3_TECH_IDS,...V07E2_MODERN4_TECH_IDS]);
const ERA_TECHNOLOGIES=Object.freeze(Object.fromEntries(TECHNOLOGIES.map(t=>[t.id,(t.id==='mechanized_manufacturing'||F2C2C_INDUSTRIAL_TECH_IDS.has(t.id)||G4_INDUSTRIAL_II_TECH_IDS.has(t.id)||H_TECH_IDS.has(t.id)||I_INDUSTRIAL_III_TECH_IDS.has(t.id)||K_INDUSTRIAL_III_TECH_IDS.has(t.id)||K_INDUSTRIAL_IV_TECH_IDS.has(t.id))?'industrial_modern':V07F1_TECH_IDS.has(t.id)?'early_modern':V07C_MODERN_TECH_IDS.has(t.id)?'early_modern':G_TECH_IDS.has(t.id)?'medieval':'ancient'])));

// V0.7A: independent medieval progression; historic tier remains research difficulty.
const MEDIEVAL_STAGE_TECH_IDS=Object.freeze({
  1:Object.freeze(["soil_management", "seed_selection", "irrigation_networks", "precision_quarrying", "deep_mining", "ore_refining", "urban_redevelopment", "structural_reinforcement", "topographic_survey", "mountain_engineering", "trunk_route_planning", "longbow_craft"]),
  2:Object.freeze(["multiple_cropping", "agricultural_logistics", "steelmaking", "materials_recycling", "adaptive_zoning", "construction_management", "demolition_salvage", "rock_cutting", "supply_depots", "advanced_blades", "pike_drills", "crossbow_engineering", "heavy_armor_forging"]),
  3:Object.freeze(["precision_cultivation", "alloy_processing", "high_density_housing", "advanced_transport", "elite_infantry"]),
  4:Object.freeze(["improved_farm_tools","guild_organization","basic_mechanical_power","craft_standardization","commercial_transport","gunpowder_manufacturing","movable_type_printing","mixed_use_construction"])
});
const TECHNOLOGY_STAGE=Object.freeze(Object.fromEntries(Object.entries(MEDIEVAL_STAGE_TECH_IDS).flatMap(([stage,ids])=>ids.map(id=>[id,Number(stage)]))));
// F2A3A: Single presentation-stage mapping. Later technologies must not fall back to ancient.
const F2A3A_RESEARCH_STAGE_LABELS=Object.freeze(['고대','중세 I','중세 II','중세 III','중세 IV','근세 I','근세 II','근세 III','근세 IV','산업 근대 I','산업 근대 II','산업 근대 III','산업 근대 IV']);
function f2a3aResearchStage(techId){
  if(K_INDUSTRIAL_IV_TECH_IDS.has(techId))return 12;
  if(K_INDUSTRIAL_III_TECH_IDS.has(techId))return 11;
  if(I_INDUSTRIAL_III_TECH_IDS.has(techId))return 11;
  if(H_TECH_IDS.has(techId))return techId==='automaton_assembly'?10:11;
  if(G4_INDUSTRIAL_II_TECH_IDS.has(techId))return 10;
  if(techId==='mechanized_manufacturing'||F2C2C_INDUSTRIAL_TECH_IDS.has(techId))return 9;
  if(V07E2_MODERN4_TECH_IDS.has(techId)||V07F1_TECH_IDS.has(techId))return 8;
  if(V07E1_MODERN3_TECH_IDS.has(techId))return 7;
  if(V07D_MODERN2_TECH_IDS.has(techId))return 6;
  if(V07D_MODERN1_TECH_IDS.has(techId))return 5;
  return TECHNOLOGY_STAGE[techId]||0;
}
function f2a3aResearchStageLocked(n,stage){
  if(stage===0)return false;
  const eraOrder=CIVILIZATION_ERAS[n.civilization.era]?.order??0;
  const neededOrder=stage<=4?1:stage<=8?2:3,neededStage=stage<=4?stage:stage<=8?stage-4:stage===9?1:stage===10?2:stage===11?3:4;
  return eraOrder<neededOrder||(eraOrder===neededOrder&&(n.civilization.stage||1)<neededStage);
}

const MEDIEVAL_STAGE_CORE=Object.freeze({1:'ore_refining',2:'construction_management',3:'advanced_transport'}); // IV -> early modern remains locked
const MEDIEVAL_STAGE_LABELS=Object.freeze({0:'고대',1:'중세 I',2:'중세 II',3:'중세 III',4:'중세 IV'});
function civilizationLabel(n){if(n?.civilization?.era==='industrial_modern')return '산업 근대 '+(n.civilization.stage>=4?'IV':n.civilization.stage>=3?'III':n.civilization.stage>=2?'II':'I');return n?.civilization?.era==='medieval'?(MEDIEVAL_STAGE_LABELS[n.civilization.stage]||'중세'):n?.civilization?.era==='early_modern'?'근세 '+({1:'I',2:'II',3:'III',4:'IV'}[n.civilization.stage]||'I'):CIVILIZATION_ERAS[n?.civilization?.era]?.label||'고대';}
function medievalNextCore(n){const stage=n?.civilization?.era==='medieval'?n.civilization.stage:0;return MEDIEVAL_STAGE_CORE[stage]||null;}

const V04D_EXCHANGE_COST=60, V04D_EXCHANGE_BONUS=0.25;
function techEraAllowed(n,techId){
 const era=ERA_TECHNOLOGIES[techId],order=CIVILIZATION_ERAS[n.civilization?.era]?.order??0;
 if(K_INDUSTRIAL_IV_TECH_IDS.has(techId))return order>=3&&(n.civilization.stage||1)>=4;
 if(K_INDUSTRIAL_III_TECH_IDS.has(techId))return order>=3&&(n.civilization.stage||1)>=3;
 if(I_INDUSTRIAL_III_TECH_IDS.has(techId))return order>=3&&(n.civilization.stage||1)>=3;
 if(H_TECH_IDS.has(techId))return H_ENABLED&&order>=3&&(n.civilization.stage||1)>=(techId==='automaton_assembly'?2:3);
 if(G4_INDUSTRIAL_II_TECH_IDS.has(techId))return G4_RESEARCH_ENABLED&&order>=3&&(n.civilization.stage||1)>=2;
 if(era==='industrial_modern')return order>=3;
 if(V07F1_TECH_IDS.has(techId))return order>2||(order===2&&(n.civilization.stage||1)>=4);
 if(era==='early_modern'){
   if(order>2)return true;if(order!==2)return false;
   const stage=n.civilization.stage||1;
   return V07E2_MODERN4_TECH_IDS.has(techId)?stage>=4:V07E1_MODERN3_TECH_IDS.has(techId)?stage>=3:V07D_MODERN2_TECH_IDS.has(techId)?stage>=2:true;
 }
 if(era==='medieval')return order>1||(order===1&&(n.civilization.stage||1)>=(TECHNOLOGY_STAGE[techId]||1));
 return true;
}
function initialKnowledgeExchange(){return {enabled:true,lastQuarter:{dayIndex:0,partnerId:null,extraKnowledge:0,goldSpent:0,goldReceived:0,operatingCost:0}};}
function validateKnowledgeExchange(e,w,n){
  if(!e||typeof e.enabled!=='boolean'||!e.lastQuarter)return false;
  const q=e.lastQuarter;return Number.isSafeInteger(q.dayIndex)&&q.dayIndex>=0&&q.dayIndex<=w.dayIndex&&q.dayIndex%30===0&&
    (q.partnerId===null||Number.isInteger(q.partnerId)&&q.partnerId!==n.id&&!!w.nations[q.partnerId])&&
    ['extraKnowledge','goldSpent','goldReceived','operatingCost'].every(k=>Number.isSafeInteger(q[k])&&q[k]>=0)&&
    q.goldSpent===q.goldReceived+q.operatingCost&&q.goldSpent===q.extraKnowledge*V04D_EXCHANGE_COST&&
    (q.extraKnowledge>0)===(q.partnerId!==null);
}
const TECH_BRANCHES=Object.freeze({agriculture:'농업',resources:'자원',administration:'건설·행정',roads:'도로·보급',military:'군사'});
function initialTechnology(){return {unlocked:[],currentResearch:null,progress:0,pausedResearch:null};}
function hasTech(w,nationId,id){return !!w.nations[nationId]?.technology?.unlocked?.includes(id);}
function techBonus(w,nationId,key){
  const unlocked=w.nations[nationId]?.technology?.unlocked||[];
  let total=0;for(const id of unlocked)total+=TECHNOLOGY_BY_ID[id]?.effects?.[key]||0;
  return total;
}
function researchLegal(w,nationId,id){
  const n=w.nations[nationId],tech=TECHNOLOGY_BY_ID[id];
  return Boolean(n?.active&&tech&&n.technology&&!n.technology.currentResearch&&!n.technology.unlocked.includes(id)&&
    techEraAllowed(n,id)&&tech.requires.every(required=>n.technology.unlocked.includes(required)));
}
function g4ResearchCount(){return TECHNOLOGIES.length-(G4_RESEARCH_ENABLED?0:G4_INDUSTRIAL_II_TECH_IDS.size); }
function validateTechnologyState(state){
  if(!state||!Array.isArray(state.unlocked)||state.unlocked.length>TECHNOLOGIES.length||
    new Set(state.unlocked).size!==state.unlocked.length||state.unlocked.some(id=>!TECHNOLOGY_BY_ID[id])||
    !Number.isSafeInteger(state.progress)||state.progress<0)return false;
  const known=new Set(state.unlocked);
  if(state.unlocked.some(id=>!TECHNOLOGY_BY_ID[id].requires.every(x=>known.has(x))))return false;
  const paused=state.pausedResearch;
  if(paused!==null&&paused!==undefined){
    const p=TECHNOLOGY_BY_ID[paused.id];
    if(!p||known.has(paused.id)||!(G_TECH_IDS.has(paused.id)||V07C_MODERN_TECH_IDS.has(paused.id)||V07F1_TECH_IDS.has(paused.id)||F2C2C_INDUSTRIAL_TECH_IDS.has(paused.id)||G4_INDUSTRIAL_II_TECH_IDS.has(paused.id)||K_INDUSTRIAL_III_TECH_IDS.has(paused.id)||K_INDUSTRIAL_IV_TECH_IDS.has(paused.id))||
       !p.requires.every(x=>known.has(x))||!Number.isSafeInteger(paused.progress)||paused.progress<0||paused.progress>=p.cost)return false;
  }
  if(state.currentResearch===null)return state.progress===0;
  const tech=TECHNOLOGY_BY_ID[state.currentResearch];
  return Boolean(tech&&!known.has(tech.id)&&(!paused||paused.id!==tech.id)&&
    tech.requires.every(x=>known.has(x))&&state.progress<tech.cost);
}
// F2A2: In early/industrial modernity, capacity reflects actual research staff and
// active academy levels, irrespective of the branch/tier of the chosen project.
// This is only a cap on paid Knowledge; it never creates Knowledge or skips research.
function researchCapacity(w,nationId){
  const n=w.nations[nationId];if(!n)return 0;
  const academies=w.buildings.filter(b=>b.status==='ACTIVE'&&b.typeId==='academy'&&w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===nationId)&&w.tiles[b.tileId]?.occupiedBy===null)
    .reduce((sum,b)=>sum+b.level,0);
  const bonus=techBonus(w,nationId,'researchCapBonus');
  if(n.civilization?.era==='early_modern'||n.civilization?.era==='industrial_modern'){
    return Math.min(600+bonus,120+Math.floor(n.researchLevel*.7)+
      12*Math.min(academies,20)+5*Math.max(0,academies-20)+bonus);
  }
  // Ancient and medieval research remain identical to F2A1.
  const legacy=Math.min(70,10+Math.floor(n.researchLevel/8)+academies*4);
  const current=TECHNOLOGY_BY_ID[n.technology?.currentResearch];
  const modernResearch=!!current&&(V07C_MODERN_TECH_IDS.has(current.id)||V07F1_TECH_IDS.has(current.id));
  const raw=current&&(G_TECH_IDS.has(current.id)||modernResearch)?Math.min(92,Math.max(legacy,30+Math.floor(n.researchLevel/8)+2*academies)):legacy;
  const softcap=modernResearch&&n.civilization?.era==='early_modern'?4*Math.min(academies,25)+Math.max(0,academies-25):0;
  return (CIVILIZATION_ERAS[n.civilization?.era]?.order>=1?Math.floor((raw+softcap)*1.10):raw+softcap)+bonus;
}
function v04dWarBetween(w,a,b){return w.wars.some(war=>{const aa=warSide(war,a),bb=warSide(war,b);return aa!==null&&bb!==null&&aa!==bb;});}
function exchangePartner(w,n,borders){
  if(!n.active||!n.knowledgeExchange?.enabled)return null;
  const order=CIVILIZATION_ERAS[n.civilization.era]?.order??0;
  const eligible=w.nations.filter(other=>other.active&&other.id!==n.id&&
    (CIVILIZATION_ERAS[other.civilization.era]?.order??0)>order&&borders.has(pairKey(n.id,other.id))&&
    !v04dWarBetween(w,n.id,other.id));
  eligible.sort((a,b)=>(relationOf(w,n.id,b.id)-relationOf(w,n.id,a.id))||a.id-b.id);
  return eligible[0]||null;
}
/** Real Knowledge only; border-based exchange pays 70% to the partner and burns 30%. */
function processResearchQuarter(w){
  const borders=quarterBorderPairs(w);
  for(const n of w.nations){
    if(!n.active)continue;
    n.knowledgeExchange.lastQuarter={dayIndex:w.dayIndex,partnerId:null,extraKnowledge:0,goldSpent:0,goldReceived:0,operatingCost:0};
    if((CIVILIZATION_ERAS[n.civilization.era]?.order||0)>=1&&n.technology?.pausedResearch&&!n.technology.currentResearch){
      n.technology.currentResearch=n.technology.pausedResearch.id;
      n.technology.progress=n.technology.pausedResearch.progress;
      n.technology.pausedResearch=null;
    }
    if(!n.technology?.currentResearch)continue;
    const tech=TECHNOLOGY_BY_ID[n.technology.currentResearch];
    if(!tech||!techEraAllowed(n,tech.id))continue;
    const cap=researchCapacity(w,n.id),remaining=tech.cost-n.technology.progress;
    const baseline=Math.min(n.knowledge,cap,remaining);
    let extra=0,partner=null;
    if(n.knowledge>baseline&&remaining>baseline){
      partner=exchangePartner(w,n,borders);
      if(partner){
        const reserve=n.controller==='AI'?Math.max(200,Math.ceil((n.lastQuarter?.upkeep||0)+(n.lastQuarter?.civil?.total||0))):0;
        const maxAffordable=Math.floor(Math.max(0,n.gold-reserve)/V04D_EXCHANGE_COST);
        extra=Math.min(n.knowledge-baseline,remaining-baseline,Math.floor(cap*V04D_EXCHANGE_BONUS),maxAffordable);
      }
    }
    if(extra>0){
      const cost=extra*V04D_EXCHANGE_COST,received=Math.floor(cost*.70),spent=cost-received;
      n.gold-=cost;partner.gold+=received;
      if(n.lastQuarter)n.lastQuarter.goldNet-=cost;
      if(partner.lastQuarter)partner.lastQuarter.goldNet+=received;
      n.knowledgeExchange.lastQuarter={dayIndex:w.dayIndex,partnerId:partner.id,extraKnowledge:extra,goldSpent:cost,goldReceived:received,operatingCost:spent};
      w.changeSeq++;
    }
    const spending=baseline+extra;
    if(spending<=0)continue;
    n.knowledge-=spending;n.technology.progress+=spending;w.changeSeq++;
    if(n.technology.progress>=tech.cost){
      n.technology.unlocked.push(tech.id);n.technology.currentResearch=null;n.technology.progress=0;
      if((CIVILIZATION_ERAS[n.civilization.era]?.order||0)>=1&&n.technology.pausedResearch){
        n.technology.currentResearch=n.technology.pausedResearch.id;
        n.technology.progress=n.technology.pausedResearch.progress;
        n.technology.pausedResearch=null;
      }
      w.events.push({dayIndex:w.dayIndex,text:`${n.name}: ${tech.name} 연구 완료`,kind:'technology'});
      recordHistoricalEvent(w,'technology',w.events[w.events.length-1].text,[n.id]);
      if(w.events.length>180)w.events.splice(0,w.events.length-180);
      refreshApCaps(w);
    }
  }
}
/** Data-driven tendencies plus scarcity/war circumstances; never keyed by nation name. */
/* V0.6D1D Adaptive AI V1: bounded, deterministic, independent national adaptation.
 * NO new RNG. Historical war results are recorded once at actual peace.
 * Profile overlays never mutate shared AIProfile library or cached save state.
 */
const D1D_KEYS=['development','expansion','riskTolerance','aggression','defensivePreference','warEndurance'];
const D1D_LIMITS=Object.freeze({development:[-4,10],expansion:[-8,3],riskTolerance:[-12,4],aggression:[-12,4],defensivePreference:[-3,12],warEndurance:[-10,3]});
const D1D_WINDOW=24, D1D_WAR_WINDOW_DAYS=20*DAYS_PER_YEAR;
const D1D_LABELS=Object.freeze({development:'국내 개발',expansion:'영토 확장',riskTolerance:'위험 감수',aggression:'군사 공격성',defensivePreference:'방어 선호',warEndurance:'전쟁 지속'});
const d1dProfileCache=new WeakMap();
function d1dNewNation(){return {schema:1,lastUpdatedDay:0,revision:0,foodStressQuarters:0,deltas:Object.fromEntries(D1D_KEYS.map(k=>[k,0])),targets:Object.fromEntries(D1D_KEYS.map(k=>[k,0])),warResults:[],recentChanges:[],lastReasons:[]};}
function d1dInitializeWorld(w){w.d1dAdaptiveEnabled=true;w.d1dSchema=1;for(const n of w.nations)n.aiAdaptation=d1dNewNation();}
function d1dBaseValue(p,k){return k==='development'||k==='expansion'?p.weights[k]:k==='riskTolerance'?p.behavior[k]:p.military[k];}
function d1dEffectiveProfile(w,nationId){
 const n=w.nations[nationId],base=n&&w.aiProfiles[n.aiProfileId];
 if(!base||!w.d1dAdaptiveEnabled||!n.aiAdaptation)return base;
 const a=n.aiAdaptation,entry=d1dProfileCache.get(n);
 if(entry&&entry.base===base&&entry.revision===a.revision)return entry.profile;
 const weights={...base.weights},behavior={...base.behavior},military={...base.military};
 for(const k of D1D_KEYS){const d=(a.deltas[k]||0)/100;const target=k==='development'||k==='expansion'?weights:k==='riskTolerance'?behavior:military;target[k]=Math.max(0,Math.min(100,d1dBaseValue(base,k)+d));}
 const profile={...base,weights,behavior,military};d1dProfileCache.set(n,{base,revision:a.revision,profile});return profile;
}
function d1dRecordPeace(w,war,winnerSide,tier){
 if(!w.d1dAdaptiveEnabled)return;
 const sides={attackers:war.sides?.attackers||[war.attackerId],defenders:war.sides?.defenders||[war.defenderId]};
 for(const side of ['attackers','defenders'])for(const id of sides[side]){
   const n=w.nations[id];if(!n?.aiAdaptation)continue;
   const a=n.aiAdaptation;if(a.warResults.some(r=>r.warId===war.id))continue;
   const outcome=winnerSide===null||tier==='WHITE'?'draw':side===winnerSide?'win':'loss';
   const severity=tier==='DECISIVE'?3:tier==='CLEAR'?2:tier==='LIMITED'?1:0;
   a.warResults.push({warId:war.id,dayIndex:w.dayIndex,outcome,severity,side});
   a.warResults=a.warResults.filter(r=>w.dayIndex-r.dayIndex<=D1D_WAR_WINDOW_DAYS).slice(-D1D_WINDOW);
 }
}
function d1dQuarter(w){
 if(!w.d1dAdaptiveEnabled)return;
 for(const n of w.nations){if(!n.active||n.controller!=='AI')continue;
   const a=n.aiAdaptation;if(!a)continue;
   a.foodStressQuarters=n.foodPressure<.95?Math.min(40,a.foodStressQuarters+1):Math.max(0,a.foodStressQuarters-2);
 }
 if(w.dayIndex%DAYS_PER_YEAR!==0)return;
 for(const n of w.nations){if(!n.active||n.controller!=='AI')continue;
  const a=n.aiAdaptation;if(!a)continue;
  a.warResults=a.warResults.filter(r=>w.dayIndex-r.dayIndex<=D1D_WAR_WINDOW_DAYS).slice(-D1D_WINDOW);
  let defeats=0,victories=0;
  for(const r of a.warResults){const age=w.dayIndex-r.dayIndex,weight=Math.exp(-age/(6*DAYS_PER_YEAR))*(r.severity===3?1.4:r.severity===2?1:r.severity===1?.65:.20);
   if(r.outcome==='loss')defeats+=weight;else if(r.outcome==='win')victories+=weight;
  }
  const food=Math.min(1,a.foodStressQuarters/8),defeat=Math.min(1,defeats/2),win=Math.min(1,victories/3);
  const militaryHistory=n.military?.politicalHistory||[],civilHistory=w.socialHistory?.byNation?.[n.id]||[];
  // Only consume validated/recorded quarterly military & civil history; no invented local states.
  const military=militaryHistory.length?militaryHistory[militaryHistory.length-1]:null;
  const exhaustion=Math.min(1,Math.max(0,(military?.values?.war||0)/650));
  const civil=civilHistory.length?civilHistory[civilHistory.length-1]:null;
  const civilSafety=Math.min(1,Math.max(0,((civil?.values?.safety||0)-400)/600));
  const targets={development:10*food,expansion:-6*food-5*defeat+2*win,riskTolerance:-10*defeat-3*food-2*civilSafety+3*win,aggression:-11*defeat+3*win,defensivePreference:12*defeat+2*civilSafety,warEndurance:-8*exhaustion-4*defeat+2*win};
  const oldDeltas={...a.deltas};
  for(const k of D1D_KEYS){const [lo,hi]=D1D_LIMITS[k],target=Math.max(lo,Math.min(hi,targets[k]));
   a.targets[k]=Math.round(target*100);
   const current=(a.deltas[k]||0)/100;
   let next=current+0.15*(target-current);if(Math.abs(next)<.005)next=0;
   a.deltas[k]=Math.max(lo*100,Math.min(hi*100,Math.round(next*100)));
  }
  const reasons=[];
  if(a.foodStressQuarters>=2)reasons.push(`식량 부족 ${a.foodStressQuarters}분기 · 개발 중심 적응`);
  if(defeats>.05)reasons.push(`최근 전쟁 패배 영향 ${defeats.toFixed(2)} · 방어 및 위험 억제`);
  if(victories>.05)reasons.push(`최근 승리 경험 ${victories.toFixed(2)} · 일부 자신감 회복`);
  if(exhaustion>.05)reasons.push(`군사 전쟁 피로 ${(exhaustion*100).toFixed(0)}% 강도 · 장기전 회피`);
  if(civilSafety>.05)reasons.push(`민간 안전 불만 압박 · 위험 감수 소폭 억제`);
  if(!reasons.length)reasons.push('큰 압박 없음 · 원래 성향으로 점진 복귀');
  a.lastReasons=reasons.slice(0,4);a.lastUpdatedDay=w.dayIndex;
  if(D1D_KEYS.some(k=>a.deltas[k]!==oldDeltas[k])){
   a.revision++;
   a.recentChanges.push({dayIndex:w.dayIndex,deltas:{...a.deltas},reasons:[...a.lastReasons],foodStressQuarters:a.foodStressQuarters,defeats:Math.round(defeats*100)/100,victories:Math.round(victories*100)/100});
   if(a.recentChanges.length>D1D_WINDOW)a.recentChanges.splice(0,a.recentChanges.length-D1D_WINDOW);
  }
 }
}
function d1dValidate(w,fail){
 if(w.d1dSchema!==1||typeof w.d1dAdaptiveEnabled!=='boolean')fail('D1D 적응 스키마');
 for(const n of w.nations){const a=n.aiAdaptation;
  if(!a||a.schema!==1||!Number.isSafeInteger(a.lastUpdatedDay)||a.lastUpdatedDay<0||a.lastUpdatedDay>w.dayIndex||
    !Number.isSafeInteger(a.revision)||a.revision<0||!Number.isSafeInteger(a.foodStressQuarters)||a.foodStressQuarters<0||a.foodStressQuarters>40||
    !a.deltas||!a.targets||!Array.isArray(a.warResults)||a.warResults.length>D1D_WINDOW||!Array.isArray(a.recentChanges)||a.recentChanges.length>D1D_WINDOW||!Array.isArray(a.lastReasons)||a.lastReasons.length>4)fail('D1D 국가 적응 상태');
  for(const k of D1D_KEYS){const [lo,hi]=D1D_LIMITS[k];if(!Number.isSafeInteger(a.deltas[k])||a.deltas[k]<lo*100||a.deltas[k]>hi*100||!Number.isSafeInteger(a.targets[k])||a.targets[k]<lo*100||a.targets[k]>hi*100)fail('D1D 성향 범위');}
  // D1D1: Expiry is an AI memory policy, NOT a save invariant. D1D trims at its
  // annual update (and on new peace), while users may save on any intervening day.
  // Inactive/paused nations may retain old bounded records even longer. Never
  // reject valid history solely because its age has crossed the 20-year window.
  if(new Set(a.warResults.map(r=>r.warId)).size!==a.warResults.length||a.warResults.some(r=>!Number.isSafeInteger(r.warId)||r.warId<0||!Number.isSafeInteger(r.dayIndex)||r.dayIndex<0||r.dayIndex>w.dayIndex||!['win','loss','draw'].includes(r.outcome)||![0,1,2,3].includes(r.severity)||!['attackers','defenders'].includes(r.side)))fail('D1D 종전 경험');
  if(a.recentChanges.some(r=>!Number.isSafeInteger(r.dayIndex)||r.dayIndex>w.dayIndex||!r.deltas||!Array.isArray(r.reasons)||D1D_KEYS.some(k=>!Number.isSafeInteger(r.deltas[k]))))fail('D1D 변경 이력');
 }
}

// F2A2: Choose a strategic industrial technology without granting prerequisites.
// A bounded, deterministic DFS follows existing requires until it reaches a
// currently legal research frontier. In-progress projects are never interrupted.
const F2A2_INDUSTRIAL_GOALS=Object.freeze({
  1:Object.freeze(['workshop_concentration']),
  2:Object.freeze(['mechanical_components']),
  3:Object.freeze(['large_machine_assembly']),
  4:Object.freeze(['coal_extraction','steam_engineering']),
  industrial:Object.freeze(['industrial_process_standardization','steel_quality_improvement','industrial_freight_network','industrial_research_organization','steam_engine_efficiency','rifled_musket_manufacture','modern_field_logistics','national_conscription_system','integrated_industrial_system','industrial_quality_control','industrial_logistics_rationalization','standardized_field_training','industrial_freight_coordination']),
  industrialIII:Object.freeze(['continuous_industrial_process','integrated_factory_management']),
  industrialIV:Object.freeze(['precision_machine_standardization'])
});
function f2a2ResearchFrontier(w,nationId,targetId){
  const n=w.nations[nationId];if(!n?.active||!n.technology||n.technology.currentResearch)return null;
  const known=new Set(n.technology.unlocked),visited=new Set();
  function search(id){
    if(known.has(id)||visited.has(id))return null;
    visited.add(id);
    const t=TECHNOLOGY_BY_ID[id];if(!t)return null;
    for(const requirement of t.requires){
      if(known.has(requirement))continue;
      const next=search(requirement);
      if(next)return next;
      // No currently reachable prerequisite: never bypass an era lock.
      if(!known.has(requirement))return null;
    }
    return researchLegal(w,nationId,id)?id:null;
  }
  return search(targetId);
}
function f2a2IndustrialResearchRoute(w,nationId){
  const n=w.nations[nationId];if(!n?.active)return null;
  const era=n.civilization?.era;
  const goals=era==='early_modern'?F2A2_INDUSTRIAL_GOALS[n.civilization.stage]:
    era==='industrial_modern'?n.civilization.stage>=4?F2A2_INDUSTRIAL_GOALS.industrialIV:n.civilization.stage>=3?F2A2_INDUSTRIAL_GOALS.industrialIII:F2A2_INDUSTRIAL_GOALS.industrial:null;
  if(!goals)return null;
  for(const targetId of goals){
    if(hasTech(w,nationId,targetId))continue;
    const next=f2a2ResearchFrontier(w,nationId,targetId);
    if(next)return {targetId,nextId:next};
    // Focus on the earlier unresearched industrial milestone.
    return null;
  }
  return null;
}

function chooseAIResearch(w,nationId){
  const n=w.nations[nationId],p=n&&d1dEffectiveProfile(w,nationId);if(!n||!p||n.technology?.currentResearch)return null;
  const wars=w.wars.some(x=>x.attackerId===nationId||x.defenderId===nationId);
  const pop=w.settlements.filter(s=>s.ownerId===nationId).reduce((sum,s)=>sum+s.population,0);
  const foodThreat=n.foodPressure<.95||n.resources.food<Math.max(25,pop*.22);
  const weights={agriculture:p.weights.development*.75+p.weights.knowledge*.25,
    resources:p.weights.expansion*.48+p.weights.development*.52,
    administration:p.weights.development*.75+p.weights.founding*.25,
    roads:p.weights.founding*.4+p.weights.expansion*.3+p.weights.development*.3,
    military:p.military.militaryInvestment*.6+p.military.aggression*.4};
  const local=w.settlements.filter(s=>s.ownerId===nationId);
  const roads=w.tiles.filter(t=>t.ownerId===nationId&&t.roadLevel>0).length;
  if(local.length>=3){weights.administration+=12;weights.roads+=roads>0?14:5;}
  if(n.resources.wood<20||n.resources.stone<10)weights.resources+=32;
  if(foodThreat)weights.agriculture+=55;
  if(wars)weights.military+=44;
  if(p.military.defensivePreference>=85)weights.military+=16;
  if(p.weights.knowledge>=90)for(const k of Object.keys(weights))weights[k]+=5;
  const industrialRoute=f2a2IndustrialResearchRoute(w,nationId);
  // A goal is favored but cannot override critical food/war needs outright.
  const industrialBonus=industrialRoute?Math.max(35,115+Math.round((p.weights.knowledge-50)*.20)
    -(foodThreat?48:0)-(wars?30:0)):0;
  let best=null,bestScore=-Infinity;
  for(const tech of TECHNOLOGIES){
    if(!researchLegal(w,nationId,tech.id))continue;
    const eraPriority=tech.id==='regional_governance'&&n.civilization?.era==='ancient'?
      (wars||foodThreat?20:70):0;
    const core=medievalNextCore(n),stagePriority=tech.id===core?(wars||foodThreat?35:65):0;
    const score=weights[tech.branch]+(tech.tier-1)*8-tech.cost/100+eraPriority+stagePriority+
      (industrialRoute?.nextId===tech.id?industrialBonus:0);
    if(score>bestScore){best=tech.id;bestScore=score;}
  }
  return best;
}



// --- V0.4B / src/sim/historical-chronicle.js ---
// The 180-event activity feed is deliberately distinct from this bounded, persistent history.
const CHRONICLE_MAX=50000,CHRONICLE_TRIM_BATCH=512;
const CHRONICLE_KINDS=Object.freeze(['era','technology','settlement','diplomacy','leader','fall','war','peace']);
function initialHistoricalChronicle(){return {nextId:0,dropped:0,entries:[]};}
function historicalNationIds(w,text){
  // Match names present in the original event text, not current political state.
  return w.nations.filter(n=>text.includes(n.name)).map(n=>n.id);
}
function recordHistoricalEvent(w,kind,text,nationIds=null,sourceKey=null){
  if(!CHRONICLE_KINDS.includes(kind))return;
  const h=w.historicalChronicle;
  if(!h)return; // Legacy intermediary worlds before V0.4B migration.
  const ids=[...new Set((nationIds??historicalNationIds(w,text)).filter(id=>Number.isInteger(id)&&w.nations[id]))];
  h.entries.push({id:h.nextId++,dayIndex:w.dayIndex,kind,text,nationIds:ids,sourceKey});
  if(h.entries.length>CHRONICLE_MAX){const excess=Math.min(h.entries.length,Math.max(CHRONICLE_TRIM_BATCH,h.entries.length-CHRONICLE_MAX));h.entries.splice(0,excess);h.dropped+=excess;}
}
// I1A: chronicle object rows remain unchanged in the simulation. Only saves use compact rows.
// Each row [day, kindId, text, nationIds, optional sourceKey]; ids are contiguous by construction.
// If an imported archive has gaps, store an explicit id array instead of guessing ids.
const CHRONICLE_COMPACT_FORMAT='vilob-chronicle-compact-v1';
function i1aPackChronicle(h){
 const baseId=h.entries.length?h.entries[0].id:h.nextId;
 const ids=h.entries.every((e,i)=>e.id===baseId+i)?null:h.entries.map(e=>e.id);
 const rows=h.entries.map(e=>{const r=[e.dayIndex,CHRONICLE_KINDS.indexOf(e.kind),e.text,e.nationIds];if(e.sourceKey!==null)r.push(e.sourceKey);return r;});
 const packed={format:CHRONICLE_COMPACT_FORMAT,nextId:h.nextId,dropped:h.dropped,baseId,rows};
 if(ids)packed.ids=ids;
 return packed;
}
function i1aUnpackChronicle(p){
 if(p?.format!==CHRONICLE_COMPACT_FORMAT)return p;
 if(!Array.isArray(p.rows)||p.rows.length>CHRONICLE_MAX||!Number.isSafeInteger(p.baseId)||p.baseId<0||
   p.ids!=null&&(!Array.isArray(p.ids)||p.ids.length!==p.rows.length))throw Error('I1A 연대기 저장 형식 오류');
 const entries=p.rows.map((r,i)=>{
  if(!Array.isArray(r)||(r.length!==4&&r.length!==5)||!Number.isInteger(r[1])||r[1]<0||r[1]>=CHRONICLE_KINDS.length)throw Error('I1A 연대기 항목 오류');
  return {id:p.ids?.[i]??p.baseId+i,dayIndex:r[0],kind:CHRONICLE_KINDS[r[1]],text:r[2],nationIds:r[3],sourceKey:r.length===5?r[4]:null};
 });
 return {nextId:p.nextId,dropped:p.dropped,entries};
}
function validateHistoricalChronicle(w){
  const h=w.historicalChronicle;
  if(!h||!Number.isSafeInteger(h.nextId)||h.nextId<0||!Number.isSafeInteger(h.dropped)||h.dropped<0||
    !Array.isArray(h.entries)||h.entries.length>CHRONICLE_MAX)return false;
  let last=-1;
  for(const e of h.entries){
    if(!e||!Number.isSafeInteger(e.id)||e.id<=last||e.id>=h.nextId||
      !Number.isSafeInteger(e.dayIndex)||e.dayIndex<0||e.dayIndex>w.dayIndex||
      !CHRONICLE_KINDS.includes(e.kind)||typeof e.text!=='string'||e.text.length>600||
      !Array.isArray(e.nationIds)||e.nationIds.length>w.nations.length||
      new Set(e.nationIds).size!==e.nationIds.length||e.nationIds.some(id=>!Number.isInteger(id)||!w.nations[id])||
      !(e.sourceKey===null||typeof e.sourceKey==='string'&&e.sourceKey.length<=80))return false;
    last=e.id;
  }
  return true;
}

// --- V0.4A / src/sim/civilization-eras.js ---
// Historic technology tiers remain research difficulty, not civilization eras.
const CIVILIZATION_ERAS=Object.freeze({
  ancient:Object.freeze({id:'ancient',label:'고대',order:0}),
  medieval:Object.freeze({id:'medieval',label:'중세',order:1}),
  early_modern:Object.freeze({id:'early_modern',label:'근세',order:2}),
  industrial_modern:Object.freeze({id:'industrial_modern',label:'산업 근대',order:3}),
  future:Object.freeze({id:'future',label:'미래',order:4,planned:true})
});
const MEDIEVAL_TECH_IDS=Object.freeze(['regional_governance']);
// V0.7F1A: facility gate alternative. One-off payment at the ERA promotion quarter.
// The reference technology has already cost 1x; extra 9x makes the TOTAL 10x.
// This is not a new research project and does not alter technology costs or RNG.
const F1A_FACILITY_ALTERNATIVE_COST_MULTIPLIER=10;
function f1aFacilityCost(techId){
 const cost=TECHNOLOGY_BY_ID[techId]?.cost;
 return Number.isSafeInteger(cost)&&cost>0?cost*(F1A_FACILITY_ALTERNATIVE_COST_MULTIPLIER-1):Infinity;
}
function f1aPayFacilityAlternative(w,n,cost,eraLabel){
 if(!Number.isSafeInteger(cost)||cost<1||n.knowledge<cost)throw Error('F1A 대체 승급 Knowledge 미충족');
 n.knowledge-=cost;
 const text=`${n.name}: ${eraLabel} 시설 요건을 추가 Knowledge ${cost.toLocaleString('ko-KR')}로 대체했습니다 (선행 연구 포함 총 10배).`;
 w.events.push({dayIndex:w.dayIndex,text,kind:'technology'});
 recordHistoricalEvent(w,'technology',text,[n.id]);
 if(w.events.length>180)w.events.splice(0,w.events.length-180);
 w.changeSeq++;
}

function medievalReadiness(w,n){
  const unlocked=n.technology?.unlocked||[];
  const technologies=MEDIEVAL_TECH_IDS.map(id=>({id,label:TECHNOLOGY_BY_ID[id].name,ready:unlocked.includes(id)}));
  const facility=(w.buildings||[]).some(b=>b.typeId!=='fort'&&b.level>=2&&b.status==='ACTIVE'&&!b.disconnected&&
    w.tiles[b.tileId]?.ownerId===n.id&&w.tiles[b.tileId]?.occupiedBy===null&&
    w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===n.id));
  const techReady=technologies.every(t=>t.ready),alternativeCost=f1aFacilityCost('regional_governance');
 const alternative=!facility&&techReady&&n.knowledge>=alternativeCost;
 return {technologies,facility,alternative,alternativeCost,ready:techReady&&(facility||alternative)};
}
function initialCivilization(){return {era:'ancient',eraReachedDay:null,stage:0,stageReachedDay:null};}
// Preserve historical era entry dates; pre-0.7A stage dates are unknowable.
function migrateMedievalStage(c,technology){
  const reached=new Set(technology?.unlocked||[]);
  const stage=c.era==='medieval'?(reached.has(MEDIEVAL_STAGE_CORE[2])?3:reached.has(MEDIEVAL_STAGE_CORE[1])?2:1):0;
  return {...c,stage,stageReachedDay:null};
}
// Migration intentionally does not invent a historic transition date or event.
function migratedCivilization(w,n){
  const oldReady=['urban_planning','stonecraft','equipment_standardization'].every(id=>n.technology?.unlocked?.includes(id));
  const oldFacility=(w.buildings||[]).some(b=>b.level>=2&&b.status==='ACTIVE'&&!b.disconnected&&
    w.tiles[b.tileId]?.ownerId===n.id&&w.tiles[b.tileId]?.occupiedBy===null);
  return migrateMedievalStage({era:oldReady&&oldFacility?'medieval':'ancient',eraReachedDay:null},n.technology);
}
function validCivilization(c,day){
  if(!c||!CIVILIZATION_ERAS[c.era]||CIVILIZATION_ERAS[c.era].planned)return false;
  if(!(c.era==='ancient'?c.stage===0:c.era==='medieval'&&Number.isSafeInteger(c.stage)&&c.stage>=1&&c.stage<=4||c.era==='early_modern'&&Number.isSafeInteger(c.stage)&&c.stage>=1&&c.stage<=4||c.era==='industrial_modern'&&Number.isSafeInteger(c.stage)&&c.stage>=1&&c.stage<=4))return false;
  const validDay=value=>value===null||(Number.isSafeInteger(value)&&value>=0&&value<=day&&value%30===0);
  return validDay(c.eraReachedDay)&&validDay(c.stageReachedDay);
}

/** V0.7C: only actually operating owned facilities, no future-state guess. */
function v07cEarlyModernReadiness(w,n){
  const tech=hasTech(w,n.id,'movable_type_printing');
  const usable=b=>b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===n.id&&
    w.tiles[b.tileId]?.occupiedBy===null&&w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===n.id&&s.population>0);
  const workshop=w.buildings.some(b=>b.typeId==='workshop'&&usable(b));
  const academy=w.buildings.some(b=>b.typeId==='academy'&&usable(b));
  const facility=workshop&&academy,alternativeCost=f1aFacilityCost('movable_type_printing');
 const alternative=tech&&!facility&&n.knowledge>=alternativeCost;
 return {tech,workshop,academy,alternative,alternativeCost,ready:tech&&(facility||alternative)};
}
function v07e1Modern3Readiness(w,n){
  const technology=['precision_metalworking','power_transmission','mechanical_components'].map(id=>({id,ready:hasTech(w,n.id,id)}));
  const operated=(w.buildings||[]).some(b=>b.typeId==='workshop'&&b.level===3&&b.status==='ACTIVE'&&!b.disconnected&&
    b.lastOperatedDay===w.dayIndex&&w.tiles[b.tileId]?.ownerId===n.id&&w.tiles[b.tileId]?.occupiedBy===null&&
    !(w.occupations||[]).some(o=>o.tileId===b.tileId)&&w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===n.id));
  return {technology,operated,ready:technology.every(t=>t.ready)&&operated};
}
function v07e2Modern4Readiness(w,n){
 const technology=['precision_workshop_methods','scientific_instrumentation','large_machine_assembly'].map(id=>({id,ready:hasTech(w,n.id,id)}));
 // E3: use the actual economic-quarter ledger, not the building's currently
 // selected mode. AI may switch mode AFTER production but BEFORE era promotion.
 // Otherwise a standard workshop can be misreported as precision-operated.
 const precisionOperated=n.lastQuarter?.workshop?.dayIndex===w.dayIndex&&
   (n.lastQuarter.workshop.precisionOperated||0)>0;
 return {technology,precisionOperated,ready:technology.every(t=>t.ready)&&precisionOperated};
}
// V0.7F2A1: a universal, paid 10x-Knowledge alternative for EVERY completed
// civilization-stage promotion. Paying does not unlock the reference technology,
// its prerequisites, a building, operation evidence, resources or era-specific gear.
// If the reference tech was already researched (normal 1x paid), the additional
// charge is 9x; otherwise the full 10x is paid. All numbers are integers.
const F2A1_ERA_REFERENCE=Object.freeze({
 'ancient:0':'regional_governance',
 'medieval:1':'ore_refining',
 'medieval:2':'construction_management',
 'medieval:3':'advanced_transport',
 'medieval:4':'movable_type_printing',
 'early_modern:1':'workshop_concentration',
 'early_modern:2':'mechanical_components',
 'early_modern:3':'large_machine_assembly',
 'early_modern:4':'steam_engineering',
 'industrial_modern:1':'integrated_industrial_system'
});
function f2a1KnowledgeAlternative(n){
 const c=n?.civilization,ref=F2A1_ERA_REFERENCE[`${c?.era}:${c?.stage}`];
 const base=TECHNOLOGY_BY_ID[ref]?.cost||0;
 const researched=!!ref&&!!n?.technology?.unlocked?.includes(ref);
 const multiplier=researched?9:10;
 return {reference:ref||null,researched,base,cost:ref&&base>0?base*multiplier:Infinity,
   ready:!!ref&&base>0&&n.knowledge>=base*multiplier};
}
function f2a1UseKnowledgeAlternative(w,n,description){
 const gate=f2a1KnowledgeAlternative(n);
 if(!gate.ready)return false;
 n.knowledge-=gate.cost;
 const text=`${n.name}: ${description}의 일반 요건을 Knowledge ${gate.cost.toLocaleString('ko-KR')} K로 대체했습니다 (${TECHNOLOGY_BY_ID[gate.reference].name} 비용 기준 총 10배). 기술·시설은 자동 해금되지 않습니다.`;
 w.events.push({dayIndex:w.dayIndex,text,kind:'technology'});
 recordHistoricalEvent(w,'technology',text,[n.id]);
 if(w.events.length>180)w.events.splice(0,w.events.length-180);
 w.changeSeq++;
 return true;
}
function processCivilizationEraQuarter(w){
  for(const n of w.nations){
    if(!n.active||n.civilization.era!=='ancient')continue;
    const readiness=medievalReadiness(w,n);
    const normal=readiness.technologies.every(t=>t.ready)&&readiness.facility;
    const alternative=!normal&&f2a1UseKnowledgeAlternative(w,n,'중세 I');
    if(!normal&&!alternative)continue;
    n.civilization={era:'medieval',eraReachedDay:w.dayIndex,stage:1,stageReachedDay:w.dayIndex};
    if(n.technology.pausedResearch&&!n.technology.currentResearch){
      n.technology.currentResearch=n.technology.pausedResearch.id;
      n.technology.progress=n.technology.pausedResearch.progress;
      n.technology.pausedResearch=null;
    }
    w.events.push({dayIndex:w.dayIndex,text:alternative?`${n.name}: Knowledge 대체 요건으로 고대에서 중세로 진입했습니다.`:`${n.name}: 고대에서 중세로 진입했습니다.`,kind:'era'});
    recordHistoricalEvent(w,'era',w.events[w.events.length-1].text,[n.id],`era:${n.id}:medieval`);
    if(w.events.length>180)w.events.splice(0,w.events.length-180);
    w.changeSeq++;
  }
  // One promotion per quarter, matching the existing era-transition cadence.
  for(const n of w.nations){
    if(!n.active||n.civilization.era!=='medieval'||n.civilization.stage>=4)continue;
    if(n.civilization.stageReachedDay===w.dayIndex)continue;
    const core=MEDIEVAL_STAGE_CORE[n.civilization.stage];
    const normal=n.technology.unlocked.includes(core);
    const nextLabel=MEDIEVAL_STAGE_LABELS[n.civilization.stage+1];
    const alternative=!normal&&f2a1UseKnowledgeAlternative(w,n,nextLabel);
    if(!normal&&!alternative)continue;
    n.civilization.stage++;n.civilization.stageReachedDay=w.dayIndex;
    const label=MEDIEVAL_STAGE_LABELS[n.civilization.stage];
    const text=alternative?`${n.name}: Knowledge 대체 요건으로 ${label} 단계에 진입했습니다.`:
      `${n.name}: ${TECHNOLOGY_BY_ID[core].name} 연구를 바탕으로 ${label} 단계에 진입했습니다.`;
    w.events.push({dayIndex:w.dayIndex,text,kind:'era'});
    recordHistoricalEvent(w,'era',text,[n.id],`era:${n.id}:stage:${n.civilization.stage}`);
    if(w.events.length>180)w.events.splice(0,w.events.length-180);
    w.changeSeq++;
  }

  // IV -> Early Modern I. Once per nation, at a quarterly transition only.
  for(const n of w.nations){
    if(!n.active||n.civilization.era!=='medieval'||n.civilization.stage!==4)continue;
    if(n.civilization.stageReachedDay===w.dayIndex)continue;
    const readiness=v07cEarlyModernReadiness(w,n);
    const normal=readiness.tech&&readiness.workshop&&readiness.academy;
    const alternative=!normal&&f2a1UseKnowledgeAlternative(w,n,'근세 I');
    if(!normal&&!alternative)continue;
    n.civilization={era:'early_modern',eraReachedDay:w.dayIndex,stage:1,stageReachedDay:w.dayIndex};
    const text=alternative?`${n.name}: Knowledge 대체 요건으로 근세 I에 진입했습니다.`:`${n.name}: 활판 인쇄·공방·학술원 기반으로 근세 I에 진입했습니다.`;
    w.events.push({dayIndex:w.dayIndex,text,kind:'era'});
    recordHistoricalEvent(w,'era',text,[n.id],`era:${n.id}:early_modern`);
    if(w.events.length>180)w.events.splice(0,w.events.length-180);
    w.changeSeq++;
  }
  // V0.7D: actual researched concentration opens Early Modern II next quarter.
  for(const n of w.nations){
    if(!n.active||n.civilization.era!=='early_modern'||n.civilization.stage!==1||
       n.civilization.stageReachedDay===w.dayIndex)continue;
    const normal=hasTech(w,n.id,'workshop_concentration');
    const alternative=!normal&&f2a1UseKnowledgeAlternative(w,n,'근세 II');
    if(!normal&&!alternative)continue;
    n.civilization.stage=2;n.civilization.stageReachedDay=w.dayIndex;
    const text=alternative?`${n.name}: Knowledge 대체 요건으로 근세 II에 진입했습니다.`:
      `${n.name}: 공방 집적화 연구를 바탕으로 근세 II에 진입했습니다.`;
    w.events.push({dayIndex:w.dayIndex,text,kind:'era'});
    recordHistoricalEvent(w,'era',text,[n.id],`era:${n.id}:early_modern_2`);
    if(w.events.length>180)w.events.splice(0,w.events.length-180);
    w.changeSeq++;
  }

  // E1: a completed quarter of real Lv.3 workshop operation is mandatory.
  for(const n of w.nations){
    if(!n.active||n.civilization.era!=='early_modern'||n.civilization.stage!==2||
       n.civilization.stageReachedDay===w.dayIndex)continue;
    const normal=v07e1Modern3Readiness(w,n).ready;
    const alternative=!normal&&f2a1UseKnowledgeAlternative(w,n,'근세 III');
    if(!normal&&!alternative)continue;
    n.civilization.stage=3;n.civilization.stageReachedDay=w.dayIndex;
    const text=alternative?`${n.name}: Knowledge 대체 요건으로 근세 III에 진입했습니다.`:
      `${n.name}: 정밀 부품 규격화와 실제 가동 공방을 기반으로 근세 III에 진입했습니다.`;
    w.events.push({dayIndex:w.dayIndex,text,kind:'era'});
    recordHistoricalEvent(w,'era',text,[n.id],`era:${n.id}:early_modern_3`);
    if(w.events.length>180)w.events.splice(0,w.events.length-180);w.changeSeq++;
  }
  // E2: one promotion per completed quarter, with a real precise workshop.
  for(const n of w.nations){
    if(!n.active||n.civilization.era!=='early_modern'||n.civilization.stage!==3||
       n.civilization.stageReachedDay===w.dayIndex)continue;
    const normal=v07e2Modern4Readiness(w,n).ready;
    const alternative=!normal&&f2a1UseKnowledgeAlternative(w,n,'근세 IV');
    if(!normal&&!alternative)continue;
    n.civilization.stage=4;n.civilization.stageReachedDay=w.dayIndex;
    const text=alternative?`${n.name}: Knowledge 대체 요건으로 근세 IV에 진입했습니다.`:
      `${n.name}: 대형 기계 조립과 정밀 공방 실가동을 바탕으로 근세 IV에 진입했습니다.`;
    w.events.push({dayIndex:w.dayIndex,text,kind:'era'});
    recordHistoricalEvent(w,'era',text,[n.id],`era:${n.id}:early_modern_4`);
    if(w.events.length>180)w.events.splice(0,w.events.length-180);w.changeSeq++;
  }
  f1PromoteIndustrial(w);
  f2c2cPromoteIndustrialII(w);
  hPromoteIndustrialIII(w);
  kPromoteIndustrialIV(w);
}

// F2C2C Industrial Modern II: proof is *historical actual operation*, not a
// current-quarter requirement (factories may be correctly idle with full stock).
function f2c2cPromoteIndustrialII(w){
 for(const n of w.nations){
  if(!n.active||n.civilization?.era!=='industrial_modern'||n.civilization.stage!==1||n.civilization.stageReachedDay===w.dayIndex)continue;
  const tech=hasTech(w,n.id,'integrated_industrial_system');
  const owned=b=>w.tiles[b.tileId]?.ownerId===n.id&&w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===n.id);
  const factory=w.buildings.some(b=>b.typeId==='factory'&&(b.factoryRuns||0)>0&&owned(b));
  const steelworks=w.buildings.some(b=>b.typeId==='steelworks'&&(b.f2bRuns||0)>0&&owned(b));
  const normal=tech&&factory&&steelworks;
  const alternative=!normal&&f2a1UseKnowledgeAlternative(w,n,'산업 근대 II');
  if(!normal&&!alternative)continue;
  n.civilization.stage=2;n.civilization.stageReachedDay=w.dayIndex;
  const text=alternative?`${n.name}: 10배 Knowledge 대체 요건으로 산업 근대 II에 진입했습니다 (미연구 기술과 산업 시설은 자동 해금되지 않음).`:
   `${n.name}: 산업 기반 통합 체계와 공장·제강소 실가동을 바탕으로 산업 근대 II에 진입했습니다.`;
  w.events.push({dayIndex:w.dayIndex,text,kind:'era'});
  recordHistoricalEvent(w,'era',text,[n.id],`era:${n.id}:industrial_modern_2`);
  if(w.events.length>180)w.events.splice(0,w.events.length-180);w.changeSeq++;
 }
}
function hPromoteIndustrialIII(w){
 if(!H_ENABLED)return;
 for(const n of w.nations){
  if(!n.active||n.civilization?.era!=='industrial_modern'||n.civilization.stage!==2||n.civilization.stageReachedDay===w.dayIndex||!hasTech(w,n.id,'automaton_assembly'))continue;
  // Only states with real mechanical factory capacity may enter the new production stage.
  if(!hFactory(w,n.id))continue;
  n.civilization.stage=3;n.civilization.stageReachedDay=w.dayIndex;
  const message=`${n.name}: 경량 오토마톤 제작 기술과 실제 가동 가능한 공장을 확보해 산업 근대 III에 진입했습니다.`;
  w.events.push({dayIndex:w.dayIndex,text:message,kind:'era'});recordHistoricalEvent(w,'era',message,[n.id]);
  if(w.events.length>180)w.events.shift();w.changeSeq++;
 }
}
// V0.7K — actual, presently-owned paid production evidence; no 10x Knowledge bypass.
function kIndustrialIVReadiness(w,n){
 const technology=hasTech(w,n.id,'integrated_factory_management');
 const occupied=new Set((w.occupations||[]).map(o=>o.tileId));
 const usable=b=>b.status==='ACTIVE'&&!b.disconnected&&
   w.tiles[b.tileId]?.ownerId===n.id&&w.tiles[b.tileId]?.occupiedBy===null&&!occupied.has(b.tileId)&&
   w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===n.id&&s.population>0);
 const advanced=w.buildings.some(b=>b.typeId==='factory'&&b.level>=4&&usable(b)&&
   (b.kLevel4OperatedDay!=null||b.f2jLastQuarter?.operated===true&&b.f2jLastQuarter?.dayIndex<=w.dayIndex));
 const factory=w.buildings.some(b=>b.typeId==='factory'&&b.level>=3&&(b.factoryRuns||0)>0&&usable(b));
 const steelworks=w.buildings.some(b=>b.typeId==='steelworks'&&(b.f2bRuns||0)>0&&usable(b));
 return {technology,advanced,factory,steelworks,route:advanced?'A':factory&&steelworks?'B':null,
   ready:technology&&(advanced||factory&&steelworks)};
}
function kPromoteIndustrialIV(w){
 for(const n of w.nations){
  if(!n.active||n.civilization?.era!=='industrial_modern'||n.civilization.stage!==3||
    n.civilization.stageReachedDay===w.dayIndex)continue;
  const ready=kIndustrialIVReadiness(w,n);
  if(!ready.ready)continue;
  n.civilization.stage=4;n.civilization.stageReachedDay=w.dayIndex;
  const text=`${n.name}: 통합 공장 운영 체계 연구 및 실제 산업 생산 증거 (${ready.route} 경로)를 바탕으로 산업 근대 IV에 진입했습니다.`;
  w.events.push({dayIndex:w.dayIndex,text,kind:'era'});
  recordHistoricalEvent(w,'era',text,[n.id],`era:${n.id}:industrial_modern_4`);
  if(w.events.length>180)w.events.splice(0,w.events.length-180);
  w.changeSeq++;
 }
}
function kValidateFactoryEvidence(w){
 for(const b of w.buildings){
  if(b.kLevel4OperatedDay!=null&&
    (b.typeId!=='factory'||!Number.isSafeInteger(b.kLevel4OperatedDay)||b.kLevel4OperatedDay<0||
      b.kLevel4OperatedDay>w.dayIndex||b.kLevel4OperatedDay%30!==0))return false;
 }
 return true;
}
// --- src/sim/territory.js ---
/** V0.1B1 Territorial Cohesion: one small, stateless territorial scan per nation.
 * All nations use the same physical rules; profiles only rank legal actions.
 * Distances follow existing owned, passable land from settlement cores (no teleporting across water).
 */


const territoryClamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const territoryRound2=x=>Math.round(x*100)/100;
const CLAIM_BASE_COST=18;
const CLAIM_MAX_COST=42;

function getTerritoryMetrics(world,nationId){
  const owned=world.tiles.filter(t=>t.ownerId===nationId);
  const distances=new Int16Array(world.tiles.length).fill(-1);
  const queue=[];
  for(const s of world.settlements){
    if(s.ownerId!==nationId)continue;
    const id=s.coreTileId;
    if(world.tiles[id]?.ownerId===nationId&&distances[id]<0){distances[id]=0;queue.push(id);}
  }
  for(let i=0;i<queue.length;i++){
    const id=queue[i],nextDist=distances[id]+1;
    for(const near of neighbors4(id,world.size,world.height)){
      if(world.tiles[near].ownerId===nationId&&distances[near]<0){distances[near]=nextDist;queue.push(near);}
    }
  }
  let border=0,excessDistance=0;
  for(const tile of owned){
    const {x,y}=tile;
    // The map edge needs no border patrol. Water is discounted; mountains are easier to defend.
    const dirs=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
    for(const [nx,ny] of dirs){
      if(nx<0||ny<0||nx>=world.size||ny>=(world.height??world.size))continue;
      const adjacent=world.tiles[ny*world.size+nx];
      if(adjacent.ownerId===nationId)continue;
      border+=adjacent.terrain==='water'?.2:adjacent.terrain==='mountain'?.65:1;
    }
    excessDistance+=Math.max(0,(distances[tile.id]>=0?distances[tile.id]:world.size*2)-3);
  }
  const count=owned.length;
  const averageExcess=count?excessDistance/count:0;
  const shapeExcess=count?Math.max(0,border/(4*Math.sqrt(count))-1):0;
  const borderPenalty=territoryClamp(shapeExcess*.22,0,.22);
  const distancePenalty=territoryClamp(averageExcess*.035,0,.16);
  const burdenRate=territoryClamp(borderPenalty+distancePenalty,0,.30);
  return {nationId,ownedCount:count,effectiveBorder:territoryRound2(border),averageExcessDistance:territoryRound2(averageExcess),
    borderPenalty,distancePenalty,burdenRate,efficiency:1-burdenRate,distances};
}

/** Small local shape inspection. Never BFS the complete country per candidate.
 * A narrow chain is measured from the candidate back toward the nearest junction.
 * Geography may justify a natural one-tile pass; this is a preference, not a ban. */
function claimShape(world,nationId,targetTileId){
  const adjacent=neighbors4(targetTileId,world.size,world.height).filter(id=>world.tiles[id].ownerId===nationId);
  const target=world.tiles[targetTileId];
  if(!target)return {adjacentOwned:0,tendrilDepth:0,naturalPassage:false};
  const surrounds=neighbors4(targetTileId,world.size,world.height);
  const naturalPassage=surrounds.filter(id=>!TERRAINS[world.tiles[id].terrain]?.passable).length>=2;
  if(adjacent.length!==1)return {adjacentOwned:adjacent.length,tendrilDepth:0,naturalPassage};
  let prev=targetTileId,current=adjacent[0],depth=0;
  const seen=new Set([prev]);
  while(depth<6&&!seen.has(current)){
    seen.add(current);
    const links=neighbors4(current,world.size,world.height).filter(id=>world.tiles[id].ownerId===nationId);
    // Stop at a town or a widened front, rather than classing it as a thin tail.
    if(world.tiles[current].settlementId!==null||links.length>=3)break;
    depth++;
    const forward=links.filter(id=>id!==prev&&!seen.has(id));
    if(forward.length!==1)break;
    prev=current;current=forward[0];
  }
  return {adjacentOwned:1,tendrilDepth:depth,naturalPassage};
}

function getClaimCost(world,nationId,targetTileId,metrics=null){
  const tile=world.tiles[targetTileId];
  if(!tile||!TERRAINS[tile.terrain]?.passable||tile.ownerId!==null)return null;
  const adjacent=neighbors4(targetTileId,world.size,world.height).filter(id=>world.tiles[id].ownerId===nationId);
  if(adjacent.length===0)return null;
  const travel=metrics?.nationId===nationId?metrics:getTerritoryMetrics(world,nationId);
  const best=Math.min(...adjacent.map(id=>travel.distances[id]>=0?travel.distances[id]+1:world.size*2));
  const cost=territoryClamp(CLAIM_BASE_COST+4*Math.max(0,2-adjacent.length)+2*Math.max(0,best-2),CLAIM_BASE_COST,CLAIM_MAX_COST);
  return {cost,...claimShape(world,nationId,targetTileId),settlementDistance:best};
}


/** V0.3D5A — territory-based settlement capacity, shared by AI, player and UI.
 * No population term; technology changes the density of administration, not owned land.
 * Caller-provided territory metrics make quarterly AI evaluation O(1) after its existing scan.
 */
function settlementSpacing(world){
  const area=world.size*(world.height||world.size);
  return Math.max(15,Math.min(60,Math.round(Math.sqrt(area)*.62)));
}
/** F1C1: researched technologies independently increase territory-supported settlements
 * and each settlement's physical footprint. This function is pure and RNG-neutral.
 * Larger historical settlements acquired by conquest are preserved, not truncated.
 */
const V07F1C1_SETTLEMENT_TECHS=Object.freeze([
  ['urban_planning',.10,0],['administrative_system',.10,0],
  ['regional_governance',.05,1],['construction_management',.05,0],
  ['mixed_use_construction',.05,1],['workshop_concentration',.05,0]
]);
function settlementFootprintCapacity(world,nationId){
  let maxTiles=13,maxRadius=4;
  for(const [id,density,radius] of V07F1C1_SETTLEMENT_TECHS){
    if(hasTech(world,nationId,id)){maxTiles++;maxRadius+=radius;}
  }
  return {maxTiles,maxRadius};
}
function settlementCapacity(world,nationId,territoryMetrics=null){
  const nation=world.nations[nationId];
  if(!nation?.active)return {limit:0,ownedCount:0,spacing:settlementSpacing(world),bonus:0};
  const count=territoryMetrics?.nationId===nationId?territoryMetrics.ownedCount:
    world.tiles.reduce((sum,t)=>sum+(t.ownerId===nationId?1:0),0);
  const bonusPercent=V07F1C1_SETTLEMENT_TECHS.reduce((sum,[id,density])=>sum+(hasTech(world,nationId,id)?Math.round(density*100):0),0);
  const bonus=bonusPercent/100;
  const spacing=settlementSpacing(world);
  return {limit:count?1+Math.floor((count-1)*(100+bonusPercent)/(spacing*100)):0,ownedCount:count,spacing,bonus};
}
// --- src/sim/culture-accounting-d1a1.js ---
/** D1A1: world cultures are identities, not sovereign states. No cultural game effects yet.
 * All pools contain strictly positive integers and only cultures present in the pool.
 * Never consume world RNG: allocation and ties depend on stable culture IDs.
 */
const D1A1_CULTURE_SCHEMA=1;
const D1A1_PREVIOUS_VERSION='V0.6C6';
function d1CultureId(nationId){return `culture_${nationId}`;}
function d1CulturePool(id,people){return people>0?{[id]:people}:{};}
function d1CultureTotal(pool){return Object.values(pool||{}).reduce((sum,v)=>sum+v,0);}
function d1CultureAdd(to,from){
  for(const [id,count] of Object.entries(from))if(count>0)to[id]=(to[id]||0)+count;
  return to;
}
/** Exact capped Hamilton split. Mutates the source to preserve every integer. */
function d1CultureTake(pool,amount){
  if(!Number.isSafeInteger(amount)||amount<0||amount>d1CultureTotal(pool))throw Error('D1A1 문화 인구 인출량 불일치');
  if(amount===0)return {};
  const total=d1CultureTotal(pool),keys=Object.keys(pool).filter(id=>pool[id]>0).sort();
  const parts=keys.map(id=>Math.floor(amount*pool[id]/total));
  const ranks=keys.map((id,i)=>({i,frac:amount*pool[id]/total-parts[i]}))
    .sort((a,b)=>b.frac-a.fr||keys[a.i].localeCompare(keys[b.i]));
  let remaining=amount-parts.reduce((a,b)=>a+b,0);
  for(let i=0;i<remaining;i++)parts[ranks[i].i]++;
  const out={};
  for(let i=0;i<keys.length;i++)if(parts[i]>0){
    const id=keys[i];if(parts[i]>pool[id])throw Error('D1A1 문화 배분 상한 초과');
    out[id]=parts[i];pool[id]-=parts[i];if(pool[id]===0)delete pool[id];
  }
  return out;
}
/** Yearly growth: follow unchanged existing population outcome; only explain its cultural mix. */
function d1CultureResize(pool,target,fallbackCulture){
  const current=d1CultureTotal(pool);
  if(target<current)d1CultureTake(pool,current-target);
  else if(target>current){
    if(current===0)d1CultureAdd(pool,d1CulturePool(fallbackCulture,target));
    else{
      const gap=target-current,keys=Object.keys(pool).sort(),base=keys.map(k=>Math.floor(gap*pool[k]/current));
      const order=keys.map((k,i)=>({i,frac:gap*pool[k]/current-base[i]})).sort((a,b)=>b.frac-a.fr||keys[a.i].localeCompare(keys[b.i]));
      for(let left=gap-base.reduce((a,b)=>a+b,0),i=0;i<left;i++)base[order[i].i]++;
      for(let i=0;i<keys.length;i++)pool[keys[i]]+=base[i];
    }
  }
  return pool;
}
function d1CultureArmyPopulation(army){
  const result={};for(const unit of army.units)d1CultureAdd(result,unit.culturePopulation);return result;
}
function d1InitializeCultureWorld(w,{migrated=false}={}){
  w.cultureSchema=D1A1_CULTURE_SCHEMA;
  w.cultures=w.nations.map(n=>({id:d1CultureId(n.id),name:`${n.name} 문화`,originNationId:n.id,
    color:c1HslHex((n.id*137+200)%360,61,60)}));
  w.cultureBootstrap={source:migrated?'estimated-v06c6':'new-world',dayIndex:w.dayIndex};
  for(const n of w.nations){
    n.primaryCultureId=d1CultureId(n.id);
    n.military.reserveCulturePopulation=d1CulturePool(n.primaryCultureId,n.military.reserveReady);
    for(const t of n.military.training)t.culturePopulation=d1CulturePool(n.primaryCultureId,t.amount);
  }
  for(const settlement of w.settlements){
    const origin=w.nations[settlement.founderNationId]||w.nations[settlement.ownerId];
    settlement.culturePopulation=d1CulturePool(origin.primaryCultureId,settlement.population);
  }
  for(const army of w.armies){
    const primary=w.nations[army.nationId].primaryCultureId;
    for(const unit of army.units)unit.culturePopulation=d1CulturePool(primary,unit.manpower);
  }
  return w;
}
function d1ValidateCultureWorld(w,fail){
  if(w.cultureSchema!==D1A1_CULTURE_SCHEMA||!Array.isArray(w.cultures)||w.cultures.length<1||w.cultures.length>4096||
     !w.cultureBootstrap||!['estimated-v06c6','new-world'].includes(w.cultureBootstrap.source)||
     !Number.isSafeInteger(w.cultureBootstrap.dayIndex)||w.cultureBootstrap.dayIndex<0||w.cultureBootstrap.dayIndex>w.dayIndex)fail('D1A1 문화 스키마');
  const ids=new Set();
  for(const c of w.cultures){
    if(!c||typeof c.id!=='string'||!/^culture_[0-9]+$/.test(c.id)||ids.has(c.id)||
       (c.originNationId!==null&&(!Number.isInteger(c.originNationId)||!w.nations[c.originNationId]))||
       typeof c.name!=='string'||!c.name.trim()||c.name.length>70||!/^#[0-9a-fA-F]{6}$/.test(c.color))fail('D1A1 문화 정의');
    ids.add(c.id);
  }
  function poolOK(pool,expected,scope){
    if(!pool||typeof pool!=='object'||Array.isArray(pool))fail('D1A1 '+scope+' 문화 풀');
    let sum=0;
    for(const [id,count] of Object.entries(pool)){
      if(!ids.has(id)||!Number.isSafeInteger(count)||count<=0)fail('D1A1 '+scope+' 문화 인구 수치');
      sum+=count;
    }
    if(sum!==expected)fail(`D1A1 ${scope} 문화 인구 합계 ${sum} != ${expected}`);
  }
  for(const n of w.nations){
    if(!ids.has(n.primaryCultureId))fail('D1A1 국가의 초기 문화');
    poolOK(n.military.reserveCulturePopulation,n.military.reserveReady,'예비병');
    for(const t of n.military.training)poolOK(t.culturePopulation,t.amount,'훈련병');
  }
  for(const s of w.settlements)poolOK(s.culturePopulation,s.population,'정착지');
  for(const a of w.armies)for(const u of a.units)poolOK(u.culturePopulation,u.manpower,'현역 편제');
  return true;
}
/** Explicit diagnostics only, not called by daily simulation or Atlas redraw. */
function d1CultureAudit(w){
  d1ValidateCultureWorld(w,reason=>{throw Error(reason);});
  const out={version:w.version,dayIndex:w.dayIndex,bootstrap:{...w.cultureBootstrap},
    cultures:w.cultures.length,settlementGroups:0,unitGroups:0,civilians:0,trainees:0,reserves:0,soldiers:0,militia:0,
    byCulture:Object.fromEntries(w.cultures.map(c=>[c.id,{name:c.name,civilians:0,trainees:0,reserves:0,soldiers:0,militia:0}]))};
  function collect(pool,kind){out[kind]+=d1CultureTotal(pool);for(const [id,count] of Object.entries(pool))out.byCulture[id][kind]+=count;}
  for(const s of w.settlements){out.settlementGroups+=Object.keys(s.culturePopulation).length;collect(s.culturePopulation,'civilians');}
  for(const n of w.nations){collect(n.military.reserveCulturePopulation,'reserves');for(const t of n.military.training)collect(t.culturePopulation,'trainees');}
  for(const a of w.armies)for(const u of a.units){out.unitGroups+=Object.keys(u.culturePopulation).length;collect(u.culturePopulation,'soldiers');}
  for(const f of w.uprisings?.active||[])for(const d of f.militia)collect(d1CulturePool(d.cultureId,d.men),'militia');
  out.total=out.civilians+out.trainees+out.reserves+out.soldiers+out.militia;
  out.verified=true;return out;
}
// --- end D1A1 culture-accounting ---


// --- src/sim/civil-grievances-d1b1.js ---
/** D1B1: deterministic civilian grievance accounting and 12-quarter bounded history.
 * All scores are integer tenths on a 0..1000 scale. No SIM RNG, no AI/gameplay effects.
 */
const D1B_SCHEMA=2;
const D1B_KEYS=Object.freeze(['economy','safety','governance','culture']);
const D1B_NAMES=Object.freeze({economy:'경제',safety:'안전',governance:'통치',culture:'문화'});
const D1B_CAUSES=Object.freeze({
  FOOD:'식량 공급 부족',WAR:'국가 간 전쟁',OCCUPATION:'정착지 영토의 점령',CRISIS:'국가 생존 위기',
  CIVIL:'민간 운영비 미납',TAX_HIGH:'높은 조세 부담',SERVICES_LOW:'공공서비스 축소',CONQUEST:'통치권 변경',FOREIGN_CONQUEST:'다른 문화권의 정복',
  FOREIGN_RULE:'통치국과 주민의 문화 차이',ASSIMILATION:'동화 정책으로 인한 문화적 반발',STATE_VIOLENCE:'국가폭력으로 인한 민간인 피해',RECOVERY:'안정에 따른 회복',STABLE:'유의미한 신규 압박 없음'
});
const D1B_BASE_FOREIGN=150;
const D1B_HISTORY_QUARTERS=12;
const D1B_SOCIAL_VIEWS=Object.freeze([...D1B_KEYS,'cultureBase','cultureEvent']);
const d1bClamp=n=>Math.max(0,Math.min(1000,Math.round(n)));
function d1bCultureBase(w,s,id){return w.nations[s.ownerId]?.primaryCultureId===id?0:D1B_BASE_FOREIGN;}
function d1bCultureScore(w,s,id,g){return d1bClamp(d1bCultureBase(w,s,id)+(g?.cultureEvent||0));}
function d1bNewGroup(){return {economy:0,safety:0,governance:0,culture:0,cultureEvent:0,
  ceilingQuarters:{economy:0,safety:0,governance:0,culture:0},
  delta:{economy:0,safety:0,governance:0,culture:0},
  reasons:{economy:'STABLE',safety:'STABLE',governance:'STABLE',culture:'STABLE'},
  lastPressure:{economy:'STABLE',safety:'STABLE',governance:'STABLE',culture:'STABLE'},
  lastPressureDay:{economy:null,safety:null,governance:null,culture:null}};}
function d1bNewSettlement(w,s){
  const groups={};
  for(const id of Object.keys(s.culturePopulation||{})){
    const g=d1bNewGroup();g.culture=d1bCultureBase(w,s,id);groups[id]=g;
  }
  s.civilGrievances={lastUpdatedDay:w.dayIndex,groups,pendingTransfers:[]};
  return s.civilGrievances;
}
function d1bInitializeWorld(w){
  w.socialSchema=D1B_SCHEMA;
  w.socialBootstrap={source:'new-world',sourceVersion:null,dayIndex:w.dayIndex};
  w.socialHistory={limit:D1B_HISTORY_QUARTERS,byNation:{}};
  for(const n of w.nations)w.socialHistory.byNation[n.id]=[];
for(const s of w.settlements)d1bNewSettlement(w,s);
  return w;
}
function d1bSyncGroups(s,w){
  const state=s.civilGrievances;if(!state)return;
  for(const id of Object.keys(state.groups))if(!(s.culturePopulation?.[id]>0))delete state.groups[id];
  for(const id of Object.keys(s.culturePopulation||{})){
    if(!state.groups[id])state.groups[id]=d1bNewGroup();
    if(w)state.groups[id].culture=d1bCultureScore(w,s,id,state.groups[id]);
  }
  if(w)e4PruneAbsent(w,s); // E4: clear missing-culture slots after recruitment, annual resize.
}
/** Ownership event: immediately recompute derived culture floor; capture shock is still next quarter. */
function d1bRecordTransfer(w,s,oldOwnerId,newOwnerId){
  const state=s.civilGrievances;if(!state)return;
  if(w.e2bPeacefulTransfer){d1bSyncGroups(s,w);d2aSyncGroups(w,s);return;}
  state.pendingTransfers.push({dayIndex:w.dayIndex,oldOwnerId,newOwnerId});
  if(state.pendingTransfers.length>12)state.pendingTransfers.splice(0,state.pendingTransfers.length-12);
  d1bSyncGroups(s,w);d2aSyncGroups(w,s);
}
/** Called before the physical population pools are merged; preserve weighted event grievance. */
function d1bMergeSettlements(primary,secondary){
  const a=primary.civilGrievances,b=secondary.civilGrievances;if(!a||!b)return;
  const pools=new Set([...Object.keys(primary.culturePopulation),...Object.keys(secondary.culturePopulation)]);
  const merged={};
  for(const id of pools){
    const x=primary.culturePopulation[id]||0,y=secondary.culturePopulation[id]||0;
    if(x+y<=0)continue;
    const left=a.groups[id]||d1bNewGroup(),right=b.groups[id]||d1bNewGroup(),group=d1bNewGroup();
    for(const key of D1B_KEYS){
      group[key]=Math.round((x*left[key]+y*right[key])/(x+y));
      group.ceilingQuarters[key]=Math.round((x*left.ceilingQuarters[key]+y*right.ceilingQuarters[key])/(x+y));
      group.delta[key]=Math.round((x*left.delta[key]+y*right.delta[key])/(x+y));
      group.reasons[key]=x>=y?left.reasons[key]:right.reasons[key];
      const lead=x>=y?left:right;
      group.lastPressure[key]=lead.lastPressure[key];group.lastPressureDay[key]=lead.lastPressureDay[key];
    }
    group.cultureEvent=d1bClamp((x*left.cultureEvent+y*right.cultureEvent)/(x+y));
    // The two settlements share the same owner; base culture floor is identical.
    group.culture=Math.max(0,Math.min(1000,group.culture));
    merged[id]=group;
  }
  a.groups=merged;a.lastUpdatedDay=Math.min(a.lastUpdatedDay,b.lastUpdatedDay);
  a.pendingTransfers=[...a.pendingTransfers,...b.pendingTransfers].sort((x,y)=>x.dayIndex-y.dayIndex).slice(-12);
}
function d1bAccumulateNationHistory(w){
  const table=w.nations.map(()=>({population:0,sums:[0,0,0,0],critical:0,high:[0,0,0,0],ceiling:[0,0,0,0]}));
  for(const s of w.settlements){
    const acc=table[s.ownerId];if(!acc)continue;
    for(const [id,count] of Object.entries(s.culturePopulation||{})){
      if(count<=0)continue;
      const g=s.civilGrievances?.groups[id];if(!g)continue;
      acc.population+=count;
      let high=false;
      for(let i=0;i<4;i++){
        const key=D1B_KEYS[i],v=key==='culture'?d1bCultureScore(w,s,id,g):g[key];
        acc.sums[i]+=v*count;
        if(v>=600){acc.high[i]+=count;high=true;}
        if(v===1000)acc.ceiling[i]+=count;
      }
      if(high)acc.critical+=count;
    }
  }
  for(const n of w.nations){
    const a=table[n.id],arr=w.socialHistory.byNation[n.id]||(w.socialHistory.byNation[n.id]=[]),d=w.dayIndex;
    const values={};for(let i=0;i<4;i++)values[D1B_KEYS[i]]=a.population?Math.round(a.sums[i]/a.population):0;
    const record={dayIndex:d,population:a.population,values,criticalPopulation:a.critical};
    if(arr.length&&arr[arr.length-1].dayIndex===d)arr[arr.length-1]=record;
    else arr.push(record);
    if(arr.length>D1B_HISTORY_QUARTERS)arr.splice(0,arr.length-D1B_HISTORY_QUARTERS);
  }
}
/** O(T+S+G+N+occupations); calculate risk once and update only occupied culture groups. */
function d1bQuarter(w){
  const endangered=new Set();
  for(const t of w.tiles)if(t.settlementId!==null&&t.occupiedBy!==null)endangered.add(t.settlementId);
  for(const o of w.occupations)if(w.tiles[o.tileId]?.settlementId!==null)endangered.add(w.tiles[o.tileId].settlementId);
  const nationRisk=w.nations.map(n=>{
    const f=n.civilFinance||{},invoice=f.billedLastQuarter||0;
    return {food:d1bClamp((1-(n.foodPressure??1))*1000)/1000,war:militaryAtWar(w,n.id),
      civil:invoice?Math.min(1,(f.unpaidLastQuarter||0)/invoice):0,crisis:n.survival?.state==='CRISIS'};
  });
  for(const s of w.settlements){
    if(!s.civilGrievances)d1bNewSettlement(w,s);
    const state=s.civilGrievances;
    if(state.lastUpdatedDay>=w.dayIndex)continue;
    d1bSyncGroups(s,w);d2aSyncGroups(w,s);
    const risk=nationRisk[s.ownerId],isOccupied=endangered.has(s.id),transfers=state.pendingTransfers;
    for(const [cultureId,group] of Object.entries(state.groups)){
      const shocks={economy:0,safety:0,governance:0,culture:0};
      let foreignCapture=false;
      for(const event of transfers){
        shocks.safety+=60;shocks.governance+=100;
        if(cultureId!==w.nations[event.newOwnerId]?.primaryCultureId){shocks.culture+=160;foreignCapture=true;}
      }
      const pressures={economy:Math.round(risk.food*120),
        safety:(risk.war?22:0)+(isOccupied?95:0)+(risk.crisis?25:0)+shocks.safety+v06e5Pressure(w,s,cultureId,'safety'),
        governance:Math.round(risk.civil*85)+shocks.governance+v06e5Pressure(w,s,cultureId,'governance'),
        culture:shocks.culture+e4CulturePressure(w,s,cultureId)+v06e5Pressure(w,s,cultureId,'culture')};
      const normalRecovery={economy:18,safety:17,governance:14,culture:12};
      for(const key of D1B_KEYS){
        const pressure=pressures[key],recovery=pressure>0?5:normalRecovery[key],old=group[key];
        if(key==='culture'){
          group.cultureEvent=d1bClamp(group.cultureEvent+Math.min(240,pressure)-recovery);
          group.culture=d1bCultureScore(w,s,cultureId,group);
        }else group[key]=d1bClamp(old+Math.min(240,pressure)-recovery+e3GrievanceDelta(w,w.nations[s.ownerId],key)+e3aGrievanceDelta(w,w.nations[s.ownerId],key));
        const next=group[key];group.delta[key]=next-old;
        group.ceilingQuarters[key]=next===1000?Math.min(1000000,group.ceilingQuarters[key]+1):0;
        group.reasons[key]=key!=='economy'&&v06e5Pressure(w,s,cultureId,key)>0?'STATE_VIOLENCE':
          key==='economy'&&risk.food>0?'FOOD':key==='safety'&&isOccupied?'OCCUPATION':
          key==='safety'&&transfers.length?'CONQUEST':key==='safety'&&risk.crisis?'CRISIS':
          key==='safety'&&risk.war?'WAR':key==='governance'&&transfers.length?'CONQUEST':
          key==='governance'&&risk.civil>0?'CIVIL':key==='culture'&&foreignCapture?'FOREIGN_CONQUEST':
          key==='culture'&&e4CulturePressure(w,s,cultureId)>0?'ASSIMILATION':
          next<old?'RECOVERY':key==='economy'&&e3GrievanceDelta(w,w.nations[s.ownerId],key)>0?'TAX_HIGH':
          (key==='governance'||key==='safety')&&e3GrievanceDelta(w,w.nations[s.ownerId],key)>0?'SERVICES_LOW':
          key==='culture'&&d1bCultureBase(w,s,cultureId)>0?'FOREIGN_RULE':'STABLE';
        if(pressure>0&&group.reasons[key]!=='STABLE'){
          group.lastPressure[key]=group.reasons[key];group.lastPressureDay[key]=w.dayIndex;
        }
      }
    }
    state.pendingTransfers=[];state.lastUpdatedDay=w.dayIndex;
  }
  d1bAccumulateNationHistory(w);
}
/** Population-weighted derived metrics for the requested settlement(s), not saved. */
function d1bSummary(w,settlements,key='overall'){
  const sums={economy:0,safety:0,governance:0,culture:0,cultureBase:0,cultureEvent:0},changes={economy:0,safety:0,governance:0,culture:0};
  const highByCause={economy:0,safety:0,governance:0,culture:0},ceilingByCause={...highByCause};
  let population=0,highPopulation=0,criticalPopulation=0,highest=null,highestCause=null;
  for(const s of settlements){
    const state=s.civilGrievances;if(!state)continue;
    for(const [id,count] of Object.entries(s.culturePopulation||{})){
      const g=state.groups[id];if(!g||count<=0)continue;
      population+=count;let raw=0,anyHigh=false;
      for(const field of D1B_KEYS){
        const score=field==='culture'?d1bCultureScore(w,s,id,g):g[field];
        sums[field]+=score*count;changes[field]+=g.delta[field]*count;raw+=score;
        if(score>=600){highByCause[field]+=count;anyHigh=true;}
        if(score===1000)ceilingByCause[field]+=count;
        if(!highestCause||score>highestCause.score)highestCause={id,score,settlementId:s.id,count,cause:field};
      }
      sums.cultureBase+=d1bCultureBase(w,s,id)*count;
      sums.cultureEvent+=(g.cultureEvent||0)*count;
      if(anyHigh)criticalPopulation+=count;
      const average=raw/4;
      if(average>=600)highPopulation+=count;
      if(!highest||average>highest.score)highest={id,score:average,settlementId:s.id,count};
    }
  }
  const values=Object.fromEntries(Object.keys(sums).map(k=>[k,population?sums[k]/population:0]));
  const deltas=Object.fromEntries(D1B_KEYS.map(k=>[k,population?changes[k]/population:0]));
  const overall=D1B_KEYS.reduce((a,k)=>a+values[k],0)/4;
  return {population,values,deltas,overall,highByCause,ceilingByCause,criticalPopulation,
    highPopulation,highest,highestCause,selected:key==='overall'?overall:values[key]||0};
}
function d1bValidate(w,fail){
  if(w.socialSchema!==D1B_SCHEMA||!w.socialBootstrap||w.socialBootstrap.source!=='new-world'||
    !Number.isSafeInteger(w.socialBootstrap.dayIndex)||w.socialBootstrap.dayIndex<0||w.socialBootstrap.dayIndex>w.dayIndex)fail('D1B1 사회 스키마');
  if(!w.socialHistory||w.socialHistory.limit!==D1B_HISTORY_QUARTERS||!w.socialHistory.byNation||
    typeof w.socialHistory.byNation!=='object')fail('D1B1 사회 시계열');
  const ids=new Set(w.cultures.map(c=>c.id));
  for(const n of w.nations){
    const history=w.socialHistory.byNation[n.id];
    if(!Array.isArray(history)||history.length>D1B_HISTORY_QUARTERS)fail('D1B1 국가 시계열');
    let prev=-1;
    for(const record of history){
      if(!Number.isSafeInteger(record.dayIndex)||record.dayIndex<=prev||record.dayIndex>w.dayIndex||
        !Number.isSafeInteger(record.population)||record.population<0||
        !Number.isSafeInteger(record.criticalPopulation)||record.criticalPopulation<0||record.criticalPopulation>record.population||
        !record.values||D1B_KEYS.some(k=>!Number.isSafeInteger(record.values[k])||record.values[k]<0||record.values[k]>1000))fail('D1B1 시계열 데이터');
      prev=record.dayIndex;
    }
  }
  for(const s of w.settlements){
    const state=s.civilGrievances;
    if(!state||!Number.isSafeInteger(state.lastUpdatedDay)||state.lastUpdatedDay<0||state.lastUpdatedDay>w.dayIndex||
      !state.groups||typeof state.groups!=='object'||Array.isArray(state.groups)||
      !Array.isArray(state.pendingTransfers)||state.pendingTransfers.length>12)fail('D1B1 정착지 사회 상태');
    for(const event of state.pendingTransfers)if(!Number.isSafeInteger(event.dayIndex)||event.dayIndex<0||event.dayIndex>w.dayIndex||
      !w.nations[event.oldOwnerId]||!w.nations[event.newOwnerId])fail('D1B1 통치 전환 이력');
    for(const [id,g] of Object.entries(state.groups)){
      if(!ids.has(id)||!g||!g.delta||!g.reasons||!g.lastPressure||!g.lastPressureDay||!g.ceilingQuarters||
        !Number.isSafeInteger(g.cultureEvent)||g.cultureEvent<0||g.cultureEvent>1000)fail('D1B1 문화집단');
      for(const key of D1B_KEYS)if(!Number.isSafeInteger(g[key])||g[key]<0||g[key]>1000||
        !Number.isSafeInteger(g.delta[key])||Math.abs(g.delta[key])>1000||
        !Number.isSafeInteger(g.ceilingQuarters[key])||g.ceilingQuarters[key]<0||g.ceilingQuarters[key]>1000000||
        !Object.hasOwn(D1B_CAUSES,g.reasons[key])||!Object.hasOwn(D1B_CAUSES,g.lastPressure[key])||
        (g.lastPressureDay[key]!==null&&(!Number.isSafeInteger(g.lastPressureDay[key])||g.lastPressureDay[key]<0||g.lastPressureDay[key]>w.dayIndex)))fail('D1B1 불만 수치·원인');
      if((s.culturePopulation?.[id]||0)>0&&g.culture!==d1bCultureScore(w,s,id,g))fail('D1B1 문화 기본·사건 불만 회계');
    }
  }
  return true;
}
// --- end D1B1 social simulation ---

// --- src/sim/military-politics-d1c.js ---
/** V0.6D1C: political grievances of active UnitGroup culture cohorts. Read-only to combat/AI. */
const D1C_SCHEMA=1,D1C_WINDOW=12,D1C_COMMANDER_HISTORY_DAYS=360,D1C_FIELDS=Object.freeze(['pay','supply','war','command','culture']);
const D1C_CAUSES=Object.freeze({NONE:'압박 없음',PAY:'군사 급여 미지급',SUPPLY:'군 보급 단절',WAR:'장기 참전',BATTLE:'실제 전투 손실',COMMAND:'전시 지휘관 반복 교체',CULTURE:'소속국과 문화 차이'});
const d1cBound=n=>Math.max(0,Math.min(1000,Math.round(n||0)));
function d1cNewGroup(){return {pay:0,supply:0,war:0,command:0,lossShock:0,battleLosses:0,lastBattleDay:null,lastCause:'NONE',lastCauseDay:null};}
function d1cEnsureUnit(u){
 if(!u.militaryGrievances)u.militaryGrievances={groups:{},lastUpdatedDay:0};
 for(const id of Object.keys(u.militaryGrievances.groups))if(!(u.culturePopulation?.[id]>0))delete u.militaryGrievances.groups[id];
 for(const [id,count] of Object.entries(u.culturePopulation||{}))if(count>0&&!u.militaryGrievances.groups[id])u.militaryGrievances.groups[id]=d1cNewGroup();
 return u.militaryGrievances;
}
function d1cInitializeWorld(w){
 w.militaryPoliticsSchema=D1C_SCHEMA;
 for(const n of w.nations)n.military.politicalHistory=[];
 for(const a of w.armies){a.militaryPolitics={commanderChangeDays:[]};for(const u of a.units)d1cEnsureUnit(u);}
}
/** Manpower-conserving culture-specific recruitment: newcomers start at zero political grievances. */
function d1cReinforceUnit(u,arrivals){
 const state=d1cEnsureUnit(u);
 for(const [id,added] of Object.entries(arrivals||{})){
  if(!added)continue;
  const current=u.culturePopulation[id]||0,old=Math.max(0,current-added),g=state.groups[id];
  if(!g)continue;
  for(const key of ['pay','supply','war','command','lossShock'])g[key]=old?d1cBound(g[key]*old/current):0;
 }
}
/** Observe actual losses only. No physical losses, combat power, morale or RNG added here. */
function d1cObserveLoss(u,lost,reason='OTHER',day=null){
 const state=d1cEnsureUnit(u);
 if(reason!=='BATTLE')return;
 for(const [id,count] of Object.entries(lost||{})){
  if(!count)continue;
  const live=u.culturePopulation[id]||0,g=state.groups[id];
  if(!live||!g)continue;
  g.lossShock=d1cBound(g.lossShock+Math.round(350*count/(count+live)));
  g.battleLosses+=count;
  if(Number.isSafeInteger(day)){g.lastBattleDay=day;g.lastCauseDay=day;}
  g.lastCause='BATTLE';
 }
}
/** H1: expire only valid, elapsed commander-change dates at every actual SIM time jump.
 * No RNG, morale, combat, or AI decisions are invoked here. Leave malformed data
 * intact so that d1cValidate still reports it instead of silently repairing it. */
function d1cPruneCommanderHistory(w){
 for(const army of w.armies){
  const days=army.militaryPolitics?.commanderChangeDays;
  if(!Array.isArray(days))continue;
  for(let i=days.length-1;i>=0;i--){
   const day=days[i];
   if(Number.isSafeInteger(day)&&day>=0&&day<=w.dayIndex&&w.dayIndex-day>D1C_COMMANDER_HISTORY_DAYS)days.splice(i,1);
  }
 }
}
/** Only multiple actual commander changes within 360 days of active war count as instability. */
function d1cCommanderChanged(w,army){
 const valid=army.assignedWarId!==null&&w.wars.some(v=>v.id===army.assignedWarId);
 if(!valid)return;
 army.militaryPolitics??={commanderChangeDays:[]};
 const xs=army.militaryPolitics.commanderChangeDays;
 xs.push(w.dayIndex);while(xs.length>8)xs.shift();
}
/** Target-follow model avoids unbounded escalation from ordinary war participation. */
function d1cApproach(current,target){
 const delta=target-current;if(!delta)return current;
 const change=Math.max(1,Math.round(Math.abs(delta)/4));
 return d1cBound(current+Math.sign(delta)*Math.min(Math.abs(delta),change,delta>0?120:80));
}
function d1cCultureScore(w,army,id){return w.nations[army.nationId]?.primaryCultureId===id?0:150;}
function d1cGroupScores(w,army,id,g){
 const war=d1cBound(g.war+g.lossShock);
 return {pay:g.pay,supply:g.supply,war,command:g.command,culture:d1cCultureScore(w,army,id),warBase:g.war,battleShock:g.lossShock};
}
function d1cGroupSummary(w,army,id,g){
 const scores=d1cGroupScores(w,army,id,g),average=D1C_FIELDS.reduce((s,k)=>s+scores[k],0)/D1C_FIELDS.length;
 return {scores,overall:average,critical:D1C_FIELDS.some(k=>scores[k]>=600)};
}
function d1cSummarize(w,armies){
 const values={pay:0,supply:0,war:0,command:0,culture:0},byCause={pay:0,supply:0,war:0,command:0,culture:0};
 let population=0,criticalPopulation=0,overall=0,armyCount=0;
 for(const a of armies){armyCount++;for(const u of a.units){
  const state=u.militaryGrievances;if(!state)continue;
  for(const [id,count] of Object.entries(u.culturePopulation||{})){
   if(count<=0)continue;const g=state.groups[id];if(!g)continue;
   const summary=d1cGroupSummary(w,a,id,g);population+=count;overall+=summary.overall*count;
   if(summary.critical)criticalPopulation+=count;
   for(const k of D1C_FIELDS){values[k]+=summary.scores[k]*count;if(summary.scores[k]>=600)byCause[k]+=count;}
  }
 }}
 for(const k of D1C_FIELDS)values[k]=population?values[k]/population:0;
 return {population,armyCount,criticalPopulation,overall:population?overall/population:0,values,byCause};
}
/** Complexity O(nations+armies+units+positive culture cohorts). Exactly once per 30-day quarter. */
function d1cQuarter(w){
 const wars=new Map(w.wars.map(war=>[war.id,war]));
 const byNation=new Map(w.nations.map(n=>[n.id,[]]));
 for(const a of w.armies){
  byNation.get(a.nationId)?.push(a);
  a.militaryPolitics??={commanderChangeDays:[]};
  const meta=a.militaryPolitics;
  meta.commanderChangeDays=meta.commanderChangeDays.filter(day=>w.dayIndex-day<=D1C_COMMANDER_HISTORY_DAYS);
  const war=wars.get(a.assignedWarId),months=war?Math.floor((w.dayIndex-war.startedDay)/30):0;
  const warTarget=war?Math.min(380,months*20):0;
  const supplyTarget=a.supplied?0:(a.unsuppliedDays>=60?650:a.unsuppliedDays>=30?400:a.unsuppliedDays>=10?150:0);
  const commandTarget=war?Math.min(450,Math.max(0,meta.commanderChangeDays.length-1)*150):0;
  const n=w.nations[a.nationId],due=n.lastQuarter?.upkeep||0,paid=n.military.upkeepPaidLastQuarter||0;
  const payTarget=due>0?d1cBound(800*Math.max(0,Math.min(1,1-paid/due))):0;
  const targets={pay:payTarget,supply:supplyTarget,war:warTarget,command:commandTarget};
  for(const u of a.units){const state=d1cEnsureUnit(u);
   for(const id of Object.keys(u.culturePopulation||{})){
    const g=state.groups[id];if(!g)continue;
    let cause='NONE',gain=0;
    for(const [key,target] of Object.entries(targets)){
     const previous=g[key];g[key]=d1cApproach(previous,target);
     if(g[key]>previous&&g[key]-previous>gain){gain=g[key]-previous;cause=({pay:'PAY',supply:'SUPPLY',war:'WAR',command:'COMMAND'})[key];}
    }
    g.lossShock=Math.max(0,g.lossShock-12);
    if(cause!=='NONE'){g.lastCause=cause;g.lastCauseDay=w.dayIndex;}
   }
   state.lastUpdatedDay=w.dayIndex;
  }
 }
 for(const n of w.nations){
  const history=n.military.politicalHistory||(n.military.politicalHistory=[]);
  const s=d1cSummarize(w,byNation.get(n.id)||[]);
  history.push({dayIndex:w.dayIndex,population:s.population,criticalPopulation:s.criticalPopulation,
   values:Object.fromEntries(D1C_FIELDS.map(k=>[k,Math.round(s.values[k])]))});
  if(history.length>D1C_WINDOW)history.splice(0,history.length-D1C_WINDOW);
 }
}
function d1cValidate(w,fail){
 if(w.militaryPoliticsSchema!==D1C_SCHEMA)fail('D1C 군사 정치 스키마');
 const cultureIds=new Set(w.cultures.map(c=>c.id));
 for(const n of w.nations){
  const history=n.military?.politicalHistory;
  if(!Array.isArray(history)||history.length>D1C_WINDOW)fail('D1C 국가 시계열');
  let prev=-1;
  for(const h of history){
   if(!Number.isSafeInteger(h.dayIndex)||h.dayIndex<=prev||h.dayIndex>w.dayIndex||h.dayIndex%30!==0||
     !Number.isSafeInteger(h.population)||h.population<0||!Number.isSafeInteger(h.criticalPopulation)||h.criticalPopulation<0||h.criticalPopulation>h.population||
     !h.values||D1C_FIELDS.some(k=>!Number.isSafeInteger(h.values[k])||h.values[k]<0||h.values[k]>1000))fail('D1C 시계열 점수');
   prev=h.dayIndex;
  }
 }
 for(const a of w.armies){
  const meta=a.militaryPolitics;
  if(!meta||!Array.isArray(meta.commanderChangeDays)||meta.commanderChangeDays.length>8||
    meta.commanderChangeDays.some(d=>!Number.isSafeInteger(d)||d<0||d>w.dayIndex||w.dayIndex-d>D1C_COMMANDER_HISTORY_DAYS))fail('D1C 지휘 변경 이력');
  for(const u of a.units){
   const state=u.militaryGrievances;
   if(!state||!state.groups||typeof state.groups!=='object'||Array.isArray(state.groups)||
     !Number.isSafeInteger(state.lastUpdatedDay)||state.lastUpdatedDay<0||state.lastUpdatedDay>w.dayIndex||
     Object.keys(state.groups).length!==Object.keys(u.culturePopulation).length)fail('D1C UnitGroup 군사 정치 상태');
   for(const [id,g] of Object.entries(state.groups)){
    if(!cultureIds.has(id)||!(u.culturePopulation[id]>0)||!g||!Object.hasOwn(D1C_CAUSES,g.lastCause)||
      !Number.isSafeInteger(g.battleLosses)||g.battleLosses<0||
      (g.lastBattleDay!==null&&(!Number.isSafeInteger(g.lastBattleDay)||g.lastBattleDay<0||g.lastBattleDay>w.dayIndex))||
      (g.lastCauseDay!==null&&(!Number.isSafeInteger(g.lastCauseDay)||g.lastCauseDay<0||g.lastCauseDay>w.dayIndex))||
      ['pay','supply','war','command','lossShock'].some(k=>!Number.isSafeInteger(g[k])||g[k]<0||g[k]>1000))fail('D1C 군사 문화집단 점수');
   }
  }
 }
 return true;
}
// --- end D1C military politics simulation ---
// --- src/ui/culture-atlas-d1a2.js ---
/** D1A2: read-only cultural census, no world mutations and no RNG. */
function d2CultureLookup(w){return new Map(w.cultures.map(c=>[c.id,c]));}
function d2CultureEntries(pool,lookup){
  return Object.entries(pool||{}).filter(([,count])=>count>0)
    .map(([id,count])=>({id,count,culture:lookup.get(id)}))
    .sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
}
function d2CultureSummary(pool){
  const entries=Object.entries(pool||{}).filter(([,count])=>count>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const population=entries.reduce((v,[,count])=>v+count,0);
  const dominant=entries[0]?.[0]||null;
  const dominantCount=entries[0]?.[1]||0;
  return {population,dominant,dominantCount,groups:entries.length,mix:population?100*(population-dominantCount)/population:0};
}
function d2CultureCollect(pools){const out={};for(const pool of pools)d1CultureAdd(out,pool||{});return out;}
function d2FormatPopulation(n){return number.format(n)+'명';}
function d2Percent(count,total){return total?(100*count/total).toFixed(1)+'%':'0.0%';}
function d2CultureBars(w,pool,{limit=24}={}){
  const lookup=d2CultureLookup(w),items=d2CultureEntries(pool,lookup),total=d1CultureTotal(pool);
  const box=make('div',{class:'d2-culture-breakdown'});
  for(const {id,count,culture} of items.slice(0,limit)){
    const color=culture?.color||'#8BABB8',label=culture?.name||id;
    box.append(make('div',{class:'d2-culture-world-row'},[
      make('div',{class:'d2-culture-line'},[
        make('span',{class:'d2-culture-name'},[make('i',{class:'d2-culture-dot',style:{background:color}}),make('span',{text:label})]),
        make('strong',{text:`${d2FormatPopulation(count)} · ${d2Percent(count,total)}`})]),
      make('div',{class:'d2-culture-track'},[make('div',{class:'d2-culture-fill',style:{width:(100*count/total)+'%',background:color}})])]));
  }
  if(items.length>limit)box.append(make('small',{class:'d2-culture-info',text:`그 밖의 문화 ${items.length-limit}개 · 화면 목록 한정 (통계에는 포함)`}));
  if(!items.length)box.append(make('div',{class:'muted-line',text:'해당 인구가 없습니다.'}));
  return box;
}
function d2MakeCultureDetails(w,pool,title){
  const summary=d2CultureSummary(pool),lookup=d2CultureLookup(w);
  const dominant=lookup.get(summary.dominant);
  return make('details',{class:'d2-unit-cultures'},[
    make('summary',{text:`◉ ${title} · ${summary.groups}개 문화${summary.population?` · 주요 ${dominant?.name||summary.dominant} ${d2Percent(summary.dominantCount,summary.population)}`:''}`}),
    d2CultureBars(w,pool)]);
}
function d2MakeNationCulturePanel(w,n){
  const settlements=w.settlements.filter(s=>s.ownerId===n.id);
  const civilian=d2CultureCollect(settlements.map(s=>s.culturePopulation));
  const trainees=d2CultureCollect(n.military.training.map(t=>t.culturePopulation));
  const reserves=n.military.reserveCulturePopulation;
  const military=d2CultureCollect(w.armies.filter(a=>a.nationId===n.id).flatMap(a=>a.units.map(u=>u.culturePopulation)));
  const summary=d2CultureSummary(civilian),lookup=d2CultureLookup(w);
  const top=make('div',{class:'d2-culture-summary'},[
    make('h3',{text:'현재 주민 문화 분포'}),
    make('div',{class:'d2-culture-indicators'},[
      make('span',{text:`민간 ${d2FormatPopulation(summary.population)}`}),
      make('span',{text:`문화집단 ${summary.groups}개`}),
      make('span',{text:`최다 문화 외 비중 ${summary.mix.toFixed(1)}%`})]),
    make('div',{class:'d2-culture-info',text:`이 국가의 현재 소유 정착지 ${settlements.length}곳만 집계합니다. 국가의 기본 문화는 ${lookup.get(n.primaryCultureId)?.name||n.primaryCultureId}. 문화 차이 자체는 불만·전투력에 직접 영향을 주지 않습니다.`}),
    d2CultureBars(w,civilian)]);
  const pools=make('section',{class:'overview-section'},[
    make('h3',{text:'군사 인구 · 민간과 분리 집계'}),
    make('div',{class:'d2-culture-indicators'},[
      make('span',{text:`훈련 ${d2FormatPopulation(d1CultureTotal(trainees))}`}),
      make('span',{text:`예비 ${d2FormatPopulation(d1CultureTotal(reserves))}`}),
      make('span',{text:`현역 ${d2FormatPopulation(d1CultureTotal(military))}`})]),
    make('div',{class:'d2-culture-breakdown'},[
      d2MakeCultureDetails(w,trainees,'훈련병 구성'),d2MakeCultureDetails(w,reserves,'예비병 구성'),d2MakeCultureDetails(w,military,'현역병 구성')])]);
  const places=make('section',{class:'overview-section'},[
    make('h3',{text:'정착지별 문화 구성'}),
    make('div',{class:'d2-culture-breakdown'},[
      ...settlements.slice(0,80).map(s=>{
        const x=d2CultureSummary(s.culturePopulation);
        return d2MakeCultureDetails(w,s.culturePopulation,`${settlementDisplayName(w,s)} · 주민 ${d2FormatPopulation(s.population)} · 혼합도 ${x.mix.toFixed(1)}%`);
      }),
      ...(settlements.length>80?[make('div',{class:'d2-culture-info',text:`정착지 ${settlements.length}곳 중 80곳 표시 · 국가 통계는 전체 합산`})]:[])]),
    make('p',{class:'scope-note',text:'혼합도는 최다 문화 외 주민 비중입니다. 별도 행정·문화권 지도나 역사적 인구 이동을 추정하지 않습니다.'})]);
  return make('div',{},[top,pools,places]);
}
function d2RenderWorldCultures(){
  const box=document.getElementById('d2WorldCultureList');if(!box||!app.world)return;
  const w=app.world,stats=new Map(w.cultures.map(c=>[c.id,{culture:c,count:0,owners:new Set()}]));
  for(const s of w.settlements)for(const [id,count] of Object.entries(s.culturePopulation)){
    const x=stats.get(id);if(!x||count<=0)continue;x.count+=count;x.owners.add(s.ownerId);
  }
  const grand=[...stats.values()].reduce((v,x)=>v+x.count,0);
  const items=[...stats.values()].sort((a,b)=>b.count-a.count||a.culture.id.localeCompare(b.culture.id));
  box.replaceChildren(...items.map(({culture:c,count,owners})=>make('div',{class:'d2-culture-world-row'},[
    make('div',{class:'d2-culture-line'},[
      make('span',{class:'d2-culture-name'},[make('i',{class:'d2-culture-dot',style:{background:c.color}}),make('span',{text:c.name})]),
      make('strong',{text:d2FormatPopulation(count)})]),
    make('div',{class:'d2-culture-track'},[make('div',{class:'d2-culture-fill',style:{width:(grand?100*count/grand:0)+'%',background:c.color}})]),
    make('div',{class:'d2-culture-info',text:`민간 인구 세계 비중 ${d2Percent(count,grand)} · 존재 국가 ${owners.size}개 · 최초 문화 기원: ${w.nations[c.originNationId]?.name||'미상'}`})])));
}

// D1A2 live military tab. Built only while the roster is expanded.
function d2RenderMilitaryCultures(){
  const box=document.getElementById('d2ArmyCultureList'),root=document.getElementById('d2MilitaryCultureCard');
  if(!box||!root?.open||!app.world)return;
  const w=app.world,armies=[...w.armies].sort((a,b)=>a.nationId-b.nationId||a.id-b.id);
  if(!armies.length){box.replaceChildren(make('p',{class:'muted-line',text:'현재 현역 군대가 없습니다. 부대가 편성되면 문화별 구성을 이곳에서 확인할 수 있습니다.'}));return;}
  const cards=armies.map(a=>{
    const title=`${w.nations[a.nationId]?.name||'미상'} 제${a.id+1}군`,crew=d1CultureArmyPopulation(a);
    const units=a.units.filter(u=>u.manpower>0);
    return make('section',{class:'army-detail'},[
      make('strong',{text:`⚔ ${title} · ${d2FormatPopulation(manpower(a))}`}),
      make('small',{text:`사기 ${Math.round(a.morale)} · ${a.status} · 문화 구성은 정치적 충성도를 의미하지 않음`}),
      d2MakeCultureDetails(w,crew,'군대 전체 문화 인원'),
      ...units.map(u=>d2MakeCultureDetails(w,u.culturePopulation,`${UNIT_TYPES[u.typeId]?.label||u.typeId} · ${d2FormatPopulation(u.manpower)}`))
    ]);
  });
  box.replaceChildren(...cards);
}
// --- end D1A2 cultural atlas ---

// --- src/ui/civil-grievances-d1b1.js ---
/** D1B1 passive presentation: risk groups, culture layers, compact bounded history. */
function d1bFormat(raw){return (raw/10).toFixed(1);}
function d1bCauseText(reason){return D1B_CAUSES[reason]||'새 압박 없음';}
function d1bCauseDetail(g,key){
  const current=d1bCauseText(g.reasons[key]);
  if(g.reasons[key]==='RECOVERY'&&g[key]>0&&g.lastPressure[key]!=='STABLE')
    return `${current} · 누적 원인 ${d1bCauseText(g.lastPressure[key])} (${g.lastPressureDay[key]}일)`;
  return current;
}
function d1bScoreColor(score){return score>=650?'#E98079':score>=350?'#E0B56D':'#72B8AB';}
function d1bScoreBars(summary){
  return make('div',{class:'d1b-score-list'},D1B_KEYS.map(key=>{
    const score=summary.values[key]||0,delta=summary.deltas[key]||0;
    return make('div',{class:'d1b-score-row'},[
      make('div',{class:'d1b-score-top'},[
        make('strong',{text:D1B_NAMES[key]}),
        make('span',{text:`${d1bFormat(score)} / 100 · ${delta>0?'+':''}${d1bFormat(delta)} 이번 분기`})]),
      make('div',{class:'d1b-score-track'},[make('div',{class:'d1b-score-fill',style:{width:(score/10)+'%',background:d1bScoreColor(score)}})])]);
  }));
}
function d1bCultureBreakdown(w,s,id,g){
  const base=d1bCultureBase(w,s,id),event=g.cultureEvent||0,total=d1bCultureScore(w,s,id,g);
  return make('div',{class:'d1b-culture-breakdown'},[
    make('div',{class:'d1b-score-top'},[
      make('strong',{text:`문화 불만 ${d1bFormat(total)}`}),
      make('span',{text:`지속 ${d1bFormat(base)} + 사건 ${d1bFormat(event)}`})]),
    make('div',{class:'d1b-culture-stack'},[
      make('span',{class:'d1b-culture-base',style:{width:(base/10)+'%'}}),
      make('span',{class:'d1b-culture-event',style:{width:(Math.min(event,1000-base)/10)+'%'}})]),
    make('div',{class:'d1b-culture-note',text:base>0?'대표 문화가 다른 국가의 통치 · 기본 불만이 유지됩니다.':'통치국과 같은 문화 · 지속 불만 없음'})]);
}
function d1bTrendPanel(w,n){
  const series=w.socialHistory?.byNation?.[n.id]||[];
  const root=make('section',{class:'d1b-trend-panel'},[
    make('h3',{text:'최근 사회 추이 · 최대 12분기'}),
    make('p',{class:'d1b-social-sub',text:series.length?`${series[0].dayIndex}~${series[series.length-1].dayIndex}일 관측 · 분기별 인구 가중 평균`:'아직 정산된 분기 데이터가 없습니다.'})]);
  if(!series.length)return root;
  for(const key of D1B_KEYS){
    const latest=series[series.length-1].values[key];
    root.append(make('div',{class:'d1b-trend-row'},[
      make('div',{class:'d1b-score-top'},[make('strong',{text:D1B_NAMES[key]}),make('span',{text:`현재 ${d1bFormat(latest)}`})]),
      make('div',{class:'d1b-trend-bars',role:'img','aria-label':`${D1B_NAMES[key]} 최근 ${series.length}분기 추세`},series.map(rec=>
        make('span',{class:'d1b-trend-bar',title:`${rec.dayIndex}일 · ${d1bFormat(rec.values[key])}점`,style:{height:`${Math.max(2,rec.values[key]/10)}%`,background:d1bScoreColor(rec.values[key])}})))
    ]));
  }
  const latest=series[series.length-1];
  root.append(make('p',{class:'d1b-social-sub',text:`최근 분기 중대 불만 인구 ${d2FormatPopulation(latest.criticalPopulation)} / ${d2FormatPopulation(latest.population)} · 관측 기록은 12분기를 초과하면 자동으로 순환됩니다.`}));
  return root;
}
function d1bNationPanel(w,n){
  const settlements=w.settlements.filter(s=>s.ownerId===n.id),summary=d1bSummary(w,settlements),lookup=d2CultureLookup(w);
  const byGroup=[];
  for(const s of settlements)for(const [id,count] of Object.entries(s.culturePopulation)){
    const g=s.civilGrievances?.groups[id];if(!g||count<=0)continue;
    const values=D1B_KEYS.map(key=>key==='culture'?d1bCultureScore(w,s,id,g):g[key]);
    byGroup.push({s,id,count,g,score:values.reduce((a,b)=>a+b,0)/4,peak:Math.max(...values)});
  }
  byGroup.sort((a,b)=>b.peak-a.peak||b.count-a.count||a.s.id-b.s.id);
  const high=summary.highByCause,ceiling=summary.ceilingByCause;
  const food=Number.isFinite(n.foodPressure)?`${(n.foodPressure*100).toFixed(1)}%`:'관측 없음';
  return make('section',{class:'d1b-social-panel overview-section'},[
    make('div',{class:'d1b-social-heading'},[make('h3',{text:'민간 불만 · 사회 상태 V2'}),
      make('strong',{text:`${d1bFormat(summary.overall)} / 100`})]),
    make('p',{class:'d1b-social-sub',text:`현재 소유 정착지 ${settlements.length}곳 · 민간 ${d2FormatPopulation(summary.population)} · 불만은 아직 반란·AI·경제 생산에 직접 영향을 주지 않습니다.`}),
    d1bScoreBars(summary),
    make('div',{class:'d1b-social-insights'},[
      make('div',{text:`중대 불만 인구(어느 한 원인 60+): ${d2FormatPopulation(summary.criticalPopulation)} · ${d2Percent(summary.criticalPopulation,summary.population)} · 중복 제외`}),
      make('div',{text:`기존 종합 평균 60+ 인구: ${d2FormatPopulation(summary.highPopulation)} · 평균으로 위험이 희석될 수 있어 별도 표시`}),
      make('div',{text:`원인별 60+: ${D1B_KEYS.map(k=>`${D1B_NAMES[k]} ${d2FormatPopulation(high[k])}`).join(' · ')}`}),
      make('div',{text:`100점 도달 인구: ${D1B_KEYS.map(k=>`${D1B_NAMES[k]} ${d2FormatPopulation(ceiling[k])}`).join(' · ')}`}),
      make('div',{text:`경제 식량 충족률: ${food} · 식량 불만 산식은 D1B와 동일`}),
      make('div',{text:`문화 기본 불만 평균 ${d1bFormat(summary.values.cultureBase)} · 사건 불만 평균 ${d1bFormat(summary.values.cultureEvent)}`}),
      make('div',{text:summary.highestCause?`최고 개별 불만: ${lookup.get(summary.highestCause.id)?.name||summary.highestCause.id} · ${D1B_NAMES[summary.highestCause.cause]} ${d1bFormat(summary.highestCause.score)} · ${settlementDisplayName(w,w.settlements.find(s=>s.id===summary.highestCause.settlementId))}`:'활성 문화집단 없음'})]),
    d1bTrendPanel(w,n),
    make('h3',{text:'원인별 불만이 높은 문화집단 · 정착지별'}),
    make('div',{class:'d1b-group-list'},byGroup.slice(0,30).map(item=>{
      const g=item.g,entries=D1B_KEYS.map(key=>({key,score:key==='culture'?d1bCultureScore(w,item.s,item.id,g):g[key]})).sort((a,b)=>b.score-a.score);
      return make('details',{class:'d1b-group'},[
        make('summary',{text:`${lookup.get(item.id)?.name||item.id} · ${settlementDisplayName(w,item.s)} · ${d2FormatPopulation(item.count)}명 · 최고 원인 ${d1bFormat(item.peak)} (종합 ${d1bFormat(item.score)})`}),
        make('div',{class:'d1b-group-details'},[
          ...entries.map(e=>make('div',{text:`${D1B_NAMES[e.key]} ${d1bFormat(e.score)} · ${d1bCauseDetail(g,e.key)}${g.ceilingQuarters[e.key]?` · 100점 ${g.ceilingQuarters[e.key]}분기 지속`:''}`})),
          d1bCultureBreakdown(w,item.s,item.id,g)])]);
    })),
    ...(byGroup.length>30?[make('p',{class:'d1b-social-sub',text:`상위 30개 집단만 표시 · 국가 평균은 전체 ${byGroup.length}개 집단을 반영합니다.`})]:[]),
    make('p',{class:'scope-note',text:'타문화 통치 기본 문화 불만 15점 + 정복 등 사건 불만(회복 가능)을 구분합니다. 기존 종속국 독립 압력과는 독립적입니다.'})]);
}
function d1bInspectorPanel(w,s){
  const summary=d1bSummary(w,[s]),lookup=d2CultureLookup(w);
  const groups=Object.entries(s.culturePopulation).filter(([,count])=>count>0).sort((a,b)=>b[1]-a[1]);
  return make('details',{class:'d1b-inspector'},[
    make('summary',{text:`◎ 주민 불만 ${d1bFormat(summary.overall)} / 100 · 중대 불만 ${d2FormatPopulation(summary.criticalPopulation)} · 상세 보기`}),
    d1bScoreBars(summary),
    make('p',{class:'d1b-social-sub',text:`원인별 60점 이상 주민: ${D1B_KEYS.map(k=>`${D1B_NAMES[k]} ${d2FormatPopulation(summary.highByCause[k])}`).join(' · ')}`}),
    ...groups.map(([id,count])=>{
      const g=s.civilGrievances?.groups[id];if(!g)return make('div',{text:`${lookup.get(id)?.name||id}: 최초 정산 전`});
      const entries=D1B_KEYS.map(key=>({key,score:key==='culture'?d1bCultureScore(w,s,id,g):g[key]})).sort((a,b)=>b.score-a.score);
      return make('div',{class:'d1b-inspector-group'},[
        make('div',{class:'d1b-inspector-row',text:`${lookup.get(id)?.name||id} ${d2FormatPopulation(count)}명 · 종합 ${d1bFormat(entries.reduce((a,e)=>a+e.score,0)/4)} · 최고 ${D1B_NAMES[entries[0].key]} ${d1bFormat(entries[0].score)} (${d1bCauseDetail(g,entries[0].key)})`}),
        d1bCultureBreakdown(w,s,id,g)]);
    })]);
}
// --- end D1B1 social UI ---


// --- src/sim/units.js ---
/** V0.1E: deterministic cohort loadouts; names/AI IDs never dictate combat rules. */
// G4 experimental toggles are release constants; default ON.
// For controlled G3 parity tests switch both to false in a temporary VM copy.
const G5_DOCTRINE_ENABLED=true; // Switch false in controlled G4 baseline parity tests.
const G4_COMBAT_ENABLED=true;
const G4_RESEARCH_ENABLED=true;
const G4_FIREARM_PENETRATION=Object.freeze({matchlock:25,flintlock:40,rifled_musket:60,machine_gun:45});
// A close-quarter shot is paid separately from OPENING / SUSTAINED; CONTACT
// remains physical, preventing two close-quarters volleys in the same round.
const G4_CLOSE_SHOT_FACTOR=Object.freeze({matchlock:.08,flintlock:.22,rifled_musket:.28,machine_gun:.08});
const G4_PHYSICAL_MELEE_FACTOR=Object.freeze({matchlock:1.946,flintlock:2.5,rifle_infantry:1.50909,machine_gunner:.95});
const UNIT_TYPES=Object.freeze({
  levy:{id:'levy',label:'징집 보병',branch:'melee',power:1,contact:1,melee:1},
  spearman:{id:'spearman',label:'창병',branch:'melee',power:1.05,contact:1.55,melee:.92},
  archer:{id:'archer',label:'궁병',branch:'ranged',power:.88,contact:.35,melee:.48},
  swordsman:{id:'swordsman',label:'검병',branch:'melee',power:1.14,contact:1.08,melee:1.28},
  pikeman:{id:'pikeman',label:'장창병',branch:'melee',power:1.12,contact:1.88,melee:.86},
  longbowman:{id:'longbowman',label:'장궁병',branch:'ranged',power:.96,contact:.30,melee:.44},
  crossbowman:{id:'crossbowman',label:'쇠뇌병',branch:'ranged',power:1.02,contact:.42,melee:.57},
  heavy_infantry:{id:'heavy_infantry',label:'중보병',branch:'melee',power:1.28,contact:1.27,melee:1.38},
  matchlock:{id:'matchlock',label:'화승총병',branch:'ranged',power:1.06,contact:.29,melee:.37},
  flintlock:{id:'flintlock',label:'머스킷병',branch:'ranged',power:1.08,contact:.30,melee:.38},
  rifle_infantry:{id:'rifle_infantry',label:'강선 소총병',branch:'ranged',power:1.35,contact:.55,melee:.55},
  machine_gunner:{id:'machine_gunner',label:'기관총병',branch:'ranged',power:1.52,contact:.28,melee:.34},
  field_artillery:{id:'field_artillery',label:'전장포',branch:'artillery',power:0,contact:0,melee:0},
  tank_crew:{id:'tank_crew',label:'돌격전차 승무원',branch:'artillery',power:0,contact:0,melee:0}
});
const WEAPONS=Object.freeze({
  basic_arms:{id:'basic_arms',label:'기본 무장',opening:0,contact:0,melee:1},
  spear:{id:'spear',label:'창',opening:0,contact:.75,melee:.95},
  bow:{id:'bow',label:'활',opening:2.0,contact:0,melee:.40},
  sword:{id:'sword',label:'검',opening:0,contact:.45,melee:1.40},
  pike:{id:'pike',label:'장창',opening:0,contact:1.13,melee:.92},
  longbow:{id:'longbow',label:'장궁',opening:2.50,contact:0,melee:.32},
  crossbow:{id:'crossbow',label:'쇠뇌',opening:2.75,contact:.1,melee:.28},
  steel_blade:{id:'steel_blade',label:'강철 무장',opening:0,contact:.65,melee:1.62},
  matchlock:{id:'matchlock',label:'화승총',opening:3.6,contact:0,melee:.28},
  flintlock:{id:'flintlock',label:'부싯돌식 머스킷',opening:3.90,contact:0,melee:.28},
  rifled_musket:{id:'rifled_musket',label:'총검 장착 강선 소총',opening:5.0,contact:.50,melee:1.15},
  machine_gun:{id:'machine_gun',label:'삼각대식 기관총',opening:3.8,contact:.12,melee:.65},
  field_piece:{id:'field_piece',label:'전장포 포신',opening:0,contact:0,melee:0},
  tank_tools:{id:'tank_tools',label:'전차 조종·정비 도구',opening:0,contact:0,melee:0}
});
const ARMORS=Object.freeze({
  none:{id:'none',label:'무장갑',armor:0,protection:0},
  light:{id:'light',label:'경장갑',armor:14,protection:.12},
  medium:{id:'medium',label:'중형 갑옷',armor:28,protection:.22},
  heavy:{id:'heavy',label:'중갑',armor:49,protection:.33},
  plate:{id:'plate',label:'판금갑',armor:67,protection:.40}
});
const LOADOUTS=Object.freeze({
  levy:{typeId:'levy',weaponId:'basic_arms',armorId:'none',gold:2.5,wood:0,iron:0},
  spearman:{typeId:'spearman',weaponId:'spear',armorId:'light',gold:3.35,wood:.35,iron:.12},
  archer:{typeId:'archer',weaponId:'bow',armorId:'none',gold:4.40,wood:.65,iron:.03,upkeep:1},
  swordsman:{typeId:'swordsman',weaponId:'sword',armorId:'light',gold:5.50,wood:.10,iron:.50,upkeep:1.25,tech:'advanced_blades'},
  pikeman:{typeId:'pikeman',weaponId:'pike',armorId:'medium',gold:5.80,wood:.75,iron:.40,upkeep:1.30,tech:'pike_drills'},
  longbowman:{typeId:'longbowman',weaponId:'longbow',armorId:'light',gold:6.40,wood:1.0,iron:.08,upkeep:1.40,tech:'longbow_craft'},
  crossbowman:{typeId:'crossbowman',weaponId:'crossbow',armorId:'medium',gold:8.00,wood:.80,iron:.70,upkeep:1.60,tech:'crossbow_engineering'},
  heavy_infantry:{typeId:'heavy_infantry',weaponId:'steel_blade',armorId:'heavy',gold:10,wood:.20,iron:1.40,upkeep:1.90,tech:'elite_infantry'},
  matchlock:{typeId:'matchlock',weaponId:'matchlock',armorId:'light',gold:12,wood:.9,iron:1.15,upkeep:2.25,tech:'matchlock_crafting'},
  flintlock:{typeId:'flintlock',weaponId:'flintlock',armorId:'light',gold:15.5,wood:.9,iron:1.5,upkeep:2.8,tech:'flintlock_mechanism'},
  rifle_infantry:{typeId:'rifle_infantry',weaponId:'rifled_musket',armorId:'light',gold:18,wood:.9,iron:1.6,steel:.25,machine_parts:1,upkeep:3.3,tech:'rifled_musket_manufacture'},
  machine_gunner:{typeId:'machine_gunner',weaponId:'machine_gun',armorId:'light',gold:26,wood:1.1,iron:2.1,steel:.35,machine_parts:2,upkeep:4.8,tech:'machine_gun_corps'},
  field_artillery:{typeId:'field_artillery',weaponId:'field_piece',armorId:'none',gold:5,wood:0,iron:0,upkeep:3.0,tech:'field_artillery_casting'},
  tank_crew:{typeId:'tank_crew',weaponId:'tank_tools',armorId:'none',gold:6,wood:0,iron:0,upkeep:3.0,tech:'armored_combat_doctrine'}
});
// Branch is a unit type; deployment is an independent battlefield location.
const UNIT_BRANCHES=Object.freeze({melee:'근접보병',ranged:'원거리보병',artillery:'포병'});
const unitBranch=id=>UNIT_TYPES[id]?.branch||null;
const POSITIONS=Object.freeze(['front','rear','back','reserve']);
/** E2 contract (dormant in E1): 1.5 rounds => 0%, 50%, then 100%. */
function e1RearPreparationMultiplier(round,readyAfter){
  if(!Number.isFinite(round)||!Number.isFinite(readyAfter))return 0;
  return Math.max(0,Math.min(1,round-readyAfter));
}
// V0.6C3 · occupational readiness, distinct from formation combat XP.
// Training cohorts live INSIDE UnitGroups: no soldier entities and no added strength.
const C3_REQUIRED_DAYS=Object.freeze({levy:0,spearman:15,swordsman:30,crossbowman:30,pikeman:45,archer:60,heavy_infantry:60,longbowman:120,matchlock:120,flintlock:150,rifle_infantry:150,machine_gunner:180,field_artillery:180,tank_crew:180});
const C3_TRANSFER=Object.freeze({'archer:longbowman':.50,'longbowman:archer':.70,'spearman:pikeman':.50,'pikeman:spearman':.70,'swordsman:heavy_infantry':.40,'heavy_infantry:swordsman':.70,'matchlock:flintlock':.60,'flintlock:matchlock':.75,'flintlock:rifle_infantry':.75,'rifle_infantry:flintlock':.75,'rifle_infantry:machine_gunner':.85,'machine_gunner:rifle_infantry':.90});
function c3TrainingDays(w,nid,typeId,emergency=false){
 const base=emergency?30:(C3_REQUIRED_DAYS[typeId]??0);
 const tech=w.nations[nid]?.technology?.unlocked||[];
 return base?Math.max(1,Math.ceil(base*(1-(tech.includes('military_drills')?.15:0)-(tech.includes('tactical_advances')?.15:0)))):0;
}
function c3RefreshUnit(u){
 if(!Array.isArray(u.trainingBatches))return;
 u.trainedManpower=Math.max(0,Math.min(u.manpower,u.trainedManpower||0));
 const pending=u.trainingBatches.reduce((s,b)=>s+b.men,0);
 if(u.trainedManpower+pending!==u.manpower)throw Error('C3 전문훈련 병력 회계 불일치');
 const need=u.trainingRequirementDays||0;
 u.training=need===0?100:Math.max(0,Math.min(100,Math.round(100*(u.trainedManpower+u.trainingBatches.reduce((s,b)=>s+b.men*Math.min(1,b.days/need),0))/Math.max(1,u.manpower))));
}
function c3InitUnit(u,w,nid,{emergency=false}={}){
 const req=c3TrainingDays(w,nid,u.typeId,emergency);
 u.trainingRequirementDays=req;u.trainedManpower=req?0:u.manpower;
 u.trainingBatches=req&&u.manpower?[{men:u.manpower,days:0}]:[];
 u.emergencySpecialist=Boolean(emergency);c3RefreshUnit(u);d1cEnsureUnit(u);return u;
}
function c3ReadyMen(u){return Array.isArray(u.trainingBatches)?u.trainedManpower:u.manpower;}
function c3PendingMen(u){return Array.isArray(u.trainingBatches)?u.trainingBatches.reduce((s,b)=>s+b.men,0):0;}
function c3ArmyPending(army){return army.units.reduce((sum,u)=>sum+c3PendingMen(u),0);}
function c3ArmyReady(army){return army.units.reduce((sum,u)=>sum+c3ReadyMen(u),0);}
function c3CombatMen(u,defending=false){
 if(!Array.isArray(u.trainingBatches))return u.manpower;
 if(u.emergencySpecialist)return u.manpower; // desperate local militia can defend immediately, with a penalty.
 const req=u.trainingRequirementDays||1;
 return c3ReadyMen(u)+(defending?u.trainingBatches.filter(b=>b.days*2>=req).reduce((s,b)=>s+b.men,0):0);
}
function c3CombatScale(u,defending=false){
 if(!Array.isArray(u.trainingBatches))return 1;
 if(u.emergencySpecialist)return .65;
 const eligible=c3CombatMen(u,defending);if(!eligible)return 0;
 const req=u.trainingRequirementDays||1;
 const trainees=defending?u.trainingBatches.filter(b=>b.days*2>=req).reduce((s,b)=>s+b.men*(.55+.45*b.days/req),0):0;
 return (c3ReadyMen(u)+trainees)/eligible;
}
function c3TakeLoss(u,amount,politicalReason='OTHER',politicalDay=null){
 let left=Math.min(u.manpower,Math.max(0,amount));
 if(!Array.isArray(u.trainingBatches)){const lost=d1CultureTake(u.culturePopulation,left);u.manpower-=left;d1cObserveLoss(u,lost,politicalReason,politicalDay);return left;}
 const removed=left;
 // Men who actually fought are exposed first; uncommitted trainees remain protected.
 let take=Math.min(left,u.trainedManpower);u.trainedManpower-=take;left-=take;
 for(const b of u.trainingBatches.slice().sort((a,b)=>b.days-a.days)){
  if(!left)break;take=Math.min(left,b.men);b.men-=take;left-=take;
 }
 u.trainingBatches=u.trainingBatches.filter(b=>b.men>0);const lost=d1CultureTake(u.culturePopulation,removed);u.manpower-=removed;
 d1cObserveLoss(u,lost,politicalReason,politicalDay);c3RefreshUnit(u);return removed;
}
function c3Reinforce(u,amount,w,nid){
 if(!Array.isArray(u.trainingBatches))c3InitUnit(u,w,nid);
 const req=u.trainingRequirementDays;
 u.manpower+=amount;
 if(req){let batch=u.trainingBatches.find(b=>b.days===0);if(batch)batch.men+=amount;else u.trainingBatches.push({men:amount,days:0});}
 else u.trainedManpower+=amount;
 c3RefreshUnit(u);
}
function c3ChangeSpecialism(u,newType,w,nid){
 if(!Array.isArray(u.trainingBatches))c3InitUnit(u,w,nid);
 const oldType=u.typeId,oldReq=u.trainingRequirementDays||0;
 const targetReq=c3TrainingDays(w,nid,newType);
 const credit=oldType===newType?1:(C3_TRANSFER[oldType+':'+newType]??0);
 const pieces=[{men:c3ReadyMen(u),ratio:1},...u.trainingBatches.map(b=>({men:b.men,ratio:oldReq?b.days/oldReq:1}))];
 u.typeId=newType;u.trainingRequirementDays=targetReq;u.emergencySpecialist=false;
 u.trainedManpower=0;u.trainingBatches=[];
 for(const p of pieces){if(p.men<=0)continue;
  const days=Math.min(targetReq,Math.floor(targetReq*credit*p.ratio));
  if(!targetReq||days>=targetReq)u.trainedManpower+=p.men;
  else {const b=u.trainingBatches.find(x=>x.days===days);if(b)b.men+=p.men;else u.trainingBatches.push({men:p.men,days});}
 }
 c3RefreshUnit(u);
}
function c3TrainingBlockReason(w,army){
 if(!c3ArmyPending(army))return '전문훈련 완료';
 if(army.status==='ENGAGED'||army.engagementId!==null)return '교전 중 중단';
 if(army.order||['SAILING','RETREATING','TRAPPED'].includes(army.status))return '이동·후퇴 중 중단';
 if(army.status!=='READY')return '재편 중 중단';
 if(!atSafeSettlement(w,army))return '안전한 아군 정착지 필요';
 if(w.nations[army.nationId].gold<=0)return '훈련비 부족';
 return '전문훈련 진행 가능 (수용량 순서대로 배정)';
}
function c3TrainingCapacity(w,id){
 const operating=v04eBarracksEffects(w,id),tech=w.nations[id]?.technology?.unlocked||[];
 return Math.min(960,24+operating.training+ (tech.includes('equipment_standardization')?24:0)+(tech.includes('standardized_field_training')?18:0));
}
/** A bounded interval advance. Training cannot progress in marches, combat, siege or unsafe locations.
 * Each eligible cohort consumes real Gold; insufficient treasury pauses it, not the army's manpower.
 */
function c3NextTrainingDay(w){
 let next=Infinity;
 for(const a of w.armies){
  if(a.status!=='READY'||a.order||a.engagementId!==null||c3ArmyPending(a)===0||w.nations[a.nationId]?.gold<=0||!atSafeSettlement(w,a))continue;
  for(const u of a.units)for(const b of u.trainingBatches||[]){
   if(b.men>0)next=Math.min(next,w.dayIndex+Math.max(1,u.trainingRequirementDays-b.days));
  }
 }
 return next;
}
function c3AdvanceTraining(w,elapsed){
 if(elapsed<=0)return;
 for(const n of w.nations){if(!n.active)continue;
  let capacity=c3TrainingCapacity(w,n.id);let spent=0,activityDays=0;
  const armies=w.armies.filter(a=>a.nationId===n.id&&a.status==='READY'&&!a.order&&a.engagementId===null&&c3ArmyPending(a)>0&&atSafeSettlement(w,a))
    .sort((a,b)=>a.id-b.id);
  for(const army of armies){if(capacity<=0||n.gold<=0)break;
   for(const u of army.units){if(capacity<=0||n.gold<=0)break;
    if(!Array.isArray(u.trainingBatches)||!u.trainingBatches.length)continue;
    const req=u.trainingRequirementDays;
    for(const b of u.trainingBatches.slice().sort((a,b)=>b.days-a.days)){
      if(capacity<=0||n.gold<=0)break;
      const people=Math.min(b.men,capacity);if(!people)continue;
      const affordableDays=Math.floor(n.gold/Math.max(1,Math.ceil(people*.02)));
      let days=Math.min(elapsed,req-b.days,affordableDays);
      if(days<=0)continue;
      // Cohort size is capped by the operational training slots, never conjured.
      if(people<b.men){b.men-=people;u.trainingBatches.push({men:people,days:b.days+days});}
      else b.days+=days;
      const cost=Math.ceil(people*.02)*days;
      n.gold-=cost;spent+=cost;activityDays=Math.max(activityDays,days);capacity-=people;
    }
    for(const b of u.trainingBatches){if(b.days>=req){u.trainedManpower+=b.men;b.men=0;}}
    u.trainingBatches=u.trainingBatches.filter(b=>b.men>0);
    c3RefreshUnit(u);
   }
  }
  if(spent){n.military.specialistTrainingSpent=(n.military.specialistTrainingSpent||0)+spent;
    n.military.specialistTrainingSpentThisQuarter=(n.military.specialistTrainingSpentThisQuarter||0)+spent;w.changeSeq+=activityDays;}
 }
}
function c3ValidateUnit(u,fail){
 if(!Array.isArray(u.trainingBatches))return; // compatibility for legacy test factories, not imported saves.
 if(!Number.isInteger(u.trainedManpower)||u.trainedManpower<0||!Number.isInteger(u.trainingRequirementDays)||u.trainingRequirementDays<0||
    !Number.isInteger(u.training)||u.training<0||u.training>100||!Array.isArray(u.trainingBatches)||
    u.trainingBatches.some(b=>!Number.isInteger(b.men)||b.men<=0||!Number.isInteger(b.days)||b.days<0||b.days>=u.trainingRequirementDays)||
    u.trainedManpower+u.trainingBatches.reduce((s,b)=>s+b.men,0)!==u.manpower)fail('C3 병종 전문훈련 보존');
}


/** V0.6B4B: only the groups assigned to this deployment role are rearmed.
 * An omitted position preserves historical player actions and in-progress B4A plans. */
// -- G5: full soldier, culture, qualification and equipment conserving split and doctrinal AI --
const G5_MOVE_CAP=24,G5_EARLY_RATIO=.20,G5_FINAL_RATIO=.50;
const G5_RUNTIME=new WeakMap();
function g5Metrics(w){let s=G5_RUNTIME.get(w);if(!s){s={totals:{},history:[],historyLost:0,byNation:{}};G5_RUNTIME.set(w,s);}return s;}
function g5Log(w,nid,kind,army,people=0,info={}){
 const s=g5Metrics(w);s.totals[kind]=(s.totals[kind]||0)+1;
 const by=s.byNation[String(nid)]||(s.byNation[String(nid)]={});by[kind]=(by[kind]||0)+1;
 s.history.push({dayIndex:w.dayIndex,nationId:nid,kind,armyId:army?.id??null,people,...info});
 if(s.history.length>600){s.history.shift();s.historyLost++;}
}
function g5Eligible(w,n){return G5_DOCTRINE_ENABLED&&n?.active&&n.controller==='AI'&&n.civilization?.era==='industrial_modern'&&n.civilization?.stage>=2&&hasTech(w,n.id,'rifled_musket_manufacture');}
function g5SafeArmy(w,nid,a){return Boolean(a&&a.nationId===nid&&a.status==='READY'&&!a.order&&!a.operation&&a.engagementId===null&&!a.rearmPlan&&!a.g5RedeployPlan&&atSafeSettlement(w,a));}
function g5RoleStats(a){const front=rearmGroups(a,'front'),rear=rearmGroups(a,'rear');return {
 front:front.reduce((s,u)=>s+u.manpower,0),frontRifle:front.filter(u=>u.typeId==='rifle_infantry').reduce((s,u)=>s+u.manpower,0),
 rearRifle:rear.filter(u=>u.typeId==='rifle_infantry').reduce((s,u)=>s+u.manpower,0),rear,frontGroups:front};}
function g5MaxRedeploy(st){return Math.max(0,Math.floor((G5_EARLY_RATIO*st.front-st.frontRifle)/(1-G5_EARLY_RATIO)+1e-8));}
function g5RearFloor(a,st){return Math.ceil((a.g5RearRifleBaseline??st.rearRifle)/2);}
function g5UniqueId(a,source,w){let i=0,id;do{id=source.id+'-g5-'+w.dayIndex+'-'+i++;}while(a.units.some(u=>u.id===id));return id;}
/** Transfer a genuine slice of a unit group. Training and culture pools are partitioned
 * exactly; the retained group and new group never share mutable objects.
 * For full transfers reuse the old group, preserving its identity and observer references.
 */
function g5TakeCohort(w,a,u,count){
 if(!Number.isSafeInteger(count)||count<1||count>u.manpower)throw Error('G5 병력 분할 인원 오류');
 if(count===u.manpower)return u;
 const oldMen=u.manpower,fragment=structuredClone(u);fragment.id=g5UniqueId(a,u,w);
 fragment.manpower=count;u.manpower-=count;
 fragment.culturePopulation=d1CultureTake(u.culturePopulation,count);
 const oldWeight=u.allocationWeight??oldMen;fragment.allocationWeight=oldWeight*count/oldMen;u.allocationWeight=oldWeight-fragment.allocationWeight;
 if(Array.isArray(u.trainingBatches)){
  let needed=count;
  const ready=Math.min(u.trainedManpower,needed);u.trainedManpower-=ready;fragment.trainedManpower=ready;needed-=ready;
  fragment.trainingBatches=[];
  for(const b of u.trainingBatches){if(needed<=0)break;const n=Math.min(b.men,needed);if(n>0){b.men-=n;fragment.trainingBatches.push({men:n,days:b.days});needed-=n;}}
  if(needed)throw Error('G5 전문훈련 분할 보존 실패');
  u.trainingBatches=u.trainingBatches.filter(b=>b.men>0);
  c3RefreshUnit(u);c3RefreshUnit(fragment);
 }
 // Grievances are per-culture averaged pressure scores. Historical losses are integer
 // cumulative counters and must not be duplicated when a population cohort splits.
 const oldPolitics=u.militaryGrievances?.groups||{},newPolitics=fragment.militaryGrievances?.groups||{};
 for(const [culture,g] of Object.entries(oldPolitics)){
  const taken=fragment.culturePopulation[culture]||0,remaining=u.culturePopulation[culture]||0,total=taken+remaining;
  if(!taken){delete newPolitics[culture];continue;}
  if(!remaining){delete oldPolitics[culture];continue;}
  if(Number.isSafeInteger(g.battleLosses)){
   const share=Math.floor(g.battleLosses*taken/total);newPolitics[culture].battleLosses=share;g.battleLosses-=share;
  }
 }
 a.units.push(fragment);return fragment;
}
function g5RelocateSlice(w,a,source,amount,from,to){
 const cohort=g5TakeCohort(w,a,source,amount);
 if(cohort===source){if(!a.deployment[from].includes(cohort.id))throw Error('G5 출발 위치 불일치');
  a.deployment[from]=a.deployment[from].filter(id=>id!==cohort.id);}
 a.deployment[to].push(cohort.id);
 return cohort;
}
function g5RedeployLegal(w,nid,act){
 const a=getArmy(w,act.armyId),n=w.nations[nid];if(!g5Eligible(w,n)||!g5SafeArmy(w,nid,a)||militaryAtWar(w,nid))return false;
 const u=a.units.find(u=>u.id===act.unitId),st=g5RoleStats(a),rearIds=a.deployment.rear||[];
 return Boolean(u&&rearIds.includes(u.id)&&u.typeId==='rifle_infantry'&&Number.isSafeInteger(act.amount)&&act.amount>0&&act.amount<=G5_MOVE_CAP&&act.amount<=u.manpower&&
   act.amount<=st.rearRifle-g5RearFloor(a,st)&&act.amount<=g5MaxRedeploy(st));
}
function g5RedeployFinish(w){
 for(const a of w.armies){const p=a.g5RedeployPlan;if(!p||p.completeDay>w.dayIndex)continue;
  const u=a.units.find(u=>u.id===p.unitId),valid=a.status==='REGROUP'&&u&&u.manpower>=p.amount&&a.deployment.rear.includes(u.id)&&
   !militaryAtWar(w,a.nationId)&&atSafeSettlement(w,a);
  if(valid){g5RelocateSlice(w,a,u,p.amount,'rear','front');g5Log(w,a.nationId,'REDEPLOY_COMPLETED',a,p.amount,{sourceUnitId:p.unitId});}
  else g5Log(w,a.nationId,'REDEPLOY_ABORTED',a,p.amount,{sourceUnitId:p.unitId,reason:'WORLD_CHANGED_DURING_REGROUP'});
  delete a.g5RedeployPlan;if(a.status==='REGROUP'){a.status='READY';a.regroupUntil=0;a.needsOrders=true;a.order=null;a.operation=null;}w.changeSeq++;
 }
}
function g5EligiblePartial(w,nid,action,a){
 if((action.unitId===undefined)!==(action.amount===undefined))return false;
 if(action.unitId===undefined)return true;
 if(!Number.isSafeInteger(action.amount)||action.amount<1||action.amount>G5_MOVE_CAP||typeof action.unitId!=='string')return false;
 const u=a.units.find(u=>u.id===action.unitId),groups=rearmGroups(a,action.position);
 return Boolean(u&&groups.includes(u)&&u.manpower>=action.amount&&
  (u.typeId!==action.unitType||u.armorId!==(action.armorId??defaultArmorFor(w,nid,action.unitType))));
}
function g5DoctrineQuarter(w,n,armies,execute){
 if(!g5Eligible(w,n)||!armies.length)return null;
 const start=Math.floor(w.dayIndex/30)%armies.length;
 const sorted=Array.from({length:armies.length},(_,i)=>armies[(start+i)%armies.length]);
 // Phase 1: free equipment reuse; last-mile AP and 30-day safety rules still apply.
 for(const a of sorted){if(!g5SafeArmy(w,n.id,a))continue;
  const st=g5RoleStats(a),bound=Math.min(G5_MOVE_CAP,g5MaxRedeploy(st),st.rearRifle-g5RearFloor(a,st));
  if(bound<1)continue;
  for(const u of st.rear){if(u.typeId!=='rifle_infantry'||u.manpower<1)continue;
   const amount=Math.min(bound,u.manpower),action={type:'REDEPLOY_COHORT',armyId:a.id,unitId:u.id,amount};
   if(!g5RedeployLegal(w,n.id,action))continue;
   const price=getActionPrice(w,n.id,action);if(!canAfford(n,price)){g5Log(w,n.id,'REDEPLOY_AP_BLOCKED',a,amount);continue;}
   if(execute(w,n.id,action).ok)return 'REDEPLOY_STARTED';
  }
 }
 // Phase 2: paid conversion limited to 24 of an actual existing front cohort.
 // Keep the legacy 1-action / nation / quarter budget: no other rearm this quarter.
 for(const a of sorted){if(!g5SafeArmy(w,n.id,a))continue;
  const st=g5RoleStats(a),need=Math.min(G5_MOVE_CAP,Math.floor(G5_FINAL_RATIO*st.front-st.frontRifle+1e-8));
  if(need<1)continue;
  for(const u of st.frontGroups){if(u.manpower<1||u.typeId==='rifle_infantry'||unitBranch(u.typeId)==='artillery')continue;
   const amount=Math.min(need,u.manpower),action={type:'REARM_ARMY',armyId:a.id,unitType:'rifle_infantry',position:'front',unitId:u.id,amount};
   if(!rearmLegal(w,n.id,action))continue;
   const price=rearmPrice(w,n.id,action);if(!price||!canAfford(n,price)){
     g5Log(w,n.id,'PARTIAL_REARM_RESOURCE_BLOCKED',a,amount,{unitId:u.id});continue;
   }
   if(execute(w,n.id,action).ok){g5Log(w,n.id,'PARTIAL_REARM_STARTED',a,amount,{unitId:u.id,price});
    if(g1Enabled(w))g1Record(w,n,'CANDIDATE','STARTED',{armyId:a.id,position:'front',target:'rifle_infantry',people:amount,price,unitId:u.id,g5Partial:true});
    return 'PARTIAL_REARM_STARTED';
   }
  }
 }
 return null;
}
function g5Summary(w){const s=g5Metrics(w);return {version:VERSION,dayIndex:w.dayIndex,enabled:G5_DOCTRINE_ENABLED,
 totals:{...s.totals},byNation:structuredClone(s.byNation),history:s.history.slice(),historyLost:s.historyLost,
 pendingRedeployment:w.armies.filter(a=>a.g5RedeployPlan).map(a=>({armyId:a.id,nationId:a.nationId,...a.g5RedeployPlan})),
 pendingPartialRearm:w.armies.filter(a=>a.rearmPlan?.unitId).map(a=>({armyId:a.id,nationId:a.nationId,...a.rearmPlan})),
 nations:w.nations.filter(n=>n.active).map(n=>{const armies=w.armies.filter(a=>a.nationId===n.id);
  const stats=armies.map(g5RoleStats);const front=stats.reduce((t,v)=>t+v.front,0),frontRifle=stats.reduce((t,v)=>t+v.frontRifle,0),rearRifle=stats.reduce((t,v)=>t+v.rearRifle,0);
  return {nationId:n.id,nation:n.name,eligible:g5Eligible(w,n),front,frontRifle,rearRifle,frontRifleRatio:front?100*frontRifle/front:0,
    parts:n.resources.machine_parts||0,steel:n.resources.steel||0,activePlans:armies.filter(a=>a.rearmPlan||a.g5RedeployPlan).length};})};}
function g5DoctrineCsv(w){const s=g5Summary(w);return g1Csv(s.nations,['nationId','nation','eligible','front','frontRifle','rearRifle','frontRifleRatio','parts','steel','activePlans']);}
// -- end G5 --

function rearmGroups(army,position){
 if(position===undefined||position===null)return army.units;
 if(!POSITIONS.includes(position))return [];
 const ids=new Set(army.deployment[position]);
 return army.units.filter(u=>ids.has(u.id));
}
function rearmArmorLegal(w,nationId,armorId){return armorId===undefined||armorId===null||Boolean(ARMORS[armorId]&&(!['medium','heavy','plate'].includes(armorId)||hasTech(w,nationId,{medium:'steelmaking',heavy:'heavy_armor_forging',plate:'alloy_processing'}[armorId])));}
function rearmLegal(w,nationId,action){
 const a=w.armies.find(a=>a.id===action.armyId&&a.nationId===nationId),kit=LOADOUTS[action.unitType];
 if(!a||!kit||!loadoutLegal(w,nationId,action.unitType)||!rearmArmorLegal(w,nationId,action.armorId)||a.status!=='READY'||a.engagementId!==null||a.rearmPlan||a.g5RedeployPlan||!g5EligiblePartial(w,nationId,action,a))return false;
 // E1: an artillery branch is never an infantry upgrade; future E2 needs a separate creation action.
 if(unitBranch(action.unitType)==='artillery'||rearmGroups(a,action.position).some(u=>unitBranch(u.typeId)==='artillery'))return false;
 const groups=rearmGroups(a,action.position);
 if(!groups.some(u=>u.manpower>0)||action.unitId===undefined&&!groups.some(u=>u.manpower>0&&(u.typeId!==action.unitType||u.armorId!==(action.armorId??defaultArmorFor(w,nationId,action.unitType)))))return false;
 return w.settlements.some(s=>s.ownerId===nationId&&s.coreTileId===a.tileId&&safeSettlement(w,s,nationId));
}
function rearmPrice(w,nationId,action){
 if(!rearmLegal(w,nationId,action))return null;
 const a=w.armies.find(a=>a.id===action.armyId),people=action.unitId!==undefined?action.amount:rearmGroups(a,action.position).reduce((sum,u)=>sum+u.manpower,0),kit=LOADOUTS[action.unitType];
 const armor=action.armorId??defaultArmorFor(w,nationId,action.unitType),extraIron=({none:0,light:0,medium:.12,heavy:.40,plate:.80}[armor]||0);
 const extraGold=({none:0,light:0,medium:.50,heavy:1.4,plate:2.7}[armor]||0);
 return {apUnits:10,gold:Math.ceil(people*(kit.gold*.75+extraGold)),knowledge:0,resources:{wood:Math.ceil(people*kit.wood),iron:Math.ceil(people*(kit.iron+extraIron)),...(kit.steel?{steel:Math.ceil(people*kit.steel)}:{}),...(kit.machine_parts?{machine_parts:Math.ceil(people*kit.machine_parts)}:{})}};
}
function completeRearming(w){
 for(const a of w.armies){if(!a.rearmPlan||a.rearmPlan.completeDay>w.dayIndex)continue;
  const kit=LOADOUTS[a.rearmPlan.unitType];
  const plan=a.rearmPlan;let groups=rearmGroups(a,plan.position);
  if(plan.unitId!==undefined){const u=a.units.find(v=>v.id===plan.unitId);groups=u&&groups.includes(u)&&u.manpower>=plan.amount?[g5TakeCohort(w,a,u,plan.amount)]:[];
   if(groups.length&&!a.deployment[plan.position].includes(groups[0].id))a.deployment[plan.position].push(groups[0].id);}
  for(const u of groups){c3ChangeSpecialism(u,kit.typeId,w,a.nationId);u.weaponId=kit.weaponId;u.armorId=plan.armorId??defaultArmorFor(w,a.nationId,plan.unitType);}
  if(plan.unitId!==undefined)g5Log(w,a.nationId,groups.length?'PARTIAL_REARM_COMPLETED':'PARTIAL_REARM_ABORTED',a,plan.amount,{unitId:plan.unitId,reason:groups.length?'NORMAL':'UNIT_NOT_PRESENT'});
  const finishedPosition=a.rearmPlan.position;
  delete a.rearmPlan;a.status='READY';a.regroupUntil=0;a.needsOrders=true;a.order=null;a.operation=null;
  event(w,`${w.nations[a.nationId].name} 제${a.id+1}군 재무장 완료 (${finishedPosition||'전체'} / ${kit.typeId})`,'army');w.changeSeq++;
  if(g1Enabled(w))g1Record(w,w.nations[a.nationId],'COMPLETED','COMPLETED',{armyId:a.id,position:finishedPosition,target:kit.typeId});
 }
}

function recruitmentPlan(action){
  if(!action||!Number.isSafeInteger(action.amount)||action.amount<12||action.amount>150)return null;
  const composition=action.composition??[
    {typeId:'levy',position:'front',amount:action.amount-Math.max(1,Math.floor(action.amount*.2))},
    {typeId:'levy',position:'reserve',amount:Math.max(1,Math.floor(action.amount*.2))}];
  if(!Array.isArray(composition)||composition.length<1||composition.length>6)return null;
  if(composition.some(u=>unitBranch(u.typeId)==='artillery'||!LOADOUTS[u.typeId]||!POSITIONS.includes(u.position)||!Number.isSafeInteger(u.amount)||u.amount<=0||
    (u.position==='back'&&unitBranch(u.typeId)!=='artillery')||
    (unitBranch(u.typeId)==='artillery'&&u.position!=='back')))return null;
  if(composition.reduce((sum,u)=>sum+u.amount,0)!==action.amount)return null;
  return composition.map(u=>({typeId:u.typeId,position:u.position,amount:u.amount}));
}
function defaultArmorFor(w,nationId,typeId){return typeId==='crossbowman'&&!hasTech(w,nationId,'steelmaking')?'light':LOADOUTS[typeId]?.armorId;}
function loadoutLegal(w,nationId,typeId){const kit=LOADOUTS[typeId];return Boolean(kit&&(!kit.tech||hasTech(w,nationId,kit.tech))&&(typeId!=='pikeman'||hasTech(w,nationId,'steelmaking')));}
function recruitmentPrice(action){
  const plan=recruitmentPlan(action);if(!plan)return null;
  let gold=8,wood=0,iron=0,steel=0,machine_parts=0;
  for(const p of plan){const l=LOADOUTS[p.typeId];gold+=l.gold*p.amount;wood+=l.wood*p.amount;iron+=l.iron*p.amount;steel+=(l.steel||0)*p.amount;machine_parts+=(l.machine_parts||0)*p.amount;}
  return {gold:Math.ceil(gold),resources:{wood:Math.ceil(wood),iron:Math.ceil(iron),...(steel?{steel:Math.ceil(steel)}:{}),...(machine_parts?{machine_parts:Math.ceil(machine_parts)}:{})}};
}

/** Fill EXISTING unit groups only; no new commander or soldier objects.
 * A supplied unitId enables simple/low-resource levy-only reinforcement.
 */
function reinforcementPlan(army,amount,unitId=null){
  if(!army||!Number.isSafeInteger(amount)||amount<1||amount>100)return null;
  const total=army.units.reduce((sum,u)=>sum+u.manpower,0);
  if(total+amount>150)return null;
  const ids=new Map();for(const [position,groupIds] of Object.entries(army.deployment))
    for(const id of groupIds)ids.set(id,position);
  if(unitId!==null){
    const u=army.units.find(u=>u.id===unitId);
    if(!u||!ids.has(unitId))return null;
    return [{unitId:u.id,typeId:u.typeId,position:ids.get(u.id),amount}];
  }
  const groups=army.units.filter(u=>ids.has(u.id));
  if(!groups.length)return null;
  const shares=groups.map(u=>Math.max(1,u.allocationWeight??u.manpower));
  const sum=shares.reduce((a,b)=>a+b,0);
  const counts=shares.map(v=>Math.floor(amount*v/sum));
  for(let left=amount-counts.reduce((a,b)=>a+b,0),i=0;left>0;left--,i++)counts[i%counts.length]++;
  return groups.map((u,i)=>({unitId:u.id,typeId:u.typeId,position:ids.get(u.id),amount:counts[i]})).filter(p=>p.amount>0);
}
function reinforcementPrice(army,amount,unitId=null){
  const plan=reinforcementPlan(army,amount,unitId);
  if(!plan)return null;
  // A reinforcement can contain 1..100 soldiers, unlike initial recruitment
  // (minimum 12). Preserve the same equipment/gold tariff at every size.
  // Calling recruitmentPrice here used to reject 1..11 and strand almost-full
  // formations indefinitely at 140..149 strength.
  let gold=2,wood=0,iron=0,steel=0,machine_parts=0;
  for(const part of plan){const kit=LOADOUTS[part.typeId];gold+=kit.gold*part.amount;wood+=kit.wood*part.amount;iron+=kit.iron*part.amount;steel+=(kit.steel||0)*part.amount;machine_parts+=(kit.machine_parts||0)*part.amount;}
  return {gold:Math.ceil(gold),resources:{wood:Math.ceil(wood),iron:Math.ceil(iron),...(steel?{steel:Math.ceil(steel)}:{}),...(machine_parts?{machine_parts:Math.ceil(machine_parts)}:{})}};
}



// E2: gun inventories are physical integers. Guns never represent troops.
const E2_GUN_CREW=8,E2_GUN_PRICE=Object.freeze({gold:240,wood:24,iron:40});
function e2GunInventory(w){return w.e2Artillery||(w.e2Artillery={produced:0,destroyed:0,stocks:{}});}
function e2FieldWorkshop(w,nid){
 return w.buildings.some(b=>b.typeId==='workshop'&&b.level===3&&b.workshopMode==='precision'&&b.status==='ACTIVE'&&!b.disconnected&&
  Number.isInteger(b.lastOperatedDay)&&b.lastOperatedDay>=w.dayIndex-30&&b.lastOperatedDay<=w.dayIndex&&
  w.tiles[b.tileId]?.ownerId===nid&&w.tiles[b.tileId]?.occupiedBy===null&&
  w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===nid));
}
function e2ArtilleryGroups(a){const back=new Set(a.deployment.back||[]);return a.units.filter(u=>back.has(u.id)&&u.typeId==='field_artillery');}
function e2OperationalGuns(u){return Math.min(u.guns||0,Math.floor(c3ReadyMen(u)/E2_GUN_CREW));}
function e2ArtilleryPrep(u){return Math.max(1.2,1.5-.3*Math.max(0,Math.min(1,u.artilleryExperience||0)));}
function e2FinaliseGuns(w,a,reason,captorId=null){
 const ledger=e2GunInventory(w);
 for(const u of a.units){if(u.typeId!=='field_artillery'||!(u.guns>0))continue;
   const count=u.guns;
   if(reason==='DISBAND'||reason==='SURRENDER'&&captorId!==null){
     const owner=reason==='DISBAND'?a.nationId:captorId;
     ledger.stocks[owner]=(ledger.stocks[owner]||0)+count;
   }else ledger.destroyed+=count;
   u.guns=0;
 }
}
function e2ValidateGuns(w,fail){
 const ledger=w.e2Artillery;if(!ledger||!Number.isSafeInteger(ledger.produced)||!Number.isSafeInteger(ledger.destroyed)||ledger.produced<0||ledger.destroyed<0||!ledger.stocks||typeof ledger.stocks!=='object')fail('E2 포문 장부');
 const stored=Object.entries(ledger.stocks).reduce((s,[id,q])=>{if(!w.nations[Number(id)]||!Number.isSafeInteger(q)||q<0)fail('E2 창고 포문');return s+q;},0);
 let deployed=0;
 for(const a of w.armies)for(const u of a.units){
  if(u.typeId==='field_artillery'){
   if(!Number.isSafeInteger(u.guns)||u.guns<0||!Number.isFinite(u.artilleryExperience)||u.artilleryExperience<0||u.artilleryExperience>1||!a.deployment.back.includes(u.id))fail('E2 포병 편제');
   deployed+=u.guns;
  }else if(u.guns!==undefined&&u.guns!==0)fail('E2 비포병 포문');
 }
 if(ledger.produced!==ledger.destroyed+stored+deployed)fail('E2 포문 보존');
}

function e2ReserveLevyCrew(a){
 const reserve=new Set(a.deployment.reserve||[]),front=new Set(a.deployment.front||[]);
 const availableReserve=a.units.reduce((sum,u)=>sum+(reserve.has(u.id)&&unitBranch(u.typeId)==='melee'?u.manpower:0),0);
 const eligibleFront=a.units.reduce((sum,u)=>sum+(front.has(u.id)&&unitBranch(u.typeId)==='melee'?u.manpower:0),0);
 // Dedicated artillery commissioning may reassign a small part of the frontline
 // when veteran 150-man formations have no untouched reserves; retain >=40 melee in front.
 return availableReserve+Math.max(0,eligibleFront-40);
}
/** Deliberate re-assignment from levy reserve to back; no death, duplicate soldiers or reserve-culture creation.
 * Used when a full 150-man formation cannot recruit additional crew. Never turns ranged infantry into guns. */
function e2TransferReserveLevy(a,amount){
 if(e2ReserveLevyCrew(a)<amount)throw Error('E2 예비대 포병 전환 인원 부족');
 const reserve=new Set(a.deployment.reserve||[]),front=new Set(a.deployment.front||[]),culture={};let remaining=amount;
 for(const u of [...a.units.filter(u=>reserve.has(u.id)),...a.units.filter(u=>front.has(u.id))]){
  if(unitBranch(u.typeId)!=='melee'||remaining===0)continue;
  const keep=front.has(u.id)?Math.max(0,40-(deployedManpower(a,'front')-u.manpower)):0;
  const available=Math.max(0,u.manpower-keep);
  if(!available)continue;
  const take=Math.min(remaining,available);
  d1CultureAdd(culture,d1CultureTake(u.culturePopulation,take));
  const trained=Math.min(take,u.trainedManpower??u.manpower);if(Array.isArray(u.trainingBatches)){
   u.trainedManpower-=trained;let pending=take-trained;
   for(const b of [...u.trainingBatches].sort((x,y)=>y.days-x.days)){
    const used=Math.min(pending,b.men);b.men-=used;pending-=used;
   }
   u.trainingBatches=u.trainingBatches.filter(b=>b.men>0);
  }
  u.manpower-=take;u.allocationWeight=Math.max(0,(u.allocationWeight||u.manpower+take)-take);
  c3RefreshUnit(u);d1cEnsureUnit(u);remaining-=take;
 }
 if(remaining)throw Error('E2 예비대 재배치 보존 오류');
 return culture;
}
// V0.8F — accountable first-generation armored vehicles (no RNG on dormant worlds).
// Tank count is independent from real crew manpower; one vehicle has one 6-man UnitGroup.
const V08F_SPEC=Object.freeze({model:'early_assault_tank',hp:100,front:125,side:90,rear:75,crew:6,
  opening:120,contact:80,sustained:165,melee:70,penetration:140,
  gunPenetration:160,maxPerArmy:2,escort:30,quarterCoal:2,quarterGold:15,
  price:{gold:950,iron:50,steel:8,machine_parts:10,wood:12}});
const V08F_HISTORY_LIMIT=100;
function v08fEnsure(w){return w.v08fArmor??(w.v08fArmor={schema:1,nextId:1,produced:0,destroyed:0,stocks:{},vehicles:[],history:[]});}
function v08fLog(w,kind,tank,other={}){const s=v08fEnsure(w);s.history.push({dayIndex:w.dayIndex,kind,vehicleId:tank?.id??null,nationId:tank?.nationId??null,...other});if(s.history.length>V08F_HISTORY_LIMIT)s.history.shift();}
function v08fTanks(w,a){return !a?.v08fTankIds?.length?[]:(w.v08fArmor?.vehicles||[]).filter(t=>t.armyId===a.id&&a.v08fTankIds.includes(t.id));}
function v08fCrew(a,t){return a?.units.find(u=>u.id===t.crewUnitId&&u.typeId==='tank_crew')||null;}
function v08fEscort(a){const ids=new Set(a.deployment.front||[]);return a.units.reduce((s,u)=>s+(ids.has(u.id)&&u.typeId!=='tank_crew'?c3CombatMen(u):0),0);}
function v08fReady(w,a,t){const crew=v08fCrew(a,t);return t.hp>0&&t.fueled&&crew&&c3ReadyMen(crew)>=V08F_SPEC.crew&&a.status!=='SAILING';}
function v08fAlive(w,a){return v08fTanks(w,a).filter(t=>v08fReady(w,a,t));}
function v08fNationVehicles(w,nid){return (w.v08fArmor?.vehicles||[]).filter(t=>t.nationId===nid).length;}
function v08fSite(w,nid){
 const valid=b=>b.status==='ACTIVE'&&!b.disconnected&&w.tiles[b.tileId]?.ownerId===nid&&w.tiles[b.tileId]?.occupiedBy===null&&w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===nid);
 const factories=w.buildings.filter(b=>b.typeId==='factory'&&b.level>=3&&valid(b)).sort((a,b)=>a.id-b.id);
 const arsenals=w.buildings.filter(b=>b.typeId==='arsenal'&&valid(b));
 return factories.find(f=>arsenals.some(a=>a.settlementId===f.settlementId))||null;
}
function v08fSafeArmy(w,a){return a&&a.status==='READY'&&!a.engagementId&&!a.order&&!a.operation&&atSafeSettlement(w,a);}
function v08fActionPrice(w,nid,act){
 const mk=(ap,gold=0,res={})=>({apUnits:apFloorUnits(ap),gold,resources:res,knowledge:0});
 switch(act?.type){
  case 'TANK_BUILD':return mk(2,V08F_SPEC.price.gold,{iron:50,steel:8,machine_parts:10,wood:12});
  case 'TANK_DEPLOY':return mk(1,36);
  case 'TANK_REPAIR':{const t=v08fEnsure(w).vehicles.find(t=>t.id===act.tankId&&t.nationId===nid);if(!t)return null;const units=Math.ceil((100-t.hp)/20);return mk(.5,units*70,{steel:units,machine_parts:units*2});}
  case 'TANK_CREW':return mk(.6,36);
  case 'TANK_STORE':return mk(.4);
  default:return null;
 }
}
function v08fActionLegal(w,nid,act){
 const n=w.nations[nid],a=w.armies.find(a=>a.id===act?.armyId),s=v08fEnsure(w);
 if(!n?.active||!hasTech(w,nid,'armored_combat_doctrine'))return false;
 if(act.type==='TANK_BUILD'){
  const b=v08fSite(w,nid);if(!b)return false;
  const input={iron:50,steel:8,machine_parts:10};
  return (!i1Active(w,n)||Object.entries(input).every(([g,q])=>i1Available(w,n,b.settlementId,g)>=q))&&
   (s.stocks[nid]||0)+v08fNationVehicles(w,nid)<Math.min(12,Math.max(2,Math.ceil(w.armies.filter(a=>a.nationId===nid).length/6)));
 }
 if(!a||a.nationId!==nid||!v08fSafeArmy(w,a))return false;
 const t=s.vehicles.find(t=>t.id===act.tankId&&t.nationId===nid&&t.armyId===a.id);
 switch(act.type){
  case 'TANK_DEPLOY':return (s.stocks[nid]||0)>0&&v08fTanks(w,a).length<V08F_SPEC.maxPerArmy&&
    ((manpower(a)+6<=150&&n.military.reserveReady>=6&&activeManpower(w,nid)+6<=militaryCapacity(w,nid))||e2ReserveLevyCrew(a)>=6)&&v08fEscort(a)>=30;
  case 'TANK_REPAIR':return !!t&&t.hp<100&&t.hp>0&&v08fSite(w,nid)&&
    (!i1Active(w,n)||i1Available(w,n,v08fSite(w,nid).settlementId,'steel')>=Math.ceil((100-t.hp)/20)&&
     i1Available(w,n,v08fSite(w,nid).settlementId,'machine_parts')>=Math.ceil((100-t.hp)/20)*2);
  case 'TANK_CREW':{const crew=t?v08fCrew(a,t):null,missing=crew?6-crew.manpower:0;return missing>0&&((manpower(a)+missing<=150&&n.military.reserveReady>=missing)||e2ReserveLevyCrew(a)>=missing);}
  case 'TANK_STORE':return !!t&&t.hp===100&&v08fCrew(a,t)?.manpower===6;
  default:return false;
 }
}
function v08fActionExecute(w,nid,act){
 if(!v08fActionLegal(w,nid,act))return {ok:false,reason:'전차 행동 조건 부족'};
 const price=v08fActionPrice(w,nid,act),n=w.nations[nid];if(!canAfford(n,price))return {ok:false,reason:'전차 비용·AP 부족'};
 const a=w.armies.find(a=>a.id===act.armyId),s=v08fEnsure(w),site=v08fSite(w,nid);
 if((act.type==='TANK_BUILD'||act.type==='TANK_REPAIR')&&i1Active(w,n)){
  const resources=Object.fromEntries(Object.entries(price.resources||{}).filter(([k])=>I_GOODS.includes(k)));
  if(!i1Can(w,n,site,resources))return {ok:false,reason:'전차 제조지 실물 재고 부족'};
  payCost(n,price,'military');i1Debit(w,n,site,resources);
 }else payCost(n,price,'military');
 if(act.type==='TANK_BUILD'){s.produced++;s.stocks[nid]=(s.stocks[nid]||0)+1;v08fLog(w,'BUILT',null,{nationId:nid});}
 if(act.type==='TANK_DEPLOY'){
  const crewId=`unit-${a.id}-tankcrew-${s.nextId}`;let culture;
  if(manpower(a)+6<=150&&n.military.reserveReady>=6){culture=d1CultureTake(n.military.reserveCulturePopulation,6);n.military.reserveReady-=6;}
  else culture=e2TransferReserveLevy(a,6);
  const crew=c3InitUnit({id:crewId,typeId:'tank_crew',weaponId:'tank_tools',armorId:'none',manpower:6,allocationWeight:6,culturePopulation:culture},w,nid);
  a.units.push(crew);a.deployment.back.push(crewId);
  const t={id:s.nextId++,nationId:nid,armyId:a.id,crewUnitId:crewId,hp:100,fueled:false,lastServicedDay:-1};
  s.vehicles.push(t);a.v08fTankIds??=[];a.v08fTankIds.push(t.id);s.stocks[nid]--;v08fLog(w,'DEPLOYED',t,{armyId:a.id});
 }
 if(act.type==='TANK_REPAIR'){
  const t=s.vehicles.find(t=>t.id===act.tankId);t.hp=100;v08fLog(w,'REPAIRED',t,{armyId:a.id});
 }
 if(act.type==='TANK_CREW'){
  const t=s.vehicles.find(t=>t.id===act.tankId),u=v08fCrew(a,t),count=6-u.manpower;
  let culture;if(manpower(a)+count<=150&&n.military.reserveReady>=count){culture=d1CultureTake(n.military.reserveCulturePopulation,count);n.military.reserveReady-=count;}
  else culture=e2TransferReserveLevy(a,count);d1CultureAdd(u.culturePopulation,culture);
  u.manpower+=count;u.allocationWeight+=count;u.trainingBatches.push({men:count,days:0});c3RefreshUnit(u);
  v08fLog(w,'CREW_REFILL',t,{armyId:a.id,count});
 }
 if(act.type==='TANK_STORE'){
  const t=s.vehicles.find(t=>t.id===act.tankId),u=v08fCrew(a,t);
  // Crew returns to real reserve population, not a second active troop group.
  const cultures=d1CultureTake(u.culturePopulation,u.manpower);d1CultureAdd(n.military.reserveCulturePopulation,cultures);n.military.reserveReady+=u.manpower;
  a.units=a.units.filter(x=>x!==u);a.deployment.back=a.deployment.back.filter(id=>id!==u.id);
  a.v08fTankIds=a.v08fTankIds.filter(id=>id!==t.id);s.vehicles=s.vehicles.filter(x=>x!==t);s.stocks[nid]=(s.stocks[nid]||0)+1;v08fLog(w,'STORED',t,{armyId:a.id});
 }
 n.actionStats[act.type]=(n.actionStats[act.type]||0)+1;w.changeSeq++;w.setupLocked=true;
 return {ok:true,type:act.type,armyId:act.armyId??null,tankId:act.tankId??null};
}
function v08fOnArmyRemoved(w,a,reason,captorId=null){
 const s=w.v08fArmor;if(!s||!a.v08fTankIds?.length)return;
 for(const t of v08fTanks(w,a)){
  const keep=reason==='DISBAND'&&a.status!=='DESTROYED'&&w.nations[a.nationId]?.active&&atSafeSettlement(w,a);
  const captured=reason==='SURRENDER'&&captorId!==null&&w.nations[captorId]?.active;
  if(keep||captured){const owner=captured?captorId:a.nationId;s.stocks[owner]=(s.stocks[owner]||0)+1;v08fLog(w,captured?'CAPTURED':'RETURNED',t,{receiverId:owner});}
  else{s.destroyed++;v08fLog(w,'DESTROYED_BY_REMOVAL',t,{reason});}
  s.vehicles=s.vehicles.filter(x=>x!==t);
 }
 a.v08fTankIds=[];
}
function v08fQuarter(w){
 const s=v08fEnsure(w);
 for(const t of s.vehicles){
  const a=w.armies.find(a=>a.id===t.armyId),n=w.nations[t.nationId];
  if(!a||!n?.active){v08fOnArmyRemoved(w,a||{id:t.armyId,v08fTankIds:[t.id],nationId:t.nationId,status:'DESTROYED'},'FIELD_LOSS');continue;}
  const inSupply=a.status!=='SAILING'&&hasSupplyLine(w,a);
  if(inSupply&&n.resources.coal>=2&&n.gold>=15){n.resources.coal-=2;n.gold-=15;t.fueled=true;t.lastServicedDay=w.dayIndex;}
  else{t.fueled=false;v08fLog(w,'FUEL_SHORT',t,{armyId:a.id});}
 }
 // One paid AI armored decision / nation / quarter. No free new units or artificial capacity.
 for(const n of w.nations){if(!n.active||n.controller!=='AI'||!hasTech(w,n.id,'armored_combat_doctrine'))continue;
  const owned=s.vehicles.filter(t=>t.nationId===n.id).sort((a,b)=>a.id-b.id);
  const repair=owned.find(t=>t.hp<100&&v08fActionLegal(w,n.id,{type:'TANK_REPAIR',armyId:t.armyId,tankId:t.id}));
  if(repair&&canExecuteNationAction(w,n.id,{type:'TANK_REPAIR',armyId:repair.armyId,tankId:repair.id})){
   executeNationAction(w,n.id,{type:'TANK_REPAIR',armyId:repair.armyId,tankId:repair.id});continue;
  }
  const refill=owned.find(t=>{const a=w.armies.find(a=>a.id===t.armyId);return (v08fCrew(a,t)?.manpower||0)<6&&v08fActionLegal(w,n.id,{type:'TANK_CREW',armyId:t.armyId,tankId:t.id});});
  if(refill&&canExecuteNationAction(w,n.id,{type:'TANK_CREW',armyId:refill.armyId,tankId:refill.id})){
   executeNationAction(w,n.id,{type:'TANK_CREW',armyId:refill.armyId,tankId:refill.id});continue;
  }
  const candidate=w.armies.filter(a=>a.nationId===n.id&&v08fSafeArmy(w,a)&&v08fEscort(a)>=30&&v08fTanks(w,a).length<2&&v08fActionLegal(w,n.id,{type:'TANK_DEPLOY',armyId:a.id}))
   .sort((a,b)=>v08fTanks(w,a).length-v08fTanks(w,b).length||b.morale-a.morale||a.id-b.id)[0];
  if(candidate&&(s.stocks[n.id]||0)>0&&canExecuteNationAction(w,n.id,{type:'TANK_DEPLOY',armyId:candidate.id})){
    executeNationAction(w,n.id,{type:'TANK_DEPLOY',armyId:candidate.id});continue;
  }
  if(canExecuteNationAction(w,n.id,{type:'TANK_BUILD'}))executeNationAction(w,n.id,{type:'TANK_BUILD'});
 }
}
// Independent vehicle plate, no human armor formula. Armor over penetration prevents hull damage.
function v08fTakeHit(w,t,pen,damage,source='BATTLE'){
 const a=w.armies.find(a=>a.id===t.armyId),escort=a?v08fEscort(a):0;
 const armor=escort>=30?125:escort>0?90:75;
 if(pen<armor)return {penetrated:false,destroyed:false,damage:0,crewLoss:0,armyId:a?.id??null};
 const applied=Math.min(t.hp,Math.max(0,Math.round(damage)));
 t.hp-=applied;let crewLoss=0;
 if(applied>0){
  const u=v08fCrew(a,t);
  if(u){const loss=Math.min(u.manpower,t.hp===0?2:applied>=35?1:0);if(loss){c3TakeLoss(u,loss,'BATTLE',w.dayIndex);crewLoss=loss;}}
  v08fLog(w,t.hp<=0?'DESTROYED_IN_BATTLE':'HULL_HIT',t,{source,damage:applied,hp:t.hp,armor});
  if(t.hp<=0){
    // Surviving real crew return to the reserve lane as regular soldiers.
    if(a&&u){u.typeId='levy';u.weaponId='basic_arms';u.armorId='none';u.trainingRequirementDays=0;u.trainedManpower=u.manpower;u.trainingBatches=[];u.training=100;
      a.deployment.back=a.deployment.back.filter(id=>id!==u.id);a.deployment.reserve.push(u.id);}
    const s=v08fEnsure(w);s.destroyed++;s.vehicles=s.vehicles.filter(x=>x!==t);if(a)a.v08fTankIds=a.v08fTankIds.filter(id=>id!==t.id);}
 }
 return {penetrated:true,destroyed:t.hp===0,damage:applied,crewLoss,armyId:a?.id??null};
}
function v08fTankTargets(w,e,side){return h1Live(w,e,side).flatMap(m=>{const a=h1Army(w,m.armyId);return v08fTanks(w,a).filter(t=>t.hp>0).map(t=>({t,a}));}).sort((x,y)=>x.t.id-y.t.id);}
function v08fPhasePlan(w,e,phase,side){
 const raw={power:0,shots:[],active:0};const enemies=v08fTankTargets(w,e,side==='attackers'?'defenders':'attackers');
 for(const m of h1Live(w,e,side)){
  const a=h1Army(w,m.armyId),n=w.nations[a.nationId];
  for(const t of v08fAlive(w,a)){
   const guard=v08fEscort(a),guardFactor=guard>=30?1:guard>0?.8:.55;
   const damageFactor=t.hp>70?1:t.hp>35?.85:.40;
   if(['OPENING','SUSTAINED'].includes(phase)){
    // A tank cannon spends one shell; industrial shell or exactly one legacy substitute.
    const industrial=(n.resources.artillery_shells||0)>=1;
    if(!industrial&&(n.resources.iron<2||n.gold<8))continue;
    // Coaxial MG consumes exactly one more iron and 2 gold per firing phase.
    if(industrial&&(n.resources.iron<1||n.gold<2))continue;
    if(industrial){n.resources.artillery_shells--;f2cTrackBattleShells(n,1);}
    else{n.resources.iron--;chargeMilitaryOperation(w,n.id,6,e.warId,'tank_shell');}
    n.resources.iron--;chargeMilitaryOperation(w,n.id,2,e.warId,'tank_mg_ammunition');
   }
   const p=V08F_SPEC[phase.toLowerCase()]*guardFactor*damageFactor*(.55+a.morale/180)*(a.supplyMultiplier??1);
   if(enemies.length&&['OPENING','SUSTAINED'].includes(phase)){
    raw.shots.push({target:enemies[(t.id+e.round)%enemies.length].t,pen:140,damage:30,source:'TANK_CANNON',vehicleId:t.id});
   }else raw.power+=p;
   raw.active++;
  }
 }
 return raw;
}
function v08fApplyShots(w,shots){const losses={};for(const x of shots)if(w.v08fArmor?.vehicles.includes(x.target)){const result=v08fTakeHit(w,x.target,x.pen,x.damage,x.source);if(result.crewLoss&&result.armyId!=null)losses[result.armyId]=(losses[result.armyId]||0)+result.crewLoss;}return losses;}
function v08fShieldBudget(w,e,side,budget,channels,phase){
 if(budget<=0||phase==='ARTILLERY')return budget;
 const tanks=v08fTankTargets(w,e,side).filter(x=>v08fReady(w,x.a,x.t));if(!tanks.length)return budget;
 const exposed=tanks.filter(x=>v08fEscort(x.a)>0);if(!exposed.length)return budget;
 // At most 22% of normal shots are intercepted, not duplicated. Infantry small arms
 // cannot hurt armored hull; strong machine modules with sufficient penetration can.
 const pct=Math.min(.22,.08+.06*exposed.length);
 const blocked=Math.min(budget,Math.round(budget*pct));
 if(blocked&&channels){
  const valid=[...channels].filter(([key,power])=>Number(key.split('|')[1])>=75&&power>0);
  if(valid.length){const best=Math.max(...valid.map(([key])=>Number(key.split('|')[1])));for(let i=0;i<blocked;i++)v08fTakeHit(w,exposed[i%exposed.length].t,best,2,'SMALL_ARMS');}
 }
 return budget-blocked;
}
function v08fMoraleShock(w,e){
 const sides=['attackers','defenders'];
 const active=side=>h1Live(w,e,side).reduce((sum,m)=>{const a=h1Army(w,m.armyId);return sum+v08fAlive(w,a).length;},0);
 const countA=active('attackers'),countB=active('defenders');
 if(!countA&&!countB)return;
 for(const [side,tanks] of [['attackers',countB],['defenders',countA]])if(tanks>0){
  const shock=Math.min(6,3*tanks);
  for(const m of h1Live(w,e,side)){const a=h1Army(w,m.armyId);a.morale=Math.max(0,a.morale-shock);}
 }
}
function v08fArtilleryShots(w,e,side,fired){
 const targets=v08fTankTargets(w,e,side==='attackers'?'defenders':'attackers');
 if(!targets.length||!fired)return {anti:0,shots:[]};
 const anti=Math.min(fired,Math.max(1,targets.length*2));const shots=[];
 for(let i=0;i<anti;i++)shots.push({target:targets[i%targets.length].t,pen:160,damage:40,source:'FIELD_ARTILLERY'});
 return {anti,shots};
}
function v08fValidate(w){
 const s=w.v08fArmor;if(!s||s.schema!==1||!Number.isSafeInteger(s.nextId)||s.nextId<1||!Number.isSafeInteger(s.produced)||!Number.isSafeInteger(s.destroyed)||s.produced<0||s.destroyed<0||!Array.isArray(s.vehicles)||!Array.isArray(s.history)||s.history.length>V08F_HISTORY_LIMIT||!s.stocks)return false;
 const seen=new Set(),crewUsed=new Set();let deployed=0,stored=0;
 for(const [id,q] of Object.entries(s.stocks)){if(!w.nations[Number(id)]||!Number.isSafeInteger(q)||q<0)return false;stored+=q;}
 for(const a of w.armies){const ids=a.v08fTankIds||[];if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length>2||ids.some(id=>!s.vehicles.some(t=>t.id===id&&t.armyId===a.id)))return false;}
 for(const t of s.vehicles){const a=w.armies.find(a=>a.id===t.armyId);if(!a||t.nationId!==a.nationId||!a.v08fTankIds?.includes(t.id)||seen.has(t.id)||!Number.isSafeInteger(t.id)||t.id<1||t.id>=s.nextId||!Number.isSafeInteger(t.hp)||t.hp<=0||t.hp>100||typeof t.fueled!=='boolean'||!Number.isSafeInteger(t.lastServicedDay))return false;
  seen.add(t.id);const crew=v08fCrew(a,t);if(!crew||crewUsed.has(crew.id)||crew.manpower<0||crew.manpower>6||!a.deployment.back.includes(crew.id))return false;crewUsed.add(crew.id);deployed++;
 }
 // Crew groups can't exist without physical assigned vehicles; no duplicate crew registration.
 for(const a of w.armies)for(const u of a.units)if(u.typeId==='tank_crew'&&!crewUsed.has(u.id))return false;
 return stored+deployed+s.destroyed===s.produced;
}

// --- src/sim/military-policy.js ---
/** V0.2B1: country-level military demography. No individual soldier objects. */
const militaryClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const newMilitaryState=()=>({barracksAiDiagnostics:[],mobilizationDiagnostics:[],e4RecoveryLastOrderDay:-120,reserveReady:0,training:[],specialistTrainingSpent:0,specialistTrainingSpentThisQuarter:0,specialistTrainingSpentLastQuarter:0,lastTrainingDay:-30,emergencyLastMusterDay:-30,unpaidQuarters:0,desertedLastQuarter:0,upkeepPaidLastQuarter:0,operationArrears:0,operationPaidThisQuarter:0,operationBilledThisQuarter:0,operationPaidLastQuarter:0,operationBilledLastQuarter:0,totalOperationPaid:0,barracksFinance:{billedLastQuarter:0,paidLastQuarter:0,unpaidLastQuarter:0,totalPaid:0,totalUnpaid:0}});
const militaryPopulation=(w,id)=>{
 const civilians=w.settlements.reduce((sum,s)=>sum+(s.ownerId===id?s.population:0),0);
 const n=w.nations[id];
 // Drafted trainees and active soldiers remain people: enlistment cannot shrink the denominator.
 return civilians+activeManpower(w,id)+(n?.military?.reserveReady||0)+(n?.military?.training||[]).reduce((sum,t)=>sum+t.amount,0);
};
const activeManpower=(w,id)=>w.armies.reduce((sum,a)=>sum+(a.nationId===id?a.units.reduce((n,u)=>n+u.manpower,0):0),0);
const militaryAtWar=(w,id)=>Boolean(warOfNation(w,id));
// V0.4E: paid barracks provide national training/mobilization/formation capacity.
const V04E_BARRACKS=Object.freeze([null,
 {training:40,slots:1,mobilization:.003,upkeep:80,gold:700,wood:55,stone:50,days:90,apUnits:20},
 {training:70,slots:1,mobilization:.005,upkeep:200,gold:1120,wood:90,stone:85,days:120,apUnits:30},
 {training:100,slots:2,mobilization:.007,upkeep:450,gold:1800,wood:145,stone:130,days:150,apUnits:40},
 {training:130,slots:2,mobilization:.0085,upkeep:850,gold:3000,wood:225,stone:205,days:180,apUnits:50},
 {training:160,slots:3,mobilization:.01,upkeep:1400,gold:5200,wood:365,stone:330,days:240,apUnits:60}]);
const v04eQuarterDay=w=>Math.floor(w.dayIndex/30)*30;
function v04eOwnedBarracks(w,id){return w.buildings.filter(b=>b.typeId==='barracks'&&w.tiles[b.tileId]?.ownerId===id);}
// V0.4E1: a redevelopment reservation is a future barracks even though its
// source building still has a civilian typeId. Count reservations before
// committing ANY new construction or conversion (nation + settlement).
// V0.4E2: ownership and operation are different. A detached legacy building
// remains a real asset, but cannot reserve a slot in a functioning settlement.
function v04e2LinkedBarracks(w,b,id){
 const t=w.tiles[b.tileId];
 return t?.ownerId===id&&!b.disconnected&&b.settlementId!==null&&
  t.settlementId===b.settlementId&&w.settlements.some(s=>s.id===b.settlementId&&s.ownerId===id);
}
function v04e2IsBarracksReservation(b){return b.typeId==='barracks'||b.status==='REDEVELOPING'&&b.redevelopTo==='barracks';}
function v04e1ReservedBarracks(w,id){
 return w.buildings.filter(b=>v04e2IsBarracksReservation(b)&&v04e2LinkedBarracks(w,b,id));
}
function v04e1BarracksSlotAvailable(w,id,settlementId){
 if(!w.settlements.some(s=>s.id===settlementId&&s.ownerId===id))return false;
 const reserved=v04e1ReservedBarracks(w,id);
 // Existing or incoming reservations consume a slot; disconnected assets do not.
 return reserved.length<3&&!reserved.some(b=>b.settlementId===settlementId);
}
// Stable ID order is intentionally retained, including after conquest or reconnection.
// Buildings above either limit remain physically present but never receive payment.
function v04eBarracksCandidates(w,id){
 const seen=new Set(),chosen=[];
 for(const b of v04eOwnedBarracks(w,id).sort((a,b)=>a.id-b.id)){
  if(!v04e2LinkedBarracks(w,b,id)||!['ACTIVE','UPGRADING'].includes(b.status)||
    w.tiles[b.tileId]?.occupiedBy!==null||seen.has(b.settlementId))continue;
  chosen.push(b);seen.add(b.settlementId);if(chosen.length===3)break;
 }
 return chosen;
}
function v04e1BarracksInventory(w,id){
 const built=v04eOwnedBarracks(w,id).sort((a,b)=>a.id-b.id),reserved=v04e1ReservedBarracks(w,id);
 const linked=built.filter(b=>v04e2LinkedBarracks(w,b,id)),detached=built.length-linked.length;
 const counted=[],settlements=new Set();
 for(const b of linked){if(counted.length>=3||settlements.has(b.settlementId))continue;
  counted.push(b);settlements.add(b.settlementId);
 }
 return {built:built.length,constructing:built.filter(b=>b.status==='CONSTRUCTING').length,
  pending:reserved.filter(b=>b.typeId!=='barracks').length,
  committed:reserved.length,registered:counted.length,detached,
  overLimit:linked.length-counted.length};
}
const V04E2_BARRACKS_EVENTS_MAX=120;
function v04e2RegisterBarracksEvent(w,kind,ids,settlementId,buildings){
 if(!buildings.length)return;
 w.barracksEvents??=[];
 w.barracksEvents.push({dayIndex:w.dayIndex,kind,oldOwnerId:ids[0],newOwnerId:ids[1],settlementId,
  buildingIds:buildings.map(b=>b.id).sort((a,b)=>a-b)});
 if(w.barracksEvents.length>V04E2_BARRACKS_EVENTS_MAX)w.barracksEvents.splice(0,w.barracksEvents.length-V04E2_BARRACKS_EVENTS_MAX);
}
function v04e2BarracksEventsCsv(w){
 const rows=[['dayIndex','year','kind','oldOwnerId','newOwnerId','settlementId','buildingIds']];
 for(const e of w.barracksEvents||[])rows.push([e.dayIndex,Math.floor(e.dayIndex/120)+1,e.kind,e.oldOwnerId??'',e.newOwnerId??'',e.settlementId??'',e.buildingIds.join('|')]);
 return rows.map(row=>row.join(',')).join('\r\n');
}
// F4D1: Collect owned, linked and reserved barracks in one buildings pass.
// Preserve old selection by ascending building id, three slots and a single
// barracks per settlement; no stateful cache, no RNG, no altered payment rules.
function v04eBarracksEffects(w,id){
 const settlementsOwned=new Set();for(const s of w.settlements)if(s.ownerId===id)settlementsOwned.add(s.id);
 const built=[],linked=[],reserved=[];
 for(const b of w.buildings){
  const t=w.tiles[b.tileId];
  const isBarracks=b.typeId==='barracks';
  const owned=isBarracks&&t?.ownerId===id;
  if(owned)built.push(b);
  if(!(isBarracks||b.status==='REDEVELOPING'&&b.redevelopTo==='barracks'))continue;
  const isLinked=t?.ownerId===id&&!b.disconnected&&b.settlementId!==null&&t.settlementId===b.settlementId&&settlementsOwned.has(b.settlementId);
  if(isLinked){reserved.push(b);if(owned)linked.push(b);}
 }
 built.sort((a,b)=>a.id-b.id);linked.sort((a,b)=>a.id-b.id);
 const counted=new Set();for(const b of linked){if(counted.size>=3)break;counted.add(b.settlementId);}
 const selected=[];const seen=new Set();for(const b of built){
   if(selected.length===3)break;
   const t=w.tiles[b.tileId];
   if(!linked.some(v=>v.id===b.id)||!['ACTIVE','UPGRADING'].includes(b.status)||t?.occupiedBy!==null||seen.has(b.settlementId))continue;
   selected.push(b);seen.add(b.settlementId);
 }
 const operational=selected.filter(b=>b.barracksPaidQuarter===v04eQuarterDay(w));
 const stats={built:built.length,constructing:built.filter(b=>b.status==='CONSTRUCTING').length,pending:reserved.filter(b=>b.typeId!=='barracks').length,committed:reserved.length,registered:counted.size,detached:built.length-linked.length,overLimit:linked.length-counted.size,eligible:selected.length,paid:operational.length,training:0,slots:0,mobilization:0,upkeep:0};
 for(const b of operational){const d=V04E_BARRACKS[b.level];stats.training+=d.training*(e2FocusActive(w,id,b)?E2_FOCUS_FACTOR:1);stats.slots+=d.slots;stats.mobilization+=d.mobilization;stats.upkeep+=d.upkeep;}
 stats.training=Math.min(480,Math.floor(stats.training));stats.mobilization=Math.min(.03,stats.mobilization);return stats;
}
function militaryCapacity(w,id){
 const n=w.nations[id];if(!n?.active)return 0;
 const pop=militaryPopulation(w,id),investment=(w.aiProfiles[n.aiProfileId]?.military?.militaryInvestment??50)/100;
 const unlocked=n.technology?.unlocked||[];
 const tiers=['military_drills','equipment_standardization','tactical_advances'].filter(t=>unlocked.includes(t)).length;
 const mobilization=techBonus(w,id,'mobilizationBonus');
 const ratio=.0475+(investment-.5)*.045+(militaryAtWar(w,id)?.030:0)+tiers*.006+v04eBarracksEffects(w,id).mobilization+mobilization;
 return Math.max(12,Math.floor(pop*militaryClamp(ratio,.015,.16+mobilization)));
}
/** D5: preserve the complete pre-existing limit at small populations.
 * At large populations there is no fixed 16-army ceiling; growth is sublinear.
 * Every new cohort still consumes real trained reserves, equipment and Gold.
 */
function armyLimit(w,id){
 const n=w.nations[id];if(!n?.active)return 0;
 const pop=militaryPopulation(w,id);
 const tiers=['military_drills','equipment_standardization','tactical_advances'].filter(t=>n.technology?.unlocked?.includes(t)).length;
 const original=militaryClamp(3+Math.floor(pop/1900)+tiers,3,16);
 const baseline=pop<=30000?original+v04eBarracksEffects(w,id).slots:
  Math.max(original,3+tiers+Math.floor(2*Math.sqrt(pop/1000)))+v04eBarracksEffects(w,id).slots;
 return Math.floor(baseline*(1+techBonus(w,id,'armyLimitBonus')));
}
function trainingRate(w,id){
 const pop=militaryPopulation(w,id),tiers=['military_drills','equipment_standardization','tactical_advances'].filter(t=>w.nations[id].technology?.unlocked?.includes(t)).length;
 return militaryClamp(12+Math.floor(pop*.025)+tiers*12,12,160)+v04eBarracksEffects(w,id).training+techBonus(w,id,'trainingRateBonus');
}
function trainingDays(w,id){
 const unlocked=w.nations[id].technology?.unlocked||[];
 return Math.max(30,60-(unlocked.includes('military_drills')?15:0)-(unlocked.includes('tactical_advances')?15:0));
}
const pendingManpower=n=>n.military.training.reduce((sum,t)=>sum+t.amount,0);
function mayTrain(w,id,amount){
 const n=w.nations[id];if(!n?.active||!Number.isInteger(amount)||amount<12||amount>trainingRate(w,id)||!n.military)return false;
 if(n.military.lastTrainingDay===Math.floor(w.dayIndex/30)*30)return false;
 const stocked=activeManpower(w,id)+n.military.reserveReady+pendingManpower(n);
 return stocked+amount<=militaryCapacity(w,id)+Math.max(12,Math.floor(militaryCapacity(w,id)*.2));
}
function finishTrainingQuarter(w){
 for(const n of w.nations){
   if(!n.active)continue;
   const ready=n.military.training.filter(t=>t.completeDay<=w.dayIndex);
   if(ready.length){
      for(const t of ready)d1CultureAdd(n.military.reserveCulturePopulation,t.culturePopulation);
      n.military.reserveReady+=ready.reduce((sum,t)=>sum+t.amount,0);n.military.training=n.military.training.filter(t=>t.completeDay>w.dayIndex);w.changeSeq++;}
 }
}
/** Planned quarterly Gold cost, evaluated from army state at the same snapshot as the economy. */
function militaryUpkeep(w,id){
 const war=militaryAtWar(w,id);
 let upkeep=0;
 for(const army of w.armies){
  if(army.nationId!==id)continue;
  const men=army.units.reduce((sum,u)=>sum+u.manpower,0);
  const tile=w.tiles[army.tileId];
  const forward=war&&(tile?.ownerId!==id||tile?.occupiedBy!==null&&tile.occupiedBy!==id);
  upkeep+=army.units.reduce((sum,u)=>sum+u.manpower*(LOADOUTS[u.typeId]?.upkeep||1),0)*(forward?3.5:war?2.25:.75);
 }
 return Math.ceil(upkeep);
}

/** Real operation charges: treasury never becomes negative; unpaid invoices persist.
 * Financial records use incurred cost, not a duplicate charge when arrears are later paid. */
function chargeMilitaryOperation(w,id,amount,warId=null,kind='operation'){
 const n=w.nations[id];if(!n||!Number.isFinite(amount)||amount<0)throw Error('군사 작전비 오류');
 const cost=Math.max(0,Math.ceil(amount));if(!cost)return {cost:0,paid:0,unpaid:0};
 const arrearsBefore=n.military.operationArrears||0;
 const paid=Math.min(n.gold,cost);n.gold-=paid;
 n.military.operationArrears=(n.military.operationArrears||0)+cost-paid;
 n.military.operationPaidThisQuarter=(n.military.operationPaidThisQuarter||0)+paid;
 n.military.operationBilledThisQuarter=(n.military.operationBilledThisQuarter||0)+cost;
 n.military.totalOperationPaid=(n.military.totalOperationPaid||0)+paid;
 const war=w.wars.find(v=>v.id===warId);
 if(war){war.militaryCosts??={};war.operationalCosts??={};war.militaryCosts[id]=(war.militaryCosts[id]||0)+cost;war.operationalCosts[id]=(war.operationalCosts[id]||0)+cost;}
 if(paid<cost){for(const a of w.armies.filter(a=>a.nationId===id)){a.morale=Math.max(5,a.morale-2);}}
 const invoice={cost,paid,unpaid:cost-paid,kind};
 v07d3ChargeResult(w,id,warId,kind,arrearsBefore,invoice);
 return invoice;
}


// --- src/sim/buildings.js ---
/** Light V0.1E1: map-anchored facilities, no worker/person or logistics entities. */

const BUILDINGS=Object.freeze({
  house:{label:'주택',symbol:'⌂',terrains:['plain','grass','forest','rock','mountain'],days:30,ap:1,gold:28,materials:{wood:7,stone:1},capacity:75},
  farm:{label:'농장',symbol:'✿',terrains:['plain','grass','forest'],days:30,ap:1,gold:28,materials:{wood:6,stone:1},produces:{food:76}},
  lumber:{label:'벌목장',symbol:'♣',terrains:['forest','grass'],days:30,ap:1,gold:25,materials:{wood:3,stone:1},produces:{wood:24}},
  quarry:{label:'채석장',symbol:'◆',terrains:['rock','mountain'],days:60,ap:1,gold:36,materials:{wood:7,stone:0},produces:{stone:18}},
  coal_pit:{label:'탄광',symbol:'⛏',terrains:['rock','mountain','forest','grass','plain'],days:90,ap:2,gold:650,materials:{wood:22,stone:18,iron:6}},
  factory:{label:'기계식 공장',symbol:'▣',terrains:['plain','grass','forest','rock'],days:150,ap:2,gold:1900,materials:{wood:75,stone:45,iron:65}},
  steelworks:{label:'기계식 제강소',symbol:'▤',terrains:['plain','grass','forest','rock'],days:240,ap:6,gold:4200,materials:{wood:85,stone:70,iron:110,machine_parts:40}},
  steam_pump:{label:'증기 양수장',symbol:'♧',terrains:['plain','grass','forest','rock'],days:180,ap:4,gold:2600,materials:{wood:60,stone:50,iron:30,machine_parts:24,steel:24}},
  arsenal:{label:'군수 제작소',symbol:'▥',terrains:['plain','grass','forest','rock'],days:210,ap:5,gold:2800,materials:{wood:70,stone:60,iron:50,machine_parts:30,steel:20}},
  mine:{label:'광산',symbol:'⚒',terrains:['rock','mountain'],days:60,ap:1,gold:45,materials:{wood:10,stone:6},produces:{iron:9}},
  fort:{label:'요새',symbol:'♜',terrains:['plain','grass','forest','rock','mountain'],days:180,ap:3,gold:350,materials:{wood:50,stone:60},defense:25,firepower:60},
  academy:{label:'학술원',symbol:'✧',terrains:['plain','grass','forest','rock','mountain'],days:60,ap:1,gold:50,materials:{wood:10,stone:8},knowledge:7},
  workshop:{label:'수공업 공방',symbol:'⚙',terrains:['plain','grass','forest','rock'],days:90,ap:2,gold:480,materials:{wood:36,stone:25,iron:12}},
  barracks:{label:'병영',symbol:'⚑',terrains:['plain','grass','forest','rock','mountain'],days:90,ap:2,gold:700,materials:{wood:55,stone:50}}
});
// G2: existing Lv.1–3 are identical to G1; advanced levels use explicit tables.
const MAX_BUILDING_LEVEL=5;
// F2A5: advanced farms alone may reach Lv.7. Every other facility retains its existing cap.
const F2A5_MAX_FARM_LEVEL=7;
function maxBuildingLevel(typeId){return typeId==='farm'?F2A5_MAX_FARM_LEVEL:typeId==='factory'?4:F2B_INDUSTRIAL_TYPES.includes(typeId)?1:MAX_BUILDING_LEVEL;}
const F2B_INDUSTRIAL_TYPES=Object.freeze(['steelworks','steam_pump','arsenal']);
const G2_LEVEL_OUTPUT=Object.freeze({
 house:[0,75,150,225,300,390],farm:[0,76,152,228,345,495,535,575],
 lumber:[0,24,48,72,105,145],quarry:[0,18,36,54,80,112],
 mine:[0,9,18,27,40,56],academy:[0,7,14,21,30,42],
 fortDefense:[0,25,50,75,105,145],fortFirepower:[0,60,120,180,245,335]
});
const G2_LEVEL_TECH=Object.freeze({
 house:['structural_reinforcement','high_density_housing'],
 farm:['multiple_cropping','precision_cultivation'],
 lumber:['construction_management','advanced_transport'],
 quarry:['precision_quarrying','rock_cutting'],
 mine:['deep_mining','ore_refining'],
 academy:['urban_redevelopment','construction_management'],
  fort:['structural_reinforcement','alloy_processing'],
  barracks:['tactical_advances','steelmaking']
});
const G2_ADVANCED_COST=Object.freeze({
 house:[null,null,null,null,{gold:450,wood:100,stone:25,apUnits:30,days:150},{gold:1050,wood:250,stone:75,apUnits:45,days:240}],
 farm:[null,null,null,null,{gold:460,wood:100,stone:25,apUnits:30,days:150},{gold:1150,wood:260,stone:80,apUnits:45,days:240},
  {gold:1600,wood:320,stone:110,apUnits:50,days:300},{gold:2400,wood:450,stone:155,apUnits:60,days:360}],
 lumber:[null,null,null,null,{gold:450,wood:90,stone:22,apUnits:30,days:150},{gold:1000,wood:220,stone:65,apUnits:45,days:240}],
 quarry:[null,null,null,null,{gold:600,wood:130,stone:10,apUnits:35,days:180},{gold:1450,wood:310,stone:28,apUnits:50,days:270}],
 mine:[null,null,null,null,{gold:780,wood:155,stone:95,apUnits:35,days:180},{gold:1850,wood:360,stone:220,apUnits:50,days:270}],
 workshop:[null,null,{gold:700,wood:70,stone:42,iron:25,apUnits:25,days:120},{gold:1200,wood:120,stone:75,iron:42,apUnits:35,days:180}],
 factory:[null,null,{gold:2250,wood:65,stone:35,iron:80,machine_parts:4,apUnits:20,days:180},{gold:3800,wood:95,stone:55,iron:140,machine_parts:10,apUnits:25,days:240},{gold:6000,wood:145,stone:85,iron:225,machine_parts:20,steel:12,apUnits:35,days:300}],
 academy:[null,null,null,null,{gold:750,wood:145,stone:100,apUnits:35,days:180},{gold:1800,wood:345,stone:240,apUnits:50,days:270}]
});
function g2LevelUnlocked(w,nationId,typeId,nextLevel){
  if(nextLevel>maxBuildingLevel(typeId))return false;
  if(typeId==='coal_pit')return false;
  // F2A5: gate the two farm-only advanced levels on existing, already researched technologies.
  if(typeId==='farm'&&nextLevel>=6)return nextLevel===6?hasTech(w,nationId,'precision_cultivation'):
    nextLevel===7&&hasTech(w,nationId,'improved_farm_tools');
  if(typeId==='factory')return nextLevel>=2&&nextLevel<=3&&hasTech(w,nationId,'mechanized_manufacturing')||nextLevel===4&&w.nations[nationId]?.civilization?.era==='industrial_modern'&&w.nations[nationId].civilization.stage>=3&&['mechanized_manufacturing','industrial_process_standardization','industrial_quality_control'].every(id=>hasTech(w,nationId,id));
  if(typeId==='workshop')return nextLevel===2&&hasTech(w,nationId,'professional_workshops')||nextLevel===3&&hasTech(w,nationId,'precision_metalworking');
  if(typeId==='barracks')return nextLevel>=2&&nextLevel<=5&&(nextLevel<=3||hasTech(w,nationId,nextLevel===4?'tactical_advances':'steelmaking'));
  if(nextLevel<=3)return true;
  if(nextLevel>maxBuildingLevel(typeId))return false;
  return hasTech(w,nationId,G2_LEVEL_TECH[typeId]?.[nextLevel-4]);
}
function g2LevelLabor(level){return level<=3?level:level===4?3.5:4.2;}
function g2LevelValue(typeId,level){return G2_LEVEL_OUTPUT[typeId]?.[level]??0;}
function g2FortUpkeep(level){return [0,15,40,100,240,550][level]||0;}

const BUILDING_TILE_SLOTS=2;
const DEFENSE_TILE_SLOTS=1;
function generalTileSlotLimit(w,nationId){return BUILDING_TILE_SLOTS+Math.min(4,techBonus(w,nationId,'buildingSlots'));}
function allStructures(w){return [...w.buildings,...(w.defenses||[])];}
function getStructure(w,id){return w.buildings.find(b=>b.id===id)||(w.defenses||[]).find(b=>b.id===id);}
function defenseTileSlotsUsed(w,tid){return (w.defenses||[]).filter(b=>b.tileId===tid).length;}
/** F3G structural health is not regional resistance or regional firepower. */
function fortMaxHP(d){return F3G_FORT_HP[d.level]||100;}
function fortEffective(d){return d.typeId==='fort'&&d.status!=='CONSTRUCTING'&&d.hp>0;}
function repairFortPrice(d){
  const ratio=Math.max(0,Math.min(1,(fortMaxHP(d)-d.hp)/fortMaxHP(d)));
  return {apUnits:10,gold:Math.max(1,Math.ceil(220*ratio*(d.level<=3?1:d.level===4?2.2:4.5))),knowledge:0,
    resources:{wood:Math.max(1,Math.ceil(35*ratio*(d.level<=3?1:d.level===4?2:3.5))),stone:Math.max(1,Math.ceil(48*ratio*(d.level<=3?1:d.level===4?2:3.5)))}};
}
function fortRepairLegal(w,nationId,id){
  const d=(w.defenses||[]).find(d=>d.id===id),t=d&&w.tiles[d.tileId];
  return Boolean(d&&t&&t.ownerId===nationId&&t.occupiedBy===null&&d.status==='ACTIVE'&&
    d.hp>=0&&d.hp<fortMaxHP(d)&&!d.repair);
}
function damageFortAt(w,tileId,progress){
  const t=w.tiles[tileId];if(!t||t.ownerId===null)return 0;
  let total=0;
  for(const d of w.defenses||[]){
    if(d.tileId!==tileId||!fortEffective(d))continue;
    const loss=Math.max(1,Math.ceil(progress*1.1)),before=d.hp;
    d.hp=Math.max(0,before-loss);total+=before-d.hp;
    if(d.hp===0){d.zeroHpSince=w.dayIndex;
      recordActionEvent(w,`(${t.x}, ${t.y}) 요새가 파손되어 방어선이 단절되었습니다.`,'war');}
  }
  i2DamageAt(w,tileId,progress); // I2 independent infrastructure under real siege/combat damage
  if(total)w.changeSeq++;
  return total;
}
function nextFortProjectDay(w){
  let next=Infinity;
  for(const d of w.defenses||[]){
    if(d.repair)next=Math.min(next,d.repair.completeDay);
    if(d.hp===0&&d.zeroHpSince!==null)next=Math.min(next,d.zeroHpSince+F3G_FORT_RUIN_DAYS);
  }
  return next;
}
function processFortProjects(w){
  let changed=false;
  for(const d of w.defenses||[]){
    if(d.repair&&w.dayIndex>=d.repair.completeDay){
      if(w.tiles[d.tileId]?.ownerId===d.repair.ownerId&&w.tiles[d.tileId].occupiedBy===null){
        d.hp=Math.min(fortMaxHP(d),d.hp+d.repair.restoreHp);
        if(d.hp>0)d.zeroHpSince=null;
      }
      delete d.repair;
      changed=true;
    }
  }
  const expired=(w.defenses||[]).filter(d=>d.hp===0&&d.zeroHpSince!==null&&
    w.dayIndex-d.zeroHpSince>=F3G_FORT_RUIN_DAYS);
  if(expired.length){
    const ids=new Set(expired.map(d=>d.id));
    w.defenses=w.defenses.filter(d=>!ids.has(d.id));
    for(const d of expired)recordActionEvent(w,`요새 (${w.tiles[d.tileId].x}, ${w.tiles[d.tileId].y})가 수리되지 않아 완전히 붕괴했습니다.`,'war');
    changed=true;
  }
  if(changed)w.changeSeq++;
}
/** On peaceful annexation of a former civilian site, it is a preserved but dormant shell. */
function detachCededTile(w,tileId,recipientId){
  const t=w.tiles[tileId],oldId=t.settlementId;
  if(oldId!==null){const s=w.settlements.find(s=>s.id===oldId);
    if(!s||s.coreTileId===tileId)throw Error('정착지 중심은 부분 양도할 수 없습니다.');
    s.tileIds=s.tileIds.filter(id=>id!==tileId);
    for(const b of w.buildings)if(b.tileId===tileId){b.settlementId=null;b.disconnected=true;
      if(b.status!=='ACTIVE')b.pausedRemainingDays=Math.max(1,b.completeDay-w.dayIndex);}
  }
  const detachedBarracks=w.buildings.filter(b=>b.tileId===tileId&&b.typeId==='barracks');
  const previousOwner=t.ownerId;
  e2OnDetachedTile(w,previousOwner,tileId);
  t.ownerId=recipientId;t.settlementId=null;t.occupiedBy=null;e5InvalidateBorders(w);
  v04e2RegisterBarracksEvent(w,'DETACH',[previousOwner,recipientId],oldId,detachedBarracks);
  for(const d of w.defenses||[])if(d.tileId===tileId){d.settlementId=null;delete d.repair;}
  refreshApCaps(w); // G1: territorial peace updates AP ceilings immediately.
}
function reconnectAnnexedFacilities(w,tileId,settlementId){
  const restoredBarracks=w.buildings.filter(b=>b.tileId===tileId&&b.disconnected&&b.typeId==='barracks');
  for(const b of w.buildings)if(b.tileId===tileId&&b.disconnected){b.settlementId=settlementId;b.disconnected=false;
    if(b.pausedRemainingDays){b.completeDay=w.dayIndex+b.pausedRemainingDays;delete b.pausedRemainingDays;}}
  for(const d of w.defenses||[])if(d.tileId===tileId)d.settlementId=settlementId;
  v04e2RegisterBarracksEvent(w,'RECONNECT',[w.tiles[tileId]?.ownerId,w.tiles[tileId]?.ownerId],settlementId,restoredBarracks);
}


const relativeYield=(kind,terrain)=>{
  if(kind==='farm')return terrain==='plain'?1.2:terrain==='grass'?1:.65;
  if(kind==='lumber')return terrain==='forest'?1.25:.65;
  if(kind==='quarry')return terrain==='mountain'?1.2:1;
  if(kind==='mine')return terrain==='mountain'?1.25:1;
  return 1;
};
function facilityOutput(building,terrain){
  const type=BUILDINGS[building.typeId];if(!type||(building.status==='CONSTRUCTING'||building.status==='REDEVELOPING')||building.disconnected||(building.typeId==='fort'&&building.hp<=0))return null;
  const level=building.level;
  const output={capacity:building.typeId==='house'?g2LevelValue('house',level):0,
    defense:building.typeId==='fort'?g2LevelValue('fortDefense',level):0,
    firepower:building.typeId==='fort'?g2LevelValue('fortFirepower',level):0,
    knowledge:building.typeId==='academy'?g2LevelValue('academy',level):0,
    produced:{food:0,wood:0,stone:0,iron:0}};
  for(const [key] of Object.entries(type.produces||{}))output.produced[key]=Math.floor(g2LevelValue(building.typeId,level)*relativeYield(building.typeId,terrain));
  return output;
}
function settlementHousing(world,s){
  const basic=45+s.tileIds.length*18+Math.floor(s.development*.85)+(s.inheritedHousing||0);
  const housing=world.buildings.filter(b=>b.settlementId===s.id).reduce((sum,b)=>sum+(facilityOutput(b,world.tiles[b.tileId]?.terrain)?.capacity||0),0);
  return Math.max(1,Math.floor((basic+housing)*(1+techBonus(world,s.ownerId,'housing'))));
}
function settlementBuildings(world,settlementId){return allStructures(world).filter(b=>b.settlementId===settlementId);}
function buildingTileSlotsUsed(world,tid){return world.buildings.filter(b=>b.tileId===tid&&!b.industrialSlot).length;}
function f2bIndustrialSlotFree(w,settlementId){return !w.buildings.some(b=>b.industrialSlot&&b.settlementId===settlementId);}
function f2bCanBuild(w,id,type){return w.nations[id]?.civilization?.era==='industrial_modern'&&(type==='steelworks'?hasTech(w,id,'steelmaking')&&hasTech(w,id,'coal_extraction')&&hasTech(w,id,'mechanized_manufacturing'):type==='steam_pump'?hasTech(w,id,'steam_engineering')&&hasTech(w,id,'irrigation_networks')&&hasTech(w,id,'mechanized_manufacturing'):type==='arsenal'?hasTech(w,id,'mechanized_manufacturing')&&hasTech(w,id,'steelmaking')&&hasTech(w,id,'field_artillery_casting'):false);}
/** F4D3: exact, quarter-local counts of all physical sites (including disconnected
 * buildings). Do not persist or carry this index across nation turns: military,
 * civil actions and ownership changes can invalidate site legality mid-quarter.
 * The historical order of the building arrays is never changed.
 */
function f4d3SiteUsage(world){
  const generalUsed=new Map(),defenseUsed=new Map();
  for(const b of world.buildings)if(!b.industrialSlot)generalUsed.set(b.tileId,(generalUsed.get(b.tileId)||0)+1);
  for(const b of world.defenses||[])defenseUsed.set(b.tileId,(defenseUsed.get(b.tileId)||0)+1);
  return {generalUsed,defenseUsed};
}
function buildingSiteLegal(world,nationId,action,siteUsage=null){
  const s=world.settlements.find(s=>s.id===action.settlementId&&s.ownerId===nationId);
  const tile=world.tiles[action.targetTileId],type=BUILDINGS[action.buildingType];
  if(action.buildingType==='workshop'&&!hasTech(world,nationId,'guild_organization'))return false;
  if(action.buildingType==='factory'&&!f2FactoryUnlocked(world,nationId))return false;
  if(action.buildingType==='coal_pit'&&!hasTech(world,nationId,'coal_extraction'))return false;
  if(F2B_INDUSTRIAL_TYPES.includes(action.buildingType)&&!f2bCanBuild(world,nationId,action.buildingType))return false;
  if(action.buildingType==='barracks'&&(!hasTech(world,nationId,'military_drills')||!v04e1BarracksSlotAvailable(world,nationId,action.settlementId)))return false;
  const special=F2B_INDUSTRIAL_TYPES.includes(action.buildingType);
  const used=siteUsage?(siteUsage.generalUsed.get(tile?.id)||0):buildingTileSlotsUsed(world,tile?.id);
  const normal=used<generalTileSlotLimit(world,nationId);
  const dedicated=special&&f2bIndustrialSlotFree(world,action.settlementId);
  const slot=action.buildingType==='fort'?(siteUsage?(siteUsage.defenseUsed.get(tile?.id)||0):defenseTileSlotsUsed(world,tile?.id))<DEFENSE_TILE_SLOTS:
    (action.industrialSlot===true?dedicated:(normal||dedicated));
  if(action.industrialSlot===true&&!special)return false;
  if(['steam_pump','arsenal'].includes(action.buildingType)&&world.buildings.some(b=>b.settlementId===action.settlementId&&(b.typeId===action.buildingType||b.redevelopTo===action.buildingType)))return false;
  return Boolean((action.buildingType==='fort'?(action.settlementId===null||action.settlementId===undefined||s?.tileIds.includes(tile?.id)):s?.tileIds.includes(tile?.id))&&tile&&type&&tile.ownerId===nationId&&tile.occupiedBy===null&&type.terrains.includes(tile.terrain)&&slot);
}
function upgradeSiteLegal(world,nationId,action){
  const building=getStructure(world,action.buildingId),s=building&&world.settlements.find(s=>s.id===building.settlementId);
  const tile=building&&world.tiles[building.tileId];
  return Boolean(building&&(!building.disconnected)&&(building.typeId==='fort'&&building.settlementId===null||s?.ownerId===nationId)&&tile?.ownerId===nationId&&tile.occupiedBy===null&&
    building.status==='ACTIVE'&&building.level<maxBuildingLevel(building.typeId)&&g2LevelUnlocked(world,nationId,building.typeId,building.level+1)&&(building.typeId!=='fort'||building.hp>0&&!building.repair));
}
const G1_FORT_PRICES=Object.freeze([null,
  {gold:900,wood:100,stone:120,apUnits:30,days:180},
  {gold:2700,wood:300,stone:360,apUnits:50,days:300},
  {gold:8100,wood:900,stone:1080,apUnits:80,days:480},
  {gold:16200,wood:1800,stone:2160,apUnits:80,days:660},
  {gold:36000,wood:4200,stone:5040,apUnits:80,days:900}]);
function buildingDays(typeId,level=1){if(typeId==='barracks')return V04E_BARRACKS[level]?.days;return typeId==='fort'?G1_FORT_PRICES[level]?.days:(G2_ADVANCED_COST[typeId]?.[level]?.days??BUILDINGS[typeId].days);}
function v04dConstructionDays(w,nationId,typeId,baseDays,redevelopment=false){
  const discount=Math.min(.6,techBonus(w,nationId,redevelopment?'redevelopmentSpeed':'buildSpeed'));
  const medieval=(CIVILIZATION_ERAS[w.nations[nationId]?.civilization?.era]?.order??0)>=1&&typeId!=='fort';
  return Math.ceil(baseDays*(1-discount)*(medieval?.95:1));
}
function buildPrice(typeId,level=1){
  const type=BUILDINGS[typeId];if(!type)return null;
  if(typeId==='barracks'){const b=V04E_BARRACKS[level];return b?{apUnits:b.apUnits,gold:b.gold,knowledge:0,resources:{wood:b.wood,stone:b.stone}}:null;}
  if(typeId==='fort'){
    const f=G1_FORT_PRICES[level];if(!f)return null;
    return {apUnits:f.apUnits,gold:f.gold,knowledge:0,resources:{wood:f.wood,stone:f.stone}};
  }
  if(level<1||level>maxBuildingLevel(typeId))return null;
  const advanced=G2_ADVANCED_COST[typeId]?.[level];
  if(advanced)return {apUnits:advanced.apUnits,gold:advanced.gold,knowledge:0,
    resources:{wood:advanced.wood,stone:advanced.stone,...(advanced.iron?{iron:advanced.iron}:{}),...(advanced.machine_parts?{machine_parts:advanced.machine_parts}:{}),...(advanced.steel?{steel:advanced.steel}:{})}};
  const multiplier=level===1?1:level===2?1.6:2.3;
  return {apUnits:Math.floor(type.ap*10*multiplier+1e-8),gold:Math.ceil(type.gold*multiplier),knowledge:0,
    resources:Object.fromEntries(Object.entries(type.materials).map(([key,value])=>[key,Math.ceil(value*multiplier)]))};
}

/** G: replace one existing civil facility without creating a new slot or fabricating materials. */
function redevelopmentLegal(w,nationId,action){
  // A military-trained country may convert a surplus civilian site into barracks
  // even when its older settlements have no free general-building slots.
  const militaryRetrofit=action.buildingType==='barracks';
  if(!hasTech(w,nationId,'urban_redevelopment')&&!militaryRetrofit)return false;
  if(militaryRetrofit&&(!hasTech(w,nationId,'military_drills')||!v04e1BarracksSlotAvailable(w,nationId,w.buildings.find(b=>b.id===action.buildingId)?.settlementId)))return false;
  const b=w.buildings.find(x=>x.id===action.buildingId),type=BUILDINGS[action.buildingType];
  if(action.buildingType==='workshop'&&!hasTech(w,nationId,'guild_organization'))return false;
  if(action.buildingType==='factory'&&!f2FactoryUnlocked(w,nationId))return false;
  if(action.buildingType==='coal_pit'&&!hasTech(w,nationId,'coal_extraction'))return false;
  if(F2B_INDUSTRIAL_TYPES.includes(action.buildingType)&&!f2bCanBuild(w,nationId,action.buildingType))return false;
  if(['steam_pump','arsenal'].includes(action.buildingType)&&w.buildings.some(x=>x.settlementId===w.buildings.find(b=>b.id===action.buildingId)?.settlementId&&(x.typeId===action.buildingType||x.redevelopTo===action.buildingType)))return false;
  if(!b||b.disconnected||b.status!=='ACTIVE'||!type||b.typeId===action.buildingType||action.buildingType==='fort')return false;
  if(action.buildingType==='factory'&&(b.typeId!=='workshop'||b.level<3))return false;
  if(F2B_INDUSTRIAL_TYPES.includes(action.buildingType)&&(!['quarry','academy','barracks','workshop'].includes(b.typeId)||b.industrialSlot))return false;
  const tile=w.tiles[b.tileId],s=w.settlements.find(s=>s.id===b.settlementId);
  if(!tile||!s||s.ownerId!==nationId||tile.ownerId!==nationId||tile.occupiedBy!==null||!type.terrains.includes(tile.terrain))return false;
  if(action.buildingType==='lumber'&&b.typeId==='farm'&&!e3e3FarmRetrofitSafe(w,w.nations[nationId],s,b))return false;
  if(F2B_INDUSTRIAL_TYPES.includes(action.buildingType)){
    if(b.typeId==='academy'&&w.buildings.filter(x=>x.typeId==='academy'&&x.status==='ACTIVE'&&w.tiles[x.tileId]?.ownerId===nationId).length<=1)return false;
    if(b.typeId==='barracks'&&(militaryAtWar(w,nationId)||w.buildings.filter(x=>x.typeId==='barracks'&&x.status==='ACTIVE'&&w.tiles[x.tileId]?.ownerId===nationId).length<=1))return false;
  }
  if(b.typeId==='lumber'&&b.status==='ACTIVE'&&!b.disconnected&&
     !w.buildings.some(other=>other.id!==b.id&&other.typeId==='lumber'&&other.status==='ACTIVE'&&
       !other.disconnected&&w.tiles[other.tileId]?.ownerId===nationId))return false;
  if(b.typeId==='house'){
    const old=settlementHousing(w,s),housingLost=(facilityOutput(b,tile.terrain)?.capacity||0)*(1+techBonus(w,nationId,'housing'));
    if(s.population>old-Math.ceil(housingLost))return false;
  }
  return true;
}
function redevelopmentPrice(w,nationId,action){
  if(!redevelopmentLegal(w,nationId,action))return null;
  const base=technicalBuildingPrice(w,nationId,buildPrice(action.buildingType));
  const discount=Math.min(.40,techBonus(w,nationId,'redevelopmentCostDiscount'));
  const b=w.buildings.find(b=>b.id===action.buildingId);
  const old=buildPrice(b.typeId);
  const recovery=Math.min(.35,techBonus(w,nationId,'redevelopmentRecovery'));
  return {...base,gold:Math.max(1,Math.ceil(base.gold*(1-discount))),resources:Object.fromEntries(Object.entries(base.resources).map(([k,v])=>[k,Math.max(0,v-Math.min(v,Math.floor((old.resources[k]||0)*recovery)))]))};
}

function completeBuildings(world){
  let changed=false;
  for(const b of allStructures(world)){
    if(b.disconnected||b.status==='ACTIVE'||b.completeDay>world.dayIndex)continue;
    if(b.status==='UPGRADING'){
      const oldMax=b.typeId==='fort'?fortMaxHP(b):0;
      const oldHp=b.hp;
      b.level=b.targetLevel;delete b.targetLevel;
      if(b.typeId==='fort'){
        // Preserve actual damage, rather than healing a damaged fortress for free.
        b.hp=Math.max(0,fortMaxHP(b)-(oldMax-oldHp));
      }
    }
    if(b.status==='REDEVELOPING'){if(b.typeId==='workshop'||b.typeId==='factory'){delete b.powerDevices;delete b.powerProject;delete b.lastPower;}b.typeId=b.redevelopTo;if(b.typeId==='workshop'||b.typeId==='factory')b.powerDevices={mechanical:false,waterwheel:false,steam:false};if(F2B_INDUSTRIAL_TYPES.includes(b.typeId)){b.f2bRuns=0;b.f2bOperatingDay=null;}else{delete b.f2bRuns;delete b.f2bOperatingDay;}if(b.typeId==='arsenal'){b.f2cRuns=0;b.f2cOperatingDay=null;}else{delete b.f2cRuns;delete b.f2cOperatingDay;}b.level=1;if(b.typeId==='coal_pit')f2b1EnsureCoalSeam(world,world.tiles[b.tileId]);b.lastRedevelopedDay=world.dayIndex;delete b.redevelopTo;delete b.redevelopFrom;}
    b.status='ACTIVE';changed=true;
    const s=world.settlements.find(s=>s.id===b.settlementId);
    world.events.push({dayIndex:world.dayIndex,text:`${s?.name||(b.typeId==='fort'?'국경 방어거점':'정착지')}: ${BUILDINGS[b.typeId].label} ${b.level}단계 완공`,kind:'building'});
  }
  f1AdvancePowerProjects(world);
  i2Advance(world);
  if(changed){if(world.events.length>180)world.events.splice(0,world.events.length-180);world.changeSeq++;}
}
function buildingBonuses(world,nationId,roadInfo=null){
  const local=localProductivityReport(world,nationId,roadInfo);
  return {produced:local.produced,knowledge:local.knowledge};
}
function fortDefense(world,tileId){
  return (world.defenses||[]).filter(b=>b.tileId===tileId&&world.tiles[tileId]?.occupiedBy===null).reduce((sum,b)=>sum+(facilityOutput(b,world.tiles[tileId]?.terrain)?.defense||0),0);
}
/** Regional values are absolute combat-scale numbers, never percentages.
 * World-average fortress values are only used by the renderer, not SIM.
 * Future structures may contribute via BUILDINGS.resistance / firepower and technology rates.
 */
function regionalMilitaryStats(w,tid){
  const tile=w.tiles[tid];if(!tile||!TERRAINS[tile.terrain]?.passable)return {resistance:0,firepower:0};
  const settlement=w.settlements.find(s=>s.coreTileId===tid);
  const terrain={plain:8,grass:10,forest:20,rock:24,mountain:37}[tile.terrain]??10;
  const development=settlement?14+Math.floor(settlement.development*.36):0;
  const capital=settlement&&w.nations[settlement.ownerId]?.capitalId===tid?18:0;
  let resistance=terrain+development+capital,firepower=0;
  for(const b of allStructures(w)){
    if(b.tileId!==tid)continue;
    // A hostile occupation suspends effective infrastructure firing, not its stored level.
    const output=facilityOutput(b,tile.terrain);if(!output||(b.typeId==='fort'&&tile.occupiedBy!==null))continue;
    resistance+=output.defense;firepower+=output.firepower;
  }
  if(tile.ownerId!==null){
    resistance*=1+techBonus(w,tile.ownerId,'regionalResistanceRate');
    firepower*=1+techBonus(w,tile.ownerId,'regionalFirepowerRate');
  }
  return {resistance:Math.max(0,Math.round(resistance*100)/100),firepower:Math.max(0,Math.round(firepower*100)/100)};
}
function fortressWorldAverages(w){
  const ids=new Set((w.defenses||[]).filter(fortEffective).map(d=>d.tileId));
  let resistance=0,firepower=0;
  for(const id of ids){const value=regionalMilitaryStats(w,id);resistance+=value.resistance;firepower+=value.firepower;}
  const count=ids.size;
  return {count,resistance:count?resistance/count:0,firepower:count?firepower/count:0};
}
function fortressThickness(value,average){
  return average>0?Math.min(1,Math.max(0,value/(2*average))):0;
}


// --- src/sim/fortification.js ---
/** V0.3F3F: concrete fort-to-fort barrier; nonpersistent deterministic projection.
 * Every effective same-owner fortress pair within two orthogonal land steps forms
 * a link over its shortest SAFE owned path. Occupation breaks it immediately.
 * Lines use actual fortress HP. No extra units or invisible wall hitpoints.
 */
const FORT_LINE_RANGE=2;
const fortGraphCache=new WeakMap();
function fortificationNetwork(w){
  // Only inspect fort surroundings, not the entire map, so ordinary military movement
  // and unrelated economic changes do not trigger a rebuild.
  // G2A1: compare the previous exact fort surroundings without rebuilding a
  // large string signature on every military route inquiry. All values that
  // previously entered the signature are checked; no SIM RNG or world writes.
  const defenses=w.defenses||[],cached=fortGraphCache.get(w);
  if(cached&&cached.states.length===defenses.length){
    let unchanged=true;
    for(let i=0;i<defenses.length&&unchanged;i++){
      const d=defenses[i],state=cached.states[i],t=w.tiles[d.tileId];
      if(d.tileId!==state.id||!Boolean(t)!==state.missing||
        (!state.missing&&(d.status!==state.status||(d.hp>0)!==state.healthy||
         t.ownerId!==state.owner||t.occupiedBy!==state.occupied))){unchanged=false;break;}
      for(const flank of state.flanks){
        const x=w.tiles[flank.id];
        if(x.ownerId!==flank.owner||x.occupiedBy!==flank.occupied){unchanged=false;break;}
      }
    }
    if(unchanged)return cached.graph;
  }
  const states=defenses.map(d=>{
    const t=w.tiles[d.tileId];
    return {id:d.tileId,missing:!t,status:d.status,healthy:d.hp>0,
      owner:t?.ownerId,occupied:t?.occupiedBy,
      flanks:t?neighbors4(d.tileId,w.size,w.height).map(id=>
        ({id,owner:w.tiles[id].ownerId,occupied:w.tiles[id].occupiedBy})):[]};
  });
  const forts=new Map(),blocked=new Map(),lines=[],links=[];
  for(const d of w.defenses||[]){
    const t=w.tiles[d.tileId];
    if(!t||t.ownerId===null||t.occupiedBy!==null||!fortEffective(d)||!TERRAINS[t.terrain]?.passable)continue;
    forts.set(t.id,t.ownerId);
  }
  const ids=[...forts.keys()].sort((a,b)=>a-b);
  const isSafe=(id,owner)=>{
    const t=w.tiles[id];return t&&t.ownerId===owner&&t.occupiedBy===null&&TERRAINS[t.terrain]?.passable;
  };
  for(const start of ids){
    const owner=forts.get(start);
    // Orthogonal shortest path length one or two. The first safe midpoint by
    // ascending tile ID deterministically resolves the 2-route diagonal tie.
    const candidates=new Map();
    for(const mid of neighbors4(start,w.size,w.height).sort((a,b)=>a-b)){
      if(!isSafe(mid,owner))continue;
      if(mid>start&&forts.get(mid)===owner)candidates.set(mid,[start,mid]);
      for(const end of neighbors4(mid,w.size,w.height)){
        if(end<=start||forts.get(end)!==owner||!isSafe(end,owner))continue;
        if(!candidates.has(end))candidates.set(end,[start,mid,end]);
      }
    }
    for(const [end,path] of [...candidates].sort((a,b)=>a[0]-b[0])){
      lines.push(path);links.push({a:start,b:end,owner,path});
      for(const id of path.slice(1,-1)){
        // A fortified midpoint is assaulted at its own tile, not an invisible wall.
        if(forts.has(id))continue;
        if(!blocked.has(id))blocked.set(id,new Set());
        blocked.get(id).add(owner);
      }
    }
  }
  const graph={forts,blocked,lines,links};fortGraphCache.set(w,{states,graph});return graph;
}
function fortLineBlocks(w,tileId,nationId,graph=null){
  const net=graph||fortificationNetwork(w),owners=net.blocked.get(tileId);
  if(!owners)return false;
  for(const owner of owners){
    if(owner===nationId||allyAccess(w,nationId,owner))continue;
    const war=warAgainst(w,nationId,owner);
    if(war&&warSide(war,nationId)===warSide(war,owner))continue;
    return true;
  }
  return false;
}
function hostileFortUncaptured(w,tileId,nationId,graph=null){
  const net=graph||fortificationNetwork(w),owner=net.forts.get(tileId);
  if(owner===undefined||owner===nationId||allyAccess(w,nationId,owner))return false;
  const war=warAgainst(w,nationId,owner);
  return !(war&&warSide(war,nationId)===warSide(war,owner));
}
