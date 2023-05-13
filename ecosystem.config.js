module.exports = {
  apps: [
    {
      name: "StructureBot",
      script: "dist/Bot.js",
      instances: 1,
      autorestart: true,
    },
  ]
};