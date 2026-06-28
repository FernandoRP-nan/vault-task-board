// kanban_modals.js - Modales nativos para crear y editar tareas

class ProyectoSuggestModal extends window.SuggestModal {
    constructor(app, proyectos, onSelect) {
        super(app);
        this.proyectos = proyectos;
        this.onSelect = onSelect;
        this.setPlaceholder("🔍 Buscar proyecto existente...");
    }

    getSuggestions(query) {
        const q = query.toLowerCase().trim();
        if (!q) return this.proyectos;
        return this.proyectos.filter(p => p.nombre.toLowerCase().includes(q));
    }

    renderSuggestion(proyecto, el) {
        el.createEl("div", { text: `📁 ${proyecto.nombre}`, style: "font-weight: 600;" });
        const tareasTxt = proyecto.total === 1 ? "1 tarea" : `${proyecto.total} tareas`;
        el.createEl("small", { text: tareasTxt, style: "color: var(--text-muted);" });
    }

    onChooseSuggestion(proyecto) {
        this.onSelect(proyecto.nombre);
    }
}

class TareaRequisitoSuggestModal extends window.SuggestModal {
    constructor(app, tareas, idsExcluidos, onSelect, proyectoFiltro = "") {
        super(app);
        const excluir = new Set(idsExcluidos || []);
        this.tareas = tareas.filter(t => !excluir.has(t.id));
        this.onSelect = onSelect;
        this.setPlaceholder(
            proyectoFiltro
                ? `🔍 Buscar requisito en "${proyectoFiltro}"...`
                : "🔍 Buscar tarea prerequisito..."
        );
    }

    getSuggestions(query) {
        const q = query.toLowerCase().trim();
        if (!q) return this.tareas;
        return this.tareas.filter(t =>
            t.texto.toLowerCase().includes(q) || t.proyecto.toLowerCase().includes(q)
        );
    }

    renderSuggestion(tarea, el) {
        el.createEl("div", {
            text: tarea.texto,
            style: "font-weight: 600; margin-bottom: 4px;"
        });
        el.createEl("small", {
            text: `${tarea.proyecto} — ${tarea.estado}`,
            style: "color: var(--text-muted);"
        });
    }

    onChooseSuggestion(tarea) {
        this.onSelect(tarea);
    }
}

class KanbanImagenSuggestModal extends window.SuggestModal {
    constructor(app, onSelect) {
        super(app);
        this.onSelect = onSelect;
        this.setPlaceholder("🔍 Buscar imagen en la bóveda...");
    }

    getSuggestions(query) {
        const extOk = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];
        const q = (query || "").toLowerCase();
        return this.app.vault.getFiles().filter(file => {
            if (!extOk.includes(file.extension.toLowerCase())) return false;
            if (!q) return true;
            return file.path.toLowerCase().includes(q) || file.name.toLowerCase().includes(q);
        });
    }

    renderSuggestion(file, el) {
        el.classList.add("kanban-suggest-img");
        const url = this.app.vault.adapter.getResourcePath(file.path);
        el.createEl("img", { attr: { src: url, alt: "" } });
        const txt = el.createEl("div", { style: "min-width: 0;" });
        txt.createEl("strong", { text: file.name });
        txt.createEl("small", { text: file.path, style: "color: var(--text-muted); display: block;" });
    }

    onChooseSuggestion(file) {
        this.onSelect(file.path);
        this.close();
    }
}

class TareaFormModal extends window.Modal {
    constructor(app, db, dbPath, datosEdicion, onSaved, proyectoPredeterminado = "") {
        super(app);
        this.db = db;
        this.dbPath = dbPath;
        this.datos = datosEdicion;
        this.onSaved = onSaved;
        this.proyectoPredeterminado = proyectoPredeterminado || "";
        this.requisitosSeleccionados = [...(datosEdicion?.requisito_ids || [])];
        this.subtareas = (datosEdicion?.subtareas || []).map(st => ({
            texto: st.texto,
            completado: !!st.completado
        }));
        this.imagenes = [...(datosEdicion?.imagenes || [])];
    }

    _urlImagen(ruta) {
        const limpia = (ruta || "").trim();
        if (!limpia) return "";
        const dest = this.app.metadataCache.getFirstLinkpathDest(limpia, "");
        if (dest) return this.app.vault.adapter.getResourcePath(dest.path);
        if (this.app.vault.getAbstractFileByPath(limpia)) {
            return this.app.vault.adapter.getResourcePath(limpia);
        }
        return "";
    }

    async _subirImagenPc(textoTarea) {
        return new Promise((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = async () => {
                const archivo = input.files?.[0];
                if (!archivo) return resolve(null);
                try {
                    const carpeta = window.KanbanDB.KANBAN_IMAGEN_CARPETA;
                    let acum = "";
                    for (const parte of carpeta.split("/").filter(Boolean)) {
                        acum = acum ? `${acum}/${parte}` : parte;
                        if (!this.app.vault.getAbstractFileByPath(acum)) {
                            await this.app.vault.createFolder(acum);
                        }
                    }
                    const base = (textoTarea || "tarea").toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tarea";
                    const ext = archivo.name.includes(".")
                        ? archivo.name.slice(archivo.name.lastIndexOf(".")).toLowerCase()
                        : ".jpg";
                    let destino = `${carpeta}/${base}${ext}`;
                    let n = 1;
                    while (this.app.vault.getAbstractFileByPath(destino)) {
                        destino = `${carpeta}/${base}-${n++}${ext}`;
                    }
                    await this.app.vault.createBinary(destino, new Uint8Array(await archivo.arrayBuffer()));
                    new window.Notice("📷 Imagen guardada en la bóveda");
                    resolve(destino);
                } catch (err) {
                    new window.Notice("❌ No se pudo guardar la imagen: " + err.message);
                    resolve(null);
                }
            };
            input.click();
        });
    }

    _obtenerTareas() {
        return window.KanbanDB.obtenerTodas(this.db);
    }

    _obtenerTareasPorProyecto(proyecto) {
        const todas = this._obtenerTareas();
        if (!proyecto) return todas;
        return todas.filter(t => t.proyecto === proyecto);
    }

    _limpiarRequisitosSiProyectoCambia(inProyecto, renderChips) {
        const proyecto = inProyecto.value.trim();
        if (!proyecto) return;
        const todas = this._obtenerTareas();
        this.requisitosSeleccionados = this.requisitosSeleccionados.filter(id => {
            const req = todas.find(t => t.id === id);
            return req && req.proyecto === proyecto;
        });
        this._compactarRequisitosSeleccionados();
        renderChips();
    }

    _compactarRequisitosSeleccionados() {
        const mapa = new Map(this._obtenerTareas().map(t => [t.id, t]));
        this.requisitosSeleccionados = window.KanbanDB._filtrarRequisitosSinAncestros(
            this.requisitosSeleccionados, mapa
        );
    }

    onOpen() {
        const { contentEl } = this;
        const esEdicion = this.datos !== null;
        if (esEdicion) this._compactarRequisitosSeleccionados();

        contentEl.classList.add("kanban-modal-tarea");
        contentEl.createEl("h2", {
            text: esEdicion ? "✏️ Editar Tarea" : "🧪 Nueva Tarea",
            cls: "kanban-modal-tarea-titulo"
        });

        const formDoble = contentEl.createEl("div", { cls: "kanban-form-doble" });
        const colIzq = formDoble.createEl("div", { cls: "kanban-form-columna kanban-form-columna-izq" });
        const colDer = formDoble.createEl("div", { cls: "kanban-form-columna kanban-form-columna-der" });

        const campo = (parent, label, crear) => {
            const wrap = parent.createEl("div", { cls: "kanban-campo" });
            wrap.createEl("label", { text: label });
            return crear(wrap);
        };

        const inTexto = campo(colIzq, "Texto de la tarea *:", w =>
            w.createEl("input", { type: "text", placeholder: "Ej. Investigar componente X", cls: "kanban-input" })
        );
        if (esEdicion) inTexto.value = this.datos.texto;

        const inProyecto = campo(colIzq, "Proyecto *:", w => {
            const fila = w.createEl("div", { cls: "kanban-fila-proyecto" });
            const input = fila.createEl("input", {
                type: "text", placeholder: "Escribe o selecciona un proyecto",
                cls: "kanban-input", attr: { "data-kanban-in-proyecto": "1" }
            });
            const proyectosExistentes = window.KanbanDB.obtenerProyectos(this.db);
            if (proyectosExistentes.length > 0) {
                const datalistId = `kanban-proyectos-${Date.now()}`;
                const datalist = w.createEl("datalist", { attr: { id: datalistId } });
                proyectosExistentes.forEach(p => datalist.createEl("option", { attr: { value: p.nombre } }));
                input.setAttribute("list", datalistId);
                fila.createEl("button", { text: "📁 Elegir", attr: { "data-kanban-proyecto-btn": "1" } });
            }
            return input;
        });
        if (esEdicion) inProyecto.value = this.datos.proyecto;
        else if (this.proyectoPredeterminado) inProyecto.value = this.proyectoPredeterminado;

        const inEstado = campo(colIzq, "Estado:", w => {
            const sel = w.createEl("select", { cls: "kanban-input" });
            ["Por Hacer", "En Proceso", "Terminado"].forEach(est => {
                const opt = sel.createEl("option", { text: est, value: est });
                if (esEdicion && this.datos.estado === est) opt.selected = true;
            });
            return sel;
        });

        const reqWrap = colIzq.createEl("div", { cls: "kanban-campo" });
        reqWrap.createEl("label", { text: "Requisitos (dependencias):" });
        const chipsContainer = reqWrap.createEl("div", { cls: "kanban-chips-requisitos" });
        const reqAcciones = reqWrap.createEl("div", { cls: "kanban-fila-acciones" });

        const renderChips = () => {
            chipsContainer.empty();
            const todas = this._obtenerTareas();
            const mapa = new Map(todas.map(t => [t.id, t]));
            const visibles = window.KanbanDB._filtrarRequisitosSinAncestros(this.requisitosSeleccionados, mapa);
            if (visibles.length === 0) {
                chipsContainer.createEl("span", {
                    text: "Sin requisitos",
                    cls: "kanban-texto-vacio"
                });
                return;
            }
            visibles.forEach(id => {
                const t = todas.find(x => x.id === id);
                const chip = chipsContainer.createEl("span", { cls: "kanban-chip-req" });
                chip.createEl("span", { text: t ? t.texto : "Tarea eliminada" });
                chip.createEl("button", { text: "✕", cls: "kanban-chip-quitar" }).onclick = (e) => {
                    e.preventDefault();
                    this.requisitosSeleccionados = this.requisitosSeleccionados.filter(x => x !== id);
                    this._compactarRequisitosSeleccionados();
                    renderChips();
                };
            });
        };
        renderChips();

        reqAcciones.createEl("button", { text: "🔗 Añadir requisito" }).onclick = (e) => {
            e.preventDefault();
            const proyectoActual = inProyecto.value.trim();
            const tareasDisponibles = this._obtenerTareasPorProyecto(proyectoActual);
            if (proyectoActual && tareasDisponibles.length === 0) {
                new window.Notice("⚠️ No hay otras tareas en este proyecto para usar como requisito.");
                return;
            }
            const idsExcluidos = window.KanbanDB.obtenerIdsExcluidosParaSugerenciaRequisitos(
                this.db, esEdicion ? this.datos.id : null, this.requisitosSeleccionados
            );
            const tareasElegibles = tareasDisponibles.filter(t => !idsExcluidos.includes(t.id));
            if (tareasElegibles.length === 0) {
                new window.Notice("⚠️ No hay más tareas válidas como requisito.");
                return;
            }
            new TareaRequisitoSuggestModal(this.app, tareasElegibles, idsExcluidos, (tarea) => {
                if (!this.requisitosSeleccionados.includes(tarea.id)) {
                    this.requisitosSeleccionados.push(tarea.id);
                    this._compactarRequisitosSeleccionados();
                    renderChips();
                }
            }, proyectoActual).open();
        };
        reqAcciones.createEl("button", { text: "Limpiar" }).onclick = (e) => {
            e.preventDefault();
            this.requisitosSeleccionados = [];
            renderChips();
        };

        const subWrap = colIzq.createEl("div", { cls: "kanban-campo" });
        subWrap.createEl("label", { text: "Checklist interna:" });
        const subLista = subWrap.createEl("div", { cls: "kanban-subtareas-lista" });
        const subAcciones = subWrap.createEl("div", { cls: "kanban-fila-acciones" });
        const inNuevaSub = subAcciones.createEl("input", {
            type: "text", placeholder: "Nueva subtarea...", cls: "kanban-input kanban-input-sub"
        });

        const renderSubtareas = () => {
            subLista.empty();
            if (this.subtareas.length === 0) {
                subLista.createEl("span", { text: "Sin subtareas", cls: "kanban-texto-vacio" });
                return;
            }
            this.subtareas.forEach((st, idx) => {
                const fila = subLista.createEl("div", { cls: "kanban-subtarea-fila" });
                const chk = fila.createEl("input", { type: "checkbox" });
                chk.checked = st.completado;
                chk.onchange = () => { st.completado = chk.checked; };
                const txt = fila.createEl("input", {
                    type: "text", value: st.texto, cls: "kanban-input kanban-subtarea-texto"
                });
                txt.oninput = () => { st.texto = txt.value; };
                fila.createEl("button", { text: "✕", cls: "kanban-subtarea-quitar" }).onclick = (e) => {
                    e.preventDefault();
                    this.subtareas.splice(idx, 1);
                    renderSubtareas();
                };
            });
        };
        renderSubtareas();

        const agregarSub = () => {
            const texto = inNuevaSub.value.trim();
            if (!texto) return;
            this.subtareas.push({ texto, completado: false });
            inNuevaSub.value = "";
            renderSubtareas();
        };
        subAcciones.createEl("button", { text: "+ Añadir" }).onclick = (e) => {
            e.preventDefault();
            agregarSub();
        };
        inNuevaSub.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); agregarSub(); }
        });

        const notaWrap = colDer.createEl("div", { cls: "kanban-campo kanban-campo-nota" });
        notaWrap.createEl("label", { text: "Nota interna:" });
        const inNota = notaWrap.createEl("textarea", {
            placeholder: "Detalles, enlaces, recordatorios, pasos...",
            cls: "kanban-input-nota kanban-input-nota-amplia"
        });
        if (esEdicion && this.datos.nota) inNota.value = this.datos.nota;

        const imgWrap = colDer.createEl("div", { cls: "kanban-campo" });
        imgWrap.createEl("label", { text: "Imágenes adjuntas:" });
        const imgGaleria = imgWrap.createEl("div", { cls: "kanban-imagenes-galeria" });
        const imgAcciones = imgWrap.createEl("div", { cls: "kanban-fila-acciones" });

        const renderImagenes = () => {
            imgGaleria.empty();
            if (this.imagenes.length === 0) {
                imgGaleria.createEl("span", { text: "Sin imágenes", cls: "kanban-texto-vacio" });
                return;
            }
            this.imagenes.forEach((ruta, idx) => {
                const item = imgGaleria.createEl("div", { cls: "kanban-imagen-item" });
                const url = this._urlImagen(ruta);
                if (url) item.createEl("img", { attr: { src: url, alt: "" } });
                else item.createEl("span", { text: "🖼️", cls: "kanban-imagen-fallback" });
                item.createEl("small", { text: ruta.split("/").pop(), cls: "kanban-imagen-nombre" });
                item.createEl("button", { text: "✕", cls: "kanban-imagen-quitar" }).onclick = (e) => {
                    e.preventDefault();
                    this.imagenes.splice(idx, 1);
                    renderImagenes();
                };
            });
        };
        renderImagenes();

        const agregarImagen = (ruta) => {
            const limpia = (ruta || "").trim();
            if (!limpia || this.imagenes.includes(limpia)) return;
            this.imagenes.push(limpia);
            renderImagenes();
        };

        imgAcciones.createEl("button", { text: "📁 Bóveda" }).onclick = (e) => {
            e.preventDefault();
            new KanbanImagenSuggestModal(this.app, agregarImagen).open();
        };
        imgAcciones.createEl("button", { text: "💻 Subir" }).onclick = async (e) => {
            e.preventDefault();
            const ruta = await this._subirImagenPc(inTexto.value.trim());
            if (ruta) agregarImagen(ruta);
        };

        const proyectosExistentes = window.KanbanDB.obtenerProyectos(this.db);
        const btnElegirProyecto = colIzq.querySelector("[data-kanban-proyecto-btn]");
        if (btnElegirProyecto) {
            btnElegirProyecto.onclick = (e) => {
                e.preventDefault();
                new ProyectoSuggestModal(this.app, proyectosExistentes, (nombre) => {
                    inProyecto.value = nombre;
                    this._limpiarRequisitosSiProyectoCambia(inProyecto, renderChips);
                }).open();
            };
        }
        inProyecto.addEventListener("input", () => {
            this._limpiarRequisitosSiProyectoCambia(inProyecto, renderChips);
        });

        const acciones = contentEl.createEl("div", { cls: "kanban-formulario-acciones" });

        if (esEdicion) {
            const btnEliminar = acciones.createEl("button", {
                text: "🗑️ Eliminar tarea",
                style: "margin-right: auto; color: var(--text-error); border-color: var(--text-error);"
            });
            btnEliminar.onclick = () => {
                const dependientes = window.KanbanDB.obtenerDependientesDe(this.db, this.datos.id);
                let mensaje = `¿Eliminar "${this.datos.texto}"? Esta acción no se puede deshacer.`;
                if (dependientes.length > 0) {
                    const nombres = dependientes.slice(0, 3).map(t => t.texto).join(", ");
                    const extra = dependientes.length > 3 ? ` y ${dependientes.length - 3} más` : "";
                    mensaje += `\n\n${dependientes.length} tarea(s) perderán este requisito: ${nombres}${extra}.`;
                }
                if (!confirm(mensaje)) return;

                try {
                    window.KanbanDB.eliminarTarea(this.db, this.dbPath, this.datos.id);
                    new window.Notice("🗑️ Tarea eliminada.");
                    this.onSaved();
                    this.close();
                } catch (err) {
                    console.error("Error eliminando tarea:", err);
                    new window.Notice("❌ No se pudo eliminar la tarea.");
                }
            };
        }

        acciones.createEl("button", { text: "Cancelar" }).onclick = () => this.close();

        const btnGuardar = acciones.createEl("button", {
            text: esEdicion ? "Guardar Cambios" : "Crear Tarea",
            style: "background-color: var(--interactive-accent); color: var(--text-on-accent); font-weight: bold; border: none; padding: 8px 18px; border-radius: 6px;"
        });

        btnGuardar.onclick = () => {
            const texto = inTexto.value.trim();
            const proyecto = inProyecto.value.trim();
            const estado = inEstado.value;

            if (!texto || !proyecto) {
                new window.Notice("⚠️ Texto y proyecto son obligatorios.");
                return;
            }

            if (esEdicion && this.requisitosSeleccionados.includes(this.datos.id)) {
                new window.Notice("❌ Una tarea no puede depender de sí misma.");
                return;
            }

            try {
                this._compactarRequisitosSeleccionados();
                const payload = {
                    texto,
                    proyecto,
                    estado,
                    nota: inNota.value.trim(),
                    imagenes: [...this.imagenes],
                    subtareas: this.subtareas
                        .map(st => ({ texto: st.texto.trim(), completado: !!st.completado }))
                        .filter(st => st.texto),
                    requisito_ids: [...this.requisitosSeleccionados]
                };
                if (!esEdicion) {
                    window.KanbanDB.crearTarea(this.db, this.dbPath, payload);
                    new window.Notice("✅ Tarea creada correctamente.");
                } else {
                    window.KanbanDB.actualizarTarea(this.db, this.dbPath, this.datos.id, payload);
                    new window.Notice("🔄 Tarea actualizada.");
                }
                this.onSaved();
                this.close();
            } catch (err) {
                console.error("Error guardando tarea:", err);
                new window.Notice("❌ Error al guardar en la base de datos.");
            }
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}

class ProyectosGestionModal extends window.Modal {
    constructor(app, db, dbPath, proyectoFiltro, setProyectoFiltro, onSaved) {
        super(app);
        this.db = db;
        this.dbPath = dbPath;
        this.proyectoFiltro = proyectoFiltro || "";
        this.setProyectoFiltro = setProyectoFiltro;
        this.onSaved = onSaved;
    }

    _renderLista(seccion, proyectos, esArchivado) {
        if (proyectos.length === 0) {
            seccion.createEl("p", {
                text: esArchivado ? "No hay proyectos archivados." : "No hay proyectos activos.",
                style: "color: var(--text-muted); font-style: italic; margin: 0 0 12px 0;"
            });
            return;
        }

        const lista = seccion.createEl("div", { cls: "kanban-proyectos-lista" });
        proyectos.forEach(p => {
            const fila = lista.createEl("div", { cls: "kanban-proyecto-fila" });
            const info = fila.createEl("div", { cls: "kanban-proyecto-info" });
            info.createEl("div", {
                text: `📁 ${p.nombre}`,
                style: "font-weight: 600;"
            });
            const tareasTxt = p.total === 1 ? "1 tarea" : `${p.total} tareas`;
            info.createEl("small", { text: tareasTxt, style: "color: var(--text-muted);" });

            const btn = fila.createEl("button", {
                text: esArchivado ? "↩️ Restaurar" : "📦 Archivar",
                cls: esArchivado ? "kanban-proyecto-btn-restaurar" : "kanban-proyecto-btn-archivar"
            });
            btn.onclick = () => {
                const accion = esArchivado ? "restaurar" : "archivar";
                const verbo = esArchivado ? "restaurar" : "archivar";
                if (!confirm(`¿${verbo.charAt(0).toUpperCase() + verbo.slice(1)} el proyecto "${p.nombre}"?`)) return;

                try {
                    if (esArchivado) {
                        window.KanbanDB.restaurarProyecto(this.db, this.dbPath, p.nombre);
                        new window.Notice(`↩️ Proyecto "${p.nombre}" restaurado.`);
                    } else {
                        window.KanbanDB.archivarProyecto(this.db, this.dbPath, p.nombre);
                        if (this.proyectoFiltro === p.nombre) {
                            this.proyectoFiltro = "";
                            this.setProyectoFiltro("");
                        }
                        new window.Notice(`📦 Proyecto "${p.nombre}" archivado.`);
                    }
                    this.onSaved();
                    this.contentEl.empty();
                    this.onOpen();
                } catch (err) {
                    console.error(`Error al ${accion} proyecto:`, err);
                    new window.Notice(`❌ No se pudo ${verbo} el proyecto.`);
                }
            };
        });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", {
            text: "📦 Gestionar Proyectos",
            style: "margin-top: 0; margin-bottom: 8px; color: var(--text-accent);"
        });
        contentEl.createEl("p", {
            text: "Los proyectos archivados y sus tareas dejan de mostrarse en el organizador. Puedes restaurarlos cuando quieras.",
            style: "color: var(--text-muted); font-size: 0.9em; margin: 0 0 20px 0;"
        });

        const todos = window.KanbanDB.obtenerProyectos(this.db, { soloActivos: false });
        const activos = todos.filter(p => !p.archivado);
        const archivados = todos.filter(p => p.archivado);

        const secActivos = contentEl.createEl("div", { cls: "kanban-proyectos-seccion" });
        secActivos.createEl("h3", {
            text: `Activos (${activos.length})`,
            style: "margin: 0 0 10px 0; font-size: 0.95em;"
        });
        this._renderLista(secActivos, activos, false);

        const secArchivados = contentEl.createEl("div", { cls: "kanban-proyectos-seccion" });
        secArchivados.createEl("h3", {
            text: `Archivados (${archivados.length})`,
            style: "margin: 20px 0 10px 0; font-size: 0.95em; color: var(--text-muted);"
        });
        this._renderLista(secArchivados, archivados, true);

        const acciones = contentEl.createEl("div", { cls: "kanban-formulario-acciones" });
        acciones.createEl("button", { text: "Cerrar" }).onclick = () => this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}

window.KanbanModals = {
    TareaFormModal,
    TareaRequisitoSuggestModal,
    ProyectoSuggestModal,
    ProyectosGestionModal,
    KanbanImagenSuggestModal
};
