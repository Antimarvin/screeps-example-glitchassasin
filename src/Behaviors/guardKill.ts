import { BehaviorResult } from "./Behavior";
import { moveTo } from "./moveTo";

export const guardKill = (creep: Creep, target?: Creep|Structure) => {
  if (target && moveTo(creep, { pos: target.pos, range: 1 }) === BehaviorResult.SUCCESS) {
    return creep.attack(target) === OK;
  }
  return false;
}
