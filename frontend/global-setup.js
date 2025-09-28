const { loadEnvConfig } = require("@next/env");
module.exports = async () => {
  loadEnvConfig(process.cwd());
};
