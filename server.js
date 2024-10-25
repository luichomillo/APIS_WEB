const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configura el middleware para poder recibir datos en JSON
app.use(express.json());

// Conexión a la base de datos SQLite
let db = new sqlite3.Database('./analytics.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Conectado a la base de datos SQLite.');
    }
});

// Ejemplo de ruta para probar la conexión
app.get('/', (req, res) => {
    res.send('¡Servidor en funcionamiento!');
});

// API de prueba para consultar la base de datos
app.get('/api/test', (req, res) => {
    db.serialize(() => {
        db.each(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'`, (err, row) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ tables: row.count });
            }
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});

// Cerrar la conexión de la base de datos al cerrar el servidor
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Cerrando la conexión con la base de datos.');
        process.exit(0);
    });
});

