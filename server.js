const express = require('express');
const app = express();

const http = require('http');
const path = require('path');
const {Server} = require('socket.io');

const ACTIONS = require('./src/actions/Actions');

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('build'));
app.use((req, res, next) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const userSocketMap = {};
const roomHostMap = {};  
const roomWriteAccessMap = {};  
const pendingAccessRequests = new Set(); 

function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
                isHost: roomHostMap[roomId] === socketId,
                hasWriteAccess: roomWriteAccessMap[roomId] === socketId
            };
        }
    );
}

function assignNewHost(roomId, hostId) {
    const clients = getAllConnectedClients(roomId);
    if (clients.length > 0) {
        let newHost = clients[0].socketId;
        if(newHost === hostId) {
            if(clients.length > 1) {
                roomHostMap[roomId] = clients[1].socketId;
                newHost = roomHostMap[roomId];
            }
        } else {
            roomHostMap[roomId] = newHost;
        }
        
        // Give write access to new host if no one has it
        if (!roomWriteAccessMap[roomId]) {
            roomWriteAccessMap[roomId] = newHost;
            console.log(newHost)
            io.to(newHost).emit(ACTIONS.WRITE_ACCESS_GRANTED);
        }

        io.to(roomId).emit(ACTIONS.NEW_HOST, {
            socketId: newHost,
            username: userSocketMap[newHost]
        });
    }
}

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, ({roomId, username}) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);

        // If this is the first user to join, make them the host and give write access
        if (!roomHostMap[roomId]) {
            roomHostMap[roomId] = socket.id;
            roomWriteAccessMap[roomId] = socket.id; // Give initial write access to host
        }

        const clients = getAllConnectedClients(roomId);
        clients.forEach(({socketId}) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    // Handle write access request from user
    socket.on(ACTIONS.REQUEST_WRITE_ACCESS, ({roomId}) => {
        const hostSocketId = roomHostMap[roomId];
        if (hostSocketId && !pendingAccessRequests.has(socket.id)) {
            pendingAccessRequests.add(socket.id);
            io.to(hostSocketId).emit(ACTIONS.WRITE_ACCESS_REQUEST, {
                socketId: socket.id,
                username: userSocketMap[socket.id]
            });
        }
    });

    // Add new event for host to revoke write access
    socket.on(ACTIONS.REVOKE_WRITE_ACCESS, ({ roomId, targetSocketId }) => {
        if (socket.id === roomHostMap[roomId]) {
            if (roomWriteAccessMap[roomId] === targetSocketId) {
                // Revoke write access
                delete roomWriteAccessMap[roomId];
                io.to(targetSocketId).emit(ACTIONS.WRITE_ACCESS_REVOKED);

                // Give write access back to host
                roomWriteAccessMap[roomId] = socket.id;
                socket.emit(ACTIONS.WRITE_ACCESS_GRANTED);

                // Notify all clients about the change
                io.to(roomId).emit(ACTIONS.WRITE_ACCESS_CHANGED, {
                    socketId: socket.id,
                    username: userSocketMap[socket.id]
                });
            }
        }
    });

    // Handle host's response to write access request
    socket.on(ACTIONS.WRITE_ACCESS_RESPONSE, ({roomId, requestingSocketId, granted}) => {
        if (socket.id === roomHostMap[roomId]) {
            pendingAccessRequests.delete(requestingSocketId);
            
            if (granted) {
                // Revoke previous write access if any
                if (roomWriteAccessMap[roomId]) {
                    io.to(roomWriteAccessMap[roomId]).emit(ACTIONS.WRITE_ACCESS_REVOKED);
                }
                
                roomWriteAccessMap[roomId] = requestingSocketId;
                io.to(requestingSocketId).emit(ACTIONS.WRITE_ACCESS_GRANTED);
                
                // Notify all clients about the new write access holder
                io.to(roomId).emit(ACTIONS.WRITE_ACCESS_CHANGED, {
                    socketId: requestingSocketId,
                    username: userSocketMap[requestingSocketId]
                });
            } else {
                io.to(requestingSocketId).emit(ACTIONS.WRITE_ACCESS_DENIED);
                
                // If no one has write access, give it to host
                if (!roomWriteAccessMap[roomId]) {
                    roomWriteAccessMap[roomId] = socket.id;
                    socket.emit(ACTIONS.WRITE_ACCESS_GRANTED);
                    io.to(roomId).emit(ACTIONS.WRITE_ACCESS_CHANGED, {
                        socketId: socket.id,
                        username: userSocketMap[socket.id]
                    });
                }
            }
        }
    });

    // Only allow code changes from users with write access
    socket.on(ACTIONS.CODE_CHANGE, ({roomId, code}) => {
        if (roomWriteAccessMap[roomId] === socket.id) {
            socket.in(roomId).emit(ACTIONS.CODE_CHANGE, {code});
        }
    });
    
    socket.on(ACTIONS.SYNC_CODE, ({socketId, code}) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, {code});
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });

            // If the disconnecting user had write access, give it to host
            if (roomWriteAccessMap[roomId] === socket.id) {
                delete roomWriteAccessMap[roomId];
                const hostSocketId = roomHostMap[roomId];
                if (hostSocketId) {
                    roomWriteAccessMap[roomId] = hostSocketId;
                    io.to(hostSocketId).emit(ACTIONS.WRITE_ACCESS_GRANTED);
                    io.to(roomId).emit(ACTIONS.WRITE_ACCESS_CHANGED, {
                        socketId: hostSocketId,
                        username: userSocketMap[hostSocketId]
                    });
                }
            }

            // If the host is leaving, assign a new host
            if (roomHostMap[roomId] === socket.id) {
                console.log("host left");
                assignNewHost(roomId, socket.id);
            }
        });
        
        pendingAccessRequests.delete(socket.id);
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

app.get('/', (req, res) => {
    const htmlContent = '<h1>Welcome to the code editor server</h1>';
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlContent);
});

const PORT = process.env.SERVER_PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));