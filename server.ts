import express, { Request, Response, RequestHandler, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import axios, { AxiosError } from 'axios';
import fs from 'fs-extra';
import FormData from 'form-data';
const multer = require('multer');
const upload = multer();

// 扩展 AxiosError 类型，添加 details 属性
interface ExtendedAxiosError extends AxiosError {
  details?: any;
}

dotenv.config();

const app = express();
// 允许前端 localhost:3000
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '10mb' }));

// 静态目录: img 在项目根
app.use('/img', express.static(path.join(process.cwd(), 'img')));
// 前端构建输出在项目根 frontend/build
app.use(express.static(path.join(process.cwd(), 'frontend', 'build')));

const AZ_ENDPOINT = process.env.REACT_APP_AZURE_OPENAI_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT;
const AZ_KEY = process.env.REACT_APP_AZURE_OPENAI_KEY || process.env.AZURE_OPENAI_KEY;
if (!AZ_ENDPOINT || !AZ_KEY) {
  console.error('Missing AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_KEY');
  process.exit(1);
}

async function generateImages(prompt: string, model: string, size: string, n: number, quality: string) {
  const url = `${AZ_ENDPOINT}/openai/deployments/${model}/images/generations?api-version=2025-03-01-preview`;
  const headers = { 'Content-Type': 'application/json', 'api-key': AZ_KEY };
  try {
    const resp = await axios.post(url, { prompt, model, size, n, quality }, { headers, timeout: 200000 });
    const data = resp.data;
    await fs.ensureDir(path.join(process.cwd(), 'img'));
    const urls: string[] = [];
    const ts = Date.now();
    await Promise.all(data.data.map(async (item: any, idx: number) => {
      let buffer: Buffer;
      if (item.url) {
        const r = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 60000 });
        buffer = Buffer.from(r.data);
      } else {
        buffer = Buffer.from(item.b64_json, 'base64');
      }
      const fname = `image_${ts}_${idx}.png`;
      const fpath = path.join(process.cwd(), 'img', fname);
      await fs.writeFile(fpath, buffer);
      urls.push(`/img/${fname}`);
    }));
    // 返回数组对象，包含 url 字段，供前端 data.data.map 使用
    return { data: urls.map(url => ({ url })), usage: data.usage };
  } catch (err: any) {
    // 在函数内部捕获错误，但将其向上传播，保留完整的错误信息
    console.error('Generate API错误详情:');
    if (axios.isAxiosError(err) && err.response) {
      console.error('状态码:', err.response.status);
      console.error('响应头:', err.response.headers);
      console.error('响应体:', JSON.stringify(err.response.data, null, 2));
      // 保留原始错误，但增加响应数据信息
      (err as ExtendedAxiosError).details = err.response.data;
    } else {
      console.error('非HTTP错误:', err);
    }
    throw err; // 重新抛出错误以便外层处理
  }
}

// 生成图片处理
const generateHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt, model, size, n, quality } = req.body;
    
    // 添加日志，记录请求参数
    console.log(`[Generate API] 收到请求，prompt: ${prompt?.substring(0, 50)}${prompt?.length > 50 ? '...' : ''}, model: ${model}, size: ${size}, n: ${n}, quality: ${quality}`);
    
    const result = await generateImages(prompt, model, size, Number(n), quality);
    res.json(result);
  } catch (err: any) {
    console.error('生成接口错误:', err.message);
    
    // 如果有详细的响应数据，传递给前端
    if (err.details) {
      // 使用适当的HTTP状态码
      const statusCode = err.response?.status || 500;
      console.error(`完整错误详情: ${JSON.stringify(err.details, null, 2)}`);
      res.status(statusCode).json({ 
        error: err.message, 
        details: err.details 
      });
    } else {
      // 没有详细数据时的默认处理
      res.status(500).json({ error: err.message });
    }
  }
};
app.post('/api/generate', generateHandler);

// 单次 multipart/form-data 路由，接收多张图片
app.post('/api/edit', upload.any(), async (req: Request, res: Response) => {
  try {
    // multer 解析后的文件列表
    const files = (req as any).files as any[];
    const { prompt, model, size, n, quality } = req.body;

    // 添加日志显示提交的照片数量
    console.log(`[Edit API] 收到 ${files?.length || 0} 张照片, prompt: ${prompt?.substring(0, 50)}${prompt?.length > 50 ? '...' : ''}`);
    
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No images provided' });
      return;
    }
    // 构造转发给 Azure 的 FormData
    const form = new FormData();
    // 添加多张图片，字段名使用数组语法 'image[]'
    files.forEach(f => form.append('image[]', f.buffer, { filename: f.originalname, contentType: f.mimetype }));
    form.append('prompt', prompt);
    form.append('model', model);
    form.append('size', size);
    form.append('n', n.toString());
    form.append('quality', quality);
    // 请求 Azure OpenAI Edits API
    const url = `${AZ_ENDPOINT}/openai/deployments/${model}/images/edits?api-version=2025-04-01-preview`;
    const resp = await axios.post(url, form, { headers: { 'api-key': AZ_KEY, ...form.getHeaders() }, timeout: 200000 });
    const data = resp.data;
    // 保存返回的图片
    await fs.ensureDir(path.join(process.cwd(), 'img'));
    const ts = Date.now();
    const urls: string[] = [];
    await Promise.all(data.data.map(async (item: any, idx: number) => {
      let buf: Buffer;
      if (item.url) {
        const r2 = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 60000 });
        buf = Buffer.from(r2.data);
      } else {
        buf = Buffer.from(item.b64_json, 'base64');
      }
      const fname = `edit_bulk_${ts}_${idx}.png`;
      const fpath = path.join(process.cwd(), 'img', fname);
      await fs.writeFile(fpath, buf);
      urls.push(`/img/${fname}`);
    }));
    // 返回格式：data 数组
    res.json({ data: urls.map(u => ({ url: u })), usage: data.usage });
  } catch (err: any) {
    if (axios.isAxiosError(err) && err.response) {
      console.error('Edit API error status:', err.response.status);
      console.error('Edit API error response body:', err.response.data);
      // 使用类型断言确保类型安全
      (err as ExtendedAxiosError).details = err.response.data;
      res.status(err.response.status).json({ error: err.message, details: err.response.data });
      return;
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback: 返回项目根 frontend/build/index.html
const spaHandler = (_req: Request, res: Response, next: NextFunction) => {
  res.sendFile(path.join(process.cwd(), 'frontend', 'build', 'index.html'));  
};
app.use(spaHandler);

const port = process.env.PORT || 5005;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));