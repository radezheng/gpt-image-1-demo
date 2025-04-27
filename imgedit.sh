#!/usr/bin/env bash

# set -e

# Azure 最佳实践检查（如果有该工具）
# azure_development-get_best_practices || true

if [[ -z "$AZURE_OPENAI_KEY" ]]; then
  echo "Error: 请先设置环境变量 AZURE_OPENAI_KEY"
  exit 1
fi

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <image_path> <prompt>"
  exit 1
fi

image_path="$1"
prompt="$2"

if [[ ! -f "$image_path" ]]; then
  echo "Error: 图像文件不存在：$image_path"
  exit 1
fi

# 确保输出目录存在
mkdir -p img

# 时间戳
timestamp=$(date +"%Y%m%d%H%M%S")
response_file="resp/Response_${timestamp}.json"
outfile="img/image_${timestamp}.png"

# # Base64 编码（macOS 无换行）
# img_base64=$(base64 -b 0 -i "$image_path" | tr -d '\n')

# 调用 Azure OpenAI 图像编辑接口，multipart/form-data 请求
if ! curl -sS -X POST \
    "https://aisvc-wu3.openai.azure.com/openai/deployments/gpt-image-1/images/edits?api-version=2025-04-01-preview" \
    -H "api-key: $AZURE_OPENAI_KEY" \
    -F "image=@${image_path}" \
    -F "prompt=${prompt}" \
    -F "model=gpt-image-1" \
    -F "size=1024x1024" \
    -F "n=1" \
    -F "quality=high" \
    > "$response_file"; then
  code=$?
  if [ "$code" -eq 35 ]; then
    echo "Error: 连接被重置 (curl code 35)" >&2
  else
    echo "Error: curl 请求失败，退出码 $code" >&2
  fi
  exit 1
fi

# 验证 response_file 是否包含 data 且非空
if ! jq -e '.data | length > 0' "$response_file" > /dev/null; then
  echo "Error: 响应中未包含 data 字段或数组为空" >&2
  cat "$response_file"
  exit 1
fi

# 解码 b64_json 为图片
# macOS 上使用 -D，Linux 上使用 --decode
if [[ "$(uname)" == "Darwin" ]]; then
  dec_flag="-D"
else
  dec_flag="--decode"
fi

jq -r '.data[0].b64_json' "$response_file" | base64 $dec_flag > "$outfile"

echo "✅ 响应已保存到 ${response_file}"
echo "✅ 解码后图像已保存到 ${outfile}"