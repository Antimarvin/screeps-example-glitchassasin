import { byId } from "Selectors/byId";
import { posById } from "Selectors/posById";
import { getFranchisePlanBySourceId } from "Selectors/roomPlans";
import profiler from "utils/profiler";
import { BehaviorResult } from "./Behavior";
import { moveTo } from "./moveTo";

export const harvestEnergyFromFranchise = profiler.registerFN((creep: Creep, franchiseTarget: Id<Source>) => {
    const source = byId(franchiseTarget);
    const sourcePos = source?.pos ?? posById(franchiseTarget);
    const plan = getFranchisePlanBySourceId(franchiseTarget);

    if (
        !sourcePos ||
        (Game.rooms[sourcePos.roomName] && !source)
    ) {
        return BehaviorResult.FAILURE
    }

    // Prefer to work from container position, fall back to adjacent position
    if (
        plan &&
        !creep.pos.isEqualTo(plan.container.pos) &&
        (!Game.rooms[plan.container.pos.roomName] || plan.container.pos.lookFor(LOOK_CREEPS).length === 0) &&
        !plan.link.structure
    ) {
        moveTo(creep, [{pos: plan.container.pos, range: 0}]);
    } else if (!creep.pos.isNearTo(sourcePos!)) {
        moveTo(creep, [{ pos: sourcePos, range: 1}]);
    }

    return creep.harvest(source!) === OK;
}, 'harvestEnergyFromFranchise');
