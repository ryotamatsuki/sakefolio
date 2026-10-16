/** Curated sensory vocabulary for subjective sake tasting notes.
 * References: NRIB sake flavor terminology and WSET Level 2 SAT (Sake).
 * Aroma examples are sensory analogies, not ingredients or inferred chemicals.
 * https://www.nrib.go.jp/data/pdf/nrl/178-05.pdf
 * https://www.wsetglobal.com/media/15747/wset_l2sake_sat_jp_dec2024_issue1.pdf
 */
export interface SensoryTerm { id: string; label: string }
export interface SensoryGroup { title: string; hint?: string; terms: SensoryTerm[] }
export type AxisKey = 'sweetDry' | 'lightRich' | 'acidity' | 'umami';
export interface SensoryAxis { key: AxisKey; title: string; options: string[] }

export const AROMA_GROUPS: SensoryGroup[] = [
  {
    "title": "果実・吟醸香",
    "hint": "果物に例えられる、華やかな香り",
    "terms": [
      {
        "id": "aroma_apple",
        "label": "りんご"
      },
      {
        "id": "aroma_green_apple",
        "label": "青りんご"
      },
      {
        "id": "aroma_banana",
        "label": "バナナ"
      },
      {
        "id": "aroma_melon",
        "label": "メロン"
      },
      {
        "id": "aroma_pear",
        "label": "洋梨"
      },
      {
        "id": "aroma_peach",
        "label": "桃"
      },
      {
        "id": "aroma_strawberry",
        "label": "いちご"
      },
      {
        "id": "aroma_pineapple",
        "label": "パイナップル"
      },
      {
        "id": "aroma_lychee",
        "label": "ライチ"
      },
      {
        "id": "aroma_grape",
        "label": "ぶどう"
      },
      {
        "id": "aroma_citrus",
        "label": "柑橘"
      },
      {
        "id": "aroma_cherry",
        "label": "さくらんぼ"
      },
      {
        "id": "aroma_mango",
        "label": "マンゴー"
      },
      {
        "id": "aroma_apricot",
        "label": "あんず"
      }
    ]
  },
  {
    "title": "花・ハーブ",
    "hint": "花の華やかさ、爽やかな植物の香り",
    "terms": [
      {
        "id": "aroma_white_flower",
        "label": "白い花"
      },
      {
        "id": "aroma_lily",
        "label": "ユリ"
      },
      {
        "id": "aroma_rose",
        "label": "バラ"
      },
      {
        "id": "aroma_flower_honey",
        "label": "花の蜜"
      },
      {
        "id": "aroma_herb",
        "label": "ハーブ"
      },
      {
        "id": "aroma_mint",
        "label": "ミント"
      },
      {
        "id": "aroma_fresh_grass",
        "label": "青草"
      }
    ]
  },
  {
    "title": "米・麹・穀物",
    "hint": "日本酒の原料や造りを連想する香り",
    "terms": [
      {
        "id": "aroma_steamed_rice",
        "label": "蒸米"
      },
      {
        "id": "aroma_rice_cake",
        "label": "餅"
      },
      {
        "id": "aroma_rice_flour",
        "label": "米粉"
      },
      {
        "id": "aroma_koji",
        "label": "麹"
      },
      {
        "id": "aroma_rice_bran",
        "label": "米ぬか"
      },
      {
        "id": "aroma_grain",
        "label": "穀物"
      },
      {
        "id": "aroma_malt",
        "label": "麦芽"
      }
    ]
  },
  {
    "title": "乳酸・クリーミー",
    "hint": "生酛・山廃などでも感じられる乳酸系の表現",
    "terms": [
      {
        "id": "aroma_yogurt",
        "label": "ヨーグルト"
      },
      {
        "id": "aroma_milk",
        "label": "牛乳"
      },
      {
        "id": "aroma_cream",
        "label": "生クリーム"
      },
      {
        "id": "aroma_fresh_cheese",
        "label": "フレッシュチーズ"
      },
      {
        "id": "aroma_butter",
        "label": "バター"
      }
    ]
  },
  {
    "title": "甘い香り・熟成",
    "hint": "熟成酒やコクのある酒の複雑な香り",
    "terms": [
      {
        "id": "aroma_honey",
        "label": "はちみつ"
      },
      {
        "id": "aroma_brown_sugar",
        "label": "黒糖"
      },
      {
        "id": "aroma_caramel",
        "label": "カラメル"
      },
      {
        "id": "aroma_nuts",
        "label": "ナッツ"
      },
      {
        "id": "aroma_dried_fruit",
        "label": "ドライフルーツ"
      },
      {
        "id": "aroma_chocolate",
        "label": "チョコレート"
      },
      {
        "id": "aroma_coffee",
        "label": "コーヒー"
      },
      {
        "id": "aroma_soy_sauce",
        "label": "醤油"
      }
    ]
  },
  {
    "title": "木・スパイス",
    "hint": "樽酒・熟成などの香りに使う表現",
    "terms": [
      {
        "id": "aroma_wood",
        "label": "木"
      },
      {
        "id": "aroma_cedar",
        "label": "杉"
      },
      {
        "id": "aroma_hinoki",
        "label": "ヒノキ"
      },
      {
        "id": "aroma_spice",
        "label": "香辛料"
      },
      {
        "id": "aroma_cinnamon",
        "label": "シナモン"
      },
      {
        "id": "aroma_anise",
        "label": "アニス"
      }
    ]
  }
];
export const TASTE_GROUPS: SensoryGroup[] = [
  {
    "title": "口当たり",
    "terms": [
      {
        "id": "taste_smooth",
        "label": "なめらか"
      },
      {
        "id": "taste_soft",
        "label": "やわらかい"
      },
      {
        "id": "taste_round",
        "label": "まろやか"
      },
      {
        "id": "taste_silky",
        "label": "きめ細かい"
      },
      {
        "id": "taste_light",
        "label": "さらり"
      },
      {
        "id": "taste_viscous",
        "label": "とろり"
      },
      {
        "id": "taste_sparkling",
        "label": "微発泡・ピチピチ"
      }
    ]
  },
  {
    "title": "味の印象",
    "terms": [
      {
        "id": "taste_fresh",
        "label": "フレッシュ"
      },
      {
        "id": "taste_juicy",
        "label": "ジューシー"
      },
      {
        "id": "taste_crisp",
        "label": "爽やか"
      },
      {
        "id": "taste_rice_umami",
        "label": "米の旨み"
      },
      {
        "id": "taste_rich",
        "label": "ふくよか"
      },
      {
        "id": "taste_complex",
        "label": "複雑"
      },
      {
        "id": "taste_bitter",
        "label": "ほろ苦い"
      },
      {
        "id": "taste_astringent",
        "label": "渋み"
      },
      {
        "id": "taste_mellow",
        "label": "落ち着いた"
      }
    ]
  },
  {
    "title": "後味・余韻",
    "terms": [
      {
        "id": "taste_clean_finish",
        "label": "キレが良い"
      },
      {
        "id": "taste_short_finish",
        "label": "すっきり消える"
      },
      {
        "id": "taste_long_finish",
        "label": "余韻が長い"
      },
      {
        "id": "taste_gentle_finish",
        "label": "穏やかな余韻"
      },
      {
        "id": "taste_dry_finish",
        "label": "後味がドライ"
      },
      {
        "id": "taste_umami_finish",
        "label": "旨みが続く"
      }
    ]
  }
];
export const POPULAR_AROMA_IDS = ["aroma_apple","aroma_banana","aroma_melon","aroma_pear","aroma_white_flower","aroma_steamed_rice","aroma_koji","aroma_yogurt","aroma_caramel"];
export const SENSORY_AXES: SensoryAxis[] = [
  { key:'sweetDry', title:'甘口・辛口', options:['甘口','やや甘口','中間','やや辛口','辛口'] },
  { key:'lightRich', title:'淡麗・濃醇', options:['淡麗','やや淡麗','中間','やや濃醇','濃醇'] },
  { key:'acidity', title:'酸味', options:['穏やか','やや弱い','中程度','やや強い','強い'] },
  { key:'umami', title:'旨み', options:['控えめ','やや控えめ','中程度','やや豊か','豊か'] }
];
const AROMA_NAMES: Record<string,string> = Object.fromEntries(AROMA_GROUPS.flatMap(g=>g.terms.map(t=>[t.id,t.label])));
const TASTE_NAMES: Record<string,string> = Object.fromEntries(TASTE_GROUPS.flatMap(g=>g.terms.map(t=>[t.id,t.label])));
export function selectedIds(value: string): string[] {
  return [...new Set((value || '').split(',').map(x=>x.trim()).filter(Boolean))];
}
export function toggleIds(value: string, id: string): string {
  const selected = selectedIds(value);
  return selected.includes(id) ? selected.filter(x=>x!==id).join(',') : [...selected,id].join(',');
}
export function tagLabels(value: string, category: 'aroma'|'taste'): string[] {
  const names = category === 'aroma' ? AROMA_NAMES : TASTE_NAMES;
  return selectedIds(value).map(id=>names[id] || id);
}
