import { calculateNearbyRooms, getRangeTo } from "Selectors/MapCoordinates";

import { MinionTypes } from "Minions/minionTypes";
import { Objective } from "./Objective";
import { moveTo } from "Behaviors/moveTo";

declare global {
    interface CreepMemory {
        exploreTarget?: string;
    }
}

export class ExploreObjective extends Objective {
    minionTypes = [MinionTypes.INTERN];

    action = (creep: Creep) => {
        // Check target for completion
        if (creep.memory.exploreTarget && Game.rooms[creep.memory.exploreTarget]) {
            // Room visible, explore complete
            creep.memory.exploreTarget = undefined;
        }

        // Select a target
        if (!creep.memory.exploreTarget) {
            // Ignore aggression on scouts
            creep.notifyWhenAttacked(false);

            let surveyRadius = (Game.rooms[creep.memory.office].controller?.level !== 8) ? 5 : 20

            let rooms = calculateNearbyRooms(creep.memory.office, surveyRadius, false);

            const bestMatch = rooms.map(room => ({
                    distance: getRangeTo(new RoomPosition(25, 25, creep.memory.office), new RoomPosition(25, 25, room)),
                    name: room,
                    scanned: room in Memory.rooms
                }))
                .reduce((last, match) => {
                    // Ignore rooms we've already scanned for now
                    if (match.scanned) {
                        return last;
                    }
                    if (last === undefined || match.distance < last.distance) {
                        return match;
                    }
                    return last;
                })
            creep.memory.exploreTarget = bestMatch?.name;
        }

        // Do work
        if (creep.memory.exploreTarget) {
            moveTo(new RoomPosition(25, 25, creep.memory.exploreTarget), 20)(creep)
        }
    }
}

