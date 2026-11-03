import test from 'node:test';
import assert from 'node:assert/strict';
import {AROMA_GROUPS, TASTE_GROUPS, POPULAR_AROMA_IDS, SENSORY_AXES, selectedIds, toggleIds, tagLabels} from './sensory.ts';

test('aroma vocabulary covers sake fruit, floral, rice/koji, lactic and mature styles', () => {
  const all = AROMA_GROUPS.flatMap(group=>group.terms);
  const labels = new Set(all.map(term=>term.label));
  for(const label of ['りんご','バナナ','メロン','洋梨','白い花','蒸米','麹','ヨーグルト','カラメル','杉']) {
    assert.ok(labels.has(label),label);
  }
  assert.equal(all.length, new Set(all.map(term=>term.id)).size);
  assert.equal(all.length, new Set(all.map(term=>term.label)).size);
  for(const id of POPULAR_AROMA_IDS) assert.ok(all.some(t=>t.id===id));
});
test('taste vocabulary is unique and includes sake-specific mouthfeel and finish', () => {
  const all = TASTE_GROUPS.flatMap(group=>group.terms);
  assert.equal(all.length,new Set(all.map(t=>t.id)).size);
  assert.ok(all.some(t=>t.label==='米の旨み'));
  assert.ok(all.some(t=>t.label==='キレが良い'));
  assert.ok(all.some(t=>t.label==='微発泡・ピチピチ'));
});
test('chips toggle deterministically and preserve old unknown selections', () => {
  const first = toggleIds('', 'aroma_apple');
  assert.equal(first,'aroma_apple');
  const second = toggleIds(first,'aroma_koji');
  assert.deepEqual(selectedIds(second),['aroma_apple','aroma_koji']);
  assert.deepEqual(tagLabels(second,'aroma'),['りんご','麹']);
  assert.equal(toggleIds(second,'aroma_apple'),'aroma_koji');
  assert.deepEqual(selectedIds('aroma_apple, aroma_apple, unknown'),['aroma_apple','unknown']);
  assert.deepEqual(tagLabels('unknown','aroma'),['unknown']);
});
test('all four tasting axes offer five selectable descriptions', () => {
  assert.deepEqual(SENSORY_AXES.map(x=>x.key),['sweetDry','lightRich','acidity','umami']);
  for(const axis of SENSORY_AXES) assert.equal(axis.options.length,5);
});
