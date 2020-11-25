import { BehaviorResult, Blackboard } from "BehaviorTree/Behavior";

import { Health } from "WorldState/Health";

/**
 * Relies on Blackboard.buildSite to be populated by createConstructionSite
 */
export const ifRepairIsNotFinished = () => (creep: Creep, bb: Blackboard) => {
    if (!bb.repairSite) return BehaviorResult.FAILURE;
    let health = Health.byId(bb.repairSite.id);
    if (!health) return BehaviorResult.FAILURE;
    if ((health.hits ?? 0) <= (bb.repairToHits !== undefined ? bb.repairToHits : health.hitsMax ?? 0)) return BehaviorResult.SUCCESS;
    return BehaviorResult.FAILURE;
}
