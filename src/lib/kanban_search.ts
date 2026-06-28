/* Modal de búsqueda rápida de tareas. */
// @ts-nocheck
import { SuggestModal } from "obsidian";
import { KanbanDB } from "./kanban_db";

class TareaBusquedaModal extends SuggestModal {
    constructor(app, tareas, abrirEdicion) {
        super(app);
        this.tareas = tareas;
        this.abrirEdicion = abrirEdicion;
        this.limit = 32;
        this.setPlaceholder("🔍 Buscar por texto, proyecto o nota…");
        this.setInstructions([
            { command: "↑↓", purpose: "navegar" },
            { command: "↵", purpose: "abrir tarea" },
            { command: "Esc", purpose: "cerrar" }
        ]);
    }

    getSuggestions(query) {
        const q = query.toLowerCase().trim();
        const lista = q
            ? this.tareas.filter(t => {
                const blob = `${t.texto} ${t.proyecto} ${t.nota || ""}`.toLowerCase();
                return blob.includes(q);
            })
            : this.tareas;
        return lista.slice(0, this.limit);
    }

    renderSuggestion(tarea, el) {
        el.createEl("div", {
            text: tarea.texto,
            style: "font-weight: 600;"
        });
        el.createEl("small", {
            text: `${tarea.proyecto} · ${tarea.estado}`,
            style: "color: var(--text-muted);"
        });
    }

    onChooseSuggestion(tarea) {
        this.abrirEdicion(tarea);
    }
}

export function abrirBusquedaTareas(app, db, dbPath, onRefresh, abrirEdicion) {
    const tareas = KanbanDB.obtenerTodas(db);
    new TareaBusquedaModal(app, tareas, (tarea) =>
        abrirEdicion(db, dbPath, tarea.id, onRefresh)
    ).open();
}
