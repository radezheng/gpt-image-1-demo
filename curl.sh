
curl -X POST $AZURE_API_ENDPOINT \
  -H "Content-Type: application/json" \
  -H "api-key: $AZURE_API_KEY" \
  -d '{
     "prompt" : "A photograph of a red fox in an autumn forest",
     "size" : "1024x1024",
     "quality" : "medium",
     "n" : 1
    }' | jq -r '.data[0].b64_json' | base64 --decode > generated_image.png


./imgedit.sh img/image_20250427094423.png "脱掉帽子"    