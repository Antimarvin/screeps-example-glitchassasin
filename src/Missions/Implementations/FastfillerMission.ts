import { MinionBuilders, MinionTypes } from 'Minions/minionTypes';
import { ConditionalCreepSpawner } from 'Missions/BaseClasses/CreepSpawner/ConditionalCreepSpawner';
import {
  BaseMissionData,
  MissionImplementation,
  ResolvedCreeps,
  ResolvedMissions
} from 'Missions/BaseClasses/MissionImplementation';
import { Budget } from 'Missions/Budgets';
import { refillSquares } from 'Reports/fastfillerPositions';
import { moveTo } from 'screeps-cartographer';
import { hasEnergyIncome } from 'Selectors/hasEnergyIncome';
import { defaultRoomCallback } from 'Selectors/Map/Pathing';
import { rcl } from 'Selectors/rcl';
import { getSpawns, roomPlans } from 'Selectors/roomPlans';
import { viz } from 'Selectors/viz';
import { unpackPos } from 'utils/packrat';

export interface FastfillerMissionData extends BaseMissionData {
  refillSquares: {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
  };
}

const fastfillerSpawner = (office: string, id: string, shouldSpawn = () => true) =>
  new ConditionalCreepSpawner(id, office, {
    role: MinionTypes.CLERK,
    budget: Budget.ESSENTIAL,
    builds: energy =>
      MinionBuilders[MinionTypes.CLERK](
        energy,
        (SPAWN_ENERGY_CAPACITY + EXTENSION_ENERGY_CAPACITY[rcl(office)]) / CARRY_CAPACITY,
        getSpawns(office).length !== 3
      ),
    shouldSpawn: () => hasEnergyIncome(office) && shouldSpawn()
  });

export class FastfillerMission extends MissionImplementation {
  public creeps = {
    topLeft: fastfillerSpawner(this.missionData.office, 'a'),
    topRight: fastfillerSpawner(this.missionData.office, 'b'),
    bottomLeft: fastfillerSpawner(this.missionData.office, 'c', () => rcl(this.missionData.office) > 2),
    bottomRight: fastfillerSpawner(this.missionData.office, 'd', () => rcl(this.missionData.office) > 2)
  };

  priority = 15;

  constructor(public missionData: FastfillerMissionData, id?: string) {
    super(missionData, id);
  }
  static fromId(id: FastfillerMission['id']) {
    return super.fromId(id) as FastfillerMission;
  }

  run(
    creeps: ResolvedCreeps<FastfillerMission>,
    missions: ResolvedMissions<FastfillerMission>,
    data: FastfillerMissionData
  ) {
    if (!this.missionData.refillSquares.topLeft) {
      this.missionData.refillSquares = refillSquares(this.missionData.office);
    }
    if (!this.missionData.refillSquares.topLeft) return;
    const { topLeft, topRight, bottomLeft, bottomRight } = creeps;

    const plan = roomPlans(data.office)?.fastfiller;
    const structures = {
      topLeft: {
        spawn: plan?.spawns[0]?.structure,
        container: plan?.containers[0]?.structure,
        oppositeContainer: plan?.containers[1]?.structure,
        extensions: [1, 2, 3, 6].map(i => plan?.extensions[i]?.structure),
        centerExtension: plan?.extensions[0]?.structure
      },
      bottomLeft: {
        spawn: plan?.spawns[2]?.structure,
        container: plan?.containers[0]?.structure,
        oppositeContainer: plan?.containers[1]?.structure,
        extensions: [9, 11, 12, 6].map(i => plan?.extensions[i]?.structure),
        centerExtension: plan?.extensions[8]?.structure
      },
      topRight: {
        spawn: plan?.spawns[1]?.structure,
        container: plan?.containers[1]?.structure,
        oppositeContainer: plan?.containers[0]?.structure,
        extensions: [4, 5, 3, 7].map(i => plan?.extensions[i]?.structure),
        centerExtension: plan?.extensions[0]?.structure
      },
      bottomRight: {
        spawn: plan?.spawns[2]?.structure,
        container: plan?.containers[1]?.structure,
        oppositeContainer: plan?.containers[0]?.structure,
        extensions: [13, 14, 10, 7].map(i => plan?.extensions[i]?.structure),
        centerExtension: plan?.extensions[8]?.structure
      }
    };
    const link = plan?.link.structure;

    const positions = [
      { creep: topLeft, pos: unpackPos(data.refillSquares.topLeft), structures: structures.topLeft },
      { creep: topRight, pos: unpackPos(data.refillSquares.topRight), structures: structures.topRight },
      { creep: bottomLeft, pos: unpackPos(data.refillSquares.bottomLeft), structures: structures.bottomLeft },
      { creep: bottomRight, pos: unpackPos(data.refillSquares.bottomRight), structures: structures.bottomRight }
    ];

    const shouldTransfer = (s: AnyStoreStructure | undefined) =>
      s && s.store[RESOURCE_ENERGY] < s.store.getCapacity(RESOURCE_ENERGY);

    for (const { creep, pos, structures } of positions) {
      if (!creep) continue;
      if (creep) moveTo(creep, { pos, range: 0 }, { roomCallback: defaultRoomCallback({ ignoreFastfiller: true }) }); // even if already there, this will prevent shoving
      if (!creep.pos.isEqualTo(pos)) continue; // wait to get to position

      // do any adjacent structures need energy?
      const adjacentStructuresNeedEnergy =
        shouldTransfer(structures.spawn) ||
        structures.extensions.some(shouldTransfer) ||
        shouldTransfer(structures.centerExtension);
      const adjacentContainerNeedsEnergy = shouldTransfer(structures.container);
      const thisSideEnergy = structures.container?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
      const oppositeEnergy = structures.oppositeContainer?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;

      const transferFromOpposite =
        adjacentStructuresNeedEnergy && thisSideEnergy < oppositeEnergy - SPAWN_ENERGY_CAPACITY;
      if (!adjacentStructuresNeedEnergy && !adjacentContainerNeedsEnergy) continue;

      if (creep.store.getFreeCapacity(RESOURCE_ENERGY)) {
        // Look for source
        let source;
        if (link?.store[RESOURCE_ENERGY]) {
          source = link;
        } else if (structures.centerExtension?.store[RESOURCE_ENERGY] && transferFromOpposite) {
          source = structures.centerExtension;
        } else if (structures.container?.store[RESOURCE_ENERGY] && adjacentStructuresNeedEnergy) {
          source = structures.container;
        }
        if (source) {
          const amount = Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), source.store[RESOURCE_ENERGY]);
          creep.withdraw(source, RESOURCE_ENERGY, amount);
          viz(creep.pos.roomName).line(creep.pos, source.pos, { color: 'red' });
          source.store[RESOURCE_ENERGY] -= amount;
        }
      }

      if (creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
        let destination = [
          structures.spawn,
          ...structures.extensions,
          !transferFromOpposite ? structures.centerExtension : undefined
        ].find(shouldTransfer);

        if (destination) {
          creep.transfer(destination, RESOURCE_ENERGY);
          viz(creep.pos.roomName).line(creep.pos, destination.pos, { color: 'green' });
          destination.store[RESOURCE_ENERGY] = Math.min(
            destination.store.getCapacity(RESOURCE_ENERGY),
            destination.store[RESOURCE_ENERGY] + creep.store.getFreeCapacity(RESOURCE_ENERGY)
          );
        }
      }
    }
  }
}
