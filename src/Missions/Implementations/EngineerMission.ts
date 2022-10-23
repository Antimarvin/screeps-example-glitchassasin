import { BehaviorResult } from 'Behaviors/Behavior';
import { engineerGetEnergy } from 'Behaviors/engineerGetEnergy';
import { runStates } from 'Behaviors/stateMachine';
import { States } from 'Behaviors/states';
import { UPGRADE_CONTROLLER_COST } from 'gameConstants';
import { MinionBuilders, MinionTypes } from 'Minions/minionTypes';
import { CreepSpawner } from 'Missions/BaseClasses/CreepSpawner/CreepSpawner';
import {
  BaseMissionData,
  MissionImplementation,
  ResolvedCreeps,
  ResolvedMissions
} from 'Missions/BaseClasses/MissionImplementation';
import { Budget, getWithdrawLimit } from 'Missions/Budgets';
import { MissionType } from 'Missions/Mission';
import { activeMissions, isMission } from 'Missions/Selectors';
import { PlannedStructure } from 'RoomPlanner/PlannedStructure';
import { moveTo } from 'screeps-cartographer';
import { franchisesThatNeedRoadWork } from 'Selectors/Franchises/franchisesThatNeedRoadWork';
import { franchiseThatNeedsEngineers } from 'Selectors/Franchises/franchiseThatNeedsEngineers';
import { getClosestByRange } from 'Selectors/Map/MapCoordinates';
import { franchiseRoadsToBuild } from 'Selectors/plannedTerritoryRoads';
import { rcl } from 'Selectors/rcl';
import { storageEnergyAvailable } from 'Selectors/storageEnergyAvailable';
import { facilitiesWorkToDo, plannedStructureNeedsWork } from 'Selectors/Structures/facilitiesWorkToDo';
import { memoizeByTick } from 'utils/memoizeFunction';

export interface EngineerMissionData extends BaseMissionData {
  facilitiesTarget?: string;
  franchise?: Id<Source>;
}

export class EngineerMission extends MissionImplementation {
  budget = Budget.ECONOMY;
  public creeps = {
    engineer: new CreepSpawner('e', this.missionData.office, {
      role: MinionTypes.ENGINEER,
      budget: this.budget,
      body: energy => MinionBuilders[MinionTypes.ENGINEER](energy, this.calculated().roads, !this.missionData.franchise)
    })
  };

  priority = 8;

  constructor(public missionData: EngineerMissionData, id?: string) {
    super(missionData, id);
  }
  static fromId(id: EngineerMission['id']) {
    return new this(Memory.missions[id].data, id);
  }

  calculated = memoizeByTick(
    () => '',
    () => {
      return {
        roads: rcl(this.missionData.office) > 3
      };
    }
  );

  run(creeps: ResolvedCreeps<EngineerMission>, missions: ResolvedMissions<EngineerMission>, data: EngineerMissionData) {
    const { engineer } = creeps;
    if (!engineer) return;
    runStates(
      {
        [States.FIND_WORK]: (mission, creep) => {
          delete mission.facilitiesTarget;
          const nextStructure = getClosestByRange(creep.pos, facilitiesWorkToDo(mission.office));
          if (nextStructure) {
            mission.facilitiesTarget = nextStructure.serialize();
            delete mission.franchise;
            return States.BUILDING;
          }
          if (rcl(mission.office) < 3) {
            // Skip building roads until RCL3
            delete mission.facilitiesTarget;
            return States.UPGRADING;
          }

          // Pick a road to work on
          if (!mission.franchise || !franchisesThatNeedRoadWork(mission.office).includes(mission.franchise)) {
            delete mission.franchise;
            mission.franchise = franchiseThatNeedsEngineers(
              mission.office,
              activeMissions(mission.office).filter(isMission(MissionType.ENGINEER)),
              true
            );
          }

          if (!mission.franchise) return States.UPGRADING; // go upgrade instead

          // Pick the next section of road to complete
          const road = getClosestByRange(creep.pos, franchiseRoadsToBuild(mission.office, mission.franchise));
          if (road) {
            mission.facilitiesTarget = road.serialize();
            return States.BUILDING;
          }

          // No work found for this franchise
          delete mission.franchise;
          if (rcl(mission.office) < 8) return States.UPGRADING;
          return States.FIND_WORK;
        },
        [States.GET_ENERGY]: (mission, creep) => {
          if (
            creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 ||
            engineerGetEnergy(
              creep,
              mission.office,
              getWithdrawLimit(mission.office, this.budget),
              !!mission.franchise && !!mission.facilitiesTarget // currently building for a franchise
            ) === BehaviorResult.SUCCESS
          ) {
            return States.FIND_WORK;
          }
          return States.GET_ENERGY;
        },
        [States.BUILDING]: (mission, creep) => {
          if (!creep.store.getUsedCapacity(RESOURCE_ENERGY)) return States.GET_ENERGY;
          if (!mission.facilitiesTarget) return States.FIND_WORK;
          const plan = PlannedStructure.deserialize(mission.facilitiesTarget);

          if (!plannedStructureNeedsWork(plan, true)) return States.FIND_WORK;

          if (!Game.rooms[plan.pos.roomName]?.controller?.my && Game.rooms[plan.pos.roomName]) {
            const obstacle = plan.pos
              .lookFor(LOOK_STRUCTURES)
              .find(s => s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD);
            if (obstacle) {
              moveTo(creep, { pos: plan.pos, range: 1 });
              if (creep.pos.inRangeTo(plan.pos, 1)) {
                creep.dismantle(obstacle);
              }
              return States.BUILDING;
            }
          }

          moveTo(creep, { pos: plan.pos, range: 3 });

          if (creep.pos.inRangeTo(plan.pos, 3)) {
            if (plan.structure && plan.structure.hits < plan.structure.hitsMax) {
              if (mission.franchise) {
                // engineers should not be repairing
                return States.FIND_WORK;
              }
              if (creep.repair(plan.structure) === OK) {
                const cost = REPAIR_COST * REPAIR_POWER * creep.body.filter(p => p.type === WORK).length;
                this.recordEnergy(cost);
              }
            } else {
              // Create construction site if needed
              if (!plan.constructionSite) {
                const result = plan.pos.createConstructionSite(plan.structureType);
                if (result === ERR_NOT_OWNER) {
                  // room reserved or claimed by a hostile actor
                  delete mission.facilitiesTarget;
                  return States.FIND_WORK;
                }
              }
              // Shove creeps out of the way if needed
              if ((OBSTACLE_OBJECT_TYPES as string[]).includes(plan.structureType)) {
                const fleeCreep = plan.pos.lookFor(LOOK_CREEPS)[0];
                if (fleeCreep) moveTo(fleeCreep, { pos: plan.pos, range: 2 }, { flee: true });
              }
              if (plan.constructionSite) {
                const result = creep.build(plan.constructionSite);
                if (result === OK) {
                  const cost = BUILD_POWER * creep.body.filter(p => p.type === WORK).length;
                  this.recordEnergy(cost);
                } else if (result === ERR_NOT_ENOUGH_ENERGY) {
                  return States.GET_ENERGY;
                }
              }
            }
            plan.survey();
          }

          return States.BUILDING;
        },
        [States.UPGRADING]: (mission, creep) => {
          if (
            rcl(mission.office) >= 4 &&
            storageEnergyAvailable(mission.office) <= getWithdrawLimit(mission.office, this.budget)
          )
            return States.FIND_WORK;

          // No construction - upgrade instead
          const controller = Game.rooms[mission.office]?.controller;
          if (!controller) return States.FIND_WORK;
          moveTo(creep, { pos: controller.pos, range: 3 });
          const result = creep.upgradeController(controller);
          if (result == ERR_NOT_ENOUGH_ENERGY) {
            return States.FIND_WORK;
          } else if (result === OK) {
            this.recordEnergy(
              UPGRADE_CONTROLLER_COST * UPGRADE_CONTROLLER_POWER * creep.body.filter(p => p.type === WORK).length
            );
          }
          if (Game.time % 10 === 0) return States.FIND_WORK;
          return States.UPGRADING;
        }
      },
      this.missionData,
      engineer
    );
  }
}
