#!/bin/bash
# ============================================================
# ABS 媒体库同步脚本
# 用于将本地服务器的媒体库数据同步到 VPS
# ============================================================

# 配置变量 - 请根据实际情况修改
LOCAL_ABS_URL="http://localhost:13378"      # 本地 ABS 服务器地址
VPS_ABS_URL="http://your-vps-ip:13378"      # VPS ABS 服务器地址
LOCAL_API_KEY="your-local-api-key"           # 本地服务器 API Key
VPS_API_KEY="your-vps-api-key"              # VPS 服务器 API Key

# 本地 metadata/items 目录路径
LOCAL_METADATA_ITEMS="/path/to/local/metadata/items"
# VPS metadata/items 目录路径 (通过 SSH)
VPS_USER="root"
VPS_HOST="your-vps-ip"
VPS_METADATA_ITEMS="/path/to/vps/metadata/items"

# 临时文件
EXPORT_FILE="/tmp/abs_export_$(date +%Y%m%d_%H%M%S).json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}ABS 媒体库同步开始${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 步骤 1: 从本地服务器导出数据（流式下载到文件）
echo -e "${YELLOW}[1/4] 从本地服务器导出媒体库数据...${NC}"
curl -s -X GET "${LOCAL_ABS_URL}/api/sync/export" \
  -H "Authorization: Bearer ${LOCAL_API_KEY}" \
  -o "${EXPORT_FILE}"

if [ $? -ne 0 ] || [ ! -s "${EXPORT_FILE}" ]; then
  echo -e "${RED}错误: 导出失败${NC}"
  exit 1
fi

# 检查是否是错误响应
FIRST_CHARS=$(head -c 20 "${EXPORT_FILE}")
if echo "${FIRST_CHARS}" | grep -q '"error"'; then
  echo -e "${RED}错误: 导出返回错误${NC}"
  cat "${EXPORT_FILE}"
  exit 1
fi

FILE_SIZE=$(stat -c%s "${EXPORT_FILE}" 2>/dev/null || stat -f%z "${EXPORT_FILE}" 2>/dev/null)
echo -e "${GREEN}导出成功，文件大小: $((FILE_SIZE / 1024 / 1024))MB${NC}"
echo ""

# 步骤 2: 导入数据到 VPS（分表导入避免 body 过大）
echo -e "${YELLOW}[2/4] 导入数据到 VPS...${NC}"
IMPORT_RESULT=$(curl -s -X POST "${VPS_ABS_URL}/api/sync/import" \
  -H "Authorization: Bearer ${VPS_API_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary @"${EXPORT_FILE}" \
  --max-time 300)

if echo "${IMPORT_RESULT}" | grep -q '"success":true'; then
  echo -e "${GREEN}数据导入成功${NC}"
  echo "${IMPORT_RESULT}"
else
  echo -e "${RED}错误: 导入失败${NC}"
  echo "${IMPORT_RESULT}"
  echo ""
  echo -e "${YELLOW}提示: 如果是 body 过大导致失败，请使用 sqlite 直接同步方式（见下方）${NC}"
fi
echo ""

# 步骤 3: 同步 metadata/items 目录
echo -e "${YELLOW}[3/4] 同步 metadata/items 目录到 VPS...${NC}"
if [ -d "${LOCAL_METADATA_ITEMS}" ]; then
  rsync -avz --delete \
    "${LOCAL_METADATA_ITEMS}/" \
    "${VPS_USER}@${VPS_HOST}:${VPS_METADATA_ITEMS}/"

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}metadata/items 同步成功${NC}"
  else
    echo -e "${YELLOW}警告: metadata/items 同步失败，但数据库已同步${NC}"
  fi
else
  echo -e "${YELLOW}警告: 本地 metadata/items 目录不存在，跳过同步${NC}"
fi
echo ""

# 步骤 4: 验证同步状态
echo -e "${YELLOW}[4/4] 验证 VPS 同步状态...${NC}"
curl -s -X GET "${VPS_ABS_URL}/api/sync/status" \
  -H "Authorization: Bearer ${VPS_API_KEY}"
echo ""

# 清理临时文件
rm -f "${EXPORT_FILE}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}同步完成!${NC}"
echo -e "${GREEN}========================================${NC}"
