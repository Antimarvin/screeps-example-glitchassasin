import { build } from "behaviors/build";
import { withdraw } from "behaviors/withdraw";

export const run = (creep: Creep) => {
    if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.building = false;
    }
    if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
        creep.memory.building = true;
    }

    if(creep.memory.building) {
        build(creep);
    }
    else {
        withdraw(creep);
    }
    return true;
}
