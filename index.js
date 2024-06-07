const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
// const nodemailer = require("nodemailer");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.VITE_STRIPE_SECRET_KEY);
const port = process.env.port || 5000;

// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    const postCollection = client.db("chatSphere").collection("posts");
    const commentsCollection = client.db("chatSphere").collection("comments");
    const usersCollection = client.db("chatSphere").collection("users");
    const CategoriesCollection = client
      .db("chatSphere")
      .collection("Categories");
    const announcementsCollection = client
      .db("chatSphere")
      .collection("announcements");
    const paymentsCollection = client.db("chatSphere").collection("payments");
    const reportsCollection = client.db("chatSphere").collection("reports");
    const searchTextCollection = client
      .db("chatSphere")
      .collection("searchText");

    //jwt generate
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
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

    //send email
    // const sendEMail = (emailAddress, emailData) => {
    //   const transporter = nodemailer.createTransport({
    //     service: "",
    //     host: "smtp.gmail.email",
    //     port: 587,
    //     secure: false,
    //     auth: {
    //       user: process.env.TRANSPORTER_EMAIL,
    //       pass: process.env.TRANSPORTER_PASS,
    //     },
    //   });
    //   // verify connection configuration
    //   transporter.verify(function (error, success) {
    //     if (error) {
    //       console.log(error);
    //     } else {
    //       console.log("Server is ready to take our messages");
    //     }
    //   });
    //   const mailBody = {
    //     from: `"ChatSphere" <${process.env.TRANSPORTER_EMAIL}>`,
    //     to: emailAddress,
    //     subject: emailData.subject,
    //     html: emailData.message,
    //   };
    //   transporter.sendMail(mailBody, (error, info) => {
    //     if (error) {
    //       console.log(error);
    //     } else {
    //       console.log(info.response);
    //     }
    //   });
    // };
    //save post in database
    app.post("/post", verifyToken, async (req, res) => {
      const postData = req.body;
      const result = await postCollection.insertOne(postData);
      res.send(result);
    });

    app.get("/badge/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const postQuery = { "author.email": email };
      console.log(email);
      const badge = await usersCollection.findOne(query, {
        projection: {
          badge: 1,
          _id: 0,
        },
      });
      const postCount = await postCollection.countDocuments(postQuery);
      res.send({ badge, postCount });
    });

    //get all post sort by date
    app.get("/posts", async (req, res) => {
      const size = parseFloat(req.query.size) || 5;
      const page = parseFloat(req.query.page) - 1;
      const searchText = req.query.search || "";
      const sortValue = req.query.sort || "";

      let query = {};
      if (searchText && searchText !== "null") {
        query = {
          tag: { $regex: searchText, $options: "i" },
        };
      }

      if (sortValue && sortValue !== "null") {
        const posts = await postCollection
          .aggregate([
            { $match: query },
            {
              $addFields: {
                voteDifference: { $subtract: ["$upVote", "$downVote"] },
              },
            },
            {
              $sort: { voteDifference: -1 },
            },
            { $skip: page * size },
            { $limit: size },
          ])
          .toArray();
        const postsWithComments = await Promise.all(
          posts.map(async (post) => {
            const commentsCount = await commentsCollection.countDocuments({
              postTitle: post.title,
            });
            return { ...post, commentsCount };
          })
        );

        res.send(postsWithComments);
      } else {
        const posts = await postCollection
          .find(query)
          .skip(page * size)
          .limit(size)
          .sort({ time: -1 })
          .toArray();

        const postsWithComments = await Promise.all(
          posts.map(async (post) => {
            const commentsCount = await commentsCollection.countDocuments({
              postTitle: post.title,
            });
            return { ...post, commentsCount };
          })
        );

        res.send(postsWithComments);
      }
    });

    //get post count
    app.get("/postsCount", async (req, res) => {
      const search = req.query.search || "";
      const query = {
        tag: { $regex: search, $options: "i" },
      };

      const count = await postCollection.countDocuments(query);
      res.send({ count });
    });

    //get post by id

    app.get("/post/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      // console.log(query)
      // return
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
      const getVote = await postCollection.findOne(query, {
        projection: {
          downVote: 1,
          upVote: 1,
        },
      });
      let updateDoc;
      if (getVote.downVote > 0) {
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
      const getVote = await postCollection.findOne(query, {
        projection: {
          upVote: 1,
          downVote: 1,
        },
      });
      let updateDoc;
      if (getVote.upVote > 0) {
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
      console.log(req.body);
      const isExists = await usersCollection.findOne(query);
      if (isExists) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    //get user
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email: email });
      res.send(result);
    });

    //get post by email
    app.get("/posts/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "author.email": email };
      const posts = await postCollection
        .find(query)
        .sort({ time: -1 })
        .toArray();
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

    //delete post by id

    app.delete("/post/delete/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await postCollection.deleteOne(query);
      res.send(result);
    });
    //get comment by title
    app.get("/comment/:title", async (req, res) => {
      const title = req.params.title;
      const query = { postTitle: title };
      const result = await commentsCollection.find(query).toArray();
      res.send(result);
    });

    //get a user
    app.get("/users", async (req, res) => {
      const size = parseFloat(req.query.size);
      const page = parseFloat(req.query.page) - 1;
      const search = req.query.search || "";

      console.log(search);

      const query = {
        name: { $regex: search, $options: "i" },
      };
      console.log(query);
      console.log(query);
      const result = await usersCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });
    //change role
    app.patch("/user/role/:id", async (req, res) => {
      const id = req.params.id;
      const role = req.body.role;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: role,
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //save announcement in db

    app.post("/announcement", async (req, res) => {
      const announcementData = req.body;
      const result = await announcementsCollection.insertOne(announcementData);
      res.send(result);
    });

    //get announcement

    app.get("/announcement", async (req, res) => {
      const result = await announcementsCollection.find().toArray();
      res.send(result);
    });

    //payment
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;

      if (!price || priceInCent < 1) return;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",

        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.send({ clientSecret: client_secret });
    });

    //save payment
    app.post("/payment", verifyToken, async (req, res) => {
      const paymentData = req.body;
      const result = await paymentsCollection.insertOne(paymentData);
      //change user badge
      const email = paymentData.email;
      const query = { email: email };
      const updateDoc = {
        $set: { badge: "gold" },
      };
      const updatedRoom = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //get data count
    app.get("/usersCount", async (req, res) => {
      const search = req.query.search || "";

      console.log(search);

      const query = {
        name: { $regex: search, $options: "i" },
      };

      const count = await usersCollection.countDocuments(query);
      res.send({ count });
    });

    //get admin data
    app.get("/admin-stats", async (req, res) => {
      const totalUsers = await usersCollection.countDocuments();
      const totalPosts = await postCollection.countDocuments();
      const totalComments = await commentsCollection.countDocuments();
      const payments = await paymentsCollection.countDocuments();
      res.send({ totalUsers, totalPosts, totalComments, payments });
    });

    //save tag in db
    app.post("/tags", async (req, res) => {
      const tag = req.body;
      const result = await CategoriesCollection.insertOne(tag);
      res.send(result);
    });

    //get category
    app.get("/categories", async (req, res) => {
      const result = await CategoriesCollection.find().toArray();
      res.send(result);
    });

    //save report data in bd

    app.post("/reports", async (req, res) => {
      const reportData = req.body;
      const result = await reportsCollection.insertOne(reportData);
      res.send(result);
    });

    //get report
    app.get("/reports", async (req, res) => {
      const result = await reportsCollection.find().toArray();
      res.send(result);
    });

    //delete reported comments
    app.delete("/report/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await commentsCollection.deleteOne(query);
      res.send(result);
    });

    //save Search Word
    app.post("/search", async (req, res) => {
      const searchText = req.body;
      const query = { search: searchText.search };
      const isExists = await searchTextCollection.find(query);
      if (isExists) return;
      const result = await searchTextCollection.insertOne(searchText);
      res.send(result);
    });

    app.get("/search", async (req, res) => {
      const result = await searchTextCollection.find().toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection

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
