/* Exportación de estructura del Organizador en JSON y TOON para asistencia con IA */
// @ts-nocheck
import { KanbanDB } from "./kanban_db";
import { DiagramLayout } from "./kanban_diagram_layout";

const EJEMPLO_ESTRUCTURA = {
    version: "2.4.0",
    tipo: "vault-task-board-estructura",
    proyectos: [
        { nombre: "Mi Proyecto", archivado: false }
    ],
    tareas: [
        {
            id: 1,
            texto: "Investigar tema",
            proyecto: "Mi Proyecto",
            estado: "Terminado",
            archivada: false,
            requisito_ids: [],
            subtareas: [{ texto: "Leer documentación", completado: true }]
        },
        {
            id: 2,
            texto: "Redactar nota",
            proyecto: "Mi Proyecto",
            estado: "Por Hacer",
            archivada: false,
            requisito_ids: [1],
            subtareas: []
        }
    ]
};

const PROMPT_IA = `Eres un asistente para Obsidian. Te paso la estructura de mi Organizador (Task Board).

## Qué representa
- **proyectos**: carpetas lógicas de trabajo.
- **tareas**: ítems con estado ("Por Hacer" | "En Proceso" | "Terminado").
- **requisito_ids**: dependencias (la tarea requiere que otras terminen primero).
- **subtareas**: checklist interna de cada tarea.
- **archivada**: si true, la tarea está oculta del tablero.

## Qué necesito
1. Genera notas Markdown organizadas por proyecto.
2. Respeta las dependencias al sugerir orden de trabajo.
3. Convierte subtareas en listas de verificación cuando aplique.
4. Propón wikilinks entre notas relacionadas.

## Ejemplo mínimo (TOON)
\`\`\`toon
proyectos[1]{nombre,archivado}:
 Mi Proyecto,false
tareas[2]{id,texto,proyecto,estado,requisito_ids}:
 1,Investigar tema,Mi Proyecto,Terminado,[]
 2,Redactar nota,Mi Proyecto,Por Hacer,[1]
subtareas[1]{tarea_id,texto,completado}:
 1,Leer documentación,true
\`\`\`

## Mi estructura actual
Pega aquí el bloque JSON o TOON copiado del Organizador:
`;

const _esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
};

const _tablaToon = (nombre, filas, campos) => {
    if (!filas.length) return `${nombre}[0]{${campos.join(",")}}:\n`;
    const lineas = filas.map(f =>
        campos.map(c => _esc(f[c])).join(",")
    );
    return `${nombre}[${filas.length}]{${campos.join(",")}}:\n ${lineas.join("\n ")}`;
};

export const KanbanStructureExport = {
    ejemploEstructura: () => structuredClone(EJEMPLO_ESTRUCTURA),

    promptIA: () => PROMPT_IA,

    ejemploToon: () => KanbanStructureExport.aToon(KanbanStructureExport.ejemploEstructura()),

    ejemploJson: () => JSON.stringify(KanbanStructureExport.ejemploEstructura(), null, 2),

    textoEjemploIA: () =>
        `${PROMPT_IA}\n\`\`\`toon\n${KanbanStructureExport.ejemploToon()}\`\`\``,

    construir: (db) => {
        const proyectos = KanbanDB.obtenerProyectos(db, { soloActivos: false }).map(p => ({
            nombre: p.nombre,
            archivado: p.archivado,
            totalTareas: p.total
        }));
        const tareas = KanbanDB.obtenerTodas(db).map(t => ({
            id: t.id,
            texto: t.texto,
            proyecto: t.proyecto,
            estado: t.estado,
            archivada: !!t.archivada,
            requisito_ids: t.requisito_ids || [],
            nota: KanbanDB.limpiarNotaParaVista(t.nota),
            subtareas: (t.subtareas || []).map(st => ({
                texto: st.texto,
                completado: !!st.completado
            }))
        }));
        return {
            version: "2.4.0",
            tipo: "vault-task-board-estructura",
            exportedAt: new Date().toISOString(),
            diagramLayout: DiagramLayout.getConfig(),
            proyectos,
            tareas
        };
    },

    aJson: (payload) => JSON.stringify(payload, null, 2),

    aToon: (payload) => {
        const proy = (payload.proyectos || []).map(p => ({
            nombre: p.nombre,
            archivado: p.archivado ? "true" : "false",
            totalTareas: p.totalTareas ?? 0
        }));
        const tareas = (payload.tareas || []).map(t => ({
            id: t.id,
            texto: t.texto,
            proyecto: t.proyecto,
            estado: t.estado,
            archivada: t.archivada ? "true" : "false",
            requisito_ids: `[${(t.requisito_ids || []).join("|")}]`
        }));
        const subtareas = [];
        (payload.tareas || []).forEach(t => {
            (t.subtareas || []).forEach(st => {
                subtareas.push({
                    tarea_id: t.id,
                    texto: st.texto,
                    completado: st.completado ? "true" : "false"
                });
            });
        });
        const partes = [
            `version: ${payload.version || "2.4.0"}`,
            `tipo: ${payload.tipo || "vault-task-board-estructura"}`,
            `exportedAt: ${payload.exportedAt || ""}`,
            _tablaToon("proyectos", proy, ["nombre", "archivado", "totalTareas"]),
            _tablaToon("tareas", tareas, ["id", "texto", "proyecto", "estado", "archivada", "requisito_ids"]),
            _tablaToon("subtareas", subtareas, ["tarea_id", "texto", "completado"])
        ];
        return partes.join("\n");
    }
};
