// server.js
const express = require("express");
const sqlite3 = require("sqlite3");
const bodyParser = require("body-parser");
const cors = require("cors");
const assert = require('assert');
const { generateRandomHex } = require("./util");


// ===================== RENDER PATH SETUP STARTS HERE ======================

// .trim() is important.
const ENV_VALUE = process.env.PROD?.trim();
assert(ENV_VALUE === 'false' || ENV_VALUE === 'true', "Error . . . 'PROD' environment variable not properly set!.");
const IS_ON_PROD = ENV_VALUE === 'false' ? false : true;

// Setup "Render" persisted disk directory path and path_to_sqlite_db.
const PERSISTENT_DISK_ROOT = "/var/lib/data/";
const PATH_TO_SQLITE_DB = IS_ON_PROD ? `${PERSISTENT_DISK_ROOT}prod-crypto-miner-v2.db` : "crypto-miner.db";
// console.log(PATH_TO_SQLITE_DB);

// ===================== RENDER PATH SETUP ENDS HERE ======================


const app = express();
const PORT = process.env.PORT || 3001;

// Set EJS as the view engine
app.set("view engine", "ejs");
app.set("views", `${__dirname}/views`);



app.use(bodyParser.json());
// app.use(bodyParser.urlencoded());
app.use(
  cors({
    origin: "*", // Add your frontend URL
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);

// Determine the platform-specific extension
// const extension = process.platform === 'win32' ? 'dll' : 'so';


// Use a persistent SQLite database instead of in-memory
const db = new sqlite3.Database(PATH_TO_SQLITE_DB, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the SQLite database.");

    // Enable the JSON1 extension
    // db.run(`SELECT load_extension("libsqlite3_json.${extension}")`);

    // Create the users table if it does not exist
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        approved BOOLEAN DEFAULT 0,
        allow_withdraw BOOLEAN NOT NULL DEFAULT 0,
        mining_info TEXT NOT NULL DEFAULT '{"aumCount":0,"gipCount":0,"longCount":0,"totalVolume":0}',
        api_token TEXT
        )`
    );
  }
});



app.get("/", (req, res) => {
  // Fetch the list of users from the database
  db.all("SELECT * FROM users", (err, users) => {
    if (err) {
      return res.status(500).json({ error: "Internal server error" });
    }

    // Render the admin dashboard page
    res.render("adminDashboard", { users });
  });
});


app.post("/admin/revoke/withdrawal/:userId", (req, res) => {
  const userId = req.params.userId;
  console.log(userId);

  // Update the user's 'withdrawal' status in the database
  db.run(
    "UPDATE users SET allow_withdraw = 0 WHERE id = ?",
    [userId],
    (err) => {
      if (err) {
        console.log("[DB - ERROR]: ", err);

        return res.status(500).json({ error: "Internal server error" });
      }

      // Redirect back to the admin dashboard
      res.redirect("/");
    }
  );
});


app.post("/admin/approve/withdrawal/:userId", (req, res) => {
  const userId = req.params.userId;
  console.log(userId);

  // Update the user's 'withdrawal' status in the database
  db.run(
    "UPDATE users SET allow_withdraw = 1 WHERE id = ?",
    [userId],
    (err) => {
      if (err) {
        console.log("[DB - ERROR]: ", err);

        return res.status(500).json({ error: "Internal server error" });
      }

      // Redirect back to the admin dashboard
      res.redirect("/");
    }
  );
});


app.post("/admin/approve/:userId", (req, res) => {
  const userId = req.params.userId;

  // Update the user's 'approved' status in the database
  db.run(
    "UPDATE users SET approved = 1 WHERE id = ?",
    [userId],
    (err) => {
      if (err) {
        console.log("[DB - ERROR]: ", err);

        return res.status(500).json({ error: "Internal server error" });
      }

      // Redirect back to the admin dashboard
      res.redirect("/");
    }
  );
});



// =============================== USER-FACING API CALLS START HERE =====================================>>

// (Should be GET, but since no AUTHTOKEN setup, let's prevent simple GET request).
// Retrieve user's mining status.
app.post("/api/user/:userEmail/mining", (req, res) => {
  const userEmail = req.params.userEmail;

  // Retrieve mining info for user.
  db.get("SELECT * FROM users WHERE email = ?", [userEmail], (err, row) => {
    if (err) {
      console.log("[DB - ERROR]: ", err);
      return res.status(500).json({ error: "Something Wrong, Try again." });
    }
    console.log("[ROW]: ", row);

    // If user is not yet approved.
    if (parseInt(row.approved) !== 1) {
      return res.status(400).json({
        error: "This User needs Admin approval!"
      });
    }

    const mining_info = JSON.parse(row.mining_info);
    res.status(200).json({
      mining_info,
    });

  })
});



// Update user's mining status.
app.put("/api/user/:userEmail/mining", (req, res) => {
  const userEmail = req.params.userEmail;

  let { miningInfo } = req.body;
  const userToken = req.headers['user-api-token'];

  // console.log("[UPDATE]: ", userEmail, userToken, miningInfo);

  db.get('SELECT api_token FROM users WHERE api_token = ? AND email = ?', userToken, userEmail, function (err, row) {
    if (err) {
      console.log("[DB - ERROR]: ", err);
      return res.status(500).json({ error: "Something Wrong, Try again." });
    }

    // No user found for the specified criteria.
    if (!row) return res.status(403).json({ error: "Unauthorized Access, Try again." });

    // Insert JSON data into the table. 
    db.run("UPDATE users SET mining_info = ? WHERE api_token = ? AND email = ?", miningInfo, userToken, userEmail, (err) => {
      if (err) {
        console.log("[DB - ERROR]: ", err);
        return res.status(500).json({ error: "Something Wrong With Update, Try again." });
      }

      // User record updated.
      // const mining_info = JSON.parse(row.mining_info);
      res.status(200).json({
        msg: "Record Updated"
      });

    });

  })

});




app.post("/api/withdrawal/approval/:userEmail", (req, res) => {
  const userEmail = req.params.userEmail;

  // Check if user has VIP/Priviledged withdrawal enabled
  db.get("SELECT * FROM users WHERE email = ?", [userEmail], (err, row) => {
    if (err) {
      console.log("[DB - ERROR]: ", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    const status = row.allow_withdraw ? true : false;
    res.status(200).json({
      withdrawal_status: status,
      msg: status ? 'Withdrawal Approved' : "User Not VIP Approved",
    });

  })
});



app.post("/api/auth", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: "Credentials Not Valid . . . Try again with valid creds." })

  const userAPIToken = generateRandomHex();
  // console.log("[USER-REG]:", email, password, userAPIToken);

  // Check if the user already exists.
  db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
    if (err) {
      console.log("[DB-ERROR]:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (row) {
      // User exists, check if approved
      if (row.approved) {
        // User is approved, perform login
        db.get(
          "SELECT * FROM users WHERE email = ? AND password = ?",
          [email, password],
          (loginErr, loginRow) => {
            if (loginErr) {
              console.log("[DB-ERROR]:", loginErr);
              return res.status(500).json({ error: "Internal server error" });
            }

            // console.log("[LOGIN]: ", loginRow);

            if (!loginRow) {
              return res.status(401).json({ error: "Invalid credentials" });
            }

            return res.status(200).json({
              message: "Login successful",
              user: { id: loginRow.id, email: loginRow.email, token: loginRow.api_token, miningInfo: JSON.parse(loginRow.mining_info) }
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
        "INSERT INTO users (email, password, api_token) VALUES (?, ?, ?)",
        [email, password, userAPIToken],
        function (registerErr) {
          if (registerErr) {
            console.log("[DB-ERROR]:", registerErr);
            return res.status(500).json({ error: "Failed to register user" });
          }

          const userId = this.lastID; // Get the last inserted row ID

          return res.status(200).json({
            message: "User registered successfully click again to login",
            user: { id: userId, email, token: null },
          });
        }
      );
    }
  });
});


// =============================== USER-FACING API CALLS ENDS HERE =====================================<<



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
