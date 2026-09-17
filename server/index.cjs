'use strict';
const {createApp}=require('./app.cjs');
const app=createApp();const port=Number(process.env.PORT)||8780,host=process.env.HOST||'127.0.0.1';
app.server.listen(port,host,()=>console.log(`LAST FIELD multiplayer: http://${host}:${port} (${app.store?.constructor.name||'Redis configuration missing'})`));
async function stop(){await app.transport.close();await app.store?.close?.();app.server.close(()=>process.exit(0))}process.on('SIGTERM',stop);process.on('SIGINT',stop);
