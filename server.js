const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const admin = require("firebase-admin");

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

// API de prueba para consultar la base de datos
app.get('/api/test', (req, res) => {
    
        db.all(`SELECT * FROM USUARIOS`, (err, row) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ "Usuarios: ", rows });
            }
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

// *** Ruta para registrar la conexión de un usuario ***
app.post('/api/register-connection', (req, res) => {
    const { IP } = req.body;
    console.log("REGISTRAR CONEXION (POST) DE LA IP: ", IP);
    
    let fecha = new Date();
    let formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')} ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;

    if (!IP) {
        return res.status(400).json({ success: false, error: 'POST: IP no proporcionada' });
    }

    db.get('SELECT * FROM USUARIOS WHERE IP_USER = ?', [IP], (err, row) => {
        if (err) {
            console.log("ERROR EN EL SERVIDOR: ", err);
            return res.status(500).json({ success: false, error: 'Error en el servidor' });
        }

        if (row) {
            // Si ya existe un registro para esta IP, marcar como conectado
            console.log("FECHA UPDATE", formattedDate);
            db.run(`UPDATE USUARIOS SET VIVO = TRUE, Fecha_VIVO = ? WHERE IP_USER = ?`, [formattedDate, IP], function(err) {
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
            db.run(`INSERT INTO USUARIOS (USER, IP_USER, VIVO, Fecha_VIVO) VALUES (?, ?, ?, ?)`, ['Anónimo', IP, true, formattedDate], function(err) {
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
// *** CONTADOR DE CONEXIONES ***
app.get('/api/connections', (req, res) => {
	// const { conexiones } = req.body;

	let fecha = new Date();
	let formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')} ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
	let formattedFecha = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')}`;

	db.get('SELECT COUNT(*) AS connections FROM USUARIOS WHERE VIVO = TRUE AND DATE(Fecha_VIVO) = ?', [formattedFecha], (err, row) => {
	    if (err) {
        	console.error('Error al obtener conexiones:', err.message); 
	        return res.status(500).json({ success: false, error: 'Error en el servidor' });
		console.log("error api/connections");
	    }
	    //console.log("Conns: ", row.connections);
	    return res.json({ connections: row.connections });
		
	    // si cantidad nueva es distinta de la anterior la modifico en Firebase
	    //console.log("conn ant.", conexiones, "conn actual", row.connections );
	    //if (row.connections!=conexiones) {
	    //	    CONN.set({ CANT: row.connections }, { merge: true })  // Actualizar el campo 'CANT' API/CONNECTIONS en Firebase
	    //	    console.log("connections enviadas a FIREBASE:",row.connections );
	    // };	
	});
	
	// *** ACA VOY A CONTROLAR CUANTO TIEMPO LLEVAN SIN HACER EL PING, MAS DE 10' LO DESCONECTO ***

	db.run(`UPDATE USUARIOS SET VIVO = FALSE WHERE VIVO = TRUE AND (strftime('%H',?)*60 + strftime('%M',?)) - (strftime('%H',Fecha_VIVO)*60 + strftime('%M',Fecha_VIVO)) > 10`, [formattedDate, formattedDate], function(err) {
        if (err) {
		console.log('Error al actualizar la base de datos');
        }
    });
});

// *** CONTADOR DE VISTAS TOTALES ***
app.get('/api/views', (req, res) => {
	// const { vistas } = req.body;

	let fecha = new Date();
	let formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')}`;

    db.get('SELECT COUNT(*) AS views FROM USUARIOS WHERE DATE(Fecha_VIVO) = ?', [formattedDate], (err, row) => {
    	if (err) {
        	console.error('Error al obtener vistas:', err.message);  // Verificar errores
        	return res.status(500).json({ success: false, error: 'Error en el servidor' });
    	}
    	//console.log("views: ", row.views);
	return res.json({ views: row.views });
	    
	// si cantidad nueva es distinta de la anterior la modifico en Firebase
	//    console.log("vistas ant.", vistas, "vistas actual", row.views );
	//    if (row.views!=vistas) {
	//	    VIEWS.set({ CANT: row.views }, { merge: true })  // Actualizar el campo 'CANT' API/VIEWS en Firebase
	//	    console.log("views enviados a FIREBASE:", row.views );
	//	};
	});

// *** Ruta para desconectar a un usuario ***
app.post('/api/disconnect', (req, res) => {
    const { IP } = req.body;

    if (!IP) {
        return res.status(400).json({ success: false, error: 'IP no proporcionada' });
    }

    db.run(`UPDATE USUARIOS SET CONECTADO = FALSE WHERE IP_USER = ?`, [IP], function(err) {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
        }
        return res.json({ success: true });
    });
});

});

// *** PING AL USUARIO PARA VERIFICAR DESCONEXION ***
app.post('/api/ping', (req, res) => {
    const { IP } = req.body;

    let fecha = new Date();
    let formattedDate = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}-${fecha.getDate().toString().padStart(2, '0')} ${fecha.getHours().toString().padStart(2, '0')}:${fecha.getMinutes().toString().padStart(2, '0')}`;
    
    // Actualizar la última actividad del usuario en la base de datos
    db.run(`UPDATE USUARIOS SET Fecha_VIVO = ? WHERE IP_USER = ?`, [formattedDate, IP], function(err) {
        if (err) {
            console.error('Error al actualizar Fecha_VIVO en el ping:', err.message);
            return res.status(500).json({ success: false, error: 'Error en el servidor' });
        }
        return res.json({ success: true });
	console.log("PING EXITOSO ", IP)
    });
});

// ****LOGOUT USUARIOS****
app.post('/api/logout', (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);

    const { IP } = req.query;  // IP viene en la query de la URL
    console.log("IP logout: ", IP);

    if (!IP) {
        return res.status(400).json({ success: false, error: 'IP no proporcionada' });
    }

    db.get('SELECT * FROM USUARIOS WHERE IP_USER = ?', [IP], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Error en el servidor' });
        }

        if (row) {
            console.log("cierra sesión para Usuario: ", row.USER);

            // Marcar al usuario como DESconectado
            db.run(`UPDATE USUARIOS SET CONECTADO = FALSE WHERE IP_User = ?`, [IP], function (err) {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Error al actualizar la base de datos' });
                }

                console.log("LOGOUT success true");
                return res.json({ success: true });
            });
        } else {
            console.log("Usuario no encontrado para la IP: ", IP);
            return res.json({ success: false, error: 'Usuario no encontrado' });
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

app.get('/api/chat/messages', (req, res) => {
    admin.firestore().collection('messages').orderBy('timestamp', 'desc').limit(50).get()
        .then(snapshot => {
            const messages = [];
            snapshot.forEach(doc => messages.push(doc.data()));
            res.json(messages);
        })
        .catch(error => res.status(500).json({ error: error.message }));
});
