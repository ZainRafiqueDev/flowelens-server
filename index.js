/**
 * index.js - FlowerLens AI Express server.
 *
 * Stores prediction history in MongoDB Atlas and serves it back to the
 * React frontend. The FastAPI backend (main.py) does NOT talk to Mongo
 * directly - the frontend calls this server after every /predict call.
 */

require("dotenv").config();
const dns = require("dns");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const Prediction = require("./models/Prediction");

// Some local networks/VPNs/security tools redirect the OS DNS resolver to
// 127.0.0.1 in a way that Windows' nslookup respects but Node's own c-ares
// resolver doesn't (raw UDP queries get ECONNREFUSED). MongoDB Atlas's
// mongodb+srv:// scheme depends on a DNS SRV lookup, so without this,
// mongoose.connect() fails immediately with "querySrv ECONNREFUSED" even
// though the username/password/cluster are all correct. Pointing Node at a
// public resolver directly sidesteps whatever is intercepting 127.0.0.1.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err.message));

// POST /api/predictions - save a prediction
app.post("/api/predictions", async (req, res) => {
  try {
    const { flower_name, class_id, confidence, is_confident, image_name, top5 } = req.body;

    if (!flower_name) {
      return res.status(400).json({ error: "flower_name is required" });
    }

    const prediction = await Prediction.create({
      flower_name,
      class_id,
      confidence,
      is_confident,
      image_name,
      top5,
    });

    res.status(201).json(prediction);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save prediction" });
  }
});

// GET /api/predictions - last 10 predictions, newest first
app.get("/api/predictions", async (req, res) => {
  try {
    const predictions = await Prediction.find().sort({ createdAt: -1 }).limit(10);
    res.json(predictions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch predictions" });
  }
});

// GET /api/stats - total count + top 3 most predicted flowers
app.get("/api/stats", async (req, res) => {
  try {
    const total = await Prediction.countDocuments();

    const topFlowersAgg = await Prediction.aggregate([
      { $group: { _id: "$flower_name", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 3 },
    ]);

    const top_flowers = topFlowersAgg.map((f) => ({ name: f._id, count: f.count }));

    res.json({ total, top_flowers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.listen(PORT, () => {
  console.log(`FlowerLens Express server running on port ${PORT}`);
});
