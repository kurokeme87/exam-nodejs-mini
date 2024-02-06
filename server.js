// server.js
const express = require("express");
const sqlite3 = require("sqlite3");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;
// Set EJS as the view engine
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

app.use(bodyParser.json());
app.use(
  cors({
    origin: ["http://localhost:3010"], // Add your frontend URL
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);

// Use a persistent SQLite database instead of in-memory
const db = new sqlite3.Database("your-database-file.db", (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the SQLite database.");
    // Create the users table if it does not exist
    db.run(
      "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, password TEXT, approved BOOLEAN DEFAULT 0)"
    );
  }
});
app.get("/admin/dashboard", (req, res) => {
  // Fetch the list of users from the database
  db.all("SELECT * FROM users", (err, users) => {
    if (err) {
      return res.status(500).json({ error: "Internal server error" });
    }

    // Render the admin dashboard page
    res.render("adminDashboard", { users });
  });
});

app.post("/admin/approve/:userId", (req, res) => {
  const userId = req.params.userId;

  // Update the user's 'approved' status in the database
  db.run(
    "UPDATE users SET approved = 1 WHERE id = ?",
    [userId],
    function (err) {
      console.log(err);
      if (err) {
        console.log(err);

        return res.status(500).json({ error: "Internal server error" });
      }

      // Redirect back to the admin dashboard
      res.redirect("/admin/dashboard");
    }
  );
});
app.post("/api/auth", (req, res) => {
  const { email, password } = req.body;

  // Check if the user already exists
  db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Internal server error" });
    }

    if (row) {
      // User exists, check if approved
      if (row.approved) {
        // User is approved, perform login
        db.get(
          "SELECT id, email FROM users WHERE email = ? AND password = ?",
          [email, password],
          (loginErr, loginRow) => {
            if (loginErr) {
              return res.status(500).json({ error: "Internal server error" });
            }

            if (!loginRow) {
              return res.status(401).json({ error: "Invalid credentials" });
            }

            return res.status(200).json({
              message: "Login successful",
              user: { id: loginRow.id, email: loginRow.email },
            });
          }
        );
      } else {
        // User is not approved
        return res.status(401).json({ error: "User not approved" });
      }
    } else {
      // User doesn't exist, perform registration
      db.run(
        "INSERT INTO users (email, password) VALUES (?, ?)",
        [email, password],
        function (registerErr) {
          if (registerErr) {
            return res.status(500).json({ error: "Failed to register user" });
          }

          const userId = this.lastID; // Get the last inserted row ID

          return res.status(200).json({
            message: "User registered successfully click again to login",
            user: { id: userId, email },
          });
        }
      );
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
