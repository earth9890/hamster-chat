import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', users: users.size, waiting: waitingUsers.length });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

interface User {
  id: string;
  socketId: string;
  isWaiting: boolean;
}

const users = new Map<string, User>();
const waitingUsers: string[] = [];

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  const user: User = {
    id: socket.id,
    socketId: socket.id,
    isWaiting: false
  };
  
  users.set(socket.id, user);

  socket.on('find-partner', () => {
    console.log('User looking for partner:', socket.id);
    console.log('Current waiting users:', waitingUsers);
    
    const userIndex = waitingUsers.indexOf(socket.id);
    if (userIndex !== -1) {
      console.log('User already in waiting list');
      return;
    }
    
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift()!;
      const partner = users.get(partnerId);
      
      if (partner && partner.socketId !== socket.id) {
        const roomId = `room-${socket.id}-${partnerId}`;
        console.log('Matching users:', socket.id, 'with', partnerId, 'in room:', roomId);
        
        socket.join(roomId);
        io.to(partnerId).socketsJoin(roomId);
        
        socket.to(partnerId).emit('partner-found', { roomId, initiator: false });
        socket.emit('partner-found', { roomId, initiator: true });
        
        user.isWaiting = false;
        partner.isWaiting = false;
      } else {
        waitingUsers.push(socket.id);
        user.isWaiting = true;
        socket.emit('waiting-for-partner');
        console.log('Added to waiting list:', socket.id);
      }
    } else {
      waitingUsers.push(socket.id);
      user.isWaiting = true;
      socket.emit('waiting-for-partner');
      console.log('First user in waiting list:', socket.id);
    }
  });

  socket.on('offer', ({ offer, roomId }) => {
    socket.to(roomId).emit('offer', { offer });
  });

  socket.on('answer', ({ answer, roomId }) => {
    socket.to(roomId).emit('answer', { answer });
  });

  socket.on('ice-candidate', ({ candidate, roomId }) => {
    socket.to(roomId).emit('ice-candidate', { candidate });
  });

  socket.on('leave-room', ({ roomId }) => {
    socket.leave(roomId);
    socket.to(roomId).emit('partner-disconnected');
  });

  socket.on('chat-message', ({ message, roomId }) => {
    console.log('Chat message in room:', roomId, 'Message:', message);
    socket.to(roomId).emit('chat-message', { message, roomId });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const user = users.get(socket.id);
    if (user && user.isWaiting) {
      const index = waitingUsers.indexOf(socket.id);
      if (index > -1) {
        waitingUsers.splice(index, 1);
      }
    }
    
    users.delete(socket.id);
    
    socket.rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        socket.to(roomId).emit('partner-disconnected');
      }
    });
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});