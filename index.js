const express = require("express");
const cors = require("cors");
var admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 3000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

// middle ware
app.use(express.json());
app.use(cors());
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// service account key set up
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8",
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// verfify user
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log("decoded in the token", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xyz4gji.mongodb.net/?appName=Cluster0`;

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
    // await client.connect();

    const db = client.db("Freelance-db");
    const jobsCollection = db.collection("jobs");
    const userCollection = db.collection("users");
    const applysCollection = db.collection("applys");
    const paymentCollection = db.collection("payments");
    const wishlistsCollection = db.collection("wishlists");
    const gigsCollection = db.collection("gigs");
    const BecomefreelancerApplications = db.collection(
      "BecomefreelancerApplications",
    );

    // middle ware for admin verify
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await userCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // middle ware for librian
    const verifyLibrian = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await userCollection.findOne(query);
      if (!user || user.role !== "freelancer") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // user releted api
    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};

      if (searchText) {
        // query.displayName = {$regex: searchText, $options: 'i'}

        query.$or = [
          { displayName: { $regex: searchText, $options: "i" } },
          { email: { $regex: searchText, $options: "i" } },
        ];
      }

      const cursor = userCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(5);
      const result = await cursor.toArray();
      res.send(result);
    });

    // save user in database
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();
      const email = user.email;
      const userExists = await userCollection.findOne({ email });

      if (userExists) {
        return res.send({ message: "user exists" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // get user role
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });

    // Update user profile by email
    app.patch("/users/profile/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const { displayName, photoURL } = req.body;
        console.log(displayName, photoURL);

        const updatedDoc = {
          $set: {},
        };
        if (displayName) updatedDoc.$set.displayName = displayName;
        if (photoURL) updatedDoc.$set.photoURL = photoURL;
        console.log(updatedDoc);

        const result = await userCollection.updateOne(
          { email: email },
          updatedDoc,
        );

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update profile", error });
      }
    });

    // update user role
    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,

      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await userCollection.updateOne(query, updatedDoc);
        res.send(result);
      },
    );
    // admin update book status
    app.patch(
      "/admin/books/status/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { status } = req.body;

        const result = await jobsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: status } },
        );

        res.send(result);
      },
    );

    // delete book by admin (also delete related orders)
    app.delete(
      "/admin/books/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;

          //  Check book exists
          const book = await jobsCollection.findOne({
            _id: new ObjectId(id),
          });

          if (!book) {
            return res.status(404).send({ error: "Book not found" });
          }

          //  Delete all orders of this book
          const orderDeleteResult = await ordersCollection.deleteMany({
            bookId: id,
          });

          const bookDeleteResult = await booksCollection.deleteOne({
            _id: new ObjectId(id),
          });

          res.send({
            success: true,
            message: "Book and related orders deleted successfully",
            deletedBook: bookDeleteResult.deletedCount,
            deletedOrders: orderDeleteResult.deletedCount,
          });
        } catch (error) {
          console.error(error);
          res.status(500).send({
            error: "Failed to delete book",
          });
        }
      },
    );

    // book related api add book by librian
    app.post("/jobs", verifyFBToken, async (req, res) => {
      const jobData = req.body;
      jobData.createdAt = new Date();

      const result = await jobsCollection.insertOne(jobData);
      res.send(result);
    });

    // get particular book infomation
    app.get("/jobs/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });

    // update particular book by librian
    // Update particular job by freelancer
    app.patch(
      "/update-job/:id",
      verifyFBToken,
      verifyLibrian, // or freelancer if you want only poster access
      async (req, res) => {
        try {
          const id = req.params.id;
          const updatedJob = req.body;

          const query = { _id: new ObjectId(id) };
          const updatedDoc = {
            $set: {
              jobTitle: updatedJob.jobTitle,
              skills: updatedJob.skills,
              budget: updatedJob.budget,
              description: updatedJob.description,
              image: updatedJob.image, // optional
              status: updatedJob.status, // allow updating status if needed
            },
          };

          const result = await jobsCollection.updateOne(query, updatedDoc);

          if (result.matchedCount === 0) {
            return res.status(404).send({ message: "Job not found" });
          }

          res.send({ success: true, modifiedCount: result.modifiedCount });
        } catch (error) {
          console.error(error);
          res.status(500).send({ error: "Failed to update job" });
        }
      },
    );

    // Get all jobs with search and sort
    app.get("/jobs", async (req, res) => {
      const { status, search, sort } = req.query;

      let query = {};
      if (status) query.status = status; // open / closed

      if (search) {
        query.jobTitle = { $regex: search, $options: "i" }; // search by job title
      }

      let sortQuery = {};
      if (sort === "asc") sortQuery.budget = 1;
      if (sort === "desc") sortQuery.budget = -1;

      try {
        const jobs = await jobsCollection.find(query).sort(sortQuery).toArray();
        res.send(jobs);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch jobs" });
      }
    });

    // // get latest books
    // app.get("/jobs/latest", verifyFBToken, async (req, res) => {
    //   const result = await jobsCollection
    //     .find({ status: "open" })
    //     .sort({ createdAt: -1 })
    //     .limit(4)
    //     .toArray();

    //   res.send(result);
    // });

    // get my book librian
    app.get(
      "/my-jobs/:email",
      verifyFBToken,

      async (req, res) => {
        const email = req.params.email;
        console.log(email);
        const query = { posterEmail: email };
        const result = await jobsCollection.find(query).toArray();
        res.send(result);
      },
    );

    // update job status librian
    app.patch(
      "/update-job-status/:id",
      verifyFBToken,

      async (req, res) => {
        const id = req.params.id;
        const { status } = req.body;

        const result = await jobsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: status } },
        );

        res.send(result);
      },
    );

    // order related api
    // order post by user
    app.post(
      "/job-applications",
      verifyFBToken,
      verifyLibrian,
      async (req, res) => {
        const order = req.body;
        const result = await applysCollection.insertOne(order);
        res.send(result);
      },
    );

    // usr order
    app.get("/application/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { freelancerEmail: email };
      const result = await applysCollection.find(query).toArray();
      res.send(result);
    });

    // order cancel by user
    app.patch("/orders/cancel/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;

      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            orderStatus: "cancelled",
          },
        },
      );

      res.send(result);
    });

    // librian order
    app.get(
      "/user/applycation/:email",
      verifyFBToken,

      async (req, res) => {
        const email = req.params.email;
        const query = { posterEmail: email };
        const result = await applysCollection.find(query).toArray();
        res.send(result);
      },
    );

    // librian update order status
    app.patch(
      "/application/update-status/:id",
      verifyFBToken,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { status } = req.body;

          // allowed application status
          const allowedStatus = ["pending", "approved", "rejected", "hired"];

          if (!allowedStatus.includes(status)) {
            return res.status(400).send({ error: "Invalid status" });
          }

          const application = await applysCollection.findOne({
            _id: new ObjectId(id),
          });

          if (!application) {
            return res.status(404).send({ error: "Application not found" });
          }

          // once hired or rejected, status cannot be changed
          if (
            application.applicationStatus === "hired" ||
            application.applicationStatus === "rejected"
          ) {
            return res.status(400).send({
              error: "This application status can no longer be changed",
            });
          }

          const result = await applysCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                applicationStatus: status,
                updatedAt: new Date(),
              },
            },
          );

          res.send({ success: true, result });
        } catch (error) {
          console.error(error);
          res.status(500).send({
            error: "Application status update failed",
          });
        }
      },
    );

    // // create checkout session
    // app.post("/payment-checkout-session", async (req, res) => {
    //   const paymentInfo = req.body;
    //   const amount = parseInt(paymentInfo.price) * 100;
    //   const session = await stripe.checkout.sessions.create({
    //     line_items: [
    //       {
    //         price_data: {
    //           currency: "usd",
    //           unit_amount: amount,
    //           product_data: {
    //             name: `Please pay for: ${paymentInfo.bookName}`,
    //           },
    //         },
    //         quantity: 1,
    //       },
    //     ],
    //     mode: "payment",
    //     metadata: {
    //       orderId: paymentInfo.orderId,
    //       bookId: paymentInfo.bookId,
    //       bookName: paymentInfo.bookName,
    //       librarianEmail: paymentInfo.librarianEmail,
    //     },
    //     customer_email: paymentInfo.customerEmail,
    //     success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    //     cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
    //   });
    //   res.send({ url: session.url });
    // });

    // create checkout session for hired freelancer
    app.post("/payment-checkout-session", async (req, res) => {
      try {
        const paymentInfo = req.body;
        const amount = parseInt(paymentInfo.budget) * 100; // convert to cents

        // create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "usd", // change if needed
                unit_amount: amount,
                product_data: {
                  name: `Payment for: ${paymentInfo.jobTitle}`,
                },
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          metadata: {
            applicationId: paymentInfo.applicationId,
            freelancerEmail: paymentInfo.freelancerEmail,
            jobTitle: paymentInfo.jobTitle,
          },
          customer_email: paymentInfo.freelancerEmail, // or client email if client pays
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe session creation failed:", error);
        res.status(500).send({ error: "Failed to create payment session" });
      }
    });

    // // // payemtnt succces
    // app.patch("/payment-success", async (req, res) => {
    //   try {
    //     const sessionId = req.query.session_id;

    //     const session = await stripe.checkout.sessions.retrieve(sessionId);
    //     console.log(session);

    //     if (session.payment_status !== "paid") {
    //       return res.status(400).send({ success: false });
    //     }

    //     const transactionId = session.payment_intent;
    //     const orderId = session.metadata.orderId;

    //     const existingPayment = await paymentCollection.findOne({
    //       transactionId,
    //     });

    //     if (existingPayment) {
    //       return res.send({
    //         message: "Payment already recorded",
    //         transactionId,
    //       });
    //     }

    //     await applysCollectionCollection.updateOne(
    //       { _id: new ObjectId(orderId) },
    //       {
    //         $set: {
    //           paymentStatus: "paid",
    //           orderStatus: "pending",
    //           transactionId,
    //         },
    //       },
    //     );

    //     const payment = {
    //       orderId: new ObjectId(orderId),
    //       bookId: session.metadata.bookId,
    //       bookName: session.metadata.bookName,
    //       librarianEmail: session.metadata.librarianEmail,
    //       customerEmail: session.customer_email,
    //       amount: session.amount_total / 100,
    //       currency: session.currency,
    //       transactionId,
    //       paymentStatus: session.payment_status,
    //       paidAt: new Date(),
    //     };

    //     const result = await paymentCollection.insertOne(payment);

    //     res.send({
    //       success: true,
    //       transactionId,
    //       paymentId: result.insertedId,
    //     });
    //   } catch (error) {
    //     console.error(error);
    //     res.status(500).send({ error: "Payment success handling failed" });
    //   }
    // });
    // Payment success for job hire
    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        console.log("Stripe session:", session);

        if (session.payment_status !== "paid") {
          return res
            .status(400)
            .send({ success: false, message: "Payment not completed" });
        }

        const transactionId = session.payment_intent;
        const applicationId = session.metadata.applicationId;

        // Check if payment already recorded
        const existingPayment = await paymentCollection.findOne({
          transactionId,
        });

        if (existingPayment) {
          return res.send({
            message: "Payment already recorded",
            transactionId,
          });
        }

        // Update application status to 'hired' and mark payment as paid
        await applysCollection.updateOne(
          { _id: new ObjectId(applicationId) },
          {
            $set: {
              applicationStatus: "hired",
              paymentStatus: "paid",
              transactionId,
            },
          },
        );

        // Save payment details in payment collection
        const payment = {
          applicationId: new ObjectId(applicationId),
          jobTitle: session.metadata.jobTitle,
          freelancerEmail: session.metadata.freelancerEmail,
          clientEmail: session.customer_email, // who paid
          amount: session.amount_total / 100, // convert cents to currency
          currency: session.currency,
          transactionId,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
        };

        const result = await paymentCollection.insertOne(payment);

        res.send({
          success: true,
          transactionId,
          paymentId: result.insertedId,
        });
      } catch (error) {
        console.error("Payment success handling failed:", error);
        res.status(500).send({ error: "Payment success handling failed" });
      }
    });

    // for invoices
    app.get("/payments/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { freelancerEmail: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    //  -----------------------wish list ------

    // Add job to wishlist
    app.post("/wishlist", verifyFBToken, async (req, res) => {
      try {
        const { userEmail, jobId, jobTitle, posterEmail, salary } = req.body;

        // Validate required fields
        if (!userEmail || !jobId) {
          return res.status(400).send({ error: "Missing required fields" });
        }

        // Check if job is already in wishlist
        const existing = await wishlistsCollection.findOne({
          userEmail,
          jobId,
        });

        if (existing) {
          return res.status(400).send({ error: "Job already in wishlist" });
        }

        // Insert job into wishlist
        const result = await wishlistsCollection.insertOne({
          userEmail,
          jobId,
          jobTitle,
          posterEmail,
          salary,
          addedAt: new Date(),
        });

        res.send({ success: true, result });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to add job to wishlist" });
      }
    });

    // user wishlist get
    app.get("/wishlist/:userEmail", verifyFBToken, async (req, res) => {
      try {
        const userEmail = req.params.userEmail;
        const wishlist = await wishlistsCollection
          .find({ userEmail })
          .sort({ addedAt: -1 })
          .toArray();

        res.send(wishlist);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch wishlist" });
      }
    });

    //  delet fro wishlist
    app.delete(
      "/wishlist/:userEmail/:jobId",
      verifyFBToken,
      async (req, res) => {
        try {
          const { userEmail, jobId } = req.params;

          const result = await wishlistsCollection.deleteOne({
            userEmail,
            jobId,
          });

          if (result.deletedCount === 0) {
            return res.status(404).send({ error: "Job not found in wishlist" });
          }

          res.send({ success: true, result });
        } catch (error) {
          console.error(error);
          res.status(500).send({ error: "Failed to remove from wishlist" });
        }
      },
    );

    // book stats
    app.get("/books-stats", async (req, res) => {
      try {
        const totalJobs = await jobsCollection.countDocuments();

        const openJobs = await jobsCollection.countDocuments({
          status: "open",
        });

        const closedJobs = await jobsCollection.countDocuments({
          status: "closed",
        });

        res.send([
          { name: "Total Jobs", count: totalJobs },
          { name: "Open jobs", count: openJobs },
          { name: "Closed Jobs", count: closedJobs },
        ]);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch book stats" });
      }
    });

    // order statistics
    app.get("/order-status-stats", verifyFBToken, async (req, res) => {
      try {
        const pending = await ordersCollection.countDocuments({
          orderStatus: "pending",
        });

        const shipped = await ordersCollection.countDocuments({
          orderStatus: "shipped",
        });

        const delivered = await ordersCollection.countDocuments({
          orderStatus: "delivered",
        });

        const cancelled = await ordersCollection.countDocuments({
          orderStatus: "cancelled",
        });

        res.send([
          { status: "pending", count: pending },
          { status: "shipped", count: shipped },
          { status: "delivered", count: delivered },
          { status: "cancelled", count: cancelled },
        ]);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch order status stats" });
      }
    });

    // review by user after order

    app.post("/jobs/:id/review", verifyFBToken, async (req, res) => {
      try {
        const bookId = req.params.id;
        const { userEmail, name, rating, message, avatar } = req.body;

        // check if user ordered this book
        const ordered = await ordersCollection.findOne({
          bookId,
          customerEmail: userEmail,
          orderStatus: { $ne: "cancelled" },
        });

        if (!ordered) {
          return res
            .status(403)
            .send({ error: "You must order this book to review" });
        }

        const review = {
          userEmail,
          name,
          rating: Number(rating),
          message,
          avatar,
          date: new Date(),
        };

        const result = await booksCollection.updateOne(
          { _id: new ObjectId(bookId) },
          {
            $push: { reviews: review },
            $inc: { reviewCount: 1 },
          },
        );

        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ error: "Failed to add review" });
      }
    });

    app.get(
      "/admin/freelancer-applications",
      verifyFBToken,
      async (req, res) => {
        const result = await BecomefreelancerApplications.find()
          .sort({ appliedAt: -1 })
          .toArray();

        res.send(result);
      },
    );

    // freelacer apply
    app.post("/freelancer/apply", verifyFBToken, async (req, res) => {
      try {
        const { name, email, nidNumber } = req.body;

        if (!nidNumber) {
          return res.status(400).send({ message: "NID is required" });
        }

        // already applied check
        const alreadyApplied = await BecomefreelancerApplications.findOne({
          email,
        });
        if (alreadyApplied) {
          return res.send({
            success: false,
            message: "You already applied for freelancer",
          });
        }

        const applicationData = {
          name,
          email,
          nidNumber,
          roleRequested: "freelancer",
          status: "pending", // pending | approved | rejected
          appliedAt: new Date(),
        };

        const result =
          await BecomefreelancerApplications.insertOne(applicationData);

        res.send({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to apply" });
      }
    });

    app.patch(
      "/admin/freelancer-applications/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { status } = req.body;

          if (!["approved", "rejected"].includes(status)) {
            return res.status(400).send({ message: "Invalid status" });
          }

          // 1️⃣ Find application
          const application = await BecomefreelancerApplications.findOne({
            _id: new ObjectId(id),
          });

          if (!application) {
            return res.status(404).send({ message: "Application not found" });
          }

          // 2️⃣ Update application status
          await BecomefreelancerApplications.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                status,
                reviewedAt: new Date(),
              },
            },
          );

          // 3️⃣ If approved → update user role
          if (status === "approved") {
            await userCollection.updateOne(
              { email: application.email },
              {
                $set: {
                  role: "freelancer",
                  freelancerApprovedAt: new Date(),
                },
              },
            );
          }

          res.send({
            success: true,
            message:
              status === "approved"
                ? "Application approved & user promoted to freelancer"
                : "Application rejected",
          });
        } catch (error) {
          console.error(error);
          res.status(500).send({ message: "Failed to update application" });
        }
      },
    );

    // gigs
    app.post("/gigs", verifyFBToken, async (req, res) => {
      try {
        const gig = req.body;

        const newGig = {
          ...gig,
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await gigsCollection.insertOne(newGig);

        res.send({
          success: true,
          message: "Gig posted successfully",
          gigId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to post gig" });
      }
    });

    app.get("/gigs", async (req, res) => {
      const result = await gigsCollection
        .find({ status: "active" })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });
    // get gigs by freelancer email
    app.get("/gigs/my", verifyFBToken, async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res.status(400).send({ error: "Email is required" });
        }

        const result = await gigsCollection
          .find({ freelancerEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch gigs" });
      }
    });

    app.delete(
      "/gigs/:id",
      verifyFBToken,

      async (req, res) => {
        const id = req.params.id;

        const result = await gigsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      },
    );

    app.patch(
      "/gigs/:id",
      verifyFBToken,

      async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;

        const result = await gigsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              ...updatedData,
              updatedAt: new Date(),
            },
          },
        );

        res.send(result);
      },
    );

    // // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
