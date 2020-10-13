import { DefenseAnalyst } from "Boardroom/BoardroomManagers/DefenseAnalyst";
import { TransferRequest } from "Logistics/LogisticsRequest";
import { MinionRequest, MinionTypes } from "MinionRequests/MinionRequest";
import { OfficeManagerStatus } from "Office/OfficeManager";
import { getTransferEnergyRemaining } from "utils/gameObjectSelectors";
import { Table } from "Visualizations/Table";
import { HRManager } from "../HRManager";
import { LogisticsManager } from "../LogisticsManager";
import { OfficeTaskManager } from "../OfficeTaskManager/OfficeTaskManager";
import { DefenseTask } from "../OfficeTaskManager/TaskRequests/types/DefenseTask";
import { ExploreTask } from "../OfficeTaskManager/TaskRequests/types/ExploreTask";
import { IdleTask } from "../OfficeTaskManager/TaskRequests/types/IdleTask";
import { ShouldDefendRoom } from "./Strategists/ShouldDefendRoom";

export class SecurityManager extends OfficeTaskManager {
    towers: StructureTower[] = [];
    interns: Creep[] = [];
    guards: Creep[] = [];

    plan() {
        super.plan();
        let defenseAnalyst = global.boardroom.managers.get('DefenseAnalyst') as DefenseAnalyst;
        let logisticsManager = this.office.managers.get('LogisticsManager') as LogisticsManager;
        let hrManager = this.office.managers.get('HRManager') as HRManager;
        if (this.status === OfficeManagerStatus.OFFLINE) return;
        this.towers = defenseAnalyst.getTowers(this.office);

        this.interns = defenseAnalyst.getInterns(this.office);
        this.guards = defenseAnalyst.getGuards(this.office);

        let priority = 3;
        switch (this.status) {
            case OfficeManagerStatus.MINIMAL: {
                priority = 3;
                break;
            }
            case OfficeManagerStatus.NORMAL: {
                priority = 5;
                break;
            }
            case OfficeManagerStatus.PRIORITY: {
                priority = 7;
                break;
            }
        }

        // Maintain tower upkeep
        this.towers.forEach(t => {
            // Request energy, if needed
            let e = getTransferEnergyRemaining(t);
            if (e) {
                let adjustedPriority = priority;
                if (e > 700) {
                    adjustedPriority += 2;
                } else if (e > 150) {
                    adjustedPriority += 1;
                }
                logisticsManager.submit(t.id, new TransferRequest(t, adjustedPriority));
            }
        })

        // Plan defensive operations
        this.office.territories.forEach(t => {
            if (t.isHostile && ShouldDefendRoom(t)) {
                this.submit(`${t.name}_Defense`, new DefenseTask(t, priority));
            }
        })

        // Scout surrounding Territories, if needed
        let territory = this.office.territories.sort((a, b) => a.scanned - b.scanned)[0];
        if (territory) {
            this.submit(territory.name, new ExploreTask(territory.name, priority - 1))
        }


        // Maintain one Intern to handle scouting tasks
        if (this.interns.length === 0) {
            hrManager.submit(new MinionRequest(`${this.office.name}_Sec_Int`, priority - 1, MinionTypes.INTERN, {manager: this.constructor.name}))
        }
        // If we have Defense tasks, spawn Guards indefinitely
        for (let [,request] of this.requests) {
            if (request instanceof DefenseTask) {
                hrManager.submit(new MinionRequest(`${this.office.name}_Sec_Ops`, priority + 1, MinionTypes.GUARD, {manager: this.constructor.name}))
                break;
            }
        }
        // Set a recall post for guards
        this.submit(`${this.office.name}_Sec_Idle`, new IdleTask(new RoomPosition(25, 25, this.office.name), 1))
    }
    run() {
        super.run();
        if (this.status === OfficeManagerStatus.OFFLINE) return;
        let defenseAnalyst = global.boardroom.managers.get('DefenseAnalyst') as DefenseAnalyst;
        let targets = defenseAnalyst.getPrioritizedAttackTargets(this.office);
        let healTargets = defenseAnalyst.getPrioritizedHealTargets(this.office);

        this.towers.forEach(t => {
            // Simple priorities
            if (targets.length > 0) {
                t.attack(targets[0])
            } else if (healTargets.length > 0) {
                t.heal(healTargets[0])
            }
        })

        if (global.v.security.state) {
            this.report();
        }
    }
    report() {
        super.report();
        let statusTable = [
            ['Territory', 'Last Surveyed'],
            ...this.office.territories.map(t => [t.name, t.scanned])
        ]
        Table(new RoomPosition(2, 2, this.office.center.name), statusTable);
    }
}