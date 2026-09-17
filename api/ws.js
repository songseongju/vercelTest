// Vercel's native WebSocket transport; all room state is shared through Redis.
module.exports = require('../server/app.cjs').createApp({staticFiles:false}).server;
