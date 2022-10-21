import { MinionTypes } from 'Minions/minionTypes';
import { createDefendOfficeOrder } from 'Missions/Implementations/DefendOffice/createDefendOfficeOrder';
import { MissionStatus, MissionType } from 'Missions/Mission';
import { activeMissions, assignedCreep, isMission } from 'Missions/Selectors';
import { follow, moveTo } from 'screeps-cartographer';
import { isAttacker, isHealer } from 'Selectors/Combat/combatStats';
import { rampartsAreBroken } from 'Selectors/Combat/defenseRamparts';
import { priorityKillTarget } from 'Selectors/Combat/priorityTarget';
import { findHostileCreepsInRange } from 'Selectors/findHostileCreeps';
import { getRangeTo } from 'Selectors/Map/MapCoordinates';
import { getCostMatrix } from 'Selectors/Map/Pathing';
import { closestRampartSection } from 'Selectors/perimeter';
import { isCreep } from 'Selectors/typeguards';
import { createSquadMission, SquadMission, SquadMissionType } from '..';
import { SquadMissionImplementation } from '../SquadMissionImplementation';

export interface AttackerHealerDuoData {
  attacker?: string;
  healer?: string;
  room?: string;
}
export type AttackerHealerDuoMission = SquadMission<SquadMissionType.ATTACKER_HEALER_DUO, AttackerHealerDuoData>;

export const createAttackerHealerDuoMission = (office: string) =>
  createSquadMission(office, SquadMissionType.ATTACKER_HEALER_DUO, 15, {});

export class AttackerHealerDuo implements SquadMissionImplementation {
  constructor(public mission: AttackerHealerDuoMission) {}

  get attacker(): Creep | undefined {
    return Game.creeps[this.mission.data.attacker ?? ''];
  }

  get healer(): Creep | undefined {
    return Game.creeps[this.mission.data.healer ?? ''];
  }

  /**
   * Creeps are in formation
   */
  assembled() {
    return this.healer && this.attacker?.pos.isNearTo(this.healer);
  }
  /**
   * One or both of the creeps is dead - fall back to solo behavior
   */
  broken() {
    return (this.mission.data.healer && !this.healer) || (this.mission.data.attacker && !this.attacker);
  }

  register(creep: Creep) {
    if (isAttacker(creep)) {
      this.mission.data.attacker = creep.name;
    } else if (isHealer(creep)) {
      this.mission.data.healer = creep.name;
    }
  }

  spawn() {
    const orders = [];
    if (!this.attacker) orders.push(createDefendOfficeOrder(this.mission.office, MinionTypes.GUARD, this.mission.id));
    if (!this.healer) orders.push(createDefendOfficeOrder(this.mission.office, MinionTypes.MEDIC, this.mission.id));
    return orders;
  }

  run() {
    if (this.broken()) {
      this.mission.status = MissionStatus.DONE;
      return;
    }
    if (!this.attacker || !this.healer) return; // wait for both creeps

    const rampartsIntact = !rampartsAreBroken(this.mission.office);
    const killTarget = priorityKillTarget(this.mission.office);
    const healTargets = [
      this.attacker,
      this.healer,
      ...activeMissions(this.mission.office)
        .filter(isMission(MissionType.DEFEND_OFFICE))
        .map(assignedCreep)
        .filter(isCreep)
        .sort((a, b) => b.hitsMax - b.hits - (a.hitsMax - a.hits))
    ];
    const healTarget = healTargets.find(c => c && c.hits < c.hitsMax && this.healer?.pos.inRangeTo(c, 3));

    // movement
    if (!this.assembled()) {
      // come together
      moveTo(this.attacker, this.healer);
      moveTo(this.healer, this.attacker);
    } else {
      // duo is assembled, or has been broken
      // attacker movement
      if (killTarget) {
        if (rampartsIntact) {
          const moveTarget = closestRampartSection(killTarget.pos);
          if (moveTarget)
            moveTo(
              this.attacker,
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
          moveTo(this.attacker, { pos: killTarget.pos, range: 1 });
        }
      } else {
        const moveTarget = closestRampartSection(this.attacker.pos);
        if (moveTarget)
          moveTo(
            this.attacker,
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
      follow(this.healer, this.attacker);

      // creep actions
      if (this.healer && healTarget) {
        if (getRangeTo(this.healer.pos, healTarget.pos) > 1) {
          this.healer.rangedHeal(healTarget);
        } else {
          this.healer.heal(healTarget);
        }
      }

      if (this.attacker) {
        // evaluate for secondary kill target
        let target = killTarget;
        if (!target?.pos.inRangeTo(this.attacker, 1)) {
          const secondaryTargets = findHostileCreepsInRange(this.attacker.pos, 1);
          if (secondaryTargets.length) {
            target = secondaryTargets.reduce((min, c) => (c.hits < min.hits ? c : min));
          }
        }
        // attack target
        if (target) this.attacker.attack(target);
      }
    }
  }

  status() {
    return `[AttackerHealerDuo A:${this.attacker?.name ?? '__'} H:${this.healer?.name ?? '__'}]`;
  }
}
