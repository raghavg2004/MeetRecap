const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = 3000;
const MAX_ROOM_SIZE = Number(process.env.MAX_ROOM_SIZE || 12);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret-change-me";
const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || true,
  },
});

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || true,
  credentials: true,
}));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/meeting", (req, res) => {
  const meetingId = sanitizeMeetingId(req.query?.meeting);
  if (!meetingId) {
    res.redirect("/dashboard");
    return;
  }

  res.sendFile(path.join(__dirname, "public", "meeting.html"));
});

app.get("/meeting/:meetingId", (req, res) => {
  const meetingId = sanitizeMeetingId(req.params?.meetingId);
  if (!meetingId) {
    res.redirect("/dashboard");
    return;
  }

  res.redirect(`/meeting?meeting=${encodeURIComponent(meetingId)}`);
});

const usersByEmail = new Map();
const usersById = new Map();
const meetingsByUser = new Map();
const meetingHistoryByUser = new Map();
const rooms = new Map();

function sanitizeMeetingId(roomId) {
  if (typeof roomId !== "string") {
    return "";
  }

  const cleaned = roomId.trim().toUpperCase();
  return /^[A-Z0-9-]{4,32}$/.test(cleaned) ? cleaned : "";
}

function sanitizeDisplayName(username) {
  if (typeof username !== "string") {
    return "";
  }

  const cleaned = username.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 24) {
    return "";
  }

  return cleaned.replace(/[<>]/g, "");
}

function sanitizeEmail(email) {
  if (typeof email !== "string") {
    return "";
  }

  const cleaned = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : "";
}

function sanitizeChatMessage(text) {
  if (typeof text !== "string") {
    return "";
  }

  const cleaned = text.trim();
  if (!cleaned || cleaned.length > 1000) {
    return "";
  }

  return cleaned.replace(/[<>]/g, "");
}

function sanitizeMeetingTitle(title) {
  if (typeof title !== "string") {
    return "";
  }

  const cleaned = title.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 60) {
    return "";
  }

  return cleaned.replace(/[<>]/g, "");
}

function getRequestAuthUser(req) {
  const bearer = req.headers.authorization;
  if (bearer && bearer.startsWith("Bearer ")) {
    const token = bearer.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = usersById.get(decoded.sub);
      if (user) {
        return user;
      }
    } catch {
      return null;
    }
  }

  if (req.session?.userId) {
    return usersById.get(req.session.userId) || null;
  }

  return null;
}

function requireAuth(req, res, next) {
  const user = getRequestAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.authUser = user;
  next();
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

function issueToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

function listForUser(map, userId) {
  if (!map.has(userId)) {
    map.set(userId, []);
  }

  return map.get(userId);
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      hostSocketId: "",
      startedAt: 0,
      participants: new Map(),
      pendingRequests: new Map(),
    });
  }

  return rooms.get(roomId);
}

function findScheduledMeetingByRoomId(roomId) {
  for (const meetings of meetingsByUser.values()) {
    const found = meetings.find((meeting) => meeting.roomId === roomId);
    if (found) {
      return found;
    }
  }

  return null;
}

function roomMeta(room) {
  const scheduled = findScheduledMeetingByRoomId(room.roomId);
  return {
    roomId: room.roomId,
    hostSocketId: room.hostSocketId,
    startedAt: room.startedAt,
    participantCount: room.participants.size,
    pendingApprovalCount: room.pendingRequests.size,
    scheduledFor: scheduled?.scheduledFor || null,
    scheduledTitle: scheduled?.title || "",
  };
}

function participantPayload([socketId, participant]) {
  return {
    socketId,
    userId: participant.userId,
    username: participant.username,
    isHost: participant.isHost,
  };
}

function isSocketInSameRoom(socket, targetSocketId) {
  const roomId = socket.data.roomId;
  if (!roomId) {
    return false;
  }

  const room = rooms.get(roomId);
  if (!room) {
    return false;
  }

  return room.participants.has(targetSocketId);
}

function pendingRequestPayload([socketId, request]) {
  return {
    socketId,
    userId: request.userId,
    username: request.username,
    requestedAt: request.requestedAt,
  };
}

function emitPendingRequestsToHost(room) {
  if (!room.hostSocketId) {
    return;
  }

  io.to(room.hostSocketId).emit("join-requests-updated", {
    requests: Array.from(room.pendingRequests.entries()).map(pendingRequestPayload),
  });
}

function admitParticipant({ socket, room, username, isHost }) {
  const existingUsers = Array.from(room.participants.entries()).map(participantPayload);

  room.participants.set(socket.id, {
    userId: socket.data.authUser.id,
    username,
    isHost,
    joinedAt: Date.now(),
  });

  room.pendingRequests.delete(socket.id);

  socket.data.roomId = room.roomId;
  socket.data.pendingRoomId = "";
  socket.data.userId = socket.data.authUser.id;
  socket.data.username = username;
  socket.data.isHost = isHost;

  socket.join(room.roomId);
  socket.emit("existing-users", {
    selfSocketId: socket.id,
    users: existingUsers,
    roomMeta: roomMeta(room),
  });

  socket.to(room.roomId).emit("user-joined", {
    socketId: socket.id,
    userId: socket.data.authUser.id,
    username,
    isHost,
  });

  io.to(room.roomId).emit("room-meta-updated", roomMeta(room));
  emitPendingRequestsToHost(room);
}

app.post("/api/auth/register", async (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const displayName = sanitizeDisplayName(req.body?.displayName);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !displayName || password.length < 8 || password.length > 72) {
    res.status(400).json({ error: "Invalid register payload." });
    return;
  }

  if (usersByEmail.has(email)) {
    res.status(409).json({ error: "Email already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id: crypto.randomUUID(),
    email,
    displayName,
    passwordHash,
    createdAt: Date.now(),
  };

  usersByEmail.set(email, user);
  usersById.set(user.id, user);
  req.session.userId = user.id;

  res.status(201).json({
    token: issueToken(user),
    user: publicUser(user),
  });
});

app.post("/api/auth/login", async (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password) {
    res.status(400).json({ error: "Invalid login payload." });
    return;
  }

  const user = usersByEmail.get(email);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  req.session.userId = user.id;
  res.json({
    token: issueToken(user),
    user: publicUser(user),
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.authUser) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.post("/api/meetings/schedule", requireAuth, (req, res) => {
  const title = sanitizeMeetingTitle(req.body?.title);
  const roomId = sanitizeMeetingId(req.body?.roomId);
  const scheduledFor = Number(req.body?.scheduledFor);

  if (!title || !roomId || !Number.isFinite(scheduledFor) || scheduledFor <= Date.now()) {
    res.status(400).json({ error: "Invalid schedule payload." });
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    title,
    roomId,
    scheduledFor,
    createdAt: Date.now(),
  };

  const scheduled = listForUser(meetingsByUser, req.authUser.id);
  scheduled.push(entry);
  scheduled.sort((a, b) => a.scheduledFor - b.scheduledFor);

  res.status(201).json({ meeting: entry });
});

app.get("/api/meetings/scheduled", requireAuth, (req, res) => {
  const now = Date.now();
  const scheduled = listForUser(meetingsByUser, req.authUser.id).filter((m) => m.scheduledFor >= now);
  res.json({ meetings: scheduled });
});

app.post("/api/meetings/history", requireAuth, (req, res) => {
  const roomId = sanitizeMeetingId(req.body?.roomId);
  const title = sanitizeMeetingTitle(req.body?.title || "Instant meeting");
  const joinedAt = Number(req.body?.joinedAt);
  const leftAt = Number(req.body?.leftAt);

  if (!roomId || !Number.isFinite(joinedAt) || !Number.isFinite(leftAt) || leftAt < joinedAt) {
    res.status(400).json({ error: "Invalid history payload." });
    return;
  }

  const history = listForUser(meetingHistoryByUser, req.authUser.id);
  history.unshift({
    id: crypto.randomUUID(),
    roomId,
    title,
    joinedAt,
    leftAt,
    durationMs: leftAt - joinedAt,
  });

  if (history.length > 50) {
    history.length = 50;
  }

  res.status(201).json({ ok: true });
});

app.get("/api/meetings/history", requireAuth, (req, res) => {
  const history = listForUser(meetingHistoryByUser, req.authUser.id);
  res.json({ meetings: history });
});

app.get("/config", (req, res) => {
  const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

  const turnUrl = process.env.TURN_URL;
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  res.json({
    iceServers,
    authRequired: true,
  });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== "string") {
    next(new Error("Authentication required."));
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = usersById.get(decoded.sub);
    if (!user) {
      next(new Error("Invalid auth token."));
      return;
    }

    socket.data.authUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    };
    next();
  } catch {
    next(new Error("Authentication failed."));
  }
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, username }) => {
    const safeRoomId = sanitizeMeetingId(roomId);
    const safeUsername = sanitizeDisplayName(username) || socket.data.authUser.displayName;

    if (!safeRoomId) {
      socket.emit("error-message", "Invalid meeting ID.");
      return;
    }

    const room = getRoom(safeRoomId);

    if (room.participants.has(socket.id)) {
      return;
    }

    if (room.participants.size >= MAX_ROOM_SIZE) {
      socket.emit("error-message", "This meeting is full.");
      return;
    }

    const scheduled = findScheduledMeetingByRoomId(safeRoomId);
    if (scheduled && Date.now() < scheduled.scheduledFor) {
      socket.data.pendingRoomId = safeRoomId;
      socket.emit("lobby-wait", {
        reason: "scheduled-not-started",
        scheduledFor: scheduled.scheduledFor,
        title: scheduled.title,
      });
      return;
    }

    const isHost = room.participants.size === 0;
    if (isHost) {
      room.hostSocketId = socket.id;
      room.startedAt = Date.now();
      admitParticipant({ socket, room, username: safeUsername, isHost: true });
      emitPendingRequestsToHost(room);
      return;
    }

    room.pendingRequests.set(socket.id, {
      userId: socket.data.authUser.id,
      username: safeUsername,
      requestedAt: Date.now(),
    });

    socket.data.pendingRoomId = safeRoomId;
    socket.emit("lobby-wait", {
      reason: "awaiting-host-approval",
      scheduledFor: scheduled?.scheduledFor || null,
      title: scheduled?.title || "",
    });

    emitPendingRequestsToHost(room);
  });

  socket.on("host-lobby-decision", ({ action, targetSocketId }) => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    const hostParticipant = room.participants.get(socket.id);
    if (!hostParticipant?.isHost) {
      socket.emit("error-message", "Only host can approve requests.");
      return;
    }

    if (!targetSocketId || !room.pendingRequests.has(targetSocketId)) {
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (!targetSocket) {
      room.pendingRequests.delete(targetSocketId);
      emitPendingRequestsToHost(room);
      return;
    }

    const request = room.pendingRequests.get(targetSocketId);
    if (action === "approve") {
      if (room.participants.size >= MAX_ROOM_SIZE) {
        targetSocket.emit("join-rejected", { reason: "meeting-full" });
        targetSocket.data.pendingRoomId = "";
        room.pendingRequests.delete(targetSocketId);
        emitPendingRequestsToHost(room);
        return;
      }

      admitParticipant({
        socket: targetSocket,
        room,
        username: request.username,
        isHost: false,
      });
      targetSocket.emit("join-approved", { roomMeta: roomMeta(room) });
      return;
    }

    if (action === "reject") {
      room.pendingRequests.delete(targetSocketId);
      targetSocket.data.pendingRoomId = "";
      targetSocket.emit("join-rejected", { reason: "rejected-by-host", by: socket.data.username });
      emitPendingRequestsToHost(room);
    }
  });

  socket.on("offer", ({ to, description }) => {
    if (!isSocketInSameRoom(socket, to)) {
      return;
    }

    io.to(to).emit("offer", {
      from: socket.id,
      description,
    });
  });

  socket.on("answer", ({ to, description }) => {
    if (!isSocketInSameRoom(socket, to)) {
      return;
    }

    io.to(to).emit("answer", {
      from: socket.id,
      description,
    });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    if (!isSocketInSameRoom(socket, to)) {
      return;
    }

    io.to(to).emit("ice-candidate", {
      from: socket.id,
      candidate,
    });
  });

  socket.on("chat-message", ({ text }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const safeText = sanitizeChatMessage(text);
    if (!safeText) {
      socket.emit("error-message", "Message is empty or too long.");
      return;
    }

    io.to(roomId).emit("chat-message", {
      id: `${Date.now()}-${socket.id}`,
      socketId: socket.id,
      userId: socket.data.userId,
      username: socket.data.username,
      text: safeText,
      timestamp: Date.now(),
    });
  });

  socket.on("host-control", ({ action, targetSocketId }) => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    const hostParticipant = room.participants.get(socket.id);
    if (!hostParticipant?.isHost) {
      socket.emit("error-message", "Only host can use this action.");
      return;
    }

    if (!targetSocketId || !room.participants.has(targetSocketId) || targetSocketId === socket.id) {
      return;
    }

    if (action === "mute-user") {
      io.to(targetSocketId).emit("host-force-mute", { by: socket.data.username });
      return;
    }

    if (action === "remove-user") {
      io.to(targetSocketId).emit("removed-by-host", { by: socket.data.username });
      const target = io.sockets.sockets.get(targetSocketId);
      if (target) {
        target.disconnect(true);
      }
    }
  });

  socket.on("disconnect", () => {
    const pendingRoomId = socket.data.pendingRoomId;
    if (pendingRoomId && rooms.has(pendingRoomId)) {
      const pendingRoom = rooms.get(pendingRoomId);
      pendingRoom.pendingRequests.delete(socket.id);
      emitPendingRequestsToHost(pendingRoom);
    }

    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      return;
    }

    const removed = room.participants.get(socket.id);
    room.participants.delete(socket.id);

    if (removed) {
      socket.to(roomId).emit("user-left", {
        socketId: socket.id,
        userId: removed.userId,
        username: removed.username,
      });
    }

    if (room.participants.size === 0) {
      room.pendingRequests.forEach((_, pendingSocketId) => {
        const pendingSocket = io.sockets.sockets.get(pendingSocketId);
        pendingSocket?.emit("join-rejected", { reason: "meeting-ended" });
        if (pendingSocket) {
          pendingSocket.data.pendingRoomId = "";
        }
      });
      rooms.delete(roomId);
      return;
    }

    if (room.hostSocketId === socket.id) {
      const [nextHostSocketId, nextHostParticipant] = room.participants.entries().next().value;
      room.hostSocketId = nextHostSocketId;
      nextHostParticipant.isHost = true;

      const promotedSocket = io.sockets.sockets.get(nextHostSocketId);
      if (promotedSocket) {
        promotedSocket.data.isHost = true;
        promotedSocket.emit("user-role-updated", { isHost: true });
      }

      emitPendingRequestsToHost(room);
    }

    io.to(roomId).emit("room-meta-updated", roomMeta(room));
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
