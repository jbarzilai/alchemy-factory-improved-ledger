import { expect, it } from 'vitest';
import { fixtureFor } from './helpers/fixture';

it('loads Sand UI Day 24 raw coin records', async () => {
  const snapshot = await fixtureFor('save-fixture-sand.json').snapshot();
  const day = snapshot.days.find((day) => day.displayDay === 24);
  expect(day).toBeDefined();
  const produced = day!.items
    .filter((record) => record.item === 'CopperCoin')
    .reduce((sum, record) => sum + record.producedCount, 0);
  expect(produced).toBe(66000);
});
