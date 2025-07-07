// global-setup.js
const { loadEnvConfig } = require("@next/env");

module.exports = async () => {
  // This will load, in order:
  //  .env                  (always)
  //  .env.local            (always)
  //  .env.development      if NODE_ENV=development
  //  .env.test             if NODE_ENV=test
  //
  loadEnvConfig(process.cwd());
};
