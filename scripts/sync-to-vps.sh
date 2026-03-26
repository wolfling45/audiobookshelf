#!/bin/bash
# ============================================================
# ABS 媒体库同步脚本（SQLite 直接同步方案）
# 本地扫描服务器 → VPS 播放服务器
#
# 同步内容：数据库（保留VPS用户数据）+ metadata目录
# ============================================================

# ===== 配置 =====
VPS_USER="root"
VPS_HOST="xxxxxx"
VPS_PORT="xxxx"                                                   # SSH 端口
VPS_KEY="/xxxxxx/key"                               # SSH 私钥路径
VPS_COMPOSE_DIR="/home/audiobookshelf"                          # docker-compose.yml 所在目录
VPS_SERVICE="audiobookshelf"                                      # docker compose 服务名
VPS_DB_PATH="/home/audiobookshelf/config/absdatabase.sqlite"    # VPS 宿主机数据库路径
LOCAL_DB_PATH="/mnt/user/appdata/audiobookshelf/config/absdatabase.sqlite"          # 本地宿主机数据库路径
LOCAL_METADATA="/xxxxxx/metadata"                          # 本地 metadata 目录
VPS_METADATA="/xxxxxx/metadata"                    # VPS metadata 目录

# 需要从本地同步到 VPS 的媒体库表（不包含用户数据）
SYNC_TABLES="libraries libraryFolders libraryItems books podcasts podcastEpisodes authors series bookAuthors bookSeries settings"

# SSH/rsync 通用参数
SSH_OPTS="-i ${VPS_KEY} -p ${VPS_PORT} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
SSH="ssh ${SSH_OPTS} ${VPS_USER}@${VPS_HOST}"
RSYNC_SSH="ssh -i ${VPS_KEY} -p ${VPS_PORT} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

# ===== 颜色 =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}ABS 媒体库同步开始（SQLite方案）${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# ===== 步骤 1: 停止 VPS 容器 =====
echo -e "${YELLOW}[1/6] 停止 VPS 容器...${NC}"
${SSH} "cd ${VPS_COMPOSE_DIR} && docker compose stop ${VPS_SERVICE}"
if [ $? -ne 0 ]; then
  echo -e "${RED}错误: 无法停止 VPS 容器${NC}"
  exit 1
fi
echo -e "${GREEN}VPS 容器已停止${NC}"
echo ""

# ===== 步骤 2: 从本地数据库导出媒体库表 =====
echo -e "${YELLOW}[2/5] 从本地数据库导出媒体库数据...${NC}"
EXPORT_SQL="/tmp/abs_media_export.sql"

# 构建 sqlite3 导出命令
DUMP_CMD=""
for TABLE in ${SYNC_TABLES}; do
  DUMP_CMD="${DUMP_CMD}.dump ${TABLE}\n"
done

echo -e "${DUMP_CMD}" | sqlite3 "${LOCAL_DB_PATH}" > "${EXPORT_SQL}" 2>/dev/null
if [ ! -s "${EXPORT_SQL}" ]; then
  echo -e "${RED}错误: 导出失败或数据为空${NC}"
  ${SSH} "cd ${VPS_COMPOSE_DIR} && docker compose start ${VPS_SERVICE}"
  exit 1
fi
EXPORT_SIZE=$(stat -c%s "${EXPORT_SQL}" 2>/dev/null || stat -f%z "${EXPORT_SQL}" 2>/dev/null)
echo -e "${GREEN}导出完成，大小: $((EXPORT_SIZE / 1024 / 1024))MB${NC}"
echo ""

# ===== 步骤 3: 传输并导入到 VPS =====
echo -e "${YELLOW}[3/5] 传输并导入媒体库数据到 VPS...${NC}"

# 传输导出文件到 VPS
REMOTE_SQL="/tmp/abs_media_import.sql"
rsync -avz -e "${RSYNC_SSH}" "${EXPORT_SQL}" "${VPS_USER}@${VPS_HOST}:${REMOTE_SQL}"

# 在 VPS 上：先清空媒体库表，再导入
DELETE_CMD=""
for TABLE in ${SYNC_TABLES}; do
  DELETE_CMD="${DELETE_CMD}DELETE FROM ${TABLE};\n"
done

${SSH} "echo -e '${DELETE_CMD}' | sqlite3 '${VPS_DB_PATH}'"
${SSH} "grep '^INSERT' '${REMOTE_SQL}' | sed 's/^INSERT/INSERT OR REPLACE/' | sqlite3 '${VPS_DB_PATH}'"

if [ $? -ne 0 ]; then
  echo -e "${YELLOW}警告: 媒体库数据导入可能部分失败，请检查${NC}"
else
  echo -e "${GREEN}媒体库数据导入完成${NC}"
fi
echo ""

# ===== 步骤 4: 同步 metadata 目录 =====
echo -e "${YELLOW}[4/5] 同步 metadata 目录...${NC}"
rsync -avz --delete --exclude='backups/' \
  -e "${RSYNC_SSH}" \
  "${LOCAL_METADATA}/" "${VPS_USER}@${VPS_HOST}:${VPS_METADATA}/"
if [ $? -eq 0 ]; then
  echo -e "${GREEN}metadata 同步完成${NC}"
else
  echo -e "${YELLOW}警告: metadata 同步可能部分失败${NC}"
fi
echo ""

# ===== 步骤 5: 启动 VPS 容器 =====
echo -e "${YELLOW}[5/5] 启动 VPS 容器...${NC}"
${SSH} "cd ${VPS_COMPOSE_DIR} && docker compose start ${VPS_SERVICE}"
if [ $? -ne 0 ]; then
  echo -e "${RED}错误: 无法启动 VPS 容器${NC}"
  exit 1
fi
echo -e "${GREEN}VPS 容器已启动${NC}"
echo ""

# ===== 清理 =====
${SSH} "rm -f '${REMOTE_SQL}'"
rm -f "${EXPORT_SQL}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}同步完成!${NC}"
echo -e "${GREEN}========================================${NC}"
