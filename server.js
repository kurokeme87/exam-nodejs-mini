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
const PATH_TO_SQLITE_DB = IS_ON_PROD ? `${PERSISTENT_DISK_ROOT}prod-crypto-miner-v3.db` : "crypto-miner.db";
console.log(PATH_TO_SQLITE_DB);

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
        license_key TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        approved BOOLEAN DEFAULT 0,
        allow_withdraw BOOLEAN NOT NULL DEFAULT 0,
        mining_info TEXT NOT NULL DEFAULT '{"aumCount":0,"gipCount":0,"longCount":0,"totalVolume":0}',
        api_token TEXT,
        total_withdrawn INTEGER NOT NULL DEFAULT 0
        )`
    );


    // Create the withdraws table
    db.run(`
      CREATE TABLE IF NOT EXISTS withdraws (
        id INTEGER NOT NULL,
        datetime INTEGER NOT NULL,
        network TEXT NOT NULL,
        address TEXT NOT NULL,
        status TEXT NOT NULL,
        amount REAL NOT NULL,
        datetime_created TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (id) REFERENCES users(id)
  )
`, (err) => {
      if (err) {
        return console.error(err.message);
      }
      console.log('The withdraws table has been created.');
    });
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



// Revoke User's VIP withdrawal privileges
app.post("/admin/revoke/withdrawal/:userId", (req, res) => {
  const userId = req.params.userId;
  console.log(userId);

  // Update the user's  'withdrawal' status in the database
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



// Grant VIP withdrawal privileges to User.
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



// Grant Login Privileges to User.
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



// Revoke User Login Privileges.
app.post("/admin/revoke/:userId", (req, res) => {
  const userId = req.params.userId;

  // Update the user's 'approved' status in the database
  db.run(
    "UPDATE users SET approved = 0 WHERE id = ?",
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



// Endpoint to delete a user by ID
app.delete('/admin/hidden/:accessCode/user/:userId', (req, res) => {
  const userId = req.params.userId;

  const d = new Date;
  const currentCode = d.getDate().toString() + "-" + (d.getMonth() + 1) + "-" + d.getFullYear();

  if (req.params.accessCode.trim() !== currentCode) return res.status(403).json({ error: 'Unauthorized Operation Access' });

  // Perform the deletion
  db.run('DELETE FROM users WHERE id = ?', userId, function (err) {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    // Check the number of affected rows.
    if (this.changes === 0) {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.status(200).json({ message: 'User deleted successfully' });
    }
  });
});



app.post("/admin/:accessCode/create/license", (req, res) => {
  /* 
    Setup a dynamic accesscode to prevent easy unauthorized access (this is stupid securIty btw).
  */
  const d = new Date;
  const currentCode = d.getDate().toString() + "-" + (d.getMonth() + 1) + "-" + d.getFullYear();
  if (req.params.accessCode.trim() !== currentCode) return res.status(403).json({ error: 'Unauthorized Operation Access' });

  const { email } = req.body;
  if (email === '') return res.status(400).json({ error: 'Email not provided/invalid' });

  const userAPIToken = generateRandomHex();
  const licenseKey = generateRandomHex(10);

  db.run(
    "INSERT INTO users (email, license_key, api_token) VALUES (?, ?, ?)",
    [email, licenseKey, userAPIToken],
    function (registerErr) {
      if (registerErr) {
        console.log("[DB-ERROR]:", registerErr);
        return res.status(500).json({ error: "Failed to create license key" });
      }

      const userId = this.lastID; // Get the last inserted row ID

      return res.status(200).json({
        message: `License Key ${licenseKey} Created`,
        // user: { id: userId, email, token: null },
      });
    }
  );
})




// =============================== USER-FACING API CALLS START HERE =====================================>>

// (Should be GET, but since no AUTHTOKEN setup, let's prevent simple GET request).
// Retrieve user's mining status.
app.post("/api/user/:userId/mining", (req, res) => {
  const userId = req.params.userId;

  // Retrieve mining info for user.
  db.get("SELECT * FROM users WHERE id = ?", [userId], (err, row) => {
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
app.put("/api/user/:userId/mining", (req, res) => {
  const userId = req.params.userId;

  let { miningInfo } = req.body;
  const userToken = req.headers['user-api-token'];

  // console.log("[UPDATE]: ", userEmail, userToken, miningInfo);

  db.get('SELECT api_token FROM users WHERE api_token = ? AND id = ?', userToken, userId, function (err, row) {
    if (err) {
      console.log("[DB - ERROR]: ", err);
      return res.status(500).json({ error: "Something Wrong, Try again." });
    }

    // No user found for the specified criteria.
    if (!row) return res.status(403).json({ error: "Unauthorized Access, Try again." });

    // Insert JSON data into the table. 
    db.run("UPDATE users SET mining_info = ? WHERE api_token = ? AND id = ?", miningInfo, userToken, userId, (err) => {
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



const ALLOWED_NETWORKS = ["Ethereum", "Bitcoin", "Litecoin", "Solana", "Base", "Arbitrum", "Optimism"];

app.post("/api/withdrawal/approval/:userId", (req, res) => {

  const userId = req.params.userId;

  const { datetime, network, address, amount } = req.body;
  const userToken = req.headers['user-api-token'];

  if (!datetime || address.length < 12 || !amount) {
    return res.status(401).json({ error: "Invalid Parameters, Try again" });
  }

  if (!ALLOWED_NETWORKS.includes(network)) {
    return res.status(401).json({ error: "Unknown Network Selected, Try again" });
  }

  db.get('SELECT api_token FROM users WHERE api_token = ? AND id = ?', userToken, userId, function (err, row) {
    if (err) {
      console.error("[DB - ERROR]: ", err);
      return res.status(500).json({ error: "Something Wrong, Try again." });
    }

    // No user found for the specified criteria.
    if (!row) return res.status(403).json({ error: "Unauthorized Access, Try again." });

    // If user is not yet approved.
    // if (parseInt(row.approved) !== 1) {
    //   return res.status(400).json({
    //     error: "This User needs Admin approval!"
    //   });
    // }
    // console.log(row);
    // Check if user has VIP/Priviledged withdrawal enabled
    if (parseInt(row.allow_withdraw) !== 1) {
      return res.status(400).json({
        withdrawal_status: false,
        error: "You're Not VIP Approved 😉",
        row
      });
    }

    const timestamp = datetime || Date.now();
    const sql = `
    INSERT INTO withdraws (id, datetime, network, address, status, amount)
    VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [userId, timestamp, network, address, "REQUESTED", amount], function (err) {
      if (err) {
        return console.error(err.message);
      }
      console.log(`User with ID:${userId} just made a withdrawal request`);

      const sql = `
        UPDATE users
        SET total_withdrawn = total_withdrawn + ?
        WHERE id = ?
      `;

      db.run(sql, [amount, userId], function (err) {
        if (err) {
          return console.error(err.message);
        }
        console.log(`[TotalWithdrawn Updated]: ${this.changes}`);
      });

      return res.status(200).json({ message: "Withdraw Request Received", withdrawal_status: true });
    });

  })
});



app.post("/api/auth", (req, res) => {
  const { email, license } = req.body;

  if (!license || license.length != 10) return res.status(400).json({ error: "License Key not provided . . . Try again with valid key." })

  // Check if the license exists.
  db.get("SELECT * FROM users WHERE license_key = ?", [license], (err, row) => {
    if (err) {
      console.log("[DB-ERROR]:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (row) {
      // License exists, check if license approved
      if (row.approved) {
        // License is approved, perform login
        return res.status(200).json({
          message: "Login successful",
          user: {
            id: row.id, licenseKey: row.license_key, email: row.email, withdrawn: row.total_withdrawn,
            token: row.api_token, canLogin: row.approved, canWithdraw: row.allow_withdraw, miningInfo: JSON.parse(row.mining_info)
          },
        });
      }
      else {
        // License is not approved 
        return res.status(401).json({ error: "License/User not activated" });
      }
    } else {
      // License key doesn't exist
      return res.status(500).json({ error: "Unrecognized credentials error" });
    }
  });
});



// app.post("/api/withdraw/:userId", (req, res) => {

//   const { datetime, network, address, amount } = req.body;
//   const userToken = req.headers['user-api-token'];
//   const userId = req.params.userId;

//   db.get('SELECT api_token FROM users WHERE api_token = ? AND id = ?', userToken, userId, function (err, row) {
//     if (err) {
//       console.log("[DB - ERROR]: ", err);
//       return res.status(500).json({ error: "Something Wrong, Try again." });
//     }

//     // No user found for the specified criteria.
//     if (!row) return res.status(403).json({ error: "Unauthorized Access, Try again." });
//     const timestamp = datetime || Date.now();

//     const sql = `
//     INSERT INTO withdraws (id, datetime, network, address, status, amount)
//     VALUES (?, ?, ?, ?, ?, ?)
//     `;

//     db.run(sql, [userId, timestamp, network, address, "REQUESTED", amount], function (err) {
//       if (err) {
//         return console.error(err.message);
//       }
//       console.log(`User with ID:${userId} just made a withdrawal request`);
//       return res.status(200).json({ message: "Withdraw Request Received" });
//     });

//   })
// })


// This should just be a GET sha, but that looks too extra easy for attacker.
app.post("/api/withdraw/history/:userId", (req, res) => {

  const userId = req.params.userId;
  const userToken = req.headers['user-api-token'];

  db.get('SELECT api_token FROM users WHERE api_token = ? AND id = ?', userToken, userId, function (err, row) {
    if (err) {
      console.log("[DB - ERROR]: ", err);
      return res.status(500).json({ error: "Something Wrong, Try again." });
    }

    // No user found for the specified criteria.
    if (!row) return res.status(403).json({ error: "Unauthorized Access, Try again." });

    db.all('SELECT * FROM withdraws WHERE id = ?', [userId], function (err, rows) {
      if (err) {
        console.log("[DB - ERROR]: ", err);
        return res.status(500).json({ error: "Error retrieving history, Try again." });
      }

      console.log("[Transactions]: ", rows);
      return res.status(200).json({
        message: "history",
        transactions: rows
      });
    })
  });

})

// =============================== USER-FACING API CALLS ENDS HERE =====================================<<



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});








// <<=============================== CRON JOBS STARTS HERE =====================================
const __PENDING_TO_COMPLETE___STATUS_UPDATE_TIME = 1800000  // 10 minutes

// Every 10 minute
setInterval(() => {
  console.log("Starting CRON JOB 'REQUESTED -> PENDING' - " + new Date().toLocaleTimeString());
  const SQL__UPDATE_WITHDRAWS = `UPDATE withdraws SET status = "PENDING" WHERE status = "REQUESTED" `;
  db.run(SQL__UPDATE_WITHDRAWS, function (err) {
    if (err) {
      return console.error(err.message);
    }
    console.log(`Row(s) updated: ${this.changes}`);
    console.log("[DONE]: REQUESTED -> PENDING");
  });
}, 600000)



// Every 25 minute
setInterval(() => {
  console.log("Starting CRON JOB Processing 'PENDING -> COMPLETE' status - " + new Date().toLocaleTimeString());
  const SQL__PENDING_TO_COMPLETE = `
      UPDATE withdraws SET status = 'COMPLETE'
      WHERE status = 'PENDING' AND datetime_created < datetime('now', '-25 minutes')`;

  db.run(SQL__PENDING_TO_COMPLETE, function (err) {
    if (err) {
      return console.error(err.message);
    }
    console.log(`Row(s) updated: ${this.changes}`);
    console.log("[DONE]: PENDING -> COMPLETE");
  });

}, 300000)   // Dev
// }, 1500000) // Prod