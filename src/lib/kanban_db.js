/* kanban_db.js - Persistencia SQLite para tareas con dependencias */

window.KanbanDB = {
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

    // Apertura síncrona desde disco (misma lógica que init; Agenda y Organizador comparten archivo)
    abrirSync: (SQL, dbPath) => window.ScriptsRuntime.abrirDb(SQL, dbPath, (db, esNueva) => {
        db.run(window.KanbanDB.SCHEMA_TAREAS);
        db.run(window.KanbanDB.SCHEMA_REQUISITOS);
        db.run(window.KanbanDB.SCHEMA_PROYECTOS);
        db.run(window.KanbanDB.SCHEMA_SUBTAREAS);
        window.KanbanDB._migrarEsquema(db, esNueva ? null : dbPath);
        window.KanbanDB._sincronizarProyectosDesdeTareas(db);
        db.run(`INSERT OR IGNORE INTO tarea_requisitos (tarea_id, requisito_id)
            SELECT id, requisito_id FROM tareas WHERE requisito_id IS NOT NULL`);
    }),

    init: async (SQL, dbPath) => {
        if (!window.ScriptsRuntime.puedeUsarFs()) {
            await window.ScriptsRuntime.leerBinarioAsync(dbPath);
        }
        return window.KanbanDB.abrirSync(SQL, dbPath);
    },

    _marcaAgenda: (agendaId) => `<!-- agenda:${agendaId} -->`,

    _notaConMarcaAgenda: (notas, agendaId) => {
        const marca = window.KanbanDB._marcaAgenda(agendaId);
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
        if (cambio && dbPath) window.KanbanDB.guardar(db, dbPath);
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

    guardar: (db, dbPath) => window.ScriptsRuntime.guardarDb(db, dbPath),

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
        const requisitosMap = window.KanbanDB._obtenerMapaRequisitos(db);
        const subtareasMap = window.KanbanDB._obtenerMapaSubtareas(db);
        const stmt = db.prepare(
            "SELECT id, texto, proyecto, estado, requisito_id, nota, imagenes FROM tareas ORDER BY id ASC"
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
                imagenes: window.KanbanDB._parseImagenes(r[6]),
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
        window.KanbanDB._registrarProyecto(db, nombre, 0);
    },

    obtenerNombresProyectosArchivados: (db) => {
        window.KanbanDB._sincronizarProyectosDesdeTareas(db);
        const stmt = db.prepare("SELECT nombre FROM proyectos WHERE archivado = 1");
        const nombres = [];
        while (stmt.step()) nombres.push(stmt.get()[0]);
        stmt.free();
        return nombres;
    },

    crearTarea: (db, dbPath, datos) => {
        window.KanbanDB._asegurarProyectoActivo(db, datos.proyecto);
        const stmt = db.prepare(
            "INSERT INTO tareas (texto, proyecto, estado, nota, imagenes) VALUES (:texto, :proyecto, :estado, :nota, :imagenes)"
        );
        stmt.run({
            ":texto": datos.texto,
            ":proyecto": datos.proyecto,
            ":estado": datos.estado,
            ":nota": datos.nota || "",
            ":imagenes": window.KanbanDB._serializarImagenes(datos.imagenes)
        });
        stmt.free();
        const newId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
        window.KanbanDB.guardarRequisitos(db, newId, datos.requisito_ids);
        window.KanbanDB.guardarSubtareas(db, newId, datos.subtareas);
        window.KanbanDB.guardar(db, dbPath);
        return newId;
    },

    actualizarTarea: (db, dbPath, tareaId, datos) => {
        window.KanbanDB._asegurarProyectoActivo(db, datos.proyecto);
        const stmt = db.prepare(
            "UPDATE tareas SET texto = :texto, proyecto = :proyecto, estado = :estado, nota = :nota, imagenes = :imagenes WHERE id = :id"
        );
        stmt.run({
            ":texto": datos.texto,
            ":proyecto": datos.proyecto,
            ":estado": datos.estado,
            ":nota": datos.nota || "",
            ":imagenes": window.KanbanDB._serializarImagenes(datos.imagenes),
            ":id": tareaId
        });
        stmt.free();
        window.KanbanDB.guardarRequisitos(db, tareaId, datos.requisito_ids);
        window.KanbanDB.guardarSubtareas(db, tareaId, datos.subtareas);
        window.KanbanDB.guardar(db, dbPath);
    },

    actualizarEstado: async (db, dbPath, tareaId, nuevoEstado) => {
        const stmt = db.prepare("UPDATE tareas SET estado = :estado WHERE id = :id");
        stmt.run({ ":estado": nuevoEstado, ":id": tareaId });
        stmt.free();
        window.KanbanDB.guardar(db, dbPath);
    },

    eliminarTarea: (db, dbPath, tareaId) => {
        const stmt = db.prepare("DELETE FROM tareas WHERE id = :id");
        stmt.run({ ":id": tareaId });
        stmt.free();
        window.KanbanDB.guardar(db, dbPath);
    },

    obtenerDependientesDe: (db, tareaId) => {
        const todas = window.KanbanDB.obtenerTodas(db);
        return todas.filter(t =>
            t.id !== tareaId && (t.requisito_ids || []).includes(tareaId)
        );
    },

    // Omite requisitos que ya están implícitos vía otro (padres/abuelos en la cadena)
    filtrarRequisitosDirectos: (db, requisitoIds) => {
        const mapa = new Map(window.KanbanDB.obtenerTodas(db).map(t => [t.id, t]));
        return window.KanbanDB._filtrarRequisitosSinAncestros(requisitoIds, mapa);
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
        const mapa = new Map(window.KanbanDB.obtenerTodas(db).map(t => [t.id, t]));
        const excluir = new Set([tareaActualId, ...idsSeleccionados].filter(Boolean));

        idsSeleccionados.forEach(id => {
            window.KanbanDB._agregarAncestrosRequisitos(id, mapa, excluir);
            window.KanbanDB._agregarDescendientesRequisitos(id, mapa, excluir);
        });

        if (tareaActualId) {
            window.KanbanDB._agregarDescendientesRequisitos(tareaActualId, mapa, excluir);
        }

        return [...excluir];
    },

    // Añade un requisito visual (drag & drop en el diagrama)
    agregarRequisito: (db, dbPath, tareaDestinoId, requisitoId) => {
        const todas = window.KanbanDB.obtenerTodas(db);
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

        const idsExcluidos = window.KanbanDB.obtenerIdsExcluidosParaSugerenciaRequisitos(
            db, tareaDestinoId, idsActuales
        );
        if (idsExcluidos.includes(requisitoId)) {
            throw new Error("Ese vínculo crearía un ciclo o un requisito redundante");
        }

        idsActuales.push(requisitoId);
        const compactados = window.KanbanDB._filtrarRequisitosSinAncestros(idsActuales, mapa);

        window.KanbanDB.actualizarTarea(db, dbPath, tareaDestinoId, {
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
        window.KanbanDB._sincronizarProyectosDesdeTareas(db);
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
        window.KanbanDB._sincronizarProyectosDesdeTareas(db);
        window.KanbanDB._registrarProyecto(db, nombre, 1);
        window.KanbanDB.guardar(db, dbPath);
    },

    restaurarProyecto: (db, dbPath, nombre) => {
        window.KanbanDB._sincronizarProyectosDesdeTareas(db);
        window.KanbanDB._registrarProyecto(db, nombre, 0);
        window.KanbanDB.guardar(db, dbPath);
    }
};
