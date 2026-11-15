const { createDb } = require("./db");
const { createApp } = require("./app");

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error("Set JWT_SECRET before starting the server (e.g. JWT_SECRET=change-me npm start)");
  process.exit(1);
}
const port = process.env.PORT || 4000;
createApp(createDb(), secret).listen(port, () => console.log(`JobTrack API on http://localhost:${port}`));
