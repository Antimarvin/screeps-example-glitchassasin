import { States, setState } from "Behaviors/states";
import { debugCPU, resetDebugCPU } from "utils/debugCPU";

import { BehaviorResult } from "Behaviors/Behavior";
import { MinionTypes } from "Minions/minionTypes";
import { Objective } from "./Objective";
import { franchiseEnergyAvailable } from "Selectors/franchiseEnergyAvailable";
import { franchisesByOffice } from "Selectors/franchisesByOffice";
import { getEnergyFromFranchise } from "Behaviors/getEnergyFromFranchise";
import { isPositionWalkable } from "Selectors/MapCoordinates";
import { moveTo } from "Behaviors/moveTo";
import { resetCreep } from "Selectors/resetCreep";
import { roomPlans } from "Selectors/roomPlans";

declare global {
    interface CreepMemory {
        depositSource?: Id<Source>
    }
}

const DEBUG = false;

/**
 * Picks up energy from Sources and transfers it to Storage
 */
export class StorageObjective extends Objective {
    minionTypes = [MinionTypes.ACCOUNTANT];

    private assignedCapacity: Record<string, number> = {}

    debug() {
        console.log(JSON.stringify(this.assignedCapacity));
    }

    resetCapacity() { this.assignedCapacity = {}; }
    updateCapacity(creep: Creep) {
        if (!creep.memory.depositSource) return;
        this.assignedCapacity[creep.memory.depositSource] ??= 0;
        this.assignedCapacity[creep.memory.depositSource] += creep.store.getCapacity(RESOURCE_ENERGY);
    }

    assign(creep: Creep) {
        // If the creep's office has franchises with unassigned capacity, assign minion
        for (let franchise of franchisesByOffice(creep.memory.office)) {
            if (franchiseEnergyAvailable(franchise) > (this.assignedCapacity[franchise] ?? 0)) {
                if (super.assign(creep)) {
                    this.assignedCapacity[franchise] += creep.store.getFreeCapacity(RESOURCE_ENERGY);
                    return true;
                } else {
                    return false;
                }
            }
        }
        return false;
    }

    action = (creep: Creep) => {
        if (DEBUG) resetDebugCPU();
        if (!creep.memory.state) {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                setState(States.WITHDRAW)(creep);
            } else {
                setState(States.DEPOSIT)(creep);
            }
        }
        if (DEBUG) debugCPU('Setting initial state');
        if (creep.memory.state === States.WITHDRAW) {
            if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                setState(States.DEPOSIT)(creep);
            } else {
                const result = getEnergyFromFranchise(creep);
                if (result === BehaviorResult.SUCCESS) {
                    setState(States.DEPOSIT)(creep);
                } else if (result === BehaviorResult.FAILURE) {
                    resetCreep(creep);
                    return;
                }
            }
        }
        if (creep.memory.state === States.DEPOSIT) {
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                resetCreep(creep); // Free for a new task
                return;
            }
            const storage = roomPlans(creep.memory.office)?.office.headquarters.storage;
            if (!storage) return;
            if (storage.structure) {
                moveTo(storage.pos, 1)(creep);
                if (creep.transfer(storage.structure, RESOURCE_ENERGY) === OK) {
                    resetCreep(creep); // Free for a new task
                }
                if (DEBUG) debugCPU('Deposit: Transferring to storage');
            } else if (isPositionWalkable(storage.pos)) {
                // Drop at storage position
                if (moveTo(storage.pos, 0)(creep) === BehaviorResult.SUCCESS) {
                    creep.drop(RESOURCE_ENERGY);
                    resetCreep(creep); // Free for a new task
                }
                if (DEBUG) debugCPU('Deposit: Dropping at storage');
            } else {
                // Drop next to storage under construction
                if (moveTo(storage.pos, 1)(creep) === BehaviorResult.SUCCESS) {
                    creep.drop(RESOURCE_ENERGY);
                    resetCreep(creep); // Free for a new task
                }
                if (DEBUG) debugCPU('Deposit: Dropping near storage');
            }
        }
    }
}

