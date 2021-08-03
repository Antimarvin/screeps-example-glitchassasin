import { memoize, memoizeByTick } from "utils/memoizeFunction";

import { packPos } from "utils/packrat";

let flatMap = (arr: any[], f: (x: any, i: number) => any) => {
    return [].concat(...arr.map(f))
}


export const calculateAdjacencyMatrix = memoize(
    (proximity: number) => ('' + proximity),
    (proximity=1): {x: number, y: number}[] => {
        let adjacencies = [...(new Array(proximity * 2 + 1))].map((v, i) => i - proximity)
        return flatMap(adjacencies, (x, i) => adjacencies.map( y => ({x, y})))
            .filter((a: {x: number, y: number}) => !(a.x === 0 && a.y === 0));
    }
);
export const calculateAdjacentPositions = memoize(
    (pos: RoomPosition) => (`[${pos.x}, ${pos.y}]`),
    (pos: RoomPosition) => {
        return calculateNearbyPositions(pos, 1);
    }
);

export const adjacentWalkablePositions = (pos: RoomPosition) => calculateAdjacentPositions(pos).filter(p => isPositionWalkable(p));

export const calculateNearbyPositions = memoize(
    (pos: RoomPosition, proximity: number, includeCenter = false) => (`[${pos.x}, ${pos.y}: ${pos.roomName}]x${proximity} ${includeCenter}`),
    (pos: RoomPosition, proximity: number, includeCenter = false) => {
        let adjacent: RoomPosition[] = [];
        adjacent = calculateAdjacencyMatrix(proximity)
            .map(offset => {
                try {
                    return new RoomPosition(pos.x + offset.x, pos.y + offset.y, pos.roomName)
                }
                catch {
                    return null;
                }
            })
            .filter(roomPos => roomPos !== null) as RoomPosition[]
        if (includeCenter) adjacent.push(pos);
        return adjacent;
    }
);
export const calculateNearbyRooms = memoize(
    (roomName: string, proximity: number, includeCenter = false) => (`${roomName} ${proximity} ${includeCenter}`),
    (roomName: string, proximity: number, includeCenter = false) => {
        let {wx, wy} = roomNameToCoords(roomName)
        let roomStatus = Game.map.getRoomStatus(roomName);
        let adjacent = calculateAdjacencyMatrix(proximity)
            .map(offset => {
                try {
                    return roomNameFromCoords(wx + offset.x, wy + offset.y);
                }
                catch {
                    return null;
                }
            })
            .filter(n => {
                if (n === null) return false;
                try {
                    let status = Game.map.getRoomStatus(n);
                    if (roomStatus === roomStatus || status.status === 'normal') {
                        return true;
                    }
                    return false;
                } catch {
                    return false;
                }
            }) as string[];
        if (includeCenter) adjacent.push(roomName);
        return adjacent;
    }
)
export const isPositionWalkable = memoizeByTick(
    (pos: RoomPosition, ignoreCreeps: boolean = false) => packPos(pos) + ignoreCreeps,
    (pos: RoomPosition, ignoreCreeps: boolean = false) => {
        let terrain;
        try {
            terrain = Game.map.getRoomTerrain(pos.roomName);
        } catch {
            // Invalid room
            return false;
        }
        if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) {
            return false;
        }
        if (Game.rooms[pos.roomName] && pos.look().some(obj => {
            if (ignoreCreeps && obj.type === LOOK_CREEPS) return false;
            if (obj.constructionSite && (OBSTACLE_OBJECT_TYPES as string[]).includes(obj.constructionSite.structureType)) return true;
            if (obj.structure && (OBSTACLE_OBJECT_TYPES as string[]).includes(obj.structure.structureType)) return true;
            return false;
        })) {
            return false;
        }
        return true;
    }
)
export const getCostMatrix = memoizeByTick(
    (roomName: string, avoidCreeps: boolean = false) => `${roomName} ${avoidCreeps ? 'Y' : 'N'}`,
    (roomName: string, avoidCreeps: boolean = false) => {
        let room = Game.rooms[roomName];
        let costs = new PathFinder.CostMatrix;

        if (!room) return costs;

        for (let struct of room.find(FIND_STRUCTURES)) {
          if ((OBSTACLE_OBJECT_TYPES as string[]).includes(struct.structureType)) {
            // Can't walk through non-walkable buildings
            costs.set(struct.pos.x, struct.pos.y, 0xff);
          } else if (struct.structureType === STRUCTURE_ROAD && !(costs.get(struct.pos.x, struct.pos.y) === 0xff)) {
            // Favor roads over plain tiles
            costs.set(struct.pos.x, struct.pos.y, 1);
          }
        }

        for (let struct of room.find(FIND_MY_CONSTRUCTION_SITES)) {
            if (struct.structureType !== STRUCTURE_ROAD &&
                struct.structureType !== STRUCTURE_CONTAINER &&
                struct.structureType !== STRUCTURE_RAMPART) {
              // Can't walk through non-walkable construction sites
              costs.set(struct.pos.x, struct.pos.y, 0xff);
            }
        }

        // Avoid creeps in the room
        if (avoidCreeps) {
            room.find(FIND_CREEPS).forEach(function(creep) {
                costs.set(creep.pos.x, creep.pos.y, 0xff);
            });
        }

        return costs;
    }
)
export const getRangeTo = memoize(
    (from: RoomPosition, to: RoomPosition) => (`${from} ${to}`),
    (from: RoomPosition, to: RoomPosition) => {
        if (from.roomName === to.roomName) return from.getRangeTo(to);

        // Calculate global positions
        let fromGlobal = globalPosition(from);
        let toGlobal = globalPosition(to);

        return Math.max( Math.abs((fromGlobal.x-toGlobal.x)), Math.abs((fromGlobal.y-toGlobal.y)) );
    }
)
export const globalPosition = (pos: RoomPosition) => {
    let {x,y,roomName} = pos;
    if(!_.inRange(x, 0, 50)) throw new RangeError('x value ' + x + ' not in range');
    if(!_.inRange(y, 0, 50)) throw new RangeError('y value ' + y + ' not in range');
    if(roomName == 'sim') throw new RangeError('Sim room does not have world position');
    let {wx, wy} = roomNameToCoords(roomName);
    return {
        x: (50*Number(wx))+x,
        y: (50*Number(wy))+y
    };
}
export const isHighway = (roomName: string) => {
    let parsed = roomName.match(/^[WE]([0-9]+)[NS]([0-9]+)$/);
    if (!parsed) throw new Error('Invalid room name')
    return (Number(parsed[1]) % 10 === 0) || (Number(parsed[2]) % 10 === 0);
}
export const roomNameToCoords = (roomName: string) => {
    let match = roomName.match(/^([WE])([0-9]+)([NS])([0-9]+)$/);
    if (!match) throw new Error('Invalid room name')
    let [,h,wx,v,wy] = match
    return {
        wx: (h == 'W') ? Number(wx) : ~Number(wx),
        wy: (v == 'S') ? Number(wy) : ~Number(wy)
    }
}
export const roomNameFromCoords = (x: number, y: number) => {
    let h = (x < 0) ? 'E' : 'W';
    let v = (y < 0) ? 'N' : 'S';
    x = (x < 0) ? ~x : x;
    y = (y < 0) ? ~y : y;
    return `${h}${x}${v}${y}`
}
export const countTerrainTypes = (roomName: string) => {
    let terrain = Game.map.getRoomTerrain(roomName);
    return terrain.getRawBuffer().reduce((terrainStats, t) => {
        if (t & TERRAIN_MASK_SWAMP) {
            terrainStats.swamp += 1;
        } else if (t & TERRAIN_MASK_WALL) {
            terrainStats.wall += 1
        } else if (t & TERRAIN_MASK_LAVA) {
            terrainStats.lava += 1
        } else {
            terrainStats.plains += 1
        }
        return terrainStats
    }, {swamp: 0, plains: 0, wall: 0, lava: 0})
}
export const sortByDistanceTo = <T extends (RoomPosition|_HasRoomPosition)>(pos: RoomPosition) => {
    let distance = new Map<RoomPosition, number>();
    return (a: T, b: T) => {
        let aPos = (a instanceof RoomPosition) ? a : (a as _HasRoomPosition).pos
        let bPos = (b instanceof RoomPosition) ? b : (b as _HasRoomPosition).pos
        if (!distance.has(aPos)){
            distance.set(aPos, getRangeTo(pos, aPos))
        }
        if (!distance.has(bPos)) distance.set(bPos, getRangeTo(pos, bPos))
        return (distance.get(aPos) as number) - (distance.get(bPos) as number)
    }
}
export const sortByDistanceToRoom = <T extends ({name: string}|string)>(roomName: string) => {
    let distance = new Map<string, number>();
    let target = roomNameToCoords(roomName);
    return (a: T, b: T) => {
        let aName = (typeof a === 'string') ? a : (a as {name: string}).name;
        let bName = (typeof b === 'string') ? b : (b as {name: string}).name;
        let aCoords = roomNameToCoords(aName);
        let bCoords = roomNameToCoords(bName);
        if (!distance.has(aName)){
            distance.set(aName,
                Math.max( Math.abs((target.wx-aCoords.wx)), Math.abs((target.wy-aCoords.wy)) )
            )
        }
        if (!distance.has(bName)) distance.set(bName,
            Math.max( Math.abs((target.wx-bCoords.wx)), Math.abs((target.wy-bCoords.wy)) )
        )
        return (distance.get(aName) as number) - (distance.get(bName) as number)
    }
}
