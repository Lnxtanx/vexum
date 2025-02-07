
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";  // Load environment variables

dotenv.config(); // Load .env fil


const app = express();
const server = createServer(app);
const io = new Server(server);
const allusers = {};

// Get __dirname in ES modules
const __dirname = dirname(fileURLToPath(import.meta.url));

// Serve static files from public and app directories
app.use(express.static(join(__dirname, "public")));
app.use(express.static(join(__dirname, "app")));  // Expose 'app' folder

// Supabase setup using environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Handle incoming HTTP request
app.get("/", (req, res) => {
    console.log("GET Request /");
    res.sendFile(join(__dirname, "app", "index.html"));
});

// API route to fetch user data from Supabase
app.get("/api/users", async (req, res) => {
    try {
        const { data, error } = await supabase.from("users").select("*");
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Handle socket connections
io.on("connection", (socket) => {
    console.log(`Someone connected to socket server and socket id is ${socket.id}`);
    
    socket.on("join-user", (username) => {
        console.log(`${username} joined socket connection`);
        allusers[username] = { username, id: socket.id };
        io.emit("joined", allusers);
    });

    socket.on("offer", ({ from, to, offer }) => {
        console.log({ from, to, offer });
        io.to(allusers[to].id).emit("offer", { from, to, offer });
    });

    socket.on("answer", ({ from, to, answer }) => {
        io.to(allusers[from].id).emit("answer", { from, to, answer });
    });

    socket.on("end-call", ({ from, to }) => {
        io.to(allusers[to].id).emit("end-call", { from, to });
    });

    socket.on("call-ended", (caller) => {
        const [from, to] = caller;
        io.to(allusers[from].id).emit("call-ended", caller);
        io.to(allusers[to].id).emit("call-ended", caller);
    });

    socket.on("icecandidate", (candidate) => {
        console.log({ candidate });
        socket.broadcast.emit("icecandidate", candidate);
    });
});

// Use dynamic port (for Render deployment)
const PORT = process.env.PORT || 9000;

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
