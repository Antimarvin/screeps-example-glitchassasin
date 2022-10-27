import { guardKill } from 'Behaviors/guardKill';
import { MinionBuilders, MinionTypes } from 'Minions/minionTypes';
import { CreepSpawner } from 'Missions/BaseClasses/CreepSpawner/CreepSpawner';
import {
  BaseMissionData,
  MissionImplementation,
  ResolvedCreeps,
  ResolvedMissions
} from 'Missions/BaseClasses/MissionImplementation';
import { Budget } from 'Missions/Budgets';
import { MissionStatus } from 'Missions/Mission';
import { moveTo } from 'screeps-cartographer';
import { findInvaderStructures } from 'Selectors/findHostileCreeps';

export interface KillCoreMissionData extends BaseMissionData {
  targetRoom?: string;
}

export class KillCoreMission extends MissionImplementation {
  public creeps = {
    guard: new CreepSpawner('g', this.missionData.office, {
      role: MinionTypes.GUARD,
      budget: Budget.EFFICIENCY,
      body: energy => MinionBuilders[MinionTypes.GUARD](energy)
    })
  };

  priority = 9.5;

  constructor(public missionData: KillCoreMissionData, id?: string) {
    super(missionData, id);
  }
  static fromId(id: KillCoreMission['id']) {
    return super.fromId(id) as KillCoreMission;
  }

  assembled() {
    return this.creeps.guard.spawned;
  }

  run(creeps: ResolvedCreeps<KillCoreMission>, missions: ResolvedMissions<KillCoreMission>, data: KillCoreMissionData) {
    const { guard } = creeps;
    if (!guard && this.assembled()) {
      this.status = MissionStatus.DONE;
      return;
    }
    if (!guard) return;

    // If work is done, clear target
    if (data.targetRoom && !Memory.rooms[data.targetRoom].invaderCore) {
      delete data.targetRoom;
    }

    // If no target, pick one
    if (!data.targetRoom) {
      for (const t of Memory.offices[data.office].territories ?? []) {
        if (Memory.rooms[t].invaderCore) {
          // Invader core detected
          data.targetRoom = t;
        }
      }
    }

    if (!data.targetRoom) return; // nothing to do

    // Go to room
    if (guard.pos.roomName !== data.targetRoom) {
      moveTo(guard, { pos: new RoomPosition(25, 25, data.targetRoom), range: 20 });
    }

    // Clear room
    const target = findInvaderStructures(data.targetRoom)[0];

    guardKill(guard, target);
  }
}