const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.port || 5000;

// middleware
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
  })
);

app.get("/", (req, res) => {
  res.send("Welcome to ChatSphere");
});

app.listen(port, () => {
  console.log(`ChatSphere server is  listening on port ${port}`);
});
