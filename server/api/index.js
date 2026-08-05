// Vercel Serverless Function 入口：把 Express 应用包装成 Serverless 函数
// 部署时 Vercel 的 Root Directory 设为 server，此文件位于 server/api/index.js
const serverless = require('serverless-http');
const app = require('../src/index');

module.exports = serverless(app, {
  // 解析结果 JSON 体积很小，无需 binary 处理
  binary: false,
});
