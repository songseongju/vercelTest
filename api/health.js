const{configuredStore}=require('../server/store.cjs');
const{health}=require('../server/health.cjs');
const store=configuredStore();
module.exports=async function(_req,res){const result=await health(store);res.setHeader('Cache-Control','no-store');res.status(result.ok?200:503).json(result)};
