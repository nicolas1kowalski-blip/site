// Studio Data — version bureau. Point d'entrée Tauri.
// Empêche l'ouverture d'une console noire sous Windows en mode release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::Db;

fn main() {
    let database = Db::new().expect("Impossible d'initialiser DuckDB");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(database)
        .invoke_handler(tauri::generate_handler![
            db::db_query,
            db::db_exec,
            db::db_load_csv,
            db::db_export_parquet,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au lancement de l'application Tauri");
}
