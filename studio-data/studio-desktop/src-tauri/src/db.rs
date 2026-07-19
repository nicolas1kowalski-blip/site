//! Couche DuckDB natif exposée au front via des commandes Tauri.
//!
//! Le front web parle déjà SQL à `conn.query(sql)`. On reproduit ce contrat côté natif :
//! `db_query` renvoie les lignes en JSON, que le pont `native-duck.js` remet dans une forme
//! « Arrow-like » attendue par `arrowResultToObjects`. Rien d'autre à changer dans l'appli.

use duckdb::Connection;
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

/// Connexion partagée. En phase 4, remplacer `open_in_memory()` par un fichier persistant
/// (`Connection::open("studio.duckdb")`) pour survivre entre les sessions sans quota navigateur.
pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn new() -> duckdb::Result<Self> {
        let conn = Connection::open_in_memory()?;
        // Réglages « gros volumes » : la mémoire est celle du PC, le débordement va sur disque.
        let _ = conn.execute_batch(
            "SET preserve_insertion_order=false;
             PRAGMA memory_limit='80%';
             PRAGMA temp_directory='';",
        );
        Ok(Db(Mutex::new(conn)))
    }
}

#[derive(Serialize)]
pub struct QueryResult {
    /// Noms de colonnes, dans l'ordre.
    pub columns: Vec<String>,
    /// Lignes : chaque ligne est un tableau de valeurs JSON, aligné sur `columns`.
    pub rows: Vec<Vec<serde_json::Value>>,
}

/// Exécute un SELECT et renvoie colonnes + lignes en JSON.
/// (Pour les très gros résultats, préférer un futur `db_query_stream` — phase 3.)
#[tauri::command]
pub fn db_query(sql: String, db: State<Db>) -> Result<QueryResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut columns: Vec<String> = Vec::new();
    let mut out: Vec<Vec<serde_json::Value>> = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        // Le nombre/nom des colonnes est connu après la 1re ligne via le statement.
        if columns.is_empty() {
            columns = stmt
                .column_names()
                .into_iter()
                .map(|s| s.to_string())
                .collect();
        }
        let mut vals = Vec::with_capacity(columns.len());
        for i in 0..columns.len() {
            vals.push(value_to_json(row, i));
        }
        out.push(vals);
    }
    // Cas d'un résultat vide : récupérer quand même les noms de colonnes.
    if columns.is_empty() {
        columns = stmt
            .column_names()
            .into_iter()
            .map(|s| s.to_string())
            .collect();
    }
    Ok(QueryResult { columns, rows: out })
}

/// Exécute un ordre sans résultat (CREATE/DROP/SET…).
#[tauri::command]
pub fn db_exec(sql: String, db: State<Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute_batch(&sql).map_err(|e| e.to_string())
}

/// Charge un CSV/TXT par CHEMIN DISQUE (aucune copie en mémoire — phase 2).
/// `table` = nom de table DuckDB, `path` = chemin absolu, `delim`/`quote` optionnels.
#[tauri::command]
pub fn db_load_csv(
    table: String,
    path: String,
    delim: Option<String>,
    quote: Option<String>,
    ignore_errors: Option<bool>,
    db: State<Db>,
) -> Result<Vec<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut opts = String::from("header=true, all_varchar=true, file_row_number=true");
    if let Some(d) = delim {
        opts.push_str(&format!(", delim='{}'", d.replace('\'', "''")));
    }
    if let Some(q) = quote {
        opts.push_str(&format!(", quote='{}'", q.replace('\'', "''")));
    }
    if ignore_errors.unwrap_or(false) {
        opts.push_str(", ignore_errors=true");
    }
    let t = ident(&table);
    let p = path.replace('\'', "''");
    conn.execute_batch(&format!("DROP TABLE IF EXISTS {t}; DROP VIEW IF EXISTS {t};"))
        .map_err(|e| e.to_string())?;
    // VIEW = lecture à la demande, sans matérialiser en RAM (comme la « lecture directe » web).
    conn.execute_batch(&format!(
        "CREATE VIEW {t} AS SELECT file_row_number + 1 AS __rn, * EXCLUDE (file_row_number) \
         FROM read_csv_auto('{p}', {opts});"
    ))
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(&format!("SELECT * FROM {t} LIMIT 0"))
        .map_err(|e| e.to_string())?;
    stmt.query([]).map_err(|e| e.to_string())?;
    Ok(stmt
        .column_names()
        .into_iter()
        .map(|s| s.to_string())
        .filter(|n| n != "__rn")
        .collect())
}

/// Convertit une table en Parquet compressé sur disque (phase 3 — pour l'« Optimiser » natif).
#[tauri::command]
pub fn db_export_parquet(table: String, out_path: String, db: State<Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let t = ident(&table);
    let p = out_path.replace('\'', "''");
    conn.execute_batch(&format!(
        "COPY (SELECT * FROM {t}) TO '{p}' (FORMAT PARQUET, COMPRESSION ZSTD);"
    ))
    .map_err(|e| e.to_string())
}

/// Échappe un identifiant SQL (nom de table/colonne).
fn ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Convertit une valeur DuckDB en JSON. Toutes nos colonnes sont VARCHAR (all_varchar=true),
/// donc on lit en String ; les colonnes calculées numériques sont récupérées via fallback.
fn value_to_json(row: &duckdb::Row, i: usize) -> serde_json::Value {
    use serde_json::Value;
    if let Ok(v) = row.get::<usize, Option<String>>(i) {
        return v.map(Value::String).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.get::<usize, Option<i64>>(i) {
        return v.map(|n| Value::Number(n.into())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.get::<usize, Option<f64>>(i) {
        return serde_json::Number::from_f64(v.unwrap_or(f64::NAN))
            .map(Value::Number)
            .unwrap_or(Value::Null);
    }
    if let Ok(v) = row.get::<usize, Option<bool>>(i) {
        return v.map(Value::Bool).unwrap_or(Value::Null);
    }
    Value::Null
}
