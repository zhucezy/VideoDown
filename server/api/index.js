// Vercel Serverless Function 入口（Node 运行时）
//
// 关键点：Vercel 的 Node 函数接受 (req, res) => void 形式的处理器，
// 而 Express 的 app 本身就是一个 (req, res) 处理器（内部调用 app.handle）。
// 因此直接导出 app 即可，无需 serverless-http 中转，也避免了其框架识别失败的问题。
//
// 部署时 Vercel 的 Root Directory 设为 server，此文件位于 server/api/index.js。
// vercel.json 中的 routes 会把所有路径转发到这里，由 Express 自行路由。
const app = require('../src/index');

module.exports = app;
