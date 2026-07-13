/* kanban_notes.ts — Notas .md derivadas de checklists del organizador */
// @ts-nocheck

export const CHECKLIST_NOTES_FOLDER = "Organizador/Notas";

export const KanbanNotes = {
    async asegurarCarpeta(app, rutaArchivo) {
        const partes = rutaArchivo.split("/").filter(Boolean);
        partes.pop();
        let acum = "";
        for (const parte of partes) {
            acum = acum ? `${acum}/${parte}` : parte;
            if (!app.vault.getAbstractFileByPath(acum)) {
                await app.vault.createFolder(acum);
            }
        }
    },

    sanitizarSegmento(texto) {
        return String(texto || "nota")
            .trim()
            .replace(/[\\/:*?"<>|]/g, "")
            .replace(/\s+/g, " ")
            .slice(0, 80) || "nota";
    },

    construirRutaNota(proyecto, textoTarea) {
        const proy = KanbanNotes.sanitizarSegmento(proyecto);
        const tarea = KanbanNotes.sanitizarSegmento(textoTarea);
        return `${CHECKLIST_NOTES_FOLDER}/${proy}/${tarea} — Checklist.md`;
    },

    rutaUnica(app, rutaBase) {
        if (!app.vault.getAbstractFileByPath(rutaBase)) return rutaBase;
        const sinExt = rutaBase.replace(/\.md$/i, "");
        let n = 2;
        while (app.vault.getAbstractFileByPath(`${sinExt} (${n}).md`)) n++;
        return `${sinExt} (${n}).md`;
    },

    construirContenidoMarkdown(tarea, subtareas) {
        const fecha = new Date().toISOString().slice(0, 10);
        const items = (subtareas || [])
            .filter(st => String(st.texto || "").trim())
            .map(st => `- [${st.completado ? "x" : " "}] ${String(st.texto).trim()}`)
            .join("\n");

        return `---
tipo: organizador-checklist-derivada
tarea_id: ${tarea.id}
proyecto: "${String(tarea.proyecto || "").replace(/"/g, '\\"')}"
derivada_de: "${String(tarea.texto || "").replace(/"/g, '\\"')}"
creado: ${fecha}
---

# Checklist: ${tarea.texto}

> Derivada de la tarea del organizador **${tarea.texto}** (proyecto: *${tarea.proyecto}*).

${items || "- [ ] "}
`;
    },

    async crearNotaDerivada(app, tarea, subtareas) {
        const subs = (subtareas || []).filter(st => String(st.texto || "").trim());
        if (!subs.length) throw new Error("La checklist está vacía.");

        let ruta = KanbanNotes.construirRutaNota(tarea.proyecto, tarea.texto);
        ruta = KanbanNotes.rutaUnica(app, ruta);
        await KanbanNotes.asegurarCarpeta(app, ruta);
        await app.vault.create(ruta, KanbanNotes.construirContenidoMarkdown(tarea, subs));
        return ruta;
    },

    async sincronizarNota(app, ruta, tarea, subtareas) {
        const file = app.vault.getAbstractFileByPath(ruta);
        if (!file) return false;
        await app.vault.modify(file, KanbanNotes.construirContenidoMarkdown(tarea, subtareas));
        return true;
    },

    async abrirNota(app, ruta) {
        const file = app.vault.getAbstractFileByPath(ruta);
        if (!file) return false;
        await app.workspace.openLinkText(ruta, "", false);
        return true;
    }
};
