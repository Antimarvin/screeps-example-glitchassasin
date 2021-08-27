import { RES_COLORS } from "gameConstants";
import { Dashboard, Rectangle, Table } from "screeps-viz";

export default () => {
    for (let office in Memory.offices) {
        if (Memory.offices[office].labOrders.length === 0) {
            Game.map.visual.text('offline', new RoomPosition(25, 25, office), { fontSize: 5 });
            continue;
        }
        // queue
        Game.map.visual.rect(new RoomPosition(0, 0, office), 50, 50, { fill: '#000000', opacity: 0.7 });
        Memory.offices[office].labOrders.slice(0, 6).forEach((order, i) => {
            Game.map.visual.text(order.ingredient1, new RoomPosition(7, 7 * (i + 1), office), { fontSize: 7, color: RES_COLORS[order.ingredient1] });
            Game.map.visual.text(order.ingredient2, new RoomPosition(17, 7 * (i + 1), office), { fontSize: 7, color: RES_COLORS[order.ingredient2] });
            Game.map.visual.text('=>', new RoomPosition(25, 7 * (i + 1), office), { fontSize: 7 });
            Game.map.visual.text(order.output, new RoomPosition(37, 7 * (i + 1), office), { fontSize: 7, color: RES_COLORS[order.output] });
        })

        // detail view
        Dashboard({
            config: { room: office },
            widgets: [
                {
                    pos: { x: 1, y: 1 },
                    width: 25,
                    height: 25,
                    widget: Rectangle({ data: Table({
                        config: {
                            headers: ['Ingredient1', 'Ingredient2', 'Output', 'Amount']
                        },
                        data: Memory.offices[office].labOrders.map(order => ([
                            order.ingredient1,
                            order.ingredient2,
                            order.output,
                            order.amount
                        ]))
                    })})
                }
            ]
        })
    }
}