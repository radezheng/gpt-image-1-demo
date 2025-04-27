#!/usr/bin/env bash

# 生成带时间戳的文件名
timestamp=$(date +"%Y%m%d%H%M%S")
outfile="img/image_${timestamp}.png"

# 查找当前目录下最新的以 Response 开头的 .json 文件
response_file=$(ls -t Response*.json 2>/dev/null | head -n1)
if [[ -z "$response_file" ]]; then
  echo "Error: 未找到以 Response 开头的 .json 文件"
  exit 1
fi

# 从最新的 Response*.json 提取 b64_json 并解码
jq -r '.data[0].b64_json' "$response_file" | base64 -D > "${outfile}"

echo "✅ 已从 ${response_file} 生成 ${outfile}"