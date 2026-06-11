const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;
const PORT = process.env.PORT || 5000;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const getIdFilter = (id) => {
  return (ObjectId.isValid(id) && id.length === 24)
    ? { _id: new ObjectId(id) }
    : { _id: id };
};

let roomCollection;
let bookingsCollection;

// Connect to MongoDB once
client.connect().then(() => {
  const db = client.db("studynook");
  roomCollection = db.collection("rooms");
  bookingsCollection = db.collection("bookings");
  console.log("Connected to MongoDB!");
}).catch(console.error);

// ========== ROOMS ==========

app.post('/rooms', async (req, res) => {
  try {
    const room = req.body;
    const result = await roomCollection.insertOne(room);
    res.json(result);
  } catch (err) {
    res.status(500).send({ message: "Failed to add room" });
  }
});

app.get("/rooms", async (req, res) => {
  try {
    const { search, minPrice, maxPrice, ownerId } = req.query;
    const query = {};

    if (search) query.roomName = { $regex: search, $options: "i" };
    if (minPrice || maxPrice) {
      query.hourlyRate = {};
      if (minPrice) query.hourlyRate.$gte = Number(minPrice);
      if (maxPrice) query.hourlyRate.$lte = Number(maxPrice);
    }
    if (ownerId) query.ownerId = ownerId;

    const rooms = await roomCollection.find(query).toArray();
    res.json(rooms);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch rooms" });
  }
});

app.get("/rooms/latest", async (req, res) => {
  try {
    const rooms = await roomCollection
      .find({})
      .sort({ _id: -1 })
      .limit(6)
      .toArray();
    res.send(rooms);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch rooms" });
  }
});

app.get("/rooms/:id", async (req, res) => {
  try {
    const id = req.params.id;
    let room = null;

    if (ObjectId.isValid(id) && id.length === 24) {
      room = await roomCollection.findOne({ _id: new ObjectId(id) });
    }

    if (!room) {
      room = await roomCollection.findOne({ _id: id });
    }

    if (!room) return res.status(404).send({ message: "Room not found" });
    res.send(room);
  } catch (err) {
    res.status(500).send({ message: "Invalid room ID" });
  }
});

app.put("/rooms/:id", async (req, res) => {
  try {
    const result = await roomCollection.updateOne(
      getIdFilter(req.params.id),
      { $set: req.body }
    );
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Failed to update room" });
  }
});

app.delete("/rooms/:id", async (req, res) => {
  try {
    const result = await roomCollection.deleteOne(getIdFilter(req.params.id));
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Failed to delete room" });
  }
});

// ========== BOOKINGS ==========

app.post("/bookings", async (req, res) => {
  try {
    const booking = req.body;

    const exists = await bookingsCollection.findOne({
      roomId: booking.roomId,
      date: booking.date,
      status: "confirmed",
      $or: [
        {
          startTime: { $lt: booking.endTime },
          endTime: { $gt: booking.startTime },
        },
      ],
    });

    if (exists) {
      return res.status(400).send({ message: "Time slot already booked" });
    }

    booking.status = "confirmed";
    booking.createdAt = new Date();

    const result = await bookingsCollection.insertOne(booking);

    await roomCollection.updateOne(
      getIdFilter(booking.roomId),
      { $inc: { bookingCount: 1 } }
    );

    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Failed to create booking" });
  }
});

app.get("/bookings", async (req, res) => {
  try {
    const email = req.query.email;
    const query = email ? { userEmail: email } : {};
    const bookings = await bookingsCollection.find(query).toArray();
    res.send(bookings);
  } catch (err) {
    res.status(500).send({ message: "Failed to fetch bookings" });
  }
});

app.get("/bookings/:id", async (req, res) => {
  try {
    const booking = await bookingsCollection.findOne(getIdFilter(req.params.id));
    if (!booking) return res.status(404).send({ message: "Booking not found" });
    res.send(booking);
  } catch (err) {
    res.status(500).send({ message: "Invalid booking ID" });
  }
});

app.patch("/bookings/:id/cancel", async (req, res) => {
  try {
    const { userEmail } = req.body;
    const booking = await bookingsCollection.findOne(getIdFilter(req.params.id));

    if (!booking) {
      return res.status(404).send({ message: "Booking not found" });
    }

    if (booking.userEmail !== userEmail) {
      return res.status(403).send({ message: "Unauthorized" });
    }

    await bookingsCollection.updateOne(
      getIdFilter(req.params.id),
      { $set: { status: "cancelled" } }
    );

    await roomCollection.updateOne(
      getIdFilter(booking.roomId),
      { $inc: { bookingCount: -1 } }
    );

    res.send({ message: "Booking cancelled successfully" });
  } catch (err) {
    res.status(500).send({ message: "Failed to cancel booking" });
  }
});

app.delete("/bookings/:id", async (req, res) => {
  try {
    const result = await bookingsCollection.deleteOne(getIdFilter(req.params.id));
    res.send(result);
  } catch (err) {
    res.status(500).send({ message: "Failed to delete booking" });
  }
});

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;