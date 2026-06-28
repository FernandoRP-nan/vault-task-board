export interface TaskBoardApi {
    PLUGIN_ID: string;
    isAvailable: () => boolean;
    dbPath: () => string;
    notaConMarcaAgenda: (notas: string, agendaId: string) => string;
    buscarIdPorAgendaId: (agendaId: string) => number | null | undefined;
    obtenerTodas: () => Array<{ id: number; estado: string }>;
    crearTarea: (datos: Record<string, unknown>) => number;
    actualizarTarea: (tareaId: number, datos: Record<string, unknown>) => number | undefined;
    eliminarTarea: (tareaId: number) => void;
    emitChange: (app: unknown) => void;
}
