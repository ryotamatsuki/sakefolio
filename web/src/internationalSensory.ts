/** Consumer-friendly descriptor prompts for international drinks.
 * Adapted to widely used tasting conventions (BJCP beer style terminology,
 * WSET wine tasting categories), not a reproduction of protected tasting sheets.
 * Never auto-assign flavour notes to a product or infer that the user tasted it.
 */
import type {BeverageKind} from './internationalCatalog.ts';

export type DescriptorType='aroma'|'taste';
export type DescriptorGroup={name:string;values:readonly string[]};
export type SensoryAxis={key:'axisBitterness'|'axisMalt'|'axisBody'|'axisCarbonation'|'axisSweetness'|'axisAcidity'|'axisTannin';
 label:string;low:string;high:string;hint?:string};
export const INTERNATIONAL_SENSORY:Partial<Record<BeverageKind,{
  aroma:readonly DescriptorGroup[];taste:readonly DescriptorGroup[];
  axes:readonly SensoryAxis[];
}>>={
 beer:{
  aroma:[
   {name:'モルト・穀物',values:['麦芽','パン','ビスケット','トースト','キャラメル','チョコレート','コーヒー']},
   {name:'ホップ・植物',values:['柑橘','グレープフルーツ','松・樹脂','草・ハーブ','花','トロピカルフルーツ']},
   {name:'発酵・その他',values:['バナナ','クローブ','スパイス','ベリー','酵母','ほのかな酸香']}
  ],
  taste:[
   {name:'味の印象',values:['ホップの苦味','モルトの甘み','香ばしい','フルーティー','ほのかな酸味','ロースト感','スパイシー']},
   {name:'口当たり・後味',values:['すっきり','ドライ','キレがよい','軽快','クリーミー','なめらか','コクがある','余韻が長い']}
  ],
  axes:[
   {key:'axisBitterness',label:'苦味',low:'弱い',high:'強い'},
   {key:'axisMalt',label:'モルト感',low:'控えめ',high:'豊か'},
   {key:'axisBody',label:'ボディ',low:'軽い',high:'重い'},
   {key:'axisCarbonation',label:'炭酸の刺激',low:'穏やか',high:'強い'}
  ]
 },
 wine:{
  aroma:[
   {name:'フレッシュな果実',values:['レモン','グレープフルーツ','青りんご','洋梨','桃','アプリコット','パイナップル','マンゴー']},
   {name:'赤・黒い果実',values:['いちご','ラズベリー','さくらんぼ','カシス','ブラックベリー','プラム']},
   {name:'花・植物',values:['白い花','バラ','スミレ','ハーブ','青ピーマン','ミント']},
   {name:'樽・熟成など',values:['バニラ','シナモン','トースト','バター','ナッツ','チョコレート','革','土・森の下草']}
  ],
  taste:[
   {name:'甘味・酸味・渋味',values:['ドライ','ほのかな甘み','甘口','爽やかな酸味','穏やかな酸味','しっかりした渋み','渋みが穏やか']},
   {name:'口当たり・印象',values:['フレッシュ','フルーティー','なめらか','まろやか','ミネラル感','ふくよか','複雑','樽の余韻','余韻が長い']}
  ],
  axes:[
   {key:'axisSweetness',label:'甘味',low:'ドライ',high:'甘口'},
   {key:'axisAcidity',label:'酸味',low:'穏やか',high:'高い'},
   {key:'axisTannin',label:'タンニン（渋み）',low:'感じない',high:'強い',
    hint:'主に赤ワインで評価。白ワインなど該当しなければ未設定で構いません。'},
   {key:'axisBody',label:'ボディ',low:'軽い',high:'重い'}
  ]
 }
};
export function splitDescriptorTags(value:string):string[]{
 return [...new Set(value.split(/[,，、;；]/).map(s=>s.trim()).filter(Boolean))].slice(0,40);
}
export function toggleDescriptorTag(value:string,tag:string):string{
 const tags=splitDescriptorTags(value);
 if(tags.includes(tag))return tags.filter(t=>t!==tag).join('、');
 return [...tags,tag].slice(0,30).join('、');
}
export function sensoryDescriptorValues(
 attributes:Record<string,string>,notes:string,type:DescriptorType):string[]{
 const key=type==='aroma'?'aromaTags':'tasteTags';
 return [...new Set([...splitDescriptorTags(attributes[key]||''),...splitDescriptorTags(notes)])];
}
export function sensoryAxesFor(kind:BeverageKind){
 return INTERNATIONAL_SENSORY[kind]?.axes||[];
}
export function sensoryAxisScore(raw:unknown):number|null{
 if(typeof raw!=='string'||!/[1-5]/.test(raw)||raw.length!==1)return null;
 return Number(raw);
}
