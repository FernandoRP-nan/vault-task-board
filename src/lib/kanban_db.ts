/* kanban_db.ts — migrado a módulo TS */
// @ts-nocheck
import { ScriptsRuntime } from "../runtime/scripts-runtime";

/* kanban_db.js - Persistencia SQLite para tareas con dependencias */

export const KanbanDB = {
    SCHEMA_TAREAS: `CREATE TABLE IF NOT EXISTS tareas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        texto TEXT NOT NULL,
        proyecto TEXT NOT NULL,
        estado TEXT CHECK( estado IN ('Por Hacer','En Proceso','Terminado') ) DEFAULT 'Por Hacer',
        requisito_id INTEGER NULL,
        nota TEXT DEFAULT '',
        FOREIGN KEY(requisito_id) REFERENCES tareas(id) ON DELETE SET NULL
    );`,

    SCHEMA_REQUISITOS: `CREATE TABLE IF NOT EXISTS tarea_requisitos (
        tarea_id INTEGER NOT NULL,
        requisito_id INTEGER NOT NULL,
        PRIMARY KEY (tarea_id, requisito_id),
        FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE,
        FOREIGN KEY (requisito_id) REFERENCES tareas(id) ON DELETE CASCADE
    );`,

    SCHEMA_PROYECTOS: `CREATE TABLE IF NOT EXISTS proyectos (
        nombre TEXT PRIMARY KEY,
        archivado INTEGER DEFAULT 0
    );`,

    SCHEMA_SUBTAREAS: `CREATE TABLE IF NOT EXISTS tarea_subtareas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tarea_id INTEGER NOT NULL,
        texto TEXT NOT NULL,
        completado INTEGER DEFAULT 0,
        orden INTEGER DEFAULT 0,
        FOREIGN KEY (tarea_id) REFERENCES tareas(id) ON DELETE CASCADE
    );`,

    KANBAN_IMAGEN_CARPETA: "Adjuntos/Organizador",
    DB_RELATIVE: ".obsidian/plugins-data/vault-task-board/kanban_tareas.db",
    SCHEMA_PAPELERA: `CREATE TABLE IF NOT EXISTS papelera (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT CHECK( tipo IN ('tarea','proyecto') ) NOT NULL,
        nombre_entidad TEXT NOT NULL,
        datos_json TEXT NOT NULL,
        fecha_eliminacion TEXT DEFAULT (datetime('now', 'localtime'))
    );`,

    // Apertura síncrona desde disco (misma lógica que init; Agenda y Organizador comparten archivo)
    abrirSync: (SQL, dbPath) => ScriptsRuntime.abrirDb(SQL, dbPath, (db, esNueva) => {
        db.run(KanbanDB.SCHEMA_TAREAS);
        db.run(KanbanDB.SCHEMA_REQUISITOS);
        db.run(KanbanDB.SCHEMA_PROYECTOS);
        db.run(KanbanDB.SCHEMA_SUBTAREAS);
        db.run(KanbanDB.SCHEMA_PAPELERA);
        db.run("DELETE FROM papelera WHERE datetime(fecha_eliminacion) < datetime('now', 'localtime', '-30 days')");
        KanbanDB._migrarEsquema(db, esNueva ? null : dbPath);
        KanbanDB._sincronizarProyectosDesdeTareas(db);
        db.run(`INSERT OR IGNORE INTO tarea_requisitos (tarea_id, requisito_id)
            SELECT id, requisito_id FROM tareas WHERE requisito_id IS NOT NULL`);
    }),

    init: async (SQL, dbPath) => {
        if (!ScriptsRuntime.puedeUsarFs()) {
            await ScriptsRuntime.leerBinarioAsync(dbPath);
        }
        return KanbanDB.abrirSync(SQL, dbPath);
    },

    _marcaAgenda: (agendaId) => `<!-- agenda:${agendaId} -->`,

    _marcaChecklistNote: (ruta) => `<!-- checklist-note:${ruta} -->`,

    extraerRutaNotaChecklist: (nota) => {
        const m = String(nota || "").match(/<!--\s*checklist-note:([^>]+)\s*-->/);
        return m ? m[1].trim() : "";
    },

    /** ID de la tarea padre si la tarea proviene de una subtarea de checklist. */
    extraerPadreDerivada: (nota) => {
        const m = String(nota || "").match(/<!--\s*organizador-derivada:(\d+)\s*-->/);
        return m ? parseInt(m[1], 10) : null;
    },

    limpiarNotaParaVista: (nota) => String(nota || "")
        .replace(/\n?<!--\s*checklist-note:[^>]+-->/g, "")
        .replace(/\n?<!--\s*agenda:[^>]+-->/g, "")
        .trim(),

    _notaConVinculoChecklist: (notaActual, rutaNota, tituloTarea) => {
        if (KanbanDB.extraerRutaNotaChecklist(notaActual) === rutaNota) return notaActual;
        const limpia = KanbanDB.limpiarNotaParaVista(notaActual)
            .replace(/\n?\[\[[^\]]+\|📋 Checklist:[^\]]+\]\]/g, "")
            .trim();
        const linkName = rutaNota.replace(/\.md$/i, "");
        const wikilink = `[[${linkName}|📋 Checklist: ${tituloTarea}]]`;
        const marca = KanbanDB._marcaChecklistNote(rutaNota);
        return limpia ? `${limpia}\n\n${wikilink}\n${marca}` : `${wikilink}\n${marca}`;
    },

    _notaConMarcaAgenda: (notas, agendaId) => {
        const marca = KanbanDB._marcaAgenda(agendaId);
        const limpia = String(notas || "").replace(/\n?<!-- agenda:[^>]+ -->/g, "").trim();
        return limpia ? `${limpia}\n${marca}` : marca;
    },

    buscarIdPorAgendaId: (db, agendaId) => {
        const stmt = db.prepare("SELECT id FROM tareas WHERE nota LIKE ? LIMIT 1");
        stmt.bind([`%<!-- agenda:${agendaId} -->%`]);
        const id = stmt.step() ? stmt.get()[0] : 0;
        stmt.free();
        return id || 0;
    },

    _migrarEsquema: (db, dbPath) => {
        const columnas = db.exec("PRAGMA table_info(tareas)");
        const nombres = (columnas[0]?.values || []).map(c => c[1]);
        let cambio = false;
        if (!nombres.includes("nota")) {
            db.run("ALTER TABLE tareas ADD COLUMN nota TEXT DEFAULT ''");
            cambio = true;
        }
        if (!nombres.includes("imagenes")) {
            db.run("ALTER TABLE tareas ADD COLUMN imagenes TEXT DEFAULT '[]'");
            cambio = true;
        }
        if (!nombres.includes("archivada")) {
            db.run("ALTER TABLE tareas ADD COLUMN archivada INTEGER DEFAULT 0");
            cambio = true;
        }
        if (cambio && dbPath) KanbanDB.guardar(db, dbPath);
    },

    _parseImagenes: (valor) => {
        if (!valor) return [];
        try {
            const arr = JSON.parse(valor);
            return Array.isArray(arr) ? arr.filter(p => typeof p === "string" && p.trim()) : [];
        } catch {
            return [];
        }
    },

    _serializarImagenes: (lista) => JSON.stringify([...(lista || [])].filter(p => String(p).trim())),

    _obtenerMapaSubtareas: (db) => {
        const mapa = new Map();
        const stmt = db.prepare(
            "SELECT id, tarea_id, texto, completado FROM tarea_subtareas ORDER BY orden ASC, id ASC"
        );
        while (stmt.step()) {
            const [id, tareaId, texto, completado] = stmt.get();
            if (!mapa.has(tareaId)) mapa.set(tareaId, []);
            mapa.get(tareaId).push({ id, texto, completado: !!completado });
        }
        stmt.free();
        return mapa;
    },

    guardarSubtareas: (db, tareaId, subtareas) => {
        db.run("DELETE FROM tarea_subtareas WHERE tarea_id = ?", [tareaId]);
        const stmt = db.prepare(
            "INSERT INTO tarea_subtareas (tarea_id, texto, completado, orden) VALUES (?, ?, ?, ?)"
        );
        (subtareas || []).forEach((st, idx) => {
            const texto = String(st.texto || "").trim();
            if (!texto) return;
            stmt.run([tareaId, texto, st.completado ? 1 : 0, idx]);
        });
        stmt.free();
    },

    _marcaDerivadaChecklist: (tareaPadreId) => `<!-- organizador-derivada:${tareaPadreId} -->`,

    // Convierte una subtarea de checklist en tarea real; tipoVinculo: prerequisito | postrequisito
    convertirSubtareaATarea: (db, dbPath, tareaPadreId, indiceSubtarea, tipoVinculo = "prerequisito") => {
        if (!["prerequisito", "postrequisito"].includes(tipoVinculo)) {
            throw new Error("Tipo de vínculo no válido");
        }

        const todas = KanbanDB.obtenerTodas(db);
        const padre = todas.find(t => t.id === tareaPadreId);
        if (!padre) throw new Error("Tarea no encontrada");

        const subtareas = [...(padre.subtareas || [])];
        const st = subtareas[indiceSubtarea];
        if (!st) throw new Error("Subtarea no encontrada");

        const texto = String(st.texto || "").trim();
        if (!texto) throw new Error("La subtarea está vacía");

        const marca = KanbanDB._marcaDerivadaChecklist(tareaPadreId);
        const nuevaId = KanbanDB.crearTarea(db, dbPath, {
            texto,
            proyecto: padre.proyecto,
            estado: st.completado ? "Terminado" : "Por Hacer",
            nota: `Derivada de checklist de «${padre.texto}».\n${marca}`,
            imagenes: [],
            subtareas: [],
            requisito_ids: tipoVinculo === "postrequisito" ? [tareaPadreId] : []
        });

        subtareas.splice(indiceSubtarea, 1);

        let reqsPadre = [...(padre.requisito_ids || [])];
        if (tipoVinculo === "prerequisito") reqsPadre.push(nuevaId);

        const mapa = new Map(KanbanDB.obtenerTodas(db).map(t => [t.id, t]));
        const reqsCompactos = KanbanDB._filtrarRequisitosSinAncestros(reqsPadre, mapa);

        KanbanDB.actualizarTarea(db, dbPath, tareaPadreId, {
            texto: padre.texto,
            proyecto: padre.proyecto,
            estado: padre.estado,
            nota: padre.nota,
            imagenes: padre.imagenes || [],
            subtareas,
            requisito_ids: reqsCompactos
        });

        return nuevaId;
    },

    convertirTodasSubtareasATareas: (db, dbPath, tareaPadreId, tipoVinculo = "prerequisito") => {
        const padre = KanbanDB.obtenerTodas(db).find(t => t.id === tareaPadreId);
        if (!padre) throw new Error("Tarea no encontrada");
        const total = (padre.subtareas || []).length;
        if (!total) throw new Error("No hay subtareas para convertir");

        const ids = [];
        for (let i = total - 1; i >= 0; i--) {
            ids.unshift(KanbanDB.convertirSubtareaATarea(db, dbPath, tareaPadreId, i, tipoVinculo));
        }
        return ids;
    },

    guardar: (db, dbPath) => ScriptsRuntime.guardarDb(db, dbPath),

    _obtenerMapaRequisitos: (db) => {
        const mapa = new Map();
        const stmt = db.prepare("SELECT tarea_id, requisito_id FROM tarea_requisitos ORDER BY requisito_id ASC");
        while (stmt.step()) {
            const [tareaId, reqId] = stmt.get();
            if (!mapa.has(tareaId)) mapa.set(tareaId, []);
            mapa.get(tareaId).push(reqId);
        }
        stmt.free();
        return mapa;
    },

    guardarRequisitos: (db, tareaId, requisitoIds) => {
        db.run("DELETE FROM tarea_requisitos WHERE tarea_id = ?", [tareaId]);
        const stmt = db.prepare(
            "INSERT OR IGNORE INTO tarea_requisitos (tarea_id, requisito_id) VALUES (?, ?)"
        );
        (requisitoIds || []).forEach(reqId => stmt.run([tareaId, reqId]));
        stmt.free();
        db.run("UPDATE tareas SET requisito_id = NULL WHERE id = ?", [tareaId]);
    },

    obtenerTodas: (db) => {
        const requisitosMap = KanbanDB._obtenerMapaRequisitos(db);
        const subtareasMap = KanbanDB._obtenerMapaSubtareas(db);
        const stmt = db.prepare(
            "SELECT id, texto, proyecto, estado, requisito_id, nota, imagenes, archivada FROM tareas ORDER BY id ASC"
        );
        const rows = [];
        while (stmt.step()) {
            const r = stmt.get();
            const ids = requisitosMap.get(r[0]) || [];
            if (ids.length === 0 && r[4] != null) ids.push(r[4]);
            rows.push({
                id: r[0],
                texto: r[1],
                proyecto: r[2],
                estado: r[3],
                requisito_ids: ids,
                nota: r[5] || "",
                imagenes: KanbanDB._parseImagenes(r[6]),
                archivada: !!(r[7] ?? 0),
                subtareas: subtareasMap.get(r[0]) || []
            });
        }
        stmt.free();
        return rows;
    },

    _sincronizarProyectosDesdeTareas: (db) => {
        db.run(
            "INSERT OR IGNORE INTO proyectos (nombre, archivado) SELECT DISTINCT proyecto, 0 FROM tareas"
        );
    },

    _registrarProyecto: (db, nombre, archivado = 0) => {
        const n = String(nombre || "").trim();
        if (!n) return;
        db.run("INSERT OR IGNORE INTO proyectos (nombre, archivado) VALUES (?, ?)", [n, archivado ? 1 : 0]);
        db.run("UPDATE proyectos SET archivado = ? WHERE nombre = ?", [archivado ? 1 : 0, n]);
    },

    _asegurarProyectoActivo: (db, nombre) => {
        KanbanDB._registrarProyecto(db, nombre, 0);
    },

    obtenerNombresProyectosArchivados: (db) => {
        KanbanDB._sincronizarProyectosDesdeTareas(db);
        const stmt = db.prepare("SELECT nombre FROM proyectos WHERE archivado = 1");
        const nombres = [];
        while (stmt.step()) nombres.push(stmt.get()[0]);
        stmt.free();
        return nombres;
    },

    crearTarea: (db, dbPath, datos) => {
        KanbanDB._asegurarProyectoActivo(db, datos.proyecto);
        const stmt = db.prepare(
            "INSERT INTO tareas (texto, proyecto, estado, nota, imagenes) VALUES (:texto, :proyecto, :estado, :nota, :imagenes)"
        );
        stmt.run({
            ":texto": datos.texto,
            ":proyecto": datos.proyecto,
            ":estado": datos.estado,
            ":nota": datos.nota || "",
            ":imagenes": KanbanDB._serializarImagenes(datos.imagenes)
        });
        stmt.free();
        const newId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
        KanbanDB.guardarRequisitos(db, newId, datos.requisito_ids);
        KanbanDB.guardarSubtareas(db, newId, datos.subtareas);
        KanbanDB.guardar(db, dbPath);
        return newId;
    },

    actualizarTarea: (db, dbPath, tareaId, datos) => {
        KanbanDB._asegurarProyectoActivo(db, datos.proyecto);
        const stmt = db.prepare(
            "UPDATE tareas SET texto = :texto, proyecto = :proyecto, estado = :estado, nota = :nota, imagenes = :imagenes WHERE id = :id"
        );
        stmt.run({
            ":texto": datos.texto,
            ":proyecto": datos.proyecto,
            ":estado": datos.estado,
            ":nota": datos.nota || "",
            ":imagenes": KanbanDB._serializarImagenes(datos.imagenes),
            ":id": tareaId
        });
        stmt.free();
        KanbanDB.guardarRequisitos(db, tareaId, datos.requisito_ids);
        KanbanDB.guardarSubtareas(db, tareaId, datos.subtareas);
        KanbanDB.guardar(db, dbPath);
    },

    actualizarEstado: async (db, dbPath, tareaId, nuevoEstado) => {
        const stmt = db.prepare("UPDATE tareas SET estado = :estado WHERE id = :id");
        stmt.run({ ":estado": nuevoEstado, ":id": tareaId });
        stmt.free();
        KanbanDB.guardar(db, dbPath);
    },

    eliminarTarea: (db, dbPath, tareaId) => {
        const todas = KanbanDB.obtenerTodas(db);
        const t = todas.find(x => x.id === tareaId);
        if (t) {
            const datosJson = JSON.stringify(t);
            const stmt = db.prepare("INSERT INTO papelera (tipo, nombre_entidad, datos_json) VALUES ('tarea', ?, ?)");
            stmt.run([t.texto, datosJson]);
            stmt.free();
        }

        const stmt = db.prepare("DELETE FROM tareas WHERE id = :id");
        stmt.run({ ":id": tareaId });
        stmt.free();
        KanbanDB.guardar(db, dbPath);
    },

    obtenerDependientesDe: (db, tareaId) => {
        const todas = KanbanDB.obtenerTodas(db);
        return todas.filter(t =>
            t.id !== tareaId && (t.requisito_ids || []).includes(tareaId)
        );
    },

    // Omite requisitos que ya están implícitos vía otro (padres/abuelos en la cadena)
    filtrarRequisitosDirectos: (db, requisitoIds) => {
        const mapa = new Map(KanbanDB.obtenerTodas(db).map(t => [t.id, t]));
        return KanbanDB._filtrarRequisitosSinAncestros(requisitoIds, mapa);
    },

    _filtrarRequisitosSinAncestros: (requisitoIds, mapaTareas) => {
        const ids = [...(requisitoIds || [])];
        if (ids.length <= 1) return ids;

        const esAncestroDeOtroEnLista = (candidatoId, otroId, visitados = new Set()) => {
            if (visitados.has(otroId)) return false;
            visitados.add(otroId);
            const t = mapaTareas.get(otroId);
            if (!t) return false;
            for (const reqId of t.requisito_ids || []) {
                if (reqId === candidatoId) return true;
                if (esAncestroDeOtroEnLista(candidatoId, reqId, visitados)) return true;
            }
            return false;
        };

        return ids.filter(id =>
            !ids.some(otroId => otroId !== id && esAncestroDeOtroEnLista(id, otroId))
        );
    },

    _agregarAncestrosRequisitos: (tareaId, mapaTareas, conjunto) => {
        const visitados = new Set();
        const recorrer = (id) => {
            const t = mapaTareas.get(id);
            if (!t) return;
            for (const reqId of t.requisito_ids || []) {
                conjunto.add(reqId);
                if (!visitados.has(reqId)) {
                    visitados.add(reqId);
                    recorrer(reqId);
                }
            }
        };
        recorrer(tareaId);
    },

    _agregarDescendientesRequisitos: (tareaId, mapaTareas, conjunto) => {
        const visitados = new Set();
        const recorrer = (id) => {
            mapaTareas.forEach(t => {
                if (!(t.requisito_ids || []).includes(id)) return;
                conjunto.add(t.id);
                if (!visitados.has(t.id)) {
                    visitados.add(t.id);
                    recorrer(t.id);
                }
            });
        };
        recorrer(tareaId);
    },

    // IDs que no deben ofrecerse al elegir requisitos (ciclos y jerarquía redundante)
    obtenerIdsExcluidosParaSugerenciaRequisitos: (db, tareaActualId, idsSeleccionados = []) => {
        const mapa = new Map(KanbanDB.obtenerTodas(db).map(t => [t.id, t]));
        const excluir = new Set([tareaActualId, ...idsSeleccionados].filter(Boolean));

        idsSeleccionados.forEach(id => {
            KanbanDB._agregarAncestrosRequisitos(id, mapa, excluir);
            KanbanDB._agregarDescendientesRequisitos(id, mapa, excluir);
        });

        if (tareaActualId) {
            KanbanDB._agregarDescendientesRequisitos(tareaActualId, mapa, excluir);
        }

        return [...excluir];
    },

    // Añade un requisito visual (drag & drop en el diagrama)
    agregarRequisito: (db, dbPath, tareaDestinoId, requisitoId) => {
        const todas = KanbanDB.obtenerTodas(db);
        const mapa = new Map(todas.map(t => [t.id, t]));
        const destino = mapa.get(tareaDestinoId);
        const requisito = mapa.get(requisitoId);

        if (!destino || !requisito) throw new Error("Tarea no encontrada");
        if (tareaDestinoId === requisitoId) throw new Error("Una tarea no puede depender de sí misma");
        if (destino.proyecto !== requisito.proyecto) {
            throw new Error("Los requisitos deben pertenecer al mismo proyecto");
        }

        const idsActuales = [...(destino.requisito_ids || [])];
        if (idsActuales.includes(requisitoId)) return { agregado: false, motivo: "ya_existe" };

        const idsExcluidos = KanbanDB.obtenerIdsExcluidosParaSugerenciaRequisitos(
            db, tareaDestinoId, idsActuales
        );
        if (idsExcluidos.includes(requisitoId)) {
            throw new Error("Ese vínculo crearía un ciclo o un requisito redundante");
        }

        idsActuales.push(requisitoId);
        const compactados = KanbanDB._filtrarRequisitosSinAncestros(idsActuales, mapa);

        KanbanDB.actualizarTarea(db, dbPath, tareaDestinoId, {
            texto: destino.texto,
            proyecto: destino.proyecto,
            estado: destino.estado,
            nota: destino.nota,
            imagenes: destino.imagenes || [],
            subtareas: destino.subtareas || [],
            requisito_ids: compactados
        });
        return { agregado: true };
    },

    obtenerProyectos: (db, { soloActivos = true } = {}) => {
        KanbanDB._sincronizarProyectosDesdeTareas(db);
        const sql = soloActivos
            ? `SELECT p.nombre, COUNT(t.id) AS total, p.archivado
               FROM proyectos p
               LEFT JOIN tareas t ON t.proyecto = p.nombre
               WHERE p.archivado = 0
               GROUP BY p.nombre
               ORDER BY p.nombre ASC`
            : `SELECT p.nombre, COUNT(t.id) AS total, p.archivado
               FROM proyectos p
               LEFT JOIN tareas t ON t.proyecto = p.nombre
               GROUP BY p.nombre
               ORDER BY p.archivado ASC, p.nombre ASC`;
        const stmt = db.prepare(sql);
        const proyectos = [];
        while (stmt.step()) {
            const r = stmt.get();
            proyectos.push({ nombre: r[0], total: r[1], archivado: !!r[2] });
        }
        stmt.free();
        return proyectos;
    },

    archivarProyecto: (db, dbPath, nombre) => {
        KanbanDB._sincronizarProyectosDesdeTareas(db);
        KanbanDB._registrarProyecto(db, nombre, 1);
        KanbanDB.guardar(db, dbPath);
    },

    archivarTarea: (db, dbPath, tareaId) => {
        db.run("UPDATE tareas SET archivada = 1 WHERE id = ?", [tareaId]);
        KanbanDB.guardar(db, dbPath);
    },

    restaurarTarea: (db, dbPath, tareaId) => {
        db.run("UPDATE tareas SET archivada = 0 WHERE id = ?", [tareaId]);
        KanbanDB.guardar(db, dbPath);
    },

    restaurarProyecto: (db, dbPath, nombre) => {
        KanbanDB._sincronizarProyectosDesdeTareas(db);
        KanbanDB._registrarProyecto(db, nombre, 0);
        KanbanDB.guardar(db, dbPath);
    },

    eliminarProyecto: (db, dbPath, nombre) => {
        const todas = KanbanDB.obtenerTodas(db);
        const tareasProyecto = todas.filter(t => t.proyecto === nombre);
        const datosProyecto = {
            proyecto: nombre,
            tareas: tareasProyecto
        };
        const datosJson = JSON.stringify(datosProyecto);
        const stmt = db.prepare("INSERT INTO papelera (tipo, nombre_entidad, datos_json) VALUES ('proyecto', ?, ?)");
        stmt.run([nombre, datosJson]);
        stmt.free();

        db.run("DELETE FROM tareas WHERE proyecto = ?", [nombre]);
        db.run("DELETE FROM proyectos WHERE nombre = ?", [nombre]);
        KanbanDB.guardar(db, dbPath);
    },

    obtenerPapelera: (db) => {
        const stmt = db.prepare("SELECT id, tipo, nombre_entidad, datos_json, fecha_eliminacion FROM papelera ORDER BY id DESC");
        const list = [];
        while (stmt.step()) {
            const [id, tipo, nombreEntidad, datosJson, fecha] = stmt.get();
            list.push({ id, tipo, nombreEntidad, datosJson, fecha });
        }
        stmt.free();
        return list;
    },

    eliminarPapeleraPermanente: (db, dbPath, id) => {
        db.run("DELETE FROM papelera WHERE id = ?", [id]);
        KanbanDB.guardar(db, dbPath);
    },

    restaurarPapelera: (db, dbPath, id) => {
        const stmt = db.prepare("SELECT tipo, datos_json FROM papelera WHERE id = ?");
        let tipo = "";
        let datosJson = "";
        if (stmt.step()) {
            const r = stmt.get();
            tipo = r[0];
            datosJson = r[1];
        }
        stmt.free();

        if (!datosJson) return;

        const datos = JSON.parse(datosJson);

        if (tipo === "tarea") {
            const existe = db.exec("SELECT id FROM tareas WHERE id = ?", [datos.id])[0]?.values?.length > 0;
            const insertId = existe ? null : datos.id;
            
            let query = "";
            let params = {};
            if (insertId) {
                query = "INSERT INTO tareas (id, texto, proyecto, estado, nota, imagenes) VALUES (:id, :texto, :proyecto, :estado, :nota, :imagenes)";
                params = {
                    ":id": insertId,
                    ":texto": datos.texto,
                    ":proyecto": datos.proyecto,
                    ":estado": datos.estado,
                    ":nota": datos.nota,
                    ":imagenes": JSON.stringify(datos.imagenes || [])
                };
            } else {
                query = "INSERT INTO tareas (texto, proyecto, estado, nota, imagenes) VALUES (:texto, :proyecto, :estado, :nota, :imagenes)";
                params = {
                    ":texto": datos.texto,
                    ":proyecto": datos.proyecto,
                    ":estado": datos.estado,
                    ":nota": datos.nota,
                    ":imagenes": JSON.stringify(datos.imagenes || [])
                };
            }
            const stmtIns = db.prepare(query);
            stmtIns.run(params);
            stmtIns.free();
            
            const newId = insertId || db.exec("SELECT last_insert_rowid()")[0].values[0][0];
            KanbanDB.guardarSubtareas(db, newId, datos.subtareas);
            
            const todas = KanbanDB.obtenerTodas(db);
            const validReqs = (datos.requisito_ids || []).filter(reqId => todas.some(t => t.id === reqId));
            KanbanDB.guardarRequisitos(db, newId, validReqs);
        } else if (tipo === "proyecto") {
            KanbanDB._asegurarProyectoActivo(db, datos.proyecto);
            (datos.tareas || []).forEach(tDatos => {
                const existe = db.exec("SELECT id FROM tareas WHERE id = ?", [tDatos.id])[0]?.values?.length > 0;
                const insertId = existe ? null : tDatos.id;
                
                let query = "";
                let params = {};
                if (insertId) {
                    query = "INSERT INTO tareas (id, texto, proyecto, estado, nota, imagenes) VALUES (:id, :texto, :proyecto, :estado, :nota, :imagenes)";
                    params = {
                        ":id": insertId,
                        ":texto": tDatos.texto,
                        ":proyecto": tDatos.proyecto,
                        ":estado": tDatos.estado,
                        ":nota": tDatos.nota,
                        ":imagenes": JSON.stringify(tDatos.imagenes || [])
                    };
                } else {
                    query = "INSERT INTO tareas (texto, proyecto, estado, nota, imagenes) VALUES (:texto, :proyecto, :estado, :nota, :imagenes)";
                    params = {
                        ":texto": tDatos.texto,
                        ":proyecto": tDatos.proyecto,
                        ":estado": tDatos.estado,
                        ":nota": tDatos.nota,
                        ":imagenes": JSON.stringify(tDatos.imagenes || [])
                    };
                }
                const stmtIns = db.prepare(query);
                stmtIns.run(params);
                stmtIns.free();
                
                const newId = insertId || db.exec("SELECT last_insert_rowid()")[0].values[0][0];
                KanbanDB.guardarSubtareas(db, newId, tDatos.subtareas);
            });
            
            const todas = KanbanDB.obtenerTodas(db);
            (datos.tareas || []).forEach(tDatos => {
                const validReqs = (tDatos.requisito_ids || []).filter(reqId => todas.some(t => t.id === reqId));
                KanbanDB.guardarRequisitos(db, tDatos.id, validReqs);
            });
        }

        db.run("DELETE FROM papelera WHERE id = ?", [id]);
        KanbanDB.guardar(db, dbPath);
    }
};
