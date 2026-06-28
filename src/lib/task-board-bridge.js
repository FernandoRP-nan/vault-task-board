/* task-board-bridge.js - API pública para otros plugins locales */

window.TaskBoardBridgeFactory = (obtenerSQL) => ({
    PLUGIN_ID: "vault-task-board",

    isAvailable: () => !!(window.KanbanDB && obtenerSQL()),

    dbPath: () => window.KanbanDB.DB_RELATIVE,

    _withDb: (fn) => {
        const SQL = obtenerSQL();
        if (!SQL || !window.KanbanDB) return null;
        const dbPath = window.KanbanDB.DB_RELATIVE;
        const kdb = window.KanbanDB.abrirSync(SQL, dbPath);
        try {
            return fn(kdb, dbPath);
        } finally {
            kdb.close();
        }
    },

    notaConMarcaAgenda: (notas, agendaId) =>
        window.KanbanDB._notaConMarcaAgenda(notas, agendaId),

    buscarIdPorAgendaId: (agendaId) =>
        window.TaskBoardBridgeFactory(obtenerSQL)._withDb((kdb) =>
            window.KanbanDB.buscarIdPorAgendaId(kdb, agendaId)),

    obtenerTodas: () =>
        window.TaskBoardBridgeFactory(obtenerSQL)._withDb((kdb) =>
            window.KanbanDB.obtenerTodas(kdb)) ?? [],

    crearTarea: (datos) =>
        window.TaskBoardBridgeFactory(obtenerSQL)._withDb((kdb, dbPath) =>
            window.KanbanDB.crearTarea(kdb, dbPath, datos)),

    actualizarTarea: (tareaId, datos) =>
        window.TaskBoardBridgeFactory(obtenerSQL)._withDb((kdb, dbPath) => {
            window.KanbanDB.actualizarTarea(kdb, dbPath, tareaId, datos);
            return tareaId;
        }),

    eliminarTarea: (tareaId) =>
        window.TaskBoardBridgeFactory(obtenerSQL)._withDb((kdb, dbPath) => {
            window.KanbanDB.eliminarTarea(kdb, dbPath, tareaId);
        }),

    emitChange: (app) => {
        app?.workspace?.trigger("vault-task-board:changed");
    }
});
