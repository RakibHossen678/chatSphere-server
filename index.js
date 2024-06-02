const express = require("express");
const app = express();
require("dotenv").config();
const cookieParser = require("cookie-parser");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.port || 5000;

// middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
    optionSuccessStatus: 200,
  })
);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vrdje6l.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log(token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    const postCollection = client.db("chatSphere").collection("posts");
    const commentsCollection = client.db("chatSphere").collection("comments");
    const usersCollection = client.db("chatSphere").collection("users");

    //jwt generate
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRETE, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    //clear token on logout
    app.get("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          maxAge: 0,
        })
        .send({ success: true });
    });

    //get all post sort by date
    app.get("/posts", async (req, res) => {
      const posts = await postCollection.find().sort({ time: -1 }).toArray();
      const postsWithComments = await Promise.all(
        posts.map(async (post) => {
          const commentsCount = await commentsCollection.countDocuments({
            postTitle: post.title,
          });
          return { ...post, commentsCount };
        })
      );
      res.send(postsWithComments);
    });

    //get post by id

    app.get("/post/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await postCollection.findOne(query);
      res.send(result);
    });

    //save comment in the database
    app.post("/comment", verifyToken, async (req, res) => {
      const comment = req.body;
      const result = await commentsCollection.insertOne(comment);
      res.send(result);
    });

    //upvote
    app.patch("/post/upVote/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const getVote = await postCollection.findOne(
        {},
        {
          projection: {
            downVote: 1,
          },
        }
      );
      let updateDoc;

      if (getVote.downVote >= 1) {
        updateDoc = {
          $inc: { upVote: 1, downVote: -1 },
        };
      } else {
        updateDoc = {
          $inc: { upVote: 1 },
        };
      }
      const result = await postCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.patch("/post/downVote/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const getVote = await postCollection.findOne(
        {},
        {
          projection: {
            upVote: 1,
          },
        }
      );
      let updateDoc;
      if (getVote.upVote >= 1) {
        updateDoc = {
          $inc: { downVote: 1, upVote: -1 },
        };
      } else {
        updateDoc = {
          $inc: { downVote: 1 },
        };
      }
      const result = await postCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    //save user in database
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const isExists = await usersCollection.findOne(query);
      if (isExists) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    //get comment by title
    // app.get("/comment/:title", async (req, res) => {
    //   const title = req.params.title;
    //   const query = { postTitle: title };
    //   const result = await commentsCollection.find(query).toArray();
    //   res.send(result);
    // });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to ChatSphere");
});

app.listen(port, () => {
  console.log(`ChatSphere server is  listening on port ${port}`);
});
