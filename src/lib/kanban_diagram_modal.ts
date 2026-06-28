/* Modal de diagrama Mermaid a pantalla casi completa. */
// @ts-nocheck
import { Modal } from "obsidian";
import { KanbanUI } from "./kanban_ui";

export class DiagramaExpandidoModal extends Modal {
    constructor(app, opts) {
        super(app);
        this.opts = opts;
    }

    async onOpen() {
        const { contentEl, modalEl } = this;
        modalEl.addClass("kanban-modal-diagrama-expandido");
        contentEl.addClass("kanban-diagrama-expandido-content");

        contentEl.createEl("h2", {
            text: this.opts.titulo || "🔬 Mapa de dependencias",
            cls: "kanban-diagrama-expandido-titulo"
        });

        const host = contentEl.createEl("div", { cls: "kanban-diagrama-expandido-host" });
        await KanbanUI._renderBloqueMermaid(
            host,
            this.opts.tareas,
            this.opts.db,
            this.opts.dbPath,
            null,
            0,
            false,
            this.opts.onRefresh,
            this.opts.zoomKey,
            false
        );

        const pie = contentEl.createEl("div", { cls: "kanban-formulario-acciones" });
        pie.createEl("button", { text: "Cerrar" }).onclick = () => this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}
