import { getPrimarySpawn } from "Selectors/getPrimarySpawn";
import { roomPlans } from "Selectors/roomPlans";
import profiler from "utils/profiler";
import { BehaviorResult } from "./Behavior";
import { moveTo } from "./moveTo";

export const getEnergyFromStorage = profiler.registerFN((creep: Creep, office: string, limit?: number, ignoreSpawn = false): BehaviorResult => {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return BehaviorResult.SUCCESS;

    const hq = roomPlans(office)?.headquarters;
    const storage = hq?.storage.structure as StructureStorage|undefined;
    const container = hq?.container.structure as StructureContainer|undefined;
    const spawn = getPrimarySpawn(office) as StructureSpawn|undefined;

    const withdrawLimit = limit ?? Game.rooms[office]?.energyCapacityAvailable

    let target = undefined;
    if ((storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > withdrawLimit) {
        target = storage;
    } else if ((container?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > withdrawLimit) {
        target = container;
    } else if (!storage && !container && !ignoreSpawn && (spawn?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) >= 300) {
        target = spawn;
    }

    if (!target) {
        return BehaviorResult.FAILURE;
    }

    moveTo(creep, { pos: target.pos, range: 1 });
    if (creep.withdraw(target, RESOURCE_ENERGY) === OK) {
        return BehaviorResult.SUCCESS;
    }
    return BehaviorResult.INPROGRESS;
}, 'getEnergyFromStorage')
