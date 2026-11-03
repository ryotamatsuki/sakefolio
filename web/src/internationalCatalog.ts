/** China beverage master: only verified brand identities. Not a list of SKUs.
 * Display hints are search suggestions, never invented ABV/vintage/ratings.
 * Brand identities maintained manually; user must verify product label.
 * OFF is separate user-triggered live data with ODbL obligations.
 */
export const BEVERAGE_KINDS=['baijiu','huangjiu','beer','wine'] as const;
export type BeverageKind=(typeof BEVERAGE_KINDS)[number];
export interface MasterBrand {id:string;kind:BeverageKind;name:string;latin:string;region:string}
export interface KindConfig {id:BeverageKind;name:string;english:string;description:string;fields:{key:string;label:string;placeholder:string;options?:readonly string[]}[]}
export const KIND_CONFIG:KindConfig[]=[
 {id:'baijiu',name:'中国白酒',english:'BAIJIU',description:'蒸留酒。香型・アルコール度数を重視',
  fields:[
   {key:'aromaStyle',label:'香型',placeholder:'香型を選択',options:['','酱香型','浓香型','清香型','米香型','凤香型','兼香型','芝麻香型','馥郁香型','董香型','その他・不明']},
   {key:'strength',label:'香りの強さ',placeholder:'程度を選択',
     options:['','穏やか','やや穏やか','中程度','やや強い','力強い','不明']},
   {key:'ingredients',label:'原料',placeholder:'例：高粱・小麦'}]},
 {id:'huangjiu',name:'黄酒・紹興酒',english:'HUANGJIU',description:'醸造酒。黄酒には紹興酒以外も含まれます',
  fields:[
   {key:'huangjiuStyle',label:'商品区分',placeholder:'黄酒の区分を選択',
     options:['','花彫酒','加飯酒','元紅酒','善醸酒','香雪酒','その他・不明']},
   {key:'sugarStyle',label:'糖度区分',placeholder:'糖度区分を選択',options:['','干型','半干型','半甜型','甜型','不明']},
   {key:'ageing',label:'熟成年数',placeholder:'例：5年（ラベル記載時のみ）'},
   {key:'ingredients',label:'原料',placeholder:'例：糯米・麦麹'}]},
 {id:'beer',name:'中国ビール',english:'BEER',description:'スタイル、苦味、ボディなどを記録',
  fields:[
   {key:'beerStyle',label:'ビアスタイル',placeholder:'スタイルを選択',
     options:['','ラガー','ピルスナー','ヘレス','ペールエール','IPA','ヴァイツェン','ベルジャンエール','スタウト','ポーター','サワーエール','その他・不明']},
   {key:'bitterness',label:'苦味の印象',placeholder:'程度を選択',
     options:['','弱い','やや弱い','中程度','やや強い','強い','不明']},
   {key:'body',label:'ボディ',placeholder:'程度を選択',
     options:['','ライト','ミディアムライト','ミディアム','ミディアムフル','フル','不明']}]},
 {id:'wine',name:'中国ワイン',english:'WINE',description:'ワイン産地、ブドウ品種、ヴィンテージ',
  fields:[
   {key:'wineStyle',label:'ワインの種類',placeholder:'種類を選択',options:['','赤','白','ロゼ','スパークリング','その他']},
   {key:'grapes',label:'ブドウ品種',placeholder:'例：カベルネ・ソーヴィニヨン'},
   {key:'vintage',label:'ヴィンテージ',placeholder:'例：2021'},
   {key:'body',label:'ボディ',placeholder:'程度を選択',
     options:['','ライト','ミディアムライト','ミディアム','ミディアムフル','フル','不明']}]}
];
export const BRAND_STARTERS:MasterBrand[]=[
 {id:'cn-bj-moutai',kind:'baijiu',name:'茅台',latin:'Kweichow Moutai',region:'貴州省'},
 {id:'cn-bj-wuliangye',kind:'baijiu',name:'五粮液',latin:'Wuliangye',region:'四川省'},
 {id:'cn-bj-luzhou',kind:'baijiu',name:'泸州老窖',latin:'Luzhou Laojiao',region:'四川省'},
 {id:'cn-bj-fenjiu',kind:'baijiu',name:'汾酒',latin:'Fenjiu',region:'山西省'},
 {id:'cn-bj-yanghe',kind:'baijiu',name:'洋河',latin:'Yanghe',region:'江蘇省'},
 {id:'cn-hj-guye',kind:'huangjiu',name:'古越龍山',latin:'Guyue Longshan',region:'浙江省'},
 {id:'cn-hj-kuaijishan',kind:'huangjiu',name:'会稽山',latin:'Kuaijishan',region:'浙江省'},
 {id:'cn-hj-tapai',kind:'huangjiu',name:'塔牌',latin:'Tapai',region:'浙江省'},
 {id:'cn-hj-nuerhong',kind:'huangjiu',name:'女児紅',latin:'Nuerhong',region:'浙江省'},
 {id:'cn-beer-tsingtao',kind:'beer',name:'青島啤酒',latin:'Tsingtao',region:'山東省'},
 {id:'cn-beer-snow',kind:'beer',name:'雪花啤酒',latin:'Snow Beer',region:'中国'},
 {id:'cn-beer-yangjing',kind:'beer',name:'燕京啤酒',latin:'Yanjing Beer',region:'北京市'},
 {id:'cn-beer-harbin',kind:'beer',name:'哈爾浜啤酒',latin:'Harbin Beer',region:'黒龍江省'},
 {id:'cn-wine-changyu',kind:'wine',name:'張裕',latin:'Changyu',region:'山東省'},
 {id:'cn-wine-greatwall',kind:'wine',name:'長城葡萄酒',latin:'Great Wall Wine',region:'中国'},
 {id:'cn-wine-dynasty',kind:'wine',name:'王朝',latin:'Dynasty Wine',region:'天津市'}
];
export const KIND_NAME=(kind:BeverageKind)=>KIND_CONFIG.find(x=>x.id===kind)!.name;
export function brandMatches(brand:MasterBrand,kind:BeverageKind,query:string):boolean {
 const q=query.trim().normalize('NFKC').toLowerCase();
 return brand.kind===kind&&(!q||[brand.name,brand.latin,brand.region].some(s=>s.normalize('NFKC').toLowerCase().includes(q)));
}
export interface OffProduct {code:string;productName:string;brandName:string;quantity:string;source:string}
export function normalizeOffProducts(input:unknown):OffProduct[]{
 if(!input||typeof input!=='object'||!('products'in input)||!Array.isArray(input.products))return [];
 const seen=new Set<string>();const result:OffProduct[]=[];
 for(const p of input.products){
   if(!p||typeof p!=='object')continue;
   const code=typeof p.code==='string'?p.code.trim():'';
   const name=typeof p.product_name==='string'?p.product_name.trim():'';
   if(!/^\d{8,14}$/.test(code)||!name||seen.has(code))continue;
   seen.add(code);
   result.push({code,productName:name.slice(0,180),
    brandName:typeof p.brands==='string'?p.brands.trim().slice(0,180):'',
    quantity:typeof p.quantity==='string'?p.quantity.trim().slice(0,60):'',
    source:'https://world.openfoodfacts.org/product/'+code});
   if(result.length>=15)break;
 }
 return result;
}

export interface WikidataCandidate {id:string;label:string;description:string;source:string}
export function normalizeWikidataResults(input:unknown):WikidataCandidate[]{
 if(!input||typeof input!=='object'||!('search'in input)||!Array.isArray(input.search))return [];
 const seen=new Set<string>();const results:WikidataCandidate[]=[];
 for(const p of input.search){
   if(!p||typeof p!=='object'||typeof p.id!=='string'||!/^Q[1-9][0-9]{0,11}$/.test(p.id)||
      typeof p.label!=='string'||!p.label.trim()||seen.has(p.id))continue;
   seen.add(p.id);
   results.push({id:p.id,label:p.label.trim().slice(0,200),
     description:typeof p.description==='string'?p.description.trim().slice(0,300):'',
     source:'https://www.wikidata.org/wiki/'+p.id});
   if(results.length>=12)break;
 }
 return results;
}
