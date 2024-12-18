const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3000;
const admin = require("firebase-admin");

//**** para RNEDER sacar estos comentarios!! ***
var serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  	credential: admin.credential.cert(serviceAccount),
  	databaseURL: "https://luichomillo-28552-default-rtdb.firebaseio.com"
	});

// Habilitar CORS para tu dominio
app.use(cors({
    origin: 'https://luichomillo.freeddns.org', // Reemplaza esto con tu dominio
    credentials: true // Permitir el uso de cookies si es necesario
}));

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

// API de prueba para consultar la base de datos SQLITE3
app.get('/api/test', (req, res) => {
    db.all(`SELECT * FROM Usuarios ORDER BY Fecha_VIVO DESC`, (err, rows) => {
	    if (err) {
        	return res.status(500).json({ error: err.message });
    	    } else {
        	// Formatea los datos JSON con una sangría de 2 espacios y envuelve en `<pre>` para buena legibilidad en el navegador
        	const formattedData = JSON.stringify(rows, null, 2);
        
        	return res.send(`<pre>${formattedData}</pre>`);
    	    }
	});
});

// *** Ruta para registrar la conexión de un usuario *** SQLITE3 ***
app.post('/api/register-connection', (req, res) => {
    const { IP } = req.body;
    console.log("REGISTRAR CONEXION (POST) DE LA IP: ", IP);
    
    let fecha = new Date();
    fecha.setHours(fecha.getHours() - 3); // Ajusta la hora a UTC-3 manualmente
    let formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')} ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;

    if (!IP) {
        return res.status(400).json({ success: false, error: 'POST: IP no proporcionada' });
    }

    db.get('SELECT * FROM Usuarios WHERE IP_USER = ?', [IP], (err, row) => {
        if (err) {
            console.log("ERROR EN EL SERVIDOR: ", err);
            return res.status(500).json({ success: false, error: 'Error en el servidor' });
        }

        if (row) {
            // Si ya existe un registro para esta IP, marcar como conectado
            console.log("FECHA UPDATE", formattedDate);
            db.run(`UPDATE Usuarios SET VIVO = TRUE, CONECTADO = TRUE, Fecha_VIVO = ? WHERE IP_USER = ?`, [formattedDate, IP], function(err) {
                if (err) {
                    console.log("ERROR AL REGISTRAR CONEXION UPDATE: ", err);
                    return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
                }
                console.log("REGISTRAR CONEXION OK");
                return res.json({ success: true });
            });
        } else {
            // Si la IP no existe, crear un nuevo usuario anónimo
            console.log("FECHA INSERT: ", formattedDate);
            db.run(`INSERT INTO Usuarios (USER, IP_USER, VIVO, CONECTADO, Fecha_VIVO) VALUES (?, ?, ?, ?, ?)`, ['Anónimo', IP, true, true, formattedDate], function(err) {
                if (err) {
                    console.log("ERROR AL REGISTRAR CONEXION INSERT: ", err);
                    return res.status(500).json({ success: false, error: 'Error al insertar en la base de datos' });
                }
                console.log("NUEVA IP");
                return res.json({ success: true });
            });
        }
    });
});

// *** PING AL USUARIO PARA VERIFICAR DESCONEXION *** SQLITE3 ***
app.post('/api/ping', (req, res) => {
    const { IP } = req.body;

    let fecha = new Date();
    fecha.setHours(fecha.getHours() - 3); // Ajusta la hora a UTC-3 manualmente
    let formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')} ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
    
    // Actualizar la última actividad del usuario en la base de datos
    db.run(`UPDATE Usuarios SET Fecha_VIVO = ? WHERE IP_USER = ?`, [formattedDate, IP], function(err) {
        if (err) {
            console.error('Error al actualizar Fecha_VIVO en el ping:', err.message);
            return res.status(500).json({ success: false, error: 'Error en el servidor' });
        }
	console.log(`Ping exitoso para IP ${IP}`);
        return res.json({ success: true });
    });
});

// ****LOGOUT USUARIOS**** SQLITE3 ***
app.post('/api/logout', (req, res) => {
    const { IP } = req.body;

    if (!IP) {
        return res.status(400).json({ success: false, error: 'IP no proporcionada' });
    }

    db.run(`UPDATE Usuarios SET CONECTADO = FALSE, VIVO = FALSE WHERE IP_USER = ?`, [IP], function(err) {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
        }
        console.log(`Usuario con IP ${IP} desconectado.`);
        return res.json({ success: true, message: "Usuario desconectado correctamente" });
    });
});

// *** API para verificar y desconectar usuarios inactivos *** SQLITE3 ***
app.get('/api/verify-status', (req, res) => {
    const sql = `
        SELECT * FROM Usuarios
        WHERE (CONECTADO = TRUE OR VIVO = TRUE)
        AND datetime(Fecha_VIVO) <= datetime('now', 'localtime', '-15 minutes')
    `;

    db.all(sql, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (rows.length > 0) {
            const updateSql = `UPDATE Usuarios SET CONECTADO = FALSE, VIVO = FALSE 
                               WHERE (CONECTADO = TRUE OR VIVO = TRUE) 
                               AND datetime(Fecha_VIVO) <= datetime('now', 'localtime', '-15 minutes')`;
            db.run(updateSql, (updateErr) => {
                if (updateErr) {
                    return res.status(500).json({ error: updateErr.message });
                }
                console.log("Usuarios inactivos actualizados correctamente.");
                return res.json({ success: true, message: "Usuarios inactivos desconectados", inactiveUsers: rows });
            });
        } else {
            console.log("No hay usuarios inactivos");
            return res.json({ success: true, message: "No hay usuarios inactivos" });
        }
    });
});

// *** CHAT *** 
app.post('/api/chat/send', (req, res) => {
    const { user, message } = req.body;

    if (!user || !message) {
        return res.status(400).json({ error: 'Usuario y mensaje son necesarios' });
    }

    const messageData = {
        user,
        message,
        timestamp: admin.firestore.Timestamp.now()
    };

    admin.firestore().collection('messages').add(messageData)
        .then(() => res.json({ success: true, message: 'Mensaje enviado' }))
        .catch((error) => res.status(500).json({ error: error.message }));
});

// *** Ruta para actualizar o insertar usuario ***SQLITE3 ***
app.post('/api/user', (req, res) => {
    const { IP, USER } = req.body; // Obtener IP y USER del cuerpo de la solicitud

    if (!IP || !USER) {
        return res.status(400).json({ success: false, error: 'IP y USER son obligatorios' });
    }

    // Primero, intentamos actualizar al usuario existente
    db.run(`UPDATE Usuarios SET USER = ? WHERE IP_USER = ?`, [USER, IP], function(err) {
        if (err) {
            console.error('Error al actualizar el usuario:', err.message);
            return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
        }

        // Verificamos si se actualizó alguna fila
        if (this.changes === 0) {
            // Si no se actualizó ninguna fila, insertemos un nuevo usuario
            db.run(`INSERT INTO Usuarios (IP_USER, USER) VALUES (?, ?)`, [IP, USER], function(err) {
                if (err) {
                    console.error('Error al insertar el usuario:', err.message);
                    return res.status(500).json({ success: false, error: 'Error al insertar en la base de datos' });
                }

                return res.json({ success: true, message: 'Usuario insertado exitosamente' });
            });
        } else {
            // Si se actualizó, respondemos con un mensaje de éxito
            return res.json({ success: true, message: 'Usuario actualizado exitosamente' });
        }
    });
});

// *** CHAT MENSAJES ***
app.get('/api/chat/messages', (req, res) => {
    admin.firestore().collection('messages').orderBy('timestamp', 'desc').limit(50).get()
        .then(snapshot => {
            const messages = [];
            snapshot.forEach(doc => messages.push(doc.data()));
            res.json(messages);
        })
        .catch(error => res.status(500).json({ error: error.message }));
});

// *** Ruta para obtener usuarios conectados *** SQLITE ***
app.post('/api/conectados', (req, res) => {
    // Verificar la IP del cliente
    const { IP } = req.body;  // Obtiene la IP del cliente
    console.log("IP recibida en el servidor:", req.body); // Añadir log para ver IP recibida
    const allowedIP = '190.244.137.138'; // Cambia esto por la IP de tu servidor

    if (IP !== allowedIP) {
	console.log("IP: ", IP, " Permitida: ", allowedIP)
        return res.status(403).json({ success: false, error: 'Acceso denegado' });
    }

    // Obtener la fecha de hoy en formato YYYY-MM-DD
    let fechaHoy = new Date();
    fechaHoy.setHours(fechaHoy.getHours() - 3); // Ajustar a UTC-3
    let formattedDate = `${fechaHoy.getFullYear()}-${(fechaHoy.getMonth() + 1).toString().padStart(2, '0')}-${fechaHoy.getDate().toString().padStart(2, '0')}`;

    // Consultar la base de datos
    db.all(`SELECT * FROM Usuarios WHERE DATE(Fecha_VIVO) = ? `, [ formattedDate ], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        console.log("formattedDate: ", formattedDate, "rows: ", rows);
        // Filtrar por VIVO
        const conectados = rows.filter(row => row.VIVO === 1);
        const noConectados = rows.filter(row => row.VIVO === 0);
	
	console.log("conectados: ", conectados);
	console.log("noConectados: ", noConectados);
	    
        return res.json({ success: true, conectados, noConectados });
    });
});

// *** PRUEBA DE BASE DE DATOS MYSQL ***
const mysql = require('mysql');

const mysqlConnection = mysql.createConnection({
    host: 'luichomillo.freeddns.org',
    user: 'Luicho',
    password: 'River_1996',
    database: 'luichomillo',
    port: 3306,
    connectTimeout: 10000 // Timeout de conexión de 10 segundos
});

mysqlConnection.connect((err) => {
    if (err) {
        console.error('Error al conectar con MySQL:', err.message);
        return;
    }
    console.log('Conexión a MySQL establecida');
});

// *** Ruta para actualizar o insertar usuario *** MySQL *** 
app.post('/api/usermysql', (req, res) => {
    const { IP, USER } = req.body; // Obtener IP y USER del cuerpo de la solicitud
    console.log("antes del update: IP ", IP, "USER ", USER);
    
    if (!IP || !USER) {
        return res.status(400).json({ success: false, error: 'IP y USER son obligatorios' });
    }

    const fechaHoy = new Date();
    fechaHoy.setHours(fechaHoy.getHours() - 3); // Ajustar a UTC-3
    const fechaVivo = fechaHoy.toISOString().slice(0, 19).replace('T', ' '); // Obtener fecha y hora actual en formato 'YYYY-MM-DD HH:MM:SS'

    // Primero, intentamos actualizar al usuario existente
    const checkQuery = `SELECT HABILITADO FROM Usuarios WHERE IP_USER = ?`;
    
    mysqlConnection.query(checkQuery, [IP], (err, results) => {
        if (err) {
            console.error('Error al consultar el usuario:', err.message);
            return res.status(500).json({ success: false, error: 'Error al consultar la base de datos' });
        }

        // Verificamos si se encontró el usuario
        if (results.length > 0) {
            const habilitado = results[0].HABILITADO;

            // Si el usuario está habilitado, no actualizamos el campo USER
            if (habilitado === 1) {
                const updateQuery = `UPDATE Usuarios SET VIVO = 1, FECHA_VIVO = ? WHERE IP_USER = ?`;
                mysqlConnection.query(updateQuery, [fechaVivo, IP], (err) => {
                    if (err) {
                        console.error('Error al actualizar el estado del usuario:', err.message);
                        return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
                    }
                    return res.json({ success: true, message: 'Estado del usuario actualizado exitosamente' });
                });
            } else {
                // Si no está habilitado, actualizamos el campo USER
                const updateQuery = `UPDATE Usuarios SET USER = ?, VIVO = 1, FECHA_VIVO = ? WHERE IP_USER = ?`;
                mysqlConnection.query(updateQuery, [USER, fechaVivo, IP], (err) => {
                    if (err) {
                        console.error('Error al actualizar el usuario:', err.message);
                        return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
                    }
                    return res.json({ success: true, message: 'Usuario actualizado exitosamente' });
                });
            }
        } else {
            // Si no se encontró el usuario, insertamos un nuevo usuario
            const insertQuery = `INSERT INTO Usuarios (IP_USER, USER, VIVO, FECHA_VIVO, HABILITADO) VALUES (?, ?, 1, ?, 0)`;
            mysqlConnection.query(insertQuery, [IP, USER, fechaVivo], (err) => {
                if (err) {
                    console.error('Error al insertar el usuario:', err.message);
                    return res.status(500).json({ success: false, error: 'Error al insertar en la base de datos' });
                }

                return res.json({ success: true, message: 'Usuario insertado exitosamente' });
            });
        }
    });
});

// *** Registrar Conexión version MYSQL *** CHECK
app.post('/api/register-connection-mysql', (req, res) => {
    const { IP } = req.body;
    console.log("REGISTRAR CONEXION (POST) DE LA IP:", IP);

    // Ajusta la fecha a UTC-3
    let fechaHoy = new Date();
    fechaHoy.setHours(fechaHoy.getHours() - 3);
    let formattedDate = fechaHoy.toISOString().slice(0, 19).replace('T', ' ');

    if (!IP) {
        return res.status(400).json({ success: false, error: 'POST: IP no proporcionada' });
    }

    mysqlConnection.query('SELECT * FROM Usuarios WHERE IP_USER = ?', [IP], (err, results) => {
        if (err) {
            console.error("ERROR EN EL SERVIDOR:", err);
            return res.status(500).json({ success: false, error: 'Error en el servidor' });
        }

        if (results.length > 0) {
            // Si ya existe un registro para esta IP, marcar como conectado
            console.log("FECHA UPDATE:", formattedDate);
            mysqlConnection.query(
                `UPDATE Usuarios SET VIVO = 1, FECHA_VIVO = ? WHERE IP_USER = ?`,
                [formattedDate, IP],
                (err) => {
                    if (err) {
                        console.error("ERROR AL REGISTRAR CONEXION UPDATE:", err);
                        return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
                    }
                    console.log("REGISTRAR CONEXION OK");
                    return res.json({ success: true });
                }
            );
        } else {
            // Si la IP no existe, crear un nuevo usuario anónimo
            console.log("FECHA INSERT:", formattedDate);
            mysqlConnection.query(
                `INSERT INTO Usuarios (USER, IP_USER, VIVO, FECHA_VIVO) VALUES (?, ?, ?, ?)`,
                ['Anónimo', IP, 1, formattedDate],
                (err) => {
                    if (err) {
                        console.error("ERROR AL REGISTRAR CONEXION INSERT:", err);
                        return res.status(500).json({ success: false, error: 'Error al insertar en la base de datos' });
                    }
                    console.log("NUEVA IP");
                    return res.json({ success: true });
                }
            );
        }
    });
});

// *** CONTADOR CONEXIONES *** MYSQL *** CHECK
app.get('/api/connections-mysql', (req, res) => {
    // Ajusta la fecha a UTC-3
    let fecha = new Date();
    fecha.setHours(fecha.getHours() - 3);
    let formattedFecha = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')}`;
    let formattedDate = fecha.toISOString().slice(0, 19).replace('T', ' ');

    // Consulta para contar conexiones activas (VIVO = TRUE) del día actual
    mysqlConnection.query(
        'SELECT COUNT(*) AS connections FROM Usuarios WHERE VIVO = 1 AND DATE(FECHA_VIVO) = ?',
        [formattedFecha],
        (err, results) => {
            if (err) {
                console.error('Error al obtener conexiones:', err.message);
                return res.status(500).json({ success: false, error: 'Error en el servidor' });
            }
            const connections = results[0].connections;
            console.log("Conexiones activas:", connections);
            res.json({ connections });

            // Desconectar usuarios inactivos por más de 10 minutos
            mysqlConnection.query(
                `UPDATE Usuarios 
                 SET VIVO = 0 
                 WHERE VIVO = 1 
                 AND TIMESTAMPDIFF(MINUTE, FECHA_VIVO, ?) > 10`,
                [formattedDate],
                (err) => {
                    if (err) {
                        console.error('Error al actualizar el estado de conexión:', err.message);
                    } else {
                        console.log("Usuarios inactivos desconectados después de 10 minutos.");
                    }
                }
            );
        }
    );
});

// *** CONTADOR DE VISTAS *** MYSQL *** CHECK
app.get('/api/views-mysql', (req, res) => {
    let fecha = new Date();
    fecha.setHours(fecha.getHours() - 3); // Ajuste a UTC-3
    let formattedFecha = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')}`;

    mysqlConnection.query(
        'SELECT COUNT(*) AS views FROM Usuarios WHERE DATE(FECHA_VIVO) = ?',
        [formattedFecha],
        (err, results) => {
            if (err) {
                console.error('Error al obtener vistas:', err.message);
                return res.status(500).json({ success: false, error: 'Error en el servidor' });
            }
            const views = results[0].views;
            console.log("Vistas totales:", views);
            res.json({ views });
        }
    );
});

// PING PARA VERIFICAR CONEXION *** MYSQL *** CHECK
app.post('/api/ping-mysql', (req, res) => {
    const { IP } = req.body;

    if (!IP) {
        return res.status(400).json({ success: false, error: 'IP no proporcionada' });
    }

    let fecha = new Date();
    fecha.setHours(fecha.getHours() - 3); // Ajuste a UTC-3
    let formattedDate = fecha.toISOString().slice(0, 19).replace('T', ' ');

    mysqlConnection.query(
        'UPDATE Usuarios SET FECHA_VIVO = ? WHERE IP_USER = ?',
        [formattedDate, IP],
        (err, result) => {
            if (err) {
                console.error('Error al actualizar FECHA_VIVO en el ping:', err.message);
                return res.status(500).json({ success: false, error: 'Error en el servidor' });
            }
            console.log(`Ping exitoso para IP ${IP}`);
            res.json({ success: true });
        }
    );
});

// LOG OUT DE USUARIOS *** MYSQL *** CHECK
app.post('/api/logout-mysql', (req, res) => {
    const { IP } = req.body;

    if (!IP) {
        return res.status(400).json({ success: false, error: 'IP no proporcionada' });
    }

    mysqlConnection.query(
        'UPDATE Usuarios SET VIVO = 0 WHERE IP_USER = ?',
        [IP],
        (err, result) => {
            if (err) {
                console.error('Error al realizar logout:', err.message);
                return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
            }
            console.log(`Usuario con IP ${IP} desconectado.`);
            res.json({ success: true, message: "Usuario desconectado correctamente" });
        }
    );
});

// CERRAR SESION USUARIOS LUICHOTV *** MYSQL ***
app.post('/api/cerrar-sesion', (req, res) => {
    const { USER, IP } = req.body;

    // Verificación de parámetros obligatorios
    if (!USER || !IP) {
        return res.status(400).json({ success: false, error: 'USER o IP no proporcionados' });
    }

    // Actualizar el estado del usuario en la base de datos
    mysqlConnection.query(
        'UPDATE Usuarios SET HABILITADO = 0 WHERE USER = ? AND IP_USER = ?',
        [USER, IP],
        (err, result) => {
            if (err) {
                console.error('Error al cerrar sesión:', err.message);
                return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
            }
            if (result.affectedRows === 0) {
                // Si no se actualizó ninguna fila, significa que no se encontró el usuario con esa IP
                return res.status(404).json({ success: false, message: 'Usuario no encontrado o ya está desconectado' });
            }
            console.log(`${USER} con IP ${IP} cerró sesión.`);
            res.json({ success: true, message: `Usuario ${USER} cerró sesión correctamente` });
        }
    );
});

// *** VERIFICAR ESTADO DE CONEXION DE LOS USUARIOS ***
app.get('/api/verify-status-mysql', (req, res) => {
    // Consulta para obtener usuarios conectados o vivos cuya última conexión fue hace más de 15 minutos
    const sql = `
        SELECT * FROM Usuarios
        WHERE (VIVO = 1)
        AND TIMESTAMPDIFF(MINUTE, FECHA_VIVO, NOW()) >= 15
    `;
	console.log("sql verify-status: ", sql);
	
    mysqlConnection.query(sql, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (rows.length > 0) {
            // Consulta para actualizar los usuarios inactivos
            const updateSql = `
                UPDATE Usuarios 
                SET VIVO = 0 
                WHERE VIVO = 1 
                AND TIMESTAMPDIFF(MINUTE, FECHA_VIVO, NOW()) >= 15
            `;
	    console.log("updateSql verify-status: ", updateSql);
            mysqlConnection.query(updateSql, (updateErr) => {
                if (updateErr) {
                    return res.status(500).json({ error: updateErr.message });
                }
                console.log("Usuarios inactivos actualizados correctamente.");
                return res.json({ success: true, message: "Usuarios inactivos desconectados", inactiveUsers: rows });
            });
        } else {
            console.log("No hay usuarios inactivos");
            return res.json({ success: true, message: "No hay usuarios inactivos" });
        }
    });
});

// *** VERIFICA STATUS CADA 15' ***
//const axios = require('axios');
//setInterval(() => {
//    axios.get('https://apis-web-1.onrender.com/api/verify-status-mysql')
//        .then(response => {
//            console.log("Verificación de usuarios inactivos completada:", response.data);
//        })
//        .catch(error => {
//            console.log("Error en la verificación de usuarios inactivos:", error.message);
//        });
//}, 15 * 60 * 1000); // Cada 15 minutos

// *** CONECTADOS *** MYSQL
app.post('/api/conectados-mysql', (req, res) => {
    // Verificar la IP del cliente
    const { IP } = req.body;
    console.log("IP recibida en el servidor:", req.body);
    const allowedIP = '190.244.137.138'; // Cambia esto por la IP permitida de tu servidor

    if (IP !== allowedIP) {
        console.log("IP: ", IP, " Permitida: ", allowedIP);
        return res.status(403).json({ success: false, error: 'Acceso denegado' });
    }

    // Obtener la fecha de hoy en formato YYYY-MM-DD
    let fechaHoy = new Date();
    fechaHoy.setHours(fechaHoy.getHours() - 3); // Ajuste a UTC-3
    let formattedDate = `${fechaHoy.getFullYear()}-${(fechaHoy.getMonth() + 1).toString().padStart(2, '0')}-${fechaHoy.getDate().toString().padStart(2, '0')}`;

    // Consultar la base de datos para obtener usuarios conectados en la fecha actual
    mysqlConnection.query(
        `SELECT * FROM Usuarios WHERE DATE(FECHA_VIVO) = ?`,
        [formattedDate],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }

            console.log("formattedDate:", formattedDate, "rows:", rows);

            // Filtrar usuarios según el estado de conexión
            const conectados = rows.filter(row => row.VIVO === 1);
            const noConectados = rows.filter(row => row.VIVO === 0);

            console.log("conectados:", conectados);
            console.log("noConectados:", noConectados);

            return res.json({ success: true, conectados, noConectados });
        }
    );
});

// ***************** LOGIN ***** MYSQL *****************
const multer = require('multer');
const upload = multer();

app.post('/api/login-mysql', (req, res) => {
    // res.setHeader('Access-Control-Allow-Credentials', 'true');
    // res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
	
    const { user, passw, IP } = req.body;
    console.log("user:", user, "passw:", passw, "IP:", IP);

    // Consulta para verificar credenciales
    
    mysqlConnection.query(
        'SELECT * FROM Usuarios WHERE USER = ? AND PASSW = ?',
        [user, passw],
        (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Error en el servidor ' + err.message });
            }

            if (results.length > 0) {
                const row = results[0];
                console.log("Inicia sesión para ID:", row.idUSER);
              
                // Marcar al usuario como conectado
                const fecha = new Date();
		fecha.setHours(fecha.getHours() - 3); // Ajustar a UTC-3
                const formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')} ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;

                mysqlConnection.query(
                    `UPDATE Usuarios SET HABILITADO = 1, VIVO = 1, FECHA_VIVO = ?, IP_USER = ? WHERE idUSER = ?`,
                    [formattedDate, IP, row.idUSER],
                    (err) => {
                        if (err) {
                            return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
                        }                
                        return res.json({ success: true });
                    }
                );
            } else {                
                return res.json({ success: false, error: 'Usuario o contraseña incorrectos' });
            }
        }
    );
});

// **** VERIFICAR SI EL USUARIO ESTA LOGUEADO POR IP **** MYSQL ****
app.get('/api/verificarusuario', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://luichomillo.freeddns.org');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Obtener la IP del parámetro de la URL
    const { IP } = req.query;
    console.log("Parámetro IP recibido: ", IP);

    if (!IP) {
        console.log("No se ha proporcionado una IP");
        return res.json({ loggedIn: false });
    }

    // Consulta a la base de datos para verificar si el usuario está habilitado y vivo
    mysqlConnection.query('SELECT USER, HABILITADO, VIVO FROM Usuarios WHERE IP_User = ?', [IP], (err, results) => {
        if (err) {
            console.error("Error al consultar la base de datos:", err.message);
            return res.json({ loggedIn: false, Nom_Usuario: " " });
        }

        // Verificar si el usuario está habilitado y vivo
        if (results.length > 0) {
            const row = results[0]; // Tomar el primer resultado
            if (row.HABILITADO === 1 && row.VIVO === 1) {
                console.log("Usuario ", row.USER, " está habilitado y conectado. IP ", IP);
                return res.json({ loggedIn: true, Nom_Usuario: row.USER });
            } else {
                console.log("Usuario con IP ", IP, " no está habilitado o conectado");
                return res.json({ loggedIn: false, Nom_Usuario: " " });
            }
        } else {
            console.log("No se encontró ningún usuario con la IP ", IP);
            return res.json({ loggedIn: false, Nom_Usuario: " " });
        }
    });
});

// *** REGISTRAR NUEVO USUARIO *** MYSQL
app.post('/api/register', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://luichomillo.freeddns.org');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const { USER, MAIL, IP } = req.body;

    if (!USER || !MAIL || !IP) {
        return res.status(400).json({ success: false, message: 'USER, MAIL e IP son obligatorios' });
    }

    // Generar una contraseña aleatoria de 6 números
    const password = Math.floor(100000 + Math.random() * 900000).toString();
    const textoMail = `Ingreso a la cuenta de LuichoTV -> https://luichomillo.freeddns.org/LuichoTV.html
    Usuario: ${USER}
    Contraseña: ${password}`;
    
    // Crear la fecha y hora actuales
    const fechaHoy = new Date();
    fechaHoy.setHours(fechaHoy.getHours() - 3); // Ajustar a UTC-3
    const fechaVivo = fechaHoy.toISOString().slice(0, 19).replace('T', ' ');
    console.log("Registro de Usuario: ", fechaVivo);
	
    // Verificar si ya existe un usuario con el mismo MAIL o con la misma combinación de USER e IP_USER
    const checkUserQuery = 'SELECT * FROM Usuarios WHERE MAIL = ? OR (USER = ? AND IP_USER = ?)';
    mysqlConnection.query(checkUserQuery, [MAIL, USER, IP], (error, rows) => {
        if (error) {
            console.log("Error al verificar usuario en la base de datos:", error);
            return res.status(500).json({ success: false, message: 'Error al verificar usuario en la base de datos' });
        }

        if (rows.length > 0) {
            // Si el usuario ya existe (por MAIL o combinación de USER e IP_USER), actualizar el registro
            const updateQuery = `
                UPDATE Usuarios 
                SET USER = ?, PASSW = ?, MAIL = ?, IP_USER = ?, HABILITADO = 1, VIVO = 1, FECHA_VIVO = ?
                WHERE MAIL = ? OR (USER = ? AND IP_USER = ?)
            `;
            mysqlConnection.query(updateQuery, [USER, password, MAIL, IP, fechaVivo, MAIL, USER, IP], (error) => {
                if (error) {
                    console.log("Error al actualizar usuario en la base de datos:", error);
                    return res.status(500).json({ success: false, message: 'Error al actualizar usuario en la base de datos' });
                }

                sendEmail(MAIL, password, 'Usuario actualizado exitosamente', textoMail); // Envía la contraseña por correo
                return res.json({ success: true, message: 'Usuario actualizado exitosamente. Contraseña enviada al mail: ' + MAIL });
            });
        } else {
            // Insertar un nuevo registro si no existe
            const insertQuery = `
                INSERT INTO Usuarios (USER, PASSW, MAIL, IP_USER, CATEGORIA, HABILITADO, VIVO, FECHA_VIVO) 
                VALUES (?, ?, ?, ?, 'INVITADO', 1, 1, ?)
            `;
            mysqlConnection.query(insertQuery, [USER, password, MAIL, IP, fechaVivo], (error) => {
                if (error) {
                    console.error("Error al insertar usuario en la base de datos:", error);
                    return res.status(500).json({ success: false, message: 'Error al insertar usuario en la base de datos' });
                }

                sendEmail(MAIL, password, 'Usuario registrado exitosamente', textoMail); // Envía la contraseña por correo
                return res.json({ success: true, message: 'Usuario registrado exitosamente. Contraseña enviada al mail: ' + MAIL });
            });
        }
    });
});

// Función para enviar el correo
async function sendEmail(mail, password, sujeto, textoMail) {
    let transporter = nodemailer.createTransport({
        service: 'gmail', // O el servicio de correo que uses
        auth: {
            user: 'lvallejos120@gmail.com', // Tu correo
            pass: 'ufnq zmjq kplp poue' // La contraseña de tu correo o un token de aplicación
        }
    });

    let mailOptions = {
        from: 'lvallejos120@gmail.com',
        to: mail,
        subject: sujeto,
        text: textoMail // `Tu contraseña es: ${password}`
    };

    await transporter.sendMail(mailOptions);
}

// *** RESETEAR PASSWORD *** MYSQL
// *** RESTABLECER CONTRASEÑA *** MYSQL
app.post('/api/reset-password', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://luichomillo.freeddns.org');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const { USER, MAIL } = req.body;
    console.log("Restablecer passw: USER ", USER, " MAIL ", MAIL);

    if (!USER || !MAIL) {
	console.log('USER y MAIL son obligatorios');
        return res.status(400).json({ success: false, error: 'USER y MAIL son obligatorios' });
    }   
	
    // Verificar si el usuario y el correo coinciden
    const checkUserEmailQuery = 'SELECT * FROM Usuarios WHERE USER = ? AND MAIL = ?';
    
    mysqlConnection.query(checkUserEmailQuery, [USER, MAIL], (error, rows) => {
        if (error) {
            console.error("Error al verificar el usuario y el correo en la base de datos:", error);
            return res.status(500).json({ success: false, error: 'Error al interactuar con la base de datos' });
        }

        if (rows.length === 0) {
            // Si no existe el usuario y el correo, se solicita registrarse
		console.log('Usuario no encontrado. Por favor, regístrese.');
            return res.status(404).json({ success: false, error: 'Usuario no encontrado. Por favor, regístrese.' });
        }

        // Generar una nueva contraseña aleatoria de 6 números
        const newPassword = Math.floor(100000 + Math.random() * 900000).toString();
        // console.log("Nueva contraseña generada: ", newPassword);
	const textoMail = `Ingreso a la cuenta de LuichoTV -> https://luichomillo.freeddns.org/LuichoTV.html
		Usuario: ${USER}
		Contraseña: ${newPassword}`;
	    
        // Actualizar la contraseña en la base de datos
        const updatePasswordQuery = 'UPDATE Usuarios SET PASSW = ? WHERE USER = ? AND MAIL = ?';
        console.log('update', USER, MAIL);
        mysqlConnection.query(updatePasswordQuery, [newPassword, USER, MAIL], (error) => {
            if (error) {
                console.error("Error al actualizar la contraseña en la base de datos:", error);
                return res.status(500).json({ success: false, error: 'Error al actualizar la contraseña en la base de datos.' });
            }
		console.log('exito');
            sendEmail(MAIL, newPassword, 'Nueva contraseña generada', textoMail); // Envía la nueva contraseña por correo
            return res.json({ success: true, message: 'Nueva contraseña enviada al correo ' + MAIL });
        });
    });
});

// **** MANTENER ACTIVO A RENDER *****
const cron = require('node-cron');
const axios = require('axios');

// Configura el cron para hacer un ping cada 2 minutos
cron.schedule('*/2 * * * *', async () => {
    try {
        const response = await axios.get('https://apis-web-1.onrender.com/api/ping-activador');
        console.log('Ping exitoso:', response.data);
    } catch (error) {
        console.error('Error al hacer ping:', error.message);
    }
    axios.get('https://apis-web-1.onrender.com/api/verify-status-mysql')
	     .then(response => {
	     	console.log("Verificación de usuarios inactivos completada:", response.data);
	     })
	     .catch(error => {
	      	console.log("Error en la verificación de usuarios inactivos:", error.message);
             });
});

app.get('/api/ping-activador', (req, res) => {
    res.json({ success: true, message: 'Ping recibido' });
});

// *** GUARDAR AVATAR ***
app.post('/api/guardar-avatar', (req, res) => {
    const { user, ip_user, avatar } = req.body;

    // Aquí deberías implementar la lógica para guardar el avatar en tu base de datos
    const query = 'UPDATE Usuarios SET AVATAR = ? WHERE USER = ? AND  IP_USER = ?';
    
    mysqlConnection.query(query, [avatar, user, ip_user], (error, results) => {
        if (error) {
            console.log('Error al guardar el avatar:', error);
            return res.status(500).json({ success: false, error: 'Error al guardar el avatar' });
        }
        res.json({ success: true });
    });
});

// *** CARGAR AVATAR ***
app.get('/api/cargar-avatar', (req, res) => {
    const { user, ip_user } = req.query;
    console.log("Cargar avatar: USER ", user, " IP ", ip_user, "req.query ", req.query);
	
    // Aquí deberías implementar la lógica para obtener el avatar del usuario
    const query = 'SELECT AVATAR FROM Usuarios WHERE USER = ? AND IP_USER = ?';

    console.log("query: ", query)
    mysqlConnection.query(query, [user, ip_user], (error, results) => {
        if (error) {
            console.error('Error al cargar el avatar:', error);
            return res.status(500).json({ success: false, error: 'Error al cargar el avatar' });
        }

        if (results.length > 0) {
            // Retorna el avatar del usuario
            res.json({ success: true, avatar: results[0].AVATAR });
        } else {
            // Si no se encuentra el usuario o el avatar
            res.json({ success: false, avatar: null });
        }
    });
});

app.post('/api/guardarUltimoCapitulo', (req, res) => {
    const { IP, USER, TIT, TEMP, CAP } = req.body;

    // Primero busco si la serie ya tiene alguna entrada para este usuario
    const query = 'SELECT * FROM SERIES WHERE USER = ? AND IP_USER = ? AND NOMBRE_SERIE = ?';
    mysqlConnection.query(query, [USER, IP, TIT], (error, results) => {
        if (error) {
            return res.status(500).json({ error: 'Error en la consulta' });
        }

        if (results.length > 0) {
            // Si hay resultados, hago un UPDATE
            const updateQuery = 'UPDATE SERIES SET TEMPORADA = ?, CAPITULO = ? WHERE USER = ? AND IP_USER = ? AND NOMBRE_SERIE = ?';
            mysqlConnection.query(updateQuery, [TEMP, CAP, USER, IP, TIT], (updateError) => {
                if (updateError) {
                    return res.status(500).json({ error: 'Error al actualizar la serie' });
                }
                res.status(200).json({ message: 'Serie actualizada correctamente' });
            });
        } else {
            // Si no hay resultados, hago un INSERT
            const insertQuery = 'INSERT INTO SERIES (USER, IP_USER, NOMBRE_SERIE, TEMPORADA, CAPITULO) VALUES (?, ?, ?, ?, ?)';
            mysqlConnection.query(insertQuery, [USER, IP, TIT, TEMP, CAP], (insertError) => {
                if (insertError) {
                    return res.status(500).json({ error: 'Error al insertar la serie' });
                }
                res.status(200).json({ message: 'Serie guardada correctamente' });
            });
        }
    });
});

// ****** Endpoint para obtener el árbol genealógico URTURI ********
app.get('/api/arbol-genealogico', (req, res) => {
    const query = 'SELECT * FROM URTURI ORDER BY nivel ASC, fecha_nacimiento ASC';
    mysqlConnection.query(query, (err, results) => {
        if (err) throw err;
        res.json(results);
    });
});

// ******************************************************************
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
