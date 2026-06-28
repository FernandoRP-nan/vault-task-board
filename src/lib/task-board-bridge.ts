/* task-board-bridge.ts — migrado a módulo TS */
// @ts-nocheck
import { KanbanDB } from "./kanban_db";

/* task-board-bridge.js - API pública para otros plugins locales */

export const TaskBoardBridgeFactory = (obtenerSQL) => ({
    PLUGIN_ID: "vault-task-board",

    isAvailable: () => !!(KanbanDB && obtenerSQL()),

    dbPath: () => KanbanDB.DB_RELATIVE,

    _withDb: (fn) => {
        const SQL = obtenerSQL();
        if (!SQL || !KanbanDB) return null;
        const dbPath = KanbanDB.DB_RELATIVE;
        const kdb = KanbanDB.abrirSync(SQL, dbPath);
        try {
            return fn(kdb, dbPath);
        } finally {
            kdb.close();
        }
    },

    notaConMarcaAgenda: (notas, agendaId) =>
        KanbanDB._notaConMarcaAgenda(notas, agendaId),

    buscarIdPorAgendaId: (agendaId) =>
        TaskBoardBridgeFactory(obtenerSQL)._withDb((kdb) =>
            KanbanDB.buscarIdPorAgendaId(kdb, agendaId)),

    obtenerTodas: () =>
        TaskBoardBridgeFactory(obtenerSQL)._withDb((kdb) =>
            KanbanDB.obtenerTodas(kdb)) ?? [],

    crearTarea: (datos) =>
        TaskBoardBridgeFactory(obtenerSQL)._withDb((kdb, dbPath) =>
            KanbanDB.crearTarea(kdb, dbPath, datos)),

    actualizarTarea: (tareaId, datos) =>
        TaskBoardBridgeFactory(obtenerSQL)._withDb((kdb, dbPath) => {
            KanbanDB.actualizarTarea(kdb, dbPath, tareaId, datos);
            return tareaId;
        }),

    eliminarTarea: (tareaId) =>
        TaskBoardBridgeFactory(obtenerSQL)._withDb((kdb, dbPath) => {
            KanbanDB.eliminarTarea(kdb, dbPath, tareaId);
        }),

    emitChange: (app) => {
        app?.workspace?.trigger("vault-task-board:changed");
    }
});
