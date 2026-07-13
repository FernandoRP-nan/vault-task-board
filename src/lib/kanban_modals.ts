/* kanban_modals.ts — migrado a módulo TS */
// @ts-nocheck
import { KanbanDB } from "./kanban_db";
import { KanbanNotes } from "./kanban_notes";
import { Modal, Setting, SuggestModal, Notice } from "obsidian";

// kanban_modals.js - Modales nativos para crear y editar tareas

/** Ajusta la altura del textarea al contenido visible. */
function ajustarAlturaTextarea(el) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
}

function enlazarTextareaAuto(el) {
    el.addEventListener("input", () => ajustarAlturaTextarea(el));
    ajustarAlturaTextarea(el);
    // Ejecutar en el siguiente ciclo por si el elemento aún no se ha añadido al DOM
    setTimeout(() => ajustarAlturaTextarea(el), 0);
}

function crearTextareaSubtarea(valor = "") {
    const txt = document.createElement("textarea");
    txt.className = "kanban-input kanban-subtarea-texto";
    txt.rows = 1;
    txt.value = valor;
    txt.placeholder = "Texto de la subtarea…";
    enlazarTextareaAuto(txt);
    return txt;
}

/** Reordenación drag & drop de subtareas en el modal. */
function enlazarReorderSubtareas(subLista, subtareas, renderSubtareas) {
    if (subLista.dataset.reorderBound) return;
    subLista.dataset.reorderBound = "1";

    let origenIdx = null;
    let objetivoEl = null;

    const limpiarDrop = () => {
        subLista.querySelectorAll(".kanban-subtarea-drop-target").forEach(el => {
            el.classList.remove("kanban-subtarea-drop-target");
        });
        objetivoEl = null;
    };

    subLista.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const fila = e.target.closest?.(".kanban-subtarea-fila");
        limpiarDrop();
        if (fila) {
            fila.classList.add("kanban-subtarea-drop-target");
            objetivoEl = fila;
        }
    });

    subLista.addEventListener("dragleave", (e) => {
        if (!subLista.contains(e.relatedTarget)) limpiarDrop();
    });

    subLista.addEventListener("drop", (e) => {
        e.preventDefault();
        const fila = e.target.closest?.(".kanban-subtarea-fila");
        limpiarDrop();
        if (origenIdx == null || !fila) return;
        const destinoIdx = parseInt(fila.dataset.idx, 10);
        if (!Number.isFinite(destinoIdx) || origenIdx === destinoIdx) return;
        const [item] = subtareas.splice(origenIdx, 1);
        subtareas.splice(destinoIdx, 0, item);
        origenIdx = null;
        renderSubtareas();
    });

    subLista.addEventListener("dragstart", (e) => {
        const grip = e.target.closest?.(".kanban-subtarea-grip");
        const fila = grip?.closest(".kanban-subtarea-fila");
        if (!fila) {
            e.preventDefault();
            return;
        }
        origenIdx = parseInt(fila.dataset.idx, 10);
        fila.classList.add("kanban-subtarea-arrastrando");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(origenIdx));
    });

    subLista.addEventListener("dragend", () => {
        origenIdx = null;
        limpiarDrop();
        subLista.querySelectorAll(".kanban-subtarea-arrastrando").forEach(el => {
            el.classList.remove("kanban-subtarea-arrastrando");
        });
    });
}

class ProyectoSuggestModal extends SuggestModal {
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

class TareaRequisitoSuggestModal extends SuggestModal {
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

class KanbanImagenSuggestModal extends SuggestModal {
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

class TareaFormModal extends Modal {
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
                    const carpeta = KanbanDB.KANBAN_IMAGEN_CARPETA;
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
                    new Notice("📷 Imagen guardada en la bóveda");
                    resolve(destino);
                } catch (err) {
                    new Notice("❌ No se pudo guardar la imagen: " + err.message);
                    resolve(null);
                }
            };
            input.click();
        });
    }

    _obtenerTareas() {
        return KanbanDB.obtenerTodas(this.db);
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
        this.requisitosSeleccionados = KanbanDB._filtrarRequisitosSinAncestros(
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
        contentEl.createEl("p", {
            cls: "kanban-modal-atajos",
            text: "Atajos: Enter en título → proyecto · Enter en nueva subtarea → añadir · Ctrl+Enter guardar · Ctrl+Shift+Enter añadir subtarea"
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
            const proyectosExistentes = KanbanDB.obtenerProyectos(this.db);
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
            const visibles = KanbanDB._filtrarRequisitosSinAncestros(this.requisitosSeleccionados, mapa);
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
                new Notice("⚠️ No hay otras tareas en este proyecto para usar como requisito.");
                return;
            }
            const idsExcluidos = KanbanDB.obtenerIdsExcluidosParaSugerenciaRequisitos(
                this.db, esEdicion ? this.datos.id : null, this.requisitosSeleccionados
            );
            const tareasElegibles = tareasDisponibles.filter(t => !idsExcluidos.includes(t.id));
            if (tareasElegibles.length === 0) {
                new Notice("⚠️ No hay más tareas válidas como requisito.");
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
        const inNuevaSub = subAcciones.createEl("textarea", {
            placeholder: "Nueva subtarea… (Enter guarda · Shift+Enter línea nueva)",
            cls: "kanban-input kanban-input-sub",
            attr: { rows: "1" }
        });
        enlazarTextareaAuto(inNuevaSub);

        inTexto.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            e.preventDefault();
            if (!inProyecto.value.trim()) {
                inProyecto.focus();
                return;
            }
            inNuevaSub.focus();
        });

        const renderSubtareas = () => {
            subLista.empty();
            if (this.subtareas.length === 0) {
                subLista.createEl("span", { text: "Sin subtareas", cls: "kanban-texto-vacio" });
                return;
            }
            this.subtareas.forEach((st, idx) => {
                const fila = subLista.createEl("div", { cls: "kanban-subtarea-fila" });
                fila.dataset.idx = String(idx);
                const grip = fila.createEl("span", {
                    cls: "kanban-subtarea-grip",
                    text: "⠿",
                    attr: { title: "Arrastrar para reordenar", draggable: "true" }
                });
                grip.draggable = true;
                const chk = fila.createEl("input", { type: "checkbox" });
                chk.checked = st.completado;
                chk.onchange = () => { st.completado = chk.checked; };
                const txt = crearTextareaSubtarea(st.texto);
                txt.oninput = () => { st.texto = txt.value; };
                fila.appendChild(txt);
                const btnConvertir = fila.createEl("button", {
                    text: "⇢",
                    cls: "kanban-subtarea-convertir",
                    attr: { title: "Convertir en tarea y elegir prerequisito o postrequisito" }
                });
                btnConvertir.onclick = async (e) => {
                    e.preventDefault();
                    if (!esEdicion) {
                        new Notice("⚠️ Guarda la tarea antes de convertir subtareas.");
                        return;
                    }
                    const textoSub = st.texto.trim();
                    if (!textoSub) {
                        new Notice("⚠️ La subtarea está vacía.");
                        return;
                    }
                    const tituloPadre = inTexto.value.trim() || this.datos.texto;
                    const tipoVinculo = await KanbanModals.elegirVinculoSubtarea(this.app, textoSub, tituloPadre);
                    if (!tipoVinculo) return;
                    try {
                        KanbanDB.actualizarTarea(this.db, this.dbPath, this.datos.id, {
                            texto: inTexto.value.trim(),
                            proyecto: inProyecto.value.trim(),
                            estado: inEstado.value,
                            nota: inNota.value.trim(),
                            imagenes: [...this.imagenes],
                            subtareas: this.subtareas
                                .map(s => ({ texto: s.texto.trim(), completado: !!s.completado }))
                                .filter(s => s.texto),
                            requisito_ids: [...this.requisitosSeleccionados]
                        });
                        const nuevaId = KanbanDB.convertirSubtareaATarea(
                            this.db, this.dbPath, this.datos.id, idx, tipoVinculo
                        );
                        const etiqueta = KanbanModals.etiquetaVinculoSubtarea(tipoVinculo);
                        new Notice(`✅ Tarea #${nuevaId} creada como ${etiqueta}.`);
                        this.subtareas.splice(idx, 1);
                        if (tipoVinculo === "prerequisito") {
                            const padre = KanbanDB.obtenerTodas(this.db).find(t => t.id === this.datos.id);
                            if (padre) {
                                this.requisitosSeleccionados = [...(padre.requisito_ids || [])];
                                renderChips();
                            }
                        }
                        renderSubtareas();
                        this.onSaved?.();
                    } catch (err) {
                        console.error("Error convirtiendo subtarea:", err);
                        new Notice(`❌ ${err?.message || "No se pudo convertir la subtarea."}`);
                    }
                };
                fila.createEl("button", { text: "✕", cls: "kanban-subtarea-quitar" }).onclick = (e) => {
                    e.preventDefault();
                    this.subtareas.splice(idx, 1);
                    renderSubtareas();
                };
            });
        };
        renderSubtareas();
        enlazarReorderSubtareas(subLista, this.subtareas, renderSubtareas);

        const agregarSub = () => {
            const texto = inNuevaSub.value.trim();
            if (!texto) return;
            this.subtareas.push({ texto, completado: false });
            inNuevaSub.value = "";
            enlazarTextareaAuto(inNuevaSub);
            renderSubtareas();
        };
        subAcciones.createEl("button", { text: "+ Añadir", attr: { title: "Añadir subtarea sin cerrar el formulario" } }).onclick = (e) => {
            e.preventDefault();
            agregarSub();
        };

        const btnNotaDerivada = subAcciones.createEl("button", {
            text: "📄 Convertir a nota",
            attr: { title: "Crea una nota .md en la bóveda y la vincula en la nota interna" }
        });
        const btnSubtareasATareas = subAcciones.createEl("button", {
            text: "⇢ Todas a tareas",
            attr: { title: "Convierte cada subtarea en tarea real; eliges prerequisito o postrequisito" }
        });
        const actualizarBtnNotaDerivada = () => {
            const ruta = KanbanDB.extraerRutaNotaChecklist(inNota?.value || this.datos?.nota);
            btnNotaDerivada.textContent = ruta ? "📄 Abrir nota derivada" : "📄 Convertir a nota";
        };

        const notaWrap = colDer.createEl("div", { cls: "kanban-campo kanban-campo-nota" });
        notaWrap.createEl("label", { text: "Nota interna:" });
        const inNota = notaWrap.createEl("textarea", {
            placeholder: "Detalles, enlaces, recordatorios, pasos...",
            cls: "kanban-input-nota kanban-input-nota-amplia"
        });
        if (esEdicion && this.datos.nota) inNota.value = this.datos.nota;
        actualizarBtnNotaDerivada();

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

        const proyectosExistentes = KanbanDB.obtenerProyectos(this.db);
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
                const dependientes = KanbanDB.obtenerDependientesDe(this.db, this.datos.id);
                let mensaje = `¿Eliminar "${this.datos.texto}"? Esta acción no se puede deshacer.`;
                if (dependientes.length > 0) {
                    const nombres = dependientes.slice(0, 3).map(t => t.texto).join(", ");
                    const extra = dependientes.length > 3 ? ` y ${dependientes.length - 3} más` : "";
                    mensaje += `\n\n${dependientes.length} tarea(s) perderán este requisito: ${nombres}${extra}.`;
                }
                if (!confirm(mensaje)) return;

                try {
                    KanbanDB.eliminarTarea(this.db, this.dbPath, this.datos.id);
                    new Notice("🗑️ Tarea eliminada.");
                    this.onSaved();
                    this.close();
                } catch (err) {
                    console.error("Error eliminando tarea:", err);
                    new Notice("❌ No se pudo eliminar la tarea.");
                }
            };
        }

        acciones.createEl("button", { text: "Cancelar" }).onclick = () => this.close();

        const btnGuardar = acciones.createEl("button", {
            text: esEdicion ? "Guardar Cambios" : "Crear Tarea",
            style: "background-color: var(--interactive-accent); color: var(--text-on-accent); font-weight: bold; border: none; padding: 8px 18px; border-radius: 6px;"
        });

        const guardarTarea = () => {
            const texto = inTexto.value.trim();
            const proyecto = inProyecto.value.trim();
            const estado = inEstado.value;

            if (!texto || !proyecto) {
                new Notice("⚠️ Texto y proyecto son obligatorios.");
                return;
            }

            if (esEdicion && this.requisitosSeleccionados.includes(this.datos.id)) {
                new Notice("❌ Una tarea no puede depender de sí misma.");
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
                    KanbanDB.crearTarea(this.db, this.dbPath, payload);
                    new Notice("✅ Tarea creada correctamente.");
                } else {
                    KanbanDB.actualizarTarea(this.db, this.dbPath, this.datos.id, payload);
                    new Notice("🔄 Tarea actualizada.");
                }
                try {
                    this.onSaved?.();
                } catch (refreshErr) {
                    console.error("Error refrescando tablero:", refreshErr);
                    new Notice("⚠️ Guardado OK, pero no se pudo refrescar la vista.");
                }
                this.close();
            } catch (err) {
                console.error("Error guardando tarea:", err);
                new Notice("❌ Error al guardar en la base de datos.");
            }
        };

        btnGuardar.onclick = () => guardarTarea();

        btnSubtareasATareas.onclick = async (e) => {
            e.preventDefault();
            if (!esEdicion) {
                new Notice("⚠️ Guarda la tarea antes de convertir subtareas.");
                return;
            }
            const subs = this.subtareas.filter(st => st.texto.trim());
            if (!subs.length) {
                new Notice("⚠️ No hay subtareas para convertir.");
                return;
            }
            const titulo = inTexto.value.trim() || this.datos.texto;
            const tipoVinculo = await KanbanModals.elegirVinculoSubtarea(
                this.app, `${subs.length} subtarea(s)`, titulo
            );
            if (!tipoVinculo) return;
            try {
                KanbanDB.actualizarTarea(this.db, this.dbPath, this.datos.id, {
                    texto: inTexto.value.trim(),
                    proyecto: inProyecto.value.trim(),
                    estado: inEstado.value,
                    nota: inNota.value.trim(),
                    imagenes: [...this.imagenes],
                    subtareas: subs.map(s => ({ texto: s.texto.trim(), completado: !!s.completado })),
                    requisito_ids: [...this.requisitosSeleccionados]
                });
                const ids = KanbanDB.convertirTodasSubtareasATareas(
                    this.db, this.dbPath, this.datos.id, tipoVinculo
                );
                const etiqueta = KanbanModals.etiquetaVinculoSubtarea(tipoVinculo);
                new Notice(`✅ ${ids.length} tarea(s) creadas como ${etiqueta}s.`);
                this.subtareas = [];
                if (tipoVinculo === "prerequisito") {
                    const padre = KanbanDB.obtenerTodas(this.db).find(t => t.id === this.datos.id);
                    if (padre) {
                        this.requisitosSeleccionados = [...(padre.requisito_ids || [])];
                        renderChips();
                    }
                }
                renderSubtareas();
                this.onSaved?.();
            } catch (err) {
                console.error("Error convirtiendo subtareas:", err);
                new Notice(`❌ ${err?.message || "No se pudieron convertir las subtareas."}`);
            }
        };

        btnNotaDerivada.onclick = async (e) => {
            e.preventDefault();
            const texto = inTexto.value.trim();
            const proyecto = inProyecto.value.trim();
            const estado = inEstado.value;
            const subs = this.subtareas
                .map(st => ({ texto: st.texto.trim(), completado: !!st.completado }))
                .filter(st => st.texto);

            if (!texto || !proyecto) {
                new Notice("⚠️ Texto y proyecto son obligatorios.");
                return;
            }
            if (!esEdicion) {
                new Notice("⚠️ Guarda la tarea antes de convertir la checklist a nota.");
                return;
            }

            const rutaExistente = KanbanDB.extraerRutaNotaChecklist(inNota.value)
                || KanbanDB.extraerRutaNotaChecklist(this.datos.nota);

            if (rutaExistente && this.app.vault.getAbstractFileByPath(rutaExistente)) {
                if (subs.length) {
                    await KanbanNotes.sincronizarNota(
                        this.app, rutaExistente,
                        { id: this.datos.id, texto, proyecto },
                        subs
                    );
                }
                await KanbanNotes.abrirNota(this.app, rutaExistente);
                return;
            }
            if (rutaExistente) {
                if (!subs.length) {
                    new Notice("⚠️ La nota se perdió en la bóveda. Añade subtareas para recrearla.");
                    return;
                }
                if (!confirm("La nota derivada no existe en la bóveda. ¿Recrearla desde la checklist actual?")) {
                    return;
                }
            } else if (!subs.length) {
                new Notice("⚠️ Añade al menos una subtarea en la checklist.");
                return;
            }

            try {
                this._compactarRequisitosSeleccionados();
                const payloadBase = {
                    texto,
                    proyecto,
                    estado,
                    imagenes: [...this.imagenes],
                    requisito_ids: [...this.requisitosSeleccionados]
                };
                KanbanDB.actualizarTarea(this.db, this.dbPath, this.datos.id, {
                    ...payloadBase,
                    nota: inNota.value.trim(),
                    subtareas: subs
                });

                const ruta = await KanbanNotes.crearNotaDerivada(
                    this.app,
                    { id: this.datos.id, texto, proyecto },
                    subs
                );
                const nuevaNota = KanbanDB._notaConVinculoChecklist(inNota.value, ruta, texto);
                KanbanDB.actualizarTarea(this.db, this.dbPath, this.datos.id, {
                    ...payloadBase,
                    nota: nuevaNota,
                    subtareas: []
                });

                inNota.value = nuevaNota;
                this.subtareas = [];
                renderSubtareas();
                actualizarBtnNotaDerivada();
                new Notice(`📄 Nota derivada creada y anexada a la tarea.`);
                await KanbanNotes.abrirNota(this.app, ruta);
                try {
                    this.onSaved?.();
                } catch (refreshErr) {
                    console.error("Error refrescando tablero:", refreshErr);
                }
            } catch (err) {
                console.error("Error convirtiendo checklist a nota:", err);
                new Notice(`❌ ${err?.message || "No se pudo crear la nota derivada."}`);
            }
        };

        inNuevaSub.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            if (e.shiftKey) return;
            if (e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            agregarSub();
        });

        contentEl.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            if (e.shiftKey) {
                if (document.activeElement === inNuevaSub) agregarSub();
                return;
            }
            guardarTarea();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

class ProyectosGestionModal extends Modal {
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
                        KanbanDB.restaurarProyecto(this.db, this.dbPath, p.nombre);
                        new Notice(`↩️ Proyecto "${p.nombre}" restaurado.`);
                    } else {
                        KanbanDB.archivarProyecto(this.db, this.dbPath, p.nombre);
                        if (this.proyectoFiltro === p.nombre) {
                            this.proyectoFiltro = "";
                            this.setProyectoFiltro("");
                        }
                        new Notice(`📦 Proyecto "${p.nombre}" archivado.`);
                    }
                    this.onSaved();
                    this.contentEl.empty();
                    this.onOpen();
                } catch (err) {
                    console.error(`Error al ${accion} proyecto:`, err);
                    new Notice(`❌ No se pudo ${verbo} el proyecto.`);
                }
            };

            const btnEliminar = fila.createEl("button", {
                text: "🗑️ Borrar",
                style: "color: var(--text-error); border-color: var(--text-error); margin-left: 8px;"
            });
            btnEliminar.onclick = () => {
                let mensaje = `¿Eliminar permanentemente el proyecto "${p.nombre}" y TODAS sus tareas asociadas?\nEsta acción no se puede deshacer.`;
                if (p.total > 0) {
                    mensaje += `\n\nSe eliminarán ${p.total} tarea(s).`;
                }
                if (!confirm(mensaje)) return;

                try {
                    KanbanDB.eliminarProyecto(this.db, this.dbPath, p.nombre);
                    if (this.proyectoFiltro === p.nombre) {
                        this.proyectoFiltro = "";
                        this.setProyectoFiltro("");
                    }
                    new Notice(`🗑️ Proyecto "${p.nombre}" y sus tareas eliminados.`);
                    this.onSaved();
                    this.contentEl.empty();
                    this.onOpen();
                } catch (err) {
                    console.error("Error al eliminar proyecto:", err);
                    new Notice("❌ No se pudo eliminar el proyecto.");
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

        const todos = KanbanDB.obtenerProyectos(this.db, { soloActivos: false });
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

class PapeleraModal extends Modal {
    constructor(app, db, dbPath, onSaved) {
        super(app);
        this.db = db;
        this.dbPath = dbPath;
        this.onSaved = onSaved;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", {
            text: "🗑️ Papelera de Reciclaje (30 días)",
            style: "margin-top: 0; margin-bottom: 8px; color: var(--text-accent);"
        });
        contentEl.createEl("p", {
            text: "Los elementos eliminados se conservan aquí por 30 días antes de ser purgados permanentemente.",
            style: "color: var(--text-muted); font-size: 0.9em; margin: 0 0 20px 0;"
        });

        const listContainer = contentEl.createEl("div", {
            style: "max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;"
        });

        const renderList = () => {
            listContainer.empty();
            const registros = KanbanDB.obtenerPapelera(this.db);
            if (registros.length === 0) {
                listContainer.createEl("p", {
                    text: "La papelera está vacía.",
                    style: "color: var(--text-muted); font-style: italic; text-align: center; padding: 20px;"
                });
                return;
            }

            registros.forEach(r => {
                const fila = listContainer.createEl("div", {
                    style: "display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--background-modifier-border); border-radius: 8px; background: var(--background-primary);"
                });

                const info = fila.createEl("div", { style: "display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; margin-right: 12px;" });
                
                const tipoLabel = r.tipo === "proyecto" ? "📁 Proyecto" : "🧪 Tarea";
                const titulo = info.createEl("div", { style: "font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" });
                titulo.textContent = `${tipoLabel}: ${r.nombreEntidad}`;

                const fecha = info.createEl("small", {
                    text: `Eliminado el: ${r.fecha}`,
                    style: "color: var(--text-muted); font-size: 0.8em;"
                });

                const acciones = fila.createEl("div", { style: "display: flex; gap: 8px; flex-shrink: 0;" });
                
                const btnRestaurar = acciones.createEl("button", {
                    text: "↩️ Restaurar",
                    style: "font-size: 0.85em; padding: 4px 8px;"
                });
                btnRestaurar.onclick = () => {
                    try {
                        KanbanDB.restaurarPapelera(this.db, this.dbPath, r.id);
                        new Notice(`↩️ Restaurado con éxito.`);
                        this.onSaved();
                        renderList();
                    } catch (err) {
                        console.error("Error restaurando:", err);
                        new Notice("❌ Error al restaurar.");
                    }
                };

                const btnBorrar = acciones.createEl("button", {
                    text: "🗑️ Borrar permanentemente",
                    style: "font-size: 0.85em; color: var(--text-error); border-color: var(--text-error); padding: 4px 8px;"
                });
                btnBorrar.onclick = () => {
                    if (!confirm("¿Eliminar permanentemente de la papelera? Esta acción no se puede deshacer.")) return;
                    try {
                        KanbanDB.eliminarPapeleraPermanente(this.db, this.dbPath, r.id);
                        new Notice("🗑️ Eliminado permanentemente.");
                        renderList();
                    } catch (err) {
                        console.error("Error borrando:", err);
                        new Notice("❌ Error al borrar.");
                    }
                };
            });
        };

        renderList();

        const accionesModal = contentEl.createEl("div", { cls: "kanban-formulario-acciones" });
        accionesModal.createEl("button", { text: "Cerrar" }).onclick = () => this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}

/** Modal para elegir si la tarea convertida es prerequisito o postrequisito de la origen. */
class VinculoSubtareaModal extends Modal {
    constructor(app, textoSub, textoPadre, onElegir, onCancel) {
        super(app);
        this.textoSub = textoSub;
        this.textoPadre = textoPadre;
        this.onElegir = onElegir;
        this.onCancel = onCancel;
        this._resuelto = false;
    }

    _cerrarCon(tipo) {
        this._resuelto = true;
        if (tipo) this.onElegir(tipo);
        else this.onCancel?.();
        this.close();
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("kanban-modal-vinculo-subtarea");
        contentEl.createEl("h2", { text: "⇢ Vincular tarea convertida", cls: "kanban-modal-tarea-titulo" });
        contentEl.createEl("p", {
            text: `«${this.textoSub}» pasará a ser tarea del organizador, derivada de «${this.textoPadre}».`,
            style: "color: var(--text-muted); margin: 0 0 16px 0;"
        });

        const mkOpcion = (tipo, titulo, desc, ejemplo) => {
            const bloque = contentEl.createEl("div", {
                cls: "kanban-vinculo-opcion",
                style: "border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 12px; margin-bottom: 10px;"
            });
            bloque.createEl("strong", { text: titulo });
            bloque.createEl("p", { text: desc, style: "margin: 6px 0 4px 0; color: var(--text-muted); font-size: 0.9em;" });
            bloque.createEl("small", { text: ejemplo, style: "color: var(--text-faint);" });
            bloque.createEl("button", { text: "Elegir", style: "margin-top: 8px;" }).onclick = (e) => {
                e.preventDefault();
                this._cerrarCon(tipo);
            };
        };

        mkOpcion(
            "prerequisito",
            "Prerequisito",
            "La nueva tarea debe completarse antes de poder avanzar la tarea origen.",
            `Diagrama: [${this.textoSub}] → [${this.textoPadre}]`
        );
        mkOpcion(
            "postrequisito",
            "Postrequisito",
            "La tarea origen debe completarse antes de poder avanzar la nueva tarea.",
            `Diagrama: [${this.textoPadre}] → [${this.textoSub}]`
        );

        contentEl.createEl("button", { text: "Cancelar", style: "margin-top: 8px;" }).onclick = (e) => {
            e.preventDefault();
            this._cerrarCon(null);
        };
    }

    onClose() {
        if (!this._resuelto) this.onCancel?.();
        this.contentEl.empty();
    }
}

function elegirVinculoSubtarea(app, textoSub, textoPadre) {
    return new Promise((resolve) => {
        new VinculoSubtareaModal(app, textoSub, textoPadre,
            (tipo) => resolve(tipo),
            () => resolve(null)
        ).open();
    });
}

function etiquetaVinculoSubtarea(tipo) {
    return tipo === "postrequisito" ? "postrequisito" : "prerequisito";
}

export const KanbanModals = {
    TareaFormModal,
    TareaRequisitoSuggestModal,
    ProyectoSuggestModal,
    ProyectosGestionModal,
    KanbanImagenSuggestModal,
    PapeleraModal,
    elegirVinculoSubtarea,
    etiquetaVinculoSubtarea
};
