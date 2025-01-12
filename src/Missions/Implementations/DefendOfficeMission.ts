import { MinionBuilders, MinionTypes } from 'Minions/minionTypes';
import { CreepSpawner } from 'Missions/BaseClasses/CreepSpawner/CreepSpawner';
import { Budget } from 'Missions/Budgets';
import { MissionStatus } from 'Missions/Mission';
import { follow, moveTo } from 'screeps-cartographer';
import { totalCreepStats } from 'Selectors/Combat/combatStats';
import { rampartsAreBroken } from 'Selectors/Combat/defenseRamparts';
import { priorityKillTarget } from 'Selectors/Combat/priorityTarget';
import { findHostileCreepsInRange } from 'Selectors/findHostileCreeps';
import { getRangeTo } from 'Selectors/Map/MapCoordinates';
import { getCostMatrix } from 'Selectors/Map/Pathing';
import { closestRampartSection } from 'Selectors/perimeter';
import { isCreep } from 'Selectors/typeguards';
import {
  BaseMissionData,
  MissionImplementation,
  ResolvedCreeps,
  ResolvedMissions
} from '../BaseClasses/MissionImplementation';

export interface DefendOfficeMissionData extends BaseMissionData {}

export class DefendOfficeMission extends MissionImplementation {
  public creeps = {
    attacker: new CreepSpawner('a', this.missionData.office, {
      role: MinionTypes.GUARD,
      budget: Budget.ESSENTIAL,
      builds: energy => MinionBuilders[MinionTypes.GUARD](energy, false)
    }),
    healer: new CreepSpawner('b', this.missionData.office, {
      role: MinionTypes.MEDIC,
      budget: Budget.ESSENTIAL,
      builds: energy => MinionBuilders[MinionTypes.MEDIC](energy)
    })
  };

  priority = 15;

  constructor(public missionData: DefendOfficeMissionData, id?: string) {
    super(missionData, id);
  }
  static fromId(id: DefendOfficeMission['id']) {
    return super.fromId(id) as DefendOfficeMission;
  }

  score() {
    return totalCreepStats([this.creeps.attacker.resolved, this.creeps.healer.resolved].filter(isCreep)).score;
  }

  assembled() {
    return this.creeps.attacker.spawned && this.creeps.healer.spawned;
  }

  run(
    creeps: ResolvedCreeps<DefendOfficeMission>,
    missions: ResolvedMissions<DefendOfficeMission>,
    data: DefendOfficeMissionData
  ) {
    const { attacker, healer } = creeps;
    if (!attacker && !healer && this.assembled()) {
      this.status = MissionStatus.DONE;
      return;
    }
    if (!attacker || !healer) return; // wait for both creeps

    const rampartsIntact = !rampartsAreBroken(data.office);
    const killTarget = priorityKillTarget(data.office);
    const healTargets = [attacker, healer];
    const healTarget = healTargets.find(c => c && c.hits < c.hitsMax && healer?.pos.inRangeTo(c, 3));

    // movement
    if (getRangeTo(attacker.pos, healer.pos) !== 1) {
      // come together
      moveTo(attacker, healer);
      moveTo(healer, attacker);
    } else {
      // duo is assembled, or has been broken
      // attacker movement
      if (killTarget) {
        if (rampartsIntact) {
          const moveTarget = closestRampartSection(killTarget.pos);
          if (moveTarget)
            moveTo(
              attacker,
              moveTarget.map(pos => ({ pos, range: 0 })),
              {
                avoidObstacleStructures: false, // handled by our own cost matrix
                maxRooms: 1,
                roomCallback(room) {
                  return getCostMatrix(room, false, {
                    stayInsidePerimeter: true
                  });
                },
                visualizePathStyle: {}
              }
            );
        } else {
          moveTo(attacker, { pos: killTarget.pos, range: 1 });
        }
      } else {
        const moveTarget = closestRampartSection(attacker.pos);
        if (moveTarget)
          moveTo(
            attacker,
            moveTarget.map(pos => ({ pos, range: 0 })),
            {
              avoidObstacleStructures: false, // handled by our own cost matrix
              maxRooms: 1,
              roomCallback(room) {
                return getCostMatrix(room, false, {
                  stayInsidePerimeter: true
                });
              },
              visualizePathStyle: {}
            }
          );
      }
      // healer movement
      follow(healer, attacker);

      // creep actions
      if (healer && healTarget) {
        if (getRangeTo(healer.pos, healTarget.pos) > 1) {
          healer.rangedHeal(healTarget);
        } else {
          healer.heal(healTarget);
        }
      }

      if (attacker) {
        // evaluate for secondary kill target
        let target = killTarget;
        if (!target?.pos.inRangeTo(attacker, 1)) {
          const secondaryTargets = findHostileCreepsInRange(attacker.pos, 1);
          if (secondaryTargets.length) {
            target = secondaryTargets.reduce((min, c) => (c.hits < min.hits ? c : min));
          }
        }
        // attack target
        if (target) attacker.attack(target);
      }
    }
  }
}
