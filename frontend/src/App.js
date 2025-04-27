import { useState } from 'react';
import './App.css';
import { Container, Box, Typography, Button, TextField, CircularProgress, ToggleButton, ToggleButtonGroup } from '@mui/material';
import React from 'react';

function App() {
  const MODELS = ["gpt-image-1"];
  const SIZES = ["1024x1024", "1024x1536", "1536x1024"];
  const QUALITIES = ["low", "medium", "high"];
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [quality, setQuality] = useState(QUALITIES[2]);
  const [n, setN] = useState(1);
  const [urls, setUrls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const [usageInfo, setUsageInfo] = useState(null);

  const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });

  // convert image URL to base64
  const toBase64Url = url => fetch(url)
    .then(res => res.blob())
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = error => reject(error);
    }));

  const handleReset = () => {
    setPrompt("");
    setModel(MODELS[0]);
    setSize(SIZES[0]);
    setQuality(QUALITIES[2]);
    setN(1);
    setUrls([]);
    setError(null);
    setUploadedImages([]);
    setSelectedImageIndex(null);
    setUsageInfo(null);
  };

  // 调用后端生成 API
  const callImageAPI = async ({prompt, model, size, n, quality}) => {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model, size, n, quality }),
    });
    if (!resp.ok) {
      const errorBody = await resp.json();
      const errorObj = new Error(errorBody.error || 'Error generating image');
      // 附加 details
      errorObj.details = errorBody.details;
      throw errorObj;
    }
    return resp.json();
  };

  // 调用后端编辑 API
  const callImageEditAPI = async ({imageBase64, prompt, model, size, n, quality}) => {
    // 将 Base64 转换为 Blob
    const blob = base64toBlob(imageBase64);
    const form = new FormData();
    form.append('image[]', blob, 'image.png');  // 使用 'image[]' 与后端匹配
    form.append('prompt', prompt);
    form.append('model', model);
    form.append('size', size);
    form.append('n', n.toString());
    form.append('quality', quality);
    
    const resp = await fetch('/api/edit', {
      method: 'POST',
      body: form
    });
    if (!resp.ok) {
      const errorBody = await resp.json();
      const errorObj = new Error(errorBody.error || 'Error editing image');
      // 附加 details
      errorObj.details = errorBody.details;
      throw errorObj;
    }
    return resp.json();
  };

  // 将 Base64 字符串转换为 Blob
  const base64toBlob = (b64Data) => {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    const sliceSize = 512;
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: 'image/png' });
  };

  // 批量编辑 API 调用，使用 FormData 多文件上传
  const callBulkImageEditAPI = async ({ images, prompt, model, size, n, quality }) => {
    const form = new FormData();
    // 添加多张图片 (File 对象或 Base64 字符串转 Blob)
    images.forEach((img, idx) => {
      if (img.file) {
        form.append('image[]', img.file, img.file.name);
      } else if (typeof img === 'string') {
        const blob = base64toBlob(img);
        form.append('image[]', blob, `image_${idx}.png`);
      }
    });
    form.append('prompt', prompt);
    form.append('model', model);
    form.append('size', size);
    form.append('n', n.toString());
    form.append('quality', quality);
    const resp = await fetch('/api/edit', { method: 'POST', body: form });
    if (!resp.ok) {
      const errorBody = await resp.json();
      const errorObj = new Error(errorBody.error || 'Error editing images');
      errorObj.details = errorBody.details;
      throw errorObj;
    }
    return resp.json();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setUrls([]);
    setUsageInfo(null);
    try {
      let data;
      if (uploadedImages.length > 1) {
        // 多张图片批量编辑，先转 Base64 数组
        const base64Arr = await Promise.all(
          uploadedImages.map(img => img.file ? toBase64(img.file) : toBase64Url(img.src))
        );
        data = await callBulkImageEditAPI({ images: base64Arr, prompt, model, size, n, quality });
      } else if (uploadedImages.length === 1 && selectedImageIndex !== null) {
        // 单张图片编辑
        const sel = uploadedImages[selectedImageIndex];
        const base64 = sel.file ? await toBase64(sel.file) : await toBase64Url(sel.src);
        data = await callImageEditAPI({ imageBase64: base64, prompt, model, size, n, quality });
      } else {
        data = await callImageAPI({ prompt, model, size, n, quality });
      }
      // 从响应中提取图片 URL 或 Base64
      const arr = data.data.map(item => item.url || `data:image/png;base64,${item.b64_json}`);
      setUrls(arr);
      setUsageInfo(data.usage);
    } catch (err) {
      // 如果后端返回了详细错误信息，则显示message和details
      const msg = err.message || 'Error';
      const details = err.details ? JSON.stringify(err.details) : null;
      setError(details ? `${msg}: ${details}` : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth={false} disableGutters>
      <Box display="flex" justifyContent="center" alignItems="center" sx={{ mt:2, mb:2 }}>
        <Typography variant="h4">Azure OpenAI GPT-Image-1 Demo</Typography>
      </Box>
      <Box component="form" onSubmit={handleSubmit} noValidate px={2} py={1}>
        <Box display="flex" alignItems="center" justifyContent="center" sx={{ gap: 3, mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ mr: 0.5 }}>Size</Typography>
          <ToggleButtonGroup
            value={size} exclusive onChange={(e, val) => val && setSize(val)}
            size="small" color="primary"
            sx={{
              mr: 1,
              '& .MuiToggleButton-root.Mui-selected': {
                bgcolor: 'primary.main',
                color: 'common.white',
                '&:hover': { bgcolor: 'primary.dark' }
              }
            }}
          >
            {SIZES.map(s => <ToggleButton key={s} value={s} size="small">{s}</ToggleButton>)}
          </ToggleButtonGroup>
          <Typography variant="body2" sx={{ mr: 0.5 }}>Quality</Typography>
          <ToggleButtonGroup
            value={quality} exclusive onChange={(e, val) => val && setQuality(val)}
            size="small" color="primary"
            sx={{
              mr: 1,
              '& .MuiToggleButton-root.Mui-selected': {
                bgcolor: 'primary.main',
                color: 'common.white',
                '&:hover': { bgcolor: 'primary.dark' }
              }
            }}
          >
            {QUALITIES.map(q => <ToggleButton key={q} value={q} size="small">{q}</ToggleButton>)}
          </ToggleButtonGroup>
          <Typography variant="body2" sx={{ mr: 0.5 }}>Count</Typography>
          <ToggleButtonGroup
            value={n} exclusive onChange={(e, val) => val && setN(val)}
            size="small" color="primary"
            sx={{
              mr: 1,
              minWidth: 120,
              '& .MuiToggleButton-root.Mui-selected': {
                bgcolor: 'primary.main',
                color: 'common.white',
                '&:hover': { bgcolor: 'primary.dark' }
              }
            }}
          >
            {[1,2,3,4].map(val => (
              <ToggleButton
                key={val}
                value={val}
                size="small"
                sx={{ minWidth: 48, px: 1.5 }}
              >
                {val}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <TextField
            label="Prompt"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            required
            sx={{ flexGrow: 1, mr: 2 }}
          />
          <Box>
            <Button variant="contained" type="submit" disabled={loading}>Generate</Button>
            <Button variant="outlined" onClick={handleReset} sx={{ ml: 3 }}>Reset</Button>
          </Box>
        </Box>
      </Box>
      {error && <Typography color="error" align="center">{error}</Typography>}
      <Box
        display="flex"
        alignItems="flex-start"
        sx={{
          mt: 2,
          width: '100%',
          border: '1px solid',
          borderColor: 'grey.300',
          borderRadius: 1,
          p: 2,
        }}
      >
        <Box sx={{ width: '30%', pr: 2 }}>
          <Box display="flex" alignItems="center" mb={2}>
            <Typography variant="h5" component="span" sx={{ mr: 1 }}>Source Photo</Typography>
            <Button variant="outlined" component="label">
              Upload Photos
              <input hidden accept="image/*" multiple type="file" onChange={e => {
                const files = Array.from(e.target.files);
                if (!files.length) return;
                setUploadedImages(prev => {
                  const imgs = [...prev, ...files.map(file => ({ src: URL.createObjectURL(file), file }))].slice(0, 4);
                  return imgs;
                });
                if (selectedImageIndex === null) setSelectedImageIndex(0);
              }} />
            </Button>
          </Box>
          {uploadedImages.length > 0 && (
            <Box mt={2} sx={{ width: '100%' }}>
              {uploadedImages.length === 1 ? (
                <Box position="relative">
                  <img
                    src={uploadedImages[0].src}
                    alt="Uploaded"
                    style={{ width: '100%', height: 'auto', objectFit: 'cover', border: selectedImageIndex === 0 ? '2px solid blue' : '2px solid transparent', borderRadius: 4, cursor: 'pointer' }}
                    onClick={() => setSelectedImageIndex(0)}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => { setUploadedImages([]); setSelectedImageIndex(null); }}
                    sx={{ position: 'absolute', top: 0, right: 0, minWidth: 'auto', padding: '2px 4px' }}
                  >X</Button>
                </Box>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, width: '100%' }}>
                  {uploadedImages.map((img, idx) => (
                    <Box key={idx} position="relative">
                      <img
                        src={img.src}
                        alt={`Uploaded ${idx}`}
                        style={{ width: '100%', height: 'auto', objectFit: 'cover', border: idx === selectedImageIndex ? '2px solid blue' : '2px solid transparent', borderRadius: 4, cursor: 'pointer' }}
                        onClick={() => setSelectedImageIndex(idx)}
                      />
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => {
                          setUploadedImages(prev => prev.filter((_, i) => i !== idx));
                          setSelectedImageIndex(prev => prev === idx ? null : prev > idx ? prev - 1 : prev);
                        }}
                        sx={{ position: 'absolute', top: 0, right: 0, minWidth: 'auto', padding: '2px 4px' }}
                      >X</Button>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
          {usageInfo && (
            <Box mt={1}>
              <Typography variant="body2">使用Tokens: {usageInfo.total_tokens} (输入 {usageInfo.input_tokens}, 输出 {usageInfo.output_tokens})</Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ width: '70%', pl: 2 }}>
          <Typography variant="h5" gutterBottom>Generated Images</Typography>
          {loading ? (
            <Box display="flex" justifyContent="center"><CircularProgress /></Box>
          ) : (
            urls.map((url, idx) => (
              <Box key={idx} sx={{ mt: 2, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ flexGrow: 1 }}>
                  <img
                    src={url}
                    alt="Generated"
                    style={{ width: '100%', height: 'auto', borderRadius: 4 }}
                  />
                </Box>
                <Box sx={{ flexShrink: 0 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setUploadedImages([{ src: url, file: null }]);
                      setSelectedImageIndex(0);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = url;
                      const fname = url.split('/').pop() || `download.png`;
                      link.download = fname;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    sx={{ ml: 1 }}
                  >
                    Down
                  </Button>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Box>
    </Container>
  );
}

export default App;
