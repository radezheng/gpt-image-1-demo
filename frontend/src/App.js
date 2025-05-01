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
  const [generationTime, setGenerationTime] = useState(null);
  const [maskImages, setMaskImages] = useState([]);
  const [selectedMaskIndex, setSelectedMaskIndex] = useState(null);

  const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });

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
    setMaskImages([]);
    setSelectedMaskIndex(null);
  };

  const callImageAPI = async ({prompt, model, size, n, quality}) => {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model, size, n, quality }),
    });
    if (!resp.ok) {
      const errorBody = await resp.json();
      const errorObj = new Error(errorBody.error || 'Error generating image');
      errorObj.details = errorBody.details;
      throw errorObj;
    }
    return resp.json();
  };

  const callImageEditAPI = async ({imageBase64, maskBase64, prompt, model, size, n, quality}) => {
    const blob = base64toBlob(imageBase64);
    const form = new FormData();
    form.append('image[]', blob, 'image.png');
    if (maskBase64) {
      const maskBlob = base64toBlob(maskBase64);
      form.append('mask', maskBlob, 'mask.png');
    }
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
      errorObj.details = errorBody.details;
      throw errorObj;
    }
    return resp.json();
  };

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

  const callBulkImageEditAPI = async ({ images, maskBase64, prompt, model, size, n, quality }) => {
    const form = new FormData();
    images.forEach((img, idx) => {
      if (img.file) {
        form.append('image[]', img.file, img.file.name);
      } else if (typeof img === 'string') {
        const blob = base64toBlob(img);
        form.append('image[]', blob, `image_${idx}.png`);
      }
    });
    if (maskBase64) {
      const maskBlob = base64toBlob(maskBase64);
      form.append('mask', maskBlob, 'mask.png');
    }
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
    setGenerationTime(null);
    
    console.log("提交状态:", { 
      uploadedImagesLength: uploadedImages.length,
      selectedImageIndex,
      hasPrompt: !!prompt
    });
    
    let maskBase64 = null;
    if (maskImages.length > 0) {
      maskBase64 = maskImages[0].file ? await toBase64(maskImages[0].file) : await toBase64Url(maskImages[0].src);
    }

    const startTime = new Date();
    try {
      let data;
      if (uploadedImages.length > 1) {
        console.log("使用批量编辑API，上传 " + uploadedImages.length + " 张照片");
        const base64Arr = await Promise.all(
          uploadedImages.map(img => img.file ? toBase64(img.file) : toBase64Url(img.src))
        );
        data = await callBulkImageEditAPI({ images: base64Arr, maskBase64, prompt, model, size, n, quality });
      } else if (uploadedImages.length === 1) {
        console.log("使用单张图片编辑API");
        const sel = uploadedImages[0];
        const base64 = sel.file ? await toBase64(sel.file) : await toBase64Url(sel.src);
        data = await callImageEditAPI({ imageBase64: base64, maskBase64, prompt, model, size, n, quality });
      } else {
        console.log("使用图片生成API");
        data = await callImageAPI({ prompt, model, size, n, quality });
      }
      const endTime = new Date();
      const timeTaken = (endTime - startTime) / 1000;
      setGenerationTime(timeTaken);
      
      const arr = data.data.map(item => item.url || `data:image/png;base64,${item.b64_json}`);
      setUrls(arr);
      setUsageInfo(data.usage);
    } catch (err) {
      console.error("API调用错误:", err);
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
                
                setUrls([]);
                
                setUploadedImages(prev => {
                  const imgs = [...prev, ...files.map(file => ({ src: URL.createObjectURL(file), file }))].slice(0, 4);
                  
                  setTimeout(() => {
                    setSelectedImageIndex(imgs.length - 1);
                    console.log("照片上传完成，设置selectedImageIndex为:", imgs.length - 1);
                  }, 0);
                  
                  return imgs;
                });
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
              {generationTime && (
                <Typography variant="body2" sx={{ mb: 1 }}>生成用时: {generationTime.toFixed(2)}秒</Typography>
              )}
              <Typography variant="body2">使用Tokens: {usageInfo.total_tokens} (输入 {usageInfo.input_tokens}, 输出 {usageInfo.output_tokens})</Typography>
            </Box>
          )}
          <Box display="flex" alignItems="center" mb={2} mt={2}>
            <Typography variant="h5" component="span" sx={{ mr: 1 }}>Mask Photo</Typography>
            <Button variant="outlined" component="label" size="small">
              Upload Mask
              <input hidden accept="image/*" type="file" onChange={e => {
                const file = e.target.files[0];
                if (!file) return;
                setMaskImages([{ src: URL.createObjectURL(file), file }]);
                setSelectedMaskIndex(0);
              }} />
            </Button>
          </Box>
          {maskImages.length > 0 && (
            <Box mt={1} sx={{ width: '100%' }}>
              <Box position="relative">
                <img
                  src={maskImages[0].src}
                  alt="Mask"
                  style={{ width: '100%', height: 'auto', objectFit: 'cover', border: selectedMaskIndex === 0 ? '2px solid green' : '2px solid transparent', borderRadius: 4, cursor: 'pointer' }}
                  onClick={() => setSelectedMaskIndex(0)}
                />
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => { setMaskImages([]); setSelectedMaskIndex(null); }}
                  sx={{ position: 'absolute', top: 0, right: 0, minWidth: 'auto', padding: '2px 4px' }}
                >X</Button>
              </Box>
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
                <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  >
                    Down
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setMaskImages([{ src: url, file: null }]);
                      setSelectedMaskIndex(0);
                    }}
                  >Mask</Button>
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
