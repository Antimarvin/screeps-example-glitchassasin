import { FranchiseObjective } from "./Franchise"
import { initialize } from "./initializeObjectives"
import { remoteFranchises } from "Selectors/remoteFranchises"
import { sourceIds } from "Selectors/roomCache"

export const initializeDynamicObjectives = (room: string) => {
    initialize(
        ...sourceIds(room).map(id => new FranchiseObjective(10, room, id)),
        ...remoteFranchises(room).map(id => new FranchiseObjective(4, room, id)),
    )
}