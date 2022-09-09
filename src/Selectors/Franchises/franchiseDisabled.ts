import { posById } from 'Selectors/posById';
import { memoizeByTick } from 'utils/memoizeFunction';
import { getFranchiseDistance } from './getFranchiseDistance';

export const franchiseDisabled = memoizeByTick(
  (office: string, source: Id<Source>) => office + source,
  (office, source) => {
    const pos = posById(source);
    if (!pos || !Memory.rooms[pos.roomName]?.franchises?.[office]?.[source]) return true;
    if ((getFranchiseDistance(office, source) ?? 200) > 150) return true;
    const { scores } = Memory.rooms[pos.roomName].franchises[office][source];
    // if (scores.length === FRANCHISE_EVALUATE_PERIOD && scores.reduce((a, b) => a + b, 0) / scores.length < 0) {
    //   // franchise is too expensive
    //   return true;
    // }
    return false;
  }
);
