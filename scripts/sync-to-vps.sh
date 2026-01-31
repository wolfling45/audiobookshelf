#!/bin/bash
# ============================================================
# ABS 媒体库同步脚本
# 用于将本地服务器的媒体库数据同步到 VPS
# ============================================================

# 配置变量 - 请根据实际情况修改
LOCAL_ABS_URL="http://localhost:13378"      # 本地 ABS 服务器地址
VPS_ABS_URL="http://your-vps-ip:13378"      # VPS ABS 服务器地址
LOCAL_API_KEY="your-local-api-key"          # 本地服务器 API Key
VPS_API_KEY="your-vps-api-key"              # VPS 服务器 API Key

# 本地 metadata/items 目录路径
LOCAL_METADATA_ITEMS="/path/to/local/metadata/items"
# VPS metadata/items 目录路径 (通过 SSH)
VPS_USER="root"
VPS_HOST="your-vps-ip"
VPS_METADATA_ITEMS="/path/to/vps/metadata/items"

# 临时文件
EXPORT_FILE="/tmp/abs_export_$(date +%Y%m%d_%H%M%S).json"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}ABS 媒体库同步开始${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 步骤 1: 从本地服务器导出数据
echo -e "${YELLOW}[1/4] 从本地服务器导出媒体库数据...${NC}"
curl -s -X GET "${LOCAL_ABS_URL}/api/sync/export" \
  -H "Authorization: Bearer ${LOCAL_API_KEY}" \
  -H "Content-Type: application/json" \
  -o "${EXPORT_FILE}"

if [ $? -ne 0 ] || [ ! -s "${EXPORT_FILE}" ]; then
  echo -e "${RED}错误: 导出失败${NC}"
  exit 1
fi

# 检查导出是否成功
if grep -q '"error"' "${EXPORT_FILE}"; then
  echo -e "${RED}错误: 导出返回错误${NC}"
  cat "${EXPORT_FILE}"
  exit 1
fi

echo -e "${GREEN}导出成功，文件: ${EXPORT_FILE}${NC}"
echo "导出数据统计:"
cat "${EXPORT_FILE}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"  - 媒体库: {d['counts']['libraries']}\"); print(f\"  - 媒体项目: {d['counts']['libraryItems']}\"); print(f\"  - 书籍: {d['counts']['books']}\"); print(f\"  - 作者: {d['counts']['authors']}\"); print(f\"  - 系列: {d['counts']['series']}\")" 2>/dev/null || echo "  (无法解析统计信息)"
echo ""

# 步骤 2: 导入数据到 VPS
echo -e "${YELLOW}[2/4] 导入数据到 VPS...${NC}"
IMPORT_RESULT=$(curl -s -X POST "${VPS_ABS_URL}/api/sync/import" \
  -H "Authorization: Bearer ${VPS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @"${EXPORT_FILE}")

if echo "${IMPORT_RESULT}" | grep -q '"success":true'; then
  echo -e "${GREEN}数据导入成功${NC}"
  echo "${IMPORT_RESULT}" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d['results']; print(f\"  - 媒体库: 新增 {r['libraries']['inserted']}, 更新 {r['libraries']['updated']}\"); print(f\"  - 媒体项目: 新增 {r['libraryItems']['inserted']}, 更新 {r['libraryItems']['updated']}\"); print(f\"  - 书籍: 新增 {r['books']['inserted']}, 更新 {r['books']['updated']}\")" 2>/dev/null || echo "  (无法解析结果)"
else
  echo -e "${RED}错误: 导入失败${NC}"
  echo "${IMPORT_RESULT}"
  exit 1
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
VPS_STATUS=$(curl -s -X GET "${VPS_ABS_URL}/api/sync/status" \
  -H "Authorization: Bearer ${VPS_API_KEY}")

echo "VPS 当前状态:"
echo "${VPS_STATUS}" | python3 -c "import sys,json; d=json.load(sys.stdin); c=d['counts']; print(f\"  - 媒体库: {c['libraries']}\"); print(f\"  - 媒体项目: {c['libraryItems']}\"); print(f\"  - 书籍: {c['books']}\"); print(f\"  - 用户: {c['users']}\"); print(f\"  - 播放进度: {c['mediaProgresses']}\")" 2>/dev/null || echo "${VPS_STATUS}"
echo ""

# 清理临时文件
rm -f "${EXPORT_FILE}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}同步完成!${NC}"
echo -e "${GREEN}========================================${NC}"
