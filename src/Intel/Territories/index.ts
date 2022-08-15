import { FRANCHISE_EVALUATE_PERIOD, FRANCHISE_RETRY_INTERVAL } from 'config';
import { HarvestLedger } from 'Ledger/HarvestLedger';
import { franchiseActive } from 'Selectors/Franchises/franchiseActive';
import { franchisesByOffice } from 'Selectors/Franchises/franchisesByOffice';
import { recalculateTerritoryOffices } from './recalculateTerritoryOffices';

let offices: string;
export const scanTerritories = () => {
  // Recalculate territory assignments, if needed
  const currentOffices = Object.keys(Memory.offices).sort().join('_');
  if (offices !== currentOffices) {
    // Offices have changed
    console.log('Offices have changed, recalculating territories');
    offices = currentOffices;
    const startingCpu = Game.cpu.getUsed();
    for (const room in Memory.rooms) {
      Memory.rooms[room].officesInRange ??= '';
      Memory.rooms[room].franchises ??= {};
      // if (room in Memory.offices) continue; // skip check for existing offices
      recalculateTerritoryOffices(room);
      // console.log(room, '->', Memory.rooms[room].office);

      if (Game.cpu.getUsed() - startingCpu > 200) {
        // continue next tick if we take more than 200 CPU
        offices = '';
        break;
      }
    }
  }

  for (const office in Memory.offices) {
    for (const { source, room } of franchisesByOffice(office)) {
      const ledger = HarvestLedger.get(office, source);
      if (ledger.age < 1500 || !franchiseActive(office, source)) continue;
      Memory.rooms[room].franchises[office][source].scores ??= [];
      const { scores, lastHarvested } = Memory.rooms[room].franchises[office][source];

      scores.push(ledger.perTick);
      if (scores.length > FRANCHISE_EVALUATE_PERIOD) scores.shift();

      console.log(office, room, source, scores); //JSON.stringify(ledger.value));

      HarvestLedger.reset(office, source);

      // evaluate if scores should be reset
      if (
        scores.length === FRANCHISE_EVALUATE_PERIOD &&
        scores.reduce((a, b) => a + b, 0) / scores.length <= 1 &&
        lastHarvested &&
        lastHarvested < Game.time - FRANCHISE_RETRY_INTERVAL
      ) {
        // franchise was producing less than 1 e/t, but it's time to re-evaluate
        scores.splice(0, FRANCHISE_EVALUATE_PERIOD);
      }
    }
  }
};